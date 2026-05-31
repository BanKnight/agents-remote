import type {
  AgentProvider,
  AgentSession,
  GitDiffFileStatus,
  GitDiffFileSummary,
  GitDiffScope,
  GitFileDiffResponse,
  Project,
  ProjectFileEntry,
  ProjectFilePreviewResponse,
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
  getProject,
  getProjectGitFileDiff,
  listAgentSessions,
  listProjectFiles,
  listProjectGitDiff,
  listTerminalSessions,
  previewProjectFile,
} from "../api/client";
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
  ListRow,
  StatusPill,
  shellSurfaceClasses,
  type ShellTone,
} from "../components/shell/shell-primitives";

export function ProjectConsoleRoute() {
  const { projectName } = useParams({ from: "/projects/$projectName" });
  const project = useQuery({
    queryKey: ["projects", projectName],
    queryFn: () => getProject(projectName),
  });

  if (project.isLoading) {
    return <ConsoleFrame title="Loading Project..." subtitle="Resolving Project context." />;
  }

  if (project.error instanceof Error) {
    return (
      <ConsoleFrame title="Project unavailable" subtitle={project.error.message}>
        <Link className="text-sm font-semibold text-cyan-200 underline underline-offset-4" to="/">
          Back to Projects
        </Link>
      </ConsoleFrame>
    );
  }

  if (!project.data) {
    return <ConsoleFrame title="Project unavailable" subtitle="No Project data returned." />;
  }

  return <ProjectConsole project={project.data.project} />;
}

type ConsoleFrameProps = {
  children?: ReactNode;
  subtitle: string;
  title: string;
};

