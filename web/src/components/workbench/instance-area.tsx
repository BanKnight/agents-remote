import { useEffect, useMemo, useRef } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type GlobalInstanceCandidate,
  type WorkbenchMiddleTab,
  type WorkbenchPanelRef,
  type WorkbenchScope,
  type WorkbenchView,
  addPanel,
  filterWorkbenchViews,
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
  getAgentSession,
  getTerminalSession,
  listAgentSessions,
  listProjects,
  listTerminalSessions,
} from "../../api/client";
import { useConfirm } from "../shell/confirm-dialog";
import { useT } from "../../i18n";
import type { TranslationKey } from "../../i18n/types";
import { shellSurfaceClasses, ViewSwitcher } from "../shell/shell-primitives";
import { AgentTerminalPanel, ChatPanel, TerminalPanel } from "./instance-panel";
import { FIRST_PARTY_PLUGINS, type PluginContext } from "./right-panel-plugin";
import { TabButton } from "./right-panel-tabs";
import { SplitLayout } from "./split-panel";

/** 总览视图 label（WorkbenchView → i18n key，ViewSwitcher 按钮 aria-label/title）。 */
const VIEW_LABEL_KEY: Record<WorkbenchView, TranslationKey> = {
  grouped: "workbench.viewGrouped",
  grid: "workbench.viewGrid",
  table: "workbench.viewTable",
  split: "workbench.viewSplit",
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

  // ViewSwitcher 视图选项（按 scope 过滤；桌面 isMobile=false）。聚焦态不渲染但仍稳定构造。
  const viewOptions = useMemo(
    () => filterWorkbenchViews(scope, false).map((v) => ({ id: v, label: t(VIEW_LABEL_KEY[v]) })),
    [scope, t],
  );

  // 中栏二级导航 tab（设计文档 §4）：overview 常驻 + 第一方 inspection 插件按 ctx 过滤
  //（files/git 需 projectKey，prototype 常驻）。复用 plugin.when 作可见性单一来源，避免
  // 与右栏重复维护 scope 规则。history tab 待批 2b-2 历史拆出后加入。
  const visibleTabs = useMemo<{ id: WorkbenchMiddleTab; label: string }[]>(() => {
    const options: { id: WorkbenchMiddleTab; label: string }[] = [
      { id: "overview", label: t("workbench.tabOverview") },
    ];
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

  const content =
    layout.panels.length === 0 ? (
      focusId ? (
        <PlaceholderPanel focusId={focusId} /> // 布局空但 URL 带 focusId：addPanel/铺开尚未收敛，先占位防闪
      ) : (
        <EmptyInstanceArea />
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

  // 中栏内容按 tab 分支：聚焦态 / overview tab → 实例区（SplitLayout/空态）；
  // files/git/prototype tab → 复用右栏 inspection plugin 的 render(ctx)（项目级 inspection）。
  const isOverview = focusId !== undefined || resolvedTab === "overview";
  const inspectionPlugin = isOverview
    ? null
    : FIRST_PARTY_PLUGINS.find((plugin) => plugin.id === resolvedTab);
  const tabContent = isOverview ? content : (inspectionPlugin?.render(ctx) ?? null);

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
          {resolvedTab === "overview" && onViewChange && view ? (
            <div className="ml-auto">
              <ViewSwitcher
                ariaLabel={t("workbench.viewSwitcher")}
                onChange={onViewChange}
                view={view}
                views={viewOptions}
              />
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="min-h-0 flex-1">{tabContent}</div>
      {holder}
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

function useAgentDetail(panelRef: WorkbenchPanelRef) {
  return useQuery({
    queryKey: ["projects", panelRef.projectName, "agent-sessions", panelRef.sessionId],
    queryFn: () => getAgentSession(panelRef.projectName, panelRef.sessionId),
    retry: false,
    staleTime: 60_000,
  });
}

function useTerminalDetail(panelRef: WorkbenchPanelRef) {
  return useQuery({
    queryKey: ["projects", panelRef.projectName, "terminal-sessions", panelRef.sessionId],
    queryFn: () => getTerminalSession(panelRef.projectName, panelRef.sessionId),
    retry: false,
    staleTime: 60_000,
  });
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

function EmptyInstanceArea() {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className={`min-h-32 flex-1 rounded-2xl ${shellSurfaceClasses.inset}`}>
        {/* 空状态：左栏树创建实例或点历史 session resume 即可加入面板（设计文档 §4） */}
      </div>
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
