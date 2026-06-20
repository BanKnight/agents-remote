// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from "bun:test";
import { act, renderHook, waitFor } from "@testing-library/react";
import { JSDOM } from "jsdom";
import type { SessionStreamServerMessage } from "@agents-remote/shared";
import { useClaude2Session } from "./claude2-adapter";

class MockSocket {
  static instances: MockSocket[] = [];
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSED = 3;

  readyState = MockSocket.CONNECTING;
  sent: string[] = [];
  listeners = new Map<string, Array<() => void>>();
  onopen: null | (() => void) = null;
  onmessage: null | ((event: { data: string }) => void) = null;
  onclose: null | (() => void) = null;
  onerror: null | ((event: unknown) => void) = null;

  constructor(public url: string) {
    MockSocket.instances.push(this);
  }

  addEventListener(type: string, cb: () => void) {
    const list = this.listeners.get(type) ?? [];
    list.push(cb);
    this.listeners.set(type, list);
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
    for (const cb of this.listeners.get("open") ?? []) cb();
  }

  emit(data: SessionStreamServerMessage) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

const setFetch = () => {
  globalThis.fetch = vi.fn(
    async () =>
      new Response(JSON.stringify({ session: { id: "s1" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  ) as unknown as typeof fetch;
};

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
  setFetch();
});

describe("useClaude2Session websocket lifecycle", () => {
  test("first live message can arrive without replay markers", async () => {
    const { result } = renderHook(() => useClaude2Session("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit({
        type: "assistant",
        message: { id: "live-1", role: "assistant", content: [{ type: "text", text: "hello" }] },
        session_id: "s1",
      } as never);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.storeAdapter.messages).toHaveLength(1);
    expect(result.current.storeAdapter.messages[0]?.role).toBe("assistant");
  });

  test("empty output batch does not crash or add messages", async () => {
    const { result } = renderHook(() => useClaude2Session("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit({ type: "live_start", count: 0 } as never);
      socket.emit({ type: "live_end" } as never);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.tasks).toEqual([]);
  });

  test("handles replay, switch model, and control_request branches", async () => {
    const { result } = renderHook(() => useClaude2Session("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit({ type: "history_start", count: 1 });
      socket.emit({
        type: "assistant",
        message: { id: "a1", role: "assistant", content: [] },
        session_id: "s1",
      });
      socket.emit({ type: "history_end" });
      socket.emit({ type: "live_start", count: 0 } as never);
      socket.emit({ type: "live_end" } as never);
    });

    expect(result.current.loading).toBe(false);
    // assistant(1) + history divider(1 system) = 2
    // (markers are no longer rendered as raw bubbles)
    expect(result.current.storeAdapter.messages).toHaveLength(2);
  });

  test("reconnect replays only the missing uuid tail", async () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useClaude2Session("proj", "sess"));
      await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
      const socket = MockSocket.instances[0];
      act(() => socket.open());

      act(() => {
        socket.emit({
          type: "assistant",
          uuid: "uuid-1",
          message: { id: "a1", role: "assistant", content: [{ type: "text", text: "first" }] },
          session_id: "s1",
        } as never);
      });
      expect(result.current.storeAdapter.messages).toHaveLength(1);

      act(() => {
        socket.onclose?.();
      });
      expect(result.current.loading).toBe(true);
      expect(result.current.storeAdapter.messages).toHaveLength(1);

      act(() => {
        vi.advanceTimersByTime(500);
      });
      await waitFor(() => expect(MockSocket.instances).toHaveLength(2));
      const reconnectSocket = MockSocket.instances[1];
      act(() => reconnectSocket.open());

      act(() => {
        reconnectSocket.emit({ type: "history_start", count: 2 } as never);
        reconnectSocket.emit({
          type: "assistant",
          uuid: "uuid-1",
          message: { id: "a1", role: "assistant", content: [{ type: "text", text: "first" }] },
          session_id: "s1",
        } as never);
        reconnectSocket.emit({
          type: "assistant",
          uuid: "uuid-2",
          message: { id: "a2", role: "assistant", content: [{ type: "text", text: "second" }] },
          session_id: "s1",
        } as never);
        reconnectSocket.emit({ type: "history_end" } as never);
        reconnectSocket.emit({ type: "live_start", count: 0 } as never);
        reconnectSocket.emit({ type: "live_end" } as never);
      });

      expect(result.current.loading).toBe(false);
      // normalizeChatStream groups by message.id: the first-conn a1 and
      // replay a1 share the same id so they merge into one bubble (no
      // duplicate). Result: merged assistant a1 + assistant a2 + history
      // divider = 3.
      expect(result.current.storeAdapter.messages).toHaveLength(3);
    } finally {
      vi.useRealTimers();
    }
  });

  test("messages flow through pipeline without errors", async () => {
    const { result } = renderHook(() => useClaude2Session("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit({
        type: "system",
        subtype: "status",
        status: "compacting",
        session_id: "s1",
      } as never);
      socket.emit({
        type: "assistant",
        message: {
          id: "ask",
          role: "assistant",
          content: [
            { type: "tool_use", id: "tu-ask", name: "AskUserQuestion", input: { questions: [] } },
          ],
        },
        session_id: "s1",
      } as never);
      socket.emit({ type: "result", subtype: "success", session_id: "s1", num_turns: 1 } as never);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.storeAdapter.messages.length).toBeGreaterThan(0);
  });

