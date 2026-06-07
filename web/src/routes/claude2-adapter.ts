import { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ExternalStoreAdapter, AppendMessage, ThreadMessageLike } from "@assistant-ui/react";
import type { SessionStreamServerMessage } from "@agents-remote/shared";
import { claude2StreamUrl, getAgentSessionMessages } from "../api/client";

export type TaskInfo = {
  id: string;
  agentType?: string;
  workflowName?: string;
  description: string;
  status: "running" | "completed" | "error" | "backgrounded";
  text?: string;
  error?: string;
};

type TaskSystemMessage = Extract<
  SessionStreamServerMessage,
  { type: "system"; subtype: "task_started" | "task_updated" | "task_notification" }
>;

const isTaskSystemMessage = (msg: SessionStreamServerMessage): msg is TaskSystemMessage =>
  msg.type === "system" &&
  "subtype" in msg &&
  (msg.subtype === "task_started" ||
    msg.subtype === "task_updated" ||
    msg.subtype === "task_notification");

export const applyTaskSystemMessage = (prev: TaskInfo[], msg: TaskSystemMessage): TaskInfo[] => {
  const existing = prev.findIndex((t) => t.id === msg.task_id);
  if (existing >= 0) {
    const updated = [...prev];
    const current = updated[existing];

    if (msg.subtype === "task_updated") {
      updated[existing] = {
        ...current,
        status: msg.error ? "error" : msg.isBackgrounded ? "backgrounded" : "running",
        error: msg.error ?? current.error,
      };
      return updated;
    }

    if (msg.subtype === "task_notification") {
      updated[existing] = {
        ...current,
        status: "completed",
        text: msg.text ?? current.text,
      };
      return updated;
    }

    updated[existing] = {
      ...current,
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
      description: msg.text ?? "",
      status: "completed",
      ...(msg.text ? { text: msg.text } : {}),
    },
  ];
};

