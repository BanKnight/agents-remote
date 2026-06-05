import { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ExternalStoreAdapter, AppendMessage, ThreadMessageLike } from "@assistant-ui/react";
import type { SessionStreamServerMessage } from "@agents-remote/shared";
import { claude2StreamUrl, getAgentSessionMessages } from "../api/client";

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
export function loadMessagesFromRaw(
  rawMessages: SessionStreamServerMessage[],
): ThreadMessageLike[] {
  const messages: ThreadMessageLike[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let currentParts: any[] = [];
  let lastAssistantMsgId: string | null = null;

  const flushAssistant = () => {
    if (currentParts.length > 0) {
      messages.push({ role: "assistant", content: currentParts });
    }
    currentParts = [];
  };

  for (let i = 0; i < rawMessages.length; i++) {
    const msg = rawMessages[i];

    if (msg.type === "system") {
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
          currentParts = [...currentParts, { type: "reasoning" as const, text: block.thinking }];
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
  const [isRunning, setIsRunning] = useState(false);
  const [isLoading] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [currentModel, setCurrentModel] = useState<string | undefined>();
  const [resolvedModel, setResolvedModel] = useState<string | undefined>(initialModel);
  const [modelSwitchVersion, setModelSwitchVersion] = useState(0);
  const [retryState, setRetryState] = useState<{
    attempt: number;
    maxRetries: number;
    delayMs: number;
    error: string;
  } | null>(null);
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
  const compactActiveRef = useRef(false);
  const compactPhaseRef = useRef<"none" | "compacting" | "replay" | "waiting-live">("none");
  const compactInterruptedRef = useRef(false);
  const socketRef = useRef<WebSocket | null>(null);

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
          setIsRunning(true);
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
            setIsRunning(true);
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
          setRetryState(null);
        }

        // ── API retry indicator ────────────────────────────────────
        if (msg.type === "system" && msg.subtype === "api_retry") {
          const r = msg as {
            attempt: number;
            max_retries: number;
            retry_delay_ms: number;
            error?: string;
            error_status?: number;
          };
          setRetryState({
            attempt: r.attempt,
            maxRetries: r.max_retries,
            delayMs: r.retry_delay_ms,
            error: r.error ?? `status ${r.error_status ?? "unknown"}`,
          });
          // Fall through — rawMessages skips system messages, retry is
          // shown via the retryState indicator, not as a chat message.
        }

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
            setIsRunning(false);
            compactPhaseRef.current = "waiting-live";
          } else {
            setIsRunning(false);
          }
        }

        // Phase: live assistant starts after compact replay
        if (
          compactPhaseRef.current === "waiting-live" &&
          (msg.type === "assistant" || (msg.type === "system" && msg.subtype === "thinking_tokens"))
        ) {
          compactPhaseRef.current = "none";
          setIsRunning(true);
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

          // Live assistant response — mark running so the UI shows
          // the stop button and three-dot streaming indicator.
          if (compactPhaseRef.current === "none") {
            setIsRunning(true);
          }

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

        // Skip text-only user messages (echo of our own messages).
        if (msg.type === "user") {
          const rawContent = (msg as { type: "user"; message: { content: unknown } }).message
            .content;
          if (typeof rawContent === "string") {
            // Command output (e.g. /compact result) — let it through.
          } else {
            const blocks = rawContent as Array<{ type: string }>;
            const hasToolResults = blocks.some((b) => b.type === "tool_result");
            if (!hasToolResults) return;
          }
        }

        setRawMessages((prev) => [...prev, msg]);
      } catch {
        // skip
      }
    };

    socket.onclose = () => {
      if (!cancelled) setIsRunning(false);
    };

    socket.onerror = (e) => console.log("[claude2-adapter] ws error", e);

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
        setIsRunning(true);
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
    setIsRunning(false);
  }, [sendToSocket]);

  // ExternalStoreAdapter for useExternalStoreRuntime
  const storeAdapter = useMemo<ExternalStoreAdapter<ThreadMessageLike>>(
    () => ({
      messages: threadLikeMessages,
      isRunning,
      isLoading,
      convertMessage: (m: ThreadMessageLike) => m,
      onNew,
      onCancel,
    }),
    [threadLikeMessages, isRunning, isLoading, onNew, onCancel],
  );

  return {
    storeAdapter,
    bridge,
    hasOlder,
    loadOlder,
    currentModel,
    resolvedModel,
    modelSwitchVersion,
    retryState,
    permissionMode,
  };
}
