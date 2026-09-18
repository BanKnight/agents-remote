// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, test, vi } from "bun:test";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { JSDOM } from "jsdom";
import type { AcpStreamServerMessage } from "@agents-remote/shared";
import { useAcpSession } from "./acp-adapter";

// bun:test 的 afterEach 不是裸全局，RTL auto-cleanup 不注册（同 claude/pi-adapter.hook.test）。
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

  emit(data: AcpStreamServerMessage) {
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

/** 打开首个 socket 并跑完开场握手（session_init → 空 history/live 批 → live_end）。 */
async function openSession() {
  const { result } = renderHook(() => useAcpSession("demo", "s1"));
  await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
  const socket = MockSocket.instances[0];
  socket.open();
  await waitFor(() => expect(result.current.connected).toBe(true));
  socket.emit({ type: "session_init", resume: false } as AcpStreamServerMessage);
  socket.emit({ type: "history_start", count: 0 } as AcpStreamServerMessage);
  socket.emit({ type: "history_end" } as AcpStreamServerMessage);
  socket.emit({ type: "live_start", count: 0 } as AcpStreamServerMessage);
  socket.emit({ type: "live_end" } as AcpStreamServerMessage);
  await waitFor(() => expect(result.current.loading).toBe(false));
  return { result, socket };
}

const acpEvent = (event: Record<string, unknown>) =>
  ({ type: "acp_event", event }) as unknown as AcpStreamServerMessage;

const configFrame = (configOptions: Record<string, unknown>[]) =>
  ({ type: "acp_config", configOptions }) as unknown as AcpStreamServerMessage;

const MODEL_OPTIONS = [
  {
    value: "anthropic/claude-opus-4-8",
    name: "Opus 4.8",
    description: "anthropic/claude-opus-4-8",
  },
  { value: "anthropic/claude-sonnet-4-8", name: "Sonnet 4.8" },
];

describe("useAcpSession WS 生命周期", () => {
  test("开场握手：open → live_end 置 loading=false；messages 为空", async () => {
    const { result } = await openSession();
    expect(result.current.storeAdapter.messages).toHaveLength(0);
    expect(result.current.streamError).toBeNull();
  });

  test("error 帧 → streamError + isRunning 归零", async () => {
    const { result, socket } = await openSession();
    await act(async () => {
      await result.current.storeAdapter.onNew({ content: [{ type: "text", text: "hi" }] } as never);
    });
    await waitFor(() => expect(result.current.isRunning).toBe(true));

    socket.emit({
      type: "error",
      code: "SESSION_RUNTIME_ERROR",
      message: "boom",
    } as unknown as AcpStreamServerMessage);
    await waitFor(() => expect(result.current.streamError).toBe("boom"));
    expect(result.current.isRunning).toBe(false);
  });
});

describe("useAcpSession 数据流", () => {
  test("onNew → 发送 user 帧（带 uuid）+ 本地 running；echo 注入 user 气泡", async () => {
    const { result, socket } = await openSession();

    await act(async () => {
      await result.current.storeAdapter.onNew({
        content: [{ type: "text", text: "hello acp" }],
      } as never);
    });
    const sent = socket.sent.find((s) => s.includes('"type":"user"'));
    expect(sent).toBeDefined();
    const parsed = JSON.parse(sent!);
    expect(parsed.text).toBe("hello acp");
    expect(typeof parsed.uuid).toBe("string");
    await waitFor(() => expect(result.current.isRunning).toBe(true));

    socket.emit({ type: "acp_user_echo", text: "hello acp", uuid: parsed.uuid } as never);
    await waitFor(() => expect(result.current.storeAdapter.messages).toHaveLength(1));
    expect(result.current.storeAdapter.messages[0]).toMatchObject({
      role: "user",
      id: `echo-${parsed.uuid}`,
    });
  });

  test("user chunk 确认复用 echo（不双条目）；agent chunk 累积；ended 置 running=false", async () => {
    const { result, socket } = await openSession();

    socket.emit({ type: "acp_user_echo", text: "q", uuid: "u1" } as never);
    socket.emit(
      acpEvent({ sessionUpdate: "user_message_chunk", content: { type: "text", text: "q" } }),
    );
    await waitFor(() => expect(result.current.storeAdapter.messages).toHaveLength(1));

    socket.emit(
      acpEvent({
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "Hel" },
        messageId: "m1",
      }),
    );
    socket.emit(
      acpEvent({
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "lo" },
        messageId: "m1",
      }),
    );
    await waitFor(() => expect(result.current.storeAdapter.messages).toHaveLength(2));
    expect(result.current.storeAdapter.messages[1].content).toEqual([
      { type: "text", text: "Hello" },
    ]);
    expect(result.current.isRunning).toBe(false); // 未发送即无 running 语义（ACP 无 turn 开始通知）

    socket.emit({ type: "ended", stopReason: "end_turn" } as never);
    // ended 只影响 isRunning 标量（assistant 条目已由 applyAcpFrame 定格 final）。
    await Bun.sleep(20);
    expect(result.current.isRunning).toBe(false);
  });

  test("tool_call 帧投影 system tool-card（运行中无 result）；update 完成 → result 出现", async () => {
    const { result, socket } = await openSession();

    socket.emit(
      acpEvent({
        sessionUpdate: "tool_call",
        toolCallId: "t1",
        title: "read file",
        status: "in_progress",
      }),
    );
    await waitFor(() => expect(result.current.storeAdapter.messages).toHaveLength(1));
    expect(result.current.storeAdapter.messages[0].role).toBe("system");
    const runningCustom = result.current.storeAdapter.messages[0].metadata?.custom as Record<
      string,
      unknown
    >;
    expect(runningCustom).toMatchObject({
      systemMessageType: "tool-card",
      toolCallId: "t1",
      toolName: "read file",
    });
    expect("result" in runningCustom).toBe(false);

    socket.emit(
      acpEvent({
        sessionUpdate: "tool_call_update",
        toolCallId: "t1",
        status: "completed",
        content: [{ type: "content", content: { type: "text", text: "file body" } }],
      }),
    );
    await waitFor(() => {
      const custom = result.current.storeAdapter.messages[0].metadata?.custom as Record<
        string,
        unknown
      >;
      return expect(custom.result).toBe("file body");
    });
  });

  test("onCancel → 发送 interrupt 帧", async () => {
    const { result, socket } = await openSession();

    await act(async () => {
      await result.current.onCancel();
    });
    expect(socket.sent.some((s) => s.includes('"type":"interrupt"'))).toBe(true);
  });
});

