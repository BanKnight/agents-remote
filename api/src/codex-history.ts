import { createReadStream } from "node:fs";
import { readdir, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import type { AgentHistoryEntry } from "@agents-remote/shared";

// ── codex 会话历史扫描（rollout JSONL）────────────────────────────────────────
//
// codex 把会话存为 `<CODEX_HOME>/sessions/<YYYY>/<MM>/<DD>/rollout-<本地时间>-<threadId>.jsonl`
// （日期三层桶，0.163.0 实测）。本模块只读文件头部几行拿元数据，**不 spawn codex 进程**
// （thread/list RPC 要拉起 app-server + 凭证/home 耦合），与 agent-history（claude）/
// omp-history 同构：文件扫描 → AgentHistoryEntry[]。
//
// JSONL 行结构（每行顶层 timestamp/ordinal/type/payload）：
//   {type:"session_meta", payload:{id, cwd, timestamp, originator, cli_version, ...}}
//     ← 首行固定；threadId = payload.id（旧版 0.135 文件无 session_id 字段，以 id 为准）；
//       payload 含 base_instructions 全文 → 首行可达十几 KB，固定 HEAD_BYTES 读头部会截断
//       后续行，解析走流式按行 + 早停（readline）。
//   {type:"event_msg", payload:{type:"user_message", message, ...}}  ← 首条用户消息来源；
//       环境注入（<environment_context>/<user_instructions> 等）以 "<" 开头标签形态出现，跳过。
//   {type:"response_item"|"turn_context"|"world_state", ...}          ← 列表不需要，忽略。
//
// 无 range 过滤（omp/claude 的 range 已退役恒全窗；codex 新接入不背旧参数）。
// 专属 CODEX_HOME（codex-home.ts）的 sessions 是软链回全局 → 扫全局一份即全覆盖，无重复
// （日期桶是真实目录，软链只发生在 per-run home 侧，不在扫描树内部）。

/** firstMessage 截断长度（对齐 agent-history.ts / omp-history.ts 同值，历史 UI 一行显示）。 */
const FIRST_MESSAGE_MAX_LEN = 120;

/** 单文件解析行数上限（meta + 首条 user 消息的正常位置远在此之内；防御异常巨型文件）。 */
const MAX_SCAN_LINES = 100;

/** 扫描目录深度上限（日期桶恰好 3 层；防御未来布局变化 + 目录环）。 */
const MAX_SCAN_DEPTH = 4;

const HISTORY_THREAD_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 扫描根：`CODEX_HOME ?? ~/.codex` + `/sessions`（与 codex-home.ts 的 globalHome 同源规则）。 */
export const codexSessionsRoot = (env: Record<string, string | undefined> = process.env): string =>
  join(env.CODEX_HOME ?? join(homedir(), ".codex"), "sessions");

/** 缓存条目不含 activeSessionId（每次用当前 activeMap 组装，不粘过期状态）。 */
type CodexHistoryPartial = {
  codexThreadId: string;
  /** 会话启动目录（session_meta payload.cwd）——项目归属的项目过滤键。 */
  cwd: string;
  startedAt: string | null;
  firstMessage: string | null;
};

/** filePath → {mtimeMs, size, partial}。进程内单例，跨请求复用（stat 必经，parse 可免）。 */
const entryCache = new Map<
  string,
  { mtimeMs: number; size: number; partial: CodexHistoryPartial }
>();
/** 并发去重：同文件并发 extract 只跑一次。 */
const inflight = new Map<string, Promise<CodexHistoryPartial | null>>();

/** 测试隔离：清空缓存（beforeEach 调用）。 */
export function clearCodexHistoryCache(): void {
  entryCache.clear();
  inflight.clear();
}

/**
 * 递归收集 rollout 文件（`rollout-*.jsonl`），深度 ≤ MAX_SCAN_DEPTH。
 * 目录项只认真实目录（withFileTypes 的 symlink 不算 isDirectory → 不入递归，防环）；
 * 任一层 readdir 失败（不存在/权限）按空处理，不拖垮整体。
 */
async function scanRolloutFiles(dir: string, depth: number, out: string[]): Promise<void> {
  if (depth > MAX_SCAN_DEPTH) return;
  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      await scanRolloutFiles(join(dir, entry.name), depth + 1, out);
    } else if (
      entry.isFile() &&
      entry.name.startsWith("rollout-") &&
      entry.name.endsWith(".jsonl")
    ) {
      out.push(join(dir, entry.name));
    }
  }
}

