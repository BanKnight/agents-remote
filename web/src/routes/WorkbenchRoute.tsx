import { useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { InstanceArea } from "../components/workbench/instance-area";
import { WorkbenchLeftRail } from "../components/workbench/left-rail";
import { MobileWorkbench } from "../components/workbench/mobile-workbench";
import { type PluginContext } from "../components/workbench/right-panel-plugin";
import { RightPanelTabs } from "../components/workbench/right-panel-tabs";
import { WorkbenchShell } from "../components/shell/workbench-shell";
import { inferSessionTypeFromId, parseWorkbenchScope } from "./workbench-model";

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
  const isDesktop = useIsDesktopViewport();
  const ctx: PluginContext = {
    projectKey: workbenchScope.kind === "project" ? workbenchScope.key : null,
    focusId,
    sessionType: focusId ? inferSessionTypeFromId(focusId) : undefined,
  };
  if (!isDesktop) {
    return <MobileWorkbench focusId={focusId} scope={workbenchScope} />;
  }
  return (
    <WorkbenchShell
      leftPanel={<WorkbenchLeftRail focusId={focusId} scope={workbenchScope} />}
      rightPanel={<RightPanelTabs ctx={ctx} />}
    >
      <InstanceArea focusId={focusId} scope={workbenchScope} />
    </WorkbenchShell>
  );
}

/**
 * 桌面视口检测（lg = 1024px，与 WorkbenchShell 三栏/单列断点一致）。
 * 移动端（<lg）走 MobileWorkbench 线性退化；桌面走三栏。Stage 5 提到 lib/ 复用。
 */
function useIsDesktopViewport() {
  const [isDesktop, setIsDesktop] = useState(
    () => window.matchMedia?.("(min-width: 1024px)").matches ?? true,
  );
  useEffect(() => {
    const media = window.matchMedia?.("(min-width: 1024px)");
    if (!media) return;
    const handler = () => setIsDesktop(media.matches);
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, []);
  return isDesktop;
}
