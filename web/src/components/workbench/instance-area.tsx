import {
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAtomValue, useSetAtom } from "jotai";
import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AgentProvider,
  AgentSession,
  ClaudeAutoRetryConfig,
  ListAgentSessionsResponse,
  ListTerminalSessionsResponse,
  OverviewResponse,
  TerminalSession,
} from "@agents-remote/shared";
import { AUTO_RETRY_DEFAULT } from "@agents-remote/shared";
import {
  type DropZone,
  type GlobalInstanceCandidate,
  type TreeNode,
  type WorkbenchGroup,
  type WorkbenchLayoutV3,
  type WorkbenchPanelRef,
  type SessionPanelRef,
  type WikireadPanelRef,
  type WorkbenchScope,
  deriveZone,
  inferSessionTypeFromId,
  instanceNameMemoAtom,
  mergeProjectsWithCandidates,
  rankGlobalInstances,
  tabIdOf,
  useIsDesktopViewport,
  useWorkbenchNavigate,
  useWorkbenchRouteContext,
  workbenchFileTabEditingAtom,
  workbenchRenderContentAtom,
} from "../../routes/workbench-model";
import { type FlatGroup, type FlatRect, flattenLayout } from "./flatten-layout";
import { L3WikiReader, WikiReadNavMenu } from "./mobile-l3";
import { DragSourceCard } from "./drag-source";
import { useHScroll } from "@/hooks/use-h-scroll";
import {
  closeAgentSession,
  closeTerminalSession,
  createAgentSession,
  createTerminalSession,
  fetchOverview,
  fetchOverviewSubtitles,
  getAgentSession,
  getChatSession,
  getProject,
  getTerminalSession,
  listAgentSessions,
  listTerminalSessions,
  updateAutoRetryConfig,
} from "../../api/client";
import { useConfirm } from "../shell/confirm-dialog";
import { useInstanceInfoSheet, type InfoField } from "../shell/info-sheet";
import { usePinnedSessions } from "../../hooks/pinned-sessions";
import { useT } from "../../i18n";
import {
  RETRY_DELAY_STEPS_MS,
  RETRY_MAX_PER_WINDOW_MAX,
  RETRY_MAX_PER_WINDOW_MIN,
  formatRetryDelay,
  stepRetryCount,
} from "../../lib/retry-config";
import { claudeBridgeKey, getClaudeBridge } from "../../routes/claude-adapter";
import { RuntimeConfigDialog, type RuntimeConfigField } from "./runtime-config-dialog";
import type { TranslateFn, TranslationKey } from "../../i18n/types";
import { sessionStatusLabel } from "../../routes/console-model";
import {
  actionButtonClasses,
  LoadingBlock,
  sessionMarker,
  shellSurfaceClasses,
  type ShellTone,
  statusDotToneBg,
  statusToTone,
  toggleSwitchKnobClasses,
  toggleSwitchTrackClasses,
} from "../shell/shell-primitives";
import { AgentTerminalPanel, AcpPanel, ChatPanel, TerminalPanel } from "./instance-panel";
import { ChatSessionDetailBody } from "../../routes/ChatSessionDetailRoute";
import { FileTabPreview, FileTabStripActions } from "../files/file-preview-panel";
import { resolveRootBrowseTarget } from "../files/file-browser";
import { resolveRelativeFilePath } from "../files/relative-md-link";
import { MarkdownLinkContext } from "../markdown/markdown-components";
import { type GitDiffScope } from "@agents-remote/shared";
import { SkillTabPreview } from "../../routes/plugins-shared";
import { GitFileDiffPanel } from "../git/git-diff-viewer";
import { relativeTime } from "./history-list";
import { useInstanceRowActions } from "./instance-actions";
import { ActionMenu, type ActionMenuItem } from "../ui/action-menu";

import { Dialog, DialogContent } from "../ui/dialog";
import { MobileSheet } from "../shell/mobile-sheet";
import { ShellIcon } from "../shell/icons";
import { usePromptDialog } from "../shell/prompt-dialog";

/**
 * InstanceCard 固定单列网格 inline style（经 CardGridSkeleton 单源共享：桌面左总览 / side
 * 总览 / 移动总览骨架同消费）。设计 §5：左总览
 * 固定单列卡片清单，`gridTemplateColumns: 1fr` 让卡片宽度始终 = 容器宽，拖宽左总览只让卡片
 * 变宽不增列。不用 `auto-fill minmax`——它会在 ≥440px 自动变 2 列，卡片缩到 minmax 下限
 * 内容拥挤，违反"父容器默认单列宽度排布"。用 inline style 而非 Tailwind 任意值：含括号/
 * 逗号时 Tailwind v4 任意值解析不稳定（dist CSS 实测不落盘规则）。配合 `grid gap-2` className。
 */
export const INSTANCE_GRID_STYLE: CSSProperties = {
  gridTemplateColumns: "1fr",
};

/** 卡片总览加载骨架的占位卡片数（行级骨架 HistoryListSkeleton 用 3，卡片网格翻倍 6）。 */
export const INSTANCE_SKELETON_ROW_COUNT = 3;

/**
 * 卡片总览加载骨架：自适应网格（与真实卡片网格同构，共享 INSTANCE_GRID_STYLE）。每张占位卡
 * 模拟 InstanceCard 结构（设计 §7）：raised surface + rounded-lg + p-3 + flex items-start gap-3——
 * 左侧 marker 占位（h-9 w-9 rounded-md，对齐 IconMarker lg 36px）+ 右侧内容栈 3 行，行高对齐真实
 * line-height 行盒（title text-sm h-5=20px / subtitle text-xs h-4=16px / meta text-xs h-4=16px，
 * gap-1 对齐真实 flex-col gap-1）+ 右上 actions 占位（absolute right-2 top-2 h-7 w-7，对齐 InstanceCard
 * 折叠触发器）。骨架条用 line-height 而非 font-size——加载完内容栈总高与真实一致（行盒 20+16+16=52，
 * 实测 InstanceCard contentSum=52），消除卡片高度跳变。skeleton-shimmer 与 ProjectCardSkeleton 一致。
 * plain 占位卡非首张顶部分割线 mirror InstanceCard `topSeparator`（两端统一 left-15=60px=p-3+marker lg+gap-3 内容区左，跳过 marker 列；
 * 2026-08-03 撤销桌面 lg:left-0 全宽），替代原 `divide-y`（border-top 横跨全宽不支持 inset）。
 *
 * 桌面 InstanceArea 总览加载 + 左栏 ProjectInstances 加载 + 移动 grid 加载共用——单一 skeleton
 * 范式，避免三处各写一份。pending 时占位，替代 EmptyInstanceArea 的"伪空态"。
 *
 * `count` 参数化（默认 INSTANCE_SKELETON_ROW_COUNT * 2 = 6）：grid/InstanceArea/global 总览加载
 * 均用默认 6 张（单列卡片骨架，与融合视图同构）。
 */
export function CardGridSkeleton({
  plain = false,
  count = INSTANCE_SKELETON_ROW_COUNT * 2,
}: {
  plain?: boolean;
  count?: number;
} = {}) {
  return (
    <div className={plain ? "grid" : "grid gap-2"} style={INSTANCE_GRID_STYLE}>
      {Array.from({ length: count }, (_, index) => (
        <div
          className={`relative flex items-start gap-3 p-3 ${
            plain ? "" : `rounded-lg ${shellSurfaceClasses.raised}`
          }`}
          key={index}
        >
          {plain && index > 0 ? (
            <div
              aria-hidden="true"
              className="absolute right-0 top-0 h-px bg-neutral-line/40 left-15"
            />
          ) : null}
          <span aria-hidden="true" className="skeleton-shimmer h-9 w-9 shrink-0 rounded-md" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span aria-hidden="true" className="skeleton-shimmer h-5 w-2/3 rounded" />
            <span aria-hidden="true" className="skeleton-shimmer h-4 w-1/2 rounded" />
            <span aria-hidden="true" className="skeleton-shimmer h-4 w-2/5 rounded" />
          </div>
          <span
            aria-hidden="true"
            className="skeleton-shimmer absolute right-2 top-2 h-7 w-7 rounded-md"
          />
        </div>
      ))}
    </div>
  );
}

