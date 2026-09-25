// M9 批次 c：05f 桌面审批中心 Popover（Mac）——锚于 sbar「N 项待审批」chip，箭头向下。
// 与移动 MobileApprovalSheet（11 原型）同数据同逻辑（useApprovals 单订阅 + useApprovalCenter
// respond 逐个转发 + 全部允许两段确认 + runtimeAlive 冻结），仅卡片形态按 05f 紧凑单行（.ar1 行内按钮）。
import { type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";

import type { ApprovalSummary } from "@agents-remote/shared";

import { useT } from "../../i18n";
import { isHotTool, useApprovalCenter } from "../../hooks/use-approvals";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

export function ApprovalPopover({
  approvals,
  children,
}: {
  /** 待审批快照（调用方 useApprovals 单订阅，sbar 计数与本 Popover 共用一份数据）。 */
  approvals: ApprovalSummary[];
  children: ReactNode;
}) {
  const { t } = useT();
  const navigate = useNavigate();
  const { confirmAll, pendingCount, respond, respondAll, startConfirmAll, resetConfirmAll } =
    useApprovalCenter(approvals);

  return (
    <Popover
      onOpenChange={(next) => {
        if (!next) resetConfirmAll();
      }}
    >
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" className="apop" side="top">
        <div className="ahd">
          <span className="font-bold text-ink-1">{t("approvals.title")}</span>
          {pendingCount > 0 ? (
            <>
              <span className="cnt">{t("approvals.nPending", { count: pendingCount })}</span>
              <button
                className="all cursor-pointer"
                disabled={respond.isPending}
                onClick={() => (confirmAll ? respondAll() : startConfirmAll())}
                type="button"
              >
                {confirmAll
                  ? t("approvals.confirmAll", { count: pendingCount })
                  : t("approvals.allowAll")}
              </button>
            </>
          ) : null}
        </div>
        {pendingCount === 0 ? (
          <p className="hfoot">{t("approvals.empty")}</p>
        ) : (
          approvals.map((item) => (
            <div className={`acard${item.runtimeAlive ? "" : " off"}`} key={item.controlRequestId}>
              <div className="ar1">
                <span className={`dot ${item.runtimeAlive ? "run" : "ring"}`} />
                <button
                  className="min-w-0 cursor-pointer truncate bg-transparent font-semibold text-inherit"
                  disabled={!item.runtimeAlive}
                  onClick={() =>
                    navigate({
                      to: "/projects/$key/session/$id",
                      params: { key: item.projectName, id: item.sessionId },
                    })
                  }
                  title={item.sessionName}
                  type="button"
                >
                  {item.sessionName}
                </button>
                <span className="font-semibold text-ink-2">· {item.projectName}</span>
                <span className="abtns">
                  <button
                    className="ghost cursor-pointer"
                    disabled={!item.runtimeAlive || respond.isPending}
                    onClick={() =>
                      respond.mutate({
                        controlRequestId: item.controlRequestId,
                        decision: "deny",
                        projectName: item.projectName,
                        sessionId: item.sessionId,
                      })
                    }
                    type="button"
                  >
                    {t("claude.permission.deny")}
                  </button>
                  <button
                    className="okb cursor-pointer"
                    disabled={!item.runtimeAlive || respond.isPending}
                    onClick={() =>
                      respond.mutate({
                        controlRequestId: item.controlRequestId,
                        decision: "allow",
                        projectName: item.projectName,
                        sessionId: item.sessionId,
                      })
                    }
                    type="button"
                  >
                    {t("claude.permission.allow")}
                  </button>
                </span>
              </div>
              <div className={`cmd${isHotTool(item) ? " hot" : ""}`}>{item.inputSummary}</div>
            </div>
          ))
        )}
        {/* 应答失败行内提示（与 MobileApprovalSheet 同款：再点任意按钮自动重置）。 */}
        {respond.isError ? (
          <p className="hfoot text-error">{t("api.approvalsRespondFailed")}</p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
