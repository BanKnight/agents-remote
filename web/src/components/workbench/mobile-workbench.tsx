import { Fragment, type ReactNode, useMemo } from "react";
import { useAtom } from "jotai";
import { useNavigate } from "@tanstack/react-router";
import { useT } from "../../i18n";
import type { TranslationKey } from "../../i18n/types";
import { ShellSectionLabel, shellSurfaceClasses, ViewSwitcher } from "../shell/shell-primitives";
import { ShellIcon } from "../shell/icons";
import { useInstanceInfoSheet, type InfoField } from "../shell/info-sheet";
import { sessionStatusLabel } from "../../routes/console-model";
import {
  addPanel,
  filterWorkbenchViews,
  groupByProject,
  type WorkbenchMobileFocusTab,
  type WorkbenchMobileOverviewTab,
  type WorkbenchScope,
  type WorkbenchView,
  inferSessionTypeFromId,
  useWorkbenchLayout,
  useWorkbenchNavigate,
  type WorkbenchPanelRef,
  workbenchMobileFocusTabAtom,
  workbenchMobileOverviewTabAtom,
  workbenchViewAtom,
} from "../../routes/workbench-model";
import {
  candidateToGridItem,
  candidateToTableRow,
  CardGridSkeleton,
  CreateSessionBar,
  type GridItemCallbacks,
  InstanceGrid,
  instanceToGridItem,
  instanceToTableRow,
  PanelRouter,
  type TableRowCallbacks,
  useAgentDetail,
  useCloseSession,
  useCreateSession,
  useGlobalInstanceCandidates,
  useProjectInstances,
  useRenameSession,
  useScopeInstanceOrder,
  useTerminalDetail,
  VIEW_LABEL_KEY,
} from "./instance-area";
import { HistoryList } from "./history-list";
import { SessionTable, type TableColumn } from "./workbench-table";
import { buildOverviewTabs, FIRST_PARTY_PLUGINS, type PluginContext } from "./right-panel-plugin";
import { MobilePrimaryNav } from "../shell/mobile-primary-nav";

type MobileWorkbenchProps = {
  scope: WorkbenchScope;
  focusId?: string;
};

/**
 * 移动端工作台（设计文档 §7）。Stage 5 按桌面分 stage 升级：A 聚焦态单实例化
 *（修窄屏多面板挤压）→ B header tab inspection → C ‹› 悬浮切 → D 列表态二级总览
 * + 一级底部 tab → E 路由收口。
 *
 * 当前：无 focusId → 实例列表（WorkbenchLeftRail 全屏 + 创建入口，Stage D 升级为
 * MobileProjectOverview）；有 focusId → 单实例聚焦（Stage A：PanelRouter 不 split；
 * Stage B：header tab 切 output/文件/Git，inspection 复用 FIRST_PARTY_PLUGINS）
 * + 顶部返回。
 */
export function MobileWorkbench({ focusId, scope }: MobileWorkbenchProps) {
  if (!focusId) {
    return (
      <main
        className={`relative flex h-[var(--app-viewport-height)] flex-col overflow-hidden pt-[var(--shell-safe-area-top)] text-on-surface ${shellSurfaceClasses.shell}`}
      >
        {scope.kind === "global" ? (
          <MobileGlobalOverview />
        ) : (
          <MobileProjectOverview scope={scope} />
        )}
        <MobilePrimaryNav />
      </main>
    );
  }

  return (
    <main
      className={`relative flex h-[var(--app-viewport-height)] flex-col overflow-hidden pt-[var(--shell-safe-area-top)] text-on-surface ${shellSurfaceClasses.shell}`}
    >
      <MobileFocusBody focusId={focusId} scope={scope} />
    </main>
  );
}

type MobileFocusBodyProps = {
  focusId: string;
  scope: WorkbenchScope;
};

