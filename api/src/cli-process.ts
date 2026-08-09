/**
 * 通用非交互 CLI spawn helper，供 skill（wrap `npx skills`）与 MCP（wrap `claude mcp`）共用。
 *
 * 两子系统同构（见 docs/research/plugin-extension-system.md §实现前调研结论）：都是
 * 「wrap 命令执行 + 自读结构化存储」混合路线，spawn 机制完全一致——抽此 helper 去重。
 *
 * stdin=ignore 确保 non-TTY（CLI 检测到自动 --yes / 非交互）；env 继承父进程
 * （HOME/PATH/GITHUB_TOKEN 等）+ DISABLE_TELEMETRY=1 关闭上报。argv 数组拼装，绝不 shell 拼接
 * （项目安全铁律）。超时 kill 子进程。
 *
 * 调用方只信任 exitCode + 事后自读结构化存储（~/.agents/.skill-lock.json / ~/.claude.json /
 * .mcp.json）为业务真相；stdout 含 ANSI/TUI 装饰，不可机读。
 */

/** CLI 一次性执行结果。stdout/stderr 仅用于错误诊断，业务真相由调用方自读存储。 */
export type CliToolResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

const DEFAULT_TIMEOUT_MS = 60_000;

// 进程组 kill 的 SIGTERM→SIGKILL 升级宽限：给子进程 5s 优雅退出，仍活则强杀。
const PROCESS_GROUP_KILL_GRACE_MS = 5_000;

/**
 * 非交互 spawn 任意 CLI。`makeError` 由调用方提供，把 spawn/超时错误归一到各自的业务错误类型
 * （skill→SkillError(code)、mcp→McpError(code)），UI 翻译才能对症。
 *
 * `killProcessGroup`（默认 false）开启进程组模式：detached setsid（子进程成进程组 leader，
 * pid=pgid）+ 并发流式 drain stdout/stderr + 超时杀整组（SIGTERM→5s→SIGKILL）。仅 skill
 * install/update（git clone，孙进程 git/npm 易孤儿）开启；mcp/uninstall 不传则走现有路径逐字不变。
 *
 * `onChunk`（可选）在进程组路径 drain 时逐 chunk 回调；两态 UI 不传（drain 本身是防管道死锁）。
 */
export async function runCliTool(
  cmd: string[],
  opts: {
    timeoutMs?: number;
    cwd?: string;
    makeError: (message: string) => Error;
    onChunk?: (stream: "stdout" | "stderr", chunk: string) => void;
    killProcessGroup?: boolean;
  },
): Promise<CliToolResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const env: Record<string, string | undefined> = {
    ...process.env,
    DISABLE_TELEMETRY: "1",
  };

  try {
    const proc = Bun.spawn({
      cmd,
      cwd: opts.cwd,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      env,
      // setsid：子进程成新会话/进程组 leader（pid=pgid），使 process.kill(-pid) 能杀整组。
      detached: opts.killProcessGroup === true,
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      // ── 进程组路径（skill install/update）：并发 drain + 组 kill ──
      // 并发 drain 防 git clone 大量进度输出撑爆 64KB 管道缓冲 → 进程阻塞写不进 → 死锁到超时。
      if (opts.killProcessGroup === true) {
        return await new Promise<CliToolResult>((resolve, reject) => {
          timer = setTimeout(() => {
            killProcessGroup(proc.pid);
            reject(new Error(`${cmd[0] ?? "CLI"} timed out after ${timeoutMs}ms`));
          }, timeoutMs);
          Promise.all([
            proc.exited.then(
              (c) => c,
              (err: unknown) => {
                throw err instanceof Error ? err : new Error(String(err));
              },
            ),
            drainStream(proc.stdout, "stdout", opts.onChunk),
            drainStream(proc.stderr, "stderr", opts.onChunk),
          ])
            .then(([exitCode, stdout, stderr]) => resolve({ exitCode, stdout, stderr }))
            .catch(reject);
        });
      }

      // ── 现有路径（mcp + uninstall）：exit 后一次性读 stdout/stderr ──
      const exitCode = await new Promise<number>((resolve, reject) => {
        timer = setTimeout(() => {
          try {
            proc.kill();
          } catch {
            // already exited
          }
          reject(new Error(`${cmd[0] ?? "CLI"} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
        proc.exited.then(resolve, (err: unknown) =>
          reject(err instanceof Error ? err : new Error(String(err))),
        );
      });
      const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);
      return { exitCode, stdout, stderr };
    } finally {
      if (timer) clearTimeout(timer);
    }
  } catch (error) {
    throw opts.makeError(error instanceof Error ? error.message : String(error));
  }
}

/** 流式读 ReadableStream，累加文本；onChunk 可选回调（两态 UI 不传）。 */
async function drainStream(
  stream: ReadableStream<Uint8Array>,
  label: "stdout" | "stderr",
  onChunk?: (stream: "stdout" | "stderr", chunk: string) => void,
): Promise<string> {
  const reader = stream.getReader();
  const dec = new TextDecoder();
  let acc = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = dec.decode(value, { stream: true });
    acc += text;
    if (onChunk) onChunk(label, text);
  }
  return acc + dec.decode();
}

/**
 * 杀整个进程组：SIGTERM → 容忍 grace → SIGKILL。pid 须是 detached spawn 的进程组 id。
 * 负 pid kill 对已退出组抛 ESRCH → 吞。升级序列防子进程忽略 SIGTERM 挂死。
 */
function killProcessGroup(pgid: number): void {
  try {
    process.kill(-pgid, "SIGTERM");
  } catch {
    return; // 组已退出（ESRCH）
  }
  // SIGKILL 兜底 timer 用 unref：进程组通常已随 SIGTERM 退出，此 timer 仅防"忽略 SIGTERM 挂死"
  // 的极端态；unref 让进程不必空等 5s 才退出（测试/关停场景）。
  const t = setTimeout(() => {
    try {
      process.kill(-pgid, "SIGKILL");
    } catch {
      // 组已退出（ESRCH）
    }
  }, PROCESS_GROUP_KILL_GRACE_MS);
  t.unref();
}

export { DEFAULT_TIMEOUT_MS };