export const deriveTasksFromReplayBatch = (batch: SessionStreamServerMessage[]): TaskInfo[] => {
  let tasks: TaskInfo[] = [];
  for (const msg of batch) {
    if (!isTaskSystemMessage(msg)) continue;
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
  let count = 0;
  const startedTools = new Set<string>();
  let turnActive = false;

  for (const msg of rawMessages) {
    if (msg.type === "result") {
      count = 0;
      startedTools.clear();
      turnActive = false;
      continue;
    }

    if (msg.type === "assistant") {
      if (!turnActive) {
        count++;
        turnActive = true;
      }
      for (const block of msg.message.content) {
        if (block.type === "tool_use" && "id" in block) {
          startedTools.add(block.id as string);
          count++;
        }
      }
      continue;
    }

    if (msg.type === "system" && "subtype" in msg && msg.subtype === "thinking_tokens") {
      if (!turnActive) {
        count++;
        turnActive = true;
      }
      continue;
    }

    if (msg.type === "user") {
      let hasText = false;
      for (const block of msg.message.content) {
        if (
          block.type === "tool_result" &&
          "tool_use_id" in block &&
          typeof block.tool_use_id === "string"
        ) {
          if (startedTools.has(block.tool_use_id)) {
            startedTools.delete(block.tool_use_id);
            count--;
          }
        }
        if (block.type === "text") {
          hasText = true;
        }
      }
      // User text message marks a new turn boundary. Since disk JSONL has
      // no result messages, user text is the reliable signal that the
      // previous turn completed. Reset all counters.
      if (hasText) {
        count = 0;
        startedTools.clear();
        turnActive = false;
      }
    }
  }

  return count;
}

export function loadMessagesFromRaw(
  rawMessages: SessionStreamServerMessage[],
): ThreadMessageLike[] {
  const messages: ThreadMessageLike[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let currentParts: any[] = [];
  let lastAssistantMsgId: string | null = null;

  // Shared mutable wrapper so reasoning parts created in the same turn all
  // reference the latest estimated_tokens. During live streaming
  // loadMessagesFromRaw re-runs on every rawMessages update, so the
  // reference stays current. During replay the collapsed thinking_tokens
  // (kept by pushBuffer) provides the final count.
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
        const r = msg as {
          attempt: number;
          max_retries: number;
          retry_delay_ms: number;
          error?: string;
          error_status?: number;
        };
        const errorText = r.error ?? `HTTP ${r.error_status ?? "error"}`;
        const retryText = `API 请求失败${r.attempt}/${r.max_retries}：${errorText}，${Math.round(r.retry_delay_ms / 1000)}s 后重试`;
        flushAssistant();
        messages.push({
          role: "system",
          content: [{ type: "text", text: retryText }],
          metadata: { custom: { systemMessageType: "error" } },
        });
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
      // isMeta user messages are CLI-internal. If they have
      // sourceToolUseID, attach the text to the matching tool-call
      // rather than rendering a user bubble. All isMeta messages
      // are skipped regardless.
      const userMeta = msg as Record<string, unknown>;
      if (userMeta.isMeta === true) {
        if (typeof userMeta.sourceToolUseID === "string") {
          const toolUseId = userMeta.sourceToolUseID;
          const metaText = extractTextFromContent(msg.message.content);
          if (metaText) {
            const matchIdx = currentParts.findIndex(
              (p: Record<string, unknown>) =>
                p.type === "tool-call" && "toolCallId" in p && p.toolCallId === toolUseId,
            );
            if (matchIdx >= 0) {
              currentParts = currentParts.map((p, i) =>
                i === matchIdx
                  ? {
                      ...p,
                      metadata: {
                        ...((p as Record<string, unknown>).metadata as Record<string, unknown>),
                        skillContent: metaText,
                      },
                    }
                  : p,
              );
            } else {
              let attached = false;
              for (let j = messages.length - 1; j >= 0; j--) {
                const candidate = messages[j];
                if (candidate.role === "assistant" && Array.isArray(candidate.content)) {
                  const fmIdx = candidate.content.findIndex(
                    (p) =>
                      p.type === "tool-call" &&
                      "toolCallId" in p &&
                      (p as Record<string, string>).toolCallId === toolUseId,
                  );
                  if (fmIdx >= 0) {
                    const updated = [...candidate.content];
                    updated[fmIdx] = {
                      ...updated[fmIdx],
                      metadata: {
                        ...((updated[fmIdx] as Record<string, unknown>).metadata as Record<
                          string,
                          unknown
                        >),
                        skillContent: metaText,
                      },
                    };
                    messages[j] = { ...candidate, content: updated };
                    attached = true;
                    break;
                  }
                }
              }
              if (!attached) {
                console.warn("[claude2-adapter] skillContent: no matching tool-call found", {
                  toolUseId,
                });
              }
            }
          }
        }
        continue;
      }

      const rawContent = msg.message.content as unknown;

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
      const userTexts: string[] = [];

      for (const block of contentBlocks) {
        if (block.type === "text" && typeof block.text === "string" && block.text.trim()) {
          userTexts.push(block.text as string);
        }
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
            // Search backwards for the last assistant message that
            // contains this tool-call. The last message may be a
            // user text ("Continue from where you left off.") that
            // was pushed AFTER the assistant was flushed.
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
              // Tool_use_id not found anywhere — possibly from a
              // different turn. Ignore.
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
        // Find the last tool-call and attach the structured result
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
        if (userTexts.some((text) => text.startsWith("Base directory for this skill:"))) {
          console.warn("[claude2-adapter] skill content fell through to user bubble", {
            userTexts,
            rawMessage: msg,
          });
        }
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
  const isRunning = useMemo(() => {
    return computeRunningCount(rawMessages) > 0;
  }, [rawMessages]);
  const [loading, setLoading] = useState(true);
  const [hasOlder, setHasOlder] = useState(false);
  const [currentModel, setCurrentModel] = useState<string | undefined>();
  const [resolvedModel, setResolvedModel] = useState<string | undefined>(initialModel);
  const [modelSwitchVersion, setModelSwitchVersion] = useState(0);
  // Initialised from REST response for new sessions.
  // system.init overrides when it arrives (for reconnect/switch/resume).
  const [permissionMode, setPermissionMode] = useState<string | undefined>(initialPermissionMode);

  // Sync from REST response when it loads after initial render.
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
  const compactActiveRef = useRef(false);
  const compactPhaseRef = useRef<"none" | "compacting" | "replay" | "waiting-live">("none");
  const compactInterruptedRef = useRef(false);
  const socketRef = useRef<WebSocket | null>(null);
  const [tasks, setTasks] = useState<TaskInfo[]>([]);

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

  // Connect WebSocket and load initial history
  useEffect(() => {
    let cancelled = false;
    const url = claude2StreamUrl(projectName, sessionId);

    // Messages flow entirely through the WebSocket — the server's
    // session relay integrates JSONL history, turn buffers, and live
    // streaming into a single pipeline. No separate REST fetch needed.

    // Open WebSocket for live streaming
    const socket = new WebSocket(url);
    socketRef.current = socket;

    socket.onopen = () => console.log("[claude2-adapter] ws open");

    socket.onmessage = (event) => {
      if (cancelled) return;
      try {
        const raw = event.data as string;
        console.log(`[claude2-adapter] ws recv: ${raw.slice(0, 200)}`);
        const msg = JSON.parse(raw) as SessionStreamServerMessage;

        // ── Session lifecycle ───────────────────────────────────────
        //
        // Message order on connect:
        //   connected → replay_start → [history] → replay_end → [live]
        //
        // connected means transport is established, not that Claude is
        // generating. A fresh session's registry status is "running" but
        // the thread is idle until the user sends a message or live
        // assistant/thinking content arrives.
        if (msg.type === "connected") {
          setTasks([]);
          return;
        }

        // ── Replay batching ──────────────────────────────────────────
        if (msg.type === "replay_start") {
          replayBatchRef.current = [];
          return;
        }
        if (msg.type === "replay_end") {
          const batch = replayBatchRef.current;
          replayBatchRef.current = null;
          if (batch && batch.length > 0) {
            setRawMessages(batch);
            setTasks(deriveTasksFromReplayBatch(batch));
          }
          setLoading(false);
          return;
        }
        // During replay, accumulate instead of processing individually
        if (replayBatchRef.current) {
          replayBatchRef.current.push(msg);
          return;
        }

        // First message outside of replay — initial load complete
        setLoading(false);

        // ── Task system ──────────────────────────────────────────────
        if (isTaskSystemMessage(msg)) {
          setTasks((prev) => applyTaskSystemMessage(prev, msg));
          return;
        }

        // ── compact protocol ────────────────────────────────────────
        //
        // Compact lifecycle (manual /compact):
        //   status:"compacting" → compact_result → [restart] →
        //   compact_boundary (replay marker) → … → result →
        //   [restart] → live assistant
        //
        // Auto compact (context full):
        //   compact_boundary (inline, no preceding status) →
        //   … → result → [restart] → live assistant
        //
        // Phase tracking prevents replay markers from re-triggering
        // the compact indicator and keeps isRunning correct across
        // the restart → replay → restart → live assistant sequence.

        // Phase: manual compact start (status:"compacting")
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
          // Fall through — loadMessagesFromRaw skips non-compact_boundary
          // system messages, so the rendering pipeline is the single filter.
        }

        // Phase: manual compact finished (compact_result)
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
          // isRunning stays true — CLI replays compacted context next
          // Fall through — loadMessagesFromRaw skips non-compact_boundary
          // system messages, so the rendering pipeline is the single filter.
        }

        // Phase: compact_boundary — start if auto compact, skip if replay.
        // compact_boundary IS the CLI's authoritative compact record
        // (persisted to JSONL), so it must flow into rawMessages for chat display.
        if (
          msg.type === "system" &&
          (msg.subtype === "compact_boundary" || msg.subtype === "microcompact_boundary")
        ) {
          if (compactPhaseRef.current === "none") {
            // Auto compact — no preceding status:"compacting"
            compactActiveRef.current = true;
            compactInterruptedRef.current = false;
            compactPhaseRef.current = "compacting";
            if (bridge.onCompact) bridge.onCompact({ phase: "start" });
          }
          // Fall through — message enters rawMessages.
        }

        // ── Session identity from system.init ──────────────────────
        //
        // system.init is the SINGLE source of truth for the current model
        // and permission mode. It arrives:
        //   • New session  — CLI emits its internal defaults (model from
        //                     user config, permissionMode typically "auto")
        //   • Reconnect    — CLI restores both from its JSONL session file
        //                     via --resume and emits them in system.init
        //   • After switch — new process emits the just-applied values
        //
        // We do NOT persist model or permissionMode in our own metadata.
        // The CLI's JSONL session file is the authoritative store; we
        // read the current values exclusively from system.init.
        if (msg.type === "system" && msg.subtype === "init" && "model" in msg) {
          const init = msg as { model: string; permissionMode: string };
          setResolvedModel(init.model);
          setPermissionMode(init.permissionMode);
          // Derive tier name from resolved model (e.g.
          // "claude-sonnet-4-20250514" → "sonnet") so the dropdown
          // checkmark follows the actual running model.
          const tiers = ["sonnet", "opus", "haiku"];
          const tier = tiers.find((t) => init.model.includes(t));
          if (tier) setCurrentModel(tier);
        }

        // ── API retry — flows through to rawMessages as an inline
        // system error in the message stream (handled in loadMessagesFromRaw).

        // ── Server-confirmed model switch ──────────────────────────
        if (msg.type === "switch_model_result") {
          const result = msg as {
            type: "switch_model_result";
            model: string;
            success: boolean;
            error?: string;
          };
          if (result.success) {
            setModelSwitchVersion((v) => v + 1);
          } else {
            console.error(`[claude2-adapter] model switch failed: ${result.error ?? "unknown"}`);
            setCurrentModel(undefined);
            setModelSwitchVersion((v) => v + 1);
          }
        }

        if (msg.type === "result") {
          if (compactPhaseRef.current === "compacting" || compactPhaseRef.current === "replay") {
            // End of compact or replay phase
            if (compactActiveRef.current) {
              compactActiveRef.current = false;
              if (bridge.onCompact) bridge.onCompact({ phase: "end" });
            }
            compactPhaseRef.current = "waiting-live";
          }
        }

        // Phase: live assistant starts after compact replay
        if (
          compactPhaseRef.current === "waiting-live" &&
          (msg.type === "assistant" || (msg.type === "system" && msg.subtype === "thinking_tokens"))
        ) {
          compactPhaseRef.current = "none";
        }

        // ── control_request routing ─────────────────────────────────
        if (msg.type === "control_request") {
          const toolName = msg.request?.tool_name;
          if (toolName !== "AskUserQuestion") {
            sendToSocket({
              type: "control_response",
              response: {
                subtype: "success",
                request_id: msg.request_id,
                response: { behavior: "allow", updatedInput: {} },
              },
            });
            return;
          }

          // AskUserQuestion: inject request_id into buffered assistant
          if (pendingAskRef.current) {
            const assistant = pendingAskRef.current as {
              type: "assistant";
              message: {
                content: Array<{ type: string; name?: string; input: Record<string, unknown> }>;
              };
            };
            const updated = {
              ...assistant,
              message: {
                ...assistant.message,
                content: assistant.message.content.map((block) => {
                  if (block.type === "tool_use" && block.name === "AskUserQuestion") {
                    return {
                      ...block,
                      input: { ...block.input, __controlRequestId: msg.request_id },
                    };
                  }
                  return block;
                }),
              },
            };
            pendingAskRef.current = null;
            setRawMessages((prev) => [...prev, updated as SessionStreamServerMessage]);
          }
          return;
        }

        // ── Buffer assistant with AskUserQuestion ───────────────────
        if (msg.type === "assistant") {
          const assistantMsg = msg as {
            type: "assistant";
            message: {
              model?: string;
              content: Array<{ type: string; name?: string }>;
            };
          };
          // Skip synthetic assistant messages (CLI internal, e.g.
          // compact cancellation notices with model:"<synthetic>")
          if (assistantMsg.message.model === "<synthetic>") return;

          const hasAsk = assistantMsg.message.content.some(
            (b) => b.type === "tool_use" && b.name === "AskUserQuestion",
          );
          if (hasAsk) {
            pendingAskRef.current = msg;
            return;
          }
        }

        // ── Flush stale buffer ─────────────────────────────────────
        if (pendingAskRef.current) {
          setRawMessages((prev) => [...prev, pendingAskRef.current!]);
          pendingAskRef.current = null;
        }

        setRawMessages((prev) => {
          // Dedup: when the relay injects the same user message that onNew
          // already added optimistically, skip the duplicate.
          if (msg.type === "user") {
            const last = prev[prev.length - 1];
            if (
              last &&
              last.type === "user" &&
              JSON.stringify(last.message) === JSON.stringify(msg.message)
            ) {
              return prev;
            }
          }
          return [...prev, msg];
        });
      } catch {
        // skip
      }
    };

    socket.onclose = () => {
      if (!cancelled) {
        setLoading(false);
      }
    };

    socket.onerror = (e) => {
      console.log("[claude2-adapter] ws error", e);
      setLoading(false);
    };

    return () => {
      cancelled = true;
      socket.close();
      socketRef.current = null;
    };
  }, [projectName, sessionId, bridge, sendToSocket]);

  // Convert raw messages to ThreadMessageLike[]
  const threadLikeMessages = useMemo(() => loadMessagesFromRaw(rawMessages), [rawMessages]);

  // Load older messages (prepend to rawMessages)
  const loadOlder = useCallback(async () => {
    const cursor = cursorRef.current;
    if (!cursor) return;
    try {
      const response = await getAgentSessionMessages(projectName, sessionId, { cursor });
      cursorRef.current = response.pagination.nextCursor;
      setHasOlder(response.pagination.hasOlder);
      setRawMessages((prev) => [...response.messages, ...prev]);
    } catch (err) {
      console.error("[loadOlder] error", err);
    }
  }, [projectName, sessionId]);

  // onNew: user sent a message from the composer
  const onNew = useCallback(
    async (message: AppendMessage) => {
      const textContent = (Array.isArray(message.content) ? message.content : [])
        .filter((p) => p.type === "text")
        .map((p) => (p as { text: string }).text)
        .join("\n");

      if (textContent) {
        const userMsg: SessionStreamServerMessage = {
          type: "user",
          message: { role: "user", content: [{ type: "text", text: textContent }] },
        } as SessionStreamServerMessage;
        setRawMessages((prev) => [...prev, userMsg]);
        sendToSocket({
          type: "user",
          message: { role: "user", content: [{ type: "text", text: textContent }] },
        });
      }
    },
    [sendToSocket],
  );

  // onCancel: user interrupted the run — send proper interrupt via SDK protocol
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

  // ExternalStoreAdapter for useExternalStoreRuntime
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
  };
}
