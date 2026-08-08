import {
  SKILL_AGENTS,
  type CheckSkillUpdatesResponse,
  type SkillAgent,
  type SkillUpdateStatus,
  type UpdateSkillRequest,
  type UpdateSkillResponse,
} from "@agents-remote/shared";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { jsonError } from "./http-auth.js";
import {
  listInstalledSkills,
  parseAgent,
  reloadAliveSessions,
  trimErr,
  type SkillMarketDeps,
} from "./skill-market.js";
import {
  INSTALL_SKILL_TIMEOUT_MS,
  runSkillsCommand,
  sanitizeSkillName,
  SkillError,
  type SkillErrorCode,
} from "./skill-process.js";

/**
 * skill 更新检测 + 执行（wrap `npx skills update` + 自读锁文件比对）。
 *
 * 检测 = 无副作用：读 `~/.agents/.skill-lock.json` 的 skills[name].skillFolderHash（skill 目录的
 * git tree SHA）+ sourceUrl/skillPath → 调 GitHub Trees API 取远端同目录 tree SHA 比对。相同 =
 * 无更新；不同 / 远端无此目录 = 有更新 / 不可比对（hasUpdate=false，安全降级）。
 * 手写 skill（无锁记录）/ local / 非 github 源 → manageable=false（不可一键更新）。
 *
 * 限速：GitHub API 未认证 60 req/h。按 repo 分组共享一次 tree 调用（同一 repo 多 skill 只调 2 次：
 * default_branch + recursive tree），repo 之间串行（天然限并发）。v1 用户手动触发，不自动批量。
 */

// 锁文件相对 home 的路径（skills CLI 的 global lock）。
const LOCK_FILE_RELATIVE = join(".agents", ".skill-lock.json");
const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_TIMEOUT_MS = 20_000;

const isNotFoundError = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";

function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "agents-remote",
  };
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/**
 * 从 sourceUrl 提取 owner/repo：支持 `https://github.com/o/r.git`、`https://github.com/o/r`、
 * `git@github.com:o/r.git`。剥 `.git` 后缀（正则 `[\w.-]+` 会连 `.git` 一起吃，见实测）。
 */
