import { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ExternalStoreAdapter, AppendMessage, ThreadMessageLike } from "@assistant-ui/react";
import type {
  Claude2Attachment,
  Claude2ControlResponse,
  Claude2QueueOperation,
  SessionStreamServerMessage,
} from "@agents-remote/shared";
import { isCompactBoundarySubtype } from "@agents-remote/shared";
import { claude2StreamUrl } from "../api/client";
import { isPerfTraceEnabled, isSocketLoggingEnabled } from "../lib/debug-flags";
import {
  count,
  markOnce,
  measureFrom,
  measureSince,
  peekMark,
  recordSample,
  reportArrival,
  resetArrival,
  tickArrival,
  timed,
} from "../lib/perf-trace";
import { queryClient } from "../lib/query-client";

export type TaskInfo = {
  id: string;
  agentType?: string;
  workflowName?: string;
  subject?: string;
  description: string;
  status: "pending" | "in_progress" | "completed" | "error" | "backgrounded";
  text?: string;
  summary?: string;
  error?: string;
  kind: "agent" | "workflow" | "task";
};

/**
 * Sort tasks for display by status priority, then numeric task id ascending:
 * in_progress first (the active signal), then pending, then any other
 * non-completed state (error/backgrounded), with completed tasks last. Grouping
 * by status — not just completed/not — keeps in_progress tasks clustered at the
 * top instead of interleaved with pending by id order. Pure; shared by TaskPanel
 * (expanded list) and the collapsed-header first-in-progress pick so the two
 * views never disagree on ordering.
 */
export function sortTasks(tasks: TaskInfo[]): TaskInfo[] {
  const numericId = (id: string): number => {
    const n = Number(id);
    return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
  };
  const statusRank = (status: TaskInfo["status"]): number => {
    switch (status) {
      case "in_progress":
        return 0;
      case "pending":
        return 1;
      case "completed":
        return 3;
      default:
        return 2;
    }
  };
  return [...tasks].sort((a, b) => {
    const rankDiff = statusRank(a.status) - statusRank(b.status);
    if (rankDiff !== 0) return rankDiff;
    return numericId(a.id) - numericId(b.id);
  });
}

type TaskSystemMessage = Extract<
  SessionStreamServerMessage,
  { type: "system"; subtype: "task_started" | "task_updated" | "task_notification" }
>;

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

export type RetryInfo = {
  attempt: number;
  maxRetries: number;
  retryDelayMs: number;
  error?: string;
  errorStatus?: number;
  startTime: number;
};

// Tracks client-initiated control_request actions (set_model /
// set_permission_mode / interrupt) awaiting the CLI's control_response. Keyed
// by request_id so the response can be matched to the originating action and
// rolled back on error.
export type PendingControlAction =
  | { kind: "set_model"; priorModel: string | undefined }
  | { kind: "set_permission_mode"; priorMode: string | undefined }
  | { kind: "interrupt" };

