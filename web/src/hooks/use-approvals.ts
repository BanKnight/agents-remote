// M5-b 审批中心数据 hook（§6.4）：REST 初值 + approvals-stream WS 推送合并进**同一个
// query cache**（单一数据管道——快照全量替换，无增量 merge 分支）。enabled=false 即断流。
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ApprovalRespondRequest, ApprovalsStreamServerMessage } from "@agents-remote/shared";

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
