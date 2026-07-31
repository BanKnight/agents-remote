import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startMcpHubServer, type McpHubServer } from "./mcp-hub-server";
import { ProjectWikiService } from "./project-wiki";

const MCP_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
};

const initBody = (id: number) =>
  JSON.stringify({
    jsonrpc: "2.0",
    id,
    method: "initialize",
    params: {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "test", version: "0" },
    },
  });

const listToolsBody = (id: number) =>
  JSON.stringify({ jsonrpc: "2.0", id, method: "tools/list", params: {} });

const callToolBody = (id: number, name: string, args: Record<string, unknown>) =>
  JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } });

// MCP 响应是 SSE(event: message\ndata: <json>),created 等值被嵌套在 content[].text 的
// JSON 字符串里多层转义。解析首条 data 取 JSON-RPC result,断言语义而非文本匹配。
type McpSseResult = {
  result?: { content?: { text?: string }[]; isError?: boolean };
};
const parseSseResult = async (res: Response): Promise<McpSseResult> => {
  const text = await res.text();
  const dataLine = text.split("\n").find((line) => line.startsWith("data: "));
  if (!dataLine) throw new Error(`SSE response has no data line: ${text}`);
  return JSON.parse(dataLine.slice("data: ".length)) as McpSseResult;
};

describe("MCP hub server (stateless, loopback)", () => {
  let projectsRoot: string;
  let hub: McpHubServer;
  let baseUrl: string;

  beforeEach(async () => {
    projectsRoot = await mkdtemp(join(tmpdir(), "ar-mcp-"));
    await mkdir(join(projectsRoot, "test"), { recursive: true });
    // port 0:OS 分配空闲端口,避免与 dev 服务撞端口。
    hub = startMcpHubServer({
      port: 0,
      projectsRoot,
      wikiService: new ProjectWikiService(projectsRoot),
    });
    baseUrl = `http://127.0.0.1:${hub.port}`;
  });

  afterEach(async () => {
    hub.stop();
    await rm(projectsRoot, { recursive: true, force: true });
  });

  it("initialize returns 200 and no Mcp-Session-Id (stateless)", async () => {
    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: initBody(1),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("mcp-session-id")).toBeNull();
    const text = await res.text();
    expect(text).toContain("protocolVersion");
    expect(text).toContain('"id":1');
  });

  it("tools/list returns a response (empty shell: no tools capability)", async () => {
    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: listToolsBody(2),
    });
    expect(res.status).toBe(200);
    // 空壳 McpServer 未声明 tools capability → SDK 返回 method not found(-32601)。
    // 这是基座空壳的预期行为;wiki 阶段注册工具后变为 {tools: [...]}。
    const text = await res.text();
    expect(text).toContain('"id":2');
  });

  it("rejects non-existent project with 404", async () => {
    const res = await fetch(`${baseUrl}/mcp/nonexistent`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: initBody(3),
    });
    expect(res.status).toBe(404);
  });

  it("rejects path traversal in project segment with 404", async () => {
    const res = await fetch(`${baseUrl}/mcp/..%2F..%2Fetc`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: initBody(4),
    });
    expect(res.status).toBe(404);
  });

  it("rejects non-loopback Host header with 403", async () => {
    // Host header 改成非 127.0.0.1/localhost → 模拟 DNS rebinding / tunnel 暴露。
    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: { ...MCP_HEADERS, Host: "evil.example.com" },
      body: initBody(5),
    });
    expect(res.status).toBe(403);
  });

  it("returns 404 for non-mcp paths", async () => {
    const res = await fetch(`${baseUrl}/something`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: initBody(6),
    });
    expect(res.status).toBe(404);
  });

  // ── wiki 能力域开关(按 per-project mcp.json capabilities 注册工具)──────────

  const writeMcpConfig = async (project: string, capabilities: Record<string, boolean>) => {
    await mkdir(join(projectsRoot, project, ".agents-remote"), { recursive: true });
    await writeFile(
      join(projectsRoot, project, ".agents-remote", "mcp.json"),
      JSON.stringify({ capabilities }),
    );
  };

  it("exposes wiki tools when capabilities.wiki=true", async () => {
    await writeMcpConfig("test", { wiki: true });
    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: listToolsBody(10),
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("wiki_list_pages");
    expect(text).toContain("wiki_read_page");
    expect(text).toContain("wiki_write_page");
  });

  it("hides wiki tools when no mcp.json (capabilities default off)", async () => {
    // 无 .agents-remote/mcp.json → readProjectMcpConfig 返回 null → wiki 全关(空壳)。
    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: listToolsBody(11),
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain("wiki_");
  });

  it("hides wiki tools when capabilities.wiki=false", async () => {
    await writeMcpConfig("test", { wiki: false });
    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: listToolsBody(12),
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain("wiki_");
  });

  it("wiki_write_page then wiki_read_page round-trips and lands on disk", async () => {
    await writeMcpConfig("test", { wiki: true });

    const writeRes = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: callToolBody(20, "wiki_write_page", {
        slug: "round-trip",
        title: "Round Trip",
        content: "hello wiki",
        tags: ["t"],
      }),
    });
    expect(writeRes.status).toBe(200);
    const writeTool = JSON.parse(
      (await parseSseResult(writeRes)).result?.content?.[0]?.text ?? "{}",
    );
    expect(writeTool.created).toBe(true);

    const readRes = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: callToolBody(21, "wiki_read_page", { slug: "round-trip" }),
    });
    expect(readRes.status).toBe(200);
    const readPage = JSON.parse((await parseSseResult(readRes)).result?.content?.[0]?.text ?? "{}");
    expect(readPage.frontmatter.title).toBe("Round Trip");
    expect(readPage.body).toContain("hello wiki");

    // 落盘验证:frontmatter 注入正确(由 wikiService.writePage 序列化)。
    const raw = await readFile(join(projectsRoot, "test", "wiki", "round-trip.md"), "utf8");
    expect(raw).toContain("title: Round Trip");
    expect(raw).toContain("hello wiki");
  });

  it("wiki_read_page on missing page returns isError (MCP tool error, not HTTP 500)", async () => {
    await writeMcpConfig("test", { wiki: true });
    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: callToolBody(30, "wiki_read_page", { slug: "no-such-page" }),
    });
    expect(res.status).toBe(200); // MCP 工具错误是正常 200 返回,isError=true + message
    const text = await res.text();
    expect(text).toContain('"isError":true');
    expect(text).toContain("not found");
  });
});
