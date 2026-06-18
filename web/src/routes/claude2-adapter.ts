import { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ExternalStoreAdapter, AppendMessage, ThreadMessageLike } from "@assistant-ui/react";
import type {
  Claude2Attachment,
  Claude2ControlResponse,
  Claude2QueueOperation,
  SessionStreamServerMessage,
} from "@agents-remote/shared";
import { claude2StreamUrl } from "../api/client";

export type TaskInfo = {
  id: string;
  agentType?: string;
  workflowName?: string;
  subject?: string;
  description: string;
  status: "running" | "completed" | "error" | "backgrounded";
  text?: string;
  summary?: string;
  error?: string;
  kind: "agent" | "workflow" | "task";
};

type TaskSystemMessage = Extract<
  SessionStreamServerMessage,
  { type: "system"; subtype: "task_started" | "task_updated" | "task_notification" }
>;

type AskUserQuestionAssistantMessage = Extract<SessionStreamServerMessage, { type: "assistant" }>;

const _isTaskSystemMessage = (msg: SessionStreamServerMessage): msg is TaskSystemMessage =>
  msg.type === "system" &&
  "subtype" in msg &&
  (msg.subtype === "task_started" ||
    msg.subtype === "task_updated" ||
    msg.subtype === "task_notification");

export const isSyntheticAssistantMessage = (msg: SessionStreamServerMessage): boolean =>
  msg.type === "assistant" && (msg.message as { model?: string }).model === "<synthetic>";

export const buildAllowAllControlResponse = (requestId: string): Claude2ControlResponse => ({
  type: "control_response",
  response: {
    subtype: "success",
    request_id: requestId,
    response: { behavior: "allow", updatedInput: {} },
  },
});

export const injectAskUserQuestionRequestId = (
  assistantMsg: AskUserQuestionAssistantMessage,
  requestId: string,
): AskUserQuestionAssistantMessage => ({
  ...assistantMsg,
  message: {
    ...assistantMsg.message,
    content: assistantMsg.message.content.map((block) => {
      if (block.type === "tool_use" && block.name === "AskUserQuestion") {
        return {
          ...block,
          input: { ...block.input, __controlRequestId: requestId },
        };
      }
      return block;
    }),
  },
});

export type SwitchModelResultState = {
  currentModel?: string;
  modelSwitchVersion: number;
};

export type RetryInfo = {
  attempt: number;
  maxRetries: number;
  retryDelayMs: number;
  error?: string;
  errorStatus?: number;
  startTime: number;
};

export const applySwitchModelResult = (
  state: SwitchModelResultState,
  result: { success: boolean },
): SwitchModelResultState => ({
  currentModel: result.success ? state.currentModel : undefined,
  modelSwitchVersion: state.modelSwitchVersion + 1,
});

export const applyTaskSystemMessage = (prev: TaskInfo[], msg: TaskSystemMessage): TaskInfo[] => {
  // task_started: always creates. TaskCreate-originated ops carry no id
  // (empty string) — assign a sequential id (1, 2, 3, ...) by creation order.
  // Real system/task_started messages keep their own task_id.
  if (msg.subtype === "task_started") {
    const id = msg.task_id || String(prev.length + 1);
    const kind: TaskInfo["kind"] = msg.workflowName ? "workflow" : msg.agentType ? "agent" : "task";
    return [
      ...prev,
      {
        id,
        kind,
        agentType: msg.agentType,
        workflowName: msg.workflowName,
        subject: msg.subject,
        description: msg.prompt ?? "",
        status: "running",
      },
    ];
  }

  // task_updated / task_notification: update an EXISTING task only.
  // Unknown ids are skipped — never create orphan entries.
  const existing = prev.findIndex((t) => t.id === msg.task_id);
  if (existing < 0) return prev;

  const updated = [...prev];
  const current = updated[existing];
  const kind = current.kind;

  if (msg.subtype === "task_updated") {
    const isCompleted = (msg as Record<string, unknown>).isCompleted === true;
    updated[existing] = {
      ...current,
      kind,
      status: msg.error
        ? "error"
        : isCompleted
          ? "completed"
          : msg.isBackgrounded
            ? "backgrounded"
            : "running",
      ...(msg.error ? { error: msg.error } : {}),
    };
    return updated;
  }

  updated[existing] = {
    ...current,
    kind,
    status: "completed",
    description: msg.summary || current.description,
    text: msg.text ?? current.text,
    ...(msg.summary ? { summary: msg.summary } : {}),
  };
  return updated;
};

// ── Queue Operation State ──────────────────────────────────────────────

export type QueueEntry = {
  content: string;
  source: "user" | "assistant";
};

/** XML 格式 → "assistant"，其余（斜杠命令、纯文本、空）→ "user" */
export const deriveQueueSource = (content: string | undefined): "user" | "assistant" => {
  if (!content) return "user";
  const trimmed = content.trim();
  return /^<[A-Za-z][\s\S]*<\/[A-Za-z][\w-]*>$/.test(trimmed) ||
    /^<[A-Za-z][\w-]*(\s[^>]*)?\/>$/.test(trimmed)
    ? "assistant"
    : "user";
};

/** 纯 reducer：按 operation 语义操作 FIFO+LIFO 混合队列 */
export const applyQueueOperation = (
  state: QueueEntry[],
  msg: Claude2QueueOperation,
): QueueEntry[] => {
  switch (msg.operation) {
    case "enqueue":
      return [...state, { content: msg.content ?? "", source: deriveQueueSource(msg.content) }];
    case "dequeue":
      return state.slice(1);
    case "remove":
      return state.slice(0, -1);
    case "popAll":
      return [];
  }
};

// KEPT: task 批量派生，后续在新架构下重新接入
/*
export const deriveTasksFromReplayBatch = (batch: SessionStreamServerMessage[]): TaskInfo[] => {
  let tasks: TaskInfo[] = [];
  for (const msg of batch) {
    if (!msg || !isTaskSystemMessage(msg)) continue;
    tasks = applyTaskSystemMessage(tasks, msg);
  }
  return tasks;
};
*/

// ── Bridge Context ──────────────────────────────────────────────────
//
// AskUserQuestionToolUI renders deep inside the assistant-ui tree and
// needs to send answers back through the WebSocket. Instead of module-
// level singletons (which Vite HMR resets), we use React Context — the
// hook creates the bridge, the route component provides it, and the
// tool UI consumes it.

export type Claude2Bridge = {
  respondToControlRequest: (requestId: string, updatedInput: Record<string, unknown>) => void;
  cancelControlRequest: (requestId: string) => void;
  sendToolResult: (toolUseId: string, content: string) => void;
  sendMessage: (text: string) => void;
  switchModel: (model: string) => void;
  switchPermissionMode: (mode: string) => void;
  onCompact: ((event: { phase: "start" } | { phase: "end"; error?: string }) => void) | null;
};

export const Claude2BridgeContext = createContext<Claude2Bridge | null>(null);

const _SKILL_CONTENT_PREFIX = "Base directory for this skill:";

const _extractUserTextBlocks = (content: unknown): string[] => {
  if (!Array.isArray(content)) return [];
  return (content as Array<Record<string, unknown>>)
    .filter((block) => block.type === "text" && typeof block.text === "string" && block.text.trim())
    .map((block) => block.text as string);
};

const _isHiddenSkillContent = (texts: string[]): boolean =>
  texts.some((text) => text.startsWith(_SKILL_CONTENT_PREFIX));

const getMessageUuid = (msg: SessionStreamServerMessage): string | null => {
  const uuid = (msg as Record<string, unknown>).uuid;
  return typeof uuid === "string" ? uuid : null;
};

// KEPT: 后续需要去重时启用
/*
const findMissingTailByUuid = (
  localMessages: SessionStreamServerMessage[],
  snapshotMessages: SessionStreamServerMessage[],
): SessionStreamServerMessage[] | null => {
  if (localMessages.length === 0) return snapshotMessages;

  const localUuids = new Set(
    localMessages.map(getMessageUuid).filter((uuid): uuid is string => uuid !== null),
  );
  if (localUuids.size === 0) return snapshotMessages;

  for (let i = snapshotMessages.length - 1; i >= 0; i--) {
    const uuid = getMessageUuid(snapshotMessages[i]!);
    if (!uuid) continue;
    if (localUuids.has(uuid)) {
      return snapshotMessages.slice(i + 1);
    }
  }

  return null;
};
*/

/**
 * Whether an assistant response is currently in-flight (isRunning).
 *
 * Opens on the first assistant delta or the first thinking_tokens event of a
 * response; closes when a result arrives. Multiple assistant deltas in the
 * same response count as one, not N.
 */
export function computeRunningCount(rawMessages: SessionStreamServerMessage[]): number {
  let responseOpen = false;

  for (const msg of rawMessages) {
    if (!msg) continue;

    if (msg.type === "result") {
      responseOpen = false;
      continue;
    }

    if (msg.type === "assistant") {
      responseOpen = true;
      continue;
    }

    if (msg.type === "system" && "subtype" in msg && msg.subtype === "thinking_tokens") {
      responseOpen = true;
      continue;
    }
  }

  return responseOpen ? 1 : 0;
}

