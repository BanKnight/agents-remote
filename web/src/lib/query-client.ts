import { QueryClient } from "@tanstack/react-query";

// 结构面板轮询节奏单源（2026-10-12 用户反馈④：桌面放置不动时文件树/git 面板不因外部变化
// 刷新——全局 refetchOnWindowFocus=false 且无 WS 文件事件通道，列表拉一次即静止）。消费点 =
// FilesPanel / FilesToolPanel（listing+diff）/ GitToolPanel（diff+log）。refetchInterval 只受
// document 可见性 gate（页面隐藏自动暂停，TanStack focusManager）；CSS invisible 保活容器
// （移动检视面板关闭态/桌面非激活标签）仍挂载仍轮询——移动检视经 pollingEnabled prop 停，
// 桌面非激活标签接受（切回即新，本地开销可接受）。同 key 多 observer 各自持 interval，
// 仅并发去重。
export const PANEL_POLL_MS = 10_000;

// Module-level singleton shared by the app root (QueryClientProvider) and any
// module that must invalidate queries outside a React context — notably the
// claude message adapter, whose useClaudeSession hook is also exercised in
// renderHook tests without a QueryClientProvider wrapper. Importing the same
// instance avoids useQueryClient's Provider dependency in those code paths.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Stale-while-revalidate window (mirrors hapi): cached data is served
      // immediately and refetched in the background after 5s, cutting redundant
      // refetches on focus/mount for fast-changing server state.
      staleTime: 5_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
