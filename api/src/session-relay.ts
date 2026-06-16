import { readFileSync } from "node:fs";
import { claudeJsonlPath } from "./session-routes";
import type { RuntimeStream } from "./session-registry";

type Subscriber = {
  onData(line: string): void;
  onError(err: Error): void;
};

export class Claude2SessionRelay {
  private historyLines: string[] = [];
  private outputLines: string[] = [];
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

  addSubscriber(onData: (line: string) => void, onError: (err: Error) => void): RuntimeStream {
    if (this.activationError) {
      onError(this.activationError);
      return { close: () => {} };
    }

    console.log(
      `[relay] addSubscriber: phase=${this.phase} history=${this.historyLines.length} output=${this.outputLines.length}`,
    );

    const sub: Subscriber = { onData, onError };
    this.subscribers.add(sub);

    // Connection-level metadata — sent before any batch so the client knows
    // whether this is a resume (history may contain orphaned tool_use).
    onData(JSON.stringify({ type: "session_init", resume: this.startedAsResume }));

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

    // Always send output batch (count may be 0)
    onData(JSON.stringify({ type: "output_start", count: this.outputLines.length }));
    for (const line of this.outputLines) {
      try {
        onData(line);
      } catch {
        /* subscriber error shouldn't block replay */
      }
    }
    onData(JSON.stringify({ type: "output_end" }));

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

    this.outputLines.push(line);
    this.capOutput();
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
    this.outputLines = [];
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

  private capOutput(): void {
    if (this.outputLines.length > 5000) {
      this.outputLines = this.outputLines.slice(-5000);
    }
  }

  private readHistoryFromJsonl(): string[] {
    if (!this.claudeSessionId) return [];

    try {
      const jsonlPath = claudeJsonlPath(this.projectPath, this.claudeSessionId);
      const raw = readFileSync(jsonlPath, "utf8");
      const lines: string[] = [];
      for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed && typeof parsed === "object") {
            lines.push(trimmed);
          }
        } catch {
          /* skip malformed */
        }
      }
      return lines;
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