  test("bridge methods and transport lifecycle keep local state in sync", async () => {
    const { result } = renderHook(() => useClaude2Session("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit({
        type: "system",
        subtype: "init",
        model: "claude-sonnet-4-20250514",
        permissionMode: "bypassPermissions",
      } as never);
    });

    // system/init rendered as visible "other" bubble
    expect(result.current.storeAdapter.messages.length).toBeGreaterThan(0);

    await act(async () => {
      await result.current.storeAdapter.onNew({
        content: [{ type: "text", text: "hello" }],
      } as never);
    });
    expect(socket.sent.some((s) => s.includes('"text":"hello"'))).toBe(true);

    act(() => {
      result.current.bridge.respondToControlRequest("req-1", {
        foo: "bar",
        answers: ["yes"],
      } as never);
      result.current.bridge.cancelControlRequest("req-2");
      result.current.bridge.sendToolResult("tool-1", [{ type: "text", text: "ok" }] as never);
      result.current.bridge.sendMessage("world");
      result.current.bridge.switchModel("opus");
      result.current.bridge.switchPermissionMode("default");
    });

    expect(result.current.currentModel).toBe("opus");
    expect(result.current.permissionMode).toBe("default");
    expect(
      socket.sent.some(
        (s) => s.includes('"request_id":"req-1"') && s.includes('"behavior":"allow"'),
      ),
    ).toBe(true);
    expect(
      socket.sent.some(
        (s) => s.includes('"request_id":"req-2"') && s.includes('"message":"User skipped"'),
      ),
    ).toBe(true);
    expect(socket.sent.some((s) => s.includes('"tool_use_id":"tool-1"'))).toBe(true);
    expect(socket.sent.some((s) => s.includes('"text":"world"'))).toBe(true);
    expect(
      socket.sent.some((s) => s.includes('"type":"switch_model"') && s.includes('"model":"opus"')),
    ).toBe(true);
    expect(
      socket.sent.some(
        (s) => s.includes('"type":"permission_mode"') && s.includes('"mode":"default"'),
      ),
    ).toBe(true);

    act(() => {
      socket.onerror?.({ message: "boom" });
      socket.onclose?.();
    });

