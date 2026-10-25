import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { JSDOM } from "jsdom";

import { computeKeyboardInset, observeKeyboardInset } from "./keyboard-inset";

describe("computeKeyboardInset", () => {
  it("键盘在场：offset = innerHeight - vv.height - offsetTop", () => {
    // iPhone 竖屏典型值：layout 852，visual 499（键盘 ~353）
    expect(computeKeyboardInset(499, 0, 852)).toEqual({ visible: true, offsetPx: 353 });
  });

  it("offsetTop 参与计算（visual viewport 被 pan 时按差值扣减）", () => {
    expect(computeKeyboardInset(499, 20, 852)).toEqual({ visible: true, offsetPx: 333 });
  });

  it("键盘不在场：强制归零（绕 iOS 26 关键盘后 offset 残留）", () => {
    expect(computeKeyboardInset(852, 40, 852)).toEqual({ visible: false, offsetPx: 0 });
  });

  it("vv.height 与 innerHeight 相等 = 不可见（严格小于判定）", () => {
    expect(computeKeyboardInset(699, 0, 699).visible).toBe(false);
  });

  it("visible 门内负差值钳到 0（pinch-zoom 类异常环境不产生负 padding）", () => {
    // vv.height(850) < innerHeight(852) = visible，但 852-850-10 = -8 → max(0,-8)=0。
    expect(computeKeyboardInset(850, 10, 852)).toEqual({ visible: true, offsetPx: 0 });
  });
});

// observeKeyboardInset 的时序语义（2026-10-19 composer 抬高 bug）：后台冻结期间的 vv
// 事件不得入队（rAF 被浏览器挂起，回调推迟到回前台执行时量到「恢复瞬态」）；回前台由
// visibilitychange 统一重测 + 短窗复核纠正瞬态写入。bun:test 无 jsdom 环境，手动建
// JSDOM 并挂 globalThis；rAF / performance.now / visibilityState 全部可控（deterministic）。
type FakeVv = EventTarget & { height: number; offsetTop: number };

let dom: JSDOM;
let vv: FakeVv;
let visibility: DocumentVisibilityState;
let now: number;
let rafSeq: number;
let rafs: Map<number, FrameRequestCallback>;
/** activeElement 替身（焦点门闩的输入）：null = BODY（无 editable 聚焦，键盘不可能在场）。 */
let focusEl: Element | null;
const originals = new Map<string, PropertyDescriptor | undefined>();

const setGlobal = (name: string, value: unknown) => {
  if (!originals.has(name)) originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
};

/** 模拟 editable 聚焦（键盘在场语义的前提）：真 JSDOM textarea，tagName/instanceof 双命中。 */
const focusTextarea = () => {
  focusEl = dom.window.document.createElement("textarea");
};

