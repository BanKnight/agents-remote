import { useQuery } from "@tanstack/react-query";
import { getWikiIndex, getWikiPage } from "../api/client";

/** wiki query 的缓存隔离段（与 ProjectConsole / files / git / pages 缓存分离，单数据管道）。 */
export const WIKI_QUERY_SCOPE = "workbench-wiki";

/** wiki index query key（project-scoped + scope 段）。多处读同项目列表共享去重。 */
export function wikiIndexQueryKey(projectName: string, scope: string) {
  return ["projects", projectName, scope, "wiki-index"] as const;
}

/** wiki 单页 query key（slug 维度）。仅在选中某页（slug 非空）时启用。 */
export function wikiPageQueryKey(projectName: string, scope: string, slug: string) {
  return ["projects", projectName, scope, "wiki-page", slug] as const;
}

export function useWikiIndex(projectName: string, scope: string) {
  return useQuery({
    queryKey: wikiIndexQueryKey(projectName, scope),
    queryFn: () => getWikiIndex(projectName),
  });
}

export function useWikiPage(projectName: string, slug: string | null, scope: string) {
  return useQuery({
    queryKey: wikiPageQueryKey(projectName, scope, slug ?? ""),
    queryFn: () => getWikiPage(projectName, slug ?? ""),
    enabled: slug !== null,
  });
}
