import { expect, test } from "bun:test";
import type { ApprovalRespondRequest } from "@agents-remote/shared";
import { ApprovalCenter } from "./approval-center";
import { ApprovalRegistry, summarizeControlInput, type ApprovalRecord } from "./approval-registry";
import type { ClaudeRuntime } from "./claude-runtime";
import type { SessionRegistry } from "./session-registry";

function makeRecord(overrides: Partial<ApprovalRecord> = {}): ApprovalRecord {
  return {
    runtimeKey: "demo:agent:claude:agent_1",
    projectName: "demo",
    sessionId: "agent_1",
    controlRequestId: "req-1",
    toolName: "Bash",
    input: { command: "npm test" },
    inputSummary: "Bash: npm test",
    createdAt: "2026-09-21T00:00:00.000Z",
    ...overrides,
  };
}

function stubRuntime(aliveKeys: string[]) {
  return {
    listAliveRuntimeKeys: async () => new Set(aliveKeys),
    write: async () => {},
  } as unknown as ClaudeRuntime;
}

function stubRegistry() {
  return {
    getAgentSession: async () => undefined,
    recordActivity: async () => {},
  } as unknown as SessionRegistry;
}

test("summarizeControlInput 语义字段优先 + 截断", () => {
  expect(summarizeControlInput("Bash", { command: "npm  test", a: 1 })).toBe("Bash: npm test");
  expect(summarizeControlInput("Write", { file_path: "/tmp/x.md" })).toBe("Write: /tmp/x.md");
  const long = "x".repeat(120);
  const summary = summarizeControlInput("Bash", { command: long });
  expect(summary.endsWith("…")).toBe(true);
  expect(summary.length).toBeLessThanOrEqual(81);
  expect(summarizeControlInput("AskUserQuestion", { questions: [{ q: 1 }] })).toContain(
    "questions",
  );
});

test("登记/注销/收口/查找全生命周期", () => {
  const reg = new ApprovalRegistry();
  reg.register(makeRecord());
  reg.register(makeRecord({ controlRequestId: "req-2", createdAt: "2026-09-21T01:00:00.000Z" }));
  expect(reg.list()).toHaveLength(2);
  expect(reg.find("demo", "agent_1", "req-1")).toBeDefined();
  expect(reg.find("demo", "agent_1", "nope")).toBeUndefined();
  expect(reg.find("other", "agent_1", "req-1")).toBeUndefined();

  expect(reg.unregister("demo:agent:claude:agent_1", "req-1")).toBe(true);
  expect(reg.unregister("demo:agent:claude:agent_1", "req-1")).toBe(false);
  expect(reg.list()).toHaveLength(1);
  expect(reg.clearRuntime("demo:agent:claude:agent_1")).toBe(true);
  expect(reg.list()).toHaveLength(0);
});

test("clearRuntime 只清该 runtime", () => {
  const reg = new ApprovalRegistry();
  reg.register(makeRecord({ runtimeKey: "a", projectName: "pa", sessionId: "sa" }));
  reg.register(makeRecord({ runtimeKey: "b", projectName: "pb", sessionId: "sb" }));
  reg.clearRuntime("a");
  const rest = reg.list();
  expect(rest).toHaveLength(1);
  expect(rest[0]?.runtimeKey).toBe("b");
});

test("snapshot：判活 + 显示名回填 + 倒序", () => {
  const reg = new ApprovalRegistry();
  reg.register(makeRecord({ controlRequestId: "old", createdAt: "2026-09-20T00:00:00.000Z" }));
  reg.register(makeRecord({ controlRequestId: "new", createdAt: "2026-09-21T01:00:00.000Z" }));
  const summaries = reg.snapshot(new Set(["demo:agent:claude:agent_1"]), () => "Probe Agent");
  expect(summaries).toHaveLength(2);
  expect(summaries[0]?.controlRequestId).toBe("new");
  expect(summaries.every((s) => s.sessionName === "Probe Agent")).toBe(true);
  expect(summaries.every((s) => s.runtimeAlive)).toBe(true);
});

