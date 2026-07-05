import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useAtom } from "jotai";
import type { Project } from "@agents-remote/shared";
import { listProjects } from "../../api/client";
import { useT } from "../../i18n";
import { IconMarker, ShellSectionLabel } from "../shell/shell-primitives";
import { ShellNavigationButton } from "../shell/shell-navigation";
import { ShellIcon } from "../shell/icons";
import { INSTANCE_SKELETON_ROW_COUNT } from "./instance-area";
import { type WorkbenchScope, workbenchSettingsFlyoutOpenAtom } from "../../routes/workbench-model";
import { SettingsFlyout } from "./settings-flyout";

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
  const projects = useQuery({ queryKey: ["projects"], queryFn: listProjects });
  const activeProjectName = scope.kind === "project" ? scope.key : null;

  const projectItems = projects.data?.projects ?? [];

  const selectProject = (name: string) => {
    void navigate({ to: "/projects/$key", params: { key: name } });
  };

  const selectGlobal = () => void navigate({ to: "/global" });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <nav
        aria-label={t("workbench.projectsAria")}
        className="flex-1 overflow-y-auto pb-24 lg:pb-0"
      >
        <GlobalNavNode active={scope.kind === "global"} onSelect={selectGlobal} />
        <ShellSectionLabel className="px-2 pb-1 pt-3">
          {t("workbench.projectsSection")}
        </ShellSectionLabel>
        {projectItems.map((project) => (
          <ProjectNode
            active={project.name === activeProjectName}
            key={project.name}
            project={project}
            onSelect={() => selectProject(project.name)}
          />
        ))}
        {projects.isLoading && projectItems.length === 0 ? <LeftRailSkeleton /> : null}
      </nav>
      <div className="shrink-0 border-t border-on-surface/5 p-2">
        <button
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-on-surface-muted transition hover:bg-on-surface/5 hover:text-on-surface"
          onClick={() => setSettingsOpen(true)}
          type="button"
        >
          <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" viewBox="0 0 16 16">
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
          <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" viewBox="0 0 16 16">
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
          <ShellIcon className="h-3 w-3" name="project" />
        </IconMarker>
      }
      onClick={onSelect}
    />
  );
}

function LeftRailSkeleton() {
  return (
    <div className="flex flex-col gap-1 p-2">
      {Array.from({ length: INSTANCE_SKELETON_ROW_COUNT }, (_, index) => (
        <div className="h-8 animate-pulse rounded-lg bg-on-surface/5" key={index} />
      ))}
    </div>
  );
}
