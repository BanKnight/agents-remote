// Claude 会话回放缓存（2026-10-26）：跨 remount 的增量回放恢复——d565ba4 的重连增量
// 回放锚（claude-adapter cursorRef）活在组件内存里，切走会话再切回 / PWA 被回收重载 /
// 刷新后锚随 rawMessages 一起丢失，只能全量回放（用户观察：「每次重连都从旧的地方加载
// 到最新」）。本层把「窗口尾锚 + 其原始 JSON 行窗口 + resume 语义」持久化到
// localStorage，remount 时恢复窗口即刻呈现 + WS 带 since 锚，服务端 delta 只补离开
// 期间的增量。
//
// 照 composer-draft.ts 惯例：localStorage 直读直写 + try/catch 静默降级——缓存是增强
// 能力，任何失败（配额满 / 隐私模式 / 序列化异常）都退回现有全量回放路径，绝不影响
// 主流程。raw 以 JSONL 单串存储（join("\n")）：外层 JSON.parse 只需 token 化一次，
// 避免「数组 of 字符串」在 load 时二次反转义。
//
// 容量治理：单 entry 双 cap（行数 + 字符数，超限截头保尾）；全局字符 cap + savedAt
// LRU 淘汰；QuotaExceededError 淘汰最旧后重试一次，仍失败静默放弃。空窗口 / 窗口内
// 无可推导锚 → removeItem（对齐 composer-draft 空串清档），不生成垃圾 entry。
// 生命周期：项目/会话删除时显式清扫（clearProjectReplayCache / clearReplayCache，
// 消费点见 useProjectRowActions / useCloseSession）；跨设备残留由全局 cap + LRU 兜底。
//
// 字符 cap 用 string.length 而非 TextEncoder 字节数：localStorage 配额按 UTF-16 code
// units 计，length 是同量纲（1 个 code unit = 2 字节），且免去每次 flush 全窗口 encode。

const REPLAY_CACHE_PREFIX = "claudeReplayCache:";

/** 单 entry 行数上限：截头保尾（窗口语义 = 最近历史，锚在尾部天然保留）。 */
export const REPLAY_CACHE_MAX_LINES = 600;
/** 单 entry 字符上限：tool_result 大行防单 entry 独占全局配额。 */
export const REPLAY_CACHE_MAX_ENTRY_CHARS = 1_500_000;
/**
 * 全局字符上限：按 UTF-16 code units 口径估算——浏览器 localStorage 配额约 5M
 * code units/origin（Chrome/Safari），留一半给其它键（workbench 大量
 * atomWithLocalOnlyStorage）。超限按 savedAt LRU 淘汰最旧会话。
 */
export const REPLAY_CACHE_MAX_TOTAL_CHARS = 2_500_000;

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

/** 落盘形态：raw 为 JSONL 单串（外层 parse 只 token 化一次）。 */
type StoredEntry = Omit<ReplayCacheEntry, "raw"> & { raw: string };

export function replayCacheKey(projectName: string, sessionId: string): string {
  // 项目名可含 `/`（目录型项目），与 claudeStreamUrl 同款编码防 key 歧义。
  return `${REPLAY_CACHE_PREFIX}${encodeURIComponent(projectName)}/${encodeURIComponent(sessionId)}`;
}

/** 读取并校验：v / cursorUuid / raw 任一不满足按 miss（缓存损坏不传播，走全量回退）。 */
export function loadReplayCache(key: string): ReplayCacheEntry | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return null;
    const entry = JSON.parse(stored) as StoredEntry;
    if (entry.v !== 1 || !entry.cursorUuid || typeof entry.raw !== "string") return null;
    const raw = entry.raw.length > 0 ? entry.raw.split("\n") : [];
    if (raw.length === 0) return null;
    return { ...entry, raw };
  } catch {
    return null;
  }
}

