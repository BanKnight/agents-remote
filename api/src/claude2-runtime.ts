import { appendFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { TmuxSharedPipe, runTmux } from "./pipe-pane";
import type { RuntimeResources, RuntimeStream, SessionMetadata } from "./session-registry";
import {
  ensureTurnDir,
  getStdinFifo,
  getTurnDir,
  readFileLines,
  removeTurnDir,
} from "./turn-files";
import { Claude2SessionRelay } from "./session-relay";

type Claude2SessionState = {
  projectPath: string;
  sessionId: string;
  claudeSessionId?: string;
  model?: string;
  permissionMode?: string;
};

export class Claude2Runtime implements RuntimeResources {
  private readonly sessions = new Map<string, Claude2SessionState>();
  private readonly pipeStreams = new Map<string, Promise<TmuxSharedPipe>>();
  private readonly relays = new Map<string, Claude2SessionRelay>();
  private readonly runDir: string;
  private readonly helperPath: string;
  private onSystemInit:
    | ((sessionId: string, tmuxSessionName: string, claudeSessionId: string, model: string) => void)
    | null = null;

  constructor(runDir: string) {
    this.runDir = runDir;
    // stdout-helper lives alongside this file at api/src/stdout-helper.ts
    this.helperPath = join(import.meta.dirname, "stdout-helper.ts");
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
    const state = this.sessions.get(sessionName);
    if (!state) return null;
    return { model: state.model, permissionMode: state.permissionMode };
  }

  async exists(sessionName: string): Promise<boolean> {
    if (this.sessions.has(sessionName)) return true;
    if (!sessionName.includes("-agent-claude2-")) return false;
    const result = await runTmux(["has-session", "-t", sessionName]);
    return result.exitCode === 0;
  }

  async close(sessionName: string): Promise<void> {
    // Kill tmux session
    const result = await runTmux(["kill-session", "-t", sessionName]);
    if (result.exitCode !== 0 && !result.stderr.includes("can't find session")) {
      // ignore — session may already be gone
    }

    // Destroy session relay
    const relay = this.relays.get(sessionName);
    if (relay) {
      relay.destroy();
      this.relays.delete(sessionName);
    }

    // Drop cached pipe stream
    this.pipeStreams.delete(sessionName);

    // Clean up FIFO
    try {
      await unlink(getStdinFifo(this.runDir, sessionName));
    } catch {
      // best effort
    }

    // Clean up turn directory
    await removeTurnDir(getTurnDir(this.runDir, sessionName));

    this.sessions.delete(sessionName);
  }

  async startAgent(metadata: SessionMetadata): Promise<void> {
    await this.spawnClaudeInTmux(
      metadata.tmuxSessionName,
      metadata.projectPath,
      metadata.claudeSessionId,
      metadata.model,
      metadata.permissionMode,
    );

    this.sessions.set(metadata.tmuxSessionName, {
      projectPath: metadata.projectPath,
      sessionId: metadata.id,
      claudeSessionId: metadata.claudeSessionId,
      model: metadata.model,
      permissionMode: metadata.permissionMode,
    });

    this.detectSystemInit(metadata.tmuxSessionName, metadata.id);
  }

  async ensureRunning(
    sessionName: string,
    projectPath: string,
    sessionId: string,
    claudeSessionId?: string,
    model?: string,
    permissionMode?: string,
  ): Promise<void> {
    if (this.sessions.has(sessionName)) return;

    const exists = await runTmux(["has-session", "-t", sessionName]);
    if (exists.exitCode === 0) {
      this.sessions.set(sessionName, {
        projectPath,
        sessionId,
        claudeSessionId,
        model,
        permissionMode,
      });

      // Reconnected session — poll for system.init to capture
      // claudeSessionId, model, and permissionMode from the CLI.
      this.detectSystemInit(sessionName, sessionId);
      return;
    }

    await this.spawnClaudeInTmux(sessionName, projectPath, claudeSessionId, model, permissionMode);

    this.sessions.set(sessionName, {
      projectPath,
      sessionId,
      claudeSessionId,
      model,
      permissionMode,
    });

    this.detectSystemInit(sessionName, sessionId);
  }

  async write(sessionName: string, data: string): Promise<void> {
    const result = await runTmux(["has-session", "-t", sessionName]);
    if (result.exitCode !== 0) {
      throw new Error(`Claude2 process not running for session "${sessionName}"`);
    }
    await appendFile(getStdinFifo(this.runDir, sessionName), data);
  }

  async switchModel(
    sessionName: string,
    model: string,
  ): Promise<{ claudeSessionId?: string; projectPath: string } | null> {
    const state = this.sessions.get(sessionName);
    if (!state) return null;

    const relay = this.relays.get(sessionName);
    if (relay) {
      relay.destroy();
      this.relays.delete(sessionName);
    }

    await runTmux(["kill-session", "-t", sessionName]);
    this.pipeStreams.delete(sessionName);

    await this.spawnClaudeInTmux(
      sessionName,
      state.projectPath,
      state.claudeSessionId,
      model,
      state.permissionMode,
    );
    state.model = model;

    return { claudeSessionId: state.claudeSessionId, projectPath: state.projectPath };
  }

  async switchPermissionMode(
    sessionName: string,
    permissionMode: string,
  ): Promise<{ claudeSessionId?: string; projectPath: string } | null> {
    const state = this.sessions.get(sessionName);
    if (!state) return null;

    const relay = this.relays.get(sessionName);
    if (relay) {
      relay.destroy();
      this.relays.delete(sessionName);
    }

    await runTmux(["kill-session", "-t", sessionName]);
    this.pipeStreams.delete(sessionName);

    await this.spawnClaudeInTmux(
      sessionName,
      state.projectPath,
      state.claudeSessionId,
      state.model,
      permissionMode,
    );
    state.permissionMode = permissionMode;

    return { claudeSessionId: state.claudeSessionId, projectPath: state.projectPath };
  }

  async stream(
    sessionName: string,
    onData: (data: string) => void,
    onError: (error: Error) => void,
  ): Promise<RuntimeStream> {
    const state = this.sessions.get(sessionName);
    if (!state) throw new Error(`Session "${sessionName}" not registered`);

    let relay = this.relays.get(sessionName);
    if (!relay) {
      relay = new Claude2SessionRelay();
      this.relays.set(sessionName, relay);

      relay
        .activate(
          this.runDir,
          state.projectPath,
          state.claudeSessionId,
          (name) => this.ensureSharedPipe(name),
          sessionName,
        )
        .catch(() => {
          // Error already broadcast to subscribers via broadcastError in
          // doActivate. Clean up the stale relay entry so the next stream()
          // call can retry with a fresh one.
          this.relays.delete(sessionName);
        });
    }

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

  private async spawnClaudeInTmux(
    sessionName: string,
    projectPath: string,
    claudeSessionId?: string,
    model?: string,
    permissionMode?: string,
  ) {
    const turnDir = await ensureTurnDir(this.runDir, sessionName);
    const fifoPath = getStdinFifo(this.runDir, sessionName);

    const claudeArgs = [
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

    // Build the tmux shell command as a single string.
    // Steps: create dirs → mkfifo → keep fifo open → run claude | stdout-helper
    const script = [
      `mkdir -p ${q(turnDir)} ${q(join(this.runDir, "claude2-fifo"))}`,
      `rm -f ${q(fifoPath)}`,
      `mkfifo ${q(fifoPath)}`,
      `exec 3<> ${q(fifoPath)}`,
      claudeArgs.join(" "),
      `< ${q(fifoPath)}`,
      `2>> ${q(join(turnDir, "..", "claude2.stderr.log"))}`,
      "|",
      "bun",
      "run",
      q(this.helperPath),
      q(turnDir),
    ].join(" ");

    const result = await runTmux([
      "new-session",
      "-d",
      "-s",
      sessionName,
      "-c",
      projectPath,
      script,
    ]);

    if (result.exitCode !== 0) {
      throw new Error(`Failed to start Claude2 tmux session "${sessionName}": ${result.stderr}`);
    }
  }

  /**
   * Poll turn_000.jsonl for the system.init message.
   * For new sessions, system.init only arrives after the first user message,
   * so the polling is best-effort with a timeout.
   */
  private detectSystemInit(sessionName: string, sessionId: string) {
    const turnDir = getTurnDir(this.runDir, sessionName);
    void (async () => {
      for (let attempt = 0; attempt < 8; attempt++) {
        await sleep(300 + attempt * 150);
        try {
          const lines = await readFileLines(join(turnDir, "turn_000.jsonl"));
          for (const line of lines) {
            try {
              const msg = JSON.parse(line);
              if (
                msg.type === "system" &&
                msg.subtype === "init" &&
                typeof msg.session_id === "string"
              ) {
                const state = this.sessions.get(sessionName);
                if (state) {
                  if (!state.claudeSessionId) state.claudeSessionId = msg.session_id;
                  if (typeof msg.model === "string") state.model = msg.model;
                  if (typeof msg.permissionMode === "string")
                    state.permissionMode = msg.permissionMode;
                }
                this.onSystemInit?.(
                  sessionId,
                  sessionName,
                  msg.session_id,
                  typeof msg.model === "string" ? msg.model : "unknown",
                );
                return;
              }
            } catch {
              continue;
            }
          }
        } catch {
          // turn file not ready
        }
      }
    })();
  }

  private async ensureSharedPipe(sessionName: string): Promise<TmuxSharedPipe> {
    const existing = this.pipeStreams.get(sessionName);
    if (existing) return existing;

    const next = TmuxSharedPipe.open(sessionName, this.runDir, () => {
      this.pipeStreams.delete(sessionName);
    });
    this.pipeStreams.set(sessionName, next);

    try {
      return await next;
    } catch (error) {
      this.pipeStreams.delete(sessionName);
      throw error;
    }
  }
}

const q = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
