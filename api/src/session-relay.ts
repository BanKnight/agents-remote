import { closeSync, fstatSync, openSync, readFileSync, readSync } from "node:fs";
import {
  COMPACT_BOUNDARY_SUBTYPES,
  isCompactBoundarySubtype,
  type ClaudeQueuedCommand,
} from "@agents-remote/shared";
import { claudeJsonlPath } from "./session-routes";
import type { RuntimeStream } from "./session-registry";

// Maximum raw stdout lines retained in the live replay buffer for late
// subscribers. Bounds memory on long-lived sessions; consecutive thinking_tokens
// are coalesced (see appendLive) so a single thinking phase no longer dominates.
const LIVE_BUFFER_CAP = 10000;

// Only the trailing bytes of the JSONL are read to locate the last compact
// boundary. The replayed block (last boundary → EOF) is typically < 2MB, so 8MB
// covers it with headroom. Reading the whole (often 100MB+) file just to use
// that small tail would block the event loop on the resume-activation critical
// path; boundaries older than this window fall back to a full read (unchanged
// behavior for the rare over-window block / never-compacted session).
export const HISTORY_TAIL_SCAN_BYTES = 8 * 1024 * 1024;

type Subscriber = {
  onData(line: string): void;
  onError(err: Error): void;
};

// 锚命中的顶层确认：行 JSON 的顶层 uuid 字段确为锚值（防 needle 命中嵌套字段）。
function topLevelUuidIs(line: string, uuid: string): boolean {
  try {
    return (JSON.parse(line) as { uuid?: unknown }).uuid === uuid;
  } catch {
    return false;
  }
}

/**
 * CLI 双出口对 MCP 工具结果的结构化载荷形状不同:stdout(live 路径)顶层
 * `tool_use_result`(snake)是 envelope 对象,structuredContent 键在
 * `tool_use_result.structuredContent`(web MCP Apps 卡片的唯一消费位);JSONL
 * (history 回放路径)顶层 `toolUseResult`(camel)是 structuredContent 直接
 * JSON.stringify 的**字符串**(另有 `mcpMeta.structuredContent` 对象)。不归一 =
 * API 重启后从 JSONL 回放的 MCP 卡全部丢 structuredContent、走通用卡回退——live
 * 正常、replay 退化的时序型失真(2026-10-21 README 卡实测实锤:live 渲染成功,
 * 重启后回放走通用卡)。
 * 在回放入口把 JSONL 行补齐成 live 形状——单一管道原则,web 客户端零分支。
 * 返回归一化后的行;无需归一化(mcpMeta 缺失 / live 形状已在)时原样返回。
 */
export function normalizeHistoryMcpLine(parsed: Record<string, unknown>, rawLine: string): string {
  const mcpMeta = parsed.mcpMeta as { structuredContent?: unknown } | undefined;
  if (!mcpMeta || mcpMeta.structuredContent === undefined) return rawLine;
  const toolUseResult = parsed.tool_use_result as Record<string, unknown> | undefined;
  if (toolUseResult?.structuredContent !== undefined) return rawLine;
  return JSON.stringify({
    ...parsed,
    // camel `toolUseResult` 是 sc 的字符串序列化,web 端 `toolUseResult ??
    // tool_use_result` 优先取 camel → structuredResult 停在 string → 投影的
    // `typeof === "object"` 闸不命中、sc 丢失。undefined 值经 stringify 整键删除。
    toolUseResult: undefined,
    tool_use_result: { ...toolUseResult, structuredContent: mcpMeta.structuredContent },
  });
}

export class ClaudeSessionRelay {
  private historyLines: string[] = [];
  private liveLines: string[] = [];
  private subscribers = new Set<Subscriber>();
  private phase: "init" | "active" | "destroyed" = "init";
  private activatePromise: Promise<void> | null = null;
  private activationError: Error | null = null;
  private projectPath = "";
  private claudeSessionId: string | undefined;
  private startedAsResume = false;
  // Server-maintained prompt queue (queue-state serverization). The CLI emits
  // queued/started lifecycle frames only at turn boundaries — during a running
  // turn there is zero queue telemetry — so the write gate (reportUserInput)
  // books prompts here while the turn is busy, and lifecycle frames drive
  // removal. Mirrors injectLiveLine's "CLI has no telemetry → api keeps the
  // state" pattern so every client (any device, any reconnect) sees the same
  // queue via queue_state snapshots.
  private queuedCommands: ClaudeQueuedCommand[] = [];
  // 停止冻结队列（M2）：queue_hold 把 queuedCommands 整体挪入这里（CLI 侧已清），
  // 条目保存在服务端可恢复/放弃。销毁时随队列一起清空（同 queuedCommands 惯例：
  // 进程换代 = 冻结态作废）。
  private heldCommands: ClaudeQueuedCommand[] = [];
  // 排队消息的挂起 live echo（uuid → echo 行）：排队期间聊天流不显示该消息（单点呈现
  // = queue chip），echo 延迟到 command_lifecycle started（CLI 出队开始执行）时经
  // injectLiveLine 补入——与 JSONL 权威语义对齐（CLI 出队执行时才写 user 行，回放一致）。
  // cancelled/completed/hold 冻结 = 条目作废，挂起 echo 一并丢弃（气泡不出现）。
  private pendingEchoes = new Map<string, string>();

