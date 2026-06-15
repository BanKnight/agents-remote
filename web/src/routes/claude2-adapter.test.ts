import { describe, expect, test } from "bun:test";
import type { SessionStreamServerMessage } from "@agents-remote/shared";
import type { ThreadMessageLike } from "@assistant-ui/react";
import {
  applyTaskSystemMessage,
  buildAllowAllControlResponse,
  injectAskUserQuestionRequestId,
  isSyntheticAssistantMessage,
  applySwitchModelResult,
  computeRunningCount,
  convertExternalToThreadLike,
  extractTaskOps,
  hasToolUseNamed,
  messageToThreadLike,
  deriveQueueSource,
  applyQueueOperation,
  isExternalApiErrorMessage,
  extractApiErrorText,
  getMsgParentUuid,
  getMsgUuid,
  getMsgToolResultIds,
  threadMessageHasToolCallId,
  enrichBubbleMetadata,
  attachErrorToBubble,
  attachApiErrorToMessages,
  drainPendingErrors,
  makeBoundaryDivider,
} from "./claude2-adapter";
import type { ApiErrorAttachment, QueueEntry } from "./claude2-adapter";

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

const result = (
  subtype: "success" | "interrupted" | "error",
  durationMs?: number,
): SessionStreamServerMessage =>
  ({
    type: "result",
    subtype,
    ...(durationMs !== undefined ? { duration_ms: durationMs } : {}),
  }) as unknown as SessionStreamServerMessage;

const thinkingTokens = (estimatedTokens: number): SessionStreamServerMessage =>
  ({
    type: "system",
    subtype: "thinking_tokens",
    estimated_tokens: estimatedTokens,
  }) as unknown as SessionStreamServerMessage;

// KEPT: used in commented-out loadMessagesFromRaw tests
/*
const systemInit = (): SessionStreamServerMessage =>
  ({ type: "system", subtype: "init" }) as unknown as SessionStreamServerMessage;
*/

const taskStarted = (
  task_id: string,
  fields: Partial<{ agentType: string; workflowName: string; prompt: string }> = {},
): SessionStreamServerMessage =>
  ({
    type: "system",
    subtype: "task_started",
    task_id,
    ...fields,
  }) as unknown as SessionStreamServerMessage;

const taskUpdated = (
  task_id: string,
  fields: Partial<{ isBackgrounded: boolean; error: string }> = {},
): SessionStreamServerMessage =>
  ({
    type: "system",
    subtype: "task_updated",
    task_id,
    ...fields,
  }) as unknown as SessionStreamServerMessage;

const taskNotification = (
  task_id: string,
  fields: Partial<{ text: string }> = {},
): SessionStreamServerMessage =>
  ({
    type: "system",
    subtype: "task_notification",
    task_id,
    ...fields,
  }) as unknown as SessionStreamServerMessage;

const assistantWithModel = (
  id: string,
  model: string,
  blocks: Array<
    | { type: "text"; text: string }
    | { type: "thinking"; thinking: string; signature: string }
    | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  >,
): SessionStreamServerMessage =>
  ({
    type: "assistant",
    message: { id, model, role: "assistant", content: blocks },
  }) as unknown as SessionStreamServerMessage;

const controlRequest = (
  request_id: string,
  tool_name: string,
  input: Record<string, unknown> = {},
): SessionStreamServerMessage =>
  ({
    type: "control_request",
    request_id,
    request: {
      subtype: "can_use_tool",
      tool_name,
      display_name: tool_name,
      input,
    },
  }) as unknown as SessionStreamServerMessage;

describe("helper functions", () => {
  test("control response helper allows non AskUserQuestion tools", () => {
    expect(buildAllowAllControlResponse("req-1")).toEqual({
      type: "control_response",
      response: {
        subtype: "success",
        request_id: "req-1",
        response: { behavior: "allow", updatedInput: {} },
      },
    });
  });

  test("AskUserQuestion request id injection only touches matching tool_use", () => {
    const assistantMsg = {
      type: "assistant",
      message: {
        id: "msg-ask",
        role: "assistant" as const,
        content: [
          { type: "text", text: "help" },
          {
            type: "tool_use",
            id: "tu-ask",
            name: "AskUserQuestion",
            input: { questions: [{ question: "Which?" }] },
          },
          {
            type: "tool_use",
            id: "tu-other",
            name: "Read",
            input: { file_path: "/tmp/x" },
          },
        ],
      },
    } as unknown as SessionStreamServerMessage;

    const updated = injectAskUserQuestionRequestId(assistantMsg as never, "req-42") as {
      message: {
        content: Array<{
          type: string;
          name?: string;
          input: Record<string, unknown>;
        }>;
      };
    };

    expect(updated.message.content[1].input.__controlRequestId).toBe("req-42");
    expect(updated.message.content[2].input.__controlRequestId).toBeUndefined();
  });

  test("synthetic assistant detection is based on model sentinel", () => {
    expect(
      isSyntheticAssistantMessage(
        assistantWithModel("msg-synth", "<synthetic>", [{ type: "text", text: "noop" }]),
      ),
    ).toBe(true);
    expect(
      isSyntheticAssistantMessage(
        assistantWithModel("msg-real", "claude-sonnet-4-6[1m]", [{ type: "text", text: "ok" }]),
      ),
    ).toBe(false);
  });

  test("switch model result helper increments version and clears current model on failure", () => {
    expect(
      applySwitchModelResult({ currentModel: "sonnet", modelSwitchVersion: 2 }, { success: true }),
    ).toEqual({
      currentModel: "sonnet",
      modelSwitchVersion: 3,
    });
    expect(
      applySwitchModelResult({ currentModel: "sonnet", modelSwitchVersion: 2 }, { success: false }),
    ).toEqual({
      currentModel: undefined,
      modelSwitchVersion: 3,
    });
  });

  test("control_request helper input matches ask question routing shape", () => {
    expect(controlRequest("req-7", "Bash", { command: "pwd" })).toMatchObject({
      type: "control_request",
      request_id: "req-7",
      request: { tool_name: "Bash", input: { command: "pwd" } },
    });
  });
});

