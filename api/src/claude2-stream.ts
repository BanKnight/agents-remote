import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
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

const MAX_HISTORY_MESSAGES = 500;

type ChatMessageFilter = (msg: Record<string, unknown>) => boolean;

const isChatMessage: ChatMessageFilter = (msg) => {
  const type = msg.type as string | undefined;
  if (!type) return false;
  if (type === "user" || type === "assistant" || type === "result") return true;
  if (type === "system" && msg.subtype === "init") return true;
  return false;
};

function claudeJsonlPath(projectPath: string, claudeSessionId: string): string {
  const projectDir = projectPath.replace(/\//g, "-");
  return join(homedir(), ".claude", "projects", projectDir, `${claudeSessionId}.jsonl`);
}

async function loadHistoryFromJsonl(filePath: string): Promise<SessionStreamServerMessage[]> {
  try {
    const content = await readFile(filePath, "utf-8");
    const lines = content.trim().split("\n");
    const messages: SessionStreamServerMessage[] = [];

    for (const line of lines) {
      try {
        const msg = JSON.parse(line) as Record<string, unknown>;
        if (isChatMessage(msg)) {
          messages.push(msg as unknown as SessionStreamServerMessage);
        }
      } catch {
        // skip malformed lines
      }
    }

    return messages;
  } catch {
    return [];
  }
}

export class Claude2StreamController {
  private readonly streams = new WeakMap<StreamSocket, RuntimeStream>();
  private readonly history = new Map<string, SessionStreamServerMessage[]>();

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

    send(socket, {
      type: "connected",
      sessionId: data.sessionId,
      sessionType: data.sessionType,
      status: data.status,
    });
    console.log(`[claude2-stream] sent connected for ${data.sessionId}`);

    // Load and replay history from Claude's JSONL file (persistent)
    if (metadata?.projectPath && metadata?.claudeSessionId) {
      const jsonlPath = claudeJsonlPath(metadata.projectPath, metadata.claudeSessionId);
      console.log(`[claude2-stream] loading history from ${jsonlPath}`);
      const diskHistory = await loadHistoryFromJsonl(jsonlPath);
      console.log(`[claude2-stream] loaded ${diskHistory.length} messages from disk`);

      // Merge with in-memory buffer (newer messages may not be flushed to disk yet)
      const memHistory = this.history.get(data.sessionId) ?? [];
      const merged = mergeHistories(diskHistory, memHistory);
      this.history.set(data.sessionId, merged);

      // Replay chat messages (excluding result/ended to avoid premature stop)
      const replay = merged.filter((m) => m.type !== "result" && m.type !== "ended");
      console.log(`[claude2-stream] replaying ${replay.length} history messages`);
      for (const msg of replay) {
        send(socket, msg);
      }
    }

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
      if (parsed.type === "user") {
        console.log(`[claude2-stream] message user: ${data.tmuxSessionName}`);
        await this.runtime.write?.(data.tmuxSessionName, JSON.stringify(parsed) + "\n");
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
      let sessionHistory = this.history.get(data.sessionId);
      if (!sessionHistory) {
        sessionHistory = [];
        this.history.set(data.sessionId, sessionHistory);
      }

      const stream = await this.runtime.stream(
        data.tmuxSessionName,
        (line: string) => {
          try {
            const parsed = JSON.parse(line) as SessionStreamServerMessage;
            console.log(
              `[claude2-stream] send to ws: type=${parsed.type} ${"subtype" in parsed ? `subtype=${parsed.subtype}` : ""}`,
            );
            sessionHistory!.push(parsed);
            // Keep memory buffer capped
            if (sessionHistory!.length > MAX_HISTORY_MESSAGES) {
              sessionHistory!.splice(0, sessionHistory!.length - MAX_HISTORY_MESSAGES);
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

function mergeHistories(
  disk: SessionStreamServerMessage[],
  memory: SessionStreamServerMessage[],
): SessionStreamServerMessage[] {
  if (memory.length === 0) return disk.slice(-MAX_HISTORY_MESSAGES);

  // Use disk as base, add memory messages that aren't in disk
  const diskIds = new Set(disk.map((m) => JSON.stringify(m)));
  const merged = [...disk];
  for (const msg of memory) {
    const key = JSON.stringify(msg);
    if (!diskIds.has(key)) {
      merged.push(msg);
    }
  }

  return merged.slice(-MAX_HISTORY_MESSAGES);
}

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
