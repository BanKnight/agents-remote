// M9 批次 c 桌面快捷键（spec §10.2 原文六条：⌘N/⌘1..9/⌘\/⌘F/Esc/⌘R）。
// 绑定条件 = 桌面（≥1024）+ 精确指针（hover: hover + pointer: fine，frontend-notes §7
// 触屏/指针正交——iPad 触屏宽屏不绑）。⌘F 文件搜索随批次 d（10m 全局文件页）接线；
// Esc 关浮层由 Radix Dialog/Popover 内建处理，无全局 handler（见 redesign-v2 §6.10 补记）。
import { useEffect, useState } from "react";
import { useSetAtom } from "jotai";

import {
  collectLeaves,
  useIsDesktopViewport,
  useWorkbenchLayout,
  workbenchCreateMenuOpenAtom,
  workbenchReconnectRequestAtom,
} from "../routes/workbench-model";

const POINTER_FINE_QUERY = "(hover: hover) and (pointer: fine)";

/** 精确指针设备（Mac 桌面）。iPad 触屏（pointer: coarse）恒 false——快捷键桌面专属。 */
function usePointerFine(): boolean {
  const [fine, setFine] = useState(
    () => globalThis.matchMedia?.(POINTER_FINE_QUERY).matches ?? false,
  );
  useEffect(() => {
    const mql = globalThis.matchMedia?.(POINTER_FINE_QUERY);
    if (!mql) return;
    const onChange = (e: MediaQueryListEvent) => setFine(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return fine;
}

/**
 * 工作台桌面快捷键（⌘N 新建实例 · ⌘1..9 切窗格 · ⌘\ 分屏 · ⌘R 重连断线会话）。
 * 挂载于 WorkbenchRoute；⌘ 修饰键在输入框聚焦时同样触发（Radix 输入不受影响），
 * 无修饰键不拦截。回调由调用方传（onSplit/onSelectTab 复用既有 useCallback 链）。
 */
export function useWorkbenchShortcuts(options: {
  focusId: string | null;
  onSplit: (leafId: string) => void;
  onSelectTab: (groupId: string, tabId: string) => void;
  scopeKind: "project" | "global";
  /** ⌘F（spec §10.2，10m pin④）：聚焦全局文件页搜索框。调用方 gate 全局文件整页态后 bump 信号 atom。 */
  onFocusFilesSearch?: () => void;
}) {
  const { focusId, onSplit, onSelectTab, scopeKind } = options;
  const isDesktop = useIsDesktopViewport();
  const pointerFine = usePointerFine();
  const [layout] = useWorkbenchLayout();
  const setCreateMenuOpen = useSetAtom(workbenchCreateMenuOpenAtom);
  const setReconnectRequest = useSetAtom(workbenchReconnectRequestAtom);

  useEffect(() => {
    if (!isDesktop || !pointerFine) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();

      // ⌘N 新建实例：受控打开左栏创建菜单（project scope 有菜单；global 忽略）。
      if (key === "n") {
        if (scopeKind !== "project") return;
        e.preventDefault();
        setCreateMenuOpen(true);
        return;
      }

      // ⌘\ 分屏：与窗格分屏按钮同路径（onSplitLeaf）。
      if (key === "\\") {
        const leaf = collectLeaves(layout.root).find((l) => l.id === layout.activeGroupId);
        if (!leaf) return;
        e.preventDefault();
        onSplit(leaf.id);
        return;
      }

      // ⌘R 重连（断线时）：对聚焦 session 递增请求信号；SessionDetail 仅 error 态消费。
      if (key === "r") {
        if (!focusId) return;
        e.preventDefault();
        setReconnectRequest((prev) => ({ ...prev, [focusId]: (prev[focusId] ?? 0) + 1 }));
        return;
      }

      // ⌘F 聚焦全局文件页搜索框（gate 在调用方：仅 10m 整页态回调非空）。
      if (key === "f" && options.onFocusFilesSearch) {
        e.preventDefault();
        options.onFocusFilesSearch();
        return;
      }
      // ⌘1..9 切窗格/实例：聚焦第 N 个 leaf（flatten 顺序），跟随其 active tab 导航。
      if (/^[1-9]$/.test(key)) {
        const leaf = collectLeaves(layout.root)[Number(key) - 1];
        if (!leaf) return;
        e.preventDefault();
        onSelectTab(leaf.id, leaf.activeTabId);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    isDesktop,
    pointerFine,
    layout,
    focusId,
    onSplit,
    onSelectTab,
    scopeKind,
    setCreateMenuOpen,
    setReconnectRequest,
    // 回调进 deps：SPA 内 leftMode auto↔files 切换时 options.onFocusFilesSearch 从
    // undefined ↔ 函数翻转，deps 不含它则 keydown 闭包滞留旧值（⌘F gate 失效，perf review 2026-09-22）。
    options.onFocusFilesSearch,
  ]);
}
