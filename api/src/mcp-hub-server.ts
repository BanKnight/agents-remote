import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { homedir } from "node:os";
import { z } from "zod";
import type { CanvasElement } from "@agents-remote/shared";
import {
  CANVAS_APP_URI,
  FILE_PREVIEW_UI_URI,
  GIT_LOG_UI_URI,
  GIT_STATUS_UI_URI,
  HUB_UI_RESOURCES,
  SESSION_OVERVIEW_UI_URI,
  SETTINGS_PREVIEW_UI_URI,
  WIKI_PAGE_UI_URI,
} from "./mcp-app-templates.js";
import { readProjectMcpConfig } from "./mcp-config.js";
import {
  collectProjectSkills,
  decodeSkillCursor,
  findHubSkill,
  readSkillResourceText,
  resolveSkillResource,
  skillsPageSize,
  type HubSkill,
} from "./mcp-skills.js";
import { resolveProjectRelativePath } from "./project-paths.js";
import {
  CANVAS_MAX_ELEMENTS,
  CANVAS_MAX_OPERATIONS,
  ProjectCanvasError,
  ProjectCanvasService,
} from "./project-canvas.js";
import { ProjectGitDiffService } from "./project-git-diff.js";
import { ProjectFilesService } from "./project-files.js";
import { ProjectWikiService } from "./project-wiki.js";
import { listProjectMcpServers } from "./mcp-management.js";
import type { SessionRegistry } from "./session-registry.js";

/**
 * MCP Hub 基座 server —— 无状态 Streamable HTTP,绑 127.0.0.1,只给本机 agent 用。
 *
 * - 传输:`WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined })` = 无状态
 *   (不返 Mcp-Session-Id,Claude Code 不会 pin session id,hub 重启/再平衡不崩)。
 * - 进程模型:api 进程内独立 Bun.serve,不暴露于 Cloudflare Tunnel(tunnel 只转发 api 端口)。
 * - project 上下文:URL `/mcp/{project}` 第一段,每请求重新过 resolveProjectRelativePath
 *   做 realpath 二次校验(不信任任何快照)。
 * - 安全世界:wiki_* 工具 handler 从闭包拿 project,再过 wikiService 内部 resolver(不信任快照)。
 * - Origin/Host 校验:防 DNS rebinding,只接受 loopback。
 *
 * 能力域工具按 per-project mcp.json 的 capabilities 开关注册(wiki:list/read/write;
 * ui:MCP Apps 扩展声明 + `ui://ar-hub/*` 资源供给 + wiki_read_page 的 UI 关联;
 * skills:SEP-2640 扩展声明 + skills/list-get + skill:// 资源读取,数据源 = 本地
 * skills 同一批磁盘文件,见 mcp-skills.ts);
 * 未开启的 project 仍是空壳(agent 自带文件工具且 cwd=projectPath,基线文件读写不进 hub)。
 * 后续能力域(browser 等)按同一 capabilities 开关在此扩展。
 *
 * 定位见 docs/research/inbox/mcp-hub-positioning.md。
 */

export type McpHubServer = {
  port: number;
  stop: () => void;
};

export type StartMcpHubServerOptions = {
  port: number;
  projectsRoot: string;
  // wiki 能力域单一数据源:MCP 工具(producer)与 HTTP 路由(consumer)共享同一 service。
  wikiService: ProjectWikiService;
  // git 能力域数据源(display tool git_status/git_log 的 producer)。可选:不注入则
  // 不注册 git 工具(测试可只测 wiki 面)。
  gitDiffService?: ProjectGitDiffService;
  // session_overview display tool 的数据源。可选:不注入则不注册该工具。
  sessionRegistry?: SessionRegistry;
  // read_file display tool 的数据源。可选:不注入则不注册该工具。
  filesService?: ProjectFilesService;
  // 画布四工具的数据源（M2.1）。可选:不注入则不注册(测试可只测 wiki 面)。
  canvasService?: ProjectCanvasService;
  // skills 全局 scope 的 home 定位(~/.claude/skills),测试注入临时目录;缺省 homedir()。
  home?: string;
};

const MCP_PATH_PREFIX = "/mcp/";

/** MCP Apps（SEP-1865）扩展标识与 UI 资源媒体类型。 */
const MCP_APPS_EXTENSION = "io.modelcontextprotocol/ui";
const MCP_APP_MIME_TYPE = "text/html;profile=mcp-app";
/** Skills over MCP（SEP-2640）扩展标识。不声明 directoryRead(可选方法 resources/directory/read 不做)。 */
const MCP_SKILLS_EXTENSION = "io.modelcontextprotocol/skills";
/** SEP-2549 CacheableResult REQUIRED 字段(skills/list-get 响应;与 tools/list 同语义)。 */
const SKILLS_TTL_MS = 300_000;
// 模板与 HUB_UI_RESOURCES 单源已迁至 ./mcp-app-templates.ts（铺卡批,2026-10-21）:
// buildCardTemplate(spec) = 共享基座（桥/握手/主题/高度/locale/刷新/追问）+ 按 kind
// 渲染段 + 轻重库开关（轻 = 零库结构化卡,富 = marked+DOMPurify+mermaid,构建期内联）。
// wiki-page 产物行为以模板探针 26/26 为回归标准。
export { HUB_UI_RESOURCES } from "./mcp-app-templates.js";

