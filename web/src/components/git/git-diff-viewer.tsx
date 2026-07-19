import type {
  GitBranchStatus,
  GitCommitLogItem,
  GitDiffFileStatus,
  GitDiffFileSummary,
  GitDiffScope,
} from "@agents-remote/shared";
import { type ComponentProps, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  getProjectGitAheadBehind,
  getProjectGitFileDiff,
  getProjectGitLog,
  listProjectGitBranches,
  listProjectGitDiff,
} from "../../api/client";
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
import { extToLang, highlightCodeLine } from "../markdown/prism-languages";
import { DraggableListRow, type CardDragStartHandler } from "../workbench/drag-source";

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
  projectName: string;
  selectedFile: SelectedGitFile | undefined;
  onSelectFile: (file: SelectedGitFile) => void;
  /** 拖动源启动（git 行拖到中栏开 git diff tab，WorkbenchContent onCardDragStart）。undefined 退纯点击（右栏/移动 inspection）。 */
  onCardDragStart?: CardDragStartHandler;
};

function GitFileList({
  files,
  projectName,
  onSelectFile,
  selectedFile,
  onCardDragStart,
}: GitFileListProps) {
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
        // rowCommon 复用：onClick 是键盘 Enter/Space → click 路径（pointer 单击被拖动序列抑制，
        // onSelect 接管）。onCardDragStart 存在 → DraggableListRow 拖到中栏开 git diff tab（设计 §7.2）。
        const rowCommon: ComponentProps<typeof ListRow> = {
          marker: (
            <IconMarker size="sm" tone="muted">
              <ShellIcon name="file" className="h-4 w-4" />
            </IconMarker>
          ),
          meta: (
            <>
              <IconMarker size="sm" tone={gitStatusTone(file.status)}>
                {statusShortLabel(file.status)}
              </IconMarker>
              {file.addedLines !== null && file.removedLines !== null ? (
                <span className="font-mono text-[0.62rem] font-bold tabular-nums">
                  <span className="text-success">+{file.addedLines}</span>{" "}
                  <span className="text-error">-{file.removedLines}</span>
                </span>
              ) : null}
            </>
          ),
          selected,
          subtitle: file.previousPath ? t("git.fromPath", { path: file.previousPath }) : undefined,
          title: <span className="font-mono text-[0.82rem]">{file.path}</span>,
          onClick: () => onSelectFile({ path: file.path, scope: file.scope }),
        };
        if (onCardDragStart) {
          return (
            <DraggableListRow
              key={`${file.scope}:${file.path}`}
              {...rowCommon}
              dragRef={{ kind: "git", projectName, scope: file.scope, path: file.path }}
              onCardDragStart={onCardDragStart}
              onSelect={() => onSelectFile({ path: file.path, scope: file.scope })}
            />
          );
        }
        return <ListRow key={`${file.scope}:${file.path}`} {...rowCommon} />;
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
  // R8：展开完整文件（默认仅显示改动附近 3 行）。切换文件/scope 时重置为折叠态。
  const [expanded, setExpanded] = useState(false);
  useEffect(() => setExpanded(false), [path, scope]);
  const fileDiff = useQuery({
    enabled: path !== "",
    queryKey: [
      "projects",
      projectName,
      queryScope,
      "file-diff",
      scope,
      path,
      expanded ? "full" : "changes",
    ],
    queryFn: () => getProjectGitFileDiff(projectName, scope, path, expanded ? "full" : undefined),
    placeholderData: keepPreviousData,
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
        <div className="justify-self-center">
          {fileDiff.data ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border border-neutral-line/50 bg-surface-inset/50 px-2 py-1 text-[0.62rem] font-medium text-on-surface-soft transition hover:bg-surface-inset hover:text-on-surface"
              onClick={() => setExpanded((v) => !v)}
              aria-pressed={expanded}
              title={t(expanded ? "git.collapseChanges" : "git.expandFull")}
            >
              <ShellIcon name={expanded ? "restore" : "maximize"} className="h-3 w-3" />
              <span className="hidden sm:inline">
                {t(expanded ? "git.collapseChanges" : "git.expandFull")}
              </span>
            </button>
          ) : null}
        </div>
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
          <DiffContent diff={fileDiff.data.diff} filePath={fileDiff.data.path} />
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
  /** 拖动源启动（git 行拖到中栏开 git diff tab，透传 GitFileList）。undefined 退纯点击（移动端）。 */
  onCardDragStart?: CardDragStartHandler;
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
  onCardDragStart,
}: GitChangesListProps) {
  const { t } = useT();
  const diff = useQuery({
    queryKey: ["projects", projectName, WORKBENCH_GIT_LEFT_QUERY_SCOPE, "diff"],
    queryFn: () => listProjectGitDiff(projectName),
  });
  const [view, setView] = useState<GitView>("changes");
  const [commitBranch, setCommitBranch] = useState<string | undefined>();
  const [aheadBehindOpen, setAheadBehindOpen] = useState(false);
  const gitSummary =
    diff.data?.repository === true ? summarizeGitFiles(diff.data.files) : undefined;
  const branch = diff.data?.repository === true ? diff.data.branch : undefined;

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
        {branch ? (
          <GitBranchStatusRow
            branch={branch}
            projectName={projectName}
            open={aheadBehindOpen}
            onToggle={() => setAheadBehindOpen((v) => !v)}
          />
        ) : null}
        <GitScopeChips summary={gitSummary} />
        <GitViewSwitcher view={view} onChange={setView} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {view === "changes" ? (
          <GitFileList
            files={diff.data?.files ?? []}
            onSelectFile={onSelectGitFile}
            onCardDragStart={onCardDragStart}
            projectName={projectName}
            selectedFile={selectedFile}
          />
        ) : view === "branches" ? (
          <GitBranchList
            projectName={projectName}
            onSelectBranch={(name) => {
              setCommitBranch(name);
              setView("commits");
            }}
          />
        ) : (
          <GitCommitList projectName={projectName} branch={commitBranch ?? branch?.name} />
        )}
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

function DiffContent({ diff, filePath }: { diff: string; filePath: string }) {
  const { t } = useT();
  const scrollRef = useRef<HTMLDivElement>(null);
  const hunkRowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());
  const lines = useMemo(() => parseDiff(diff), [diff]);
  const lang = useMemo(() => extToLang(filePath), [filePath]);

  // R7：按文件扩展名对代码行做源码高亮（前缀 +/-/空格 单独渲染，保留 diff 语义）。
  // 仅 add/del/context 行高亮；header/hunk 行纯文本。整表 useMemo 缓存，避免大文件逐次重算。
  const renderedContents = useMemo<(ReactNode | string)[] | null>(() => {
    if (!lang) return null;
    return lines.map((line) => {
      if (line.type !== "add" && line.type !== "del" && line.type !== "context")
        return line.content;
      const prefix = line.content[0] ?? "";
      const rest = line.content.slice(1);
      return (
        <>
          <span aria-hidden="true">{prefix}</span>
          {highlightCodeLine(rest, lang)}
        </>
      );
    });
  }, [lines, lang]);

  // 行号 → 该行是第几个 hunk（0-based），非 hunk 行 = -1。
  const { hunkIndexOfLine, hunkCount } = useMemo(() => {
    const arr = Array.from({ length: lines.length }, () => -1);
    let count = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].type === "hunk") {
        arr[i] = count;
        count++;
      }
    }
    return { hunkIndexOfLine: arr, hunkCount: count };
  }, [lines]);

  const [activeHunk, setActiveHunk] = useState(0);

  // hunk ≥2 时被动追踪视口顶部的 hunk，更新 activeHunk（IntersectionObserver 比 scroll 计算稳）。
  useEffect(() => {
    if (hunkCount < 2) return;
    const root = scrollRef.current;
    if (!root) return;
    const ratios = new Map<number, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const idx = Number((entry.target as HTMLElement).dataset.hunkIndex);
          ratios.set(idx, entry.intersectionRatio);
        }
        let best = -1;
        let bestRatio = -1;
        for (const [idx, ratio] of ratios) {
          if (ratio > bestRatio) {
            best = idx;
            bestRatio = ratio;
          }
        }
        if (best >= 0) setActiveHunk(best);
      },
      { root, rootMargin: "0px 0px -85% 0px", threshold: [0, 0.1, 0.5, 1] },
    );
    for (const el of hunkRowRefs.current.values()) observer.observe(el);
    return () => observer.disconnect();
  }, [hunkCount, hunkIndexOfLine]);

  const goToHunk = (target: number) => {
    const clamped = Math.max(0, Math.min(hunkCount - 1, target));
    hunkRowRefs.current.get(clamped)?.scrollIntoView({ block: "start" });
    setActiveHunk(clamped);
  };

  return (
    <div
      ref={scrollRef}
      className="min-h-0 flex-1 overflow-auto font-mono text-xs leading-5 sm:text-sm"
    >
      {hunkCount >= 2 ? (
        <div
          role="group"
          aria-label={t("git.hunkCounter", { current: activeHunk + 1, total: hunkCount })}
          className="sticky top-0 z-10 flex items-center justify-end gap-0.5 border-b border-neutral-line/40 bg-surface-raised/85 px-2 py-1 backdrop-blur"
        >
          <span className="mr-1.5 text-[0.62rem] font-medium tabular-nums text-on-surface-muted">
            {t("git.hunkCounter", { current: activeHunk + 1, total: hunkCount })}
          </span>
          <button
            type="button"
            className="flex h-6 w-6 items-center justify-center rounded-md text-on-surface-soft transition hover:bg-surface-inset/60 hover:text-on-surface disabled:pointer-events-none disabled:opacity-40"
            onClick={() => goToHunk(activeHunk - 1)}
            disabled={activeHunk <= 0}
            aria-label={t("git.hunkPrev")}
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="flex h-6 w-6 items-center justify-center rounded-md text-on-surface-soft transition hover:bg-surface-inset/60 hover:text-on-surface disabled:pointer-events-none disabled:opacity-40"
            onClick={() => goToHunk(activeHunk + 1)}
            disabled={activeHunk >= hunkCount - 1}
            aria-label={t("git.hunkNext")}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}
      <table className="w-full border-collapse">
        <tbody>
          {lines.map((line, i) => {
            const hunkIdx = hunkIndexOfLine[i];
            return (
              <tr
                key={i}
                className={diffLineClasses[line.type]}
                ref={
                  hunkIdx >= 0
                    ? (el) => {
                        if (el) hunkRowRefs.current.set(hunkIdx, el);
                      }
                    : undefined
                }
                data-hunk-index={hunkIdx >= 0 ? hunkIdx : undefined}
              >
                <td className="select-none pr-2 pl-3 text-right w-1 align-top whitespace-nowrap text-on-surface-muted sm:pl-4 sm:w-12">
                  {line.oldLine !== undefined ? line.oldLine : ""}
                </td>
                <td className="select-none pr-2 text-right w-1 align-top whitespace-nowrap text-on-surface-muted sm:w-12">
                  {line.newLine !== undefined ? line.newLine : ""}
                </td>
                <td className="pr-3 align-top whitespace-pre-wrap break-words sm:pr-4">
                  {renderedContents ? renderedContents[i] : line.content}
                </td>
              </tr>
            );
          })}
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

/** R2 当前分支 + upstream ahead/behind 态势行。detached HEAD（name==="HEAD"）显 git.detached；
 * 无 upstream 显 git.noUpstream；有 upstream 时显 ↑ahead（success）/ ↓behind（muted），0 省略箭头。
 * 与 GitScopeChips 同属 header 统计区，渲染在 chips 上方（仓库级态势 vs 文件级统计分层）。 */
type GitView = "changes" | "branches" | "commits";

const GIT_VIEW_OPTIONS = [
  { id: "changes", labelKey: "git.viewChanges" },
  { id: "branches", labelKey: "git.viewBranches" },
  { id: "commits", labelKey: "git.viewCommits" },
] as const;

/** Git middle tab 内分段切换 [变更|分支|提交]（R3/R6 落点）。 */
const GitViewSwitcher = ({
  view,
  onChange,
}: {
  view: GitView;
  onChange: (view: GitView) => void;
}) => {
  const { t } = useT();
  return (
    <div
      role="tablist"
      aria-label="Git view"
      className="flex shrink-0 gap-0.5 rounded-lg bg-surface-inset/60 p-0.5"
    >
      {GIT_VIEW_OPTIONS.map((opt) => {
        const active = view === opt.id;
        return (
          <button
            key={opt.id}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(opt.id)}
            className={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition ${
              active ? "bg-primary/10 text-primary" : "text-on-surface-muted hover:text-on-surface"
            }`}
          >
            {t(opt.labelKey)}
          </button>
        );
      })}
    </div>
  );
};

/** R4/R6 共享：单条 commit 行（hash marker + message + author·time）。 */
const GitCommitRow = ({ commit }: { commit: GitCommitLogItem }) => (
  <ListRow
    marker={
      <IconMarker size="sm" tone="muted">
        <span className="font-mono text-[0.62rem]">{commit.hash.slice(0, 7)}</span>
      </IconMarker>
    }
    title={<span className="text-sm">{commit.message}</span>}
    subtitle={
      <span className="text-xs text-on-surface-muted">
        {commit.author} · {commit.relativeTime}
      </span>
    }
  />
);

/** R6 commit 历史（按 branch 过滤，默认 HEAD）。 */
const GitCommitList = ({ projectName, branch }: { projectName: string; branch?: string }) => {
  const { t } = useT();
  const log = useQuery({
    queryKey: ["projects", projectName, "git", "log", branch],
    queryFn: () => getProjectGitLog(projectName, branch),
  });
  if (log.isLoading) return <ListRowSkeleton count={5} />;
  if (log.error)
    return (
      <ResourceStatePanel tone="danger" title={t("git.errorTitle")} message={log.error.message} />
    );
  const commits = log.data?.commits ?? [];
  if (commits.length === 0)
    return <ResourceStatePanel title={t("git.noCommits")} message={t("git.notRepoDesc")} />;
  return (
    <ListGroup ariaLabel="Git commits">
      {commits.map((commit) => (
        <GitCommitRow key={commit.hash} commit={commit} />
      ))}
    </ListGroup>
  );
};

/** R3 分支列表（local + remote）。点分支名 → onSelectBranch 联动切 [提交] 视图按该分支过滤。 */
const GitBranchList = ({
  projectName,
  onSelectBranch,
}: {
  projectName: string;
  onSelectBranch?: (name: string) => void;
}) => {
  const { t } = useT();
  const branches = useQuery({
    queryKey: ["projects", projectName, "git", "branches"],
    queryFn: () => listProjectGitBranches(projectName),
  });
  if (branches.isLoading) return <ListRowSkeleton count={4} />;
  if (branches.error)
    return (
      <ResourceStatePanel
        tone="danger"
        title={t("git.errorTitle")}
        message={branches.error.message}
      />
    );
  const list = branches.data?.branches ?? [];
  if (list.length === 0)
    return <ResourceStatePanel title={t("git.noBranches")} message={t("git.notRepoDesc")} />;
  return (
    <ListGroup ariaLabel="Git branches">
      {list.map((branch) => (
        <ListRow
          key={`${branch.type}:${branch.name}`}
          marker={
            <IconMarker size="sm" tone={branch.isCurrent ? "accent" : "muted"}>
              <span className="text-[0.62rem] font-bold">
                {branch.type === "local"
                  ? t("git.branchesLocalShort")
                  : t("git.branchesRemoteShort")}
              </span>
            </IconMarker>
          }
          title={
            <span className="flex items-center gap-1.5 font-mono text-sm">
              {branch.name}
              {branch.isCurrent ? (
                <span className="text-[0.62rem] text-primary">({t("git.branchCurrent")})</span>
              ) : null}
            </span>
          }
          subtitle={
            branch.upstream ? (
              <span className="text-xs text-on-surface-muted">{branch.upstream}</span>
            ) : undefined
          }
          meta={
            branch.ahead !== undefined || branch.behind !== undefined ? (
              <span className="font-mono text-[0.62rem] tabular-nums">
                {branch.behind && branch.behind > 0 ? (
                  <span className="text-on-surface-muted">↓{branch.behind} </span>
                ) : null}
                {branch.ahead && branch.ahead > 0 ? (
                  <span className="text-success">↑{branch.ahead}</span>
                ) : null}
              </span>
            ) : null
          }
          selected={branch.isCurrent}
          onClick={onSelectBranch ? () => onSelectBranch(branch.name) : undefined}
        />
      ))}
    </ListGroup>
  );
};

/** R4 展开内容：当前分支相对 upstream 的 ahead/behind commit 列表（lazy query，展开才发）。 */
const GitAheadBehindPanel = ({ projectName, branch }: { projectName: string; branch?: string }) => {
  const { t } = useT();
  const ab = useQuery({
    queryKey: ["projects", projectName, "git", "ahead-behind", branch],
    queryFn: () => getProjectGitAheadBehind(projectName, branch),
  });
  if (ab.isLoading)
    return (
      <div className="mt-1.5">
        <ListRowSkeleton count={1} />
      </div>
    );
  if (ab.error || !ab.data) return null;
  if (ab.data.upstream === undefined)
    return <div className="mt-1.5 text-xs text-on-surface-muted">{t("git.noUpstream")}</div>;
  return (
    <div className="mt-1.5 flex flex-col gap-2">
      {ab.data.aheadCommits.length > 0 ? (
        <div>
          <div className="px-1 pb-1 text-[0.62rem] font-semibold uppercase tracking-wide text-success">
            {t("git.aheadLabel")} · {ab.data.ahead}
          </div>
          <ListGroup ariaLabel="Git ahead commits">
            {ab.data.aheadCommits.map((commit) => (
              <GitCommitRow key={commit.hash} commit={commit} />
            ))}
          </ListGroup>
        </div>
      ) : null}
      {ab.data.behindCommits.length > 0 ? (
        <div>
          <div className="px-1 pb-1 text-[0.62rem] font-semibold uppercase tracking-wide text-on-surface-muted">
            {t("git.behindLabel")} · {ab.data.behind}
          </div>
          <ListGroup ariaLabel="Git behind commits">
            {ab.data.behindCommits.map((commit) => (
              <GitCommitRow key={commit.hash} commit={commit} />
            ))}
          </ListGroup>
        </div>
      ) : null}
      {ab.data.aheadCommits.length === 0 && ab.data.behindCommits.length === 0 ? (
        <div className="px-1 pb-1 text-[0.62rem] text-on-surface-muted">{t("git.upToDate")}</div>
      ) : null}
    </div>
  );
};

/**
 * R2 当前分支态势行。可展开（传 projectName + onToggle）→ R4 渲染 GitAheadBehindPanel
 * 列 ahead/behind commits。无 upstream / detached 不可展开（纯展示）。
 */
function GitBranchStatusRow({
  branch,
  projectName,
  open = false,
  onToggle,
}: {
  branch: GitBranchStatus;
  projectName?: string;
  open?: boolean;
  onToggle?: () => void;
}) {
  const { t } = useT();
  if (branch.name === "HEAD") {
    return <div className="mb-2 text-xs text-on-surface-muted">{t("git.detached")}</div>;
  }
  const expandable = onToggle !== undefined && branch.upstream !== undefined;
  const header = (
    <>
      <span className="font-mono font-semibold text-on-surface">{branch.name}</span>
      {branch.upstream === undefined ? (
        <span className="text-on-surface-muted">{t("git.noUpstream")}</span>
      ) : (
        <>
          {branch.behind && branch.behind > 0 ? (
            <span className="font-mono tabular-nums text-on-surface-muted">↓{branch.behind}</span>
          ) : null}
          {branch.ahead && branch.ahead > 0 ? (
            <span className="font-mono tabular-nums text-success">↑{branch.ahead}</span>
          ) : null}
        </>
      )}
    </>
  );
  return (
    <div className="mb-2">
      {expandable ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex items-center gap-2 text-xs hover:opacity-80"
        >
          {header}
        </button>
      ) : (
        <div className="flex items-center gap-2 text-xs">{header}</div>
      )}
      {expandable && open && projectName ? (
        <GitAheadBehindPanel projectName={projectName} branch={branch.name} />
      ) : null}
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
  const [view, setView] = useState<GitView>("changes");
  const [commitBranch, setCommitBranch] = useState<string | undefined>();
  const [aheadBehindOpen, setAheadBehindOpen] = useState(false);
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
  const branch = diff.data?.repository === true ? diff.data.branch : undefined;

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
      projectName={projectName}
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
        {branch ? (
          <GitBranchStatusRow
            branch={branch}
            projectName={projectName}
            open={aheadBehindOpen}
            onToggle={() => setAheadBehindOpen((v) => !v)}
          />
        ) : null}
        {scopeChips}
        <GitViewSwitcher view={view} onChange={setView} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        <aside
          className={`min-h-0 flex-1 sm:flex-none sm:w-[19.375rem] sm:shrink-0 sm:border-r sm:border-neutral-line/60 ${isFileSelected ? "hidden sm:flex sm:flex-col" : "flex flex-col"}`}
        >
          <div className="min-h-0 overflow-y-auto px-3 pb-3 sm:flex-1 sm:flex sm:flex-col max-lg:!pb-[var(--shell-mobile-bottom-nav-space,0px)]">
            {view === "changes" ? (
              fileList
            ) : view === "branches" ? (
              <GitBranchList
                projectName={projectName}
                onSelectBranch={(name) => {
                  setCommitBranch(name);
                  setView("commits");
                }}
              />
            ) : (
              <GitCommitList projectName={projectName} branch={commitBranch ?? branch?.name} />
            )}
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