describe("computeRunningCount", () => {
  test("assistant turns keep isRunning on until result resets it", () => {
    expect(
      computeRunningCount([
        assistant("msg-1", [
          { type: "text", text: "start" },
          { type: "tool_use", id: "tu-1", name: "Read", input: { file_path: "/x" } },
        ]),
      ]),
    ).toBe(1);

    expect(
      computeRunningCount([
        assistant("msg-1", [
          { type: "text", text: "start" },
          { type: "tool_use", id: "tu-1", name: "Read", input: { file_path: "/x" } },
        ]),
        assistant("msg-1", [{ type: "text", text: "more" }]),
        user([{ type: "tool_result", tool_use_id: "tu-1", content: "ok" }]),
      ]),
    ).toBe(1);
  });

  test("thinking_tokens also keeps a turn running until result resets it", () => {
    expect(computeRunningCount([thinkingTokens(5)])).toBe(1);
    expect(computeRunningCount([thinkingTokens(5), thinkingTokens(9)])).toBe(1);
    expect(computeRunningCount([thinkingTokens(5), result("success")])).toBe(0);
  });

  test("user text no longer clears isRunning before result", () => {
    expect(
      computeRunningCount([
        assistant("msg-1", [
          { type: "tool_use", id: "tu-1", name: "Read", input: { file_path: "/x" } },
        ]),
        user([{ type: "text", text: "Continue from where you left off." }]),
      ]),
    ).toBe(1);
    expect(
      computeRunningCount([
        assistant("msg-1", [
          { type: "tool_use", id: "tu-1", name: "Read", input: { file_path: "/x" } },
        ]),
        user([{ type: "text", text: "Continue from where you left off." }]),
        result("success"),
      ]),
    ).toBe(0);
  });
});

// ── messageToThreadLike tests ─────────────────────────────────────────

describe("messageToThreadLike", () => {
  test("assistant message maps to assistant role with raw JSON content", () => {
    const msg = {
      type: "assistant",
      message: { id: "m1", role: "assistant", content: [{ type: "text", text: "hello" }] },
    } as unknown as SessionStreamServerMessage;
    const result = messageToThreadLike(msg);
    expect(result.role).toBe("assistant");
    const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
    expect(text).toInclude('"type": "assistant"');
    expect(text).toInclude('"hello"');
  });

  test("user message maps to user role with raw JSON content", () => {
    const msg = {
      type: "user",
      message: { role: "user", content: [{ type: "text", text: "hi" }] },
    } as unknown as SessionStreamServerMessage;
    const result = messageToThreadLike(msg);
    expect(result.role).toBe("user");
    expect(result.content).toInclude('"type": "user"');
  });

  test("system message maps to system role with raw JSON content", () => {
    const msg = {
      type: "system",
      subtype: "init",
      model: "sonnet",
    } as unknown as SessionStreamServerMessage;
    const result = messageToThreadLike(msg);
    expect(result.role).toBe("system");
    const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
    expect(text).toInclude('"type": "system"');
  });

  test("result message maps to system role with raw JSON content", () => {
    const msg = {
      type: "result",
      subtype: "success",
    } as unknown as SessionStreamServerMessage;
    const result = messageToThreadLike(msg);
    expect(result.role).toBe("system");
    const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
    expect(text).toInclude('"type": "result"');
  });
});

// ── processMessage building blocks ───────────────────────────────────

describe("message processing building blocks", () => {
  test("convertExternalToThreadLike converts assistant message", () => {
    const msg = {
      type: "assistant",
      userType: "external",
      message: { id: "m1", role: "assistant", content: [{ type: "text", text: "hello" }] },
    } as unknown as SessionStreamServerMessage;
    const result = convertExternalToThreadLike(msg);
    expect(result).toBeDefined();
    expect(result?.role).toBe("assistant");
  });

  test("convertExternalToThreadLike renders external user message with text content", () => {
    const msg = {
      type: "user",
      userType: "external",
      message: {
        role: "user",
        content: [{ type: "text", text: "hello world" }],
      },
    } as unknown as SessionStreamServerMessage;
    const result = convertExternalToThreadLike(msg);
    expect(result).toBeDefined();
    expect(result?.role).toBe("user");
    expect(result?.content).toBe("hello world");
  });

  test("convertExternalToThreadLike renders user message with only tool_result as brown bubble", () => {
    const msg = {
      type: "user",
      userType: "external",
      message: {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "tu-1", content: "result" }],
      },
    } as unknown as SessionStreamServerMessage;
    const result = convertExternalToThreadLike(msg);
    expect(result).toBeDefined();
    expect(result?.role).toBe("user");
    expect(result?.content).toBe("result");
  });

  test("convertExternalToThreadLike returns null for user message with empty content", () => {
    const msg = {
      type: "user",
      userType: "external",
      message: { role: "user", content: [] },
    } as unknown as SessionStreamServerMessage;
    expect(convertExternalToThreadLike(msg)).toBeNull();
  });

  test("extractTaskOps returns empty for non-task messages", () => {
    const msg = {
      type: "assistant",
      userType: "external",
      message: { id: "m1", role: "assistant", content: [{ type: "text", text: "hello" }] },
    } as unknown as SessionStreamServerMessage;
    expect(extractTaskOps(msg)).toEqual([]);
  });

  test("extractTaskOps extracts TaskCreate with subject; reducer assigns sequential id", () => {
    const msg = {
      type: "assistant",
      userType: "external",
      message: {
        id: "m1",
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "tu-1",
            name: "TaskCreate",
            input: { subject: "short title", description: "detailed description" },
          },
        ],
      },
    } as unknown as SessionStreamServerMessage;
    const ops = extractTaskOps(msg);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ subtype: "task_started", task_id: "" });
    const tasks = applyTaskSystemMessage([], ops[0]);
    expect(tasks[0].id).toBe("1");
    expect(tasks[0].subject).toBe("short title");
    expect(tasks[0].description).toBe("detailed description");
  });

  test("TaskUpdate matches TaskCreate via sequential id, no orphan entries", () => {
    const createMsg = {
      type: "assistant",
      userType: "external",
      message: {
        id: "m1",
        role: "assistant",
        content: [
          { type: "tool_use", id: "tu-1", name: "TaskCreate", input: { subject: "do thing" } },
        ],
      },
    } as unknown as SessionStreamServerMessage;
    const updateMsg = {
      type: "assistant",
      userType: "external",
      message: {
        id: "m2",
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "tu-2",
            name: "TaskUpdate",
            input: { taskId: "1", status: "completed" },
          },
        ],
      },
    } as unknown as SessionStreamServerMessage;

    let tasks: ReturnType<typeof applyTaskSystemMessage> = [];
    for (const op of extractTaskOps(createMsg)) tasks = applyTaskSystemMessage(tasks, op);
    for (const op of extractTaskOps(updateMsg)) tasks = applyTaskSystemMessage(tasks, op);

    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe("1");
    expect(tasks[0].status).toBe("completed");
  });

  test("TaskUpdate for unknown id does not create orphan", () => {
    const updateMsg = {
      type: "assistant",
      userType: "external",
      message: {
        id: "m2",
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "tu-2",
            name: "TaskUpdate",
            input: { taskId: "99", status: "completed" },
          },
        ],
      },
    } as unknown as SessionStreamServerMessage;
    const ops = extractTaskOps(updateMsg);
    const tasks = ops.reduce(
      applyTaskSystemMessage,
      [] as ReturnType<typeof applyTaskSystemMessage>,
    );
    expect(tasks).toHaveLength(0);
  });

  test("extractTaskOps returns empty for non-external", () => {
    const msg = {
      type: "assistant",
      message: {
        id: "m1",
        role: "assistant",
        content: [{ type: "tool_use", id: "tu-1", name: "TaskCreate", input: {} }],
      },
    } as unknown as SessionStreamServerMessage;
    expect(extractTaskOps(msg)).toEqual([]);
  });

  test("hasToolUseNamed detects EnterPlanMode in external assistant", () => {
    const msg = {
      type: "assistant",
      userType: "external",
      message: {
        id: "m1",
        role: "assistant",
        content: [{ type: "tool_use", id: "tu-1", name: "EnterPlanMode", input: {} }],
      },
    } as unknown as SessionStreamServerMessage;
    expect(hasToolUseNamed(msg, "EnterPlanMode")).toBe(true);
    expect(hasToolUseNamed(msg, "TaskCreate")).toBe(false);
  });

  test("hasToolUseNamed returns false for non-external", () => {
    const msg = {
      type: "assistant",
      message: {
        id: "m1",
        role: "assistant",
        content: [{ type: "tool_use", id: "tu-1", name: "EnterPlanMode", input: {} }],
      },
    } as unknown as SessionStreamServerMessage;
    expect(hasToolUseNamed(msg, "EnterPlanMode")).toBe(false);
  });

  test("messageToThreadLike converts all message types", () => {
    const assistant = {
      type: "assistant",
      message: { id: "a1", role: "assistant", content: [] },
    } as unknown as SessionStreamServerMessage;
    expect(messageToThreadLike(assistant).role).toBe("assistant");

    const user = {
      type: "user",
      message: { role: "user", content: [] },
    } as unknown as SessionStreamServerMessage;
    expect(messageToThreadLike(user).role).toBe("user");

    const system = { type: "system", subtype: "init" } as unknown as SessionStreamServerMessage;
    expect(messageToThreadLike(system).role).toBe("system");
  });
});

