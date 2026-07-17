import type { ApiErrorCode } from "@agents-remote/shared";

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

/** GitHub owner/repo（source）：允许 `owner/repo`，拒绝 `..` 段、绝对路径、null byte、前后斜杠。 */
const SOURCE_RE = /^(?!.*\.\.)[\w.-]+\/[\w.-]+$/;
/** skill name / skillId：skills.sh search 返回与 CLI --skill 接受的 token。 */
const SKILL_TOKEN_RE = /^[a-zA-Z0-9._-]+$/;

function rejectEmpty(input: unknown): string {
  if (typeof input !== "string" || input.length === 0 || input.includes("\0")) {
    throw new SkillError("SKILL_SOURCE_INVALID", "Invalid skill input");
  }
  return input.trim();
}

export function sanitizeSource(input: string): string {
  const value = rejectEmpty(input);
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
