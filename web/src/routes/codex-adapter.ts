import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useExternalStoreRuntime } from "@assistant-ui/react";
import type { AppendMessage, ExternalStoreAdapter, ThreadMessageLike } from "@assistant-ui/react";
import type {
  ClaudeContextUsage,
  CodexAccountUsage,
  CodexStreamServerMessage,
} from "@agents-remote/shared";
import type { PendingAttachments } from "../components/ui/composer-attach";
import { codexStreamUrl } from "../api/client";
import { isConnectionFresh } from "./console-model";
import { HEARTBEAT_INTERVAL_MS, PONG_TIMEOUT_MS } from "../lib/ws-heartbeat";
import {
  codexReplayCacheKey,
  loadCodexReplayCache,
  saveCodexReplayCache,
} from "../lib/codex-replay-cache";

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
  /** 账号额度快照（批 E 防御式）：非 ChatGPT 登录恒缺省 → 浮层不渲染额度段。 */
  account?: CodexAccountUsage;
};

/** 配置热切换补丁（字段词表同 client message set_config）。 */
export type CodexConfigPatch = {
  model?: string;
  effort?: string;
  approvalPolicy?: string;
  sandbox?: string;
};

/** `thread/tokenUsage/updated` 通知的 tokenUsage 局部解码（0.163.0 fixtures 形状，宽进）：
 *  `last` = 最后一次 API 请求用量；`total` = 本 thread 累计消耗（比窗口无意义，不采集）。 */
export type CodexTokenUsageLast = {
  totalTokens: number;
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteInputTokens: number;
  outputTokens: number;
};

export type CodexTokenUsage = {
  last: CodexTokenUsageLast;
  modelContextWindow: number;
};

/**
 * 上下文占用口径：`last`（最后一次请求的 prompt 规模）≈ 当前上下文占用，比
 * modelContextWindow 得百分比（fixtures 实证：last 随轮次微增 10827→11964→…，
 * total 精确累加是累计消耗语义）。OpenAI 语义（codex-rs protocol.rs 实证）：
 * inputTokens **已含** cachedInputTokens（non_cached_input = input − cached），
 * cacheWriteInputTokens（写入 prompt cache 部分）**也是 input 的子集**——不参与
 * 明细构成（单列会与裸 input 双计、加总超出 contextTokens），恒填 0。
 * 裸 input = input − cached，明细可加总 = contextTokens。
 * 无数据/形状缺失返回 undefined（组件侧不渲染，不伪造）。
 */
export function codexTokenUsageToContextUsage(
  usage: CodexTokenUsage | undefined,
): ClaudeContextUsage | undefined {
  const last = usage?.last;
  if (!last || usage.modelContextWindow <= 0) return undefined;
  return {
    contextTokens: last.inputTokens,
    inputTokens: Math.max(0, last.inputTokens - last.cachedInputTokens),
    cacheReadTokens: last.cachedInputTokens,
    cacheCreationTokens: 0,
    outputTokens: last.outputTokens,
    contextWindow: usage.modelContextWindow,
  };
}

/**
 * 增量回放锚（镜像 claude cursorRef 语义）：raw 日志最后一条**可锚**条目的 id——服务端在
 * history/live 回放缓冲里定位它、只下发其后的行。可锚 = 客户端必已持有该条目的**终态行**：
 * echo 任意（锚其行，其后重推由 started 重置语义兜底幂等）；message 须 final（锚行 =
 * 已收到的 item/completed）；tool 须 completed|failed。流式中的条目**跳过前溯**——若锚
 * 流式条目，服务端尾扫会命中其 item/started 行（delta 行键是 itemId 不命中 prescreen），
 * 重推其后全部 delta 与断线前已收的累积双倍（形态 A），或锚在客户端未收到过的 completed
 * 行导致重推不含终态行、条目永不定格（形态 B）——code review 2026-10-28 P1。
 * 全部条目不可锚（空日志/仅流式中条目）返回 null = 全量回放兜底。
 */
