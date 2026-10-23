import purifySource from "dompurify/dist/purify.min.js" with { type: "text" };
import markedSource from "marked/marked.min.js" with { type: "text" };
import mermaidSource from "mermaid/dist/mermaid.min.js" with { type: "text" };
// 画布卡 excalidraw standalone 产物（vendored 生成物,重建配方见 assets/canvas/README.md）。
import canvasExcalidrawCss from "./assets/canvas/dist/excalidraw.bundle.css" with { type: "text" };
import canvasExcalidrawSource from "./assets/canvas/dist/excalidraw.bundle.js" with { type: "text" };

/**
 * MCP Apps 卡片模板单源（ui:// 资源的 HTML 供给,自 mcp-hub-server.ts 迁出）。
 *
 * 架构：`buildCardTemplate(spec)` = 共享基座（JSON-RPC 桥/ui/initialize 握手/主题
 * 同步/size 上报/locale/刷新钮/追问条）+ 按 kind 的 payload 渲染段（`renderKindJs`）
 * + 库集合开关——轻模板零库（结构化数据卡,~10KB,多卡同屏无 parse 负担）,富模板
 * marked+DOMPurify+mermaid（markdown 内容卡,wiki-page 与 file-preview 共用同一份
 * HTML 常量,两个 uri 指向它,模板按 data.kind 分支渲染）。渲染库构建期内联（Bun
 * text import 直读 node_modules dist,无生成文件;CSP 零运行时外域——2026-10-21
 * 调研定案,见 docs/research/mcp-app-rendering-survey.md）。
 *
 * wiki-page 产物行为以既有模板探针 26/26 为回归标准（迁移自 mcp-hub-server.ts 的
 * WIKI_PAGE_APP_TEMPLATE,基座 JS 与原模板逐句对应,勿改转义层级——TS 模板字符串里
 * `\\s` 输出 `\s`、`\`` 输出反引号）。
 *
 * 安全（2026-10-20 security review 沿革 + 2026-10-23 收敛批补强）：CSP
 * `default-src 'none'` 使 connect-src 回退被禁——fetch/XHR/WS 外发全拦;
 * `form-action 'none'` 显式禁表单外发（form-action 不回退 default-src,须单列——
 * 之前只有注释声称禁 form,实际没禁,本批补上）。模板自有资产立场:全部 JS/CSS
 * 内联,零外域请求;帧内 listener 校验 e.source === parent（file:// 探针
 * parent===self 放行）。
 */

export type CardTemplateSpec = {
  /** 握手 appInfo.name（SEP-1865）。 */
  appName: string;
  /** render 接受的 structuredContent.kind 集合。 */
  kinds: string[];
  /** 追问条包装文案前缀（不含标题本体）：zh `关于 X「` / en `About X "`。 */
  askPrefixZh: string;
  askPrefixEn: string;
  /** 追问输入框 placeholder（按卡语境微调）。 */
  askPlaceholderEn: string;
  askPlaceholderZh: string;
  /** kind 渲染段 JS 源码：定义 `renderKind(data)`,负责 title/meta/body/cardTitle。 */
  renderKindJs: string;
  /** marked + DOMPurify（markdown 渲染管线,含 legacy 兜底渲染器）。 */
  withLibs: boolean;
  /** mermaid（蕴含 withLibs；mermaid 围栏出图 + 主题重渲染）。 */
  withMermaid: boolean;
  /** kind 特有 CSS（状态徽章等）,追加在基座之后。 */
  extraCss?: string;
  /** 内联 excalidraw standalone 产物（画布卡专用,assets/canvas/README.md）。 */
  withCanvasBundle?: boolean;
  /** kind 特有 body 结构（缺省 `<div id="body"></div>`;画布卡换 exc 容器）。 */
  bodyHtml?: string;
  /** CSP 尾段（img/font 等资源指令;缺省 `img-src https: data:`。整段替换非追加——
   *  CSP 同名指令首条生效,画布要 blob:/font-src 必须换掉缺省 img-src）。 */
  cspResourceDirectives?: string;
};

export const WIKI_PAGE_UI_URI = "ui://ar-hub/wiki-page";
export const GIT_STATUS_UI_URI = "ui://ar-hub/git-status";
export const GIT_LOG_UI_URI = "ui://ar-hub/git-log";
export const SESSION_OVERVIEW_UI_URI = "ui://ar-hub/session-overview";
export const SETTINGS_PREVIEW_UI_URI = "ui://ar-hub/settings-preview";
export const FILE_PREVIEW_UI_URI = "ui://ar-hub/file-preview";
/** 画布卡片资源（M2.2 接 CANVAS spec；M2.1 工具 _meta 先指此 uri）。 */
export const CANVAS_APP_URI = "ui://ar-hub/canvas";

/** 基座 CSS：双主题变量 + 排版 + bar/ask/meta/table 组件（与原 wiki 模板一致）。 */
const CARD_CSS = `
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
  table{border-collapse:collapse;margin:.6em 0}
  th,td{border:1px solid var(--pre-border);padding:.35em .6em;text-align:left}
  th{background:var(--code-bg)}
  blockquote{border-left:3px solid var(--pre-border);margin:.6em 0;padding:.1em .8em;color:var(--muted)}
  .mermaid-box{margin:.6em 0;overflow:auto}
  .mermaid-box svg{max-width:100%;height:auto}
`;