/**
 * 流式解析单个 rollout：session_meta（id/cwd/timestamp）+ 首条有意义的 user 消息，
 * 到手即止（MAX_SCAN_LINES 兜底）。文件损坏/无 meta → null（调用方跳过）。
 */
async function extractCodexEntry(filePath: string): Promise<CodexHistoryPartial | null> {
  const stream = createReadStream(filePath, { encoding: "utf8" });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  try {
    let threadId: string | null = null;
    let cwd: string | null = null;
    let startedAt: string | null = null;
    let firstMessage: string | null = null;
    let lines = 0;
    for await (const line of rl) {
      if (++lines > MAX_SCAN_LINES) break;
      if (!line.trim()) continue;
      let entry: Record<string, unknown>;
      try {
        entry = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue;
      }
      const payload = entry.payload as Record<string, unknown> | undefined;
      if (entry.type === "session_meta" && threadId === null && payload) {
        if (typeof payload.id === "string" && payload.id) threadId = payload.id;
        if (typeof payload.cwd === "string" && payload.cwd) cwd = payload.cwd;
        // payload.timestamp 缺失（版本漂移）时兜底行级 timestamp（每行顶层恒有）。
        if (typeof payload.timestamp === "string") startedAt = payload.timestamp;
        else if (typeof entry.timestamp === "string") startedAt = entry.timestamp;
      } else if (entry.type === "event_msg" && payload?.type === "user_message") {
        const text = typeof payload.message === "string" ? payload.message.trim() : "";
        // "<" 开头 = 环境注入（environment_context / user_instructions 等），非用户输入。
        if (text && !text.startsWith("<")) {
          firstMessage = text.slice(0, FIRST_MESSAGE_MAX_LEN);
          break;
        }
      }
    }
    if (!threadId || !cwd) return null;
    return { codexThreadId: threadId, cwd, startedAt, firstMessage };
  } catch {
    return null;
  } finally {
    rl.close();
    stream.destroy();
  }
}

function extractEntryCached(
  filePath: string,
  mtimeMs: number,
  size: number,
): Promise<CodexHistoryPartial | null> {
  const cached = entryCache.get(filePath);
  if (cached && cached.mtimeMs === mtimeMs && cached.size === size) {
    return Promise.resolve(cached.partial);
  }
  const existing = inflight.get(filePath);
  if (existing) return existing;
  const p = extractCodexEntry(filePath)
    .then((partial) => {
      if (partial) entryCache.set(filePath, { mtimeMs, size, partial });
      return partial;
    })
    .finally(() => {
      inflight.delete(filePath);
    });
  inflight.set(filePath, p);
  return p;
}

/** 对账删缓存孤儿（文件被删/改名后，下次列表清掉对应缓存条目）。 */
function reconcileCache(live: Set<string>): void {
  for (const path of entryCache.keys()) {
    if (!live.has(path)) entryCache.delete(path);
  }
}

/** cwd → 项目归属判定：等于项目根，或位于项目根目录内（子目录启动的会话仍归该项目）。 */
const cwdBelongsToProject = (cwd: string, projectPath: string): boolean => {
  if (cwd === projectPath) return true;
  const prefix = projectPath.endsWith("/") ? projectPath : `${projectPath}/`;
  return cwd.startsWith(prefix);
};

