import { afterEach, expect, test } from "bun:test";
import {
  closeAgentSession,
  closeTerminalSession,
  createAgentSession,
  createProject,
  createTerminalSession,
  getAuthStatus,
  getProject,
  getProjectGitFileDiff,
  listAgentSessions,
  listProjectFiles,
  listProjectGitDiff,
  listProjects,
  listTerminalSessions,
  login,
  previewProjectFile,
  renameAgentSession,
  renameTerminalSession,
  sessionStreamUrl,
} from "./client";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("web api client checks auth status", async () => {
  const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
  globalThis.fetch = (async (input, init) => {
    calls.push([input, init]);
    return Response.json({ authenticated: true });
  }) as typeof fetch;

  await expect(getAuthStatus()).resolves.toBe(true);

  expect(calls[0][0]).toBe("/api/auth/me");
});

test("web api client treats unauthenticated status as false", async () => {
  globalThis.fetch = (async () =>
    Response.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 })) as typeof fetch;

  await expect(getAuthStatus()).resolves.toBe(false);
});

test("web api client logs in with JSON body", async () => {
  let body = "";
  globalThis.fetch = (async (_input, init) => {
    body = init?.body?.toString() ?? "";
    return Response.json({ ok: true, token: "token", expiresAt: "2026-05-25T00:00:00.000Z" });
  }) as typeof fetch;

  const response = await login("secret");

  expect(JSON.parse(body)).toEqual({ password: "secret" });
  expect(response.ok).toBe(true);
});

test("web api client uses same-origin /api paths", async () => {
  const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
  globalThis.fetch = (async (input, init) => {
    calls.push([input, init]);
    return Response.json({ projects: [] });
  }) as typeof fetch;

  await listProjects();

  expect(calls[0][0]).toBe("/api/projects");
});

test("web api client creates projects with JSON body", async () => {
  let body = "";
  globalThis.fetch = (async (_input, init) => {
    body = init?.body?.toString() ?? "";
    return Response.json({
      project: {
        name: "demo",
        path: "/projects/demo",
        agentSessionCount: 0,
        terminalSessionCount: 0,
      },
    });
  }) as typeof fetch;

  const response = await createProject("demo");

  expect(JSON.parse(body)).toEqual({ path: "demo" });
  expect(response.project.name).toBe("demo");
});

test("web api client encodes project detail names", async () => {
  let path = "";
  globalThis.fetch = (async (input) => {
    path = input.toString();
    return Response.json({
      project: {
        name: "hello world 中文",
        path: "/projects/hello world 中文",
        agentSessionCount: 0,
        terminalSessionCount: 0,
      },
    });
  }) as typeof fetch;

  await getProject("hello world 中文");

  expect(path).toBe("/api/projects/hello%20world%20%E4%B8%AD%E6%96%87");
});

test("web api client calls Project file routes with encoded paths", async () => {
  const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
  globalThis.fetch = (async (input, init) => {
    calls.push([input, init]);

    if (input.toString().includes("preview")) {
      return Response.json({
        type: "text",
        projectName: "hello world 中文",
        path: "src/hello world.ts",
        name: "hello world.ts",
        size: 5,
        content: "hello",
      });
    }

    return Response.json({
      projectName: "hello world 中文",
      path: "src",
      parentPath: "",
      entries: [],
    });
  }) as typeof fetch;

  await listProjectFiles("hello world 中文");
  await listProjectFiles("hello world 中文", "src");
  await previewProjectFile("hello world 中文", "src/hello world.ts");

  expect(calls[0][0]).toBe("/api/projects/hello%20world%20%E4%B8%AD%E6%96%87/files");
  expect(calls[1][0]).toBe("/api/projects/hello%20world%20%E4%B8%AD%E6%96%87/files?path=src");
  expect(calls[2][0]).toBe(
    "/api/projects/hello%20world%20%E4%B8%AD%E6%96%87/files/preview?path=src%2Fhello%20world.ts",
  );
});

