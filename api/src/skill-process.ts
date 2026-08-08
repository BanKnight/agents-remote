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
import { runCliTool } from "./cli-process";

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
/** add/update 走 git clone，给足时间（与 vercel-labs/skills 内置 5min 一致）。 */
export const INSTALL_SKILL_TIMEOUT_MS = 300_000;

/**
 * 非交互 spawn `npx skills`，委托通用 {@link runCliTool}。
 *
 * failureCode 由调用方按业务场景传入（install→SKILL_INSTALL_FAILED、list→SKILL_LIST_FAILED…），
 * 任何 spawn/超时/exited 错误统一归到该 code，UI 翻译才能对症。
 */
export async function runSkillsCommand(
  args: string[],
  opts: { timeoutMs?: number; failureCode?: SkillErrorCode } = {},
): Promise<SkillsCommandResult> {
  const failureCode = opts.failureCode ?? "SKILL_INSTALL_FAILED";
  const cmd = [SKILLS_BIN, ...SKILLS_BASE_ARGS, ...args];
  return runCliTool(cmd, {
    timeoutMs: opts.timeoutMs,
    makeError: (message) => new SkillError(failureCode, message),
  });
}
