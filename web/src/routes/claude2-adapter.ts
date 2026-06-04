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
  onCompact: ((phase: "start" | "end") => void) | null;
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

    if (msg.type === "system") continue;

    if (msg.type === "user") {
      const userTexts: string[] = [];

      for (const block of msg.message.content) {
        if (block.type === "text" && block.text.trim()) {
          userTexts.push(block.text);
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
      const msgId = msg.message?.id as string | undefined;
      if (msgId && msgId !== lastAssistantMsgId) {
        flushAssistant();
        lastAssistantMsgId = msgId;
      }
      for (const block of msg.message.content) {
        if (block.type === "text") {
          currentParts = [...currentParts, { type: "text" as const, text: block.text }];
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
      flushAssistant();
      lastAssistantMsgId = null;
      continue;
    }
  }

  flushAssistant();
  return messages;
}

export function useClaude2Session(projectName: string, sessionId: string) {
  const [rawMessages, setRawMessages] = useState<SessionStreamServerMessage[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasOlder, setHasOlder] = useState(false);

  const cursorRef = useRef<string | null>(null);
  const pendingAskRef = useRef<SessionStreamServerMessage | null>(null);
  const compactActiveRef = useRef(false);
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
        sendToSocket({ type: "switch_model", model });
      },
      onCompact: null,
    }),
    [sendToSocket],
  );

  // Connect WebSocket and load initial history
  useEffect(() => {
    let cancelled = false;
    const url = claude2StreamUrl(projectName, sessionId);

    // Load initial history from REST
    getAgentSessionMessages(projectName, sessionId)
      .then((response) => {
        if (cancelled) return;
        setRawMessages(response.messages);
        setHasOlder(response.pagination.hasOlder);
        cursorRef.current = response.pagination.nextCursor;
        setIsLoading(false);
      })
      .catch(() => {
        if (!cancelled) setIsLoading(false);
      });

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
        if (
          msg.type === "system" &&
          (msg.subtype === "compact_boundary" || msg.subtype === "microcompact_boundary")
        ) {
          compactActiveRef.current = true;
          if (bridge.onCompact) bridge.onCompact("start");
          return;
        }
        if (msg.type === "result") {
          setIsRunning(false);
          if (compactActiveRef.current) {
            compactActiveRef.current = false;
            if (bridge.onCompact) bridge.onCompact("end");
          }
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
            message: { content: Array<{ type: string; name?: string }> };
          };
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

        // Skip text-only user messages (echo of our own messages)
        if (msg.type === "user") {
          const userMsg = msg as { type: "user"; message: { content: Array<{ type: string }> } };
          const hasToolResults = userMsg.message.content.some((b) => b.type === "tool_result");
          if (!hasToolResults) return;
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

  // onCancel: user interrupted the run
  const onCancel = useCallback(async () => {
    sendToSocket({
      type: "user",
      message: { role: "user", content: [{ type: "text", text: "" }] },
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

  return { storeAdapter, bridge, hasOlder, loadOlder };
}
