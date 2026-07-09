import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useAtom } from "jotai";
import { useState, type FormEvent, useId } from "react";
import type { Project } from "@agents-remote/shared";
import { listProjects } from "../../api/client";
import { useT } from "../../i18n";
import { IconMarker, NavItemSkeleton } from "../shell/shell-primitives";
import { ShellNavigationButton } from "../shell/shell-navigation";
import { ShellIcon } from "../shell/icons";
import { INSTANCE_SKELETON_ROW_COUNT } from "./instance-area";
import { type WorkbenchScope, workbenchSettingsFlyoutOpenAtom } from "../../routes/workbench-model";
import { SettingsFlyout } from "./settings-flyout";
import { ProjectSetupPanel, useCreateProject } from "../shell/project-setup";
import { Dialog, DialogContent } from "../ui/dialog";

type LeftRailProps = {
  scope: WorkbenchScope;
};

/**
 * 工作台左栏（设计文档 §3）。纯导航条目列表：全局总览节点 + 项目条目（点击切 scope）
 * + 设置入口。活跃实例与历史已进中栏 tab（2b/2c-1），左栏不再展开实例段；项目条目
 * 保留 count badges（来自 listProjects 聚合字段，零额外 query）作跨项目概览。
 */
export function WorkbenchLeftRail({ scope }: LeftRailProps) {
  return <ProjectTree scope={scope} />;
}

type ProjectTreeProps = {
  scope: WorkbenchScope;
};

function ProjectTree({ scope }: ProjectTreeProps) {
  const { t } = useT();
  const navigate = useNavigate();
  const [, setSettingsOpen] = useAtom(workbenchSettingsFlyoutOpenAtom);
  const [setupOpen, setSetupOpen] = useState(false);
  const [projectsCollapsed, setProjectsCollapsed] = useState(false);
  const inputId = useId();
  const { create, projectPath, setProjectPath } = useCreateProject();
  const projects = useQuery({ queryKey: ["projects"], queryFn: listProjects });
  const activeProjectName = scope.kind === "project" ? scope.key : null;

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
      <nav
        aria-label={t("workbench.projectsAria")}
        className="flex-1 overflow-y-auto pb-24 lg:pb-0"
      >
        <GlobalNavNode active={scope.kind === "global"} onSelect={selectGlobal} />
        <ProjectsSectionHeader
          collapsed={projectsCollapsed}
          onToggle={() => setProjectsCollapsed((v) => !v)}
          onCreate={() => setSetupOpen(true)}
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
      </nav>
      <div className="shrink-0 border-t border-on-surface/5 py-2">
        <button
          className="flex w-full items-center gap-2.5 rounded-md border border-transparent px-2 py-1.5 text-sm text-on-surface-muted transition hover:bg-on-surface/5 hover:text-on-surface"
          onClick={() => setSettingsOpen(true)}
          type="button"
        >
          <svg aria-hidden="true" className="size-3.5" fill="none" viewBox="0 0 16 16">
            <circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth={1.5} />
            <path
              d="M8 1.5v2M8 12.5v2M14.5 8h-2M3.5 8h-2M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4M12.6 12.6l-1.4-1.4M4.8 4.8L3.4 3.4"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth={1.5}
            />
          </svg>
          {t("nav.settings")}
        </button>
      </div>
      <Dialog open={setupVisible} onOpenChange={(open) => !open && setSetupOpen(false)}>
        <DialogContent className="flex flex-col items-center justify-center overflow-y-auto p-4">
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
      <SettingsFlyout />
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

/** 「项目」section label 行（设计文档 §3）：ShellNavigationButton 同款行样式
 *  （text-sm + 左 marker + py-1.5，与全局节点对齐），左侧可点击收起/展开项目列表，
 *  右侧挂 + 新建项目按钮。手写而非复用 ShellNavigationButton，因折叠与新建是两个
 *  独立 button，不能嵌套。样式类对齐 NavItemContent horizontal。 */
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
