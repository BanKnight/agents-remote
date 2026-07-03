import type { Project } from "@agents-remote/shared";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type ReactNode, useId, useState, useEffect } from "react";
import { createProject, deleteProject, listProjects } from "../api/client";
import { useT } from "../i18n";
import { ShellHeaderSurface, ShellLayout, ShellPanel } from "../components/shell/shell-layout";
import {
  ActionButton,
  IconMarker,
  MobilePageHeader,
  ShellInput,
  shellSurfaceClasses,
} from "../components/shell/shell-primitives";
import { ShellIcon } from "../components/shell/icons";
import { useConfirm } from "../components/shell/confirm-dialog";
import { MobilePrimaryNav } from "../components/shell/mobile-primary-nav";

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
        to: "/projects/$key",
        params: { key: response.project.name },
      });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: deleteProject,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["projects"] }),
  });
  const { confirm, holder } = useConfirm();
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
    <ShellLayout bottomNavigation={<MobilePrimaryNav />} variant="home">
      {/* 移动端一级 page header：与实例/Settings 一致（h-11 + text-base + 无 eyebrow）。
          桌面用下方 ShellHeaderSurface（大标题 + 留白卡片），两套设计语言按断点切换。 */}
      <div className="sm:hidden">
        <MobilePageHeader
          actions={
            <button
              aria-label={t("home.createProjectAria")}
              className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary text-sm font-bold text-on-primary shadow-lg shadow-primary/30"
              onClick={() => setSetupOpen(!setupOpen)}
              type="button"
            >
              +
            </button>
          }
          title={t("home.title")}
        />
      </div>
      <div className="hidden sm:contents">
        <ShellHeaderSurface
          actions={
            <ActionButton tone="accent" onClick={() => setSetupOpen(!setupOpen)}>
              <ShellIcon name="project" className="h-3.5 w-3.5" />
              {t("home.newAdopt")}
            </ActionButton>
          }
          eyebrow={<span>{t("home.eyebrowDesktop")}</span>}
          title={t("home.title")}
          variant="home"
        />
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <ProjectListCard
          confirm={confirm}
          deleteError={deleteMutation.error instanceof Error ? deleteMutation.error : null}
          error={projects.error}
          isDeleting={deleteMutation.isPending}
          isLoading={projects.isLoading}
          projects={projectItems}
          onDeleteProject={(name) => deleteMutation.mutate(name)}
        />

        {setupVisible ? (
          <div
            className="absolute inset-0 z-20 flex flex-col items-center justify-center overflow-y-auto bg-surface-inset/60 backdrop-blur-sm"
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
      {holder}
    </ShellLayout>
  );
}

type ProjectListCardProps = {
  confirm: ReturnType<typeof useConfirm>["confirm"];
  deleteError: Error | null;
  error: Error | null;
  isDeleting: boolean;
  isLoading: boolean;
  onDeleteProject: (projectName: string) => void;
  projects: Project[];
};

function ProjectListCard({
  confirm,
  deleteError,
  error,
  isDeleting,
  isLoading,
  onDeleteProject,
  projects,
}: ProjectListCardProps) {
  const { t } = useT();
  return (
    <ShellPanel
      className="flex flex-col px-4 pt-0 sm:px-5 lg:px-5 lg:pb-5"
      density="compact"
      docked
    >
      {isLoading ? (
        <div className="grid min-w-0 gap-3">
          <ProjectCardSkeleton />
          <ProjectCardSkeleton />
          <ProjectCardSkeleton />
        </div>
      ) : null}
      {error ? <StatusPanel label={error.message} tone="danger" /> : null}
      {deleteError ? (
        <p className="mb-3 rounded-2xl border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
          {deleteError.message}
        </p>
      ) : null}
      {!isLoading && !error ? (
        projects.length === 0 ? (
          <div className="flex flex-1 min-h-0 flex-col items-center justify-start pt-6 lg:justify-center lg:pt-0">
            <div className={`rounded-2xl p-4 w-full lg:w-auto ${shellSurfaceClasses.dashed}`}>
              <p className="text-lg font-semibold text-on-surface">{t("home.emptyTitle")}</p>
              <p className="mt-2 text-sm leading-6 text-on-surface-muted">{t("home.emptyDesc")}</p>
            </div>
          </div>
        ) : (
          <div className="grid min-w-0 gap-3">
            {projects.map((project) => (
              <ProjectEntryRow
                key={project.name}
                confirm={confirm}
                isDeleting={isDeleting}
                project={project}
                onDelete={() => onDeleteProject(project.name)}
              />
            ))}
          </div>
        )
      ) : null}
    </ShellPanel>
  );
}

