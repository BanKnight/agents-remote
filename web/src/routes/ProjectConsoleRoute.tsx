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
import { useState } from "react";
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
import { ActionButton, IconMarker, ListRow, NavItemContent, StatusPill } from "./shell-primitives";

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
    <main className="flex min-h-dvh items-center justify-center overflow-x-hidden bg-slate-950 px-4 text-slate-100">
      <section className="w-full max-w-md rounded-[2rem] border border-white/10 bg-slate-900 p-6 shadow-2xl shadow-black/30">
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

  const selectWorkspace = (workspace: (typeof consoleSections)[number]["id"]) =>
    void navigate({
      search: { workspace },
    });

  return (
    <main className="min-h-dvh overflow-x-hidden bg-[radial-gradient(circle_at_top_left,#123140_0,#020617_34rem)] px-3 pb-24 pt-3 text-slate-100 sm:px-6 sm:py-4 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100dvh-1.5rem)] w-full max-w-7xl min-w-0 gap-4 sm:min-h-[calc(100dvh-2rem)] lg:grid-cols-[16rem_minmax(0,1fr)]">
        <ProjectSecondaryNav activeSection={activeSection} onSelectSection={selectWorkspace} />

        <div className="flex min-w-0 flex-col gap-4">
          <WorkspaceHeader project={project} section={selectedSection} summary={summary} />

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
              createError={createTerminal.error}
              closeError={closeTerminal.error}
              onCreate={() => createTerminal.mutate()}
              onClose={(sessionId) => closeTerminal.mutate(sessionId)}
            />
          ) : null}

          {activeSection === "files" || activeSection === "git" ? (
            <SectionDetail projectName={project.name} section={selectedSection} />
          ) : null}

          <ProjectSignals gitBranch={summary.gitBranch} />
        </div>
      </div>

      <ProjectSecondaryBottomNav activeSection={activeSection} onSelectSection={selectWorkspace} />
    </main>
  );
}

type ProjectSecondaryNavProps = {
  activeSection: ConsoleSection;
  onSelectSection: (section: ConsoleSection) => void;
};

function ProjectSecondaryNav({ activeSection, onSelectSection }: ProjectSecondaryNavProps) {
  return (
    <aside className="hidden min-h-0 min-w-0 rounded-[2rem] border border-white/10 bg-slate-950/80 p-3 shadow-2xl shadow-black/30 lg:flex lg:flex-col">
      <Link
        className="mb-4 rounded-2xl border border-slate-800 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300 hover:border-cyan-300/50"
        to="/"
      >
        Back to Projects
      </Link>
      <nav className="grid gap-2" aria-label="Project workspace navigation">
        {consoleSections.map((section) => (
          <button
            key={section.id}
            className="min-w-0"
            type="button"
            onClick={() => onSelectSection(section.id)}
          >
            <NavItemContent
              active={activeSection === section.id}
              description={section.status}
              label={section.label}
              marker={
                <IconMarker tone={activeSection === section.id ? "accent" : "muted"}>
                  {sectionMarker(section.id)}
                </IconMarker>
              }
            />
          </button>
        ))}
      </nav>
    </aside>
  );
}

function ProjectSecondaryBottomNav({ activeSection, onSelectSection }: ProjectSecondaryNavProps) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-slate-950/95 px-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 shadow-2xl shadow-black/40 backdrop-blur lg:hidden"
      aria-label="Project mobile workspace navigation"
    >
      <div className="mx-auto grid max-w-md grid-cols-5 gap-1">
        <Link className="min-w-0" to="/">
          <NavItemContent label="Back" marker={<IconMarker tone="muted">BK</IconMarker>} />
        </Link>
        {consoleSections.map((section) => (
          <button
            key={section.id}
            className="min-w-0"
            type="button"
            onClick={() => onSelectSection(section.id)}
          >
            <NavItemContent
              active={activeSection === section.id}
              label={shortSectionLabel(section.id)}
              marker={
                <IconMarker tone={activeSection === section.id ? "accent" : "muted"}>
                  {sectionMarker(section.id)}
                </IconMarker>
              }
            />
          </button>
        ))}
      </div>
    </nav>
  );
}

function sectionMarker(section: ConsoleSection) {
  switch (section) {
    case "agents":
      return "AG";
    case "files":
      return "FL";
    case "git":
      return "GT";
    case "terminal":
      return "TM";
  }
}

