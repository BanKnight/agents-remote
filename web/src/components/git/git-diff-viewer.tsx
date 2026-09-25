import type {
  GitBranchStatus,
  GitCommitLogItem,
  GitCompareFileSummary,
  GitDiffFileStatus,
  GitDiffFileSummary,
  GitDiffScope,
} from "@agents-remote/shared";
import { type ComponentProps, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  getProjectGitAheadBehind,
  getProjectGitCompareDiff,
  getProjectGitCompareFileDiff,
  getProjectGitFileDiff,
  getProjectGitLog,
  listProjectGitBranches,
  listProjectGitDiff,
} from "../../api/client";
import { useT } from "../../i18n";
import { useTheme } from "../../theme";
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
import { ActionMenu, useLongPressActions, useRowContextMenu } from "../ui/action-menu";

// ── Query-key 单源（同 key 共享缓存；隔离段之间不互相 invalidate）────────────────
/** 中栏 git tab / 移动 L3 diff 的 file diff query-key 隔离段（GitFileDiffPanel 默认）。 */
export const WORKBENCH_GIT_TAB_QUERY_SCOPE = "git-tab";
/** 左栏 git 变更列表 query-key 隔离段——移动 gitchip / 工具面板 / 桌面左栏多方共享缓存。 */
export const WORKBENCH_GIT_LEFT_QUERY_SCOPE = "workbench-git-left";

/** 工作区 diff 列表 key 单源（WORKBENCH_GIT_LEFT_QUERY_SCOPE 段）。 */
export const gitDiffListQueryKey = (projectName: string) =>
  ["projects", projectName, WORKBENCH_GIT_LEFT_QUERY_SCOPE, "diff"] as const;

/** 单文件 diff key 单源（GitFileDiffPanel 与移动 L3 同 key 共享缓存）。ref = scope 模式的
 * scope 或 compare 模式的 `base~compare`。full = R8 展开完整文件（-U999999）。 */
export const gitFileDiffQueryKey = (
  projectName: string,
  queryScope: string,
  mode: "scope" | "compare",
  ref: string | null,
  path: string,
  full: boolean,
) => ["projects", projectName, queryScope, "file-diff", mode, ref, path, full ? "full" : "changes"];

/** commit 历史 key 单源。branch 空 = 请求不带 branch（后端默认分支），key 维度统一 "" 哨兵
 *（原 GitCommitList undefined / 工具面板 "" 双哨兵双拉，统一后同语义共享缓存）。 */
export const gitLogQueryKey = (projectName: string, branch?: string | null) =>
  ["projects", projectName, "git", "log", branch ?? ""] as const;

// ── Helpers ───────────────────────────────────────────────────────