// ── Unified message dispatch ─────────────────────────────────────────
// Entry point for all live messages after batch processing.
// Converts SessionStreamServerMessage → ThreadMessageLike | null.
// Returns null for messages that don't produce UI output (business logic
// like compact, retry, task, etc. handled internally).

// ── State delta ──────────────────────────────────────────────────────
// processMessage is the single entry point: raw message → all state updates.
// It lives inside the hook and directly applies state changes.
// Building blocks (convertContentToBubble, extractTaskOps, etc.) are
// exported for unit testing; the orchestration is integration-tested
// via the hook tests.

// ── Content block processor ─────────────────────────────────────────

type RawContentBlock = { type: string } & Record<string, unknown>;

function processContentBlock(block: RawContentBlock): Record<string, unknown> | null {
  switch (block.type) {
    case "thinking":
      return { type: "reasoning", text: block.thinking as string };
    case "text":
      return { type: "text", text: block.text as string };
    case "tool_use": {
      const b = block;
      return {
        type: "tool-call",
        toolCallId: b.id as string,
        toolName: b.name as string,
        args: (b.input ?? {}) as Record<string, unknown>,
        argsText: JSON.stringify(b.input ?? {}),
      };
    }
    default:
      return null;
  }
}

function extractTaskOpFromBlock(block: RawContentBlock): TaskSystemMessage | null {
  if (block.type !== "tool_use") return null;
  const toolName = block.name as string;
  const input = (block.input ?? {}) as Record<string, unknown>;

  if (toolName === "TaskCreate") {
    // No task_id here — the reducer assigns a sequential id (1, 2, 3, …)
    // in TaskCreate order. TaskUpdate later references that id via input.taskId.
    return {
      type: "system",
      subtype: "task_started",
      task_id: "",
      agentType: input.subagent_type as string | undefined,
      workflowName: input.workflow_name as string | undefined,
      subject: input.subject as string | undefined,
      prompt: (input.description ?? input.prompt ?? toolName) as string,
      session_id: "",
    } as unknown as TaskSystemMessage;
  }
  if (toolName === "TaskUpdate") {
    const status = input.status as string;
    const taskId = (input.taskId ?? input.task_id ?? input.id) as string;
    return {
      type: "system",
      subtype: "task_updated",
      task_id: taskId,
      isBackgrounded: status === "backgrounded",
      isCompleted: status === "completed",
      error: input.error as string | undefined,
      session_id: "",
    } as unknown as TaskSystemMessage;
  }
  return null;
}

export function extractTaskOps(msg: SessionStreamServerMessage): TaskSystemMessage[] {
  if (msg.type !== "assistant") return [];
  const assistantMsg = msg as unknown as { message: { content: RawContentBlock[] } };
  return assistantMsg.message.content
    .map(extractTaskOpFromBlock)
    .filter((op): op is TaskSystemMessage => op !== null);
}

export function hasToolUseNamed(msg: SessionStreamServerMessage, toolName: string): boolean {
  if (msg.type !== "assistant") return false;
  const assistantMsg = msg as unknown as { message: { content: RawContentBlock[] } };
  return assistantMsg.message.content.some(
    (b) => b.type === "tool_use" && (b.name === toolName || b.name === toolName.toLowerCase()),
  );
}

// ── Attachment handler ─────────────────────────────────────────────────
//
// Pure function: maps an attachment message to { bubble?, stateOps? }.
// The caller (handleExternalMessage hook context) applies state side effects
// and pushes the bubble to the message list. Exported for unit testing.
//
// Each case maps to one of:
//   1. bubble only (file, hook, environment subtypes)
//   2. stateOps only (task, session metadata subtypes — no bubble)
//   3. bubble + stateOps (mode transitions)
//
// Unknown / unimplemented subtypes fall through to a placeholder bubble.

export type AttachmentStateOps = {
  permissionMode?: string;
  replaceTasks?: TaskInfo[];
  taskStatus?: {
    id: string;
    taskType: string;
    description: string;
    status: string;
  };
  skills?: string[];
  skillsAdd?: string[];
  slashCommands?: string[];
  mcpServersAdd?: string[];
};

export type AttachmentResult = {
  bubble?: ThreadMessageLike | null;
  stateOps?: AttachmentStateOps | null;
};

function makeAttachmentBubble(subtype: string, raw: Claude2Attachment): ThreadMessageLike {
  return {
    role: "system",
    content: [{ type: "text", text: `Attachment: ${subtype}` }],
    metadata: { custom: { _raw: raw, attachmentType: subtype } },
  };
}

export function handleAttachment(msg: Claude2Attachment): AttachmentResult {
  const att = msg.attachment;
  if (!att?.type) return { bubble: makeAttachmentBubble("unknown", msg) };

  switch (att.type) {
    // ── Mode transitions ──────────────────────────────────────────
    case "plan_mode":
    case "plan_mode_reentry":
      return {
        bubble: makeAttachmentBubble(att.type, msg),
        stateOps: { permissionMode: "plan" },
      };
    case "plan_mode_exit":
      return { bubble: makeAttachmentBubble(att.type, msg) };
    case "auto_mode":
      return {
        bubble: makeAttachmentBubble(att.type, msg),
        stateOps: { permissionMode: "auto" },
      };
    case "auto_mode_exit":
      return {
        bubble: makeAttachmentBubble(att.type, msg),
        stateOps: { permissionMode: "default" },
      };

    // ── Tasks ─────────────────────────────────────────────────────
    case "task_reminder":
      return {
        stateOps: {
          replaceTasks: att.content.map((t) => ({
            id: t.id ?? "",
            kind: "task" as const,
            description: t.subject ?? "",
            status: normalizeAttachmentTaskStatus(t.status ?? "running"),
            subject: t.subject,
          })),
        },
      };
    case "task_status":
      return {
        stateOps: {
          taskStatus: {
            id: att.taskId,
            taskType: att.taskType,
            description: att.description,
            status: att.status,
          },
        },
      };

    // ── Session metadata ──────────────────────────────────────────
    case "skill_listing":
      return {
        stateOps: {
          skills: att.content
            .split("\n")
            .filter((l) => l.startsWith("- "))
            .map((l) => l.slice(2).split(":")[0].trim())
            .filter(Boolean),
        },
      };
    case "mcp_instructions_delta":
      return { stateOps: { mcpServersAdd: att.addedNames } };
    case "command_permissions":
      return { stateOps: { slashCommands: att.allowedTools } };
    case "invoked_skills":
      return {
        stateOps: {
          skillsAdd: att.skills.map((s) => s.name),
        },
      };

    // ── Files / Hooks / Environment ───────────────────────────────
    // All render as collapsible or single-line bubbles via the
    // attachment-bubble component. The _raw payload in metadata
    // provides the full fields for the renderer.
    case "file":
    case "edited_text_file":
    case "compact_file_reference":
    case "plan_file_reference":
    case "hook_success":
    case "hook_non_blocking_error":
    case "hook_additional_context":
    case "date_change":
    case "queued_command":
    case "opened_file_in_ide":
    case "selected_lines_in_ide":
    case "diagnostics":
    case "goal_status":
      return { bubble: makeAttachmentBubble(att.type, msg) };

    default:
      // Unknown subtype — placeholder bubble with subtype name
      return { bubble: makeAttachmentBubble((att as { type: string }).type, msg) };
  }
}

export function normalizeAttachmentTaskStatus(status: string): TaskInfo["status"] {
  switch (status) {
    case "completed":
      return "completed";
    case "error":
      return "error";
    case "backgrounded":
      return "backgrounded";
    default:
      return "running";
  }
}

// ── Handlers ─────────────────────────────────────────────────────────

export function convertContentToBubble(
  msg: SessionStreamServerMessage,
  opts?: { estimatedTokens?: number | null },
): ThreadMessageLike | null {
  switch (msg.type) {
    case "assistant": {
      const assistantMsg = msg as unknown as { message: { content: RawContentBlock[] } };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parts = assistantMsg.message.content.map((block): any => {
        const rendered = processContentBlock(block);
        if (rendered) return rendered;
        return { type: "text", text: JSON.stringify(block) };
      });
      const estimatedTokens = opts?.estimatedTokens ?? null;
      const custom: Record<string, unknown> = { _raw: msg };
      if (estimatedTokens != null) custom.estimatedTokens = estimatedTokens;
      return enrichBubbleMetadata({
        role: "assistant",
        content: parts,
        metadata: { custom },
      });
    }
    case "user": {
      const userMsg = msg as { message?: { role?: string; content?: unknown } };
      const content = userMsg.message?.content;
      if (Array.isArray(content)) {
        // Only text blocks form the user bubble.
        // tool_result blocks are consumed separately by extractToolResults.
        const texts: string[] = [];
        for (const b of content as Array<Record<string, unknown>>) {
          if (b.type === "text" && typeof b.text === "string") texts.push(b.text);
        }
        if (texts.length === 0) return null;
        return enrichBubbleMetadata({
          role: "user",
          content: texts.join("\n"),
          metadata: { custom: { _raw: msg } },
        });
      }
      if (typeof content === "string" && content.trim()) {
        if (
          content.startsWith("<local-command") ||
          content.startsWith("<command-name>") ||
          content.startsWith("<command-message>")
        ) {
          return null;
        }
        return enrichBubbleMetadata({
          role: "user",
          content,
          metadata: { custom: { _raw: msg } },
        });
      }
      return null;
    }
    default:
      return null;
  }
}