type ProjectEntryRowProps = {
  confirm: ReturnType<typeof useConfirm>["confirm"];
  isDeleting: boolean;
  onDelete: () => void;
  project: Project;
};

function ProjectEntryRow({ confirm, isDeleting, onDelete, project }: ProjectEntryRowProps) {
  const { t } = useT();
  return (
    <Link
      className={`group block min-w-0 rounded-xl px-3.5 py-3.5 transition focus:outline-none focus:ring-2 focus:ring-primary/30 interactive-row ${shellSurfaceClasses.raised} ${shellSurfaceClasses.raisedHover}`}
      params={{ key: project.name }}
      to="/projects/$key"
    >
      <span className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
        <IconMarker tone="success">
          <ShellIcon name="project" className="h-3.5 w-3.5" />
        </IconMarker>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.95rem] font-semibold text-on-surface group-hover:text-primary">
            {project.name}
          </span>
          <span className="mt-1 flex min-w-0 flex-wrap items-center gap-3">
            <CountBadge count={project.agentSessionCount} tone="success" />
            <CountBadge count={project.terminalSessionCount} tone="accent" />
            <ProjectMetaPill>{project.gitBranch ?? t("home.projectPending")}</ProjectMetaPill>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <ActionButton
            aria-label={t("project.deleteProject")}
            disabled={isDeleting}
            tone="danger"
            onClick={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              const ok = await confirm({
                cancelLabel: t("cancel"),
                confirmLabel: t("project.deleteProject"),
                message: t("project.deleteProjectConfirm"),
                title: t("project.deleteProject"),
                tone: "danger",
              });
              if (ok) onDelete();
            }}
          >
            <ShellIcon name="trash" className="h-3.5 w-3.5" />
          </ActionButton>
          <span className="text-primary opacity-60 transition group-hover:opacity-100 group-hover:translate-x-0.5">
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
      </span>
    </Link>
  );
}

type ProjectMetaPillProps = {
  children: ReactNode;
};

function ProjectMetaPill({ children }: ProjectMetaPillProps) {
  return (
    <span className="max-w-full truncate rounded-full border border-neutral-line/45 px-2 py-1 text-[0.68rem] font-medium text-on-surface-soft">
      {children}
    </span>
  );
}

type CountBadgeProps = {
  count: number;
  tone: "success" | "accent";
};

function CountBadge({ count, tone }: CountBadgeProps) {
  const dotColor = tone === "success" ? "bg-success" : "bg-primary";
  return (
    <span className="inline-flex items-center gap-1 text-[0.68rem] font-medium text-on-surface-soft">
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
          <h2 className="text-base font-semibold text-on-surface">{t("home.setupTitle")}</h2>
          <p className="mt-1 text-sm leading-6 text-on-surface-muted">{t("home.setupDesc")}</p>
        </div>
      </div>

      <form
        className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
        onSubmit={onSubmit}
      >
        <label className="min-w-0 text-sm font-medium text-on-surface-soft" htmlFor={inputId}>
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
          className="cursor-pointer rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-on-primary transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-neutral-line disabled:text-on-surface-muted"
          disabled={projectPath.trim().length === 0 || isPending}
          type="submit"
        >
          {isPending ? t("home.creating") : t("home.createAndEnter")}
        </button>
      </form>
      <p className="mt-3 text-xs leading-5 text-on-surface-muted">{t("home.setupHint")}</p>
      {createError ? (
        <p className="mt-3 rounded-2xl border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
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
      ? `${shellSurfaceClasses.danger} text-error`
      : `${shellSurfaceClasses.inset} text-on-surface-soft`;

  return <p className={`mt-5 rounded-2xl px-4 py-3 text-sm ${classes}`}>{label}</p>;
}

function SkeletonPulse({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-lg bg-surface-raised/70 ${className}`} />;
}

function ProjectCardSkeleton() {
  return (
    <div
      className={`block min-w-0 rounded-xl px-3.5 py-3.5 ${shellSurfaceClasses.raised}`}
      aria-hidden="true"
    >
      <span className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
        <SkeletonPulse className="h-7 w-7 rounded-full" />
        <span className="min-w-0 flex-1 space-y-2">
          <SkeletonPulse className="h-4 w-36" />
          <span className="flex items-center gap-3">
            <SkeletonPulse className="h-3 w-10 rounded-full" />
            <SkeletonPulse className="h-3 w-10 rounded-full" />
            <SkeletonPulse className="h-3 w-16 rounded-full" />
          </span>
        </span>
        <SkeletonPulse className="h-4 w-4" />
      </span>
    </div>
  );
}
