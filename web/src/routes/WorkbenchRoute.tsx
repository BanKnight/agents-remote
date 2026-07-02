import { useParams, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { InstanceArea } from "../components/workbench/instance-area";
import { WorkbenchLeftRail } from "../components/workbench/left-rail";
import { MobileWorkbench } from "../components/workbench/mobile-workbench";
import { type PluginContext } from "../components/workbench/right-panel-plugin";
import { RightPanelTabs } from "../components/workbench/right-panel-tabs";
import { WorkbenchShell } from "../components/shell/workbench-shell";
import {
  type WorkbenchRightTab,
  type WorkbenchScope,
  inferSessionTypeFromId,
  useWorkbenchNavigate,
} from "./workbench-model";

/**
 * 工作台路由（设计文档 §7）。路由树以中栏语义命名（去 `/workbench` 前缀）：project
 * 作用域 `/projects/$key`（+ `/session/$id` 聚焦），global 作用域 `/global`（+
 * `/session/$id` 聚焦）。四个薄壳各自从路由段构造**已解析**的 WorkbenchScope，复用同一
 * WorkbenchContent。同一 URL 桌面（三栏）/ 移动（线性退化）响应式渲染，无跨端 redirect。
 */
export function ProjectScopeRoute() {
  const { key } = useParams({ from: "/projects/$key" });
  const { rightTab } = useSearch({ from: "/projects/$key" });
  return <WorkbenchContent rightTab={rightTab} scope={{ kind: "project", key }} />;
}

export function ProjectFocusRoute() {
  const { key, id } = useParams({ from: "/projects/$key/session/$id" });
  const { rightTab } = useSearch({ from: "/projects/$key/session/$id" });
  return <WorkbenchContent focusId={id} rightTab={rightTab} scope={{ kind: "project", key }} />;
}

export function GlobalScopeRoute() {
  const { rightTab } = useSearch({ from: "/global" });
  return <WorkbenchContent rightTab={rightTab} scope={{ kind: "global" }} />;
}

export function GlobalFocusRoute() {
  const { id } = useParams({ from: "/global/session/$id" });
  const { rightTab } = useSearch({ from: "/global/session/$id" });
  return <WorkbenchContent focusId={id} rightTab={rightTab} scope={{ kind: "global" }} />;
}

function WorkbenchContent({
  focusId,
  rightTab,
  scope,
}: {
  focusId?: string;
  rightTab?: WorkbenchRightTab;
  scope: WorkbenchScope;
}) {
  const isDesktop = useIsDesktopViewport();
  const navigateWorkbench = useWorkbenchNavigate();
  const ctx: PluginContext = {
    projectKey: scope.kind === "project" ? scope.key : null,
    focusId,
    sessionType: focusId ? inferSessionTypeFromId(focusId) : undefined,
  };
  const onRightTabChange = (tab: WorkbenchRightTab) => {
    void navigateWorkbench(scope, focusId, { rightTab: tab });
  };
  if (!isDesktop) {
    return <MobileWorkbench focusId={focusId} scope={scope} />;
  }
  return (
    <WorkbenchShell
      leftPanel={<WorkbenchLeftRail focusId={focusId} scope={scope} />}
      rightPanel={<RightPanelTabs activeTab={rightTab} ctx={ctx} onTabChange={onRightTabChange} />}
    >
      <InstanceArea focusId={focusId} scope={scope} />
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
