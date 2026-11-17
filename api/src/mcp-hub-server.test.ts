import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { McpCapability } from "@agents-remote/shared";
import { startMcpHubServer, type McpHubServer } from "./mcp-hub-server";
import { McpCapabilitiesStore } from "./mcp-capabilities-store";
import { ProjectCanvasService } from "./project-canvas";
import { ProjectFilesService } from "./project-files";
import { ProjectGitDiffService } from "./project-git-diff";
import { ProjectPagesService } from "./project-pages";
import { ProjectWikiService } from "./project-wiki";
import { SessionRegistry } from "./session-registry";

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
  result?: {
    content?: { text?: string }[];
    isError?: boolean;
    structuredContent?: Record<string, unknown>;
    capabilities?: {
      extensions?: Record<string, unknown>;
      tools?: unknown;
      resources?: unknown;
    };
  };
};
const parseSseResult = async (res: Response): Promise<McpSseResult> => {
  const text = await res.text();
  const dataLine = text.split("\n").find((line) => line.startsWith("data: "));
  if (!dataLine) throw new Error(`SSE response has no data line: ${text}`);
  return JSON.parse(dataLine.slice("data: ".length)) as McpSseResult;
};

describe("MCP hub server (stateless, loopback)", () => {
  let projectsRoot: string;
  let home: string;
  let hub: McpHubServer;
  let baseUrl: string;
  let capabilitiesStore: McpCapabilitiesStore;

  beforeEach(async () => {
    projectsRoot = await mkdtemp(join(tmpdir(), "ar-mcp-"));
    await mkdir(join(projectsRoot, "test"), { recursive: true });
    // skills 全局 scope 的假 home(测试注入,不碰真实 ~/.claude/skills)。
    home = await mkdtemp(join(tmpdir(), "ar-mcp-home-"));
    // 能力开关内部状态落 tmp（不碰真实 ~/.agents-remote/mcp-capabilities.json）。
    capabilitiesStore = new McpCapabilitiesStore({
      path: join(projectsRoot, ".capabilities.json"),
      projectsRoot,
    });
    // port 0:OS 分配空闲端口,避免与 dev 服务撞端口。
    hub = startMcpHubServer({
      port: 0,
      projectsRoot,
      wikiService: new ProjectWikiService(projectsRoot),
      gitDiffService: new ProjectGitDiffService(projectsRoot),
      sessionRegistry: new SessionRegistry({ runDir: join(projectsRoot, ".runtime") }),
      filesService: new ProjectFilesService(projectsRoot),
      home,
      capabilitiesStore,
    });
    baseUrl = `http://127.0.0.1:${hub.port}`;
  });

  afterEach(async () => {
    hub.stop();
    await rm(projectsRoot, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
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

  // ── 能力域开关(ar-hub 内部状态;渐进式披露批后不再读项目 mcp.json)──────────

  /** 逐域写入内部状态。空对象 = 该项目无记录 → 惰性导入(无 mcp.json → 全关)。 */
  const writeMcpConfig = async (project: string, capabilities: Record<string, boolean>) => {
    for (const [capability, enabled] of Object.entries(capabilities)) {
      await capabilitiesStore.set(project, capability as McpCapability, enabled);
    }
  };

  const WIKI_TOOLS = ["wiki_list", "wiki_search", "wiki_write", "wiki_read"];

  it("exposes the four wiki tools when capabilities.wiki=true", async () => {
    await writeMcpConfig("test", { wiki: true });
    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: listToolsBody(10),
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    for (const name of WIKI_TOOLS) expect(text).toContain(`"${name}"`);
  });

  it("keeps wiki tools listed when the domain is disabled (runtime gating, not registration)", async () => {
    // 渐进式披露：无记录(惰性导入 → 全关)时四工具仍在 tools/list——agent 才能
    // 发现功能并引导开启；调用时由 handler 返回引导错误。
    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: listToolsBody(11),
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    for (const name of WIKI_TOOLS) expect(text).toContain(`"${name}"`);
  });

  it("wiki disabled (explicit false) → calls return the guidance error", async () => {
    await writeMcpConfig("test", { wiki: false });
    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: callToolBody(12, "wiki_list", {}),
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('"isError":true');
    expect(text).toContain("capability_set");
  });

  it("wiki_write then wiki_read round-trips and lands on disk", async () => {
    await writeMcpConfig("test", { wiki: true });

    const writeRes = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: callToolBody(20, "wiki_write", {
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
      body: callToolBody(21, "wiki_read", { slug: "round-trip" }),
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

  it("wiki_read on missing page returns isError (MCP tool error, not HTTP 500)", async () => {
    await writeMcpConfig("test", { wiki: true });
    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: callToolBody(30, "wiki_read", { slug: "no-such-page" }),
    });
    expect(res.status).toBe(200); // MCP 工具错误是正常 200 返回,isError=true + message
    const text = await res.text();
    expect(text).toContain('"isError":true');
    expect(text).toContain("not found");
  });

  // ── ui 能力域(SEP-1865 MCP Apps:扩展声明 + ui:// 资源 + wiki_read display tool)──

  const readResourceBody = (id: number, uri: string) =>
    JSON.stringify({ jsonrpc: "2.0", id, method: "resources/read", params: { uri } });

  const resourcesListBody = (id: number) =>
    JSON.stringify({ jsonrpc: "2.0", id, method: "resources/list", params: {} });

  // ── 渐进式披露四层(instructions 菜单 / guide:// 资源 / capability 工具)────────

  it("initialize returns the L0 capability menu with live statuses", async () => {
    await writeMcpConfig("test", { wiki: true });
    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: initBody(80),
    });
    const instructions =
      ((await parseSseResult(res)).result as unknown as { instructions?: string })?.instructions ??
      "";
    for (const domain of ["wiki", "ui", "skills", "gen-ui", "pages", "admin"]) {
      expect(instructions).toContain(domain);
    }
    expect(instructions).toContain("wiki (enabled)");
    expect(instructions).toContain("ui (disabled)");
    expect(instructions).toContain("capability_set");
    expect(instructions).toContain("guide://");
  });

  it("resources/list exposes the six guide:// domains even with everything disabled", async () => {
    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: resourcesListBody(81),
    });
    const { result } = await parseSseResult(res);
    const resources =
      (result as unknown as { resources?: { uri: string; mimeType?: string }[] }).resources ?? [];
    expect(resources.map((r) => r.uri).sort()).toEqual([
      "guide://admin",
      "guide://gen-ui",
      "guide://pages",
      "guide://skills",
      "guide://ui",
      "guide://wiki",
    ]);
    expect(resources.every((r) => r.mimeType === "text/markdown")).toBe(true);
  });

  it("resources/read guide://wiki serves the domain guide markdown", async () => {
    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: readResourceBody(82, "guide://wiki"),
    });
    const { result } = await parseSseResult(res);
    const contents = (result as unknown as { contents?: { mimeType: string; text: string }[] })
      .contents;
    expect(contents?.[0]?.mimeType).toBe("text/markdown");
    expect(contents?.[0]?.text).toContain("# wiki");
    expect(contents?.[0]?.text).toContain("wiki_search");
  });

  it("capability_list reports live status for all six domains", async () => {
    await writeMcpConfig("test", { wiki: true });
    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: callToolBody(83, "capability_list", {}),
    });
    const payload = JSON.parse((await parseSseResult(res)).result?.content?.[0]?.text ?? "{}") as {
      capabilities?: { capability: string; enabled: boolean }[];
    };
    const entries = payload.capabilities ?? [];
    expect(entries.map((e) => e.capability)).toEqual([
      "wiki",
      "ui",
      "skills",
      "gen-ui",
      "pages",
      "admin",
    ]);
    expect(entries.find((e) => e.capability === "wiki")?.enabled).toBe(true);
    expect(entries.find((e) => e.capability === "ui")?.enabled).toBe(false);
  });

  it("capability_set enables wiki and the next call works in the same session", async () => {
    // 关闭态：引导错误。
    const denied = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: callToolBody(84, "wiki_list", {}),
    });
    const deniedText = await denied.text();
    expect(deniedText).toContain('"isError":true');
    expect(deniedText).toContain("capability_set");

    // 设置后同一 project 的下一次请求立即生效（无状态 hub 每请求重读内部状态）。
    const setRes = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: callToolBody(85, "capability_set", { capability: "wiki", enabled: true }),
    });
    const setPayload = JSON.parse(
      (await parseSseResult(setRes)).result?.content?.[0]?.text ?? "{}",
    ) as { capabilities?: { capability: string; enabled: boolean }[] };
    expect(setPayload.capabilities?.find((e) => e.capability === "wiki")?.enabled).toBe(true);

    const write = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: callToolBody(86, "wiki_write", {
        slug: "after-enable",
        title: "After Enable",
        content: "created post-enable",
      }),
    });
    const written = JSON.parse((await parseSseResult(write)).result?.content?.[0]?.text ?? "{}");
    expect(written.created).toBe(true);
  });

  it("wiki_search returns up to three matching lines per entry", async () => {
    await writeMcpConfig("test", { wiki: true });
    await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: callToolBody(87, "wiki_write", {
        slug: "search-a",
        title: "Search A",
        content: "alpha one\nbeta\nalpha two\ngamma\nalpha three\nalpha four",
      }),
    });
    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: callToolBody(88, "wiki_search", { query: "alpha" }),
    });
    const payload = JSON.parse((await parseSseResult(res)).result?.content?.[0]?.text ?? "{}") as {
      query?: string;
      matches?: { slug: string; lines: unknown[] }[];
    };
    expect(payload.query).toBe("alpha");
    expect(payload.matches?.[0]?.slug).toBe("search-a");
    expect(payload.matches?.[0]?.lines.length).toBeLessThanOrEqual(3);
  });

  it("capability_set admin without approval wiring returns a guidance error", async () => {
    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: callToolBody(89, "capability_set", { capability: "admin", enabled: true }),
    });
    const text = await res.text();
    expect(text).toContain("ADMIN_APPROVAL_UNAVAILABLE");
    expect((await capabilitiesStore.get("test")).admin).toBeUndefined();
  });

  it("ui=true declares MCP Apps extension + resources capability in initialize result", async () => {
    await writeMcpConfig("test", { ui: true });
    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: initBody(40),
    });
    const capabilities = (await parseSseResult(res)).result?.capabilities;
    expect(capabilities?.extensions?.["io.modelcontextprotocol/ui"]).toEqual({
      mimeTypes: ["text/html;profile=mcp-app"],
    });
    expect(capabilities?.resources).toBeDefined();
  });

  it("ui=false (wiki only) declares no extensions and read tool has no _meta (regression)", async () => {
    await writeMcpConfig("test", { wiki: true });
    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: initBody(41),
    });
    const capabilities = (await parseSseResult(res)).result?.capabilities;
    expect(capabilities?.extensions).toBeUndefined();

    const toolsRes = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: listToolsBody(42),
    });
    const text = await toolsRes.text();
    expect(text).toContain("wiki_read");
    expect(text).not.toContain('"_meta"');
  });

  it("ui=true attaches _meta.ui.resourceUri on wiki_read tool definition", async () => {
    await writeMcpConfig("test", { ui: true });
    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: listToolsBody(43),
    });
    const { result } = await parseSseResult(res);
    const tools = (result as unknown as { tools?: { name: string; _meta?: unknown }[] }).tools;
    const read = tools?.find((t) => t.name === "wiki_read");
    expect(read?._meta).toEqual({
      ui: { resourceUri: "ui://ar-hub/wiki-page", visibility: ["model", "app"] },
    });
  });

  it("ui=true wiki_read returns structuredContent for the web host", async () => {
    // 双开:ui 单开时 wiki_write 不注册(见上用例),准备数据用 write 需 wiki 同开。
    await writeMcpConfig("test", { wiki: true, ui: true });
    // 准备一页 wiki。
    await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: callToolBody(44, "wiki_write", {
        slug: "ui-card",
        title: "UI Card",
        content: "# Head\n\n- item1\n- item2",
        tags: ["demo"],
      }),
    });
    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: callToolBody(45, "wiki_read", { slug: "ui-card" }),
    });
    const sc = (await parseSseResult(res)).result?.structuredContent as Record<string, unknown>;
    expect(sc.kind).toBe("wiki-page");
    expect(sc.slug).toBe("ui-card");
    expect(sc.title).toBe("UI Card");
    expect(sc.tags).toEqual(["demo"]);
    expect(sc.markdown).toContain("item1");
  });

  it("ui=true serves ui://ar-hub/wiki-page HTML via resources/read", async () => {
    await writeMcpConfig("test", { ui: true });
    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: readResourceBody(46, "ui://ar-hub/wiki-page"),
    });
    const { result } = await parseSseResult(res);
    const contents = (
      result as unknown as {
        contents?: { uri: string; mimeType: string; text: string }[];
      }
    ).contents;
    expect(contents?.[0]?.uri).toBe("ui://ar-hub/wiki-page");
    expect(contents?.[0]?.mimeType).toBe("text/html;profile=mcp-app");
    expect(contents?.[0]?.text).toContain("<!doctype html>");
    expect(contents?.[0]?.text).toContain("ui/notifications/tool-result");
  });

  it("ui=true serves ui://ar-hub/markdown-lite via resources/read", async () => {
    // 轻/重模板分流:宿主按内容选变体,资源供给面必须能读出 lite 模板
    // （markdown 管线在、mermaid 库不在——供给断言见 mcp-app-templates.test.ts）。
    await writeMcpConfig("test", { ui: true });
    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: readResourceBody(71, "ui://ar-hub/markdown-lite"),
    });
    const { result } = await parseSseResult(res);
    const contents = (
      result as unknown as {
        contents?: { uri: string; mimeType: string; text: string }[];
      }
    ).contents;
    expect(contents?.[0]?.uri).toBe("ui://ar-hub/markdown-lite");
    expect(contents?.[0]?.mimeType).toBe("text/html;profile=mcp-app");
    expect(contents?.[0]?.text).toContain("<!doctype html>");
  });

  it("ui 单开(wiki 关)：ui 工具注册，wiki 四工具列出但运行时拒绝", async () => {
    await writeMcpConfig("test", { ui: true });
    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: listToolsBody(47),
    });
    const text = await res.text();
    // 注册面门控（ui 域）：ui 工具在场。
    expect(text).toContain('"git_status"');
    // 运行时门控（wiki 域）：工具仍列出，调用返回引导错误。
    for (const name of ["wiki_list", "wiki_search", "wiki_write", "wiki_read"]) {
      expect(text).toContain(`"${name}"`);
    }
    const denied = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: callToolBody(470, "wiki_list", {}),
    });
    const deniedText = await denied.text();
    expect(deniedText).toContain('"isError":true');
    expect(deniedText).toContain("capability_set");
  });

  it("resources/read on unknown ui:// uri returns protocol error", async () => {
    await writeMcpConfig("test", { ui: true });
    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: readResourceBody(48, "ui://ar-hub/no-such"),
    });
    const text = await res.text();
    expect(text).toContain('"code":-32602'); // invalid params:resource not found
  });

  // ── git 能力域(display tool git_status/git_log,注册条件 = uiEnabled && gitDiffService 注入)──

  const git = async (projectPath: string, args: string[]) => {
    const process = Bun.spawn({
      cmd: ["git", "-C", projectPath, ...args],
      stderr: "pipe",
      stdout: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(process.stdout).text(),
      new Response(process.stderr).text(),
      process.exited,
    ]);
    if (exitCode !== 0) {
      throw new Error(`git ${args.join(" ")} failed: ${stderr || stdout}`);
    }
    return stdout;
  };

  const initRepository = async (projectPath: string) => {
    await git(projectPath, ["init"]);
    await git(projectPath, ["config", "user.email", "test@example.com"]);
    await git(projectPath, ["config", "user.name", "Test User"]);
  };

  it("ui=true registers git display tools with _meta.ui.resourceUri", async () => {
    await writeMcpConfig("test", { ui: true });
    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: listToolsBody(60),
    });
    const { result } = await parseSseResult(res);
    const tools = (result as unknown as { tools?: { name: string; _meta?: unknown }[] }).tools;
    const status = tools?.find((t) => t.name === "git_status");
    const log = tools?.find((t) => t.name === "git_log");
    expect(status?._meta).toEqual({
      ui: { resourceUri: "ui://ar-hub/git-status", visibility: ["model", "app"] },
    });
    expect(log?._meta).toEqual({
      ui: { resourceUri: "ui://ar-hub/git-log", visibility: ["model", "app"] },
    });
  });

  it("git_status returns structuredContent for a dirty git project", async () => {
    await writeMcpConfig("test", { ui: true });
    const projectPath = join(projectsRoot, "test");
    await initRepository(projectPath);
    await writeFile(join(projectPath, "a.txt"), "one\n");
    await git(projectPath, ["add", "."]);
    await git(projectPath, ["commit", "-m", "initial"]);
    await writeFile(join(projectPath, "a.txt"), "one changed\n");
    await writeFile(join(projectPath, "new.txt"), "brand new\n");

    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: callToolBody(61, "git_status", {}),
    });
    const { result } = await parseSseResult(res);
    expect(result?.isError).toBeUndefined();
    const sc = result?.structuredContent as Record<string, unknown>;
    expect(sc.kind).toBe("git-status");
    expect(sc.clean).toBe(false);
    expect(typeof sc.branch).toBe("string");
    const files = sc.files as {
      path: string;
      status: string;
      scope: string;
      addedLines: number | null;
      removedLines: number | null;
    }[];
    // worktree 修改项带 numstat 行数;untracked 项在列(行数为 null,不绑枚举)。
    const modified = files.find((f) => f.path === "a.txt");
    expect(modified).toMatchObject({ status: "modified", addedLines: 1, removedLines: 1 });
    expect(files.some((f) => f.path === "new.txt")).toBe(true);
  });

  it("git_status on non-git project degrades to text-only (no structuredContent)", async () => {
    await writeMcpConfig("test", { ui: true });
    // beforeEach 建的 test 目录未 git init → listDiff 走 union 分支(repository:false)。
    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: callToolBody(62, "git_status", {}),
    });
    const { result } = await parseSseResult(res);
    expect(result?.isError).toBeUndefined();
    expect(result?.content?.[0]?.text).toBe("Project is not a Git repository");
    expect(result?.structuredContent).toBeUndefined();
  });

  it("git_log returns commit history structuredContent", async () => {
    await writeMcpConfig("test", { ui: true });
    const projectPath = join(projectsRoot, "test");
    await initRepository(projectPath);
    await writeFile(join(projectPath, "a.txt"), "one\n");
    await git(projectPath, ["add", "."]);
    await git(projectPath, ["commit", "-m", "initial"]);
    await writeFile(join(projectPath, "a.txt"), "one changed\n");
    await git(projectPath, ["add", "."]);
    await git(projectPath, ["commit", "-m", "second"]);

    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: callToolBody(63, "git_log", {}),
    });
    const { result } = await parseSseResult(res);
    expect(result?.isError).toBeUndefined();
    const sc = result?.structuredContent as Record<string, unknown>;
    expect(sc.kind).toBe("git-log");
    expect(sc.total).toBe(2);
    const commits = sc.commits as {
      hash: string;
      message: string;
      author: string;
      relativeTime: string;
    }[];
    expect(commits[0].message).toBe("second");
    expect(commits[0].hash.length).toBeGreaterThan(0);
    expect(commits[0].author).toBe("Test User");
    expect(commits[0].relativeTime.length).toBeGreaterThan(0);
  });

  it("ui=false (wiki only) does not register git tools", async () => {
    await writeMcpConfig("test", { wiki: true });
    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: listToolsBody(64),
    });
    const text = await res.text();
    expect(text).toContain("wiki_list");
    expect(text).not.toContain("git_status");
  });

  it("git tools require gitDiffService injection (hub started without it)", async () => {
    // 主 hub 已带 gitDiffService → 换起一个不带的,验证注入缺席时 ui=true 也不注册 git 工具。
    hub.stop();
    hub = startMcpHubServer({
      port: 0,
      projectsRoot,
      wikiService: new ProjectWikiService(projectsRoot),
      home,
    });
    baseUrl = `http://127.0.0.1:${hub.port}`;
    await writeMcpConfig("test", { ui: true });
    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: listToolsBody(65),
    });
    const text = await res.text();
    expect(text).toContain("wiki_read");
    expect(text).not.toContain("git_status");
    expect(text).not.toContain("git_log");
  });

  // ── session/settings 能力域（铺卡批第二批;注册条件见各自 register 函数）──

  it("ui=true registers session_overview + project_settings with _meta", async () => {
    await writeMcpConfig("test", { ui: true });
    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: listToolsBody(66),
    });
    const { result } = await parseSseResult(res);
    const tools = (result as unknown as { tools?: { name: string; _meta?: unknown }[] }).tools;
    expect(tools?.find((t) => t.name === "session_overview")?._meta).toEqual({
      ui: { resourceUri: "ui://ar-hub/session-overview", visibility: ["model", "app"] },
    });
    expect(tools?.find((t) => t.name === "project_settings")?._meta).toEqual({
      ui: { resourceUri: "ui://ar-hub/settings-preview", visibility: ["model", "app"] },
    });
  });

  it("session_overview returns per-project scoped empty overview", async () => {
    await writeMcpConfig("test", { ui: true });
    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: callToolBody(67, "session_overview", {}),
    });
    const { result } = await parseSseResult(res);
    expect(result?.isError).toBeUndefined();
    const sc = result?.structuredContent as Record<string, unknown>;
    expect(sc.kind).toBe("session-overview");
    expect(sc.projectName).toBe("test");
    // 空索引 → counts/sessions 空面(造活会话需探活注入,链路面由 e2e/真机验)。
    expect(sc.counts).toEqual({});
    expect(sc.sessions).toEqual([]);
  });

  it("project_settings returns capabilities + mcpServers names/types only (no secrets)", async () => {
    await writeMcpConfig("test", { wiki: true, ui: true });
    // 项目根 .mcp.json 外部 server fixture:command/args/env 全带——塑形层必须剥净。
    await writeFile(
      join(projectsRoot, "test", ".mcp.json"),
      JSON.stringify({
        mcpServers: {
          demo: {
            command: "npx",
            args: ["-y", "some-server"],
            env: { API_TOKEN: "sk-secret-value" },
          },
        },
      }),
    );
    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: callToolBody(68, "project_settings", {}),
    });
    const { result } = await parseSseResult(res);
    expect(result?.isError).toBeUndefined();
    const sc = result?.structuredContent as Record<string, unknown>;
    expect(sc.kind).toBe("settings-preview");
    expect(sc.projectName).toBe("test");
    expect(sc.capabilities).toEqual({ wiki: true, ui: true });
    expect(sc.mcpServers).toEqual([{ name: "demo", type: "stdio" }]);
    // 安全红线:整个 structuredContent 不出现命令行/密钥面(键名与值双重断言)。
    const serialized = JSON.stringify(sc);
    expect(serialized).not.toContain("command");
    expect(serialized).not.toContain("args");
    expect(serialized).not.toContain("env");
    expect(serialized).not.toContain("API_TOKEN");
    expect(serialized).not.toContain("sk-secret-value");
  });

  // ── read_file 能力域（文件预览卡,富模板与 wiki-page 共用）──

  it("ui=true registers read_file with _meta; call returns file-preview structuredContent", async () => {
    await writeMcpConfig("test", { ui: true });
    await writeFile(join(projectsRoot, "test", "demo.md"), "# Title\n\nbody line\n");

    const listRes = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: listToolsBody(69),
    });
    const { result: listResult } = await parseSseResult(listRes);
    const tools = (listResult as unknown as { tools?: { name: string; _meta?: unknown }[] }).tools;
    expect(tools?.find((t) => t.name === "read_file")?._meta).toEqual({
      ui: { resourceUri: "ui://ar-hub/file-preview", visibility: ["model", "app"] },
    });

    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: callToolBody(70, "read_file", { path: "demo.md" }),
    });
    const { result } = await parseSseResult(res);
    expect(result?.isError).toBeUndefined();
    const sc = result?.structuredContent as Record<string, unknown>;
    expect(sc.kind).toBe("file-preview");
    expect(sc.path).toBe("demo.md");
    expect(sc.name).toBe("demo.md");
    expect(typeof sc.size).toBe("number");
    expect(sc.content).toContain("body line");
  });

  it("read_file on missing path returns isError (not a crash)", async () => {
    await writeMcpConfig("test", { ui: true });
    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: callToolBody(71, "read_file", { path: "no-such.md" }),
    });
    const { result } = await parseSseResult(res);
    expect(result?.isError).toBe(true);
    expect(result?.structuredContent).toBeUndefined();
  });

  // ── skills 能力域(SEP-2640:扩展声明 + skills/list-get + skill:// 资源读取)──

  const skillsListBody = (id: number, cursor?: string) =>
    JSON.stringify({
      jsonrpc: "2.0",
      id,
      method: "skills/list",
      params: cursor ? { cursor } : {},
    });

  const skillsGetBody = (id: number, uri: string) =>
    JSON.stringify({ jsonrpc: "2.0", id, method: "skills/get", params: { uri } });

  /** 在指定 scope 写一个 skill fixture(SKILL.md + 可选 supporting files)。 */
  const writeSkillFixture = async (
    scope: "project" | "global",
    dirName: string,
    frontmatter: string,
    extraFiles?: Record<string, string>,
  ) => {
    const dir =
      scope === "project"
        ? join(projectsRoot, "test", ".claude", "skills", dirName)
        : join(home, ".claude", "skills", dirName);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "SKILL.md"), `---\n${frontmatter}\n---\n\n# Body\n\nskill body ok\n`);
    for (const [rel, content] of Object.entries(extraFiles ?? {})) {
      const abs = join(dir, ...rel.split("/"));
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, content);
    }
  };

  it("skills=true declares SEP-2640 extension + resources capability", async () => {
    await writeMcpConfig("test", { skills: true });
    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: initBody(50),
    });
    const capabilities = (await parseSseResult(res)).result?.capabilities;
    expect(capabilities?.extensions?.["io.modelcontextprotocol/skills"]).toEqual({});
    expect(capabilities?.resources).toBeDefined();
  });

  it("skills/list returns full SEP entry (uri/frontmatter/resources with digest+size)", async () => {
    await writeMcpConfig("test", { skills: true });
    await writeSkillFixture(
      "project",
      "demo-skill",
      "name: demo-skill\ndescription: Demo skill for hub tests",
      { "scripts/helper.md": "helper content" },
    );
    // 无 frontmatter name → 目录名兜底(URI 末段=frontmatter.name 自洽)。
    await writeSkillFixture("project", "fallback-skill", "description: no name here");

    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: skillsListBody(51),
    });
    const { result } = await parseSseResult(res);
    const list = result as unknown as {
      resultType?: string;
      ttlMs?: number;
      cacheScope?: string;
      nextCursor?: string;
      skills?: {
        uri: string;
        frontmatter: Record<string, string>;
        resources: { uri: string; digest: string; size: number }[];
      }[];
    };
    expect(list.resultType).toBe("complete");
    expect(list.ttlMs).toBe(300_000);
    expect(list.cacheScope).toBe("private");
    expect(list.nextCursor).toBeUndefined(); // 单页全量(≤50 条)。

    const demo = list.skills?.find((s) => s.uri === "skill://demo-skill/SKILL.md");
    expect(demo?.frontmatter).toEqual({
      name: "demo-skill",
      description: "Demo skill for hub tests",
    });
    expect(demo?.resources).toHaveLength(2);
    const manifest = demo?.resources.find((r) => r.uri === "skill://demo-skill/SKILL.md");
    expect(manifest?.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(manifest?.size).toBeGreaterThan(0);
    const helper = demo?.resources.find((r) => r.uri === "skill://demo-skill/scripts/helper.md");
    expect(helper?.size).toBe("helper content".length);
    expect(helper?.digest).toMatch(/^sha256:[0-9a-f]{64}$/);

    // name 缺失 → 目录名兜底。
    const fallback = list.skills?.find((s) => s.uri === "skill://fallback-skill/SKILL.md");
    expect(fallback?.frontmatter.name).toBe("fallback-skill");
    expect(fallback?.frontmatter.description).toBe("no name here");
  });

  it("skills off → skills/list is method not found (-32601)", async () => {
    await writeMcpConfig("test", {});
    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: skillsListBody(52),
    });
    const text = await res.text();
    expect(text).toContain('"code":-32601');
  });

  it("skills/get returns the entry for a listed skill; unknown uri → -32602", async () => {
    await writeMcpConfig("test", { skills: true });
    await writeSkillFixture("project", "demo-skill", "name: demo-skill\ndescription: D");

    const ok = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: skillsGetBody(53, "skill://demo-skill/SKILL.md"),
    });
    const { result } = await parseSseResult(ok);
    const skill = (result as unknown as { skill?: { uri: string; resultType?: string } }).skill;
    expect(skill?.uri).toBe("skill://demo-skill/SKILL.md");
    expect((result as unknown as { resultType: string }).resultType).toBe("complete");
    expect((result as unknown as { cacheScope: string }).cacheScope).toBe("private");

    const missing = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: skillsGetBody(54, "skill://no-such/SKILL.md"),
    });
    expect(await missing.text()).toContain('"code":-32602');
  });

  it("resources/read serves SKILL.md and nested supporting file; manifest-外 → -32602", async () => {
    await writeMcpConfig("test", { skills: true });
    await writeSkillFixture("project", "demo-skill", "name: demo-skill\ndescription: D", {
      "scripts/helper.md": "helper content",
    });

    const manifest = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: readResourceBody(55, "skill://demo-skill/SKILL.md"),
    });
    const { result } = await parseSseResult(manifest);
    const contents = (
      result as unknown as { contents?: { uri: string; mimeType: string; text: string }[] }
    ).contents;
    expect(contents?.[0]?.uri).toBe("skill://demo-skill/SKILL.md");
    expect(contents?.[0]?.mimeType).toBe("text/markdown");
    expect(contents?.[0]?.text).toContain("skill body ok");

    const helper = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: readResourceBody(56, "skill://demo-skill/scripts/helper.md"),
    });
    const helperResult = await parseSseResult(helper);
    const helperText = (helperResult.result as unknown as { contents?: { text: string }[] })
      ?.contents?.[0]?.text;
    expect(helperText).toBe("helper content");

    // 清单外(遍历形状)→ -32602:只 serve 扫描时列出的文件。
    const traversal = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: readResourceBody(57, "skill://demo-skill/../../etc/passwd"),
    });
    expect(await traversal.text()).toContain('"code":-32602');
  });

  it("global scope merges; same-name skill: project scope wins", async () => {
    await writeMcpConfig("test", { skills: true });
    // 全局 only 的 skill。
    await writeSkillFixture("global", "global-only", "name: global-only\ndescription: from global");
    // 同名双 scope:项目版 description 不同 → 断言项目版胜出。
    await writeSkillFixture("project", "shared", "name: shared\ndescription: project version");
    await writeSkillFixture("global", "shared", "name: shared\ndescription: global version");

    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: skillsListBody(58),
    });
    const { result } = await parseSseResult(res);
    const skills = (
      result as unknown as { skills?: { uri: string; frontmatter: Record<string, string> }[] }
    ).skills;
    expect(skills?.map((s) => s.uri)).toContain("skill://global-only/SKILL.md");
    const shared = skills?.filter((s) => s.uri === "skill://shared/SKILL.md");
    expect(shared).toHaveLength(1);
    expect(shared?.[0]?.frontmatter.description).toBe("project version");
  });

  it("resources/read returns non-ASCII / space / dotdot-named listed files (uri→path map)", async () => {
    await writeMcpConfig("test", { skills: true });
    await writeSkillFixture("project", "demo-skill", "name: demo-skill\ndescription: D", {
      "中文笔记.md": "chinese content",
      "space name.md": "spaced content",
      "a..b.md": "dotdot content",
    });

    // 清单「列出即承诺」:三个文件 uri 都在 resources 里。
    const list = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: skillsListBody(59),
    });
    const { result } = await parseSseResult(list);
    const uris = (
      result as unknown as { skills?: { resources: { uri: string }[] }[] }
    ).skills?.flatMap((s) => s.resources.map((r) => r.uri));
    const cases: [string, string][] = [
      ["中文笔记.md", "chinese content"],
      ["space name.md", "spaced content"],
      ["a..b.md", "dotdot content"],
    ];
    for (const [rel, expected] of cases) {
      const uri = `skill://demo-skill/${encodeURIComponent(rel)}`;
      expect(uris).toContain(uri);
      const res = await fetch(`${baseUrl}/mcp/test`, {
        method: "POST",
        headers: MCP_HEADERS,
        body: readResourceBody(60 + cases.findIndex(([r]) => r === rel), uri),
      });
      const { result: readResult } = await parseSseResult(res);
      expect(
        (readResult as unknown as { contents?: { text: string }[] })?.contents?.[0]?.text,
      ).toBe(expected);
    }
  });

  it("skill exceeding SEP limits (512 files) is skipped entirely", async () => {
    await writeMcpConfig("test", { skills: true });
    const dir = join(projectsRoot, "test", ".claude", "skills", "oversized");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "SKILL.md"), "---\nname: oversized\n---\n\nbody\n");
    for (let i = 0; i < 513; i++) await writeFile(join(dir, `f${i}.txt`), "x");
    await writeSkillFixture("project", "demo-skill", "name: demo-skill\ndescription: D");

    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: skillsListBody(70),
    });
    const { result } = await parseSseResult(res);
    const uris = (result as unknown as { skills?: { uri: string }[] }).skills?.map((s) => s.uri);
    expect(uris).not.toContain("skill://oversized/SKILL.md"); // 超上限整体跳过,不出非法截断 entry。
    expect(uris).toContain("skill://demo-skill/SKILL.md"); // 正常 skill 不受影响。
  });

  it("skill dir symlink pointing outside the skills root is not served", async () => {
    await writeMcpConfig("test", { skills: true });
    // 外部目录(在 projectsRoot 下但不在任何 skills 根之下)。
    const outside = join(projectsRoot, "outside-skill-source");
    await mkdir(outside, { recursive: true });
    await writeFile(join(outside, "SKILL.md"), "---\nname: evil-skill\n---\n\noutside\n");
    const link = join(projectsRoot, "test", ".claude", "skills", "alias");
    await mkdir(dirname(link), { recursive: true });
    await symlink(outside, link);
    await writeSkillFixture("project", "demo-skill", "name: demo-skill\ndescription: D");

    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: skillsListBody(71),
    });
    const { result } = await parseSseResult(res);
    const uris = (result as unknown as { skills?: { uri: string }[] }).skills?.map((s) => s.uri);
    expect(uris).not.toContain("skill://evil-skill/SKILL.md"); // 根级 symlink → 外部,不分发。
    expect(uris).toContain("skill://demo-skill/SKILL.md"); // 正常 skill 不受影响。
  });
});

