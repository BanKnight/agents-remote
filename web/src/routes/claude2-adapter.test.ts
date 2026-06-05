import { expect, test, describe } from "bun:test";
import type { SessionStreamServerMessage } from "@agents-remote/shared";
import { loadMessagesFromRaw } from "./claude2-adapter";

// ── Helpers ────────────────────────────────────────────────────────────

const assistant = (
  id: string,
  blocks: Array<
    | { type: "text"; text: string }
    | { type: "thinking"; thinking: string; signature: string }
    | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  >,
): SessionStreamServerMessage =>
  ({
    type: "assistant",
    message: { id, role: "assistant", content: blocks },
  }) as unknown as SessionStreamServerMessage;

const user = (
  blocks: Array<
    | { type: "text"; text: string }
    | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }
  >,
): SessionStreamServerMessage =>
  ({
    type: "user",
    message: {
      role: "user",
      content: blocks.map((b) => {
        if (b.type === "text") return b;
        return {
          type: "tool_result",
          tool_use_id: b.tool_use_id,
          is_error: (b as { is_error?: boolean }).is_error,
          content: typeof b.content === "string" ? b.content : b.content,
        };
      }),
    },
  }) as unknown as SessionStreamServerMessage;

const result = (subtype: "success" | "interrupted" | "error"): SessionStreamServerMessage =>
  ({ type: "result", subtype }) as unknown as SessionStreamServerMessage;

const systemInit = (): SessionStreamServerMessage =>
  ({ type: "system", subtype: "init" }) as unknown as SessionStreamServerMessage;

// ── loadMessagesFromRaw tests ──────────────────────────────────────────

