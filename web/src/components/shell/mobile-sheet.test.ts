import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";

import { hasScrollableContent } from "./mobile-sheet";

// bun:test 无内置 jsdom 环境——手动建 JSDOM 挂 globalThis（session-detail.test.ts 同款
// 范式）。每个 test 一个新干净 DOM。
beforeEach(() => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
  globalThis.window = dom.window as unknown as Window & typeof globalThis;
  globalThis.document = dom.window.document as unknown as Document;
  globalThis.getComputedStyle = dom.window.getComputedStyle.bind(
    dom.window,
  ) as unknown as typeof getComputedStyle;
});

afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
  delete (globalThis as unknown as { document?: unknown }).document;
  delete (globalThis as unknown as { getComputedStyle?: unknown }).getComputedStyle;
});

// jsdom 无布局引擎（scrollHeight/clientHeight 恒 0）——实例级 defineProperty 造溢出 fixture。
function fakePane(overY: string, scrollH: number, clientH: number): HTMLElement {
  const el = document.createElement("div");
  el.style.overflowY = overY;
  Object.defineProperty(el, "scrollHeight", { configurable: true, value: scrollH });
  Object.defineProperty(el, "clientHeight", { configurable: true, value: clientH });
  return el;
}

describe("hasScrollableContent", () => {
  test("无子元素 → false（菜单/确认框类 sheet 整面可拖）", () => {
    expect(hasScrollableContent(document.createElement("div"))).toBe(false);
  });

  test("后代实际溢出 + overflow-y auto → true（历史/文件列表保窄热区）", () => {
    const root = document.createElement("div");
    root.append(fakePane("auto", 500, 200));
    expect(hasScrollableContent(root)).toBe(true);
  });

  test("overflow-y scroll 同判可滚", () => {
    const root = document.createElement("div");
    root.append(fakePane("scroll", 500, 200));
    expect(hasScrollableContent(root)).toBe(true);
  });

  test("溢出但 overflow-y visible → false（非滚容器）", () => {
    const root = document.createElement("div");
    root.append(fakePane("visible", 500, 200));
    expect(hasScrollableContent(root)).toBe(false);
  });

  test("可滚容器但内容不溢出 → false", () => {
    const root = document.createElement("div");
    root.append(fakePane("auto", 200, 200));
    expect(hasScrollableContent(root)).toBe(false);
  });
});
