import { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ExternalStoreAdapter, AppendMessage, ThreadMessageLike } from "@assistant-ui/react";
import type { Claude2ControlResponse, SessionStreamServerMessage } from "@agents-remote/shared";
import { claude2StreamUrl, getAgentSessionMessages } from "../api/client";

export type TaskInfo = {
  id: string;
  agentType?: string;
  workflowName?: string;
  description: string;
  status: "running" | "completed" | "error" | "backgrounded";
  text?: string;
  error?: string;
  kind: "agent" | "workflow" | "task";
};

type TaskSystemMessage = Extract<
  SessionStreamServerMessage,
  { type: "system"; subtype: "task_started" | "task_updated" | "task_notification" }
>;

type AskUserQuestionAssistantMessage = Extract<SessionStreamServerMessage, { type: "assistant" }>;

const isTaskSystemMessage = (msg: SessionStreamServerMessage): msg is TaskSystemMessage =>
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
  const kind: TaskInfo["kind"] =
    msg.subtype === "task_started"
      ? msg.workflowName
        ? "workflow"
        : msg.agentType
          ? "agent"
          : "task"
      : (prev.find((t) => t.id === msg.task_id)?.kind ?? "task");
  const existing = prev.findIndex((t) => t.id === msg.task_id);
  if (existing >= 0) {
    const updated = [...prev];
    const current = updated[existing];

    if (msg.subtype === "task_updated") {
      updated[existing] = {
        ...current,
        kind,
        status: msg.error ? "error" : msg.isBackgrounded ? "backgrounded" : "running",
        ...(msg.error ? { error: msg.error } : {}),
      };
      return updated;
    }

    if (msg.subtype === "task_notification") {
      updated[existing] = {
        ...current,
        kind,
        status: "completed",
        text: msg.text ?? current.text,
      };
      return updated;
    }

    updated[existing] = {
      ...current,
      kind,
      agentType: msg.agentType ?? current.agentType,
      workflowName: msg.workflowName ?? current.workflowName,
      description: msg.prompt ?? current.description,
    };
    return updated;
  }

  if (msg.subtype === "task_started") {
    return [
      ...prev,
      {
        id: msg.task_id,
        kind,
        agentType: msg.agentType,
        workflowName: msg.workflowName,
        description: msg.prompt ?? "",
        status: "running",
      },
    ];
  }

  if (msg.subtype === "task_updated") {
    return [
      ...prev,
      {
        id: msg.task_id,
        kind,
        description: "",
        status: msg.error ? "error" : msg.isBackgrounded ? "backgrounded" : "running",
        ...(msg.error ? { error: msg.error } : {}),
      },
    ];
  }

  return [
    ...prev,
    {
      id: msg.task_id,
      kind,
      description: msg.text ?? "",
      status: "completed",
      ...(msg.text ? { text: msg.text } : {}),
    },
  ];
};

export const deriveTasksFromReplayBatch = (batch: SessionStreamServerMessage[]): TaskInfo[] => {
  let tasks: TaskInfo[] = [];
  for (const msg of batch) {
    if (!msg || !isTaskSystemMessage(msg)) continue;
    tasks = applyTaskSystemMessage(tasks, msg);
  }
  return tasks;
};

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asReadonlyJSON = (v: Record<string, unknown>): any => v;

const extractTextFromContent = (content: unknown): string | null => {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return null;
  const texts: string[] = [];
  for (const block of content as Array<Record<string, unknown>>) {
    if (block.type === "text" && typeof block.text === "string") {
      texts.push(block.text);
    }
  }
  return texts.length > 0 ? texts.join("\n") : null;
};

const SKILL_CONTENT_PREFIX = "Base directory for this skill:";

const extractUserTextBlocks = (content: unknown): string[] => {
  if (!Array.isArray(content)) return [];
  return (content as Array<Record<string, unknown>>)
    .filter((block) => block.type === "text" && typeof block.text === "string" && block.text.trim())
    .map((block) => block.text as string);
};