test("ApprovalCenter.respond 三态", async () => {
  const center = new ApprovalCenter(stubRuntime(["demo:agent:claude:agent_1"]), stubRegistry());
  center.registerFromRuntime(
    { runtimeKey: "demo:agent:claude:agent_1", projectName: "demo", sessionId: "agent_1" },
    { request_id: "req-1", request: { tool_name: "Bash", input: { command: "ls" } } },
  );

  const notFound = await center.respond({
    projectName: "demo",
    sessionId: "agent_1",
    controlRequestId: "req-404",
    decision: "allow",
  } satisfies ApprovalRespondRequest);
  expect(notFound).toEqual({ delivered: false, reason: "not_found" });

  const centerDead = new ApprovalCenter(stubRuntime([]), stubRegistry());
  centerDead.registerFromRuntime(
    { runtimeKey: "dead-key", projectName: "demo", sessionId: "agent_1" },
    { request_id: "req-d", request: { tool_name: "Bash", input: {} } },
  );
  const dead = await centerDead.respond({
    projectName: "demo",
    sessionId: "agent_1",
    controlRequestId: "req-d",
    decision: "deny",
  } satisfies ApprovalRespondRequest);
  expect(dead).toEqual({ delivered: false, reason: "runtime_dead" });
  expect(centerDead.registry.list()).toHaveLength(0);

  const centerOk = new ApprovalCenter(stubRuntime(["k1"]), stubRegistry());
  centerOk.registerFromRuntime(
    { runtimeKey: "k1", projectName: "demo", sessionId: "agent_1" },
    { request_id: "req-ok", request: { tool_name: "Bash", input: { command: "ls" } } },
  );
  const ok = await centerOk.respond({
    projectName: "demo",
    sessionId: "agent_1",
    controlRequestId: "req-ok",
    decision: "allow",
  } satisfies ApprovalRespondRequest);
  expect(ok).toEqual({ delivered: true });
});

test("快照带显示名（resolveSessionNames 走 getAgentSession）", async () => {
  const registryStub = {
    getAgentSession: async () => ({ displayName: "Probe A" }),
    recordActivity: async () => {},
  } as unknown as SessionRegistry;
  const center = new ApprovalCenter(stubRuntime(["k1"]), registryStub);
  center.registerFromRuntime(
    { runtimeKey: "k1", projectName: "demo", sessionId: "agent_1" },
    { request_id: "req-s", request: { tool_name: "Bash", input: {} } },
  );
  const snap = await center.snapshot();
  expect(snap).toHaveLength(1);
  expect(snap[0]?.sessionName).toBe("Probe A");
  expect(snap[0]?.runtimeAlive).toBe(true);
});

test("广播：订阅即推全量 + 变更推送", async () => {
  const center = new ApprovalCenter(stubRuntime(["k1"]), stubRegistry());
  const frames: string[] = [];
  const socket = {
    data: undefined,
    send: (msg: string) => frames.push(msg),
    close: () => {},
  };
  center.open(socket);
  await drain();
  expect(frames).toHaveLength(1);
  const first = JSON.parse(frames[0] ?? "{}") as { type: string; approvals: unknown[] };
  expect(first.type).toBe("approvals");
  expect(first.approvals).toHaveLength(0);

  center.registerFromRuntime(
    { runtimeKey: "k1", projectName: "demo", sessionId: "agent_1" },
    { request_id: "req-b", request: { tool_name: "Bash", input: {} } },
  );
  await drain();
  expect(frames).toHaveLength(2);
  const second = JSON.parse(frames[1] ?? "{}") as {
    approvals: Array<{ controlRequestId: string; sessionName: string }>;
  };
  expect(second.approvals).toHaveLength(1);
  expect(second.approvals[0]?.controlRequestId).toBe("req-b");
  expect(second.approvals[0]?.sessionName).toBe("agent_1");
  center.close(socket);
});

function drain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 5));
}
