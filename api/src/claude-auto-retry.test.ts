import { expect, test } from "bun:test";
import {
  AUTO_RETRY_DELAY_MS,
  AUTO_RETRY_MAX_PER_WINDOW,
  AUTO_RETRY_WINDOW_MS,
  buildAutoRetryEchoLine,
  buildAutoRetryUserLine,
  canInject,
  ClaudeAutoRetryWatch,
  isErrorResultLine,
  isNormalAssistantLine,
  pruneWindow,
} from "./claude-auto-retry";

// ── 纯函数：协议行形状（docs/research/claude-cli-stream-protocol.md 实测样本）──

test("isErrorResultLine 只命中 result error，api_retry/interrupted/success 不触发", () => {
  expect(isErrorResultLine({ type: "result", subtype: "error", is_error: true })).toBe(true);
  expect(isErrorResultLine({ type: "result", subtype: "error_max_turns" })).toBe(false);
  expect(isErrorResultLine({ type: "result", subtype: "success" })).toBe(false);
  expect(isErrorResultLine({ type: "result", subtype: "interrupted" })).toBe(false);
  // system/api_retry 是 CLI 自重试（成功则 result success），不是「报错停下」。
  expect(
    isErrorResultLine({ type: "system", subtype: "api_retry", attempt: 1, error: "Overloaded" }),
  ).toBe(false);
  expect(isErrorResultLine(null)).toBe(false);
});

test("isNormalAssistantLine 排除 synthetic / isApiErrorMessage / 顶层 error 注解", () => {
  expect(isNormalAssistantLine({ type: "assistant", model: "claude-sonnet-4-6" })).toBe(true);
  expect(isNormalAssistantLine({ type: "assistant", model: "<synthetic>" })).toBe(false);
  expect(
    isNormalAssistantLine({
      type: "assistant",
      model: "<synthetic>",
      isApiErrorMessage: true,
      error: "server_error",
    }),
  ).toBe(false);
  expect(isNormalAssistantLine({ type: "assistant", error: "server_error" })).toBe(false);
  expect(isNormalAssistantLine({ type: "user" })).toBe(false);
  expect(isNormalAssistantLine(null)).toBe(false);
});

test("pruneWindow 只保留窗口内时间戳", () => {
  const now = 1_000_000;
  expect(pruneWindow([now - 1000, now - 500, now], now, AUTO_RETRY_WINDOW_MS)).toEqual([
    now - 1000,
    now - 500,
    now,
  ]);
  // 恰好 windowMs 前的滑出（now - t < windowMs 严格小于）。
  expect(pruneWindow([now - AUTO_RETRY_WINDOW_MS, now - 1], now, AUTO_RETRY_WINDOW_MS)).toEqual([
    now - 1,
  ]);
});

test("canInject 滚动窗口满 N 次后拒绝", () => {
  const now = 2_000_000;
  expect(canInject([], now, AUTO_RETRY_MAX_PER_WINDOW, AUTO_RETRY_WINDOW_MS)).toBe(true);
  expect(
    canInject(
      [now - 100, now - 200, now - 300],
      now,
      AUTO_RETRY_MAX_PER_WINDOW,
      AUTO_RETRY_WINDOW_MS,
    ),
  ).toBe(false);
  // 旧注入滑出窗口后恢复资格。
  expect(
    canInject(
      [now - AUTO_RETRY_WINDOW_MS - 1, now - 100, now - 200],
      now,
      AUTO_RETRY_MAX_PER_WINDOW,
      AUTO_RETRY_WINDOW_MS,
    ),
  ).toBe(true);
});

test("buildAutoRetryUserLine 与 claude-stream 用户消息转发同构", () => {
  const line = buildAutoRetryUserLine("请继续");
  const parsed = JSON.parse(line) as Record<string, unknown>;
  expect(parsed).toMatchObject({
    type: "user",
    message: { role: "user", content: [{ type: "text", text: "请继续" }] },
  });
  expect(line.endsWith("\n")).toBe(false); // 调用方拼接 \n
});

test("buildAutoRetryEchoLine 带 isUserInput + synthetic uuid（对齐用户消息 echo）", () => {
  const echo = buildAutoRetryEchoLine(buildAutoRetryUserLine("请继续"));
  const parsed = JSON.parse(echo) as Record<string, unknown>;
  expect(parsed.isUserInput).toBe(true);
  expect(String(parsed.uuid)).toMatch(/^injected-/);
});

// ── 状态机：error → 延迟注入 → 正常 assistant 归零；限次；清理 ──
// 定时器用短 delayMs（TICK_MS=10）走真实 setTimeout，验证完整 fire 链路；
// 生产默认 60s（AUTO_RETRY_DELAY_MS）只是常量替换，语义不变。
const TICK_MS = 10;

type Harness = {
  watch: ClaudeAutoRetryWatch;
  clock: { now: number };
  injections: string[];
};

const harness = (
  message: string | undefined,
  overrides?: { maxPerWindow?: number; delayMs?: number },
): Harness => {
  const clock = { now: 1_000_000 };
  const injections: string[] = [];
  const watch = new ClaudeAutoRetryWatch({
    getMessage: () => message,
    inject: (_sessionName, stdinLine) => {
      injections.push(stdinLine);
    },
    now: () => clock.now,
    delayMs: TICK_MS,
    ...overrides,
  });
  return { watch, clock, injections };
};

