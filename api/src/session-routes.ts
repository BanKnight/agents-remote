import { open as openFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
  AgentSessionMessagesResponse,
  CloseAgentSessionResponse,
  CloseTerminalSessionResponse,
  CreateAgentSessionRequest,
  CreateAgentSessionResponse,
  CreateTerminalSessionRequest,
  CreateTerminalSessionResponse,
  ListAgentSessionsResponse,
  ListAgentHistoryResponse,
  ListTerminalSessionsResponse,
  AgentSessionDetailResponse,
  TerminalSessionDetailResponse,
} from "@agents-remote/shared";
import type { SessionStreamServerMessage } from "@agents-remote/shared";
import { listAgentHistory, getLastAssistantMessage } from "./agent-history";
import { ProjectPathError, resolveProjectPath } from "./project-paths";
import { jsonError } from "./http-auth";
import { SessionRegistry, SessionRegistryError } from "./session-registry";
import { getAgentProviderProfile, parseClaudePermissionModes } from "./agent-provider-profiles";

type SessionResource = "agent-sessions" | "terminal-sessions";

export const handleSessionRoutes = async (
  request: Request,
  url: URL,
  projectsRoot: string,
  registry: SessionRegistry,
) => {
  const historyMatch = matchAgentHistoryRoute(url.pathname);
  if (historyMatch && request.method === "GET") {
    try {
      const project = await resolveProjectPath(projectsRoot, historyMatch.projectName);
      const activeMap = await registry.getActiveClaudeSessionMap(project.name);
      const entries = await listAgentHistory(project.path, activeMap);
      const response: ListAgentHistoryResponse = { entries };
      return Response.json(response);
    } catch (error) {
      if (error instanceof ProjectPathError) {
        return projectPathErrorResponse(error);
      }
      throw error;
    }
  }

  const match = matchSessionRoute(url.pathname);

  if (!match) {
    return undefined;
  }

  try {
    const project = await resolveProjectPath(projectsRoot, match.projectName);

    if (match.resource === "agent-sessions") {
      return handleAgentSessionRoute(request, registry, project, match.sessionId);
    }

    return handleTerminalSessionRoute(request, registry, project, match.sessionId);
  } catch (error) {
    if (error instanceof ProjectPathError) {
      return projectPathErrorResponse(error);
    }

    throw error;
  }
};

