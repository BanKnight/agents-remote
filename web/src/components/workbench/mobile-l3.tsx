import type { GitBranch, GitCommitLogItem, GitDiffScope } from "@agents-remote/shared";
import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { useSetAtom } from "jotai";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";

import {
  getProjectGitCommitDetail,
  getProjectGitCommitFileDiff,
  getProjectGitFileDiff,
  getProjectGitLog,
  listAgentSessions,
  listProjectGitBranches,
  listProjectGitDiff,
  sendProjectSessionMessage,
} from "../../api/client";
import { CodeEditorFallback, FileSaveButton } from "../files/file-browser";
import { ImageViewer } from "../files/image-viewer";
import { useFileEditor } from "../files/use-file-editor";
import { useConfirm } from "../shell/confirm-dialog";
import { MarkdownString } from "../markdown/MarkdownString";
import { useT } from "../../i18n";
import { ListRowSkeleton, LoadingBlock } from "../shell/shell-primitives";
import { ActionMenu } from "../ui/action-menu";
import { WIKI_QUERY_SCOPE, useWikiIndex, useWikiPage } from "../../hooks/wiki";
import { relativeTime } from "./history-list";
import { ShellIcon } from "../shell/icons";
import {
  WORKBENCH_GIT_TAB_QUERY_SCOPE,
  DiffContent,
  formatAheadBehind,
  gitDiffListQueryKey,
  gitFileDiffQueryKey,
  statusShortLabel,
} from "../git/git-diff-viewer";
import { workbenchWikiRefsAtom } from "../../routes/workbench-model";
import { formatBytes } from "@/lib/format";

// CodeEditor 重依赖 CodeMirror（~75KB+），与 FilesPanel 同款 lazy 拆包（编辑态才拉）。
const CodeEditor = lazy(() =>
  import("../files/CodeEditor").then((m) => ({ default: m.CodeEditor })),
);

/**
 * 移动 L3 详情页主体（v2 M4，对标 03q/03r/03t/03u/03v/03s）。nav 形态（back label/标题/⋯）
 * 由 MobileProjectHeader 的 l3 prop 承担，本文件只渲染 nav 下方主体（各组件自带滚动容器）。
 * file/git focus 两页由保活层按 ref.kind 分流挂载（写 layout，进保活）；git history/commit/
 * branches 与 wiki 阅读页是显式子路由（不写 layout，廉价重建）。
 */

// ── 03q 文件预览（L3）────────────────────────────────────────────────────────

/** 03q 只读行号渲染（.code/.ln/.no/.tx 原语）。文本 preview 全文按行拆分；末行保尾。 */
function CodeWithLineNumbers({ content }: { content: string }) {
  const lines = content.split("\n");
  return (
    <div className="code" data-role="l3-code">
      {lines.map((line, i) => (
        // 行号稳定（i 即 key）；内容行 pre 保留空白。
        <div className="ln" key={i}>
          <span className="no">{i + 1}</span>
          <span className="tx">{line}</span>
        </div>
      ))}
    </div>
  );
}

export type MobileL3FilePreviewProps = {
  projectName: string;
  /** 项目相对路径。 */
  path: string;
  /** 「查看 diff ›」→ git file focus（M4 L3 diff 呈现）。 */
  onViewDiff: () => void;
};

/**
 * 03q 文件预览页（批次 3 编辑能力下沉：右栏 Inspector 与移动 focus 双端同构单源）。meta 行
 *（N 行 · 更新 relative + 编辑 + 「查看 diff ›」）+ 只读行号渲染；「编辑」进编辑态（CodeEditor
 * + FileSaveButton + ⌘S，保存/dirty 丢弃确认走 useFileEditor 单源，与 FilesPanel inspection
 * 同 query key 共享缓存）。image → ImageViewer；too_large/unsupported → .cap 简要说明。⋯ 菜单
 *（复制路径/在 Git 中查看 diff）由调用方经 header l3.actions 装配。
 */
