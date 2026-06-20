import { describe, expect, test } from "bun:test";
import type { SessionStreamServerMessage } from "@agents-remote/shared";
import type { ThreadMessageLike } from "@assistant-ui/react";
import {
  applyTaskSystemMessage,
  buildAllowAllControlResponse,
  isSyntheticAssistantMessage,
  applySwitchModelResult,
  computeRunningCount,
  convertContentToBubble,
  deriveStatus,
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
  extractToolResults,
  applyToolResultsToMessages,
  markOrphanedToolCalls,
  handleAttachment,
  normalizeAttachmentTaskStatus,
  normalizeChatStream,
  renderChatStream,
} from "./claude2-adapter";
import type {
  ApiErrorAttachment,
  QueueEntry,
  ExtractedToolResult,
  ChatStreamItem,
  NormalizedPart,
} from "./claude2-adapter";

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
  tool_use_id: string,
  input: Record<string, unknown> = {},
): SessionStreamServerMessage =>
  ({
    type: "control_request",
    request_id,
    request: {
      subtype: "can_use_tool",
      tool_name,
      tool_use_id,
      display_name: tool_name,
      input,
    },
  }) as unknown as SessionStreamServerMessage;

// biome-ignore lint/suspicious/noExplicitAny: attachment shape varies by subtype
const attachment = (subtype: string, fields?: Record<string, unknown>): any =>
  ({
    type: "attachment",
    uuid: "u-att",
    parentUuid: null,
    isSidechain: false,
    timestamp: "2025-06-16T00:00:00.000Z",
    sessionId: "s-1",
    attachment: { type: subtype, ...fields },
  }) as unknown as Record<string, unknown>;

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
    expect(controlRequest("req-7", "Bash", "toolu-7", { command: "pwd" })).toMatchObject({
      type: "control_request",
      request_id: "req-7",
      request: { tool_name: "Bash", tool_use_id: "toolu-7", input: { command: "pwd" } },
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

describe("deriveStatus", () => {
  test("complete when tail arrived without error", () => {
    expect(deriveStatus({ hasTail: true, isError: false, isOrphaned: false }, true)).toBe(
      "complete",
    );
    // status stays complete regardless of connection after tail arrived
    expect(deriveStatus({ hasTail: true, isError: false, isOrphaned: false }, false)).toBe(
      "complete",
    );
  });

  test("error when tail arrived with error", () => {
    expect(deriveStatus({ hasTail: true, isError: true, isOrphaned: false }, true)).toBe("error");
  });

  test("running when no tail and socket still connected", () => {
    expect(deriveStatus({ hasTail: false, isError: false, isOrphaned: false }, true)).toBe(
      "running",
    );
  });

  test("interrupted when no tail and socket disconnected (may reconnect)", () => {
    expect(deriveStatus({ hasTail: false, isError: false, isOrphaned: false }, false)).toBe(
      "interrupted",
    );
  });

  test("orphaned takes precedence (session ended, result never coming)", () => {
    expect(deriveStatus({ hasTail: false, isError: false, isOrphaned: true }, true)).toBe(
      "orphaned",
    );
    expect(deriveStatus({ hasTail: false, isError: false, isOrphaned: true }, false)).toBe(
      "orphaned",
    );
  });
});

// A subagent's assistant turn inside an Agent body: linked via
// parent_tool_use_id, with its own message.id (same id → merge) and tool_use.
const agentBodyAssistant = (
  uuid: string,
  parentToolUseId: string,
  messageId: string,
  blocks: Array<
    | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
    | { type: "text"; text: string }
  >,
): SessionStreamServerMessage =>
  ({
    type: "assistant",
    uuid,
    parent_tool_use_id: parentToolUseId,
    message: { id: messageId, role: "assistant", content: blocks },
  }) as unknown as SessionStreamServerMessage;

// A subagent's tool_result inside an Agent body (result of the subagent's
// own tool call, NOT the Agent itself).
const agentBodyToolResult = (
  uuid: string,
  parentToolUseId: string,
  toolUseId: string,
  content: string,
  isError = false,
): SessionStreamServerMessage =>
  ({
    type: "user",
    uuid,
    parent_tool_use_id: parentToolUseId,
    message: {
      role: "user",
      content: [{ type: "tool_result", tool_use_id: toolUseId, content, is_error: isError }],
    },
  }) as unknown as SessionStreamServerMessage;

// The subagent's prompt echo: a user-text body message (its instructions).
const agentPromptEcho = (
  uuid: string,
  parentToolUseId: string,
  text: string,
): SessionStreamServerMessage =>
  ({
    type: "user",
    uuid,
    parent_tool_use_id: parentToolUseId,
    message: { role: "user", content: [{ type: "text", text }] },
  }) as unknown as SessionStreamServerMessage;

// The Agent's own tail: a top-level user tool_result for the Agent tool_use,
// carrying the tool_use_result envelope (final stats + full content).
const agentTail = (
  toolUseId: string,
  envelope: Record<string, unknown>,
): SessionStreamServerMessage =>
  ({
    type: "user",
    message: {
      role: "user",
      content: [{ type: "tool_result", tool_use_id: toolUseId, content: "final summary" }],
    },
    tool_use_result: envelope,
  }) as unknown as SessionStreamServerMessage;

describe("agent-container pipeline", () => {
  test("body assistants merge by message.id, tool_results pair, tail envelope surfaces", () => {
    const raw: SessionStreamServerMessage[] = [
      user([{ type: "text", text: "plan it" }]),
      assistant("a1", [
        {
          type: "tool_use",
          id: "agent-1",
          name: "Agent",
          input: { subagent_type: "Plan", description: "Plan X" },
        },
      ]),
      agentPromptEcho("echo-1", "agent-1", "Design the plan"),
      agentBodyAssistant("b1", "agent-1", "turn-A", [
        { type: "tool_use", id: "bash-1", name: "Bash", input: { command: "ls" } },
      ]),
      agentBodyAssistant("b2", "agent-1", "turn-A", [
        { type: "tool_use", id: "bash-2", name: "Bash", input: { command: "pwd" } },
      ]),
      agentBodyToolResult("r1", "agent-1", "bash-1", "file1\nfile2"),
      agentTail("agent-1", {
        status: "completed",
        agentType: "Plan",
        totalTokens: 44129,
        totalToolUseCount: 16,
        totalDurationMs: 166761,
        content: [{ type: "text", text: "full plan body" }],
      }),
      result("success"),
    ];

    const items = normalizeChatStream(raw);
    const agentPart = items
      .flatMap((i) => (i.kind === "assistant" ? i.parts : []))
      .find((p) => p.type === "tool-call" && p.toolCallId === "agent-1") as
      | ({ type: "tool-call" } & { hasAgentBody?: boolean; bodyChildUuids?: string[] })
      | undefined;
    expect(agentPart).toBeDefined();
    expect(agentPart?.hasAgentBody).toBe(true);
    // Prompt echo and the body tool_result are NOT body children — only the
    // subagent's assistant turns are.
    expect(agentPart?.bodyChildUuids).toEqual(["b1", "b2"]);

    // bash-1 and bash-2 share message.id "turn-A" → one merged assistant item.
    const bodyItems = items.filter(
      (i) => i.kind === "assistant" && i.bodyParentToolUseId === "agent-1",
    );
    expect(bodyItems.length).toBe(1);
    const merged = bodyItems[0] as {
      kind: "assistant";
      parts: Array<{ type: string; toolCallId?: string; result?: string }>;
    };
    expect(merged.parts.filter((p) => p.type === "tool-call").length).toBe(2);
    // bash-1's result paired via extractToolResults.
    const bash1 = merged.parts.find((p) => p.toolCallId === "bash-1");
    expect(bash1?.result).toBe("file1\nfile2");

    const rendered = renderChatStream(items);
    const container = rendered.find(
      (m) =>
        (m.metadata?.custom as Record<string, unknown> | undefined)?.systemMessageType ===
        "agent-container",
    );
    expect(container).toBeDefined();
    const custom = container?.metadata?.custom as Record<string, unknown>;
    expect(custom.subagentType).toBe("Plan");
    expect(custom.description).toBe("Plan X");
    expect(custom.tailResult).toBe("final summary");
    expect(custom.tailContent).toBe("full plan body");
    expect((custom.tailStats as Record<string, unknown>).totalTokens).toBe(44129);
    // The merged item renders as two tool-cards; both belong in the body.
    const bodyIndices = custom.bodyIndices as number[];
    expect(bodyIndices.length).toBe(2);
    for (const idx of bodyIndices) {
      const childCustom = rendered[idx]?.metadata?.custom as Record<string, unknown> | undefined;
      expect(childCustom?.absorbed).toBe(true);
    }
  });

  test("prompt echo is suppressed from the stream but kept on the Agent part for debug", () => {
    const raw: SessionStreamServerMessage[] = [
      user([{ type: "text", text: "go" }]),
      assistant("a1", [
        {
          type: "tool_use",
          id: "agent-1",
          name: "Agent",
          input: { subagent_type: "Plan", description: "D" },
        },
      ]),
      agentPromptEcho("echo-1", "agent-1", "the subagent prompt"),
      user([{ type: "tool_result", tool_use_id: "agent-1", content: "done" }]),
      result("success"),
    ];
    const items = normalizeChatStream(raw);
    // No standalone user-prompt item for the echo.
    const echoItem = items.find(
      (i) => i.kind === "user-prompt" && i.text === "the subagent prompt",
    );
    expect(echoItem).toBeUndefined();
    // The echo raw is attached to the Agent part for the debug tooltip.
    const agentPart = items
      .flatMap((i) => (i.kind === "assistant" ? i.parts : []))
      .find((p) => p.type === "tool-call" && p.toolCallId === "agent-1") as
      | ({ type: "tool-call" } & { rawSnapshots?: SessionStreamServerMessage[] })
      | undefined;
    expect(
      (agentPart?.rawSnapshots ?? []).some((m) => (m as Record<string, unknown>).uuid === "echo-1"),
    ).toBe(true);
  });

  test("non-Agent tool_use does not become an agent-container", () => {
    const raw: SessionStreamServerMessage[] = [
      user([{ type: "text", text: "do it" }]),
      assistant("a1", [
        { type: "tool_use", id: "read-1", name: "Read", input: { file_path: "/x" } },
      ]),
      agentPromptEcho("child-1", "read-1", "stray parent_tool_use_id text"),
      user([{ type: "tool_result", tool_use_id: "read-1", content: "content" }]),
      result("success"),
    ];
    const items = normalizeChatStream(raw);
    const readPart = items
      .flatMap((i) => (i.kind === "assistant" ? i.parts : []))
      .find((p) => p.type === "tool-call" && p.toolCallId === "read-1") as
      | ({ type: "tool-call" } & { hasAgentBody?: boolean })
      | undefined;
    expect(readPart?.hasAgentBody).not.toBe(true);

    const rendered = renderChatStream(items);
    const container = rendered.find(
      (m) =>
        (m.metadata?.custom as Record<string, unknown> | undefined)?.systemMessageType ===
        "agent-container",
    );
    expect(container).toBeUndefined();
  });
});

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

  test("system message maps to system role with type summary", () => {
    const msg = {
      type: "system",
      subtype: "init",
      model: "sonnet",
    } as unknown as SessionStreamServerMessage;
    const result = messageToThreadLike(msg);
    expect(result.role).toBe("system");
    const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
    expect(text).toContain("system");
    expect(text).toContain("init");
  });

  test("result message maps to system role with type summary", () => {
    const msg = {
      type: "result",
      subtype: "success",
    } as unknown as SessionStreamServerMessage;
    const result = messageToThreadLike(msg);
    expect(result.role).toBe("system");
    const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
    expect(text).toContain("result");
    expect(text).toContain("success");
  });

  test("last-prompt returns null (scalar state only, never rendered)", () => {
    const msg = {
      type: "last-prompt",
      lastPrompt: "继续",
      leafUuid: "abc-123",
      sessionId: "s1",
    } as unknown as SessionStreamServerMessage;
    const result = messageToThreadLike(msg);
    expect(result).toBeNull();
  });
});