// ── API Error Attachment ────────────────────────────────────────────

export type ApiErrorAttachment = {
  uuid?: string;
  parentUuid?: string;
  error?: string;
  text: string;
  raw: SessionStreamServerMessage;
  resolution: "direct-parent" | "ancestor" | "tool-result-parent" | "pending";
};

/** Check if a message is an API error annotation (not a normal assistant reply). */
export function isExternalApiErrorMessage(msg: SessionStreamServerMessage): boolean {
  const m = msg as Record<string, unknown>;
  return (
    m.isApiErrorMessage === true &&
    (m.message as { model?: string } | undefined)?.model === "<synthetic>"
  );
}

/** Extract human-readable error text from an API error message. */
export function extractApiErrorText(msg: SessionStreamServerMessage): string {
  // Assistant-shaped API errors: extract from content blocks.
  try {
    const assistantMsg = msg as unknown as {
      message?: { content?: Array<{ type: string; text?: string }> };
    };
    const texts = (assistantMsg.message?.content ?? [])
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text!);
    if (texts.length > 0) return texts.join("\n");
  } catch {
    /* fall through */
  }
  // system.api_error: error is an object with .formatted / .message.
  const err = (msg as Record<string, unknown>).error;
  if (typeof err === "string") return err;
  if (typeof err === "object" && err !== null) {
    const e = err as { formatted?: string; message?: string };
    if (e.formatted) return e.formatted;
    if (e.message) return e.message;
  }
  return JSON.stringify(msg).slice(0, 500);
}

/** Get the parentUuid from a message's envelope fields. */
export function getMsgParentUuid(msg: SessionStreamServerMessage): string | null {
  const m = msg as Record<string, unknown>;
  return (m.parentUuid as string) ?? (m.logicalParentUuid as string) ?? null;
}

/** Standalone UUID extractor (for pure functions; mirrors getMessageUuid in the hook). */
export function getMsgUuid(msg: SessionStreamServerMessage): string | null {
  const uuid = (msg as Record<string, unknown>).uuid;
  return typeof uuid === "string" ? uuid : null;
}

/** Extract tool_use_id values from a user message's tool_result content blocks. */
export function getMsgToolResultIds(msg: SessionStreamServerMessage): string[] {
  if (msg.type !== "user") return [];
  const userMsg = msg as unknown as {
    message?: { content?: Array<{ type?: string; tool_use_id?: string }> };
  };
  return (userMsg.message?.content ?? [])
    .filter((b) => b.type === "tool_result" && typeof b.tool_use_id === "string")
    .map((b) => b.tool_use_id!);
}

/** Check if a thread message's tool-call parts include a specific tool_use_id. */
export function threadMessageHasToolCallId(msg: ThreadMessageLike, toolUseId: string): boolean {
  const content = msg.content;
  if (!Array.isArray(content)) return false;
  return content.some(
    (part: unknown) =>
      (part as { type?: string; toolCallId?: string }).type === "tool-call" &&
      (part as { toolCallId: string }).toolCallId === toolUseId,
  );
}

export type ExtractedToolResult = {
  toolUseId: string;
  content: string;
  isError: boolean;
};

/** Extract tool_result blocks from a user message into {toolUseId, content, isError}. */
export function extractToolResults(msg: SessionStreamServerMessage): ExtractedToolResult[] {
  if (msg.type !== "user") return [];
  const userMsg = msg as unknown as {
    message?: {
      content?: Array<{
        type?: string;
        tool_use_id?: string;
        content?: unknown;
        is_error?: boolean;
      }>;
    };
  };
  const results: ExtractedToolResult[] = [];
  for (const block of userMsg.message?.content ?? []) {
    if (block.type !== "tool_result") continue;
    const toolUseId = block.tool_use_id;
    if (typeof toolUseId !== "string") continue;
    const c = block.content;
    const texts: string[] = [];
    if (typeof c === "string") {
      texts.push(c);
    } else if (Array.isArray(c)) {
      for (const item of c as Array<Record<string, unknown>>) {
        if (item.type === "text" && typeof item.text === "string") texts.push(item.text);
      }
    }
    results.push({
      toolUseId,
      content: texts.join("\n") || "Tool result",
      isError: !!block.is_error,
    });
  }
  return results;
}

/**
 * Match tool_results to tool-call parts by tool_use_id and set result/isError.
 * Scans messages backwards (most-recent first) — a performance optimization
 * since tool_use_id values are unique.
 */
export function applyToolResultsToMessages(
  messages: ThreadMessageLike[],
  results: ExtractedToolResult[],
): { messages: ThreadMessageLike[]; appliedCount: number } {
  if (results.length === 0) return { messages, appliedCount: 0 };
  const pending = [...results];
  let appliedCount = 0;
  const next = [...messages];
  for (let i = next.length - 1; i >= 0 && pending.length > 0; i--) {
    const msg = next[i];
    if (msg.role !== "assistant" || !Array.isArray(msg.content)) continue;
    let content = msg.content;
    let touched = false;
    for (let p = pending.length - 1; p >= 0; p--) {
      const r = pending[p];
      const idx = content.findIndex(
        (part: unknown) =>
          (part as { type?: string; toolCallId?: string }).type === "tool-call" &&
          (part as { toolCallId?: string }).toolCallId === r.toolUseId,
      );
      if (idx === -1) continue;
      content = content.map((part: unknown, j: number) => {
        if (j !== idx) return part;
        const update: Record<string, unknown> = {
          ...(part as Record<string, unknown>),
          result: r.content,
          ...(r.isError ? { isError: true } : {}),
        };
        // Self-heal: a late result overrides a premature orphan mark
        delete update.isOrphaned;
        return update;
      });
      touched = true;
      appliedCount++;
      pending.splice(p, 1);
    }
    if (touched) next[i] = { ...msg, content };
  }
  return { messages: appliedCount > 0 ? next : messages, appliedCount };
}

/**
 * Mark tool-call parts that lack both result and isError as orphaned.
 * Only called at history_end when the server declared this connection is a
 * resume (isResumeRef). The history JSONL is from a concluded invocation;
 * pending tool_use in that history will never receive their results.
 *
 * Returns `{ messages: prev, changed: false }` when nothing was marked
 * (no-alloc pass to avoid needless re-render).
 */
export function markOrphanedToolCalls(messages: ThreadMessageLike[]): {
  messages: ThreadMessageLike[];
  changed: boolean;
} {
  let changed = false;
  const next = messages.map((msg) => {
    if (msg.role !== "assistant" || !Array.isArray(msg.content)) return msg;
    const content = msg.content.map((part: unknown): unknown => {
      const p = part as Record<string, unknown>;
      if (p.type !== "tool-call") return part;
      if ("result" in p) return part;
      if (p.isError === true) return part;
      if (p.isOrphaned === true) return part; // already marked
      changed = true;
      return { ...p, isOrphaned: true };
    });
    return changed ? { ...msg, content } : msg;
  }) as ThreadMessageLike[];
  return { messages: changed ? next : messages, changed };
}

type RawByUuid = Map<string, SessionStreamServerMessage>;

function findBubbleForRawUuid(
  messages: ThreadMessageLike[],
  uuid: string,
): ThreadMessageLike | null {
  for (const m of messages) {
    const custom = m.metadata?.custom as Record<string, unknown> | undefined;
    if (!custom) continue;
    const sourceUuids = custom.sourceUuids as string[] | undefined;
    if (sourceUuids?.includes(uuid)) return m;
    const raw = custom._raw as Record<string, unknown> | undefined;
    if (raw?.uuid === uuid) return m;
  }
  return null;
}

function resolveErrorAnchor(
  errorMsg: SessionStreamServerMessage,
  messages: ThreadMessageLike[],
  rawByUuid: RawByUuid,
): { bubble: ThreadMessageLike; resolution: ApiErrorAttachment["resolution"] } | null {
  const parentUuid = getMsgParentUuid(errorMsg);
  if (!parentUuid) return null;

  const direct = findBubbleForRawUuid(messages, parentUuid);
  if (direct) return { bubble: direct, resolution: "direct-parent" };

  const parentRaw = rawByUuid.get(parentUuid);
  if (!parentRaw) return null;

  const toolResultIds = getMsgToolResultIds(parentRaw);
  if (toolResultIds.length > 0) {
    for (const m of messages) {
      if (m.role !== "assistant") continue;
      if (toolResultIds.some((tid) => threadMessageHasToolCallId(m, tid))) {
        return { bubble: m, resolution: "tool-result-parent" };
      }
    }
  }

  let ancestor = parentRaw;
  for (let i = 0; i < 10; i++) {
    const ancestorParentUuid = getMsgParentUuid(ancestor);
    if (!ancestorParentUuid) break;
    const ancestorBubble = findBubbleForRawUuid(messages, ancestorParentUuid);
    if (ancestorBubble) return { bubble: ancestorBubble, resolution: "ancestor" };
    const next = rawByUuid.get(ancestorParentUuid);
    if (!next) break;
    ancestor = next;
  }

  return null;
}