/**
 * wiki 页 → display tool structuredContent 包装（hub registerTool 与 api 侧
 * HUB_APP_TOOLS 白名单代理共用,防两处漂移）。字段契约 = 模板 render() 消费的
 * kind/slug/title/tags/markdown。
 */
export const wikiPageStructuredContent = (page: {
  slug: string;
  frontmatter: { title: string; tags: string[] };
  body: string;
}) => ({
  kind: "wiki-page" as const,
  slug: page.slug,
  title: page.frontmatter.title,
  tags: page.frontmatter.tags,
  markdown: page.body,
});

/**
 * git 变更 → git-status 卡 structuredContent（hub registerTool 与 api 侧 HUB_APP_TOOLS
 * 代理共用,防两处漂移）。clean = files 空(工作区/staged/untracked 全净);branch 取
 * GitBranchStatus.name(detached 降级仍有名)。
 */
export const gitStatusStructuredContent = (list: {
  files: {
    path: string;
    status: string;
    scope: string;
    addedLines: number | null;
    removedLines: number | null;
  }[];
  branch?: { name: string };
}) => ({
  kind: "git-status" as const,
  branch: list.branch?.name,
  clean: list.files.length === 0,
  files: list.files.map((f) => ({
    path: f.path,
    status: f.status,
    scope: f.scope,
    addedLines: f.addedLines,
    removedLines: f.removedLines,
  })),
});

/**
 * git 提交历史 → git-log 卡 structuredContent(共用同上)。commits 裁到卡契约四字段
 * (isoDate 等不进卡)。
 */
export const gitLogStructuredContent = (log: {
  branch: string;
  total: number;
  commits: { hash: string; message: string; author: string; relativeTime: string }[];
}) => ({
  kind: "git-log" as const,
  branch: log.branch,
  total: log.total,
  commits: log.commits.map((c) => ({
    hash: c.hash,
    message: c.message,
    author: c.author,
    relativeTime: c.relativeTime,
  })),
});

/**
 * 会话候选 → session-overview 卡 structuredContent（hub registerTool 与 api 侧
 * HUB_APP_TOOLS 代理共用,防两处漂移）。registry 是全局单例,project 维度收窄在此
 * 做;counts 按 status 归并;sessions 裁到卡契约四字段（sessionId/provider 等不进卡）。
 */
export const sessionOverviewStructuredContent = (
  projectName: string,
  candidates: {
    projectName: string;
    displayName: string;
    type: string;
    status: string;
    updatedAt?: string;
  }[],
) => {
  const scoped = candidates.filter((c) => c.projectName === projectName);
  const counts: Record<string, number> = {};
  for (const s of scoped) {
    counts[s.status] = (counts[s.status] ?? 0) + 1;
  }
  return {
    kind: "session-overview" as const,
    projectName,
    counts,
    sessions: scoped.map((s) => ({
      displayName: s.displayName,
      type: s.type,
      status: s.status,
      updatedAt: s.updatedAt,
    })),
  };
};

/**
 * 项目 MCP 配置 → settings-preview 卡 structuredContent(共用同上)。
 * 安全红线:mcpServers 只取 {name,type}——command/args/env/url/headers 等命令行与
 * 密钥面绝不进卡（密钥不入库、不回显）;capabilities 值恒 boolean,原样透传。
 */
export const settingsPreviewStructuredContent = (
  projectName: string,
  capabilities: Partial<Record<string, boolean>> | undefined,
  servers: { name: string; type: string }[],
) => ({
  kind: "settings-preview" as const,
  projectName,
  capabilities: capabilities ?? {},
  mcpServers: servers.map((s) => ({ name: s.name, type: s.type })),
});

/**
 * 文件预览 → file-preview 卡 structuredContent(共用同上)。只有 text 分支进卡;
 * image/unsupported/too_large 由调用方回退纯 text(web 侧 kind 守卫不命中 → 通用卡)。
 * content 全文进卡(卡面即预览),md 文件由模板富渲染,其余按代码 fence 渲染。
 */
export const filePreviewStructuredContent = (preview: {
  type: string;
  path: string;
  name: string;
  size: number;
  content?: string;
}) => ({
  kind: "file-preview" as const,
  path: preview.path,
  name: preview.name,
  size: preview.size,
  content: preview.content ?? "",
});

