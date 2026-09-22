import type { GitDiffScope } from "@agents-remote/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { type PointerEvent, type ReactNode, useCallback, useEffect, useState } from "react";
import {
  type DragSourceAdapter,
  InstanceArea,
  InstanceLeftOverview,
  useCloseSession,
  useCreateSession,
  useGlobalInstanceCandidates,
  useGlobalInstanceRefs,
  useProjectInstances,
  useRenameSession,
  useScopeInstanceOrder,
} from "../components/workbench/instance-area";
import { GlobalProjectsOverview } from "../components/workbench/global-projects-overview";
import { createTerminalSession } from "../api/client";
import { useWorkbenchShortcuts } from "../hooks/use-workbench-shortcuts";
import { ChatOverview } from "../components/workbench/chat-overview";
import { MobileWorkbench, SessionModeTabs } from "../components/workbench/mobile-workbench";
import { type WorkbenchTabPluginContext } from "../components/workbench/workbench-tab-plugin";
import { RightPanelTabs } from "../components/workbench/right-panel-tabs";
import { StatusBar } from "../components/workbench/status-bar";
import { SettingsMainPage } from "../components/shell/settings-dialog";
import { Sidebar } from "../components/shell/sidebar";
import { WorkbenchShell } from "../components/shell/workbench-shell";
import { ProjectLeftPanel } from "../components/workbench/project-left-panel";
import { ProjectSwitcher } from "../components/workbench/project-switcher";
import { GlobalFilesOverview } from "../components/files/global-files-overview";
import { MobileMcpDetail } from "../components/workbench/mobile-plugins-detail";
import { PluginsPanel, SkillTabPreview } from "./PluginsRoute";
import { useT } from "../i18n";
import {
  type DropZone,
  type WorkbenchMiddleTab,
  type WorkbenchPanelRef,
  type WorkbenchInspectionTab,
  type WorkbenchMode,
  type WorkbenchScope,
  activeTabRefLeaf,
  collectLeaves,
  dropIntoLeaf,
  ensureTabOpenLeaf,
  findLeafBySessionId,
  findTabRefLeaf,
  inferSessionTypeFromId,
  parseFileTabId,
  parseGitTabId,
  parseSkillTabId,
  removeTabFromLeaf,
  resizeSplitChildren,
  setActiveTabInLeaf,
  stickyWorkbenchSearch,
  splitFilePath,
  toggleLeafMaximize,
  useIsDesktopViewport,
  useWorkbenchLayout,
  useWorkbenchNavigate,
  useWorkbenchRouteContext,
  workbenchFilesSearchFocusRequestAtom,
  workbenchMiddleLeftWidthAtom,
  workbenchLastProjectAtom,
  workbenchMiddleTabAtom,
  workbenchRightCollapsedAtom,
} from "./workbench-model";

/**
 * workbench 共享 pathless layout 组件（设计 workbench-stable-refactor.md Phase 1）。7 个 workbench
 * 子路由塌缩为本 layout 的子，**本组件常驻不卸载**——进出项目只 swap 子路由匹配，layout 不
 * unmount → InstanceArea/WorkspaceTree/PanelRouter 实例保活 → WebSocket/relay/xterm 长连不重连
 *（用户诉求"中栏还是同一个，而不是看起来一样"）。
 *
 * scope/focusId/rightTab/tab 从 `useWorkbenchRouteContext()` 派生——单一数据管道，source of
 * truth = URL（useMatches 末位 leaf match，不引入持久化 atom，无子 render 写/父读时序问题）。
 * 子路由不设 component，只负责 URL 匹配 + validateSearch；本 layout 渲染全部中栏内容（不渲染
 * `<Outlet/>`——子路由无需渲染任何东西，其 params/search 经 useMatches 读得）。
 *
 * 由 router.tsx `workbenchLayoutRoute` lazy 挂载（export name = "WorkbenchLayoutShell"）。
 */
export function WorkbenchLayoutShell() {
  const ctx = useWorkbenchRouteContext();
  return (
    <WorkbenchContent
      focusId={ctx.focusId}
      leftMode={ctx.leftMode}
      mode={ctx.mode}
      pluginName={ctx.pluginName}
      pluginView={ctx.pluginView}
      rightTab={ctx.rightTab}
      scope={ctx.scope}
      tab={ctx.tab}
    />
  );
}