describe("useAcpSession 会话配置（configOptions）", () => {
  test("acp_config 帧 → 折叠为 configOptions 标量；setConfig 发送 set_config wire 形状", async () => {
    const { result, socket } = await openSession();

    socket.emit(
      configFrame([
        {
          id: "model",
          name: "Model",
          type: "select",
          currentValue: "anthropic/claude-opus-4-8",
          options: MODEL_OPTIONS,
        },
      ]),
    );
    await waitFor(() => expect(result.current.configOptions).toHaveLength(1));
    expect(result.current.configOptions[0]).toMatchObject({
      id: "model",
      currentValue: "anthropic/claude-opus-4-8",
    });

    await act(async () => {
      result.current.setConfig("model", "anthropic/claude-sonnet-4-8");
    });
    const sent = socket.sent.find((s) => s.includes('"type":"set_config"'));
    expect(sent).toBeDefined();
    expect(JSON.parse(sent!)).toEqual({
      type: "set_config",
      configId: "model",
      value: "anthropic/claude-sonnet-4-8",
    });
  });

  test("config_option_update 通知 → 折叠 latest-wins，且不进 raw 消息日志", async () => {
    const { result, socket } = await openSession();

    socket.emit(
      configFrame([
        {
          id: "model",
          name: "Model",
          type: "select",
          currentValue: "anthropic/claude-opus-4-8",
          options: MODEL_OPTIONS,
        },
      ]),
    );
    await waitFor(() => expect(result.current.configOptions).toHaveLength(1));

    socket.emit(
      acpEvent({
        sessionUpdate: "config_option_update",
        configOptions: [
          {
            id: "model",
            name: "Model",
            type: "select",
            currentValue: "anthropic/claude-sonnet-4-8",
            options: MODEL_OPTIONS,
          },
        ],
      }),
    );
    await waitFor(() =>
      expect(result.current.configOptions[0].currentValue).toBe("anthropic/claude-sonnet-4-8"),
    );
    // 消息列表长度不变（折叠进标量，不进 raw 日志）。
    expect(result.current.storeAdapter.messages).toHaveLength(0);
  });

  test("session_init 重置 configOptions（重连基线清空）", async () => {
    const { result, socket } = await openSession();
    socket.emit(
      configFrame([
        { id: "model", name: "Model", type: "select", currentValue: "x", options: MODEL_OPTIONS },
      ]),
    );
    await waitFor(() => expect(result.current.configOptions).toHaveLength(1));

    socket.emit({ type: "session_init", resume: false } as AcpStreamServerMessage);
    await waitFor(() => expect(result.current.configOptions).toHaveLength(0));
  });
});
