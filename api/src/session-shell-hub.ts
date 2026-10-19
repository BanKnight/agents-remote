import type { SessionShell, SessionShellsStreamServerMessage } from "@agents-remote/shared";
import type { AuthService } from "./auth";
import type { SessionRegistry } from "./session-registry";
import { canUpgradeWebSocket } from "./ws-auth";

/** 全局会话壳 WS 路径：壳元数据（status/mode/displayName/close）统一推送通道——
 *  变更推全量快照（同 approvals-stream 语义），不寄生任何内容流（chat 消息流/终端字节流）。 */
export const SESSIONS_STREAM_PATH = "/api/sessions/stream";

type ShellSocket = {
  data?: unknown;
  send(message: string): void;
  close(code?: number, reason?: string): void;
};

type UpgradeServer = {
  upgrade(request: Request, options?: { data?: unknown }): boolean;
};

/**
 * 会话壳广播器（纯只读 hub）：SessionRegistry.onMetadataChanged → scheduleBroadcast →
 * 全量快照（registry.listAllShells）合并广播。runtime 层（chat 状态机/TUI hooks/rename/close）
 * 经 registry 写入自动进同一通道，零感知广播。对照 ApprovalCenter：无 respond/登记入口，
 * 快照自带 displayName 无回填；runBroadcast 与上帧 JSON 比对相同跳过——registry 回调含
 * recordActivity/setModel 等非壳可见变更，避免无效广播放大成前端无效 invalidate。
 */
export class SessionShellHub {
  private readonly sockets = new Set<ShellSocket>();
  private broadcasting = false;
  private dirty = false;
  /** 上帧 JSON（同帧跳过的比对基准；首帧恒发送）。 */
  private lastFrame: string | null = null;

  constructor(private readonly registry: SessionRegistry) {}

  // ── WS 频道 ──

  /** upgrade：全局频道，鉴权同 /api/approvals/stream（canUpgradeWebSocket，无项目作用域）。 */
  handleUpgrade(request: Request, auth: AuthService, server: UpgradeServer) {
    const url = new URL(request.url);
    if (url.pathname !== SESSIONS_STREAM_PATH) return { matched: false as const };
    if (!canUpgradeWebSocket(request, auth)) {
      return {
        matched: true as const,
        response: Response.json({ error: "UNAUTHENTICATED" }, { status: 401 }),
      };
    }
    if (server.upgrade(request, { data: { kind: "sessions-stream" } })) {
      return { matched: true as const };
    }
    return {
      matched: true as const,
      response: new Response("WebSocket upgrade required", { status: 426 }),
    };
  }

  open(socket: ShellSocket): void {
    this.sockets.add(socket);
    // 订阅即得全量（客户端无需先 REST 再订阅，避免两次往返的窗口不一致）。
    this.sendSnapshot(socket).catch(() => {
      // 快照失败（IO 异常）静默：客户端 overview 轮询兜底，与 approvals-stream open 纪律一致。
    });
  }

  close(socket: ShellSocket): void {
    this.sockets.delete(socket);
  }

  /** registry 变更入口（index.ts 装配：registry.onMetadataChanged = () => hub.scheduleBroadcast()）。 */
  scheduleBroadcast(): void {
    if (this.sockets.size === 0) return;
    if (this.broadcasting) {
      this.dirty = true;
      return;
    }
    void this.runBroadcast();
  }

  /** sessions 帧（全量快照）单点构造。 */
  private frame(sessions: SessionShell[]): string {
    return JSON.stringify({
      type: "sessions",
      sessions,
    } satisfies SessionShellsStreamServerMessage);
  }

  private async sendSnapshot(socket: ShellSocket): Promise<void> {
    const sessions = await this.registry.listAllShells();
    const frame = this.frame(sessions);
    // 订阅帧也进 lastFrame 基准：否则订阅后第一次同内容广播会重发（frame !== null）。
    this.lastFrame = frame;
    if (this.sockets.has(socket)) socket.send(frame);
  }

  /**
   * 变更广播（合并 + 同帧跳过）：变更期间如有新变更，快照循环重跑一次——客户端始终收到
   * 「当前真值」，不依赖增量顺序（全量同步语义，state-sync-principles）。与上帧相同则跳过
   * send（回调源含非壳可见变更）。
   */
  private async runBroadcast(): Promise<void> {
    this.broadcasting = true;
    try {
      do {
        this.dirty = false;
        const sessions = await this.registry.listAllShells();
        const frame = this.frame(sessions);
        if (frame === this.lastFrame) continue;
        this.lastFrame = frame;
        for (const socket of this.sockets) socket.send(frame);
      } while (this.dirty);
    } finally {
      this.broadcasting = false;
    }
  }
}