type InstanceAreaProps = {
  /** 项目名（WorkspaceTree projectName）。null = global scope。Phase 3 原 ctx/scope/focusId/tab/onTabChange
   * 精简——tab bar（实例/历史/文件/git）移到 ProjectLeftPanel 左栏顶部切左栏主体，中栏瘦身纯 group+tab。 */
  projectName: string | null;
  // ── Phase 2a：以下 props 由 WorkbenchContent 提升 state 后注入（瘦身后的右工作区 + tab bar）──
  /** V3 n 叉树布局（WorkbenchContent useWorkbenchLayout）；WorkspaceTree 渲染 root + maximized。 */
  layout: WorkbenchLayoutV3;
  /** 创建实例 API（WorkspaceTree 的 EmptyInstanceArea 空态 + create 透传）。 */
  create: CreateSessionApi;
  /** 全局活跃实例数（globalRefs.length，EmptyInstanceArea 双语义 hasActiveInstances）。
   * 中栏单一 layout（VSCode 式）后 tab 跨项目共存，中栏空时是否显空态提示（true）/ 创建态
   * （false）基于全局实例，而非当前 scope（InstanceArea 仅桌面渲染，globalRefs 桌面 fan-out）。 */
  refsCount: number;
  /** 全局实例 refs 加载完成标志（useGlobalInstanceRefs().isLoaded 透传；false 时空态卡换成
   * CardGridSkeleton，防 pending 闪伪空态，§6.12o）。 */
  refsLoaded?: boolean;
  /** 拖放高亮区（DropZoneOverlay + WorkspaceTree activeZone）。 */
  activeZone: { targetGroupId: string | null; zone: DropZone } | null;
  setActiveZone: (zone: { targetGroupId: string | null; zone: DropZone } | null) => void;
  /** 拖动源 ref（ghost 显示）；dragState 非空时 WorkspaceTree pointer-events:none。 */
  draggingRef: WorkbenchPanelRef | null;
  dragState: {
    ref: WorkbenchPanelRef;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null;
  /** drop 编排（WorkbenchContent 创建，dropIntoLeaf + 自动聚焦）。 */
  onDrop: () => void;
  cancelDrag: () => void;
  /** 拖动指针位置更新（DropZoneOverlay onPointerMove）。 */
  onSetDragPointer: (x: number, y: number) => void;
  /** 拖动源启动（卡片源 + tab 源共享单一实例，WorkbenchContent 创建）。 */
  onCardDragStart: (ref: WorkbenchPanelRef, event: PointerEvent<HTMLDivElement>) => void;
  // ── 右工作区 leaf/tab 操作（WorkbenchContent 提升为成品 callback）──
  onCloseTab: (groupId: string, tabId: string) => void;
  /** v1.5 批 4：GroupHeader file tab ⋯「查看 diff」（WorkbenchRoute onOpenGitFile 透传）。 */
  onOpenGitDiff?: (projectName: string, scope: GitDiffScope, path: string) => void;
  /** 批 13 反馈⑤ review P1：md 相对链接打开（透传 WorkspaceTree → PanelRouter file 分支，
   *  MarkdownLinkContext per-panel value）。 */
  onOpenFile?: (projectName: string, path: string) => void;
  onResizeSplit: (
    splitId: string,
    leftChildId: string,
    rightChildId: string,
    deltaFlex: number,
  ) => void;
  onSelectTab: (groupId: string, tabId: string) => void;
  /** 分屏按钮（§6.10-3，WorkbenchContent：创建终端 ref → dropIntoLeaf right → navigate）。 */
  onSplitLeaf: (groupId: string) => void;
  /** 关闭实例（contextMenu onKillTab 用，WorkbenchContent closeInstance）。 */
  closeInstance: (sessionId: string, type: "agent" | "terminal") => void;
};

/**
 * 中栏右工作区（Phase 2a 方案 X 瘦身 + Phase 3 进一步精简）。左总览已搬到 WorkbenchShell `leftPanel`
（左栏多视图列表）；tab bar（overview/history/files/git）+ history/inspection 内容
 * 也移到 `ProjectLeftPanel` 左栏（project scope middle tab 切**左栏主体**）。本组件仅保留：右工作区
 *（WorkspaceTree group+tab 常驻分屏）+ DropZoneOverlay（拖放目标）+ tab 右键菜单。
 *
 * **无共享 state**：layout/drag 三件套/focus+prune effects/candidates/create/close/rename 全由
 * WorkbenchContent 提升持有，本组件纯消费 props 渲染。仅 tab 右键菜单（contextMenu）state 内聚
 * 留此（仅服务右工作区 tab，消费 onCloseTab/closeInstance 成品）。
 */
export function InstanceArea({
  projectName,
  layout,
  create,
  refsCount,
  refsLoaded = true,
  activeZone,
  setActiveZone,
  draggingRef,
  dragState,
  onDrop,
  cancelDrag,
  onSetDragPointer,
  onCardDragStart,
  onCloseTab,
  onResizeSplit,
  onSelectTab,
  onSplitLeaf,
  closeInstance,
  onOpenGitDiff,
  onOpenFile,
}: InstanceAreaProps) {
  const { t } = useT();

  // tab 右键菜单（设计 §7.1）：右键 tab 弹轻量菜单「最小化」+「关闭实例 kill」。
  // minimize 复用 onCloseTab（WorkbenchContent 注入，session 存活）；kill 走 closeInstance
  //（WorkbenchContent closeInstance，confirm → close API → 失效缓存）。
  const [contextMenu, setContextMenu] = useState<{
    groupId: string;
    tabId: string;
    x: number;
    y: number;
  } | null>(null);
  const onTabContextMenu = useCallback((groupId: string, tabId: string, x: number, y: number) => {
    setContextMenu({ groupId, tabId, x, y });
  }, []);
  const closeContextMenu = useCallback(() => setContextMenu(null), []);
  const onMinimizeTab = useCallback(() => {
    if (!contextMenu) return;
    onCloseTab(contextMenu.groupId, contextMenu.tabId);
    setContextMenu(null);
  }, [contextMenu, onCloseTab]);
  const onKillTab = useCallback(() => {
    if (!contextMenu) return;
    const type = inferSessionTypeFromId(contextMenu.tabId);
    if (type) closeInstance(contextMenu.tabId, type);
    setContextMenu(null);
  }, [contextMenu, closeInstance]);
  // 仅 session tab 提供 kill（file tab 无 session 生命周期，右键菜单不渲染 kill 项）。
  const contextMenuIsSession =
    contextMenu !== null && inferSessionTypeFromId(contextMenu.tabId) !== undefined;

  // 右工作区 = n 叉树递归渲染（设计 §7.5）。dragState 期间 WorkspaceTree 根容器 pointer-events:none
  // 让 elementFromPoint 命中 overlay 下层 GroupCell 的 data-drop-group（pointer capture 在源卡片）。
  // Phase 3：中栏瘦身纯 group+tab 常驻（tab bar + history/inspection content 移到 ProjectLeftPanel
  // 左栏顶部 middle tab，切左栏主体；中栏不再随 middle tab 变）。
  const rightWorkspace = (
    <WorkspaceTree
      activeZone={activeZone}
      closeInstance={closeInstance}
      create={create}
      draggingRef={draggingRef}
      hasActiveInstances={refsCount > 0}
      maximized={layout.maximized}
      refsLoaded={refsLoaded}
      onCloseLeafTab={onCloseTab}
      onOpenGitDiff={onOpenGitDiff}
      onOpenFile={onOpenFile}
      onResizeSplit={onResizeSplit}
      onSelectTab={onSelectTab}
      onSplitLeaf={onSplitLeaf}
      onTabContextMenu={onTabContextMenu}
      onTabDragStart={onCardDragStart}
      projectName={projectName}
      root={layout.root}
    />
  );

  return (
    <div className={`flex h-full min-h-0 flex-col${dragState ? " select-none" : ""}`}>
      {/* 右工作区 + drop overlay。外层 relative 容器承接空态 drop（data-drop-empty）；
          dragState 期间 DropZoneOverlay 显示 zone 高亮。WorkspaceGrid 空 panels 时
          渲染 EmptyInstanceArea（也标注 data-drop-empty 让空白区 drop 命中）。 */}
      <div
        className="relative min-h-0 flex-1"
        data-drop-empty={layout.root === null ? "" : undefined}
      >
        {rightWorkspace}
        {dragState ? (
          <DropZoneOverlay
            activeZone={activeZone}
            dragPointer={{ x: dragState.currentX, y: dragState.currentY }}
            dragSourceRef={draggingRef}
            layout={layout}
            onCancel={cancelDrag}
            onDrop={onDrop}
            onPointerMove={onSetDragPointer}
            onZoneChange={setActiveZone}
            t={t}
          />
        ) : null}
      </div>
      {contextMenu ? (
        <TabContextMenu
          anchor={contextMenu}
          onClose={closeContextMenu}
          onKill={contextMenuIsSession ? onKillTab : undefined}
          onMinimize={onMinimizeTab}
        />
      ) : null}
    </div>
  );
}

/**
 * 左总览（批 F：project-only）。global [项目] 总览（原 `GlobalProjectsOverview`，已删）由
 * AllSessionsGroupedList（05g 形态）承载，本组件仅承载 project scope 左栏：CreateSessionBar（创建实例）+ 卡片网格（grid 单
 * 视图，project scope 无视图切换）+ EmptyInstanceArea + CardGridSkeleton。承载于 WorkbenchShell
 * `leftPanel`（DOM 四栏第 1 列）。
 *
 * **无 state**：所有数据（projectInstances/create/回调/dragAdapter）由 WorkbenchContent 经 props
 * 注入；dragState 不进 props（拖动期间不重渲染），故用 `memo` 包裹。内部仅派生纯计算
 *（gridItems/gridDragRefs/overviewLoading）。
 *
 * 与 InstanceArea（瘦身后的右工作区）互补：本组件出拖放源（dragAdapter），InstanceArea 收拖放
 * 目标（DropZoneOverlay）。onCardDragStart 单一实例由 WorkbenchContent 创建，卡片源 + tab 源共享。
 */
/**
 * 05g「全部会话」分组列表（§6.12j 批次 5）：microlabel 按项目分组 + 置顶段最前 + 行带项目限定
 * 符（pin②③）。行 = srow2.inst（dot2 状态点：running 实心 c-success、其余 1.4px 空心 ink-2）；
 * 置顶行 = pin 图标 + live off 徽章显项目名（防重名限定符）；空项目组 = 「暂无活跃会话」引导行
 *（05g「DOCS-WIKI · 0」段）。点行 = 中栏开 tab 并激活（pin⑤，组件内导航——行自身 candidate.ref
 * 构造 URL，project scope 下不被 scope.key 捷径覆盖，WorkbenchRoute focusInstance 的
 * resolveProjectName 对跨项目行会生成错乱 URL）；当前
 * focusId 命中行 selrow 高亮。行不可拖（05g 无拖放语义）：拖源仍由项目树卡片 + 中栏 tab 承担。
 * 组头大写 = uppercase utility（原型 AGENTS-WEB · 2 手写大写，实现交给 CSS）。
 */
export function AllSessionsGroupedList({
  candidates,
  pinned,
  projectNames,
}: {
  candidates: GlobalInstanceCandidate[];
  pinned: Set<string>;
  projectNames: string[];
}) {
  const { t } = useT();
  const { focusId, leftMode, rightTab, tab, mode } = useWorkbenchRouteContext();
  const navigate = useWorkbenchNavigate();
  // pin⑤ 点行激活：导航用行自身 ref（session 自身 projectName 构造 URL——WorkbenchRoute
  // focusPanel 注释 :366 铁律）；sticky search 维透传对齐 navigateSession（漏带即从 URL 丢状态）。
  const focusRow = (c: GlobalInstanceCandidate) => {
    void navigate({ kind: "project", key: c.ref.projectName }, c.ref.sessionId, {
      leftMode,
      rightTab,
      tab,
      mode,
    });
  };
  const groups = useMemo(
    () => mergeProjectsWithCandidates(projectNames, candidates),
    [projectNames, candidates],
  );
  const pinnedCandidates = useMemo(
    () => candidates.filter((c) => pinned.has(c.ref.sessionId)),
    [candidates, pinned],
  );
  const rowClasses = (c: GlobalInstanceCandidate) =>
    `srow2 inst w-full cursor-pointer text-left ${c.ref.sessionId === focusId ? "selrow" : ""} ${
      c.status === "running" ? "font-semibold" : "text-ink-2"
    }`;
  return (
    <div className="pb-2">
      {pinnedCandidates.length > 0 ? (
        <>
          <div className="microlabel mx-1.5 mb-0.5 mt-2.5 uppercase">
            {t("workbench.pinnedGroup")}
          </div>
          {pinnedCandidates.map((c) => (
            <button
              className={rowClasses(c)}
              key={c.ref.sessionId}
              onClick={() => focusRow(c)}
              type="button"
            >
              <ShellIcon aria-hidden="true" className="size-3 flex-none text-ink-2" name="pin" />
              <span className="min-w-0 truncate">{c.displayName}</span>
              <span className="live off">{c.ref.projectName}</span>
            </button>
          ))}
        </>
      ) : null}
      {groups.map((group) => (
        <div key={group.projectName} className="animate-stagger-rows">
          <div className="microlabel mx-1.5 mb-0.5 mt-2.5 uppercase">
            {t("workbench.allSessionsGroupLabel", {
              count: group.candidates.length,
              name: group.projectName,
            })}
          </div>
          {group.candidates.length === 0 ? (
            <div className="px-2 py-1 text-[12px] text-ink-3">
              {t("workbench.noActiveSessions")}
            </div>
          ) : (
            group.candidates.map((c) => (
              <button
                className={rowClasses(c)}
                key={c.ref.sessionId}
                onClick={() => focusRow(c)}
                type="button"
              >
                <span
                  aria-hidden="true"
                  className={`dot2 ${instanceDot2(c.status === "running")}`}
                />
                <span className="min-w-0 truncate">{c.displayName}</span>
              </button>
            ))
          )}
        </div>
      ))}
    </div>
  );
}

type PanelRouterProps = {
  panelRef: WorkbenchPanelRef;
  /** 相对 .md 内链目标打开（批 13 反馈⑤ review P1：MarkdownLinkContext per-panel 下沉——
   *  中栏顶层单 Provider 用「当前激活 tab」当解析基准，split 多窗格下会按错窗格的文件目录
   *  解析；下沉到 file 分支后每个 file panel 自带基准，session/git 等 pane 不被误罩（其内的
   *  相对 .md 链接保持浏览器默认行为）。 */
  onOpenFile?: (projectName: string, path: string) => void;
};

/**
 * 单面板路由：按 sessionId 前缀推断类型 → 查详情 → 渲染对应面板（claude→ChatPanel、
 * 其他 agent→AgentTerminalPanel、terminal→TerminalPanel）。复用 Stage 1 的嵌入式面板。
 *
 * 右工作区活动组 + 移动单实例聚焦共用：桌面右工作区 GroupHeader 下调一次，
 * 移动聚焦态调一次（不 split，单实例）。面板内部依赖父级 flex-col 让 flex-1 runtime
 * body 撑满，调用方容器须 `flex min-h-0 flex-1 flex-col overflow-hidden`。
 *
 * memo（见下方 `export const PanelRouter = memo(PanelRouterBase)`）：阻断「父级驱动的无关
 * 重渲染」。桌面多 group 切别的 group 的 tab 会同时改全局 layout root + URL focusId →
 * WorkspaceTree 全量重渲染所有 panel；agent 面板（ChatPanel/SessionDetail）有 live 自动
 * 吸底/xterm fit 逻辑，重渲染会触发其内容滚动跳变（往上翻历史被拉回底部）。memo 让 panel
 * 只在自身 props（panelRef）变化时重渲染——桌面 p.ref 引用稳定
 * （flattenLayout 是纯投影，ref 字段指向 state 树同一节点，切无关 group 的 tab 不变），
 * 故跳过重渲染 → 滚动保持。panel 自身查询/hook 驱动的更新不受影响（memo 只拦父级重渲染）。
（memo 惯例，原 InstanceLeftOverview 同款——§6.12k 后已退役）。
 */
function PanelRouterBase({ panelRef, onOpenFile }: PanelRouterProps) {
  // file tab 渲染 FileTabPreview（v1.5 批 4：FilePreviewPane 中栏形态——预览/编辑/渲染三态
  // + editing atom 受控，05h 原型；queryScope="file-nav"，设计 §6 决策 16/18）。
  // path=全路径（含项目名前缀），FileTabPreview 内部 resolveRootBrowseTarget 解析 projectName
  // 走 project preview API（设计 workbench-stable-refactor Phase 3，去 projectName 字段）。
  // md 内链（批 13 反馈⑤ review P1）：MarkdownLinkContext per-panel——Provider 包本 panel 子树，
  // value 以**本 panel 的文件**目录为解析基准（split 多窗格下每个 file panel 自带基准，不共用
  // 「当前激活 tab」）；session/git/skill 等 pane 不被误罩（其内的相对 .md 链接保持浏览器默认）。
  if (panelRef.kind === "file") {
    const target = resolveRootBrowseTarget(panelRef.path);
    return (
      <MarkdownLinkContext.Provider
        value={
          onOpenFile && target.kind === "project"
            ? (href) =>
                onOpenFile(target.projectName, resolveRelativeFilePath(target.relativePath, href))
            : null
        }
      >
        <FileTabPreview panelRef={panelRef} />
      </MarkdownLinkContext.Provider>
    );
  }
  // wikiread tab 渲染 L3WikiReader（v1.5 批 4，spec §4.6：wiki 阅读进中栏——与移动面板
  // wikiread 标签同一 reader 单源，actbtn「让 Agent 读这篇」随组件自带）。rel 同组页跳转
  // navigate 到 wiki 深链 URL → focus effect 开/激活对应 slug 的 wikiread tab（URL 单一管道，
  // 每 slug 一个 tab 与移动「同目标已开=激活幂等」同构）；copyLinkInBody=false 对齐
  // wiki-reader 原型（.fmeta 右端仅 actbtn，无 wlink）。
  if (panelRef.kind === "wikiread") {
    return <WikireadTabBody panelRef={panelRef} />;
  }
  // skill tab 渲染 SkillTabPreview（只读 SKILL.md 预览，对标 FileTabPreview）。name 来自 tab ref；
  // SkillTabPreview 内部用 DEFAULT_SKILL_AGENT 调 useSkillPreview。中栏 tab 关闭走 tab ✕。
  // skill 预览内的相对 .md 链接不接 MarkdownLinkContext（已知限制，批 13 review 记档）：skill
  // 可能来自全局目录（无项目绑定），相对链接没有可靠的解析基准，保持浏览器默认行为。
  if (panelRef.kind === "skill") {
    return <SkillTabPreview name={panelRef.name} />;
  }
  // git tab 渲染 GitFileDiffPanel（自带 file diff query，设计 workbench-layout-fix 阶段 3）。
  // projectName/scope/path 来自 tab ref 固定；不传 onClose（中栏 tab 关闭走 tab ✕，非移动浮层）。
  if (panelRef.kind === "git") {
    return panelRef.mode === "compare" ? (
      <GitFileDiffPanel
        base={panelRef.base}
        compare={panelRef.compare}
        mode="compare"
        path={panelRef.path}
        projectName={panelRef.projectName}
      />
    ) : (
      <GitFileDiffPanel
        mode="scope"
        path={panelRef.path}
        projectName={panelRef.projectName}
        scope={panelRef.scope}
      />
    );
  }
  // chat tab 渲染 ChatSessionDetailBody（embedded：无独立全屏/返回 header，thread 直接嵌
  // 中栏 flex-col；tab 名由 usePanelMeta chat 分支提供）。
  if (panelRef.kind === "chat") {
    return <ChatSessionDetailBody id={panelRef.sessionId} embedded />;
  }
  // render tab 渲染 HtmlRenderPanel（聊天流 ```html 代码块「渲染」落点，sandbox iframe
  // srcDoc；内容在 workbenchRenderContentAtom，刷新即失——normalizeRef 已在恢复时剔除）。
  if (panelRef.kind === "render") {
    return <HtmlRenderPanel id={panelRef.id} />;
  }
  const sessionType = inferSessionTypeFromId(panelRef.sessionId);
  if (sessionType === "agent") {
    return <AgentPanelRouter panelRef={panelRef} />;
  }
  if (sessionType === "terminal") {
    return <TerminalPanelRouter panelRef={panelRef} />;
  }
  return <PlaceholderPanel focusId={panelRef.sessionId} />;
}

export const PanelRouter = memo(PanelRouterBase);

/**
 * wikiread tab 主体（v1.5 批 4，spec §4.6）：L3WikiReader 中栏容器（与移动面板 wikiread
 * 标签同一 reader 单源）。rel 同组页跳转 navigate wiki 深链 URL——focus effect 按 slug 开/
 * 激活 wikiread tab（每 slug 一 tab，URL 单一管道；跨 slug 不在组件内改 tab ref）。
 */
function WikireadTabBody({ panelRef }: { panelRef: WikireadPanelRef }) {
  const navigate = useNavigate();
  return (
    <L3WikiReader
      copyLinkInBody={false}
      onOpenPage={(slug) => {
        if (slug === panelRef.slug) return;
        void navigate({
          to: "/projects/$key/wiki/$",
          params: { key: panelRef.projectName, _splat: slug },
        });
      }}
      projectName={panelRef.projectName}
      slug={panelRef.slug}
    />
  );
}

/**
 * render tab 主体：从 workbenchRenderContentAtom 读 id → html，sandbox iframe srcDoc 渲染
 * （对齐 Files 预览 HTML 的 sandbox 语义，sandbox=""：不执行脚本、不发请求——v1.4 批7
 * 随 Files 预览一并收紧）。bg-white：渲染产物通常面向白底。内容瞬态（内存 atom），刷新后
 * atom 清空 + tab 被剔除，空态兜底。
 */
function HtmlRenderPanel({ id }: { id: string }) {
  const { t } = useT();
  const contents = useAtomValue(workbenchRenderContentAtom);
  const html = contents[id];
  if (!html) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-xs text-on-surface-muted">
        {t("workbench.renderTabEmpty")}
      </div>
    );
  }
  return (
    <iframe
      className="h-full w-full border-0 bg-white"
      sandbox=""
      srcDoc={html}
      title={t("workbench.renderTab")}
    />
  );
}

function AgentPanelRouter({ panelRef }: { panelRef: SessionPanelRef }) {
  const { t } = useT();
  const detail = useAgentDetail(panelRef);
  // LoadingBlock 门（§6.12o 批次 2）：detail query 首载显加载指示而非空白（原 return null
  // 是工作台中栏最大空白点）；isPending 语义——有缓存数据后本分支不再可达，后台刷新不闪。
  if (detail.isLoading)
    return <LoadingBlock className="min-h-0 flex-1" label={t("workbench.sessionLoading")} />;
  if (detail.data?.session.provider === "claude") {
    return <ChatPanel projectName={panelRef.projectName} sessionId={panelRef.sessionId} />;
  }
  // ACP transport 类 provider（当前只有 omp）→ AcpPanel。按 transport 判定：加其它 ACP CLI
  // 只需注册表加 profile，此处跟随（当前用显式 provider 名，多 ACP CLI 时改查 profile.transport）。
  if (detail.data?.session.provider === "omp") {
    return <AcpPanel projectName={panelRef.projectName} sessionId={panelRef.sessionId} />;
  }
  if (detail.data?.session) {
    return <AgentTerminalPanel projectName={panelRef.projectName} sessionId={panelRef.sessionId} />;
  }
  return <PlaceholderPanel focusId={panelRef.sessionId} />;
}

function TerminalPanelRouter({ panelRef }: { panelRef: SessionPanelRef }) {
  const { t } = useT();
  const detail = useTerminalDetail(panelRef);
  if (detail.isLoading)
    return <LoadingBlock className="min-h-0 flex-1" label={t("workbench.sessionLoading")} />;
  if (detail.data?.session) {
    return <TerminalPanel projectName={panelRef.projectName} sessionId={panelRef.sessionId} />;
  }
  return <PlaceholderPanel focusId={panelRef.sessionId} />;
}

// ── 详情查询（拆为小 hook，保持 PanelRouter 干净）─────────────────────────────

export function useAgentDetail(panelRef: SessionPanelRef, enabled = true) {
  return useQuery({
    queryKey: ["projects", panelRef.projectName, "agent-sessions", panelRef.sessionId],
    queryFn: () => getAgentSession(panelRef.projectName, panelRef.sessionId),
    enabled,
    retry: false,
    staleTime: 60_000,
  });
}

export function useTerminalDetail(panelRef: SessionPanelRef, enabled = true) {
  return useQuery({
    queryKey: ["projects", panelRef.projectName, "terminal-sessions", panelRef.sessionId],
    queryFn: () => getTerminalSession(panelRef.projectName, panelRef.sessionId),
    enabled,
    retry: false,
    staleTime: 60_000,
  });
}

/**
 * split 面板元数据（设计 §7.2/§7.3/§10/§12）。按 sessionId 前缀推断类型 → 复用
 * useAgentDetail/useTerminalDetail（query key 与 PanelRouter 一致，React Query dedupe 零额外
 * 网络）。返回 SplitPanel header（marker + label + statusDot）与 SplitDock chip
 *（marker + label）共用的元数据；detail 未就绪时返 undefined，调用方 fallback 到 sessionId 前 12 位。
 * 两个 detail hook 都调（hooks 规则），按 sessionType 控制 enabled；projectName 未就绪时双
 * enabled=false 零网络开销。这是 P1#1/#2 + P2#7/#8 的根因修复：SplitLayout 不再只接收
 * WorkbenchPanelRef{projectName,sessionId}，而是从实例 detail 派生 marker/displayName/status。
 */
export type PanelMeta = {
  /** 实例 marker（agent 按 provider，terminal 固定）；与 InstanceCard 同源（设计 §10/§12）。 */
  marker: ReactNode;
  /** 显示名（detail.displayName；detail 未回时从列表缓存预填，见 usePanelMeta）。 */
  label?: string;
  /** 状态点（status → tone + i18n label；running 时 pulse）。detail/缓存均未就绪时 undefined。 */
  statusDot?: { label: string; pulse: boolean; tone: ShellTone };
};

/** tab 显示名兜底链单源（TabChip 与拖拽 DragGhost 同消费——批 C 收敛此前逐字双份）：
 *  meta 未热时按 kind 兜底（session/chat id 前 12 位 / skill name / render 固定文案 /
 *  wikiread slug / 其余 path）。 */
