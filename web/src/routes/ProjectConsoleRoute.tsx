import type {
  AgentHistoryEntry,
  AgentProvider,
  AgentSession,
  Project,
  TerminalSession,
} from "@agents-remote/shared";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode, Ref } from "react";
import { useEffect, useState } from "react";
import {
  closeAgentSession,
  closeTerminalSession,
  createAgentSession,
  createTerminalSession,
  listAgentHistory,
  getProject,
  listAgentSessions,
  listTerminalSessions,
} from "../api/client";
import { useT } from "../i18n";
import type { TranslateFn } from "../i18n/types";
import {
  consoleSections,
  projectSummary,
  sectionForId,
  sessionStatusLabel,
  type ConsoleSection,
  type ConsoleSectionDefinition,
} from "./console-model";
import {
  ShellHeaderSurface,
  ShellLayout,
  ShellPanel,
  ShellSidebar,
} from "../components/shell/shell-layout";
import {
  ProjectShellBottomNavigation,
  ProjectShellNavigation,
} from "../components/shell/shell-navigation";
import {
  ActionButton,
  IconMarker,
  StatusPill,
  shellSurfaceClasses,
  type ShellTone,
} from "../components/shell/shell-primitives";
import { FilesPanel } from "../components/files/file-browser";
import { GitDiffPanel } from "../components/git/git-diff-viewer";
import { ShellIcon } from "../components/shell/icons";
import { useConfirm } from "../components/shell/confirm-dialog";
import { usePromptDialog } from "../components/shell/prompt-dialog";

export function ProjectConsoleRoute() {
  const { t } = useT();
  const { projectName } = useParams({ from: "/projects/$projectName" });
  const { workspace: activeSection } = useSearch({ from: "/projects/$projectName" });
  const project = useQuery({
    queryKey: ["projects", projectName],
    queryFn: () => getProject(projectName),
  });

  if (project.isLoading) {
    return <ProjectConsoleLoading projectName={projectName} activeSection={activeSection} />;
  }

  if (project.error instanceof Error) {
    return (
      <ConsoleFrame title={t("project.unavailable")} subtitle={project.error.message}>
        <Link className="text-sm font-semibold text-cyan-200 underline underline-offset-4" to="/">
          {t("project.backToProjects")}
        </Link>
      </ConsoleFrame>
    );
  }

  if (!project.data) {
    return <ConsoleFrame title={t("project.unavailable")} subtitle={t("project.noData")} />;
  }

  return <ProjectConsole project={project.data.project} />;
}

type ConsoleFrameProps = {
  children?: ReactNode;
  subtitle: string;
  title: string;
};

function ConsoleFrame({ children, subtitle, title }: ConsoleFrameProps) {
  const { t } = useT();
  return (
    <main className="flex min-h-dvh items-center justify-center overflow-x-hidden bg-[#080b10] px-4 text-slate-100">
      <section
        className={`w-full max-w-md rounded-[2rem] p-6 shadow-2xl shadow-black/30 ${shellSurfaceClasses.workspace}`}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">
          {t("auth.brand")}
        </p>
        <h1 className="mt-3 text-2xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">{subtitle}</p>
        {children ? <div className="mt-5">{children}</div> : null}
      </section>
    </main>
  );
}

type ProjectConsoleLoadingProps = {
  activeSection: ConsoleSection;
  projectName: string;
};

function ProjectConsoleLoading({ activeSection, projectName }: ProjectConsoleLoadingProps) {
  const selectedSection = sectionForId(activeSection);
  const skeletonProject: Project = {
    name: projectName,
    path: "",
    agentSessionCount: 0,
    terminalSessionCount: 0,
  };
  const summary = projectSummary(skeletonProject);

  return (
    <ShellLayout
      sidebar={
        <ProjectSecondaryNav
          activeSection={activeSection}
          project={skeletonProject}
          onSelectSection={() => {}}
        />
      }
      variant="project"
      bottomNavigation={
        <ProjectSecondaryBottomNav activeSection={activeSection} onSelectSection={() => {}} />
      }
    >
      <WorkspaceHeader project={skeletonProject} section={selectedSection} summary={summary} />
      <ShellPanel className="flex-1 px-4 sm:px-5 lg:px-5 lg:pb-5" density="compact" docked>
        <div className="grid gap-3" aria-hidden="true">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </ShellPanel>
    </ShellLayout>
  );
}

