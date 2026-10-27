import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useExternalStoreRuntime } from "@assistant-ui/react";
import type { AppendMessage, ExternalStoreAdapter, ThreadMessageLike } from "@assistant-ui/react";
import type { CodexStreamServerMessage } from "@agents-remote/shared";
import { codexStreamUrl } from "../api/client";
import { isConnectionFresh } from "./console-model";
import { HEARTBEAT_INTERVAL_MS, PONG_TIMEOUT_MS } from "../lib/ws-heartbeat";

// ── Codex app-server 消息形状（局部类型解码；生成绑定只在 api 端对照、不入库，shared
// 只声明外层帧协议）── 对齐 `codex app-server generate-ts` 0.163.0 的 ThreadItem 联合与
// 通知 params（真机 fixtures 见 scripts/fixtures/codex-appserver/）。字段一律宽进：
// 缺/错类型按「无此字段」处理，不因 app-server 字段漂移整帧丢弃。

/** ThreadItem 宽进解码（只取本层消费的字段，其余原样忽略）。 */
type CodexItem = {
  id?: string;
  type?: string;
  [key: string]: unknown;
};

/** `item/started|completed` params。 */
type CodexItemEventParams = { item?: CodexItem };

/** `item/agentMessage/delta`、`item/reasoning/summaryTextDelta`、`item/<tool>/outputDelta` params。 */
type CodexDeltaParams = { itemId?: string; delta?: string; summaryIndex?: number };

/** 会话配置快照（服务端 `codex_config` 帧，model/list + thread 回读归一）。 */
export type CodexModelOption = {
  id: string;
  displayName: string;
  supportedReasoningEfforts: string[];
  defaultReasoningEffort: string;
};

export type CodexConfig = {
  models: CodexModelOption[];
  current: { model: string; effort: string | null; approvalPolicy: string; sandbox: string };
};

/** 配置热切换补丁（字段词表同 client message set_config）。 */
export type CodexConfigPatch = {
  model?: string;
  effort?: string;
  approvalPolicy?: string;
  sandbox?: string;
};

// ── state 模型（raw 日志 + 派生渲染，State/Render 分离——CLAUDE.md 数据流原则）──────
//
// Pass 1（applyCodexFrame）：帧进唯一 state 有序日志 CodexRawItem[]，标量 state（isRunning/
// config）由 hook 层就地更新。codex 的 assistant 文本/思考是**不同 item id**（reasoning 与
// agentMessage 各自一条），按 itemId 聚合；tool 条目按 item id upsert——关联在 state 层用
// 有序关系表达。历史回放是服务端合成的 `item/completed` 行（与实时同形），同一条管道消费。
// Pass 2（useMemo 纯函数 codexFramesToThreadMessages）：raw 派生 ThreadMessageLike[]。

type CodexToolStatus = "pending" | "in_progress" | "completed" | "failed";

export type CodexToolCall = {
  toolCallId: string;
  /** tool-ui-registry 的渲染名（Bash/Edit/Write/WebSearch/mcp__server__tool…，未命中走通用卡）。 */
  toolName: string;
  /** renderer 解析的 args JSON 文本（Bash 取 command、Edit/Write 取 file_path）。 */
  argsText: string;
  /** 头部 detail 兜底文本（通用卡 badge/详情用）。 */
  title: string;
  status: CodexToolStatus;
  resultText: string;
  /** turn 已结束（ended）但该 tool 未到终态 → 中断定格（claude applyToolLifecycle 同语义）。 */
  interrupted: boolean;
  /** 审批进行中：`codex:<rpcId>`——tool card 金框 + 允许/拒绝按钮复用 claude 渲染。 */
  controlRequestId?: string;
};

export type CodexRawItem =
  | {
      kind: "echo";
      text: string;
      uuid: string;
      confirmed: boolean;
      /** 确认后绑定 codex item id：item/completed 的 userMessage 同 id 不重复建条目。 */
      messageId?: string;
    }
  | {
      kind: "message";
      messageId: string | null;
      role: "user" | "assistant";
      /** assistant 的流式分区：text/thinking 各保留一条，chunk 追加进对应分区。 */
      sections: { type: "text" | "thinking"; text: string }[];
      final: boolean;
    }
  | { kind: "tool_call"; call: CodexToolCall };