// KEPT: 旧 loadMessagesFromRaw 测试保留作为参考（函数已注释，后续重构时参考）
/*
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

  test("skill synthetic content with sourceToolUseID is hidden and attaches to tool-call", () => {
    const msgs: SessionStreamServerMessage[] = [
      user([{ type: "text", text: "search with skill" }]),
      assistant("msg-skill", [
        {
          type: "tool_use",
          id: "tu-skill",
          name: "Skill",
          input: { skill: "tavily-search", args: "deepseek provider" },
        },
      ]),
      {
        type: "user",
        isSynthetic: true,
        sourceToolUseID: "tu-skill",
        message: {
          role: "user",
          content: [
            {
              type: "text",
              text: "Base directory for this skill: /tmp/skill\n\n# tavily search\n...",
            },
          ],
        },
      } as unknown as SessionStreamServerMessage,
      assistant("msg-next", [{ type: "text", text: "done" }]),
      result("success"),
    ];

    const resultMsgs = loadMessagesFromRaw(msgs);

    expect(resultMsgs).toHaveLength(3);
    expect(resultMsgs[0]).toEqual({ role: "user", content: "search with skill" });
    expect(resultMsgs[1].role).toBe("assistant");
    expect(resultMsgs[2].role).toBe("assistant");

    const assistantContent = resultMsgs[1].content as Array<{
      type: string;
      toolCallId?: string;
      metadata?: { skillContent?: string };
    }>;
    expect(assistantContent[0].type).toBe("tool-call");
    expect(assistantContent[0].toolCallId).toBe("tu-skill");
    expect(assistantContent[0].metadata?.skillContent).toContain("Base directory for this skill:");
  });

  test("unmatched tool_result is ignored without mutating history", () => {
    const msgs: SessionStreamServerMessage[] = [
      user([{ type: "text", text: "hello" }]),
      {
        type: "user",
        message: {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: "missing-tool", content: "orphan" }],
        },
      } as unknown as SessionStreamServerMessage,
      result("success"),
    ];

    const resultMsgs = loadMessagesFromRaw(msgs);
    expect(resultMsgs).toEqual([{ role: "user", content: "hello" }]);
  });

  test("skill metadata without a matching tool-call warns instead of crashing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const msgs: SessionStreamServerMessage[] = [
      user([{ type: "text", text: "plain" }]),
      {
        type: "user",
        isMeta: true,
        sourceToolUseID: "missing-tool",
        message: {
          role: "user",
          content: [{ type: "text", text: "Base directory for this skill: /tmp/skill" }],
        },
      } as unknown as SessionStreamServerMessage,
      result("success"),
    ];

    const resultMsgs = loadMessagesFromRaw(msgs);
    expect(resultMsgs).toEqual([{ role: "user", content: "plain" }]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  test("tool_result backfills a flushed assistant bubble after result", () => {
    const msgs: SessionStreamServerMessage[] = [
      user([{ type: "text", text: "do skill" }]),
      assistant("msg-skill", [
        { type: "text", text: "before" },
        { type: "tool_use", id: "tu-skill", name: "Skill", input: { skill: "x" } },
        { type: "text", text: "after" },
      ]),
      assistant("msg-next", [{ type: "text", text: "next" }]),
      result("success"),
      {
        type: "user",
        message: {
          role: "user",
          content: [
            { type: "tool_result", tool_use_id: "tu-skill", content: "Launching skill: x" },
          ],
        },
        toolUseResult: { skill: { id: "x" } },
      } as unknown as SessionStreamServerMessage,
    ];

    const resultMsgs = loadMessagesFromRaw(msgs);
    expect(resultMsgs).toHaveLength(3);
    const assistantContent = resultMsgs[2].content as Array<{
      toolCallId?: string;
      result?: string;
    }>;
    expect(
      assistantContent.some(
        (part) => part.toolCallId === "tu-skill" && part.result === "Launching skill: x",
      ),
    ).toBe(true);
  });

  test("skill metadata backfills a flushed assistant bubble after result", () => {
    const msgs: SessionStreamServerMessage[] = [
      user([{ type: "text", text: "do skill" }]),
      assistant("msg-skill", [
        { type: "text", text: "before" },
        { type: "tool_use", id: "tu-skill", name: "Skill", input: { skill: "x" } },
        { type: "text", text: "after" },
      ]),
      assistant("msg-next", [{ type: "text", text: "next" }]),
      result("success"),
      {
        type: "user",
        isMeta: true,
        sourceToolUseID: "tu-skill",
        message: {
          role: "user",
          content: [{ type: "text", text: "Base directory for this skill: /tmp/skill" }],
        },
      } as unknown as SessionStreamServerMessage,
    ];

    const resultMsgs = loadMessagesFromRaw(msgs);
    expect(resultMsgs).toHaveLength(3);
    const assistantContent = resultMsgs[1].content as Array<{
      metadata?: { skillContent?: string };
    }>;
    expect(assistantContent[1].metadata?.skillContent).toContain("Base directory for this skill:");
  });

  test("tool_result content arrays are joined into one result string", () => {
    const msgs: SessionStreamServerMessage[] = [
      user([{ type: "text", text: "read file" }]),
      assistant("msg-1", [
        { type: "tool_use", id: "tu-read", name: "Read", input: { file_path: "/f" } },
      ]),
      {
        type: "user",
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "tu-read",
              content: [
                { type: "text", text: "line 1" },
                { type: "text", text: "line 2" },
              ],
            },
          ],
        },
      } as unknown as SessionStreamServerMessage,
      result("success"),
    ];

    const resultMsgs = loadMessagesFromRaw(msgs);
    const assistantContent = resultMsgs[1].content as Array<{
      type: string;
      toolCallId?: string;
      result?: string;
    }>;
    expect(assistantContent[0].result).toBe("line 1\nline 2");
  });

  test("api_retry is skipped — retry state handled in hook, not as message", () => {
    const msgs: SessionStreamServerMessage[] = [
      {
        type: "system",
        subtype: "api_retry",
        attempt: 1,
        max_retries: 5,
        retry_delay_ms: 1500,
        error_status: 429,
      } as unknown as SessionStreamServerMessage,
    ];

    const resultMsgs = loadMessagesFromRaw(msgs);
    expect(resultMsgs).toHaveLength(0);
  });

  test("microcompact_boundary renders a compact divider with saved token count", () => {
    const msgs: SessionStreamServerMessage[] = [
      {
        type: "system",
        subtype: "microcompact_boundary",
        microcompactMetadata: { trigger: "manual", preTokens: 24500, tokensSaved: 12000 },
      } as unknown as SessionStreamServerMessage,
    ];

    const resultMsgs = loadMessagesFromRaw(msgs);
    expect(resultMsgs).toHaveLength(1);
    const content = resultMsgs[0].content as Array<{ type: string; text: string }>;
    expect(content[0].text).toBe("上下文已压缩 (~25k tokens)");
  });

  test("skill metadata backfills a flushed assistant bubble after result", () => {
    const msgs: SessionStreamServerMessage[] = [
      user([{ type: "text", text: "do skill" }]),
      assistant("msg-skill", [
        { type: "text", text: "before" },
        { type: "tool_use", id: "tu-skill", name: "Skill", input: { skill: "x" } },
        { type: "text", text: "after" },
      ]),
      result("success"),
      {
        type: "user",
        isMeta: true,
        sourceToolUseID: "tu-skill",
        message: {
          role: "user",
          content: [{ type: "text", text: "Base directory for this skill: /tmp/skill" }],
        },
      } as unknown as SessionStreamServerMessage,
    ];

    const resultMsgs = loadMessagesFromRaw(msgs);
    expect(resultMsgs).toHaveLength(2);
    const assistantContent = resultMsgs[1].content as Array<{
      metadata?: { skillContent?: string };
    }>;
    expect(assistantContent[1].metadata?.skillContent).toContain("Base directory for this skill:");
  });

  test("compact_boundary renders as system divider message", () => {
    const msgs: SessionStreamServerMessage[] = [
      {
        type: "system",
        subtype: "compact_boundary",
        compactMetadata: { trigger: "manual", preTokens: 123456 },
      } as unknown as SessionStreamServerMessage,
    ];

    const resultMsgs = loadMessagesFromRaw(msgs);
    expect(resultMsgs).toHaveLength(1);
    expect(resultMsgs[0].role).toBe("system");
    const content = resultMsgs[0].content as Array<{ type: string; text: string }>;
    expect(content[0]).toEqual({ type: "text", text: "上下文已压缩 (~123k tokens)" });
  });

  test("local-command stdout Compacted is skipped because compact_boundary is authoritative", () => {
    const msgs: SessionStreamServerMessage[] = [
      {
        type: "user",
        message: {
          role: "user",
          content: "<local-command-stdout>Compacted</local-command-stdout>",
        },
      } as unknown as SessionStreamServerMessage,
    ];

    expect(loadMessagesFromRaw(msgs)).toEqual([]);
  });

  test("non-compact local-command stdout renders as slash-command tool result", () => {
    const msgs: SessionStreamServerMessage[] = [
      {
        type: "user",
        message: {
          role: "user",
          content: "<local-command-stdout>patched 3 files</local-command-stdout>",
        },
      } as unknown as SessionStreamServerMessage,
    ];

    const resultMsgs = loadMessagesFromRaw(msgs);
    expect(resultMsgs).toHaveLength(1);
    expect(resultMsgs[0].role).toBe("assistant");
    const content = resultMsgs[0].content as Array<{
      type: string;
      toolName?: string;
      result?: string;
    }>;
    expect(content[0]).toMatchObject({
      type: "tool-call",
      toolName: "slash-command",
      result: "patched 3 files",
    });
  });

  test("synthetic assistant messages are skipped", () => {
    const msgs: SessionStreamServerMessage[] = [
      user([{ type: "text", text: "hello" }]),
      {
        type: "assistant",
        message: {
          id: "msg-synth",
          role: "assistant",
          model: "<synthetic>",
          content: [{ type: "text", text: "internal notice" }],
        },
      } as unknown as SessionStreamServerMessage,
      assistant("msg-real", [{ type: "text", text: "real reply" }]),
    ];

    const resultMsgs = loadMessagesFromRaw(msgs);
    expect(resultMsgs).toHaveLength(2);
    expect(resultMsgs[0]).toEqual({ role: "user", content: "hello" });
    const content = resultMsgs[1].content as Array<{ type: string; text: string }>;
    expect(content).toEqual([{ type: "text", text: "real reply" }]);
  });

  test("thinking blocks are mapped to reasoning parts", () => {
    const msgs: SessionStreamServerMessage[] = [
      user([{ type: "text", text: "think about this" }]),
      assistant("msg-1", [
        {
          type: "thinking",
          thinking: "Let me reason about this carefully.",
          signature: "sig-abc",
        },
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
    expect(assistantContent[0]).toMatchObject({
      type: "reasoning",
      text: "Let me reason about this carefully.",
    });
    expect(assistantContent[1]).toEqual({ type: "text", text: "Here is my conclusion." });
  });

  test("result error surfaces as system error divider", () => {
    const msgs: SessionStreamServerMessage[] = [
      user([{ type: "text", text: "start" }]),
      assistant("msg-1", [{ type: "text", text: "working" }]),
      {
        type: "result",
        subtype: "error",
        result: "Bad request",
        is_error: true,
      } as unknown as SessionStreamServerMessage,
    ];

    const resultMsgs = loadMessagesFromRaw(msgs);
    expect(resultMsgs[resultMsgs.length - 1]).toMatchObject({
      role: "system",
      metadata: { custom: { systemMessageType: "error" } },
    });
  });

  test("bare hidden skill text without metadata no longer renders as user bubble", () => {
    const msgs: SessionStreamServerMessage[] = [
      {
        type: "user",
        isSynthetic: true,
        message: {
          role: "user",
          content: [{ type: "text", text: "Base directory for this skill: /tmp/skill" }],
        },
      } as unknown as SessionStreamServerMessage,
    ];

    expect(loadMessagesFromRaw(msgs)).toEqual([]);
  });

  test("thinking_tokens collapse into reasoning part (last one wins per turn)", () => {
    const msgs: SessionStreamServerMessage[] = [
      thinkingTokens(1),
      thinkingTokens(5),
      user([{ type: "text", text: "hi" }]),
      thinkingTokens(10),
      assistant("msg-1", [
        { type: "thinking", thinking: "Reasoning...", signature: "sig" },
        { type: "text", text: "Answer." },
      ]),
      thinkingTokens(25),
      thinkingTokens(39),
      result("success", 3500),
    ];
    const resultMsgs = loadMessagesFromRaw(msgs);
    const assistantContent = resultMsgs[1].content as Array<{
      type: string;
      text?: string;
      estimatedTokens?: { value: number };
      durationMs?: { value: number | null };
    }>;
    expect(assistantContent.length).toBe(2);
    expect(assistantContent[0].type).toBe("reasoning");
    expect(assistantContent[0].estimatedTokens?.value).toBe(39);
    expect(assistantContent[0].durationMs?.value).toBe(3500);
  });

  test("reasoning parts in the same turn share the same token ref", () => {
    const msgs: SessionStreamServerMessage[] = [
      thinkingTokens(5),
      assistant("msg-1", [
        { type: "thinking", thinking: "Step 1", signature: "sig1" },
        { type: "text", text: "Intermediate." },
      ]),
      assistant("msg-2", [
        { type: "thinking", thinking: "Step 2", signature: "sig2" },
        { type: "text", text: "Final." },
      ]),
      thinkingTokens(42),
      result("success"),
    ];
    const result_msgs = loadMessagesFromRaw(msgs);
    const content1 = result_msgs[0].content as Array<{ estimatedTokens?: { value: number } }>;
    // Both reasoning parts should share the same token ref and see the final value
    expect(content1[0].estimatedTokens?.value).toBe(42);
    const content2 = result_msgs[1].content as Array<{ estimatedTokens?: { value: number } }>;
    expect(content2[0].estimatedTokens?.value).toBe(42);
  });
});

*/