const isHiddenSkillContent = (texts: string[]): boolean =>
  texts.some((text) => text.startsWith(SKILL_CONTENT_PREFIX));

const attachSkillContentToToolCall = (
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

const summarizeStreamMessage = (msg: SessionStreamServerMessage): Record<string, unknown> => {
  if (msg.type === "user") {
    const meta = msg as Record<string, unknown>;
    const content = Array.isArray(msg.message.content) ? msg.message.content : [];
    return {
      type: msg.type,
      isMeta: meta.isMeta === true,
      isSynthetic: meta.isSynthetic === true,
      sourceToolUseID: typeof meta.sourceToolUseID === "string" ? meta.sourceToolUseID : undefined,
      toolUseResult: meta.toolUseResult ?? meta.tool_use_result,
      contentTypes: content.map((block) => block.type),
      textPreview: extractTextFromContent(content)?.slice(0, 120),
    };
  }

  if (msg.type === "assistant") {
    return {
      type: msg.type,
      messageId: msg.message.id,
      contentTypes: msg.message.content.map((block) => block.type),
      toolUseIds: msg.message.content
        .filter((block) => block.type === "tool_use")
        .map((block) => ("id" in block ? block.id : undefined)),
    };
  }

  if (msg.type === "system") {
    return {
      type: msg.type,
      subtype: msg.subtype,
      session_id: "session_id" in msg ? msg.session_id : undefined,
      task_id: "task_id" in msg ? msg.task_id : undefined,
      status: "status" in msg ? msg.status : undefined,
    };
  }

  return { type: msg.type };
};

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

export function useClaude2Session(
  projectName: string,
  sessionId: string,
  initialModel?: string,
  initialPermissionMode?: string,
) {
  const [rawMessages, setRawMessages] = useState<SessionStreamServerMessage[]>([]);
  const rawMessagesRef = useRef<SessionStreamServerMessage[]>([]);
  const [connectionVersion, setConnectionVersion] = useState(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasOlder, setHasOlder] = useState(false);
  const [currentModel, setCurrentModel] = useState<string | undefined>();
  const [resolvedModel, setResolvedModel] = useState<string | undefined>(initialModel);
  const [modelSwitchVersion, setModelSwitchVersion] = useState(0);
  const [permissionMode, setPermissionMode] = useState<string | undefined>(initialPermissionMode);

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
  const replayBatchRef = useRef<SessionStreamServerMessage[] | null>(null);
  const skipRetryFromReplayRef = useRef(false);
  const compactActiveRef = useRef(false);
  const compactPhaseRef = useRef<"none" | "compacting" | "replay" | "waiting-live">("none");
  const compactInterruptedRef = useRef(false);
  const socketRef = useRef<WebSocket | null>(null);
  const [tasks, setTasks] = useState<TaskInfo[]>([]);
  const [slashCommands, setSlashCommands] = useState<string[]>([]);
  const [skills, setSkills] = useState<string[]>([]);

  const [retryInfo, setRetryInfo] = useState<RetryInfo | null>(null);
  const retryCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const resetSessionState = useCallback(() => {
    setRawMessages([]);
    setTasks([]);
    setSlashCommands([]);
    setSkills([]);
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
    replayBatchRef.current = null;
    compactActiveRef.current = false;
    compactPhaseRef.current = "none";
    compactInterruptedRef.current = false;
    rawMessagesRef.current = [];
  }, [initialModel, initialPermissionMode]);

  useEffect(() => {
    rawMessagesRef.current = rawMessages;
  }, [rawMessages]);

  // Extract latest api_retry from raw messages — replaces on each new retry (merge).
  // Skip replay data — retry from history is stale.
  useEffect(() => {
    if (skipRetryFromReplayRef.current) return;
    let latest: RetryInfo | null = null;
    for (let i = rawMessages.length - 1; i >= 0; i--) {
      const m = rawMessages[i];
      if (m.type === "system" && m.subtype === "api_retry") {
        const r = m as {
          attempt: number;
          max_retries: number;
          retry_delay_ms: number;
          error?: string;
          error_status?: number;
        };
        latest = {
          attempt: r.attempt,
          maxRetries: r.max_retries,
          retryDelayMs: r.retry_delay_ms,
          error: r.error,
          errorStatus: r.error_status,
          startTime: Date.now(),
        };
        break;
      }
    }
    setRetryInfo(latest);
  }, [rawMessages]);

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
        console.log("[claude2-adapter] ws recv", summarizeStreamMessage(msg), msg);

        if (msg.type === "connected") {
          if (rawMessagesRef.current.length === 0) {
            setLoading(false);
          }
          return;
        }

        if (msg.type === "replay_start") {
          replayBatchRef.current = [];
          setLoading(true);
          setIsRunning(false);
          return;
        }
        if (msg.type === "replay_end") {
          const batch = replayBatchRef.current ?? [];
          replayBatchRef.current = null;
          skipRetryFromReplayRef.current = true;
          const merged = reconcileSnapshot(rawMessagesRef.current, batch);
          rawMessagesRef.current = merged;
          setRawMessages(merged);
          skipRetryFromReplayRef.current = false;
          setRetryInfo(null);
          setTasks(deriveTasksFromReplayBatch(merged));
          setIsRunning(computeRunningCount(merged) > 0);
          const replayInit = [...batch]
            .reverse()
            .find((item) => item.type === "system" && item.subtype === "init") as
            | {
                model: string;
                permissionMode: string;
                slash_commands?: string[];
                skills?: string[];
              }
            | undefined;
          if (replayInit) {
            setResolvedModel(replayInit.model);
            setPermissionMode(replayInit.permissionMode);
            setSlashCommands(
              Array.isArray(replayInit.slash_commands) ? replayInit.slash_commands : [],
            );
            setSkills(Array.isArray(replayInit.skills) ? replayInit.skills : []);
            const tiers = ["sonnet", "opus", "haiku"];
            const tier = tiers.find((t) => replayInit.model.includes(t));
            if (tier) setCurrentModel(tier);
          }
          setLoading(false);
          return;
        }
        if (replayBatchRef.current) {
          replayBatchRef.current.push(msg);
          return;
        }

        setLoading(false);
        if (
          msg.type === "assistant" ||
          (msg.type === "system" && msg.subtype === "thinking_tokens")
        ) {
          setIsRunning(true);
        }

        if (isTaskSystemMessage(msg)) {
          setTasks((prev) => applyTaskSystemMessage(prev, msg));
          return;
        }

        if (
          msg.type === "system" &&
          msg.subtype === "status" &&
          "status" in msg &&
          msg.status === "compacting"
        ) {
          compactActiveRef.current = true;
          compactInterruptedRef.current = false;
          compactPhaseRef.current = "compacting";
          if (bridge.onCompact) bridge.onCompact({ phase: "start" });
        }

        if (msg.type === "system" && msg.subtype === "status" && "compact_result" in msg) {
          if (compactActiveRef.current) {
            compactActiveRef.current = false;
            const statusMsg = msg as { compact_result?: string; compact_error?: string };
            if (bridge.onCompact) {
              const failed = statusMsg.compact_result === "failed";
              bridge.onCompact({
                phase: "end",
                error: failed
                  ? compactInterruptedRef.current
                    ? "interrupted"
                    : (statusMsg.compact_error ?? "Compact failed")
                  : undefined,
              });
            }
          }
          compactPhaseRef.current = "replay";
        }

        if (
          msg.type === "system" &&
          (msg.subtype === "compact_boundary" || msg.subtype === "microcompact_boundary")
        ) {
          if (compactPhaseRef.current === "none") {
            compactActiveRef.current = true;
            compactInterruptedRef.current = false;
            compactPhaseRef.current = "compacting";
            if (bridge.onCompact) bridge.onCompact({ phase: "start" });
          }
        }

        if (msg.type === "system" && msg.subtype === "init" && "model" in msg) {
          const init = msg as {
            model: string;
            permissionMode: string;
            slash_commands?: string[];
            skills?: string[];
          };
          setResolvedModel(init.model);
          setPermissionMode(init.permissionMode);
          setSlashCommands(Array.isArray(init.slash_commands) ? init.slash_commands : []);
          setSkills(Array.isArray(init.skills) ? init.skills : []);
          const tiers = ["sonnet", "opus", "haiku"];
          const tier = tiers.find((t) => init.model.includes(t));
          if (tier) setCurrentModel(tier);
        }

        if (msg.type === "switch_model_result") {
          const result = msg as {
            type: "switch_model_result";
            model: string;
            success: boolean;
            error?: string;
          };
          if (!result.success) {
            setCurrentModel(undefined);
            console.error(`[claude2-adapter] model switch failed: ${result.error ?? "unknown"}`);
          }
          setModelSwitchVersion((version) => version + 1);
        }

        if (msg.type === "result") {
          setIsRunning(false);
          if (compactPhaseRef.current === "compacting" || compactPhaseRef.current === "replay") {
            if (compactActiveRef.current) {
              compactActiveRef.current = false;
              if (bridge.onCompact) bridge.onCompact({ phase: "end" });
            }
            compactPhaseRef.current = "waiting-live";
          }
        }

        if (
          compactPhaseRef.current === "waiting-live" &&
          (msg.type === "assistant" || (msg.type === "system" && msg.subtype === "thinking_tokens"))
        ) {
          compactPhaseRef.current = "none";
        }

        if (msg.type === "control_request") {
          const toolName = msg.request?.tool_name;
          if (toolName !== "AskUserQuestion") {
            sendToSocket(buildAllowAllControlResponse(msg.request_id));
            return;
          }

          if (pendingAskRef.current) {
            const updated = injectAskUserQuestionRequestId(
              pendingAskRef.current as AskUserQuestionAssistantMessage,
              msg.request_id,
            );
            pendingAskRef.current = null;
            setRawMessages((prev) => {
              const next = [...prev, updated as SessionStreamServerMessage];
              rawMessagesRef.current = next;
              return next;
            });
          }
          return;
        }

        if (msg.type === "assistant") {
          const assistantMsg = msg as {
            type: "assistant";
            message: {
              model?: string;
              content: Array<{ type: string; name?: string }>;
            };
          };
          if (isSyntheticAssistantMessage(assistantMsg as unknown as SessionStreamServerMessage)) {
            return;
          }

          const hasAsk = assistantMsg.message.content.some(
            (b) => b.type === "tool_use" && b.name === "AskUserQuestion",
          );
          if (hasAsk) {
            pendingAskRef.current = msg;
            return;
          }
        }

        if (pendingAskRef.current) {
          const pendingAsk = pendingAskRef.current;
          pendingAskRef.current = null;
          setRawMessages((prev) => {
            const next = [...prev, pendingAsk];
            rawMessagesRef.current = next;
            return next;
          });
        }

        setRawMessages((prev) => {
          const next = [...prev, msg];
          rawMessagesRef.current = next;
          return next;
        });
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
    reconcileSnapshot,
    sendToSocket,
  ]);

  const threadLikeMessages = useMemo(() => loadMessagesFromRaw(rawMessages), [rawMessages]);

  const loadOlder = useCallback(
    async (cursorOverride?: string | null) => {
      const cursor = cursorOverride ?? cursorRef.current;
      if (!cursor) return;
      try {
        const response = await getAgentSessionMessages(projectName, sessionId, { cursor });
        cursorRef.current = response.pagination.nextCursor;
        setHasOlder(response.pagination.hasOlder);
        setRawMessages((prev) => {
          const next = [...response.messages, ...prev];
          rawMessagesRef.current = next;
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
    loading,
    tasks,
    slashCommands,
    skills,
    retryInfo,
  };
}