/** userMessage item content[] → 纯文本（只消费 text 形态；image 等 Phase 1 忽略）。 */
function userMessageText(item: CodexItem): string {
  const content = Array.isArray(item.content) ? item.content : [];
  return content
    .map((c) => {
      if (!c || typeof c !== "object") return "";
      const rec = c as Record<string, unknown>;
      return rec.type === "text" && typeof rec.text === "string" ? rec.text : "";
    })
    .filter(Boolean)
    .join("\n");
}

// 以下 upsert 家族均为「可变内核」：就地 mutate 传入数组、返回是否有变化。单帧路径
// （applyCodexFrame）复制一次再进内核维持纯函数语义；批量折加路径（applyCodexFrames）
// 一次复制后逐帧进内核，history 回放 N 帧从 O(N²) 数组复制降为 O(N)。

/** user 条目写入：同 item id 已存在（started→completed）则更新；最近未确认 echo 文本相同则
 *  确认并绑定 id（复用条目）；否则新建（回放的历史 user 消息没有 echo）。 */
function upsertUserMessage(raw: CodexRawItem[], messageId: string | null, text: string): boolean {
  // 已绑定 item id 的 echo（item/started 已确认、item/completed 同 id 再来）：只更新文本，
  // 不再建第二条 user 条目。
  if (messageId) {
    for (let i = raw.length - 1; i >= 0; i--) {
      const item = raw[i];
      if (item.kind !== "echo" || item.messageId !== messageId) continue;
      raw[i] = { ...item, text };
      return true;
    }
  }
  for (let i = raw.length - 1; i >= 0; i--) {
    const item = raw[i];
    if (item.kind !== "message" || item.role !== "user") continue;
    if (!messageId || item.messageId !== messageId) continue;
    raw[i] = {
      ...item,
      sections: [{ type: "text", text }],
      final: true,
    };
    return true;
  }
  for (let i = raw.length - 1; i >= 0; i--) {
    const item = raw[i];
    if (item.kind !== "echo") continue;
    if (item.confirmed) break;
    if (item.text === text) {
      raw[i] = { ...item, confirmed: true, ...(messageId ? { messageId } : {}) };
      return true;
    }
    break;
  }
  raw.push({
    kind: "message",
    messageId,
    role: "user",
    sections: [{ type: "text", text }],
    final: true,
  });
  return true;
}

/** assistant 分区写入：同 itemId 未定格条目就地追加/替换分区；无则新建。 */
function upsertAssistantSection(
  raw: CodexRawItem[],
  messageId: string | null,
  sectionType: "text" | "thinking",
  text: string,
  mode: "append" | "replace",
): boolean {
  // 活跃条目在尾部（流式热路径）：倒序扫 O(距尾)。
  for (let i = raw.length - 1; i >= 0; i--) {
    const item = raw[i];
    if (item.kind !== "message" || item.role !== "assistant") continue;
    // append 模式跳过已定格条目：itemId 漂移为 null 的极端场景下，新 turn 首个 delta
    // 不得并入上一 turn 气泡（ACP 母本同款守卫；replace 模式除外——completed 权威覆盖需命中）。
    if (mode === "append" && item.final) continue;
    if ((item.messageId ?? null) !== messageId) continue;
    const sections = [...item.sections];
    let lastIdx = -1;
    for (let j = sections.length - 1; j >= 0; j--) {
      if (sections[j]!.type === sectionType) {
        lastIdx = j;
        break;
      }
    }
    if (lastIdx >= 0) {
      const last = sections[lastIdx]!;
      sections[lastIdx] = { ...last, text: mode === "append" ? last.text + text : text };
    } else {
      sections.push({ type: sectionType, text });
    }
    raw[i] = { ...item, sections };
    return true;
  }
  raw.push({
    kind: "message",
    messageId,
    role: "assistant",
    sections: [{ type: sectionType, text }],
    final: false,
  });
  return true;
}

/** 定格一条 assistant 条目（item/completed 权威态到达 / turn 边界）。 */
function finalizeAssistant(raw: CodexRawItem[], messageId: string): boolean {
  for (let i = raw.length - 1; i >= 0; i--) {
    const item = raw[i];
    if (
      item.kind === "message" &&
      item.role === "assistant" &&
      item.messageId === messageId &&
      !item.final
    ) {
      raw[i] = { ...item, final: true };
      return true;
    }
  }
  return false;
}

type ToolPatch = Partial<Omit<CodexToolCall, "toolCallId">> & { toolCallId: string };

/** tool 条目 upsert：同 id 就地合并（省略字段保留——started 无 output、completed 才带权威
 *  result；controlRequestId 在审批应答/边界处显式清除）。 */