  async activate(projectPath: string, claudeSessionId: string | undefined): Promise<void> {
    if (this.phase !== "init") return;
    if (this.activatePromise) return this.activatePromise;

    this.projectPath = projectPath;
    this.claudeSessionId = claudeSessionId;
    this.startedAsResume = Boolean(claudeSessionId);
    this.activatePromise = this.doActivate();
    return this.activatePromise;
  }

  setClaudeSessionId(projectPath: string, claudeSessionId: string): void {
    this.projectPath = projectPath;
    this.claudeSessionId = claudeSessionId;
  }

  /**
   * fork 回滚专用：CLI fork 完成（新 claudeSessionId 已知、新 JSONL 已写入截断后的对话）
   * 后重读 history 段。fork spawn 时新 id 未知只能空激活；必须在订阅者接入前调用
   *（回滚编排先关 WS 再 respawn，重连发生在 reload 之后）。startedAsResume 翻 true →
   * 后续 session_init{resume:true} 语义正确。
   */
  reloadHistory(projectPath: string, claudeSessionId: string): void {
    this.projectPath = projectPath;
    this.claudeSessionId = claudeSessionId;
    this.startedAsResume = true;
    this.historyLines = this.readHistoryFromJsonl();
  }

  /** 订阅不得早于激活落定（不变量守卫）。doActivate 目前全同步——activate() 同一
   *  tick 内 activatePromise 即落定，「pending」态不可观测，正常路径的 await 只是
   *  一个已 resolve 的微任务；此守卫在 doActivate 未来引入 await（如 JSONL 读异步化）
   *  时自动生效：否则 phase=init 期间 addSubscriber 会发出「full 回放但缓冲全空」，
   *  且激活完成后不向既有 subscriber 补发。（activatePromise 为 null = activate 尚未
   *  被调用，不阻塞。） */
  ensureActive(): Promise<void> {
    return this.activatePromise ?? Promise.resolve();
  }

