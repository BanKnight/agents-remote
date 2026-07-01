import { useQuery } from "@tanstack/react-query";
import type { WorkbenchScope } from "../../routes/workbench-model";
import { getAgentSession } from "../../api/client";
import { shellSurfaceClasses } from "../shell/shell-primitives";
import { ChatPanel } from "./instance-panel";

type InstanceAreaProps = {
  scope: WorkbenchScope;
  /** 聚焦实例 id（URL `/workbench/$scope/$focusId`）。无 focusId = 空实例区。 */
  focusId?: string;
};

/**
 * 中栏实例区（设计文档 §4）。V1 单面板：按 focusId 渲染聚焦实例的面板。
 * Stage 4 升级为自由 split（多面板同屏）。
 */
export function InstanceArea({ scope, focusId }: InstanceAreaProps) {
  if (!focusId) {
    return <EmptyInstanceArea />;
  }

  if (scope.kind !== "project") {
    // 全局作用域：Stage 4 全局实例区接入（跨项目混排）
    return <PlaceholderPanel focusId={focusId} />;
  }

  return <ProjectInstanceRouter focusId={focusId} projectName={scope.key} />;
}

/**
 * 项目作用域实例路由：查 agent session 详情，按 provider 分发到对应面板。
 * claude2 → ChatPanel；其他 provider / terminal → 占位
 *（commit ③ 接 AgentTerminalPanel/TerminalPanel）。
 */
function ProjectInstanceRouter({ focusId, projectName }: { focusId: string; projectName: string }) {
  const detail = useQuery({
    queryKey: ["projects", projectName, "agent-sessions", focusId],
    queryFn: () => getAgentSession(projectName, focusId),
    retry: false,
    staleTime: 60_000,
  });

  if (detail.isLoading) {
    return <LoadingPanel />;
  }

  if (detail.data?.session.provider === "claude2") {
    return <ChatPanel projectName={projectName} sessionId={focusId} />;
  }

  // 非 claude2 agent（codex/claude）/ terminal（getAgentSession 404）→ commit ③ 接入
  return <PlaceholderPanel focusId={focusId} />;
}

function EmptyInstanceArea() {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className={`min-h-32 flex-1 rounded-2xl ${shellSurfaceClasses.inset}`}>
        {/* Stage 2 左栏树 + 创建入口接入后完善空状态（设计文档 §4 空状态） */}
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
