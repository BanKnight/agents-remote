import { act, renderHook } from "@testing-library/react";
import type { AnimationEvent } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test";
import { JSDOM } from "jsdom";

import { useMobileExitClose } from "./use-mobile-exit-close";

// bun:test 无内置 jsdom 环境（@vitest-environment 指令不被识别），手动建 JSDOM 并挂到
// globalThis（claude2-adapter.hook.test.ts:75-78 同款范式）。每个 it 一个新干净 DOM。
let dom: JSDOM;
beforeEach(() => {
  dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
  globalThis.window = dom.window as unknown as Window & typeof globalThis;
  globalThis.document = dom.window.document as unknown as Document;
  globalThis.navigator = dom.window.navigator as unknown as Navigator;
});

afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
});

// useIsMobile 读 window.matchMedia(MOBILE_QUERY).matches；jsdom 默认无 matchMedia（→ fallback false）。
// defineProperty 挂 mock 控制 matches（移动/桌面）。useIsMobile lazy init + effect 都经此读。
function setMobile(isMobile: boolean) {
  Object.defineProperty(globalThis.window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: isMobile,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// onAnimationEnd 只读 target/currentTarget；同引用造 target===currentTarget。
const makeEvent = (sameTarget: boolean): AnimationEvent<HTMLDivElement> => {
  const div = {} as HTMLDivElement;
  return {
    target: div,
    currentTarget: sameTarget ? div : ({} as HTMLDivElement),
  } as AnimationEvent<HTMLDivElement>;
};

describe("useMobileExitClose", () => {
  it("桌面端：close 立即调 onActualClose，不进 exiting 态", () => {
    setMobile(false);
    const onActualClose = vi.fn();
    const { result } = renderHook(() => useMobileExitClose(onActualClose));

    act(() => result.current.close());

    expect(onActualClose).toHaveBeenCalledTimes(1);
    expect(result.current.exiting).toBe(false);
  });

  it("移动端：close 进 exiting 态，不立即调 onActualClose（留待动画结束）", () => {
    setMobile(true);
    const onActualClose = vi.fn();
    const { result } = renderHook(() => useMobileExitClose(onActualClose));

    act(() => result.current.close());

    expect(onActualClose).not.toHaveBeenCalled();
    expect(result.current.exiting).toBe(true);
  });

  it("移动端：exit 动画 onAnimationEnd（target===currentTarget）触发真正 close + 重置 exiting", () => {
    setMobile(true);
    const onActualClose = vi.fn();
    const { result } = renderHook(() => useMobileExitClose(onActualClose));

    act(() => result.current.close());
    expect(result.current.exiting).toBe(true);

    act(() => result.current.onAnimationEnd(makeEvent(true)));

    expect(onActualClose).toHaveBeenCalledTimes(1);
    expect(result.current.exiting).toBe(false);
  });

  it("onAnimationEnd bubble（target!==currentTarget）忽略——防子元素 finite animation 误触发提前 close", () => {
    setMobile(true);
    const onActualClose = vi.fn();
    const { result } = renderHook(() => useMobileExitClose(onActualClose));

    act(() => result.current.close());
    act(() => result.current.onAnimationEnd(makeEvent(false)));

    expect(onActualClose).not.toHaveBeenCalled();
    expect(result.current.exiting).toBe(true);
  });

  it("onAnimationEnd 在未进 exiting 态时忽略（enter 动画或子元素 animationend）", () => {
    setMobile(true);
    const onActualClose = vi.fn();
    const { result } = renderHook(() => useMobileExitClose(onActualClose));

    // 未 close，直接收到 animationend（如 enter 动画结束）
    act(() => result.current.onAnimationEnd(makeEvent(true)));

    expect(onActualClose).not.toHaveBeenCalled();
    expect(result.current.exiting).toBe(false);
  });

  it("cancel 重置 exiting——close 后 300ms 内改选新文件，取消未完成 exit 防 race", () => {
    setMobile(true);
    const onActualClose = vi.fn();
    const { result } = renderHook(() => useMobileExitClose(onActualClose));

    act(() => result.current.close());
    expect(result.current.exiting).toBe(true);

    act(() => result.current.cancel());
    expect(result.current.exiting).toBe(false);

    // cancel 后即使收到 target 匹配的 animationend 也不触发 close（exiting 已 false）
    act(() => result.current.onAnimationEnd(makeEvent(true)));
    expect(onActualClose).not.toHaveBeenCalled();
  });

  it("桌面端：onAnimationEnd 即使 target 匹配也不额外触发（exiting 永远 false，sm:animate-none）", () => {
    setMobile(false);
    const onActualClose = vi.fn();
    const { result } = renderHook(() => useMobileExitClose(onActualClose));

    // 桌面端 close 已即时清完；浮层 sm:animate-none，不应有 exit animationend
    act(() => result.current.close());
    act(() => result.current.onAnimationEnd(makeEvent(true)));

    // close 即时触发一次，onAnimationEnd 不再额外触发
    expect(onActualClose).toHaveBeenCalledTimes(1);
  });
});