  addSubscriber(
    onData: (line: string) => void,
    onError: (err: Error) => void,
    seedInitLine?: string,
    opts?: { sinceUuid?: string },
  ): RuntimeStream {
    if (this.activationError) {
      onError(this.activationError);
      return { close: () => {} };
    }

    // Incremental replay: if the client's anchor uuid (last message it already
    // holds) is still in a replay buffer, resend only the lines AFTER it. Miss
    // (buffer trimmed / compact / process restart) falls back to a full replay —
    // the client resets and rebuilds exactly as it did before this feature.
    const anchor = opts?.sinceUuid ? this.locateReplayAnchor(opts.sinceUuid) : null;
    const historyFrom = anchor
      ? anchor.buffer === "history"
        ? anchor.index + 1
        : this.historyLines.length
      : 0;
    const liveFrom = anchor && anchor.buffer === "live" ? anchor.index + 1 : 0;
    const historySlice = this.historyLines.slice(historyFrom);
    const liveSlice = this.liveLines.slice(liveFrom);

    console.log(
      `[relay] addSubscriber: phase=${this.phase} history=${this.historyLines.length} live=${this.liveLines.length} replay=${anchor ? `delta(history+${historySlice.length}/live+${liveSlice.length})` : "full"}`,
    );

    const sub: Subscriber = { onData, onError };
    this.subscribers.add(sub);

    // Connection-level metadata — sent before any batch so the client knows
    // whether this is a resume (history may contain orphaned tool_use) and
    // whether the batches that follow are a delta (it must keep its state and
    // append) or a full replay (it resets). anchor tells the client which
    // buffer its anchor landed in: delta + history = the live segment restarted
    // (process died — old live lines froze into JSONL), so the client voids
    // unresolved controlRequests from its pre-reconnect state. Older clients
    // ignore the field.
    try {
      onData(
        JSON.stringify({
          type: "session_init",
          resume: this.startedAsResume,
          replay: anchor ? "delta" : "full",
          anchor: anchor?.buffer ?? null,
        }),
      );
    } catch {
      /* subscriber error shouldn't block replay */
    }

    // Scalar seed init: replayed before history so the client's scalar fold has a
    // seed even though system.init is stdout-only (absent from JSONL/tail). Must
    // follow session_init (client resets on session_init) and precede history_start
    // (else it'd be gzipped into the batch). See docs/design-v1/message-replay.md.
    if (seedInitLine) {
      try {
        onData(seedInitLine);
      } catch {
        /* subscriber error shouldn't block replay */
      }
    }

    // Always send history batch (count may be 0 for new sessions — and for a
    // live-anchored delta, where nothing between history_start/end is resent)
    onData(JSON.stringify({ type: "history_start", count: historySlice.length }));
    for (const line of historySlice) {
      try {
        onData(line);
      } catch {
        /* subscriber error shouldn't block replay */
      }
    }
    onData(JSON.stringify({ type: "history_end" }));

    // Always send live batch (count may be 0)
    onData(JSON.stringify({ type: "live_start", count: liveSlice.length }));
    for (const line of liveSlice) {
      try {
        onData(line);
      } catch {
        /* subscriber error shouldn't block replay */
      }
    }
    onData(JSON.stringify({ type: "live_end" }));

    // Queue seed snapshot, after live_end: the client resets its state on
    // session_init and folds replayed frames, so the snapshot must arrive last
    // or the reset would wipe it. Unlike lifecycle telemetry these snapshots
    // are not buffered anywhere — they exist only as broadcast moments, so a
    // reconnecting client would otherwise see zero queue state (exactly the
    // gap this feature closes). Sent unconditionally: on the delta replay path
    // (live anchor still in buffer, no client reset) a queue drained during the
    // disconnect has no other frame to clear stale chips — the empty snapshot
    // IS the correction. ~40B on the common empty path.
    try {
      onData(this.queueStateLine());
    } catch {
      /* subscriber error shouldn't block replay */
    }
    // 冻结快照同款种子语义（同 queue_state：broadcast-only、重连必须最后补发）。
    // 客户端只在本地有未确认停止时把该帧当停止回执（防重连种子误收口 running）。
    try {
      onData(this.queueHeldLine());
    } catch {
      /* subscriber error shouldn't block replay */
    }

    return {
      close: () => {
        this.subscribers.delete(sub);
      },
    };
  }

  // Locate the client's anchor uuid in the replay buffers by plain string scan —
  // zero extra index state to keep in sync. Live buffer is scanned FIRST so a uuid
  // present in both (compact-boundary overlap between history tail and live) pins
  // to the live position and nothing gets sent twice. Returns null on miss → full
  // replay. The uuid comes from a URL query param: validate its charset first so
  // the search needle can't be spoofed with quotes; any invalid/missing uuid is a
  // clean full-replay fallback.
  private locateReplayAnchor(
    sinceUuid: string,
  ): { buffer: "history" | "live"; index: number } | null {
    if (sinceUuid.length === 0 || sinceUuid.length > 128 || !/^[A-Za-z0-9_-]+$/.test(sinceUuid)) {
      return null;
    }
    const needle = `"uuid":"${sinceUuid}"`;
    for (let i = this.liveLines.length - 1; i >= 0; i--) {
      // 命中后 parse 确认顶层 uuid——子串可能出现在更晚行的嵌套结构里（错锚会造成
      // 缺口：跳过的行客户端没有、去重防线补不了）。每连接至多几次 parse，可忽略。
      if (this.liveLines[i].includes(needle) && topLevelUuidIs(this.liveLines[i], sinceUuid)) {
        return { buffer: "live", index: i };
      }
    }
    for (let i = this.historyLines.length - 1; i >= 0; i--) {
      if (
        this.historyLines[i].includes(needle) &&
        topLevelUuidIs(this.historyLines[i], sinceUuid)
      ) {
        return { buffer: "history", index: i };
      }
    }
    return null;
  }

