import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAtom } from "jotai";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useT } from "../../i18n";
import { ShellIcon } from "../shell/icons";
import type { AgentHistoryRange } from "@agents-remote/shared";
import { createFolder, uploadFile } from "../../api/client";
import { usePromptDialog } from "../shell/prompt-dialog";
import { ActionMenu, type ActionMenuItem } from "../ui/action-menu";
import { PagesPanel } from "../pages/pages-panel";
import { PluginsPanel } from "../../routes/PluginsRoute";
import { FilesLeftPanel } from "../files/files-left-panel";
import { GitChangesList } from "../git/git-diff-viewer";
import {
  type WorkbenchMobileOverviewTab,
  workbenchMobileOverviewTabAtom,
  workbenchMobileProjectFilesPathAtom,
} from "../../routes/workbench-model";
import {
  CardGridSkeleton,
  type CreateSessionApi,
  type GridItemCallbacks,
  InstanceGrid,
  instanceToGridItem,
  useProjectInstances,
} from "./instance-area";
import { HistoryList, HistoryRangeControl } from "./history-list";
import { TabButton } from "./right-panel-tabs";
import {
  buildOverviewTabs,
  WORKBENCH_TAB_PLUGINS,
  type WorkbenchTabPluginContext,
} from "./workbench-tab-plugin";
import { ProjectSwitcher } from "./project-switcher";

/** Material navigation-drawer：小屏 ≥88% 视口宽、上限 340px（DESIGN.md navigation-drawer）。
 * Reddit 式 push 刚体联动（2026-08-17 三次修正）：本组件是平移行里与页面并排的 flex 成员
 *（父给 shrink-0 basis，宽度恒定），开合动画由父级单 wrapper translate-x 统一管。右缘
 * 16px 圆角保留。高度与旧覆盖式 inset-y-0 等价全高（safe-area 顶带在壳上避让，bg 延伸
 * 进刘海带）。 */
const DRAWER_WIDTH_CLASSES = "w-[min(88vw,340px)]";