function panelTabLabel(
  panelRef: WorkbenchPanelRef,
  meta: PanelMeta | undefined,
  t: TranslateFn,
): string {
  return (
    meta?.label ??
    (panelRef.kind === "session"
      ? panelRef.sessionId.slice(0, 12)
      : panelRef.kind === "skill"
        ? panelRef.name
        : panelRef.kind === "chat"
          ? panelRef.sessionId.slice(0, 12)
          : panelRef.kind === "render"
            ? t("workbench.renderTab")
            : panelRef.kind === "wikiread"
              ? panelRef.slug
              : panelRef.path)
  );
}

/** 实例行 dot2 状态点 class 单源（实例切换列表与 workbench-side 侧栏 agent 行同消费——
 *  批 C 收敛此前逐字双份）：running 实心，其余 1.4px 空心。 */
export const instanceDot2 = (running: boolean): string =>
  running ? "bg-success" : "border-[1.4px] border-ink-2 bg-transparent";

export function usePanelMeta(panelRef: WorkbenchPanelRef): PanelMeta | undefined {
  const { t } = useT();
  // file/git tab 无 session 详情查询：用空 sessionRef 保 hooks 顺序稳定、enabled=false 不发请求；
  // session tab 时 sessionRef === panelRef，行为零改。file/git 的 marker/label 在 hooks 后早返
  //（不依赖 detail，立即可用），无 statusDot（file/git 无 session 生命周期）。
  const sessionRef: SessionPanelRef =
    panelRef.kind === "session" ? panelRef : { kind: "session", projectName: "", sessionId: "" };
  const sessionType =
    panelRef.kind === "session" ? inferSessionTypeFromId(panelRef.sessionId) : undefined;
  const projReady = panelRef.kind === "session" && !!panelRef.projectName;
  const agent = useAgentDetail(sessionRef, projReady && sessionType === "agent");
  const terminal = useTerminalDetail(sessionRef, projReady && sessionType === "terminal");
  // 列表缓存预填（zero-request）：打开 tab 的入口（左总览/全局总览点卡片）必然来自已拉热的
  // 项目列表 / overview 聚合缓存，响应自带 displayName/provider/status——detail 未回时先从
  // 缓存派生完整 meta（marker + label + statusDot），tab 首帧即显实例名不再闪 sessionId。三个
  // disabled useQuery 同 key 只读缓存不发请求（cache 命中返回 data，miss 返回 undefined）；
  // queryFn 照常提供（disabled 下永不调用，但缺失会让 React Query 每次渲染打 dev 警告）。
  // 非 session tab（file/git/skill）在下方早返，缓存读取只服务 session 分支。
  const agentList = useQuery<ListAgentSessionsResponse>({
    enabled: false,
    queryFn: () => listAgentSessions(sessionRef.projectName),
    queryKey: ["projects", sessionRef.projectName, "agent-sessions"],
  });
  const terminalList = useQuery<ListTerminalSessionsResponse>({
    enabled: false,
    queryFn: () => listTerminalSessions(sessionRef.projectName),
    queryKey: ["projects", sessionRef.projectName, "terminal-sessions"],
  });
  const overviewCache = useQuery<OverviewResponse>({
    enabled: false,
    queryFn: fetchOverview,
    queryKey: ["overview"],
  });
  // chat tab 的 displayName（LLM 标题已写回 registry 元数据）；chat 是 global 会话，无
  // projectName session detail 可查（agent/terminal 的 useAgentDetail/useTerminalDetail 会 404），
  // 单独按 /api/chat-sessions/:id 取。enabled 按 kind==="chat"，非 chat 时 key 固定空 id 零网络。
  const chat = useQuery({
    enabled: panelRef.kind === "chat",
    queryKey: ["chat-sessions", panelRef.kind === "chat" ? panelRef.sessionId : ""],
    queryFn: () => getChatSession(panelRef.kind === "chat" ? panelRef.sessionId : ""),
  });
  // sidecar 实例名记忆（第三层兜底 + 权威写回）：detail/列表缓存全 miss（刷新后 layout 恢复
  // tab、缓存未热）时读 localStorage 记忆显名字（免闪 id）；拿到权威 session 时写回记忆。
  // 读用 useAtomValue（jotai storage atom 同步出 localStorage 初值）；写走下方
  // useInstanceNameMemoWriter（独立 hook，effect 依赖已 flatten）。
  const nameMemo = useAtomValue(instanceNameMemoAtom);
  const sessionMemo = panelRef.kind === "session" ? nameMemo[panelRef.sessionId] : undefined;
  const authoritativeSession =
    panelRef.kind === "session"
      ? ((panelRef.kind === "session" && inferSessionTypeFromId(panelRef.sessionId) === "agent"
          ? agent.data?.session
          : terminal.data?.session) ??
        cachedSessionFromLists(panelRef, agentList, terminalList, overviewCache))
      : undefined;
  useInstanceNameMemoWriter(panelRef, authoritativeSession);
  if (panelRef.kind === "file" || panelRef.kind === "git") {
    // file/git icon marker 对齐 sessionMarker xs 裸 icon 模型（h-4 w-4 + tone 文字色）；
    // label 取 basename（如 src/index.ts → index.ts）。
    return {
      label: panelRef.path.split("/").pop() || panelRef.path,
      marker: (
        <span
          aria-hidden="true"
          className="inline-flex shrink-0 items-center text-on-surface-muted"
        >
          <ShellIcon className="h-4 w-4" name="file" />
        </span>
      ),
    };
  }
  if (panelRef.kind === "skill") {
    // skill tab marker 对齐 file/git（h-4 w-4 裸 icon）；label = skill name（SKILL.md 详情只读预览，
    // 无 session 生命周期，无 statusDot）。
    return {
      label: panelRef.name,
      marker: (
        <span
          aria-hidden="true"
          className="inline-flex shrink-0 items-center text-on-surface-muted"
        >
          <ShellIcon className="h-4 w-4" name="file" />
        </span>
      ),
    };
  }
  if (panelRef.kind === "wikiread") {
    // wikiread tab（v1.5 批 4）：label = slug（usePanelMeta 不发 wiki 查询——页面标题随
    // reader 正文呈现，标签条 slug 可读）；marker = book（v1.5 批 7 spec §6.2「wiki 标签
    // = book」）。
    return {
      label: panelRef.slug,
      marker: (
        <span
          aria-hidden="true"
          className="inline-flex shrink-0 items-center text-on-surface-muted"
        >
          <ShellIcon className="h-4 w-4" name="book" />
        </span>
      ),
    };
  }
  if (panelRef.kind === "chat") {
    // chat 会话 meta：displayName（LLM 标题已写回元数据）+ 聊天气泡 marker；pi chat 无
    // agent/terminal 生命周期，无 statusDot。
    return {
      label: chat.data?.session.displayName || panelRef.sessionId,
      marker: (
        <span
          aria-hidden="true"
          className="inline-flex shrink-0 items-center text-on-surface-muted"
        >
          <ShellIcon className="h-4 w-4" name="chat" />
        </span>
      ),
    };
  }
  if (panelRef.kind === "render") {
    // render tab marker 对齐 file/skill（h-4 w-4 裸 icon）；label = 固定 i18n 文案（内容瞬态
    // 无 identity，无 session 生命周期，无 statusDot）。
    return {
      label: t("workbench.renderTab"),
      marker: (
        <span
          aria-hidden="true"
          className="inline-flex shrink-0 items-center text-on-surface-muted"
        >
          <ShellIcon className="h-4 w-4" name="file" />
        </span>
      ),
    };
  }
  if (sessionType === "agent") {
    // detail（权威）优先 → 列表缓存预填 → sidecar 记忆兜底（刷新后冷启动，只给 label+marker，
    // 无 statusDot——memo 只存稳定身份字段，status 高频变化存了必过期误导）。
    const cached = cachedSessionFromLists(panelRef, agentList, terminalList, overviewCache);
    const session = agent.data?.session ?? cached;
    if (session) {
      return {
        label: session.displayName,
        marker: sessionMarker("agent", "xs"),
        statusDot: {
          label: t(sessionStatusLabel(session.status)),
          pulse: session.status === "running",
          tone: statusToTone(session.status),
        },
      };
    }
    if (sessionMemo && sessionMemo.type === "agent") {
      return {
        label: sessionMemo.name,
        marker: sessionMarker("agent", "xs"),
      };
    }
    return undefined;
  }
  if (sessionType === "terminal") {
    const cached = cachedSessionFromLists(panelRef, agentList, terminalList, overviewCache);
    const session = terminal.data?.session ?? cached;
    if (session) {
      return {
        label: session.displayName,
        marker: sessionMarker("terminal", "xs"),
        statusDot: {
          label: t(sessionStatusLabel(session.status)),
          pulse: session.status === "running",
          tone: statusToTone(session.status),
        },
      };
    }
    if (sessionMemo && sessionMemo.type === "terminal") {
      return { label: sessionMemo.name, marker: sessionMarker("terminal", "xs") };
    }
    return undefined;
  }
  return undefined;
}

/**
 * sidecar 记忆写回：usePanelMeta 拿到权威 session（detail/列表缓存）时按 sessionId 写
 * instanceNameMemoAtom。浅比较防无限循环（effect 依赖 memo 值，值不变不写）。entry 无需
 * GC——改名/关实例后下次权威数据到达即覆盖，或（tab 已关）不再被读取。
 */
export function useInstanceNameMemoWriter(
  panelRef: WorkbenchPanelRef,
  session: { displayName: string } | undefined,
) {
  const setMemo = useSetAtom(instanceNameMemoAtom);
  const sessionId = panelRef.kind === "session" ? panelRef.sessionId : undefined;
  const sessionType = sessionId ? inferSessionTypeFromId(sessionId) : undefined;
  const displayName = session?.displayName;
  useEffect(() => {
    if (!sessionId || !sessionType || !displayName) return;
    setMemo((prev) => {
      const entry = prev[sessionId];
      if (entry && entry.name === displayName && entry.type === sessionType) {
        return prev;
      }
      return { ...prev, [sessionId]: { name: displayName, type: sessionType } };
    });
  }, [sessionId, sessionType, displayName, setMemo]);
}

/**
 * 从已拉热的列表缓存（项目 agent/terminal 列表 + overview 聚合）查 sessionId 对应的
 * displayName/status，供 usePanelMeta 在 detail query 未回时预填（tab 首帧即显
 * 实例名）。三个缓存按序尝试：项目列表（同 project scope 打开 tab 的常态路径）→ overview
 *（跨项目/global 总览点开的 tab）。全部 miss（如刷新后直进聚焦态、缓存尚未拉热）返回
 * undefined，调用方维持原 fallback（sessionId 前 12 位）。
 *
 * 类型注意：overview candidate 与项目列表 session 的 status 字段同名同语义
 *（OverviewCandidate 就是它们的聚合投影），共用同一查找类型。
 */
function cachedSessionFromLists(
  panelRef: SessionPanelRef,
  agentList: { data?: ListAgentSessionsResponse },
  terminalList: { data?: ListTerminalSessionsResponse },
  overviewCache: { data?: OverviewResponse },
):
  | {
      displayName: string;
      status: AgentSession["status"] | TerminalSession["status"];
    }
  | undefined {
  const inProjectList =
    agentList.data?.sessions.find((s) => s.id === panelRef.sessionId) ??
    terminalList.data?.sessions.find((s) => s.id === panelRef.sessionId);
  if (inProjectList) {
    return {
      displayName: inProjectList.displayName,
      status: inProjectList.status,
    };
  }
  const candidate = overviewCache.data?.candidates.find(
    (c) => c.sessionId === panelRef.sessionId && c.projectName === panelRef.projectName,
  );
  if (!candidate) return undefined;
  return {
    displayName: candidate.displayName,
    status: candidate.status,
  };
}

/**
 * ℹ 实例信息字段装配共享（移动端聚焦态 ℹ sheet + 桌面中栏 tab ℹ modal 共用）：agent/terminal
 * 同 hook 同 query key（React Query dedupe 零额外网络），装配单一来源——此前移动端两处逐字重复，
 * detail 字段增删须双改。projectName 非必填：global 聚焦可能 undefined（不 push project 行）；
 * 项目聚焦恒 truthy（无条件 push）。terminal 无 model/permissionMode/createdAt，不伪造占位行。
 * variant 默认 sheet（移动端底部滑出）；桌面 TabChip 传 "modal"（居中卡片）。footer 透传为
 * 03k .acts 操作行 slot（调用方装配样式）。状态行（03k 标题下 success 小字）由 status 字段派生，
 * 不再进 krow fields。
 */
export function useInstanceInfoActions(
  panelRef: SessionPanelRef,
  sessionType: "agent" | "terminal" | null | undefined,
  projectName?: string,
  variant: "sheet" | "modal" = "sheet",
) {
  const { t } = useT();
  const infoSheet = useInstanceInfoSheet();
  // 运行配置选择面（第八轮批次 2b）：model/permission/effort 行 onSelect 打开的下钻字段。
  const [runtimeField, setRuntimeField] = useState<RuntimeConfigField | null>(null);
  const autoRetryEditor = useAutoRetryEditor(panelRef, variant);
  // 会话目录（v1.6 workspace-instance-info）：项目工作目录从项目详情派生，仅 agent 型落行
  //（终端原型仅 项目/类型 两行）。hook 层常开（openInfo 是闭包不能挂 query），未就绪/失败
  // 不落行（不伪造）；跨调用同 queryKey dedupe 零额外网络。
  const project = useQuery({
    queryKey: ["projects", projectName ?? ""],
    queryFn: () => getProject(projectName ?? ""),
    enabled: sessionType === "agent" && !!projectName,
    select: (data) => ({ path: data.project.path, home: data.project.homePath }),
    staleTime: 60_000,
  }).data;
  const agentDetail = useAgentDetail(panelRef, sessionType === "agent");
  const terminalDetail = useTerminalDetail(panelRef, sessionType === "terminal");
  const agentSession = sessionType === "agent" ? agentDetail.data?.session : undefined;
  const terminalSession = sessionType === "terminal" ? terminalDetail.data?.session : undefined;
  const openInfo = () => {
    const fields: InfoField[] = [];
    // 状态行（03k：「● 运行中 · 已 12 分钟」）——时间后缀语义分叉（design review 2026-09-22）：
    // running = 存续时长「已 X」（createdAt 近似运行起点，AgentSession 无 run-start 时间戳，中断
    // 恢复读作自创建总时长，§6.12 记档取舍）；其余状态 = 「X 前」（relativeTime）。
    // TerminalSession 无 createdAt → 后缀空。openInfo 闭包每次打开实时装配 → 随打开时点计算。
    const statusNow = agentSession?.status ?? terminalSession?.status;
    const createdAt = agentSession?.createdAt;
    const ageSuffix = !createdAt
      ? ""
      : statusNow === "running"
        ? formatRanSuffix(createdAt, t)
        : ` · ${relativeTime(createdAt, t)}`;
    const statusLine = statusNow ? `● ${t(sessionStatusLabel(statusNow))}${ageSuffix}` : undefined;
    // 运行配置三设置行（仅 claude；bridge 未挂载不伪装可点——选面打开时 registry 必有 bridge，
    // 但防御性取用）。onSelect 打开 RuntimeConfigDialog（03k 三行 › chevron 的第二层）。
    const runtimeBridge = getClaudeBridge(
      claudeBridgeKey(panelRef.projectName, panelRef.sessionId),
    );
    const isClaude = sessionType === "agent" && agentSession?.provider === "claude";
    const configOnSelect = (field: RuntimeConfigField): { onSelect: () => void } | undefined =>
      isClaude && runtimeBridge ? { onSelect: () => setRuntimeField(field) } : undefined;
    // 会话名在浮层标题位单点展示（第八轮批次 2a，对齐 03k:61 h2=会话名），不再进 fields。
    const displayName = agentSession?.displayName ?? terminalSession?.displayName;
    if (projectName) {
      fields.push({ label: t("session.instanceInfo.project"), value: projectName });
    }
    if (sessionType === "agent" && agentSession) {
      fields.push({
        label: t("session.instanceInfo.type"),
        value: providerDisplayName(agentSession.provider),
      });
      if (agentSession.model) {
        fields.push({
          label: t("session.instanceInfo.model"),
          value: agentSession.model,
          ...configOnSelect("model"),
        });
      }
      if (agentSession.permissionMode) {
        fields.push({
          label: t("session.instanceInfo.permission"),
          value: agentSession.permissionMode,
          ...configOnSelect("permission"),
        });
      }
      if (agentSession.provider === "claude") {
        fields.push({
          label: t("session.instanceInfo.effort"),
          value: agentSession.effort ?? "high",
          ...configOnSelect("effort"),
        });
      }
      // 自动重试（claude 专用）：行内开关 + 编辑按钮（2026-09-09 用户反馈：原纯文本行
      // 改操作面直出——开关即切即存，编辑进参数面板）。组件自订阅 query，
      // 快照 fields 不影响其响应数据变化。v1.6 原型行序 = effort 之后、创建时间之前。
      if (agentSession.provider === "claude") {
        fields.push({
          label: t("session.autoRetry.label"),
          value: "",
          action: (
            <AutoRetrySheetAction
              onEdit={autoRetryEditor.openEditor}
              projectName={panelRef.projectName}
              sessionId={panelRef.sessionId}
            />
          ),
        });
      }
      if (agentSession.createdAt) {
        fields.push({
          label: t("session.instanceInfo.createdAt"),
          value: formatCreatedAt(agentSession.createdAt),
        });
      }
      // resume id（claudeSessionId，CLI --resume 用）——用户核对/手动恢复用，完整展示不 truncate
      //（mono 对齐 03k .v.mono 的 ID 类值形态）。
      if (agentSession.claudeSessionId) {
        fields.push({
          label: t("session.instanceInfo.resumeId"),
          value: agentSession.claudeSessionId,
          mono: true,
          wrap: true,
        });
      }
      // 会话目录（v1.6 workspace-instance-info：恢复 ID 之后、累计之前；累计本批不落——
      // AgentSession 无跨回合累计数据源，记 diverge）：项目工作目录前端派生 + $HOME→~ 缩写
      //（homePath = API os.homedir() 同源，前端不硬编码 /home），mono 换行展示。
      if (project) {
        fields.push({
          label: t("session.instanceInfo.sessionDir"),
          value: shortenHomePath(project.path, project.home),
          mono: true,
          wrap: true,
        });
      }
    } else if (sessionType === "terminal" && terminalSession) {
      fields.push({
        label: t("session.instanceInfo.type"),
        value: t("session.instanceInfo.terminal"),
      });
    }
    // claude 的编辑入口已并入自动重试行内（编辑按钮）；terminal/其他 provider 纯展示。
    infoSheet.open(displayName ?? t("session.instanceInfo.title"), fields, variant, statusLine);
  };
  const runtimeDialogHolder =
    runtimeField !== null && (panelRef.kind === "session" ? panelRef : null) ? (
      <RuntimeConfigDialog
        field={runtimeField}
        onOpenChange={(open) => {
          if (!open) setRuntimeField(null);
        }}
        projectName={panelRef.projectName}
        sessionId={panelRef.sessionId}
        variant={variant}
      />
    ) : null;
  return {
    openInfo,
    holder: infoSheet.holder,
    autoRetryEditorHolder: autoRetryEditor.holder,
    runtimeDialogHolder,
  };
}

