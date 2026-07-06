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
 * 右栏 inspection tab 标识。V1 两个第一方 tab（设计文档 §6）：
 * `files` / `git`。Stage 3 以 RightPanelPlugin 契约落地注册表。
 */
export type WorkbenchRightTab = "files" | "git";

/**
 * 中栏左总览视图样式（设计文档 workbench-views.md §5）。左总览固定单列宽，view 切换的是
 * 同一单列内的卡片呈现样式（不再是列数/布局差异）：grid=详细卡片；table=紧凑行；
 * grouped=按项目分段（仅 global）。多实例同屏靠 Phase B 拖放分屏，不再有独立 split 视图。
 */
export type WorkbenchView = "grouped" | "grid" | "table";

/**
 * 中栏二级导航 tab（设计文档 workbench-views.md）。overview=实例总览（切 grouped/grid/table）；
 * history=历史 session；files/git=复用右栏 inspection plugin。
 */
export type WorkbenchMiddleTab = "overview" | "history" | "files" | "git";

/**
 * ViewSwitcher 视图渲染顺序（从左到右，设计文档 workbench-views.md §6）。
 * = grouped · grid · table（grouped 最左作 global 默认入口，table 最右）。
 */
export const WORKBENCH_VIEW_ORDER: WorkbenchView[] = ["grouped", "grid", "table"];

/**
 * 按作用域过滤 ViewSwitcher 可用视图（设计文档 §6）。project 作用域隐藏 grouped
 *（grouped 仅 global 跨项目分组）；grid/table 全作用域可见。移动端视图样式与桌面一致
 *（移动列表态全宽不分左右结构，但卡片样式同款，故无作用域外的视图差异）。
 */