/** 非 text 文件的纯 text 回退文案(hub/api 双面 handler 共用,防逐字漂移)。 */
export const filePreviewFallbackText = (preview: {
  type: string;
  name: string;
  limitBytes?: number;
}): string =>
  preview.type === "image"
    ? `Image file (not previewable in card): ${preview.name}`
    : preview.type === "too_large"
      ? `File too large to preview: ${preview.name} (${preview.limitBytes} byte limit)`
      : `Unsupported file type: ${preview.name}`;

/**
 * 画布场景 → canvas 卡 structuredContent（hub registerTool 与 api 侧 HUB_APP_TOOLS
 * 白名单代理共用，防两处漂移）。SEP-1865 上限：初始 structuredContent 64KiB——
 * 超限时元素降级为摘要（id/type/x/y/width/height）+ truncated 标记，模板（M2.2）
 * 据 truncated 走 read_scene 拉全量；text content 侧恒全量（模型消费面）。
 */
const CANVAS_SC_MAX_BYTES = 48 * 1024;

export const canvasSceneStructuredContent = (scene: {
  id: string;
  title: string;
  revision: number;
  elements: CanvasElement[];
}): Record<string, unknown> => {
  const full = {
    kind: "canvas-doc" as const,
    id: scene.id,
    title: scene.title,
    revision: scene.revision,
    elementCount: scene.elements.length,
    elements: scene.elements,
  };
  if (Buffer.byteLength(JSON.stringify(full), "utf8") <= CANVAS_SC_MAX_BYTES) {
    return full;
  }
  return {
    kind: "canvas-doc" as const,
    id: scene.id,
    title: scene.title,
    revision: scene.revision,
    elementCount: scene.elements.length,
    elements: scene.elements.map(canvasElementSummary),
    truncated: true,
  };
};

/** 元素摘要（truncated 降级面 + 卡片选择态回显用）。 */
export const canvasElementSummary = (element: CanvasElement): Record<string, unknown> => {
  const pick = (key: string) =>
    typeof (element as Record<string, unknown>)[key] === "number"
      ? (element as Record<string, unknown>)[key]
      : undefined;
  return {
    id: element.id,
    type: typeof element.type === "string" ? element.type : "unknown",
    ...(pick("x") !== undefined ? { x: pick("x") } : {}),
    ...(pick("y") !== undefined ? { y: pick("y") } : {}),
    ...(pick("width") !== undefined ? { width: pick("width") } : {}),
    ...(pick("height") !== undefined ? { height: pick("height") } : {}),
  };
};

/**
 * settings-preview 卡数据读取(hub/api 双面 handler 共用):config 非法/缺失降级空面,
 * server 列表读取失败降级 [](预览卡不因 config 问题失败)。返回值只含塑形输入,
 * 密钥面剥离在 settingsPreviewStructuredContent。
 */
export const readSettingsPreviewData = async (
  projectsRoot: string,
  project: string,
): Promise<{
  capabilities: Partial<Record<string, boolean>> | undefined;
  servers: { name: string; type: string }[];
}> => {
  let capabilities: Partial<Record<string, boolean>> | undefined;
  try {
    capabilities = (await readProjectMcpConfig(projectsRoot, project))?.capabilities;
  } catch {
    capabilities = {};
  }
  let servers: { name: string; type: string }[] = [];
  try {
    const listed = await listProjectMcpServers(projectsRoot, project);
    servers = listed.servers.map((s) => ({ name: s.name, type: s.type }));
  } catch {
    servers = [];
  }
  return { capabilities, servers };
};

/**
 * 解析 `/mcp/{project}` URL 的 project 段(encoded)。返回 undefined 表示 URL 不合法。
 * project 段强制不含 `/`(一级目录名),允许 encoded 形式。
 */
const parseProjectFromUrl = (url: URL): string | undefined => {
  if (!url.pathname.startsWith(MCP_PATH_PREFIX)) return undefined;
  const encoded = url.pathname.slice(MCP_PATH_PREFIX.length);
  if (encoded.length === 0 || encoded.includes("/")) return undefined;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return undefined;
  }
};

/**
 * 校验请求来源是 loopback(防 DNS rebinding / 非 tunnel 暴露)。
 * hub 只给本机 agent 用,Host header 必须是 127.0.0.1:{port} 或 localhost:{port}。
 */
const isLoopbackRequest = (req: Request, expectedPort: number): boolean => {
  const host = req.headers.get("host");
  if (!host) return false;
  // host 形如 127.0.0.1:43013 / localhost:43013 / [::1]:43013
  const match = host.match(/^(127\.0\.0\.1|localhost|\[::1\])(?::(\d+))?$/i);
  if (!match) return false;
  // 有端口段时必须匹配;无端口段(HTTP 默认 80)不是我们的情况,拒绝。
  if (match[2] === undefined) return false;
  return Number(match[2]) === expectedPort;
};