/** 轻模板各卡的 kind 附加 CSS（状态徽章/提交列表/状态胶囊）。 */
const KIND_CSS = `
  table{width:100%}
  th,td{font-size:.9em}
  .st{display:inline-block;border-radius:4px;padding:0 .4em;font-family:ui-monospace,monospace}
  .st-modified{background:rgba(99,153,255,.18);color:#9cc0ff}
  .st-added{background:rgba(80,200,120,.16);color:#7fd6a0}
  .st-deleted{background:rgba(255,107,107,.16);color:#ff9c9c}
  .st-renamed{background:rgba(230,200,100,.16);color:#e8cf8a}
  :root[data-theme="light"] .st-modified{background:#e8f0fe;color:#2a5da8}
  :root[data-theme="light"] .st-added{background:#e6f6ec;color:#1f7a44}
  :root[data-theme="light"] .st-deleted{background:#fdeaea;color:#b03636}
  :root[data-theme="light"] .st-renamed{background:#faf3dc;color:#8a6d1a}
  .num{font-family:ui-monospace,monospace;white-space:nowrap}
  .num-add{color:#7fd6a0}:root[data-theme="light"] .num-add{color:#1f7a44}
  .num-del{color:#ff9c9c}:root[data-theme="light"] .num-del{color:#b03636}
  .path-cell{font-family:ui-monospace,monospace;word-break:break-all}
  .commit{padding:.55em 0;border-bottom:1px solid var(--pre-border)}
  .commit:last-child{border-bottom:none}
  .commit-head{display:flex;gap:.6em;align-items:baseline}
  .commit-hash{font-size:.85em;color:var(--link)}
  .commit-msg{font-weight:600;word-break:break-word}
  .commit-sub{color:var(--muted);font-size:.82em;margin-top:.15em}
  .pill{display:inline-block;border-radius:999px;padding:.05em .6em;background:var(--code-bg)}
  .pill-running{background:rgba(80,200,120,.16);color:#7fd6a0}
  :root[data-theme="light"] .pill-running{background:#e6f6ec;color:#1f7a44}
`;

/** 基座 JS：esc/inline + （rich）markdown 管线 + render 骨架 + 桥/握手/主题/高度/locale/刷新/追问。 */
const baseScript = (spec: CardTemplateSpec): string => {
  const kindsGuard = `${JSON.stringify(spec.kinds)}.indexOf(data.kind) < 0`;
  const markdownPipeline = spec.withLibs
    ? `
    var renderBlocks = function (md) {
      var out = [], lines = String(md).split(/\\r?\\n/), i = 0, inCode = false, codeBuf = [], listBuf = null;
      var flushList = function () {
        if (listBuf) { out.push("<ul>" + listBuf.map(function (l) { return "<li>" + inline(l) + "</li>"; }).join("") + "</ul>"); listBuf = null; }
      };
      for (; i < lines.length; i++) {
        var line = lines[i];
        if (/^\\\`\\\`\\\`/.test(line)) {
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
    // rich 渲染管线:marked parse → DOMPurify 白名单过滤 → mermaid 围栏出图。
    // 渲染库构建期内联(独立 <script>,零运行时外域);任何异常回落 legacy
    // renderBlocks(上方极简渲染器)兜底。
    var mermaidSeq = 0;
    var mermaidInited = false;
    var mermaidTheme = function () {
      return document.documentElement.dataset.theme === "light" ? "default" : "dark";
    };
    var upgradeMermaidBlocks = function (root) {
      if (typeof mermaid === "undefined") return;
      if (!mermaidInited) {
        mermaid.initialize({ startOnLoad: false, theme: mermaidTheme() });
        mermaidInited = true;
      }
      var blocks = root.querySelectorAll("pre > code.language-mermaid");
      var i = 0;
      var next = function () {
        if (i >= blocks.length) { reportSize(); return; }
        var block = blocks[i++];
        var holder = block.closest ? block.closest("pre") : null;
        mermaid.render("ar-mmd-" + ++mermaidSeq, block.textContent || "")
          .then(function (r) {
            if (holder) {
              var box = document.createElement("div");
              box.className = "mermaid-box";
              box.innerHTML = r.svg;
              holder.replaceWith(box);
            }
          })
          .catch(function () {}) // 单块渲染失败保持代码块原样,不阻断其余块。
          .then(next);
      };
      next();
    };
    var renderBody = function (md) {
      var bodyEl = document.getElementById("body");
      try {
        bodyEl.innerHTML = DOMPurify.sanitize(marked.parse(String(md || "")));
        upgradeMermaidBlocks(bodyEl);
      } catch (e) {
        bodyEl.innerHTML = renderBlocks(md);
      }
    };
`
    : "";
  return `
    "use strict";
    var esc = function (s) {
      return String(s).replace(/[&<>"']/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
      });
    };
    var inline = function (s) {
      return esc(s)
        .replace(/\\\`([^\\\`]+)\\\`/g, "<code>$1</code>")
        .replace(/\\*\\*([^*]+)\\*\\*/g, "<strong>$1</strong>");
    };
${markdownPipeline}
    // 卡片状态:renderKind 维护 lastData/cardTitle(刷新守卫与追问包装文案消费)。
    var lastData = null;
    var cardTitle = "";
    var render = function (data) {
      if (!data || ${kindsGuard}) return;
      lastData = data;
      renderKind(data);
      reportSize();
    };
    window.addEventListener("message", function (e) {
      // Only the host (parent; self under file:// probes where parent===self)
      // may talk to us — scripted sibling frames must not forge responses or
      // tool-result notifications (security-review 2026-10-20 P2-3).
      if (e.source !== parent) return;
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
        if (theme === "light" || theme === "dark") {
          var prev = document.documentElement.dataset.theme;
          document.documentElement.dataset.theme = theme;
          // 主题实际变化时:mermaid 图是主题内嵌的 SVG,须重初始化 + 全量重渲染;
          // 纯 CSS 变量部分幂等,重渲染无副作用。
          if (prev !== theme) {
            ${spec.withMermaid ? "if (mermaidInited) mermaid.initialize({ startOnLoad: false, theme: mermaidTheme() });" : ""}
            if (lastData) render(lastData);
          }
        }
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
    // Requests time out so a swallowed reply (revoked frame, unmounted card)
    // can't leave a button disabled forever or a pending entry resident.
    var reqSeq = 0;
    var pending = {};
    var REQUEST_TIMEOUT_MS = 15000;
    var sendRequest = function (method, params) {
      return new Promise(function (resolve, reject) {
        var id = ++reqSeq;
        pending[id] = { resolve: resolve, reject: reject };
        parent.postMessage({ jsonrpc: "2.0", id: id, method: method, params: params }, "*");
        setTimeout(function () {
          if (pending[id]) {
            delete pending[id];
            reject(new Error(method + " timed out"));
          }
        }, REQUEST_TIMEOUT_MS);
      });
    };
    // Locale via hostContext (SEP standard channel; template has no host i18n pipe).
    var loc = "";
    var DICT = {
      en: { refresh: "Refresh", ask: ${JSON.stringify(spec.askPlaceholderEn)}, send: "Send" },
      zh: { refresh: "刷新", ask: ${JSON.stringify(spec.askPlaceholderZh)}, send: "发送" },
    };
    var dict = DICT.en;
    var applyLocale = function () {
      document.getElementById("refresh").textContent = dict.refresh;
      document.getElementById("ask-input").placeholder = dict.ask;
      document.getElementById("ask-send").textContent = dict.send;
      // 静态文案按语言重渲染(kind 渲染段读 loc;语言切换后主体跟随)。
      if (lastData) renderKind(lastData);
    };
    applyLocale();

    // Refresh: app-side tools/call straight to host proxy (no agent turn).
    // getRefreshRequest is defined per kind in renderKindJs (a shared template
    // like the rich card dispatches on lastData.kind — host allowlists bind
    // one tool per card, so the request must match the rendered kind).
    document.getElementById("refresh").addEventListener("click", function () {
      var btn = this;
      if (btn.disabled || !lastData) return;
      btn.disabled = true;
      sendRequest("tools/call", getRefreshRequest())
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
    // In-flight guard mirrors the refresh button: Enter auto-repeat / double
    // clicks must not stack requests (host confirm gate is single-resolver).
    var askBox = document.getElementById("ask-input");
    var askBusy = false;
    // 追问前缀默认取 spec 常量;共用模板(kind 分派)在 renderKindJs 里覆盖。
    var getAskPrefix = function () {
      return loc.indexOf("zh") === 0
        ? ${JSON.stringify(spec.askPrefixZh)}
        : ${JSON.stringify(spec.askPrefixEn)};
    };
    var askSend = function () {
      if (askBusy) return;
      var text = (askBox.value || "").trim();
      if (!text || !lastData) return;
      askBusy = true;
      var wrapped =
        loc.indexOf("zh") === 0
          ? getAskPrefix() + cardTitle+ "」：" + text
          : getAskPrefix() + cardTitle + '": ' + text;
      sendRequest("ui/message", { role: "user", content: { type: "text", text: wrapped } })
        .then(function () {
          askBox.value = "";
        })
        .catch(function () {})
        .then(function () {
          askBusy = false;
        });
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
      appInfo: { name: ${JSON.stringify(spec.appName)}, version: "0.0.0" },
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
  `;
};