describe("loadMessagesFromRaw", () => {
  test("empty raw messages returns empty array", () => {
    expect(loadMessagesFromRaw([])).toEqual([]);
  });

  test("system messages are skipped", () => {
    const msgs: SessionStreamServerMessage[] = [systemInit()];
    expect(loadMessagesFromRaw(msgs)).toEqual([]);
  });

  test("simple user text + assistant text produces two messages", () => {
    const msgs: SessionStreamServerMessage[] = [
      user([{ type: "text", text: "Hello" }]),
      assistant("msg-1", [{ type: "text", text: "Hi there!" }]),
    ];

    const result_msgs = loadMessagesFromRaw(msgs);
    expect(result_msgs.length).toBe(2);
    expect(result_msgs[0]).toEqual({ role: "user", content: "Hello" });
    expect(result_msgs[1].role).toBe("assistant");
    expect(Array.isArray(result_msgs[1].content)).toBe(true);
    const content = result_msgs[1].content as Array<{ type: string; text: string }>;
    expect(content[0]).toEqual({ type: "text", text: "Hi there!" });
  });

  test("multiple assistant messages with same id are grouped into one bubble", () => {
    const msgs: SessionStreamServerMessage[] = [
      user([{ type: "text", text: "what is 2+2" }]),
      assistant("msg-1", [{ type: "text", text: "Let me think" }]),
      assistant("msg-1", [{ type: "text", text: "The answer is 4" }]),
      result("success"),
    ];
    const result_msgs = loadMessagesFromRaw(msgs);
    expect(result_msgs.length).toBe(2);
    const content = result_msgs[1].content as Array<{ type: string; text: string }>;
    expect(content.length).toBe(2);
    expect(content[0].text).toBe("Let me think");
    expect(content[1].text).toBe("The answer is 4");
  });

  test("different assistant message ids produce separate bubbles", () => {
    const msgs: SessionStreamServerMessage[] = [
      user([{ type: "text", text: "msg1" }]),
      assistant("msg-1", [{ type: "text", text: "reply 1" }]),
      result("success"),
      user([{ type: "text", text: "msg2" }]),
      assistant("msg-2", [{ type: "text", text: "reply 2" }]),
      result("success"),
    ];
    const result_msgs = loadMessagesFromRaw(msgs);
    expect(result_msgs.length).toBe(4);
  });

  test("tool_use followed by matching tool_result applies result to tool-call", () => {
    const msgs: SessionStreamServerMessage[] = [
      user([{ type: "text", text: "read the file" }]),
      assistant("msg-1", [
        { type: "text", text: "Let me read it." },
        { type: "tool_use", id: "tu-1", name: "Read", input: { file_path: "/x" } },
      ]),
      user([{ type: "tool_result", tool_use_id: "tu-1", content: "file contents" }]),
      assistant("msg-2", [{ type: "text", text: "The file says: hello" }]),
      result("success"),
    ];
    const result_msgs = loadMessagesFromRaw(msgs);

    expect(result_msgs.length).toBe(3);

    const assistantContent = result_msgs[1].content as Array<{
      type: string;
      text?: string;
      toolCallId?: string;
      result?: string;
    }>;
    expect(assistantContent.length).toBe(2);
    expect(assistantContent[0].type).toBe("text");
    expect(assistantContent[1].type).toBe("tool-call");
    expect(assistantContent[1].toolCallId).toBe("tu-1");
    expect(assistantContent[1].result).toBe("file contents");
  });

  test("tool_use + intervening user text + tool_result still matches (the 'Continue' bug)", () => {
    const msgs: SessionStreamServerMessage[] = [
      user([{ type: "text", text: "ask me a question" }]),
      assistant("msg-1", [
        {
          type: "tool_use",
          id: "tu-ask",
          name: "AskUserQuestion",
          input: { questions: [{ question: "What color?", options: ["Red", "Blue"] }] },
        },
      ]),
      user([{ type: "text", text: "Continue from where you left off." }]),
      user([{ type: "tool_result", tool_use_id: "tu-ask", content: "Red" }]),
      assistant("msg-2", [{ type: "text", text: "Thanks for the answer!" }]),
      result("success"),
    ];

    const result_msgs = loadMessagesFromRaw(msgs);

    expect(result_msgs.length).toBe(4);
    expect(result_msgs[0].role).toBe("user");
    expect(result_msgs[1].role).toBe("user");
    expect(result_msgs[2].role).toBe("assistant");
    expect(result_msgs[3].role).toBe("assistant");

    const firstAssistant = result_msgs[2].content as Array<{
      type: string;
      toolCallId?: string;
      result?: string;
    }>;
    expect(firstAssistant.length).toBe(1);
    const toolCall = firstAssistant[0];
    expect(toolCall.type).toBe("tool-call");
    expect(toolCall.toolCallId).toBe("tu-ask");
    expect(toolCall.result).toBe("Red");
  });

  test("is_error tool_result sets isError flag and shows error content", () => {
    const msgs: SessionStreamServerMessage[] = [
      user([{ type: "text", text: "hello" }]),
      assistant("msg-1", [
        {
          type: "tool_use",
          id: "tu-ask",
          name: "AskUserQuestion",
          input: { questions: [{ question: "X?", options: ["A", "B"] }] },
        },
      ]),
      user([
        {
          type: "tool_result",
          tool_use_id: "tu-ask",
          content: "Something went wrong",
          is_error: true,
        },
      ]),
      result("success"),
    ];

    const result_msgs = loadMessagesFromRaw(msgs);
    const assistantContent = result_msgs[1].content as Array<{
      type: string;
      result?: string;
      isError?: boolean;
    }>;
    const toolCall = assistantContent[0];
    expect(toolCall.type).toBe("tool-call");
    expect(toolCall.result).toBe("Something went wrong");
    expect(toolCall.isError).toBe(true);
  });

  test("user message with only tool_result (no text) does not create a user bubble", () => {
    const msgs: SessionStreamServerMessage[] = [
      user([{ type: "text", text: "read file" }]),
      assistant("msg-1", [
        { type: "tool_use", id: "tu-read", name: "Read", input: { file_path: "/f" } },
      ]),
      user([{ type: "tool_result", tool_use_id: "tu-read", content: "hello world" }]),
      result("success"),
    ];
    const result_msgs = loadMessagesFromRaw(msgs);

    expect(result_msgs.length).toBe(2);
    const assistantContent = result_msgs[1].content as Array<{
      type: string;
      toolCallId?: string;
      result?: string;
    }>;
    expect(assistantContent.length).toBe(1);
    expect(assistantContent[0].toolCallId).toBe("tu-read");
    expect(assistantContent[0].result).toBe("hello world");
  });

  test("user message with both text and tool_result creates user bubble and applies result", () => {
    const msgs: SessionStreamServerMessage[] = [
      user([{ type: "text", text: "read file" }]),
      assistant("msg-1", [
        { type: "tool_use", id: "tu-read", name: "Read", input: { file_path: "/f" } },
      ]),
      user([
        { type: "text", text: "Continue from where you left off." },
        { type: "tool_result", tool_use_id: "tu-read", content: "file content here" },
      ]),
      result("success"),
    ];
    const result_msgs = loadMessagesFromRaw(msgs);

    expect(result_msgs.length).toBe(3);
    expect(result_msgs[0].role).toBe("user");

    const assistantContent = result_msgs[1].content as Array<{
      type: string;
      toolCallId?: string;
      result?: string;
    }>;
    expect(assistantContent.length).toBe(1);
    expect(assistantContent[0].toolCallId).toBe("tu-read");
    expect(assistantContent[0].result).toBe("file content here");

    expect(result_msgs[2].role).toBe("user");
  });

  test("result message flushes and resets assistant grouping", () => {
    const msgs: SessionStreamServerMessage[] = [
      user([{ type: "text", text: "hello" }]),
      assistant("msg-1", [{ type: "text", text: "hi" }]),
      result("success"),
      user([{ type: "text", text: "bye" }]),
      assistant("msg-2", [{ type: "text", text: "goodbye" }]),
      result("success"),
    ];
    const result_msgs = loadMessagesFromRaw(msgs);
    expect(result_msgs.length).toBe(4);
  });

  test("interrupted result does not break subsequent messages", () => {
    const msgs: SessionStreamServerMessage[] = [
      user([{ type: "text", text: "hello" }]),
      assistant("msg-1", [{ type: "text", text: "hi" }]),
      result("interrupted"),
    ];
    const result_msgs = loadMessagesFromRaw(msgs);
    expect(result_msgs.length).toBe(2);
  });

  test("empty user text (whitespace only) does not create a user message", () => {
    const msgs: SessionStreamServerMessage[] = [
      user([{ type: "text", text: "   " }]),
      assistant("msg-1", [{ type: "text", text: "empty" }]),
    ];
    const result_msgs = loadMessagesFromRaw(msgs);
    expect(result_msgs.length).toBe(1);
    expect(result_msgs[0].role).toBe("assistant");
  });

  test("multiple tool_use blocks in one assistant message all get results matched", () => {
    const msgs: SessionStreamServerMessage[] = [
      user([{ type: "text", text: "use multiple tools" }]),
      assistant("msg-1", [
        { type: "tool_use", id: "tu-a", name: "ToolA", input: {} },
        { type: "tool_use", id: "tu-b", name: "ToolB", input: {} },
      ]),
      user([
        { type: "tool_result", tool_use_id: "tu-a", content: "result A" },
        { type: "tool_result", tool_use_id: "tu-b", content: "result B" },
      ]),
      result("success"),
    ];
    const result_msgs = loadMessagesFromRaw(msgs);
    const assistantContent = result_msgs[1].content as Array<{
      type: string;
      toolCallId?: string;
      result?: string;
    }>;
    expect(assistantContent.length).toBe(2);
    expect(assistantContent[0].result).toBe("result A");
    expect(assistantContent[1].result).toBe("result B");
  });

  test("tool_result with string content is handled", () => {
    const msgs: SessionStreamServerMessage[] = [
      user([{ type: "text", text: "hi" }]),
      assistant("msg-1", [{ type: "tool_use", id: "tu-1", name: "Read", input: {} }]),
      user([{ type: "tool_result", tool_use_id: "tu-1", content: "plain string content" }]),
      result("success"),
    ];
    const result_msgs = loadMessagesFromRaw(msgs);
    const assistantContent = result_msgs[1].content as Array<{
      type: string;
      result?: string;
    }>;
    expect(assistantContent[0].result).toBe("plain string content");
  });

  test("thinking blocks are mapped to reasoning parts", () => {
    const msgs: SessionStreamServerMessage[] = [
      user([{ type: "text", text: "think about this" }]),
      assistant("msg-1", [
        { type: "thinking", thinking: "Let me reason about this carefully.", signature: "sig-abc" },
        { type: "text", text: "Here is my conclusion." },
      ]),
      result("success"),
    ];
    const result_msgs = loadMessagesFromRaw(msgs);
    const assistantContent = result_msgs[1].content as Array<{
      type: string;
      text?: string;
    }>;
    expect(assistantContent.length).toBe(2);
    expect(assistantContent[0]).toEqual({
      type: "reasoning",
      text: "Let me reason about this carefully.",
    });
    expect(assistantContent[1]).toEqual({ type: "text", text: "Here is my conclusion." });
  });
});
