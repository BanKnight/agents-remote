import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { resolveProjectRelativePath } from "./project-paths.js";

/**
 * MCP Hub 基座 server —— 无状态 Streamable HTTP,绑 127.0.0.1,只给本机 agent 用。
 *
 * - 传输:`WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined })` = 无状态
 *   (不返 Mcp-Session-Id,Claude Code 不会 pin session id,hub 重启/再平衡不崩)。
 * - 进程模型:api 进程内独立 Bun.serve,不暴露于 Cloudflare Tunnel(tunnel 只转发 api 端口)。
 * - project 上下文:URL `/mcp/{project}` 第一段,每请求重新过 resolveProjectRelativePath
 *   做 realpath 二次校验(不信任任何快照)。
 * - 安全世界:tools/call 实现内部从 server 上下文拿 project,再过 resolver(骨架,基座无工具)。
 * - Origin/Host 校验:防 DNS rebinding,只接受 loopback。
 *
 * 基座阶段不注册任何业务工具(空壳):agent 自带文件工具且 cwd=projectPath,基线文件读写是
 * 重复造轮子。wiki 是第一个往 hub 加工具的能力域(届时在此注册 wiki_* 工具)。
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
  // 预留:wiki 阶段注入 ProjectFilesService / 能力域工具工厂。
  // projectFilesService?: ProjectFilesService;
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
 * 为单个请求构造一个 McpServer(无状态:每请求新建,不缓存)。
 * server 持有 { project, projectsRoot } 上下文,供工具实现使用(基座空壳无工具)。
 *
 * wiki 阶段:在此按 per-project mcp.json 的 capabilities 开关注册 wiki_* 工具
 * (readProjectMcpConfig + parseMcpProjectConfig,见 mcp-validate.ts)。
 * 基座阶段:不注册任何工具,tools/list 返回 SDK 默认的 "method not found"(无 tools capability)。
 */
const buildRequestServer = (_project: string, _projectsRoot: string): McpServer => {
  // 基座空壳:不注册工具。wiki 能力域在此按 capabilities 注入工具,例:
  //   if (config.capabilities?.wiki) server.registerTool("wiki_read", ...);
  // 工具实现内部用 project + resolveProjectRelativePath 做安全文件操作。
  return new McpServer({ name: "ar-hub", version: "0.0.0" });
};

export const startMcpHubServer = (options: StartMcpHubServerOptions): McpHubServer => {
  const { port, projectsRoot } = options;

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
      //    基座空壳不读 mcp.json(无能力可开关),只校验 project 存在 + 路径合法。
      //    框架就位:wiki 阶段在此 readProjectMcpConfig 并按 capabilities 决定注册哪些工具。
      try {
        await resolveProjectRelativePath(projectsRoot, project, "");
      } catch {
        // project 不存在 / 路径越界 / 名非法 → 404(不暴露具体原因给 agent)。
        return new Response("Not found", { status: 404 });
      }

      // 4. 无状态:每请求新建 transport + McpServer,不缓存、不返 session id。
      try {
        const transport = new WebStandardStreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
        });
        const mcp = buildRequestServer(project, projectsRoot);
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
