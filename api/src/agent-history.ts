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

/**
 * firstMessage 截断长度（对齐 claude cli `extractFirstPrompt` 的 200 char 上限量级，本项目历史
 * UI 一行显示，120 足够辨识）。
 */
const FIRST_MESSAGE_MAX_LEN = 120;

/**
 * 标题/首消息文本净化：删除所有小写 XML 标签块（系统注入的 `<system-reminder>`、`<command-name>`、
 * `<local-command-stdout>`、IDE 元数据等）。只匹配小写标签名（`[a-z][\w-]*`）以放过用户正文里提到
 * 的 JSX/HTML（"fix the <Button> layout" 首字母大写不匹配）。port 自 claude cli `displayTags.ts`。
 *
 * `stripDisplayTags`：strip 后为空则返回原文（宁可显示点东西）。
 * `stripDisplayTagsAllowEmpty`：strip 后为空则返回空（用于检测 command-only prompt，让它 fall through
 * 到下一条 user 而非显示空标题）。
 */
const XML_TAG_BLOCK_PATTERN = /<([a-z][\w-]*)(?:\s[^>]*)?>[\s\S]*?<\/\1>\n?/g;

function stripDisplayTags(text: string): string {
  const result = text.replace(XML_TAG_BLOCK_PATTERN, "").trim();
  return result || text;
}

function stripDisplayTagsAllowEmpty(text: string): string {
  return text.replace(XML_TAG_BLOCK_PATTERN, "").trim();
}

/**
 * 跳过「非有意义的」首条 prompt：小写 XML 标签开头（`<local-command-stdout>`、`<command-message>`、
 * `<system-reminder>` 等系统注入）或 `[Request interrupted by user]` 合成中断标记。port 自 claude cli
 * `sessionStorage.ts` `SKIP_FIRST_PROMPT_PATTERN`。
 */
const SKIP_FIRST_PROMPT_PATTERN = /^(?:\s*<[a-z][\w-]*[\s>]|\[Request interrupted by user[^\]]*\])/;

/**
 * 内置斜杠命令名集合（无参的内置命令当 title 没意义，跳过）。claude cli 的 `builtInCommandNames()` 是
 * 动态集合（含 skills/workflows/torch 等），无法静态 port；此处取核心稳定内置命令，覆盖常见无参命令
 *（`/clear`、`/compact`、`/model`、`/status` 等）。command-name 场景在历史 session 首条 prompt 中罕见，
 * 集合不完整只影响极少数 command-only session 的 title，可后续按需补。
 */
const BUILT_IN_COMMAND_NAMES = new Set([
  "clear",
  "compact",
  "model",
  "resume",
  "cost",
  "help",
  "config",
  "login",
  "logout",
  "status",
  "memory",
  "review",
  "init",
  "vim",
  "permissions",
  "doctor",
  "bug",
  "mcp",
  "terminal-setup",
  "theme",
  "usage",
  "stats",
  "feedback",
  "rewind",
  "plan",
  "hooks",
  "sandbox",
  "privacy",
  "upgrade",
  "skills",
  "tasks",
  "tag",
  "stickers",
  "statusline",
  "export",
]);

const COMMAND_NAME_TAG = "command-name";

/**
 * 从文本中提取指定 XML 标签的内容（处理属性、多行）。port 自 claude cli `messages.ts:633`
 *（简化：command-name / command-args / bash-input 不嵌套，单层匹配足够；保留 `gi` 防大小写差异）。
 */
