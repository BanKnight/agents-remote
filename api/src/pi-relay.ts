import type { RuntimeStream } from "./session-registry";

// 最大 raw live 行保留条数（晚加入订阅者回放上限）。与 ClaudeSessionRelay.LIVE_BUFFER_CAP
// 一致。pi 发 thinking_delta 而非 cumulative thinking_tokens，无需 coalesce，每条都广播。
const LIVE_BUFFER_CAP = 10000;

type Subscriber = {
  onData(line: string): void;
  onError(err: Error): void;
};

// codex 回放行的锚 id（增量回放，claude 的 sinceUuid 同款机制对 codex 行形状的镜像）：
// echo 行取顶层 uuid；codex_event 行仅 item/started|completed（有 params.item.id）可锚。
// 其余行（codex_config / turn/* / delta 类通知）不可锚 → null。解析失败 → null。
function codexLineAnchorId(line: string): string | null {
  try {
    const msg = JSON.parse(line) as {
      type?: unknown;
      uuid?: unknown;
      event?: { method?: unknown; params?: { item?: { id?: unknown } } };
    };
    if (msg.type === "codex_user_echo" && typeof msg.uuid === "string") return msg.uuid;
    if (
      msg.type === "codex_event" &&
      typeof msg.event?.method === "string" &&
      (msg.event.method === "item/started" || msg.event.method === "item/completed") &&
      typeof msg.event.params?.item?.id === "string"
    ) {
      return msg.event.params.item.id;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * PiSessionRelay —— pi 会话的 relay（设计 docs/design-v1/workbench-views.md §3.1）。
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

  addSubscriber(
    onData: (line: string) => void,
    onError: (err: Error) => void,
    opts?: { sinceId?: string },
  ): RuntimeStream {
    // 增量回放（claude locateReplayAnchor 同款结构）：客户端锚仍命中缓冲 → 只发锚后行；
    // miss（缓冲裁剪/进程重启后历史变化）→ 全量回放，客户端按 session_init.replay 复位。
    const anchor = opts?.sinceId ? this.locateReplayAnchor(opts.sinceId) : null;
    const historyFrom = anchor
      ? anchor.buffer === "history"
        ? anchor.index + 1
        : this.historyLines.length
      : 0;
    const liveFrom = anchor && anchor.buffer === "live" ? anchor.index + 1 : 0;
    const historySlice = this.historyLines.slice(historyFrom);
    const liveSlice = this.liveLines.slice(liveFrom);

    const sub: Subscriber = { onData, onError };
    this.subscribers.add(sub);

    try {
      onData(
        JSON.stringify({
          type: "session_init",
          resume: this.resume,
          ...(anchor ? { replay: "delta" } : {}),
        }),
      );
    } catch {
      /* subscriber error shouldn't block replay */
    }

    // 历史（JSONL 定格行，空目录 → count 0，markers 照发让客户端状态机与 claude 共用）；
    // live 锚定时 history 段为空 slice（count 0，客户端零跳变）。
    try {
      onData(JSON.stringify({ type: "history_start", count: historySlice.length }));
      for (const line of historySlice) {
        onData(line);
      }
      onData(JSON.stringify({ type: "history_end" }));
    } catch {
      /* ignore */
    }

    try {
      onData(JSON.stringify({ type: "live_start", count: liveSlice.length }));
      for (const line of liveSlice) {
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

  // Locate the client's anchor id in the replay buffers — mirror of
  // ClaudeSessionRelay.locateReplayAnchor for codex row shapes. Live buffer is
  // scanned FIRST so a row present in both (history/live 边界重叠) pins to the
  // live position and nothing gets sent twice. 键钉死 needle prescreen（security
  // review 2026-10-28：裸值 needle 会与行内自然存在的结构化字符串值碰撞——如
  // item 普遍带 status:"completed"，since=completed 即 prescreen 每行误命中 → 逐行
  // 整行 parse，反复连接可放大成 CPU 消耗面；键钉死后误报归零，与 claude 的
  // `"uuid":"…"` 同款前提）。prescreen 只是快筛，正确性仍由 codexLineAnchorId
  // parse 确认兜底；锚行被 live cap 裁掉 / thread 重启后历史变化 → miss → 全量。
  // 锚 id 来自 URL query param：先验字符集（同 claude 的 UUID 正则校验），非法/
  // 缺失 = 干净的全量回放兜底。
  private locateReplayAnchor(
    sinceId: string,
  ): { buffer: "history" | "live"; index: number } | null {
    if (sinceId.length === 0 || sinceId.length > 128 || !/^[A-Za-z0-9_-]+$/.test(sinceId)) {
      return null;
    }
    // 两类锚行各一 needle：codex_user_echo 顶层 uuid / item params.item.id。
    const needleUuid = `"uuid":"${sinceId}"`;
    const needleId = `"id":"${sinceId}"`;
    const prescreen = (line: string) => line.includes(needleUuid) || line.includes(needleId);
    for (let i = this.liveLines.length - 1; i >= 0; i--) {
      if (prescreen(this.liveLines[i]) && codexLineAnchorId(this.liveLines[i]) === sinceId) {
        return { buffer: "live", index: i };
      }
    }
    for (let i = this.historyLines.length - 1; i >= 0; i--) {
      if (prescreen(this.historyLines[i]) && codexLineAnchorId(this.historyLines[i]) === sinceId) {
        return { buffer: "history", index: i };
      }
    }
    return null;
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
      // 批量裁剪：codex 是 token 级 delta 流，cap 触顶后是稳态热路径——逐条 slice(-CAP)
      // 每条 delta 全量重建数组（perf review P1-1），一次裁 1/16 摊薄均摊成本。
      this.liveLines = this.liveLines.slice(-Math.floor((LIVE_BUFFER_CAP * 15) / 16));
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
