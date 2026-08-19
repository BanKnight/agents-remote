import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useExternalStoreRuntime } from "@assistant-ui/react";
import type { AppendMessage, ExternalStoreAdapter, ThreadMessageLike } from "@assistant-ui/react";
import type { PiStreamServerMessage } from "@agents-remote/shared";
import { piChatStreamUrl } from "../api/client";
import { isConnectionFresh } from "./console-model";
import { HEARTBEAT_INTERVAL_MS, PONG_TIMEOUT_MS } from "../lib/ws-heartbeat";

// ── pi 消息形状（局部类型解码；pi SDK 类型只在 api 端存在，shared 只声明外层帧）──
// 见 shared/src/index.ts「web 端消费 pi_event 时按需声明局部类型解码」注释。
// 形状与 @earendil-works/pi-ai types.d.ts 的 Message union 对齐（子集解码）。

type PiTextContent = { type: "text"; text: string };
type PiThinkingContent = { type: "thinking"; thinking: string };
type PiImageContent = { type: "image"; data: string; mimeType: string };
type PiToolCall = {
  type: "toolCall";
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type PiUserMessage = {
  role: "user";
  content: string | (PiTextContent | PiImageContent)[];
  timestamp: number;
};

export type PiAssistantMessage = {
  role: "assistant";
  content: (PiTextContent | PiThinkingContent | PiToolCall)[];
  stopReason?: string;
  errorMessage?: string;
  timestamp: number;
};

export type PiToolResultMessage = {
  role: "toolResult";
  toolCallId: string;
  toolName: string;
  content: (PiTextContent | PiImageContent)[];
  isError: boolean;
  timestamp: number;
};

export type PiMessage = PiUserMessage | PiAssistantMessage | PiToolResultMessage;

type PiEvent = { type: string } & Record<string, unknown>;

export type PiUserEchoFrame = { type: "pi_user_echo"; text: string; uuid: string };
export type PiEventFrameMsg = { type: "pi_event"; event: PiEvent };

// ── state 模型（raw 日志 + 派生渲染，State/Render 分离）────────────────
//
// Pass 1（handleFrame）：全部原始帧进唯一 state 有序日志 `rawMessages`（pi_event /
// pi_user_echo 都进，不在此阶段做渲染决策），标量 state（isRunning/connected）就地更新。
// Pass 2（useMemo 纯函数 piFramesToThreadMessages）：从 raw 派生 ThreadMessageLike[]
// 给 assistant-ui。tool_result 按 toolCallId 回填到 assistant 消息的 tool-call part
//（与 claude-adapter applyToolResultsToMessages 同语义，但 pi 的 result 是独立 message
// 而非 content block，天然有序无需倒扫）。

export type PiRawItem =
  | { kind: "echo"; text: string; uuid: string; confirmed: boolean }
  | { kind: "message"; message: PiMessage; final: boolean };

/** message_start{user} 与 pending echo 的文本对齐：命中则确认（复用条目），否则新建。 */
function reconcileUserStart(raw: PiRawItem[], message: PiUserMessage): PiRawItem[] {
  const text = userMessageText(message);
  for (let i = raw.length - 1; i >= 0; i--) {
    const item = raw[i];
    if (item.kind !== "echo") continue;
    if (item.confirmed) break; // 只对齐最近的 pending echo
    if (item.text === text) {
      const next = [...raw];
      next[i] = { ...item, confirmed: true };
      return next;
    }
    break; // 最近一个 pending echo 文本不匹配 → 不再往前找（顺序发送，只对齐尾部）
  }
  return [...raw, { kind: "message", message, final: true }];
}

export function userMessageText(message: PiUserMessage): string {
  if (typeof message.content === "string") return message.content;
  return message.content
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n");
}

/**
 * Pass 2 纯函数：raw 日志 → ThreadMessageLike[]。
 * - echo（未确认）→ user 气泡（isOptimistic 语义：uuid 作 id，确认后由 message 条目接管）。
 * - user/assistant message → 气泡；assistant content 的 TextContent→text part、
 *   ThinkingContent→reasoning part、ToolCall→tool-call part。
 * - toolResult message → 不产气泡，按 toolCallId 回填前文 assistant 的 tool-call part
 *   （result/isError）。
 */
export function piFramesToThreadMessages(raw: PiRawItem[]): ThreadMessageLike[] {
  const messages: ThreadMessageLike[] = [];
  for (const item of raw) {
    if (item.kind === "echo") {
      messages.push({
        role: "user",
        content: item.text,
        id: `echo-${item.uuid}`,
      });
      continue;
    }
    const m = item.message;
    if (m.role === "user") {
      messages.push({ role: "user", content: userMessageText(m) });
      continue;
    }
    if (m.role === "assistant") {
      const parts: unknown[] = [];
      for (const c of m.content) {
        if (c.type === "text") {
          parts.push({ type: "text", text: c.text });
        } else if (c.type === "thinking") {
          parts.push({ type: "reasoning", text: c.thinking });
        } else {
          parts.push({
            type: "tool-call",
            toolCallId: c.id,
            toolName: c.name,
            args: c.arguments,
            argsText: JSON.stringify(c.arguments ?? {}),
          });
        }
      }
      messages.push({
        role: "assistant",
        content: parts as ThreadMessageLike["content"],
      });
      continue;
    }
    // toolResult：回填前文 tool-call part。
    const resultText = m.content
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("\n");
    for (let i = messages.length - 1; i >= 0; i--) {
      const bubble = messages[i];
      if (bubble.role !== "assistant" || !Array.isArray(bubble.content)) continue;
      const idx = (bubble.content as Record<string, unknown>[]).findIndex(
        (p) => p.type === "tool-call" && p.toolCallId === m.toolCallId,
      );
      if (idx === -1) continue;
      const content = (bubble.content as Record<string, unknown>[]).map((p, j) =>
        j === idx ? { ...p, result: resultText, ...(m.isError ? { isError: true } : {}) } : p,
      );
      messages[i] = { ...bubble, content } as unknown as ThreadMessageLike;
      break;
    }
  }
  return messages;
}

// ── usePiSession：WS 生命周期（镜像 claude-adapter 样板）+ pi 数据层 ──────────

/**
 * Pass 1：单帧进 raw 日志（含标量更新）。
 * 导出为纯函数（raw → next raw + isRunning）供单测；hook 内只做 setter 接线。
 */
export function applyPiFrame(raw: PiRawItem[], msg: PiStreamServerMessage): PiRawItem[] {
  if (msg.type === "pi_user_echo") {
    const echo = msg as unknown as PiUserEchoFrame;
    return [...raw, { kind: "echo", text: echo.text, uuid: echo.uuid, confirmed: false }];
  }
  if (msg.type === "pi_event") {
    const event = (msg as unknown as PiEventFrameMsg).event;
    switch (event.type) {
      case "message_start": {
        const message = event.message as unknown as PiMessage;
        if (message.role === "user") {
          return reconcileUserStart(raw, message);
        }
        return [...raw, { kind: "message", message, final: false }];
      }
      case "message_update":
      case "message_end": {
        const message = event.message as unknown as PiMessage;
        // user 消息：start 即终态（echo 文本对齐确认 或 message 条目 final:true）。
        // end 只是流式终态标记——echo + message_start + message_end 三帧都代表同一条
        // user 消息，若尾部已有其表示则幂等保持，否则追加（无 echo 的 server 侧消息）。
        // 之前无条件追加导致 message_end{user} 在已确认的 echo 之后又插一条 → 双气泡。
        if (message.role === "user") {
          const tail = raw[raw.length - 1];
          const tailIsUser =
            tail?.kind === "echo" || (tail?.kind === "message" && tail.message.role === "user");
          if (tailIsUser) return raw;
        }
        // 替换尾部同名消息（streaming 累积 → 终态）。仅 assistant 走累积更新——
        // user/toolResult 不流式（start 即终态），连续多条 toolResult 不能互相覆盖。
        if (message.role === "assistant" && raw.length > 0) {
          const tail = raw[raw.length - 1];
          if (tail.kind === "message" && tail.message.role === "assistant") {
            return [
              ...raw.slice(0, -1),
              { kind: "message", message, final: event.type === "message_end" },
            ];
          }
        }
        return [...raw, { kind: "message", message, final: event.type === "message_end" }];
      }
      default:
        // tool_execution_*/turn_*/agent_*/queue_update 等：Phase 4 不进消息日志
        //（toolCall 状态由 message_end 终态 + toolResult 回填覆盖）。
        return raw;
    }
  }
  return raw;
}

/** agent 活跃判定：收到 pi_event（除 agent_settled）→ running；settled/ended → idle。 */
function eventAffectsRunning(event: PiEvent): boolean | null {
  if (event.type === "agent_start" || event.type === "turn_start") return true;
  if (event.type === "agent_settled") return false;
  return null;
}

export function usePiSession(chatId: string) {
  const [rawMessages, setRawMessages] = useState<PiRawItem[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [streamError, setStreamError] = useState<string | null>(null);
  // LLM 标题（chat_title 帧，live 期推送）。null = 未生成——持久标题由 detail useQuery 的
  // displayName 提供（重启后标题只在 registry 元数据里）。
  const [title, setTitle] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const lastPongRef = useRef(0);
  const [connectionVersion, setConnectionVersion] = useState(0);
  const connectionVersionRef = useRef(0);

  const scheduleReconnect = useCallback(() => {
    setConnectionVersion((v) => v + 1);
  }, []);

  // 前台恢复：lastPong 过期即 half-open，直接 bump 重连（镜像 claude-adapter）。
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      const socket = socketRef.current;
      if (
        socket &&
        socket.readyState === WebSocket.OPEN &&
        !isConnectionFresh(lastPongRef.current)
      ) {
        socket.close();
      } else if (!socket) {
        scheduleReconnect();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [scheduleReconnect]);

  const sendToSocket = useCallback(
    (data: unknown) => {
      const socket = socketRef.current;
      if (!socket) {
        scheduleReconnect();
        return;
      }
      if (socket.readyState === WebSocket.OPEN) {
        if (!isConnectionFresh(lastPongRef.current)) {
          socket.close();
          return;
        }
        try {
          socket.send(JSON.stringify(data));
        } catch (err) {
          console.error("[pi-adapter] ws send error", err);
        }
      } else if (socket.readyState === WebSocket.CONNECTING) {
        socket.addEventListener(
          "open",
          () => {
            try {
              socket.send(JSON.stringify(data));
            } catch (err) {
              console.error("[pi-adapter] ws deferred send error", err);
            }
          },
          { once: true },
        );
      } else {
        scheduleReconnect();
      }
    },
    [scheduleReconnect],
  );

  // Pass 1 dispatch：标量就地 set，raw 累积走 applyPiFrame 纯函数。
  const handleFrame = useCallback((msg: PiStreamServerMessage) => {
    if (msg.type === "session_init") {
      setRawMessages([]);
      setLoading(true);
      setStreamError(null);
      setTitle(null);
      return;
    }
    if (msg.type === "chat_title") {
      setTitle(msg.title);
      return;
    }
    if (msg.type === "history_start" || msg.type === "live_start") return;
    if (msg.type === "history_end") return;
    if (msg.type === "live_end") {
      setLoading(false);
      return;
    }
    if (msg.type === "pong") {
      lastPongRef.current = Date.now();
      return;
    }
    if (msg.type === "ended") {
      setIsRunning(false);
      return;
    }
    if (msg.type === "error") {
      setStreamError((msg as { message?: string }).message ?? "pi stream error");
      return;
    }
    if (msg.type === "pi_event") {
      const event = (msg as unknown as PiEventFrameMsg).event;
      const running = eventAffectsRunning(event);
      if (running !== null) setIsRunning(running);
    }
    setRawMessages((prev) => applyPiFrame(prev, msg));
  }, []);

  useEffect(() => {
    let cancelled = false;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    // 每次连接重置（session_init 分支也会清，这里是 pre-open 基线）。
    setRawMessages([]);
    setConnected(false);
    setLoading(true);

    const socket = new WebSocket(piChatStreamUrl(chatId));
    socket.binaryType = "arraybuffer";
    socketRef.current = socket;

    socket.onopen = () => {
      lastPongRef.current = Date.now();
      setConnected(true);
      heartbeatTimer = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "ping" }));
          if (Date.now() - lastPongRef.current > PONG_TIMEOUT_MS) {
            socket.close();
          }
        }
      }, HEARTBEAT_INTERVAL_MS);
    };

    const decompressGzip = async (buf: ArrayBuffer): Promise<string> => {
      const stream = new Response(buf).body!.pipeThrough(new DecompressionStream("gzip"));
      return await new Response(stream).text();
    };

    // 与 claude-adapter 同构的批处理状态机：history/live 两个窗口内帧缓冲、end marker 时
    // 批量 process（真实分帧到达时批量落 state，减少 render 风暴）。
    let historyBatch: PiStreamServerMessage[] | null = null;
    let liveBatch: PiStreamServerMessage[] | null = null;

    const processBatch = (batch: PiStreamServerMessage[]) => {
      for (const msg of batch) handleFrame(msg);
    };
    const processOne = (msg: PiStreamServerMessage) => handleFrame(msg);

    const handleBinaryBatch = async (buf: ArrayBuffer) => {
      const text = await decompressGzip(buf);
      const target = historyBatch ?? liveBatch;
      if (!target) return;
      if (text.length > 0) {
        for (const line of text.split("\n")) {
          try {
            target.push(JSON.parse(line) as PiStreamServerMessage);
          } catch {
            // skip malformed line
          }
        }
      }
    };

    const handleTextFrame = (event: MessageEvent) => {
      if (cancelled) return;
      try {
        const msg = JSON.parse(event.data as string) as PiStreamServerMessage;
        if (msg.type === "history_start") {
          historyBatch = [];
          return;
        }
        if (msg.type === "history_end") {
          const batch = historyBatch ?? [];
          historyBatch = null;
          processBatch(batch);
          processOne({ type: "history_end" });
          return;
        }
        if (msg.type === "live_start") {
          liveBatch = [];
          return;
        }
        if (msg.type === "live_end") {
          const batch = liveBatch ?? [];
          liveBatch = null;
          processBatch(batch);
          processOne({ type: "live_end" });
          return;
        }
        if (historyBatch) {
          historyBatch.push(msg);
          return;
        }
        if (liveBatch) {
          liveBatch.push(msg);
          return;
        }
        handleFrame(msg);
      } catch {
        // skip
      }
    };

    // 二进制批（gzip）异步解压——串行 promise chain 保序（镜像 claude-adapter）。
    let blobInFlight = false;
    let chain: Promise<void> = Promise.resolve();
    socket.onmessage = (event) => {
      if (cancelled) return;
      if (event.data instanceof ArrayBuffer) {
        blobInFlight = true;
        chain = chain
          .then(() => handleBinaryBatch(event.data))
          .catch((e) => console.error("[pi-adapter] binary batch error", e))
          .finally(() => {
            blobInFlight = false;
          });
        return;
      }
      if (blobInFlight) {
        chain = chain
          .then(() => handleTextFrame(event))
          .catch((e) => console.error("[pi-adapter] handleFrame error", e));
        return;
      }
      handleTextFrame(event);
    };

    socket.onclose = () => {
      if (!cancelled) {
        socketRef.current = null;
        setConnected(false);
        setLoading(true);
        // 退避重连（claude 用 500ms 固定；这里同值）。
        setTimeout(() => {
          if (!cancelled) {
            connectionVersionRef.current += 1;
            setConnectionVersion(connectionVersionRef.current);
          }
        }, 500);
      }
    };

    socket.onerror = (e) => {
      console.log("[pi-adapter] ws error", e);
    };

    return () => {
      cancelled = true;
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
      socket.close();
    };
  }, [chatId, connectionVersion, handleFrame]);

  // Pass 2：渲染列表派生。
  const renderedMessages = useMemo(() => piFramesToThreadMessages(rawMessages), [rawMessages]);

  const onNew = useCallback(
    async (message: AppendMessage) => {
      const textContent = (Array.isArray(message.content) ? message.content : [])
        .filter((p) => p.type === "text")
        .map((p) => (p as { text: string }).text)
        .join("\n");
      if (textContent.trim()) {
        sendToSocket({ type: "user", text: textContent, uuid: crypto.randomUUID() });
      }
    },
    [sendToSocket],
  );

  const onCancel = useCallback(async () => {
    sendToSocket({ type: "interrupt" });
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

  const runtime = useExternalStoreRuntime(storeAdapter);

  return {
    runtime,
    isRunning,
    connected,
    loading,
    streamError,
    title,
    onCancel,
  };
}
