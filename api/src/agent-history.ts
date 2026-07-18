import { open as openFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { readdir, stat } from "node:fs/promises";
import { open, read, close } from "node:fs";
import type { AgentHistoryEntry, AgentHistoryRange } from "@agents-remote/shared";

/**
 * 单文件扫描的行数安全上限。正常路径在首条 user 行就 early-exit（前 ~5-20 行）；此上限仅
 * 防御「无 user 行的巨型文件」全扫卡死（如纯 ai-title 或异常文件），这类文件罕见且通常小。
 */
const MAX_SCAN_LINES = 200;
const LAST_MESSAGE_TAIL_BYTES = 64 * 1024;

/** range → 毫秒窗口（文件 mtime 距今超过此值即滤除）。`all` 不限。 */
const RANGE_WINDOW_MS: Record<AgentHistoryRange, number> = {
  week: 7 * 24 * 60 * 60 * 1000,
  biweekly: 15 * 24 * 60 * 60 * 1000,
  all: Number.POSITIVE_INFINITY,
};

/** 有界并发 extract 的 worker 数（替代无界 Promise.all，减 FS 打开竞争 + async 迭代器交错）。 */
const EXTRACT_CONCURRENCY = 32;

/**
 * 列出项目历史 Claude session。
 *
 * 管线：readdir 全量 → 全量 stat（mtimeMs+size）→ range 用 mtime 过滤候选 → 有界并发
 * extractEntryCached（带 mtime+size 缓存）→ 组装 activeSessionId → 按 lastActivityAt 倒序
 * → 对账删缓存孤儿。
 *
 * stat 是必经步骤（range 过滤 + 缓存失效键都依赖 mtime），377 文件 ~50ms 固定成本。缓存键
 * = (claudeSessionId, mtimeMs, size)，与 range 解耦：range=all 首拉填满缓存后，任意 range
 * 切换命中缓存瞬间返回。详见 plan 决策 1。
 *
 * @param range 时间窗口，默认 `week`（大项目默认只列近期，避免全量扫描慢）。
 */
export async function listAgentHistory(
  projectPath: string,
  activeClaudeSessionMap: Map<string, string>,
  range: AgentHistoryRange = "week",
): Promise<AgentHistoryEntry[]> {
  const slug = projectToSlug(projectPath);
  const dir = join(homedir(), ".claude", "projects", slug);

  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }

  const jsonlNames = files.filter((f) => f.endsWith(".jsonl"));
  if (jsonlNames.length === 0) return [];

  // 全量 stat：拿 mtime（range 过滤 + 缓存失效键）+ size（缓存失效键）。
  const windowMs = RANGE_WINDOW_MS[range];
  const now = Date.now();
  type Statted = { path: string; id: string; mtimeMs: number; size: number };
  const candidates: Statted[] = [];
  for (const f of jsonlNames) {
    try {
      const info = await stat(join(dir, f));
      if (now - info.mtimeMs > windowMs) continue; // range 过滤：mtime 太旧，跳过
      candidates.push({
        path: join(dir, f),
        id: f.slice(0, -6),
        mtimeMs: info.mtimeMs,
        size: info.size,
      });
    } catch {
      // stat 失败（文件被删/权限）→ 跳过
    }
  }

  // 有界并发 extract（带 mtime+size 缓存 + inflight 去重）。
  const partials = await mapLimit(candidates, EXTRACT_CONCURRENCY, (c) =>
    extractEntryCached(slug, c.path, c.id, c.mtimeMs, c.size),
  );

  // 组装 entry（activeSessionId 用当前 activeMap，不进缓存）+ 排序。
  const entries = partials
    .filter((p): p is HistoryPartial => p !== null)
    .map((p) => {
      const activeSessionId = activeClaudeSessionMap.get(p.claudeSessionId);
      return {
        claudeSessionId: p.claudeSessionId,
        title: p.title,
        firstMessage: p.firstMessage,
        startedAt: p.startedAt,
        lastActivityAt: p.lastActivityAt,
        fileSize: p.fileSize,
        hasActiveSession: activeSessionId !== undefined,
        activeSessionId,
      };
    })
    .sort((a, b) => {
      const aTime = a.lastActivityAt ?? a.startedAt ?? "";
      const bTime = b.lastActivityAt ?? b.startedAt ?? "";
      return bTime.localeCompare(aTime);
    });

  // 对账：删缓存里已不存在的文件（防删除 session 后残留过期条目）。
  const slugCache = entryCache.get(slug);
  if (slugCache) {
    const live = new Set(jsonlNames.map((f) => f.slice(0, -6)));
    for (const id of slugCache.keys()) {
      if (!live.has(id)) slugCache.delete(id);
    }
  }

  return entries;
}

/** 缓存里的 entry 不含 activeSessionId（每次用当前 activeMap 组装，不粘过期状态）。 */
type HistoryPartial = Omit<AgentHistoryEntry, "hasActiveSession" | "activeSessionId">;

/** slug → claudeSessionId → {mtimeMs, size, partial}。进程内单例，跨请求复用。 */
const entryCache = new Map<
  string,
  Map<string, { mtimeMs: number; size: number; partial: HistoryPartial }>
>();
/** 并发去重：同文件并发 extract 只跑一次（避免重复 IO/parse）。 */
const inflight = new Map<string, Promise<HistoryPartial | null>>();

/** 测试隔离：清空缓存（beforeEach 调用，避免跨 test 命中旧缓存）。 */
export function clearHistoryCache(): void {
  entryCache.clear();
  inflight.clear();
}

