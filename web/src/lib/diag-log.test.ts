import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import {
  clearDiagLog,
  DIAG_ENABLED_EVENT,
  DIAG_EVENT,
  isDiagEnabled,
  readDiagLines,
  recordDiag,
  resetDiagLogForTests,
  setDiagEnabled,
} from "./diag-log";

// bun:test 无内置 jsdom——手动建 JSDOM 挂 globalThis（replay-debug.test.ts 同款
// 范式）。模块 import 先于挂载：load()/loadEnabled() 的 try/catch 吞掉无
// localStorage 的 ReferenceError（空缓冲 + 开关关起步），挂载后读写均走 JSDOM
// localStorage。
let dom: JSDOM;
beforeEach(() => {
  dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
  globalThis.window = dom.window as unknown as Window & typeof globalThis;
  globalThis.localStorage = dom.window.localStorage;
});

// 环形缓冲/开关/落盘/事件派发（通用诊断基建）
describe("diag-log 通用诊断日志", () => {
  afterEach(() => {
    resetDiagLogForTests();
  });

  test("默认关：开关关时 record no-op，无缓冲无落盘", () => {
    // reset 后 enabled=false（默认关）
    recordDiag("replay", "should-not-be-recorded");
    expect(isDiagEnabled()).toBe(false);
    expect(readDiagLines()).toHaveLength(0);
    expect(localStorage.getItem("ar-diag-log")).toBe(null);
  });

  test("开关开 → record 入缓冲，带 HH:MM:SS + [scope] 前缀", () => {
    setDiagEnabled(true);
    recordDiag("replay", "init replay=delta anchor=live");
    const lines = readDiagLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^\d\d:\d\d:\d\d \[replay\] init replay=delta anchor=live$/);
  });

  test("环形裁剪保尾（MAX=24 溢出丢最旧）", () => {
    setDiagEnabled(true);
    for (let i = 0; i < 30; i++) recordDiag("replay", `line-${i}`);
    const lines = readDiagLines();
    expect(lines).toHaveLength(24);
    expect(lines[0]).toMatch(/line-6$/);
    expect(lines.at(-1)).toMatch(/line-29$/);
  });

  test("跨实例持久化（localStorage 落盘 → 同 key 可读）", () => {
    setDiagEnabled(true);
    recordDiag("replay", "audit unpaired=0 tool_use=38");
    expect(localStorage.getItem("ar-diag-log")).toContain("audit");
    expect(localStorage.getItem("ar-diag-enabled")).toBe("1");
  });

  test("开关持久化：开→关→重读 isDiagEnabled 跟随内存态", () => {
    setDiagEnabled(true);
    expect(isDiagEnabled()).toBe(true);
    setDiagEnabled(false);
    expect(isDiagEnabled()).toBe(false);
    // 关后 record no-op，但既有数据保留（重开可见）
    recordDiag("replay", "while-off");
    expect(readDiagLines()).toHaveLength(0);
  });

  test("CustomEvent 同页广播（横幅实时刷新信号，两个事件都派发）", () => {
    let logFired = false;
    let enabledFired = false;
    const onLog = () => {
      logFired = true;
    };
    const onEnabled = () => {
      enabledFired = true;
    };
    window.addEventListener(DIAG_EVENT, onLog);
    window.addEventListener(DIAG_ENABLED_EVENT, onEnabled);
    try {
      setDiagEnabled(true);
      recordDiag("replay", "x");
      expect(logFired).toBe(true);
      expect(enabledFired).toBe(true);
    } finally {
      window.removeEventListener(DIAG_EVENT, onLog);
      window.removeEventListener(DIAG_ENABLED_EVENT, onEnabled);
    }
  });

  test("多 scope 混存同缓冲，前缀区分域", () => {
    setDiagEnabled(true);
    recordDiag("replay", "a");
    recordDiag("perf", "b");
    const lines = readDiagLines();
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/\[replay\] a$/);
    expect(lines[1]).toMatch(/\[perf\] b$/);
  });

  test("clearDiagLog 清缓冲清落盘，不动开关态", () => {
    setDiagEnabled(true);
    recordDiag("replay", "x");
    clearDiagLog();
    expect(readDiagLines()).toHaveLength(0);
    expect(localStorage.getItem("ar-diag-log")).toBe(null);
    expect(isDiagEnabled()).toBe(true);
  });

  test("落盘损坏容错（坏 JSON → 空缓冲起步，不炸）", () => {
    setDiagEnabled(true);
    localStorage.setItem("ar-diag-log", "{broken");
    // 模块级 lines 已加载过；直接验 record 在坏盘上仍工作（catch 静默、内存缓冲推进）
    recordDiag("replay", "after-broken");
    expect(readDiagLines().at(-1)).toMatch(/after-broken/);
  });
});
