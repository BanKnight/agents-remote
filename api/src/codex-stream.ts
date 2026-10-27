import type {
  CodexPermissionMode,
  CodexStreamClientMessage,
  CodexStreamServerMessage,
} from "@agents-remote/shared";
import { CODEX_PERMISSION_MODES } from "@agents-remote/shared";
import type { SessionMetadata, SessionRegistry } from "./session-registry";
import { createBatchEmitter, type BatchEmit } from "./claude-stream";
import { jsonError } from "./http-auth";
import { ProjectPathError, resolveProjectPath } from "./project-paths";
import { getAgentProviderProfile } from "./agent-provider-profiles";
import { CodexRuntime } from "./codex-runtime";

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

// ── codex-stream WS 控制器 ────────────────────────────────────────────────────────
// 镜像 acp-stream 的控制器结构（createBatchEmitter 压缩分块 + batch markers 状态机），
// 路由 /api/projects/:p/agent-sessions/:id/codex-stream，upgrade 校验 transport==="codex"
// 且带 codexThreadId（app-server 直连会话）。存量 tmux codex 会话（无 threadId）不进此流，
// 继续走 agent-terminal 面板直至自然消亡（诚实形态标记）。

export type CodexWebSocketData = {
  kind: "codex-stream";
  sessionId: string;
  projectName: string;
  runtimeKey: string;
  projectPath: string;
  codexThreadId?: string;
  permissionMode?: string;
  model?: string;
  effort?: string;
};

type StreamSocket = {
  data?: unknown;
  send(message: string | Uint8Array | ArrayBuffer): void;
  close(code?: number, reason?: string): void;
};

/** set_config 各字段的值域校验（client message 白名单封闭的一部分）。 */
const isCodexPermissionMode = (value: string): value is CodexPermissionMode =>
  (CODEX_PERMISSION_MODES as readonly string[]).includes(value);

export class CodexStreamController {
  private readonly streams = new WeakMap<StreamSocket, { close(): Promise<void> | void }>();

  constructor(private readonly codexRuntime: CodexRuntime) {}

  async open(socket: StreamSocket): Promise<void> {
    const data = sessionData(socket);
    if (!data) {
      console.log("[codex-stream] open: no session data");
      return;
    }
    console.log(`[codex-stream] open: sessionId=${data.sessionId}`);

    try {
      await this.codexRuntime.ensureRunning({
        sessionId: data.sessionId,
        projectName: data.projectName,
        runtimeKey: data.runtimeKey,
        projectPath: data.projectPath,
        codexThreadId: data.codexThreadId,
        permissionMode: data.permissionMode,
        model: data.model,
        effort: data.effort,
      });
    } catch (error) {
      console.error(`[codex-stream] ensureRunning error ${data.sessionId}`, error);
      // codex 未安装（ENOENT）→ provider unavailable；其余 → runtime error。
      const code =
        (error as { code?: string })?.code === "ENOENT"
          ? "SESSION_PROVIDER_UNAVAILABLE"
          : "SESSION_RUNTIME_ERROR";
      send(socket, {
        type: "error",
        code,
        message:
          code === "SESSION_PROVIDER_UNAVAILABLE"
            ? "codex CLI not found (install @openai/codex)"
            : "Failed to start codex stream",
      });
      return;
    }

    try {
      this.startStream(socket, data);
    } catch (error) {
      console.error(`[codex-stream] startStream error ${data.sessionId}`, error);
      send(socket, {
        type: "error",
        code: "SESSION_RUNTIME_ERROR",
        message: "Failed to start codex stream",
      });
    }
  }

  async message(socket: StreamSocket, raw: string | Buffer): Promise<void> {
    const data = sessionData(socket);
    if (!data) return;

    let parsed: CodexStreamClientMessage;
    try {
      parsed = JSON.parse(raw.toString()) as CodexStreamClientMessage;
    } catch {
      send(socket, {
        type: "error",
        code: "SESSION_RUNTIME_ERROR",
        message: "Invalid stream message",
      });
      return;
    }

    try {
      // 应用层心跳：与 claude/pi/acp 同语义。
      if (parsed.type === "ping") {
        send(socket, { type: "pong" });
        return;
      }
      // user 文本 → runtime.write（codex_user_echo + 单飞 turn/start/排队）；interrupt →
      // turn/interrupt；set_config → 存 pending 下轮生效；respond → 审批 JSON-RPC response。
      if (parsed.type === "user") {
        this.codexRuntime.write(data.runtimeKey, parsed.text, parsed.uuid);
        return;
      }
      if (parsed.type === "interrupt") {
        await this.codexRuntime.interrupt(data.runtimeKey);
        return;
      }
      if (parsed.type === "set_config") {
        const patch: {
          model?: string;
          effort?: string;
          approvalPolicy?: string;
          sandbox?: string;
        } = {};
        if (typeof parsed.model === "string" && parsed.model) patch.model = parsed.model;
        if (typeof parsed.effort === "string" && parsed.effort) patch.effort = parsed.effort;
        if (
          typeof parsed.approvalPolicy === "string" &&
          isCodexPermissionMode(parsed.approvalPolicy)
        ) {
          patch.approvalPolicy = parsed.approvalPolicy;
        }
        if (typeof parsed.sandbox === "string" && isCodexPermissionMode(parsed.sandbox)) {
          patch.sandbox = parsed.sandbox;
        }
        if (Object.keys(patch).length === 0) return; // 无有效字段：白名单外静默丢弃
        this.codexRuntime.setThreadConfig(data.runtimeKey, patch);
        return;
      }
      if (parsed.type === "respond") {
        const rpcId = parseControlRequestId(parsed.controlRequestId);
        if (rpcId === undefined) return; // 非 codex: 前缀：白名单外静默丢弃
        if (parsed.decision !== "accept" && parsed.decision !== "decline") return;
        this.codexRuntime.respondApproval(data.runtimeKey, rpcId, parsed.decision);
        return;
      }
    } catch (error) {
      console.error(`[codex-stream] message error ${data.sessionId}`, error);
      send(socket, {
        type: "error",
        code: "SESSION_RUNTIME_ERROR",
        message: "Failed to handle codex stream message",
      });
    }
  }