function shortSectionLabel(section: ConsoleSection) {
  return section === "agents" ? "Agent" : sectionForId(section).label;
}

type WorkspaceHeaderProps = {
  project: Project;
  section: ConsoleSectionDefinition;
  summary: ReturnType<typeof projectSummary>;
};

function WorkspaceHeader({ project, section, summary }: WorkspaceHeaderProps) {
  return (
    <header className="min-w-0 rounded-[2rem] border border-white/10 bg-slate-950/80 p-4 shadow-2xl shadow-black/30 backdrop-blur sm:p-5 lg:p-6">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <IconMarker tone="accent">{sectionMarker(section.id)}</IconMarker>
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Current Project</p>
            <h1 className="mt-2 truncate text-2xl font-semibold tracking-tight sm:text-3xl">
              {project.name}
            </h1>
            <p className="mt-1 truncate text-sm font-semibold text-cyan-100">{section.label}</p>
            <p className="mt-2 break-all font-mono text-xs leading-5 text-slate-500">
              {project.path}
            </p>
          </div>
        </div>
        <div className="hidden shrink-0 grid-cols-3 gap-2 sm:grid">
          <SummaryBadge label="Agents" value={summary.agentCount} />
          <SummaryBadge label="Terminals" value={summary.terminalCount} />
          <SummaryBadge label="Runtime" value={summary.runtimeStatus} />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 sm:hidden">
        <SummaryBadge label="Agents" value={summary.agentCount} />
        <SummaryBadge label="Terms" value={summary.terminalCount} />
        <SummaryBadge label="Runtime" value={summary.runtimeStatus} />
      </div>
    </header>
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
    <section className="min-w-0 rounded-[2rem] border border-white/10 bg-slate-900/80 p-5 shadow-xl shadow-black/20 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-xl font-semibold">Agent Sessions</h3>
          <p className="mt-1 text-sm text-slate-400">Default focus for remote AI work.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <CreateButton disabled={isCreating} onClick={() => onCreate("claude")}>
            Claude
          </CreateButton>
          <CreateButton disabled={isCreating} onClick={() => onCreate("codex")}>
            Codex
          </CreateButton>
        </div>
      </div>
      <ErrorText error={createError ?? closeError} />
      <SessionList isLoading={isLoading} empty="No Agent Sessions yet">
        {sessions.map((session) => (
          <SessionCard
            key={session.id}
            title={session.displayName}
            subtitle={`${session.provider} · ${session.id}`}
            status={sessionStatusLabel(session.status)}
            detailTo="/projects/$projectName/agent-sessions/$sessionId"
            detailParams={{ projectName, sessionId: session.id }}
            onClose={() => onClose(session.id)}
          />
        ))}
      </SessionList>
    </section>
  );
}

type TerminalPanelProps = {
  projectName: string;
  sessions: TerminalSession[];
  isLoading: boolean;
  isCreating: boolean;
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
  createError,
  closeError,
  onCreate,
  onClose,
}: TerminalPanelProps) {
  return (
    <section className="min-w-0 rounded-[2rem] border border-white/10 bg-slate-900/80 p-5 shadow-xl shadow-black/20 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-xl font-semibold">Terminal Sessions</h3>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            Project-scoped shell sessions for direct server work.
          </p>
        </div>
        <CreateButton disabled={isCreating} onClick={onCreate}>
          New Terminal
        </CreateButton>
      </div>
      <ErrorText error={createError ?? closeError} />
      <SessionList isLoading={isLoading} empty="No Terminal Sessions yet">
        {sessions.map((session) => (
          <SessionCard
            key={session.id}
            title={session.displayName}
            subtitle={session.id}
            status={sessionStatusLabel(session.status)}
            detailTo="/projects/$projectName/terminal-sessions/$sessionId"
            detailParams={{ projectName, sessionId: session.id }}
            onClose={() => onClose(session.id)}
          />
        ))}
      </SessionList>
    </section>
  );
}

type SectionDetailProps = {
  projectName: string;
  section: (typeof consoleSections)[number];
};

