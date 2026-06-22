import { readFileSync } from "node:fs";
import { claudeJsonlPath } from "./session-routes";
import type { RuntimeStream } from "./session-registry";

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
    onData(JSON.stringify({ type: "session_init", resume: this.startedAsResume }));

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

  async handleStdoutLine(line: string): Promise<void> {
    await this.activatePromise;
    if (this.isDestroyed) return;

    try {
      const msg = JSON.parse(line) as Record<string, unknown>;
      if (msg.type === "system") {
        const subtype = msg.subtype as string | undefined;
        // 特殊时期缩容：compact 把之前的块压掉——清空旧 history/live 缓冲，
        // 该 boundary 行由随后的 push 成为新块首行。
        if (subtype === "compact_boundary" || subtype === "microcompact_boundary") {
          this.historyLines = [];
          this.liveLines = [];
          console.log("[relay] compact_boundary: trimmed history+live buffers");
        }
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
        if (
          subtype === "task_started" ||
          subtype === "task_updated" ||
          subtype === "task_notification"
        ) {
          console.log(`[relay] ${subtype}: ${JSON.stringify(msg)}`);
        }
      }
    } catch {
      /* unparseable — let through to broadcast/buffer */
    }

    this.liveLines.push(line);
    this.capLive();
    this.broadcast(line);
  }

  injectLine(line: string): void {
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
    if (this.liveLines.length > 5000) {
      this.liveLines = this.liveLines.slice(-5000);
    }
  }

  private readHistoryFromJsonl(): string[] {
    if (!this.claudeSessionId) return [];

    try {
      const jsonlPath = claudeJsonlPath(this.projectPath, this.claudeSessionId);
      const raw = readFileSync(jsonlPath, "utf8");
      const lines: string[] = [];
      // compact-block windowing: keep only the last compact block. Track the index
      // of the last compact_boundary — it starts the new (post-compact) block, so
      // we slice from it (inclusive). No boundary ⇒ return full file (fallback).
      let lastBoundaryIndex = -1;
      for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed && typeof parsed === "object") {
            if (
              parsed.type === "system" &&
              (parsed.subtype === "compact_boundary" || parsed.subtype === "microcompact_boundary")
            ) {
              lastBoundaryIndex = lines.length;
            }
            lines.push(trimmed);
          }
        } catch {
          /* skip malformed */
        }
      }
      return lastBoundaryIndex >= 0 ? lines.slice(lastBoundaryIndex) : lines;
    } catch {
      return [];
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
