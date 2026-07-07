import {
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAtom } from "jotai";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AgentProvider, AgentSession, TerminalSession } from "@agents-remote/shared";
import {
  type DropZone,
  type GlobalInstanceCandidate,
  type LeafNode,
  type TreeNode,
  type WorkbenchGroup,
  type WorkbenchLayoutV3,
  type WorkbenchMiddleTab,
  type WorkbenchPanelRef,
  type WorkbenchScope,
  type WorkbenchView,
  DRAG_THRESHOLD_PX,
  WORKBENCH_MIDDLE_LEFT_MAX_REM,
  WORKBENCH_MIDDLE_LEFT_MIN_REM,
  WORKBENCH_PANEL_DEFAULT_FLEX,
  activeTabRefLeaf,
  collectLeaves,
  deriveZone,
  dropIntoLeaf,
  ensureTabOpenLeaf,
  filterWorkbenchViews,
  findLeafBySessionId,
  findLeafNode,
  groupByProject,
  inferSessionTypeFromId,
  rankGlobalInstances,
  removeTabFromLeaf,
  resizeSplitChildren,
  setActiveTabInLeaf,
  toggleLeafMaximize,
  useWorkbenchLayout,
  useWorkbenchNavigate,
  workbenchMiddleLeftWidthAtom,
} from "../../routes/workbench-model";
import {
  closeAgentSession,
  closeTerminalSession,
  createAgentSession,
  createTerminalSession,
  getAgentSession,
  getTerminalSession,
  listAgentSessions,
  listProjects,
  listTerminalSessions,
  renameAgentSession,
  renameTerminalSession,
} from "../../api/client";
import { useConfirm } from "../shell/confirm-dialog";
import { useT } from "../../i18n";
import type { TranslateFn, TranslationKey } from "../../i18n/types";
import { sessionStatusLabel } from "../../routes/console-model";
import {
  actionButtonClasses,
  InstanceCard,
  type InstanceCardProps,
  ResizeGutter,
  sessionMarker,
  shellSurfaceClasses,
  type ShellTone,
  ShellSectionLabel,
  statusToTone,
  ViewSwitcher,
} from "../shell/shell-primitives";
import { AgentTerminalPanel, ChatPanel, TerminalPanel } from "./instance-panel";
import { HistoryList, relativeTime } from "./history-list";
import { buildOverviewTabs, FIRST_PARTY_PLUGINS, type PluginContext } from "./right-panel-plugin";
import { TabButton } from "./right-panel-tabs";
import { SessionTable, type TableColumn, type SessionTableRow } from "./workbench-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { ShellIcon } from "../shell/icons";
import { usePromptDialog } from "../shell/prompt-dialog";

/** 总览视图 label（WorkbenchView → i18n key，ViewSwitcher 按钮 aria-label/title）。 */
export const VIEW_LABEL_KEY: Record<WorkbenchView, TranslationKey> = {
  grouped: "workbench.viewGrouped",
  grid: "workbench.viewGrid",
  table: "workbench.viewTable",
};

/** InstanceCard 内容最小可读宽度（左总览 MIN_REM 的设计依据：放得下一张 220px 卡）。 */
export const MIN_CARD_WIDTH_PX = 220;
/**
 * InstanceCard 固定单列网格 inline style（桌面左总览 / 移动总览共用同源）。设计 §5：左总览
 * 固定单列卡片清单，`gridTemplateColumns: 1fr` 让卡片宽度始终 = 容器宽，拖宽左总览只让卡片
 * 变宽不增列。不用 `auto-fill minmax`——它会在 ≥440px 自动变 2 列，卡片缩到 minmax 下限
 * 内容拥挤，违反"父容器默认单列宽度排布"。用 inline style 而非 Tailwind 任意值：含括号/
 * 逗号时 Tailwind v4 任意值解析不稳定（dist CSS 实测不落盘规则）。配合 `grid gap-2` className。
 */
export const INSTANCE_GRID_STYLE: CSSProperties = {
  gridTemplateColumns: "1fr",
};

/** 卡片总览加载骨架的占位卡片数（行级骨架 HistoryListSkeleton 用 3，卡片网格翻倍 6）。 */
export const INSTANCE_SKELETON_ROW_COUNT = 3;

/**
 * 卡片总览加载骨架：自适应网格（与 InstanceGrid 同构，共享 INSTANCE_GRID_STYLE）。
 * 桌面 InstanceArea 总览加载 + 左栏 ProjectInstances 加载 + 移动 grid 加载共用——
 * 单一 skeleton 范式，避免三处各写一份。pending 时占位，替代 EmptyInstanceArea 的"伪空态"。
 */
export function CardGridSkeleton() {
  return (
    <div className="grid gap-2" style={INSTANCE_GRID_STYLE}>
      {Array.from({ length: INSTANCE_SKELETON_ROW_COUNT * 2 }, (_, index) => (
        <div className="h-20 animate-pulse rounded-lg bg-on-surface/5" key={index} />
      ))}
    </div>
  );
}

/** InstanceGrid 项 = InstanceCard props + React key（卡片在网格中的稳定标识）。 */
type InstanceGridItem = InstanceCardProps & { key: string };

/**
 * 拖动源适配器：左总览卡片（桌面）传 onDragStart + onSelect 让 InstanceGrid 包 DragSourceCard；
 * 移动端 / left-rail 不传 → 退化纯 InstanceCard（零回归）。每卡片 ref 由 InstanceGrid 的
 * `dragRefs` map 按 sessionId 查；onDragStart = 启动拖动态；onSelect = 单击激活（透传给
 * DragSourceCard，避免走 DOM .click() 误触 close 按钮）。
 */
export type DragSourceAdapter = {
  onDragStart: (ref: WorkbenchPanelRef, event: PointerEvent<HTMLDivElement>) => void;
  onSelect: (sessionId: string) => void;
};

type InstanceAreaProps = {
  /** inspection 插件上下文（projectKey/focusId/sessionType）；files/git tab 按 projectKey 过滤可见 + render。 */
  ctx: PluginContext;
  scope: WorkbenchScope;
  /** 聚焦面板 id（URL `/projects/$key/session/$id` 或 `/global/session/$id`）。无 focusId = 无聚焦面板。 */
  focusId?: string;
  /** 总览视图（URL `?view` + atom 回退）；仅非聚焦态 overview tab 时 ViewSwitcher 显示。 */
  view?: WorkbenchView;
  /** 切换总览视图（写 URL + atom，WorkbenchContent 注入）。 */
  onViewChange?: (next: WorkbenchView) => void;
  /** 中栏二级导航 tab（URL `?tab` + atom 回退）；仅非聚焦态渲染 tab bar（聚焦态右栏承载 inspection）。 */
  tab?: WorkbenchMiddleTab;
  /** 切换中栏 tab（写 URL + atom，WorkbenchContent 注入）。 */
  onTabChange?: (next: WorkbenchMiddleTab) => void;
};

/**
 * 中栏实例区（设计文档 §4）。永远左右结构：左总览（固定单列卡片，view 切 grid/table/grouped
 * 样式）+ 右工作区（VSCode group+tab 模型：n 叉树布局，每 leaf = GroupHeader tab 栏 + N 个
 * PanelRouter，active tab 可见其他 hidden 保 session）。tab 导航常驻（聚焦/非聚焦都不消失）。
 * URL focusId = 活动 leaf 活动 tab（findLeafBySessionId 反查）。layout 进 localStorage（V3 schema，
 * V1/V2 自动迁移），project 按项目分键；global 聚合所有项目活跃实例（rankGlobalInstances 排序）。
 */
