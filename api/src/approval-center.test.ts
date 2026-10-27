import { expect, test } from "bun:test";

import { ApprovalCenter } from "./approval-center";
import type { ApprovalRecord } from "./approval-registry";

// onRuntimeApprovalsSettled 装配(index.ts 接 claudeRuntime.reportApprovalSettled):
// 状态机 blocked → working 的触发源。多卡并存时必须最后一张注销才触发一次。
function makeCenter(): ApprovalCenter {
  // ApprovalCenter 只消费 claudeRuntime 的探活/写与 sessionRegistry 的显示名查询——
  // settled 判定路径两者都不触及，最小 stub 即可。
  return new ApprovalCenter(
    { listAliveRuntimeKeys: async () => new Set() } as never,
    { getAgentSession: async () => undefined } as never,
  );
}

const register = (center: ApprovalCenter, runtimeKey: string, requestId: string) =>
  center.registerFromRuntime(
    { runtimeKey, projectName: "demo", sessionId: "agent_1" },
    { request_id: requestId, request: { tool_name: "Bash", input: { command: "ls" } } },
  );

test("onRuntimeApprovalsSettled: 多卡最后一张注销才触发一次", () => {
  const center = makeCenter();
  const settled: string[] = [];
  center.onRuntimeApprovalsSettled = (runtimeKey) => settled.push(runtimeKey);

  register(center, "rt-key", "req-a");
  register(center, "rt-key", "req-b");

  center.unregisterForwarded("rt-key", "req-a");
  expect(settled).toEqual([]);

  center.unregisterForwarded("rt-key", "req-b");
  expect(settled).toEqual(["rt-key"]);
});

test("onRuntimeApprovalsSettled: clearRuntime 收口触发;其他 runtime 不受影响", () => {
  const center = makeCenter();
  const settled: string[] = [];
  center.onRuntimeApprovalsSettled = (runtimeKey) => settled.push(runtimeKey);

  register(center, "rt-1", "req-a");
  register(center, "rt-2", "req-b");

  center.clearRuntime("rt-1");
  expect(settled).toEqual(["rt-1"]);
});

// ── onApprovalRegistered（PWA 通知批：index.ts 接 pushNotifier.notify("blocked", ...)）──

test("onApprovalRegistered: registerFromRuntime 登记时触发且收到完整 record", () => {
  const center = makeCenter();
  const registered: ApprovalRecord[] = [];
  center.onApprovalRegistered = (record) => registered.push({ ...record });

  center.registerFromRuntime(
    { runtimeKey: "rt-key", projectName: "demo", sessionId: "agent_1" },
    { request_id: "req-a", request: { tool_name: "Bash", input: { command: "ls -la" } } },
  );

  // 每次登记恰好一次回调；record 与登记进 registry 的一致。
  expect(registered).toHaveLength(1);
  const record = registered[0];
  expect(record.runtimeKey).toBe("rt-key");
  expect(record.projectName).toBe("demo");
  expect(record.sessionId).toBe("agent_1");
  expect(record.controlRequestId).toBe("req-a");
  expect(record.toolName).toBe("Bash");
  expect(record.input).toEqual({ command: "ls -la" });
  // inputSummary 由 summarizeControlInput 派生（非空字符串），createdAt 是 ISO 时间。
  expect(typeof record.inputSummary).toBe("string");
  expect((record.inputSummary as string).length).toBeGreaterThan(0);
  expect(Number.isNaN(Date.parse(record.createdAt as string))).toBe(false);

  // record 已进 registry（快照/应答链路可寻址）。
  expect(center.registry.list()).toHaveLength(1);
});

