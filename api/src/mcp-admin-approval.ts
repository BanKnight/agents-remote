import { randomUUID } from "node:crypto";
import { MCP_ADMIN_PROVIDER } from "@agents-remote/shared";
import type { ApprovalCenter, ApprovalTransportHooks } from "./approval-center";
import { summarizeControlInput, type ApprovalRecord } from "./approval-registry";

// ── admin 管理工具的审批挂起服务 ────────────────────────────────────────────────
//
// agent 调管理工具 → requestApproval 组装 ApprovalCard 登记 approvalCenter（web 卡片
// /PWA push/快照全自动复用）→ pending Promise 挂起工具调用 → 用户应答经 respond 派发
// 回 deliverResponse → resolve 恢复 handler（allow 执行真操作 / deny·timeout 返回
// isError）。探活 hooks 由 index.ts 注入（runtime 聚合），服务自身不持有 runtime。

/** 审批挂起超时：到期自动撤卡 + resolve("timeout")（handler 返回 isError）。 */
export const MCP_ADMIN_APPROVAL_TIMEOUT_MS = 120_000;

/** admin 审批的 controlRequestId 前缀（与 CLI 卡 id 空间隔离）。 */
export const MCP_ADMIN_REQUEST_PREFIX = "mcp-admin:";

/** 单次审批的判定结果（timeout = 超时自动撤卡，调用方按拒绝语义处理）。 */
export type McpAdminApprovalDecision = "allow" | "deny" | "timeout";

/** requestApproval 入参：发起会话（审批卡落其名下，respond 探活也探它）。 */
export type McpAdminApprovalRequest = {
  origin: { projectName: string; sessionId: string; runtimeKey: string };
  toolName: string;
  input: Record<string, unknown>;
};

type PendingApproval = {
  resolve: (decision: McpAdminApprovalDecision) => void;
  timer: ReturnType<typeof setTimeout>;
};

export class McpAdminApprovalService {
  /** controlRequestId → pending（同会话多张 admin 卡并存互不干扰）。 */
  private readonly pending = new Map<string, PendingApproval>();

  constructor(
    private readonly approvalCenter: ApprovalCenter,
    /** 挂起超时（注入供测试走真 timer 的小值）。 */
    private readonly timeoutMs = MCP_ADMIN_APPROVAL_TIMEOUT_MS,
  ) {}

  /** 登记为本中心的 mcp-admin transport（index.ts 启动装配调用一次）。 */
  attach(listAliveRuntimeKeys: ApprovalTransportHooks["listAliveRuntimeKeys"]): void {
    this.approvalCenter.registerTransport(MCP_ADMIN_PROVIDER, {
      listAliveRuntimeKeys,
      deliverResponse: async (record, decision) => {
        this.settle(record.controlRequestId, decision);
      },
    });
  }

  /**
   * 挂起一次管理操作等用户审批：登记卡片（推送/快照复用审批中心管道）→ await。
   * 超时自动撤卡并 resolve("timeout")；用户应答经 respond → deliverResponse → settle。
   */
  requestApproval(req: McpAdminApprovalRequest): Promise<McpAdminApprovalDecision> {
    const controlRequestId = `${MCP_ADMIN_REQUEST_PREFIX}${randomUUID()}`;
    const record: ApprovalRecord = {
      runtimeKey: req.origin.runtimeKey,
      projectName: req.origin.projectName,
      sessionId: req.origin.sessionId,
      controlRequestId,
      toolName: req.toolName,
      input: req.input,
      inputSummary: summarizeControlInput(req.toolName, req.input),
      createdAt: new Date().toISOString(),
      provider: MCP_ADMIN_PROVIDER,
    };
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(controlRequestId);
        // 撤卡走 registry：onChange → approvals-stream 快照推送（卡消失）。
        this.approvalCenter.registry.unregister(record.runtimeKey, controlRequestId);
        resolve("timeout");
      }, this.timeoutMs);
      this.pending.set(controlRequestId, { resolve, timer });
      this.approvalCenter.registerFromTransport(record);
    });
  }

  /** settle：清 pending + 停 timer + 恢复 handler。幂等（找不到 pending 即已超时结清）。 */
  private settle(controlRequestId: string, decision: McpAdminApprovalDecision): void {
    const entry = this.pending.get(controlRequestId);
    if (!entry) return;
    this.pending.delete(controlRequestId);
    clearTimeout(entry.timer);
    entry.resolve(decision);
  }

  /** 停机/测试收尾：全部 pending 按超时结清（resolve 调用方，不悬挂）。 */
  dispose(): void {
    for (const [id, entry] of this.pending) {
      clearTimeout(entry.timer);
      this.pending.delete(id);
      entry.resolve("timeout");
    }
  }
}