// ── task system state tests ───────────────────────────────────────────

describe("task system state", () => {
  // KEPT: deriveTasksFromReplayBatch 已注释，测试保留作为参考
  /*
  test("deriveTasksFromReplayBatch rebuilds task chips only from task_* messages", () => {
    const batch: SessionStreamServerMessage[] = [
      user([{ type: "text", text: "create task" }]),
      assistant("msg-task", [
        {
          type: "tool_use",
          id: "tu-task",
          name: "TaskCreate",
          input: { subject: "Research bug", description: "Investigate issue" },
        },
      ]),
      {
        type: "user",
        message: {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: "tu-task", content: "Task #49 created" }],
        },
        toolUseResult: {
          task: { id: "49", subject: "Research bug" },
        },
      } as unknown as SessionStreamServerMessage,
      taskStarted("task-1", { prompt: "Run search", agentType: "general-purpose" }),
      taskUpdated("task-1", { isBackgrounded: true }),
      taskNotification("task-1", { text: "done" }),
    ];

    const tasks = deriveTasksFromReplayBatch(batch);
    expect(tasks).toEqual([
      {
        id: "task-1",
        kind: "agent",
        agentType: "general-purpose",
        workflowName: undefined,
        description: "Run search",
        status: "completed",
        text: "done",
      },
    ]);
  });
*/

  test("applyTaskSystemMessage updates task status across running backgrounded error completed", () => {
    let tasks = applyTaskSystemMessage(
      [],
      taskStarted("task-2", { prompt: "Inspect logs" }) as never,
    );
    expect(tasks[0]).toMatchObject({
      id: "task-2",
      description: "Inspect logs",
      status: "running",
    });

    tasks = applyTaskSystemMessage(tasks, taskUpdated("task-2", { isBackgrounded: true }) as never);
    expect(tasks[0]).toMatchObject({ id: "task-2", status: "backgrounded" });

    tasks = applyTaskSystemMessage(tasks, taskUpdated("task-2", { error: "failed" }) as never);
    expect(tasks[0]).toMatchObject({ id: "task-2", status: "error", error: "failed" });

    tasks = applyTaskSystemMessage(
      tasks,
      taskNotification("task-2", { text: "finished" }) as never,
    );
    expect(tasks[0]).toMatchObject({ id: "task-2", status: "completed", text: "finished" });
  });

  test("applyTaskSystemMessage assigns sequential id when task_started has no id", () => {
    const noId = { type: "system", subtype: "task_started", task_id: "", prompt: "first" } as never;
    expect(applyTaskSystemMessage([], noId)[0]).toMatchObject({ id: "1", description: "first" });
    const noId2 = {
      type: "system",
      subtype: "task_started",
      task_id: "",
      prompt: "second",
    } as never;
    const after = applyTaskSystemMessage(applyTaskSystemMessage([], noId), noId2);
    expect(after[1]).toMatchObject({ id: "2", description: "second" });
  });

  test("applyTaskSystemMessage skips task_updated for unknown id (no orphan)", () => {
    expect(applyTaskSystemMessage([], taskUpdated("task-4") as never)).toEqual([]);
    expect(
      applyTaskSystemMessage([], taskUpdated("task-5", { isBackgrounded: true }) as never),
    ).toEqual([]);
    expect(applyTaskSystemMessage([], taskUpdated("task-6", { error: "failed" }) as never)).toEqual(
      [],
    );
  });

  test("applyTaskSystemMessage skips task_notification for unknown id (no orphan)", () => {
    expect(applyTaskSystemMessage([], taskNotification("task-7") as never)).toEqual([]);
    expect(
      applyTaskSystemMessage([], taskNotification("task-8", { text: "done" }) as never),
    ).toEqual([]);
  });
});

