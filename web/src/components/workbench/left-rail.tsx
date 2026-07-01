import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type KeyboardEvent, type ReactNode, useState } from "react";
import type {
  AgentHistoryEntry,
  AgentProvider,
  AgentSession,
  Project,
  TerminalSession,
} from "@agents-remote/shared";
import {
  createAgentSession,
  createTerminalSession,
  listAgentHistory,
  listAgentSessions,
  listProjects,
  listTerminalSessions,
} from "../../api/client";
import { useT } from "../../i18n";
import type { TranslateFn } from "../../i18n/types";
import { sessionStatusLabel } from "../../routes/console-model";
import { ActionButton, IconMarker } from "../shell/shell-primitives";
import { ShellNavigationButton } from "../shell/shell-navigation";
import { ShellIcon } from "../shell/icons";
import { usePromptDialog } from "../shell/prompt-dialog";
import type { WorkbenchScope } from "../../routes/workbench-model";

/** 左栏实例段加载骨架的占位行数。 */
const INSTANCE_SKELETON_ROW_COUNT = 3;

type LeftRailProps = {
  scope: WorkbenchScope;
  focusId?: string;
};

/**
 * 工作台左栏（设计文档 §3）。跨项目 VSCode explorer 式树：全局节点 + 项目展开
 * （Agents/Terminals 段 + per-project 创建入口）。Stage 1 的单项目扁平列表已升级
 * 为常驻跨项目树，scope 决定选中哪个项目；点项目行切 scope 并展开，chevron 收折。
 * 历史 session 段（commit ②）、+ 新建 ▾ dropdown 与设置浮窗（commit ③）后续接入。
 */
export function WorkbenchLeftRail({ focusId, scope }: LeftRailProps) {
  return <ProjectTree focusId={focusId} scope={scope} />;
}

type ProjectTreeProps = {
  scope: WorkbenchScope;
  focusId?: string;
};

function ProjectTree({ focusId, scope }: ProjectTreeProps) {
  const { t } = useT();
  const navigate = useNavigate();
  const projects = useQuery({ queryKey: ["projects"], queryFn: listProjects });
  const activeProjectName = scope.kind === "project" ? scope.key : null;
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(activeProjectName ? [activeProjectName] : []),
  );

  const projectItems = projects.data?.projects ?? [];

  const toggleProject = (name: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const selectProject = (name: string) => {
    // 选中项目即展开（VSCode explorer 语义），chevron 负责单独收折。
    setExpanded((prev) => {
      if (prev.has(name)) return prev;
      const next = new Set(prev);
      next.add(name);
      return next;
    });
    void navigate({ to: "/workbench/$scope", params: { scope: name } });
  };

  const selectGlobal = () =>
    void navigate({ to: "/workbench/$scope", params: { scope: "global" } });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <nav aria-label={t("workbench.projectsAria")} className="flex-1 overflow-y-auto">
        <GlobalNavNode active={scope.kind === "global"} onSelect={selectGlobal} />
        {projectItems.map((project) => (
          <ProjectNode
            active={project.name === activeProjectName}
            expanded={expanded.has(project.name)}
            focusId={focusId}
            key={project.name}
            project={project}
            onSelect={() => selectProject(project.name)}
            onToggle={() => toggleProject(project.name)}
          />
        ))}
        {projects.isLoading && projectItems.length === 0 ? <LeftRailSkeleton /> : null}
      </nav>
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
  expanded: boolean;
  focusId?: string;
  project: Project;
  onSelect: () => void;
  onToggle: () => void;
};

function ProjectNode({ active, expanded, focusId, project, onSelect, onToggle }: ProjectNodeProps) {
  const { t } = useT();
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect();
    }
  };
  return (
    <div className="flex flex-col">
      <div
        className={`flex w-full cursor-pointer items-center gap-1 px-1.5 py-1.5 transition ${active ? "bg-cyan-300/10" : "hover:bg-white/5"}`}
        onClick={onSelect}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
      >
        <button
          aria-label={expanded ? t("workbench.collapseProject") : t("workbench.expandProject")}
          className="inline-flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded text-slate-500 hover:text-slate-200"
          onClick={(event) => {
            event.stopPropagation();
            onToggle();
          }}
          type="button"
        >
          <svg
            aria-hidden="true"
            className={`h-3 w-3 transition ${expanded ? "rotate-90" : ""}`}
            fill="none"
            viewBox="0 0 16 16"
          >
            <path
              d="M6 3L11 8l-5 5"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
            />
          </svg>
        </button>
        <IconMarker size="sm" tone="success">
          <ShellIcon className="h-3 w-3" name="project" />
        </IconMarker>
        <span
          className={`min-w-0 flex-1 truncate text-sm font-semibold ${active ? "text-cyan-100" : "text-slate-200"}`}
        >
          {project.name}
        </span>
        <span className="flex shrink-0 items-center gap-1 text-[0.6rem] font-medium text-slate-500">
          {project.agentSessionCount > 0 ? <span>{project.agentSessionCount}A</span> : null}
          {project.terminalSessionCount > 0 ? <span>{project.terminalSessionCount}T</span> : null}
        </span>
      </div>
      {expanded ? <ProjectInstances focusId={focusId} projectName={project.name} /> : null}
    </div>
  );
}

