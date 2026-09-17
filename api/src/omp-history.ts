import { readdir, stat, open as openFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, relative, isAbsolute } from "node:path";
import type { AgentHistoryEntry, AgentHistoryRange } from "@agents-remote/shared";

// ── omp（Oh My Pi）会话历史扫描 ────────────────────────────────────────────────
//
// omp 把会话存在 `~/.omp/agent/sessions/<slug>/<fileSafeTs>_<sessionId>.jsonl`
// （源码：oh-my-pi packages/coding-agent/src/session/session-paths.ts）。本模块只读文件
// 头部几行拿元数据，**不引入 omp 的 SessionManager SDK**——那会把整个
// @oh-my-pi/coding-agent 依赖树拉进 api，而格式（version 3）已稳定，自解析更轻。
//
// JSONL 行结构（源码 session-entries.ts）：
//   {type:"title", title, updatedAt, pad}   ← 首行固定 256 字节 slot，omp 自动 AI 标题原地重写
//   {type:"session", version, id, timestamp, cwd}
//   {type:"message", id, parentId, timestamp, message:{role, content}}  ← role ∈ user/developer/assistant/toolResult
//
// 无 LRU 缓存（对比 agent-history 的 mtime/size 缓存）：omp 会话量级远小于 claude，且每文件
// 只读头部 ~8KB，扫描成本可忽略；量级若增长再补缓存。

/** range → 毫秒窗口（文件 mtime 距今超过此值即滤除）。与 agent-history.ts 同值同语义。 */
const RANGE_WINDOW_MS: Record<AgentHistoryRange, number> = {
  week: 7 * 24 * 60 * 60 * 1000,
  biweekly: 15 * 24 * 60 * 60 * 1000,
  all: Number.POSITIVE_INFINITY,
};

/**
 * 读取的头部字节上限。title slot(256B) + session header + 首条 user 消息的正常位置在此
 * 之内；超出即认为该文件无早期 user 消息（异常/巨型首块），不再深读。
 */
const HEAD_BYTES = 8 * 1024;

/** firstMessage 截断长度（对齐 agent-history.ts 同值，历史 UI 一行显示）。 */
const FIRST_MESSAGE_MAX_LEN = 120;

/**
 * cwd → omp 会话目录名（相对 home 编码）。规则（session-paths.ts:71-97）：
 * 取 cwd 相对 home 的路径，把 `/`、`\`、`:` 全替换为 `-`，再加前缀 `-`。
 * 例：`/home/deploy/workspace/test`（home=/home/deploy）→ `-workspace-test`。
 *
 * 返回 null 表示该路径不在 home 内（omp 对 home 外路径走 legacy 绝对编码，Phase 1 不支持
 * ——PROJECTS_ROOT 在本项目部署内，越界场景返回空历史即可）。
 */
export const ompSessionSlug = (projectPath: string, home: string = homedir()): string | null => {
  const rel = relative(home, projectPath);
  if (rel === "") return "-";
  if (rel.startsWith("..") || isAbsolute(rel)) return null;
  return `-${rel.replace(/[/\\:]/g, "-")}`;
};

/** 提取 user 消息文本（content 为 string 直取；block 数组拼 text block）。 */
const userMessageText = (content: unknown): string => {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((b) =>
        typeof b === "object" && b !== null && (b as { type?: string }).type === "text"
          ? ((b as { text?: string }).text ?? "")
          : "",
      )
      .filter(Boolean)
      .join("\n");
  }
  return "";
};

type OmpHistoryPartial = {
  acpSessionId: string;
  title: string | null;
  firstMessage: string | null;
  startedAt: string | null;
};

/**
 * 解析单个 omp 会话文件头部：title slot / session header / 首条 user 消息。
 * 文件名 `<fileSafeTs>_<sessionId>.jsonl`——sessionId 取末段（uuid），fileSafeTs 是备用的
 * startedAt 回退。
 */
