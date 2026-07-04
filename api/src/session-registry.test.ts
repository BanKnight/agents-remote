import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionRegistry, SessionRegistryError, createRuntimeKey } from "./session-registry";

let runDir: string;

beforeEach(async () => {
  runDir = await mkdtemp(join(tmpdir(), "agents-remote-sessions-"));
});

afterEach(async () => {
  await rm(runDir, { recursive: true, force: true });
});

const project = {
  name: "hello world 中文",
  path: "/projects/hello world 中文",
};

const fixedNow = () => new Date("2026-05-25T00:00:00.000Z");

test("SessionRegistry creates Agent and Terminal metadata with separate DTO semantics", async () => {
  const registry = new SessionRegistry({
    runDir,
    now: fixedNow,
    createId: (type) => (type === "agent" ? "agent_abcdef123456" : "terminal_abcdef123456"),
  });

  const agent = await registry.createAgentSession({ project, provider: "claude" });
  const terminal = await registry.createTerminalSession({ project });
  const agents = await registry.listAgentSessions(project.name);
  const terminals = await registry.listTerminalSessions(project.name);
  const metadata = JSON.parse(
    await readFile(join(runDir, "sessions", "agent_abcdef123456.json"), "utf8"),
  );

  expect(agent.provider).toBe("claude");
  expect(agent.displayName).toBe("Claude Agent abcdef");
  expect(terminal.displayName).toBe("Terminal abcdef");
  expect(agents).toEqual([agent]);
  expect(terminals).toEqual([terminal]);
  expect(agents[0].updatedAt).toBe(metadata.updatedAt);
  expect(terminals[0]).toHaveProperty("updatedAt");
  expect(metadata.projectName).toBe("hello world 中文");
  expect(metadata.projectPath).toBe("/projects/hello world 中文");
  expect(metadata.type).toBe("agent");
  expect(metadata.runtimeKey).not.toContain(" ");
  expect(metadata.runtimeKey).not.toContain("中文");
});

test("SessionRegistry uses provider profiles for default Agent display names", async () => {
  const registry = new SessionRegistry({
    runDir,
    now: fixedNow,
    createId: () => "agent_display123456",
  });

  const agent = await registry.createAgentSession({ project, provider: "codex" });

  expect(agent.displayName).toBe("Codex Agent displa");
});

test("createRuntimeKey keeps original project names out of runtime resource names", () => {
  const name = createRuntimeKey("hello world 中文", "agent", "codex", "agent_1234567890abcdef");

  expect(name).toStartWith("ar-agent-codex-");
  expect(name).toContain("hello-world");
  expect(name).toContain("agent_123456");
  expect(name).not.toContain("中文");
  expect(name).not.toContain(" ");
});

test("SessionRegistry removes stale metadata when runtime no longer exists", async () => {
  const registry = new SessionRegistry({
    runDir,
    now: fixedNow,
    createId: () => "terminal_stale123456",
    runtime: {
      async exists() {
        return false;
      },
      async close() {},
    },
  });

  await registry.createTerminalSession({ project });
  const sessions = await registry.listTerminalSessions(project.name);
  const missing = await registry.getTerminalSession(project.name, "terminal_stale123456");

  expect(sessions).toEqual([]);
  expect(missing).toBeUndefined();
  await expect(
    readFile(join(runDir, "sessions", "terminal_stale123456.json"), "utf8"),
  ).rejects.toThrow();
});

test("SessionRegistry close terminates runtime and removes metadata", async () => {
  const closed: string[] = [];
  const registry = new SessionRegistry({
    runDir,
    now: fixedNow,
    createId: () => "terminal_close123456",
    runtime: {
      async exists() {
        return true;
      },
      async close(runtimeKey) {
        closed.push(runtimeKey);
      },
    },
  });

  const created = await registry.createTerminalSession({ project });
  const closedSession = await registry.closeTerminalSession(project.name, created.id);
  const sessions = await registry.listTerminalSessions(project.name);

  expect(closed).toEqual([expect.stringContaining("terminal")]);
  expect(closedSession?.status).toBe("closed");
  expect(sessions).toEqual([]);
});

test("SessionRegistry scopes lookups by project and session type", async () => {
  const registry = new SessionRegistry({
    runDir,
    now: fixedNow,
    createId: (type) => (type === "agent" ? "agent_scope123456" : "terminal_scope123456"),
  });

  await registry.createAgentSession({ project, provider: "codex" });
  await registry.createTerminalSession({ project });

  expect(await registry.getAgentSession("other", "agent_scope123456")).toBeUndefined();
  expect(await registry.getTerminalSession(project.name, "agent_scope123456")).toBeUndefined();
  expect(await registry.getAgentSession(project.name, "agent_scope123456")).toMatchObject({
    provider: "codex",
    projectName: project.name,
  });
});

test("SessionRegistry starts Agent sessions through provider-aware runtime seam", async () => {
  const started: string[] = [];
  const registry = new SessionRegistry({
    runDir,
    now: fixedNow,
    createId: () => "agent_start123456",
    runtime: {
      async exists() {
        return true;
      },
      async close() {},
      async startAgent(metadata) {
        started.push(`${metadata.provider}:${metadata.runtimeKey}`);
      },
    },
  });

  const agent = await registry.createAgentSession({ project, provider: "codex" });

  expect(agent.provider).toBe("codex");
  expect(started).toEqual([expect.stringContaining("codex:ar-agent-codex")]);
});

test("SessionRegistry removes Agent metadata when provider runtime is unavailable", async () => {
  const registry = new SessionRegistry({
    runDir,
    now: fixedNow,
    createId: () => "agent_missing123456",
    runtime: {
      async exists() {
        return true;
      },
      async close() {},
      async startAgent() {
        throw new SessionRegistryError(
          "SESSION_PROVIDER_UNAVAILABLE",
          "Agent provider is unavailable",
        );
      },
    },
  });

  await expect(registry.createAgentSession({ project, provider: "claude" })).rejects.toMatchObject({
    code: "SESSION_PROVIDER_UNAVAILABLE",
  });
  await expect(
    readFile(join(runDir, "sessions", "agent_missing123456.json"), "utf8"),
  ).rejects.toThrow();
});

test("SessionRegistry.setModel persists a mid-session model switch to metadata", async () => {
  const registry = new SessionRegistry({
    runDir,
    now: fixedNow,
    createId: () => "agent_setmodel456",
  });

  const agent = await registry.createAgentSession({
    project,
    provider: "claude",
    model: "claude-sonnet-4-6",
  });

  await registry.setModel(agent.id, "claude-haiku-4-5-20251001");

  const metadata = JSON.parse(
    await readFile(join(runDir, "sessions", "agent_setmodel456.json"), "utf8"),
  );
  expect(metadata.model).toBe("claude-haiku-4-5-20251001");
  // setModel only updates model; claudeSessionId is untouched.
  expect(metadata.claudeSessionId).toBeUndefined();
});

test("SessionRegistry.setModel is a no-op when the session metadata file is missing", async () => {
  const registry = new SessionRegistry({ runDir, now: fixedNow });
  await expect(
    registry.setModel("agent_nonexistent_id", "claude-haiku-4-5-20251001"),
  ).resolves.toBeUndefined();
});
