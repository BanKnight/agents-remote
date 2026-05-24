import { spawn } from "node:child_process";
import type { AgentProvider } from "@agents-remote/shared";
import {
  SessionRegistryError,
  type RuntimeResources,
  type SessionMetadata,
} from "./session-registry";

export class TmuxRuntime implements RuntimeResources {
  async exists(tmuxSessionName: string) {
    const result = await runTmux(["has-session", "-t", tmuxSessionName]);
    return result.exitCode === 0;
  }

  async startTerminal(metadata: SessionMetadata) {
    await this.startSession(metadata, shellCommand());
  }

  async startAgent(metadata: SessionMetadata) {
    const command = providerCommand(metadata.provider);

    if (!command) {
      throw new SessionRegistryError(
        "SESSION_PROVIDER_UNAVAILABLE",
        "Agent provider is unavailable",
      );
    }

    try {
      await this.startSession(metadata, command);
    } catch (error) {
      if (error instanceof TmuxRuntimeError) {
        throw new SessionRegistryError(
          "SESSION_PROVIDER_UNAVAILABLE",
          "Agent provider is unavailable",
        );
      }

      throw error;
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
    const result = await runTmux(["capture-pane", "-p", "-J", "-t", tmuxSessionName]);

    if (result.exitCode !== 0) {
      throw new TmuxRuntimeError("Unable to capture terminal session", result.stderr);
    }

    return result.stdout;
  }

  private async startSession(metadata: SessionMetadata, command: string) {
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

const providerCommand = (provider: AgentProvider | undefined) => {
  if (provider === "claude") {
    return "claude";
  }

  if (provider === "codex") {
    return "codex";
  }

  return undefined;
};

const runTmux = (args: string[]) =>
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
