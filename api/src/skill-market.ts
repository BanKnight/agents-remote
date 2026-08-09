import { randomUUID } from "node:crypto";
import { readFile, readdir, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  SKILL_AGENTS,
  type AddSkillSourceRequest,
  type AddSkillSourceResponse,
  type InstallSkillRequest,
  type InstallSkillResponse,
  type InstalledSkill,
  type InstalledSkillsResponse,
  type RemoveSkillSourceResponse,
  type SkillAgent,
  type SkillMarketEntry,
  type SkillMarketSearchResponse,
  type SkillPreviewResponse,
  type SkillSource,
  type SkillSourceType,
  type SkillSourcesResponse,
  type UninstallSkillRequest,
  type UninstallSkillResponse,
} from "@agents-remote/shared";
import { parseFrontmatter } from "./claude2-slash-commands";
import type { Claude2Runtime } from "./claude2-runtime";
import { jsonError } from "./http-auth";
import { ProjectPathError, resolveProjectPath } from "./project-paths";
import type { SettingsStore } from "./settings-store";
import {
  INSTALL_SKILL_TIMEOUT_MS,
  runSkillsCommand,
  sanitizeSkillId,
  sanitizeSkillName,
  sanitizeSource,
  SkillError,
  type SkillErrorCode,
  type SkillsCommandResult,
} from "./skill-process";
import { skillTaskRegistry } from "./skill-tasks";

/**
 * skill 路由依赖。claude2Runtime 可选（缺失则跳过装/卸后的 reload，
 * 主要用于无 runtime 的单元测试）。
 */
export type SkillMarketDeps = {
  settingsStore: SettingsStore;
  claude2Runtime?: Claude2Runtime;
  /**
   * skill 安装目录的 home 基准（测试注入；生产留空 → os.homedir()）。agent 全局 skills
   * 目录 = `${skillsHome ?? homedir()}/.<agentHome>/skills`（claude-code→.claude、
   * codex→.codex，与 skills CLI 的 globalSkillsDir 一致）。
   */
  skillsHome?: string;
  /**
   * 项目级 skill（/api/projects/{name}/skills/*）解析与 cwd 需要；缺失则项目路由不处理（交 404）。
   * 镜像 mcp-management.ts 的 McpManagementDeps.projectsRoot。
   */
  projectsRoot?: string;
};

/**
 * 项目级 skill 上下文：决定 cwd（=projectRoot）+ argv（去 --global）+ 锁文件位置
 * （<project>/skills-lock.json，区别于全局 ~/.agents/.skill-lock.json）。undefined = 全局 scope。
 */
export type ProjectSkillCtx = {
  projectsRoot: string;
  projectKey: string;
};

// skills.sh search 的最少必填字符（实测：<2 返回 400）。
const SEARCH_MIN_QUERY = 2;
const SEARCH_LIMIT = 20;
const SKILLS_SEARCH_URL = "https://skills.sh/api/search";
const SKILL_MD = "SKILL.md";

function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function trimErr(result: SkillsCommandResult): string {
  return (result.stderr.trim() || result.stdout.trim() || `exit code ${result.exitCode}`).slice(
    0,
    500,
  );
}

export function parseAgent(value: string | null): SkillAgent {
  const a = (value ?? "claude-code").trim();
  return (SKILL_AGENTS as readonly string[]).includes(a) ? (a as SkillAgent) : "claude-code";
}

// ── 发现层：skills.sh /api/search（server 代理，避免浏览器 CORS + 集中处理） ──

function normalizeMarketEntries(raw: unknown): SkillMarketEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: SkillMarketEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const e = item as Record<string, unknown>;
    const id = typeof e.id === "string" ? e.id : "";
    const skillId = typeof e.skillId === "string" ? e.skillId : "";
    const name = typeof e.name === "string" ? e.name : skillId || id;
    const installs = typeof e.installs === "number" ? e.installs : 0;
    const source = typeof e.source === "string" ? e.source : "";
    if (!name) continue;
    out.push({ id, skillId, name, installs, source });
  }
  return out;
}