export function codexAnchorId(raw: CodexRawItem[]): string | null {
  for (let i = raw.length - 1; i >= 0; i--) {
    const item = raw[i];
    if (item.kind === "echo") return item.uuid;
    if (item.kind === "message") {
      if (item.final && item.messageId) return item.messageId;
      continue;
    }
    if (item.kind === "compact") {
      // completed 的 item/completed 行在服务端 live 缓冲内可锚；running 不锚（终态行未落）。
      if (item.status === "completed") return item.compactId;
      continue;
    }
    // notice 不锚（服务端通知不进 history/live 缓冲，重推只会全量兜底）；tool_call 及
    // 未知 kind：call 缺失/形状漂移的行跳过不炸（恢复端数据来自盘上，不具备 live 端
    // 「内核自建数组」的形状保证——review 2026-10-28 P3-3）。
    if (item.kind !== "tool_call" || !item.call) continue;
    if (item.call.status === "completed" || item.call.status === "failed") {
      return item.call.toolCallId;
    }
  }
  return null;
}

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
      /** 图片附件（base64 裸数据）：live echo 携带，渲染图前文后 user content。 */
      images?: { data: string; mimeType: string }[];
    }
  | {
      kind: "message";
      messageId: string | null;
      role: "user" | "assistant";
      /** assistant 的流式分区：text/thinking 各保留一条，chunk 追加进对应分区。 */
      sections: { type: "text" | "thinking"; text: string }[];
      final: boolean;
    }
  | { kind: "tool_call"; call: CodexToolCall }
  | {
      // 压缩条目（批 E）：thread/compact/start 产生 contextCompaction item（探针 E2：
      // started → completed，弃用通知 thread/compacted 不再发）。manual = 本端用户按钮
      // 触发（item/started 到达时消费 manualCompactRef；回放无该 ref → false 诚实降级）。
      kind: "compact";
      compactId: string;
      status: "running" | "completed";
      manual: boolean;
    }
  | {
      // 一次性运行提示（批 E P2）：error 通知（重连中/最终错误）、model/rerouted、
      // modelProvider/authRecovery*。不进服务端历史（纯通知），锚跳过。retry 条目
      // （固定 id）在恢复流量到达时被移除；其余留存。
      kind: "notice";
      noticeId: string;
      notice:
        | { type: "error"; message: string; willRetry: boolean }
        | { type: "modelRerouted"; fromModel: string; toModel: string }
        | { type: "authRecovery" };
    };

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

/**
 * started 重置（增量回放幂等性的一半，code review 2026-10-28 P1 形态 A）：item/started
 * 到达时清空同 id 条目的流式累积——正常流 started 先于全部 delta，重置是 no-op；重连
 * 重推路径则让重放的 delta 从零累加（锚前条目已收的 delta 不再双倍拼进 sections）。
 * 只作用于未定格条目：定格条目必在锚行之前，其 started 不会出现在重推范围。
 */
function resetAssistantEntry(raw: CodexRawItem[], messageId: string | null): boolean {
  if (!messageId) return false;
  for (let i = raw.length - 1; i >= 0; i--) {
    const item = raw[i];
    if (
      item.kind === "message" &&
      item.role === "assistant" &&
      item.messageId === messageId &&
      !item.final &&
      item.sections.length > 0
    ) {
      raw[i] = { ...item, sections: [] };
      return true;
    }
  }
  return false;
}

/** 同上，tool 版：清流式 output 累积（resultText）——completed 权威 result 由
 *  upsertToolCall 的 patch 语义另行覆盖。 */
