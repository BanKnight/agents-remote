import type { Project } from "@agents-remote/shared";
import { Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAtom } from "jotai";
import type { ReactNode } from "react";
import { getProject } from "../api/client";
import { activeConsoleSectionAtom, inputPanelOpenAtom } from "../state/ui";
import {
  consoleSections,
  projectSummary,
  runtimeInputEnabled,
  sectionForId,
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
  const [activeSection, setActiveSection] = useAtom(activeConsoleSectionAtom);
  const [inputPanelOpen, setInputPanelOpen] = useAtom(inputPanelOpenAtom);
  const selectedSection = sectionForId(activeSection);
  const summary = projectSummary(project);

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
                  Agent work is the default focus. Runtime data is not connected yet, so this shell
                  reserves the observation space without pretending sessions exist.
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
            <AgentPanel />
            <section className="grid gap-4">
              <SectionDetail section={selectedSection} />
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
            <span className="block text-sm font-semibold text-slate-100">
              Runtime input pending
            </span>
            <span className="mt-1 block text-xs text-slate-500">
              Input will unlock when Agent/Terminal runtime is connected.
            </span>
          </span>
          <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300">
            {inputPanelOpen ? "Hide" : "Show"}
          </span>
        </button>
        {inputPanelOpen ? (
          <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-500">
            {runtimeInputEnabled
              ? "Runtime input enabled."
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

function AgentPanel() {
  return (
    <section className="rounded-[2rem] border border-white/10 bg-slate-900/80 p-5 shadow-xl shadow-black/20 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-xl font-semibold">Agent Sessions</h3>
          <p className="mt-1 text-sm text-slate-400">Default focus for remote AI work.</p>
        </div>
        <span className="w-fit rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs font-medium text-amber-100">
          No runtime connected
        </span>
      </div>
      <div className="mt-5 rounded-3xl border border-dashed border-slate-700 bg-slate-950/70 p-6 text-center">
        <p className="text-lg font-semibold text-slate-100">No Agent Sessions yet</p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">
          Claude and Codex sessions will appear here with running, waiting, stopped, and latest
          output summaries after the session runtime change lands.
        </p>
        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          <PlaceholderMetric label="Running" />
          <PlaceholderMetric label="Waiting for input" />
          <PlaceholderMetric label="Latest output" />
        </div>
      </div>
    </section>
  );
}

type PlaceholderMetricProps = {
  label: string;
};

function PlaceholderMetric({ label }: PlaceholderMetricProps) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 px-3 py-3 text-xs text-slate-400">
      {label}: pending
    </div>
  );
}

type SectionDetailProps = {
  section: (typeof consoleSections)[number];
};

function SectionDetail({ section }: SectionDetailProps) {
  const isAgent = section.id === "agents";

  return (
    <section className="rounded-[2rem] border border-white/10 bg-slate-900/80 p-5 shadow-xl shadow-black/20">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">{section.label}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-400">{section.description}</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            isAgent ? "bg-cyan-300/10 text-cyan-100" : "bg-slate-800 text-slate-300"
          }`}
        >
          {section.status}
        </span>
      </div>
      {!isAgent ? (
        <p className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-sm text-slate-500">
          Placeholder only. This entry does not read files, run Git, or start sessions in this
          change.
        </p>
      ) : null}
    </section>
  );
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
          <dd className="mt-1 text-slate-200">Project-scoped shell, read-only placeholders</dd>
        </div>
      </dl>
    </section>
  );
}
