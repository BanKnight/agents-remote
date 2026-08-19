import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseSessionEntries } from "@earendil-works/pi-coding-agent";
import type { SessionMessageEntry } from "@earendil-works/pi-coding-agent";

/**
 * pi JSONL 历史回放（设计 docs/design/workbench-views.md §3.1 Phase 4）。
 *
 * 读 `chat-sessions/pi-jsonl/<chatId>/` 下的 session JSONL，把 message entry 合成与 live 流
 * 同形的 `pi_event` 帧（`message_start` + `message_end` 成对，同一 message）——**单一管道
 * 原则**：client 用同一个处理函数消费 history 与 live，无平行分支。
 *
 * 正常路径一个 chatId 目录只有一个 JSONL（`SessionManager.continueRecent` 追加写最近文件）；
 * 异常残留多文件时按文件名（时间戳前缀）排序合并，防御性完整。非 message 条目
 * （session header / compaction / label / model_change / custom）Phase 4 跳过。
 */
export async function readPiHistoryLines(sessionDir: string): Promise<string[]> {
  let files: string[];
  try {
    files = await readdir(sessionDir);
  } catch {
    return [];
  }
  const lines: string[] = [];
  for (const file of files.filter((f) => f.endsWith(".jsonl")).sort()) {
    let content: string;
    try {
      content = await readFile(join(sessionDir, file), "utf8");
    } catch {
      // 单文件读失败不拖垮整个回放（跳过，其余文件继续）。
      continue;
    }
    // parseSessionEntries = SDK 的 loadEntriesFromFile 主体（后者仅内部使用不导出）。
    // 解析失败抛错由调用方决定（文件损坏 vs 目录缺失语义不同）。
    const entries = parseSessionEntries(content);
    for (const entry of entries) {
      if (entry.type !== "message") continue;
      const { message } = entry as SessionMessageEntry;
      // 与 toPiEventFrame 产出同形（pi-events.ts）：历史合成直接构造终态事件对。
      lines.push(JSON.stringify({ type: "pi_event", event: { type: "message_start", message } }));
      lines.push(JSON.stringify({ type: "pi_event", event: { type: "message_end", message } }));
    }
  }
  return lines;
}
