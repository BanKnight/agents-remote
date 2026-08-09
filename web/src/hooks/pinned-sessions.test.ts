import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { JSDOM } from "jsdom";
import type { PinnedSessionsResponse } from "@agents-remote/shared";

import { readLegacyPinnedSessions, usePinnedSessions } from "./pinned-sessions";

// mock ../api/client 只提供 pinned-sessions.ts 需要的三个函数（mock.module 全量替换 module
// namespace，不 spread 真实实现——避免活绑定自递归）。pinSessionMock 可直接断言。
const pinSessionMock = mock(
  async (sessionId: string) => ({ sessions: [sessionId] }) satisfies PinnedSessionsResponse,
);
const unpinSessionMock = mock(async () => ({ sessions: [] }) satisfies PinnedSessionsResponse);
const listPinnedSessionsMock = mock(
  async () => ({ sessions: [] }) satisfies PinnedSessionsResponse,
);
mock.module("../api/client", () => ({
  pinSession: pinSessionMock,
  unpinSession: unpinSessionMock,
  listPinnedSessions: listPinnedSessionsMock,
}));

// bun:test 无内置 jsdom（@vitest-environment 指令不被识别），手动建 JSDOM 并挂到
// globalThis（use-mobile-exit-close.test.ts:75-78 同款范式）。每个 it 一个干净 DOM + localStorage。
let dom: JSDOM;
beforeEach(() => {
  dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
  globalThis.window = dom.window as unknown as Window & typeof globalThis;
  globalThis.document = dom.window.document as unknown as Document;
  globalThis.localStorage = dom.window.localStorage;
  // mockClear 只清调用记录、保留默认实现（mockReset 会连实现一起清掉 → 返回 undefined → query 警告）。
  pinSessionMock.mockClear();
  unpinSessionMock.mockClear();
  listPinnedSessionsMock.mockClear();
});

afterEach(() => {
  // bun:test 下 RTL auto-cleanup 静默失效（afterEach 非裸全局）→ 手动卸载，防泄漏进后续测试。
  cleanup();
  // 不 delete globalThis.window/localStorage：seed 播种的 invalidateQueries 会调度一个
  // MessageChannel 微/宏任务触发 refetch 渲染，若此时 window 已被删 → ReferenceError。
  // beforeEach 每次覆盖新 JSDOM，悬空引用无害且给残留任务可用的 window。
});

const renderPinned = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // 无 JSX（.test.ts，bun 不转换 JSX）——用 createElement 构造 provider wrapper。
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
  return renderHook(() => usePinnedSessions(), { wrapper });
};

describe("readLegacyPinnedSessions（旧 localStorage pin 解析）", () => {
  it("true 项提取，false/非法丢弃", () => {
    localStorage.setItem(
      "workbenchPinnedSessions",
      JSON.stringify({ "ar-claude-1": true, "ar-terminal-2": false, "ar-claude-3": true }),
    );
    expect(readLegacyPinnedSessions()).toEqual(["ar-claude-1", "ar-claude-3"]);
  });

  it("缺 key / 损坏 JSON / 非对象 → []", () => {
    expect(readLegacyPinnedSessions()).toEqual([]);

    localStorage.setItem("workbenchPinnedSessions", "{ not json");
    expect(readLegacyPinnedSessions()).toEqual([]);

    localStorage.setItem("workbenchPinnedSessions", JSON.stringify(["a", "b"]));
    expect(readLegacyPinnedSessions()).toEqual([]);

    localStorage.setItem("workbenchPinnedSessions", JSON.stringify("str"));
    expect(readLegacyPinnedSessions()).toEqual([]);
  });
});

describe("usePinnedSessions 旧 localStorage 播种", () => {
  it("初始 fetch 结算后播种：true 项 POST + 删除旧 key + invalidate refetch", async () => {
    localStorage.setItem(
      "workbenchPinnedSessions",
      JSON.stringify({ "ar-claude-1": true, "ar-terminal-2": true, "ar-claude-3": false }),
    );

    renderPinned();

    // 播种在初始 fetch 结算后触发（querySettled 门控）：
    // 初始 fetch(#1) → 播种(pinSession×2 + 删 key) → invalidate → refetch(#2)。
    // 整个链包在 act 内，让 query 更新渲染在 act 作用域内结算（避免 act 警告）。
    await act(async () => {
      await waitFor(() => {
        expect(pinSessionMock).toHaveBeenCalledTimes(2);
        expect(pinSessionMock.mock.calls.map((c) => c[0])).toEqual([
          "ar-claude-1",
          "ar-terminal-2",
        ]);
      });
      await waitFor(() => {
        expect(localStorage.getItem("workbenchPinnedSessions")).toBeNull();
      });
      await waitFor(() => expect(listPinnedSessionsMock).toHaveBeenCalledTimes(2));
    });
  });

  it("无旧 key → 不播种、不删任何东西", async () => {
    renderPinned();

    await waitFor(() => expect(listPinnedSessionsMock).toHaveBeenCalledTimes(1));
    // 冲刷 query 结算渲染（mock 调用先于渲染 commit 满足，避免 act 警告逃逸到测试后）
    await act(async () => {});
    expect(pinSessionMock).not.toHaveBeenCalled();
    expect(localStorage.getItem("workbenchPinnedSessions")).toBeNull();
  });

  it("损坏 key → 不播种、key 保留", async () => {
    localStorage.setItem("workbenchPinnedSessions", "{ bad json");
    renderPinned();

    await waitFor(() => expect(listPinnedSessionsMock).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(pinSessionMock).not.toHaveBeenCalled();
    // 损坏值不删除（保留现场，虽无意义但零风险；不误删用户数据）
    expect(localStorage.getItem("workbenchPinnedSessions")).toBe("{ bad json");
  });
});

describe("usePinnedSessions isLoaded（首次结算 gate）", () => {
  it("pending 时 isLoaded=false、pinned 空；结算后 isLoaded=true、pinned 含服务端集合", async () => {
    listPinnedSessionsMock.mockResolvedValueOnce({
      sessions: ["ar-claude-1", "ar-terminal-2"],
    });

    const { result } = renderPinned();

    // 首次渲染（pending）：isLoaded=false，pinned 空集（不阻塞，但 gate 会让总览等结算）。
    expect(result.current.isLoaded).toBe(false);
    expect(result.current.pinned.size).toBe(0);

    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    expect(result.current.pinned.has("ar-claude-1")).toBe(true);
    expect(result.current.pinned.has("ar-terminal-2")).toBe(true);
    expect(result.current.pinned.has("ar-missing-3")).toBe(false);
  });

  it("请求失败时 isLoaded=true（settled）、pinned 空 Set（不阻塞列表）", async () => {
    listPinnedSessionsMock.mockRejectedValueOnce(new Error("network down"));

    const { result } = renderPinned();

    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    expect(result.current.pinned.size).toBe(0);
  });
});
