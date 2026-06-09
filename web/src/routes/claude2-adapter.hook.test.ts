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
      socket.emit({ type: "connected", sessionId: "s1", sessionType: "agent", status: "running" });
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

  test("connected preserves local state when replay is empty", async () => {
    const { result } = renderHook(() => useClaude2Session("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit({
        type: "assistant",
        uuid: "uuid-old",
        message: { id: "old", role: "assistant", content: [{ type: "text", text: "stale" }] },
        session_id: "s1",
      } as never);
    });
    expect(result.current.storeAdapter.messages).toHaveLength(1);

    act(() => {
      socket.emit({ type: "connected", sessionId: "s1", sessionType: "agent", status: "running" });
      socket.emit({ type: "replay_start" } as never);
      socket.emit({ type: "replay_end" } as never);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.storeAdapter.messages).toHaveLength(1);
    expect(result.current.tasks).toEqual([]);
  });

  test("handles connected, replay, switch model, and control_request branches", async () => {
    const { result } = renderHook(() => useClaude2Session("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit({ type: "connected", sessionId: "s1", sessionType: "agent", status: "running" });
      socket.emit({ type: "replay_start" });
      socket.emit({
        type: "assistant",
        message: { id: "a1", role: "assistant", content: [] },
        session_id: "s1",
      });
      socket.emit({ type: "replay_end" });
      socket.emit({ type: "switch_model_result", model: "sonnet", success: true });
      socket.emit({
        type: "control_request",
        request_id: "r1",
        request: { subtype: "can_use_tool", tool_name: "Bash", display_name: "Bash", input: {} },
      });
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.modelSwitchVersion).toBe(1);
    expect(socket.sent.some((s) => s.includes('"type":"control_response"'))).toBe(true);
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
        reconnectSocket.emit({
          type: "connected",
          sessionId: "s1",
          sessionType: "agent",
          status: "running",
        });
        reconnectSocket.emit({ type: "replay_start" } as never);
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
        reconnectSocket.emit({ type: "replay_end" } as never);
      });

      expect(result.current.loading).toBe(false);
      expect(result.current.storeAdapter.messages).toHaveLength(2);
      expect(result.current.storeAdapter.messages[0]?.content).toEqual([
        { type: "text", text: "first" },
      ]);
      expect(result.current.storeAdapter.messages[1]?.content).toEqual([
        { type: "text", text: "second" },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  test("injects AskUserQuestion request id and allows compact lifecycle", async () => {
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
      socket.emit({
        type: "control_request",
        request_id: "req-ask",
        request: {
          subtype: "can_use_tool",
          tool_name: "AskUserQuestion",
          display_name: "AskUserQuestion",
          input: {},
        },
      } as never);
      socket.emit({ type: "result", subtype: "success", session_id: "s1", num_turns: 1 } as never);
      socket.emit({
        type: "system",
        subtype: "status",
        compact_result: "success",
        session_id: "s1",
      } as never);
    });

    expect(result.current.loading).toBe(false);
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

    expect(result.current.resolvedModel).toBe("claude-sonnet-4-20250514");
    expect(result.current.permissionMode).toBe("bypassPermissions");
    expect(result.current.currentModel).toBe("sonnet");

    await act(async () => {
      await result.current.storeAdapter.onNew({
        content: [{ type: "text", text: "hello" }],
      } as never);
    });
    expect(socket.sent.some((s) => s.includes('"text":"hello"'))).toBe(true);
    expect(result.current.storeAdapter.messages).toHaveLength(0);

    act(() => {
      result.current.bridge.respondToControlRequest("req-1", {
        __controlRequestId: "req-1",
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
    expect(result.current.storeAdapter.messages).toHaveLength(0);
  });

  test("compact success transitions back to live after result", async () => {
    const { result } = renderHook(() => useClaude2Session("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    const compactEvents: Array<{ phase: string; error?: string }> = [];
    act(() => socket.open());
    act(() => {
      result.current.bridge.onCompact = (event) => compactEvents.push(event);
    });

    act(() => {
      socket.emit({
        type: "system",
        subtype: "status",
        status: "compacting",
        session_id: "s1",
      } as never);
      socket.emit({
        type: "system",
        subtype: "status",
        compact_result: "success",
        session_id: "s1",
      } as never);
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

    expect(compactEvents).toEqual([{ phase: "start" }, { phase: "end" }]);
    expect(result.current.loading).toBe(false);
  });

  test("compact interruption reports interrupted and sends interrupt request", async () => {
    const { result } = renderHook(() => useClaude2Session("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    const compactEvents: Array<{ phase: string; error?: string }> = [];
    act(() => socket.open());
    act(() => {
      result.current.bridge.onCompact = (event) => compactEvents.push(event);
    });

    const randomUUID = vi.spyOn(crypto, "randomUUID").mockReturnValue("interrupt-1");

    act(() => {
      socket.emit({
        type: "system",
        subtype: "status",
        status: "compacting",
        session_id: "s1",
      } as never);
    });
    await act(async () => {
      await result.current.storeAdapter.onCancel();
    });
    act(() => {
      socket.emit({
        type: "system",
        subtype: "status",
        compact_result: "failed",
        compact_error: "Compact failed",
        session_id: "s1",
      } as never);
    });

    expect(socket.sent.some((s) => s.includes('"subtype":"interrupt"'))).toBe(true);
    expect(compactEvents).toEqual([{ phase: "start" }, { phase: "end", error: "interrupted" }]);

    randomUUID.mockRestore();
  });

  test("task updates and non-loading loadOlder path are covered", async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            messages: [],
            pagination: { nextCursor: null, hasOlder: false },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const { result } = renderHook(() => useClaude2Session("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    const socket = MockSocket.instances[0];
    act(() => socket.open());

    act(() => {
      socket.emit({ type: "connected", sessionId: "s1", sessionType: "agent", status: "running" });
      socket.emit({
        type: "system",
        subtype: "task_started",
        task_id: "task-1",
        prompt: "live task",
        agentType: "general-purpose",
      } as never);
      socket.emit({
        type: "system",
        subtype: "task_updated",
        task_id: "task-1",
        isBackgrounded: true,
      } as never);
      socket.emit({
        type: "system",
        subtype: "task_notification",
        task_id: "task-1",
        text: "done",
      } as never);
      socket.emit({
        type: "switch_model_result",
        model: "opus",
        success: false,
        error: "nope",
      } as never);
      socket.emit({
        type: "assistant",
        message: {
          id: "pending-ask",
          role: "assistant",
          content: [
            { type: "tool_use", id: "tu-1", name: "AskUserQuestion", input: { questions: [] } },
          ],
        },
        session_id: "s1",
      } as never);
      socket.emit({
        type: "user",
        message: { role: "user", content: [{ type: "text", text: "echo" }] },
      } as never);
      socket.emit({
        type: "user",
        message: { role: "user", content: [{ type: "text", text: "echo" }] },
      } as never);
      socket.emit({
        type: "control_request",
        request_id: "flush-1",
        request: { subtype: "can_use_tool", tool_name: "Bash", display_name: "Bash", input: {} },
      } as never);
    });

    await waitFor(() =>
      expect(result.current.tasks.some((task) => task.id === "task-1")).toBe(true),
    );
    expect(result.current.modelSwitchVersion).toBe(1);
    expect(socket.sent.some((s) => s.includes('"request_id":"flush-1"'))).toBe(true);
    expect(
      socket.sent.some(
        (s) => s.includes('"type":"control_response"') && s.includes('"behavior":"allow"'),
      ),
    ).toBe(true);

    await act(async () => {
      await result.current.loadOlder();
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.current.hasOlder).toBe(false);
    expect(result.current.storeAdapter.messages.some((msg) => msg.role === "user")).toBe(true);
  });

  test("empty text and interrupted compact branches stay inert", async () => {
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

    const compactEvents: Array<{ phase: string; error?: string }> = [];
    act(() => {
      result.current.bridge.onCompact = (event) => compactEvents.push(event);
      socket.emit({
        type: "system",
        subtype: "status",
        status: "compacting",
        session_id: "s1",
      } as never);
    });
    await act(async () => {
      await result.current.storeAdapter.onCancel();
    });
    act(() => {
      socket.emit({
        type: "system",
        subtype: "status",
        compact_result: "failed",
        compact_error: "Compact failed",
        session_id: "s1",
      } as never);
    });
    expect(compactEvents.at(-1)).toEqual({ phase: "end", error: "interrupted" });
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

  test("initial props, deferred sends, auto compact, and empty composer input are handled", async () => {
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

    const compactEvents: Array<{ phase: string; error?: string }> = [];
    act(() => {
      result.current.bridge.onCompact = (event) => compactEvents.push(event);
      socket.emit({ type: "system", subtype: "compact_boundary", session_id: "s1" } as never);
    });
    expect(compactEvents).toEqual([{ phase: "start" }]);
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

  test("loadOlder with a cursor fetches older history and updates pagination", async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            sessionId: "sess",
            messages: [
              {
                type: "user",
                message: { role: "user", content: [{ type: "text", text: "older" }] },
              },
            ],
            pagination: { nextCursor: "cursor-2", hasOlder: true },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const { result } = renderHook(() => useClaude2Session("proj", "sess"));
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));

    await act(async () => {
      await result.current.loadOlder("cursor-1");
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/projects/proj/agent-sessions/sess/messages?cursor=cursor-1",
      undefined,
    );
    expect(result.current.hasOlder).toBe(true);
    expect(result.current.storeAdapter.messages.some((msg) => msg.role === "user")).toBe(true);
  });
});
