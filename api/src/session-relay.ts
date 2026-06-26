import { readFileSync } from "node:fs";
import { COMPACT_BOUNDARY_SUBTYPES, isCompactBoundarySubtype } from "@agents-remote/shared";
import { claudeJsonlPath } from "./session-routes";
import type { RuntimeStream } from "./session-registry";

// Maximum raw stdout lines retained in the live replay buffer for late
// subscribers. Bounds memory on long-lived sessions; consecutive thinking_tokens
// are coalesced (see appendLive) so a single thinking phase no longer dominates.
const LIVE_BUFFER_CAP = 10000;

type Subscriber = {
  onData(line: string): void;
  onError(err: Error): void;
};

export class Claude2SessionRelay {
  private historyLines: string[] = [];
  private liveLines: string[] = [];
  private subscribers = new Set<Subscriber>();
  private phase: "init" | "active" | "destroyed" = "init";
  private activatePromise: Promise<void> | null = null;
  private activationError: Error | null = null;
  private projectPath = "";
  private claudeSessionId: string | undefined;
  private startedAsResume = false;

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

  addSubscriber(
    onData: (line: string) => void,
    onError: (err: Error) => void,
    seedInitLine?: string,
  ): RuntimeStream {
    if (this.activationError) {
      onError(this.activationError);
      return { close: () => {} };
    }

    console.log(
      `[relay] addSubscriber: phase=${this.phase} history=${this.historyLines.length} live=${this.liveLines.length}`,
    );

    const sub: Subscriber = { onData, onError };
    this.subscribers.add(sub);

    // Connection-level metadata — sent before any batch so the client knows
    // whether this is a resume (history may contain orphaned tool_use).
    try {
      onData(JSON.stringify({ type: "session_init", resume: this.startedAsResume }));
    } catch {
      /* subscriber error shouldn't block replay */
    }

    // Scalar seed init: replayed before history so the client's scalar fold has a
    // seed even though system.init is stdout-only (absent from JSONL/tail). Must
    // follow session_init (client resets on session_init) and precede history_start
    // (else it'd be gzipped into the batch). See docs/design/message-replay.md.
    if (seedInitLine) {
      try {
        onData(seedInitLine);
      } catch {
        /* subscriber error shouldn't block replay */
      }
    }

    // Always send history batch (count may be 0 for new sessions)
    onData(JSON.stringify({ type: "history_start", count: this.historyLines.length }));
    for (const line of this.historyLines) {
      try {
        onData(line);
      } catch {
        /* subscriber error shouldn't block replay */
      }
    }
    onData(JSON.stringify({ type: "history_end" }));

    // Always send live batch (count may be 0)
    onData(JSON.stringify({ type: "live_start", count: this.liveLines.length }));
    for (const line of this.liveLines) {
      try {
        onData(line);
      } catch {
        /* subscriber error shouldn't block replay */
      }
    }
    onData(JSON.stringify({ type: "live_end" }));

    return {
      close: () => {
        this.subscribers.delete(sub);
      },
    };
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

  // Inject a line into the live buffer AND broadcast it. Unlike injectLine
  // (broadcast-only), this also pushes into liveLines so subscribers that
  // connect LATER replay it from the live batch. Used to echo user input the
  // CLI never emits on stream-json stdout (see claude2-stream.ts message()).
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
      const buf = readFileSync(jsonlPath);
      // compact-block windowing: keep only the last compact block. Locate the last
      // boundary by backward-scanning the raw buffer for each boundary subtype's
      // wire marker — one lastIndexOf pass per subtype (two total), no full-file
      // line parse — then slice from that boundary's line start (inclusive) to EOF.
      // No boundary ⇒ the session was never compacted: parse the whole file.
      let lastBoundary = -1;
      for (const subtype of COMPACT_BOUNDARY_SUBTYPES) {
        const off = buf.lastIndexOf(`"subtype":"${subtype}"`);
        if (off > lastBoundary) lastBoundary = off;
      }
      const segment =
        lastBoundary < 0 ? buf : buf.subarray(buf.lastIndexOf(0x0a, lastBoundary) + 1);
      return this.parseJsonlLines(segment.toString("utf8"));
    } catch {
      return [];
    }
  }

  private parseJsonlLines(raw: string): string[] {
    const lines: string[] = [];
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === "object") lines.push(trimmed);
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
