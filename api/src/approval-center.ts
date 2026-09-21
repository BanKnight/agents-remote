import type {
  ApprovalRespondRequest,
  ApprovalRespondResponse,
  ApprovalSummary,
  ApprovalsStreamServerMessage,
  ClaudeControlResponse,
} from "@agents-remote/shared";
import { ApprovalRegistry, summarizeControlInput, type ApprovalRecord } from "./approval-registry";
import type { AuthService } from "./auth";
import type { ClaudeApprovalRequestInfo, ClaudeRuntime } from "./claude-runtime";
import type { SessionRegistry } from "./session-registry";
import { canUpgradeWebSocket } from "./ws-auth";

/** 全局审批流 WS 路径（§6.4：变更推全量快照，鉴权同现有 stream WS）。 */
export const APPROVALS_STREAM_PATH = "/api/approvals/stream";

type ApprovalSocket = {
  data?: unknown;
  send(message: string): void;
  close(code?: number, reason?: string): void;
};

type UpgradeServer = {
  upgrade(request: Request, options?: { data?: unknown }): boolean;
};

/**
 * M5-b 审批中心（docs/design/redesign-v2.md §6.4）。
 *
 * 服务端聚合的装配点：runtime 广播 can_use_tool control_request → registry 登记；
 * registry 变更 → 全量快照推 approvals-stream；REST respond → control_response 走
 * ClaudeRuntime.write（与 WS 转发同一 stdin 管道）。
 *
 * 路由层（index.ts）只做输入校验与响应映射，本类不构造 Response（沿 injectUserPrompt 契约）。
 */
export class ApprovalCenter {
  readonly registry = new ApprovalRegistry();
  private readonly sockets = new Set<ApprovalSocket>();
  private broadcasting = false;
  private dirty = false;

  constructor(
    private readonly claudeRuntime: ClaudeRuntime,
    private readonly sessionRegistry: SessionRegistry,
  ) {
    this.registry.onChange = () => this.scheduleBroadcast();
  }

  /** runtime 侧登记入口（index.ts 接 claudeRuntime.setOnApprovalRequest）。 */
  registerFromRuntime(
    info: ClaudeApprovalRequestInfo,
    request: { request_id: string; request: { tool_name: string; input: Record<string, unknown> } },
  ): void {
    const record: ApprovalRecord = {
      runtimeKey: info.runtimeKey,
      projectName: info.projectName,
      sessionId: info.sessionId,
      controlRequestId: request.request_id,
      toolName: request.request.tool_name,
      input: request.request.input,
      inputSummary: summarizeControlInput(request.request.tool_name, request.request.input),
      createdAt: new Date().toISOString(),
    };
    this.registry.register(record);
  }

  /** §6.4 快照：判活 + 显示名回填。 */
  async snapshot(): Promise<ApprovalSummary[]> {
    const [aliveKeys, names] = await Promise.all([
      this.claudeRuntime.listAliveRuntimeKeys(),
      this.resolveSessionNames(),
    ]);
    return this.registry.snapshot(
      aliveKeys,
      (record) => names.get(record.sessionId) ?? record.sessionId,
    );
  }

  /**
   * §6.4 应答：查 registry → 探活 → 与 WS 转发同一 stdin 管道写 control_response → 注销。
   * allow 用登记时定格的原始 input（updatedInput）；deny 附原因文案回给模型。
   */
  async respond(req: ApprovalRespondRequest): Promise<ApprovalRespondResponse> {
    const record = this.registry.find(req.projectName, req.sessionId, req.controlRequestId);
    if (!record) return { delivered: false, reason: "not_found" };

    const aliveKeys = await this.claudeRuntime.listAliveRuntimeKeys();
    if (!aliveKeys.has(record.runtimeKey)) {
      // 进程已死：残留卡片清掉，客户端下一帧快照即消失（断线冻结语义归 UI）。
      this.registry.clearRuntime(record.runtimeKey);
      return { delivered: false, reason: "runtime_dead" };
    }

    const response: ClaudeControlResponse = {
      type: "control_response",
      response: {
        subtype: "success",
        request_id: record.controlRequestId,
        response:
          req.decision === "allow"
            ? { behavior: "allow", updatedInput: record.input }
            : { behavior: "deny", message: "Denied by user via approval center" },
      },
    };

    try {
      await this.claudeRuntime.write(record.runtimeKey, `${JSON.stringify(response)}\n`);
    } catch {
      this.registry.clearRuntime(record.runtimeKey);
      return { delivered: false, reason: "runtime_dead" };
    }

    this.registry.unregister(record.runtimeKey, record.controlRequestId);
    void this.sessionRegistry.recordActivity(record.sessionId);
    return { delivered: true };
  }

