import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useExternalStoreRuntime } from "@assistant-ui/react";
import type { AppendMessage, ExternalStoreAdapter, ThreadMessageLike } from "@assistant-ui/react";
import type { AcpStreamServerMessage } from "@agents-remote/shared";
import { acpStreamUrl } from "../api/client";
import { isConnectionFresh } from "./console-model";
import { HEARTBEAT_INTERVAL_MS, PONG_TIMEOUT_MS } from "../lib/ws-heartbeat";

// ── ACP 消息形状（局部类型解码；ACP schema 类型只在 api 端存在（官方 SDK），shared 只
// 声明外层帧协议）── 对齐 @agentclientprotocol/sdk schema v1（SessionUpdate 变体子集解码）。

/** ACP tool_call content[] 三形态（content/diff/terminal）——PoC 只消费 text 形态做 result，
 *  diff/terminal 折叠为占位行（Phase 2/3 深渲染）。协议 text 形态 = {type:"content",
 *  content:{type:"text",text}}（嵌套），text 直挂是宽兜底（字段漂移防御）。 */
type AcpToolCallContent = {
  type: string;
  text?: string;
  content?: { type?: string; text?: string };
  path?: string;
  oldText?: string | null;
  newText?: string | null;
};

type AcpChunkUpdate = {
  sessionUpdate: "user_message_chunk" | "agent_message_chunk" | "agent_thought_chunk";
  content: { type: string; text?: string };
  messageId?: string | null;
};

type AcpToolCallUpdate = {
  sessionUpdate: "tool_call" | "tool_call_update";
  toolCallId: string;
  title?: string;
  name?: string | null;
  kind?: string;
  status?: "pending" | "in_progress" | "completed" | "failed";
  content?: AcpToolCallContent[];
};

/** 会话配置选项（model/mode/thinking…，agent 广告的原生形状局部解码）。label/描述全是
 *  agent 数据，不 i18n。 */
export type AcpConfigOption = {
  id: string;
  name: string;
  currentValue?: string;
  options: { value: string; name: string; description?: string }[];
};

/** 宽进解码（字段漂移防御）：只收 select 型（type 缺省同 select——omp 当前全为 select）；
 *  id/name 必需，options 元素缺 value/name 丢弃，清空后整项丢弃（空菜单选择器是噪音）。 */
export function decodeAcpConfigOptions(raw: readonly Record<string, unknown>[]): AcpConfigOption[] {
  const out: AcpConfigOption[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const { type, id, name, currentValue, options } = item;
    if (type !== undefined && type !== "select") continue;
    if (typeof id !== "string" || !id || typeof name !== "string" || !name) continue;
    const decoded: AcpConfigOption["options"] = [];
    if (Array.isArray(options)) {
      for (const o of options) {
        if (typeof o !== "object" || o === null) continue;
        const rec = o as Record<string, unknown>;
        if (typeof rec.value !== "string" || typeof rec.name !== "string") continue;
        decoded.push({
          value: rec.value,
          name: rec.name,
          ...(typeof rec.description === "string" ? { description: rec.description } : {}),
        });
      }
    }
    if (decoded.length === 0) continue;
    out.push({
      id,
      name,
      ...(typeof currentValue === "string" ? { currentValue } : {}),
      options: decoded,
    });
  }
  return out;
}

// ── state 模型（raw 日志 + 派生渲染，State/Render 分离——CLAUDE.md 数据流原则）──────
//
// Pass 1（applyAcpFrame）：帧进唯一 state 有序日志 AcpRawItem[]，标量 state（isRunning）由
// hook 层就地更新。chunk 按 messageId 聚合（同 ID 累积/无 ID 就近）、tool_call 按 toolCallId
// upsert——关联在 state 层用有序关系表达。
// Pass 2（useMemo 纯函数 acpFramesToThreadMessages）：raw 派生 ThreadMessageLike[]。