/**
 * 移动端聚焦态主体（设计文档 §7，5g 重构）。单行 header = ◄ 返回 + tab 横滚区 + ℹ✕ 胶囊
 *（MobileFocusHeader），替代旧 MobilePageHeader + 二级 tab 行两块；面板自带 header 在聚焦态
 * 隐藏（PanelRouter embeddedHeader），消除 title 重复 / Files·Git 与 tab 重复 / meta 独占行
 * 三处冗余。Stage A：单实例面板（PanelRouter），不走桌面 split —— 窄屏不 split 多面板（避免
 * 挤压）。Stage B：tab 切 output / inspection —— 实例与 inspection 共占同一区域、tab 切换；
 * inspection 复用 FIRST_PARTY_PLUGINS render。ℹ 触发底部 info sheet 显实例 meta（agent 显
 * model/permission/createdAt，terminal 不显这些行 —— UI=f(state) 不伪造）；✕ 触发 useCloseSession
 *（confirm → close API → navigate 回列表）。projectName：project 作用域直接 scope.key；global
 * 作用域从布局面板查 focusId 所属项目。detail 查询（useAgentDetail/useTerminalDetail）query key
 * 与 PanelRouter 一致，React Query dedupe 零额外网络。‹› 浮动切实例 overlay 在内容区中点，
 * z-30 不遮挡 header。
 */
function MobileFocusBody({ focusId, scope }: MobileFocusBodyProps) {
  const { t } = useT();
  const navigateWorkbench = useWorkbenchNavigate();
  const [layout, updateLayout] = useWorkbenchLayout(scope);
  const [tab, setTab] = useAtom(workbenchMobileFocusTabAtom);
  const order = useScopeInstanceOrder(scope);
  const currentIndex = order.findIndex((o) => o.sessionId === focusId);
  const projectName =
    scope.kind === "project"
      ? scope.key
      : (layout.panels.find((p) => p.sessionId === focusId)?.projectName ??
        order.find((r) => r.sessionId === focusId)?.projectName);
  const sessionType = inferSessionTypeFromId(focusId);
  // detail 查询（query key 与 PanelRouter 一致，React Query dedupe 零额外网络）。两个 hook 都调
  //（hooks 规则），按 sessionType 控制 enabled；projectName 未就绪时双 enabled=false 零网络开销。
  const panelRef: WorkbenchPanelRef = { projectName: projectName ?? "", sessionId: focusId };
  const projReady = !!projectName;
  const agentDetail = useAgentDetail(panelRef, projReady && sessionType === "agent");
  const terminalDetail = useTerminalDetail(panelRef, projReady && sessionType === "terminal");
  const agentSession = sessionType === "agent" ? agentDetail.data?.session : undefined;
  const terminalSession = sessionType === "terminal" ? terminalDetail.data?.session : undefined;
  const focusDisplayName = agentSession?.displayName ?? terminalSession?.displayName;
  const infoSheet = useInstanceInfoSheet();
  const { close, holder: closeHolder } = useCloseSession();
  const ctx: PluginContext = {
    projectKey: projectName ?? null,
    focusId,
    sessionType,
  };
  const visiblePlugins = FIRST_PARTY_PLUGINS.filter((plugin) => plugin.when(ctx));
  // 记忆的 tab 若在当前 ctx 不可见（如全局作用域下 project-scoped 的 files/git 隐藏，
  // 但记忆值为 files）→ 回退 output，避免内容区空白。
  const activeTab: WorkbenchMobileFocusTab =
    tab === "output" || visiblePlugins.some((p) => p.id === tab) ? tab : "output";
  const activePlugin =
    activeTab === "output" ? null : (visiblePlugins.find((p) => p.id === activeTab) ?? null);

  // ‹› 浮动切实例（设计文档 §7）：范围 = 当前 scope 活跃实例（useScopeInstanceOrder），
  // 循环切换；tab 不重置（维度正交，workbenchMobileFocusTabAtom 跨切换保持）。global 作用域
  // 聚焦态 projectName 从 layout.panels 查，切到不在布局的实例需先 addPanel 再导航。
  const switchInstance = (delta: number) => {
    if (order.length < 2 || currentIndex < 0) return;
    const next = order[(currentIndex + delta + order.length) % order.length];
    if (scope.kind === "global") {
      updateLayout((prev) => addPanel(prev, next));
    }
    void navigateWorkbench(scope, next.sessionId);
  };
  const showSwitcher = order.length > 1 && currentIndex >= 0;

  // ℹ sheet 字段装配（UI=f(state)：terminal 无 model/permissionMode/createdAt，不伪造占位行）。
  const openInfo = () => {
    const fields: InfoField[] = [];
    if (focusDisplayName) {
      fields.push({ label: t("session.instanceInfo.name"), value: focusDisplayName });
    }
    if (projectName) {
      fields.push({ label: t("session.instanceInfo.project"), value: projectName });
    }
    if (sessionType === "agent" && agentSession) {
      fields.push({
        label: t("session.instanceInfo.type"),
        value: providerDisplayName(agentSession.provider),
      });
      if (agentSession.model) {
        fields.push({ label: t("session.instanceInfo.model"), value: agentSession.model });
      }
      if (agentSession.permissionMode) {
        fields.push({
          label: t("session.instanceInfo.permission"),
          value: agentSession.permissionMode,
        });
      }
      if (agentSession.createdAt) {
        fields.push({
          label: t("session.instanceInfo.createdAt"),
          value: formatCreatedAt(agentSession.createdAt),
        });
      }
      fields.push({
        label: t("session.instanceInfo.status"),
        value: t(sessionStatusLabel(agentSession.status)),
      });
    } else if (sessionType === "terminal" && terminalSession) {
      fields.push({
        label: t("session.instanceInfo.type"),
        value: t("session.instanceInfo.terminal"),
      });
      fields.push({
        label: t("session.instanceInfo.status"),
        value: t(sessionStatusLabel(terminalSession.status)),
      });
    }
    infoSheet.open(t("session.instanceInfo.title"), fields);
  };

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
      {showSwitcher ? (
        <MobileInstanceSwitcher
          nextLabel={t("workbench.switchNext")}
          onNext={() => switchInstance(1)}
          onPrev={() => switchInstance(-1)}
          prevLabel={t("workbench.switchPrev")}
        />
      ) : null}
      <MobileFocusHeader
        activeTab={activeTab}
        onBack={() => void navigateWorkbench(scope)}
        onClose={onClose}
        onInfo={openInfo}
        onTabSelect={setTab}
        tabs={tabs}
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {projectName ? (
          <div className={activePlugin ? "hidden" : "flex min-h-0 flex-1 flex-col overflow-hidden"}>
            <PanelRouter
              embeddedHeader
              key={focusId}
              panelRef={{ projectName, sessionId: focusId }}
            />
          </div>
        ) : null}
        {activePlugin ? (
          <Fragment key={projectName ?? "none"}>{activePlugin.render(ctx)}</Fragment>
        ) : null}
      </div>
      {infoSheet.holder}
      {closeHolder}
    </div>
  );
}

