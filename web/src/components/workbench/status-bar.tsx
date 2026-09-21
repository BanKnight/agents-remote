import { useApprovals } from "../../hooks/use-approvals";
import { useT } from "../../i18n";
import { useIsDesktopViewport } from "../../routes/workbench-model";
import { ApprovalPopover } from "./approval-popover";
import { useGlobalInstanceCandidates } from "./instance-area";

/**
 * Mac 状态栏（§6.10-4，05 原型 `.sbar`）：连接点 + 「N 实例运行中」+「N 项待审批 ›」
 *（warning 色，点击 = 05f 审批 Popover，见 approval-popover.tsx）。仅桌面渲染（useIsDesktopViewport
 * 与挂载容器 lg:block 同分界），移动端 return null 且不订阅（approvals WS 单实例，与移动
 * 审批 tray 不并存双订阅）。
 *
 * 落地与拍板差异（记 §6.10 批次 b 补记，铁律「不得伪造数据」）：
 * - 「已连接 srv-01」服务器名无数据源（overview/设置均无 host 字段）→ 文案落「已连接」；
 *   连接态 = overview query success（isLoaded success-only，失败/加载中显「连接中」灰点）。
 * - 「今日 $X · N tok」无后端聚合端点（OverviewResponse 无费用字段；shared total_cost_usd
 *   是单 turn ClaudeResult 字段非日累计）→ 本批不做，待后端聚合端点后补。
 *
 * 数据与全局总览/审批中心同源 dedupe（queryKey ["overview"] / ["approvals"]），无并行管道。
 */
export function StatusBar() {
  const { t } = useT();
  const isDesktop = useIsDesktopViewport();
  const { candidates, isLoaded } = useGlobalInstanceCandidates(
    isDesktop ? { kind: "global" } : { kind: "project", key: "" },
  );
  const { approvals } = useApprovals(isDesktop);
  if (!isDesktop) return null;
  const runningCount = candidates.filter((candidate) => candidate.status === "running").length;

  return (
    <div aria-label={t("workbench.statusBarAria")} className="sbar" role="status">
      <span aria-hidden="true" className={`dot2 ${isLoaded ? "bg-success" : "bg-on-surface/30"}`} />
      <span>{isLoaded ? t("workbench.statusConnected") : t("workbench.statusConnecting")}</span>
      <span aria-hidden="true">·</span>
      <span>{t("workbench.statusInstancesRunning", { count: runningCount })}</span>
      {approvals.length > 0 ? (
        <ApprovalPopover approvals={approvals}>
          <button
            className="flex cursor-pointer items-center gap-1 rounded-md px-1 py-0.5 font-semibold text-warning transition hover:bg-warning/10"
            type="button"
          >
            {t("workbench.statusPendingApprovals", { count: approvals.length })}
          </button>
        </ApprovalPopover>
      ) : null}
    </div>
  );
}
