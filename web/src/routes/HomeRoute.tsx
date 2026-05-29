import type { Project } from "@agents-remote/shared";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type ReactNode, useId, useState } from "react";
import { createProject, listProjects } from "../api/client";
import { defaultConsoleSection } from "./console-model";
import {
  ShellHeaderSurface,
  ShellLayout,
  ShellPanel,
  ShellSidebar,
} from "../components/shell/shell-layout";
import {
  PrimaryShellBottomNavigation,
  PrimaryShellNavigation,
} from "../components/shell/shell-navigation";
import {
  ActionButton,
  IconMarker,
  ShellInput,
  shellSurfaceClasses,
} from "../components/shell/shell-primitives";

const primaryNavItems = [
  { id: "projects", label: "Projects", marker: "P", mobileLabel: "Projects", to: "/" as const },
  { id: "sessions", label: "Sessions", marker: "S", mobileLabel: "Sessions" },
  { id: "config", label: "Config", marker: "C", mobileLabel: "Config" },
  { id: "help", label: "Help", marker: "H", mobileLabel: "Help" },
].map((item) => ({
  ...item,
  marker: (
    <IconMarker size="sm" tone="accent">
      {item.marker}
    </IconMarker>
  ),
}));

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
    <ShellLayout bottomNavigation={<PrimaryBottomNav />} sidebar={<PrimaryNav />} variant="home">
      <ShellHeaderSurface
        actions={
          <>
            <ActionButton
              className="hidden w-fit self-start sm:inline-flex sm:self-center"
              tone="accent"
              onClick={() => setSetupOpen(true)}
            >
              {setupVisible ? "Setup open" : "New / Adopt"}
            </ActionButton>
            <button
              className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-cyan-300 to-violet-400 text-xl font-semibold text-slate-950 shadow-lg shadow-cyan-950/30 sm:hidden"
              type="button"
              aria-label="Create or adopt Project"
              onClick={() => setSetupOpen(true)}
            >
              +
            </button>
          </>
        }
        eyebrow={
          <>
            <span className="hidden sm:inline">
              Open a server Project to continue with Agent, Files, Git, or Terminal.
            </span>
            <span className="sm:hidden">Open a Project to continue.</span>
          </>
        }
        title="Projects"
        variant="home"
      />

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
    </ShellLayout>
  );
}

function PrimaryNav() {
  return (
    <ShellSidebar>
      <PrimaryShellNavigation
        activeItemId="projects"
        brand={
          <>
            <IconMarker size="sm" tone="accent">
              AR
            </IconMarker>
            <span>Agents Remote</span>
          </>
        }
        items={primaryNavItems}
      />
    </ShellSidebar>
  );
}

function PrimaryBottomNav() {
  return <PrimaryShellBottomNavigation activeItemId="projects" items={primaryNavItems} />;
}

type ProjectListCardProps = {
  error: Error | null;
  isLoading: boolean;
  projects: Project[];
  onCreateProject: () => void;
};

function ProjectListCard({ error, isLoading, onCreateProject, projects }: ProjectListCardProps) {
  return (
    <ShellPanel className="px-4 pb-5 pt-0 sm:px-5 lg:px-5 lg:pb-5" density="compact" docked>
      {isLoading ? <StatusPanel label="Loading Projects..." /> : null}
      {error ? <StatusPanel label={error.message} tone="danger" /> : null}
      {!isLoading && !error && projects.length === 0 ? (
        <div className={`rounded-2xl p-4 ${shellSurfaceClasses.dashed}`}>
          <p className="text-lg font-semibold text-slate-100">No Projects yet</p>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Create or adopt a Project to enter the console shell.
          </p>
          <button
            className="mt-4 rounded-xl bg-gradient-to-br from-cyan-300 to-violet-400 px-4 py-2 text-sm font-semibold text-slate-950"
            type="button"
            onClick={onCreateProject}
          >
            Create or adopt Project
          </button>
        </div>
      ) : null}

      <div className="grid min-w-0 gap-3">
        {projects.map((project) => (
          <ProjectEntryRow key={project.name} project={project} />
        ))}
      </div>
    </ShellPanel>
  );
}

type ProjectEntryRowProps = {
  project: Project;
};

function ProjectEntryRow({ project }: ProjectEntryRowProps) {
  return (
    <Link
      className={`group block min-w-0 rounded-[1.25rem] px-3.5 py-3.5 transition focus:outline-none focus:ring-2 focus:ring-cyan-300/30 ${shellSurfaceClasses.raised} ${shellSurfaceClasses.raisedHover}`}
      params={{ projectName: project.name }}
      search={{ workspace: defaultConsoleSection }}
      to="/projects/$projectName"
    >
      <span className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
        <IconMarker tone="success">P</IconMarker>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.95rem] font-semibold text-slate-100 group-hover:text-cyan-100">
            {project.name}
          </span>
          <span className="mt-1 block truncate font-mono text-xs text-slate-400">
            {project.path}
          </span>
          <span className="mt-2 flex min-w-0 flex-wrap gap-2">
            <ProjectMetaPill>Agent {project.agentSessionCount}</ProjectMetaPill>
            <ProjectMetaPill>Terminal {project.terminalSessionCount}</ProjectMetaPill>
            <ProjectMetaPill>{project.gitBranch ?? "pending"}</ProjectMetaPill>
          </span>
        </span>
        <span className="shrink-0 text-xs font-extrabold text-cyan-300">Open</span>
      </span>
    </Link>
  );
}

type ProjectMetaPillProps = {
  children: ReactNode;
};

function ProjectMetaPill({ children }: ProjectMetaPillProps) {
  return (
    <span className="max-w-full truncate rounded-full border border-slate-700/45 px-2 py-1 text-[0.68rem] font-medium text-slate-300">
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
    <ShellPanel density="default">
      <div className="flex min-w-0 items-start gap-3">
        <IconMarker size="sm" tone="muted">
          +
        </IconMarker>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-100">Create or adopt a Project</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Use setup only when you need a new server folder under PROJECTS_ROOT.
          </p>
        </div>
      </div>

      <form
        className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
        onSubmit={onSubmit}
      >
        <label className="min-w-0 text-sm font-medium text-slate-200" htmlFor={inputId}>
          Project folder
          <ShellInput
            className="mt-2"
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
    </ShellPanel>
  );
}

type StatusPanelProps = {
  label: string;
  tone?: "default" | "danger";
};

function StatusPanel({ label, tone = "default" }: StatusPanelProps) {
  const classes =
    tone === "danger"
      ? `${shellSurfaceClasses.danger} text-red-100`
      : `${shellSurfaceClasses.inset} text-slate-300`;

  return <p className={`mt-5 rounded-2xl px-4 py-3 text-sm ${classes}`}>{label}</p>;
}
