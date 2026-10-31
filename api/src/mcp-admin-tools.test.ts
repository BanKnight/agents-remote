import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startMcpHubServer, type McpHubServer } from "./mcp-hub-server";
import { ProjectWikiService } from "./project-wiki";
import type { ProjectService } from "./projects";
import type { SessionRegistry } from "./session-registry";

// admin capability 观察面集成测：真实 hub + stub projectService/sessionRegistry，
// 沿 mcp-hub-server.test.ts 的 SSE 基建。观察三工具注册条件 =
// mcp.json capabilities.admin === true && sessionRegistry && adminDeps 注入。

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

type McpSseResult = {
  result?: {
    content?: { text?: string }[];
    isError?: boolean;
  };
};
const parseSseResult = async (res: Response): Promise<McpSseResult> => {
  const text = await res.text();
  const dataLine = text.split("\n").find((line) => line.startsWith("data: "));
  if (!dataLine) throw new Error(`SSE response has no data line: ${text}`);
  return JSON.parse(dataLine.slice("data: ".length)) as McpSseResult;
};

const stubProjectService = {
  listProjects: async () => [
    { name: "p1", path: "/tmp/p1", agentSessionCount: 1, terminalSessionCount: 0 },
  ],
} as unknown as ProjectService;

const stubSessionRegistry = {
  peekMetadata: async () => undefined,
  listAllCandidates: async () => [
    { type: "agent", projectName: "p1", sessionId: "s1", displayName: "S1", status: "idle" },
  ],
} as unknown as SessionRegistry;

describe("MCP admin tools (observation, capabilities.admin=true)", () => {
  let projectsRoot: string;
  let home: string;
  let hub: McpHubServer;
  let baseUrl: string;

  beforeEach(async () => {
    projectsRoot = await mkdtemp(join(tmpdir(), "ar-mcp-admin-"));
    home = await mkdtemp(join(tmpdir(), "ar-mcp-admin-home-"));
    await mkdir(join(projectsRoot, "test", ".agents-remote"), { recursive: true });
    await writeFile(
      join(projectsRoot, "test", ".agents-remote", "mcp.json"),
      JSON.stringify({ capabilities: { admin: true } }),
    );
    hub = startMcpHubServer({
      port: 0,
      projectsRoot,
      wikiService: new ProjectWikiService(projectsRoot),
      home,
      sessionRegistry: stubSessionRegistry,
      adminDeps: {
        projectService: stubProjectService,
        sessionRegistry: stubSessionRegistry,
      },
    });
    baseUrl = `http://127.0.0.1:${hub.port}`;
  });

  afterEach(async () => {
    hub.stop();
    await rm(projectsRoot, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
  });

  it("tools/list exposes the three observation tools", async () => {
    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: listToolsBody(1),
    });
    const { result } = await parseSseResult(res);
    const tools = (result as unknown as { tools?: { name: string }[] }).tools;
    expect(tools?.map((t) => t.name).sort()).toEqual([
      "project_list",
      "session_list",
      "session_read",
    ]);
  });

  it("project_list returns projects from the stub service", async () => {
    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: callToolBody(2, "project_list", {}),
    });
    const payload = JSON.parse((await parseSseResult(res)).result?.content?.[0]?.text ?? "{}") as {
      projects: { name: string }[];
    };
    expect(payload.projects.map((p) => p.name)).toEqual(["p1"]);
  });

  it("session_list returns candidates as sessions array", async () => {
    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: callToolBody(3, "session_list", {}),
    });
    const payload = JSON.parse((await parseSseResult(res)).result?.content?.[0]?.text ?? "{}") as {
      sessions: { sessionId: string }[];
    };
    expect(payload.sessions.map((s) => s.sessionId)).toEqual(["s1"]);
  });

  it("session_read on unknown session returns isError with [SESSION_NOT_FOUND]", async () => {
    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: callToolBody(4, "session_read", { project: "p1", sessionId: "ghost" }),
    });
    const { result } = await parseSseResult(res);
    expect(result?.isError).toBe(true);
    expect(result?.content?.[0]?.text).toContain("[SESSION_NOT_FOUND]");
  });
});

// admin 关（无 adminDeps 注入）→ 即使 mcp.json 写了 admin:true 也不注册工具
// （注册条件三缺一不可：adminEnabled && sessionRegistry && adminDeps）。
describe("MCP admin tools (adminDeps missing → no registration)", () => {
  let projectsRoot: string;
  let home: string;
  let hub: McpHubServer;
  let baseUrl: string;

  beforeEach(async () => {
    projectsRoot = await mkdtemp(join(tmpdir(), "ar-mcp-admin-off-"));
    home = await mkdtemp(join(tmpdir(), "ar-mcp-admin-off-home-"));
    await mkdir(join(projectsRoot, "test", ".agents-remote"), { recursive: true });
    await writeFile(
      join(projectsRoot, "test", ".agents-remote", "mcp.json"),
      JSON.stringify({ capabilities: { admin: true } }),
    );
    hub = startMcpHubServer({
      port: 0,
      projectsRoot,
      wikiService: new ProjectWikiService(projectsRoot),
      home,
    });
    baseUrl = `http://127.0.0.1:${hub.port}`;
  });

  afterEach(async () => {
    hub.stop();
    await rm(projectsRoot, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
  });

  it("tools/list has no admin tools even with admin:true on disk", async () => {
    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: listToolsBody(10),
    });
    const text = await res.text();
    expect(text).not.toContain("project_list");
    expect(text).not.toContain("session_read");
  });

  it("initialize itself still works (admin off does not break the hub)", async () => {
    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: initBody(11),
    });
    expect(res.status).toBe(200);
  });
});
