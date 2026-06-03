import type { RuntimeResources, RuntimeStream, SessionMetadata } from "./session-registry";

type DataCallback = (data: string) => void;
type ErrorCallback = (error: Error) => void;

type Subscriber = {
  onData: DataCallback;
  onError: ErrorCallback;
};

type Claude2Process = {
  subprocess: ReturnType<typeof Bun.spawn>;
  exited: boolean;
  onCloseCallbacks: Set<() => void>;
  subscribers: Set<Subscriber>;
  readerStarted: boolean;
};

type Claude2SessionState = {
  projectPath: string;
  sessionId: string;
  claudeSessionId?: string;
  model?: string;
  process: Claude2Process | null;
};

export class Claude2Runtime implements RuntimeResources {
  private readonly sessions = new Map<string, Claude2SessionState>();
  private onSystemInit:
    | ((sessionId: string, tmuxSessionName: string, claudeSessionId: string, model: string) => void)
    | null = null;

  setOnSystemInit(
    cb: (
      sessionId: string,
      tmuxSessionName: string,
      claudeSessionId: string,
      model: string,
    ) => void,
  ) {
    this.onSystemInit = cb;
  }

  async exists(sessionName: string): Promise<boolean> {
    const state = this.sessions.get(sessionName);
    if (!state) return false;
    return state.process !== null && !state.process.exited;
  }

  async close(sessionName: string): Promise<void> {
    const state = this.sessions.get(sessionName);
    if (!state?.process) return;
    state.process.subprocess.kill();
    for (const cb of state.process.onCloseCallbacks) cb();
    state.process.onCloseCallbacks.clear();
    state.process = null;
  }

  async startAgent(metadata: SessionMetadata): Promise<void> {
    const proc = this.spawnClaude(metadata.projectPath);
    this.sessions.set(metadata.tmuxSessionName, {
      projectPath: metadata.projectPath,
      sessionId: metadata.id,
      claudeSessionId: undefined,
      process: proc,
    });
  }

  async ensureRunning(
    sessionName: string,
    projectPath: string,
    sessionId: string,
    claudeSessionId?: string,
    model?: string,
  ): Promise<void> {
    const existing = this.sessions.get(sessionName);
    if (existing?.process && !existing.process.exited) {
      return;
    }

    const proc = this.spawnClaude(projectPath, claudeSessionId, model);
    this.sessions.set(sessionName, {
      projectPath,
      sessionId,
      claudeSessionId,
      model,
      process: proc,
    });
  }

  async switchModel(
    sessionName: string,
    model: string,
  ): Promise<{ claudeSessionId?: string; projectPath: string } | null> {
    const state = this.sessions.get(sessionName);
    if (!state) return null;

    // Kill the current process
    if (state.process) {
      state.process.subprocess.kill();
      for (const cb of state.process.onCloseCallbacks) cb();
      state.process.onCloseCallbacks.clear();
      state.process = null;
    }

    // Restart with new model and resume
    const proc = this.spawnClaude(state.projectPath, state.claudeSessionId, model);
    state.process = proc;
    state.model = model;

    return { claudeSessionId: state.claudeSessionId, projectPath: state.projectPath };
  }

  async write(sessionName: string, data: string): Promise<void> {
    const state = this.sessions.get(sessionName);
    if (!state?.process || state.process.exited) throw new Error("Claude2 process not running");
    console.log(`[claude2 write] ${sessionName}: ${data.slice(0, 200)}`);
    const stdin = state.process.subprocess.stdin as import("bun").FileSink;
    stdin.write(data);
    await stdin.flush();
  }

  async stream(
    sessionName: string,
    onData: DataCallback,
    onError: ErrorCallback,
  ): Promise<RuntimeStream> {
    const state = this.sessions.get(sessionName);
    if (!state?.process || state.process.exited) throw new Error("Claude2 process not running");

    const proc = state.process;
    const subscriber: Subscriber = { onData, onError };
    proc.subscribers.add(subscriber);

    if (!proc.readerStarted) {
      proc.readerStarted = true;
      this.startReader(sessionName, proc);
    }

    return {
      close: () => {
        proc.subscribers.delete(subscriber);
      },
    };
  }

  async capture(): Promise<string> {
    return "";
  }

  async resize(): Promise<void> {
    // no-op
  }

  async startTerminal(): Promise<void> {
    throw new Error("Claude2Runtime does not support terminal sessions");
  }

  private startReader(sessionName: string, proc: Claude2Process) {
    let stdout: ReadableStream<Uint8Array>;
    try {
      stdout = proc.subprocess.stdout as ReadableStream<Uint8Array>;
    } catch {
      return;
    }

    const readerPromise = (async () => {
      let reader: ReadableStreamDefaultReader<Uint8Array>;
      try {
        reader = stdout.getReader();
      } catch {
        proc.readerStarted = false;
        return;
      }

      let buffer = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += new TextDecoder().decode(value);
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed) {
              console.log(`[claude2 stdout] ${sessionName}: ${trimmed.slice(0, 200)}`);
              this.checkClaudeSessionId(sessionName, trimmed);
              for (const sub of proc.subscribers) {
                try {
                  sub.onData(trimmed);
                } catch {
                  /* skip */
                }
              }
            }
          }
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        for (const sub of proc.subscribers) {
          try {
            sub.onError(err);
          } catch {
            /* skip */
          }
        }
      }
    })();

    void readerPromise;
  }

  private spawnClaude(
    projectPath: string,
    claudeSessionId?: string,
    model?: string,
  ): Claude2Process {
    const args = [
      "--output-format",
      "stream-json",
      "--input-format",
      "stream-json",
      "--verbose",
      "--permission-prompt-tool",
      "stdio",
    ];
    if (model) {
      args.push("--model", model);
    }
    if (claudeSessionId) {
      args.push("--resume", claudeSessionId);
    }

    const subprocess = Bun.spawn({
      cmd: ["claude", ...args],
      cwd: projectPath,
      env: {
        ...process.env,
        CLAUDE_CODE_ENTRYPOINT: "sdk-ts",
        DISABLE_AUTOUPDATER: "1",
      },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    const proc: Claude2Process = {
      subprocess,
      exited: false,
      onCloseCallbacks: new Set(),
      subscribers: new Set(),
      readerStarted: false,
    };

    subprocess.exited.then(() => {
      proc.exited = true;
      for (const cb of proc.onCloseCallbacks) cb();
    });

    void readStderr(subprocess.stderr, (line) => {
      console.error(`[claude2 stderr] ${line}`);
    });

    return proc;
  }

  private checkClaudeSessionId(sessionName: string, line: string) {
    if (!this.onSystemInit) return;
    try {
      const msg = JSON.parse(line);
      if (msg.type === "system" && msg.subtype === "init" && typeof msg.session_id === "string") {
        const state = this.sessions.get(sessionName);
        if (state) {
          if (!state.claudeSessionId) {
            state.claudeSessionId = msg.session_id;
          }
          if (typeof msg.model === "string") state.model = msg.model;
          this.onSystemInit(
            state.sessionId,
            sessionName,
            msg.session_id,
            typeof msg.model === "string" ? msg.model : "unknown",
          );
        }
      }
    } catch {
      // skip
    }
  }
}

async function readStderr(
  stream: ReadableStream<Uint8Array> | undefined,
  onLine: (line: string) => void,
) {
  if (!stream) return;
  const reader = stream.getReader();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += new TextDecoder().decode(value);
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim()) onLine(line.trim());
      }
    }
  } catch {
    // stream closed
  }
}
