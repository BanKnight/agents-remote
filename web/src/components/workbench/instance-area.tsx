import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type WorkbenchPanelRef,
  type WorkbenchScope,
  addPanel,
  inferSessionTypeFromId,
  removePanel,
  useWorkbenchLayout,
} from "../../routes/workbench-model";
import {
  closeAgentSession,
  closeTerminalSession,
  getAgentSession,
  getTerminalSession,
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
 * 面板布局（哪些实例同屏、排序）是个人布局进 localStorage。全局作用域跨项目混排
 * 在 Stage 4 commit ④ 接入；当前仅 project 作用域 split。
 */
export function InstanceArea({ scope, focusId }: InstanceAreaProps) {
  const { t } = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { confirm, holder } = useConfirm();
  const [layout, update] = useWorkbenchLayout(scope);

  // focus → addPanel：URL focusId 指向的实例若不在布局中，加入面板（split-right 默认）。
  // 仅 project 作用域；global 的 focusId 缺 projectName，commit ④ 接入。
  const scopeKey = scope.kind === "project" ? scope.key : "global";
  useEffect(() => {
    if (scope.kind !== "project" || !focusId) return;
    if (layout.panels.some((p) => p.sessionId === focusId)) return;
    update((prev) => addPanel(prev, { projectName: scope.key, sessionId: focusId }));
    // update 是 useWorkbenchLayout 返回的 setState 包装（闭包捕获 scope），稳定足够；
    // layout.panels 入 deps 以便 addPanel 后重检收敛（idempotent，无循环）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, scopeKey, layout.panels]);

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
    if (scope.kind === "project" && focusId === ref.sessionId) {
      void navigate(
        remaining.length > 0
          ? {
              to: "/workbench/$scope/$focusId",
              params: { scope: scope.key, focusId: remaining[0].sessionId },
            }
          : { to: "/workbench/$scope", params: { scope: scope.key } },
      );
    }
  };

  const focusPanel = (ref: WorkbenchPanelRef) => {
    if (ref.sessionId === focusId || scope.kind !== "project") return;
    void navigate({
      to: "/workbench/$scope/$focusId",
      params: { scope: scope.key, focusId: ref.sessionId },
    });
  };

  const content =
    scope.kind !== "project" || layout.panels.length === 0 ? (
      focusId && scope.kind === "project" ? (
        <PlaceholderPanel focusId={focusId} /> // 布局空但 URL 带 focusId：addPanel effect 尚未收敛，先占位防闪
      ) : (
        <EmptyInstanceArea />
      )
    ) : (
      <SplitLayout
        layout={layout}
        isFocused={(ref) => ref.sessionId === focusId}
        onClosePanel={closePanel}
        onFocusPanel={focusPanel}
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
 */
function PanelRouter({ panelRef }: PanelRouterProps) {
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