// ── Queue-operation helpers ──────────────────────────────────────────

describe("queue-operation helpers", () => {
  describe("deriveQueueSource", () => {
    test("undefined / empty / plain text / slash commands → user", () => {
      expect(deriveQueueSource(undefined)).toBe("user");
      expect(deriveQueueSource("")).toBe("user");
      expect(deriveQueueSource("/model")).toBe("user");
      expect(deriveQueueSource("/model opusplan")).toBe("user");
      expect(deriveQueueSource("普通用户文本")).toBe("user");
    });

    test("<3 (not XML) → user", () => {
      expect(deriveQueueSource("<3 you")).toBe("user");
      expect(deriveQueueSource("<<EOF")).toBe("user");
    });

    test("XML elements → assistant", () => {
      expect(
        deriveQueueSource("<task-notification>\n<task-id>a1</task-id>\n</task-notification>"),
      ).toBe("assistant");
      expect(deriveQueueSource("<local-command-stdout>ok</local-command-stdout>")).toBe(
        "assistant",
      );
    });

    test("self-closing XML → assistant", () => {
      expect(deriveQueueSource("<br/>")).toBe("assistant");
      expect(deriveQueueSource('<img src="x" />')).toBe("assistant");
    });

    test("multiline XML → assistant", () => {
      const xml = `<task-notification>
<task-id>a122c801a46ab5746</task-id>
<tool-use-id>call_03_bVTcgN1qLQLkHuVtsZgo6322</tool-use-id>
<output-file>/tmp/claude-1000/...</output-file>
</task-notification>`;
      expect(deriveQueueSource(xml)).toBe("assistant");
    });
  });

  describe("applyQueueOperation", () => {
    const entry = (content: string, source: "user" | "assistant"): QueueEntry => ({
      content,
      source,
    });

    test("enqueue with content → push tail, derived source", () => {
      const r = applyQueueOperation([], {
        type: "queue-operation",
        operation: "enqueue",
        content: "/model opusplan",
      });
      expect(r).toEqual([entry("/model opusplan", "user")]);
    });

    test("enqueue XML content → assistant source", () => {
      const r = applyQueueOperation([], {
        type: "queue-operation",
        operation: "enqueue",
        content: "<task-notification><task-id>a1</task-id></task-notification>",
      });
      expect(r).toEqual([
        entry("<task-notification><task-id>a1</task-id></task-notification>", "assistant"),
      ]);
    });

    test("enqueue without content → empty user entry", () => {
      const r = applyQueueOperation([], {
        type: "queue-operation",
        operation: "enqueue",
      });
      expect(r).toEqual([entry("", "user")]);
    });

    test("dequeue → shift head (FIFO)", () => {
      const state = [entry("A", "user"), entry("B", "user")];
      const r = applyQueueOperation(state, {
        type: "queue-operation",
        operation: "dequeue",
      });
      expect(r).toEqual([entry("B", "user")]);
    });

    test("remove → pop tail (LIFO)", () => {
      const state = [entry("A", "user"), entry("B", "user")];
      const r = applyQueueOperation(state, {
        type: "queue-operation",
        operation: "remove",
      });
      expect(r).toEqual([entry("A", "user")]);
    });

    test("popAll → clear", () => {
      const state = [entry("A", "user"), entry("B", "user")];
      const r = applyQueueOperation(state, {
        type: "queue-operation",
        operation: "popAll",
      });
      expect(r).toEqual([]);
    });

    test("dequeue on empty → []", () => {
      expect(applyQueueOperation([], { type: "queue-operation", operation: "dequeue" })).toEqual(
        [],
      );
    });

    test("remove on empty → []", () => {
      expect(applyQueueOperation([], { type: "queue-operation", operation: "remove" })).toEqual([]);
    });

    test("sequence: enqueue A, enqueue B, dequeue → [B]; remove → [A] (LIFO assertion)", () => {
      let state: QueueEntry[] = [];
      state = applyQueueOperation(state, {
        type: "queue-operation",
        operation: "enqueue",
        content: "A",
      });
      state = applyQueueOperation(state, {
        type: "queue-operation",
        operation: "enqueue",
        content: "B",
      });
      // dequeue = FIFO shift head → A removed
      state = applyQueueOperation(state, { type: "queue-operation", operation: "dequeue" });
      expect(state).toEqual([entry("B", "user")]);
      // remove = LIFO pop tail → B removed, leaving A gone already → []
      state = applyQueueOperation(state, { type: "queue-operation", operation: "remove" });
      expect(state).toEqual([]);
    });
  });
});

