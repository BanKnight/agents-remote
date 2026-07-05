import {
  type CSSProperties,
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
  type WorkbenchLayout,
  type WorkbenchMiddleTab,
  type WorkbenchPanelRef,
  type WorkbenchScope,
  type WorkbenchView,
  WORKBENCH_MIDDLE_LEFT_MAX_REM,
  WORKBENCH_MIDDLE_LEFT_MIN_REM,
  addPanel,
  deriveRows,
  deriveZone,
  dropPanel,
  filterWorkbenchViews,
  groupByProject,
  inferSessionTypeFromId,
  DRAG_THRESHOLD_PX,
  rankGlobalInstances,
  removePanel,
  resizePair,
  toggleMaximize,
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
import { HistoryList } from "./history-list";
import { FIRST_PARTY_PLUGINS, type PluginContext } from "./right-panel-plugin";
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

/** grid 卡片最小宽度（设计文档 §8：`minmax(220px,1fr)` 自适应，无断点枚举）。 */
export const MIN_CARD_WIDTH_PX = 220;
/**
 * InstanceCard 自适应网格 inline style（桌面 grid / 移动总览共用同源）。用 inline style 而非
 * Tailwind 任意值：`repeat(auto-fill, minmax(...))` 含括号/逗号，Tailwind v4 任意值解析不稳定
 *（dist CSS 实测不落盘 auto-fill 规则）。`auto-fill + minmax` 让列数随容器宽度自适应——手机
 *（390px）1 列、平板（600px+）2 列、桌面更多，无需媒体查询。配合 `grid gap-2` className 使用。
 */
export const INSTANCE_GRID_STYLE: CSSProperties = {
  gridTemplateColumns: `repeat(auto-fill, minmax(${MIN_CARD_WIDTH_PX}px, 1fr))`,
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
 * 样式）+ 右工作区（活动组 = layout.panels[0]，GroupHeader + PanelRouter）。tab 导航常驻
 *（聚焦/非聚焦都不消失——Phase A 痛点修复）。URL focusId = 右工作区活动组（语义不变，
 * 渲染层从单实例 fallthrough 改为左右结构活动组）。layout 进 localStorage，project 按
 * 项目分键；global 聚合所有项目活跃实例（rankGlobalInstances 排序）。
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
  // project-scoped 数据）+ 第一方 inspection 插件按 ctx 过滤（files/git 需 projectKey，
  // prototype 常驻）。复用 plugin.when 作 inspection 可见性单一来源；history 单独 gate
  // projectKey（非 FIRST_PARTY_PLUGINS，是独立数据源 useHistorySessions）。global scope 仅
  // overview + prototype。
  const visibleTabs = useMemo<{ id: WorkbenchMiddleTab; label: string }[]>(() => {
    const options: { id: WorkbenchMiddleTab; label: string }[] = [
      { id: "overview", label: t("workbench.tabOverview") },
    ];
    if (ctx.projectKey !== null) {
      options.push({ id: "history", label: t("workbench.tabHistory") });
    }
    for (const plugin of FIRST_PARTY_PLUGINS) {
      if (plugin.when(ctx)) options.push({ id: plugin.id, label: t(plugin.labelKey) });
    }
    return options;
    // ctx 由 scope 决定（projectKey = scope.key 或 null），scope/t 变才重算。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, t]);
  // URL/atom 的 tab 若在当前 scope 不可见（如 global 下残留 ?tab=files），回退 overview。
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

  // 活动组实例（设计 §13）。多 group 后 focusId 指向活动 group，不一定是 panels[0]。
  // activeRef = focusId 命中的 panel（无 focusId 时取 panels[0] 作非聚焦态展示组）。
  const activeRef = useMemo(
    () =>
      focusId
        ? (layout.panels.find((p) => p.sessionId === focusId) ?? null)
        : (layout.panels[0] ?? null),
    [focusId, layout.panels],
  );
  const rows = useMemo(() => deriveRows(layout), [layout]);

  // focus → 活动组（多 group 语义，Phase B 重写）：URL focusId 变化时确保 focusId 在 panels 中；
  // 不在则替换当前活动组 ref（不踢其他 group）。project scope projectName = scope.key；global
  // scope 从 refs 查 focusId 所属项目（refs 未加载时跳过，加载后 effect 重跑同步）。幂等
  //（focusId 已在 panels 不动），无循环。
  useEffect(() => {
    if (!focusId) return;
    if (layout.panels.some((p) => p.sessionId === focusId)) return;
    const projectName =
      scope.kind === "project" ? scope.key : refs.find((r) => r.sessionId === focusId)?.projectName;
    if (!projectName) return;
    update((prev) => {
      if (prev.panels.some((p) => p.sessionId === focusId)) return prev;
      const newRef: WorkbenchPanelRef = { projectName, sessionId: focusId };
      // 替换当前活动组（activeRef）：保留其位置（panels 索引）+ 行首职责（newRows）+ size。
      const activeIdx = prev.panels.findIndex((p) => p.sessionId === activeRef?.sessionId);
      if (activeIdx < 0) return addPanel(prev, newRef);
      const panels = [...prev.panels];
      const replaced = panels[activeIdx];
      panels[activeIdx] = newRef;
      const newRows = prev.newRows.map((id) => (id === replaced.sessionId ? focusId : id));
      const sizes = { ...prev.sizes };
      const inheritedSize = sizes[replaced.sessionId] ?? prev.sizes[focusId];
      delete sizes[replaced.sessionId];
      if (inheritedSize !== undefined) sizes[focusId] = inheritedSize;
      return { ...prev, panels, newRows, sizes };
    });
    // refs 引用每 render 可能变（useScopeInstanceOrder 返新数组），用 refs.length（number）+ idempotent
    // 守卫稳住；refs.find 读闭包最新值（refs.length 变 → re-render → 新闭包）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, scopeKey, layout.panels.length, refs.length, activeRef?.sessionId]);

  // 非聚焦态进入空 scope：铺首个活跃实例作活动组（设计 §13「右工作区显示 scope 首个活跃
  // 实例」）。聚焦态 / layout 非空（持久化恢复 / focus effect 已填）不介入。candidatesLoaded
  // 守卫：global scope candidates 逐步聚合（projects → 每项目 agent/terminal），未 settled 时
  // refs[0] 是临时首个，铺入 panels[0] 后锁死（length>0 不重铺），后续更紧急实例回来活动组
  // 也不更新；等 isLoaded 再铺最终排序首个。project scope hook 始终返 isLoaded=true，守卫无影响。
  // 无 seededRef：close 当前组后 layout 空 → 铺下一个 refs[0]（设计 §7.3 close 切剩余首个）。
  useEffect(() => {
    if (focusId || layout.panels.length > 0) return;
    if (!candidatesLoaded || refs.length === 0) return;
    update((prev) => addPanel(prev, refs[0]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, layout.panels.length, refs.length, focusId, candidatesLoaded]);

  // split 级 close = 结束实例：复用 useCloseSession（confirm → close API → 精确失效缓存），
  // split 特有尾巴（removePanel + 焦点切换）走 onAfterClose。embedded 面板自带的 header close
  // 在 embedded 模式已隐藏（见 Claude2Chat / SessionDetail），此处为唯一 close。
  const closePanel = (ref: WorkbenchPanelRef) => {
    const sessionType = inferSessionTypeFromId(ref.sessionId);
    if (sessionType !== "agent" && sessionType !== "terminal") return;
    void close(ref, sessionType, () => {
      const remaining = layout.panels.filter((p) => p.sessionId !== ref.sessionId);
      update((prev) => removePanel(prev, ref.sessionId));
      if (focusId === ref.sessionId) {
        void navigateWorkbench(scope, remaining.length > 0 ? remaining[0].sessionId : undefined);
      }
    });
  };

  const focusPanel = (ref: WorkbenchPanelRef) => {
    if (ref.sessionId === focusId) return;
    void navigateWorkbench(scope, ref.sessionId);
  };

  // Phase C group 操作（设计 §7.3）：maximize 全屏/恢复（toggleMaximize 标量翻转，deriveRows
  // maximized 时返单 panel 单行 = 纯派生全屏）；行内列宽 resize（resizePair 守恒钳制左增右减）。
  // sizes + maximized 由 useWorkbenchLayout 持久化，刷新恢复。
  const onToggleMaximize = (sessionId: string) => {
    update((prev) => toggleMaximize(prev, sessionId));
  };
  const onResizePair = (leftId: string, rightId: string, deltaFlex: number) => {
    update((prev) => resizePair(prev, leftId, rightId, deltaFlex));
  };

  // P3 总览视图（设计文档 §5/§8）：overview tab 左总览按 view 渲染（grid 卡片 / grouped 分段 /
  // table 紧凑行）。resolvedView 已在上方定义（初始态 effect 复用）。

  // grid 卡片回调：select 复用 focusPanel 进聚焦态；close 走 useCloseSession（卡片由 query 驱动，
  // invalidate 后自然消失，不调 removePanel —— 与 ProjectInstances card / MobileGlobalOverview 同款）。
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

  // ── Phase B 拖放分屏（设计 §7.2/§7.4）──────────────────────────────────────
  // dragState = 拖动源 ref + 起始 pointer；进态后 elementFromPoint hit-test data-drop-group/
  // data-drop-zone 得 activeZone，pointerup 时 onDrop 调 dropPanel。pointermove < 4px 视为单击
  //（Phase A 行为，手动调 onSelect 不依赖 click 合成）。touch pointerType 不进拖动态（移动端无拖放）。
  const [dragState, setDragState] = useState<{
    ref: WorkbenchPanelRef;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);
  const [activeZone, setActiveZone] = useState<{
    targetSessionId: string | null;
    zone: DropZone;
  } | null>(null);
  // ghost 跟随指针的 ref（拖动态显示 marker + 实例名）。
  const draggingRef = dragState?.ref ?? null;

  const onDrop = useCallback(() => {
    const drag = dragState;
    const zone = activeZone;
    setDragState(null);
    setActiveZone(null);
    if (!drag || !zone) return;
    const prev = layout;
    const next = dropPanel(prev, drag.ref, zone.targetSessionId, zone.zone);
    if (next === prev) return; // noop（自身 drop / target 不在）：跳过 navigate
    update(() => next);
    // drop 后自动聚焦新 group（用户刚拖的实例，预期看其 output）。
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
  const gridCallbacks: GridItemCallbacks = { onClose: closeInstance, onSelect: focusInstance, t };

  // grid 数据源：global 用 candidates（跨项目聚合），project 用 useProjectInstances（本项目全览）。
  const gridItems = useMemo<InstanceGridItem[]>(
    () =>
      scope.kind === "global"
        ? candidates.map((candidate) => candidateToGridItem(candidate, gridCallbacks))
        : projectInstances.instances.map((entry) => instanceToGridItem(entry, gridCallbacks)),
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
  // table 列：global 5 列（含 project）/ project 4 列（隐藏 project，设计 §9）。状态圆点并入 type
  // 列 marker 右上角（StatusMarker），无独立 status 列。
  const tableColumns: TableColumn[] =
    scope.kind === "global"
      ? ["project", "type", "name", "activity", "actions"]
      : ["type", "name", "activity", "actions"];
  // 总览加载态（设计 §5）：pending 且数据仍空时显示 CardGridSkeleton，替代 EmptyInstanceArea
  //（后者是"创建实例"空态，加载中显示会误导用户以为无实例）。project 用 useProjectInstances
  // 的 isLoading，global 用 candidatesLoaded（聚合多 query 的 settled 标量）。
  const overviewLoading =
    scope.kind === "project"
      ? projectInstances.isLoading && projectInstances.instances.length === 0
      : !candidatesLoaded && candidates.length === 0;
  const leftOverviewContent = overviewLoading ? (
    <CardGridSkeleton />
  ) : showGrid ? (
    gridItems.length === 0 ? (
      <EmptyInstanceArea create={create} projectName={ctx.projectKey} />
    ) : (
      <InstanceGrid dragAdapter={dragAdapter} dragRefs={gridDragRefs} items={gridItems} />
    )
  ) : showGrouped ? (
    <GroupedView
      candidates={candidates}
      dragAdapter={dragAdapter}
      onClose={closeInstance}
      onFocus={focusInstance}
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
  //   右工作区常驻活动组）；inspection tab（files/git/prototype）= 全宽 inspection，右工作区临时让位。
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
  // 右工作区 = deriveRows 全网格（设计 §7.4）。多 group 同屏：行 flex-1 等分高度，
  // 行内 panel flex 按 sizes 权重等分宽度。maximized 时 deriveRows 返单 panel 单行全屏。
  // dragState 期间整个 WorkspaceGrid 用 pointer-events:none 让 elementFromPoint 命中 overlay
  // 下层 group 的 data-drop-group（pointer capture 在源卡片，overlay 不接 pointer 事件）。
  const rightWorkspace = (
    <WorkspaceGrid
      activeZone={activeZone}
      create={create}
      draggingRef={draggingRef}
      maximized={layout.maximized}
      onActivateGroup={focusPanel}
      onCloseGroup={closePanel}
      onResizePair={onResizePair}
      onToggleMaximize={onToggleMaximize}
      projectName={ctx.projectKey}
      rows={rows}
      sizes={layout.sizes}
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
        data-drop-empty={layout.panels.length === 0 ? "" : undefined}
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
      {create.promptHolder}
    </div>
  );
}

type PanelRouterProps = {
  panelRef: WorkbenchPanelRef;
};

/**
 * 单面板路由：按 sessionId 前缀推断类型 → 查详情 → 渲染对应面板（claude2→ChatPanel、
 * 其他 agent→AgentTerminalPanel、terminal→TerminalPanel）。复用 Stage 1 的嵌入式面板。
 *
 * 右工作区活动组 + 移动单实例聚焦共用：桌面右工作区 GroupHeader 下调一次，
 * 移动聚焦态调一次（不 split，单实例）。面板内部依赖父级 flex-col 让 flex-1 runtime
 * body 撑满，调用方容器须 `flex min-h-0 flex-1 flex-col overflow-hidden`。
 */
export function PanelRouter({ panelRef }: PanelRouterProps) {
  const sessionType = inferSessionTypeFromId(panelRef.sessionId);
  if (sessionType === "agent") {
    return <AgentPanelRouter panelRef={panelRef} />;
  }
  if (sessionType === "terminal") {
    return <TerminalPanelRouter panelRef={panelRef} />;
  }
  return <PlaceholderPanel focusId={panelRef.sessionId} />;
}

function AgentPanelRouter({ panelRef }: PanelRouterProps) {
  const detail = useAgentDetail(panelRef);
  if (detail.isLoading) return <LoadingPanel />;
  if (detail.data?.session.provider === "claude2") {
    return <ChatPanel projectName={panelRef.projectName} sessionId={panelRef.sessionId} />;
  }
  if (detail.data?.session) {
    return <AgentTerminalPanel projectName={panelRef.projectName} sessionId={panelRef.sessionId} />;
  }
  return <PlaceholderPanel focusId={panelRef.sessionId} />;
}

function TerminalPanelRouter({ panelRef }: PanelRouterProps) {
  const detail = useTerminalDetail(panelRef);
  if (detail.isLoading) return <LoadingPanel />;
  if (detail.data?.session) {
    return <TerminalPanel projectName={panelRef.projectName} sessionId={panelRef.sessionId} />;
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
 * 聚焦态 header displayName（设计文档 §15）。按 sessionId 前缀推断类型 → 复用
 * useAgentDetail/useTerminalDetail（query key 与 PanelRouter 一致，React Query dedupe 零额外
 * 网络）。focusId/projectName 缺失或类型未知时返 undefined（调用方 fallback projectName /
 * focusId 前 8 位）。两个 detail hook 都调（hooks 规则），按 sessionType 控制 enabled，
 * 非聚焦态（focusId undefined）双 enabled=false 零网络开销。
 */
export function useFocusSessionName(
  focusId: string | undefined,
  projectName: string | undefined,
): string | undefined {
  const sessionType = focusId ? inferSessionTypeFromId(focusId) : undefined;
  const ref: WorkbenchPanelRef = {
    projectName: projectName ?? "",
    sessionId: focusId ?? "",
  };
  // projectName 未就绪（global scope 布局未收敛 / addPanel 尚未填充）时不发请求 ——
  // 否则会用空 projectName 发无效 query（getAgentSession("", id) 越界/404）。
  const projReady = !!projectName;
  const agent = useAgentDetail(ref, projReady && sessionType === "agent");
  const terminal = useTerminalDetail(ref, projReady && sessionType === "terminal");
  if (sessionType === "agent") return agent.data?.session.displayName;
  if (sessionType === "terminal") return terminal.data?.session.displayName;
  return undefined;
}

/**
 * split 面板元数据（设计 §7.2/§7.3/§10/§12）。按 sessionId 前缀推断类型 → 复用
 * useAgentDetail/useTerminalDetail（query key 与 PanelRouter/useFocusSessionName 一致，React Query
 * dedupe 零额外网络）。返回 SplitPanel header（marker + label + statusDot）与 SplitDock chip
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
 *（split closePanel / 卡片 ProjectInstances / 移动全局 MobileGlobalOverview）复用此 hook，
 * cache 策略统一为 closePanel 标准：removeQueries detail + exact invalidate
 *（["projects"] / [name] / [name, type-sessions]），不波及 files/git。`onAfterClose`
 * 留给 split 场景追加 removePanel + navigate。返回 true=已关闭，false=用户取消。
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
          type: "agent",
          updatedAt: session.updatedAt,
        });
      }
      for (const session of terminalQueries[index]?.data?.sessions ?? []) {
        candidates.push({
          displayName: session.displayName,
          ref: { projectName: name, sessionId: session.id },
          status: session.status,
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
    return { instances, isLoading: agents.isLoading && terminals.isLoading };
    // projectName/agents/terminals 由 dataKey fingerprint 覆盖（data 变 → dataUpdatedAt 变）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey]);
}

function EmptyInstanceArea({
  create,
  projectName,
}: {
  create: CreateSessionApi | null;
  projectName: string | null;
}) {
  const { t } = useT();
  return (
    <div className="flex h-full items-center justify-center p-6" data-drop-empty="">
      <div
        className={`flex min-h-32 flex-1 flex-col items-center justify-center gap-3 rounded-2xl ${shellSurfaceClasses.inset}`}
      >
        {projectName !== null && create ? (
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

/** grid 卡片回调集合：onSelect/onClose 按 sessionId+type 重建，t 翻译 status label。 */
export type GridItemCallbacks = {
  onClose?: (sessionId: string, type: "agent" | "terminal") => void;
  onSelect: (sessionId: string) => void;
  t: (key: TranslationKey) => string;
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

/** 项目实例 → InstanceGridItem（marker 按 type/provider，status 映射 pill，title=displayName）。 */
export function instanceToGridItem(
  entry: ProjectInstanceEntry,
  cb: GridItemCallbacks,
): InstanceGridItem {
  const provider = entry.type === "agent" ? (entry.session as AgentSession).provider : undefined;
  const onClose = cb.onClose;
  return {
    closeLabel: cb.t("session.close"),
    key: entry.session.id,
    marker: sessionMarker(entry.type, provider),
    onClose: onClose ? () => onClose(entry.session.id, entry.type) : undefined,
    onSelect: () => cb.onSelect(entry.session.id),
    status: {
      label: cb.t(sessionStatusLabel(entry.session.status)),
      tone: statusToTone(entry.session.status),
    },
    title: entry.session.displayName,
  };
}

/** 全局候选 → InstanceGridItem（candidate 已带 provider/type/status/displayName）。 */
export function candidateToGridItem(
  candidate: GlobalInstanceCandidate,
  cb: GridItemCallbacks,
): InstanceGridItem {
  const onClose = cb.onClose;
  return {
    closeLabel: cb.t("session.close"),
    key: candidate.ref.sessionId,
    marker: sessionMarker(candidate.type, candidate.provider),
    onClose: onClose ? () => onClose(candidate.ref.sessionId, candidate.type) : undefined,
    onSelect: () => cb.onSelect(candidate.ref.sessionId),
    status: {
      label: cb.t(sessionStatusLabel(candidate.status)),
      tone: statusToTone(candidate.status),
    },
    title: candidate.displayName,
  };
}

/**
 * table 列回调：与 GridItemCallbacks 同源语义（onSelect 进聚焦 / onClose 走 useCloseSession），
 * 但 `t` 用 TranslateFn（带 params）——relativeTime 内部 `t("time.minutesAgo", {count})` 需要第二
 * 参数；GridItemCallbacks.t 是无 params 窄签名（仅够 statusLabel），故 table 独立 callbacks 类型。
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
  t: (key: TranslationKey) => string;
  dragAdapter?: DragSourceAdapter;
};

/**
 * grouped 视图（设计文档 §5：仅桌面 global 跨项目分组）。groupByProject 按项目分段，每组
 * 项目名标题（与移动 MobileGlobalOverview 同款 className）+ InstanceGrid。回调复用 InstanceArea
 * 的 focusInstance/closeInstance（与 grid 视图同源，select 进聚焦态 / close 走 useCloseSession）。
 * dragAdapter 桌面左总览传时启用拖放（每个 candidate.ref 进 dragRefs）。
 */
function GroupedView({ candidates, onClose, onFocus, t, dragAdapter }: GroupedViewProps) {
  const groups = groupByProject(candidates);
  const callbacks: GridItemCallbacks = { onClose, onSelect: onFocus, t };
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

function LoadingPanel() {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className={`min-h-32 flex-1 animate-pulse rounded-2xl ${shellSurfaceClasses.inset}`} />
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
 * 右工作区活动组 header（设计 §7）。嵌入式面板（ChatPanel/AgentTerminalPanel/TerminalPanel）
 * 自身不带 header（原由 SplitPanel 承载），Phase A 改单 group 右工作区后由本组件统一渲染
 * marker + 实例名 + maximize + close。usePanelMeta 从实例 detail query 派生（与
 * PanelRouter/useFocusSessionName 同源 query key，React Query dedupe）。
 */
function GroupHeader({
  isMaximized,
  onActivate,
  onClose,
  onToggleMaximize,
  panelRef,
}: GroupHeaderProps) {
  const { t } = useT();
  const meta = usePanelMeta(panelRef);
  const label = meta?.label ?? panelRef.sessionId.slice(0, 12);
  const maximizeLabelKey = isMaximized ? "workbench.panelRestore" : "workbench.panelMaximize";
  return (
    <div className="flex h-9 shrink-0 items-center justify-between gap-1 border-b border-on-surface/5 px-2">
      {/* header 左侧点击 = 激活该 group（设计 §7.3 精确为 header 激活，不抢 PanelRouter 内部交互）。 */}
      <button
        className="flex min-w-0 grow items-center gap-1.5 rounded-md px-1 py-0.5 text-left transition hover:bg-on-surface/5"
        onClick={onActivate}
        type="button"
      >
        {meta?.marker ?? null}
        <span className="truncate text-sm font-medium text-on-surface">{label}</span>
      </button>
      <div className="flex shrink-0 items-center gap-0.5">
        <button
          aria-label={t(maximizeLabelKey)}
          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-on-surface-muted transition hover:bg-on-surface/5 hover:text-on-surface"
          onClick={onToggleMaximize}
          title={t(maximizeLabelKey)}
          type="button"
        >
          <ShellIcon className="h-3 w-3" name={isMaximized ? "restore" : "maximize"} />
        </button>
        <button
          aria-label={t("workbench.panelClose")}
          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-on-surface-muted transition hover:bg-on-surface/5 hover:text-on-surface"
          onClick={onClose}
          title={t("workbench.panelClose")}
          type="button"
        >
          <ShellIcon className="h-3 w-3" name="close" />
        </button>
      </div>
    </div>
  );
}

type GroupHeaderProps = {
  isMaximized: boolean;
  onActivate: () => void;
  onClose: () => void;
  onToggleMaximize: () => void;
  panelRef: WorkbenchPanelRef;
};

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
  /** 拖拽增量（本次 move 的 deltaX / 行宽，无量纲比例）；上层按行 totalFlex 转 deltaFlex。 */
  onResize: (ratioDelta: number) => void;
};

/**
 * 同行相邻 group 间的列宽分隔条（设计 §7.3）。flex item（w-1 shrink-0），pointer-event 增量
 * 拖拽：每次 move 算 deltaX / 行宽（parentElement.getBoundingClientRect）→ onResize(ratioDelta)；
 * 上层 resizePair 基于当前 layout 增量更新左右 sizes，守恒钳制。setPointerCapture 锁指针到 gutter，
 * 拖拽时即使滑过面板仍持续触发。复活自 P5 split-panel.tsx（三态已废弃，gutter 通用）。
 */
function SplitGutter({ onResize }: SplitGutterProps) {
  const gutterRef = useRef<HTMLDivElement>(null);
  const lastX = useRef<number | null>(null);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    lastX.current = event.clientX;
    void gutterRef.current?.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (lastX.current === null) return;
    const row = gutterRef.current?.parentElement;
    const width = row?.getBoundingClientRect().width ?? 1;
    const delta = event.clientX - lastX.current;
    lastX.current = event.clientX;
    onResize(delta / width);
  };
  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    lastX.current = null;
    void gutterRef.current?.releasePointerCapture(event.pointerId);
  };

  return (
    <div
      aria-hidden
      className="w-1 shrink-0 cursor-col-resize rounded-full bg-on-surface/5 transition-colors hover:bg-on-surface/20"
      onPointerCancel={endDrag}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      ref={gutterRef}
    />
  );
}

type WorkspaceGridProps = {
  activeZone: { targetSessionId: string | null; zone: DropZone } | null;
  create: CreateSessionApi | null;
  draggingRef: WorkbenchPanelRef | null;
  maximized: string | null;
  onActivateGroup: (ref: WorkbenchPanelRef) => void;
  onCloseGroup: (ref: WorkbenchPanelRef) => void;
  onResizePair: (leftId: string, rightId: string, deltaFlex: number) => void;
  onToggleMaximize: (sessionId: string) => void;
  projectName: string | null;
  rows: WorkbenchPanelRef[][];
  sizes: Record<string, number>;
};

/**
 * 右工作区网格（设计 §7.4）：deriveRows 全网格渲染。行 flex-1 等分高度（Phase B 不引入
 * rowSizes），行内 panel flex 按 sizes 权重等分宽度。maximized 时 deriveRows 返单 panel
 * 单行 → 自动全屏。空 panels → EmptyInstanceArea（标注 data-drop-empty 让空白区 drop 命中）。
 * GroupCell 标注 data-drop-group={sessionId} 让 DropZoneOverlay 的 elementFromPoint hit-test 命中。
 */
function WorkspaceGrid({
  activeZone,
  create,
  draggingRef,
  maximized,
  onActivateGroup,
  onCloseGroup,
  onResizePair,
  onToggleMaximize,
  projectName,
  rows,
  sizes,
}: WorkspaceGridProps) {
  if (rows.length === 0) {
    return <EmptyInstanceArea create={create} projectName={projectName} />;
  }
  return (
    <div className="flex h-full min-h-0 flex-col gap-1 p-1">
      {rows.map((row, rowIdx) => {
        const totalFlex = row.reduce((sum, p) => sum + (sizes[p.sessionId] ?? 1), 0);
        return (
          <div className="flex min-h-0 flex-1 gap-1" key={`row-${rowIdx}`}>
            {row.flatMap((panelRef, colIdx) => {
              const cells: ReactNode[] = [
                <GroupCell
                  activeZone={activeZone}
                  dragRef={draggingRef}
                  flex={sizes[panelRef.sessionId] ?? 1}
                  isMaximized={maximized === panelRef.sessionId}
                  key={`cell-${panelRef.sessionId}`}
                  onActivate={() => onActivateGroup(panelRef)}
                  onClose={() => onCloseGroup(panelRef)}
                  onToggleMaximize={() => onToggleMaximize(panelRef.sessionId)}
                  panelRef={panelRef}
                />,
              ];
              if (colIdx < row.length - 1) {
                const next = row[colIdx + 1];
                cells.push(
                  <SplitGutter
                    key={`gutter-${panelRef.sessionId}-${next.sessionId}`}
                    onResize={(ratio) =>
                      onResizePair(panelRef.sessionId, next.sessionId, ratio * totalFlex)
                    }
                  />,
                );
              }
              return cells;
            })}
          </div>
        );
      })}
    </div>
  );
}

type GroupCellProps = {
  activeZone: { targetSessionId: string | null; zone: DropZone } | null;
  dragRef: WorkbenchPanelRef | null;
  flex: number;
  isMaximized: boolean;
  onActivate: () => void;
  onClose: () => void;
  onToggleMaximize: () => void;
  panelRef: WorkbenchPanelRef;
};

/**
 * 单个 group 单元格 = GroupHeader + PanelRouter。标注 data-drop-group={sessionId} 让
 * DropZoneOverlay 的 elementFromPoint 命中。拖动态期间 pointer-events:none 让 elementFromPoint
 * 落到 overlay 下层 group（pointer capture 在源卡片，overlay 不接 pointer 事件，仅视觉高亮）。
 * 非拖动态正常接交互（PanelRouter 输入框/终端点击）。
 */
function GroupCell({
  activeZone,
  dragRef,
  flex,
  isMaximized,
  onActivate,
  onClose,
  onToggleMaximize,
  panelRef,
}: GroupCellProps) {
  const isDraggingThis = dragRef?.sessionId === panelRef.sessionId;
  const isDropTarget = activeZone?.targetSessionId === panelRef.sessionId;
  return (
    <div
      className={`relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg ${shellSurfaceClasses.workspace} ${
        isDraggingThis ? "opacity-40" : ""
      }`}
      data-drop-group={panelRef.sessionId}
      style={{ flex: `${flex} 1 0` }}
    >
      <GroupHeader
        isMaximized={isMaximized}
        onActivate={onActivate}
        onClose={onClose}
        onToggleMaximize={onToggleMaximize}
        panelRef={panelRef}
      />
      <div className="min-h-0 flex-1">
        <PanelRouter key={panelRef.sessionId} panelRef={panelRef} />
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

type DropZoneOverlayProps = {
  activeZone: { targetSessionId: string | null; zone: DropZone } | null;
  dragPointer: { x: number; y: number };
  dragSourceRef: WorkbenchPanelRef | null;
  layout: WorkbenchLayout;
  onCancel: () => void;
  onDrop: () => void;
  onPointerMove: (x: number, y: number) => void;
  onZoneChange: (zone: { targetSessionId: string | null; zone: DropZone } | null) => void;
  t: (key: TranslationKey) => string;
};

/**
 * 拖动态全屏 overlay（设计 §7.2）。自身 pointer-events:none 不拦截 elementFromPoint，下层
 * GroupCell（默认 pointer-events auto）正常命中。在 window pointermove 上 hit-test：
 * elementFromPoint → 找带 data-drop-group 的祖先 → deriveZone(group rect, pointer) → setActiveZone；
 * 同时调 onPointerMove 把指针位置回传给 InstanceArea 更新 dragState（ghost 跟随指针）。
 * pointerup 调 onDrop（dropPanel + 自动聚焦）。
 *
 * 空白区（layout.panels 空）：elementFromPoint 命中 data-drop-empty 容器 → zone=center +
 * targetSessionId=null（addPanel 首个 group）。
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
        const targetSessionId = groupEl.getAttribute("data-drop-group") as string;
        const rect = groupEl.getBoundingClientRect();
        const zone = deriveZone(
          { width: rect.width, height: rect.height, left: rect.left, top: rect.top },
          event.clientX,
          event.clientY,
        );
        if (zone) {
          onZoneChange({ targetSessionId, zone });
        } else {
          onZoneChange(null);
        }
        return;
      }
      const emptyEl = el.closest("[data-drop-empty]") as HTMLElement | null;
      if (emptyEl) {
        onZoneChange({ targetSessionId: null, zone: "center" });
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
      {/* 空白区高亮（layout 空 + activeZone targetSessionId=null）*/}
      {layout.panels.length === 0 && activeZone?.targetSessionId === null ? (
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