function SectionDetail({ projectName, section }: SectionDetailProps) {
  const isFiles = section.id === "files";
  const isGit = section.id === "git";

  return (
    <section className="min-w-0 rounded-[1.5rem] border border-white/10 bg-slate-900/80 p-3 shadow-xl shadow-black/20 sm:rounded-[2rem] sm:p-4">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
            {section.label}
          </p>
          <p className="mt-1 truncate text-xs text-slate-500">{section.description}</p>
        </div>
        <StatusPill tone="accent" value={section.status} />
      </div>
      {isGit ? <GitDiffPanel projectName={projectName} /> : null}
      {isFiles ? <FilesPanel projectName={projectName} /> : null}
    </section>
  );
}

type SelectedGitFile = {
  path: string;
  scope: GitDiffScope;
};

type GitDiffPanelProps = {
  projectName: string;
};

function GitDiffPanel({ projectName }: GitDiffPanelProps) {
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

  return (
    <div className="mt-3 grid gap-3">
      <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-3 py-2.5">
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

      {diff.isLoading ? (
        <p className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-400">
          Loading Git changes...
        </p>
      ) : null}

      {diff.error ? (
        <div className="rounded-3xl border border-rose-300/20 bg-rose-950/20 p-4">
          <p className="font-semibold text-rose-100">Unable to load Git changes.</p>
          <p className="mt-2 text-sm leading-6 text-rose-200/80">{diff.error.message}</p>
        </div>
      ) : null}

      {diff.data?.repository === false ? (
        <div className="rounded-3xl border border-dashed border-slate-700 bg-slate-950/70 p-6 text-center">
          <p className="text-lg font-semibold text-slate-100">Not a Git repository</p>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            This Project directory does not have Git metadata.
          </p>
        </div>
      ) : null}

      {diff.data?.repository === true ? (
        <>
          <GitFileList
            files={diff.data.files}
            selectedFile={selectedFile}
            onSelectFile={setSelectedFile}
          />
          <GitFileDiffPanel
            error={fileDiff.error}
            isLoading={fileDiff.isLoading}
            fileDiff={fileDiff.data}
          />
        </>
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
      <div className="rounded-3xl border border-dashed border-slate-700 bg-slate-950/70 p-6 text-center">
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
      <p className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-400">
        Loading diff...
      </p>
    );
  }

  if (error) {
    return (
      <div className="rounded-3xl border border-rose-300/20 bg-rose-950/20 p-4">
        <p className="font-semibold text-rose-100">Unable to open this diff.</p>
        <p className="mt-2 text-sm leading-6 text-rose-200/80">{error.message}</p>
      </div>
    );
  }

  if (!fileDiff) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-700 bg-slate-950/70 p-6 text-center">
        <p className="text-lg font-semibold text-slate-100">Select a changed file</p>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Unified diff output is shown read-only.
        </p>
      </div>
    );
  }

  return (
    <section
      className="min-w-0 rounded-2xl border border-slate-800 bg-slate-950/80 p-3"
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
      <pre className="mt-3 max-h-[68vh] overflow-auto whitespace-pre-wrap break-words rounded-2xl border border-slate-800 bg-slate-950 p-3 font-mono text-xs leading-5 text-slate-100 sm:text-sm">
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
  projectName: string;
};

