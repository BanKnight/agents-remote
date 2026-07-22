import { describe, expect, test } from "bun:test";
import type { SessionStreamServerMessage } from "@agents-remote/shared";
import type { ThreadMessageLike } from "@assistant-ui/react";
import {
  applyTaskSystemMessage,
  buildAllowAllControlResponse,
  isSyntheticAssistantMessage,
  computeRunningCount,
  convertContentToBubble,
  deriveLiveThinkingTokens,
  deriveRetryInfo,
  deriveStatus,
  extractTaskIdAssignment,
  extractTaskOps,
  mapTurnStatusTone,
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
  applyToolLifecycle,
  handleAttachment,
  normalizeAttachmentTaskStatus,
  normalizeChatStream,
  renderChatStream,
  resolveAutoPermissionMode,
  isCompactWindowUserNoise,
  sortTasks,
} from "./claude2-adapter";
import type {
  ApiErrorAttachment,
  QueueEntry,
  ExtractedToolResult,
  ChatStreamItem,
  NormalizedPart,
  TaskInfo,
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

// A user-message echo our api service injects on the client's submit (carries
// the isUserInput flag set at inject time). Mirrors `user` but tagged, so
// computeRunningCount opens running on it before the first assistant event.
const userEcho = (
  blocks: Array<
    | { type: "text"; text: string }
    | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }
  >,
): SessionStreamServerMessage =>
  ({ ...(user(blocks) as object), isUserInput: true }) as unknown as SessionStreamServerMessage;

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

const systemStatus = (
  fields: Partial<{
    permissionMode: string;
    status: string | null;
    compact_result: unknown;
  }>,
): SessionStreamServerMessage =>
  ({
    type: "system",
    subtype: "status",
    ...fields,
  }) as unknown as SessionStreamServerMessage;

