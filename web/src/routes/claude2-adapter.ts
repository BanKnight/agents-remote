import { createContext } from "react";
import type {
  ChatModelAdapter,
  ChatModelRunOptions,
  ChatModelRunResult,
  ThreadHistoryAdapter,
} from "@assistant-ui/react";
import { ExportedMessageRepository } from "@assistant-ui/react";
import type { ThreadMessageLike } from "@assistant-ui/react";
import type { SessionStreamServerMessage } from "@agents-remote/shared";
import { claude2StreamUrl, getAgentSessionMessages } from "../api/client";

// ── Bridge Context ──────────────────────────────────────────────────
//
// AskUserQuestionToolUI renders deep inside the assistant-ui tree and
// needs to send answers back through the WebSocket. Instead of module-
// level singletons (which Vite HMR resets), we use React Context — the
// adapter creates the bridge, the route component provides it, and the
// tool UI consumes it.

export type Claude2Bridge = {
  respondToControlRequest: (requestId: string, updatedInput: Record<string, unknown>) => void;
  cancelControlRequest: (requestId: string) => void;
  sendToolResult: (toolUseId: string, content: string) => void;
};

export const Claude2BridgeContext = createContext<Claude2Bridge | null>(null);

type Resolver = () => void;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asReadonlyJSON = (v: Record<string, unknown>): any => v;

