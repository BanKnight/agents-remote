import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SkillAgent } from "@agents-remote/shared";
import {
  addSkillSource,
  installSkill,
  listInstalledSkills,
  listSkillSources,
  previewSkill,
  removeSkillSource,
  searchSkills,
  uninstallSkill,
} from "../api/client";

const SKILLS_KEY = ["skills"] as const;
const SKILL_SOURCES_KEY = ["skill-sources"] as const;
const SEARCH_MIN_CHARS = 2;

export function useSkillSearch(query: string) {
  return useQuery({
    queryKey: ["skill-search", query] as const,
    queryFn: () => searchSkills(query),
    enabled: query.trim().length >= SEARCH_MIN_CHARS,
  });
}

export function useInstalledSkills(agent: SkillAgent) {
  return useQuery({
    queryKey: [...SKILLS_KEY, "installed", agent] as const,
    queryFn: () => listInstalledSkills(agent),
  });
}

export function useSkillPreview(name: string | null, agent: SkillAgent) {
  return useQuery({
    queryKey: [...SKILLS_KEY, "preview", agent, name] as const,
    queryFn: () => previewSkill(name as string, agent),
    enabled: Boolean(name),
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
//（无需这里手动 invalidate catalog）。这里只刷新「已装列表」。
export function useInstallSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: installSkill,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: SKILLS_KEY });
    },
  });
}

export function useUninstallSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: uninstallSkill,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: SKILLS_KEY });
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
