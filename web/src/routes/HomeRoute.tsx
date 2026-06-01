import type { Project } from "@agents-remote/shared";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type ReactNode, useId, useState, useEffect } from "react";
import { createProject, listProjects } from "../api/client";
import { useT } from "../i18n";
import { defaultConsoleSection } from "./console-model";
import { ShellHeaderSurface, ShellLayout, ShellPanel } from "../components/shell/shell-layout";
import {
  ActionButton,
  IconMarker,
  ShellInput,
  shellSurfaceClasses,
} from "../components/shell/shell-primitives";
import { ShellIcon } from "../components/shell/icons";

export function HomeRoute() {
  const { t } = useT();
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
        search: { workspace: defaultConsoleSection, filesPath: "" },
      });
    },
  });
  const setupVisible = setupOpen || create.isPending || create.error instanceof Error;

  useEffect(() => {
    if (!setupOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSetupOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [setupOpen]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedPath = projectPath.trim();

    if (trimmedPath.length === 0 || create.isPending) {
      return;
    }

    create.mutate(trimmedPath);
  };

  return (
    <ShellLayout variant="home">
      <ShellHeaderSurface
        actions={
          <>
            <ActionButton
              className="hidden sm:inline-flex"
              tone="accent"
              onClick={() => setSetupOpen(!setupOpen)}
            >
              <ShellIcon name="project" className="h-3.5 w-3.5" />
              {t("home.newAdopt")}
            </ActionButton>
            <button
              className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-xl bg-gradient-to-br from-cyan-300 to-violet-400 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-950/30 sm:hidden"
              type="button"
              aria-label={t("home.createProjectAria")}
              onClick={() => setSetupOpen(!setupOpen)}
            >
              +
            </button>
          </>
        }
        eyebrow={
          <>
            <span className="hidden sm:inline">{t("home.eyebrowDesktop")}</span>
            <span className="sm:hidden">{t("home.eyebrowMobile")}</span>
          </>
        }
        title={t("home.title")}
        variant="home"
      />

      <div className="relative flex min-h-0 flex-1 flex-col">
        <ProjectListCard
          error={projects.error}
          isLoading={projects.isLoading}
          projects={projectItems}
        />

        {setupVisible ? (
          <div
            className="absolute inset-0 z-20 flex flex-col items-center justify-center overflow-y-auto bg-slate-950/60 backdrop-blur-sm"
            onClick={() => setSetupOpen(false)}
            aria-hidden="true"
          >
            <div className="p-4" onClick={(e) => e.stopPropagation()} aria-hidden="true">
              <ProjectSetupPanel
                createError={create.error instanceof Error ? create.error : null}
                inputId={inputId}
                isPending={create.isPending}
                projectPath={projectPath}
                onProjectPathChange={setProjectPath}
                onSubmit={handleSubmit}
              />
            </div>
          </div>
        ) : null}
      </div>
    </ShellLayout>
  );
}

type ProjectListCardProps = {
  error: Error | null;
  isLoading: boolean;
  projects: Project[];
};

function ProjectListCard({ error, isLoading, projects }: ProjectListCardProps) {
  const { t } = useT();
  return (
    <ShellPanel
      className="flex flex-col px-4 pt-0 sm:px-5 lg:px-5 lg:pb-5"
      density="compact"
      docked
    >
      {isLoading ? <StatusPanel label={t("home.loading")} /> : null}
      {error ? <StatusPanel label={error.message} tone="danger" /> : null}
      {!isLoading && !error ? (
        projects.length === 0 ? (
          <div className="flex flex-1 min-h-0 flex-col items-center justify-start pt-6 lg:justify-center lg:pt-0">
            <div className={`rounded-2xl p-4 w-full lg:w-auto ${shellSurfaceClasses.dashed}`}>
              <p className="text-lg font-semibold text-slate-100">{t("home.emptyTitle")}</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">{t("home.emptyDesc")}</p>
            </div>
          </div>
        ) : (
          <div className="grid min-w-0 gap-3">
            {projects.map((project) => (
              <ProjectEntryRow key={project.name} project={project} />
            ))}
          </div>
        )
      ) : null}
    </ShellPanel>
  );
}

type ProjectEntryRowProps = {
  project: Project;
};

function ProjectEntryRow({ project }: ProjectEntryRowProps) {
  const { t } = useT();
  return (
    <Link
      className={`group block min-w-0 rounded-[1.25rem] px-3.5 py-3.5 transition focus:outline-none focus:ring-2 focus:ring-cyan-300/30 ${shellSurfaceClasses.raised} ${shellSurfaceClasses.raisedHover}`}
      params={{ projectName: project.name }}
      search={{ workspace: defaultConsoleSection, filesPath: "" }}
      to="/projects/$projectName"
    >
      <span className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
        <IconMarker tone="success">
          <ShellIcon name="project" className="h-3.5 w-3.5" />
        </IconMarker>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.95rem] font-semibold text-slate-100 group-hover:text-cyan-100">
            {project.name}
          </span>
          <span className="mt-1 flex min-w-0 flex-wrap items-center gap-3">
            <CountBadge count={project.agentSessionCount} tone="success" />
            <CountBadge count={project.terminalSessionCount} tone="accent" />
            <ProjectMetaPill>{project.gitBranch ?? t("home.projectPending")}</ProjectMetaPill>
          </span>
        </span>
        <span className="shrink-0 text-cyan-300 opacity-60 transition group-hover:opacity-100 group-hover:translate-x-0.5">
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M6 3L11 8l-5 5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
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
    <span className="max-w-full truncate rounded-full border border-slate-700/45 px-2 py-1 text-[0.68rem] font-medium text-slate-300">
      {children}
    </span>
  );
}

type CountBadgeProps = {
  count: number;
  tone: "success" | "accent";
};

function CountBadge({ count, tone }: CountBadgeProps) {
  const dotColor = tone === "success" ? "bg-emerald-300" : "bg-cyan-300";
  return (
    <span className="inline-flex items-center gap-1 text-[0.68rem] font-medium text-slate-300">
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${dotColor}`} aria-hidden="true" />
      {count}
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
  const { t } = useT();
  return (
    <ShellPanel density="default">
      <div className="flex min-w-0 items-start gap-3">
        <IconMarker size="sm" tone="muted">
          +
        </IconMarker>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-100">{t("home.setupTitle")}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">{t("home.setupDesc")}</p>
        </div>
      </div>

      <form
        className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
        onSubmit={onSubmit}
      >
        <label className="min-w-0 text-sm font-medium text-slate-200" htmlFor={inputId}>
          {t("home.folderLabel")}
          <ShellInput
            className="mt-2"
            id={inputId}
            placeholder={t("home.folderPlaceholder")}
            value={projectPath}
            onChange={(event) => onProjectPathChange(event.target.value)}
          />
        </label>
        <button
          className="cursor-pointer rounded-2xl bg-cyan-300 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
          disabled={projectPath.trim().length === 0 || isPending}
          type="submit"
        >
          {isPending ? t("home.creating") : t("home.createAndEnter")}
        </button>
      </form>
      <p className="mt-3 text-xs leading-5 text-slate-500">{t("home.setupHint")}</p>
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