function parseGithubRepo(sourceUrl: string): { owner: string; repo: string } | undefined {
  if (typeof sourceUrl !== "string") return undefined;
  let s = sourceUrl
    .trim()
    .replace(/^git@/, "")
    .replace(/^https?:\/\//, "")
    .replace(/^ssh:\/\//, "");
  s = s
    .replace(/^github\.com:/, "github.com/")
    .replace(/\.git$/i, "")
    .replace(/\/+$/, "");
  if (!s.startsWith("github.com/")) return undefined;
  const [, owner, repo] = /^github\.com\/([\w.-]+)\/([\w.-]+)$/.exec(s) ?? [];
  if (!owner || !repo) return undefined;
  return { owner, repo };
}

/** skillPath（`skills/x/SKILL.md`）→ 仓库内 skill 目录（`skills/x`）。无 SKILL.md 后缀时取 dirname。 */
function skillFolderFromPath(skillPath: string): string {
  if (typeof skillPath !== "string" || skillPath.length === 0) return "";
  const stripped = skillPath.replace(/\/SKILL\.md$/i, "");
  if (stripped !== skillPath) return stripped;
  const idx = skillPath.lastIndexOf("/");
  return idx > 0 ? skillPath.slice(0, idx) : "";
}

type SkillLockEntry = {
  source?: string;
  sourceType?: string;
  sourceUrl?: string;
  skillPath?: string;
  skillFolderHash?: string;
  installedAt?: string;
  updatedAt?: string;
};

/** 读 `~/.agents/.skill-lock.json` 的 skills map。文件缺失 → {}（无第三方 skill）；JSON 损坏 → 抛。
 *  home 复用 deps.skillsHome（测试注入临时目录；生产 = os.homedir()，与 skills 目录同一 home 基准）。 */
async function readSkillLock(home: string): Promise<Record<string, SkillLockEntry>> {
  let raw: string;
  try {
    raw = await readFile(join(home, LOCK_FILE_RELATIVE), "utf8");
  } catch (error) {
    if (isNotFoundError(error)) return {};
    throw new SkillError("SKILL_UPDATE_CHECK_FAILED", "Unable to read skill lock file");
  }
  try {
    const parsed = JSON.parse(raw) as { skills?: unknown };
    const skills = parsed.skills;
    if (!skills || typeof skills !== "object" || Array.isArray(skills)) return {};
    const out: Record<string, SkillLockEntry> = {};
    for (const [name, entry] of Object.entries(skills as Record<string, unknown>)) {
      if (entry && typeof entry === "object" && !Array.isArray(entry)) {
        out[name] = entry as SkillLockEntry;
      }
    }
    return out;
  } catch {
    throw new SkillError("SKILL_UPDATE_CHECK_FAILED", "Skill lock file is not valid JSON");
  }
}

/**
 * GitHub Trees API：recursive 取默认分支全树，返回 path→tree SHA 映射。repo 或 tree 拉取失败 →
 * 抛 SkillError（调用方按 repo 降级，不拖垮整体检查）。
 */
async function fetchRepoTree(owner: string, repo: string): Promise<Map<string, string>> {
  const headers = githubHeaders();
  const base = `${GITHUB_API_BASE}/repos/${owner}/${repo}`;
  const repoRes = await fetch(base, { headers, signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS) });
  if (!repoRes.ok) {
    throw new SkillError(
      "SKILL_UPDATE_CHECK_FAILED",
      `GitHub repo ${owner}/${repo} returned ${repoRes.status}`,
    );
  }
  const repoJson = (await repoRes.json()) as { default_branch?: string };
  const branch = repoJson.default_branch ?? "main";
  const treeRes = await fetch(`${base}/git/trees/${encodeURIComponent(branch)}?recursive=1`, {
    headers,
    signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
  });
  if (!treeRes.ok) {
    throw new SkillError(
      "SKILL_UPDATE_CHECK_FAILED",
      `GitHub tree ${owner}/${repo} returned ${treeRes.status}`,
    );
  }
  const treeJson = (await treeRes.json()) as {
    tree?: Array<{ path?: string; type?: string; sha?: string }>;
  };
  const map = new Map<string, string>();
  for (const entry of treeJson.tree ?? []) {
    if (entry.type === "tree" && entry.path && entry.sha) map.set(entry.path, entry.sha);
  }
  return map;
}

type SkillCheckItem = {
  status: SkillUpdateStatus;
  folder: string;
  localHash: string;
};

type RepoGroup = { owner: string; repo: string; items: SkillCheckItem[] };

export async function checkSkillUpdates(
  agent: SkillAgent,
  deps?: SkillMarketDeps,
): Promise<CheckSkillUpdatesResponse> {
  const installed = await listInstalledSkills(agent, deps);
  const lock = await readSkillLock(deps?.skillsHome ?? homedir());
  const repoGroups = new Map<string, RepoGroup>();
  const updates: SkillUpdateStatus[] = [];

  for (const skill of installed.skills) {
    const entry = lock[skill.name];
    const status: SkillUpdateStatus = { name: skill.name, hasUpdate: false, manageable: false };
    if (!entry) {
      updates.push(status); // 无锁记录 = 手写/本地 skill，不可一键更新
      continue;
    }
    status.sourceType = entry.sourceType;
    status.sourceUrl = entry.sourceUrl;
    const gh = entry.sourceType === "github" ? parseGithubRepo(entry.sourceUrl ?? "") : undefined;
    const folder = skillFolderFromPath(entry.skillPath ?? "");
    if (gh && folder && entry.skillFolderHash) {
      status.manageable = true;
      const key = `${gh.owner}/${gh.repo}`;
      const group = repoGroups.get(key) ?? { owner: gh.owner, repo: gh.repo, items: [] };
      group.items.push({ status, folder, localHash: entry.skillFolderHash });
      repoGroups.set(key, group);
    }
    updates.push(status);
  }

  for (const group of repoGroups.values()) {
    let tree: Map<string, string> | undefined;
    try {
      tree = await fetchRepoTree(group.owner, group.repo);
    } catch (error) {
      // 单 repo 拉取失败 → 该 repo 下所有 skill 降级为「不可比对」（hasUpdate=false），不影响其它 repo。
      console.error(`[skill-update] ${group.owner}/${group.repo}: ${errMsg(error)}`);
    }
    for (const item of group.items) {
      const remoteSha = tree?.get(item.folder);
      item.status.hasUpdate = Boolean(remoteSha && remoteSha !== item.localHash);
    }
  }

  return { updates };
}

export async function updateSkill(
  req: UpdateSkillRequest,
  deps: SkillMarketDeps,
): Promise<UpdateSkillResponse> {
  const name = sanitizeSkillName(req.name);
  const agent = req.agent;
  if (!(SKILL_AGENTS as readonly string[]).includes(agent)) {
    throw new SkillError("SKILL_SOURCE_INVALID", `Unsupported agent: ${agent}`);
  }
  // `skills update` 不支持 --agent（实测 `skills update --help` Update Options 仅 -g/-p/-y；
  // --agent 是 add 命令独有）。update 按 skill name 更新全局 skill（默认 claude-code 目录），
  // agent 仅作业务层校验（上方 SKILL_AGENTS）。带 --agent 会被 commander 拒绝 → exitCode≠0 → 更新失败。
  const result = await runSkillsCommand(["update", name, "--global", "--yes"], {
    timeoutMs: INSTALL_SKILL_TIMEOUT_MS,
    failureCode: "SKILL_UPDATE_FAILED",
  });
  if (result.exitCode !== 0) {
    throw new SkillError("SKILL_UPDATE_FAILED", `skills update failed: ${trimErr(result)}`);
  }
  await reloadAliveSessions(deps); // 更新 = 重装，需触发现有 catalog 刷新闭环
  return { ok: true, name };
}

// ── 路由：/api/skills/updates + /api/skills/update（独立 handler，避免与 skill-market 循环 import） ──

function skillUpdateErrorStatus(code: SkillErrorCode): number {
  switch (code) {
    case "SKILL_SOURCE_INVALID":
      return 400;
    default:
      return 500;
  }
}

async function runSkillUpdateHandler<T>(fn: () => Promise<T>, okStatus = 200): Promise<Response> {
  try {
    const data = await fn();
    return Response.json(data, { status: okStatus });
  } catch (error) {
    if (error instanceof SkillError) {
      return jsonError(error.code, error.message, skillUpdateErrorStatus(error.code));
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

export async function handleSkillUpdateRoutes(
  request: Request,
  url: URL,
  deps: SkillMarketDeps,
): Promise<Response | undefined> {
  if (url.pathname === "/api/skills/updates" && request.method === "GET") {
    const agent = parseAgent(url.searchParams.get("agent"));
    return runSkillUpdateHandler(() => checkSkillUpdates(agent, deps));
  }
  if (url.pathname === "/api/skills/update" && request.method === "POST") {
    const body = await readJson<UpdateSkillRequest>(request);
    return runSkillUpdateHandler(() => updateSkill(body, deps));
  }
  return undefined;
}