type MobileProjectDrawerProps = {
  scope: { kind: "project"; key: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 点会话行聚焦（navigateWorkbench + 关 drawer）。 */
  onFocusInstance: (sessionId: string) => void;
  /** 文件段点文件 → 开 file tab + focus（WorkbenchContent onOpenFile，关 drawer）。 */
  onOpenFile: (projectName: string, path: string) => void;
  /** git 段点变更文件 → 开 git diff tab + focus（WorkbenchContent onOpenGitFile，关 drawer）。 */
  onOpenGitFile: (projectName: string, scope: "worktree" | "staged", path: string) => void;
  /** 分支 compare 点文件 → 开 git compare tab + focus（WorkbenchContent onOpenGitCompareFile，关 drawer）。 */
  onOpenGitCompareFile: (projectName: string, base: string, compare: string, path: string) => void;
  /** 关实例（父级 closeInstance：close API + confirm + onAfterClose 删 layout tab）。 */
  onCloseInstance: (sessionId: string, type: "agent" | "terminal") => void;
  /** 重命名（父级 renameInstance，已绑定 projectName）。 */
  onRenameInstance: (sessionId: string, type: "agent" | "terminal", currentName: string) => void;
  /** 新建会话 API（父级 useCreateSession 同源，总览段顶部新建入口）。 */
  create: CreateSessionApi;
};

/**
 * 移动项目侧边栏 drawer（设计 workbench-views §7.7 / DESIGN.md navigation-drawer，
 * 2026-08-16 重设计）：桌面左栏的窄屏投影。**2026-08-17 覆盖式 → Reddit 式 push 刚体联动**
 *（三次反馈修正收敛：① 整页含 header tab 带被推；② 页面保持视口宽不压缩仅平移；③ drawer
 * 自身要有滑入动画、关闭时不得两页叠加）——本组件不再是 Radix Dialog portal overlay，而是
 * `MobileProjectWorkbench` 平移行里与页面**并排**的 flex 成员（永不重叠）：drawer 在行首
 * `shrink-0 basis-[min(88vw,340px)]`、页面 `w-full shrink-0`（页面 layout 宽 = 视口宽，行总宽 =
 * 340+390）。开合 = 单一 wrapper 整体 `translate-x`（开 0 / 关 -340），drawer 从窗口左缘
 * 滑入 + 页面同步被推右（同速同向刚体），关闭一起回、无叠加。无 scrim；点页面（父级透明
 * 拦截层）关闭；Esc 本组件手动监听（原 Radix dismissable 职责）。drawer 全高含 safe-area
 * 顶带（2026-08-17 高度修正：壳 pt 避让、页面侧 main→页面成员自行消费，两页顶行对齐）。
 *
 * 结构：顶部返回入口 A（离开项目回 `/` 项目列表）+ 项目名；7 段文字导航（总览/历史/文件/
 * Git/页面/Wiki/插件，`buildOverviewTabs` 复用——与桌面左栏 middle tab 同源）；段主体随
 * `workbenchMobileOverviewTabAtom` 切换（同现 MobileProjectOverview 语义，tab 记忆不进 URL）。
 * 点会话行 / 文件 / skill 自动关 drawer（内容由 tab 带接管）。
 */
export function MobileProjectDrawer({
  scope,
  open,
  onOpenChange,
  onFocusInstance,
  onOpenFile,
  onOpenGitFile,
  onOpenGitCompareFile,
  onCloseInstance,
  onRenameInstance,
  create,
}: MobileProjectDrawerProps) {
  const { t } = useT();
  const navigate = useNavigate();
  const [tab, setTab] = useAtom(workbenchMobileOverviewTabAtom);
  // history 段时间范围（受控，避免段切换丢失；range 进 queryKey → 切档重拉）。
  const [range, setRange] = useState<AgentHistoryRange>("week");
  // files 段当前目录（localStorage 记忆，按项目 key 分组）：与聚焦态 inspection 共享同一 atom，
  // drawer 与聚焦态切换目录互相同步（单一 cwd state）。
  const [projectFilesPaths, setProjectFilesPaths] = useAtom(workbenchMobileProjectFilesPathAtom);
  const filesPath = projectFilesPaths[scope.key] ?? "";
  const setFilesPath = (path: string) =>
    setProjectFilesPaths((prev) => ({ ...prev, [scope.key]: path }));

  // 文件段新建文件夹/上传（drawer 顶部按钮消费；queryScope 对齐 FilesLeftPanel 默认 "files"）。
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { prompt, holder: promptHolder } = usePromptDialog();
  const mkdir = useMutation({
    mutationFn: (name: string) => createFolder(scope.key, filesPath, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", scope.key, "files", filesPath] });
    },
  });
  const upload = useMutation({
    mutationFn: (file: File) => uploadFile(scope.key, filesPath, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", scope.key, "files", filesPath] });
    },
  });
  const handleNewFolder = useCallback(async () => {
    const name = await prompt({
      cancelLabel: t("cancel"),
      confirmLabel: t("files.newFolder"),
      placeholder: t("files.newFolder"),
      title: t("files.newFolderTooltip"),
    });
    const trimmed = name?.trim();
    if (trimmed && !mkdir.isPending) mkdir.mutate(trimmed);
  }, [prompt, mkdir, t]);
  // 页面段「新建页面根」外部触发信号（递增计数，PagesPanel useEffect 消费）。
  const [pagesCreateRequest, setPagesCreateRequest] = useState(0);

  const ctx: WorkbenchTabPluginContext = {
    projectKey: scope.key,
    focusId: undefined,
    sessionType: undefined,
    currentPath: filesPath,
    onPathChange: setFilesPath,
  };
  // 段顺序：总览 / 历史 / inspection 插件（files/git/pages/wiki 按 ctx 过滤）/ 插件——与桌面
  // 左栏 middle tab 同源（buildOverviewTabs 单一来源）。
  const sections = useMemo(
    () => buildOverviewTabs(t, ctx, true),
    // ctx 由 scope 决定。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scope, t],
  );
  const activeSection: WorkbenchMobileOverviewTab = sections.some((opt) => opt.id === tab)
    ? tab
    : "overview";
  const activePlugin =
    activeSection !== "overview" && activeSection !== "history" && activeSection !== "plugins"
      ? (WORKBENCH_TAB_PLUGINS.find((p) => p.id === activeSection) ?? null)
      : null;

  // 总览段实例数据 + 回调（单一数据管道 useProjectInstances）。close/rename/create 复用父级
  //（WorkbenchContent 同源 hooks：confirm/prompt holder 由父级 MobileProjectWorkbench 顶层常驻
  // 渲染，本组件不重复实例化——2026-08-17 review：此前 drawer 自带三套 hooks + holders 段条件
  // 渲染，属「holder 更新但未渲染」bug 类隐患，且关实例不删 layout tab）。
  const { instances, isLoading } = useProjectInstances(scope.key);
  const gridCallbacks: GridItemCallbacks = {
    onClose: onCloseInstance,
    onRename: onRenameInstance,
    onSelect: (sessionId) => {
      onOpenChange(false);
      onFocusInstance(sessionId);
    },
    t,
  };
  const gridItems = useMemo(
    () => instances.map((entry) => instanceToGridItem(entry, gridCallbacks, scope.key)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [instances, scope.key, t],
  );

  // 顶部行右上角「+」按段新建（2026-08-17 用户修正：更顶部的 header 右上角 = drawer 顶部行；
  // 聚焦态 tab 内容是查看语义，不提供新建）。总览=新建会话、文件=新建文件夹/上传、
  // 页面=新建页面根；其他段（历史/Git/Wiki/插件）无新建动作不渲染。
  const createItems: ActionMenuItem[] | null =
    activeSection === "overview"
      ? [
          {
            label: t("workbench.createClaude2"),
            icon: <ShellIcon name="anthropic" />,
            onSelect: () => create.createAgent("claude2"),
          },
          {
            label: t("workbench.createTerminal"),
            icon: <ShellIcon name="terminal" />,
            onSelect: create.createTerminal,
          },
        ]
      : activeSection === "files"
        ? [
            {
              label: t("files.newFolder"),
              icon: <ShellIcon name="folder-plus" />,
              onSelect: handleNewFolder,
            },
            {
              label: upload.isPending ? t("files.uploading") : t("files.upload"),
              icon: <ShellIcon name="upload" />,
              onSelect: () => fileInputRef.current?.click(),
              disabled: upload.isPending,
            },
          ]
        : activeSection === "pages"
          ? [
              {
                label: t("pages.addRoot"),
                icon: <ShellIcon name="plus" />,
                onSelect: () => setPagesCreateRequest((n) => n + 1),
              },
            ]
          : null;
  const createAria =
    activeSection === "files"
      ? t("files.createAria")
      : activeSection === "pages"
        ? t("pages.createAria")
        : t("workbench.createSessionAria");

  // Esc 关闭（原 Radix dismissable 职责，迁出 Dialog 后手动补）：open 时监听 window keydown。
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  return (
    <aside
      aria-label={t("workbench.sidebar")}
      className={`grid h-full ${DRAWER_WIDTH_CLASSES} overflow-hidden rounded-r-2xl bg-surface pt-[var(--shell-safe-area-top)] text-on-surface`}
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        {/* 顶部：返回入口 A（离开项目回 / 项目列表）+ 项目名。safe-area 顶带避让在 aside 壳
            单点消费（bg/圆角延伸进刘海带，内容避让——2026-08-17 恢复旧覆盖式全高语义）。
            本行 h-11 与页面 MobileTabStrip header 同构 → 两页分隔线水平对齐。 */}
        <div className="flex h-11 shrink-0 items-center gap-1 border-b border-on-surface/5 px-2">
          <button
            aria-label={t("project.backToProjects")}
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-on-surface-soft transition hover:bg-on-surface/5 hover:text-on-surface active:bg-on-surface/10"
            onClick={() => {
              onOpenChange(false);
              void navigate({ to: "/" });
            }}
            type="button"
          >
            <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
              <path
                d="M15 18l-6-6 6-6"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                stroke="currentColor"
              />
            </svg>
          </button>
          <ProjectSwitcher
            currentProjectName={scope.key}
            titleClassName="text-sm font-semibold text-on-surface"
          />
          {/* 按段新建入口（右上角，与 ☰ 对称位）：总览=新建会话 / 文件=新建文件夹·上传 /
                页面=新建页面根；其他段不渲染。 */}
          {createItems ? (
            <ActionMenu
              align="end"
              cancelLabel={t("cancel")}
              items={createItems}
              trigger={
                <button
                  aria-label={createAria}
                  className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-on-surface-soft transition hover:bg-on-surface/5 hover:text-on-surface active:bg-on-surface/10"
                  type="button"
                >
                  <ShellIcon className="h-5 w-5" name="plus" />
                </button>
              }
            />
          ) : null}
        </div>
        {/* 7 段横向 tab 行（对齐桌面左栏 middle tab bar：TabButton + overflow-x-auto 可横滚，
              nav-item token active bg-primary/10 text-primary）。 */}
        <nav
          aria-label={t("workbench.sidebar")}
          className="flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-b border-on-surface/5 px-1.5"
        >
          {sections.map((opt) => (
            <TabButton
              active={opt.id === activeSection}
              key={opt.id}
              label={opt.label}
              onClick={() => setTab(opt.id)}
            />
          ))}
        </nav>
        {/* 段主体：总览=会话列表+新建入口 / 历史=HistoryList / 文件=项目内文件树（FilesLeftPanel
              范式，点文件开 content tab + 关 drawer）/ Git=GitChangesList（点变更文件开 git tab +
              关 drawer）/ 页面·Wiki=plugin render / 插件=PluginsPanel。safe-area 底部单点避让。 */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden pb-[env(safe-area-inset-bottom)]">
          {activeSection === "files" ? (
            <FilesLeftPanel
              currentPath={filesPath}
              onOpenFile={(projectName, path) => {
                onOpenChange(false);
                onOpenFile(projectName, path);
              }}
              onPathChange={setFilesPath}
              projectName={scope.key}
            />
          ) : activeSection === "git" ? (
            <GitChangesList
              onOpenGitCompareFile={(projectName, base, compare, path) => {
                onOpenChange(false);
                onOpenGitCompareFile(projectName, base, compare, path);
              }}
              onSelectGitFile={(file) => {
                onOpenChange(false);
                onOpenGitFile(scope.key, file.scope, file.path);
              }}
              projectName={scope.key}
            />
          ) : activeSection === "pages" ? (
            // 页面段手写（不走 plugin render）：drawer 顶部「新建页面根」需传 createRequest 信号。
            <PagesPanel createRequest={pagesCreateRequest} projectName={scope.key} />
          ) : activePlugin ? (
            <Fragment key={scope.key}>{activePlugin.render(ctx)}</Fragment>
          ) : activeSection === "plugins" ? (
            // 插件段（项目级 skill+MCP）：openSkill 已 scope-aware（navigate /projects/$key/skill/$）。
            <PluginsPanel projectName={scope.key} />
          ) : activeSection === "history" ? (
            <div className="h-full overflow-y-auto p-3">
              <div className="mb-2">
                <HistoryRangeControl onChange={setRange} value={range} />
              </div>
              <HistoryList
                focusId={undefined}
                onRangeChange={setRange}
                projectName={scope.key}
                range={range}
                showLabel={false}
              />
            </div>
          ) : (
            <Fragment>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {isLoading && gridItems.length === 0 ? (
                  <div className="px-3 py-2">
                    <CardGridSkeleton plain />
                  </div>
                ) : gridItems.length > 0 ? (
                  <div className="px-3 py-2">
                    <InstanceGrid items={gridItems} plain />
                  </div>
                ) : (
                  <p className="px-3 py-6 text-center text-sm text-on-surface-muted">
                    {t("workbench.emptyInstanceHint")}
                  </p>
                )}
              </div>
            </Fragment>
          )}
        </div>
      </div>
      {/* 隐藏 file input（文件段上传）+ prompt holder（文件段新建文件夹）。 */}
      <input
        ref={fileInputRef}
        className="hidden"
        type="file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload.mutate(file);
          e.target.value = "";
        }}
      />
      {promptHolder}
    </aside>
  );
}