const buildCardTemplate = (spec: CardTemplateSpec): string => `<!doctype html>
<html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; form-action 'none'; ${spec.cspResourceDirectives ?? "img-src https: data:"}"><style>${CARD_CSS}${spec.withLibs ? "" : KIND_CSS}${spec.withCanvasBundle ? canvasExcalidrawCss : ""}${spec.extraCss ?? ""}</style></head>
<body>
  <h1 id="title"></h1>
  <div class="meta" id="meta"></div>
  <div class="bar"><button id="refresh" type="button" class="bar-btn"></button></div>
  ${spec.bodyHtml ?? '<div id="body"></div>'}
  <div class="ask"><input id="ask-input" type="text"><button id="ask-send" type="button" class="bar-btn"></button></div>
  <script>/*__AR_LIB_MARKED__*/</script>
  <script>/*__AR_LIB_PURIFY__*/</script>
  <script>/*__AR_LIB_MERMAID__*/</script>
  <script>/*__AR_LIB_CANVAS__*/</script>
  <script>
${baseScript(spec)}
${spec.renderKindJs}
  </script>
</body></html>`;

/**
 * 库 dist 内联的两个防御:
 * 1. `<\/script` 转义——现行三库产物已无字面 `</script`(esbuild/terser 转义),防未来
 *    版本引入后提前终止 script 标签;JS 字符串里 \/ 语义等价 /。
 * 2. replace 用函数形式——minified 库源码 $ 序列丰富,字符串替换串的 $&/$` 会被展开。
 */
const inlineLibScript = (source: string): string => source.replace(/<\/script/gi, "<\\/script");

/** 模板 + 库内联 = 最终 ui:// 资源 HTML（构建期一次拼接,运行时零外域）。 */
const buildCardHtml = (spec: CardTemplateSpec): string =>
  buildCardTemplate(spec)
    .replace("/*__AR_LIB_MARKED__*/", () => (spec.withLibs ? inlineLibScript(markedSource) : ""))
    .replace("/*__AR_LIB_PURIFY__*/", () => (spec.withLibs ? inlineLibScript(purifySource) : ""))
    .replace("/*__AR_LIB_MERMAID__*/", () =>
      spec.withMermaid
        ? `${inlineLibScript(mermaidSource)};window.mermaid = window.mermaid || (__esbuild_esm_mermaid_nm && __esbuild_esm_mermaid_nm.mermaid);`
        : "",
    )
    .replace("/*__AR_LIB_CANVAS__*/", () =>
      spec.withCanvasBundle ? inlineLibScript(canvasExcalidrawSource) : "",
    );

