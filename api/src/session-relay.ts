import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { claudeJsonlPath, isChatMessage, isThinkingTokens } from "./session-routes";
import type { RuntimeStream } from "./session-registry";

type Subscriber = {
  onData(line: string): void;
  onError(err: Error): void;
};

type ReplaySnapshot = {
  lines: string[];
  counts: Map<string, number>;
};

export class Claude2SessionRelay {
  // ── three-layer data architecture ──
  //
  // Layer 1 (disk): JSONL file — read on demand, NOT kept in memory.
  // Layer 2 (memory): pendingBuffer — JSONL-like collapsed history for
  //   messages CLI stdout produced but disk JSONL may not contain yet.
  // Layer 3 (live): stdout lines that are not disk history are broadcast.

  private pendingBuffer: string[] = [];
  private stdoutHistorySuppression = new Map<string, number>();
  private diskBaselineCounts = new Map<string, number>();
  private subscribers = new Set<Subscriber>();
  private phase: "init" | "active" | "destroyed" = "init";
  private activatePromise: Promise<void> | null = null;
  private activationError: Error | null = null;
  activatedWithClaudeSessionId = false;
  private projectPath = "";
  private claudeSessionId: string | undefined;

  // ── public API ──

  async activate(projectPath: string, claudeSessionId: string | undefined): Promise<void> {
    if (this.phase !== "init") return;
    if (this.activatePromise) return this.activatePromise;

    this.projectPath = projectPath;
    this.claudeSessionId = claudeSessionId;
    this.activatePromise = this.doActivate();
    return this.activatePromise;
  }

  setClaudeSessionId(projectPath: string, claudeSessionId: string): void {
    this.projectPath = projectPath;
    this.claudeSessionId = claudeSessionId;
    this.activatedWithClaudeSessionId = true;
  }

  addSubscriber(onData: (line: string) => void, onError: (err: Error) => void): RuntimeStream {
    if (this.activationError) {
      onError(this.activationError);
      return { close: () => {} };
    }

    const replay = this.readDiskJsonlSnapshot();
    console.log(
      `[relay] addSubscriber: phase=${this.phase} disk=${replay.lines.length} pending=${this.pendingBuffer.length}`,
    );

    onData(JSON.stringify({ type: "replay_start" }));

    for (const line of replay.lines) {
      try {
        onData(line);
      } catch {
        /* subscriber error shouldn't block replay */
      }
    }

    const pendingLines = this.pendingLinesMissingFromDisk(replay.counts);
    for (const line of pendingLines) {
      try {
        onData(line);
      } catch {
        /* subscriber error shouldn't block replay */
      }
    }

    onData(JSON.stringify({ type: "replay_end" }));

    const sub: Subscriber = { onData, onError };
    this.subscribers.add(sub);

    return {
      close: () => {
        this.subscribers.delete(sub);
      },
    };
  }

