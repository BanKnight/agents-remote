import type { RuntimeStream } from "./session-registry";

// 最大 raw live 行保留条数（晚加入订阅者回放上限）。与 ClaudeSessionRelay.LIVE_BUFFER_CAP
// 一致。pi 发 thinking_delta 而非 cumulative thinking_tokens，无需 coalesce，每条都广播。
const LIVE_BUFFER_CAP = 10000;

type Subscriber = {
  onData(line: string): void;
  onError(err: Error): void;
};

/**
 * PiSessionRelay —— pi 会话的 relay（设计 docs/design/workbench-views.md §3.1）。
 *
 * 镜像 {@link ClaudeSessionRelay} 的 addSubscriber/broadcast/destroy/reportError 表面，
 * 但 **pi 原生**：不 coalesce thinking_tokens（pi 事件流发 thinking_delta，每个都要广播）。
 *
 * 传输层与 claude 字节级一致（session_init/history_start/end/live_start/end 批处理
 * markers + `ended` 控制帧，由 pi-stream 用 createBatchEmitter 打包），差别只在 payload：
 * pi 发 `{type:"pi_event",...}` / `{type:"pi_user_echo",...}` 原生帧。
 *
 * 历史回放（Phase 4）：runtime 在 ensureRunning 时 {@link loadHistory} 定格 JSONL 回放行
 * （activate 时刻语义——之后 JSONL 持续 append 但 historyLines 不刷新，新消息只进 live
 * buffer；与 claude relay 的 history/live 双缓冲一致）。内存 live buffer 即本进程存活期
 * 状态，跨重启历史靠 loadHistory 从磁盘重建。
 */
export class PiSessionRelay {
  private historyLines: string[] = [];
  private liveLines: string[] = [];
  private subscribers = new Set<Subscriber>();
  private resume = false;
  private destroyed = false;

  constructor() {
    // no-op
  }

  setResume(resume: boolean): void {
    this.resume = resume;
  }

  /** 定格历史回放行（ensureRunning 时一次性调用；再次调用覆盖，幂等供测试）。 */
  loadHistory(lines: string[]): void {
    this.historyLines = lines;
  }

  addSubscriber(onData: (line: string) => void, onError: (err: Error) => void): RuntimeStream {
    const sub: Subscriber = { onData, onError };
    this.subscribers.add(sub);

    try {
      onData(JSON.stringify({ type: "session_init", resume: this.resume }));
    } catch {
      /* subscriber error shouldn't block replay */
    }

    // 历史（JSONL 定格行，空目录 → count 0，markers 照发让客户端状态机与 claude 共用）。
    try {
      onData(JSON.stringify({ type: "history_start", count: this.historyLines.length }));
      for (const line of this.historyLines) {
        onData(line);
      }
      onData(JSON.stringify({ type: "history_end" }));
    } catch {
      /* ignore */
    }

    try {
      onData(JSON.stringify({ type: "live_start", count: this.liveLines.length }));
      for (const line of this.liveLines) {
        onData(line);
      }
      onData(JSON.stringify({ type: "live_end" }));
    } catch {
      /* ignore */
    }

    return {
      close: () => {
        this.subscribers.delete(sub);
      },
    };
  }

  /**
   * 入 live 缓冲 + 广播：pi 事件与 user echo 都走这里——当前订阅者实时收到、
   * 后续订阅者从 live batch 回放。这是 pi 消息进状态的主通道（镜像 claude 的
   * handleStdoutLine / injectLiveLine 落 buffer 语义）。
   */
  appendAndBroadcast(line: string): void {
    this.liveLines.push(line);
    this.capLive();
    this.broadcast(line);
  }

  /**
   * 仅广播、不回放（live 缓冲不入列）：`ended` 等瞬态控制帧用。若是 pi 事件流里需要
   * 被重连者看到的行，必须走 {@link appendAndBroadcast}。
   */
  broadcastOnly(line: string): void {
    this.broadcast(line);
  }

  reportError(error: Error): void {
    for (const sub of this.subscribers) {
      try {
        sub.onError(error);
      } catch {
        /* ignore */
      }
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.historyLines = [];
    this.liveLines = [];
    this.subscribers.clear();
  }

  get isDestroyed(): boolean {
    return this.destroyed;
  }

  /** 有订阅者（有人连着看）——chat-idle-recycler 的 active 判据之一。 */
  get hasSubscribers(): boolean {
    return this.subscribers.size > 0;
  }

  private capLive(): void {
    if (this.liveLines.length > LIVE_BUFFER_CAP) {
      this.liveLines = this.liveLines.slice(-LIVE_BUFFER_CAP);
    }
  }

  private broadcast(line: string): void {
    for (const sub of this.subscribers) {
      try {
        sub.onData(line);
      } catch {
        /* subscriber error shouldn't crash others */
      }
    }
  }
}
