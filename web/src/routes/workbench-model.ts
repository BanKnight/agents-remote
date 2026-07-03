import { atom, useAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { useNavigate } from "@tanstack/react-router";
import type { AgentProvider, AgentSessionStatus, SessionType } from "@agents-remote/shared";

/**
 * 工作台作用域 —— URL 的语义核心（见 docs/design/workbench-redesign.md §1/§7）。
 * project 作用域 `/projects/$key`、global 作用域 `/global`（聚焦实例追加 `/session/$id`）。
 *
 * - `project`：限定单个项目。左栏树聚焦该项目，实例区只承载该项目的实例。
 * - `global`：跨项目混排（Stage 4 全局实例区），实例来源合并所有项目。
 *
 * 这是工作台与旧换页模型（Home → Project → detail）的根本区别：进入工作台后
 * 作用域常驻，切项目/实例是同屏换面板内容，而非换页。
 */
export type WorkbenchScope = { kind: "project"; key: string } | { kind: "global" };

/**
 * 右栏 inspection tab 标识。V1 三个第一方 tab（设计文档 §6）：
 * `files` / `git` / `prototype`。Stage 3 以 RightPanelPlugin 契约落地注册表。
 */
export type WorkbenchRightTab = "files" | "git" | "prototype";

/**
 * 中栏总览视图（设计文档 workbench-views.md）。grouped=按项目分组（仅 global）；
 * grid=自适应卡片网格（project/global 默认）；table=含会话名列的密集表；
 * split=多实例同屏工作台（P5 重构，P2 全平台隐藏作中间态）。
 */
export type WorkbenchView = "grouped" | "grid" | "table" | "split";

/**
 * 中栏二级导航 tab（设计文档 workbench-views.md）。overview=实例总览（切 grouped/grid/table）；
 * history=历史 session；files/git/prototype=复用右栏 inspection plugin。
 */
export type WorkbenchMiddleTab = "overview" | "history" | "files" | "git" | "prototype";

/**
 * ViewSwitcher 视图渲染顺序（从左到右，设计文档 workbench-views.md §15）。视觉上从右到左
 * = grouped · grid · table · split（grouped 最右作 global 默认入口，split 最左）。
 */
export const WORKBENCH_VIEW_ORDER: WorkbenchView[] = ["split", "table", "grid", "grouped"];

/**
 * 按作用域/视口过滤 ViewSwitcher 可用视图（设计文档 §15）。P2 全平台隐藏 split
 *（P5 重构前中间态）；project 作用域隐藏 grouped（grouped 仅 global 跨项目分组）；
 * 移动端隐藏 grouped + split（移动不支持多实例 split，grouped 让位单列分段）。
 */
export function filterWorkbenchViews(scope: WorkbenchScope, isMobile: boolean): WorkbenchView[] {
  return WORKBENCH_VIEW_ORDER.filter((v) => {
    if (v === "split") return false;
    if (v === "grouped" && (scope.kind === "project" || isMobile)) return false;
    return true;
  });
}

/**
 * 左右栏宽度基线（rem）。左栏（项目树）沿用 ShellLayout project sidebar 的 13.125rem。
 * 右栏需容纳 FilesPanel browser（19.375rem）+ padding，故宽于左栏；Stage 4 resize
 * gutter 落地后用户可单点调整（MIN/MAX 钳制，避免压溃中栏或自身）。
 */
export const WORKBENCH_LEFT_PANEL_DEFAULT_REM = 13.125;
export const WORKBENCH_RIGHT_PANEL_DEFAULT_REM = 22;
/** 左栏宽度钳制范围（rem）：项目树最小可读宽度 / 不吃掉中栏的上限。 */
export const WORKBENCH_LEFT_PANEL_MIN_REM = 9;
export const WORKBENCH_LEFT_PANEL_MAX_REM = 24;
/** 右栏宽度钳制范围（rem）：FilesPanel browser 最小宽度 / 不吃掉中栏的上限。 */
export const WORKBENCH_RIGHT_PANEL_MIN_REM = 16;
export const WORKBENCH_RIGHT_PANEL_MAX_REM = 40;

// ── 持久化的个人布局（atomWithStorage → localStorage，刷新保持）──────────────
// 设计文档 §2：栏收起 + 宽度是个人布局（localStorage 编码），不进 URL
// （URL 只编码语义核心：scope / focusId / rightTab）。

/** 左栏（项目 + 实例树）折叠态。 */
export const workbenchLeftCollapsedAtom = atomWithStorage("workbenchLeftCollapsed", false);

/** 右栏（inspection tab）折叠态。 */
export const workbenchRightCollapsedAtom = atomWithStorage("workbenchRightCollapsed", false);

/** 左栏宽度（rem），Stage 0② WorkbenchShell 构造 grid template，Stage 4 resize 单点更新。 */
export const workbenchLeftWidthAtom = atomWithStorage(
  "workbenchLeftWidth",
  WORKBENCH_LEFT_PANEL_DEFAULT_REM,
);

/** 右栏宽度（rem），Stage 0② WorkbenchShell 构造 grid template，Stage 4 resize 单点更新。 */
export const workbenchRightWidthAtom = atomWithStorage(
  "workbenchRightWidth",
  WORKBENCH_RIGHT_PANEL_DEFAULT_REM,
);

/**
 * 右栏当前 tab。Stage 3 起 URL `rightTab` 优先（语义核心、刷新可分享），
 * 此 atom 作「记忆上次 tab」的回退（首次进入 / URL 未指定时）。
 */
export const workbenchRightTabAtom = atomWithStorage<WorkbenchRightTab>(
  "workbenchRightTab",
  "files",
);

/**
 * 中栏总览视图（设计文档 workbench-views.md）。URL `view` 优先（语义核心、刷新可分享），
 * 此 atom 作「记忆上次视图」回退（首次进入 / URL 未指定）。默认 grid。
 */
export const workbenchViewAtom = atomWithStorage<WorkbenchView>("workbenchView", "grid");

/**
 * 中栏二级导航 tab（设计文档 workbench-views.md）。URL `tab` 优先，此 atom 作「记忆上次 tab」
 * 回退。默认 overview（实例总览）。
 */
export const workbenchMiddleTabAtom = atomWithStorage<WorkbenchMiddleTab>(
  "workbenchMiddleTab",
  "overview",
);

/**
 * 移动端聚焦态 header tab（设计文档 §7）。窄屏无法像桌面那样「实例常驻中栏 + inspection
 * 并列右栏」，故实例与 inspection 共占同一区域、tab 切换：`output` = 实例 runtime body
 *（PanelRouter），其余值 = inspection（复用 FIRST_PARTY_PLUGINS 的 render）。默认 `output`
 *（进入聚焦先看实例本体）。localStorage 记忆，不进 URL —— 移动聚焦态的语义核心已是 URL
 * `focusId`（看哪个实例），header tab 是「在该实例上看输出还是文件」的局部视图偏好。
 */
export type WorkbenchMobileFocusTab = "output" | WorkbenchRightTab;

export const workbenchMobileFocusTabAtom = atomWithStorage<WorkbenchMobileFocusTab>(
  "workbenchMobileFocusTab",
  "output",
);

/**
 * 移动端项目列表态二级 header tab（设计文档 §7）。`overview` = 活跃实例 + 历史 session +
 * 创建入口（ProjectInstances），其余值 = inspection（复用 FIRST_PARTY_PLUGINS render）。
 * 默认 `overview`（进入项目先看实例概览）。localStorage 记忆，不进 URL —— 列表态 URL 语义
 * 核心已是 scope（哪个项目），header tab 是「看概览还是文件/Git」的局部视图偏好。
 */
export type WorkbenchMobileOverviewTab = "overview" | WorkbenchRightTab;

export const workbenchMobileOverviewTabAtom = atomWithStorage<WorkbenchMobileOverviewTab>(
  "workbenchMobileOverviewTab",
  "overview",
);

/**
 * 桌面设置浮窗开关（设计文档 §7：桌面左栏浮窗，移动走 /settings）。非持久化 —— 刷新关闭，
 * 不进 URL（设置是临时操作，非语义状态）。false = 关闭。
 */
export const workbenchSettingsFlyoutOpenAtom = atom<boolean>(false);

/**
 * 解析旧 scope 段字符串：`global` → 全局作用域；其余 → project 作用域（key = project name）。
 * 新路由树以中栏语义命名（`/global` / `/projects/$key`，见 workbench-redesign §7），
 * scope 由路由段直接决定，无需解析；此函数仅用于旧 `/workbench/$scope` redirect 兼容。
 */
export function parseWorkbenchScope(scope: string): WorkbenchScope {
  return scope === "global" ? { kind: "global" } : { kind: "project", key: scope };
}

/**
 * 生成 workbench URL（去 `/workbench` 前缀，以中栏语义命名 —— workbench-redesign §7）：
 * project 作用域 `/projects/$key`，global 作用域 `/global`；聚焦实例追加 `/session/$id`。
 * key/id 均 encodeURIComponent。同一 URL 桌面/移动响应式渲染（useIsDesktopViewport）。
 */
export function workbenchPath(scope: WorkbenchScope, focusId?: string) {
  if (scope.kind === "global") {
    return focusId === undefined ? "/global" : `/global/session/${encodeURIComponent(focusId)}`;
  }
  const keySeg = encodeURIComponent(scope.key);
  return focusId === undefined
    ? `/projects/${keySeg}`
    : `/projects/${keySeg}/session/${encodeURIComponent(focusId)}`;
}

/**
 * 工作台导航 hook（scope → 类型化路由的单一入口）。scope 动态（project/global）决定
 * URL 前缀（`/projects/$key` vs `/global`），故 navigate 的 typed `to` + params 需按
 * scope 分支；集中于此避免每个调用点重复 4 分支（单一数据管道）。`search` 透传 rightTab
 *（新路由均用 validateWorkbenchSearch，search schema 一致）。
 */
export function useWorkbenchNavigate() {
  const navigate = useNavigate();
  return (
    scope: WorkbenchScope,
    focusId?: string,
    search?: { rightTab?: WorkbenchRightTab; view?: WorkbenchView; tab?: WorkbenchMiddleTab },
  ) => {
    if (scope.kind === "global") {
      return navigate(
        focusId === undefined
          ? { to: "/global", search }
          : { to: "/global/session/$id", params: { id: focusId }, search },
      );
    }
    return navigate(
      focusId === undefined
        ? { to: "/projects/$key", params: { key: scope.key }, search }
        : {
            to: "/projects/$key/session/$id",
            params: { key: scope.key, id: focusId },
            search,
          },
    );
  };
}

/**
 * workbench 路由的 search 校验器（白名单 rightTab）。返回类型 `{ rightTab? }`
 * 把 rightTab 声明为**可选** search param —— 值在白名单内才写入 key，否则返回 {}
 *（URL 无 rightTab，回退 workbenchRightTabAtom 记忆）。可选性由返回类型的 `?`
 * 表达（TanStack Router 据 validateSearch 返回类型推断 search schema）。
 */
export function validateWorkbenchSearch(search: Record<string, unknown>): {
  rightTab?: WorkbenchRightTab;
  view?: WorkbenchView;
  tab?: WorkbenchMiddleTab;
} {
  const result: {
    rightTab?: WorkbenchRightTab;
    view?: WorkbenchView;
    tab?: WorkbenchMiddleTab;
  } = {};
  if (search.rightTab === "files" || search.rightTab === "git" || search.rightTab === "prototype") {
    result.rightTab = search.rightTab;
  }
  if (
    search.view === "grouped" ||
    search.view === "grid" ||
    search.view === "table" ||
    search.view === "split"
  ) {
    result.view = search.view;
  }
  if (
    search.tab === "overview" ||
    search.tab === "history" ||
    search.tab === "files" ||
    search.tab === "git" ||
    search.tab === "prototype"
  ) {
    result.tab = search.tab;
  }
  return result;
}

/**
 * 从 sessionId 前缀推断 session 类型。
 *
 * workbench 用统一 focusId（`/projects/$key/session/$id` / `/global/session/$id`），
 * 不像旧路由用路径段（`/agent-sessions/` vs `/terminal-sessions/`）显式区分 type，
 * 因此需从 id 反推。id 由 api/src/session-registry.ts `defaultCreateId` 生成：
 * `agent_${uuid}` / `terminal_${uuid}` —— 前缀是稳定类型标识，无歧义，比并行查
 * agent/terminal 两个接口（其一必然 404）干净。
 */
export function inferSessionTypeFromId(sessionId: string): SessionType | undefined {
  if (sessionId.startsWith("agent_")) return "agent";
  if (sessionId.startsWith("terminal_")) return "terminal";
  return undefined;
}

// ── 中栏 split 布局（Stage 4，设计文档 §4）───────────────────────────────────
// 实例 = 面板 1:1：活跃实例常驻中栏为一个面板，关闭面板 = 结束实例成历史 session。
// URL 只编码 focusId（聚焦面板，输入作用于它）；面板布局进 localStorage（§2），
// 按作用域隔离（project 按项目名分键，global 单份）。

/** 中栏 split 面板引用：一个活跃实例（项目 + session id）。 */
export type WorkbenchPanelRef = {
  projectName: string;
  sessionId: string;
};

/**
 * 中栏 split 布局 state（State/Render 分离：raw 有序结构，渲染由纯函数派生）。
 * - `panels`：有序扁平面板列表（左→右铺开；遇到 `newRows` 标记的 sessionId 起新行）。
 * - `newRows`：标记「此 sessionId 起一个新行」（split-down）；列表首项忽略此标记。
 * - `sizes`：每个面板在行内的 flex 宽度权重（默认 1）；resize gutter 单点更新。
 * - `maximized`：最大化面板的 sessionId（标量，不新增布局树实体）；null = 正常铺开。
 */
export type WorkbenchLayout = {
  panels: WorkbenchPanelRef[];
  newRows: string[];
  sizes: Record<string, number>;
  maximized: string | null;
};

export const EMPTY_WORKBENCH_LAYOUT: WorkbenchLayout = {
  panels: [],
  newRows: [],
  sizes: {},
  maximized: null,
};

/** 默认面板 flex 宽度权重（resize 基线，设计文档 §4）。 */
export const WORKBENCH_PANEL_DEFAULT_FLEX = 1;
/** resize 时面板最小 flex 权重（防压溃到 0）。 */
export const WORKBENCH_PANEL_MIN_FLEX = 0.2;

/**
 * 从扁平布局派生二维行结构（渲染层纯函数）。`newRows` 标记的 sessionId 起新行；
 * 首个面板不论标记都进第一行。maximized 时返回单面板单行（派生，不改 state）。
 */
export function deriveRows(layout: WorkbenchLayout): WorkbenchPanelRef[][] {
  if (layout.maximized !== null) {
    const max = layout.panels.find((p) => p.sessionId === layout.maximized);
    return max ? [[max]] : [];
  }
  const newRowSet = new Set(layout.newRows);
  const rows: WorkbenchPanelRef[][] = [];
  let current: WorkbenchPanelRef[] = [];
  for (const panel of layout.panels) {
    if (current.length > 0 && newRowSet.has(panel.sessionId)) {
      rows.push(current);
      current = [];
    }
    current.push(panel);
  }
  if (current.length > 0) rows.push(current);
  return rows;
}

/**
 * 向布局加入面板（split-right 默认；`newRow` 起新行 = split-down）。
 * 已存在的 sessionId 幂等不重复加；`afterSessionId` 指定插入位置（聚焦面板之后）。
 */
export function addPanel(
  layout: WorkbenchLayout,
  ref: WorkbenchPanelRef,
  opts: { afterSessionId?: string; newRow?: boolean } = {},
): WorkbenchLayout {
  if (layout.panels.some((p) => p.sessionId === ref.sessionId)) return layout;
  const panels = [...layout.panels];
  const idx =
    opts.afterSessionId === undefined
      ? -1
      : panels.findIndex((p) => p.sessionId === opts.afterSessionId);
  if (idx >= 0) panels.splice(idx + 1, 0, ref);
  else panels.push(ref);
  const newRows =
    opts.newRow === true && idx >= 0 ? [...layout.newRows, ref.sessionId] : layout.newRows;
  const sizes = { ...layout.sizes, [ref.sessionId]: WORKBENCH_PANEL_DEFAULT_FLEX };
  return { ...layout, panels, newRows, sizes };
}

/** 移除面板（关闭 = 结束实例）；同步清理 newRows / sizes / maximized。 */
export function removePanel(layout: WorkbenchLayout, sessionId: string): WorkbenchLayout {
  const panels = layout.panels.filter((p) => p.sessionId !== sessionId);
  const newRows = layout.newRows.filter((id) => id !== sessionId);
  const sizes = { ...layout.sizes };
  delete sizes[sessionId];
  const maximized = layout.maximized === sessionId ? null : layout.maximized;
  return { panels, newRows, sizes, maximized };
}

/** 切换面板最大化（标量翻转，不新增布局实体）。 */
export function toggleMaximize(layout: WorkbenchLayout, sessionId: string): WorkbenchLayout {
  return { ...layout, maximized: layout.maximized === sessionId ? null : sessionId };
}

/** 设置面板 flex 宽度（resize gutter 单点更新；下限 WORKBENCH_PANEL_MIN_FLEX）。 */
export function setPanelSize(
  layout: WorkbenchLayout,
  sessionId: string,
  size: number,
): WorkbenchLayout {
  return {
    ...layout,
    sizes: { ...layout.sizes, [sessionId]: Math.max(WORKBENCH_PANEL_MIN_FLEX, size) },
  };
}

/**
 * 拖拽 gutter 调整同行相邻左右面板宽度（resize 主路径，优于对左右分别 setPanelSize）。
 * 守恒：左增 = 右减（`deltaFlex` 为左的增量，右对称减）；两侧各钳到 `WORKBENCH_PANEL_MIN_FLEX`，
 * 钳制时 delta 被截到可调范围边界，左右仍守恒。一次原子更新两个 sizes，无中间态。
 */
export function resizePair(
  layout: WorkbenchLayout,
  leftId: string,
  rightId: string,
  deltaFlex: number,
): WorkbenchLayout {
  const left = layout.sizes[leftId] ?? WORKBENCH_PANEL_DEFAULT_FLEX;
  const right = layout.sizes[rightId] ?? WORKBENCH_PANEL_DEFAULT_FLEX;
  const clamped = Math.min(
    Math.max(deltaFlex, WORKBENCH_PANEL_MIN_FLEX - left),
    right - WORKBENCH_PANEL_MIN_FLEX,
  );
  return {
    ...layout,
    sizes: { ...layout.sizes, [leftId]: left + clamped, [rightId]: right - clamped },
  };
}

// ── 全局实例区（Stage 4 commit ④，跨项目混排）─────────────────────────────────

/** 全局实例区候选：聚合所有项目活跃实例 + 排序/展示所需字段。 */
export type GlobalInstanceCandidate = {
  ref: WorkbenchPanelRef;
  /** AgentSessionStatus 涵盖 terminal 状态子集，统一 agent/terminal 状态语义。 */
  status: AgentSessionStatus;
  type: "agent" | "terminal";
  /** 实例显示名（移动全局列表行 / 全局面板标题）。 */
  displayName: string;
  /** agent provider（terminal 无）。 */
  provider?: AgentProvider;
};

/**
 * 全局实例区铺开排序（设计文档 §4）：needs-interaction（agent 非运行，如 idle/error）
 * > running agent > terminal > 其他。最需要关注的实例排最前。稳定排序（同 rank 保持
 * 聚合顺序，即项目次序 → sessions 次序）。纯函数，便于测试。
 */
export function rankGlobalInstances(candidates: GlobalInstanceCandidate[]): WorkbenchPanelRef[] {
  const rank = (candidate: GlobalInstanceCandidate): number => {
    if (candidate.type === "agent" && candidate.status !== "running") return 0;
    if (candidate.type === "agent") return 1;
    if (candidate.type === "terminal") return 2;
    return 3;
  };
  return [...candidates]
    .map((candidate, index) => ({ candidate, index }))
    .sort((a, b) => rank(a.candidate) - rank(b.candidate) || a.index - b.index)
    .map((entry) => entry.candidate.ref);
}

// ── 布局 atom（按作用域隔离，localStorage 持久化）─────────────────────────────

/**
 * 全部作用域的布局 state。`project` 按项目名分键（切项目恢复各自面板），
 * `global` 单份（跨项目混排，Stage 4 commit ④）。单 atom 便于 useWorkbenchLayout
 * 按 scope 选 + 原子更新。
 */
export type WorkbenchLayoutState = {
  project: Record<string, WorkbenchLayout>;
  global: WorkbenchLayout;
};

export const workbenchLayoutAtom = atomWithStorage<WorkbenchLayoutState>("workbenchLayout", {
  project: {},
  global: EMPTY_WORKBENCH_LAYOUT,
});

/**
 * 按作用域读写 workbench 布局。读：project 取 `state.project[key]`（缺省 EMPTY），
 * global 取 `state.global`。写：`update(fn)` 只改当前作用域的布局，其余 immutable 保留。
 */
export function useWorkbenchLayout(scope: WorkbenchScope) {
  const [state, setState] = useAtom(workbenchLayoutAtom);
  const layout =
    scope.kind === "project" ? (state.project[scope.key] ?? EMPTY_WORKBENCH_LAYOUT) : state.global;
  const update = (fn: (layout: WorkbenchLayout) => WorkbenchLayout) =>
    setState((prev) => {
      if (scope.kind === "project") {
        const current = prev.project[scope.key] ?? EMPTY_WORKBENCH_LAYOUT;
        return { ...prev, project: { ...prev.project, [scope.key]: fn(current) } };
      }
      return { ...prev, global: fn(prev.global) };
    });
  return [layout, update] as const;
}