function upsertToolCall(raw: CodexRawItem[], patch: ToolPatch): boolean {
  const { toolCallId, ...fields } = patch;
  // 活跃条目在尾部（outputDelta 流式热路径）：倒序扫 O(距尾)。
  for (let i = raw.length - 1; i >= 0; i--) {
    const item = raw[i];
    if (item.kind !== "tool_call" || item.call.toolCallId !== toolCallId) continue;
    const call: CodexToolCall = { ...item.call };
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) (call as unknown as Record<string, unknown>)[key] = value;
    }
    raw[i] = { kind: "tool_call", call };
    return true;
  }
  const call: CodexToolCall = {
    toolCallId,
    toolName: fields.toolName ?? fields.title ?? "tool",
    argsText: fields.argsText ?? "",
    title: fields.title ?? "",
    status: fields.status ?? "in_progress",
    resultText: fields.resultText ?? "",
    interrupted: fields.interrupted ?? false,
    ...(fields.controlRequestId ? { controlRequestId: fields.controlRequestId } : {}),
  };
  // 审批帧先于 item/started 到达的兜底路径（实测顺序是 started→approval）：无 toolName 时
  // 先占位，item/started/completed 到达后合并真实字段。
  raw.push({ kind: "tool_call", call });
  return true;
}

/** app-server 工具类 item 状态 → 本层三态（declined = 用户拒绝，按失败红卡呈现）。 */
function mapToolStatus(value: unknown): CodexToolStatus {
  if (value === "completed") return "completed";
  if (value === "failed" || value === "declined") return "failed";
  if (value === "pending") return "pending";
  return "in_progress";
}

/** PatchChangeKind → 单文件变更用 Write 卡（add）还是 Edit 卡（update/delete）。 */
function fileChangeToolName(changes: { kind?: unknown }[]): string {
  if (changes.length === 1) {
    const kind = changes[0]?.kind as { type?: unknown } | undefined;
    if (kind?.type === "add") return "Write";
  }
  return "Edit";
}

/** mcpToolCall → result 文本（error.message 优先；content[].text 拼接；structuredContent
 *  JSON 兜底）。 */
function mcpResultText(item: CodexItem): string {
  const error = item.error as { message?: unknown } | null | undefined;
  if (error && typeof error.message === "string" && error.message) return error.message;
  const result = item.result as
    | { content?: unknown[]; structuredContent?: unknown }
    | null
    | undefined;
  if (!result) return "";
  const parts: string[] = [];
  for (const c of result.content ?? []) {
    if (typeof c === "string") {
      parts.push(c);
    } else if (c && typeof c === "object") {
      const rec = c as Record<string, unknown>;
      if (typeof rec.text === "string") parts.push(rec.text);
      else parts.push(JSON.stringify(rec));
    }
  }
  if (result.structuredContent != null) {
    parts.push(JSON.stringify(result.structuredContent, null, 2));
  }
  return parts.join("\n");
}

/** ThreadItem（工具类）→ tool 条目补丁。非工具类（userMessage/agentMessage/reasoning）返回
 *  null，由调用方分别处理；未知类型也返回 null（不伪造卡片）。 */
