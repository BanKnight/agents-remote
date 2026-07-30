import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PagesRoot } from "@agents-remote/shared";
import { getPagesConfig, updatePagesConfig } from "../api/client";

/** pages 配置 query 的缓存隔离段（与 ProjectConsole / files / git 缓存分离，单数据管道）。 */
export const PAGES_QUERY_SCOPE = "workbench-pages";

/**
 * pages 配置 query key（project-scoped + scope 段）。配置只在 PUT 时变（mutation invalidate），
 * 多处同时读同一项目配置（桌面左栏 / 移动 overview / 移动 focus）共享同一 key 去重。
 */
export function pagesConfigQueryKey(projectName: string, scope: string) {
  return ["projects", projectName, scope, "pages-config"] as const;
}

export function usePagesConfig(projectName: string, scope: string) {
  return useQuery({
    queryKey: pagesConfigQueryKey(projectName, scope),
    queryFn: () => getPagesConfig(projectName),
  });
}

export function useUpdatePagesConfig(projectName: string, scope: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (roots: PagesRoot[]) => updatePagesConfig(projectName, { roots }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: pagesConfigQueryKey(projectName, scope) });
    },
  });
}
