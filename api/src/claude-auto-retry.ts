// Claude agent 自动重试注入（2026-09-07）：上游网络故障让 turn 以 result error 终止后，
// CLI 进程仍存活但停下来 —— 延迟固定时长向 stdin 注入一条自定义 user 消息让 agent 继续。
// 滚动窗口限注入次数；注入后收到正常 assistant 消息即成功，计数归零。
//
// 检测语义（docs/research/claude-cli-stream-protocol.md）：
// - 触发 = `result` subtype "error"（信封层错误终态）。CLI 自身 api_retry 成功（result
//   success）不触发；interrupted 不触发。
// - 成功 = 非 synthetic 的 assistant 消息（排除 model:"<synthetic>"、isApiErrorMessage、
//   顶层 error 注解——isExternalApiErrorMessage 语义）。
//
// 配置语义：per-session ClaudeAutoRetryConfig（shared），**默认关**——enabled:false 或未
// 配置完全不调度。调度前 fresh 读 config（错误到注入的间隔内用户可能刚改配置）；fire 用
// 调度时捕获的 config（等待中改配置下一轮生效）。
//
// 纯函数可单测；ClaudeAutoRetryWatch 持有 per-session 状态机与注入定时器，由
// ClaudeRuntime 在 processStdoutLine 喂行、在 close/ensureRunning respawn/proc.exited
// 三个生命周期点 destroySession 清理（含 pending 定时器）。

import { type ClaudeAutoRetryConfig } from "@agents-remote/shared";

export const AUTO_RETRY_DELAY_MS = 60_000;
export const AUTO_RETRY_WINDOW_MS = 30 * 60_000;
export const AUTO_RETRY_MAX_PER_WINDOW = 3;

// normalizeAutoRetryConfig 的 clamp 边界（防手输/恶意 payload 出格值拖垮定时器或窗口语义）。
export const AUTO_RETRY_DELAY_MS_MIN = 5_000;
export const AUTO_RETRY_DELAY_MS_MAX = 3_600_000;
export const AUTO_RETRY_MAX_PER_WINDOW_MIN = 1;
export const AUTO_RETRY_MAX_PER_WINDOW_MAX = 20;
export const AUTO_RETRY_WINDOW_MS_MIN = 60_000;
export const AUTO_RETRY_WINDOW_MS_MAX = 86_400_000;

type ParsedLine = Record<string, unknown> | null;

export function isErrorResultLine(parsed: ParsedLine): boolean {
  return parsed?.type === "result" && parsed.subtype === "error";
}

export function isNormalAssistantLine(parsed: ParsedLine): boolean {
  if (parsed?.type !== "assistant") return false;
  if (parsed.model === "<synthetic>") return false;
  if (parsed.isApiErrorMessage === true) return false;
  if (typeof parsed.error === "string" && parsed.error.length > 0) return false;
  return true;
}

// 滚动窗口裁剪：只保留 [now-windowMs, now] 内的时间戳。
export function pruneWindow(timestamps: number[], nowMs: number, windowMs: number): number[] {
  return timestamps.filter((t) => nowMs - t < windowMs);
}

export function canInject(
  timestamps: number[],
  nowMs: number,
  maxPerWindow: number,
  windowMs: number,
): boolean {
  return pruneWindow(timestamps, nowMs, windowMs).length < maxPerWindow;
}

// 路由入口归一化：非法/出格值 clamp 到边界而非拒绝（配置是尽力而为的自动化辅助，
// 拒绝整笔请求只为一个出格数字不划算）。message trim；enabled 强转 boolean。
export function normalizeAutoRetryConfig(raw: unknown): ClaudeAutoRetryConfig {
  const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    enabled: r.enabled === true,
    message: typeof r.message === "string" ? r.message.trim() : "",
    delayMs: clamp(
      typeof r.delayMs === "number" && Number.isFinite(r.delayMs)
        ? Math.round(r.delayMs)
        : AUTO_RETRY_DELAY_MS,
      AUTO_RETRY_DELAY_MS_MIN,
      AUTO_RETRY_DELAY_MS_MAX,
    ),
    maxPerWindow: clamp(
      typeof r.maxPerWindow === "number" && Number.isFinite(r.maxPerWindow)
        ? Math.round(r.maxPerWindow)
        : AUTO_RETRY_MAX_PER_WINDOW,
      AUTO_RETRY_MAX_PER_WINDOW_MIN,
      AUTO_RETRY_MAX_PER_WINDOW_MAX,
    ),
    windowMs: clamp(
      typeof r.windowMs === "number" && Number.isFinite(r.windowMs)
        ? Math.round(r.windowMs)
        : AUTO_RETRY_WINDOW_MS,
      AUTO_RETRY_WINDOW_MS_MIN,
      AUTO_RETRY_WINDOW_MS_MAX,
    ),
  };
}

// 注入消息 stdin 行（与 claude-stream.ts 用户消息转发同构：type:user + content text）。
export function buildAutoRetryUserLine(message: string): string {
  return JSON.stringify({
    type: "user",
    message: { role: "user", content: [{ type: "text", text: message }] },
  });
}

// 注入消息的 live echo（与 claude-stream.ts 用户消息 echo 同构：isUserInput + synthetic uuid，
// CLI 从不在 stream-json stdout 回显用户输入，echo 供当前与重连后的订阅者看到注入）。
export function buildAutoRetryEchoLine(userLine: string): string {
  return JSON.stringify({
    ...JSON.parse(userLine),
    isUserInput: true,
    uuid: `injected-${crypto.randomUUID()}`,
  });
}