function resetToolEntry(raw: CodexRawItem[], toolCallId: string): boolean {
  for (let i = raw.length - 1; i >= 0; i--) {
    const item = raw[i];
    if (
      item.kind === "tool_call" &&
      item.call.toolCallId === toolCallId &&
      item.call.status !== "completed" &&
      item.call.status !== "failed" &&
      item.call.resultText !== ""
    ) {
      raw[i] = { kind: "tool_call", call: { ...item.call, resultText: "" } };
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
  if (type === "enteredReviewMode" || type === "exitedReviewMode" || type === "imageGeneration") {
    return { toolCallId: id, toolName: type, title: type, status: "completed" };
  }
  return null;
}

// contextCompaction 不走 tool 卡（批 E）：独立 compact 条目 → CompactBlock 复用渲染。

/** compact 条目 upsert（同 item id：started 置 running、completed 定格）。 */
function upsertCompact(
  raw: CodexRawItem[],
  compactId: string,
  status: "running" | "completed",
  manual: boolean,
): boolean {
  for (let i = raw.length - 1; i >= 0; i--) {
    const item = raw[i];
    if (item.kind !== "compact" || item.compactId !== compactId) continue;
    // manual 标记只在 started 帧带（ref 在那一帧被消费）；completed 帧的 opts 恒
    // false，不可覆盖已记录的手动来源（否则完成即退化显示为「自动」）。
    raw[i] = { kind: "compact", compactId, status, manual: item.manual || manual };
    return true;
  }
  raw.push({ kind: "compact", compactId, status, manual });
  return true;
}

/** 按 id 移除 notice 条目（恢复流量到达时清「重连中」）。 */
function removeNotice(raw: CodexRawItem[], noticeId: string): boolean {
  for (let i = raw.length - 1; i >= 0; i--) {
    const item = raw[i];
    if (item.kind !== "notice" || item.noticeId !== noticeId) continue;
    raw.splice(i, 1);
    return true;
  }
  return false;
}

/** notice 载荷（错误/重连/reroute/authRecovery 的语义形状，渲染层做 i18n 组装）。 */
export type CodexNotice = Extract<CodexRawItem, { kind: "notice" }>["notice"];

/** notice 条目 upsert（同 id 就地覆盖——「Reconnecting n/5」单条演进，不刷屏）。 */
function upsertNotice(raw: CodexRawItem[], noticeId: string, notice: CodexNotice): boolean {
  for (let i = raw.length - 1; i >= 0; i--) {
    const item = raw[i];
    if (item.kind !== "notice" || item.noticeId !== noticeId) continue;
    raw[i] = { kind: "notice", noticeId, notice };
    return true;
  }
  raw.push({ kind: "notice", noticeId, notice });
  return true;
}

/** 「重连中」notice 的固定 id（恢复流量：agentMessage delta / turn 收口时移除）。 */
const RETRY_NOTICE_ID = "retry";

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
 *
 * opts.manualCompact：本帧若开跑 contextCompaction item，entry.manual 取此值（用户按钮
 * 路径置 true；回放路径无 opts → false 诚实降级为「自动」）。调用方（hook 的
 * consumeManualCompact）负责在帧真正含 compact 开跑帧时消费 ref。
 */
type CodexFrameOpts = { manualCompact?: boolean };

function applyCodexFrameInPlace(
  raw: CodexRawItem[],
  msg: CodexStreamServerMessage,
  opts?: CodexFrameOpts,
): boolean {
  if (msg.type === "codex_user_echo") {
    raw.push({
      kind: "echo",
      text: msg.text,
      uuid: msg.uuid,
      confirmed: false,
      ...(msg.images && msg.images.length > 0 ? { images: msg.images } : {}),
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
      if (type === "contextCompaction") {
        // 压缩条目（批 E）：started 置 running（manual 取调用方消费的 ref）、completed
        // 定格。toolPatchFromItem 的通用兜底不再接它（独立事实块渲染）。
        if (!id) return false;
        if (method === "item/started") {
          return upsertCompact(raw, id, "running", opts?.manualCompact ?? false);
        }
        return upsertCompact(raw, id, "completed", opts?.manualCompact ?? false);
      }
      if (type === "agentMessage") {
        // started 的 text 为空（流式未开始），completed 带权威全文（覆盖 delta 累积）。
        // started 先重置流式累积（增量回放重推幂等，见 resetAssistantEntry）。
        let changed = method === "item/started" ? resetAssistantEntry(raw, id) : false;
        const text = typeof item.text === "string" ? item.text : "";
        if (text) changed = upsertAssistantSection(raw, id, "text", text, "replace") || changed;
        if (method === "item/completed" && id) {
          changed = finalizeAssistant(raw, id) || changed;
        }
        return changed;
      }
      if (type === "reasoning") {
        if (method !== "item/completed") return resetAssistantEntry(raw, id); // started 等 delta
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
      // started 先重置流式 output 累积（增量回放重推幂等）；completed 的权威 result 若为
      // 空（如 commandExecution 无输出），保留流式累积（不 reset）。
      const changed = method === "item/started" ? resetToolEntry(raw, patch.toolCallId) : false;
      return upsertToolCall(raw, patch) || changed;
    }
    if (method === "item/agentMessage/delta") {
      const p = params as CodexDeltaParams;
      const delta = typeof p.delta === "string" ? p.delta : "";
      if (!delta) return false;
      removeNotice(raw, RETRY_NOTICE_ID); // 流恢复：撤「重连中」
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
      removeNotice(raw, RETRY_NOTICE_ID);
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
    if (method === "error") {
      // 错误/重连通知（批 E，fixture 实锤 params 形状）：willRetry=true「Reconnecting
      // n/5」→ 固定 id 单条覆盖演进；willRetry=false → 最终错误 notice（事实保留）。
      const errorObj = params.error as { message?: unknown } | undefined;
      const message = typeof errorObj?.message === "string" ? errorObj.message : "";
      if (!message) return false;
      if (params.willRetry === true) {
        return upsertNotice(raw, RETRY_NOTICE_ID, { type: "error", message, willRetry: true });
      }
      removeNotice(raw, RETRY_NOTICE_ID);
      return upsertNotice(raw, "error-final", { type: "error", message, willRetry: false });
    }
    if (method === "model/rerouted") {
      // 模型被上游重路由（探针无样本，字段名宽进提取；无 to 则不渲染）。
      const rawFrom = params.fromModel ?? params.from ?? params.previousModel;
      const rawTo = params.toModel ?? params.to ?? params.model;
      if (typeof rawTo !== "string" || !rawTo) return false;
      const scope =
        typeof params.turnId === "string" && params.turnId
          ? params.turnId
          : typeof params.threadId === "string" && params.threadId
            ? params.threadId
            : "t";
      return upsertNotice(raw, `reroute-${scope}`, {
        type: "modelRerouted",
        fromModel: typeof rawFrom === "string" ? rawFrom : "",
        toModel: rawTo,
      });
    }
    if (method === "modelProvider/authRecoveryStarted") {
      return upsertNotice(raw, "auth-recovery", { type: "authRecovery" });
    }
    if (method === "modelProvider/authRecoveryCompleted") {
      // 恢复完成 = 瞬态状态结束：移除提示而非改写为「已恢复」——纯瞬态状态不该成为
      // 永久回放内容（design review L3-11；started 期间有提示即可）。
      return removeNotice(raw, "auth-recovery");
    }
    return false;
  }
  if (msg.type === "ended") {
    // turn 边界：未终态 assistant 条目定格（下个 turn 的 delta 不得并入上一 turn 气泡）；
    // 未终态 tool 标 interrupted（否则卡片永久 spinner）；残留审批金框一并清除；
    // 「重连中」notice 一并撤（轮已收口，短暂恢复流量不再有）。
    let changed = removeNotice(raw, RETRY_NOTICE_ID);
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
  opts?: CodexFrameOpts,
): CodexRawItem[] {
  const next = [...raw];
  return applyCodexFrameInPlace(next, msg, opts) ? next : raw;
}

/**
 * Pass 1 批量折加：一次复制后逐帧进可变内核、返回最终数组（全程无变化返回原引用）。
 * history/live 批窗口提交走这里——N 帧从逐帧 functional setState 的 O(N²) 数组复制
 * 降为单次 O(N)（见 perf review codex 批次 2 P1-1）。
 */
export function applyCodexFrames(
  raw: CodexRawItem[],
  msgs: CodexStreamServerMessage[],
  opts?: CodexFrameOpts,
): CodexRawItem[] {
  if (msgs.length === 0) return raw;
  const work = [...raw];
  let changed = false;
  for (const msg of msgs) {
    if (applyCodexFrameInPlace(work, msg, opts)) changed = true;
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
      // 有图 → image parts 在前 + 可选文本块（claude user-prompt 同款 user content 数组，
      // UserImageView 消费）；无图维持字符串 content（现状零变化）。
      const hasImages = (item.images?.length ?? 0) > 0;
      messages.push({
        role: "user",
        id: `echo-${item.uuid}`,
        content: hasImages
          ? [
              ...item.images!.map((img) => ({
                type: "image" as const,
                image: `data:${img.mimeType};base64,${img.data}`,
              })),
              ...(item.text ? [{ type: "text" as const, text: item.text }] : []),
            ]
          : item.text,
      });
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
    if (item.kind === "compact") {
      // 压缩事实块（批 E）：走 SystemChatBubble 的 compact-block 分支复用 claude 渲染；
      // running 态 CompactBlock 内部切成进度 pill。
      messages.push({
        role: "system",
        content: "",
        id: `compact-${item.compactId}`,
        metadata: {
          custom: {
            systemMessageType: "compact-block",
            trigger: item.manual ? "manual" : "auto",
            ...(item.status === "running" ? { running: true } : {}),
            sourceUuids: [],
          },
        },
      });
      continue;
    }
    if (item.kind === "notice") {
      // 错误/重连/reroute/authRecovery 通知（批 E）：语义对象进 custom，文案由
      // SystemChatBubble 的 codex-notice 分支 i18n 组装（通知原文是服务端英文串）。
      messages.push({
        role: "system",
        content: "",
        id: `notice-${item.noticeId}`,
        metadata: {
          custom: {
            systemMessageType: "codex-notice",
            notice: item.notice,
            sourceUuids: [],
          },
        },
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

// 回放缓存落盘节奏（claude-adapter 同值同理由）：纯 debounce 在 delta 流期间被每帧
// 重置 → 长回合永不落盘；maxWait 强制周期性落盘防 PWA 被杀丢整回合。
const REPLAY_FLUSH_DEBOUNCE_MS = 2_000;
const REPLAY_FLUSH_MAX_WAIT_MS = 10_000;
// 跨 remount 恢复的 IDB 读超时竞速（claude RESTORE_TIMEOUT_MS 同值）：IDB 挂起的最坏
// 面是一次全量回放而非骨架永驻。
const CODEX_RESTORE_TIMEOUT_MS = 3_000;

export function useCodexSession(
  projectName: string,
  sessionId: string,
  // composer 附件接线（claude useClaudeSession 同款）：ref 持有（onNew 依赖稳定），发送
  // 瞬间取快照组帧、成功后清 chips。
  options?: {
    takePendingAttachments?: () => PendingAttachments | null;
    clearPendingAttachments?: () => void;
    // 双模式多端跟随(claude useClaudeSession 同款):另一端把会话切成 terminal 形态后,
    // 本端重连撞 open 守卫(SESSION_STATE_CONFLICT)→ 停止重连 + 通知外层失效 detail。
    onModeConflict?: () => void;
  },
) {
  const pendingAttachmentsRef = useRef(options);
  pendingAttachmentsRef.current = options;
  // onModeConflict 经 ref 进 WS effect 闭包(回调身份不稳定,不能进依赖)。
  const onModeConflictRef = useRef(options?.onModeConflict);
  onModeConflictRef.current = options?.onModeConflict;
  // 双模式守卫命中标记(claude effect 内局部 let 的 ref 变体:codex 的 error 分支在
  // useCallback 作用域,拿不到 per-connection 局部)。WS effect 每轮开头清零。
  const modeConflictRef = useRef(false);
  const [rawMessages, setRawMessages] = useState<CodexRawItem[]>([]);
  // 会话配置快照（latest-wins 标量，不进 raw 消息日志——同 ACP configOptions）。
  const [config, setConfigState] = useState<CodexConfig | null>(null);
  // 配置已提交但下一个 turn/start 才应用：UI 标「下轮生效」不伪装即时切换。
  const [configPending, setConfigPending] = useState(false);
  // 上下文占用标量（thread/tokenUsage/updated 透传帧，last 比窗口——真机反馈 2026-10-28
  // 「缺乏查看上下文的功能」）：composer 右组 ContextUsageIndicator 消费。
  const [tokenUsage, setTokenUsage] = useState<CodexTokenUsage | undefined>();
  const [isRunning, setIsRunning] = useState(false);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [streamError, setStreamError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const lastPongRef = useRef(0);
  const [connectionVersion, setConnectionVersion] = useState(0);
  const connectionVersionRef = useRef(0);
  // ── 增量回放（镜像 claude cursorRef/重连锚）──
  // anchorRef：本地最后一条可锚条目的 id（effect 从 rawMessages 提交态同步，见下）；
  // WS 重连时拼进 URL `?since=`，服务端命中 → session_init.replay="delta" 只补锚后行。
  const anchorRef = useRef<string | null>(null);
  // 会话代际判定：effect 重跑可能是重连（connectionVersion bump，保留 state 走 delta）
  // 也可能是切会话（projectName/sessionId 变，必须清空防串屏）——只有后者 pre-open 清空。
  const sessionKeyRef = useRef<string | null>(null);
  // ── 跨 remount 回放缓存（codex-replay-cache，镜像 claude replayFlush 家族）──
  // raw 提交态镜像（flush 序列化窗口用）：锚同步 effect 在 commit 后写（debounce 到点
  // 时必已就位，与 anchorRef 同款时序论证）。
  const replayRawRef = useRef<CodexRawItem[]>([]);
  const replayKeyRef = useRef<string | null>(null);
  // 会话代数：切会话/重挂载 ++，旧会话已排队 flush 醒来发现 gen 漂移即丢弃（claude 同款）。
  const replayGenRef = useRef(0);
  // 恢复置 true（内容就是盘上的）、采集置 false——恢复后的到点 flush 不重写同一份数据。
  const replayCleanRef = useRef(true);
  const replayDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const replayMaxWaitRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const replayFlush = useCallback(() => {
    if (replayDebounceRef.current) {
      clearTimeout(replayDebounceRef.current);
      replayDebounceRef.current = null;
    }
    if (replayMaxWaitRef.current) {
      clearTimeout(replayMaxWaitRef.current);
      replayMaxWaitRef.current = null;
    }
    if (replayCleanRef.current || !replayKeyRef.current) return;
    // 锚在 flush 时刻从窗口推导（codexAnchorId 单一真相；raw 提交态已就位）。
    const anchorId = codexAnchorId(replayRawRef.current);
    const lines = replayRawRef.current.map((item) => JSON.stringify(item));
    void saveCodexReplayCache(replayKeyRef.current, lines, anchorId);
    replayCleanRef.current = true;
  }, []);
  // trailing debounce + maxWait（claude 同款节奏）：纯 debounce 在 delta 流期间被每帧
  // 重置 → 长回合永不落盘、PWA 被杀丢整回合；maxWait 强制周期性落盘。
  const scheduleReplayFlush = useCallback(() => {
    replayCleanRef.current = false;
    const gen = replayGenRef.current;
    if (replayDebounceRef.current) clearTimeout(replayDebounceRef.current);
    replayDebounceRef.current = setTimeout(() => {
      replayDebounceRef.current = null;
      if (gen === replayGenRef.current) replayFlush();
    }, REPLAY_FLUSH_DEBOUNCE_MS);
    if (!replayMaxWaitRef.current) {
      replayMaxWaitRef.current = setTimeout(() => {
        replayMaxWaitRef.current = null;
        if (gen === replayGenRef.current) replayFlush();
      }, REPLAY_FLUSH_MAX_WAIT_MS);
    }
  }, [replayFlush]);

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

  // ── 手动压缩标记（批 E）──：compact() 置位；批内真有 contextCompaction 的 item/started
  // 帧时消费为 `{manualCompact: true}`（Pass 1 据此标 manual）。消费必须在 setRawMessages
  // 的 updater **外**（updater 须纯，StrictMode 双跑会重复消费副作用）；15s 自愈过期覆盖
  //「app-server 无回执」的失败面——超时未消费 = 压缩没开跑（busy 拒绝/断线），标记作废，
  // 不污染后续自动压缩。
  const COMPACT_MANUAL_TTL_MS = 15_000;
  const manualCompactRef = useRef(false);
  const manualCompactTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const consumeManualCompact = useCallback((msgs: CodexStreamServerMessage[]) => {
    if (!manualCompactRef.current) return undefined;
    let started = false;
    for (const msg of msgs) {
      if (msg.type !== "codex_event") continue;
      const item = (msg.event?.params as { item?: { type?: unknown } } | undefined)?.item;
      if (msg.event?.method === "item/started" && item?.type === "contextCompaction") {
        started = true;
        break;
      }
    }
    if (!started) return undefined;
    manualCompactRef.current = false;
    if (manualCompactTimerRef.current) {
      clearTimeout(manualCompactTimerRef.current);
      manualCompactTimerRef.current = null;
    }
    return { manualCompact: true };
  }, []);
  useEffect(() => {
    return () => {
      if (manualCompactTimerRef.current) clearTimeout(manualCompactTimerRef.current);
    };
  }, []);

  // 标量效果（连接态/config/turn 边界）就地 set；raw 日志之外的 state。单帧路径与批路径
  // 共用（批内 React 自动批处理合并多次 set 的 render）。
  const handleFrameScalars = useCallback((msg: CodexStreamServerMessage) => {
    if (msg.type === "session_init") {
      // 增量回放分支（镜像 claude session_init.replay）：delta = 服务端命中 since 锚、
      // 只补锚后行——保留全部 state（raw/config/tokenUsage/isRunning 都不动），不 reset
      //（断线前已渲染的内容继续在屏，loading 不重置）；full/缺省 = 全量回放（或老服务端
      // 无 replay 字段），重置重建。onclose 不再置 loading=true——重连期间的面板形态由
      // 本分支裁决（delta 保持内容、full 骨架），重连成功前不闪骨架。
      if (!(msg.replay === "delta" && anchorRef.current != null)) {
        setRawMessages([]);
        anchorRef.current = null;
        setConfigState(null);
        setConfigPending(false);
        setTokenUsage(undefined);
        setIsRunning(false);
        setLoading(true);
      }
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
      // 双模式守卫拒绝(多端跟随):会话已被其它端切成 terminal 形态。关 socket + 停止
      // 重连(onclose 读 modeConflictRef 跳过),onModeConflict 通知外层失效 detail →
      // AgentPanelRouter 重读 mode 换渲染 terminal 面板(claude-adapter 同款)。
      if ((msg as { code?: string }).code === "SESSION_STATE_CONFLICT") {
        modeConflictRef.current = true;
        onModeConflictRef.current?.();
        socketRef.current?.close();
        return;
      }
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
        ...(msg.account ? { account: msg.account } : {}),
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
        return;
      }
      if (method === "turn/completed") {
        setIsRunning(false);
        return;
      }
      // 上下文占用标量（latest-wins）：params.tokenUsage.last ≈ 当前上下文规模、
      // params.tokenUsage.modelContextWindow = 窗口（形状按 codex-generated 绑定
      // v2/ThreadTokenUsageUpdatedNotification：params = {threadId, turnId,
      // tokenUsage: {total, last, modelContextWindow}}；缺形状不更新不伪造）。
      if (method === "thread/tokenUsage/updated") {
        const usage = (msg.event?.params as { tokenUsage?: Record<string, unknown> } | undefined)
          ?.tokenUsage;
        const last = usage?.last as Record<string, unknown> | undefined;
        const window = typeof usage?.modelContextWindow === "number" ? usage.modelContextWindow : 0;
        if (!last || window <= 0) return;
        const num = (v: unknown) => (typeof v === "number" ? v : 0);
        setTokenUsage({
          last: {
            totalTokens: num(last.totalTokens),
            inputTokens: num(last.inputTokens),
            cachedInputTokens: num(last.cachedInputTokens),
            cacheWriteInputTokens: num(last.cacheWriteInputTokens),
            outputTokens: num(last.outputTokens),
          },
          modelContextWindow: window,
        });
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
        const opts = consumeManualCompact([msg]);
        setRawMessages((prev) => applyCodexFrame(prev, msg, opts));
        scheduleReplayFlush();
      }
    },
    [handleFrameScalars, consumeManualCompact],
  );

  // 锚同步（镜像 claude cursorRef 的 processBatch 内推进）：commit 后从 raw 提交态提取
  // 最后可锚条目 id。onclose → 500ms 退避重连的 URL 构造读它——500ms 足够 effect 跑完。
  // 切会话清空 effect 与本 effect 都在 commit 后执行，顺序 = 声明序，锚跟随清空归 null。
  useEffect(() => {
    anchorRef.current = codexAnchorId(rawMessages);
    // flush 镜像：replayFlush 读这里（不是 setRawMessages 闭包态）——锚与 flush 窗口同源。
    replayRawRef.current = rawMessages;
  }, [rawMessages]);

  // 回放缓存落盘三点（claude-adapter 同款惯例）：PWA 切后台（hidden）/ 页面卸载
  //（pagehide，iOS 回收前最后时机）/ 组件卸载——pending 窗口立即 flush，不等 debounce。
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") replayFlush();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", replayFlush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", replayFlush);
      replayFlush();
    };
  }, [replayFlush]);

  useEffect(() => {
    let cancelled = false;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    // 每轮连接周期重置双模式守卫标记(error 置位 → onclose 读取 → 下轮 effect 清零)。
    modeConflictRef.current = false;
    // 会话代际判定：切会话（projectName/sessionId 变）pre-open 清空防旧会话内容串屏；
    // 重连（connectionVersion bump）保留 state——reset 职责在 session_init full 分支
    //（delta 重连不清空、保留已渲染内容，全量兜底由服务端锚 miss 自动降级）。
    const sessionKey = `${projectName}\u0000${sessionId}`;
    // 首挂/切会话 = 异步恢复后开连（缓存命中即刻呈现 + URL 带 since 锚）；重连 = 同步
    // 开连（锚取现有 anchorRef，零新增延迟）。函数声明提升：else 分支提前引用合法
    //（claude-adapter 同款结构）。
    let connect: () => void;
    // 首挂（connectionVersion === 0）也走恢复分支：StrictMode dev 双跑的第二跑 ref 已
    // 命中 sessionKey，不带此条件恢复永不生效；prod 同理覆盖「恢复挂起窗口内重连撞
    // 击 bump」的误判（review 2026-10-28 P2-2，claude-adapter 同款）。
    if (sessionKeyRef.current !== sessionKey || connectionVersion === 0) {
      sessionKeyRef.current = sessionKey;
      // 切会话：同步 flush 旧会话窗口（rawRef/keyRef 此刻仍是旧会话）+ gen++ 使旧会话
      // 已排队 flush 失效 + 换 key。旧会话毒化不传染的对应面：codex 无毒化机制，无需复位。
      replayFlush();
      replayGenRef.current += 1;
      replayCleanRef.current = true;
      replayKeyRef.current = codexReplayCacheKey(projectName, sessionId);
      const replayKey = replayKeyRef.current;
      // 手动压缩标记跨会话清（遗留 true 会把下一会话的自动压缩误标 manual）。
      manualCompactRef.current = false;
      if (manualCompactTimerRef.current) {
        clearTimeout(manualCompactTimerRef.current);
        manualCompactTimerRef.current = null;
      }
      setRawMessages([]);
      replayRawRef.current = [];
      anchorRef.current = null;
      setConfigState(null);
      setConfigPending(false);
      setTokenUsage(undefined);
      // isRunning 一并清：running 会话切走后，新会话 onopen → session_init full 到达前的
      // 一 RTT 窗口不得残留 Stop 钮（code review 2026-10-28 P3-2）。
      setIsRunning(false);
      setConnected(false);
      setLoading(true);

      // 跨 remount 恢复（claude 同款）：命中即恢复窗口——raw/anchorRef 同步写（开连前
      // 必须就位，URL since 依赖它）+ loading false；不 schedule（恢复内容就是盘上的，
      // clean=true 到点 flush 不重写）。恢复行不含 config/tokenUsage 标量（独立 state）：
      // codex_config 在服务端 live 缓冲回放段重放，照常到达。超时竞速 = IDB 挂起的最坏
      // 面是一次全量回放；gen/cancelled 双守卫挡「恢复窗口内切换/卸载」的迟到应用。
      const gen = replayGenRef.current;
      connect = () => {
        void (async () => {
          const cached = await Promise.race([
            loadCodexReplayCache(replayKey),
            new Promise<null>((r) => setTimeout(() => r(null), CODEX_RESTORE_TIMEOUT_MS)),
          ]);
          if (cancelled || gen !== replayGenRef.current) return;
          if (cached) {
            const parsed: CodexRawItem[] = [];
            for (const line of cached.raw) {
              try {
                const item = JSON.parse(line) as CodexRawItem;
                // 盘上数据可能损坏：缺 kind / kind 非串的行 skip（codexAnchorId 对错
                // 形状会炸——盘上数据不做 live 端「内核自建数组」的形状保证）。
                if (!item || typeof item.kind !== "string") continue;
                parsed.push(item);
              } catch {
                // skip malformed cached line
              }
            }
            if (parsed.length > 0) {
              replayRawRef.current = parsed;
              anchorRef.current = codexAnchorId(parsed);
              setRawMessages(parsed);
              setLoading(false);
            }
          }
          openConnection();
        })();
      };
    } else {
      setConnected(false);
      connect = () => openConnection();
    }

    function openConnection() {
      const socket = new WebSocket(
        codexStreamUrl(
          projectName,
          sessionId,
          // 重连锚（镜像 claude openConnection）：本地已持有的最后可锚条目 id。首连/切会
          // 话刚恢复/清空完 = 恢复端推导锚或 null（全量）。URL 构造必须在恢复/清空之后
          //（同 claude 的「构造必须在 reset 之后」——否则会把上一会话的锚带进新会话 URL）。
          anchorRef.current ?? undefined,
        ),
      );
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
        const opts = consumeManualCompact(batch);
        setRawMessages((prev) => applyCodexFrames(prev, batch, opts));
        scheduleReplayFlush();
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
        // 双模式守卫关闭(claude review P3-7 同款):面板即将被撤下,残留 connected/loading
        // 会让其它消费面读到假连接态;只跳过重连(重连注定再撞守卫)。
        if (modeConflictRef.current) {
          if (socketRef.current === socket) socketRef.current = null;
          setConnected(false);
          setLoading(false);
          return;
        }
        if (!cancelled) {
          socketRef.current = null;
          setConnected(false);
          // loading 不动：重连期间的面板形态由下一连接的 session_init 分支裁决
          //（delta = 保留已渲染内容；full = reset 置 loading=true 走骨架）。
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
    }

    connect();
    return () => {
      cancelled = true;
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      const s = socketRef.current;
      if (s) {
        socketRef.current = null;
        s.close();
      }
      // 卸载收口：flush 当前会话窗口（切会话分支已先同步 flush 过，clean=true 时为 no-op）。
      replayFlush();
    };
  }, [projectName, sessionId, connectionVersion, handleFrame, consumeManualCompact]);

  // Pass 2：渲染列表派生。
  const renderedMessages = useMemo(() => codexFramesToThreadMessages(rawMessages), [rawMessages]);

  // 上下文占用投影（ClaudeContextUsage 形状）：ContextUsageIndicator 零改动复用（真机反馈
  // 2026-10-28「缺乏查看上下文的功能」）。
  const contextUsage = useMemo(() => codexTokenUsageToContextUsage(tokenUsage), [tokenUsage]);

  const onNew = useCallback(
    async (message: AppendMessage) => {
      const textContent = (Array.isArray(message.content) ? message.content : [])
        .filter((p) => p.type === "text")
        .map((p) => (p as { text: string }).text)
        .join("\n");

      // 附件快照（claude onNew 同款）：图片 → user 帧 images（服务端组 turn/start input
      // 的 image 项）；uploads 文件提及行与内联文本块并入文本（codex 侧纯文本语义，无
      // 独立通道）。纯图片（无文本）也发——UserInput 接受纯 image 项数组。
      const pending = pendingAttachmentsRef.current?.takePendingAttachments?.() ?? null;
      // 附件管线产出 {mediaType,data}（claude 语义），codex 线协议是 {mimeType,data}
      //（shared CodexStreamClientMessage / 服务端 codexSpawnEnv→turn/start input 同域）
      // ——在此一处收口改名（code review P1-1：原样透传 = data:undefined;base64）。
      const images = (pending?.images ?? []).map(({ mediaType, data }) => ({
        mimeType: mediaType,
        data,
      }));
      const text = [
        textContent.trim(),
        ...(pending?.mentionLines ?? []),
        ...(pending?.inlineTexts ?? []),
      ]
        .filter(Boolean)
        .join("\n");
      if (!text && images.length === 0) return;
      // codex 有 turn/started 通知，仍先本地置 running（发送到 turn/started 之间留白）。
      setIsRunning(true);
      sendToSocket({
        type: "user",
        text,
        uuid: crypto.randomUUID(),
        ...(images.length > 0 ? { images } : {}),
      });
      pendingAttachmentsRef.current?.clearPendingAttachments?.();
    },
    [sendToSocket],
  );

  const onCancel = useCallback(async () => {
    sendToSocket({ type: "interrupt" });
  }, [sendToSocket]);

  // 压缩上下文（批 E parity）：置手动标记（消费见 consumeManualCompact）+ 上行 compact 帧。
  // busy 时服务端回 error 帧 → streamError toast；标记由 15s TTL 自愈作废。
  const compact = useCallback(() => {
    manualCompactRef.current = true;
    if (manualCompactTimerRef.current) clearTimeout(manualCompactTimerRef.current);
    manualCompactTimerRef.current = setTimeout(() => {
      manualCompactTimerRef.current = null;
      manualCompactRef.current = false;
    }, COMPACT_MANUAL_TTL_MS);
    sendToSocket({ type: "compact" });
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
    contextUsage,
    setConfig,
    compact,
    respondToControlRequest,
    cancelControlRequest,
    onCancel,
  };
}
