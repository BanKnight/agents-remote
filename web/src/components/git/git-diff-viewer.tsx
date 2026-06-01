import type {
  GitDiffFileStatus,
  GitDiffFileSummary,
  GitDiffScope,
  GitFileDiffResponse,
} from "@agents-remote/shared";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listProjectGitDiff, getProjectGitFileDiff } from "../../api/client";
import { IconMarker, ListRow, type ShellTone } from "../shell/shell-primitives";
import { ResourceStatePanel } from "../files/file-browser";

// ── Helpers ───────────────────────────────────────────────────────

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

// ── Sub-components ────────────────────────────────────────────────

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
          <ListRow
            key={`${file.scope}:${file.path}`}
            marker={
              <IconMarker size="sm" tone="muted">
                FL
              </IconMarker>
            }
            meta={
              <IconMarker size="sm" tone={gitStatusTone(file.status)}>
                {statusShortLabel(file.status)}
              </IconMarker>
            }
            selected={selected}
            subtitle={file.previousPath ? `from ${file.previousPath}` : undefined}
            title={<span className="font-mono text-[0.82rem]">{file.path}</span>}
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
  fileName?: string;
  onBack: () => void;
};

function GitFileDiffPanel({ error, fileDiff, isLoading, fileName, onBack }: GitFileDiffPanelProps) {
  if (!fileDiff && !isLoading && !error)
    return (
      <div className="flex-1 flex items-start sm:items-center justify-center p-4 pt-10 sm:pt-4">
        <ResourceStatePanel
          title="Select a changed file"
          message="Unified diff output is shown read-only."
        />
      </div>
    );

  const displayName = fileDiff?.path ?? fileName ?? "";
  const displayStatus = fileDiff?.status;

  return (
    <section
      className="min-h-0 min-w-0 flex-1 flex flex-col bg-[#141b28]/25"
      aria-label="Git file diff"
    >
      <div className="flex min-w-0 items-center gap-2 border-b border-slate-700/40 px-3.5 py-2.5">
        <button
          className="flex shrink-0 cursor-pointer items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-400 transition hover:bg-slate-700/50 hover:text-slate-200 sm:hidden"
          type="button"
          onClick={onBack}
          aria-label="Back to changed files"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M10 3L5 8l5 5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Back
        </button>
        <div className="min-w-0 flex-1">
          <h4 className="truncate font-mono text-sm font-semibold text-slate-100 sm:text-left text-center">
            {displayName}
          </h4>
          {fileDiff?.previousPath ? (
            <p className="mt-0.5 truncate font-mono text-[0.65rem] text-slate-500 hidden sm:block">
              renamed from {fileDiff.previousPath}
            </p>
          ) : null}
        </div>
        {displayStatus ? (
          <IconMarker size="sm" tone={gitStatusTone(displayStatus)}>
            {statusShortLabel(displayStatus)}
          </IconMarker>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 flex flex-col overflow-hidden">
        {isLoading ? (
          <div className="flex-1 flex flex-col items-center gap-3 pt-10 sm:justify-center sm:pt-0">
            <span className="relative flex h-3 w-3" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-300 opacity-60" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-cyan-200" />
            </span>
            <span className="text-xs font-semibold text-slate-400">Loading diff...</span>
          </div>
        ) : error ? (
          <div className="flex-1 flex items-start sm:items-center justify-center p-4 pt-10 sm:pt-4">
            <ResourceStatePanel
              tone="danger"
              title="Unable to open this diff."
              message={error.message}
            />
          </div>
        ) : fileDiff ? (
          <DiffContent diff={fileDiff.diff} />
        ) : null}
      </div>
    </section>
  );
}

type DiffLineType = "header" | "hunk" | "add" | "del" | "context";

type DiffLine = {
  type: DiffLineType;
  content: string;
  oldLine?: number;
  newLine?: number;
};

function parseDiff(diff: string): DiffLine[] {
  const lines = diff.split("\n");
  const result: DiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;

  for (const line of lines) {
    if (
      line.startsWith("diff --git") ||
      line.startsWith("index ") ||
      line.startsWith("---") ||
      line.startsWith("+++")
    ) {
      result.push({ type: "header", content: line });
    } else if (line.startsWith("@@")) {
      const match = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (match) {
        oldLine = parseInt(match[1], 10) - 1;
        newLine = parseInt(match[3], 10) - 1;
      }
      result.push({ type: "hunk", content: line });
    } else if (line.startsWith("+")) {
      newLine++;
      result.push({ type: "add", content: line, newLine });
    } else if (line.startsWith("-")) {
      oldLine++;
      result.push({ type: "del", content: line, oldLine });
    } else if (line.startsWith(" ")) {
      oldLine++;
      newLine++;
      result.push({ type: "context", content: line, oldLine, newLine });
    } else {
      result.push({ type: "context", content: line });
    }
  }

  return result;
}

const diffLineClasses: Record<DiffLineType, string> = {
  header: "text-slate-500",
  hunk: "text-cyan-300/80 bg-cyan-300/5",
  add: "text-emerald-300 bg-emerald-300/5",
  del: "text-rose-300 bg-rose-300/5",
  context: "text-slate-300",
};

function DiffContent({ diff }: { diff: string }) {
  const lines = parseDiff(diff);

  return (
    <div className="min-h-0 flex-1 overflow-auto font-mono text-xs leading-5 sm:text-sm">
      <table className="w-full border-collapse">
        <tbody>
          {lines.map((line, i) => (
            <tr key={i} className={diffLineClasses[line.type]}>
              <td className="select-none pr-2 pl-3 text-right w-1 align-top whitespace-nowrap text-slate-600 sm:pl-4 sm:w-12">
                {line.oldLine !== undefined ? line.oldLine : ""}
              </td>
              <td className="select-none pr-2 text-right w-1 align-top whitespace-nowrap text-slate-600 sm:w-12">
                {line.newLine !== undefined ? line.newLine : ""}
              </td>
              <td className="pr-3 align-top whitespace-pre-wrap break-words sm:pr-4">
                {line.content}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
  shortLabel,
  tone,
}: {
  count?: number;
  label: string;
  shortLabel?: string;
  tone?: "success" | "warning" | "danger";
}) {
  const colorClass = tone ? scopeChipToneClasses[tone] : scopeChipDefault;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${colorClass}`}
    >
      <span className="sm:hidden">{shortLabel ?? label}</span>
      <span className="hidden sm:inline">{label}</span>
      {count !== undefined && count > 0 ? (
        <span className="text-[0.62rem] font-bold tabular-nums opacity-80">{count}</span>
      ) : null}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────

export type GitDiffPanelProps = {
  projectName: string;
  /** Query-key segment for cache isolation. Default "git". */
  queryScope?: string;
  onDeepDetailChange?: (open: boolean) => void;
};

export function GitDiffPanel({
  projectName,
  queryScope = "git",
  onDeepDetailChange,
}: GitDiffPanelProps) {
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

  if (diff.isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center gap-3 pt-10 sm:justify-center sm:pt-0">
        <span className="relative flex h-3 w-3" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-300 opacity-60" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-cyan-200" />
        </span>
        <span className="text-xs font-semibold text-slate-400">Loading Git changes...</span>
      </div>
    );
  }

  if (diff.error) {
    return (
      <div className="flex-1 flex items-start sm:items-center justify-center p-4 pt-10 sm:pt-4">
        <ResourceStatePanel
          tone="danger"
          title="Unable to load Git changes."
          message={diff.error.message}
        />
      </div>
    );
  }

  if (diff.data?.repository === false) {
    return (
      <div className="flex-1 flex items-start sm:items-center justify-center p-4 pt-10 sm:pt-4">
        <ResourceStatePanel
          title="Not a Git repository"
          message="This Project directory does not have Git metadata."
        />
      </div>
    );
  }

  const changedFiles = diff.data?.files ?? [];
  const isFileSelected = selectedFile !== undefined;

  const scopeChips = (
    <div className="flex flex-wrap gap-1.5">
      <GitScopeChip label="All" count={(gitSummary?.staged ?? 0) + (gitSummary?.worktree ?? 0)} />
      <GitScopeChip
        label="Modified"
        shortLabel="M"
        count={gitSummary?.modified ?? 0}
        tone="warning"
      />
      <GitScopeChip label="Added" shortLabel="A" count={gitSummary?.added ?? 0} tone="success" />
      <GitScopeChip label="Deleted" shortLabel="D" count={gitSummary?.deleted ?? 0} tone="danger" />
    </div>
  );

  const fileList = (
    <GitFileList files={changedFiles} selectedFile={selectedFile} onSelectFile={setSelectedFile} />
  );

  const diffPanel = (
    <GitFileDiffPanel
      error={fileDiff.error}
      isLoading={fileDiff.isLoading}
      fileDiff={fileDiff.data}
      fileName={selectedFile?.path.split("/").pop() ?? selectedFile?.path}
      onBack={clearDiff}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col sm:overflow-hidden">
      <div
        className={`border-b border-slate-700/40 px-3.5 py-3 ${isFileSelected ? "hidden sm:block" : "block"}`}
      >
        {scopeChips}
      </div>
      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        <aside
          className={`min-h-0 flex-1 sm:flex-none sm:w-[19.375rem] sm:shrink-0 sm:border-r sm:border-slate-700/60 ${isFileSelected ? "hidden sm:flex sm:flex-col" : "flex flex-col"}`}
        >
          <div className="min-h-0 overflow-y-auto p-3">{fileList}</div>
        </aside>
        <div
          className={`flex min-h-0 min-w-0 flex-1 flex-col ${selectedFile === undefined ? "hidden sm:flex" : "flex"}`}
        >
          <div className="min-h-0 flex-1 flex flex-col overflow-hidden">{diffPanel}</div>
        </div>
      </div>
    </div>
  );
}
