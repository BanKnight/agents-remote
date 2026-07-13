import { useMemo, type ReactNode } from "react";
import type { GitDiffScope } from "@agents-remote/shared";
import { useT } from "../../i18n";
import {
  type WorkbenchMiddleTab,
  type WorkbenchScope,
  parseGitTabId,
} from "../../routes/workbench-model";
import { buildOverviewTabs } from "./right-panel-plugin";
import { TabButton } from "./right-panel-tabs";
import { HistoryList } from "./history-list";
import { FilesLeftPanel } from "../files/files-left-panel";
import { GitChangesList } from "../git/git-diff-viewer";

type ProjectLeftPanelProps = {
  scope: WorkbenchScope;
  /** [项目] 左栏主体：实例总览（InstanceLeftOverview，WorkbenchContent 构造后注入）。global scope
   *  主体恒为 overview（纯多视图列表，无项目列表，新建项目入口在 InstanceLeftOverview
   *  header）；project scope 主体随 middle tab 切（实例=overview / 历史=HistoryList / 文件=项目内文件树
   *  / git=GitDiffPanel）。 */
  overview: ReactNode;
  // ── Phase 3 middle tab（仅 project scope + nav=projects 用；global scope 不渲染）──
  /** 中栏二级导航 tab（URL `?tab` + atom 回退）；project scope 左栏顶部 middle tab bar 切主体。 */
  tab?: WorkbenchMiddleTab;
  /** 切换 middle tab（写 URL + atom，WorkbenchContent 注入）。 */
  onTabChange?: (next: WorkbenchMiddleTab) => void;
  /** middle tab [文件] 点文件 → 中栏开 file tab（WorkbenchContent onOpenFile）。 */
  onOpenFile: (projectName: string, path: string) => void;
  /** middle tab [git] 点变更文件 → 中栏开 git diff tab（WorkbenchContent onOpenGitFile）。 */
  onOpenGitFile: (projectName: string, scope: GitDiffScope, path: string) => void;
  /** middle tab [历史] HistoryList 聚焦态（URL focusId）。 */
  focusId?: string;
};

/**
 * [项目] 活动栏左栏内容源（Phase 2a 方案 X + Phase 3 middle tab + 左栏重设计，设计 §4.2 / §8.4）。
 *
 * - global scope：仅渲染 InstanceLeftOverview 主体（多视图列表）。新建项目入口在
 *   InstanceLeftOverview header（ViewSwitcher 左侧），项目级导航走活动栏 [项目]（本身已选中）。
 * - project scope：项目名 header + 返回 /projects 在 WorkbenchShell PanelHeader（WorkbenchRoute
 *   leftPanelTitle 注入，阶段 1）；本组件只渲染 middle tab bar（实例/历史/文件/git，Phase 3 从
 *   InstanceArea 中栏移此切**左栏主体**）+ 主体随 tab 切（实例=InstanceLeftOverview / 历史=
 *   HistoryList / 文件=项目内文件树 FilesLeftPanel scope=project / git=GitDiffPanel）。不显项目列表
 *   （设计 §6 决策 1）。
 *
 * middle tab bar 复用 TabButton + buildOverviewTabs（includeHistory=true）。
 */
export function ProjectLeftPanel({
  scope,
  overview,
  tab,
  onTabChange,
  onOpenFile,
  onOpenGitFile,
  focusId,
}: ProjectLeftPanelProps) {
  const { t } = useT();

  // Phase 3 middle tab（仅 project scope）：tab 列表（实例/历史/文件/git，includeHistory=true）+
  // resolvedTab。global scope middleTabs=[]（无 tab bar）。ctx 由 scope 决定，scope/t 变才重算。
  const middleTabs = useMemo(
    () => (scope.kind === "project" ? buildOverviewTabs(t, { projectKey: scope.key }, true) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scope, t],
  );
  // middle tab [git] 当前选中文件（高亮当前 git tab，从 URL focusId parseGitTabId 派生）。
  const selectedGitFile = useMemo(() => {
    if (!focusId) return undefined;
    const parsed = parseGitTabId(focusId);
    return parsed ? { path: parsed.path, scope: parsed.scope } : undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);
  const resolvedTab: WorkbenchMiddleTab =
    tab !== undefined && middleTabs.some((opt) => opt.id === tab) ? tab : "overview";

  // project scope middle tab 主体内容（设计 §4.2 进入项目层）。global scope 主体恒为 overview。
  // [文件] = 项目内文件树（FilesLeftPanel projectName，点文件→中栏开 file tab）；[git] = git plugin
  // render（GitDiffPanel，与移动端 MobileProjectOverview 同源 FIRST_PARTY_PLUGINS）。
  let middleBody: ReactNode = overview;
  if (scope.kind === "project") {
    if (resolvedTab === "history") {
      middleBody = <HistoryList focusId={focusId} projectName={scope.key} showLabel={false} />;
    } else if (resolvedTab === "files") {
      middleBody = <FilesLeftPanel onOpenFile={onOpenFile} projectName={scope.key} />;
    } else if (resolvedTab === "git") {
      middleBody = (
        <GitChangesList
          onSelectGitFile={(file) => onOpenGitFile(scope.key, file.scope, file.path)}
          projectName={scope.key}
          selectedFile={selectedGitFile}
        />
      );
    }
    // resolvedTab === "overview" → middleBody 保持 overview（InstanceLeftOverview 实例总览）。
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {scope.kind === "project" ? (
        // Phase 3 middle tab bar（实例/历史/文件/git，project scope，从中栏移此切左栏主体）。
        // 项目名 header + 返回 /projects 在 WorkbenchShell PanelHeader（WorkbenchRoute leftPanelTitle 注入）。
        // nav landmark（aria-label=workbench.projectsAria="Projects"）：view 切换是项目内导航语义，
        // 给 middle tab bar 一个独立 navigation 地标，与活动栏 nav "Primary navigation" 区分（后者
        // aria-label=nav.primaryAria）；e2e projectsNav 据此定位 middle tab 按钮。
        <nav
          aria-label={t("workbench.projectsAria")}
          className="flex h-9 shrink-0 items-center gap-1 border-b border-on-surface/5 px-1.5"
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
      <div className="min-h-0 flex-1 overflow-hidden">
        {scope.kind === "global" ? overview : middleBody}
      </div>
    </div>
  );
}
