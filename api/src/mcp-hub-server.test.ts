import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startMcpHubServer, type McpHubServer } from "./mcp-hub-server";

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

describe("MCP hub server (stateless, loopback)", () => {
  let projectsRoot: string;
  let hub: McpHubServer;
  let baseUrl: string;

  beforeEach(async () => {
    projectsRoot = await mkdtemp(join(tmpdir(), "ar-mcp-"));
    await mkdir(join(projectsRoot, "test"), { recursive: true });
    // port 0:OS 分配空闲端口,避免与 dev 服务撞端口。
    hub = startMcpHubServer({ port: 0, projectsRoot });
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
});