export function MobileL3FilePreview({ projectName, path, onViewDiff }: MobileL3FilePreviewProps) {
  const { t } = useT();
  const { confirm, holder: confirmHolder } = useConfirm();
  // 编辑态（组件内局部；切文件即退出——下方 effect 与 hook 清草稿同步）。
  const [editing, setEditing] = useState(false);
  useEffect(() => setEditing(false), [path]);
  // editable 随 editing 切：非编辑态 canEdit 恒 false（⌘S no-op）。initialRenderMode "source"：
  // L3 无 render toggle（查看/编辑都是源码形态），md/html 的 canEdit gate 需要 source。
  const editor = useFileEditor({
    editable: editing,
    initialRenderMode: "source",
    path,
    projectName,
    queryScope: "files",
  });

  if (editor.preview.isLoading) {
    return <LoadingBlock className="min-h-0 flex-1" label={t("files.loadingPreview")} />;
  }
  if (editor.preview.isError || !editor.previewData) {
    return <div className="cap mt-4 px-4">{t("files.previewError")}</div>;
  }
  const data = editor.previewData;

  // 非 text 类型：image → ImageViewer（缩放/旋转/双击手势工具条）；too_large/unsupported →
  // .cap 简要说明。三类都带 data-role 根（预览态语义一致，调用方锚点稳定）。confirmHolder
  // 只在 text 分支渲染（丢弃确认仅编辑态可达，image/cap 分支进不了编辑态）。
  if (data.type === "image") {
    return (
      <div className="flex min-h-0 flex-1 flex-col" data-role="l3-file-preview">
        <ImageViewer alt={data.name} src={data.dataUrl} />
      </div>
    );
  }
  if (data.type !== "text") {
    return (
      <div className="flex min-h-0 flex-1 flex-col" data-role="l3-file-preview">
        <div className="cap mt-4 px-4">
          {data.type === "too_large"
            ? t("files.tooLarge", { limit: formatBytes(data.limitBytes) })
            : t("files.unsupported")}
        </div>
      </div>
    );
  }
  const lineCount = data.content.split("\n").length;
  const updated = relativeTime(new Date(data.mtimeMs).toISOString(), t);
  // 完成编辑：dirty 时丢弃确认（与 FilesPanel 换文件守卫同款 dialog 文案）。
  const finishEditing = () => {
    if (!editor.isDirty) {
      setEditing(false);
      return;
    }
    void confirm({
      title: t("files.discard"),
      message: t("files.discardConfirm", { name: data.name }),
      cancelLabel: t("cancel"),
      confirmLabel: t("files.discard"),
      tone: "default",
    }).then((ok) => {
      if (ok) setEditing(false);
    });
  };

  return (
    <div
      className={`flex min-h-0 flex-1 flex-col pb-[max(16px,var(--shell-mobile-bottom-nav-space,0px))] ${editing ? "overflow-hidden" : "overflow-y-auto"}`}
      data-role="l3-file-preview"
    >
      {editing ? (
        // 编辑态操作行：保存（FileSaveButton 统一样式，禁用/保存中/已保存三态）+ 完成。
        // 双按钮包进单个 .diff 容器（auto margin 每份平分剩余空间——两个 .diff 会把首钮
        // 悬在行中部，design-review 批次 3）；裸文本钮加 after 纵向隐形扩区（铁律 9 触达）。
        <div className="meta">
          <span className="diff flex items-center gap-3">
            <FileSaveButton
              isDirty={editor.isDirty}
              isPending={editor.isSaving}
              onSave={editor.handleSave}
              savedFlash={editor.savedFlash}
            />
            <button
              className="relative cursor-pointer after:absolute after:inset-x-0 after:-inset-y-2.5 after:content-['']"
              onClick={finishEditing}
              type="button"
            >
              {t("files.done")}
            </button>
          </span>
        </div>
      ) : (
        <div className="meta">
          <span>{t("files.previewMetaLines", { n: lineCount, time: updated })}</span>
          <span className="diff flex items-center gap-3">
            <button
              className="relative cursor-pointer after:absolute after:inset-x-0 after:-inset-y-2.5 after:content-['']"
              onClick={() => setEditing(true)}
              type="button"
            >
              {t("files.edit")}
            </button>
            <button
              className="relative cursor-pointer after:absolute after:inset-x-0 after:-inset-y-2.5 after:content-['']"
              onClick={onViewDiff}
              type="button"
            >
              {t("git.menuViewDiff")} ›
            </button>
          </span>
        </div>
      )}
      {editing ? (
        // CodeEditor 根自带 relative+flex-1（内部 absolute 高度链，frontend-notes §8）；
        // 编辑态根 overflow-hidden 给确定高度（非编辑态滚动看长文）。
        <div className="flex min-h-0 flex-1 flex-col p-3">
          <Suspense fallback={<CodeEditorFallback />}>
            <CodeEditor name={data.name} onChange={editor.onEditChange} value={editor.editValue} />
          </Suspense>
        </div>
      ) : (
        <CodeWithLineNumbers content={data.content} />
      )}
      {confirmHolder}
    </div>
  );
}