beforeEach(() => {
  dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
  setGlobal("window", dom.window);
  setGlobal("document", dom.window.document);
  vv = new (dom.window as unknown as { EventTarget: typeof EventTarget }).EventTarget() as FakeVv;
  vv.height = 844;
  vv.offsetTop = 0;
  Object.defineProperty(dom.window, "visualViewport", { configurable: true, value: vv });
  Object.defineProperty(dom.window, "innerHeight", { configurable: true, value: 844 });
  Object.defineProperty(dom.window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
  visibility = "visible";
  Object.defineProperty(dom.window.document, "visibilityState", {
    configurable: true,
    get: () => visibility,
  });
  focusEl = null;
  Object.defineProperty(dom.window.document, "activeElement", {
    configurable: true,
    get: () => focusEl,
  });
  now = 0;
  setGlobal("performance", { now: () => now });
  rafSeq = 0;
  rafs = new Map();
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

const dispatchVv = (type: "resize" | "scroll") => {
  vv.dispatchEvent(new dom.window.Event(type));
};

/** 订阅并收集每次回调（source 是断言隐藏态短路与回前台重测的判据）。 */
const collect = () => {
  const calls: Array<{ off: number; source: string }> = [];
  const dispose = observeKeyboardInset((inset, source) =>
    calls.push({ off: inset.offsetPx, source }),
  );
  return { calls, dispose };
};

describe("observeKeyboardInset 可见性语义", () => {
  // 焦点门闩（2026-10-25）后，本组用例语义精确为「键盘在场（editable 聚焦）时的测量」；
  // 无焦点的归零语义单独在「焦点门闩」describe 覆盖。
  beforeEach(() => focusTextarea());

  it("隐藏态 vv 事件不入队：回前台执行的是 visible 重测而非隐藏期 vv-resize", () => {
    const { calls, dispose } = collect();
    calls.length = 0;

    visibility = "hidden";
    vv.height = 500; // 后台期间 vv 变化（真实浏览器里事件照发，rAF 被挂起）
    dispatchVv("resize");
    dispatchVv("scroll");

    visibility = "visible";
    dom.window.document.dispatchEvent(new dom.window.Event("visibilitychange"));
    flushRaf();

    const sources = calls.map((call) => call.source);
    expect(sources).not.toContain("vv-resize");
    expect(sources).not.toContain("vv-scroll");
    expect(sources).toContain("visible");
    expect(sources).toContain("visible-settle");
    dispose();
  });

  it("回前台短窗复核：瞬态 vv 写入的 offset 在 vv 复位后逐帧纠正为 0", () => {
    const { calls, dispose } = collect();
    calls.length = 0;

    // 后台期间 vv 停留在未复位的瞬态高度（iOS 恢复未同步）
    visibility = "hidden";
    vv.height = 400;
    visibility = "visible";
    dom.window.document.dispatchEvent(new dom.window.Event("visibilitychange"));
    // visible-settle 同步采样到瞬态 → 先写下非零 offset（正是过去卡住的值）
    expect(calls.at(-1)?.off).toBe(444);

    // vv 复位（真实浏览器随后帧稳定到 innerHeight）
    vv.height = 844;
    flushRaf();
    flushRaf();

    expect(calls.at(-1)).toEqual({ off: 0, source: "visible-settle" });
    dispose();
  });

  it("可见态 vv resize 正常测量（隐藏态短路不污染正常路径）", () => {
    const { calls, dispose } = collect();
    calls.length = 0;

    vv.height = 500;
    dispatchVv("resize");
    flushRaf();

    expect(calls.some((call) => call.source === "vv-resize" && call.off === 344)).toBe(true);
    dispose();
  });

  it("visibilitychange 转到 hidden 时不触发重测", () => {
    const { calls, dispose } = collect();
    calls.length = 0;

    visibility = "hidden";
    dom.window.document.dispatchEvent(new dom.window.Event("visibilitychange"));
    flushRaf();

    // 只能断言「未新增重测」：init-settle 的已排队帧仍可能执行（真实隐藏态 rAF 被挂起，
    // 这里不模拟挂起）——它的存在与 visibilitychange 无关。
    expect(calls.some((call) => call.source === "visible")).toBe(false);
    expect(calls.some((call) => call.source === "visible-settle")).toBe(false);
    dispose();
  });

  it("focusout 短窗复核：终态 vv 事件丢失时也把 offset 收回 0（本轮 bug 一手数据场景）", () => {
    const { calls, dispose } = collect();
    calls.length = 0;

    // 键盘在场（真实样本 vv=510/innerH=844 → off=334）
    vv.height = 510;
    dispatchVv("resize");
    flushRaf();
    expect(calls.at(-1)).toEqual({ off: 334, source: "vv-resize" });

    // focusout 在收回动画起点触发：此刻 vv 仍是 510（采样必然还是 334）
    dom.window.dispatchEvent(new dom.window.Event("focusout"));
    expect(calls.at(-1)).toEqual({ off: 334, source: "focusout-settle" });

    // 键盘收回完成，但终态 vv resize 事件丢失（不再派发）——短窗复核应逐帧纠正。
    vv.height = 844;
    flushRaf();
    flushRaf();

    expect(calls.at(-1)).toEqual({ off: 0, source: "focusout-settle" });
    dispose();
  });

  it("转隐藏时作废已排队的测量与复核（恢复瞬态帧不执行旧采样）", () => {
    const { calls, dispose } = collect();
    calls.length = 0;

    vv.height = 500;
    dispatchVv("resize"); // 已入队（可见态）
    visibility = "hidden";
    dom.window.document.dispatchEvent(new dom.window.Event("visibilitychange"));
    flushRaf();

    expect(calls).toEqual([]);
    dispose();
  });

  it("dispose 后不再响应可见性转换（监听全部拆除）", () => {
    const { calls, dispose } = collect();
    dispose();
    calls.length = 0;

    visibility = "hidden";
    dispatchVv("resize");
    visibility = "visible";
    dom.window.document.dispatchEvent(new dom.window.Event("visibilitychange"));
    flushRaf();

    expect(calls).toEqual([]);
  });
});

// 焦点门闩（2026-10-25 真机 8 样本）：composer 抬高卡死 = focus=BODY（iOS 键盘不可能
// 在场）却 off=334-351px，src 全是 settle 源——加载/回前台/焦点切换时 vv 处于过渡态，
// settle 量到过期值写入后终态 vv 事件永远不来。门闩：无 editable 聚焦一律归零。
describe("observeKeyboardInset 焦点门闩", () => {
  it("真机 8 样本回归闸：BODY 焦点下 vv shrunk，init/settle/事件全路径归零", () => {
    vv.height = 493; // 键盘高度级的过期 shrunk 值（8 样本 var 334-351px 的来源量级）
    const { calls, dispose } = collect();

    // init + init-settle 在挂载瞬间采样，BODY 焦点下必须全 0（样本 src=init-settle）。
    expect(calls.every((call) => call.off === 0)).toBe(true);
    expect(calls.map((call) => call.source)).toContain("init");
    expect(calls.map((call) => call.source)).toContain("init-settle");

    // 后续任何 vv 事件同样归零（真实浏览器不再 fire 事件正是卡死条件，这里证「来了也不写歪」）。
    dispatchVv("resize");
    flushRaf();
    expect(calls.at(-1)).toEqual({ off: 0, source: "vv-resize" });
    dispose();
  });

  it("同一 shrunk vv + textarea 聚焦 = 正常计算（门闩不误伤键盘在场）", () => {
    vv.height = 500;
    focusTextarea();
    const { calls, dispose } = collect();

    expect(calls.at(-1)?.off).toBe(344);
    dispatchVv("resize");
    flushRaf();
    expect(calls.at(-1)).toEqual({ off: 344, source: "vv-resize" });
    dispose();
  });

  it("卡死自愈：BODY 下过期态归零后 focusin（textarea）恢复计算", () => {
    vv.height = 500;
    const { calls, dispose } = collect();
    expect(calls.every((call) => call.off === 0)).toBe(true);

    // 用户点进 composer：focusin 触发补测 + 短窗复核，此刻 vv 仍 shrunk（键盘正在弹出）。
    focusTextarea();
    dom.window.dispatchEvent(new dom.window.Event("focusin"));
    flushRaf();

    expect(calls.at(-1)?.source).toBe("focusin-settle");
    expect(calls.at(-1)?.off).toBe(344);
    dispose();
  });
});
