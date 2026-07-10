import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent, type ReactNode, useId } from "react";
import type { Project } from "@agents-remote/shared";
import { listProjects } from "../../api/client";
import { useT } from "../../i18n";
import { IconMarker, NavItemSkeleton } from "../shell/shell-primitives";
import { ShellNavigationButton } from "../shell/shell-navigation";
import { ShellIcon } from "../shell/icons";
import { INSTANCE_SKELETON_ROW_COUNT } from "./instance-area";
import { type WorkbenchScope } from "../../routes/workbench-model";
import { ProjectSetupPanel, useCreateProject } from "../shell/project-setup";
import { Dialog, DialogContent } from "../ui/dialog";

type ProjectLeftPanelProps = {
  scope: WorkbenchScope;
  /** [项目] 左栏主体：实例总览（InstanceLeftOverview，WorkbenchContent 构造后注入）。 */
  overview: ReactNode;
};

/**
 * [项目] 活动栏左栏内容源（Phase 2a 方案 X，设计 §4.2 / §8.4）。承载 scope 切换 + 新建项目
 * + InstanceLeftOverview 实例总览。
 *
 * - global scope：GlobalNavNode(active →/global) + ProjectsSectionHeader(折叠+新建) + ProjectNode
 *   列表(→/projects/$key) + InstanceLeftOverview。
 * - project scope：GlobalNavNode(active=false →/global，返回全局) + InstanceLeftOverview
 *   （不显项目列表，设计 §6 决策 1）。
 *
 * 设置入口由 [设置] 活动栏取代（left-rail footer 删除）。ProjectSetupPanel 新建项目 Dialog
 * 复用 left-rail 既有实现。
 */
export function ProjectLeftPanel({ scope, overview }: ProjectLeftPanelProps) {
  const { t } = useT();
  const navigate = useNavigate();
  const [setupOpen, setSetupOpen] = useState(false);
  const [projectsCollapsed, setProjectsCollapsed] = useState(false);
  const inputId = useId();
  const { create, projectPath, setProjectPath } = useCreateProject();
  const projects = useQuery({ queryKey: ["projects"], queryFn: listProjects });
  const activeProjectName = scope.kind === "project" ? scope.key : null;
  const isGlobal = scope.kind === "global";

  const projectItems = projects.data?.projects ?? [];

  const selectProject = (name: string) => {
    void navigate({ to: "/projects/$key", params: { key: name } });
  };
  const selectGlobal = () => void navigate({ to: "/global" });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedPath = projectPath.trim();
    if (trimmedPath.length === 0 || create.isPending) return;
    create.mutate(trimmedPath);
  };
  const setupVisible = setupOpen || create.isPending || create.error instanceof Error;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <nav aria-label={t("workbench.projectsAria")} className="shrink-0 overflow-y-auto">
        <GlobalNavNode active={isGlobal} onSelect={selectGlobal} />
        {isGlobal ? (
          <>
            <ProjectsSectionHeader
              collapsed={projectsCollapsed}
              onCreate={() => setSetupOpen(true)}
              onToggle={() => setProjectsCollapsed((v) => !v)}
            />
            {!projectsCollapsed ? (
              <div className="pl-4">
                {projectItems.map((project) => (
                  <ProjectNode
                    active={project.name === activeProjectName}
                    key={project.name}
                    project={project}
                    onSelect={() => selectProject(project.name)}
                  />
                ))}
                {projects.isLoading && projectItems.length === 0 ? <LeftRailSkeleton /> : null}
              </div>
            ) : null}
          </>
        ) : null}
      </nav>
      <div className="min-h-0 flex-1 overflow-hidden">{overview}</div>
      <Dialog open={setupVisible} onOpenChange={(open) => !open && setSetupOpen(false)}>
        <DialogContent className="overflow-y-auto p-0">
          <ProjectSetupPanel
            createError={create.error instanceof Error ? create.error : null}
            inputId={inputId}
            isPending={create.isPending}
            onProjectPathChange={setProjectPath}
            onSubmit={handleSubmit}
            projectPath={projectPath}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GlobalNavNode({ active, onSelect }: { active: boolean; onSelect: () => void }) {
  const { t } = useT();
  return (
    <ShellNavigationButton
      active={active}
      label={t("workbench.global")}
      marker={
        <IconMarker size="sm" tone="default">
          <svg aria-hidden="true" className="size-3.5" fill="none" viewBox="0 0 16 16">
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth={1.5} />
            <path
              d="M2 8h12M8 2c1.8 2 1.8 10 0 12M8 2c-1.8 2-1.8 10 0 12"
              stroke="currentColor"
              strokeWidth={1.5}
            />
          </svg>
        </IconMarker>
      }
      onClick={onSelect}
    />
  );
}

type ProjectNodeProps = {
  active: boolean;
  project: Project;
  onSelect: () => void;
};

function ProjectNode({ active, project, onSelect }: ProjectNodeProps) {
  return (
    <ShellNavigationButton
      active={active}
      label={project.name}
      marker={
        <IconMarker size="sm" tone="success">
          <ShellIcon className="size-3.5" name="project" />
        </IconMarker>
      }
      onClick={onSelect}
    />
  );
}

type ProjectsSectionHeaderProps = {
  collapsed: boolean;
  onCreate: () => void;
  onToggle: () => void;
};

function ProjectsSectionHeader({ collapsed, onCreate, onToggle }: ProjectsSectionHeaderProps) {
  const { t } = useT();
  return (
    <div className="flex items-center gap-1 px-2">
      <button
        aria-expanded={!collapsed}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-md border border-transparent py-1.5 pr-1 text-left text-on-surface-muted transition hover:bg-on-surface/5 hover:text-on-surface"
        onClick={onToggle}
        type="button"
      >
        <IconMarker size="sm" tone="success">
          <ShellIcon className="size-3.5" name="project" />
        </IconMarker>
        <span className="min-w-0 flex-1 truncate text-xs font-bold sm:text-sm">
          {t("workbench.projectsSection")}
        </span>
        <svg
          aria-hidden="true"
          className={`size-3 shrink-0 transition-transform ${collapsed ? "" : "rotate-90"}`}
          fill="none"
          viewBox="0 0 16 16"
        >
          <path
            d="M6 4l4 4-4 4"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            stroke="currentColor"
          />
        </svg>
      </button>
      <button
        aria-label={t("home.createProjectAria")}
        className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-on-surface-muted transition hover:bg-on-surface/5 hover:text-on-surface"
        onClick={onCreate}
        type="button"
      >
        <svg aria-hidden="true" className="size-3.5" fill="none" viewBox="0 0 16 16">
          <path d="M8 3v10M3 8h10" strokeLinecap="round" strokeWidth={1.5} stroke="currentColor" />
        </svg>
      </button>
    </div>
  );
}

function LeftRailSkeleton() {
  return <NavItemSkeleton count={INSTANCE_SKELETON_ROW_COUNT} />;
}