const handleAgentSessionRoute = async (
  request: Request,
  registry: SessionRegistry,
  project: { name: string; path: string },
  sessionId: string | undefined,
) => {
  if (!sessionId && request.method === "GET") {
    const sessions = await registry.listAgentSessions(project.name);
    await Promise.all(
      sessions.map(async (s) => {
        if (s.claudeSessionId) {
          s.lastAssistantMessage =
            (await getLastAssistantMessage(project.path, s.claudeSessionId)) ?? undefined;
        }
      }),
    );
    const response: ListAgentSessionsResponse = { sessions };
    return Response.json(response);
  }

  if (!sessionId && request.method === "POST") {
    const body = await readJson<CreateAgentSessionRequest>(request);

    if (body.provider !== "claude" && body.provider !== "codex" && body.provider !== "claude2") {
      return jsonError("SESSION_PROVIDER_UNAVAILABLE", "Agent provider is required", 400);
    }

    const profile = getAgentProviderProfile(body.provider);
    const model = body.model ?? profile?.availableModels?.[0];
    if (model && profile?.availableModels && !profile.availableModels.includes(model)) {
      return jsonError("SESSION_PROVIDER_UNAVAILABLE", `Unsupported model: ${model}`, 400);
    }

    let permissionMode = body.permissionMode ?? "auto";
    if (body.provider === "claude2") {
      const modes: readonly string[] = profile?.permissionModes ?? [
        "default",
        "acceptEdits",
        "bypassPermissions",
        "plan",
        "auto",
        "dontAsk",
      ];
      if (!modes.includes(permissionMode)) {
        return jsonError(
          "SESSION_PROVIDER_UNAVAILABLE",
          `Unsupported permission mode: ${permissionMode}`,
          400,
        );
      }
    }

    try {
      const response: CreateAgentSessionResponse = {
        session: await registry.createAgentSession({
          project,
          provider: body.provider,
          displayName: normalizeDisplayName(body.displayName),
          claudeSessionId: body.claudeSessionId,
          model,
          permissionMode,
        }),
      };
      return Response.json(response);
    } catch (error) {
      if (error instanceof SessionRegistryError) {
        return jsonError(
          error.code,
          error.message,
          error.code === "SESSION_PROVIDER_UNAVAILABLE" ? 400 : 500,
        );
      }

      throw error;
    }
  }

  // /messages must be checked before the generic GET to avoid being captured
  // by the session-detail handler below.
  if (sessionId && request.method === "GET" && requestUrlEndsWith(request, "/messages")) {
    const metadata = await registry.getAgentMetadata(project.name, sessionId);

    if (!metadata) {
      return jsonError("SESSION_NOT_FOUND", "Agent session not found", 404);
    }

    if (metadata.provider !== "claude2") {
      return jsonError("SESSION_STREAM_MISMATCH", "Not a Claude2 session", 400);
    }

    const url = new URL(request.url);
    const limit = Math.min(
      parseInt(url.searchParams.get("limit") ?? String(MESSAGE_LIMIT), 10) || MESSAGE_LIMIT,
      1000,
    );
    const cursor = url.searchParams.get("cursor") ?? undefined;

    const { messages, hasOlder, nextCursor } = await loadClaude2Messages(
      metadata.projectPath,
      metadata.claudeSessionId,
      { limit, cursor },
    );
    const response: AgentSessionMessagesResponse = {
      sessionId: metadata.id,
      messages,
      pagination: { hasOlder, nextCursor },
    };
    return Response.json(response);
  }

  if (sessionId && request.method === "GET") {
    const session = await registry.getAgentSession(project.name, sessionId);

    if (!session) {
      return jsonError("SESSION_NOT_FOUND", "Agent session not found", 404);
    }

    const profile = getAgentProviderProfile(session.provider);
    const permissionModes =
      session.provider === "claude2" ? await parseClaudePermissionModes() : undefined;

    const response: AgentSessionDetailResponse = {
      session,
      availableModels: profile?.availableModels,
      availablePermissionModes: permissionModes,
    };
    return Response.json(response);
  }

  if (sessionId && request.method === "POST" && requestUrlEndsWith(request, "/close")) {
    const session = await registry.closeAgentSession(project.name, sessionId);

    if (!session) {
      return jsonError("SESSION_NOT_FOUND", "Agent session not found", 404);
    }

    const response: CloseAgentSessionResponse = { session };
    return Response.json(response);
  }

  return undefined;
};

const handleTerminalSessionRoute = async (
  request: Request,
  registry: SessionRegistry,
  project: { name: string; path: string },
  sessionId: string | undefined,
) => {
  if (!sessionId && request.method === "GET") {
    const response: ListTerminalSessionsResponse = {
      sessions: await registry.listTerminalSessions(project.name),
    };
    return Response.json(response);
  }

  if (!sessionId && request.method === "POST") {
    const body = await readJson<CreateTerminalSessionRequest>(request);
    const response: CreateTerminalSessionResponse = {
      session: await registry.createTerminalSession({
        project,
        displayName: normalizeDisplayName(body.displayName),
      }),
    };
    return Response.json(response);
  }

  if (sessionId && request.method === "GET") {
    const session = await registry.getTerminalSession(project.name, sessionId);

    if (!session) {
      return jsonError("SESSION_NOT_FOUND", "Terminal session not found", 404);
    }

    const response: TerminalSessionDetailResponse = { session };
    return Response.json(response);
  }

  if (sessionId && request.method === "POST" && requestUrlEndsWith(request, "/close")) {
    const session = await registry.closeTerminalSession(project.name, sessionId);

    if (!session) {
      return jsonError("SESSION_NOT_FOUND", "Terminal session not found", 404);
    }

    const response: CloseTerminalSessionResponse = { session };
    return Response.json(response);
  }

  return undefined;
};

