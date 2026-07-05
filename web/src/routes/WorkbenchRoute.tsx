import { useParams, useSearch } from "@tanstack/react-router";
import { useAtom } from "jotai";
import { useEffect, useState } from "react";
import { InstanceArea } from "../components/workbench/instance-area";
import { WorkbenchLeftRail } from "../components/workbench/left-rail";
import { MobileWorkbench } from "../components/workbench/mobile-workbench";
import { type PluginContext } from "../components/workbench/right-panel-plugin";
import { RightPanelTabs } from "../components/workbench/right-panel-tabs";
import { WorkbenchShell } from "../components/shell/workbench-shell";
import {
  type WorkbenchMiddleTab,
  type WorkbenchRightTab,
  type WorkbenchScope,
  type WorkbenchView,
  inferSessionTypeFromId,
  useWorkbenchNavigate,
  workbenchMiddleTabAtom,
  workbenchRightCollapsedAtom,
  workbenchViewAtom,
} from "./workbench-model";

/**
 * 工作台路由（设计文档 §7）。路由树以中栏语义命名（去 `/workbench` 前缀）：project
 * 作用域 `/projects/$key`（+ `/session/$id` 聚焦），global 作用域 `/global`（+
 * `/session/$id` 聚焦）。四个薄壳各自从路由段构造**已解析**的 WorkbenchScope，复用同一
 * WorkbenchContent。同一 URL 桌面（三栏）/ 移动（线性退化）响应式渲染，无跨端 redirect。
 */
export function ProjectScopeRoute() {
  const { key } = useParams({ from: "/projects/$key" });
  const { rightTab, view, tab } = useSearch({ from: "/projects/$key" });
  return (
    <WorkbenchContent rightTab={rightTab} scope={{ kind: "project", key }} tab={tab} view={view} />
  );
}

export function ProjectFocusRoute() {
  const { key, id } = useParams({ from: "/projects/$key/session/$id" });
  const { rightTab, view, tab } = useSearch({ from: "/projects/$key/session/$id" });
  return (
    <WorkbenchContent
      focusId={id}
      rightTab={rightTab}
      scope={{ kind: "project", key }}
      tab={tab}
      view={view}
    />
  );
}

export function GlobalScopeRoute() {
  const { rightTab, view, tab } = useSearch({ from: "/global" });
  return <WorkbenchContent rightTab={rightTab} scope={{ kind: "global" }} tab={tab} view={view} />;
}

export function GlobalFocusRoute() {
  const { id } = useParams({ from: "/global/session/$id" });
  const { rightTab, view, tab } = useSearch({ from: "/global/session/$id" });
  return (
    <WorkbenchContent
      focusId={id}
      rightTab={rightTab}
      scope={{ kind: "global" }}
      tab={tab}
      view={view}
    />
  );
}

function WorkbenchContent({
  focusId,
  rightTab,
  scope,
  view: viewFromUrl,
  tab: tabFromUrl,
}: {
  focusId?: string;
  rightTab?: WorkbenchRightTab;
  scope: WorkbenchScope;
  view?: WorkbenchView;
  tab?: WorkbenchMiddleTab;
}) {
  const isDesktop = useIsDesktopViewport();
  const navigateWorkbench = useWorkbenchNavigate();
  const [rememberedView, setRememberedView] = useAtom(workbenchViewAtom);
  const [rememberedMiddleTab, setRememberedMiddleTab] = useAtom(workbenchMiddleTabAtom);
  // 右栏折叠态与 WorkbenchShell 内 useAtom 共享同一 atom（Jotai 全局）—— 本组件写入（effect
  // + 下方 gate），Shell 读到新值重渲染。无需受控 props 传递。
  const [rightCollapsed, setRightCollapsed] = useAtom(workbenchRightCollapsedAtom);
  const view = viewFromUrl ?? rememberedView;
  const tab = tabFromUrl ?? rememberedMiddleTab;
  const ctx: PluginContext = {
    projectKey: scope.kind === "project" ? scope.key : null,
    focusId,
    sessionType: focusId ? inferSessionTypeFromId(focusId) : undefined,
  };
  // 三个 navigate 都传完整 { view, tab, rightTab }（URL 原始值 viewFromUrl/tabFromUrl/
  // rightTab 合并 + 新值）。TanStack Router navigate 整体替换 search 对象（非 merge），
  // 若只传单键会丢失其他维 —— 违反设计 §13「view/tab/rightTab 正交」。用 URL 原始值
  //（而非 view/tab 解析值）合并，避免把 atom 回退值意外写进 URL。
  const onRightTabChange = (rightTabNext: WorkbenchRightTab) => {
    void navigateWorkbench(scope, focusId, {
      rightTab: rightTabNext,
      tab: tabFromUrl,
      view: viewFromUrl,
    });
  };
  const onViewChange = (next: WorkbenchView) => {
    setRememberedView(next);
    void navigateWorkbench(scope, focusId, { rightTab, tab: tabFromUrl, view: next });
  };
  const onTabChange = (next: WorkbenchMiddleTab) => {
    setRememberedMiddleTab(next);
    void navigateWorkbench(scope, focusId, { rightTab, tab: next, view: viewFromUrl });
  };
  // 右栏可见性跟随 focusId：聚焦态自动展开（看聚焦实例 inspection），非聚焦态默认收起
  //（中栏 5 tab 承载项目级内容；用户可 RailButton 唤出看 project-scoped inspection）。
  // 切 tab 不触发（focusId 不变）→ 保留用户手动唤出；切聚焦态再回非聚焦 → effect 重置收起。
  // 仅桌面端写入：移动端 MobileWorkbench 不读 rightCollapsed atom，避免多余 localStorage 写入。
  useEffect(() => {
    if (!isDesktop) return;
    setRightCollapsed(!focusId);
  }, [focusId, isDesktop, setRightCollapsed]);
  if (!isDesktop) {
    return <MobileWorkbench focusId={focusId} scope={scope} />;
  }
  // project 可唤出右栏（inspection 只依赖 projectKey，非聚焦态唤出看 files/git）；
  // global scope 不唤出右栏（全局 inspection 走中栏 files tab，见 workbench-views §4.1）。
  // 收起态 rightPanel=null（aside 不渲染、零 query），由 RailButton 唤出。
  const rightPanelCollapsible = scope.kind === "project";
  const rightPanel =
    rightPanelCollapsible && !rightCollapsed ? (
      <RightPanelTabs activeTab={rightTab} ctx={ctx} onTabChange={onRightTabChange} />
    ) : null;
  return (
    <WorkbenchShell
      leftPanel={<WorkbenchLeftRail scope={scope} />}
      rightPanel={rightPanel}
      rightPanelCollapsible={rightPanelCollapsible}
    >
      <InstanceArea
        ctx={ctx}
        focusId={focusId}
        onViewChange={onViewChange}
        onTabChange={onTabChange}
        scope={scope}
        tab={tab}
        view={view}
      />
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