export type AcpRawItem =
  | { kind: "echo"; text: string; uuid: string; confirmed: boolean }
  | {
      kind: "message";
      messageId: string | null;
      role: "user" | "assistant";
      /** assistant 的流式分区：text/thinking 各保留一条，chunk 追加进对应分区。 */
      sections: { type: "text" | "thinking"; text: string }[];
      final: boolean;
    }
  | {
      kind: "tool_call";
      call: {
        toolCallId: string;
        title: string;
        kind?: string;
        status: "pending" | "in_progress" | "completed" | "failed";
        resultText: string;
        /** turn 已结束（ended）但该 tool 未到终态 → 中断定格（claude applyToolLifecycle
         *  同语义），否则卡片永久 spinner。 */
        interrupted: boolean;
      };
    };

/** user_message_chunk 与 pending echo 文本对齐：命中则确认（复用条目），否则新建
 *  （loadSession 回放历史场景——回放的 user 消息没有对应 echo）。 */
function reconcileUserChunk(
  raw: AcpRawItem[],
  text: string,
  messageId: string | null,
): AcpRawItem[] {
  for (let i = raw.length - 1; i >= 0; i--) {
    const item = raw[i];
    if (item.kind !== "echo") continue;
    if (item.confirmed) break;
    if (item.text === text) {
      const next = [...raw];
      next[i] = { ...item, confirmed: true };
      return next;
    }
    break;
  }
  return [
    ...raw,
    { kind: "message", messageId, role: "user", sections: [{ type: "text", text }], final: true },
  ];
}

/** assistant chunk 归约：尾部同 messageId assistant 条目就近累积（text/thinking 分区），
 *  新 messageId / 无可归并条目 → 新建。 */
function appendAssistantChunk(
  raw: AcpRawItem[],
  variant: "agent_message_chunk" | "agent_thought_chunk",
  chunkType: string,
  chunkText: string,
  messageId: string | null,
): AcpRawItem[] {
  const sectionType: "text" | "thinking" =
    variant === "agent_thought_chunk" ? "thinking" : chunkType === "text" ? "text" : "text";
  const tail = raw[raw.length - 1];
  if (
    tail?.kind === "message" &&
    tail.role === "assistant" &&
    !tail.final &&
    (tail.messageId ?? null) === (messageId ?? null)
  ) {
    const sections = [...tail.sections];
    const last = sections[sections.length - 1];
    if (last && last.type === sectionType) {
      sections[sections.length - 1] = { ...last, text: last.text + chunkText };
    } else {
      sections.push({ type: sectionType, text: chunkText });
    }
    return [...raw.slice(0, -1), { ...tail, sections }];
  }
  return [
    ...raw,
    {
      kind: "message",
      messageId,
      role: "assistant",
      sections: [{ type: sectionType, text: chunkText }],
      final: false,
    },
  ];
}

/** tool_call upsert：toolCallId 命中就地更新（status/title/result 增量语义——省略字段保留，
 *  interrupted 一旦置位不因后续 update 清除），未命中追加（协议允许 update 携带完整态先到）。 */
function upsertToolCall(raw: AcpRawItem[], update: AcpToolCallUpdate): AcpRawItem[] {
  const resultText = toolCallResultText(update.content);
  const patch = {
    toolCallId: update.toolCallId,
    title: update.title ?? "",
    kind: update.kind,
    status: update.status ?? "in_progress",
    resultText,
  };
  for (let i = raw.length - 1; i >= 0; i--) {
    const item = raw[i];
    if (item.kind !== "tool_call" || item.call.toolCallId !== update.toolCallId) continue;
    const next = [...raw];
    next[i] = {
      kind: "tool_call",
      call: {
        ...item.call,
        toolCallId: patch.toolCallId,
        title: patch.title || item.call.title,
        kind: patch.kind ?? item.call.kind,
        status: patch.status,
        resultText: patch.resultText || item.call.resultText,
      },
    };
    return next;
  }
  return [
    ...raw,
    {
      kind: "tool_call",
      call: {
        toolCallId: patch.toolCallId,
        title: patch.title || patch.kind || "tool",
        kind: patch.kind,
        status: patch.status,
        resultText: patch.resultText,
        interrupted: false,
      },
    },
  ];
}

