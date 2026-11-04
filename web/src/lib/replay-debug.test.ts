import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import {
  REPLAY_DEBUG_EVENT,
  readReplayDebugLines,
  recordReplayDebug,
  resetReplayDebugForTests,
} from "./replay-debug";

// bun:test 无内置 jsdom——手动建 JSDOM 挂 globalThis（pinned-sessions.test.ts 同款
// 范式）。模块 import 先于挂载：load() 的 try/catch 吞掉无 localStorage 的
// ReferenceError 空缓冲起步，挂载后 record 读写均走 JSDOM localStorage。
let dom: JSDOM;
beforeEach(() => {
  dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
  globalThis.window = dom.window as unknown as Window & typeof globalThis;
  globalThis.localStorage = dom.window.localStorage;
});

// 环形缓冲/落盘/事件派发（诊断期通道；定位后连同通道一起摘除）
describe("replay-debug 取证通道", () => {
  afterEach(() => {
    resetReplayDebugForTests();
  });

  test("record → read 带 HH:MM:SS 前缀", () => {
    recordReplayDebug("init replay=delta anchor=live");
    const lines = readReplayDebugLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^\d\d:\d\d:\d\d init replay=delta anchor=live$/);
  });

  test("环形裁剪保尾（MAX=24 溢出丢最旧）", () => {
    for (let i = 0; i < 30; i++) recordReplayDebug(`line-${i}`);
    const lines = readReplayDebugLines();
    expect(lines).toHaveLength(24);
    expect(lines[0]).toMatch(/line-6$/);
    expect(lines.at(-1)).toMatch(/line-29$/);
  });

  test("跨实例持久化（localStorage 落盘 → 新读取可见）", () => {
    recordReplayDebug("audit unpaired=0 tool_use=38");
    // 模拟新页面加载：模块级缓冲虽在，但 load() 路径经 localStorage 校验
    const lines = readReplayDebugLines();
    expect(lines.at(-1)).toMatch(/audit unpaired=0/);
    expect(localStorage.getItem("ar-replay-debug")).toContain("audit");
  });

  test("CustomEvent 同页广播（横幅实时刷新信号）", () => {
    let fired = false;
    const on = () => {
      fired = true;
    };
    window.addEventListener(REPLAY_DEBUG_EVENT, on);
    try {
      recordReplayDebug("x");
      expect(fired).toBe(true);
    } finally {
      window.removeEventListener(REPLAY_DEBUG_EVENT, on);
    }
  });

  test("落盘损坏容错（坏 JSON → 空缓冲起步，不炸）", () => {
    localStorage.setItem("ar-replay-debug", "{broken");
    // resetReplayDebugForTests 会清掉刚写的坏值，所以先手工再直接调 read
    // ——但模块级 lines 已加载过；直接验证 load 的容错需重载模块。此处只验
    // record 在坏盘上仍工作（catch 静默、内存缓冲推进）。
    recordReplayDebug("after-broken");
    expect(readReplayDebugLines().at(-1)).toMatch(/after-broken/);
  });
});
