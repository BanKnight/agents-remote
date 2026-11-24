import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { McpCapabilitiesStore } from "./mcp-capabilities-store";
import { startMcpHubServer, type McpHubServer } from "./mcp-hub-server";
import { ProjectWikiService } from "./project-wiki";
import type { ProjectService } from "./projects";
import type { SessionRegistry } from "./session-registry";

// admin capability 观察面集成测：真实 hub + stub projectService/sessionRegistry，
// 沿 mcp-hub-server.test.ts 的 SSE 基建。观察三工具注册条件 =
// 内部状态 capabilities.admin === true && sessionRegistry && adminDeps 注入。

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
    await mkdir(join(projectsRoot, "test"), { recursive: true });
    const capabilitiesStore = new McpCapabilitiesStore({
      path: join(projectsRoot, ".capabilities.json"),
      projectsRoot,
    });
    await capabilitiesStore.set("test", "admin", true);
    hub = startMcpHubServer({
      port: 0,
      projectsRoot,
      wikiService: new ProjectWikiService(projectsRoot),
      home,
      sessionRegistry: stubSessionRegistry,
      adminDeps: {
        projectService: stubProjectService,
        sessionRegistry: stubSessionRegistry,
        projectsRoot,
        home,
      },
      capabilitiesStore,
    });
    baseUrl = `http://127.0.0.1:${hub.port}`;
  });

  afterEach(async () => {
    hub.stop();
    await rm(projectsRoot, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
  });

  it("tools/list exposes all fourteen admin tools (4 observe + 10 manage)", async () => {
    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: listToolsBody(1),
    });
    const { result } = await parseSseResult(res);
    const tools = (result as unknown as { tools?: { name: string }[] }).tools;
    // admin 十四工具 + 恒注册面（wiki 四工具运行时门控 + capability 两工具）。
    // pages 两工具不在本断言内：该 describe 未注入 pagesService（不注册）。
    expect(tools?.map((t) => t.name).sort()).toEqual([
      "capability_list",
      "capability_set",
      "mcp_add",
      "mcp_disable",
      "mcp_enable",
      "mcp_list",
      "mcp_remove",
      "mcp_update",
      "project_create",
      "project_delete",
      "project_list",
      "session_close",
      "session_create",
      "session_list",
      "session_read",
      "session_send",
      "wiki_list",
      "wiki_read",
      "wiki_search",
      "wiki_write",
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

// admin 关（无 adminDeps 注入）→ 即使内部状态开了 admin 也不注册工具
// （注册条件三缺一不可：adminEnabled && sessionRegistry && adminDeps）。
describe("MCP admin tools (adminDeps missing → no registration)", () => {
  let projectsRoot: string;
  let home: string;
  let hub: McpHubServer;
  let baseUrl: string;

  beforeEach(async () => {
    projectsRoot = await mkdtemp(join(tmpdir(), "ar-mcp-admin-off-"));
    home = await mkdtemp(join(tmpdir(), "ar-mcp-admin-off-home-"));
    await mkdir(join(projectsRoot, "test"), { recursive: true });
    const capabilitiesStore = new McpCapabilitiesStore({
      path: join(projectsRoot, ".capabilities.json"),
      projectsRoot,
    });
    await capabilitiesStore.set("test", "admin", true);
    hub = startMcpHubServer({
      port: 0,
      projectsRoot,
      wikiService: new ProjectWikiService(projectsRoot),
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

// ── 管理面（审批闸）───────────────────────────────────────────────────────────
//
// 走真实 hub 的 tools/call 验证 gate 链：origin 缺失/会话不存在/服务未装配/deny/allow
// 执行段。approvalService 用 stub（requestApproval mock 可改写实现）。

import { mock } from "bun:test";
import type { McpAdminApprovalService } from "./mcp-admin-approval";

describe("MCP admin tools (manage gate)", () => {
  let projectsRoot: string;
  let home: string;
  let hub: McpHubServer;
  let baseUrl: string;
  let capabilitiesStore: McpCapabilitiesStore;
  let approvalMock: ReturnType<typeof mock>;
  let sendToAgentMock: ReturnType<typeof mock>;
  /** gate 已知会话集合（origin 身份 + send 目标）；集合外 = 未知会话。 */
  const KNOWN_SESSIONS = new Set(["s1", "s9"]);

  const ORIGIN = "s1";
  /** session_read 冒烟与 gate 用 fetch helper：带 origin query。 */
  const callWithOrigin = async (
    id: number,
    tool: string,
    args: Record<string, unknown>,
    origin: string | null = ORIGIN,
  ) => {
    const query = origin === null ? "" : `?origin=${origin}`;
    const res = await fetch(`${baseUrl}/mcp/test${query}`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: callToolBody(id, tool, args),
    });
    return parseSseResult(res);
  };

  beforeEach(async () => {
    projectsRoot = await mkdtemp(join(tmpdir(), "ar-mcp-admin-mgmt-"));
    home = await mkdtemp(join(tmpdir(), "ar-mcp-admin-mgmt-home-"));
    await mkdir(join(projectsRoot, "test"), { recursive: true });
    capabilitiesStore = new McpCapabilitiesStore({
      path: join(projectsRoot, ".capabilities.json"),
      projectsRoot,
    });
    await capabilitiesStore.set("test", "admin", true);
    approvalMock = mock(
      async (_req: { origin: unknown; toolName: string; input: unknown }) => "deny",
    );
    sendToAgentMock = mock(async (_metadata: unknown, _text: string) => {});
    const approvalService = {
      requestApproval: approvalMock,
    } as unknown as McpAdminApprovalService;
    const registry = {
      peekMetadata: async (_project: string, sessionId: string) =>
        KNOWN_SESSIONS.has(sessionId)
          ? {
              schemaVersion: 1,
              id: sessionId,
              projectName: "test",
              projectPath: "/tmp/ar-test",
              type: "agent",
              provider: "claude",
              displayName: "S1",
              status: "idle",
              runtimeKey: `rk-${sessionId}`,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            }
          : undefined,
      listAllCandidates: async () => [],
      closeAgentSession: async () => undefined,
      closeTerminalSession: async () => undefined,
    } as unknown as SessionRegistry;
    const projectService = {
      listProjects: async () => [],
      getProject: async (name: string) => ({ name, path: `/tmp/${name}` }),
      createProject: async (inputPath: string) => ({
        name: inputPath.split("/").pop(),
        path: inputPath,
      }),
    } as unknown as ProjectService;
    hub = startMcpHubServer({
      port: 0,
      projectsRoot,
      wikiService: new ProjectWikiService(projectsRoot),
      home,
      sessionRegistry: registry,
      adminDeps: {
        projectService,
        sessionRegistry: registry,
        approvalService,
        sendToAgent: sendToAgentMock,
        projectsRoot,
        home,
      },
      capabilitiesStore,
    });
    baseUrl = `http://127.0.0.1:${hub.port}`;
  });

  afterEach(async () => {
    hub.stop();
    await rm(projectsRoot, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
  });

  it("tools/list exposes all fourteen admin tools (4 observe + 10 manage)", async () => {
    const res = await fetch(`${baseUrl}/mcp/test`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: listToolsBody(20),
    });
    const { result } = await parseSseResult(res);
    const tools = (result as unknown as { tools?: { name: string }[] }).tools;
    // admin 十四工具 + 恒注册面（wiki 四工具运行时门控 + capability 两工具）。
    expect(tools?.map((t) => t.name).sort()).toEqual([
      "capability_list",
      "capability_set",
      "mcp_add",
      "mcp_disable",
      "mcp_enable",
      "mcp_list",
      "mcp_remove",
      "mcp_update",
      "project_create",
      "project_delete",
      "project_list",
      "session_close",
      "session_create",
      "session_list",
      "session_read",
      "session_send",
      "wiki_list",
      "wiki_read",
      "wiki_search",
      "wiki_write",
    ]);
  });

  it("manage tool without ?origin= returns [ADMIN_ORIGIN_MISSING] before approval", async () => {
    const { result } = await callWithOrigin(21, "project_create", { path: "/tmp/new" }, null);
    expect(result?.isError).toBe(true);
    expect(result?.content?.[0]?.text).toContain("[ADMIN_ORIGIN_MISSING]");
    expect(approvalMock).not.toHaveBeenCalled();
  });

  it("manage tool with unknown origin session returns [SESSION_NOT_FOUND] before approval", async () => {
    const { result } = await callWithOrigin(22, "project_create", { path: "/tmp/new" }, "ghost");
    expect(result?.isError).toBe(true);
    expect(result?.content?.[0]?.text).toContain("[SESSION_NOT_FOUND]");
    expect(approvalMock).not.toHaveBeenCalled();
  });

  it("manage tool with approval service not wired returns [ADMIN_APPROVAL_UNAVAILABLE]", async () => {
    hub.stop();
    const registry = {
      peekMetadata: async () => undefined,
      listAllCandidates: async () => [],
    } as unknown as SessionRegistry;
    const projectService = {
      listProjects: async () => [],
    } as unknown as ProjectService;
    hub = startMcpHubServer({
      port: 0,
      projectsRoot,
      wikiService: new ProjectWikiService(projectsRoot),
      home,
      sessionRegistry: registry,
      adminDeps: { projectService, sessionRegistry: registry, projectsRoot, home },
      capabilitiesStore,
    });
    baseUrl = `http://127.0.0.1:${hub.port}`;
    const { result } = await callWithOrigin(23, "project_create", { path: "/tmp/new" });
    expect(result?.isError).toBe(true);
    expect(result?.content?.[0]?.text).toContain("[ADMIN_APPROVAL_UNAVAILABLE]");
    expect(approvalMock).not.toHaveBeenCalled();
  });

  it("denied approval returns [ADMIN_APPROVAL_DENIED] without executing", async () => {
    const { result } = await callWithOrigin(24, "session_send", {
      project: "test",
      sessionId: "s9",
      text: "hi",
    });
    expect(result?.isError).toBe(true);
    expect(result?.content?.[0]?.text).toContain("[ADMIN_APPROVAL_DENIED]");
    expect(sendToAgentMock).not.toHaveBeenCalled();
  });

  it("allowed approval executes session_send through sendToAgent", async () => {
    approvalMock.mockImplementation(async () => "allow");
    const { result } = await callWithOrigin(25, "session_send", {
      project: "test",
      sessionId: "s9",
      text: "hi",
    });
    const payload = JSON.parse(result?.content?.[0]?.text ?? "{}") as { delivered?: boolean };
    expect(payload.delivered).toBe(true);
    expect(sendToAgentMock).toHaveBeenCalledTimes(1);
    // 审批请求携带发起者身份与完整入参（卡片展示所需字段）。
    const req = approvalMock.mock.calls[0]?.[0] as {
      origin: { projectName: string; sessionId: string; runtimeKey: string };
      toolName: string;
      input: Record<string, unknown>;
    };
    expect(req.origin).toEqual({ projectName: "test", sessionId: "s1", runtimeKey: "rk-s1" });
    expect(req.toolName).toBe("session_send");
    expect(req.input).toEqual({ project: "test", sessionId: "s9", text: "hi" });
  });

  it("allowed project_create runs the createProject stub", async () => {
    approvalMock.mockImplementation(async () => "allow");
    const { result } = await callWithOrigin(26, "project_create", { path: "/tmp/adopted" });
    const payload = JSON.parse(result?.content?.[0]?.text ?? "{}") as {
      project?: { path?: string };
    };
    expect(payload.project?.path).toBe("/tmp/adopted");
  });

  it("session_create with unknown provider fails fast without raising an approval card", async () => {
    const { result } = await callWithOrigin(27, "session_create", {
      project: "test",
      provider: "nope",
    });
    expect(result?.isError).toBe(true);
    expect(result?.content?.[0]?.text).toContain("[SESSION_PROVIDER_UNAVAILABLE]");
    expect(approvalMock).not.toHaveBeenCalled();
  });

  // ── M4 session_create 特权天花板 + 血缘 ─────────────────────────────────────
  // 局部 hub：origin metadata 可带 permissionMode（天花板可比的前提）。
  // 返回 createSessionMock 供断言（未调用即证明 gate 在审批前拦截）。

  const startHubWithCeilingRegistry = async (originMode: string | undefined) => {
    hub.stop();
    const createSessionMock = mock(async () => ({
      id: "agent_child01",
      projectName: "test",
      displayName: "child",
      status: "idle",
    }));
    const registry = {
      peekMetadata: async (_project: string, sessionId: string) =>
        sessionId === "s1"
          ? {
              schemaVersion: 1,
              id: "s1",
              projectName: "test",
              projectPath: "/tmp/ar-test",
              type: "agent",
              provider: "claude",
              displayName: "S1",
              status: "idle",
              runtimeKey: "rk-s1",
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
              ...(originMode !== undefined ? { permissionMode: originMode } : {}),
            }
          : undefined,
      listAllCandidates: async () => [],
      createAgentSession: createSessionMock,
    } as unknown as SessionRegistry;
    const projectService = {
      listProjects: async () => [],
      getProject: async (name: string) => ({ name, path: `/tmp/${name}` }),
    } as unknown as ProjectService;
    hub = startMcpHubServer({
      port: 0,
      projectsRoot,
      wikiService: new ProjectWikiService(projectsRoot),
      home,
      sessionRegistry: registry,
      adminDeps: {
        projectService,
        sessionRegistry: registry,
        approvalService: {
          requestApproval: approvalMock,
        } as unknown as McpAdminApprovalService,
        projectsRoot,
        home,
      },
      capabilitiesStore,
    });
    baseUrl = `http://127.0.0.1:${hub.port}`;
    return { createSessionMock };
  };

  it("session_create denies escalation above the origin ceiling before approval", async () => {
    const { createSessionMock } = await startHubWithCeilingRegistry("plan");
    const { result } = await callWithOrigin(50, "session_create", {
      project: "test",
      provider: "claude",
      permissionMode: "bypassPermissions",
    });
    expect(result?.isError).toBe(true);
    expect(result?.content?.[0]?.text).toContain("[MODE_ESCALATION_DENIED]");
    expect(result?.content?.[0]?.text).toContain("plan");
    expect(result?.content?.[0]?.text).toContain("bypassPermissions");
    expect(approvalMock).not.toHaveBeenCalled();
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("session_create allows equal/lower tiers and passes mode + createdBy through", async () => {
    const { createSessionMock } = await startHubWithCeilingRegistry("bypassPermissions");
    approvalMock.mockImplementation(async () => "allow");
    const { result } = await callWithOrigin(51, "session_create", {
      project: "test",
      provider: "claude",
      permissionMode: "plan",
    });
    const payload = JSON.parse(result?.content?.[0]?.text ?? "{}") as { session?: { id?: string } };
    expect(payload.session?.id).toBe("agent_child01");
    // 审批卡 input 携带生效 mode（用户批准的正是将要创建的形态）
    expect(approvalMock.mock.calls[0]?.[0]).toMatchObject({
      toolName: "session_create",
      input: { project: "test", provider: "claude", permissionMode: "plan" },
    });
    // createdBy = 发起会话身份（血缘），mode 原样透传
    expect(createSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        permissionMode: "plan",
        createdBy: { projectName: "test", sessionId: "s1" },
      }),
    );
  });

  it("session_create default auto is equally bounded by a narrow origin ceiling", async () => {
    const { createSessionMock } = await startHubWithCeilingRegistry("plan");
    const { result } = await callWithOrigin(52, "session_create", {
      project: "test",
      provider: "claude",
    });
    expect(result?.isError).toBe(true);
    expect(result?.content?.[0]?.text).toContain("[MODE_ESCALATION_DENIED]");
    expect(result?.content?.[0]?.text).toContain("auto");
    expect(approvalMock).not.toHaveBeenCalled();
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("session_create rejects a mode outside the provider whitelist without approval", async () => {
    const { createSessionMock } = await startHubWithCeilingRegistry("plan");
    const { result } = await callWithOrigin(53, "session_create", {
      project: "test",
      provider: "claude",
      permissionMode: "yolo",
    });
    expect(result?.isError).toBe(true);
    expect(result?.content?.[0]?.text).toContain("[SESSION_PROVIDER_UNAVAILABLE]");
    expect(result?.content?.[0]?.text).toContain("Unsupported permission mode");
    expect(approvalMock).not.toHaveBeenCalled();
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  // ── 外部 MCP server 管理（mcp_list 观察 + mcp_* 五管理工具）────────────────────

  it("mcp_list merges user and project scopes with a scope field (no approval)", async () => {
    await writeFile(
      join(home, ".claude.json"),
      JSON.stringify({ mcpServers: { "user-srv": { type: "stdio", command: "npx" } } }),
    );
    await writeFile(
      join(projectsRoot, "test", ".mcp.json"),
      JSON.stringify({
        mcpServers: { "proj-srv": { type: "http", url: "https://example.com/mcp" } },
      }),
    );
    const { result } = await callWithOrigin(28, "mcp_list", {});
    const payload = JSON.parse(result?.content?.[0]?.text ?? "{}") as {
      servers?: { name: string; scope: string }[];
    };
    expect(payload.servers).toEqual([
      expect.objectContaining({ name: "user-srv", scope: "user" }),
      expect.objectContaining({ name: "proj-srv", scope: "project" }),
    ]);
    expect(approvalMock).not.toHaveBeenCalled();
  });

  it("mcp_add rejects a reserved ar- name before raising an approval card", async () => {
    const { result } = await callWithOrigin(29, "mcp_add", {
      scope: "project",
      name: "ar-hub",
      type: "stdio",
      command: "npx",
    });
    expect(result?.isError).toBe(true);
    expect(result?.content?.[0]?.text).toContain("reserved");
    expect(approvalMock).not.toHaveBeenCalled();
  });

  it("mcp_add rejects an invalid name before raising an approval card", async () => {
    const { result } = await callWithOrigin(30, "mcp_add", {
      scope: "project",
      name: "bad name",
      type: "stdio",
      command: "npx",
    });
    expect(result?.isError).toBe(true);
    expect(result?.content?.[0]?.text).toContain("[MCP_CONFIG_INVALID]");
    expect(approvalMock).not.toHaveBeenCalled();
  });

  it("mcp_remove accepts a reserved legacy name (cleanup must stay possible)", async () => {
    approvalMock.mockImplementation(async () => "deny");
    const { result } = await callWithOrigin(31, "mcp_remove", { scope: "user", name: "ar-hub" });
    // 本地校验放行 → 到达审批闸（deny 路径），而非名字校验拒绝。
    expect(result?.content?.[0]?.text).toContain("[ADMIN_APPROVAL_DENIED]");
    expect(approvalMock).toHaveBeenCalledTimes(1);
    const req = approvalMock.mock.calls[0]?.[0] as { toolName: string; input: unknown };
    expect(req.toolName).toBe("mcp_remove");
    expect(req.input).toEqual({ scope: "user", name: "ar-hub" });
  });
});
