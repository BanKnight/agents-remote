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

type Resolver = (result: IteratorResult<ChatModelRunResult, void>) => void;

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
        // The tool_name is nested under msg.request, NOT at top level.
        //
        // Bash / Write / Read etc.: auto-allow (send empty control_response).
        //   Claude executes the tool and emits tool_result + result.
        //
        // AskUserQuestion: do NOT auto-allow. Let it reach convertMessage()
        //   which creates a question card. The user answers interactively,
        //   and the answer is sent back via bridge.respondToControlRequest -> control_response.
        if (msg.type === "control_request") {
          const toolName = msg.request?.tool_name;
          if (toolName !== "AskUserQuestion") {
            console.log(`[claude2-adapter] auto-allowing control_request: ${toolName}`);
            sendToSocket({
              type: "control_response",
              request_id: msg.request_id,
            });
            return;
          }
        }

        const result = convertMessage(msg);
        if (result) {
          console.log(`[claude2-adapter] converted: ${JSON.stringify(result).slice(0, 200)}`);
          state.history.push(result);
          if (state.resolveNext) {
            const resolve = state.resolveNext;
            state.resolveNext = null;
            resolve({ done: false, value: result });
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
        const resolve = state.resolveNext;
        state.resolveNext = null;
        resolve({ done: false, value: { status: { type: "incomplete", reason: "error" } } });
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
    console.log(`[claude2-adapter] ws send: ${raw.slice(0, 200)}`);
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(raw);
    } else {
      socket.addEventListener("open", () => socket.send(raw), { once: true });
    }
  };

  // ── Bridge: the route component provides this via Claude2BridgeContext.
  // AskUserQuestionToolUI consumes it with useContext to send answers back.
  const bridge: Claude2Bridge = {
    respondToControlRequest: (requestId, updatedInput) => {
      const { __controlRequestId: _, ...rest } = updatedInput as Record<string, unknown>;
      const answers = rest.answers as Record<string, string> | undefined;
      sendToSocket({
        type: "control_response",
        request_id: requestId,
        ...(answers ? { answers } : {}),
      });
    },

    cancelControlRequest: (requestId) => {
      sendToSocket({
        type: "control_response",
        request_id: requestId,
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

          while (state.yieldIndex < state.history.length) {
            state.yieldIndex++;
          }

          const result = await new Promise<ChatModelRunResult>((resolve) => {
            state.resolveNext = (r: IteratorResult<ChatModelRunResult, void>) => {
              if (!r.done && r.value) resolve(r.value);
              else resolve({ status: { type: "complete", reason: "stop" } });
            };
          });

          if (options.abortSignal.aborted) return;
          state.yieldIndex = state.history.length;

          if (result.content) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const content = result.content as any[];
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

          if ("status" in result && result.status) {
            yield { content: parts, status: result.status };
            return;
          }

          yield { content: parts };
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
    // ── control_request -> tool-call card ──────────────────────────
    //
    // Create an assistant-ui tool-call card so AskUserQuestionToolUI
    // renders the interactive question form. The card's toolCallId is
    // the control_request's request_id.
    //
    // NOTE: this request_id is DIFFERENT from the tool_use.id in the
    // corresponding assistant message. When Claude echoes the user's
    // answer as a user-message with tool_result, the tool_use_id there
    // matches the original tool_use.id — NOT our request_id. Therefore
    // the stream-echoed tool_result won't auto-match this card. The
    // AskUserQuestionToolUI handles this with local state (localAnswer).
    //
    // __controlRequestId is embedded in args so the tool UI can call
    // respondToControlRequest / cancelControlRequest with the right id.
    const input = { ...msg.request.input, __controlRequestId: msg.request_id };
    return {
      content: [
        {
          type: "tool-call" as const,
          toolCallId: msg.request_id,
          toolName: msg.request.tool_name,
          args: asReadonlyJSON(input),
          argsText: JSON.stringify(input),
        },
      ],
    };
  }
  if (msg.type === "assistant") {
    const parts = msg.message.content
      .filter(
        (block) => block.type === "text" || block.type === "tool_use" || block.type === "thinking",
      )
      // ── Dedup: AskUserQuestion arrives via TWO paths in live stream ──
      //
      // Path A — assistant message with tool_use block (always emitted).
      // Path B — control_request (only when --permission-prompt-tool stdio).
      //
      // We use Path B as the primary card source for live streaming because
      // it carries the request_id needed for control_response (the only way
      // to unblock Claude after --permission-prompt-tool stdio). Filter the
      // tool_use copy here so we don't render two question cards.
      //
      // History path: control_request is NOT persisted to Claude's JSONL
      // (isChatMessage skips it). The load() function above handles
      // AskUserQuestion via tool_use from assistant messages directly,
      // without going through convertMessage(), so this filter does NOT
      // affect history rendering.
      .filter((block) => block.type !== "tool_use" || block.name !== "AskUserQuestion")
      .map((block) => {
        if (block.type === "text") return { type: "text" as const, text: block.text };
        if (block.type === "thinking") return { type: "reasoning" as const, text: block.thinking };
        return {
          type: "tool-call" as const,
          toolCallId: block.id,
          toolName: block.name,
          args: asReadonlyJSON(block.input),
          argsText: JSON.stringify(block.input),
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
