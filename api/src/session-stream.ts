import type {
  AgentSessionStatus,
  SessionStreamClientMessage,
  SessionStreamServerMessage,
  SessionType,
  TerminalSessionStatus,
} from "@agents-remote/shared";
import { ProjectPathError, resolveProjectPath } from "./project-paths";
import { jsonError } from "./http-auth";
import {
  SessionRegistry,
  type AttachHandle,
  type RuntimeResources,
  type SessionMetadata,
} from "./session-registry";

type UpgradeServer = {
  upgrade(request: Request, options?: { data?: SessionWebSocketData }): boolean;
};

export type SessionWebSocketData = {
  kind: "session-stream";
  sessionType: SessionType;
  projectName: string;
  sessionId: string;
  runtimeKey: string;
  status: AgentSessionStatus | TerminalSessionStatus;
  cols?: number;
  rows?: number;
};

type StreamSocket = {
  data?: unknown;
  send(message: string): void;
  close?(code?: number, reason?: string): void;
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

    const cols = parsePositiveInt(url.searchParams.get("cols"));
    const rows = parsePositiveInt(url.searchParams.get("rows"));

    if (
      server.upgrade(request, {
        data: {
          kind: "session-stream",
          sessionType: match.sessionType,
          projectName: project.name,
          sessionId: metadata.id,
          runtimeKey: metadata.runtimeKey,
          status: metadata.status,
          ...(cols !== undefined ? { cols } : {}),
          ...(rows !== undefined ? { rows } : {}),
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

// 每个 WS 客户端 attach 一个 tmux attach 子进程（见 TmuxRuntime.attach）。
// open→attach 拿 AttachHandle，message→handle.write/resize，close→handle.close。
// ended 语义从 exists 轮询改为 attach 进程退出（handle.onExit）：tmux session 被 kill / shell
// exit 时 attach 进程退出，触发 onExit → 发 ended + 关 WS。
export class SessionStreamController {
  private readonly handles = new WeakMap<StreamSocket, AttachHandle>();

  constructor(
    private readonly runtime: RuntimeResources,
    private readonly sessionRegistry: SessionRegistry,
  ) {}

  async open(socket: StreamSocket) {
    const data = sessionData(socket);

    if (!data) {
      return false;
    }

    if (!this.runtime.attach) {
      send(socket, {
        type: "error",
        code: "SESSION_RUNTIME_ERROR",
        message: "Terminal attach not supported",
      });
      return true;
    }

    const cols = data.cols ?? 80;
    const rows = data.rows ?? 24;

    try {
      const handle = await this.runtime.attach(
        data.runtimeKey,
        (output) => {
          // terminal 产出 = session 活动 → bump updatedAt（分钟截断，同分钟短路）。
          void this.sessionRegistry.recordActivity(data.sessionId);
          send(socket, { type: "output", data: output });
        },
        (error) => {
          console.error(`[stream] attach error ${data.sessionId}`, error);
          send(socket, {
            type: "error",
            code: "SESSION_RUNTIME_ERROR",
            message: "Terminal stream failed",
          });
        },
        { cols, rows },
      );
      this.handles.set(socket, handle);
      handle.onExit(() => {
        this.handles.delete(socket);
        send(socket, { type: "ended" });
        socket.close?.();
      });
      send(socket, { type: "status", status: "connected" });
    } catch (error) {
      console.error(`[stream] attach failed ${data.sessionId}`, error);
      send(socket, {
        type: "error",
        code: "SESSION_RUNTIME_ERROR",
        message: "Terminal attach failed",
      });
    }

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

    const handle = this.handles.get(socket);

    if (!handle) {
      return true;
    }

    try {
      if (parsed.type === "input") {
        handle.write(parsed.data);
        // 用户输入 = session 活动 → bump updatedAt。
        void this.sessionRegistry.recordActivity(data.sessionId);
      }

      if (parsed.type === "resize") {
        handle.resize(parsed.cols, parsed.rows);
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
    const handle = this.handles.get(socket);

    if (handle) {
      this.handles.delete(socket);
      handle.close();
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
    "runtimeKey" in data &&
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

const parsePositiveInt = (value: string | null): number | undefined => {
  if (value === null) {
    return undefined;
  }
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
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