export function InstanceArea({
  ctx,
  scope,
  focusId,
  view,
  onViewChange,
  tab,
  onTabChange,
}: InstanceAreaProps) {
  const navigateWorkbench = useWorkbenchNavigate();
  const { t } = useT();
  const { close, holder } = useCloseSession();
  const { rename, holder: renameHolder } = useRenameSession();
  const [layout, update] = useWorkbenchLayout(scope);
  const { candidates, isLoaded: candidatesLoaded } = useGlobalInstanceCandidates(scope);
  const create = useCreateSession(ctx.projectKey);
  // P3 grid 视图 project scope 数据源（global scope 返空，grid 改用 candidates 跨项目聚合）。
  const projectInstances = useProjectInstances(ctx.projectKey);

  // ViewSwitcher 视图选项（按 scope 过滤，设计 §6）。聚焦态也构造（tab bar 常驻，ViewSwitcher
  // 在 overview tab 时显示，与聚焦态无关）。
  const viewOptions = useMemo(
    () => filterWorkbenchViews(scope).map((v) => ({ id: v, label: t(VIEW_LABEL_KEY[v]) })),
    [scope, t],
  );

  // 中栏二级导航 tab（设计文档 §4）：overview 常驻 + history（project-only，历史是
  // project-scoped 数据）+ 第一方 inspection 插件按 ctx 过滤（files 全局可见根目录浏览；
  // git 需 projectKey）。复用 plugin.when 作 inspection 可见性单一来源；history 单独 gate
  // projectKey（非 FIRST_PARTY_PLUGINS，是独立数据源 useHistorySessions）。global scope =
  // overview + files。
  const visibleTabs = useMemo(
    () => buildOverviewTabs(t, ctx, ctx.projectKey !== null),
    // ctx 由 scope 决定（projectKey = scope.key 或 null），scope/t 变才重算。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scope, t],
  );
  // URL/atom 的 tab 若在当前 scope 不可见（如 global 下残留 ?tab=git），回退 overview。
  const resolvedTab: WorkbenchMiddleTab =
    tab !== undefined && visibleTabs.some((opt) => opt.id === tab) ? tab : "overview";
  // P3 总览视图守卫：URL/atom 的 view 若不在当前 scope 可见视图集（如 project scope 残留
  // ?view=grouped）→ 回退 "grid"（设计 §15 project 默认 grid，且 grid 全 scope 可见；不取
  // viewOptions[0]，因 WORKBENCH_VIEW_ORDER 使 project 首项 = table）。提前定义供初始态 effect 用。
  const resolvedView: WorkbenchView =
    view !== undefined && viewOptions.some((opt) => opt.id === view) ? view : "grid";

  const scopeKey = scope.kind === "project" ? scope.key : "global";
  const refs = useScopeInstanceOrder(scope);

  // 中栏左总览宽度（设计 §3：固定单列卡片 + gutter 调比例）。atomWithStorage 持久化，
  // MIN/DEFAULT/MAX 钳制（MIN=14rem 放得下一张 220px 卡）。
  const [middleLeftWidth, setMiddleLeftWidth] = useAtom(workbenchMiddleLeftWidthAtom);
  const onResizeMiddleLeft = useCallback(
    (deltaRem: number) =>
      setMiddleLeftWidth((prev) =>
        Math.min(
          Math.max(prev + deltaRem, WORKBENCH_MIDDLE_LEFT_MIN_REM),
          WORKBENCH_MIDDLE_LEFT_MAX_REM,
        ),
      ),
    [setMiddleLeftWidth],
  );

  // focus → 活动 leaf tab（VSCode explorer 语义，设计 §7.1/§13）：URL focusId 变化时确保
  // focusId 在某 leaf 的 tab 中。已开 → 激活该 tab（setActiveTabInLeaf 幂等，同 active 返回原
  // 引用，setState 跳过，无循环）；未开 → ensureTabOpenLeaf（活动 leaf 开新 tab；无活动 leaf 则
  // 新建 leaf）。project scope projectName = scope.key；global scope 从 refs 查 focusId 所属项目
  //（refs 未加载时 return prev 不变，加载后 refs.length 变 → effect 重跑同步）。effect 体用
  // update(prev => ...) 读最新 layout，避免闭包 layout 过时判断错。依赖只 focusId/scope/refs
  //（不含 layout）：minimize 改 layout 但不改 focusId，effect 不重跑 → 不会在 minimized focusId
  // 上重开（minimize 自身 navigate 到剩余活动 tab 同步 URL，见 onCloseTab）。
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

  // tab ✕ = 最小化（设计 §7.2）：removeTabFromLeaf 从 leaf 移除 tab，session 存活（不 kill，
  // kill 走左总览卡片 close = closeInstance）。minimize 当前聚焦 tab → navigate 到剩余活动 tab
  //（activeTabRefLeaf 派生活动 leaf 的活动 tab），避免 focus effect 在 minimized focusId 上重开
  //（= 循环）。next 用当前 layout 闭包算（事件处理即时，layout 是本 render 的），update 传 next，
  // navigate 用 next 派生活动 tab。
  const onCloseTab = (groupId: string, tabId: string) => {
    const next = removeTabFromLeaf(layout, groupId, tabId);
    update(() => next);
    if (focusId === tabId) {
      void navigateWorkbench(scope, activeTabRefLeaf(next)?.sessionId);
    }
  };

  // stale-tab prune（设计 §7.1）：kill session 后该 session 的 tab 不会自动从 layout 消失
  //（V3 localStorage 持久化，刷新也不清）。监听活跃实例集（refs）变化，遍历树所有 leaf 的 tab，
  // sessionId 不在活跃集 → removeTabFromLeaf 清理（可能触发子树提升 / 删空 leaf）。
  // focusId 指向被清 tab 时回退到剩余活动 tab（activeTabRefLeaf 派生）或清空回非聚焦态。
  useEffect(() => {
    if (layout.root === null) return;
    const activeIds = new Set(refs.map((r) => r.sessionId));
    // 收集所有 stale tab（遍历树所有 leaf）。
    const stale: { leafId: string; tabId: string }[] = [];
    for (const leaf of collectLeaves(layout.root)) {
      for (const tab of leaf.tabs) {
        if (!activeIds.has(tab.sessionId)) stale.push({ leafId: leaf.id, tabId: tab.sessionId });
      }
    }
    if (stale.length === 0) return;
    let next = layout;
    for (const { leafId, tabId } of stale) {
      next = removeTabFromLeaf(next, leafId, tabId);
    }
    if (next === layout) return;
    update(() => next);
    // 当前聚焦 tab 被清 → 回退到剩余活动 tab（或清空回非聚焦态）。
    if (focusId && stale.some((s) => s.tabId === focusId)) {
      void navigateWorkbench(scope, activeTabRefLeaf(next)?.sessionId);
    }
    // refs/layout 引用敏感；refs.length 守卫避免 refs 内容未变（如同序变动）时误触。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, focusId, layout, refs]);

  const focusPanel = (ref: WorkbenchPanelRef) => {
    if (ref.sessionId === focusId) return;
    void navigateWorkbench(scope, ref.sessionId);
  };

  // leaf 操作（设计 §7.3/§7.5）：maximize = leaf 级独占（toggleLeafMaximize 标量翻转，渲染时
  // maximized 短路只画该 leaf = 纯派生全屏）；split 内相邻 children resize（resizeSplitChildren
  // 守恒钳制左增右减，键=splitId+两 childId）。sizes + maximized 由 useWorkbenchLayout 持久化，
  // 刷新恢复。
  const onToggleMaximize = (groupId: string) => {
    update((prev) => toggleLeafMaximize(prev, groupId));
  };
  const onResizeSplit = (
    splitId: string,
    leftChildId: string,
    rightChildId: string,
    deltaFlex: number,
  ) => {
    update((prev) => resizeSplitChildren(prev, splitId, leftChildId, rightChildId, deltaFlex));
  };

  // P3 总览视图（设计文档 §5/§8）：overview tab 左总览按 view 渲染（grid 卡片 / grouped 分段 /
  // table 紧凑行）。resolvedView 已在上方定义（初始态 effect 复用）。

  // grid 卡片回调：select 复用 focusPanel 进聚焦态；close 走 useCloseSession（卡片由 query 驱动，
  // invalidate 后自然消失，不操作 layout —— 与 ProjectInstances card / MobileGlobalOverview 同款）。
  // global scope 的 projectName 从 candidates 查（candidate.ref.projectName）—— 与 closeInstance
  // 同源，避免旧实现在 global 误传空 projectName（focusInstance bug 修复）。
  const resolveProjectName = (sessionId: string): string =>
    scope.kind === "project"
      ? scope.key
      : (candidates.find((c) => c.ref.sessionId === sessionId)?.ref.projectName ?? "");
  const focusInstance = (sessionId: string) => {
    const projectName = resolveProjectName(sessionId);
    if (!projectName) return;
    focusPanel({ projectName, sessionId });
  };
  const closeInstance = (sessionId: string, type: "agent" | "terminal") => {
    const projectName = resolveProjectName(sessionId);
    if (!projectName) return;
    void close({ projectName, sessionId }, type);
  };
  const renameInstance = (
    sessionId: string,
    type: "agent" | "terminal",
    currentName: string,
    projectName: string,
  ) => {
    if (!projectName) return;
    void rename({ projectName, sessionId }, type, currentName);
  };

  // ── Phase B 拖放分屏（设计 §7.2/§7.4）──────────────────────────────────────
  // dragState = 拖动源 ref + 起始 pointer；进态后 elementFromPoint hit-test data-drop-group/
  // data-drop-zone 得 activeZone，pointerup 时 onDrop 调 dropIntoGroup。pointermove < 4px 视为单击
  //（Phase A 行为，手动调 onSelect 不依赖 click 合成）。touch pointerType 不进拖动态（移动端无拖放）。
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
  // ghost 跟随指针的 ref（拖动态显示 marker + 实例名）。
  const draggingRef = dragState?.ref ?? null;

  // tab 右键菜单（设计 §7.1）：右键 tab 弹轻量菜单「最小化」+「关闭实例 kill」。
  // minimize 复用 onCloseTab（removeTabFromGroup，session 存活）；kill 走 closeInstance
  //（useCloseSession，自带 confirm → close API → 失效缓存）。菜单锚定右键 pointer 坐标，
  // document pointerdown 外点 / Esc 关闭（仿 SessionDetailActionsMenu）。
  const [contextMenu, setContextMenu] = useState<{
    groupId: string;
    tabId: string;
    x: number;
    y: number;
  } | null>(null);
  const onTabContextMenu = useCallback((groupId: string, tabId: string, x: number, y: number) => {
    setContextMenu({ groupId, tabId, x, y });
  }, []);
  const closeContextMenu = useCallback(() => setContextMenu(null), []);
  const onMinimizeTab = useCallback(() => {
    if (!contextMenu) return;
    onCloseTab(contextMenu.groupId, contextMenu.tabId);
    setContextMenu(null);
  }, [contextMenu, onCloseTab]);
  const onKillTab = useCallback(() => {
    if (!contextMenu) return;
    const type = inferSessionTypeFromId(contextMenu.tabId);
    if (type) closeInstance(contextMenu.tabId, type);
    setContextMenu(null);
  }, [contextMenu, closeInstance]);

  const onDrop = useCallback(() => {
    const drag = dragState;
    const zone = activeZone;
    setDragState(null);
    setActiveZone(null);
    if (!drag || !zone) return;
    const prev = layout;
    const next = dropIntoLeaf(prev, drag.ref, zone.targetGroupId, zone.zone);
    if (next === prev) return; // noop（自身 drop / target 不在）：跳过 navigate
    update(() => next);
    // drop 后自动聚焦新 leaf/tab（用户刚拖的实例，预期看其 output）。
    void navigateWorkbench(scope, drag.ref.sessionId);
  }, [dragState, activeZone, layout, update, navigateWorkbench, scope]);

  const cancelDrag = useCallback(() => {
    setDragState(null);
    setActiveZone(null);
  }, []);

  // 拖动源卡片启动回调（DragSourceCard onDragStart 传 ref）。
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
  const gridCallbacks: GridItemCallbacks = {
    onClose: closeInstance,
    onRename: renameInstance,
    onSelect: focusInstance,
    t,
  };

  // grid 数据源：global 用 candidates（跨项目聚合），project 用 useProjectInstances（本项目全览）。
  const gridItems = useMemo<InstanceGridItem[]>(
    () =>
      scope.kind === "global"
        ? candidates.map((candidate) => candidateToGridItem(candidate, gridCallbacks))
        : projectInstances.instances.map((entry) =>
            instanceToGridItem(entry, gridCallbacks, ctx.projectKey ?? ""),
          ),
    // gridCallbacks 闭包依赖 scope/candidates/t，已被下方 deps 覆盖；projectInstances.instances
    // 引用由 hook 内 dataKey fingerprint 稳定（data 不变时不新建数组）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scope, candidates, projectInstances.instances, t],
  );

  // 左总览 overview 内容按 view 分支（设计 §5）：grid → InstanceGrid（空 → EmptyInstanceArea）；
  // grouped → GroupedView（仅 global scope，按项目分段）；table → SessionTable（空 → EmptyInstanceArea）。
  const showGrid = resolvedView === "grid";
  const showGrouped = resolvedView === "grouped" && scope.kind === "global";
  const showTable = resolvedView === "table";
  // 桌面左总览拖放适配器（Phase B）：InstanceGrid/GroupedView 包 DragSourceCard；移动端不进此分支。
  const dragAdapter: DragSourceAdapter = { onDragStart: onCardDragStart, onSelect: focusInstance };
  // grid view dragRefs：global 用 candidates，project 用 projectInstances（sessionId → ref）。
  const gridDragRefs = useMemo(() => {
    const m = new Map<string, WorkbenchPanelRef>();
    if (scope.kind === "global") {
      for (const c of candidates) m.set(c.ref.sessionId, c.ref);
    } else {
      for (const entry of projectInstances.instances) {
        m.set(entry.session.id, { projectName: scope.key, sessionId: entry.session.id });
      }
    }
    return m;
  }, [scope, candidates, projectInstances.instances]);
  // table 列回调（与 gridCallbacks 同源：select 进聚焦态 / close 走 useCloseSession）；t 用
  // TranslateFn（带 params，给 relativeTime 的 time.minutesAgo {count} 用，比 GridItemCallbacks 窄签名宽）。
  const tableCallbacks: TableRowCallbacks = { onClose: closeInstance, onSelect: focusInstance, t };
  const tableRows = useMemo<SessionTableRow[]>(
    () =>
      scope.kind === "global"
        ? candidates.map((candidate) => candidateToTableRow(candidate, tableCallbacks))
        : projectInstances.instances.map((entry) => instanceToTableRow(entry, tableCallbacks)),
    // tableCallbacks 闭包依赖 scope/candidates/t，已被下方 deps 覆盖；projectInstances.instances
    // 引用由 hook 内 dataKey fingerprint 稳定（与 gridItems 同款）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scope, candidates, projectInstances.instances, t],
  );
  // table 列：global 4 列（name 首列 + project）/ project 3 列（隐藏 project，设计 §9）。
  // type 已并入 name 列（StatusMarker + 会话名），无独立 type 列；状态圆点并入 name 列 marker 右上角。
  const tableColumns: TableColumn[] =
    scope.kind === "global"
      ? ["name", "project", "activity", "actions"]
      : ["name", "activity", "actions"];
  // 总览加载态（设计 §5）：pending 且数据仍空时显示 CardGridSkeleton，替代 EmptyInstanceArea
  //（后者是"创建实例"空态，加载中显示会误导用户以为无实例）。project 用 useProjectInstances
  // 的 isLoading，global 用 candidatesLoaded（聚合多 query 的 settled 标量）。
  const overviewLoading =
    scope.kind === "project"
      ? projectInstances.isLoading && projectInstances.instances.length === 0
      : !candidatesLoaded && candidates.length === 0;
  const leftOverviewContent = overviewLoading ? (
    <div className="px-3 py-2">
      <CardGridSkeleton />
    </div>
  ) : showGrid ? (
    gridItems.length === 0 ? (
      <EmptyInstanceArea create={create} projectName={ctx.projectKey} />
    ) : (
      <div className="px-3 py-2">
        <InstanceGrid dragAdapter={dragAdapter} dragRefs={gridDragRefs} items={gridItems} />
      </div>
    )
  ) : showGrouped ? (
    <GroupedView
      candidates={candidates}
      dragAdapter={dragAdapter}
      onClose={closeInstance}
      onFocus={focusInstance}
      onRename={renameInstance}
      t={t}
    />
  ) : showTable ? (
    tableRows.length === 0 ? (
      <EmptyInstanceArea create={create} projectName={ctx.projectKey} />
    ) : (
      <SessionTable columns={tableColumns} rows={tableRows} t={t} />
    )
  ) : null;

  // 中栏内容按 tab 分支（设计 §4）：工作态 tab（overview/history）= 左右结构（左总览固定宽 +
  //   右工作区常驻活动组）；inspection tab（files/git）= 全宽 inspection，右工作区临时让位。
  //   history 左总览 = HistoryList（project-scoped 历史 session，showLabel=false 因 tab bar 已标识）。
  const isOverview = resolvedTab === "overview";
  const isHistory = !isOverview && resolvedTab === "history";
  // 左右结构仅 overview：history 全宽呈现历史列表（点会话 → 切 overview + 聚焦，设计 §4），
  // inspection tab 全宽 plugin.render。故 inspectionPlugin 只在非 overview/非 history 时查。
  const inspectionPlugin =
    isOverview || isHistory
      ? null
      : FIRST_PARTY_PLUGINS.find((plugin) => plugin.id === resolvedTab);
  // 左总览仅 overview 存在；history / inspection tab 全宽，无左总览。CreateSessionBar +
  // ViewSwitcher 随左总览 header 一起只在 overview 渲染（设计 §6）。
  const leftColumnContent = isOverview ? leftOverviewContent : null;
  // 右工作区 = n 叉树递归渲染（设计 §7.5）。多 leaf 同屏：split 容器 flex 按 sizes 权重
  //（key=childId）等分，children 间 gutter 拖拽调占比（resizeSplitChildren 守恒钳制）。
  // maximized 时 WorkspaceTree 短路只渲染该 leaf 全屏。
  // dragState 期间 WorkspaceTree 根容器用 pointer-events:none 让 elementFromPoint 命中 overlay
  // 下层 GroupCell 的 data-drop-group（pointer capture 在源卡片，overlay 不接 pointer 事件）。
  const rightWorkspace = (
    <WorkspaceTree
      activeZone={activeZone}
      create={create}
      draggingRef={draggingRef}
      hasActiveInstances={refs.length > 0}
      maximized={layout.maximized}
      onCloseLeafTab={onCloseTab}
      onResizeSplit={onResizeSplit}
      onSelectTab={(groupId, tabId) => {
        // 点 tab = 切活动 tab（setActiveTabInLeaf 即时切视觉）+ navigate（URL focusId 同步）。
        // navigate 会再触发 focus effect，但 setActiveTabInLeaf 幂等，无副作用。
        update((prev) => setActiveTabInLeaf(prev, groupId, tabId));
        if (tabId !== focusId) void navigateWorkbench(scope, tabId);
      }}
      onTabContextMenu={onTabContextMenu}
      onTabDragStart={onCardDragStart}
      onToggleMaximize={onToggleMaximize}
      projectName={ctx.projectKey}
      root={layout.root}
    />
  );
  const tabContent = isOverview ? (
    <div className="flex h-full min-h-0">
      <div
        className="relative flex h-full shrink-0 flex-col overflow-hidden"
        style={{ width: `${middleLeftWidth}rem` }}
      >
        {/* 左总览顶部 header：CreateSessionBar（project only）+ ViewSwitcher（overview only）。
            tab 行只剩纯 tab，控件随左总览只在 overview 渲染（设计 §6）。ViewSwitcher 用
            ml-auto wrapper 推到 header 右侧（global 无 CreateSessionBar 时独占右侧）。 */}
        <div className="flex shrink-0 items-center gap-1 border-b border-on-surface/5 px-2 py-1.5">
          {ctx.projectKey !== null ? (
            <CreateSessionBar
              isCreating={create.isCreating}
              onCreateAgent={create.createAgent}
              onCreateTerminal={create.createTerminal}
            />
          ) : null}
          {onViewChange ? (
            <div className="ml-auto">
              <ViewSwitcher
                ariaLabel={t("workbench.viewSwitcher")}
                onChange={onViewChange}
                view={resolvedView}
                views={viewOptions}
              />
            </div>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{leftColumnContent}</div>
        <ResizeGutter edge="right" onResize={onResizeMiddleLeft} />
      </div>
      {/* 右工作区 + drop overlay。外层 relative 容器承接空态 drop（data-drop-empty）；
          dragState 期间 DropZoneOverlay 显示 zone 高亮。WorkspaceGrid 空 panels 时
          渲染 EmptyInstanceArea（也标注 data-drop-empty 让空白区 drop 命中）。 */}
      <div
        className="relative min-w-0 flex-1"
        data-drop-empty={layout.root === null ? "" : undefined}
      >
        {rightWorkspace}
        {dragState ? (
          <DropZoneOverlay
            activeZone={activeZone}
            dragPointer={{ x: dragState.currentX, y: dragState.currentY }}
            dragSourceRef={draggingRef}
            layout={layout}
            onCancel={cancelDrag}
            onDrop={onDrop}
            onPointerMove={(x, y) =>
              setDragState((prev) => (prev ? { ...prev, currentX: x, currentY: y } : prev))
            }
            onZoneChange={setActiveZone}
            t={t}
          />
        ) : null}
      </div>
    </div>
  ) : isHistory && ctx.projectKey !== null ? (
    <div className="h-full overflow-y-auto p-3">
      <HistoryList focusId={focusId} projectName={ctx.projectKey} showLabel={false} />
    </div>
  ) : (
    (inspectionPlugin?.render(ctx) ?? null)
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-on-surface/5 px-1.5">
        {visibleTabs.map((opt) => (
          <TabButton
            active={opt.id === resolvedTab}
            key={opt.id}
            label={opt.label}
            onClick={() => onTabChange?.(opt.id)}
          />
        ))}
      </div>
      <div className="min-h-0 flex-1">{tabContent}</div>
      {holder}
      {renameHolder}
      {contextMenu ? (
        <TabContextMenu
          anchor={contextMenu}
          onClose={closeContextMenu}
          onKill={onKillTab}
          onMinimize={onMinimizeTab}
        />
      ) : null}
      {create.promptHolder}
    </div>
  );
}

type PanelRouterProps = {
  panelRef: WorkbenchPanelRef;
  /**
   * 省略面板自带 header（移动端聚焦态用）：透传给 ChatPanel/AgentTerminalPanel/TerminalPanel
   * → Claude2Chat/SessionDetail 的 embeddedHeader。桌面右工作区 GroupHeader 下不传（header
   * 仍渲染，现状不变）；移动 MobileFocusBody 传 true（header 由 MobileFocusHeader 统一渲染）。
   */
  embeddedHeader?: boolean;
};

/**
 * 单面板路由：按 sessionId 前缀推断类型 → 查详情 → 渲染对应面板（claude2→ChatPanel、
 * 其他 agent→AgentTerminalPanel、terminal→TerminalPanel）。复用 Stage 1 的嵌入式面板。
 *
 * 右工作区活动组 + 移动单实例聚焦共用：桌面右工作区 GroupHeader 下调一次，
 * 移动聚焦态调一次（不 split，单实例）。面板内部依赖父级 flex-col 让 flex-1 runtime
 * body 撑满，调用方容器须 `flex min-h-0 flex-1 flex-col overflow-hidden`。
 */
export function PanelRouter({ panelRef, embeddedHeader }: PanelRouterProps) {
  const sessionType = inferSessionTypeFromId(panelRef.sessionId);
  if (sessionType === "agent") {
    return <AgentPanelRouter embeddedHeader={embeddedHeader} panelRef={panelRef} />;
  }
  if (sessionType === "terminal") {
    return <TerminalPanelRouter embeddedHeader={embeddedHeader} panelRef={panelRef} />;
  }
  return <PlaceholderPanel focusId={panelRef.sessionId} />;
}

function AgentPanelRouter({ panelRef, embeddedHeader }: PanelRouterProps) {
  const detail = useAgentDetail(panelRef);
  if (detail.isLoading) return null;
  if (detail.data?.session.provider === "claude2") {
    return (
      <ChatPanel
        embeddedHeader={embeddedHeader}
        projectName={panelRef.projectName}
        sessionId={panelRef.sessionId}
      />
    );
  }
  if (detail.data?.session) {
    return (
      <AgentTerminalPanel
        embeddedHeader={embeddedHeader}
        projectName={panelRef.projectName}
        sessionId={panelRef.sessionId}
      />
    );
  }
  return <PlaceholderPanel focusId={panelRef.sessionId} />;
}

function TerminalPanelRouter({ panelRef, embeddedHeader }: PanelRouterProps) {
  const detail = useTerminalDetail(panelRef);
  if (detail.isLoading) return null;
  if (detail.data?.session) {
    return (
      <TerminalPanel
        embeddedHeader={embeddedHeader}
        projectName={panelRef.projectName}
        sessionId={panelRef.sessionId}
      />
    );
  }
  return <PlaceholderPanel focusId={panelRef.sessionId} />;
}

// ── 详情查询（拆为小 hook，保持 PanelRouter 干净）─────────────────────────────

export function useAgentDetail(panelRef: WorkbenchPanelRef, enabled = true) {
  return useQuery({
    queryKey: ["projects", panelRef.projectName, "agent-sessions", panelRef.sessionId],
    queryFn: () => getAgentSession(panelRef.projectName, panelRef.sessionId),
    enabled,
    retry: false,
    staleTime: 60_000,
  });
}

export function useTerminalDetail(panelRef: WorkbenchPanelRef, enabled = true) {
  return useQuery({
    queryKey: ["projects", panelRef.projectName, "terminal-sessions", panelRef.sessionId],
    queryFn: () => getTerminalSession(panelRef.projectName, panelRef.sessionId),
    enabled,
    retry: false,
    staleTime: 60_000,
  });
}

/**
 * split 面板元数据（设计 §7.2/§7.3/§10/§12）。按 sessionId 前缀推断类型 → 复用
 * useAgentDetail/useTerminalDetail（query key 与 PanelRouter 一致，React Query dedupe 零额外
 * 网络）。返回 SplitPanel header（marker + label + statusDot）与 SplitDock chip
 *（marker + label）共用的元数据；detail 未就绪时返 undefined，调用方 fallback 到 sessionId 前 12 位。
 * 两个 detail hook 都调（hooks 规则），按 sessionType 控制 enabled；projectName 未就绪时双
 * enabled=false 零网络开销。这是 P1#1/#2 + P2#7/#8 的根因修复：SplitLayout 不再只接收
 * WorkbenchPanelRef{projectName,sessionId}，而是从实例 detail 派生 marker/displayName/status。
 */
export type PanelMeta = {
  /** 实例 marker（agent 按 provider，terminal 固定）；与 InstanceCard 同源（设计 §10/§12）。 */
  marker: ReactNode;
  /** 显示名（detail.displayName；未就绪时 undefined，调用方 fallback sessionId 前 12 位）。 */
  label?: string;
  /** 状态点（detail.status → tone + i18n label；running 时 pulse）。未就绪时 undefined。 */
  statusDot?: { label: string; pulse: boolean; tone: ShellTone };
};

export function usePanelMeta(panelRef: WorkbenchPanelRef): PanelMeta | undefined {
  const { t } = useT();
  const sessionType = inferSessionTypeFromId(panelRef.sessionId);
  const projReady = !!panelRef.projectName;
  const agent = useAgentDetail(panelRef, projReady && sessionType === "agent");
  const terminal = useTerminalDetail(panelRef, projReady && sessionType === "terminal");
  if (sessionType === "agent") {
    const session = agent.data?.session;
    if (!session) return undefined;
    return {
      label: session.displayName,
      marker: sessionMarker("agent", session.provider),
      statusDot: {
        label: t(sessionStatusLabel(session.status)),
        pulse: session.status === "running",
        tone: statusToTone(session.status),
      },
    };
  }
  if (sessionType === "terminal") {
    const session = terminal.data?.session;
    if (!session) return undefined;
    return {
      label: session.displayName,
      marker: sessionMarker("terminal"),
      statusDot: {
        label: t(sessionStatusLabel(session.status)),
        pulse: session.status === "running",
        tone: statusToTone(session.status),
      },
    };
  }
  return undefined;
}

/**
 * 会话 close 统一流程（confirm → 按 type 调 close API → 精确失效缓存）。三处 close
 *（左总览卡片 ProjectInstances / 移动全局 MobileGlobalOverview / 历史列表）复用此 hook，
 * cache 策略统一：removeQueries detail + exact invalidate（["projects"] / [name] /
 * [name, type-sessions]），不波及 files/git。`onAfterClose` 留给调用方追加副作用。tab ✕
 *（最小化）不走此 hook —— 走 removeTabFromGroup（session 存活，不 close）。返回 true=已关闭，
 * false=用户取消。
 */
export function useCloseSession() {
  const { t } = useT();
  const { confirm, holder } = useConfirm();
  const queryClient = useQueryClient();
  const close = async (
    ref: WorkbenchPanelRef,
    type: "agent" | "terminal",
    onAfterClose?: () => void,
  ): Promise<boolean> => {
    const ok = await confirm({
      cancelLabel: t("cancel"),
      confirmLabel: t("session.close"),
      message: t("session.closeConfirm"),
      title: t("session.close"),
      tone: "danger",
    });
    if (!ok) return false;
    try {
      if (type === "agent") {
        await closeAgentSession(ref.projectName, ref.sessionId);
      } else {
        await closeTerminalSession(ref.projectName, ref.sessionId);
      }
    } catch {
      // 会话已结束 / 不存在（404）—— close 幂等，仍失效缓存让卡片/面板消失。
    }
    queryClient.removeQueries({
      exact: true,
      queryKey: ["projects", ref.projectName, `${type}-sessions`, ref.sessionId],
    });
    await Promise.all([
      queryClient.invalidateQueries({ exact: true, queryKey: ["projects"] }),
      queryClient.invalidateQueries({ exact: true, queryKey: ["projects", ref.projectName] }),
      queryClient.invalidateQueries({
        exact: true,
        queryKey: ["projects", ref.projectName, `${type}-sessions`],
      }),
    ]);
    onAfterClose?.();
    return true;
  };
  return { close, holder };
}

/**
 * 改名实例统一流程（任务 E）。prompt 预填当前 displayName → 按 type 调 rename API → 失效
 * list + detail + global 顶层。与 useCloseSession 同文件同模式（业务 hook 集合）。promptHolder
 * 由调用方渲染（与 closeHolder 并列）。空名 / 未改名 / 用户取消 → no-op（prompt 返回 null）。
 */
export function useRenameSession() {
  const { t } = useT();
  const queryClient = useQueryClient();
  const { holder: promptHolder, prompt } = usePromptDialog();

  const rename = useCallback(
    async (
      ref: WorkbenchPanelRef,
      type: "agent" | "terminal",
      currentName: string,
    ): Promise<boolean> => {
      const next = await prompt({
        cancelLabel: t("cancel"),
        confirmLabel: t("session.rename"),
        initialValue: currentName,
        placeholder: t("session.renamePrompt.placeholder"),
        title: t("session.renamePrompt.title"),
      });
      // null=取消；空名/未改动 → 不调 API（路由会 400，避免无谓请求与静默失败）。
      if (next === null || next === currentName || next.length === 0) return false;
      try {
        if (type === "agent") {
          await renameAgentSession(ref.projectName, ref.sessionId, next);
        } else {
          await renameTerminalSession(ref.projectName, ref.sessionId, next);
        }
      } catch {
        // 路由已返回错误码（404 / 400）；UI 不额外提示，失败仍失效缓存让列表自愈。
      }
      await Promise.all([
        queryClient.invalidateQueries({ exact: true, queryKey: ["projects"] }),
        queryClient.invalidateQueries({ exact: true, queryKey: ["projects", ref.projectName] }),
        queryClient.invalidateQueries({
          queryKey: ["projects", ref.projectName, `${type}-sessions`],
        }),
        queryClient.invalidateQueries({
          exact: true,
          queryKey: ["projects", ref.projectName, `${type}-sessions`, ref.sessionId],
        }),
      ]);
      return true;
    },
    [prompt, queryClient, t],
  );

  return { rename, holder: promptHolder };
}

/**
 * 创建实例统一流程（2c-2 提取，供中栏 InstanceArea tab bar / 空态 EmptyInstanceArea /
 * 左栏 ProjectInstances card 三处复用）。prompt → 按 type 调 create API → invalidate
 * agent/terminal-sessions + navigate 聚焦新 session。与 useCloseSession 同文件同模式
 *（业务 hook 集合）。`projectName === null`（global scope）短路返回 noop + null holder，
 * 避免 global 误创建。promptHolder 由调用方渲染（与 useCloseSession.holder 并列）。
 */
export type CreateSessionApi = {
  createAgent: (provider: AgentProvider) => void;
  createTerminal: () => void;
  isCreating: boolean;
};

export function useCreateSession(projectName: string | null): CreateSessionApi & {
  promptHolder: ReactNode;
} {
  const { t } = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { holder: promptHolder, prompt } = usePromptDialog();
  const safeName = projectName ?? "";

  const invalidateSessions = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["projects", safeName, "agent-sessions"] }),
      queryClient.invalidateQueries({ queryKey: ["projects", safeName, "terminal-sessions"] }),
    ]);
  };

  const createAgent = useMutation({
    mutationFn: ({ displayName, provider }: { displayName: string; provider: AgentProvider }) =>
      createAgentSession(safeName, provider, { displayName: displayName || undefined }),
    onSuccess: async (data) => {
      await invalidateSessions();
      await navigate({
        to: "/projects/$key/session/$id",
        params: { key: safeName, id: data.session.id },
      });
    },
  });
  const createTerminal = useMutation({
    mutationFn: (displayName: string) => createTerminalSession(safeName, displayName || undefined),
    onSuccess: async (data) => {
      await invalidateSessions();
      await navigate({
        to: "/projects/$key/session/$id",
        params: { key: safeName, id: data.session.id },
      });
    },
  });

  const createAgentPrompt = (provider: AgentProvider) => {
    void prompt({
      cancelLabel: t("cancel"),
      confirmLabel: t("session.namePrompt.confirm"),
      placeholder: t("session.namePrompt.placeholder"),
      title: t("session.namePrompt.createAgent"),
    }).then((name) => {
      if (name !== null) createAgent.mutate({ displayName: name, provider });
    });
  };

  const createTerminalPrompt = () => {
    void prompt({
      cancelLabel: t("cancel"),
      confirmLabel: t("session.namePrompt.confirm"),
      placeholder: t("session.namePrompt.placeholder"),
      title: t("session.namePrompt.createTerminal"),
    }).then((name) => {
      if (name !== null) createTerminal.mutate(name);
    });
  };

  if (projectName === null) {
    return {
      createAgent: () => {},
      createTerminal: () => {},
      isCreating: false,
      promptHolder: null,
    };
  }
  return {
    createAgent: createAgentPrompt,
    createTerminal: createTerminalPrompt,
    isCreating: createAgent.isPending || createTerminal.isPending,
    promptHolder,
  };
}

