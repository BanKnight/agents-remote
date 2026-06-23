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

type CommandDescs = Record<string, string>;
type SkillEntry = { name: string; description: string };

async function scanDir(dir: string): Promise<CommandDescs> {
  const results: CommandDescs = {};
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

// Read each `<dir>/<name>/SKILL.md` frontmatter. Skills are directories; the
// authoritative name is the frontmatter `name`, falling back to the dir name.
// Unlike system.init (which lists skill NAMES with no description), this reads
// the real description the CLI itself uses for discovery.
async function scanSkillDir(dir: string): Promise<SkillEntry[]> {
  const results: SkillEntry[] = [];
  try {
    const entries = await readdir(dir);
    for (const entry of entries) {
      const skillMdPath = resolve(dir, entry, "SKILL.md");
      let skillStat;
      try {
        skillStat = await stat(skillMdPath);
      } catch {
        continue;
      }
      if (!skillStat.isFile()) continue;
      try {
        const content = await readFile(skillMdPath, "utf8");
        const fm = parseFrontmatter(content);
        results.push({ name: fm.name || entry, description: fm.description ?? "" });
      } catch {
        // skip unreadable
      }
    }
  } catch {
    // no skills directory
  }
  return results;
}

// Path to the Claude Code plugin registry (`~/.claude/plugins/installed_plugins.json`).
// Plugins contribute namespaced slash commands and skills (e.g. `commit-commands:commit`)
// that system.init reports with the `plugin-name:entry` prefix; scanning them here keeps
// the catalog aligned with what the CLI advertises.
function installedPluginsJsonPath(): string {
  return resolve(process.env.HOME ?? "/root", ".claude", "plugins", "installed_plugins.json");
}

async function readPluginName(installPath: string): Promise<string | undefined> {
  try {
    const text = await readFile(resolve(installPath, ".claude-plugin", "plugin.json"), "utf8");
    const pkg = JSON.parse(text) as { name?: string };
    return typeof pkg.name === "string" ? pkg.name : undefined;
  } catch {
    return undefined;
  }
}

// Scan every installed plugin's commands/*.md + skills/*/SKILL.md. Each entry is
// registered as `pluginName:entry` to match the namespaced name the CLI reports.
// Plugin names are self-prefixed, so they never collide with bare project/user names.
async function scanPlugins(pluginsJsonPath: string): Promise<SlashCommandInfo[]> {
  let doc: { plugins?: Record<string, Array<{ installPath?: string }>> };
  try {
    doc = JSON.parse(await readFile(pluginsJsonPath, "utf8"));
  } catch {
    return []; // no plugin registry / unreadable
  }
  const result: SlashCommandInfo[] = [];
  const seen = new Set<string>();
  for (const entries of Object.values(doc.plugins ?? {})) {
    const installPath = entries[0]?.installPath;
    if (!installPath) continue;
    const pluginName = await readPluginName(installPath);
    if (!pluginName) continue;
    const [cmds, skills] = await Promise.all([
      scanDir(resolve(installPath, "commands")),
      scanSkillDir(resolve(installPath, "skills")),
    ]);
    for (const [entry, desc] of Object.entries(cmds)) {
      const name = `${pluginName}:${entry}`;
      if (seen.has(name)) continue;
      seen.add(name);
      result.push({ name, description: desc, kind: "command" });
    }
    for (const s of skills) {
      const name = `${pluginName}:${s.name}`;
      if (seen.has(name)) continue;
      seen.add(name);
      result.push({ name, description: s.description, kind: "skill" });
    }
  }
  return result;
}

function userCommandsDir(): string {
  return (
    process.env.CLAUDE_CODE_USER_CMDS_DIR ??
    resolve(process.env.HOME ?? "/root", ".claude", "commands")
  );
}

function userSkillsDir(): string {
  return resolve(process.env.HOME ?? "/root", ".claude", "skills");
}

/**
 * Full skill + slash-command catalog with real descriptions. Covers four sources:
 *   - project  `.claude/commands/` and `.claude/skills/` (command .md + SKILL.md)
 *   - user     `~/.claude/commands/` and `~/.claude/skills/`
 *   - plugins  `~/.claude/plugins/` (namespaced `pluginName:entry`)
 *   - builtin  the BUILTIN command table
 * system.init lists names only; this reads SKILL.md / command frontmatter for the
 * real descriptions the CLI itself uses, so the slash menu shows meaningful text
 * even under windowing (where system.init may be absent from the replayed tail).
 * See docs/design/message-replay.md 「特殊时期 history 缩容」.
 *
 * `userDirs` overrides the scan roots for hermetic testing:
 *   - commands/skills: user-level dirs
 *   - pluginsJson: path to an installed_plugins.json registry
 */
export async function resolveSkillSlashCatalog(
  projectRoot: string,
  userDirs?: { commands?: string; skills?: string; pluginsJson?: string },
): Promise<SlashCommandInfo[]> {
  const projectCmdDir = resolve(projectRoot, ".claude", "commands");
  const projectSkillDir = resolve(projectRoot, ".claude", "skills");
  const userCmd = userDirs?.commands ?? userCommandsDir();
  const userSkill = userDirs?.skills ?? userSkillsDir();
  const pluginsJson = userDirs?.pluginsJson ?? installedPluginsJsonPath();

  const [projectCmds, userCmds, projectSkills, userSkills, plugins] = await Promise.all([
    scanDir(projectCmdDir),
    projectCmdDir !== userCmd ? scanDir(userCmd) : Promise.resolve({} as CommandDescs),
    scanSkillDir(projectSkillDir),
    projectSkillDir !== userSkill ? scanSkillDir(userSkill) : Promise.resolve([]),
    scanPlugins(pluginsJson),
  ]);

  const result: SlashCommandInfo[] = [];
  const seen = new Set<string>();

  // Commands: project > user > builtin (project wins on name clash).
  for (const [name, desc] of Object.entries(projectCmds)) {
    result.push({ name, description: desc, kind: "command" });
    seen.add(name);
  }
  for (const [name, desc] of Object.entries(userCmds)) {
    if (seen.has(name)) continue;
    result.push({ name, description: desc, kind: "command" });
    seen.add(name);
  }
  for (const [name, desc] of Object.entries(BUILTIN)) {
    if (seen.has(name)) continue;
    result.push({ name, description: desc, kind: "command" });
  }

  // Skills: project > user (project wins on name clash).
  seen.clear();
  for (const s of projectSkills) {
    if (seen.has(s.name)) continue;
    result.push({ name: s.name, description: s.description, kind: "skill" });
    seen.add(s.name);
  }
  for (const s of userSkills) {
    if (seen.has(s.name)) continue;
    result.push({ name: s.name, description: s.description, kind: "skill" });
    seen.add(s.name);
  }

  // Plugins: namespaced `pluginName:entry` — self-prefixed, so they never collide
  // with the bare names above; append all.
  for (const p of plugins) {
    result.push(p);
  }

  return result;
}