/** badge 短字符（M/A/D/R）——移动 03m/03o frow badge 复用（M4）。 */
export const statusShortLabel = (status: GitDiffFileStatus) => {
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

/** badge 色调（ShellTone）——移动 frow badge 映射 tint badge class（M4）。 */
export const gitStatusTone = (status: GitDiffFileStatus): ShellTone => {
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

/** ahead/behind 态势箭头串（`↑N ↓N`；0 显 0 不省略——03m gitchip / 04 githead / 03v bcur
 * 同形制）。与前置文本的分隔空格属调用点拼接意图，不进本函数；「有 upstream 才显」
 * 「非 0,0 才显」等门控语义各处不同，也由调用方自判。带色分 span 版（GitAheadBehindPanel）不在此列。 */
export const formatAheadBehind = (ahead?: number, behind?: number): string =>
  `↑${ahead ?? 0} ↓${behind ?? 0}`;

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
  // 05e 同款行菜单（第十一轮复验问题⑤：右栏「文件/Git/Wiki」段都要右键/长按菜单——文件段
  // FilesPanel 已有，Git 段在此补齐）。桌面右键 = ctx 坐标 popover；触屏长按 = lp 计时（iPad
  // 右栏行无 ⋯ 按钮，长按是唯一菜单入口，05e pin①「右键(iPad 长按)」）。
  const ctx = useRowContextMenu();
  const lp = useLongPressActions(ctx.openAt);
  const rowKey = (file: GitDiffFileSummary) => `${file.scope}:${file.path}`;

  if (files.length === 0)
    return (
      <div className="flex flex-1 min-h-0 flex-col items-center justify-start pt-6 lg:justify-center lg:pt-0">
        <div className="w-full lg:w-auto">
          <ResourceStatePanel title={t("git.noChanges")} message={t("git.noChangesDesc")} />
        </div>
      </div>
    );

  // 单一菜单容器（02c pill 同款）：items 按命中的当前行计算——pointFor 只对 ctx 记录行非空。
  const menuFile = files.find((file) => ctx.pointFor(rowKey(file)) !== null);

  return (
    <>
      <ListGroup ariaLabel="Git changed files">
        {files.map((file) => {
          const selected = selectedFile?.path === file.path && selectedFile.scope === file.scope;
          // rowCommon 复用：onClick 是键盘 Enter/Space → click 路径（pointer 单击被拖动序列抑制，
          // onSelect 接管；guardClick 抑制长按后紧随的合成 click）。onCardDragStart 存在 →
          // DraggableListRow 拖到中栏开 git diff tab（设计 §7.2）。
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
            subtitle: file.previousPath
              ? t("git.fromPath", { path: file.previousPath })
              : undefined,
            title: <span className="font-mono text-[0.82rem]">{file.path}</span>,
            onClick: () => {
              if (lp.guardClick()) return;
              onSelectFile({ path: file.path, scope: file.scope });
            },
            onContextMenu: (e) => ctx.openAt(rowKey(file), e),
            ...lp.bind(rowKey(file)),
          };
          if (onCardDragStart) {
            return (
              <DraggableListRow
                key={`${file.scope}:${file.path}`}
                {...rowCommon}
                dragRef={{
                  kind: "git",
                  mode: "scope",
                  projectName,
                  scope: file.scope,
                  path: file.path,
                }}
                onCardDragStart={onCardDragStart}
                onSelect={() => onSelectFile({ path: file.path, scope: file.scope })}
              />
            );
          }
          return <ListRow key={`${file.scope}:${file.path}`} {...rowCommon} />;
        })}
      </ListGroup>
      {menuFile ? (
        <ActionMenu
          contextMenuPoint={ctx.pointFor(rowKey(menuFile))}
          items={[
            {
              label: t("git.menuViewDiff"),
              icon: <ShellIcon name="git-nav" />,
              onSelect: () => onSelectFile({ path: menuFile.path, scope: menuFile.scope }),
            },
            {
              label: t("files.menuCopyPath"),
              icon: <ShellIcon name="edit" />,
              onSelect: () => {
                void navigator.clipboard.writeText(`${projectName}/${menuFile.path}`);
              },
            },
          ]}
          onContextMenuClose={ctx.close}
          trigger={<span className="hidden" />}
        />
      ) : null}
    </>
  );
}

/** GitFileDiffPanel 渲染所需的统一 diff 视图（scope/compare 两模式 query 结果的公共字段子集）。 */
type GitFileDiffView = {
  path: string;
  previousPath?: string;
  status: GitDiffFileStatus;
  diff: string;
};

export type GitFileDiffPanelProps = {
  projectName: string;
  path: string;
  /** Query-key 隔离段（默认中栏 git tab 段，右栏 inspection 传其 queryScope）。 */
  queryScope?: string;
  /** 可选关闭回调（移动浮层关闭按钮，仅 sm:hidden 渲染；中栏 tab 不传，由 tab ✕ 关闭）。 */
  onClose?: () => void;
} &
  // scope 模式 = 变更文件（worktree/staged）；compare 模式 = 分支间 diff（base..compare）。
  // 两模式共享 DiffContent 渲染（R7 高亮/R8 展开/R9 hunk 导航），仅 query 数据源不同。
  ({ mode: "scope"; scope: GitDiffScope } | { mode: "compare"; base: string; compare: string });

/**
 * 单文件 git diff 面板（自带 query，设计 workbench-layout-fix 阶段 3）。两处复用：① 中栏 git tab
 *（PanelRouter，onClose 不传，关闭走 tab ✕）；② GitDiffPanel 右栏 inspection（传 onClose=clearDiff，
 * 移动浮层关闭）。path 为空 → 未选态（selectPrompt）；非空 → getProjectGitFileDiff query 渲染 diff。
 */