/**
 * wiki_* 工具内部 ProjectWikiError(越界 slug / 页不存在 / 写冲突等)→ MCP error response。
 * 不抛:工具错误按 MCP 协议作为正常返回传给 agent(isError=true + message),让 agent
 * 看到"页不存在/slug 非法"而非连接崩溃。
 */
const wikiErrorResponse = (error: unknown) => ({
  content: [
    {
      type: "text" as const,
      text: error instanceof Error ? error.message : String(error),
    },
  ],
  isError: true,
});

/**
 * 注册 wiki 能力域三工具(list/read/write)。handler 闭包捕获 project + wikiService,
 * wikiService 每方法内部独立过 resolver(不信任闭包传入的 project 已校验,纵深防御)。
 * page 对象 JSON 序列化进 content text(agent 可直接消费)。
 *
 * uiEnabled 时 wiki_read_page 升级为 display tool(SEP-1865):tool 定义带
 * `_meta.ui.resourceUri`(host 从 tools/list 即知该工具有 UI 关联),结果带
 * structuredContent(MCP tool result 标准字段;经 CLI 流 tool_use_result 原样透传,
 * 是 web 宿主卡片的唯一数据通道——实测 text content 侧会被文本化降级)。
 */
const registerWikiTools = (
  server: McpServer,
  project: string,
  wikiService: ProjectWikiService,
  wikiEnabled: boolean,
  uiEnabled: boolean,
): void => {
  // list/write 仅 wiki 开关注册——display tool 只需 read;ui 单开时 agent 仍不应获得写/列能力。
  if (wikiEnabled) {
    server.registerTool(
      "wiki_list_pages",
      {
        description:
          "List all wiki pages in the current project. Returns { pages: [{ slug, title, tags, updated }] }.",
      },
      async () => {
        const pages = await wikiService.listPages(project);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ pages }) }],
        };
      },
    );

    server.registerTool(
      "wiki_write_page",
      {
        description:
          "Write a wiki page (markdown body; frontmatter title/tags/created/updated auto-injected). Set overwrite=true to replace an existing page; otherwise existing pages are rejected.",
        inputSchema: {
          slug: z.string(),
          title: z.string(),
          content: z.string(),
          tags: z.array(z.string()).optional(),
          overwrite: z.boolean().optional(),
        },
      },
      async ({ slug, title, content, tags, overwrite }) => {
        try {
          const result = await wikiService.writePage(project, slug, {
            slug,
            title,
            content,
            tags,
            overwrite,
          });
          return {
            content: [{ type: "text" as const, text: JSON.stringify(result) }],
          };
        } catch (error) {
          return wikiErrorResponse(error);
        }
      },
    );
  }

  // read 恒注册(调用方保证 wiki||ui 至少一开)。uiEnabled 时升级 display tool(SEP-1865):
  // tool 定义带 `_meta.ui.resourceUri`(host 从 tools/list 即知该工具有 UI 关联),结果带
  // structuredContent(MCP tool result 标准字段;经 CLI 流 tool_use_result 原样透传,
  // 是 web 宿主卡片的唯一数据通道——实测 text content 侧会被文本化降级)。
  server.registerTool(
    "wiki_read_page",
    {
      description:
        "Read a single wiki page by slug. Returns { slug, frontmatter: { title, tags, created, updated }, body }.",
      inputSchema: { slug: z.string() },
      ...(uiEnabled
        ? { _meta: { ui: { resourceUri: WIKI_PAGE_UI_URI, visibility: ["model", "app"] } } }
        : {}),
    },
    async ({ slug }) => {
      try {
        const page = await wikiService.readPage(project, slug);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(page) }],
          ...(uiEnabled ? { structuredContent: wikiPageStructuredContent(page) } : {}),
        };
      } catch (error) {
        return wikiErrorResponse(error);
      }
    },
  );
};

/**
 * 注册 git display tool 两枚(git_status/git_log,铺卡批 2026-10-21)。纯卡片工具——
 * 注册条件 = gitDiffService 注入 && uiEnabled(调用方守卫),无 wiki 那种「无 UI 也有
 * 数据价值」双态,故 _meta 恒带。git_status 非 git 仓库走 listDiff 的 union 分支
 * (纯 text 无 structuredContent,卡片不亮);git_log 非 git 抛 ProjectGitDiffError →
 * wikiErrorResponse 同款 isError 返回(agent 看到语义化错误而非崩溃)。
 */