type AutoRetryState = {
  /** 所属 session 的 metadata id（读配置用）。 */
  sessionId: string;
  injectionTimestamps: number[];
  pendingTimer: ReturnType<typeof setTimeout> | null;
  /** 调度防重：getConfig 为 async，await 间隙内重复 error 不叠加调度。 */
  scheduling: boolean;
  /** 调度代数：重置事件（正常 assistant / 用户介入 / 销毁）递增，作废 in-flight 调度。 */
  gen: number;
  /** 注入已发生、等待正常 assistant 确认成功。 */
  awaitingSuccess: boolean;
};

export type ClaudeAutoRetryWatchOptions = {
  /** 调度时刻读取配置（fresh 读）。缺省/enabled:false → 完全不调度（默认关）。 */
  getConfig: (
    sessionName: string,
    sessionId: string,
  ) => ClaudeAutoRetryConfig | undefined | Promise<ClaudeAutoRetryConfig | undefined>;
  /** 执行注入：写 stdin + relay live echo。实现方自行吞掉进程已死的错误。 */
  inject: (sessionName: string, stdinLine: string, echoLine: string) => void | Promise<void>;
  now?: () => number;
};

export class ClaudeAutoRetryWatch {
  private readonly states = new Map<string, AutoRetryState>();
  private readonly getConfig: ClaudeAutoRetryWatchOptions["getConfig"];
  private readonly inject: ClaudeAutoRetryWatchOptions["inject"];
  private readonly now: () => number;

  constructor(options: ClaudeAutoRetryWatchOptions) {
    this.getConfig = options.getConfig;
    this.inject = options.inject;
    this.now = options.now ?? Date.now;
  }

  // 每条真实新 stdout 行喂入（processStdoutLine 的第 5 个 capture）。回放不经此。
  handleStdoutLine(sessionName: string, sessionId: string, parsed: ParsedLine): void {
    if (isNormalAssistantLine(parsed)) {
      const state = this.states.get(sessionName);
      if (!state) return;
      // 正常 assistant 到达：待发的注入定时器作废（agent 已在响应，无需注入）——
      // gen 递增同时作废 in-flight 的 async schedule；awaitingSuccess（注入后首条
      // 正常回复）→ 成功，计数归零。
      state.gen += 1;
      if (state.pendingTimer) {
        clearTimeout(state.pendingTimer);
        state.pendingTimer = null;
      }
      if (state.awaitingSuccess) {
        state.injectionTimestamps = [];
        state.awaitingSuccess = false;
      }
      return;
    }

    if (!isErrorResultLine(parsed)) return;

    // turn 以 error 终止 = 报错 + 停下来。fresh 读 config（可能 async）后决定是否调度；
    // scheduling 标志在 await 间隙挡住重复 error 的叠加调度。
    const state = this.ensureState(sessionName, sessionId);
    if (state.pendingTimer || state.scheduling) return;
    state.scheduling = true;
    void this.schedule(sessionName, sessionId, state);
  }

  // 用户手动介入（runtime.write 被外部调用）：取消待发的注入，不与用户输入叠加。
  cancelPending(sessionName: string): void {
    const state = this.states.get(sessionName);
    if (state?.pendingTimer) {
      clearTimeout(state.pendingTimer);
      state.pendingTimer = null;
    }
  }

  // 生命周期清理（close / ensureRunning respawn / proc.exited）：定时器 + 状态全清。
  destroySession(sessionName: string): void {
    const state = this.states.get(sessionName);
    if (!state) return;
    if (state.pendingTimer) clearTimeout(state.pendingTimer);
    this.states.delete(sessionName);
  }

  private async schedule(
    sessionName: string,
    sessionId: string,
    state: AutoRetryState,
  ): Promise<void> {
    const gen = state.gen;
    try {
      const config = await this.getConfig(sessionName, sessionId);
      // 调度间隙发生重置事件（正常 assistant 到达）→ 本次调度作废。
      if (gen !== state.gen) return;
      // 默认关：未配置 / enabled:false / 文案为空 → 不调度。
      if (!config || !config.enabled || !config.message.trim()) return;

      if (
        state.pendingTimer ||
        !canInject(state.injectionTimestamps, this.now(), config.maxPerWindow, config.windowMs)
      ) {
        return;
      }
      state.pendingTimer = setTimeout(() => {
        void this.fire(sessionName, state, config);
      }, config.delayMs);
    } finally {
      state.scheduling = false;
    }
  }

  private async fire(
    sessionName: string,
    state: AutoRetryState,
    config: ClaudeAutoRetryConfig,
  ): Promise<void> {
    state.pendingTimer = null;
    // 等待中配置被关掉/清空 → 不注入（下一轮 error 重新走 schedule fresh 读）。
    if (!config.enabled || !config.message.trim()) return;

    // 时间戳记在注入时刻（真实发生的注入才进滚动窗口）。
    const nowMs = this.now();
    state.injectionTimestamps = [...state.injectionTimestamps, nowMs];
    state.awaitingSuccess = true;

    const userLine = buildAutoRetryUserLine(config.message);
    await this.inject(sessionName, `${userLine}\n`, buildAutoRetryEchoLine(userLine));
  }

  private ensureState(sessionName: string, sessionId: string): AutoRetryState {
    let state = this.states.get(sessionName);
    if (!state) {
      state = {
        sessionId,
        injectionTimestamps: [],
        pendingTimer: null,
        scheduling: false,
        gen: 0,
        awaitingSuccess: false,
      };
      this.states.set(sessionName, state);
    }
    return state;
  }
}
