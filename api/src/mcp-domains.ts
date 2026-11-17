import type { McpCapability } from "@agents-remote/shared";

// ar-hub 功能域注册表（渐进式披露批）：L0 instructions 常驻菜单与 L1 guide://<domain>
// 资源的单一数据源。新增/调整功能域只改这张表（仿 HUB_UI_RESOURCES 表驱动模式）。
//
// 分层约定：oneLiner 进常驻菜单（每域一行，控制 token）；guide 按需读取（agent 判断
// 任务相关才拉资源），内容可以详尽。
export type McpDomain = {
  name: McpCapability;
  /** 一句话作用（L0 常驻菜单用，保持单行）。 */
  oneLiner: string;
  /** 域指南 markdown（L1 资源，按需读）。 */
  guide: string;
};

const WIKI_GUIDE = `# wiki

The project knowledge base. Wiki entries are markdown files under the project's \`wiki/\` directory — readable by humans in the web workbench and by agents through these tools.

## Tools
- \`wiki_list\` — list all entries (slug, title, tags, updated).
- \`wiki_search\` — full-text search across titles and bodies; returns up to 3 matching lines per entry.
- \`wiki_read\` — read one entry by slug (frontmatter + markdown body).
- \`wiki_write\` — create or replace an entry (title, optional tags; pass \`overwrite: true\` to replace an existing entry, otherwise existing entries are rejected).

## When to use
- Before answering questions about the project, search the wiki first — curated knowledge beats guessing.
- After learning durable project facts (decisions, conventions, runbooks), write them to the wiki so future sessions inherit them.

## Enablement
If the domain is disabled, calls return a guidance error. Enable it with \`capability_set\` (\`{"capability":"wiki","enabled":true}\`); changes take effect immediately for subsequent calls.`;

const UI_GUIDE = `# ui

Rich card rendering for a selected set of tools. When enabled, tool results carry \`structuredContent\` and tools like \`wiki_read\`, \`git_status\`, \`git_log\`, \`session_overview\`, \`project_settings\`, \`read_file\` and the canvas tools are upgraded to display tools with \`_meta.ui.resourceUri\`, so the web host renders interactive cards (markdown/mermaid previews, canvas editing, settings preview) instead of plain text.

## Notes
- No separate tools to call — the effect is tool-result shaping plus \`ui://\` resources consumed by the host.
- Disable it when a plain-text workflow is preferred; tool results then stay text-only.

## Enablement
\`capability_set\` (\`{"capability":"ui","enabled":true}\`). Takes effect for tool registrations on the next request.`;

const SKILLS_GUIDE = `# skills

Project and user skills exposed over MCP via the SEP-2640 skills extension. Skills are \`SKILL.md\` packages under \`<project>/.claude/skills/\` and \`~/.claude/skills/\` (project wins on name collisions).

## Interface
- MCP methods (not tools): \`skills/list\` (paginated index with digests; the server scans per request, no server-side cache) and \`skills/get\` (one skill's manifest).
- Resources: \`skill://<name>/SKILL.md\` plus the skill's file list, read via standard \`resources/read\`.
- Disabled skills live outside the scanned directories and never appear.

## When to use
List skills before starting a task that a project skill may cover; read the \`SKILL.md\` body when you decide to follow it.

## Enablement
\`capability_set\` (\`{"capability":"skills","enabled":true}\`). Registration face changes on the next request.`;

const GEN_UI_GUIDE = `# gen-ui

Generative UI pages: HTML pages authored for the project and served by the web shell. There are no MCP tools for this domain — enablement gates the HTTP endpoints (\`/gen-ui-file\`, \`/gen-ui-state\`) and installs the \`gen-ui\` skill into the project so agents know how to author pages.

## When to use
When the user asks for a generated page/dashboard for the project, check this domain's status first; if disabled, offer to enable it and guide the user.

## Enablement
\`capability_set\` (\`{"capability":"gen-ui","enabled":true}\`). The gen-ui skill is (re)installed on the next agent spawn.`;

const PAGES_GUIDE = `# pages

Static site publishing for this project. Pages roots map URL path prefixes to directories inside the project, served at \`/p/<project><urlPath>\`. Two tool-level operations:

## Tools
- \`pages_list\` — read the current roots config: \`{ urlPath, fsDir, auth }\` per root plus the serve path prefix.
- \`pages_set_roots\` — replace the whole roots config (array of \`{ urlPath, fsDir, auth }\`). \`auth\` is \`public\` (anyone with the site URL) or \`token\` (requires auth). **Every call requires user approval** — changing what gets published is an outward-facing operation.

## Defaults
- No config file: one default root \`site/\` → \`/\` (\`public\`) is in effect.
- Explicit empty roots array: publishing is turned off (no default fallback).
- \`fsDir\` must be a project-relative directory (no \`..\`, not empty — to avoid exposing the whole disk); duplicate \`urlPath\` values are rejected.

## Notes
- The serve face (\`/p/<project>...\`) is independent of this capability switch — it follows the roots config regardless. This switch only gates the MCP tools.
- Public roots are reachable without authentication by anyone who knows the project URL. Do not publish directories containing secrets.

## Enablement
If the domain is disabled, calls return a guidance error. Enable it with \`capability_set\` (\`{"capability":"pages","enabled":true}\`); changes take effect immediately for subsequent calls.`;

