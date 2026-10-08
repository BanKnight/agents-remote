// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, cleanup, renderHook } from "@testing-library/react";
import { Provider } from "jotai";
import { getDefaultStore } from "jotai";
import { createElement, type ReactNode } from "react";
import { JSDOM } from "jsdom";

import { usePanelTabRegistry } from "./use-panel-tab-registry";
import {
  BASE_PANEL_TABS,
  workbenchPanelActiveAtom,
  workbenchPanelTabsAtom,
} from "../../routes/workbench-model";

// bun:test 的 afterEach 不是裸全局，RTL auto-cleanup 不注册（同 acp-adapter.hook.test）。
afterEach(() => cleanup());

let dom: JSDOM;
beforeEach(() => {
  dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
  globalThis.window = dom.window as unknown as Window & typeof globalThis;
  globalThis.document = dom.window.document as unknown as Document;
  globalThis.navigator = dom.window.navigator as unknown as Navigator;
  globalThis.localStorage = dom.window.localStorage;
});

/** 每例独立 store + Provider，隔离 atom 持久层（避免跨例串写）。 */
function renderRegistry(projectKey: string | null) {
  const store = getDefaultStore();
  return {
    ...renderHook(() => usePanelTabRegistry(projectKey), {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(Provider, { store }, children),
    }),
    store,
  };
}

describe("usePanelTabRegistry", () => {
  test("projectKey 为 null 时读侧归一为基础标签、激活项回 files，写操作零落盘", () => {
    const { result, store } = renderRegistry(null);
    expect(result.current.panelTabs.map((t0) => t0.id)).toEqual(BASE_PANEL_TABS.map((t0) => t0.id));
    expect(result.current.activePanelTabId).toBe("files");
    // 写操作全部 no-op：不得落 "undefined" 键（code-review 批 11 的静默丢失面）。
    act(() => {
      result.current.ensureTab({ id: "file:x", kind: "file" } as never);
      result.current.activatePanelTab("git");
      result.current.newPanelTab("wiki");
    });
    expect(store.get(workbenchPanelTabsAtom)).toEqual({});
    expect(store.get(workbenchPanelActiveAtom)).toEqual({});
  });

  test("ensureTab 幂等：重复新增同一标签返回同一引用（不产生 localStorage 写）", () => {
    const { result, store } = renderRegistry("proj");
    act(() => result.current.ensureTab({ id: "wiki", kind: "wiki" }));
    const after1 = store.get(workbenchPanelTabsAtom);
    act(() => result.current.ensureTab({ id: "wiki", kind: "wiki" }));
    // 引用未变 = 幂等守卫生效（值相同返回旧引用）。
    expect(store.get(workbenchPanelTabsAtom)).toBe(after1);
  });

  test("ensureTab 新增 file 标签：存储追加 + 读侧归一保留基础标签", () => {
    const { result } = renderRegistry("proj");
    act(() => result.current.ensureTab({ id: "file:src/a.ts", kind: "file" } as never));
    expect(result.current.panelTabs.some((t0) => t0.id === "file:src/a.ts")).toBe(true);
    expect(result.current.panelTabs.map((t0) => t0.id).slice(0, 3)).toEqual([
      "files",
      "git",
      "wiki",
    ]);
  });

  test("newPanelTab 基础标签 = ensure + 激活（同目标已开幂等激活）", () => {
    const { result } = renderRegistry("proj");
    act(() => result.current.newPanelTab("git"));
    expect(result.current.panelTabs.some((t0) => t0.id === "git")).toBe(true);
    expect(result.current.activePanelTabId).toBe("git");
    const tabsAfter = result.current.panelTabs;
    act(() => result.current.newPanelTab("git"));
    expect(result.current.panelTabs).toBe(tabsAfter);
    expect(result.current.activePanelTabId).toBe("git");
  });

  test("activatePanelTab 幂等：激活已激活标签返回同一引用", () => {
    const { result, store } = renderRegistry("proj");
    act(() => result.current.activatePanelTab("wiki"));
    const after1 = store.get(workbenchPanelActiveAtom);
    act(() => result.current.activatePanelTab("wiki"));
    expect(store.get(workbenchPanelActiveAtom)).toBe(after1);
  });

  test("closePanelTab 移除标签；关激活项回退 files", () => {
    const { result } = renderRegistry("proj");
    act(() => result.current.ensureTab({ id: "file:src/a.ts", kind: "file" } as never));
    act(() => result.current.activatePanelTab("file:src/a.ts"));
    expect(result.current.activePanelTabId).toBe("file:src/a.ts");
    act(() => result.current.closePanelTab("file:src/a.ts"));
    expect(result.current.panelTabs.some((t0) => t0.id === "file:src/a.ts")).toBe(false);
    expect(result.current.activePanelTabId).toBe("files");
  });

  test("closePanelTab 关非激活标签不动激活项", () => {
    const { result } = renderRegistry("proj");
    act(() => result.current.ensureTab({ id: "file:src/a.ts", kind: "file" } as never));
    act(() => result.current.activatePanelTab("git"));
    act(() => result.current.closePanelTab("file:src/a.ts"));
    expect(result.current.activePanelTabId).toBe("git");
  });

  test("closePanelTab 关不存在的 id = 幂等 no-op（不写新 map 对象）", () => {
    const { result, store } = renderRegistry("proj");
    act(() => result.current.ensureTab({ id: "file:src/a.ts", kind: "file" } as never));
    const before = store.get(workbenchPanelTabsAtom);
    act(() => result.current.closePanelTab("file:not-exist.ts"));
    // filter 恒返回新数组，幂等按长度判定——引用未变 = 未产生多余 localStorage 同步写。
    expect(store.get(workbenchPanelTabsAtom)).toBe(before);
  });

  test("closePanelTab 在 projectKey 为 null 时不落盘（守卫）", () => {
    const { result, store } = renderRegistry(null);
    act(() => result.current.closePanelTab("git"));
    expect(store.get(workbenchPanelTabsAtom)).toEqual({});
  });

  test("per-projectKey 隔离：不同项目读各自存储段", () => {
    const store = getDefaultStore();
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(Provider, { store }, children);
    const a = renderHook(() => usePanelTabRegistry("proj-a"), { wrapper });
    act(() => a.result.current.ensureTab({ id: "file:a.ts", kind: "file" } as never));
    const b = renderHook(() => usePanelTabRegistry("proj-b"), { wrapper });
    expect(b.result.current.panelTabs.some((t0) => t0.id === "file:a.ts")).toBe(false);
    expect(a.result.current.panelTabs.some((t0) => t0.id === "file:a.ts")).toBe(true);
  });
});