/** tool_call content[] → result 文本：text 形态取嵌套 content.text（协议形状，text 直挂
 *  宽兜底）；diff 折叠 path 头 + 新文本；terminal 占位。 */
function toolCallResultText(content: AcpToolCallContent[] | undefined): string {
  if (!content || content.length === 0) return "";
  return content
    .map((c) => {
      if (c.type === "diff") {
        return `--- ${c.path ?? "file"}\n${c.newText ?? ""}`;
      }
      if (c.type === "terminal") return "[terminal output]";
      return c.content?.text ?? c.text ?? "";
    })
    .filter(Boolean)
    .join("\n");
}

/**
 * Pass 1：单帧进 raw 日志。导出纯函数供单测；hook 内只做 setter 接线。
 * plan / usage_update / available_commands_update / current_mode_update / session_info_update
 * 等：Phase 1 不进消息日志（同 pi-adapter 对 tool_execution_* 的处理——渲染投影不需要）。
 */
export function applyAcpFrame(raw: AcpRawItem[], msg: AcpStreamServerMessage): AcpRawItem[] {
  if (msg.type === "acp_user_echo") {
    const echo = msg as unknown as { type: "acp_user_echo"; text: string; uuid: string };
    return [...raw, { kind: "echo", text: echo.text, uuid: echo.uuid, confirmed: false }];
  }
  if (msg.type === "acp_event") {
    const event = (msg as unknown as { event: Record<string, unknown> }).event;
    const variant = event.sessionUpdate as string | undefined;
    if (!variant) return raw;
    if (variant === "user_message_chunk") {
      const chunk = event as unknown as AcpChunkUpdate;
      return reconcileUserChunk(raw, chunk.content?.text ?? "", chunk.messageId ?? null);
    }
    if (variant === "agent_message_chunk" || variant === "agent_thought_chunk") {
      const chunk = event as unknown as AcpChunkUpdate;
      const text = chunk.content?.text ?? "";
      if (!text) return raw;
      return appendAssistantChunk(
        raw,
        variant,
        chunk.content?.type ?? "text",
        text,
        chunk.messageId ?? null,
      );
    }
    if (variant === "tool_call" || variant === "tool_call_update") {
      return upsertToolCall(raw, event as unknown as AcpToolCallUpdate);
    }
    return raw;
  }
  if (msg.type === "ended") {
    // turn 边界：未终态 assistant 条目定格——下个 turn 的无 messageId chunk 不得就近
    // 累积到上一 turn 的气泡（stopReason 不进消息日志）；未终态 tool_call 标 interrupted
    //（对齐 claude applyToolLifecycle——否则中断后卡片永久 spinner）。
    let changed = false;
    const next = raw.map((item) => {
      if (item.kind === "message" && item.role === "assistant" && !item.final) {
        changed = true;
        return { ...item, final: true };
      }
      if (
        item.kind === "tool_call" &&
        !item.call.interrupted &&
        item.call.status !== "completed" &&
        item.call.status !== "failed"
      ) {
        changed = true;
        return { ...item, call: { ...item.call, interrupted: true } };
      }
      return item;
    });
    return changed ? next : raw;
  }
  return raw;
}

/**
 * Pass 2 纯函数：raw 日志 → ThreadMessageLike[]。
 * - echo（未确认）→ user 气泡（isOptimistic 语义：uuid 作 id，确认后由 message 条目接管）。
 * - message → user/assistant 气泡；text→text part、thinking→reasoning part。
 * - tool_call → role:"system" + metadata.custom tool-card（对齐 claude 的独立 tool 卡片
 *   管道，SystemChatBubble 外层 wrapper 提供边框/背景——与 claude agent 视觉一致）；
 *   completed→result、failed→result+isError、interrupted→isInterrupted、其余运行中呈现。
 */
