import type { GitBranch, GitCommitLogItem, GitDiffScope } from "@agents-remote/shared";
import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { useSetAtom } from "jotai";
import { useMemo, useState } from "react";

import {
  getProjectGitCommitDetail,
  getProjectGitCommitFileDiff,
  getProjectGitFileDiff,
  getProjectGitLog,
  listAgentSessions,
  listProjectGitBranches,
  listProjectGitDiff,
  previewProjectFile,
  sendProjectSessionMessage,
} from "../../api/client";
import { MarkdownString } from "../markdown/MarkdownString";
import { useT } from "../../i18n";
import { ListRowSkeleton } from "../shell/shell-primitives";
import { ActionMenu } from "../ui/action-menu";
import { WIKI_QUERY_SCOPE, useWikiIndex, useWikiPage } from "../../hooks/wiki";
import { relativeTime } from "./history-list";
import { ShellIcon } from "../shell/icons";
import { DiffContent, statusShortLabel } from "../git/git-diff-viewer";
import { workbenchWikiRefsAtom } from "../../routes/workbench-model";

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
 * 03q 文件预览页：meta 行（N 行 · 更新 relative + 「查看 diff ›」）+ 只读行号渲染。文本类型才
 * 渲染 code 区（image/unsupported/too_large 走 .cap 简要说明——完整图片预览仍走原 file tab
 * 浮层路径，L3 preview 聚焦文本源码形态）。⋯ 菜单（复制路径/在 Git 中查看 diff）由调用方经
 * header l3.actions 装配。
 */
export function MobileL3FilePreview({ projectName, path, onViewDiff }: MobileL3FilePreviewProps) {
  const { t } = useT();
  const preview = useQuery({
    queryKey: ["projects", projectName, "files", "preview", path],
    queryFn: () => previewProjectFile(projectName, path),
  });

  if (preview.isLoading) {
    return <div className="cap mt-4 px-4">{t("files.loadingPreview")}</div>;
  }
  if (preview.isError || !preview.data) {
    return <div className="cap mt-4 px-4">{t("files.previewError")}</div>;
  }
  const data = preview.data;
  if (data.type !== "text") {
    return <div className="cap mt-4 px-4">{t("files.unsupported")}</div>;
  }
  const lineCount = data.content.split("\n").length;
  const updated = relativeTime(new Date(data.mtimeMs).toISOString(), t);

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-[env(safe-area-inset-bottom)]"
      data-role="l3-file-preview"
    >
      <div className="meta">
        <span>{t("files.previewMetaLines", { n: lineCount, time: updated })}</span>
        <button className="diff cursor-pointer" onClick={onViewDiff} type="button">
          {t("files.viewDiff")} ›
        </button>
      </div>
      <CodeWithLineNumbers content={data.content} />
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
 * 复用（sticky hunk 导航随带）。query key 与桌面 GitFileDiffPanel 一致（git-tab scope，缓存共享）。
 */
export function MobileL3GitDiff({ projectName, path, scope }: MobileL3GitDiffProps) {
  const { t } = useT();
  const fileDiff = useQuery({
    queryKey: ["projects", projectName, "git-tab", "file-diff", "scope", scope, path, "changes"],
    queryFn: () => getProjectGitFileDiff(projectName, scope, path),
  });
  // numstat join 工作区列表（同 key diff 与 03m/03o 去重）。
  const diffList = useQuery({
    queryKey: ["projects", projectName, "workbench-git-left", "diff"],
    queryFn: () => listProjectGitDiff(projectName),
  });
  const branch = diffList.data?.repository === true ? (diffList.data.branch?.name ?? "") : "";
  const summary =
    diffList.data?.repository === true
      ? diffList.data.files.find((f) => f.path === path && f.scope === scope)
      : undefined;

  if (fileDiff.isLoading) {
    return <div className="cap mt-4 px-4">{t("git.loadingDiff")}</div>;
  }
  if (fileDiff.isError || !fileDiff.data || fileDiff.data.repository !== true) {
    return <div className="cap mt-4 px-4">{t("git.fileError")}</div>;
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-[env(safe-area-inset-bottom)]"
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
export function dateGroupOf(
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
      className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-[env(safe-area-inset-bottom)]"
      data-role="l3-git-history"
    >
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
    return <div className="cap mt-4 px-4">{t("git.loadingDiff")}</div>;
  }
  if (detail.isError || !detail.data || detail.data.repository !== true) {
    return <div className="cap mt-4 px-4">{t("git.fileError")}</div>;
  }
  const { meta, files } = detail.data;
  const added = files.reduce((n, f) => n + (f.addedLines ?? 0), 0);
  const removed = files.reduce((n, f) => n + (f.removedLines ?? 0), 0);

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-[env(safe-area-inset-bottom)]"
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
          return (
            <div key={file.path}>
              <button
                className="frow w-full cursor-pointer text-left text-[12.5px]"
                onClick={() => toggle(file.path)}
                type="button"
              >
                <span
                  className={`badge lg ${file.status === "added" ? "A" : file.status === "deleted" ? "D" : file.status === "renamed" ? "R" : "M"}`}
                >
                  {statusShortLabel(file.status)}
                </span>
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
 * 只读边界卡 + 远程分支组。merged 置灰不做（GitBranch 无 merged 数据，记档 M8
 * `git branch --merged`）。点本地分支 → 历史页。
 */
export function L3GitBranches({ projectName, onOpenHistory }: L3GitBranchesProps) {
  const { t } = useT();
  const branches = useQuery({
    queryKey: ["projects", projectName, "git", "branches"],
    queryFn: () => listProjectGitBranches(projectName),
  });

  if (branches.isLoading) {
    return <div className="cap mt-4 px-4">{t("git.loading")}</div>;
  }
  const list = branches.data?.branches ?? [];
  const current = branches.data?.current ?? "";
  const locals = list.filter((b) => b.type === "local" && !b.isCurrent);
  const remotes = list.filter((b) => b.type === "remote");
  const cur = list.find((b) => b.isCurrent);

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-[env(safe-area-inset-bottom)]"
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
                  : `↑${cur.ahead ?? 0} ↓${cur.behind ?? 0}`}
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

/** 03v 分支行：brow（name + ahead/behind）+ bsub（branchAheadBehindSub；无 upstream 省略）。 */
function BranchRow({ branch, onClick }: { branch: GitBranch; onClick: () => void }) {
  const { t } = useT();
  const hasUpstream = branch.upstream !== undefined;
  return (
    <button className="block w-full cursor-pointer text-left" onClick={onClick} type="button">
      <span className="brow">
        <span className="n">{branch.name}</span>
        <span className="st">
          {!hasUpstream
            ? t("git.noUpstream")
            : (branch.ahead ?? 0) === 0 && (branch.behind ?? 0) === 0
              ? t("git.upToDate")
              : `↑${branch.ahead ?? 0} ↓${branch.behind ?? 0}`}
        </span>
      </span>
      <span className="bsub">
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
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pt-3 pb-[env(safe-area-inset-bottom)]">
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
      className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-[env(safe-area-inset-bottom)]"
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
