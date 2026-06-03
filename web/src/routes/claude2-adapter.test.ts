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

// ── run() drain-loop integration tests ───────────────────────────────
//
// These tests use Bun's built-in WebSocket server to verify the run()
// generator correctly handles live-stream message patterns. Unlike the
// loadMessagesFromRaw tests (which test history loading), these test the
// real-time WebSocket → generator pipeline.

describe("chatAdapter.run() drain loop", () => {
  let server: ReturnType<typeof Bun.serve>;
  const originalLocation = globalThis.location;

  beforeAll(() => {
    // @ts-expect-error mock
    globalThis.location = { protocol: "http:", host: `localhost:9999` };
  });

  afterAll(() => {
    // @ts-expect-error restore
    globalThis.location = originalLocation;
  });

  test("drains rapid-fire messages arriving while generator is blocked", async () => {
    // Simulate the real AskUserQuestion flow:
    //
    // Per the ID model:
    // - tool_use.id = "toolu-ask-1" → card toolCallId (message persistence)
    // - request_id = "req-ask-1" → RPC transient (bridge communication)
    //
    // Sequence:
    // 1. Assistant msg with AskUserQuestion tool_use → buffered
    // 2. control_request arrives → injects request_id, flushes buffer → yield card
    // 3. User answers via bridge → control_response sent
    // 4. Server sends rapid-fire response (tool_result echo → assistant → result)
    //
    // The tool_result.tool_use_id = "toolu-ask-1" matches toolCallId → card
    // transitions to "completed" — server-driven, no optimistic update.
    let _clientWs: ReturnType<typeof server> extends { upgrade: any } ? any : any = null;
    let messageCount = 0;

    server = Bun.serve({
      port: 9999,
      fetch(req, srv) {
        if (srv.upgrade(req)) return;
        return new Response("not found", { status: 404 });
      },
      websocket: {
        open(ws) {
          _clientWs = ws;
          // Step 1: Assistant message with AskUserQuestion tool_use (gets buffered)
          ws.send(
            JSON.stringify({
              type: "assistant",
              message: {
                id: "msg-init",
                role: "assistant",
                content: [
                  { type: "text", text: "Let me ask you something." },
                  {
                    type: "tool_use",
                    id: "toolu-ask-1",
                    name: "AskUserQuestion",
                    input: {
                      questions: [
                        {
                          question: "What is your favorite color?",
                          header: "Color",
                          options: [
                            { label: "Red", description: "The color of passion" },
                            { label: "Blue", description: "The color of calm" },
                          ],
                          multiSelect: false,
                        },
                      ],
                    },
                  },
                ],
              },
            } satisfies SessionStreamServerMessage),
          );

          // Step 2: control_request — flushes buffer with real __controlRequestId
          ws.send(
            JSON.stringify({
              type: "control_request",
              request_id: "req-ask-1",
              request: {
                subtype: "can_use_tool",
                tool_name: "AskUserQuestion",
                display_name: "AskUserQuestion",
                input: {
                  questions: [
                    {
                      question: "What is your favorite color?",
                      header: "Color",
                      options: [
                        { label: "Red", description: "The color of passion" },
                        { label: "Blue", description: "The color of calm" },
                      ],
                      multiSelect: false,
                    },
                  ],
                },
              },
            } satisfies SessionStreamServerMessage),
          );
        },
        message(ws, rawMsg) {
          const msg = JSON.parse(rawMsg as string);
          if (msg.type === "control_response" || msg.type === "user") {
            messageCount++;
            // Step 4: Rapid-fire response from Claude after receiving the answer.
            // tool_use_id = "toolu-ask-1" matches the card's toolCallId.
            ws.send(
              JSON.stringify({
                type: "user",
                message: {
                  role: "user",
                  content: [{ type: "tool_result", tool_use_id: "toolu-ask-1", content: "Red" }],
                },
              } satisfies SessionStreamServerMessage),
            );

            ws.send(
              JSON.stringify({
                type: "assistant",
                message: {
                  id: "msg-resp",
                  role: "assistant",
                  content: [{ type: "text", text: "Got it! You chose Red." }],
                },
              } satisfies SessionStreamServerMessage),
            );

            ws.send(
              JSON.stringify({
                type: "result",
                subtype: "success",
              } satisfies SessionStreamServerMessage),
            );
          }
        },
      },
    });

    try {
      const { chatAdapter, bridge } = createClaude2Adapters("test", "test-session");

      const ac = new AbortController();
      const gen = chatAdapter.run({
        messages: [{ role: "user", content: [{ type: "text", text: "ask me something" }] }],
        abortSignal: ac.signal,
      } as Parameters<typeof chatAdapter.run>[0]);

      const collected: ChatModelRunResult[] = [];
      let didRespond = false;

      for await (const r of gen) {
        collected.push(r);

        // After the question card (single merged yield from buffer + control_request)
        // appears, simulate user submitting the answer. Fire only ONCE.
        if (!didRespond) {
          const allParts = collected.flatMap((c) =>
            Array.isArray(c.content) ? c.content : [],
          ) as Array<{ type: string; toolName?: string; args?: Record<string, unknown> }>;
          const card = allParts.find(
            (p) => p.type === "tool-call" && p.toolName === "AskUserQuestion",
          );
          if (card?.args?.__controlRequestId === "req-ask-1") {
            didRespond = true;
            bridge.respondToControlRequest("req-ask-1", {
              questions: [
                {
                  question: "What is your favorite color?",
                  header: "Color",
                  options: [
                    { label: "Red", description: "The color of passion" },
                    { label: "Blue", description: "The color of calm" },
                  ],
                  multiSelect: false,
                },
              ],
              __controlRequestId: "req-ask-1",
              answers: { "What is your favorite color?": "Red" },
            });
          }
        }
      }

      // Server should receive: 1 (initial user) + 1 (control_response) = 2
      expect(messageCount).toBe(2);

      // Should have yielded at least the buffered card + 3 response messages = 4+
      expect(collected.length).toBeGreaterThanOrEqual(4);

      const allTexts = collected
        .flatMap((r) => (Array.isArray(r.content) ? r.content : []))
        .filter((p: { type?: string }) => p.type === "text")
        .map((p: { type?: string; text?: string }) => (p as { text: string }).text);
      expect(allTexts).toContain("Let me ask you something.");
      expect(allTexts).toContain("Got it! You chose Red.");

      // Tool-call card should have toolCallId = tool_use.id (NOT request_id)
      const allParts = collected.flatMap((c) =>
        Array.isArray(c.content) ? c.content : [],
      ) as Array<{
        type: string;
        toolName?: string;
        args?: Record<string, unknown>;
        toolCallId?: string;
      }>;
      const toolCallCard = allParts.find(
        (p) => p.type === "tool-call" && p.toolName === "AskUserQuestion",
      );
      expect(toolCallCard).toBeDefined();
      expect(toolCallCard?.toolCallId).toBe("toolu-ask-1");

      // Last item should carry complete status
      expect(collected.at(-1)?.status?.type).toBe("complete");
    } finally {
      server.stop();
    }
  });
});