// ── API error attachment helpers ──────────────────────────────────────

const apiErrorMsg = (overrides: Record<string, unknown> = {}): SessionStreamServerMessage =>
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
    uuid: "err-uuid-1",
    parentUuid: "parent-uuid-1",
    ...overrides,
  }) as unknown as SessionStreamServerMessage;

const normalExternalAssistant = (id = "a1", text = "hello"): SessionStreamServerMessage =>
  ({
    type: "assistant",
    message: { id, role: "assistant", content: [{ type: "text", text }] },
    userType: "external",
    uuid: "uuid-" + id,
  }) as unknown as SessionStreamServerMessage;

const bubble = (
  role: "user" | "assistant" | "system",
  overrides: Record<string, unknown> = {},
): ThreadMessageLike => {
  const base: ThreadMessageLike = {
    role,
    content: role === "user" ? "test content" : [{ type: "text", text: "test content" }],
    metadata: {
      custom: {
        _raw: { uuid: "uuid-" + role },
        sourceUuids: ["uuid-" + role],
        _rawMessages: [{ uuid: "uuid-" + role }],
        ...overrides,
      },
    },
  };
  return base;
};

const toolCallBubble = (toolCallId: string, rawUuid: string): ThreadMessageLike => ({
  role: "assistant",
  content: [
    { type: "text" as const, text: "thinking..." },
    { type: "tool-call" as const, toolCallId, toolName: "Bash", args: {}, argsText: "{}" },
  ],
  metadata: {
    custom: { _raw: { uuid: rawUuid }, sourceUuids: [rawUuid], _rawMessages: [{ uuid: rawUuid }] },
  },
});

