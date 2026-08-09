import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SkillAgent, SkillUpdateStatus } from "@agents-remote/shared";
import {
  addSkillSource,
  checkSkillUpdates,
  installProjectSkill,
  installSkill,
  listInstalledSkills,
  listProjectInstalledSkills,
  listSkillSources,
  previewProjectSkill,
  previewSkill,
  removeSkillSource,
  searchSkills,
  uninstallProjectSkill,
  uninstallSkill,
  updateProjectSkill,
  updateSkill,
  waitForSkillTask,
} from "../api/client";

const SKILLS_KEY = ["skills"] as const;
const SKILL_SOURCES_KEY = ["skill-sources"] as const;
const SKILL_UPDATES_KEY = ["skill-updates"] as const;
const SEARCH_MIN_CHARS = 2;
/** skills list/preview 缓存新鲜期：npx skills spawn 11-17s，列表只在装/卸时变（mutation invalidate）。 */
const SKILLS_STALE_MS = 60_000;

/**
 * 项目级 skill queryKey 段（["skills","project",projectName]）：与全局 ["skills"] 隔离。
 * 项目 mutation invalidate 本项目 key，不污染全局；全局 mutation invalidate SKILLS_KEY 伞形
 *（连带 project，但项目目录不变，refetch 拿到相同结果，无副作用）。
 */
const projectSkillsKey = (projectName: string) => ["skills", "project", projectName] as const;

/** skills query/invalidate 前缀：projectName 给定 → 仅本项目；否则全局伞形（覆盖所有全局 skill query）。 */
function skillsScopeKey(projectName?: string) {
  return projectName ? projectSkillsKey(projectName) : SKILLS_KEY;
}

export function useSkillSearch(query: string) {
  return useQuery({
    queryKey: ["skill-search", query] as const,
    queryFn: () => searchSkills(query),
    enabled: query.trim().length >= SEARCH_MIN_CHARS,
  });
}

export function useInstalledSkills(agent: SkillAgent, projectName?: string) {
  return useQuery({
    queryKey: [...skillsScopeKey(projectName), "installed", agent] as const,
    queryFn: () =>
      projectName ? listProjectInstalledSkills(projectName, agent) : listInstalledSkills(agent),
    // 已装列表只在装/卸时变（mutation onSuccess invalidate 对应 scope key）；staleTime 内切 tab
    // 命中缓存秒回，避免每次 refetch 触发 npx skills list（11-17s spawn）。
    staleTime: SKILLS_STALE_MS,
  });
}

export function useSkillPreview(name: string | null, agent: SkillAgent, projectName?: string) {
  return useQuery({
    queryKey: [...skillsScopeKey(projectName), "preview", agent, name] as const,
    queryFn: () =>
      projectName
        ? previewProjectSkill(projectName, name as string, agent)
        : previewSkill(name as string, agent),
    enabled: Boolean(name),
    // preview 内部读 SKILL.md（项目/全局对应目录）；同 skill 详情切换命中缓存秒回。
    staleTime: SKILLS_STALE_MS,
  });
}

export function useSkillSources() {
  return useQuery({
    queryKey: SKILL_SOURCES_KEY,
    queryFn: () => listSkillSources(),
  });
}

// install/uninstall 后 server 自动遍历活跃 session 发 /reload-skills → CLI reload →
// broadcast skill_catalog_changed → 各 session 的 slash catalog query 经 WS 自动失效
//（无需这里手动 invalidate catalog）。这里只刷新「已装列表」（项目 scope 仅本项目）。
// install 已异步化：POST 秒回 taskId → waitForSkillTask 走 SSE 等终态；onSuccess 在任务真完成时跑。
// projectName 参数统一项目/全局 scope（避免调用方条件选 hook 违反 Rules of Hooks），镜像 mcp hooks
// 的 scope 参数模式。
export function useInstallSkill(projectName?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: Parameters<typeof installSkill>[0]) => {
      const { taskId } = projectName
        ? await installProjectSkill(projectName, vars)
        : await installSkill(vars);
      await waitForSkillTask(taskId, "api.skillInstallFailed");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: skillsScopeKey(projectName) });
    },
  });
}

export function useUninstallSkill(projectName?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: Parameters<typeof uninstallSkill>[0]) =>
      projectName ? uninstallProjectSkill(projectName, vars) : uninstallSkill(vars),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: skillsScopeKey(projectName) });
    },
  });
}

export function useAddSkillSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: addSkillSource,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: SKILL_SOURCES_KEY });
    },
  });
}

export function useRemoveSkillSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => removeSkillSource(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: SKILL_SOURCES_KEY });
    },
  });
}

// 第三方技能更新检测：GitHub Trees API 比对锁文件 hash，逐 repo 限速 → 用户手动
// 「检查更新」触发（enabled:false + refetch()），不自动批量（避 60 req/h 限速）。
// 仅全局 scope 有检测（项目 update 直接拉取同步，无 checkUpdates 概念）。
export function useCheckSkillUpdates(agent: SkillAgent) {
  return useQuery({
    queryKey: [...SKILL_UPDATES_KEY, agent] as const,
    queryFn: () => checkSkillUpdates(agent),
    enabled: false,
    staleTime: SKILLS_STALE_MS,
  });
}

// update 服务端走 npx skills update + reloadAliveSessions（/reload-skills → skill_catalog_changed
// 广播，无需这里手动 invalidate catalog）。刷新「已装列表」+ 乐观更新「该 skill 的更新检测结果」。
// update 已异步化：POST 秒回 taskId → waitForSkillTask 走 SSE 等终态；onSuccess 在任务真完成时跑
//（天然消除旧版「更新中→又变更新」体感——乐观 hasUpdate:false 现在在真完成时叠加）。
// projectName 参数统一项目/全局 scope；项目 update 无 SKILL_UPDATES_KEY 乐观更新（项目无检测）。
export function useUpdateSkill(projectName?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: Parameters<typeof updateSkill>[0]) => {
      const { taskId } = projectName
        ? await updateProjectSkill(projectName, vars)
        : await updateSkill(vars);
      await waitForSkillTask(taskId, "api.skillUpdateFailed");
    },
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: skillsScopeKey(projectName) });
      // updates query 是全局 enabled:false（手动 refetch 驱动），invalidateQueries 不会触发它重拉，
      // 旧 hasUpdate:true 残留会导致 UI 仍显「有更新」（用户体感「更新中→又变更新」）。
      // 乐观把该 skill 的 hasUpdate 置 false：update 成功即本地已是最新，UI 立即反映
      //（按钮消失/徽标变「已最新」）；用户可再用「检查更新」复核真实远程状态。
      // 仅全局 scope 有 updates query（项目 update 无检测，不触碰 SKILL_UPDATES_KEY）。
      if (!projectName) {
        qc.setQueriesData<{ updates: SkillUpdateStatus[] }>(
          { queryKey: SKILL_UPDATES_KEY },
          (old) => {
            if (!old?.updates) return old;
            return {
              updates: old.updates.map((u) =>
                u.name === variables.name ? { ...u, hasUpdate: false } : u,
              ),
            };
          },
        );
      }
    },
  });
}