const matchAgentHistoryRoute = (pathname: string) => {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length !== 4) return undefined;
  if (segments[0] !== "api" || segments[1] !== "projects" || segments[3] !== "agent-history") {
    return undefined;
  }
  const projectName = decodePathSegment(segments[2]);
  return projectName ? { projectName } : undefined;
};

const matchSessionRoute = (pathname: string) => {
  const segments = pathname.split("/").filter(Boolean);

  if (segments[0] !== "api" || segments[1] !== "projects") {
    return undefined;
  }

  const projectName = decodePathSegment(segments[2]);
  const resource = segments[3] as SessionResource | undefined;

  if (!projectName || (resource !== "agent-sessions" && resource !== "terminal-sessions")) {
    return undefined;
  }

  if (segments.length === 4) {
    return { projectName, resource, sessionId: undefined };
  }

  if (segments.length === 5) {
    const sessionId = decodePathSegment(segments[4]);
    return sessionId ? { projectName, resource, sessionId } : undefined;
  }

  if (segments.length === 6 && segments[5] === "close") {
    const sessionId = decodePathSegment(segments[4]);
    return sessionId ? { projectName, resource, sessionId } : undefined;
  }

  if (segments.length === 6 && segments[5] === "messages") {
    const sessionId = decodePathSegment(segments[4]);
    return sessionId ? { projectName, resource, sessionId } : undefined;
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

const decodePathSegment = (value: string | undefined) => {
  if (!value) {
    return undefined;
  }

  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
};

const normalizeDisplayName = (displayName: string | undefined) => {
  const normalized = displayName?.trim();
  return normalized && normalized.length > 0 ? normalized : undefined;
};

const requestUrlEndsWith = (request: Request, suffix: string) =>
  new URL(request.url).pathname.endsWith(suffix);

export const isChatMessage = (msg: Record<string, unknown>): boolean => {
  const type = msg.type as string | undefined;
  if (!type) return false;
  if (msg.isMeta === true) return false;
  return type === "user" || type === "assistant" || type === "result" || type === "system";
};

// ── Message classification framework ──────────────────────────────────
//
// Messages fall into two categories:
//
//   1. 瞬时事件 (instant events) — arrive at final state. Live broadcast
//      and replay buffer are processed IDENTICALLY. Examples: user, result,
//      system.init, system.compact_boundary, system.api_retry.
//
//   2. 持续流 (streaming messages) — have an in-progress → complete
//      lifecycle. Live broadcast streams deltas; replay must collapse to
//      final state. Only two: assistant and thinking_tokens.
//
// Every new message type must be classified into one of these two
// categories. If you add a type without classifying it, you're adding
// an implicit "hope it works" path.

/** 瞬时事件：到达即终态。live broadcast 和 replay buffer 处理一致。 */
export const isInstantEvent = (msg: Record<string, unknown>): boolean => {
  if (!isChatMessage(msg)) return false;
  if (msg.type === "assistant") return false;
  if (msg.type === "system" && (msg.subtype as string) === "thinking_tokens") return false;
  return true;
};

/** 持续流：有进行中→完成生命周期。live 逐条推送，replay 折叠为最终态。 */
export const isStreamingMessage = (msg: Record<string, unknown>): boolean => {
  if (!isChatMessage(msg)) return false;
  if (msg.type === "assistant") return true;
  if (msg.type === "system" && (msg.subtype as string) === "thinking_tokens") return true;
  return false;
};

export const isThinkingTokens = (msg: Record<string, unknown>): boolean =>
  msg.type === "system" && (msg.subtype as string) === "thinking_tokens";

// Count only visible messages (user/assistant) toward the pagination limit.
// result and system.init are included in the output for grouping fidelity
// but do not consume a slot in the limit.
const isVisibleMessage = (msg: Record<string, unknown>): boolean => {
  const type = msg.type as string | undefined;
  return type === "user" || type === "assistant";
};

export const claudeJsonlPath = (projectPath: string, claudeSessionId: string): string => {
  const projectDir = projectPath.replace(/\//g, "-");
  return join(homedir(), ".claude", "projects", projectDir, `${claudeSessionId}.jsonl`);
};

type MessagePaginationParams = {
  limit: number;
  cursor?: string;
};

const decodeCursor = (cursor: string): number | null => {
  try {
    return parseInt(Buffer.from(cursor, "base64").toString("utf-8"), 10);
  } catch {
    return null;
  }
};

const encodeCursor = (lineIndex: number): string =>
  Buffer.from(lineIndex.toString(), "utf-8").toString("base64");

const MESSAGE_LIMIT = Math.max(parseInt(process.env.CLAUDE2_MESSAGE_LIMIT ?? "200", 10) || 200, 1);

const loadClaude2Messages = async (
  projectPath: string,
  claudeSessionId: string | undefined,
  params: MessagePaginationParams = { limit: 200 },
): Promise<{
  messages: SessionStreamServerMessage[];
  hasOlder: boolean;
  nextCursor: string | null;
}> => {
  if (!claudeSessionId) return { messages: [], hasOlder: false, nextCursor: null };

  const filePath = claudeJsonlPath(projectPath, claudeSessionId);

  try {
    const handle = await openFile(filePath, "r");
    try {
      // targetLine: 0-indexed line number to read up to (exclusive).
      // No cursor → read entire file; cursor → read up to that line.
      const targetLine = params.cursor ? decodeCursor(params.cursor) : Infinity;
      if (params.cursor && targetLine === null) {
        return { messages: [], hasOlder: false, nextCursor: null };
      }

      const messages: { lineIndex: number; msg: Record<string, unknown>; visible: boolean }[] = [];
      let lineIndex = 0;

      for await (const line of handle.readLines()) {
        if (lineIndex >= targetLine!) break;
        try {
          const msg = JSON.parse(line) as Record<string, unknown>;
          if (isChatMessage(msg)) {
            messages.push({
              lineIndex,
              msg,
              visible: isVisibleMessage(msg),
            });
          }
        } catch {
          // skip malformed
        }
        lineIndex++;
      }

      const visibleCount = messages.filter((m) => m.visible).length;

      // Return all if visible messages fit within the limit
      if (visibleCount <= params.limit) {
        console.log(
          `[messages] session=${claudeSessionId} cursor=${params.cursor ?? "none"} total=${messages.length} visible=${visibleCount} returned=${messages.length} hasOlder=false`,
        );
        return {
          messages: messages.map((m) => m.msg as unknown as SessionStreamServerMessage),
          hasOlder: false,
          nextCursor: null,
        };
      }

      // Find the slice window containing the last `limit` visible messages.
      // Include all non-visible messages (result/system.init) within the window.
      let visibleSeen = 0;
      let sliceStart = messages.length;
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i]!.visible) {
          visibleSeen++;
          if (visibleSeen === params.limit) {
            sliceStart = i;
            break;
          }
        }
      }

      const sliced = messages.slice(sliceStart);
      const firstLineIndex = sliced[0]!.lineIndex;
      const hasOlder = messages[0]!.lineIndex < firstLineIndex;
      console.log(
        `[messages] session=${claudeSessionId} cursor=${params.cursor ?? "none"} total=${messages.length} returned=${sliced.length} hasOlder=${hasOlder} cursorLine=${firstLineIndex}`,
      );

      return {
        messages: sliced.map((m) => m.msg as unknown as SessionStreamServerMessage),
        hasOlder,
        nextCursor: encodeCursor(firstLineIndex),
      };
    } finally {
      await handle.close();
    }
  } catch {
    return { messages: [], hasOlder: false, nextCursor: null };
  }
};

const projectPathErrorResponse = (error: ProjectPathError) => {
  if (error.code === "PROJECT_NOT_FOUND") {
    return jsonError(error.code, error.message, 404);
  }

  if (error.code === "PROJECT_FS_ERROR") {
    return jsonError(error.code, error.message, 500);
  }

  return jsonError(error.code, error.message, 400);
};