// ── 画布四工具(M2.1):ui 开 + canvasService 注入时注册,契约 §12.2 ────────

describe("MCP hub server (canvas tools)", () => {
  let projectsRoot: string;
  let home: string;
  let hub: McpHubServer;
  let baseUrl: string;

  beforeEach(async () => {
    projectsRoot = await mkdtemp(join(tmpdir(), "ar-mcp-canvas-"));
    home = await mkdtemp(join(tmpdir(), "ar-mcp-canvas-home-"));
    await mkdir(join(projectsRoot, "test"), { recursive: true });
    const capabilitiesStore = new McpCapabilitiesStore({
      path: join(projectsRoot, ".capabilities.json"),
      projectsRoot,
    });
    // 画布工具挂 ui 域（注册面门控）。
    await capabilitiesStore.set("test", "ui", true);
    hub = startMcpHubServer({
      port: 0,
      projectsRoot,
      wikiService: new ProjectWikiService(projectsRoot),
      canvasService: new ProjectCanvasService(projectsRoot),
      home,
      capabilitiesStore,
    });
    baseUrl = `http://127.0.0.1:${hub.port}`;
  });

  afterEach(async () => {
    hub.stop();
    await rm(projectsRoot, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
  });

  const createDiagram = async (id: number, elements: unknown[]) =>
    fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: callToolBody(id, "create_diagram", { title: "架构图", elements }),
    });

  it("tools/list exposes the four canvas tools with _meta.ui.resourceUri", async () => {
    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: listToolsBody(1),
    });
    const text = await res.text();
    for (const name of ["create_diagram", "read_scene", "apply_operations", "export_diagram"]) {
      expect(text).toContain(`"${name}"`);
    }
    expect(text).toContain("ui://ar-hub/canvas");
  });

  it("create_diagram then read_scene round-trips through the canvas service", async () => {
    const created = await parseSseResult(
      await createDiagram(2, [{ id: "e1", type: "rectangle", x: 1, y: 2, width: 3, height: 4 }]),
    );
    const createdSc = created.result?.structuredContent as Record<string, unknown>;
    expect(createdSc.kind).toBe("canvas-doc");
    expect(createdSc.revision).toBe(1);
    const docId = createdSc.id as string;

    const scene = await parseSseResult(
      await fetch(`${baseUrl}/mcp/test`, {
        method: "POST",
        headers: MCP_HEADERS,
        body: callToolBody(3, "read_scene", { id: docId }),
      }),
    );
    const sceneSc = scene.result?.structuredContent as Record<string, unknown>;
    expect(sceneSc.revision).toBe(1);
    expect((sceneSc.elements as { id: string }[]).map((el) => el.id)).toEqual(["e1"]);

    // 局部修改:revision 2 + patch 生效。
    const applied = await parseSseResult(
      await fetch(`${baseUrl}/mcp/test`, {
        method: "POST",
        headers: MCP_HEADERS,
        body: callToolBody(4, "apply_operations", {
          id: docId,
          operations: [{ op: "update", elementId: "e1", patch: { x: 42 } }],
          expectedRevision: 1,
          operationId: "op-a",
        }),
      }),
    );
    const appliedSc = applied.result?.structuredContent as Record<string, unknown>;
    expect(appliedSc.revision).toBe(2);
    expect((appliedSc.elements as { id: string; x: number }[])[0].x).toBe(42);

    // 冲突 → isError + 重读提示(agent 可自纠)。
    const conflict = await parseSseResult(
      await fetch(`${baseUrl}/mcp/test`, {
        method: "POST",
        headers: MCP_HEADERS,
        body: callToolBody(5, "apply_operations", {
          id: docId,
          operations: [{ op: "remove", elementId: "e1" }],
          expectedRevision: 1,
        }),
      }),
    );
    expect(conflict.result?.isError).toBe(true);
    expect(conflict.result?.content?.[0]?.text).toContain("PROJECT_CANVAS_REVISION_CONFLICT");
    expect(conflict.result?.content?.[0]?.text).toContain("read_scene");
  });
});