const registerGitTools = (
  server: McpServer,
  project: string,
  gitDiffService: ProjectGitDiffService,
): void => {
  server.registerTool(
    "git_status",
    {
      description:
        "Summarize the current Git working tree changes (staged + worktree + untracked) of the current project as a UI card. Call this after finishing code edits to show the user what changed.",
      inputSchema: {},
      _meta: { ui: { resourceUri: GIT_STATUS_UI_URI, visibility: ["model", "app"] } },
    },
    async () => {
      const list = await gitDiffService.listDiff(project);
      if (!list.repository) {
        return {
          content: [{ type: "text" as const, text: "Project is not a Git repository" }],
        };
      }
      return {
        content: [{ type: "text" as const, text: JSON.stringify(list) }],
        structuredContent: gitStatusStructuredContent(list),
      };
    },
  );

  server.registerTool(
    "git_log",
    {
      description:
        "Show recent commit history of the current project as a UI card. Optionally limit the number of commits (default 10, max 50).",
      inputSchema: { limit: z.number().int().min(1).max(50).optional() },
      _meta: { ui: { resourceUri: GIT_LOG_UI_URI, visibility: ["model", "app"] } },
    },
    async ({ limit }) => {
      const log = await gitDiffService.listCommits(project, undefined, limit ?? 10);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(log) }],
        structuredContent: gitLogStructuredContent(log),
      };
    },
  );
};

/**
 * 注册 session_overview display tool（会话概览卡,铺卡批第二批 2026-10-21）。
 * 注册条件 = sessionRegistry 注入 && uiEnabled(调用方守卫)。handler 拉全局候选后
 * 按本 project 收窄(收窄在塑形层 sessionOverviewStructuredContent 做)。
 */
const registerSessionTools = (
  server: McpServer,
  project: string,
  sessionRegistry: SessionRegistry,
): void => {
  server.registerTool(
    "session_overview",
    {
      description:
        "Show an overview of all live sessions (agent/terminal) in the current project as a UI card, including per-status counts.",
      inputSchema: {},
      _meta: { ui: { resourceUri: SESSION_OVERVIEW_UI_URI, visibility: ["model", "app"] } },
    },
    async () => {
      const candidates = await sessionRegistry.listAllCandidates();
      const sc = sessionOverviewStructuredContent(project, candidates);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(sc) }],
        structuredContent: sc,
      };
    },
  );
};

/**
 * 注册 project_settings display tool(设置预览卡)。数据源 = 纯读函数(.agents-remote/
 * mcp.json capabilities + 项目根 .mcp.json 外部 server),无需依赖注入——注册条件只看
 * uiEnabled。config 非法/缺失降级空面(与 hub 3b 步同语义:预览卡不因 config 问题失败)。
 * structuredContent 安全红线见 settingsPreviewStructuredContent(只 name/type)。
 */
const registerSettingsTools = (server: McpServer, project: string, projectsRoot: string): void => {
  server.registerTool(
    "project_settings",
    {
      description:
        "Preview the current project's MCP configuration (capability switches and external MCP servers — names and types only, never secrets or commands) as a UI card.",
      inputSchema: {},
      _meta: { ui: { resourceUri: SETTINGS_PREVIEW_UI_URI, visibility: ["model", "app"] } },
    },
    async () => {
      const { capabilities, servers } = await readSettingsPreviewData(projectsRoot, project);
      const sc = settingsPreviewStructuredContent(project, capabilities, servers);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(sc) }],
        structuredContent: sc,
      };
    },
  );
};

/**
 * 注册 read_file display tool(文件预览卡,富模板与 wiki-page 共用同一份 HTML)。
 * 注册条件 = filesService 注入 && uiEnabled。text 分支 → 富渲染卡;image/unsupported/
 * too_large → 纯 text 描述(web kind 守卫不命中 → 通用 MCP 卡回退)。路径越界/不存在等
 * ProjectFilesError → isError 语义化返回(同 wikiErrorResponse 风格,不抛崩连接)。
 */
const registerFileTools = (
  server: McpServer,
  project: string,
  filesService: ProjectFilesService,
): void => {
  server.registerTool(
    "read_file",
    {
      description:
        "Read a file in the current project and show it as a preview card (markdown renders rich; other text files render as code). Paths are project-relative.",
      inputSchema: { path: z.string() },
      _meta: { ui: { resourceUri: FILE_PREVIEW_UI_URI, visibility: ["model", "app"] } },
    },
    async ({ path }) => {
      try {
        const preview = await filesService.previewFile(project, path);
        if (preview.type !== "text") {
          return {
            content: [{ type: "text" as const, text: filePreviewFallbackText(preview) }],
          };
        }
        const sc = filePreviewStructuredContent(preview);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(sc) }],
          structuredContent: sc,
        };
      } catch (error) {
        return wikiErrorResponse(error);
      }
    },
  );
};

/**
 * 注册画布四工具（M2.1，契约 §12.2）：create_diagram / read_scene / apply_operations /
 * export_diagram。注册条件 = canvasService 注入 && uiEnabled。工具结果 text = 全量 JSON
 * （模型消费面）；structuredContent = canvasSceneStructuredContent（卡片面，超限降摘要）。
 * ProjectCanvasError → isError 语义化返回（revision 冲突附重读提示，agent 可自纠重试）。
 */
