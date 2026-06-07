import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import { createServer, type Server } from "node:net";
import { join } from "node:path";
import type { RuntimeResources, RuntimeStream, SessionMetadata } from "./session-registry";

// ── TmuxSharedPipe ──

type PipeSubscriber = {
  onData(data: string): void;
  onError(error: Error): void;
};

export class TmuxSharedPipe {
  private readonly subscribers = new Set<PipeSubscriber>();
  private closed = false;

  private constructor(
    private readonly tmuxSessionName: string,
    private readonly server: Server,
    private readonly socketPath: string,
    private readonly onClose: () => void,
  ) {}

  static async open(tmuxSessionName: string, runDir: string, onClose: () => void) {
    const socketPath = join(runDir, `stream-${randomUUID()}.sock`);
    const pipe = new TmuxSharedPipe(tmuxSessionName, createServer(), socketPath, onClose);
    pipe.server.on("connection", (socket) => {
      socket.on("data", (chunk) => pipe.send(chunk.toString("utf8")));
      socket.on("error", (error) => pipe.error(error));
    });
    await listen(pipe.server, socketPath);
    const pipeCommand = `socat - UNIX-CONNECT:${shellQuote(socketPath)}`;
    const result = await runTmux(["pipe-pane", "-O", "-t", tmuxSessionName, pipeCommand]);

    if (result.exitCode !== 0) {
      await pipe.close();
      throw new TmuxPipeError("Unable to stream tmux session", result.stderr);
    }

    return pipe;
  }

  subscribe(onData: (data: string) => void, onError: (error: Error) => void): RuntimeStream {
    const subscriber = { onData, onError };
    this.subscribers.add(subscriber);

    return {
      close: () => {
        this.subscribers.delete(subscriber);

        if (this.subscribers.size === 0) {
          void this.close();
        }
      },
    };
  }

  private send(data: string) {
    for (const subscriber of this.subscribers) {
      subscriber.onData(data);
    }
  }

  private error(error: Error) {
    for (const subscriber of this.subscribers) {
      subscriber.onError(error);
    }
  }

  private async close() {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.onClose();
    await runTmux(["pipe-pane", "-t", this.tmuxSessionName]);
    await closeServer(this.server);
    await removeSocket(this.socketPath);
  }
}

export class TmuxPipeError extends Error {
  constructor(
    message: string,
    readonly detail: string,
  ) {
    super(message);
    this.name = "TmuxPipeError";
  }
}

const listen = (server: Server, socketPath: string) =>
  new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, () => {
      server.off("error", reject);
      resolve();
    });
  });

const closeServer = (server: Server) =>
  new Promise<void>((resolve) => {
    server.close(() => resolve());
  });

const removeSocket = async (socketPath: string) => {
  try {
    await unlink(socketPath);
  } catch {
    // best effort cleanup
  }
};

const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

export const runTmux = (args: string[]) =>
  new Promise<{ exitCode: number; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn("tmux", args, { stdio: ["ignore", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolve({
        exitCode: exitCode ?? 1,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    });
  });

// ── TmuxRuntime ──

export class TmuxRuntime implements RuntimeResources {
  private readonly pipeStreams = new Map<string, Promise<TmuxSharedPipe>>();

  constructor(private readonly runDir = "/run/agents-remote") {}

  async exists(tmuxSessionName: string) {
    const result = await runTmux(["has-session", "-t", tmuxSessionName]);
    return result.exitCode === 0;
  }

  async startTerminal(metadata: SessionMetadata) {
    await this.startCommand(metadata, shellCommand());
  }

  async startCommand(metadata: SessionMetadata, command: string) {
    const result = await runTmux([
      "new-session",
      "-d",
      "-s",
      metadata.tmuxSessionName,
      "-c",
      metadata.projectPath,
      command,
    ]);

    if (result.exitCode !== 0) {
      throw new TmuxRuntimeError("Unable to start terminal session", result.stderr);
    }
  }

  async close(tmuxSessionName: string) {
    const result = await runTmux(["kill-session", "-t", tmuxSessionName]);

    if (result.exitCode !== 0 && !result.stderr.includes("can't find session")) {
      throw new TmuxRuntimeError("Unable to close terminal session", result.stderr);
    }
  }

  async write(tmuxSessionName: string, data: string) {
    const result = await runTmux(["send-keys", "-t", tmuxSessionName, "-l", data]);

    if (result.exitCode !== 0) {
      throw new TmuxRuntimeError("Unable to write to terminal session", result.stderr);
    }
  }

  async resize(tmuxSessionName: string, cols: number, rows: number) {
    const result = await runTmux([
      "resize-window",
      "-t",
      tmuxSessionName,
      "-x",
      String(cols),
      "-y",
      String(rows),
    ]);

    if (result.exitCode !== 0) {
      throw new TmuxRuntimeError("Unable to resize terminal session", result.stderr);
    }
  }

  async capture(tmuxSessionName: string) {
    const [pane, cursorInfo] = await Promise.all([
      runTmux(["capture-pane", "-p", "-e", "-S", "-5000", "-t", tmuxSessionName]),
      runTmux(["display-message", "-t", tmuxSessionName, "-p", "#{cursor_x}"]),
    ]);

    if (pane.exitCode !== 0) {
      throw new TmuxRuntimeError("Unable to capture terminal session", pane.stderr);
    }

    const text = trimTrailingBlankLines(pane.stdout).replace(/\r?\n/g, "\r\n");

    const cursorX = parseInt(cursorInfo.stdout.trim(), 10);
    if (!isNaN(cursorX)) {
      const lastLineStart = text.lastIndexOf("\r\n");
      const lastLine = lastLineStart === -1 ? text : text.slice(lastLineStart + 2);
      const visibleLen = lastLine.replace(/\[[^a-zA-Z]*[a-zA-Z]/g, "").length;
      if (cursorX > visibleLen) {
        return text + " ".repeat(cursorX - visibleLen);
      }
    }

    return text;
  }

  async stream(
    tmuxSessionName: string,
    onData: (data: string) => void,
    onError: (error: Error) => void,
  ): Promise<RuntimeStream> {
    const stream = await this.sharedPipe(tmuxSessionName);
    return stream.subscribe(onData, onError);
  }

  private async sharedPipe(tmuxSessionName: string) {
    const existing = this.pipeStreams.get(tmuxSessionName);

    if (existing) {
      return existing;
    }

    const next = TmuxSharedPipe.open(tmuxSessionName, this.runDir, () => {
      this.pipeStreams.delete(tmuxSessionName);
    });
    this.pipeStreams.set(tmuxSessionName, next);

    try {
      return await next;
    } catch (error) {
      this.pipeStreams.delete(tmuxSessionName);
      throw error;
    }
  }
}

export class TmuxRuntimeError extends Error {
  constructor(
    message: string,
    readonly detail: string,
  ) {
    super(message);
    this.name = "TmuxRuntimeError";
  }
}

const shellCommand = () => process.env.SHELL ?? "/bin/bash";

const trimTrailingBlankLines = (pane: string) => pane.replace(/[ \t\r\n]+$/g, "");