function toolPatchFromItem(item: CodexItem): ToolPatch | null {
  const id = typeof item.id === "string" ? item.id : "";
  if (!id) return null;
  const type = typeof item.type === "string" ? item.type : "";
  if (type === "commandExecution") {
    const command = typeof item.command === "string" ? item.command : "";
    const cwd = typeof item.cwd === "string" ? item.cwd : "";
    const exitCode = typeof item.exitCode === "number" ? item.exitCode : null;
    const status = mapToolStatus(item.status);
    const aggregated = typeof item.aggregatedOutput === "string" ? item.aggregatedOutput : "";
    return {
      toolCallId: id,
      toolName: "Bash",
      title: command,
      argsText: JSON.stringify({ command, ...(cwd ? { cwd } : {}) }),
      status: status === "completed" && exitCode !== null && exitCode !== 0 ? "failed" : status,
      ...(aggregated ? { resultText: aggregated } : {}),
    };
  }
  if (type === "fileChange") {
    const changes = (Array.isArray(item.changes) ? item.changes : []).filter(
      (c): c is { path?: unknown; diff?: unknown; kind?: unknown } =>
        typeof c === "object" && c !== null,
    );
    const firstPath = typeof changes[0]?.path === "string" ? changes[0].path : "";
    const resultText = changes
      .map(
        (c) =>
          `--- ${typeof c.path === "string" ? c.path : "file"}\n${typeof c.diff === "string" ? c.diff : ""}`,
      )
      .join("\n");
    return {
      toolCallId: id,
      toolName: fileChangeToolName(changes),
      title: firstPath,
      argsText: firstPath ? JSON.stringify({ file_path: firstPath }) : "",
      status: mapToolStatus(item.status),
      ...(resultText ? { resultText } : {}),
    };
  }
  if (type === "mcpToolCall") {
    const server = typeof item.server === "string" ? item.server : "";
    const tool = typeof item.tool === "string" ? item.tool : "";
    const resultText = mcpResultText(item);
    return {
      toolCallId: id,
      toolName: server && tool ? `mcp__${server}__${tool}` : tool || "mcp",
      title: server && tool ? `${server}/${tool}` : tool,
      argsText: item.arguments != null ? JSON.stringify(item.arguments) : "",
      status: mapToolStatus(item.status),
      ...(resultText ? { resultText } : {}),
    };
  }
  if (type === "dynamicToolCall") {
    const tool = typeof item.tool === "string" ? item.tool : "";
    const contentItems = Array.isArray(item.contentItems) ? item.contentItems : [];
    const resultText = contentItems
      .map((c) => (c && typeof c === "object" ? JSON.stringify(c) : String(c)))
      .join("\n");
    return {
      toolCallId: id,
      toolName: tool || "tool",
      title: tool,
      argsText: item.arguments != null ? JSON.stringify(item.arguments) : "",
      status: mapToolStatus(item.status),
      ...(resultText ? { resultText } : {}),
    };
  }
  if (type === "functionCallOutput") {
    const name = typeof item.name === "string" ? item.name : "tool";
    const output =
      typeof item.output === "string"
        ? item.output
        : item.output != null
          ? JSON.stringify(item.output)
          : "";
    return { toolCallId: id, toolName: name, title: name, status: "completed", resultText: output };
  }
  if (type === "webSearch") {
    const query = typeof item.query === "string" ? item.query : "";
    const results = Array.isArray(item.results) ? item.results : [];
    return {
      toolCallId: id,
      toolName: "WebSearch",
      title: query,
      argsText: query ? JSON.stringify({ query }) : "",
      status: "completed",
      ...(results.length > 0 ? { resultText: JSON.stringify(results, null, 2) } : {}),
    };
  }
  if (type === "imageView") {
    const path = typeof item.path === "string" ? item.path : "";
    return {
      toolCallId: id,
      toolName: "Read",
      title: path,
      argsText: path ? JSON.stringify({ file_path: path }) : "",
      status: "completed",
    };
  }
  if (type === "collabAgentToolCall") {
    const prompt = typeof item.prompt === "string" ? item.prompt : "";
    return {
      toolCallId: id,
      toolName: "Agent",
      title: prompt,
      argsText: prompt ? JSON.stringify({ prompt }) : "",
      status: mapToolStatus(item.status),
    };
  }
  if (type === "plan") {
    const text = typeof item.text === "string" ? item.text : "";
    return {
      toolCallId: id,
      toolName: "Plan",
      title: "Plan",
      status: "completed",
      ...(text ? { resultText: text } : {}),
    };
  }
  if (
    type === "contextCompaction" ||
    type === "enteredReviewMode" ||
    type === "exitedReviewMode" ||
    type === "imageGeneration"
  ) {
    return { toolCallId: id, toolName: type, title: type, status: "completed" };
  }
  return null;
}

/** 审批帧 → tool 条目（itemId 关联金框）。审批参数自带 command/changes，stub 也能成形。 */
function applyApprovalFrame(
  raw: CodexRawItem[],
  frame: Extract<CodexStreamServerMessage, { type: "codex_approval_request" }>,
): boolean {
  const params = frame.item ?? {};
  const itemId = typeof params.itemId === "string" ? params.itemId : "";
  if (!itemId) return false;
  const isFileChange = frame.toolName === "fileChange";
  const command = typeof params.command === "string" ? params.command : "";
  const changes = Array.isArray(params.changes)
    ? (params.changes as { path?: unknown; kind?: unknown }[])
    : [];
  const firstPath = typeof changes[0]?.path === "string" ? changes[0].path : "";
  return upsertToolCall(raw, {
    toolCallId: itemId,
    ...(isFileChange
      ? {
          toolName: fileChangeToolName(changes),
          argsText: firstPath ? JSON.stringify({ file_path: firstPath }) : undefined,
          title: firstPath || undefined,
        }
      : {
          toolName: "Bash",
          argsText: command ? JSON.stringify({ command }) : undefined,
          title: command || undefined,
        }),
    controlRequestId: frame.controlRequestId,
  });
}