    expect(result.current.loading).toBe(true);
    // Messages persist across disconnect (live output is preserved)
    expect(result.current.storeAdapter.messages.length).toBeGreaterThan(0);
  });

  test("messages after compact flow through pipeline", async () => {
    const { result } = renderHook(() => useClaude2Session("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit({ type: "result", subtype: "success", session_id: "s1", num_turns: 1 } as never);
      socket.emit({
        type: "assistant",
        message: {
          id: "live",
          role: "assistant",
          content: [{ type: "text", text: "after compact" }],
        },
        session_id: "s1",
      } as never);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.storeAdapter.messages.length).toBeGreaterThan(0);
  });

  test("onCancel sends interrupt request", async () => {
    const { result } = renderHook(() => useClaude2Session("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    await act(async () => {
      await result.current.storeAdapter.onCancel();
    });

    expect(socket.sent.some((s) => s.includes('"subtype":"interrupt"'))).toBe(true);
  });

  test("live messages flow through pipeline to storeAdapter", async () => {
    const { result } = renderHook(() => useClaude2Session("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit({
        type: "assistant",
        message: {
          id: "msg-1",
          role: "assistant",
          content: [{ type: "tool_use", id: "tu-1", name: "Bash", input: {} }],
        },
        session_id: "s1",
      } as never);
      socket.emit({
        type: "user",
        message: { role: "user", content: [{ type: "text", text: "echo" }] },
      } as never);
    });

    expect(result.current.storeAdapter.messages.some((msg) => msg.role === "user")).toBe(true);
    // tool_use-only assistant → tool-card system message, no assistant bubble
    expect(
      result.current.storeAdapter.messages.some(
        (msg) =>
          msg.role === "system" &&
          ((msg.metadata?.custom as Record<string, unknown>)?.systemMessageType as string) ===
            "tool-card",
      ),
    ).toBe(true);
    expect(result.current.loading).toBe(false);
  });

  test("empty text input is not sent to socket", async () => {
    const { result } = renderHook(() => useClaude2Session("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    await act(async () => {
      await result.current.storeAdapter.onNew({
        content: [{ type: "text", text: "   " }],
      } as never);
    });
    expect(socket.sent.some((s) => s.includes('"text":"   "'))).toBe(false);
  });

  test("initial props hydrate via rerender when values arrive later", async () => {
    const { result, rerender } = renderHook(
      ({ model, permissionMode }: { model?: string; permissionMode?: string }) =>
        useClaude2Session("proj", "sess", model, permissionMode),
      {
        initialProps: { model: undefined, permissionMode: undefined },
      },
    );
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));

    rerender({ model: "gpt-4.1", permissionMode: "auto" });

    await waitFor(() => expect(result.current.resolvedModel).toBe("gpt-4.1"));
    await waitFor(() => expect(result.current.permissionMode).toBe("auto"));
  });

  test("initial props, deferred sends, and empty composer input are handled", async () => {
    const { result } = renderHook(() => useClaude2Session("proj", "sess", "gpt-4.1", "auto"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];

    expect(result.current.resolvedModel).toBe("gpt-4.1");
    expect(result.current.permissionMode).toBe("auto");

    act(() => {
      result.current.bridge.sendMessage("queued before open");
      result.current.bridge.sendToolResult("tu-1", [{ type: "text", text: "queued" }] as never);
    });
    expect(socket.sent).toHaveLength(0);
    act(() => socket.open());
    expect(socket.sent.some((s) => s.includes('"text":"queued before open"'))).toBe(true);
    expect(socket.sent.some((s) => s.includes('"tool_use_id":"tu-1"'))).toBe(true);

    await act(async () => {
      await result.current.storeAdapter.onNew({
        content: [{ type: "text", text: "   " }],
      } as never);
    });
    expect(socket.sent.some((s) => s.includes('"text":"   "'))).toBe(false);
  });

  test("open-path sends hit the immediate send error handler", async () => {
    const { result } = renderHook(() => useClaude2Session("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const sendSpy = vi.spyOn(socket, "send").mockImplementation(() => {
      throw new Error("open boom");
    });

    act(() => socket.open());
    act(() => {
      result.current.bridge.sendMessage("now");
    });

    expect(sendSpy).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
    sendSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test("deferred sends hit the open listener error path", async () => {
    const { result } = renderHook(() => useClaude2Session("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const sendSpy = vi.spyOn(socket, "send").mockImplementation(() => {
      throw new Error("deferred boom");
    });

    act(() => {
      result.current.bridge.sendMessage("queued while connecting");
    });
    expect(socket.sent).toHaveLength(0);
    act(() => socket.open());

    expect(sendSpy).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
    sendSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test("EnterPlanMode tool_use sets permissionMode to plan", async () => {
    const { result } = renderHook(() => useClaude2Session("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit({
        type: "assistant",
        userType: "external",
        message: {
          id: "m1",
          role: "assistant",
          content: [{ type: "tool_use", id: "tu-plan", name: "EnterPlanMode", input: {} }],
        },
      } as never);
    });

    expect(result.current.permissionMode).toBe("plan");
  });

  test("permission-mode message sets permissionMode and renders no bubble", async () => {
    const { result } = renderHook(() => useClaude2Session("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    const before = result.current.storeAdapter.messages.length;
    act(() => {
      socket.emit({
        type: "permission-mode",
        permissionMode: "acceptEdits",
      } as never);
    });

    expect(result.current.permissionMode).toBe("acceptEdits");
    expect(result.current.storeAdapter.messages.length).toBe(before);
  });

  test("ai-title and agent-name are state signals, produce no bubble", async () => {
    const { result } = renderHook(() => useClaude2Session("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    const before = result.current.storeAdapter.messages.length;
    act(() => {
      socket.emit({ type: "ai-title", aiTitle: "测试标题" } as never);
    });
    expect(result.current.aiTitle).toBe("测试标题");
    expect(result.current.storeAdapter.messages.length).toBe(before);

    act(() => {
      socket.emit({ type: "agent-name", agentName: "test-agent" } as never);
    });
    expect(result.current.agentName).toBe("test-agent");
    expect(result.current.storeAdapter.messages.length).toBe(before);

    // Dedup: same value should not trigger re-render count change (react batches)
    act(() => {
      socket.emit({ type: "ai-title", aiTitle: "测试标题" } as never);
    });
    expect(result.current.aiTitle).toBe("测试标题");
    expect(result.current.storeAdapter.messages.length).toBe(before);
  });
});

describe("useClaude2Session queue-operation", () => {
  test("live enqueue does not produce bubble, updates inputQueue", async () => {
    const { result } = renderHook(() => useClaude2Session("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    const before = result.current.storeAdapter.messages.length;
    act(() => {
      socket.emit({
        type: "queue-operation",
        operation: "enqueue",
        content: "/model opusplan",
      } as never);
    });

    expect(result.current.storeAdapter.messages.length).toBe(before);
    expect(result.current.inputQueue).toEqual([{ content: "/model opusplan", source: "user" }]);
  });

  test("enqueue/dequeue/remove/popAll sequence", async () => {
    const { result } = renderHook(() => useClaude2Session("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit({
        type: "queue-operation",
        operation: "enqueue",
        content: "/model opusplan",
      } as never);
      socket.emit({
        type: "queue-operation",
        operation: "enqueue",
        content: "<task-notification><task-id>a1</task-id></task-notification>",
      } as never);
    });
    expect(result.current.inputQueue).toHaveLength(2);
    expect(result.current.inputQueue[0].source).toBe("user");
    expect(result.current.inputQueue[1].source).toBe("assistant");

    act(() => socket.emit({ type: "queue-operation", operation: "dequeue" } as never));
    expect(result.current.inputQueue).toHaveLength(1);

    act(() => socket.emit({ type: "queue-operation", operation: "remove" } as never));
    expect(result.current.inputQueue).toHaveLength(0);

    // popAll on already-empty queue → []
    act(() =>
      socket.emit({ type: "queue-operation", operation: "popAll", content: "old text" } as never),
    );
    expect(result.current.inputQueue).toHaveLength(0);
  });

  test("history replay batch processes queue-operation without bubble", async () => {
    const { result } = renderHook(() => useClaude2Session("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit({ type: "history_start", count: 2 });
      socket.emit({
        type: "assistant",
        message: { id: "a1", role: "assistant", content: [] },
        session_id: "s1",
      });
      socket.emit({ type: "queue-operation", operation: "enqueue", content: "/model" } as never);
      socket.emit({ type: "history_end" });
      socket.emit({ type: "live_start", count: 0 } as never);
      socket.emit({ type: "live_end" } as never);
    });

    expect(result.current.loading).toBe(false);
    // Only the assistant message should be in the list
    expect(result.current.storeAdapter.messages.some((m) => m.role === "assistant")).toBe(true);
    expect(result.current.inputQueue).toEqual([{ content: "/model", source: "user" }]);
  });

  test("session reset clears inputQueue", async () => {
    const { result, rerender } = renderHook(
      ({ project, session }: { project: string; session: string }) =>
        useClaude2Session(project, session),
      { initialProps: { project: "proj", session: "sess" } },
    );
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit({ type: "queue-operation", operation: "enqueue", content: "/model" } as never);
    });
    expect(result.current.inputQueue).toHaveLength(1);

    // Switch session triggers reset
    rerender({ project: "proj", session: "sess2" });
    await waitFor(() => expect(result.current.inputQueue).toHaveLength(0));
  });

  test("ws recv log still prints queue-operation", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    renderHook(() => useClaude2Session("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    const msg = { type: "queue-operation", operation: "enqueue", content: "/model" } as const;
    act(() => socket.emit(msg as never));

    expect(logSpy).toHaveBeenCalledWith("[claude2-adapter] ws recv", msg);
    logSpy.mockRestore();
  });

  test("XML content → assistant source, plain text → user source", async () => {
    const { result } = renderHook(() => useClaude2Session("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit({
        type: "queue-operation",
        operation: "enqueue",
        content: "<task-notification><task-id>a1</task-id></task-notification>",
      } as never);
      socket.emit({ type: "queue-operation", operation: "enqueue", content: "普通文本" } as never);
      socket.emit({ type: "queue-operation", operation: "enqueue" } as never);
    });

    expect(result.current.inputQueue[0]).toEqual({
      content: "<task-notification><task-id>a1</task-id></task-notification>",
      source: "assistant",
    });
    expect(result.current.inputQueue[1]).toEqual({ content: "普通文本", source: "user" });
    expect(result.current.inputQueue[2]).toEqual({ content: "", source: "user" });
  });
});

describe("useClaude2Session API error handling", () => {
  const apiErrorMsg = (overrides: Record<string, unknown> = {}) =>
    ({
      type: "assistant",
      message: {
        id: "err-1",
        role: "assistant",
        model: "<synthetic>",
        content: [{ type: "text", text: "500 Request failed" }],
      },
      userType: "external",
      isApiErrorMessage: true,
      error: "server_error",
      uuid: "err-uuid",
      parentUuid: "parent-uuid",
      ...overrides,
    }) as unknown as SessionStreamServerMessage;

  const extAssistant = (id: string, text: string, uuid: string): SessionStreamServerMessage =>
    ({
      type: "assistant",
      message: { id, role: "assistant", content: [{ type: "text", text }] },
      userType: "external",
      uuid,
    }) as unknown as SessionStreamServerMessage;

  const getMessages = (result: { current: ReturnType<typeof useClaude2Session> }) =>
    result.current.storeAdapter.messages;

  test("live: API error after parent attaches to parent bubble, no extra bubble", async () => {
    const { result } = renderHook(() => useClaude2Session("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit(extAssistant("a1", "hello", "parent-uuid"));
      socket.emit(apiErrorMsg({ parentUuid: "parent-uuid" }));
    });

    // assistant only; error NOT standalone
    expect(getMessages(result)).toHaveLength(1);
    const custom = getMessages(result)[0]?.metadata?.custom as Record<string, unknown>;
    const apiErrors = custom?.apiErrors as unknown[];
    expect(apiErrors).toHaveLength(1);
  });

  test("live: error before parent → pending, then resolved when parent arrives", async () => {
    const { result } = renderHook(() => useClaude2Session("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit(apiErrorMsg({ parentUuid: "parent-uuid", uuid: "e1" }));
      socket.emit(extAssistant("a1", "hello", "parent-uuid"));
    });

    // assistant only; error NOT standalone
    expect(getMessages(result)).toHaveLength(1);
    const custom = getMessages(result)[0]?.metadata?.custom as Record<string, unknown>;
    expect(custom?.apiErrors).toHaveLength(1);
  });

  test("history batch: parent + error in same batch → error attaches, no standalone", async () => {
    const { result } = renderHook(() => useClaude2Session("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit({ type: "history_start", count: 2 });
      socket.emit(extAssistant("a1", "hello", "parent-uuid"));
      socket.emit(apiErrorMsg({ parentUuid: "parent-uuid", uuid: "e1" }));
      socket.emit({ type: "history_end" });
    });

    // assistant + history divider = 2 messages; markers not rendered; error NOT standalone
    const msgs = getMessages(result);
    const assistantMsgs = msgs.filter((m) => m.role === "assistant");
    expect(assistantMsgs).toHaveLength(1);
    const custom = assistantMsgs[0]?.metadata?.custom as Record<string, unknown>;
    expect(custom?.apiErrors).toHaveLength(1);
  });

  test("output batch: API error does not create standalone bubble", async () => {
    const { result } = renderHook(() => useClaude2Session("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit({ type: "live_start", count: 2 } as never);
      socket.emit(extAssistant("a2", "world", "pu-2"));
      socket.emit(apiErrorMsg({ parentUuid: "pu-2", uuid: "e2" }));
      socket.emit({ type: "live_end" } as never);
    });

    const msgs = getMessages(result);
    const assistantMsgs = msgs.filter((m) => m.role === "assistant");
    expect(assistantMsgs).toHaveLength(1);
    const custom = assistantMsgs[0]?.metadata?.custom as Record<string, unknown>;
    expect(custom?.apiErrors).toHaveLength(1);
  });

  test("normal external assistant still rendered (no regression)", async () => {
    const { result } = renderHook(() => useClaude2Session("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit(extAssistant("a1", "normal reply", "uuid-a1"));
    });

    expect(getMessages(result)).toHaveLength(1);
    expect(getMessages(result)[0]?.role).toBe("assistant");
  });
});

describe("useClaude2Session batch marker rendering", () => {
  const getMessages = (result: { current: ReturnType<typeof useClaude2Session> }) =>
    result.current.storeAdapter.messages;

  test("empty history batch: no messages, no divider", async () => {
    const { result } = renderHook(() => useClaude2Session("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit({ type: "history_start", count: 0 } as never);
      socket.emit({ type: "history_end" } as never);
    });

    // neither marker renders; no divider (empty batch)
    expect(getMessages(result)).toHaveLength(0);
  });

  test("empty output batch: no divider", async () => {
    const { result } = renderHook(() => useClaude2Session("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit({ type: "live_start", count: 0 } as never);
      socket.emit({ type: "live_end" } as never);
    });

    // no divider
    expect(getMessages(result)).toHaveLength(0);
  });

  test("history batch with visible assistant → divider after batch", async () => {
    const { result } = renderHook(() => useClaude2Session("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit({ type: "history_start", count: 1 });
      socket.emit({
        type: "assistant",
        message: { id: "a1", role: "assistant", content: [{ type: "text", text: "hello" }] },
      } as never);
      socket.emit({ type: "history_end" });
    });

    const msgs = getMessages(result);
    // assistant + divider = 2
    expect(msgs).toHaveLength(2);
    const last = msgs[msgs.length - 1];
    expect((last?.metadata?.custom as Record<string, unknown>)?.systemMessageType).toBe(
      "batch-boundary",
    );
  });

  test("output batch with only queue-operation: no divider", async () => {
    const { result } = renderHook(() => useClaude2Session("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit({ type: "live_start", count: 1 } as never);
      socket.emit({ type: "queue-operation", operation: "enqueue", content: "/help" } as never);
      socket.emit({ type: "live_end" } as never);
    });

    // queue-operation is a side-effect, no visible bubble
    expect(getMessages(result)).toHaveLength(0);
    expect(result.current.inputQueue).toHaveLength(1);
  });
});

describe("useClaude2Session tool_result matching (external path)", () => {
  const getMessages = (result: { current: ReturnType<typeof useClaude2Session> }) =>
    result.current.storeAdapter.messages;

  const externalToolUseAssistant = (
    id: string,
    toolUses: Array<{ tool_use_id: string; name: string }>,
  ): SessionStreamServerMessage =>
    ({
      type: "assistant",
      userType: "external",
      message: {
        id,
        role: "assistant",
        content: toolUses.map((tu) => ({
          type: "tool_use",
          id: tu.tool_use_id,
          name: tu.name,
          input: {},
        })),
      },
    }) as unknown as SessionStreamServerMessage;

  const externalToolResultUser = (
    results: Array<{ tool_use_id: string; content: string; is_error?: boolean }>,
  ): SessionStreamServerMessage =>
    ({
      type: "user",
      userType: "external",
      message: {
        role: "user",
        content: results.map((r) => ({
          type: "tool_result",
          tool_use_id: r.tool_use_id,
          content: r.content,
          ...(r.is_error ? { is_error: true } : {}),
        })),
      },
    }) as unknown as SessionStreamServerMessage;

  test("single tool_use → tool_result: no user bubble, tool-call gets result", async () => {
    const { result } = renderHook(() => useClaude2Session("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit(externalToolUseAssistant("a1", [{ tool_use_id: "tu-1", name: "Read" }]));
      socket.emit(externalToolResultUser([{ tool_use_id: "tu-1", content: "file contents" }]));
    });

    const msgs = getMessages(result);
    // Tool-card system message only (no assistant text part, no user bubble)
    expect(msgs).toHaveLength(1);
    expect(msgs[0]?.role).toBe("system");
    const custom = msgs[0]?.metadata?.custom as Record<string, unknown>;
    expect(custom?.systemMessageType).toBe("tool-card");
    expect(custom?.toolCallId).toBe("tu-1");
    expect(custom?.result).toBe("file contents");
  });

  test("parallel tools: two tool_use in one assistant, two tool_result in one user", async () => {
    const { result } = renderHook(() => useClaude2Session("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit(
        externalToolUseAssistant("a1", [
          { tool_use_id: "tu-a", name: "ToolA" },
          { tool_use_id: "tu-b", name: "ToolB" },
        ]),
      );
      socket.emit(
        externalToolResultUser([
          { tool_use_id: "tu-a", content: "result A" },
          { tool_use_id: "tu-b", content: "result B" },
        ]),
      );
    });

    const msgs = getMessages(result);
    // Two tool-card messages (from assistant with 2 tool_use, no text)
    expect(msgs).toHaveLength(2);
    const toolCards = msgs.map((m) => m.metadata?.custom as Record<string, unknown>);
    expect(toolCards[0]?.systemMessageType).toBe("tool-card");
    expect(toolCards[0]?.toolCallId).toBe("tu-a");
    expect(toolCards[0]?.result).toBe("result A");
    expect(toolCards[1]?.systemMessageType).toBe("tool-card");
    expect(toolCards[1]?.toolCallId).toBe("tu-b");
    expect(toolCards[1]?.result).toBe("result B");
  });

  test("hybrid text+tool_result: user bubble for text, tool-call gets result", async () => {
    const { result } = renderHook(() => useClaude2Session("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit(externalToolUseAssistant("a1", [{ tool_use_id: "tu-1", name: "Read" }]));
      socket.emit({
        type: "user",
        userType: "external",
        message: {
          role: "user",
          content: [
            { type: "text", text: "Continue from where you left off." },
            { type: "tool_result", tool_use_id: "tu-1", content: "file contents" },
          ],
        },
      } as unknown as SessionStreamServerMessage);
    });

    const msgs = getMessages(result);
    // Tool-card system message + user text bubble = 2
    expect(msgs).toHaveLength(2);
    expect(msgs[0]?.role).toBe("system");
    expect(msgs[1]?.role).toBe("user");
    expect(msgs[1]?.content).toBe("Continue from where you left off.");

    const toolCustom = msgs[0]?.metadata?.custom as Record<string, unknown>;
    expect(toolCustom?.systemMessageType).toBe("tool-card");
    expect(toolCustom?.toolCallId).toBe("tu-1");
    expect(toolCustom?.result).toBe("file contents");
  });

  test("tool_result with is_error sets isError on tool-call", async () => {
    const { result } = renderHook(() => useClaude2Session("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit(externalToolUseAssistant("a1", [{ tool_use_id: "tu-ask", name: "Bash" }]));
      socket.emit(
        externalToolResultUser([{ tool_use_id: "tu-ask", content: "failed", is_error: true }]),
      );
    });

    const msgs = getMessages(result);
    expect(msgs).toHaveLength(1);
    const toolCustom = msgs[0]?.metadata?.custom as Record<string, unknown>;
    expect(toolCustom?.systemMessageType).toBe("tool-card");
    expect(toolCustom?.toolCallId).toBe("tu-ask");
    expect(toolCustom?.isError).toBe(true);
  });

  test("unhandled message type renders as visible fallback bubble", async () => {
    const { result } = renderHook(() => useClaude2Session("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit({
        type: "unknown_type",
        message: { some: "payload" },
        session_name: "proj/sess",
      } as unknown as SessionStreamServerMessage);
    });

    const msgs = getMessages(result);
    expect(msgs).toHaveLength(1);
    // Unknown types fall through to messageToThreadLike default → system role
    // with a summary line (type · subtype · uuid#), not raw JSON.
    expect(msgs[0]?.role).toBe("system");
    const content = msgs[0]?.content;
    expect(Array.isArray(content)).toBe(true);
    const text = (content as Array<{ type: string; text: string }>)[0]?.text ?? "";
    expect(text).toContain("unknown_type");
    // Debug info is available via the _raw metadata on the bubble.
    const custom = msgs[0]?.metadata?.custom as Record<string, unknown> | undefined;
    expect(custom?._raw).toBeDefined();
  });
});

