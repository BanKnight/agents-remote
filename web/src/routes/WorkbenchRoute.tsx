import { useParams, useSearch } from "@tanstack/react-router";
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
import { useT } from "../i18n";
import { MobileWorkbench } from "../components/workbench/mobile-workbench";
import { type PluginContext } from "../components/workbench/right-panel-plugin";
import { RightPanelTabs } from "../components/workbench/right-panel-tabs";
import { ActivityBar } from "../components/shell/activity-bar";
import { WorkbenchShell } from "../components/shell/workbench-shell";
import { ProjectLeftPanel } from "../components/workbench/project-left-panel";
import { HomeRoute } from "./HomeRoute";
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
 * 作用域 `/projects/$key`（+ `/session/$id` 聚焦），global 作用域 `/global`（+
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
  const { rightTab, view, tab } = useSearch({ from: "/global" });
  return <GlobalScopeContent rightTab={rightTab} tab={tab} view={view} />;
}

export function GlobalFocusRoute() {
  const { id } = useParams({ from: "/global/session/$id" });
  const { rightTab, view, tab } = useSearch({ from: "/global/session/$id" });
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
 * 应用入口路由 `/`（设计文档 §11）：viewport 分流——桌面（≥lg）渲染 global scope
 * 工作台（IDE 化常驻，对齐 workbench-redesign.md §1），移动（<lg）渲染项目列表（HomeRoute）。
 * useIsDesktopViewport 客户端首 render 即真实视口，移动端无闪屏。由 router.tsx indexRoute lazy 挂载。
 */
export function IndexRoute() {
  const { rightTab, view, tab } = useSearch({ from: "/" });
  const isDesktop = useIsDesktopViewport();
  if (!isDesktop) return <HomeRoute />;
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
  const isDesktop = useIsDesktopViewport();
  const navigateWorkbench = useWorkbenchNavigate();
  const { t } = useT();
  const [nav] = useAtom(workbenchNavAtom);
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
  const { candidates, isLoaded: candidatesLoaded } = useGlobalInstanceCandidates(scope);
  const create = useCreateSession(ctx.projectKey);
  const projectInstances = useProjectInstances(ctx.projectKey);
  const scopeKey = scope.kind === "project" ? scope.key : "global";
  const { refs, isLoaded: refsLoaded } = useScopeInstanceOrder(scope);

  // focus → 活动 leaf tab（设计 §7.1/§13）：URL focusId 变化时确保 focusId 在某 leaf 的 tab 中。
  useEffect(() => {
    if (!focusId) return;
    update((prev) => {
      const found = findLeafBySessionId(prev, focusId);
      if (found) return setActiveTabInLeaf(prev, found.leafId, focusId);
      const projectName =
        scope.kind === "project"
          ? scope.key
          : (refs.find((r) => r.sessionId === focusId)?.projectName ?? null);
      if (!projectName) return prev;
      return ensureTabOpenLeaf(prev, { projectName, sessionId: focusId });
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
      void navigateWorkbench(scope, activeTabRefLeaf(next)?.sessionId);
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
      if (ref.sessionId === focusId) return;
      void navigateWorkbench(scope, ref.sessionId);
    },
    [focusId, navigateWorkbench, scope],
  );
  const focusInstance = useCallback(
    (sessionId: string) => {
      const projectName = resolveProjectName(sessionId);
      if (!projectName) return;
      focusPanel({ projectName, sessionId });
    },
    // resolveProjectName 闭包依赖 scope/candidates，已被 deps 覆盖。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scope, candidates, focusPanel],
  );
  const closeInstance = useCallback(
    (sessionId: string, type: "agent" | "terminal") => {
      const projectName = resolveProjectName(sessionId);
      if (!projectName) return;
      void close({ projectName, sessionId }, type);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scope, candidates, close],
  );
  const renameInstance = useCallback(
    (sessionId: string, type: "agent" | "terminal", currentName: string, projectName: string) => {
      if (!projectName) return;
      void rename({ projectName, sessionId }, type, currentName);
    },
    [rename],
  );

  // tab ✕ = 最小化（设计 §7.2）：removeTabFromLeaf 从 leaf 移除 tab，session 存活。
  const onCloseTab = useCallback(
    (groupId: string, tabId: string) => {
      const next = removeTabFromLeaf(layout, groupId, tabId);
      update(() => next);
      if (focusId === tabId) {
        void navigateWorkbench(scope, activeTabRefLeaf(next)?.sessionId);
      }
    },
    [layout, update, focusId, navigateWorkbench, scope],
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
  const onSelectTab = useCallback(
    (groupId: string, tabId: string) => {
      update((prev) => setActiveTabInLeaf(prev, groupId, tabId));
      if (tabId !== focusId) void navigateWorkbench(scope, tabId);
    },
    [update, focusId, navigateWorkbench, scope],
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
    void navigateWorkbench(scope, drag.ref.sessionId);
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
  // Phase 2a 活动栏切左栏内容：nav=projects → ProjectLeftPanel（scope 切换 + 新建项目 +
  // InstanceLeftOverview 实例总览）；nav=files → 文件树占位（Phase 2b 接入）。
  // nav=settings 跳 SettingsRoute 不进工作台，此处无需分支。
  const leftOverview = (
    <InstanceLeftOverview
      candidates={candidates}
      candidatesLoaded={candidatesLoaded}
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
      <div className="p-3 text-xs text-on-surface-muted">{t("nav.filesPlaceholder")}</div>
    ) : (
      <ProjectLeftPanel overview={leftOverview} scope={scope} />
    );
  return (
    <WorkbenchShell
      activityBar={<ActivityBar />}
      leftPanel={leftPanel}
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
        ctx={ctx}
        focusId={focusId}
        layout={layout}
        onCardDragStart={onCardDragStart}
        onCloseTab={onCloseTab}
        onDrop={onDrop}
        onResizeSplit={onResizeSplit}
        onSelectTab={onSelectTab}
        onSetDragPointer={onSetDragPointer}
        onTabChange={onTabChange}
        onToggleMaximize={onToggleMaximize}
        refsCount={refs.length}
        scope={scope}
        setActiveZone={setActiveZone}
        tab={tab}
      />
      {closeHolder}
      {renameHolder}
      {create.promptHolder}
    </WorkbenchShell>
  );
}
