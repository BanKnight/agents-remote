import type {
  AgentSessionStatus,
  SessionStreamClientMessage,
  SessionStreamServerMessage,
  SessionType,
  TerminalSessionStatus,
} from "@agents-remote/shared";
import { ProjectPathError, resolveProjectPath } from "./project-paths";
import { jsonError } from "./http-auth";
import { SessionRegistry, type RuntimeResources, type SessionMetadata } from "./session-registry";

type UpgradeServer = {
  upgrade(request: Request, options?: { data?: SessionWebSocketData }): boolean;
};

export type SessionWebSocketData = {
  kind: "session-stream";
  sessionType: SessionType;
  projectName: string;
  sessionId: string;
  tmuxSessionName: string;
  status: AgentSessionStatus | TerminalSessionStatus;
};

type StreamSocket = {
  data?: unknown;
  send(message: string): void;
};

type StreamRouteMatch = {
  projectName: string;
  sessionType: SessionType;
  sessionId: string;
};

export const handleSessionStreamUpgrade = async (
  request: Request,
  url: URL,
  projectsRoot: string,
  registry: SessionRegistry,
  server: UpgradeServer,
): Promise<{ matched: boolean; response?: Response }> => {
  const match = matchSessionStreamRoute(url.pathname);

  if (!match) {
    return { matched: false };
  }

  try {
    const project = await resolveProjectPath(projectsRoot, match.projectName);
    const metadata = await getSessionMetadata(registry, project.name, match);

    if (!metadata) {
      return {
        matched: true,
        response: jsonError("SESSION_NOT_FOUND", "Session not found", 404),
      };
    }

    if (
      server.upgrade(request, {
        data: {
          kind: "session-stream",
          sessionType: match.sessionType,
          projectName: project.name,
          sessionId: metadata.id,
          tmuxSessionName: metadata.tmuxSessionName,
          status: metadata.status,
        },
      })
    ) {
      return { matched: true };
    }

    return { matched: true, response: new Response("WebSocket upgrade required", { status: 426 }) };
  } catch (error) {
    if (error instanceof ProjectPathError) {
      return { matched: true, response: projectPathErrorResponse(error) };
    }

    throw error;
  }
};

export class SessionStreamController {
  private readonly timers = new WeakMap<StreamSocket, ReturnType<typeof setInterval>>();
  private readonly lastSnapshots = new WeakMap<StreamSocket, string>();

  constructor(private readonly runtime: RuntimeResources) {}

  async open(socket: StreamSocket) {
    const data = sessionData(socket);

    if (!data) {
      return false;
    }

    send(socket, {
      type: "connected",
      sessionId: data.sessionId,
      sessionType: data.sessionType,
      status: data.status,
    });
    await this.sendSnapshot(socket, data);
    const timer = setInterval(() => {
      void this.poll(socket, data);
    }, 1000);
    this.timers.set(socket, timer);
    return true;
  }

  async message(socket: StreamSocket, message: string | Buffer) {
    const data = sessionData(socket);

    if (!data) {
      return false;
    }

    let parsed: SessionStreamClientMessage;

    try {
      parsed = JSON.parse(message.toString()) as SessionStreamClientMessage;
    } catch {
      send(socket, {
        type: "error",
        code: "SESSION_RUNTIME_ERROR",
        message: "Invalid stream message",
      });
      return true;
    }

    try {
      if (parsed.type === "input") {
        await this.runtime.write?.(data.tmuxSessionName, parsed.data);
        await this.poll(socket, data);
      }

      if (parsed.type === "resize") {
        await this.runtime.resize?.(data.tmuxSessionName, parsed.cols, parsed.rows);
      }

      if (parsed.type === "ping") {
        send(socket, { type: "status", status: "connected" });
      }
    } catch {
      send(socket, {
        type: "error",
        code: "SESSION_RUNTIME_ERROR",
        message: "Terminal stream failed",
      });
    }

    return true;
  }

  close(socket: StreamSocket) {
    const timer = this.timers.get(socket);

    if (timer) {
      clearInterval(timer);
      this.timers.delete(socket);
    }
  }

  private async sendSnapshot(socket: StreamSocket, data: NonNullable<SessionWebSocketData>) {
    if (!(await this.runtime.exists(data.tmuxSessionName))) {
      send(socket, { type: "ended" });
      return;
    }

    const snapshot = (await this.runtime.capture?.(data.tmuxSessionName)) ?? "";
    this.lastSnapshots.set(socket, snapshot);
    send(socket, { type: "snapshot", data: snapshot });
  }

  private async poll(socket: StreamSocket, data: NonNullable<SessionWebSocketData>) {
    try {
      if (!(await this.runtime.exists(data.tmuxSessionName))) {
        send(socket, { type: "ended" });
        this.close(socket);
        return;
      }

      const snapshot = (await this.runtime.capture?.(data.tmuxSessionName)) ?? "";
      const previous = this.lastSnapshots.get(socket);

      if (snapshot !== previous) {
        this.lastSnapshots.set(socket, snapshot);
        send(socket, { type: "output", data: snapshot });
      }
    } catch {
      send(socket, {
        type: "error",
        code: "SESSION_RUNTIME_ERROR",
        message: "Terminal stream failed",
      });
    }
  }
}

export const matchSessionStreamRoute = (pathname: string): StreamRouteMatch | undefined => {
  const segments = pathname.split("/").filter(Boolean);

  if (segments[0] !== "api" || segments[1] !== "projects" || segments[5] !== "stream") {
    return undefined;
  }

  const projectName = decodePathSegment(segments[2]);
  const sessionId = decodePathSegment(segments[4]);

  if (!projectName || !sessionId) {
    return undefined;
  }

  if (segments[3] === "terminal-sessions") {
    return { projectName, sessionType: "terminal", sessionId };
  }

  if (segments[3] === "agent-sessions") {
    return { projectName, sessionType: "agent", sessionId };
  }

  return undefined;
};

const getSessionMetadata = (
  registry: SessionRegistry,
  projectName: string,
  match: StreamRouteMatch,
): Promise<SessionMetadata | undefined> => {
  if (match.sessionType === "agent") {
    return registry.getAgentMetadata(projectName, match.sessionId);
  }

  return registry.getTerminalMetadata(projectName, match.sessionId);
};

const send = (socket: StreamSocket, message: SessionStreamServerMessage) => {
  socket.send(JSON.stringify(message));
};

const sessionData = (socket: StreamSocket) => {
  const data = socket.data;

  if (
    typeof data === "object" &&
    data !== null &&
    "kind" in data &&
    data.kind === "session-stream" &&
    "sessionType" in data &&
    "projectName" in data &&
    "sessionId" in data &&
    "tmuxSessionName" in data &&
    "status" in data
  ) {
    return data as SessionWebSocketData;
  }

  return undefined;
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

const projectPathErrorResponse = (error: ProjectPathError) => {
  if (error.code === "PROJECT_NOT_FOUND") {
    return jsonError(error.code, error.message, 404);
  }

  if (error.code === "PROJECT_FS_ERROR") {
    return jsonError(error.code, error.message, 500);
  }

  return jsonError(error.code, error.message, 400);
};