describe("useClaude2Session resume-gated orphan marking", () => {
  const getMessages = (result: { current: ReturnType<typeof useClaude2Session> }) =>
    result.current.storeAdapter.messages;

  const externalToolUseAssistant = (
    id: string,
    toolUses: Array<{ tool_use_id: string; name: string }>,
  ): SessionStreamServerMessage =>
    ({
      type: "assistant",
      userType: "external",
      message: {
        id,
        role: "assistant",
        content: toolUses.map((tu) => ({
          type: "tool_use",
          id: tu.tool_use_id,
          name: tu.name,
          input: {},
        })),
      },
    }) as unknown as SessionStreamServerMessage;

  const externalToolResultUser = (
    results: Array<{ tool_use_id: string; content: string; is_error?: boolean }>,
  ): SessionStreamServerMessage =>
    ({
      type: "user",
      userType: "external",
      message: {
        role: "user",
        content: results.map((r) => ({
          type: "tool_result",
          tool_use_id: r.tool_use_id,
          content: r.content,
          is_error: r.is_error ?? false,
        })),
      },
    }) as unknown as SessionStreamServerMessage;

  test("resume history: pending tool_use marked orphaned at history_end", async () => {
    const { result } = renderHook(() => useClaude2Session("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit({ type: "session_init", resume: true } as SessionStreamServerMessage);
      socket.emit({ type: "history_start", count: 1 } as SessionStreamServerMessage);
      socket.emit(externalToolUseAssistant("a1", [{ tool_use_id: "tu-o", name: "Read" }]));
      socket.emit({ type: "history_end" } as SessionStreamServerMessage);
    });

    const msgs = getMessages(result);
    const toolCard = msgs.find(
      (m) =>
        m.role === "system" &&
        ((m.metadata?.custom as Record<string, unknown>)?.systemMessageType as string) ===
          "tool-card",
    );
    expect(toolCard).toBeDefined();
    const custom = toolCard!.metadata?.custom as Record<string, unknown>;
    expect(custom?.isOrphaned).toBe(true);
    expect(custom?.toolCallId).toBe("tu-o");
  });

  test("live (non-resume) history: pending tool_use NOT orphaned", async () => {
    const { result } = renderHook(() => useClaude2Session("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit({ type: "session_init", resume: false } as SessionStreamServerMessage);
      socket.emit({ type: "history_start", count: 1 } as SessionStreamServerMessage);
      socket.emit(externalToolUseAssistant("a1", [{ tool_use_id: "tu-p", name: "Read" }]));
      socket.emit({ type: "history_end" } as SessionStreamServerMessage);
    });

    const msgs2 = getMessages(result);
    const liveToolCard = msgs2.find(
      (m) =>
        m.role === "system" &&
        ((m.metadata?.custom as Record<string, unknown>)?.systemMessageType as string) ===
          "tool-card",
    );
    expect(liveToolCard).toBeDefined();
    const liveCustom = liveToolCard!.metadata?.custom as Record<string, unknown>;
    expect(liveCustom?.toolCallId).toBe("tu-p");
    expect(liveCustom?.isOrphaned).toBeUndefined();
  });

  test("resume: tool_use with already-matched result NOT orphaned", async () => {
    const { result } = renderHook(() => useClaude2Session("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit({ type: "session_init", resume: true } as SessionStreamServerMessage);
      socket.emit({ type: "history_start", count: 2 } as SessionStreamServerMessage);
      socket.emit(externalToolUseAssistant("a1", [{ tool_use_id: "tu-done", name: "Ask" }]));
      socket.emit(externalToolResultUser([{ tool_use_id: "tu-done", content: "answer" }]));
      socket.emit({ type: "history_end" } as SessionStreamServerMessage);
    });

    const msgs3 = getMessages(result);
    const doneToolCard = msgs3.find(
      (m) =>
        m.role === "system" &&
        ((m.metadata?.custom as Record<string, unknown>)?.systemMessageType as string) ===
          "tool-card",
    );
    expect(doneToolCard).toBeDefined();
    const doneCustom = doneToolCard!.metadata?.custom as Record<string, unknown>;
    expect(doneCustom?.result).toBe("answer");
    expect(doneCustom?.isOrphaned).toBeUndefined();
  });
});