function WorkbenchContent({
  focusId,
  rightTab,
  scope,
  tab: tabFromUrl,
  leftMode = "auto",
  pluginName,
  pluginView,
  mode = "agent",
}: {
  focusId?: string;
  rightTab?: WorkbenchInspectionTab;
  scope: WorkbenchScope;
  tab?: WorkbenchMiddleTab;
  // 左栏模式（设计 workbench-stable-refactor Phase 2，leftMode 粘性化）：project scope 恒走
  // ProjectLeftPanel（无视 leftMode）；global scope 下 leftMode="files" → GlobalFilesOverview
  //（全局 rootBrowse），leftMode="plugins" → PluginsPanel（插件管理：skill + mcp），leftMode="auto" →
  // ProjectLeftPanel(global overview=GlobalProjectsOverview)。leftMode 是 URL search 维度
  //（见 workbench-model.ts deriveWorkbenchRouteContext），由各 navigate 粘性透传——活动栏入口
  // 强制，中栏 tab focus 透传不改（VSCode 式）。
  leftMode?: "auto" | "files" | "plugins" | "settings";
  // 插件深度页维度（v2 M6，redesign-v2.md §3.5）：/plugins/market、/plugins/sources、
  // /plugins/skill/$、/plugins/mcp/$ 派生非 home 值，移动端 MobileWorkbench 与桌面 mainPage
  // 分流渲染；无 focusId（不进保活 tab 体系）。skill/mcp 配套 pluginName（详情条目名）。
  pluginView?: "home" | "market" | "sources" | "skill" | "mcp";
  // 插件深度页条目名（第八轮）：pluginView="skill"/"mcp" 时为 skill/server 名。
  pluginName?: string;
  // 一级会话页模式（设计 workbench-views.md §3.1）：agent = 现有三栏会话网格；chat = 全局
  // 会话列表（不绑项目，pi SDK 嵌入，Phase 1 列表 CRUD + 占位 detail）。URL `?mode=` 维度，
  // 默认 agent。仅 global scope 一级会话页有意义。
  mode?: WorkbenchMode;
}) {
  const { t } = useT();
  const isDesktop = useIsDesktopViewport();
  const navigateWorkbench = useWorkbenchNavigate();
  const navigate = useNavigate();
  // D4「直达上次位置」：进入 project scope 即记忆 key，`/`（工作台 Tab）据此恢复。
  const [, setLastProjectKey] = useAtom(workbenchLastProjectAtom);
  useEffect(() => {
    if (scope.kind === "project") setLastProjectKey(scope.key);
  }, [scope, setLastProjectKey]);
  // project scope 左栏 header 返回入口（回 /projects 全局项目列表）。粘性透传 search（含
  // mode）——用户离开会话页时的模式在返回后保持。
  const backToProjects = () =>
    void navigateWorkbench(
      { kind: "global" },
      undefined,
      stickyWorkbenchSearch({
        rightTab,
        tab: tabFromUrl,
        leftMode,
        mode,
      }),
    );
  const [rememberedMiddleTab, setRememberedMiddleTab] = useAtom(workbenchMiddleTabAtom);
  // 右栏折叠态与 WorkbenchShell 内 useAtom 共享同一 atom（Jotai 全局）—— 本组件只读，
  // 写入由 WorkbenchShell（RailButton 唤出 / onCollapse 收起）负责。纯手动控制，持久化到
  // localStorage，focusId 变化不覆盖。
  const rightCollapsed = useAtomValue(workbenchRightCollapsedAtom);
  const tab = tabFromUrl ?? rememberedMiddleTab;
  const ctx: WorkbenchTabPluginContext = {
    projectKey: scope.kind === "project" ? scope.key : null,
    focusId,
    sessionType: focusId ? inferSessionTypeFromId(focusId) : undefined,
  };
  // 两个 navigate 都传完整 { tab, rightTab }（URL 原始值 tabFromUrl/rightTab 合并 + 新值）。
  // TanStack Router navigate 整体替换 search 对象（非 merge），若只传单键会丢失其他维 ——
  // 违反设计 §13「tab/rightTab 正交」。用 URL 原始值（而非解析值）合并。
  const onRightTabChange = (rightTabNext: WorkbenchInspectionTab) => {
    void navigateWorkbench(
      scope,
      focusId,
      stickyWorkbenchSearch({ rightTab: rightTabNext, tab: tabFromUrl, leftMode, mode }),
    );
  };
  const onTabChange = (next: WorkbenchMiddleTab) => {
    setRememberedMiddleTab(next);
    void navigateWorkbench(
      scope,
      focusId,
      stickyWorkbenchSearch({ rightTab, tab: next, leftMode, mode }),
    );
  };
  // 工具 ticon 打开/退出（移动 row2 ticon，M10 用户反馈）：打开工具 ≠ 选 tab——不写
  // rememberedMiddleTab（它的语义 = 用户最后一次主动选的非工具 tab），URL ?tab 进工具值；
  // 退出（null）= URL 去 tab 维度，tab = tabFromUrl ?? rememberedMiddleTab 解析回退到
  // 进工具前的 tab，不再恒回第一个 overview。桌面左栏 middle tab 仍走 onTabChange 照旧。
  const onToolTabChange = (next: WorkbenchMiddleTab | null) => {
    void navigateWorkbench(
      scope,
      focusId,
      next === null
        ? stickyWorkbenchSearch({ rightTab, leftMode, mode })
        : stickyWorkbenchSearch({ rightTab, tab: next, leftMode, mode }),
    );
  };
  // 右栏可见性纯手动：用户折叠/展开持久化到 atom（localStorage），focusId 变化不再覆盖。
  // 中栏边缘 RailButton 唤出，RightPanelTabs onCollapse 收起。旧实现 setRightCollapsed(!focusId)
  // 会在聚焦任何 tab（含 file/git）时强制展开，冲掉用户手动折叠态——违背「保持折叠」。
  // 仅桌面端有右栏；移动端 MobileWorkbench 不读 rightCollapsed atom。

  // Phase 2a 左栏宽度归并一次性迁移：workbenchLeftWidth → workbenchMiddleLeftWidth。
  // 仅在目标 key 缺失（用户未调过新 key）且源 key 存在时迁移，保用户已调左栏宽度不丢。
  // 用 setMiddleLeftWidth 写 atom（同步更新 state + localStorage + 本次会话即生效，
  // WorkbenchShell 读到新值重渲染），而非裸 setItem（atom 已在首 render 用默认 16rem 初始化）。
  const [, setMiddleLeftWidth] = useAtom(workbenchMiddleLeftWidthAtom);
  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    if (localStorage.getItem("workbenchMiddleLeftWidth")) return;
    const legacy = localStorage.getItem("workbenchLeftWidth");
    if (!legacy) return;
    try {
      const value = Number(JSON.parse(legacy));
      if (Number.isFinite(value)) setMiddleLeftWidth(value);
    } catch {
      /* 旧值非合法 JSON 数值，忽略 → 保持默认 16rem */
    }
  }, [setMiddleLeftWidth]);

  // ── Phase 2a：原 InstanceArea 共享 state 提升到 WorkbenchContent（方案 X）──────────
  // 左总览（InstanceLeftOverview，拖放源）+ 右工作区（InstanceArea，拖放目标）互补消费，
  // 共享 state 单一来源在此。holders（close/rename/create prompt）由本组件 return 渲染。
  const { close, holder: closeHolder } = useCloseSession();
  const { rename, holder: renameHolder } = useRenameSession();
  const [layout, update] = useWorkbenchLayout();
  const queryClient = useQueryClient();
  const { candidates } = useGlobalInstanceCandidates(scope);
  const create = useCreateSession(ctx.projectKey);
  const projectInstances = useProjectInstances(ctx.projectKey);
  const scopeKey = scope.kind === "project" ? scope.key : "global";
  const { refs, isLoaded: refsLoaded } = useScopeInstanceOrder(scope);
  // 全局 refs（桌面 fan-out 所有项目）：prune effect 桌面分支用（2a，为单一 layout 跨项目 tab 铺路）。
  const { refs: globalRefs, isLoaded: globalRefsLoaded } = useGlobalInstanceRefs();

  // focus → 活动 leaf tab（设计 §7.1/§13）：URL focusId 变化时确保 focusId 在某 leaf 的 tab 中。
  // file focus（focusId 形如 file_demo/src/index.ts，path=全路径含项目名前缀）与 session focus 分流：
  // file ref 直接从 parseFileTabId 逆解全路径，开 {kind:"file", path:全路径} tab（**无 scope gate**
  //——全局文件 tab 也开，设计 workbench-stable-refactor Phase 3；FileTabPreview 内部 resolveRootBrowseTarget
  // 解析项目名走现有 project preview API）。git 仍 gate project scope（git 是项目内概念，不统一）。
  useEffect(() => {
    if (!focusId) return;
    // M4 L3 详情页（03t/03v/03u/03s）是**不写 layout 的显式子路由**：githistory/gitbranches 为
    // 字面量 focusId，gitcommit_/wiki_ 由子路由 _splat 派生。这些 focusId 不开 tab（渲染层在
    // MobileWorkbench 按 focusId 直渲 L3 组件），在此提前 return 防止落入 default 分支被误开成
    // session tab（未匹配 projectName 的兜底会开 session tab → 无效 tab 进保活层）。
    if (
      focusId === "githistory" ||
      focusId === "gitbranches" ||
      focusId.startsWith("gitcommit_") ||
      focusId.startsWith("wiki_")
    ) {
      return;
    }
    update((prev) => {
      const found = findLeafBySessionId(prev, focusId);
      if (found) return setActiveTabInLeaf(prev, found.leafId, focusId);
      const filePath = parseFileTabId(focusId);
      if (filePath !== null) {
        return ensureTabOpenLeaf(prev, { kind: "file", path: filePath });
      }
      const skillName = parseSkillTabId(focusId);
      if (skillName !== null) {
        return ensureTabOpenLeaf(prev, { kind: "skill", name: skillName });
      }
      const gitParsed = parseGitTabId(focusId);
      if (gitParsed !== null) {
        if (scope.kind !== "project") return prev;
        if (gitParsed.mode === "compare") {
          return ensureTabOpenLeaf(prev, {
            kind: "git",
            mode: "compare",
            path: gitParsed.path,
            projectName: scope.key,
            base: gitParsed.base,
            compare: gitParsed.compare,
          });
        }
        return ensureTabOpenLeaf(prev, {
          kind: "git",
          mode: "scope",
          path: gitParsed.path,
          projectName: scope.key,
          scope: gitParsed.scope,
        });
      }
      // chat 会话是 global（无 projectName），focusId=`chat_${uuid}` 前缀互斥。必须在
      // projectName 解析前判定——session focus 的 `!projectName → return prev` 会拦掉 chat。
      if (focusId.startsWith("chat_")) {
        return ensureTabOpenLeaf(prev, { kind: "chat", sessionId: focusId });
      }
      const projectName =
        scope.kind === "project"
          ? scope.key
          : (refs.find((r) => r.sessionId === focusId)?.projectName ?? null);
      if (!projectName) return prev;
      return ensureTabOpenLeaf(prev, { kind: "session", projectName, sessionId: focusId });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, scopeKey, refs.length]);

  // stale-tab prune（设计 §7.1）：kill session 后该 session 的 tab 不会自动从 layout 消失。
  // refsLoaded gate 防刷新后 refs 还空把全部持久化 tab 误判 stale 清光。
  useEffect(() => {
    if (layout.root === null) return;
    // 桌面用全局 refs（单一 layout 跨项目 tab 共存，2a 铺路 / 2b 单一化）；移动端用 scope refs。
    const pruneRefs = isDesktop ? globalRefs : refs;
    const pruneLoaded = isDesktop ? globalRefsLoaded : refsLoaded;
    if (!pruneLoaded) return;
    const activeIds = new Set(pruneRefs.map((r) => r.sessionId));
    const stale: { leafId: string; tabId: string }[] = [];
    for (const leaf of collectLeaves(layout.root)) {
      for (const t of leaf.tabs) {
        // file/git tab 不参与 stale prune（无生命周期，刷新保留，设计 §6 决策 19 / 阶段 3）；
        // session tab 用 sessionId 判定。chat 会话列表独立管理，无 globalRefs 对应，同样跳过
        // ——否则刷新后 chat tab 被误判 stale 清光（关会话后的残留 tab 由用户关 tab 处理，与
        // agent/terminal 同语义）。render tab 瞬态（normalizeRef 恢复时已剔除，运行期不可能
        // 出现在 layout 之外的位置），同跳过防御。
        if (
          t.kind === "file" ||
          t.kind === "git" ||
          t.kind === "skill" ||
          t.kind === "chat" ||
          t.kind === "render"
        )
          continue;
        // 当前聚焦 session tab 不 prune：create/resume navigate 先行时 globalRefs（overview）
        // 尚未追上新 session，focus effect 刚开的 tab 会被误判 stale 删掉。focusId 是「用户正在看」
        // 的语义边界——它在 refs 之外只是暂态（overview 后台刷新会追上），不该据此清 tab。
        if (t.sessionId === focusId) continue;
        if (!activeIds.has(t.sessionId)) stale.push({ leafId: leaf.id, tabId: t.sessionId });
      }
    }
    if (stale.length === 0) return;
    let next = layout;
    for (const { leafId, tabId } of stale) {
      next = removeTabFromLeaf(next, leafId, tabId);
    }
    if (next === layout) return;
    update(() => next);
    if (focusId && stale.some((s) => s.tabId === focusId)) {
      // 与 onCloseTab 同：切 focus 时保持当前 scope，不用 next tab 的 projectName 重写左栏。
      const active = activeTabRefLeaf(next);
      const search = {
        rightTab,
        tab: tabFromUrl,
        ...(leftMode !== "auto" ? { leftMode } : {}),
      };
      if (active?.kind === "session") {
        void navigateWorkbench(scope, active.sessionId, search);
      } else {
        void navigateWorkbench(scope, undefined, search);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, focusId, layout, isDesktop, refs, refsLoaded, globalRefs, globalRefsLoaded]);

  // grid 回调用 projectName 解析：global scope 从 candidates 查（与 InstanceLeftOverview
  // 同源），project scope = scope.key。
  const resolveProjectName = (sessionId: string): string =>
    scope.kind === "project"
      ? scope.key
      : (candidates.find((c) => c.ref.sessionId === sessionId)?.ref.projectName ?? "");
  // 单一 layout（VSCode 式，阶段 2b）：session tab 跨项目共存于中栏。聚焦 session 的 URL 必须
  // 用 session 自身 projectName 构造（project scope），而非当前 scope.key —— 否则点项目 B 的 tab
  // 在项目 A scope 下生成错乱 URL（/projects/A/session/B-id），focus effect 在错误 scope 找不到它。
  // global scope 保持 global focus URL（/projects/session/$id，focus effect 从 global refs 解析 projectName）。
  const navigateSession = useCallback(
    (ref: WorkbenchPanelRef) => {
      if (ref.kind !== "session") return;
      const navScope: WorkbenchScope =
        scope.kind === "project" ? { kind: "project", key: ref.projectName } : scope;
      // 粘性透传全部正交 search 维（rightTab/tab/leftMode/mode，stickyWorkbenchSearch 统一
      // 合并）——navigateWorkbench 整体替换 search 对象，漏带任一维即从 URL 丢状态（mode 曾
      // 因手抄合并漏掉，点中栏 tab 后 chat 模式丢失、左栏语境被打掉）。
      void navigateWorkbench(
        navScope,
        ref.sessionId,
        stickyWorkbenchSearch({ rightTab, tab: tabFromUrl, leftMode, mode }),
      );
    },
    [navigateWorkbench, scope, rightTab, tabFromUrl, leftMode, mode],
  );
  const focusPanel = useCallback(
    (ref: WorkbenchPanelRef) => {
      // file tab 的 focus 由 Step 7 file 路由处理；此处只处理 session tab。
      if (ref.kind !== "session") return;
      if (ref.sessionId === focusId) return;
      navigateSession(ref);
    },
    [focusId, navigateSession],
  );
  const focusInstance = useCallback(
    (sessionId: string) => {
      const projectName = resolveProjectName(sessionId);
      if (!projectName) return;
      focusPanel({ kind: "session", projectName, sessionId });
    },
    // resolveProjectName 闭包依赖 scope/candidates，已被 deps 覆盖。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scope, candidates, focusPanel],
  );
  const renameInstance = useCallback(
    (sessionId: string, type: "agent" | "terminal", currentName: string, projectName: string) => {
      if (!projectName) return;
      void rename({ kind: "session", projectName, sessionId }, type, currentName);
    },
    [rename],
  );

  const onToggleMaximize = useCallback(
    (groupId: string) => {
      update((prev) => toggleLeafMaximize(prev, groupId));
    },
    [update],
  );
  const onResizeSplit = useCallback(
    (splitId: string, leftChildId: string, rightChildId: string, deltaFlex: number) => {
      update((prev) => resizeSplitChildren(prev, splitId, leftChildId, rightChildId, deltaFlex));
    },
    [update],
  );
  // 分屏按钮（§6.10-3）：一键「分屏并新建终端窗格」（05 原型分屏产物 = pterm）。不走
  // useCreateSession——分屏需要先拿 ref 做布局 split。顺序敏感（对齐 useCreateSession 的
  // 「await navigate 先行」时序）：await navigateWorkbench 让 URL focusId 先生效 → prune
  // effect 的 focusId 保护覆盖新终端 tab（refs 尚未收录它），再 update(dropIntoLeaf
  // zone=right，复用拖放分屏完整语义：预处理/split/激活/退出最大化)。invalidate 与
  // useCreateSession 同 keys（列表自愈）。失败静默（与 useCreateSession 同纪律）。
  const onSplitLeaf = useCallback(
    async (leafId: string) => {
      if (scope.kind !== "project") return;
      try {
        const data = await createTerminalSession(scope.key);
        const ref: WorkbenchPanelRef = {
          kind: "session",
          projectName: scope.key,
          sessionId: data.session.id,
        };
        await navigateWorkbench(
          scope,
          ref.sessionId,
          stickyWorkbenchSearch({ rightTab, tab: tabFromUrl, leftMode, mode }),
        );
        update((prev) => dropIntoLeaf(prev, ref, leafId, "right"));
        void queryClient.invalidateQueries({ queryKey: ["projects", scope.key] });
        void queryClient.invalidateQueries({ queryKey: ["overview"] });
      } catch {
        // 创建失败：UI 不额外提示。
      }
    },
    // 闭包依赖（rightTab/tabFromUrl/leftMode/mode）已被 deps 覆盖：stickyWorkbenchSearch
    // 必须带回当前 search 值，deps 缺失会把旧值回写 URL（切右栏 tab 后立即分屏的窗口）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scope, update, queryClient, rightTab, tabFromUrl, leftMode, mode],
  );
  // file tab focus URL（设计 §6 决策 2 / workbench-stable-refactor Phase 3）：
  // - 项目文件（projectName === scope.key，scope=project）→ /projects/$key/file/$，splat=项目相对路径
  //   （保持在项目 URL，key=项目名，focus effect 拼全路径 tabId）。
  // - 全局/跨项目文件（scope=global 或 projectName≠scope.key）→ /files/file/$，splat=全路径
  //   （含项目名前缀，focus effect 直接 file_${fullPath}）。全局/项目点同一文件 → 同一 tabId 去重。
  // search 传 URL 原始值（rightTab/tab/view，与 navigateWorkbench 同模式，避免把 atom 回退值写进 URL）。
  // 桌面 main 整页态（09m/10m，§6.10-9）：global scope + leftMode≠auto。内容行点击（file/skill/
  // mcp）= 跳回工作台开 tab，navigate sticky search 据此把 leftMode 重置 auto（见各 navigate）。
  // mainPage 激活判定必须**正面枚举**（leftMode 可选，undefined 语义 = auto；若写
  // `leftMode !== "auto"` 则 undefined 也判真——窄态被误判成 mainPage）。focusId 优先于
  // mainPage：中栏 tab focus（/files/file/$ 等继承 leftMode 透传）必须回工作台渲染 tab。
  const mainPageActive =
    scope.kind === "global" &&
    !focusId &&
    (leftMode === "files" || leftMode === "plugins" || leftMode === "settings");
  const navigateToFile = useCallback(
    (projectName: string, path: string) => {
      const fullPath = `${projectName}/${path}`;
      if (scope.kind === "project" && projectName === scope.key) {
        void navigate({
          to: "/projects/$key/file/$",
          params: { key: projectName, _splat: path },
          search: stickyWorkbenchSearch({ rightTab, tab: tabFromUrl, leftMode, mode }),
        });
        return;
      }
      void navigate({
        to: "/files/file/$",
        params: { _splat: fullPath },
        // mainPage 态（09m/10m 整页）点文件 = 跳回工作台看 tab：leftMode 重置 auto 退出整页
        //（sticky 只在非 mainPage 态保留——工作台内 tab 切换不改左栏的原语义不变）。
        search: stickyWorkbenchSearch({
          leftMode: mainPageActive ? "auto" : leftMode,
          rightTab,
          tab: tabFromUrl,
          mode,
        }),
      });
    },
    [navigate, scope, rightTab, tabFromUrl, leftMode, mode, mainPageActive],
  );
  // 左栏文件树点文件 → 中栏开/激活 file tab + focus 到该文件（设计 §6 决策 16）。file ref 用全路径
  //（kind:"file", path=全路径，无 projectName 字段），全局/项目点同一文件复用同一 tab。复用已测纯函数
  // ensureTabOpenLeaf（已在→激活 / 不在→加到活动 leaf / 无活动→新建首 leaf 三态，file ref 成立）。
  const onOpenFile = useCallback(
    (projectName: string, path: string) => {
      const fullPath = `${projectName}/${path}`;
      update((prev) => ensureTabOpenLeaf(prev, { kind: "file", path: fullPath }));
      void navigateToFile(projectName, path);
    },
    [update, navigateToFile],
  );
  // git diff tab focus URL = /projects/$key/git/$ splat + ?gitScope search（设计 workbench-layout-fix
  // 阶段 3）。scope 走 search param（splat 不便编码 staged/worktree），与 tabIdOf 的 `git_${scope}/${path}` 一致。
  const navigateToGitFile = useCallback(
    (projectName: string, scope: GitDiffScope, path: string) => {
      void navigate({
        to: "/projects/$key/git/$",
        params: { key: projectName, _splat: path },
        // gitScope 是路由特定维度，在 sticky 基础上追加。
        search: {
          ...stickyWorkbenchSearch({ rightTab, tab: tabFromUrl, leftMode, mode }),
          gitScope: scope,
        },
      });
    },
    [navigate, rightTab, tabFromUrl, leftMode, mode],
  );
  // compare 模式 git tab focus URL：与 navigateToGitFile 同路由（/projects/$key/git/$），
  // search 用 gitCompare（编码 `${base}~${compare}`）替代 gitScope，两者互斥。
  // focusId=`gitcmp_${gitCompare}/${path}` 由 deriveWorkbenchRouteContext git case 解析。
  const navigateToGitCompareFile = useCallback(
    (projectName: string, base: string, compare: string, path: string) => {
      void navigate({
        to: "/projects/$key/git/$",
        params: { key: projectName, _splat: path },
        search: {
          ...stickyWorkbenchSearch({ rightTab, tab: tabFromUrl, leftMode, mode }),
          gitCompare: `${base}~${compare}`,
        },
      });
    },
    [navigate, rightTab, tabFromUrl, leftMode, mode],
  );
  // 左栏 git 变更列表点文件 → 中栏开/激活 git diff tab + focus（设计 workbench-layout-fix 阶段 3）。
  const onOpenGitFile = useCallback(
    (projectName: string, scope: GitDiffScope, path: string) => {
      update((prev) =>
        ensureTabOpenLeaf(prev, { kind: "git", mode: "scope", projectName, scope, path }),
      );
      void navigateToGitFile(projectName, scope, path);
    },
    [update, navigateToGitFile],
  );
  // 分支视图双选 compare 文件 → 中栏开/激活 git diff tab（compare 模式）+ focus。
  const onOpenGitCompareFile = useCallback(
    (projectName: string, base: string, compare: string, path: string) => {
      update((prev) =>
        ensureTabOpenLeaf(prev, { kind: "git", mode: "compare", projectName, base, compare, path }),
      );
      void navigateToGitCompareFile(projectName, base, compare, path);
    },
    [update, navigateToGitCompareFile],
  );
  // skill tab focus URL（对标 navigateToFile 的 project/global 分流，2026-08-16 scope-aware 化）：
  // - 项目 scope → /projects/$key/skill/$（skill 停在项目内，与 file/git 同语义；focus effect 全局
  //   处理 skill tab，无 scope gate）。
  // - 全局/其他 → /plugins/skill/$（skill 的 global 规范 URL，leftMode 继承 ?leftMode 透传——从
  //   /plugins 进来=plugins 保插件管理左栏，中栏 tab 切换不改左栏，VSCode 式）。
  const navigateToSkill = useCallback(
    (name: string) => {
      if (scope.kind === "project") {
        void navigate({
          to: "/projects/$key/skill/$",
          params: { key: scope.key, _splat: name },
          search: stickyWorkbenchSearch({ rightTab, tab: tabFromUrl, leftMode, mode }),
        });
        return;
      }
      void navigate({
        to: "/plugins/skill/$",
        params: { _splat: name },
        // mainPage 态同 navigateToFile：leftMode 重置 auto，退出插件整页进工作台看 tab。
        search: stickyWorkbenchSearch({
          leftMode: mainPageActive ? "auto" : leftMode,
          rightTab,
          tab: tabFromUrl,
          mode,
        }),
      });
    },
    [navigate, scope, rightTab, tabFromUrl, leftMode, mode, mainPageActive],
  );
  // Manage tab 点已装 skill 行 → 导航到详情 URL（第八轮：全局入口不再 ensureTabOpenLeaf 写
  // layout——/plugins/skill/$ 已 pluginView 化为深度页；project scope 仍走 focusId 开 tab 带）。
  const onOpenSkill = useCallback(
    (name: string) => {
      void navigateToSkill(name);
    },
    [navigateToSkill],
  );
  // MCP 详情深度页 URL（v2 M6 13 桌面入口；第八轮 pluginView 化，不写 layout）。
  const onOpenMcp = useCallback(
    (name: string) => {
      void navigate({
        to: "/plugins/mcp/$",
        params: { _splat: name },
        search: stickyWorkbenchSearch({
          leftMode: mainPageActive ? "auto" : leftMode,
          rightTab,
          tab: tabFromUrl,
          mode,
        }),
      });
    },
    [navigate, rightTab, tabFromUrl, leftMode, mode, mainPageActive],
  );
  // tab ✕ = 最小化（设计 §7.2）：removeTabFromLeaf 从 leaf 移除 tab，session 存活；file tab
  // 移除（file 无生命周期，✕ 即从布局消失）。focusId 被关后回退到新 active tab 的 focus URL。
  //
  // 关键：切 focus 时**保持当前 scope / leftMode / middle tab**——左栏与中栏 tab 正交，关 tab
  // 不应改左栏。旧实现走 navigateSession(next) 会用 next.projectName 重写 scope，跨项目 tab
  // 场景下左栏跟着跳项目。session 一律 navigateWorkbench(当前 scope, nextId)；file/git 仅当
  // 属于当前 project scope 时走对应 URL，否则只清 focus 保 scope（中栏靠 layout.activeTabId
  // 显示，不把 scope 拽去 next tab 的项目 /global）。
  const onCloseTab = useCallback(
    (groupId: string, tabId: string) => {
      const next = removeTabFromLeaf(layout, groupId, tabId);
      update(() => next);
      if (focusId !== tabId) return;
      const active = activeTabRefLeaf(next);
      const search = stickyWorkbenchSearch({ rightTab, tab: tabFromUrl, leftMode, mode });
      if (!active) {
        // 无剩余 tab：清 focus，保 scope（避免 focus effect 把刚关的 tab 再 ensure 回来）。
        void navigateWorkbench(scope, undefined, search);
        return;
      }
      if (active.kind === "session") {
        void navigateWorkbench(scope, active.sessionId, search);
        return;
      }
      if (active.kind === "chat") {
        // chat 是 global 会话（无 projectName），focus URL 用 sessionId 即可——focus effect
        // 据此重开 chat tab；保当前 scope（chat 无处改写左栏，与 skill 分支同模式）。
        void navigateWorkbench(scope, active.sessionId, search);
        return;
      }
      if (active.kind === "file") {
        const { projectName, path } = splitFilePath(active.path);
        // 同 scope 才走 file URL；跨项目 file 无法在当前 project URL 下表达，清 focus 保 scope。
        if (scope.kind === "global" || (scope.kind === "project" && projectName === scope.key)) {
          void navigateToFile(projectName, path);
        } else {
          void navigateWorkbench(scope, undefined, search);
        }
        return;
      }
      if (active.kind === "git") {
        if (scope.kind === "project" && active.projectName === scope.key) {
          if (active.mode === "compare") {
            void navigateToGitCompareFile(
              active.projectName,
              active.base,
              active.compare,
              active.path,
            );
          } else {
            void navigateToGitFile(active.projectName, active.scope, active.path);
          }
        } else {
          void navigateWorkbench(scope, undefined, search);
        }
        return;
      }
      if (active.kind === "skill") {
        // skill URL 固定 global（/plugins/skill/$）；仅当前已是 global 才导航，否则保 project scope。
        if (scope.kind === "global") void navigateToSkill(active.name);
        else void navigateWorkbench(scope, undefined, search);
        return;
      }
      if (active.kind === "render") {
        // render tab 无 URL 语义（瞬态、内容内存 atom）：清 focus 保 scope，避免 focus effect
        // 把旧 session tab 又 ensure 回来抢占活动位。
        void navigateWorkbench(scope, undefined, search);
      }
    },
    [
      layout,
      update,
      focusId,
      navigateWorkbench,
      navigateToFile,
      navigateToGitFile,
      navigateToGitCompareFile,
      navigateToSkill,
      scope,
      rightTab,
      tabFromUrl,
      leftMode,
    ],
  );
  // 关实例 = close session API + 从中栏删 tab（与 onCloseTab 对称：onCloseTab 删 tab 不关
  // session；closeInstance 两者都做，修复「关实例后 tab 残留成空白」）。onAfterClose 在用户
  // 确认 + API 完成后触发——取消确认框则 session 存活、不删 tab（语义一致）。复用 onCloseTab
  // 封装的删 tab + focusId 导航到新 active。located 取调用时快照；API 期间 layout 若变，
  // removeTabFromLeaf 的 containsId 守护使其 no-op（安全），残留由 stale-tab prune 兜底。
  const closeInstance = useCallback(
    (sessionId: string, type: "agent" | "terminal") => {
      const projectName = resolveProjectName(sessionId);
      if (!projectName) return;
      const located = findLeafBySessionId(layout, sessionId);
      void close(
        { kind: "session", projectName, sessionId },
        type,
        located ? () => onCloseTab(located.leafId, sessionId) : undefined,
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scope, candidates, close, layout, onCloseTab],
  );
  const onSelectTab = useCallback(
    (groupId: string, tabId: string) => {
      update((prev) => setActiveTabInLeaf(prev, groupId, tabId));
      // 单一 layout（阶段 2b）：tab 可能跨项目。从 layout 查 ref 构造 focus URL（session→
      // navigateSession / file→navigateToFile / git→navigateToGitFile），避免 scope.key 与 tab 项目
      // 不一致时 URL 错乱（/projects/A/session/B-id）。file ref path=全路径，navigateToFile 内部按
      // scope + projectName 分流项目/全局 URL。tabId === focusId 不重复导航。
      // ref 查不到（layout 尚未更新）保守不导航，等 layout 同步后由 focus effect 兜底。
      if (tabId === focusId) return;
      const ref = findTabRefLeaf(layout, tabId);
      if (ref?.kind === "file") {
        const { projectName, path } = splitFilePath(ref.path);
        void navigateToFile(projectName, path);
        return;
      }
      if (ref?.kind === "git") {
        if (ref.mode === "compare")
          void navigateToGitCompareFile(ref.projectName, ref.base, ref.compare, ref.path);
        else void navigateToGitFile(ref.projectName, ref.scope, ref.path);
        return;
      }
      if (ref?.kind === "skill") {
        void navigateToSkill(ref.name);
        return;
      }
      if (ref?.kind === "chat") {
        // chat 是 global 会话（无 projectName）：保 scope，focus URL=sessionId（focus effect 据此重开）。
        navigateWorkbench(
          scope,
          ref.sessionId,
          stickyWorkbenchSearch({ rightTab, tab: tabFromUrl, leftMode, mode }),
        );
        return;
      }
      if (ref?.kind === "render") {
        // render tab 无 URL 语义：清 focus 保 scope（与 onCloseTab render 分支同模式）。
        void navigateWorkbench(
          scope,
          undefined,
          stickyWorkbenchSearch({ rightTab, tab: tabFromUrl, leftMode, mode }),
        );
        return;
      }
      if (ref) navigateSession(ref);
    },
    [
      update,
      focusId,
      layout,
      scope,
      navigateWorkbench,
      rightTab,
      tabFromUrl,
      leftMode,
      mode,
      navigateToFile,
      navigateToGitFile,
      navigateToGitCompareFile,
      navigateToSkill,
      navigateSession,
    ],
  );

  // 桌面快捷键（spec §10.2）：⌘N/⌘1..9/⌘\/⌘R（⌘F 随批次 d 10m 接线，Esc 交 Radix）。
  const setFilesSearchFocusRequest = useSetAtom(workbenchFilesSearchFocusRequestAtom);
  useWorkbenchShortcuts({
    focusId: focusId ?? null,
    onSplit: onSplitLeaf,
    onSelectTab,
    scopeKind: scope.kind,
    // ⌘F 只在全局文件整页态绑（10m pin④「聚焦搜索框」；其他态不劫持浏览器查找）。
    onFocusFilesSearch:
      mainPageActive && leftMode === "files"
        ? () => setFilesSearchFocusRequest((v) => v + 1)
        : undefined,
  });

  // ── Phase B 拖放分屏（设计 §7.2/§7.4）──────────────────────────────────────────
  // dragState = 拖动源 ref + 起始/当前 pointer；activeZone = elementFromPoint hit-test 结果。
  // 源（InstanceLeftOverview 卡片 + InstanceArea tab）共享 onCardDragStart 单一实例；目标
  //（InstanceArea DropZoneOverlay）消费 activeZone/onDrop/cancelDrag。
  const [dragState, setDragState] = useState<{
    ref: WorkbenchPanelRef;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);
  const [activeZone, setActiveZone] = useState<{
    targetGroupId: string | null;
    zone: DropZone;
  } | null>(null);
  const draggingRef = dragState?.ref ?? null;
  const onDrop = useCallback(() => {
    const drag = dragState;
    const zone = activeZone;
    setDragState(null);
    setActiveZone(null);
    if (!drag || !zone) return;
    const prev = layout;
    const next = dropIntoLeaf(prev, drag.ref, zone.targetGroupId, zone.zone);
    if (next === prev) return;
    update(() => next);
    // drop 后 focus 到 dropped tab（与 onSelectTab/onCloseTab 同源 navigate 分发，设计 §7.2 拖动源泛化）。
    const ref = drag.ref;
    if (ref.kind === "session") navigateSession(ref);
    else if (ref.kind === "file") {
      const { projectName, path } = splitFilePath(ref.path);
      void navigateToFile(projectName, path);
    } else if (ref.kind === "git") {
      if (ref.mode === "compare")
        void navigateToGitCompareFile(ref.projectName, ref.base, ref.compare, ref.path);
      else void navigateToGitFile(ref.projectName, ref.scope, ref.path);
    } else if (ref.kind === "skill") void navigateToSkill(ref.name);
    else if (ref.kind === "chat")
      // chat 无 projectName：保 scope，focus URL=sessionId（与 onSelectTab chat 分支同模式）。
      navigateWorkbench(
        scope,
        ref.sessionId,
        stickyWorkbenchSearch({ rightTab, tab: tabFromUrl, leftMode, mode }),
      );
    else if (ref.kind === "render")
      // render tab 无 URL 语义：清 focus 保 scope（与 onSelectTab render 分支同模式）。
      void navigateWorkbench(
        scope,
        undefined,
        stickyWorkbenchSearch({ rightTab, tab: tabFromUrl, leftMode, mode }),
      );
  }, [
    dragState,
    activeZone,
    layout,
    update,
    navigateSession,
    navigateToFile,
    navigateToGitFile,
    navigateToGitCompareFile,
    navigateToSkill,
    navigateWorkbench,
    scope,
    rightTab,
    tabFromUrl,
    leftMode,
    mode,
  ]);
  const cancelDrag = useCallback(() => {
    setDragState(null);
    setActiveZone(null);
  }, []);
  const onCardDragStart = useCallback(
    (ref: WorkbenchPanelRef, event: PointerEvent<HTMLDivElement>) => {
      setDragState({
        ref,
        startX: event.clientX,
        startY: event.clientY,
        currentX: event.clientX,
        currentY: event.clientY,
      });
      setActiveZone(null);
    },
    [],
  );
  const onSetDragPointer = useCallback((x: number, y: number) => {
    setDragState((prev) => (prev ? { ...prev, currentX: x, currentY: y } : prev));
  }, []);
  // 左总览拖放源适配器（onSelect = 单击激活 = focusInstance）。
  const dragAdapter: DragSourceAdapter = {
    onDragStart: onCardDragStart,
    onSelect: focusInstance,
  };

  if (!isDesktop) {
    return (
      <MobileWorkbench
        closeHolder={closeHolder}
        closeInstance={closeInstance}
        create={create}
        createPromptHolder={create.promptHolder}
        focusId={focusId}
        leftMode={leftMode}
        pluginName={pluginName}
        pluginView={pluginView}
        mode={mode}
        onOpenFile={onOpenFile}
        onOpenGitFile={onOpenGitFile}
        onSelectTab={onSelectTab}
        onToolChange={onToolTabChange}
        scope={scope}
        tool={tab}
      />
    );
  }
  // project 可唤出右栏（inspection 只依赖 projectKey，非聚焦态唤出看 files/git）；
  // global scope 不唤出右栏（全局 inspection 走中栏 files tab，见 workbench-views §4.1）。
  // 收起态 rightPanel=null（aside 不渲染、零 query），由 RailButton 唤出。
  const rightPanelCollapsible = scope.kind === "project";
  const rightPanel =
    rightPanelCollapsible && !rightCollapsed ? (
      <RightPanelTabs activeTab={rightTab} ctx={ctx} onTabChange={onRightTabChange} />
    ) : null;
  // 一级会话页（§3.1，桌面/移动结构对齐）：global scope + leftMode=auto 恒为会话页语境，
  // **与 focusId 解耦**——中栏聚焦（session/chat/file/git/skill 任何 tab）是正交维度，不改左栏
  //（VSCode 式，同 leftMode 粘性语义）。mode tab 常驻左栏 PanelHeader title（对齐移动
  // MobilePageHeader title），不掉回「会话」文案标题；左栏 body 按 mode 切（chat → ChatOverview，
  // agent → ProjectLeftPanel 项目总览）。chat 聚焦时 mode 由 deriveWorkbenchRouteContext 兜底
  //（focusId=chat_* ⇒ mode=chat），URL mode 键丢失也不掉语境。
  // 两种模式都保持三栏 shell + 中栏 InstanceArea 始终在。
  // ⚠️ 新增中栏 tab 类型时不要在此按 focusId 前缀加分支——左栏语境只由 scope/leftMode/mode
  // 决定，tab 类型差异全部收敛在 focus effect 与 PanelRouter。
  const sessionPage = scope.kind === "global" && leftMode === "auto";
  const chatMode = sessionPage && mode === "chat";
  // 左栏内容（Phase 2 scope 优先 + leftMode）：project scope 恒走 ProjectLeftPanel（无视 leftMode
  //——进项目左栏恒显项目实例总览/中栏 tab，用户诉求"进项目左栏不再不变"）；global scope 下
  // leftMode="files"（活动栏 [文件] 入口或其粘性透传态）→ GlobalFilesOverview（全局 rootBrowse 根目录，
  // leftMode="auto"（活动栏 [会话] 入口或其粘性透传态）→ 一级会话页：按 mode 切 Agent/Chat body。
  // 左总览：global scope → 共享 GlobalProjectsOverview（桌面/移动同一实现，批 F / 决策 29）；
  // project scope → InstanceLeftOverview（CreateSessionBar + 本项目实例总览）。
  // 桌面 §6.10-9（M9 批次 d，对齐 09m/10m 原型 IA）：global scope 且 leftMode=plugins/files 时，
  // 插件/全局文件是 **main 整页**（原型 side sidewin 恒定不随导航切换、main 切内容），实例区让位
  //——tab 布局在 localStorage atom 持久化，切回 auto 原样恢复；会话服务端不销毁，重挂重连
  //（与移动端切 Tab 同语义）。仅桌面生效：中档/窄屏走 MobileWorkbench，此分支不渲染。
  const desktopMainPage = !mainPageActive ? null : leftMode === "plugins" ? (
    // 插件域 mainPage 按深度页分流（第八轮）：skill/mcp 详情 = main 整页渲染详情面板
    //（复用 tab 时代同款组件；不写 layout、无 tabstrip chip），home = 插件管理整页。
    pluginView === "skill" && pluginName ? (
      <MainPageShell title={t("nav.plugins")}>
        <SkillTabPreview name={pluginName} />
      </MainPageShell>
    ) : pluginView === "mcp" && pluginName ? (
      <MainPageShell title={t("nav.plugins")}>
        <MobileMcpDetail name={pluginName} />
      </MainPageShell>
    ) : (
      <MainPageShell title={t("nav.plugins")}>
        <PluginsPanel
          onCardDragStart={onCardDragStart}
          onOpenMcp={onOpenMcp}
          onOpenSkill={onOpenSkill}
        />
      </MainPageShell>
    )
  ) : leftMode === "settings" ? (
    // 07m：设置并入 mainPage 体系（side 恒定 sidewin + main 整页），取代 M7 的居中 Dialog。
    <SettingsMainPage />
  ) : (
    <MainPageShell title={t("nav.globalFiles")}>
      <GlobalFilesOverview onCardDragStart={onCardDragStart} onOpenFile={onOpenFile} />
    </MainPageShell>
  );
  const leftOverview =
    scope.kind === "global" ? (
      <GlobalProjectsOverview dragAdapter={dragAdapter} onFocusInstance={focusInstance} />
    ) : (
      <InstanceLeftOverview
        create={create}
        ctx={ctx}
        dragAdapter={dragAdapter}
        onCloseInstance={closeInstance}
        onFocusInstance={focusInstance}
        onRenameInstance={renameInstance}
        projectInstances={projectInstances}
        scope={scope}
      />
    );
  const leftPanel = mainPageActive ? (
    // 09m/10m 原型：main 切插件/文件整页时左栏保持 sidewin 项目总览（§6.10-9 拍板记档）。
    leftOverview
  ) : scope.kind === "project" || (leftMode === "auto" && !chatMode) ? (
    <ProjectLeftPanel
      focusId={focusId}
      onCardDragStart={onCardDragStart}
      onOpenFile={onOpenFile}
      onOpenGitCompareFile={onOpenGitCompareFile}
      onOpenGitFile={onOpenGitFile}
      onTabChange={onTabChange}
      openSkillSearch={{
        rightTab,
        tab: tabFromUrl,
        ...(leftMode !== "auto" ? { leftMode } : {}),
      }}
      overview={leftOverview}
      scope={scope}
      tab={tab}
    />
  ) : chatMode ? (
    // 一级会话页 chat 模式：左栏 body = ChatOverview（绕过 ProjectLeftPanel——global scope 下它
    // 只是 overview 的纯 wrapper，chat 不需要 middle tab bar，直接渲染列表）。
    <ChatOverview />
  ) : (
    // global scope 非会话残余态（可达路径：/files/file/$ 等焦点深链透传 leftMode=files +
    // focusId——focusId 让 mainPageActive 失效，左栏保持 GlobalFilesOverview 文件语境）。
    <GlobalFilesOverview onCardDragStart={onCardDragStart} onOpenFile={onOpenFile} />
  );
  const instanceArea = (
    <InstanceArea
      activeZone={activeZone}
      cancelDrag={cancelDrag}
      closeInstance={closeInstance}
      create={create}
      draggingRef={draggingRef}
      dragState={dragState}
      layout={layout}
      onCardDragStart={onCardDragStart}
      onCloseTab={onCloseTab}
      onDrop={onDrop}
      onResizeSplit={onResizeSplit}
      onSelectTab={onSelectTab}
      onSetDragPointer={onSetDragPointer}
      onSplitLeaf={onSplitLeaf}
      onToggleMaximize={onToggleMaximize}
      projectName={ctx.projectKey}
      refsCount={globalRefs.length}
      setActiveZone={setActiveZone}
    />
  );
  return (
    <WorkbenchShell
      sidebar={<Sidebar />}
      leftPanel={leftPanel}
      leftPanelTitle={
        scope.kind === "project" ? (
          <ProjectScopeHeaderTitle onBack={backToProjects} projectName={scope.key} />
        ) : sessionPage ? (
          // 一级会话页（§3.1）：左栏标题区 = Agent/Chat mode tab（对齐移动 MobilePageHeader
          // title），取代原「会话」文案标题。两种模式都显示（切回入口常驻）。
          <SessionModeTabs mode={mode} />
        ) : (
          t("nav.projects")
        )
      }
      rightPanel={desktopMainPage ? null : rightPanel}
      rightPanelCollapsible={desktopMainPage ? false : rightPanelCollapsible}
      statusBar={<StatusBar />}
    >
      {desktopMainPage ?? instanceArea}
      {closeHolder}
      {renameHolder}
      {create.promptHolder}
    </WorkbenchShell>
  );
}

/**
 * 09m/10m main 整页 header 壳（M9 批次 d design review）：h1 17px/700 标题行 + 内容区，
 * 与 SettingsMainPage 的 header（07m）同批次同形态。原型 mhead 里的 seg4/plus 未还原——
 * seg4「全局/本项目」语义已由导航承载（全局 mainPage ↔ 点项目回工作台）、plus 功能在
 * FilesPanel 工具行 / ManageTab 内承载（§6.10 批次 d 补记 design review 段）。
 */
function MainPageShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-2 px-5 pt-2.5">
        <h1 className="min-w-0 flex-1 truncate text-[17px] font-bold text-ink-1">{title}</h1>
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

/**
 * project scope 左栏 header title 节点（设计 workbench-layout-fix.md 阶段 1）：
 * 返回箭头（回 /projects 全局项目列表）+ 当前项目名 truncate。置于 PanelHeader 的 flex
 * title 容器（button shrink-0 + 项目名 min-w-0 truncate），对齐全局项目 header 的
 * 「标题 + 主体」结构；与右侧折叠 chevron 区分（左=导航返回，右=收起左栏）。
 */
function ProjectScopeHeaderTitle({
  onBack,
  projectName,
}: {
  onBack: () => void;
  projectName: string;
}) {
  const { t } = useT();
  return (
    <>
      <button
        aria-label={t("workbench.backToProjects")}
        className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-on-surface-muted transition hover:bg-on-surface/5 hover:text-on-surface-soft"
        onClick={onBack}
        type="button"
      >
        <svg aria-hidden="true" className="size-4" fill="none" viewBox="0 0 24 24">
          <path
            d="M15 18l-6-6 6-6"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
          />
        </svg>
      </button>
      <ProjectSwitcher
        currentProjectName={projectName}
        titleClassName="text-base font-semibold text-on-surface"
      />
    </>
  );
}
