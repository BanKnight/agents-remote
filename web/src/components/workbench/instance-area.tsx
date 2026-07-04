import { type CSSProperties, type ReactNode, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AgentProvider, AgentSession, TerminalSession } from "@agents-remote/shared";
import {
  type GlobalInstanceCandidate,
  type WorkbenchMiddleTab,
  type WorkbenchPanelRef,
  type WorkbenchScope,
  type WorkbenchView,
  addPanel,
  filterWorkbenchViews,
  groupByProject,
  inferSessionTypeFromId,
  rankGlobalInstances,
  removePanel,
  resizePair,
  toggleMaximize,
  useWorkbenchLayout,
  useWorkbenchNavigate,
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
import type { TranslationKey } from "../../i18n/types";
import { sessionStatusLabel } from "../../routes/console-model";
import {
  actionButtonClasses,
  InstanceCard,
  type InstanceCardProps,
  sessionMarker,
  shellSurfaceClasses,
  statusToTone,
  ViewSwitcher,
} from "../shell/shell-primitives";
import { AgentTerminalPanel, ChatPanel, TerminalPanel } from "./instance-panel";
import { HistoryList } from "./history-list";
import { FIRST_PARTY_PLUGINS, type PluginContext } from "./right-panel-plugin";
import { TabButton } from "./right-panel-tabs";
import { SplitLayout } from "./split-panel";
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
  split: "workbench.viewSplit",
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

/** InstanceGrid 项 = InstanceCard props + React key（卡片在网格中的稳定标识）。 */
type InstanceGridItem = InstanceCardProps & { key: string };

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
 * 中栏实例区（设计文档 §4）。消费 workbench split 布局 atom，渲染 `SplitLayout`
 *（多面板同屏）。面板 = 活跃实例 1:1；URL focusId 是「聚焦面板」（输入/右栏跟随），
 * 面板布局（哪些实例同屏、排序）是个人布局进 localStorage。project 作用域按项目分键；
 * global 作用域（commit ④）聚合所有项目活跃实例自动铺开（rankGlobalInstances 排序），
 * 面板带项目前缀。
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
  const candidates = useGlobalInstanceCandidates(scope);
  const create = useCreateSession(ctx.projectKey);
  // P3 grid 视图 project scope 数据源（global scope 返空，grid 改用 candidates 跨项目聚合）。
  const projectInstances = useProjectInstances(ctx.projectKey);

  // 聚焦态 header displayName（设计文档 §15）：focusId 实例的显示名。project scope = scope.key；
  // global scope 从 layout.panels 查 focusId 所属项目。useFocusSessionName 内部按 sessionType
  // 控制 enabled，非聚焦态（focusId undefined）零开销。header 仅聚焦态渲染（下方 return 分支）。
  const focusProjectName =
    scope.kind === "project"
      ? scope.key
      : (layout.panels.find((p) => p.sessionId === focusId)?.projectName ?? undefined);
  const focusDisplayName = useFocusSessionName(focusId, focusProjectName);

  // ViewSwitcher 视图选项（按 scope 过滤；桌面 isMobile=false）。聚焦态不渲染但仍稳定构造。
  const viewOptions = useMemo(
    () => filterWorkbenchViews(scope, false).map((v) => ({ id: v, label: t(VIEW_LABEL_KEY[v]) })),
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

  // focus → addPanel：URL focusId 指向的实例若不在布局中，加入面板（split-right 默认）。
  // 仅 project 作用域；global 的 focusId 缺 projectName，靠下方自动铺开填充。
  const scopeKey = scope.kind === "project" ? scope.key : "global";
  useEffect(() => {
    if (scope.kind !== "project" || !focusId) return;
    if (layout.panels.some((p) => p.sessionId === focusId)) return;
    update((prev) => addPanel(prev, { projectName: scope.key, sessionId: focusId }));
    // update 是 useWorkbenchLayout 返回的 setState 包装（闭包捕获 scope），稳定足够；
    // layout.panels 入 deps 以便 addPanel 后重检收敛（idempotent，无循环）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, scopeKey, layout.panels]);

  // global 自动铺开（commit ④）：进入全局视图且布局为空时，按 rankGlobalInstances 排序
  // 把所有项目活跃实例铺成面板。seededRef 防止铺开后 candidates/状态变化触发重铺，
  // 也防止用户手动清空后被自动回填。localStorage 已恢复非空布局时不介入。
  const seededRef = useRef(false);
  useEffect(() => {
    if (scope.kind !== "global" || layout.panels.length > 0 || seededRef.current) return;
    if (candidates.length === 0) return;
    seededRef.current = true;
    const ranked = rankGlobalInstances(candidates);
    update((prev) => ranked.reduce((acc, ref) => addPanel(acc, ref), prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, layout.panels.length, candidates]);

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

  // P3 总览视图（设计文档 §5/§8）：仅非聚焦 overview tab 渲染卡片网格（grid）；grouped（批 3b）/
  // table（P4）/ split（P5）后续接管。聚焦态仍走 SplitLayout。view 守卫：URL/atom 的 view 若不在当前
  // scope 可见视图集（如 project scope 残留 ?view=grouped）→ 回退 "grid"（设计 §15 project 默认 grid，
  // 且 grid 全 scope 可见；不取 viewOptions[0]，因 WORKBENCH_VIEW_ORDER 使 project 首项 = table）。
  const resolvedView: WorkbenchView =
    view !== undefined && viewOptions.some((opt) => opt.id === view) ? view : "grid";

  // grid 卡片回调：select 复用 focusPanel 进聚焦态；close 走 useCloseSession（卡片由 query 驱动，
  // invalidate 后自然消失，不调 removePanel —— 与 ProjectInstances card / MobileGlobalOverview 同款）。
  // global scope 的 projectName 从 candidates 查（candidate.ref.projectName）。
  const focusInstance = (sessionId: string) => {
    const projectName = scope.kind === "project" ? scope.key : "";
    focusPanel({ projectName, sessionId });
  };
  const closeInstance = (sessionId: string, type: "agent" | "terminal") => {
    const projectName =
      scope.kind === "project"
        ? scope.key
        : (candidates.find((c) => c.ref.sessionId === sessionId)?.ref.projectName ?? "");
    void close({ projectName, sessionId }, type);
  };
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

  // SplitLayout 渲染：聚焦态 / table（P4）/ split（P5）/ grouped（批 3b 前）的回退。布局空 +
  // 无 focusId → EmptyInstanceArea；布局空 + 有 focusId（addPanel/铺开尚未收敛）→ PlaceholderPanel 防闪。
  const splitContent =
    layout.panels.length === 0 ? (
      focusId ? (
        <PlaceholderPanel focusId={focusId} />
      ) : (
        <EmptyInstanceArea create={create} projectName={ctx.projectKey} />
      )
    ) : (
      <SplitLayout
        isFocused={(ref) => ref.sessionId === focusId}
        layout={layout}
        onClosePanel={closePanel}
        onFocusPanel={focusPanel}
        onResizePair={(leftId, rightId, deltaFlex) =>
          update((prev) => resizePair(prev, leftId, rightId, deltaFlex))
        }
        onToggleMaximize={(sessionId) => update((prev) => toggleMaximize(prev, sessionId))}
        panelLabel={scope.kind === "global" ? (ref) => ref.projectName : undefined}
        renderPanel={(ref) => <PanelRouter key={ref.sessionId} panelRef={ref} />}
      />
    );

  // 非聚焦 overview tab 按 view 分支：grid → InstanceGrid（空 → EmptyInstanceArea，与 split 共用）；
  // grouped → GroupedView（仅 global scope，按项目分段）；聚焦态 / table / split → splitContent。
  const showGrid = focusId === undefined && resolvedView === "grid";
  const showGrouped =
    focusId === undefined && resolvedView === "grouped" && scope.kind === "global";
  const overviewContent = showGrid ? (
    gridItems.length === 0 ? (
      <EmptyInstanceArea create={create} projectName={ctx.projectKey} />
    ) : (
      <InstanceGrid items={gridItems} />
    )
  ) : showGrouped ? (
    <GroupedView candidates={candidates} onClose={closeInstance} onFocus={focusInstance} t={t} />
  ) : (
    splitContent
  );

  // 中栏内容按 tab 分支：聚焦态 / overview tab → overviewContent（grid 卡片网格 / SplitLayout / 空态）；
  // history tab → HistoryList（project-scoped 历史 session；showLabel=false 因 tab bar 已
  //   标识「历史」，避免重复标题）；files/git/prototype tab → 复用右栏 inspection plugin
  //   的 render(ctx)（项目级 inspection）。
  const isOverview = focusId !== undefined || resolvedTab === "overview";
  const isHistory = !isOverview && resolvedTab === "history";
  const inspectionPlugin =
    isOverview || isHistory
      ? null
      : FIRST_PARTY_PLUGINS.find((plugin) => plugin.id === resolvedTab);
  const tabContent = isOverview ? (
    overviewContent
  ) : isHistory && ctx.projectKey !== null ? (
    <div className="h-full overflow-y-auto p-3">
      <HistoryList focusId={focusId} projectName={ctx.projectKey} showLabel={false} />
    </div>
  ) : (
    (inspectionPlugin?.render(ctx) ?? null)
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {!focusId ? (
        <div className="flex h-9 shrink-0 items-center gap-1 border-b border-on-surface/5 px-1.5">
          {visibleTabs.map((opt) => (
            <TabButton
              active={opt.id === resolvedTab}
              key={opt.id}
              label={opt.label}
              onClick={() => onTabChange?.(opt.id)}
            />
          ))}
          {ctx.projectKey !== null || (resolvedTab === "overview" && onViewChange && view) ? (
            <div className="ml-auto flex items-center gap-1">
              {ctx.projectKey !== null ? (
                <CreateSessionBar
                  isCreating={create.isCreating}
                  onCreateAgent={create.createAgent}
                  onCreateTerminal={create.createTerminal}
                />
              ) : null}
              {resolvedTab === "overview" && onViewChange && view ? (
                <ViewSwitcher
                  ariaLabel={t("workbench.viewSwitcher")}
                  onChange={onViewChange}
                  view={resolvedView}
                  views={viewOptions}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-on-surface/5 px-3">
          <span className="truncate text-sm font-semibold text-on-surface">
            {focusDisplayName ?? focusProjectName ?? t("workbench.global")}
          </span>
        </div>
      )}
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
 * 桌面 split 与移动单实例聚焦（Stage 5）共用：桌面 SplitLayout 每面板调一次，
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
        <DropdownMenuItem onSelect={() => onCreateAgent("codex")}>
          <ShellIcon className="h-3.5 w-3.5" name="openai" />
          {t("workbench.createCodex")}
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
 */
export function useGlobalInstanceCandidates(scope: WorkbenchScope): GlobalInstanceCandidate[] {
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
    if (!isGlobal) return [];
    const candidates: GlobalInstanceCandidate[] = [];
    names.forEach((name, index) => {
      for (const session of agentQueries[index]?.data?.sessions ?? []) {
        candidates.push({
          displayName: session.displayName,
          provider: session.provider,
          ref: { projectName: name, sessionId: session.id },
          status: session.status,
          type: "agent",
        });
      }
      for (const session of terminalQueries[index]?.data?.sessions ?? []) {
        candidates.push({
          displayName: session.displayName,
          ref: { projectName: name, sessionId: session.id },
          status: session.status,
          type: "terminal",
        });
      }
    });
    return candidates;
    // names/agentQueries/terminalQueries/isGlobal 由 dataKey fingerprint 覆盖（data 变 → timestamp 变）。
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
  const candidates = useGlobalInstanceCandidates(scope);
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
  create: CreateSessionApi;
  projectName: string | null;
}) {
  const { t } = useT();
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div
        className={`flex min-h-32 flex-1 flex-col items-center justify-center gap-3 rounded-2xl ${shellSurfaceClasses.inset}`}
      >
        {projectName !== null ? (
          <>
            <p className="text-sm text-on-surface-muted">{t("workbench.emptyInstanceHint")}</p>
            <CreateSessionBar
              isCreating={create.isCreating}
              onCreateAgent={create.createAgent}
              onCreateTerminal={create.createTerminal}
            />
          </>
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

/** InstanceCard 自适应网格（设计文档 §8）。纯 presentational——items 由调用方从 query/candidates 派生。 */
export function InstanceGrid({ items }: { items: InstanceGridItem[] }) {
  return (
    <div className="grid gap-2" style={INSTANCE_GRID_STYLE}>
      {items.map(({ key, ...card }) => (
        <InstanceCard key={key} {...card} />
      ))}
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

type GroupedViewProps = {
  candidates: GlobalInstanceCandidate[];
  onClose: (sessionId: string, type: "agent" | "terminal") => void;
  onFocus: (sessionId: string) => void;
  t: (key: TranslationKey) => string;
};

/**
 * grouped 视图（设计文档 §5：仅桌面 global 跨项目分组）。groupByProject 按项目分段，每组
 * 项目名标题（与移动 MobileGlobalOverview 同款 className）+ InstanceGrid。回调复用 InstanceArea
 * 的 focusInstance/closeInstance（与 grid 视图同源，select 进聚焦态 / close 走 useCloseSession）。
 */
function GroupedView({ candidates, onClose, onFocus, t }: GroupedViewProps) {
  const groups = groupByProject(candidates);
  const callbacks: GridItemCallbacks = { onClose, onSelect: onFocus, t };
  return (
    <div className="h-full overflow-y-auto">
      {groups.map((group) => (
        <div className="flex flex-col gap-2 px-3 py-2" key={group.projectName}>
          <p className="text-[0.6rem] font-bold uppercase tracking-[0.12em] text-on-surface-muted">
            {group.projectName}
          </p>
          <InstanceGrid items={group.candidates.map((c) => candidateToGridItem(c, callbacks))} />
        </div>
      ))}
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