export function GitFileDiffPanel(props: GitFileDiffPanelProps) {
  const { t } = useT();
  const { projectName, path, queryScope = WORKBENCH_GIT_TAB_QUERY_SCOPE, onClose } = props;
  // R8：展开完整文件（默认仅显示改动附近 3 行）。切换文件/scope/compare 时重置为折叠态。
  const [expanded, setExpanded] = useState(false);
  const compareRef = props.mode === "compare" ? `${props.base}~${props.compare}` : null;
  const scopeRef = props.mode === "scope" ? props.scope : null;
  useEffect(() => setExpanded(false), [path, props.mode, compareRef, scopeRef]);
  const fileDiff = useQuery({
    enabled: path !== "",
    queryKey: gitFileDiffQueryKey(
      projectName,
      queryScope,
      props.mode,
      compareRef ?? scopeRef,
      path,
      expanded,
    ),
    queryFn: (): Promise<GitFileDiffView> => {
      if (props.mode === "compare")
        return getProjectGitCompareFileDiff(
          projectName,
          props.base,
          props.compare,
          path,
          expanded ? "full" : undefined,
        );
      return getProjectGitFileDiff(projectName, props.scope, path, expanded ? "full" : undefined);
    },
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
          {props.mode === "compare" ? (
            <span className="hidden max-w-[40%] shrink-0 truncate font-mono text-[0.62rem] text-on-surface-muted sm:inline">
              {props.base}..{props.compare}
            </span>
          ) : null}
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

/** diff 统一渲染器（含 sticky hunk 导航）——移动 L3 diff 页（03r）与提交页（03u）内嵌展开复用（M4）。 */
export function DiffContent({ diff, filePath }: { diff: string; filePath: string }) {
  const { t } = useT();
  const scrollRef = useRef<HTMLDivElement>(null);
  const hunkRowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());
  const lines = useMemo(() => parseDiff(diff), [diff]);
  const lang = useMemo(() => extToLang(filePath), [filePath]);
  const { resolved } = useTheme();
  const isDark = resolved === "dark";

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
          {highlightCodeLine(rest, lang, isDark)}
        </>
      );
    });
  }, [lines, lang, isDark]);

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

/** scope chips 统计行（All/Modified/Added/Deleted 计数）。GitDiffPanel（右栏/移动端）
 * 消费；统计渲染单源。 */
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

/** R4/R6 共享：单条 commit 行（message + author·time + hash 右侧 meta）。hash 不放 marker
 *  位——7 字符 mono 塞进 28×28 IconMarker 会溢出方框压到 title；移到右侧 meta（shrink-0）。 */
const GitCommitRow = ({ commit }: { commit: GitCommitLogItem }) => (
  <ListRow
    title={<span className="text-sm">{commit.message}</span>}
    subtitle={
      <span className="text-xs text-on-surface-muted">
        {commit.author} · {commit.relativeTime}
      </span>
    }
    meta={
      <span className="font-mono text-[0.62rem] text-on-surface-muted">
        {commit.hash.slice(0, 7)}
      </span>
    }
  />
);

