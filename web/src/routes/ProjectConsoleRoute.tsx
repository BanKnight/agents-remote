import type { AgentProvider, AgentSession, Project, TerminalSession } from "@agents-remote/shared";
import { Link, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtom } from "jotai";
import type { ReactNode } from "react";
import {
  closeAgentSession,
  closeTerminalSession,
  createAgentSession,
  createTerminalSession,
  getProject,
  listAgentSessions,
  listTerminalSessions,
} from "../api/client";
import { activeConsoleSectionAtom, inputPanelOpenAtom } from "../state/ui";
import {
  consoleSections,
  projectSummary,
  runtimeInputEnabled,
  sectionForId,
  sessionStatusLabel,
} from "./console-model";

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
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-100">
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
  const [activeSection, setActiveSection] = useAtom(activeConsoleSectionAtom);
  const [inputPanelOpen, setInputPanelOpen] = useAtom(inputPanelOpenAtom);
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

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#123140_0,#020617_34rem)] px-4 py-4 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto grid w-full max-w-7xl gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="rounded-[2rem] border border-white/10 bg-slate-950/75 p-4 shadow-2xl shadow-black/30 backdrop-blur lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)]">
          <Link className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300" to="/">
            Agents Remote
          </Link>
          <div className="mt-5 rounded-3xl border border-slate-800 bg-slate-900/80 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Current Project</p>
            <h1 className="mt-2 break-words text-2xl font-semibold">{project.name}</h1>
            <p className="mt-2 break-all font-mono text-xs leading-5 text-slate-500">
              {project.path}
            </p>
          </div>
          <nav className="mt-4 grid gap-2" aria-label="Project console sections">
            {consoleSections.map((section) => (
              <button
                className={`rounded-2xl border px-4 py-3 text-left transition ${
                  activeSection === section.id
                    ? "border-cyan-300/60 bg-cyan-300/10 text-cyan-50"
                    : "border-slate-800 bg-slate-900/70 text-slate-300 hover:border-slate-600"
                }`}
                key={section.id}
                type="button"
                onClick={() => setActiveSection(section.id)}
              >
                <span className="block text-sm font-semibold">{section.label}</span>
                <span className="mt-1 block text-xs text-slate-500">{section.status}</span>
              </button>
            ))}
          </nav>
        </aside>

        <section className="flex min-h-[calc(100vh-2rem)] flex-col gap-4 pb-28 lg:pb-4">
          <header className="rounded-[2rem] border border-white/10 bg-slate-900/80 p-5 shadow-xl shadow-black/20 sm:p-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">
                  Project Console
                </p>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                  Agent Sessions
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                  Agent and Terminal sessions now use stable internal session ids while keeping
                  provider and shell semantics separate.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <SummaryBadge label="Agents" value={summary.agentCount} />
                <SummaryBadge label="Terminals" value={summary.terminalCount} />
                <SummaryBadge label="Runtime" value={summary.runtimeStatus} />
              </div>
            </div>
          </header>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
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
            <section className="grid gap-4">
              <SectionDetail
                projectName={project.name}
                section={selectedSection}
                terminalSessions={terminalSessions.data?.sessions ?? []}
                terminalLoading={terminalSessions.isLoading}
                terminalCreating={createTerminal.isPending}
                terminalCreateError={createTerminal.error}
                terminalCloseError={closeTerminal.error}
                onCreateTerminal={() => createTerminal.mutate()}
                onCloseTerminal={(sessionId) => closeTerminal.mutate(sessionId)}
              />
              <ProjectSignals gitBranch={summary.gitBranch} />
            </section>
          </div>
        </section>
      </div>

      <div className="fixed inset-x-3 bottom-3 z-10 mx-auto max-w-3xl rounded-[1.75rem] border border-cyan-300/20 bg-slate-950/95 p-3 shadow-2xl shadow-black/40 backdrop-blur lg:left-[20rem]">
        <button
          className="flex w-full items-center justify-between rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 text-left"
          type="button"
          onClick={() => setInputPanelOpen((value) => !value)}
        >
          <span>
            <span className="block text-sm font-semibold text-slate-100">Runtime input ready</span>
            <span className="mt-1 block text-xs text-slate-500">
              Open a session detail page to send input over the runtime stream.
            </span>
          </span>
          <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300">
            {inputPanelOpen ? "Hide" : "Show"}
          </span>
        </button>
        {inputPanelOpen ? (
          <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-500">
            {runtimeInputEnabled
              ? "Input is sent only from Agent or Terminal session detail pages."
              : "Disabled · no Agent or Terminal input is sent in this shell slice."}
          </div>
        ) : null}
      </div>
    </main>
  );
}