test("error result 后未到延迟不注入；到达后注入自定义消息", async () => {
  const h = harness("请继续");
  h.watch.handleStdoutLine("s1", "sess1", { type: "result", subtype: "error" });
  expect(h.injections).toHaveLength(0); // 未到延迟

  await Bun.sleep(TICK_MS * 3);
  expect(h.injections).toHaveLength(1);
  expect(JSON.parse(h.injections[0]!) as Record<string, unknown>).toMatchObject({
    type: "user",
    message: { role: "user", content: [{ type: "text", text: "请继续" }] },
  });
});

test("error result 后正常 assistant 先到 → 待发定时器作废（不注入）", async () => {
  const h = harness("请继续");
  h.watch.handleStdoutLine("s1", "sess1", { type: "result", subtype: "error" });
  h.watch.handleStdoutLine("s1", "sess1", { type: "assistant", model: "claude-sonnet-4-6" });
  await Bun.sleep(TICK_MS * 3);
  expect(h.injections).toHaveLength(0);
});

test("注入后正常 assistant 回复 → 成功，计数归零", async () => {
  const h = harness("请继续");
  h.watch.handleStdoutLine("s1", "sess1", { type: "result", subtype: "error" });
  await Bun.sleep(TICK_MS * 3);
  expect(h.injections).toHaveLength(1);

  // 注入后 synthetic 错误注解不算成功（api_error 场景常见）。
  h.watch.handleStdoutLine("s1", "sess1", {
    type: "assistant",
    model: "<synthetic>",
    isApiErrorMessage: true,
    error: "server_error",
  });
  expect(h.watch["states"].get("s1")?.awaitingSuccess).toBe(true);

  // 正常 assistant → awaitingSuccess 消费 → 计数归零。
  h.watch.handleStdoutLine("s1", "sess1", { type: "assistant", model: "claude-sonnet-4-6" });
  expect(h.watch["states"].get("s1")?.injectionTimestamps).toEqual([]);
  expect(h.watch["states"].get("s1")?.awaitingSuccess).toBe(false);
});

test("配置为空（未配置）→ 定时器触发但不注入，不记时间戳", async () => {
  const h = harness(undefined);
  h.watch.handleStdoutLine("s1", "sess1", { type: "result", subtype: "error" });
  await Bun.sleep(TICK_MS * 3);
  expect(h.injections).toHaveLength(0);
  // 未注入则不占用窗口额度。
  expect(h.watch["states"].get("s1")?.injectionTimestamps).toEqual([]);
});

test("pending 存在时重复 error 不叠加调度；用户介入 cancelPending 取消", async () => {
  const h = harness("请继续");
  h.watch.handleStdoutLine("s1", "sess1", { type: "result", subtype: "error" });
  const firstTimer = h.watch["states"].get("s1")?.pendingTimer;
  expect(firstTimer).not.toBeNull();

  h.watch.handleStdoutLine("s1", "sess1", { type: "result", subtype: "error" });
  expect(h.watch["states"].get("s1")?.pendingTimer).toBe(firstTimer); // 不叠加

  h.watch.cancelPending("s1");
  expect(h.watch["states"].get("s1")?.pendingTimer).toBeNull();
  await Bun.sleep(TICK_MS * 3);
  expect(h.injections).toHaveLength(0);
});

test("窗口满后新 error 不调度；窗口滑过恢复资格", async () => {
  const clock = { now: 1_000_000 };
  const injections: string[] = [];
  const watch = new ClaudeAutoRetryWatch({
    getMessage: () => "请继续",
    inject: (_s, line) => {
      injections.push(line);
    },
    now: () => clock.now,
    delayMs: TICK_MS,
    maxPerWindow: 2,
  });
  watch.handleStdoutLine("s1", "sess1", { type: "result", subtype: "error" });
  const state = watch["states"].get("s1")!;
  // 手动灌满窗口（模拟已注入 2 次，绕过 pending 定时器干扰）。
  if (state.pendingTimer) clearTimeout(state.pendingTimer);
  state.pendingTimer = null;
  state.injectionTimestamps = [clock.now - 1000, clock.now - 500];

  watch.handleStdoutLine("s1", "sess1", { type: "result", subtype: "error" });
  expect(state.pendingTimer).toBeNull(); // 窗口满 → 不调度

  // 窗口滑过 → 恢复资格。
  clock.now += AUTO_RETRY_WINDOW_MS + 1;
  watch.handleStdoutLine("s1", "sess1", { type: "result", subtype: "error" });
  expect(state.pendingTimer).not.toBeNull();
});

test("destroySession 清理 pending 定时器（close/respawn/proc.exited 生命周期点）", async () => {
  const h = harness("请继续");
  h.watch.handleStdoutLine("s1", "sess1", { type: "result", subtype: "error" });
  expect(h.watch["states"].get("s1")?.pendingTimer).not.toBeNull();

  h.watch.destroySession("s1");
  expect(h.watch["states"].has("s1")).toBe(false);

  // 销毁后延迟到点也不注入（定时器已清）。
  await Bun.sleep(TICK_MS * 3);
  expect(h.injections).toHaveLength(0);
});

test("正常 assistant 在无状态时（未报错）是 no-op，不建状态", () => {
  const h = harness("请继续");
  h.watch.handleStdoutLine("s1", "sess1", { type: "assistant", model: "claude-sonnet-4-6" });
  expect(h.watch["states"].has("s1")).toBe(false);
});

test("生产默认常量：延迟 60s / 窗口 30min / 上限 3 次", () => {
  expect(AUTO_RETRY_DELAY_MS).toBe(60_000);
  expect(AUTO_RETRY_WINDOW_MS).toBe(30 * 60_000);
  expect(AUTO_RETRY_MAX_PER_WINDOW).toBe(3);
});
