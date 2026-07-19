import type { GitDiffScope } from "@agents-remote/shared";
import { useNavigate } from "@tanstack/react-router";
import { useAtom, useAtomValue } from "jotai";
import { type PointerEvent, useCallback, useEffect, useState } from "react";
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
import { MobileWorkbench } from "../components/workbench/mobile-workbench";
import { type PluginContext } from "../components/workbench/right-panel-plugin";
import { RightPanelTabs } from "../components/workbench/right-panel-tabs";
import { ActivityBar } from "../components/shell/activity-bar";
import { WorkbenchShell } from "../components/shell/workbench-shell";
import { ProjectLeftPanel } from "../components/workbench/project-left-panel";
import { GlobalFilesOverview } from "../components/files/global-files-overview";
import { SkillsPanel } from "./SkillsRoute";
import { useT } from "../i18n";
import {
  type DropZone,
  type WorkbenchMiddleTab,
  type WorkbenchPanelRef,
  type WorkbenchRightTab,
  type WorkbenchScope,
  type WorkbenchView,
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
  splitFilePath,
  toggleLeafMaximize,
  useIsDesktopViewport,
  useWorkbenchLayout,
  useWorkbenchNavigate,
  useWorkbenchRouteContext,
  workbenchMiddleLeftWidthAtom,
  workbenchMiddleTabAtom,
  workbenchRightCollapsedAtom,
  workbenchViewAtom,
} from "./workbench-model";

