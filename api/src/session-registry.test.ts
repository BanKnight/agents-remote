import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
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

test("SessionRegistry.setEffort persists a runtime effort level to metadata", async () => {
  const registry = new SessionRegistry({
    runDir,
    now: fixedNow,
    createId: () => "agent_seteffort789",
  });

  const agent = await registry.createAgentSession({
    project,
    provider: "claude2",
    model: "sonnet",
    effort: "high",
  });

  await registry.setEffort(agent.id, "xhigh");

  const metadata = JSON.parse(
    await readFile(join(runDir, "sessions", "agent_seteffort789.json"), "utf8"),
  );
  expect(metadata.effort).toBe("xhigh");
  // setEffort only updates effort; model is untouched.
  expect(metadata.model).toBe("sonnet");
});

test("SessionRegistry.setEffort is a no-op when the session metadata file is missing", async () => {
  const registry = new SessionRegistry({ runDir, now: fixedNow });
  await expect(registry.setEffort("agent_nonexistent_id", "xhigh")).resolves.toBeUndefined();
});

test("SessionRegistry.renameAgentSession persists new displayName to metadata", async () => {
  const registry = new SessionRegistry({
    runDir,
    now: fixedNow,
    createId: () => "agent_rename123456",
  });

  const agent = await registry.createAgentSession({ project, provider: "claude" });
  const renamed = await registry.renameAgentSession(project.name, agent.id, "我的新会话名");

  expect(renamed?.displayName).toBe("我的新会话名");
  const metadata = JSON.parse(
    await readFile(join(runDir, "sessions", "agent_rename123456.json"), "utf8"),
  );
  expect(metadata.displayName).toBe("我的新会话名");
  expect(metadata.updatedAt).toBe(fixedNow().toISOString());
  // rename 只更新 displayName + updatedAt；其他字段不动。
  expect(metadata.provider).toBe("claude");
  expect(metadata.type).toBe("agent");
});

test("SessionRegistry.renameTerminalSession persists and scopes by project", async () => {
  const registry = new SessionRegistry({
    runDir,
    now: fixedNow,
    createId: () => "terminal_rename123456",
  });

  const terminal = await registry.createTerminalSession({ project });
  const renamed = await registry.renameTerminalSession(project.name, terminal.id, "新终端名");

  expect(renamed?.displayName).toBe("新终端名");
  // 跨 project 改名失败（getMetadata 校验 projectName + type）。
  const crossProject = await registry.renameTerminalSession("other", terminal.id, "不应改");
  expect(crossProject).toBeUndefined();
  // 缺失 session 返回 undefined。
  const missing = await registry.renameTerminalSession(project.name, "nonexistent", "无");
  expect(missing).toBeUndefined();
});

test("SessionRegistry.countSessions does not spawn capture-pane (only needs counts)", async () => {
  let captureCalls = 0;
  const registry = new SessionRegistry({
    runDir,
    now: fixedNow,
    createId: (type) => (type === "agent" ? "agent_count123456" : "terminal_count123456"),
    runtime: {
      async exists() {
        return true;
      },
      async close() {},
      async capture() {
        captureCalls++;
        return "";
      },
    },
  });

  await registry.createAgentSession({ project, provider: "claude" });
  await registry.createTerminalSession({ project });

  // count 只需数量，不应走 listTerminalSessions 的 capture-pane 路径。
  const counts = await registry.countSessions(project.name);

  expect(counts).toEqual({ agentSessionCount: 1, terminalSessionCount: 1 });
  expect(captureCalls).toBe(0);
});

test("SessionRegistry reuses listAliveRuntimeKeys result within TTL cache window", async () => {
  let aliveCalls = 0;
  const registry = new SessionRegistry({
    runDir,
    now: fixedNow,
    createId: () => "terminal_ttl123456",
    runtime: {
      async exists() {
        return true;
      },
      async close() {},
      async listAliveRuntimeKeys() {
        aliveCalls++;
        return new Set<string>();
      },
    },
  });

  await registry.createTerminalSession({ project });
  // 第一次 list：触发 getAliveKeys（miss → listAliveRuntimeKeys，aliveCalls=1，写 TTL 缓存）。
  // 存活集合空 → keepIfRuntimeExists 走新鲜 exists 二次确认（mock=true）保留 entry（不删）。
  await registry.listTerminalSessions(project.name);
  await registry.createTerminalSession({ project });
  // 第二次 list：getAliveKeys TTL 命中（fixedNow 不推进时间），不调 listAliveRuntimeKeys。
  await registry.listTerminalSessions(project.name);

  expect(aliveCalls).toBe(1);
});

test("SessionRegistry keeps claude2 metadata with claudeSessionId even when runtime is dead", async () => {
  const registry = new SessionRegistry({
    runDir,
    now: fixedNow,
    createId: () => "agent_claude2res456",
    runtime: {
      async exists() {
        return false;
      },
      async close() {},
      async listAliveRuntimeKeys() {
        return new Set<string>();
      },
    },
  });

  await registry.createAgentSession({
    project,
    provider: "claude2",
    claudeSessionId: "claude-session-xyz",
  });
  const sessions = await registry.listAgentSessions(project.name);

  // claude2 + claudeSessionId → 即使 runtime 已死也保留（API 重启可 --resume）。
  expect(sessions).toHaveLength(1);
  expect(sessions[0].provider).toBe("claude2");
  expect(sessions[0].claudeSessionId).toBe("claude-session-xyz");
});

