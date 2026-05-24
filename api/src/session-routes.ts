import type {
  CloseAgentSessionResponse,
  CloseTerminalSessionResponse,
  CreateAgentSessionRequest,
  CreateAgentSessionResponse,
  CreateTerminalSessionRequest,
  CreateTerminalSessionResponse,
  ListAgentSessionsResponse,
  ListTerminalSessionsResponse,
  AgentSessionDetailResponse,
  TerminalSessionDetailResponse,
} from "@agents-remote/shared";
import { ProjectPathError, resolveProjectPath } from "./project-paths";
import { jsonError } from "./http-auth";
import { SessionRegistry, SessionRegistryError } from "./session-registry";

type SessionResource = "agent-sessions" | "terminal-sessions";

export const handleSessionRoutes = async (
  request: Request,
  url: URL,
  projectsRoot: string,
  registry: SessionRegistry,
) => {
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
    const response: ListAgentSessionsResponse = {
      sessions: await registry.listAgentSessions(project.name),
    };
    return Response.json(response);
  }

  if (!sessionId && request.method === "POST") {
    const body = await readJson<CreateAgentSessionRequest>(request);

    if (body.provider !== "claude" && body.provider !== "codex") {
      return jsonError("SESSION_PROVIDER_UNAVAILABLE", "Agent provider is required", 400);
    }

    try {
      const response: CreateAgentSessionResponse = {
        session: await registry.createAgentSession({
          project,
          provider: body.provider,
          displayName: normalizeDisplayName(body.displayName),
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

  if (sessionId && request.method === "GET") {
    const session = await registry.getAgentSession(project.name, sessionId);

    if (!session) {
      return jsonError("SESSION_NOT_FOUND", "Agent session not found", 404);
    }

    const response: AgentSessionDetailResponse = { session };
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

const projectPathErrorResponse = (error: ProjectPathError) => {
  if (error.code === "PROJECT_NOT_FOUND") {
    return jsonError(error.code, error.message, 404);
  }

  if (error.code === "PROJECT_FS_ERROR") {
    return jsonError(error.code, error.message, 500);
  }

  return jsonError(error.code, error.message, 400);
};