/** R6 commit 历史（按 branch 过滤，默认 HEAD）。 */
const GitCommitList = ({ projectName, branch }: { projectName: string; branch?: string }) => {
  const { t } = useT();
  const log = useQuery({
    queryKey: gitLogQueryKey(projectName, branch),
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

/** R5 分支间 diff 文件列表（双选 base/compare 后渲染）。复用 GitFileList 行视觉（marker +
 * status numstat meta + path title + previousPath subtitle）。点文件 → onOpenGitCompareFile
 * 开中栏 compare tab。无差异 → ResourceStatePanel（git.compareNoDiff）。 */
const GitCompareFileList = ({
  projectName,
  base,
  compare,
  selectedPath,
  onSelectFile,
}: {
  projectName: string;
  base: string;
  compare: string;
  selectedPath?: string;
  onSelectFile: (path: string) => void;
}) => {
  const { t } = useT();
  const q = useQuery({
    queryKey: ["projects", projectName, "git", "compare", `${base}~${compare}`],
    queryFn: () => getProjectGitCompareDiff(projectName, base, compare),
  });
  return (
    <div className="mt-2 flex flex-col gap-1">
      <div className="px-1 text-[0.62rem] font-semibold uppercase tracking-wide text-on-surface-muted">
        {t("git.compareResultTitle", { base, compare })}
      </div>
      {q.isLoading ? (
        <ListRowSkeleton count={4} />
      ) : q.error ? (
        <ResourceStatePanel tone="danger" title={t("git.errorTitle")} message={q.error.message} />
      ) : q.data?.repository ? (
        q.data.files.length === 0 ? (
          <ResourceStatePanel title={t("git.compareNoDiff")} message={t("git.compareHint")} />
        ) : (
          <ListGroup ariaLabel="Git compare files">
            {q.data.files.map((file: GitCompareFileSummary) => (
              <ListRow
                key={file.path}
                marker={
                  <IconMarker size="sm" tone="muted">
                    <ShellIcon name="file" className="h-4 w-4" />
                  </IconMarker>
                }
                meta={
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
                }
                selected={selectedPath === file.path}
                subtitle={
                  file.previousPath ? t("git.fromPath", { path: file.previousPath }) : undefined
                }
                title={<span className="font-mono text-[0.82rem]">{file.path}</span>}
                onClick={() => onSelectFile(file.path)}
              />
            ))}
          </ListGroup>
        )
      ) : null}
    </div>
  );
};

/** R3 分支列表（local + remote）。点分支名 → onSelectBranch 联动切 [提交] 视图按该分支过滤。
 * R5 双选：传入 onOpenGitCompareFile 时每行 actions 加 [Base]/[Compare] 两按钮（base 默认当前
 * 分支，可改；双选完成后下方渲染 GitCompareFileList，点文件开中栏 compare tab）。未传 → 纯分支
 * 列表（右栏 inspection / 移动 GitDiffPanel，不启用双选）。 */
const GitBranchList = ({
  projectName,
  onSelectBranch,
  onOpenGitCompareFile,
  selectedCompareFile,
}: {
  projectName: string;
  onSelectBranch?: (name: string) => void;
  onOpenGitCompareFile?: (projectName: string, base: string, compare: string, path: string) => void;
  selectedCompareFile?: string;
}) => {
  const { t } = useT();
  const [baseOverride, setBaseOverride] = useState<string | undefined>(undefined);
  const [compare, setCompare] = useState<string | undefined>(undefined);
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
  // base 默认当前分支（detached HEAD current==="HEAD" → 无默认，待手动选）。
  const currentName =
    branches.data?.current && branches.data.current !== "HEAD" ? branches.data.current : undefined;
  const effectiveBase = baseOverride ?? currentName;
  const compareReady = !!(
    effectiveBase &&
    compare &&
    effectiveBase !== compare &&
    onOpenGitCompareFile
  );
  return (
    <div className="flex flex-col gap-1">
      {onOpenGitCompareFile ? (
        <div className="px-1 text-[0.62rem] text-on-surface-muted">{t("git.compareHint")}</div>
      ) : null}
      <ListGroup ariaLabel="Git branches">
        {list.map((branch) => {
          const isBase = effectiveBase === branch.name;
          const isCompare = compare === branch.name;
          return (
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
              actions={
                onOpenGitCompareFile ? (
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      aria-pressed={isBase}
                      title={t("git.compareBase")}
                      onClick={(e) => {
                        e.stopPropagation();
                        setBaseOverride((prev) => (prev === branch.name ? undefined : branch.name));
                      }}
                      className={`rounded px-1.5 py-0.5 text-[0.62rem] font-semibold transition ${
                        isBase
                          ? "bg-primary/15 text-primary"
                          : "text-on-surface-muted hover:bg-on-surface/10 hover:text-on-surface"
                      }`}
                    >
                      {t("git.compareBase")}
                    </button>
                    <button
                      type="button"
                      aria-pressed={isCompare}
                      title={t("git.compareSet")}
                      onClick={(e) => {
                        e.stopPropagation();
                        setCompare((prev) => (prev === branch.name ? undefined : branch.name));
                      }}
                      className={`rounded px-1.5 py-0.5 text-[0.62rem] font-semibold transition ${
                        isCompare
                          ? "bg-primary/15 text-primary"
                          : "text-on-surface-muted hover:bg-on-surface/10 hover:text-on-surface"
                      }`}
                    >
                      {t("git.compareSet")}
                    </button>
                  </div>
                ) : undefined
              }
            />
          );
        })}
      </ListGroup>
      {compareReady ? (
        <GitCompareFileList
          base={effectiveBase as string}
          compare={compare as string}
          projectName={projectName}
          onSelectFile={(path) =>
            onOpenGitCompareFile(projectName, effectiveBase as string, compare as string, path)
          }
          selectedPath={selectedCompareFile}
        />
      ) : null}
    </div>
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
      mode="scope"
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
                    ? "animate-out slide-out-to-bottom-full duration-300 ease-in fill-mode-forwards"
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