test("SessionRegistry listAllCandidates aggregates across projects with terminal subtitle", async () => {
  const captureCalls: string[] = [];
  const registry = new SessionRegistry({
    runDir,
    now: fixedNow,
    createId: (type) => (type === "agent" ? "agent_overview456" : "terminal_overview456"),
    runtime: {
      async exists() {
        return true;
      },
      async close() {},
      async capture(runtimeKey) {
        captureCalls.push(runtimeKey);
        return "user@host:~$ ls -la\r\n";
      },
    },
  });

  const demo = { name: "demo", path: "/projects/demo" };
  const other = { name: "other", path: "/projects/other" };
  await registry.createAgentSession({ project: demo, provider: "claude" });
  await registry.createTerminalSession({ project: other });

  const candidates = await registry.listAllCandidates();

  expect(candidates).toHaveLength(2);
  // 跨 project 聚合：agent 来自 demo、terminal 来自 other。
  const agent = candidates.find((c) => c.type === "agent");
  expect(agent?.projectName).toBe("demo");
  expect(agent?.sessionId).toBe("agent_overview456");
  expect(agent?.provider).toBe("claude");
  // agent 无 subtitle（lastAssistantMessage 未落 metadata）。
  expect(agent?.subtitle).toBeUndefined();
  // terminal subtitle 来自 capture 最后一行非空（lastCommand）。
  const terminal = candidates.find((c) => c.type === "terminal");
  expect(terminal?.projectName).toBe("other");
  expect(terminal?.subtitle).toBe("user@host:~$ ls -la");
  // 仅 terminal 触发 capture（agent 不 capture）。
  expect(captureCalls).toHaveLength(1);
});

test("SessionRegistry keeps live session missing from stale alive snapshot via fresh exists re-check", async () => {
  // #1 回归：aliveCache 快照陈旧（不含刚 spawn 的 session），不得据此 removeMetadata。
  // keepIfRuntimeExists 对快照判死的 entry 做新鲜 exists 二次确认：exists=true → 保留。
  let existsCalls = 0;
  const registry = new SessionRegistry({
    runDir,
    now: fixedNow,
    createId: () => "terminal_live123456",
    runtime: {
      async exists() {
        existsCalls++;
        return true;
      },
      async close() {},
      // 陈旧空快照：不含刚创建的 terminal runtimeKey（模拟 TTL 窗口内 list-sessions 尚未收录）。
      async listAliveRuntimeKeys() {
        return new Set<string>();
      },
    },
  });

  await registry.createTerminalSession({ project });
  const sessions = await registry.listTerminalSessions(project.name);

  // 快照判死，但新鲜 exists=true → 保留，不误删刚创建的 live terminal（旧实现误删回归点）。
  expect(sessions).toHaveLength(1);
  expect(existsCalls).toBeGreaterThanOrEqual(1);
  await expect(
    readFile(join(runDir, "sessions", "terminal_live123456.json"), "utf8"),
  ).resolves.toBeDefined();
});

test("SessionRegistry preserves sessions when alive probe fails (tmux server unavailable)", async () => {
  // #1 空集变体：listAliveRuntimeKeys throw（tmux server 重启中），不得判死批量删 live session。
  const registry = new SessionRegistry({
    runDir,
    now: fixedNow,
    createId: () => "terminal_probe456",
    runtime: {
      async exists() {
        return true;
      },
      async close() {},
      async listAliveRuntimeKeys() {
        throw new Error("tmux: no server");
      },
    },
  });

  await registry.createTerminalSession({ project });
  const sessions = await registry.listTerminalSessions(project.name);

  // 探测不可信 → keepIfRuntimeExists 保守保留（既不 hide 也不删），宁可多显示也不误删。
  expect(sessions).toHaveLength(1);
});

test("recordActivity bumps updatedAt to the minute and short-circuits within the same minute", async () => {
  // 分钟级平滑：updatedAt 截断到整分钟；同分钟截断值不变 → 短路（不写内存、不写盘）；跨分钟才更新。
  let currentTime = new Date("2026-05-25T00:01:30.000Z");
  const registry = new SessionRegistry({
    runDir,
    now: () => currentTime,
    createId: () => "agent_activity123",
  });

  await registry.createAgentSession({ project, provider: "claude" });
  // create 时 updatedAt = now 完整 ISO（含秒，createMetadata 写 updatedAt: timestamp）。
  expect((await registry.getAgentSession(project.name, "agent_activity123"))?.updatedAt).toBe(
    "2026-05-25T00:01:30.000Z",
  );

  // 首次 recordActivity：截断到整分钟，更新内存 index + 落盘。
  await registry.recordActivity("agent_activity123");
  expect((await registry.getAgentSession(project.name, "agent_activity123"))?.updatedAt).toBe(
    "2026-05-25T00:01:00.000Z",
  );
  const statAfterFirst = await stat(join(runDir, "sessions", "agent_activity123.json"));

  // 同分钟（00:01:59）再次 recordActivity：截断值仍 00:01:00 → 短路，mtime 不变（未写盘）。
  currentTime = new Date("2026-05-25T00:01:59.000Z");
  await registry.recordActivity("agent_activity123");
  expect((await registry.getAgentSession(project.name, "agent_activity123"))?.updatedAt).toBe(
    "2026-05-25T00:01:00.000Z",
  );
  const statAfterSame = await stat(join(runDir, "sessions", "agent_activity123.json"));
  expect(statAfterSame.mtimeMs).toBe(statAfterFirst.mtimeMs);

  // 跨分钟（00:02:15）recordActivity：截断到 00:02:00，更新 + 落盘。
  currentTime = new Date("2026-05-25T00:02:15.000Z");
  await registry.recordActivity("agent_activity123");
  expect((await registry.getAgentSession(project.name, "agent_activity123"))?.updatedAt).toBe(
    "2026-05-25T00:02:00.000Z",
  );
});
