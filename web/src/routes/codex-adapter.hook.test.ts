// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, test, vi } from "bun:test";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { JSDOM } from "jsdom";
import type { CodexStreamServerMessage } from "@agents-remote/shared";
import { createMemReplayStore } from "../lib/replay-cache-store";
import {
  codexReplayCacheKey,
  saveCodexReplayCache,
  setCodexReplayCacheStoreForTests,
} from "../lib/codex-replay-cache";
import { useCodexSession } from "./codex-adapter";

// bun:test 的 afterEach 不是裸全局，RTL auto-cleanup 不注册（同 acp/claude/pi-adapter.hook.test）。
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

  emit(data: CodexStreamServerMessage) {
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

/** 帧构造 helpers（codex_event/echo/config，与 0.163.0 fixtures 形状对齐）。 */
const event = (method: string, params: Record<string, unknown> = {}): CodexStreamServerMessage => ({
  type: "codex_event",
  event: { method, params },
});
const echo = (text: string, uuid: string): CodexStreamServerMessage => ({
  type: "codex_user_echo",
  text,
  uuid,
});
const configFrame = (): CodexStreamServerMessage => ({
  type: "codex_config",
  models: [{ id: "gpt-5.1-codex", displayName: "GPT-5.1 Codex" }],
  current: { model: "gpt-5.1-codex", effort: null, approvalPolicy: "default", sandbox: "default" },
});

/** 跑完开场握手（session_init → 空 history/live 批 → live_end → loading=false）。 */
async function openSession(options?: Parameters<typeof useCodexSession>[2]) {
  const { result } = renderHook(() => useCodexSession("demo", "s1", options));
  await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
  const socket = MockSocket.instances[0];
  act(() => socket.open());
  await waitFor(() => expect(result.current.connected).toBe(true));
  act(() => {
    socket.emit({ type: "session_init", resume: false } as CodexStreamServerMessage);
    socket.emit({ type: "history_start", count: 0 } as CodexStreamServerMessage);
    socket.emit({ type: "history_end" } as CodexStreamServerMessage);
    socket.emit({ type: "live_start", count: 0 } as CodexStreamServerMessage);
    socket.emit({ type: "live_end" } as CodexStreamServerMessage);
  });
  await waitFor(() => expect(result.current.loading).toBe(false));
  return { result, socket };
}

/** 断开当前 socket 并推进 500ms 退避，返回重连 socket。 */
async function reconnect(socket: MockSocket) {
  act(() => {
    socket.onclose?.();
    vi.advanceTimersByTime(500); // onclose 的 setTimeout 退避
  });
  await waitFor(() => expect(MockSocket.instances).toHaveLength(2));
  const next = MockSocket.instances[1];
  act(() => next.open());
  return next;
}

describe("useCodexSession 上下文占用标量", () => {
  test("thread/tokenUsage/updated → contextUsage（裸 input = inputTokens − cachedInputTokens）", async () => {
    const { result, socket } = await openSession();
    act(() => {
      socket.emit(
        event("thread/tokenUsage/updated", {
          threadId: "th-1",
          turnId: "t-1",
          tokenUsage: {
            total: {
              totalTokens: 22791,
              inputTokens: 21000,
              cachedInputTokens: 8000,
              cacheWriteInputTokens: 0,
              outputTokens: 900,
              reasoningOutputTokens: 100,
            },
            last: {
              totalTokens: 12236,
              inputTokens: 12236,
              cachedInputTokens: 8104,
              cacheWriteInputTokens: 0,
              outputTokens: 640,
              reasoningOutputTokens: 50,
            },
            modelContextWindow: 258400,
          },
        }),
      );
    });
    expect(result.current.contextUsage).toEqual({
      contextTokens: 12236,
      inputTokens: 12236 - 8104,
      cacheReadTokens: 8104,
      cacheCreationTokens: 0,
      outputTokens: 640,
      contextWindow: 258400,
    });
  });

  test("缺形状 tokenUsage（{}）不更新（contextUsage 保持 undefined，不伪造）", async () => {
    const { result, socket } = await openSession();
    act(() => {
      socket.emit(event("thread/tokenUsage/updated", { tokenUsage: {} }));
    });
    expect(result.current.contextUsage).toBeUndefined();
  });
});

describe("useCodexSession 附件上行（wire 形状收口）", () => {
  test("onNew 带附件快照 → user 帧 images 为 {mimeType,data}（composer 的 mediaType 在此改名，code review P1-1）", async () => {
    const { result, socket } = await openSession({
      takePendingAttachments: () => ({
        images: [{ mediaType: "image/png", data: "QUJD" }],
        mentionLines: [],
        inlineTexts: [],
      }),
      clearPendingAttachments: () => {},
    });

    await act(async () => {
      await result.current.storeAdapter.onNew({
        content: [{ type: "text", text: "看图" }],
      } as never);
    });

    const sent = socket.sent.map((raw) => JSON.parse(raw) as Record<string, unknown>);
    const userFrame = sent.find((m) => m.type === "user");
    expect(userFrame).toMatchObject({
      type: "user",
      text: "看图",
      images: [{ mimeType: "image/png", data: "QUJD" }],
    });
  });
});

describe("useCodexSession 双模式冲突（服务端终端形态守卫）", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("SESSION_STATE_CONFLICT → 关 socket 不重连 + 回调上抛（多端跟随失效 detail）", async () => {
    const onModeConflict = vi.fn();
    const { result } = renderHook(() => useCodexSession("demo", "s1", { onModeConflict }));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());
    await waitFor(() => expect(result.current.connected).toBe(true));

    act(() => {
      socket.emit({
        type: "error",
        code: "SESSION_STATE_CONFLICT",
        message: "Session is in terminal mode",
      } as CodexStreamServerMessage);
    });

    expect(onModeConflict).toHaveBeenCalledTimes(1);
    expect(socket.readyState).toBe(MockSocket.CLOSED);
    expect(result.current.connected).toBe(false);
    // 冲突 = 本端不该再连（会话在终端形态）：退避推进后不得重连。
    act(() => vi.advanceTimersByTime(5000));
    expect(MockSocket.instances).toHaveLength(1);
    // 不是普通错误：不落 streamError 文案（面板会被 detail 失效换掉）。
    expect(result.current.streamError).toBeNull();
  });
});