test("onApprovalRegistered: 多卡逐张触发；回调未挂（null）不炸", () => {
  const center = makeCenter();
  const registered: string[] = [];
  center.onApprovalRegistered = (record) => registered.push(record.controlRequestId);

  register(center, "rt-key", "req-a");
  register(center, "rt-key", "req-b");
  expect(registered).toEqual(["req-a", "req-b"]);

  // 默认态（index.ts 未装配 push 时）回调为 null → 登记路径不抛错。
  const bare = makeCenter();
  expect(() => register(bare, "rt-x", "req-c")).not.toThrow();
  expect(bare.registry.list()).toHaveLength(1);
});

// ── §6.5 补强批：复杂审批两类不进中心（与客户端托盘 collectPendingApprovals 同口径）──

test("registerFromRuntime: ExitPlanMode / AskUserQuestion 不登记且不触发 onApprovalRegistered", () => {
  const center = makeCenter();
  const registered: string[] = [];
  center.onApprovalRegistered = (record) => registered.push(record.controlRequestId);

  // respond 的通用 allow（回填原 input）对这两类语义错误 → 登记入口排除。
  center.registerFromRuntime(
    { runtimeKey: "rt-key", projectName: "demo", sessionId: "agent_1" },
    {
      request_id: "req-plan",
      request: { tool_name: "ExitPlanMode", input: { plan: "..." } },
    },
  );
  center.registerFromRuntime(
    { runtimeKey: "rt-key", projectName: "demo", sessionId: "agent_1" },
    {
      request_id: "req-ask",
      request: { tool_name: "AskUserQuestion", input: { questions: [] } },
    },
  );

  expect(center.registry.list()).toHaveLength(0);
  expect(registered).toEqual([]);
});

test("registerFromRuntime: 排除不误伤——混合批次只登记应登记的", () => {
  const center = makeCenter();

  register(center, "rt-key", "req-bash");
  center.registerFromRuntime(
    { runtimeKey: "rt-key", projectName: "demo", sessionId: "agent_1" },
    {
      request_id: "req-ask",
      request: { tool_name: "AskUserQuestion", input: { questions: [] } },
    },
  );

  const cards = center.registry.list();
  expect(cards).toHaveLength(1);
  expect(cards[0]?.controlRequestId).toBe("req-bash");
  expect(cards[0]?.toolName).toBe("Bash");
});

// ── codex 批 provider 化：registerTransport / registerFromTransport / respond 派发 ──

type CodexHarness = {
  center: ApprovalCenter;
  claudeKeys: Set<string>;
  claudeWrites: string[];
  codexKeys: Set<string>;
  codexDeliveries: { runtimeKey: string; controlRequestId: string; decision: string }[];
};

/** claude stub（探活 + write 收集）+ codex transport 钩子（探活 + 投递收集）。 */
function makeDualCenter(): CodexHarness {
  const claudeKeys = new Set<string>();
  const claudeWrites: string[] = [];
  const codexKeys = new Set<string>();
  const codexDeliveries: { runtimeKey: string; controlRequestId: string; decision: string }[] = [];
  const center = new ApprovalCenter(
    {
      listAliveRuntimeKeys: async () => claudeKeys,
      write: async (_key: string, text: string) => {
        claudeWrites.push(text);
      },
    } as never,
    {
      getAgentSession: async () => undefined,
      recordActivity: async () => {},
    } as never,
  );
  center.registerTransport("codex", {
    listAliveRuntimeKeys: async () => codexKeys,
    deliverResponse: async (record, decision) => {
      codexDeliveries.push({
        runtimeKey: record.runtimeKey,
        controlRequestId: record.controlRequestId,
        decision,
      });
    },
  });
  return { center, claudeKeys, claudeWrites, codexKeys, codexDeliveries };
}

const registerCodex = (center: ApprovalCenter, runtimeKey: string, requestId: string) =>
  center.registerFromTransport({
    runtimeKey,
    projectName: "demo",
    sessionId: "codex_1",
    controlRequestId: requestId,
    toolName: "commandExecution",
    input: { command: ["ls", "-la"] },
    inputSummary: "ls -la",
    createdAt: new Date().toISOString(),
    provider: "codex",
  });

