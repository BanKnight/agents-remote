import { TmuxSharedPipe, runTmux } from "./pipe-pane";
import type { RuntimeResources, RuntimeStream, SessionMetadata } from "./session-registry";

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