type ProjectInstancesProps = {
  focusId?: string;
  projectName: string;
};

function ProjectInstances({ focusId, projectName }: ProjectInstancesProps) {
  const { t } = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { prompt } = usePromptDialog();
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
  const history = useQuery({
    queryKey: ["projects", projectName, "agent-history"],
    queryFn: () => listAgentHistory(projectName),
    staleTime: 5_000,
  });

  const agentSessions = agents.data?.sessions ?? [];
  const terminalSessions = terminals.data?.sessions ?? [];
  const historyEntries = history.data?.entries ?? [];
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
        to: "/workbench/$scope/$focusId",
        params: { scope: projectName, focusId: data.session.id },
      });
    },
  });
  const createTerminal = useMutation({
    mutationFn: (displayName: string) =>
      createTerminalSession(projectName, displayName || undefined),
    onSuccess: async (data) => {
      await invalidateSessions();
      await navigate({
        to: "/workbench/$scope/$focusId",
        params: { scope: projectName, focusId: data.session.id },
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
      to: "/workbench/$scope/$focusId",
      params: { scope: projectName, focusId: sessionId },
    });
  };

  const resumeSession = useMutation({
    mutationFn: (claudeSessionId: string) =>
      createAgentSession(projectName, "claude2", { claudeSessionId }),
    onSuccess: async (data) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["projects", projectName, "agent-sessions"] }),
        queryClient.invalidateQueries({ queryKey: ["projects", projectName, "agent-history"] }),
      ]);
      await navigate({
        to: "/workbench/$scope/$focusId",
        params: { scope: projectName, focusId: data.session.id },
      });
    },
  });

  const handleHistoryClick = (entry: AgentHistoryEntry) => {
    if (entry.hasActiveSession && entry.activeSessionId) {
      focus(entry.activeSessionId);
    } else {
      resumeSession.mutate(entry.claudeSessionId);
    }
  };

  return (
    <div className="ml-3 flex flex-col border-l border-white/5 pl-1">
      <LeftRailCreateBar
        isCreatingClaude={createAgent.isPending}
        isCreatingTerminal={createTerminal.isPending}
        onCreateClaude={() => handleCreateAgent("claude2")}
        onCreateTerminal={handleCreateTerminal}
      />
      {loading && agentSessions.length === 0 && terminalSessions.length === 0 ? (
        <LeftRailSkeleton />
      ) : null}
      {agentSessions.length > 0 ? (
        <SectionLabel>{t("workbench.agentsSection")}</SectionLabel>
      ) : null}
      {agentSessions.map((session) => (
        <AgentNavItem
          active={session.id === focusId}
          key={session.id}
          onSelect={focus}
          session={session}
        />
      ))}
      {terminalSessions.length > 0 ? (
        <SectionLabel>{t("workbench.terminalsSection")}</SectionLabel>
      ) : null}
      {terminalSessions.map((session) => (
        <TerminalNavItem
          active={session.id === focusId}
          key={session.id}
          onSelect={focus}
          session={session}
        />
      ))}
      {historyEntries.length > 0 ? (
        <SectionLabel>{t("workbench.historySection")}</SectionLabel>
      ) : null}
      {historyEntries.map((entry) => (
        <HistorySessionNode
          active={entry.hasActiveSession && entry.activeSessionId === focusId}
          entry={entry}
          isResuming={resumeSession.isPending}
          key={entry.claudeSessionId}
          onClick={() => handleHistoryClick(entry)}
        />
      ))}
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-3 pb-1 pt-2 text-[0.6rem] font-bold uppercase tracking-[0.12em] text-slate-600">
      {children}
    </p>
  );
}

