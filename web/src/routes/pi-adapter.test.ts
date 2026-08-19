import { describe, expect, test } from "bun:test";
import type { PiStreamServerMessage } from "@agents-remote/shared";
import { applyPiFrame, piFramesToThreadMessages, type PiRawItem } from "./pi-adapter";

// 帧构造 helper（与 shared PiStreamServerMessage 形状对齐）。
const piEvent = (event: Record<string, unknown>): PiStreamServerMessage =>
  ({ type: "pi_event", event }) as unknown as PiStreamServerMessage;
const echo = (text: string, uuid: string): PiStreamServerMessage =>
  ({ type: "pi_user_echo", text, uuid }) as unknown as PiStreamServerMessage;

const userMsg = (text: string) => ({
  role: "user" as const,
  content: text,
  timestamp: 1,
});
const assistantMsg = (parts: unknown[], stopReason = "stop") => ({
  role: "assistant" as const,
  content: parts,
  stopReason,
  timestamp: 2,
});
const toolCall = (id: string, name: string, args: Record<string, unknown> = {}) => ({
  type: "toolCall" as const,
  id,
  name,
  arguments: args,
});
const toolResultMsg = (toolCallId: string, text: string, isError = false) => ({
  role: "toolResult" as const,
  toolCallId,
  toolName: "read",
  content: [{ type: "text" as const, text }],
  isError,
  timestamp: 3,
});

const reduce = (frames: PiStreamServerMessage[]): PiRawItem[] =>
  frames.reduce((raw, f) => applyPiFrame(raw, f), [] as PiRawItem[]);

describe("applyPiFrame", () => {
  test("echo → pending echo 条目；message_start{user} 文本对齐 → 确认复用（不双条目）", () => {
    let raw = applyPiFrame([], echo("hi", "u1"));
    expect(raw).toHaveLength(1);
    expect(raw[0]).toMatchObject({ kind: "echo", confirmed: false });

    raw = applyPiFrame(raw, piEvent({ type: "message_start", message: userMsg("hi") }));
    // 确认后仍是 1 条（复用 echo 条目），不 append message 条目。
    expect(raw).toHaveLength(1);
    expect(raw[0]).toMatchObject({ kind: "echo", confirmed: true });

    // 渲染也只有 1 个 user 气泡。
    expect(piFramesToThreadMessages(raw)).toHaveLength(1);
  });

  test("message_start{user} 无匹配 echo → 新建 message 条目（server 侧发起）", () => {
    const raw = applyPiFrame([], piEvent({ type: "message_start", message: userMsg("hi") }));
    expect(raw).toHaveLength(1);
    expect(raw[0]).toMatchObject({ kind: "message", message: { role: "user" } });
  });

  test("assistant message_start → update → end：尾部替换累积（单条目终态）", () => {
    let raw = applyPiFrame(
      [],
      piEvent({
        type: "message_start",
        message: assistantMsg([{ type: "text", text: "" }], "pending"),
      }),
    );
    raw = applyPiFrame(
      raw,
      piEvent({
        type: "message_update",
        message: assistantMsg([{ type: "text", text: "Hel" }], "pending"),
      }),
    );
    raw = applyPiFrame(
      raw,
      piEvent({
        type: "message_update",
        message: assistantMsg([{ type: "text", text: "Hello" }], "pending"),
      }),
    );
    raw = applyPiFrame(
      raw,
      piEvent({
        type: "message_end",
        message: assistantMsg([{ type: "text", text: "Hello" }], "stop"),
      }),
    );
    expect(raw).toHaveLength(1);
    expect(raw[0]).toMatchObject({ kind: "message", final: true });
    expect(piFramesToThreadMessages(raw)[0].content).toEqual([{ type: "text", text: "Hello" }]);
  });

  test("tool_execution_* 等其他事件不进消息日志", () => {
    let raw = applyPiFrame([], piEvent({ type: "agent_start" }));
    raw = applyPiFrame(raw, piEvent({ type: "tool_execution_start", toolCallId: "t1" }));
    raw = applyPiFrame(raw, piEvent({ type: "agent_settled" }));
    expect(raw).toHaveLength(0);
  });
});

describe("piFramesToThreadMessages", () => {
  test("thinking → reasoning part；toolCall → tool-call part", () => {
    const raw = reduce([
      piEvent({
        type: "message_end",
        message: assistantMsg([
          { type: "thinking", thinking: "hmm" },
          toolCall("t1", "read", { path: "/x" }),
          { type: "text", text: "done" },
        ]),
      }),
    ]);
    const bubble = piFramesToThreadMessages(raw)[0];
    expect(bubble.role).toBe("assistant");
    expect(bubble.content).toEqual([
      { type: "reasoning", text: "hmm" },
      {
        type: "tool-call",
        toolCallId: "t1",
        toolName: "read",
        args: { path: "/x" },
        argsText: JSON.stringify({ path: "/x" }),
      },
      { type: "text", text: "done" },
    ]);
  });

  test("toolResult 按 toolCallId 回填 result/isError（不产气泡）", () => {
    const raw = reduce([
      piEvent({
        type: "message_end",
        message: assistantMsg([toolCall("t1", "read"), toolCall("t2", "grep")]),
      }),
      piEvent({ type: "message_end", message: toolResultMsg("t1", "file body") }),
      piEvent({ type: "message_end", message: toolResultMsg("t2", "no match", true) }),
    ]);
    const messages = piFramesToThreadMessages(raw);
    expect(messages).toHaveLength(1); // toolResult 不产新气泡
    const parts = messages[0].content as Record<string, unknown>[];
    expect(parts.find((p) => p.toolCallId === "t1")).toMatchObject({ result: "file body" });
    expect(parts.find((p) => p.toolCallId === "t2")).toMatchObject({
      result: "no match",
      isError: true,
    });
  });

  test("多轮完整流：echo/user/assistant/toolResult 序列 → 气泡顺序正确", () => {
    const raw = reduce([
      echo("first question", "u1"),
      piEvent({ type: "message_start", message: userMsg("first question") }),
      piEvent({
        type: "message_end",
        message: assistantMsg([{ type: "text", text: "answer 1" }]),
      }),
      echo("second", "u2"),
      piEvent({ type: "message_start", message: userMsg("second") }),
      piEvent({
        type: "message_end",
        message: assistantMsg([{ type: "text", text: "answer 2" }]),
      }),
    ]);
    const messages = piFramesToThreadMessages(raw);
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant"]);
    expect((messages[0] as { content: string }).content).toBe("first question");
  });
});
