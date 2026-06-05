import { readFile, unlink } from "node:fs/promises";
import { claudeJsonlPath, isChatMessage } from "./session-routes";
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

    for (const line of this.buffer) {
      try {
        onData(line);
      } catch {
        // subscriber error shouldn't block replay
      }
    }

    const sub: Subscriber = { onData, onError };
    this.subscribers.add(sub);

    return {
      close: () => {
        this.subscribers.delete(sub);
      },
    };
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
      // 1. Load JSONL → find lastNumTurns
      let lastNumTurns: number | null = null;
      if (claudeSessionId) {
        try {
          const jsonlPath = claudeJsonlPath(projectPath, claudeSessionId);
          const raw = await readFile(jsonlPath, "utf8");
          for (const line of raw.split("\n")) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const msg = JSON.parse(trimmed) as Record<string, unknown>;
              if (isChatMessage(msg)) {
                this.buffer.push(trimmed);
                if (msg.type === "result" && typeof msg.num_turns === "number") {
                  lastNumTurns = msg.num_turns;
                }
              }
            } catch {
              // skip unparseable
            }
          }
        } catch {
          // JSONL doesn't exist (new session)
        }
      }

      // 2. Process turn files
      const turnDir = getTurnDir(runDir, sessionName);
      const turnFiles = await listTurnFiles(turnDir);

      for (const file of turnFiles) {
        if (this.phase === "destroyed") return;

        const completed = await isCompletedTurn(file);
        const lines = await readFileLines(file);

        // Empty in-progress turn — set up tail in case stdout-helper
        // writes data later (the file may be brand new and empty).
        if (lines.length === 0) {
          if (!completed) {
            this.tailStop = tailFile(
              file,
              (line) => {
                if (this.phase === "destroyed") return;
                this.broadcast(line);
                this.pushBuffer(line);
              },
              (line) => {
                if (this.phase === "destroyed") return;
                this.broadcast(line);
                this.pushBuffer(line);
                void unlink(file).catch(() => {});
              },
            ).stop;
          } else {
            void unlink(file).catch(() => {});
          }
          continue;
        }

        if (completed) {
          const turnNumTurns = extractNumTurns(lines);

          if (lastNumTurns !== null && turnNumTurns !== null && turnNumTurns <= lastNumTurns) {
            void unlink(file).catch(() => {});
            continue;
          }

          for (const line of lines) {
            this.broadcast(line);
            this.pushBuffer(line);
          }
          void unlink(file).catch(() => {});
        } else {
          for (const line of lines) {
            this.broadcast(line);
            this.pushBuffer(line);
          }

          this.tailStop = tailFile(
            file,
            (line) => {
              if (this.phase === "destroyed") return;
              this.broadcast(line);
              this.pushBuffer(line);
            },
            (line) => {
              if (this.phase === "destroyed") return;
              this.broadcast(line);
              this.pushBuffer(line);
              void unlink(file).catch(() => {});
            },
          ).stop;
        }
      }

      // 3. Subscribe pipe-pane for live data
      const pipe = await pipeProvider(sessionName);
      this.pipeSub = pipe.subscribe(
        (data) => this.handlePipeData(data),
        (err) => this.broadcastError(err),
      );

      this.phase = "active";
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
    this.buffer.push(line);
    // Limit buffer to prevent unbounded memory growth.
    // Trim from the front so late subscribers see the most recent
    // window — no gap, just older history dropped.
    if (this.buffer.length > 5000) {
      this.buffer = this.buffer.slice(-5000);
    }
  }
}

const extractNumTurns = (lines: string[]): number | null => {
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const msg = JSON.parse(lines[i]!) as Record<string, unknown>;
      if (msg.type === "result" && typeof msg.num_turns === "number") {
        return msg.num_turns;
      }
    } catch {
      // continue
    }
  }
  return null;
};