type CreateSessionBarProps = {
  isCreating: boolean;
  onCreateAgent: (provider: AgentProvider) => void;
  onCreateTerminal: () => void;
  /** trigger 额外 className（如全宽 "w-full justify-center"）。默认 inline 紧凑（h-7 px-2）。 */
  triggerClassName?: string;
};

/**
 * 创建实例 dropdown（Claude/Codex/Terminal，2c-2 从 left-rail LeftRailCreateBar 改名迁此
 * export）。presentational——消费 useCreateSession 的 createAgent/createTerminal/isCreating。
 * 三处复用：InstanceArea tab bar（inline）、EmptyInstanceArea（inline）、ProjectInstances
 * card（全宽 triggerClassName="w-full justify-center"）。
 */
export function CreateSessionBar({
  isCreating,
  onCreateAgent,
  onCreateTerminal,
  triggerClassName,
}: CreateSessionBarProps) {
  const { t } = useT();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={actionButtonClasses({
          className: `group disabled:cursor-not-allowed disabled:opacity-50 ${triggerClassName ?? ""}`,
          tone: "accent",
        })}
        disabled={isCreating}
      >
        {isCreating ? t("project.creating") : t("workbench.createMenu")}
        <svg
          aria-hidden="true"
          className="h-3 w-3 transition group-data-[state=open]:rotate-180"
          fill="none"
          viewBox="0 0 16 16"
        >
          <path
            d="M4 6l4 4 4-4"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
          />
        </svg>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[var(--radix-dropdown-menu-trigger-width)]">
        <DropdownMenuItem onSelect={() => onCreateAgent("claude2")}>
          <ShellIcon className="h-3.5 w-3.5" name="anthropic" />
          {t("workbench.createClaude2")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onCreateTerminal}>
          <ShellIcon className="h-3.5 w-3.5" name="terminal" />
          {t("workbench.createTerminal")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * 全局实例区候选聚合（commit ④）。仅在 global 作用域发请求：listProjects → 每项目
 * listAgentSessions/listTerminalSessions（useQueries 动态查询，复用左栏 query key 缓存），
 * 扁平化成带状态/类型的候选列表，供 rankGlobalInstances 排序后铺开。非 global 返回空。
 *
 * P2：返回 `{ candidates, isLoaded }`。`isLoaded` 表示所有底层 queries（projects + 每项目
 * agent/terminal）都已 settled——自动铺开 effect 用它守卫，避免在 candidates 只加载到部分
 *（如 agent queries 已回、terminal queries 还没回）时铺开并锁 seededRef 导致丢实例。
 */
export function useGlobalInstanceCandidates(scope: WorkbenchScope): {
  candidates: GlobalInstanceCandidate[];
  isLoaded: boolean;
} {
  const isGlobal = scope.kind === "global";
  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: listProjects,
    enabled: isGlobal,
  });
  const names = isGlobal ? (projects.data?.projects.map((p) => p.name) ?? []) : [];
  const agentQueries = useQueries({
    queries: names.map((name) => ({
      queryKey: ["projects", name, "agent-sessions"],
      queryFn: () => listAgentSessions(name),
      staleTime: 5_000,
    })),
  });
  const terminalQueries = useQueries({
    queries: names.map((name) => ({
      queryKey: ["projects", name, "terminal-sessions"],
      queryFn: () => listTerminalSessions(name),
      staleTime: 5_000,
    })),
  });
  // dataUpdatedAt fingerprint：query data 内容变化时 timestamp 才变，作 useMemo 单一 dep，
  // 让返回引用在 data 不变时稳定（下游 useMemo([candidates]) 才有效；useQueries 每 render
  // 返回新数组引用，直接进 deps 会每 render 重算）。
  const dataKey = `${isGlobal}|${projects.dataUpdatedAt}|${agentQueries
    .map((q) => q.dataUpdatedAt)
    .join(",")}|${terminalQueries.map((q) => q.dataUpdatedAt).join(",")}`;
  return useMemo(() => {
    if (!isGlobal) return { candidates: [], isLoaded: true };
    // isLoaded：projects 加载完 + 每项目 agent/terminal queries 都 settled（!isPending && data !== undefined）。
    // useQueries 在 names 空时返 []，every([])=true；projects 加载完那帧 names 变非空，新 query 立即
    // pending → isLoaded=false；都 settled 后 true。fingerprint dep 覆盖 queries 引用变化。
    const isLoaded =
      !projects.isLoading &&
      projects.data !== undefined &&
      agentQueries.every((q) => !q.isPending && q.data !== undefined) &&
      terminalQueries.every((q) => !q.isPending && q.data !== undefined);
    const candidates: GlobalInstanceCandidate[] = [];
    names.forEach((name, index) => {
      for (const session of agentQueries[index]?.data?.sessions ?? []) {
        candidates.push({
          createdAt: session.createdAt,
          displayName: session.displayName,
          provider: session.provider,
          ref: { projectName: name, sessionId: session.id },
          status: session.status,
          subtitle: session.lastAssistantMessage,
          type: "agent",
          updatedAt: session.updatedAt,
        });
      }
      for (const session of terminalQueries[index]?.data?.sessions ?? []) {
        candidates.push({
          displayName: session.displayName,
          ref: { projectName: name, sessionId: session.id },
          status: session.status,
          subtitle: session.lastCommand,
          type: "terminal",
          updatedAt: session.updatedAt,
        });
      }
    });
    return { candidates, isLoaded };
    // names/agentQueries/terminalQueries/isGlobal/projects 由 dataKey fingerprint 覆盖（data 变 → timestamp 变）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey]);
}

/**
 * 当前 scope 的活跃实例有序列表（移动 ‹› 切换用，Stage 5-C）。project scope：该项目
 * agent + terminal sessions（createdAt 升序，agents 在前 terminals 在后，与左栏 Agents/
 * Terminals 分段一致）；global scope：rankGlobalInstances 排序（needs-interaction >
 * running > terminal）。query key 复用左栏 / 全局候选缓存（单一数据管道，无并行分支）。
 * 返回 WorkbenchPanelRef[]，供移动 ‹› 按 index 循环切换。
 */
export function useScopeInstanceOrder(scope: WorkbenchScope): WorkbenchPanelRef[] {
  const projectKey = scope.kind === "project" ? scope.key : null;
  const agents = useQuery({
    enabled: projectKey !== null,
    queryKey: ["projects", projectKey ?? "", "agent-sessions"],
    queryFn: () => listAgentSessions(projectKey as string),
    staleTime: 5_000,
  });
  const terminals = useQuery({
    enabled: projectKey !== null,
    queryKey: ["projects", projectKey ?? "", "terminal-sessions"],
    queryFn: () => listTerminalSessions(projectKey as string),
    staleTime: 5_000,
  });
  const { candidates } = useGlobalInstanceCandidates(scope);
  if (scope.kind !== "project") return rankGlobalInstances(candidates);
  const refs: WorkbenchPanelRef[] = [];
  for (const session of agents.data?.sessions ?? []) {
    refs.push({ projectName: scope.key, sessionId: session.id });
  }
  for (const session of terminals.data?.sessions ?? []) {
    refs.push({ projectName: scope.key, sessionId: session.id });
  }
  return refs;
}

/**
 * 项目活跃实例列表（P3 grid 视图 project scope 数据源）。query key 与 ProjectInstances
 *（left-rail）/ useScopeInstanceOrder 一致，React Query dedupe 零额外网络。merge agent +
 * terminal sessions 成有序 entries（agents 在前 terminals 在后，与左栏分段一致）。
 * `projectName === null`（global scope）短路返回空，不发请求——grid 在 global 改用 candidates。
 * dataKey fingerprint（dataUpdatedAt）让返回引用在 data 不变时稳定（下游 useMemo([instances]) 有效）。
 */
export type ProjectInstanceEntry = {
  session: AgentSession | TerminalSession;
  type: "agent" | "terminal";
};

export function useProjectInstances(projectName: string | null): {
  instances: ProjectInstanceEntry[];
  isLoading: boolean;
} {
  const agents = useQuery({
    enabled: projectName !== null,
    queryKey: ["projects", projectName ?? "", "agent-sessions"],
    queryFn: () => listAgentSessions(projectName as string),
    staleTime: 5_000,
  });
  const terminals = useQuery({
    enabled: projectName !== null,
    queryKey: ["projects", projectName ?? "", "terminal-sessions"],
    queryFn: () => listTerminalSessions(projectName as string),
    staleTime: 5_000,
  });
  const dataKey = `${projectName ?? ""}|${agents.dataUpdatedAt}|${terminals.dataUpdatedAt}`;
  return useMemo(() => {
    if (projectName === null) return { instances: [], isLoading: false };
    const instances: ProjectInstanceEntry[] = [
      ...(agents.data?.sessions ?? []).map((session) => ({
        session: session as AgentSession,
        type: "agent" as const,
      })),
      ...(terminals.data?.sessions ?? []).map((session) => ({
        session: session as TerminalSession,
        type: "terminal" as const,
      })),
    ];
    // isLoading = 任一 query pending 即算加载中（||）：agent pending + terminal 已回空时，
    // instances 仍空 + isLoading true → 显示骨架；用 && 会让先 resolved 的那个把 isLoading 提前置 false，
    // 首屏空数据时误显空态而非骨架。
    return { instances, isLoading: agents.isLoading || terminals.isLoading };
    // projectName/agents/terminals 由 dataKey fingerprint 覆盖（data 变 → dataUpdatedAt 变）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey]);
}

function EmptyInstanceArea({
  create,
  hasActiveInstances = false,
  projectName,
}: {
  create: CreateSessionApi | null;
  /** 右侧无 tab 时区分双语义（设计 §14）：true=有活跃实例但未打开（空态提示，无创建入口）；
   * false=真无活跃实例（创建态 + CreateSessionBar）。左总览调用默认 false。 */
  hasActiveInstances?: boolean;
  projectName: string | null;
}) {
  const { t } = useT();
  return (
    <div className="flex h-full items-center justify-center p-6" data-drop-empty="">
      <div
        className={`flex min-h-32 flex-1 flex-col items-center justify-center gap-3 rounded-2xl ${shellSurfaceClasses.inset}`}
      >
        {hasActiveInstances ? (
          // 双语义（设计 §14）：有活跃实例但右侧无 tab（全最小化 / 刚进 scope 无 focusId）→ 空态提示，
          // 不显示创建入口（实例已存在，只是未打开）。global 同理。
          <p className="text-sm text-on-surface-muted">{t("workbench.emptyInstanceNoTab")}</p>
        ) : projectName !== null && create ? (
          <>
            <p className="text-sm text-on-surface-muted">{t("workbench.emptyInstanceHint")}</p>
            <CreateSessionBar
              isCreating={create.isCreating}
              onCreateAgent={create.createAgent}
              onCreateTerminal={create.createTerminal}
            />
          </>
        ) : projectName !== null ? (
          <p className="text-sm text-on-surface-muted">{t("workbench.emptyInstanceHint")}</p>
        ) : (
          <p className="text-sm text-on-surface-muted">{t("workbench.emptyInstanceGlobalHint")}</p>
        )}
      </div>
    </div>
  );
}

/**
 * grid 卡片回调集合：onSelect/onClose 按 sessionId+type 重建，t 翻译 status label + relativeTime。
 * `t` 用 TranslateFn（带 params）——卡片 meta 行的 activity（relativeTime）内部
 * `t("time.minutesAgo", {count})` 需要第二参数。调用方 `useT().t` 已是 TranslateFn。
 */
export type GridItemCallbacks = {
  onClose?: (sessionId: string, type: "agent" | "terminal") => void;
  onRename?: (
    sessionId: string,
    type: "agent" | "terminal",
    currentName: string,
    projectName: string,
  ) => void;
  onSelect: (sessionId: string) => void;
  t: TranslateFn;
};

/** InstanceCard 自适应网格（设计文档 §8）。纯 presentational——items 由调用方从 query/candidates 派生。
 * 可选 `dragAdapter` + `dragRefs`：桌面左总览传时，每个卡片用 DragSourceCard 包装启用拖放；
 * 移动端 / left-rail 不传 → 退化纯 InstanceCard（零回归）。dragRefs 按 InstanceGridItem.key
 *（= sessionId）查 WorkbenchPanelRef。 */
export function InstanceGrid({
  items,
  dragAdapter,
  dragRefs,
}: {
  items: InstanceGridItem[];
  dragAdapter?: DragSourceAdapter;
  dragRefs?: Map<string, WorkbenchPanelRef>;
}) {
  return (
    <div className="grid gap-2" style={INSTANCE_GRID_STYLE}>
      {items.map(({ key, ...card }) =>
        dragAdapter && dragRefs ? (
          <DragSourceCard
            dragRef={dragRefs.get(key) ?? { projectName: "", sessionId: key }}
            key={key}
            onDragStart={dragAdapter.onDragStart}
            onSelect={() => dragAdapter.onSelect(key)}
          >
            <InstanceCard {...card} />
          </DragSourceCard>
        ) : (
          <InstanceCard key={key} {...card} />
        ),
      )}
    </div>
  );
}

/**
 * 项目实例 → InstanceGridItem（marker 按 type/provider，status 映射 pill，title=displayName）。
 * activity = relativeTime(updatedAt ?? agent.createdAt)，terminal 无 createdAt 故仅 updatedAt。
 * subtitle = agent.lastAssistantMessage / terminal.lastCommand（卡片第二行，缺失则不显）。
 * **不传 projectName prop**：project scope 卡片所在总览 header 已显项目名（scope.key），卡片再显冗余。
 * 但 onRename 闭包需 projectName 调 rename API，故 projectName 作为函数参数显式传入（调用方从 scope 取）。
 */
export function instanceToGridItem(
  entry: ProjectInstanceEntry,
  cb: GridItemCallbacks,
  projectName: string,
): InstanceGridItem {
  const provider = entry.type === "agent" ? (entry.session as AgentSession).provider : undefined;
  const session = entry.session;
  const activityIso =
    session.updatedAt ?? (entry.type === "agent" ? (session as AgentSession).createdAt : undefined);
  const subtitle =
    entry.type === "agent"
      ? (session as AgentSession).lastAssistantMessage
      : (session as TerminalSession).lastCommand;
  const onClose = cb.onClose;
  const onRename = cb.onRename;
  return {
    actionsLabel: cb.t("session.actions"),
    activity: relativeTime(activityIso ?? "", cb.t),
    closeLabel: cb.t("session.close"),
    key: session.id,
    marker: sessionMarker(entry.type, provider, "lg"),
    onClose: onClose ? () => onClose(session.id, entry.type) : undefined,
    onRename: onRename
      ? () => onRename(session.id, entry.type, session.displayName, projectName)
      : undefined,
    onSelect: () => cb.onSelect(session.id),
    renameLabel: cb.t("session.rename"),
    status: {
      label: cb.t(sessionStatusLabel(session.status)),
      tone: statusToTone(session.status),
    },
    subtitle,
    title: session.displayName,
  };
}

/**
 * 全局候选 → InstanceGridItem（candidate 已带 provider/type/status/displayName/subtitle）。
 * 卡片 meta 行显 projectName + activity（跨项目总览需项目名区分归属；relativeTime(updatedAt ?? createdAt)）。
 */
export function candidateToGridItem(
  candidate: GlobalInstanceCandidate,
  cb: GridItemCallbacks,
): InstanceGridItem {
  const onClose = cb.onClose;
  const onRename = cb.onRename;
  return {
    actionsLabel: cb.t("session.actions"),
    activity: relativeTime(candidate.updatedAt ?? candidate.createdAt ?? "", cb.t),
    closeLabel: cb.t("session.close"),
    key: candidate.ref.sessionId,
    marker: sessionMarker(candidate.type, candidate.provider, "lg"),
    onClose: onClose ? () => onClose(candidate.ref.sessionId, candidate.type) : undefined,
    onRename: onRename
      ? () =>
          onRename(
            candidate.ref.sessionId,
            candidate.type,
            candidate.displayName,
            candidate.ref.projectName,
          )
      : undefined,
    onSelect: () => cb.onSelect(candidate.ref.sessionId),
    projectName: candidate.ref.projectName,
    renameLabel: cb.t("session.rename"),
    status: {
      label: cb.t(sessionStatusLabel(candidate.status)),
      tone: statusToTone(candidate.status),
    },
    subtitle: candidate.subtitle,
    title: candidate.displayName,
  };
}

/**
 * table 列回调：与 GridItemCallbacks 同源语义（onSelect 进聚焦 / onClose 走 useCloseSession），
 * `t` 用 TranslateFn（带 params）——relativeTime 内部 `t("time.minutesAgo", {count})` 需要第二参数。
 * 与 GridItemCallbacks 等价；保留独立类型因 table 行映射（instanceToTableRow/candidateToTableRow）
 * 与 grid 映射是平行的两套 presentational 投影。
 */
export type TableRowCallbacks = {
  onClose?: (sessionId: string, type: "agent" | "terminal") => void;
  onSelect: (sessionId: string) => void;
  t: TranslateFn;
};

/** 项目实例 → SessionTableRow（activityIso = updatedAt ?? createdAt；terminal 无 createdAt）。 */
export function instanceToTableRow(
  entry: ProjectInstanceEntry,
  cb: TableRowCallbacks,
): SessionTableRow {
  const session = entry.session;
  const activityIso =
    session.updatedAt ?? (entry.type === "agent" ? (session as AgentSession).createdAt : undefined);
  const onClose = cb.onClose;
  return {
    activityIso,
    displayName: session.displayName,
    key: session.id,
    onClose: onClose ? () => onClose(session.id, entry.type) : undefined,
    onFocus: () => cb.onSelect(session.id),
    provider: entry.type === "agent" ? (session as AgentSession).provider : undefined,
    status: {
      label: cb.t(sessionStatusLabel(session.status)),
      tone: statusToTone(session.status),
    },
    type: entry.type,
  };
}

/** 全局候选 → SessionTableRow（candidate 已带 updatedAt/createdAt/provider/projectName）。 */
export function candidateToTableRow(
  candidate: GlobalInstanceCandidate,
  cb: TableRowCallbacks,
): SessionTableRow {
  const onClose = cb.onClose;
  return {
    activityIso: candidate.updatedAt ?? candidate.createdAt,
    displayName: candidate.displayName,
    key: candidate.ref.sessionId,
    onClose: onClose ? () => onClose(candidate.ref.sessionId, candidate.type) : undefined,
    onFocus: () => cb.onSelect(candidate.ref.sessionId),
    projectName: candidate.ref.projectName,
    provider: candidate.provider,
    status: {
      label: cb.t(sessionStatusLabel(candidate.status)),
      tone: statusToTone(candidate.status),
    },
    type: candidate.type,
  };
}

type GroupedViewProps = {
  candidates: GlobalInstanceCandidate[];
  onClose: (sessionId: string, type: "agent" | "terminal") => void;
  onFocus: (sessionId: string) => void;
  onRename: (
    sessionId: string,
    type: "agent" | "terminal",
    currentName: string,
    projectName: string,
  ) => void;
  t: TranslateFn;
  dragAdapter?: DragSourceAdapter;
};

/**
 * grouped 视图（设计文档 §5：仅桌面 global 跨项目分组）。groupByProject 按项目分段，每组
 * 项目名标题（与移动 MobileGlobalOverview 同款 className）+ InstanceGrid。回调复用 InstanceArea
 * 的 focusInstance/closeInstance/renameInstance（与 grid 视图同源）。dragAdapter 桌面左总览
 * 传时启用拖放（每个 candidate.ref 进 dragRefs）。
 */
function GroupedView({ candidates, onClose, onFocus, onRename, t, dragAdapter }: GroupedViewProps) {
  const groups = groupByProject(candidates);
  const callbacks: GridItemCallbacks = { onClose, onRename, onSelect: onFocus, t };
  return (
    <div className="h-full overflow-y-auto">
      {groups.map((group) => {
        const dragRefs = new Map<string, WorkbenchPanelRef>();
        for (const c of group.candidates) dragRefs.set(c.ref.sessionId, c.ref);
        return (
          <div className="flex flex-col gap-2 px-3 py-2" key={group.projectName}>
            <ShellSectionLabel>{group.projectName}</ShellSectionLabel>
            <InstanceGrid
              dragAdapter={dragAdapter}
              dragRefs={dragRefs}
              items={group.candidates.map((c) => candidateToGridItem(c, callbacks))}
            />
          </div>
        );
      })}
    </div>
  );
}

function PlaceholderPanel({ focusId }: { focusId: string }) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div
        className={`rounded-2xl px-4 py-3 font-mono text-xs text-on-surface-muted ${shellSurfaceClasses.inset}`}
      >
        {focusId}
      </div>
    </div>
  );
}

/**
 * 右工作区活动组 header = tab 栏（设计 §7.1）：每个 tab 一个实例 chip（marker + 名 + ✕），
 * 右侧 ▢ 最大化（group 级独占）。tab ✕ = 最小化（移除 tab，session 存活回左总览，设计 §7.2）；
 * 关闭实例 kill 不放 tab ✕（走左总览卡片 close，避免高频按钮触发破坏性 kill）。usePanelMeta
 * 从实例 detail query 派生（与 PanelRouter 同源 query key，React Query dedupe）。
 */
function GroupHeader({
  group,
  isMaximized,
  onCloseTab,
  onSelectTab,
  onTabContextMenu,
  onTabDragStart,
  onToggleMaximize,
}: GroupHeaderProps) {
  const { t } = useT();
  const maximizeLabelKey = isMaximized ? "workbench.panelRestore" : "workbench.panelMaximize";
  return (
    <div className="flex h-9 shrink-0 items-center gap-1 border-b border-on-surface/5 px-1.5">
      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
        {group.tabs.map((tab) => (
          <TabChip
            isActive={tab.sessionId === group.activeTabId}
            key={tab.sessionId}
            onClose={() => onCloseTab(tab.sessionId)}
            onContextMenu={(event) => onTabContextMenu(tab.sessionId, event)}
            onDragStart={onTabDragStart}
            onSelect={() => onSelectTab(tab.sessionId)}
            panelRef={tab}
          />
        ))}
      </div>
      <button
        aria-label={t(maximizeLabelKey)}
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-on-surface-muted transition hover:bg-on-surface/5 hover:text-on-surface"
        onClick={onToggleMaximize}
        title={t(maximizeLabelKey)}
        type="button"
      >
        <ShellIcon className="h-3 w-3" name={isMaximized ? "restore" : "maximize"} />
      </button>
    </div>
  );
}

type GroupHeaderProps = {
  group: WorkbenchGroup;
  isMaximized: boolean;
  onCloseTab: (tabId: string) => void;
  onSelectTab: (tabId: string) => void;
  onTabContextMenu: (tabId: string, event: MouseEvent<HTMLDivElement>) => void;
  onTabDragStart: (ref: WorkbenchPanelRef, event: PointerEvent<HTMLDivElement>) => void;
  onToggleMaximize: () => void;
};

type TabChipProps = {
  isActive: boolean;
  onClose: () => void;
  onContextMenu: (event: MouseEvent<HTMLDivElement>) => void;
  onDragStart: (ref: WorkbenchPanelRef, event: PointerEvent<HTMLDivElement>) => void;
  onSelect: () => void;
  panelRef: WorkbenchPanelRef;
};

/**
 * group 内单个 tab chip（设计 §7.1）：marker + 实例名（点击 = 切活动 tab）+ ✕（最小化）。
 * active tab ✕ 常显，非 active hover 才显（减少视觉噪音）。usePanelMeta 派生 marker + label。
 *
 * 外层 DragSourceCard 启用拖动（设计 §7.3 tab 跨 group 拖动）：pointermove 超阈值 →
 * onCardDragStart → dragState → DropZoneOverlay 显示 drop zone。单击（未超阈值）select/close
 * button 仍走各自 onClick（DragSourceCard.inClose=true 跳过其 onSelect，避免双触发）。
 *
 * 右键 tab（设计 §7.1）弹轻量菜单「最小化」+「关闭实例 kill」（onContextMenu 上传坐标，
 * InstanceArea 渲染 TabContextMenu）。浏览器原生 contextmenu 默认行为 preventDefault 抑制。
 */
function TabChip({
  isActive,
  onClose,
  onContextMenu,
  onDragStart,
  onSelect,
  panelRef,
}: TabChipProps) {
  const { t } = useT();
  const meta = usePanelMeta(panelRef);
  const label = meta?.label ?? panelRef.sessionId.slice(0, 12);
  return (
    <DragSourceCard dragRef={panelRef} onDragStart={onDragStart} onSelect={onSelect}>
      <div
        className={`group/tab flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-sm transition ${
          isActive
            ? "bg-on-surface/10 text-on-surface"
            : "text-on-surface-muted hover:bg-on-surface/5"
        }`}
        onContextMenu={(event) => {
          event.preventDefault();
          onContextMenu(event);
        }}
      >
        <button className="flex min-w-0 items-center gap-1.5" onClick={onSelect} type="button">
          {meta?.marker ?? null}
          <span className="max-w-[8rem] truncate">{label}</span>
        </button>
        <button
          aria-label={t("workbench.tabMinimize")}
          className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-on-surface-muted transition hover:bg-on-surface/10 hover:text-on-surface ${
            isActive ? "opacity-100" : "opacity-0 group-hover/tab:opacity-100"
          }`}
          onClick={onClose}
          title={t("workbench.tabMinimize")}
          type="button"
        >
          <ShellIcon className="h-3 w-3" name="close" />
        </button>
      </div>
    </DragSourceCard>
  );
}

// ── Phase B 拖放分屏组件（设计 §7.2/§7.4）────────────────────────────────────

type DragSourceCardProps = {
  children: ReactNode;
  dragRef: WorkbenchPanelRef;
  onDragStart: (ref: WorkbenchPanelRef, event: PointerEvent<HTMLDivElement>) => void;
  onSelect: () => void;
};

/**
 * 拖动源卡片包装（设计 §7.2）。仅桌面左总览使用（InstanceGrid dragAdapter 启用）——包装
 * InstanceCard，在其 onPointerDown 启动拖动状态机：pointermove 累计位移 ≥ DRAG_THRESHOLD_PX
 * → 进拖动态（调 onDragStart）；未超阈值 + pointerup → 直接调 onSelect（单击激活，Phase A
 * 行为，不依赖 click 合成 —— pointer sequence 可能抑制 click，且走 DOM .click() 会误触
 * InstanceCard 内部 close 按钮）。
 *
 * 起始 target 落在 close 按钮（[role="button"] 内的 <button>）内时，pointerup 不调 onSelect
 * —— 让 close 按钮自身的 onClick 走原生 click 路径（其 onClick 内 stopPropagation 阻止
 * InstanceCard 根 onClick，故不会重复触发 select）。
 *
 * touch pointerType 直接 return（移动端无拖放，MobileWorkbench 不渲染 InstanceArea）。
 * touch-action: pan-y 保留触摸纵向滚动（overview 列表可滚动），仅鼠标拖放场景生效。
 * 不加 setPointerCapture 到自身：拖动态期间 elementFromPoint 需要能命中下层 group 的
 * data-drop-group，capture 在源卡片会让 elementFromPoint 返回源卡片自身。改为不 capture，
 * 仅用 dragState state + 全局 pointermove 监听（DropZoneOverlay 内处理 hit-test）。
 */
function DragSourceCard({ children, dragRef, onDragStart, onSelect }: DragSourceCardProps) {
  const startRef = useRef<{ x: number; y: number; inClose: boolean } | null>(null);
  const draggingRef = useRef(false);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") return; // 移动端无拖放
    if (event.button !== 0) return;
    // 起始 target 在 close 按钮内 → 单击走 close 路径，不进拖动态也不调 onSelect。
    const inClose = !!(event.target as HTMLElement).closest("button");
    startRef.current = { x: event.clientX, y: event.clientY, inClose };
    draggingRef.current = false;
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = startRef.current;
    if (!start || draggingRef.current) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (dx * dx + dy * dy >= DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
      draggingRef.current = true;
      onDragStart(dragRef, event);
    }
  };

  const endPointer = (event: PointerEvent<HTMLDivElement>) => {
    const start = startRef.current;
    const wasDragging = draggingRef.current;
    startRef.current = null;
    draggingRef.current = false;
    if (wasDragging) {
      // 拖动态结束：DropZoneOverlay 的 onDrop 负责落盘，这里不调 onSelect。
      event.stopPropagation();
      return;
    }
    // 单击：未超阈值 → 调 onSelect（Phase A 激活）。close 按钮内起始的单击跳过（让原生
    // click 走 close 按钮自身 onClick）。
    if (start && !start.inClose) {
      onSelect();
    }
  };

  return (
    <div
      className="min-w-0"
      onPointerCancel={endPointer}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      style={{ touchAction: "pan-y" }}
    >
      {children}
    </div>
  );
}

type SplitGutterProps = {
  /** gutter 朝向（设计 §7.4）：col=同行相邻 group 间横向列宽（cursor-col-resize， deltaX/父宽）；
   * row=行间纵向高度（cursor-row-resize， deltaY/父高）。父 = parentElement（行 div / 外网格 div）。 */
  orientation: "col" | "row";
  /** 拖拽增量（本次 move 的 delta / 父尺寸，无量纲比例）；上层按行/列 totalFlex 转 deltaFlex。 */
  onResize: (ratioDelta: number) => void;
};

/**
 * 相邻区域分隔条（设计 §7.3/§7.4）。flex item（w-1 col / h-1 row，shrink-0），pointer-event 增量
 * 拖拽：每次 move 算 delta（col=clientX/父宽，row=clientY/父高，parentElement.getBoundingClientRect）
 * → onResize(ratioDelta)；上层 resizeGroups/resizeRows 基于当前 layout 增量更新 sizes/rowSizes
 *（key=groupId / 行首 groupId），守恒钳制。setPointerCapture 锁指针到 gutter，拖拽时即使滑过面板
 * 仍持续触发。复活自 P5 split-panel.tsx（三态已废弃，gutter 通用）。
 */
function SplitGutter({ orientation, onResize }: SplitGutterProps) {
  const gutterRef = useRef<HTMLDivElement>(null);
  const lastPos = useRef<number | null>(null);
  const isRow = orientation === "row";

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    lastPos.current = isRow ? event.clientY : event.clientX;
    void gutterRef.current?.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (lastPos.current === null) return;
    const parent = gutterRef.current?.parentElement;
    const size = isRow
      ? (parent?.getBoundingClientRect().height ?? 1)
      : (parent?.getBoundingClientRect().width ?? 1);
    const current = isRow ? event.clientY : event.clientX;
    const delta = current - lastPos.current;
    lastPos.current = current;
    onResize(delta / size);
  };
  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    lastPos.current = null;
    void gutterRef.current?.releasePointerCapture(event.pointerId);
  };

  return (
    <div
      aria-hidden
      className={`${isRow ? "h-1 cursor-row-resize" : "w-1 cursor-col-resize"} shrink-0 rounded-full bg-on-surface/5 transition-colors hover:bg-on-surface/20`}
      onPointerCancel={endDrag}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      ref={gutterRef}
    />
  );
}

// ── V3 n 叉树渲染（设计 §7.5）──────────────────────────────────────────────────────────────

type WorkspaceTreeHandlers = {
  activeZone: { targetGroupId: string | null; zone: DropZone } | null;
  draggingRef: WorkbenchPanelRef | null;
  onCloseLeafTab: (leafId: string, tabId: string) => void;
  onResizeSplit: (
    splitId: string,
    leftChildId: string,
    rightChildId: string,
    deltaFlex: number,
  ) => void;
  onSelectTab: (leafId: string, tabId: string) => void;
  onTabContextMenu: (leafId: string, tabId: string, x: number, y: number) => void;
  onTabDragStart: (ref: WorkbenchPanelRef, event: PointerEvent<HTMLDivElement>) => void;
  onToggleMaximize: (leafId: string) => void;
};

type WorkspaceTreeProps = WorkspaceTreeHandlers & {
  create: CreateSessionApi | null;
  hasActiveInstances: boolean;
  maximized: string | null;
  projectName: string | null;
  root: TreeNode | null;
};

/** 把 leaf 适配成 GroupCell props（TreeNodeRender leaf 分支与 maximized 短路共用）。 */
function renderLeaf(leaf: LeafNode, isMaximized: boolean, handlers: WorkspaceTreeHandlers) {
  return (
    <GroupCell
      activeZone={handlers.activeZone}
      dragRef={handlers.draggingRef}
      flex={1}
      group={leaf}
      isMaximized={isMaximized}
      onCloseTab={(tabId) => handlers.onCloseLeafTab(leaf.id, tabId)}
      onSelectTab={(tabId) => handlers.onSelectTab(leaf.id, tabId)}
      onTabContextMenu={(tabId, event) =>
        handlers.onTabContextMenu(leaf.id, tabId, event.clientX, event.clientY)
      }
      onTabDragStart={handlers.onTabDragStart}
      onToggleMaximize={() => handlers.onToggleMaximize(leaf.id)}
    />
  );
}

type TreeNodeRenderProps = {
  flexWeight: number;
  node: TreeNode;
} & WorkspaceTreeHandlers;

/**
 * 递归渲染 TreeNode（设计 §7.5）。leaf → wrapper div（设 flex 权重）+ GroupCell(flex=1 填满)；
 * split → flex 容器（horizontal=flex-row / vertical=flex-col）+ children 间插 SplitGutter
 *（orientation 由 direction 决定；onResize 把 ratio×totalFlex 转 deltaFlex 给 resizeSplitChildren）。
 * wrapper 与 split div 均 min-h-0 min-w-0 防 flex 压溃；gap-1 与 V2 WorkspaceGrid 一致。
 */
function TreeNodeRender({ flexWeight, node, ...handlers }: TreeNodeRenderProps): ReactNode {
  if (node.kind === "leaf") {
    return (
      <div className="flex min-h-0 min-w-0" style={{ flex: `${flexWeight} 1 0` }}>
        {renderLeaf(node, false, handlers)}
      </div>
    );
  }
  const orientation: "col" | "row" = node.direction === "horizontal" ? "col" : "row";
  const containerClass =
    node.direction === "horizontal"
      ? "flex min-h-0 min-w-0 gap-1"
      : "flex min-h-0 min-w-0 flex-col gap-1";
  const totalFlex = node.children.reduce(
    (sum, c) => sum + (node.sizes[c.id] ?? WORKBENCH_PANEL_DEFAULT_FLEX),
    0,
  );
  return (
    <div className={containerClass} style={{ flex: `${flexWeight} 1 0` }}>
      {node.children.flatMap((child, i) => {
        const childWeight = node.sizes[child.id] ?? WORKBENCH_PANEL_DEFAULT_FLEX;
        const cells: ReactNode[] = [
          <TreeNodeRender flexWeight={childWeight} key={child.id} node={child} {...handlers} />,
        ];
        if (i < node.children.length - 1) {
          const next = node.children[i + 1];
          cells.push(
            <SplitGutter
              key={`gutter-${child.id}-${next.id}`}
              onResize={(ratio) =>
                handlers.onResizeSplit(node.id, child.id, next.id, ratio * totalFlex)
              }
              orientation={orientation}
            />,
          );
        }
        return cells;
      })}
    </div>
  );
}

/**
 * 右工作区 n 叉树渲染（V3，设计 §7.5）。root=null → EmptyInstanceArea；maximized 短路只渲染该
 * leaf（对齐 V2 WorkspaceGrid 经 deriveGroupRows 收敛单 group 的行为）；否则递归 TreeNodeRender。
 * C3 新增但未启用：InstanceArea 仍渲染 V2 WorkspaceGrid，C4 切换数据流后接管。
 */
export function WorkspaceTree({
  root,
  maximized,
  create,
  hasActiveInstances,
  projectName,
  ...handlers
}: WorkspaceTreeProps) {
  if (root === null) {
    return (
      <EmptyInstanceArea
        create={create}
        hasActiveInstances={hasActiveInstances}
        projectName={projectName}
      />
    );
  }
  if (maximized !== null) {
    const maxLeaf = findLeafNode(root, maximized);
    if (maxLeaf) {
      return (
        <div className="flex h-full min-h-0 w-full p-1">{renderLeaf(maxLeaf, true, handlers)}</div>
      );
    }
  }
  return (
    <div className="flex h-full min-h-0 w-full p-1">
      <TreeNodeRender flexWeight={WORKBENCH_PANEL_DEFAULT_FLEX} node={root} {...handlers} />
    </div>
  );
}

type GroupCellProps = {
  activeZone: { targetGroupId: string | null; zone: DropZone } | null;
  dragRef: WorkbenchPanelRef | null;
  flex: number;
  group: WorkbenchGroup;
  isMaximized: boolean;
  onCloseTab: (tabId: string) => void;
  onSelectTab: (tabId: string) => void;
  onTabContextMenu: (tabId: string, event: MouseEvent<HTMLDivElement>) => void;
  onTabDragStart: (ref: WorkbenchPanelRef, event: PointerEvent<HTMLDivElement>) => void;
  onToggleMaximize: () => void;
};

/**
 * 单个 group 单元格 = GroupHeader（tab 栏）+ N 个 PanelRouter（active 可见，其他 hidden 保
 * WebSocket/relay）。标注 data-drop-group={groupId} 让 DropZoneOverlay 的 elementFromPoint 命中。
 * 拖动态期间整体 pointer-events:none 让 elementFromPoint 落到 overlay 下层 group（pointer
 * capture 在源卡片，overlay 不接 pointer 事件，仅视觉高亮）。非拖动态正常接交互（PanelRouter
 * 输入框/终端点击）。tab 用 CSS hidden 不 unmount —— claude2 relay 从不重读 JSONL，unmount
 * 重连丢早消息；xterm dispose/重建抖动（设计 §7.4）。
 */
function GroupCell({
  activeZone,
  dragRef,
  flex,
  group,
  isMaximized,
  onCloseTab,
  onSelectTab,
  onTabContextMenu,
  onTabDragStart,
  onToggleMaximize,
}: GroupCellProps) {
  const isDraggingThis = dragRef
    ? group.tabs.some((t) => t.sessionId === dragRef.sessionId)
    : false;
  const isDropTarget = activeZone?.targetGroupId === group.id;
  return (
    <div
      className={`relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg ${shellSurfaceClasses.workspace} ${
        isDraggingThis ? "opacity-40" : ""
      }`}
      data-drop-group={group.id}
      style={{ flex: `${flex} 1 0` }}
    >
      <GroupHeader
        group={group}
        isMaximized={isMaximized}
        onCloseTab={onCloseTab}
        onSelectTab={onSelectTab}
        onTabContextMenu={onTabContextMenu}
        onTabDragStart={onTabDragStart}
        onToggleMaximize={onToggleMaximize}
      />
      <div className="relative min-h-0 flex-1">
        {group.tabs.map((tab) => (
          <div
            className={
              tab.sessionId === group.activeTabId
                ? "absolute inset-0 flex min-h-0 flex-col"
                : "hidden"
            }
            key={tab.sessionId}
          >
            <PanelRouter panelRef={tab} />
          </div>
        ))}
      </div>
      {isDropTarget ? <DropZoneHighlight zone={activeZone?.zone ?? "center"} /> : null}
    </div>
  );
}

/** drop zone aria-label key 映射（5 zone + 空白区）。 */
const DROP_ZONE_LABEL_KEY: Record<DropZone, TranslationKey> = {
  up: "workbench.dropUp",
  down: "workbench.dropDown",
  left: "workbench.dropLeft",
  right: "workbench.dropRight",
  center: "workbench.dropCenter",
};

/**
 * 单个 group 上的 5 zone 视觉高亮（设计 §7.2 ASCII 图）。zone 对应位置渲染半透明 primary
 * 覆盖层（dashed border + bg-primary/10），其余区域不渲染。仅 activeZone 命中的 group 显示。
 * aria-label 用 zone label key（a11y：屏幕阅读器读出当前 zone 语义）。
 */
function DropZoneHighlight({ zone }: { zone: DropZone }) {
  const { t } = useT();
  const positionClass =
    zone === "up"
      ? "top-0 left-0 right-0 h-1/3"
      : zone === "down"
        ? "bottom-0 left-0 right-0 h-1/3"
        : zone === "left"
          ? "top-0 left-0 bottom-0 w-1/3"
          : zone === "right"
            ? "top-0 right-0 bottom-0 w-1/3"
            : "inset-0";
  return (
    <div
      aria-label={t(DROP_ZONE_LABEL_KEY[zone])}
      className={`pointer-events-none absolute ${positionClass} z-10 border-2 border-dashed border-primary/50 bg-primary/10`}
      role="status"
    />
  );
}

type TabContextMenuProps = {
  anchor: { groupId: string; tabId: string; x: number; y: number };
  onClose: () => void;
  onKill: () => void;
  onMinimize: () => void;
};

/**
 * tab 右键菜单（设计 §7.1）：右键 tab 弹轻量菜单「最小化」+「关闭实例 kill」。自绘（仿
 * SessionDetailActionsMenu），不引入 Radix（与现有模式一致、零新依赖）。absolute 定位在右键
 * pointer 坐标（fixed 锚定视口，不受祖先 transform 影响）；document pointerdown 外点 / Esc 关闭。
 * 「最小化」= removeTabFromGroup（session 存活，同 tab ✕）；「关闭实例」= useCloseSession
 *（自带 confirm → close API → 失效缓存，菜单内不再 confirm）。
 */
function TabContextMenu({ anchor, onClose, onKill, onMinimize }: TabContextMenuProps) {
  const { t } = useT();
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handlePointerDown = (event: globalThis.PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);
  const minimize = () => {
    onMinimize();
  };
  const kill = () => {
    onKill();
  };
  // 钳制菜单不超出视口（1280×800 桌面 + 375×812 移动端，菜单宽 ~160px 高 ~88px）。
  const left = Math.min(anchor.x, window.innerWidth - 170);
  const top = Math.min(anchor.y, window.innerHeight - 100);
  return (
    <div
      className={`fixed z-50 min-w-[10rem] overflow-hidden rounded-lg py-1 text-sm shadow-lg ${shellSurfaceClasses.raised}`}
      ref={menuRef}
      style={{ left, top }}
    >
      <button
        className="flex w-full items-center px-3 py-1.5 text-left text-on-surface transition hover:bg-on-surface/10"
        onClick={minimize}
        type="button"
      >
        {t("workbench.tabMinimize")}
      </button>
      <button
        className="flex w-full items-center px-3 py-1.5 text-left text-error transition hover:bg-error/10"
        onClick={kill}
        type="button"
      >
        {t("workbench.tabKill")}
      </button>
    </div>
  );
}

type DropZoneOverlayProps = {
  activeZone: { targetGroupId: string | null; zone: DropZone } | null;
  dragPointer: { x: number; y: number };
  dragSourceRef: WorkbenchPanelRef | null;
  layout: WorkbenchLayoutV3;
  onCancel: () => void;
  onDrop: () => void;
  onPointerMove: (x: number, y: number) => void;
  onZoneChange: (zone: { targetGroupId: string | null; zone: DropZone } | null) => void;
  t: (key: TranslationKey) => string;
};

/**
 * 拖动态全屏 overlay（设计 §7.2）。自身 pointer-events:none 不拦截 elementFromPoint，下层
 * GroupCell（默认 pointer-events auto）正常命中。在 window pointermove 上 hit-test：
 * elementFromPoint → 找带 data-drop-group 的祖先 → deriveZone(group rect, pointer) → setActiveZone；
 * 同时调 onPointerMove 把指针位置回传给 InstanceArea 更新 dragState（ghost 跟随指针）。
 * pointerup 调 onDrop（dropIntoLeaf + 自动聚焦）。
 *
 * 空白区（layout.root === null）：elementFromPoint 命中 data-drop-empty 容器 → zone=center +
 * targetGroupId=null（dropIntoLeaf 开首个 leaf）。
 */
function DropZoneOverlay({
  activeZone,
  dragPointer,
  dragSourceRef,
  layout,
  onCancel,
  onDrop,
  onPointerMove,
  onZoneChange,
  t,
}: DropZoneOverlayProps) {
  const onWindowPointerMove = useCallback(
    (event: PointerEvent_Window) => {
      onPointerMove(event.clientX, event.clientY);
      const el = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
      if (!el) {
        onZoneChange(null);
        return;
      }
      // 找带 data-drop-group 的祖先（group 单元格）或 data-drop-empty（空白区）。
      const groupEl = el.closest("[data-drop-group]") as HTMLElement | null;
      if (groupEl) {
        const targetGroupId = groupEl.getAttribute("data-drop-group") as string;
        const rect = groupEl.getBoundingClientRect();
        const zone = deriveZone(
          { width: rect.width, height: rect.height, left: rect.left, top: rect.top },
          event.clientX,
          event.clientY,
        );
        if (zone) {
          onZoneChange({ targetGroupId, zone });
        } else {
          onZoneChange(null);
        }
        return;
      }
      const emptyEl = el.closest("[data-drop-empty]") as HTMLElement | null;
      if (emptyEl) {
        onZoneChange({ targetGroupId: null, zone: "center" });
        return;
      }
      onZoneChange(null);
    },
    [onZoneChange, onPointerMove],
  );
  const onWindowPointerUp = useCallback(
    (event: PointerEvent_Window) => {
      // 仅左键释放才 drop（button=0）。pointercancel 直接取消。
      if (event.type === "pointercancel") {
        onCancel();
        return;
      }
      onDrop();
    },
    [onDrop, onCancel],
  );

  useEffect(() => {
    window.addEventListener("pointermove", onWindowPointerMove);
    window.addEventListener("pointerup", onWindowPointerUp);
    window.addEventListener("pointercancel", onWindowPointerUp);
    return () => {
      window.removeEventListener("pointermove", onWindowPointerMove);
      window.removeEventListener("pointerup", onWindowPointerUp);
      window.removeEventListener("pointercancel", onWindowPointerUp);
    };
  }, [onWindowPointerMove, onWindowPointerUp]);

  return (
    <div
      aria-label={t("workbench.dropZoneLabel")}
      className="pointer-events-none fixed inset-0 z-30"
    >
      {/* 空白区高亮（layout 空 + activeZone targetGroupId=null）*/}
      {layout.root === null && activeZone?.targetGroupId === null ? (
        <div
          role="status"
          aria-label={t("workbench.dropToEmpty")}
          className="absolute inset-2 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary/50 bg-primary/10 text-sm font-medium text-primary"
        >
          <span className="pointer-events-none">{t("workbench.dropToEmpty")}</span>
        </div>
      ) : null}
      {dragSourceRef ? <DragGhost panelRef={dragSourceRef} pointer={dragPointer} t={t} /> : null}
    </div>
  );
}

/** 拖动 ghost：跟随指针的小卡片（marker + 实例名），aria 标注拖动中。usePanelMeta 派生
 * 元数据（与 GroupHeader/InstanceCard 同源 query key，React Query dedupe 零额外网络）。 */
function DragGhost({
  panelRef,
  pointer,
  t,
}: {
  panelRef: WorkbenchPanelRef;
  pointer: { x: number; y: number };
  t: (key: TranslationKey) => string;
}) {
  const meta = usePanelMeta(panelRef);
  const label = meta?.label ?? panelRef.sessionId.slice(0, 12);
  return (
    <div
      aria-label={t("workbench.dragging")}
      className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-lg border border-primary/40 bg-surface-raised/90 px-3 py-2 text-xs font-medium text-on-surface shadow-lg backdrop-blur"
      style={{ left: pointer.x, top: pointer.y }}
    >
      {meta?.marker ?? null}
      <span>{label}</span>
    </div>
  );
}

// window PointerEvent 类型别名（与 React PointerEvent 区分，addEventListener 用原生）。
type PointerEvent_Window = globalThis.PointerEvent;
