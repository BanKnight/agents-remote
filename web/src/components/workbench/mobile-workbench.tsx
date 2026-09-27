import {
  Fragment,
  type CSSProperties,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useT } from "../../i18n";
import type { TranslationKey } from "../../i18n/types";
import type { GitDiffScope, TerminalSession } from "@agents-remote/shared";
import { listProjectFiles, listProjectGitBranches, listProjectGitDiff } from "../../api/client";
import { WIKI_QUERY_SCOPE, useWikiIndex, useWikiPage } from "../../hooks/wiki";
import { AddMenu } from "../files/add-menu";
import { NewItemSheet } from "../files/new-item-sheet";
import { enqueueUploads } from "../files/upload-queue";
import {
  LargeTitleRow,
  MobilePageHeader,
  ModeTabGroup,
  shellSurfaceClasses,
} from "../shell/shell-primitives";
import { ShellIcon } from "../shell/icons";
import { ActionMenu } from "../ui/action-menu";
import { GlobalFilesOverview } from "../files/global-files-overview";
import { MobileProjectsHome } from "./mobile-projects-home";
import { ChatOverview } from "./chat-overview";
import { MobileMcpDetail, MobileSkillDetail } from "./mobile-plugins-detail";
import { MobilePluginsOverview } from "./mobile-plugins-home";
import { MobileMarket, MobileMarketSources } from "./mobile-plugins-market";
import {
  collectLeaves,
  ensurePanelTabOpen,
  findTabRefLeaf,
  type WorkbenchMobileFocusTab,
  type WorkbenchScope,
  type WorkbenchMode,
  type WorkbenchMiddleTab,
  inferSessionTypeFromId,
  panelFileTab,
  parseFileTabId,
  parseGitCommitFocusId,
  parseWikiFocusId,
  projectTabStrip,
  type ProjectTabStripItem,
  removeTabFromLeaf,
  splitFilePath,
  useWorkbenchLayout,
  useWorkbenchBack,
  useWorkbenchNavigate,
  type SessionPanelRef,
  workbenchMobileFocusTabAtom,
  workbenchMobileGlobalFilesPathAtom,
  workbenchMobileProjectFilesPathAtom,
  workbenchWikiRefsAtom,
  workbenchPanelActiveAtom,
  workbenchPanelOpenAtom,
  workbenchPanelTabsAtom,
  type PanelTab,
} from "../../routes/workbench-model";

import {
  CardGridSkeleton,
  type CreateSessionApi,
  AutoRetryHeaderButton,
  PanelRouter,
  type ProjectInstanceEntry,
  useCloseSession,
  useInstanceInfoActions,
  useProjectInstances,
  useScopeInstanceOrder,
} from "./instance-area";
import { WORKBENCH_TAB_PLUGINS, type WorkbenchTabPluginContext } from "./workbench-tab-plugin";
import { MobileProjectHeader } from "./mobile-project-header";
import { InspectionPanel } from "./inspection-panel";
import { usePinnedSessions, usePinSession, useUnpinSession } from "../../hooks/pinned-sessions";
import { FileTabPreview } from "../files/file-preview-panel";
import { formatAheadBehind, gitDiffListQueryKey } from "../git/git-diff-viewer";
import { MobilePrimaryNav } from "../shell/mobile-primary-nav";
import {
  L3GitBranches,
  L3GitCommit,
  L3GitHistory,
  L3WikiReader,
  MobileL3FilePreview,
  MobileL3GitDiff,
} from "./mobile-l3";
import { FilesToolPanel, GitToolPanel, WikiToolPanel } from "./project-tool-panels";
import {
  MobileCreateInstanceSheet,
  MobileProjectSwitchSheet,
  MobileSessionHistorySheet,
} from "./mobile-sheets";
import { useAgentDetail, useRenameSession, useTerminalDetail } from "./instance-area";
import type { ActionMenuItem } from "../ui/action-menu";
import { useCreateProjectDialog } from "../shell/project-setup";
import { useMeasuredBottomNav } from "../shell/shell-layout";

type MobileWorkbenchProps = {
  scope: WorkbenchScope;
  focusId?: string;
  /**
   * 左栏模式（设计 workbench-stable-refactor review 收口）：移动端 `scope=global` 下 leftMode 有意义
   *——leftMode="files"（/files 全局文件文件总览）→ MobileFilesOverview；leftMode="plugins"（/plugins 插件市场）
   * → MobilePluginsOverview；leftMode="settings"（桌面 mainPage 维度）→ 重定向移动 /settings 一级路由
   *（v2 M9 批次 d：两端 IA 各自投影同一 URL 真相）；leftMode="auto" → MobileProjectsHome。project scope 无视 leftMode 走
   * MobileProjectWorkbench（v2 三行头部 + 工具原位）。桌面端 leftMode 由 WorkbenchContent 左栏逻辑消费，
   * 移动端在此分支消费。
   */
  leftMode?: "auto" | "files" | "plugins" | "settings";
  /** 插件 Tab 深度页视图（v2 M6 §3.5，WorkbenchRoute 注入 ctx.pluginView；见 workbench-model）。 */
  pluginView?: "home" | "market" | "sources" | "skill" | "mcp";
  /** 插件详情深度页条目名（第八轮）：pluginView="skill"/"mcp" 时为 skill/server 名。 */
  pluginName?: string;
  /** 项目工具原位（v2 M3-b：?tab=files/git/wiki，与桌面 middle tab 同构；WorkbenchRoute 注入 ctx.tab）。
   * v1.4 批2 起仅作 URL 兼容入口（渲染期映射为检视面板 open+激活标签），不再驱动主体切换。 */
  tool?: WorkbenchMiddleTab;
  /**
   * 一级会话页模式（设计 workbench-views §3.1）：mode=chat 时 global 列表态（leftMode=auto
   * 无 focus）渲染 MobileChatOverview（mode tab + 搜索/新建/列表）。仅 global scope 有意义。
   */
  mode?: WorkbenchMode;
  /** tab 点选 = setActiveTabInLeaf + navigate focus（WorkbenchContent 注入）。 */
  onSelectTab: (leafId: string, tabId: string) => void;
  /** git 变更点文件 → 开 git diff tab + focus（WorkbenchContent 注入）。 */
  onOpenGitFile: (projectName: string, scope: "worktree" | "staged", path: string) => void;
  /** 关闭实例（confirm → close API → 删 tab，WorkbenchContent 注入）。 */
  closeInstance: (sessionId: string, type: "agent" | "terminal") => void;
  /** 创建会话（useCreateSession，WorkbenchContent 注入；promptHolder 同源）。 */
  create: CreateSessionApi;
  /** create promptHolder（useCreateSession 同源，统一渲染）。 */
  createPromptHolder: ReactNode;
  /** close confirm-prompt holder（WorkbenchContent 注入统一渲染）。 */
  closeHolder: ReactNode;
};

/**
 * 移动端工作台（v2 M3，对标 03-* 原型）。project scope = 三行头部（`MobileProjectHeader`）
 * + 单面板主体（`MobileProjectWorkbench`）；global scope 保持「列表态 → 全屏聚焦态」线性模型
 *（MobileProjectsHome / MobileFilesOverview / MobilePluginsOverview / MobileFocusBody /
 * MobileFileFocus / MobileFocusBody 兜底）。
 */
export function MobileWorkbench({
  closeHolder,
  closeInstance,
  create,
  createPromptHolder,
  focusId,
  leftMode,
  pluginName,
  pluginView,
  mode,
  onOpenGitFile,
  onSelectTab,
  scope,
  tool,
}: MobileWorkbenchProps) {
  const navigate = useNavigate();
  // leftMode="settings" 是桌面 mainPage 维度（07m 设置整页）；移动端投影 = 移动 /settings
  // 一级路由（v2 M9 批次 d：同一 URL 真相，两端 IA 各自正确呈现）。replace：设置非移动
  // IA 的合法深链，历史栈不留壳。
  useEffect(() => {
    if (leftMode === "settings") {
      void navigate({ to: "/settings", replace: true });
    }
  }, [leftMode, navigate]);
  // workbench 不走 ShellLayout，这里自行测量底部 nav 高度并注入
  // `--shell-mobile-bottom-nav-space`，让 workbench 内用 var 的滚动容器（文件列表、
  // Git diff 等）底部正确避让（参考 ShellLayout 同款 useMeasuredBottomNav）。
  // nav 恒显（第十轮 §6.12j：原型 tabbar 覆盖 02/03 全系含 L3 与聚焦态等 22 页、仅 06-login
  // 无——旧「聚焦态让位输入区」分支与原型 03「input + tabbar 共存」矛盾且无文档记录，回退；
  // 聚焦态 composer 经 --composer-gap 上浮至 nav 上方，键盘弹出自然遮住 nav，iOS 原生同款）。
  const { height: bottomNavHeight, measured: measuredBottomNav } = useMeasuredBottomNav(
    <MobilePrimaryNav />,
  );
  const mainStyle = {
    "--shell-mobile-bottom-nav-space": `${bottomNavHeight}px`,
    // 聚焦态 composer 浮层（session route 消费 pb-[calc(env+var(--composer-gap))]）：composer
    // 底边要落在 nav 顶 = navH + 4px 间隙，而其 pb 已含 env 项 → gap = navH + 4px − env
    //（env 抵消，防 home indicator 双重避让）。桌面 lg:pb-2.5 覆盖 pb，变量无消费者不受影响。
    "--composer-gap": `calc(${bottomNavHeight}px + 0.25rem - env(safe-area-inset-bottom, 0px))`,
  } as CSSProperties;

  // project scope（含聚焦态）统一走 v2 三行头部工作台。
  // ⚠️ 本分支 main 不吃 pt-safe-area（其余分支保留）：safe-area 顶带在 MobileProjectWorkbench
  // 根容器单点消费（v2 三行头部整体在安全区下；背景仍延伸进刘海带）。
  if (scope.kind === "project") {
    return (
      <main
        className={`relative flex h-[var(--app-viewport-height)] flex-col overflow-hidden text-on-surface ${shellSurfaceClasses.shell}`}
        style={mainStyle}
      >
        <MobileProjectWorkbench
          closeHolder={closeHolder}
          closeInstance={closeInstance}
          create={create}
          createPromptHolder={createPromptHolder}
          focusId={focusId}
          onOpenGitFile={onOpenGitFile}
          onSelectTab={onSelectTab}
          scope={scope}
          tool={tool}
        />
        {measuredBottomNav}
      </main>
    );
  }

  if (!focusId) {
    return (
      <main
        className={`relative flex h-[var(--app-viewport-height)] flex-col overflow-hidden pt-[var(--shell-safe-area-top)] text-on-surface ${shellSurfaceClasses.shell}`}
        style={mainStyle}
      >
        {leftMode === "plugins" ? (
          pluginView === "market" ? (
            <MobileMarket />
          ) : pluginView === "sources" ? (
            <MobileMarketSources />
          ) : pluginView === "skill" && pluginName ? (
            // 12 技能详情深度页（第八轮 pluginView 化：原 focusId=skill_ 直渲分支退役，
            // /plugins/skill/$ 不再写保活 tab 体系）。
            <MobileSkillDetail name={pluginName} />
          ) : pluginView === "mcp" && pluginName ? (
            // 13 MCP 详情深度页（同上，原 focusId=pluginmcp_ 分支与 tab kind 一并退役）。
            <MobileMcpDetail name={pluginName} />
          ) : (
            <MobilePluginsOverview />
          )
        ) : leftMode === "files" ? (
          <MobileFilesOverview />
        ) : mode === "chat" ? (
          <MobileChatOverview />
        ) : (
          <MobileProjectsHome />
        )}
        {measuredBottomNav}
      </main>
    );
  }

  // file focus（focusId 形如 file_demo/src/index.ts，path=全路径含项目名前缀，设计 §6 决策 3 /
  // workbench-stable-refactor Phase 3）：global scope 文件 tab 用 MobileFileFocus 浮窗式预览
  //（复用 FileTabPreview 可编辑预览 + 顶部返回/✕ header）；project scope 文件走 tab 带已在上分支。
  const filePath = parseFileTabId(focusId);
  if (filePath !== null) {
    return (
      <main
        className={`relative flex h-[var(--app-viewport-height)] flex-col overflow-hidden pt-[var(--shell-safe-area-top)] text-on-surface ${shellSurfaceClasses.shell}`}
        style={mainStyle}
      >
        <MobileFileFocus path={filePath} />
        {measuredBottomNav}
      </main>
    );
  }

  return (
    <main
      className={`relative flex h-[var(--app-viewport-height)] flex-col overflow-hidden pt-[var(--shell-safe-area-top)] text-on-surface ${shellSurfaceClasses.shell}`}
      style={mainStyle}
    >
      <MobileFocusBody focusId={focusId} scope={scope} />
      {measuredBottomNav}
    </main>
  );
}