/** 审批应答/失效（serverRequest/resolved 或 turn 边界）→ 清除金框。 */
function resolveApproval(raw: CodexRawItem[], controlRequestId: string): boolean {
  let changed = false;
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (item.kind !== "tool_call" || item.call.controlRequestId !== controlRequestId) continue;
    const { controlRequestId: _drop, ...call } = item.call;
    raw[i] = { kind: "tool_call", call };
    changed = true;
  }
  return changed;
}

/**
 * Pass 1 可变内核：就地 mutate raw、返回是否有变化。不进消息日志的通知
 * （turn/started|completed、thread/status/changed、thread/tokenUsage/updated、
 * item/plan/delta、item/reasoning/textDelta（content 可能加密，只渲染 summary）、
 * account/*、mcpServer/* 等——渲染投影不需要；usage 透传留 P1）直接返回 false。
 */
function applyCodexFrameInPlace(raw: CodexRawItem[], msg: CodexStreamServerMessage): boolean {
  if (msg.type === "codex_user_echo") {
    raw.push({
      kind: "echo",
      text: msg.text,
      uuid: msg.uuid,
      confirmed: false,
    });
    return true;
  }
  if (msg.type === "codex_approval_request") {
    return applyApprovalFrame(raw, msg);
  }
  if (msg.type === "codex_event") {
    const method = msg.event?.method ?? "";
    const params = (msg.event?.params ?? {}) as Record<string, unknown>;
    if (method === "item/started" || method === "item/completed") {
      const item = (params as CodexItemEventParams).item;
      if (!item) return false;
      const id = typeof item.id === "string" ? item.id : null;
      const type = typeof item.type === "string" ? item.type : "";
      if (type === "userMessage") {
        return upsertUserMessage(raw, id, userMessageText(item));
      }
      if (type === "agentMessage") {
        // started 的 text 为空（流式未开始），completed 带权威全文（覆盖 delta 累积）。
        const text = typeof item.text === "string" ? item.text : "";
        let changed = false;
        if (text) changed = upsertAssistantSection(raw, id, "text", text, "replace");
        if (method === "item/completed" && id) {
          changed = finalizeAssistant(raw, id) || changed;
        }
        return changed;
      }
      if (type === "reasoning") {
        if (method !== "item/completed") return false; // started 的 summary/content 为空，等 delta
        // 只渲染 summary（content 可能加密）；completed 的 summary 是权威全文。
        const summary = Array.isArray(item.summary)
          ? item.summary.filter((s): s is string => typeof s === "string" && s.length > 0)
          : [];
        const text = summary.join("\n\n");
        let changed = false;
        if (text) changed = upsertAssistantSection(raw, id, "thinking", text, "replace");
        if (id) changed = finalizeAssistant(raw, id) || changed;
        return changed;
      }
      const patch = toolPatchFromItem(item);
      if (!patch) return false;
      // completed 的权威 result 若为空（如 commandExecution 无输出），保留流式累积。
      return upsertToolCall(raw, patch);
    }
    if (method === "item/agentMessage/delta") {
      const p = params as CodexDeltaParams;
      const delta = typeof p.delta === "string" ? p.delta : "";
      if (!delta) return false;
      return upsertAssistantSection(
        raw,
        typeof p.itemId === "string" ? p.itemId : null,
        "text",
        delta,
        "append",
      );
    }
    if (method === "item/reasoning/summaryTextDelta") {
      const p = params as CodexDeltaParams;
      const delta = typeof p.delta === "string" ? p.delta : "";
      if (!delta) return false;
      return upsertAssistantSection(
        raw,
        typeof p.itemId === "string" ? p.itemId : null,
        "thinking",
        delta,
        "append",
      );
    }
    if (method === "item/reasoning/summaryPartAdded") {
      // 多段 summary 之间留空行（每段独立成段）；首段（index 0）不加。
      const p = params as CodexDeltaParams;
      if (typeof p.summaryIndex !== "number" || p.summaryIndex <= 0) return false;
      return upsertAssistantSection(
        raw,
        typeof p.itemId === "string" ? p.itemId : null,
        "thinking",
        "\n\n",
        "append",
      );
    }
    if (
      method === "item/commandExecution/outputDelta" ||
      method === "item/fileChange/outputDelta"
    ) {
      const p = params as CodexDeltaParams;
      const delta = typeof p.delta === "string" ? p.delta : "";
      const itemId = typeof p.itemId === "string" ? p.itemId : "";
      if (!delta || !itemId) return false;
      // 活跃条目在尾部（长跑命令输出流式热路径）：倒序扫 O(距尾)。
      for (let i = raw.length - 1; i >= 0; i--) {
        const item = raw[i];
        if (item.kind !== "tool_call" || item.call.toolCallId !== itemId) continue;
        raw[i] = {
          kind: "tool_call",
          call: { ...item.call, resultText: item.call.resultText + delta },
        };
        return true;
      }
      return false;
    }
    if (method === "serverRequest/resolved") {
      const requestId = params.requestId;
      if (typeof requestId !== "number" && typeof requestId !== "string") return false;
      return resolveApproval(raw, `codex:${String(requestId)}`);
    }
    return false;
  }
  if (msg.type === "ended") {
    // turn 边界：未终态 assistant 条目定格（下个 turn 的 delta 不得并入上一 turn 气泡）；
    // 未终态 tool 标 interrupted（否则卡片永久 spinner）；残留审批金框一并清除。
    let changed = false;
    for (let i = 0; i < raw.length; i++) {
      const item = raw[i];
      if (item.kind === "message" && item.role === "assistant" && !item.final) {
        raw[i] = { ...item, final: true };
        changed = true;
        continue;
      }
      if (
        item.kind === "tool_call" &&
        !item.call.interrupted &&
        item.call.status !== "completed" &&
        item.call.status !== "failed"
      ) {
        const { controlRequestId: _drop, ...call } = item.call;
        raw[i] = { kind: "tool_call", call: { ...call, interrupted: true } };
        changed = true;
        continue;
      }
      if (item.kind === "tool_call" && item.call.controlRequestId) {
        const { controlRequestId: _drop, ...call } = item.call;
        raw[i] = { kind: "tool_call", call };
        changed = true;
      }
    }
    return changed;
  }
  return false;
}

