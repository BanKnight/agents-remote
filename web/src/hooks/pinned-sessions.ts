import { useMemo } from "react";
import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PinnedSessionsResponse } from "@agents-remote/shared";
import { listPinnedSessions, pinSession, unpinSession } from "../api/client";

const PINNED_SESSIONS_KEY = ["pinned-sessions"] as const;
// pin/unpin 低频，staleTime 内切回总览页命中缓存秒回；窗口聚焦触发 refetch 拉最新
//（跨设备共享：另一台设备 pin 后，本机窗口聚焦即同步，无需 WS 实时推送）。
const PINNED_SESSIONS_STALE_MS = 30_000;

// 当前置顶 sessionId 集合。加载中/出错返回空 Set——总览页渲染按 candidates 取交集，
// 空集 = 无置顶组（与 localStorage 时代无 pin 的渲染一致）。useMemo 让 data 不变时 Set 引用稳定。
export function usePinnedSessions() {
  const query = useQuery({
    queryKey: PINNED_SESSIONS_KEY,
    queryFn: listPinnedSessions,
    staleTime: PINNED_SESSIONS_STALE_MS,
  });
  return useMemo(() => new Set<string>(query.data?.sessions ?? []), [query.data]);
}

// 乐观更新（用户 2026-08-07 实测「点击置顶有明显延迟感」→ 启用计划预留路径）：onMutate 同步
// 改 cache（点击即时反馈，不等 POST 完成 + invalidate refetch 的两段 RTT），onError 回滚快照，
// onSettled invalidate 拉服务端最终列表（含其他设备变更、去重后真相）。
// pin 是异步持久化、有失败可能 → 比 close 乐观移除多 cancelQueries + 回滚两层。
const optimisticMutate = (
  qc: QueryClient,
  sessionId: string,
  mutate: (sessions: string[]) => string[],
) => {
  const previous = qc.getQueryData<PinnedSessionsResponse>(PINNED_SESSIONS_KEY);
  qc.setQueryData<PinnedSessionsResponse>(PINNED_SESSIONS_KEY, (old) => ({
    sessions: mutate(old?.sessions ?? []),
  }));
  return { previous };
};

export function usePinSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: pinSession,
    onMutate: async (sessionId) => {
      await qc.cancelQueries({ queryKey: PINNED_SESSIONS_KEY });
      return optimisticMutate(qc, sessionId, (sessions) =>
        sessions.includes(sessionId) ? sessions : [...sessions, sessionId],
      );
    },
    onError: (_error, _sessionId, context) => {
      if (context?.previous) qc.setQueryData(PINNED_SESSIONS_KEY, context.previous);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: PINNED_SESSIONS_KEY });
    },
  });
}

export function useUnpinSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: unpinSession,
    onMutate: async (sessionId) => {
      await qc.cancelQueries({ queryKey: PINNED_SESSIONS_KEY });
      return optimisticMutate(qc, sessionId, (sessions) =>
        sessions.filter((id) => id !== sessionId),
      );
    },
    onError: (_error, _sessionId, context) => {
      if (context?.previous) qc.setQueryData(PINNED_SESSIONS_KEY, context.previous);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: PINNED_SESSIONS_KEY });
    },
  });
}
