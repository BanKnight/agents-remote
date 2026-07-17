// 校验层（纯函数 + 错误类型）拆到 skill-validate；此处 re-export 让调用方保持
// 单一 import 源 `from "./skill-process"`，同时让单测可 mock 本文件的 runSkillsCommand
// 而不影响校验纯函数（skill-validate 不被 mock）。
export {
  sanitizeSource,
  sanitizeSkillId,
  sanitizeSkillName,
  SkillError,
  type SkillErrorCode,
} from "./skill-validate";
import { SkillError, type SkillErrorCode } from "./skill-validate";

/**
 * skills CLI 一次性执行结果。
 * stdout 含 ANSI/clack TUI 装饰，不可机读——调用方只信任 exitCode，
 * 业务真相用 `list --json` 回读（UI = f(state)，单一 state 管道）。
 */
export type SkillsCommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

const SKILLS_BIN = "npx";
const SKILLS_BASE_ARGS = ["-y", "skills@latest"];
const DEFAULT_TIMEOUT_MS = 60_000;
/** add/update 走 git clone，给足时间（与 vercel-labs/skills 内置 5min 一致）。 */
export const INSTALL_SKILL_TIMEOUT_MS = 300_000;

/**
 * 非交互 spawn `npx skills`：stdin=ignore 确保 non-TTY（CLI 检测到自动 --yes），
 * env 继承父进程（HOME/PATH/GITHUB_TOKEN 等）+ DISABLE_TELEMETRY=1 关闭上报（隐私）。
 * argv 数组拼装，绝不 shell 拼接（项目安全铁律）。超时 kill 子进程。
 *
 * failureCode 由调用方按业务场景传入（install→SKILL_INSTALL_FAILED、list→SKILL_LIST_FAILED…），
 * 任何 spawn/超时/exited 错误统一归到该 code，UI 翻译才能对症。
 */
export async function runSkillsCommand(
  args: string[],
  opts: { timeoutMs?: number; failureCode?: SkillErrorCode } = {},
): Promise<SkillsCommandResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const failureCode = opts.failureCode ?? "SKILL_INSTALL_FAILED";
  const cmd = [SKILLS_BIN, ...SKILLS_BASE_ARGS, ...args];
  const env: Record<string, string | undefined> = {
    ...process.env,
    DISABLE_TELEMETRY: "1",
  };

  try {
    const proc = Bun.spawn({
      cmd,
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
          reject(new SkillError(failureCode, `skills CLI timed out after ${timeoutMs}ms`));
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
    throw error instanceof SkillError
      ? error
      : new SkillError(failureCode, error instanceof Error ? error.message : String(error));
  }
}