  close(socket: StreamSocket): void {
    // 只断流订阅，不杀 app-server 进程（活会话保留供 reconnect；关闭走 RuntimeResources.close）。
    const stream = this.streams.get(socket);
    if (stream) {
      this.streams.delete(socket);
      void stream.close();
    }
  }

  private startStream(socket: StreamSocket, data: CodexWebSocketData): void {
    const emit: BatchEmit = (frame) => {
      socket.send(frame);
    };
    const onData = createBatchEmitter({
      emit,
      // ended/codex_approval_request 已由 CodexRuntime broadcastOnly 注入；实时行原样转发。
      onRealtimeRow: (line) => {
        emit(line);
      },
    });
    const stream = this.codexRuntime.stream(data.runtimeKey, onData, (error: Error) => {
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

/** `"codex:<rpcId>"` → rpcId；非前缀返回 undefined。 */
export function parseControlRequestId(controlRequestId: string): number | string | undefined {
  if (!controlRequestId.startsWith("codex:")) return undefined;
  const raw = controlRequestId.slice("codex:".length);
  if (raw === "") return undefined;
  const numeric = Number(raw);
  return Number.isSafeInteger(numeric) && String(numeric) === raw ? numeric : raw;
}

/** `/api/projects/:name/agent-sessions/:id/codex-stream` → {projectName, sessionId}。 */
export const matchCodexStreamRoute = (
  pathname: string,
): { projectName: string; sessionId: string } | undefined => {
  const segments = pathname.split("/").filter(Boolean);
  if (
    segments.length !== 6 ||
    segments[0] !== "api" ||
    segments[1] !== "projects" ||
    segments[3] !== "agent-sessions" ||
    segments[5] !== "codex-stream"
  ) {
    return undefined;
  }
  const projectName = decodePathSegment(segments[2]);
  const sessionId = decodePathSegment(segments[4]);
  if (!projectName || !sessionId) return undefined;
  return { projectName, sessionId };
};

export const handleCodexStreamUpgrade = async (
  request: Request,
  url: URL,
  projectsRoot: string,
  registry: SessionRegistry,
  server: UpgradeServer,
): Promise<{ matched: boolean; response?: Response }> => {
  const match = matchCodexStreamRoute(url.pathname);
  if (!match) {
    return { matched: false };
  }

  try {
    const project = await resolveProjectPath(projectsRoot, match.projectName);
    const metadata: SessionMetadata | undefined = await registry.getAgentMetadata(
      project.name,
      match.sessionId,
    );

    // codex chat 流判据：provider transport==="codex"（与 acp-stream 的 provider 家族判据
    // 对齐）。不带 codexThreadId 判据——新建会话的 threadId 在 ws open 的 ensureRunning
    // spawn（thread/start）之后才回写，upgrade 时必然还没有，卡它 = 新建会话永远连不上流。
    // 「存量 tmux codex 不进 chat 流」的诚实形态标记由前端面板路由承担（有 threadId 才进
    // CodexPanel）；无 threadId 会话误连本流的后果只是 open 即迁移（thread/start 新建）。
    if (
      !metadata ||
      !metadata.provider ||
      getAgentProviderProfile(metadata.provider)?.transport !== "codex"
    ) {
      return {
        matched: true,
        response: jsonError("SESSION_STREAM_MISMATCH", "Session is not a codex session", 400),
      };
    }

    if (
      server.upgrade(request, {
        data: {
          kind: "codex-stream",
          sessionId: metadata.id,
          projectName: metadata.projectName,
          runtimeKey: metadata.runtimeKey,
          projectPath: metadata.projectPath,
          codexThreadId: metadata.codexThreadId,
          permissionMode: metadata.permissionMode,
          model: metadata.model,
          effort: metadata.effort,
        } satisfies CodexWebSocketData,
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

const send = (socket: StreamSocket, message: CodexStreamServerMessage): void => {
  socket.send(JSON.stringify(message));
};

const sessionData = (socket: StreamSocket): CodexWebSocketData | undefined => {
  const data = socket.data;
  if (
    typeof data === "object" &&
    data !== null &&
    "kind" in data &&
    data.kind === "codex-stream" &&
    "sessionId" in data
  ) {
    return data as CodexWebSocketData;
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