function makeApiErrorAttachment(
  msg: SessionStreamServerMessage,
  resolution: ApiErrorAttachment["resolution"],
): ApiErrorAttachment {
  const rawErr = (msg as Record<string, unknown>).error;
  // system.api_error carries error as an object { message, formatted, … }.
  // Use .message as the short label; .formatted as the full detail (in text).
  // isExternalApiErrorMessage carries it as a plain string.
  let errLabel: string | undefined;
  if (typeof rawErr === "string") errLabel = rawErr;
  else if (typeof rawErr === "object" && rawErr !== null) {
    const e = rawErr as { message?: string; formatted?: string };
    errLabel = e.message ?? e.formatted ?? undefined;
  }
  return {
    uuid: getMsgUuid(msg) ?? undefined,
    parentUuid: getMsgParentUuid(msg) ?? undefined,
    error: errLabel,
    text: extractApiErrorText(msg),
    raw: msg,
    resolution,
  };
}

/** Add sourceUuids / _rawMessages metadata to a newly created bubble. */
export function enrichBubbleMetadata(bubble: ThreadMessageLike): ThreadMessageLike {
  const custom = (bubble.metadata?.custom ?? {}) as Record<string, unknown>;
  const raw = custom._raw as SessionStreamServerMessage | undefined;
  const uuid = raw ? getMsgUuid(raw) : null;
  const sourceUuids: string[] = uuid ? [uuid] : [];
  const _rawMessages: SessionStreamServerMessage[] = raw ? [raw] : [];
  return {
    ...bubble,
    metadata: { custom: { ...custom, sourceUuids, _rawMessages } },
  };
}

/** Attach an API error to a bubble (returns new bubble, does not mutate). */
export function attachErrorToBubble(
  bubble: ThreadMessageLike,
  attachment: ApiErrorAttachment,
): ThreadMessageLike {
  const custom = { ...bubble.metadata?.custom } as Record<string, unknown>;
  const existing =
    (custom._rawMessages as SessionStreamServerMessage[]) ??
    (custom._raw ? [custom._raw as SessionStreamServerMessage] : []);
  const existingSources = (custom.sourceUuids as string[]) ?? [];
  return {
    ...bubble,
    metadata: {
      custom: {
        ...custom,
        apiErrors: [...((custom.apiErrors as ApiErrorAttachment[]) ?? []), attachment],
        _rawMessages: [...existing, attachment.raw],
        sourceUuids: [...existingSources, ...(attachment.uuid ? [attachment.uuid] : [])],
      },
    },
  };
}

export function attachApiErrorToMessages(
  messages: ThreadMessageLike[],
  errorMsg: SessionStreamServerMessage,
  rawByUuid: RawByUuid,
): { messages: ThreadMessageLike[]; attached: boolean } {
  const anchor = resolveErrorAnchor(errorMsg, messages, rawByUuid);
  if (!anchor) return { messages, attached: false };

  const attachment = makeApiErrorAttachment(errorMsg, anchor.resolution);
  return {
    messages: messages.map((m) => (m === anchor.bubble ? attachErrorToBubble(m, attachment) : m)),
    attached: true,
  };
}

// ── Synthetic Body Attachment ───────────────────────────────────────

function extractSyntheticBody(msg: SessionStreamServerMessage): string {
  const content = (msg as Record<string, unknown>).message as
    | { content?: Array<{ type?: string; text?: string }> }
    | undefined;
  if (Array.isArray(content?.content)) {
    return content.content
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text!)
      .join("\n");
  }
  // Fallback: stringify the whole message for non-standard shapes.
  return JSON.stringify(msg).slice(0, 2000);
}

export function drainPendingErrors(
  messages: ThreadMessageLike[],
  pending: SessionStreamServerMessage[],
  rawByUuid: RawByUuid,
): { messages: ThreadMessageLike[]; remaining: SessionStreamServerMessage[] } {
  const remaining: SessionStreamServerMessage[] = [];
  let current = messages;
  for (const errorMsg of pending) {
    const result = attachApiErrorToMessages(current, errorMsg, rawByUuid);
    if (result.attached) {
      current = result.messages;
    } else {
      remaining.push(errorMsg);
    }
  }
  return { messages: current, remaining };
}

/** Build a thin horizontal divider for a batch boundary (history or output). */
export function makeBoundaryDivider(kind: "history" | "live"): ThreadMessageLike {
  return {
    role: "system",
    content: [{ type: "text", text: "" }],
    metadata: { custom: { systemMessageType: "batch-boundary", batchBoundary: kind } },
  };
}

// ── messageToThreadLike ──────────────────────────────────────────────
// Simple mapping: one raw message → one ThreadMessageLike bubble.
// Does NOT do grouping, tool matching, dedup, or filtering.
// Kept intentionally simple — complex rendering logic belongs in
// future sub-handlers.

export function messageToThreadLike(msg: SessionStreamServerMessage): ThreadMessageLike | null {
  if (
    msg.type === "mode" ||
    msg.type === "permission-mode" ||
    msg.type === "ai-title" ||
    msg.type === "agent-name" ||
    msg.type === "queue-operation" ||
    msg.type === "session_init" ||
    msg.type === "history_start" ||
    msg.type === "history_end" ||
    msg.type === "live_start" ||
    msg.type === "live_end"
  ) {
    return null;
  }
  const raw = JSON.stringify(msg, null, 2);
  const meta = { custom: { _raw: msg } };
  if (msg.type === "assistant") {
    return { role: "assistant", content: [{ type: "text", text: raw }], metadata: meta };
  }
  if (msg.type === "user") {
    return { role: "user", content: raw, metadata: meta };
  }
  if (msg.type === "file-history-snapshot") {
    const count = Object.keys(msg.snapshot?.trackedFileBackups ?? {}).length;
    const text = `文件历史快照 · ${count} 个文件`;
    return { role: "system", content: [{ type: "text", text }], metadata: meta };
  }
  return { role: "system", content: [{ type: "text", text: raw }], metadata: meta };
}

// ── ChatStream domain model ──────────────────────────────────────────
// Two pure layers over rawMessages:
//   1. normalizeChatStream — state/association only (merging, tool_result /
//      skill-body / api_error attachment, assistant accumulation by message.id).
//      Outputs ChatStreamItem[]. NEVER touches ThreadMessageLike, NEVER formats
//      divider text, NEVER decides bubbles.
//   2. renderChatStream     — render only. Maps each ChatStreamItem to its
//      ThreadMessageLike bubble. ALL render decisions live here, including the
//      "draw batch divider only when a visible neighbor exists" rule.
// Both are pure functions; the hook wires them with useMemo.

export type NormalizedPart =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | {
      type: "tool-call";
      toolName: string;
      toolCallId: string;
      args: Record<string, unknown>;
      argsText: string;
      result?: string;
      isError?: boolean;
      isOrphaned?: boolean;
      skillContent?: string;
    };

export type ChatStreamItem =
  | {
      kind: "assistant";
      parts: NormalizedPart[];
      estimatedTokens?: number;
      apiErrors: SessionStreamServerMessage[];
      sourceUuids: string[];
    }
  | { kind: "user-prompt"; text: string; sourceUuids: string[] }
  | {
      kind: "compact-boundary";
      trigger: "manual" | "auto";
      preTokens?: number;
      sourceUuids: string[];
    }
  | {
      kind: "session-init";
      model: string;
      mode: string;
      toolsN: number;
      skillsN: number;
      mcpN: number;
      sourceUuids: string[];
    }
  | { kind: "result-error"; text: string; sourceUuids: string[] }
  | { kind: "batch-boundary"; batchKind: "history" | "live" }
  | { kind: "attachment"; bubble: ThreadMessageLike; sourceUuids: string[] }
  | { kind: "fallback"; ui: ThreadMessageLike };

/**
 * Layer 1 — state. Walks rawMessages once, performs all merging /
 * association / folding, emits a domain model (ChatStreamItem[]).
 *
 * Pure: no ThreadMessageLike output, no divider text formatting, no bubble
 * decisions. Association is self-contained here (works over NormalizedPart[] /
 * ChatStreamItem[]), reusing only the pure extraction helpers.
 */
