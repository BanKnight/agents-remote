import { useMemo, useState, type ReactNode } from "react";
import type { AgentHistoryRange } from "@agents-remote/shared";
import { useT } from "../../i18n";
import {
  type WorkbenchMiddleTab,
  type WorkbenchScope,
  type WorkbenchSearch,
} from "../../routes/workbench-model";
import { buildOverviewTabs } from "./workbench-tab-plugin";
import { TabButton } from "./right-panel-tabs";
import { HistoryList, HistoryRangeControl } from "./history-list";
import { PluginsPanel } from "../../routes/PluginsRoute";

/**
 * 左栏 middle tab 收敛集合（§6.12j 批次 3，用户拍板「左栏只留实例+历史+插件」）：
 * 文件/Git/wiki/pages 检视全部归右栏 Inspector（唯一检视入口），左栏不再重复。
 * buildOverviewTabs 是移动端共用源（MobileProjectOverview 消费全集），过滤在本组件做。
 */
const LEFT_PANEL_TAB_IDS: ReadonlySet<string> = new Set(["overview", "history", "plugins"]);

type ProjectLeftPanelProps = {
  scope: WorkbenchScope;
  /** [项目] 左栏主体：实例总览（InstanceLeftOverview，WorkbenchContent 构造后注入）。global scope
   *  主体恒为 overview（纯多视图列表，无项目列表，新建项目入口在 InstanceLeftOverview
   *  header）；project scope 主体随 middle tab 切（实例=overview / 历史=HistoryList /
   *  插件=PluginsPanel）。 */
  overview: ReactNode;
  // ── middle tab（仅 project scope + nav=projects 用；global scope 不渲染）──
  /** 中栏二级导航 tab（URL `?tab` + atom 回退）；project scope 左栏顶部 middle tab bar 切主体。 */
  tab?: WorkbenchMiddleTab;
  /** 切换 middle tab（写 URL + atom，WorkbenchContent 注入）。 */
  onTabChange?: (next: WorkbenchMiddleTab) => void;
  /** middle tab [历史] HistoryList 聚焦态（URL focusId）。 */
  focusId?: string;
  /** middle tab [插件] 项目 skill navigate 保留的 search（?tab/?rightTab/?leftMode 不丢，WorkbenchRoute 组装，透传 PluginsPanel）。 */
  openSkillSearch?: Partial<WorkbenchSearch>;
};

/**
 * [项目] 活动栏左栏内容源（Phase 2a 方案 X + Phase 3 middle tab + 左栏重设计，设计 §4.2 / §8.4；
 * §6.12j 批次 3 检视 IA 收敛）。
 *
 * - global scope：仅渲染 InstanceLeftOverview 主体（多视图列表）。新建项目入口在
 *   InstanceLeftOverview header（ViewSwitcher 左侧），项目级导航走活动栏 [项目]（本身已选中）。
 * - project scope：项目名 header + 返回 /projects 在 WorkbenchShell PanelHeader（WorkbenchRoute
 *   leftPanelTitle 注入）；本组件渲染 middle tab bar（实例/历史/插件，收敛集合见
 *   LEFT_PANEL_TAB_IDS）+ 主体随 tab 切（实例=InstanceLeftOverview / 历史=HistoryList /
 *   插件=PluginsPanel）。文件/Git/wiki/pages 检视归右栏 Inspector，不在此重复。
 *
 * middle tab bar 复用 TabButton + buildOverviewTabs（includeHistory=true，本地收敛过滤）。
 */
export function ProjectLeftPanel({
  scope,
  overview,
  tab,
  onTabChange,
  focusId,
  openSkillSearch,
}: ProjectLeftPanelProps) {
  const { t } = useT();
  // history tab 时间范围（受控，父级持有避免 tab 切换丢失；range 进 queryKey → 切档重拉）。
  const [range, setRange] = useState<AgentHistoryRange>("week");

  // middle tab（仅 project scope）：buildOverviewTabs 全集（含移动端共用源）按收敛集合过滤 +
  // resolvedTab。global scope middleTabs=[]（无 tab bar）。URL ?tab=files 等直链（旧书签/持久化）
  // 落在收敛集合外时 resolvedTab 回退 "overview"。ctx 由 scope 决定，scope/t 变才重算。
  const middleTabs = useMemo(
    () =>
      scope.kind === "project"
        ? buildOverviewTabs(t, { projectKey: scope.key }, true).filter((opt) =>
            LEFT_PANEL_TAB_IDS.has(opt.id),
          )
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scope, t],
  );
  const resolvedTab: WorkbenchMiddleTab =
    tab !== undefined && middleTabs.some((opt) => opt.id === tab) ? tab : "overview";

  // project scope middle tab 主体内容（设计 §4.2 进入项目层）。global scope 主体恒为 overview。
  let middleBody: ReactNode = overview;
  if (scope.kind === "project") {
    if (resolvedTab === "history") {
      middleBody = (
        <HistoryList
          focusId={focusId}
          onRangeChange={setRange}
          projectName={scope.key}
          range={range}
          showLabel={false}
        />
      );
    } else if (resolvedTab === "plugins") {
      middleBody = <PluginsPanel openSkillSearch={openSkillSearch} projectName={scope.key} />;
    }
    // resolvedTab === "overview" → middleBody 保持 overview（InstanceLeftOverview 实例总览）。
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {scope.kind === "project" ? (
        // middle tab bar（实例/历史/插件，project scope，切左栏主体）。
        // 项目名 header + 返回 /projects 在 WorkbenchShell PanelHeader（WorkbenchRoute leftPanelTitle 注入）。
        // nav landmark（aria-label=workbench.projectsAria="Projects"）：view 切换是项目内导航语义，
        // 给 middle tab bar 一个独立 navigation 地标，与活动栏 nav "Primary navigation" 区分（后者
        // aria-label=nav.primaryAria）；e2e projectsNav 据此定位 middle tab 按钮。
        <nav
          aria-label={t("workbench.projectsAria")}
          className="flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-b border-on-surface/5 px-1.5"
        >
          {middleTabs.map((opt) => (
            <TabButton
              active={opt.id === resolvedTab}
              key={opt.id}
              label={opt.label}
              onClick={() => onTabChange?.(opt.id)}
            />
          ))}
        </nav>
      ) : null}
      {scope.kind === "project" && resolvedTab === "history" ? (
        // history tab range 控件（sticky header，在滚动区外；周/半月/全部，默认周——大项目
        // 默认只列近 7 天，避免全量扫描慢）。border 与 nav 一致用 on-surface/5 轻分隔。
        <div className="shrink-0 border-b border-on-surface/5 bg-surface px-3 py-2">
          <HistoryRangeControl onChange={setRange} value={range} />
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {scope.kind === "global" ? overview : middleBody}
      </div>
    </div>
  );
}