describe("API error detection", () => {
  test("isExternalApiErrorMessage true for error message", () => {
    expect(isExternalApiErrorMessage(apiErrorMsg())).toBe(true);
  });

  test("isExternalApiErrorMessage false for normal external assistant", () => {
    expect(isExternalApiErrorMessage(normalExternalAssistant())).toBe(false);
  });

  test("isExternalApiErrorMessage false when userType missing", () => {
    const m = apiErrorMsg();
    delete (m as Record<string, unknown>).userType;
    expect(isExternalApiErrorMessage(m)).toBe(false);
  });

  test("isExternalApiErrorMessage false when isApiErrorMessage missing", () => {
    const m = apiErrorMsg();
    delete (m as Record<string, unknown>).isApiErrorMessage;
    expect(isExternalApiErrorMessage(m)).toBe(false);
  });
});

describe("extractApiErrorText", () => {
  test("extracts from text content blocks", () => {
    expect(extractApiErrorText(apiErrorMsg())).toBe("500 Request failed");
  });

  test("joins multiple text blocks", () => {
    const m = apiErrorMsg({
      message: {
        id: "e",
        role: "assistant",
        content: [
          { type: "text", text: "Line 1" },
          { type: "text", text: "Line 2" },
        ],
      },
    });
    expect(extractApiErrorText(m)).toBe("Line 1\nLine 2");
  });

  test("falls back to error field", () => {
    const m = apiErrorMsg({
      message: { id: "e", role: "assistant", content: [] },
      error: "max_output_tokens",
    });
    expect(extractApiErrorText(m)).toBe("max_output_tokens");
  });

  test("falls back to JSON for malformed message", () => {
    const m = {
      type: "assistant",
      userType: "external",
      isApiErrorMessage: true,
    } as unknown as SessionStreamServerMessage;
    const text = extractApiErrorText(m);
    expect(text).toContain("isApiErrorMessage");
  });
});

describe("getMsgParentUuid", () => {
  test("reads parentUuid", () => {
    expect(getMsgParentUuid(apiErrorMsg({ parentUuid: "p-123" }))).toBe("p-123");
  });

  test("prefers parentUuid over logicalParentUuid", () => {
    const m = apiErrorMsg({ parentUuid: "p-1", logicalParentUuid: "lp-2" });
    expect(getMsgParentUuid(m)).toBe("p-1");
  });

  test("falls back to logicalParentUuid", () => {
    const m = apiErrorMsg({ parentUuid: undefined, logicalParentUuid: "lp-2" });
    expect(getMsgParentUuid(m)).toBe("lp-2");
  });

  test("returns null when neither field present", () => {
    const m = apiErrorMsg({ parentUuid: undefined, logicalParentUuid: undefined });
    expect(getMsgParentUuid(m)).toBeNull();
  });
});

describe("getMsgUuid", () => {
  test("reads uuid string", () => {
    expect(getMsgUuid(apiErrorMsg({ uuid: "u-123" }))).toBe("u-123");
  });

  test("returns null when absent", () => {
    expect(getMsgUuid({ type: "assistant" } as SessionStreamServerMessage)).toBeNull();
  });

  test("returns null for non-string uuid", () => {
    expect(
      getMsgUuid({ type: "assistant", uuid: 42 } as unknown as SessionStreamServerMessage),
    ).toBeNull();
  });
});

describe("getMsgToolResultIds", () => {
  test("extracts tool_use_id from user with tool_result", () => {
    const m = {
      type: "user",
      message: {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "tid-1", content: "ok" },
          { type: "tool_result", tool_use_id: "tid-2", content: "ok" },
        ],
      },
    } as unknown as SessionStreamServerMessage;
    expect(getMsgToolResultIds(m)).toEqual(["tid-1", "tid-2"]);
  });

  test("returns empty for user without tool_result", () => {
    const m = {
      type: "user",
      message: { role: "user", content: [{ type: "text", text: "hi" }] },
    } as unknown as SessionStreamServerMessage;
    expect(getMsgToolResultIds(m)).toEqual([]);
  });

  test("returns empty for non-user type", () => {
    expect(getMsgToolResultIds({ type: "assistant" } as SessionStreamServerMessage)).toEqual([]);
  });
});

describe("threadMessageHasToolCallId", () => {
  test("finds matching tool-call", () => {
    const b = toolCallBubble("call-1", "uuid-1");
    expect(threadMessageHasToolCallId(b, "call-1")).toBe(true);
  });

  test("returns false for non-matching id", () => {
    const b = toolCallBubble("call-1", "uuid-1");
    expect(threadMessageHasToolCallId(b, "call-2")).toBe(false);
  });

  test("returns false for non-array content", () => {
    const b: ThreadMessageLike = { role: "user", content: "text" };
    expect(threadMessageHasToolCallId(b, "call-1")).toBe(false);
  });
});

describe("enrichBubbleMetadata", () => {
  test("adds sourceUuids and _rawMessages from _raw", () => {
    const raw = { type: "assistant", uuid: "u-1" } as SessionStreamServerMessage;
    const input: ThreadMessageLike = {
      role: "assistant",
      content: [{ type: "text", text: "hi" }],
      metadata: { custom: { _raw: raw } },
    };
    const enriched = enrichBubbleMetadata(input);
    const custom = enriched.metadata?.custom as Record<string, unknown>;
    expect(custom.sourceUuids).toEqual(["u-1"]);
    expect(custom._rawMessages).toEqual([raw]);
  });

  test("handles message without _raw", () => {
    const input: ThreadMessageLike = { role: "user", content: "hi" };
    const enriched = enrichBubbleMetadata(input);
    const custom = enriched.metadata?.custom as Record<string, unknown>;
    expect(custom.sourceUuids).toEqual([]);
    expect(custom._rawMessages).toEqual([]);
  });
});

