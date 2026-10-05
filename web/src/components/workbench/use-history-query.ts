import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type {
  AgentHistoryEntry,
  AgentHistoryFilter,
  AgentHistoryGroupKey,
} from "@agents-remote/shared";
import { agentHistoryGroupKey, AGENT_HISTORY_GROUP_ORDER } from "@agents-remote/shared";
import { deleteAgentHistory, listAgentHistory, listGlobalAgentHistory } from "../../api/client";

/**
 * v1.5 批5 历史规模化共享管道（design_spec.md §4.2）。服务端查询（filter 三段筛选 + search
 * 按名搜索 + cursor 游标分页 20+20）+ counts 聚合（切段不闪计数）+ 五档分组派生。
 * 项目/全局两作用域单份实现：移动 03n sheet、桌面 05c HistoryList、iPad 04g Sidebar 同构消费
 * （多端同构原则：行为收敛共享组件层，容器各持壳）。
 */

/** 搜索词防抖（输入停顿后生效——search 进 queryKey，防每键一拉）。 */
export const HISTORY_SEARCH_DEBOUNCE_MS = 300;

const HISTORY_COUNTS_ZERO: AgentHistoryCounts = { all: 0, active: 0, ended: 0 };
type AgentHistoryCounts = import("@agents-remote/shared").AgentHistoryCounts;

const scopeQueryKey = (projectName: string | null) => [
  "agent-history",
  projectName ?? "__global__",
];

/**
 * 历史会话查询 hook。移动/桌面/iPad 三容器同构消费：
 * - filter/search 是容器持有的 UI 态（§6.10 视图态不持久化），本 hook 代管。
 * - 游标分页：fetchNextPage 追加 +20；hasNextPage=false 且已加载 → 底部「没有更多」。
 * - counts 从已加载首页取（服务端 search 后 filter 前聚合，同 key 下每页相同）。
 * - groups = 五档分组派生（今天/昨天/7 天内/30 天内/更早），服务端倒序入桶保组内有序。
 */
export function useHistoryQuery(opts: {
  /** 项目作用域项目名；null = 全局作用域（跨项目列表，行带 projectName 限定符）。 */
  projectName: string | null;
  /** false 时不发查询（常驻挂载的浮层消费方传「打开才拉」）。 */
  enabled: boolean;
}) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<AgentHistoryFilter>("all");
  const [search, setSearch] = useState("");
  // search debounce：debounced 值进 queryKey，原值回容器（受控 input 用原值保打字流畅）。
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search.trim()), HISTORY_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [search]);

  const queryKey = [...scopeQueryKey(opts.projectName), filter, debouncedSearch];
  const history = useInfiniteQuery({
    enabled: opts.enabled,
    queryKey,
    queryFn: ({ pageParam }) => {
      const query = { filter, search: debouncedSearch, cursor: pageParam as string };
      return opts.projectName
        ? listAgentHistory(opts.projectName, query)
        : listGlobalAgentHistory(query);
    },
    initialPageParam: "",
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 5_000,
    // 切 filter/search/作用域时保持上一份列表（防闪骨架；同 §6.12o 先例）。
    placeholderData: keepPreviousData,
  });

  const entries = useMemo(
    () => history.data?.pages.flatMap((page) => page.entries) ?? [],
    [history.data],
  );

  // 计数段：同 queryKey 下每页 counts 相同（服务端同一份 matched 流切窗），取首页。
  const counts = history.data?.pages.at(0)?.counts ?? HISTORY_COUNTS_ZERO;

  // 五档分组派生（纯函数 shared 单源；服务端已倒序，入桶保序）。
  const groups = useMemo(() => {
    const now = new Date();
    const buckets = new Map<AgentHistoryGroupKey, AgentHistoryEntry[]>();
    for (const entry of entries) {
      const key = agentHistoryGroupKey(entry.lastActivityAt, now);
      const bucket = buckets.get(key);
      if (bucket) bucket.push(entry);
      else buckets.set(key, [entry]);
    }
    return AGENT_HISTORY_GROUP_ORDER.flatMap((key) => {
      const bucket = buckets.get(key);
      return bucket && bucket.length > 0 ? [{ key, entries: bucket }] : [];
    });
  }, [entries]);

  const deleteMutation = useMutation({
    mutationFn: (entry: AgentHistoryEntry) =>
      // 全局作用域行带 projectName 限定符（04g pin②），删除走其归属项目端点。
      deleteAgentHistory(
        entry.projectName ?? opts.projectName ?? "",
        entry.claudeSessionId ?? entry.acpSessionId ?? "",
        entry.provider ?? "claude",
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: scopeQueryKey(opts.projectName) });
    },
  });

  return {
    /** 筛选段（全部/进行中/已结束）；切换即时生效（服务端 filter 切片）。 */
    filter,
    setFilter,
    /** 搜索词原值（受控 input）；queryKey 消费防抖值。 */
    search,
    setSearch,
    /** 游标分页聚合条目（服务端 lastActivityAt 倒序，组内/列表序 = 服务端序）。 */
    entries,
    /** 三段计数（当前 search 词下；filter 切换不重拉、计数不闪）。 */
    counts,
    /** 五档分组（仅非空组，序 = AGENT_HISTORY_GROUP_ORDER）。 */
    groups,
    /** 首屏加载（骨架态）；keepPreviousData 期不算加载（上一份列表已在显示）。 */
    isLoading: history.isPending,
    /** 请求失败（底部「加载失败 · 点按重试」态）。 */
    isError: history.isError,
    refetch: history.refetch,
    /** 滚动到底自动 +20 的三态。 */
    hasNextPage: history.hasNextPage,
    isFetchingNextPage: history.isFetchingNextPage,
    fetchNextPage: history.fetchNextPage,
    deleteEntry: deleteMutation.mutate,
    isDeleting: deleteMutation.isPending,
  };
}