// ── capability_set 的 admin 审批分档（agent 无法自我提权）─────────────────────

describe("MCP hub admin capability approval", () => {
  let projectsRoot: string;
  let home: string;
  let hub: McpHubServer;
  let baseUrl: string;
  let capabilitiesStore: McpCapabilitiesStore;
  let decision: "allow" | "deny";
  const approvalRequests: { toolName: string; input: unknown }[] = [];

  beforeEach(async () => {
    decision = "allow";
    approvalRequests.length = 0;
    projectsRoot = await mkdtemp(join(tmpdir(), "ar-mcp-admin-cap-"));
    home = await mkdtemp(join(tmpdir(), "ar-mcp-admin-cap-home-"));
    await mkdir(join(projectsRoot, "test"), { recursive: true });
    capabilitiesStore = new McpCapabilitiesStore({
      path: join(projectsRoot, ".capabilities.json"),
      projectsRoot,
    });
    hub = startMcpHubServer({
      port: 0,
      projectsRoot,
      wikiService: new ProjectWikiService(projectsRoot),
      home,
      capabilitiesStore,
      adminDeps: {
        // 审批闸只触达 peepMetadata + requestApproval，其余依赖给桩即可。
        projectService: {} as never,
        sessionRegistry: {
          peekMetadata: async (project: string, sessionId: string) =>
            sessionId === "agent_origin"
              ? { projectName: project, id: sessionId, runtimeKey: "run-1" }
              : undefined,
        } as never,
        approvalService: {
          requestApproval: async (req: { toolName: string; input: unknown }) => {
            approvalRequests.push({ toolName: req.toolName, input: req.input });
            return decision;
          },
        } as never,
      },
    });
    baseUrl = `http://127.0.0.1:${hub.port}`;
  });

  afterEach(async () => {
    hub.stop();
    await rm(projectsRoot, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
  });

  const setAdmin = (id: number) =>
    fetch(`${baseUrl}/mcp/test?origin=agent_origin`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: callToolBody(id, "capability_set", { capability: "admin", enabled: true }),
    });

  it("allow → approval received, then the admin switch is applied", async () => {
    decision = "allow";
    const res = await setAdmin(90);
    const payload = JSON.parse((await parseSseResult(res)).result?.content?.[0]?.text ?? "{}") as {
      capabilities?: { capability: string; enabled: boolean }[];
    };
    expect(payload.capabilities?.find((e) => e.capability === "admin")?.enabled).toBe(true);
    expect(approvalRequests).toEqual([
      { toolName: "capability_set", input: { capability: "admin", enabled: true } },
    ]);
  });

  it("deny → error and no state change", async () => {
    decision = "deny";
    const res = await setAdmin(91);
    const text = await res.text();
    expect(text).toContain("ADMIN_APPROVAL_DENIED");
    expect((await capabilitiesStore.get("test")).admin).toBeUndefined();
  });

  it("missing origin identity → admin switch denied", async () => {
    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: callToolBody(92, "capability_set", { capability: "admin", enabled: true }),
    });
    const text = await res.text();
    expect(text).toContain("ADMIN_ORIGIN_MISSING");
    expect(approvalRequests).toHaveLength(0);
  });

  it("disabling admin also goes through approval (both directions gated)", async () => {
    await capabilitiesStore.set("test", "admin", true);
    decision = "allow";
    const res = await fetch(`${baseUrl}/mcp/test?origin=agent_origin`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: callToolBody(93, "capability_set", { capability: "admin", enabled: false }),
    });
    const payload = JSON.parse((await parseSseResult(res)).result?.content?.[0]?.text ?? "{}") as {
      capabilities?: { capability: string; enabled: boolean }[];
    };
    expect(payload.capabilities?.find((e) => e.capability === "admin")?.enabled).toBe(false);
    expect(approvalRequests).toEqual([
      { toolName: "capability_set", input: { capability: "admin", enabled: false } },
    ]);
  });
});