test("web api client calls Project Git diff routes with encoded paths", async () => {
  const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
  globalThis.fetch = (async (input, init) => {
    calls.push([input, init]);

    if (input.toString().includes("/file")) {
      return Response.json({
        repository: true,
        projectName: "hello world 中文",
        path: "src/hello world.ts",
        scope: "worktree",
        status: "modified",
        diff: "diff --git a/src/hello world.ts b/src/hello world.ts",
      });
    }

    return Response.json({ repository: true, projectName: "hello world 中文", files: [] });
  }) as typeof fetch;

  await listProjectGitDiff("hello world 中文");
  await getProjectGitFileDiff("hello world 中文", "worktree", "src/hello world.ts");
  await getProjectGitFileDiff("hello world 中文", "staged", "README.md");

  expect(calls[0][0]).toBe("/api/projects/hello%20world%20%E4%B8%AD%E6%96%87/git/diff");
  expect(calls[1][0]).toBe(
    "/api/projects/hello%20world%20%E4%B8%AD%E6%96%87/git/diff/file?scope=worktree&path=src%2Fhello%20world.ts",
  );
  expect(calls[2][0]).toBe(
    "/api/projects/hello%20world%20%E4%B8%AD%E6%96%87/git/diff/file?scope=staged&path=README.md",
  );
});

test("web api client calls Project-scoped Agent session routes", async () => {
  const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
  globalThis.fetch = (async (input, init) => {
    calls.push([input, init]);

    if (init?.method === "POST") {
      return Response.json({
        session: {
          id: "agent_123",
          projectName: "hello world 中文",
          provider: "claude",
          displayName: "Claude Agent 123",
          status: "running",
        },
      });
    }

    return Response.json({ sessions: [] });
  }) as typeof fetch;

  await listAgentSessions("hello world 中文");
  await createAgentSession("hello world 中文", "claude");
  await closeAgentSession("hello world 中文", "agent_123");

  expect(calls[0][0]).toBe("/api/projects/hello%20world%20%E4%B8%AD%E6%96%87/agent-sessions");
  expect(JSON.parse(calls[1][1]?.body?.toString() ?? "{}")).toEqual({ provider: "claude" });
  expect(calls[2][0]).toBe(
    "/api/projects/hello%20world%20%E4%B8%AD%E6%96%87/agent-sessions/agent_123/close",
  );
});

test("web api client calls Project-scoped Terminal session routes", async () => {
  const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
  globalThis.fetch = (async (input, init) => {
    calls.push([input, init]);

    if (init?.method === "POST") {
      return Response.json({
        session: {
          id: "terminal_123",
          projectName: "demo",
          displayName: "Project shell",
          status: "running",
        },
      });
    }

    return Response.json({ sessions: [] });
  }) as typeof fetch;

  await listTerminalSessions("demo");
  await createTerminalSession("demo", "Project shell");
  await closeTerminalSession("demo", "terminal_123");

  expect(calls[0][0]).toBe("/api/projects/demo/terminal-sessions");
  expect(JSON.parse(calls[1][1]?.body?.toString() ?? "{}")).toEqual({
    displayName: "Project shell",
  });
  expect(calls[2][0]).toBe("/api/projects/demo/terminal-sessions/terminal_123/close");
});

test("web api client calls rename routes with JSON body and encoded paths", async () => {
  const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
  globalThis.fetch = (async (input, init) => {
    calls.push([input, init]);
    return Response.json({
      session: {
        id: "agent_123",
        projectName: "hello world 中文",
        provider: "claude",
        displayName: "新会话名",
        status: "running",
      },
    });
  }) as typeof fetch;

  await renameAgentSession("hello world 中文", "agent_123", "新会话名");
  await renameTerminalSession("demo", "terminal_123", "新终端名");

  expect(calls[0][0]).toBe(
    "/api/projects/hello%20world%20%E4%B8%AD%E6%96%87/agent-sessions/agent_123/rename",
  );
  expect(JSON.parse(calls[0][1]?.body?.toString() ?? "{}")).toEqual({
    displayName: "新会话名",
  });
  expect(calls[1][0]).toBe("/api/projects/demo/terminal-sessions/terminal_123/rename");
  expect(JSON.parse(calls[1][1]?.body?.toString() ?? "{}")).toEqual({
    displayName: "新终端名",
  });
});

test("web api client builds same-origin session stream URLs", () => {
  const originalLocation = globalThis.location;
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: { protocol: "https:", host: "example.test" },
  });

  expect(sessionStreamUrl("hello world 中文", "terminal", "terminal_123")).toBe(
    "wss://example.test/api/projects/hello%20world%20%E4%B8%AD%E6%96%87/terminal-sessions/terminal_123/stream",
  );

  Object.defineProperty(globalThis, "location", { configurable: true, value: originalLocation });
});
