import type { PiStreamClientMessage, PiStreamServerMessage } from "@agents-remote/shared";
import type { AuthService } from "./auth";
import type { ChatSessionRegistry } from "./chat-session-registry";
import { createBatchEmitter, type BatchEmit } from "./claude-stream";
import { jsonError } from "./http-auth";
import { PiNotConfiguredError, PiRuntime } from "./pi-runtime";
import type { RuntimeStream } from "./session-registry";
import { canUpgradeWebSocket } from "./ws-auth";

type UpgradeServer = {
  upgrade(request: Request, options?: { data?: Record<string, unknown> }): boolean;
};

export type PiWebSocketData = {
  kind: "pi-stream";
  chatId: string;
};

type StreamSocket = {
  data?: unknown;
  send(message: string | Uint8Array | ArrayBuffer): void;
  close(code?: number, reason?: string): void;
};

/**
 * pi-stream WS 控制器（设计 docs/design/workbench-views.md §3.1）。镜像 claude-stream 的
 * 接线（createBatchEmitter 压缩分块 + batch markers 状态机），但运行时是进程内 pi
 * AgentSession（PiRuntime）而非 spawn CLI。
 *
 * 与 claude 的差异：
 * - 路由 `/api/chat-sessions/:chatId/stream` 全局无项目作用域 → upgrade 显式
 *   canUpgradeWebSocket 守卫（401 未认证 / 404 会话不存在），不依赖 /api 项目守卫。
 * - open 时 ensureRunning 懒启动 AgentSession（PiNotConfiguredError → SESSION_NOT_CONFIGURED
 *   错误帧，让未配置在客户端显式可见，不静默空流）。
 * - close 只断流不 dispose AgentSession——活会话保留供 reconnect + 多端 fan-out，仅
 *   closeChatSession 经 registry closeHook 才 close + removeSessionFiles。
 */
export class PiStreamController {
  private readonly streams = new WeakMap<StreamSocket, RuntimeStream>();

  constructor(
    private readonly piRuntime: PiRuntime,
    private readonly chatSessionRegistry: ChatSessionRegistry,
  ) {}

  async open(socket: StreamSocket): Promise<void> {
    const data = sessionData(socket);
    if (!data) {
      console.log("[pi-stream] open: no session data");
      return;
    }
    console.log(`[pi-stream] open: chatId=${data.chatId}`);

    try {
      await this.piRuntime.ensureRunning(data.chatId);
    } catch (error) {
      if (error instanceof PiNotConfiguredError) {
        send(socket, {
          type: "error",
          code: "SESSION_NOT_CONFIGURED",
          message: error.message,
        });
        return;
      }
      console.error(`[pi-stream] ensureRunning error ${data.chatId}`, error);
      send(socket, {
        type: "error",
        code: "SESSION_RUNTIME_ERROR",
        message: "Failed to start pi stream",
      });
      return;
    }

    try {
      await this.startStream(socket, data);
    } catch (error) {
      console.error(`[pi-stream] startStream error ${data.chatId}`, error);
      send(socket, {
        type: "error",
        code: "SESSION_RUNTIME_ERROR",
        message: "Failed to start pi stream",
      });
    }
  }

  async message(socket: StreamSocket, raw: string | Buffer): Promise<void> {
    const data = sessionData(socket);
    if (!data) return;

    let parsed: PiStreamClientMessage;
    try {
      parsed = JSON.parse(raw.toString()) as PiStreamClientMessage;
    } catch {
      send(socket, {
        type: "error",
        code: "SESSION_RUNTIME_ERROR",
        message: "Invalid stream message",
      });
      return;
    }

    try {
      // 应用层心跳：与 claude-stream 同语义，回 pong 让客户端据 lastPong 做 half-open 检测。
      if (parsed.type === "ping") {
        send(socket, { type: "pong" });
        return;
      }
      // user 文本入队（PiRuntime.send 内部排队/立即 prompt）；interrupt 中止 + 清队列。
      // 会话未启动时 send 同步 throw，兜底出错误帧。
      if (parsed.type === "user") {
        this.piRuntime.send(data.chatId, parsed.text, parsed.uuid, parsed.images);
        return;
      }
      if (parsed.type === "interrupt") {
        await this.piRuntime.interrupt(data.chatId);
        return;
      }
    } catch (error) {
      console.error(`[pi-stream] message error ${data.chatId}`, error);
      send(socket, {
        type: "error",
        code: "SESSION_RUNTIME_ERROR",
        message: "Failed to handle pi stream message",
      });
    }
  }

  close(socket: StreamSocket): void {
    // 只断流订阅，不 dispose AgentSession（活会话保留供 reconnect + 多端 fan-out）。
    const stream = this.streams.get(socket);
    if (stream) {
      this.streams.delete(socket);
      void stream.close();
    }
  }

  private async startStream(socket: StreamSocket, data: PiWebSocketData): Promise<void> {
    const emit: BatchEmit = (frame) => {
      if (frame instanceof Uint8Array) {
        const t0 = performance.now();
        socket.send(frame);
        console.log(
          `[pi-stream] blob flushed: bytes=${frame.byteLength} sendMs=${(performance.now() - t0).toFixed(0)}`,
        );
      } else {
        socket.send(frame);
      }
    };
    const onData = createBatchEmitter({
      emit,
      // pi 的 ended 已由 PiRuntime 在 agent_settled 时 broadcastOnly 注入；实时行原样转发。
      onRealtimeRow: (line) => {
        emit(line);
      },
    });
    const stream = await this.piRuntime.stream(data.chatId, onData, (error: Error) => {
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

/** `/api/chat-sessions/:chatId/stream` → chatId。 */
export const matchPiStreamRoute = (pathname: string): string | undefined => {
  const segments = pathname.split("/").filter(Boolean);
  if (
    segments.length !== 4 ||
    segments[0] !== "api" ||
    segments[1] !== "chat-sessions" ||
    segments[3] !== "stream"
  ) {
    return undefined;
  }
  return decodePathSegment(segments[2]);
};

export const handlePiStreamUpgrade = async (
  request: Request,
  url: URL,
  auth: AuthService,
  registry: ChatSessionRegistry,
  server: UpgradeServer,
): Promise<{ matched: boolean; response?: Response }> => {
  const chatId = matchPiStreamRoute(url.pathname);
  if (!chatId) {
    return { matched: false };
  }

  // pi 路由全局无项目作用域，upgrade 显式鉴权守卫（与 claude 依赖 /api 项目守卫不同）。
  if (!canUpgradeWebSocket(request, auth)) {
    return {
      matched: true,
      response: jsonError("UNAUTHENTICATED", "Authentication required", 401),
    };
  }

  const session = await registry.getChatSession(chatId);
  if (!session) {
    return {
      matched: true,
      response: jsonError("SESSION_NOT_FOUND", "Chat session not found", 404),
    };
  }

  if (server.upgrade(request, { data: { kind: "pi-stream", chatId } })) {
    return { matched: true };
  }

  return { matched: true, response: new Response("WebSocket upgrade required", { status: 426 }) };
};

const send = (socket: StreamSocket, message: PiStreamServerMessage): void => {
  socket.send(JSON.stringify(message));
};

const sessionData = (socket: StreamSocket): PiWebSocketData | undefined => {
  const data = socket.data;
  if (
    typeof data === "object" &&
    data !== null &&
    "kind" in data &&
    data.kind === "pi-stream" &&
    "chatId" in data
  ) {
    return data as PiWebSocketData;
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