function FilesPanel({ projectName }: FilesPanelProps) {
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

  return (
    <div className="mt-3 grid gap-3">
      <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-3 py-2.5">
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

      <FileEntryList
        entries={files.data?.entries ?? []}
        error={files.error}
        isLoading={files.isLoading}
        selectedFilePath={selectedFilePath}
        onOpenDirectory={goToPath}
        onPreviewFile={setSelectedFilePath}
      />

      <FilePreviewPanel
        error={preview.error}
        isLoading={preview.isLoading}
        preview={preview.data}
      />
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
      <p className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-400">
        Loading files...
      </p>
    );
  }

  if (error) {
    return (
      <div className="rounded-3xl border border-rose-300/20 bg-rose-950/20 p-4">
        <p className="font-semibold text-rose-100">Unable to load this directory.</p>
        <p className="mt-2 text-sm leading-6 text-rose-200/80">{error.message}</p>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-700 bg-slate-950/70 p-6 text-center">
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
      <p className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-400">
        Loading preview...
      </p>
    );
  }

  if (error) {
    return (
      <div className="rounded-3xl border border-rose-300/20 bg-rose-950/20 p-4">
        <p className="font-semibold text-rose-100">Unable to preview this file.</p>
        <p className="mt-2 text-sm leading-6 text-rose-200/80">{error.message}</p>
      </div>
    );
  }

  if (!preview) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-700 bg-slate-950/70 p-6 text-center">
        <p className="text-lg font-semibold text-slate-100">Select a file to preview</p>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Text and common web images are shown read-only.
        </p>
      </div>
    );
  }

  return (
    <section
      className="min-w-0 rounded-2xl border border-slate-800 bg-slate-950/80 p-3"
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
      <pre className="mt-3 max-h-[68vh] overflow-auto whitespace-pre-wrap break-words rounded-2xl border border-slate-800 bg-slate-950 p-3 font-mono text-xs leading-5 text-slate-100 sm:text-sm">
        {preview.content}
      </pre>
    );
  }

  if (preview.type === "image") {
    return (
      <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-950 p-2">
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
      <p className="mt-3 rounded-2xl border border-amber-300/20 bg-amber-950/20 p-3 text-sm leading-6 text-amber-100">
        File is too large to preview. Limit: {formatBytes(preview.limitBytes)}.
      </p>
    );
  }

  return (
    <p className="mt-3 rounded-2xl border border-slate-700 bg-slate-900 p-3 text-sm leading-6 text-slate-300">
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
type SessionListProps = {
  children: ReactNode;
  empty: string;
  isLoading: boolean;
};

function SessionList({ children, empty, isLoading }: SessionListProps) {
  if (isLoading) {
    return <p className="mt-5 text-sm text-slate-400">Loading sessions...</p>;
  }

  if (!Array.isArray(children) || children.length === 0) {
    return (
      <div className="mt-5 rounded-3xl border border-dashed border-slate-700 bg-slate-950/70 p-6 text-center">
        <p className="text-lg font-semibold text-slate-100">{empty}</p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">
          Create a session to open a project-scoped runtime stream.
        </p>
      </div>
    );
  }

  return <div className="mt-5 grid max-h-80 gap-3 overflow-y-auto pr-1">{children}</div>;
}

type SessionCardProps = {
  title: string;
  subtitle: string;
  status: string;
  detailTo:
    | "/projects/$projectName/agent-sessions/$sessionId"
    | "/projects/$projectName/terminal-sessions/$sessionId";
  detailParams: { projectName: string; sessionId: string };
  onClose: () => void;
};

function SessionCard({
  detailParams,
  detailTo,
  onClose,
  status,
  subtitle,
  title,
}: SessionCardProps) {
  return (
    <div className="min-w-0 rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-100">{title}</p>
          <p className="mt-1 break-all font-mono text-xs text-slate-500">{subtitle}</p>
        </div>
        <StatusPill tone="success" value={status} />
      </div>
      <div className="mt-4 flex gap-2">
        <Link
          className="rounded-full bg-cyan-300 px-3 py-1.5 text-xs font-semibold text-slate-950"
          params={detailParams}
          search={{ workspace: detailTo.includes("terminal-sessions") ? "terminal" : "agents" }}
          to={detailTo}
        >
          Open stream
        </Link>
        <button
          className="rounded-full border border-rose-300/40 px-3 py-1.5 text-xs font-semibold text-rose-100"
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
  );
}

type CreateButtonProps = {
  children: ReactNode;
  disabled: boolean;
  onClick: () => void;
};

function CreateButton({ children, disabled, onClick }: CreateButtonProps) {
  return (
    <ActionButton disabled={disabled} tone="accent" onClick={onClick}>
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

type ProjectSignalsProps = {
  gitBranch: string;
};

function ProjectSignals({ gitBranch }: ProjectSignalsProps) {
  return (
    <section className="rounded-[2rem] border border-white/10 bg-slate-900/80 p-5 shadow-xl shadow-black/20">
      <h3 className="text-lg font-semibold">Project signals</h3>
      <dl className="mt-4 grid gap-3 text-sm">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
          <dt className="text-slate-500">Git branch</dt>
          <dd className="mt-1 text-slate-200">{gitBranch}</dd>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
          <dt className="text-slate-500">Scope</dt>
          <dd className="mt-1 text-slate-200">Project-scoped Agent and Terminal sessions</dd>
        </div>
      </dl>
    </section>
  );
}
