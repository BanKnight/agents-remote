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

/**
 * 非交互 spawn 任意 CLI。`makeError` 由调用方提供，把 spawn/超时错误归一到各自的业务错误类型
 * （skill→SkillError(code)、mcp→McpError(code)），UI 翻译才能对症。
 */
export async function runCliTool(
  cmd: string[],
  opts: { timeoutMs?: number; cwd?: string; makeError: (message: string) => Error },
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
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
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

export { DEFAULT_TIMEOUT_MS };
