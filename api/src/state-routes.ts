import { type PinnedSessionsResponse } from "@agents-remote/shared";
import { jsonError } from "./http-auth";
import type { StateStore } from "./state-store";

// 业务状态路由：/api/state/<module>/* 统一读写 state.yaml 的模块（见 shared AppModules）。
// 当前只有 overview 模块（全局总览置顶会话 pin）。所有 /api/state/* 经 index.ts 的
// requireHttpAuth 统一守卫。不校验 session 是否存活——pin 任意 sessionId，前端渲染时与
// candidates 取交集（不匹配即不渲染），与 localStorage 时代行为一致。
export const handleStateRoutes = async (
  request: Request,
  url: URL,
  store: StateStore,
): Promise<Response | undefined> => {
  if (url.pathname === "/api/state/overview/pinned-sessions" && request.method === "GET") {
    const overview = await store.readModule("overview");
    return Response.json({
      sessions: overview.pinnedSessions,
    } satisfies PinnedSessionsResponse);
  }

  // POST/DELETE /api/state/overview/pinned-sessions/:sessionId —— 单条增/删。
  // :sessionId 段至少 1 字符（regex 保证），decodeURIComponent 解码 runtime key。
  const itemMatch = url.pathname.match(/^\/api\/state\/overview\/pinned-sessions\/([^/]+)$/);

  if (itemMatch && request.method === "POST") {
    const sessionId = decodeSessionId(itemMatch[1]);
    if (sessionId === undefined) {
      return jsonError("SETTINGS_INVALID", "Invalid session id", 400);
    }
    const overview = await store.updateModule("overview", (cur) => ({
      ...cur,
      pinnedSessions: addPinned(cur, sessionId),
    }));
    return Response.json({ sessions: overview.pinnedSessions } satisfies PinnedSessionsResponse);
  }

  if (itemMatch && request.method === "DELETE") {
    const sessionId = decodeSessionId(itemMatch[1]);
    if (sessionId === undefined) {
      return jsonError("SETTINGS_INVALID", "Invalid session id", 400);
    }
    const overview = await store.updateModule("overview", (cur) => ({
      ...cur,
      pinnedSessions: removePinned(cur, sessionId),
    }));
    return Response.json({ sessions: overview.pinnedSessions } satisfies PinnedSessionsResponse);
  }

  return undefined;
};

// decodeURIComponent 包 try：malformed % 序列抛 URIError → undefined → 400（防 500）。
const decodeSessionId = (raw: string): string | undefined => {
  try {
    return decodeURIComponent(raw);
  } catch {
    return undefined;
  }
};

// read-modify-write 助手：只改 overview.pinnedSessions，保留模块其余字段不动。
const addPinned = (overview: { pinnedSessions: string[] }, sessionId: string): string[] => {
  const current = overview.pinnedSessions;
  return current.includes(sessionId) ? current : [...current, sessionId];
};

const removePinned = (overview: { pinnedSessions: string[] }, sessionId: string): string[] =>
  overview.pinnedSessions.filter((id) => id !== sessionId);