export function filterWorkbenchViews(scope: WorkbenchScope): WorkbenchView[] {
  return WORKBENCH_VIEW_ORDER.filter((v) => {
    if (v === "grouped" && scope.kind === "project") return false;
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
 * 中栏左总览宽度（rem）。中栏左右结构（workbench-views.md §3）：左总览固定单列卡片
 *（贴合 InstanceGrid `minmax(220px,1fr)` 单列，MIN=14rem 放得下一张 220px 卡），
 * 右工作区 flex-1。gutter 单点拖拽更新（Phase A），MIN/DEFAULT/MAX 钳制。
 */
export const WORKBENCH_MIDDLE_LEFT_MIN_REM = 14;
export const WORKBENCH_MIDDLE_LEFT_DEFAULT_REM = 16;
export const WORKBENCH_MIDDLE_LEFT_MAX_REM = 30;

export const workbenchMiddleLeftWidthAtom = atomWithStorage(
  "workbenchMiddleLeftWidth",
  WORKBENCH_MIDDLE_LEFT_DEFAULT_REM,
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
 * 创建入口（ProjectInstances）；`history` = project-scoped 历史 session（HistoryList）；
 * 其余值 = inspection（复用 FIRST_PARTY_PLUGINS render）。默认 `overview`（进入项目先看实例
 * 概览）。localStorage 记忆，不进 URL —— 列表态 URL 语义核心已是 scope（哪个项目），header
 * tab 是「看概览还是历史还是文件/Git」的局部视图偏好。值域对齐 WorkbenchMiddleTab（2c-3），
 * atom 独立 localStorage key，不与桌面 URL `?tab` 互污。
 */
export type WorkbenchMobileOverviewTab = WorkbenchMiddleTab;

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
  if (search.rightTab === "files" || search.rightTab === "git") {
    result.rightTab = search.rightTab;
  }
  if (search.view === "grouped" || search.view === "grid" || search.view === "table") {
    result.view = search.view;
  }
  if (
    search.tab === "overview" ||
    search.tab === "history" ||
    search.tab === "files" ||
    search.tab === "git"
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
 *   Phase B 拖放分屏 + Phase C maximize 持久化复用本结构；Phase A 仅用 panels[0] 作
 *   单 group（三态状态机已废弃，group 只有「存在/不存在」二态，设计 §7.1）。
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
 * Phase A：group 二态（设计 §7.1，无 minimized），所有 panels 均参与行布局。
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
 * 向布局加入面板（split-right 默认；`newRow` 起一个新行 = split-down）。
 * 已存在的 sessionId 幂等不重复加；`afterSessionId` 指定插入位置（聚焦面板之后）。
 * Phase A：group 二态（无三态），addPanel 只入列 + 默认 flex 权重。
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

// ── Phase B 拖放分屏（设计 §7.2 5 drop zone + §7.4 网格布局）──────────────────
// dropZone 是布局 state 的纯函数变换：把 ref 按 zone 相对 target 插入 panels/newRows/sizes。
// 不扩展 addPanel opts —— addPanel/deriveRows/removePanel 零改动，dropPanel 独立编排
// 6 zone 全部映射到现有 panels/newRows/sizes 操作（保持单一布局模型）。

/** drop zone：拖卡片悬停 group 上的 5 个分裂位 + 空白区（targetSessionId=null）。 */
export type DropZone = "up" | "down" | "left" | "right" | "center";

/** 边缘判定阈值（相对 group rect 的宽/高比例）：<15% 进 up/down/left/right，否则 center。 */
export const DROP_ZONE_EDGE_RATIO = 0.15;

/** 拖动 vs 单击区分阈值（px）：pointermove 累计位移 < 4 视为单击激活（Phase A 行为）。 */
export const DRAG_THRESHOLD_PX = 4;

/**
 * 从指针位置推导 drop zone（纯函数，设计 §7.2）。上下优先于左右（角落归上/下）。
 * 指针不在 rect 内 → null。`relY` 先判 up/down，再 `relX` 判 left/right，否则 center。
 */
export function deriveZone(
  rect: { width: number; height: number; left: number; top: number },
  pointerX: number,
  pointerY: number,
): DropZone | null {
  if (rect.width <= 0 || rect.height <= 0) return null;
  const relX = (pointerX - rect.left) / rect.width;
  const relY = (pointerY - rect.top) / rect.height;
  if (relX < 0 || relX > 1 || relY < 0 || relY > 1) return null;
  if (relY < DROP_ZONE_EDGE_RATIO) return "up";
  if (relY > 1 - DROP_ZONE_EDGE_RATIO) return "down";
  if (relX < DROP_ZONE_EDGE_RATIO) return "left";
  if (relX > 1 - DROP_ZONE_EDGE_RATIO) return "right";
  return "center";
}

/**
 * 按 drop zone 把 ref 相对 target 插入布局（Phase B 拖放主路径，纯函数）。
 *
 * newRows 语义（deriveRows）：标记的 sessionId **起新行**。
 * - `up`（target 上方插新行）：ref 插在 target 之前 + 给 **target** 加 newRows
 *   → target 起新行，ref 留旧行在上方。rows=[...[ref],[target,...]]。
 * - `down`（target 下方插新行）：ref 插在 target 之后 + 给 **ref** 加 newRows
 *   → ref 起新行在 target 下方。rows=[...[target,...],[ref]]。
 * - `left`（target 左侧插同列）：ref 插在 target 之前，newRows 不动 → 同行 ref 在左。
 * - `right`（target 右侧插同列）：ref 插在 target 之后，newRows 不动 → 同行 ref 在右。
 * - `center`（替换）：target 位置 panelRef 换成 ref；若 target 是行首（在 newRows）→
 *   newRows 里 target 换成 ref；ref 继承 target 的 size（保持列宽）；target 的 size 删除。
 *
 * 边界：
 * - 自身 drop（ref.sessionId === targetSessionId）：所有 zone noop（返回原引用）。
 * - ref 已在 layout（重排现有 group）：先 removePanel(ref) 再在 cleaned 上插入。
 * - target 不在 panels：返回原 layout（防御）。
 * - 空白区（targetSessionId === null）：等价 addPanel 末尾（layout 空时成首个 group）。
 * - noop 返回原引用，让 onDrop 用 `next === prev` 跳过无意义 navigate。
 */
export function dropPanel(
  layout: WorkbenchLayout,
  ref: WorkbenchPanelRef,
  targetSessionId: string | null,
  zone: DropZone,
): WorkbenchLayout {
  // 空白区 drop：等价 addPanel 末尾（无 newRow）。layout 空时成首个 group。
  if (targetSessionId === null) {
    if (layout.panels.some((p) => p.sessionId === ref.sessionId)) return layout;
    return addPanel(layout, ref);
  }
  // 自身 drop：所有 zone noop（自身不能与自己分裂/替换）。
  if (ref.sessionId === targetSessionId) return layout;
  // target 不在 panels：防御，返回原样。
  if (!layout.panels.some((p) => p.sessionId === targetSessionId)) return layout;

  // ref 已在 layout（重排现有 group）：先移除再插入，避免重复。
  const cleaned = layout.panels.some((p) => p.sessionId === ref.sessionId)
    ? removePanel(layout, ref.sessionId)
    : layout;
  const targetIdx = cleaned.panels.findIndex((p) => p.sessionId === targetSessionId);
  // cleaned 后 target 仍在（target ≠ ref）。
  const panels = [...cleaned.panels];
  const newRows = [...cleaned.newRows];
  const sizes = { ...cleaned.sizes };

  if (zone === "center") {
    // 替换：target 位置 panelRef 换成 ref，继承 target 的 size；target 的 size 删除。
    const targetSize = sizes[targetSessionId] ?? WORKBENCH_PANEL_DEFAULT_FLEX;
    panels[targetIdx] = ref;
    delete sizes[targetSessionId];
    sizes[ref.sessionId] = targetSize;
    // 若 target 是行首（在 newRows）→ newRows 里 target 换成 ref（ref 接管行首职责）。
    const newRowIdx = newRows.indexOf(targetSessionId);
    if (newRowIdx >= 0) newRows[newRowIdx] = ref.sessionId;
    // 若 ref 之前在 newRows（removePanel 已清掉 ref 的 newRows 标记，但 cleaned.newRows
    // 已 filter 过 ref.sessionId，此处不需要再处理）。
    // target 被 ref 替换后从 panels 消失；若 target 正是 maximized 的 group，必须清空
    // maximized，否则 deriveRows 找不到 maximized 对应 panel 会返 [] → 工作区空态死锁。
    const maximized = cleaned.maximized === targetSessionId ? null : cleaned.maximized;
    return { ...cleaned, panels, newRows, sizes, maximized };
  }

  // 插入位置 + 是否起新行。
  let insertIdx: number;
  let newRowSessionId: string | null;
  if (zone === "up") {
    // ref 插在 target 之前；target 起新行（ref 留旧行在上方）。
    insertIdx = targetIdx;
    newRowSessionId = targetSessionId;
  } else if (zone === "down") {
    // ref 插在 target 之后；ref 起新行（在 target 下方）。
    insertIdx = targetIdx + 1;
    newRowSessionId = ref.sessionId;
  } else if (zone === "left") {
    // ref 插在 target 之前，同行。
    insertIdx = targetIdx;
    newRowSessionId = null;
  } else {
    // right：ref 插在 target 之后，同行。
    insertIdx = targetIdx + 1;
    newRowSessionId = null;
  }

  panels.splice(insertIdx, 0, ref);
  sizes[ref.sessionId] = WORKBENCH_PANEL_DEFAULT_FLEX;
  if (newRowSessionId !== null && !newRows.includes(newRowSessionId)) {
    newRows.push(newRowSessionId);
  }
  return { ...cleaned, panels, newRows, sizes };
}

// ── 中栏 group+tab 布局（VSCode 两级模型，设计文档 §7.5/§7.6）─────────────────
// group = 分屏区域（行×列网格），tab = 实例（每 group 1-N，同 group 只显 active tab）。
// 取代旧 panels/newRows 1:1 模型。commit 2 仅新增：旧 WorkbenchLayout（4 字段）与
// addPanel/deriveRows/dropPanel/resizePair/toggleMaximize 等保留至 commit 3 渲染层切换，
// 避免中间态编译断裂。函数名用语义化新名（deriveGroupRows/dropIntoGroup/...）规避与旧函数撞名；
// commit 3 删旧后再视情况 rename 回 deriveRows/dropPanel。
//
// flex 权重常量复用旧 WORKBENCH_PANEL_DEFAULT_FLEX/MIN_FLEX（数值语义一致：横向 group 宽度与
// 纵向行高度都用同一 min/default）；commit 3 删旧函数后可 rename 为通用 WORKBENCH_FLEX_*。

/** VSCode 两级模型：group = 分屏区域，含 N 个 tab（实例），同 group 只显 active tab。 */
export type WorkbenchGroup = {
  id: string;
  tabs: WorkbenchPanelRef[];
  activeTabId: string;
};

/**
 * 中栏 group+tab 布局 state（设计 §7.6）。State/Render 分离：raw 有序结构，渲染由纯函数派生。
 * - `groups`：有序扁平 group 列表（左→右铺开；`newRowAfter` 标记的 groupId 之后起新行）。
 * - `newRowAfter`：标记「此 groupId 之后换行」（split-down）；列表首项忽略标记。
 *   语义与旧 `newRows`（标记自己起新行）相反——这里标记的是「行尾 group」，其下一个 group 起新行。
 * - `sizes`：每个 group 在行内的横向 flex 宽度权重（key=groupId，**非 sessionId**——切 tab 不改 group 宽度）。
 * - `rowSizes`：每行的纵向 flex 高度权重（key=**行首 groupId**）。
 * - `activeGroupId`：当前激活 group（点 tab / 点卡片 / maximize 都设它）；maximized 时它 = maximized。
 *   显式存（不能只从 focusId 反查：minimized 时 tab 不在 layout，反查会崩）。
 * - `maximized`：独占 group 的 groupId（group 级，非 tab 级）；独占时该 group tab 栏仍在可切 tab，
 *   其他 group 用 CSS `hidden` 隐藏（不 unmount，保 WebSocket 长连 / claude2 relay 早消息）。
 */
export type WorkbenchLayoutV2 = {
  groups: WorkbenchGroup[];
  newRowAfter: string[];
  sizes: Record<string, number>;
  rowSizes: Record<string, number>;
  activeGroupId: string | null;
  maximized: string | null;
};

export const EMPTY_WORKBENCH_LAYOUT_V2: WorkbenchLayoutV2 = {
  groups: [],
  newRowAfter: [],
  sizes: {},
  rowSizes: {},
  activeGroupId: null,
  maximized: null,
};

/** 生成 group id（crypto.randomUUID，与 claude2-adapter 一致，无新依赖）。 */
function createGroupId(): string {
  return crypto.randomUUID();
}

/**
 * 创建一个含单 tab 的 group（dropIntoGroup 开新 group / 首次进入工作区用）。
 * `id` 可选（测试传固定值断言；生产用 crypto.randomUUID）。
 */
export function createGroup(tab: WorkbenchPanelRef, id: string = createGroupId()): WorkbenchGroup {
  return { id, tabs: [tab], activeTabId: tab.sessionId };
}

/**
 * 从 group 布局派生二维行结构（渲染层纯函数，设计 §7.5）。`newRowAfter` 标记的 groupId 之后起新行。
 * maximized 时返回单 group 单行（派生，不改 state；maximized 的 group 不存在则返 []）。
 */
export function deriveGroupRows(layout: WorkbenchLayoutV2): WorkbenchGroup[][] {
  if (layout.maximized !== null) {
    const max = layout.groups.find((g) => g.id === layout.maximized);
    return max ? [[max]] : [];
  }
  const breakAfter = new Set(layout.newRowAfter);
  const rows: WorkbenchGroup[][] = [];
  let current: WorkbenchGroup[] = [];
  for (const group of layout.groups) {
    current.push(group);
    if (breakAfter.has(group.id)) {
      rows.push(current);
      current = [];
    }
  }
  if (current.length > 0) rows.push(current);
  return rows;
}

/**
 * 重算 rowSizes 键（私有 normalize）：groups/newRowAfter 变更后，行首集合可能变，
 * 只保留仍存在的行首 groupId 的值，新行首用默认权重。被 addGroup/removeGroup/dropIntoGroup 调用。
 */
function normalizeRowSizes(layout: WorkbenchLayoutV2): WorkbenchLayoutV2 {
  const rowSizes: Record<string, number> = {};
  for (const row of deriveGroupRows({ ...layout, maximized: null })) {
    const headId = row[0].id;
    rowSizes[headId] = layout.rowSizes[headId] ?? WORKBENCH_PANEL_DEFAULT_FLEX;
  }
  return { ...layout, rowSizes };
}

/**
 * 按 sessionId 反查 tab 位置（设计 §7.13 focusId 反查）。返回 { groupId, tabIndex } 或 null
 *（tab minimized / 不存在）。minimized 时 URL focusId 不动（不死循环），右栏 inspection 跟活动 tab。
 */
export function findTabBySessionId(
  layout: WorkbenchLayoutV2,
  sessionId: string,
): { groupId: string; tabIndex: number } | null {
  for (const group of layout.groups) {
    const tabIndex = group.tabs.findIndex((t) => t.sessionId === sessionId);
    if (tabIndex >= 0) return { groupId: group.id, tabIndex };
  }
  return null;
}

/** 派生活动 group 的活动 tab 引用（渲染层右栏 inspection / 输入作用域用）。无活动 group → null。 */
export function activeTabRef(layout: WorkbenchLayoutV2): WorkbenchPanelRef | null {
  if (layout.activeGroupId === null) return null;
  const group = layout.groups.find((g) => g.id === layout.activeGroupId);
  if (!group) return null;
  return group.tabs.find((t) => t.sessionId === group.activeTabId) ?? null;
}

/**
 * 向布局加入 group（split-right 默认；`newRow` 起新行 = split-down）。`afterGroupId` 指定插入位置，
 * 缺省 push 末尾。首个 group 设 activeGroupId（后续 addGroup 不抢 active）。newRow 时把
 * 「新 group 的前一个 group」加入 newRowAfter（它之后换行 → 新 group 起新行）。
 */
export function addGroup(
  layout: WorkbenchLayoutV2,
  group: WorkbenchGroup,
  opts: { afterGroupId?: string; newRow?: boolean } = {},
): WorkbenchLayoutV2 {
  const groups = [...layout.groups];
  const idx =
    opts.afterGroupId === undefined ? -1 : groups.findIndex((g) => g.id === opts.afterGroupId);
  const insertIdx = idx >= 0 ? idx + 1 : groups.length;
  // anchorId = 新 group 插入前的前一个 group（newRow 时作 newRowAfter 锚点）。
  const anchorId = insertIdx > 0 ? groups[insertIdx - 1].id : null;
  groups.splice(insertIdx, 0, group);
  const newRowAfter =
    opts.newRow === true && anchorId !== null && !layout.newRowAfter.includes(anchorId)
      ? [...layout.newRowAfter, anchorId]
      : layout.newRowAfter;
  const sizes = { ...layout.sizes, [group.id]: WORKBENCH_PANEL_DEFAULT_FLEX };
  const activeGroupId = layout.activeGroupId ?? group.id;
  return normalizeRowSizes({ ...layout, groups, newRowAfter, sizes, activeGroupId });
}

/**
 * 删除 group（设计 §7.4 group 操作）。联动清理 sizes/newRowAfter/rowSizes/maximized/activeGroupId。
 * - newRowAfter：删 groupId 自身（它作过换行锚点）。
 * - rowSizes：normalizeRowSizes 按新行结构重算（删行首 group 时下一行上移，行首变更）。
 * - maximized：删的是 maximized → null。
 * - activeGroupId：删的是 active → 回退第一个剩余 group（或 null）。
 */
export function removeGroup(layout: WorkbenchLayoutV2, groupId: string): WorkbenchLayoutV2 {
  if (!layout.groups.some((g) => g.id === groupId)) return layout;
  const groups = layout.groups.filter((g) => g.id !== groupId);
  const sizes = { ...layout.sizes };
  delete sizes[groupId];
  const newRowAfter = layout.newRowAfter.filter((id) => id !== groupId);
  const maximized = layout.maximized === groupId ? null : layout.maximized;
  const activeGroupId =
    layout.activeGroupId === groupId ? (groups[0]?.id ?? null) : layout.activeGroupId;
  return normalizeRowSizes({ ...layout, groups, newRowAfter, sizes, activeGroupId, maximized });
}

/**
 * 在 group 队尾加 tab + 设为 active（点卡片未开 = 活动组开新 tab，设计 §7.3）。重复 sessionId
 * 仅激活不重复加（点卡片已开 = 激活该 tab）。
 */
export function addTabToGroup(
  layout: WorkbenchLayoutV2,
  groupId: string,
  tab: WorkbenchPanelRef,
): WorkbenchLayoutV2 {
  const idx = layout.groups.findIndex((g) => g.id === groupId);
  if (idx < 0) return layout;
  const group = layout.groups[idx];
  if (group.tabs.some((t) => t.sessionId === tab.sessionId)) {
    return setActiveTab(layout, groupId, tab.sessionId);
  }
  const groups = [...layout.groups];
  groups[idx] = { ...group, tabs: [...group.tabs, tab], activeTabId: tab.sessionId };
  return { ...layout, groups };
}

/** 激活 group 的指定 tab（点 tab 切换）。同时设 activeGroupId（点 tab 也激活 group）。 */
export function setActiveTab(
  layout: WorkbenchLayoutV2,
  groupId: string,
  tabId: string,
): WorkbenchLayoutV2 {
  const idx = layout.groups.findIndex((g) => g.id === groupId);
  if (idx < 0) return layout;
  const group = layout.groups[idx];
  if (!group.tabs.some((t) => t.sessionId === tabId)) return layout;
  if (group.activeTabId === tabId && layout.activeGroupId === groupId) return layout;
  const groups = [...layout.groups];
  groups[idx] = { ...group, activeTabId: tabId };
  return { ...layout, groups, activeGroupId: groupId };
}

/**
 * 从 group 移除 tab（= 最小化，设计 §7.2：tab ✕ = 移除 tab，session 存活回左总览）。
 * 删的是 active → activeTabId 切剩余 [0]；group 空 → removeGroup（合并清理）。
 */
export function removeTabFromGroup(
  layout: WorkbenchLayoutV2,
  groupId: string,
  tabId: string,
): WorkbenchLayoutV2 {
  const idx = layout.groups.findIndex((g) => g.id === groupId);
  if (idx < 0) return layout;
  const group = layout.groups[idx];
  const newTabs = group.tabs.filter((t) => t.sessionId !== tabId);
  if (newTabs.length === 0) return removeGroup(layout, groupId);
  const newActiveTabId = group.activeTabId === tabId ? newTabs[0].sessionId : group.activeTabId;
  const groups = [...layout.groups];
  groups[idx] = { ...group, tabs: newTabs, activeTabId: newActiveTabId };
  return { ...layout, groups };
}

/**
 * 拖 gutter 调整同行相邻 group 横向宽度（设计 §7.5，复用旧 resizePair 守恒钳制逻辑，键改 groupId）。
 * 守恒：左增 = 右减（deltaFlex 为左的增量）；两侧各钳到 MIN_FLEX，钳制时 delta 截到可调边界仍守恒。
 */
export function resizeGroups(
  layout: WorkbenchLayoutV2,
  leftGroupId: string,
  rightGroupId: string,
  deltaFlex: number,
): WorkbenchLayoutV2 {
  const left = layout.sizes[leftGroupId] ?? WORKBENCH_PANEL_DEFAULT_FLEX;
  const right = layout.sizes[rightGroupId] ?? WORKBENCH_PANEL_DEFAULT_FLEX;
  const clamped = Math.min(
    Math.max(deltaFlex, WORKBENCH_PANEL_MIN_FLEX - left),
    right - WORKBENCH_PANEL_MIN_FLEX,
  );
  return {
    ...layout,
    sizes: { ...layout.sizes, [leftGroupId]: left + clamped, [rightGroupId]: right - clamped },
  };
}

/** 拖行间 gutter 调整相邻行纵向高度（设计 §7.5，纵向 resize，同款守恒钳制，key=行首 groupId）。 */
export function resizeRows(
  layout: WorkbenchLayoutV2,
  topRowHeadId: string,
  bottomRowHeadId: string,
  deltaFlex: number,
): WorkbenchLayoutV2 {
  const top = layout.rowSizes[topRowHeadId] ?? WORKBENCH_PANEL_DEFAULT_FLEX;
  const bottom = layout.rowSizes[bottomRowHeadId] ?? WORKBENCH_PANEL_DEFAULT_FLEX;
  const clamped = Math.min(
    Math.max(deltaFlex, WORKBENCH_PANEL_MIN_FLEX - top),
    bottom - WORKBENCH_PANEL_MIN_FLEX,
  );
  return {
    ...layout,
    rowSizes: {
      ...layout.rowSizes,
      [topRowHeadId]: top + clamped,
      [bottomRowHeadId]: bottom - clamped,
    },
  };
}

/** 切换 group 最大化（group 级，设计 §7.2：▢ = 独占右侧，其他 group hidden 不卸载）。maximize 时设 activeGroupId。 */
export function toggleGroupMaximize(layout: WorkbenchLayoutV2, groupId: string): WorkbenchLayoutV2 {
  if (layout.maximized === groupId) return { ...layout, maximized: null };
  return { ...layout, maximized: groupId, activeGroupId: groupId };
}

/**
 * 按 drop zone 把 ref 放入布局（Phase B 拖放主路径，设计 §7.3。纯函数）。
 *
 * - `targetGroupId === null`（空白区）：开首个 group（ref 已在某 group → 激活该 tab 不新 group）。
 * - `center`：在 target group 开新 tab（tab 模型下「替换」无意义；ref 已在 target → 激活；ref 在他组 → 迁移）。
 * - `left`/`right`：开新 group 与 target 同行（right 时若 target 是行尾，换行标记迁移到新 group）。
 * - `up`/`down`：开新 group 起新行（up 时新 group 单独一行：上下都换行）。
 *
 * ref 已在 layout（重排/跨 group 迁移）：先 removeTabFromGroup 从原 group 移除再插入。
 * 改 groups/newRowAfter 后 normalizeRowSizes 重算行首 rowSizes。
 */
export function dropIntoGroup(
  layout: WorkbenchLayoutV2,
  ref: WorkbenchPanelRef,
  targetGroupId: string | null,
  zone: DropZone,
): WorkbenchLayoutV2 {
  // 空白区：开首个 group（或激活已存在 tab）。
  if (targetGroupId === null) {
    const existing = findTabBySessionId(layout, ref.sessionId);
    if (existing) return setActiveTab(layout, existing.groupId, ref.sessionId);
    return addGroup(layout, createGroup(ref));
  }
  const targetIdx = layout.groups.findIndex((g) => g.id === targetGroupId);
  if (targetIdx < 0) return layout;

  // center：在 target group 开新 tab（已存在则激活/迁移）。
  if (zone === "center") {
    const existing = findTabBySessionId(layout, ref.sessionId);
    if (existing && existing.groupId === targetGroupId) {
      return setActiveTab(layout, targetGroupId, ref.sessionId);
    }
    let next = layout;
    if (existing) {
      // ref 在他组 → 先从原组移除（minimize），再加到 target（原组空则自动 removeGroup）。
      next = removeTabFromGroup(next, existing.groupId, ref.sessionId);
    }
    return addTabToGroup(next, targetGroupId, ref);
  }

  // up/down/left/right：开新 group 分屏。先从原位置移除 ref（若已存在）。
  let next = layout;
  const existing = findTabBySessionId(layout, ref.sessionId);
  if (existing) {
    next = removeTabFromGroup(next, existing.groupId, ref.sessionId);
  }
  // 重定位 target（removeTabFromGroup 可能缩短 groups 数组）。
  const tIdx = next.groups.findIndex((g) => g.id === targetGroupId);
  if (tIdx < 0) return next;

  const newGroup = createGroup(ref);
  const groups = [...next.groups];
  const newRowAfter = [...next.newRowAfter];
  const sizes = { ...next.sizes, [newGroup.id]: WORKBENCH_PANEL_DEFAULT_FLEX };

  if (zone === "left") {
    // 新 group 插 target 之前，同行（newRowAfter 不动；target 原行首换行标记自然让新 group 接管行首）。
    groups.splice(tIdx, 0, newGroup);
  } else if (zone === "right") {
    // 新 group 插 target 之后，同行；若 target 是行尾（在 newRowAfter），换行标记迁移到新 group。
    groups.splice(tIdx + 1, 0, newGroup);
    const i = newRowAfter.indexOf(targetGroupId);
    if (i >= 0) newRowAfter.splice(i, 1, newGroup.id);
  } else if (zone === "up") {
    // up：新 group 在 target 所在行上方独占新行（行=整行分裂）。插该行行首之前；行首前后都换行。
    const targetRow = deriveGroupRows({ ...next, maximized: null }).find((row) =>
      row.some((g) => g.id === targetGroupId),
    );
    if (!targetRow) return next;
    const headIdx = groups.findIndex((g) => g.id === targetRow[0].id);
    groups.splice(headIdx, 0, newGroup);
    if (!newRowAfter.includes(newGroup.id)) newRowAfter.push(newGroup.id);
    const prevId = headIdx > 0 ? groups[headIdx - 1].id : null;
    if (prevId !== null && !newRowAfter.includes(prevId)) newRowAfter.push(prevId);
  } else {
    // down：新 group 在 target 所在行下方独占新行。插该行行尾之后；行尾之后换行 + 新 group 之后换行（独占）。
    const targetRow = deriveGroupRows({ ...next, maximized: null }).find((row) =>
      row.some((g) => g.id === targetGroupId),
    );
    if (!targetRow) return next;
    const tailId = targetRow[targetRow.length - 1].id;
    const tailIdx = groups.findIndex((g) => g.id === tailId);
    groups.splice(tailIdx + 1, 0, newGroup);
    if (!newRowAfter.includes(tailId)) newRowAfter.push(tailId);
    if (!newRowAfter.includes(newGroup.id)) newRowAfter.push(newGroup.id);
  }

  const activeGroupId = next.activeGroupId ?? newGroup.id;
  return normalizeRowSizes({ ...next, groups, newRowAfter, sizes, activeGroupId });
}

/**
 * 旧 4 字段布局（panels/newRows，1 group=1 instance）→ 新 7 字段 group+tab 布局（无损迁移）。
 * 每个 panel → 1 group（含 1 tab）。**用 sessionId 作 group id**（确定性，便于 maximized/sizes 映射；
 * 后续新 group 用 crypto.randomUUID，id 空间不冲突）。newRows（自己起新行）→ newRowAfter（前一个之后换行）。
 * maximized/sessionId 直接映射到 group id；rowSizes 每行行首默认权重（旧模型无纵向 resize）。
 */
export function migrateLegacyLayout(legacy: WorkbenchLayout): WorkbenchLayoutV2 {
  const groups: WorkbenchGroup[] = legacy.panels.map((panel) => ({
    id: panel.sessionId,
    tabs: [panel],
    activeTabId: panel.sessionId,
  }));
  const newRowSet = new Set(legacy.newRows);
  const newRowAfter: string[] = [];
  for (let i = 0; i < legacy.panels.length; i++) {
    const next = legacy.panels[i + 1];
    if (next && newRowSet.has(next.sessionId)) {
      // next 起新行（旧 newRows 语义）= 当前 panel 之后换行（新 newRowAfter 语义）。
      newRowAfter.push(legacy.panels[i].sessionId);
    }
  }
  const sizes: Record<string, number> = {};
  for (const panel of legacy.panels) {
    sizes[panel.sessionId] = legacy.sizes[panel.sessionId] ?? WORKBENCH_PANEL_DEFAULT_FLEX;
  }
  const rowSizes: Record<string, number> = {};
  if (legacy.panels.length > 0) rowSizes[legacy.panels[0].sessionId] = WORKBENCH_PANEL_DEFAULT_FLEX;
  for (const sid of legacy.newRows) rowSizes[sid] = WORKBENCH_PANEL_DEFAULT_FLEX;
  const activeGroupId = groups[0]?.id ?? null;
  return { groups, newRowAfter, sizes, rowSizes, activeGroupId, maximized: legacy.maximized };
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
  /** 最后活动时间（table 视图"最后活动"列，ISO；来自 session.updatedAt）。 */
  updatedAt?: string;
  /** 创建时间（table "最后活动"列 fallback；AgentSession 有，terminal 无）。 */
  createdAt?: string;
  /** 卡片第二行（agent=lastAssistantMessage / terminal=lastCommand）；缺失则卡片不显第二行。 */
  subtitle?: string;
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

/**
 * 按项目名分组全局候选（设计文档 §5 grouped 视图 + 移动 global 默认分段）。返回**稳定数组**
 *（非 Map）：组顺序 = candidates 首次出现的项目名顺序（与 rankGlobalInstances 同源稳定排序，
 * 即聚合时的项目次序 → 项目内 sessions 次序）。纯函数，桌面 GroupedView / 移动 MobileGlobalOverview
 * 共用，避免两处内联 Map 逻辑。
 */
export type ProjectGroup = {
  projectName: string;
  candidates: GlobalInstanceCandidate[];
};

export function groupByProject(candidates: GlobalInstanceCandidate[]): ProjectGroup[] {
  const groups: ProjectGroup[] = [];
  const indexByName = new Map<string, number>();
  for (const candidate of candidates) {
    const name = candidate.ref.projectName;
    const idx = indexByName.get(name);
    if (idx === undefined) {
      indexByName.set(name, groups.length);
      groups.push({ projectName: name, candidates: [candidate] });
    } else {
      groups[idx].candidates.push(candidate);
    }
  }
  return groups;
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