function ConsoleFrame({ children, subtitle, title }: ConsoleFrameProps) {
  return (
    <main className="flex min-h-dvh items-center justify-center overflow-x-hidden bg-[#080b10] px-4 text-slate-100">
      <section
        className={`w-full max-w-md rounded-[2rem] p-6 shadow-2xl shadow-black/30 ${shellSurfaceClasses.workspace}`}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">
          Agents Remote
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
      bottomNavigation={
        !resourceDeepDetailOpen && !hiddenOnMobileResourceDetail ? (
          <ProjectSecondaryBottomNav
            activeSection={activeSection}
            onSelectSection={selectWorkspace}
          />
        ) : null
      }
      sidebar={
        <ProjectSecondaryNav
          activeSection={activeSection}
          project={project}
          onSelectSection={selectWorkspace}
        />
      }
      variant="project"
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
                  + Claude
                </CreateButton>
                <CreateButton
                  disabled={createAgent.isPending}
                  onClick={() => createAgent.mutate("codex")}
                >
                  + Codex
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
                  {createTerminal.isPending ? "Creating..." : "New Terminal"}
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
          onClose={(sessionId) => closeAgent.mutate(sessionId)}
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
          projectBranch={project.gitBranch}
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
  return (
    <ShellSidebar display="flex">
      <ProjectShellNavigation
        activeItemId={activeSection}
        items={projectNavigationItems(activeSection)}
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
  return (
    <ProjectShellBottomNavigation
      ref={ref}
      activeItemId={activeSection}
      items={projectNavigationItems(activeSection)}
      onSelectItem={onSelectSection}
    />
  );
}

function projectNavigationItems(_activeSection: ConsoleSection) {
  return consoleSections.map((section) => ({
    id: section.id,
    label: section.label,
    mobileLabel: shortSectionLabel(section.id),
    marker: (
      <IconMarker size="sm" tone="accent">
        {sectionMarker(section.id)}
      </IconMarker>
    ),
  }));
}

function sectionMarker(section: ConsoleSection) {
  switch (section) {
    case "agents":
      return "A";
    case "files":
      return "F";
    case "git":
      return "G";
    case "terminal":
      return "T";
  }
}

function shortSectionLabel(section: ConsoleSection) {
  return section === "agents" ? "Agent" : sectionForId(section).label;
}

type WorkspaceHeaderProps = {
  actions?: ReactNode;
  project: Project;
  section: ConsoleSectionDefinition;
  summary: ReturnType<typeof projectSummary>;
};

function WorkspaceHeader({ actions, project, section, summary }: WorkspaceHeaderProps) {
  const fallbackActions = (
    <div className="hidden grid-cols-3 gap-2 sm:grid">
      <SummaryBadge label="Agents" value={summary.agentCount} />
      <SummaryBadge label="Terminals" value={summary.terminalCount} />
      <SummaryBadge label="Runtime" value={summary.runtimeStatus} />
    </div>
  );

  return (
    <ShellHeaderSurface
      actions={actions !== undefined ? actions : fallbackActions}
      eyebrow={
        <>
          <span className="hidden sm:inline">
            Project / {project.name} / {section.label}
          </span>
          <span className="sm:hidden">
            {section.id === "agents"
              ? `Agent instances · ${summary.agentCount} active`
              : section.id === "terminal"
                ? `Terminal instances · ${summary.terminalCount} active`
                : section.label}
          </span>
        </>
      }
      mobileMeta={undefined}
      title={
        section.id === "agents" || section.id === "terminal" ? (
          <>
            <span className="sm:hidden">{project.name}</span>
            <span className="hidden sm:inline">
              {section.id === "agents" ? "Agent instances" : "Terminal instances"}
            </span>
          </>
        ) : section.id === "git" ? (
          "Read-only status & diff"
        ) : (
          section.label
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
  onClose: (sessionId: string) => void;
};

function AgentPanel({
  projectName,
  sessions,
  isLoading,
  isCreating,
  createError,
  closeError,
  onCreate,
  onClose,
}: AgentPanelProps) {
  return (
    <ShellPanel className="px-3.5 pt-4 sm:px-5 lg:px-6 lg:py-5" density="compact" docked>
      <div className="grid grid-cols-2 gap-2 sm:hidden" aria-label="Create Agent instance mobile">
        <CreateButton disabled={isCreating} tone="accent" onClick={() => onCreate("claude")}>
          + Claude
        </CreateButton>
        <CreateButton disabled={isCreating} onClick={() => onCreate("codex")}>
          + Codex
        </CreateButton>
      </div>
      <div className="mt-4 flex min-w-0 items-center justify-between gap-3 sm:mt-0">
        <h3 className="text-base font-semibold">Active instances</h3>
        <span className="text-xs text-slate-400">{sessions.length} current</span>
      </div>
      <ErrorText error={createError ?? closeError} />
      <AgentInstanceList
        projectName={projectName}
        sessions={sessions}
        isLoading={isLoading}
        onClose={onClose}
      />
    </ShellPanel>
  );
}

type AgentInstanceListProps = {
  projectName: string;
  sessions: AgentSession[];
  isLoading: boolean;
  onClose: (sessionId: string) => void;
};

function AgentInstanceList({ projectName, sessions, isLoading, onClose }: AgentInstanceListProps) {
  if (isLoading) {
    return <p className="mt-5 text-sm text-slate-400">Loading Agent instances...</p>;
  }

  if (sessions.length === 0) {
    return (
      <div className={`mt-4 rounded-2xl p-4 text-center ${shellSurfaceClasses.dashed}`}>
        <p className="text-lg font-semibold text-slate-100">No Agent instances yet</p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">
          Create a Claude or Codex session to open a project-scoped Agent stream.
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
        <AgentInstanceRow
          key={session.id}
          projectName={projectName}
          session={session}
          onClose={() => onClose(session.id)}
        />
      ))}
    </div>
  );
}

type AgentInstanceRowProps = {
  projectName: string;
  session: AgentSession;
  onClose: () => void;
};

function AgentInstanceRow({ projectName, session, onClose }: AgentInstanceRowProps) {
  return (
    <Link
      className="block"
      params={{ projectName, sessionId: session.id }}
      search={{ workspace: "agents" }}
      to="/projects/$projectName/agent-sessions/$sessionId"
    >
      <SessionInstanceRow
        actions={
          <ActionButton
            tone="danger"
            onClick={(e) => {
              e.preventDefault();
              if (window.confirm("Close this session? The running process will be terminated.")) {
                onClose();
              }
            }}
          >
            Close
          </ActionButton>
        }
        marker={
          <IconMarker tone={session.provider === "codex" ? "success" : "accent"}>
            {providerMarker(session.provider)}
          </IconMarker>
        }
        statusTone={sessionStatusTone(session.status)}
        status={sessionStatusLabel(session.status)}
        subtitle={`${providerLabel(session.provider)} · ${session.id}`}
        title={session.displayName}
      />
    </Link>
  );
}

function _AgentHistoryPanel() {
  return (
    <ShellPanel
      className={`mt-4 rounded-[1.25rem] ${shellSurfaceClasses.raised}`}
      density="compact"
      aria-label="Session history"
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-100">Session history</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Future restore will live here when provider history is available.
          </p>
        </div>
        <StatusPill tone="muted" value="Staged" />
      </div>
      <div
        className={`mt-3 flex min-w-0 items-start gap-3 rounded-xl p-3 ${shellSurfaceClasses.inset}`}
      >
        <IconMarker size="sm" tone="muted">
          H
        </IconMarker>
        <p className="min-w-0 text-sm leading-6 text-slate-400">
          Current Agent instances stay above. Provider-native history and resume are not mixed into
          the running session list until a real adapter exposes them.
        </p>
      </div>
    </ShellPanel>
  );
}

type SessionInstanceRowProps = {
  actions: ReactNode;
  marker: ReactNode;
  status: ReactNode;
  statusTone: ShellTone;
  subtitle: ReactNode;
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
              <p className="mt-1 break-all font-mono text-xs text-slate-500">{subtitle}</p>
            </div>
            <StatusPill tone={statusTone} value={status} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">{actions}</div>
        </div>
      </div>
    </article>
  );
}

function providerMarker(provider: AgentProvider) {
  return provider === "codex" ? "CX" : "CL";
}

function providerLabel(provider: AgentProvider) {
  return provider === "codex" ? "Codex" : "Claude";
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
  return (
    <ShellPanel className="px-3.5 pt-4 sm:px-5 lg:px-6 lg:py-5" density="compact" docked>
      <div className="grid gap-2 sm:hidden" aria-label="Create Terminal instance mobile">
        <CreateButton disabled={isCreating} tone="accent" onClick={onCreate}>
          {isCreating ? "Creating..." : "+ Terminal"}
        </CreateButton>
      </div>
      <div className="mt-4 flex min-w-0 items-center justify-between gap-3 sm:mt-0">
        <h3 className="text-base font-semibold">Active instances</h3>
        <span className="text-xs text-slate-400">{sessions.length} current</span>
      </div>
      <ErrorText error={createError ?? closeError} />
      {isClosing ? (
        <p className="mt-3 text-sm text-amber-200">Closing Terminal session...</p>
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
  if (isLoading) {
    return <p className="mt-5 text-sm text-slate-400">Loading Terminal instances...</p>;
  }

  if (sessions.length === 0) {
    return (
      <div className={`mt-4 rounded-2xl p-4 text-center ${shellSurfaceClasses.dashed}`}>
        <p className="text-lg font-semibold text-slate-100">No Terminal instances yet</p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">
          Create a Terminal to open a focused project shell detail.
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
              if (window.confirm("Close this Terminal? The running shell will be terminated.")) {
                onClose();
              }
            }}
          >
            Close
          </ActionButton>
        }
        marker={<IconMarker tone="success">T</IconMarker>}
        statusTone={sessionStatusTone(session.status)}
        status={sessionStatusLabel(session.status)}
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
  projectBranch?: string;
  projectName: string;
  section: (typeof consoleSections)[number];
};

function SectionDetail({
  filesPath,
  onDeepDetailChange,
  onFilesPathChange,
  onMobileFilePreviewChange,
  projectBranch,
  projectName,
  section,
}: SectionDetailProps) {
  const isFiles = section.id === "files";
  const isGit = section.id === "git";

  return (
    <ShellPanel
      className="overflow-hidden sm:rounded-[2rem] lg:rounded-none"
      density="compact"
      docked
    >
      {isGit ? (
        <GitDiffPanel
          projectBranch={projectBranch}
          projectName={projectName}
          onDeepDetailChange={onDeepDetailChange}
        />
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

function MobileDetailHeader({ backLabel, label, onBack, title }: MobileDetailHeaderProps) {
  return (
    <div className={`min-w-0 rounded-2xl p-3 sm:hidden ${shellSurfaceClasses.raised}`}>
      <ActionButton tone="default" onClick={onBack}>
        ← {backLabel}
      </ActionButton>
      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">{label}</p>
      <h3 className="mt-1 break-all font-mono text-sm font-semibold text-slate-100">{title}</h3>
    </div>
  );
}

type ResourceToolbarProps = {
  actions?: ReactNode;
  eyebrow: string;
  meta?: ReactNode;
  title: ReactNode;
};

function _ResourceToolbar({ actions, eyebrow, meta, title }: ResourceToolbarProps) {
  return (
    <div className={`min-w-0 rounded-2xl px-3 py-2.5 ${shellSurfaceClasses.inset}`}>
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{eyebrow}</p>
          <div className="mt-1 min-w-0 truncate font-mono text-sm text-slate-100">{title}</div>
          {meta ? <div className="mt-2 min-w-0 text-xs text-slate-400">{meta}</div> : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap justify-start gap-1.5 sm:justify-end">
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}

type ResourceSplitLayoutProps = {
  detail: ReactNode;
  list: ReactNode;
};

function _ResourceSplitLayout({ detail, list }: ResourceSplitLayoutProps) {
  return (
    <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]">
      {list}
      {detail}
    </div>
  );
}

type ResourceStatePanelProps = {
  children?: ReactNode;
  message?: ReactNode;
  title?: ReactNode;
  tone?: "danger" | "dashed" | "inset" | "warning";
};

function ResourceStatePanel({
  children,
  message,
  title,
  tone = "dashed",
}: ResourceStatePanelProps) {
  const isCompact = tone === "inset" || tone === "danger" || tone === "warning";
  const surfaceClass = shellSurfaceClasses[tone];

  return (
    <div
      className={`min-w-0 rounded-2xl p-4 ${isCompact ? "" : "text-center sm:p-6"} ${surfaceClass}`}
    >
      {title ? (
        <p className={`font-semibold ${tone === "danger" ? "text-rose-100" : "text-slate-100"}`}>
          {title}
        </p>
      ) : null}
      {message ? (
        <p
          className={`mt-2 text-sm leading-6 ${tone === "danger" ? "text-rose-200/80" : tone === "warning" ? "text-amber-100" : "text-slate-400"}`}
        >
          {message}
        </p>
      ) : null}
      {children}
    </div>
  );
}

type MobileDetailHeaderProps = {
  backLabel: string;
  label: string;
  onBack: () => void;
  title: string;
};

function useMediaQuery(query: string) {
  const getMatches = () => window.matchMedia?.(query).matches ?? false;
  const [matches, setMatches] = useState(getMatches);

  useEffect(() => {
    const media = window.matchMedia?.(query);

    if (!media) {
      setMatches(false);
      return;
    }

    const handleChange = () => setMatches(media.matches);

    handleChange();
    media.addEventListener?.("change", handleChange);

    return () => media.removeEventListener?.("change", handleChange);
  }, [query]);

  return matches;
}

type SelectedGitFile = {
  path: string;
  scope: GitDiffScope;
};

type GitDiffPanelProps = {
  onDeepDetailChange: (open: boolean) => void;
  projectBranch?: string;
  projectName: string;
};

function GitDiffPanel({ onDeepDetailChange, projectBranch, projectName }: GitDiffPanelProps) {
  const showDesktopGitLayout = useMediaQuery("(min-width: 640px)");
  const [selectedFile, setSelectedFile] = useState<SelectedGitFile | undefined>();
  const diff = useQuery({
    queryKey: ["projects", projectName, "git", "diff"],
    queryFn: () => listProjectGitDiff(projectName),
  });
  const fileDiff = useQuery({
    enabled: selectedFile !== undefined,
    queryKey: ["projects", projectName, "git", "diff", selectedFile?.scope, selectedFile?.path],
    queryFn: () =>
      getProjectGitFileDiff(
        projectName,
        selectedFile?.scope ?? "worktree",
        selectedFile?.path ?? "",
      ),
  });

  useEffect(() => {
    onDeepDetailChange(selectedFile !== undefined);
    return () => onDeepDetailChange(false);
  }, [onDeepDetailChange, selectedFile]);

  const clearDiff = () => setSelectedFile(undefined);
  const gitSummary =
    diff.data?.repository === true ? summarizeGitFiles(diff.data.files) : undefined;
  const changedFileCount = diff.data?.repository === true ? diff.data.files.length : undefined;

  const statusToolbar = (
    <GitStatusHeader
      projectBranch={projectBranch}
      projectName={projectName}
      fileCount={changedFileCount}
      onRetry={() => {
        setSelectedFile(undefined);
        void diff.refetch();
      }}
    />
  );

  const loadingState = diff.isLoading ? (
    <ResourceStatePanel tone="inset" message="Loading Git changes..." />
  ) : null;

  const errorState = diff.error ? (
    <ResourceStatePanel
      tone="danger"
      title="Unable to load Git changes."
      message={diff.error.message}
    />
  ) : null;

  const notRepositoryState =
    diff.data?.repository === false ? (
      <ResourceStatePanel
        title="Not a Git repository"
        message="This Project directory does not have Git metadata."
      />
    ) : null;

  const changedFileList =
    diff.data?.repository === true ? (
      <GitFileList
        files={diff.data.files}
        selectedFile={selectedFile}
        onSelectFile={setSelectedFile}
      />
    ) : null;

  const diffPanel = (
    <GitFileDiffPanel
      error={fileDiff.error}
      isLoading={fileDiff.isLoading}
      fileDiff={fileDiff.data}
    />
  );

  const mobileView =
    selectedFile !== undefined ? (
      <div className="grid gap-3 sm:hidden">
        <MobileDetailHeader
          label="Git diff"
          title={selectedFile.path}
          backLabel="Back to changed files"
          onBack={clearDiff}
        />
        {diffPanel}
      </div>
    ) : (
      <div className="sm:hidden">
        <GitWorkspaceSidebar statusCounts={gitSummary}>{changedFileList}</GitWorkspaceSidebar>
      </div>
    );

  return (
    <div className="mt-3 min-w-0">
      <div className="grid gap-3">
        {selectedFile === undefined ? (
          statusToolbar
        ) : (
          <div className="hidden sm:block">{statusToolbar}</div>
        )}
        {loadingState}
        {errorState}
        {notRepositoryState}
        {diff.data?.repository === true ? (
          showDesktopGitLayout ? (
            <GitWorkspaceLayout
              changedFileList={changedFileList}
              diffPanel={diffPanel}
              statusCounts={gitSummary}
            />
          ) : (
            mobileView
          )
        ) : null}
      </div>
    </div>
  );
}

type GitSummary = {
  added: number;
  deleted: number;
  modified: number;
  renamed: number;
  staged: number;
  worktree: number;
};

function summarizeGitFiles(files: GitDiffFileSummary[]): GitSummary {
  return files.reduce<GitSummary>(
    (summary, file) => ({
      ...summary,
      [file.scope]: summary[file.scope] + 1,
      [file.status]: summary[file.status] + 1,
    }),
    { added: 0, deleted: 0, modified: 0, renamed: 0, staged: 0, worktree: 0 },
  );
}

function GitStatusHeader({
  fileCount,
  onRetry,
  projectBranch,
  projectName,
}: {
  fileCount?: number;
  onRetry: () => void;
  projectBranch?: string;
  projectName: string;
}) {
  return (
    <div className={`min-w-0 rounded-2xl p-3 sm:p-4 ${shellSurfaceClasses.inset}`}>
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
            Project / {projectName} / Git
          </p>
          <p className="mt-1 text-lg font-semibold text-slate-100 sm:text-[1.35rem]">Git status</p>
          <p className="mt-1 text-sm text-slate-400">
            Worktree and staged changes are shown for inspection only.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <StatusPill
            tone="muted"
            value={`${projectBranch ?? "main"} · ${fileCount ?? 0} changed · read-only`}
          />
          <ActionButton tone="accent" onClick={onRetry}>
            Retry
          </ActionButton>
        </div>
      </div>
    </div>
  );
}

function _GitSummaryCards({ summary }: { summary: GitSummary | undefined }) {
  const cards = summary
    ? [
        { label: "modified", value: summary.modified, tone: "warning" as const },
        { label: "added", value: summary.added, tone: "success" as const },
        { label: "deleted", value: summary.deleted, tone: "danger" as const },
      ]
    : [];

  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {cards.length > 0 ? (
        cards.map((card) => (
          <div
            key={card.label}
            className={`rounded-[0.875rem] border px-3 py-2.5 ${summaryCardToneClasses[card.tone]}`}
          >
            <strong className="block text-lg font-semibold text-slate-100">{card.value}</strong>
            <span className="text-[0.65rem] uppercase tracking-[0.16em] text-slate-500">
              {card.label}
            </span>
          </div>
        ))
      ) : (
        <div className="rounded-[0.875rem] border border-slate-700/40 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-400 sm:col-span-3">
          Summary appears after Git changes load.
        </div>
      )}
    </div>
  );
}

function _GitFilterRow() {
  return (
    <div className="flex flex-wrap gap-2">
      <span className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-[0.68rem] font-semibold text-cyan-100">
        All
      </span>
      <span className="rounded-full border border-slate-700/60 bg-slate-950/70 px-3 py-1 text-[0.68rem] font-semibold text-slate-400">
        Modified
      </span>
      <span className="rounded-full border border-slate-700/60 bg-slate-950/70 px-3 py-1 text-[0.68rem] font-semibold text-slate-400">
        Added
      </span>
      <span className="rounded-full border border-slate-700/60 bg-slate-950/70 px-3 py-1 text-[0.68rem] font-semibold text-slate-400">
        Deleted
      </span>
    </div>
  );
}

const summaryCardToneClasses: Record<"success" | "warning" | "danger", string> = {
  success: "border-emerald-300/20 bg-emerald-300/10",
  warning: "border-amber-300/20 bg-amber-300/10",
  danger: "border-rose-300/20 bg-rose-300/10",
};

type GitFileListProps = {
  files: GitDiffFileSummary[];
  selectedFile: SelectedGitFile | undefined;
  onSelectFile: (file: SelectedGitFile) => void;
};

function GitFileList({ files, onSelectFile, selectedFile }: GitFileListProps) {
  if (files.length === 0) {
    return (
      <ResourceStatePanel
        title="No changes"
        message="Worktree and staged changes will appear here."
      />
    );
  }

  return (
    <div className="grid gap-1.5" aria-label="Git changed files">
      {files.map((file) => {
        const selected = selectedFile?.path === file.path && selectedFile.scope === file.scope;
        return (
          <button
            key={`${file.scope}:${file.path}`}
            className={`grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-[0.875rem] border px-3 py-2.5 text-left transition ${
              selected
                ? "border-cyan-300/60 bg-cyan-300/10"
                : "border-slate-700/40 bg-[#141b28]/72 hover:border-cyan-300/30 hover:bg-[#141b28]/92"
            }`}
            type="button"
            onClick={() => onSelectFile({ path: file.path, scope: file.scope })}
          >
            <IconMarker size="sm" tone={gitStatusTone(file.status)}>
              {statusShortLabel(file.status)}
            </IconMarker>
            <span className="min-w-0">
              <span className="block truncate font-mono text-[0.82rem] font-semibold text-slate-100">
                {file.path}
              </span>
              {file.previousPath ? (
                <span className="mt-0.5 block truncate font-mono text-[0.68rem] text-slate-500">
                  from {file.previousPath}
                </span>
              ) : (
                <span className="mt-0.5 block text-[0.68rem] uppercase tracking-[0.16em] text-slate-500">
                  {scopeLabel(file.scope)}
                </span>
              )}
            </span>
            <StatusPill tone={gitStatusTone(file.status)} value={statusLabel(file.status)} />
          </button>
        );
      })}
    </div>
  );
}

type GitFileDiffPanelProps = {
  error: Error | null;
  fileDiff: GitFileDiffResponse | undefined;
  isLoading: boolean;
};

function GitWorkspaceLayout({
  changedFileList,
  diffPanel,
  statusCounts,
}: {
  changedFileList: ReactNode;
  diffPanel: ReactNode;
  statusCounts: GitSummary | undefined;
}) {
  return (
    <section className="grid min-h-0 gap-3 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]">
      <aside className="grid min-h-0 gap-3">
        <GitWorkspaceSidebar statusCounts={statusCounts}>{changedFileList}</GitWorkspaceSidebar>
      </aside>
      {diffPanel}
    </section>
  );
}

function GitWorkspaceSidebar({
  children,
  statusCounts,
}: {
  children: ReactNode;
  statusCounts: GitSummary | undefined;
}) {
  return (
    <div className={`grid min-h-0 gap-3 rounded-2xl p-3 ${shellSurfaceClasses.inset}`}>
      <div className="grid gap-2 sm:grid-cols-3">
        <GitTinyMetric label="modified" value={statusCounts?.modified ?? 0} tone="warning" />
        <GitTinyMetric label="added" value={statusCounts?.added ?? 0} tone="success" />
        <GitTinyMetric label="deleted" value={statusCounts?.deleted ?? 0} tone="danger" />
      </div>
      <div className="flex flex-wrap gap-2">
        <GitScopeChip label="All" active />
        <GitScopeChip label="Modified" />
        <GitScopeChip label="Added" />
        <GitScopeChip label="Deleted" />
      </div>
      <div className="min-h-0">{children}</div>
    </div>
  );
}

function GitTinyMetric({
  label,
  tone,
  value,
}: {
  label: string;
  tone: "success" | "warning" | "danger";
  value: number;
}) {
  return (
    <div className={`rounded-[0.875rem] border px-3 py-2.5 ${summaryCardToneClasses[tone]}`}>
      <strong className="block text-lg font-semibold text-slate-100">{value}</strong>
      <span className="text-[0.65rem] uppercase tracking-[0.16em] text-slate-500">{label}</span>
    </div>
  );
}

function GitScopeChip({ label, active = false }: { label: string; active?: boolean }) {
  return (
    <span
      className={`rounded-full border px-3 py-1 text-[0.68rem] font-semibold ${active ? "border-cyan-300/30 bg-cyan-300/10 text-cyan-100" : "border-slate-700/60 bg-slate-950/70 text-slate-400"}`}
    >
      {label}
    </span>
  );
}

const gitStatusTone = (status: GitDiffFileStatus): ShellTone => {
  switch (status) {
    case "added":
      return "success";
    case "deleted":
      return "danger";
    case "renamed":
      return "accent";
    case "modified":
      return "warning";
  }
};

const statusShortLabel = (status: GitDiffFileStatus) => {
  switch (status) {
    case "added":
      return "A";
    case "deleted":
      return "D";
    case "renamed":
      return "R";
    case "modified":
      return "M";
  }
};

function GitFileDiffPanel({ error, fileDiff, isLoading }: GitFileDiffPanelProps) {
  if (isLoading) {
    return <ResourceStatePanel tone="inset" message="Loading diff..." />;
  }

  if (error) {
    return (
      <ResourceStatePanel tone="danger" title="Unable to open this diff." message={error.message} />
    );
  }

  if (!fileDiff) {
    return (
      <ResourceStatePanel
        title="Select a changed file"
        message="Unified diff output is shown read-only."
      />
    );
  }

  return (
    <section
      className={`grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-2xl ${shellSurfaceClasses.raised}`}
      aria-label="Git file diff"
    >
      <div className="flex min-w-0 items-start justify-between gap-2 border-b border-slate-700/40 px-3 py-3 sm:px-4">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <IconMarker size="sm" tone={gitStatusTone(fileDiff.status)}>
              {statusShortLabel(fileDiff.status)}
            </IconMarker>
            <div className="min-w-0">
              <h4 className="truncate font-mono text-sm font-semibold text-slate-100 sm:text-[0.92rem]">
                {fileDiff.path}
              </h4>
              <p className="mt-0.5 text-[0.68rem] uppercase tracking-[0.16em] text-slate-500">
                unified diff · read-only · {scopeLabel(fileDiff.scope).toLowerCase()}
              </p>
            </div>
          </div>
          {fileDiff.previousPath ? (
            <p className="mt-2 truncate font-mono text-xs text-slate-500">
              from {fileDiff.previousPath}
            </p>
          ) : null}
        </div>
        <StatusPill
          tone="muted"
          value={`${scopeLabel(fileDiff.scope)} · ${statusLabel(fileDiff.status)}`}
        />
      </div>
      <pre
        className={`min-h-0 overflow-auto whitespace-pre-wrap break-words px-3 py-3 font-mono text-xs leading-5 text-slate-100 sm:px-4 sm:text-sm ${shellSurfaceClasses.code}`}
      >
        {fileDiff.diff}
      </pre>
    </section>
  );
}

const scopeLabel = (scope: GitDiffScope) => (scope === "staged" ? "Staged" : "Worktree");

const statusLabel = (status: GitDiffFileSummary["status"]) => {
  switch (status) {
    case "added":
      return "Added";
    case "deleted":
      return "Deleted";
    case "renamed":
      return "Renamed";
    case "modified":
      return "Modified";
  }
};

type FilesPanelProps = {
  initialPath: string;
  onPathChange: (path: string) => void;
  onMobilePreviewChange: (open: boolean) => void;
  projectName: string;
};

function FilesPanel({
  initialPath,
  onPathChange,
  onMobilePreviewChange,
  projectName,
}: FilesPanelProps) {
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [selectedFilePath, setSelectedFilePath] = useState<string | undefined>();

  const files = useQuery({
    queryKey: ["projects", projectName, "files", currentPath],
    queryFn: () => listProjectFiles(projectName, currentPath),
  });
  const preview = useQuery({
    enabled: selectedFilePath !== undefined,
    queryKey: ["projects", projectName, "files", "preview", selectedFilePath],
    queryFn: () => previewProjectFile(projectName, selectedFilePath ?? ""),
  });

  const goToPath = (path: string) => {
    setCurrentPath(path);
    setSelectedFilePath(undefined);
    onPathChange(path);
  };

  const selectFile = (path: string) => {
    setSelectedFilePath(path);
    onMobilePreviewChange(true);
  };

  const clearPreview = () => {
    setSelectedFilePath(undefined);
    onMobilePreviewChange(false);
  };

  const previewData = preview.data;
  const isHtml =
    previewData?.type === "text" &&
    (previewData.name.endsWith(".html") || previewData.name.endsWith(".htm"));
  const [renderMode, setRenderMode] = useState<"source" | "render">("source");

  // Reset render mode when file changes
  useEffect(() => {
    setRenderMode("source");
  }, [selectedFilePath]);

  const renderToggle = isHtml ? (
    <div className="flex shrink-0 gap-1">
      {(["source", "render"] as const).map((mode) => (
        <button
          key={mode}
          className={`cursor-pointer rounded-full border px-2.5 py-0.5 text-[0.65rem] font-semibold transition ${
            renderMode === mode
              ? "border-cyan-300/30 bg-cyan-300/10 text-cyan-100"
              : "border-slate-700/50 bg-slate-950/50 text-slate-400 hover:text-slate-200"
          }`}
          type="button"
          onClick={() => setRenderMode(mode)}
        >
          {mode === "source" ? "Source" : "Render"}
        </button>
      ))}
    </div>
  ) : null;

  const browserPanel = (
    <aside
      className={`grid min-h-0 grid-rows-[auto_minmax(0,1fr)] border-r border-slate-700/60 sm:w-[19.375rem] sm:shrink-0 ${selectedFilePath !== undefined ? "hidden sm:grid" : "grid"} ${shellSurfaceClasses.runtimeBody}`}
    >
      <div className="border-b border-slate-700/40 px-3.5 py-3">
        <PathBreadcrumb path={currentPath} onNavigate={goToPath} />
      </div>
      <div className="min-h-0 overflow-y-auto p-2">
        <FileEntryList
          entries={files.data?.entries ?? []}
          error={files.error}
          isLoading={files.isLoading}
          selectedFilePath={selectedFilePath}
          onOpenDirectory={goToPath}
          onPreviewFile={selectFile}
        />
      </div>
    </aside>
  );

  // Mobile-only top bar shown when a file is selected: back | filename | toggle
  const mobilePreviewTopBar =
    selectedFilePath !== undefined ? (
      <div
        className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b border-slate-700/40 px-3 py-2.5 sm:hidden ${shellSurfaceClasses.runtimeBody}`}
      >
        <button
          className="flex shrink-0 cursor-pointer items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-400 transition hover:bg-slate-700/50 hover:text-slate-200"
          type="button"
          onClick={clearPreview}
          aria-label="Back to files"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M10 3L5 8l5 5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Back
        </button>
        <p className="min-w-0 truncate text-center font-mono text-xs font-semibold text-slate-200">
          {previewData?.name ?? selectedFilePath.split("/").pop() ?? ""}
        </p>
        <div className="shrink-0">{renderToggle ?? <span className="w-[4.5rem]" />}</div>
      </div>
    ) : null;

  const previewPanel = (
    <FilePreviewPanel
      error={preview.error}
      isLoading={preview.isLoading}
      preview={previewData}
      renderMode={isHtml ? renderMode : "source"}
      renderToggle={renderToggle}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col sm:flex-row sm:overflow-hidden sm:rounded-2xl sm:border sm:border-slate-700/50">
      {browserPanel}
      <div
        className={`flex min-h-0 min-w-0 flex-1 flex-col ${selectedFilePath === undefined ? "hidden sm:flex" : "flex"}`}
      >
        {mobilePreviewTopBar}
        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">{previewPanel}</div>
      </div>
    </div>
  );
}

type FileEntryListProps = {
  entries: ProjectFileEntry[];
  error: Error | null;
  isLoading: boolean;
  selectedFilePath: string | undefined;
  onOpenDirectory: (path: string) => void;
  onPreviewFile: (path: string) => void;
};

function FileEntryList({
  entries,
  error,
  isLoading,
  onOpenDirectory,
  onPreviewFile,
  selectedFilePath,
}: FileEntryListProps) {
  if (isLoading) {
    return <ResourceStatePanel tone="inset" message="Loading files..." />;
  }

  if (error) {
    return (
      <ResourceStatePanel
        tone="danger"
        title="Unable to load this directory."
        message={error.message}
      />
    );
  }

  if (entries.length === 0) {
    return (
      <ResourceStatePanel
        title="Empty directory"
        message="This Project path has no files or folders."
      />
    );
  }

  return (
    <div className="grid gap-1.5" aria-label="Project files">
      {entries.map((entry) => {
        const selected = entry.path === selectedFilePath;
        return (
          <ListRow
            key={`${entry.type}:${entry.path}`}
            marker={
              <IconMarker tone={entry.type === "directory" ? "accent" : "muted"}>
                {entry.type === "directory" ? "DR" : "FL"}
              </IconMarker>
            }
            selected={selected}
            subtitle={entry.hidden ? "hidden" : undefined}
            title={entry.name}
            onClick={() =>
              entry.type === "directory" ? onOpenDirectory(entry.path) : onPreviewFile(entry.path)
            }
          />
        );
      })}
    </div>
  );
}

type FilePreviewPanelProps = {
  error: Error | null;
  isLoading: boolean;
  preview: ProjectFilePreviewResponse | undefined;
  renderMode: "source" | "render";
  renderToggle: ReactNode;
};

function FilePreviewPanel({
  error,
  isLoading,
  preview,
  renderMode,
  renderToggle,
}: FilePreviewPanelProps) {
  if (isLoading) {
    return <ResourceStatePanel tone="inset" message="Loading preview..." />;
  }

  if (error) {
    return (
      <ResourceStatePanel
        tone="danger"
        title="Unable to preview this file."
        message={error.message}
      />
    );
  }

  if (!preview) {
    return (
      <ResourceStatePanel
        title="Select a file to preview"
        message="Text and common web images are shown read-only."
      />
    );
  }

  return (
    <section
      className={`min-w-0 rounded-2xl p-3 ${shellSurfaceClasses.raised}`}
      aria-label="File preview"
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="min-w-0">
          <h4 className="truncate font-mono text-sm font-semibold text-slate-100">
            {preview.name}
          </h4>
          <p className="mt-0.5 truncate font-mono text-xs text-slate-500">
            {preview.path.includes("/")
              ? preview.path.slice(0, preview.path.lastIndexOf("/"))
              : "/"}
          </p>
        </div>
        {/* Toggle shown on desktop; on mobile it lives in the top bar */}
        <div className="hidden sm:block">{renderToggle}</div>
      </div>
      <PreviewBody preview={preview} renderMode={renderMode} />
    </section>
  );
}

type PreviewBodyProps = {
  preview: ProjectFilePreviewResponse;
  renderMode: "source" | "render";
};

function PreviewBody({ preview, renderMode }: PreviewBodyProps) {
  const [inlinedHtml, setInlinedHtml] = useState<string | null>(null);

  useEffect(() => {
    if (preview.type !== "text" || renderMode !== "render") {
      setInlinedHtml(null);
      return;
    }

    let cancelled = false;
    const dir = preview.path.includes("/")
      ? preview.path.slice(0, preview.path.lastIndexOf("/") + 1)
      : "";

    const inlineStylesheets = async () => {
      // Find all relative <link rel="stylesheet" href="..."> references
      const linkRe = /<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["'][^>]*>/gi;
      const matches = [...preview.content.matchAll(linkRe)];
      const relativeLinks = matches.filter(
        ([, href]) =>
          !href.startsWith("http") && !href.startsWith("//") && !href.startsWith("data:"),
      );

      let html = preview.content;

      await Promise.all(
        relativeLinks.map(async ([fullTag, href]) => {
          const cssPath = href.startsWith("./") ? dir + href.slice(2) : dir + href;
          try {
            const res = await fetch(
              `/api/projects/${encodeURIComponent(preview.projectName)}/files/preview?path=${encodeURIComponent(cssPath)}`,
            );
            if (!res.ok) return;
            const data = (await res.json()) as { type: string; content?: string };
            if (data.type === "text" && data.content) {
              html = html.replace(fullTag, `<style>${data.content}</style>`);
            }
          } catch {
            // leave the link tag as-is if fetch fails
          }
        }),
      );

      if (!cancelled) {
        setInlinedHtml(html);
      }
    };

    void inlineStylesheets();
    return () => {
      cancelled = true;
    };
  }, [preview, renderMode]);

  if (preview.type === "text") {
    if (renderMode === "render") {
      if (inlinedHtml === null) {
        return (
          <div
            className={`mt-3 flex items-center justify-center rounded-2xl p-6 ${shellSurfaceClasses.code}`}
          >
            <p className="text-sm text-slate-400">Preparing render...</p>
          </div>
        );
      }
      return (
        <div className={`mt-3 overflow-hidden rounded-2xl ${shellSurfaceClasses.code}`}>
          <iframe
            className="block h-[60vh] w-full border-0"
            sandbox="allow-scripts"
            srcDoc={inlinedHtml}
            title="Sandboxed HTML render"
          />
        </div>
      );
    }
    return (
      <pre
        className={`mt-3 max-h-[68vh] overflow-auto whitespace-pre-wrap break-words rounded-2xl p-3 font-mono text-xs leading-5 text-slate-100 sm:text-sm ${shellSurfaceClasses.code}`}
      >
        {preview.content}
      </pre>
    );
  }

  if (preview.type === "image") {
    return (
      <div className={`mt-3 rounded-2xl p-2 ${shellSurfaceClasses.code}`}>
        <img
          className="mx-auto h-auto max-w-full rounded-xl"
          src={preview.dataUrl}
          alt={preview.name}
        />
      </div>
    );
  }

  if (preview.type === "too_large") {
    return (
      <p
        className={`mt-3 rounded-2xl p-3 text-sm leading-6 text-amber-100 ${shellSurfaceClasses.warning}`}
      >
        File is too large to preview. Limit: {formatBytes(preview.limitBytes)}.
      </p>
    );
  }

  return (
    <p
      className={`mt-3 rounded-2xl p-3 text-sm leading-6 text-slate-300 ${shellSurfaceClasses.inset}`}
    >
      This file type is not supported for preview yet.
    </p>
  );
}

const _parentProjectPath = (path: string) => {
  if (path.length === 0) {
    return null;
  }

  const parts = path.split("/").filter(Boolean);
  parts.pop();
  return parts.length === 0 ? "" : parts.join("/");
};

const formatBytes = (bytes: number) => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KiB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
};

type PathBreadcrumbProps = {
  path: string;
  onNavigate: (path: string) => void;
};

function PathBreadcrumb({ path, onNavigate }: PathBreadcrumbProps) {
  const segments = path.split("/").filter(Boolean);

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-0.5 text-xs font-semibold">
      <button
        className="flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-slate-400 transition hover:bg-slate-700/50 hover:text-cyan-200"
        type="button"
        onClick={() => onNavigate("")}
        aria-label="Go to root"
      >
        <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M2 6.5L8 2l6 4.5V14a.5.5 0 01-.5.5h-3.75v-3.75h-3.5V14.5H2.5A.5.5 0 012 14V6.5z"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinejoin="round"
          />
        </svg>
        <span>root</span>
      </button>
      {segments.map((segment, index) => {
        const segmentPath = segments.slice(0, index + 1).join("/");
        const isLast = index === segments.length - 1;
        return (
          <span key={segmentPath} className="flex items-center gap-0.5">
            <span className="text-slate-700">/</span>
            <button
              className={`cursor-pointer rounded-md px-1 py-0.5 transition ${isLast ? "text-slate-200" : "text-slate-400 hover:bg-slate-700/50 hover:text-cyan-200"}`}
              type="button"
              onClick={() => onNavigate(segmentPath)}
            >
              {segment}
            </button>
          </span>
        );
      })}
    </div>
  );
}
type CreateButtonProps = {
  children: ReactNode;
  disabled: boolean;
  tone?: "accent" | "default";
  onClick: () => void;
};

function CreateButton({ children, disabled, onClick, tone = "default" }: CreateButtonProps) {
  return (
    <ActionButton disabled={disabled} tone={tone} onClick={onClick}>
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