export function acpFramesToThreadMessages(raw: AcpRawItem[]): ThreadMessageLike[] {
  const messages: ThreadMessageLike[] = [];
  for (const item of raw) {
    if (item.kind === "echo") {
      messages.push({ role: "user", content: item.text, id: `echo-${item.uuid}` });
      continue;
    }
    if (item.kind === "message") {
      const parts = item.sections.map((s) =>
        s.type === "thinking"
          ? { type: "reasoning", text: s.text }
          : { type: "text", text: s.text },
      );
      messages.push({
        role: item.role,
        content: (item.role === "user" ? item.sections.map((s) => s.text).join("\n") : parts) as
          | string
          | ThreadMessageLike["content"],
        ...(item.messageId ? { id: item.messageId } : {}),
      });
      continue;
    }
    const call = item.call;
    const done = call.status === "completed" || call.status === "failed";
    messages.push({
      role: "system",
      content: "",
      id: `tool-${call.toolCallId}`,
      metadata: {
        custom: {
          systemMessageType: "tool-card",
          toolName: call.title || call.kind || "tool",
          toolCallId: call.toolCallId,
          args: {},
          argsText: "",
          ...(done && call.resultText ? { result: call.resultText } : {}),
          ...(call.status === "failed" ? { isError: true } : {}),
          ...(call.interrupted ? { isInterrupted: true } : {}),
          // ACP tool_call 是独立 raw item（无同气泡伴随文本 part）→ 显式关左连接线；
          // toolGroupPosition 连续工具圆角合并留 Phase 2（全 solo 单卡完整边框）。
          toolIndent: false,
          sourceUuids: [],
        },
      },
    });
  }
  return messages;
}

// ── useAcpSession：WS 生命周期（镜像 pi-adapter 样板）+ ACP 数据层 ──────────────