type ConnectionState = {
  socket: WebSocket;
  /** Converted messages for the live-stream generator. */
  history: ChatModelRunResult[];
  yieldIndex: number;
  resolveNext: Resolver | null;
  aborted: boolean;
  closed: boolean;
  /** Buffered assistant message containing AskUserQuestion tool_use.
   * Held until the matching control_request arrives (which carries the
   * request_id needed for the bridge). Flushed immediately when the next
   * non-control_request message arrives (card renders without submit
   * button — gracefully degraded). */
  bufferedAssistant: ChatModelRunResult | null;
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
export function loadMessagesFromRaw(
  rawMessages: SessionStreamServerMessage[],
): ThreadMessageLike[] {
  const messages: ThreadMessageLike[] = [];
  let currentParts: NonNullable<ChatModelRunResult["content"]> = [];
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
          if ((block as { is_error?: boolean }).is_error) continue;
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
            (p) => p.type === "tool-call" && "toolCallId" in p && p.toolCallId === toolUseId,
          );
          if (toolUseId && matchIdx >= 0) {
            currentParts = currentParts.map((p, i) =>
              i === matchIdx ? { ...p, result: resultText } : p,
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
                  currentParts = currentParts.map((p, i) =>
                    i === flushedMatchIdx ? { ...p, result: resultText } : p,
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

export function createClaude2Adapters(projectName: string, sessionId: string) {
  const url = claude2StreamUrl(projectName, sessionId);

  let conn: ConnectionState | null = null;

  const getConnection = (): ConnectionState => {
    if (
      conn &&
      (conn.socket.readyState === WebSocket.OPEN ||
        conn.socket.readyState === WebSocket.CONNECTING) &&
      !conn.aborted
    ) {
      return conn;
    }

    if (conn) {
      conn.aborted = true;
      conn.socket.close();
    }

    const socket = new WebSocket(url);
    const state: ConnectionState = {
      socket,
      history: [],
      yieldIndex: 0,
      resolveNext: null,
      aborted: false,
      closed: false,
      bufferedAssistant: null,
    };

    socket.onopen = () => {
      console.log("[claude2-adapter] ws open");
    };

    socket.onmessage = (event) => {
      if (state.aborted) return;
      try {
        const raw = event.data as string;
        console.log(`[claude2-adapter] ws recv: ${raw.slice(0, 200)}`);
        const msg = JSON.parse(raw) as SessionStreamServerMessage;

        // ── control_request routing ─────────────────────────────────
        //
        // --permission-prompt-tool stdio routes permission-type tools
        // (Bash, Write, AskUserQuestion, etc.) as control_request on stdout.
        //
        // Non-AskUserQuestion tools (Bash, Write, Read, etc.):
        //   Auto-allow immediately. Claude executes the tool, emits
        //   tool_result + assistant + result through the normal message
        //   stream. The tool_use in the assistant message already carries
        //   the correct tool_use.id for tool_result matching.
        //
        // AskUserQuestion:
        //   The assistant message with the AskUserQuestion tool_use is
        //   buffered (see below). When the control_request arrives, we
        //   inject the request_id into the buffered tool-call's args
        //   and flush it. This ensures:
        //
        //   - Card toolCallId = tool_use.id (matches tool_result echo,
        //     server-driven state, no optimistic update).
        //   - request_id lives only in args.__controlRequestId for the
        //     bridge to send control_response — it's an RPC transient,
        //     not a persistent message ID.
        if (msg.type === "control_request") {
          const toolName = msg.request?.tool_name;
          if (toolName !== "AskUserQuestion") {
            console.log(`[claude2-adapter] auto-allowing control_request: ${toolName}`);
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

          // AskUserQuestion: inject request_id into buffered assistant.
          if (state.bufferedAssistant) {
            const content = state.bufferedAssistant.content;
            if (Array.isArray(content)) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const updated = content.map((p: any) => {
                if (
                  p.type === "tool-call" &&
                  p.toolName === "AskUserQuestion" &&
                  (!p.args?.__controlRequestId || p.args.__controlRequestId === "")
                ) {
                  return {
                    ...p,
                    args: { ...p.args, __controlRequestId: msg.request_id },
                    argsText: JSON.stringify({
                      ...p.args,
                      __controlRequestId: msg.request_id,
                    }),
                  };
                }
                return p;
              });
              state.history.push({ content: updated });
            }
            state.bufferedAssistant = null;
            if (state.resolveNext) {
              state.resolveNext();
              state.resolveNext = null;
            }
          }
          return;
        }

        // ── Buffer assistant messages with AskUserQuestion ─────────
        //
        // When an assistant message contains AskUserQuestion tool_use,
        // hold it until the control_request arrives. The control_request
        // carries the request_id needed for bridge.respondToControlRequest.
        // Once injected, a single message is pushed to history — one
        // bubble, one yield, one card with the correct toolCallId
        // (= tool_use.id) and __controlRequestId for the bridge.
        //
        // If the next message is NOT a control_request (edge case: Claude
        // running in a mode that doesn't emit control_request), flush the
        // buffer immediately — card renders without submit button.
        if (msg.type === "assistant") {
          const hasAskUserQuestion = msg.message?.content?.some(
            (b: { type: string; name?: string }) =>
              b.type === "tool_use" && b.name === "AskUserQuestion",
          );
          if (hasAskUserQuestion) {
            const result = convertMessage(msg);
            if (result) {
              console.log(`[claude2-adapter] buffered assistant with AskUserQuestion`);
              state.bufferedAssistant = result;
            }
            return;
          }
        }

        // ── Flush stale buffer ─────────────────────────────────────
        //
        // If a buffered assistant hasn't been matched by a control_request
        // yet (unlikely but possible), flush it now so the question text
        // isn't lost.
        if (state.bufferedAssistant) {
          console.log(`[claude2-adapter] flushing stale buffer`);
          state.history.push(state.bufferedAssistant);
          state.bufferedAssistant = null;
          if (state.resolveNext) {
            state.resolveNext();
            state.resolveNext = null;
          }
        }

        const result = convertMessage(msg);
        if (result) {
          console.log(`[claude2-adapter] converted: ${JSON.stringify(result).slice(0, 200)}`);
          state.history.push(result);
          if (state.resolveNext) {
            state.resolveNext();
            state.resolveNext = null;
          }
        }
      } catch {
        // skip
      }
    };

    socket.onclose = () => {
      console.log("[claude2-adapter] ws close");
      if (state.aborted) return;
      state.closed = true;
      if (state.resolveNext) {
        state.history.push({ status: { type: "incomplete", reason: "error" } });
        state.resolveNext();
        state.resolveNext = null;
      }
    };

    socket.onerror = (e) => {
      console.log("[claude2-adapter] ws error", e);
    };

    conn = state;
    return state;
  };

  const sendToSocket = (data: unknown) => {
    const { socket } = getConnection();
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
    } else {
      console.error(`[claude2-adapter] ws not open, readyState=${socket.readyState}, cannot send`);
    }
  };

  // ── Bridge: the route component provides this via Claude2BridgeContext.
  // AskUserQuestionToolUI consumes it with useContext to send answers back.
  const bridge: Claude2Bridge = {
    respondToControlRequest: (requestId, updatedInput) => {
      const { __controlRequestId: _, ...rest } = updatedInput as Record<string, unknown>;
      const answers = rest.answers as Record<string, string> | undefined;
      console.log(
        `[claude2-adapter] bridge.respondToControlRequest requestId=${requestId} hasAnswers=${!!answers}`,
      );
      // Claude SDK format: answers go directly into updatedInput,
      // NOT nested under {answers: {...}}. Claude shallow-merges
      // updatedInput into the tool's original input. If we nest answers,
      // the AskUserQuestion handler loses the `questions` array.
      sendToSocket({
        type: "control_response",
        response: {
          subtype: "success",
          request_id: requestId,
          response: {
            behavior: "allow",
            updatedInput: (answers ?? {}) as Record<string, unknown>,
          },
        },
      });
    },

    cancelControlRequest: (requestId) => {
      console.log(`[claude2-adapter] bridge.cancelControlRequest requestId=${requestId}`);
      sendToSocket({
        type: "control_response",
        response: {
          subtype: "success",
          request_id: requestId,
          response: {
            behavior: "deny",
            message: "User skipped",
          },
        },
      });
    },

    sendToolResult: (toolUseId, content) => {
      sendToSocket({
        type: "user",
        message: {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: toolUseId, content }],
        },
      } as Record<string, unknown>);
    },
  };

  // ── History adapter (ThreadHistoryAdapter) ───────────────────────────

  const historyAdapter: ThreadHistoryAdapter = {
    async load() {
      let rawMessages: SessionStreamServerMessage[] = [];
      try {
        const response = await getAgentSessionMessages(projectName, sessionId);
        rawMessages = response.messages;
      } catch {
        // If REST fails (e.g. session not ready), start with empty history.
      }

      const messages = loadMessagesFromRaw(rawMessages);

      getConnection();

      return ExportedMessageRepository.fromArray(messages);
    },

    async append() {
      // CLI handles persistence via JSONL. No client-side write needed.
    },
  };

  // ── Chat adapter (ChatModelAdapter) ──────────────────────────────────

  const chatAdapter: ChatModelAdapter = {
    async *run(options: ChatModelRunOptions): AsyncGenerator<ChatModelRunResult, void> {
      const lastUserMsg = options.messages.filter((m) => m.role === "user").at(-1);
      if (lastUserMsg?.role === "user") {
        const textPart = lastUserMsg.content.find((p) => p.type === "text");
        if (textPart?.type === "text") {
          sendToSocket({
            type: "user",
            message: { role: "user", content: [{ type: "text", text: textPart.text }] },
          });
        }
      }

      const onAbort = () => {
        sendToSocket({
          type: "user",
          message: { role: "user", content: [{ type: "text", text: "" }] },
        });
      };
      options.abortSignal.addEventListener("abort", onAbort, { once: true });

      const state = getConnection();

      let parts: NonNullable<ChatModelRunResult["content"]> = [];

      try {
        while (true) {
          if (options.abortSignal.aborted) return;
          if (state.closed) return;

          // Wait for at least one new item if nothing is pending.
          // Claude may emit multiple messages in quick succession
          // (e.g. tool_result echo → assistant text → result) after
          // a control_response. If we only process one per promise
          // resolution, intervening messages arrive while resolveNext
          // is null and get stuck in history — never yielded.
          if (state.yieldIndex >= state.history.length) {
            await new Promise<void>((resolve) => {
              state.resolveNext = () => resolve();
            });
            if (options.abortSignal.aborted) return;
          }

          // Drain ALL pending items in a tight loop so rapid-fire
          // messages are all yielded before we block again.
          while (state.yieldIndex < state.history.length) {
            const item = state.history[state.yieldIndex];
            state.yieldIndex++;

            if (item.content) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const content = item.content as any[];
              const toolResults = content.filter((p) => p.type === "tool-result");
              const nonReasoning = content.filter(
                (p: { type: string }) => p.type !== "reasoning" && p.type !== "tool-result",
              );
              const latestReasoning = content
                .filter((p: { type: string }) => p.type === "reasoning")
                .at(-1);

              for (const tr of toolResults) {
                const trPart = tr as { toolCallId: string; result: string };
                parts = parts.map((p) => {
                  if (
                    p.type === "tool-call" &&
                    "toolCallId" in p &&
                    (p as { toolCallId: string }).toolCallId === trPart.toolCallId
                  ) {
                    return { ...p, result: trPart.result } as typeof p;
                  }
                  return p;
                });
              }

              parts = [...parts.filter((p) => p.type !== "reasoning"), ...nonReasoning];
              if (latestReasoning) parts = [...parts, latestReasoning];
            }

            if ("status" in item && item.status) {
              yield { content: parts, status: item.status };
              return;
            }

            yield { content: parts };
          }
        }
      } finally {
        options.abortSignal.removeEventListener("abort", onAbort);
      }
    },
  };

  return { chatAdapter, historyAdapter, bridge };
}

