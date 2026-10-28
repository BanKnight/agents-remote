// Codex 会话回放缓存（逻辑层）：镜像 claude-replay-cache.ts（d565ba4 跨 remount 增量
// 回放恢复）对 codex-adapter 锚机制的适配——codex 的增量回放锚（?since=<锚 id>）活在
// useCodexSession 的 anchorRef/rawMessages 组件内存里，切走会话再切回 / PWA 被回收 /
// 刷新后随 state 一起丢失，只能全量回放。本层把「定格态锚 + 其原始条目窗口」持久化，
// remount 时恢复窗口即刻呈现 + WS 带 since 锚，服务端 delta 只补离开期间的增量。
//
// 与 claude 版的差异：
// - 行内容 = JSON.stringify(CodexRawItem)（codex 的 raw 日志是对象数组，序列化成
//   JSONL 串落盘以复用存储层 StoredEntry.raw 单串形状）；parse 回对象在 adapter 恢复
//   端做——本层对条目形状零依赖（无 adapter 循环 import）。
// - 锚由调用方传入（adapter 的 codexAnchorId(raw) 从完整窗口推导；claude 的两阶段
//   采集问题在 codex 不存在——raw 就是已提交的完整数组）；恢复端 adapter 重推导
//  （codexAnchorId(parsed)）保持单一真相，entry.anchorId 仅作非空校验。
// - resume 恒 false：codex 无 claude「孤儿 tool_use interrupted」语义（窗口内未终
//   态条目由服务端 delta 补齐 + started 重置幂等收敛，见 codex-adapter 锚注释）。
// - key 前缀 codexReplayCache:（同 IDB 库共享全局 LRU 预算——listMeta 返回全部前缀，
//   claude+codex 合计 50M 上限，淘汰按 savedAt 统一最旧优先）。
//
// 存储层 = replay-cache-store.ts 的 ReplayCacheStore（生产 IndexedDB）；降级/墓碑/
// LRU/配额重试语义与 claude 版逐条同构（详见 claude-replay-cache.ts 头注释）。

import { createIdbReplayStore } from "./replay-cache-store";
import type { ReplayCacheStore, StoredEntry } from "./replay-cache-store";

/** 单 entry 行数上限：截头保尾（窗口语义 = 最近历史，锚在尾部天然保留）。 */
export const CODEX_REPLAY_CACHE_MAX_LINES = 600;
/** 全局字符上限与 claude 版同值（共享预算）：见 claude-replay-cache.ts REPLAY_CACHE_MAX_TOTAL_CHARS。 */
export const CODEX_REPLAY_CACHE_MAX_TOTAL_CHARS = 50_000_000;

/** 对外形态：raw 是 JSONL 行数组（调用方逐行 parse 回 CodexRawItem）。 */
export type CodexReplayCacheEntry = {
  v: 1;
  /** 定格态锚 id（codexAnchorId 推导；恢复端重推导，此字段仅校验）。 */
  anchorId: string;
  savedAt: number;
  raw: string[];
};

export function codexReplayCacheKey(projectName: string, sessionId: string): string {
  // 项目名可含 `/`（目录型项目），与 codexStreamUrl 同款编码防 key 歧义。
  return `${CODEX_REPLAY_CACHE_PREFIX}${encodeURIComponent(projectName)}/${encodeURIComponent(sessionId)}`;
}

const CODEX_REPLAY_CACHE_PREFIX = "codexReplayCache:";

// 存储注入 seam：生产懒创建（每页面加载一次）；无 indexedDB 的环境工厂返回 null =
// 全降级。测试注入内存实现（bun/jsdom 无 IDB）。
let activeStore: ReplayCacheStore | null | undefined;

function getStore(): ReplayCacheStore | null {
  if (activeStore === undefined) activeStore = createIdbReplayStore();
  return activeStore;
}

/** @internal 测试注入（bun/jsdom 无 indexedDB）；传 null 还原生产懒创建路径。 */
export function setCodexReplayCacheStoreForTests(store: ReplayCacheStore | null): void {
  activeStore = store ?? undefined;
}

