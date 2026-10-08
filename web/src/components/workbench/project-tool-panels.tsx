import type {
  GitCommitLogItem,
  GitDiffFileStatus,
  GitDiffFileSummary,
  GitDiffScope,
  ProjectFileEntry,
  WikiIndexResponse,
} from "@agents-remote/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import {
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
import { FileCrumb } from "../files/file-crumb";
import { FileTreeRows, RowChevron } from "../files/file-tree-rows";
import { MoveSheet } from "../files/move-sheet";
import { NewItemSheet } from "../files/new-item-sheet";
import { RenameDialog } from "../files/rename-dialog";
import { useConfirm } from "../shell/confirm-dialog";
import { ListRowSkeleton } from "../shell/shell-primitives";
import { useT } from "../../i18n";
import { WIKI_QUERY_SCOPE, useWikiIndex } from "../../hooks/wiki";
import { ShellIcon } from "../shell/icons";
import {
  formatAheadBehind,
  gitDiffListQueryKey,
  gitLogQueryKey,
  statusShortLabel,
} from "../git/git-diff-viewer";
import { ActionMenu, useLongPressActions, useRowContextMenu } from "../ui/action-menu";
import { CommitSheet } from "../git/commit-sheet";
import { DiscardDialog } from "../git/discard-dialog";
import { workbenchWikiRefsAtom } from "../../routes/workbench-model";

/** Git 状态角标（badge lg + statusShortLabel；三件套行内 3 处复用，label 单次求值）。 */
function GitStatusBadge({ status }: { status: GitDiffFileStatus }) {
  const label = statusShortLabel(status);
  return <span className={`badge lg ${label}`}>{label}</span>;
}

/**
 * 项目三工具的双端共享面板（多端同构，2026-09-24 第十二轮复验批次 2 泛化：代码同一份，
 * 移动项目工具态 / 移动 focus 态 / 桌面右栏 Inspector 同渲染本三件套，设备适配 = 容器差异，
 * 由 ToolPanel 容器与调用方外壳表达）。形态基准 = v2 M4 移动原生形态（对标
 * 03m/03o/03p，frow/crow/tgrp/wpg 原语行 + header 工具 chip 联动）；与桌面左栏组件
 * （FilesLeftPanel / GitChangesList；wiki-index 与移动 L3WikiReader）同数据管道：diff/files/
 * wiki-index key 一致缓存去重（log/branches 语义不同，见 GitToolPanel 内注释）。
 */

/**
 * 工具面板根容器：滚动 + bottom-nav padding + data-mobile-tool 探针锚点（单源，双端
 * 同一容器——桌面右栏语境 16px 底 padding 无害、锚点无桌面消费者，§6.12l 记档）。
 * w-full = 右栏 row-flex 承载链铺满栏宽（grow 由 RightPanelTabs 根承担）。
 */