// ---------------------------------------------------------------------------
// kind 渲染段（renderKindJs）。文案 zh/en 双语,读 loc;每段负责 title/meta/body/cardTitle。
// ---------------------------------------------------------------------------

/** wiki 页:标题 + tags 胶囊 + markdown 富渲染（平移自原 WIKI_PAGE_APP_TEMPLATE render()）。 */
const WIKI_KIND_JS = `
    var slug = "";
    var currentTitle = "";
    var renderWiki = function (data) {
      slug = data.slug || "";
      currentTitle = data.title || data.slug || "";
      cardTitle = currentTitle;
      document.getElementById("title").textContent = currentTitle;
      var tags = Array.isArray(data.tags) && data.tags.length
        ? data.tags.map(function (t) { return '<span class="tag">' + esc(t) + "</span>"; }).join("")
        : "";
      document.getElementById("meta").innerHTML = tags;
      renderBody(data.markdown || "");
    };
`;

/** 文件预览:文件头(path · size) + 内容渲染(md 直渲染,其余包四反引号 fence 走代码块)。 */
const FILE_PREVIEW_KIND_JS = `
    var formatBytes = function (n) {
      if (typeof n !== "number" || !(n >= 0)) return "";
      if (n < 1024) return n + " B";
      if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
      return (n / (1024 * 1024)).toFixed(1) + " MB";
    };
    var filePath = "";
    var renderFilePreview = function (data) {
      filePath = data.path || "";
      cardTitle = data.name || data.path || "";
      document.getElementById("title").textContent = cardTitle;
      document.getElementById("meta").textContent =
        [data.path, formatBytes(data.size)].filter(Boolean).join(" · ");
      var isMd = /\\.(md|markdown)$/i.test(data.path || "");
      // 四反引号 fence:内容含三反引号代码块时仍完整包裹(marked 取最长围栏)。
      var fence = "\\u0060\\u0060\\u0060\\u0060";
      renderBody(isMd ? String(data.content || "") : fence + "\\n" + String(data.content || "") + "\\n" + fence);
    };
`;

/** 富模板 = wiki-page + file-preview 双 kind 共用一份 HTML,按 data.kind 分支。 */
const RICH_KIND_JS =
  WIKI_KIND_JS +
  FILE_PREVIEW_KIND_JS +
  `
    var renderKind = function (data) {
      if (data.kind === "wiki-page") { renderWiki(data); return; }
      if (data.kind === "file-preview") { renderFilePreview(data); return; }
    };
    // 宿主白名单一卡一 tool（web allowedToolName / api HUB_APP_TOOLS）,刷新请求
    // 必须跟随当前渲染的 kind——file-preview 复用 wiki 的 HTML,刷 wiki 页会 403。
    var getRefreshRequest = function () {
      if (lastData && lastData.kind === "file-preview") {
        return { name: "read_file", arguments: { path: filePath } };
      }
      return { name: "wiki_read_page", arguments: { slug: slug } };
    };
    // 追问前缀同理:file-preview 用文件语境,wiki 回落基座默认(spec 常量)。
    var baseAskPrefix = getAskPrefix;
    getAskPrefix = function () {
      if (lastData && lastData.kind === "file-preview") {
        return loc.indexOf("zh") === 0 ? "关于文件「" : 'About the file "';
      }
      return baseAskPrefix();
    };
`;

const GIT_STATUS_KIND_JS = `
    var renderKind = function (data) {
      var zh = loc.indexOf("zh") === 0;
      var branch = data.branch || (zh ? "（无分支）" : "(no branch)");
      cardTitle = branch;
      document.getElementById("title").textContent = (zh ? "Git 变更" : "Git changes") + " · " + branch;
      var files = Array.isArray(data.files) ? data.files : [];
      var metaEl = document.getElementById("meta");
      var bodyEl = document.getElementById("body");
      if (data.clean) {
        metaEl.textContent = zh ? "工作区干净" : "Working tree clean";
        bodyEl.innerHTML = "<p>" + (zh ? "没有未提交的变更。" : "No uncommitted changes.") + "</p>";
        return;
      }
      metaEl.textContent = files.length + (zh ? " 个文件变更" : " changed files");
      var letters = { modified: "M", added: "A", deleted: "D", renamed: "R" };
      var rows = files.map(function (f) {
        // typeof 闸（security review info-1 纵深）:非数值统一显示 —,插值无注入面。
        var add = typeof f.addedLines === "number" ? "+" + f.addedLines : "—";
        var del = typeof f.removedLines === "number" ? "-" + f.removedLines : "—";
        return (
          "<tr><td class=\\"path-cell\\">" + esc(f.path) + "</td>" +
          "<td><span class=\\"st st-" + esc(f.status) + "\\"" +
          " title=\\"" + esc(f.status) + "\\">" + esc(letters[f.status] || "?") + "</span></td>" +
          "<td>" + esc(f.scope) + "</td>" +
          "<td class=\\"num num-add\\">" + add + "</td>" +
          "<td class=\\"num num-del\\">" + del + "</td></tr>"
        );
      }).join("");
      var head =
        "<tr><th>" + (zh ? "文件" : "File") + "</th><th>" + (zh ? "状态" : "Status") + "</th>" +
        "<th>" + (zh ? "范围" : "Scope") + "</th><th>+</th><th>-</th></tr>";
      bodyEl.innerHTML = "<table>" + head + rows + "</table>";
    };
    var getRefreshRequest = function () {
      return { name: "git_status", arguments: {} };
    };
`;

