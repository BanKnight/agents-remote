import { describe, expect, test } from "bun:test";

import { nextAgentSessionStatus, spawnInitialStatus } from "./agent-session-status";

describe("nextAgentSessionStatus", () => {
  test("idle + user_input → working", () => {
    expect(nextAgentSessionStatus("idle", { kind: "user_input" })).toBe("working");
  });

  test("done/error + user_input → working(再发消息翻回)", () => {
    expect(nextAgentSessionStatus("done", { kind: "user_input" })).toBe("working");
    expect(nextAgentSessionStatus("error", { kind: "user_input" })).toBe("working");
  });

  test("blocked + user_input 无迁移(OSC 7501 blocked 优先,插话由 CLI 排队)", () => {
    expect(nextAgentSessionStatus("blocked", { kind: "user_input" })).toBeUndefined();
  });

  test("working + user_input 幂等(无迁移)", () => {
    expect(nextAgentSessionStatus("working", { kind: "user_input" })).toBeUndefined();
  });

  test("turn_activity 与 user_input 同迁移表:error/done → working(CLI 自启 turn 翻回),blocked 忽略,working 幂等,closed 吸收", () => {
    expect(nextAgentSessionStatus("error", { kind: "turn_activity" })).toBe("working");
    expect(nextAgentSessionStatus("done", { kind: "turn_activity" })).toBe("working");
    expect(nextAgentSessionStatus("idle", { kind: "turn_activity" })).toBe("working");
    expect(nextAgentSessionStatus("blocked", { kind: "turn_activity" })).toBeUndefined();
    expect(nextAgentSessionStatus("working", { kind: "turn_activity" })).toBeUndefined();
    expect(nextAgentSessionStatus("closed", { kind: "turn_activity" })).toBeUndefined();
  });

  test("turn_continue(TUI PostToolUse 系):blocked/error/done/idle → working,working 幂等,closed 吸收", () => {
    // blocked → working = settled 本源(审批通过工具才执行);error → working = StopFailure
    // 后 CLI 恢复继续跑的自愈(红点滞留到 turn 结束的真根因)。
    expect(nextAgentSessionStatus("blocked", { kind: "turn_continue" })).toBe("working");
    expect(nextAgentSessionStatus("error", { kind: "turn_continue" })).toBe("working");
    expect(nextAgentSessionStatus("done", { kind: "turn_continue" })).toBe("working");
    expect(nextAgentSessionStatus("idle", { kind: "turn_continue" })).toBe("working");
    expect(nextAgentSessionStatus("working", { kind: "turn_continue" })).toBeUndefined();
    expect(nextAgentSessionStatus("closed", { kind: "turn_continue" })).toBeUndefined();
  });

  test("working + approval_requested → blocked;其他态防御性忽略", () => {
    expect(nextAgentSessionStatus("working", { kind: "approval_requested" })).toBe("blocked");
    expect(nextAgentSessionStatus("idle", { kind: "approval_requested" })).toBeUndefined();
    expect(nextAgentSessionStatus("blocked", { kind: "approval_requested" })).toBeUndefined();
    expect(nextAgentSessionStatus("done", { kind: "approval_requested" })).toBeUndefined();
  });

  test("blocked + approval_settled → working;非 blocked 忽略", () => {
    expect(nextAgentSessionStatus("blocked", { kind: "approval_settled" })).toBe("working");
    expect(nextAgentSessionStatus("working", { kind: "approval_settled" })).toBeUndefined();
  });

  test("turn_result:非 closed → done/error;closed 吸收", () => {
    expect(nextAgentSessionStatus("working", { kind: "turn_result", isError: false })).toBe("done");
    expect(nextAgentSessionStatus("blocked", { kind: "turn_result", isError: true })).toBe("error");
    expect(nextAgentSessionStatus("idle", { kind: "turn_result", isError: false })).toBe("done");
    expect(
      nextAgentSessionStatus("closed", { kind: "turn_result", isError: false }),
    ).toBeUndefined();
  });

  test("close:非 closed → closed;closed 幂等", () => {
    expect(nextAgentSessionStatus("working", { kind: "close" })).toBe("closed");
    expect(nextAgentSessionStatus("idle", { kind: "close" })).toBe("closed");
    expect(nextAgentSessionStatus("closed", { kind: "close" })).toBeUndefined();
  });
});

describe("spawnInitialStatus", () => {
  test("落盘 done/error 存活,其余(含存量 running/working/blocked)归 idle", () => {
    expect(spawnInitialStatus("done")).toBe("done");
    expect(spawnInitialStatus("error")).toBe("error");
    expect(spawnInitialStatus("idle")).toBe("idle");
    expect(spawnInitialStatus("running")).toBe("idle");
    expect(spawnInitialStatus("working")).toBe("idle");
    expect(spawnInitialStatus("blocked")).toBe("idle");
  });
});