function ToolPanel({
  children,
  tool,
}: {
  children: React.ReactNode;
  tool: "files" | "git" | "wiki";
}) {
  return (
    <div
      className="flex h-full min-h-0 w-full flex-col overflow-y-auto pb-[max(16px,var(--shell-mobile-bottom-nav-space,0px))]"
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

export type GitToolPanelProps = {
  projectName: string;
  /** 工作区改动行点击 / 行菜单「查看 diff」（移动 = git file focus → L3 diff；右栏 = 栏内详情态）。 */
  onOpenGitFile: (file: GitDiffFileSummary) => void;
  /** 段装配规则（有承载页才装配，回调式条件渲染）：传了才渲染「最近提交」段 / links 对应
   * 按钮。三端承载一致（2026-09-24 用户复验拍板：右栏 GitToolTab 栈承载，与移动 L3 同构）——
   * 当前所有消费方都传齐；保留可选语义给未来真无承载的语境。 */
  onOpenCommit?: (hash: string) => void;
  onOpenHistory?: () => void;
  onOpenBranches?: () => void;
};

/**
 * Git 工具面板（03m 移动原生形态，双端共享）：githead 分支态势行（04 原型，main ↑N ↓N ·
 * 工作区 N，恒渲染）→ sect「工作区改动」frow 列表（badge + path + ›；右键/长按 = 05e 2 项
 * 菜单「查看 diff / 复制路径」，02c 单一菜单容器）→ sect「最近提交」crow×3（传 onOpenCommit
 * 才装配）→ links「全部历史 · 分支(N)」（传 onOpenHistory/onOpenBranches 才装配）。
 * diff/log query key 走 git-diff-viewer 的 key 工厂单源（gitDiffListQueryKey /
 * gitLogQueryKey，缓存共享去重，单一数据管道）；log 请求不带 branch 参数（后端默认分支），
 * key 的 branch 维度恒 ""，与 L3GitHistory 的显式 branch 维度 key 区分开。
 */
export function GitToolPanel({
  projectName,
  onOpenGitFile,
  onOpenCommit,
  onOpenHistory,
  onOpenBranches,
}: GitToolPanelProps) {
  const { t } = useT();
  // gitDiffListQueryKey 单源 key（workbench-git-left scope）——header gitchip / 移动工具面板 /
  // 桌面左栏 / 右栏（批次 3 装配）多方共享缓存。
  const diff = useQuery({
    queryKey: gitDiffListQueryKey(projectName),
    queryFn: () => listProjectGitDiff(projectName),
  });
  // 03m 最近提交：请求不带 branch（后端默认分支），key 的 branch 维度恒 ""——与
  // L3GitHistory（显式 branch 维度）key 同形但不共享缓存。前端 slice 3 条。
  // 段装配规则同款门控：不传 onOpenCommit（右栏语境）= 最近提交段不装配，请求也不发。
  const log = useQuery({
    enabled: onOpenCommit != null,
    queryKey: gitLogQueryKey(projectName),
    queryFn: () => getProjectGitLog(projectName),
  });
  // links「分支 (N)」计数；与分支页 query 同 key。onOpenBranches 不传不拉（段装配门控）。
  const branches = useQuery({
    enabled: onOpenBranches != null,
    queryKey: ["projects", projectName, "git", "branches"],
    queryFn: () => listProjectGitBranches(projectName),
  });
  const files = diff.data?.repository === true && diff.data.files.length > 0 ? diff.data.files : [];
  const commits = log.data?.commits.slice(0, 3) ?? [];
  const branchCount = branches.data?.branches.length ?? 0;
  const branch = diff.data?.repository === true ? diff.data.branch : undefined;
  // 03m2「提交…」入口开关 + 03m3 弃层目标行。
  const [commitOpen, setCommitOpen] = useState(false);
  const [discardTarget, setDiscardTarget] = useState<GitDiffFileSummary | null>(null);
  // 05e 复制路径反馈（03w 同款：cap 短暂显示「已复制」）。
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  // 05e 改动行菜单（02c 单一菜单容器模式：find(pointFor) 命中才挂，行外挂 → scrim 冒泡
  // 不经行；触屏长按 = 同一菜单入口，useLongPressActions）。
  const ctx = useRowContextMenu();
  const lp = useLongPressActions(ctx.openAt);

  const changeMenuItems = (file: GitDiffFileSummary) => [
    {
      label: t("git.menuViewDiff"),
      icon: <ShellIcon name="git-nav" />,
      onSelect: () => onOpenGitFile(file),
    },
    {
      label: t("files.menuCopyPath"),
      icon: <ShellIcon name="edit" />,
      onSelect: () => {
        void navigator.clipboard.writeText(`${projectName}/${file.path}`);
        setCopiedPath(file.path);
        window.setTimeout(() => setCopiedPath((p) => (p === file.path ? null : p)), 2000);
      },
    },
    {
      // 03m3 放弃更改入口（行菜单红项）。Dialog 由 holder 条件渲染。
      label: t("git.menuDiscard"),
      onSelect: () => setDiscardTarget(file),
      variant: "destructive" as const,
    },
  ];

  return (
    <ToolPanel tool="git">
      {/* 04 githead 分支态势行：分支图标 + main ↑N ↓N（mono 600）+ 右侧 .st「工作区 N」。
          恒渲染（不依赖改动数；非 git 仓库无 branch 字段 → 不渲染）。 */}
      {branch ? (
        <div className="githead">
          <ShellIcon className="h-[13px] w-[13px] shrink-0" name="git-nav" />
          <span className="min-w-0 truncate">
            {branch.name === "HEAD" ? t("git.detached") : branch.name}
            {branch.name !== "HEAD" && branch.upstream !== undefined
              ? ` ${formatAheadBehind(branch.ahead, branch.behind)}`
              : null}
          </span>
          <span className="st">
            {t("git.githeadWorktree", { n: files.filter((f) => f.scope === "worktree").length })}
          </span>
        </div>
      ) : null}
      <div className="sect">{t("git.sectWorktree")}</div>
      <div className="px-0">
        {diff.isPending ? (
          // 首载骨架（§6.12o）：仅 isPending（无缓存数据）显，防「加载中 = 无改动」伪空态；
          // 后台刷新（isFetching）不走此分支，切回不闪。
          <ListRowSkeleton count={3} />
        ) : (
          <>
            {files.map((file) => (
              <button
                className="frow w-full cursor-pointer text-left"
                key={`${file.scope}/${file.path}`}
                onClick={() => {
                  // 长按后松手的合成 click 抑制（03w 文件行同款）。
                  if (lp.guardClick()) return;
                  onOpenGitFile(file);
                }}
                onContextMenu={(e) => ctx.openAt(`${file.scope}/${file.path}`, e)}
                type="button"
                {...lp.bind(`${file.scope}/${file.path}`)}
              >
                <GitStatusBadge status={file.status} />
                <span className="p">{file.path}</span>
                <span className="ar">
                  <RowChevron />
                </span>
              </button>
            ))}
            {files.length === 0 ? (
              <div className="px-4 py-2 text-[12.5px] text-ink-2">{t("git.noChanges")}</div>
            ) : null}
          </>
        )}
        {/* 05e 改动行菜单（02c 单一容器）。 */}
        {(() => {
          const menuFile = files.find((f) => ctx.pointFor(`${f.scope}/${f.path}`));
          return menuFile ? (
            <ActionMenu
              contextMenuPoint={ctx.pointFor(`${menuFile.scope}/${menuFile.path}`)}
              items={changeMenuItems(menuFile)}
              onContextMenuClose={ctx.close}
              trigger={<span className="hidden" />}
            />
          ) : null;
        })()}
      </div>
      {copiedPath ? <div className="cap mt-2 px-4">{t("files.copied")}</div> : null}

      {/* 段装配规则：onOpenCommit/onOpenHistory/onOpenBranches 传了才渲染最近提交/links 两段
          （当前三端都传齐——右栏 GitToolTab 栈承载，与移动同构）。 */}
      {onOpenCommit ? (
        <>
          <div className="sect">{t("git.sectRecent")}</div>
          <div>
            {log.isPending ? (
              // 首载骨架（§6.12o），同工作区段语义。
              <ListRowSkeleton count={2} marker={false} />
            ) : (
              <>
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
              </>
            )}
          </div>
        </>
      ) : null}

      {onOpenHistory || onOpenBranches ? (
        // 04d:98/05i:108 gacts 动作组（真机反馈 2026-09-29：裸 .links 文字链 = 动作区
        // 降级，换回原型三枚等宽 32px 描边钮；.links 形态仅存于 files 底部链）。
        <div className="gacts">
          {onOpenHistory ? (
            <button onClick={onOpenHistory} type="button">
              {t("git.linkHistory")}
            </button>
          ) : null}
          {files.length > 0 ? (
            // 03m2 提交入口（gacts「历史列表|提交…|分支」中列）。改动清零即隐藏——
            // 空变更提交无语义（原型恒显，记 diverge）。
            <button onClick={() => setCommitOpen(true)} type="button">
              {t("git.linkCommit")}
            </button>
          ) : null}
          {onOpenBranches && branches.data != null ? (
            // 分支计数待数据（data 到手，isPending 与 error 都不渲染）不渲染按钮——
            // 「分支 (0)」伪态消解（§6.12o；error 半边由 review 修复补上）。
            <button onClick={onOpenBranches} type="button">
              {t("git.linkBranches", { n: branchCount })}
            </button>
          ) : null}
        </div>
      ) : null}

      {/* 03m2/03m3 写操作层（单源收 GitToolPanel 内部：装配点零改动；mutation 失败保持
          开层，成功失效缓存后关）。 */}
      <CommitSheet
        branch={branch?.name ?? "HEAD"}
        files={files}
        onOpenChange={setCommitOpen}
        open={commitOpen}
        projectName={projectName}
      />
      {discardTarget ? (
        <DiscardDialog
          branch={branch?.name ?? "HEAD"}
          file={discardTarget}
          onOpenChange={(open) => {
            if (!open) setDiscardTarget(null);
          }}
          open
          projectName={projectName}
        />
      ) : null}
    </ToolPanel>
  );
}

// ── 03o 文件工具 + 03w 长按菜单（M4）────────────────────────────────────────

export type FilesToolPanelProps = {
  projectName: string;
  /** cwd（可选受控：传 currentPath+onPathChange = 调用方持记忆跨卸载保活，§13 回退语义由
   * 调用方守；未传退内部 state——右栏语境无跨卸载保活诉求）。 */
  currentPath?: string;
  /** 03x header 搜索框的查询（提升共享：chip 与面板结果列表同 query state；右栏语境不传
   * = 无搜索态，装配规则「无承载 chip 不装配搜索」）。 */
  searchQuery?: string;
  onPathChange?: (path: string) => void;
  onOpenFile: (projectName: string, path: string) => void;
  /** 03w/05e「在 Git 中查看 diff」（移动 = git file focus；右栏 = 栏内 diff 详情态）。 */
  onOpenGitFile: (file: { path: string; scope: GitDiffScope }) => void;
};

/**
 * 文件工具面板（03o 移动原生形态，双端共享）：目录行（.p.dir + ›）+ 文件行（.ic + mono path +
 * mtime + git badge + ›）。git worktree 改动态 join（同 key diff query 与 GitChangesList
 * 去重）——有改动的文件行尾显 badge（03o 编号③）。文件行长按/右键 = 03w ∪ 05e 菜单并集
 * （打开预览/复制路径/在 Git 查看 diff〔条件 dirty〕/重命名/移动/上传/删除）；目录行 = 进入 +
 * 新建到此/上传到此。写操作 mutation 后失效 files + git diff 缓存。
 */
export function FilesToolPanel({
  projectName,
  currentPath: currentPathProp,
  searchQuery = "",
  onPathChange,
  onOpenFile,
  onOpenGitFile,
}: FilesToolPanelProps) {
  const { t } = useT();
  const queryClient = useQueryClient();
  // cwd：受控可选（受控 = 调用方持持久化记忆；未受控退内部 state，右栏语境）。
  const [internalPath, setInternalPath] = useState("");
  const path = currentPathProp ?? internalPath;
  const changePath = onPathChange ?? setInternalPath;
  // 与 FilesPanel 同 key（queryScope "files"）——工具面板与浮层文件树共享缓存。
  const listing = useQuery({
    queryKey: ["projects", projectName, "files", path],
    queryFn: () => listProjectFiles(projectName, path || undefined),
  });
  // 路径不存在回退（§13，与 FilesPanel 受控模式同语义）：持久化 cwd 记忆指向已删除目录时
  // listing 报错 → 回根 + changePath("") 清记忆（queryKey 变化时新查询 pending、error 归零
  // 不误触发；effect 只依赖 error）。
  useEffect(() => {
    if (listing.error !== null && path !== "") {
      changePath("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listing.error]);
  const diff = useQuery({
    queryKey: gitDiffListQueryKey(projectName),
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
  // 03x 搜索态（query 提升在 mobile-workbench header chip，非空 → 面板渲染结果列表）。
  // keepPreviousData（§6.12o review 修复）：逐键换 query key 时保持上一份结果不闪。
  const trimmedQuery = searchQuery.trim();
  const search = useQuery({
    queryKey: ["projects", projectName, "files", "search", trimmedQuery],
    queryFn: () => searchProjectFiles(projectName, trimmedQuery),
    enabled: trimmedQuery.length > 0,
    placeholderData: keepPreviousData,
  });
  // 03z 上传/03y 新建入口：hidden input + 目标目录 ref（菜单 onSelect → click 时序安全）。
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetDirRef = useRef("");
  const openUploadPicker = (targetDir: string) => {
    uploadTargetDirRef.current = targetDir;
    uploadInputRef.current?.click();
  };
  // 03y 新建 sheet 状态（open = parentPath 非空持有；null = 关）+ 03w2/03w3 状态（open =
  // target entry 持有，null = 关）。03y/03w2/03w3 组件单源在 files/，本层只持 state 并接线。
  const [newItemParentPath, setNewItemParentPath] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<ProjectFileEntry | null>(null);
  const [moveTarget, setMoveTarget] = useState<ProjectFileEntry | null>(null);
  const { confirm, holder: confirmHolder } = useConfirm();
  // 长按/右键菜单状态收敛 FileTreeRows 内部（批 11 真同构；本层只经 menuItemsFor 注入编排）。

  // 写操作公共失败/成功：失效 files 列表 + git diff（rename/move/delete 都可能改两者）。
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["projects", projectName, "files"] });
    void queryClient.invalidateQueries({
      queryKey: gitDiffListQueryKey(projectName),
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
      onSelect: () => setRenameTarget(entry),
    },
    {
      label: t("files.menuMove"),
      icon: <ShellIcon name="project" />, // folder 形状（目录行同款）；name="folder" 未注册渲染空白（M10 用户反馈）
      onSelect: () => setMoveTarget(entry),
    },
    {
      // 05e 菜单并集补「上传文件…」（桌面 FilesPanel 05e 5 项同款 key,上传到当前目录）。
      label: t("files.menuUpload"),
      icon: <ShellIcon name="upload" />,
      onSelect: () => openUploadPicker(path),
    },
    {
      label: t("files.delete"),
      icon: <ShellIcon name="trash" />,
      variant: "destructive" as const,
      onSelect: () => {
        // 03w4：文件夹正文换「及其中全部内容」措辞（子树计数不可得，用可达措辞）；
        // 文件带 dirty 徽标时追加警示（03w4 ②——橙色警示条形制不做，文案警示保留，记 diverge）。
        const isDir = entry.type === "directory";
        const baseMessage = isDir
          ? t("files.deleteConfirmFolder", { name: entry.name })
          : t("files.deleteConfirm", { name: entry.name });
        const warn = !isDir && dirty.has(entry.path) ? `\n\n${t("files.deleteDirtyWarn")}` : "";
        void confirm({
          title: t("files.delete"),
          message: `${baseMessage}${warn}`,
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
      onSelect: () => setNewItemParentPath(entry.path),
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
            {dirty.has(m.path) ? <GitStatusBadge status={dirty.get(m.path)!.status} /> : null}
          </button>
        ))}
        {search.isPending ? (
          // 搜索首载骨架（§6.12o review 收敛）：与 wiki 搜索同款 ListRowSkeleton，替换原
          // 纯文案「正在加载文件...」；keepPreviousData 下逐键切 key 不再进入此分支。
          <ListRowSkeleton count={3} />
        ) : matches.length === 0 ? (
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
          onClick={() => changePath(parentPath)}
          type="button"
        >
          <span className="p dir">..</span>
        </button>
      ) : null}
      {/* 首载骨架（§6.12o 批次 2）：仅 isPending（无缓存数据）显，与 FilesPanel :372 同款
        count=5 默认参数；目录内容到后空目录仍走真空态（无行）。 */}
      {listing.isPending ? (
        <ListRowSkeleton count={5} />
      ) : (
        /* 批 11 真同构：行 DOM/守卫链/长按右键菜单收敛 FileTreeRows 单源（与 FilesPanel 同一份
           代码）。items 构造（menuItems/dirMenuItems 按类型分支）/dirty 徽标/diff 编排留容器，
           经 menuItemsFor/renderTrailing 注入；mtime 渲染统一 FileTreeRows 内部实现
          （mtimeRelative wrapper 退役）。 */
        <FileTreeRows
          entries={entries}
          menuItemsFor={(entry) =>
            entry.type === "directory" ? dirMenuItems(entry) : menuItems(entry)
          }
          onOpenDirectory={changePath}
          onPreviewFile={(p) => onOpenFile(projectName, p)}
          renderTrailing={(entry) => {
            const dirtyFile = dirty.get(entry.path);
            return dirtyFile ? <GitStatusBadge status={dirtyFile.status} /> : null;
          }}
        />
      )}
      {/* 03z 上传队列卡（.upcard，与桌面 FilesPanel 双端单源）。 */}
      <UploadQueueCard />
      {/* 03o pin④ 底部 .links「新建…/上传文件」文字链退役（批 13 追加真机反馈：新建/上传
          已统一 FAB AddMenu——移动 renderPanelFab，桌面右栏该行本就 lg 隐藏）。hidden input
          保留：行菜单「上传文件…/上传到此」仍走 openUploadPicker → click。 */}
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
      {copiedPath ? (
        <div className="cap mt-2 px-4">{t("files.copied")}</div>
      ) : (
        <>
          {/* 页脚提示分档（同一 DOM 两文案显隐，grplabel hidden lg:block 反向先例）：
              移动 = 03o 面包屑操作提示；桌面 = 05e:64 拖拽上传提示（长按语义在桌面
              不成立）。10e absolute 贴底不取——遮内容，文档流尾行记 diverge。 */}
          <div className="cap mt-4 px-4 lg:hidden">{t("files.capBreadcrumb")}</div>
          <div className="cap mt-4 hidden px-4 lg:block">{t("files.capDesktop")}</div>
        </>
      )}
      {/* 03y/03w2/03w3 受控 sheet/dialog（open = state 非空持有）+ 删除 confirm holder。
        NewItemSheet 的重名即时校验对比同层名单（当前 cwd 层新建时才可得；子目录新建时
        siblingNames 传空名单跳过即时校验，由服务端 409 兜底行内显示）。 */}
      {newItemParentPath !== null ? (
        <NewItemSheet
          onOpenChange={(next) => {
            if (!next) setNewItemParentPath(null);
          }}
          open
          parentPath={newItemParentPath}
          projectName={projectName}
          siblingNames={newItemParentPath === path ? entries.map((e) => e.name) : []}
        />
      ) : null}
      {renameTarget !== null ? (
        <RenameDialog
          initialName={renameTarget.name}
          onSubmit={(newName) => {
            if (renameTarget) renameMutation.mutate({ entry: renameTarget, newName });
          }}
          siblings={entries.filter((e) => e.name !== renameTarget.name).map((e) => e.name)}
          open
          onOpenChange={(next) => {
            if (!next) setRenameTarget(null);
          }}
        />
      ) : null}
      {moveTarget !== null ? (
        <MoveSheet
          entryName={moveTarget.name}
          excludePath={moveTarget.path}
          onSubmit={(targetDir) => {
            renameMutation.mutate({
              entry: moveTarget,
              newName: moveTarget.name,
              targetDir: targetDir.length > 0 ? targetDir : undefined,
            });
          }}
          open
          projectName={projectName}
          onOpenChange={(next) => {
            if (!next) setMoveTarget(null);
          }}
        />
      ) : null}
      {confirmHolder}
    </ToolPanel>
  );
}

// ── 03p Wiki 工具（M4）───────────────────────────────────────────────────────

type WikiGroup = { key: string; title: string; pages: WikiIndexResponse["pages"] };

/** 03p 分组树派生（纯函数）：首页面首个 tag 分组、无 tag 归「未分组」（客户端派生，
 * 服务端 index 无分组概念）。 */
function groupWikiPages(pages: WikiIndexResponse["pages"], ungroupedTitle: string): WikiGroup[] {
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

export type WikiToolPanelProps = {
  projectName: string;
  /** header wsearch 展开的查询输入（可选受控：传 query+onQueryChange = 调用方持 header
   * chip 联动 state；未传 = 无搜索态——右栏语境无承载 chip 不装配搜索，装配规则）。 */
  query?: string;
  onQueryChange?: (query: string) => void;
  /** 行点击 / 05e 行菜单「打开页面」（移动 = L3 阅读页；右栏 = 栏内阅读态）。 */
  onOpenPage: (slug: string) => void;
};

/**
 * Wiki 工具面板（03p 移动原生形态，双端共享）：搜索态（query 非空 → searchWiki 匹配页列表）→
 * 分组树（tgrp 组头折叠 + wpg 页行）。wpg 行首 .ref 紫圆标记 = 该页已被注入过 agent 会话
 * （workbenchWikiRefsAtom 反查），refnote 行 = 注入会话数（03p 编号②「已注入」态）。wpg 行
 * 右键/长按 = 05e 2 项菜单「打开页面 / 复制链接」（第十一轮右栏 WikiPanel 同款迁移，02c 单一
 * 菜单容器）。同 key wiki-index 与移动 L3 wiki 阅读页去重。
 */
export function WikiToolPanel({
  projectName,
  query = "",
  onQueryChange,
  onOpenPage,
}: WikiToolPanelProps) {
  const { t } = useT();
  const refsWithSession = useAtomValue(workbenchWikiRefsAtom);
  const index = useWikiIndex(projectName, WIKI_QUERY_SCOPE);
  // 搜索态 query（enabled: 非空防抖省略——wiki 库小，直查）。keepPreviousData（§6.12o review
  // 修复）：逐键换 query key 时保持上一份结果，不闪骨架。
  const trimmed = query.trim();
  const search = useQuery({
    queryKey: ["projects", projectName, WIKI_QUERY_SCOPE, "wiki-search", trimmed],
    queryFn: () => searchWiki(projectName, trimmed),
    enabled: trimmed.length > 0,
    placeholderData: keepPreviousData,
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
  // 05e 行菜单（02c 单一菜单容器：find(pointFor) 命中才挂；触屏长按 = 同一菜单入口）。
  const ctx = useRowContextMenu();
  const lp = useLongPressActions(ctx.openAt);
  const wikiMenuItems = (slug: string, clearQuery = false) => [
    {
      label: t("wiki.menuOpen"),
      icon: <ShellIcon name="pages-nav" />,
      onSelect: () => {
        if (clearQuery) onQueryChange?.("");
        onOpenPage(slug);
      },
    },
    {
      label: t("wiki.copyLink"),
      icon: <ShellIcon name="edit" />,
      onSelect: () => {
        void navigator.clipboard.writeText(
          `${window.location.origin}/projects/${encodeURIComponent(projectName)}/wiki/${encodeURIComponent(slug)}`,
        );
      },
    },
  ];
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
        {search.isPending ? (
          // 首载骨架（§6.12o）：防搜索请求在途显「无匹配」伪空态。
          <ListRowSkeleton count={2} />
        ) : (
          <>
            {matches.map((m) => (
              <button
                className="wpg flex w-full flex-wrap cursor-pointer text-left"
                key={m.slug}
                onClick={() => {
                  if (lp.guardClick()) return;
                  onQueryChange?.("");
                  onOpenPage(m.slug);
                }}
                onContextMenu={(e) => ctx.openAt(m.slug, e)}
                type="button"
                {...lp.bind(m.slug)}
              >
                <span className="n flex-1 truncate">{m.title}</span>
                <span className="st">{m.updated}</span>
                <span className="refnote w-full truncate">{m.lines[0] ?? ""}</span>
              </button>
            ))}
            {matches.length === 0 ? (
              <div className="px-4 py-2 text-[12.5px] text-ink-2">{t("wiki.searchNoMatch")}</div>
            ) : null}
          </>
        )}
        {(() => {
          const menuMatch = matches.find((m) => ctx.pointFor(m.slug));
          return menuMatch ? (
            <ActionMenu
              contextMenuPoint={ctx.pointFor(menuMatch.slug)}
              items={wikiMenuItems(menuMatch.slug, true)}
              onContextMenuClose={ctx.close}
              trigger={<span className="hidden" />}
            />
          ) : null;
        })()}
      </ToolPanel>
    );
  }

  return (
    <ToolPanel tool="wiki">
      {index.isPending ? (
        // 首载骨架（§6.12o）：防「加载中 = 暂无页面」伪空态；后台刷新（isFetching）不进来。
        <ListRowSkeleton count={3} />
      ) : (
        <>
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
                          onClick={() => {
                            if (lp.guardClick()) return;
                            onOpenPage(page.slug);
                          }}
                          onContextMenu={(e) => ctx.openAt(page.slug, e)}
                          type="button"
                          {...lp.bind(page.slug)}
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
        </>
      )}
      {(() => {
        const menuPage = groups.flatMap((group) => group.pages).find((p) => ctx.pointFor(p.slug));
        return menuPage ? (
          <ActionMenu
            contextMenuPoint={ctx.pointFor(menuPage.slug)}
            items={wikiMenuItems(menuPage.slug)}
            onContextMenuClose={ctx.close}
            trigger={<span className="hidden" />}
          />
        ) : null;
      })()}
      <div className="cap mt-4 px-4">{t("wiki.readOnlyCap")}</div>
    </ToolPanel>
  );
}

/**
 * 检视面板工具 chip 装配单源（03m gitchip / 03o crumb+.obtn.srch / 03p wsearch）：移动
 * InspectionPanel 与桌面 RightPanelTabs 消费同一份（多端同构：行为收敛共享组件、两端只
 * 容器不同——真机反馈 2026-09-29 桌面右栏 Files/Wiki 标签零工具行，批3 遗留补齐）。
 * git chip 计数与 GitToolPanel 同 key（缓存共享零额外网络）；files/wiki 搜索 query
 * 提升返回给调用方透传工具面板（chip 与列表同 query state，03x 语义）。
 */
export function usePanelToolChip({
  currentPath,
  kind,
  onPathChange,
  projectKey,
}: {
  /** files crumb 目录链（受控 cwd：桌面 = workbenchDesktopFilesPathAtom 经 right-panel-tabs
   *  受控传入（批 11）/ 移动 = filesPath）。 */
  currentPath?: string;
  /** 激活标签种类（file 预览标签无 chip）。 */
  kind: "git" | "files" | "wiki" | "file";
  onPathChange?: (path: string) => void;
  projectKey: string;
}): {
  /** files 搜索 query（调用方透传 FilesToolPanel searchQuery）。 */
  filesSearchQuery: string;
  /** wiki 搜索 query（调用方透传 WikiToolPanel query）。 */
  setFilesSearchOpen: (open: boolean) => void;
  setFilesSearchQuery: (query: string) => void;
  setWikiSearchOpen: (open: boolean) => void;
  setWikiSearchQuery: (query: string) => void;
  toolChip: ReactNode;
  wikiSearchQuery: string;
} {
  const { t } = useT();
  // 03x 文件搜索：chip 两态（crumb ↔ .wsearch 输入），query 提升共享给 FilesToolPanel。
  const [filesSearchOpen, setFilesSearchOpen] = useState(false);
  const [filesSearchQuery, setFilesSearchQuery] = useState("");
  // 03p wiki 搜索：chip 点击展开输入，query 提升共享给 WikiToolPanel。
  const [wikiSearchOpen, setWikiSearchOpen] = useState(false);
  const [wikiSearchQuery, setWikiSearchQuery] = useState("");
  // git chip 数据（与 GitToolPanel 同 key 缓存共享——开着 git 标签零额外网络）。enabled
  // gate 空 projectKey：global scope 右栏空态（2026-10-01）也装配本 hook，空串会打出脏请求。
  const gitDiffForChip = useQuery({
    enabled: projectKey !== "",
    queryKey: gitDiffListQueryKey(projectKey),
    queryFn: () => listProjectGitDiff(projectKey),
  });
  const crumbSegments = currentPath ? currentPath.split("/") : [];
  // gitchip 计数（worktree/staged 分 scope 计数；非 repository 恒 0）。
  const { worktree, staged } = useMemo(() => {
    const files = gitDiffForChip.data?.repository === true ? gitDiffForChip.data.files : [];
    const count = (s: string) => files.filter((f) => f.scope === s).length;
    return { worktree: count("worktree"), staged: count("staged") };
  }, [gitDiffForChip.data]);
  // 03m gitchip b = 分支名 + ahead/behind（spec §4.4 `main ↑1 ↓0`）；detached 降级工具名。
  const chipBranch =
    gitDiffForChip.data?.repository === true ? gitDiffForChip.data.branch : undefined;
  const toolChip =
    kind === "git" ? (
      <div className="gitchip">
        <b>
          {chipBranch ? chipBranch.name : t("git.toolTitle")}
          {chipBranch?.ahead || chipBranch?.behind
            ? ` ${formatAheadBehind(chipBranch.ahead, chipBranch.behind)}`
            : ""}
        </b>
        <span>{t("git.chipCounts", { worktree, staged })}</span>
      </div>
    ) : kind === "files" ? (
      filesSearchOpen ? (
        // 03x ①「行2 内容头变搜索框（同 Wiki）」：单源复用 .wsearch（§6.9），聚焦态描边
        // 由 .wsearch:focus-within 承载。
        <div className="wsearch">
          <input
            autoFocus
            className="h-6 flex-1 bg-transparent text-[13px] text-ink-1 outline-none placeholder:text-ink-3"
            onChange={(e) => setFilesSearchQuery(e.target.value)}
            placeholder={t("files.searchPlaceholder")}
            value={filesSearchQuery}
          />
          <button
            className="flex cursor-pointer items-center text-ink-2"
            onClick={() => {
              setFilesSearchOpen(false);
              setFilesSearchQuery("");
            }}
            type="button"
            aria-label={t("cancel")}
          >
            <ShellIcon className="h-[13px] w-[13px]" name="close" />
          </button>
        </div>
      ) : (
        <>
          {/* 03o 地址栏（.crumb flex:1 撑满行）：批 11 真同构收敛 FileCrumb 单源（与
              FilesPanel 头部同一份 DOM；根段图标语义 = 反馈⑧项目图标 + .cseg 抑制「/」
              前导，均已在 FileCrumb 内部）。搜索钮 = 独立 .obtn.srch chip 在胶囊右侧
             （03o 渐进披露）。 */}
          <FileCrumb
            onNavigate={(p) => onPathChange?.(p)}
            rootLabel={projectKey}
            segments={crumbSegments}
          />
          <button
            className="obtn srch cursor-pointer"
            onClick={() => setFilesSearchOpen(true)}
            type="button"
            aria-label={t("files.searchPlaceholder")}
          >
            <ShellIcon className="size-4" name="magnifyingglass" />
          </button>
        </>
      )
    ) : kind === "wiki" ? (
      <div className="wsearch">
        {wikiSearchOpen ? (
          <input
            autoFocus
            className="h-6 flex-1 bg-transparent text-[13px] text-ink-1 outline-none placeholder:text-ink-3"
            onChange={(e) => setWikiSearchQuery(e.target.value)}
            placeholder={t("wiki.searchPlaceholder")}
            value={wikiSearchQuery}
          />
        ) : (
          <button
            className="flex items-center gap-1.5 cursor-pointer"
            onClick={() => setWikiSearchOpen(true)}
            type="button"
          >
            <ShellIcon className="h-[13px] w-[13px] text-ink-2" name="magnifyingglass" />
            <span>{t("wiki.searchPlaceholder")}</span>
          </button>
        )}
      </div>
    ) : undefined;
  return {
    filesSearchQuery,
    setFilesSearchOpen,
    setFilesSearchQuery,
    setWikiSearchOpen,
    setWikiSearchQuery,
    toolChip,
    wikiSearchQuery,
  };
}
