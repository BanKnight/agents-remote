// 共享 git 子进程 runner（project-git-diff / project-git-write / checkpoint-service 三处消费）。
// argv 数组直传（无 shell 拼接），cwd 钉在 projectPath。裸 spawn 异常（git 缺失 / E2BIG）
// 统一转 GitRunnerError，由调用方包装成各自的错误码契约（两处 service 的既有行为不变）。
// env 选项合并 process.env（Bun.spawn 显式 env 是全量替换，checkpoint 捕获需要叠加
// GIT_INDEX_FILE / GIT_AUTHOR_* 而不丢父环境）。

export type GitCommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

export type RunGitOptions = {
  /** 叠加在 process.env 之上的覆盖项（undefined 值会被剔除）。 */
  env?: Record<string, string | undefined>;
  /** 超时后 SIGKILL 并 reject（checkpoint 捕获的 5s 预算用）。 */
  timeoutMs?: number;
};

export class GitRunnerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitRunnerError";
  }
}

export const gitArgv = (projectPath: string, args: string[]): string[] => {
  // `git -C ""` 实测会静默落到进程 cwd——空路径必须在入口拒掉，否则读写可能作用到
  // 意外仓库（checkpoint 的读路径不经过 isProjectWorktree 前置）。
  if (!projectPath) throw new GitRunnerError("git runner requires a project path");
  return ["git", "-C", projectPath, ...args];
};

export async function runGit(
  projectPath: string,
  args: string[],
  options: RunGitOptions = {},
): Promise<GitCommandResult> {
  const env = options.env
    ? Object.fromEntries(
        Object.entries({ ...process.env, ...options.env }).filter(
          (entry): entry is [string, string] => entry[1] !== undefined,
        ),
      )
    : undefined;

  try {
    const proc = Bun.spawn({
      cmd: gitArgv(projectPath, args),
      stderr: "pipe",
      stdout: "pipe",
      ...(env ? { env } : {}),
    });

    let timer: ReturnType<typeof setTimeout> | undefined;
    if (options.timeoutMs !== undefined) {
      // SIGKILL 而非默认 SIGTERM：git 的 SIGTERM handler 会走「尽量体面退出」路径，
      // 捕获链路要的是「超时即断」，否则预算形同虚设。
      timer = setTimeout(() => proc.kill("SIGKILL"), options.timeoutMs);
    }
    try {
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);
      return { stdout, stderr, exitCode };
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  } catch (error) {
    throw new GitRunnerError(error instanceof Error ? error.message : String(error));
  }
}