const registerCanvasTools = (
  server: McpServer,
  project: string,
  canvasService: ProjectCanvasService,
): void => {
  const canvasErrorResponse = (error: unknown) => {
    if (error instanceof ProjectCanvasError) {
      const hint =
        error.code === "PROJECT_CANVAS_REVISION_CONFLICT"
          ? " Re-read the scene (read_scene) and retry with the current revision."
          : "";
      return {
        isError: true as const,
        content: [{ type: "text" as const, text: `[${error.code}] ${error.message}${hint}` }],
      };
    }
    throw error;
  };

  server.registerTool(
    "create_diagram",
    {
      description:
        "Create a canvas diagram document (Excalidraw-style elements) and show it as an interactive canvas card. Returns { id, title, revision, elements }.",
      inputSchema: {
        title: z.string(),
        elements: z.array(z.record(z.string(), z.unknown())).max(CANVAS_MAX_ELEMENTS),
      },
      _meta: { ui: { resourceUri: CANVAS_APP_URI, visibility: ["model", "app"] } },
    },
    async ({ title, elements }) => {
      try {
        const scene = await canvasService.createDiagram(project, { title, elements });
        return {
          content: [{ type: "text" as const, text: JSON.stringify(scene) }],
          structuredContent: canvasSceneStructuredContent(scene),
        };
      } catch (error) {
        return canvasErrorResponse(error);
      }
    },
  );

  server.registerTool(
    "read_scene",
    {
      description:
        "Read the current scene of a canvas document. Pass elementIds to limit the response to a selection (missing ids are ignored). Returns { id, title, revision, elements }.",
      inputSchema: {
        id: z.string(),
        elementIds: z.array(z.string()).max(CANVAS_MAX_ELEMENTS).optional(),
      },
      _meta: { ui: { resourceUri: CANVAS_APP_URI, visibility: ["model", "app"] } },
    },
    async ({ id, elementIds }) => {
      try {
        const scene = await canvasService.readScene(project, id, elementIds);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(scene) }],
          structuredContent: canvasSceneStructuredContent(scene),
        };
      } catch (error) {
        return canvasErrorResponse(error);
      }
    },
  );

  server.registerTool(
    "apply_operations",
    {
      description:
        "Apply add/update/remove operations to canvas elements by stable element id (update is a shallow merge patch; the element id can not be changed). Pass the revision you read as expectedRevision; a mismatch is a conflict — re-read and retry. Pass an operationId to make retries idempotent. Returns the full scene at the new revision.",
      inputSchema: {
        id: z.string(),
        operations: z
          .array(
            z.union([
              z.object({ op: z.literal("add"), element: z.record(z.string(), z.unknown()) }),
              z.object({
                op: z.literal("update"),
                elementId: z.string(),
                patch: z.record(z.string(), z.unknown()),
              }),
              z.object({ op: z.literal("remove"), elementId: z.string() }),
            ]),
          )
          .max(CANVAS_MAX_OPERATIONS),
        expectedRevision: z.number().int().min(1),
        operationId: z.string().optional(),
      },
      _meta: { ui: { resourceUri: CANVAS_APP_URI, visibility: ["model", "app"] } },
    },
    async ({ id, operations, expectedRevision, operationId }) => {
      try {
        const scene = await canvasService.applyOperations(project, id, {
          operations,
          expectedRevision,
          operationId,
        });
        return {
          content: [{ type: "text" as const, text: JSON.stringify(scene) }],
          structuredContent: canvasSceneStructuredContent(scene),
        };
      } catch (error) {
        return canvasErrorResponse(error);
      }
    },
  );

  server.registerTool(
    "export_diagram",
    {
      description:
        "Export a canvas document as native Excalidraw JSON (savable as a .excalidraw file). Optionally verify the revision first.",
      inputSchema: {
        id: z.string(),
        expectedRevision: z.number().int().min(1).optional(),
      },
      _meta: { ui: { resourceUri: CANVAS_APP_URI, visibility: ["model", "app"] } },
    },
    async ({ id, expectedRevision }) => {
      try {
        const exported = await canvasService.exportDiagram(project, id, { expectedRevision });
        return {
          content: [{ type: "text" as const, text: JSON.stringify(exported) }],
        };
      } catch (error) {
        return canvasErrorResponse(error);
      }
    },
  );
};

