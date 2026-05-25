import type { Project } from "@agents-remote/shared";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type ReactNode, useId, useState } from "react";
import { createProject, listProjects } from "../api/client";
import { defaultConsoleSection } from "./console-model";
import { ActionButton, IconMarker, NavItemContent, StatusPill } from "./shell-primitives";

const primaryNavItems = [
  { id: "projects", label: "Projects", marker: "PJ", description: "Project console" },
  { id: "sessions", label: "Sessions", marker: "SS", description: "Coming soon" },
  { id: "config", label: "Config", marker: "CF", description: "Coming soon" },
  { id: "help", label: "Help", marker: "HP", description: "Coming soon" },
];

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
        search: { workspace: defaultConsoleSection },
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
    <main className="min-h-dvh overflow-x-hidden bg-[radial-gradient(circle_at_top,#0f2d3a_0,#020617_34rem)] px-3 pb-24 pt-3 text-slate-100 sm:px-6 sm:pt-5 lg:px-10 lg:pb-5">
      <div className="mx-auto grid min-h-[calc(100dvh-1.5rem)] w-full max-w-7xl min-w-0 gap-4 sm:min-h-[calc(100dvh-2.5rem)] lg:grid-cols-[16rem_minmax(0,1fr)]">
        <PrimaryNav />

        <div className="flex min-w-0 flex-col gap-4">
          <header className="flex min-w-0 flex-col gap-3 rounded-[1.75rem] border border-white/10 bg-slate-950/70 px-4 py-4 shadow-2xl shadow-black/25 backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:rounded-[2rem] sm:px-5">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">
                Projects
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                Open a server Project
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                Choose a Project to continue with Agent Sessions, Terminal, Files, or Git.
              </p>
            </div>
            <ActionButton
              className="w-fit shrink-0 self-start sm:self-center"
              tone="accent"
              onClick={() => setSetupOpen(true)}
            >
              {setupVisible ? "Setup open" : "New / Adopt"}
            </ActionButton>
          </header>

          <section className="grid min-w-0 flex-1 gap-4">
            <ProjectListCard
              error={projects.error}
              isLoading={projects.isLoading}
              projects={projectItems}
              onCreateProject={() => setSetupOpen(true)}
            />

            {setupVisible ? (
              <ProjectSetupPanel
                createError={create.error instanceof Error ? create.error : null}
                inputId={inputId}
                isPending={create.isPending}
                projectPath={projectPath}
                onProjectPathChange={setProjectPath}
                onSubmit={handleSubmit}
              />
            ) : null}
          </section>
        </div>
      </div>

      <PrimaryBottomNav />
    </main>
  );
}

function PrimaryNav() {
  return (
    <aside className="hidden min-w-0 rounded-[2rem] border border-white/10 bg-slate-950/80 p-3 shadow-2xl shadow-black/30 lg:block">
      <p className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
        Agents Remote
      </p>
      <nav className="mt-3 grid gap-2" aria-label="Primary navigation">
        {primaryNavItems.map((item) => (
          <div key={item.id} className="min-w-0">
            <NavItemContent
              active={item.id === "projects"}
              description={item.description}
              label={item.label}
              marker={
                <IconMarker tone={item.id === "projects" ? "accent" : "muted"}>
                  {item.marker}
                </IconMarker>
              }
              meta={item.id === "projects" ? undefined : <StatusPill tone="muted" value="Soon" />}
            />
          </div>
        ))}
      </nav>
    </aside>
  );
}

