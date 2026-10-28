/**
 * 详情 placeholder 的 localStorage 兜底（真机反馈 2026-10-28 二轮：PWA 冷启动恢复 URL
 * 直接落会话页时列表缓存为空 → 骨架必闪）。本模块是 key 与清理面的单源——instance-area
 * 写/读，close/rename/delete 流程清（code review P3-1：只写不删 = localStorage 无界累积）。
 * shell 层（project-row-actions）经此 lib 清理，不反向依赖 workbench。
 */

function cachedAgentDetailKey(projectName: string, sessionId: string): string {
  return `agentDetail:${encodeURIComponent(projectName)}/${encodeURIComponent(sessionId)}`;
}

/** 会话关闭：清单键。读失败静默（清理非关键路径）。 */
export function removeCachedAgentDetail(projectName: string, sessionId: string): void {
  try {
    localStorage.removeItem(cachedAgentDetailKey(projectName, sessionId));
  } catch {
    // ignore
  }
}

/** 项目改名/删除：清项目前缀下全部键。 */
export function removeCachedAgentDetailsForProject(projectName: string): void {
  const prefix = `agentDetail:${encodeURIComponent(projectName)}/`;
  try {
    const stale: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix)) stale.push(key);
    }
    for (const key of stale) localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/** 读兜底（最小形状校验：旧值/残缺值不当 detail 投影）。 */
export function readCachedAgentDetail<T>(projectName: string, sessionId: string): T | undefined {
  try {
    const raw = localStorage.getItem(cachedAgentDetailKey(projectName, sessionId));
    const parsed = raw ? (JSON.parse(raw) as T) : undefined;
    const session = (parsed as { session?: { id?: unknown } } | undefined)?.session;
    return typeof session?.id === "string" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/** 详情请求成功即落本地（隐私模式/配额抛错静默：骨架兜底 = 无缓存同态）。 */
export function writeCachedAgentDetail(
  projectName: string,
  sessionId: string,
  detail: unknown,
): void {
  try {
    localStorage.setItem(cachedAgentDetailKey(projectName, sessionId), JSON.stringify(detail));
  } catch {
    // ignore
  }
}