/**
 * Pass 1：单帧进 raw 日志。纯函数（复制一次进可变内核），无变化返回原引用（React
 * bail-out）。导出供单测；hook 单帧路径只做 setter 接线。
 */
export function applyCodexFrame(
  raw: CodexRawItem[],
  msg: CodexStreamServerMessage,
): CodexRawItem[] {
  const next = [...raw];
  return applyCodexFrameInPlace(next, msg) ? next : raw;
}

/**
 * Pass 1 批量折加：一次复制后逐帧进可变内核、返回最终数组（全程无变化返回原引用）。
 * history/live 批窗口提交走这里——N 帧从逐帧 functional setState 的 O(N²) 数组复制
 * 降为单次 O(N)（见 perf review codex 批次 2 P1-1）。
 */
export function applyCodexFrames(
  raw: CodexRawItem[],
  msgs: CodexStreamServerMessage[],
): CodexRawItem[] {
  if (msgs.length === 0) return raw;
  const work = [...raw];
  let changed = false;
  for (const msg of msgs) {
    if (applyCodexFrameInPlace(work, msg)) changed = true;
  }
  return changed ? work : raw;
}

/**
 * Pass 2 纯函数：raw 日志 → ThreadMessageLike[]。
 * - echo（含已确认）→ user 气泡（uuid 作 id）。
 * - message → user/assistant 气泡；text→text part、thinking→reasoning part。
 * - tool_call → role:"system" + metadata.custom tool-card（与 claude/ACP 同款独立卡片管道）；
 *   controlRequestId 透传给 renderer 即复用 claude 的金框 + 允许/拒绝按钮。
 */
