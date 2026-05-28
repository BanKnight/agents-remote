import type {
  AgentProvider,
  AgentSession,
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
import type { ReactNode } from "react";
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
import { ShellHeaderSurface, ShellLayout, ShellPanel, ShellSidebar } from "../components/shell/shell-layout";
import {
  ProjectShellBottomNavigation,
  ProjectShellNavigation,
} from "../components/shell/shell-navigation";
import { ActionButton, IconMarker, ListRow, StatusPill, shellSurfaceClasses } from "../components/shell/shell-primitives";

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
      <section className={`w-full max-w-md rounded-[2rem] p-6 shadow-2xl shadow-black/30 ${shellSurfaceClasses.workspace}`}>
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
  const { workspace: activeSection } = useSearch({ from: "/projects/$projectName" });
  const [resourceDeepDetailOpen, setResourceDeepDetailOpen] = useState(false);
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
      search: { workspace },
    });
  };

  useEffect(() => {
    setResourceDeepDetailOpen(false);
  }, [activeSection]);

  return (
    <ShellLayout
      bottomNavigation={
        !resourceDeepDetailOpen ? (
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
      <WorkspaceHeader
        project={project}
        section={selectedSection}
        summary={summary}
        actions={
          activeSection === "agents" ? (
            <div className="hidden flex-wrap justify-end gap-2 sm:flex" aria-label="Create Agent instance">
              <CreateButton disabled={createAgent.isPending} tone="accent" onClick={() => createAgent.mutate("claude")}>
                + Claude
              </CreateButton>
              <CreateButton disabled={createAgent.isPending} onClick={() => createAgent.mutate("codex")}>
                + Codex
              </CreateButton>
            </div>
          ) : undefined
        }
      />

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
          projectName={project.name}
          section={selectedSection}
          onDeepDetailChange={setResourceDeepDetailOpen}
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

function ProjectSecondaryNav({ activeSection, onSelectSection, project }: ProjectSecondaryDesktopNavProps) {
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

function ProjectSecondaryBottomNav({ activeSection, onSelectSection }: ProjectSecondaryNavProps) {
  return (
    <ProjectShellBottomNavigation
      activeItemId={activeSection}
      items={projectNavigationItems(activeSection)}
      onSelectItem={onSelectSection}
    />
  );
}

function projectNavigationItems(activeSection: ConsoleSection) {
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
      actions={actions ?? fallbackActions}
      eyebrow={
        <>
          <span className="hidden sm:inline">Project / {project.name} / {section.label}</span>
          <span className="sm:hidden">{section.id === "agents" ? `Agent instances · ${summary.agentCount} active` : section.label}</span>
        </>
      }
      mobileMeta={undefined}
      title={section.id === "agents" ? <><span className="sm:hidden">{project.name}</span><span className="hidden sm:inline">Agent instances</span></> : section.label}
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
    <ShellPanel className="px-3.5 pb-4 pt-4 sm:px-5 lg:px-6 lg:py-5" density="compact" docked>
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
      <AgentHistoryPanel />
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
    <article className={`min-w-0 rounded-[1.25rem] p-3 transition ${shellSurfaceClasses.raised} ${shellSurfaceClasses.raisedHover}`}>
      <div className="flex min-w-0 items-start gap-3">
        <IconMarker tone={session.provider === "codex" ? "success" : "accent"}>
          {providerMarker(session.provider)}
        </IconMarker>
        <div className="min-w-0 flex-1">
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
            <div className="min-w-0">
              <h4 className="truncate font-semibold text-slate-100">{session.displayName}</h4>
              <p className="mt-1 break-all font-mono text-xs text-slate-500">
                {providerLabel(session.provider)} · {session.id}
              </p>
            </div>
            <StatusPill
              tone={sessionStatusTone(session.status)}
              value={sessionStatusLabel(session.status)}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              className="rounded-xl bg-cyan-300 px-3 py-1.5 text-xs font-semibold text-slate-950"
              params={{ projectName, sessionId: session.id }}
              search={{ workspace: "agents" }}
              to="/projects/$projectName/agent-sessions/$sessionId"
            >
              Open
            </Link>
            <button
              className="rounded-xl border border-rose-300/40 px-3 py-1.5 text-xs font-semibold text-rose-100"
              type="button"
              onClick={() => {
                if (window.confirm("Close this session? The running process will be terminated.")) {
                  onClose();
                }
              }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function AgentHistoryPanel() {
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
      <div className={`mt-3 flex min-w-0 items-start gap-3 rounded-xl p-3 ${shellSurfaceClasses.inset}`}>
        <IconMarker size="sm" tone="muted">H</IconMarker>
        <p className="min-w-0 text-sm leading-6 text-slate-400">
          Current Agent instances stay above. Provider-native history and resume are not mixed into
          the running session list until a real adapter exposes them.
        </p>
      </div>
    </ShellPanel>
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
    <ShellPanel className="lg:rounded-none" docked>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
            Terminal workspace
          </p>
          <h3 className="mt-2 text-xl font-semibold">Terminal instances</h3>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            Project-scoped shell sessions. Runtime input opens in the Terminal detail.
          </p>
        </div>
        <CreateButton disabled={isCreating} onClick={onCreate}>
          {isCreating ? "Creating..." : "New Terminal"}
        </CreateButton>
      </div>
      <ErrorText error={createError ?? closeError} />
      {isClosing ? (
        <p className="mt-3 text-sm text-amber-100">Closing Terminal session...</p>
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
      <div className={`mt-5 rounded-3xl p-5 text-center ${shellSurfaceClasses.dashed}`}>
        <p className="text-lg font-semibold text-slate-100">No Terminal instances yet</p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">
          Create a Terminal to open a focused project shell detail.
        </p>
      </div>
    );
  }

  return (
    <div
      className="mt-5 grid max-h-[26rem] gap-2 overflow-y-auto pr-1"
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
    <article className={`min-w-0 rounded-2xl p-3 transition sm:p-4 ${shellSurfaceClasses.raised} ${shellSurfaceClasses.raisedHover}`}>
      <div className="flex min-w-0 items-start gap-3">
        <IconMarker tone="accent">TM</IconMarker>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h4 className="truncate font-semibold text-slate-100">{session.displayName}</h4>
              <p className="mt-1 break-all font-mono text-xs text-slate-500">{session.id}</p>
            </div>
            <StatusPill
              tone={sessionStatusTone(session.status)}
              value={sessionStatusLabel(session.status)}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              className="rounded-full bg-cyan-300 px-3 py-1.5 text-xs font-semibold text-slate-950"
              params={{ projectName, sessionId: session.id }}
              search={{ fromAgentSession: undefined }}
              to="/projects/$projectName/terminal-sessions/$sessionId"
            >
              Open detail
            </Link>
            <button
              className="rounded-full border border-rose-300/40 px-3 py-1.5 text-xs font-semibold text-rose-100"
              type="button"
              onClick={() => {
                if (window.confirm("Close this Terminal? The running shell will be terminated.")) {
                  onClose();
                }
              }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

type SectionDetailProps = {
  onDeepDetailChange: (open: boolean) => void;
  projectName: string;
  section: (typeof consoleSections)[number];
};

function SectionDetail({ onDeepDetailChange, projectName, section }: SectionDetailProps) {
  const isFiles = section.id === "files";
  const isGit = section.id === "git";

  return (
    <ShellPanel className="sm:rounded-[2rem] lg:rounded-none" density="compact" docked>
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
            {section.label}
          </p>
          <p className="mt-1 truncate text-xs text-slate-500">{section.description}</p>
        </div>
        <StatusPill tone="accent" value={section.status} />
      </div>
      {isGit ? (
        <GitDiffPanel projectName={projectName} onDeepDetailChange={onDeepDetailChange} />
      ) : null}
      {isFiles ? (
        <FilesPanel projectName={projectName} onDeepDetailChange={onDeepDetailChange} />
      ) : null}
    </ShellPanel>
  );
}

function MobileDetailHeader({ backLabel, label, onBack, title }: MobileDetailHeaderProps) {
  return (
    <div className={`min-w-0 rounded-2xl p-3 sm:hidden ${shellSurfaceClasses.raised}`}>
      <button
        className="inline-flex items-center rounded-full border border-slate-700 px-3 py-1.5 text-xs font-semibold text-cyan-100"
        type="button"
        onClick={onBack}
      >
        ← {backLabel}
      </button>
      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">{label}</p>
      <h3 className="mt-1 break-all font-mono text-sm font-semibold text-slate-100">{title}</h3>
    </div>
  );
}

type MobileDetailHeaderProps = {
  backLabel: string;
  label: string;
  onBack: () => void;
  title: string;
};

type SelectedGitFile = {
  path: string;
  scope: GitDiffScope;
};

type GitDiffPanelProps = {
  onDeepDetailChange: (open: boolean) => void;
  projectName: string;
};

function GitDiffPanel({ onDeepDetailChange, projectName }: GitDiffPanelProps) {
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

  const statusToolbar = (
    <div className={`rounded-2xl px-3 py-2.5 ${shellSurfaceClasses.inset}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Git status</p>
          <p className="mt-1 truncate text-xs text-slate-400">
            Read-only worktree and staged changes.
          </p>
        </div>
        <ActionButton
          tone="accent"
          onClick={() => {
            setSelectedFile(undefined);
            void diff.refetch();
          }}
        >
          Retry
        </ActionButton>
      </div>
    </div>
  );

  const loadingState = diff.isLoading ? (
    <p className={`rounded-3xl p-4 text-sm text-slate-400 ${shellSurfaceClasses.inset}`}>
      Loading Git changes...
    </p>
  ) : null;

  const errorState = diff.error ? (
    <div className={`rounded-3xl p-4 ${shellSurfaceClasses.danger}`}>
      <p className="font-semibold text-rose-100">Unable to load Git changes.</p>
      <p className="mt-2 text-sm leading-6 text-rose-200/80">{diff.error.message}</p>
    </div>
  ) : null;

  const notRepositoryState =
    diff.data?.repository === false ? (
      <div className={`rounded-3xl p-6 text-center ${shellSurfaceClasses.dashed}`}>
        <p className="text-lg font-semibold text-slate-100">Not a Git repository</p>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          This Project directory does not have Git metadata.
        </p>
      </div>
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

  if (selectedFile !== undefined) {
    return (
      <div className="mt-3 min-w-0">
        <div className="grid gap-3 sm:hidden">
          <MobileDetailHeader
            label="Git diff"
            title={selectedFile.path}
            backLabel="Back to changed files"
            onBack={clearDiff}
          />
          {diffPanel}
        </div>
        <div className="hidden gap-3 sm:grid">
          {statusToolbar}
          <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]">
            {changedFileList}
            {diffPanel}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 grid min-w-0 gap-3">
      {statusToolbar}
      {loadingState}
      {errorState}
      {notRepositoryState}
      {diff.data?.repository === true ? (
        <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]">
          {changedFileList}
          {diffPanel}
        </div>
      ) : null}
    </div>
  );
}

type GitFileListProps = {
  files: GitDiffFileSummary[];
  selectedFile: SelectedGitFile | undefined;
  onSelectFile: (file: SelectedGitFile) => void;
};

function GitFileList({ files, onSelectFile, selectedFile }: GitFileListProps) {
  if (files.length === 0) {
    return (
      <div className={`rounded-3xl p-6 text-center ${shellSurfaceClasses.dashed}`}>
        <p className="text-lg font-semibold text-slate-100">No changes</p>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Worktree and staged changes will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-1.5" aria-label="Git changed files">
      {files.map((file) => {
        const selected = selectedFile?.path === file.path && selectedFile.scope === file.scope;
        return (
          <ListRow
            key={`${file.scope}:${file.path}`}
            marker={<IconMarker tone="accent">GT</IconMarker>}
            meta={
              <>
                <StatusPill tone="accent" value={scopeLabel(file.scope)} />
                <StatusPill tone="muted" value={statusLabel(file.status)} />
              </>
            }
            selected={selected}
            subtitle={
              file.previousPath ? (
                <span className="font-mono">from {file.previousPath}</span>
              ) : undefined
            }
            title={<span className="font-mono">{file.path}</span>}
            onClick={() => onSelectFile({ path: file.path, scope: file.scope })}
          />
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

function GitFileDiffPanel({ error, fileDiff, isLoading }: GitFileDiffPanelProps) {
  if (isLoading) {
    return (
      <p className={`rounded-3xl p-4 text-sm text-slate-400 ${shellSurfaceClasses.inset}`}>
        Loading diff...
      </p>
    );
  }

  if (error) {
    return (
      <div className={`rounded-3xl p-4 ${shellSurfaceClasses.danger}`}>
        <p className="font-semibold text-rose-100">Unable to open this diff.</p>
        <p className="mt-2 text-sm leading-6 text-rose-200/80">{error.message}</p>
      </div>
    );
  }

  if (!fileDiff) {
    return (
      <div className={`rounded-3xl p-6 text-center ${shellSurfaceClasses.dashed}`}>
        <p className="text-lg font-semibold text-slate-100">Select a changed file</p>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Unified diff output is shown read-only.
        </p>
      </div>
    );
  }

  return (
    <section
      className={`min-w-0 rounded-2xl p-3 ${shellSurfaceClasses.raised}`}
      aria-label="Git file diff"
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="min-w-0">
          <h4 className="truncate font-mono text-sm font-semibold text-slate-100">
            {fileDiff.path}
          </h4>
          {fileDiff.previousPath ? (
            <p className="mt-0.5 truncate font-mono text-xs text-slate-500">
              from {fileDiff.previousPath}
            </p>
          ) : null}
        </div>
        <StatusPill
          tone="muted"
          value={`${scopeLabel(fileDiff.scope)} · ${statusLabel(fileDiff.status)}`}
        />
      </div>
      <pre className={`mt-3 max-h-[68vh] overflow-auto whitespace-pre-wrap break-words rounded-2xl p-3 font-mono text-xs leading-5 text-slate-100 sm:text-sm ${shellSurfaceClasses.code}`}>
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
  onDeepDetailChange: (open: boolean) => void;
  projectName: string;
};

function FilesPanel({ onDeepDetailChange, projectName }: FilesPanelProps) {
  const [currentPath, setCurrentPath] = useState("");
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
  const parentPath = files.data?.parentPath ?? parentProjectPath(currentPath);
  const goToPath = (path: string) => {
    setCurrentPath(path);
    setSelectedFilePath(undefined);
  };

  useEffect(() => {
    onDeepDetailChange(selectedFilePath !== undefined);
    return () => onDeepDetailChange(false);
  }, [onDeepDetailChange, selectedFilePath]);

  const clearPreview = () => setSelectedFilePath(undefined);

  const pathToolbar = (
    <div className={`rounded-2xl px-3 py-2.5 ${shellSurfaceClasses.inset}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Current path</p>
          <p className="mt-1 truncate font-mono text-sm text-slate-100">
            {currentPath.length > 0 ? currentPath : "/"}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
          <button
            className="rounded-full border border-slate-700 px-2.5 py-1.5 text-xs font-semibold text-slate-200"
            type="button"
            onClick={() => goToPath("")}
          >
            Root
          </button>
          <button
            className="rounded-full border border-slate-700 px-2.5 py-1.5 text-xs font-semibold text-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={parentPath === null}
            type="button"
            onClick={() => parentPath !== null && goToPath(parentPath)}
          >
            Up
          </button>
          <ActionButton tone="accent" onClick={() => void files.refetch()}>
            Retry
          </ActionButton>
        </div>
      </div>
    </div>
  );

  const fileList = (
    <FileEntryList
      entries={files.data?.entries ?? []}
      error={files.error}
      isLoading={files.isLoading}
      selectedFilePath={selectedFilePath}
      onOpenDirectory={goToPath}
      onPreviewFile={setSelectedFilePath}
    />
  );

  const previewPanel = (
    <FilePreviewPanel error={preview.error} isLoading={preview.isLoading} preview={preview.data} />
  );

  if (selectedFilePath !== undefined) {
    return (
      <div className="mt-3 min-w-0">
        <div className="grid gap-3 sm:hidden">
          <MobileDetailHeader
            label="Files preview"
            title={selectedFilePath}
            backLabel="Back to Files list"
            onBack={clearPreview}
          />
          {previewPanel}
        </div>
        <div className="hidden gap-3 sm:grid">
          {pathToolbar}
          <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]">
            {fileList}
            {previewPanel}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 grid min-w-0 gap-3">
      {pathToolbar}
      <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]">
        {fileList}
        {previewPanel}
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
    return (
      <p className={`rounded-3xl p-4 text-sm text-slate-400 ${shellSurfaceClasses.inset}`}>
        Loading files...
      </p>
    );
  }

  if (error) {
    return (
      <div className={`rounded-3xl p-4 ${shellSurfaceClasses.danger}`}>
        <p className="font-semibold text-rose-100">Unable to load this directory.</p>
        <p className="mt-2 text-sm leading-6 text-rose-200/80">{error.message}</p>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className={`rounded-3xl p-6 text-center ${shellSurfaceClasses.dashed}`}>
        <p className="text-lg font-semibold text-slate-100">Empty directory</p>
        <p className="mt-2 text-sm text-slate-400">This Project path has no files or folders.</p>
      </div>
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
            meta={
              <StatusPill tone="muted" value={entry.type === "directory" ? "Open" : "Preview"} />
            }
            selected={selected}
            subtitle={`${entry.type === "directory" ? "Folder" : formatBytes(entry.size ?? 0)}${
              entry.hidden ? " · hidden" : ""
            }`}
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
};

function FilePreviewPanel({ error, isLoading, preview }: FilePreviewPanelProps) {
  if (isLoading) {
    return (
      <p className={`rounded-3xl p-4 text-sm text-slate-400 ${shellSurfaceClasses.inset}`}>
        Loading preview...
      </p>
    );
  }

  if (error) {
    return (
      <div className={`rounded-3xl p-4 ${shellSurfaceClasses.danger}`}>
        <p className="font-semibold text-rose-100">Unable to preview this file.</p>
        <p className="mt-2 text-sm leading-6 text-rose-200/80">{error.message}</p>
      </div>
    );
  }

  if (!preview) {
    return (
      <div className={`rounded-3xl p-6 text-center ${shellSurfaceClasses.dashed}`}>
        <p className="text-lg font-semibold text-slate-100">Select a file to preview</p>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Text and common web images are shown read-only.
        </p>
      </div>
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
          <p className="mt-0.5 truncate font-mono text-xs text-slate-500">{preview.path}</p>
        </div>
        <StatusPill tone="muted" value={`${preview.type} · ${formatBytes(preview.size)}`} />
      </div>
      <PreviewBody preview={preview} />
    </section>
  );
}

type PreviewBodyProps = {
  preview: ProjectFilePreviewResponse;
};

function PreviewBody({ preview }: PreviewBodyProps) {
  if (preview.type === "text") {
    return (
      <pre className={`mt-3 max-h-[68vh] overflow-auto whitespace-pre-wrap break-words rounded-2xl p-3 font-mono text-xs leading-5 text-slate-100 sm:text-sm ${shellSurfaceClasses.code}`}>
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
      <p className={`mt-3 rounded-2xl p-3 text-sm leading-6 text-amber-100 ${shellSurfaceClasses.warning}`}>
        File is too large to preview. Limit: {formatBytes(preview.limitBytes)}.
      </p>
    );
  }

  return (
    <p className={`mt-3 rounded-2xl p-3 text-sm leading-6 text-slate-300 ${shellSurfaceClasses.inset}`}>
      This file type is not supported for preview yet.
    </p>
  );
}

const parentProjectPath = (path: string) => {
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
