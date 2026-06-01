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
        <CreateButton
          disabled={isCreating}
          tone="accent"
          onClick={() => onCreate("claude")}
          className="py-3 sm:py-1.5 text-sm sm:text-xs"
        >
          + Claude
        </CreateButton>
        <CreateButton
          disabled={isCreating}
          onClick={() => onCreate("codex")}
          className="py-3 sm:py-1.5 text-sm sm:text-xs"
        >
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
        <CreateButton
          disabled={isCreating}
          tone="accent"
          onClick={onCreate}
          className="py-3 sm:py-1.5 text-sm sm:text-xs"
        >
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
