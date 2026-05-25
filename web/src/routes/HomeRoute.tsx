import type { Project } from "@agents-remote/shared";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useId, useState } from "react";
import { createProject, listProjects } from "../api/client";

export function HomeRoute() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const inputId = useId();
  const [projectPath, setProjectPath] = useState("");
  const [setupOpen, setSetupOpen] = useState(false);
  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: listProjects,
  });
  const projectItems = projects.data?.projects ?? [];
  const create = useMutation({
    mutationFn: createProject,
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      await navigate({
        to: "/projects/$projectName",
        params: { projectName: response.project.name },
      });
    },
  });
  const setupVisible =
    setupOpen ||
    create.isPending ||
    create.error instanceof Error ||
    (!projects.isLoading && !projects.error && projectItems.length === 0);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedPath = projectPath.trim();

    if (trimmedPath.length === 0 || create.isPending) {
      return;
    }

    create.mutate(trimmedPath);
  };

  return (
    <main className="min-h-dvh overflow-x-hidden bg-[radial-gradient(circle_at_top,#0f2d3a_0,#020617_34rem)] px-3 py-3 text-slate-100 sm:px-6 sm:py-5 lg:px-10">
      <div className="mx-auto flex min-h-[calc(100dvh-1.5rem)] w-full max-w-6xl min-w-0 flex-col gap-4 sm:min-h-[calc(100dvh-2.5rem)]">
        <header className="rounded-[1.75rem] border border-white/10 bg-slate-950/75 p-4 shadow-2xl shadow-black/30 backdrop-blur sm:rounded-[2rem] sm:p-5">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">
                Agents Remote
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Projects</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                Open a Project to control Agent Sessions, Terminal, Files, and Git from one dark
                mobile console.
              </p>
            </div>
            <span className="shrink-0 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1.5 text-xs font-semibold text-cyan-100">
              PWA shell
            </span>
          </div>
        </header>

        <section className="grid min-w-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <ProjectListCard
            error={projects.error}
            isLoading={projects.isLoading}
            projects={projectItems}
            onCreateProject={() => setSetupOpen(true)}
          />

          <aside className="min-w-0 rounded-[1.75rem] border border-white/10 bg-slate-900/75 p-4 shadow-xl shadow-black/20 sm:rounded-[2rem] sm:p-5 lg:self-start">
            <button
              aria-expanded={setupVisible}
              className="flex w-full items-start justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-left transition hover:border-cyan-300/50"
              type="button"
              onClick={() => setSetupOpen((value) => !value)}
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-slate-100">
                  Create or adopt a Project
                </span>
                <span className="mt-1 block text-xs leading-5 text-slate-500">
                  Low-frequency setup under PROJECTS_ROOT.
                </span>
              </span>
              <span className="shrink-0 rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300">
                {setupVisible ? "Hide" : "Open"}
              </span>
            </button>

            {setupVisible ? (
              <form className="mt-4" onSubmit={handleSubmit}>
                <label className="block text-sm font-medium text-slate-200" htmlFor={inputId}>
                  Project folder
                </label>
                <input
                  className="mt-2 w-full min-w-0 rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20"
                  id={inputId}
                  placeholder="demo-project"
                  value={projectPath}
                  onChange={(event) => setProjectPath(event.target.value)}
                />
                <button
                  className="mt-3 w-full rounded-2xl bg-cyan-300 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                  disabled={projectPath.trim().length === 0 || create.isPending}
                  type="submit"
                >
                  {create.isPending ? "Creating Project..." : "Create and enter"}
                </button>
                <p className="mt-3 text-xs leading-5 text-slate-500">
                  Enter a folder name or first-level path. Existing folders are adopted.
                </p>
                {create.error instanceof Error ? (
                  <p className="mt-3 rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-100">
                    {create.error.message}
                  </p>
                ) : null}
              </form>
            ) : (
              <p className="mt-4 text-sm leading-6 text-slate-500">
                Most visits should start by opening an existing Project. Use setup only when you
                need a new server folder.
              </p>
            )}
          </aside>
        </section>
      </div>
    </main>
  );
}

type ProjectListCardProps = {
  error: Error | null;
  isLoading: boolean;
  projects: Project[];
  onCreateProject: () => void;
};

function ProjectListCard({ error, isLoading, onCreateProject, projects }: ProjectListCardProps) {
  return (
    <section className="min-w-0 rounded-[1.75rem] border border-white/10 bg-slate-900/80 p-4 shadow-xl shadow-black/20 sm:rounded-[2rem] sm:p-5">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold">Your Projects</h2>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            Project-scoped workspaces for Agent Sessions, Terminal, Files, and Git.
          </p>
        </div>
        <span className="w-fit rounded-full border border-slate-700 px-3 py-1 text-xs font-medium text-slate-300">
          {projects.length} available
        </span>
      </div>

      {isLoading ? <StatusPanel label="Loading Projects..." /> : null}
      {error ? <StatusPanel label={error.message} tone="danger" /> : null}
      {!isLoading && !error && projects.length === 0 ? (
        <div className="mt-5 rounded-3xl border border-dashed border-slate-700 bg-slate-950/70 p-5">
          <p className="text-lg font-semibold text-slate-100">No Projects yet</p>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Create or adopt a Project to enter the console shell.
          </p>
          <button
            className="mt-4 rounded-full bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950"
            type="button"
            onClick={onCreateProject}
          >
            Create or adopt Project
          </button>
        </div>
      ) : null}

      <div className="mt-5 grid min-w-0 gap-3 md:grid-cols-2">
        {projects.map((project) => (
          <Link
            className="group min-w-0 rounded-3xl border border-slate-800 bg-slate-950/80 p-4 transition hover:border-cyan-300/60 hover:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-cyan-300/30"
            key={project.name}
            params={{ projectName: project.name }}
            to="/projects/$projectName"
          >
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-base font-semibold text-slate-100 group-hover:text-cyan-100">
                  {project.name}
                </h3>
                <p className="mt-1 truncate font-mono text-xs text-slate-500">{project.path}</p>
              </div>
              <span className="shrink-0 rounded-full bg-cyan-300/10 px-2.5 py-1 text-xs font-medium text-cyan-200">
                Open
              </span>
            </div>
            <div className="mt-4 flex min-w-0 flex-wrap gap-2 text-xs text-slate-300">
              <span className="rounded-full bg-slate-800 px-2.5 py-1">
                Agents {project.agentSessionCount}
              </span>
              <span className="rounded-full bg-slate-800 px-2.5 py-1">
                Terminals {project.terminalSessionCount}
              </span>
              <span className="max-w-full truncate rounded-full bg-slate-800 px-2.5 py-1">
                {project.gitBranch ?? "Git branch pending"}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

type StatusPanelProps = {
  label: string;
  tone?: "default" | "danger";
};

function StatusPanel({ label, tone = "default" }: StatusPanelProps) {
  const classes =
    tone === "danger"
      ? "border-red-400/30 bg-red-400/10 text-red-100"
      : "border-slate-700 bg-slate-950/80 text-slate-300";

  return <p className={`mt-5 rounded-2xl border px-4 py-3 text-sm ${classes}`}>{label}</p>;
}