/**
 * 移动端文件聚焦浮窗（设计 §6 决策 3 / workbench-stable-refactor Phase 3）：`/file/$path` URL 在
 * 移动端用此组件打开。`path` = 全路径（含项目名前缀），单行 header（◄ 返回 + 文件名 + ✕）+
 * FileTabPreview 可编辑预览（FileTabPreview 内部 resolveRootBrowseTarget 解析项目名走 project API）。
 * 不实现 V3 group（移动端 [文件] 保持浮窗式，设计决策 12）。返回 / ✕ = navigate 回全局文件树
 *（`/files`，全局文件入口）；项目内文件 → 回 `/projects/$key`（用全路径首段派生项目名）。复用
 * MobileTabHeader 保持与 MobileFocusHeader 同款 header 结构。
 */
function MobileFileFocus({ path }: { path: string }) {
  const { t } = useT();
  const navigate = useNavigate();
  // 全路径首段 = projectName（splitFilePath 与 resolveRootBrowseTarget 同语义，正确处理无 `/` 异常降级）。返回回项目列表态。
  const projectName = splitFilePath(path).projectName;
  const back = () => {
    void navigate({ to: "/projects/$key", params: { key: projectName } });
  };
  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <MobileTabHeader
        activeTabId="file"
        back={{ ariaLabelKey: "files.backToFiles", onClick: back }}
        onTabSelect={() => {
          /* file focus 单 tab，无切换 */
        }}
        tabs={[{ id: "file" as const, label: path.split("/").pop() ?? path }]}
        trailing={
          <div
            className="inline-flex shrink-0 items-center gap-0.5 rounded-lg border border-neutral-line/60 bg-surface-inset/60 p-0.5"
            role="group"
          >
            <button
              aria-label={t("session.close")}
              className="flex h-7 w-7 items-center justify-center rounded-md text-on-surface-soft transition hover:bg-error/10 hover:text-error"
              onClick={back}
              type="button"
            >
              <ShellIcon className="h-4 w-4" name="close" />
            </button>
          </div>
        }
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <FileTabPreview path={path} />
      </div>
    </div>
  );
}

type MobileFocusBodyProps = {
  focusId: string;
  scope: WorkbenchScope;
};

/**
 * 移动端聚焦态主体（设计文档 §7，5g 重构）。单行 header = ◄ 返回 + tab 横滚区 + ℹ✕ 胶囊
 *（MobileFocusHeader），替代旧 MobilePageHeader + 二级 tab 行两块；面板自带 header 在聚焦态
 * 不再自带（已删，2026-09-26 拍板），消除 title 重复 / Files·Git 与 tab 重复 / meta 独占行
 * 三处冗余。Stage A：单实例面板（PanelRouter），不走桌面 split —— 窄屏不 split 多面板（避免
 * 挤压）。Stage B：tab 切 output / inspection —— 实例与 inspection 共占同一区域、tab 切换；
 * inspection 复用 WORKBENCH_TAB_PLUGINS render。ℹ 触发底部 info sheet 显实例 meta（agent 显
 * model/permission/createdAt，terminal 不显这些行 —— UI=f(state) 不伪造）；✕ 触发 useCloseSession
 *（confirm → close API → navigate 回列表）。projectName：project 作用域直接 scope.key；global
 * 作用域从布局面板查 focusId 所属项目。detail 查询（useAgentDetail/useTerminalDetail）query key
 * 与 PanelRouter 一致，React Query dedupe 零额外网络。
 */
function MobileFocusBody({ focusId, scope }: MobileFocusBodyProps) {
  const { t } = useT();
  const navigateWorkbench = useWorkbenchNavigate();
  const [layout] = useWorkbenchLayout();
  const [tab, setTab] = useAtom(workbenchMobileFocusTabAtom);
  const { refs: order } = useScopeInstanceOrder(scope);
  // global scope 从布局查 focusId 所属项目（focusId 是 session id，查到的 ref 收窄到 session
  // 取 projectName；FilePanelRef 无 projectName 字段故需 kind 收窄，设计 workbench-stable-refactor Phase 3）。
  const focusRef = scope.kind === "global" ? findTabRefLeaf(layout, focusId) : null;
  const projectName =
    scope.kind === "project"
      ? scope.key
      : ((focusRef?.kind === "session" ? focusRef.projectName : undefined) ??
        order.find((r) => r.sessionId === focusId)?.projectName);
  const sessionType = inferSessionTypeFromId(focusId);
  // detail 查询（query key 与 PanelRouter 一致，React Query dedupe 零额外网络）。两个 hook 都调
  //（hooks 规则），按 sessionType 控制 enabled；projectName 未就绪时双 enabled=false 零网络开销。
  const panelRef: SessionPanelRef = {
    kind: "session",
    projectName: projectName ?? "",
    sessionId: focusId,
  };
  const {
    openInfo,
    holder: infoHolder,
    autoRetryEditorHolder,
    runtimeDialogHolder,
  } = useInstanceInfoActions(panelRef, sessionType, projectName);
  const { close, holder: closeHolder } = useCloseSession();
  // files tab 当前目录（localStorage 记忆，按项目 key 分组）：后台被杀/重开停留在上次目录。
  // 切项目用独立 key 隔离（替代旧 derived-state 重置，语义等价且天然不串项目）。
  const [projectFilesPaths, setProjectFilesPaths] = useAtom(workbenchMobileProjectFilesPathAtom);
  const filesPath = projectName ? (projectFilesPaths[projectName] ?? "") : "";
  const setFilesPath = (path: string) => {
    if (!projectName) return;
    setProjectFilesPaths((prev) => ({ ...prev, [projectName]: path }));
  };
  const ctx: WorkbenchTabPluginContext = {
    projectKey: projectName ?? null,
    currentPath: filesPath,
    onPathChange: setFilesPath,
  };
  const visiblePlugins = WORKBENCH_TAB_PLUGINS.filter((plugin) => plugin.when(ctx));
  // 记忆的 tab 若在当前 ctx 不可见（如全局作用域下 project-scoped 的 files/git 隐藏，
  // 但记忆值为 files）→ 回退 output，避免内容区空白。
  const activeTab: WorkbenchMobileFocusTab =
    tab === "output" || visiblePlugins.some((p) => p.id === tab) ? tab : "output";
  const activePlugin =
    activeTab === "output" ? null : (visiblePlugins.find((p) => p.id === activeTab) ?? null);

  const onClose = () => {
    if (!sessionType) return;
    void close(panelRef, sessionType, () => void navigateWorkbench(scope));
  };

  const tabs = [
    { id: "output" as const, label: t("workbench.tabOutput") },
    ...visiblePlugins.map((p) => ({ id: p.id, label: t(p.labelKey) })),
  ];

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <MobileFocusHeader
        activeTab={activeTab}
        onBack={() => void navigateWorkbench(scope)}
        onClose={onClose}
        onInfo={openInfo}
        onTabSelect={setTab}
        tabs={tabs}
        trailingExtra={
          sessionType === "agent" && projectName ? (
            <AutoRetryHeaderButton
              projectName={projectName}
              sessionId={focusId}
              variant="capsule"
            />
          ) : null
        }
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {projectName ? (
          <div className={activePlugin ? "hidden" : "flex min-h-0 flex-1 flex-col overflow-hidden"}>
            <PanelRouter
              key={focusId}
              panelRef={{ kind: "session", projectName, sessionId: focusId }}
            />
          </div>
        ) : null}
        {activePlugin ? (
          <Fragment key={projectName ?? "none"}>{activePlugin.render(ctx)}</Fragment>
        ) : null}
      </div>
      {infoHolder}
      {autoRetryEditorHolder}
      {runtimeDialogHolder}
      {closeHolder}
    </div>
  );
}

type MobileFocusHeaderProps = {
  activeTab: WorkbenchMobileFocusTab;
  tabs: { id: WorkbenchMobileFocusTab; label: string }[];
  onBack: () => void;
  onInfo: () => void;
  onClose: () => void;
  onTabSelect: (id: WorkbenchMobileFocusTab) => void;
  /** 胶囊内前置的额外操作（如 claude 自动重试开关）；null 不渲染。 */
  trailingExtra?: ReactNode;
};

/**
 * 移动聚焦态单行 header（设计文档 §7，5g 重构）：◄ 返回 + tab 横滚区（flex-1 overflow-x-auto
 * 隐藏滚动条）+ ℹ✕ 胶囊操作区（ViewSwitcher 同款容器）。替代旧 MobilePageHeader + 二级 tab 行。
 * tab 区可横滚（tab 多时不换行挤压胶囊）；胶囊 shrink-0 永远可见。ℹ 触发底部 info sheet；
 * ✕ 触发 useCloseSession（confirm → close API → navigate 回列表）。
 */
