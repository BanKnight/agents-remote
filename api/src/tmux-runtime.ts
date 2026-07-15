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

  /**
   * 一次 `tmux list-sessions` 拿全部存活 tmux session 名（= runtimeKey），供 SessionRegistry
   * 批量探活（1 次 spawn 替代 M 次 has-session）。tmux server 未运行时 exitCode 非 0，返回空集。
   */
  async listAliveRuntimeKeys(): Promise<Set<string>> {
    const result = await runTmux(["list-sessions", "-F", "#{session_name}"]);
    if (result.exitCode !== 0) return new Set();
    return new Set(
      result.stdout
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0),
    );
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

    // history-limit 提高 tmux pane 自身保留的 scrollback 深度上限。桌面滚轮/移动触摸都走 tmux copy-mode
    // （tmux 全局 mouse on：桌面 wheel → xterm 鼠标模式转 SGR 序列 → WheelUpPane → copy-mode -e；
    // 移动 touch 发同款 SGR 序列走同路径）滚这份 server scrollback，故上限要设够大。服务端 attach()
    // 对桌面/移动一视同仁（同 output 流），不区分。
    // prefix None 让 Ctrl-B 等透传 pane（vim/readline 的 Ctrl-B 不被 tmux 前缀截获）。
    await runTmux(["set-option", "-t", metadata.runtimeKey, "history-limit", "50000"]);
    await runTmux(["set-option", "-t", metadata.runtimeKey, "prefix", "None"]);
  }

  async close(runtimeKey: string) {
    const result = await runTmux(["kill-session", "-t", runtimeKey]);

    if (result.exitCode !== 0 && !result.stderr.includes("can't find session")) {
      throw new TmuxRuntimeError("Unable to close terminal session", result.stderr);
    }
  }

  // 只读 capture-pane，用于 list/detail 的 extractLastCommand。attach 模式下不再做主力渲染，
  // 故不带 cols/rows、不追加 CUP——TUI 全态渲染由 attach 进程的 tmux 原生重绘负责。
  // -S -100：唯一消费者 extractLastCommand 只取最后一行非空，100 行足够；-5000 是 50 倍无效输出。
  async capture(runtimeKey: string): Promise<string> {
    const result = await runTmux(["capture-pane", "-p", "-e", "-S", "-100", "-t", runtimeKey]);

    if (result.exitCode !== 0) {
      throw new TmuxRuntimeError("Unable to capture terminal session", result.stderr);
    }

    return trimTrailingBlankLines(result.stdout).replace(/\r?\n/g, "\r\n");
  }

  // 每个 WS 客户端 spawn 一个 `tmux attach -t <runtimeKey>` 子进程（Bun 原生 terminal PTY）。
  // tmux server 原生全态渲染（光标/alt-screen/resize 重绘全对），PTY stdout→data 回调→onData→WS→xterm.js。
  // 注意：attach【不重放 pane scrollback】，只发当前屏（实测 500 行历史，新 attach PTY 只收 ~24 行当前屏）。
  //   故 xterm 本地 buffer 只有 attach 后的内容，看 attach 前历史必须走 tmux copy-mode 滚 server
  //   scrollback（桌面 wheel 经 mouse on→WheelUpPane→copy-mode -e；移动 touch 发同款 SGR 序列走同路径，
  //   见 SessionDetailRoute touch handler 注释）。history-limit 决定这份 server scrollback 的深度上限。
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