// ── 03r git diff（L3）────────────────────────────────────────────────────────

export type MobileL3GitDiffProps = {
  projectName: string;
  path: string;
  scope: GitDiffScope;
};

/**
 * 03r git 文件 diff 页：meta 行（diffBaseScope「branch ← scope」+ numstat +-/n）+ DiffContent
 * 复用（sticky hunk 导航随带）。query key = gitFileDiffQueryKey 单源，与桌面 GitFileDiffPanel 同 key 共享缓存。
 */
export function MobileL3GitDiff({ projectName, path, scope }: MobileL3GitDiffProps) {
  const { t } = useT();
  const fileDiff = useQuery({
    queryKey: gitFileDiffQueryKey(
      projectName,
      WORKBENCH_GIT_TAB_QUERY_SCOPE,
      "scope",
      scope,
      path,
      false,
    ),
    queryFn: () => getProjectGitFileDiff(projectName, scope, path),
  });
  // numstat join 工作区列表（同 key diff 与 03m/03o 去重）。
  const diffList = useQuery({
    queryKey: gitDiffListQueryKey(projectName),
    queryFn: () => listProjectGitDiff(projectName),
  });
  const branch = diffList.data?.repository === true ? (diffList.data.branch?.name ?? "") : "";
  const summary =
    diffList.data?.repository === true
      ? diffList.data.files.find((f) => f.path === path && f.scope === scope)
      : undefined;

  if (fileDiff.isLoading) {
    return <LoadingBlock className="min-h-0 flex-1" label={t("git.loadingDiff")} />;
  }
  if (fileDiff.isError || !fileDiff.data || fileDiff.data.repository !== true) {
    return <div className="cap mt-4 px-4">{t("git.fileError")}</div>;
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-[max(16px,var(--shell-mobile-bottom-nav-space,0px))]"
      data-role="l3-git-diff"
    >
      <div className="meta">
        <span>
          {t("git.diffBaseScope", {
            base: branch || "HEAD",
            scope: scope === "staged" ? t("git.scopeStaged") : t("git.scopeWorktree"),
          })}
        </span>
        {summary && summary.addedLines !== null && summary.removedLines !== null ? (
          <span className="font-mono">
            <span className="text-success-text">+{summary.addedLines}</span>{" "}
            <span className="text-error">-{summary.removedLines}</span>
          </span>
        ) : null}
      </div>
      <DiffContent diff={fileDiff.data.diff} filePath={path} />
    </div>
  );
}

// ── 03t git 提交历史（L3）────────────────────────────────────────────────────

/** 03t 分页页大小（「加载更早提交」每次追加条数）。 */
const GIT_HISTORY_PAGE_SIZE = 30;

/** YYYY-MM-DD 本地日期串（与服务端 isoDate 同形状，字典序 = 时间序）。 */
const localDateKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** 03t 日期分组（dlg 标题）：今天/昨天/本周（近 7 天）/更早。纯函数便于复用与测试。 */
function dateGroupOf(
  isoDate: string,
  now: Date,
  labels: { today: string; yesterday: string; thisWeek: string; earlier: string },
): string {
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 6);
  if (isoDate === localDateKey(now)) return labels.today;
  if (isoDate === localDateKey(new Date(now.getTime() - 86_400_000))) return labels.yesterday;
  if (isoDate >= localDateKey(weekStart)) return labels.thisWeek;
  return labels.earlier;
}

export type L3GitHistoryProps = {
  projectName: string;
  /** 提交 ref（省略 = 当前分支；分支页跳转带 branch search param）。 */
  branch?: string;
  onOpenCommit: (hash: string) => void;
};

