import { useAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import type { SessionType } from "@agents-remote/shared";

/**
 * 工作台作用域 —— URL `/workbench/$scope` 的语义核心
 * （见 docs/design/workbench-redesign.md §1）。
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
 * 左右栏宽度基线（rem）。左栏（项目树）沿用 ShellLayout project sidebar 的 13.125rem。
 * 右栏需容纳 FilesPanel browser（19.375rem）+ padding，故宽于左栏；Stage 4 resize
 * gutter 落地后用户可单点调整。
 */
export const WORKBENCH_LEFT_PANEL_DEFAULT_REM = 13.125;
export const WORKBENCH_RIGHT_PANEL_DEFAULT_REM = 22;

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
 * 解析 URL scope 段：`global` → 全局作用域；其余 → project 作用域（key = project name）。
 * 对应路由 `/workbench/$scope`（设计文档 §7）。
 */
export function parseWorkbenchScope(scope: string): WorkbenchScope {
  return scope === "global" ? { kind: "global" } : { kind: "project", key: scope };
}

/**
 * 生成 workbench URL：scope = `global` 或 project key（encodeURIComponent），
 * focusId 可选（聚焦实例 id）。与 projectConsolePath 同编码模式。
 */
export function workbenchPath(scope: WorkbenchScope, focusId?: string) {
  const scopeSegment = scope.kind === "global" ? "global" : encodeURIComponent(scope.key);
  const base = `/workbench/${scopeSegment}`;
  return focusId ? `${base}/${encodeURIComponent(focusId)}` : base;
}

/**
 * workbench 路由的 search 校验器（白名单 rightTab）。返回类型 `{ rightTab? }`
 * 把 rightTab 声明为**可选** search param —— 值在白名单内才写入 key，否则返回 {}
 *（URL 无 rightTab，回退 workbenchRightTabAtom 记忆）。可选性由返回类型的 `?`
 * 表达（TanStack Router 据 validateSearch 返回类型推断 search schema）。
 */
export function validateWorkbenchSearch(search: Record<string, unknown>): {
  rightTab?: WorkbenchRightTab;
} {
  if (search.rightTab === "files" || search.rightTab === "git" || search.rightTab === "prototype") {
    return { rightTab: search.rightTab };
  }
  return {};
}

/**
 * 从 sessionId 前缀推断 session 类型。
 *
 * workbench 用统一 focusId（`/workbench/$scope/$focusId`），不像旧路由用路径段
 *（`/agent-sessions/` vs `/terminal-sessions/`）显式区分 type，因此需从 id 反推。
 * id 由 api/src/session-registry.ts `defaultCreateId` 生成：`agent_${uuid}` /
 * `terminal_${uuid}` —— 前缀是稳定类型标识，无歧义，比并行查 agent/terminal 两个接口
 *（其一必然 404）干净。
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

/** 全局实例区候选：聚合所有项目活跃实例 + 排序所需的状态/类型。 */
export type GlobalInstanceCandidate = {
  ref: WorkbenchPanelRef;
  status: string;
  type: "agent" | "terminal";
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
