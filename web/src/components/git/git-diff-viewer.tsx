import type { GitDiffFileStatus, GitDiffScope } from "@agents-remote/shared";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getProjectGitCompareFileDiff, getProjectGitFileDiff } from "../../api/client";
import { useT } from "../../i18n";
import { useTheme } from "../../theme";
import { IconMarker, type ShellTone } from "../shell/shell-primitives";
import { ShellIcon } from "../shell/icons";
import { ResourceStatePanel } from "../files/file-browser";
import { extToLang, highlightCodeLine } from "../markdown/prism-languages";

// ── Query-key 单源（同 key 共享缓存；隔离段之间不互相 invalidate）────────────────
/** 中栏 git tab / 移动 L3 diff 的 file diff query-key 隔离段（GitFileDiffPanel 默认）。 */
export const WORKBENCH_GIT_TAB_QUERY_SCOPE = "git-tab";
/** 左栏 git 变更列表 query-key 隔离段——移动 gitchip / 工具面板 / 桌面左栏经
 * gitDiffListQueryKey 工厂共享缓存（常量本身仅本文件消费）。 */
const WORKBENCH_GIT_LEFT_QUERY_SCOPE = "workbench-git-left";

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

/** ahead/behind 态势箭头串（`↑N ↓N`；0 显 0 不省略——03m gitchip / 04 githead / 03v bcur
 * 同形制）。与前置文本的分隔空格属调用点拼接意图，不进本函数；「有 upstream 才显」
 * 「非 0,0 才显」等门控语义不同，由调用方自判。 */
export const formatAheadBehind = (ahead?: number, behind?: number): string =>
  `↑${ahead ?? 0} ↓${behind ?? 0}`;

// ── GitFileDiffPanel ──────────────────────────────────────────────

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
} &
  // scope 模式 = 变更文件（worktree/staged）；compare 模式 = 分支间 diff（base..compare）。
  // 两模式共享 DiffContent 渲染（R7 高亮/R8 展开/R9 hunk 导航），仅 query 数据源不同。
  ({ mode: "scope"; scope: GitDiffScope } | { mode: "compare"; base: string; compare: string });

/**
 * 单文件 git diff 面板（自带 query，设计 workbench-layout-fix 阶段 3）。中栏 git tab（PanelRouter，
 * 关闭走 tab ✕）与 compare 专用语境复用。path 为空 → 未选态（selectPrompt）；非空 →
 * getProjectGitFileDiff query 渲染 diff。
 */
export function GitFileDiffPanel(props: GitFileDiffPanelProps) {
  const { t } = useT();
  const { projectName, path } = props;
  // R8：展开完整文件（默认仅显示改动附近 3 行）。切换文件/scope/compare 时重置为折叠态。
  const [expanded, setExpanded] = useState(false);
  const compareRef = props.mode === "compare" ? `${props.base}~${props.compare}` : null;
  const scopeRef = props.mode === "scope" ? props.scope : null;
  useEffect(() => setExpanded(false), [path, props.mode, compareRef, scopeRef]);
  const fileDiff = useQuery({
    enabled: path !== "",
    queryKey: gitFileDiffQueryKey(
      projectName,
      WORKBENCH_GIT_TAB_QUERY_SCOPE,
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
        <div className="justify-self-end" aria-hidden="true" />
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