/** Agent provider 全名（claude2 → "Claude 2"；未知值原样回退，不崩溃）。品牌名中英一致，不走 i18n。 */
function providerDisplayName(provider: string | undefined): string {
  if (!provider) return "—";
  if (provider === "claude") return "Claude";
  if (provider === "codex") return "Codex";
  if (provider === "claude2") return "Claude 2";
  return provider;
}

/** createdAt ISO → 本地可读格式（toLocaleString 跟随浏览器 locale，与 navigator.language 检测一致）。 */
function formatCreatedAt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

type MobileFocusHeaderProps = {
  activeTab: WorkbenchMobileFocusTab;
  tabs: { id: WorkbenchMobileFocusTab; label: string }[];
  onBack: () => void;
  onInfo: () => void;
  onClose: () => void;
  onTabSelect: (id: WorkbenchMobileFocusTab) => void;
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
          <button
            aria-label={t("session.instanceInfo.title")}
            className="flex h-8 w-8 items-center justify-center rounded-md text-on-surface-soft transition hover:bg-on-surface/5 hover:text-on-surface"
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

/** 移动聚焦态 header tab 按钮（与右栏 RightPanelTabs.TabButton 同设计语言，5g 紧凑化匹配 h-12 单行 header）。 */
function MobileFocusTabButton({ active, label, onClick }: MobileFocusTabButtonProps) {
  return (
    <button
      className={`shrink-0 rounded-md px-2.5 py-1.5 text-xs font-semibold transition ${active ? "bg-primary/10 text-primary" : "text-on-surface-muted hover:bg-on-surface/5 hover:text-on-surface"}`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

type MobileTabHeaderProps<TabId extends string> = {
  // ◄ 返回按钮：统一容器 + SVG，aria-label key 与 onClick 由调用方注入区分去向
  //（聚焦态回列表 / 列表态回 Home）。
  back: { ariaLabelKey: TranslationKey; onClick: () => void };
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
 * 泛型 TabId 让聚焦态（WorkbenchMobileFocusTab）与列表态（WorkbenchMobileOverviewTab）
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
    <header className="flex h-12 shrink-0 items-center gap-1 border-b border-on-surface/5 px-1.5">
      <button
        aria-label={t(back.ariaLabelKey)}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-on-surface-soft transition hover:bg-on-surface/5 hover:text-on-surface"
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

type MobileInstanceSwitcherProps = {
  nextLabel: string;
  onNext: () => void;
  onPrev: () => void;
  prevLabel: string;
};

/**
 * ‹› 浮动切实例（设计文档 §7）：absolute overlay 贴内容区左右边缘中点，不占布局；
 * 半透明 backdrop-blur 降低对实例输出的遮挡。仅当前 scope 活跃实例 > 1 时由 MobileFocusBody 渲染。
 */
function MobileInstanceSwitcher({
  nextLabel,
  onNext,
  onPrev,
  prevLabel,
}: MobileInstanceSwitcherProps) {
  return (
    <>
      <button
        aria-label={prevLabel}
        className="absolute left-1 top-1/2 z-30 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg bg-surface-raised/60 text-on-surface-soft backdrop-blur transition hover:bg-surface-raised/80 hover:text-on-surface"
        onClick={onPrev}
        type="button"
      >
        <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 16 16">
          <path
            d="M10 3L5 8l5 5"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            stroke="currentColor"
          />
        </svg>
      </button>
      <button
        aria-label={nextLabel}
        className="absolute right-1 top-1/2 z-30 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg bg-surface-raised/60 text-on-surface-soft backdrop-blur transition hover:bg-surface-raised/80 hover:text-on-surface"
        onClick={onNext}
        type="button"
      >
        <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 16 16">
          <path
            d="M6 3l5 5-5 5"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            stroke="currentColor"
          />
        </svg>
      </button>
    </>
  );
}

type MobileProjectOverviewProps = {
  scope: { kind: "project"; key: string };
};

/**
 * 移动项目列表态（设计文档 §7）：单项目聚焦视图。单行 header（◄ 返回 + tab 横滚区 flex-1 +
 * 项目名右侧 shrink-0 truncate，对齐聚焦态 MobileFocusHeader 同款结构，替代旧 MobilePageHeader
 * + 二级 tab 行两块）+ 内容区 tab 切换。总览 = 创建入口（左）+ ViewSwitcher（右，两端对齐，
 * 设计 §6）+ 活跃实例 grid/table（本组件直渲 InstanceGrid/SessionTable，单一数据管道
 * useProjectInstances）；历史 = HistoryList（project-scoped 历史 session）；文件/Git
 * = FIRST_PARTY_PLUGINS render（移动响应式，单一数据管道）。tab 记忆在
 * workbenchMobileOverviewTabAtom（值域 = WorkbenchMiddleTab），不进 URL（列表态 URL 语义核心
 * 是 scope）；view 记忆复用桌面 workbenchViewAtom。key={scope.key} 切项目 remount，重置
 * inspection 内部 state。底部 pb-24 lg:pb-0 避让一级底部胶囊（桌面 lg:pb-0 抵消）。
 */
function MobileProjectOverview({ scope }: MobileProjectOverviewProps) {
  const { t } = useT();
  const navigate = useNavigate();
  const [tab, setTab] = useAtom(workbenchMobileOverviewTabAtom);
  const [view, setView] = useAtom(workbenchViewAtom);
  const ctx: PluginContext = { projectKey: scope.key, focusId: undefined, sessionType: undefined };
  // tab 顺序：总览 / 历史（project-only，列表态恒 project scope 无条件）/ inspection 插件
  //（按 ctx 过滤；files/git 需 projectKey）。复用 plugin.when 单一来源。
  const tabs = useMemo(
    () => buildOverviewTabs(t, ctx, true),
    // ctx 由 scope 决定，scope/t 变才重算。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scope, t],
  );
  // 记忆 tab 若在当前 ctx 不可见 → 回退 overview，避免内容区空白。
  const activeTab: WorkbenchMobileOverviewTab = tabs.some((opt) => opt.id === tab)
    ? tab
    : "overview";
  const activePlugin =
    activeTab !== "overview" && activeTab !== "history"
      ? (FIRST_PARTY_PLUGINS.find((p) => p.id === activeTab) ?? null)
      : null;
  // 移动 ViewSwitcher（与桌面 2a 对称）：复用桌面 workbenchViewAtom（不新增 mobile view atom），
  // views = filterWorkbenchViews(scope)（project 自动过滤 grouped）。渲染层 view 切换 Phase 4
  // 落地（当前切 view 仅写 atom 记忆，overview 渲染层暂不响应；状态记忆生效待 Phase 4 落地，
  // 非死按钮 —— atom 值已被记录，P4 渲染层接入后即生效）。
  const viewOptions = useMemo(
    () => filterWorkbenchViews(scope).map((v) => ({ id: v, label: t(VIEW_LABEL_KEY[v]) })),
    [scope, t],
  );
  // §15：project 总览默认 grid（WORKBENCH_VIEW_ORDER 反转后移动 project viewOptions = [grid, table]，
  // [0] = grid 已是默认；守卫仍保留以抵挡 atom 残留非法值，与桌面 InstanceArea 同款）。
  const resolvedView: WorkbenchView = viewOptions.some((opt) => opt.id === view) ? view : "grid";
  // 总览实例数据 + 回调（设计 §9/§11）：grid/table 两视图共用 useProjectInstances 单一来源
  //（React Query dedupe）。创建入口 useCreateSession 提至 ViewSwitcher 行（与桌面 §6 两端对齐），
  // 不再走 ProjectInstances 组件（避免重复 useCloseSession/useCreateSession 双 holder）。
  const { close, holder: closeHolder } = useCloseSession();
  const { rename, holder: renameHolder } = useRenameSession();
  const { instances, isLoading } = useProjectInstances(scope.key);
  const create = useCreateSession(scope.key);
  const navigateWorkbench = useWorkbenchNavigate();
  const focusInstance = (sessionId: string) => {
    void navigateWorkbench(scope, sessionId);
  };
  const closeInstance = (sessionId: string, type: "agent" | "terminal") => {
    void close({ projectName: scope.key, sessionId }, type);
  };
  const renameInstance = (sessionId: string, type: "agent" | "terminal", currentName: string) => {
    void rename({ projectName: scope.key, sessionId }, type, currentName);
  };
  const tableCallbacks: TableRowCallbacks = { onClose: closeInstance, onSelect: focusInstance, t };
  const tableRows = useMemo(
    () => instances.map((entry) => instanceToTableRow(entry, tableCallbacks)),
    // tableCallbacks 闭包依赖 scope/t；instances 引用由 hook 内 dataKey fingerprint 稳定。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [instances, t],
  );
  const gridCallbacks: GridItemCallbacks = {
    onClose: closeInstance,
    onRename: renameInstance,
    onSelect: focusInstance,
    t,
  };
  const gridItems = useMemo(
    () => instances.map((entry) => instanceToGridItem(entry, gridCallbacks, scope.key)),
    // gridCallbacks 闭包依赖 scope/t；instances 引用同 tableRows（hook 内 dataKey fingerprint 稳定）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [instances, t],
  );
  const tableColumns: TableColumn[] = ["name", "actions"];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <MobileTabHeader
        activeTabId={activeTab}
        back={{
          ariaLabelKey: "project.backToProjects",
          onClick: () => void navigate({ to: "/" }),
        }}
        onTabSelect={setTab}
        tabs={tabs}
        trailing={
          <span className="ml-auto shrink-0 max-w-[40%] truncate text-sm font-semibold text-on-surface px-2">
            {scope.key}
          </span>
        }
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden" key={scope.key}>
        {activePlugin ? (
          <Fragment key={scope.key}>{activePlugin.render(ctx)}</Fragment>
        ) : activeTab === "history" ? (
          <div className="h-full overflow-y-auto p-3">
            <HistoryList focusId={undefined} projectName={scope.key} showLabel={false} />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto pb-24 lg:pb-0">
            {/* 创建入口（左）+ ViewSwitcher（右 ml-auto）两端对齐（设计 §6）：
                CreateSessionBar 从原 ProjectInstances 提到此行，table/grid 两视图都可见创建入口。 */}
            <div className="flex items-center gap-1 px-3 py-2">
              <CreateSessionBar
                isCreating={create.isCreating}
                onCreateAgent={create.createAgent}
                onCreateTerminal={create.createTerminal}
              />
              <div className="ml-auto">
                <ViewSwitcher
                  ariaLabel={t("workbench.viewSwitcher")}
                  onChange={(next) => setView(next)}
                  view={resolvedView}
                  views={viewOptions}
                />
              </div>
            </div>
            {resolvedView === "table" ? (
              tableRows.length === 0 ? (
                isLoading ? (
                  <div className="px-3">
                    <CardGridSkeleton />
                  </div>
                ) : (
                  <p className="px-3 py-6 text-center text-sm text-on-surface-muted">
                    {t("workbench.emptyInstanceHint")}
                  </p>
                )
              ) : (
                <SessionTable columns={tableColumns} rows={tableRows} t={t} />
              )
            ) : isLoading && gridItems.length === 0 ? (
              <div className="px-3 py-2">
                <CardGridSkeleton />
              </div>
            ) : gridItems.length > 0 ? (
              <div className="px-3 py-2">
                <InstanceGrid items={gridItems} />
              </div>
            ) : null}
            {/* closeHolder + promptHolder 统一渲染（grid/table 两视图共用；
                原 ProjectInstances 自含 holder 已随组件删除，无双 holder）。 */}
            {closeHolder}
            {renameHolder}
            {create.promptHolder}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 移动全局列表态（设计文档 §7/§11）：跨项目活跃实例聚合，只读监控（不可创建，创建需先进项目
 * 指定作用域）。P4：加视图切换（grouped/grid/table，global 三视图全开——设计 §11）。
 * grouped = 按项目分段（groupByProject，与桌面 GroupedView 同源纯函数）；
 * grid = 不分段所有候选 InstanceGrid；table = SessionTable（global 6 列）。点卡片/行进
 * `/global/session/$focusId` 单实例聚焦。close 复用 useCloseSession（confirm → close API → invalidate）。
 * 视图记忆复用 workbenchViewAtom（与桌面/移动 project 同源，不新增 mobile view atom）。
 */
function MobileGlobalOverview() {
  const { t } = useT();
  const navigate = useNavigate();
  const navigateWorkbench = useWorkbenchNavigate();
  const { close, holder: closeHolder } = useCloseSession();
  const { rename, holder: renameHolder } = useRenameSession();
  const { candidates, isLoaded } = useGlobalInstanceCandidates({ kind: "global" });
  const [tab, setTab] = useAtom(workbenchMobileOverviewTabAtom);
  const [view, setView] = useAtom(workbenchViewAtom);
  // global ctx：projectKey=null。files 全局可见（根目录 = PROJECTS_ROOT 只读浏览，render
  // 走 rootBrowse 分支），git 需 projectKey 故 when 过滤掉；global 无 history（跨项目历史
  // 不属列表态）。tab 行对齐 MobileProjectOverview 单行 header（◄ 返回 + tab 横滚 + 标题）。
  const ctx: PluginContext = { projectKey: null, focusId: undefined, sessionType: undefined };
  const tabs = useMemo(
    () => buildOverviewTabs(t, ctx, false),
    // ctx 恒 global（projectKey=null），仅 t 变重算。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t],
  );
  // 记忆 tab 若在当前 ctx 不可见（如 project 残留 history 切到 global）→ 回退 overview。
  const activeTab: WorkbenchMobileOverviewTab = tabs.some((opt) => opt.id === tab)
    ? tab
    : "overview";
  const activePlugin =
    activeTab !== "overview" && activeTab !== "history"
      ? (FIRST_PARTY_PLUGINS.find((p) => p.id === activeTab) ?? null)
      : null;
  // viewOptions = filterWorkbenchViews(global) = [grouped, grid, table]（global 三视图全开）。
  const viewOptions = useMemo(
    () =>
      filterWorkbenchViews({ kind: "global" }).map((v) => ({
        id: v,
        label: t(VIEW_LABEL_KEY[v]),
      })),
    [t],
  );
  // resolvedView：atom 值在移动 global viewOptions 内时尊重，否则回退 grouped（当前分段形态）。
  // atom 默认 "grid"（与桌面 global 一致），首次进移动 global 显示 grid；用户切 grouped 后 atom 持久化。
  const resolvedView: WorkbenchView = viewOptions.some((opt) => opt.id === view) ? view : "grouped";
  const groups = useMemo(() => groupByProject(candidates), [candidates]);
  const focusInstance = (sessionId: string) => {
    void navigateWorkbench({ kind: "global" }, sessionId);
  };
  const closeInstance = (sessionId: string, type: "agent" | "terminal") => {
    const ref = candidates.find((c) => c.ref.sessionId === sessionId)?.ref;
    if (ref) void close(ref, type);
  };
  const renameInstance = (
    sessionId: string,
    type: "agent" | "terminal",
    currentName: string,
    _projectName: string,
  ) => {
    const ref = candidates.find((c) => c.ref.sessionId === sessionId)?.ref;
    if (ref) void rename(ref, type, currentName);
  };
  const callbacks: GridItemCallbacks = {
    onClose: closeInstance,
    onRename: renameInstance,
    onSelect: focusInstance,
    t,
  };
  const tableCallbacks: TableRowCallbacks = { onClose: closeInstance, onSelect: focusInstance, t };
  // table 行（global 6 列含 project；复用 candidateToTableRow，与桌面 InstanceArea table 分支同源）。
  const tableRows = useMemo(
    () => candidates.map((c) => candidateToTableRow(c, tableCallbacks)),
    // tableCallbacks 闭包依赖 closeInstance/focusInstance（candidates/navigateWorkbench/close），
    // 由 [candidates, t] 覆盖（candidates 变 → closeInstance 闭包变）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [candidates, t],
  );
  const tableColumns: TableColumn[] = ["name", "project", "activity", "actions"];
  return (
    <div className="flex h-full min-h-0 flex-col">
      <MobileTabHeader
        activeTabId={activeTab}
        back={{
          ariaLabelKey: "project.backToProjects",
          onClick: () => void navigate({ to: "/" }),
        }}
        onTabSelect={setTab}
        tabs={tabs}
        trailing={
          <span className="ml-auto shrink-0 max-w-[40%] truncate text-sm font-semibold text-on-surface px-2">
            {t("workbench.globalOverviewTitle")}
          </span>
        }
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {activePlugin ? (
          <Fragment>{activePlugin.render(ctx)}</Fragment>
        ) : (
          <>
            <div className="flex items-center gap-1 px-3 py-2">
              {/* global 不可创建（需先进项目指定作用域），仅 ViewSwitcher 右对齐（设计 §6）。 */}
              <div className="ml-auto">
                <ViewSwitcher
                  ariaLabel={t("workbench.viewSwitcher")}
                  onChange={(next) => setView(next)}
                  view={resolvedView}
                  views={viewOptions}
                />
              </div>
            </div>
            {candidates.length === 0 ? (
              !isLoaded ? (
                <div className="px-3 py-2">
                  <CardGridSkeleton />
                </div>
              ) : (
                <div className="flex flex-1 items-center justify-center p-6 text-center">
                  <p className="text-sm text-on-surface-muted">
                    {t("workbench.globalOverviewEmpty")}
                  </p>
                </div>
              )
            ) : (
              <nav
                aria-label={t("workbench.globalOverviewTitle")}
                className="flex-1 overflow-y-auto pb-24 lg:pb-0"
              >
                {resolvedView === "grouped" ? (
                  groups.map((group) => (
                    <div className="flex flex-col gap-2 px-3 py-2" key={group.projectName}>
                      <ShellSectionLabel>{group.projectName}</ShellSectionLabel>
                      <InstanceGrid
                        items={group.candidates.map((c) => candidateToGridItem(c, callbacks))}
                      />
                    </div>
                  ))
                ) : resolvedView === "table" ? (
                  <SessionTable columns={tableColumns} rows={tableRows} t={t} />
                ) : (
                  <div className="px-3 py-2">
                    <InstanceGrid
                      items={candidates.map((c) => candidateToGridItem(c, callbacks))}
                    />
                  </div>
                )}
              </nav>
            )}
          </>
        )}
      </div>
      {closeHolder}
      {renameHolder}
    </div>
  );
}