/**
 * 列出项目历史 codex session（与 listAgentHistory / listOmpHistory 同返回形状，供
 * session-routes 合流）。activeCodexThreadMap：threadId → 活跃 agent session id
 * （getActiveCodexThreadMap），用于 hasActiveSession/activeSessionId。
 */
export async function listCodexHistory(
  projectPath: string,
  activeCodexThreadMap: Map<string, string>,
): Promise<AgentHistoryEntry[]> {
  const root = codexSessionsRoot();
  const files: string[] = [];
  await scanRolloutFiles(root, 1, files);
  reconcileCache(new Set(files));
  if (files.length === 0) return [];

  type Statted = { path: string; mtimeMs: number; size: number };
  const candidates: Statted[] = [];
  for (const path of files) {
    try {
      const info = await stat(path);
      candidates.push({ path, mtimeMs: info.mtimeMs, size: info.size });
    } catch {
      // stat 失败（文件被删/权限）→ 跳过
    }
  }

  const partials = await Promise.all(
    candidates.map((c) => extractEntryCached(c.path, c.mtimeMs, c.size)),
  );

  return partials
    .map((p, i) => {
      if (!p) return null;
      if (!cwdBelongsToProject(p.cwd, projectPath)) return null;
      const c = candidates[i];
      const activeSessionId = activeCodexThreadMap.get(p.codexThreadId);
      const entry: AgentHistoryEntry = {
        provider: "codex",
        codexThreadId: p.codexThreadId,
        title: null, // codex rollout 无标题通道；UI displayTitleOf 回落 firstMessage
        firstMessage: p.firstMessage,
        startedAt: p.startedAt,
        lastActivityAt: new Date(c.mtimeMs).toISOString(),
        fileSize: c.size,
        hasActiveSession: activeSessionId !== undefined,
        activeSessionId,
      };
      return entry;
    })
    .filter((e): e is AgentHistoryEntry => e !== null)
    .sort((a, b) => {
      const aTime = a.lastActivityAt ?? a.startedAt ?? "";
      const bTime = b.lastActivityAt ?? b.startedAt ?? "";
      return bTime.localeCompare(aTime);
    });
}

/**
 * 删除单条 codex 历史会话（rollout 文件）。活跃判定在 handler 层（activeMap 409），
 * 本函数管文件 + 项目归属复核。
 *
 * 安全：threadId 先过 UUID 白名单；删除目标来自**扫描匹配**（文件名尾段相等 → meta payload.id
 * 复核），用户输入永不拼接路径；删除前用 cwd 归属复核对齐列表侧过滤——rollout 是全局日期桶
 * （无 per-project 目录），不校验则他项目（或嵌套项目外层）的 threadId 传到本项目端点可
 * 绕过本项目 activeMap 的活跃保护删掉别家正在运行的会话文件。
 *
 * @returns false = 未找到匹配文件（幂等成功）；true = 文件名候选命中（meta/归属复核不符时
 *   保守不删仍返回 true，omp 同契约）
 * @throws threadId 非法（uuid 白名单外）
 */
export async function deleteCodexHistoryEntry(
  threadId: string,
  projectPath: string,
): Promise<boolean> {
  if (!HISTORY_THREAD_ID_PATTERN.test(threadId)) {
    throw new Error(`invalid codex thread id: ${JSON.stringify(threadId)}`);
  }
  const files: string[] = [];
  await scanRolloutFiles(codexSessionsRoot(), 1, files);
  const matches = files.filter((f) => f.endsWith(`-${threadId}.jsonl`));
  for (const path of matches) {
    const partial = await extractCodexEntry(path);
    // meta 复核：文件名段碰巧相等但内容不是该 thread → 不删（保守）。
    if (partial?.codexThreadId !== threadId) continue;
    // 归属复核：该 rollout 的 cwd 不在调用方项目内 → 保守不删（跨项目防护）。
    if (!cwdBelongsToProject(partial.cwd, projectPath)) continue;
    await rm(path, { force: true });
    entryCache.delete(path);
  }
  return matches.length > 0;
}