/** 03t 单条提交行：crow（hash + message + relative）+ csub（author）。 */
function HistoryCommitRow({
  commit,
  groupLabel,
  onClick,
}: {
  commit: GitCommitLogItem;
  groupLabel: string | null;
  onClick: () => void;
}) {
  return (
    <>
      {groupLabel !== null ? <div className="dlg">{groupLabel}</div> : null}
      <button className="crow w-full cursor-pointer text-left" onClick={onClick} type="button">
        <span className="h">{commit.hash}</span>
        <span className="m">{commit.message}</span>
        <span className="t">{commit.relativeTime}</span>
      </button>
      <div className="csub">{commit.author}</div>
    </>
  );
}

/**
 * 03t 提交历史页：meta 行（historyMeta「branch · 共 N 次提交」）+ 日期分组（dlg）+ crow/csub
 * 列表 + loadMore（loaded < total 终止判断，offset 分页追加）。branch = "" 表示当前分支。
 */
export function L3GitHistory({ projectName, branch, onOpenCommit }: L3GitHistoryProps) {
  const { t } = useT();
  // offset 分页用 useInfiniteQuery（逐页累积，getNextPageParam = loaded < total 终止判断）。
  // key 用 "log-paged" 段与桌面单页 `git log`（同 key 全量）隔离——limit 分页语义不同不共享。
  // 不加 keepPreviousData（§6.12o review 结论）：两个消费方（workbench-tab-plugin 栈 push、
  // mobile-workbench 恒 HEAD）换 branch 均重挂载，placeholder 按 observer 记忆对重挂载无效，
  // 只剩切项目时短暂跨项目陈旧列表的负作用。
  const log = useInfiniteQuery({
    queryKey: ["projects", projectName, "git", "log-paged", branch ?? ""],
    queryFn: ({ pageParam }) =>
      getProjectGitLog(projectName, branch || undefined, pageParam, GIT_HISTORY_PAGE_SIZE),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((n, p) => n + p.commits.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
  });
  const total = log.data?.pages[0]?.total ?? 0;
  const commits = useMemo(() => log.data?.pages.flatMap((p) => p.commits) ?? [], [log.data]);

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-[max(16px,var(--shell-mobile-bottom-nav-space,0px))]"
      data-role="l3-git-history"
    >
      {log.isPending ? (
        // 首载骨架（§6.12o）：防 meta 行显「HEAD · 共 0 次提交」伪态；后台刷新不进来。
        <ListRowSkeleton count={4} marker={false} />
      ) : (
        <>
          <div className="meta">
            <span>{t("git.historyMeta", { branch: branch || "HEAD", n: total })}</span>
          </div>
          {commits.map((commit, i) => {
            const group =
              i === 0 || commits[i - 1]!.isoDate !== commit.isoDate
                ? dateGroupOf(commit.isoDate ?? "", new Date(), {
                    today: t("git.dlgToday"),
                    yesterday: t("git.dlgYesterday"),
                    thisWeek: t("git.dlgThisWeek"),
                    earlier: t("git.dlgEarlier"),
                  })
                : null;
            return (
              <HistoryCommitRow
                commit={commit}
                groupLabel={group}
                key={commit.hash}
                onClick={() => onOpenCommit(commit.hash)}
              />
            );
          })}
        </>
      )}
      {log.hasNextPage ? (
        <button
          className="loadmore cursor-pointer"
          disabled={log.isFetchingNextPage}
          onClick={() => void log.fetchNextPage()}
          type="button"
        >
          {t("git.loadMore")}
        </button>
      ) : null}
    </div>
  );
}

// ── 03u git 提交详情（L3）────────────────────────────────────────────────────

export type L3GitCommitProps = {
  projectName: string;
  hash: string;
};

/**
 * 03u 提交详情页：cmsg 提交消息 + by（author · relative）+ dstat（numstat 求和）+ 变更文件
 * frow 列表（点行内嵌展开单文件 diff——对比基准 = 本次提交，getProjectGitCommitFileDiff +
 * DiffContent；不做独立 URL 层，展开态为本地 state）。
 */
