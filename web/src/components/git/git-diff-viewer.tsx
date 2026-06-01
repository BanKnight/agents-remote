import type {
  GitDiffFileStatus,
  GitDiffFileSummary,
  GitDiffScope,
  GitFileDiffResponse,
} from "@agents-remote/shared";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listProjectGitDiff, getProjectGitFileDiff } from "../../api/client";
import {
  ActionButton,
  IconMarker,
  StatusPill,
  shellSurfaceClasses,
  type ShellTone,
} from "../shell/shell-primitives";
import { ResourceStatePanel } from "../files/file-browser";

// ── Helpers ───────────────────────────────────────────────────────

export const scopeLabel = (scope: GitDiffScope) => (scope === "staged" ? "Staged" : "Worktree");

export const statusLabel = (status: GitDiffFileStatus) => {
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

const statusShortLabel = (status: GitDiffFileStatus) => {
  switch (status) {
    case "added":
      return "A";
    case "deleted":
      return "D";
    case "renamed":
      return "R";
    case "modified":
      return "M";
  }
};

const gitStatusTone = (status: GitDiffFileStatus): ShellTone => {
  switch (status) {
    case "added":
      return "success";
    case "deleted":
      return "danger";
    case "renamed":
      return "accent";
    case "modified":
      return "warning";
  }
};

type GitSummary = {
  added: number;
  deleted: number;
  modified: number;
  renamed: number;
  staged: number;
  worktree: number;
};

const summarizeGitFiles = (files: GitDiffFileSummary[]): GitSummary =>
  files.reduce<GitSummary>(
    (s, f) => ({ ...s, [f.scope]: s[f.scope] + 1, [f.status]: s[f.status] + 1 }),
    { added: 0, deleted: 0, modified: 0, renamed: 0, staged: 0, worktree: 0 },
  );

function useMediaQuery(query: string) {
  const getMatches = () => window.matchMedia?.(query).matches ?? false;
  const [matches, setMatches] = useState(getMatches);
  useEffect(() => {
    const media = window.matchMedia?.(query);
    if (!media) return;
    const handler = () => setMatches(media.matches);
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, [query]);
  return matches;
}

// ── Sub-components ────────────────────────────────────────────────

type GitStatusHeaderProps = {
  fileCount?: number;
  onRetry: () => void;
  projectBranch?: string;
  projectName: string;
};

function GitStatusHeader({ fileCount, onRetry, projectBranch, projectName }: GitStatusHeaderProps) {
  return (
    <div className={`min-w-0 rounded-2xl p-3 sm:p-4 ${shellSurfaceClasses.inset}`}>
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
            Project / {projectName} / Git
          </p>
          <p className="mt-1 text-lg font-semibold text-slate-100 sm:text-[1.35rem]">Git status</p>
          <p className="mt-1 text-sm text-slate-400">
            Worktree and staged changes are shown for inspection only.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <StatusPill
            tone="muted"
            value={`${projectBranch ?? "main"} · ${fileCount ?? 0} changed · read-only`}
          />
          <ActionButton tone="accent" onClick={onRetry}>
            Retry
          </ActionButton>
        </div>
      </div>
    </div>
  );
}

type SelectedGitFile = { path: string; scope: GitDiffScope };

type GitFileListProps = {
  files: GitDiffFileSummary[];
  selectedFile: SelectedGitFile | undefined;
  onSelectFile: (file: SelectedGitFile) => void;
};

function GitFileList({ files, onSelectFile, selectedFile }: GitFileListProps) {
  if (files.length === 0)
    return (
      <ResourceStatePanel
        title="No changes"
        message="Worktree and staged changes will appear here."
      />
    );

  return (
    <div className="grid gap-1.5" aria-label="Git changed files">
      {files.map((file) => {
        const selected = selectedFile?.path === file.path && selectedFile.scope === file.scope;
        return (
          <button
            key={`${file.scope}:${file.path}`}
            className={`grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-[0.875rem] border px-3 py-2.5 text-left transition ${
              selected
                ? "border-cyan-300/60 bg-cyan-300/10"
                : "border-slate-700/40 bg-[#141b28]/72 hover:border-cyan-300/30 hover:bg-[#141b28]/92"
            }`}
            type="button"
            onClick={() => onSelectFile({ path: file.path, scope: file.scope })}
          >
            <IconMarker size="sm" tone={gitStatusTone(file.status)}>
              {statusShortLabel(file.status)}
            </IconMarker>
            <span className="min-w-0">
              <span className="block truncate font-mono text-[0.82rem] font-semibold text-slate-100">
                {file.path}
              </span>
              {file.previousPath ? (
                <span className="mt-0.5 block truncate font-mono text-[0.68rem] text-slate-500">
                  from {file.previousPath}
                </span>
              ) : (
                <span className="mt-0.5 block text-[0.68rem] uppercase tracking-[0.16em] text-slate-500">
                  {scopeLabel(file.scope)}
                </span>
              )}
            </span>
            <StatusPill tone={gitStatusTone(file.status)} value={statusLabel(file.status)} />
          </button>
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
  if (isLoading) return <ResourceStatePanel tone="inset" message="Loading diff..." />;
  if (error)
    return (
      <ResourceStatePanel tone="danger" title="Unable to open this diff." message={error.message} />
    );
  if (!fileDiff)
    return (
      <ResourceStatePanel
        title="Select a changed file"
        message="Unified diff output is shown read-only."
      />
    );

  return (
    <section
      className={`grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-2xl ${shellSurfaceClasses.raised}`}
      aria-label="Git file diff"
    >
      <div className="flex min-w-0 items-start justify-between gap-2 border-b border-slate-700/40 px-3 py-3 sm:px-4">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <IconMarker size="sm" tone={gitStatusTone(fileDiff.status)}>
              {statusShortLabel(fileDiff.status)}
            </IconMarker>
            <div className="min-w-0">
              <h4 className="truncate font-mono text-sm font-semibold text-slate-100 sm:text-[0.92rem]">
                {fileDiff.path}
              </h4>
              <p className="mt-0.5 text-[0.68rem] uppercase tracking-[0.16em] text-slate-500">
                unified diff · read-only · {scopeLabel(fileDiff.scope).toLowerCase()}
              </p>
            </div>
          </div>
          {fileDiff.previousPath ? (
            <p className="mt-2 truncate font-mono text-xs text-slate-500">
              from {fileDiff.previousPath}
            </p>
          ) : null}
        </div>
        <StatusPill
          tone="muted"
          value={`${scopeLabel(fileDiff.scope)} · ${statusLabel(fileDiff.status)}`}
        />
      </div>
      <pre
        className={`min-h-0 overflow-auto whitespace-pre-wrap break-words px-3 py-3 font-mono text-xs leading-5 text-slate-100 sm:px-4 sm:text-sm ${shellSurfaceClasses.code}`}
      >
        {fileDiff.diff}
      </pre>
    </section>
  );
}

// ── Layout ────────────────────────────────────────────────────────

const scopeChipToneClasses: Record<"success" | "warning" | "danger", string> = {
  success: "border-emerald-300/30 bg-emerald-300/10 text-emerald-100",
  warning: "border-amber-300/30 bg-amber-300/10 text-amber-100",
  danger: "border-rose-300/30 bg-rose-300/10 text-rose-100",
};

const scopeChipDefault = "border-slate-700/60 bg-slate-950/70 text-slate-400";

function GitScopeChip({
  count,
  label,
  tone,
}: {
  count?: number;
  label: string;
  tone?: "success" | "warning" | "danger";
}) {
  const colorClass = tone ? scopeChipToneClasses[tone] : scopeChipDefault;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${colorClass}`}
    >
      {count !== undefined ? (
        <span className="text-[0.62rem] font-bold tabular-nums opacity-80">{count}</span>
      ) : null}
      {label}
    </span>
  );
}

function GitWorkspaceSidebar({
  children,
  statusCounts,
}: {
  children: ReactNode;
  statusCounts: GitSummary | undefined;
}) {
  return (
    <div className={`grid min-h-0 gap-3 rounded-2xl p-3 ${shellSurfaceClasses.inset}`}>
      <div className="flex flex-wrap gap-1.5">
        <GitScopeChip
          label="All"
          count={(statusCounts?.staged ?? 0) + (statusCounts?.worktree ?? 0)}
        />
        <GitScopeChip label="Modified" count={statusCounts?.modified ?? 0} tone="warning" />
        <GitScopeChip label="Added" count={statusCounts?.added ?? 0} tone="success" />
        <GitScopeChip label="Deleted" count={statusCounts?.deleted ?? 0} tone="danger" />
      </div>
      <div className="min-h-0">{children}</div>
    </div>
  );
}

function GitWorkspaceLayout({
  changedFileList,
  diffPanel,
  statusCounts,
}: {
  changedFileList: ReactNode;
  diffPanel: ReactNode;
  statusCounts: GitSummary | undefined;
}) {
  return (
    <section className="grid min-h-0 gap-3 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]">
      <aside className="grid min-h-0 gap-3">
        <GitWorkspaceSidebar statusCounts={statusCounts}>{changedFileList}</GitWorkspaceSidebar>
      </aside>
      {diffPanel}
    </section>
  );
}

function MobileDetailHeader({
  backLabel,
  label,
  onBack,
  title,
}: {
  backLabel: string;
  label: string;
  onBack: () => void;
  title: string;
}) {
  return (
    <div className={`min-w-0 rounded-2xl p-3 sm:hidden ${shellSurfaceClasses.raised}`}>
      <ActionButton tone="default" onClick={onBack}>
        ← {backLabel}
      </ActionButton>
      <div className="mt-1 min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
        <p className="mt-0.5 truncate font-mono text-sm font-semibold text-slate-100">{title}</p>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────

export type GitDiffPanelProps = {
  projectName: string;
  projectBranch?: string;
  /** Query-key segment for cache isolation. Default "git". */
  queryScope?: string;
  /** Show the status/toolbar header. Default true. */
  showStatusHeader?: boolean;
  onDeepDetailChange?: (open: boolean) => void;
  onRetry?: () => void;
};

export function GitDiffPanel({
  projectName,
  projectBranch,
  queryScope = "git",
  showStatusHeader = true,
  onDeepDetailChange,
  onRetry,
}: GitDiffPanelProps) {
  const showDesktopGitLayout = useMediaQuery("(min-width: 640px)");
  const [selectedFile, setSelectedFile] = useState<SelectedGitFile | undefined>();
  const diff = useQuery({
    queryKey: ["projects", projectName, queryScope, "diff"],
    queryFn: () => listProjectGitDiff(projectName),
  });
  const fileDiff = useQuery({
    enabled: selectedFile !== undefined,
    queryKey: [
      "projects",
      projectName,
      queryScope,
      "diff",
      selectedFile?.scope,
      selectedFile?.path,
    ],
    queryFn: () =>
      getProjectGitFileDiff(
        projectName,
        selectedFile?.scope ?? "worktree",
        selectedFile?.path ?? "",
      ),
  });

  useEffect(() => {
    onDeepDetailChange?.(selectedFile !== undefined);
    return () => onDeepDetailChange?.(false);
  }, [onDeepDetailChange, selectedFile]);

  const clearDiff = () => setSelectedFile(undefined);
  const gitSummary =
    diff.data?.repository === true ? summarizeGitFiles(diff.data.files) : undefined;
  const changedFileCount = diff.data?.repository === true ? diff.data.files.length : undefined;

  const statusToolbar = showStatusHeader ? (
    <GitStatusHeader
      projectBranch={projectBranch}
      projectName={projectName}
      fileCount={changedFileCount}
      onRetry={() => {
        setSelectedFile(undefined);
        void diff.refetch();
        onRetry?.();
      }}
    />
  ) : null;

  const loadingState = diff.isLoading ? (
    <ResourceStatePanel tone="inset" message="Loading Git changes..." />
  ) : null;
  const errorState = diff.error ? (
    <ResourceStatePanel
      tone="danger"
      title="Unable to load Git changes."
      message={diff.error.message}
    />
  ) : null;
  const notRepositoryState =
    diff.data?.repository === false ? (
      <ResourceStatePanel
        title="Not a Git repository"
        message="This Project directory does not have Git metadata."
      />
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

  const mobileView =
    selectedFile !== undefined ? (
      <div className="grid gap-3 sm:hidden">
        <MobileDetailHeader
          label="Git diff"
          title={selectedFile.path}
          backLabel="Back to changed files"
          onBack={clearDiff}
        />
        {diffPanel}
      </div>
    ) : (
      <div className="sm:hidden">
        <GitWorkspaceSidebar statusCounts={gitSummary}>{changedFileList}</GitWorkspaceSidebar>
      </div>
    );

  return (
    <div className="grid gap-3">
      {selectedFile === undefined ? (
        statusToolbar
      ) : (
        <div className="hidden sm:block">{statusToolbar}</div>
      )}
      {loadingState}
      {errorState}
      {notRepositoryState}
      {diff.data?.repository === true ? (
        showDesktopGitLayout ? (
          <GitWorkspaceLayout
            changedFileList={changedFileList}
            diffPanel={diffPanel}
            statusCounts={gitSummary}
          />
        ) : (
          mobileView
        )
      ) : null}
    </div>
  );
}
