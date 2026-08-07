import { type PinnedSessionsResponse, type SettingsState } from "@agents-remote/shared";
import { jsonError } from "./http-auth";
import type { SettingsStore } from "./settings-store";

// 全局总览置顶会话（pin）持久化：存 SettingsState.ui.pinnedSessions（providers.json），
// 跨设备共享（迁自前端 localStorage）。所有 /api/preferences/* 经 index.ts 的 requireHttpAuth
// 统一守卫。不校验 session 是否存活——pin 任意 sessionId，前端渲染时与 candidates 取交集
//（不匹配即不渲染），与 localStorage 时代行为一致。
export const handlePreferencesRoutes = async (
  request: Request,
  url: URL,
  store: SettingsStore,
): Promise<Response | undefined> => {
  if (url.pathname === "/api/preferences/pinned-sessions" && request.method === "GET") {
    const state = await store.read();
    return Response.json({
      sessions: state.ui?.pinnedSessions ?? [],
    } satisfies PinnedSessionsResponse);
  }

  // POST/DELETE /api/preferences/pinned-sessions/:sessionId —— 单条增/删。
  // :sessionId 段至少 1 字符（regex 保证），decodeURIComponent 解码 runtime key。
  const itemMatch = url.pathname.match(/^\/api\/preferences\/pinned-sessions\/([^/]+)$/);

  if (itemMatch && request.method === "POST") {
    const sessionId = decodeSessionId(itemMatch[1]);
    if (sessionId === undefined) {
      return jsonError("SETTINGS_INVALID", "Invalid session id", 400);
    }
    const updated = await store.update((s) => ({
      ...s,
      ui: { pinnedSessions: addPinned(s, sessionId) },
    }));
    return Response.json({
      sessions: updated.ui?.pinnedSessions ?? [],
    } satisfies PinnedSessionsResponse);
  }

  if (itemMatch && request.method === "DELETE") {
    const sessionId = decodeSessionId(itemMatch[1]);
    if (sessionId === undefined) {
      return jsonError("SETTINGS_INVALID", "Invalid session id", 400);
    }
    const updated = await store.update((s) => ({
      ...s,
      ui: { pinnedSessions: removePinned(s, sessionId) },
    }));
    return Response.json({
      sessions: updated.ui?.pinnedSessions ?? [],
    } satisfies PinnedSessionsResponse);
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

// read-modify-write 助手：只改 ui.pinnedSessions，保留 SettingsState 其余字段不动。
const addPinned = (s: SettingsState, sessionId: string): string[] => {
  const current = s.ui?.pinnedSessions ?? [];
  return current.includes(sessionId) ? current : [...current, sessionId];
};

const removePinned = (s: SettingsState, sessionId: string): string[] =>
  (s.ui?.pinnedSessions ?? []).filter((id) => id !== sessionId);