function extractEntryCached(
  slug: string,
  filePath: string,
  id: string,
  mtimeMs: number,
  size: number,
): Promise<HistoryPartial | null> {
  let slugCache = entryCache.get(slug);
  if (!slugCache) {
    slugCache = new Map();
    entryCache.set(slug, slugCache);
  }
  // 命中缓存（mtimeMs+size 一致）→ 直接复用 partial。
  const cached = slugCache.get(id);
  if (cached && cached.mtimeMs === mtimeMs && cached.size === size) {
    return Promise.resolve(cached.partial);
  }
  // 未命中 → inflight 去重 → extractEntry → 写缓存。
  const cacheKey = `${slug}/${id}`;
  const existing = inflight.get(cacheKey);
  if (existing) return existing;

  const p = extractEntry(filePath, id, mtimeMs, size)
    .then((partial) => {
      if (partial) slugCache!.set(id, { mtimeMs, size, partial });
      return partial;
    })
    .finally(() => {
      inflight.delete(cacheKey);
    });
  inflight.set(cacheKey, p);
  return p;
}

/**
 * 提取单个 session 的元数据：title（沿途 ai-title，last-write-wins）、firstMessage + startedAt
 *（首条 user 行）、复用传入的 mtime/size（免二次 stat）。
 *
 * early-exit：读到首条 user 行即 break（首行通常是 queue-operation，首条 user 在前 ~5-20 行）。
 * 若 ai-title 在 user 之后会漏——可接受（实测 97% 文件无 ai-title，UI 优先 firstMessage，
 * 退化无感知，见 plan 决策 2）。无 user 行的文件不 break、扫到 MAX_SCAN_LINES 或 EOF 拿 title。
 */
async function extractEntry(
  filePath: string,
  claudeSessionId: string,
  mtimeMs: number,
  size: number,
): Promise<HistoryPartial | null> {
  let title: string | null = null;
  let firstMessage: string | null = null;
  let startedAt: string | null = null;

  try {
    const handle = await openFile(filePath, "r");
    try {
      let lineIndex = 0;
      for await (const line of handle.readLines()) {
        if (lineIndex >= MAX_SCAN_LINES) break;
        lineIndex++;
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(line) as Record<string, unknown>;
        } catch {
          continue; // skip malformed
        }
        const t = msg.type;
        if (t === "ai-title" && typeof msg.aiTitle === "string") {
          title = msg.aiTitle; // last-write-wins
        }
        if (t === "user" && msg.message && typeof msg.message === "object") {
          if (!startedAt && typeof msg.timestamp === "string") {
            startedAt = msg.timestamp;
          }
          if (!firstMessage) {
            firstMessage = extractMessageText(msg.message as Record<string, unknown>);
          }
          break; // early-exit：拿到首条 user 即停
        }
      }
    } finally {
      await handle.close();
    }
  } catch {
    return null;
  }

  if (firstMessage && firstMessage.length > 120) {
    firstMessage = firstMessage.slice(0, 120) + "…";
  }

  return {
    claudeSessionId,
    title,
    firstMessage,
    startedAt,
    lastActivityAt: new Date(mtimeMs).toISOString(),
    fileSize: size,
  };
}

/**
 * 有界并发 map：最多 `limit` 个 worker 同时跑 fn，超出排队。避免无界 Promise.all 在数百文件
 * 时的 FS 打开竞争 + async 迭代器交错开销。
 */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = Array.from({ length: items.length });
  let cursor = 0;
  const workerCount = Math.min(limit, items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) break;
      results[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return results;
}

function extractMessageText(message: Record<string, unknown>): string | null {
  const content = message.content;
  if (!Array.isArray(content)) return null;
  for (const block of content) {
    if (
      typeof block === "object" &&
      block !== null &&
      (block as Record<string, unknown>).type === "text" &&
      typeof (block as Record<string, unknown>).text === "string"
    ) {
      return (block as Record<string, unknown>).text as string;
    }
  }
  return null;
}

export async function getLastAssistantMessage(
  projectPath: string,
  claudeSessionId: string,
): Promise<string | null> {
  const slug = projectToSlug(projectPath);
  const filePath = join(homedir(), ".claude", "projects", slug, `${claudeSessionId}.jsonl`);

  let fd: number | undefined;
  try {
    fd = await new Promise<number>((resolve, reject) =>
      open(filePath, "r", (err, opened) => (err ? reject(err) : resolve(opened))),
    );

    const { size } = await stat(filePath);
    if (size === 0) return null;

    const readStart = Math.max(0, size - LAST_MESSAGE_TAIL_BYTES);
    const buf = Buffer.alloc(size - readStart);

    await new Promise<number>((resolve, reject) =>
      read(fd!, buf, 0, buf.length, readStart, (err, bytesRead) =>
        err ? reject(err) : resolve(bytesRead),
      ),
    );

    const chunk = buf.toString("utf-8");
    const lines = chunk.split("\n");
    let lastText: string | null = null;

    for (const line of lines) {
      if (!line) continue;
      try {
        const msg = JSON.parse(line) as Record<string, unknown>;
        if (msg.type === "assistant" && msg.message && typeof msg.message === "object") {
          const text = extractMessageText(msg.message as Record<string, unknown>);
          if (text) lastText = text;
        }
      } catch {
        // skip malformed
      }
    }

    return lastText;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) {
      close(fd, () => {});
    }
  }
}

// Claude CLI sanitizes the absolute project path into a directory name under
// ~/.claude/projects/ by replacing every character that is not alphanumeric
// with a dash. We must match that rule exactly so projects with spaces,
// CJK characters, or other symbols still resolve to the correct JSONL folder.
export const projectToSlug = (projectPath: string): string =>
  projectPath.replace(/[^a-zA-Z0-9]/g, "-");
