import { open as openFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { readdir, stat } from "node:fs/promises";
import type { AgentHistoryEntry } from "@agents-remote/shared";

const MAX_SCAN_LINES = 200;

export async function listAgentHistory(
  projectPath: string,
  activeClaudeSessionMap: Map<string, string>,
): Promise<AgentHistoryEntry[]> {
  const slug = projectToSlug(projectPath);
  const dir = join(homedir(), ".claude", "projects", slug);

  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }

  const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));
  const entries = await Promise.all(
    jsonlFiles.map((f) => extractEntry(join(dir, f), f.slice(0, -6), activeClaudeSessionMap)),
  );

  return entries
    .filter((e): e is AgentHistoryEntry => e !== null)
    .sort((a, b) => {
      const aTime = a.lastActivityAt ?? a.startedAt ?? "";
      const bTime = b.lastActivityAt ?? b.startedAt ?? "";
      return bTime.localeCompare(aTime);
    });
}

async function extractEntry(
  filePath: string,
  claudeSessionId: string,
  activeMap: Map<string, string>,
): Promise<AgentHistoryEntry | null> {
  let title: string | null = null;
  let firstMessage: string | null = null;
  let startedAt: string | null = null;
  let messageCount = 0;

  try {
    const handle = await openFile(filePath, "r");
    try {
      let lineIndex = 0;
      for await (const line of handle.readLines()) {
        if (lineIndex >= MAX_SCAN_LINES) break;
        try {
          const msg = JSON.parse(line) as Record<string, unknown>;
          if (msg.type === "ai-title" && typeof msg.aiTitle === "string") {
            title = msg.aiTitle;
          }
          if (msg.type === "user" && msg.message && typeof msg.message === "object") {
            messageCount++;
            if (!startedAt && typeof msg.timestamp === "string") {
              startedAt = msg.timestamp;
            }
            if (!firstMessage) {
              firstMessage = extractUserText(msg.message as Record<string, unknown>);
            }
          }
        } catch {
          // skip malformed
        }
        lineIndex++;
      }
    } finally {
      await handle.close();
    }
  } catch {
    return null;
  }

  let lastActivityAt: string | null = null;
  try {
    const info = await stat(filePath);
    lastActivityAt = info.mtime.toISOString();
  } catch {
    // use startedAt as fallback
  }

  if (firstMessage && firstMessage.length > 120) {
    firstMessage = firstMessage.slice(0, 120) + "…";
  }

  const activeSessionId = activeMap.get(claudeSessionId);

  return {
    claudeSessionId,
    title,
    firstMessage,
    startedAt,
    lastActivityAt,
    messageCount,
    hasActiveSession: activeSessionId !== undefined,
    activeSessionId,
  };
}

function extractUserText(message: Record<string, unknown>): string | null {
  const content = message.content;
  if (!Array.isArray(content)) return null;
  for (const block of content) {
    if (
      typeof block === "object" &&
      block !== null &&
      (block as Record<string, unknown>).type === "text" &&
      typeof (block as Record<string, unknown>).text === "string"
    ) {
      return (block as Record<string, unknown>).text as string;
    }
  }
  return null;
}

export const projectToSlug = (projectPath: string): string => projectPath.replace(/\//g, "-");