  /** 会话内托盘应答路径的注销（index.ts 接控制器转发钩子）。 */
  unregisterForwarded(runtimeKey: string, controlRequestId: string): void {
    this.registry.unregister(runtimeKey, controlRequestId);
  }

  clearRuntime(runtimeKey: string): void {
    this.registry.clearRuntime(runtimeKey);
  }

  // ── WS 频道 ──

  /** upgrade：全局频道，鉴权同 /api/ws/echo（无项目作用域）。 */
  handleUpgrade(request: Request, auth: AuthService, server: UpgradeServer) {
    const url = new URL(request.url);
    if (url.pathname !== APPROVALS_STREAM_PATH) return { matched: false as const };
    if (!canUpgradeWebSocket(request, auth)) {
      return {
        matched: true as const,
        response: Response.json({ error: "UNAUTHENTICATED" }, { status: 401 }),
      };
    }
    if (server.upgrade(request, { data: { kind: "approvals-stream" } })) {
      return { matched: true as const };
    }
    return {
      matched: true as const,
      response: new Response("WebSocket upgrade required", { status: 426 }),
    };
  }

  open(socket: ApprovalSocket): void {
    this.sockets.add(socket);
    // 订阅即得全量（客户端无需先 REST 再订阅，避免两次往返的窗口不一致）。
    this.sendSnapshot(socket).catch(() => {
      // 快照失败（IO 异常）静默：客户端 15s refetch 兜底，与 claude-stream open 的 catch 纪律一致。
    });
  }

  close(socket: ApprovalSocket): void {
    this.sockets.delete(socket);
  }

  /** approvals 帧（全量快照）单点构造。 */
  private frame(approvals: ApprovalSummary[]): string {
    return JSON.stringify({ type: "approvals", approvals } satisfies ApprovalsStreamServerMessage);
  }

  private async sendSnapshot(socket: ApprovalSocket): Promise<void> {
    const approvals = await this.snapshot();
    if (this.sockets.has(socket)) socket.send(this.frame(approvals));
  }

  /**
   * 变更广播（合并 + 补发）：变更期间如有新变更，快照循环重跑一次——客户端始终
   * 收到“当前真值”，不依赖增量顺序（全量同步语义，state-sync-principles）。
   */
  private scheduleBroadcast(): void {
    if (this.broadcasting) {
      this.dirty = true;
      return;
    }
    void this.runBroadcast();
  }

  private async runBroadcast(): Promise<void> {
    this.broadcasting = true;
    try {
      do {
        this.dirty = false;
        const approvals = await this.snapshot();
        const frame = this.frame(approvals);
        for (const socket of this.sockets) socket.send(frame);
      } while (this.dirty);
    } finally {
      this.broadcasting = false;
    }
  }

  /** 显示名缓存（单次快照内同一会话只查一次；失败回落 sessionId）。 */
  private async resolveSessionNames(): Promise<Map<string, string>> {
    const names = new Map<string, string>();
    for (const record of this.registry.list()) {
      if (names.has(record.sessionId)) continue;
      const session = await this.sessionRegistry.getAgentSession(
        record.projectName,
        record.sessionId,
      );
      names.set(record.sessionId, session?.displayName || record.sessionId);
    }
    return names;
  }
}
