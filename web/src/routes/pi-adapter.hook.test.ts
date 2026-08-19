// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, test, vi } from "bun:test";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
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

describe("usePiSession attachments", () => {
  // FileReader.readAsDataURL 是原生异步回调，onload 在 act 外触发 setState → 测试告警。
  // mock 成同步触发 onload（data URL 前缀 + 固定 base64），让 state 更新落在 act 内。
  const originalFileReader = globalThis.FileReader;
  beforeEach(() => {
    class MockFileReader {
      result = "data:image/png;base64,aGVsbG8=";
      onload: (() => void) | null = null;
      readAsDataURL() {
        this.onload?.();
      }
    }
    globalThis.FileReader = MockFileReader as unknown as typeof FileReader;
  });
  afterEach(() => {
    globalThis.FileReader = originalFileReader;
  });

  test("addAttachments → onNew 发送 user 帧带 images；发送后清空", async () => {
    const { result } = renderHook(() => usePiSession("c1"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    socket.open();

    const file = new File(["fake-image-bytes"], "photo.png", { type: "image/png" });
    await act(async () => {
      result.current.addAttachments([file]);
    });
    // FileReader mock 同步触发 onload → attachments 已落 state（无需 waitFor）。
    expect(result.current.attachments).toHaveLength(1);
    const attachment = result.current.attachments[0];
    expect(attachment.mimeType).toBe("image/png");
    expect(attachment.data.length).toBeGreaterThan(0);

    await act(async () => {
      await result.current.storeAdapter.onNew({
        content: [{ type: "text", text: "看图" }],
      } as never);
    });
    const sent = socket.sent.find((s) => s.includes('"type":"user"'));
    expect(sent).toBeDefined();
    const parsed = JSON.parse(sent!);
    expect(parsed.text).toBe("看图");
    expect(parsed.images).toHaveLength(1);
    expect(parsed.images[0]).toMatchObject({ mimeType: "image/png" });
    // 发送后清空 attachments。
    expect(result.current.attachments).toHaveLength(0);
  });

  test("removeAttachment 移除指定附件", async () => {
    const { result } = renderHook(() => usePiSession("c1"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    socket.open();

    const file = new File(["a"], "a.png", { type: "image/png" });
    await act(async () => {
      result.current.addAttachments([file]);
    });
    expect(result.current.attachments).toHaveLength(1);
    const id = result.current.attachments[0].id;

    act(() => {
      result.current.removeAttachment(id);
    });
    expect(result.current.attachments).toHaveLength(0);
  });

  test("非图片文件被忽略", async () => {
    const { result } = renderHook(() => usePiSession("c1"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    socket.open();

    const file = new File(["text"], "note.txt", { type: "text/plain" });
    await act(async () => {
      result.current.addAttachments([file]);
    });
    expect(result.current.attachments).toHaveLength(0);
  });
});