  // `parsed` lets the caller (readStdout) reuse a single parse across all three
  // consumers (capture functions + this) instead of JSON.parsing each line three
  // times. Undefined ⇒ parse here (direct/test callers); null ⇒ caller already
  // tried and failed, so skip the system inspection entirely.
  async handleStdoutLine(line: string, parsed?: Record<string, unknown> | null): Promise<void> {
    await this.activatePromise;
    if (this.isDestroyed) return;

    let msg: Record<string, unknown> | null;
    if (parsed === undefined) {
      try {
        msg = JSON.parse(line) as Record<string, unknown>;
      } catch {
        msg = null;
      }
    } else {
      msg = parsed;
    }

    // Lifecycle frames drive queue-bookkeeping removal: queued only confirms
    // the CLI accepted the command (keep the entry — during a running turn
    // this frame arrives at the turn boundary, after seconds of queueing),
    // while started/completed/cancelled mean the command left the pending
    // queue (remove + rebroadcast). cancelled is what naturally empties the
    // queue on cancel_queued (one frame per cleared command) — no need to
    // parse control_response. Unknown uuids are a no-op: the idle-path gate
    // never books (CLI executes immediately), so its frames find nothing.
    if (msg?.type === "command_lifecycle") {
      const state = msg.state as string | undefined;
      const commandUuid = msg.command_uuid as string | undefined;
      if (state && state !== "queued" && commandUuid) {
        // 出队补 echo（单点呈现）：started = CLI 开始执行该命令——排队期间被 gate 的
        // live echo 在此刻入流（chip 消失、气泡出现，同一时机切换）；completed/cancelled
        // = 条目作废，挂起 echo 一并丢弃（取消的消息不进聊天流）。
        const pendingEcho = this.pendingEchoes.get(commandUuid);
        this.pendingEchoes.delete(commandUuid);
        this.removeQueuedCommand(commandUuid);
        if (state === "started" && pendingEcho !== undefined) {
          this.injectLiveLine(pendingEcho);
        }
      }
    }

    if (msg && msg.type === "system") {
      const subtype = msg.subtype as string | undefined;
      // 特殊时期缩容：compact 把之前的块压掉——清空旧 history/live 缓冲，
      // 该 boundary 行由随后的 push 成为新块首行。
      if (isCompactBoundarySubtype(subtype)) {
        this.historyLines = [];
        this.liveLines = [];
        console.log("[relay] compact_boundary: trimmed history+live buffers");
      }
      const knownSubtypes = new Set([
        "init",
        "seed_init",
        "skill_catalog_changed",
        "context_usage",
        "session_status",
        "thinking_tokens",
        "api_retry",
        "compact_boundary",
        "microcompact_boundary",
        "status",
        "turn_duration",
        "api_error",
        "task_started",
        "task_updated",
        "task_notification",
        "vcs_state_changed",
        // CLI 2.1.299+：权限检查状态（纯内部信号；客户端投影跳过，服务端仅收录免 unknown 日志）
        "permission_check_status",
        // CLI 2.1.299+：运营公告帧（JSONL 落盘；客户端正投影为 InformationalNotice 轻量提示）
        "informational",
      ]);
      if (subtype && !knownSubtypes.has(subtype)) {
        console.log(
          `[relay] unknown system subtype: "${subtype}" keys=${Object.keys(msg).sort().join(",")}`,
        );
      }
      if (
        subtype === "task_started" ||
        subtype === "task_updated" ||
        subtype === "task_notification"
      ) {
        console.log(`[relay] ${subtype}: ${JSON.stringify(msg)}`);
      }
    }

    this.appendLive(line, msg);
    this.broadcast(line);
  }

  injectLine(line: string): void {
    this.broadcast(line);
  }

  // Book a prompt into the server-side queue (called from the write gate in
  // claude-runtime.ts reportUserInput). Idempotent by uuid: concurrent/duplicated
  // gates (gen-ui async continuation vs REST) must not double-book one prompt.
  // Broadcasts only on a real insertion — no-ops stay silent. `echoLine`（可选举）
  // = 排队期间挂起的 live echo，由 lifecycle started 出队时补注入（见 pendingEchoes）。
  enqueueQueuedCommand(entry: ClaudeQueuedCommand, echoLine?: string): void {
    if (this.isDestroyed) return;
    if (this.queuedCommands.some((c) => c.uuid === entry.uuid)) return;
    this.queuedCommands.push(entry);
    if (echoLine !== undefined) this.pendingEchoes.set(entry.uuid, echoLine);
    this.broadcast(this.queueStateLine());
  }

