/**
 * 面板缩略预览缓存（Phase 5 split 缩略面板数据源，设计 §7.2「output 末 2 行预览」）。
 *
 * 两类实例数据源对称延伸（单一数据管道，不伪造数据）：
 * - **terminal**：SessionDetail onmessage（snapshot/output）写入。terminal 数据只在 WebSocket
 *   stream 里（无 HTTP snapshot API），且 `terminalDataRef` 是 SessionDetail 内部 useRef 无法
 *   跨组件读，故本 module 作 stream → cache → 预览 的延伸。
 * - **chat（claude2）**：`useClaude2Session` 内部 rawMessages 同步 effect 写入（取末 2 行
 *   assistant text）。rawMessagesRef 是 hook 内部 ref，AssistantRuntimeProvider 外的 SplitPanel
 *   header 无法读，故同样走 module cache。
 *
 * module-level 单例 Map（key = sessionId）+ subscribers Set，零 React context 开销。
 * PanelPreview hook 用 `useSyncExternalStore` 订阅。缓存只保留末 `PREVIEW_LINE_COUNT` 行
 *（ring buffer 语义，截断而非累积，避免长会话膨胀）。
 */

/** 每个面板预览保留的行数（设计 §7.2「output 末 2 行预览」）。 */
const PREVIEW_LINE_COUNT = 2;

type CacheEntry = { lines: string[] };

const cache = new Map<string, CacheEntry>();
const subscribers = new Map<string, Set<() => void>>();

/** 空数组单例（cache miss 时返回，稳定引用供 useSyncExternalStore 比较）。 */
const EMPTY_LINES: string[] = [];

function notify(sessionId: string) {
  const subs = subscribers.get(sessionId);
  if (!subs) return;
  for (const sub of subs) sub();
}

/**
 * 写入预览行（terminal snapshot 全量 / output 增量；chat 末 2 行 assistant text）。
 * `lines` 为本次新增的可读行（调用方负责取末几行），本函数合并并截断到 `PREVIEW_LINE_COUNT`。
 * 空数组跳过（避免空更新触发不必要的重渲染）。
 */
export function writePanelPreview(sessionId: string, lines: string[]) {
  if (lines.length === 0) return;
  const entry = cache.get(sessionId) ?? { lines: [] };
  const merged = [...entry.lines, ...lines].slice(-PREVIEW_LINE_COUNT);
  entry.lines = merged;
  cache.set(sessionId, entry);
  notify(sessionId);
}

/** 全量替换预览行（terminal snapshot 语义：整体重置而非追加）。空数组跳过。 */
export function setPanelPreview(sessionId: string, lines: string[]) {
  if (lines.length === 0) return;
  const trimmed = lines.slice(-PREVIEW_LINE_COUNT);
  cache.set(sessionId, { lines: trimmed });
  notify(sessionId);
}

/** 清理（session close 时调用，防泄漏）。 */
export function clearPanelPreview(sessionId: string) {
  cache.delete(sessionId);
  notify(sessionId);
}

/**
 * 订阅面板预览行（useSyncExternalStore 接口）。返回取消订阅函数。
 */
export function subscribePanelPreview(sessionId: string, onStoreChange: () => void) {
  let subs = subscribers.get(sessionId);
  if (!subs) {
    subs = new Set();
    subscribers.set(sessionId, subs);
  }
  subs.add(onStoreChange);
  return () => {
    const s = subscribers.get(sessionId);
    if (!s) return;
    s.delete(onStoreChange);
    if (s.size === 0) subscribers.delete(sessionId);
  };
}

/** 取当前预览行快照（useSyncExternalStore getSnapshot 用，须返回稳定引用）。 */
export function getPanelPreview(sessionId: string): string[] {
  return cache.get(sessionId)?.lines ?? EMPTY_LINES;
}
