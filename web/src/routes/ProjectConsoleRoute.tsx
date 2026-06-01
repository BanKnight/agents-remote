import type { AgentProvider, AgentSession, Project, TerminalSession } from "@agents-remote/shared";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode, Ref } from "react";
import { useEffect, useState } from "react";
import {
  closeAgentSession,
  closeTerminalSession,
  createAgentSession,
  createTerminalSession,
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

const AnthropicIcon = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5528h3.7442L10.5363 3.5409Zm-.3712 10.2232 2.2914-5.9456 2.2914 5.9456Z" />
  </svg>
);

const OpenAIIcon = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" />
  </svg>
);

const TerminalIcon = () => (
  <svg
    className="h-5 w-5"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M5 8l4 4-4 4" />
    <path d="M12 16h6" />
  </svg>
);

export function ProjectConsoleRoute() {
  const { t } = useT();
  const { projectName } = useParams({ from: "/projects/$projectName" });
  const project = useQuery({
    queryKey: ["projects", projectName],
    queryFn: () => getProject(projectName),
  });

  if (project.isLoading) {
    return <ConsoleFrame title={t("project.loading")} subtitle={t("project.loadingDesc")} />;
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
  const invalidateSessions = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["projects"] }),
      queryClient.invalidateQueries({ queryKey: ["projects", project.name] }),
      queryClient.invalidateQueries({ queryKey: ["projects", project.name, "agent-sessions"] }),
      queryClient.invalidateQueries({ queryKey: ["projects", project.name, "terminal-sessions"] }),
    ]);
  };
  const createAgent = useMutation({
    mutationFn: (provider: AgentProvider) => createAgentSession(project.name, provider),
    onSuccess: invalidateSessions,
  });
  const createTerminal = useMutation({
    mutationFn: () => createTerminalSession(project.name),
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
                  onClick={() => createAgent.mutate("claude")}
                >
                  <AnthropicIcon />
                  {t("project.createClaude")}
                </CreateButton>
                <CreateButton
                  disabled={createAgent.isPending}
                  onClick={() => createAgent.mutate("codex")}
                >
                  <OpenAIIcon />
                  {t("project.createCodex")}
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
                  onClick={() => createTerminal.mutate()}
                >
                  <TerminalIcon />
                  {createTerminal.isPending ? t("project.creating") : t("project.newTerminal")}
                </CreateButton>
              </div>
            ) : activeSection === "files" || activeSection === "git" ? null : undefined
          }
        />
      </div>

      {activeSection === "agents" ? (
        <AgentPanel
          projectName={project.name}
          sessions={agentSessions.data?.sessions ?? []}
          isLoading={agentSessions.isLoading}
          isCreating={createAgent.isPending}
          createError={createAgent.error}
          closeError={closeAgent.error}
          onCreate={(provider) => createAgent.mutate(provider)}
        />
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
          onCreate={() => createTerminal.mutate()}
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
        {t(
          section.id === "agents"
            ? "section.markerAgents"
            : section.id === "files"
              ? "section.markerFiles"
              : section.id === "git"
                ? "section.markerGit"
                : "section.markerTerminal",
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

type AgentPanelProps = {
  projectName: string;
  sessions: AgentSession[];
  isLoading: boolean;
  isCreating: boolean;
  createError: Error | null;
  closeError: Error | null;
  onCreate: (provider: AgentProvider) => void;
};

function AgentPanel({
  projectName,
  sessions,
  isLoading,
  isCreating,
  createError,
  closeError,
  onCreate,
}: AgentPanelProps) {
  const { t } = useT();
  return (
    <ShellPanel className="px-3.5 pt-4 sm:px-5 lg:px-6 lg:py-5" density="compact" docked>
      <div className="grid grid-cols-2 gap-2 sm:hidden" aria-label="Create Agent instance mobile">
        <CreateButton
          disabled={isCreating}
          tone="accent"
          onClick={() => onCreate("claude")}
          className="py-3 sm:py-1.5 text-sm sm:text-xs"
        >
          <AnthropicIcon />
          {t("project.createClaude")}
        </CreateButton>
        <CreateButton
          disabled={isCreating}
          onClick={() => onCreate("codex")}
          className="py-3 sm:py-1.5 text-sm sm:text-xs"
        >
          <OpenAIIcon />
          {t("project.createCodex")}
        </CreateButton>
      </div>
      <div className="mt-4 flex min-w-0 items-center justify-between gap-3 sm:mt-0">
        <h3 className="text-base font-semibold">{t("project.activeInstances")}</h3>
        <span className="text-xs text-slate-400">
          {t("project.agentCount", { count: sessions.length })}
        </span>
      </div>
      <ErrorText error={createError ?? closeError} />
      <AgentInstanceList projectName={projectName} sessions={sessions} isLoading={isLoading} />
    </ShellPanel>
  );
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
      <div className={`mt-4 rounded-2xl p-4 text-center ${shellSurfaceClasses.dashed}`}>
        <p className="text-lg font-semibold text-slate-100">{t("project.noAgents")}</p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">
          {t("project.noAgentsDesc")}
        </p>
      </div>
    );
  }

  return (
    <div
      className="mt-4 grid max-h-[28rem] gap-3 overflow-y-auto pr-1 lg:grid-cols-2"
      aria-label="Agent instances"
    >
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
  return (
    <Link
      className="block"
      params={{ projectName, sessionId: session.id }}
      search={{ workspace: "agents" }}
      to="/projects/$projectName/agent-sessions/$sessionId"
    >
      <SessionInstanceRow
        marker={
          <IconMarker tone={providerTone}>
            {session.provider === "codex" ? <OpenAIIcon /> : <AnthropicIcon />}
          </IconMarker>
        }
        statusTone={sessionStatusTone(session.status)}
        status={t(sessionStatusLabel(session.status))}
        subtitle={relativeTime(session.createdAt, t)}
        title={session.displayName}
      />
    </Link>
  );
}

function _AgentHistoryPanel() {
  const { t } = useT();
  return (
    <ShellPanel
      className={`mt-4 rounded-[1.25rem] ${shellSurfaceClasses.raised}`}
      density="compact"
      aria-label="Session history"
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-100">Session history</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">{t("project.historyFuture")}</p>
        </div>
        <StatusPill tone="muted" value={t("project.historyStaged")} />
      </div>
      <div
        className={`mt-3 flex min-w-0 items-start gap-3 rounded-xl p-3 ${shellSurfaceClasses.inset}`}
      >
        <IconMarker size="sm" tone="muted">
          H
        </IconMarker>
        <p className="min-w-0 text-sm leading-6 text-slate-400">{t("project.historyDesc")}</p>
      </div>
    </ShellPanel>
  );
}

type SessionInstanceRowProps = {
  actions?: ReactNode;
  marker: ReactNode;
  status: ReactNode;
  statusTone: ShellTone;
  subtitle?: ReactNode;
  title: ReactNode;
};

function SessionInstanceRow({
  actions,
  marker,
  status,
  statusTone,
  subtitle,
  title,
}: SessionInstanceRowProps) {
  return (
    <article
      className={`min-w-0 rounded-[1.25rem] p-3 transition sm:p-4 ${shellSurfaceClasses.raised} ${shellSurfaceClasses.raisedHover}`}
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
    <ShellPanel className="px-3.5 pt-4 sm:px-5 lg:px-6 lg:py-5" density="compact" docked>
      <div className="grid gap-2 sm:hidden" aria-label="Create Terminal instance mobile">
        <CreateButton
          disabled={isCreating}
          tone="accent"
          onClick={onCreate}
          className="py-3 sm:py-1.5 text-sm sm:text-xs"
        >
          <TerminalIcon />
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
        projectName={projectName}
        sessions={sessions}
        isLoading={isLoading}
        onClose={onClose}
      />
    </ShellPanel>
  );
}

type TerminalInstanceListProps = {
  projectName: string;
  sessions: TerminalSession[];
  isLoading: boolean;
  onClose: (sessionId: string) => void;
};

function TerminalInstanceList({
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
      <div className={`mt-4 rounded-2xl p-4 text-center ${shellSurfaceClasses.dashed}`}>
        <p className="text-lg font-semibold text-slate-100">{t("project.noTerminals")}</p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">
          {t("project.noTerminalsDesc")}
        </p>
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
          projectName={projectName}
          session={session}
          onClose={() => onClose(session.id)}
        />
      ))}
    </div>
  );
}

type TerminalInstanceRowProps = {
  projectName: string;
  session: TerminalSession;
  onClose: () => void;
};

function TerminalInstanceRow({ projectName, session, onClose }: TerminalInstanceRowProps) {
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
            onClick={(e) => {
              e.preventDefault();
              if (window.confirm(t("project.closeTerminalConfirm"))) {
                onClose();
              }
            }}
          >
            {t("session.close")}
          </ActionButton>
        }
        marker={
          <IconMarker tone="success">
            <TerminalIcon />
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