/**
 * 注册 skills 能力域（SEP-2640 Skills over MCP）:skills/list + skills/get + skill://
 * 资源读取（标准 resources/read——SEP 无 skills/read）。声明扩展即 MUST 实现两方法。
 *
 * SDK 1.30 无任何 skills schema 支持(TS 支持在 typescript-sdk#2818,未发版)——两方法
 * 以自造 zod schema 经 server.server.setRequestHandler 注册(McpServer 暴露的底层 Server
 * 透传;按 method literal 索引,与内部自装的 tools/resources handler 并存,SDK 对非
 * tools/call 走默认注册路径)。官方支持落地后迁移。
 *
 * 数据面走 collectProjectSkills 实时扫描(每请求一次,单请求内三处复用,digest 与内容
 * 必然一致);文件读取在清单里精确命中才读(resolveSkillResource + readSkillResourceText
 * 双道防穿越)。resources/directory/read 有意不做(扩展声明不带 directoryRead)。
 */
const registerSkillResources = (
  server: McpServer,
  project: string,
  projectsRoot: string,
  home: string,
): void => {
  const toEntry = ({ uri, frontmatter, resources }: HubSkill): HubSkill => ({
    uri,
    frontmatter,
    resources,
  });

  server.server.setRequestHandler(
    z.object({
      method: z.literal("skills/list"),
      params: z
        .object({
          cursor: z.string().optional(),
          _meta: z.unknown().optional(),
        })
        .optional(),
    }),
    async (request) => {
      const skills = await collectProjectSkills(projectsRoot, project, home);
      const start = decodeSkillCursor(request.params?.cursor);
      const page = skills.slice(start, start + skillsPageSize());
      return {
        resultType: "complete",
        skills: page.map(toEntry),
        ttlMs: SKILLS_TTL_MS,
        // 本机 per-project 私有数据,cacheScope 用 private(不允许共享缓存跨会话复用)。
        cacheScope: "private",
        ...(start + page.length < skills.length ? { nextCursor: String(start + page.length) } : {}),
      };
    },
  );

  server.server.setRequestHandler(
    z.object({
      method: z.literal("skills/get"),
      params: z.object({ uri: z.string(), _meta: z.unknown().optional() }).optional(),
    }),
    async (request) => {
      const skills = await collectProjectSkills(projectsRoot, project, home);
      const skill = findHubSkill(skills, request.params?.uri ?? "");
      if (!skill) {
        // SEP-2640:非本 server 所服务的 skill → -32602(与 resources/read 未知资源同码)。
        throw new McpError(ErrorCode.InvalidParams, `Unknown skill: ${request.params?.uri ?? ""}`);
      }
      return {
        resultType: "complete",
        skill: toEntry(skill),
        ttlMs: SKILLS_TTL_MS,
        cacheScope: "private",
      };
    },
  );

  // skill:// 文件读取走标准 resources/read。ResourceTemplate `{+resourcePath}` 保留
  // 展开匹配多段路径(实测 SDK 1.30 UriTemplate:skill://name/SKILL.md 与嵌套文件皆
  // 命中);与 ui:// 的精确资源注册并存,SDK 按 uri 先精确后模板分发。
  server.registerResource(
    "skill-files",
    new ResourceTemplate("skill://{+resourcePath}", { list: undefined }),
    { mimeType: "text/markdown" },
    async (uri) => {
      const skills = await collectProjectSkills(projectsRoot, project, home);
      const found = resolveSkillResource(skills, uri.toString());
      if (!found) {
        throw new McpError(ErrorCode.InvalidParams, `Unknown skill resource: ${uri.toString()}`);
      }
      const text = await readSkillResourceText(found.skill, found.relativePath);
      if (text === null) {
        throw new McpError(ErrorCode.InvalidParams, `Unreadable skill resource: ${uri.toString()}`);
      }
      return {
        contents: [{ uri: uri.toString(), mimeType: "text/markdown", text }],
      };
    },
  );
};

/**
 * 为单个请求构造 McpServer(无状态:每请求新建,不缓存)。按能力开关决定 capabilities 与
 * 注册面:全关时空 capabilities(基座空壳行为保留)。uiEnabled 时声明 MCP Apps 扩展
 * (initialize result 的 capabilities.extensions,client 侧据此判定宿主能力)并注册
 * ui:// 资源(Host 经 resources/read 取 HTML 渲染;CLI 2.1.281 起不把 UI 资源列进
 * resources/list,故未开 ui 时无需藏资源——资源本身只在 ui 开时注册)。
 * skillsEnabled 时声明 SEP-2640 扩展(声明即 MUST 同时声明 resources capability,
 * 并实现 skills/list-get)。
 */
