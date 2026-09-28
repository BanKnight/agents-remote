import { useMemo, useState } from "react";
import type { AgentHistoryRange } from "@agents-remote/shared";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useNavigate } from "@tanstack/react-router";

import { useApprovals } from "../../hooks/use-approvals";
import { usePinnedSessions } from "../../hooks/pinned-sessions";
import { useT } from "../../i18n";
import {
  stickyWorkbenchSearch,
  useWorkbenchNavigate,
  useWorkbenchRouteContext,
  workbenchCreateMenuOpenAtom,
  workbenchLastProjectAtom,
} from "../../routes/workbench-model";
import { ShellIcon } from "../shell/icons";
import { useCreateProjectDialog } from "../shell/project-setup";
import { ActionMenu } from "../ui/action-menu";
import { ApprovalPopover } from "./approval-popover";
import { ChatOverview } from "./chat-overview";
import {
  AllSessionsGroupedList,
  buildProjectRows,
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
  // leftMode 默认 "auto"（URL 省略 = auto 语义；WorkbenchRoute 解构默认同口径——focus 路由
  // derive 继承透传不写键，side 直读 context 需自带默认）。
  const { scope, focusId, leftMode = "auto", rightTab, tab, mode } = useWorkbenchRouteContext();
  const navigate = useWorkbenchNavigate();
  const navigateRoute = useNavigate();
  const { openCreate, dialog } = useCreateProjectDialog();
  // 项目行 + 「全部」视图数据（单一 overview 管道，与 StatusBar/InstanceArea dedupe 零额外请求）。
  const { candidates, projectNames, isLoaded } = useGlobalInstanceCandidates({ kind: "global" });
  // 「全部」视图置顶数据（与 candidates 同级并发，settled gate 防置顶组后到跳变——
  // AllSessionsGroupedList 同口径）。
  const { pinned, isLoaded: pinnedLoaded } = usePinnedSessions();
  // aprow（04 pin④ 全局聚合）：桌面任何 scope approvals>0 渲染。⚠️ useApprovals 每实例各自
  // 开 WS：桌面 StatusBar 与本组件 = 2 条 /api/approvals/stream 订阅（承接 ProjectLeftPanel
  // 时代现状，非「单实例纪律」；收敛单一订阅点待办——§6.12k review 记档）。
  const { approvals } = useApprovals(true);

  const isProject = scope.kind === "project";
  // mainPage 态（global + 文件/插件/设置 + 无 focus）side 恒定项目视图（07m/09m/10m「side
  // 仅遮盖主区」，§6.12k design review P2③）：由 workbenchLastProjectAtom 驱动，当前 scope
  // 只决定 main 内容与 footnav .on；无记忆项目时退 05g 会话视图。
  const mainPage = scope.kind === "global" && !focusId && leftMode !== "auto";
  const [lastProject] = useAtom(workbenchLastProjectAtom);
  const sideProjectName = isProject ? scope.key : mainPage ? lastProject : null;
  const create = useCreateSession(sideProjectName);
  const projectInstances = useProjectInstances(sideProjectName);

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

  // 项目行运行数（live ● N）：buildProjectRows 单源（与移动项目页同函数），消费 running 子集。
  const projectRows = useMemo(
    () => buildProjectRows(candidates, projectNames),
    [projectNames, candidates],
  );

  // 切项目：sticky search 全维透传（GroupedProjectsList enterProject 同口径——navigate 整体
  // 替换 search，漏带即丢状态）。
  const enterProject = (name: string) => {
    // 点项目行 = 进该项目实例分组视图：显式重置视图态（scopeSegment 残留「全部」时否则
    // 进项目却是 05g 全部列表——视图态是用户在 side 里上次的选择，跨 scope 导航入口必须
    // 显式表态，反馈④）。
    setScopeSegment("project");
    void navigate(
      { kind: "project", key: name },
      undefined,
      stickyWorkbenchSearch({ rightTab, tab, leftMode, mode }),
    );
  };
  // 实例试点行 → 中栏开 tab（行仅 sideProject 分支渲染；guard 使 TS narrow 显式化，
  // 不留 "  " 死分支——坏状态早暴露）。
  const focusRow = (sessionId: string) => {
    if (sideProjectName === null) return;
    void navigate(
      { kind: "project", key: sideProjectName },
      sessionId,
      stickyWorkbenchSearch({ rightTab, tab, leftMode, mode }),
    );
  };
  // seg4「项目」段：sideProject 语境 = 切回本项目实例分组；global 会话页 = 回上次项目
  //（05g seg4「全部」on 的对侧）。均退出历史态（seg4 与时钟历史互斥——否则高亮切换而
  // 内容仍是历史列表，控件失灵）。
  const selectProjectSeg = () => {
    setHistoryOpen(false);
    if (sideProjectName !== null) {
      setScopeSegment("project");
    } else if (lastProject) {
      // 会话页点「项目」段 = navigate 回上次项目：同样显式重置视图态（组件不重挂，
      // scopeSegment 残留会带到目标 scope）。
      setScopeSegment("project");
      void navigate(
        { kind: "project", key: lastProject },
        undefined,
        stickyWorkbenchSearch({ rightTab, tab, leftMode, mode }),
      );
    }
  };

  // seg4 高亮 = 当前实例区视图态（scopeSegment + historyOpen 派生），非 scope 路由态——
  // 点「全部」只切 side 视图不换 scope，高亮必须跟随内容（反馈④：内容变了、tab 不变）。
  // 历史态（05c）是「项目」段的组头时钟子态，保持项目侧 on。
  const projectSegOn = sideProjectName !== null && (historyOpen || scopeSegment === "project");
  const agentEntries = projectInstances.instances.filter((entry) => entry.type === "agent");
  const terminalEntries = projectInstances.instances.filter((entry) => entry.type === "terminal");
  const allSettled = isLoaded && pinnedLoaded;

  // ── 实例区主体 ──────────────────────────────────────────────────────────────
  let body = null;
  if (sideProjectName !== null && historyOpen) {
    // 05c 历史列表态（时钟切入；HistoryList 空 = null 自然空态，不伪造占位）。包 min-h-0
    // flex-1 wrapper：容器 flex-col 化后 HistoryList（根 h-full）才吃到剩余高、列表自身滚
    //（§6.12k code review：历史态高度链断链——容器非 flex 时 h-full 恒溢出组头高）。
    body = (
      <div className="flex min-h-0 flex-1 flex-col">
        <HistoryList
          focusId={focusId}
          onRangeChange={setRange}
          projectName={sideProjectName}
          range={range}
          showLabel={false}
        />
      </div>
    );
  } else if (chatMode) {
    // Chat 模式（global scope 深链语境）：全局会话列表（原左栏 body 迁入 side）。
    body = <ChatOverview />;
  } else if (sideProjectName !== null && scopeSegment === "project") {
    // 本项目实例分组（microlabel AGENT 会话 / TERMINAL；全空 = 引导行）。
    body =
      projectInstances.isLoading && projectInstances.instances.length === 0 ? (
        <div className="px-3 py-2">
          <CardGridSkeleton plain />
        </div>
      ) : projectInstances.instances.length === 0 ? (
        <div className="px-2 py-1 text-caption text-ink-3">{t("workbench.noActiveSessions")}</div>
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
      <div className="px-2 py-1 text-caption text-ink-3">{t("workbench.globalOverviewEmpty")}</div>
    ) : (
      <AllSessionsGroupedList candidates={candidates} pinned={pinned} projectNames={projectNames} />
    );
  }

  // 实例组头两态：sideProject = 「实例 · <项目名>」（历史态 = 「会话历史 · <项目名>」05c）
  // + 时钟 + plus；否则（global 会话页 / mainPage 无记忆项目）= 「会话」（05g 原文——
  // review P2④：sessionPage 不再裸 null）。时钟 text-primary：.dicon svg 直击 currentColor
  //（specificity 压过 .ghead .clk 继承链），主色须经 color 传入。
  const groupHeader =
    sideProjectName !== null ? (
      <div className="ghead">
        <span className={`tt ${historyOpen ? "text-primary" : ""}`}>
          {historyOpen
            ? t("workbench.historyGroupTitle", { name: sideProjectName })
            : t("workbench.instancesGroupTitle", { name: sideProjectName })}
        </span>
        <button
          aria-label={t("workbench.historyToggleAria")}
          aria-pressed={historyOpen}
          className="dicon ml-auto cursor-pointer text-primary"
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
            /* 「＋」字形放内层 span.plus（容器式热区，inspection-panel PanelTabBar 先例）：
               button 只当 28px 热区（.ghead .plus 的 18×18 字形落在 span 上，伪元素笔画
               不受热区 utilities 干扰——在 plus 上挂 after 星号系列热区类会让竖笔画游离）。 */
            <button
              aria-label={t("workbench.createSessionAria")}
              className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center"
              disabled={create.isCreating}
              type="button"
            >
              <span className="plus" />
            </button>
          }
        />
      </div>
    ) : (
      <div className="ghead">
        <span className="tt">{t("workbench.sessionsGroupTitle")}</span>
      </div>
    );

  return (
    <nav aria-label={t("nav.primaryAria")} className="side sidewin flex h-full w-full flex-col">
      {dialog}
      {/* useCreateSession 契约「promptHolder 由调用方渲染」（instance-area :1585）：实例组头
        plus 菜单的建会话 prompt 挂在此处——批次 1 漏挂导致菜单选类型后 prompt 永不出现。 */}
      {create.promptHolder}
      {/* ── 项目组 ── */}
      <div className="ghead shrink-0">
        <span className="tt">{t("nav.projects")}</span>
        {/* 「＋」= 容器式热区（同实例组头）：button 28px 热区 + 内层 span.plus 字形；
            ml-auto 补 .ghead .tt + .plus 相邻选择器断链（中间隔了热区 button）。 */}
        <button
          aria-label={t("home.createProjectAria")}
          className="ml-auto flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center"
          onClick={openCreate}
          type="button"
        >
          <span className="plus" />
        </button>
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
                <ShellIcon className="size-full" name="project" />
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
      {/* ── seg4 mini（高亮 = projectSegOn 视图态派生：项目实例分组/历史 on 或 05g 全部 on；
          global 会话页 = 全部 on、项目段回上次项目——
          05g「全部」视图同画作用域分段，review P2④） ── */}
      {sideProjectName !== null || sessionPage ? (
        <div className="shrink-0 px-2 pt-2">
          <div aria-label={t("workbench.instancesAria")} className="seg4 mini mx-0" role="tablist">
            <span
              aria-controls="side-instance-panel"
              aria-selected={projectSegOn}
              className={`cursor-pointer ${projectSegOn ? "on" : ""}`}
              onClick={selectProjectSeg}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  selectProjectSeg();
                }
              }}
              role="tab"
              tabIndex={0}
            >
              {t("workbench.scopeSegmentProject")}
            </span>
            <span
              aria-controls="side-instance-panel"
              aria-selected={!projectSegOn}
              className={`cursor-pointer ${projectSegOn ? "" : "on"}`}
              onClick={() => {
                setHistoryOpen(false);
                setScopeSegment("all");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setHistoryOpen(false);
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
      {/* ── 实例区（flex-col：HistoryList 分支列表自身滚，行列表分支容器 overflow 兜底滚——
          纯 overflow 容器 + HistoryList h-full 恒溢出组头高，§8 同族断链 review 修复） ── */}
      <div
        className="flex min-h-0 flex-1 flex-col overflow-y-auto"
        id="side-instance-panel"
        role="tabpanel"
      >
        {groupHeader}
        {sideProjectName !== null && historyOpen ? (
          <div className="px-2 pb-1">
            <HistoryRangeControl onChange={setRange} value={range} />
          </div>
        ) : null}
        {body}
      </div>
      {/* ── aprow 审批橙行（04 pin④：实例区下，全局聚合） ── */}
      {approvals.length > 0 ? (
        <div className="shrink-0">
          <ApprovalPopover approvals={approvals}>
            <button className="aprow w-full cursor-pointer" type="button">
              {t("workbench.approvalRow", { count: approvals.length })}
            </button>
          </ApprovalPopover>
        </div>
      ) : null}
      {/* ── footnav 三项（07m/09m/10m：全局文件/插件/设置，active .on） ── */}
      <div className="footnav footnav--flow flex-none">
        <button
          className={`cursor-pointer ${scope.kind === "global" && leftMode === "files" && !focusId ? "on" : ""}`}
          onClick={() => void navigateRoute({ to: "/files" })}
          type="button"
        >
          <span className="dicon">
            <ShellIcon className="size-full" name="file" />
          </span>
          {t("nav.globalFiles")}
        </button>
        <button
          className={`cursor-pointer ${scope.kind === "global" && leftMode === "plugins" && !focusId ? "on" : ""}`}
          onClick={() => void navigateRoute({ to: "/plugins" })}
          type="button"
        >
          <span className="dicon">
            <ShellIcon className="size-full" name="pages-nav" />
          </span>
          {t("nav.plugins")}
        </button>
        <button
          className={`cursor-pointer ${scope.kind === "global" && leftMode === "settings" && !focusId ? "on" : ""}`}
          onClick={() =>
            void navigateRoute({
              to: "/projects",
              search: stickyWorkbenchSearch({ rightTab, tab, leftMode: "settings" }),
            })
          }
          type="button"
        >
          <span className="dicon">
            <ShellIcon className="size-full" name="settings" />
          </span>
          {t("nav.settings")}
        </button>
      </div>
    </nav>
  );
}

/**
 * 实例试点行（srow2 inst）。agent 行 = dot2 状态点（running 实心 c-success + 600，其余空心
 * ink-2，05 inst 行形制，AllSessionsGroupedList rowClasses 同款）；terminal 行 = dicon 终端
 * 图标 + mono 12px ink-2、无状态点（05:42——dot 状态语言属 agent 会话状态机，review P3⑦）。
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
  const isTerminal = entry.type === "terminal";
  return (
    <button
      aria-current={active ? "true" : undefined}
      className={`srow2 inst w-full cursor-pointer text-left ${active ? "selrow" : ""} ${
        isTerminal ? "font-mono text-caption text-ink-2" : running ? "font-semibold" : "text-ink-2"
      }`}
      onClick={() => onSelect(entry.session.id)}
      type="button"
    >
      {isTerminal ? (
        <span className="dicon">
          <ShellIcon className="size-full" name="terminal" />
        </span>
      ) : (
        <span
          aria-hidden="true"
          className={`dot2 ${running ? "bg-success" : "border-[1.4px] border-ink-2 bg-transparent"}`}
        />
      )}
      <span className="min-w-0 truncate">{entry.session.displayName}</span>
    </button>
  );
}
