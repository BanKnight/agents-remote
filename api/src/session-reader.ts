import { open as openFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { codexSessionsRoot, scanRolloutFiles } from "./codex-history";
import { ompSessionSlug } from "./omp-history";
import { claudeJsonlPath } from "./session-routes";
import type { SessionMetadata } from "./session-registry";

// ── admin session_read 的消息流读取（跨 provider）──────────────────────────────
//
// admin capability 的 session_read 工具数据源：按会话 metadata 分 provider 读取「最近
// 对话窗口」——claude/codex/omp 读各自权威 JSONL/rollout 的尾部窗口，terminal 读 tmux
// capture 快照。观察类（免审批），只读不写。
//
// 设计口径：
// - 「tail 窗口」而非全量回放：从文件尾部读固定字节窗口再取窗口内最后 limit 条消息，
//   大 JSONL 不全量 parse，语义 = 「最近对话」。
// - 只取真实对话文本：isMeta/isSidechain/developer/toolResult/thinking/tool_use/tool_result
//   与 `<` 开头的环境注入（codex 先例 codex-history.ts:21）都不算对话消息。
// - 读失败（文件不存在/损坏）按空处理不抛——观察工具对「读不到」的降级是空结果+note，
//   不把 IO 噪音变工具错误。

/** session_read 默认/上限条数与截断口径（禁魔数）。 */
export const ADMIN_SESSION_READ_DEFAULT_LIMIT = 20;
export const ADMIN_SESSION_READ_MAX_LIMIT = 50;
/** 单条消息文本截断（assistant 长输出塞 agent 上下文，超长以 … 收尾）。 */
export const ADMIN_MESSAGE_MAX_CHARS = 2000;
/** 全部消息累计字符闸（含截断；超过即丢弃更早的，保最近窗口）。 */
export const ADMIN_SESSION_READ_MAX_TOTAL_CHARS = 32_000;
/** claude/codex/omp JSONL 尾部读取窗口。 */
export const ADMIN_SESSION_TAIL_SCAN_BYTES = 512 * 1024;
/** terminal 快照单条上限（capture-pane 全屏文本，比对话消息宽）。 */
export const ADMIN_TERMINAL_SNAPSHOT_MAX_CHARS = 8000;

/** session_read 返回的单条消息（时间正序）。terminal 快照整段一条，role = "terminal"。 */
export type AdminSessionMessage = {
  role: "user" | "assistant" | "terminal";
  text: string;
  ts?: string;
};

export type ReadSessionTailInput = {
  metadata: SessionMetadata;
  /** terminal 会话的快照源（生产 = runtime.capture；测试注入 fake）。 */
  capture?: (runtimeKey: string) => Promise<string>;
};

/** 读不到历史文件 / 无历史 id 时的降级结果。 */
export type ReadSessionTailResult = {
  messages: AdminSessionMessage[];
  /** 读不到（无历史 id / 文件缺失）时给一句说明，正常读取时缺省。 */
  note?: string;
};

/**
 * 按 provider 读取会话最近对话窗口。只读，失败降级空结果（不抛 IO 错误）。
 */
export async function readSessionTailMessages(
  input: ReadSessionTailInput,
  limit: number,
): Promise<ReadSessionTailResult> {
  const { metadata, capture } = input;
  const effectiveLimit = clampLimit(limit);
  if (metadata.type === "terminal") {
    return readTerminalSnapshot(metadata, capture);
  }
  const provider = metadata.provider;
  if (provider === "claude") return readClaudeTail(metadata, effectiveLimit);
  if (provider === "codex") return readCodexTail(metadata, effectiveLimit);
  if (provider === "omp") return readOmpTail(metadata, effectiveLimit);
  return { messages: [], note: `provider ${provider ?? "unknown"} not readable` };
}

// ── terminal 分支 ──────────────────────────────────────────────────────────────

const readTerminalSnapshot = async (
  metadata: SessionMetadata,
  capture: ReadSessionTailInput["capture"],
): Promise<ReadSessionTailResult> => {
  if (!capture) return { messages: [], note: "terminal snapshot unavailable" };
  try {
    const raw = await capture(metadata.runtimeKey);
    const text = stripAnsi(raw).trim();
    if (!text) return { messages: [] };
    return {
      messages: [{ role: "terminal", text: truncate(text, ADMIN_TERMINAL_SNAPSHOT_MAX_CHARS) }],
    };
  } catch {
    return { messages: [], note: "terminal snapshot unavailable" };
  }
};

// ── claude 分支 ────────────────────────────────────────────────────────────────

const readClaudeTail = async (
  metadata: SessionMetadata,
  limit: number,
): Promise<ReadSessionTailResult> => {
  if (!metadata.claudeSessionId) {
    return { messages: [], note: "no claude session id recorded" };
  }
  const path = claudeJsonlPath(metadata.projectPath, metadata.claudeSessionId);
  const lines = await readTailLines(path).catch(() => [] as string[]);
  return { messages: collectTail(messagesFromLines(lines, toClaudeMessage), limit) };
};

// ── codex 分支 ────────────────────────────────────────────────────────────────

const readCodexTail = async (
  metadata: SessionMetadata,
  limit: number,
): Promise<ReadSessionTailResult> => {
  if (!metadata.codexThreadId) {
    return { messages: [], note: "no codex thread id recorded" };
  }
  // rollout 定位：日期桶扫描 + 文件名尾段 `-${threadId}.jsonl` 匹配（与
  // deleteCodexHistoryEntry 同款判定；threadId 是 UUID，撞名忽略）。
  const files: string[] = [];
  await scanRolloutFiles(codexSessionsRoot(), 0, files);
  const suffix = `-${metadata.codexThreadId}.jsonl`;
  const hit = files.find((path) => path.endsWith(suffix));
  if (!hit) {
    return { messages: [], note: "codex rollout file not found" };
  }
  const lines = await readTailLines(hit).catch(() => [] as string[]);
  return { messages: collectTail(messagesFromLines(lines, toCodexMessage), limit) };
};

// ── omp 分支 ──────────────────────────────────────────────────────────────────

const readOmpTail = async (
  metadata: SessionMetadata,
  limit: number,
): Promise<ReadSessionTailResult> => {
  if (!metadata.acpSessionId) {
    return { messages: [], note: "no omp session id recorded" };
  }
  // 文件定位：slug 目录内 `<fileSafeTs>_<acpSessionId>.jsonl`——ts 前缀未知，
  // readdir + 尾段匹配（唯一；同 acpSessionId 不可能多文件）。
  const slug = ompSessionSlug(metadata.projectPath);
  if (!slug) return { messages: [], note: "project outside home" };
  const dir = join(homedir(), ".omp", "agent", "sessions", slug);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return { messages: [], note: "omp session directory not found" };
  }
  const suffix = `_${metadata.acpSessionId}.jsonl`;
  const hit = entries.find((name) => name.endsWith(suffix));
  if (!hit) {
    return { messages: [], note: "omp session file not found" };
  }
  const lines = await readTailLines(join(dir, hit)).catch(() => [] as string[]);
  return { messages: collectTail(messagesFromLines(lines, toOmpMessage), limit) };
};

