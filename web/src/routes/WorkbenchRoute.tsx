import { useParams, useSearch, useNavigate } from "@tanstack/react-router";
import { useAtom } from "jotai";
import { type PointerEvent, useCallback, useEffect, useState } from "react";
import {
  type DragSourceAdapter,
  InstanceArea,
  InstanceLeftOverview,
  useCloseSession,
  useCreateSession,
  useGlobalInstanceCandidates,
  useProjectInstances,
  useRenameSession,
  useScopeInstanceOrder,
} from "../components/workbench/instance-area";
import { GlobalProjectsOverview } from "../components/workbench/global-projects-overview";
import { MobileWorkbench } from "../components/workbench/mobile-workbench";
import { type PluginContext } from "../components/workbench/right-panel-plugin";
import { RightPanelTabs } from "../components/workbench/right-panel-tabs";
import { ActivityBar } from "../components/shell/activity-bar";
import { WorkbenchShell } from "../components/shell/workbench-shell";
import { ShellLayout } from "../components/shell/shell-layout";
import { MobilePrimaryNav } from "../components/shell/mobile-primary-nav";
import { ProjectLeftPanel } from "../components/workbench/project-left-panel";
import { FilesLeftPanel } from "../components/files/files-left-panel";
import { FilesPanel } from "../components/files/file-browser";
import { useT } from "../i18n";
import {
  type DropZone,
  type WorkbenchMiddleTab,
  type WorkbenchPanelRef,
  type WorkbenchRightTab,
  type WorkbenchScope,
  type WorkbenchView,
  activeTabRefLeaf,
  collectLeaves,
  dropIntoLeaf,
  ensureTabOpenLeaf,
  findLeafBySessionId,
  inferSessionTypeFromId,
  parseFileTabId,
  removeTabFromLeaf,
  resizeSplitChildren,
  setActiveTabInLeaf,
  toggleLeafMaximize,
  useIsDesktopViewport,
  useWorkbenchLayout,
  useWorkbenchNavigate,
  workbenchMiddleLeftWidthAtom,
  workbenchMiddleTabAtom,
  workbenchNavAtom,
  workbenchRightCollapsedAtom,
  workbenchViewAtom,
} from "./workbench-model";

/**
 * 工作台路由（设计文档 §7）。路由树以中栏语义命名（去 `/workbench` 前缀）：project
 * 作用域 `/projects/$key`（+ `/session/$id` 聚焦），global 作用域 `/projects`（+
 * `/session/$id` 聚焦）。四个薄壳各自从路由段构造**已解析**的 WorkbenchScope，复用同一
 * WorkbenchContent。同一 URL 桌面（三栏）/ 移动（线性退化）响应式渲染，无跨端 redirect。
 */
export function ProjectScopeRoute() {
  const { key } = useParams({ from: "/projects/$key" });
  const { rightTab, view, tab } = useSearch({ from: "/projects/$key" });
  return (
    <WorkbenchContent rightTab={rightTab} scope={{ kind: "project", key }} tab={tab} view={view} />
  );
}

export function ProjectFocusRoute() {
  const { key, id } = useParams({ from: "/projects/$key/session/$id" });
  const { rightTab, view, tab } = useSearch({ from: "/projects/$key/session/$id" });
  return (
    <WorkbenchContent
      focusId={id}
      rightTab={rightTab}
      scope={{ kind: "project", key }}
      tab={tab}
      view={view}
    />
  );
}

/**
 * file tab focus 路由 /projects/$key/file/$（splat，设计 §6 决策 2）。_splat 捕获多段文件相对
 * 路径（如 src/index.ts）；decodeURIComponent 处理可能的编码字符。focusId 用 `file_${path}` 编码
 *（与 tabIdOf 一致，WorkbenchContent focus effect 据此 ensureTabOpenLeaf + setActiveTab）。
 */
export function ProjectFileFocusRoute() {
  const { key, _splat } = useParams({ from: "/projects/$key/file/$" });
  const { rightTab, view, tab } = useSearch({ from: "/projects/$key/file/$" });
  const path = _splat ? decodeURIComponent(_splat) : "";
  const focusId = path ? `file_${path}` : undefined;
  return (
    <WorkbenchContent
      focusId={focusId}
      rightTab={rightTab}
      scope={{ kind: "project", key }}
      tab={tab}
      view={view}
    />
  );
}