const GIT_LOG_KIND_JS = `
    var renderKind = function (data) {
      var zh = loc.indexOf("zh") === 0;
      var branch = data.branch || (zh ? "（无分支）" : "(no branch)");
      cardTitle = branch;
      document.getElementById("title").textContent = (zh ? "Git 提交" : "Git commits") + " · " + branch;
      var commits = Array.isArray(data.commits) ? data.commits : [];
      var total = typeof data.total === "number" ? data.total : commits.length;
      document.getElementById("meta").textContent = total + (zh ? " 条提交" : " commits");
      var items = commits.map(function (c) {
        var msg = String(c.message || "").split("\\n")[0];
        return (
          '<div class="commit"><div class="commit-head">' +
          '<code class="commit-hash">' + esc(String(c.hash || "").slice(0, 8)) + "</code>" +
          '<span class="commit-msg" title="' + esc(c.message || "") + '">' + esc(msg) + "</span></div>" +
          '<div class="commit-sub">' + esc(c.author || "") + " · " + esc(c.relativeTime || "") + "</div></div>"
        );
      }).join("");
      document.getElementById("body").innerHTML =
        items || "<p>" + (zh ? "暂无提交。" : "No commits yet.") + "</p>";
    };
    var getRefreshRequest = function () {
      return { name: "git_log", arguments: {} };
    };
`;

const SESSION_OVERVIEW_KIND_JS = `
    var renderKind = function (data) {
      var zh = loc.indexOf("zh") === 0;
      var project = data.projectName || "";
      cardTitle = project;
      document.getElementById("title").textContent =
        (zh ? "会话概览" : "Session overview") + (project ? " · " + project : "");
      var counts = data.counts || {};
      document.getElementById("meta").textContent = Object.keys(counts)
        .map(function (k) { return k + " " + counts[k]; })
        .join(" · ");
      var sessions = Array.isArray(data.sessions) ? data.sessions : [];
      var rows = sessions.map(function (s) {
        return (
          "<tr><td>" + esc(s.displayName || "") + "</td>" +
          "<td>" + esc(s.type || "") + "</td>" +
          '<td><span class="pill pill-' + esc(s.status) + '">' + esc(s.status) + "</span></td>" +
          "<td>" + esc(s.updatedAt || "") + "</td></tr>"
        );
      }).join("");
      var head =
        "<tr><th>" + (zh ? "会话" : "Session") + "</th><th>" + (zh ? "类型" : "Type") + "</th>" +
        "<th>" + (zh ? "状态" : "Status") + "</th><th>" + (zh ? "更新时间" : "Updated") + "</th></tr>";
      document.getElementById("body").innerHTML =
        rows ? "<table>" + head + rows + "</table>" : "<p>" + (zh ? "暂无会话。" : "No sessions.") + "</p>";
    };
    var getRefreshRequest = function () {
      return { name: "session_overview", arguments: {} };
    };
`;

const SETTINGS_PREVIEW_KIND_JS = `
    var renderKind = function (data) {
      var zh = loc.indexOf("zh") === 0;
      var project = data.projectName || "";
      cardTitle = project;
      document.getElementById("title").textContent =
        (zh ? "项目设置" : "Project settings") + (project ? " · " + project : "");
      // 密钥安全注记:该卡数据面本就不含 env/headers/command,文案向用户言明。
      document.getElementById("meta").textContent =
        zh ? "只读预览（不含密钥与命令行）" : "Read-only preview (no secrets or commands)";
      var caps = data.capabilities || {};
      var capRows = Object.keys(caps)
        .map(function (k) {
          return "<tr><td>" + esc(k) + "</td><td>" + (caps[k] === true ? (zh ? "开启" : "on") : zh ? "关闭" : "off") + "</td></tr>";
        })
        .join("");
      var servers = Array.isArray(data.mcpServers) ? data.mcpServers : [];
      var serverRows = servers
        .map(function (s) {
          return "<tr><td>" + esc(s.name || "") + "</td><td>" + esc(s.type || "") + "</td></tr>";
        })
        .join("");
      var srvHead = "<tr><th>" + (zh ? "名称" : "Name") + "</th><th>" + (zh ? "类型" : "Type") + "</th></tr>";
      document.getElementById("body").innerHTML =
        "<h2>" + (zh ? "能力开关" : "Capabilities") + "</h2>" +
        (capRows ? "<table>" + capRows + "</table>" : "<p>" + (zh ? "未开启任何能力。" : "No capabilities enabled.") + "</p>") +
        "<h2>" + (zh ? "MCP 服务器" : "MCP servers") + "</h2>" +
        (serverRows ? "<table>" + srvHead + serverRows + "</table>" : "<p>" + (zh ? "未配置。" : "None configured.") + "</p>");
    };
    var getRefreshRequest = function () {
      return { name: "project_settings", arguments: {} };
    };
`;

// ---------------------------------------------------------------------------
// 画布卡（M2.2）：excalidraw 场景渲染 + 用户编辑 commit_scene 回存。
// 双向循环 = agent 四工具（create/read/apply/export,structuredContent.kind =
// "canvas-doc"）喂数据;用户在 excalidraw 里改 → onChange 防抖 → tools/call
// commit_scene（expectedRevision 乐观锁 + operationId 幂等,web 卡专属工具,agent
// 侧不可见）。冲突（编辑期间 agent 改过）→ 服务端为准重载 + note 提示。
// ---------------------------------------------------------------------------

const CANVAS_KIND_CSS = `
  #exc-root{height:240px;border:1px solid var(--pre-border);border-radius:8px;overflow:hidden}
  #exc-root .excalidraw-container,#exc-root .excalidraw{width:100%;height:100%}
`;

