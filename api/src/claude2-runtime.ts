import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { RuntimeResources, RuntimeStream, SessionMetadata } from "./session-registry";
import { Claude2SessionRelay } from "./session-relay";

type BunSubprocess = ReturnType<typeof Bun.spawn>;

type Claude2Process = {
  proc: BunSubprocess;
  generation: number;
  projectPath: string;
  sessionId: string;
  claudeSessionId?: string;
  model?: string;
  permissionMode?: string;
};

export class Claude2Runtime implements RuntimeResources {
  private readonly processes = new Map<string, Claude2Process>();
  private readonly relays = new Map<string, Claude2SessionRelay>();
  private readonly runDir: string;
  private nextGeneration = 1;
  private onSystemInit:
    | ((sessionId: string, tmuxSessionName: string, claudeSessionId: string, model: string) => void)
    | null = null;

  constructor(runDir: string) {
    this.runDir = runDir;
  }

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

  getSessionState(sessionName: string) {
    const state = this.processes.get(sessionName);
    if (!state) return null;
    return { model: state.model, permissionMode: state.permissionMode };
  }

  setClaudeSessionId(sessionName: string, claudeSessionId: string, model?: string): void {
    const state = this.processes.get(sessionName);
    if (state) {
      if (!state.claudeSessionId) state.claudeSessionId = claudeSessionId;
      if (model && !state.model) state.model = model;
      const relay = this.relays.get(sessionName);
      if (relay) relay.setClaudeSessionId(state.projectPath, claudeSessionId);
    }
  }

  async exists(sessionName: string): Promise<boolean> {
    const proc = this.processes.get(sessionName);
    if (!proc) return false;
    return proc.proc.exitCode === null;
  }

  async close(sessionName: string): Promise<void> {
    const proc = this.processes.get(sessionName);
    if (proc) {
      proc.proc.kill();
      this.processes.delete(sessionName);
    }

    const relay = this.relays.get(sessionName);
    if (relay) {
      relay.destroy();
      this.relays.delete(sessionName);
    }
  }

  async startAgent(metadata: SessionMetadata): Promise<void> {
    await this.spawnAndStart(
      metadata.tmuxSessionName,
      metadata.projectPath,
      metadata.id,
      metadata.claudeSessionId,
      metadata.model,
      metadata.permissionMode,
    );
  }

  async ensureRunning(
    sessionName: string,
    projectPath: string,
    sessionId: string,
    claudeSessionId?: string,
    model?: string,
    permissionMode?: string,
  ): Promise<void> {
    const existing = this.processes.get(sessionName);
    if (existing) {
      if (existing.proc.exitCode === null) {
        if (!existing.claudeSessionId && claudeSessionId)
          existing.claudeSessionId = claudeSessionId;
        if (!existing.model && model) existing.model = model;
        if (!existing.permissionMode && permissionMode) existing.permissionMode = permissionMode;
        const relay = this.relays.get(sessionName);
        if (relay && claudeSessionId) relay.setClaudeSessionId(projectPath, claudeSessionId);
        return;
      }

      this.processes.delete(sessionName);
      const relay = this.relays.get(sessionName);
      if (relay) {
        relay.destroy();
        this.relays.delete(sessionName);
      }
    }

    await this.spawnAndStart(
      sessionName,
      projectPath,
      sessionId,
      claudeSessionId,
      model,
      permissionMode,
    );
  }

  async write(sessionName: string, data: string): Promise<void> {
    const proc = this.processes.get(sessionName);
    if (!proc || proc.proc.exitCode !== null) {
      throw new Error(`Claude2 process not running for session "${sessionName}"`);
    }
    const stdin = proc.proc.stdin;
    if (typeof stdin === "number" || !stdin) {
      throw new Error(`stdin not available for session "${sessionName}"`);
    }
    stdin.write(data);
  }

  async switchModel(
    sessionName: string,
    model: string,
  ): Promise<{ claudeSessionId?: string; projectPath: string } | null> {
    return this.restartWith(sessionName, { model });
  }

  async switchPermissionMode(
    sessionName: string,
    permissionMode: string,
  ): Promise<{ claudeSessionId?: string; projectPath: string } | null> {
    return this.restartWith(sessionName, { permissionMode });
  }