// ── processMessage building blocks ───────────────────────────────────

describe("message processing building blocks", () => {
  test("converts assistant message with content block decomposition", () => {
    const msg = {
      type: "assistant",
      userType: "external",
      message: { id: "m1", role: "assistant", content: [{ type: "text", text: "hello" }] },
    } as unknown as SessionStreamServerMessage;
    const result = convertContentToBubble(msg);
    expect(result).toBeDefined();
    expect(result?.role).toBe("assistant");
  });

  test("renders user message with text content", () => {
    const msg = {
      type: "user",
      userType: "external",
      message: {
        role: "user",
        content: [{ type: "text", text: "hello world" }],
      },
    } as unknown as SessionStreamServerMessage;
    const result = convertContentToBubble(msg);
    expect(result).toBeDefined();
    expect(result?.role).toBe("user");
    expect(result?.content).toBe("hello world");
  });

  test("convertContentToBubble returns null for user message with only tool_result", () => {
    const msg = {
      type: "user",
      userType: "external",
      message: {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "tu-1", content: "result" }],
      },
    } as unknown as SessionStreamServerMessage;
    expect(convertContentToBubble(msg)).toBeNull();
  });

  test("convertContentToBubble renders hybrid text+tool_result as text-only bubble", () => {
    const msg = {
      type: "user",
      userType: "external",
      message: {
        role: "user",
        content: [
          { type: "text", text: "Continue from where you left off." },
          { type: "tool_result", tool_use_id: "tu-1", content: "output" },
        ],
      },
    } as unknown as SessionStreamServerMessage;
    const result = convertContentToBubble(msg);
    expect(result).toBeDefined();
    expect(result?.role).toBe("user");
    expect(result?.content).toBe("Continue from where you left off.");
  });

  test("convertContentToBubble returns null for user message with empty content", () => {
    const msg = {
      type: "user",
      userType: "external",
      message: { role: "user", content: [] },
    } as unknown as SessionStreamServerMessage;
    expect(convertContentToBubble(msg)).toBeNull();
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

  test("extractTaskOps returns empty for non-assistant", () => {
    const msg = {
      type: "user",
      message: {
        id: "m1",
        role: "user",
        content: [{ type: "text", text: "hello" }],
      },
    } as unknown as SessionStreamServerMessage;
    expect(extractTaskOps(msg)).toEqual([]);
  });

  test("extractTaskOps handles assistant without userType", () => {
    const msg = {
      type: "assistant",
      message: {
        id: "m1",
        role: "assistant",
        content: [{ type: "tool_use", id: "tu-1", name: "TaskCreate", input: {} }],
      },
    } as unknown as SessionStreamServerMessage;
    const ops = extractTaskOps(msg);
    expect(ops).toHaveLength(1);
    expect(ops[0].subtype).toBe("task_started");
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

  test("hasToolUseNamed returns false for non-assistant", () => {
    const msg = {
      type: "user",
      message: {
        id: "m1",
        role: "user",
        content: [{ type: "text", text: "EnterPlanMode" }],
      },
    } as unknown as SessionStreamServerMessage;
    expect(hasToolUseNamed(msg, "EnterPlanMode")).toBe(false);
  });

  test("hasToolUseNamed detects tool use without userType", () => {
    const msg = {
      type: "assistant",
      message: {
        id: "m1",
        role: "assistant",
        content: [{ type: "tool_use", id: "tu-1", name: "EnterPlanMode", input: {} }],
      },
    } as unknown as SessionStreamServerMessage;
    expect(hasToolUseNamed(msg, "EnterPlanMode")).toBe(true);
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

  test("isExternalApiErrorMessage true when userType missing (structural detection)", () => {
    const m = apiErrorMsg();
    delete (m as Record<string, unknown>).userType;
    expect(isExternalApiErrorMessage(m)).toBe(true);
  });

  test("isExternalApiErrorMessage false for normal assistant without userType", () => {
    const m = normalExternalAssistant();
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
  test("live_start → null", () => {
    expect(messageToThreadLike(marker("live_start"))).toBeNull();
  });
  test("live_end → null", () => {
    expect(messageToThreadLike(marker("live_end"))).toBeNull();
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

  test("live kind is preserved", () => {
    const d = makeBoundaryDivider("live");
    const custom = d.metadata?.custom as Record<string, unknown>;
    expect(custom.batchBoundary).toBe("live");
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

// ── tool_result matching helpers ──────────────────────────────────────

describe("extractToolResults", () => {
  test("extracts tool_use_id, content, isError from string content", () => {
    const msg = user([{ type: "tool_result", tool_use_id: "tu-1", content: "hello" }]);
    const results = extractToolResults(msg);
    expect(results).toEqual([{ toolUseId: "tu-1", content: "hello", isError: false }]);
  });

  test("joins array-of-text content with newlines", () => {
    const msg = {
      type: "user",
      message: {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "tu-1",
            content: [
              { type: "text", text: "line1" },
              { type: "text", text: "line2" },
            ],
          },
        ],
      },
    } as unknown as SessionStreamServerMessage;
    const results = extractToolResults(msg);
    expect(results).toEqual([{ toolUseId: "tu-1", content: "line1\nline2", isError: false }]);
  });

  test("empty content falls back to 'Tool result'", () => {
    const msg = user([{ type: "tool_result", tool_use_id: "tu-1", content: "" }]);
    expect(extractToolResults(msg)[0]?.content).toBe("Tool result");
  });

  test("is_error flag is captured", () => {
    const msg = user([
      { type: "tool_result", tool_use_id: "tu-1", content: "err", is_error: true },
    ]);
    expect(extractToolResults(msg)[0]?.isError).toBe(true);
  });

  test("returns empty for text-only user message", () => {
    const msg = user([{ type: "text", text: "hello" }]);
    expect(extractToolResults(msg)).toEqual([]);
  });

  test("returns empty for non-user type", () => {
    expect(extractToolResults({ type: "assistant" } as SessionStreamServerMessage)).toEqual([]);
  });

  test("skips blocks without string tool_use_id", () => {
    const msg = user([
      { type: "tool_result", content: "orphan" } as unknown as {
        type: "tool_result";
        tool_use_id: string;
        content: string;
      },
    ]);
    expect(extractToolResults(msg)).toEqual([]);
  });

  test("extracts multiple tool_results from one message", () => {
    const msg = user([
      { type: "tool_result", tool_use_id: "tu-a", content: "result A" },
      { type: "tool_result", tool_use_id: "tu-b", content: "result B" },
    ]);
    const results = extractToolResults(msg);
    expect(results).toHaveLength(2);
    expect(results[0]?.toolUseId).toBe("tu-a");
    expect(results[1]?.toolUseId).toBe("tu-b");
  });
});

describe("applyToolResultsToMessages", () => {
  const makeToolCallBubble = (toolCallId: string): ThreadMessageLike => ({
    role: "assistant",
    content: [
      { type: "text" as const, text: "...thinking..." },
      { type: "tool-call" as const, toolCallId, toolName: "Bash", args: {}, argsText: "{}" },
    ],
    metadata: { custom: {} },
  });

  test("matches tool_result to tool-call and sets result", () => {
    const messages = [makeToolCallBubble("tu-1")];
    const results: ExtractedToolResult[] = [
      { toolUseId: "tu-1", content: "file contents", isError: false },
    ];
    const { messages: applied, appliedCount } = applyToolResultsToMessages(messages, results);
    expect(appliedCount).toBe(1);
    const content = applied[0]?.content as Array<{ result?: string }>;
    expect(content[1]?.result).toBe("file contents");
  });

  test("sets isError when is_error is true", () => {
    const messages = [makeToolCallBubble("tu-1")];
    const results: ExtractedToolResult[] = [
      { toolUseId: "tu-1", content: "failed", isError: true },
    ];
    const { messages: applied } = applyToolResultsToMessages(messages, results);
    const content = applied[0]?.content as Array<{ isError?: boolean }>;
    expect(content[1]?.isError).toBe(true);
  });

  test("backtracks through multiple messages to find matching tool-call", () => {
    const messages = [
      makeToolCallBubble("tu-old"),
      { role: "assistant", content: [{ type: "text", text: "no tool-call here" }] },
      makeToolCallBubble("tu-target"),
    ];
    const results: ExtractedToolResult[] = [
      { toolUseId: "tu-old", content: "old result", isError: false },
    ];
    const { messages: applied, appliedCount } = applyToolResultsToMessages(messages, results);
    expect(appliedCount).toBe(1);
    // Should update the first message (backtracks past the later ones)
    const content = applied[0]?.content as Array<{ result?: string }>;
    expect(content[1]?.result).toBe("old result");
  });

  test("multiple results in one call all attach (parallel tools)", () => {
    const messages = [
      {
        role: "assistant" as const,
        content: [
          { type: "text" as const, text: "..." },
          {
            type: "tool-call" as const,
            toolCallId: "tu-a",
            toolName: "ToolA",
            args: {},
            argsText: "{}",
          },
          {
            type: "tool-call" as const,
            toolCallId: "tu-b",
            toolName: "ToolB",
            args: {},
            argsText: "{}",
          },
        ],
        metadata: { custom: {} },
      },
    ];
    const results: ExtractedToolResult[] = [
      { toolUseId: "tu-a", content: "result A", isError: false },
      { toolUseId: "tu-b", content: "result B", isError: false },
    ];
    const { messages: applied, appliedCount } = applyToolResultsToMessages(messages, results);
    expect(appliedCount).toBe(2);
    const content = applied[0]?.content as Array<{ result?: string }>;
    expect(content[1]?.result).toBe("result A");
    expect(content[2]?.result).toBe("result B");
  });

  test("returns unchanged reference + appliedCount 0 when no match", () => {
    const messages = [makeToolCallBubble("tu-1")];
    const results: ExtractedToolResult[] = [
      { toolUseId: "tu-missing", content: "orphan", isError: false },
    ];
    const { messages: applied, appliedCount } = applyToolResultsToMessages(messages, results);
    expect(appliedCount).toBe(0);
    expect(applied).toBe(messages);
  });

  test("no-op when results is empty", () => {
    const messages = [makeToolCallBubble("tu-1")];
    const { messages: applied, appliedCount } = applyToolResultsToMessages(messages, []);
    expect(appliedCount).toBe(0);
    expect(applied).toBe(messages);
  });

  test("clears isOrphaned when setting result (self-heal)", () => {
    const messages: ThreadMessageLike[] = [
      {
        role: "assistant",
        content: [
          { type: "tool-call", toolCallId: "tu-heal", toolName: "Ask", args: {}, isOrphaned: true },
        ],
      },
    ];
    const results: ExtractedToolResult[] = [
      { toolUseId: "tu-heal", content: "late result", isError: false },
    ];
    const { messages: applied, appliedCount } = applyToolResultsToMessages(messages, results);
    expect(appliedCount).toBe(1);
    const content = applied[0]?.content as Array<Record<string, unknown>>;
    expect(content[0].result).toBe("late result");
    expect(content[0].isOrphaned).toBeUndefined();
  });
});

describe("markOrphanedToolCalls", () => {
  const makeToolCallPart = (overrides: Record<string, unknown> = {}) => ({
    type: "tool-call" as const,
    toolCallId: "tu-1",
    toolName: "Read",
    args: {} as Record<string, unknown>,
    ...overrides,
  });

  const msg = (parts: Record<string, unknown>[]): ThreadMessageLike => ({
    role: "assistant",
    content: parts as unknown as ThreadMessageLike["content"],
  });

  test("marks tool-call parts with no result as orphaned", () => {
    const messages: ThreadMessageLike[] = [msg([makeToolCallPart()])];
    const { messages: next, changed } = markOrphanedToolCalls(messages);
    expect(changed).toBe(true);
    const firstMsg = next[0];
    expect(firstMsg).toBeDefined();
    const part = (firstMsg!.content as Array<Record<string, unknown>>)[0];
    expect(part.isOrphaned).toBe(true);
  });

  test("skips tool-call parts that already have a result", () => {
    const messages: ThreadMessageLike[] = [msg([makeToolCallPart({ result: "file contents" })])];
    const { changed } = markOrphanedToolCalls(messages);
    expect(changed).toBe(false);
  });

  test("skips tool-call parts with isError", () => {
    const messages: ThreadMessageLike[] = [msg([makeToolCallPart({ isError: true })])];
    const { changed } = markOrphanedToolCalls(messages);
    expect(changed).toBe(false);
  });

  test("idempotent — already-orphaned stays orphaned", () => {
    const messages: ThreadMessageLike[] = [msg([makeToolCallPart({ isOrphaned: true })])];
    const { changed } = markOrphanedToolCalls(messages);
    expect(changed).toBe(false);
  });

  test("returns unchanged reference when nothing to mark", () => {
    const messages: ThreadMessageLike[] = [
      msg([makeToolCallPart({ result: "done" }), makeToolCallPart({ isError: true })]),
    ];
    const { messages: next, changed } = markOrphanedToolCalls(messages);
    expect(changed).toBe(false);
    expect(next).toBe(messages);
  });

  test("skips non-assistant messages", () => {
    const messages: ThreadMessageLike[] = [
      { role: "user", content: "hello" },
      { role: "system", content: "init" },
    ];
    const { changed } = markOrphanedToolCalls(messages);
    expect(changed).toBe(false);
  });
});

// ── Attachment subtype dispatch ───────────────────────────────────────

describe("handleAttachment", () => {
  test("plan_mode returns stateOps.permissionMode=plan and bubble", () => {
    const msg = attachment("plan_mode");
    const result = handleAttachment(msg);
    expect(result.stateOps?.permissionMode).toBe("plan");
    expect(result.bubble).toBeDefined();
    expect(result.bubble?.role).toBe("system");
  });

  test("plan_mode_exit returns bubble without permissionMode override", () => {
    const result = handleAttachment(attachment("plan_mode_exit"));
    expect(result.stateOps?.permissionMode).toBeUndefined();
    expect(result.bubble).toBeDefined();
  });

  test("plan_mode_reentry returns stateOps.permissionMode=plan and bubble", () => {
    const result = handleAttachment(attachment("plan_mode_reentry"));
    expect(result.stateOps?.permissionMode).toBe("plan");
    expect(result.bubble).toBeDefined();
  });

  test("auto_mode returns stateOps.permissionMode=auto and bubble", () => {
    const result = handleAttachment(attachment("auto_mode"));
    expect(result.stateOps?.permissionMode).toBe("auto");
    expect(result.bubble).toBeDefined();
  });

  test("auto_mode_exit returns stateOps.permissionMode=default and bubble", () => {
    const result = handleAttachment(attachment("auto_mode_exit"));
    expect(result.stateOps?.permissionMode).toBe("default");
    expect(result.bubble).toBeDefined();
  });

  test("task_reminder returns replaceTasks with mapped TaskInfo entries", () => {
    const result = handleAttachment(
      attachment("task_reminder", {
        content: [
          { id: "t1", subject: "Fix bug", status: "running" },
          { id: "t2", subject: "Add feature", status: "completed" },
        ],
      }),
    );
    expect(result.stateOps?.replaceTasks).toHaveLength(2);
    expect(result.stateOps?.replaceTasks?.[0].id).toBe("t1");
    expect(result.stateOps?.replaceTasks?.[0].kind).toBe("task");
    expect(result.stateOps?.replaceTasks?.[1].status).toBe("completed");
    expect(result.bubble).toBeUndefined();
  });

  test("task_status returns taskStatus stateOps with normalized fields", () => {
    const result = handleAttachment(
      attachment("task_status", {
        taskId: "t42",
        taskType: "agent",
        description: "Run tests",
        status: "completed",
      }),
    );
    expect(result.stateOps?.taskStatus?.id).toBe("t42");
    expect(result.stateOps?.taskStatus?.taskType).toBe("agent");
    expect(result.stateOps?.taskStatus?.status).toBe("completed");
    expect(result.bubble).toBeUndefined();
  });

  test("skill_listing parses markdown bullet list into skills array", () => {
    const result = handleAttachment(
      attachment("skill_listing", {
        content: "- skill-a: description\n- skill-b: another\n- skill-c: third",
      }),
    );
    expect(result.stateOps?.skills).toEqual(["skill-a", "skill-b", "skill-c"]);
    expect(result.bubble).toBeUndefined();
  });

  test("mcp_instructions_delta returns mcpServersAdd with addedNames", () => {
    const result = handleAttachment(
      attachment("mcp_instructions_delta", {
        addedNames: ["server1", "server2"],
        addedBlocks: [],
      }),
    );
    expect(result.stateOps?.mcpServersAdd).toEqual(["server1", "server2"]);
    expect(result.bubble).toBeUndefined();
  });

  test("command_permissions returns slashCommands with allowedTools", () => {
    const result = handleAttachment(
      attachment("command_permissions", {
        allowedTools: ["Bash", "Read", "Edit"],
        allowedToolsWithContext: [],
        deniedTools: [],
      }),
    );
    expect(result.stateOps?.slashCommands).toEqual(["Bash", "Read", "Edit"]);
    expect(result.bubble).toBeUndefined();
  });

  test("invoked_skills returns skillsAdd with skill names", () => {
    const result = handleAttachment(
      attachment("invoked_skills", {
        skills: [{ name: "my-skill", path: "/tmp/skill.md" }],
      }),
    );
    expect(result.stateOps?.skillsAdd).toEqual(["my-skill"]);
    expect(result.bubble).toBeUndefined();
  });

  test("file returns bubble without stateOps", () => {
    const result = handleAttachment(
      attachment("file", {
        filename: "/home/project/src/main.ts",
        displayPath: "src/main.ts",
        content: {
          type: "text",
          file: {
            filePath: "/home/project/src/main.ts",
            content: "export function hello() {\n  return 'world';\n}",
            numLines: 3,
            startLine: 1,
            totalLines: 3,
          },
        },
      }),
    );
    expect(result.stateOps).toBeUndefined();
    expect(result.bubble).toBeDefined();
    const custom = result.bubble?.metadata?.custom as Record<string, unknown> | undefined;
    expect(custom?.attachmentType).toBe("file");

    // Verify _raw structure for the bubble renderer
    const raw = custom?._raw as Record<string, unknown> | undefined;
    const att = raw?.attachment as Record<string, unknown> | undefined;
    expect(att?.displayPath).toBe("src/main.ts");
    expect(att?.filename).toBe("/home/project/src/main.ts");
    const inner = att?.content as Record<string, unknown> | undefined;
    const fileData = inner?.file as Record<string, unknown> | undefined;
    expect(fileData?.content).toBe("export function hello() {\n  return 'world';\n}");
    expect(fileData?.numLines).toBe(3);
  });

  test("edited_text_file returns bubble with filename and snippet in _raw", () => {
    const result = handleAttachment(
      attachment("edited_text_file", {
        filename: "/home/project/src/edited.ts",
        snippet: "const x = 1;\nconst y = 2;",
      }),
    );
    expect(result.stateOps).toBeUndefined();
    expect(result.bubble).toBeDefined();
    const custom = result.bubble?.metadata?.custom as Record<string, unknown> | undefined;
    expect(custom?.attachmentType).toBe("edited_text_file");
    const att = (custom?._raw as Record<string, unknown>)?.attachment as Record<string, unknown>;
    expect(att?.filename).toBe("/home/project/src/edited.ts");
    expect(att?.snippet).toBe("const x = 1;\nconst y = 2;");
  });

  test("compact_file_reference returns bubble without body (single-line)", () => {
    const result = handleAttachment(
      attachment("compact_file_reference", {
        filename: "/home/project/src/compact.ts",
        displayPath: "src/compact.ts",
      }),
    );
    expect(result.stateOps).toBeUndefined();
    expect(result.bubble).toBeDefined();
    const custom = result.bubble?.metadata?.custom as Record<string, unknown> | undefined;
    expect(custom?.attachmentType).toBe("compact_file_reference");
    const att = (custom?._raw as Record<string, unknown>)?.attachment as Record<string, unknown>;
    expect(att?.displayPath).toBe("src/compact.ts");
    expect(att?.filename).toBe("/home/project/src/compact.ts");
  });

  test("plan_file_reference returns bubble with planFilePath and planContent in _raw", () => {
    const result = handleAttachment(
      attachment("plan_file_reference", {
        planFilePath: "/home/.claude/plans/my-plan.md",
        planContent: "# My Plan\n\n## Context\n...",
      }),
    );
    expect(result.stateOps).toBeUndefined();
    expect(result.bubble).toBeDefined();
    const custom = result.bubble?.metadata?.custom as Record<string, unknown> | undefined;
    expect(custom?.attachmentType).toBe("plan_file_reference");
    const att = (custom?._raw as Record<string, unknown>)?.attachment as Record<string, unknown>;
    expect(att?.planFilePath).toBe("/home/.claude/plans/my-plan.md");
    expect(att?.planContent).toBe("# My Plan\n\n## Context\n...");
  });

  test("hook_success returns bubble with attachmentType", () => {
    const result = handleAttachment(
      attachment("hook_success", { hookName: "pre-commit", exitCode: 0, durationMs: 42 }),
    );
    expect(result.stateOps).toBeUndefined();
    expect(result.bubble).toBeDefined();
    const custom = result.bubble?.metadata?.custom as Record<string, unknown> | undefined;
    expect(custom?.attachmentType).toBe("hook_success");
  });

  test("hook_non_blocking_error returns bubble with accent/error fields", () => {
    const result = handleAttachment(
      attachment("hook_non_blocking_error", {
        hookName: "Stop",
        hookEvent: "Stop",
        exitCode: 1,
        stderr: "JSON validation failed",
        durationMs: 20177,
      }),
    );
    expect(result.stateOps).toBeUndefined();
    expect(result.bubble).toBeDefined();
    const custom = result.bubble?.metadata?.custom as Record<string, unknown> | undefined;
    expect(custom?.attachmentType).toBe("hook_non_blocking_error");
    // The raw attachment data is passed through so the bubble config can read accent/error fields
    const raw = custom?._raw as Record<string, unknown> | undefined;
    const att = raw?.attachment as Record<string, unknown> | undefined;
    expect(att?.hookName).toBe("Stop");
    expect(att?.exitCode).toBe(1);
    expect(att?.stderr).toBe("JSON validation failed");
  });

  test("date_change returns bubble with newDate in _raw", () => {
    const result = handleAttachment(attachment("date_change", { newDate: "2026-05-29" }));
    expect(result.stateOps).toBeUndefined();
    expect(result.bubble).toBeDefined();
    const custom = result.bubble?.metadata?.custom as Record<string, unknown> | undefined;
    expect(custom?.attachmentType).toBe("date_change");
    const att = (custom?._raw as Record<string, unknown>)?.attachment as Record<string, unknown>;
    expect(att?.newDate).toBe("2026-05-29");
  });

  test("queued_command returns bubble with prompt in _raw", () => {
    const result = handleAttachment(
      attachment("queued_command", {
        prompt: "完成本change之后，你需要汇报给我...",
        commandMode: "prompt",
      }),
    );
    expect(result.stateOps).toBeUndefined();
    expect(result.bubble).toBeDefined();
    const custom = result.bubble?.metadata?.custom as Record<string, unknown> | undefined;
    expect(custom?.attachmentType).toBe("queued_command");
    const att = (custom?._raw as Record<string, unknown>)?.attachment as Record<string, unknown>;
    expect(att?.prompt).toBe("完成本change之后，你需要汇报给我...");
    expect(att?.commandMode).toBe("prompt");
  });

  test("opened_file_in_ide returns bubble with filename in _raw", () => {
    const result = handleAttachment(
      attachment("opened_file_in_ide", {
        filename: "/home/deploy/workspace/agents-remote/.workflow/versions/index.md",
      }),
    );
    expect(result.stateOps).toBeUndefined();
    expect(result.bubble).toBeDefined();
    const custom = result.bubble?.metadata?.custom as Record<string, unknown> | undefined;
    expect(custom?.attachmentType).toBe("opened_file_in_ide");
    const att = (custom?._raw as Record<string, unknown>)?.attachment as Record<string, unknown>;
    expect(att?.filename).toBe("/home/deploy/workspace/agents-remote/.workflow/versions/index.md");
  });

  test("selected_lines_in_ide returns bubble with lineStart/lineEnd/content in _raw", () => {
    const result = handleAttachment(
      attachment("selected_lines_in_ide", {
        ideName: "Visual Studio Code",
        filename: "Untitled-1",
        displayPath: "Untitled-1",
        lineStart: 0,
        lineEnd: 3,
        content: "新增两个需要优化的内容...",
      }),
    );
    expect(result.stateOps).toBeUndefined();
    expect(result.bubble).toBeDefined();
    const custom = result.bubble?.metadata?.custom as Record<string, unknown> | undefined;
    expect(custom?.attachmentType).toBe("selected_lines_in_ide");
    const att = (custom?._raw as Record<string, unknown>)?.attachment as Record<string, unknown>;
    expect(att?.lineStart).toBe(0);
    expect(att?.lineEnd).toBe(3);
    expect(att?.content).toBe("新增两个需要优化的内容...");
    expect(att?.displayPath).toBe("Untitled-1");
  });

  test("diagnostics returns bubble with files[] structure in _raw", () => {
    const result = handleAttachment(
      attachment("diagnostics", {
        files: [
          {
            uri: "file:///home/deploy/workspace/agents-remote/web/src/routes/SessionDetailRoute.tsx",
            diagnostics: [
              {
                message: '"FormEvent"已弃用。',
                severity: "Hint",
                range: {
                  start: { line: 1673, character: 20 },
                  end: { line: 1673, character: 46 },
                },
                source: "ts",
                code: "6385",
              },
            ],
          },
        ],
        isNew: true,
      }),
    );
    expect(result.stateOps).toBeUndefined();
    expect(result.bubble).toBeDefined();
    const custom = result.bubble?.metadata?.custom as Record<string, unknown> | undefined;
    expect(custom?.attachmentType).toBe("diagnostics");
    const att = (custom?._raw as Record<string, unknown>)?.attachment as Record<string, unknown>;
    expect(att?.isNew).toBe(true);
    const files = att?.files as Array<Record<string, unknown>> | undefined;
    expect(files).toHaveLength(1);
    expect(files?.[0].uri).toBe(
      "file:///home/deploy/workspace/agents-remote/web/src/routes/SessionDetailRoute.tsx",
    );
    const diags = files?.[0].diagnostics as Array<Record<string, unknown>> | undefined;
    expect(diags).toHaveLength(1);
    expect(diags?.[0].message).toBe('"FormEvent"已弃用。');
    expect(diags?.[0].severity).toBe("Hint");
    const range = diags?.[0].range as Record<string, unknown> | undefined;
    expect((range?.start as Record<string, number>)?.line).toBe(1673);
    expect((range?.start as Record<string, number>)?.character).toBe(20);
  });

  test("goal_status returns bubble with met/sentinel/condition in _raw", () => {
    const resultIncomplete = handleAttachment(
      attachment("goal_status", {
        met: false,
        sentinel: true,
        condition: "使用step-change技能来完成所有change",
      }),
    );
    expect(resultIncomplete.stateOps).toBeUndefined();
    expect(resultIncomplete.bubble).toBeDefined();
    const custom = resultIncomplete.bubble?.metadata?.custom as Record<string, unknown> | undefined;
    expect(custom?.attachmentType).toBe("goal_status");
    const att = (custom?._raw as Record<string, unknown>)?.attachment as Record<string, unknown>;
    expect(att?.met).toBe(false);
    expect(att?.sentinel).toBe(true);
    expect(att?.condition).toBe("使用step-change技能来完成所有change");

    // met: true should not show "incomplete" in badge
    const resultDone = handleAttachment(
      attachment("goal_status", { met: true, sentinel: false, condition: "" }),
    );
    expect(resultDone.stateOps).toBeUndefined();
    expect(resultDone.bubble).toBeDefined();
  });

  test("unknown subtype returns placeholder bubble", () => {
    const result = handleAttachment(attachment("future-subtype"));
    expect(result.bubble).toBeDefined();
    expect(result.stateOps).toBeUndefined();
  });
});

// ── normalizeChatStream / renderChatStream Unit Tests ───────────────────
//
// The render pipeline is split into two pure layers:
//   normalizeChatStream — state/association (rawMessages → ChatStreamItem[]).
//   renderChatStream     — render (ChatStreamItem[] → ThreadMessageLike[]).
// Tests below cover each layer independently and the composition via the
// shared message builders.

const makeAssistant = (
  id: string,
  content: Array<
    | { type: "text"; text: string }
    | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  >,
  overrides: Record<string, unknown> = {},
): SessionStreamServerMessage =>
  ({
    type: "assistant",
    message: { id, role: "assistant", content },
    ...overrides,
  }) as unknown as SessionStreamServerMessage;

const makeUser = (
  content: string | Array<Record<string, unknown>>,
  overrides: Record<string, unknown> = {},
): SessionStreamServerMessage =>
  ({
    type: "user",
    message: {
      role: "user",
      content: typeof content === "string" ? [{ type: "text", text: content }] : content,
    },
    ...overrides,
  }) as unknown as SessionStreamServerMessage;

const makeBatchBoundary = (kind: "history" | "live" = "history"): SessionStreamServerMessage =>
  ({
    type: "system",
    subtype: "batch_boundary",
    batchKind: kind,
  }) as unknown as SessionStreamServerMessage;

const makeSystemInit = (overrides: Record<string, unknown> = {}): SessionStreamServerMessage =>
  ({
    type: "system",
    subtype: "init",
    model: "sonnet",
    permissionMode: "default",
    tools: ["bash"],
    skills: ["base-skill"],
    mcp_servers: [{ name: "srv" }],
    ...overrides,
  }) as unknown as SessionStreamServerMessage;

const makeApiError = (parentUuid: string, uuid = "err-uuid"): SessionStreamServerMessage =>
  ({
    type: "assistant",
    message: {
      id: "err-1",
      role: "assistant",
      model: "<synthetic>",
      content: [{ type: "text", text: "500 Request failed" }],
    },
    isApiErrorMessage: true,
    error: "server_error",
    uuid,
    parentUuid,
  }) as unknown as SessionStreamServerMessage;

const assistantItems = (items: ChatStreamItem[]) =>
  items.filter((i): i is Extract<ChatStreamItem, { kind: "assistant" }> => i.kind === "assistant");

// ── normalizeChatStream ───────────────────────────────────────────────

describe("normalizeChatStream", () => {
  test("empty rawMessages produces no items", () => {
    expect(normalizeChatStream([])).toHaveLength(0);
  });

  // ── Assistant accumulation (grouped by message.id) ──────────────────
  test("assistant deltas with the same message.id accumulate into ONE item", () => {
    const items = normalizeChatStream([
      makeAssistant("a1", [{ type: "text", text: "first" }]),
      makeAssistant("a1", [{ type: "text", text: "second" }]),
    ]);
    const asst = assistantItems(items);
    expect(asst).toHaveLength(1);
    const texts = asst[0].parts
      .filter((p) => p.type === "text")
      .map((p) => (p as { text: string }).text);
    expect(texts).toEqual(["first", "second"]);
  });

  test("a different message.id finalizes the current assistant and opens a new one", () => {
    const items = normalizeChatStream([
      makeAssistant("a1", [{ type: "text", text: "first" }]),
      makeAssistant("a2", [{ type: "text", text: "second" }]),
    ]);
    expect(assistantItems(items)).toHaveLength(2);
  });

  test("an empty assistant delta still produces an assistant item (preserves bubble on finalize)", () => {
    const items = normalizeChatStream([makeAssistant("a1", [])]);
    expect(assistantItems(items)).toHaveLength(1);
  });

  // ── Thinking tokens ─────────────────────────────────────────────────
  test("thinking_tokens stamps estimatedTokens into the current assistant item", () => {
    const items = normalizeChatStream([
      {
        type: "system",
        subtype: "thinking_tokens",
        estimated_tokens: 1500,
      } as unknown as SessionStreamServerMessage,
      makeAssistant("a1", [{ type: "text", text: "reply" }]),
    ]);
    const asst = assistantItems(items)[0];
    expect(asst.estimatedTokens).toBe(1500);
  });

  // ── Tool result → tool-call association ─────────────────────────────
  test("tool_result matches its tool-call part by tool_use_id (in-buffer)", () => {
    const items = normalizeChatStream([
      makeAssistant("a1", [{ type: "tool_use", id: "tu-1", name: "bash", input: {} }]),
      makeUser([{ type: "tool_result", tool_use_id: "tu-1", content: "output" }]),
    ]);
    const toolCall = assistantItems(items)[0].parts.find((p) => p.type === "tool-call") as Extract<
      NormalizedPart,
      { type: "tool-call" }
    >;
    expect(toolCall.result).toBe("output");
    expect(toolCall.isError).toBeUndefined();
  });

  test("tool_result matches an already-emitted assistant's tool-call", () => {
    // A second assistant delta (new message.id) flushes the first; the
    // tool_result that follows must still reach the flushed tool-call.
    const items = normalizeChatStream([
      makeAssistant("a1", [{ type: "tool_use", id: "tu-1", name: "bash", input: {} }]),
      makeAssistant("a2", [{ type: "text", text: "next response" }]),
      makeUser([{ type: "tool_result", tool_use_id: "tu-1", content: "delayed output" }]),
    ]);
    const first = assistantItems(items)[0];
    const toolCall = first.parts.find((p) => p.type === "tool-call") as Extract<
      NormalizedPart,
      { type: "tool-call" }
    >;
    expect(toolCall.result).toBe("delayed output");
  });

  // ── Skill body folding (live isSynthetic + JSONL isMeta paths) ──────
  test("synthetic skill body (isSynthetic + sourceToolUseID) folds into the tool-call", () => {
    const items = normalizeChatStream([
      makeAssistant("a1", [{ type: "tool_use", id: "tu-1", name: "skill", input: {} }]),
      makeUser([{ type: "text", text: "Base directory for this skill: /tmp/skill" }], {
        isSynthetic: true,
        sourceToolUseID: "tu-1",
      }),
    ]);
    const toolCall = assistantItems(items)[0].parts.find((p) => p.type === "tool-call") as Extract<
      NormalizedPart,
      { type: "tool-call" }
    >;
    expect(toolCall.skillContent).toContain("/tmp/skill");
  });

  test("meta skill body (isMeta + sourceToolUseID) folds into the tool-call", () => {
    const items = normalizeChatStream([
      makeAssistant("a1", [{ type: "tool_use", id: "tu-1", name: "skill", input: {} }]),
      makeUser([{ type: "text", text: "Base directory for this skill: /tmp/skill2" }], {
        isMeta: true,
        sourceToolUseID: "tu-1",
      }),
    ]);
    const toolCall = assistantItems(items)[0].parts.find((p) => p.type === "tool-call") as Extract<
      NormalizedPart,
      { type: "tool-call" }
    >;
    expect(toolCall.skillContent).toContain("/tmp/skill2");
  });

  // ── api_error → parent ──────────────────────────────────────────────
  test("api_error attaches to its parent assistant item", () => {
    const items = normalizeChatStream([
      makeApiError("parent-uuid", "e1"),
      makeAssistant("a1", [{ type: "text", text: "hello" }], { uuid: "parent-uuid" }),
    ]);
    expect(assistantItems(items)).toHaveLength(1);
    expect(assistantItems(items)[0].apiErrors).toHaveLength(1);
  });

  test("api_error whose parent never arrives stays unattached (no item produced)", () => {
    const items = normalizeChatStream([makeApiError("orphan-uuid", "e1")]);
    // No assistant item, no fallback — orphan errors are silently held.
    expect(items).toHaveLength(0);
  });

  // ── result ──────────────────────────────────────────────────────────
  test("a non-error result finalizes the assistant but emits no item", () => {
    const items = normalizeChatStream([
      makeAssistant("a1", [{ type: "text", text: "done" }]),
      {
        type: "result",
        subtype: "success",
        session_id: "s1",
        num_turns: 2,
      } as unknown as SessionStreamServerMessage,
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("assistant");
  });

  test("an error result emits a result-error item", () => {
    const items = normalizeChatStream([
      makeAssistant("a1", [{ type: "text", text: "partial" }]),
      {
        type: "result",
        subtype: "error",
        is_error: true,
        result: "something went wrong",
      } as unknown as SessionStreamServerMessage,
    ]);
    expect(items).toHaveLength(2);
    expect(items[1].kind).toBe("result-error");
    expect((items[1] as { text: string }).text).toBe("something went wrong");
  });

  // ── HiddenDropped ───────────────────────────────────────────────────
  test("hidden/internal messages with no association key are dropped", () => {
    const items = normalizeChatStream([
      makeAssistant("a1", [{ type: "text", text: "hidden" }], { isMeta: true }),
    ]);
    expect(assistantItems(items)).toHaveLength(0);
  });

  test("synthetic assistant (model=<synthetic>) produces no item", () => {
    const items = normalizeChatStream([
      {
        type: "assistant",
        message: {
          id: "synth",
          role: "assistant",
          model: "<synthetic>",
          content: [{ type: "text", text: "x" }],
        },
      } as unknown as SessionStreamServerMessage,
    ]);
    expect(items).toHaveLength(0);
  });

  test("task_started produces no item (scalar-only)", () => {
    const items = normalizeChatStream([
      {
        type: "system",
        subtype: "task_started",
        task_id: "t1",
        prompt: "do stuff",
      } as unknown as SessionStreamServerMessage,
    ]);
    expect(items).toHaveLength(0);
  });

  // ── user-prompt ─────────────────────────────────────────────────────
  test("user text produces a user-prompt item", () => {
    const items = normalizeChatStream([makeUser("hello world")]);
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("user-prompt");
    expect((items[0] as { text: string }).text).toBe("hello world");
  });

  test("user string-content produces a user-prompt item", () => {
    const items = normalizeChatStream([
      {
        type: "user",
        message: { role: "user", content: "a plain string" },
      } as unknown as SessionStreamServerMessage,
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("user-prompt");
  });

  test("hybrid user: tool_result + text produces both a tool match and a user-prompt item", () => {
    const items = normalizeChatStream([
      makeAssistant("a1", [{ type: "tool_use", id: "tu-1", name: "bash", input: {} }]),
      makeUser([
        { type: "tool_result", tool_use_id: "tu-1", content: "output" },
        { type: "text", text: "also text" },
      ]),
    ]);
    const hasUserPrompt = items.some((i) => i.kind === "user-prompt");
    expect(hasUserPrompt).toBe(true);
    const toolCall = assistantItems(items)[0].parts.find((p) => p.type === "tool-call") as Extract<
      NormalizedPart,
      { type: "tool-call" }
    >;
    expect(toolCall.result).toBe("output");
  });

  // ── system.init / compact ───────────────────────────────────────────
  test("system.init produces a session-init summary item", () => {
    const items = normalizeChatStream([makeSystemInit()]);
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("session-init");
  });

  test("compact_boundary produces a compact-boundary item", () => {
    const items = normalizeChatStream([
      {
        type: "system",
        subtype: "compact_boundary",
        compactMetadata: { trigger: "manual", preTokens: 50000 },
      } as unknown as SessionStreamServerMessage,
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("compact-boundary");
    expect((items[0] as { trigger: string }).trigger).toBe("manual");
    expect((items[0] as { preTokens: number }).preTokens).toBe(50000);
  });

  // ── batch-boundary passthrough ──────────────────────────────────────
  test("batch_boundary marker passes through as a batch-boundary item", () => {
    const items = normalizeChatStream([makeBatchBoundary("live")]);
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("batch-boundary");
    expect((items[0] as { batchKind: string }).batchKind).toBe("live");
  });

  // ── attachment ──────────────────────────────────────────────────────
  test("attachment that produces a bubble becomes an attachment item", () => {
    const items = normalizeChatStream([
      {
        type: "attachment",
        attachment: { type: "file", filePath: "/src/index.ts" },
        userType: "external",
      } as unknown as SessionStreamServerMessage,
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("attachment");
  });

  test("state-only attachment (e.g. skill_listing) produces no item", () => {
    const items = normalizeChatStream([
      {
        type: "attachment",
        attachment: { type: "skill_listing", content: "- skill: desc" },
        userType: "external",
      } as unknown as SessionStreamServerMessage,
    ]);
    expect(items).toHaveLength(0);
  });

  // ── fallback ────────────────────────────────────────────────────────
  test("unknown system message falls back to a fallback item", () => {
    const items = normalizeChatStream([
      {
        type: "system",
        subtype: "unknown_subtype",
        message: { role: "system", content: [{ type: "text", text: "fallback" }] },
      } as unknown as SessionStreamServerMessage,
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("fallback");
  });

  // ── sourceUuids tracking ────────────────────────────────────────────
  test("last-prompt is skipped (scalar state only, no item)", () => {
    const items = normalizeChatStream([
      {
        type: "last-prompt",
        lastPrompt: "继续",
        leafUuid: "abc-123",
      } as unknown as SessionStreamServerMessage,
    ]);
    expect(items).toHaveLength(0);
  });

  test("tracks source UUIDs on assistant items", () => {
    const items = normalizeChatStream([
      makeAssistant("a1", [{ type: "text", text: "hello" }], { uuid: "uuid-a1" }),
    ]);
    expect(assistantItems(items)[0].sourceUuids).toContain("uuid-a1");
  });
});

// ── renderChatStream ──────────────────────────────────────────────────

describe("renderChatStream", () => {
  test("assistant item renders an assistant bubble", () => {
    const rendered = renderChatStream(
      normalizeChatStream([makeAssistant("a1", [{ type: "text", text: "hi" }])]),
    );
    expect(rendered).toHaveLength(1);
    expect(rendered[0].role).toBe("assistant");
  });

  test("user-prompt item renders a user bubble", () => {
    const rendered = renderChatStream(normalizeChatStream([makeUser("hello")]));
    expect(rendered).toHaveLength(1);
    expect(rendered[0].role).toBe("user");
  });

  test("compact-boundary item renders a divider with the compact text", () => {
    const rendered = renderChatStream(
      normalizeChatStream([
        makeAssistant("a1", [{ type: "text", text: "pre" }]),
        {
          type: "system",
          subtype: "compact_boundary",
          compactMetadata: { trigger: "manual", preTokens: 50000 },
        } as unknown as SessionStreamServerMessage,
      ]),
    );
    const divider = rendered[rendered.length - 1];
    expect(divider.role).toBe("system");
    const custom = divider.metadata?.custom as Record<string, unknown>;
    expect(custom?.systemMessageType).toBe("compact-boundary");
    expect(custom?.compactText).toContain("手动");
  });

  test("session-init item renders a summary bubble", () => {
    const rendered = renderChatStream(normalizeChatStream([makeSystemInit()]));
    expect(rendered).toHaveLength(1);
    expect(rendered[0].role).toBe("system");
    const custom = rendered[0].metadata?.custom as Record<string, unknown>;
    expect(custom?.systemMessageType).toBe("system-init");
  });

  test("estimatedTokens carried onto the rendered assistant bubble", () => {
    const rendered = renderChatStream(
      normalizeChatStream([
        {
          type: "system",
          subtype: "thinking_tokens",
          estimated_tokens: 1500,
        } as unknown as SessionStreamServerMessage,
        makeAssistant("a1", [{ type: "text", text: "reply" }]),
      ]),
    );
    const custom = rendered[0].metadata?.custom as Record<string, unknown>;
    expect(custom?.estimatedTokens).toBe(1500);
  });

  test("batch-boundary is drawn when a visible neighbor precedes it", () => {
    const rendered = renderChatStream(
      normalizeChatStream([
        makeAssistant("a1", [{ type: "text", text: "hello" }]),
        makeBatchBoundary("history"),
      ]),
    );
    // assistant bubble + boundary divider
    expect(rendered).toHaveLength(2);
    expect((rendered[1].metadata?.custom as Record<string, unknown>)?.systemMessageType).toBe(
      "batch-boundary",
    );
  });

  test("batch-boundary with no visible neighbor is dropped", () => {
    const items = normalizeChatStream([makeBatchBoundary("history")]);
    const rendered = renderChatStream(items);
    // A lone boundary with nothing on either side renders nothing.
    expect(rendered).toHaveLength(0);
  });

  test("batch-boundary is drawn when a visible neighbor follows it", () => {
    const rendered = renderChatStream(
      normalizeChatStream([
        makeBatchBoundary("history"),
        makeAssistant("a1", [{ type: "text", text: "after boundary" }]),
      ]),
    );
    // boundary divider + assistant bubble
    expect(rendered).toHaveLength(2);
    expect(rendered[0].role).toBe("system");
  });

  test("resume marks orphaned tool-calls on the rendered output", () => {
    const items = normalizeChatStream([
      makeAssistant("a1", [{ type: "tool_use", id: "tu-1", name: "bash", input: {} }]),
    ]);
    const rendered = renderChatStream(items, { isResume: true });
    const toolCard = rendered.find(
      (m) =>
        m.role === "system" &&
        ((m.metadata?.custom as Record<string, unknown>)?.systemMessageType as string) ===
          "tool-card",
    );
    expect(toolCard).toBeDefined();
    expect((toolCard?.metadata?.custom as Record<string, unknown>)?.isOrphaned).toBe(true);
  });

  test("non-resume does NOT mark orphaned tool-calls", () => {
    const items = normalizeChatStream([
      makeAssistant("a1", [{ type: "tool_use", id: "tu-1", name: "bash", input: {} }]),
    ]);
    const rendered = renderChatStream(items, { isResume: false });
    const toolCard = rendered.find(
      (m) =>
        m.role === "system" &&
        ((m.metadata?.custom as Record<string, unknown>)?.systemMessageType as string) ===
          "tool-card",
    );
    expect(toolCard).toBeDefined();
    expect((toolCard?.metadata?.custom as Record<string, unknown>)?.isOrphaned).toBeUndefined();
  });
});

describe("normalizeAttachmentTaskStatus", () => {
  test('maps "completed"', () => {
    expect(normalizeAttachmentTaskStatus("completed")).toBe("completed");
  });
  test('maps "error"', () => {
    expect(normalizeAttachmentTaskStatus("error")).toBe("error");
  });
  test('maps "backgrounded"', () => {
    expect(normalizeAttachmentTaskStatus("backgrounded")).toBe("backgrounded");
  });
  test("maps unknown status to running", () => {
    expect(normalizeAttachmentTaskStatus("unknown")).toBe("running");
  });
});
