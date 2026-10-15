import { expect, test } from "bun:test";

import { ApprovalCenter } from "./approval-center";

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
