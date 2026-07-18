import type { GitDiffFileStatus, GitDiffFileSummary, GitDiffScope } from "@agents-remote/shared";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listProjectGitDiff, getProjectGitFileDiff } from "../../api/client";
import { useT } from "../../i18n";
import { useMobileExitClose } from "../../lib/use-mobile-exit-close";
import {
  IconMarker,
  ListGroup,
  ListRow,
  ListRowSkeleton,
  pillToneClasses,
  type ShellTone,
} from "../shell/shell-primitives";
import { ShellIcon } from "../shell/icons";
import { ResourceStatePanel } from "../files/file-browser";

// ── Query-key 隔离段（cache 隔离，避免互相 invalidate）──────────────────────────
/** 中栏 git tab 的 file diff query-key 隔离段（PanelRouter GitFileDiffPanel 默认）。 */
const WORKBENCH_GIT_TAB_QUERY_SCOPE = "git-tab";
/** 左栏 git middle tab 的 list diff query-key 隔离段（GitChangesList 专用）。 */
const WORKBENCH_GIT_LEFT_QUERY_SCOPE = "workbench-git-left";

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
  const { t } = useT();

  if (files.length === 0)
    return (
      <div className="flex flex-1 min-h-0 flex-col items-center justify-start pt-6 lg:justify-center lg:pt-0">
        <div className="w-full lg:w-auto">
          <ResourceStatePanel title={t("git.noChanges")} message={t("git.noChangesDesc")} />
        </div>
      </div>
    );

  return (
    <ListGroup ariaLabel="Git changed files">
      {files.map((file) => {
        const selected = selectedFile?.path === file.path && selectedFile.scope === file.scope;
        return (
          <ListRow
            key={`${file.scope}:${file.path}`}
            marker={
              <IconMarker size="sm" tone="muted">
                <ShellIcon name="file" className="h-4 w-4" />
              </IconMarker>
            }
            meta={
              <IconMarker size="sm" tone={gitStatusTone(file.status)}>
                {statusShortLabel(file.status)}
              </IconMarker>
            }
            selected={selected}
            subtitle={
              file.previousPath ? t("git.fromPath", { path: file.previousPath }) : undefined
            }
            title={<span className="font-mono text-[0.82rem]">{file.path}</span>}
            onClick={() => onSelectFile({ path: file.path, scope: file.scope })}
          />
        );
      })}
    </ListGroup>
  );
}

export type GitFileDiffPanelProps = {
  projectName: string;
  scope: GitDiffScope;
  path: string;
  /** Query-key 隔离段（默认中栏 git tab 段，右栏 inspection 传其 queryScope）。 */
  queryScope?: string;
  /** 可选关闭回调（移动浮层关闭按钮，仅 sm:hidden 渲染；中栏 tab 不传，由 tab ✕ 关闭）。 */
  onClose?: () => void;
};

/**
 * 单文件 git diff 面板（自带 query，设计 workbench-layout-fix 阶段 3）。两处复用：① 中栏 git tab
 *（PanelRouter，onClose 不传，关闭走 tab ✕）；② GitDiffPanel 右栏 inspection（传 onClose=clearDiff，
 * 移动浮层关闭）。path 为空 → 未选态（selectPrompt）；非空 → getProjectGitFileDiff query 渲染 diff。
 */