function convertMessage(msg: SessionStreamServerMessage): ChatModelRunResult | null {
  if (msg.type === "error") {
    return { status: { type: "incomplete", reason: "error" } };
  }
  if (msg.type === "ended") {
    return null;
  }
  if (msg.type === "control_request") {
    // control_request is handled in onmessage, not here.
    // For AskUserQuestion: onmessage injects request_id into the buffered
    // assistant message and pushes a single merged result.
    // For other tools: onmessage auto-allows.
    return null;
  }
  if (msg.type === "assistant") {
    const parts = msg.message.content
      .filter(
        (block) => block.type === "text" || block.type === "tool_use" || block.type === "thinking",
      )
      .map((block) => {
        if (block.type === "text") return { type: "text" as const, text: block.text };
        if (block.type === "thinking") return { type: "reasoning" as const, text: block.thinking };
        // tool_use block — toolCallId = tool_use.id matches tool_result.tool_use_id
        // for server-driven state updates (no optimistic setLocalAnswer).
        //
        // AskUserQuestion: __controlRequestId starts as "" placeholder.
        // The onmessage handler injects the real request_id when the
        // control_request arrives (before the message is pushed to history).
        // In loaded history (JSONL), control_request is absent, so the
        // placeholder stays — but the bridge is unused for history viewing.
        const isAsk = block.name === "AskUserQuestion";
        const input = isAsk ? { ...block.input, __controlRequestId: "" } : block.input;
        return {
          type: "tool-call" as const,
          toolCallId: block.id,
          toolName: block.name,
          args: asReadonlyJSON(input),
          argsText: JSON.stringify(input),
        };
      });
    if (parts.length > 0) {
      return { content: parts };
    }
    return null;
  }
  if (msg.type === "user") {
    // ── tool_result echo from Claude ───────────────────────────────
    //
    // When Claude completes a tool, it echoes a user message containing
    // the tool_result on stdout. We convert these into tool-result parts
    // so the run() generator can match them to tool-call cards by toolCallId.
    //
    // is_error tool_results are skipped: Claude auto-generates these when
    // an AskUserQuestion is auto-allowed without real answers (12ms after
    // the control_request). They carry no useful content.
    const parts = msg.message.content
      .filter((block) => block.type === "tool_result")
      .flatMap((block) => {
        if (block.type !== "tool_result") return [];
        if ((block as { is_error?: boolean }).is_error) return [];
        const texts =
          typeof block.content === "string"
            ? block.content
            : (block.content as Array<{ type: string; text: string }>)
                .filter((c) => c.type === "text")
                .map((c) => c.text)
                .join("\n");
        return [
          {
            type: "tool-result" as const,
            toolCallId: (block as { tool_use_id: string }).tool_use_id,
            result: texts || `Tool result`,
          },
        ];
      });
    if (parts.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { content: parts as any };
    }
    return null;
  }
  if (msg.type === "result") {
    const resultStatus =
      msg.subtype === "success"
        ? ({ type: "complete", reason: "stop" } as const)
        : msg.subtype === "interrupted"
          ? ({ type: "incomplete", reason: "cancelled" } as const)
          : ({ type: "incomplete", reason: "error" } as const);
    return { status: resultStatus };
  }
  return null;
}