  // Remove a booked prompt (lifecycle-frame driven). Broadcasts only when the
  // uuid actually removed an entry — started+completed arriving back-to-back
  // (or cancelled+started interleaving at turn boundaries) must not storm
  // clients with identical snapshots. An empty-queue removal STILL broadcasts:
  // other clients holding stale chips must see the empty snapshot to clear.
  removeQueuedCommand(uuid: string): void {
    if (this.isDestroyed) return;
    const next = this.queuedCommands.filter((c) => c.uuid !== uuid);
    if (next.length === this.queuedCommands.length) return;
    this.queuedCommands = next;
    this.broadcast(this.queueStateLine());
  }

  // 停止冻结（M2）：把排队快照整体挪入 held、清空 queued，广播空 queue_state +
  // queue_held 快照。无条目时也广播（停止动作本身需要一次全量对齐：清残留 chip +
  // 空 held 快照同时是客户端「停止已生效」的回执，见 claude-adapter onCancel）。
  // 快照经 queue_held 广播帧出去（广播-only 家族）；CLI 队列清理后迟到的 cancelled
  // 帧驱动 removeQueuedCommand 对空队列是 no-op（不广播）。挂起 echo 随冻结清空——
  // 冻结条目不进聊天流；恢复时 web 新 uuid 重发，走 write gate 重新决策。
  holdCommands(): void {
    if (this.isDestroyed) return;
    this.heldCommands = this.queuedCommands;
    this.queuedCommands = [];
    this.pendingEchoes.clear();
    this.broadcast(this.queueStateLine());
    this.broadcast(this.queueHeldLine());
  }

  // 恢复/放弃（M2）：清 held + 广播空 queue_held。两者 api 侧行为相同（条目已在
  // 快照帧交给客户端——恢复的重发由 web 在收到空快照后按序执行，见 adapter
  // resumeHeld）；无 held 时 no-op 不广播（幂等）。
  clearHeldCommands(): void {
    if (this.isDestroyed) return;
    if (this.heldCommands.length === 0) return;
    this.heldCommands = [];
    this.broadcast(this.queueHeldLine());
  }

  private queueStateLine(): string {
    return JSON.stringify({ type: "queue_state", entries: this.queuedCommands });
  }

  private queueHeldLine(): string {
    return JSON.stringify({ type: "queue_held", entries: this.heldCommands });
  }

  // Inject a line into the live buffer AND broadcast it. Unlike injectLine
  // (broadcast-only), this also pushes into liveLines so subscribers that
  // connect LATER replay it from the live batch. Used to echo user input the
  // CLI never emits on stream-json stdout (see claude-stream.ts message()).
  injectLiveLine(line: string): void {
    this.appendLive(line, null);
    this.broadcast(line);
  }

  reportError(error: Error): void {
    this.broadcastError(error);
  }

  destroy(): void {
    this.phase = "destroyed";
    this.historyLines = [];
    this.liveLines = [];
    this.queuedCommands = [];
    this.heldCommands = [];
    this.subscribers.clear();
  }

  get isDestroyed(): boolean {
    return this.phase === "destroyed";
  }

  private async doActivate(): Promise<void> {
    try {
      if (this.startedAsResume && this.claudeSessionId) {
        this.historyLines = this.readHistoryFromJsonl();
        console.log(`[relay] resume loaded history lines=${this.historyLines.length}`);
      } else {
        console.log(`[relay] new session — starting with empty history`);
      }

      this.phase = "active";
    } catch (err) {
      this.activationError = err instanceof Error ? err : new Error(String(err));
      this.broadcastError(this.activationError);
      throw this.activationError;
    }
  }

  private capLive(): void {
    if (this.liveLines.length > LIVE_BUFFER_CAP) {
      this.liveLines = this.liveLines.slice(-LIVE_BUFFER_CAP);
    }
  }

  // Append a line to the live replay buffer. Consecutive thinking_tokens in the
  // same burst are coalesced to the LAST one in place: each carries the
  // CUMULATIVE estimated_tokens for the in-flight thinking phase, so earlier
  // ones are superseded and keeping them only burns the capped buffer (LIVE_BUFFER_CAP).
  // The client (deriveLiveThinkingTokens / pendingEstimatedTokens) consumes
  // only the last one, so this is lossless. Only an UNBROKEN run merges — any
  // other message between two thinking_tokens belongs to a different phase.
  // See docs/research/claude-cli-stream-protocol.md (pushBuffer folds to last).
  // NOTE: only the replay buffer folds; broadcast still sends every line so the
  // live "Thinking… (N tokens)" animation can show each incremental value.
  private appendLive(line: string, parsed: Record<string, unknown> | null): void {
    // tool_progress（heartbeat 等）是瞬态进度信号：实时 broadcast（handleStdoutLine
    // 里与 appendLive 并列调用）但不进 liveLines——重连重放不应携带过期的
    // elapsed 值，CLI 也不把它写 JSONL（history 侧天然没有）。语义 =「在线即见、
    // 错过不补」，与 thinking_tokens 折叠同理都是对 capped replay 缓冲的保护。
    if (parsed?.type === "tool_progress") return;
    if (parsed?.type === "system" && parsed.subtype === "thinking_tokens") {
      const last = this.liveLines[this.liveLines.length - 1];
      if (last !== undefined && isThinkingTokensLine(last)) {
        this.liveLines[this.liveLines.length - 1] = line;
        this.capLive();
        return;
      }
    }
    this.liveLines.push(line);
    this.capLive();
  }

