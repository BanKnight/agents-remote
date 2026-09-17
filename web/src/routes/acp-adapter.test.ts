import { describe, expect, test } from "bun:test";
import type { AcpStreamServerMessage } from "@agents-remote/shared";
import { applyAcpFrame, acpFramesToThreadMessages, type AcpRawItem } from "./acp-adapter";

// 帧构造 helper（与 shared AcpStreamServerMessage 形状对齐）。
const acpEvent = (event: Record<string, unknown>): AcpStreamServerMessage =>
  ({ type: "acp_event", event }) as unknown as AcpStreamServerMessage;
const echo = (text: string, uuid: string): AcpStreamServerMessage =>
  ({ type: "acp_user_echo", text, uuid }) as unknown as AcpStreamServerMessage;
const ended = (): AcpStreamServerMessage =>
  ({ type: "ended", stopReason: "end_turn" }) as unknown as AcpStreamServerMessage;

const chunk = (
  variant: "user_message_chunk" | "agent_message_chunk" | "agent_thought_chunk",
  text: string,
  messageId?: string,
) => acpEvent({ sessionUpdate: variant, content: { type: "text", text }, messageId });

const toolCallEvent = (toolCallId: string, extra: Record<string, unknown> = {}) =>
  acpEvent({ sessionUpdate: "tool_call", toolCallId, title: `tool ${toolCallId}`, ...extra });

const toolCallUpdateEvent = (toolCallId: string, extra: Record<string, unknown> = {}) =>
  acpEvent({ sessionUpdate: "tool_call_update", toolCallId, ...extra });

const reduce = (frames: AcpStreamServerMessage[]): AcpRawItem[] =>
  frames.reduce((raw, f) => applyAcpFrame(raw, f), [] as AcpRawItem[]);

describe("applyAcpFrame", () => {
  test("echo → pending echo 条目；user_message_chunk 文本对齐 → 确认复用（不双条目）", () => {
    let raw = applyAcpFrame([], echo("hi", "u1"));
    expect(raw).toHaveLength(1);
    expect(raw[0]).toMatchObject({ kind: "echo", confirmed: false });

    raw = applyAcpFrame(raw, chunk("user_message_chunk", "hi"));
    expect(raw).toHaveLength(1);
    expect(raw[0]).toMatchObject({ kind: "echo", confirmed: true });
    expect(acpFramesToThreadMessages(raw)).toHaveLength(1);
  });

  test("user_message_chunk 无匹配 echo → 新建 user message（loadSession 回放历史场景）", () => {
    const raw = applyAcpFrame([], chunk("user_message_chunk", "historic question", "m1"));
    expect(raw).toHaveLength(1);
    expect(raw[0]).toMatchObject({
      kind: "message",
      role: "user",
      messageId: "m1",
      final: true,
    });
  });

  test("agent chunk 同 messageId 累积同一 assistant 条目（text/thinking 分区就近合并）", () => {
    let raw = applyAcpFrame([], chunk("agent_message_chunk", "Hel", "mm1"));
    raw = applyAcpFrame(raw, chunk("agent_message_chunk", "lo", "mm1"));
    raw = applyAcpFrame(raw, chunk("agent_thought_chunk", "hmm", "mm1"));
    expect(raw).toHaveLength(1);
    const item = raw[0] as Extract<AcpRawItem, { kind: "message" }>;
    expect(item.sections).toEqual([
      { type: "text", text: "Hello" },
      { type: "thinking", text: "hmm" },
    ]);
  });

  test("ended 定格未终态 assistant 条目：下个 turn 无 messageId chunk 不就近错并", () => {
    let raw = reduce([
      chunk("agent_message_chunk", "turn one answer", "a1"),
      ended(),
      chunk("agent_message_chunk", "turn two answer"),
    ]);
    const assistantItems = raw.filter(
      (i): i is Extract<AcpRawItem, { kind: "message" }> => i.kind === "message",
    );
    expect(assistantItems).toHaveLength(2);
    expect(assistantItems[0].final).toBe(true);
    expect(assistantItems[1].sections[0].text).toBe("turn two answer");
  });

  test("tool_call 新建条目；tool_call_update 按 toolCallId upsert（status/result 增量）", () => {
    let raw = applyAcpFrame([], toolCallEvent("t1", { status: "pending" }));
    expect(raw).toHaveLength(1);

    raw = applyAcpFrame(
      raw,
      toolCallUpdateEvent("t1", {
        status: "completed",
        content: [{ type: "content", content: { type: "text", text: "file body" } }],
      }),
    );
    expect(raw).toHaveLength(1);
    expect((raw[0] as { call: { status: string; resultText: string } }).call).toMatchObject({
      status: "completed",
      resultText: "file body",
    });
  });

  test("tool_call_update 未见过 create（防御）→ 追加新条目；failed → isError 投影", () => {
    const raw = reduce([
      toolCallUpdateEvent("t9", {
        status: "failed",
        title: "write file",
        content: [{ type: "content", content: { type: "text", text: "boom" } }],
      }),
    ]);
    expect(raw).toHaveLength(1);
    const messages = acpFramesToThreadMessages(raw);
    expect(toolCardCustom(messages[0])).toMatchObject({
      toolCallId: "t9",
      isError: true,
      result: "boom",
    });
  });

  test("ended 把未终态 tool_call 标 interrupted（对齐 claude applyToolLifecycle）；upsert 不清除", () => {
    let raw = reduce([toolCallEvent("t1", { status: "in_progress" }), ended()]);
    expect((raw[0] as { call: { interrupted: boolean } }).call.interrupted).toBe(true);
    // 后续 update 不清除 interrupted 标记（终态语义由 status 承接）。
    raw = applyAcpFrame(raw, toolCallUpdateEvent("t1", { status: "in_progress" }));
    expect((raw[0] as { call: { interrupted: boolean } }).call.interrupted).toBe(true);

    // 已终态（completed）的 tool_call 不被 ended 标记。
    const doneRaw = reduce([
      toolCallUpdateEvent("t2", {
        status: "completed",
        content: [{ type: "content", content: { type: "text", text: "ok" } }],
      }),
      ended(),
    ]);
    expect((doneRaw[0] as { call: { interrupted: boolean } }).call.interrupted).toBe(false);
  });

  test("plan/usage_update 等不进消息日志；ended 空转幂等", () => {
    let raw = applyAcpFrame([], acpEvent({ sessionUpdate: "plan", entries: [] }));
    raw = applyAcpFrame(raw, acpEvent({ sessionUpdate: "usage_update", used: 1, size: 2 }));
    raw = applyAcpFrame(raw, acpEvent({ sessionUpdate: "current_mode_update" }));
    raw = applyAcpFrame(raw, ended());
    expect(raw).toHaveLength(0);
  });
});