describe("useCodexSession 增量回放分支", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("重连 URL 携带本地锚（since=<最后可锚条目 id>）", async () => {
    const { result, socket } = await openSession();
    act(() => {
      socket.emit(echo("question", "uuid-1"));
    });
    await waitFor(() => expect(result.current.storeAdapter.messages).toHaveLength(1));

    const next = await reconnect(socket);
    // 重连 URL = 客户端最后可锚条目 id（echo.uuid）。
    expect(next.url).toContain("since=uuid-1");
  });

  test("session_init replay=delta → 保留已渲染内容（不 reset、loading 不翻骨架）", async () => {
    const { result, socket } = await openSession();
    act(() => {
      socket.emit(echo("question", "uuid-1"));
      socket.emit(configFrame());
    });
    await waitFor(() => expect(result.current.storeAdapter.messages).toHaveLength(1));

    const next = await reconnect(socket);
    act(() => {
      next.emit({
        type: "session_init",
        resume: false,
        replay: "delta",
      } as CodexStreamServerMessage);
      next.emit({ type: "history_start", count: 0 } as CodexStreamServerMessage);
      next.emit({ type: "history_end" } as CodexStreamServerMessage);
      next.emit({ type: "live_start", count: 0 } as CodexStreamServerMessage);
      next.emit({ type: "live_end" } as CodexStreamServerMessage);
    });
    // delta：首连的 echo 保留（raw 不清空）；config 保留；loading 保持 false。
    expect(result.current.storeAdapter.messages).toHaveLength(1);
    expect(result.current.config).not.toBeNull();
    expect(result.current.loading).toBe(false);
  });

  test("session_init 无 replay（full/老服务端）→ reset 重建（messages/config/usage 清空）", async () => {
    const { result, socket } = await openSession();
    act(() => {
      socket.emit(echo("question", "uuid-1"));
      socket.emit(configFrame());
      socket.emit(
        event("thread/tokenUsage/updated", {
          threadId: "th-1",
          turnId: "t-1",
          tokenUsage: {
            total: {
              totalTokens: 100,
              inputTokens: 90,
              cachedInputTokens: 0,
              cacheWriteInputTokens: 0,
              outputTokens: 10,
              reasoningOutputTokens: 0,
            },
            last: {
              totalTokens: 100,
              inputTokens: 100,
              cachedInputTokens: 0,
              cacheWriteInputTokens: 0,
              outputTokens: 10,
              reasoningOutputTokens: 0,
            },
            modelContextWindow: 258400,
          },
        }),
      );
    });
    await waitFor(() => expect(result.current.storeAdapter.messages).toHaveLength(1));

    const next = await reconnect(socket);
    act(() => {
      next.emit({ type: "session_init", resume: false } as CodexStreamServerMessage);
    });
    // full：立即 reset（messages/config/usage 清空 + loading 骨架），等 live_end 恢复。
    expect(result.current.storeAdapter.messages).toHaveLength(0);
    expect(result.current.config).toBeNull();
    expect(result.current.contextUsage).toBeUndefined();
    expect(result.current.loading).toBe(true);

    act(() => {
      next.emit({ type: "history_start", count: 0 } as CodexStreamServerMessage);
      next.emit({ type: "history_end" } as CodexStreamServerMessage);
      next.emit({ type: "live_start", count: 0 } as CodexStreamServerMessage);
      next.emit({ type: "live_end" } as CodexStreamServerMessage);
    });
    expect(result.current.loading).toBe(false);
  });
});

describe("useCodexSession 跨 remount 恢复", () => {
  afterEach(() => {
    setCodexReplayCacheStoreForTests(null); // 还原生产懒创建
  });

  test("恢复命中：raw 即刻呈现 + URL 带 since 锚 + loading false", async () => {
    setCodexReplayCacheStoreForTests(createMemReplayStore());
    await saveCodexReplayCache(
      codexReplayCacheKey("demo", "s1"),
      // 预置行 = CodexRawItem 形状（flush 存的是内核产物，非传输帧）。
      [JSON.stringify({ kind: "echo", text: "question", uuid: "u1", confirmed: true })],
      "u1",
    );
    const { result } = renderHook(() => useCodexSession("demo", "s1"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    expect(socket.url).toContain("since=u1");
    await act(() => socket.open());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.storeAdapter.messages).toHaveLength(1);
  });
});
