import { mkdir, rename, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  SKILL_AGENTS,
  type SkillAgent,
  type SkillDisableRequest,
  type SkillDisableResponse,
} from "@agents-remote/shared";
import { jsonError } from "./http-auth";
import { ProjectPathError } from "./project-paths";
import { sanitizeSkillName } from "./skill-process";
import {
  AGENT_SKILLS_HOME_DIR,
  disabledSkillsDir,
  matchProjectSkillPath,
  type ProjectSkillCtx,
  type SkillMarketDeps,
  projectPathErrorStatus,
  reloadAliveSessions,
  resolveProjectSkillCwd,
  resolveSkillsHome,
} from "./skill-market";
import { SkillError, type SkillErrorCode } from "./skill-validate";

/**
 * 技能停用/启用（v1.4 批6，09b 长按插件行操作菜单「停用（停止注入）」）。
 *
 * 语义 = 目录 rename 进/出停用区（状态即目录布局，零标记文件）：
 * - 全局：`~/.claude/skills/<name>` → `~/.agents/disabled-skills/<agent>/<name>`（symlink
 *   整体 rename 保留 canonical，文件零破坏；per-agent 子目录防 claude-code/codex 同名撞）
 * - 项目：`<root>/.<agentHome>/skills/<name>` → `<root>/.<agentHome>/skills.disabled/<name>`
 *   （同级 .disabled，非 skills CLI 约定目录，CLI 不再发现 = 停止注入）
 *
 * 配套：scanInstalledSkillsFromFs 扫停用区（disabled:true）；uninstallSkill 对停用条目直接
 * rm；checkSkillUpdates / update 拒绝停用条目（防 update 重装复活）；成功后
 * reloadAliveSessions = 活跃会话 catalog 即时刷新（与装/卸同闭环）。
 */

/** agent 校验 + 算激活/停用目录。disable/enable 主流程共用。 */
async function resolveSkillDirs(
  req: SkillDisableRequest,
  deps: SkillMarketDeps,
  projectCtx?: ProjectSkillCtx,
): Promise<{ name: string; activeDir: string; disabledDir: string }> {
  const name = sanitizeSkillName(req.name);
  const agent: SkillAgent = req.agent;
  if (!(SKILL_AGENTS as readonly string[]).includes(agent)) {
    throw new SkillError("SKILL_DISABLE_FAILED", `Unsupported agent: ${agent}`);
  }
  const cwd = projectCtx ? await resolveProjectSkillCwd(projectCtx) : undefined;
  const home = resolveSkillsHome(deps);
  const activeDir = cwd
    ? join(cwd, AGENT_SKILLS_HOME_DIR[agent], "skills", name)
    : join(home, AGENT_SKILLS_HOME_DIR[agent], "skills", name);
  const disabledDir = join(disabledSkillsDir(agent, home, cwd), name);
  return { name, activeDir, disabledDir };
}

/**
 * 停用 = rename 激活区 → 停用区。激活目录缺失（未装）→ SKILL_DISABLE_FAILED；
 * 目标已存在（重复停用/残留）→ rename 抛 ENOTEMPTY 同码报错。
 */
export async function disableSkill(
  req: SkillDisableRequest,
  deps: SkillMarketDeps,
  projectCtx?: ProjectSkillCtx,
): Promise<SkillDisableResponse> {
  const { name, activeDir, disabledDir } = await resolveSkillDirs(req, deps, projectCtx);
  const exists = await stat(activeDir)
    .then(() => true)
    .catch(() => false);
  if (!exists) {
    throw new SkillError("SKILL_DISABLE_FAILED", `Skill not installed: ${name}`);
  }
  await mkdir(dirnameOf(disabledDir), { recursive: true });
  try {
    await rename(activeDir, disabledDir);
  } catch (error) {
    throw new SkillError("SKILL_DISABLE_FAILED", `Failed to disable ${name}: ${errMsgOf(error)}`);
  }
  await reloadAliveSessions(deps); // 停止注入 = 活跃会话 catalog 即时刷新
  return { ok: true };
}

/** 启用 = rename 停用区 → 激活区。停用区无该条目 → SKILL_DISABLE_FAILED（同码 400）。 */
export async function enableSkill(
  req: SkillDisableRequest,
  deps: SkillMarketDeps,
  projectCtx?: ProjectSkillCtx,
): Promise<SkillDisableResponse> {
  const { name, activeDir, disabledDir } = await resolveSkillDirs(req, deps, projectCtx);
  const exists = await stat(disabledDir)
    .then(() => true)
    .catch(() => false);
  if (!exists) {
    throw new SkillError("SKILL_DISABLE_FAILED", `Skill is not disabled: ${name}`);
  }
  await mkdir(dirnameOf(activeDir), { recursive: true });
  try {
    await rename(disabledDir, activeDir);
  } catch (error) {
    throw new SkillError("SKILL_DISABLE_FAILED", `Failed to enable ${name}: ${errMsgOf(error)}`);
  }
  await reloadAliveSessions(deps); // 恢复注入
  return { ok: true };
}

function dirnameOf(path: string): string {
  return dirname(path);
}
function errMsgOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** SkillError → HTTP 状态码（停用目标无效 = 客户端输入问题 400；其余 500）。 */
function skillDisableErrorStatus(code: SkillErrorCode): number {
  if (code === "SKILL_DISABLE_FAILED") return 400;
  if (code === "SKILL_SOURCE_INVALID") return 400;
  return 500;
}

async function runSkillDisableHandler<T>(fn: () => Promise<T>, okStatus = 200): Promise<Response> {
  try {
    const data = await fn();
    return Response.json(data, { status: okStatus });
  } catch (error) {
    if (error instanceof SkillError) {
      return jsonError(error.code, error.message, skillDisableErrorStatus(error.code));
    }
    if (error instanceof ProjectPathError) {
      return jsonError(error.code, error.message, projectPathErrorStatus(error));
    }
    throw error;
  }
}

const readJson = async <T>(request: Request): Promise<T> => {
  try {
    return (await request.json()) as T;
  } catch {
    return {} as T;
  }
};

/**
 * 路由：POST /api/skills/disable|enable（全局）+ /api/projects/{name}/skills/disable|enable
 *（项目 scope，matchProjectSkillPath 的 disable/enable action）。镜像 handleSkillUpdateRoutes
 * 的独立 handler 形态（避免与 skill-market 循环 import）。
 */
export async function handleSkillDisableRoutes(
  request: Request,
  url: URL,
  deps: SkillMarketDeps,
): Promise<Response | undefined> {
  const isPost = request.method === "POST";
  if (isPost && (url.pathname === "/api/skills/disable" || url.pathname === "/api/skills/enable")) {
    const body = await readJson<SkillDisableRequest>(request);
    const fn = url.pathname.endsWith("/disable") ? disableSkill : enableSkill;
    return runSkillDisableHandler(() => fn(body, deps));
  }
  const projectMatch = matchProjectSkillPath(url.pathname);
  if (
    projectMatch &&
    deps.projectsRoot &&
    (projectMatch.action === "disable" || projectMatch.action === "enable") &&
    isPost
  ) {
    const body = await readJson<SkillDisableRequest>(request);
    const projectCtx: ProjectSkillCtx = {
      projectsRoot: deps.projectsRoot,
      projectKey: projectMatch.projectName,
    };
    const fn = projectMatch.action === "disable" ? disableSkill : enableSkill;
    return runSkillDisableHandler(() => fn(body, deps, projectCtx));
  }
  return undefined;
}