/** 状态行运行时长（03k「· 已 12 分钟」）：agent 有 createdAt（近似运行起点），terminal 无 → 空串。 */
function formatRanSuffix(iso: string, t: TranslateFn): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const mins = Math.max(1, Math.floor(ms / 60000));
  if (mins < 60) return ` · ${t("time.ranMinutes", { count: mins })}`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return ` · ${t("time.ranHours", { count: hours })}`;
  return ` · ${t("time.ranDays", { count: Math.floor(hours / 24) })}`;
}

/**
 * $HOME→~ 缩写（v1.6 workspace-instance-info「会话目录」行，原型 `~/srv/agents-web`）：
 * home 由 API 提供（os.homedir() 同源，前端不硬编码 /home）；非 home 前缀路径原样展示。
 */
export function shortenHomePath(path: string, home?: string): string {
  if (!home) return path;
  return path === home || path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
}

/**
 * 自动重试配置编辑流程（claude agent 专用，2026-09-07）：info sheet「编辑」入口 →
 * 编辑面板预填当前 autoRetry config（缺省 = 默认关 + i18n 默认文案）。v1.6（2026-10-09）
 * 控件化重构：原型 workspace-retry-config 无保存/取消按钮 → **即点即存**——控件改动
 * 即时 commit（服务端为真相，成功后 invalidate detail/list）；失败显式提示且面板保持
 * 打开（否则失败看起来像成功）。多端同构（frontend.md 铁律）：控件层 AutoRetryEditorControls
 * 单份实现，容器分流——移动 = 半屏 sheet（MobileSheet）、桌面 = 居中 Dialog 卡片。
 */
function useAutoRetryEditor(panelRef: SessionPanelRef, variant: "sheet" | "modal") {
  const { t } = useT();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<ClaudeAutoRetryConfig | null>(null);
  const [saveError, setSaveError] = useState(false);

  const openEditor = () => {
    const session = queryClient.getQueryData<{ session: AgentSession }>([
      "projects",
      panelRef.projectName,
      "agent-sessions",
      panelRef.sessionId,
    ])?.session;
    // 无配置 = 默认关 + 按 UI 语言预填默认文案（服务端存具体字符串不做 i18n）。
    setConfig(
      session?.autoRetry ?? {
        ...AUTO_RETRY_DEFAULT,
        enabled: false,
        message: t("session.autoRetry.defaultMessage"),
      },
    );
    setSaveError(false);
    setOpen(true);
  };

  // 即点即存：本地先落地（连点 stepper 立即反馈），异步提交；失败保持打开 + 显式错误。
  // 并发 PUT 串行化（code review v6.4）：stepper 连点/档位切换/文案防抖 flush 会在毫秒级
  // 并发多条全量写，HTTP 乱序完成时服务端 last-arrival-wins 停在旧值，invalidate 再把旧值
  // 拉回 UI（静默分歧直到重开面板）。单飞链保证到达序 = 调用序，前序失败不阻塞后续。
  const commitQueueRef = useRef<Promise<void>>(Promise.resolve());
  const commit = useCallback(
    (next: ClaudeAutoRetryConfig) => {
      setConfig(next);
      commitQueueRef.current = commitQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          try {
            await updateAutoRetryConfig(panelRef.projectName, panelRef.sessionId, next);
          } catch {
            setSaveError(true);
            return;
          }
          setSaveError(false);
          await Promise.all([
            queryClient.invalidateQueries({
              exact: true,
              queryKey: ["projects", panelRef.projectName, "agent-sessions", panelRef.sessionId],
            }),
            queryClient.invalidateQueries({
              queryKey: ["projects", panelRef.projectName, "agent-sessions"],
            }),
          ]);
        });
    },
    [panelRef.projectName, panelRef.sessionId, queryClient],
  );

  const holder =
    open && config ? (
      variant === "sheet" ? (
        <AutoRetryEditorSheet
          config={config}
          onClose={() => setOpen(false)}
          onCommit={commit}
          saveError={saveError}
        />
      ) : (
        <AutoRetryEditorDialog
          config={config}
          onClose={() => setOpen(false)}
          onCommit={commit}
          saveError={saveError}
        />
      )
    ) : null;

  return { openEditor, holder };
}

/**
 * 自动重试开关共享逻辑（会话头部按钮 + info sheet 行内操作面共用）：enabled 从 detail
 * query select 派生（primitive，同 queryKey dedupe 零额外网络）；toggle 读缓存当前 config
 * 只切 enabled（无 config 时按 UI 语言预填默认文案），成功 invalidate detail。
 */
export function useAutoRetryToggle(
  projectName: string,
  sessionId: string,
  /** 调用方会话类型 gate（默认放行）：auto retry 是 agent 专用配置，terminal 会话 /
   * skill tab 聚焦等非 agent 语境传 false 免发注定 404 的 detail 请求（code review v6.3）。 */
  sessionType: "agent" | "terminal" | null | undefined = "agent",
) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const detailKey = ["projects", projectName, "agent-sessions", sessionId] as const;
  const enabled = useQuery({
    queryKey: detailKey,
    queryFn: () => getAgentSession(projectName, sessionId),
    retry: false,
    staleTime: 60_000,
    // 空 sessionId（移动 ⋯ 菜单等组件顶层无条件调用的场景，非会话聚焦时）与非 agent
    // 会话类型不发起请求。
    enabled: sessionId !== "" && sessionType === "agent",
    select: (data) => data.session.autoRetry?.enabled === true,
  }).data;
  const toggle = useMutation({
    mutationFn: (next: boolean) => {
      const session = queryClient.getQueryData<{ session: AgentSession }>(detailKey)?.session;
      // 关闭态无 config 时启用 → 预填默认文案；已有 config 保持其余字段只切 enabled。
      const config: ClaudeAutoRetryConfig = session?.autoRetry
        ? { ...session.autoRetry, enabled: next }
        : {
            ...AUTO_RETRY_DEFAULT,
            enabled: next,
            message: t("session.autoRetry.defaultMessage"),
          };
      return updateAutoRetryConfig(projectName, sessionId, config);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ exact: true, queryKey: detailKey });
    },
  });
  return { enabled, toggle };
}

/**
 * 会话头部 icon-only 自动重试开关（高频操作前置，2026-09-09：用户反馈 ℹ sheet 路径太深、
 * 面板操作麻烦）。rotate 图标 = 重试语义；enabled 常显高亮 primary（用户主动开启的功能
 * 要一直可见），off 态样式同 ℹ✕（非 active hover 才显）。点击即切即存，pending 置灰。
 * 仅 claude agent session 渲染（provider 未加载前不渲染，避免闪现）。
 */
export function AutoRetryHeaderButton({
  projectName,
  sessionId,
}: {
  projectName: string;
  sessionId: string;
  /**
   * 移动聚焦 header 胶囊按钮（h-8）。v1.5 批 8 真机复验反馈①：桌面 TabChip 的 "tab"
   * 形态撤除（tab 宽度挤占），仅存胶囊消费。
   */
}) {
  const { t } = useT();
  const { enabled, toggle } = useAutoRetryToggle(projectName, sessionId);
  const session = useAgentDetail({ kind: "session", projectName, sessionId }).data?.session;
  if (session?.provider !== "claude") return null;
  const on = enabled === true;
  const className = `flex h-8 w-8 items-center justify-center rounded-md transition hover:bg-on-surface/5 active:bg-on-surface/10 ${
    on ? "text-primary" : "text-on-surface-soft hover:text-on-surface"
  }`;
  return (
    <button
      aria-checked={on}
      aria-label={t("session.autoRetry.label")}
      className={`${className} disabled:cursor-default disabled:opacity-60`}
      disabled={toggle.isPending}
      onClick={() => toggle.mutate(!on)}
      role="switch"
      title={t("session.autoRetry.label")}
      type="button"
    >
      <ShellIcon className="h-3.5 w-3.5" name="rotate" />
    </button>
  );
}

/**
 * info sheet 行内操作面（开关 + 编辑按钮）。独立组件而非 openInfo 时构建的静态 JSX：
 * sheet 的 fields 是打开时刻的快照，静态 JSX 捕获旧闭包——点击开关后 sheet 内开关不会
 * 响应数据变化。经 useAutoRetryToggle 自订阅 detail query，mutation 成功 invalidate 后
 * 开关实时反映最新 enabled，失败 UI 自动回到服务端真值。
 */
function AutoRetrySheetAction({
  projectName,
  sessionId,
  onEdit,
}: {
  projectName: string;
  sessionId: string;
  onEdit: () => void;
}) {
  const { t } = useT();
  const { enabled, toggle } = useAutoRetryToggle(projectName, sessionId);
  const on = enabled === true;
  return (
    <span className="flex items-center gap-2">
      <button
        aria-checked={on}
        aria-label={t("session.autoRetry.label")}
        className="flex cursor-pointer items-center disabled:cursor-default disabled:opacity-60"
        disabled={toggle.isPending}
        onClick={() => toggle.mutate(!on)}
        role="switch"
        type="button"
      >
        <span className={toggleSwitchTrackClasses(on)}>
          <span
            className={`${toggleSwitchKnobClasses} ${on ? "translate-x-[1.375rem]" : "translate-x-0.5"}`}
          />
        </span>
      </button>
      {/* 「编辑」小钮 = 原型 .ebtn 描边式（11px/700/primary + 主色 55% 描边 r7 透明底；
        rounded-sm 8px ≈ 原型 7px，取语义档）。 */}
      <button
        className="cursor-pointer rounded-sm border border-primary/55 px-[9px] py-[3px] text-[11px] font-bold text-primary transition active:bg-primary/10"
        onClick={onEdit}
        type="button"
      >
        {t("session.autoRetry.editShort")}
      </button>
    </span>
  );
}

/** krow 行样式（原型 retry-config：13px、上下 11px padding、行间 sep-row 线由行 2+ 自带 border-t）。 */
const RETRY_ROW_CLASSES = "flex items-center py-[11px] text-[13px]";

/** 文案输入防抖窗口：停顿即存，卸载再 flush 兜底（关面板不丢最后一次输入）。 */
const MESSAGE_SAVE_DEBOUNCE_MS = 800;

/**
 * 控件层（v1.6 workspace-retry-config，多端同构单源）：自动重试 toggle 行 / 次数上限
 * stepper / 重试间隔档位选择器（ActionMenu 点开选档，当前档 ✓）/ 重发文案内联输入 +
 * kfoot 脚注。移动 sheet 与桌面 Dialog 两容器共享本层（frontend.md 多端同构铁律）。
 *
 * 保存时机 = 即点即存（原型无保存/取消按钮）：toggle/stepper/档位即点即 commit；文案输入
 * 防抖停顿即存、卸载 flush 兜底。保存失败显式提示 + 面板保持打开。
 */
function AutoRetryEditorControls({
  config,
  onCommit,
  saveError,
}: {
  config: ClaudeAutoRetryConfig;
  onCommit: (config: ClaudeAutoRetryConfig) => void;
  saveError: boolean;
}) {
  const { t } = useT();
  // 文案防抖回调/卸载 flush 需要最新 config（timer 闭包捕获旧值）→ latest ref 模式。
  const configRef = useRef(config);
  configRef.current = config;
  const [messageDraft, setMessageDraft] = useState(config.message);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingMessageRef = useRef<string | null>(null);
  const flushPendingMessage = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const pending = pendingMessageRef.current;
    if (pending !== null) {
      pendingMessageRef.current = null;
      onCommit({ ...configRef.current, message: pending });
    }
  }, [onCommit]);
  // 卸载（关面板）flush 最后一次输入；onCommit 目标（hook 层）不随本组件卸载，合法。
  useEffect(() => () => flushPendingMessage(), [flushPendingMessage]);

  const changeMessage = (value: string) => {
    setMessageDraft(value);
    pendingMessageRef.current = value;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(flushPendingMessage, MESSAGE_SAVE_DEBOUNCE_MS);
  };

  // 开关打开时文案为空 → 预填默认（首次启用即有合理值；关闭不改文案）。
  const toggleEnabled = (enabled: boolean) => {
    const message =
      enabled && !messageDraft.trim() ? t("session.autoRetry.defaultMessage") : messageDraft;
    if (message !== messageDraft) setMessageDraft(message);
    onCommit({ ...config, enabled, message });
  };

  return (
    <div>
      {/* 行1 自动重试开关（原型 krow + toggle）。 */}
      <div className={RETRY_ROW_CLASSES}>
        <span className="text-on-surface-soft">{t("session.autoRetry.enable")}</span>
        <button
          aria-checked={config.enabled}
          aria-label={t("session.autoRetry.enable")}
          className="ml-auto flex cursor-pointer items-center"
          onClick={() => toggleEnabled(!config.enabled)}
          role="switch"
          type="button"
        >
          <span className={toggleSwitchTrackClasses(config.enabled)}>
            <span
              className={`${toggleSwitchKnobClasses} ${config.enabled ? "translate-x-[1.375rem]" : "translate-x-0.5"}`}
            />
          </span>
        </button>
      </div>
      {/* 参数三行（enabled 时才可编辑；关闭态置灰保留值）。 */}
      <div className={config.enabled ? "" : "pointer-events-none opacity-50"}>
        {/* 行2 次数上限 stepper（原型 .stp：−/＋ 15px 700 primary，值居中 min-w 52）。 */}
        <div className={`${RETRY_ROW_CLASSES} border-t border-sep-row`}>
          <span className="text-on-surface-soft">{t("session.autoRetry.maxLabel")}</span>
          <span className="ml-auto inline-flex items-center overflow-hidden rounded-lg border border-sep-strong">
            <button
              aria-label={t("session.autoRetry.decreaseMax")}
              className="cursor-pointer px-[11px] py-1 text-[15px] font-bold text-primary transition active:bg-primary/10 disabled:cursor-default disabled:opacity-30"
              disabled={config.maxPerWindow <= RETRY_MAX_PER_WINDOW_MIN}
              onClick={() =>
                onCommit({
                  ...config,
                  maxPerWindow: stepRetryCount(config.maxPerWindow, -1),
                })
              }
              type="button"
            >
              −
            </button>
            {/* 值格分隔线 = 原型 .stp b 的 var(--sep)（重一档，v1.6 design review）。 */}
            <span className="min-w-[52px] border-x border-sep px-2.5 py-1 text-center text-[12.5px] text-on-surface">
              {t("session.autoRetry.times", { count: config.maxPerWindow })}
            </span>
            <button
              aria-label={t("session.autoRetry.increaseMax")}
              className="cursor-pointer px-[11px] py-1 text-[15px] font-bold text-primary transition active:bg-primary/10 disabled:cursor-default disabled:opacity-30"
              disabled={config.maxPerWindow >= RETRY_MAX_PER_WINDOW_MAX}
              onClick={() =>
                onCommit({
                  ...config,
                  maxPerWindow: stepRetryCount(config.maxPerWindow, 1),
                })
              }
              type="button"
            >
              ＋
            </button>
          </span>
        </div>
        {/* 行3 重试间隔（原型 .fld 输入框式选择器，点开选档；当前档 ✓）。 */}
        <div className={`${RETRY_ROW_CLASSES} border-t border-sep-row`}>
          <span className="text-on-surface-soft">{t("session.autoRetry.delayLabel")}</span>
          <ActionMenu
            align="end"
            items={RETRY_DELAY_STEPS_MS.map((ms) => ({
              label: formatRetryDelay(ms),
              onSelect: () => onCommit({ ...config, delayMs: ms }),
              trailing:
                config.delayMs === ms ? (
                  <span className="text-[13px] font-bold text-primary">✓</span>
                ) : null,
            }))}
            trigger={
              <button
                aria-label={t("session.autoRetry.delayLabel")}
                className="ml-auto inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-sep-strong bg-surface-inset px-2.5 py-[5px] text-[12.5px] text-on-surface"
                type="button"
              >
                {formatRetryDelay(config.delayMs)} · {t("session.autoRetry.backoff")}
                <span className="text-[11px] text-on-surface-muted">›</span>
              </button>
            }
          />
        </div>
        {/* 行4 重发文案（原型 .fld 内联输入；原生 caret 替代静态 .crt 光标暗示）。 */}
        <div className={`${RETRY_ROW_CLASSES} border-t border-sep-row`}>
          <span className="text-on-surface-soft">{t("session.autoRetry.messageLabel")}</span>
          <span className="ml-auto inline-flex items-center rounded-lg border border-sep-strong bg-surface-inset px-2.5 py-[5px]">
            <input
              aria-label={t("session.autoRetry.messageLabel")}
              className="w-40 bg-transparent text-[12.5px] text-on-surface placeholder:text-on-surface-muted focus:outline-none"
              onChange={(e) => changeMessage(e.target.value)}
              placeholder={t("session.autoRetry.defaultMessage")}
              type="text"
              value={messageDraft}
            />
          </span>
        </div>
      </div>
      {/* kfoot 脚注（原型 11px ink-2，上缘 sep-row 线）；保存失败行置其上。 */}
      <div className="mt-0.5 border-t border-sep-row pt-2 text-[11px] text-on-surface-soft">
        {saveError ? (
          <p className="pb-1 font-medium text-error" role="alert">
            {t("session.autoRetry.saveFailed")}
          </p>
        ) : null}
        {t("session.autoRetry.description")}
      </div>
    </div>
  );
}