// ── pages 域（静态站点发布：pages_list 只读 + pages_set_roots 挂审批）──────────

describe("MCP hub pages capability", () => {
  let projectsRoot: string;
  let home: string;
  let hub: McpHubServer;
  let baseUrl: string;
  let capabilitiesStore: McpCapabilitiesStore;
  let decision: "allow" | "deny";
  const approvalRequests: { toolName: string; input: unknown }[] = [];

  beforeEach(async () => {
    decision = "allow";
    approvalRequests.length = 0;
    projectsRoot = await mkdtemp(join(tmpdir(), "ar-mcp-pages-"));
    home = await mkdtemp(join(tmpdir(), "ar-mcp-pages-home-"));
    await mkdir(join(projectsRoot, "test"), { recursive: true });
    capabilitiesStore = new McpCapabilitiesStore({
      path: join(projectsRoot, ".capabilities.json"),
      projectsRoot,
    });
    hub = startMcpHubServer({
      port: 0,
      projectsRoot,
      wikiService: new ProjectWikiService(projectsRoot),
      pagesService: new ProjectPagesService(projectsRoot),
      home,
      capabilitiesStore,
      adminDeps: {
        projectService: {} as never,
        sessionRegistry: {
          peekMetadata: async (project: string, sessionId: string) =>
            sessionId === "agent_origin"
              ? { projectName: project, id: sessionId, runtimeKey: "run-1" }
              : undefined,
        } as never,
        approvalService: {
          requestApproval: async (req: { toolName: string; input: unknown }) => {
            approvalRequests.push({ toolName: req.toolName, input: req.input });
            return decision;
          },
        } as never,
      },
    });
    baseUrl = `http://127.0.0.1:${hub.port}`;
  });

  afterEach(async () => {
    hub.stop();
    await rm(projectsRoot, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
  });

  const configPath = () => join(projectsRoot, "test", ".agents-remote", "pages.json");

  const callPages = (id: number, name: string, args: Record<string, unknown> = {}) =>
    fetch(`${baseUrl}/mcp/test?origin=agent_origin`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: callToolBody(id, name, args),
    });

  it("tools/list includes the pages tools even when the domain is disabled", async () => {
    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: listToolsBody(94),
    });
    const { result } = await parseSseResult(res);
    const tools = ((result as unknown as { tools?: { name: string }[] }).tools ?? []).map(
      (t) => t.name,
    );
    expect(tools).toContain("pages_list");
    expect(tools).toContain("pages_set_roots");
  });

  it("disabled domain → both tools return the capability_set guidance error", async () => {
    for (const name of ["pages_list", "pages_set_roots"]) {
      const res = await callPages(95, name, name === "pages_set_roots" ? { roots: [] } : {});
      const text = await res.text();
      expect(text).toContain('"isError":true');
      expect(text).toContain("capability_set");
    }
    // 门控在审批之前：关闭态变更请求不应打扰用户。
    expect(approvalRequests).toHaveLength(0);
  });

  it("pages_list returns the default site/ → / public root when no config file exists", async () => {
    await capabilitiesStore.set("test", "pages", true);
    const res = await callPages(96, "pages_list");
    const payload = JSON.parse((await parseSseResult(res)).result?.content?.[0]?.text ?? "{}") as {
      config?: { roots?: { urlPath: string; fsDir: string; auth: string }[] };
      servePrefix?: string;
    };
    expect(payload.config?.roots).toEqual([{ urlPath: "/", fsDir: "site", auth: "public" }]);
    expect(payload.servePrefix).toBe("/p/test");
  });

  it("pages_set_roots allow → approval card then config really written", async () => {
    await capabilitiesStore.set("test", "pages", true);
    const roots = [{ urlPath: "/", fsDir: "public", auth: "public" as const }];
    const res = await callPages(97, "pages_set_roots", { roots });
    const payload = JSON.parse((await parseSseResult(res)).result?.content?.[0]?.text ?? "{}") as {
      config?: { roots?: unknown };
    };
    expect(payload.config?.roots).toEqual(roots);
    expect(approvalRequests).toEqual([{ toolName: "pages_set_roots", input: { roots } }]);
    const written = JSON.parse(await readFile(configPath(), "utf8")) as { roots: unknown };
    expect(written.roots).toEqual(roots);
  });

  it("pages_set_roots deny → ADMIN_APPROVAL_DENIED and nothing written (fail closed)", async () => {
    await capabilitiesStore.set("test", "pages", true);
    decision = "deny";
    const res = await callPages(98, "pages_set_roots", {
      roots: [{ urlPath: "/", fsDir: "public", auth: "public" }],
    });
    const text = await res.text();
    expect(text).toContain("ADMIN_APPROVAL_DENIED");
    expect(approvalRequests).toHaveLength(1);
    await expect(readFile(configPath(), "utf8")).rejects.toThrow();
  });
});
