import type {
  GitCommitLogItem,
  GitDiffFileSummary,
  GitDiffScope,
  ProjectFileEntry,
  WikiIndexResponse,
} from "@agents-remote/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useMemo, useRef, useState } from "react";

import {
  createFolder,
  deleteFile,
  getProjectGitLog,
  listProjectFiles,
  listProjectGitBranches,
  listProjectGitDiff,
  renameFile,
  searchProjectFiles,
  searchWiki,
} from "../../api/client";
import { enqueueUploads, UploadQueueCard } from "../files/upload-queue";
import { useConfirm } from "../shell/confirm-dialog";
import { usePromptDialog } from "../shell/prompt-dialog";
import { relativeTime } from "./history-list";
import { useT } from "../../i18n";
import { WIKI_QUERY_SCOPE, useWikiIndex } from "../../hooks/wiki";
import type { TranslateFn } from "../../i18n/types";
import { ShellIcon } from "../shell/icons";
import { WORKBENCH_GIT_LEFT_QUERY_SCOPE, statusShortLabel } from "../git/git-diff-viewer";
import { ActionMenu, useLongPressActions, useRowContextMenu } from "../ui/action-menu";
import type { MobileProjectTool } from "./mobile-project-header";
import { workbenchWikiRefsAtom } from "../../routes/workbench-model";

/** frow badge 状态 → .badge 变体字符（M/A/D/R 与 statusShortLabel 同源；D/R 变体 M4 新增）。 */
function gitBadgeVariant(status: GitDiffFileSummary["status"]): string {
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
}

/** frow 行尾进入指示 chevron（.ar 内 14×14，SF Symbols chevron.right；与 SettingsChevron 同范式）。 */
function RowChevron() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 16 16">
      <path
        d="M6 3.5 10.5 8 6 12.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

/**
 * 移动项目三工具的原生形态面板（v2 M4，对标 03m/03o/03p）。与桌面左栏组件（FilesLeftPanel /
 * GitChangesList / WikiPanel）同数据管道：query key 完全一致（diff/log/branches/files/wiki-index）
 * 缓存去重；换的只是移动形态（frow/crow/tgrp/wpg 原语行 + header 工具 chip 联动）。
 */

/** 工具面板根容器（占满工具态主体，滚动交内部列表区）。 */
function ToolPanel({ children, tool }: { children: React.ReactNode; tool: MobileProjectTool }) {
  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-y-auto pb-[env(safe-area-inset-bottom)]"
      data-mobile-tool={tool}
    >
      {children}
    </div>
  );
}

// ── 03m Git 工具（M4）────────────────────────────────────────────────────────

/** 03m「最近提交」crow 行。h=短 hash mono、m=提交消息、t=相对时间。 */
function GitCommitRow({ commit, onClick }: { commit: GitCommitLogItem; onClick: () => void }) {
  return (
    <button className="crow cursor-pointer text-left" onClick={onClick} type="button">
      <span className="h">{commit.hash}</span>
      <span className="m">{commit.message}</span>
      <span className="t">{commit.relativeTime}</span>
    </button>
  );
}

export type MobileGitToolProps = {
  projectName: string;
  /** 工作区改动行点击 → git file focus（现有 onOpenGitFile 管道，M4 呈现为 L3 diff）。 */
  onOpenGitFile: (file: GitDiffFileSummary) => void;
  onOpenCommit: (hash: string) => void;
  onOpenHistory: () => void;
  onOpenBranches: () => void;
};

/**
 * 03m Git 工具面板：sect「工作区改动」frow 列表（badge + path + ›）→ sect「最近提交」crow×3 →
 * links「全部历史 · 分支(N)」→ cap 工具替换说明。diff/log/branches 三个 query key 与桌面
 * GitChangesList / GitCommitList / GitBranchList 完全一致（缓存共享去重，单一数据管道）。
 */
