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
 * 能力域工具按 per-project mcp.json 的 capabilities 开关注册(wiki:list/read/write;
 * ui:MCP Apps 扩展声明 + `ui://ar-hub/*` 资源供给 + wiki_read_page 的 UI 关联);
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

/** MCP Apps（SEP-1865）扩展标识与 UI 资源媒体类型。 */
const MCP_APPS_EXTENSION = "io.modelcontextprotocol/ui";
const MCP_APP_MIME_TYPE = "text/html;profile=mcp-app";
/** wiki 页卡片的 ui:// 资源 URI（全局模板,与 project 无关——数据经 tool-result 喂给卡片）。 */
const WIKI_PAGE_UI_URI = "ui://ar-hub/wiki-page";

/**
 * wiki 页卡片 MVP 模板：零外部依赖。CSP meta `default-src 'none'` 禁 connect/img/form
 * ——即便未来 esc 出现转义缺口,帧内脚本也无法把 wiki 数据外发(2026-10-20 security
 * review 补;宿主侧 postMessage 喂数据另由 mcp-app-card 的同模板重载守卫挡)。宿主按
 * MCP Apps 桥下发 `ui/notifications/tool-result`,卡片取 structuredContent
 * (kind="wiki-page")做基本结构化渲染(标题/列表/代码/粗体,转义防注入)。渲染质量是
 * 宿主 MVP 后的迭代面,管道优先。
 *
 * 反向通道（阶段 4）:ui/initialize 握手(theme/locale 经 hostContext 注入)→
 * initialized;tools/call(刷新钮,宿主白名单代理直调 service,不触发 turn);
 * ui/message(追问条,宿主确认框后经 bridge.sendMessage 触发新 turn)。
 */