  async stream(
    sessionName: string,
    onData: (data: string) => void,
    onError: (error: Error) => void,
  ): Promise<RuntimeStream> {
    const proc = this.processes.get(sessionName);
    if (!proc) throw new Error(`Session "${sessionName}" not registered`);

    // Destroy any existing relay — replay must start fresh with proper
    // history/output batches. An old relay created during ensureRunning
    // may have been activated before claudeSessionId was known.
    const oldRelay = this.relays.get(sessionName);
    if (oldRelay) {
      oldRelay.destroy();
      this.relays.delete(sessionName);
    }

    const relay = new Claude2SessionRelay();
    this.relays.set(sessionName, relay);

    await relay.activate(proc.projectPath, proc.claudeSessionId).catch(() => {
      this.relays.delete(sessionName);
    });

    return relay.addSubscriber(onData, onError);
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

  // ── private ──

  private async spawnAndStart(
    sessionName: string,
    projectPath: string,
    sessionId: string,
    claudeSessionId?: string,
    model?: string,
    permissionMode?: string,
  ): Promise<void> {
    const proc = this.spawnClaudeDirect(
      sessionName,
      projectPath,
      claudeSessionId,
      model,
      permissionMode,
    );

    const generation = this.nextGeneration++;
    this.processes.set(sessionName, {
      proc,
      generation,
      projectPath,
      sessionId,
      claudeSessionId,
      model,
      permissionMode,
    });

    // Create relay immediately (before stdout starts) so messages aren't lost
    let relay = this.relays.get(sessionName);
    if (relay) {
      relay.destroy();
    }
    relay = new Claude2SessionRelay();
    this.relays.set(sessionName, relay);
    await relay.activate(projectPath, claudeSessionId);

    // Start reading stdout into relay
    const stdout = proc.stdout;
    if (stdout && typeof stdout !== "number") {
      this.readStdout(sessionName, generation, stdout);
    }

    // Pipe stderr to log file
    const stderr = proc.stderr;
    if (stderr && typeof stderr !== "number") {
      const stderrLogPath = join(this.runDir, "claude2-stderr", `${sessionName}.log`);
      void pipeStderrToFile(stderr, stderrLogPath);
    }

    // Monitor process exit
    void proc.exited.then((code) => {
      console.log(`[claude2] process exited with code ${code}: ${sessionName}`);
      if (this.isCurrentGeneration(sessionName, generation)) {
        this.processes.delete(sessionName);
      }
    });
  }

  private spawnClaudeDirect(
    sessionName: string,
    projectPath: string,
    claudeSessionId?: string,
    model?: string,
    permissionMode?: string,
  ): BunSubprocess {
    const args = [
      "claude",
      "--output-format",
      "stream-json",
      "--input-format",
      "stream-json",
      "--verbose",
      "--permission-prompt-tool",
      "stdio",
      ...(permissionMode ? ["--permission-mode", permissionMode] : []),
      ...(model ? ["--model", model] : []),
      ...(claudeSessionId ? ["--resume", claudeSessionId] : []),
    ];

    const proc = Bun.spawn({
      cmd: args,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
      cwd: projectPath,
    });

    console.log(`[claude2] spawned pid=${proc.pid} session=${sessionName}`);
    return proc;
  }

  private async readStdout(
    sessionName: string,
    generation: number,
    stdout: ReadableStream,
  ): Promise<void> {
    const decoder = new TextDecoder();
    let leftover = "";
    const reader = stdout.getReader();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!this.isCurrentGeneration(sessionName, generation)) return;

        const chunk = value as Uint8Array;
        const text = decoder.decode(chunk, { stream: true });
        const lines = (leftover + text).split("\n");
        leftover = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          if (!this.isCurrentGeneration(sessionName, generation)) return;

          this.captureSystemInitFromLine(sessionName, trimmed);
          const relay = this.relays.get(sessionName);
          if (relay && !relay.isDestroyed) {
            await relay.handleStdoutLine(trimmed);
          }
        }
      }

      const trimmed = leftover.trim();
      if (trimmed && this.isCurrentGeneration(sessionName, generation)) {
        this.captureSystemInitFromLine(sessionName, trimmed);
        const relay = this.relays.get(sessionName);
        if (relay && !relay.isDestroyed) {
          await relay.handleStdoutLine(trimmed);
        }
      }
    } catch (error) {
      if (this.isCurrentGeneration(sessionName, generation)) {
        const relay = this.relays.get(sessionName);
        if (relay && !relay.isDestroyed) {
          relay.reportError(error instanceof Error ? error : new Error(String(error)));
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private isCurrentGeneration(sessionName: string, generation: number): boolean {
    return this.processes.get(sessionName)?.generation === generation;
  }

  private captureSystemInitFromLine(sessionName: string, line: string): void {
    try {
      const msg = JSON.parse(line);
      if (msg.type === "system" && msg.subtype === "init" && typeof msg.session_id === "string") {
        const state = this.processes.get(sessionName);
        if (state) {
          if (!state.claudeSessionId) state.claudeSessionId = msg.session_id;
          if (typeof msg.model === "string") state.model = msg.model;
          if (typeof msg.permissionMode === "string") state.permissionMode = msg.permissionMode;
        }
        this.onSystemInit?.(
          state?.sessionId ?? "",
          sessionName,
          msg.session_id,
          typeof msg.model === "string" ? msg.model : "unknown",
        );
      }
    } catch {
      // not JSON or parse failure — skip
    }
  }

  private async restartWith(
    sessionName: string,
    updates: { model?: string; permissionMode?: string },
  ): Promise<{ claudeSessionId?: string; projectPath: string } | null> {
    const state = this.processes.get(sessionName);
    if (!state) return null;

    // Destroy old relay
    const relay = this.relays.get(sessionName);
    if (relay) {
      relay.destroy();
      this.relays.delete(sessionName);
    }

    // Kill old process
    state.proc.kill();
    this.processes.delete(sessionName);

    if (updates.model) state.model = updates.model;
    if (updates.permissionMode) state.permissionMode = updates.permissionMode;

    await this.spawnAndStart(
      sessionName,
      state.projectPath,
      state.sessionId,
      state.claudeSessionId,
      state.model,
      state.permissionMode,
    );

    return { claudeSessionId: state.claudeSessionId, projectPath: state.projectPath };
  }
}

async function pipeStderrToFile(stderr: ReadableStream, logPath: string): Promise<void> {
  try {
    await mkdir(dirname(logPath), { recursive: true });
  } catch {
    // dir might already exist
  }

  const decoder = new TextDecoder();
  const reader = stderr.getReader();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value as Uint8Array;
      buffer += decoder.decode(chunk, { stream: true });
      if (buffer.length > 8192) {
        await appendFile(logPath, buffer).catch(() => {});
        buffer = "";
      }
    }
    if (buffer) await appendFile(logPath, buffer).catch(() => {});
  } finally {
    reader.releaseLock();
  }
}