export function MobileGitTool({
  projectName,
  onOpenGitFile,
  onOpenCommit,
  onOpenHistory,
  onOpenBranches,
}: MobileGitToolProps) {
  const { t } = useT();
  // 与 GitChangesList 同 key（workbench-git-left scope）——header gitchip / 工具面板 / 桌面
  // 左栏三方共享缓存。
  const diff = useQuery({
    queryKey: ["projects", projectName, WORKBENCH_GIT_LEFT_QUERY_SCOPE, "diff"],
    queryFn: () => listProjectGitDiff(projectName),
  });
  // 03m 最近提交：与桌面 GitCommitList 完全同 key 同 queryFn（缓存共享），前端 slice 3 条。
  const log = useQuery({
    queryKey: ["projects", projectName, "git", "log", ""],
    queryFn: () => getProjectGitLog(projectName),
  });
  // links「分支 (N)」计数；与分支页 query 同 key。
  const branches = useQuery({
    queryKey: ["projects", projectName, "git", "branches"],
    queryFn: () => listProjectGitBranches(projectName),
  });
  const files = diff.data?.repository === true && diff.data.files.length > 0 ? diff.data.files : [];
  const commits = log.data?.commits.slice(0, 3) ?? [];
  const branchCount = branches.data?.branches.length ?? 0;

  return (
    <ToolPanel tool="git">
      <div className="sect">{t("git.sectWorktree")}</div>
      <div className="px-0">
        {files.map((file) => (
          <button
            className="frow w-full cursor-pointer text-left"
            key={`${file.scope}/${file.path}`}
            onClick={() => onOpenGitFile(file)}
            type="button"
          >
            <span className={`badge lg ${gitBadgeVariant(file.status)}`}>
              {statusShortLabel(file.status)}
            </span>
            <span className="p">{file.path}</span>
            <span className="ar">
              <RowChevron />
            </span>
          </button>
        ))}
        {files.length === 0 ? (
          <div className="px-4 py-2 text-[12.5px] text-ink-2">{t("git.noChanges")}</div>
        ) : null}
      </div>

      <div className="sect">{t("git.sectRecent")}</div>
      <div>
        {commits.map((commit) => (
          <GitCommitRow
            commit={commit}
            key={commit.hash}
            onClick={() => onOpenCommit(commit.hash)}
          />
        ))}
        {commits.length === 0 ? (
          <div className="px-4 py-2 text-[12.5px] text-ink-2">{t("git.noCommits")}</div>
        ) : null}
      </div>

      <div className="links">
        <button onClick={onOpenHistory} type="button">
          {t("git.linkHistory")}
        </button>
        <button onClick={onOpenBranches} type="button">
          {t("git.linkBranches", { n: branchCount })}
        </button>
      </div>
      <div className="cap mt-4 px-4">{t("git.capToolReplace")}</div>
    </ToolPanel>
  );
}

// ── 03o 文件工具 + 03w 长按菜单（M4）────────────────────────────────────────

/** epoch ms → 相对时间（03o 文件行 .tm）。history-list relativeTime 是 ISO 入参，epoch 转秒级
 * 精度的 Date 后走同一 i18n 管道。 */
function mtimeRelative(mtimeMs: number, t: TranslateFn): string {
  return relativeTime(new Date(mtimeMs).toISOString(), t);
}

type MobileFilesToolProps = {
  projectName: string;
  /** cwd 记忆（受控，workbenchMobileProjectFilesPathAtom；§13 回退语义由调用方守）。 */
  path: string;
  /** 03x header 搜索框的查询（提升共享：chip 与面板结果列表同 query state）。 */
  searchQuery: string;
  onPathChange: (path: string) => void;
  onOpenFile: (projectName: string, path: string) => void;
  /** 03w「在 Git 中查看 diff」→ git file focus（scope 取该文件的 worktree/staged）。 */
  onOpenGitFile: (file: { path: string; scope: GitDiffScope }) => void;
};

/**
 * 03o 文件工具面板：目录行（.p.dir + ›）+ 文件行（.ic + mono path + mtime + git badge + ›）。
 * git worktree 改动态 join（同 key diff query 与 GitChangesList 去重）——有改动的文件行尾显
 * badge（03o 编号③）。文件行长按/右键 = 03w 写操作菜单（打开预览/复制路径/在 Git 查看 diff/
 * 重命名/移动到…/删除…）；目录行 = 进入。写操作 mutation 后失效 files + git diff 缓存。
 */
