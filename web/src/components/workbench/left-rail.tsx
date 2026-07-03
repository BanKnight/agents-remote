import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useAtom } from "jotai";
import { type KeyboardEvent } from "react";
import type { AgentProvider, AgentSession, Project, TerminalSession } from "@agents-remote/shared";
import {
  createAgentSession,
  createTerminalSession,
  listAgentSessions,
  listProjects,
  listTerminalSessions,
} from "../../api/client";
import { useT } from "../../i18n";
import { sessionStatusLabel } from "../../routes/console-model";
import {
  actionButtonClasses,
  IconMarker,
  InstanceCard,
  sessionMarker,
  statusToTone,
  type ShellTone,
} from "../shell/shell-primitives";
import { ShellNavigationButton } from "../shell/shell-navigation";
import { ShellIcon } from "../shell/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { usePromptDialog } from "../shell/prompt-dialog";
import { HistoryList } from "./history-list";
import { useCloseSession } from "./instance-area";
import { type WorkbenchScope, workbenchSettingsFlyoutOpenAtom } from "../../routes/workbench-model";
import { SettingsFlyout } from "./settings-flyout";

/** 左栏实例段加载骨架的占位行数。 */
const INSTANCE_SKELETON_ROW_COUNT = 3;

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
      <div className="shrink-0 border-t border-on-surface/5 p-1.5">
        <button
          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-on-surface-muted transition hover:bg-on-surface/5 hover:text-on-surface"
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
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect();
    }
  };
  return (
    <div
      className={`flex w-full cursor-pointer items-center gap-1 px-1.5 py-1.5 transition ${active ? "bg-primary/10" : "hover:bg-on-surface/5"}`}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
    >
      <IconMarker size="sm" tone="success">
        <ShellIcon className="h-3 w-3" name="project" />
      </IconMarker>
      <span
        className={`min-w-0 flex-1 truncate text-sm font-semibold ${active ? "text-primary" : "text-on-surface-soft"}`}
      >
        {project.name}
      </span>
      <span className="flex shrink-0 items-center gap-1 text-[0.6rem] font-medium text-on-surface-muted">
        {project.agentSessionCount > 0 ? <span>{project.agentSessionCount}A</span> : null}
        {project.terminalSessionCount > 0 ? <span>{project.terminalSessionCount}T</span> : null}
      </span>
    </div>
  );
}

type ProjectInstancesProps = {
  focusId?: string;
  projectName: string;
};

