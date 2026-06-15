import { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ExternalStoreAdapter, AppendMessage, ThreadMessageLike } from "@assistant-ui/react";
import type {
  Claude2ControlResponse,
  Claude2QueueOperation,
  SessionStreamServerMessage,
} from "@agents-remote/shared";
import { claude2StreamUrl, getAgentSessionMessages } from "../api/client";

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

// KEPT: used by commented-out loadMessagesFromRaw
/*
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asReadonlyJSON = (v: Record<string, unknown>): any => v;
*/

const _SKILL_CONTENT_PREFIX = "Base directory for this skill:";

const _extractUserTextBlocks = (content: unknown): string[] => {
  if (!Array.isArray(content)) return [];
  return (content as Array<Record<string, unknown>>)
    .filter((block) => block.type === "text" && typeof block.text === "string" && block.text.trim())
    .map((block) => block.text as string);
};

const _isHiddenSkillContent = (texts: string[]): boolean =>
  texts.some((text) => text.startsWith(_SKILL_CONTENT_PREFIX));

const _attachSkillContentToToolCall = (
  messages: ThreadMessageLike[],
  currentParts: Array<Record<string, unknown>>,
  toolUseId: string,
  skillContent: string,
): {
  messages: ThreadMessageLike[];
  currentParts: Array<Record<string, unknown>>;
  attached: boolean;
} => {
  const matchIdx = currentParts.findIndex(
    (part) => part.type === "tool-call" && "toolCallId" in part && part.toolCallId === toolUseId,
  );
  if (matchIdx >= 0) {
    return {
      messages,
      currentParts: currentParts.map((part, index) =>
        index === matchIdx
          ? {
              ...part,
              metadata: {
                ...(part.metadata as Record<string, unknown> | undefined),
                skillContent,
              },
            }
          : part,
      ),
      attached: true,
    };
  }

  for (let i = messages.length - 1; i >= 0; i--) {
    const candidate = messages[i];
    if (candidate.role !== "assistant" || !Array.isArray(candidate.content)) continue;

    const flushedMatchIdx = candidate.content.findIndex(
      (part) =>
        part.type === "tool-call" &&
        "toolCallId" in part &&
        (part as Record<string, string>).toolCallId === toolUseId,
    );
    if (flushedMatchIdx < 0) continue;

    const updatedContent = [...candidate.content];
    updatedContent[flushedMatchIdx] = {
      ...updatedContent[flushedMatchIdx],
      metadata: {
        ...((updatedContent[flushedMatchIdx] as Record<string, unknown>).metadata as
          | Record<string, unknown>
          | undefined),
        skillContent,
      },
    };

    const nextMessages = [...messages];
    nextMessages[i] = { ...candidate, content: updatedContent };
    return { messages: nextMessages, currentParts, attached: true };
  }

  return { messages, currentParts, attached: false };
};

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
 * Convert raw Claude2 JSONL/API messages into ThreadMessageLike[] for
 * assistant-ui history display.
 *
 * Pure function — no side effects, no network. Testable in isolation.
 *
 * Key behaviors:
 * - Groups assistant messages by message.id into a single bubble.
 * - Matches tool_result to tool-call by tool_use_id, even when separated
 *   by intervening user text messages ("Continue from where you left off.").
 * - Skips is_error tool_results (Claude auto-generates these for
 *   auto-allowed AskUserQuestion without real answers).
 * - control_request messages are NOT in JSONL history — AskUserQuestion
 *   in history comes from assistant tool_use blocks directly.
 */
/**
 * Count active streams/tool-calls from raw messages. Each "start" event
 * increments the counter; each "end" event decrements it. isRunning is
 * true whenever the counter > 0.
 *
 * Start (+1):  first assistant in a turn, first thinking_tokens in a turn,
 *              each tool_use block
 * End   (-1):  result (resets to 0), each matched tool_result block
 *
 * Multiple assistant deltas (same turn) count as 1, not N.
 * Multiple thinking_tokens deltas count as 1, not N.
 */
