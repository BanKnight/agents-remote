import type {
  AcpStreamClientMessage,
  AcpStreamServerMessage,
  AgentProvider,
} from "@agents-remote/shared";
import type { SessionMetadata, SessionRegistry } from "./session-registry";
import { createBatchEmitter, type BatchEmit } from "./claude-stream";
import { jsonError } from "./http-auth";
import { ProjectPathError, resolveProjectPath } from "./project-paths";
import { getAgentProviderProfile } from "./agent-provider-profiles";
import { AcpRuntime } from "./acp-runtime";

type UpgradeServer = {
  upgrade(request: Request, options?: { data?: Record<string, unknown> }): boolean;
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

// ── acp-stream WS 控制器（Phase 1 ACP PoC）────────────────────────────────────────
// 镜像 pi-stream 的控制器结构（createBatchEmitter 压缩分块 + batch markers 状态机），但
// 路由 project-scoped 仿 claude（/api/projects/:p/agent-sessions/:id/acp-stream，复用 /api
// 项目守卫语义），upgrade 校验 provider==="acp"。open 时 ensureRunning 懒恢复（omp 未安装
// → SESSION_PROVIDER_UNAVAILABLE 错误帧，让前置条件显式可见）；close 只断流不杀进程
//（活会话保留供 reconnect + 多端 fan-out，closeAgentSession 经 RuntimeResources.close 才杀）。

export type AcpWebSocketData = {
  kind: "acp-stream";
  sessionId: string;
  runtimeKey: string;
  /** provider（CLI 名）：open 恢复 spawn 时凭据解析按它取 settings 切片与 profile 声明。 */
  provider: AgentProvider;
  projectPath: string;
  acpSessionId?: string;
};

type StreamSocket = {
  data?: unknown;
  send(message: string | Uint8Array | ArrayBuffer): void;
  close(code?: number, reason?: string): void;
};

export class AcpStreamController {
  private readonly streams = new WeakMap<StreamSocket, { close(): Promise<void> | void }>();

  constructor(private readonly acpRuntime: AcpRuntime) {}

  async open(socket: StreamSocket): Promise<void> {
    const data = sessionData(socket);
    if (!data) {
      console.log("[acp-stream] open: no session data");
      return;
    }
    console.log(`[acp-stream] open: sessionId=${data.sessionId}`);

    try {
      await this.acpRuntime.ensureRunning({
        sessionId: data.sessionId,
        runtimeKey: data.runtimeKey,
        provider: data.provider,
        projectPath: data.projectPath,
        acpSessionId: data.acpSessionId,
      });
    } catch (error) {
      console.error(`[acp-stream] ensureRunning error ${data.sessionId}`, error);
      // omp 未安装（ENOENT）→ provider unavailable（用户可理解的前置缺失），其余 → runtime error。
      const code =
        (error as { code?: string })?.code === "ENOENT"
          ? "SESSION_PROVIDER_UNAVAILABLE"
          : "SESSION_RUNTIME_ERROR";
      send(socket, {
        type: "error",
        code,
        message:
          code === "SESSION_PROVIDER_UNAVAILABLE"
            ? "ACP agent command not found (install omp)"
            : "Failed to start ACP stream",
      });
      return;
    }

    try {
      this.startStream(socket, data);
    } catch (error) {
      console.error(`[acp-stream] startStream error ${data.sessionId}`, error);
      send(socket, {
        type: "error",
        code: "SESSION_RUNTIME_ERROR",
        message: "Failed to start ACP stream",
      });
    }
  }

  async message(socket: StreamSocket, raw: string | Buffer): Promise<void> {
    const data = sessionData(socket);
    if (!data) return;

    let parsed: AcpStreamClientMessage;
    try {
      parsed = JSON.parse(raw.toString()) as AcpStreamClientMessage;
    } catch {
      send(socket, {
        type: "error",
        code: "SESSION_RUNTIME_ERROR",
        message: "Invalid stream message",
      });
      return;
    }

    try {
      // 应用层心跳：与 claude/pi 同语义，回 pong 让客户端据 lastPong 做 half-open 检测。
      if (parsed.type === "ping") {
        send(socket, { type: "pong" });
        return;
      }
      // user 文本 → runtime.write（注入 acp_user_echo + 单飞 prompt/排队）；interrupt → cancel；
      // set_config → session/set_config_option（模型/模式切换，响应经 acp_config 帧回灌）。
      if (parsed.type === "user") {
        this.acpRuntime.write(data.runtimeKey, parsed.text, parsed.uuid);
        return;
      }
      if (parsed.type === "interrupt") {
        await this.acpRuntime.interrupt(data.runtimeKey);
        return;
      }
      if (parsed.type === "set_config") {
        await this.acpRuntime.setConfigOption(data.runtimeKey, parsed.configId, parsed.value);
        return;
      }
    } catch (error) {
      console.error(`[acp-stream] message error ${data.sessionId}`, error);
      send(socket, {
        type: "error",
        code: "SESSION_RUNTIME_ERROR",
        message: "Failed to handle ACP stream message",
      });
    }
  }

  close(socket: StreamSocket): void {
    // 只断流订阅，不杀 agent 进程（活会话保留供 reconnect；关闭走 RuntimeResources.close）。
    const stream = this.streams.get(socket);
    if (stream) {
      this.streams.delete(socket);
      void stream.close();
    }
  }

  private startStream(socket: StreamSocket, data: AcpWebSocketData): void {
    const emit: BatchEmit = (frame) => {
      if (frame instanceof Uint8Array) {
        socket.send(frame);
      } else {
        socket.send(frame);
      }
    };
    const onData = createBatchEmitter({
      emit,
      // ended 已由 AcpRuntime 在 prompt 响应时 broadcastOnly 注入；实时行原样转发。
      onRealtimeRow: (line) => {
        emit(line);
      },
    });
    const stream = this.acpRuntime.stream(data.runtimeKey, onData, (error: Error) => {
      emit(
        JSON.stringify({
          type: "error",
          code: "SESSION_RUNTIME_ERROR",
          message: error.message,
        }),
      );
    });
    this.streams.set(socket, stream);
  }
}

/** `/api/projects/:name/agent-sessions/:id/acp-stream` → {projectName, sessionId}。 */
export const matchAcpStreamRoute = (
  pathname: string,
): { projectName: string; sessionId: string } | undefined => {
  const segments = pathname.split("/").filter(Boolean);
  if (
    segments.length !== 6 ||
    segments[0] !== "api" ||
    segments[1] !== "projects" ||
    segments[3] !== "agent-sessions" ||
    segments[5] !== "acp-stream"
  ) {
    return undefined;
  }
  const projectName = decodePathSegment(segments[2]);
  const sessionId = decodePathSegment(segments[4]);
  if (!projectName || !sessionId) return undefined;
  return { projectName, sessionId };
};

export const handleAcpStreamUpgrade = async (
  request: Request,
  url: URL,
  projectsRoot: string,
  registry: SessionRegistry,
  server: UpgradeServer,
): Promise<{ matched: boolean; response?: Response }> => {
  const match = matchAcpStreamRoute(url.pathname);
  if (!match) {
    return { matched: false };
  }

  try {
    const project = await resolveProjectPath(projectsRoot, match.projectName);
    const metadata: SessionMetadata | undefined = await registry.getAgentMetadata(
      project.name,
      match.sessionId,
    );

    // 按 transport 家族校验（provider 是 CLI 名 omp/claude/codex；ACP 类 CLI 共享此流）。
    if (
      !metadata ||
      !metadata.provider ||
      getAgentProviderProfile(metadata.provider)?.transport !== "acp"
    ) {
      return {
        matched: true,
        response: jsonError("SESSION_STREAM_MISMATCH", "Session is not an ACP session", 400),
      };
    }

    if (
      server.upgrade(request, {
        data: {
          kind: "acp-stream",
          sessionId: metadata.id,
          runtimeKey: metadata.runtimeKey,
          provider: metadata.provider,
          projectPath: metadata.projectPath,
          acpSessionId: metadata.acpSessionId,
        } satisfies AcpWebSocketData,
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

const send = (socket: StreamSocket, message: AcpStreamServerMessage): void => {
  socket.send(JSON.stringify(message));
};

const sessionData = (socket: StreamSocket): AcpWebSocketData | undefined => {
  const data = socket.data;
  if (
    typeof data === "object" &&
    data !== null &&
    "kind" in data &&
    data.kind === "acp-stream" &&
    "sessionId" in data
  ) {
    return data as AcpWebSocketData;
  }
  return undefined;
};

const decodePathSegment = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
};
