import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
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

// ── 已装层：`npx skills list --json --global`（真相源；stdout JSON 可机读） ──

type RawInstalledSkill = {
  name?: unknown;
  path?: unknown;
  scope?: unknown;
  agents?: unknown;
};

function toInstalledSkill(raw: RawInstalledSkill): InstalledSkill | null {
  if (typeof raw.name !== "string" || typeof raw.path !== "string") return null;
  const agents = Array.isArray(raw.agents)
    ? raw.agents.filter((a): a is string => typeof a === "string")
    : [];
  const scope = raw.scope === "project" ? "project" : "global";
  return { name: raw.name, path: raw.path, scope, agents };
}

// skills CLI 的 `agents` 字段返回 display name（"Claude Code"），而 SkillAgent 是 id
//（"claude-code"）。normalize 抹平大小写/空格/连字符/下划线差异做匹配——否则
// `agents.includes("claude-code")` 对真实 ["Claude Code"] 恒 false，已装列表永远空。
function normalizeAgentName(a: string): string {
  return a.toLowerCase().replace(/[\s_-]/g, "");
}

export async function listInstalledSkills(agent: SkillAgent): Promise<InstalledSkillsResponse> {
  const result = await runSkillsCommand(["list", "--json", "--global"], {
    failureCode: "SKILL_LIST_FAILED",
  });
  if (result.exitCode !== 0) {
    throw new SkillError("SKILL_LIST_FAILED", `skills list failed: ${trimErr(result)}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout);
  } catch (error) {
    throw new SkillError("SKILL_LIST_FAILED", `Invalid JSON from skills list: ${errMsg(error)}`);
  }
  const want = normalizeAgentName(agent);
  const rawSkills = Array.isArray(parsed) ? (parsed as RawInstalledSkill[]) : [];
  const skills = rawSkills
    .map(toInstalledSkill)
    .filter((s): s is InstalledSkill => s !== null)
    .filter((s) => s.agents.some((a) => normalizeAgentName(a) === want));
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
    const { skills } = await listInstalledSkills(agent);
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

// ── 预览层：已装 skill 本地 SKILL.md（零网络、零 rate-limit） ──

export async function previewInstalledSkill(
  name: string,
  agent: SkillAgent,
): Promise<SkillPreviewResponse> {
  const safeName = sanitizeSkillName(name);
  const { skills } = await listInstalledSkills(agent);
  const found = skills.find((s) => s.name === safeName);
  if (!found || !found.path) {
    throw new SkillError("SKILL_PREVIEW_FAILED", `Skill not found: ${safeName}`);
  }
  let content: string;
  try {
    content = await readFile(join(found.path, SKILL_MD), "utf8");
  } catch (error) {
    throw new SkillError("SKILL_PREVIEW_FAILED", `Failed to read SKILL.md: ${errMsg(error)}`);
  }
  const fm = parseFrontmatter(content);
  return {
    name: fm.name || safeName,
    description: fm.description || undefined,
    content,
    source: found.path,
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
    return runSkillHandler(() => listInstalledSkills(agent));
  }

  if (url.pathname === "/api/skills/preview" && isGet) {
    const name = url.searchParams.get("name") ?? "";
    const agent = parseAgent(url.searchParams.get("agent"));
    return runSkillHandler(() => previewInstalledSkill(name, agent));
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
