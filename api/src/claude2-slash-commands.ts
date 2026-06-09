import { readFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import type { SlashCommandInfo } from "@agents-remote/shared";

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)---/;

function parseFrontmatter(text: string): Record<string, string> {
  const match = text.match(FRONTMATTER_RE);
  if (!match) return {};
  const result: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim();
    let value = line.slice(colon + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) result[key] = value;
  }
  return result;
}

const BUILTIN: Record<string, string> = {
  compact: "Compact conversation context",
  help: "Show available commands",
  status: "Show current session status",
  model: "Switch AI model",
  permission: "Change permission mode",
  clear: "Clear conversation history",
  bug: "Report a bug",
  doctor: "Check Claude Code health",
  config: "Manage configuration",
  cost: "Show token usage",
  init: "Initialize project",
  login: "Login to account",
  logout: "Logout from account",
  memory: "Manage persistent memory",
  mcp: "Manage MCP servers",
  "pr-comments": "View PR comments",
  review: "Code review",
  "terminal-setup": "Setup terminal integration",
  vim: "Toggle vim keybindings",
  fast: "Toggle fast mode",
  conversations: "List conversations",
};

async function scanDir(dir: string): Promise<Record<string, string>> {
  const results: Record<string, string> = {};
  try {
    const entries = await readdir(dir);
    for (const entry of entries) {
      if (!entry.endsWith(".md")) continue;
      const filePath = resolve(dir, entry);
      let fileStat;
      try {
        fileStat = await stat(filePath);
      } catch {
        continue;
      }
      if (!fileStat.isFile()) continue;
      try {
        const content = await readFile(filePath, "utf8");
        const fm = parseFrontmatter(content);
        if (fm.description) {
          results[entry.replace(/\.md$/, "")] = fm.description;
        }
      } catch {
        // skip unreadable files
      }
    }
  } catch {
    // directory doesn't exist — no user commands
  }
  return results;
}

export async function resolveSlashCommandDescriptions(
  projectRoot: string,
  slashCommands: string[],
  skills: string[],
): Promise<SlashCommandInfo[]> {
  const userCmdDir =
    process.env.CLAUDE_CODE_USER_CMDS_DIR ??
    resolve(process.env.HOME ?? "/root", ".claude", "commands");
  const projectCmdDir = resolve(projectRoot, ".claude", "commands");

  const [userDescs, projectDescs] = await Promise.all([
    scanDir(userCmdDir),
    projectCmdDir !== userCmdDir
      ? scanDir(projectCmdDir)
      : Promise.resolve({} as Record<string, string>),
  ]);

  const result: SlashCommandInfo[] = [];
  for (const cmd of slashCommands) {
    const name = cmd.replace(/^\/+/, "");
    const desc = projectDescs[name] ?? userDescs[name] ?? BUILTIN[name] ?? "";
    result.push({ name, description: desc, kind: "command" });
  }
  for (const skill of skills) {
    const name = skill.replace(/^\/+/, "");
    result.push({ name, description: "Skill", kind: "skill" });
  }
  return result;
}
