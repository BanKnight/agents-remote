import { describe, expect, test } from "bun:test";
import { isTerminalPiEvent, toPiEventFrame } from "./pi-events";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";

// 最小消息桩——只用断言需要的字段（pi 的 AgentMessage 字段多且非本测试关注点）。
const message = (role: "assistant" | "user" = "assistant") =>
  ({
    id: "msg1",
    role,
    content: [{ type: "text", text: "hi" }],
  }) as unknown as Extract<AgentSessionEvent, { type: "message_update" }>["message"];

const usageStub = { input_tokens: 10, output_tokens: 5 };

const deltaEvent = (messageContent: string, hasPartial: boolean) => {
  const assistantMessageEvent: Record<string, unknown> = {
    type: "assistant",
    message: { id: "msg1", role: "assistant", content: [{ type: "text", text: messageContent }] },
  };
  if (hasPartial) {
    assistantMessageEvent.partial = {
      type: "assistant",
      message: { id: "msg1", role: "assistant", content: [{ type: "text", text: "partial" }] },
    };
  }
  return assistantMessageEvent;
};

describe("toPiEventFrame", () => {
  test("message_update 剥离 assistantMessageEvent.partial（保留 usage）", () => {
    const event = {
      type: "message_update",
      message: { ...message(), usage: usageStub },
      assistantMessageEvent: deltaEvent("delta text", true),
    } as unknown as AgentSessionEvent;
    const frame = toPiEventFrame(event);
    expect(frame.type).toBe("pi_event");
    expect(frame.event.type).toBe("message_update");
    const assistant = frame.event.assistantMessageEvent as Record<string, unknown>;
    expect("partial" in assistant).toBe(false);
    expect((assistant.message as Record<string, unknown>).content).toEqual([
      { type: "text", text: "delta text" },
    ]);
    expect(frame.event.usage).toEqual(usageStub);
  });

  test("message_update 无 partial 时原样透传（不剥不换）", () => {
    const assistantWithoutPartial = deltaEvent("delta text", false);
    const event = {
      type: "message_update",
      message: { ...message(), usage: usageStub },
      assistantMessageEvent: assistantWithoutPartial,
    } as unknown as AgentSessionEvent;
    const frame = toPiEventFrame(event);
    expect(frame.event.assistantMessageEvent).toEqual(assistantWithoutPartial);
    expect(frame.event.usage).toEqual(usageStub);
  });

  test("非 message_update 事件原样透传", () => {
    expect(toPiEventFrame({ type: "agent_start" } as AgentSessionEvent).event).toEqual({
      type: "agent_start",
    });
    const toolEvent = {
      type: "tool_execution_start",
      toolCallId: "call_1",
      toolName: "read",
      args: { file_path: "a.ts" },
    } as AgentSessionEvent;
    expect(toPiEventFrame(toolEvent).event).toEqual(toolEvent);
  });
});

describe("isTerminalPiEvent", () => {
  test("只有 agent_settled 是真正空闲终态", () => {
    expect(isTerminalPiEvent({ type: "agent_settled" } as AgentSessionEvent)).toBe(true);
    expect(
      isTerminalPiEvent({ type: "agent_end", messages: [], willRetry: true } as AgentSessionEvent),
    ).toBe(false);
    expect(
      isTerminalPiEvent({ type: "agent_end", messages: [], willRetry: false } as AgentSessionEvent),
    ).toBe(false);
    expect(
      isTerminalPiEvent({
        type: "turn_end",
        message: message(),
        toolResults: [],
      } as AgentSessionEvent),
    ).toBe(false);
    expect(isTerminalPiEvent({ type: "agent_start" } as AgentSessionEvent)).toBe(false);
  });
});
