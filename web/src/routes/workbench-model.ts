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