export function L3GitCommit({ projectName, hash }: L3GitCommitProps) {
  const { t } = useT();
  const detail = useQuery({
    queryKey: ["projects", projectName, "git", "commit", hash],
    queryFn: () => getProjectGitCommitDetail(projectName, hash),
  });
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const toggle = (path: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  if (detail.isLoading) {
    return <LoadingBlock className="min-h-0 flex-1" label={t("git.loadingDiff")} />;
  }
  if (detail.isError || !detail.data || detail.data.repository !== true) {
    return <div className="cap mt-4 px-4">{t("git.fileError")}</div>;
  }
  const { meta, files } = detail.data;
  const added = files.reduce((n, f) => n + (f.addedLines ?? 0), 0);
  const removed = files.reduce((n, f) => n + (f.removedLines ?? 0), 0);

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-[max(16px,var(--shell-mobile-bottom-nav-space,0px))]"
      data-role="l3-git-commit"
    >
      <div className="cmsg">{meta.message}</div>
      <div className="by">
        {meta.author} · {meta.relativeTime}
      </div>
      <div className="dstat">
        <span className="add">+{added}</span>
        <span className="del">-{removed}</span>
        <span className="font-mono">{meta.hash}</span>
      </div>
      <div className="dlg">{t("git.commitFiles", { n: files.length })}</div>
      <div>
        {files.map((file) => {
          const open = expanded.has(file.path);
          // badge class 与 label 同源（statusShortLabel 单次求值，同 project-tool-panels GitStatusBadge）。
          const short = statusShortLabel(file.status);
          return (
            <div key={file.path}>
              <button
                className="frow w-full cursor-pointer text-left text-[12.5px]"
                onClick={() => toggle(file.path)}
                type="button"
              >
                <span className={`badge lg ${short}`}>{short}</span>
                <span className="p">{file.path}</span>
                {file.addedLines !== null && file.removedLines !== null ? (
                  <span className="tm font-mono">
                    <span className="text-success-text">+{file.addedLines}</span>{" "}
                    <span className="text-error">-{file.removedLines}</span>
                  </span>
                ) : null}
                <span className="ar">
                  <span className="text-[14px]">{open ? "▾" : "▸"}</span>
                </span>
              </button>
              {open ? (
                <CommitFileDiff projectName={projectName} hash={hash} path={file.path} />
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="cap mt-4 px-4">{t("git.commitFileCap")}</div>
    </div>
  );
}

/** 03u 内嵌单文件 diff（展开态挂载；对比基准 = 本次提交）。 */
function CommitFileDiff({
  projectName,
  hash,
  path,
}: {
  projectName: string;
  hash: string;
  path: string;
}) {
  const { t } = useT();
  const fileDiff = useQuery({
    queryKey: ["projects", projectName, "git", "commit-diff", hash, path],
    queryFn: () => getProjectGitCommitFileDiff(projectName, hash, path),
  });
  if (fileDiff.isError || !fileDiff.data || fileDiff.data.repository !== true) {
    return <div className="csub">{t("git.fileError")}</div>;
  }
  return <DiffContent diff={fileDiff.data.diff} filePath={path} />;
}

// ── 03v git 分支（L3）────────────────────────────────────────────────────────

export type L3GitBranchesProps = {
  projectName: string;
  /** 点本地分支 → 历史页（branch search param）。 */
  onOpenHistory: (branch: string) => void;
};

/**
 * 03v 分支页：bcur 当前分支卡（tint-blue）+ 其他本地分支 brow/bsub（aheadBehindSub）+ rocard
 * 只读边界卡 + 远程分支组。merged 行置灰（M8 已落：listBranches `--merged HEAD` 派生
 * GitBranch.merged，解析失败 undefined 不标不阻塞）。点本地分支 → 历史页。
 */
export function L3GitBranches({ projectName, onOpenHistory }: L3GitBranchesProps) {
  const { t } = useT();
  const branches = useQuery({
    queryKey: ["projects", projectName, "git", "branches"],
    queryFn: () => listProjectGitBranches(projectName),
  });

  if (branches.isPending) {
    // 分支页是 bcur 卡 + brow 行列表 → 标准表「行列表首载」层用同形骨架（§6.12o review 修正：
    // 原 LoadingBlock 属详情层，与同栈 L3GitHistory 的骨架不同层异形）。
    return <ListRowSkeleton action="none" count={4} marker={false} />;
  }
  const list = branches.data?.branches ?? [];
  const current = branches.data?.current ?? "";
  const locals = list.filter((b) => b.type === "local" && !b.isCurrent);
  const remotes = list.filter((b) => b.type === "remote");
  const cur = list.find((b) => b.isCurrent);

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-[max(16px,var(--shell-mobile-bottom-nav-space,0px))]"
      data-role="l3-git-branches"
    >
      <div className="dlg">{t("git.branchesTitle", { n: list.length })}</div>
      <div className="sect">{t("git.sectCurrentBranch")}</div>
      {cur ? (
        <div className="bcur">
          <div className="r1">
            <span>{cur.name}</span>
            <span className="st">
              {cur.upstream === undefined
                ? t("git.noUpstream")
                : (cur.ahead ?? 0) === 0 && (cur.behind ?? 0) === 0
                  ? t("git.upToDate")
                  : formatAheadBehind(cur.ahead, cur.behind)}
            </span>
          </div>
          <div className="d2">{t("git.bcurSub", { time: cur.lastCommitShort ?? "" })}</div>
        </div>
      ) : (
        <div className="bcur">
          <div className="r1">
            <span>{current === "HEAD" ? t("git.detached") : current}</span>
          </div>
        </div>
      )}
      <div className="sect">{t("git.sectOtherBranches", { n: locals.length })}</div>
      {locals.map((b) => (
        <BranchRow key={b.name} branch={b} onClick={() => onOpenHistory(b.name)} />
      ))}
      {locals.length === 0 ? (
        <div className="px-4 py-2 text-[12.5px] text-ink-2">{t("git.noBranches")}</div>
      ) : null}
      <div className="rocard">
        <div className="t">{t("git.rocardTitle")}</div>
        <div className="d">{t("git.rocardDesc")}</div>
      </div>
      {remotes.length > 0 ? (
        <>
          <div className="sect">{t("git.sectRemoteBranches")}</div>
          {remotes.map((b) => (
            <BranchRow key={b.name} branch={b} onClick={() => onOpenHistory(b.name)} />
          ))}
        </>
      ) : null}
    </div>
  );
}

/** 03v 分支行：brow（name + ahead/behind）+ bsub（branchAheadBehindSub；无 upstream 省略）。
 * merged 行（原型 pin③）置灰：n 降 ink-2/400 + st 换「已合并」缀注（不显示 ↑↓）。 */
function BranchRow({ branch, onClick }: { branch: GitBranch; onClick: () => void }) {
  const { t } = useT();
  const hasUpstream = branch.upstream !== undefined;
  const merged = branch.merged === true;
  return (
    <button className="block w-full cursor-pointer text-left" onClick={onClick} type="button">
      <span className={merged ? "brow merged" : "brow"}>
        <span className="n">{branch.name}</span>
        <span className={merged ? "st mg" : "st"}>
          {merged
            ? t("git.merged")
            : !hasUpstream
              ? t("git.noUpstream")
              : (branch.ahead ?? 0) === 0 && (branch.behind ?? 0) === 0
                ? t("git.upToDate")
                : formatAheadBehind(branch.ahead, branch.behind)}
        </span>
      </span>
      <span className={merged ? "bsub mg" : "bsub"}>
        {hasUpstream
          ? t("git.branchAheadBehindSub", {
              base: branch.upstream ?? "",
              ahead: branch.ahead ?? 0,
              behind: branch.behind ?? 0,
              time: branch.lastCommitShort ?? "",
            })
          : (branch.lastCommitShort ?? "")}
      </span>
    </button>
  );
}

// ── 03s wiki 阅读页（L3）─────────────────────────────────────────────────────

export type L3WikiReaderProps = {
  projectName: string;
  slug: string;
  /** rel「同组页」跳转（同首 tag 的其他页，组件内派生）。 */
  onOpenPage: (slug: string) => void;
};

/**
 * 03s wiki 阅读页：wmeta（更新日期）+ readbtn「让 Agent 读这篇」（ActionMenu 选 agent 会话 →
 * D13 REST 注入 + wikiRefs 记忆）+ wlink 复制链接 + MarkdownString 正文 + rel 同组页跳转 +
 * cap 只读说明。注入协议：text = injectPrompt 模板 + 页面正文（§6.2 A 方案——stdin prompt 注入，
 * 客户端引用 atom 驱动流顶引用卡与 refnote）。
 */
export function L3WikiReader({ projectName, slug, onOpenPage }: L3WikiReaderProps) {
  const { t } = useT();
  const setWikiRefs = useSetAtom(workbenchWikiRefsAtom);
  const page = useWikiPage(projectName, slug, WIKI_QUERY_SCOPE);
  const index = useWikiIndex(projectName, WIKI_QUERY_SCOPE);
  // 注入目标会话（agent only；组件挂载即取——readbtn 菜单数据源）。
  const sessions = useQuery({
    queryKey: ["projects", projectName, "agent-sessions"],
    queryFn: () => listAgentSessions(projectName),
  });
  const [injectError, setInjectError] = useState(false);

  const title = page.data?.frontmatter.title ?? slug;
  const inject = useMutation({
    mutationFn: async (sessionId: string) => {
      const text = `${t("wiki.injectPrompt", { slug, title })}${page.data?.body ?? ""}`;
      await sendProjectSessionMessage(projectName, sessionId, text);
      return sessionId;
    },
    onSuccess: (sessionId) => {
      setInjectError(false);
      setWikiRefs((prev) => {
        const perProject = prev[projectName] ?? {};
        const perSession = perProject[sessionId] ?? [];
        if (perSession.some((r) => r.slug === slug)) return prev;
        return {
          ...prev,
          [projectName]: { ...perProject, [sessionId]: [...perSession, { slug, title }] },
        };
      });
      // refnote/ref 卡读 wikiRefs atom，不依赖 query；失败态清理即可。
    },
    onError: () => setInjectError(true),
  });

  if (page.isLoading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pt-3 pb-[max(16px,var(--shell-mobile-bottom-nav-space,0px))]">
        <ListRowSkeleton count={2} marker={false} />
      </div>
    );
  }
  if (page.isError || !page.data) {
    return <div className="cap mt-4 px-4">{t("wiki.pageMissing")}</div>;
  }
  // rel 同组页：首 tag 相同的其他页（index 反查；无 tag 页同组 = 其他无 tag 页）。
  const groupPeers = (index.data?.pages ?? []).filter(
    (p) => p.slug !== slug && (p.tags[0] ?? "") === (page.data!.frontmatter.tags[0] ?? ""),
  );

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-[max(16px,var(--shell-mobile-bottom-nav-space,0px))]"
      data-role="l3-wiki-reader"
    >
      <div className="wmeta">{t("wiki.updatedMeta", { date: page.data.frontmatter.updated })}</div>
      <ActionMenu
        align="start"
        cancelLabel={t("cancel")}
        items={
          sessions.data?.sessions.length
            ? sessions.data.sessions.map((s) => ({
                label: s.displayName,
                icon: <ShellIcon name="agent-nav" />,
                onSelect: () => inject.mutate(s.id),
              }))
            : [
                {
                  label: t("wiki.noSessions"),
                  onSelect: () => undefined,
                  disabled: true,
                },
              ]
        }
        trigger={
          <button className="readbtn cursor-pointer" disabled={inject.isPending} type="button">
            <ShellIcon name="book" className="h-4 w-4" />
            {t("wiki.readByAgent")}
          </button>
        }
      />
      {injectError ? <div className="cap mt-2 px-4">{t("wiki.injectFailed")}</div> : null}
      <button
        className="wlink cursor-pointer"
        onClick={() => {
          void navigator.clipboard.writeText(
            `${window.location.origin}/projects/${encodeURIComponent(projectName)}/wiki/${encodeURIComponent(slug)}`,
          );
        }}
        type="button"
      >
        {t("wiki.copyLink")}
      </button>
      <div className="px-4 py-2">
        <MarkdownString text={page.data.body} />
      </div>
      {groupPeers.length > 0 ? (
        <>
          <div className="rel">{page.data.frontmatter.tags[0] || t("wiki.groupUngrouped")}</div>
          {groupPeers.map((p) => (
            <button
              className="wpg flex w-full cursor-pointer text-left"
              key={p.slug}
              onClick={() => onOpenPage(p.slug)}
              type="button"
            >
              <span className="n flex-1 truncate">{p.title}</span>
              <span className="st">{p.updated}</span>
            </button>
          ))}
        </>
      ) : null}
      <div className="cap mt-4 px-4">{t("wiki.readOnlyCap")}</div>
    </div>
  );
}