  private readHistoryFromJsonl(): string[] {
    if (!this.claudeSessionId) return [];

    try {
      const jsonlPath = claudeJsonlPath(this.projectPath, this.claudeSessionId);
      return this.parseJsonlLines(this.readLastCompactBlock(jsonlPath).toString("utf8"));
    } catch {
      return [];
    }
  }

  // Read only the last compact block from disk. The block is the tail of the
  // file (last boundary → EOF), so read just the trailing HISTORY_TAIL_SCAN_BYTES
  // and locate the boundary there — avoiding a synchronous readFileSync of a
  // multi-hundred-MB JSONL on the resume-activation critical path. Falls back to
  // a full read when the boundary is older than the tail window (a compact block
  // larger than the window, or a never-compacted session) so those rare cases
  // behave exactly as a whole-file read would.
  private readLastCompactBlock(jsonlPath: string): Buffer {
    const fd = openSync(jsonlPath, "r");
    try {
      const size = fstatSync(fd).size;
      const start = Math.max(0, size - HISTORY_TAIL_SCAN_BYTES);
      const tail = Buffer.allocUnsafe(size - start);
      const bytesRead = readSync(fd, tail, 0, tail.length, start);
      const window = tail.subarray(0, bytesRead);

      const block = sliceLastCompactBlock(window);
      if (block) return block;
      // Tail didn't contain the whole last block. If we already read from offset
      // 0, `window` IS the full file (no boundary, or boundary on the first line)
      // → return it as-is; otherwise fall back to a full read.
      if (start === 0) return window;
      const full = readFileSync(jsonlPath);
      return sliceLastCompactBlock(full) ?? full;
    } finally {
      closeSync(fd);
    }
  }

  private parseJsonlLines(raw: string): string[] {
    const lines: string[] = [];
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === "object") {
          lines.push(normalizeHistoryMcpLine(parsed as Record<string, unknown>, trimmed));
        }
      } catch {
        /* skip malformed */
      }
    }
    return lines;
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

  private broadcastError(err: Error): void {
    for (const sub of this.subscribers) {
      try {
        sub.onError(err);
      } catch {
        /* ignore */
      }
    }
  }
}

// Locate the last compact boundary in `buf` and return the byte segment from
// that boundary's line start (inclusive) to EOF — the "last compact block".
// Backward-scans for each boundary subtype's wire marker (one lastIndexOf per
// subtype), no full-file line parse. Returns null when there is no boundary, OR
// when the boundary's line start falls outside `buf` (i.e. `buf` is a truncated
// file tail whose first line is mid-boundary) — the caller then falls back to a
// full read. A whole-file `buf` with a boundary on its very first line also
// returns null, and the caller's `?? full` yields the identical whole file.
export function sliceLastCompactBlock(buf: Buffer): Buffer | null {
  let lastBoundary = -1;
  for (const subtype of COMPACT_BOUNDARY_SUBTYPES) {
    const off = buf.lastIndexOf(`"subtype":"${subtype}"`);
    if (off > lastBoundary) lastBoundary = off;
  }
  if (lastBoundary < 0) return null;
  const lineStart = buf.lastIndexOf(0x0a, lastBoundary);
  if (lineStart < 0) return null;
  return buf.subarray(lineStart + 1);
}

// True if a raw JSONL line is a system/thinking_tokens row. Called only when the
// incoming line is itself thinking_tokens (so ~once per coalesce step); parses
// defensively since liveLines holds arbitrary raw stdout lines.
const isThinkingTokensLine = (raw: string): boolean => {
  try {
    const msg = JSON.parse(raw) as Record<string, unknown>;
    return msg.type === "system" && msg.subtype === "thinking_tokens";
  } catch {
    return false;
  }
};