describe("attachErrorToBubble", () => {
  test("adds apiErrors, extends _rawMessages and sourceUuids", () => {
    const b = bubble("assistant");
    const attachment: ApiErrorAttachment = {
      uuid: "err-uuid",
      parentUuid: "parent-uuid",
      error: "server_error",
      text: "500 failed",
      raw: apiErrorMsg(),
      resolution: "direct-parent",
    };
    const updated = attachErrorToBubble(b, attachment);
    const custom = updated.metadata?.custom as Record<string, unknown>;
    expect(custom.apiErrors).toEqual([attachment]);
    expect(custom._rawMessages).toHaveLength(2); // original + error raw
    expect(custom.sourceUuids).toContain("err-uuid");
  });

  test("appends second error to existing apiErrors", () => {
    const first: ApiErrorAttachment = {
      uuid: "e1",
      error: "err1",
      text: "t1",
      raw: apiErrorMsg(),
      resolution: "direct-parent",
    };
    const b = attachErrorToBubble(bubble("assistant"), first);
    const second: ApiErrorAttachment = {
      uuid: "e2",
      error: "err2",
      text: "t2",
      raw: apiErrorMsg(),
      resolution: "ancestor",
    };
    const updated = attachErrorToBubble(b, second);
    const custom = updated.metadata?.custom as Record<string, unknown>;
    const apiErrors = custom.apiErrors as ApiErrorAttachment[];
    expect(apiErrors).toHaveLength(2);
    expect(apiErrors[0].uuid).toBe("e1");
    expect(apiErrors[1].uuid).toBe("e2");
  });
});

describe("attachApiErrorToMessages", () => {
  test("direct parent attach: error attaches to matching bubble", () => {
    const messages = [bubble("assistant", { sourceUuids: ["parent-uuid-1"] })];
    const result = attachApiErrorToMessages(messages, apiErrorMsg(), new Map());
    expect(result.attached).toBe(true);
    const custom = result.messages[0]?.metadata?.custom as Record<string, unknown>;
    expect(custom.apiErrors).toHaveLength(1);
  });

  test("returns unmodified + attached=false when parent not found", () => {
    const messages = [bubble("assistant", { sourceUuids: ["other-uuid"] })];
    const result = attachApiErrorToMessages(messages, apiErrorMsg(), new Map());
    expect(result.attached).toBe(false);
    expect(result.messages).toBe(messages);
  });

  test("returns attached=false when no parentUuid on error", () => {
    const messages = [bubble("assistant")];
    const m = apiErrorMsg({ parentUuid: undefined, logicalParentUuid: undefined });
    const result = attachApiErrorToMessages(messages, m, new Map());
    expect(result.attached).toBe(false);
  });

  test("tool-result-parent: attaches to tool-call bubble when parent is user with tool_use_id", () => {
    const toolBubble = toolCallBubble("tid-1", "tc-uuid");
    const messages = [toolBubble];
    const userParentRaw = {
      type: "user",
      uuid: "user-uuid",
      message: {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "tid-1", content: "output" }],
      },
    } as unknown as SessionStreamServerMessage;
    const rawByUuid = new Map([["user-uuid", userParentRaw]]);
    const errMsg = apiErrorMsg({ parentUuid: "user-uuid" });
    const result = attachApiErrorToMessages(messages, errMsg, rawByUuid);
    expect(result.attached).toBe(true);
    const custom = result.messages[0]?.metadata?.custom as Record<string, unknown>;
    expect(custom.apiErrors).toHaveLength(1);
    const err = (custom.apiErrors as ApiErrorAttachment[])[0];
    expect(err.resolution).toBe("tool-result-parent");
  });

  test("ancestor walk: attaches to ancestor bubble when parent is attachment", () => {
    const ancestorBubble = bubble("user", { sourceUuids: ["ancestor-uuid"] });
    const messages = [ancestorBubble];
    const attachmentRaw = {
      type: "attachment",
      uuid: "att-uuid",
      parentUuid: "ancestor-uuid",
    } as unknown as SessionStreamServerMessage;
    const rawByUuid = new Map([["att-uuid", attachmentRaw]]);
    const errMsg = apiErrorMsg({ parentUuid: "att-uuid" });
    const result = attachApiErrorToMessages(messages, errMsg, rawByUuid);
    expect(result.attached).toBe(true);
    const custom = result.messages[0]?.metadata?.custom as Record<string, unknown>;
    const err = (custom.apiErrors as ApiErrorAttachment[])[0];
    expect(err.resolution).toBe("ancestor");
  });
});

// ── Boundary divider helpers ─────────────────────────────────────────

const marker = (type: string): SessionStreamServerMessage =>
  ({ type }) as SessionStreamServerMessage;

describe("messageToThreadLike batch markers", () => {
  test("history_start → null", () => {
    expect(messageToThreadLike(marker("history_start"))).toBeNull();
  });
  test("history_end → null", () => {
    expect(messageToThreadLike(marker("history_end"))).toBeNull();
  });
  test("output_start → null", () => {
    expect(messageToThreadLike(marker("output_start"))).toBeNull();
  });
  test("output_end → null", () => {
    expect(messageToThreadLike(marker("output_end"))).toBeNull();
  });
});

describe("makeBoundaryDivider", () => {
  test("returns system role with boundary metadata", () => {
    const d = makeBoundaryDivider("history");
    expect(d.role).toBe("system");
    const custom = d.metadata?.custom as Record<string, unknown>;
    expect(custom.systemMessageType).toBe("batch-boundary");
    expect(custom.batchBoundary).toBe("history");
  });

  test("output kind is preserved", () => {
    const d = makeBoundaryDivider("output");
    const custom = d.metadata?.custom as Record<string, unknown>;
    expect(custom.batchBoundary).toBe("output");
  });
});

describe("drainPendingErrors", () => {
  test("attaches resolvable errors, keeps unresolved", () => {
    const messages = [bubble("assistant", { sourceUuids: ["pu-1"] })];
    const resolved = apiErrorMsg({ parentUuid: "pu-1", uuid: "e-resolved" });
    const unresolved = apiErrorMsg({ parentUuid: "pu-missing", uuid: "e-unresolved" });
    const result = drainPendingErrors(messages, [resolved, unresolved], new Map());
    expect(result.remaining).toHaveLength(1);
    expect(result.remaining[0]).toBe(unresolved);
    const custom = result.messages[0]?.metadata?.custom as Record<string, unknown>;
    expect(custom.apiErrors).toHaveLength(1);
  });

  test("returns empty remaining when all resolved", () => {
    const messages = [bubble("assistant", { sourceUuids: ["pu-1"] })];
    const result = drainPendingErrors(messages, [apiErrorMsg({ parentUuid: "pu-1" })], new Map());
    expect(result.remaining).toEqual([]);
    const custom = result.messages[0]?.metadata?.custom as Record<string, unknown>;
    expect(custom.apiErrors).toHaveLength(1);
  });
});