function MobileFocusHeader({
  activeTab,
  tabs,
  onBack,
  onInfo,
  onClose,
  onTabSelect,
  trailingExtra,
}: MobileFocusHeaderProps) {
  const { t } = useT();
  return (
    <MobileTabHeader
      activeTabId={activeTab}
      back={{ ariaLabelKey: "workbench.backToList", onClick: onBack }}
      onTabSelect={onTabSelect}
      tabs={tabs}
      trailing={
        <div
          className="inline-flex shrink-0 items-center gap-0.5 rounded-lg border border-neutral-line/60 bg-surface-inset/60 p-0.5"
          role="group"
        >
          {trailingExtra}
          <button
            aria-label={t("session.instanceInfo.title")}
            className="flex h-8 w-8 items-center justify-center rounded-md text-on-surface-soft transition hover:bg-on-surface/5 hover:text-on-surface active:bg-on-surface/10"
            onClick={onInfo}
            type="button"
          >
            <ShellIcon className="h-4 w-4" name="info" />
          </button>
          <button
            aria-label={t("session.close")}
            className="flex h-8 w-8 items-center justify-center rounded-md text-on-surface-soft transition hover:bg-error/10 hover:text-error"
            onClick={onClose}
            type="button"
          >
            <ShellIcon className="h-4 w-4" name="close" />
          </button>
        </div>
      }
    />
  );
}

type MobileFocusTabButtonProps = {
  active: boolean;
  label: string;
  onClick: () => void;
};