/** tool-card 投影的 metadata.custom（role:"system" 消息，SystemChatBubble 消费键集）。 */
const toolCardCustom = (message: { metadata?: { custom?: unknown } }): Record<string, unknown> =>
  (message.metadata?.custom ?? {}) as Record<string, unknown>;

describe("acpFramesToThreadMessages", () => {
  test("多轮流：echo → 确认 / assistant text+thinking / tool_call 卡片顺序正确", () => {
    const raw = reduce([
      echo("question", "u1"),
      chunk("user_message_chunk", "question"),
      chunk("agent_thought_chunk", "thinking...", "a1"),
      chunk("agent_message_chunk", "answer", "a1"),
      ended(),
      toolCallEvent("t1", { status: "in_progress" }),
      toolCallUpdateEvent("t1", {
        status: "completed",
        content: [{ type: "content", content: { type: "text", text: "ok" } }],
      }),
      ended(),
    ]);
    const messages = acpFramesToThreadMessages(raw);
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant", "system"]);
    const answerParts = messages[1].content as Record<string, unknown>[];
    expect(answerParts).toEqual([
      { type: "reasoning", text: "thinking..." },
      { type: "text", text: "answer" },
    ]);
    // tool 卡片走 system tool-card 管道（与 claude 同款边框 wrapper），custom 键集对齐。
    expect(toolCardCustom(messages[2])).toMatchObject({
      systemMessageType: "tool-card",
      toolName: "tool t1",
      toolCallId: "t1",
      result: "ok",
      toolIndent: false,
    });
    expect(toolCardCustom(messages[2]).isError).toBeUndefined();
  });

  test("ended 后未终态 tool_call 投影 isInterrupted（卡片不再永久 spinner）", () => {
    const raw = reduce([toolCallEvent("t1", { status: "in_progress" }), ended()]);
    const messages = acpFramesToThreadMessages(raw);
    expect(toolCardCustom(messages[0])).toMatchObject({
      systemMessageType: "tool-card",
      isInterrupted: true,
    });
    expect(toolCardCustom(messages[0]).result).toBeUndefined();
  });

  test("diff content 折叠 path 头 + 新文本", () => {
    const raw = reduce([
      toolCallUpdateEvent("t2", {
        status: "completed",
        content: [{ type: "diff", path: "src/a.ts", oldText: null, newText: "const a = 1;" }],
      }),
    ]);
    expect(toolCardCustom(acpFramesToThreadMessages(raw)[0]).result).toBe(
      "--- src/a.ts\nconst a = 1;",
    );
  });
});
