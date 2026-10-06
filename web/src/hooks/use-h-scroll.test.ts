import { renderHook } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { JSDOM } from "jsdom";

import { useHScroll } from "./use-h-scroll";

// bun:test 无内置 jsdom 环境，手动建 JSDOM 并挂 globalThis（use-mobile-exit-close.test.ts
// 同款范式）。ResizeObserver jsdom 没有——挂空实现（update 只读 scroll 尺寸，不等 RO 回调）。
let dom: JSDOM;
beforeEach(() => {
  dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
  globalThis.window = dom.window as unknown as Window & typeof globalThis;
  globalThis.document = dom.window.document as unknown as Document;
  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = RO as unknown as typeof ResizeObserver;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
});

// 调用方模式回归锁（composer-attach / inspection-panel / instance-area 同款 effect）：
// fade 值不变时 setFade 必须返回原引用（Object.is bailout），否则「hook 对象进 deps →
// 每渲染 effect 重跑 → setFade 新对象 → 恒重渲染」死循环（loopcheck 先例：runaway 63 次）。
describe("useHScroll", () => {
  it("调用方 effect keyed on hook 对象不失控重渲染（bailout 守卫）", () => {
    let renders = 0;
    renderHook(() => {
      renders += 1;
      const hs = useHScroll();
      // 模拟实挂容器（update 读 scroll 尺寸；主 effect 挂 wheel/scroll listener）。
      if (hs.ref.current === null) {
        hs.ref.current = {
          scrollLeft: 0,
          clientWidth: 100,
          scrollWidth: 100,
          addEventListener() {},
          removeEventListener() {},
        } as unknown as HTMLDivElement;
      }
      useEffect(() => hs.update(), [hs, 0]);
      if (renders > 60) throw new Error(`runaway renders: ${renders}`);
    });
    expect(renders).toBeLessThanOrEqual(10);
  });
});
