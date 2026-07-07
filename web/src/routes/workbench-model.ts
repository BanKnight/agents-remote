import { atom, useAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { useEffect, useState } from "react";
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
 * 桌面视口检测（lg = 1024px，与 WorkbenchShell 三栏/单列断点一致）。
 * 移动端（<lg）走 MobileWorkbench 线性退化；桌面走三栏。供 `IndexRoute` 在 `/` 入口
 * 按视口分流（桌面 global 工作台 / 移动项目列表），以及 `WorkbenchContent` 选三栏/线性。
 *
 * 客户端首 render 即真实 viewport（CSR 无 hydrate mismatch，移动端不会先闪工作台再切列表）；
 * `?? true` 仅为 jsdom 等无 matchMedia 环境的 fallback。
 */
export function useIsDesktopViewport() {
  const [isDesktop, setIsDesktop] = useState(
    () => window.matchMedia?.("(min-width: 1024px)").matches ?? true,
  );
  useEffect(() => {
    const media = window.matchMedia?.("(min-width: 1024px)");
    if (!media) return;
    const handler = () => setIsDesktop(media.matches);
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, []);
  return isDesktop;
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

// ── drop zone 判定（设计 §7.2 5 drop zone，V2 dropIntoGroup 的 building block）────
// deriveZone 把指针位置映射到 5 zone；V2 dropIntoGroup 按返回的 zone 编排 group 增删/换行。

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

// ── 中栏 group+tab 布局（VSCode 两级模型，设计文档 §7.5/§7.6）─────────────────
// group = 分屏区域（行×列网格），tab = 实例（每 group 1-N，同 group 只显 active tab）。
// WorkbenchLayout（4 字段 panels/newRows）仅保留作 migrateLegacyLayout 的 legacy 输入类型；
// 渲染/编辑全走 WorkbenchLayoutV2 + deriveGroupRows/dropIntoGroup 等纯函数。
// flex 权重常量 WORKBENCH_PANEL_DEFAULT_FLEX/MIN_FLEX 横向 group 宽度与纵向行高度共用。

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
  return {
    groups,
    newRowAfter,
    sizes,
    rowSizes,
    activeGroupId,
    maximized: legacy.maximized ?? null,
  };
}

// ── 中栏 n 叉树布局（V3，VSCode 同构，设计文档 §7.5/§7.6）─────────────────────
// V2 规则行模型「新起一行 = 占满整行」绑定不可分，无法表达单 group 内部上下分屏；
// V3 改 n 叉树：每次 split 在某 leaf 一侧插兄弟 leaf，同方向追加到现有 split（不嵌套），
// 不同方向用 wrap(target,newLeaf) 替换 target。LeafNode 复用 WorkbenchGroup 结构
//（GroupCell 零改动）；SplitNode 持 sizes（父控子占比，支持嵌套）。
// V2 仅保留迁移 building block（deriveGroupRows/migrateLegacyLayout）；V2→V3 由 migrateV2ToV3 一次性迁移。

/** split 方向：horizontal=flex-row 左右排，vertical=flex-col 上下排。 */
export type SplitDirection = "horizontal" | "vertical";

/** 叶节点 = group（含 N tab，同 group 只显 active tab）。复用 WorkbenchGroup 结构。 */
export type LeafNode = WorkbenchGroup & { kind: "leaf" };

/** split 节点：按 direction 排布 children，sizes 控各 child 占比（key=child.id，默认权重）。 */
export type SplitNode = {
  kind: "split";
  id: string;
  direction: SplitDirection;
  children: TreeNode[];
  sizes: Record<string, number>;
};

export type TreeNode = LeafNode | SplitNode;

/**
 * 中栏 n 叉树布局 state（设计 §7.6）。State/Render 分离：raw 树结构，渲染由 WorkspaceTree 递归。
 * - `root`：树根（null=空工作区）。叶=group，split=按方向排布的子树。
 * - `activeGroupId`：当前激活 leaf（必为树中某 leaf id 或 null）。
 * - `maximized`：独占 leaf 的 id（leaf 级）；独占时该 leaf tab 栏仍可切 tab，其他 leaf hidden 不卸载。
 */
export type WorkbenchLayoutV3 = {
  root: TreeNode | null;
  activeGroupId: string | null;
  maximized: string | null;
};

export const EMPTY_WORKBENCH_LAYOUT_V3: WorkbenchLayoutV3 = {
  root: null,
  activeGroupId: null,
  maximized: null,
};

/** 生成 split id（crypto.randomUUID，稳定：children 重组后 sizes key 不错位）。 */
function createSplitId(): string {
  return crypto.randomUUID();
}

/** 创建含单 tab 的 leaf（dropIntoLeaf 开新 group / 首次进入用）。id 可选（测试断言用）。 */
export function createLeaf(tab: WorkbenchPanelRef, id: string = createGroupId()): LeafNode {
  return { kind: "leaf", id, tabs: [tab], activeTabId: tab.sessionId };
}

// ── 树遍历辅助（私有，纯函数）─────────────────────────────────────────────────

/** 子树是否含某 id。 */
function containsId(node: TreeNode, id: string): boolean {
  if (node.id === id) return true;
  if (node.kind === "leaf") return false;
  return node.children.some((c) => containsId(c, id));
}

/** 前序收集所有叶子（渲染/查找/不变式校验用）。 */
export function collectLeaves(node: TreeNode | null): LeafNode[] {
  if (!node) return [];
  if (node.kind === "leaf") return [node];
  return node.children.flatMap(collectLeaves);
}

/** 前序首个叶子（active/maximized 回退用）。 */
function firstLeaf(node: TreeNode | null): LeafNode | null {
  if (!node) return null;
  if (node.kind === "leaf") return node;
  return firstLeaf(node.children[0]);
}

/** 按 id 查任意节点。 */
function findNode(node: TreeNode | null, id: string): TreeNode | null {
  if (!node) return null;
  if (node.id === id) return node;
  if (node.kind === "leaf") return null;
  for (const child of node.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

/** 按 id 查叶子（非 leaf 或不存在返 null）。 */
export function findLeafNode(node: TreeNode | null, leafId: string): LeafNode | null {
  const found = findNode(node, leafId);
  return found && found.kind === "leaf" ? found : null;
}

/** 找直接含 leafId 的 split（leafId 是其直接 child）。null = leafId 是 root 自身或不在树。 */
function findParentSplit(
  node: TreeNode,
  leafId: string,
): { parent: SplitNode; index: number } | null {
  if (node.kind === "leaf") return null;
  const directIdx = node.children.findIndex((c) => c.id === leafId);
  if (directIdx !== -1) return { parent: node, index: directIdx };
  for (const child of node.children) {
    if (child.kind === "split" && containsId(child, leafId)) {
      return findParentSplit(child, leafId);
    }
  }
  return null;
}

/** 把树中 oldId 节点替换成 replacement（不可变，返回新树；oldId 不在则原样返回）。 */
function replaceInTree(root: TreeNode, oldId: string, replacement: TreeNode): TreeNode {
  if (root.id === oldId) return replacement;
  if (root.kind === "leaf") return root;
  let changed = false;
  const newChildren = root.children.map((c) => {
    if (containsId(c, oldId)) {
      changed = true;
      return replaceInTree(c, oldId, replacement);
    }
    return c;
  });
  return changed ? { ...root, children: newChildren } : root;
}

// ── 树编辑辅助（私有，递归不可变）─────────────────────────────────────────────

/**
 * 从子树删 leaf 的某 tab（leaf 清空则整 leaf 删，触发子树提升）。
 * 返回新子树（null = 此子树整体被删空）。child 退化提升（剩 1 child）时返回该 sole child，
 * id 变，调用方据 `result.id !== child.id` 迁移 sizes 权重。
 *
 * 正常 layout（不变式：同方向不嵌套）下，removeLeaf/removeTab 不会产生新的同方向嵌套：
 * 退化提升的 sole child 方向必与其新祖父不同（祖父与原父不同方向，原父与 sole 同方向才退化，
 * 故祖父与 sole 不同方向），无需主动合并。
 */
function removeTabFromLeafTree(node: TreeNode, leafId: string, tabId: string): TreeNode | null {
  if (node.kind === "leaf") {
    if (node.id !== leafId) return node;
    const newTabs = node.tabs.filter((t) => t.sessionId !== tabId);
    if (newTabs.length === 0) return null;
    const newActive = node.activeTabId === tabId ? newTabs[0].sessionId : node.activeTabId;
    return { ...node, tabs: newTabs, activeTabId: newActive };
  }
  if (!containsId(node, leafId)) return node;
  const newSizes: Record<string, number> = {};
  const newChildren: TreeNode[] = [];
  for (const child of node.children) {
    const result = removeTabFromLeafTree(child, leafId, tabId);
    if (result === null) continue; // child 整体被删，sizes key 不迁移
    const key = result.id === child.id ? child.id : result.id; // 退化提升 → 权重迁移给新 id
    newSizes[key] = node.sizes[child.id] ?? WORKBENCH_PANEL_DEFAULT_FLEX;
    newChildren.push(result);
  }
  if (newChildren.length === 0) return null;
  if (newChildren.length === 1) return newChildren[0]; // 退化提升 sole，丢弃本层 sizes
  return { ...node, children: newChildren, sizes: newSizes };
}

/** 删整个 leaf（不管 tab，kill prune / 测试用）。子树提升同 removeTabFromLeafTree。 */
function removeLeafFromTree(node: TreeNode, leafId: string): TreeNode | null {
  if (node.kind === "leaf") return node.id === leafId ? null : node;
  if (!containsId(node, leafId)) return node;
  const newSizes: Record<string, number> = {};
  const newChildren: TreeNode[] = [];
  for (const child of node.children) {
    const result = removeLeafFromTree(child, leafId);
    if (result === null) continue;
    const key = result.id === child.id ? child.id : result.id;
    newSizes[key] = node.sizes[child.id] ?? WORKBENCH_PANEL_DEFAULT_FLEX;
    newChildren.push(result);
  }
  if (newChildren.length === 0) return null;
  if (newChildren.length === 1) return newChildren[0];
  return { ...node, children: newChildren, sizes: newSizes };
}

/** 激活 leaf 的指定 tab（树内替换，不变结构）。leafId/tabId 不匹配则原样。 */
function setActiveTabInLeafTree(node: TreeNode, leafId: string, tabId: string): TreeNode {
  if (node.kind === "leaf") {
    if (node.id !== leafId || !node.tabs.some((t) => t.sessionId === tabId)) return node;
    if (node.activeTabId === tabId) return node;
    return { ...node, activeTabId: tabId };
  }
  if (!containsId(node, leafId)) return node;
  let changed = false;
  const newChildren = node.children.map((c) => {
    if (containsId(c, leafId)) {
      changed = true;
      return setActiveTabInLeafTree(c, leafId, tabId);
    }
    return c;
  });
  return changed ? { ...node, children: newChildren } : node;
}

/** 向 leaf 加 tab（重复 sessionId 转激活）。leafId 不匹配则原样。 */
function addTabToLeafTree(node: TreeNode, leafId: string, tab: WorkbenchPanelRef): TreeNode {
  if (node.kind === "leaf") {
    if (node.id !== leafId) return node;
    if (node.tabs.some((t) => t.sessionId === tab.sessionId)) {
      return setActiveTabInLeafTree(node, leafId, tab.sessionId);
    }
    return { ...node, tabs: [...node.tabs, tab], activeTabId: tab.sessionId };
  }
  if (!containsId(node, leafId)) return node;
  let changed = false;
  const newChildren = node.children.map((c) => {
    if (containsId(c, leafId)) {
      changed = true;
      return addTabToLeafTree(c, leafId, tab);
    }
    return c;
  });
  return changed ? { ...node, children: newChildren } : node;
}

/** 用新 split（a/b 两 child）替换 a（不同方向分屏）。aFirst=true → [a, b]，否则 [b, a]。 */
function wrapInSplit(
  a: TreeNode,
  b: LeafNode,
  direction: SplitDirection,
  aFirst: boolean,
): SplitNode {
  const children = aFirst ? [a, b] : [b, a];
  return {
    kind: "split",
    id: createSplitId(),
    direction,
    children,
    sizes: {
      [a.id]: WORKBENCH_PANEL_DEFAULT_FLEX,
      [b.id]: WORKBENCH_PANEL_DEFAULT_FLEX,
    },
  };
}

/**
 * 在 targetLeafId 一侧分屏插 newLeaf（drop edge 核心）。
 * - 同方向（父 split.direction === direction）→ 在父 split 的 target 索引前/后插 newLeaf（不嵌套）。
 * - 不同方向 → wrap(target, newLeaf, direction) 替换 target。
 * - targetLeafId 是 root 自身（leaf）→ wrap(root, newLeaf) 作新 root。
 * - targetLeafId 不在树（drop 预处理删空）→ 兜底返回 newLeaf 作新 root。
 */
function splitLeafInTree(
  root: TreeNode,
  targetLeafId: string,
  newLeaf: LeafNode,
  direction: SplitDirection,
  newLeafFirst: boolean,
): TreeNode {
  if (root.kind === "leaf" && root.id === targetLeafId) {
    return wrapInSplit(root, newLeaf, direction, !newLeafFirst);
  }
  const found = findParentSplit(root, targetLeafId);
  if (!found) return newLeaf;
  const { parent, index } = found;
  if (parent.direction === direction) {
    const at = newLeafFirst ? index : index + 1;
    const children = [...parent.children];
    children.splice(at, 0, newLeaf);
    const sizes = { ...parent.sizes, [newLeaf.id]: WORKBENCH_PANEL_DEFAULT_FLEX };
    return replaceInTree(root, parent.id, { ...parent, children, sizes });
  }
  const target = parent.children[index];
  const wrapped = wrapInSplit(target, newLeaf, direction, !newLeafFirst);
  // wrap 替换 target：parent.sizes 须把 target.id 改成 wrapped.id（继承权重），否则 sizes key 错位。
  const targetWeight = parent.sizes[target.id] ?? WORKBENCH_PANEL_DEFAULT_FLEX;
  const newSizes = { ...parent.sizes };
  delete newSizes[target.id];
  newSizes[wrapped.id] = targetWeight;
  const newChildren = [...parent.children];
  newChildren[index] = wrapped;
  return replaceInTree(root, parent.id, { ...parent, children: newChildren, sizes: newSizes });
}

// ── V3 公开编辑 API ───────────────────────────────────────────────────────────

/** 向 leaf 加 tab（设计 §7.3 center）。重复 sessionId 转激活。leaf 不在树 → 原样。 */
export function addTabToLeaf(
  layout: WorkbenchLayoutV3,
  leafId: string,
  tab: WorkbenchPanelRef,
): WorkbenchLayoutV3 {
  if (!layout.root || !findLeafNode(layout.root, leafId)) return layout;
  const newRoot = addTabToLeafTree(layout.root, leafId, tab);
  return { ...layout, root: newRoot, activeGroupId: leafId };
}

/** 激活 leaf 的指定 tab（点 tab 切换，同时设 activeGroupId）。leaf 不在树 → 原样。 */
export function setActiveTabInLeaf(
  layout: WorkbenchLayoutV3,
  leafId: string,
  tabId: string,
): WorkbenchLayoutV3 {
  if (!layout.root || !findLeafNode(layout.root, leafId)) return layout;
  const newRoot = setActiveTabInLeafTree(layout.root, leafId, tabId);
  return { ...layout, root: newRoot, activeGroupId: leafId };
}

/**
 * 从 leaf 移除 tab（= 最小化，设计 §7.4）。leaf 清空 → 子树提升。
 * active/maximized 指向被删 leaf → 回退前序首 leaf / null。
 */
export function removeTabFromLeaf(
  layout: WorkbenchLayoutV3,
  leafId: string,
  tabId: string,
): WorkbenchLayoutV3 {
  if (!layout.root || !containsId(layout.root, leafId)) return layout;
  const newRoot = removeTabFromLeafTree(layout.root, leafId, tabId);
  const leafGone = !newRoot || !findLeafNode(newRoot, leafId);
  const maximized = leafGone && layout.maximized === leafId ? null : layout.maximized;
  let activeGroupId = layout.activeGroupId;
  if (leafGone && activeGroupId === leafId) {
    const first = firstLeaf(newRoot);
    activeGroupId = first ? first.id : null;
  }
  return { root: newRoot, activeGroupId, maximized };
}

/** 删除整个 leaf（kill prune stale 清理 / 测试用）。子树提升 + active/maximized 回退。 */
export function removeLeaf(layout: WorkbenchLayoutV3, leafId: string): WorkbenchLayoutV3 {
  if (!layout.root || !containsId(layout.root, leafId)) return layout;
  const newRoot = removeLeafFromTree(layout.root, leafId);
  const maximized = layout.maximized === leafId ? null : layout.maximized;
  let activeGroupId = layout.activeGroupId;
  if (activeGroupId === leafId) {
    const first = firstLeaf(newRoot);
    activeGroupId = first ? first.id : null;
  }
  return { root: newRoot, activeGroupId, maximized };
}

/**
 * 按 drop zone 把 ref 放入 V3 布局（设计 §7.3 局部分屏。纯函数）。
 *
 * - `targetLeafId === null`（空白）：ref 已在某 leaf → 激活该 tab；否则 root=createLeaf(ref)。
 * - `center`：addTabToLeaf(target)（ref 已在 target → 激活；在他 leaf → 迁移）。
 * - `left/right/up/down`：单 leaf 局部分屏。同方向追加到现有 split；不同方向 wrap(target, newLeaf)。
 *   drop 后 activeGroupId=newLeaf.id；maximized 清空（分屏退出独占）。
 *
 * 预处理：ref 已在某 leaf 且非「target=center 自身」→ 先 removeTabFromLeaf（重排/迁移）。
 * 边界：预处理后 targetLeafId 不在树（拖自己唯一 tab 到自己边缘）→ 兜底 root=createLeaf(ref)。
 */
export function dropIntoLeaf(
  layout: WorkbenchLayoutV3,
  ref: WorkbenchPanelRef,
  targetLeafId: string | null,
  zone: DropZone,
): WorkbenchLayoutV3 {
  let root = layout.root;

  if (targetLeafId === null) {
    if (root) {
      const existing = findLeafBySessionId(
        { root, activeGroupId: null, maximized: null },
        ref.sessionId,
      );
      if (existing) {
        return {
          ...layout,
          root: setActiveTabInLeafTree(root, existing.leafId, ref.sessionId),
          activeGroupId: existing.leafId,
        };
      }
    }
    const leaf = createLeaf(ref);
    return { ...layout, root: leaf, activeGroupId: leaf.id };
  }

  if (root && zone === "center") {
    const existing = findLeafBySessionId(
      { root, activeGroupId: null, maximized: null },
      ref.sessionId,
    );
    if (existing && existing.leafId === targetLeafId) {
      return setActiveTabInLeaf(layout, targetLeafId, ref.sessionId);
    }
    let next = layout;
    if (existing) next = removeTabFromLeaf(layout, existing.leafId, ref.sessionId);
    if (!next.root || !findLeafNode(next.root, targetLeafId)) {
      // 迁移连带头删了 target → 加到前序首 leaf（或 target 已不在）
      const first = next.root ? firstLeaf(next.root) : null;
      if (!first) {
        const leaf = createLeaf(ref);
        return { ...next, root: leaf, activeGroupId: leaf.id };
      }
      return addTabToLeaf(next, first.id, ref);
    }
    return addTabToLeaf(next, targetLeafId, ref);
  }

  // edge：先移除 ref（若已在树），再分屏。
  if (root) {
    const existing = findLeafBySessionId(
      { root, activeGroupId: null, maximized: null },
      ref.sessionId,
    );
    if (existing) {
      const after = removeTabFromLeaf(layout, existing.leafId, ref.sessionId);
      root = after.root;
    }
  }
  if (!root || !containsId(root, targetLeafId)) {
    const leaf = createLeaf(ref);
    return { ...layout, root: leaf, activeGroupId: leaf.id, maximized: null };
  }
  const direction: SplitDirection = zone === "left" || zone === "right" ? "horizontal" : "vertical";
  const newLeafFirst = zone === "left" || zone === "up";
  const newLeaf = createLeaf(ref);
  const newRoot = splitLeafInTree(root, targetLeafId, newLeaf, direction, newLeafFirst);
  return { ...layout, root: newRoot, activeGroupId: newLeaf.id, maximized: null };
}

/**
 * 拖 gutter 调「某 split 内相邻两 children」的 sizes 占比（设计 §7.4，守恒钳制）。
 * splitId/leftChildId/rightChildId 须匹配树结构（相邻），否则原样返回。
 */
export function resizeSplitChildren(
  layout: WorkbenchLayoutV3,
  splitId: string,
  leftChildId: string,
  rightChildId: string,
  deltaFlex: number,
): WorkbenchLayoutV3 {
  if (!layout.root) return layout;
  const split = findNode(layout.root, splitId);
  if (!split || split.kind !== "split") return layout;
  const leftIdx = split.children.findIndex((c) => c.id === leftChildId);
  const rightIdx = split.children.findIndex((c) => c.id === rightChildId);
  if (leftIdx < 0 || rightIdx !== leftIdx + 1) return layout;
  const left = split.sizes[leftChildId] ?? WORKBENCH_PANEL_DEFAULT_FLEX;
  const right = split.sizes[rightChildId] ?? WORKBENCH_PANEL_DEFAULT_FLEX;
  const clamped = Math.min(
    Math.max(deltaFlex, WORKBENCH_PANEL_MIN_FLEX - left),
    right - WORKBENCH_PANEL_MIN_FLEX,
  );
  const newSplit = {
    ...split,
    sizes: { ...split.sizes, [leftChildId]: left + clamped, [rightChildId]: right - clamped },
  };
  return { ...layout, root: replaceInTree(layout.root, splitId, newSplit) };
}

/** 切换 leaf 最大化（设计 §7.4 ▢ 独占）。maximize 时设 activeGroupId。 */
export function toggleLeafMaximize(layout: WorkbenchLayoutV3, leafId: string): WorkbenchLayoutV3 {
  if (layout.maximized === leafId) return { ...layout, maximized: null };
  return { ...layout, maximized: leafId, activeGroupId: leafId };
}

/** 按 sessionId 反查 leaf 位置（设计 §7.13 focusId 反查）。 */
export function findLeafBySessionId(
  layout: WorkbenchLayoutV3,
  sessionId: string,
): { leafId: string; tabIndex: number } | null {
  if (!layout.root) return null;
  for (const leaf of collectLeaves(layout.root)) {
    const tabIndex = leaf.tabs.findIndex((t) => t.sessionId === sessionId);
    if (tabIndex >= 0) return { leafId: leaf.id, tabIndex };
  }
  return null;
}

/** 查 sessionId 对应完整 tab 引用（含 projectName）。移动端 global scope 查 projectName 用。 */
export function findTabRefLeaf(
  layout: WorkbenchLayoutV3,
  sessionId: string,
): WorkbenchPanelRef | null {
  const found = findLeafBySessionId(layout, sessionId);
  if (!found || !layout.root) return null;
  return findLeafNode(layout.root, found.leafId)?.tabs[found.tabIndex] ?? null;
}

/** 派生活动 leaf 的活动 tab 引用（渲染层右栏 inspection / 输入作用域用）。 */
export function activeTabRefLeaf(layout: WorkbenchLayoutV3): WorkbenchPanelRef | null {
  if (!layout.root || layout.activeGroupId === null) return null;
  const leaf = findLeafNode(layout.root, layout.activeGroupId);
  if (!leaf) return null;
  return leaf.tabs.find((t) => t.sessionId === leaf.activeTabId) ?? null;
}

/**
 * 确保 ref 在 V3 布局中打开（focus effect / 移动切实例共用，设计 §7.3/§7.13）。
 * ref 已在某 leaf → 激活；不在 → 加到活动 leaf 开新 tab（无活动 → 新建首个 leaf）。
 */
export function ensureTabOpenLeaf(
  layout: WorkbenchLayoutV3,
  ref: WorkbenchPanelRef,
): WorkbenchLayoutV3 {
  if (!layout.root) {
    const leaf = createLeaf(ref);
    return { ...layout, root: leaf, activeGroupId: leaf.id };
  }
  const existing = findLeafBySessionId(layout, ref.sessionId);
  if (existing) return setActiveTabInLeaf(layout, existing.leafId, ref.sessionId);
  const targetLeafId = layout.activeGroupId ?? firstLeaf(layout.root)?.id;
  if (!targetLeafId) {
    const leaf = createLeaf(ref);
    return { ...layout, root: leaf, activeGroupId: leaf.id };
  }
  return addTabToLeaf(layout, targetLeafId, ref);
}

/** WorkbenchGroup → LeafNode（结构 1:1，加 kind 标记）。迁移专用。 */
function toLeaf(group: WorkbenchGroup): LeafNode {
  return { kind: "leaf", id: group.id, tabs: group.tabs, activeTabId: group.activeTabId };
}

/**
 * V2 规则行布局 → V3 n 叉树（无损迁移，设计 §7.6）。每行单 group → leaf；多 group → horizontal
 * split（sizes=V2 行内 sizes）；多行 → vertical split（sizes=V2 rowSizes[行首]，多 group 行的
 * 新 split id 映射该行行首的 rowSizes 值）。active/maximized 直接映射（V2 group id = V3 leaf id）。
 */
export function migrateV2ToV3(v2: WorkbenchLayoutV2): WorkbenchLayoutV3 {
  const rows = deriveGroupRows({ ...v2, maximized: null });
  if (rows.length === 0) return { root: null, activeGroupId: null, maximized: null };

  const rowNodes: TreeNode[] = rows.map((row) => {
    if (row.length === 1) return toLeaf(row[0]);
    const sizes: Record<string, number> = {};
    for (const g of row) sizes[g.id] = v2.sizes[g.id] ?? WORKBENCH_PANEL_DEFAULT_FLEX;
    return {
      kind: "split" as const,
      id: createSplitId(),
      direction: "horizontal" as const,
      children: row.map(toLeaf),
      sizes,
    };
  });

  let root: TreeNode;
  if (rowNodes.length === 1) {
    root = rowNodes[0];
  } else {
    const sizes: Record<string, number> = {};
    rowNodes.forEach((node, i) => {
      const headId = rows[i][0].id; // rowSizes key = 行首 group id
      sizes[node.id] = v2.rowSizes[headId] ?? WORKBENCH_PANEL_DEFAULT_FLEX;
    });
    root = {
      kind: "split",
      id: createSplitId(),
      direction: "vertical",
      children: rowNodes,
      sizes,
    };
  }
  return { root, activeGroupId: v2.activeGroupId, maximized: v2.maximized };
}

/**
 * 校验 V3 不变式，返回违规描述数组（空=合法）。测试断言 + 运行时自检用。不变式：
 * - SplitNode.children.length >= 2；LeafNode.tabs.length >= 1。
 * - 同方向不嵌套（父 split 不含同方向子 split）。
 * - SplitNode.sizes 的 key 集合 == children id 集合。
 * - activeGroupId/maximized 必为树中某 leaf id 或 null。
 */
export function validateLayoutV3(layout: WorkbenchLayoutV3): string[] {
  const errors: string[] = [];
  if (layout.root === null) {
    if (layout.activeGroupId !== null) errors.push("root null but activeGroupId set");
    if (layout.maximized !== null) errors.push("root null but maximized set");
    return errors;
  }
  const leafIds = new Set(collectLeaves(layout.root).map((l) => l.id));
  if (layout.activeGroupId !== null && !leafIds.has(layout.activeGroupId)) {
    errors.push(`activeGroupId ${layout.activeGroupId} not a leaf`);
  }
  if (layout.maximized !== null && !leafIds.has(layout.maximized)) {
    errors.push(`maximized ${layout.maximized} not a leaf`);
  }
  validateNodeV3(layout.root, errors);
  return errors;
}

function validateNodeV3(node: TreeNode, errors: string[]): void {
  if (node.kind === "leaf") {
    if (node.tabs.length === 0) errors.push(`leaf ${node.id} empty tabs`);
    return;
  }
  if (node.children.length < 2) {
    errors.push(`split ${node.id} has ${node.children.length} children (< 2)`);
  }
  const ids = node.children.map((c) => c.id);
  if (new Set(ids).size !== ids.length) errors.push(`split ${node.id} duplicate child ids`);
  const childIdSet = new Set(ids);
  const sizeKeySet = new Set(Object.keys(node.sizes));
  for (const cid of childIdSet) {
    if (!sizeKeySet.has(cid)) errors.push(`split ${node.id} missing size for child ${cid}`);
  }
  for (const sk of sizeKeySet) {
    if (!childIdSet.has(sk)) errors.push(`split ${node.id} stale size key ${sk}`);
  }
  for (const child of node.children) {
    if (child.kind === "split" && child.direction === node.direction) {
      errors.push(`split ${node.id} nests same-direction split ${child.id}`);
    }
    validateNodeV3(child, errors);
  }
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

// ── 布局 atom（V3 n 叉树，按作用域隔离，localStorage 持久化 + V1→V2→V3 链式迁移）─────────

/** 旧 atom key：V1（commit 3 前 panels/newRows）+ V2（group+tab 规则行），均为迁移源。 */
const LEGACY_WORKBENCH_LAYOUT_KEY = "workbenchLayout";
const LEGACY_WORKBENCH_LAYOUT_V2_KEY = "workbenchLayoutV2";

/**
 * 全部作用域的布局 state（V3）。`project` 按项目名分键（切项目恢复各自布局），
 * `global` 单份（跨项目混排）。单 atom 便于 useWorkbenchLayout 按 scope 选 + 原子更新。
 */
export type WorkbenchLayoutState = {
  project: Record<string, WorkbenchLayoutV3>;
  global: WorkbenchLayoutV3;
};

/** V2 state（每作用域 group+tab 规则行）→ V3 state（每作用域 n 叉树），迁移链中间态。 */
function migrateLayoutStateV2ToV3(v2: {
  project: Record<string, WorkbenchLayoutV2>;
  global: WorkbenchLayoutV2;
}): WorkbenchLayoutState {
  const project: Record<string, WorkbenchLayoutV3> = {};
  for (const [k, v] of Object.entries(v2.project)) {
    project[k] = migrateV2ToV3(v);
  }
  return { project, global: migrateV2ToV3(v2.global) };
}

/** V1 state（每作用域旧 4 字段 layout）→ V3 state（migrateLegacyLayout → migrateV2ToV3）。 */
function migrateLayoutState(legacy: {
  project: Record<string, WorkbenchLayout>;
  global: WorkbenchLayout;
}): WorkbenchLayoutState {
  const project: Record<string, WorkbenchLayoutV3> = {};
  for (const [k, v] of Object.entries(legacy.project)) {
    project[k] = migrateV2ToV3(migrateLegacyLayout(v));
  }
  return { project, global: migrateV2ToV3(migrateLegacyLayout(legacy.global)) };
}

/**
 * 自定义 storage 实现迁移链：读 V3 key（"workbenchLayoutV3"），不存在则按 V2 → V1 回溯。
 * 三分支：① 有 V3 直返；② 有 V2 无 V3 → migrateLayoutStateV2ToV3 → 写 V3 删 V2；③ 有 V1 无 V2/V3
 * → migrateLayoutState（V1→V2→V3）→ 写 V3 删 V1。结构匹配 jotai 的 SyncStorage<Value>
 *（getItem 返 Value、用 initialValue 兜底），让 atomWithStorage 选中 sync 重载 → atom 类型窄化为
 * WritableAtom<WorkbenchLayoutState>（非 Promise），下游 state.project 取值不报错；不用
 * createJSONStorage（其返回 `Storage<T> | AsyncStorage<T>` 联合，atom 值含 Promise）。SSR（无
 * localStorage）getItem 返 initialValue（atom 用初始值 hydration）。迁移后 V3 存在，后续读取走
 * 首分支不再迁移。layout 持久化跨刷新恢复（设计 §7.6）。
 */
const workbenchLayoutStorage = {
  getItem: (key: string, initialValue: WorkbenchLayoutState): WorkbenchLayoutState => {
    if (typeof localStorage === "undefined") return initialValue;
    const raw = localStorage.getItem(key);
    if (raw) {
      try {
        return JSON.parse(raw) as WorkbenchLayoutState;
      } catch {
        return initialValue;
      }
    }
    const v2Raw = localStorage.getItem(LEGACY_WORKBENCH_LAYOUT_V2_KEY);
    if (v2Raw) {
      try {
        const v3 = migrateLayoutStateV2ToV3(JSON.parse(v2Raw));
        localStorage.setItem(key, JSON.stringify(v3));
        localStorage.removeItem(LEGACY_WORKBENCH_LAYOUT_V2_KEY);
        return v3;
      } catch {
        return initialValue;
      }
    }
    const v1Raw = localStorage.getItem(LEGACY_WORKBENCH_LAYOUT_KEY);
    if (!v1Raw) return initialValue;
    try {
      const v3 = migrateLayoutState(JSON.parse(v1Raw));
      localStorage.setItem(key, JSON.stringify(v3));
      localStorage.removeItem(LEGACY_WORKBENCH_LAYOUT_KEY);
      return v3;
    } catch {
      return initialValue;
    }
  },
  setItem: (key: string, value: WorkbenchLayoutState): void => {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(key, JSON.stringify(value));
  },
  removeItem: (key: string): void => {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(key);
  },
};

export const workbenchLayoutAtom = atomWithStorage<WorkbenchLayoutState>(
  "workbenchLayoutV3",
  { project: {}, global: EMPTY_WORKBENCH_LAYOUT_V3 },
  workbenchLayoutStorage,
);

/**
 * 按作用域读写 workbench 布局（V3）。读：project 取 `state.project[key]`（缺省 EMPTY_V3），
 * global 取 `state.global`。写：`update(fn)` 只改当前作用域的布局，其余 immutable 保留。
 */
export function useWorkbenchLayout(scope: WorkbenchScope) {
  const [state, setState] = useAtom(workbenchLayoutAtom);
  const layout =
    scope.kind === "project"
      ? (state.project[scope.key] ?? EMPTY_WORKBENCH_LAYOUT_V3)
      : state.global;
  const update = (fn: (layout: WorkbenchLayoutV3) => WorkbenchLayoutV3) =>
    setState((prev) => {
      if (scope.kind === "project") {
        const current = prev.project[scope.key] ?? EMPTY_WORKBENCH_LAYOUT_V3;
        return { ...prev, project: { ...prev.project, [scope.key]: fn(current) } };
      }
      return { ...prev, global: fn(prev.global) };
    });
  return [layout, update] as const;
}