  /** Called from runtime.readStdout() for every line from CLI stdout. */
  async handleStdoutLine(line: string): Promise<void> {
    await this.activatePromise;
    if (this.isDestroyed) return;

    // `claude --resume` can echo disk JSONL history on stdout. Suppress those
    // lines before broadcasting so the client doesn't see disk replay twice.
    if (consumeLineKey(this.stdoutHistorySuppression, line)) return;

    // Parse once for logging and isMeta-aware frontend handling.
    try {
      const msg = JSON.parse(line) as Record<string, unknown>;

      // Log unknown system subtypes so we can discover new message types
      if (msg.type === "system") {
        const subtype = msg.subtype as string | undefined;
        const knownSubtypes = new Set([
          "init",
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
        // Log task-related messages so we can document their structure
        if (
          subtype === "task_started" ||
          subtype === "task_updated" ||
          subtype === "task_notification"
        ) {
          console.log(`[relay] ${subtype}: ${JSON.stringify(msg)}`);
        }
      }
    } catch {
      /* unparseable — let through */
    }

    this.broadcast(line);
    this.appendToPendingBuffer(line);
  }

  /** Called from runtime.write() to echo user messages back to clients. */
  injectLine(line: string): void {
    this.suppressNextStdoutEcho(line);
    this.broadcast(line);
    this.appendToPendingBuffer(line);
  }

  reportError(error: Error): void {
    this.broadcastError(error);
  }

  destroy(): void {
    this.phase = "destroyed";
    this.pendingBuffer = [];
    this.stdoutHistorySuppression.clear();
    this.diskBaselineCounts.clear();
    this.subscribers.clear();
  }

  get isDestroyed(): boolean {
    return this.phase === "destroyed";
  }

  // ── private ──

  private suppressNextStdoutEcho(line: string): void {
    try {
      const msg = JSON.parse(line) as Record<string, unknown>;
      incrementKey(this.stdoutHistorySuppression, msg);
    } catch {
      /* skip unparseable injected lines */
    }
  }

  private pendingLinesMissingFromDisk(diskCounts: Map<string, number>): string[] {
    const diskIncrementCounts = subtractCounts(diskCounts, this.diskBaselineCounts);
    return this.pendingBuffer.filter((line) => !consumeLineKey(diskIncrementCounts, line));
  }

  private async doActivate(): Promise<void> {
    try {
      if (this.claudeSessionId) {
        this.activatedWithClaudeSessionId = true;
        this.stdoutHistorySuppression = await this.readDiskJsonlCounts();
        this.diskBaselineCounts = new Map(this.stdoutHistorySuppression);
        console.log(`[relay] JSONL suppression keys=${this.stdoutHistorySuppression.size}`);
      } else {
        console.log(`[relay] no claudeSessionId — starting without disk JSONL`);
      }

      this.phase = "active";
    } catch (err) {
      this.activationError = err instanceof Error ? err : new Error(String(err));
      this.broadcastError(this.activationError);
      throw this.activationError;
    }
  }

  /** JSONL-like append: filter TUI artifacts, collapse streaming deltas. */
  private appendToPendingBuffer(line: string): void {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(line) as Record<string, unknown>;
    } catch {
      return;
    }

    if (!isChatMessage(msg)) return;

    // thinking_tokens — collapse consecutive ones to the last (final count)
    if (isThinkingTokens(msg)) {
      if (
        this.pendingBuffer.length > 0 &&
        isThinkingTokensString(this.pendingBuffer[this.pendingBuffer.length - 1]!)
      ) {
        this.pendingBuffer[this.pendingBuffer.length - 1] = line;
      } else {
        this.pendingBuffer.push(line);
      }
      return;
    }

    // assistant deltas — same message.id → replace with latest (final state)
    if (msg.type === "assistant") {
      this.mergeAssistantDelta(line, msg);
      return;
    }

    if (msg.type === "user") {
      this.mergeByMessageKey(line, msg);
      return;
    }

    this.pendingBuffer.push(line);
    this.capPendingBuffer();
  }

  private mergeByMessageKey(line: string, msg: Record<string, unknown>): void {
    const key = messageKey(msg);
    if (!key) {
      this.pendingBuffer.push(line);
      this.capPendingBuffer();
      return;
    }

    for (let i = this.pendingBuffer.length - 1; i >= 0; i--) {
      try {
        const existing = JSON.parse(this.pendingBuffer[i]!) as Record<string, unknown>;
        if (existing.type === "assistant" || existing.type === "result") break;
        if (messageKey(existing) === key) {
          this.pendingBuffer[i] = line;
          return;
        }
      } catch {
        continue;
      }
    }

    this.pendingBuffer.push(line);
    this.capPendingBuffer();
  }

  private mergeAssistantDelta(line: string, msg: Record<string, unknown>): void {
    const message = msg.message as Record<string, unknown> | undefined;
    const messageId = message?.id as string | undefined;
    if (!messageId) {
      this.pendingBuffer.push(line);
      this.capPendingBuffer();
      return;
    }

    for (let i = this.pendingBuffer.length - 1; i >= 0; i--) {
      try {
        const existing = JSON.parse(this.pendingBuffer[i]!) as Record<string, unknown>;
        if (existing.type !== "assistant") continue;
        const existingMsg = existing.message as Record<string, unknown> | undefined;
        if (existingMsg?.id === messageId) {
          this.pendingBuffer[i] = line;
          return;
        }
      } catch {
        continue;
      }
    }

    this.pendingBuffer.push(line);
    this.capPendingBuffer();
  }

  private capPendingBuffer(): void {
    if (this.pendingBuffer.length > 5000) {
      this.pendingBuffer = this.pendingBuffer.slice(-5000);
    }
  }

  private readDiskJsonlSnapshot(): ReplaySnapshot {
    if (!this.claudeSessionId) return { lines: [], counts: new Map() };

    try {
      const jsonlPath = claudeJsonlPath(this.projectPath, this.claudeSessionId);
      const raw = readFileSync(jsonlPath, "utf8");
      const lines: string[] = [];
      const counts = new Map<string, number>();
      for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const msg = JSON.parse(trimmed) as Record<string, unknown>;
          if (!isChatMessage(msg)) continue;
          lines.push(trimmed);
          incrementKey(counts, msg);
        } catch {
          /* skip */
        }
      }
      return { lines, counts };
    } catch {
      return { lines: [], counts: new Map() };
    }
  }

  private async readDiskJsonlCounts(): Promise<Map<string, number>> {
    if (!this.claudeSessionId) return new Map();

    try {
      const jsonlPath = claudeJsonlPath(this.projectPath, this.claudeSessionId);
      const raw = await readFile(jsonlPath, "utf8");
      const counts = new Map<string, number>();
      for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const msg = JSON.parse(trimmed) as Record<string, unknown>;
          if (isChatMessage(msg)) incrementKey(counts, msg);
        } catch {
          /* skip */
        }
      }
      return counts;
    } catch {
      return new Map();
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

const incrementKey = (counts: Map<string, number>, msg: Record<string, unknown>) => {
  const key = messageKey(msg);
  if (!key) return;
  counts.set(key, (counts.get(key) ?? 0) + 1);
};

const subtractCounts = (
  counts: Map<string, number>,
  baseline: Map<string, number>,
): Map<string, number> => {
  const result = new Map<string, number>();
  for (const [key, count] of counts) {
    const increment = count - (baseline.get(key) ?? 0);
    if (increment > 0) result.set(key, increment);
  }
  return result;
};

const consumeLineKey = (counts: Map<string, number>, line: string): boolean => {
  try {
    const msg = JSON.parse(line) as Record<string, unknown>;
    const key = messageKey(msg);
    if (!key) return false;
    const count = counts.get(key) ?? 0;
    if (count <= 0) return false;
    if (count === 1) counts.delete(key);
    else counts.set(key, count - 1);
    return true;
  } catch {
    return false;
  }
};

const messageKey = (msg: Record<string, unknown>): string | null => {
  if (!isChatMessage(msg)) return null;

  const message = msg.message as Record<string, unknown> | undefined;
  if (msg.type === "assistant") {
    const id = message?.id;
    return typeof id === "string" ? `assistant:${id}` : stableMessageKey(msg);
  }

  if (msg.type === "user") {
    const role = typeof message?.role === "string" ? message.role : "";
    return `user:${role}:${normalizedJsonKey(message?.content)}`;
  }

  if (msg.type === "system") {
    const subtype = typeof msg.subtype === "string" ? msg.subtype : "";
    const sessionId = typeof msg.session_id === "string" ? msg.session_id : "";
    return `system:${subtype}:${sessionId}:${stableMessageKey(msg)}`;
  }

  return stableMessageKey(msg);
};

const stableMessageKey = (msg: Record<string, unknown>): string => normalizedJsonKey(msg);

const normalizedJsonKey = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map((item) => normalizedJsonKey(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${normalizedJsonKey(item)}`).join(",")}}`;
  }

  return JSON.stringify(value) ?? "undefined";
};

const isThinkingTokensString = (line: string): boolean =>
  line.includes('"type":"system"') && line.includes('"subtype":"thinking_tokens"');