/**
 * workbench 共享 pathless layout 组件（设计 workbench-stable-refactor.md Phase 1）。7 个 workbench
 * 子路由塌缩为本 layout 的子，**本组件常驻不卸载**——进出项目只 swap 子路由匹配，layout 不
 * unmount → InstanceArea/WorkspaceTree/PanelRouter 实例保活 → WebSocket/relay/xterm 长连不重连
 *（用户诉求"中栏还是同一个，而不是看起来一样"）。
 *
 * scope/focusId/rightTab/view/tab 从 `useWorkbenchRouteContext()` 派生——单一数据管道，source of
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
      rightTab={ctx.rightTab}
      scope={ctx.scope}
      tab={ctx.tab}
      view={ctx.view}
    />
  );
}

function WorkbenchContent({
  focusId,
  rightTab,
  scope,
  view: viewFromUrl,
  tab: tabFromUrl,
  leftMode = "auto",
}: {
  focusId?: string;
  rightTab?: WorkbenchRightTab;
  scope: WorkbenchScope;
  view?: WorkbenchView;
  tab?: WorkbenchMiddleTab;
  // 左栏模式（设计 workbench-stable-refactor Phase 2，leftMode 粘性化）：project scope 恒走
  // ProjectLeftPanel（无视 leftMode）；global scope 下 leftMode="files" → GlobalFilesOverview
  //（全局 rootBrowse），leftMode="skills" → SkillsPanel（技能市场），leftMode="auto" →
  // ProjectLeftPanel(global overview=GlobalProjectsOverview)。leftMode 是 URL search 维度
  //（见 workbench-model.ts deriveWorkbenchRouteContext），由各 navigate 粘性透传——活动栏入口
  // 强制，中栏 tab focus 透传不改（VSCode 式）。
  leftMode?: "auto" | "files" | "skills";
}) {
  const { t } = useT();
  const isDesktop = useIsDesktopViewport();
  const navigateWorkbench = useWorkbenchNavigate();
  const navigate = useNavigate();
  // project scope 左栏 header 返回入口（回 /projects 全局项目列表）。
  const backToProjects = () => void navigate({ to: "/projects" });
  const [rememberedView, setRememberedView] = useAtom(workbenchViewAtom);
  const [rememberedMiddleTab, setRememberedMiddleTab] = useAtom(workbenchMiddleTabAtom);
  // 右栏折叠态与 WorkbenchShell 内 useAtom 共享同一 atom（Jotai 全局）—— 本组件只读，
  // 写入由 WorkbenchShell（RailButton 唤出 / onCollapse 收起）负责。纯手动控制，持久化到
  // localStorage，focusId 变化不覆盖。
  const rightCollapsed = useAtomValue(workbenchRightCollapsedAtom);
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
      ...(leftMode !== "auto" ? { leftMode } : {}),
    });
  };
  const onViewChange = (next: WorkbenchView) => {
    setRememberedView(next);
    void navigateWorkbench(scope, focusId, {
      rightTab,
      tab: tabFromUrl,
      view: next,
      ...(leftMode !== "auto" ? { leftMode } : {}),
    });
  };
  const onTabChange = (next: WorkbenchMiddleTab) => {
    setRememberedMiddleTab(next);
    void navigateWorkbench(scope, focusId, {
      rightTab,
      tab: next,
      view: viewFromUrl,
      ...(leftMode !== "auto" ? { leftMode } : {}),
    });
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
        return ensureTabOpenLeaf(prev, {
          kind: "git",
          path: gitParsed.path,
          projectName: scope.key,
          scope: gitParsed.scope,
        });
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
        // session tab 用 sessionId 判定。
        if (t.kind === "file" || t.kind === "git" || t.kind === "skill") continue;
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
      const active = activeTabRefLeaf(next);
      if (active?.kind === "session") navigateSession(active);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, focusId, layout, isDesktop, refs, refsLoaded, globalRefs, globalRefsLoaded]);

  // grid/table 回调用 projectName 解析：global scope 从 candidates 查（与 InstanceLeftOverview
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
      // 与 onRightTabChange/onViewChange/onTabChange 同模式：传完整 {view,tab,rightTab,leftMode}
      //（URL 原始值）。navigateWorkbench 整体替换 search 对象，不传则会清空 tab/view/rightTab/leftMode
      // ——点中栏 tab 会把左栏 tab（?tab=files）等正交维一起冲掉。用 URL 原始值合并，只换 focusId。
      // leftMode 粘性透传（files/skills 写，非 auto）：中栏 tab 切换不改左栏模式（VSCode 式）。
      void navigateWorkbench(navScope, ref.sessionId, {
        rightTab,
        tab: tabFromUrl,
        view: viewFromUrl,
        ...(leftMode !== "auto" ? { leftMode } : {}),
      });
    },
    [navigateWorkbench, scope, rightTab, tabFromUrl, viewFromUrl, leftMode],
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
  const closeInstance = useCallback(
    (sessionId: string, type: "agent" | "terminal") => {
      const projectName = resolveProjectName(sessionId);
      if (!projectName) return;
      void close({ kind: "session", projectName, sessionId }, type);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scope, candidates, close],
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
  // file tab focus URL（设计 §6 决策 2 / workbench-stable-refactor Phase 3）：
  // - 项目文件（projectName === scope.key，scope=project）→ /projects/$key/file/$，splat=项目相对路径
  //   （保持在项目 URL，key=项目名，focus effect 拼全路径 tabId）。
  // - 全局/跨项目文件（scope=global 或 projectName≠scope.key）→ /files/file/$，splat=全路径
  //   （含项目名前缀，focus effect 直接 file_${fullPath}）。全局/项目点同一文件 → 同一 tabId 去重。
  // search 传 URL 原始值（rightTab/tab/view，与 navigateWorkbench 同模式，避免把 atom 回退值写进 URL）。
  const navigateToFile = useCallback(
    (projectName: string, path: string) => {
      const fullPath = `${projectName}/${path}`;
      if (scope.kind === "project" && projectName === scope.key) {
        void navigate({
          to: "/projects/$key/file/$",
          params: { key: projectName, _splat: path },
          search: {
            rightTab,
            tab: tabFromUrl,
            view: viewFromUrl,
            ...(leftMode !== "auto" ? { leftMode } : {}),
          },
        });
        return;
      }
      void navigate({
        to: "/files/file/$",
        params: { _splat: fullPath },
        search: {
          rightTab,
          tab: tabFromUrl,
          view: viewFromUrl,
          ...(leftMode !== "auto" ? { leftMode } : {}),
        },
      });
    },
    [navigate, scope, rightTab, tabFromUrl, viewFromUrl, leftMode],
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
        search: {
          rightTab,
          tab: tabFromUrl,
          view: viewFromUrl,
          gitScope: scope,
          ...(leftMode !== "auto" ? { leftMode } : {}),
        },
      });
    },
    [navigate, rightTab, tabFromUrl, viewFromUrl, leftMode],
  );
  // 左栏 git 变更列表点文件 → 中栏开/激活 git diff tab + focus（设计 workbench-layout-fix 阶段 3）。
  const onOpenGitFile = useCallback(
    (projectName: string, scope: GitDiffScope, path: string) => {
      update((prev) => ensureTabOpenLeaf(prev, { kind: "git", projectName, scope, path }));
      void navigateToGitFile(projectName, scope, path);
    },
    [update, navigateToGitFile],
  );
  // skill tab focus URL（对标 /files/file/$，skill 为第 4 种 WorkbenchPanelRef kind）：/skills/skill/$
  // splat 捕获 skill name。leftMode 继承 ?leftMode 透传（从 /skills 进来=skills 保技能管理左栏，
  // 中栏 tab 切换不改左栏，VSCode 式，同 /files/file/$）。
  const navigateToSkill = useCallback(
    (name: string) => {
      void navigate({
        to: "/skills/skill/$",
        params: { _splat: name },
        search: {
          rightTab,
          tab: tabFromUrl,
          view: viewFromUrl,
          ...(leftMode !== "auto" ? { leftMode } : {}),
        },
      });
    },
    [navigate, rightTab, tabFromUrl, viewFromUrl, leftMode],
  );
  // Manage tab 点已装 skill 行 → 中栏开/激活 skill tab + focus（对标 onOpenFile）。skill ref
  //（kind:"skill", name）全局去重（tabId=skill_${name}），无 project scope gate（同 file）。
  const onOpenSkill = useCallback(
    (name: string) => {
      update((prev) => ensureTabOpenLeaf(prev, { kind: "skill", name }));
      void navigateToSkill(name);
    },
    [update, navigateToSkill],
  );
  // tab ✕ = 最小化（设计 §7.2）：removeTabFromLeaf 从 leaf 移除 tab，session 存活；file tab
  // 移除（file 无生命周期，✕ 即从布局消失）。focusId 被关后回退到新 active tab 的 focus URL。
  const onCloseTab = useCallback(
    (groupId: string, tabId: string) => {
      const next = removeTabFromLeaf(layout, groupId, tabId);
      update(() => next);
      if (focusId === tabId) {
        const active = activeTabRefLeaf(next);
        if (active?.kind === "session") navigateSession(active);
        else if (active?.kind === "file") {
          // file ref path=全路径，拆出 projectName + 项目相对路径调 navigateToFile。
          const { projectName, path } = splitFilePath(active.path);
          void navigateToFile(projectName, path);
        } else if (active?.kind === "git")
          void navigateToGitFile(active.projectName, active.scope, active.path);
        else if (active?.kind === "skill") void navigateToSkill(active.name);
      }
    },
    [
      layout,
      update,
      focusId,
      navigateWorkbench,
      navigateToFile,
      navigateToGitFile,
      navigateToSkill,
      scope,
    ],
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
        void navigateToGitFile(ref.projectName, ref.scope, ref.path);
        return;
      }
      if (ref?.kind === "skill") {
        void navigateToSkill(ref.name);
        return;
      }
      if (ref) navigateSession(ref);
    },
    [
      update,
      focusId,
      layout,
      scope,
      navigateToFile,
      navigateToGitFile,
      navigateToSkill,
      navigateSession,
    ],
  );

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
    if (drag.ref.kind === "session") navigateSession(drag.ref);
  }, [dragState, activeZone, layout, update, navigateSession]);
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
    return <MobileWorkbench focusId={focusId} leftMode={leftMode} scope={scope} />;
  }
  // project 可唤出右栏（inspection 只依赖 projectKey，非聚焦态唤出看 files/git）；
  // global scope 不唤出右栏（全局 inspection 走中栏 files tab，见 workbench-views §4.1）。
  // 收起态 rightPanel=null（aside 不渲染、零 query），由 RailButton 唤出。
  const rightPanelCollapsible = scope.kind === "project";
  const rightPanel =
    rightPanelCollapsible && !rightCollapsed ? (
      <RightPanelTabs activeTab={rightTab} ctx={ctx} onTabChange={onRightTabChange} />
    ) : null;
  // 左栏内容（Phase 2 scope 优先 + leftMode）：project scope 恒走 ProjectLeftPanel（无视 leftMode
  //——进项目左栏恒显项目实例总览/中栏 tab，用户诉求"进项目左栏不再不变"）；global scope 下
  // leftMode="files"（活动栏 [文件] 入口或其粘性透传态）→ GlobalFilesOverview（全局 rootBrowse 根目录，
  // leftMode="auto"（活动栏 [项目] 入口或其粘性透传态）→ ProjectLeftPanel(global overview=GlobalProjectsOverview)。
  // 左总览：global scope → 共享 GlobalProjectsOverview（桌面/移动同一实现，批 F / 决策 29）；
  // project scope → InstanceLeftOverview（CreateSessionBar + 本项目实例总览）。
  const leftOverview =
    scope.kind === "global" ? (
      <GlobalProjectsOverview
        dragAdapter={dragAdapter}
        onFocusInstance={focusInstance}
        onViewChange={onViewChange}
        view={view}
      />
    ) : (
      <InstanceLeftOverview
        create={create}
        ctx={ctx}
        dragAdapter={dragAdapter}
        onCloseInstance={closeInstance}
        onFocusInstance={focusInstance}
        onRenameInstance={renameInstance}
        onViewChange={onViewChange}
        projectInstances={projectInstances}
        scope={scope}
        view={view}
      />
    );
  const leftPanel =
    scope.kind === "project" || leftMode === "auto" ? (
      <ProjectLeftPanel
        focusId={focusId}
        onOpenFile={onOpenFile}
        onOpenGitFile={onOpenGitFile}
        onTabChange={onTabChange}
        overview={leftOverview}
        scope={scope}
        tab={tab}
      />
    ) : leftMode === "skills" ? (
      <SkillsPanel onOpenSkill={onOpenSkill} />
    ) : (
      <GlobalFilesOverview onOpenFile={onOpenFile} />
    );
  return (
    <WorkbenchShell
      activityBar={<ActivityBar />}
      leftPanel={leftPanel}
      leftPanelTitle={
        scope.kind === "project" ? (
          <ProjectScopeHeaderTitle onBack={backToProjects} projectName={scope.key} />
        ) : leftMode === "skills" ? (
          t("nav.skills")
        ) : leftMode === "files" ? (
          t("nav.files")
        ) : (
          t("nav.projects")
        )
      }
      rightPanel={rightPanel}
      rightPanelCollapsible={rightPanelCollapsible}
    >
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
        onToggleMaximize={onToggleMaximize}
        projectName={ctx.projectKey}
        refsCount={globalRefs.length}
        setActiveZone={setActiveZone}
      />
      {closeHolder}
      {renameHolder}
      {create.promptHolder}
    </WorkbenchShell>
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
      <span className="min-w-0 truncate">{projectName}</span>
    </>
  );
}
