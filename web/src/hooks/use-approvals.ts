// M5-b 审批中心数据 hook（§6.4）：REST 初值 + approvals-stream WS 推送合并进**同一个
// query cache**（单一数据管道——快照全量替换，无增量 merge 分支）。enabled=false 即断流。
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  ApprovalRespondRequest,
  ApprovalSummary,
  ApprovalsStreamServerMessage,
} from "@agents-remote/shared";

import { approvalsStreamUrl, fetchApprovals, respondApproval } from "../api/client";

export const APPROVALS_QUERY_KEY = ["approvals"] as const;

/**
 * 全局待审批快照。enabled 期间持有 WS 订阅：连接即推全量（open 时服务端先发一帧），
 * 之后任何 registry 变更推全量 → setQueryData 整体替换。WS 断线由 REST fallback 兜底
 *（refetchOnWindowFocus 全局关 → 显式 refetchInterval 兜底 15s，仅 enabled 期）。
 */
export function useApprovals(enabled: boolean) {
  const queryClient = useQueryClient();
  const query = useQuery({
    enabled,
    queryFn: fetchApprovals,
    queryKey: APPROVALS_QUERY_KEY,
    refetchInterval: enabled ? 15_000 : false,
  });

  useEffect(() => {
    if (!enabled) return;
    const socket = new WebSocket(approvalsStreamUrl());
    socket.onmessage = (event) => {
      try {
        const frame = JSON.parse(String(event.data)) as ApprovalsStreamServerMessage;
        if (frame.type === "approvals") {
          queryClient.setQueryData(APPROVALS_QUERY_KEY, { approvals: frame.approvals });
        }
      } catch {
        // 非 JSON 帧忽略（与 session-stream 同纪律）
      }
    };
    return () => socket.close();
  }, [enabled, queryClient]);

  return { approvals: query.data?.approvals ?? [] };
}

/** 单卡应答（allow/deny）。成功后服务端广播新快照 → WS 帧已更新卡片，无需本地乐观删。 */
export function useRespondApproval() {
  return useMutation({
    mutationFn: (request: ApprovalRespondRequest) => respondApproval(request),
  });
}

/** 审批卡片 hot 高亮判定（11 原型 cmd.hot 强写红）：写文件族工具恒红；Bash 按内容启发
 * rm / git push（原型仅 git push 卡明确红，机械规则记档）。桌面 ApprovalPopover 与移动
 * MobileApprovalSheet 共用单源。 */
const HOT_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
const HOT_COMMAND_RE = /\b(rm|git push)\b/;

export function isHotTool(item: ApprovalSummary): boolean {
  if (HOT_TOOLS.has(item.toolName)) return true;
  if (item.toolName === "Bash") return HOT_COMMAND_RE.test(item.inputSummary);
  return false;
}

/**
 * 「全部允许」两段确认 + 批量应答单源（桌面 ApprovalPopover 05f 与移动 MobileApprovalSheet 11
 * 同逻辑收敛）：首点 startConfirmAll 进入待确认态，再点 respondAll 执行——逐个转发（§6.4：
 * 批量允许 = 逐个调用，同会话内 CLI 逐条消费），allSettled 部分失败时失败卡留列表可重试
 *（成功卡已被服务端注销广播移除），全部落定后退确认态；容器关闭时调 resetConfirmAll。
 * 单卡应答共用同一 respond mutation（isPending 统一冻结全部卡片）。
 */
export function useApprovalCenter(approvals: ApprovalSummary[]) {
  const respond = useRespondApproval();
  const [confirmAll, setConfirmAll] = useState(false);
  const pendingCount = approvals.length;
  const respondAll = () => {
    void Promise.allSettled(
      approvals.map((item) =>
        respond.mutateAsync({
          controlRequestId: item.controlRequestId,
          decision: "allow",
          projectName: item.projectName,
          sessionId: item.sessionId,
        }),
      ),
    ).then(() => setConfirmAll(false));
  };
  return {
    confirmAll,
    pendingCount,
    respond,
    respondAll,
    startConfirmAll: () => setConfirmAll(true),
    resetConfirmAll: () => setConfirmAll(false),
  };
}
