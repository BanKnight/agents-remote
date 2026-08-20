import type {
  ChatSessionDetailResponse,
  CloseChatSessionResponse,
  CreateChatSessionRequest,
  CreateChatSessionResponse,
  ListChatSessionsResponse,
  RenameChatSessionRequest,
  RenameChatSessionResponse,
  UpdateChatSessionResponse,
} from "@agents-remote/shared";
import { jsonError } from "./http-auth";
import type { ChatSessionRegistry } from "./chat-session-registry";

/**
 * chat-sessions 路由处理（设计 docs/design/workbench-views.md §3.1）。
 *
 * 路由（flat，照搬 session-routes.ts 范式）：
 * - `GET    /api/chat-sessions`           → list
 * - `POST   /api/chat-sessions`           → create
 * - `GET    /api/chat-sessions/:id`       → detail
 * - `POST   /api/chat-sessions/:id/rename`→ rename
 * - `POST   /api/chat-sessions/:id/close` → close（Phase 1 删元数据；Phase 3+ 销毁 pi 运行时）
 * - `POST   /api/chat-sessions/:id/{pin,unpin,archive,unarchive}` → 管理 action（置顶/归档，
 *   批量由客户端逐条调用，无 batch 端点）
 *
 * 返回 `undefined` 表示不匹配，由 index.ts 继续向后 dispatch（同 handleSessionRoutes 契约）。
 */
export const handleChatSessionRoutes = async (
  request: Request,
  url: URL,
  registry: ChatSessionRegistry,
): Promise<Response | undefined> => {
  const match = matchChatSessionRoute(url.pathname);
  if (!match) return undefined;

  // collection
  if (!match.id) {
    if (request.method === "GET") {
      const response: ListChatSessionsResponse = { sessions: await registry.listChatSessions() };
      return Response.json(response);
    }
    if (request.method === "POST") {
      const body = await readJson<CreateChatSessionRequest>(request);
      const response: CreateChatSessionResponse = {
        session: await registry.createChatSession(body.displayName),
      };
      return Response.json(response);
    }
    return undefined;
  }

  // item
  if (request.method === "GET") {
    const session = await registry.getChatSession(match.id);
    if (!session) return jsonError("SESSION_NOT_FOUND", "Chat session not found", 404);
    const response: ChatSessionDetailResponse = { session };
    return Response.json(response);
  }

  if (request.method === "POST" && url.pathname.endsWith("/rename")) {
    const body = await readJson<RenameChatSessionRequest>(request);
    const displayName = body.displayName?.trim();
    if (!displayName || displayName.length === 0) {
      return jsonError("SESSION_METADATA_ERROR", "Display name must not be empty", 400);
    }
    const session = await registry.renameChatSession(match.id, displayName);
    if (!session) return jsonError("SESSION_NOT_FOUND", "Chat session not found", 404);
    const response: RenameChatSessionResponse = { session };
    return Response.json(response);
  }

  if (request.method === "POST" && url.pathname.endsWith("/close")) {
    const session = await registry.closeChatSession(match.id);
    if (!session) return jsonError("SESSION_NOT_FOUND", "Chat session not found", 404);
    const response: CloseChatSessionResponse = { session };
    return Response.json(response);
  }

  if (request.method === "POST") {
    // 管理 action（pin/unpin/archive/unarchive）——统一表驱动，批量由客户端逐条调用。
    const action = matchManagementAction(url.pathname);
    if (action) {
      let session;
      if (action === "pin") session = await registry.setPinned(match.id, true);
      else if (action === "unpin") session = await registry.setPinned(match.id, false);
      else if (action === "archive")
        session = await registry.setArchived(match.id, new Date().toISOString());
      else session = await registry.setArchived(match.id, null);
      if (!session) return jsonError("SESSION_NOT_FOUND", "Chat session not found", 404);
      const response: UpdateChatSessionResponse = { session };
      return Response.json(response);
    }
  }

  return undefined;
};

/** `/api/chat-sessions`（collection）或 `/api/chat-sessions/:id`（item，含 /rename、/close 后缀）。 */
const matchChatSessionRoute = (pathname: string): { id?: string } | undefined => {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length < 2 || segments[0] !== "api" || segments[1] !== "chat-sessions") {
    return undefined;
  }
  if (segments.length === 2) return {};
  if (segments.length === 3) {
    const id = decodePathSegment(segments[2]);
    return id ? { id } : undefined;
  }
  // /api/chat-sessions/:id/{rename,close,pin,unpin,archive,unarchive}
  if (
    segments.length === 4 &&
    (segments[3] === "rename" ||
      segments[3] === "close" ||
      segments[3] === "pin" ||
      segments[3] === "unpin" ||
      segments[3] === "archive" ||
      segments[3] === "unarchive")
  ) {
    const id = decodePathSegment(segments[2]);
    return id ? { id } : undefined;
  }
  return undefined;
};

type ChatManagementAction = "pin" | "unpin" | "archive" | "unarchive";

/** 匹配管理 action 后缀（白名单判定，非白名单返回 undefined 由外层继续 dispatch）。 */
const matchManagementAction = (pathname: string): ChatManagementAction | undefined => {
  const suffix = pathname.split("/").filter(Boolean).at(-1);
  if (suffix === "pin" || suffix === "unpin" || suffix === "archive" || suffix === "unarchive") {
    return suffix;
  }
  return undefined;
};

const readJson = async <T>(request: Request): Promise<T> => {
  try {
    return (await request.json()) as T;
  } catch {
    return {} as T;
  }
};

const decodePathSegment = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
};