export function normalizeChatStream(rawMessages: SessionStreamServerMessage[]): ChatStreamItem[] {
  const items: ChatStreamItem[] = [];

  // Assistant accumulator — one assistant response (grouped by message.id).
  let currentAssistantId: string | null = null;
  let currentAssistantParts: NormalizedPart[] = [];
  let currentEstimatedTokens: number | null = null;
  let currentSourceUuids: string[] = [];
  // Most-recent tool_use_id seen via tool_result — fallback anchor for
  // synthetic / meta skill bodies that carry no sourceToolUseID.
  let lastToolUseId: string | null = null;
  // api_error messages whose parent isn't emitted yet; resolved lazily.
  const pendingApiErrors: SessionStreamServerMessage[] = [];

  const rawByUuid = new Map<string, SessionStreamServerMessage>();
  for (const msg of rawMessages) {
    const uuid = getMsgUuid(msg);
    if (uuid) rawByUuid.set(uuid, msg);
  }

  // Stamp an api_error onto a matching assistant item (in-buffer or already
  // emitted) by parentUuid chain. Returns true if attached anywhere.
  const attachApiError = (errorMsg: SessionStreamServerMessage): boolean => {
    const parentUuid = getMsgParentUuid(errorMsg);
    if (!parentUuid) return false;

    // 1. Direct parent in any assistant item's sourceUuids.
    for (const item of items) {
      if (item.kind !== "assistant") continue;
      if (item.sourceUuids.includes(parentUuid)) {
        item.apiErrors.push(errorMsg);
        return true;
      }
    }

    const parentRaw = rawByUuid.get(parentUuid);
    if (!parentRaw) return false;

    // 2. Parent is a tool_result user message — anchor on the assistant
    //    item whose tool-call matches that tool_use_id.
    const toolResultIds = getMsgToolResultIds(parentRaw);
    if (toolResultIds.length > 0) {
      for (const item of items) {
        if (item.kind !== "assistant") continue;
        if (
          toolResultIds.some((tid) =>
            item.parts.some((p) => p.type === "tool-call" && p.toolCallId === tid),
          )
        ) {
          item.apiErrors.push(errorMsg);
          return true;
        }
      }
    }

    // 3. Walk the ancestor chain via rawByUuid.
    let ancestor = parentRaw;
    for (let i = 0; i < 10; i++) {
      const ancestorParentUuid = getMsgParentUuid(ancestor);
      if (!ancestorParentUuid) break;
      for (const item of items) {
        if (item.kind !== "assistant") continue;
        if (item.sourceUuids.includes(ancestorParentUuid)) {
          item.apiErrors.push(errorMsg);
          return true;
        }
      }
      const next = rawByUuid.get(ancestorParentUuid);
      if (!next) break;
      ancestor = next;
    }

    return false;
  };

  // Attach an api_error now, or defer it if no anchor exists yet.
  const receiveApiError = (errorMsg: SessionStreamServerMessage) => {
    if (!attachApiError(errorMsg)) pendingApiErrors.push(errorMsg);
  };

  // Retry every pending api_error against currently-emitted items.
  const drainPendingApiErrors = () => {
    if (pendingApiErrors.length === 0) return;
    const remaining: SessionStreamServerMessage[] = [];
    for (const err of pendingApiErrors) {
      if (!attachApiError(err)) remaining.push(err);
    }
    pendingApiErrors.length = 0;
    pendingApiErrors.push(...remaining);
  };

  // Fold a skill body into a tool-call part (in-buffer or already emitted).
  const attachSkillBody = (toolUseId: string, body: string): boolean => {
    if (!toolUseId || !body) return false;

    // In-buffer assistant accumulator.
    const bufIdx = currentAssistantParts.findIndex(
      (p) => p.type === "tool-call" && p.toolCallId === toolUseId,
    );
    if (bufIdx >= 0) {
      currentAssistantParts = currentAssistantParts.map((p, i) =>
        i === bufIdx && p.type === "tool-call" ? { ...p, skillContent: body } : p,
      );
      return true;
    }

    // Already-emitted assistant items (scan backwards — ids are unique).
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      if (item.kind !== "assistant") continue;
      const partIdx = item.parts.findIndex(
        (p) => p.type === "tool-call" && p.toolCallId === toolUseId,
      );
      if (partIdx >= 0) {
        item.parts = item.parts.map((p, j) =>
          j === partIdx && p.type === "tool-call" ? { ...p, skillContent: body } : p,
        );
        return true;
      }
    }
    return false;
  };

  // Fold a synthetic / meta message's body into its parent assistant item
  // (by parentUuid). Returns true if attached.
  const attachSyntheticBody = (syntheticMsg: SessionStreamServerMessage): boolean => {
    const parentUuid = getMsgParentUuid(syntheticMsg);
    if (!parentUuid) return false;
    for (const item of items) {
      if (item.kind !== "assistant") continue;
      if (item.sourceUuids.includes(parentUuid)) {
        const body = extractSyntheticBody(syntheticMsg);
        const uuid = getMsgUuid(syntheticMsg);
        if (uuid && !item.sourceUuids.includes(uuid)) item.sourceUuids.push(uuid);
        // Stamp the body onto the last tool-call part as skill content (best
        // effort) so the renderer can surface it; the parentUuid association
        // itself is already recorded via sourceUuids.
        const lastToolIdx = [...item.parts].reverse().findIndex((p) => p.type === "tool-call");
        if (lastToolIdx >= 0 && body) {
          const realIdx = item.parts.length - 1 - lastToolIdx;
          item.parts = item.parts.map((p, j) =>
            j === realIdx && p.type === "tool-call" && !p.skillContent
              ? { ...p, skillContent: body }
              : p,
          );
        }
        return true;
      }
    }
    return false;
  };

  // Close the current assistant accumulator, emitting an `assistant` item.
  // Emits whenever at least one assistant delta was seen for this message.id
  // (an empty-content assistant still produces a bubble, matching the prior
  // single-pass behavior).
  const finalizeAssistant = () => {
    if (currentAssistantId === null) return;
    const item: Extract<ChatStreamItem, { kind: "assistant" }> = {
      kind: "assistant",
      parts: currentAssistantParts,
      apiErrors: [],
      sourceUuids: [...currentSourceUuids],
    };
    if (currentEstimatedTokens != null) item.estimatedTokens = currentEstimatedTokens;
    items.push(item);
    // Resolve any pending errors now that this assistant item is emitted.
    drainPendingApiErrors();
    currentAssistantId = null;
    currentAssistantParts = [];
    currentEstimatedTokens = null;
    currentSourceUuids = [];
  };

  for (const msg of rawMessages) {
    if (!msg) continue;

    // ═══ Assistant ═══
    if (msg.type === "assistant") {
      // ApiError: attach to parent, never standalone.
      if (isExternalApiErrorMessage(msg)) {
        receiveApiError(msg);
        continue;
      }

      // Synthetic assistant (model === "<synthetic>"): skip entirely.
      if (isSyntheticAssistantMessage(msg)) continue;

      // Hidden / internal assistant (isMeta / isSynthetic): fold into parent
      // or tool-call; no standalone item.
      const assistantMeta = msg as Record<string, unknown>;
      if (assistantMeta.isMeta === true || assistantMeta.isSynthetic === true) {
        const sourceToolUseId = assistantMeta.sourceToolUseID as string | undefined;
        const attachedViaParent = attachSyntheticBody(msg);
        if (!attachedViaParent && sourceToolUseId) {
          attachSkillBody(sourceToolUseId, extractSyntheticBody(msg));
        }
        continue;
      }

      // Accumulate parts grouped by message.id.
      const msgId = (msg.message as { id?: string })?.id;
      if (msgId && msgId !== currentAssistantId) {
        finalizeAssistant();
        currentAssistantId = msgId;
      } else if (!msgId && currentAssistantId === null) {
        // No id on the delta — open a fresh accumulator if none is open.
        currentAssistantId = "__no_id__";
      }
      const uuid = getMsgUuid(msg);
      if (uuid && !currentSourceUuids.includes(uuid)) currentSourceUuids.push(uuid);
      const content =
        (msg as unknown as { message: { content: Array<Record<string, unknown>> } }).message
          ?.content ?? [];
      for (const block of content) {
        const part = processContentBlock(block as RawContentBlock);
        if (part) currentAssistantParts.push(part as NormalizedPart);
      }
      continue;
    }

    // ═══ User ═══
    if (msg.type === "user") {
      const toolResults = extractToolResults(msg);
      const userMeta = msg as unknown as {
        message?: { content?: unknown };
        isMeta?: boolean;
        isSynthetic?: boolean;
        sourceToolUseID?: string;
      };

      // ToolResult: match to tool-call part, no item.
      if (toolResults.length > 0) {
        lastToolUseId = toolResults[toolResults.length - 1].toolUseId;
        for (const tr of toolResults) {
          // In-buffer first.
          const bufIdx = currentAssistantParts.findIndex(
            (p) => p.type === "tool-call" && p.toolCallId === tr.toolUseId,
          );
          if (bufIdx >= 0) {
            currentAssistantParts = currentAssistantParts.map((p, i) =>
              i === bufIdx && p.type === "tool-call"
                ? {
                    ...p,
                    result: tr.content,
                    ...(tr.isError ? { isError: true } : {}),
                  }
                : p,
            );
            continue;
          }
          // Already-emitted assistant items.
          for (const item of items) {
            if (item.kind !== "assistant") continue;
            const partIdx = item.parts.findIndex(
              (p) => p.type === "tool-call" && p.toolCallId === tr.toolUseId,
            );
            if (partIdx >= 0) {
              item.parts = item.parts.map((p, j) =>
                j === partIdx && p.type === "tool-call"
                  ? {
                      ...p,
                      result: tr.content,
                      ...(tr.isError ? { isError: true } : {}),
                    }
                  : p,
              );
              break;
            }
          }
        }
        // Do NOT continue — the user message may also carry text blocks.
      }

      // SkillBody: attach text to tool-call, no item.
      const isSkillBody = userMeta.isSynthetic === true || userMeta.isMeta === true;
      if (isSkillBody) {
        const sourceToolUseId = userMeta.sourceToolUseID as string | undefined;
        const toolUseId = sourceToolUseId ?? lastToolUseId;
        const body = extractSyntheticBody(msg);
        attachSkillBody(toolUseId ?? "", body);
        continue;
      }

      const texts = _extractUserTextBlocks(userMeta.message?.content);

      // Skill content via prefix detection (isMeta/isSynthetic may be absent).
      if (_isHiddenSkillContent(texts)) {
        const sourceToolUseId = userMeta.sourceToolUseID as string | undefined;
        const toolUseId = sourceToolUseId ?? lastToolUseId;
        attachSkillBody(toolUseId ?? "", texts.join("\n"));
        continue;
      }

      // UserPrompt: text content → user-prompt item.
      if (texts.length > 0) {
        finalizeAssistant();
        items.push({
          kind: "user-prompt",
          text: texts.join("\n"),
          sourceUuids: getMsgUuid(msg) ? [getMsgUuid(msg)!] : [],
        });
        continue;
      }

      // String-content user message (skip CLI command tags).
      const rawContent = userMeta.message?.content;
      if (typeof rawContent === "string" && rawContent.trim()) {
        if (
          rawContent.startsWith("<local-command") ||
          rawContent.startsWith("<command-name>") ||
          rawContent.startsWith("<command-message>")
        )
          continue;
        finalizeAssistant();
        items.push({
          kind: "user-prompt",
          text: rawContent,
          sourceUuids: getMsgUuid(msg) ? [getMsgUuid(msg)!] : [],
        });
        continue;
      }

      // Hidden/internal user message with no association key → dropped.
      continue;
    }

    // ═══ System ═══
    if (msg.type === "system") {
      const subtype = (msg as Record<string, unknown>).subtype as string | undefined;

      // SessionInit: summary item (scalar state is still updated by the handler).
      if (subtype === "init") {
        finalizeAssistant();
        const init = msg as unknown as {
          model?: string;
          permissionMode?: string;
          tools?: string[];
          skills?: string[];
          mcp_servers?: Array<{ name?: string }>;
        };
        items.push({
          kind: "session-init",
          model: init.model ?? "?",
          mode: init.permissionMode ?? "?",
          toolsN: init.tools?.length ?? 0,
          skillsN: init.skills?.length ?? 0,
          mcpN: init.mcp_servers?.length ?? 0,
          sourceUuids: getMsgUuid(msg) ? [getMsgUuid(msg)!] : [],
        });
        continue;
      }

      // ThinkingTokens: stamp into the current assistant accumulator.
      if (subtype === "thinking_tokens") {
        currentEstimatedTokens =
          (msg as unknown as { estimated_tokens?: number }).estimated_tokens ?? null;
        continue;
      }

      // ApiError: attach to parent.
      if (subtype === "api_error") {
        receiveApiError(msg);
        continue;
      }

      // CompactBoundary: divider item.
      if (subtype === "compact_boundary" || subtype === "microcompact_boundary") {
        finalizeAssistant();
        const cmeta = (msg as Record<string, unknown>).compactMetadata as
          | { trigger?: string; preTokens?: number }
          | undefined;
        items.push({
          kind: "compact-boundary",
          trigger: cmeta?.trigger === "manual" ? "manual" : "auto",
          ...(cmeta?.preTokens != null ? { preTokens: cmeta.preTokens } : {}),
          sourceUuids: getMsgUuid(msg) ? [getMsgUuid(msg)!] : [],
        });
        continue;
      }

      // TaskState: no item (scalar state handled by the handler).
      if (
        subtype === "task_started" ||
        subtype === "task_updated" ||
        subtype === "task_notification"
      ) {
        continue;
      }

      // Batch boundary (synthetic, injected by the handler).
      if (subtype === "batch_boundary") {
        finalizeAssistant();
        const batchKind: "history" | "live" =
          ((msg as Record<string, unknown>).batchKind as "history" | "live") ?? "history";
        items.push({ kind: "batch-boundary", batchKind });
        continue;
      }

      // Other system messages: fallback.
      const ui = messageToThreadLike(msg);
      if (ui) items.push({ kind: "fallback", ui });
      continue;
    }

    // ═══ Result ═══
    if (msg.type === "result") {
      const resultMsg = msg as { is_error?: boolean; result?: string };
      if (resultMsg.is_error && typeof resultMsg.result === "string") {
        finalizeAssistant();
        items.push({
          kind: "result-error",
          text: resultMsg.result,
          sourceUuids: getMsgUuid(msg) ? [getMsgUuid(msg)!] : [],
        });
      } else {
        // Non-error result only finalizes the current assistant (no item).
        finalizeAssistant();
      }
      continue;
    }

    // ═══ Attachment ═══
    if (msg.type === "attachment") {
      finalizeAssistant();
      const result = handleAttachment(msg as Claude2Attachment);
      if (result.bubble) {
        items.push({
          kind: "attachment",
          bubble: enrichBubbleMetadata(result.bubble),
          sourceUuids: getMsgUuid(msg) ? [getMsgUuid(msg)!] : [],
        });
      }
      continue;
    }

    // ═══ Other (fallback) ═══
    const fallback = messageToThreadLike(msg);
    if (fallback) items.push({ kind: "fallback", ui: fallback });
  }

  finalizeAssistant();
  return items;
}

