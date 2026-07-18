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
  type SkillSourcesResponse,
  type UninstallSkillRequest,
  type UninstallSkillResponse,
} from "@agents-remote/shared";
import { parseFrontmatter } from "./claude2-slash-commands";
import type { Claude2Runtime } from "./claude2-runtime";
import { jsonError } from "./http-auth";
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
};

// skills.sh search 的最少必填字符（实测：<2 返回 400）。
const SEARCH_MIN_QUERY = 2;
const SEARCH_LIMIT = 20;
const SKILLS_SEARCH_URL = "https://skills.sh/api/search";
const SKILL_MD = "SKILL.md";

function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function trimErr(result: SkillsCommandResult): string {
  return (result.stderr.trim() || result.stdout.trim() || `exit code ${result.exitCode}`).slice(
    0,
    500,
  );
}

function parseAgent(value: string | null): SkillAgent {
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
): Promise<InstalledSkill[]> {
  const dir = agentGlobalSkillsDir(agent, home);
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
    skills.push({
      name: fm.name || entry,
      path: realPath,
      scope: "global",
      agents: [AGENT_DISPLAY_NAME[agent]],
    });
  }
  return skills;
}

export async function listInstalledSkills(
  agent: SkillAgent,
  deps?: SkillMarketDeps,
): Promise<InstalledSkillsResponse> {
  const skills = await scanInstalledSkillsFromFs(agent, resolveSkillsHome(deps));
  return { skills };
}

// ── 执行层：`npx skills add/remove`（只信 exit code，事后 list --json 回读真相） ──

/** 装/卸成功后，遍历活跃 claude2 session 发 /reload-skills，触发现有 catalog 刷新闭环。 */
async function reloadAliveSessions(deps: SkillMarketDeps): Promise<void> {
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

export async function installSkill(
  req: InstallSkillRequest,
  deps: SkillMarketDeps,
): Promise<InstallSkillResponse> {
  const source = sanitizeSource(req.source);
  const skillId = sanitizeSkillId(req.skillId);
  const agent = req.agent;
  if (!(SKILL_AGENTS as readonly string[]).includes(agent)) {
    throw new SkillError("SKILL_SOURCE_INVALID", `Unsupported agent: ${agent}`);
  }
  const result = await runSkillsCommand(
    ["add", `${source}@${skillId}`, "--global", "--agent", agent, "--yes"],
    { timeoutMs: INSTALL_SKILL_TIMEOUT_MS, failureCode: "SKILL_INSTALL_FAILED" },
  );
  if (result.exitCode !== 0) {
    throw new SkillError("SKILL_INSTALL_FAILED", `skills add failed: ${trimErr(result)}`);
  }
  await reloadAliveSessions(deps);
  // UI = f(state)：真相以 list --json 为准（不信 stdout）。list 回读失败时，
  // install 本身已成功，用 skillId 占位让前端 refetch 补全。
  try {
    const { skills } = await listInstalledSkills(agent, deps);
    const found = skills.find((s) => s.name === skillId);
    return {
      ok: true,
      skill: found ?? { name: skillId, path: "", scope: "global", agents: [agent] },
    };
  } catch {
    return { ok: true, skill: { name: skillId, path: "", scope: "global", agents: [agent] } };
  }
}

export async function uninstallSkill(
  req: UninstallSkillRequest,
  deps: SkillMarketDeps,
): Promise<UninstallSkillResponse> {
  const name = sanitizeSkillName(req.name);
  const agent = req.agent;
  if (!(SKILL_AGENTS as readonly string[]).includes(agent)) {
    throw new SkillError("SKILL_SOURCE_INVALID", `Unsupported agent: ${agent}`);
  }
  const result = await runSkillsCommand(["remove", name, "--global", "--agent", agent, "--yes"], {
    failureCode: "SKILL_UNINSTALL_FAILED",
  });
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
): Promise<SkillPreviewResponse> {
  // sanitize 拒绝 `..`/`/`/null byte，锁死在 agent skills 目录内（路径穿越不可达）。
  const safeName = sanitizeSkillName(name);
  const dir = join(agentGlobalSkillsDir(agent, resolveSkillsHome(deps)), safeName);
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
  const repo = sanitizeSource(req.repo);
  const branch = typeof req.branch === "string" ? req.branch.trim() : "";
  const label = typeof req.label === "string" ? req.label.trim() : "";
  const source: SkillSource = {
    id: randomUUID(),
    repo,
    ...(branch ? { branch } : {}),
    ...(label ? { label } : {}),
  };
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
    return runSkillHandler(() => installSkill(body, deps), 201);
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

  return undefined;
}