export function ProjectInstances({ focusId, projectName }: ProjectInstancesProps) {
  const { t } = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { holder: promptHolder, prompt } = usePromptDialog();
  const { close, holder: closeHolder } = useCloseSession();
  const agents = useQuery({
    queryKey: ["projects", projectName, "agent-sessions"],
    queryFn: () => listAgentSessions(projectName),
    staleTime: 5_000,
  });
  const terminals = useQuery({
    queryKey: ["projects", projectName, "terminal-sessions"],
    queryFn: () => listTerminalSessions(projectName),
    staleTime: 5_000,
  });

  const agentSessions = agents.data?.sessions ?? [];
  const terminalSessions = terminals.data?.sessions ?? [];
  const loading = agents.isLoading && terminals.isLoading;

  const invalidateSessions = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["projects", projectName, "agent-sessions"] }),
      queryClient.invalidateQueries({ queryKey: ["projects", projectName, "terminal-sessions"] }),
    ]);
  };

  const createAgent = useMutation({
    mutationFn: ({ displayName, provider }: { displayName: string; provider: AgentProvider }) =>
      createAgentSession(projectName, provider, { displayName: displayName || undefined }),
    onSuccess: async (data) => {
      await invalidateSessions();
      await navigate({
        to: "/projects/$key/session/$id",
        params: { key: projectName, id: data.session.id },
      });
    },
  });
  const createTerminal = useMutation({
    mutationFn: (displayName: string) =>
      createTerminalSession(projectName, displayName || undefined),
    onSuccess: async (data) => {
      await invalidateSessions();
      await navigate({
        to: "/projects/$key/session/$id",
        params: { key: projectName, id: data.session.id },
      });
    },
  });

  const handleCreateAgent = (provider: AgentProvider) => {
    void prompt({
      title: t("session.namePrompt.createAgent"),
      placeholder: t("session.namePrompt.placeholder"),
      confirmLabel: t("session.namePrompt.confirm"),
      cancelLabel: t("cancel"),
    }).then((name) => {
      if (name !== null) createAgent.mutate({ displayName: name, provider });
    });
  };

  const handleCreateTerminal = () => {
    void prompt({
      title: t("session.namePrompt.createTerminal"),
      placeholder: t("session.namePrompt.placeholder"),
      confirmLabel: t("session.namePrompt.confirm"),
      cancelLabel: t("cancel"),
    }).then((name) => {
      if (name !== null) createTerminal.mutate(name);
    });
  };

  const focus = (sessionId: string) => {
    void navigate({
      to: "/projects/$key/session/$id",
      params: { key: projectName, id: sessionId },
    });
  };

  // 历史 session resume 已移入 useHistorySessions（history-list.tsx），卡片历史段
  // 直接渲染 <HistoryList>，不再在此维护 resume mutation / invalidate。
  // 卡片 close：复用 useCloseSession（confirm → close API → 精确失效缓存）。
  // 不调 layout.removePanel：卡片由 query 驱动，invalidate 后列表自然消失。
  const closeSession = (sessionId: string, type: "agent" | "terminal") => {
    void close({ projectName, sessionId }, type);
  };

  const statusToPill = (
    status: AgentSession["status"] | TerminalSession["status"],
  ): { label: string; tone: ShellTone } => ({
    label: t(sessionStatusLabel(status)),
    tone: statusToTone(status),
  });

  const mergedSessions = [
    ...agentSessions.map((session) => ({
      session: session as AgentSession,
      type: "agent" as const,
    })),
    ...terminalSessions.map((session) => ({
      session: session as TerminalSession,
      type: "terminal" as const,
    })),
  ];

  return (
    <div className="flex flex-col gap-3 px-3 pt-1">
      <LeftRailCreateBar
        isCreating={createAgent.isPending || createTerminal.isPending}
        onCreateAgent={handleCreateAgent}
        onCreateTerminal={handleCreateTerminal}
      />
      {loading && agentSessions.length === 0 && terminalSessions.length === 0 ? (
        <CardGridSkeleton />
      ) : null}
      {mergedSessions.length > 0 ? (
        <div className="grid grid-cols-2 gap-2">
          {mergedSessions.map(({ session, type }) => {
            const provider = type === "agent" ? (session as AgentSession).provider : undefined;
            return (
              <InstanceCard
                closeLabel={t("session.close")}
                key={session.id}
                marker={sessionMarker(type, provider)}
                onClose={() => closeSession(session.id, type)}
                onSelect={() => focus(session.id)}
                status={statusToPill(session.status)}
                title={session.displayName}
              />
            );
          })}
        </div>
      ) : null}
      <HistoryList focusId={focusId} projectName={projectName} />
      {promptHolder}
      {closeHolder}
    </div>
  );
}

type LeftRailCreateBarProps = {
  isCreating: boolean;
  onCreateAgent: (provider: AgentProvider) => void;
  onCreateTerminal: () => void;
};

function LeftRailCreateBar({
  isCreating,
  onCreateAgent,
  onCreateTerminal,
}: LeftRailCreateBarProps) {
  const { t } = useT();
  return (
    <div className="px-2 py-1.5">
      <DropdownMenu>
        <DropdownMenuTrigger
          className={actionButtonClasses({
            tone: "accent",
            className:
              "w-full justify-center group disabled:cursor-not-allowed disabled:opacity-50",
          })}
          disabled={isCreating}
        >
          {isCreating ? t("project.creating") : t("workbench.createMenu")}
          <svg
            aria-hidden="true"
            className="h-3 w-3 transition group-data-[state=open]:rotate-180"
            fill="none"
            viewBox="0 0 16 16"
          >
            <path
              d="M4 6l4 4 4-4"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
            />
          </svg>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
          <DropdownMenuItem onSelect={() => onCreateAgent("claude2")}>
            <ShellIcon className="h-3.5 w-3.5" name="anthropic" />
            {t("workbench.createClaude2")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onCreateAgent("codex")}>
            <ShellIcon className="h-3.5 w-3.5" name="openai" />
            {t("workbench.createCodex")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onCreateTerminal}>
            <ShellIcon className="h-3.5 w-3.5" name="terminal" />
            {t("workbench.createTerminal")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
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

/** 卡片总览加载骨架：2 列网格（与 InstanceCard 网格同构），INSTANCE_SKELETON_ROW_COUNT 行。 */
function CardGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2">
      {Array.from({ length: INSTANCE_SKELETON_ROW_COUNT * 2 }, (_, index) => (
        <div className="h-20 animate-pulse rounded-lg bg-on-surface/5" key={index} />
      ))}
    </div>
  );
}