// JSONL replay shape for a CLI slash command's output: a system message with
// subtype local_command whose content is the <local-command-stdout> tags.
const localCommand = (content: string): SessionStreamServerMessage =>
  ({
    type: "system",
    subtype: "local_command",
    content,
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

  test("CLI user message (no isUserInput) is neutral — neither opens nor closes running", () => {
    // A user message the CLI produces itself (no isUserInput flag) must not
    // affect running: it doesn't open (only injected user echoes do) and it
    // doesn't close (only result/interrupt do). So an assistant turn stays
    // running through such a user message until result.
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

  test("result with any subtype (interrupted / error) closes the turn", () => {
    // computeRunningCount keys off type === "result", not its subtype — an
    // interrupt (result.interrupted) or error (result.error) ends the running
    // turn just like a normal success. This is the close signal the model-switch
    // path relies on (the old restartWith left no result, so the pre-switch turn
    // stuck running) and that the interrupt path emits per the CLI protocol.
    expect(
      computeRunningCount([
        assistant("msg-1", [{ type: "text", text: "x" }]),
        result("interrupted"),
      ]),
    ).toBe(0);
    expect(
      computeRunningCount([assistant("msg-1", [{ type: "text", text: "x" }]), result("error")]),
    ).toBe(0);
  });

  test("interruptAtIndex closes a running turn when CLI replies control_response", () => {
    // The CLI replies to an interrupt control_request with control_response,
    // not result. The adapter records the index of that response so
    // computeRunningCount treats it as a turn-close boundary.
    const messages = [assistant("msg-1", [{ type: "text", text: "x" }])];
    expect(computeRunningCount(messages)).toBe(1);
    expect(computeRunningCount(messages, { interruptAtIndex: 0 })).toBe(0);
    // Does not close before the boundary.
    expect(computeRunningCount([...messages, assistant("msg-2", [])])).toBe(1);
    expect(
      computeRunningCount([...messages, assistant("msg-2", [])], { interruptAtIndex: 1 }),
    ).toBe(0);
    // A new assistant after the boundary starts a new turn.
    expect(
      computeRunningCount(
        [
          assistant("msg-1", [{ type: "text", text: "x" }]),
          { type: "control_response", response: { subtype: "success", request_id: "r1" } },
          assistant("msg-2", [{ type: "text", text: "y" }]),
        ],
        { interruptAtIndex: 1 },
      ),
    ).toBe(1);
  });

  test("injected user echo opens running before the first assistant event", () => {
    // The api service injects a user-message echo (isUserInput: true) the moment
    // the client submits — before any assistant delta arrives. Opening running
    // on it covers the network/CLI-startup gap where the UI previously showed no
    // indicator. The echo opens running exactly like an assistant message, and a
    // following result closes it.
    expect(computeRunningCount([userEcho([{ type: "text", text: "hi" }])])).toBe(1);
    expect(computeRunningCount([userEcho([{ type: "text", text: "hi" }]), result("success")])).toBe(
      0,
    );
    // An assistant event after the echo keeps running (echo → assistant is one turn).
    expect(
      computeRunningCount([
        userEcho([{ type: "text", text: "hi" }]),
        assistant("msg-1", [{ type: "text", text: "x" }]),
      ]),
    ).toBe(1);
    expect(
      computeRunningCount([
        userEcho([{ type: "text", text: "hi" }]),
        assistant("msg-1", [{ type: "text", text: "x" }]),
        result("success"),
      ]),
    ).toBe(0);
    // thinking_tokens after the echo also keeps running.
    expect(computeRunningCount([userEcho([{ type: "text", text: "hi" }]), thinkingTokens(5)])).toBe(
      1,
    );
    // An interrupt control_response closes the echo-opened turn.
    expect(
      computeRunningCount(
        [
          userEcho([{ type: "text", text: "hi" }]),
          { type: "control_response", response: { subtype: "success", request_id: "r1" } },
        ],
        { interruptAtIndex: 1 },
      ),
    ).toBe(0);
  });

  test("a user message without isUserInput does not open running", () => {
    // CLI-internal user messages (isMeta/isSynthetic skill bodies, compact
    // summaries, command noise) carry no isUserInput flag, so they stay neutral
    // and never open running on their own — the natural exclusion that lets us
    // avoid enumerating CLI user subtypes.
    expect(computeRunningCount([user([{ type: "text", text: "standalone" }])])).toBe(0);
  });
});

describe("sortTasks", () => {
  const task = (id: string, status: TaskInfo["status"], subject = `task-${id}`): TaskInfo => ({
    id,
    status,
    description: subject,
    kind: "task",
  });

  test("non-completed come before completed", () => {
    const sorted = sortTasks([
      task("3", "completed"),
      task("1", "in_progress"),
      task("2", "pending"),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(["1", "2", "3"]);
  });

  test("status priority: in_progress → pending → other → completed, id ascending within a rank (no in_progress/pending interleaving)", () => {
    const sorted = sortTasks([
      task("5", "completed"),
      task("3", "pending"),
      task("1", "in_progress"),
      task("6", "backgrounded"),
      task("2", "in_progress"),
      task("4", "pending"),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(["1", "2", "3", "4", "6", "5"]);
  });

  test("within the same group, numeric id ascending", () => {
    const sorted = sortTasks([
      task("10", "in_progress"),
      task("2", "in_progress"),
      task("1", "in_progress"),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(["1", "2", "10"]);
  });

  test("non-numeric ids sort after numeric ones", () => {
    const sorted = sortTasks([
      task("abc", "in_progress"),
      task("2", "in_progress"),
      task("1", "in_progress"),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(["1", "2", "abc"]);
  });

  test("does not mutate the input", () => {
    const input = [task("2", "in_progress"), task("1", "in_progress")];
    sortTasks(input);
    expect(input.map((t) => t.id)).toEqual(["2", "1"]);
  });
});

describe("deriveLiveThinkingTokens", () => {
  test("null when idle (no in-flight response)", () => {
    expect(deriveLiveThinkingTokens([])).toBeNull();
    expect(deriveLiveThinkingTokens([result("success")])).toBeNull();
  });

  test("returns latest estimated_tokens during the thinking phase", () => {
    expect(deriveLiveThinkingTokens([thinkingTokens(5)])).toBe(5);
    // reject-then-think scenario: prior turn closed, new turn thinking.
    expect(deriveLiveThinkingTokens([result("success"), thinkingTokens(39)])).toBe(39);
  });

  test("returns the most recent (cumulative) count across increments", () => {
    expect(
      deriveLiveThinkingTokens([thinkingTokens(5), thinkingTokens(20), thinkingTokens(39)]),
    ).toBe(39);
  });

  test("null once an assistant message arrives after thinking_tokens", () => {
    expect(
      deriveLiveThinkingTokens([
        thinkingTokens(39),
        assistant("m1", [{ type: "thinking", thinking: "plan", signature: "s" }]),
      ]),
    ).toBeNull();
  });

  test("null when a turn is running but has no thinking_tokens", () => {
    expect(deriveLiveThinkingTokens([assistant("m1", [{ type: "text", text: "hi" }])])).toBeNull();
  });

  test("null when thinking_tokens were terminated by a result", () => {
    expect(deriveLiveThinkingTokens([thinkingTokens(39), result("success")])).toBeNull();
  });
});

// ── liveStart segment scope (resume: history excluded) ───────────────
// History segment (JSONL archive) has no `result` and must not drive running.
// Only live + instantaneous (from liveStart) do. This locks down the
// resume-entry "three-dot animation + stop button" bug: history tail ends in
// assistant with no closing result, but it belongs to an archived turn.

describe("computeRunningCount — liveStart segment scope", () => {
  test("history-only assistant tail is not running when excluded by liveStart", () => {
    const historyTail = [
      assistant("h-1", [{ type: "text", text: "archived" }]),
      assistant("h-2", [{ type: "text", text: "archived end" }]),
    ];
    // liveStart = 2 excludes the whole history segment; live region is empty.
    expect(computeRunningCount(historyTail, { liveStart: 2 })).toBe(0);
    // Default (no liveStart) scans everything → 1, which is exactly the bug.
    expect(computeRunningCount(historyTail)).toBe(1);
  });

  test("live-segment assistant after history drives running; live result closes it", () => {
    const msgs = [
      assistant("h-1", [{ type: "text", text: "archived" }]), // history
      assistant("l-1", [{ type: "text", text: "live" }]), // live
    ];
    expect(computeRunningCount(msgs, { liveStart: 1 })).toBe(1);
    expect(computeRunningCount([...msgs, result("success")], { liveStart: 1 })).toBe(0);
  });

  test("liveStart defaults to 0 — fresh session scans everything", () => {
    expect(computeRunningCount([assistant("l-1", [{ type: "text", text: "hi" }])])).toBe(1);
  });
});

describe("deriveLiveThinkingTokens — liveStart segment scope", () => {
  test("ignores history thinking_tokens when excluded by liveStart", () => {
    // History thinking_tokens from an archived turn; live region empty → null.
    expect(
      deriveLiveThinkingTokens([thinkingTokens(39), thinkingTokens(50)], { liveStart: 2 }),
    ).toBeNull();
  });

  test("uses live-region thinking_tokens only", () => {
    expect(
      deriveLiveThinkingTokens([thinkingTokens(39), thinkingTokens(50), thinkingTokens(7)], {
        liveStart: 2,
      }),
    ).toBe(7);
  });
});

// ── messageToThreadLike tests ─────────────────────────────────────────

describe("deriveStatus", () => {
  test("complete when tail arrived without error", () => {
    expect(deriveStatus({ hasTail: true, isError: false, isInterrupted: false })).toBe("complete");
  });

  test("error when tail arrived with error", () => {
    expect(deriveStatus({ hasTail: true, isError: true, isInterrupted: false })).toBe("error");
  });

  test("running when no tail and turn still active (default, independent of socket)", () => {
    expect(deriveStatus({ hasTail: false, isError: false, isInterrupted: false })).toBe("running");
  });

  test("interrupted when turn ended without a result", () => {
    expect(deriveStatus({ hasTail: false, isError: false, isInterrupted: true })).toBe(
      "interrupted",
    );
  });

  test("interrupted takes precedence over running even if a tail somehow exists", () => {
    expect(deriveStatus({ hasTail: true, isError: false, isInterrupted: true })).toBe(
      "interrupted",
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

describe("resolveAutoPermissionMode", () => {
  test("prefers auto when the CLI advertises it", () => {
    expect(resolveAutoPermissionMode(["default", "acceptEdits", "auto", "plan"])).toBe("auto");
  });

  test("falls back to acceptEdits when auto is unavailable", () => {
    expect(resolveAutoPermissionMode(["default", "acceptEdits", "bypassPermissions", "plan"])).toBe(
      "acceptEdits",
    );
  });

  test("falls back to acceptEdits on an empty list", () => {
    expect(resolveAutoPermissionMode([])).toBe("acceptEdits");
  });
});

describe("command-output (local-command / bash echo) pipeline", () => {
  test("<local-command-stdout> renders as a command-output card, not dropped", () => {
    const items = normalizeChatStream([
      makeUser(
        "<local-command-stdout>Set model to sonnet (claude-sonnet-4-6)</local-command-stdout>",
      ),
    ]);
    expect(items.filter((i) => i.kind === "user-prompt")).toHaveLength(0);
    // Pass D infers commandName "model" from stdout → Pass E converts to model-change
    const cmd = items.find((i) => i.kind === "model-change") as
      | Extract<ChatStreamItem, { kind: "model-change" }>
      | undefined;
    expect(cmd).toBeDefined();
    expect(cmd?.echoLabel).toBe("sonnet");
    expect(cmd?.sourceType).toBe("local-command");
  });

  test("adjacent <command-name> input + <local-command-stdout> output merge into one card", () => {
    const items = normalizeChatStream([
      makeUser("<command-name>cost</command-name><command-message>cost</command-message>"),
      makeUser("<local-command-stdout>Total: $1.23</local-command-stdout>"),
    ]);
    const cmds = items.filter((i) => i.kind === "command-output");
    expect(cmds).toHaveLength(1);
    const cmd = cmds[0] as Extract<ChatStreamItem, { kind: "command-output" }>;
    expect(cmd.commandName).toBe("cost");
    expect(cmd.stdout).toBe("Total: $1.23");
  });

  test("JSONL replay: user command echo + system/local_command merge and strip leading slash", () => {
    const items = normalizeChatStream([
      makeUser("<command-name>/usage</command-name><command-message>usage</command-message>"),
      localCommand("<local-command-stdout>Total cost: $0.42</local-command-stdout>"),
    ]);
    const cmds = items.filter((i) => i.kind === "command-output");
    expect(cmds).toHaveLength(1);
    expect(items.filter((i) => i.kind === "fallback")).toHaveLength(0);
    const cmd = cmds[0] as Extract<ChatStreamItem, { kind: "command-output" }>;
    expect(cmd.commandName).toBe("usage");
    expect(cmd.stdout).toBe("Total cost: $0.42");
    expect(cmd.sourceType).toBe("local-command");
  });

  test("JSONL replay: plain-text /status input (form D) merges with following stdout", () => {
    // Some CLI commands persist the INPUT as a system/local_command record with
    // plain-text content (no XML tags). The "/" prefix routes it to an input
    // fragment that Pass B merges with the next <local-command-stdout>.
    const items = normalizeChatStream([
      localCommand("/status"),
      localCommand("<local-command-stdout>Working directory: /app</local-command-stdout>"),
    ]);
    const cmds = items.filter((i) => i.kind === "command-output");
    expect(cmds).toHaveLength(1);
    expect(items.filter((i) => i.kind === "fallback")).toHaveLength(0);
    const cmd = cmds[0] as Extract<ChatStreamItem, { kind: "command-output" }>;
    expect(cmd.commandName).toBe("status");
    expect(cmd.args).toBeUndefined();
    expect(cmd.stdout).toBe("Working directory: /app");
    expect(cmd.sourceType).toBe("local-command");
  });

  test("form D splits args from a plain-text input echo", () => {
    const items = normalizeChatStream([
      localCommand("/model sonnet"),
      localCommand("<local-command-stdout>Set model to sonnet</local-command-stdout>"),
    ]);
    // Pass D infers commandName "model" → Pass E converts to model-change
    const cmd = items.find((i) => i.kind === "model-change") as
      | Extract<ChatStreamItem, { kind: "model-change" }>
      | undefined;
    expect(cmd).toBeDefined();
    expect(cmd?.echoLabel).toBe("sonnet");
  });

  test("form D: non-slash plain-text system/local_command is not cardified", () => {
    const items = normalizeChatStream([localCommand("plain text no slash")]);
    expect(items.filter((i) => i.kind === "command-output")).toHaveLength(0);
  });

  test("system/local_command with command tags is cardified, not fallback", () => {
    const items = normalizeChatStream([
      localCommand("<local-command-stdout>Set model to sonnet</local-command-stdout>"),
    ]);
    expect(items.filter((i) => i.kind === "fallback")).toHaveLength(0);
    // Pass D infers commandName "model" → Pass E converts to model-change
    const cmd = items.find((i) => i.kind === "model-change") as
      | Extract<ChatStreamItem, { kind: "model-change" }>
      | undefined;
    expect(cmd).toBeDefined();
    expect(cmd?.echoLabel).toBe("sonnet");
    expect(cmd?.sourceType).toBe("local-command");
  });

  test("form C: single stdout card infers commandName from 'Set model to'", () => {
    const items = normalizeChatStream([
      localCommand(
        "<local-command-stdout>Set model to sonnet (claude-sonnet-4-6)</local-command-stdout>",
      ),
    ]);
    // Pass D infers commandName "model" → Pass E converts to model-change.
    // extractModelEchoLabel uses MODEL_SET_RE which captures the first \S+ token
    // after "Set model to": "sonnet".
    const cmd = items.find((i) => i.kind === "model-change") as
      | Extract<ChatStreamItem, { kind: "model-change" }>
      | undefined;
    expect(cmd?.echoLabel).toBe("sonnet");
  });

  test("unrecognizable /model echo body stays a command-output card (not an empty notice)", () => {
    // Pass D infers commandName "model", but the body isn't a clean echo (e.g. an
    // invalid `/model bogus` error, diagnostic output, or a CLI version whose echo
    // phrasing drifted). Pass E must NOT convert it to a model-change — that would
    // render an empty "模型 · " notice and swallow the error the user needs to see.
    const items = normalizeChatStream([
      localCommand("<command-name>/model</command-name><command-message>model</command-message>"),
      localCommand("<local-command-stdout>Unknown model: bogusalias</local-command-stdout>"),
    ]);
    expect(items.filter((i) => i.kind === "model-change")).toHaveLength(0);
    const cmd = items.find((i) => i.kind === "command-output") as
      | Extract<ChatStreamItem, { kind: "command-output" }>
      | undefined;
    expect(cmd).toBeDefined();
    expect(cmd?.commandName).toBe("model");
    expect(cmd?.stdout).toBe("Unknown model: bogusalias");
  });

  test("form C: 'Reloaded skills:' stdout infers reload-skills", () => {
    const items = normalizeChatStream([
      localCommand(
        "<local-command-stdout>Reloaded skills: 40 skills available</local-command-stdout>",
      ),
    ]);
    const cmd = items.find((i) => i.kind === "command-output") as
      | Extract<ChatStreamItem, { kind: "command-output" }>
      | undefined;
    expect(cmd?.commandName).toBe("reload-skills");
  });

  test("form C: 'Total cost:' stdout infers cost", () => {
    const items = normalizeChatStream([
      localCommand("<local-command-stdout>Total cost: $0.42</local-command-stdout>"),
    ]);
    const cmd = items.find((i) => i.kind === "command-output") as
      | Extract<ChatStreamItem, { kind: "command-output" }>
      | undefined;
    expect(cmd?.commandName).toBe("cost");
  });

  test("form C: unknown stdout leaves commandName undefined (no guess)", () => {
    const items = normalizeChatStream([
      localCommand("<local-command-stdout>Some arbitrary output</local-command-stdout>"),
    ]);
    const cmd = items.find((i) => i.kind === "command-output") as
      | Extract<ChatStreamItem, { kind: "command-output" }>
      | undefined;
    expect(cmd?.commandName).toBeUndefined();
  });

  test("form C inference does not override a real commandName from tags", () => {
    const items = normalizeChatStream([
      localCommand(
        "<command-name>custom</command-name><local-command-stdout>Total cost: $0.42</local-command-stdout>",
      ),
    ]);
    const cmd = items.find((i) => i.kind === "command-output") as
      | Extract<ChatStreamItem, { kind: "command-output" }>
      | undefined;
    expect(cmd?.commandName).toBe("custom");
  });

  test("JSONL replay double-record (synthetic echo + tags + local_command) collapses to one card", () => {
    // /reload-skills is persisted as BOTH a synthetic assistant echo AND
    // user-tag + system/local_command records. The synthetic (empty on replay
    // since pendingSlashItemIdx is empty) must fold into the tag-based card,
    // leaving a single card with the real stdout.
    const items = normalizeChatStream([
      assistantWithModel("synth", "<synthetic>", [
        { type: "text", text: "No response requested." },
      ]),
      makeUser(
        "<command-name>/reload-skills</command-name><command-message>reload-skills</command-message>",
      ),
      localCommand(
        "<local-command-stdout>Reloaded skills: 40 skills available (no changes)</local-command-stdout>",
      ),
    ]);
    const cmds = items.filter((i) => i.kind === "command-output");
    expect(cmds).toHaveLength(1);
    const cmd = cmds[0] as Extract<ChatStreamItem, { kind: "command-output" }>;
    expect(cmd.commandName).toBe("reload-skills");
    expect(cmd.stdout).toBe("Reloaded skills: 40 skills available (no changes)");
    expect(cmd.sourceType).toBe("local-command");
  });

  test("skill_catalog_changed notification renders no bubble (pure invalidate trigger)", () => {
    const items = normalizeChatStream([
      { type: "system", subtype: "skill_catalog_changed" } as unknown as SessionStreamServerMessage,
    ]);
    expect(items).toHaveLength(0);
  });

  test("<bash-input> + <bash-stdout> is recognized as sourceType bash", () => {
    const items = normalizeChatStream([
      makeUser("<bash-input>ls</bash-input><bash-stdout>file.txt</bash-stdout>"),
    ]);
    const cmd = items.find((i) => i.kind === "command-output") as
      | Extract<ChatStreamItem, { kind: "command-output" }>
      | undefined;
    expect(cmd).toBeDefined();
    expect(cmd?.sourceType).toBe("bash");
    expect(cmd?.input).toBe("ls");
    expect(cmd?.stdout).toBe("file.txt");
  });

  test("<local-command-caveat> (isMeta) is still dropped", () => {
    const items = normalizeChatStream([
      makeUser("<local-command-caveat>do not respond</local-command-caveat>", { isMeta: true }),
    ]);
    expect(items.filter((i) => i.kind === "command-output")).toHaveLength(0);
    expect(items.filter((i) => i.kind === "user-prompt")).toHaveLength(0);
  });

  test("renderChatStream maps model command-output to model-change system message", () => {
    const items = normalizeChatStream([
      makeUser("<local-command-stdout>Set model to sonnet</local-command-stdout>"),
    ]);
    const rendered = renderChatStream(items);
    const cmd = rendered.find(
      (m) =>
        (m.metadata?.custom as Record<string, unknown> | undefined)?.systemMessageType ===
        "model-change",
    );
    expect(cmd).toBeDefined();
    expect(cmd?.role).toBe("system");
    const custom = cmd?.metadata?.custom as Record<string, unknown>;
    expect(custom.echoLabel).toBe("sonnet");
  });

  // ── synthetic assistant (model "<synthetic>") → command-output ──
  // CLI slash commands (/cost /help /status …) come back only as a synthetic
  // assistant message + result on stream-json stdout; the command-input user
  // message is filtered. Command name is recovered positionally from the most
  // recent "/" user prompt (FIFO queue).

  test("synthetic assistant body renders as a command-output card", () => {
    const echo = makeUser("/cost");
    const synth = assistantWithModel("synth", "<synthetic>", [
      { type: "text", text: "Total cost: $0.42" },
    ]);
    const items = normalizeChatStream([echo, synth, result("success")]);
    expect(items.filter((i) => i.kind === "assistant")).toHaveLength(0);
    // Form E: the "/cost" echo user-prompt is consumed (rewritten in place into
    // the merged card) — no standalone user bubble survives.
    expect(items.filter((i) => i.kind === "user-prompt")).toHaveLength(0);
    const cmds = items.filter((i) => i.kind === "command-output");
    expect(cmds).toHaveLength(1);
    const cmd = cmds[0] as Extract<ChatStreamItem, { kind: "command-output" }>;
    expect(cmd.commandName).toBe("cost");
    expect(cmd.stdout).toBe("Total cost: $0.42");
    expect(cmd.sourceType).toBe("local-command");
    // Merged card carries both the echo and the synthetic raw snapshots.
    expect(cmd._rawSnapshots).toContain(echo);
    expect(cmd._rawSnapshots).toContain(synth);
  });

  test("synthetic /model with unrecognizable body stays a command-output card", () => {
    const items = normalizeChatStream([
      makeUser("/model sonnet"),
      assistantWithModel("synth", "<synthetic>", [{ type: "text", text: "ok" }]),
    ]);
    // commandName "model" recovered from the slash prompt, but the synthetic
    // body "ok" is not a clean echo → Pass E leaves it a command-output card
    // (converting it would render an empty "模型 · " notice and lose the body).
    const change = items.find((i) => i.kind === "model-change");
    expect(change).toBeUndefined();
    const cmd = items.find((i) => i.kind === "command-output") as
      | Extract<ChatStreamItem, { kind: "command-output" }>
      | undefined;
    expect(cmd?.commandName).toBe("model");
    expect(cmd?.stdout).toBe("ok");
  });

  test("synthetic /model with a clean set echo converts to model-change", () => {
    const items = normalizeChatStream([
      makeUser("/model sonnet"),
      assistantWithModel("synth", "<synthetic>", [{ type: "text", text: "Set model to sonnet" }]),
    ]);
    const cmd = items.find((i) => i.kind === "model-change") as
      | Extract<ChatStreamItem, { kind: "model-change" }>
      | undefined;
    expect(cmd).toBeDefined();
    expect(cmd?.echoLabel).toBe("sonnet");
  });

  test("synthetic with no preceding slash prompt yields a generic command-output", () => {
    const items = normalizeChatStream([
      assistantWithModel("synth", "<synthetic>", [
        { type: "text", text: "No response requested." },
      ]),
    ]);
    const cmds = items.filter((i) => i.kind === "command-output");
    expect(cmds).toHaveLength(1);
    const cmd = cmds[0] as Extract<ChatStreamItem, { kind: "command-output" }>;
    expect(cmd.commandName).toBeUndefined();
    expect(cmd.stdout).toBe("No response requested.");
  });

  test("synthetic does not steal commandName from a non-slash user prompt", () => {
    const items = normalizeChatStream([
      makeUser("hello there"),
      assistantWithModel("synth", "<synthetic>", [{ type: "text", text: "body" }]),
    ]);
    const cmd = items.find((i) => i.kind === "command-output") as
      | Extract<ChatStreamItem, { kind: "command-output" }>
      | undefined;
    expect(cmd?.commandName).toBeUndefined();
  });

  test("API-error synthetic (isApiErrorMessage) is not cardified", () => {
    const items = normalizeChatStream([
      {
        type: "assistant",
        message: {
          id: "synth-err",
          role: "assistant",
          model: "<synthetic>",
          content: [{ type: "text", text: "API Error: boom" }],
        },
        isApiErrorMessage: true,
      } as unknown as SessionStreamServerMessage,
    ]);
    expect(items.filter((i) => i.kind === "command-output")).toHaveLength(0);
  });

  test("form E: live slash echo + synthetic collapse to one card (no user bubble)", () => {
    const echo = makeUser("/status");
    const synth = assistantWithModel("synth", "<synthetic>", [
      { type: "text", text: "Working directory: /app" },
    ]);
    const items = normalizeChatStream([echo, synth]);
    expect(items.filter((i) => i.kind === "user-prompt")).toHaveLength(0);
    const cmds = items.filter((i) => i.kind === "command-output");
    expect(cmds).toHaveLength(1);
    const cmd = cmds[0] as Extract<ChatStreamItem, { kind: "command-output" }>;
    expect(cmd.commandName).toBe("status");
    expect(cmd.stdout).toBe("Working directory: /app");
    expect(cmd._rawSnapshots).toContain(echo);
    expect(cmd._rawSnapshots).toContain(synth);
  });

  test("form E fallback: slash echo with no synthetic stays a user-prompt (not lost)", () => {
    const items = normalizeChatStream([makeUser("/nonexistent")]);
    expect(items.filter((i) => i.kind === "command-output")).toHaveLength(0);
    const prompts = items.filter((i) => i.kind === "user-prompt");
    expect(prompts).toHaveLength(1);
    expect((prompts[0] as Extract<ChatStreamItem, { kind: "user-prompt" }>).text).toBe(
      "/nonexistent",
    );
  });

  test("rapid-fire slash commands recover names FIFO", () => {
    const items = normalizeChatStream([
      makeUser("/cost"),
      makeUser("/help"),
      assistantWithModel("synth1", "<synthetic>", [{ type: "text", text: "cost body" }]),
      assistantWithModel("synth2", "<synthetic>", [{ type: "text", text: "help body" }]),
    ]);
    const cmds = items.filter((i) => i.kind === "command-output");
    expect(cmds).toHaveLength(2);
    // Form E FIFO: both slash echoes are consumed by their paired synthetics.
    expect(items.filter((i) => i.kind === "user-prompt")).toHaveLength(0);
    const first = cmds[0] as Extract<ChatStreamItem, { kind: "command-output" }>;
    const second = cmds[1] as Extract<ChatStreamItem, { kind: "command-output" }>;
    expect(first.commandName).toBe("cost");
    expect(first.stdout).toBe("cost body");
    expect(second.commandName).toBe("help");
    expect(second.stdout).toBe("help body");
  });

  test("renderChatStream maps synthetic-origin command-output with commandName", () => {
    const items = normalizeChatStream([
      makeUser("/cost"),
      assistantWithModel("synth", "<synthetic>", [{ type: "text", text: "Total cost: $0.42" }]),
    ]);
    const rendered = renderChatStream(items);
    const cmd = rendered.find(
      (m) =>
        (m.metadata?.custom as Record<string, unknown> | undefined)?.systemMessageType ===
        "command-output",
    );
    expect(cmd).toBeDefined();
    const custom = cmd?.metadata?.custom as Record<string, unknown>;
    expect(custom.commandName).toBe("cost");
    expect(custom.stdout).toBe("Total cost: $0.42");
  });
});

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
    // Head/tail raw split for the debug tooltips: head = ONLY the Agent
    // tool_use (assistant); the prompt echo (user text) is excluded so the
    // head stays lean; tail = the user tool_result carrying the envelope.
    const headRaws = (custom._rawMessages ?? []) as Array<Record<string, unknown>>;
    const tailRaws = (custom.tailRawMessages ?? []) as Array<Record<string, unknown>>;
    expect(headRaws.length).toBe(1);
    expect(headRaws[0]?.type).toBe("assistant");
    expect(headRaws.some((m) => m.type === "user")).toBe(false);
    expect(tailRaws.length).toBe(1);
    expect(tailRaws[0]?.tool_use_result != null || tailRaws[0]?.toolUseResult != null).toBe(true);
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

describe("exit-plan-mode pipeline", () => {
  test("ExitPlanMode renders as its own container carrying plan + controlRequestId", () => {
    const raw: SessionStreamServerMessage[] = [
      user([{ type: "text", text: "make a plan" }]),
      assistant("a1", [
        {
          type: "tool_use",
          id: "tu-exit",
          name: "ExitPlanMode",
          input: { plan: "# Plan\n- step 1", planFilePath: "/tmp/plan.md" },
        },
      ]),
      controlRequest("req-1", "ExitPlanMode", "tu-exit", {
        plan: "# Plan\n- step 1",
        planFilePath: "/tmp/plan.md",
      }),
      result("success"),
    ];

    const items = normalizeChatStream(raw);
    const exitPart = items
      .flatMap((i) => (i.kind === "assistant" ? i.parts : []))
      .find((p) => p.type === "tool-call" && p.toolCallId === "tu-exit") as
      | ({ type: "tool-call" } & { controlRequestId?: string; hasAgentBody?: boolean })
      | undefined;
    expect(exitPart).toBeDefined();
    expect(exitPart?.controlRequestId).toBe("req-1");
    expect(exitPart?.hasAgentBody).not.toBe(true);

    const rendered = renderChatStream(items);
    const planCard = rendered.find(
      (m) =>
        (m.metadata?.custom as Record<string, unknown> | undefined)?.systemMessageType ===
        "exit-plan-mode",
    );
    expect(planCard).toBeDefined();
    const custom = planCard?.metadata?.custom as Record<string, unknown>;
    expect(custom.plan).toBe("# Plan\n- step 1");
    expect(custom.planFilePath).toBe("/tmp/plan.md");
    expect(custom.controlRequestId).toBe("req-1");
    // It must NOT also be emitted as a generic tool-card.
    const toolCardForExit = rendered.find((m) => {
      const c = m.metadata?.custom as Record<string, unknown> | undefined;
      return c?.systemMessageType === "tool-card" && c?.toolName === "ExitPlanMode";
    });
    expect(toolCardForExit).toBeUndefined();
  });

  test("a paired tool_result marks the plan card complete (result present, not error)", () => {
    const raw: SessionStreamServerMessage[] = [
      user([{ type: "text", text: "make a plan" }]),
      assistant("a1", [
        {
          type: "tool_use",
          id: "tu-exit",
          name: "ExitPlanMode",
          input: { plan: "# Plan" },
        },
      ]),
      controlRequest("req-1", "ExitPlanMode", "tu-exit", { plan: "# Plan" }),
      user([{ type: "tool_result", tool_use_id: "tu-exit", content: "plan approved" }]),
      result("success"),
    ];
    const items = normalizeChatStream(raw);
    const rendered = renderChatStream(items);
    const planCard = rendered.find(
      (m) =>
        (m.metadata?.custom as Record<string, unknown> | undefined)?.systemMessageType ===
        "exit-plan-mode",
    );
    expect(planCard).toBeDefined();
    const custom = planCard?.metadata?.custom as Record<string, unknown>;
    expect(custom.result).toBe("plan approved");
    expect(custom.isError).not.toBe(true);
  });
});

describe("ask-user-question pipeline", () => {
  test("AskUserQuestion renders as its own card carrying questions + controlRequestId", () => {
    const questions = [
      {
        question: "Which color?",
        header: "Color",
        options: [{ label: "Red", preview: "```ts\nconst x = 1;\n```" }, { label: "Blue" }],
      },
      { question: "Notes?", header: "Notes" },
    ];
    const raw: SessionStreamServerMessage[] = [
      user([{ type: "text", text: "ask me" }]),
      assistant("a1", [
        {
          type: "tool_use",
          id: "tu-ask",
          name: "AskUserQuestion",
          input: { questions },
        },
      ]),
      controlRequest("req-ask", "AskUserQuestion", "tu-ask", { questions }),
      result("success"),
    ];

    const items = normalizeChatStream(raw);
    const askPart = items
      .flatMap((i) => (i.kind === "assistant" ? i.parts : []))
      .find((p) => p.type === "tool-call" && p.toolCallId === "tu-ask") as
      | ({ type: "tool-call" } & { controlRequestId?: string })
      | undefined;
    expect(askPart).toBeDefined();
    expect(askPart?.controlRequestId).toBe("req-ask");

    const rendered = renderChatStream(items);
    const askCard = rendered.find(
      (m) =>
        (m.metadata?.custom as Record<string, unknown> | undefined)?.systemMessageType ===
        "ask-user-question",
    );
    expect(askCard).toBeDefined();
    const custom = askCard?.metadata?.custom as Record<string, unknown>;
    expect(custom.questions).toEqual(questions);
    expect(custom.args).toEqual({ questions });
    expect(custom.controlRequestId).toBe("req-ask");
    expect(custom.isError).not.toBe(true);
    // It must NOT also be emitted as a generic tool-card.
    const toolCardForAsk = rendered.find((m) => {
      const c = m.metadata?.custom as Record<string, unknown> | undefined;
      return c?.systemMessageType === "tool-card" && c?.toolName === "AskUserQuestion";
    });
    expect(toolCardForAsk).toBeUndefined();
  });

  test("a paired tool_result marks the question card complete (result present, not error)", () => {
    const questions = [{ question: "Which?", header: "Pick", options: [{ label: "A" }] }];
    const raw: SessionStreamServerMessage[] = [
      user([{ type: "text", text: "ask me" }]),
      assistant("a1", [
        {
          type: "tool_use",
          id: "tu-ask",
          name: "AskUserQuestion",
          input: { questions },
        },
      ]),
      controlRequest("req-ask", "AskUserQuestion", "tu-ask", { questions }),
      user([
        {
          type: "tool_result",
          tool_use_id: "tu-ask",
          content: '{"Which?":"A"}',
        },
      ]),
      result("success"),
    ];
    const items = normalizeChatStream(raw);
    const rendered = renderChatStream(items);
    const askCard = rendered.find(
      (m) =>
        (m.metadata?.custom as Record<string, unknown> | undefined)?.systemMessageType ===
        "ask-user-question",
    );
    expect(askCard).toBeDefined();
    const custom = askCard?.metadata?.custom as Record<string, unknown>;
    expect(custom.result).toBe('{"Which?":"A"}');
    expect(custom.isError).not.toBe(true);
  });
});

describe("permission_denied pipeline", () => {
  const permissionDenied = (
    tool_use_id: string,
    decision_reason_type: string,
    decision_reason: string,
  ): SessionStreamServerMessage =>
    ({
      type: "system",
      subtype: "permission_denied",
      tool_name: "Bash",
      tool_use_id,
      decision_reason_type,
      decision_reason,
    }) as unknown as SessionStreamServerMessage;

  const findBashCard = (rendered: ThreadMessageLike[]) =>
    rendered.find((m) => {
      const c = m.metadata?.custom as Record<string, unknown> | undefined;
      return c?.systemMessageType === "tool-card" && c?.toolName === "Bash";
    });

  const findToolCallPart = (items: ChatStreamItem[], toolCallId: string) =>
    items
      .flatMap((i) => (i.kind === "assistant" ? i.parts : []))
      .find((p) => p.type === "tool-call" && p.toolCallId === toolCallId) as
      | ({
          type: "tool-call";
        } & {
          permissionDenied?: { reasonType?: string; reason?: string };
          rawSnapshots?: SessionStreamServerMessage[];
        })
      | undefined;

  test("mounts { reasonType, reason } onto the matching tool-call part and custom, no fallback bubble", () => {
    const raw: SessionStreamServerMessage[] = [
      user([{ type: "text", text: "run it" }]),
      assistant("a1", [
        { type: "tool_use", id: "tu-1", name: "Bash", input: { command: "rm -rf x" } },
      ]),
      permissionDenied("tu-1", "classifier", "Blocked by safety classifier"),
      result("success"),
    ];

    const items = normalizeChatStream(raw);
    const part = findToolCallPart(items, "tu-1");
    expect(part).toBeDefined();
    expect(part?.permissionDenied).toEqual({
      reasonType: "classifier",
      reason: "Blocked by safety classifier",
    });

    const rendered = renderChatStream(items);
    const custom = findBashCard(rendered)?.metadata?.custom as Record<string, unknown> | undefined;
    expect(custom).toBeDefined();
    expect(custom?.permissionDenied).toEqual({
      reasonType: "classifier",
      reason: "Blocked by safety classifier",
    });
    // Must NOT leak as a meaningless "system · permission_denied · #uuid" fallback bubble.
    expect(items.filter((i) => i.kind === "fallback")).toHaveLength(0);
  });

  test("coexists with a later tool_result(is_error): violet deny banner + red error result on the same card", () => {
    const raw: SessionStreamServerMessage[] = [
      user([{ type: "text", text: "run it" }]),
      assistant("a1", [
        { type: "tool_use", id: "tu-1", name: "Bash", input: { command: "rm -rf x" } },
      ]),
      permissionDenied("tu-1", "classifier", "Blocked by safety classifier"),
      user([
        {
          type: "tool_result",
          tool_use_id: "tu-1",
          content: "Command not allowed",
          is_error: true,
        },
      ]),
      result("success"),
    ];

    const items = normalizeChatStream(raw);
    const rendered = renderChatStream(items);
    const custom = findBashCard(rendered)?.metadata?.custom as Record<string, unknown> | undefined;
    expect(custom).toBeDefined();
    // Both signals live on the same card — neither overwrites the other.
    expect(custom?.permissionDenied).toEqual({
      reasonType: "classifier",
      reason: "Blocked by safety classifier",
    });
    expect(custom?.isError).toBe(true);
    expect(custom?.result).toBe("Command not allowed");
  });

  test("missing tool_use_id is silently skipped (no item, no throw)", () => {
    const raw: SessionStreamServerMessage[] = [
      assistant("a1", [{ type: "tool_use", id: "tu-1", name: "Bash", input: { command: "ls" } }]),
      {
        type: "system",
        subtype: "permission_denied",
        decision_reason_type: "classifier",
        decision_reason: "Blocked",
      } as unknown as SessionStreamServerMessage,
      result("success"),
    ];
    const items = normalizeChatStream(raw);
    const part = findToolCallPart(items, "tu-1");
    expect(part?.permissionDenied).toBeUndefined();
    expect(items.filter((i) => i.kind === "fallback")).toHaveLength(0);
  });

  test("tool_use_id with no matching part is silently skipped", () => {
    const raw: SessionStreamServerMessage[] = [
      assistant("a1", [{ type: "tool_use", id: "tu-1", name: "Bash", input: { command: "ls" } }]),
      permissionDenied("tu-ghost", "classifier", "Blocked"),
      result("success"),
    ];
    const items = normalizeChatStream(raw);
    const part = findToolCallPart(items, "tu-1");
    expect(part?.permissionDenied).toBeUndefined();
    expect(items.filter((i) => i.kind === "fallback")).toHaveLength(0);
  });

  test("raw permission_denied wire message is preserved on the part's rawSnapshots", () => {
    const pd = permissionDenied("tu-1", "classifier", "Blocked by safety classifier");
    const raw: SessionStreamServerMessage[] = [
      user([{ type: "text", text: "run it" }]),
      assistant("a1", [
        { type: "tool_use", id: "tu-1", name: "Bash", input: { command: "rm -rf x" } },
      ]),
      pd,
      result("success"),
    ];
    const items = normalizeChatStream(raw);
    const part = findToolCallPart(items, "tu-1");
    expect(part?.rawSnapshots).toContain(pd);
  });
});

describe("system.status pipeline", () => {
  const hasRawStatusFallback = (rendered: ReturnType<typeof renderChatStream>): boolean =>
    rendered.some((m) => {
      const c = m.metadata?.custom as Record<string, unknown> | undefined;
      return (c?._raw as { subtype?: string } | undefined)?.subtype === "status";
    });

  test("permissionMode variant renders as a mode-change notice (not a fallback)", () => {
    const raw: SessionStreamServerMessage[] = [
      user([{ type: "text", text: "do it" }]),
      assistant("a1", [{ type: "text", text: "ok" }]),
      systemStatus({ status: null, permissionMode: "auto" }),
      result("success"),
    ];
    const items = normalizeChatStream(raw);
    const rendered = renderChatStream(items);
    const notice = rendered.find(
      (m) =>
        (m.metadata?.custom as Record<string, unknown> | undefined)?.systemMessageType ===
        "mode-change",
    );
    expect(notice).toBeDefined();
    const custom = notice?.metadata?.custom as Record<string, unknown>;
    expect(custom.mode).toBe("auto");
    // Must NOT also fall through to a raw fallback bubble.
    expect(hasRawStatusFallback(rendered)).toBe(false);
  });

  test("compacting variant is skipped (no notice, no fallback)", () => {
    const raw: SessionStreamServerMessage[] = [
      user([{ type: "text", text: "do it" }]),
      assistant("a1", [{ type: "text", text: "ok" }]),
      systemStatus({ status: "compacting" }),
      result("success"),
    ];
    const items = normalizeChatStream(raw);
    const rendered = renderChatStream(items);
    const notice = rendered.find(
      (m) =>
        (m.metadata?.custom as Record<string, unknown> | undefined)?.systemMessageType ===
        "mode-change",
    );
    expect(notice).toBeUndefined();
    expect(hasRawStatusFallback(rendered)).toBe(false);
  });
});

describe("compact process pipeline", () => {
  // Auto-compact sequence: status:compacting → hook_started{SessionStart:compact}
  // → hook_response{...,success} → compact_boundary → compact summary.
  // normalizeChatStream skips the compacting status; the SessionStart:compact
  // hook pair becomes one hook-event item (hookName preserved → the route's
  // absorb rule keys off it); compact_boundary becomes the compact-block.
  test("SessionStart:compact hook pair renders one hook-card with hookName", () => {
    const raw: SessionStreamServerMessage[] = [
      user([{ type: "text", text: "do it" }]),
      assistant("a1", [{ type: "text", text: "ok" }]),
      {
        type: "system",
        subtype: "hook_started",
        hook_id: "h1",
        hook_name: "SessionStart:compact",
        hook_event: "SessionStart",
      },
      {
        type: "system",
        subtype: "hook_response",
        hook_id: "h1",
        hook_name: "SessionStart:compact",
        output: "summarized",
        outcome: "success",
      },
      result("success"),
    ] as unknown as SessionStreamServerMessage[];
    const items = normalizeChatStream(raw);
    const rendered = renderChatStream(items);
    const hookCard = rendered.find(
      (m) =>
        (m.metadata?.custom as Record<string, unknown> | undefined)?.systemMessageType ===
        "hook-card",
    );
    expect(hookCard).toBeDefined();
    expect((hookCard?.metadata?.custom as Record<string, unknown> | undefined)?.hookName).toBe(
      "SessionStart:compact",
    );
  });

  test("compact_boundary renders a compact-block", () => {
    const raw: SessionStreamServerMessage[] = [
      user([{ type: "text", text: "do it" }]),
      assistant("a1", [{ type: "text", text: "ok" }]),
      compactBoundary(),
      compactSummary("This session is being continued from a previous conversation."),
      result("success"),
    ];
    const items = normalizeChatStream(raw);
    const rendered = renderChatStream(items);
    const block = rendered.find(
      (m) =>
        (m.metadata?.custom as Record<string, unknown> | undefined)?.systemMessageType ===
        "compact-block",
    );
    expect(block).toBeDefined();
  });

  test("live: /compact echo + synthetic AbortError → one compact-abort banner (source live)", () => {
    const items = normalizeChatStream([
      makeUser("/compact"),
      assistantWithModel("synth-abort", "<synthetic>", [
        { type: "text", text: "AbortError: Compaction canceled." },
      ]),
    ]);
    const aborts = items.filter((i) => i.kind === "compact-abort");
    expect(aborts).toHaveLength(1);
    expect((aborts[0] as Extract<ChatStreamItem, { kind: "compact-abort" }>).source).toBe("live");
    // /compact echo is rewritten into the banner — no command card, no user bubble.
    expect(items.filter((i) => i.kind === "command-output")).toHaveLength(0);
    expect(items.filter((i) => i.kind === "user-prompt")).toHaveLength(0);
  });

  test("replay: /compact tags + local_command AbortError stderr → one compact-abort banner (source replay)", () => {
    // A stderr-only output fragment has no stdout, so Pass B does NOT merge it
    // with the preceding /compact tags echo. The local_command branch rewrites
    // that echo in place into a compact-abort banner, so live and replay produce
    // the same single banner item.
    const items = normalizeChatStream([
      makeUser("<command-name>/compact</command-name><command-message>compact</command-message>"),
      localCommand("<local-command-stderr>AbortError: Compaction canceled.</local-command-stderr>"),
    ]);
    const aborts = items.filter((i) => i.kind === "compact-abort");
    expect(aborts).toHaveLength(1);
    expect((aborts[0] as Extract<ChatStreamItem, { kind: "compact-abort" }>).source).toBe("replay");
    expect(items.filter((i) => i.kind === "command-output")).toHaveLength(0);
  });

  test("non-compact slash card is kept (abort recognition is compact-specific)", () => {
    const items = normalizeChatStream([
      makeUser("/usage"),
      assistantWithModel("synth-usage", "<synthetic>", [
        { type: "text", text: "Total cost: $0.42" },
      ]),
    ]);
    expect(items.filter((i) => i.kind === "command-output")).toHaveLength(1);
    expect(items.filter((i) => i.kind === "compact-abort")).toHaveLength(0);
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

  test("ended returns null (server transport marker, never rendered)", () => {
    const msg = { type: "ended" } as unknown as SessionStreamServerMessage;
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

  test("extractTaskOps extracts TaskCreate with subject; reducer uses tool_use_id as temp id", () => {
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
    // task_id is the tool_use_id (block.id) as a TEMPORARY id; the real id
    // arrives later in the tool_result and is backfilled by the user branch.
    expect(ops[0]).toMatchObject({ subtype: "task_started", task_id: "tu-1" });
    const tasks = applyTaskSystemMessage([], ops[0]);
    expect(tasks[0].id).toBe("tu-1");
    expect(tasks[0].subject).toBe("short title");
    expect(tasks[0].description).toBe("detailed description");
  });

  test("TaskUpdate matches TaskCreate via real id backfilled from tool_result, no orphan entries", () => {
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
    // tool_result carries the REAL task id; field name differs by source
    // (camelCase `toolUseResult` on JSONL/replay, snake_case `tool_use_result`
    // on live stdout) — extractTaskIdAssignment handles both.
    const toolResultMsg = {
      type: "user",
      message: {
        id: "m1b",
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "tu-1", content: "Task #17 created" }],
      },
      toolUseResult: { task: { id: "17", subject: "do thing" } },
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
            input: { taskId: "17", status: "completed" },
          },
        ],
      },
    } as unknown as SessionStreamServerMessage;

    // 1. TaskCreate → temp id = tool_use_id ("tu-1")
    let tasks: ReturnType<typeof applyTaskSystemMessage> = [];
    for (const op of extractTaskOps(createMsg)) tasks = applyTaskSystemMessage(tasks, op);
    expect(tasks[0].id).toBe("tu-1");

    // 2. tool_result → backfill the real id (mirrors applyMessageScalarState's
    //    user branch, which can't run in this pure-reducer test).
    const assign = extractTaskIdAssignment(toolResultMsg);
    expect(assign).toEqual({ toolUseId: "tu-1", taskId: "17" });
    if (assign) {
      tasks = tasks.map((t) => (t.id === assign.toolUseId ? { ...t, id: assign.taskId } : t));
    }
    expect(tasks[0].id).toBe("17");

    // 3. TaskUpdate → now matches the real id → status updates
    for (const op of extractTaskOps(updateMsg)) tasks = applyTaskSystemMessage(tasks, op);

    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe("17");
    expect(tasks[0].status).toBe("completed");
  });

  test("extractTaskIdAssignment pairs tool_use_id with real id (live snake_case, numeric id)", () => {
    const msg = {
      type: "user",
      message: {
        id: "mr1",
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "tu-1", content: "Task #17 created" }],
      },
      tool_use_result: { task: { id: 17, subject: "do thing" } },
    } as unknown as SessionStreamServerMessage;
    expect(extractTaskIdAssignment(msg)).toEqual({ toolUseId: "tu-1", taskId: "17" });
  });

  test("extractTaskIdAssignment returns null without a task (non-Task tool_result)", () => {
    const msg = {
      type: "user",
      message: {
        id: "mr2",
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "tu-9", content: "File written" }],
      },
      toolUseResult: { filePath: "x.ts", structuredPatch: [] },
    } as unknown as SessionStreamServerMessage;
    expect(extractTaskIdAssignment(msg)).toBeNull();
  });

  test("extractTaskIdAssignment returns null for non-user message", () => {
    const msg = {
      type: "assistant",
      message: { id: "m3", role: "assistant", content: [] },
    } as unknown as SessionStreamServerMessage;
    expect(extractTaskIdAssignment(msg)).toBeNull();
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

  test("TaskUpdate status machine: in_progress/pending/completed/deleted driven by raw status", () => {
    // TaskCreate (temp id = tool_use_id), then exercise each TaskUpdate status
    // through the same extractTaskOps → reducer path the runtime uses.
    const taskCreate = {
      type: "assistant",
      userType: "external",
      message: {
        id: "m1",
        role: "assistant",
        content: [{ type: "tool_use", id: "tu-1", name: "TaskCreate", input: { subject: "x" } }],
      },
    } as unknown as SessionStreamServerMessage;
    const updateWith = (status: string) =>
      ({
        type: "assistant",
        userType: "external",
        message: {
          id: "m2",
          role: "assistant",
          content: [
            { type: "tool_use", id: "tu-2", name: "TaskUpdate", input: { taskId: "tu-1", status } },
          ],
        },
      }) as unknown as SessionStreamServerMessage;
    const apply = (
      tasks: ReturnType<typeof applyTaskSystemMessage>,
      msg: SessionStreamServerMessage,
    ) => extractTaskOps(msg).reduce(applyTaskSystemMessage, tasks);

    let tasks = apply([], taskCreate);
    expect(tasks[0].status).toBe("pending"); // TaskCreate → pending (implicit initial)

    tasks = apply(tasks, updateWith("pending"));
    expect(tasks[0].status).toBe("pending");

    tasks = apply(tasks, updateWith("in_progress"));
    expect(tasks[0].status).toBe("in_progress");

    tasks = apply(tasks, updateWith("completed"));
    expect(tasks[0].status).toBe("completed");

    // undefined status (addBlockedBy/addBlocks dependency edit) must NOT reset a
    // completed task — the historical bug where it fell through to "running".
    tasks = apply(tasks, {
      type: "assistant",
      userType: "external",
      message: {
        id: "m3",
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "tu-3",
            name: "TaskUpdate",
            input: { taskId: "tu-1", addBlockedBy: ["2"] },
          },
        ],
      },
    } as unknown as SessionStreamServerMessage);
    expect(tasks[0].status).toBe("completed"); // unchanged

    // any state → deleted removes from the list
    tasks = apply(tasks, updateWith("deleted"));
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

  test("applyTaskSystemMessage updates task status across pending backgrounded error completed", () => {
    let tasks = applyTaskSystemMessage(
      [],
      taskStarted("task-2", { prompt: "Inspect logs" }) as never,
    );
    expect(tasks[0]).toMatchObject({
      id: "task-2",
      description: "Inspect logs",
      status: "pending",
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

  test("isExternalApiErrorMessage false when both isApiErrorMessage and top-level error missing", () => {
    // 拓宽后：model=<synthetic> 且 (isApiErrorMessage===true 或 顶层 error 非空)。
    // 两者都缺才 false。原"isApiErrorMessage missing → false"语义收窄到这里。
    const m = apiErrorMsg();
    delete (m as Record<string, unknown>).isApiErrorMessage;
    delete (m as Record<string, unknown>).error;
    expect(isExternalApiErrorMessage(m)).toBe(false);
  });

  test("isExternalApiErrorMessage true for live-stream synthetic error (top-level error, no isApiErrorMessage)", () => {
    // 实时流 rate_limit/server_error synthetic 带 top-level error 分类字符串，
    // 不带 isApiErrorMessage 标记（JSONL 回放才带）。拓宽后命中 → 走 receiveApiError，
    // 不再误判成 command-output 卡片。apiErrorMsg() 默认 error: "server_error"。
    const m = apiErrorMsg();
    delete (m as Record<string, unknown>).isApiErrorMessage;
    expect(isExternalApiErrorMessage(m)).toBe(true);
  });

  test("isExternalApiErrorMessage false for normal model (non-synthetic) even with error field", () => {
    // model 不是 <synthetic>（真实 assistant）即使带 error 字段也不当 API 错误注解。
    const m = apiErrorMsg({
      message: { id: "e", role: "assistant", model: "claude-sonnet-4", content: [] },
    });
    expect(isExternalApiErrorMessage(m)).toBe(false);
  });
});

describe("deriveRetryInfo", () => {
  test("完整字段映射：attempt/max_retries/retry_delay_ms → RetryInfo，error/error_status 透传", () => {
    const info = deriveRetryInfo(makeApiRetry(), 12345);
    expect(info).toEqual({
      attempt: 1,
      maxRetries: 10,
      retryDelayMs: 2000,
      error: "rate_limit",
      errorStatus: 429,
      startTime: 12345,
    });
  });

  test("startTime 默认 Date.now()（不注入时为当前时间戳）", () => {
    const info = deriveRetryInfo(makeApiRetry());
    expect(info).not.toBeNull();
    expect(typeof info?.startTime).toBe("number");
    expect(info!.startTime).toBeGreaterThan(0);
  });

  test("缺 attempt → null（必要字段缺失不更新标量）", () => {
    expect(deriveRetryInfo(makeApiRetry({ attempt: undefined }))).toBeNull();
  });

  test("缺 max_retries → null", () => {
    expect(deriveRetryInfo(makeApiRetry({ max_retries: undefined }))).toBeNull();
  });

  test("缺 retry_delay_ms → null", () => {
    expect(deriveRetryInfo(makeApiRetry({ retry_delay_ms: undefined }))).toBeNull();
  });

  test("缺 error/error_status → 仍派生（二者可选，值为 undefined）", () => {
    const info = deriveRetryInfo(makeApiRetry({ error: undefined, error_status: undefined }), 99);
    expect(info).not.toBeNull();
    expect(info!.attempt).toBe(1);
    expect(info!.maxRetries).toBe(10);
    expect(info!.retryDelayMs).toBe(2000);
    expect(info!.startTime).toBe(99);
    expect(info!.error).toBeUndefined();
    expect(info!.errorStatus).toBeUndefined();
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
    const d = makeBoundaryDivider();
    expect(d.role).toBe("system");
    const custom = d.metadata?.custom as Record<string, unknown>;
    expect(custom.systemMessageType).toBe("batch-boundary");
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

  test("clears isInterrupted when setting result (self-heal)", () => {
    const messages: ThreadMessageLike[] = [
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "tu-heal",
            toolName: "Ask",
            args: {},
            isInterrupted: true,
          },
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
    expect(content[0].isInterrupted).toBeUndefined();
  });
});

describe("applyToolLifecycle", () => {
  const toolCardMsg = (overrides: Record<string, unknown> = {}): ThreadMessageLike => ({
    role: "system",
    content: [{ type: "text", text: "" }],
    metadata: {
      custom: {
        systemMessageType: "tool-card",
        toolName: "Read",
        toolCallId: "tu-1",
        ...overrides,
      },
    },
  });

  const customOf = (m: ThreadMessageLike): Record<string, unknown> =>
    m.metadata?.custom as Record<string, unknown>;

  test("resume marks unresolved tool-card as interrupted", () => {
    const messages: ThreadMessageLike[] = [toolCardMsg()];
    const { messages: next, changed } = applyToolLifecycle(messages, [], { isResume: true });
    expect(changed).toBe(true);
    expect(customOf(next[0]!).isInterrupted).toBe(true);
  });

  test("turn-end boundary marks unresolved tools before it as interrupted", () => {
    const messages: ThreadMessageLike[] = [toolCardMsg()];
    // boundary at index 1 means the tool at index 0 belongs to an ended turn
    const { messages: next, changed } = applyToolLifecycle(messages, [1], { isResume: false });
    expect(changed).toBe(true);
    expect(customOf(next[0]!).isInterrupted).toBe(true);
  });

  test("active turn (no boundary, not resume) leaves the tool running", () => {
    const messages: ThreadMessageLike[] = [toolCardMsg()];
    const { messages: next, changed } = applyToolLifecycle(messages, [], { isResume: false });
    expect(changed).toBe(false);
    expect(customOf(next[0]!).isInterrupted).toBeUndefined();
  });

  test("resume marks an unresolved agent-container as interrupted", () => {
    const messages: ThreadMessageLike[] = [
      {
        role: "system",
        content: [{ type: "text", text: "" }],
        metadata: { custom: { systemMessageType: "agent-container" } },
      },
    ];
    const { messages: next, changed } = applyToolLifecycle(messages, [], { isResume: true });
    expect(changed).toBe(true);
    expect(customOf(next[0]!).isInterrupted).toBe(true);
  });

  test("skips tool-card that already has a result", () => {
    const messages: ThreadMessageLike[] = [toolCardMsg({ result: "file contents" })];
    const { changed } = applyToolLifecycle(messages, [1], { isResume: false });
    expect(changed).toBe(false);
  });

  test("skips tool-card with isError", () => {
    const messages: ThreadMessageLike[] = [toolCardMsg({ isError: true })];
    const { changed } = applyToolLifecycle(messages, [1], { isResume: false });
    expect(changed).toBe(false);
  });

  test("skips tool-card awaiting a permission control_request", () => {
    const messages: ThreadMessageLike[] = [toolCardMsg({ controlRequestId: "cr-1" })];
    const { changed } = applyToolLifecycle(messages, [1], { isResume: false });
    expect(changed).toBe(false);
  });

  test("idempotent — already-interrupted stays interrupted", () => {
    const messages: ThreadMessageLike[] = [toolCardMsg({ isInterrupted: true })];
    const { changed } = applyToolLifecycle(messages, [1], { isResume: false });
    expect(changed).toBe(false);
  });

  test("returns unchanged reference when nothing to mark", () => {
    const messages: ThreadMessageLike[] = [toolCardMsg({ result: "done" })];
    const { messages: next, changed } = applyToolLifecycle(messages, [], { isResume: false });
    expect(changed).toBe(false);
    expect(next).toBe(messages);
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

const makeBatchBoundary = (): SessionStreamServerMessage =>
  ({
    type: "system",
    subtype: "batch_boundary",
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

const compactBoundary = (overrides: Record<string, unknown> = {}): SessionStreamServerMessage =>
  ({
    type: "system",
    subtype: "compact_boundary",
    compactMetadata: {
      trigger: "manual",
      preTokens: 224734,
      postTokens: 162477,
      durationMs: 132812,
      messagesSummarized: 48,
    },
    ...overrides,
  }) as unknown as SessionStreamServerMessage;

const compactSummary = (
  text: string,
  overrides: Record<string, unknown> = {},
): SessionStreamServerMessage =>
  ({
    type: "user",
    isCompactSummary: true,
    summarizeMetadata: { messagesSummarized: 48, direction: "from" },
    message: { role: "user", content: text },
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

const makeApiRetry = (overrides: Record<string, unknown> = {}): SessionStreamServerMessage =>
  ({
    type: "system",
    subtype: "api_retry",
    attempt: 1,
    max_retries: 10,
    retry_delay_ms: 2000,
    error: "rate_limit",
    error_status: 429,
    ...overrides,
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
  test("a non-error result emits only a turn-end marker (renders no bubble)", () => {
    const items = normalizeChatStream([
      makeAssistant("a1", [{ type: "text", text: "done" }]),
      {
        type: "result",
        subtype: "success",
        session_id: "s1",
        num_turns: 2,
      } as unknown as SessionStreamServerMessage,
    ]);
    expect(items).toHaveLength(2);
    expect(items[0].kind).toBe("assistant");
    expect(items[1].kind).toBe("turn-end");
  });

  test("an error result emits a turn-end marker plus a result-error item", () => {
    const items = normalizeChatStream([
      makeAssistant("a1", [{ type: "text", text: "partial" }]),
      {
        type: "result",
        subtype: "error",
        is_error: true,
        result: "something went wrong",
      } as unknown as SessionStreamServerMessage,
    ]);
    expect(items).toHaveLength(3);
    expect(items[1].kind).toBe("turn-end");
    expect(items[2].kind).toBe("result-error");
    expect((items[2] as { text: string }).text).toBe("something went wrong");
  });

  // ── HiddenDropped ───────────────────────────────────────────────────
  test("hidden/internal messages with no association key are dropped", () => {
    const items = normalizeChatStream([
      makeAssistant("a1", [{ type: "text", text: "hidden" }], { isMeta: true }),
    ]);
    expect(assistantItems(items)).toHaveLength(0);
  });

  test("synthetic assistant (model=<synthetic>) renders as a command-output item", () => {
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
    expect(items.filter((i) => i.kind === "command-output")).toHaveLength(1);
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
  test("system.init produces no item (scalar-only, folded by applyMessageScalarState)", () => {
    const items = normalizeChatStream([makeSystemInit()]);
    expect(items).toHaveLength(0);
  });

  test("system.api_retry produces no item (transient RetryIndicator state, not a bubble)", () => {
    // api_retry 是纯实时流信号（不进 JSONL），标量由 applyMessageScalarState→
    // deriveRetryInfo 接管（→ RetryIndicator），normalizeChatStream 不产 item、
    // 不落 fallback 摘要气泡。
    const items = normalizeChatStream([makeApiRetry()]);
    expect(items).toHaveLength(0);
  });

  test("system.api_retry without required fields still produces no item (no fallback)", () => {
    // 缺必要字段：deriveRetryInfo 返回 null（标量不更新），但仍 continue 不落 fallback。
    const items = normalizeChatStream([makeApiRetry({ attempt: undefined })]);
    expect(items).toHaveLength(0);
  });

  test("system.turn_duration produces no item (pure display noise)", () => {
    const items = normalizeChatStream([
      {
        type: "system",
        subtype: "turn_duration",
        durationMs: 1234,
      } as unknown as SessionStreamServerMessage,
    ]);
    expect(items).toHaveLength(0);
  });

  test("system.seed_init produces no item (scalar-only, folded by applyMessageScalarState)", () => {
    const items = normalizeChatStream([
      {
        type: "system",
        subtype: "seed_init",
        model: "claude-sonnet-4-20250514",
        permissionMode: "bypassPermissions",
      } as unknown as SessionStreamServerMessage,
    ]);
    expect(items).toHaveLength(0);
  });

  test("compact_boundary + summary + attachments merge into one compact-block", () => {
    const items = normalizeChatStream([
      compactBoundary(),
      compactSummary("Summary text..."),
      attachment("file", { displayPath: "src/a.ts" }),
      attachment("plan_file_reference", { planFilePath: "plan.md" }),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("compact-block");
    const block = items[0] as Extract<ChatStreamItem, { kind: "compact-block" }>;
    expect(block.trigger).toBe("manual");
    expect(block.preTokens).toBe(224734);
    expect(block.postTokens).toBe(162477);
    expect(block.durationMs).toBe(132812);
    expect(block.messagesSummarized).toBe(48);
    expect(block.summaryText).toBe("Summary text...");
    expect(block.attachments).toHaveLength(2);
    expect(block.attachments[0].subtype).toBe("file");
    expect(block.attachments[1].subtype).toBe("plan_file_reference");
  });

  test("out-of-window attachment (after a real turn) stays a standalone item", () => {
    const items = normalizeChatStream([
      compactBoundary(),
      compactSummary("Summary..."),
      makeAssistant("a1", [{ type: "text", text: "post-compact turn" }]),
      attachment("hook_success", { hookName: "PreToolUse" }),
    ]);
    expect(items.map((i) => i.kind)).toEqual(["compact-block", "assistant", "attachment"]);
  });

  test("compact-block without a summary does not crash (summaryText undefined)", () => {
    const items = normalizeChatStream([
      compactBoundary(),
      attachment("compact_file_reference", { displayPath: "src/x.ts" }),
    ]);
    expect(items).toHaveLength(1);
    const block = items[0] as Extract<ChatStreamItem, { kind: "compact-block" }>;
    expect(block.summaryText).toBeUndefined();
    expect(block.attachments).toHaveLength(1);
  });

  test("in-window isMeta user noise is dropped but the window stays open", () => {
    const items = normalizeChatStream([
      compactBoundary(),
      compactSummary("Summary..."),
      makeUser("noise", { isMeta: true }),
      attachment("file", { displayPath: "a.ts" }),
    ]);
    expect(items).toHaveLength(1);
    const block = items[0] as Extract<ChatStreamItem, { kind: "compact-block" }>;
    // noise dropped; the following attachment is still absorbed
    expect(block.attachments).toHaveLength(1);
  });

  test("manual /compact command noise is dropped and attachments stay merged", () => {
    const commandEcho: SessionStreamServerMessage = {
      type: "user",
      message: {
        role: "user",
        content:
          "<command-name>/compact</command-name>\n<command-message>compact</command-message>",
      },
    } as unknown as SessionStreamServerMessage;
    const localStdout: SessionStreamServerMessage = {
      type: "user",
      message: {
        role: "user",
        content:
          "<local-command-stdout>Compacted (ctrl+o to see full summary)</local-command-stdout>",
      },
    } as unknown as SessionStreamServerMessage;

    const items = normalizeChatStream([
      compactBoundary(),
      compactSummary("Summary..."),
      makeUser("caveat", { isMeta: true }),
      commandEcho,
      localStdout,
      attachment("file", { displayPath: "a.ts" }),
      attachment("plan_file_reference", { planFilePath: "plan.md" }),
    ]);
    expect(items).toHaveLength(1);
    const block = items[0] as Extract<ChatStreamItem, { kind: "compact-block" }>;
    expect(block.trigger).toBe("manual");
    expect(block.attachments).toHaveLength(2);
  });

  test("isCompactWindowUserNoise only matches user command artifacts", () => {
    expect(isCompactWindowUserNoise(makeUser("hi", { isMeta: true }))).toBe(true);
    expect(
      isCompactWindowUserNoise({
        type: "user",
        message: { role: "user", content: "<command-name>/compact</command-name>" },
      } as unknown as SessionStreamServerMessage),
    ).toBe(true);
    expect(
      isCompactWindowUserNoise({
        type: "user",
        message: { role: "user", content: "<local-command-stdout>x</local-command-stdout>" },
      } as unknown as SessionStreamServerMessage),
    ).toBe(true);
    expect(isCompactWindowUserNoise(makeUser("real prompt"))).toBe(false);
    expect(isCompactWindowUserNoise({ type: "assistant" } as SessionStreamServerMessage)).toBe(
      false,
    );
  });

  test("microcompact_boundary maps to trigger 'micro'", () => {
    const items = normalizeChatStream([
      { type: "system", subtype: "microcompact_boundary" } as unknown as SessionStreamServerMessage,
      compactSummary("micro summary"),
    ]);
    const block = items[0] as Extract<ChatStreamItem, { kind: "compact-block" }>;
    expect(block.trigger).toBe("micro");
  });

  test("auto trigger (compactMetadata.trigger !== manual) maps to 'auto'", () => {
    const items = normalizeChatStream([compactBoundary({ compactMetadata: { trigger: "auto" } })]);
    const block = items[0] as Extract<ChatStreamItem, { kind: "compact-block" }>;
    expect(block.trigger).toBe("auto");
  });

  test("boundary as the final message flushes the window post-loop", () => {
    const items = normalizeChatStream([
      makeAssistant("a1", [{ type: "text", text: "pre" }]),
      compactBoundary(),
    ]);
    expect(items.map((i) => i.kind)).toEqual(["assistant", "compact-block"]);
  });

  test("adjacent boundaries produce two compact-blocks", () => {
    const items = normalizeChatStream([
      compactBoundary(),
      compactSummary("first"),
      compactBoundary({ compactMetadata: { trigger: "auto" } }),
      compactSummary("second"),
    ]);
    expect(items.filter((i) => i.kind === "compact-block")).toHaveLength(2);
  });

  // compact-block windowing: render only the LAST compact block. Content before
  // the most recent compact_boundary is compacted away at the render layer.
  test("renderChatStream renders only the last compact block (+ following live)", () => {
    const items = normalizeChatStream([
      makeAssistant("m-old", [{ type: "text", text: "old block content" }]),
      compactBoundary(),
      compactSummary("first summary"),
      makeAssistant("m-mid", [{ type: "text", text: "between blocks" }]),
      compactBoundary({ compactMetadata: { trigger: "auto" } }),
      compactSummary("second summary"),
      makeAssistant("m-after", [{ type: "text", text: "after the last compact" }]),
    ]);
    // Sanity: two compact-block markers in state.
    expect(items.filter((i) => i.kind === "compact-block")).toHaveLength(2);

    const rendered = renderChatStream(items);
    const flatText = rendered
      .flatMap((m) => (Array.isArray(m.content) ? m.content : []))
      .map((p) => (p.type === "text" ? p.text : ""))
      .join("\n");

    // Last block + following live survive…
    expect(flatText).toContain("after the last compact");
    // …earlier compacted-away content is dropped at the render layer.
    expect(flatText).not.toContain("old block content");
    expect(flatText).not.toContain("between blocks");

    // Exactly one compact-block system message — the last one ("second").
    const compactBlocks = rendered.filter(
      (m) =>
        (m.metadata?.custom as Record<string, unknown> | undefined)?.systemMessageType ===
        "compact-block",
    );
    expect(compactBlocks).toHaveLength(1);
    expect((compactBlocks[0].metadata?.custom as Record<string, unknown>)?.summaryText).toBe(
      "second summary",
    );
  });

  // No compact_boundary ⇒ nothing to window, full render (fallback).
  test("renderChatStream with no compact block renders everything", () => {
    const items = normalizeChatStream([makeAssistant("m1", [{ type: "text", text: "keep me" }])]);
    const rendered = renderChatStream(items);
    const flatText = rendered
      .flatMap((m) => (Array.isArray(m.content) ? m.content : []))
      .map((p) => (p.type === "text" ? p.text : ""))
      .join("\n");
    expect(flatText).toContain("keep me");
  });

  // ── batch-boundary passthrough ──────────────────────────────────────
  test("batch_boundary marker passes through as a batch-boundary item", () => {
    const items = normalizeChatStream([makeBatchBoundary()]);
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("batch-boundary");
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

  test("compact-block renders a system message carrying raw fields (no localized text)", () => {
    const rendered = renderChatStream(
      normalizeChatStream([
        makeAssistant("a1", [{ type: "text", text: "pre" }]),
        compactBoundary(),
        compactSummary("Summary text..."),
        attachment("file", { displayPath: "src/a.ts" }),
      ]),
    );
    const block = rendered[rendered.length - 1];
    expect(block.role).toBe("system");
    const custom = block.metadata?.custom as Record<string, unknown>;
    expect(custom?.systemMessageType).toBe("compact-block");
    expect(custom?.trigger).toBe("manual");
    expect(custom?.preTokens).toBe(224734);
    expect(custom?.postTokens).toBe(162477);
    expect(custom?.summaryText).toBe("Summary text...");
    expect(Array.isArray(custom?.attachments)).toBe(true);
    // The adapter carries raw values only — localization is the component's job,
    // so no hardcoded compactText must leak through.
    expect(custom?.compactText).toBeUndefined();
  });

  test("system.init renders no bubble (scalar-only)", () => {
    const rendered = renderChatStream(normalizeChatStream([makeSystemInit()]));
    expect(rendered).toHaveLength(0);
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
        makeBatchBoundary(),
      ]),
    );
    // assistant bubble + boundary divider
    expect(rendered).toHaveLength(2);
    expect((rendered[1].metadata?.custom as Record<string, unknown>)?.systemMessageType).toBe(
      "batch-boundary",
    );
  });

  test("batch-boundary with no visible neighbor is dropped", () => {
    const items = normalizeChatStream([makeBatchBoundary()]);
    const rendered = renderChatStream(items);
    // A lone boundary with nothing on either side renders nothing.
    expect(rendered).toHaveLength(0);
  });

  test("batch-boundary is drawn when a visible neighbor follows it", () => {
    const rendered = renderChatStream(
      normalizeChatStream([
        makeBatchBoundary(),
        makeAssistant("a1", [{ type: "text", text: "after boundary" }]),
      ]),
    );
    // boundary divider + assistant bubble
    expect(rendered).toHaveLength(2);
    expect(rendered[0].role).toBe("system");
  });

  test("resume marks unresolved tool-calls as interrupted on the rendered output", () => {
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
    expect((toolCard?.metadata?.custom as Record<string, unknown>)?.isInterrupted).toBe(true);
  });

  test("active turn (non-resume, no result) leaves tool-calls running", () => {
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
    expect((toolCard?.metadata?.custom as Record<string, unknown>)?.isInterrupted).toBeUndefined();
  });

  test("live interrupt (result subtype interrupted) marks in-flight tool as interrupted", () => {
    const items = normalizeChatStream([
      makeAssistant("a1", [{ type: "tool_use", id: "tu-1", name: "bash", input: {} }]),
      result("interrupted"),
    ]);
    const rendered = renderChatStream(items, { isResume: false });
    const toolCard = rendered.find(
      (m) =>
        m.role === "system" &&
        ((m.metadata?.custom as Record<string, unknown>)?.systemMessageType as string) ===
          "tool-card",
    );
    expect(toolCard).toBeDefined();
    expect((toolCard?.metadata?.custom as Record<string, unknown>)?.isInterrupted).toBe(true);
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
  test('maps "in_progress"', () => {
    expect(normalizeAttachmentTaskStatus("in_progress")).toBe("in_progress");
  });
  test('maps "pending"', () => {
    expect(normalizeAttachmentTaskStatus("pending")).toBe("pending");
  });
  test("maps unknown status to in_progress", () => {
    expect(normalizeAttachmentTaskStatus("unknown")).toBe("in_progress");
  });
});

// ── Turn-end footer stats ──────────────────────────────────────────────
// result carries num_turns / total_cost_usd / duration_ms / usage /
// terminal_reason. Pass 1 lifts them onto the turn-end item; Pass 2 stamps
// them as metadata.custom.turnStats on the turn's last assistant bubble.

const resultWithStats = (overrides: Record<string, unknown> = {}): SessionStreamServerMessage =>
  ({
    type: "result",
    subtype: "success",
    num_turns: 43,
    total_cost_usd: 2.621,
    duration_ms: 60732,
    usage: {
      input_tokens: 405532,
      output_tokens: 32780,
      cache_read_input_tokens: 1671424,
    },
    terminal_reason: "completed",
    ...overrides,
  }) as unknown as SessionStreamServerMessage;

describe("turn-end footer stats", () => {
  test("Pass 1 lifts result stats onto the turn-end item", () => {
    const items = normalizeChatStream([
      user([{ type: "text", text: "hi" }]),
      assistant("a1", [{ type: "text", text: "hello" }]),
      resultWithStats(),
    ]);
    const turnEnd = items.find((i) => i.kind === "turn-end") as
      | ({ kind: "turn-end" } & { turnStats?: Record<string, unknown> })
      | undefined;
    expect(turnEnd).toBeDefined();
    expect(turnEnd?.turnStats).toBeDefined();
    expect(turnEnd?.turnStats?.numTurns).toBe(43);
    expect(turnEnd?.turnStats?.totalCostUsd).toBe(2.621);
    expect(turnEnd?.turnStats?.durationMs).toBe(60732);
    expect(turnEnd?.turnStats?.inputTokens).toBe(405532);
    expect(turnEnd?.turnStats?.outputTokens).toBe(32780);
    expect(turnEnd?.turnStats?.cacheReadTokens).toBe(1671424);
    expect(turnEnd?.turnStats?.terminalReason).toBe("completed");
  });

  test("Pass 2 stamps custom.turnStats onto the turn's last assistant bubble", () => {
    const rendered = renderChatStream(
      normalizeChatStream([
        user([{ type: "text", text: "hi" }]),
        assistant("a1", [{ type: "text", text: "hello" }]),
        resultWithStats(),
      ]),
    );
    const assistantBubble = rendered.find((m) => m.role === "assistant");
    expect(assistantBubble).toBeDefined();
    const turnStats = (assistantBubble?.metadata?.custom as Record<string, unknown> | undefined)
      ?.turnStats as Record<string, unknown> | undefined;
    expect(turnStats).toBeDefined();
    expect(turnStats?.numTurns).toBe(43);
    expect(turnStats?.totalCostUsd).toBe(2.621);
    expect(turnStats?.terminalReason).toBe("completed");
  });

  test("stamp targets only the current turn's range (no cross-turn bleed)", () => {
    // Turn 1 ends, then a new turn 2 with its own assistant + result. The
    // turn-1 footer must NOT land on the turn-2 bubble and vice versa.
    const rendered = renderChatStream(
      normalizeChatStream([
        user([{ type: "text", text: "t1" }]),
        assistant("a1", [{ type: "text", text: "one" }]),
        resultWithStats({ num_turns: 1, total_cost_usd: 0.1 }),
        user([{ type: "text", text: "t2" }]),
        assistant("a2", [{ type: "text", text: "two" }]),
        resultWithStats({ num_turns: 2, total_cost_usd: 0.2 }),
      ]),
    );
    const assistants = rendered.filter((m) => m.role === "assistant");
    expect(assistants.length).toBe(2);
    const t1 = (assistants[0]?.metadata?.custom as Record<string, unknown> | undefined)
      ?.turnStats as Record<string, unknown> | undefined;
    const t2 = (
      assistants[assistants.length - 1]?.metadata?.custom as Record<string, unknown> | undefined
    )?.turnStats as Record<string, unknown> | undefined;
    expect(t1?.numTurns).toBe(1);
    expect(t2?.numTurns).toBe(2);
  });

  test("turn with no assistant bubble in range → no stamp, no crash", () => {
    const rendered = renderChatStream(
      normalizeChatStream([
        user([{ type: "text", text: "hi" }]),
        // No assistant message before the result.
        resultWithStats(),
      ]),
    );
    const stamped = rendered.find(
      (m) => (m.metadata?.custom as Record<string, unknown> | undefined)?.turnStats != null,
    );
    expect(stamped).toBeUndefined();
  });

  test("result carries turnStats.subtype even without numeric stats (status fallback)", () => {
    const items = normalizeChatStream([
      user([{ type: "text", text: "hi" }]),
      assistant("a1", [{ type: "text", text: "hello" }]),
      result("interrupted"),
    ]);
    const turnEnd = items.find((i) => i.kind === "turn-end") as
      | ({ kind: "turn-end" } & { turnStats?: Record<string, unknown> })
      | undefined;
    // subtype is always present on a result → always carried, so the footer
    // can still show a status word via mapTurnStatusTone's subtype fallback.
    expect(turnEnd?.turnStats?.subtype).toBe("interrupted");
    expect(turnEnd?.turnStats?.numTurns).toBeUndefined();
    expect(turnEnd?.turnStats?.totalCostUsd).toBeUndefined();
  });

  test("resume (no result messages) → no turnStats anywhere", () => {
    // JSONL replay carries no `result` messages, so normalizeChatStream emits
    // no turn-end items and no bubble gets stamped.
    const rendered = renderChatStream(
      normalizeChatStream([
        user([{ type: "text", text: "hi" }]),
        assistant("a1", [{ type: "text", text: "hello" }]),
      ]),
    );
    const stamped = rendered.find(
      (m) => (m.metadata?.custom as Record<string, unknown> | undefined)?.turnStats != null,
    );
    expect(stamped).toBeUndefined();
  });
});

describe("mapTurnStatusTone", () => {
  test("maps each terminal_reason to its tone", () => {
    expect(mapTurnStatusTone("completed")).toBe("completed");
    expect(mapTurnStatusTone("aborted_streaming")).toBe("interrupted");
    expect(mapTurnStatusTone("aborted_tools")).toBe("interrupted");
    expect(mapTurnStatusTone("max_turns")).toBe("maxTurns");
    expect(mapTurnStatusTone("model_error")).toBe("error");
    expect(mapTurnStatusTone("image_error")).toBe("error");
    expect(mapTurnStatusTone("prompt_too_long")).toBe("error");
    expect(mapTurnStatusTone("blocking_limit")).toBe("rateLimited");
    expect(mapTurnStatusTone("rapid_refill_breaker")).toBe("rateLimited");
    expect(mapTurnStatusTone("stop_hook_prevented")).toBe("hookStopped");
    expect(mapTurnStatusTone("hook_stopped")).toBe("hookStopped");
    expect(mapTurnStatusTone("tool_deferred")).toBe("toolDeferred");
  });

  test("falls back to subtype when terminal_reason is unset", () => {
    expect(mapTurnStatusTone(undefined, "interrupted")).toBe("interrupted");
    expect(mapTurnStatusTone(undefined, "error")).toBe("error");
    expect(mapTurnStatusTone(undefined, "error_max_turns")).toBe("error");
    expect(mapTurnStatusTone(undefined, "success")).toBe("completed");
  });

  test("returns null when neither terminal_reason nor subtype is known", () => {
    expect(mapTurnStatusTone(undefined, undefined)).toBeNull();
    expect(mapTurnStatusTone(null, null)).toBeNull();
    expect(mapTurnStatusTone("some_future_value", "success")).toBe("completed");
  });
});
