import { afterAll, beforeAll, expect, test, describe } from "bun:test";
import type { SessionStreamServerMessage } from "@agents-remote/shared";
import type { ChatModelRunResult } from "@assistant-ui/react";
import { loadMessagesFromRaw, createClaude2Adapters } from "./claude2-adapter";

// ── Helpers ────────────────────────────────────────────────────────────

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
      user([{ type: "tool_result", tool_use_id: "tu-ask", content: "", is_error: true }]),
      result("success"),
    ];

    const result_msgs = loadMessagesFromRaw(msgs);
    const assistantContent = result_msgs[1].content as Array<{
      type: string;
      result?: string;
    }>;
    const toolCall = assistantContent[0];
    expect(toolCall.type).toBe("tool-call");
    expect(toolCall.result).toBeUndefined();
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
});

// ── run() drain-loop integration test ─────────────────────────────────
//
// This test verifies the fix for the race condition where Claude emits
// multiple messages in rapid succession (tool_result echo → assistant
// text → result) after a control_response. The old run() generator
// processed only one item per promise resolution; intervening messages
// that arrived while resolveNext was null were skipped by the yieldIndex
// advance loop and never yielded.
//
// We use Bun's built-in WebSocket server to simulate Claude and step
// through the generator collecting every yielded result.

describe("chatAdapter.run() drain loop", () => {
  let server: ReturnType<typeof Bun.serve>;
  const originalLocation = globalThis.location;

  beforeAll(() => {
    // Mock globalThis.location for claude2StreamUrl()
    // @ts-expect-error mock
    globalThis.location = { protocol: "http:", host: `localhost:9999` };
  });

  afterAll(() => {
    // @ts-expect-error restore
    globalThis.location = originalLocation;
  });

  test("drains all rapid-fire messages without loss", async () => {
    // We use Bun's WebSocket server to simulate Claude's response
    // pattern: tool_result echo → assistant text → result, sent in
    // rapid succession inside the ws open handler.
    server = Bun.serve({
      port: 9999,
      fetch(req, srv) {
        if (srv.upgrade(req)) return;
        return new Response("not found", { status: 404 });
      },
      websocket: {
        open(ws) {
          // Simulate what Claude emits after receiving a control_response:
          //   1. User message with tool_result (echo of the answer)
          //   2. Assistant message with text response
          //   3. Result (turn completion)
          // These arrive fast enough that the generator is still processing
          // msg 1 when msgs 2 & 3 land — the old code would lose msg 2.
          ws.send(
            JSON.stringify({
              type: "user",
              message: {
                role: "user",
                content: [{ type: "tool_result", tool_use_id: "tu-1", content: "Red" }],
              },
            } satisfies SessionStreamServerMessage),
          );

          ws.send(
            JSON.stringify({
              type: "assistant",
              message: {
                id: "msg-resp",
                role: "assistant",
                content: [{ type: "text", text: "Got your answer — thanks!" }],
              },
            } satisfies SessionStreamServerMessage),
          );

          ws.send(
            JSON.stringify({
              type: "result",
              subtype: "success",
            } satisfies SessionStreamServerMessage),
          );
        },
        message(_ws, _msg) {
          // ignore user messages sent by the adapter
        },
      },
    });

    try {
      const { chatAdapter } = createClaude2Adapters("test", "test-session");

      const collected: ChatModelRunResult[] = [];
      const ac = new AbortController();

      const gen = chatAdapter.run({
        messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
        abortSignal: ac.signal,
      } as Parameters<typeof chatAdapter.run>[0]);

      for await (const r of gen) {
        collected.push(r);
      }

      // We expect at least 3 yields:
      //   tool_result echo, assistant text, result status
      expect(collected.length).toBeGreaterThanOrEqual(3);

      // All assistant text content should appear across the yielded results
      const allTexts = collected
        .flatMap((r) => (Array.isArray(r.content) ? r.content : []))
        .filter((p: { type?: string }) => p.type === "text")
        .map((p: { type?: string; text?: string }) => (p as { text: string }).text);
      expect(allTexts).toContain("Got your answer — thanks!");

      // The final yield should carry the complete status
      const lastResult = collected.at(-1);
      expect(lastResult?.status?.type).toBe("complete");
    } finally {
      server.stop();
    }
  });
});
