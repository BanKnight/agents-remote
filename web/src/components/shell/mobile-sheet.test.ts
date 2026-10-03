import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";

import { hasScrollableContent, sampleVelocity, simulateSpringBack } from "./mobile-sheet";

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

describe("simulateSpringBack（回弹速度继承）", () => {
  test("快甩 v0=1.2px/ms、x0=37 → 带速下冲过冲（峰值 > x0+6，固定 ease-out 无此行为）", () => {
    const { peak, settleMs } = simulateSpringBack(37, 1.2);
    expect(peak).toBeGreaterThan(43);
    expect(settleMs).toBeLessThan(600);
  });

  test("慢拖 v0=0、x0=40 → 无过冲（峰值=起点）且 ~300ms 收敛", () => {
    const { peak, settleMs } = simulateSpringBack(40, 0);
    expect(Math.abs(peak - 40)).toBeLessThan(0.1);
    expect(settleMs).toBeGreaterThan(150);
    expect(settleMs).toBeLessThan(600);
  });

  test("CDP 现实值 v0=0.17、x0=37 → 微过冲（诊断实测口径）", () => {
    const { peak } = simulateSpringBack(37, 0.17);
    expect(peak).toBeGreaterThan(37);
    expect(peak).toBeLessThan(38.5);
  });
});

describe("sampleVelocity（松手速度窗口）", () => {
  test("匀速拖（2px/16ms×400ms）→ 窗口速度 = 真实速度 0.125px/ms", () => {
    const samples = Array.from({ length: 26 }, (_, i) => ({ y: i * 2, t: i * 16 }));
    expect(sampleVelocity(samples, 400)).toBeCloseTo(0.125, 2);
  });

  test("停顿后松手 → 速度衰减到 0（过期瞬时速度不再注入弹簧）", () => {
    // 拖到 y=100（最后样本 t=200），停住 300ms，up 在 t=500：窗口回看 100ms 落在停顿期，
    // 参考点 = 停住前最后样本，位移 0 ÷ 300ms = 0。
    const samples = [
      { y: 0, t: 0 },
      { y: 100, t: 200 },
    ];
    expect(sampleVelocity(samples, 500)).toBe(0);
  });

  test("快甩末段（最后 100ms 内 80px）→ 0.8px/ms", () => {
    const samples = [
      { y: 0, t: 0 },
      { y: 120, t: 380 },
      { y: 200, t: 480 },
    ];
    expect(sampleVelocity(samples, 480)).toBeCloseTo(0.8, 2);
  });

  test("空样本 → 0", () => {
    expect(sampleVelocity([], 100)).toBe(0);
  });
});
