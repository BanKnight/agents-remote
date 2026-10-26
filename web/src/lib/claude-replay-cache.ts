// Claude 会话回放缓存（逻辑层）：跨 remount 的增量回放恢复——d565ba4 的重连增量
// 回放锚（claude-adapter cursorRef）活在组件内存里，切走会话再切回 / PWA 被回收重载 /
// 刷新后锚随 rawMessages 一起丢失，只能全量回放（用户观察：「每次重连都从旧的地方加载
// 到最新」）。本层把「窗口尾锚 + 其原始 JSON 行窗口 + resume 语义」持久化到底层存储，
// remount 时恢复窗口即刻呈现 + WS 带 since 锚，服务端 delta 只补离开期间的增量。
//
// 存储层 = replay-cache-store.ts 的 ReplayCacheStore 接口（生产 IndexedDB，2026-10-26
// 自 localStorage 迁入）：localStorage ~5M/origin 放不下真实会话窗口（实测三窗口合计
// 4.44M），全局 cap 2.5M 下快速轮切三个大会话稳态互驱逐全 miss（「瞬出时有时无」的
// 根因，参数与数据规模不匹配而非 LRU 代码 bug）；且旧单 entry 字符 cap 1.5M 在偷偷截
// 断两个大会话的窗口。本层签名全异步、永 reject（内部全 catch），调用方 fire-and-forget
// 零负担——缓存是增强能力，任何失败（无 IDB / 隐私模式 / 配额满 / 损坏）都退回全量
// 回放路径，绝不影响主流程。raw 仍以 JSONL 单串存储：meta.chars 口径直取 raw.length，
// 探针断言的落盘形状不变。
//
// 容量治理：单 entry 行数 cap（截头保尾，窗口语义）；内存窗口字符 cap + 单行毒化阈值
// （见 REPLAY_WINDOW_MAX_CHARS）；全局字符 cap + savedAt LRU 淘汰（meta 小记录扫描，
// 绝不反序列化大 entry）；配额失败淘汰后重试一次。空窗口 / 窗口内无可推导锚 → 硬删
// （不生成垃圾 entry）。生命周期：项目/会话删除时显式清扫（墓碑语义），跨设备残留由
// 全局 cap + LRU 兜底。

import { createIdbReplayStore, REPLAY_CACHE_PREFIX } from "./replay-cache-store";
import type { ReplayCacheStore, StoredEntry } from "./replay-cache-store";

/** 单 entry 行数上限：截头保尾（窗口语义 = 最近历史，锚在尾部天然保留）。 */
export const REPLAY_CACHE_MAX_LINES = 600;
/**
 * 内存窗口字符上限（旧 REPLAY_CACHE_MAX_ENTRY_CHARS 一常量三用途拆分后的内存用途）：
 * ① pushReplayLine 内存窗口摊还裁剪上限；② 单行毒化阈值（超限病态单行放弃整窗缓存）。
 * localStorage 时代的落盘字符截断已废除——IDB 配额下落盘不截断（恢复语义完整性），
 * 真实数据里 2.89M 的窗口旧版被偷偷丢头，现在原样缓存。
 */
export const REPLAY_WINDOW_MAX_CHARS = 8_000_000;
/**
 * 全局字符上限（LRU 预算，meta.chars 软口径）：50M code units ≈ 容纳 ~17 个实测
 * 大会话窗口；iOS 动态配额（数百 MB 级）下余量充足，仍是跨设备残留 / 病态增长的
 * 兜底（超限按 savedAt LRU 淘汰最旧会话）。
 */
export const REPLAY_CACHE_MAX_TOTAL_CHARS = 50_000_000;

/** 对外形态：raw 是行数组（调用方逐行 parse 走 processBatch）。 */
export type ReplayCacheEntry = {
  v: 1;
  /** 锚 = 窗口内最后一条带顶层 uuid 行的 uuid（写入时从窗口推导，恢复端行内推导同源）。 */
  cursorUuid: string;
  /** 恢复时写回 isResumeRef：窗口内上一段 resume 遗留的孤儿 tool_use 需 interrupted 语义。 */
  resume: boolean;
  savedAt: number;
  raw: string[];
};

export function replayCacheKey(projectName: string, sessionId: string): string {
  // 项目名可含 `/`（目录型项目），与 claudeStreamUrl 同款编码防 key 歧义。
  return `${REPLAY_CACHE_PREFIX}${encodeURIComponent(projectName)}/${encodeURIComponent(sessionId)}`;
}

// 存储注入 seam：生产懒创建（每页面加载一次；无 indexedDB 的环境工厂返回 null =
// 全降级）；测试注入内存实现（bun/jsdom 无 IDB，伪造结构化克隆不现实）。
let activeStore: ReplayCacheStore | null | undefined;

function getStore(): ReplayCacheStore | null {
  if (activeStore === undefined) activeStore = createIdbReplayStore();
  return activeStore;
}

/** @internal 测试注入（bun/jsdom 无 indexedDB）；传 null 还原生产懒创建路径。 */
export function setReplayCacheStoreForTests(store: ReplayCacheStore | null): void {
  activeStore = store ?? undefined;
}

/** 读取并校验：墓碑 / v / cursorUuid / raw 任一不满足按 miss（损坏不传播，走全量回退）。 */
export async function loadReplayCache(key: string): Promise<ReplayCacheEntry | null> {
  try {
    const record = await getStore()?.load(key);
    if (!record || "removed" in record) return null;
    if (record.v !== 1 || !record.cursorUuid || typeof record.raw !== "string") return null;
    const raw = record.raw.length > 0 ? record.raw.split("\n") : [];
    if (raw.length === 0) return null;
    return {
      v: 1,
      cursorUuid: record.cursorUuid,
      resume: record.resume,
      savedAt: record.savedAt,
      raw,
    };
  } catch {
    return null;
  }
}