export function computeRunningCount(rawMessages: SessionStreamServerMessage[]): number {
  let turnOpen = false;

  for (const msg of rawMessages) {
    if (!msg) continue;

    if (msg.type === "result") {
      turnOpen = false;
      continue;
    }

    if (msg.type === "assistant") {
      turnOpen = true;
      continue;
    }

    if (msg.type === "system" && "subtype" in msg && msg.subtype === "thinking_tokens") {
      turnOpen = true;
      continue;
    }
  }

  return turnOpen ? 1 : 0;
}

// ── Unified message dispatch ─────────────────────────────────────────
// Entry point for all live messages after batch processing.
// Converts SessionStreamServerMessage → ThreadMessageLike | null.
// Returns null for messages that don't produce UI output (business logic
// like compact, retry, task, etc. handled internally).

// ── State delta ──────────────────────────────────────────────────────
// processMessage is the single entry point: raw message → all state updates.
// It lives inside the hook and directly applies state changes.
// Building blocks (convertExternalToThreadLike, extractTaskOps, etc.) are
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
  const userType = (msg as Record<string, unknown>).userType;
  if (userType !== "external") return [];
  if (msg.type !== "assistant") return [];
  const assistantMsg = msg as unknown as { message: { content: RawContentBlock[] } };
  return assistantMsg.message.content
    .map(extractTaskOpFromBlock)
    .filter((op): op is TaskSystemMessage => op !== null);
}

export function hasToolUseNamed(msg: SessionStreamServerMessage, toolName: string): boolean {
  const userType = (msg as Record<string, unknown>).userType;
  if (userType !== "external") return false;
  if (msg.type !== "assistant") return false;
  const assistantMsg = msg as unknown as { message: { content: RawContentBlock[] } };
  return assistantMsg.message.content.some(
    (b) => b.type === "tool_use" && (b.name === toolName || b.name === toolName.toLowerCase()),
  );
}

// ── Handlers ─────────────────────────────────────────────────────────

export function convertExternalToThreadLike(
  msg: SessionStreamServerMessage,
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
      return enrichBubbleMetadata({
        role: "assistant",
        content: parts,
        metadata: { custom: { _raw: msg } },
      });
    }
    case "user":
      return null;
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

/** Check if a message is an external API error annotation (not a normal assistant reply). */
export function isExternalApiErrorMessage(msg: SessionStreamServerMessage): boolean {
  const m = msg as Record<string, unknown>;
  return m.userType === "external" && m.isApiErrorMessage === true;
}