function PrimaryBottomNav() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-slate-950/95 px-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 shadow-2xl shadow-black/40 backdrop-blur lg:hidden"
      aria-label="Primary mobile navigation"
    >
      <div className="mx-auto grid max-w-md grid-cols-4 gap-1">
        {primaryNavItems.map((item) => (
          <div key={item.id} className="min-w-0">
            <NavItemContent
              active={item.id === "projects"}
              label={item.label}
              marker={
                <IconMarker tone={item.id === "projects" ? "accent" : "muted"}>
                  {item.marker}
                </IconMarker>
              }
            />
          </div>
        ))}
      </div>
    </nav>
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
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold">Projects</h2>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            Open a Project to enter its Agent, Files, Git, and Terminal workspaces.
          </p>
        </div>
        <StatusPill tone="muted" value={`${projects.length} available`} />
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

      <div className="mt-5 grid min-w-0 gap-3">
        {projects.map((project) => (
          <ProjectEntryRow key={project.name} project={project} />
        ))}
      </div>
    </section>
  );
}

type ProjectEntryRowProps = {
  project: Project;
};

function ProjectEntryRow({ project }: ProjectEntryRowProps) {
  return (
    <Link
      className="group block min-w-0 rounded-2xl border border-slate-800 bg-slate-950/80 px-3 py-3 transition hover:border-cyan-300/60 hover:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-cyan-300/30 sm:px-4"
      params={{ projectName: project.name }}
      search={{ workspace: defaultConsoleSection }}
      to="/projects/$projectName"
    >
      <span className="flex min-w-0 items-center gap-3">
        <IconMarker tone="success">PJ</IconMarker>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-semibold text-slate-100 group-hover:text-cyan-100">
            {project.name}
          </span>
          <span className="mt-1 block truncate font-mono text-xs text-slate-500">
            {project.path}
          </span>
          <span className="mt-2 flex min-w-0 flex-wrap gap-1.5">
            <ProjectMetaPill>Agents {project.agentSessionCount}</ProjectMetaPill>
            <ProjectMetaPill>Terminals {project.terminalSessionCount}</ProjectMetaPill>
            <ProjectMetaPill>{project.gitBranch ?? "Git branch pending"}</ProjectMetaPill>
          </span>
        </span>
        <span className="shrink-0 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-xs font-semibold text-cyan-100">
          Open
        </span>
      </span>
    </Link>
  );
}

type ProjectMetaPillProps = {
  children: ReactNode;
};

function ProjectMetaPill({ children }: ProjectMetaPillProps) {
  return (
    <span className="max-w-full truncate rounded-full border border-slate-800 bg-slate-950/80 px-2.5 py-1 text-[0.7rem] font-semibold text-slate-300">
      {children}
    </span>
  );
}

type ProjectSetupPanelProps = {
  createError: Error | null;
  inputId: string;
  isPending: boolean;
  projectPath: string;
  onProjectPathChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

function ProjectSetupPanel({
  createError,
  inputId,
  isPending,
  onProjectPathChange,
  onSubmit,
  projectPath,
}: ProjectSetupPanelProps) {
  return (
    <section className="min-w-0 rounded-[1.75rem] border border-white/10 bg-slate-950/75 p-4 shadow-xl shadow-black/20 sm:rounded-[2rem] sm:p-5">
      <div className="flex min-w-0 items-start gap-3">
        <IconMarker tone="muted">+</IconMarker>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-100">Create or adopt a Project</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Use this low-frequency setup only when you need a new server folder under PROJECTS_ROOT.
          </p>
        </div>
      </div>

      <form
        className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
        onSubmit={onSubmit}
      >
        <label className="min-w-0 text-sm font-medium text-slate-200" htmlFor={inputId}>
          Project folder
          <input
            className="mt-2 w-full min-w-0 rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20"
            id={inputId}
            placeholder="demo-project"
            value={projectPath}
            onChange={(event) => onProjectPathChange(event.target.value)}
          />
        </label>
        <button
          className="rounded-2xl bg-cyan-300 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
          disabled={projectPath.trim().length === 0 || isPending}
          type="submit"
        >
          {isPending ? "Creating..." : "Create and enter"}
        </button>
      </form>
      <p className="mt-3 text-xs leading-5 text-slate-500">
        Enter a folder name or first-level path. Existing folders are adopted.
      </p>
      {createError ? (
        <p className="mt-3 rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-100">
          {createError.message}
        </p>
      ) : null}
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
