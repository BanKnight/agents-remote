import type { Claude2StreamClientMessage, SessionStreamServerMessage } from "@agents-remote/shared";
import { ProjectPathError, resolveProjectPath } from "./project-paths";
import { jsonError } from "./http-auth";
import { SessionRegistry, type RuntimeResources, type RuntimeStream } from "./session-registry";
import type { AgentSessionStatus, SessionType } from "@agents-remote/shared";
import type { Claude2Runtime } from "./claude2-runtime";

type UpgradeServer = {
  upgrade(request: Request, options?: { data?: Record<string, unknown> }): boolean;
};

export type Claude2WebSocketData = {
  kind: "claude2-stream";
  sessionType: SessionType;
  projectName: string;
  sessionId: string;
  tmuxSessionName: string;
  status: AgentSessionStatus;
};

type StreamSocket = {
  data?: unknown;
  send(message: string): void;
};

type StreamRouteMatch = {
  projectName: string;
  sessionId: string;
};

export const handleClaude2StreamUpgrade = async (
  request: Request,
  url: URL,
  projectsRoot: string,
  registry: SessionRegistry,
  server: UpgradeServer,
): Promise<{ matched: boolean; response?: Response }> => {
  const match = matchClaude2StreamRoute(url.pathname);

  if (!match) {
    return { matched: false };
  }

  try {
    const project = await resolveProjectPath(projectsRoot, match.projectName);
    const metadata = await registry.getAgentMetadata(project.name, match.sessionId);

    if (!metadata || metadata.provider !== "claude2") {
      return {
        matched: true,
        response: jsonError("SESSION_STREAM_MISMATCH", "Session is not a Claude2 session", 400),
      };
    }

    const session = await registry.getAgentSession(project.name, match.sessionId);
    if (!session) {
      return {
        matched: true,
        response: jsonError("SESSION_NOT_FOUND", "Session not found", 404),
      };
    }

    if (
      server.upgrade(request, {
        data: {
          kind: "claude2-stream",
          sessionType: "agent",
          projectName: project.name,
          sessionId: metadata.id,
          tmuxSessionName: metadata.tmuxSessionName,
          status: session.status,
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

export class Claude2StreamController {
  private readonly streams = new WeakMap<StreamSocket, RuntimeStream>();

  constructor(
    private readonly claude2Runtime: Claude2Runtime,
    private readonly runtime: RuntimeResources,
    private readonly sessionRegistry: SessionRegistry,
  ) {}

  async open(socket: StreamSocket) {
    const data = sessionData(socket);

    if (!data) {
      console.log("[claude2-stream] open: no session data");
      return;
    }

    console.log(`[claude2-stream] open: sessionId=${data.sessionId} tmux=${data.tmuxSessionName}`);

    // Resolve metadata for projectPath and claudeSessionId
    const metadata = await this.sessionRegistry.getAgentMetadata(data.projectName, data.sessionId);
    console.log(
      `[claude2-stream] metadata found=${!!metadata} claudeSessionId=${metadata?.claudeSessionId ?? "none"}`,
    );

    // Ensure the Claude2 process is running (respawn with --resume if needed)
    await this.claude2Runtime.ensureRunning(
      data.tmuxSessionName,
      metadata?.projectPath ?? "",
      data.sessionId,
      metadata?.claudeSessionId,
    );

    // History is loaded separately via REST endpoint (GET /agent-sessions/:id/messages).
    // WebSocket is only for live streaming — no history replay here.

    send(socket, {
      type: "connected",
      sessionId: data.sessionId,
      sessionType: data.sessionType,
      status: data.status,
    });
    console.log(`[claude2-stream] sent connected for ${data.sessionId}`);

    try {
      await this.startStream(socket, data);
    } catch (e) {
      console.error(`[claude2-stream] startStream error ${data.sessionId}`, e);
      send(socket, {
        type: "error",
        code: "SESSION_RUNTIME_ERROR",
        message: "Failed to start Claude2 stream",
      });
    }
  }

  async message(socket: StreamSocket, raw: string | Buffer) {
    const data = sessionData(socket);

    if (!data) {
      console.log(
        `[claude2-stream] message dropped — no session data, kind=${(socket.data as Record<string, unknown> | null)?.kind ?? "none"} raw=${raw.toString().slice(0, 200)}`,
      );
      return;
    }

    let parsed: Claude2StreamClientMessage;
    try {
      parsed = JSON.parse(raw.toString()) as Claude2StreamClientMessage;
    } catch {
      send(socket, {
        type: "error",
        code: "SESSION_RUNTIME_ERROR",
        message: "Invalid stream message",
      });
      return;
    }

    try {
      if (parsed.type === "user" || parsed.type === "control_response") {
        console.log(`[claude2-stream] message ${parsed.type}: ${data.tmuxSessionName}`);
        await this.runtime.write?.(data.tmuxSessionName, JSON.stringify(parsed) + "\n");
      } else if (parsed.type === "switch_model") {
        console.log(`[claude2-stream] switch_model: ${data.tmuxSessionName} → ${parsed.model}`);
        // Close existing stream before switching
        const existingStream = this.streams.get(socket);
        if (existingStream) {
          existingStream.close();
          this.streams.delete(socket);
        }
        const result = await this.claude2Runtime.switchModel(data.tmuxSessionName, parsed.model);
        if (result) {
          // Update session metadata with new model
          void this.sessionRegistry.setClaudeSessionId(
            data.sessionId,
            result.claudeSessionId ?? "",
            parsed.model,
          );
          // Restart stream with new process
          try {
            await this.startStream(socket, data);
          } catch (e) {
            console.error(`[claude2-stream] restart stream after model switch failed`, e);
            send(socket, {
              type: "error",
              code: "SESSION_RUNTIME_ERROR",
              message: "Failed to restart stream after model switch",
            });
          }
        }
      }
    } catch {
      send(socket, {
        type: "error",
        code: "SESSION_RUNTIME_ERROR",
        message: "Failed to write to Claude2 stream",
      });
    }
  }

  close(socket: StreamSocket) {
    const stream = this.streams.get(socket);
    if (stream) {
      this.streams.delete(socket);
      void stream.close();
    }
  }

  private async startStream(socket: StreamSocket, data: NonNullable<Claude2WebSocketData>) {
    if (this.runtime.stream) {
      const stream = await this.runtime.stream(
        data.tmuxSessionName,
        (line: string) => {
          try {
            const parsed = JSON.parse(line) as SessionStreamServerMessage;
            console.log(
              `[claude2-stream] send to ws: type=${parsed.type} ${"subtype" in parsed ? `subtype=${parsed.subtype}` : ""}`,
            );
            // Capture claudeSessionId and model from system.init
            if (
              parsed.type === "system" &&
              "subtype" in parsed &&
              parsed.subtype === "init" &&
              "session_id" in parsed
            ) {
              const init = parsed as { session_id: string; model?: string };
              if (init.session_id) {
                console.log(
                  `[claude2-stream] captured claudeSessionId=${init.session_id} model=${init.model ?? "none"}`,
                );
                void this.sessionRegistry.setClaudeSessionId(
                  data.sessionId,
                  init.session_id,
                  init.model,
                );
              }
            }
            send(socket, parsed);
            if (parsed.type === "result") {
              send(socket, { type: "ended" });
            }
          } catch {
            // skip unparseable lines
          }
        },
        (error: Error) => {
          send(socket, {
            type: "error",
            code: "SESSION_RUNTIME_ERROR",
            message: error.message,
          });
        },
      );
      this.streams.set(socket, stream);
    }
  }
}

export const matchClaude2StreamRoute = (pathname: string): StreamRouteMatch | undefined => {
  const segments = pathname.split("/").filter(Boolean);

  if (
    segments[0] !== "api" ||
    segments[1] !== "projects" ||
    segments[3] !== "agent-sessions" ||
    segments[5] !== "claude2-stream"
  ) {
    return undefined;
  }

  const projectName = decodePathSegment(segments[2]);
  const sessionId = decodePathSegment(segments[4]);

  if (!projectName || !sessionId) {
    return undefined;
  }

  return { projectName, sessionId };
};

const send = (socket: StreamSocket, message: SessionStreamServerMessage) => {
  socket.send(JSON.stringify(message));
};

const sessionData = (socket: StreamSocket): Claude2WebSocketData | undefined => {
  const data = socket.data;

  if (
    typeof data === "object" &&
    data !== null &&
    "kind" in data &&
    data.kind === "claude2-stream" &&
    "sessionType" in data &&
    "projectName" in data &&
    "sessionId" in data &&
    "tmuxSessionName" in data &&
    "status" in data
  ) {
    return data as Claude2WebSocketData;
  }

  return undefined;
};

const decodePathSegment = (value: string | undefined) => {
  if (!value) return undefined;
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