export function saveReplayCache(key: string, resume: boolean, raw: string[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    // 墓碑：会话/项目删除后（clearReplayCache），卸载 cleanup 等迟到的 flush 不得复活
    // 缓存——写者只有本层，墓碑是删除语义对 save 的单向闸。墓碑随 LRU 淘汰后自然重试。
    const existing = localStorage.getItem(key);
    if (existing) {
      try {
        if ((JSON.parse(existing) as { removed?: unknown }).removed === true) return;
      } catch {
        // 损坏 entry：允许覆盖。
      }
    }
    const lines = trimLines(raw);
    // 锚由窗口自身推导（单一真相）：调用方持有的「最后一条已处理 uuid」可能落后于
    // 采集窗口（history 批次先采集、history_end 才 processBatch），也可能被截头丢出
    // ——锚与窗口一旦分叉，恢复端从行内推导的锚就与 entry 不一致。逆序推导与恢复端
    // processBatch 的行内推导同源，且锚必然存活于窗口。
    const cursorUuid = deriveAnchor(lines);
    if (!cursorUuid) {
      localStorage.removeItem(key);
      return;
    }
    // ⚠️ 属性顺序是 readSavedAt 的契约：savedAt 须落在序列化串头部 64 字节内。
    const entry: StoredEntry = {
      savedAt: Date.now(),
      v: 1,
      cursorUuid,
      resume,
      raw: lines.join("\n"),
    };
    const stored = JSON.stringify(entry);
    evictForCapacity(key, stored.length);
    try {
      localStorage.setItem(key, stored);
    } catch {
      // 配额满：淘汰后重试一次；仍失败静默放弃（增强能力降级为全量回放）。
      evictForCapacity(key, stored.length);
      localStorage.setItem(key, stored);
    }
  } catch {
    // 隐私模式 / 序列化异常：静默降级。
  }
}

/**
 * 清档并立墓碑：写一条 removed 标记 entry（loadReplayCache 的既有校验天然拒收——墓碑
 * 无 cursorUuid/raw）。直接 removeItem 挡不住「清完 → 面板卸载 cleanup flush 重写」的
 * 竞态（flush 是迟到的最后写者），墓碑让删除语义对 save 单向生效。
 */
export function clearReplayCache(key: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      key,
      JSON.stringify({ savedAt: Date.now(), v: 1, removed: true } satisfies
        | StoredEntry
        | { removed: true }),
    );
  } catch {
    // ignore
  }
}

/**
 * 项目级清扫：删除/重命名项目后调用——旧前缀的 key 永远不会再被命中（loadReplayCache
 * 按新 project 名构造 key），残留纯属占用。每个 key 立墓碑（同 clearReplayCache）。
 * 跨设备清不掉（localStorage 是 per-device），那部分由全局 cap + savedAt LRU 兜底
 * （总占用硬上界 REPLAY_CACHE_MAX_TOTAL_CHARS）。
 */
export function clearProjectReplayCache(projectName: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    const prefix = `${REPLAY_CACHE_PREFIX}${encodeURIComponent(projectName)}/`;
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) keys.push(k);
    }
    for (const k of keys) clearReplayCache(k);
  } catch {
    // ignore
  }
}

/** 截头保尾：先行数 cap，再按字符上限从头部丢行（至少保留一行）。 */
function trimLines(raw: string[]): string[] {
  const capByLines = raw.length > REPLAY_CACHE_MAX_LINES ? raw.slice(-REPLAY_CACHE_MAX_LINES) : raw;
  let total = capByLines.reduce((sum, line) => sum + line.length + 1, 0);
  let start = 0;
  while (total > REPLAY_CACHE_MAX_ENTRY_CHARS && start < capByLines.length - 1) {
    total -= capByLines[start]!.length + 1;
    start += 1;
  }
  return start === 0 ? capByLines : capByLines.slice(start);
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

/** 全局配额：写前淘汰其他 entry（savedAt 最旧优先，坏 entry 直接删）到放得下为止。 */
function evictForCapacity(selfKey: string, selfChars: number): void {
  const rows: Array<{ key: string; savedAt: number; chars: number }> = [];
  let total = selfChars;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith(REPLAY_CACHE_PREFIX) || k === selfKey) continue;
    const value = localStorage.getItem(k);
    if (!value) continue;
    total += value.length;
    rows.push({ key: k, savedAt: readSavedAt(value), chars: value.length });
  }
  if (total <= REPLAY_CACHE_MAX_TOTAL_CHARS) return;
  rows.sort((a, b) => a.savedAt - b.savedAt);
  for (const row of rows) {
    localStorage.removeItem(row.key);
    total -= row.chars;
    if (total <= REPLAY_CACHE_MAX_TOTAL_CHARS) return;
  }
}

/**
 * 从 entry 字符串头部读 savedAt——不 JSON.parse 整个 entry（其 raw 可达 MB 级，
 * 淘汰扫描 parse 每个 entry 会把一次 flush 拖到数十 ms）。读不到 = 坏 entry = 最旧。
 */
function readSavedAt(value: string): number {
  const match = /"savedAt":(\d+)/.exec(value.slice(0, 64));
  return match ? Number(match[1]) : 0;
}
