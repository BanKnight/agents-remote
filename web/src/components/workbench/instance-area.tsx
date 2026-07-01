import type { WorkbenchScope } from "../../routes/workbench-model";
import { shellSurfaceClasses } from "../shell/shell-primitives";

type InstanceAreaProps = {
  scope: WorkbenchScope;
  /** 聚焦实例 id（URL `/workbench/$scope/$focusId`）。无 focusId = 空实例区。 */
  focusId?: string;
};

/**
 * 中栏实例区（设计文档 §4）。V1 单面板：按 focusId 渲染聚焦实例的面板。
 *
 * Stage 1 commit ① 为骨架占位（建立 InstanceArea 在 WorkbenchShell 中栏的挂载点）；
 * commit ②③ 接入 ChatPanel / AgentTerminalPanel / TerminalPanel（按 provider 分发）。
 * Stage 4 升级为自由 split（多面板同屏）。
 */
export function InstanceArea({ focusId }: InstanceAreaProps) {
  if (!focusId) {
    return <EmptyInstanceArea />;
  }

  // 占位：commit ②③ 替换为按 provider 分发的真实面板。
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

function EmptyInstanceArea() {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className={`min-h-32 flex-1 rounded-2xl ${shellSurfaceClasses.inset}`}>
        {/* Stage 2 左栏树 + 创建入口接入后完善空状态（设计文档 §4 空状态） */}
      </div>
    </div>
  );
}
