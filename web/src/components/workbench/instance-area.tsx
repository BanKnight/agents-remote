import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type GlobalInstanceCandidate,
  type WorkbenchPanelRef,
  type WorkbenchScope,
  addPanel,
  inferSessionTypeFromId,
  rankGlobalInstances,
  removePanel,
  resizePair,
  toggleMaximize,
  useWorkbenchLayout,
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
import { shellSurfaceClasses } from "../shell/shell-primitives";
import { AgentTerminalPanel, ChatPanel, TerminalPanel } from "./instance-panel";
import { SplitLayout } from "./split-panel";

type InstanceAreaProps = {
  scope: WorkbenchScope;
  /** 聚焦面板 id（URL `/workbench/$scope/$focusId`）。无 focusId = 无聚焦面板。 */
  focusId?: string;
};

/**
 * 中栏实例区（设计文档 §4）。消费 workbench split 布局 atom，渲染 `SplitLayout`
 *（多面板同屏）。面板 = 活跃实例 1:1；URL focusId 是「聚焦面板」（输入/右栏跟随），
 * 面板布局（哪些实例同屏、排序）是个人布局进 localStorage。project 作用域按项目分键；
 * global 作用域（commit ④）聚合所有项目活跃实例自动铺开（rankGlobalInstances 排序），
 * 面板带项目前缀。
 */
export function InstanceArea({ scope, focusId }: InstanceAreaProps) {
  const { t } = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { confirm, holder } = useConfirm();
  const [layout, update] = useWorkbenchLayout(scope);
  const candidates = useGlobalInstanceCandidates(scope);

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

  // split 级 close = 结束实例：confirm → API close → 失效缓存 → removePanel →
  // 若关的是聚焦面板，焦点切到剩余首面板（无则回 scope 视图）。embedded 面板自带的
  // header close 在 embedded 模式已隐藏（见 Claude2Chat / SessionDetail），此处为唯一 close。
  const closePanel = async (ref: WorkbenchPanelRef) => {
    const sessionType = inferSessionTypeFromId(ref.sessionId);
    const ok = await confirm({
      cancelLabel: t("cancel"),
      confirmLabel: t("session.close"),
      message: t("session.closeConfirm"),
      title: t("session.close"),
      tone: "danger",
    });
    if (!ok) return;
    try {
      if (sessionType === "agent") {
        await closeAgentSession(ref.projectName, ref.sessionId);
      } else if (sessionType === "terminal") {
        await closeTerminalSession(ref.projectName, ref.sessionId);
      }
    } catch {
      // 会话已结束 / 不存在（404）—— close 幂等，仍移除面板
    }
    if (sessionType === "agent" || sessionType === "terminal") {
      queryClient.removeQueries({
        exact: true,
        queryKey: ["projects", ref.projectName, `${sessionType}-sessions`, ref.sessionId],
      });
      void queryClient.invalidateQueries({ exact: true, queryKey: ["projects"] });
      void queryClient.invalidateQueries({ exact: true, queryKey: ["projects", ref.projectName] });
      void queryClient.invalidateQueries({
        exact: true,
        queryKey: ["projects", ref.projectName, `${sessionType}-sessions`],
      });
    }
    const remaining = layout.panels.filter((p) => p.sessionId !== ref.sessionId);
    update((prev) => removePanel(prev, ref.sessionId));
    if (focusId === ref.sessionId) {
      const scopeParam = scope.kind === "project" ? scope.key : "global";
      void navigate(
        remaining.length > 0
          ? {
              to: "/workbench/$scope/$focusId",
              params: { scope: scopeParam, focusId: remaining[0].sessionId },
            }
          : { to: "/workbench/$scope", params: { scope: scopeParam } },
      );
    }
  };

  const focusPanel = (ref: WorkbenchPanelRef) => {
    if (ref.sessionId === focusId) return;
    const scopeParam = scope.kind === "project" ? scope.key : "global";
    void navigate({
      to: "/workbench/$scope/$focusId",
      params: { scope: scopeParam, focusId: ref.sessionId },
    });
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

  return (
    <>
      {content}
      {holder}
    </>
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
 * 全局实例区候选聚合（commit ④）。仅在 global 作用域发请求：listProjects → 每项目
 * listAgentSessions/listTerminalSessions（useQueries 动态查询，复用左栏 query key 缓存），
 * 扁平化成带状态/类型的候选列表，供 rankGlobalInstances 排序后铺开。非 global 返回空。
 */
function useGlobalInstanceCandidates(scope: WorkbenchScope): GlobalInstanceCandidate[] {
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
  if (!isGlobal) return [];
  const candidates: GlobalInstanceCandidate[] = [];
  names.forEach((name, index) => {
    for (const session of agentQueries[index]?.data?.sessions ?? []) {
      candidates.push({
        ref: { projectName: name, sessionId: session.id },
        status: session.status,
        type: "agent",
      });
    }
    for (const session of terminalQueries[index]?.data?.sessions ?? []) {
      candidates.push({
        ref: { projectName: name, sessionId: session.id },
        status: session.status,
        type: "terminal",
      });
    }
  });
  return candidates;
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
        className={`rounded-2xl px-4 py-3 font-mono text-xs text-slate-600 ${shellSurfaceClasses.inset}`}
      >
        {focusId}
      </div>
    </div>
  );
}