type SummaryBadgeProps = {
  label: string;
  value: number | string;
};

function SummaryBadge({ label, value }: SummaryBadgeProps) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-100">{value}</p>
    </div>
  );
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
    <section className="rounded-[2rem] border border-white/10 bg-slate-900/80 p-5 shadow-xl shadow-black/20 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-xl font-semibold">Agent Sessions</h3>
          <p className="mt-1 text-sm text-slate-400">Default focus for remote AI work.</p>
        </div>
        <div className="flex gap-2">
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

type SectionDetailProps = {
  projectName: string;
  section: (typeof consoleSections)[number];
  terminalSessions: TerminalSession[];
  terminalLoading: boolean;
  terminalCreating: boolean;
  terminalCreateError: Error | null;
  terminalCloseError: Error | null;
  onCreateTerminal: () => void;
  onCloseTerminal: (sessionId: string) => void;
};

function SectionDetail({
  projectName,
  section,
  terminalSessions,
  terminalLoading,
  terminalCreating,
  terminalCreateError,
  terminalCloseError,
  onCreateTerminal,
  onCloseTerminal,
}: SectionDetailProps) {
  const isAgent = section.id === "agents";
  const isTerminal = section.id === "terminal";

  return (
    <section className="rounded-[2rem] border border-white/10 bg-slate-900/80 p-5 shadow-xl shadow-black/20">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">{section.label}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-400">{section.description}</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            isAgent || isTerminal ? "bg-cyan-300/10 text-cyan-100" : "bg-slate-800 text-slate-300"
          }`}
        >
          {section.status}
        </span>
      </div>
      {isTerminal ? (
        <div className="mt-5">
          <CreateButton disabled={terminalCreating} onClick={onCreateTerminal}>
            New Terminal Session
          </CreateButton>
          <ErrorText error={terminalCreateError ?? terminalCloseError} />
          <SessionList isLoading={terminalLoading} empty="No Terminal Sessions yet">
            {terminalSessions.map((session) => (
              <SessionCard
                key={session.id}
                title={session.displayName}
                subtitle={session.id}
                status={sessionStatusLabel(session.status)}
                detailTo="/projects/$projectName/terminal-sessions/$sessionId"
                detailParams={{ projectName, sessionId: session.id }}
                onClose={() => onCloseTerminal(session.id)}
              />
            ))}
          </SessionList>
        </div>
      ) : null}
      {!isAgent && !isTerminal ? (
        <p className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-sm text-slate-500">
          Placeholder only. This entry does not read files, run Git, or start sessions in this
          change.
        </p>
      ) : null}
    </section>
  );
}

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

  return <div className="mt-5 grid gap-3">{children}</div>;
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
    <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-slate-100">{title}</p>
          <p className="mt-1 break-all font-mono text-xs text-slate-500">{subtitle}</p>
        </div>
        <span className="rounded-full bg-emerald-300/10 px-3 py-1 text-xs text-emerald-100">
          {status}
        </span>
      </div>
      <div className="mt-4 flex gap-2">
        <Link
          className="rounded-full bg-cyan-300 px-3 py-1.5 text-xs font-semibold text-slate-950"
          params={detailParams}
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
    <button
      className="rounded-full border border-cyan-300/40 px-3 py-1.5 text-xs font-semibold text-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
      disabled={disabled}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
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