type LeftRailCreateBarProps = {
  isCreatingClaude: boolean;
  isCreatingTerminal: boolean;
  onCreateClaude: () => void;
  onCreateTerminal: () => void;
};

function LeftRailCreateBar({
  isCreatingClaude,
  isCreatingTerminal,
  onCreateClaude,
  onCreateTerminal,
}: LeftRailCreateBarProps) {
  const { t } = useT();
  return (
    <div className="grid grid-cols-2 gap-1 px-2 py-1.5">
      <ActionButton
        className="justify-center"
        disabled={isCreatingClaude}
        tone="accent"
        onClick={onCreateClaude}
      >
        <ShellIcon className="h-3 w-3" name="anthropic" />
        {isCreatingClaude ? t("project.creating") : t("workbench.createClaude2")}
      </ActionButton>
      <ActionButton
        className="justify-center"
        disabled={isCreatingTerminal}
        onClick={onCreateTerminal}
      >
        <ShellIcon className="h-3 w-3" name="terminal" />
        {isCreatingTerminal ? t("project.creating") : t("workbench.createTerminal")}
      </ActionButton>
    </div>
  );
}

type AgentNavItemProps = {
  active: boolean;
  session: AgentSession;
  onSelect: (sessionId: string) => void;
};

function AgentNavItem({ active, onSelect, session }: AgentNavItemProps) {
  const { t } = useT();
  const tone = session.provider === "codex" ? "success" : "accent";
  const iconName = session.provider === "codex" ? "openai" : "anthropic";
  // running 是常态，列表层仅在异常状态（idle/error/...）提示；复用 AgentInstanceRow 的约定。
  const isRunning = session.status === "running";
  return (
    <ShellNavigationButton
      active={active}
      description={isRunning ? undefined : t(sessionStatusLabel(session.status))}
      label={session.displayName}
      marker={
        <IconMarker tone={tone}>
          <ShellIcon className="h-3.5 w-3.5" name={iconName} />
        </IconMarker>
      }
      onClick={() => onSelect(session.id)}
    />
  );
}

type TerminalNavItemProps = {
  active: boolean;
  session: TerminalSession;
  onSelect: (sessionId: string) => void;
};

function TerminalNavItem({ active, onSelect, session }: TerminalNavItemProps) {
  const { t } = useT();
  const isRunning = session.status === "running";
  return (
    <ShellNavigationButton
      active={active}
      description={isRunning ? undefined : t(sessionStatusLabel(session.status))}
      label={session.displayName}
      marker={
        <IconMarker tone="success">
          <ShellIcon className="h-3.5 w-3.5" name="terminal" />
        </IconMarker>
      }
      onClick={() => onSelect(session.id)}
    />
  );
}

type HistorySessionNodeProps = {
  active: boolean;
  entry: AgentHistoryEntry;
  isResuming: boolean;
  onClick: () => void;
};

function HistorySessionNode({ active, entry, isResuming, onClick }: HistorySessionNodeProps) {
  const { t } = useT();
  const displayTitle = entry.title ?? entry.firstMessage ?? entry.claudeSessionId.slice(0, 8);
  const time = relativeTime(entry.lastActivityAt ?? entry.startedAt ?? "", t);
  const description = isResuming
    ? t("project.historyResuming")
    : [
        time,
        entry.messageCount > 0 ? t("project.historyTurns", { count: entry.messageCount }) : null,
      ]
        .filter(Boolean)
        .join(" · ");
  return (
    <ShellNavigationButton
      active={active}
      description={description || undefined}
      label={displayTitle}
      marker={
        <IconMarker tone={entry.hasActiveSession ? "success" : "accent"}>
          <ShellIcon className="h-3.5 w-3.5" name="anthropic" />
        </IconMarker>
      }
      onClick={() => {
        if (!isResuming) onClick();
      }}
    />
  );
}

function relativeTime(iso: string, t: TranslateFn): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (isNaN(date.getTime())) return "";
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t("time.justNow");
  if (mins < 60) return t("time.minutesAgo", { count: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t("time.hoursAgo", { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t("time.daysAgo", { count: days });
  return date.toLocaleDateString();
}

function LeftRailSkeleton() {
  return (
    <div className="flex flex-col gap-1 p-2">
      {Array.from({ length: INSTANCE_SKELETON_ROW_COUNT }, (_, index) => (
        <div className="h-8 animate-pulse rounded-lg bg-white/5" key={index} />
      ))}
    </div>
  );
}
