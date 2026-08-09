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
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

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

const SKILLS_BIN = "node"; // skills bin 是 .mjs（shebang #!/usr/bin/env node），用 node 直跑

// skills 作 api 本地依赖（省 `npx -y skills@latest` 每次 ~8s 的 registry 往返 + 下载，实测
// spawn 8.316s → 0.169s）。resolve 包实体路径（Bun 内容寻址 layout hoist 到
// node_modules/.bun/skills@<ver>/node_modules/skills/），拼 bin/cli.mjs —— 不依赖 cwd / PATH。
// lazy resolve：首次 runSkillsCommand 调用时解析并缓存，避免模块 import 副作用 + test 场景触发。
let skillsCliPath: string | undefined;
function resolveSkillsCli(): string {
  if (skillsCliPath) return skillsCliPath;
  const pkg = createRequire(import.meta.url).resolve("skills/package.json");
  skillsCliPath = join(dirname(pkg), "bin", "cli.mjs");
  return skillsCliPath;
}

/** add/update 走 git clone，给足时间（与 vercel-labs/skills 内置 5min 一致）。 */
export const INSTALL_SKILL_TIMEOUT_MS = 300_000;

/**
 * 非交互 spawn 本地 skills CLI（`node <resolved>/bin/cli.mjs`），委托通用 {@link runCliTool}。
 *
 * failureCode 由调用方按业务场景传入（install→SKILL_INSTALL_FAILED、list→SKILL_LIST_FAILED…），
 * 任何 spawn/超时/exited 错误统一归到该 code，UI 翻译才能对症。
 */
export async function runSkillsCommand(
  args: string[],
  opts: {
    timeoutMs?: number;
    failureCode?: SkillErrorCode;
    // install/update（git clone，孙进程 git/npm 易孤儿）开启进程组 kill；
    // onChunk 两态 UI 不传（drain 本身防管道死锁，非为进度）。其余场景（list/search…）走默认 mcp 同构路径。
    onChunk?: (stream: "stdout" | "stderr", chunk: string) => void;
    killProcessGroup?: boolean;
  } = {},
): Promise<SkillsCommandResult> {
  const failureCode = opts.failureCode ?? "SKILL_INSTALL_FAILED";
  const cmd = [SKILLS_BIN, resolveSkillsCli(), ...args];
  return runCliTool(cmd, {
    timeoutMs: opts.timeoutMs,
    makeError: (message) => new SkillError(failureCode, message),
    onChunk: opts.onChunk,
    killProcessGroup: opts.killProcessGroup,
  });
}