export function MobileFilesTool({
  projectName,
  path,
  searchQuery,
  onPathChange,
  onOpenFile,
  onOpenGitFile,
}: MobileFilesToolProps) {
  const { t } = useT();
  const queryClient = useQueryClient();
  // 与 FilesPanel 同 key（queryScope "files"）——工具面板与浮层文件树共享缓存。
  const listing = useQuery({
    queryKey: ["projects", projectName, "files", path],
    queryFn: () => listProjectFiles(projectName, path || undefined),
  });
  const diff = useQuery({
    queryKey: ["projects", projectName, WORKBENCH_GIT_LEFT_QUERY_SCOPE, "diff"],
    queryFn: () => listProjectGitDiff(projectName),
  });
  // path → 改动态（worktree 改动优先；03o 编号③「git 工作区改动态 join 文件浏览」）。
  const dirty = useMemo(() => {
    const map = new Map<string, GitDiffFileSummary>();
    if (diff.data?.repository !== true) return map;
    for (const f of diff.data.files) {
      if (!map.has(f.path)) map.set(f.path, f);
    }
    return map;
  }, [diff.data]);
  // 03w 复制路径反馈（sheet 关闭后行下 cap 短暂显示「已复制」）。
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const ctx = useRowContextMenu();
  // 03x 搜索态（query 提升在 mobile-workbench header chip，非空 → 面板渲染结果列表）。
  const trimmedQuery = searchQuery.trim();
  const search = useQuery({
    queryKey: ["projects", projectName, "files", "search", trimmedQuery],
    queryFn: () => searchProjectFiles(projectName, trimmedQuery),
    enabled: trimmedQuery.length > 0,
  });
  // 03z 上传/03y 新建入口：hidden input + 目标目录 ref（菜单 onSelect → click 时序安全）。
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetDirRef = useRef("");
  const openUploadPicker = (targetDir: string) => {
    uploadTargetDirRef.current = targetDir;
    uploadInputRef.current?.click();
  };
  const openCreatePrompt = () => {
    void createDialog
      .prompt({
        title: t("files.linkCreate"),
        placeholder: t("files.newFolder"),
        confirmLabel: t("files.create"),
        cancelLabel: t("cancel"),
      })
      .then((value) => {
        if (value === null) return;
        const name = value.trim();
        if (name.length === 0) return;
        createFolderMutation.mutate({ parentPath: path, name });
      });
  };
  // 03y 语义：rename/move/新建 prompt 与删除 confirm 走 Radix 对话框（弃 window.prompt/confirm）。
  const renameDialog = usePromptDialog();
  const moveDialog = usePromptDialog();
  const createDialog = usePromptDialog();
  const { confirm, holder: confirmHolder } = useConfirm();
  // 03w 触屏可达（design-reviewer M4 P2-5）：共享 touch 长按 hook（02c pill 同款，抽自本处
  // 内联实现）；移动超 slop 或提前松手取消；guardClick 抑制长按后紧随的合成 click。
  const lp = useLongPressActions(ctx.openAt);

  // 写操作公共失败/成功：失效 files 列表 + git diff（rename/move/delete 都可能改两者）。
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["projects", projectName, "files"] });
    void queryClient.invalidateQueries({
      queryKey: ["projects", projectName, WORKBENCH_GIT_LEFT_QUERY_SCOPE, "diff"],
    });
  };
  const renameMutation = useMutation({
    mutationFn: ({
      entry,
      newName,
      targetDir,
    }: {
      entry: ProjectFileEntry;
      newName: string;
      targetDir?: string;
    }) => renameFile(projectName, entry.path, newName, targetDir),
    onSuccess: invalidate,
  });
  const deleteMutation = useMutation({
    mutationFn: (entryPath: string) => deleteFile(projectName, entryPath),
    onSuccess: invalidate,
  });
  const createFolderMutation = useMutation({
    mutationFn: ({ parentPath, name }: { parentPath: string; name: string }) =>
      createFolder(projectName, parentPath, name),
    onSuccess: invalidate,
  });

  const menuItems = (entry: ProjectFileEntry) => [
    {
      label: t("files.menuOpenPreview"),
      icon: <ShellIcon name="eye" />,
      onSelect: () => onOpenFile(projectName, entry.path),
    },
    {
      label: t("files.menuCopyPath"),
      icon: <ShellIcon name="edit" />,
      onSelect: () => {
        void navigator.clipboard.writeText(`${projectName}/${entry.path}`);
        setCopiedPath(entry.path);
        window.setTimeout(() => setCopiedPath((p) => (p === entry.path ? null : p)), 2000);
      },
    },
    ...(dirty.has(entry.path)
      ? [
          {
            label: t("files.menuViewDiff"),
            icon: <ShellIcon name="git-nav" />,
            onSelect: () => {
              const found = dirty.get(entry.path);
              if (found) onOpenGitFile({ path: found.path, scope: found.scope });
            },
          },
        ]
      : []),
    {
      label: t("files.rename"),
      icon: <ShellIcon name="edit" />,
      onSelect: () => {
        void renameDialog
          .prompt({
            title: t("files.rename"),
            placeholder: t("files.renamePrompt"),
            initialValue: entry.name,
            confirmLabel: t("files.rename"),
            cancelLabel: t("cancel"),
          })
          .then((value) => {
            if (value === null) return;
            const newName = value.trim();
            if (newName.length === 0 || newName === entry.name) return;
            renameMutation.mutate({ entry, newName });
          });
      },
    },
    {
      label: t("files.menuMove"),
      icon: <ShellIcon name="folder" />, // 与桌面「移动到…」同 icon（design-reviewer M8 P3：同一动作两端一致）
      onSelect: () => {
        const currentDir = entry.path.includes("/")
          ? entry.path.slice(0, entry.path.lastIndexOf("/"))
          : "";
        void moveDialog
          .prompt({
            title: t("files.menuMove"),
            placeholder: t("files.movePrompt"),
            initialValue: currentDir,
            confirmLabel: t("files.move"),
            cancelLabel: t("cancel"),
          })
          .then((targetDir) => {
            if (targetDir === null) return;
            const trimmed = targetDir.trim();
            if (trimmed === currentDir) return;
            renameMutation.mutate({
              entry,
              newName: entry.name,
              targetDir: trimmed.length > 0 ? trimmed : undefined,
            });
          });
      },
    },
    {
      label: t("files.delete"),
      icon: <ShellIcon name="trash" />,
      variant: "destructive" as const,
      onSelect: () => {
        const warn = dirty.has(entry.path) ? `\n\n${t("files.deleteDirtyWarn")}` : "";
        void confirm({
          title: t("files.delete"),
          message: `${t("files.deleteConfirm", { name: entry.name })}${warn}`,
          cancelLabel: t("cancel"),
          confirmLabel: t("files.delete"),
          tone: "danger",
        }).then((ok) => {
          if (ok) deleteMutation.mutate(entry.path);
        });
      },
    },
  ];

  // 03z pin①「长按文件夹行 → 上传到此」+ 03o pin④「增=新建」：目录行菜单（进入/新建到此/上传到此）。
  const dirMenuItems = (entry: ProjectFileEntry) => [
    {
      label: t("files.menuCreateHere"),
      icon: <ShellIcon name="folder-plus" />,
      onSelect: () => {
        void createDialog
          .prompt({
            title: t("files.linkCreate"),
            placeholder: t("files.newFolder"),
            confirmLabel: t("files.create"),
            cancelLabel: t("cancel"),
          })
          .then((value) => {
            if (value === null) return;
            const name = value.trim();
            if (name.length === 0) return;
            createFolderMutation.mutate({ parentPath: entry.path, name });
          });
      },
    },
    {
      label: t("files.menuUploadHere"),
      icon: <ShellIcon name="upload" />,
      onSelect: () => openUploadPicker(entry.path),
    },
  ];

  const entries = listing.data?.entries ?? [];
  const parentPath = listing.data?.parentPath ?? null;

  // 03x 搜索态：非空 query → 结果列表（.res 计数 + .hrow 行，点击 → 预览）。面板早退分支。
  if (trimmedQuery.length > 0) {
    const matches = search.data?.matches ?? [];
    return (
      <ToolPanel tool="files">
        <div className="res">
          {search.data?.truncated === true
            ? t("files.searchTruncated", { n: matches.length })
            : t("files.searchCount", { n: matches.length })}
        </div>
        {matches.map((m) => (
          <button
            className="xrow w-full cursor-pointer text-left"
            key={m.path}
            onClick={() => {
              onOpenFile(projectName, m.path);
            }}
            type="button"
          >
            <span className="ic">
              <ShellIcon
                name={m.type === "directory" ? "project" : "file"}
                className="h-[17px] w-[17px]"
              />
            </span>
            <span className="p">{m.path}</span>
            {dirty.has(m.path) ? (
              <span className={`badge lg ${gitBadgeVariant(dirty.get(m.path)!.status)}`}>
                {statusShortLabel(dirty.get(m.path)!.status)}
              </span>
            ) : null}
          </button>
        ))}
        {search.isLoading ? (
          <div className="px-4 py-2 text-[12.5px] text-ink-2">{t("files.loading")}</div>
        ) : null}
        {!search.isLoading && matches.length === 0 ? (
          <div className="px-4 py-2 text-[12.5px] text-ink-2">{t("files.searchEmpty")}</div>
        ) : null}
      </ToolPanel>
    );
  }

  return (
    <ToolPanel tool="files">
      {/* 03o 目录面包屑 cap（03o 编号①：.. 返回上级）；header toolChip 已有 .crumb 导航，
        此处只补「..」上一级行保底（原型首行）。 */}
      {parentPath !== null ? (
        <button
          className="frow w-full cursor-pointer text-left"
          onClick={() => onPathChange(parentPath)}
          type="button"
        >
          <span className="p dir">..</span>
        </button>
      ) : null}
      {entries.map((entry) => {
        const dirtyFile = dirty.get(entry.path);
        const isDir = entry.type === "directory";
        return (
          <button
            className="frow w-full cursor-pointer select-none text-left"
            key={entry.path}
            onClick={() => {
              if (lp.guardClick()) return;
              if (isDir) onPathChange(entry.path);
              else onOpenFile(projectName, entry.path);
            }}
            onContextMenu={(e) => ctx.openAt(entry.path, e)}
            type="button"
            {...lp.bind(entry.path)}
          >
            {/* 03z pin①：目录行长按/右键 = 上传到此（+ 新建到此）。 */}
            {isDir ? (
              <span className="ic">
                <ShellIcon name="project" className="h-[17px] w-[17px]" />
              </span>
            ) : (
              <span className="ic">
                <ShellIcon name="file" className="h-[17px] w-[17px]" />
              </span>
            )}
            <span className={`p${isDir ? " dir" : ""}`}>{entry.name}</span>
            {!isDir && entry.mtimeMs !== undefined ? (
              <span className="tm">{mtimeRelative(entry.mtimeMs, t)}</span>
            ) : null}
            {dirtyFile ? (
              <span className={`badge lg ${gitBadgeVariant(dirtyFile.status)}`}>
                {statusShortLabel(dirtyFile.status)}
              </span>
            ) : null}
            <span className="ar">
              <RowChevron />
            </span>
            {/* 03w 长按/右键菜单：per-row key 受控（contextMenuPoint 仅命中行非空）。 */}
            <ActionMenu
              cancelLabel={t("cancel")}
              contextMenuPoint={ctx.pointFor(entry.path)}
              items={isDir ? dirMenuItems(entry) : menuItems(entry)}
              onContextMenuClose={ctx.close}
              trigger={<span className="hidden" />}
            />
          </button>
        );
      })}
      {/* 03z 上传队列卡（.upcard，与桌面 FilesPanel 双端单源）。 */}
      <UploadQueueCard />
      {/* 03o pin④「增=新建/上传（到当前作用域）」：底部 .links 行（03m Git 工具同款）。 */}
      <div className="links">
        <button onClick={openCreatePrompt} type="button">
          {t("files.linkCreate")}
        </button>
        <button onClick={() => openUploadPicker(path)} type="button">
          {t("files.linkUpload")}
        </button>
        <input
          ref={uploadInputRef}
          className="hidden"
          type="file"
          multiple
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              enqueueUploads(projectName, uploadTargetDirRef.current, Array.from(e.target.files));
            }
            e.target.value = "";
          }}
        />
      </div>
      {copiedPath ? (
        <div className="cap mt-2 px-4">{t("files.copied")}</div>
      ) : (
        <div className="cap mt-4 px-4">{t("files.capBreadcrumb")}</div>
      )}
      {/* 03y/03w 对话框 holder（rename/move/新建 prompt + 删除 confirm）：usePromptDialog 的
        holder 必须挂载才渲染——否则 item.onSelect 里 prompt() 的 promise 永不 resolve。 */}
      {renameDialog.holder}
      {moveDialog.holder}
      {createDialog.holder}
      {confirmHolder}
    </ToolPanel>
  );
}

