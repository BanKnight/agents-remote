import { expect, test, describe } from "bun:test";
import type { SessionStreamServerMessage } from "@agents-remote/shared";
import { loadMessagesFromRaw } from "./claude2-adapter";

// Helper to build a minimal Claude2AssistantMessage
const assistant = (
  id: string,
  blocks: Array<
    | { type: "text"; text: string }
    | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  >,
): SessionStreamServerMessage =>
  ({
    type: "assistant",
    message: { id, role: "assistant", content: blocks },
  }) as unknown as SessionStreamServerMessage;

// Helper to build a Claude2UserMessage
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
    // 1 user + 1 assistant (both text blocks merged)
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

    // user + assistant (tool-call with result filled) + assistant (text reply)
    expect(result_msgs.length).toBe(3);

    // The first assistant message should have: text + tool-call (with result)
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
    // This is the critical bug scenario: Claude JSONL contains:
    //   assistant (with tool_use AskUserQuestion)
    //   user (text: "Continue from where you left off.")
    //   user (tool_result for AskUserQuestion)
    //
    // The user text between them flushes the assistant message (with
    // tool-call lacking a result). Then the tool_result arrives, can't
    // find its match in currentParts, and must pull the flushed
    // assistant back from messages[].
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
      // Intervening user text — flushes assistant without tool_result applied
      user([{ type: "text", text: "Continue from where you left off." }]),
      // Later: tool_result arrives for the AskUserQuestion tool_use
      user([{ type: "tool_result", tool_use_id: "tu-ask", content: "Red" }]),
      assistant("msg-2", [{ type: "text", text: "Thanks for the answer!" }]),
      result("success"),
    ];

    const result_msgs = loadMessagesFromRaw(msgs);

    // Order: user("ask..."), user("Continue..."),
    //        assistant(tool-call with result), assistant("Thanks...")
    // The assistant is at index 2 because "Continue" user stays at index 1.
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

  test("is_error tool_result is skipped (no false match)", () => {
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
      // is_error tool_result — Claude auto-generates this for auto-allowed
      // AskUserQuestion without real answers
      user([{ type: "tool_result", tool_use_id: "tu-ask", content: "", is_error: true }]),
      result("success"),
    ];

    const result_msgs = loadMessagesFromRaw(msgs);

    // The tool-call should NOT have the is_error result applied — it should
    // remain unanswered (no result field).
    const assistantContent = result_msgs[1].content as Array<{
      type: string;
      result?: string;
    }>;
    const toolCall = assistantContent[0];
    expect(toolCall.type).toBe("tool-call");
    expect(toolCall.result).toBeUndefined();
  });

  test("user message with only tool_result (no text) does not create a user bubble", () => {
    // When Claude echoes a tool result, it's a user message containing only
    // tool_result. This should NOT create a user bubble — it should only
    // apply the result to the matching tool-call.
    const msgs: SessionStreamServerMessage[] = [
      user([{ type: "text", text: "read file" }]),
      assistant("msg-1", [
        { type: "tool_use", id: "tu-read", name: "Read", input: { file_path: "/f" } },
      ]),
      // Pure tool_result user message (no text)
      user([{ type: "tool_result", tool_use_id: "tu-read", content: "hello world" }]),
      result("success"),
    ];
    const result_msgs = loadMessagesFromRaw(msgs);

    // Only 2 messages: 1 user + 1 assistant (with filled result)
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
      // User message with BOTH text and tool_result
      user([
        { type: "text", text: "Continue from where you left off." },
        { type: "tool_result", tool_use_id: "tu-read", content: "file content here" },
      ]),
      result("success"),
    ];
    const result_msgs = loadMessagesFromRaw(msgs);

    // 3 messages: user, assistant (with filled result), user ("Continue...")
    expect(result_msgs.length).toBe(3);
    expect(result_msgs[0].role).toBe("user");

    // Assistant has tool-call WITH result (applied before the text flushed it)
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
    // Only assistant, no user message for whitespace-only text
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
});
