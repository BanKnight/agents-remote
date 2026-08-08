import type { ApiErrorCode, SkillSourceType } from "@agents-remote/shared";

/**
 * skill CLI wrap 相关的错误码子集。
 */
export type SkillErrorCode = Extract<
  ApiErrorCode,
  | "SKILL_MARKET_FETCH_FAILED"
  | "SKILL_INSTALL_FAILED"
  | "SKILL_UNINSTALL_FAILED"
  | "SKILL_PREVIEW_FAILED"
  | "SKILL_LIST_FAILED"
  | "SKILL_SOURCE_INVALID"
  | "SKILL_UPDATE_CHECK_FAILED"
  | "SKILL_UPDATE_FAILED"
>;

/** skill 操作统一错误类型，携带 ApiErrorCode 供 HTTP 层翻译。 */
export class SkillError extends Error {
  constructor(
    readonly code: SkillErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SkillError";
  }
}

/** GitHub owner/repo（source）：允许 `owner/repo`，拒绝 `..` 段、绝对路径、null byte、前后斜杠。
 *  github / git 源共用（owner/name shorthand，对应 skills CLI source 语法；非 GitHub 的完整 git URL 暂不支持，后续扩展）。 */
const SOURCE_RE = /^(?!.*\.\.)[\w.-]+\/[\w.-]+$/;
/** skill name / skillId：skills.sh search 返回与 CLI --skill 接受的 token。 */
const SKILL_TOKEN_RE = /^[a-zA-Z0-9._-]+$/;

function rejectEmpty(input: unknown): string {
  if (typeof input !== "string" || input.length === 0 || input.includes("\0")) {
    throw new SkillError("SKILL_SOURCE_INVALID", "Invalid skill input");
  }
  return input.trim();
}

/**
 * 校验 skill 源字符串。按 type 分支：
 * - github / git：owner/name shorthand（SOURCE_RE）。
 * - local：绝对路径（相对路径语义不稳），拒 null byte；`..`/越界在 skill-market addSkillSource
 *   的 realpath 兜底（local 源是用户机上的任意目录，无白名单信任边界，存在性 + realpath 规范化即可）。
 */
export function sanitizeSource(input: string, type: SkillSourceType = "github"): string {
  const value = rejectEmpty(input);
  if (type === "local") {
    if (!value.startsWith("/")) {
      throw new SkillError(
        "SKILL_SOURCE_INVALID",
        `Local source must be an absolute path: ${value}`,
      );
    }
    return value;
  }
  if (!SOURCE_RE.test(value)) {
    throw new SkillError("SKILL_SOURCE_INVALID", `Invalid skill source: ${value}`);
  }
  return value;
}

export function sanitizeSkillId(input: string): string {
  const value = rejectEmpty(input);
  if (!SKILL_TOKEN_RE.test(value)) {
    throw new SkillError("SKILL_SOURCE_INVALID", `Invalid skill id: ${value}`);
  }
  return value;
}

export function sanitizeSkillName(input: string): string {
  const value = rejectEmpty(input);
  if (!SKILL_TOKEN_RE.test(value)) {
    throw new SkillError("SKILL_SOURCE_INVALID", `Invalid skill name: ${value}`);
  }
  return value;
}