const WIKI_PAGE_APP_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'"><style>
  :root{--bg:#0f1115;--fg:#e6e8ea;--muted:#9aa3ad;--code-bg:rgba(255,255,255,.08);--pre-bg:#16181d;--pre-border:#2a2f37;--link:#6cb6ff;--tag-bg:rgba(99,153,255,.15);--tag-fg:#9cc0ff}
  :root[data-theme="light"]{--bg:#fff;--fg:#111;--muted:#777;--code-bg:#f2f2f2;--pre-bg:#f6f6f6;--pre-border:#e3e3e3;--link:#0a66c2;--tag-bg:#eef3f8;--tag-fg:#345}
  body{font-family:system-ui,-apple-system,sans-serif;margin:0;padding:16px;background:var(--bg);color:var(--fg);line-height:1.55}
  h1{font-size:1.3em;margin:.2em 0 .6em}h2{font-size:1.15em;margin:1em 0 .4em}h3{font-size:1em;margin:.8em 0 .3em}
  code{background:var(--code-bg);border-radius:4px;padding:.1em .35em;font-size:.92em}
  pre{background:var(--pre-bg);border:1px solid var(--pre-border);border-radius:8px;padding:10px 12px;overflow:auto}
  pre code{background:none;padding:0}
  ul,ol{padding-left:1.4em}li{margin:.15em 0}
  a{color:var(--link)}
  .meta{color:var(--muted);font-size:.82em;margin-bottom:.8em}
  .tag{display:inline-block;background:var(--tag-bg);color:var(--tag-fg);border-radius:999px;padding:.1em .6em;margin-right:.35em;font-size:.78em}
  .bar{display:flex;justify-content:flex-end;margin:-.4em 0 .8em}
  .bar-btn{background:none;border:1px solid var(--pre-border);color:var(--fg);border-radius:6px;padding:.15em .7em;font-size:.82em;cursor:pointer;font-family:inherit}
  .bar-btn:hover{background:var(--code-bg)}
  .bar-btn:disabled{opacity:.5;cursor:default}
  .ask{display:flex;gap:.5em;margin-top:1em;padding-top:.8em;border-top:1px solid var(--pre-border)}
  .ask input{flex:1;background:var(--code-bg);border:1px solid var(--pre-border);border-radius:6px;padding:.3em .6em;color:var(--fg);font:inherit;font-size:.9em;min-width:0}
  .ask input:focus{outline:1px solid var(--link)}
</style></head>
<body>
  <h1 id="title"></h1>
  <div class="meta" id="meta"></div>
  <div class="bar"><button id="refresh" type="button" class="bar-btn"></button></div>
  <div id="body"></div>
  <div class="ask"><input id="ask-input" type="text"><button id="ask-send" type="button" class="bar-btn"></button></div>
  <script>
    "use strict";
    var esc = function (s) {
      return String(s).replace(/[&<>"']/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
      });
    };
    var inline = function (s) {
      return esc(s)
        .replace(/\`([^\`]+)\`/g, "<code>$1</code>")
        .replace(/\\*\\*([^*]+)\\*\\*/g, "<strong>$1</strong>");
    };
    var renderBlocks = function (md) {
      var out = [], lines = String(md).split(/\\r?\\n/), i = 0, inCode = false, codeBuf = [], listBuf = null;
      var flushList = function () {
        if (listBuf) { out.push("<ul>" + listBuf.map(function (l) { return "<li>" + inline(l) + "</li>"; }).join("") + "</ul>"); listBuf = null; }
      };
      for (; i < lines.length; i++) {
        var line = lines[i];
        if (/^\`\`\`/.test(line)) {
          if (inCode) { out.push("<pre><code>" + esc(codeBuf.join("\\n")) + "</code></pre>"); codeBuf = []; inCode = false; }
          else { flushList(); inCode = true; }
          continue;
        }
        if (inCode) { codeBuf.push(line); continue; }
        var h = line.match(/^(#{1,3})\\s+(.*)$/);
        if (h) { flushList(); out.push("<h" + h[1].length + ">" + inline(h[2]) + "</h" + h[1].length + ">"); continue; }
        var li = line.match(/^[-*]\\s+(.*)$/);
        if (li) { listBuf = listBuf || []; listBuf.push(li[1]); continue; }
        flushList();
        if (line.trim() === "") continue;
        out.push("<p>" + inline(line) + "</p>");
      }
      if (inCode && codeBuf.length) out.push("<pre><code>" + esc(codeBuf.join("\\n")) + "</code></pre>");
      flushList();
      return out.join("");
    };
    var slug = "";
    var currentTitle = "";
    var render = function (data) {
      if (!data || data.kind !== "wiki-page") return;
      slug = data.slug || "";
      currentTitle = data.title || data.slug || "";
      document.getElementById("title").textContent = currentTitle;
      var tags = Array.isArray(data.tags) && data.tags.length
        ? data.tags.map(function (t) { return '<span class="tag">' + esc(t) + "</span>"; }).join("")
        : "";
      document.getElementById("meta").innerHTML = tags;
      document.getElementById("body").innerHTML = renderBlocks(data.markdown || "");
    };
    window.addEventListener("message", function (e) {
      var msg = e.data;
      if (!msg || typeof msg !== "object") return;
      if (typeof msg.id === "number") {
        var entry = pending[msg.id];
        if (!entry) return;
        // A JSON-RPC response carries exactly one of result/error. An id-only
        // message is our own request echoing back through parent===self
        // (file:// probes, self-embedded frames) — never treat it as a reply.
        if (!("result" in msg) && !("error" in msg)) return;
        delete pending[msg.id];
        if (msg.error) entry.reject(new Error((msg.error && msg.error.message) || "request failed"));
        else entry.resolve(msg.result);
        return;
      }
      if (msg.method === "ui/notifications/host-context-changed") {
        var theme = msg.params && msg.params.theme;
        if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
        reportSize();
        return;
      }
      if (msg.method === "ui/notifications/tool-result") {
        var p = msg.params || {};
        render(p.structuredContent || (p.content && p.content[0] && p.content[0]._meta) || null);
        reportSize();
      }
    });
    // Height adapts to content (host pins the iframe to reported height).
    // Measure body.scrollHeight, NOT documentElement.scrollHeight: the latter
    // is max(content, viewport) so short content reports the viewport height
    // and the dedupe then swallows every real update. body is height:auto so
    // its scrollHeight is exactly the content height regardless of viewport.
    var lastSize = -1;
    function reportSize() {
      var h = Math.ceil(document.body.scrollHeight);
      if (h === lastSize || !h) return;
      lastSize = h;
      parent.postMessage({ jsonrpc: "2.0", method: "ui/notifications/size-changed", params: { height: h } }, "*");
    }
    if (typeof ResizeObserver !== "undefined") {
      new ResizeObserver(reportSize).observe(document.body);
    }
    window.addEventListener("load", reportSize);

    // JSON-RPC request bridge (SEP-1865 reverse channel): id-multiplexed.
    var reqSeq = 0;
    var pending = {};
    var sendRequest = function (method, params) {
      return new Promise(function (resolve, reject) {
        var id = ++reqSeq;
        pending[id] = { resolve: resolve, reject: reject };
        parent.postMessage({ jsonrpc: "2.0", id: id, method: method, params: params }, "*");
      });
    };
    // Locale via hostContext (SEP standard channel; template has no host i18n pipe).
    var loc = "";
    var DICT = {
      en: { refresh: "Refresh", ask: "Ask the agent about this page...", send: "Send" },
      zh: { refresh: "刷新", ask: "向 agent 追问本页…", send: "发送" },
    };
    var dict = DICT.en;
    var applyLocale = function () {
      document.getElementById("refresh").textContent = dict.refresh;
      document.getElementById("ask-input").placeholder = dict.ask;
      document.getElementById("ask-send").textContent = dict.send;
    };
    applyLocale();

    // Refresh: app-side tools/call straight to host proxy (no agent turn).
    document.getElementById("refresh").addEventListener("click", function () {
      var btn = this;
      if (btn.disabled || !slug) return;
      btn.disabled = true;
      sendRequest("tools/call", { name: "wiki_read_page", arguments: { slug: slug } })
        .then(function (result) {
          var sc = result && result.structuredContent;
          if (sc) render(sc);
          reportSize();
        })
        .catch(function () {})
        .then(function () {
          btn.disabled = false;
        });
    });

    // Ask: ui/message follow-up (host confirms with the user before sending).
    var askBox = document.getElementById("ask-input");
    var askSend = function () {
      var text = (askBox.value || "").trim();
      if (!text || !slug) return;
      var wrapped =
        loc.indexOf("zh") === 0
          ? "关于 wiki 页「" + currentTitle + "」：" + text
          : 'About the wiki page "' + currentTitle + '": ' + text;
      sendRequest("ui/message", { role: "user", content: { type: "text", text: wrapped } })
        .then(function () {
          askBox.value = "";
        })
        .catch(function () {});
    };
    document.getElementById("ask-send").addEventListener("click", askSend);
    askBox.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        askSend();
      }
    });

    // Handshake: ui/initialize -> apply hostContext -> initialized notification.
    sendRequest("ui/initialize", {
      appInfo: { name: "ar-wiki-page", version: "0.0.0" },
      appCapabilities: {},
      protocolVersion: "2026-01-26",
    })
      .then(function (result) {
        var ctx = (result && result.hostContext) || {};
        if (ctx.theme === "light" || ctx.theme === "dark") {
          document.documentElement.dataset.theme = ctx.theme;
        }
        if (typeof ctx.locale === "string" && ctx.locale) {
          loc = ctx.locale;
          dict = DICT[loc.indexOf("zh") === 0 ? "zh" : "en"] || DICT.en;
          applyLocale();
        }
        reportSize();
        parent.postMessage(
          { jsonrpc: "2.0", method: "ui/notifications/initialized", params: {} },
          "*",
        );
      })
      .catch(function () {});
  </script>
</body></html>`;

/**
 * hub UI 资源单源表（uri → { mimeType, html }）：hub 注册（agent 经 resources/read 读）
 * 与 api HTTP 路由（web 宿主经 /api/projects/{name}/mcp-ui-resource 读,hub 恒 loopback
 * 浏览器够不着）共用同一份模板,无复制漂移面。资源是我们自己的系统模板（非第三方
 * server 作者资产）,篡改面不存在——SEP-1865 双 iframe 沙箱(外层独立 origin 承载 CSP
 * HTTP 头)是第三方 server 接入时的强化面,web 宿主 MVP 用单层 sandbox iframe。
 */
export const HUB_UI_RESOURCES: Record<string, { mimeType: string; html: string }> = {
  [WIKI_PAGE_UI_URI]: { mimeType: MCP_APP_MIME_TYPE, html: WIKI_PAGE_APP_HTML },
};

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
 * 为单个请求构造 McpServer(无状态:每请求新建,不缓存)。按能力开关决定 capabilities 与
 * 注册面:全关时空 capabilities(基座空壳行为保留)。uiEnabled 时声明 MCP Apps 扩展
 * (initialize result 的 capabilities.extensions,client 侧据此判定宿主能力)并注册
 * ui:// 资源(Host 经 resources/read 取 HTML 渲染;CLI 2.1.281 起不把 UI 资源列进
 * resources/list,故未开 ui 时无需藏资源——资源本身只在 ui 开时注册)。
 */
const buildRequestServer = (
  project: string,
  wikiService: ProjectWikiService,
  wikiEnabled: boolean,
  uiEnabled: boolean,
): McpServer => {
  const server = new McpServer(
    { name: "ar-hub", version: "0.0.0" },
    {
      capabilities: {
        ...(wikiEnabled || uiEnabled ? { tools: { listChanged: false } } : {}),
        ...(uiEnabled
          ? {
              resources: { subscribe: false },
              extensions: { [MCP_APPS_EXTENSION]: { mimeTypes: [MCP_APP_MIME_TYPE] } },
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
      let uiEnabled = false;
      try {
        const config = await readProjectMcpConfig(projectsRoot, project);
        wikiEnabled = config?.capabilities?.wiki === true;
        uiEnabled = config?.capabilities?.ui === true;
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
        const mcp = buildRequestServer(project, wikiService, wikiEnabled, uiEnabled);
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
