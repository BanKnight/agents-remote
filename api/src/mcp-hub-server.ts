import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { readProjectMcpConfig } from "./mcp-config.js";
import { resolveProjectRelativePath } from "./project-paths.js";
import { ProjectWikiService } from "./project-wiki.js";

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
 * 能力域工具按 per-project mcp.json 的 capabilities 开关注册(首期 wiki:list/read/write);
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
};

const MCP_PATH_PREFIX = "/mcp/";

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
 */
const registerWikiTools = (
  server: McpServer,
  project: string,
  wikiService: ProjectWikiService,
): void => {
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
    "wiki_read_page",
    {
      description:
        "Read a single wiki page by slug. Returns { slug, frontmatter: { title, tags, created, updated }, body }.",
      inputSchema: { slug: z.string() },
    },
    async ({ slug }) => {
      try {
        const page = await wikiService.readPage(project, slug);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(page) }],
        };
      } catch (error) {
        return wikiErrorResponse(error);
      }
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
};

/**
 * 为单个请求构造 McpServer(无状态:每请求新建,不缓存)。按 wikiEnabled 决定是否注册
 * wiki_* 工具:未开启时 tools/list 返回空 capability(基座空壳行为保留)。
 */
const buildRequestServer = (
  project: string,
  wikiService: ProjectWikiService,
  wikiEnabled: boolean,
): McpServer => {
  const server = new McpServer({ name: "ar-hub", version: "0.0.0" });
  if (wikiEnabled) {
    registerWikiTools(server, project, wikiService);
  }
  return server;
};

export const startMcpHubServer = (options: StartMcpHubServerOptions): McpHubServer => {
  const { port, projectsRoot, wikiService } = options;

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
      try {
        const config = await readProjectMcpConfig(projectsRoot, project);
        wikiEnabled = config?.capabilities?.wiki === true;
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
        const mcp = buildRequestServer(project, wikiService, wikiEnabled);
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