/**
 * Layer 2 — render. Maps each ChatStreamItem to its ThreadMessageLike bubble.
 * ALL render decisions live here. A batch-boundary is drawn only when a
 * visible (non-boundary) item sits immediately before or after it.
 */
export function renderChatStream(
  items: ChatStreamItem[],
  opts?: { isResume?: boolean },
): ThreadMessageLike[] {
  const messages: ThreadMessageLike[] = [];

  for (let itemIdx = 0; itemIdx < items.length; itemIdx++) {
    const item = items[itemIdx];
    switch (item.kind) {
      case "assistant": {
        const custom: Record<string, unknown> = {
          sourceUuids: [...item.sourceUuids],
          _rawMessages: [],
        };
        if (item.estimatedTokens != null) custom.estimatedTokens = item.estimatedTokens;
        const bubble: ThreadMessageLike = {
          role: "assistant",
          content: [...item.parts] as unknown as ThreadMessageLike["content"],
          metadata: { custom },
        };
        // Attach api_errors onto the same bubble.
        let withErrors = bubble;
        for (const err of item.apiErrors) {
          const attachment: ApiErrorAttachment = {
            uuid: getMsgUuid(err) ?? undefined,
            parentUuid: getMsgParentUuid(err) ?? undefined,
            error: undefined,
            text: extractApiErrorText(err),
            raw: err,
            resolution: "direct-parent",
          };
          withErrors = attachErrorToBubble(withErrors, attachment);
        }
        messages.push(enrichBubbleMetadata(withErrors));
        break;
      }
      case "user-prompt": {
        messages.push(
          enrichBubbleMetadata({
            role: "user",
            content: item.text,
            metadata: { custom: { sourceUuids: [...item.sourceUuids] } },
          }),
        );
        break;
      }
      case "compact-boundary": {
        const trigger = item.trigger === "manual" ? "手动" : "自动";
        const label = item.preTokens != null ? `${Math.round(item.preTokens / 1000)}k` : "?";
        messages.push({
          role: "system",
          content: [{ type: "text", text: "" }],
          metadata: {
            custom: {
              sourceUuids: [...item.sourceUuids],
              systemMessageType: "compact-boundary",
              compactText: `上下文${trigger}压缩 (~${label} tokens)`,
            },
          },
        });
        break;
      }
      case "session-init": {
        const summary = `system.init · ${item.model} · ${item.mode} · ${item.toolsN} tools, ${item.skillsN} skills, ${item.mcpN} mcp`;
        messages.push({
          role: "system",
          content: [{ type: "text", text: summary }],
          metadata: {
            custom: {
              sourceUuids: [...item.sourceUuids],
              systemMessageType: "system-init",
            },
          },
        });
        break;
      }
      case "result-error": {
        messages.push({
          role: "system",
          content: [{ type: "text", text: item.text }],
          metadata: {
            custom: {
              sourceUuids: [...item.sourceUuids],
              systemMessageType: "error",
            },
          },
        });
        break;
      }
      case "batch-boundary": {
        // Draw the divider only when a visible neighbor exists on either side.
        // Boundaries themselves are not "visible content".
        const prev = messages[messages.length - 1];
        const prevVisible =
          !!prev &&
          (prev.metadata?.custom as Record<string, unknown> | undefined)?.systemMessageType !==
            "batch-boundary";
        // Look ahead for the next visible item (skip boundaries).
        let nextVisible = false;
        for (let j = itemIdx + 1; j < items.length; j++) {
          if (items[j].kind === "batch-boundary") continue;
          nextVisible = true;
          break;
        }
        if (prevVisible || nextVisible) {
          messages.push(makeBoundaryDivider(item.batchKind));
        }
        break;
      }
      case "attachment": {
        messages.push(item.bubble);
        break;
      }
      case "fallback": {
        messages.push(item.ui);
        break;
      }
    }
  }

  if (opts?.isResume && messages.length > 0) {
    return markOrphanedToolCalls(messages).messages;
  }
  return messages;
}

