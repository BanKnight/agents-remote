// @vitest-environment jsdom

// 单测：isHotTool 纯函数 + useApprovals WS 断线重连（§6.5 补强批）。
// WS 主体走 MockSocket（照抄 claude-adapter.hook.test.ts 范式：bun:test 的 afterEach
// 非裸全局 → 手动 afterEach(cleanup)；手动 JSDOM 全局 + globalThis.WebSocket mock +
// fake timers 驱动 500ms 重连）。
import { afterEach, beforeEach, describe, expect, test, vi } from "bun:test";
import { act, cleanup, renderHook } from "@testing-library/react";
import { createElement } from "react";
import { JSDOM } from "jsdom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ApprovalSummary, ApprovalsStreamServerMessage } from "@agents-remote/shared";

import { isHotTool, useApprovals } from "./use-approvals";

const makeSummary = (overrides: Partial<ApprovalSummary> = {}): ApprovalSummary => ({
  controlRequestId: "cr-1",
  createdAt: "2026-09-25T00:00:00Z",
  inputSummary: "ls -la",
  projectName: "demo",
  runtimeAlive: true,
  runtimeKey: "demo/s-1",
  sessionId: "s-1",
  sessionName: "demo session",
  toolName: "Bash",
  ...overrides,
});

describe("isHotTool", () => {
  test("写文件族工具恒 hot", () => {
    for (const toolName of ["Write", "Edit", "MultiEdit", "NotebookEdit"] as const) {
      expect(isHotTool(makeSummary({ toolName }))).toBe(true);
    }
  });
  test("Bash 内容启发：rm / git push hot，其余命令不 hot", () => {
    expect(isHotTool(makeSummary({ inputSummary: "rm -rf build" }))).toBe(true);
    expect(isHotTool(makeSummary({ inputSummary: "git push origin main" }))).toBe(true);
    expect(isHotTool(makeSummary({ inputSummary: "git status" }))).toBe(false);
    expect(isHotTool(makeSummary({ inputSummary: "echo hi" }))).toBe(false);
  });
  test("其他工具不 hot", () => {
    expect(isHotTool(makeSummary({ toolName: "WebFetch" }))).toBe(false);
  });
});

// ── useApprovals WS 断线重连（§6.5 补强批）─────────────────────────────

class MockSocket {
  static instances: MockSocket[] = [];
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSED = 3;

  readyState = MockSocket.CONNECTING;
  onmessage: null | ((event: { data: string }) => void) = null;
  onclose: null | (() => void) = null;

  constructor(public url: string) {
    MockSocket.instances.push(this);
  }

  close() {
    this.readyState = MockSocket.CLOSED;
    this.onclose?.();
  }

  emit(frame: ApprovalsStreamServerMessage) {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }
}

const renderUseApprovals = () => {
  // 每测试独立 QueryClient：approvals 帧整体替换进 cache，隔离跨测试污染。
  const client = new QueryClient();
  return renderHook(() => useApprovals(true), {
    wrapper: ({ children }) => createElement(QueryClientProvider, { client }, children),
  });
};

describe("useApprovals websocket 断线重连", () => {
  beforeEach(() => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
    globalThis.window = dom.window as unknown as Window & typeof globalThis;
    globalThis.document = dom.window.document as unknown as Document;
    globalThis.navigator = dom.window.navigator as unknown as Navigator;
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: dom.window.location,
    });
    globalThis.WebSocket = MockSocket as unknown as typeof WebSocket;
    MockSocket.instances = [];
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ approvals: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    ) as unknown as typeof fetch;
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  test("断线 500ms 后重连；新连接继续喂同一 query cache", () => {
    const { result } = renderUseApprovals();
    expect(MockSocket.instances).toHaveLength(1);

    act(() => {
      MockSocket.instances[0]?.emit({
        type: "approvals",
        approvals: [makeSummary({ controlRequestId: "cr-1" })],
      });
      // 冲刷 react-query notifyManager 的 setTimeout(0) 调度（fake timers 冻结下需手动）。
      vi.advanceTimersByTime(1);
    });
    expect(result.current.approvals).toHaveLength(1);

    // 服务器断开；onclose 双发也只排一次重连（防重入守卫）。
    act(() => {
      MockSocket.instances[0]?.onclose?.();
      MockSocket.instances[0]?.onclose?.();
    });
    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(MockSocket.instances).toHaveLength(1);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(MockSocket.instances).toHaveLength(2);

    // 新连接继续喂帧（服务端 open 即推全量快照的语义）→ 同一 cache 整体替换。
    act(() => {
      MockSocket.instances[1]?.emit({
        type: "approvals",
        approvals: [
          makeSummary({ controlRequestId: "cr-1" }),
          makeSummary({ controlRequestId: "cr-2" }),
        ],
      });
      vi.advanceTimersByTime(1);
    });
    expect(result.current.approvals).toHaveLength(2);
  });

  test("unmount 取消 pending 重连", () => {
    const { unmount } = renderUseApprovals();
    expect(MockSocket.instances).toHaveLength(1);

    act(() => {
      MockSocket.instances[0]?.onclose?.(); // 断线 → 重连 timer 排上
    });
    unmount(); // 最后一个消费面卸载 → timer 取消 + 连接关闭
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(MockSocket.instances).toHaveLength(1);
  });

  test("refCount=0 的主动关闭不重连（disconnect 路径 onclose 不排 timer）", () => {
    const { unmount } = renderUseApprovals();
    expect(MockSocket.instances).toHaveLength(1);

    unmount(); // disconnect → close() → onclose 同步到达（refCount 已 0）
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(MockSocket.instances).toHaveLength(1);
  });
});