const CANVAS_KIND_JS = `
    var exc = null;              // ARCanvasBundle.mount 控制器
    var excReady = false;
    var docId = "";
    var docRevision = 0;
    // 回声抑制 = 已知态指纹：onChange 场景与已知几何相同 → settle 回声跳过 commit。
    // excalidraw 的 settle onChange 轮次/时机不可预测（mount/字体加载拖尾),时间窗
    // 盖不住——指纹对比是语义判定,天然覆盖全部回声形态。
    // 指纹基线必须与 onChange 同一形态空间:excalidraw restore 会给 sparse 元素补
    // 默认值,服务端 face（可能 sparse）直接做基线,首个内部形态 onChange 必误判
    // 成用户编辑 → 空转 commit → 同 doc 其它卡 revision 全过期 → 冲突级联。
    // 所以基线不在 mount/apply 时取服务端 face,而是置 baselinePending,等首个
    // onChange（restore 后内部形态)定基线;commit 回显（提交原样=内部形态)同步基线。
    var lastServerKey = "";
    var baselinePending = false;
    // 同 revision 只拉一次全量（truncated→read_scene 守卫:响应链任何一环又返回
    // truncated 面时,防无守卫请求循环）。
    var fullSceneFetchedRevision = -1;
    // commit 串行化:在途 commit 的 RTT 内若防抖到期,新编辑排队（最新覆盖）,
    // 在途落地后以已更新的 docRevision 重发——否则必带旧 revision 撞假冲突。
    var commitInFlight = false;
    var queuedElements = null;
    // 选区引用（M3）：bundle onSelectionChanged 推完整元素;引用按钮点击时精简成
    // {id,type,x,y,width,height,text} 发 ui/update-model-context（宿主写「待发
    // 画布选区」,随下一条消息注入 prompt——agent 收到形如 [画布选区] 的块）。
    var selectedElements = [];
    var citeTimer = 0;
    var commitTimer = 0;
    var commitSeq = 0;
    var COMMIT_DEBOUNCE_MS = 600;
    var noteText = "";
    var canvasText = function () {
      if (loc.indexOf("zh") === 0) {
        return {
          elems: "个元素",
          stale: "画布刚被 agent 更新，已重新加载",
          saveErr: "保存失败",
          truncated: "元素过多，正文从服务端拉取",
          noRuntime: "画布运行时不可用",
          imgSkip: "画布暂不支持图片元素，图片不会被保存",
          citeN: "引用 {n} 个元素到对话",
          cited: "已引用 ✓",
        };
      }
      return {
        elems: "elements",
        stale: "Canvas was updated by the agent; reloaded",
        saveErr: "Save failed",
        truncated: "Scene truncated; fetching full elements",
        noRuntime: "Canvas runtime unavailable",
        imgSkip: "Image elements are not saved by this canvas yet",
        citeN: "Cite {n} element(s) to chat",
        cited: "Cited ✓",
      };
    };
    var updateMeta = function (data) {
      var t = canvasText();
      var count = typeof data.elementCount === "number"
        ? data.elementCount
        : (Array.isArray(data.elements) ? data.elements.length : 0);
      var parts = ["r" + data.revision, count + " " + t.elems];
      if (data.truncated) parts.push(t.truncated);
      if (noteText) parts.push(noteText);
      document.getElementById("meta").textContent = parts.join(" · ");
    };
    var setNote = function (text) {
      noteText = text;
      if (lastData) { updateMeta(lastData); }
    };
    var applyRemoteScene = function (data) {
      if (!exc || !excReady || !data) return;
      if (data.truncated) { requestFullScene(); return; }
      if (!Array.isArray(data.elements)) return;
      exc.setElements(data.elements);
      // setElements 后首个 onChange 是 restore 后内部形态 → 重定基线（见变量区注释）。
      lastServerKey = "";
      baselinePending = true;
    };
    var requestFullScene = function () {
      if (!docId) return;
      // 守卫（记账在响应侧）：「已向该 revision 要过全量、拿回的仍是 truncated」
      // 才停手——防 truncated→read_scene→又 truncated 的无守卫请求循环。全量
      // 成功重置为 -1,冲突重载路径（同一 revision 可能多次 409→重拉）不受限。
      // 若把记账放请求侧,同 revision 二次冲突会被误挡,拿不到重载。
      if (fullSceneFetchedRevision === docRevision) return;
      sendRequest("tools/call", { name: "read_scene", arguments: { id: docId } })
        .then(function (result) {
          var sc = result && result.structuredContent;
          if (sc) {
            fullSceneFetchedRevision = sc.truncated ? docRevision : -1;
            render(sc);
          }
        })
        .catch(function () {
          fullSceneFetchedRevision = -1;
        });
    };
    var sceneKey = function (elements) {
      // 子集指纹：id + 几何/样式核心字段。settle 回声不改这些;用户改任意其一即变。
      // 补齐易漏的语义字段:圆角/字体/对齐/行高/箭头/分组/链接——settle 拖尾改这些
      // 不常见,但 agent apply_operations 改它们时若漏进指纹,提交会被误判成回声丢掉。
      var keys = [];
      for (var i = 0; i < elements.length; i++) {
        var el = elements[i];
        if (!el) continue;
        keys.push(
          [el.id, el.type, el.x, el.y, el.width, el.height, el.angle,
            el.strokeColor, el.backgroundColor, el.fillStyle, el.strokeWidth,
            el.strokeStyle, el.roughness, el.opacity, el.text, el.fontSize,
            (el.points || []).join(";"),
            JSON.stringify(el.roundness || null), el.fontFamily || "",
            el.textAlign || "", String(el.lineHeight || ""),
            el.startArrowhead || "", el.endArrowhead || "",
            (el.groupIds || []).join(","), el.link || ""].join("|"),
        );
      }
      return keys.join("\\n");
    };
    var commitScene = function (elements) {
      if (!docId || !excReady) return;
      var payload = [];
      var hasImage = false;
      for (var i = 0; i < elements.length; i++) {
        var el = elements[i];
        if (!el || el.isDeleted) continue;
        if (el.type === "image") hasImage = true;
        payload.push(el);
      }
      // 指纹基线定标：首个 onChange 是 restore 后的内部形态,与它对齐后后续 onChange
      // 才可比。此前直接提交会把「restore 补默认」误判成用户编辑 → 空转 commit。
      if (baselinePending) {
        lastServerKey = sceneKey(payload);
        baselinePending = false;
        return;
      }
      // settle 回声（mount/字体拖尾的重复 onChange）:场景与已知态相同 → 不提交。
      if (lastServerKey && sceneKey(payload) === lastServerKey) {
        return;
      }
      // 串行化:在途 commit 的 RTT 内防抖到期 → 最新编辑排队,落地后重发
      // （docRevision 已被 .then 更新,重发不带旧 revision）。
      if (commitInFlight) {
        queuedElements = payload;
        return;
      }
      commitInFlight = true;
      commitSeq += 1;
      var t = canvasText();
      sendRequest("tools/call", {
        name: "commit_scene",
        arguments: {
          id: docId,
          elements: payload,
          expectedRevision: docRevision,
          operationId: "web-" + Date.now() + "-" + commitSeq,
        },
      })
        .then(function (result) {
          var sc = result && result.structuredContent;
          if (sc && typeof sc.revision === "number") {
            docRevision = sc.revision;
            // meta 读 lastData：同步显新 rev，否则保存成功后 meta 恒显旧 revision。
            if (lastData) {
              lastData.revision = sc.revision;
              lastData.truncated = false;
              if (Array.isArray(sc.elements)) {
                lastData.elements = sc.elements;
                lastData.elementCount = sc.elements.length;
              }
            }
          }
          // 提交回显 = 提交原样 = 内部形态 → 直接做新基线（覆盖基线对齐的空间要求）。
          if (sc && Array.isArray(sc.elements)) lastServerKey = sceneKey(sc.elements);
          baselinePending = false;
          setNote(hasImage ? t.imgSkip : "");
        })
        .catch(function (err) {
          var msg = String((err && err.message) || err);
          if (msg.indexOf("REVISION_CONFLICT") >= 0) {
            // agent 在编辑期间改过画布：服务端为准重载（本地草稿丢弃并提示）。
            // 排队编辑一并丢弃——重载带来的才是服务端真相,带着旧 revision 重发
            // 只会再撞一次冲突。
            queuedElements = null;
            setNote(t.stale);
            requestFullScene();
            return;
          }
          setNote(t.saveErr + ": " + msg);
        })
        .then(function () {
          // 成败都释放（冲突分支 return 前已清 queued;这里对它无害——queued 为 null）。
          commitInFlight = false;
          if (queuedElements) {
            var q = queuedElements;
            queuedElements = null;
            commitScene(q);
          }
        });
    };
    var updateCite = function () {
      var bar = document.getElementById("cite-bar");
      var btn = document.getElementById("cite");
      if (!bar || !btn) return;
      var t = canvasText();
      if (!selectedElements.length) {
        bar.hidden = true;
        return;
      }
      bar.hidden = false;
      btn.textContent = t.citeN.replace("{n}", String(selectedElements.length));
    };
    var renderKind = function (data) {
      var prevRevision = docRevision;
      docId = typeof data.id === "string" ? data.id : "";
      docRevision = typeof data.revision === "number" ? data.revision : 0;
      cardTitle = data.title || docId;
      document.getElementById("title").textContent = cardTitle;
      updateMeta(data);
      var excRoot = document.getElementById("exc-root");
      if (!excRoot || typeof ARCanvasBundle === "undefined") {
        if (!exc) document.getElementById("meta").textContent = canvasText().noRuntime;
        return;
      }
      if (!exc) {
        exc = ARCanvasBundle.mount(excRoot, {
          elements: !data.truncated && Array.isArray(data.elements) ? data.elements : [],
          langCode: loc.indexOf("zh") === 0 ? "zh-CN" : "en",
          theme: document.documentElement.dataset.theme === "light" ? "light" : "dark",
          // 调试/测试口：探针读场景元素与视口态（不进任何产品路径）。
          onReady: function () {
            window.__arCanvasCtrl = exc;
            excReady = true;
            reportSize();
          },
          onChange: function (elements) {
            if (commitTimer) clearTimeout(commitTimer);
            commitTimer = setTimeout(function () {
              commitTimer = 0;
              commitScene(elements);
            }, COMMIT_DEBOUNCE_MS);
          },
          onSelectionChanged: function (selected) {
            selectedElements = Array.isArray(selected) ? selected : [];
            updateCite();
          },
        });
        // 引用按钮（M3）：绑定一次（renderKind 会跑多次,click listener 不能重挂）。
        // 精简 payload 只带 agent 够用的语义字段——发全量内部形态会把 seed/version
        // 等噪声灌进 prompt。
        var citeBtn = document.getElementById("cite");
        if (citeBtn) {
          citeBtn.addEventListener("click", function () {
            if (!selectedElements.length) return;
            var payload = [];
            for (var i = 0; i < selectedElements.length; i++) {
              var el = selectedElements[i];
              if (!el) continue;
              payload.push({
                id: el.id,
                type: el.type,
                x: el.x,
                y: el.y,
                width: el.width,
                height: el.height,
                text: el.text || "",
              });
            }
            sendRequest("ui/update-model-context", {
              kind: "canvas-selection",
              docId: docId,
              title: cardTitle,
              revision: docRevision,
              elements: payload,
            })
              .then(function () {
                citeBtn.textContent = canvasText().cited;
                if (citeTimer) clearTimeout(citeTimer);
                citeTimer = setTimeout(function () {
                  citeTimer = 0;
                  updateCite();
                }, 1500);
              })
              .catch(function (err) {
                setNote(canvasText().saveErr + ": " + String((err && err.message) || err));
              });
          });
        }
        // 基线不在此取服务端 face:restore 会补默认值,内部形态 onChange 必与
        // sparse/异构 face 错位 → 空转 commit。等首个 onChange 定内部形态基线
        // （commitScene 的 baselinePending 分支）。
        baselinePending = true;
        lastServerKey = "";
        if (data.truncated) requestFullScene();
      } else {
        exc.setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
        // re-render（主题/locale 切换）与 refresh 钮同 revision → 服务端无新变化,
        // 不用 lastData 覆写 setElements（会把用户未保存的中间笔画弹回已知态）。
        // revision 前进（agent push/冲突重载）或 truncated → 走 apply 链。
        if (data.truncated || data.revision !== prevRevision) {
          applyRemoteScene(data);
        }
      }
    };
    var getRefreshRequest = function () {
      return { name: "read_scene", arguments: { id: docId } };
    };
    getAskPrefix = function () {
      return loc.indexOf("zh") === 0 ? "关于画布「" : 'About the canvas "';
    };
`;

