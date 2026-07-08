import { spawn } from "node:child_process";
import type {
  AttachHandle,
  AttachOptions,
  RuntimeResources,
  SessionMetadata,
} from "./session-registry";

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
  constructor(private readonly runDir = "/run/agents-remote") {}

  async exists(runtimeKey: string) {
    const result = await runTmux(["has-session", "-t", runtimeKey]);
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
      metadata.runtimeKey,
      "-x",
      "200",
      "-y",
      "50",
      "-c",
      metadata.projectPath,
      command,
    ]);

    if (result.exitCode !== 0) {
      throw new TmuxRuntimeError("Unable to start terminal session", result.stderr);
    }

    // window-size=latest：attached client 的 PTY TIOCSWINSZ 生效，不被 resize-window 钉成 manual。
    // session scope（-t runtimeKey）非全局，避免影响开发者本机其他 tmux 会话。
    await runTmux(["set-option", "-t", metadata.runtimeKey, "window-size", "latest"]);
  }

  async close(runtimeKey: string) {
    const result = await runTmux(["kill-session", "-t", runtimeKey]);

    if (result.exitCode !== 0 && !result.stderr.includes("can't find session")) {
      throw new TmuxRuntimeError("Unable to close terminal session", result.stderr);
    }
  }

  // 只读 capture-pane，用于 list/detail 的 extractLastCommand。attach 模式下不再做主力渲染，
  // 故不带 cols/rows、不追加 CUP——TUI 全态渲染由 attach 进程的 tmux 原生重绘负责。
  async capture(runtimeKey: string): Promise<string> {
    const result = await runTmux(["capture-pane", "-p", "-e", "-S", "-5000", "-t", runtimeKey]);

    if (result.exitCode !== 0) {
      throw new TmuxRuntimeError("Unable to capture terminal session", result.stderr);
    }

    return trimTrailingBlankLines(result.stdout).replace(/\r?\n/g, "\r\n");
  }

  // 每个 WS 客户端 spawn 一个 `tmux attach -t <runtimeKey>` 子进程（Bun 原生 terminal PTY）。
  // tmux server 原生全态渲染（光标/alt-screen/resize 重绘全对），PTY stdout→data 回调→onData→WS→xterm.js。
  // PoC 验证：data 回调给 Buffer/Uint8Array 非 string，这里转 string 让 AttachHandle.onData 契约为 string；
  // 子进程退出靠 proc.exited + 顶层 onExit（双挂 + exited flag 去重），terminal.exit 不可靠不用。
  async attach(
    runtimeKey: string,
    onData: (data: string) => void,
    onError: (error: Error) => void,
    opts: AttachOptions,
  ): Promise<AttachHandle> {
    if (!/^[A-Za-z0-9._-]+$/.test(runtimeKey)) {
      throw new TmuxRuntimeError("Invalid session name", runtimeKey);
    }

    if (!(await this.exists(runtimeKey))) {
      throw new TmuxRuntimeError("Session not found", runtimeKey);
    }

    const cols = opts.cols > 0 ? opts.cols : 80;
    const rows = opts.rows > 0 ? opts.rows : 24;
    let exited = false;
    const exitCbs = new Set<(code: number | null) => void>();

    const proc = Bun.spawn(["tmux", "attach", "-t", runtimeKey], {
      env: { ...process.env, TERM: "xterm-256color" },
      terminal: {
        cols,
        rows,
        name: "xterm-256color",
        data(_terminal, data) {
          try {
            onData(typeof data === "string" ? data : Buffer.from(data).toString("utf8"));
          } catch (error) {
            onError(error instanceof Error ? error : new Error(String(error)));
          }
        },
      },
      onExit(_subprocess, code) {
        if (exited) return;
        exited = true;
        for (const cb of exitCbs) cb(code ?? null);
      },
    });

    // proc.exited 与顶层 onExit 双挂去重（Bun 历史有 onExit 不触发 issue）。
    void proc.exited.then((code) => {
      if (exited) return;
      exited = true;
      for (const cb of exitCbs) cb(code ?? null);
    });

    return {
      write(data) {
        if (exited) return;
        try {
          proc.terminal?.write(data);
        } catch (error) {
          onError(error instanceof Error ? error : new Error(String(error)));
        }
      },
      resize(nextCols, nextRows) {
        if (exited) return;
        try {
          proc.terminal?.resize(nextCols, nextRows);
        } catch {
          // resize 失败（进程已退出等）忽略，onExit 会接管
        }
      },
      close() {
        if (exited) return;
        try {
          proc.kill("SIGTERM");
        } catch {
          // 进程已退出则忽略
        }
        void proc.exited
          .catch(() => undefined)
          .finally(() => {
            try {
              proc.terminal?.close();
            } catch {
              // best effort
            }
          });
      },
      onExit(cb) {
        exitCbs.add(cb);
      },
    };
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

/** ANSI escape 序列正则：SGR（`\x1b[...m`）/ 光标移动 / OSC（`\x1b]...\x07`）/ bel，用于剥离 pane 文本色码。 */
// eslint-disable-next-line no-control-regex -- ANSI 剥离必需含控制字符 \x1b/\x07，无绕过必要
const ANSI_ESCAPE = /\x1b\[[0-9;?]*[A-Za-z]|\x1b[=>]|\x1b\][^\x07]*\x07|\x07/g;

/** 去 ANSI escape 序列，返回纯可见文本。 */
const stripAnsi = (text: string): string => text.replace(ANSI_ESCAPE, "");

/**
 * 从 capture-pane 文本提取最后一行非空内容作为 lastCommand（忠实显示，不去 prompt 符）。
 * capture 返回的文本已是 trimTrailingBlankLines + `\r\n` 行分隔（见 TmuxRuntime.capture）。
 * 倒序找首个 trim 后非空行，stripAnsi 后返回；全空返回 undefined。
 */
export const extractLastCommand = (pane: string): string | undefined => {
  const lines = pane.split("\r\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const stripped = stripAnsi(lines[i] ?? "").trim();
    if (stripped.length > 0) return stripped;
  }
  return undefined;
};
