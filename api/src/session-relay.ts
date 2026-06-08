import { readFileSync } from "node:fs";
import { claudeJsonlPath } from "./session-routes";
import type { RuntimeStream } from "./session-registry";

type Subscriber = {
  onData(line: string): void;
  onError(err: Error): void;
};

type BootstrapPlan = {
  snapshotLines: string[];
  shouldReplay: boolean;
};

export class Claude2SessionRelay {
  private relayLines: string[] = [];
  private bufferLines: string[] = [];
  private stdoutHistorySuppression = new Map<string, number>();
  private localEchoSuppression = new Map<string, number>();
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

    const bootstrapPlan = this.buildBootstrapPlan();
    console.log(
      `[relay] addSubscriber: phase=${this.phase} relay=${this.relayLines.length} buffer=${this.bufferLines.length} replay=${bootstrapPlan.shouldReplay}`,
    );

    const sub: Subscriber = { onData, onError };
    this.subscribers.add(sub);

    if (bootstrapPlan.shouldReplay) {
      onData(JSON.stringify({ type: "replay_start" }));

      for (const line of bootstrapPlan.snapshotLines) {
        try {
          onData(line);
        } catch {
          /* subscriber error shouldn't block replay */
        }
      }

      onData(JSON.stringify({ type: "replay_end" }));
    }

    return {
      close: () => {
        this.subscribers.delete(sub);
      },
    };
  }

  async handleStdoutLine(line: string): Promise<void> {
    await this.activatePromise;
    if (this.isDestroyed) return;

    if (consumeRawLine(this.localEchoSuppression, line)) return;
    if (consumeRawLine(this.stdoutHistorySuppression, line)) return;

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

    this.bufferLines.push(line);
    this.capBuffer();
    this.broadcast(line);
  }

  injectLine(line: string): void {
    incrementRawLine(this.localEchoSuppression, line);
    this.broadcast(line);
  }

  reportError(error: Error): void {
    this.broadcastError(error);
  }

  destroy(): void {
    this.phase = "destroyed";
    this.relayLines = [];
    this.bufferLines = [];
    this.stdoutHistorySuppression.clear();
    this.localEchoSuppression.clear();
    this.subscribers.clear();
  }

  get isDestroyed(): boolean {
    return this.phase === "destroyed";
  }

  private buildBootstrapPlan(): BootstrapPlan {
    const snapshotLines = [...this.relayLines, ...this.bufferLines];
    return {
      snapshotLines,
      shouldReplay: snapshotLines.length > 0,
    };
  }

  private async doActivate(): Promise<void> {
    try {
      if (this.startedAsResume && this.claudeSessionId) {
        this.relayLines = this.readRelaySnapshot();
        this.stdoutHistorySuppression = buildRawLineCounts(this.relayLines);
        console.log(
          `[relay] resume relay lines=${this.relayLines.length} suppressionKeys=${this.stdoutHistorySuppression.size}`,
        );
      } else {
        console.log(`[relay] new session — starting with empty relay`);
      }

      this.phase = "active";
    } catch (err) {
      this.activationError = err instanceof Error ? err : new Error(String(err));
      this.broadcastError(this.activationError);
      throw this.activationError;
    }
  }

  private capBuffer(): void {
    if (this.bufferLines.length > 5000) {
      this.bufferLines = this.bufferLines.slice(-5000);
    }
  }

  private readRelaySnapshot(): string[] {
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

const buildRawLineCounts = (lines: string[]): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const line of lines) {
    incrementRawLine(counts, line);
  }
  return counts;
};

const incrementRawLine = (counts: Map<string, number>, line: string) => {
  counts.set(line, (counts.get(line) ?? 0) + 1);
};

const consumeRawLine = (counts: Map<string, number>, line: string): boolean => {
  const count = counts.get(line) ?? 0;
  if (count <= 0) return false;
  if (count === 1) counts.delete(line);
  else counts.set(line, count - 1);
  return true;
};