function extractTag(html: string, tagName: string): string | null {
  if (!html.trim() || !tagName.trim()) return null;
  const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`<${escaped}(?:\\s+[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, "gi");
  const match = pattern.exec(html);
  return match && match[1] ? match[1] : null;
}

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
    // 目录不存在：释放该 slug 的全部缓存（曾填满缓存的项目删目录后，早退会漏掉对账导致缓存泄漏）。
    entryCache.delete(slug);
    return [];
  }

  const jsonlNames = files.filter((f) => f.endsWith(".jsonl"));

  // 对账：删缓存里已不在磁盘的条目。放在早退与 extract 之前——目录变空（jsonlNames=[]）时
  // 也要释放，否则曾填满缓存的空目录会永久残留 N 条 partial。判据是「磁盘无此 id」而非
  // 「不在候选」（range 过滤掉的旧文件仍在磁盘，缓存命中可复用，不算孤儿）。
  reconcileSlugCache(slug, jsonlNames);

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

  return entries;
}

/**
 * 对账：删 slug 缓存里已不在磁盘的条目，并在 slug 缓存空时回收整个 slug Map。
 *
 * - 判据是「磁盘无此 id」：range 过滤掉的旧文件仍在磁盘（缓存命中可复用），不算孤儿，保留；
 *   真正删掉的文件（session 被删）才清。
 * - slug 缓存清空后 `entryCache.delete(slug)` 释放外层 Map 条目，避免「曾活跃项目删空后」
 *   留一个空 Map 占位（同 slug 只在磁盘有 jsonl 时才占缓存）。
 * - 放在 extract 之前且覆盖早退路径（目录不存在 / 目录空），杜绝「早退漏对账」的缓存泄漏。
 */
function reconcileSlugCache(slug: string, jsonlNames: string[]): void {
  const slugCache = entryCache.get(slug);
  if (!slugCache) return;
  if (jsonlNames.length === 0) {
    entryCache.delete(slug);
    return;
  }
  const live = new Set(jsonlNames.map((f) => f.slice(0, -6)));
  for (const id of slugCache.keys()) {
    if (!live.has(id)) slugCache.delete(id);
  }
  if (slugCache.size === 0) entryCache.delete(slug);
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

/**
 * 测试探针：缓存里 slug 数 + 每个 slug 的条目数。生产代码不调用，仅供断言「孤儿/空 slug 已释放」。
 * 返回 `Map<slug, count>` 拷贝，断言用。
 */
export function inspectHistoryCacheForTesting(): Map<string, number> {
  const snapshot = new Map<string, number>();
  for (const [slug, slugCache] of entryCache) {
    snapshot.set(slug, slugCache.size);
  }
  return snapshot;
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
 * 提取单个 session 的元数据。
 *
 * - `title`：沿途记 custom-title 与 ai-title（last-write-wins），最终 `customTitle ?? aiTitle ?? null`
 *   ——优先级对齐 claude cli `getLogDisplayTitle` 与 orca `session-scanner-claude-title`（custom >
 *   ai > firstPrompt）。不主动生成 ai-title。
 * - `firstMessage`：首条「有意义」user prompt（跳 isMeta、command-name 无参、SKIP pattern、strip 后
 *   为空的 command-only），非首条 user 行——port claude cli `getFirstMeaningfulUserMessageTextContent`。
 *   未命中（首条 user 全是系统注入/command-only）则继续读下一条 user，直到命中或 MAX_SCAN_LINES。
 * - `startedAt`：首条 user 行的 timestamp（无论是否有意义）——会话开始时间不应因首条是系统注入而漂移。
 *
 * early-exit：firstMessage 命中即 break。title 行需全扫，但实测 ai-title/custom-title 几乎都在 user 之前
 * 或文件无 user（`uses last ai-title` 测试即无 user 全扫场景）；user 之后出现 title 在真实数据中不存在，
 * break 不丢 title（与 Phase A 决策 2 一致取舍）。
 */
async function extractEntry(
  filePath: string,
  claudeSessionId: string,
  mtimeMs: number,
  size: number,
): Promise<HistoryPartial | null> {
  let customTitle: string | null = null;
  let aiTitle: string | null = null;
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
        if (t === "custom-title" && typeof msg.customTitle === "string") {
          customTitle = msg.customTitle; // last-write-wins
        }
        if (t === "ai-title" && typeof msg.aiTitle === "string") {
          aiTitle = msg.aiTitle; // last-write-wins
        }
        if (t === "user" && msg.message && typeof msg.message === "object") {
          if (!startedAt && typeof msg.timestamp === "string") {
            startedAt = msg.timestamp;
          }
          if (!firstMessage) {
            const meaningful = extractFirstMeaningfulPrompt(msg.message as Record<string, unknown>);
            if (meaningful !== null) firstMessage = meaningful;
            // 未命中（isMeta/command-only/SKIP）→ firstMessage 仍 null，继续循环找下一条 user
          }
          if (firstMessage) break; // 命中才 break；未命中继续读（收集 title + 找下一条有意义 user）
        }
      }
    } finally {
      await handle.close();
    }
  } catch {
    return null;
  }

  if (firstMessage) {
    // strip display tags（command-name/bash-input 格式化文本经 strip 不会变空，仍含命令名/输入）；
    // strip 后为空（command-only，如纯 /clear）不应发生——extractFirstMeaningfulPrompt 已过滤这类。
    const stripped = stripDisplayTags(firstMessage).trim();
    firstMessage = stripped || firstMessage;
    if (firstMessage.length > FIRST_MESSAGE_MAX_LEN) {
      firstMessage = firstMessage.slice(0, FIRST_MESSAGE_MAX_LEN) + "…";
    }
  }

  return {
    claudeSessionId,
    title: customTitle ?? aiTitle ?? null,
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

/**
 * 从单条 user 消息提取首条「有意义」prompt 文本（未 strip display tags，strip 留给 extractEntry 外层统一做）。
 * port 自 claude cli `sessionStorage.ts` `getFirstMeaningfulUserMessageTextContent`（单条消息版：claude cli
 * 外层遍历 messages、内层遍历 texts；本函数是内层，外层遍历 user 行由 extractEntry 循环负责）。
 *
 * 判定顺序（对齐 claude cli）：收集所有 text block 文本（IDE 元数据 tag 可能排在前，遍历以找真实 prompt），
 * 对每个 textContent 依次：
 *   1. `<command-name>` tag：内置无参 → skip；有 args → 返回 `<command-name> <args>` 格式化。
 *   2. `<bash-input>` tag → 返回 `! ${bashInput}`。
 *   3. `SKIP_FIRST_PROMPT_PATTERN`（小写 XML 开头 / interrupted）→ skip。
 *   4. 否则 → 返回该 textContent。
 * 全部 textContent 都 skip（command-only 无后续）→ 返回 null（让 extractEntry 找下一条 user）。
 *
 * 注意：调用方需自行跳过 `isMeta`（extractEntry 在调用前不 break isMeta 行，而是传进来由本函数判定——
 * 但 isMeta 的 content 也是合法文本，本函数不过滤 isMeta；isMeta 跳过在 extractEntry 层做）。
 */
function extractFirstMeaningfulPrompt(message: Record<string, unknown>): string | null {
  const content = message.content;
  const texts: string[] = [];
  if (typeof content === "string") {
    texts.push(content);
  } else if (Array.isArray(content)) {
    for (const block of content) {
      if (
        typeof block === "object" &&
        block !== null &&
        (block as Record<string, unknown>).type === "text" &&
        typeof (block as Record<string, unknown>).text === "string"
      ) {
        texts.push((block as Record<string, unknown>).text as string);
      }
    }
  }
  for (const textContent of texts) {
    if (!textContent) continue;
    const commandNameTag = extractTag(textContent, COMMAND_NAME_TAG);
    if (commandNameTag) {
      const commandName = commandNameTag.replace(/^\//, "").trim();
      if (BUILT_IN_COMMAND_NAMES.has(commandName)) {
        continue; // 内置无参 → 无意义，跳过
      }
      const commandArgs = extractTag(textContent, "command-args")?.trim();
      if (!commandArgs) {
        continue; // custom 命令无参 → 无意义，跳过
      }
      return `${commandNameTag} ${commandArgs}`;
    }
    const bashInput = extractTag(textContent, "bash-input");
    if (bashInput) {
      return `! ${bashInput}`;
    }
    if (SKIP_FIRST_PROMPT_PATTERN.test(textContent)) {
      continue; // 小写 XML 开头 / interrupted → 系统注入，跳过
    }
    // strip 后为空（command-only 如纯 /clear 包裹）→ 视为未命中，找下一个 textContent / 下一条 user
    if (!stripDisplayTagsAllowEmpty(textContent)) {
      continue;
    }
    return textContent;
  }
  return null;
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