const buildRequestServer = (
  project: string,
  wikiService: ProjectWikiService,
  gitDiffService: ProjectGitDiffService | undefined,
  sessionRegistry: SessionRegistry | undefined,
  filesService: ProjectFilesService | undefined,
  canvasService: ProjectCanvasService | undefined,
  wikiEnabled: boolean,
  uiEnabled: boolean,
  skillsEnabled: boolean,
  projectsRoot: string,
  home: string,
): McpServer => {
  const server = new McpServer(
    { name: "ar-hub", version: "0.0.0" },
    {
      capabilities: {
        ...(wikiEnabled || uiEnabled ? { tools: { listChanged: false } } : {}),
        ...(uiEnabled || skillsEnabled ? { resources: { subscribe: false } } : {}),
        ...(uiEnabled || skillsEnabled
          ? {
              extensions: {
                ...(uiEnabled ? { [MCP_APPS_EXTENSION]: { mimeTypes: [MCP_APP_MIME_TYPE] } } : {}),
                ...(skillsEnabled ? { [MCP_SKILLS_EXTENSION]: {} } : {}),
              },
            }
          : {}),
      },
    },
  );
  if (wikiEnabled || uiEnabled) {
    registerWikiTools(server, project, wikiService, wikiEnabled, uiEnabled);
    if (uiEnabled) {
      // resources/read 查 HUB_UI_RESOURCES 单源表——与 HTTP 路由同一份数据,
      // 新增 UI 资源只改表,注册处不复制模板(防复制漂移,2026-10-20 review)。
      for (const [uri, resource] of Object.entries(HUB_UI_RESOURCES)) {
        server.registerResource(uri, uri, { mimeType: resource.mimeType }, async () => ({
          contents: [{ uri, mimeType: resource.mimeType, text: resource.html }],
        }));
      }
    }
  }
  if (skillsEnabled) {
    registerSkillResources(server, project, projectsRoot, home);
  }
  if (gitDiffService && uiEnabled) {
    registerGitTools(server, project, gitDiffService);
  }
  if (sessionRegistry && uiEnabled) {
    registerSessionTools(server, project, sessionRegistry);
  }
  if (uiEnabled) {
    registerSettingsTools(server, project, projectsRoot);
  }
  if (filesService && uiEnabled) {
    registerFileTools(server, project, filesService);
  }
  if (canvasService && uiEnabled) {
    registerCanvasTools(server, project, canvasService);
  }
  return server;
};

export const startMcpHubServer = (options: StartMcpHubServerOptions): McpHubServer => {
  const {
    port,
    projectsRoot,
    wikiService,
    gitDiffService,
    sessionRegistry,
    filesService,
    canvasService,
    home = homedir(),
  } = options;

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port,
    fetch: async (req) => {
      // 实际监听端口(port=0 时由 OS 分配),用于 loopback 校验 + 日志。
      const actualPort = server.port ?? port;

      // 1. 来源校验:只接受 loopback,防 DNS rebinding + 非 tunnel 暴露。
      if (!isLoopbackRequest(req, actualPort)) {
        return new Response("Forbidden", { status: 403 });
      }

      const url = new URL(req.url);

      // 2. URL 匹配 /mcp/{project}。
      const project = parseProjectFromUrl(url);
      if (project === undefined) {
        return new Response("Not found", { status: 404 });
      }

      // 3. project 上下文校验:每请求重新过 resolver(realpath 二次校验防 symlink 漂移)。
      try {
        await resolveProjectRelativePath(projectsRoot, project, "");
      } catch {
        // project 不存在 / 路径越界 / 名非法 → 404(不暴露具体原因给 agent)。
        return new Response("Not found", { status: 404 });
      }

      // 3b. 读 per-project mcp.json 决定注册哪些能力域工具。config 缺失(ENOENT)→ 默认全关;
      //     config 非法(JSON/结构错)→ 降级全关(不阻塞 agent 连接),仅记 warn。
      let wikiEnabled = false;
      let uiEnabled = false;
      let skillsEnabled = false;
      try {
        const config = await readProjectMcpConfig(projectsRoot, project);
        wikiEnabled = config?.capabilities?.wiki === true;
        uiEnabled = config?.capabilities?.ui === true;
        skillsEnabled = config?.capabilities?.skills === true;
      } catch (error) {
        console.warn(
          `[mcp-hub] mcp.json invalid project=${project}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      // 4. 无状态:每请求新建 transport + McpServer,不缓存、不返 session id。
      try {
        const transport = new WebStandardStreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
        });
        const mcp = buildRequestServer(
          project,
          wikiService,
          gitDiffService,
          sessionRegistry,
          filesService,
          canvasService,
          wikiEnabled,
          uiEnabled,
          skillsEnabled,
          projectsRoot,
          home,
        );
        await mcp.connect(transport);
        return await transport.handleRequest(req);
      } catch (error) {
        console.error(`[mcp-hub] request failed project=${project}: ${String(error)}`);
        return new Response("Internal Server Error", { status: 500 });
      }
    },
  });

  const actualPort = server.port ?? port;
  console.log(`[mcp-hub] listening on http://127.0.0.1:${actualPort}/mcp/{project}`);

  return {
    port: actualPort,
    stop: () => server.stop(true),
  };
};
