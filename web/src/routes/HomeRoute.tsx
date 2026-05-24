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
  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: listProjects,
  });
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

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedPath = projectPath.trim();

    if (trimmedPath.length === 0 || create.isPending) {
      return;
    }

    create.mutate(trimmedPath);
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#0f2d3a_0,#020617_42rem)] px-4 py-5 text-slate-100 sm:px-6 lg:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-5 shadow-2xl shadow-black/30 backdrop-blur sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">
            Agents Remote
          </p>
          <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Project control plane
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                Open a server project from your browser or installed PWA, then observe agent,
                terminal, git, and file entry points from one dark console shell.
              </p>
            </div>
            <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-sm text-cyan-100">
              PWA-ready shell · Server-scoped projects
            </div>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <ProjectListCard
            error={projects.error}
            isLoading={projects.isLoading}
            projects={projects.data?.projects ?? []}
          />
          <form
            className="rounded-[2rem] border border-white/10 bg-slate-900/80 p-5 shadow-xl shadow-black/20"
            onSubmit={handleSubmit}
          >
            <h2 className="text-lg font-semibold">Create or adopt a Project</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Enter a folder name or first-level path under PROJECTS_ROOT. The API creates the
              directory when needed or adopts it when it already exists.
            </p>
            <label className="mt-5 block text-sm font-medium text-slate-200" htmlFor={inputId}>
              Project folder
            </label>
            <input
              className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20"
              id={inputId}
              placeholder="demo-project"
              value={projectPath}
              onChange={(event) => setProjectPath(event.target.value)}
            />
            <button
              className="mt-4 w-full rounded-2xl bg-cyan-300 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
              disabled={projectPath.trim().length === 0 || create.isPending}
              type="submit"
            >
              {create.isPending ? "Creating Project..." : "Create and enter"}
            </button>
            {create.error instanceof Error ? (
              <p className="mt-3 rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-100">
                {create.error.message}
              </p>
            ) : null}
          </form>
        </section>
      </div>
    </main>
  );
}

type ProjectListCardProps = {
  error: Error | null;
  isLoading: boolean;
  projects: Project[];
};

function ProjectListCard({ error, isLoading, projects }: ProjectListCardProps) {
  return (
    <section className="rounded-[2rem] border border-white/10 bg-slate-900/80 p-5 shadow-xl shadow-black/20 sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Projects</h2>
          <p className="mt-1 text-sm text-slate-400">
            First-level directories under PROJECTS_ROOT.
          </p>
        </div>
        <span className="rounded-full border border-slate-700 px-3 py-1 text-xs font-medium text-slate-300">
          {projects.length} available
        </span>
      </div>

      {isLoading ? <StatusPanel label="Loading projects..." /> : null}
      {error ? <StatusPanel label={error.message} tone="danger" /> : null}
      {!isLoading && !error && projects.length === 0 ? (
        <StatusPanel label="No Projects yet. Create one to enter the console shell." />
      ) : null}

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {projects.map((project) => (
          <Link
            className="group rounded-3xl border border-slate-800 bg-slate-950/80 p-4 transition hover:border-cyan-300/60 hover:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-cyan-300/30"
            key={project.name}
            params={{ projectName: project.name }}
            to="/projects/$projectName"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-base font-semibold text-slate-100 group-hover:text-cyan-100">
                  {project.name}
                </h3>
                <p className="mt-1 truncate font-mono text-xs text-slate-500">{project.path}</p>
              </div>
              <span className="rounded-full bg-cyan-300/10 px-2.5 py-1 text-xs font-medium text-cyan-200">
                Open
              </span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-300">
              <span className="rounded-full bg-slate-800 px-2.5 py-1">
                Agents {project.agentSessionCount}
              </span>
              <span className="rounded-full bg-slate-800 px-2.5 py-1">
                Terminals {project.terminalSessionCount}
              </span>
              <span className="rounded-full bg-slate-800 px-2.5 py-1">
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