// ── 03p Wiki 工具（M4）───────────────────────────────────────────────────────

type WikiGroup = { key: string; title: string; pages: WikiIndexResponse["pages"] };

/** 03p 分组树派生（纯函数）：首页面首个 tag 分组、无 tag 归「未分组」（客户端派生，
 * 服务端 index 无分组概念）。 */
export function groupWikiPages(
  pages: WikiIndexResponse["pages"],
  ungroupedTitle: string,
): WikiGroup[] {
  const groups = new Map<string, WikiGroup>();
  for (const page of pages) {
    const key = page.tags[0] ?? "";
    const title = key || ungroupedTitle;
    const existing = groups.get(key || "__ungrouped__");
    if (existing) existing.pages.push(page);
    else groups.set(key || "__ungrouped__", { key: key || "__ungrouped__", title, pages: [page] });
  }
  return [...groups.values()];
}

type MobileWikiToolProps = {
  projectName: string;
  /** header wsearch 展开的查询输入（提升共享：chip 与结果列表同 query state）。 */
  query: string;
  onQueryChange: (query: string) => void;
  onOpenPage: (slug: string) => void;
};

/**
 * 03p Wiki 工具面板：搜索态（query 非空 → searchWiki 匹配页列表）→ 分组树（tgrp 组头折叠 +
 * wpg 页行）。wpg 行首 .ref 紫圆标记 = 该页已被注入过 agent 会话（workbenchWikiRefsAtom 反查），
 * refnote 行 = 注入会话数（03p 编号②「已注入」态）。同 key wiki-index 与桌面 WikiPanel 去重。
 */
