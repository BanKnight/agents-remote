import { readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import {
  claudeJsonlPath,
  isChatMessage,
  isStreamingMessage,
  isThinkingTokens,
} from "./session-routes";
import { getTurnDir, isCompletedTurn, listTurnFiles, readFileLines, tailFile } from "./turn-files";
import type { TmuxSharedPipe } from "./pipe-pane";
import type { RuntimeStream } from "./session-registry";

type Subscriber = {
  onData(line: string): void;
  onError(err: Error): void;
};

export class Claude2SessionRelay {
  private buffer: string[] = [];
  private subscribers = new Set<Subscriber>();
  private phase: "init" | "active" | "destroyed" = "init";
  private tailStop: (() => void) | null = null;
  private pipeSub: RuntimeStream | null = null;
  private activatePromise: Promise<void> | null = null;
  private activationError: Error | null = null;
  private pipeLineBuffer = "";
  activatedWithClaudeSessionId = false;

  async activate(
    runDir: string,
    projectPath: string,
    claudeSessionId: string | undefined,
    pipeProvider: (sessionName: string) => Promise<TmuxSharedPipe>,
    sessionName: string,
  ): Promise<void> {
    if (this.phase !== "init") return;
    if (this.activatePromise) return this.activatePromise;

    this.activatePromise = this.doActivate(
      runDir,
      projectPath,
      claudeSessionId,
      pipeProvider,
      sessionName,
    );
    return this.activatePromise;
  }

  addSubscriber(onData: (line: string) => void, onError: (err: Error) => void): RuntimeStream {
    // If activation already failed, notify the subscriber immediately
    if (this.activationError) {
      onError(this.activationError);
      return { close: () => {} };
    }

    const lastLine =
      this.buffer.length > 0 ? this.buffer[this.buffer.length - 1]!.slice(0, 80) : "(empty)";
    console.log(
      `[relay] addSubscriber: phase=${this.phase} buffer=${this.buffer.length} last=${lastLine}`,
    );

    // Wrap buffer replay in markers so the client can batch-apply
    // history without per-message render jitter.
    if (this.buffer.length > 0) {
      onData(JSON.stringify({ type: "replay_start" }));
    }
    for (const line of this.buffer) {
      try {
        onData(line);
      } catch {
        // subscriber error shouldn't block replay
      }
    }
    if (this.buffer.length > 0) {
      onData(JSON.stringify({ type: "replay_end" }));
    }

    const sub: Subscriber = { onData, onError };
    this.subscribers.add(sub);

    return {
      close: () => {
        this.subscribers.delete(sub);
      },
    };
  }

  injectLine(line: string): void {
    this.broadcast(line);
    this.pushBuffer(line);
  }

  destroy(): void {
    this.phase = "destroyed";
    this.tailStop?.();
    this.tailStop = null;
    this.pipeSub?.close();
    this.pipeSub = null;

    // Flush any trailing partial line before clearing
    if (this.pipeLineBuffer.trim()) {
      this.broadcast(this.pipeLineBuffer.trim());
    }
    this.pipeLineBuffer = "";

    this.buffer = [];
    this.subscribers.clear();
  }

  private startTailingTurns(turnDir: string, startIndex: number): void {
    const filePath = (i: number) => join(turnDir, `turn_${String(i).padStart(3, "0")}.jsonl`);
    let index = startIndex;

    const onResult = () => {
      if (this.phase === "destroyed") return;
      index++;
      this.tailStop = tailFile(
        filePath(index),
        (line) => {
          if (this.phase === "destroyed") return;
          this.broadcast(line);
          this.pushBuffer(line);
        },
        (line) => {
          if (this.phase === "destroyed") return;
          this.broadcast(line);
          this.pushBuffer(line);
          void unlink(filePath(index)).catch(() => {});
          onResult();
        },
      ).stop;
    };

    this.tailStop = tailFile(
      filePath(index),
      (line) => {
        if (this.phase === "destroyed") return;
        this.broadcast(line);
        this.pushBuffer(line);
      },
      (line) => {
        if (this.phase === "destroyed") return;
        this.broadcast(line);
        this.pushBuffer(line);
        void unlink(filePath(index)).catch(() => {});
        onResult();
      },
    ).stop;
  }

  get isDestroyed(): boolean {
    return this.phase === "destroyed";
  }

  // ── private ──

  private async doActivate(
    runDir: string,
    projectPath: string,
    claudeSessionId: string | undefined,
    pipeProvider: (sessionName: string) => Promise<TmuxSharedPipe>,
    sessionName: string,
  ): Promise<void> {
    try {
      // 1. Load JSONL
      if (claudeSessionId) {
        this.activatedWithClaudeSessionId = true;
        try {
          const jsonlPath = claudeJsonlPath(projectPath, claudeSessionId);
          const raw = await readFile(jsonlPath, "utf8");
          let loaded = 0;
          for (const line of raw.split("\n")) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const msg = JSON.parse(trimmed) as Record<string, unknown>;
              if (isChatMessage(msg)) {
                this.pushBuffer(trimmed);
                loaded++;
              }
            } catch {
              // skip unparseable
            }
          }
          console.log(`[relay] JSONL loaded: ${loaded} messages`);
        } catch {
          console.log(`[relay] JSONL not found for ${claudeSessionId}`);
        }
      } else {
        console.log(`[relay] no claudeSessionId — skipping JSONL`);
      }

      // 2. Process turn files — replay completed ones not in JSONL,
      //    and set up a chained tail for in-progress and future turns.
      const turnDir = getTurnDir(runDir, sessionName);
      const turnFiles = await listTurnFiles(turnDir);
      let nextTurnIndex = 0;
      const jsonlLoaded = claudeSessionId != null;

      for (const file of turnFiles) {
        if (this.phase === "destroyed") return;

        const completed = await isCompletedTurn(file);
        const lines = await readFileLines(file);
        const filtered = lines.filter((l) => {
          try {
            return isChatMessage(JSON.parse(l) as Record<string, unknown>);
          } catch {
            return false;
          }
        });

        if (completed) {
          // When JSONL was loaded, it is the canonical source for
          // instantaneous events (user, assistant, system.*) and
          // streaming final state. Turn files for completed turns only
          // contribute what JSONL does not contain: result messages
          // (which mark turn completion) and the collapsed final
          // thinking_tokens (which pushBuffer will handle).
          const keep = jsonlLoaded
            ? filtered.filter((l) => {
                try {
                  const m = JSON.parse(l) as Record<string, unknown>;
                  return m.type === "result";
                } catch {
                  return false;
                }
              })
            : filtered;
          for (const line of keep) {
            this.broadcast(line);
            this.pushBuffer(line);
          }
          void unlink(file).catch(() => {});
          nextTurnIndex = Math.max(nextTurnIndex, indexFromTurnFile(file) + 1);
        } else {
          // In-progress turn — replay existing lines, then chain-tail
          for (const line of filtered) {
            this.broadcast(line);
            this.pushBuffer(line);
          }
          nextTurnIndex = indexFromTurnFile(file);
        }
      }

      // Start tailing from the next expected turn file (chained: on
      // completion, auto-starts tailing the next index).
      if (!this.tailStop) {
        this.startTailingTurns(turnDir, nextTurnIndex);
      }

      // 3. Subscribe pipe-pane for additional live data
      const pipe = await pipeProvider(sessionName);
      this.pipeSub = pipe.subscribe(
        (data) => this.handlePipeData(data),
        (err) => this.broadcastError(err),
      );

      this.phase = "active";
      console.log(
        `[relay] activate done: buffer=${this.buffer.length} lines, nextTurn=${nextTurnIndex}`,
      );
    } catch (err) {
      // Clean up partial state on any activation failure
      this.tailStop?.();
      this.tailStop = null;
      this.activationError = err instanceof Error ? err : new Error(String(err));
      this.broadcastError(this.activationError);
      throw this.activationError;
    }
  }

  private handlePipeData(data: string): void {
    this.pipeLineBuffer += data;
    const segments = this.pipeLineBuffer.split("\n");
    this.pipeLineBuffer = segments.pop() ?? "";

    for (const line of segments) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      this.broadcast(trimmed);
      this.pushBuffer(trimmed);
    }
  }

  private broadcast(line: string): void {
    for (const sub of this.subscribers) {
      try {
        sub.onData(line);
      } catch {
        // subscriber error shouldn't crash others
      }
    }
  }

  private broadcastError(err: Error): void {
    for (const sub of this.subscribers) {
      try {
        sub.onError(err);
      } catch {
        // ignore
      }
    }
  }

  private pushBuffer(line: string): void {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(line) as Record<string, unknown>;
    } catch {
      return; // unparseable line — discard
    }

    if (!isChatMessage(msg)) return;

    if (isStreamingMessage(msg)) {
      // 持续流分支。assistant 直接存储（回放时 batch 渲染为完整气泡）；
      // thinking_tokens 折叠为最后一条（含最终 estimated_tokens）。
      if (isThinkingTokens(msg)) {
        if (
          this.buffer.length > 0 &&
          isThinkingTokensString(this.buffer[this.buffer.length - 1]!)
        ) {
          this.buffer[this.buffer.length - 1] = line;
        } else {
          this.buffer.push(line);
        }
        return;
      }
      // assistant — fall through to store as-is
    }

    // 瞬时事件 / assistant：到达即终态，live broadcast 和 replay buffer 处理一致
    this.buffer.push(line);
    if (this.buffer.length > 5000) {
      this.buffer = this.buffer.slice(-5000);
    }
  }
}

const isThinkingTokensString = (line: string): boolean => {
  return line.includes('"type":"system"') && line.includes('"subtype":"thinking_tokens"');
};

const indexFromTurnFile = (filePath: string): number => {
  const match = filePath.match(/turn_(\d+)\.jsonl$/);
  return match ? parseInt(match[1]!, 10) : 0;
};