const ADMIN_GUIDE = `# admin

Cross-project administration.

## Observation tools (no approval needed)
- \`project_list\` / \`session_list\` / \`session_read\` — inspect projects, sessions and their recent output.
- \`mcp_list\` — list external MCP servers (user scope from \`~/.claude.json\` and this project's \`.mcp.json\`; pass \`scope\` to narrow).

## Management tools (every call is suspended for user approval)
- \`project_create\` / \`project_delete\` / \`session_create\` / \`session_close\` / \`session_send\`.
- \`mcp_add\` / \`mcp_remove\` / \`mcp_update\` / \`mcp_enable\` / \`mcp_disable\` — manage external MCP servers. \`scope\` is required: \`project\` writes this project's \`.mcp.json\`, \`user\` writes the global \`~/.claude.json\`. Names starting with \`ar-\` are reserved and rejected. \`mcp_disable\`/\`mcp_enable\` move a server's config to a disabled stash and back.

Each management call registers an approval card in the web UI / PWA notification; the call resumes only after the user allows it (deny or 120s timeout returns an error).

## Enablement
**Enabling or disabling the admin domain itself requires user approval** — an agent cannot grant itself (or revoke, unobserved) administrative power. Use \`capability_set\` (\`{"capability":"admin","enabled":true|false}\`) and tell the user to approve the request.`;

export const MCP_DOMAINS: readonly McpDomain[] = [
  {
    name: "wiki",
    oneLiner:
      "Project knowledge base — search, read and write wiki entries stored as markdown in the project.",
    guide: WIKI_GUIDE,
  },
  {
    name: "ui",
    oneLiner:
      "Rich card rendering — upgrades selected tools to interactive UI cards in the web host.",
    guide: UI_GUIDE,
  },
  {
    name: "skills",
    oneLiner: "Project and user skills — list and read SKILL.md packages over MCP (SEP-2640).",
    guide: SKILLS_GUIDE,
  },
  {
    name: "gen-ui",
    oneLiner:
      "Generative UI pages — author and serve project HTML pages rendered by the web shell.",
    guide: GEN_UI_GUIDE,
  },
  {
    name: "pages",
    oneLiner:
      "Static site publishing — inspect and update the project's pages roots config; changes require user approval.",
    guide: PAGES_GUIDE,
  },
  {
    name: "admin",
    oneLiner:
      "Cross-project administration — inspect and manage projects/sessions; changes require user approval.",
    guide: ADMIN_GUIDE,
  },
];

export const domainGuideUri = (name: McpCapability) => `guide://${name}`;

/**
 * 能力域名单（capability 白名单单源）：从域注册表派生。store 的文件归一化白名单与
 * hub `capability_set` 的 z.enum 都消费这份，新增域只改 MCP_DOMAINS（review 收敛：
 * 三处重复清单漏改一处的面）。
 */
export const MCP_CAPABILITY_NAMES: readonly McpCapability[] = MCP_DOMAINS.map((d) => d.name);

/**
 * L0 常驻菜单：域清单 + 实时状态 + 使用引导。每请求按当前 capabilities 拼装
 * （~15 行内）——渐进式披露只把菜单放进上下文，细节走 guide:// 资源与工具。
 */
export function buildArHubInstructions(
  capabilities: Partial<Record<McpCapability, boolean>>,
): string {
  const menu = MCP_DOMAINS.map((domain) => {
    const status = capabilities[domain.name] === true ? "enabled" : "disabled";
    return `- ${domain.name} (${status}): ${domain.oneLiner}`;
  });
  return [
    "ar-hub is the MCP server for this workspace project. Capability domains are listed below (this menu is always here; drill into details only when a task needs them):",
    ...menu,
    "",
    "Operating rules:",
    "- Domain operation tools may still be listed while their domain is disabled — calling one returns a guidance error explaining how to enable it. That is expected, not a failure; follow the guidance.",
    "- Use `capability_list` for live status, and `capability_set` to enable/disable a domain. Changing `admin` (either direction) requires user approval.",
    "- Read the `guide://<domain>` resource for that domain's full guide (tools, scenarios, enablement) before first use or when unsure.",
  ].join("\n");
}