export function GlobalScopeContent({
  rightTab,
  tab,
  view,
}: {
  rightTab?: WorkbenchRightTab;
  tab?: WorkbenchMiddleTab;
  view?: WorkbenchView;
}) {
  return <WorkbenchContent rightTab={rightTab} scope={{ kind: "global" }} tab={tab} view={view} />;
}

export function GlobalScopeRoute() {
  const { rightTab, view, tab } = useSearch({ from: "/projects" });
  return <GlobalScopeContent rightTab={rightTab} tab={tab} view={view} />;
}

export function GlobalFocusRoute() {
  const { id } = useParams({ from: "/projects/session/$id" });
  const { rightTab, view, tab } = useSearch({ from: "/projects/session/$id" });
  return (
    <WorkbenchContent
      focusId={id}
      rightTab={rightTab}
      scope={{ kind: "global" }}
      tab={tab}
      view={view}
    />
  );
}

/**
 * 移动 [文件] 一级入口路由 `/files`（设计 §6 决策 24）：视口分流——移动（<lg）渲染
 * rootBrowse FilesPanel（根目录浏览 + 预览浮窗，复用现状移动 Files 做法，决策 12），
 * 包 ShellLayout + MobilePrimaryNav 提供底部胶囊避让与 safe-area；
 * 桌面（≥lg）渲染 global 工作台（桌面 [文件] 经活动栏 nav=files，不需独立 `/files` 路由，
 * 桌面直接访问 `/files` 回到工作台由活动栏切入）。useIsDesktopViewport 客户端首 render
 * 即真实视口，移动端无闪屏。由 router.tsx filesRoute lazy 挂载。
 */
export function FilesRoute() {
  const isDesktop = useIsDesktopViewport();
  if (isDesktop) return <GlobalScopeContent />;
  return (
    <ShellLayout bottomNavigation={<MobilePrimaryNav />} variant="home">
      <FilesPanel initialPath="" enablePreview queryScope="files-nav-mobile" rootBrowse />
    </ShellLayout>
  );
}

/**
 * 应用入口路由 `/`（设计文档 §11）：viewport 分流——桌面（≥lg）与移动（<lg）统一渲染
 * global scope 工作台（[项目] 总览，scope kind=global）。两端 `/` 同语义：桌面 =
 * ProjectLeftPanel + InstanceLeftOverview 三栏工作台；移动 = MobileWorkbench →
 * MobileGlobalOverview [项目] 总览（实例聚合 + 项目分组进项目 + header 新建，设计 §5）。
 * useIsDesktopViewport 客户端首 render 即真实视口，移动端无闪屏。由 router.tsx indexRoute lazy 挂载。
 */
export function IndexRoute() {
  const { rightTab, view, tab } = useSearch({ from: "/" });
  return <GlobalScopeContent rightTab={rightTab} tab={tab} view={view} />;
}