/** 移动容器：半屏 sheet（原型 sheet 形态——grab + shd 标题 + 副题 + 控件区）。 */
function AutoRetryEditorSheet({
  config,
  onClose,
  onCommit,
  saveError,
}: {
  config: ClaudeAutoRetryConfig;
  onClose: () => void;
  onCommit: (config: ClaudeAutoRetryConfig) => void;
  saveError: boolean;
}) {
  const { t } = useT();
  return (
    <MobileSheet
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      open
      title={t("session.autoRetry.label")}
    >
      <p className="mt-0.5 text-xs font-semibold text-on-surface-soft">
        {t("session.autoRetry.scopeSubtitle")}
      </p>
      <div className="mt-2.5 border-t border-sep-row" />
      <AutoRetryEditorControls config={config} onCommit={onCommit} saveError={saveError} />
    </MobileSheet>
  );
}

/** 桌面容器：居中 Dialog 卡片（同副题 + 控件区；多端同构只是容器不同）。 */
function AutoRetryEditorDialog({
  config,
  onClose,
  onCommit,
  saveError,
}: {
  config: ClaudeAutoRetryConfig;
  onClose: () => void;
  onCommit: (config: ClaudeAutoRetryConfig) => void;
  saveError: boolean;
}) {
  const { t } = useT();
  return (
    <Dialog defaultOpen onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <div
          className={`rounded-2xl p-5 shadow-2xl shadow-black/40 ${shellSurfaceClasses.workspace}`}
        >
          <h2 className="text-base font-semibold text-on-surface">
            {t("session.autoRetry.label")}
          </h2>
          <p className="mt-0.5 text-xs font-semibold text-on-surface-soft">
            {t("session.autoRetry.scopeSubtitle")}
          </p>
          <div className="mt-2.5 border-t border-sep-row" />
          <AutoRetryEditorControls config={config} onCommit={onCommit} saveError={saveError} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Agent provider 全名（claude → "Claude"——二代实现已取代一代，对外统一正式名；未知值原样回退，不崩溃）。品牌名中英一致，不走 i18n。 */
function providerDisplayName(provider: string | undefined): string {
  if (!provider) return "—";
  if (provider === "claude") return "Claude";
  if (provider === "codex") return "Codex";
  if (provider === "omp") return "omp";
  return provider;
}

/** createdAt ISO → 本地可读格式（toLocaleString 跟随浏览器 locale，与 navigator.language 检测一致）。 */
function formatCreatedAt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

/**
 * 乐观移除被关闭的 session：从 list（agent/terminal-sessions）+ overview 当场 filter 掉，
 * 让卡片/候选立即消失，不等 refetch。server closeMetadata 同步 index.delete 保证下次 list
 * 不含该 session，refetch 校准与乐观一致，无回滚风险。removeQueries detail 由调用方单独处理。
 *
 * 只覆盖两个真正有 useQuery 缓存的 key：["projects", name, "${type}-sessions"]（.sessions）
 * 与 ["overview"]（.candidates，标识 = projectName+type+sessionId）。["projects", name]
 * 自 v1.6 起有缓存（useInstanceInfoActions 的会话目录 query 占用该 key，存项目详情
 * path/homePath）——关会话不影响项目详情，无需清理。
 */
export function optimisticallyRemoveSession(
  queryClient: QueryClient,
  projectName: string,
  type: "agent" | "terminal",
  sessionId: string,
) {
  const listKey = ["projects", projectName, `${type}-sessions`];
  queryClient.setQueryData<{ sessions: { id: string }[] }>(listKey, (data) =>
    data ? { sessions: data.sessions.filter((s) => s.id !== sessionId) } : data,
  );
  queryClient.setQueryData<OverviewResponse>(["overview"], (data) =>
    data
      ? {
          projectNames: data.projectNames,
          candidates: data.candidates.filter(
            (c) => !(c.projectName === projectName && c.type === type && c.sessionId === sessionId),
          ),
        }
      : data,
  );
}

/**
 * 会话 close 统一流程（confirm → 按 type 调 close API → 精确失效缓存）。三处 close
 *（左总览卡片 ProjectInstances / 移动全局 MobileGlobalOverview / 历史列表）复用此 hook，
 * cache 策略统一：removeQueries detail + exact invalidate（["projects"] / [name] /
 * [name, type-sessions]），不波及 files/git。`onAfterClose` 留给调用方追加副作用。tab ✕
 *（最小化）不走此 hook —— 走 removeTabFromGroup（session 存活，不 close）。返回 true=已关闭，
 * false=用户取消。
 */
export function useCloseSession() {
  const { t } = useT();
  const { confirm, holder } = useConfirm();
  const queryClient = useQueryClient();
  const close = async (
    ref: SessionPanelRef,
    type: "agent" | "terminal",
    onAfterClose?: () => void,
  ): Promise<boolean> => {
    const ok = await confirm({
      cancelLabel: t("cancel"),
      confirmLabel: t("session.close"),
      message: t("session.closeConfirm"),
      title: t("session.close"),
      tone: "danger",
    });
    if (!ok) return false;
    try {
      if (type === "agent") {
        await closeAgentSession(ref.projectName, ref.sessionId);
      } else {
        await closeTerminalSession(ref.projectName, ref.sessionId);
      }
    } catch {
      // 会话已结束 / 不存在（404）—— close 幂等，仍失效缓存让卡片/面板消失。
    }
    queryClient.removeQueries({
      exact: true,
      queryKey: ["projects", ref.projectName, `${type}-sessions`, ref.sessionId],
    });
    // 乐观移除：卡片立即从 list + overview 消失，不等 refetch。
    optimisticallyRemoveSession(queryClient, ref.projectName, type, ref.sessionId);
    onAfterClose?.();
    // invalidate 后台 fire-and-forget：server index.delete 已保证 list 一致，无回滚。
    void Promise.all([
      queryClient.invalidateQueries({ exact: true, queryKey: ["projects"] }),
      queryClient.invalidateQueries({ exact: true, queryKey: ["projects", ref.projectName] }),
      queryClient.invalidateQueries({
        exact: true,
        queryKey: ["projects", ref.projectName, `${type}-sessions`],
      }),
      queryClient.invalidateQueries({ queryKey: ["overview"] }),
    ]);
    return true;
  };
  return { close, holder };
}

/**
 * 创建实例统一流程（2c-2 提取，供中栏 InstanceArea tab bar / 空态 EmptyInstanceArea /
 * 左栏 ProjectInstances card 三处复用）。prompt → 按 type 调 create API → invalidate
 * agent/terminal-sessions + navigate 聚焦新 session。与 useCloseSession 同文件同模式
 *（业务 hook 集合）。`projectName === null`（global scope）短路返回 noop + null holder，
 * 避免 global 误创建。promptHolder 由调用方渲染（与 useCloseSession.holder 并列）。
 */
export type CreateSessionApi = {
  createAgent: (provider: AgentProvider) => void;
  createTerminal: () => void;
  isCreating: boolean;
};

export function useCreateSession(projectName: string | null): CreateSessionApi & {
  promptHolder: ReactNode;
} {
  const { t } = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { holder: promptHolder, prompt } = usePromptDialog();
  const safeName = projectName ?? "";

  const invalidateSessions = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["projects", safeName, "agent-sessions"] }),
      queryClient.invalidateQueries({ queryKey: ["projects", safeName, "terminal-sessions"] }),
      queryClient.invalidateQueries({ queryKey: ["overview"] }),
    ]);
  };

  const createAgent = useMutation({
    mutationFn: ({ displayName, provider }: { displayName: string; provider: AgentProvider }) =>
      createAgentSession(safeName, provider, { displayName: displayName || undefined }),
    onSuccess: async (data) => {
      // navigate 优先：detail route 用 sessionId 直查 per-session detail query，不依赖列表。
      // invalidate 后台 fire-and-forget 刷新实例列表（返回 project 时见新 session）。
      await navigate({
        to: "/projects/$key/session/$id",
        params: { key: safeName, id: data.session.id },
      });
      void invalidateSessions();
    },
  });
  const createTerminal = useMutation({
    mutationFn: (displayName: string) => createTerminalSession(safeName, displayName || undefined),
    onSuccess: async (data) => {
      // navigate 优先：detail route 用 sessionId 直查 per-session detail query，不依赖列表。
      // invalidate 后台 fire-and-forget 刷新实例列表（返回 project 时见新 session）。
      await navigate({
        to: "/projects/$key/session/$id",
        params: { key: safeName, id: data.session.id },
      });
      void invalidateSessions();
    },
  });

  const createAgentPrompt = (provider: AgentProvider) => {
    void prompt({
      cancelLabel: t("cancel"),
      confirmLabel: t("session.namePrompt.confirm"),
      placeholder: t("session.namePrompt.placeholder"),
      title: t("session.namePrompt.createAgent"),
    }).then((name) => {
      if (name !== null) createAgent.mutate({ displayName: name, provider });
    });
  };

  const createTerminalPrompt = () => {
    void prompt({
      cancelLabel: t("cancel"),
      confirmLabel: t("session.namePrompt.confirm"),
      placeholder: t("session.namePrompt.placeholder"),
      title: t("session.namePrompt.createTerminal"),
    }).then((name) => {
      if (name !== null) createTerminal.mutate(name);
    });
  };

  if (projectName === null) {
    return {
      createAgent: () => {},
      createTerminal: () => {},
      isCreating: false,
      promptHolder: null,
    };
  }
  return {
    createAgent: createAgentPrompt,
    createTerminal: createTerminalPrompt,
    isCreating: createAgent.isPending || createTerminal.isPending,
    promptHolder,
  };
}

type CreateSessionBarProps = {
  isCreating: boolean;
  onCreateAgent: (provider: AgentProvider) => void;
  onCreateTerminal: () => void;
};

/**
 * 创建实例菜单 items 单源（§6.12j）：CreateSessionBar 与 GroupHeader tabstrip「＋」共用同一
 * 菜单数据源（Claude/OMP/终端三行）。presentational——分派走 CreateSessionApi。
 */
export function createSessionMenuItems(create: CreateSessionApi, t: TranslateFn): ActionMenuItem[] {
  return [
    {
      label: t("workbench.createClaude"),
      icon: <ShellIcon name="anthropic" />,
      onSelect: () => create.createAgent("claude"),
    },
    {
      label: t("workbench.createOmp"),
      icon: <ShellIcon name="agent-nav" />,
      onSelect: () => create.createAgent("omp"),
    },
    {
      label: t("workbench.createTerminal"),
      icon: <ShellIcon name="terminal" />,
      onSelect: create.createTerminal,
    },
  ];
}

/**
 * 创建实例 dropdown（Claude/Codex/Terminal，2c-2 从 left-rail LeftRailCreateBar 改名迁此
 * export）。presentational——消费 useCreateSession 的 createAgent/createTerminal/isCreating。
 * 唯一调用点 EmptyInstanceArea（inline）。⚠️ ⌘N 受控开合（workbenchCreateMenuOpenAtom）
 * 挂 side 组头菜单（workbench-side.tsx 走 createSessionMenuItems 单源），不经本组件。
 */
export function CreateSessionBar({
  isCreating,
  onCreateAgent,
  onCreateTerminal,
}: CreateSessionBarProps) {
  const { t } = useT();
  return (
    <ActionMenu
      align="end"
      cancelLabel={t("cancel")}
      items={createSessionMenuItems(
        { createAgent: onCreateAgent, createTerminal: onCreateTerminal, isCreating },
        t,
      )}
      trigger={
        <button
          className={actionButtonClasses({
            className: "group disabled:cursor-not-allowed disabled:opacity-50",
            compact: true,
            tone: "accent",
          })}
          disabled={isCreating}
          type="button"
        >
          {isCreating ? t("project.creating") : t("workbench.createMenu")}
          <svg
            aria-hidden="true"
            className="h-3 w-3 transition group-data-[state=open]:rotate-180"
            fill="none"
            viewBox="0 0 16 16"
          >
            <path
              d="M4 6l4 4 4-4"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
            />
          </svg>
        </button>
      }
    />
  );
}

/**
 * 项目聚合行单源（桌面 side 项目行 running 计数 + 移动项目页 projectRows 双写收敛）：
 * 按项目分组（单遍 Map）+ 最近实例（updatedAt ?? createdAt 最大）+ running 数；query 给移动
 * 搜索（项目名过滤），省略 = 不过滤（桌面 side 语境）。纯函数，调用方自行 useMemo。
 */
export type ProjectOverviewRow = {
  instances: GlobalInstanceCandidate[];
  /** 最近活跃实例（组内空 = null）。 */
  latest: GlobalInstanceCandidate | null;
  name: string;
  running: number;
};

export function buildProjectRows(
  candidates: GlobalInstanceCandidate[],
  projectNames: string[],
  query?: string,
): ProjectOverviewRow[] {
  const q = query?.trim().toLowerCase();
  const byProject = new Map<string, GlobalInstanceCandidate[]>();
  for (const c of candidates) {
    const list = byProject.get(c.ref.projectName);
    if (list) list.push(c);
    else byProject.set(c.ref.projectName, [c]);
  }
  return projectNames
    .filter((name) => !q || name.toLowerCase().includes(q))
    .map((name) => {
      const instances = byProject.get(name) ?? [];
      let latest: GlobalInstanceCandidate | null = null;
      let latestAt = "";
      let running = 0;
      for (const c of instances) {
        const at = c.updatedAt ?? c.createdAt ?? "";
        if (latest === null || at > latestAt) {
          latest = c;
          latestAt = at;
        }
        if (c.status === "running") running += 1;
      }
      return { instances, latest, name, running };
    });
}

/**
 * 全局实例区候选聚合。仅在 global 作用域发**单个** `/api/overview` 请求（后端聚合全 project 名 +
 * 全活跃实例候选），替代旧 1+2N 瀑布（listProjects → 每项目 listAgent/listTerminal）。扁平化成
 * 带状态/类型的候选列表，供 rankGlobalInstances 排序后铺开。非 global 返回空。
 *
 * 返回 `{ candidates, projectNames, isLoaded }`：`projectNames` 给 grouped 视图含空 project；
 * `isLoaded` 是 success-only（overview.data 就绪）；首次加载中 / 请求失败均 false。自动铺开 effect
 * 用它守卫，避免在 candidates 未回时铺开并锁 seededRef；失败时显示骨架而非空态，避免清光 tab。
 */