/** 读取并校验：墓碑 / v / anchorId / raw 任一不满足按 miss（损坏不传播，走全量回退）。 */
export async function loadCodexReplayCache(key: string): Promise<CodexReplayCacheEntry | null> {
  try {
    const record = await getStore()?.load(key);
    if (!record || "removed" in record) return null;
    if (record.v !== 1 || !record.cursorUuid || typeof record.raw !== "string") return null;
    const raw = record.raw.length > 0 ? record.raw.split("\n") : [];
    if (raw.length === 0) return null;
    return { v: 1, anchorId: record.cursorUuid, savedAt: record.savedAt, raw };
  } catch {
    return null;
  }
}

/**
 * 保存：raw 是序列化行数组（adapter 端 JSON.stringify 每条目）；anchorId 为
 * codexAnchorId(rawItems) 的推导结果——null = 窗口内无可锚条目（全是流式中状态）→
 * 硬删（不可恢复的窗口缓存没有意义，恢复端也推不出锚）。落盘不截断字符（IDB 配额
 * 下恢复语义完整，对齐 claude 版「落盘不截断」裁决）。
 */
export async function saveCodexReplayCache(
  key: string,
  raw: string[],
  anchorId: string | null,
): Promise<void> {
  try {
    const store = getStore();
    if (!store) return;
    const lines = capByLines(raw);
    if (!anchorId || lines.length === 0) {
      await store.remove(key);
      return;
    }
    const entry: StoredEntry = {
      savedAt: Date.now(),
      v: 1,
      cursorUuid: anchorId,
      resume: false,
      raw: lines.join("\n"),
    };
    try {
      await store.putUnlessTombstone(key, entry);
    } catch {
      // 配额等存储失败：淘汰后重试一次（重试成功即收口；仍失败外层 catch 静默放弃）。
      await evictForCapacity(store, key);
      await store.putUnlessTombstone(key, entry);
      return;
    }
    // 例行全局 cap 收口（共享 claude+codex 预算；正常路径零 victims 空扫）。
    await evictForCapacity(store, key);
  } catch {
    // 隐私模式 / 配额 / 序列化异常：静默降级（增强能力退回全量回放）。
  }
}

/** 清档并立墓碑（会话删除清扫；语义同 claude 版 clearReplayCache）。 */
export async function clearCodexReplayCache(key: string): Promise<void> {
  try {
    await getStore()?.tombstone(key);
  } catch {
    // ignore
  }
}

/** 项目级清扫（删除/重命名项目后）：**硬删**而非墓碑（rename A→B→A 陷阱，见 claude 版同款注释）。 */
export async function clearProjectCodexReplayCache(projectName: string): Promise<void> {
  try {
    const store = getStore();
    if (!store) return;
    const prefix = `${CODEX_REPLAY_CACHE_PREFIX}${encodeURIComponent(projectName)}/`;
    await store.deleteMany(await store.listKeys(prefix));
  } catch {
    // ignore
  }
}

/** 截头保尾：只行数 cap（字符截断已废除——IDB 配额下落盘不截断）。 */
function capByLines(raw: string[]): string[] {
  return raw.length > CODEX_REPLAY_CACHE_MAX_LINES ? raw.slice(-CODEX_REPLAY_CACHE_MAX_LINES) : raw;
}

/** 全局配额（共享预算）：meta 小记录汇总，超限按 savedAt 最旧优先淘汰他人（不含 selfKey）。 */
async function evictForCapacity(store: ReplayCacheStore, selfKey: string): Promise<void> {
  const rows = await store.listMeta();
  let total = 0;
  for (const row of rows) total += row.chars;
  if (total <= CODEX_REPLAY_CACHE_MAX_TOTAL_CHARS) return;
  const victims = rows.filter((row) => row.key !== selfKey).sort((a, b) => a.savedAt - b.savedAt);
  const doomed: string[] = [];
  for (const row of victims) {
    doomed.push(row.key);
    total -= row.chars;
    if (total <= CODEX_REPLAY_CACHE_MAX_TOTAL_CHARS) break;
  }
  if (doomed.length > 0) await store.deleteMany(doomed);
}
