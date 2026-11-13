import type { SessionMetadata, SessionRegistry } from "./session-registry";

/**
 * 会话自动 settle 扫描器（设计 docs/design/session-attention.md §4.2）。
 *
 * 「agent 说完 ≠ 事办完」：done/error 只是机器视角的「这一轮跑完了」，与人的「这件事办完了」
 * 正交。手动 settle 走 ⋯ 菜单；本扫描器负责**无人过问的存量会话**——done/error 且超过 7 天
 * 无活动 → 自动 settle（移出活跃注意力集，不删除、可随时恢复关注）。
 *
 * 只在服务端按 updatedAt 评估（不依赖客户端时钟）；幂等（已 settled 的跳过），无破坏性副作用
 * （纯 metadata 写，经 patchMetadata 触发 /api/sessions/stream 壳广播）。
 * idle（新开未用）/ working / blocked 一律不自动 settle。
 */

/** 扫描间隔：7 天阈值无需高频（分钟级误差无感）。 */
const SCAN_INTERVAL_MS = 60 * 60_000;
/** 自动 settle 的不活跃阈值。 */
const AUTO_SETTLE_IDLE_MS = 7 * 24 * 60 * 60_000;

export type SessionSettleSweeperDeps = {
  registry: Pick<
    SessionRegistry,
    "listAllMetadata" | "settleAgentSession" | "settleTerminalSession"
  >;
  intervalMs?: number;
  idleMs?: number;
  now?: () => Date;
};

/** 自动 settle 判据（导出供单测直调）：done/error + 未 settled + 超阈值不活跃。 */
export function shouldAutoSettle(
  metadata: SessionMetadata,
  now: Date,
  idleMs: number = AUTO_SETTLE_IDLE_MS,
): boolean {
  if (metadata.settledAt) return false;
  if (metadata.status !== "done" && metadata.status !== "error") return false;
  return now.getTime() - Date.parse(metadata.updatedAt) > idleMs;
}

/** 启动扫描器，返回 stop（清定时器；在飞的扫描不中断）。测试环境不接线。 */
export function startSessionSettleSweeper(deps: SessionSettleSweeperDeps): () => void {
  const intervalMs = deps.intervalMs ?? SCAN_INTERVAL_MS;
  const idleMs = deps.idleMs ?? AUTO_SETTLE_IDLE_MS;
  const now = deps.now ?? (() => new Date());

  const scan = async (): Promise<void> => {
    let metadataList: SessionMetadata[];
    try {
      metadataList = await deps.registry.listAllMetadata();
    } catch (error) {
      console.warn("[session-settle-sweeper] list failed", error);
      return;
    }
    const at = now();
    for (const metadata of metadataList) {
      if (!shouldAutoSettle(metadata, at, idleMs)) continue;
      try {
        if (metadata.type === "agent") {
          await deps.registry.settleAgentSession(metadata.projectName, metadata.id, true);
        } else {
          await deps.registry.settleTerminalSession(metadata.projectName, metadata.id, true);
        }
        console.log(`[session-settle-sweeper] auto settled: ${metadata.id}`);
      } catch (error) {
        // 单会话失败不阻断其余扫描；下轮重试。
        console.warn(`[session-settle-sweeper] settle failed: ${metadata.id}`, error);
      }
    }
  };

  const timer = setInterval(() => void scan(), intervalMs);
  // Node 定时器不阻止进程退出（与 API 进程生命周期同进退）。
  timer.unref?.();
  return () => clearInterval(timer);
}
