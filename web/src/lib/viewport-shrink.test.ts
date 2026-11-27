import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { JSDOM } from "jsdom";

import { installViewportShrinkSync } from "./viewport-shrink";

// viewport 收缩补偿状态机单测（2026-11-27）：IME 占位「同宽缩高 → 补偿钉住」、恢复/
// 旋转「清补偿 + 重定基线」、回前台「清补偿 + settle 重测」。mock 模式与
// keyboard-inset.test.ts 同款：手动 JSDOM 挂 globalThis，clientHeight/innerWidth/
// matchMedia/rAF/performance.now 全可控；settleWindowMs: 0 让 settle 首帧即 ready。
type FakeVv = EventTarget & { height: number; offsetTop: number };

let dom: JSDOM;
let vv: FakeVv;
let visibility: DocumentVisibilityState;
let now: number;
let rafSeq: number;
let rafs: Map<number, FrameRequestCallback>;
const originals = new Map<string, PropertyDescriptor | undefined>();

const setGlobal = (name: string, value: unknown) => {
  if (!originals.has(name)) originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
};

const cvh = (v: number) =>
  Object.defineProperty(dom.window.document.documentElement, "clientHeight", {
    configurable: true,
    get: () => v,
  });

const innerWidth = (v: number) =>
  Object.defineProperty(dom.window, "innerWidth", { configurable: true, get: () => v });

const shrinkValue = (): string | null =>
  dom.window.document.documentElement.style.getPropertyValue("--viewport-shrink");

beforeEach(() => {
  dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
  setGlobal("window", dom.window);
  setGlobal("document", dom.window.document);
  const W = dom.window as unknown as { EventTarget: typeof EventTarget };
  vv = new W.EventTarget() as FakeVv;
  vv.height = 805;
  vv.offsetTop = 0;
  Object.defineProperty(dom.window, "visualViewport", { configurable: true, value: vv });
  Object.defineProperty(dom.window, "innerHeight", { configurable: true, value: 805 });
  Object.defineProperty(dom.window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
  visibility = "visible";
  Object.defineProperty(dom.window.document, "visibilityState", {
    configurable: true,
    get: () => visibility,
  });
  cvh(805);
  innerWidth(1180);
  now = 0;
  setGlobal("performance", { now: () => now });
  rafs = new Map();
  rafSeq = 0;
  setGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    rafSeq += 1;
    rafs.set(rafSeq, cb);
    return rafSeq;
  });
  setGlobal("cancelAnimationFrame", (id: number) => {
    rafs.delete(id);
  });
});

afterEach(() => {
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete (globalThis as Record<string, unknown>)[name];
  }
  originals.clear();
  dom.window.close();
});

const flushRaf = () => {
  const pending = [...rafs.values()];
  rafs.clear();
  for (const cb of pending) cb(now);
};

const dispatchVvResize = () => {
  vv.dispatchEvent(new dom.window.Event("resize"));
};

describe("viewport-shrink 状态机", () => {
  it("常态零写入：settle 后无补偿即无 inline", () => {
    installViewportShrinkSync({ settleWindowMs: 0 });
    flushRaf();
    expect(shrinkValue()).toBe("");
  });

  it("同宽缩高写补偿（IME 占位指纹）", () => {
    installViewportShrinkSync({ settleWindowMs: 0 });
    flushRaf();
    cvh(746);
    dispatchVvResize();
    flushRaf();
    expect(shrinkValue()).toBe("59px");
  });

  it("恢复清补偿", () => {
    installViewportShrinkSync({ settleWindowMs: 0 });
    flushRaf();
    cvh(746);
    dispatchVvResize();
    flushRaf();
    expect(shrinkValue()).toBe("59px");
    cvh(805);
    dispatchVvResize();
    flushRaf();
    expect(shrinkValue()).toBe("");
  });

  it("宽度变化（旋转/分屏）清补偿并重定基线", () => {
    installViewportShrinkSync({ settleWindowMs: 0 });
    flushRaf();
    cvh(746);
    dispatchVvResize();
    flushRaf();
    expect(shrinkValue()).toBe("59px");
    cvh(515);
    innerWidth(844);
    dispatchVvResize();
    flushRaf();
    expect(shrinkValue()).toBe("");
    cvh(456);
    dispatchVvResize();
    flushRaf();
    expect(shrinkValue()).toBe("59px");
  });

  it("回前台清补偿并 settle 重测基线", () => {
    cvh(771);
    installViewportShrinkSync({ settleWindowMs: 0 });
    flushRaf();
    cvh(712);
    dispatchVvResize();
    flushRaf();
    expect(shrinkValue()).toBe("59px");
    visibility = "hidden";
    document.dispatchEvent(new dom.window.Event("visibilitychange"));
    visibility = "visible";
    document.dispatchEvent(new dom.window.Event("visibilitychange"));
    flushRaf();
    expect(shrinkValue()).toBe("");
    cvh(653);
    dispatchVvResize();
    flushRaf();
    expect(shrinkValue()).toBe("59px");
  });

  it("settle 窗口内事件不触发测量（吸收启动过渡态）", () => {
    installViewportShrinkSync({ settleWindowMs: 100 });
    cvh(746);
    dispatchVvResize();
    flushRaf();
    expect(shrinkValue()).toBe("");
  });

  it("dispose 清补偿并移除监听", () => {
    const dispose = installViewportShrinkSync({ settleWindowMs: 0 });
    flushRaf();
    cvh(746);
    dispatchVvResize();
    flushRaf();
    expect(shrinkValue()).toBe("59px");
    dispose();
    expect(shrinkValue()).toBe("");
  });
});