export function MobileWikiTool({
  projectName,
  query,
  onQueryChange,
  onOpenPage,
}: MobileWikiToolProps) {
  const { t } = useT();
  const refsWithSession = useAtomValue(workbenchWikiRefsAtom);
  const index = useWikiIndex(projectName, WIKI_QUERY_SCOPE);
  // 搜索态 query（enabled: 非空防抖省略——wiki 库小，直查）。
  const trimmed = query.trim();
  const search = useQuery({
    queryKey: ["projects", projectName, WIKI_QUERY_SCOPE, "wiki-search", trimmed],
    queryFn: () => searchWiki(projectName, trimmed),
    enabled: trimmed.length > 0,
  });
  // D13 注入反查：任一会话注入过该页 = ref 标记（wikiRefs[projectName] 展平计数）。
  const refsBySlug = useMemo(() => {
    const perProject = refsWithSession[projectName] ?? {};
    const counts = new Map<string, number>();
    for (const refs of Object.values(perProject)) {
      for (const ref of refs) counts.set(ref.slug, (counts.get(ref.slug) ?? 0) + 1);
    }
    return counts;
  }, [refsWithSession, projectName]);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const groups = useMemo(
    () => groupWikiPages(index.data?.pages ?? [], t("wiki.groupUngrouped")),
    [index.data, t],
  );

  if (trimmed.length > 0) {
    const matches = search.data?.matches ?? [];
    return (
      <ToolPanel tool="wiki">
        <div className="sect">{t("wiki.searchPlaceholder")}</div>
        {matches.map((m) => (
          <button
            className="wpg flex w-full flex-wrap cursor-pointer text-left"
            key={m.slug}
            onClick={() => {
              onQueryChange("");
              onOpenPage(m.slug);
            }}
            type="button"
          >
            <span className="n flex-1 truncate">{m.title}</span>
            <span className="st">{m.updated}</span>
            <span className="refnote w-full truncate">{m.lines[0] ?? ""}</span>
          </button>
        ))}
        {matches.length === 0 ? (
          <div className="px-4 py-2 text-[12.5px] text-ink-2">{t("wiki.searchNoMatch")}</div>
        ) : null}
      </ToolPanel>
    );
  }

  return (
    <ToolPanel tool="wiki">
      {groups.map((group) => {
        const isCollapsed = collapsed.has(group.key);
        return (
          <div key={group.key}>
            <button
              className="tgrp w-full cursor-pointer text-left"
              onClick={() => toggle(group.key)}
              type="button"
            >
              <span className="tw">{isCollapsed ? "▸" : "▾"}</span>
              <span className="n">{group.title}</span>
              <span className="c">{t("wiki.pagesCount", { n: group.pages.length })}</span>
            </button>
            {isCollapsed
              ? null
              : group.pages.map((page) => {
                  const refCount = refsBySlug.get(page.slug) ?? 0;
                  return (
                    <button
                      className="wpg flex w-full cursor-pointer flex-wrap text-left"
                      key={page.slug}
                      onClick={() => onOpenPage(page.slug)}
                      type="button"
                    >
                      <span className="n flex-1 truncate">{page.title}</span>
                      <span className="st">{page.updated}</span>
                      {refCount > 0 ? (
                        <>
                          <span className="ref">✦</span>
                          <span className="refnote">{t("wiki.refnote", { n: refCount })}</span>
                        </>
                      ) : null}
                    </button>
                  );
                })}
          </div>
        );
      })}
      {groups.length === 0 ? (
        <div className="px-4 py-2 text-[12.5px] text-ink-2">{t("wiki.emptyDesc")}</div>
      ) : null}
      <div className="cap mt-4 px-4">{t("wiki.readOnlyCap")}</div>
    </ToolPanel>
  );
}
