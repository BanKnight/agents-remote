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
  /** 增量回放锚（URL ?since=，claude 同款）：客户端最后可锚条目 id；relay 命中只发锚后行。 */
  sinceId?: string;
};

type StreamSocket = {
  data?: unknown;
  send(message: string | Uint8Array | ArrayBuffer): void;
  close(code?: number, reason?: string): void;
};

/** set_config 各字段的值域校验（client message 白名单封闭的一部分）。 */
const isCodexPermissionMode = (value: string): value is CodexPermissionMode =>
  (CODEX_PERMISSION_MODES as readonly string[]).includes(value);

/** @ 补全查询长度上限（client message 白名单封闭的一部分；fuzzy 查询过长无意义）。 */
const FILE_SEARCH_QUERY_MAX_LEN = 128;

export class CodexStreamController {
  private readonly streams = new WeakMap<StreamSocket, { close(): Promise<void> | void }>();
  /** 多端跟随索引(runtimeKey → sockets,claude-stream 同款):agent-tui 切模式后关全部 WS。 */
  private readonly socketsByRuntimeKey = new Map<string, Set<StreamSocket>>();

  constructor(
    private readonly codexRuntime: CodexRuntime,
    /** registry:open 守卫读 metadata.mode(terminal 形态拒绝)。 */
    private readonly registry: SessionRegistry,
  ) {}

  async open(socket: StreamSocket): Promise<void> {
    const data = sessionData(socket);
    if (!data) {
      console.log("[codex-stream] open: no session data");
      return;
    }
    console.log(`[codex-stream] open: sessionId=${data.sessionId}`);

    // 双模式守卫(agent-tui):terminal 形态的 codex 会话没有 headless 进程可拉——拉起会
    // 与 tmux pane 里的 codex TUI 同 threadId 双写。前端 terminal 形态渲染
    // AgentTerminalPanel(session-stream),不应连 codex-stream;误连时回明确错误
    // (claude-stream open 守卫同款,客户端 modeConflict 分支跟随换渲染形态)。
    const metadata = await this.registry
      .getAgentMetadata(data.projectName, data.sessionId)
      .catch(() => undefined);
    if (metadata?.mode === "terminal") {
      send(socket, {
        type: "error",
        code: "SESSION_STATE_CONFLICT",
        message: "Session is in terminal mode",
      });
      return;
    }

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
        this.codexRuntime.write(
          data.runtimeKey,
          parsed.text,
          parsed.uuid,
          sanitizeCodexImages(parsed.images),
        );
        return;
      }
      if (parsed.type === "interrupt") {
        await this.codexRuntime.interrupt(data.runtimeKey);
        return;
      }
      if (parsed.type === "compact") {
        // 压缩上下文（批 E parity）：busy/missing/failed 回 error 帧让前端 toast 提示。
        const result = await this.codexRuntime.compact(data.runtimeKey);
        if (result !== "ok") {
          const detail = {
            busy: "A turn is already running; stop it before compacting",
            missing: "Codex session is not running",
            failed: "Compaction failed to start",
          } as const;
          send(socket, {
            type: "error",
            code: "SESSION_RUNTIME_ERROR",
            message: `Compact rejected: ${detail[result]}`,
          });
        }
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
      if (parsed.type === "file_search") {
        // @ 补全（批 G）：载荷白名单校验（query 非空且 ≤128、requestId 非空字符串），
        // 不合格静默丢弃；roots 服务端固定 entry.projectPath（客户端不可指定，白名单封闭）。
        // 应答走 per-socket send（请求-应答型，不进 relay 缓冲，error/pong 同层）。
        if (
          typeof parsed.query !== "string" ||
          parsed.query.length === 0 ||
          parsed.query.length > FILE_SEARCH_QUERY_MAX_LEN ||
          typeof parsed.requestId !== "string" ||
          parsed.requestId.length === 0
        ) {
          return;
        }
        const files = await this.codexRuntime.fileSearch(data.runtimeKey, parsed.query);
        send(socket, { type: "file_search_result", requestId: parsed.requestId, files });
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
    const data = sessionData(socket);
    if (data) {
      const set = this.socketsByRuntimeKey.get(data.runtimeKey);
      if (set) {
        set.delete(socket);
        if (set.size === 0) this.socketsByRuntimeKey.delete(data.runtimeKey);
      }
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
    const stream = this.codexRuntime.stream(
      data.runtimeKey,
      onData,
      (error: Error) => {
        emit(
          JSON.stringify({
            type: "error",
            code: "SESSION_RUNTIME_ERROR",
            message: error.message,
          }),
        );
      },
      data.sinceId,
    );
    this.streams.set(socket, stream);
    // 多端跟随索引登记(claude-stream 同款)。
    let set = this.socketsByRuntimeKey.get(data.runtimeKey);
    if (!set) {
      set = new Set();
      this.socketsByRuntimeKey.set(data.runtimeKey, set);
    }
    set.add(socket);
  }

  /** agent-tui onModeSwitched:关该会话全部 codex-stream WS(未切换端重连被守卫拒)。 */
  closeSessionSockets(runtimeKey: string): void {
    const sockets = [...(this.socketsByRuntimeKey.get(runtimeKey) ?? [])];
    for (const socket of sockets) socket.close();
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

/**
 * 客户端 images 附件的最小形状守卫（security review L3）：非数组/项形状不对的项丢弃、
 * base64 裸数据超上限的项丢弃（不伪造部分发送——整组合法项仍发出）。pi 透传同病
 * （pi-stream 直传），统一收紧另批处理。
 */
export const CODEX_IMAGE_MAX_BASE64_LENGTH = 10 * 1024 * 1024;

export function sanitizeCodexImages(
  images: { data: string; mimeType: string }[] | undefined,
): { data: string; mimeType: string }[] | undefined {
  if (!Array.isArray(images)) return undefined;
  const clean = images.filter(
    (img): img is { data: string; mimeType: string } =>
      typeof img?.data === "string" &&
      img.data.length > 0 &&
      img.data.length <= CODEX_IMAGE_MAX_BASE64_LENGTH &&
      typeof img?.mimeType === "string" &&
      img.mimeType.length > 0,
  );
  return clean.length > 0 ? clean : undefined;
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

    // Incremental-replay anchor (?since=<id>): the last anchorable row id the client
    // already holds（claude-stream 同款口径——长度 ≤128；字符集由 relay 侧正则校验兜）。
    const since = url.searchParams.get("since");
    const sinceId = since && since.length <= 128 ? since : undefined;

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
          ...(sinceId ? { sinceId } : {}),
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