/** 移动聚焦态 header tab 按钮（5g 紧凑化匹配 h-12 单行 header，与桌面检视 seg4 同设计语言）。 */
function MobileFocusTabButton({ active, label, onClick }: MobileFocusTabButtonProps) {
  return (
    <button
      className={`shrink-0 cursor-pointer rounded-md px-2.5 py-1.5 text-xs font-semibold transition ${active ? "bg-primary/10 text-primary" : "text-on-surface-muted hover:bg-on-surface/5 hover:text-on-surface active:bg-on-surface/10"}`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

type MobileTabHeaderProps<TabId extends string> = {
  // ◄ 返回按钮：可选，不传则不渲染。消费方均聚焦态（session ◄ 回列表、文件 ◄ 回文件树、
  // skill ◄ 回插件列表）传 back；一级页面（全局总览）不传，靠底部 tab 切换。
  back?: { ariaLabelKey: TranslationKey; onClick: () => void };
  tabs: { id: TabId; label: string }[];
  activeTabId: TabId;
  onTabSelect: (id: TabId) => void;
  // 右侧 slot：聚焦态填 ℹ✕ 胶囊，列表态填标题 span。
  trailing?: ReactNode;
};

/**
 * 移动单行 header 容器（设计文档 §7）：◄ 返回 + tab 横滚区（flex-1 overflow-x-auto 隐藏
 * 滚动条）+ 右侧 slot。聚焦态（MobileFocusHeader ℹ✕ 胶囊）与列表态（Project/Global Overview
 * 标题）共用此容器，避免三处逐字重复 header className / 返回按钮 SVG / tab 横滚 div。
 * 泛型 TabId 让聚焦态（WorkbenchMobileFocusTab）与列表态（WorkbenchMiddleTab）
 * 复用同一容器且保持各自 tab id 的类型安全。
 */
function MobileTabHeader<TabId extends string>({
  back,
  tabs,
  activeTabId,
  onTabSelect,
  trailing,
}: MobileTabHeaderProps<TabId>) {
  const { t } = useT();
  return (
    <header className="flex h-11 shrink-0 items-center gap-1 border-b border-on-surface/5 px-3">
      {back ? (
        <button
          aria-label={t(back.ariaLabelKey)}
          className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-on-surface-soft transition hover:bg-on-surface/5 hover:text-on-surface active:bg-on-surface/10"
          onClick={back.onClick}
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
      ) : null}
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((opt) => (
          <MobileFocusTabButton
            active={opt.id === activeTabId}
            key={opt.id}
            label={opt.label}
            onClick={() => onTabSelect(opt.id)}
          />
        ))}
      </div>
      {trailing}
    </header>
  );
}

type MobileProjectWorkbenchProps = {
  scope: { kind: "project"; key: string };
  focusId?: string;
  /** 项目工具原位（v2 M3-b：?tab 维度 files/git/wiki）。v1.4 批2 起仅作 URL 兼容入口
   *（渲染期映射为检视面板 open+激活标签）。 */
  tool?: WorkbenchMiddleTab;
  onSelectTab: (leafId: string, tabId: string) => void;
  onOpenGitFile: (projectName: string, scope: "worktree" | "staged", path: string) => void;
  closeInstance: (sessionId: string, type: "agent" | "terminal") => void;
  create: CreateSessionApi;
  /** create promptHolder（useCreateSession 同源 holder，统一渲染）。 */
  createPromptHolder: ReactNode;
  closeHolder: ReactNode;
};

/**
 * 移动项目工作台（v2 M3-b/c，对标 03-workspace-* 原型）＝三行头部（`MobileProjectHeader`：
 * nav / row2 pills＋＋检视面板入口 / chips）+ 单面板主体 + 检视面板（`InspectionPanel`）。
 *
 * - **检视面板（v1.4 批2）**：文件树/Git/Wiki 工具面板迁全屏面板（标签条 .ptabs，标签集 per
 *   projectKey 持久化）；row2 单 ticon 开面板，‹ 工作台 关面板。旧 ?tab=files/git/wiki 深链
 *   渲染期一次性映射为面板 open+激活标签（不写回 URL）；「进工具」语义收敛为 handleToolChange
 * （开面板+激活标签），面板内 L3（git 历史/分支/commit/wiki 页）渲染进面板 l3Body，主体区
 *   仅承接深链直达（面板 closed）的现状路径。
 * - **实例聚焦**：`<PanelRouter>`——与桌面中栏主体同一渲染源（session 含底部
 *   输入；file/git/skill 只读预览），聚焦瞬态（focus effect 同步前 tab 尚未入 layout）渲染
 *   骨架不闪空态。effectiveFocusId = 显式 ?session ?? 自动聚焦（见下）。面板 open 时实例层
 *   照常挂载（保活 hidden），WS 不断。
 * - **浏览态收敛（v2 M3-c）**：03 系列原型无「实例网格浏览态」——工作台页 = 聚焦态或空态卡。
 *   无显式 ?session 时渲染层回退聚焦「上次位置」（layout 中 active tab 属本项目的第一个
 *   leaf，D4 直达语义延伸；否则第一个实例）；完全无实例才渲染 03h 空态卡。回退不写 URL
 *  （显式点击 pill 才落 ?session），避免 back 回「浏览态」再自动聚焦的循环。
 * - **file/git focus**（files/git 树/变更点文件进的一次性预览）：面板 open 时渲染进面板
 *   l3Body（保活层让位单实例）；面板 closed 时走 nav 右侧 ✕ = removeTabFromLeaf 关闭预览
 *   tab（✕ 是唯一关闭路径）。
 * - **保活纪律不变**（2026-08-17 用户决策「全保活 + 聚焦过即可」）：聚焦过的已打开 tab 保持
 *   挂载 hidden，切 tab/进出面板 WS 不断（file/git 预览无 WS 生命周期，面板 open 时让位面板
 *   渲染、关闭时回保活层，切换点销毁重建——记档批3 链接直达收敛）。
 */
function MobileProjectWorkbench({
  closeHolder,
  closeInstance,
  create,
  createPromptHolder,
  focusId,
  onOpenGitFile,
  onSelectTab,
  scope,
  tool,
}: MobileProjectWorkbenchProps) {
  const { t } = useT();
  // 工具原位归一化：?tab 维度还含 overview 等非工具值，`?tab` 缺省时 WorkbenchRoute 回退
  // 中栏默认 "overview"——tool prop 恒 truthy，不能直接当布尔用。
  // v1.4 §6.13 批2：files/git/wiki 工具态退役为检视面板（InspectionPanel）。tool prop 不再
  // 驱动主体切换，仅作 URL 兼容入口——旧深链 ?tab= 渲染期映射为 panelOpen + 激活标签
  //（不写回 URL；面板开合真相 = workbenchPanelOpenAtom 内存态）。
  const activeTool = tool === "files" || tool === "git" || tool === "wiki" ? tool : undefined;
  // 检视面板状态（per-projectKey 标签集/激活项持久化，open 内存级——跨刷新恢复标签不恢复开合）。
  const [panelOpen, setPanelOpen] = useAtom(workbenchPanelOpenAtom);
  const [panelTabsMap, setPanelTabsMap] = useAtom(workbenchPanelTabsAtom);
  const [panelActiveMap, setPanelActiveMap] = useAtom(workbenchPanelActiveAtom);
  const panelTabs = panelTabsMap[scope.key] ?? [{ id: "files", kind: "files" } as PanelTab];
  const activePanelTabId = panelActiveMap[scope.key] ?? "files";
  const activePanelTab = panelTabs.find((tab) => tab.id === activePanelTabId) ?? panelTabs[0];
  // perf-review 批2 M1：面板从未打开过不挂载任何工具面板——invisible 只免 paint，不免渲染/
  // 布局/网络（首访项目页不再多发一发不可见的 files 列表请求）。首次 open 当帧挂载（同一
  // commit，滑入动画不受影响），关闭后不卸载（零销毁保持）。内存级，不与 URL/持久化交互。
  const [panelEverOpened, setPanelEverOpened] = useState(false);
  // 面板可见性 = open 且本挂载周期打开过（批3 review M2）：panelOpen 是两端共享的内存
  // atom——桌面（≥1024）开面板后视口转窄，MobileWorkbench 重挂时 panelEverOpened=false
  // 而 panelOpen 残留 true，直接消费会把空面板全屏渲染 + 主体隐藏。所有「面板可见性」
  // 语义的消费点（open/l3/保活层让位/主体切换）统一走本派生；写入路径不变。
  const panelVisible = panelEverOpened && panelOpen;
  const openInspectionPanel = () => {
    setPanelEverOpened(true);
    setPanelOpen(true);
  };
  // design-review 批2 M2：面板 open 是页面级瞬态——组件卸载复位（浏览器/系统返回离开
  // workbench 后重进任意项目不再「不请自来」复开面板；与 atom 注释「开面板是一次显式用户
  // 动作」对齐）。残留 ?tab= 深链复开是拍板 f 的固有代价，记入批3（链接直达接管 URL）。
  useEffect(() => () => setPanelOpen(false), []);
  const ensurePanelTab = (tab: PanelTab) => {
    setPanelTabsMap((prev) => {
      const list = prev[scope.key] ?? [{ id: "files", kind: "files" } as PanelTab];
      const next = ensurePanelTabOpen(list, tab);
      if (next === list) return prev;
      return { ...prev, [scope.key]: next };
    });
  };
  // 幂等守卫（perf-review 批2 m2）：值未变直接返回旧引用——点已激活标签 / URL 深链重复映射
  // 不再产生多余的全组件重渲染 + localStorage 同步写（与 ensurePanelTab 的 some 守卫对齐）。
  const activatePanelTab = (id: string) =>
    setPanelActiveMap((prev) => (prev[scope.key] === id ? prev : { ...prev, [scope.key]: id }));
  // ＋ 新建标签（03ob2 菜单）：同目标已开 = 激活幂等（03ob 编号①）。
  const newPanelTab = (kind: "files" | "git" | "wiki") => {
    ensurePanelTab({ id: kind, kind } as PanelTab);
    activatePanelTab(kind);
  };
  // 链接直达（03ab ⑥，v1.4 批3）：树点文件 → file 预览标签新增/激活（不再走中栏 file tab
  // + URL focus 旧体系）。同目标已开 = 激活幂等；面板已在打开态（面板内点击），无需再 open。
  const openPanelFileTab = (path: string) => {
    const tab = panelFileTab(scope.key, path);
    ensurePanelTab(tab);
    activatePanelTab(tab.id);
  };
  // 面板内 diff（03r「L3 是面板内深度页」批3 收敛）：git 变更行 / file 标签「查看 diff」→
  // 面板级瞬态呈现（l3Body 覆盖层），back 清本态回标签条——不再写中栏 git tab + URL focus
  //（旧体系仅剩深链/存量 tab 渲染路径，入口清零后自然消亡）。from 记录来源标签（back 标签）。
  const [panelDiff, setPanelDiff] = useState<{
    path: string;
    scope: GitDiffScope;
    from: "git" | "file" | "files";
  } | null>(null);
  // ✕ 关标签：仅 file 标签可关（三基础标签不可关）；关激活标签回文件树首标签。
  const closePanelTab = (id: string) => {
    setPanelTabsMap((prev) => {
      const list = prev[scope.key] ?? [];
      return { ...prev, [scope.key]: list.filter((t0) => t0.id !== id) };
    });
    if (id === activePanelTabId) activatePanelTab("files");
  };
  // URL 兼容（plan 批2 ⑥）：旧 ?tab=files|git|wiki 深链渲染期一次性映射为面板 open+激活
  // 标签（不写回 URL）。幂等——面板内 L3 导航（URL 带 tab=git）重复触发无副作用。
  useEffect(() => {
    if (!activeTool) return;
    openInspectionPanel();
    ensurePanelTab({ id: activeTool, kind: activeTool } as PanelTab);
    activatePanelTab(activeTool);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool]);
  const navigateWorkbench = useWorkbenchNavigate();
  // nav 行 ◄「项目」push 回项目 Tab（v2 03 原型 .back；替代 v1 ☰ drawer 开关——v2 无 drawer，
  // 实例切换 = pills、文件/Git/Wiki = 工具 ticon、新建 = row2 ＋）。
  const navigate = useNavigate();
  // layout 读写（单一 V4 atom，与 WorkbenchRoute 同源）：file/git 预览 ✕ 用 removeTabFromLeaf。
  const [layout, updateLayout] = useWorkbenchLayout();
  const { instances, isLoading } = useProjectInstances(scope.key);

  // tab 带（中栏投影）：projectTabStrip 过滤当前项目 tab（skill 全局包含）。v2 起 pills 只装
  // 实例（+skill 兼职 pill）；file/git tab 由工具 ticon 承载，skillTabs 派生给 header pills。
  const stripItems = useMemo(() => projectTabStrip(layout, scope.key), [layout, scope.key]);
  // flatMap 三元 narrow（filter 谓词不带 type guard 不收窄 ref union）。
  const skillTabs = useMemo(
    () =>
      stripItems.flatMap((item) =>
        item.ref.kind === "skill"
          ? [{ tabId: item.tabId, leafId: item.leafId, name: item.ref.name }]
          : [],
      ),
    [stripItems],
  );

  // 浏览态收敛（v2 M3-c）：自动聚焦「上次位置」。layout 中 active tab 属本项目 session/skill
  // 的第一个 leaf 优先（桌面最后操作的 leaf 大概率排前），否则第一个实例。isLoading 时不选
  //（instances 未到就选会闪空态）；focusId 显式时无需回退。
  const autoFocusId = useMemo(() => {
    if (isLoading) return null;
    const projectTabIds = new Set(
      stripItems
        .filter((s) => s.ref.kind === "session" || s.ref.kind === "skill")
        .map((s) => s.tabId),
    );
    for (const leaf of collectLeaves(layout.root)) {
      if (leaf.activeTabId && projectTabIds.has(leaf.activeTabId)) return leaf.activeTabId;
    }
    return instances[0]?.session.id ?? null;
  }, [instances, isLoading, layout, stripItems]);
  const effectiveFocusId = focusId ?? autoFocusId ?? undefined;

  // 保活集合（2026-08-17 问题 3，用户决策「全保活 + 聚焦过即可」）：本会话「聚焦过」（含当前
  // 激活，含自动聚焦回退）的已打开 tab。移动端单面板不照搬桌面全挂载——刷新重进 layout 恢复
  // N tab 只挂载当前激活的，随切换逐步纳入保活。切 tab 再切回不重连（WS 不断）。
  const [focusedTabIds, setFocusedTabIds] = useState<Set<string>>(
    () => new Set(focusId ? [focusId] : []),
  );
  useEffect(() => {
    const target = focusId ?? autoFocusId;
    if (!target) return;
    setFocusedTabIds((prev) => {
      if (prev.has(target)) return prev;
      const next = new Set(prev);
      next.add(target);
      return next;
    });
  }, [focusId, autoFocusId]);
  const [, setFocusTab] = useAtom(workbenchMobileFocusTabAtom);

  const focusInstance = (sessionId: string) => {
    // 点 pill 进 focus → 重置 Output tab（同 MobileProjectsHome.focusInstance，避免继承
    // Files/Git 记忆落到项目文件）。
    setFocusTab("output");
    if (activeTool && sessionId === effectiveFocusId) {
      // 点当前 focus 的 pill：focusId 不变导航无-op，显式退工具（H1，兜底路径）。
      handleToolChange(null);
      return;
    }
    // 一次导航同时退工具 + 聚焦（search = {} 清 tab 维度，focus 与工具互斥）。原先
    // handleToolChange(null) + navigate 连环两次 push，栈里留 ?tab=files 中间态（一次点击
    // history +2，返回要多按一次）。
    void navigateWorkbench(scope, sessionId, {});
  };

  // 自动聚焦回退项（instances[0]）可能不在 layout（项目从未打开过 tab）——注入临时投影让
  // 保活层能渲染它（不写 layout：显式点击 pill 才由 WorkbenchRoute focus effect ensure 入）。
  // 用户切走（点别的 pill）后它未入 layout 即卸载——「打开」语义边界（未打开的实例无保活）。
  const renderItems = useMemo(() => {
    if (!autoFocusId || stripItems.some((s) => s.tabId === autoFocusId)) return stripItems;
    const entry = instances.find((e) => e.session.id === autoFocusId);
    if (!entry) return stripItems;
    const injected: ProjectTabStripItem = {
      leafId: "auto-focus",
      tabId: autoFocusId,
      ref: { kind: "session", projectName: scope.key, sessionId: autoFocusId },
    };
    return [...stripItems, injected];
  }, [autoFocusId, instances, scope.key, stripItems]);
  // 聚焦态主体 ref：layout 权威优先；自动聚焦注入项（不在 layout）用注入 ref 兜底——否则
  // 回退态 chips/ℹ✕ 全部 gate 在 layout 命中上而缺失、骨架与面板双渲染（design-reviewer
  // M3-c #1）。仍未命中（focus effect 同步前瞬态 / 已最小化但 URL 未清）→ 骨架承接。
  const focusRef = effectiveFocusId
    ? (findTabRefLeaf(layout, effectiveFocusId) ??
      renderItems.find((s) => s.tabId === effectiveFocusId)?.ref ??
      null)
    : null;
  // chips 行数据源：聚焦 terminal（v1.4 起 agent 无 chips 行——配置在 composer 控制行与
  // ℹ 实例信息）。type predicate 收窄 session union（ProjectInstanceEntry 非 discriminated
  // union）。
  const focusedTerminal =
    effectiveFocusId && focusRef?.kind === "session"
      ? (instances.find(
          (e): e is ProjectInstanceEntry & { session: TerminalSession } =>
            e.type === "terminal" && e.session.id === effectiveFocusId,
        )?.session ?? null)
      : null;

  // v1.4 批2：工具态退役为检视面板——「进工具」= 开面板+激活标签，「退工具」（点当前
  // focus 的 pill / focus 变化兜底）= 关面板回实例主体。签名与旧工具切换兼容，各消费点
  //（focusInstance / skill pill / 空态卡）零改动。
  const handleToolChange = (next: "files" | "git" | "wiki" | null) => {
    if (next) {
      ensurePanelTab({ id: next, kind: next } as PanelTab);
      activatePanelTab(next);
      openInspectionPanel();
      return;
    }
    setPanelOpen(false);
    // 面板关即清瞬态 diff（批3 review m6）：残留会让下次开面板直落旧 diff 覆盖层而非标签条。
    setPanelDiff(null);
  };
  // ‹ 工作台（面板 nav back；面板内 L3 时 InspectionPanel 的 back 先走 l3.onClick 回标签条，
  // 真正关面板时 URL 可能停在 L3 路由——pop 优先回 push 前的工作台，深链兜底 push 清 focusId）。
  const handlePanelClose = () => {
    setPanelOpen(false);
    setPanelDiff(null);
    if (l3Route) backNav(() => void navigateWorkbench(scope, undefined, {}));
  };
  // 面板 children：标签叠层保活（perf-review 批2 m1）——panelTabs 全渲染，非激活
  // visibility:hidden：卸载重建 = 每次切换 5s staleTime 后台 refetch + 滚动位丢失，标签切换
  // 是面板主交互。与保活层同范式（frontend-notes §3：副作用生命周期元素保稳定 key）。
  // 渲染函数形态——求值推迟到 JSX 装配点（filesPath/wikiSearchQuery 等状态定义在后，
  // 惰性求值避开 TDZ）。
  const renderPanelChildren = () =>
    panelTabs.map((tab) => {
      const active = tab.id === activePanelTabId;
      return (
        <div
          className={
            active
              ? "absolute inset-0 flex min-h-0 flex-col overflow-hidden"
              : "absolute inset-0 invisible flex min-h-0 flex-col overflow-hidden"
          }
          data-panel-tab-body={tab.id}
          key={tab.id}
        >
          {tab.kind === "files" ? (
            <div className="min-h-0 flex-1 overflow-hidden">
              <FilesToolPanel
                currentPath={filesPath}
                onOpenFile={(_projectName, p) => openPanelFileTab(p)}
                onOpenGitFile={(f) => setPanelDiff({ path: f.path, scope: f.scope, from: "files" })}
                onPathChange={setFilesPath}
                projectName={scope.key}
                searchQuery={filesSearchQuery}
              />
            </div>
          ) : tab.kind === "git" ? (
            <div className="min-h-0 flex-1 overflow-hidden">
              <GitToolPanel
                onOpenCommit={(hash) => {
                  void navigate({
                    params: { key: scope.key, _splat: hash },
                    search: { tab: "git" },
                    to: "/projects/$key/git/commit/$",
                  });
                }}
                onOpenGitFile={(f) => setPanelDiff({ path: f.path, scope: f.scope, from: "git" })}
                onOpenHistory={() => {
                  void navigate({
                    params: { key: scope.key },
                    search: { tab: "git" },
                    to: "/projects/$key/git/history",
                  });
                }}
                onOpenBranches={() => {
                  void navigate({
                    params: { key: scope.key },
                    search: { tab: "git" },
                    to: "/projects/$key/git/branches",
                  });
                }}
                projectName={scope.key}
              />
            </div>
          ) : tab.kind === "wiki" ? (
            <div className="min-h-0 flex-1 overflow-hidden">
              <WikiToolPanel
                onOpenPage={(slug) => {
                  void navigate({
                    params: { key: scope.key, _splat: slug },
                    search: { tab: "wiki" },
                    to: "/projects/$key/wiki/$",
                  });
                }}
                onQueryChange={setWikiSearchQuery}
                projectName={scope.key}
                query={wikiSearchQuery}
              />
            </div>
          ) : tab.kind === "file" ? (
            (() => {
              const { projectName: fp, path: relPath } = splitFilePath(tab.path);
              return (
                <MobileL3FilePreview
                  onViewDiff={() =>
                    setPanelDiff({ path: relPath, scope: "worktree", from: "file" })
                  }
                  path={relPath}
                  projectName={fp}
                />
              );
            })()
          ) : null}
        </div>
      );
    });
  // 面板 FAB（03o ③ / 03oa：文件树标签右下 → 添加菜单两项「新建…/上传…」，批4 启用；
  // 批2 曾是 disabled 空桩）。目标目录 = 当前 cwd（filesPath，与 FilesToolPanel 受控记忆
  // 同源）；上传走 03z 队列（enqueueUploads + hidden input，时序安全用 ref）。
  const panelUploadInputRef = useRef<HTMLInputElement>(null);
  const panelUploadTargetRef = useRef("");
  const [panelNewItemParentPath, setPanelNewItemParentPath] = useState<string | null>(null);
  const renderPanelFab = () =>
    activePanelTab?.kind === "files" ? (
      <AddMenu
        onNew={() => setPanelNewItemParentPath(filesPath)}
        onUpload={() => {
          panelUploadTargetRef.current = filesPath;
          panelUploadInputRef.current?.click();
        }}
        trigger={
          <button aria-label={t("files.add")} className="fab cursor-pointer" type="button">
            <span className="plus" style={{ width: 20, height: 20 }} />
          </button>
        }
      />
    ) : null;
  // H1 修复（design-reviewer 运行时实证）：focus 导航与面板互斥（脏 URL 兜底）。?tab 与
  // focusId 是独立存活的维度——脏 URL（?tab= 与 session focus 并存）时以 focusId 变化为信号
  // 关面板（面板全屏覆盖时点不到 header 入口，正常路径不触发）。面板内 L3 导航（githistory/
  // gitbranches/gitcommit_/wiki_）是内容区替换的显式子路由，不是 focus 语义——关面板会把
  // L3 路由丢成 session 路由（实测 /session/githistory 破坏 URL），故 L3 跳过；面板内 files
  // 树点文件（file_*）导航自带清 tab（activeTool 已 undefined），同样不触发。
  // 第十一轮复验补注（v1.4 批2 仍成立）：正常路径本 effect 不再触发（activeTool 已
  // undefined），仅深链/脏 URL（?tab= 与 session focus 并存）兜底。
  const prevFocusRef = useRef(focusId);
  useEffect(() => {
    if (focusId !== prevFocusRef.current) {
      prevFocusRef.current = focusId;
      if (
        focusId &&
        activeTool &&
        focusId !== "githistory" &&
        focusId !== "gitbranches" &&
        !focusId.startsWith("gitcommit_") &&
        !focusId.startsWith("wiki_")
      ) {
        handleToolChange(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);
  // 文件工具 cwd 记忆（按项目 key 分组 atom，与 MobileFocusBody 同一 atom 同一语义）。
  const [projectFilesPaths, setProjectFilesPaths] = useAtom(workbenchMobileProjectFilesPathAtom);
  const filesPath = projectFilesPaths[scope.key] ?? "";
  const setFilesPath = (path: string) =>
    setProjectFilesPaths((prev) => ({ ...prev, [scope.key]: path }));
  // FAB 新建的重名即时校验数据源：与面板 FilesToolPanel 同 key 共享缓存（零额外网络）。
  const panelFilesQuery = useQuery({
    queryFn: () => listProjectFiles(scope.key, filesPath || undefined),
    queryKey: ["projects", scope.key, "files", filesPath],
  });
  const panelFilesEntries = panelFilesQuery.data?.entries;

  // file/git 预览 focus 的返回（M10 第三轮用户反馈：back = 返回上一层，与 backLabel 语义
  // 对齐——文件预览回文件树父目录（03q back「src/auth」），git diff 回 Git 工具面板（03r
  // back「Git 检视」）。此前动作是 v2 M4 旧设计「删 tab + 回实例主体」，backLabel 显示的
  // 是来源层级、动作却回实例主体，显示与行为脱节。预览 tab 仍是一次性（删），返回导航落在
  // 来源工具层（pop 优先；深链兜底 push 清 focusId 的工具态 URL，cwd 同步到父目录）。
  const closeTransientFocus =
    focusRef?.kind === "file" || focusRef?.kind === "git"
      ? () => {
          const leafId = stripItems.find((s) => s.tabId === effectiveFocusId)?.leafId;
          if (!leafId || !effectiveFocusId) return;
          updateLayout((prev) => removeTabFromLeaf(prev, leafId, effectiveFocusId));
          if (focusRef?.kind === "file") {
            const { path: relPath } = splitFilePath(focusRef.path);
            const lastSlash = relPath.lastIndexOf("/");
            // 根文件（无父目录）back = 项目名（l3Transient 同款）→ cwd 回根目录。
            setFilesPath(lastSlash === -1 ? "" : relPath.slice(0, lastSlash));
          }
          // 返回导航 pop 优先：栈回 push 进预览前的工具态（?tab= files/git），不留死记录；
          // 深链直达无来路时 push 兜底——显式 focusId=undefined + tab（不走 handleToolChange，
          // 它透传闭包里的旧 focusId，返回后 URL 残留 session=file_*，刷新复活已删 tab）。
          const backTool = focusRef?.kind === "file" ? "files" : "git";
          backNav(() => void navigateWorkbench(scope, undefined, { tab: backTool }));
        }
      : null;

  // ── M4 L3 深度页路由态（显式子路由，不写 layout）──────────────────────────────
  // focusId 只认显式 URL（autoFocusId 是 session 维度，不会是 L3 值）。4 种 focusId 由
  // deriveWorkbenchRouteContext 派生（workbench-model），此处仅解析渲染形态。
  const l3Route = useMemo(() => {
    if (!focusId) return null;
    if (focusId === "githistory") return { kind: "history" as const };
    if (focusId === "gitbranches") return { kind: "branches" as const };
    if (focusId.startsWith("gitcommit_"))
      return { kind: "commit" as const, hash: parseGitCommitFocusId(focusId) ?? "" };
    if (focusId.startsWith("wiki_"))
      return { kind: "wiki" as const, slug: parseWikiFocusId(focusId) ?? "" };
    return null;
  }, [focusId]);
  // 返回类导航原语（pop 优先，深链无来路时 fallback push 兜底）。
  const backNav = useWorkbenchBack();
  // L3 back：pop 优先（来源是 push，栈不留死记录）；深链直达无来路时 push 到 backLabel 声称的
  // 层级兜底（?tab= 工具态）。
  const l3BackTo = (tab: WorkbenchMiddleTab) => {
    backNav(() => void navigateWorkbench(scope, undefined, { tab }));
  };
  // commit 页 backLabel =「提交历史」：深链兜底同样退到 history 页（与 backLabel 一致），
  // 而非 git 工具面板。
  const l3BackToHistory = () => {
    backNav(
      () =>
        void navigate({
          params: { key: scope.key },
          search: { tab: "git" },
          to: "/projects/$key/git/history",
        }),
    );
  };
  // wiki L3 的 back 反查（分组名）与标题（页名）：同 key wiki-index/page 缓存共享。
  const l3WikiSlug = l3Route?.kind === "wiki" ? l3Route.slug : null;
  const wikiIndex = useWikiIndex(scope.key, WIKI_QUERY_SCOPE);
  const l3WikiPage = useWikiPage(scope.key, l3WikiSlug ?? null, WIKI_QUERY_SCOPE);
  // 工具 chip（03m gitchip / 03o crumb / 03p wsearch）数据与交互在此装配，header 只呈现。
  // git chip 计数与工具面板/桌面左栏同 key（缓存共享，桌面开着时零成本）。
  const gitDiffForChip = useQuery({
    queryKey: gitDiffListQueryKey(scope.key),
    queryFn: () => listProjectGitDiff(scope.key),
  });
  // 03o crumb 段（filesPath 目录链，每段可点回跳；项目名 b 不可点）。
  const crumbSegments = filesPath ? filesPath.split("/") : [];
  // 分支页标题计数（与 GitToolPanel / 分支页同 key 缓存共享）。
  const branchesForTitle = useQuery({
    queryKey: ["projects", scope.key, "git", "branches"],
    queryFn: () => listProjectGitBranches(scope.key),
  });
  // gitchip 计数（worktree/staged 分 scope 计数；非 repository 恒 0）。
  const { worktree: chipWorktree, staged: chipStaged } = useMemo(() => {
    const files = gitDiffForChip.data?.repository === true ? gitDiffForChip.data.files : [];
    const count = (s: string) => files.filter((f) => f.scope === s).length;
    return { worktree: count("worktree"), staged: count("staged") };
  }, [gitDiffForChip.data]);
  // 03m gitchip b = 分支名 + ahead/behind（spec §4.4 `main ↑1 ↓0`）；detached 降级工具名。
  const chipBranch =
    gitDiffForChip.data?.repository === true ? gitDiffForChip.data.branch : undefined;
  // 03p wsearch：chip 点击展开输入（query 提升共享给 WikiToolPanel；非 wiki 态点 chip 进 wiki）。
  const [wikiSearchOpen, setWikiSearchOpen] = useState(false);
  const [wikiSearchQuery, setWikiSearchQuery] = useState("");
  // 03x 文件搜索：chip 两态（面包屑 ↔ .wsearch 输入），query 提升共享给 FilesToolPanel。
  const [filesSearchOpen, setFilesSearchOpen] = useState(false);
  const [filesSearchQuery, setFilesSearchQuery] = useState("");
  // M5-a 浮层（03j/03l/03n/08）：row2 ＋ 新建实例、nav 标题 ▾ 项目切换、nav ⋯ 菜单会话历史、
  // 切换 sheet 内新建项目。
  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const [switchSheetOpen, setSwitchSheetOpen] = useState(false);
  const [historySheetOpen, setHistorySheetOpen] = useState(false);
  const createProjectDialog = useCreateProjectDialog();
  // 02c pill 长按/右键菜单（置顶/重命名/关闭）= useInstanceRowActions 单源装配（与
  // MobileFocusActions .acts 行同 hook）。
  const rowActions = useInstanceRowActions(closeInstance);
  const pillMenuItems = (entry: ProjectInstanceEntry): ActionMenuItem[] => {
    const a = rowActions.build(
      {
        kind: "session",
        projectName: entry.session.projectName,
        sessionId: entry.session.id,
      },
      entry.type,
    );
    return [
      ...(a.pin
        ? [{ label: a.pin.label, icon: <ShellIcon name="pin" />, onSelect: a.pin.run }]
        : []),
      {
        label: a.rename.label,
        icon: <ShellIcon name="edit" />,
        onSelect: () => a.rename.run(entry.session.displayName),
      },
      {
        label: a.close.label,
        icon: <ShellIcon name="close" />,
        onSelect: a.close.run,
        variant: "destructive" as const,
      },
    ];
  };
  // L3 nav 装配（03q/03r/03u/03t/03v/03s）。l3Route 优先；file/git focus 由保活层 ref 派生。
  const l3WikiMeta =
    l3Route?.kind === "wiki"
      ? (wikiIndex.data?.pages.find((p) => p.slug === l3Route.slug) ?? null)
      : null;
  const l3 = l3Route
    ? l3Route.kind === "history"
      ? {
          backLabel: t("git.toolTitle"),
          title: t("git.historyTitle"),
          onClick: () => l3BackTo("git"),
        }
      : l3Route.kind === "branches"
        ? {
            backLabel: t("git.toolTitle"),
            title: t("git.branchesTitle", { n: branchesForTitle.data?.branches.length ?? 0 }),
            onClick: () => l3BackTo("git"),
          }
        : l3Route.kind === "commit"
          ? {
              backLabel: t("git.historyTitle"),
              title: l3Route.hash.slice(0, 7),
              onClick: l3BackToHistory,
            }
          : {
              backLabel: l3WikiMeta
                ? l3WikiMeta.tags[0] || t("wiki.groupUngrouped")
                : t("wiki.groupUngrouped"),
              title: l3WikiPage.data?.frontmatter.title ?? l3Route.slug,
              onClick: () => l3BackTo("wiki"),
            }
    : null;

  // file/git focus（保活层 ref 派生，非 L3 路由）：back=来源层级、title=文件名、动作=删 tab 回浏览态。
  const l3Transient = (() => {
    if (l3Route || !effectiveFocusId || !closeTransientFocus) return undefined;
    if (focusRef?.kind === "file") {
      const { projectName: fp, path: relPath } = splitFilePath(focusRef.path);
      const lastSlash = relPath.lastIndexOf("/");
      // back = 完整父目录相对路径（03q 原型 `src/auth`；M10 用户反馈「路径位置显示不正确」——
      // 此前 .split("/").pop() 只取最后一段显示 auth）。根文件（无父目录）back = 项目名。
      const backLabel = lastSlash === -1 ? fp : relPath.slice(0, lastSlash);
      return {
        backLabel,
        title: relPath.split("/").pop() || focusRef.path,
        onClick: closeTransientFocus,
        actions: (
          <ActionMenu
            align="end"
            cancelLabel={t("cancel")}
            items={[
              {
                label: t("files.menuCopyPath"),
                icon: <ShellIcon name="edit" />,
                onSelect: () => {
                  void navigator.clipboard.writeText(focusRef.path);
                },
              },
              {
                label: t("files.menuViewDiff"),
                icon: <ShellIcon name="git-nav" />,
                onSelect: () => onOpenGitFile(fp, "worktree", relPath),
              },
            ]}
            trigger={
              <button
                aria-label={t("workbench.moreActions")}
                className="ic cursor-pointer"
                type="button"
              >
                <ShellIcon name="ellipsis" />
              </button>
            }
          />
        ),
      };
    }
    if (focusRef?.kind === "git" && focusRef.mode === "scope") {
      return {
        backLabel: t("git.toolTitle"),
        title: focusRef.path.split("/").pop() || focusRef.path,
        onClick: closeTransientFocus,
      };
    }
    return undefined;
  })();
  // 面板内 diff 的 L3 nav 形态（backLabel = 来源标签/文件名）：panelOpen 时最优先（diff 覆盖
  // 层在最上层）；面板 closed 不呈现（panelDiff 是面板内瞬态）。title = diff 文件名。
  const panelDiffL3 = panelDiff
    ? {
        backLabel:
          panelDiff.from === "git"
            ? t("git.toolTitle")
            : panelDiff.from === "files"
              ? t("workbench.tabFiles")
              : panelDiff.path.split("/").pop() || panelDiff.path,
        title: panelDiff.path.split("/").pop() || panelDiff.path,
        onClick: () => setPanelDiff(null),
      }
    : null;
  const headerL3 = (panelOpen && panelDiffL3) || l3 || l3Transient;

  // L3 深度页主体单源（l3Route 4 分支）：主体区（面板 closed，深链直达现状路径）与面板
  // l3Body（面板 open，03u「Git 检视」原型语义）共引本函数，避免双写漂移。
  const renderL3Body = (route: NonNullable<typeof l3Route>) => (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden" data-role="l3-page">
      {route.kind === "history" ? (
        <L3GitHistory
          onOpenCommit={(hash) => {
            void navigate({
              params: { key: scope.key, _splat: hash },
              search: { tab: "git" },
              to: "/projects/$key/git/commit/$",
            });
          }}
          projectName={scope.key}
        />
      ) : route.kind === "branches" ? (
        <L3GitBranches
          onOpenHistory={(b) => {
            void navigate({
              params: { key: scope.key },
              search: { branch: b, tab: "git" },
              to: "/projects/$key/git/history",
            });
          }}
          projectName={scope.key}
        />
      ) : route.kind === "commit" ? (
        <L3GitCommit hash={route.hash} projectName={scope.key} />
      ) : (
        <L3WikiReader
          onOpenPage={(slug) => {
            void navigate({
              params: { key: scope.key, _splat: slug },
              search: { tab: "wiki" },
              to: "/projects/$key/wiki/$",
            });
          }}
          projectName={scope.key}
          slug={route.slug}
        />
      )}
    </div>
  );
  // 面板内 L3 主体（InspectionPanel l3Body；面板 open 时才实际挂载）：l3Route 走单源；file/git
  // 一次性预览（l3Transient 对应内容）在面板 open 时也渲染进面板（03o「L3 是面板内深度页」），
  // 保活层对应 item 让位（见 renderItems.map 内 panelOpen 分支）保证单实例。l3Transient 分支
  // 同样包 data-role="l3-page"——覆盖层内内容根标记统一（探针/调试选择器单源）。
  const renderPanelL3Body = () => {
    if (l3Route) return renderL3Body(l3Route);
    if (panelDiff) {
      return (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden" data-role="l3-page">
          <MobileL3GitDiff path={panelDiff.path} projectName={scope.key} scope={panelDiff.scope} />
        </div>
      );
    }
    if (focusRef?.kind === "file") {
      const { projectName: fp, path: relPath } = splitFilePath(focusRef.path);
      return (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden" data-role="l3-page">
          <MobileL3FilePreview
            onViewDiff={() => onOpenGitFile(fp, "worktree", relPath)}
            path={relPath}
            projectName={fp}
          />
        </div>
      );
    }
    if (focusRef?.kind === "git" && focusRef.mode === "scope") {
      return (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden" data-role="l3-page">
          <MobileL3GitDiff
            path={focusRef.path}
            projectName={focusRef.projectName}
            scope={focusRef.scope}
          />
        </div>
      );
    }
    return null;
  };

  return (
    <>
      <div
        className="relative flex h-full min-h-0 flex-col pt-[var(--shell-safe-area-top)]"
        key={scope.key}
      >
        <MobileProjectHeader
          activeTabId={effectiveFocusId}
          create={create}
          focusActions={
            effectiveFocusId && focusRef?.kind === "session" ? (
              <MobileFocusActions
                closeInstance={closeInstance}
                focusId={effectiveFocusId}
                projectName={scope.key}
              />
            ) : undefined
          }
          focusedTerminal={focusedTerminal}
          instances={instances}
          onCreateInstance={() => setCreateSheetOpen(true)}
          pillMenuItems={pillMenuItems}
          moreMenu={
            <ActionMenu
              align="end"
              cancelLabel={t("cancel")}
              items={[
                // M10 用户反馈③：关实例收进 ⋯ 菜单（nav 右上回归原型 ℹ+⋯ 两图标）。
                ...(effectiveFocusId && focusRef?.kind === "session"
                  ? [
                      {
                        label: t("workbench.pillCloseSession"),
                        icon: <ShellIcon name="close" />,
                        onSelect: () =>
                          closeInstance(
                            focusRef.sessionId,
                            inferSessionTypeFromId(effectiveFocusId) ?? "terminal",
                          ),
                      },
                    ]
                  : []),
                {
                  label: t("workbench.menuHistory"),
                  icon: <ShellIcon name="restore" />,
                  onSelect: () => setHistorySheetOpen(true),
                },
              ]}
              trigger={
                <button
                  aria-label={t("workbench.moreActions")}
                  className="ic cursor-pointer"
                  type="button"
                >
                  <ShellIcon name="ellipsis" />
                </button>
              }
            />
          }
          onSwitchProjects={() => setSwitchSheetOpen(true)}
          onBack={() => {
            void navigate({ to: "/projects" });
          }}
          onSelectInstance={focusInstance}
          onSelectTab={(leafId, tabId) => {
            // skill pill 显式退工具：点当前已 focus 的 skill 时 focusId 不变导航无-op，
            // effect 兜不到，需显式退；点其他 pill 时 onSelectTab 的 focus 导航一次完成
            //（search 已无 tab 维度），不再连环双 push。
            if (activeTool && tabId === effectiveFocusId) {
              handleToolChange(null);
              return;
            }
            onSelectTab(leafId, tabId);
          }}
          onOpenPanel={openInspectionPanel}
          projectName={scope.key}
          skillTabs={skillTabs}
          l3={headerL3}
        />
        {/* 检视面板（v1.4 03o/03ob）：常驻挂载零销毁，开合 = translate/visibility。工具 chip
          槽/内容按激活标签装配（与退役前主体区工具态同源）；面板内 L3 = headerL3（back 回
          标签条 03u 语义）；closed 时 invisible 防误聚焦。 */}
        <InspectionPanel
          activeTabId={activePanelTabId}
          open={panelVisible}
          projectName={scope.key}
          tabs={panelTabs}
          onActivateTab={activatePanelTab}
          onCloseTab={closePanelTab}
          onNewTab={newPanelTab}
          onClose={handlePanelClose}
          l3={panelVisible ? headerL3 : undefined}
          l3Body={renderPanelL3Body()}
          fab={renderPanelFab()}
          toolChip={
            activePanelTab?.kind === "git" ? (
              <div className="gitchip">
                <b>
                  {chipBranch ? chipBranch.name : t("git.toolTitle")}
                  {chipBranch?.ahead || chipBranch?.behind
                    ? ` ${formatAheadBehind(chipBranch?.ahead, chipBranch?.behind)}`
                    : ""}
                </b>
                <span>{t("git.chipCounts", { worktree: chipWorktree, staged: chipStaged })}</span>
              </div>
            ) : activePanelTab?.kind === "files" ? (
              filesSearchOpen ? (
                // 03x ①「行2 内容头变搜索框（同 Wiki）」：单源复用 .wsearch（§6.9），
                // 聚焦态描边由 .wsearch:focus-within 承载（不再另立 .sfield 一套值）。
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
                <div className="crumb">
                  <b>{scope.key}</b>
                  {crumbSegments.map((seg, i) => (
                    <button
                      key={i}
                      onClick={() => setFilesPath(crumbSegments.slice(0, i + 1).join("/"))}
                      type="button"
                    >
                      {seg}
                    </button>
                  ))}
                  <button
                    className="flex cursor-pointer items-center gap-1 text-ink-2"
                    onClick={() => setFilesSearchOpen(true)}
                    type="button"
                    aria-label={t("files.searchPlaceholder")}
                  >
                    <ShellIcon className="h-[13px] w-[13px]" name="magnifyingglass" />
                  </button>
                </div>
              )
            ) : activePanelTab?.kind === "wiki" ? (
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
            ) : undefined
          }
        >
          {panelEverOpened ? renderPanelChildren() : null}
        </InspectionPanel>
        {/* 03y 新建 sheet + 03oa 上传 picker（面板 FAB 菜单装配；open = state 非空持有）。 */}
        {panelNewItemParentPath !== null ? (
          <NewItemSheet
            onOpenChange={(next) => {
              if (!next) setPanelNewItemParentPath(null);
            }}
            open
            parentPath={panelNewItemParentPath}
            projectName={scope.key}
            siblingNames={
              panelNewItemParentPath === filesPath
                ? (panelFilesEntries ?? []).map((e) => e.name)
                : []
            }
          />
        ) : null}
        <input
          className="hidden"
          multiple
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              enqueueUploads(scope.key, panelUploadTargetRef.current, Array.from(e.target.files));
            }
            e.target.value = "";
          }}
          ref={panelUploadInputRef}
          type="file"
        />
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* 保活面板层（2026-08-17 用户决策「全保活 + 聚焦过即可」；v2 M3-b 起工具态也保持
            hidden 挂载——进出检视面板不卸载 session 面板，WS 不断；v1.4 批2 起面板 open 时
            visible 判定再叠 !panelOpen——面板全屏覆盖，主体可见性由面板接管）。本会话「聚焦过」
            的已打开 tab 保持挂载，visible = tabId===effectiveFocusId 用 hidden class 切换。
            对齐桌面 WorkspaceTree 扁平化保活；刷新重进 layout 恢复 N tab 只挂载当前聚焦的
           （显式 ?session 或自动聚焦回退）。 */}
          {renderItems.map((item) => {
            if (item.tabId !== effectiveFocusId && !focusedTabIds.has(item.tabId)) return null;
            // 面板 open 时 file/git 一次性预览让位面板 l3Body 单实例渲染（03o「L3 是面板内
            // 深度页」）；session/skill 保活挂载不受影响——WS 生命周期不随面板开合重建。
            if (
              panelVisible &&
              (item.ref.kind === "file" || (item.ref.kind === "git" && item.ref.mode === "scope"))
            ) {
              return null;
            }
            return (
              <div
                className={
                  !panelVisible && !l3Route && item.tabId === effectiveFocusId
                    ? "flex min-h-0 flex-1 flex-col overflow-hidden"
                    : "hidden"
                }
                data-tab-id={item.tabId}
                key={item.tabId}
              >
                {/* D13 流顶引用卡：可见 session 面板顶部（wikiRefs atom 非空才渲染）。 */}
                {!panelVisible &&
                !l3Route &&
                item.tabId === effectiveFocusId &&
                item.ref.kind === "session" ? (
                  <MobileWikiRefBar projectName={scope.key} sessionId={item.ref.sessionId} />
                ) : null}
                {item.ref.kind === "file" ? (
                  (() => {
                    const { projectName: fp, path: relPath } = splitFilePath(item.ref.path);
                    return (
                      <MobileL3FilePreview
                        onViewDiff={() => onOpenGitFile(fp, "worktree", relPath)}
                        path={relPath}
                        projectName={fp}
                      />
                    );
                  })()
                ) : item.ref.kind === "git" && item.ref.mode === "scope" ? (
                  <MobileL3GitDiff
                    path={item.ref.path}
                    projectName={item.ref.projectName}
                    scope={item.ref.scope}
                  />
                ) : (
                  <PanelRouter panelRef={item.ref} />
                )}
              </div>
            );
          })}
          {/* M4 L3 深度页（显式子路由）：nav l3 形态 + L3 主体（renderL3Body 单源）；保活层
            hidden 保持挂载（WS 不断）。v1.4 批2：面板 open 时 L3 渲染进面板（InspectionPanel
            l3Body），主体区不重复渲染（深链直达面板 closed 的现状路径保留）。 */}
          {l3Route && !panelVisible ? renderL3Body(l3Route) : null}
          {/* 工具态主体已退役（v1.4 批2）：工具面板迁检视面板（InspectionPanel），?tab= 深链
            渲染期映射为面板 open+激活标签。 */}
          {/* 实例主体层（非面板态）：聚焦未入 layout（focus effect 同步前瞬态）或查询 pending
            （autoFocus 未定，避免空态卡与 pills 自相矛盾闪烁——reviewer M3-c #2）= 骨架承接；
            加载完且完全无可聚焦对象（无实例无 skill tab）= 03h 空态卡。面板 open 时主体被
            全屏覆盖，实例层照常挂载（保活）。 */}
          {!panelVisible ? (
            focusRef ? null : effectiveFocusId || isLoading ? (
              <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="px-3 py-2">
                  <CardGridSkeleton plain />
                </div>
              </div>
            ) : (
              <EmptyProjectState
                create={create}
                onBrowseTools={() => handleToolChange("files")}
                onCreateInstance={() => setCreateSheetOpen(true)}
              />
            )
          ) : null}
        </div>
      </div>
      {/* holders 提升到顶层（2026-08-17 修复）：聚焦态 ✕（closeInstance confirm）/ create prompt
        永不挂载 → 「点击无响应」。顶层常驻。 */}
      {closeHolder}
      {createPromptHolder}
      {/* 02c pill 菜单「重命名」的命名 prompt holder（useInstanceRowActions 内
        useRenameSession 自带，portal 渲染）。 */}
      {rowActions.renameHolder}
      {/* M5-a 浮层（portal 渲染，位置无谓，随 holders 常驻顶层）：03j 新建实例 / 03l 切换 /
        03n 历史 / 08 新建项目（03l newp 行入口）。 */}
      {createProjectDialog.dialog}
      <MobileCreateInstanceSheet
        create={create}
        onOpenChange={setCreateSheetOpen}
        open={createSheetOpen}
        projectName={scope.key}
      />
      <MobileProjectSwitchSheet
        currentSessionId={focusRef?.kind === "session" ? effectiveFocusId : undefined}
        onCreateProject={createProjectDialog.openCreate}
        onOpenChange={setSwitchSheetOpen}
        onSwitchProject={(name) => {
          void navigateWorkbench({ kind: "project", key: name });
        }}
        onSwitchSession={(name, sessionId) => {
          void navigateWorkbench({ kind: "project", key: name }, sessionId);
        }}
        open={switchSheetOpen}
      />
      <MobileSessionHistorySheet
        onFocusExisting={(sessionId) => {
          // 活跃态行：聚焦既有实例，不新建（P1 守卫，与切换 sheet 同语义）。
          void navigateWorkbench({ kind: "project", key: scope.key }, sessionId);
        }}
        onOpenChange={setHistorySheetOpen}
        open={historySheetOpen}
        projectName={scope.key}
      />
    </>
  );
}

/**
 * 流顶 wiki 引用卡（v2 M4，D13）：session focus 流顶显示该会话被注入的 wiki 页。数据源 =
 * 客户端 workbenchWikiRefsAtom（L3WikiReader 注入成功写入；纯客户端记忆，不依赖服务端）。
 * 每页一行 title + ✕ 移除（写 atom）。
 */
function MobileWikiRefBar({ projectName, sessionId }: { projectName: string; sessionId: string }) {
  const { t } = useT();
  const refs = useAtomValue(workbenchWikiRefsAtom);
  const setWikiRefs = useSetAtom(workbenchWikiRefsAtom);
  const perSession = refs[projectName]?.[sessionId] ?? [];
  if (perSession.length === 0) return null;
  return (
    <div className="wikiref" data-role="wiki-ref-bar">
      <div className="wr-t">{t("wiki.refCardTitle")}</div>
      {perSession.map((r) => (
        <div className="wr-r" key={r.slug}>
          <span className="flex-1 truncate">{r.title}</span>
          <button
            aria-label={t("wiki.refCardRemove")}
            className="x cursor-pointer"
            onClick={() =>
              setWikiRefs((prev) => {
                const perProject = prev[projectName] ?? {};
                const next = (perProject[sessionId] ?? []).filter((x) => x.slug !== r.slug);
                const nextProject = { ...perProject };
                if (next.length === 0) delete nextProject[sessionId];
                else nextProject[sessionId] = next;
                return { ...prev, [projectName]: nextProject };
              })
            }
            type="button"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

/**
 * 03h 空态卡（v2 M3-c，对标 docs/design/03h-workspace-empty.html）：项目无可聚焦实例时主体 =
 * .empty 卡（大图标容器 + 标题/副文 + CTA「新建 Agent」）+ 项目工具引导 link。CTA 与 row2 ＋
 * 同一入口（M5-a：03j 新建实例 sheet，编号②「主按钮 → 新建实例 sheet」）；
 * link 进 files 工具态（03h 编号③「工具是项目级，仍可用」）。
 */
function EmptyProjectState({
  create,
  onBrowseTools,
  onCreateInstance,
}: {
  create: CreateSessionApi;
  onBrowseTools: () => void;
  onCreateInstance: () => void;
}) {
  const { t } = useT();
  return (
    // 滚动容器：pb-safe-area 避让（项目 scope 无底部 nav，PWA standalone 下 main=100vh 延伸进
    // home indicator 区）；pt-60px = 原型 .empty margin-top。
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(16px,var(--shell-mobile-bottom-nav-space,0px))] pt-[60px]">
      <div className="empty-card rounded-xl border border-sep bg-elevated px-6 pb-8 pt-10 text-center">
        <div className="empty-big mx-auto mb-5 flex size-16 items-center justify-center rounded-xl bg-elevated2">
          <ShellIcon className="h-10 w-10 text-ink-3" name="terminal" />
        </div>
        <h2 className="mb-2 text-base font-semibold text-ink-1">{t("workbench.emptyTitle")}</h2>
        <p className="mb-[22px] text-[12.5px] text-ink-2">{t("workbench.emptyDesc")}</p>
        <button
          className="empty-cta mx-auto block h-10 w-[200px] cursor-pointer rounded-full bg-primary text-sm font-semibold text-on-primary transition active:opacity-80 disabled:cursor-default disabled:opacity-60"
          disabled={create.isCreating}
          onClick={onCreateInstance}
          type="button"
        >
          {t("workbench.emptyCta")}
        </button>
      </div>
      <button
        className="empty-link block w-full cursor-pointer pt-4 text-center text-[13px] text-primary"
        onClick={onBrowseTools}
        type="button"
      >
        {t("workbench.emptyBrowse")} ›
      </button>
    </div>
  );
}

/**
 * 实例行「置顶/重命名/关闭」动作装配单源（02c pill 长按菜单 + 03k info sheet .acts footer
 * 双消费；此前 MobileFocusActions 注释宣称同源实为双写，本 hook 收敛）。build(panelRef,
 * sessionType) 返回单行动作的 label+run（pin 仅 agent——dot 状态语言归属 agent，review P3⑦）；
 * 渲染形态与排序留给消费方（菜单项 vs button 行，两端原型各自定）。renameHolder 由调用方渲染
 *（两消费方各自持 useRenameSession 实例，与原双装配行为一致）。
 */
function useInstanceRowActions(
  closeInstance: (sessionId: string, type: "agent" | "terminal") => void,
) {
  const { t } = useT();
  const { pinned } = usePinnedSessions();
  const pinIt = usePinSession();
  const unpinIt = useUnpinSession();
  const renameSession = useRenameSession();
  return {
    renameHolder: renameSession.holder,
    build: (panelRef: SessionPanelRef, sessionType: "agent" | "terminal") => {
      const id = panelRef.sessionId;
      const pinnedNow = pinned.has(id);
      return {
        close: {
          label: t("workbench.pillCloseSession"),
          run: () => closeInstance(id, sessionType),
        },
        pin:
          sessionType === "agent"
            ? {
                label: pinnedNow ? t("workbench.unpin") : t("workbench.pin"),
                run: () => (pinnedNow ? unpinIt : pinIt).mutate(id),
              }
            : null,
        rename: {
          label: t("session.rename"),
          run: (displayName: string) =>
            void renameSession.rename(panelRef, sessionType, displayName),
        },
      };
    },
  };
}

/** 项目聚焦态 tab trailing：ℹ 图标（03 原型 nav 右上两图标之一；M10 用户反馈③：✕ 关实例已收进
 * ⋯ moreMenu）。info sheet 对齐 03k：.acts 操作行（重命名/置顶/关闭会话）由本组件装配为 footer
 *（useInstanceRowActions 单源装配；sheet 关闭由 info-sheet footer 委托）；displayName
 * 自取 detail（与装配层同 query key，React Query dedupe 零额外网络）。 */
function MobileFocusActions({
  closeInstance,
  focusId,
  projectName,
}: {
  closeInstance: (sessionId: string, type: "agent" | "terminal") => void;
  focusId: string;
  projectName: string;
}) {
  const { t } = useT();
  const sessionType = inferSessionTypeFromId(focusId);
  const panelRef: SessionPanelRef = { kind: "session", projectName, sessionId: focusId };
  const agentDetail = useAgentDetail(panelRef, sessionType === "agent");
  const terminalDetail = useTerminalDetail(panelRef, sessionType === "terminal");
  const displayName =
    agentDetail.data?.session.displayName ?? terminalDetail.data?.session.displayName ?? "";
  const rowActions = useInstanceRowActions(closeInstance);
  const a = rowActions.build(panelRef, sessionType ?? "terminal");
  const actClass = "cursor-pointer text-subhead font-semibold";
  const acts = (
    <div className="flex items-center justify-between border-t border-sep-row pb-1 pt-3.5">
      <button
        className={`${actClass} text-primary`}
        onClick={() => a.rename.run(displayName)}
        type="button"
      >
        {a.rename.label}
      </button>
      {a.pin ? (
        <button className={`${actClass} text-pin`} onClick={a.pin.run} type="button">
          {a.pin.label}
        </button>
      ) : null}
      <button className={`${actClass} text-error`} onClick={a.close.run} type="button">
        {a.close.label}
      </button>
    </div>
  );
  const {
    openInfo,
    holder: infoHolder,
    autoRetryEditorHolder,
    runtimeDialogHolder,
  } = useInstanceInfoActions(panelRef, sessionType, projectName, "sheet", acts);
  return (
    <>
      <button
        aria-label={t("session.instanceInfo.title")}
        className="ic cursor-pointer touch:h-9 touch:w-9"
        onClick={openInfo}
        type="button"
      >
        <ShellIcon name="info" />
      </button>
      {/* info sheet holder + rename prompt holder（useInstanceRowActions 自带，portal 渲染）。 */}
      {infoHolder}
      {rowActions.renameHolder}
      {autoRetryEditorHolder}
      {runtimeDialogHolder}
    </>
  );
}

/**
 * 移动端 chat 模式主体（§3.1）：header 内 mode tab（SessionModeTabs）+ ChatOverview
 *（搜索/新建/列表，桌面/移动同一实现）。点列表行 → /chat/$id 全屏聚焦态（独立路由）。
 */
function MobileChatOverview() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <MobilePageHeader title={<SessionModeTabs mode="chat" />} />
      <div className="min-h-0 flex-1">
        <ChatOverview />
      </div>
    </div>
  );
}

/**
 * 一级会话页 mode tab（§3.1，桌面左栏 PanelHeader title / 移动 header title 同一原语
 * ModeTabGroup）。切换 navigate 到 global 列表态 URL + `?mode=`（agent 省略 key = 默认）。
 *
 * 桌面/移动共用——provider-agnostic（只调 useWorkbenchNavigate + ModeTabGroup），桌面
 * WorkbenchRoute 左栏标题区与移动 MobilePageHeader title 同引本组件，避免双写漂移。
 */
export function SessionModeTabs({ mode }: { mode: WorkbenchMode }) {
  const { t } = useT();
  const navigateWorkbench = useWorkbenchNavigate();
  const onModeChange = (next: WorkbenchMode) => {
    void navigateWorkbench({ kind: "global" }, undefined, {
      ...(next !== "agent" && { mode: next }),
    });
  };
  return (
    <ModeTabGroup
      ariaLabel={t("workbench.modeAria")}
      onChange={onModeChange}
      options={[
        { value: "agent", label: t("workbench.modeAgent") },
        { value: "chat", label: t("workbench.modeChat") },
      ]}
      value={mode}
    />
  );
}

/**
 * 移动 [文件] 全局总览（设计 workbench-stable-refactor review 收口）：`/files`（scope=global +
 * leftMode="files"，无 focus）在移动端渲染此组件——外壳 MobilePageHeader 标题（与 MobileGlobalOverview
 * 同款范式）+ 主体 GlobalFilesOverview（全局根目录浏览文件树，与桌面左栏同源）。收口 `/files`
 * 进 workbench layout 后，移动无 focus 分支会落到 MobileGlobalOverview（项目列表），故在此按
 * `global + leftMode==="files"` 单独分流，避免行为丢失。点文件 navigate `/files/file/$`（与原
 * FilesRoute 移动 onOpenFile 一致，迁移过来）。
 */
function MobileFilesOverview() {
  const { t } = useT();
  const navigate = useNavigate();
  // 全局文件树 cwd（localStorage 记忆，路径 = `${projectName}/${relative}`，空串 = 根目录）：
  // 后台被杀/重开停留在上次目录。路径不存在回退由 FilesPanel 侧查 files error 处理。
  const [globalFilesPath, setGlobalFilesPath] = useAtom(workbenchMobileGlobalFilesPathAtom);
  // 10-tab ④ h1 行右端 ＋ = 03oa 添加菜单：项目层语境才可写（服务器根目录不可写——
  // Project-safe resolver 无项目名）。cwd 前缀 = 项目名，拆出 projectName + 相对目录。
  const [overviewAddPath, setOverviewAddPath] = useState<string | null>(null);
  const overviewUploadInputRef = useRef<HTMLInputElement>(null);
  const overviewUploadTargetRef = useRef("");
  const slash = globalFilesPath.indexOf("/");
  const overviewProject =
    slash === -1
      ? globalFilesPath.length > 0
        ? globalFilesPath
        : ""
      : globalFilesPath.slice(0, slash);
  const overviewDir = slash === -1 ? "" : globalFilesPath.slice(slash + 1);
  const overviewWritable = overviewProject.length > 0;
  const onOpenFile = (projectName: string, path: string) => {
    void navigate({
      to: "/files/file/$",
      params: { _splat: `${projectName}/${path}` },
    });
  };
  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Large title 行（LargeTitleRow 单源；M10 用户反馈⑥：紧凑 MobilePageHeader 换
          Large title，与项目/插件 Tab 同款页头） */}
      <LargeTitleRow
        actions={
          <AddMenu
            onNew={() => {
              if (overviewWritable) setOverviewAddPath(overviewDir);
            }}
            onUpload={() => {
              if (!overviewWritable) return;
              overviewUploadTargetRef.current = overviewDir;
              overviewUploadInputRef.current?.click();
            }}
            trigger={
              <button
                aria-label={t("files.add")}
                className={`ic cursor-pointer ${overviewWritable ? "" : "pointer-events-none opacity-40"} flex size-9 items-center justify-center`}
                type="button"
              >
                <ShellIcon name="plus" />
              </button>
            }
          />
        }
        title={t("nav.files")}
      />
      <div className="flex min-h-0 flex-1 flex-col">
        <GlobalFilesOverview
          currentPath={globalFilesPath}
          onPathChange={setGlobalFilesPath}
          onOpenFile={onOpenFile}
        />
      </div>
      {overviewAddPath !== null ? (
        <NewItemSheet
          onOpenChange={(next) => {
            if (!next) setOverviewAddPath(null);
          }}
          open
          parentPath={overviewAddPath}
          projectName={overviewProject}
          siblingNames={[]}
        />
      ) : null}
      <input
        className="hidden"
        multiple
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            enqueueUploads(
              overviewProject,
              overviewUploadTargetRef.current,
              Array.from(e.target.files),
            );
          }
          e.target.value = "";
        }}
        ref={overviewUploadInputRef}
        type="file"
      />
    </div>
  );
}
