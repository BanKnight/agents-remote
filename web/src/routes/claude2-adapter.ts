import type {
  ChatModelAdapter,
  ChatModelRunOptions,
  ChatModelRunResult,
} from "@assistant-ui/react";
import type { SessionStreamServerMessage } from "@agents-remote/shared";
import { claude2StreamUrl } from "../api/client";

type Resolver = (result: IteratorResult<ChatModelRunResult, void>) => void;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asReadonlyJSON = (v: Record<string, unknown>): any => v;

type ConnectionState = {
  socket: WebSocket;
  history: ChatModelRunResult[];
  yieldIndex: number;
  resolveNext: Resolver | null;
  aborted: boolean;
  closed: boolean;
};

export function createClaude2Adapter(projectName: string, sessionId: string): ChatModelAdapter {
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

    // Close old socket if exists
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

  return {
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

      try {
        while (true) {
          if (options.abortSignal.aborted) return;
          if (state.closed) return;

          // Yield any un-yielded history items first (replay + race-safe)
          if (state.yieldIndex < state.history.length) {
            const result = state.history[state.yieldIndex];
            state.yieldIndex++;
            console.log(
              `[claude2-adapter] yield history[${state.yieldIndex - 1}]: ${JSON.stringify(result).slice(0, 200)}`,
            );
            yield result;
            if ("status" in result && result.status) return;
            continue;
          }

          // Wait for the next live message
          const result = await new Promise<ChatModelRunResult>((resolve) => {
            state.resolveNext = (r: IteratorResult<ChatModelRunResult, void>) => {
              if (!r.done && r.value) resolve(r.value);
              else resolve({ status: { type: "complete", reason: "stop" } });
            };
          });

          if (options.abortSignal.aborted) return;
          // Mark messages up to this one as yielded
          state.yieldIndex = state.history.length;
          console.log(`[claude2-adapter] yield live: ${JSON.stringify(result).slice(0, 200)}`);
          yield result;
          if ("status" in result && result.status) return;
        }
      } finally {
        options.abortSignal.removeEventListener("abort", onAbort);
      }
    },
  };
}

function convertMessage(msg: SessionStreamServerMessage): ChatModelRunResult | null {
  if (msg.type === "error") {
    return { status: { type: "incomplete", reason: "error" } };
  }
  if (msg.type === "ended") {
    return null;
  }
  if (msg.type === "assistant") {
    const parts = msg.message.content
      .filter((block) => block.type === "text" || block.type === "tool_use")
      .map((block) => {
        if (block.type === "text") return { type: "text" as const, text: block.text };
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
  if (msg.type === "result") {
    const resultStatus =
      msg.subtype === "success"
        ? ({ type: "complete", reason: "stop" } as const)
        : msg.subtype === "interrupted"
          ? ({ type: "incomplete", reason: "cancelled" } as const)
          : ({ type: "incomplete", reason: "error" } as const);
    return { status: resultStatus };
  }
  // system, user, connected — skip
  return null;
}
