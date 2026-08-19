// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, test, vi } from "bun:test";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { JSDOM } from "jsdom";
import type { PiStreamServerMessage } from "@agents-remote/shared";
import { usePiSession } from "./pi-adapter";

// bun:test 的 afterEach 不是裸全局，RTL auto-cleanup 不注册（同 claude-adapter.hook.test）。
afterEach(() => cleanup());

class MockSocket {
  static instances: MockSocket[] = [];
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSED = 3;

  readyState = MockSocket.CONNECTING;
  sent: string[] = [];
  onopen: null | (() => void) = null;
  onmessage: null | ((event: { data: ArrayBuffer | string }) => void) = null;
  onclose: null | (() => void) = null;
  onerror: null | ((event: unknown) => void) = null;

  constructor(public url: string) {
    MockSocket.instances.push(this);
  }

  send(raw: string) {
    this.sent.push(raw);
  }

  close() {
    this.readyState = MockSocket.CLOSED;
    this.onclose?.();
  }

  open() {
    this.readyState = MockSocket.OPEN;
    this.onopen?.();
  }

  emit(data: PiStreamServerMessage) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

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
    async () => new Response("{}", { status: 200 }),
  ) as unknown as typeof fetch;
});

describe("usePiSession chat_title", () => {
  test("chat_title 帧 → title state；session_init 重置为 null", async () => {
    const { result } = renderHook(() => usePiSession("c1"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    socket.open();

    socket.emit({ type: "chat_title", title: "问候测试" } as PiStreamServerMessage);
    await waitFor(() => expect(result.current.title).toBe("问候测试"));

    // 重连（session_init）→ title 回 null（持久标题由 detail useQuery displayName 提供）。
    socket.emit({ type: "session_init", resume: false });
    await waitFor(() => expect(result.current.title).toBeNull());
  });
});