test("registerFromTransport: codex record 登记且 provider 字段保留（含 onApprovalRegistered）", () => {
  const { center } = makeDualCenter();
  const registered: ApprovalRecord[] = [];
  center.onApprovalRegistered = (record) => registered.push({ ...record });

  registerCodex(center, "cx-key", "codex:3");

  expect(registered).toHaveLength(1);
  expect(registered[0]?.provider).toBe("codex");
  expect(registered[0]?.toolName).toBe("commandExecution");
  expect(center.registry.list()).toHaveLength(1);
});

test("respond: 按 record.provider 派发——codex 走 codex 钩子、claude 走 claude write", async () => {
  const { center, claudeKeys, codexKeys, claudeWrites, codexDeliveries } = makeDualCenter();
  registerCodex(center, "cx-key", "codex:3");
  center.registerFromRuntime(
    { runtimeKey: "cl-key", projectName: "demo", sessionId: "agent_1" },
    { request_id: "req-a", request: { tool_name: "Bash", input: { command: "ls" } } },
  );
  claudeKeys.add("cl-key");
  codexKeys.add("cx-key");

  const codexResult = await center.respond({
    projectName: "demo",
    sessionId: "codex_1",
    controlRequestId: "codex:3",
    decision: "allow",
  });
  const claudeResult = await center.respond({
    projectName: "demo",
    sessionId: "agent_1",
    controlRequestId: "req-a",
    decision: "deny",
  });

  expect(codexResult).toEqual({ delivered: true });
  expect(codexDeliveries).toEqual([
    { runtimeKey: "cx-key", controlRequestId: "codex:3", decision: "allow" },
  ]);
  // claude 不被误派发到 codex 钩子；control_response 仍走 claude write。
  expect(claudeWrites).toHaveLength(1);
  expect(claudeWrites[0]).toContain('"control_response"');
  expect(claudeWrites[0]).toContain('"behavior":"deny"');
  expect(claudeResult).toEqual({ delivered: true });
  expect(center.registry.list()).toHaveLength(0);
});

test("respond: codex 进程已死 → runtime_dead + 残留卡片清掉", async () => {
  const { center, codexKeys, codexDeliveries } = makeDualCenter();
  registerCodex(center, "cx-key", "codex:5");
  codexKeys.add("other-key"); // cx-key 不在探活集

  const result = await center.respond({
    projectName: "demo",
    sessionId: "codex_1",
    controlRequestId: "codex:5",
    decision: "deny",
  });

  expect(result).toEqual({ delivered: false, reason: "runtime_dead" });
  expect(codexDeliveries).toHaveLength(0);
  expect(center.registry.list()).toHaveLength(0);
});

test("snapshot: aliveKeys 是多 transport 并集（claude + codex 各自判活，dead 打冻结标记不丢弃）", async () => {
  const { center, claudeKeys, codexKeys } = makeDualCenter();
  registerCodex(center, "cx-alive", "codex:1");
  registerCodex(center, "cx-dead", "codex:2");
  register(center, "cl-alive", "req-a");
  register(center, "cl-dead", "req-b");
  claudeKeys.add("cl-alive");
  codexKeys.add("cx-alive");

  const approvals = await center.snapshot();

  // 死进程卡片保留在快照（runtimeAlive=false 冻结展示），活卡按并集判活。
  const byKey = new Map(approvals.map((a) => [a.runtimeKey, a]));
  expect(byKey.get("cx-alive")?.runtimeAlive).toBe(true);
  expect(byKey.get("cx-dead")?.runtimeAlive).toBe(false);
  expect(byKey.get("cl-alive")?.runtimeAlive).toBe(true);
  expect(byKey.get("cl-dead")?.runtimeAlive).toBe(false);
  expect(byKey.get("cx-alive")?.provider).toBe("codex");
  // claude 存量卡无 provider 字段 → 快照投影也不添（缺省 claude 兼容）。
  expect("provider" in byKey.get("cl-alive")!).toBe(false);
});
