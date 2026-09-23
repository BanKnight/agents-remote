import { useMemo, useState } from "react";
import type { AgentHistoryRange } from "@agents-remote/shared";
import { useAtomValue, useSetAtom } from "jotai";
import { useNavigate } from "@tanstack/react-router";

import { useApprovals } from "../../hooks/use-approvals";
import { usePinnedSessions } from "../../hooks/pinned-sessions";
import { useT } from "../../i18n";
import {
  stickyWorkbenchSearch,
  useWorkbenchNavigate,
  useWorkbenchRouteContext,
  workbenchCreateMenuOpenAtom,
} from "../../routes/workbench-model";
import { ShellIcon } from "../shell/icons";
import { useCreateProjectDialog } from "../shell/project-setup";
import { ActionMenu } from "../ui/action-menu";
import { ApprovalPopover } from "./approval-popover";
import { ChatOverview } from "./chat-overview";
import {
  AllSessionsGroupedList,
  CardGridSkeleton,
  createSessionMenuItems,
  useCreateSession,
  useGlobalInstanceCandidates,
  useProjectInstances,
  type ProjectInstanceEntry,
} from "./instance-area";
import { HistoryList, HistoryRangeControl } from "./history-list";
import { SessionModeTabs } from "./mobile-workbench";

/**
 * 桌面合并 Sidebar（§6.12k，第十一轮问题 2：4 列 → 3 列，对齐 05/04/05g/05c/07m/09m/10m
 * 原型恒定 side 单栏）。自上而下：
 *
 * 1. **项目组**：ghead「项目」+ plus（新建项目）+ 项目 srow2 行（folder 图标 + 名 +
 *    `live ● N` 运行数 / `live off —`；当前项目行 selrow 600）。点行 = 切项目（05 语义：
 *    原型无 [项目]/[工作台] 一级导航项，项目行即导航）。
 * 2. `dsep` → **seg4 mini**（项目/全部，仅 project scope；global scope 恒 05g「全部」视图，
 *    ghead 文案「会话」——05g 原文）。视图偏好不持久化（§6.10 批次 b 记档口径）。
 * 3. **实例区**：
 *    - project scope「项目」：ghead「实例 · <项目名>」+ 时钟（切 05c 历史列表态，再点返回）
 *      + plus（新建实例菜单，createSessionMenuItems 单源 + workbenchCreateMenuOpenAtom ⌘N 受控）
 *      + microlabel 分组行（AGENT 会话 / TERMINAL；chat 会话是 global 资源不分组——数据模型如此，
 *      不伪造 CHAT·PI 组）。行 = srow2 inst + dot2 状态点；行不可拖（05g 无拖放语义），
 *      点行 = 中栏开 tab（05g pin⑤，行自身 scope 构造 URL——AllSessionsGroupedList 先例）。
 *    - project scope「全部」/ global scope：AllSessionsGroupedList（05g 形态单源）。
 *    - global scope 一级会话页：SessionModeTabs（Agent/Chat）+（chat 模式 → ChatOverview）。
 * 4. **aprow 审批橙行**（04 pin④ 全局聚合）：approvals>0 渲染，点击 = ApprovalPopover
 *    （05f 审批中心，与 ProjectLeftPanel 时代同接线）。
 * 5. **footnav 三项**（全局文件/插件/设置，active .on）：4 目的地导航退役后的唯一一级导航
 *    （07m/09m/10m 原型 footnav 三项）。
 *
 * 挂点：WorkbenchShell `sidebar` prop（grid 第 0 列 aside，仅 ≥lg 渲染）。移动端不消费本组件。
 */