const extractOmpEntry = async (
  filePath: string,
  fileName: string,
): Promise<OmpHistoryPartial | null> => {
  let handle;
  try {
    handle = await openFile(filePath, "r");
    const buf = Buffer.alloc(HEAD_BYTES);
    const { bytesRead } = await handle.read(buf, 0, HEAD_BYTES, 0);
    const text = buf.subarray(0, bytesRead).toString("utf8");

    let title: string | null = null;
    let sessionId: string | null = null;
    let startedAt: string | null = null;
    let firstMessage: string | null = null;

    // 逐行解析；末行可能被 HEAD_BYTES 截断（JSON.parse 失败即跳过，不影响已得字段）。
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      let entry: Record<string, unknown>;
      try {
        entry = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue;
      }
      const type = entry.type;
      if (type === "title") {
        const t = typeof entry.title === "string" ? entry.title.trim() : "";
        if (t) title = t;
      } else if (type === "session") {
        if (typeof entry.id === "string") sessionId = entry.id;
        if (typeof entry.timestamp === "string") startedAt = entry.timestamp;
      } else if (type === "message") {
        const message = entry.message as { role?: string; content?: unknown } | undefined;
        if (message?.role === "user") {
          const raw = userMessageText(message.content).trim();
          if (raw) {
            firstMessage = raw.slice(0, FIRST_MESSAGE_MAX_LEN);
            if (!startedAt && typeof entry.timestamp === "string") startedAt = entry.timestamp;
            break; // 首条 user 消息到手即止
          }
        }
      }
    }

    // sessionId 以文件名为权威（session header 的 id 字段同值，文件名更稳）。
    if (!sessionId) {
      const uuidPart = fileName.slice(0, -6).split("_").at(-1);
      if (uuidPart) sessionId = uuidPart;
    }
    if (!sessionId) return null;

    return { acpSessionId: sessionId, title, firstMessage, startedAt };
  } catch {
    return null;
  } finally {
    await handle?.close();
  }
};

/**
 * 列出项目历史 omp session（与 listAgentHistory 同签名同返回形状，供 session-routes 合流）。
 * activeAcpSessionMap：acpSessionId → 活跃 agent session id，用于 hasActiveSession/activeSessionId。
 */
export async function listOmpHistory(
  projectPath: string,
  activeAcpSessionMap: Map<string, string>,
  range: AgentHistoryRange = "week",
): Promise<AgentHistoryEntry[]> {
  const slug = ompSessionSlug(projectPath);
  if (!slug) return []; // 项目不在 home 内 → omp 无对应会话目录

  const dir = join(homedir(), ".omp", "agent", "sessions", slug);

  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }

  const jsonlNames = files.filter((f) => f.endsWith(".jsonl"));
  if (jsonlNames.length === 0) return [];

  const windowMs = RANGE_WINDOW_MS[range];
  const now = Date.now();
  type Statted = { path: string; name: string; mtimeMs: number; size: number };
  const candidates: Statted[] = [];
  for (const name of jsonlNames) {
    try {
      const info = await stat(join(dir, name));
      if (now - info.mtimeMs > windowMs) continue;
      candidates.push({ path: join(dir, name), name, mtimeMs: info.mtimeMs, size: info.size });
    } catch {
      // stat 失败（文件被删/权限）→ 跳过
    }
  }

  const partials = await Promise.all(candidates.map((c) => extractOmpEntry(c.path, c.name)));

  return partials
    .map((p, i) => {
      if (!p) return null;
      const c = candidates[i];
      const activeSessionId = activeAcpSessionMap.get(p.acpSessionId);
      const entry: AgentHistoryEntry = {
        provider: "omp",
        acpSessionId: p.acpSessionId,
        title: p.title,
        firstMessage: p.firstMessage,
        startedAt: p.startedAt,
        lastActivityAt: new Date(c.mtimeMs).toISOString(),
        fileSize: c.size,
        hasActiveSession: activeSessionId !== undefined,
        activeSessionId,
      };
      return entry;
    })
    .filter((e): e is AgentHistoryEntry => e !== null)
    .sort((a, b) => {
      const aTime = a.lastActivityAt ?? a.startedAt ?? "";
      const bTime = b.lastActivityAt ?? b.startedAt ?? "";
      return bTime.localeCompare(aTime);
    });
}
