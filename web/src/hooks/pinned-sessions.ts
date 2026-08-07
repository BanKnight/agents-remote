import { useEffect, useMemo } from "react";
import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PinnedSessionsResponse } from "@agents-remote/shared";
import { listPinnedSessions, pinSession, unpinSession } from "../api/client";

const PINNED_SESSIONS_KEY = ["pinned-sessions"] as const;
// pin/unpin 低频，staleTime 内切回总览页命中缓存秒回；跨设备共享靠窗口聚焦 refetch
//（useQuery 显式开 refetchOnWindowFocus——全局默认关，pin 低频且跨设备故单独开），
// 另一台设备 pin 后本机聚焦即同步，无需 WS 实时推送。
const PINNED_SESSIONS_STALE_MS = 30_000;

// ── 旧 localStorage 播种（一次性迁移）────────────────────────────
// pin 迁服务端前，置顶存前端 localStorage `workbenchPinnedSessions`
//（Record<sessionId, true=置顶>，e51f6ff 删 workbenchPinnedSessionsAtom 时未回读播种，
// 旧 pin 静默丢失）。usePinnedSessions 挂载时读旧 key，把 true 项 POST 到服务端
//（addPinned 去重，重复播种无害），成功后删除 key。幂等：key 被删后无残留、下次不再播；
// POST 失败保留 key，下次页面加载重试。不设模块级 flag——幂等 + 服务端去重已保证
// 并发双挂载（桌面+移动 GlobalProjectsOverview）安全，且测试无需重置状态。
const LEGACY_PINNED_KEY = "workbenchPinnedSessions";

// 旧 localStorage pin 值：Record<sessionId, true=置顶>。非 string true 项丢弃；损坏 JSON → []。
export function readLegacyPinnedSessions(): string[] {
  if (typeof localStorage === "undefined") return [];
  const stored = localStorage.getItem(LEGACY_PINNED_KEY);
  if (stored === null) return [];
  try {
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
    return Object.entries(parsed as Record<string, unknown>)
      .filter(([, value]) => value === true)
      .map(([key]) => key);
  } catch {
    return [];
  }
}

// 一次性播种 effect：等初始 fetch 结算 → 读旧 key → POST 各 pin → 成功删 key + invalidate。
// querySettled 门控是必须的：invalidate 若与 in-flight 初始 fetch 竞态会被合并（不触发
// 第二次 fetch），播种后 refetch 拉服务端真相（含刚 POST 的 pin）才能立即显示置顶组。
function useLegacyPinSeed(qc: QueryClient, querySettled: boolean): void {
  useEffect(() => {
    if (!querySettled) return;
    const legacy = readLegacyPinnedSessions();
    if (legacy.length === 0) return;
    void (async () => {
      try {
        await Promise.all(legacy.map((sessionId) => pinSession(sessionId)));
        localStorage.removeItem(LEGACY_PINNED_KEY);
        void qc.invalidateQueries({ queryKey: PINNED_SESSIONS_KEY });
      } catch {
        // 播种失败保留 key，下次页面加载重试（静默，无用户可操作信息）。
      }
    })();
  }, [qc, querySettled]);
}

// 当前置顶 sessionId 集合。加载中/出错返回空 Set——总览页渲染按 candidates 取交集，
// 空集 = 无置顶组（与 localStorage 时代无 pin 的渲染一致）。useMemo 让 data 不变时 Set 引用稳定。
export function usePinnedSessions() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: PINNED_SESSIONS_KEY,
    queryFn: listPinnedSessions,
    staleTime: PINNED_SESSIONS_STALE_MS,
    // pin 跨设备共享：另一台设备 pin 后，本机窗口聚焦即 refetch 拉最新。全局
    // query-client 关了 refetchOnWindowFocus（快变服务端态不需要），pin 低频且跨设备，
    // 故此处显式开启——无需 WS 实时推送，聚焦即同步。
    refetchOnWindowFocus: true,
  });
  useLegacyPinSeed(qc, query.isSuccess || query.isError);
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