export async function saveReplayCache(key: string, resume: boolean, raw: string[]): Promise<void> {
  try {
    const store = getStore();
    if (!store) return;
    // ── 同步段：pushReplayLine 会原地 push raw 数组——所有对它的读取（行 cap、
    // 锚推导、join）必须在首个 await 前完成，快照出不可变串；await 之后的操作只碰
    // 快照，调用方零拷贝。
    const lines = capByLines(raw);
    // 锚由窗口自身推导（单一真相）：调用方持有的「最后一条已处理 uuid」可能落后于
    // 采集窗口（history 批次先采集、history_end 才 processBatch），也可能被截头丢出
    // ——锚与窗口一旦分叉，恢复端从行内推导的锚就与 entry 不一致。逆序推导与恢复端
    // processBatch 的行内推导同源，且锚必然存活于窗口。
    const cursorUuid = deriveAnchor(lines);
    if (!cursorUuid) {
      await store.remove(key);
      return;
    }
    const entry: StoredEntry = {
      savedAt: Date.now(),
      v: 1,
      cursorUuid,
      resume,
      raw: lines.join("\n"),
    };
    // ── 异步段：putUnlessTombstone 在单 tx 内做墓碑检查（删除语义对 save 的单向
    // 闸）并维护 meta；墓碑挡下（false）即静默放弃，行为对齐旧「墓碑不复活」。
    try {
      await store.putUnlessTombstone(key, entry);
    } catch {
      // 配额等存储失败：淘汰后重试一次——重试路径的 evict 已跑，成功即收口返回
      //（不再走下方例行 evict 重复扫描）；仍失败被外层 catch 静默放弃。
      await evictForCapacity(store, key);
      await store.putUnlessTombstone(key, entry);
      return;
    }
    // 例行全局 cap 收口（listMeta 只读小记录；正常路径淘汰是零 victims 的空扫）。
    await evictForCapacity(store, key);
  } catch {
    // 隐私模式 / 配额 / 序列化异常：静默降级（增强能力退回全量回放）。
  }
}

/**
 * 清档并立墓碑：写一条 removed 标记（loadReplayCache 的既有校验天然拒收——墓碑无
 * cursorUuid/raw）。墓碑让删除语义对 save 单向生效：「清完 → 面板卸载 cleanup flush
 * 重写」的迟到写者被 putUnlessTombstone 的 tx 内检查挡住。随 LRU 淘汰后自然重试。
 */
export async function clearReplayCache(key: string): Promise<void> {
  try {
    await getStore()?.tombstone(key);
  } catch {
    // ignore
  }
}

/**
 * 项目级清扫：删除/重命名项目后调用——旧前缀的 key 永远不会再被命中（load 按当前
 * 项目名构造 key），残留纯属占用。**硬删而非墓碑**（code-review P1）：旧前缀上墓碑
 * 挡迟到 flush 的收益为零（复活的 entry 落在旧前缀 = 不可读垃圾，LRU 兜底足够），
 * 而墓碑的代价是 rename A→B→A 陷阱——A 的全部 key 带墓碑后 putUnlessTombstone 恒
 * false，该项目缓存静默失效直到 LRU 把墓碑挤掉（数天量级）。硬删下所有交错都语义
 * 有效：迟到 flush 复活的 entry 要么不可读（旧前缀），要么改回后重新可读且内容仍是
 * 该会话的真实历史窗口（恢复后 delta 补齐）。跨设备清不掉（存储是 per-device），
 * 那部分由全局 cap + savedAt LRU 兜底。
 */
export async function clearProjectReplayCache(projectName: string): Promise<void> {
  try {
    const store = getStore();
    if (!store) return;
    const prefix = `${REPLAY_CACHE_PREFIX}${encodeURIComponent(projectName)}/`;
    await store.deleteMany(await store.listKeys(prefix));
  } catch {
    // ignore
  }
}

/** 截头保尾：只行数 cap（字符截断已废除——落盘不截断，见 REPLAY_WINDOW_MAX_CHARS）。 */
function capByLines(raw: string[]): string[] {
  return raw.length > REPLAY_CACHE_MAX_LINES ? raw.slice(-REPLAY_CACHE_MAX_LINES) : raw;
}

/**
 * 逆序找窗口内最后一条带顶层 uuid 的行（恢复端 processBatch 的同款推导依据）。
 * parse 而非 `includes('"uuid":"…"')`：tool_result 等大行内嵌的同形文本会误命中。
 */
function deriveAnchor(lines: string[]): string | null {
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const uuid = (JSON.parse(lines[i]!) as { uuid?: unknown }).uuid;
      if (typeof uuid === "string" && uuid.length > 0) return uuid;
    } catch {
      // skip malformed cached line
    }
  }
  return null;
}

/** 全局配额：meta 小记录汇总，超限按 savedAt 最旧优先淘汰他人（不含 selfKey）。 */
async function evictForCapacity(store: ReplayCacheStore, selfKey: string): Promise<void> {
  const rows = await store.listMeta();
  let total = 0;
  for (const row of rows) total += row.chars;
  if (total <= REPLAY_CACHE_MAX_TOTAL_CHARS) return;
  const victims = rows.filter((row) => row.key !== selfKey).sort((a, b) => a.savedAt - b.savedAt);
  const doomed: string[] = [];
  for (const row of victims) {
    doomed.push(row.key);
    total -= row.chars;
    if (total <= REPLAY_CACHE_MAX_TOTAL_CHARS) break;
  }
  if (doomed.length > 0) await store.deleteMany(doomed);
}