export function codexFramesToThreadMessages(raw: CodexRawItem[]): ThreadMessageLike[] {
  const messages: ThreadMessageLike[] = [];
  for (const item of raw) {
    if (item.kind === "echo") {
      messages.push({ role: "user", content: item.text, id: `echo-${item.uuid}` });
      continue;
    }
    if (item.kind === "message") {
      const sections = item.sections.filter((s) => s.text.length > 0);
      if (sections.length === 0) continue;
      const parts = sections.map((s) =>
        s.type === "thinking"
          ? { type: "reasoning", text: s.text }
          : { type: "text", text: s.text },
      );
      messages.push({
        role: item.role,
        content: (item.role === "user" ? sections.map((s) => s.text).join("\n") : parts) as
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
          toolName: call.toolName,
          toolCallId: call.toolCallId,
          args: {},
          argsText: call.argsText,
          // 空串也转发：共享投影层按 result != null 推 status，条件丢弃空 result 会让
          // 无输出工具（imageView/静默命令）完成后永久 spinner（code review 批次 2 P1-1）。
          ...(done ? { result: call.resultText } : {}),
          ...(call.status === "failed" ? { isError: true } : {}),
          ...(call.interrupted ? { isInterrupted: true } : {}),
          ...(call.controlRequestId ? { controlRequestId: call.controlRequestId } : {}),
          // 独立 raw item（无同气泡伴随文本 part）→ 显式关左连接线（ACP 同约定）。
          toolIndent: false,
          sourceUuids: [],
        },
      },
    });
  }
  return messages;
}

// ── useCodexSession：WS 生命周期（镜像 useAcpSession）+ codex 数据层 ──────────────