function WorkbenchContent({
  focusId,
  rightTab,
  scope,
  view: viewFromUrl,
  tab: tabFromUrl,
}: {
  focusId?: string;
  rightTab?: WorkbenchRightTab;
  scope: WorkbenchScope;
  view?: WorkbenchView;
  tab?: WorkbenchMiddleTab;
}) {
  const { t } = useT();
  const isDesktop = useIsDesktopViewport();
  const navigateWorkbench = useWorkbenchNavigate();
  const navigate = useNavigate();
  const [nav] = useAtom(workbenchNavAtom);
  // project scope 左栏 header 返回入口（回 /projects 全局项目列表）。
  const backToProjects = () => void navigate({ to: "/projects" });
  const [rememberedView, setRememberedView] = useAtom(workbenchViewAtom);
  const [rememberedMiddleTab, setRememberedMiddleTab] = useAtom(workbenchMiddleTabAtom);
  // 右栏折叠态与 WorkbenchShell 内 useAtom 共享同一 atom（Jotai 全局）—— 本组件写入（effect
  // + 下方 gate），Shell 读到新值重渲染。无需受控 props 传递。
  const [rightCollapsed, setRightCollapsed] = useAtom(workbenchRightCollapsedAtom);
  const view = viewFromUrl ?? rememberedView;
  const tab = tabFromUrl ?? rememberedMiddleTab;
  const ctx: PluginContext = {
    projectKey: scope.kind === "project" ? scope.key : null,
    focusId,
    sessionType: focusId ? inferSessionTypeFromId(focusId) : undefined,
  };
  // 三个 navigate 都传完整 { view, tab, rightTab }（URL 原始值 viewFromUrl/tabFromUrl/
  // rightTab 合并 + 新值）。TanStack Router navigate 整体替换 search 对象（非 merge），
  // 若只传单键会丢失其他维 —— 违反设计 §13「view/tab/rightTab 正交」。用 URL 原始值
  //（而非 view/tab 解析值）合并，避免把 atom 回退值意外写进 URL。
  const onRightTabChange = (rightTabNext: WorkbenchRightTab) => {
    void navigateWorkbench(scope, focusId, {
      rightTab: rightTabNext,
      tab: tabFromUrl,
      view: viewFromUrl,
    });
  };
  const onViewChange = (next: WorkbenchView) => {
    setRememberedView(next);
    void navigateWorkbench(scope, focusId, { rightTab, tab: tabFromUrl, view: next });
  };
  const onTabChange = (next: WorkbenchMiddleTab) => {
    setRememberedMiddleTab(next);
    void navigateWorkbench(scope, focusId, { rightTab, tab: next, view: viewFromUrl });
  };
  // 右栏可见性跟随 focusId：聚焦态自动展开（看聚焦实例 inspection），非聚焦态默认收起。
  // 仅桌面端写入：移动端 MobileWorkbench 不读 rightCollapsed atom。
  useEffect(() => {
    if (!isDesktop) return;
    setRightCollapsed(!focusId);
  }, [focusId, isDesktop, setRightCollapsed]);

  // Phase 2a 左栏宽度归并一次性迁移：workbenchLeftWidth → workbenchMiddleLeftWidth。
  // 仅在目标 key 缺失（用户未调过新 key）且源 key 存在时迁移，保用户已调左栏宽度不丢。
  // 用 setMiddleLeftWidth 写 atom（同步更新 state + localStorage + 本次会话即生效，
  // WorkbenchShell 读到新值重渲染），而非裸 setItem（atom 已在首 render 用默认 16rem 初始化）。
  const [, setMiddleLeftWidth] = useAtom(workbenchMiddleLeftWidthAtom);
  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    if (localStorage.getItem("workbenchMiddleLeftWidth")) return;
    const legacy = localStorage.getItem("workbenchLeftWidth");
    if (!legacy) return;
    try {
      const value = Number(JSON.parse(legacy));
      if (Number.isFinite(value)) setMiddleLeftWidth(value);
    } catch {
      /* 旧值非合法 JSON 数值，忽略 → 保持默认 16rem */
    }
  }, [setMiddleLeftWidth]);

  // ── Phase 2a：原 InstanceArea 共享 state 提升到 WorkbenchContent（方案 X）──────────
  // 左总览（InstanceLeftOverview，拖放源）+ 右工作区（InstanceArea，拖放目标）互补消费，
  // 共享 state 单一来源在此。holders（close/rename/create prompt）由本组件 return 渲染。
  const { close, holder: closeHolder } = useCloseSession();
  const { rename, holder: renameHolder } = useRenameSession();
  const [layout, update] = useWorkbenchLayout(scope);
  const { candidates } = useGlobalInstanceCandidates(scope);
  const create = useCreateSession(ctx.projectKey);
  const projectInstances = useProjectInstances(ctx.projectKey);
  const scopeKey = scope.kind === "project" ? scope.key : "global";
  const { refs, isLoaded: refsLoaded } = useScopeInstanceOrder(scope);

  // focus → 活动 leaf tab（设计 §7.1/§13）：URL focusId 变化时确保 focusId 在某 leaf 的 tab 中。
  // file focus（focusId 形如 file_src/index.ts）与 session focus 分流：file ref 直接从 tabIdOf
  // 逆解析 path（scope.projectName 必为 project scope —— global file focus 本 phase 不 deep-link）。
  useEffect(() => {
    if (!focusId) return;
    update((prev) => {
      const found = findLeafBySessionId(prev, focusId);
      if (found) return setActiveTabInLeaf(prev, found.leafId, focusId);
      const filePath = parseFileTabId(focusId);
      if (filePath !== null) {
        if (scope.kind !== "project") return prev;
        return ensureTabOpenLeaf(prev, { kind: "file", projectName: scope.key, path: filePath });
      }
      const projectName =
        scope.kind === "project"
          ? scope.key
          : (refs.find((r) => r.sessionId === focusId)?.projectName ?? null);
      if (!projectName) return prev;
      return ensureTabOpenLeaf(prev, { kind: "session", projectName, sessionId: focusId });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, scopeKey, refs.length]);

  // stale-tab prune（设计 §7.1）：kill session 后该 session 的 tab 不会自动从 layout 消失。
  // refsLoaded gate 防刷新后 refs 还空把全部持久化 tab 误判 stale 清光。
  useEffect(() => {
    if (layout.root === null) return;
    if (!refsLoaded) return;
    const activeIds = new Set(refs.map((r) => r.sessionId));
    const stale: { leafId: string; tabId: string }[] = [];
    for (const leaf of collectLeaves(layout.root)) {
      for (const t of leaf.tabs) {
        // file tab 不参与 stale prune（刷新保留，设计 §6 决策 19）；session tab 用 sessionId 判定。
        if (t.kind === "file") continue;
        if (!activeIds.has(t.sessionId)) stale.push({ leafId: leaf.id, tabId: t.sessionId });
      }
    }
    if (stale.length === 0) return;
    let next = layout;
    for (const { leafId, tabId } of stale) {
      next = removeTabFromLeaf(next, leafId, tabId);
    }
    if (next === layout) return;
    update(() => next);
    if (focusId && stale.some((s) => s.tabId === focusId)) {
      const active = activeTabRefLeaf(next);
      if (active?.kind === "session") void navigateWorkbench(scope, active.sessionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, focusId, layout, refs, refsLoaded]);

  // grid/table 回调用 projectName 解析：global scope 从 candidates 查（与 InstanceLeftOverview
  // 同源），project scope = scope.key。
  const resolveProjectName = (sessionId: string): string =>
    scope.kind === "project"
      ? scope.key
      : (candidates.find((c) => c.ref.sessionId === sessionId)?.ref.projectName ?? "");
  const focusPanel = useCallback(
    (ref: WorkbenchPanelRef) => {
      // file tab 的 focus 由 Step 7 file 路由处理；此处只处理 session tab。
      if (ref.kind !== "session") return;
      if (ref.sessionId === focusId) return;
      void navigateWorkbench(scope, ref.sessionId);
    },
    [focusId, navigateWorkbench, scope],
  );
  const focusInstance = useCallback(
    (sessionId: string) => {
      const projectName = resolveProjectName(sessionId);
      if (!projectName) return;
      focusPanel({ kind: "session", projectName, sessionId });
    },
    // resolveProjectName 闭包依赖 scope/candidates，已被 deps 覆盖。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scope, candidates, focusPanel],
  );
  const closeInstance = useCallback(
    (sessionId: string, type: "agent" | "terminal") => {
      const projectName = resolveProjectName(sessionId);
      if (!projectName) return;
      void close({ kind: "session", projectName, sessionId }, type);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scope, candidates, close],
  );
  const renameInstance = useCallback(
    (sessionId: string, type: "agent" | "terminal", currentName: string, projectName: string) => {
      if (!projectName) return;
      void rename({ kind: "session", projectName, sessionId }, type, currentName);
    },
    [rename],
  );

  const onToggleMaximize = useCallback(
    (groupId: string) => {
      update((prev) => toggleLeafMaximize(prev, groupId));
    },
    [update],
  );
  const onResizeSplit = useCallback(
    (splitId: string, leftChildId: string, rightChildId: string, deltaFlex: number) => {
      update((prev) => resizeSplitChildren(prev, splitId, leftChildId, rightChildId, deltaFlex));
    },
    [update],
  );
  // file tab focus URL = /projects/$key/file/$ splat（设计 §6 决策 2）。path 进 URL path 段（/ 分层，
  // 非 %2F 编码），与 tabIdOf 的 `file_${path}` 一致。global file focus 本 phase 不 deep-link。
  // search 传 URL 原始值（rightTab/tab/view，与 navigateWorkbench 同模式，避免把 atom 回退值写进 URL）。
  const navigateToFile = useCallback(
    (projectName: string, path: string) => {
      if (scope.kind !== "project") return;
      void navigate({
        to: "/projects/$key/file/$",
        params: { key: scope.key, _splat: path },
        search: { rightTab, tab: tabFromUrl, view: viewFromUrl },
      });
    },
    [navigate, scope, rightTab, tabFromUrl, viewFromUrl],
  );
  // 左栏文件树点文件 → 中栏开/激活 file tab + focus 到该文件（设计 §6 决策 16）。复用已测纯函数
  // ensureTabOpenLeaf（已在→激活 / 不在→加到活动 leaf / 无活动→新建首 leaf 三态，file ref 成立）。
  const onOpenFile = useCallback(
    (projectName: string, path: string) => {
      update((prev) => ensureTabOpenLeaf(prev, { kind: "file", projectName, path }));
      void navigateToFile(projectName, path);
    },
    [update, navigateToFile],
  );
  // tab ✕ = 最小化（设计 §7.2）：removeTabFromLeaf 从 leaf 移除 tab，session 存活；file tab
  // 移除（file 无生命周期，✕ 即从布局消失）。focusId 被关后回退到新 active tab 的 focus URL。
  const onCloseTab = useCallback(
    (groupId: string, tabId: string) => {
      const next = removeTabFromLeaf(layout, groupId, tabId);
      update(() => next);
      if (focusId === tabId) {
        const active = activeTabRefLeaf(next);
        if (active?.kind === "session") void navigateWorkbench(scope, active.sessionId);
        else if (active?.kind === "file") void navigateToFile(active.projectName, active.path);
      }
    },
    [layout, update, focusId, navigateWorkbench, navigateToFile, scope],
  );
  const onSelectTab = useCallback(
    (groupId: string, tabId: string) => {
      update((prev) => setActiveTabInLeaf(prev, groupId, tabId));
      // file tab 的 focus URL 走 /file/$ splat（navigateToFile）；session tab 走 navigateWorkbench。
      if (tabId === focusId) return;
      const filePath = parseFileTabId(tabId);
      if (filePath !== null) {
        if (scope.kind === "project") void navigateToFile(scope.key, filePath);
        return;
      }
      void navigateWorkbench(scope, tabId);
    },
    [update, focusId, navigateWorkbench, navigateToFile, scope],
  );

  // ── Phase B 拖放分屏（设计 §7.2/§7.4）──────────────────────────────────────────
  // dragState = 拖动源 ref + 起始/当前 pointer；activeZone = elementFromPoint hit-test 结果。
  // 源（InstanceLeftOverview 卡片 + InstanceArea tab）共享 onCardDragStart 单一实例；目标
  //（InstanceArea DropZoneOverlay）消费 activeZone/onDrop/cancelDrag。
  const [dragState, setDragState] = useState<{
    ref: WorkbenchPanelRef;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);
  const [activeZone, setActiveZone] = useState<{
    targetGroupId: string | null;
    zone: DropZone;
  } | null>(null);
  const draggingRef = dragState?.ref ?? null;
  const onDrop = useCallback(() => {
    const drag = dragState;
    const zone = activeZone;
    setDragState(null);
    setActiveZone(null);
    if (!drag || !zone) return;
    const prev = layout;
    const next = dropIntoLeaf(prev, drag.ref, zone.targetGroupId, zone.zone);
    if (next === prev) return;
    update(() => next);
    if (drag.ref.kind === "session") void navigateWorkbench(scope, drag.ref.sessionId);
  }, [dragState, activeZone, layout, update, navigateWorkbench, scope]);
  const cancelDrag = useCallback(() => {
    setDragState(null);
    setActiveZone(null);
  }, []);
  const onCardDragStart = useCallback(
    (ref: WorkbenchPanelRef, event: PointerEvent<HTMLDivElement>) => {
      setDragState({
        ref,
        startX: event.clientX,
        startY: event.clientY,
        currentX: event.clientX,
        currentY: event.clientY,
      });
      setActiveZone(null);
    },
    [],
  );
  const onSetDragPointer = useCallback((x: number, y: number) => {
    setDragState((prev) => (prev ? { ...prev, currentX: x, currentY: y } : prev));
  }, []);
  // 左总览拖放源适配器（onSelect = 单击激活 = focusInstance）。
  const dragAdapter: DragSourceAdapter = {
    onDragStart: onCardDragStart,
    onSelect: focusInstance,
  };

  if (!isDesktop) {
    return <MobileWorkbench focusId={focusId} scope={scope} />;
  }
  // project 可唤出右栏（inspection 只依赖 projectKey，非聚焦态唤出看 files/git）；
  // global scope 不唤出右栏（全局 inspection 走中栏 files tab，见 workbench-views §4.1）。
  // 收起态 rightPanel=null（aside 不渲染、零 query），由 RailButton 唤出。
  const rightPanelCollapsible = scope.kind === "project";
  const rightPanel =
    rightPanelCollapsible && !rightCollapsed ? (
      <RightPanelTabs activeTab={rightTab} ctx={ctx} onTabChange={onRightTabChange} />
    ) : null;
  // 活动栏切左栏内容：nav=projects → ProjectLeftPanel（scope 切换 + 新建项目 + InstanceLeftOverview
  // 实例总览；project scope 左栏顶部 middle tab 切主体）；nav=files → FilesLeftPanel（固定全局
  // rootBrowse 根目录，Phase 3 决策 26③：不论 WorkbenchScope 都显全局根目录，与 middle tab [文件]
  // 项目局部文件作用域互斥）。nav=settings 跳 SettingsRoute 不进工作台，此处无需分支。
  // 左总览：global scope → 共享 GlobalProjectsOverview（桌面/移动同一实现，批 F / 决策 29）；
  // project scope → InstanceLeftOverview（CreateSessionBar + 本项目实例总览）。
  const leftOverview =
    scope.kind === "global" ? (
      <GlobalProjectsOverview
        dragAdapter={dragAdapter}
        onFocusInstance={focusInstance}
        onViewChange={onViewChange}
        view={view}
      />
    ) : (
      <InstanceLeftOverview
        create={create}
        ctx={ctx}
        dragAdapter={dragAdapter}
        onCloseInstance={closeInstance}
        onFocusInstance={focusInstance}
        onRenameInstance={renameInstance}
        onViewChange={onViewChange}
        projectInstances={projectInstances}
        scope={scope}
        view={view}
      />
    );
  const leftPanel =
    nav === "files" ? (
      <FilesLeftPanel onOpenFile={onOpenFile} scope={{ kind: "global" }} />
    ) : (
      <ProjectLeftPanel
        focusId={focusId}
        onOpenFile={onOpenFile}
        onTabChange={onTabChange}
        overview={leftOverview}
        scope={scope}
        tab={tab}
      />
    );
  return (
    <WorkbenchShell
      activityBar={<ActivityBar />}
      leftPanel={leftPanel}
      leftPanelTitle={
        scope.kind === "project" ? (
          <ProjectScopeHeaderTitle onBack={backToProjects} projectName={scope.key} />
        ) : nav === "files" ? (
          t("nav.files")
        ) : (
          t("nav.projects")
        )
      }
      rightPanel={rightPanel}
      rightPanelCollapsible={rightPanelCollapsible}
    >
      <InstanceArea
        activeZone={activeZone}
        cancelDrag={cancelDrag}
        closeInstance={closeInstance}
        create={create}
        draggingRef={draggingRef}
        dragState={dragState}
        layout={layout}
        onCardDragStart={onCardDragStart}
        onCloseTab={onCloseTab}
        onDrop={onDrop}
        onResizeSplit={onResizeSplit}
        onSelectTab={onSelectTab}
        onSetDragPointer={onSetDragPointer}
        onToggleMaximize={onToggleMaximize}
        projectName={ctx.projectKey}
        refsCount={refs.length}
        setActiveZone={setActiveZone}
      />
      {closeHolder}
      {renameHolder}
      {create.promptHolder}
    </WorkbenchShell>
  );
}

/**
 * project scope 左栏 header title 节点（设计 workbench-layout-fix.md 阶段 1）：
 * 返回箭头（回 /projects 全局项目列表）+ 当前项目名 truncate。置于 PanelHeader 的 flex
 * title 容器（button shrink-0 + 项目名 min-w-0 truncate），对齐全局项目 header 的
 * 「标题 + 主体」结构；与右侧折叠 chevron 区分（左=导航返回，右=收起左栏）。
 */
function ProjectScopeHeaderTitle({
  onBack,
  projectName,
}: {
  onBack: () => void;
  projectName: string;
}) {
  const { t } = useT();
  return (
    <>
      <button
        aria-label={t("workbench.backToProjects")}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-on-surface-muted transition hover:bg-on-surface/5 hover:text-on-surface-soft"
        onClick={onBack}
        type="button"
      >
        <svg aria-hidden="true" className="size-4" fill="none" viewBox="0 0 24 24">
          <path
            d="M15 18l-6-6 6-6"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
          />
        </svg>
      </button>
      <span className="min-w-0 truncate">{projectName}</span>
    </>
  );
}
