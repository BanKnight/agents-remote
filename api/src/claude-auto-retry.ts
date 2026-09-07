// Claude agent 自动重试注入（2026-09-07）：上游网络故障让 turn 以 result error 终止后，
// CLI 进程仍存活但停下来 —— 延迟固定时长向 stdin 注入一条自定义 user 消息让 agent 继续。
// 半小时滚动窗口限注入次数；注入后收到正常 assistant 消息即成功，计数归零。
//
// 检测语义（docs/research/claude-cli-stream-protocol.md）：
// - 触发 = `result` subtype "error"（信封层错误终态）。CLI 自身 api_retry 成功（result
//   success）不触发；interrupted 不触发。
// - 成功 = 非 synthetic 的 assistant 消息（排除 model:"<synthetic>"、isApiErrorMessage、
//   顶层 error 注解——isExternalApiErrorMessage 语义）。
//
// 纯函数可单测；ClaudeAutoRetryWatch 持有 per-session 状态机与注入定时器，由
// ClaudeRuntime 在 processStdoutLine 喂行、在 close/ensureRunning respawn/proc.exited
// 三个生命周期点 destroySession 清理（含 pending 定时器）。

export const AUTO_RETRY_DELAY_MS = 60_000;
export const AUTO_RETRY_WINDOW_MS = 30 * 60_000;
export const AUTO_RETRY_MAX_PER_WINDOW = 3;

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
  /** 所属 session 的 metadata id（fire 时读配置用）。 */
  sessionId: string;
  injectionTimestamps: number[];
  pendingTimer: ReturnType<typeof setTimeout> | null;
  /** 注入已发生、等待正常 assistant 确认成功。 */
  awaitingSuccess: boolean;
};

export type ClaudeAutoRetryWatchOptions = {
  /** 注入时刻读取配置消息（fresh 读——错误到注入的 1 分钟内用户可能刚配上）。空/未配置 → 不注入。 */
  getMessage: (
    sessionName: string,
    sessionId: string,
  ) => string | undefined | Promise<string | undefined>;
  /** 执行注入：写 stdin + relay live echo。实现方自行吞掉进程已死的错误。 */
  inject: (sessionName: string, stdinLine: string, echoLine: string) => void | Promise<void>;
  now?: () => number;
  delayMs?: number;
  windowMs?: number;
  maxPerWindow?: number;
};

export class ClaudeAutoRetryWatch {
  private readonly states = new Map<string, AutoRetryState>();
  private readonly getMessage: ClaudeAutoRetryWatchOptions["getMessage"];
  private readonly inject: ClaudeAutoRetryWatchOptions["inject"];
  private readonly now: () => number;
  private readonly delayMs: number;
  private readonly windowMs: number;
  private readonly maxPerWindow: number;

  constructor(options: ClaudeAutoRetryWatchOptions) {
    this.getMessage = options.getMessage;
    this.inject = options.inject;
    this.now = options.now ?? Date.now;
    this.delayMs = options.delayMs ?? AUTO_RETRY_DELAY_MS;
    this.windowMs = options.windowMs ?? AUTO_RETRY_WINDOW_MS;
    this.maxPerWindow = options.maxPerWindow ?? AUTO_RETRY_MAX_PER_WINDOW;
  }

  // 每条真实新 stdout 行喂入（processStdoutLine 的第 5 个 capture）。回放不经此。
  handleStdoutLine(sessionName: string, sessionId: string, parsed: ParsedLine): void {
    if (isNormalAssistantLine(parsed)) {
      const state = this.states.get(sessionName);
      if (!state) return;
      // 正常 assistant 到达：待发的注入定时器作废（agent 已在响应，无需注入）；
      // awaitingSuccess（注入后首条正常回复）→ 成功，计数归零。
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

    // turn 以 error 终止 = 报错 + 停下来。无待发定时器且滚动窗口未满 → 调度延迟注入。
    const state = this.ensureState(sessionName, sessionId);
    if (state.pendingTimer) return;
    if (!canInject(state.injectionTimestamps, this.now(), this.maxPerWindow, this.windowMs)) {
      return;
    }
    state.pendingTimer = setTimeout(() => {
      void this.fire(sessionName, state);
    }, this.delayMs);
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

  private ensureState(sessionName: string, sessionId: string): AutoRetryState {
    let state = this.states.get(sessionName);
    if (!state) {
      state = {
        sessionId,
        injectionTimestamps: [],
        pendingTimer: null,
        awaitingSuccess: false,
      };
      this.states.set(sessionName, state);
    }
    return state;
  }

  private async fire(sessionName: string, state: AutoRetryState): Promise<void> {
    state.pendingTimer = null;
    const message = await this.getMessage(sessionName, state.sessionId);
    if (!message) return;

    // 时间戳记在注入时刻（真实发生的注入才进滚动窗口）。
    const nowMs = this.now();
    state.injectionTimestamps = [...state.injectionTimestamps, nowMs];
    state.awaitingSuccess = true;

    const userLine = buildAutoRetryUserLine(message);
    await this.inject(sessionName, `${userLine}\n`, buildAutoRetryEchoLine(userLine));
  }
}