// ---------------------------------------------------------------------------
// 六卡 spec 与最终 HTML。轻卡 ×4（零库）;富卡 ×1（wiki-page + file-preview 共用,
// 两 uri 指向同一份 HTML 常量）;画布卡 ×1（excalidraw standalone,assets/canvas）。
// appName 沿用 "ar-wiki-page"（探针/e2e 锁定值）。
// ---------------------------------------------------------------------------

const RICH_SPEC: CardTemplateSpec = {
  appName: "ar-wiki-page",
  kinds: ["wiki-page", "file-preview"],
  askPrefixZh: "关于 wiki 页「",
  askPrefixEn: 'About the wiki page "',
  askPlaceholderEn: "Ask the agent about this page...",
  askPlaceholderZh: "向 agent 追问本页…",
  renderKindJs: RICH_KIND_JS,
  withLibs: true,
  withMermaid: true,
};

const LIGHT_BASE = {
  withLibs: false,
  withMermaid: false,
  askPlaceholderEn: "Ask the agent about this...",
  askPlaceholderZh: "向 agent 追问…",
} satisfies Partial<CardTemplateSpec>;

const GIT_STATUS_SPEC: CardTemplateSpec = {
  ...LIGHT_BASE,
  appName: "ar-git-status",
  kinds: ["git-status"],
  askPrefixZh: "关于 git 变更「",
  askPrefixEn: 'About the git changes "',
  renderKindJs: GIT_STATUS_KIND_JS,
};