export function GitFileDiffPanel({
  projectName,
  scope,
  path,
  queryScope = WORKBENCH_GIT_TAB_QUERY_SCOPE,
  onClose,
}: GitFileDiffPanelProps) {
  const { t } = useT();
  const fileDiff = useQuery({
    enabled: path !== "",
    queryKey: ["projects", projectName, queryScope, "file-diff", scope, path],
    queryFn: () => getProjectGitFileDiff(projectName, scope, path),
  });

  if (!path)
    return (
      <div className="flex flex-1 min-h-0 flex-col items-center justify-start pt-6 lg:justify-center lg:pt-0">
        <div className="w-full lg:w-auto">
          <ResourceStatePanel title={t("git.selectPrompt")} message={t("git.selectDesc")} />
        </div>
      </div>
    );

  const displayName = fileDiff.data?.path ?? path;
  const displayStatus = fileDiff.data?.status;

  return (
    <section
      className="min-h-0 min-w-0 flex-1 flex flex-col bg-surface-raised/25"
      aria-label="Git file diff"
    >
      <div className="grid h-11 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 border-b border-neutral-line/40 px-3.5">
        <div className="flex min-w-0 items-center gap-2">
          {displayStatus ? (
            <IconMarker size="sm" tone={gitStatusTone(displayStatus)}>
              {statusShortLabel(displayStatus)}
            </IconMarker>
          ) : null}
          <h4 className="min-w-0 truncate font-mono text-sm font-semibold text-on-surface">
            {displayName.split("/").pop() ?? displayName}
          </h4>
        </div>
        <div className="justify-self-center" aria-hidden="true" />
        {onClose ? (
          <div
            className="inline-flex shrink-0 justify-self-end items-center gap-0.5 rounded-lg border border-neutral-line/60 bg-surface-inset/60 p-0.5 sm:hidden"
            role="group"
          >
            <button
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-on-surface-soft transition hover:bg-error/10 hover:text-error"
              type="button"
              onClick={onClose}
              aria-label={t("session.close")}
            >
              <ShellIcon name="close" className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="justify-self-end" aria-hidden="true" />
        )}
      </div>
      <div className="min-h-0 flex-1 flex flex-col overflow-hidden">
        {fileDiff.isLoading ? (
          <div className="flex flex-1 min-h-0 flex-col items-center justify-start gap-3 pt-10 lg:justify-center lg:pt-0">
            <span className="relative flex h-3 w-3" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-primary" />
            </span>
            <span className="text-xs font-semibold text-on-surface-muted">
              {t("git.loadingDiff")}
            </span>
          </div>
        ) : fileDiff.error ? (
          <div className="flex flex-1 min-h-0 flex-col items-center justify-start pt-6 lg:justify-center lg:pt-0">
            <div className="w-full lg:w-auto">
              <ResourceStatePanel
                tone="danger"
                title={t("git.fileError")}
                message={fileDiff.error.message}
              />
            </div>
          </div>
        ) : fileDiff.data ? (
          <DiffContent diff={fileDiff.data.diff} />
        ) : null}
      </div>
    </section>
  );
}

export type GitChangesListProps = {
  projectName: string;
  /** 当前选中文件（高亮当前 git tab，从 focusId parseGitTabId 派生）；undefined 无高亮。 */
  selectedFile?: SelectedGitFile;
  /** 点变更文件回调（透出 path+scope，WorkbenchContent onOpenGitFile 开中栏 git diff tab）。 */
  onSelectGitFile: (file: SelectedGitFile) => void;
};

/**
 * 左栏 git 变更列表（middle tab [git]，设计 workbench-layout-fix 阶段 3）。自带 listProjectGitDiff
 * query（独立 queryScope 段），顶部渲染 GitScopeChips 统计（与 GitDiffPanel 同源单源复用）+
 * GitFileList 文件列表。点文件透出 onSelectGitFile 开中栏 git diff tab（onOpenGitFile）。与
 * GitDiffPanel（右栏/移动端自包含 list+diff）共用 GitFileList + GitScopeChips，但本组件不带 diff——
 * 左栏只列表，diff 在中栏 kind:"git" tab 展示。
 */