export function useClaude2Session(
  projectName: string,
  sessionId: string,
  initialModel?: string,
  initialPermissionMode?: string,
) {
  const [connectionVersion, setConnectionVersion] = useState(0);

  // ── Unified message state ──────────────────────────────────────────
  // ── Unified raw message state ────────────────────────────────────
  const [rawMessages, setRawMessages] = useState<SessionStreamServerMessage[]>([]);
  const messageMapRef = useRef<Map<string, SessionStreamServerMessage>>(new Map());
  const historyBatchRef = useRef<SessionStreamServerMessage[] | null>(null);
  const liveBatchRef = useRef<SessionStreamServerMessage[] | null>(null);
  // Server-authoritative: whether this session instance was spawned with --resume.
  // Populated on session_init; used at history_end to decide orphan marking.
  const isResumeRef = useRef(false);

  // ── Shared helper: push a bubble + drain pending API errors ──

  // ── Content message handlers ──

  // ── Scalar state updater ──────────────────────────────────────────
  // Applies per-message scalar state updates (tasks, model, etc.).
  // Bubble/visibility decisions are handled by renderChatStream, not here.
  const applyMessageScalarState = useCallback((msg: SessionStreamServerMessage) => {
    const sm = msg as Record<string, unknown>;

    // system.init
    if (msg.type === "system" && sm.subtype === "init") {
      const init = msg as {
        model?: string;
        permissionMode?: string;
        slash_commands?: string[];
        skills?: string[];
        mcp_servers?: Array<{ name?: string }>;
      };
      if (init.model) {
        setCurrentModel(init.model);
        setResolvedModel(init.model);
      }
      if (init.permissionMode) setPermissionMode(init.permissionMode);
      if (init.slash_commands?.length) setSlashCommands(init.slash_commands);
      if (init.skills?.length) setSkills(init.skills);
      if (init.mcp_servers?.length) {
        setMcpServers(init.mcp_servers.map((s) => s.name ?? "").filter(Boolean));
      }
      return;
    }

    // Task state
    if (
      msg.type === "system" &&
      (sm.subtype === "task_started" ||
        sm.subtype === "task_updated" ||
        sm.subtype === "task_notification")
    ) {
      const ops = extractTaskOps(msg);
      if (ops.length > 0) setTasks((prev) => ops.reduce(applyTaskSystemMessage, prev));
      return;
    }

    // Compact state
    if (
      msg.type === "system" &&
      (sm.subtype === "compact_boundary" || sm.subtype === "microcompact_boundary")
    ) {
      compactActiveRef.current = true;
      if (compactPhaseRef.current === "compacting") compactPhaseRef.current = "replay";
      return;
    }

    // permission-mode
    if (msg.type === "permission-mode") {
      setPermissionMode((msg as { permissionMode: string }).permissionMode);
      return;
    }

    // mode: skip
    if (msg.type === "mode") return;

    // ai-title
    if (msg.type === "ai-title") {
      const title = (msg as { aiTitle: string }).aiTitle;
      if (title !== lastAiTitleRef.current) {
        lastAiTitleRef.current = title;
        setAiTitle(title);
      }
      return;
    }

    // agent-name
    if (msg.type === "agent-name") {
      const name = (msg as { agentName: string }).agentName;
      if (name !== lastAgentNameRef.current) {
        lastAgentNameRef.current = name;
        setAgentName(name);
      }
      return;
    }

    // queue-operation
    if (msg.type === "queue-operation") {
      setInputQueue((prev) => applyQueueOperation(prev, msg));
      return;
    }

    // last-prompt
    if (msg.type === "last-prompt") {
      setLastPrompt((msg as { lastPrompt: string }).lastPrompt);
      setSessionLeafUuid((msg as { leafUuid?: string }).leafUuid ?? null);
      return;
    }

    // attachment: apply stateOps (bubble is handled by renderChatStream)
    if (msg.type === "attachment") {
      const result = handleAttachment(msg as Claude2Attachment);
      if (result.stateOps) {
        const ops = result.stateOps;
        if (ops.permissionMode) setPermissionMode(ops.permissionMode);
        if (ops.replaceTasks) setTasks(ops.replaceTasks);
        if (ops.taskStatus)
          setTasks((prev) =>
            prev.map((t) =>
              t.id === ops.taskStatus!.id
                ? {
                    ...t,
                    status: normalizeAttachmentTaskStatus(ops.taskStatus!.status),
                    description: ops.taskStatus!.description,
                  }
                : t,
            ),
          );
        if (ops.skills) setSkills(ops.skills);
        if (ops.skillsAdd) setSkills((prev) => [...new Set([...prev, ...ops.skillsAdd!])]);
        if (ops.slashCommands) setSlashCommands(ops.slashCommands);
        if (ops.mcpServersAdd)
          setMcpServers((prev) => [...new Set([...prev, ...ops.mcpServersAdd!])]);
      }
      return;
    }

    // assistant: extract task ops + detect plan mode entry.
    // Visibility/bubble decisions live in renderChatStream, not here.
    if (msg.type === "assistant") {
      if (isExternalApiErrorMessage(msg)) return;
      if (isSyntheticAssistantMessage(msg)) return;
      const ops = extractTaskOps(msg);
      if (ops.length > 0) setTasks((prev) => ops.reduce(applyTaskSystemMessage, prev));
      if (hasToolUseNamed(msg, "EnterPlanMode")) setPermissionMode("plan");
      return;
    }

    // The remaining types (user, system, result, file-history-snapshot,
    // control_request) carry no scalar state beyond what their dedicated
    // branches above already handle. Bubble/visibility decisions for them
    // live entirely in renderChatStream.
  }, []);

  const processBatch = useCallback(
    (rawMsgs: SessionStreamServerMessage[]) => {
      // Phase 1: register all uuids + append to rawMessages
      for (const m of rawMsgs) {
        const uuid = getMessageUuid(m);
        if (uuid) messageMapRef.current.set(uuid, m);
      }
      setRawMessages((prev) => [...prev, ...rawMsgs]);
      // Phase 2: update scalar state for each message in the batch
      for (const m of rawMsgs) {
        applyMessageScalarState(m);
      }
    },
    [applyMessageScalarState],
  );

  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRunning = useMemo(() => computeRunningCount(rawMessages) > 0, [rawMessages]);
  const [loading, setLoading] = useState(true);
  const [currentModel, setCurrentModel] = useState<string | undefined>();
  const [resolvedModel, setResolvedModel] = useState<string | undefined>(initialModel);
  const [modelSwitchVersion, _setModelSwitchVersion] = useState(0);
  const [permissionMode, setPermissionMode] = useState<string | undefined>(initialPermissionMode);
  const [aiTitle, setAiTitle] = useState<string | null>(null);
  const [agentName, setAgentName] = useState<string | null>(null);
  const lastAiTitleRef = useRef<string | null>(null);
  const lastAgentNameRef = useRef<string | null>(null);

  useEffect(() => {
    if (initialModel !== undefined && resolvedModel === undefined) {
      setResolvedModel(initialModel);
    }
  }, [initialModel, resolvedModel]);
  useEffect(() => {
    if (initialPermissionMode !== undefined && permissionMode === undefined) {
      setPermissionMode(initialPermissionMode);
    }
  }, [initialPermissionMode, permissionMode]);

  const cursorRef = useRef<string | null>(null);
  const pendingAskRef = useRef<SessionStreamServerMessage | null>(null);
  const compactActiveRef = useRef(false);
  const compactPhaseRef = useRef<"none" | "compacting" | "replay" | "waiting-live">("none");
  const compactInterruptedRef = useRef(false);
  const socketRef = useRef<WebSocket | null>(null);
  const [tasks, setTasks] = useState<TaskInfo[]>([]);
  const [slashCommands, setSlashCommands] = useState<string[]>([]);
  const [skills, setSkills] = useState<string[]>([]);
  const [mcpServers, setMcpServers] = useState<string[]>([]);
  const [inputQueue, setInputQueue] = useState<QueueEntry[]>([]);
  const [lastPrompt, setLastPrompt] = useState<string | null>(null);
  const [sessionLeafUuid, setSessionLeafUuid] = useState<string | null>(null);

  const [retryInfo, setRetryInfo] = useState<RetryInfo | null>(null);
  const retryCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const resetSessionState = useCallback(() => {
    setRawMessages([]);
    messageMapRef.current = new Map();
    setTasks([]);
    setSlashCommands([]);
    setSkills([]);
    setMcpServers([]);
    setInputQueue([]);
    setLastPrompt(null);
    setSessionLeafUuid(null);
    setRetryInfo(null);
    if (retryCountdownRef.current) {
      clearInterval(retryCountdownRef.current);
      retryCountdownRef.current = null;
    }
    setLoading(true);
    cursorRef.current = null;
    pendingAskRef.current = null;
    historyBatchRef.current = null;
    liveBatchRef.current = null;
    compactActiveRef.current = false;
    compactPhaseRef.current = "none";
    compactInterruptedRef.current = false;
  }, [initialModel, initialPermissionMode]);

  // Countdown timer for retry
  useEffect(() => {
    if (retryCountdownRef.current) {
      clearInterval(retryCountdownRef.current);
      retryCountdownRef.current = null;
    }
    if (!retryInfo) return;
    const endTime = retryInfo.startTime + retryInfo.retryDelayMs;
    retryCountdownRef.current = setInterval(() => {
      if (Date.now() >= endTime) {
        setRetryInfo(null);
        if (retryCountdownRef.current) {
          clearInterval(retryCountdownRef.current);
          retryCountdownRef.current = null;
        }
      }
    }, 250);
    return () => {
      if (retryCountdownRef.current) {
        clearInterval(retryCountdownRef.current);
        retryCountdownRef.current = null;
      }
    };
  }, [retryInfo]);

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
    }
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      setConnectionVersion((version) => version + 1);
    }, 500);
  }, []);

  // KEPT: 后续需要去重时启用
  /*
  const reconcileSnapshot = useCallback(
    (
      localMessages: SessionStreamServerMessage[],
      snapshotMessages: SessionStreamServerMessage[],
    ) => {
      if (snapshotMessages.length === 0) {
        return localMessages;
      }

      const missingTail = findMissingTailByUuid(localMessages, snapshotMessages);
      if (missingTail === null) {
        return snapshotMessages;
      }
      if (missingTail.length === 0) {
        return localMessages;
      }
      return [...localMessages, ...missingTail];
    },
    [],
  );
  */

  const activeSessionKeyRef = useRef<string | null>(null);

  const sendToSocket = useCallback((data: unknown) => {
    const socket = socketRef.current;
    if (!socket) return;
    const raw = JSON.stringify(data);
    console.log(
      `[claude2-adapter] ws send: readyState=${socket.readyState} msg=${raw.slice(0, 200)}`,
    );
    if (socket.readyState === WebSocket.OPEN) {
      try {
        socket.send(raw);
      } catch (err) {
        console.error("[claude2-adapter] ws send error", err);
      }
    } else if (socket.readyState === WebSocket.CONNECTING) {
      socket.addEventListener(
        "open",
        () => {
          try {
            socket.send(raw);
          } catch (err) {
            console.error("[claude2-adapter] ws deferred send error", err);
          }
        },
        { once: true },
      );
    }
  }, []);

  const bridge = useMemo<Claude2Bridge>(
    () => ({
      respondToControlRequest(requestId, updatedInput) {
        const {
          __controlRequestId: _,
          answers,
          ...restArgs
        } = updatedInput as Record<string, unknown>;
        sendToSocket({
          type: "control_response",
          response: {
            subtype: "success",
            request_id: requestId,
            response: {
              behavior: "allow",
              updatedInput: { ...restArgs, answers } as Record<string, unknown>,
            },
          },
        });
      },
      cancelControlRequest(requestId) {
        sendToSocket({
          type: "control_response",
          response: {
            subtype: "success",
            request_id: requestId,
            response: { behavior: "deny", message: "User skipped" },
          },
        });
      },
      sendToolResult(toolUseId, content) {
        sendToSocket({
          type: "user",
          message: {
            role: "user",
            content: [{ type: "tool_result", tool_use_id: toolUseId, content }],
          },
        } as Record<string, unknown>);
      },
      sendMessage(text) {
        sendToSocket({
          type: "user",
          message: { role: "user", content: [{ type: "text", text }] },
        });
      },
      switchModel(model) {
        setCurrentModel(model);
        sendToSocket({ type: "switch_model", model });
      },
      switchPermissionMode(mode) {
        setPermissionMode(mode);
        sendToSocket({ type: "permission_mode", mode });
      },
      onCompact: null,
    }),
    [sendToSocket],
  );

  // Clear stale reconnect timer BEFORE the WebSocket effect runs.
  // A timer from a previous session's onclose → scheduleReconnect (500ms)
  // can fire after we've already connected the new session's WebSocket,
  // triggering a spurious reconnect → session_init → resetSessionState.
  useEffect(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, [projectName, sessionId]);

  useEffect(() => {
    const sessionKey = `${projectName}/${sessionId}`;
    const isSessionChange =
      activeSessionKeyRef.current !== null && sessionKey !== activeSessionKeyRef.current;
    activeSessionKeyRef.current = sessionKey;

    let cancelled = false;
    const url = claude2StreamUrl(projectName, sessionId);

    // Reset on session change or initial mount; reconnect otherwise.
    if (isSessionChange || connectionVersion === 0) {
      resetSessionState();
    } else {
      setLoading(true);
    }

    const socket = new WebSocket(url);
    socketRef.current = socket;

    socket.onopen = () => console.log("[claude2-adapter] ws open");

    socket.onmessage = (event) => {
      if (cancelled) return;
      try {
        const raw = event.data as string;
        const msg = JSON.parse(raw) as SessionStreamServerMessage;
        console.log("[claude2-adapter] ws recv", msg);

        // ── Batch markers ────────────────────────────────────────────
        // Start markers are transport control — never render.
        // End markers render as a horizontal divider only when the
        // batch contained at least one visible content bubble.
        if (msg.type === "session_init") {
          // New connection — discard all state from the prior connection
          // before replaying history/output batches.
          resetSessionState();
          isResumeRef.current = (msg as { resume: boolean }).resume ?? false;
          console.log("[claude2-adapter] session_init resume=", isResumeRef.current);
          return;
        }
        if (msg.type === "history_start") {
          historyBatchRef.current = [];
          console.log("[claude2-adapter] history batch start, count=", msg.count);
          return;
        }
        if (msg.type === "history_end") {
          const batch = historyBatchRef.current ?? [];
          historyBatchRef.current = null;
          processBatch(batch);
          // Inject a batch divider whenever the batch carried any messages at
          // all; whether it actually renders is decided in renderChatStream
          // (visible-neighbor rule), so this stays a pure state append.
          if (batch.length > 0) {
            setRawMessages((prev) => [
              ...prev,
              {
                type: "system",
                subtype: "batch_boundary",
                batchKind: "history",
              } as unknown as SessionStreamServerMessage,
            ]);
          }
          console.log("[claude2-adapter] history batch end, processed", batch.length, "messages");
          return;
        }
        if (msg.type === "live_start") {
          liveBatchRef.current = [];
          console.log("[claude2-adapter] live batch start, count=", msg.count);
          return;
        }
        if (msg.type === "live_end") {
          const batch = liveBatchRef.current ?? [];
          liveBatchRef.current = null;
          processBatch(batch);
          if (batch.length > 0) {
            setRawMessages((prev) => [
              ...prev,
              {
                type: "system",
                subtype: "batch_boundary",
                batchKind: "live",
              } as unknown as SessionStreamServerMessage,
            ]);
          }
          setLoading(false);
          console.log("[claude2-adapter] live batch end, processed", batch.length, "messages");
          return;
        }

        // In batch collection — buffer, don't process yet
        if (historyBatchRef.current) {
          historyBatchRef.current.push(msg);
          return;
        }
        if (liveBatchRef.current) {
          liveBatchRef.current.push(msg);
          return;
        }

        // ── Per-message dispatch (live, after batches) ───────────────
        const liveUuid = getMessageUuid(msg);
        if (liveUuid) messageMapRef.current.set(liveUuid, msg);
        setRawMessages((prev) => [...prev, msg]);
        applyMessageScalarState(msg);
        setLoading(false);
      } catch {
        // skip
      }
    };

    socket.onclose = () => {
      if (!cancelled) {
        socketRef.current = null;
        setLoading(true);
        scheduleReconnect();
      }
    };

    socket.onerror = (e) => {
      console.log("[claude2-adapter] ws error", e);
    };

    return () => {
      cancelled = true;
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
      socket.close();
    };
  }, [
    projectName,
    sessionId,
    bridge,
    resetSessionState,
    connectionVersion,
    scheduleReconnect,
    sendToSocket,
    processBatch,
    applyMessageScalarState,
  ]);

  // ── Pass 2: derive rendered output from raw state ──────────────
  const chatStream = useMemo(() => normalizeChatStream(rawMessages), [rawMessages]);
  const renderedMessages = useMemo(
    () => renderChatStream(chatStream, { isResume: isResumeRef.current }),
    [chatStream],
  );

  const onNew = useCallback(
    async (message: AppendMessage) => {
      const textContent = (Array.isArray(message.content) ? message.content : [])
        .filter((p) => p.type === "text")
        .map((p) => (p as { text: string }).text)
        .join("\n");

      if (textContent.trim()) {
        sendToSocket({
          type: "user",
          message: { role: "user", content: [{ type: "text", text: textContent }] },
        });
      }
    },
    [sendToSocket],
  );

  const onCancel = useCallback(async () => {
    if (compactPhaseRef.current === "compacting") {
      compactInterruptedRef.current = true;
    }
    sendToSocket({
      type: "control_request",
      request_id: crypto.randomUUID(),
      request: { subtype: "interrupt" },
    });
  }, [sendToSocket]);

  const storeAdapter = useMemo<ExternalStoreAdapter<ThreadMessageLike>>(
    () => ({
      messages: renderedMessages,
      isRunning,
      convertMessage: (m: ThreadMessageLike) => m,
      onNew,
      onCancel,
    }),
    [renderedMessages, isRunning, onNew, onCancel],
  );

  return {
    storeAdapter,
    bridge,
    currentModel,
    resolvedModel,
    modelSwitchVersion,
    permissionMode,
    aiTitle,
    agentName,
    loading,
    tasks,
    slashCommands,
    skills,
    mcpServers,
    inputQueue,
    lastPrompt,
    sessionLeafUuid,
    retryInfo,
  };
}