/** Extract human-readable error text from an API error message. */
export function extractApiErrorText(msg: SessionStreamServerMessage): string {
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
  const err = (msg as Record<string, unknown>).error;
  if (typeof err === "string") return err;
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
  return {
    uuid: getMsgUuid(msg) ?? undefined,
    parentUuid: getMsgParentUuid(msg) ?? undefined,
    error: (msg as Record<string, unknown>).error as string | undefined,
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
export function makeBoundaryDivider(kind: "history" | "output"): ThreadMessageLike {
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
    msg.type === "history_start" ||
    msg.type === "history_end" ||
    msg.type === "output_start" ||
    msg.type === "output_end"
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
  if (msg.type === "last-prompt") {
    return { role: "user", content: msg.lastPrompt, metadata: meta };
  }
  if (msg.type === "file-history-snapshot") {
    const count = Object.keys(msg.snapshot?.trackedFileBackups ?? {}).length;
    const text = `文件历史快照 · ${count} 个文件`;
    return { role: "system", content: [{ type: "text", text }], metadata: meta };
  }
  return { role: "system", content: [{ type: "text", text: raw }], metadata: meta };
}

// KEPT: 作为后续新渲染函数的参考实现
/*
export function loadMessagesFromRaw(
  rawMessages: SessionStreamServerMessage[],
): ThreadMessageLike[] {
  let messages: ThreadMessageLike[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let currentParts: any[] = [];
  let lastAssistantMsgId: string | null = null;

  // Shared mutable wrapper so reasoning parts created in the same turn all
  // reference the latest estimated_tokens. During live streaming
  // loadMessagesFromRaw re-runs on every rawMessages update, so the
  // reference stays current. During replay/reconnect, the latest raw
  // thinking_tokens event in the stream wins naturally.
  let turnTokens: { value: number } = { value: 0 };
  let turnDuration: { value: number | null } = { value: null };

  const flushAssistant = () => {
    if (currentParts.length > 0) {
      messages.push({ role: "assistant", content: currentParts });
    }
    currentParts = [];
  };

  for (let i = 0; i < rawMessages.length; i++) {
    const msg = rawMessages[i];

    if (msg.type === "system") {
      if (msg.subtype === "thinking_tokens") {
        turnTokens.value = (msg as { estimated_tokens: number }).estimated_tokens;
        continue;
      }
      if (msg.subtype === "api_retry") {
        continue;
      }
      if (msg.subtype === "compact_boundary" || msg.subtype === "microcompact_boundary") {
        const meta = (msg as Record<string, unknown>).compactMetadata as
          | Record<string, unknown>
          | undefined;
        const micro = (msg as Record<string, unknown>).microcompactMetadata as
          | Record<string, unknown>
          | undefined;
        const data = meta ?? micro ?? {};
        const trigger = (data.trigger as string) ?? "auto";
        const preTokens = data.preTokens as number | undefined;
        const preStr = preTokens ? `${Math.round(preTokens / 1000)}k` : null;
        const label = trigger === "manual" ? "上下文已压缩" : "上下文自动压缩";
        const text = preStr ? `${label} (~${preStr} tokens)` : label;
        flushAssistant();
        messages.push({
          role: "system",
          content: [{ type: "text", text }],
        });
        continue;
      }
      continue;
    }

    if (msg.type === "user") {
      const userMeta = msg as Record<string, unknown>;
      const rawContent = msg.message.content as unknown;
      const userTexts = extractUserTextBlocks(rawContent);
      const hasHiddenSkillContent =
        isHiddenSkillContent(userTexts) &&
        (userMeta.isMeta === true ||
          userMeta.isSynthetic === true ||
          typeof userMeta.sourceToolUseID === "string");

      if (userMeta.isMeta === true || hasHiddenSkillContent) {
        const toolUseId =
          typeof userMeta.sourceToolUseID === "string" ? userMeta.sourceToolUseID : null;
        const skillContent =
          userTexts.length > 0 ? userTexts.join("\n") : extractTextFromContent(rawContent);

        if (toolUseId && skillContent) {
          const attached = attachSkillContentToToolCall(
            messages,
            currentParts,
            toolUseId,
            skillContent,
          );
          messages = attached.messages;
          currentParts = attached.currentParts;
          if (!attached.attached) {
            console.warn("[claude2-adapter] skillContent: no matching tool-call found", {
              toolUseId,
            });
          }
        }
        continue;
      }

      // CLI command output (e.g. <local-command-stdout> for /compact).
      // Content is a plain string, not the usual array of blocks.
      if (typeof rawContent === "string") {
        const content = rawContent as string;
        // CLI command output — render as a tool result (like Bash), not a
        // user bubble. <local-command-caveat> is internal bookkeeping.
        if (content.includes("<local-command-stdout>")) {
          const text = content.replace(/<\/?local-command-stdout>/g, "").trim();
          // compact_boundary already provides the persistent compact record;
          // don't create a redundant card for "Compacted" stdout.
          if (text === "Compacted" || text.startsWith("Compacted ")) {
            continue;
          }
          flushAssistant();
          messages.push({
            role: "assistant",
            content: [
              {
                type: "tool-call" as const,
                toolCallId: `cmd-${i}`,
                toolName: "slash-command",
                args: asReadonlyJSON({}),
                argsText: "",
                result: text || content,
              },
            ],
          });
        }
        // <local-command-caveat> and other string-content user messages are
        // CLI internal (compact summaries, caveats) — skip.
        continue;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const contentBlocks = rawContent as any[];

      for (const block of contentBlocks) {
        if (block.type === "tool_result") {
          const isError = !!(block as { is_error?: boolean }).is_error;
          const texts =
            typeof block.content === "string"
              ? block.content
              : (block.content as Array<{ type: string; text: string }>)
                  .filter((c) => c.type === "text")
                  .map((c) => c.text)
                  .join("\n");
          const resultText = texts || "Tool result";
          const toolUseId: string = "tool_use_id" in block ? (block.tool_use_id as string) : "";
          const matchIdx = currentParts.findIndex(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (p: any) => p.type === "tool-call" && "toolCallId" in p && p.toolCallId === toolUseId,
          );
          if (toolUseId && matchIdx >= 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            currentParts = currentParts.map((p: any, i: number) =>
              i === matchIdx
                ? { ...p, result: resultText, ...(isError ? { isError: true } : {}) }
                : p,
            );
          } else if (toolUseId) {
            let found = false;
            for (let j = messages.length - 1; j >= 0; j--) {
              const candidate = messages[j];
              if (candidate.role === "assistant" && Array.isArray(candidate.content)) {
                const flushedMatchIdx = candidate.content.findIndex(
                  (p) =>
                    p.type === "tool-call" &&
                    "toolCallId" in p &&
                    (p as { toolCallId: string }).toolCallId === toolUseId,
                );
                if (flushedMatchIdx >= 0) {
                  currentParts = [...candidate.content];
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  currentParts = currentParts.map((p: any, i: number) =>
                    i === flushedMatchIdx
                      ? { ...p, result: resultText, ...(isError ? { isError: true } : {}) }
                      : p,
                  );
                  messages.splice(j, 1);
                  found = true;
                  break;
                }
              }
            }
            if (!found) {
              // Tool_use_id not found anywhere — possibly from a different turn. Ignore.
            }
          }
        }
      }

      // Attach structured tool result metadata to the last matching tool-call.
      // Real JSONL currently uses camelCase toolUseResult; keep snake_case
      // for compatibility with earlier assumptions / transformed payloads.
      const toolUseResult = ((msg as Record<string, unknown>).toolUseResult ??
        (msg as Record<string, unknown>).tool_use_result) as unknown;
      if (toolUseResult) {
        for (let i = currentParts.length - 1; i >= 0; i--) {
          const p = currentParts[i] as Record<string, unknown>;
          if (p.type === "tool-call" && !p.structuredResult) {
            currentParts = currentParts.map((part, idx) =>
              idx === i ? { ...part, structuredResult: toolUseResult } : part,
            );
            break;
          }
        }
      }

      if (userTexts.length > 0) {
        flushAssistant();
        messages.push({ role: "user", content: userTexts.join("\n") });
      }

      continue;
    }

    if (msg.type === "assistant") {
      const model = (msg.message as { model?: string } | undefined)?.model;
      // Synthetic messages are CLI internal (e.g. "no response requested",
      // compact cancellation notices). Skip them in both live and history.
      if (model === "<synthetic>") continue;

      const msgId = msg.message?.id as string | undefined;
      if (msgId && msgId !== lastAssistantMsgId) {
        flushAssistant();
        lastAssistantMsgId = msgId;
      }
      for (const block of msg.message.content) {
        if (block.type === "text") {
          currentParts = [...currentParts, { type: "text" as const, text: block.text }];
        }
        if (block.type === "thinking") {
          currentParts = [
            ...currentParts,
            {
              type: "reasoning" as const,
              text: block.thinking,
              estimatedTokens: turnTokens,
              durationMs: turnDuration,
            },
          ];
        }
        if (block.type === "tool_use") {
          currentParts = [
            ...currentParts,
            {
              type: "tool-call" as const,
              toolCallId: block.id,
              toolName: block.name,
              args: asReadonlyJSON(block.input),
              argsText: JSON.stringify(block.input),
            },
          ];
        }
      }
      continue;
    }

    if (msg.type === "result") {
      // Capture turn duration for reasoning display (shared mutable ref so
      // reasoning parts created before the result still see the final value).
      if ("duration_ms" in msg && typeof msg.duration_ms === "number") {
        turnDuration.value = msg.duration_ms;
      }
      // If the API returned an error (e.g. 422 model not found), surface it
      // as an inline error divider so the user sees what went wrong.
      if ("is_error" in msg && msg.is_error && typeof msg.result === "string") {
        flushAssistant();
        lastAssistantMsgId = null;
        messages.push({
          role: "system",
          content: [{ type: "text", text: msg.result }],
          metadata: { custom: { systemMessageType: "error" } },
        });
      } else {
        flushAssistant();
        lastAssistantMsgId = null;
      }
      // Reset per-turn tracking
      turnTokens = { value: 0 };
      turnDuration = { value: null };
      continue;
    }
  }

  flushAssistant();
  return messages;
}
*/

export function useClaude2Session(
  projectName: string,
  sessionId: string,
  initialModel?: string,
  initialPermissionMode?: string,
) {
  const [connectionVersion, setConnectionVersion] = useState(0);

  // ── Unified message state ──────────────────────────────────────────
  const [messages, setMessagesState] = useState<ThreadMessageLike[]>([]);
  const messageMapRef = useRef<Map<string, SessionStreamServerMessage>>(new Map());
  const historyBatchRef = useRef<SessionStreamServerMessage[] | null>(null);
  const outputBatchRef = useRef<SessionStreamServerMessage[] | null>(null);
  // Tracks whether the current batch (since last *_start) contains visible content.
  // Reset on *_start; flipped true when a visible bubble is appended; checked at *_end.
  const currentBatchHasContentRef = useRef(false);

  // All external-message side effects in one place.
  // API errors are intercepted before convert — they attach to parent bubbles,
  // never render as standalone messages.
  const pendingApiErrorsRef = useRef<SessionStreamServerMessage[]>([]);

  const handleExternalMessage = useCallback((msg: SessionStreamServerMessage) => {
    if (isExternalApiErrorMessage(msg)) {
      setMessagesState((prev) => {
        const result = attachApiErrorToMessages(prev, msg, messageMapRef.current);
        if (!result.attached) {
          pendingApiErrorsRef.current.push(msg);
        }
        return result.messages;
      });
      return;
    }

    const uiMessage = convertExternalToThreadLike(msg);
    if (uiMessage) {
      currentBatchHasContentRef.current = true;
      setMessagesState((prev) => {
        let next = [...prev, uiMessage];
        if (pendingApiErrorsRef.current.length > 0) {
          const drained = drainPendingErrors(
            next,
            pendingApiErrorsRef.current,
            messageMapRef.current,
          );
          pendingApiErrorsRef.current = drained.remaining;
          next = drained.messages;
        }
        return next;
      });
    }

    const ops = extractTaskOps(msg);
    if (ops.length > 0) setTasks((prev) => ops.reduce(applyTaskSystemMessage, prev));

    if (hasToolUseNamed(msg, "EnterPlanMode")) setPermissionMode("plan");
  }, []);

  // All non-external (synthetic / system / result) message side effects.
  const handleInternalMessage = useCallback((msg: SessionStreamServerMessage) => {
    if (msg.type === "permission-mode") {
      setPermissionMode(msg.permissionMode);
    }
    if (msg.type === "ai-title") {
      if (msg.aiTitle !== lastAiTitleRef.current) {
        lastAiTitleRef.current = msg.aiTitle;
        setAiTitle(msg.aiTitle);
      }
    }
    if (msg.type === "agent-name") {
      if (msg.agentName !== lastAgentNameRef.current) {
        lastAgentNameRef.current = msg.agentName;
        setAgentName(msg.agentName);
      }
    }
    if (msg.type === "queue-operation") {
      setInputQueue((prev) => applyQueueOperation(prev, msg));
      return;
    }
    const uiMessage = messageToThreadLike(msg);
    if (uiMessage) {
      currentBatchHasContentRef.current = true;
      const enriched = enrichBubbleMetadata(uiMessage);
      setMessagesState((prev) => {
        let next = [...prev, enriched];
        if (pendingApiErrorsRef.current.length > 0) {
          const drained = drainPendingErrors(
            next,
            pendingApiErrorsRef.current,
            messageMapRef.current,
          );
          pendingApiErrorsRef.current = drained.remaining;
          next = drained.messages;
        }
        return next;
      });
    }
  }, []);

  // Single entry point: dispatches by userType to the matching handler.
  const processMessage = useCallback(
    (msg: SessionStreamServerMessage) => {
      const userType = (msg as Record<string, unknown>).userType;
      if (userType === "external") {
        handleExternalMessage(msg);
      } else {
        handleInternalMessage(msg);
      }
    },
    [handleExternalMessage, handleInternalMessage],
  );

  const processBatch = useCallback(
    (rawMessages: SessionStreamServerMessage[]) => {
      // Phase 1: register all messages so errors can find their parents
      // regardless of message order within the batch.
      for (const m of rawMessages) {
        const uuid = getMessageUuid(m);
        if (uuid) messageMapRef.current.set(uuid, m);
      }
      // Phase 2: process each message through the normal pipeline.
      for (const m of rawMessages) {
        processMessage(m);
      }
    },
    [processMessage],
  );

  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasOlder, setHasOlder] = useState(false);
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
  const [inputQueue, setInputQueue] = useState<QueueEntry[]>([]);

  const [retryInfo, setRetryInfo] = useState<RetryInfo | null>(null);
  const retryCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const resetSessionState = useCallback(() => {
    setMessagesState([]);
    messageMapRef.current = new Map();
    setTasks([]);
    setSlashCommands([]);
    setSkills([]);
    setInputQueue([]);
    setRetryInfo(null);
    if (retryCountdownRef.current) {
      clearInterval(retryCountdownRef.current);
      retryCountdownRef.current = null;
    }
    setHasOlder(false);
    setLoading(true);
    setIsRunning(false);
    cursorRef.current = null;
    pendingAskRef.current = null;
    historyBatchRef.current = null;
    outputBatchRef.current = null;
    compactActiveRef.current = false;
    compactPhaseRef.current = "none";
    compactInterruptedRef.current = false;
    pendingApiErrorsRef.current = [];
    currentBatchHasContentRef.current = false;
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

  useEffect(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    setConnectionVersion(0);
    resetSessionState();
  }, [projectName, sessionId, resetSessionState]);

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

  useEffect(() => {
    let cancelled = false;
    const url = claude2StreamUrl(projectName, sessionId);

    if (connectionVersion === 0) {
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
        if (msg.type === "history_start") {
          historyBatchRef.current = [];
          currentBatchHasContentRef.current = false;
          // Queue-operation has no uuid dedup; clear on replay to avoid double-application on reconnect
          setInputQueue([]);
          setLoading(true);
          setIsRunning(false);
          console.log("[claude2-adapter] history batch start, count=", msg.count);
          return;
        }
        if (msg.type === "history_end") {
          const batch = historyBatchRef.current ?? [];
          historyBatchRef.current = null;
          processBatch(batch);
          if (currentBatchHasContentRef.current) {
            setMessagesState((prev) => [...prev, makeBoundaryDivider("history")]);
          }
          currentBatchHasContentRef.current = false;
          console.log("[claude2-adapter] history batch end, processed", batch.length, "messages");
          return;
        }
        if (msg.type === "output_start") {
          outputBatchRef.current = [];
          currentBatchHasContentRef.current = false;
          console.log("[claude2-adapter] output batch start, count=", msg.count);
          return;
        }
        if (msg.type === "output_end") {
          const batch = outputBatchRef.current ?? [];
          outputBatchRef.current = null;
          processBatch(batch);
          if (currentBatchHasContentRef.current) {
            setMessagesState((prev) => [...prev, makeBoundaryDivider("output")]);
          }
          currentBatchHasContentRef.current = false;
          setLoading(false);
          console.log("[claude2-adapter] output batch end, processed", batch.length, "messages");
          return;
        }

        // In batch collection — buffer, don't process yet
        if (historyBatchRef.current) {
          historyBatchRef.current.push(msg);
          return;
        }
        if (outputBatchRef.current) {
          outputBatchRef.current.push(msg);
          return;
        }

        // ── Per-message dispatch (live, after batches) ───────────────
        const liveUuid = getMessageUuid(msg);
        if (liveUuid) messageMapRef.current.set(liveUuid, msg);

        processMessage(msg);

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
    processMessage,
    processBatch,
  ]);

  const threadLikeMessages = messages;

  const loadOlder = useCallback(
    async (cursorOverride?: string | null) => {
      const cursor = cursorOverride ?? cursorRef.current;
      if (!cursor) return;
      try {
        const response = await getAgentSessionMessages(projectName, sessionId, { cursor });
        cursorRef.current = response.pagination.nextCursor;
        setHasOlder(response.pagination.hasOlder);

        // Phase 1: register all messages so errors can find parents in-page.
        for (const m of response.messages) {
          const uuid = getMessageUuid(m);
          if (uuid) messageMapRef.current.set(uuid, m);
        }

        // Phase 2: convert non-error messages.
        const converted: ThreadMessageLike[] = [];
        const errorsInPage: SessionStreamServerMessage[] = [];

        for (const m of response.messages) {
          if (isExternalApiErrorMessage(m)) {
            errorsInPage.push(m);
            continue;
          }
          const userType = (m as Record<string, unknown>).userType;
          let uiMessage: ThreadMessageLike | null;
          if (userType === "external") {
            uiMessage = convertExternalToThreadLike(m);
            const ops = extractTaskOps(m);
            if (ops.length > 0) setTasks((prev) => ops.reduce(applyTaskSystemMessage, prev));
          } else if (m.type === "queue-operation") {
            setInputQueue((prev) => applyQueueOperation(prev, m));
            continue;
          } else {
            uiMessage = messageToThreadLike(m);
            if (uiMessage) uiMessage = enrichBubbleMetadata(uiMessage);
          }
          if (uiMessage) converted.push(uiMessage);
        }

        // Phase 3: attach errors from this page + any pending.
        const allPending = [...pendingApiErrorsRef.current, ...errorsInPage];
        const drained = drainPendingErrors(converted, allPending, messageMapRef.current);
        pendingApiErrorsRef.current = drained.remaining;

        // Phase 4: prepend and drain against existing messages too.
        setMessagesState((prev) => {
          let next = [...drained.messages, ...prev];
          if (pendingApiErrorsRef.current.length > 0) {
            const drained2 = drainPendingErrors(
              next,
              pendingApiErrorsRef.current,
              messageMapRef.current,
            );
            pendingApiErrorsRef.current = drained2.remaining;
            next = drained2.messages;
          }
          return next;
        });
      } catch (err) {
        console.error("[loadOlder] error", err);
      }
    },
    [projectName, sessionId],
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
      messages: threadLikeMessages,
      isRunning,
      convertMessage: (m: ThreadMessageLike) => m,
      onNew,
      onCancel,
    }),
    [threadLikeMessages, isRunning, onNew, onCancel],
  );

  return {
    storeAdapter,
    bridge,
    hasOlder,
    loadOlder,
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
    inputQueue,
    retryInfo,
  };
}