// ── 行投影（三家各一）─────────────────────────────────────────────────────────

/**
 * claude JSONL 行 → 对话消息。只取 user/assistant 的真实文本：isMeta/isSidechain 跳过；
 * content 里只认 text block（thinking/tool_use/tool_result 跳过），空文本行不算消息。
 */
export const toClaudeMessage = (raw: string): AdminSessionMessage | null => {
  let line: Record<string, unknown>;
  try {
    line = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (line.isMeta === true || line.isSidechain === true) return null;
  if (line.type !== "user" && line.type !== "assistant") return null;
  const message = line.message as Record<string, unknown> | undefined;
  if (!message) return null;
  const role = message.role === "user" ? "user" : "assistant";
  const text = extractContentText(message.content);
  if (!text.trim()) return null;
  return { role, text: truncate(text, ADMIN_MESSAGE_MAX_CHARS), ts: asTimestamp(line.timestamp) };
};

/**
 * codex rollout 行 → 对话消息。只认 response_item 的 message payload（user/assistant）；
 * content 只认 input_text/output_text block；`<` 开头的注入文本跳过（codex-history 先例）。
 */
export const toCodexMessage = (raw: string): AdminSessionMessage | null => {
  let line: Record<string, unknown>;
  try {
    line = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (line.type !== "response_item") return null;
  const payload = line.payload as Record<string, unknown> | undefined;
  if (!payload || payload.type !== "message") return null;
  const payloadRole = payload.role;
  if (payloadRole !== "user" && payloadRole !== "assistant") return null;
  const role = payloadRole;
  const text = extractContentText(payload.content);
  if (role === "user" && text.trimStart().startsWith("<")) return null;
  if (!text.trim()) return null;
  return { role, text: truncate(text, ADMIN_MESSAGE_MAX_CHARS), ts: asTimestamp(line.timestamp) };
};

/**
 * omp 行 → 对话消息。只认 type:"message" 的 user/assistant（developer/toolResult 跳过），
 * content 提取与 claude 同构（string 或 block 数组）。
 */
export const toOmpMessage = (raw: string): AdminSessionMessage | null => {
  let line: Record<string, unknown>;
  try {
    line = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (line.type !== "message") return null;
  const message = line.message as Record<string, unknown> | undefined;
  if (!message) return null;
  const messageRole = message.role;
  if (messageRole !== "user" && messageRole !== "assistant") return null;
  const role = messageRole;
  const text = extractContentText(message.content);
  if (!text.trim()) return null;
  return { role, text: truncate(text, ADMIN_MESSAGE_MAX_CHARS), ts: asTimestamp(line.timestamp) };
};

// ── 共享积木 ──────────────────────────────────────────────────────────────────

/**
 * 三家 content 形态统一提文本：string 直取（claude user）；block 数组拼
 * text / input_text / output_text（thinking/tool_use/tool_result 等跳过）。
 */
const extractContentText = (content: unknown): string => {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts = content.map((block) => {
    if (typeof block !== "object" || block === null) return "";
    const type = (block as { type?: string }).type;
    if (type !== "text" && type !== "input_text" && type !== "output_text") return "";
    const value = (block as { text?: unknown }).text;
    return typeof value === "string" ? value : "";
  });
  return parts.filter(Boolean).join("\n");
};

/** 行级 timestamp（ISO 字符串）安全提取；缺失/类型不符 → 缺省。 */
const asTimestamp = (value: unknown): string | undefined =>
  typeof value === "string" && value ? value : undefined;

/**
 * 解析窗口行 → 消息（时间正序），投影函数返回 null 的行跳过。
 */
const messagesFromLines = (
  lines: string[],
  project: (raw: string) => AdminSessionMessage | null,
): AdminSessionMessage[] => {
  const messages: AdminSessionMessage[] = [];
  for (const raw of lines) {
    const message = project(raw);
    if (message) messages.push(message);
  }
  return messages;
};

/**
 * 取最后 limit 条并施加累计字符闸：从最早一侧丢弃，直到条数与总字符都达标。
 * 返回保持时间正序。
 */
const collectTail = (messages: AdminSessionMessage[], limit: number): AdminSessionMessage[] => {
  let tail = messages.slice(-limit);
  while (
    tail.length > 1 &&
    tail.reduce((sum, message) => sum + message.text.length, 0) > ADMIN_SESSION_READ_MAX_TOTAL_CHARS
  ) {
    tail = tail.slice(1);
  }
  return tail;
};

/**
 * 读文件尾部窗口行：从 max(0, size-window) 偏移起一次读入，丢弃窗口首残行
 * （偏移 > 0 时该行大概率被截断）。文件缺失/不可读由调用方 catch 降级。
 */
const readTailLines = async (path: string): Promise<string[]> => {
  const handle = await openFile(path, "r");
  try {
    const size = (await handle.stat()).size;
    const start = Math.max(0, size - ADMIN_SESSION_TAIL_SCAN_BYTES);
    const buffer = Buffer.alloc(size - start);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, start);
    const lines = buffer.subarray(0, bytesRead).toString("utf8").split("\n");
    if (start > 0) lines.shift(); // 窗口首残行
    return lines.filter((line) => line.trim().length > 0);
  } finally {
    handle.close();
  }
};

/** 去 ANSI CSI 序列（terminal capture-pane -e 保留的着色/光标控制）。 */
// eslint-disable-next-line no-control-regex -- ANSI 剥离必需含控制字符 \x1b，无绕过必要（tmux-runtime.ts ANSI_ESCAPE 同款）
const stripAnsi = (text: string): string => text.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "");

/** 超长截断以 … 收尾。 */
const truncate = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max)}…` : text;

/** limit 收敛到 [1, MAX]（非法值回落默认）。 */
const clampLimit = (limit: number): number => {
  if (!Number.isFinite(limit) || limit <= 0) return ADMIN_SESSION_READ_DEFAULT_LIMIT;
  return Math.min(Math.floor(limit), ADMIN_SESSION_READ_MAX_LIMIT);
};