export function useAcpSession(projectName: string, sessionId: string) {
  const [rawMessages, setRawMessages] = useState<AcpRawItem[]>([]);
  // 会话配置选项（latest-wins 标量，不进 raw 消息日志——同 claude 的 model/tasks）。
  const [configOptions, setConfigOptions] = useState<AcpConfigOption[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [streamError, setStreamError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const lastPongRef = useRef(0);
  const [connectionVersion, setConnectionVersion] = useState(0);
  const connectionVersionRef = useRef(0);

  const scheduleReconnect = useCallback(() => {
    setConnectionVersion((v) => v + 1);
  }, []);

  // 前台恢复：lastPong 过期即 half-open，直接 bump 重连（镜像 pi/claude-adapter）。
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
          console.error("[acp-adapter] ws send error", err);
        }
      } else if (socket.readyState === WebSocket.CONNECTING) {
        socket.addEventListener(
          "open",
          () => {
            try {
              socket.send(JSON.stringify(data));
            } catch (err) {
              console.error("[acp-adapter] ws deferred send error", err);
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

  // Pass 1 dispatch：标量就地 set，raw 累积走 applyAcpFrame 纯函数。
  const handleFrame = useCallback((msg: AcpStreamServerMessage) => {
    if (msg.type === "session_init") {
      setRawMessages([]);
      setConfigOptions([]);
      setLoading(true);
      setStreamError(null);
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
      setStreamError((msg as { message?: string }).message ?? "acp stream error");
      setIsRunning(false);
      return;
    }
    if (msg.type === "acp_config") {
      // agent 广告的全量 configOptions（session/new|load|set_config_option 响应）。
      const frame = msg as unknown as { configOptions?: Record<string, unknown>[] };
      setConfigOptions(
        decodeAcpConfigOptions(Array.isArray(frame.configOptions) ? frame.configOptions : []),
      );
      return;
    }
    if (msg.type === "acp_event") {
      const event = (msg as unknown as { event: Record<string, unknown> }).event;
      if (event?.sessionUpdate === "config_option_update") {
        // agent 侧自发变更：latest-wins 折叠，不进 raw 消息日志。
        const options = Array.isArray(event.configOptions)
          ? (event.configOptions as Record<string, unknown>[])
          : [];
        setConfigOptions(decodeAcpConfigOptions(options));
        return;
      }
    }
    setRawMessages((prev) => applyAcpFrame(prev, msg));
  }, []);

  useEffect(() => {
    let cancelled = false;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    // 每次连接重置（session_init 分支也会清，这里是 pre-open 基线）。
    setRawMessages([]);
    setConfigOptions([]);
    setConnected(false);
    setLoading(true);

    const socket = new WebSocket(acpStreamUrl(projectName, sessionId));
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

    // 与 pi/claude-adapter 同构的批处理状态机：history/live 两个窗口内帧缓冲、end marker
    // 时批量 process（真实分帧到达时批量落 state，减少 render 风暴）。
    let historyBatch: AcpStreamServerMessage[] | null = null;
    let liveBatch: AcpStreamServerMessage[] | null = null;

    const processBatch = (batch: AcpStreamServerMessage[]) => {
      for (const msg of batch) handleFrame(msg);
    };
    const processOne = (msg: AcpStreamServerMessage) => handleFrame(msg);

    const handleBinaryBatch = async (buf: ArrayBuffer) => {
      const text = await decompressGzip(buf);
      const target = historyBatch ?? liveBatch;
      if (!target) return;
      if (text.length > 0) {
        for (const line of text.split("\n")) {
          try {
            target.push(JSON.parse(line) as AcpStreamServerMessage);
          } catch {
            // skip malformed line
          }
        }
      }
    };

    const handleTextFrame = (event: MessageEvent) => {
      if (cancelled) return;
      try {
        const msg = JSON.parse(event.data as string) as AcpStreamServerMessage;
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

    // 二进制批（gzip）异步解压——串行 promise chain 保序（镜像 pi-adapter）。
    let blobInFlight = false;
    let chain: Promise<void> = Promise.resolve();
    socket.onmessage = (event) => {
      if (cancelled) return;
      if (event.data instanceof ArrayBuffer) {
        blobInFlight = true;
        chain = chain
          .then(() => handleBinaryBatch(event.data))
          .catch((e) => console.error("[acp-adapter] binary batch error", e))
          .finally(() => {
            blobInFlight = false;
          });
        return;
      }
      if (blobInFlight) {
        chain = chain
          .then(() => handleTextFrame(event))
          .catch((e) => console.error("[acp-adapter] handleFrame error", e));
        return;
      }
      handleTextFrame(event);
    };

    socket.onclose = () => {
      if (!cancelled) {
        socketRef.current = null;
        setConnected(false);
        setLoading(true);
        // 退避重连（pi 用 500ms 固定；这里同值）。
        setTimeout(() => {
          if (!cancelled) {
            connectionVersionRef.current += 1;
            setConnectionVersion(connectionVersionRef.current);
          }
        }, 500);
      }
    };

    socket.onerror = (e) => {
      console.log("[acp-adapter] ws error", e);
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
  }, [projectName, sessionId, connectionVersion, handleFrame]);

  // Pass 2：渲染列表派生。
  const renderedMessages = useMemo(() => acpFramesToThreadMessages(rawMessages), [rawMessages]);

  const onNew = useCallback(
    async (message: AppendMessage) => {
      const textContent = (Array.isArray(message.content) ? message.content : [])
        .filter((p) => p.type === "text")
        .map((p) => (p as { text: string }).text)
        .join("\n");
      if (textContent.trim()) {
        // ACP update 流无「turn 开始」通知：发送即本地置 running（ended/error 归零）。
        setIsRunning(true);
        sendToSocket({ type: "user", text: textContent, uuid: crypto.randomUUID() });
      }
    },
    [sendToSocket],
  );

  const onCancel = useCallback(async () => {
    sendToSocket({ type: "interrupt" });
  }, [sendToSocket]);

  // 会话配置切换（model/mode/thinking…）：错误由服务端转 error 帧 → streamError。
  const setConfig = useCallback(
    (configId: string, value: string) => {
      sendToSocket({ type: "set_config", configId, value });
    },
    [sendToSocket],
  );

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
    storeAdapter,
    isRunning,
    connected,
    loading,
    streamError,
    configOptions,
    setConfig,
    onCancel,
  };
}