export function useGlobalInstanceCandidates(scope: WorkbenchScope): {
  candidates: GlobalInstanceCandidate[];
  projectNames: string[];
  isLoaded: boolean;
} {
  const isGlobal = scope.kind === "global";
  const overview = useQuery({
    queryKey: ["overview"],
    queryFn: fetchOverview,
    enabled: isGlobal,
    staleTime: 5_000,
    // 端点毫秒级（内存索引+批量探活），10s 轮询让停留页时活动时间戳/置顶/排序跟随刷新——
    // 服务端 recordActivity 本就分钟级截断 touch updatedAt（同分钟短路不写盘），轮询不放大写盘。
    //（M10 用户反馈②「1 小时前但其实在跑」）。
    refetchInterval: 10_000,
  });
  // overview 第二阶段：subtitle（terminal lastCommand）走独立端点慢填充，不 gate isLoaded——
  // 核心卡片先渲染（overview.data 就绪即 isLoaded），subtitle 到达后 patch 进第二行（缺则不显）。
  const subtitles = useQuery({
    queryKey: ["overview", "subtitles"],
    queryFn: fetchOverviewSubtitles,
    enabled: isGlobal,
    staleTime: 5_000,
  });
  // dataUpdatedAt fingerprint：overview data 内容变化时 timestamp 才变，作 useMemo 单一 dep，
  // 让返回引用在 data 不变时稳定（useQuery 每 render 返回新对象引用，直接进 deps 会每 render 重算）。
  // subtitles.dataUpdatedAt 一并纳入：subtitle 到达触发重算，把第二行 patch 进已渲染卡片。
  const dataKey = `${isGlobal}|${overview.dataUpdatedAt}|${subtitles.dataUpdatedAt}`;
  return useMemo(() => {
    if (!isGlobal) return { candidates: [], projectNames: [], isLoaded: true };
    if (overview.data === undefined) {
      // data 未回（首次加载中 / 请求失败）→ isLoaded **false**，守卫 WorkbenchRoute prune effect
      // 不在 refs 空时误清持久化 tab（与原 1+2N 路径 success-only 语义一致：refs 空绝不 prune；
      // 失败时显示骨架而非空态，避免「overview 失败 → 清光全部 session tab」灾难）。
      return { candidates: [], projectNames: [], isLoaded: false };
    }
    // subtitle 从第二阶段 map 补入（未回则 undefined，卡片退化 2 行）。overview 核心响应不再带 subtitle。
    const subtitleMap = subtitles.data?.subtitles;
    const candidates: GlobalInstanceCandidate[] = overview.data.candidates.map((c) => ({
      createdAt: c.createdAt,
      displayName: c.displayName,
      provider: c.provider,
      ref: { kind: "session", projectName: c.projectName, sessionId: c.sessionId },
      status: c.status,
      subtitle: subtitleMap?.[c.sessionId],
      type: c.type,
      updatedAt: c.updatedAt,
    }));
    return { candidates, projectNames: overview.data.projectNames, isLoaded: true };
    // isGlobal/overview/subtitles 由 dataKey fingerprint 覆盖（data 变 → dataUpdatedAt 变）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey]);
}

/**
 * 全局实例 refs（所有项目的 SessionPanelRef[]，桌面端 fan-out；设计 workbench-layout-fix.md 阶段 2a）。
 * 复用 useGlobalInstanceCandidates 的单 `/api/overview` 聚合，map 出 SessionPanelRef[]。桌面端供
 * prune effect / refsCount（为 2b 单一 layout 跨项目 tab 共存铺路）；移动端 isDesktop=false → 传
 * non-global scope 让 useGlobalInstanceCandidates 不发请求（overview query disabled），返回空 refs
 *（移动端 prune 走 useScopeInstanceOrder 的 scopeRefs）。
 */
export function useGlobalInstanceRefs(): { refs: SessionPanelRef[]; isLoaded: boolean } {
  const isDesktop = useIsDesktopViewport();
  const scope = isDesktop ? ({ kind: "global" } as const) : ({ kind: "project", key: "" } as const);
  const { candidates, isLoaded } = useGlobalInstanceCandidates(scope);
  return { refs: candidates.map((c) => c.ref), isLoaded };
}

/**
 * 当前 scope 的活跃实例有序列表（移动 ‹› 切换用，Stage 5-C）。project scope：该项目
 * agent + terminal sessions（createdAt 升序，agents 在前 terminals 在后，与左栏 Agents/
 * Terminals 分段一致）；global scope：rankGlobalInstances 排序（needs-interaction >
 * running > terminal）。query key 复用左栏 / 全局候选缓存（单一数据管道，无并行分支）。
 * 返回 `{ refs, isLoaded }`：`refs` = WorkbenchPanelRef[] 供移动 ‹› 按 index 循环切换；
 * `isLoaded` 表示活跃实例 query 已 settle（project: agents+terminals isSuccess；global:
 * candidatesLoaded），供 InstanceArea prune effect gate——避免刷新后 refs 还空（上下文不足）
 * 把全部持久化 tab 误判 stale 清光、持久化恢复失效（见 state-sync-principles 按需同步）。
 */
export function useScopeInstanceOrder(scope: WorkbenchScope): {
  refs: SessionPanelRef[];
  isLoaded: boolean;
} {
  const projectKey = scope.kind === "project" ? scope.key : null;
  // project 分支由 useProjectInstances 派生（同 query key dedupe 零额外网络；批 C 收敛此前
  // 双份 query 装配）。isSuccess 门语义见 useProjectInstances JSDoc。
  const { instances, isSuccess: projectLoaded } = useProjectInstances(projectKey);
  const { candidates, isLoaded: candidatesLoaded } = useGlobalInstanceCandidates(scope);
  if (scope.kind !== "project") {
    return { refs: rankGlobalInstances(candidates), isLoaded: candidatesLoaded };
  }
  const refs: SessionPanelRef[] = instances.map((entry) => ({
    kind: "session" as const,
    projectName: scope.key,
    sessionId: entry.session.id,
  }));
  // isLoaded 用 isSuccess 而非 !isLoading：query 出错时不 prune，避免 API 抖动误清持久化 tab；
  // 留待下次成功加载再判定。gate 在 InstanceArea 的 stale-tab prune effect。
  return { refs, isLoaded: projectLoaded };
}

/**
 * 项目活跃实例列表（P3 grid 视图 project scope 数据源）。query key 与 ProjectInstances
 *（left-rail）/ useScopeInstanceOrder 一致，React Query dedupe 零额外网络。merge agent +
 * terminal sessions 成有序 entries（agents 在前 terminals 在后，与左栏分段一致）。
 * `projectName === null`（global scope）短路返回空，不发请求——grid 在 global 改用 candidates。
 * dataKey fingerprint（dataUpdatedAt）让返回引用在 data 不变时稳定（下游 useMemo([instances]) 有效）。
 */
export type ProjectInstanceEntry = {
  session: AgentSession | TerminalSession;
  type: "agent" | "terminal";
};

export function useProjectInstances(projectName: string | null): {
  instances: ProjectInstanceEntry[];
  isLoading: boolean;
  /** agents+terminals 双 query 均成功 settle（出错 false——供 scope 序 prune gate 的
   *  isLoaded 门语义，见 useScopeInstanceOrder）。memo 内随 dataKey 快照：后台 refetch
   *  失败窗口与 live 值可分歧，refs 同期冻结于 last-good data，gate 开关均不产生 prune。 */
  isSuccess: boolean;
} {
  const agents = useQuery({
    enabled: projectName !== null,
    queryKey: ["projects", projectName ?? "", "agent-sessions"],
    queryFn: () => listAgentSessions(projectName as string),
    staleTime: 5_000,
  });
  const terminals = useQuery({
    enabled: projectName !== null,
    queryKey: ["projects", projectName ?? "", "terminal-sessions"],
    queryFn: () => listTerminalSessions(projectName as string),
    staleTime: 5_000,
  });
  const dataKey = `${projectName ?? ""}|${agents.dataUpdatedAt}|${terminals.dataUpdatedAt}`;
  return useMemo(() => {
    if (projectName === null) return { instances: [], isLoading: false, isSuccess: false };
    const instances: ProjectInstanceEntry[] = [
      ...(agents.data?.sessions ?? []).map((session) => ({
        session: session as AgentSession,
        type: "agent" as const,
      })),
      ...(terminals.data?.sessions ?? []).map((session) => ({
        session: session as TerminalSession,
        type: "terminal" as const,
      })),
    ];
    // isLoading = 任一 query pending 即算加载中（||）：agent pending + terminal 已回空时，
    // instances 仍空 + isLoading true → 显示骨架；用 && 会让先 resolved 的那个把 isLoading 提前置 false，
    // 首屏空数据时误显空态而非骨架。
    return {
      instances,
      isLoading: agents.isLoading || terminals.isLoading,
      isSuccess: agents.isSuccess && terminals.isSuccess,
    };
    // projectName/agents/terminals 由 dataKey fingerprint 覆盖（data 变 → dataUpdatedAt 变）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey]);
}

function EmptyInstanceArea({
  create,
  hasActiveInstances = false,
  projectName,
}: {
  create: CreateSessionApi | null;
  /** 右侧无 tab 时区分双语义（设计 §14）：true=有活跃实例但未打开（空态提示，无创建入口）；
   * false=真无活跃实例（创建态 + CreateSessionBar）。左总览调用默认 false。 */
  hasActiveInstances?: boolean;
  projectName: string | null;
}) {
  const { t } = useT();
  return (
    <div className="flex h-full items-center justify-center p-6" data-drop-empty="">
      <div
        className={`flex min-h-32 flex-1 flex-col items-center justify-center gap-3 rounded-2xl ${shellSurfaceClasses.inset}`}
      >
        {hasActiveInstances ? (
          // 双语义（设计 §14）：有活跃实例但右侧无 tab（全最小化 / 刚进 scope 无 focusId）→ 空态提示，
          // 不显示创建入口（实例已存在，只是未打开）。global 同理。
          <p className="text-sm text-on-surface-muted">{t("workbench.emptyInstanceNoTab")}</p>
        ) : projectName !== null && create ? (
          <>
            <p className="text-sm text-on-surface-muted">{t("workbench.emptyInstanceHint")}</p>
            <CreateSessionBar
              isCreating={create.isCreating}
              onCreateAgent={create.createAgent}
              onCreateTerminal={create.createTerminal}
            />
          </>
        ) : projectName !== null ? (
          <p className="text-sm text-on-surface-muted">{t("workbench.emptyInstanceHint")}</p>
        ) : (
          <p className="text-sm text-on-surface-muted">{t("workbench.emptyInstanceGlobalHint")}</p>
        )}
      </div>
    </div>
  );
}

function PlaceholderPanel({ focusId }: { focusId: string }) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div
        className={`rounded-2xl px-4 py-3 font-mono text-xs text-on-surface-muted ${shellSurfaceClasses.inset}`}
      >
        {focusId}
      </div>
    </div>
  );
}

/**
 * tabstrip 右端 ⋯ 会话菜单（v1.6 批 v6.3 三区，与移动 ⋯ 菜单同构：导航区 实例信息 › →
 * 动作区 置顶 ✓ keepOpen / 重命名… / 自动重试 ✓ keepOpen → 销毁区 关闭… 红。动作语义 =
 * useInstanceRowActions 双端单源；icon 注入与实例信息项（useInstanceInfoActions modal 形态）
 * 留桌面容器。关闭走 InstanceArea closeInstance（confirm 在 useCloseSession 内）。区界 =
 * 区首 mt-2 分组间距（同移动端）。
 */
function SessionTabStripActions({
  closeInstance,
  panelRef,
}: {
  closeInstance: (sessionId: string, type: "agent" | "terminal") => void;
  panelRef: SessionPanelRef;
}) {
  const { t } = useT();
  const meta = usePanelMeta(panelRef);
  const sessionType = inferSessionTypeFromId(panelRef.sessionId);
  const {
    openInfo,
    holder: infoHolder,
    autoRetryEditorHolder,
  } = useInstanceInfoActions(panelRef, sessionType, panelRef.projectName, "modal");
  const { renameHolder, build } = useInstanceRowActions(closeInstance);
  const a = build(panelRef, sessionType ?? "agent");
  // 动作区数据源（同移动端 ⋯ 菜单）：置顶态（✓ 标注）+ 自动重试开关（即点即改；claude
  // 会话门——provider 未加载前不渲染，避免闪现）。
  const { pinned: pinnedSet } = usePinnedSessions();
  const autoRetry = useAutoRetryToggle(panelRef.projectName, panelRef.sessionId, sessionType);
  const agentDetail = useAgentDetail(panelRef, sessionType === "agent");
  const isClaude = sessionType === "agent" && agentDetail.data?.session.provider === "claude";
  const items: ActionMenuItem[] = [
    {
      label: t("session.instanceInfo.title"),
      icon: <ShellIcon className="size-[17px]" name="info" />,
      trailing: <span className="text-xs text-ink-3">›</span>,
      onSelect: openInfo,
    },
    // pin 保留原严格门（sessionType 原值判定，不随 ?? "agent" 兜底漂移——未知类型会话
    // 旧行为不渲染 pin，build 兜底只服务 rename/close 的既有语义）。置顶行 = 恒「置顶」
    // 文案 + ✓ 态标注（v1.6 workspace-more-menu 动作区原型语义）。
    ...(sessionType === "agent" && a.pin
      ? [
          {
            label: t("workbench.pin"),
            className: "mt-2",
            icon: <ShellIcon className="size-[17px]" name="pin" />,
            trailing: pinnedSet.has(panelRef.sessionId) ? (
              <span className="text-[13px] font-bold text-primary">✓</span>
            ) : null,
            keepOpen: true,
            onSelect: a.pin.run,
          },
        ]
      : []),
    {
      label: a.rename.label,
      icon: <ShellIcon className="size-[17px]" name="edit" />,
      onSelect: () => a.rename.run(meta?.label ?? panelRef.sessionId),
    },
    ...(isClaude
      ? [
          {
            label: t("session.autoRetry.label"),
            icon: <ShellIcon className="size-[17px]" name="rotate" />,
            trailing: autoRetry.enabled ? (
              <span className="text-[13px] font-bold text-primary">✓</span>
            ) : null,
            disabled: autoRetry.toggle.isPending,
            keepOpen: true,
            onSelect: () => autoRetry.toggle.mutate(!autoRetry.enabled),
          },
        ]
      : []),
    {
      label: a.close.label,
      className: "mt-2",
      icon: <ShellIcon className="size-[17px]" name="close" />,
      variant: "destructive",
      onSelect: a.close.run,
    },
  ];
  return (
    <>
      <ActionMenu
        align="end"
        items={items}
        trigger={
          <button
            aria-label={t("workbench.moreActions")}
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-on-surface-muted transition hover:bg-on-surface/5 hover:text-on-surface active:bg-on-surface/10"
            type="button"
          >
            <ShellIcon className="h-3 w-3" name="ellipsis" />
          </button>
        }
      />
      {infoHolder}
      {autoRetryEditorHolder}
      {renameHolder}
    </>
  );
}

/**
 * 右工作区活动组 header = tab 栏（设计 §7.1）：每个 tab 一个实例 chip（marker + 名 + ✕），
 * 右端 [＋][分屏][编辑][⋯]（v1.5 spec §4.5；▢ 最大化已随真机复验反馈①退役，见渲染处注释）。
 * tab ✕ = 最小化（移除 tab，session 存活回左总览，设计 §7.2）；
 * 关闭实例 kill 不放 tab ✕（走左总览卡片 close，避免高频按钮触发破坏性 kill）。usePanelMeta
 * 从实例 detail query 派生（与 PanelRouter 同源 query key，React Query dedupe）。
 */
function GroupHeader({
  closeInstance,
  create,
  group,
  onCloseTab,
  onOpenGitDiff,
  onSelectTab,
  onSplit,
  onTabContextMenu,
  onTabDragStart,
}: GroupHeaderProps) {
  const { t } = useT();
  // §7.2（批 8）：tabstrip 标签溢出时滚轮横滚 + 边缘 12px 渐隐（右端 ＋/分屏等尾部控件
  // 在滚动容器外，「尾部控件可达」天然成立）；标签数变化在内容 effect 里重算渐隐方向。
  // 批 11 反馈③：激活标签（.on 下划线类）变化时滚入视野——切 tab/开新 tab/分组头挂载
  //（工具区打开）三个时机都滚；无溢出 no-op。
  const hs = useHScroll();
  useEffect(() => {
    hs.update();
    hs.ensureActive(".on");
  }, [group.activeTabId, group.tabs.length, hs.ensureActive, hs.update]);
  // v1.5 批 4（spec §4.5）：tabstrip 右端 [＋][分屏][⋯]，⋯ 收尾最右、内容
  // 跟随激活标签（会话/文件两族；git/skill/chat/render 无 ⋯ 规格；wikiread ⋯ = 全局同构
  // review 批 A-5 补齐「复制内容/查看 diff」；v1.6 pencil 退役——「编辑」= 点正文进入）。
  // 编辑态只剩结构钮（⋯ 消失，05h4 原型实证）。编辑判定 = 激活 tabId 与
  // workbenchFileTabEditingAtom 相等。真机复验反馈①：[最大化] 退役（见 tabstrip 内注释）。
  const activeTab = group.tabs.find((tab) => tabIdOf(tab) === group.activeTabId) ?? null;
  const editingTabId = useAtomValue(workbenchFileTabEditingAtom);
  const editing = editingTabId !== null && editingTabId === group.activeTabId;
  return (
    // tabstrip 单源形制（§6.12j，v2-primitives .tabstrip：高 32px + bg-tabstrip + border-b
    // sep + gap 16px）。高度 32px 须与 WORKBENCH_TAB_BAR_PX 对齐：表现层靠此固定值把面板顶部
    // calc 下推避让 tab 栏。右侧「＋」= 新建实例入口（05d 原型 tabstrip plus 锚点语义），与
    // 左栏 CreateSessionBar 共用 createSessionMenuItems（桌面左栏创建入口保留不动）。
    <div className="tabstrip">
      {/* h-full 拉满条高（stretch 链：容器 → DragSourceCard → .tb height:100%），active 的
          ::after 下划线才能贴条底。 */}
      <div
        className="flex h-full min-w-0 flex-1 gap-4 overflow-x-auto hfade"
        ref={hs.ref}
        {...hs.fadeProps}
      >
        {group.tabs.map((tab) => (
          <TabChip
            isActive={tabIdOf(tab) === group.activeTabId}
            key={tabIdOf(tab)}
            onClose={() => onCloseTab(tabIdOf(tab))}
            onContextMenu={(event) => onTabContextMenu(tabIdOf(tab), event)}
            onDragStart={onTabDragStart}
            onSelect={() => onSelectTab(tabIdOf(tab))}
            panelRef={tab}
          />
        ))}
      </div>
      {create ? (
        <ActionMenu
          align="end"
          items={createSessionMenuItems(create, t)}
          trigger={
            <button
              aria-label={t("workbench.createMenu")}
              className="plus cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              disabled={create.isCreating}
              type="button"
            />
          }
        />
      ) : null}
      {/* 分屏按钮（§6.10-3，05 原型 tabstrip 右侧 rect+分隔线 icon）：一键分屏——复制当前
          激活 tab 到新窗格（VSCode 语义，批 13 反馈⑥ 用户拍板「分屏仅分屏」）——
          WorkbenchContent onSplitLeaf 走 workbench-model.splitLeafWithActiveTab。 */}
      <button
        aria-label={t("workbench.splitPane")}
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-on-surface-muted transition hover:bg-on-surface/5 hover:text-on-surface active:bg-on-surface/10"
        onClick={onSplit}
        title={t("workbench.splitPane")}
        type="button"
      >
        <ShellIcon className="h-3 w-3" name="split" />
      </button>
      {/* v1.5 批 4：[编辑][⋯] 跟随激活标签（⋯ 收尾最右）；编辑态消失（05h4 原型）。 */}
      {/* 真机复验反馈①（2026-10-06）：tabstrip 最大化钮退役——独占态挤压多 tab 工作面，
          与 v1.5 原型 tabstrip（[＋][分屏][⋯]）不符；已最大化布局记忆由 storage 读取侧
          归零（workbench-model workbenchLayoutStorage.getItem，防无入口困死）。 */}
      {!editing && activeTab?.kind === "file" ? (
        <FileTabStripActions onOpenDiff={onOpenGitDiff} panelRef={activeTab} />
      ) : null}
      {!editing && activeTab?.kind === "wikiread" ? (
        // wiki 阅读菜单 = WikiReadNavMenu 双端单源(A-5 桌面补齐:此前仅移动面板 wikiread
        // 标签有 ⋯)。查看 diff = 源文件 wiki/{slug}.md 开中栏 git tab(与 file tab「查看
        // diff」同管道);triggerClassName 对齐 tabstrip 结构钮形制(h-6 w-6;⋯ 图标 = ShellIcon
        // 默认 size-4 16px,与 FileTabStripActions ⋯ 同档,非结构钮的 h-3 w-3)。
        <WikiReadNavMenu
          onViewDiff={
            onOpenGitDiff
              ? () => onOpenGitDiff(activeTab.projectName, "worktree", `wiki/${activeTab.slug}.md`)
              : undefined
          }
          projectName={activeTab.projectName}
          slug={activeTab.slug}
          triggerClassName="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-on-surface-muted transition hover:bg-on-surface/5 hover:text-on-surface active:bg-on-surface/10"
        />
      ) : null}
      {!editing && activeTab?.kind === "session" ? (
        <SessionTabStripActions closeInstance={closeInstance} panelRef={activeTab} />
      ) : null}
    </div>
  );
}

type GroupHeaderProps = {
  /** 关闭实例（⋯ 会话菜单「关闭会话」项；InstanceArea 透传 WorkbenchRoute closeInstance）。
   *  v1.5 批 4（spec §4.5）tabstrip ⋯ 新增。 */
  closeInstance: (sessionId: string, type: "agent" | "terminal") => void;
  /** 新建实例菜单（tabstrip「＋」）；null 时不渲染（EmptyInstanceArea 承担空态创建）。 */
  create: CreateSessionApi | null;
  group: WorkbenchGroup;
  onCloseTab: (tabId: string) => void;
  /** v1.5 批 4（spec §4.5）：file tab ⋯「查看 diff」= 开中栏 git tab（diff = 中栏标签）。 */
  onOpenGitDiff?: (projectName: string, scope: GitDiffScope, path: string) => void;
  onSelectTab: (tabId: string) => void;
  /** 分屏按钮（§6.10-3）：在此 group 右侧分屏并新建终端窗格（WorkbenchContent 实现）。 */
  onSplit: () => void;
  onTabContextMenu: (tabId: string, event: MouseEvent<HTMLDivElement>) => void;
  onTabDragStart: (ref: WorkbenchPanelRef, event: PointerEvent<HTMLDivElement>) => void;
};

type TabChipProps = {
  isActive: boolean;
  onClose: () => void;
  onContextMenu: (event: MouseEvent<HTMLDivElement>) => void;
  onDragStart: (ref: WorkbenchPanelRef, event: PointerEvent<HTMLDivElement>) => void;
  onSelect: () => void;
  panelRef: WorkbenchPanelRef;
};

/**
 * group 内单个 tab chip（设计 §7.1，§9 批 6b；§6.12j 起对齐原型 tabstrip .tb 形制）：类型
 * marker（v1.5 批 7 §6.2 行首回归）+ 实例名（点击 = 切活动 tab）+ 6px 状态点（session/
 * terminal tab，「状态点随名称后」）+ ✕（最小化）。active =
 * ink-1 600 + 2.5px 主色下划线；非 active hover 才显动作钮（hover 环境）。usePanelMeta 派生
 * marker + label + statusDot。AutoRetry 图标已随真机复验反馈①退役（见渲染处注释）。
 *
 * 外层 DragSourceCard 启用拖动（设计 §7.3 tab 跨 group 拖动）：pointermove 超阈值 →
 * onCardDragStart → dragState → DropZoneOverlay 显示 drop zone。单击（未超阈值）select/close
 * button 仍走各自 onClick（DragSourceCard.inClose=true 跳过其 onSelect，避免双触发）。
 *
 * 右键 tab（设计 §7.1）弹轻量菜单「最小化」+「关闭实例 kill」（onContextMenu 上传坐标，
 * InstanceArea 渲染 TabContextMenu）。浏览器原生 contextmenu 默认行为 preventDefault 抑制。
 */
function TabChip({
  isActive,
  onClose,
  onContextMenu,
  onDragStart,
  onSelect,
  panelRef,
}: TabChipProps) {
  const { t } = useT();
  const meta = usePanelMeta(panelRef);
  const label = panelTabLabel(panelRef, meta, t);
  // v1.5 批 4（spec §4.5）：TabChip ℹ 退役——实例信息收敛进 tabstrip 右端 ⋯ 会话菜单
  //（GroupHeader ActiveTabActions，与移动端 ⋯ 菜单同构）；TabChip 留 marker + 文本 + 状态点
  // + ✕。真机复验反馈①（2026-10-06）：tab 上的 AutoRetry 图标撤除（与 ✕ 并排挤占 tab
  // 宽度；自动重试开关在实例信息面板动作行仍有入口）。
  return (
    <DragSourceCard dragRef={panelRef} onDragStart={onDragStart} onSelect={onSelect}>
      {/* tabstrip .tb 单源形制（§6.12j，v2-primitives .tabstrip .tb）：12.5px 文本 + on 态
          ink-1 600 + ::after 2.5px 主色下划线（absolute bottom，随 .tb on 类自动来）。v1.5 批 7
          §6.2 行首类型 marker 回归（sparkles/terminal/message 同一 registry，与 DragGhost 同源
          meta.marker），状态点移名称后（状态点 tone 消费 statusDotToneBg 禁私设映射；
          session/terminal tab 有，file/git/skill/chat/render 无 → 纯文本，与原型非 session tab
          一致）。✕ 是 tab 特有动作保留接线（触屏常显、hover 环境显隐，frontend-notes §7）。 */}
      <div
        className={`tb group/tab shrink-0 cursor-pointer ${isActive ? "on" : ""}`}
        onContextMenu={(event) => {
          event.preventDefault();
          onContextMenu(event);
        }}
      >
        {meta?.marker ?? null}
        <button
          className="flex min-w-0 cursor-pointer items-center"
          onClick={onSelect}
          type="button"
        >
          <span className="block max-w-[8rem] truncate">{label}</span>
        </button>
        {meta?.statusDot ? (
          <span
            aria-label={meta.statusDot.label}
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDotToneBg[meta.statusDot.tone]}${
              meta.statusDot.pulse ? " animate-pulse" : ""
            }`}
            role="img"
          />
        ) : null}
        <button
          aria-label={t("workbench.tabMinimize")}
          className={`inline-flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded text-on-surface-muted transition hover:bg-on-surface/10 active:bg-on-surface/10 hover:text-on-surface ${
            isActive
              ? "opacity-100"
              : "opacity-100 hover-capable:opacity-0 hover-capable:group-hover/tab:opacity-100"
          }`}
          onClick={onClose}
          title={t("workbench.tabMinimize")}
          type="button"
        >
          <ShellIcon className="h-3 w-3" name="close" />
        </button>
      </div>
    </DragSourceCard>
  );
}

// ── Phase B 拖放分屏组件（设计 §7.2/§7.4）────────────────────────────────────

// DragSourceCard + useDragSource 已抽到 ./drag-source.tsx（与新增 DraggableListRow 共用，
// 服务文件树/git/skill 行拖动源，设计 §7.2 拖动源泛化）。PointerEvent_Window 仍留本文件
//（DropZoneOverlay onPointerMove 用，L2254/2294）。

type SplitGutterProps = {
  /** gutter 朝向（设计 §7.4）：col=横向相邻 group 间列宽（cursor-col-resize）；row=纵向行间高度。 */
  orientation: "col" | "row";
  /** gutter 自身的归一化 rect（0~1，相对共享根容器）——absolute 定位用，是两 children 之间的缝隙位置。 */
  rect: FlatRect;
  /** 所属 split 的归一化 rect（0~1）；gutter 算 ratio 时用 splitRect 的主轴像素尺寸作分母。 */
  splitRect: FlatRect;
  /** 拖拽增量（本次 move 的 delta / split 主轴像素尺寸，无量纲比例）；上层按 split totalFlex 转 deltaFlex。 */
  onResize: (ratioDelta: number) => void;
};

/**
 * 相邻区域分隔条（设计 §7.3/§7.4，§7.8 扁平化）。absolute 定位到 `rect`（两 children 之间的缝隙），
 * pointer-event 增量拖拽：每次 move 算 delta（col=clientX / split 像素宽，row=clientY / split 像素高）
 * → onResize(ratioDelta)；上层 onResizeSplit 基于 split totalFlex 转 deltaFlex 更新 sizes（守恒钳制）。
 * split 像素尺寸 = splitRect 主轴归一化长度 × 根容器像素尺寸（offsetParent = 共享 relative 根）。
 * setPointerCapture 锁指针到 gutter，拖拽时即使滑过面板仍持续触发。
 */
function SplitGutter({ orientation, rect, splitRect, onResize }: SplitGutterProps) {
  const gutterRef = useRef<HTMLDivElement>(null);
  const lastPos = useRef<number | null>(null);
  const isRow = orientation === "row";

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    lastPos.current = isRow ? event.clientY : event.clientX;
    void gutterRef.current?.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (lastPos.current === null) return;
    // 根容器（offsetParent = 共享 relative 根）的像素尺寸；split 主轴像素 = 归一化长度 × 根尺寸。
    const root = gutterRef.current?.offsetParent as HTMLElement | null;
    const rootSize = isRow
      ? (root?.getBoundingClientRect().height ?? 1)
      : (root?.getBoundingClientRect().width ?? 1);
    const splitSize = (isRow ? splitRect.h : splitRect.w) * rootSize;
    const current = isRow ? event.clientY : event.clientX;
    const delta = current - lastPos.current;
    lastPos.current = current;
    onResize(splitSize > 0 ? delta / splitSize : 0);
  };
  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    lastPos.current = null;
    void gutterRef.current?.releasePointerCapture(event.pointerId);
  };

  return (
    <div
      aria-hidden
      className={`absolute z-10 rounded-full bg-on-surface/5 transition-colors hover:bg-on-surface/20 ${isRow ? "cursor-row-resize" : "cursor-col-resize"}`}
      onPointerCancel={endDrag}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      ref={gutterRef}
      style={
        isRow
          ? {
              height: "4px",
              left: pct(rect.x),
              top: pct(rect.y),
              width: pct(rect.w),
            }
          : {
              height: pct(rect.h),
              left: pct(rect.x),
              top: pct(rect.y),
              width: "4px",
            }
      }
    >
      {/* 拖拽手柄视觉（§6.10-3，05 原型 `.grip` ⋮⋮ 块压分隔线中点；row 方向旋转 90°）。
          纯视觉——事件由父 gutter 统一接（grip 凸出部分也冒泡到 gutter handler）。 */}
      <div
        className="grip"
        style={
          isRow
            ? { left: "50%", top: "50%", transform: "translate(-50%, -50%) rotate(90deg)" }
            : { left: "50%", top: "50%", transform: "translate(-50%, -50%)" }
        }
      >
        ⋮⋮
      </div>
    </div>
  );
}

// ── V3 n 叉树渲染（设计 §7.5）──────────────────────────────────────────────────────────────

type WorkspaceTreeHandlers = {
  activeZone: { targetGroupId: string | null; zone: DropZone } | null;
  /** v1.5 批 4：GroupHeader ⋯ 会话菜单「关闭会话」（InstanceArea closeInstance 透传）。 */
  closeInstance: (sessionId: string, type: "agent" | "terminal") => void;
  draggingRef: WorkbenchPanelRef | null;
  onCloseLeafTab: (leafId: string, tabId: string) => void;
  /** v1.5 批 4：file tab ⋯「查看 diff」= 开中栏 git tab（WorkbenchRoute onOpenGitFile）。 */
  onOpenGitDiff?: (projectName: string, scope: GitDiffScope, path: string) => void;
  /** 批 13 反馈⑤ review P1：md 相对链接打开（MarkdownLinkContext per-panel value；透传到
   *  PanelRouter file 分支）。 */
  onOpenFile?: (projectName: string, path: string) => void;
  onResizeSplit: (
    splitId: string,
    leftChildId: string,
    rightChildId: string,
    deltaFlex: number,
  ) => void;
  onSelectTab: (leafId: string, tabId: string) => void;
  /** 分屏按钮（§6.10-3，批 13 反馈⑥）：复制当前激活 tab 到右侧新窗格（VSCode 复制语义，
   *  WorkbenchRoute.splitLeafWithActiveTab 实现）。 */
  onSplitLeaf: (leafId: string) => void;
  onTabContextMenu: (leafId: string, tabId: string, x: number, y: number) => void;
  onTabDragStart: (ref: WorkbenchPanelRef, event: PointerEvent<HTMLDivElement>) => void;
};

type WorkspaceTreeProps = WorkspaceTreeHandlers & {
  create: CreateSessionApi | null;
  hasActiveInstances: boolean;
  /** 全局实例 refs 是否已加载（useGlobalInstanceRefs().isLoaded）；false 时 root=null 显骨架
   * 而非空态卡——防 pending 期闪「无活跃实例」伪空态（§6.12o）。 */
  refsLoaded?: boolean;
  maximized: string | null;
  projectName: string | null;
  root: TreeNode | null;
};

/** 归一化 0~1 → 百分比字符串（absolute 定位 style 用，相对共享 relative 根容器的 padding box）。 */
function pct(n: number): string {
  return `${n * 100}%`;
}

/** group tab 栏（GroupHeader）固定高度 px，与 GroupHeader 的 tabstrip 形制对齐
 *（§6.12j：v2-primitives `.tabstrip` height:32px）。
 *
 *  flatten-layout 的 contentRect 不含 tab 栏偏移（归一化比例无法精确表达固定 px，矮容器下会偏），
 *  改由 `rectStyle` 的 insetTopPx 用 CSS calc 把面板顶部下推固定 32px——无论容器多高都精确对齐
 *  GroupHeader 底，不再"矮容器下 tab 下半被面板遮挡"。改 GroupHeader 高度时必须同步改此常量。 */
const WORKBENCH_TAB_BAR_PX = 32;

/** 归一化 rect → React absolute 定位 style（left/top/width/height 百分比）。
 *
 *  insetTopPx>0 时 top/height 用 `calc(百分比 ± 固定px)`：把元素顶部下推固定像素（避让固定高度的
 *  GroupHeader），height 同步减去该像素保持底部对齐——百分比随容器缩放、固定 px 不随容器变，
 *  两者相加既精确又无需 ResizeObserver。 */
function rectStyle(r: FlatRect, insetTopPx = 0): CSSProperties {
  if (insetTopPx <= 0) {
    return {
      height: pct(r.h),
      left: pct(r.x),
      position: "absolute",
      top: pct(r.y),
      width: pct(r.w),
    };
  }
  return {
    height: `calc(${pct(r.h)} - ${insetTopPx}px)`,
    left: pct(r.x),
    position: "absolute",
    top: `calc(${pct(r.y)} + ${insetTopPx}px)`,
    width: pct(r.w),
  };
}

/**
 * 右工作区扁平化渲染（设计 §7.8，UI = f(state)）。`flattenLayout(root, maximized)` 把 n 叉树 state
 * 投影成 groups / gutters / panels 三个并列扁平数组，各自 `.map` 渲染——无递归组件。group 用
 * `key=leaf.id`、tab 用 `key=sessionId` 稳定，split / 合入塌缩 / tab 跨 group 移动 / 加 tab / 切 active
 * 时 React 按相同 key 复用 → DOM 不卸载 → WebSocket 不断、xterm 不 dispose、relay 不重放。
 * root=null → 空态。maximized 时 flattenLayout 已把该 leaf rect 设占满、其他 leaf visible=false（hidden）。
 */
export function WorkspaceTree({
  root,
  maximized,
  create,
  hasActiveInstances,
  refsLoaded = true,
  projectName,
  ...handlers
}: WorkspaceTreeProps) {
  const flat = useMemo(() => flattenLayout(root, maximized), [root, maximized]);
  if (root === null) {
    // refs 未加载完不显空态卡（§6.12o：hasActiveInstances 由 refsCount 派生，pending 期恒 0
    // 会闪「无活跃实例/创建态」→ 数据到前显骨架）。同左栏/移动 grid 的 CardGridSkeleton 模式。
    if (!refsLoaded) return <CardGridSkeleton plain />;
    return (
      <EmptyInstanceArea
        create={create}
        hasActiveInstances={hasActiveInstances}
        projectName={projectName}
      />
    );
  }
  // 拖动态（draggingRef 非空）：panel 层 pointer-events:none 让 DropZoneOverlay 的
  // elementFromPoint 穿透 panel + xterm，命中下层 GroupShell 的 data-drop-group（扁平化后 panel
  // 不再是 group 的后代，closest 找不到 group，必须靠穿透）。非拖动态 panel 正常接交互。
  const isDragging = handlers.draggingRef !== null;
  return (
    // 共享 relative 根：所有 group/gutter/panel 的 absolute 百分比定位基准。窗格满铺
    //（2026-09-29 真机反馈：原型 .pane 平面拼接 border-right 分隔，无浮动卡片缝——原 p-1
    // 内衬 + 窗格描边 = VSCode 浮动卡片形制，原型里没有）。
    <div className="relative h-full min-h-0 w-full">
      {flat.groups.map((g) => (
        <GroupShell
          activeZone={handlers.activeZone}
          closeInstance={handlers.closeInstance}
          create={create}
          dragRef={handlers.draggingRef}
          group={g}
          key={g.id}
          onCloseTab={(tabId) => handlers.onCloseLeafTab(g.id, tabId)}
          onOpenGitDiff={handlers.onOpenGitDiff}
          onSelectTab={(tabId) => handlers.onSelectTab(g.id, tabId)}
          onSplit={() => handlers.onSplitLeaf(g.id)}
          onTabContextMenu={(tabId, event) =>
            handlers.onTabContextMenu(g.id, tabId, event.clientX, event.clientY)
          }
          onTabDragStart={handlers.onTabDragStart}
        />
      ))}
      {flat.gutters.map((g) => (
        <SplitGutter
          key={g.id}
          onResize={(ratio) =>
            handlers.onResizeSplit(g.splitId, g.leftChildId, g.rightChildId, ratio * g.totalFlex)
          }
          orientation={g.orientation}
          rect={g.rect}
          splitRect={g.splitRect}
        />
      ))}
      {flat.panels.map((p) => (
        <div
          className={
            p.visible
              ? `absolute z-0 flex min-h-0 min-w-0 flex-col ${isDragging ? "pointer-events-none" : ""}`
              : "hidden"
          }
          key={p.renderKey}
          style={p.visible ? rectStyle(p.rect, WORKBENCH_TAB_BAR_PX) : undefined}
        >
          {/* 面板主体（SessionDetailHeader/ChatHeader 死 UI 已删，2026-09-26 拍板）：
              title/projectName 由 group tab 栏 chip + 中栏 tab 行显示，Files/Git 走中栏顶部 tab，
              +Terminal 走左总览 CreateSessionBar，Retry 走内容区错误态 Notice，Close 由 tab ✕ +
              左总览卡片 close 承担（设计 §11）。 */}
          <PanelRouter onOpenFile={handlers.onOpenFile} panelRef={p.ref} />
        </div>
      ))}
    </div>
  );
}

/**
 * 右工作区 n 叉树渲染（V3，设计 §7.5/§7.8）。root=null → EmptyInstanceArea；否则 flattenLayout 投影
 * 成扁平数组渲染（见上方 WorkspaceTree）。maximized 由 flattenLayout 处理（该 leaf rect 占满、
 * 其他 leaf visible=false hidden），不再渲染层短路。
 */
type GroupShellProps = {
  activeZone: { targetGroupId: string | null; zone: DropZone } | null;
  /** 透传 GroupHeader tabstrip「＋」新建实例菜单（§6.12j）。 */
  create: CreateSessionApi | null;
  /** v1.5 批 4：GroupHeader ⋯ 会话菜单「关闭会话」（InstanceArea closeInstance 透传）。 */
  closeInstance: (sessionId: string, type: "agent" | "terminal") => void;
  dragRef: WorkbenchPanelRef | null;
  /** flattenLayout 投影出的 group（含 rect / contentRect / isMaximized / tabs）。 */
  group: FlatGroup;
  onCloseTab: (tabId: string) => void;
  /** v1.5 批 4：file tab ⋯「查看 diff」= 开中栏 git tab（WorkspaceTree handlers 透传）。 */
  onOpenGitDiff?: (projectName: string, scope: GitDiffScope, path: string) => void;
  onSelectTab: (tabId: string) => void;
  /** 分屏按钮（§6.10-3）：在此 group 右侧分屏并新建终端窗格。 */
  onSplit: () => void;
  onTabContextMenu: (tabId: string, event: MouseEvent<HTMLDivElement>) => void;
  onTabDragStart: (ref: WorkbenchPanelRef, event: PointerEvent<HTMLDivElement>) => void;
};

/**
 * group 壳（设计 §7.8 扁平化）= 边框 + GroupHeader（tab 栏）+ DropZoneHighlight，**不含 PanelRouter**
 * —— PanelRouter 由 WorkspaceTree 的 panels.map 在扁平层渲染（key=sessionId 稳定，跨 group 移动
 * 不重挂）。absolute 定位到 group.rect（百分比，相对共享 relative 根容器）。data-drop-group 保留
 * 在外 div 让 DropZoneOverlay 的 elementFromPoint 命中。拖动态整体 pointer-events:none 让
 * elementFromPoint 落到 overlay 下层 group。tab 用 CSS hidden 不 unmount 保 WebSocket/relay
 * 长连（§7.4），hidden 容器现在在扁平层 panels（不在 GroupShell 内），xterm offsetParent===null
 * 防御（commit 81418c6）行为不变。
 */
function GroupShell({
  activeZone,
  closeInstance,
  create,
  dragRef,
  group,
  onCloseTab,
  onOpenGitDiff,
  onSelectTab,
  onSplit,
  onTabContextMenu,
  onTabDragStart,
}: GroupShellProps) {
  const isDraggingThis = dragRef ? group.tabs.some((t) => tabIdOf(t) === tabIdOf(dragRef)) : false;
  const isDropTarget = activeZone?.targetGroupId === group.id;
  return (
    // group 壳对齐原型 .pane 形制（components.css:245）：平面拼接、无圆角、无白卡，仅
    // border-right 1px 分隔线（2026-09-29 真机反馈④「多 tab 会话用了圆角矩形，原型里没有」
    // ——原 rounded-lg + workspace 白卡是浮动卡片形制）。
    <div
      className={`relative flex min-h-0 min-w-0 flex-col overflow-hidden border-r border-neutral-line ${
        isDraggingThis ? "opacity-40" : ""
      }`}
      data-drop-group={group.id}
      style={rectStyle(group.rect)}
    >
      <GroupHeader
        closeInstance={closeInstance}
        create={create}
        group={group}
        onCloseTab={onCloseTab}
        onOpenGitDiff={onOpenGitDiff}
        onSelectTab={onSelectTab}
        onSplit={onSplit}
        onTabContextMenu={onTabContextMenu}
        onTabDragStart={onTabDragStart}
      />
      {isDropTarget ? <DropZoneHighlight zone={activeZone?.zone ?? "center"} /> : null}
    </div>
  );
}

/** drop zone aria-label key 映射（5 zone + 空白区）。 */
const DROP_ZONE_LABEL_KEY: Record<DropZone, TranslationKey> = {
  up: "workbench.dropUp",
  down: "workbench.dropDown",
  left: "workbench.dropLeft",
  right: "workbench.dropRight",
  center: "workbench.dropCenter",
};

/**
 * 单个 group 上的 5 zone 视觉高亮（设计 §7.2 ASCII 图）。zone 对应位置渲染半透明 primary
 * 覆盖层（dashed border + bg-primary/10），其余区域不渲染。仅 activeZone 命中的 group 显示。
 * aria-label 用 zone label key（a11y：屏幕阅读器读出当前 zone 语义）。
 */
function DropZoneHighlight({ zone }: { zone: DropZone }) {
  const { t } = useT();
  const positionClass =
    zone === "up"
      ? "top-0 left-0 right-0 h-1/3"
      : zone === "down"
        ? "bottom-0 left-0 right-0 h-1/3"
        : zone === "left"
          ? "top-0 left-0 bottom-0 w-1/3"
          : zone === "right"
            ? "top-0 right-0 bottom-0 w-1/3"
            : "inset-0";
  return (
    <div
      aria-label={t(DROP_ZONE_LABEL_KEY[zone])}
      className={`pointer-events-none absolute ${positionClass} z-10 border-2 border-dashed border-primary/50 bg-primary/10`}
      role="status"
    />
  );
}

type TabContextMenuProps = {
  anchor: { groupId: string; tabId: string; x: number; y: number };
  onClose: () => void;
  /** kill 回调；仅 session tab 提供（file tab 无 session 生命周期，不渲染 kill 项）。 */
  onKill?: () => void;
  onMinimize: () => void;
};

/**
 * tab 右键菜单（设计 §7.1）：右键 tab 弹轻量菜单「最小化」+「关闭实例 kill」。单源消费
 * ActionMenu 的 contextMenuPoint 坐标分支（02c 单一菜单容器——原手写裸 DropdownMenu +
 * size-0 trigger 与其逐字同构，批次 1 冗余收敛删除）。
 * 「最小化」= removeTabFromGroup（session 存活，同 tab ✕）；「关闭实例」= useCloseSession
 *（自带 confirm → close API → 失效缓存，菜单内不再 confirm）。file tab 无 kill（无 session
 * 生命周期），onKill 不提供 → 只渲染最小化。
 */
function TabContextMenu({ anchor, onClose, onKill, onMinimize }: TabContextMenuProps) {
  const { t } = useT();
  const items: ActionMenuItem[] = [
    // 菜单 icon 契约（批 14 统一样式：原型 .ctx .row 全行带 17px 图标）。最小化 = close
    //（x，与 tab ✕ 同语义——上方注释「最小化 = removeTabFromGroup」）；终止 = trash。
    {
      icon: <ShellIcon className="size-[17px]" name="close" />,
      label: t("workbench.tabMinimize"),
      onSelect: onMinimize,
    },
    ...(onKill
      ? [
          {
            icon: <ShellIcon className="size-[17px]" name="trash" />,
            label: t("workbench.tabKill"),
            onSelect: onKill,
            variant: "destructive" as const,
          },
        ]
      : []),
  ];
  return (
    <ActionMenu
      align="start"
      cancelLabel={t("cancel")}
      contextMenuPoint={anchor}
      items={items}
      onContextMenuClose={onClose}
      trigger={<button aria-hidden="true" className="hidden" tabIndex={-1} type="button" />}
    />
  );
}

type DropZoneOverlayProps = {
  activeZone: { targetGroupId: string | null; zone: DropZone } | null;
  dragPointer: { x: number; y: number };
  dragSourceRef: WorkbenchPanelRef | null;
  layout: WorkbenchLayoutV3;
  onCancel: () => void;
  onDrop: () => void;
  onPointerMove: (x: number, y: number) => void;
  onZoneChange: (zone: { targetGroupId: string | null; zone: DropZone } | null) => void;
  t: (key: TranslationKey) => string;
};

/**
 * 拖动态全屏 overlay（设计 §7.2）。自身 pointer-events:none 不拦截 elementFromPoint，下层
 * GroupCell（默认 pointer-events auto）正常命中。在 window pointermove 上 hit-test：
 * elementFromPoint → 找带 data-drop-group 的祖先 → deriveZone(group rect, pointer) → setActiveZone；
 * 同时调 onPointerMove 把指针位置回传给 InstanceArea 更新 dragState（ghost 跟随指针）。
 * pointerup 调 onDrop（dropIntoLeaf + 自动聚焦）。
 *
 * 空白区（layout.root === null）：elementFromPoint 命中 data-drop-empty 容器 → zone=center +
 * targetGroupId=null（dropIntoLeaf 开首个 leaf）。
 */
function DropZoneOverlay({
  activeZone,
  dragPointer,
  dragSourceRef,
  layout,
  onCancel,
  onDrop,
  onPointerMove,
  onZoneChange,
  t,
}: DropZoneOverlayProps) {
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const onWindowPointerMove = useCallback(
    (event: PointerEvent_Window) => {
      onPointerMove(event.clientX, event.clientY);
      // ghost 跟随指针走 ref 直写 transform，跳过 React state/render（否则每帧 setState 触发
      // 整棵 WorkbenchContent 重渲染，ghost 落后于鼠标产生脱离感）。
      const g = ghostRef.current;
      if (g) {
        g.style.transform = `translate3d(${event.clientX}px, ${event.clientY}px, 0) translate(-50%, -50%)`;
      }
      const el = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
      if (!el) {
        onZoneChange(null);
        return;
      }
      // 找带 data-drop-group 的祖先（group 单元格）或 data-drop-empty（空白区）。
      const groupEl = el.closest("[data-drop-group]") as HTMLElement | null;
      if (groupEl) {
        const targetGroupId = groupEl.getAttribute("data-drop-group") as string;
        const rect = groupEl.getBoundingClientRect();
        const zone = deriveZone(
          { width: rect.width, height: rect.height, left: rect.left, top: rect.top },
          event.clientX,
          event.clientY,
        );
        if (zone) {
          onZoneChange({ targetGroupId, zone });
        } else {
          onZoneChange(null);
        }
        return;
      }
      const emptyEl = el.closest("[data-drop-empty]") as HTMLElement | null;
      if (emptyEl) {
        onZoneChange({ targetGroupId: null, zone: "center" });
        return;
      }
      onZoneChange(null);
    },
    [onZoneChange, onPointerMove],
  );
  const onWindowPointerUp = useCallback(
    (event: PointerEvent_Window) => {
      // 仅左键释放才 drop（button=0）。pointercancel 直接取消。
      if (event.type === "pointercancel") {
        onCancel();
        return;
      }
      onDrop();
    },
    [onDrop, onCancel],
  );

  useEffect(() => {
    window.addEventListener("pointermove", onWindowPointerMove);
    window.addEventListener("pointerup", onWindowPointerUp);
    window.addEventListener("pointercancel", onWindowPointerUp);
    return () => {
      window.removeEventListener("pointermove", onWindowPointerMove);
      window.removeEventListener("pointerup", onWindowPointerUp);
      window.removeEventListener("pointercancel", onWindowPointerUp);
    };
  }, [onWindowPointerMove, onWindowPointerUp]);

  // Esc 中断拖放（VSCode/常见拖放交互：拖动中按 Esc 取消，松手不 drop）。
  // cancelDrag 清 dragState 后本 overlay 卸载、pointerup 监听随之移除，松手不再触发 onDrop。
  useEffect(() => {
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, [onCancel]);

  return (
    <div
      aria-label={t("workbench.dropZoneLabel")}
      className="pointer-events-none fixed inset-0 z-30"
    >
      {/* 空白区高亮（layout 空 + activeZone targetGroupId=null）*/}
      {layout.root === null && activeZone?.targetGroupId === null ? (
        <div
          role="status"
          aria-label={t("workbench.dropToEmpty")}
          className="absolute inset-2 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary/50 bg-primary/10 text-sm font-medium text-primary"
        >
          <span className="pointer-events-none">{t("workbench.dropToEmpty")}</span>
        </div>
      ) : null}
      {dragSourceRef ? (
        <DragGhost
          panelRef={dragSourceRef}
          ghostRef={ghostRef}
          initialPointer={dragPointer}
          t={t}
        />
      ) : null}
    </div>
  );
}

/** 拖动 ghost：跟随指针的小卡片（marker + 实例名），aria 标注拖动中。usePanelMeta 派生
 * 元数据（与 GroupHeader/InstanceCard 同源 query key，React Query dedupe 零额外网络）。
 * 位置由 DropZoneOverlay 经 ghostRef 直写 transform，不走 React state（每帧 setState 会让
 * ghost 落后于鼠标产生脱离感）。初始 transform 由 onCardDragStart 设一次。 */
function DragGhost({
  panelRef,
  ghostRef,
  initialPointer,
  t,
}: {
  panelRef: WorkbenchPanelRef;
  ghostRef: RefObject<HTMLDivElement | null>;
  initialPointer: { x: number; y: number };
  t: (key: TranslationKey) => string;
}) {
  const meta = usePanelMeta(panelRef);
  const label = panelTabLabel(panelRef, meta, t);
  return (
    <div
      ref={ghostRef}
      aria-label={t("workbench.dragging")}
      className="pointer-events-none fixed flex items-center gap-1.5 rounded-lg border border-primary/40 bg-surface-raised/90 px-3 py-2 text-xs font-medium text-on-surface shadow-lg backdrop-blur"
      style={{
        left: 0,
        top: 0,
        transform: `translate3d(${initialPointer.x}px, ${initialPointer.y}px, 0) translate(-50%, -50%)`,
        willChange: "transform",
      }}
    >
      {meta?.marker ?? null}
      <span>{label}</span>
    </div>
  );
}

// window PointerEvent 类型别名（与 React PointerEvent 区分，addEventListener 用原生）。
type PointerEvent_Window = globalThis.PointerEvent;