// ── Attachment subtype integration tests ──────────────────────────────

describe("useClaude2Session attachment subtypes", () => {
  const attMsg = (subtype: string, fields?: Record<string, unknown>): SessionStreamServerMessage =>
    ({
      type: "attachment",
      userType: "external",
      uuid: "u-att",
      parentUuid: null,
      isSidechain: false,
      timestamp: "2025-06-16T00:00:00.000Z",
      sessionId: "s-1",
      attachment: { type: subtype, ...fields },
    }) as unknown as SessionStreamServerMessage;

  test("plan_mode sets permissionMode to plan and adds system bubble", async () => {
    const { result } = renderHook(() => useClaude2Session("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit(attMsg("plan_mode"));
    });

    expect(result.current.permissionMode).toBe("plan");
    const msgs = result.current.storeAdapter.messages;
    const bubble = msgs[msgs.length - 1];
    expect(bubble?.role).toBe("system");
    const custom = bubble?.metadata?.custom as Record<string, unknown> | undefined;
    expect(custom?.attachmentType).toBe("plan_mode");
  });

  test("auto_mode_exit sets permissionMode to default", async () => {
    const { result } = renderHook(() => useClaude2Session("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit(attMsg("auto_mode_exit"));
    });

    expect(result.current.permissionMode).toBe("default");
  });

  test("task_reminder updates tasks without adding bubble", async () => {
    const { result } = renderHook(() => useClaude2Session("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    const before = result.current.storeAdapter.messages.length;
    act(() => {
      socket.emit(
        attMsg("task_reminder", {
          content: [{ id: "t1", subject: "Fix bug", status: "running" }],
        }),
      );
    });

    expect(result.current.tasks).toHaveLength(1);
    expect(result.current.tasks[0].id).toBe("t1");
    expect(result.current.storeAdapter.messages.length).toBe(before);
  });

  test("skill_listing populates skills state", async () => {
    const { result } = renderHook(() => useClaude2Session("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit(
        attMsg("skill_listing", {
          content: "- skill-x: desc\n- skill-y: another",
        }),
      );
    });

    expect(result.current.skills).toEqual(["skill-x", "skill-y"]);
  });

  test("mcp_instructions_delta accumulates mcpServers", async () => {
    const { result } = renderHook(() => useClaude2Session("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit(attMsg("mcp_instructions_delta", { addedNames: ["a", "b"], addedBlocks: [] }));
    });

    expect(result.current.mcpServers).toEqual(["a", "b"]);
  });

  test("invoked_skills merges into skills", async () => {
    const { result } = renderHook(() => useClaude2Session("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit(
        attMsg("skill_listing", {
          content: "- base-skill: desc",
        }),
      );
      socket.emit(
        attMsg("invoked_skills", {
          skills: [{ name: "extra-skill", path: "/tmp" }],
        }),
      );
    });

    expect(result.current.skills).toContain("base-skill");
    expect(result.current.skills).toContain("extra-skill");
  });

  test("file adds system bubble with attachmentType", async () => {
    const { result } = renderHook(() => useClaude2Session("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit(attMsg("file", { filePath: "/src/index.ts" }));
    });

    const msgs = result.current.storeAdapter.messages;
    const bubble = msgs[msgs.length - 1];
    expect(bubble?.role).toBe("system");
    const custom = bubble?.metadata?.custom as Record<string, unknown> | undefined;
    expect(custom?.attachmentType).toBe("file");
  });

  test("session_init resets mcpServers and skills", async () => {
    const { result } = renderHook(() => useClaude2Session("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit(attMsg("mcp_instructions_delta", { addedNames: ["srv"], addedBlocks: [] }));
      socket.emit(attMsg("skill_listing", { content: "- old-skill: desc" }));
    });

    expect(result.current.mcpServers).toEqual(["srv"]);
    expect(result.current.skills).toEqual(["old-skill"]);

    act(() => {
      socket.emit({ type: "session_init", resume: false } as SessionStreamServerMessage);
    });

    expect(result.current.mcpServers).toEqual([]);
    expect(result.current.skills).toEqual([]);
  });
});