export function useCodexSession(projectName: string, sessionId: string) {
  const [rawMessages, setRawMessages] = useState<CodexRawItem[]>([]);
  // 会话配置快照（latest-wins 标量，不进 raw 消息日志——同 ACP configOptions）。
  const [config, setConfigState] = useState<CodexConfig | null>(null);
  // 配置已提交但下一个 turn/start 才应用：UI 标「下轮生效」不伪装即时切换。
  const [configPending, setConfigPending] = useState(false);
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

  // 前台恢复：lastPong 过期即 half-open，直接 bump 重连（镜像 pi/claude/acp-adapter）。
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
          console.error("[codex-adapter] ws send error", err);
        }
      } else if (socket.readyState === WebSocket.CONNECTING) {
        socket.addEventListener(
          "open",
          () => {
            try {
              socket.send(JSON.stringify(data));
            } catch (err) {
              console.error("[codex-adapter] ws deferred send error", err);
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

  // 标量效果（连接态/config/turn 边界）就地 set；raw 日志之外的 state。单帧路径与批路径
  // 共用（批内 React 自动批处理合并多次 set 的 render）。
  const handleFrameScalars = useCallback((msg: CodexStreamServerMessage) => {
    if (msg.type === "session_init") {
      setConfigState(null);
      setConfigPending(false);
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
      setStreamError((msg as { message?: string }).message ?? "codex stream error");
      setIsRunning(false);
      return;
    }
    if (msg.type === "codex_config") {
      setConfigState({
        models: Array.isArray(msg.models) ? msg.models : [],
        current: {
          model: typeof msg.current?.model === "string" ? msg.current.model : "",
          effort: typeof msg.current?.effort === "string" ? msg.current.effort : null,
          approvalPolicy:
            typeof msg.current?.approvalPolicy === "string" ? msg.current.approvalPolicy : "",
          sandbox: typeof msg.current?.sandbox === "string" ? msg.current.sandbox : "",
        },
      });
      return;
    }
    if (msg.type === "codex_event") {
      // turn 边界：started = pendingConfig 已应用（清「下轮生效」），completed = 本轮结束。
      // 重连时 live 段回放含 turn/started → isRunning 恢复为 true。
      const method = msg.event?.method;
      if (method === "turn/started") {
        setIsRunning(true);
        setConfigPending(false);
      } else if (method === "turn/completed") {
        setIsRunning(false);
      }
    }
  }, []);

  // Pass 1 dispatch：标量效果（见 handleFrameScalars）+ raw 日志单帧折加。批窗口内的帧由
  // processBatch 走批量折加，批外零散帧走这里。
  const handleFrame = useCallback(
    (msg: CodexStreamServerMessage) => {
      handleFrameScalars(msg);
      // 进 raw 日志的帧族（ended 已在 scalars 里置 isRunning=false）。
      if (
        msg.type === "codex_user_echo" ||
        msg.type === "codex_approval_request" ||
        msg.type === "codex_event" ||
        msg.type === "ended"
      ) {
        setRawMessages((prev) => applyCodexFrame(prev, msg));
      }
    },
    [handleFrameScalars],
  );

  useEffect(() => {
    let cancelled = false;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    // 每次连接重置（session_init 分支也会清，这里是 pre-open 基线）。
    setRawMessages([]);
    setConfigState(null);
    setConfigPending(false);
    setConnected(false);
    setLoading(true);

    const socket = new WebSocket(codexStreamUrl(projectName, sessionId));
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

    // 与 pi/claude/acp-adapter 同构的批处理状态机：history/live 两个窗口内帧缓冲、end
    // marker 时批量 process（真实分帧到达时批量落 state，减少 render 风暴）。
    let historyBatch: CodexStreamServerMessage[] | null = null;
    let liveBatch: CodexStreamServerMessage[] | null = null;

    // 批量提交：标量逐帧（React 自动批处理合并 render），raw 日志整批一次折加——
    // history 回放 N 帧从逐帧 functional setState（每帧复制全数组，O(N²)）降为单次
    // O(N)（perf review codex 批次 2 P1-1）。
    const processBatch = (batch: CodexStreamServerMessage[]) => {
      for (const msg of batch) handleFrameScalars(msg);
      setRawMessages((prev) => applyCodexFrames(prev, batch));
    };
    const processOne = (msg: CodexStreamServerMessage) => handleFrame(msg);

    const handleBinaryBatch = async (buf: ArrayBuffer) => {
      const text = await decompressGzip(buf);
      const target = historyBatch ?? liveBatch;
      if (!target) return;
      if (text.length > 0) {
        for (const line of text.split("\n")) {
          try {
            target.push(JSON.parse(line) as CodexStreamServerMessage);
          } catch {
            // skip malformed line
          }
        }
      }
    };

    const handleTextFrame = (event: MessageEvent) => {
      if (cancelled) return;
      try {
        const msg = JSON.parse(event.data as string) as CodexStreamServerMessage;
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
          .catch((e) => console.error("[codex-adapter] binary batch error", e))
          .finally(() => {
            blobInFlight = false;
          });
        return;
      }
      if (blobInFlight) {
        chain = chain
          .then(() => handleTextFrame(event))
          .catch((e) => console.error("[codex-adapter] handleFrame error", e));
        return;
      }
      handleTextFrame(event);
    };

    socket.onclose = () => {
      if (!cancelled) {
        socketRef.current = null;
        setConnected(false);
        setLoading(true);
        // 退避重连（pi/acp 用 500ms 固定；这里同值）。
        setTimeout(() => {
          if (!cancelled) {
            connectionVersionRef.current += 1;
            setConnectionVersion(connectionVersionRef.current);
          }
        }, 500);
      }
    };

    socket.onerror = (e) => {
      console.log("[codex-adapter] ws error", e);
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
  const renderedMessages = useMemo(() => codexFramesToThreadMessages(rawMessages), [rawMessages]);

  const onNew = useCallback(
    async (message: AppendMessage) => {
      const textContent = (Array.isArray(message.content) ? message.content : [])
        .filter((p) => p.type === "text")
        .map((p) => (p as { text: string }).text)
        .join("\n");
      if (textContent.trim()) {
        // codex 有 turn/started 通知，仍先本地置 running（发送到 turn/started 之间留白）。
        setIsRunning(true);
        sendToSocket({ type: "user", text: textContent, uuid: crypto.randomUUID() });
      }
    },
    [sendToSocket],
  );

  const onCancel = useCallback(async () => {
    sendToSocket({ type: "interrupt" });
  }, [sendToSocket]);

  // 配置热切换（model/effort/审批策略）：服务端写 metadata + 下一个 turn/start 应用，
  // 立即广播新的 codex_config（current 已变）但真实生效在下轮——UI 用 configPending 诚实标注。
  // 审批策略是「权限模式词」，approvalPolicy 与 sandbox 同时提交（服务端从两者任一取模式，
  // 双写保证 codex_config 快照里 sandbox 不落后）。
  const setConfig = useCallback(
    (patch: CodexConfigPatch) => {
      setConfigPending(true);
      sendToSocket({ type: "set_config", ...patch });
    },
    [sendToSocket],
  );

  // 会话内审批（tool card 金框按钮，复用 claude bridge 契约）：accept/decline。
  const respondToControlRequest = useCallback(
    (controlRequestId: string) => {
      sendToSocket({ type: "respond", controlRequestId, decision: "accept" });
    },
    [sendToSocket],
  );
  const cancelControlRequest = useCallback(
    (controlRequestId: string) => {
      sendToSocket({ type: "respond", controlRequestId, decision: "decline" });
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
    config,
    configPending,
    setConfig,
    respondToControlRequest,
    cancelControlRequest,
    onCancel,
  };
}