export function GitChangesList({
  projectName,
  selectedFile,
  onSelectGitFile,
}: GitChangesListProps) {
  const { t } = useT();
  const diff = useQuery({
    queryKey: ["projects", projectName, WORKBENCH_GIT_LEFT_QUERY_SCOPE, "diff"],
    queryFn: () => listProjectGitDiff(projectName),
  });
  const gitSummary =
    diff.data?.repository === true ? summarizeGitFiles(diff.data.files) : undefined;

  if (diff.isLoading) {
    // mirror loaded 布局（顶部 chips 行 + 文件列表），避免加载完从无 chips 跳到有 chips 的视觉断层。
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div aria-hidden="true" className="shrink-0 border-b border-neutral-line/40 px-3.5 py-3">
          <div className="flex flex-wrap gap-1.5">
            <span className="skeleton-shimmer h-6 w-16 rounded-full" />
            <span className="skeleton-shimmer h-6 w-20 rounded-full" />
            <span className="skeleton-shimmer h-6 w-16 rounded-full" />
            <span className="skeleton-shimmer h-6 w-16 rounded-full" />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          <ListRowSkeleton count={4} />
        </div>
      </div>
    );
  }
  if (diff.error) {
    return (
      <div className="flex flex-1 min-h-0 flex-col items-center justify-start p-4 pt-6 lg:justify-center lg:pt-0">
        <div className="w-full lg:w-auto">
          <ResourceStatePanel
            tone="danger"
            title={t("git.errorTitle")}
            message={diff.error.message}
          />
        </div>
      </div>
    );
  }
  if (diff.data?.repository === false) {
    return (
      <div className="flex flex-1 min-h-0 flex-col items-center justify-start p-4 pt-6 lg:justify-center lg:pt-0">
        <div className="w-full lg:w-auto">
          <ResourceStatePanel title={t("git.notRepo")} message={t("git.notRepoDesc")} />
        </div>
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-neutral-line/40 px-3.5 py-3">
        <GitScopeChips summary={gitSummary} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        <GitFileList
          files={diff.data?.files ?? []}
          onSelectFile={onSelectGitFile}
          selectedFile={selectedFile}
        />
      </div>
    </div>
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
  header: "text-on-surface-muted",
  hunk: "text-primary/80 bg-primary/5",
  add: "text-success bg-success/5",
  del: "text-error bg-error/5",
  context: "text-on-surface-soft",
};

function DiffContent({ diff }: { diff: string }) {
  const lines = parseDiff(diff);

  return (
    <div className="min-h-0 flex-1 overflow-auto font-mono text-xs leading-5 sm:text-sm">
      <table className="w-full border-collapse">
        <tbody>
          {lines.map((line, i) => (
            <tr key={i} className={diffLineClasses[line.type]}>
              <td className="select-none pr-2 pl-3 text-right w-1 align-top whitespace-nowrap text-on-surface-muted sm:pl-4 sm:w-12">
                {line.oldLine !== undefined ? line.oldLine : ""}
              </td>
              <td className="select-none pr-2 text-right w-1 align-top whitespace-nowrap text-on-surface-muted sm:w-12">
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

// scopeChip 的中性默认态（"all" 标签）；tone 态复用共享 pillToneClasses。
const scopeChipDefault = "border-neutral-line/60 bg-surface-inset/70 text-on-surface-muted";

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
  const colorClass = tone ? pillToneClasses[tone] : scopeChipDefault;
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

/** scope chips 统计行（All/Modified/Added/Deleted 计数）。GitDiffPanel（右栏/移动端）与
 * GitChangesList（左栏列表）共用此组件，统计渲染单源——桌面左栏与移动端一致。 */
function GitScopeChips({ summary }: { summary?: GitSummary }) {
  const { t } = useT();
  return (
    <div className="flex flex-wrap gap-1.5">
      <GitScopeChip
        label={t("git.allLabel")}
        count={(summary?.staged ?? 0) + (summary?.worktree ?? 0)}
      />
      <GitScopeChip
        label={t("git.modifiedLabel")}
        shortLabel={t("git.modifiedShort")}
        count={summary?.modified ?? 0}
        tone="warning"
      />
      <GitScopeChip
        label={t("git.addedLabel")}
        shortLabel={t("git.addedShort")}
        count={summary?.added ?? 0}
        tone="success"
      />
      <GitScopeChip
        label={t("git.deletedLabel")}
        shortLabel={t("git.deletedShort")}
        count={summary?.deleted ?? 0}
        tone="danger"
      />
    </div>
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
  const { t } = useT();
  const [selectedFile, setSelectedFile] = useState<SelectedGitFile | undefined>();
  const {
    exiting: diffExiting,
    close: closeDiffOverlay,
    onAnimationEnd: onDiffOverlayAnimationEnd,
    cancel: cancelDiffExit,
  } = useMobileExitClose(() => setSelectedFile(undefined));
  const diff = useQuery({
    queryKey: ["projects", projectName, queryScope, "diff"],
    queryFn: () => listProjectGitDiff(projectName),
  });

  useEffect(() => {
    onDeepDetailChange?.(selectedFile !== undefined);
    return () => onDeepDetailChange?.(false);
  }, [onDeepDetailChange, selectedFile]);

  // clearDiff 经 useMobileExitClose 编排：移动端先播 slide-out 再真正清（§7 对称），桌面端即时。
  const clearDiff = closeDiffOverlay;
  const gitSummary =
    diff.data?.repository === true ? summarizeGitFiles(diff.data.files) : undefined;

  if (diff.isLoading) {
    // 结构已知（scope chips 行 + ListRow 文件列表），按 loaded 布局 mirror 骨架，
    // 避免加载完从 ping spinner 跳到真实结构的视觉断层。右侧 diff panel 不渲染
    //（首次加载无 selectedFile，与 loaded 未选态一致，不叠占位）。
    return (
      <div className="flex min-h-0 flex-1 flex-col sm:overflow-hidden">
        <div aria-hidden="true" className="border-b border-neutral-line/40 px-3.5 py-3">
          <div className="flex flex-wrap gap-1.5">
            <span className="skeleton-shimmer h-6 w-16 rounded-full" />
            <span className="skeleton-shimmer h-6 w-20 rounded-full" />
            <span className="skeleton-shimmer h-6 w-16 rounded-full" />
            <span className="skeleton-shimmer h-6 w-16 rounded-full" />
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <aside className="min-h-0 flex-1 flex flex-col sm:flex-none sm:w-[19.375rem] sm:shrink-0 sm:border-r sm:border-neutral-line/60">
            <div className="min-h-0 overflow-y-auto px-3 pb-3">
              <ListRowSkeleton count={4} />
            </div>
          </aside>
        </div>
      </div>
    );
  }

  if (diff.error) {
    return (
      <div className="flex flex-1 min-h-0 flex-col items-center justify-start p-4 pt-6 lg:justify-center lg:pt-0">
        <div className="w-full lg:w-auto">
          <ResourceStatePanel
            tone="danger"
            title={t("git.errorTitle")}
            message={diff.error.message}
          />
        </div>
      </div>
    );
  }

  if (diff.data?.repository === false) {
    return (
      <div className="flex flex-1 min-h-0 flex-col items-center justify-start p-4 pt-6 lg:justify-center lg:pt-0">
        <div className="w-full lg:w-auto">
          <ResourceStatePanel title={t("git.notRepo")} message={t("git.notRepoDesc")} />
        </div>
      </div>
    );
  }

  const changedFiles = diff.data?.files ?? [];
  const isFileSelected = selectedFile !== undefined;

  const scopeChips = <GitScopeChips summary={gitSummary} />;

  const fileList = (
    <GitFileList
      files={changedFiles}
      onSelectFile={(file) => {
        cancelDiffExit();
        setSelectedFile(file);
      }}
      selectedFile={selectedFile}
    />
  );

  const diffPanel = (
    <GitFileDiffPanel
      onClose={clearDiff}
      path={selectedFile?.path ?? ""}
      projectName={projectName}
      queryScope={queryScope}
      scope={selectedFile?.scope ?? "worktree"}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col sm:overflow-hidden">
      <div
        className={`border-b border-neutral-line/40 px-3.5 py-3 ${isFileSelected ? "hidden sm:block" : "block"}`}
      >
        {scopeChips}
      </div>
      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        <aside
          className={`min-h-0 flex-1 sm:flex-none sm:w-[19.375rem] sm:shrink-0 sm:border-r sm:border-neutral-line/60 ${isFileSelected ? "hidden sm:flex sm:flex-col" : "flex flex-col"}`}
        >
          <div className="min-h-0 overflow-y-auto px-3 pb-3 sm:flex-1 sm:flex sm:flex-col max-lg:!pb-[var(--shell-mobile-bottom-nav-space,0px)]">
            {fileList}
          </div>
        </aside>
        <div
          key={selectedFile !== undefined ? "diff-open" : "diff-closed"}
          onAnimationEnd={onDiffOverlayAnimationEnd}
          className={
            selectedFile === undefined && !diffExiting
              ? "hidden sm:flex sm:min-h-0 sm:min-w-0 sm:flex-1 sm:flex-col"
              : [
                  "fixed inset-0 z-50 flex flex-col bg-surface",
                  "pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]",
                  diffExiting
                    ? "animate-out slide-out-to-bottom-full duration-300 ease-in"
                    : "animate-in slide-in-from-bottom-full duration-300 ease-out",
                  "sm:static sm:inset-auto sm:z-auto sm:min-h-0 sm:min-w-0 sm:flex-1 sm:flex-col sm:bg-transparent sm:pt-0 sm:pb-0 sm:animate-none",
                ].join(" ")
          }
        >
          <div className="min-h-0 flex-1 flex flex-col overflow-hidden">{diffPanel}</div>
        </div>
      </div>
    </div>
  );
}