export function WorkbenchSide() {
  const { t } = useT();
  const { scope, focusId, leftMode, rightTab, tab, mode } = useWorkbenchRouteContext();
  const navigate = useWorkbenchNavigate();
  const navigateRoute = useNavigate();
  const { openCreate, dialog } = useCreateProjectDialog();
  // 项目行 + 「全部」视图数据（单一 overview 管道，与 StatusBar/InstanceArea dedupe 零额外请求）。
  const { candidates, projectNames, isLoaded } = useGlobalInstanceCandidates({ kind: "global" });
  // 「全部」视图置顶数据（与 candidates 同级并发，settled gate 防置顶组后到跳变——
  // GlobalProjectsOverview 同口径）。
  const { pinned, isLoaded: pinnedLoaded } = usePinnedSessions();
  // aprow（04 pin④ 全局聚合）：桌面任何 scope approvals>0 渲染。桌面挂点无移动端并存问题
  //（useApprovals WS 单实例纪律同 StatusBar）。
  const { approvals } = useApprovals(true);

  const isProject = scope.kind === "project";
  const projectName = isProject ? scope.key : null;
  const create = useCreateSession(projectName);
  const projectInstances = useProjectInstances(projectName);

  // seg4（仅 project scope）：项目=本项目实例分组（默认）/ 全部=05g 分组列表。
  const [scopeSegment, setScopeSegment] = useState<"project" | "all">("project");
  // 时钟切历史（05c）：project scope seg「项目」内 side 内切换态（再点时钟返回活跃列表）。
  const [historyOpen, setHistoryOpen] = useState(false);
  // 历史时间范围（受控；切档重拉，ProjectLeftPanel 时代同口径）。
  const [range, setRange] = useState<AgentHistoryRange>("week");
  // ⌘N（新建实例）受控菜单：快捷键 set atom true → 实例组头 plus 程序化打开（§6.10 批次 c
  // 半受控化；project scope 才渲染 plus，global 忽略——§6.10 批次 d 拍板维持）。
  const createMenuOpen = useAtomValue(workbenchCreateMenuOpenAtom);
  const setCreateMenuOpen = useSetAtom(workbenchCreateMenuOpenAtom);

  const sessionPage = scope.kind === "global" && leftMode === "auto";
  const chatMode = sessionPage && mode === "chat";

  // 项目行运行数（live ● N）：overview candidates 按项目计 running。
  const projectRows = useMemo(
    () =>
      projectNames.map((name) => ({
        name,
        running: candidates.filter((c) => c.ref.projectName === name && c.status === "running")
          .length,
      })),
    [projectNames, candidates],
  );

  // 切项目：sticky search 全维透传（GroupedProjectsList enterProject 同口径——navigate 整体
  // 替换 search，漏带即丢状态）。
  const enterProject = (name: string) => {
    void navigate(
      { kind: "project", key: name },
      undefined,
      stickyWorkbenchSearch({ rightTab, tab, leftMode, mode }),
    );
  };
  // 实例试点行 → 中栏开 tab（project scope 行 projectName=scope.key 自身，无跨项目歧义）。
  const focusRow = (sessionId: string) => {
    void navigate(
      { kind: "project", key: isProject ? scope.key : "" },
      sessionId,
      stickyWorkbenchSearch({ rightTab, tab, leftMode, mode }),
    );
  };

  const agentEntries = projectInstances.instances.filter((entry) => entry.type === "agent");
  const terminalEntries = projectInstances.instances.filter((entry) => entry.type === "terminal");
  const allSettled = isLoaded && pinnedLoaded;

  // ── 实例区主体 ──────────────────────────────────────────────────────────────
  let body = null;
  if (isProject && historyOpen) {
    // 05c 历史列表态（时钟切入；HistoryList 空 = null 自然空态，不伪造占位）。
    body = (
      <HistoryList
        focusId={focusId}
        onRangeChange={setRange}
        projectName={scope.key}
        range={range}
        showLabel={false}
      />
    );
  } else if (chatMode) {
    // Chat 模式（global scope 深链语境）：全局会话列表（原左栏 body 迁入 side）。
    body = <ChatOverview />;
  } else if (isProject && scopeSegment === "project") {
    // 本项目实例分组（microlabel AGENT 会话 / TERMINAL；全空 = 引导行）。
    body =
      projectInstances.isLoading && projectInstances.instances.length === 0 ? (
        <div className="px-3 py-2">
          <CardGridSkeleton plain />
        </div>
      ) : projectInstances.instances.length === 0 ? (
        <div className="px-2 py-1 text-[12px] text-ink-3">{t("workbench.noActiveSessions")}</div>
      ) : (
        <>
          {agentEntries.length > 0 ? (
            <>
              <div className="microlabel mx-1.5 mb-0.5 mt-2.5 uppercase">
                {t("workbench.agentSessionsGroup")}
              </div>
              {agentEntries.map((entry) => (
                <SideInstanceRow
                  active={entry.session.id === focusId}
                  entry={entry}
                  key={entry.session.id}
                  onSelect={focusRow}
                />
              ))}
            </>
          ) : null}
          {terminalEntries.length > 0 ? (
            <>
              <div className="microlabel mx-1.5 mb-0.5 mt-2.5 uppercase">
                {t("workbench.terminalGroup")}
              </div>
              {terminalEntries.map((entry) => (
                <SideInstanceRow
                  active={entry.session.id === focusId}
                  entry={entry}
                  key={entry.session.id}
                  onSelect={focusRow}
                />
              ))}
            </>
          ) : null}
        </>
      );
  } else {
    // 「全部」/ global：05g 分组列表（settled gate 防置顶组后到跳变）。
    body = !allSettled ? (
      <div className="px-3 py-2">
        <CardGridSkeleton plain />
      </div>
    ) : candidates.length === 0 && projectNames.length === 0 ? (
      <div className="px-2 py-1 text-[12px] text-ink-3">{t("workbench.globalOverviewEmpty")}</div>
    ) : (
      <AllSessionsGroupedList candidates={candidates} pinned={pinned} projectNames={projectNames} />
    );
  }

  // 实例组头（project scope）：「实例 · <项目名>」（历史态 = 「会话历史 · <项目名>」05c）
  // + 时钟 + plus。global scope：「会话」（05g）。
  const groupHeader = isProject ? (
    <div className="ghead">
      <span className={`tt ${historyOpen ? "text-primary" : ""}`}>
        {historyOpen
          ? t("workbench.historyGroupTitle", { name: scope.key })
          : t("workbench.instancesGroupTitle", { name: scope.key })}
      </span>
      <button
        aria-label={t("workbench.historyToggleAria")}
        aria-pressed={historyOpen}
        className="dicon ml-auto cursor-pointer"
        onClick={() => setHistoryOpen((prev) => !prev)}
        type="button"
      >
        <ShellIcon className="clk" name="clock" />
      </button>
      <ActionMenu
        align="start"
        cancelLabel={t("cancel")}
        items={createSessionMenuItems(create, t)}
        onOpenChange={setCreateMenuOpen}
        open={createMenuOpen}
        trigger={
          <button
            aria-label={t("workbench.createSessionAria")}
            className="plus cursor-pointer"
            disabled={create.isCreating}
            type="button"
          />
        }
      />
    </div>
  ) : sessionPage ? null : (
    <div className="ghead">
      <span className="tt">{t("workbench.sessionsGroupTitle")}</span>
    </div>
  );

  return (
    <nav aria-label={t("nav.primaryAria")} className="side sidewin flex h-full w-full flex-col">
      {dialog}
      {/* ── 项目组 ── */}
      <div className="ghead shrink-0">
        <span className="tt">{t("nav.projects")}</span>
        <button
          aria-label={t("home.createProjectAria")}
          className="plus cursor-pointer"
          onClick={openCreate}
          type="button"
        />
      </div>
      <div className="shrink-0">
        {projectRows.map((row) => {
          const selected = isProject && scope.key === row.name;
          return (
            <button
              aria-current={selected ? "page" : undefined}
              className={`srow2 w-full cursor-pointer text-left ${selected ? "selrow font-semibold" : ""}`}
              key={row.name}
              onClick={() => enterProject(row.name)}
              title={row.name}
              type="button"
            >
              <span className="dicon">
                <ShellIcon className="h-3.5 w-3.5" name="project" />
              </span>
              <span className="min-w-0 truncate">{row.name}</span>
              {row.running > 0 ? (
                <span className="live">● {row.running}</span>
              ) : (
                <span className="live off">—</span>
              )}
            </button>
          );
        })}
      </div>
      <div className="dsep shrink-0" />
      {/* ── seg4 mini（仅 project scope；global 恒「全部」视图——05g） ── */}
      {isProject ? (
        <div className="shrink-0 px-2 pt-2">
          <div aria-label={t("workbench.instancesAria")} className="seg4 mini mx-0" role="tablist">
            <span
              aria-controls="side-instance-panel"
              aria-selected={scopeSegment === "project"}
              className={`cursor-pointer ${scopeSegment === "project" ? "on" : ""}`}
              onClick={() => setScopeSegment("project")}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setScopeSegment("project");
                }
              }}
              role="tab"
              tabIndex={0}
            >
              {t("workbench.scopeSegmentProject")}
            </span>
            <span
              aria-controls="side-instance-panel"
              aria-selected={scopeSegment === "all"}
              className={`cursor-pointer ${scopeSegment === "all" ? "on" : ""}`}
              onClick={() => setScopeSegment("all")}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setScopeSegment("all");
                }
              }}
              role="tab"
              tabIndex={0}
            >
              {t("workbench.scopeSegmentAll")}
            </span>
          </div>
        </div>
      ) : null}
      {/* ── 一级会话页 mode tab（global scope 深链语境；移动 MobilePageHeader title 同源） ── */}
      {sessionPage ? (
        <div className="shrink-0 px-2 pt-2">
          <SessionModeTabs mode={mode ?? "agent"} />
        </div>
      ) : null}
      {/* ── 实例区（组头 + 主体同滚，原型 side 整列滚动） ── */}
      <div className="min-h-0 flex-1 overflow-y-auto" id="side-instance-panel" role="tabpanel">
        {groupHeader}
        {isProject && historyOpen ? (
          <div className="px-2 pb-1">
            <HistoryRangeControl onChange={setRange} value={range} />
          </div>
        ) : null}
        {body}
      </div>
      {/* ── aprow 审批橙行（04 pin④：实例区下，全局聚合） ── */}
      {approvals.length > 0 ? (
        <div className="shrink-0 px-2">
          <ApprovalPopover approvals={approvals}>
            <button className="aprow w-full cursor-pointer" type="button">
              {t("workbench.approvalRow", { count: approvals.length })}
            </button>
          </ApprovalPopover>
        </div>
      ) : null}
      {/* ── footnav 三项（07m/09m/10m：全局文件/插件/设置，active .on） ── */}
      <div className="footnav flex-none">
        <button
          className={`cursor-pointer ${scope.kind === "global" && leftMode === "files" ? "on" : ""}`}
          onClick={() => void navigateRoute({ to: "/files" })}
          type="button"
        >
          <span className="dicon">
            <ShellIcon className="h-3.5 w-3.5" name="file" />
          </span>
          {t("nav.globalFiles")}
        </button>
        <button
          className={`cursor-pointer ${scope.kind === "global" && leftMode === "plugins" ? "on" : ""}`}
          onClick={() => void navigateRoute({ to: "/plugins" })}
          type="button"
        >
          <span className="dicon">
            <ShellIcon className="h-3.5 w-3.5" name="pages-nav" />
          </span>
          {t("nav.plugins")}
        </button>
        <button
          className={`cursor-pointer ${scope.kind === "global" && leftMode === "settings" ? "on" : ""}`}
          onClick={() =>
            void navigateRoute({
              to: "/projects",
              search: stickyWorkbenchSearch({ rightTab, tab, leftMode: "settings" }),
            })
          }
          type="button"
        >
          <span className="dicon">
            <ShellIcon className="h-3.5 w-3.5" name="settings" />
          </span>
          {t("nav.settings")}
        </button>
      </div>
    </nav>
  );
}

/**
 * project scope 实例试点行（srow2 inst + dot2 状态点）：running 实心 c-success + 600，
 * 其余空心 ink-2（05 inst 行形制，AllSessionsGroupedList rowClasses 同款）。
 */
function SideInstanceRow({
  active,
  entry,
  onSelect,
}: {
  active: boolean;
  entry: ProjectInstanceEntry;
  onSelect: (sessionId: string) => void;
}) {
  const running = entry.session.status === "running";
  return (
    <button
      className={`srow2 inst w-full cursor-pointer text-left ${active ? "selrow" : ""} ${
        running ? "font-semibold" : "text-ink-2"
      }`}
      onClick={() => onSelect(entry.session.id)}
      type="button"
    >
      <span
        aria-hidden="true"
        className={`dot2 ${running ? "bg-success" : "border-[1.4px] border-ink-2 bg-transparent"}`}
      />
      <span className="min-w-0 truncate">{entry.session.displayName}</span>
    </button>
  );
}