const GIT_LOG_SPEC: CardTemplateSpec = {
  ...LIGHT_BASE,
  appName: "ar-git-log",
  kinds: ["git-log"],
  askPrefixZh: "关于 git 提交「",
  askPrefixEn: 'About the git log "',
  renderKindJs: GIT_LOG_KIND_JS,
};

const SESSION_OVERVIEW_SPEC: CardTemplateSpec = {
  ...LIGHT_BASE,
  appName: "ar-session-overview",
  kinds: ["session-overview"],
  askPrefixZh: "关于会话概览「",
  askPrefixEn: 'About the session overview "',
  renderKindJs: SESSION_OVERVIEW_KIND_JS,
};

const SETTINGS_PREVIEW_SPEC: CardTemplateSpec = {
  ...LIGHT_BASE,
  appName: "ar-settings-preview",
  kinds: ["settings-preview"],
  askPrefixZh: "关于项目设置「",
  askPrefixEn: 'About the project settings "',
  renderKindJs: SETTINGS_PREVIEW_KIND_JS,
};

/** 画布卡 spec（excalidraw standalone;产物与重建配方见 assets/canvas/README.md）。
 *  CSP 尾段整段替换：img 需 blob:（excalidraw 内部位图）、font 需 data:（内联字体）。 */
const CANVAS_SPEC: CardTemplateSpec = {
  withLibs: false,
  withMermaid: false,
  appName: "ar-canvas-doc",
  kinds: ["canvas-doc"],
  askPrefixZh: "关于画布「",
  askPrefixEn: 'About the canvas "',
  askPlaceholderEn: "Ask the agent to edit this canvas...",
  askPlaceholderZh: "让 agent 改这张画布…",
  renderKindJs: CANVAS_KIND_JS,
  extraCss: CANVAS_KIND_CSS,
  withCanvasBundle: true,
  bodyHtml:
    '<div id="exc-root"></div><div class="bar" id="cite-bar" hidden><button id="cite" type="button" class="bar-btn"></button></div>',
  cspResourceDirectives: "img-src https: data: blob:; font-src data:",
};

/** 富模板 HTML（wiki-page + file-preview 共用）。 */
const RICH_APP_HTML = buildCardHtml(RICH_SPEC);

export const HUB_UI_RESOURCES: Record<string, { mimeType: string; html: string }> = {
  [WIKI_PAGE_UI_URI]: { mimeType: "text/html;profile=mcp-app", html: RICH_APP_HTML },
  [FILE_PREVIEW_UI_URI]: { mimeType: "text/html;profile=mcp-app", html: RICH_APP_HTML },
  [GIT_STATUS_UI_URI]: {
    mimeType: "text/html;profile=mcp-app",
    html: buildCardHtml(GIT_STATUS_SPEC),
  },
  [GIT_LOG_UI_URI]: { mimeType: "text/html;profile=mcp-app", html: buildCardHtml(GIT_LOG_SPEC) },
  [SESSION_OVERVIEW_UI_URI]: {
    mimeType: "text/html;profile=mcp-app",
    html: buildCardHtml(SESSION_OVERVIEW_SPEC),
  },
  [SETTINGS_PREVIEW_UI_URI]: {
    mimeType: "text/html;profile=mcp-app",
    html: buildCardHtml(SETTINGS_PREVIEW_SPEC),
  },
  [CANVAS_APP_URI]: { mimeType: "text/html;profile=mcp-app", html: buildCardHtml(CANVAS_SPEC) },
};