export const applyTaskSystemMessage = (prev: TaskInfo[], msg: TaskSystemMessage): TaskInfo[] => {
  // task_started: always creates. TaskCreate-originated ops use the tool_use_id
  // (block.id) as a TEMPORARY id — the real id arrives later in the tool_result
  // (toolUseResult/task.id, backfilled by applyMessageScalarState's user branch).
  // Real system/task_started messages keep their own task_id. The
  // `|| String(prev.length+1)` only covers a never-assigned edge.
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
        // pending = implicit initial state. TaskCreate's tool input/result carry
        // NO status (confirmed across session JSONLs); TaskUpdate always sends an
        // explicit in_progress/completed afterward. Don't switch to in_progress —
        // that skips the pending phase the CLI's lifecycle actually has.
        status: "pending",
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
    // Two sources feed this branch:
    //  (1) TaskUpdate tool calls (via extractTaskOpFromBlock) carry `taskStatus`
    //      = the raw protocol status (pending/in_progress/completed/deleted, or
    //      undefined when only editing addBlockedBy/addBlocks dependencies).
    //  (2) system.task_updated telemetry carries isBackgrounded/error with NO
    //      taskStatus. Status machine: pending → in_progress → completed; any
    //      state → deleted (removal). undefined keeps the current status.
    const rawStatus = (msg as Record<string, unknown>).taskStatus as string | undefined;
    if (rawStatus === "deleted") return prev.filter((t) => t.id !== msg.task_id);
    if (msg.error) {
      updated[existing] = { ...current, kind, status: "error", error: msg.error };
      return updated;
    }
    if (msg.isBackgrounded) {
      updated[existing] = { ...current, kind, status: "backgrounded" };
      return updated;
    }
    const nextStatus: TaskInfo["status"] | undefined =
      rawStatus === "completed"
        ? "completed"
        : rawStatus === "in_progress"
          ? "in_progress"
          : rawStatus === "pending"
            ? "pending"
            : undefined; // undefined (system msg / dependency edit) → keep current
    if (nextStatus === undefined) return prev;
    updated[existing] = { ...current, kind, status: nextStatus };
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

// A permission-mode change the CLI applies after a control_response allow.
// The CLI reads `permission_updates` (NOT updatedInput.permissionMode) — this
// is how ExitPlanMode approval conveys which mode to resume in.
export type PermissionUpdate = {
  type: "setMode";
  mode: string;
  destination: "session";
};

// "Auto" approve for plan-exit prefers the newer `auto` mode when the CLI
// advertises it (parsed from `claude --help --permission-mode` choices via
// availablePermissionModes); otherwise falls back to the classic, universally
// supported `acceptEdits`.
export function resolveAutoPermissionMode(available: readonly string[]): "auto" | "acceptEdits" {
  return available.includes("auto") ? "auto" : "acceptEdits";
}

export type Claude2Bridge = {
  respondToControlRequest: (
    requestId: string,
    updatedInput: Record<string, unknown>,
    permissionUpdates?: PermissionUpdate[],
  ) => void;
  cancelControlRequest: (requestId: string, message?: string) => void;
  sendToolResult: (toolUseId: string, content: string) => void;
  sendMessage: (text: string) => void;
  switchModel: (model: string) => void;
  switchPermissionMode: (mode: string) => void;
  onCompact:
    | ((
        event:
          | { phase: "start" }
          | { phase: "progress"; stage: "summarizing" }
          | { phase: "end"; error?: "interrupted" | "failed" },
      ) => void)
    | null;
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

// Tags emitted by CLI slash commands / !bash and echoed back as user messages.
// <local-command-caveat> is isMeta and is dropped upstream; the rest are
// rendered as a command-output card.
const COMMAND_ARTIFACT_TAG_PATTERN =
  "(?:local-command-(?:stdout|stderr)|command-(?:name|message|args)|bash-(?:input|stdout|stderr))";

const commandArtifactRegex = (): RegExp =>
  new RegExp(`<(${COMMAND_ARTIFACT_TAG_PATTERN})>([\\s\\S]*?)</\\1>`, "gi");

function parseCommandArtifactTags(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of content.matchAll(commandArtifactRegex())) {
    const tag = m[1]!;
    const value = m[2]!.trim();
    if (value) out[tag] = value;
  }
  return out;
}

function hasCommandArtifactTags(content: string): boolean {
  return commandArtifactRegex().test(content);
}

const getMessageUuid = (msg: SessionStreamServerMessage): string | null => {
  const uuid = (msg as Record<string, unknown>).uuid;
  return typeof uuid === "string" ? uuid : null;
};

// Build a command-output ChatStreamItem from a user message whose string
// content carries CLI command / bash echo tags. commandName falls back to
// command-message; stdout/stderr collapse the local-command and bash variants.
function buildCommandOutputItem(
  content: string,
  msg: SessionStreamServerMessage,
): Extract<ChatStreamItem, { kind: "command-output" }> {
  const tags = parseCommandArtifactTags(content);
  const isBash = "bash-input" in tags || "bash-stdout" in tags || "bash-stderr" in tags;
  return {
    kind: "command-output",
    commandName: (tags["command-name"] ?? tags["command-message"])?.replace(/^\//, ""),
    args: tags["command-args"],
    stdout: tags["local-command-stdout"] ?? tags["bash-stdout"],
    stderr: tags["local-command-stderr"] ?? tags["bash-stderr"],
    input: tags["bash-input"],
    sourceType: isBash ? "bash" : "local-command",
    sourceUuids: getMessageUuid(msg) ? [getMessageUuid(msg)!] : [],
    _rawSnapshots: [msg],
  };
}

// Build a command-output INPUT fragment from a plain-text slash-command echo
// (form D: some CLI commands persist the command INPUT as a system/local_command
// record with plain-text content like "/status" — no XML tags). commandName is
// the first token with the leading "/" stripped (matching buildCommandOutputItem);
// remaining tokens are args. stdout is left undefined so Pass B merges this
// input fragment with the following <local-command-stdout> output fragment.
function buildCommandOutputItemFromPlainText(
  text: string,
  msg: SessionStreamServerMessage,
): Extract<ChatStreamItem, { kind: "command-output" }> {
  const tokens = text.trim().split(/\s+/);
  return {
    kind: "command-output",
    commandName: tokens[0]!.replace(/^\//, ""),
    args: tokens.length > 1 ? tokens.slice(1).join(" ") : undefined,
    sourceType: "local-command",
    sourceUuids: getMessageUuid(msg) ? [getMessageUuid(msg)!] : [],
    _rawSnapshots: [msg],
  };
}

// Heuristic command-name recovery for form C: a single stdout-only
// command-output card (no input echo, so no commandName from tags/echo). Maps
// the stdout's first line against a whitelist of known CLI output prefixes.
// Unknown patterns return undefined (never guessed) → the card keeps its
// generic title. Extend STDOUT_COMMAND_HINTS to recognize more commands.
const STDOUT_COMMAND_HINTS: ReadonlyArray<{ test: RegExp; name: string }> = [
  { test: /^Set model to\b/i, name: "model" },
  { test: /^Reloaded skills:/i, name: "reload-skills" },
  { test: /^Total cost:/i, name: "cost" },
];

function inferCommandNameFromStdout(stdout: string): string | undefined {
  const head = stdout.trim().split("\n")[0] ?? "";
  for (const rule of STDOUT_COMMAND_HINTS) {
    if (rule.test.test(head)) return rule.name;
  }
  return undefined;
}

// Whether a command-output item was derived from a CLI synthetic assistant
// (model "<synthetic>"). JSONL replay double-records some slash commands
// (e.g. /reload-skills): a synthetic assistant echo AND separate user-tag +
// system/local_command records for the same command. The merge pass uses this
// to collapse the synthetic echo into the tag-based card.
const isSyntheticCommandOutput = (item: ChatStreamItem): boolean => {
  if (item.kind !== "command-output") return false;
  const raw = item._rawSnapshots[0] as Record<string, unknown> | undefined;
  if (!raw || raw.type !== "assistant") return false;
  const model = (raw.message as { model?: string } | undefined)?.model;
  return model === "<synthetic>";
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
 * Whether a turn is currently in-flight (isRunning) — i.e. the user is
 * waiting for / receiving the assistant's answer — counted over the live +
 * instantaneous segments ONLY.
 *
 * Opens on the first user-input echo (isUserInput) OR assistant delta /
 * thinking_tokens event of a turn, closes when a `result` arrives. Opening on
 * the user echo covers the network/CLI-startup gap between sending a message
 * and the first assistant event (the gap where the UI previously showed no
 * running indicator). Multiple assistant deltas in the same response count as
 * one, not N.
 *
 * Segment scope (see docs/design/message-replay.md "服务端状态"):
 * - history (JSONL archive): NEVER scanned. `result` is stdout-only and never
 *   persisted to JSONL, so history has no turn-close signal. Scanning it would
 *   leave waitingForAnswer stuck true on any archive ending in an assistant
 *   message (e.g. a resumed session's tail block) and falsely show running —
 *   the "three-dot animation + stop button on resume entry" bug.
 * - live + instantaneous (CLI stdout during this process lifetime): scanned.
 *   Both contain `result`, so opens/closes resolve correctly.
 *
 * `liveStart` is the rawMessages index where the live+instantaneous region
 * begins (= history segment length, captured at the `history_end` protocol
 * signal by the adapter). Defaults to 0 (no history segment — fresh session,
 * or history empty), so existing callers that omit it scan the whole array.
 *
 * `interruptAtIndex`: the index of a confirmed interrupt control_response.
 * The CLI replies control_response (not result) to an interrupt, so without
 * this boundary a stopped turn would never close; when the scan reaches this
 * index it closes the turn exactly like a `result`.
 *
 * Why resume shows idle: a resumed CLI is a fresh process; its live +
 * instantaneous region holds no open turn until the user sends a new prompt,
 * so the count is 0 on entry. Same invariant applyToolLifecycle encodes via
 * isResume (resume ⇒ turn already ended) — running and tool-interrupted are
 * two branches of one semantic tree.
 */
export function computeRunningCount(
  rawMessages: SessionStreamServerMessage[],
  opts?: { liveStart?: number; interruptAtIndex?: number },
): number {
  const liveStart = opts?.liveStart ?? 0;
  const interruptAtIndex = opts?.interruptAtIndex;
  let waitingForAnswer = false;

  for (let i = liveStart; i < rawMessages.length; i++) {
    const msg = rawMessages[i];
    if (!msg) continue;

    // A confirmed interrupt closes the turn just like `result`: the CLI replies
    // control_response (not result) to an interrupt, so without this boundary
    // the running indicator would stick after stop.
    if (i === interruptAtIndex) {
      waitingForAnswer = false;
      continue;
    }

    if (msg.type === "result") {
      waitingForAnswer = false;
      continue;
    }

    if (msg.type === "assistant") {
      waitingForAnswer = true;
      continue;
    }

    if (msg.type === "system" && "subtype" in msg && msg.subtype === "thinking_tokens") {
      waitingForAnswer = true;
      continue;
    }

    if (msg.type === "user") {
      // In the live stream, user messages are echoes our api service injects
      // when the client submits (the CLI never echoes user input on stdout).
      // Such an echo arrives before any assistant event, so it is the earliest
      // "a turn has started" signal — open running here to cover the network/
      // CLI-startup gap before the first assistant delta. Only trust the
      // isUserInput flag set at inject time: CLI-internal user messages
      // (isMeta/isSynthetic skill bodies, compact summaries, command noise) do
      // not carry it and stay neutral, so they never open running.
      if ((msg as { isUserInput?: boolean }).isUserInput) waitingForAnswer = true;
      continue;
    }
  }

  return waitingForAnswer ? 1 : 0;
}

/**
 * Latest estimated_tokens of the in-flight response's thinking phase, or null.
 *
 * The thinking phase is when the response is running and thinking_tokens are
 * streaming but no assistant content has arrived yet for this turn — i.e. the
 * most recent thinking_tokens comes after the most recent assistant message.
 * Drives the live "Thinking… (N tokens)" indicator. Once the assistant(thinking)
 * block arrives this returns null and the reasoning part (ReasoningGroup, with
 * the final stamped count) takes over. Null when idle, in replay, or when the
 * turn has no thinking_tokens at all.
 *
 * Same segment scope as computeRunningCount: only the live + instantaneous
 * region (from `liveStart`) is considered — history thinking_tokens belong to
 * archived turns and must not drive the live indicator.
 */
export function deriveLiveThinkingTokens(
  rawMessages: SessionStreamServerMessage[],
  opts?: { liveStart?: number },
): number | null {
  const liveStart = opts?.liveStart ?? 0;
  if (computeRunningCount(rawMessages, { liveStart }) === 0) return null;
  let lastAssistantIdx = -1;
  let lastThinkingTokensIdx = -1;
  let lastEstimated: number | null = null;
  for (let i = liveStart; i < rawMessages.length; i++) {
    const msg = rawMessages[i];
    if (!msg) continue;
    if (msg.type === "assistant") {
      lastAssistantIdx = i;
    } else if (msg.type === "system" && "subtype" in msg && msg.subtype === "thinking_tokens") {
      lastThinkingTokensIdx = i;
      lastEstimated = (msg as unknown as { estimated_tokens?: number }).estimated_tokens ?? null;
    }
  }
  if (lastThinkingTokensIdx === -1 || lastAssistantIdx > lastThinkingTokensIdx) return null;
  return lastEstimated;
}

// ── Agent container status derivation ────────────────────────────────
// Pure function: derives an Agent container's lifecycle status from its
// tool signals alone — no socket state, no independent container state.
// This is a projection of rawMessages, per UI = f(state).
//
// Tool/Agent status derives ONLY from server-side CLI execution signals:
// - COMPLETION is by tool_use_id pairing (hasTail = the tail tool_result
//   arrived).
// - INTERRUPTION timing is by turn-end: applyToolLifecycle marks a
//   still-unresolved tool `isInterrupted` once the turn has ended (the
//   `result` message's position), or unconditionally on resume.
//   hasTail + !isError     → complete
//   hasTail + isError      → error
//   !hasTail + interrupted → interrupted (turn ended / resumed without result)
//   !hasTail + !interrupted → running (turn still active)
export type AgentContainerStatus = "running" | "complete" | "error" | "interrupted";

export function deriveStatus(input: {
  hasTail: boolean;
  isError: boolean;
  isInterrupted: boolean;
}): AgentContainerStatus {
  if (input.isInterrupted) return "interrupted";
  if (input.hasTail) return input.isError ? "error" : "complete";
  return "running";
}

// ── Agent container tail envelope ────────────────────────────────────
// The Agent tool_result's tool_use_result envelope carries final stats +
// full content. Pure projection parsed once in Pass 2: stats (everything
// except content) drive the always-visible tail row; content is expandable.
export type AgentTailStats = {
  agentType?: string;
  status?: string;
  totalTokens?: number;
  totalToolUseCount?: number;
  totalDurationMs?: number;
  toolStats?: Record<string, number>;
};

export type AgentTail = {
  stats: AgentTailStats;
  content: string;
};

export function extractAgentTail(envelope: unknown, fallbackContent?: string): AgentTail | null {
  if (!envelope || typeof envelope !== "object") return null;
  const e = envelope as Record<string, unknown>;
  let content = fallbackContent ?? "";
  const c = e.content;
  if (typeof c === "string") {
    content = c;
  } else if (Array.isArray(c)) {
    const texts = c
      .map((b) => {
        const block = b as Record<string, unknown>;
        return block?.type === "text" ? String(block.text ?? "") : "";
      })
      .filter((t) => t.length > 0);
    if (texts.length > 0) content = texts.join("\n");
  }
  return {
    stats: {
      agentType: typeof e.agentType === "string" ? e.agentType : undefined,
      status: typeof e.status === "string" ? e.status : undefined,
      totalTokens: typeof e.totalTokens === "number" ? e.totalTokens : undefined,
      totalToolUseCount: typeof e.totalToolUseCount === "number" ? e.totalToolUseCount : undefined,
      totalDurationMs: typeof e.totalDurationMs === "number" ? e.totalDurationMs : undefined,
      toolStats:
        e.toolStats && typeof e.toolStats === "object"
          ? (e.toolStats as Record<string, number>)
          : undefined,
    },
    content,
  };
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
    case "thinking": {
      const t = (block.thinking as string) ?? "";
      if (!t.trim()) return null;
      return { type: "reasoning", text: t };
    }
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
    // The real task id is assigned by the CLI and only arrives in the
    // tool_result (user message toolUseResult.task.id). Use the tool_use's
    // block.id (tool_use_id) as a TEMPORARY id here; applyMessageScalarState's
    // user branch backfills the real id when the tool_result lands. TaskUpdate
    // later references the real id via input.taskId.
    return {
      type: "system",
      subtype: "task_started",
      task_id: (block.id as string) ?? "",
      agentType: input.subagent_type as string | undefined,
      workflowName: input.workflow_name as string | undefined,
      subject: input.subject as string | undefined,
      prompt: (input.description ?? input.prompt ?? toolName) as string,
      session_id: "",
    } as unknown as TaskSystemMessage;
  }
  if (toolName === "TaskUpdate") {
    const taskId = (input.taskId ?? input.task_id ?? input.id) as string;
    return {
      type: "system",
      subtype: "task_updated",
      task_id: taskId,
      // Pass the raw protocol status through untouched (pending/in_progress/
      // completed/deleted, or undefined when only editing addBlockedBy/
      // addBlocks). The reducer owns the status machine — no boolean
      // pre-translation here.
      taskStatus: input.status as string | undefined,
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
    case "in_progress":
      return "in_progress";
    case "pending":
      return "pending";
    case "error":
      return "error";
    case "backgrounded":
      return "backgrounded";
    default:
      return "in_progress";
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
  const content = msg.message.content;
  if (typeof content === "string") return [];
  return content
    .filter(
      (b): b is typeof b & { type: "tool_result"; tool_use_id: string } =>
        b.type === "tool_result" && typeof b.tool_use_id === "string",
    )
    .map((b) => b.tool_use_id);
}

/**
 * For a TaskCreate tool_result (user message), pair the tool_use_id with the
 * REAL task id carried in the structured result envelope. The field name
 * differs by source — live stdout uses snake_case `tool_use_result`, JSONL/
 * replay uses camelCase `toolUseResult` (same wire message, different keys on
 * disk) — so both are accepted. Returns null for non-Task tool_results (no
 * `.task`, e.g. Write/File) and non-user messages. The temporary task was
 * created with tool_use_id as its id (see extractTaskOpFromBlock);
 * applyMessageScalarState uses this mapping to backfill the real id.
 */
export function extractTaskIdAssignment(
  msg: SessionStreamServerMessage,
): { toolUseId: string; taskId: string } | null {
  if (msg.type !== "user") return null;
  const m = msg as Record<string, unknown>;
  const tur = (m.toolUseResult ?? m.tool_use_result) as { task?: { id?: unknown } } | undefined;
  const id = tur?.task?.id;
  if (typeof id !== "string" && typeof id !== "number") return null;
  const toolUseIds = getMsgToolResultIds(msg);
  if (toolUseIds.length === 0) return null;
  // TaskCreate tool_result is single (the tool must wait for its result to get
  // the id, so it never runs in parallel); the task.id belongs to that one
  // tool_result → pair with the first (only) tool_use_id.
  return { toolUseId: toolUseIds[0], taskId: String(id) };
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
  const content = msg.message.content;
  if (typeof content === "string") return [];
  const results: ExtractedToolResult[] = [];
  for (const block of content) {
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
        // Self-heal: a late result overrides a premature interrupted mark
        delete update.isInterrupted;
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
 * Apply the tool execution lifecycle: mark still-unresolved tools
 * `isInterrupted` once their turn has ended, so a tool whose `tool_result`
 * never arrived doesn't render as "running" forever.
 *
 * Two separate mechanisms — do NOT conflate them (this was a recurring source
 * of confusion):
 * - Tool COMPLETION is by `tool_use_id` pairing: normalizeChatStream fills
 *   `custom.result` / `custom.tailResult` when the matching result arrives.
 *   A tool with a result is complete regardless of any turn boundary.
 * - Tool INTERRUPTION timing is by turn-end: a tool still missing its result
 *   when the turn ends is marked `isInterrupted`. The turn-end signal is the
 *   `result` message's position (captured in `turnEndBoundaries`); a tool at
 *   render index `i < lastBoundary` belongs to a turn that already ended.
 *
 * So tool↔result association is by id, NOT by turn-end; turn-end only decides
 * WHEN an unresolved tool is considered interrupted.
 *
 * `result` is stdout-only (never persisted to JSONL — see docs/research/
 * claude-cli-stream-protocol.md), so resumed history has no turn-end markers.
 * On resume every still-unresolved tool is therefore marked interrupted
 * unconditionally via `opts.isResume` — matching the invariant that a resumed
 * CLI is a fresh process whose prior pending tools will never receive results.
 * Tool status derives ONLY from these server-side CLI signals — never from
 * client socket state. (The running indicator shares this same resume
 * invariant in `computeRunningCount`, but via live+instantaneous segment
 * scope rather than isResume directly.)
 *
 * `turnEndBoundaries` are render-list indices captured by renderChatStream
 * at each `turn-end` item (= messages.length at that point).
 *
 * Returns `{ messages: prev, changed: false }` when nothing was marked
 * (no-alloc pass to avoid needless re-render).
 */
export function applyToolLifecycle(
  messages: ThreadMessageLike[],
  turnEndBoundaries: number[],
  opts: { isResume: boolean },
): { messages: ThreadMessageLike[]; changed: boolean } {
  if (turnEndBoundaries.length === 0 && !opts.isResume) {
    return { messages, changed: false };
  }
  const lastBoundary =
    turnEndBoundaries.length > 0 ? turnEndBoundaries[turnEndBoundaries.length - 1] : -1;
  const turnEndedAt = (i: number) => opts.isResume || i < lastBoundary;

  let changed = false;
  const next = messages.map((msg, i) => {
    const custom = msg.metadata?.custom as Record<string, unknown> | undefined;
    // Standalone tool-card system message
    if (msg.role === "system" && custom?.systemMessageType === "tool-card") {
      if (custom.result != null || custom.isError === true || custom.isInterrupted === true)
        return msg;
      // Don't interrupt a tool awaiting a permission control_request.
      if (custom.controlRequestId) return msg;
      if (!turnEndedAt(i)) return msg;
      changed = true;
      return {
        ...msg,
        metadata: { custom: { ...custom, isInterrupted: true } },
      };
    }
    // Agent container (subagent tool): resolved when its tail result arrives.
    if (msg.role === "system" && custom?.systemMessageType === "agent-container") {
      if (custom.tailResult != null || custom.tailIsError === true || custom.isInterrupted === true)
        return msg;
      if (!turnEndedAt(i)) return msg;
      changed = true;
      return {
        ...msg,
        metadata: { custom: { ...custom, isInterrupted: true } },
      };
    }
    // Legacy: tool-call content parts inside assistant bubbles
    if (msg.role === "assistant" && Array.isArray(msg.content)) {
      let partChanged = false;
      const content = msg.content.map((part: unknown): unknown => {
        const p = part as Record<string, unknown>;
        if (p.type !== "tool-call") return part;
        if ("result" in p) return part;
        if (p.isError === true || p.isInterrupted === true) return part;
        if (p.controlRequestId) return part;
        if (!turnEndedAt(i)) return part;
        partChanged = true;
        return { ...p, isInterrupted: true };
      });
      if (!partChanged) return msg;
      changed = true;
      return { ...msg, content };
    }
    return msg;
  }) as ThreadMessageLike[];
  return { messages: changed ? next : messages, changed };
}

// Map the CLI's terminal_reason (authoritative turn-termination signal) to a
// display tone for the turn-end footer. When terminal_reason is unset (local
// slash command, or external budget/retry interrupt between yields) fall back
// to the coarse result subtype, then null — the footer still shows stats, just
// without a status word. terminal_reason enum confirmed from CLI v2.1.160.
export function mapTurnStatusTone(
  terminalReason?: string | null,
  subtype?: string | null,
): TurnStatusTone | null {
  switch (terminalReason ?? undefined) {
    case "completed":
      return "completed";
    case "aborted_streaming":
    case "aborted_tools":
      return "interrupted";
    case "max_turns":
      return "maxTurns";
    case "model_error":
    case "image_error":
    case "prompt_too_long":
      return "error";
    case "blocking_limit":
    case "rapid_refill_breaker":
      return "rateLimited";
    case "stop_hook_prevented":
    case "hook_stopped":
      return "hookStopped";
    case "tool_deferred":
      return "toolDeferred";
  }
  switch (subtype ?? undefined) {
    case "interrupted":
      return "interrupted";
    case "error":
    case "error_max_turns":
    case "error_during_execution":
      return "error";
    case "success":
      return "completed";
    default:
      return null;
  }
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
  if (!raw) {
    if (!bubble.metadata?.custom) {
      return { ...bubble, metadata: { custom: { sourceUuids: [], _rawMessages: [] } } };
    }
    return bubble;
  }
  const uuid = getMsgUuid(raw);
  const existingSources = (custom.sourceUuids as string[]) ?? [];
  const existingRawMessages = (custom._rawMessages as SessionStreamServerMessage[]) ?? [];
  return {
    ...bubble,
    metadata: {
      custom: {
        ...custom,
        sourceUuids: [...existingSources, ...(uuid ? [uuid] : [])],
        _rawMessages: [...existingRawMessages, raw],
      },
    },
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

// CLI emits "AbortError: Compaction canceled." when a compaction is aborted
// (user stop or upstream abort). Live form: assistant {model:"<synthetic>"}
// echo. Replay form: system local_command <local-command-stderr>…</…>. The
// merge pass folds either into the /compact echo as one command-output card,
// which duplicates the CompactIndicator abort feedback — normalizeChatStream
// drops such cards so the abort surfaces only via the compact lifecycle UI.
const COMPACT_ABORT_MARKER = "Compaction canceled";
function isCompactAbortRaw(msg: SessionStreamServerMessage): boolean {
  if (msg.type === "assistant" && isSyntheticAssistantMessage(msg)) {
    const body = extractSyntheticBody(msg);
    return typeof body === "string" && body.includes(COMPACT_ABORT_MARKER);
  }
  if (msg.type === "system" && (msg as { subtype?: string }).subtype === "local_command") {
    const content = (msg as { content?: string }).content;
    return typeof content === "string" && content.includes(COMPACT_ABORT_MARKER);
  }
  return false;
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

/** Build a thin horizontal divider marking the history/live batch boundary. */
export function makeBoundaryDivider(): ThreadMessageLike {
  return {
    role: "system",
    content: [{ type: "text", text: "" }],
    metadata: { custom: { systemMessageType: "batch-boundary" } },
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
    msg.type === "last-prompt" ||
    msg.type === "session_init" ||
    msg.type === "history_start" ||
    msg.type === "history_end" ||
    msg.type === "live_start" ||
    msg.type === "live_end" ||
    msg.type === "ended"
  ) {
    return null;
  }
  const raw = JSON.stringify(msg, null, 2);
  const meta = { custom: { _raw: msg } };
  const subtype = (msg as Record<string, unknown>).subtype as string | undefined;
  const uuid = (msg as Record<string, unknown>).uuid as string | undefined;
  const summary = [msg.type, subtype, uuid ? `#${(uuid as string).slice(0, 8)}` : undefined]
    .filter(Boolean)
    .join(" · ");
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
  return { role: "system", content: [{ type: "text", text: summary }], metadata: meta };
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
      isInterrupted?: boolean;
      skillContent?: string;
      // Agent container: uuids of child messages (subagent output stream)
      // that render inside this tool-call's body. hasAgentBody is derived
      // (= bodyChildUuids non-empty) — drives head-body-tail rendering.
      bodyChildUuids?: string[];
      hasAgentBody?: boolean;
      controlRequestId?: string;
      structuredResult?: unknown;
      rawSnapshots?: SessionStreamServerMessage[];
      progress?: {
        subagentType?: string;
        description: string;
        lastToolName?: string;
        usage: { total_tokens: number; tool_uses: number; duration_ms: number };
      };
    };

// Per-turn statistics lifted from the `result` message. All fields optional —
// Pass 1 only carries raw values extracted from the wire; render/word decisions
// (terminal_reason → status tone) happen in Pass 2 / the component.
export type TurnStats = {
  terminalReason?: string;
  subtype?: string;
  numTurns?: number;
  totalCostUsd?: number;
  durationMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
};

// Display tones terminal_reason collapses into (finer than subtype, coarser
// than the raw 12-value enum). Used by mapTurnStatusTone + the footer.
export type TurnStatusTone =
  | "completed"
  | "interrupted"
  | "maxTurns"
  | "error"
  | "rateLimited"
  | "hookStopped"
  | "toolDeferred";

export type ChatStreamItem =
  | {
      kind: "assistant";
      messageId: string;
      parts: NormalizedPart[];
      estimatedTokens?: number;
      apiErrors: SessionStreamServerMessage[];
      sourceUuids: string[];
      _rawSnapshots: SessionStreamServerMessage[];
      // When non-null, this assistant item belongs to an Agent subagent's body
      // (its messages carried parent_tool_use_id pointing at this Agent tool_use).
      // Used only for body-aware message.id merging; render association goes via
      // the Agent part's bodyChildUuids -> bodyIndices.
      bodyParentToolUseId?: string | null;
    }
  | {
      kind: "user-prompt";
      text: string;
      sourceUuids: string[];
      _rawSnapshots: SessionStreamServerMessage[];
    }
  | {
      // One compact_boundary + its trailing compaction messages (isCompactSummary
      // user message + in-window attachments + isMeta/isSynthetic noise), merged
      // by position during normalize. Renders as a single default-collapsed
      // CompactBlock. Carries raw values only — localization is the component's
      // job (never hardcode user-facing text here).
      kind: "compact-block";
      trigger: "manual" | "auto" | "micro";
      preTokens?: number;
      postTokens?: number;
      durationMs?: number;
      messagesSummarized?: number;
      summaryText?: string;
      attachments: Array<{ subtype: string; raw: Record<string, unknown> }>;
      sourceUuids: string[];
      _rawSnapshots: SessionStreamServerMessage[];
    }
  | {
      kind: "result-error";
      text: string;
      sourceUuids: string[];
      _rawSnapshots: SessionStreamServerMessage[];
    }
  | {
      // hook_started + hook_response pair, matched by hook_id during normalize
      // (started emits a running item; response mutates it to complete/error).
      // Renders as a single default-collapsed HookCard.
      kind: "hook-event";
      hookName: string;
      hookEvent?: string;
      output?: string;
      stderr?: string;
      exitCode?: number;
      outcome?: string;
      sourceUuids: string[];
      _rawSnapshots: SessionStreamServerMessage[];
    }
  | { kind: "batch-boundary" }
  | {
      kind: "attachment";
      bubble: ThreadMessageLike;
      sourceUuids: string[];
      _rawSnapshots: SessionStreamServerMessage[];
    }
  | {
      kind: "mode-change";
      mode: string;
      sourceUuids: string[];
      _rawSnapshots: SessionStreamServerMessage[];
    }
  | {
      // CLI slash-command / bash echo feedback rendered as a command card
      // (Dialog popup). Aggregates the command-input tags (<command-name>,
      // <command-message>, <command-args>, <bash-input>) and the command-output
      // tags (<local-command-stdout>/<local-command-stderr>, <bash-stdout>/
      // <bash-stderr>). Adjacent input+output messages for one command are
      // merged into a single item by the post-walk merge pass. The isMeta
      // <local-command-caveat> is dropped upstream (it addresses the model,
      // not the user).
      kind: "command-output";
      commandName?: string;
      args?: string;
      stdout?: string;
      stderr?: string;
      input?: string;
      sourceType: "local-command" | "bash";
      sourceUuids: string[];
      _rawSnapshots: SessionStreamServerMessage[];
    }
  | {
      // Compact-abort: a compaction was stopped (user interrupt or upstream
      // error) and the CLI emitted "AbortError: Compaction canceled." — as a
      // live assistant <synthetic> echo (source "live") or a replay
      // system/local_command stderr (source "replay"). Both fold into this
      // single banner item, suppressing the /compact echo, so live and replay
      // render the same banner. The reason (manual/system) is resolved at
      // render time from lastAbortReason (live) or marked unknown (replay).
      kind: "compact-abort";
      source: "live" | "replay";
      sourceUuids: string[];
      _rawSnapshots: SessionStreamServerMessage[];
    }
  | {
      // Turn-end marker: emitted for every `result` message (success /
      // interrupted / error). Renders no bubble — only records a turn
      // boundary so applyToolLifecycle can mark unresolved tools interrupted.
      // turnStats carries the per-turn cost/token/duration/terminal_reason
      // lifted from the result message (Pass 2 stamps it onto the turn's last
      // assistant bubble for the TurnStatsFooter).
      kind: "turn-end";
      subtype?: string;
      turnStats?: TurnStats;
      _rawSnapshots: SessionStreamServerMessage[];
    }
  | { kind: "fallback"; ui: ThreadMessageLike };

// Tool names that spawn a subagent and stream child messages via
// parent_tool_use_id. Only these tool-calls get head-body-tail rendering;
// skill bodies still fold into skillContent.
const AGENT_TOOL_NAMES = new Set(["Agent", "agent", "Task", "task"]);

/**
 * User messages that are CLI command artifacts (not real user input) and should
 * be dropped as noise by an open compact window so the window stays open for
 * the trailing attachments. Only invoked while a compact window is open, so it
 * never affects real user prompts.
 *
 * Two shapes:
 * - isMeta/isSynthetic: caveats, hook echoes (CLI already flags these).
 * - Manual `/compact` text command: the CLI emits a `<command-name>` echo and a
 *   `<local-command-stdout>` reply WITHOUT isMeta, so content-shape detection is
 *   required. Auto/programmatic compaction never emits these, which is why a
 *   manual compact used to break attachment merging while auto didn't.
 */
export function isCompactWindowUserNoise(msg: SessionStreamServerMessage): boolean {
  if (msg.type !== "user") return false;
  const meta = msg as Record<string, unknown>;
  if (meta.isMeta === true || meta.isSynthetic === true) return true;
  const content = (meta.message as { content?: unknown } | undefined)?.content;
  if (typeof content !== "string") return false;
  return (
    content.startsWith("<command-name>") ||
    content.startsWith("<local-command-stdout>") ||
    content.startsWith("<local-command-caveat>")
  );
}

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

  const lastAssistant = (): Extract<ChatStreamItem, { kind: "assistant" }> | null =>
    items.length > 0 && items[items.length - 1].kind === "assistant"
      ? (items[items.length - 1] as Extract<ChatStreamItem, { kind: "assistant" }>)
      : null;

  const pushAssistant = (
    messageId: string,
    sourceUuids: string[],
    rawSnapshots: SessionStreamServerMessage[],
  ): Extract<ChatStreamItem, { kind: "assistant" }> => {
    const item: Extract<ChatStreamItem, { kind: "assistant" }> = {
      kind: "assistant",
      messageId,
      parts: [],
      apiErrors: [],
      bodyParentToolUseId: null,
      sourceUuids,
      _rawSnapshots: rawSnapshots,
    };
    items.push(item);
    drainPendingApiErrors();
    return item;
  };

  // Push a raw message into the matching tool-call part's per-part snapshot
  // array so the debug panel shows exactly the messages that compose this
  // tool-card's rendering.
  const pushPartRaw = (toolUseId: string, msg: SessionStreamServerMessage) => {
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      if (item.kind !== "assistant") continue;
      for (const part of item.parts) {
        if (part.type === "tool-call" && part.toolCallId === toolUseId) {
          if (!part.rawSnapshots) part.rawSnapshots = [];
          if (!part.rawSnapshots.includes(msg)) part.rawSnapshots.push(msg);
          return;
        }
      }
    }
  };

  let pendingEstimatedTokens: number | null = null;
  // Most-recent tool_use_id seen via tool_result — fallback anchor for
  // synthetic / meta skill bodies that carry no sourceToolUseID.
  let lastToolUseId: string | null = null;
  // api_error messages whose parent isn't emitted yet; resolved lazily.
  const pendingApiErrors: SessionStreamServerMessage[] = [];
  // Slash-command names awaiting their synthetic response, in send order.
  // The CLI filters the user command-input message from stream-json stdout
  // (only assistant {model:"<synthetic>"} + result come back), so the command
  // name can't be recovered from the wire — it's recovered positionally:
  // each "/" user prompt enqueues its ITEM INDEX, each synthetic assistant
  // dequeues (FIFO) and rewrites that user-prompt item in place into a
  // command-output card (form E: live slash commands merge into one card). If
  // no synthetic arrives, the user-prompt stays rendered (fallback — echo kept).
  const pendingSlashItemIdx: number[] = [];
  // hook_started → hook_response pairing by hook_id. started emits a running
  // hook-event item immediately; response mutates the same item (object ref).
  const pendingHooks = new Map<string, Extract<ChatStreamItem, { kind: "hook-event" }>>();

  // Compact window: opened at a compact/microcompact_boundary, absorbs the
  // boundary's trailing compaction messages (isCompactSummary user message +
  // in-window attachments + isMeta/isSynthetic noise) into one compact-block.
  // Closed (flushed) at the next real content message — see the absorption
  // block at the top of the walk loop. Mirrors the pendingEstimatedTokens /
  // pendingApiErrors forward-scan accumulator pattern.
  let compactWindow: {
    trigger: "manual" | "auto" | "micro";
    preTokens?: number;
    postTokens?: number;
    durationMs?: number;
    messagesSummarized?: number;
    summaryText?: string;
    attachments: Array<{ subtype: string; raw: Record<string, unknown> }>;
    sourceUuids: string[];
    _rawSnapshots: SessionStreamServerMessage[];
  } | null = null;
  const flushCompactWindow = () => {
    if (!compactWindow) return;
    const w = compactWindow;
    items.push({
      kind: "compact-block",
      trigger: w.trigger,
      preTokens: w.preTokens,
      postTokens: w.postTokens,
      durationMs: w.durationMs,
      messagesSummarized: w.messagesSummarized,
      summaryText: w.summaryText,
      attachments: w.attachments,
      sourceUuids: w.sourceUuids,
      _rawSnapshots: w._rawSnapshots,
    });
    compactWindow = null;
  };

  // Pre-scan: identify Agent tool_use ids. Only Agent tool-calls get the
  // head-body-tail container; their child messages (parent_tool_use_id) are
  // kept as standalone items instead of folded into skillContent.
  const agentToolUseIds = new Set<string>();
  for (const msg of rawMessages) {
    if (msg?.type !== "assistant") continue;
    const content =
      (msg as unknown as { message?: { content?: Array<Record<string, unknown>> } }).message
        ?.content ?? [];
    for (const block of content) {
      if (
        block.type === "tool_use" &&
        typeof block.name === "string" &&
        AGENT_TOOL_NAMES.has(block.name)
      ) {
        const id = block.id as string | undefined;
        if (id) agentToolUseIds.add(id);
      }
    }
  }

  // Record a child message uuid onto its parent Agent tool-call part so the
  // renderer can collect bodyIndices.
  const pushBodyChild = (toolUseId: string, uuid: string) => {
    if (!toolUseId || !uuid) return;
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      if (item.kind !== "assistant") continue;
      for (const part of item.parts) {
        if (part.type === "tool-call" && part.toolCallId === toolUseId) {
          if (!part.bodyChildUuids) part.bodyChildUuids = [];
          if (!part.bodyChildUuids.includes(uuid)) part.bodyChildUuids.push(uuid);
          return;
        }
      }
    }
  };

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

  // Fold a skill body into a tool-call part (already emitted).
  const attachSkillBody = (toolUseId: string, body: string): boolean => {
    if (!toolUseId || !body) return false;

    // Scan backwards through emitted assistant items (ids are unique).
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
        item._rawSnapshots.push(syntheticMsg);
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

  for (const msg of rawMessages) {
    if (!msg) continue;

    // ═══ Compact-window absorption ═══
    // While a compact window is open (after a compact/microcompact_boundary),
    // absorb the boundary's trailing messages into the single compact-block:
    // the isCompactSummary user message, in-window attachments, and
    // isMeta/isSynthetic user noise. The window closes at the next real
    // content message, which then falls through to its normal branch below.
    // isCompactSummary is checked before isMeta because a summary may also
    // carry isMeta — we never want to drop the summary.
    if (compactWindow) {
      const cmeta = msg as Record<string, unknown>;

      // isCompactSummary user message → summary text + messagesSummarized.
      if (msg.type === "user" && cmeta.isCompactSummary === true) {
        const sm = cmeta.summarizeMetadata as { messagesSummarized?: number } | undefined;
        if (sm?.messagesSummarized != null)
          compactWindow.messagesSummarized = sm.messagesSummarized;
        const content = (cmeta.message as { content?: unknown } | undefined)?.content;
        if (typeof content === "string" && content.trim()) compactWindow.summaryText = content;
        const uuid = getMsgUuid(msg);
        if (uuid && !compactWindow.sourceUuids.includes(uuid)) compactWindow.sourceUuids.push(uuid);
        compactWindow._rawSnapshots.push(msg);
        continue;
      }

      // In-window attachment → absorb (subtype + raw). Scalar state
      // (permissionMode/tasks/mcpServers) is applied by the independent
      // scalar-state handler, not here, so absorbing is render-only.
      if (msg.type === "attachment") {
        const att = cmeta.attachment as { type?: string } | undefined;
        compactWindow.attachments.push({ subtype: att?.type ?? "unknown", raw: cmeta });
        const uuid = getMsgUuid(msg);
        if (uuid && !compactWindow.sourceUuids.includes(uuid)) compactWindow.sourceUuids.push(uuid);
        compactWindow._rawSnapshots.push(msg);
        continue;
      }

      // In-window user noise (command-caveat, isMeta/isSynthetic echoes, manual
      // `/compact` command echo + local-command-stdout) → drop, keep the window
      // open. Handled here rather than via attachSkillBody so a stale
      // lastToolUseId can't inject this noise into the preceding tool card.
      if (isCompactWindowUserNoise(msg)) {
        continue;
      }

      // Anything else (real assistant turn, real user prompt, another
      // boundary, …) ends the window: flush, then fall through.
      flushCompactWindow();
    }

    // Body membership: a message whose parent_tool_use_id points at an Agent
    // tool-call belongs to that Agent's body. Body messages flow through the
    // SAME assistant/user branches as top-level (so message.id merging and
    // tool_result pairing are reused, not reimplemented) — bodyParentToolUseId
    // only tags the resulting item / drives prompt-echo suppression.
    const msgParentToolUseId = (msg as Record<string, unknown>).parent_tool_use_id;
    const bodyParentToolUseId =
      typeof msgParentToolUseId === "string" &&
      msgParentToolUseId &&
      agentToolUseIds.has(msgParentToolUseId)
        ? msgParentToolUseId
        : null;

    // ═══ Assistant ═══
    if (msg.type === "assistant") {
      // ApiError: attach to parent, never standalone.
      if (isExternalApiErrorMessage(msg)) {
        receiveApiError(msg);
        continue;
      }

      // Synthetic assistant (model === "<synthetic>"): the CLI's universal
      // echo container for non-LLM output — slash-command responses (/cost,
      // /help, /status, …), "No response requested.", etc. Render its body as
      // a command-output card; the command name is recovered positionally
      // from the most recent "/" user prompt (pendingSlashItemIdx FIFO). API-error
      // synthetics (isApiErrorMessage) are caught above at the ApiError branch.
      if (isSyntheticAssistantMessage(msg)) {
        const body = extractSyntheticBody(msg) || undefined;
        const echoIdx = pendingSlashItemIdx.shift();
        const echoItem = echoIdx != null ? items[echoIdx] : undefined;
        // Compact-abort (live): synthetic "AbortError: Compaction canceled."
        // becomes a compact-abort banner. Rewrite the /compact echo in place
        // (Form E style, raws merged) so the abort surfaces as one persistent
        // banner instead of a command card.
        if (body && isCompactAbortRaw(msg)) {
          if (echoItem?.kind === "user-prompt") {
            items[echoIdx!] = {
              kind: "compact-abort",
              source: "live",
              sourceUuids: [
                ...echoItem.sourceUuids,
                ...(getMsgUuid(msg) ? [getMsgUuid(msg)!] : []),
              ],
              _rawSnapshots: [...echoItem._rawSnapshots, msg],
            };
          } else {
            items.push({
              kind: "compact-abort",
              source: "live",
              sourceUuids: getMsgUuid(msg) ? [getMsgUuid(msg)!] : [],
              _rawSnapshots: [msg],
            });
          }
          continue;
        }
        // Form E: rewrite the preceding slash-echo user-prompt item in place
        // into a command-output card (command name + args from the echo text,
        // stdout from the synthetic body, raws merged) — so live slash commands
        // render as a single card instead of a user bubble + a card.
        if (echoItem?.kind === "user-prompt") {
          const tokens = echoItem.text.trim().split(/\s+/);
          items[echoIdx!] = {
            kind: "command-output",
            commandName: tokens[0]!.replace(/^\//, ""),
            args: tokens.length > 1 ? tokens.slice(1).join(" ") : undefined,
            stdout: body,
            sourceType: "local-command",
            sourceUuids: [...echoItem.sourceUuids, ...(getMsgUuid(msg) ? [getMsgUuid(msg)!] : [])],
            _rawSnapshots: [...echoItem._rawSnapshots, msg],
          };
        } else {
          // No matching slash echo (replay C-shape, or echo already consumed) —
          // standalone command-output; commandName left undefined for Pass D.
          items.push({
            kind: "command-output",
            stdout: body,
            sourceType: "local-command",
            sourceUuids: getMsgUuid(msg) ? [getMsgUuid(msg)!] : [],
            _rawSnapshots: [msg],
          });
        }
        continue;
      }

      // Hidden / internal assistant (isMeta / isSynthetic): fold into parent
      // or tool-call; no standalone item.
      const assistantMeta = msg as Record<string, unknown>;
      if (assistantMeta.isMeta === true || assistantMeta.isSynthetic === true) {
        const sourceToolUseId = assistantMeta.sourceToolUseID as string | undefined;
        const attachedViaParent = attachSyntheticBody(msg);
        if (!attachedViaParent && sourceToolUseId) {
          attachSkillBody(sourceToolUseId, extractSyntheticBody(msg));
        }
        if (sourceToolUseId) pushPartRaw(sourceToolUseId, msg);
        continue;
      }

      // Merge into the last assistant item if it shares the same message.id
      // AND the same body context; otherwise push a new one. Body-aware merge
      // keeps a subagent's same-turn tool_uses together even when interleaved
      // with top-level items.
      const msgId = (msg.message as { id?: string })?.id;
      const prev = lastAssistant();
      const target =
        prev &&
        msgId &&
        prev.messageId === msgId &&
        prev.bodyParentToolUseId === bodyParentToolUseId
          ? prev
          : pushAssistant(msgId ?? "__no_id__", getMsgUuid(msg) ? [getMsgUuid(msg)!] : [], [msg]);
      if (bodyParentToolUseId) {
        target.bodyParentToolUseId = bodyParentToolUseId;
        const bodyUuid = getMsgUuid(msg);
        if (bodyUuid) pushBodyChild(bodyParentToolUseId, bodyUuid);
      }

      // Stamp pending estimatedTokens onto the first assistant item of a turn.
      if (pendingEstimatedTokens != null) {
        target.estimatedTokens = pendingEstimatedTokens;
        pendingEstimatedTokens = null;
      }

      const uuid = getMsgUuid(msg);
      if (uuid && !target.sourceUuids.includes(uuid)) target.sourceUuids.push(uuid);
      if (!target._rawSnapshots.includes(msg)) target._rawSnapshots.push(msg);
      const content =
        (msg as unknown as { message: { content: Array<Record<string, unknown>> } }).message
          ?.content ?? [];
      for (const block of content) {
        const part = processContentBlock(block as RawContentBlock);
        if (part) target.parts.push(part as NormalizedPart);
      }
      // Parent assistant message belongs to every tool-call part it produced.
      for (const part of target.parts) {
        if (part.type === "tool-call") {
          if (!part.rawSnapshots) part.rawSnapshots = [];
          if (!part.rawSnapshots.includes(msg)) part.rawSnapshots.push(msg);
        }
      }
      continue;
    }

    // ═══ User ═══
    if (msg.type === "user") {
      const toolResults = extractToolResults(msg);
      // ToolResult: match to tool-call part, no item.
      if (toolResults.length > 0) {
        lastToolUseId = toolResults[toolResults.length - 1].toolUseId;
        for (const tr of toolResults) {
          // Search emitted assistant items.
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
              pushPartRaw(tr.toolUseId, msg);
              break;
            }
          }
        }
        // Do NOT continue — the user message may also carry text blocks.
      }

      // toolUseResult at top level: attach structuredResult to matching tool-call.
      const toolUseResult =
        (msg as Record<string, unknown>).toolUseResult ??
        (msg as Record<string, unknown>).tool_use_result;
      if (toolUseResult && lastToolUseId) {
        for (const item of items) {
          if (item.kind !== "assistant") continue;
          const partIdx = item.parts.findIndex(
            (p) => p.type === "tool-call" && p.toolCallId === lastToolUseId,
          );
          if (partIdx >= 0) {
            item.parts = item.parts.map((p, j) =>
              j === partIdx && p.type === "tool-call"
                ? ({ ...p, structuredResult: toolUseResult } as NormalizedPart)
                : p,
            );
            pushPartRaw(lastToolUseId, msg);
            break;
          }
        }
      }

      // parent_tool_use_id: this user message is additional output from a
      // tool execution. For an Agent body message this is the subagent's
      // prompt echo (user text) — suppress it from rendering (the Agent head
      // already shows the description) but keep the raw on the Agent part for
      // the debug tooltip. For other tools, fold the text into skillContent.
      // Body tool_results have no text blocks and only reach pushPartRaw here.
      const parentToolUseId = (msg as Record<string, unknown>).parent_tool_use_id;
      if (typeof parentToolUseId === "string" && parentToolUseId) {
        if (!bodyParentToolUseId) {
          const texts = _extractUserTextBlocks(msg.message.content);
          if (texts.length > 0) {
            attachSkillBody(parentToolUseId, texts.join("\n"));
          }
        }
        pushPartRaw(parentToolUseId, msg);
        continue;
      }

      // SkillBody: attach text to tool-call, no item.
      const isSkillBody = msg.isSynthetic === true || msg.isMeta === true;
      if (isSkillBody) {
        const sourceToolUseId = msg.sourceToolUseID;
        const toolUseId = sourceToolUseId ?? lastToolUseId;
        const body = extractSyntheticBody(msg);
        attachSkillBody(toolUseId ?? "", body);
        if (toolUseId) pushPartRaw(toolUseId, msg);
        continue;
      }

      const texts = _extractUserTextBlocks(msg.message.content);

      // CLI slash-command / bash echo embedded in text blocks → command-output.
      if (texts.some((t) => hasCommandArtifactTags(t))) {
        items.push(buildCommandOutputItem(texts.join("\n"), msg));
        continue;
      }

      // Skill content via prefix detection (isMeta/isSynthetic may be absent).
      if (_isHiddenSkillContent(texts)) {
        const sourceToolUseId = msg.sourceToolUseID;
        const toolUseId = sourceToolUseId ?? lastToolUseId;
        attachSkillBody(toolUseId ?? "", texts.join("\n"));
        if (toolUseId) pushPartRaw(toolUseId, msg);
        continue;
      }

      // UserPrompt: text content → user-prompt item.
      if (texts.length > 0) {
        const promptText = texts.join("\n");
        items.push({
          kind: "user-prompt",
          text: promptText,
          sourceUuids: getMsgUuid(msg) ? [getMsgUuid(msg)!] : [],
          _rawSnapshots: [msg],
        });
        const trimmed = promptText.trim();
        if (trimmed.startsWith("/")) pendingSlashItemIdx.push(items.length - 1);
        continue;
      }

      // String-content user message.
      const rawContent = msg.message.content;
      if (typeof rawContent === "string" && rawContent.trim()) {
        // CLI slash-command / bash echo: parse tags into a command-output item
        // rendered as a card. <local-command-caveat> is isMeta and was already
        // dropped upstream by the skill-body branch.
        if (hasCommandArtifactTags(rawContent)) {
          items.push(buildCommandOutputItem(rawContent, msg));
          continue;
        }

        // Other bare CLI command tags without parseable content → drop.
        if (
          rawContent.startsWith("<local-command") ||
          rawContent.startsWith("<command-name>") ||
          rawContent.startsWith("<command-message>")
        )
          continue;

        items.push({
          kind: "user-prompt",
          text: rawContent,
          sourceUuids: getMsgUuid(msg) ? [getMsgUuid(msg)!] : [],
          _rawSnapshots: [msg],
        });
        if (rawContent.trim().startsWith("/")) {
          pendingSlashItemIdx.push(items.length - 1);
        }
        continue;
      }

      // Hidden/internal user message with no association key → dropped.
      continue;
    }

    // ═══ System ═══
    if (msg.type === "system") {
      const subtype = (msg as Record<string, unknown>).subtype as string | undefined;

      // skill_catalog_changed is a pure server notification (handled by
      // applyMessageScalarState → invalidateQueries). Never render a bubble.
      if (subtype === "skill_catalog_changed") continue;

      // SessionInit: no bubble. Scalar state (model / permissionMode / skills /
      // mcp) is folded by applyMessageScalarState, and model / permissionMode
      // also show in the session header — the summary card carried no unique
      // value.
      if (subtype === "init") continue;

      // seed_init: replay-time scalar seed (model / permissionMode). Same as init —
      // folded by applyMessageScalarState and shown in the session header. No bubble.
      if (subtype === "seed_init") continue;

      // turn_duration: turn-end stats (durationMs + token budget). Pure display
      // message with no scalar side effect — drop it.
      if (subtype === "turn_duration") continue;

      // ThinkingTokens: stamp into the current assistant accumulator.
      if (subtype === "thinking_tokens") {
        pendingEstimatedTokens =
          (msg as unknown as { estimated_tokens?: number }).estimated_tokens ?? null;
        continue;
      }

      // ApiError: attach to parent.
      if (subtype === "api_error") {
        receiveApiError(msg);
        continue;
      }

      // CompactBoundary: open a compact window that absorbs the trailing
      // compaction messages (summary + attachments + noise) into one block.
      if (isCompactBoundarySubtype(subtype)) {
        flushCompactWindow();
        const isMicro = subtype === "microcompact_boundary";
        const cmeta = (msg as Record<string, unknown>).compactMetadata as
          | {
              trigger?: string;
              preTokens?: number;
              postTokens?: number;
              durationMs?: number;
              messagesSummarized?: number;
            }
          | undefined;
        const trigger: "manual" | "auto" | "micro" = isMicro
          ? "micro"
          : cmeta?.trigger === "manual"
            ? "manual"
            : "auto";
        compactWindow = {
          trigger,
          preTokens: cmeta?.preTokens,
          postTokens: cmeta?.postTokens,
          durationMs: cmeta?.durationMs,
          messagesSummarized: cmeta?.messagesSummarized,
          attachments: [],
          sourceUuids: getMsgUuid(msg) ? [getMsgUuid(msg)!] : [],
          _rawSnapshots: [msg],
        };
        continue;
      }

      // TaskProgress: inject into matching tool-call part, no item.
      if (subtype === "task_progress") {
        const tp = msg as unknown as {
          task_id?: string;
          tool_use_id?: string;
          description?: string;
          subagent_type?: string;
          last_tool_name?: string;
          usage?: { total_tokens?: number; tool_uses?: number; duration_ms?: number };
        };
        const toolUseId = tp.tool_use_id;
        if (!toolUseId) continue;

        const progress = {
          subagentType: tp.subagent_type,
          description: tp.description ?? "",
          lastToolName: tp.last_tool_name,
          usage: {
            total_tokens: tp.usage?.total_tokens ?? 0,
            tool_uses: tp.usage?.tool_uses ?? 0,
            duration_ms: tp.usage?.duration_ms ?? 0,
          },
        };

        // Search emitted assistant items.
        for (const item of items) {
          if (item.kind !== "assistant") continue;
          const partIdx = item.parts.findIndex(
            (p) => p.type === "tool-call" && p.toolCallId === toolUseId,
          );
          if (partIdx >= 0) {
            item.parts = item.parts.map((p, j) =>
              j === partIdx && p.type === "tool-call" ? { ...p, progress } : p,
            );
            pushPartRaw(toolUseId, msg);
            break;
          }
        }
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
        items.push({ kind: "batch-boundary" });
        continue;
      }

      // System.status: 权限模式切换(permissionMode) → 专属提示项；
      // compact 生命周期 → 跳过（CompactIndicator 拥有）。permissionMode 的
      // 标量更新由 applyMessageScalarState 负责。
      if (subtype === "status") {
        const s = msg as {
          permissionMode?: string;
          status?: string | null;
          compact_result?: unknown;
        };
        if (s.status === "compacting" || s.compact_result !== undefined) continue;
        if (s.permissionMode) {
          items.push({
            kind: "mode-change",
            mode: s.permissionMode,
            sourceUuids: getMsgUuid(msg) ? [getMsgUuid(msg)!] : [],
            _rawSnapshots: [msg],
          });
          continue;
        }
        // 未知 status 变体 → 继续落到下方既有 fallback（保持现状）。
      }

      // CLI slash-command / bash output messages emitted as system subtype
      // local_command on JSONL replay. Convert them to command-output items so
      // the merge pass can combine them with the preceding command-input echo.
      if (subtype === "local_command") {
        const rawContent = (msg as Record<string, unknown>).content;
        if (typeof rawContent === "string" && rawContent.trim()) {
          // Compact-abort (replay): local_command stderr "AbortError:
          // Compaction canceled." becomes a compact-abort banner. Rewrite the
          // preceding /compact tags echo (command-output, no output) in place
          // so the abort surfaces as one persistent banner instead of a card.
          if (isCompactAbortRaw(msg)) {
            const prev = items[items.length - 1];
            const abortUuids = getMsgUuid(msg) ? [getMsgUuid(msg)!] : [];
            if (
              prev?.kind === "command-output" &&
              prev.commandName === "compact" &&
              prev.stdout == null &&
              prev.stderr == null
            ) {
              items[items.length - 1] = {
                kind: "compact-abort",
                source: "replay",
                sourceUuids: [...prev.sourceUuids, ...abortUuids],
                _rawSnapshots: [...prev._rawSnapshots, msg],
              };
            } else {
              items.push({
                kind: "compact-abort",
                source: "replay",
                sourceUuids: abortUuids,
                _rawSnapshots: [msg],
              });
            }
            continue;
          }
          // Output fragment: <local-command-stdout>/<bash-stdout> tags.
          if (hasCommandArtifactTags(rawContent)) {
            items.push(buildCommandOutputItem(rawContent, msg));
            continue;
          }
          // Form D: plain-text slash-command input echo ("/status", no tags) —
          // convert to an input fragment so Pass B merges it with the next
          // stdout output fragment. Non-slash plain text still falls back below.
          if (rawContent.trim().startsWith("/")) {
            items.push(buildCommandOutputItemFromPlainText(rawContent, msg));
            continue;
          }
        }
      }

      // hook_started / hook_response: pair by hook_id into one hook-event
      // item. started emits a running item (no output/outcome yet); response
      // mutates the same item to complete/error.
      if (subtype === "hook_started" || subtype === "hook_response") {
        const hm = msg as unknown as {
          hook_id?: string;
          hook_name?: string;
          hook_event?: string;
          output?: string;
          stderr?: string;
          exit_code?: number;
          outcome?: string;
        };
        const hookId = hm.hook_id;
        const uuid = getMsgUuid(msg);
        if (subtype === "hook_started") {
          const item: Extract<ChatStreamItem, { kind: "hook-event" }> = {
            kind: "hook-event",
            hookName: hm.hook_name ?? "hook",
            ...(hm.hook_event ? { hookEvent: hm.hook_event } : {}),
            sourceUuids: uuid ? [uuid] : [],
            _rawSnapshots: [msg],
          };
          items.push(item);
          if (hookId) pendingHooks.set(hookId, item);
        } else {
          const existing = hookId ? pendingHooks.get(hookId) : undefined;
          if (existing) {
            existing.output = hm.output;
            if (hm.stderr) existing.stderr = hm.stderr;
            if (hm.exit_code != null) existing.exitCode = hm.exit_code;
            if (hm.outcome) existing.outcome = hm.outcome;
            if (uuid) existing.sourceUuids.push(uuid);
            existing._rawSnapshots.push(msg);
            if (hookId) pendingHooks.delete(hookId);
          } else {
            // response without a preceding started — emit a standalone completed item
            const item: Extract<ChatStreamItem, { kind: "hook-event" }> = {
              kind: "hook-event",
              hookName: hm.hook_name ?? "hook",
              ...(hm.hook_event ? { hookEvent: hm.hook_event } : {}),
              ...(hm.output != null ? { output: hm.output } : {}),
              ...(hm.stderr ? { stderr: hm.stderr } : {}),
              ...(hm.exit_code != null ? { exitCode: hm.exit_code } : {}),
              ...(hm.outcome ? { outcome: hm.outcome } : {}),
              sourceUuids: uuid ? [uuid] : [],
              _rawSnapshots: [msg],
            };
            items.push(item);
          }
        }
        continue;
      }

      // Other system messages: fallback.

      const ui = messageToThreadLike(msg);
      if (ui) items.push({ kind: "fallback", ui });
      continue;
    }

    // ═══ Result (turn end) ═══
    if (msg.type === "result") {
      const resultMsg = msg as {
        is_error?: boolean;
        result?: string;
        subtype?: string;
        terminal_reason?: string;
        num_turns?: number;
        total_cost_usd?: number;
        duration_ms?: number;
        usage?: {
          input_tokens?: number;
          output_tokens?: number;
          cache_read_input_tokens?: number;
        };
      };
      // Lift per-turn stats off the result message. Pass 1 carries raw values
      // only — the terminal_reason → status-tone mapping is a render decision,
      // made in mapTurnStatusTone / the footer component.
      const usage = resultMsg.usage;
      const turnStats: TurnStats = {
        terminalReason: resultMsg.terminal_reason,
        subtype: resultMsg.subtype,
        numTurns: typeof resultMsg.num_turns === "number" ? resultMsg.num_turns : undefined,
        totalCostUsd:
          typeof resultMsg.total_cost_usd === "number" ? resultMsg.total_cost_usd : undefined,
        durationMs: typeof resultMsg.duration_ms === "number" ? resultMsg.duration_ms : undefined,
        inputTokens: usage?.input_tokens,
        outputTokens: usage?.output_tokens,
        cacheReadTokens: usage?.cache_read_input_tokens,
      };
      const hasStats = Object.values(turnStats).some((v) => v !== undefined);
      // turn-end marker drives tool "interrupted" marking in Pass 2 — emitted
      // for every result (success / interrupted / error), renders no bubble.
      items.push({
        kind: "turn-end",
        subtype: resultMsg.subtype,
        turnStats: hasStats ? turnStats : undefined,
        _rawSnapshots: [msg],
      });
      if (resultMsg.is_error && typeof resultMsg.result === "string") {
        items.push({
          kind: "result-error",
          text: resultMsg.result,
          sourceUuids: getMsgUuid(msg) ? [getMsgUuid(msg)!] : [],
          _rawSnapshots: [msg],
        });
      }
      continue;
    }

    // ═══ Attachment ═══
    if (msg.type === "attachment") {
      const result = handleAttachment(msg as Claude2Attachment);
      if (result.bubble) {
        items.push({
          kind: "attachment",
          bubble: enrichBubbleMetadata(result.bubble),
          sourceUuids: getMsgUuid(msg) ? [getMsgUuid(msg)!] : [],
          _rawSnapshots: [msg],
        });
      }
      continue;
    }

    // last-prompt: scalar state only (already handled in Pass 1). No item.
    if (msg.type === "last-prompt") continue;

    // permission-mode: global state, not a chat event. mode is set at resume
    // (--permission-mode / seed_init), not replayed as an update — so this only
    // updates the permissionMode scalar (Pass 1) and renders no item. The live
    // mode-change notice comes from system.status{permissionMode} instead.
    if (msg.type === "permission-mode") continue;

    // control_request: attach request_id as controlRequestId to the matching
    // tool-call part. Same pattern as tool_result and task_progress above.
    if (msg.type === "control_request") {
      const cr = msg as { request_id: string; request?: { tool_use_id?: string } };
      const toolUseId = cr.request?.tool_use_id;
      if (toolUseId) {
        for (let i = items.length - 1; i >= 0; i--) {
          const item = items[i];
          if (item.kind !== "assistant") continue;
          const partIdx = item.parts.findIndex(
            (p) => p.type === "tool-call" && p.toolCallId === toolUseId,
          );
          if (partIdx >= 0) {
            item.parts = item.parts.map((p, j) =>
              j === partIdx && p.type === "tool-call"
                ? { ...p, controlRequestId: cr.request_id }
                : p,
            );
            pushPartRaw(toolUseId, msg);
            break;
          }
        }
      }
      continue;
    }

    // control_response is the CLI's receipt for a client-initiated control
    // action (set_model / set_permission_mode / interrupt). It carries no chat
    // content, so the known scalar-only confirmations render no bubble — their
    // notice comes from the CLI's own echo (system.status{permissionMode} →
    // mode-change; <local-command-stdout>Set model to → dropped; interrupt →
    // interruptAtIndex turn-close). Scalar effects/rollback are handled by
    // applyMessageScalarState. Payload-based identification (not a blind
    // type skip) so an UNKNOWN future control_response with another payload
    // still falls through to the fallback debug bubble.
    //   set_permission_mode → inner {mode}; set_model → empty inner or {model};
    //   interrupt → empty inner.
    if (msg.type === "control_response") {
      const inner = (msg as { response?: { response?: Record<string, unknown> } }).response
        ?.response;
      const isEmpty = !inner || Object.keys(inner).length === 0;
      if (isEmpty || inner.mode !== undefined || inner.model !== undefined) continue;
    }

    // ═══ Other (fallback) ═══
    const fallback = messageToThreadLike(msg);
    if (fallback) items.push({ kind: "fallback", ui: fallback });
  }

  // Flush a compact window still open at end of stream (boundary as the final
  // message, or window absorbing with no subsequent real content).
  flushCompactWindow();

  // Collapse command-output fragments into a single card.
  //
  // Pass A — synthetic echo + tag input: JSONL replay double-records some slash
  // commands (/reload-skills, …) as BOTH a synthetic assistant echo AND separate
  // user-tag + system/local_command records. The synthetic echo (has stdout,
  // commandName undefined — pendingSlashItemIdx is empty on replay)
  // would otherwise render as an empty duplicate card. Fold its stdout into the
  // following tag-based item (which carries the accurate, slash-stripped name).
  for (let i = 0; i + 1 < items.length; i++) {
    const a = items[i];
    const b = items[i + 1];
    if (
      a?.kind === "command-output" &&
      b?.kind === "command-output" &&
      a.sourceType === b.sourceType &&
      isSyntheticCommandOutput(a) &&
      !isSyntheticCommandOutput(b) &&
      b.commandName != null &&
      b.stdout == null
    ) {
      items.splice(i, 2, {
        ...b,
        args: a.args ?? b.args,
        stdout: a.stdout ?? b.stdout,
        stderr: a.stderr ?? b.stderr,
        input: a.input ?? b.input,
        sourceUuids: [...a.sourceUuids, ...b.sourceUuids],
        _rawSnapshots: [...a._rawSnapshots, ...b._rawSnapshots],
      });
      i--; // re-check in case another fragment follows
    }
  }

  // Pass B — input + output: a slash command's input echo
  // (<command-name>/<command-args>) followed immediately by its output
  // (<local-command-stdout>, no command-name) collapses into a single card.
  // a.stdout may already be set from Pass A; the output fragment's stdout wins.
  for (let i = 0; i + 1 < items.length; i++) {
    const a = items[i];
    const b = items[i + 1];
    if (
      a?.kind === "command-output" &&
      b?.kind === "command-output" &&
      a.sourceType === b.sourceType &&
      a.commandName != null &&
      b.commandName == null &&
      b.stdout != null
    ) {
      items.splice(i, 2, {
        ...a,
        args: a.args ?? b.args,
        stdout: b.stdout,
        stderr: a.stderr ?? b.stderr,
        input: a.input ?? b.input,
        sourceUuids: [...a.sourceUuids, ...b.sourceUuids],
        _rawSnapshots: [...a._rawSnapshots, ...b._rawSnapshots],
      });
      i--; // re-check in case a third fragment follows
    }
  }

  // Derive hasAgentBody: any tool-call that collected subagent child
  // messages (bodyChildUuids) becomes an Agent container. Pure projection
  // of the association work done during the walk — no extra state.
  for (const item of items) {
    if (item.kind !== "assistant") continue;
    for (const part of item.parts) {
      if (part.type === "tool-call" && part.bodyChildUuids && part.bodyChildUuids.length > 0) {
        part.hasAgentBody = true;
      }
    }
  }

  // Pass D — infer commandName for single stdout-only cards (form C: no input
  // echo, so commandName is null). Whitelist-based, first-line, ^-anchored;
  // unknown stays undefined. Runs after Pass A/B so real command names from
  // tags/echo (forms A/B/D/E) are already filled and skipped here.
  for (const item of items) {
    if (item.kind !== "command-output" || item.commandName != null) continue;
    if (item.stdout != null) {
      const inferred = inferCommandNameFromStdout(item.stdout);
      if (inferred) item.commandName = inferred;
    }
  }

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
  // compact-block windowing: render only the LAST compact block (the block the
  // most recent compact_boundary opens) plus the live that follows it. Earlier
  // compacted-away content is dropped here, at the render/projection layer —
  // rawMessages (state) stay intact. Mirrors the server's tail-load so a long
  // session renders one bounded block regardless of how many compacts ran.
  // See docs/design/message-replay.md 「特殊时期 history 缩容」.
  let lastCompactIdx = -1;
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].kind === "compact-block") {
      lastCompactIdx = i;
      break;
    }
  }
  const renderItems = lastCompactIdx >= 0 ? items.slice(lastCompactIdx) : items;

  const messages: ThreadMessageLike[] = [];
  // Render-list indices at each turn-end (result) item. A tool at index
  // i < lastBoundary belongs to a turn that already ended → interrupted if
  // still unresolved. Captured by the "turn-end" case below.
  const turnEndBoundaries: number[] = [];

  for (let itemIdx = 0; itemIdx < renderItems.length; itemIdx++) {
    const item = renderItems[itemIdx];
    switch (item.kind) {
      case "assistant": {
        const rawMsgs = item._rawSnapshots;
        // Messages that carry only text/reasoning (no tool_use) — used for
        // the assistant bubble's debug info so it excludes tool-destined content.
        const hasToolUse = (m: SessionStreamServerMessage) => {
          const content = (m as Record<string, unknown>).message as
            | { content?: Array<{ type?: string }> }
            | undefined;
          return Array.isArray(content?.content)
            ? content.content.some((b) => b.type === "tool_use")
            : false;
        };
        const textOnlyMsgs = rawMsgs.filter((m) => !hasToolUse(m));
        const customBase: Record<string, unknown> = {
          sourceUuids: [...item.sourceUuids],
          _rawMessages: textOnlyMsgs,
        };
        if (item.estimatedTokens != null) customBase.estimatedTokens = item.estimatedTokens;

        // Split parts into text/reasoning groups, emitting each tool-call as a
        // standalone system message. Consecutive non-tool-call parts share one
        // assistant bubble; each tool-call gets its own message.
        let textParts: NormalizedPart[] = [];
        const flushText = () => {
          if (textParts.length === 0) return;
          const bubble: ThreadMessageLike = {
            role: "assistant",
            content: [...textParts] as unknown as ThreadMessageLike["content"],
            metadata: { custom: { ...customBase } },
          };
          messages.push(enrichBubbleMetadata(bubble));
          textParts = [];
        };

        const hasTextParts = item.parts.some((p) => p.type !== "tool-call");
        const toolMessageId = item.messageId;

        for (const part of item.parts) {
          if (part.type === "tool-call") {
            flushText();
            if (part.hasAgentBody) {
              // Agent container head. The renderer routes this to
              // AgentContainer (head-body-tail). Body child messages are
              // emitted as normal items in this loop; the post-process at
              // the end resolves bodyChildUuids → bodyIndices and stamps
              // absorbed on the children so the top-level stream skips them.
              const argsRecord = part.args as Record<string, unknown>;
              const tail = extractAgentTail(part.structuredResult, part.result);
              // Split the part's raw snapshots for independent debug tooltips:
              // head = the Agent tool_use (the assistant message that invoked
              // the subagent); tail = the user tool_result carrying the
              // tool_use_result envelope. The subagent prompt echo and other
              // user-text messages belong to neither — body/tail already cover
              // their own raws, so the head stays lean. Tail is empty while
              // running.
              const partRaws = (part.rawSnapshots ??
                item._rawSnapshots) as SessionStreamServerMessage[];
              const isTailResultRaw = (m: SessionStreamServerMessage): boolean => {
                const r = m as Record<string, unknown>;
                if (r.type !== "user") return false;
                if (r.toolUseResult != null || r.tool_use_result != null) return true;
                const content = (m as { message?: { content?: unknown[] } }).message?.content;
                return (
                  Array.isArray(content) &&
                  content.some(
                    (b) =>
                      (b as Record<string, unknown>)?.type === "tool_result" &&
                      (b as Record<string, unknown>)?.tool_use_id === part.toolCallId,
                  )
                );
              };
              const tailRawMessages = partRaws.filter(isTailResultRaw);
              const headRawMessages = partRaws.filter(
                (m) => (m as Record<string, unknown>).type === "assistant",
              );
              const agentCustom: Record<string, unknown> = {
                sourceUuids: [...item.sourceUuids],
                _rawMessages: headRawMessages,
                tailRawMessages,
                systemMessageType: "agent-container",
                toolName: part.toolName,
                toolCallId: part.toolCallId,
                subagentType: argsRecord?.subagent_type,
                description: argsRecord?.description,
                args: part.args,
                argsText: part.argsText,
                tailResult: part.result,
                tailIsError: part.isError === true,
                tailStats: tail?.stats,
                tailContent: tail?.content ?? part.result,
                isInterrupted: part.isInterrupted === true,
                controlRequestId: part.controlRequestId,
                bodyChildUuids: part.bodyChildUuids ?? [],
                toolMessageId,
                ...(part.progress ? { progress: part.progress } : {}),
              };
              messages.push({
                role: "system",
                content: [{ type: "text", text: "" }],
                metadata: { custom: agentCustom },
              });
            } else if (part.toolName === "ExitPlanMode") {
              // ExitPlanMode renders as its own head/body/tail container
              // (plan body + approve-with-mode / reject-with-feedback tail),
              // not the generic tool-card. controlRequestId (from a paired
              // control_request) marks the awaiting-confirmation state.
              const planArgs = part.args as Record<string, unknown>;
              const planCustom: Record<string, unknown> = {
                sourceUuids: [...item.sourceUuids],
                _rawMessages: part.rawSnapshots ?? item._rawSnapshots,
                systemMessageType: "exit-plan-mode",
                toolCallId: part.toolCallId,
                plan: planArgs?.plan,
                planFilePath: planArgs?.planFilePath,
                controlRequestId: part.controlRequestId,
                result: part.result,
                isError: part.isError === true,
                isOrphaned: part.isInterrupted === true,
                toolMessageId,
              };
              messages.push({
                role: "system",
                content: [{ type: "text", text: "" }],
                metadata: { custom: planCustom },
              });
            } else if (part.toolName === "AskUserQuestion") {
              // AskUserQuestion renders as its own dedicated card (structured
              // questions + submit/skip tail), unified with ExitPlanMode's
              // emission→router→card pipeline. controlRequestId (from a paired
              // control_request) marks the live awaiting state; its absence in
              // replay means history view. `args` is kept so the bridge submit
              // can restore {...args, answers} as the control_response updatedInput.
              const askArgs = part.args as Record<string, unknown> | undefined;
              const askCustom: Record<string, unknown> = {
                sourceUuids: [...item.sourceUuids],
                _rawMessages: part.rawSnapshots ?? item._rawSnapshots,
                systemMessageType: "ask-user-question",
                toolCallId: part.toolCallId,
                questions: Array.isArray(askArgs?.questions) ? askArgs.questions : [],
                args: askArgs ?? {},
                controlRequestId: part.controlRequestId,
                result: part.result,
                isError: part.isError === true,
                isOrphaned: part.isInterrupted === true,
                toolMessageId,
              };
              messages.push({
                role: "system",
                content: [{ type: "text", text: "" }],
                metadata: { custom: askCustom },
              });
            } else {
              const toolCustom: Record<string, unknown> = {
                sourceUuids: [...item.sourceUuids],
                _rawMessages: part.rawSnapshots ?? item._rawSnapshots,
                systemMessageType: "tool-card",
                toolName: part.toolName,
                toolCallId: part.toolCallId,
                args: part.args,
                argsText: part.argsText,
                result: part.result,
                isError: part.isError,
                isInterrupted: part.isInterrupted,
                skillContent: part.skillContent,
                controlRequestId: part.controlRequestId,
                toolMessageId,
                toolIndent: hasTextParts,
                ...(part.progress ? { progress: part.progress } : {}),
              };
              messages.push({
                role: "system",
                content: [{ type: "text", text: "" }],
                metadata: { custom: toolCustom },
              });
            }
          } else {
            textParts.push(part);
          }
        }
        flushText();

        // If the assistant item produced no messages at all (empty delta, no
        // tool-calls), emit an empty assistant bubble so it still appears in
        // the rendered list.  This preserves the pre-tool-independence
        // behavior for truly empty deltas.
        if (item.parts.length === 0) {
          const emptyBubble: ThreadMessageLike = {
            role: "assistant",
            content: [],
            metadata: { custom: { ...customBase } },
          };
          messages.push(enrichBubbleMetadata(emptyBubble));
        }

        // Attach api_errors to the last assistant bubble (if any).
        if (item.apiErrors.length > 0) {
          for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === "assistant") {
              let withErrors = messages[i];
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
              messages[i] = withErrors;
              break;
            }
          }
        }
        break;
      }
      case "user-prompt": {
        messages.push(
          enrichBubbleMetadata({
            role: "user",
            content: item.text,
            metadata: {
              custom: {
                sourceUuids: [...item.sourceUuids],
                _rawMessages: item._rawSnapshots,
              },
            },
          }),
        );
        break;
      }
      case "compact-block": {
        messages.push({
          role: "system",
          content: [{ type: "text", text: "" }],
          metadata: {
            custom: {
              sourceUuids: [...item.sourceUuids],
              _rawMessages: item._rawSnapshots,
              systemMessageType: "compact-block",
              trigger: item.trigger,
              ...(item.preTokens != null ? { preTokens: item.preTokens } : {}),
              ...(item.postTokens != null ? { postTokens: item.postTokens } : {}),
              ...(item.durationMs != null ? { durationMs: item.durationMs } : {}),
              ...(item.messagesSummarized != null
                ? { messagesSummarized: item.messagesSummarized }
                : {}),
              ...(item.summaryText != null ? { summaryText: item.summaryText } : {}),
              attachments: item.attachments,
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
              _rawMessages: item._rawSnapshots,
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
        for (let j = itemIdx + 1; j < renderItems.length; j++) {
          if (renderItems[j].kind === "batch-boundary") continue;
          nextVisible = true;
          break;
        }
        if (prevVisible || nextVisible) {
          messages.push(makeBoundaryDivider());
        }
        break;
      }
      case "attachment": {
        messages.push(item.bubble);
        break;
      }
      case "mode-change": {
        messages.push({
          role: "system",
          content: [{ type: "text", text: "" }],
          metadata: {
            custom: {
              sourceUuids: [...item.sourceUuids],
              _rawMessages: item._rawSnapshots,
              systemMessageType: "mode-change",
              mode: item.mode,
            },
          },
        });
        break;
      }
      case "command-output": {
        messages.push({
          role: "system",
          content: [{ type: "text", text: "" }],
          metadata: {
            custom: {
              sourceUuids: [...item.sourceUuids],
              _rawMessages: item._rawSnapshots,
              systemMessageType: "command-output",
              commandName: item.commandName,
              args: item.args,
              stdout: item.stdout,
              stderr: item.stderr,
              input: item.input,
              sourceType: item.sourceType,
            },
          },
        });
        break;
      }
      case "compact-abort": {
        messages.push({
          role: "system",
          content: [{ type: "text", text: "" }],
          metadata: {
            custom: {
              sourceUuids: [...item.sourceUuids],
              _rawMessages: item._rawSnapshots,
              systemMessageType: "compact-abort",
              source: item.source,
            },
          },
        });
        break;
      }
      case "hook-event": {
        messages.push({
          role: "system",
          content: [{ type: "text", text: "" }],
          metadata: {
            custom: {
              sourceUuids: [...item.sourceUuids],
              _rawMessages: item._rawSnapshots,
              systemMessageType: "hook-card",
              hookName: item.hookName,
              hookEvent: item.hookEvent,
              output: item.output,
              stderr: item.stderr,
              exitCode: item.exitCode,
              outcome: item.outcome,
            },
          },
        });
        break;
      }
      case "turn-end": {
        // Stamp per-turn stats onto the turn's last assistant bubble (the
        // footer caption), scoped to this turn's message range so we never
        // reach across a prior turn boundary. Mirrors applyToolResultsToMessages'
        // retroactive mutate of an already-emitted assistant message. The
        // boundary itself is still recorded below for applyToolLifecycle.
        if (item.turnStats) {
          const startIdx =
            turnEndBoundaries.length > 0 ? turnEndBoundaries[turnEndBoundaries.length - 1] : 0;
          for (let i = messages.length - 1; i >= startIdx; i--) {
            if (messages[i].role === "assistant") {
              const prev = messages[i];
              messages[i] = {
                ...prev,
                metadata: {
                  ...prev.metadata,
                  custom: {
                    ...(prev.metadata?.custom as Record<string, unknown> | undefined),
                    turnStats: item.turnStats,
                  },
                },
              };
              break;
            }
          }
        }
        // No bubble — record the turn boundary for applyToolLifecycle.
        turnEndBoundaries.push(messages.length);
        break;
      }
      case "fallback": {
        messages.push(item.ui);
        break;
      }
    }
  }

  // Post-process: assign toolGroupPosition for consecutive tool-cards
  // sharing the same message.id so the UI can merge them into a list.
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const custom = msg.metadata?.custom as Record<string, unknown> | undefined;
    if (custom?.systemMessageType !== "tool-card") continue;
    const curId = custom.toolMessageId as string;
    const prevCustom =
      i > 0 ? (messages[i - 1].metadata?.custom as Record<string, unknown> | undefined) : undefined;
    const nextCustom =
      i < messages.length - 1
        ? (messages[i + 1].metadata?.custom as Record<string, unknown> | undefined)
        : undefined;
    const prevSameGroup =
      prevCustom?.systemMessageType === "tool-card" && prevCustom.toolMessageId === curId;
    const nextSameGroup =
      nextCustom?.systemMessageType === "tool-card" && nextCustom.toolMessageId === curId;
    if (!prevSameGroup && !nextSameGroup) custom.toolGroupPosition = "solo";
    else if (!prevSameGroup && nextSameGroup) custom.toolGroupPosition = "first";
    else if (prevSameGroup && nextSameGroup) custom.toolGroupPosition = "middle";
    else custom.toolGroupPosition = "last";
    // Indent propagates from first to rest in same group.
    if (prevSameGroup) custom.toolIndent = prevCustom?.toolIndent;
  }

  // Post-process: resolve Agent container body. For each agent-container head,
  // map its bodyChildUuids → global message indices (bodyIndices), and stamp
  // absorbed on those children so the top-level render skips them — the
  // AgentContainer renders them inside its body instead. Atomic within this
  // single renderChatStream pass.
  // Map each source uuid → ALL render indices that carry it. A merged body
  // item (subagent's same-turn tool_uses share message.id) renders as several
  // tool-card messages, each carrying the item's sourceUuids — so one uuid
  // spans multiple indices, and the body must own all of them.
  const uuidToIndices = new Map<string, number[]>();
  for (let i = 0; i < messages.length; i++) {
    const custom = messages[i].metadata?.custom as Record<string, unknown> | undefined;
    const uuids = custom?.sourceUuids as string[] | undefined;
    if (uuids) {
      for (const u of uuids) {
        let list = uuidToIndices.get(u);
        if (!list) {
          list = [];
          uuidToIndices.set(u, list);
        }
        list.push(i);
      }
    }
  }
  for (const msg of messages) {
    const custom = msg.metadata?.custom as Record<string, unknown> | undefined;
    if (custom?.systemMessageType !== "agent-container") continue;
    const childUuids = (custom.bodyChildUuids as string[] | undefined) ?? [];
    const bodyIndices: number[] = [];
    for (const u of childUuids) {
      const idxs = uuidToIndices.get(u);
      if (!idxs) continue;
      for (const idx of idxs) {
        if (bodyIndices.includes(idx)) continue;
        bodyIndices.push(idx);
        const childCustom = messages[idx]?.metadata?.custom as Record<string, unknown> | undefined;
        if (childCustom) {
          childCustom.absorbed = true;
          childCustom.absorbedBy = custom.toolCallId;
        }
      }
    }
    custom.bodyIndices = bodyIndices;
  }

  return applyToolLifecycle(messages, turnEndBoundaries, { isResume: !!opts?.isResume }).messages;
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
  const rawMessagesRef = useRef<SessionStreamServerMessage[]>([]);
  useEffect(() => {
    rawMessagesRef.current = rawMessages;
  }, [rawMessages]);
  const messageMapRef = useRef<Map<string, SessionStreamServerMessage>>(new Map());
  const historyBatchRef = useRef<SessionStreamServerMessage[] | null>(null);
  const liveBatchRef = useRef<SessionStreamServerMessage[] | null>(null);
  // Server-authoritative: whether this session instance was spawned with --resume.
  // Populated on session_init; used at history_end to decide orphan marking.
  const isResumeRef = useRef(false);
  // rawMessages index where the live + instantaneous region begins (= history
  // segment length). Set at history_end (history is 1:1 appended by processBatch,
  // so batch.length is the exact live-region start). Reset on session_init. Used
  // to scope computeRunningCount / deriveLiveThinkingTokens to live+instantaneous
  // only — history (JSONL archive) has no `result` and must not drive running.
  // Like isResumeRef, this is a ref coupled to rawMessages changes (history_end
  // sets it synchronously right before processBatch's setRawMessages triggers a
  // re-render), so it intentionally is not a useMemo dependency.
  const liveStartRef = useRef(0);

  // ── Shared helper: push a bubble + drain pending API errors ──

  // ── Content message handlers ──

  // bridgeRef lets applyMessageScalarState (defined above the `bridge` useMemo)
  // reach the current onCompact handler the route injected into bridge, without
  // hitting the const TDZ between applyMessageScalarState and bridge.
  const bridgeRef = useRef<Claude2Bridge | null>(null);

  // ── Scalar state updater ──────────────────────────────────────────
  // Applies per-message scalar state updates (tasks, model, etc.).
  // Bubble/visibility decisions are handled by renderChatStream, not here.
  const applyMessageScalarState = useCallback(
    (msg: SessionStreamServerMessage) => {
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
        if (init.mcp_servers?.length) {
          setMcpServers(init.mcp_servers.map((s) => s.name ?? "").filter(Boolean));
        }
        return;
      }

      // system.seed_init: scalar seed injected on replay. Carries only
      // model/permissionMode (tools/skills/mcp come from the REST catalog, not the
      // seed). Distinct subtype from live system.init so this folds scalar state
      // without the full init payload.
      if (msg.type === "system" && sm.subtype === "seed_init") {
        const seed = msg as { model?: string; permissionMode?: string };
        if (seed.model) {
          setCurrentModel(seed.model);
          setResolvedModel(seed.model);
        }
        if (seed.permissionMode) setPermissionMode(seed.permissionMode);
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
      if (msg.type === "system" && isCompactBoundarySubtype(sm.subtype as string | undefined)) {
        compactActiveRef.current = true;
        bridgeRef.current?.onCompact?.({ phase: "end" });
        return;
      }

      // SessionStart:compact hook_response → compact hook finished, the summary
      // is about to be written. Advances the progress card's stage.
      if (msg.type === "system" && sm.subtype === "hook_response") {
        const hm = msg as { hook_name?: string };
        if (hm.hook_name?.startsWith("SessionStart:compact")) {
          bridgeRef.current?.onCompact?.({ phase: "progress", stage: "summarizing" });
        }
        return;
      }

      // system.status: 权限模式切换的权威实时信号；compact 变体（compacting /
      // compact_result）在此驱动 onCompact 生命周期（renderChatStream 仍跳过它们）。
      if (msg.type === "system" && sm.subtype === "status") {
        const s = msg as { permissionMode?: string; status?: string; compact_result?: string };
        if (s.status === "compacting") {
          // Fresh compaction: clear any stale user-interrupt flag so a later
          // natural failure isn't mislabeled as "stopped".
          compactInterruptedRef.current = false;
          bridgeRef.current?.onCompact?.({ phase: "start" });
          return;
        }
        if (s.compact_result === "failed") {
          // Distinguish user-initiated stop (interrupted) from a natural failure:
          // onCancel set the flag when the user pressed stop during this compaction.
          const userStopped = compactInterruptedRef.current;
          compactInterruptedRef.current = false;
          bridgeRef.current?.onCompact?.({
            phase: "end",
            error: userStopped ? "interrupted" : "failed",
          });
          return;
        }
        if (s.permissionMode) setPermissionMode(s.permissionMode);
        return;
      }

      // permission-mode
      if (msg.type === "permission-mode") {
        setPermissionMode((msg as { permissionMode: string }).permissionMode);
        return;
      }

      // control_response: CLI's reply to client-initiated control_request actions
      // (set_model / set_permission_mode / interrupt). Match by request_id and
      // apply/rollback the corresponding scalar state. Responses to CLI-initiated
      // can_use_tool requests are sent by us, never received, so they never
      // reach this handler.
      if (msg.type === "control_response") {
        const r = msg as unknown as Claude2ControlResponse;
        const requestId = r.response?.request_id;
        if (!requestId) return;
        const pending = pendingControlRequestsRef.current.get(requestId);
        if (!pending) return;
        setPendingControlRequests((prev) => {
          const next = new Map(prev);
          next.delete(requestId);
          return next;
        });
        switch (pending.kind) {
          case "set_model":
            if (r.response.subtype === "success") {
              setResolvedModel(currentModelRef.current);
              setModelSwitchVersion((v) => v + 1);
            } else if (pending.priorModel != null) {
              setCurrentModel(pending.priorModel);
              setResolvedModel(pending.priorModel);
            }
            break;
          case "set_permission_mode":
            if (r.response.subtype === "error" && pending.priorMode != null) {
              setPermissionMode(pending.priorMode);
            }
            break;
          case "interrupt":
            if (r.response.subtype === "success") {
              // setRawMessages runs before applyMessageScalarState, so the
              // control_response message is already the last item in rawMessages.
              setInterruptAtIndex(rawMessagesRef.current.length - 1);
            }
            break;
        }
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

      // system.skill_catalog_changed: /reload-skills succeeded server-side.
      // Invalidate the REST catalog query — it re-fetches with the refreshed disk
      // scan. No payload on the message by design (broadcast-only notification).
      if (msg.type === "system" && sm.subtype === "skill_catalog_changed") {
        const catalogKey = [
          "projects",
          projectName,
          "agent-sessions",
          sessionId,
          "skill-slash-catalog",
        ];
        // hadCached confirms the adapter's queryClient singleton matches the one
        // the catalog useQuery registered against (false ⇒ HMR instance split).
        if (isSocketLoggingEnabled())
          console.log(
            "[claude2-adapter] skill_catalog_changed hadCached",
            queryClient.getQueryData(catalogKey) != null,
          );
        queryClient.invalidateQueries({ queryKey: catalogKey });
        return;
      }

      // user: a TaskCreate tool_result carries the REAL task id in the
      // structured result envelope (camelCase `toolUseResult` on JSONL/replay,
      // snake_case `tool_use_result` on live stdout — extractTaskIdAssignment
      // handles both). Backfill the temporary task (created with tool_use_id as
      // its id) so a later TaskUpdate(taskId=real id) can match it. Other user
      // messages (prompts, non-Task tool_results) yield no assignment.
      if (msg.type === "user") {
        const assign = extractTaskIdAssignment(msg);
        if (assign) {
          setTasks((prev) =>
            prev.map((t) => (t.id === assign.toolUseId ? { ...t, id: assign.taskId } : t)),
          );
        }
        return;
      }

      // The remaining types (system, result, file-history-snapshot,
      // control_request) carry no scalar state. Bubble/visibility decisions for
      // them live entirely in renderChatStream. control_request attaches its
      // request_id to the matching tool-call part in normalizeChatStream.
    },
    [projectName, sessionId],
  );

  const processBatch = useCallback(
    (rawMsgs: SessionStreamServerMessage[]) =>
      timed(
        "processBatch",
        () => {
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
        rawMsgs.length,
      ),
    [applyMessageScalarState],
  );

  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Index of the last confirmed interrupt control_response, or undefined. When
  // set, computeRunningCount treats that message position as a turn-close
  // boundary (the CLI replies control_response — not result — to an interrupt).
  const [interruptAtIndex, setInterruptAtIndex] = useState<number | undefined>();
  const isRunning = useMemo(
    () =>
      computeRunningCount(rawMessages, {
        liveStart: liveStartRef.current,
        interruptAtIndex,
      }) > 0,
    [rawMessages, interruptAtIndex],
  );
  const liveThinkingTokens = useMemo(
    () => deriveLiveThinkingTokens(rawMessages, { liveStart: liveStartRef.current }),
    [rawMessages],
  );
  const [loading, setLoading] = useState(true);
  // Pending live_end: set synchronously when the live batch ends, consumed by the
  // deferred-loading effect to flip loading=false on the next render.
  const liveEndPendingRef = useRef(false);
  const [currentModel, setCurrentModel] = useState<string | undefined>();
  const [resolvedModel, setResolvedModel] = useState<string | undefined>(initialModel);
  const [modelSwitchVersion, setModelSwitchVersion] = useState(0);
  const [permissionMode, setPermissionMode] = useState<string | undefined>(initialPermissionMode);
  const [aiTitle, setAiTitle] = useState<string | null>(null);
  const [agentName, setAgentName] = useState<string | null>(null);
  const lastAiTitleRef = useRef<string | null>(null);
  const lastAgentNameRef = useRef<string | null>(null);
  // Refs mirror the latest state so callbacks/useMemo with empty deps don't
  // close over stale values.
  const currentModelRef = useRef(currentModel);
  const permissionModeRef = useRef(permissionMode);
  const pendingControlRequestsRef = useRef<Map<string, PendingControlAction>>(new Map());

  const [pendingControlRequests, setPendingControlRequests] = useState<
    Map<string, PendingControlAction>
  >(new Map());

  useEffect(() => {
    if (initialModel !== undefined && resolvedModel === undefined) {
      setResolvedModel(initialModel);
    }
  }, [initialModel, resolvedModel]);
  useEffect(() => {
    currentModelRef.current = currentModel;
  }, [currentModel]);
  useEffect(() => {
    permissionModeRef.current = permissionMode;
  }, [permissionMode]);
  useEffect(() => {
    pendingControlRequestsRef.current = pendingControlRequests;
  }, [pendingControlRequests]);
  useEffect(() => {
    if (initialPermissionMode !== undefined && permissionMode === undefined) {
      setPermissionMode(initialPermissionMode);
    }
  }, [initialPermissionMode, permissionMode]);

  const cursorRef = useRef<string | null>(null);
  const pendingAskRef = useRef<SessionStreamServerMessage | null>(null);
  const compactActiveRef = useRef(false);
  const compactInterruptedRef = useRef(false);
  const socketRef = useRef<WebSocket | null>(null);
  const [tasks, setTasks] = useState<TaskInfo[]>([]);
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
    liveEndPendingRef.current = false;
    cursorRef.current = null;
    pendingAskRef.current = null;
    historyBatchRef.current = null;
    liveBatchRef.current = null;
    compactActiveRef.current = false;
    compactInterruptedRef.current = false;
    liveStartRef.current = 0;
    // NOTE: this callback never reads initialModel/initialPermissionMode (the
    // initial values are applied by the dedicated effects below), so its deps
    // must be empty. Listing them here made the TanStack Query resolve
    // (detail.data undefined → string on mount) change this callback's identity,
    // which re-triggered the WebSocket effect mid-replay — tearing the connection
    // down and reconnecting (historyStart=2, inflated historyRecv).
  }, []);

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
    if (isSocketLoggingEnabled()) {
      console.log(
        `[claude2-adapter] ws send: readyState=${socket.readyState} msg=${raw.slice(0, 200)}`,
      );
    }
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
      respondToControlRequest(requestId, updatedInput, permissionUpdates) {
        const allowResponse: Record<string, unknown> = {
          behavior: "allow",
          updatedInput: updatedInput,
        };
        if (permissionUpdates && permissionUpdates.length > 0) {
          allowResponse.permission_updates = permissionUpdates;
        }
        sendToSocket({
          type: "control_response",
          response: {
            subtype: "success",
            request_id: requestId,
            response: allowResponse,
          },
        });
      },
      cancelControlRequest(requestId, message) {
        sendToSocket({
          type: "control_response",
          response: {
            subtype: "success",
            request_id: requestId,
            response: { behavior: "deny", message: message ?? "User skipped" },
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
        const requestId = crypto.randomUUID();
        setPendingControlRequests((prev) => {
          const next = new Map(prev);
          next.set(requestId, { kind: "set_model", priorModel: currentModelRef.current });
          return next;
        });
        setCurrentModel(model);
        sendToSocket({
          type: "control_request",
          request_id: requestId,
          request: { subtype: "set_model", model },
        });
      },
      switchPermissionMode(mode) {
        const requestId = crypto.randomUUID();
        setPendingControlRequests((prev) => {
          const next = new Map(prev);
          next.set(requestId, {
            kind: "set_permission_mode",
            priorMode: permissionModeRef.current,
          });
          return next;
        });
        setPermissionMode(mode);
        sendToSocket({
          type: "control_request",
          request_id: requestId,
          request: { subtype: "set_permission_mode", mode },
        });
      },
      onCompact: null,
    }),
    [sendToSocket],
  );

  // Keep bridgeRef in sync every render so applyMessageScalarState can invoke
  // the latest onCompact the route injected into bridge.
  bridgeRef.current = bridge;

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
    // Receive the gzipped history/live replay batches as ArrayBuffer so they can
    // be detected via `instanceof ArrayBuffer` and decompressed before buffering.
    socket.binaryType = "arraybuffer";
    socketRef.current = socket;

    socket.onopen = () => {
      console.log("[claude2-adapter] ws open");
    };

    const decompressGzip = async (buf: ArrayBuffer): Promise<string> => {
      const stream = new Response(buf).body!.pipeThrough(new DecompressionStream("gzip"));
      return await new Response(stream).text();
    };

    // Binary frame = one gzipped history/live replay batch. Decompress and push
    // into the currently-open batch buffer. The text branch in handleFrame still
    // buffers per-row text frames, which is how the server's gzip-failure
    // fallback is delivered — the client needs no explicit fallback switch.
    const handleBinaryBatch = async (buf: ArrayBuffer) => {
      const t0 = performance.now();
      const text = await decompressGzip(buf);
      const target = historyBatchRef.current ?? liveBatchRef.current;
      const kind = historyBatchRef.current != null ? "history" : "live";
      if (!target) {
        console.error(
          "[claude2-adapter] compressed batch arrived outside a batch window — dropping",
        );
        return;
      }
      let rows = 0;
      if (text.length > 0) {
        for (const line of text.split("\n")) {
          try {
            const parsed = JSON.parse(line) as SessionStreamServerMessage;
            target.push(parsed);
            // Mirror handleTextFrame's ws recv log so the (compressed) history
            // and live batches are also visible row-by-row when socket logging
            // is on — otherwise only the text-frame batch markers show up.
            if (isSocketLoggingEnabled()) console.log("[claude2-adapter] ws recv", parsed);
            rows++;
          } catch {
            // skip malformed batch line
          }
        }
      }
      // historyDecompress = client CPU added by compression (DecompressionStream +
      // per-line parse). historyBlobBytes = compressed wire size. Together with
      // historyRecv: transfer ≈ historyRecv − historyDecompress.
      recordSample(`${kind}Decompress`, performance.now() - t0, rows);
      recordSample(`${kind}BlobBytes`, 0, buf.byteLength);
    };

    // Synchronous handling for text frames (control markers, real-time rows, and
    // the server's per-row gzip-failure fallback). Kept synchronous so latency
    // and the text-only test paths are unchanged when no blob is in flight.
    const handleTextFrame = (event: MessageEvent) => {
      if (cancelled) return;
      // Arrival probe: while a history batch is open, time each frame's arrival
      // (inter-arrival gap) and processing (parse+dispatch+push) so the report can
      // separate network work from client work. See resetArrival/reportArrival.
      const trackArrival = isPerfTraceEnabled() && historyBatchRef.current != null;
      const arriveMs = trackArrival ? performance.now() : 0;
      try {
        const raw = event.data as string;
        const msg = JSON.parse(raw) as SessionStreamServerMessage;
        if (isSocketLoggingEnabled()) console.log("[claude2-adapter] ws recv", msg);

        // ── Batch markers ────────────────────────────────────────────
        // Start markers are transport control — never render.
        // End markers render as a horizontal divider only when the
        // batch contained at least one visible content bubble.
        if (msg.type === "session_init") {
          // New connection — discard all state from the prior connection
          // before replaying history/output batches.
          resetSessionState();
          isResumeRef.current = (msg as { resume: boolean }).resume ?? false;
          if (isSocketLoggingEnabled())
            console.log("[claude2-adapter] session_init resume=", isResumeRef.current);
          return;
        }
        // seed_init: replay-time scalar seed (model/permissionMode), sent between
        // session_init and history_start (session-relay.ts addSubscriber) so the
        // scalar fold has a value before the gzip history batch. It is
        // connection-level metadata, NOT message-stream content — fold its
        // scalars and return without appending to rawMessages or touching loading.
        // Falling through to per-message dispatch would setLoading(false) before
        // any content arrives, opening a window where the skeleton gate hides
        // (loading=false ∧ hasRenderedContent=false ∧ turns=[]) then re-shows at
        // live_end — the resume-open skeleton flicker.
        if (msg.type === "system" && (msg as { subtype?: string }).subtype === "seed_init") {
          applyMessageScalarState(msg);
          return;
        }
        if (msg.type === "history_start") {
          markOnce("historyLoad");
          // Count starts so the report surfaces a StrictMode/reconnect double-load
          // (historyStart.count > 1) that would otherwise inflate loadE2E/historyRecv.
          count("historyStart");
          resetArrival();
          historyBatchRef.current = [];
          if (isSocketLoggingEnabled())
            console.log("[claude2-adapter] history batch start, count=", msg.count);
          return;
        }
        if (msg.type === "history_end") {
          const batch = historyBatchRef.current ?? [];
          historyBatchRef.current = null;
          // history_start → history_end wall-clock = the WS reception/transfer phase
          // (everything before this point was onmessage buffering). Read without
          // clearing so live_end's loadE2E can still measure from the same start.
          const recvStart = peekMark("historyLoad");
          const recvMs = recvStart != null ? performance.now() - recvStart : 0;
          if (recvStart != null) measureFrom("historyRecv", recvStart, batch.length);
          // Break historyRecv down: how much was client processing vs waiting for
          // frames to arrive. procTotal ≪ recvMs + even gaps ⇒ network, not client.
          reportArrival(recvMs);
          // The history segment occupies rawMessages[0..batch.length) (processBatch
          // appends 1:1). The live + instantaneous region starts at batch.length —
          // capture it BEFORE processBatch so the re-render it triggers reads the
          // new value. Empty history (non-resume) leaves liveStart at its 0 reset.
          liveStartRef.current = batch.length;
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
              } as unknown as SessionStreamServerMessage,
            ]);
          }
          if (isSocketLoggingEnabled())
            console.log("[claude2-adapter] history batch end, processed", batch.length, "messages");
          return;
        }
        if (msg.type === "live_start") {
          liveBatchRef.current = [];
          if (isSocketLoggingEnabled())
            console.log("[claude2-adapter] live batch start, count=", msg.count);
          return;
        }
        if (msg.type === "live_end") {
          const batch = liveBatchRef.current ?? [];
          liveBatchRef.current = null;
          processBatch(batch);
          // No divider here: the boundary lives at the history/live junction
          // (injected at history_end), not at the tail of the live batch.
          // Defer setLoading(false) to the next render (the effect below): flipping
          // it synchronously here would land loading=false in the same batch as
          // setRawMessages, one frame before assistant-ui pushes storeAdapter→
          // thread.messages, so the gate (turns===0 && loading) would drop the
          // skeleton with turns still empty — a blank flash. The effect runs after
          // commit, landing loading=false on the same render turns catches up.
          liveEndPendingRef.current = true;
          if (isSocketLoggingEnabled())
            console.log("[claude2-adapter] live batch end, processed", batch.length, "messages");
          return;
        }

        // In batch collection — buffer, don't process yet
        if (historyBatchRef.current) {
          historyBatchRef.current.push(msg);
          if (trackArrival) tickArrival(arriveMs, performance.now() - arriveMs);
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

    // A compressed batch decompresses asynchronously. While a blob is in flight,
    // route subsequent frames through a serial promise chain so completion order
    // matches arrival order — otherwise a coalesced history_end would drain the
    // buffer before the blob's rows land, or a fast live blob could overtake a
    // slow history blob. When no blob is pending (the common case, and every
    // text-only path), frames are handled synchronously with no microtask hop.
    let blobInFlight = false;
    let chain: Promise<void> = Promise.resolve();
    socket.onmessage = (event) => {
      if (cancelled) return;
      if (event.data instanceof ArrayBuffer) {
        blobInFlight = true;
        chain = chain
          .then(() => handleBinaryBatch(event.data))
          .catch((e) => console.error("[claude2-adapter] binary batch error", e))
          .finally(() => {
            blobInFlight = false;
          });
        return;
      }
      if (blobInFlight) {
        chain = chain
          .then(() => handleTextFrame(event))
          .catch((e) => console.error("[claude2-adapter] handleFrame error", e));
        return;
      }
      handleTextFrame(event);
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
  const chatStream = useMemo(
    () =>
      isPerfTraceEnabled()
        ? timed("normalize", () => normalizeChatStream(rawMessages), rawMessages.length)
        : normalizeChatStream(rawMessages),
    [rawMessages],
  );
  const renderedMessages = useMemo(
    () =>
      isPerfTraceEnabled()
        ? timed(
            "render",
            () => renderChatStream(chatStream, { isResume: isResumeRef.current }),
            chatStream.length,
          )
        : renderChatStream(chatStream, { isResume: isResumeRef.current }),
    [chatStream],
  );

  // A control_request is pending when some tool-call part carries an injected
  // controlRequestId that is still unresolved (no result, not interrupted). This
  // is the session-level "agent is waiting on the user" signal shared by
  // AskUserQuestion / ExitPlanMode / permission prompts; it gates the composer
  // into its blocked state. control_request is stdout-only (never in JSONL), so
  // replayed history has no controlRequestId and cannot false-positive here.
  const pendingInteraction = useMemo(() => {
    for (const item of chatStream) {
      if (item.kind !== "assistant") continue;
      for (const part of item.parts) {
        if (
          part.type === "tool-call" &&
          part.controlRequestId &&
          !part.result &&
          !part.isInterrupted
        ) {
          return true;
        }
      }
    }
    return false;
  }, [chatStream]);

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
    // Mark any in-flight compaction as user-stopped so its compact_result is
    // labeled "interrupted" rather than "failed". Harmless when no compaction
    // is active — a fresh status:compacting clears it before the next result.
    compactInterruptedRef.current = true;
    const requestId = crypto.randomUUID();
    setPendingControlRequests((prev) => {
      const next = new Map(prev);
      next.set(requestId, { kind: "interrupt" });
      return next;
    });
    sendToSocket({
      type: "control_request",
      request_id: requestId,
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

  // Defer loading→false to the render after live_end. live_end sets
  // liveEndPendingRef synchronously (same batch as setRawMessages); this effect
  // runs after commit, so loading=false lands on the same render assistant-ui
  // pushes storeAdapter→thread.messages and turns catches up — closing the
  // one-frame blank window a synchronous setLoading(false) would open.
  useEffect(() => {
    if (!liveEndPendingRef.current) return;
    liveEndPendingRef.current = false;
    setLoading(false);
    measureSince("historyLoad", "loadE2E");
  }, [rawMessages]);

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
    liveThinkingTokens,
    tasks,
    mcpServers,
    inputQueue,
    lastPrompt,
    sessionLeafUuid,
    retryInfo,
    pendingInteraction,
    /**
     * 原始消息数组 ref（chat 版 terminalDataRef，Phase 5 缩略预览数据源）。当前 raw state 的
     * ref 镜像（useEffect 同步），供 SplitPanel header 在 AssistantRuntimeProvider 外读取末 2 行
     * assistant 文本（零 AUI 依赖，ref 模式）。仅读：`.current` 在 render 间稳定，不触发重渲染
     *（预览随 live message 自然刷新——previewLines 经 useMemo 依赖 rawMessages.length 变化）。
     */
    rawMessagesRef,
  };
}