export async function searchSkillMarket(query: string): Promise<SkillMarketSearchResponse> {
  const q = (query ?? "").trim();
  if (q.length < SEARCH_MIN_QUERY) {
    return { query: q, skills: [], count: 0 };
  }
  const url = `${SKILLS_SEARCH_URL}?q=${encodeURIComponent(q)}&limit=${SEARCH_LIMIT}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: "application/json" } });
  } catch (error) {
    throw new SkillError(
      "SKILL_MARKET_FETCH_FAILED",
      `Failed to reach skills.sh: ${errMsg(error)}`,
    );
  }
  if (!res.ok) {
    throw new SkillError("SKILL_MARKET_FETCH_FAILED", `skills.sh search returned ${res.status}`);
  }
  let parsed: { skills?: unknown };
  try {
    parsed = (await res.json()) as { skills?: unknown };
  } catch (error) {
    throw new SkillError(
      "SKILL_MARKET_FETCH_FAILED",
      `Invalid JSON from skills.sh: ${errMsg(error)}`,
    );
  }
  const skills = normalizeMarketEntries(parsed.skills);
  return { query: q, skills, count: skills.length };
}

// ── 已装层：FS 直读 agent 全局 skills 目录 ──
//
// `npx skills list --json --global` 实测 11-17s，全是 npx+node 启动开销（注册表校验 +
// spawn），零网络——CLI 自己也只是扫本地目录。改为直扫 agent 全局 skills 目录：readdir +
// 读 SKILL.md frontmatter，实测 ~0.1s（100x+ 提速）。单 agent 查询天然只需扫该 agent
// 目录（每个条目 = 该 agent installed 的 skill：symlink 指向 canonical 真身，或 agent-only
// 真实目录），无需重建 CLI 的完整 agents 数组。装/卸仍走 npx（git clone 需要），事后
// readback 同样 FS 直读，自然变快。

// skills CLI 各 agent 的全局 skills 目录名（home 下的隐藏目录）：claude-code→`.claude`、
// codex→`.codex`（CLI 的 claudeHome=CLAUDE_CONFIG_DIR||~/.claude、codexHome=CODEX_HOME||
// ~/.codex；全局 skills 在其下 `skills/` 子目录）。
const AGENT_SKILLS_HOME_DIR: Record<SkillAgent, string> = {
  "claude-code": ".claude",
  codex: ".codex",
};
// InstalledSkill.agents 用 display name（与 skills CLI list 输出一致）。
const AGENT_DISPLAY_NAME: Record<SkillAgent, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
};

function resolveSkillsHome(deps?: SkillMarketDeps): string {
  return deps?.skillsHome ?? homedir();
}

function agentGlobalSkillsDir(agent: SkillAgent, home: string): string {
  return join(home, AGENT_SKILLS_HOME_DIR[agent], "skills");
}

/**
 * 直扫 agent 全局 skills 目录，返回该 agent installed 的全部 skill（只读 SKILL.md
 * frontmatter 拿 name）。跳过：隐藏条目（`.system` 等）、非目录/broken symlink、无
 * SKILL.md 的目录——与 skills CLI 的过滤口径一致。目录缺失（agent 未装任何 skill）→
 * 空数组，不报错。
 *
 * `path` 用 realpath：symlink 条目解析到 canonical 真身（与 CLI 输出一致），agent-only
 * 真实目录解析到自身。
 */
async function scanInstalledSkillsFromFs(
  agent: SkillAgent,
  home: string,
  projectRoot?: string,
): Promise<InstalledSkill[]> {
  // 项目 scope：读 <projectRoot>/.<agentHome>/skills（skills CLI 项目 scope 安装位置）；
  // 全局 scope：读 ~/.<agentHome>/skills。scope 标签由目录来源决定，调用方无需另传。
  const dir = projectRoot
    ? join(projectRoot, AGENT_SKILLS_HOME_DIR[agent], "skills")
    : agentGlobalSkillsDir(agent, home);
  // 项目 scope 读一次项目锁判断每 skill 是否有源（manageable）；全局 scope 不读（manageable 走
  // 独立的 checkSkillUpdates）。循环外读一次，不 per-skill 重复 IO。
  const lockNames = projectRoot ? await readProjectSkillLockNames(projectRoot) : null;
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return []; // 目录缺失（codex 全新 / agent 未装）= 空列表，非错误。
  }
  const skills: InstalledSkill[] = [];
  for (const entry of entries) {
    if (entry.startsWith(".")) continue; // 跳过 .system 等隐藏条目
    const entryPath = join(dir, entry);
    try {
      const st = await stat(entryPath); // stat 跟随 symlink：broken symlink → ENOENT → 跳过
      if (!st.isDirectory()) continue;
    } catch {
      continue;
    }
    let content: string;
    try {
      content = await readFile(join(entryPath, SKILL_MD), "utf8");
    } catch {
      continue; // 无 SKILL.md → CLI 同样不视为 skill，跳过
    }
    const fm = parseFrontmatter(content);
    let realPath: string;
    try {
      realPath = await realpath(entryPath);
    } catch {
      realPath = entryPath;
    }
    const name = fm.name || entry;
    skills.push({
      name,
      path: realPath,
      scope: projectRoot ? "project" : "global",
      agents: [AGENT_DISPLAY_NAME[agent]],
      // 项目 scope：锁记录存在 = 有源可更新；手写 skill（无锁记录）= false。全局不填（undefined）。
      ...(lockNames ? { manageable: lockNames.has(name) } : {}),
    });
  }
  return skills;
}

/**
 * 读项目锁 `<projectRoot>/skills-lock.json` 的 skill name 集合（判断项目 scope skill 是否
 * 有源 = 纳入版本管理）。文件缺失/损坏 → empty set（list 容错：锁损坏不应让已装列表整体失败）。
 * 与全局锁 `~/.agents/.skill-lock.json` 结构同构（{version, skills:{[name]:{...}}}），但路径
 * 与容错策略不同：全局 readSkillLock 损坏抛错（checkSkillUpdates 需感知）；项目锁仅判存在性，容错。
 */
async function readProjectSkillLockNames(projectRoot: string): Promise<Set<string>> {
  let raw: string;
  try {
    raw = await readFile(join(projectRoot, "skills-lock.json"), "utf8");
  } catch {
    return new Set(); // 文件缺失（项目无第三方 skill）= 空集，非错误。
  }
  try {
    const parsed = JSON.parse(raw) as { skills?: unknown };
    const skills = parsed.skills;
    if (!skills || typeof skills !== "object" || Array.isArray(skills)) return new Set();
    return new Set(Object.keys(skills as Record<string, unknown>));
  } catch {
    return new Set(); // JSON 损坏 → 空集（list 容错，不抛）。
  }
}

export async function listInstalledSkills(
  agent: SkillAgent,
  deps?: SkillMarketDeps,
  projectRoot?: string,
): Promise<InstalledSkillsResponse> {
  const skills = await scanInstalledSkillsFromFs(agent, resolveSkillsHome(deps), projectRoot);
  return { skills };
}

/**
 * 解析项目级 skill 的 cwd（=projectRoot realpath）。复用 Project-safe resolver
 * （resolveProjectPath：防越界 + realpath 规范化），与 mcp-management.ts 的 resolveProjectCwd 同口径。
 * skills CLI 项目 scope 的 add/remove/update 由 cwd 决定写入位置（<cwd>/.claude/skills + <cwd>/skills-lock.json）。
 */
export async function resolveProjectSkillCwd(ctx: ProjectSkillCtx): Promise<string> {
  const project = await resolveProjectPath(ctx.projectsRoot, ctx.projectKey);
  return project.path;
}

/** ProjectPathError → HTTP 状态码（精细版，对齐 session-routes.ts：FS 错误 500，其余 400，未找到 404）。
 *  导出供 skill-update.ts 复用（同口径，避免两处状态码分叉）。 */
export function projectPathErrorStatus(error: ProjectPathError): number {
  if (error.code === "PROJECT_NOT_FOUND") return 404;
  if (error.code === "PROJECT_FS_ERROR") return 500;
  return 400;
}

// ── 执行层：`npx skills add/remove`（只信 exit code，事后 list --json 回读真相） ──

/** 装/卸/更新成功后，遍历活跃 claude2 session 发 /reload-skills，触发现有 catalog 刷新闭环。 */
export async function reloadAliveSessions(deps: SkillMarketDeps): Promise<void> {
  const runtime = deps.claude2Runtime;
  if (!runtime) return;
  let keys: Set<string>;
  try {
    keys = await runtime.listAliveRuntimeKeys();
  } catch {
    return; // best-effort；runtime 不可达不阻断 install 结果
  }
  for (const key of keys) {
    try {
      await runtime.write(key, "/reload-skills\n");
    } catch {
      // session 可能已关闭，跳过
    }
  }
}

/**
 * 执行安装（后台任务体）：spawn `skills add`（git clone）→ reload 活跃 session → list 回读真相。
 * 由 {@link startInstallTask} 在后台 fire-and-forget 调用，抛错由 runInstallTask 兜底转终态。
 * `killProcessGroup:true` 防超时/取消时 git/npm 孙进程孤儿（见 cli-process 进程组路径）。
 */
export async function executeInstall(
  req: InstallSkillRequest,
  deps: SkillMarketDeps,
  projectCtx?: ProjectSkillCtx,
): Promise<InstalledSkill> {
  const source = sanitizeSource(req.source);
  const skillId = sanitizeSkillId(req.skillId);
  const agent = req.agent;
  if (!(SKILL_AGENTS as readonly string[]).includes(agent)) {
    throw new SkillError("SKILL_SOURCE_INVALID", `Unsupported agent: ${agent}`);
  }
  // 项目 scope：cwd=projectRoot，argv 不带 --global（skills CLI 默认项目 scope，写 <cwd>/.claude/skills）；
  // 全局 scope：argv 带 --global（写 ~/.claude/skills）。
  const cwd = projectCtx ? await resolveProjectSkillCwd(projectCtx) : undefined;
  const result = await runSkillsCommand(
    projectCtx
      ? ["add", `${source}@${skillId}`, "--agent", agent, "--yes"]
      : ["add", `${source}@${skillId}`, "--global", "--agent", agent, "--yes"],
    {
      timeoutMs: INSTALL_SKILL_TIMEOUT_MS,
      failureCode: "SKILL_INSTALL_FAILED",
      killProcessGroup: true,
      cwd,
    },
  );
  if (result.exitCode !== 0) {
    throw new SkillError("SKILL_INSTALL_FAILED", `skills add failed: ${trimErr(result)}`);
  }
  await reloadAliveSessions(deps);
  // UI = f(state)：真相以 list 回读为准（不信 stdout），扫项目/全局对应目录。
  // list 回读失败时，install 本身已成功，用 skillId 占位让前端 refetch 补全。
  const scope = projectCtx ? "project" : "global";
  try {
    const { skills } = await listInstalledSkills(agent, deps, cwd);
    const found = skills.find((s) => s.name === skillId);
    return found ?? { name: skillId, path: "", scope, agents: [agent] };
  } catch {
    return { name: skillId, path: "", scope, agents: [agent] };
  }
}

/**
 * 启动 install 异步任务：同步校验（无效输入立即 400，不进后台）→ registry 去重起 task →
 * !joined 时后台 fire-and-forget 执行 → 立即返 202 {taskId,status:"running"}。
 * 同 dedupKey running 中 → 复用 taskId（joined），不重复 spawn。
 */
export async function startInstallTask(
  req: InstallSkillRequest,
  deps: SkillMarketDeps,
  projectCtx?: ProjectSkillCtx,
): Promise<Response> {
  let source: string;
  let skillId: string;
  let agent: SkillAgent;
  try {
    source = sanitizeSource(req.source);
    skillId = sanitizeSkillId(req.skillId);
    agent = req.agent;
    if (!(SKILL_AGENTS as readonly string[]).includes(agent)) {
      throw new SkillError("SKILL_SOURCE_INVALID", `Unsupported agent: ${agent}`);
    }
    // 项目 scope 同步校验项目存在性 + 越界：与 list/preview/uninstall 同步 404 语义一致，
    // 避免项目未知时 install 返 202 再后台 failed 的延迟暴露（前端立即拿到 404）。
    if (projectCtx) await resolveProjectSkillCwd(projectCtx);
  } catch (error) {
    if (error instanceof SkillError) {
      return jsonError(error.code, error.message, skillErrorStatus(error.code));
    }
    if (error instanceof ProjectPathError) {
      return jsonError(error.code, error.message, projectPathErrorStatus(error));
    }
    throw error;
  }
  // 项目 dedupKey 加 project: 前缀，防跨项目同 source/skillId 碰撞（不同项目 install 互不串）。
  const dedupKey = projectCtx
    ? `install:project:${projectCtx.projectKey}:${agent}:${source}/${skillId}`
    : `install:${agent}:${source}/${skillId}`;
  const { taskId, joined } = skillTaskRegistry.startOrJoin("install", dedupKey, skillId);
  if (!joined) {
    void runInstallTask(taskId, req, deps, projectCtx);
  }
  return Response.json({ taskId, status: "running" } satisfies InstallSkillResponse, {
    status: 202,
  });
}

/** 后台执行体：executeInstall → finish(done,{skill})；catch → finish(failed)。 */
async function runInstallTask(
  taskId: string,
  req: InstallSkillRequest,
  deps: SkillMarketDeps,
  projectCtx?: ProjectSkillCtx,
): Promise<void> {
  try {
    const skill = await executeInstall(req, deps, projectCtx);
    skillTaskRegistry.finish(taskId, { status: "done", skill });
  } catch (error) {
    skillTaskRegistry.finish(taskId, {
      status: "failed",
      code: error instanceof SkillError ? error.code : "SKILL_INSTALL_FAILED",
      message: errMsg(error),
    });
  }
}

export async function uninstallSkill(
  req: UninstallSkillRequest,
  deps: SkillMarketDeps,
  projectCtx?: ProjectSkillCtx,
): Promise<UninstallSkillResponse> {
  const name = sanitizeSkillName(req.name);
  const agent = req.agent;
  if (!(SKILL_AGENTS as readonly string[]).includes(agent)) {
    throw new SkillError("SKILL_SOURCE_INVALID", `Unsupported agent: ${agent}`);
  }
  // 项目 scope：cwd=projectRoot + argv 不带 --global（删 <cwd>/.claude/skills/<name>）；
  // 全局 scope：argv 带 --global（删 ~/.claude/skills/<name>）。
  const cwd = projectCtx ? await resolveProjectSkillCwd(projectCtx) : undefined;
  const result = await runSkillsCommand(
    projectCtx
      ? ["remove", name, "--agent", agent, "--yes"]
      : ["remove", name, "--global", "--agent", agent, "--yes"],
    { failureCode: "SKILL_UNINSTALL_FAILED", cwd },
  );
  if (result.exitCode !== 0) {
    throw new SkillError("SKILL_UNINSTALL_FAILED", `skills remove failed: ${trimErr(result)}`);
  }
  await reloadAliveSessions(deps);
  return { ok: true };
}

// ── 预览层：已装 skill 本地 SKILL.md（FS 直读，零网络、零 rate-limit、零 npx spawn） ──

export async function previewInstalledSkill(
  name: string,
  agent: SkillAgent,
  deps?: SkillMarketDeps,
  projectCtx?: ProjectSkillCtx,
): Promise<SkillPreviewResponse> {
  // sanitize 拒绝 `..`/`/`/null byte，锁死在 agent skills 目录内（路径穿越不可达）。
  const safeName = sanitizeSkillName(name);
  // 项目 scope：读 <projectRoot>/.<agentHome>/skills/<name>；全局 scope：读 ~/.<agentHome>/skills/<name>。
  const cwd = projectCtx ? await resolveProjectSkillCwd(projectCtx) : undefined;
  const dir = join(cwd ?? agentGlobalSkillsDir(agent, resolveSkillsHome(deps)), safeName);
  let content: string;
  try {
    content = await readFile(join(dir, SKILL_MD), "utf8"); // 跟随 symlink 读 canonical SKILL.md
  } catch (error) {
    // 直读指定 name：文件缺失 = 该 skill 未为该 agent 安装（ENOENT），或读取失败。
    throw new SkillError("SKILL_PREVIEW_FAILED", `Skill not found: ${safeName}: ${errMsg(error)}`);
  }
  const fm = parseFrontmatter(content);
  let source: string;
  try {
    source = await realpath(dir);
  } catch {
    source = dir;
  }
  return {
    name: fm.name || safeName,
    description: fm.description || undefined,
    content,
    source,
  };
}

// ── 源存储层：SettingsStore.skills.sources（optional 字段，缺失即 []） ──

export async function listSkillSources(deps: SkillMarketDeps): Promise<SkillSource[]> {
  const state = await deps.settingsStore.read();
  return state.skills?.sources ?? [];
}

export async function addSkillSource(
  req: AddSkillSourceRequest,
  deps: SkillMarketDeps,
): Promise<AddSkillSourceResponse> {
  const type: SkillSourceType = req.type === "local" || req.type === "git" ? req.type : "github";
  const label = typeof req.label === "string" ? req.label.trim() : "";
  const branch = typeof req.branch === "string" ? req.branch.trim() : "";
  const source: SkillSource = { id: randomUUID(), type };
  if (type === "local") {
    // local 源：绝对路径 + realpath 规范化 + 存在性校验（拒不存在的路径，防存入无效源）。
    const path = sanitizeSource(typeof req.path === "string" ? req.path : "", "local");
    try {
      source.path = await realpath(path);
    } catch (error) {
      throw new SkillError(
        "SKILL_SOURCE_INVALID",
        `Local source path not accessible: ${path}: ${errMsg(error)}`,
      );
    }
  } else {
    // github / git：owner/name shorthand。
    source.repo = sanitizeSource(typeof req.repo === "string" ? req.repo : "", type);
    if (branch) source.branch = branch;
  }
  if (label) source.label = label;
  await deps.settingsStore.update((s) => ({
    ...s,
    skills: { sources: [...(s.skills?.sources ?? []), source] },
  }));
  return { source };
}

export async function removeSkillSource(id: string, deps: SkillMarketDeps): Promise<boolean> {
  let existed = false;
  await deps.settingsStore.update((s) => {
    const sources = s.skills?.sources ?? [];
    const next = sources.filter((src) => {
      if (src.id === id) {
        existed = true;
        return false;
      }
      return true;
    });
    return { ...s, skills: { sources: next } };
  });
  return existed;
}

// ── 路由：/api/skills/*（均经 index.ts 的 requireHttpAuth 统一守卫） ──

function skillErrorStatus(code: SkillErrorCode): number {
  switch (code) {
    case "SKILL_SOURCE_INVALID":
      return 400;
    case "SKILL_PREVIEW_FAILED":
      return 404;
    default:
      return 500;
  }
}

/** 把 SkillError 翻译成 HTTP 错误响应；非 SkillError 重新抛出交给全局 handler。 */
async function runSkillHandler<T>(fn: () => Promise<T>, okStatus = 200): Promise<Response> {
  try {
    const data = await fn();
    return Response.json(data, { status: okStatus });
  } catch (error) {
    if (error instanceof SkillError) {
      return jsonError(error.code, error.message, skillErrorStatus(error.code));
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
 * 匹配项目级 skill 路由 /api/projects/{name}/skills[/(install|uninstall|update|preview)]。
 * bare prefix = list。镜像 mcp-management.ts 的 matchProjectMcpPath（同口径：单 path 段 + decode）。
 * update action 由 skill-update.ts 的 handleSkillUpdateRoutes 消费（避免循环 import）。
 */
export function matchProjectSkillPath(
  pathname: string,
):
  | { projectName: string; action: "list" | "install" | "uninstall" | "update" | "preview" }
  | undefined {
  const prefix = "/api/projects/";
  if (!pathname.startsWith(prefix)) return undefined;
  const rest = pathname.slice(prefix.length);
  const infix = "/skills";
  const idx = rest.indexOf(infix);
  if (idx === -1) return undefined;
  const encodedName = rest.slice(0, idx);
  // encodedName 是单个 path 段（无 `/`）——与 mcp-management.ts matchProjectMcpPath 同口径。
  if (encodedName.length === 0 || encodedName.includes("/")) return undefined;
  let projectName: string;
  try {
    projectName = decodeURIComponent(encodedName);
  } catch {
    return undefined;
  }
  const tail = rest.slice(idx + infix.length);
  if (tail === "") return { projectName, action: "list" };
  if (tail === "/install") return { projectName, action: "install" };
  if (tail === "/uninstall") return { projectName, action: "uninstall" };
  if (tail === "/update") return { projectName, action: "update" };
  if (tail === "/preview") return { projectName, action: "preview" };
  return undefined;
}

export async function handleSkillRoutes(
  request: Request,
  url: URL,
  deps: SkillMarketDeps,
): Promise<Response | undefined> {
  const isGet = request.method === "GET";
  const isPost = request.method === "POST";

  if (url.pathname === "/api/skills/search" && isGet) {
    return runSkillHandler(() => searchSkillMarket(url.searchParams.get("q") ?? ""));
  }

  if (url.pathname === "/api/skills/installed" && isGet) {
    const agent = parseAgent(url.searchParams.get("agent"));
    return runSkillHandler(() => listInstalledSkills(agent, deps));
  }

  if (url.pathname === "/api/skills/preview" && isGet) {
    const name = url.searchParams.get("name") ?? "";
    const agent = parseAgent(url.searchParams.get("agent"));
    return runSkillHandler(() => previewInstalledSkill(name, agent, deps));
  }

  if (url.pathname === "/api/skills/install" && isPost) {
    const body = await readJson<InstallSkillRequest>(request);
    return startInstallTask(body, deps);
  }

  if (url.pathname === "/api/skills/uninstall" && isPost) {
    const body = await readJson<UninstallSkillRequest>(request);
    return runSkillHandler(() => uninstallSkill(body, deps));
  }

  if (url.pathname === "/api/skills/sources") {
    if (isGet) {
      return runSkillHandler<SkillSourcesResponse>(async () => ({
        sources: await listSkillSources(deps),
      }));
    }
    if (isPost) {
      const body = await readJson<AddSkillSourceRequest>(request);
      return runSkillHandler(() => addSkillSource(body, deps), 201);
    }
    if (request.method === "DELETE") {
      const id = url.searchParams.get("id") ?? "";
      return runSkillHandler(async (): Promise<RemoveSkillSourceResponse> => {
        const existed = await removeSkillSource(id, deps);
        if (!existed) {
          throw new SkillError("SKILL_SOURCE_INVALID", "Skill source not found");
        }
        return { deleted: true, id };
      });
    }
  }

  // ── 项目级 skill：/api/projects/{name}/skills/*（scope 由 URL 段表达，body 复用全局类型） ──
  // update 路由交 handleSkillUpdateRoutes 处理（避免与 skill-update.ts 循环 import）。
  const projectMatch = matchProjectSkillPath(url.pathname);
  if (projectMatch) {
    if (!deps.projectsRoot) return undefined;
    const projectCtx: ProjectSkillCtx = {
      projectsRoot: deps.projectsRoot,
      projectKey: projectMatch.projectName,
    };
    if (projectMatch.action === "list" && isGet) {
      const agent = parseAgent(url.searchParams.get("agent"));
      return runSkillHandler(async () => {
        const cwd = await resolveProjectSkillCwd(projectCtx);
        return listInstalledSkills(agent, deps, cwd);
      });
    }
    if (projectMatch.action === "preview" && isGet) {
      const name = url.searchParams.get("name") ?? "";
      const agent = parseAgent(url.searchParams.get("agent"));
      return runSkillHandler(() => previewInstalledSkill(name, agent, deps, projectCtx));
    }
    if (projectMatch.action === "install" && isPost) {
      const body = await readJson<InstallSkillRequest>(request);
      return startInstallTask(body, deps, projectCtx);
    }
    if (projectMatch.action === "uninstall" && isPost) {
      const body = await readJson<UninstallSkillRequest>(request);
      return runSkillHandler(() => uninstallSkill(body, deps, projectCtx));
    }
    // action === "update" → 不处理，交 handleSkillUpdateRoutes（index.ts 顺序调用）。
  }

  return undefined;
}
