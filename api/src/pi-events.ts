import type { PiEventFrame, PiNativeEventShape } from "@agents-remote/shared";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";

/**
 * pi 事件 → WS 帧的纯函数 normalizer（设计 docs/research/pi-access-options.md §9.1 +
 * workbench-views.md §3.1）。只依赖 `AgentSessionEvent`（pi SDK 导出的事件 union），
 * 产出 shared 的 `PiEventFrame`——pi 的类型不泄漏进 shared 协议。
 *
 * `message_update` 剥离 `assistantMessageEvent` 的 cumulative `partial` 快照：pi 的
 * 真实流上 message_start 提供初始消息、delta 事件累积构建、message_end 提供终态，partial
 * 是每帧冗余且体量最大的部分。这是重实现 pi SDK 未导出的 `toJsonEvent`（modes/json-event.ts:31）
 * ——它只在 modes/ 内部使用、index 不导出。其余事件原样透传。
 */
export function toPiEventFrame(event: AgentSessionEvent): PiEventFrame {
  return { type: "pi_event", event: toPiEventShape(event) };
}

export function toPiEventShape(event: AgentSessionEvent): PiNativeEventShape {
  if (event.type !== "message_update") {
    // turn/agent/agent_settled/tool_execution/compaction/queue_update 等原样透传。
    return event as unknown as PiNativeEventShape;
  }
  // 与 toJsonEvent 同语义：message_update 剥离 assistantMessageEvent.partial，保留 usage。
  const assistant = event.assistantMessageEvent as Record<string, unknown>;
  if (!("partial" in assistant)) {
    return {
      type: "message_update",
      usage: (event.message as { usage?: unknown }).usage,
      assistantMessageEvent: assistant,
    } as unknown as PiNativeEventShape;
  }
  const delta = { ...assistant };
  delete delta.partial;
  return {
    type: "message_update",
    usage: (event.message as { usage?: unknown }).usage,
    assistantMessageEvent: delta,
  } as unknown as PiNativeEventShape;
}

/**
 * pi 事件是否为「turn 真正结束、运行时空闲」的终态信号。只有 `agent_settled` 是 true——
 * `agent_end` 带 willRetry 可能触发自动重试（summarization/compaction），非真正 idle；
 * `turn_end` 只是单轮结束（一个 prompt 可多轮 turn）；`agent_start` 是起点。pi-stream
 * 在收到此事件时发 `{type:"ended"}` 控制帧 + flush 发送队列。
 */
export function isTerminalPiEvent(event: AgentSessionEvent): boolean {
  return event.type === "agent_settled";
}