function SkeletonPulse({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-800/70 ${className}`} />;
}

function SkeletonCard() {
  return (
    <div className={`block min-w-0 rounded-[1.25rem] px-3.5 py-3.5 ${shellSurfaceClasses.raised}`}>
      <span className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
        <SkeletonPulse className="h-7 w-7 rounded-full" />
        <span className="min-w-0 flex-1 space-y-2">
          <SkeletonPulse className="h-4 w-28" />
          <SkeletonPulse className="h-3 w-44" />
        </span>
        <SkeletonPulse className="h-4 w-4" />
      </span>
    </div>
  );
}

type ProjectConsoleProps = {
  project: Project;
};

function ProjectConsole({ project }: ProjectConsoleProps) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const navigate = useNavigate({ from: "/projects/$projectName" });
  const { workspace: activeSection, filesPath } = useSearch({ from: "/projects/$projectName" });
  const [resourceDeepDetailOpen, setResourceDeepDetailOpen] = useState(false);
  const [mobileFilePreviewOpen, setMobileFilePreviewOpen] = useState(false);
  const [agentTab, setAgentTab] = useState<"instances" | "history">("instances");
  const selectedSection = sectionForId(activeSection);
  const summary = projectSummary(project);
  const agentSessions = useQuery({
    queryKey: ["projects", project.name, "agent-sessions"],
    queryFn: () => listAgentSessions(project.name),
  });
  const terminalSessions = useQuery({
    queryKey: ["projects", project.name, "terminal-sessions"],
    queryFn: () => listTerminalSessions(project.name),
  });
  const historyCountQuery = useQuery({
    queryKey: ["projects", project.name, "agent-history"],
    queryFn: () => listAgentHistory(project.name),
  });
  const historyCount = historyCountQuery.data?.entries.length ?? 0;
  const invalidateSessions = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["projects"] }),
      queryClient.invalidateQueries({ queryKey: ["projects", project.name] }),
      queryClient.invalidateQueries({ queryKey: ["projects", project.name, "agent-sessions"] }),
      queryClient.invalidateQueries({ queryKey: ["projects", project.name, "terminal-sessions"] }),
    ]);
  };
  const createAgent = useMutation({
    mutationFn: ({ displayName, provider }: { displayName: string; provider: AgentProvider }) =>
      createAgentSession(project.name, provider, { displayName: displayName || undefined }),
    onSuccess: invalidateSessions,
  });
  const createTerminal = useMutation({
    mutationFn: (displayName: string) =>
      createTerminalSession(project.name, displayName || undefined),
    onSuccess: invalidateSessions,
  });
  const closeAgent = useMutation({
    mutationFn: (sessionId: string) => closeAgentSession(project.name, sessionId),
    onSuccess: invalidateSessions,
  });
  const closeTerminal = useMutation({
    mutationFn: (sessionId: string) => closeTerminalSession(project.name, sessionId),
    onSuccess: invalidateSessions,
  });
  const { confirm, holder } = useConfirm();
  const { holder: promptHolder, prompt } = usePromptDialog();

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

  const selectWorkspace = (workspace: (typeof consoleSections)[number]["id"]) => {
    setResourceDeepDetailOpen(false);
    void navigate({
      search: (prev) => ({ ...prev, workspace }),
    });
  };

  useEffect(() => {
    setResourceDeepDetailOpen(false);
    setMobileFilePreviewOpen(false);
  }, [activeSection]);

  const hiddenOnMobileResourceDetail =
    (mobileFilePreviewOpen && activeSection === "files") ||
    (resourceDeepDetailOpen && activeSection === "git");

  return (
    <ShellLayout
      sidebar={
        <ProjectSecondaryNav
          activeSection={activeSection}
          project={project}
          onSelectSection={selectWorkspace}
        />
      }
      variant="project"
      bottomNavigation={
        !resourceDeepDetailOpen && !hiddenOnMobileResourceDetail ? (
          <ProjectSecondaryBottomNav
            activeSection={activeSection}
            onSelectSection={selectWorkspace}
          />
        ) : null
      }
    >
      <div className={hiddenOnMobileResourceDetail ? "sm:contents hidden" : "contents"}>
        <WorkspaceHeader
          project={project}
          section={selectedSection}
          summary={summary}
          actions={
            activeSection === "agents" ? (
              <div
                className="hidden flex-wrap justify-end gap-2 sm:flex"
                aria-label="Create Agent instance"
              >
                <CreateButton
                  disabled={createAgent.isPending}
                  tone="accent"
                  onClick={() => handleCreateAgent("claude")}
                >
                  <ShellIcon name="anthropic" />
                  {t("project.createClaude")}
                </CreateButton>
                <CreateButton
                  disabled={createAgent.isPending}
                  onClick={() => handleCreateAgent("codex")}
                >
                  <ShellIcon name="openai" />
                  {t("project.createCodex")}
                </CreateButton>
                <CreateButton
                  disabled={createAgent.isPending}
                  tone="accent"
                  onClick={() => handleCreateAgent("claude2")}
                >
                  <ShellIcon name="anthropic" />
                  {t("project.createClaude2")}
                </CreateButton>
              </div>
            ) : activeSection === "terminal" ? (
              <div
                className="hidden flex-wrap justify-end gap-2 sm:flex"
                aria-label="Create Terminal instance"
              >
                <CreateButton
                  disabled={createTerminal.isPending}
                  tone="accent"
                  onClick={() => handleCreateTerminal()}
                >
                  <ShellIcon name="terminal" />
                  {createTerminal.isPending ? t("project.creating") : t("project.newTerminal")}
                </CreateButton>
              </div>
            ) : activeSection === "files" || activeSection === "git" ? null : undefined
          }
        />
      </div>

      {activeSection === "agents" ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-3.5 pt-4 sm:px-5 lg:px-6 lg:py-5 max-lg:!pb-[var(--shell-mobile-bottom-nav-space,0px)] lg:pb-0">
          <div
            className="grid grid-cols-3 gap-2 sm:hidden"
            aria-label="Create Agent instance mobile"
          >
            <CreateButton
              disabled={createAgent.isPending}
              tone="accent"
              onClick={() => handleCreateAgent("claude")}
              className="py-3 text-sm"
            >
              <ShellIcon name="anthropic" />
              {t("project.createClaude")}
            </CreateButton>
            <CreateButton
              disabled={createAgent.isPending}
              onClick={() => handleCreateAgent("codex")}
              className="py-3 text-sm"
            >
              <ShellIcon name="openai" />
              {t("project.createCodex")}
            </CreateButton>
            <CreateButton
              disabled={createAgent.isPending}
              tone="accent"
              onClick={() => handleCreateAgent("claude2")}
              className="py-3 text-sm"
            >
              <ShellIcon name="anthropic" />
              {t("project.createClaude2")}
            </CreateButton>
          </div>

          <div className="mt-4 flex gap-1 rounded-xl bg-white/[0.03] p-1 sm:mt-0">
            <button
              className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                agentTab === "instances"
                  ? "bg-white/10 text-slate-100"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              type="button"
              onClick={() => setAgentTab("instances")}
            >
              {t("project.activeInstances")}
              <span className="ml-1.5 text-xs text-slate-500">
                {agentSessions.data?.sessions.length ?? 0}
              </span>
            </button>
            <button
              className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                agentTab === "history"
                  ? "bg-white/10 text-slate-100"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              type="button"
              onClick={() => setAgentTab("history")}
            >
              {t("project.historyTitle")}
              <span className="ml-1.5 text-xs text-slate-500">{historyCount}</span>
            </button>
          </div>

          {agentTab === "instances" ? (
            <>
              <ErrorText error={createAgent.error ?? closeAgent.error} />
              <AgentInstanceList
                projectName={project.name}
                sessions={agentSessions.data?.sessions ?? []}
                isLoading={agentSessions.isLoading}
              />
            </>
          ) : (
            <AgentSessionHistoryPanel projectName={project.name} />
          )}
        </div>
      ) : null}

      {activeSection === "terminal" ? (
        <TerminalPanel
          projectName={project.name}
          sessions={terminalSessions.data?.sessions ?? []}
          isLoading={terminalSessions.isLoading}
          isCreating={createTerminal.isPending}
          isClosing={closeTerminal.isPending}
          createError={createTerminal.error}
          closeError={closeTerminal.error}
          confirm={confirm}
          onCreate={() => handleCreateTerminal()}
          onClose={(sessionId) => closeTerminal.mutate(sessionId)}
        />
      ) : null}

      {activeSection === "files" || activeSection === "git" ? (
        <SectionDetail
          filesPath={filesPath}
          projectName={project.name}
          section={selectedSection}
          onDeepDetailChange={setResourceDeepDetailOpen}
          onFilesPathChange={(path) =>
            void navigate({ search: (prev) => ({ ...prev, filesPath: path }) })
          }
          onMobileFilePreviewChange={setMobileFilePreviewOpen}
        />
      ) : null}
      {holder}
      {promptHolder}
    </ShellLayout>
  );
}

type ProjectSecondaryNavProps = {
  activeSection: ConsoleSection;
  onSelectSection: (section: ConsoleSection) => void;
};

type ProjectSecondaryDesktopNavProps = ProjectSecondaryNavProps & {
  project: Project;
};

function ProjectSecondaryNav({
  activeSection,
  onSelectSection,
  project,
}: ProjectSecondaryDesktopNavProps) {
  const { t } = useT();
  return (
    <ShellSidebar display="flex">
      <ProjectShellNavigation
        activeItemId={activeSection}
        items={projectNavigationItems(t)}
        projectPath={project.path}
        projectTitle={project.name}
        onSelectItem={onSelectSection}
      />
    </ShellSidebar>
  );
}

type ProjectSecondaryBottomNavProps = ProjectSecondaryNavProps & {
  ref?: Ref<HTMLElement>;
};

function ProjectSecondaryBottomNav({
  activeSection,
  onSelectSection,
  ref,
}: ProjectSecondaryBottomNavProps) {
  const { t } = useT();
  return (
    <ProjectShellBottomNavigation
      ref={ref}
      activeItemId={activeSection}
      items={projectNavigationItems(t)}
      onSelectItem={onSelectSection}
    />
  );
}

function projectNavigationItems(t: ReturnType<typeof useT>["t"]) {
  return consoleSections.map((section) => ({
    id: section.id,
    label: t(section.labelKey),
    mobileLabel: section.id === "agents" ? t("section.agents") : t(section.labelKey),
    marker: (
      <IconMarker size="sm" tone="accent">
        {section.id === "agents" ? (
          <ShellIcon name="agent-nav" />
        ) : section.id === "files" ? (
          <ShellIcon name="files-nav" />
        ) : section.id === "git" ? (
          <ShellIcon name="git-nav" />
        ) : (
          <ShellIcon name="terminal" />
        )}
      </IconMarker>
    ),
  }));
}

type WorkspaceHeaderProps = {
  actions?: ReactNode;
  project: Project;
  section: ConsoleSectionDefinition;
  summary: ReturnType<typeof projectSummary>;
};

function WorkspaceHeader({ actions, project, section, summary }: WorkspaceHeaderProps) {
  const { t } = useT();
  const sectionLabel = t(section.labelKey);
  const fallbackActions = (
    <div className="hidden grid-cols-3 gap-2 sm:grid">
      <SummaryBadge label={t("section.agents")} value={summary.agentCount} />
      <SummaryBadge label={t("section.terminal")} value={summary.terminalCount} />
      <SummaryBadge label="Runtime" value={t(summary.runtimeStatus)} />
    </div>
  );

  return (
    <ShellHeaderSurface
      actions={actions !== undefined ? actions : fallbackActions}
      eyebrow={
        <>
          <span className="hidden sm:inline">
            {t("project.breadcrumbEyebrow", { name: project.name, section: sectionLabel })}
          </span>
          <span className="sm:hidden">
            {section.id === "agents"
              ? t("project.mobileEyebrowAgent", { count: summary.agentCount })
              : section.id === "terminal"
                ? t("project.mobileEyebrowTerminal", { count: summary.terminalCount })
                : sectionLabel}
          </span>
        </>
      }
      mobileMeta={undefined}
      title={
        section.id === "agents" || section.id === "terminal" ? (
          <>
            <span className="sm:hidden">{project.name}</span>
            <span className="hidden sm:inline">
              {section.id === "agents" ? t("section.agents") : t("section.terminal")} instances
            </span>
          </>
        ) : section.id === "git" ? (
          t("section.gitStatus")
        ) : (
          sectionLabel
        )
      }
      variant="project"
    />
  );
}

type SummaryBadgeProps = {
  label: string;
  value: number | string;
};

function SummaryBadge({ label, value }: SummaryBadgeProps) {
  return <StatusPill label={label} tone="muted" value={value} />;
}

type AgentInstanceListProps = {
  projectName: string;
  sessions: AgentSession[];
  isLoading: boolean;
};

function AgentInstanceList({ projectName, sessions, isLoading }: AgentInstanceListProps) {
  const { t } = useT();
  if (isLoading) {
    return <p className="mt-5 text-sm text-slate-400">{t("project.loading")}</p>;
  }

  if (sessions.length === 0) {
    return (
      <div className="flex flex-1 min-h-0 flex-col items-center justify-start pt-6 lg:justify-center lg:pt-0">
        <div className="w-full lg:w-auto">
          <div className={`rounded-2xl p-4 text-center ${shellSurfaceClasses.dashed}`}>
            <p className="text-lg font-semibold text-slate-100">{t("project.noAgents")}</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">{t("project.noAgentsDesc")}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 grid gap-3 lg:grid-cols-2" aria-label="Agent instances">
      {sessions.map((session) => (
        <AgentInstanceRow key={session.id} projectName={projectName} session={session} />
      ))}
    </div>
  );
}

type AgentInstanceRowProps = {
  projectName: string;
  session: AgentSession;
};

function relativeTime(iso: string, t: TranslateFn): string {
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
  return new Date(iso).toLocaleDateString();
}

function AgentInstanceRow({ projectName, session }: AgentInstanceRowProps) {
  const { t } = useT();
  const providerTone = session.provider === "codex" ? "success" : "accent";
  const isClaude2 = session.provider === "claude2";
  return (
    <Link
      className="block"
      params={{ projectName, sessionId: session.id }}
      search={{ workspace: "agents" }}
      to={
        isClaude2
          ? "/projects/$projectName/agent-sessions/$sessionId/claude2"
          : "/projects/$projectName/agent-sessions/$sessionId"
      }
    >
      <SessionInstanceRow
        marker={
          <IconMarker tone={providerTone}>
            {session.provider === "codex" ? (
              <ShellIcon name="openai" />
            ) : session.provider === "claude2" ? (
              <ShellIcon name="anthropic" />
            ) : (
              <ShellIcon name="anthropic" />
            )}
          </IconMarker>
        }
        preview={session.lastAssistantMessage}
        statusTone={sessionStatusTone(session.status)}
        status={t(sessionStatusLabel(session.status))}
        subtitle={relativeTime(session.createdAt, t)}
        title={session.displayName}
      />
    </Link>
  );
}

type AgentSessionHistoryPanelProps = {
  projectName: string;
};

function AgentSessionHistoryPanel({ projectName }: AgentSessionHistoryPanelProps) {
  const { t } = useT();
  const navigate = useNavigate({ from: "/projects/$projectName" });
  const queryClient = useQueryClient();

  const history = useQuery({
    queryKey: ["projects", projectName, "agent-history"],
    queryFn: () => listAgentHistory(projectName),
  });

  const resumeSession = useMutation({
    mutationFn: (claudeSessionId: string) =>
      createAgentSession(projectName, "claude2", { claudeSessionId }),
    onSuccess: async (data) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["projects", projectName, "agent-sessions"] }),
        queryClient.invalidateQueries({ queryKey: ["projects", projectName, "agent-history"] }),
      ]);
      await navigate({
        to: "/projects/$projectName/agent-sessions/$sessionId/claude2",
        params: { projectName, sessionId: data.session.id },
      });
    },
  });

  const handleEntryClick = (entry: AgentHistoryEntry) => {
    if (entry.hasActiveSession && entry.activeSessionId) {
      void navigate({
        to: "/projects/$projectName/agent-sessions/$sessionId/claude2",
        params: { projectName, sessionId: entry.activeSessionId },
      });
    } else {
      resumeSession.mutate(entry.claudeSessionId);
    }
  };

  const entries = history.data?.entries ?? [];
  const isResuming = resumeSession.isPending;

  return (
    <>
      <div className="mt-6 flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-100">{t("project.historyTitle")}</h3>
          {entries.length > 0 ? (
            <p className="mt-1 text-xs leading-5 text-slate-500">
              {t("project.historySubtitle", { count: entries.length })}
            </p>
          ) : null}
        </div>
      </div>

      {history.isLoading ? (
        <div className="mt-3 grid gap-2" aria-hidden="true">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : entries.length === 0 ? (
        <div
          className={`mt-3 flex min-w-0 items-start gap-3 rounded-xl p-3 ${shellSurfaceClasses.inset}`}
        >
          <IconMarker size="sm" tone="muted">
            H
          </IconMarker>
          <p className="min-w-0 text-sm leading-6 text-slate-400">
            {history.error ? history.error.message : t("project.historyEmptyDesc")}
          </p>
        </div>
      ) : (
        <div className="mt-3 divide-y divide-white/5">
          {entries.map((entry) => (
            <AgentHistoryRow
              key={entry.claudeSessionId}
              entry={entry}
              isResuming={isResuming}
              onClick={handleEntryClick}
            />
          ))}
        </div>
      )}
    </>
  );
}

type AgentHistoryRowProps = {
  entry: AgentHistoryEntry;
  isResuming: boolean;
  onClick: (entry: AgentHistoryEntry) => void;
};

function AgentHistoryRow({ entry, isResuming, onClick }: AgentHistoryRowProps) {
  const { t } = useT();
  const displayTitle = entry.title ?? entry.firstMessage ?? entry.claudeSessionId.slice(0, 8);
  const displayTime = entry.lastActivityAt
    ? relativeTime(entry.lastActivityAt, t)
    : entry.startedAt
      ? relativeTime(entry.startedAt, t)
      : "";

  return (
    <button
      className={`block w-full min-w-0 cursor-pointer px-1 py-3 text-left transition-colors interactive-row ${isResuming ? "pointer-events-none opacity-60" : ""}`}
      onClick={() => onClick(entry)}
      type="button"
    >
      <div className="flex min-w-0 items-start gap-3">
        <IconMarker tone={entry.hasActiveSession ? "success" : "accent"}>
          <ShellIcon name="anthropic" />
        </IconMarker>
        <div className="min-w-0 flex-1">
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
            <div className="min-w-0">
              <h4 className="truncate text-sm font-medium text-slate-100">{displayTitle}</h4>
              <p className="mt-0.5 text-xs text-slate-500">{displayTime}</p>
            </div>
            <div className="flex items-center gap-2">
              <StatusPill
                tone="muted"
                value={t("project.historyTurns", { count: entry.messageCount })}
              />
              {entry.hasActiveSession ? (
                <StatusPill tone="success" value={t("project.historyActive")} />
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}

type SessionInstanceRowProps = {
  actions?: ReactNode;
  marker: ReactNode;
  preview?: string;
  status: ReactNode;
  statusTone: ShellTone;
  subtitle?: ReactNode;
  title: ReactNode;
};

function SessionInstanceRow({
  actions,
  marker,
  preview,
  status,
  statusTone,
  subtitle,
  title,
}: SessionInstanceRowProps) {
  return (
    <article
      className={`min-w-0 rounded-[1.25rem] p-3 transition sm:p-4 interactive-row ${shellSurfaceClasses.raised} ${shellSurfaceClasses.raisedHover}`}
    >
      <div className="flex min-w-0 items-start gap-3">
        {marker}
        <div className="min-w-0 flex-1">
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
            <div className="min-w-0">
              <h4 className="truncate font-semibold text-slate-100">{title}</h4>
              {subtitle ? (
                <p className="mt-1 break-all font-mono text-xs text-slate-500">{subtitle}</p>
              ) : null}
              {preview ? (
                <p className="mt-1 line-clamp-2 border-l-2 border-emerald-400/25 pl-2.5 text-xs leading-5 text-slate-400 italic">
                  {preview}
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <StatusPill tone={statusTone} value={status} />
              {actions}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function sessionStatusTone(status: AgentSession["status"] | TerminalSession["status"]) {
  if (status === "running") {
    return "success";
  }

  if (status === "idle") {
    return "warning";
  }

  if (status === "error") {
    return "danger";
  }

  return "muted";
}

type TerminalPanelProps = {
  confirm: ReturnType<typeof useConfirm>["confirm"];
  projectName: string;
  sessions: TerminalSession[];
  isLoading: boolean;
  isCreating: boolean;
  isClosing: boolean;
  createError: Error | null;
  closeError: Error | null;
  onCreate: () => void;
  onClose: (sessionId: string) => void;
};

function TerminalPanel({
  confirm,
  projectName,
  sessions,
  isLoading,
  isCreating,
  isClosing,
  createError,
  closeError,
  onCreate,
  onClose,
}: TerminalPanelProps) {
  const { t } = useT();
  return (
    <ShellPanel
      className="flex flex-col px-3.5 pt-4 sm:px-5 lg:px-6 lg:py-5"
      density="compact"
      docked
    >
      <div className="grid gap-2 sm:hidden" aria-label="Create Terminal instance mobile">
        <CreateButton
          disabled={isCreating}
          tone="accent"
          onClick={onCreate}
          className="py-3 sm:py-1.5 text-sm sm:text-xs"
        >
          <ShellIcon name="terminal" />
          {isCreating ? t("project.creating") : t("project.newTerminalMobile")}
        </CreateButton>
      </div>
      <div className="mt-4 flex min-w-0 items-center justify-between gap-3 sm:mt-0">
        <h3 className="text-base font-semibold">{t("project.activeInstances")}</h3>
        <span className="text-xs text-slate-400">
          {t("project.agentCount", { count: sessions.length })}
        </span>
      </div>
      <ErrorText error={createError ?? closeError} />
      {isClosing ? (
        <p className="mt-3 text-sm text-amber-200">{t("project.closingTerminal")}</p>
      ) : null}
      <TerminalInstanceList
        confirm={confirm}
        projectName={projectName}
        sessions={sessions}
        isLoading={isLoading}
        onClose={onClose}
      />
    </ShellPanel>
  );
}

type TerminalInstanceListProps = {
  confirm: ReturnType<typeof useConfirm>["confirm"];
  projectName: string;
  sessions: TerminalSession[];
  isLoading: boolean;
  onClose: (sessionId: string) => void;
};

function TerminalInstanceList({
  confirm,
  projectName,
  sessions,
  isLoading,
  onClose,
}: TerminalInstanceListProps) {
  const { t } = useT();
  if (isLoading) {
    return <p className="mt-5 text-sm text-slate-400">{t("project.loading")}</p>;
  }

  if (sessions.length === 0) {
    return (
      <div className="flex flex-1 min-h-0 flex-col items-center justify-start pt-6 lg:justify-center lg:pt-0">
        <div className="w-full lg:w-auto">
          <div className={`rounded-2xl p-4 text-center ${shellSurfaceClasses.dashed}`}>
            <p className="text-lg font-semibold text-slate-100">{t("project.noTerminals")}</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">{t("project.noTerminalsDesc")}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="mt-4 grid max-h-[28rem] gap-3 overflow-y-auto pr-1 lg:grid-cols-2"
      aria-label="Terminal instances"
    >
      {sessions.map((session) => (
        <TerminalInstanceRow
          key={session.id}
          confirm={confirm}
          projectName={projectName}
          session={session}
          onClose={() => onClose(session.id)}
        />
      ))}
    </div>
  );
}

type TerminalInstanceRowProps = {
  confirm: ReturnType<typeof useConfirm>["confirm"];
  projectName: string;
  session: TerminalSession;
  onClose: () => void;
};

function TerminalInstanceRow({ confirm, projectName, session, onClose }: TerminalInstanceRowProps) {
  const { t } = useT();
  return (
    <Link
      aria-label={`Open stream ${session.displayName}`}
      className="block"
      params={{ projectName, sessionId: session.id }}
      search={{ fromAgentSession: undefined }}
      to="/projects/$projectName/terminal-sessions/$sessionId"
    >
      <SessionInstanceRow
        actions={
          <ActionButton
            tone="danger"
            onClick={async (e) => {
              e.preventDefault();
              const ok = await confirm({
                cancelLabel: t("cancel"),
                confirmLabel: t("session.close"),
                message: t("project.closeTerminalConfirm"),
                title: t("session.close"),
                tone: "danger",
              });
              if (ok) onClose();
            }}
          >
            {t("session.close")}
          </ActionButton>
        }
        marker={
          <IconMarker tone="success">
            <ShellIcon name="terminal" />
          </IconMarker>
        }
        statusTone={sessionStatusTone(session.status)}
        status={t(sessionStatusLabel(session.status))}
        subtitle={session.id}
        title={session.displayName}
      />
    </Link>
  );
}

type SectionDetailProps = {
  filesPath: string;
  onDeepDetailChange: (open: boolean) => void;
  onFilesPathChange: (path: string) => void;
  onMobileFilePreviewChange: (open: boolean) => void;
  projectName: string;
  section: (typeof consoleSections)[number];
};

function SectionDetail({
  filesPath,
  onDeepDetailChange,
  onFilesPathChange,
  onMobileFilePreviewChange,
  projectName,
  section,
}: SectionDetailProps) {
  const isFiles = section.id === "files";
  const isGit = section.id === "git";

  return (
    <ShellPanel className="overflow-hidden !p-0" density="compact" docked>
      {isGit ? (
        <GitDiffPanel projectName={projectName} onDeepDetailChange={onDeepDetailChange} />
      ) : null}
      {isFiles ? (
        <FilesPanel
          initialPath={filesPath}
          projectName={projectName}
          onPathChange={onFilesPathChange}
          onMobilePreviewChange={onMobileFilePreviewChange}
        />
      ) : null}
    </ShellPanel>
  );
}

type CreateButtonProps = {
  children: ReactNode;
  className?: string;
  disabled: boolean;
  tone?: "accent" | "default";
  onClick: () => void;
};

function CreateButton({
  children,
  className,
  disabled,
  onClick,
  tone = "default",
}: CreateButtonProps) {
  return (
    <ActionButton className={className} disabled={disabled} tone={tone} onClick={onClick}>
      {children}
    </ActionButton>
  );
}

type ErrorTextProps = {
  error: Error | null;
};

function ErrorText({ error }: ErrorTextProps) {
  if (!error) {
    return null;
  }

  return <p className="mt-3 text-sm text-rose-200">{error.message}</p>;
}
