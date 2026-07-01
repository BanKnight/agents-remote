import { useParams } from "@tanstack/react-router";
import { InstanceArea } from "../components/workbench/instance-area";
import { WorkbenchShell } from "../components/shell/workbench-shell";
import { parseWorkbenchScope } from "./workbench-model";

/**
 * workbench 路由（设计文档 §7）。桌面常驻三栏工作台入口。
 *
 * 两段路由复用同一 WorkbenchContent：
 * - `/workbench/$scope`：作用域视图（无聚焦实例，实例区空状态）。
 * - `/workbench/$scope/$focusId`：聚焦某实例（中栏渲染其面板）。
 *
 * Stage 1：左栏（项目树）/ 右栏（inspection tab）暂占位，commit ②③ 接入实例面板，
 * Stage 2/3 接入左栏树与右栏 tab。
 */
export function WorkbenchScopeRoute() {
  const { scope } = useParams({ from: "/workbench/$scope" });
  return <WorkbenchContent scope={scope} />;
}

export function WorkbenchFocusRoute() {
  const { scope, focusId } = useParams({ from: "/workbench/$scope/$focusId" });
  return <WorkbenchContent scope={scope} focusId={focusId} />;
}

function WorkbenchContent({ scope, focusId }: { scope: string; focusId?: string }) {
  const workbenchScope = parseWorkbenchScope(scope);
  return (
    <WorkbenchShell>
      <InstanceArea focusId={focusId} scope={workbenchScope} />
    </WorkbenchShell>
  );
}
