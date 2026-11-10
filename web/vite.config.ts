import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative, resolve } from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { parse as parseYaml } from "yaml";

function readDeployConfig(): Record<string, string> {
  const dir = join(homedir(), ".agents-remote");
  // config.yaml 优先；config.toml 回退（旧格式过渡，api loadConfig 迁移后不再生成）。
  for (const name of ["config.yaml", "config.toml"]) {
    try {
      const raw = readFileSync(join(dir, name), "utf8");
      if (name === "config.yaml") {
        const data = (parseYaml(raw) ?? {}) as Record<string, unknown>;
        return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, String(value)]));
      }
      // legacy flat TOML parser
      const result: Record<string, string> = {};
      for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;
        result[trimmed.slice(0, eq).trim()] = trimmed
          .slice(eq + 1)
          .trim()
          .replace(/^"|"$/g, "");
      }
      return result;
    } catch {
      // 尝试下一个候选文件
    }
  }
  return {};
}

function getVendorChunkName(id: string): string | undefined {
  if (!id.includes("/node_modules/")) return undefined;
  if (id.includes("/node_modules/@xterm/")) return "vendor-terminal";
  if (
    id.includes("/node_modules/@assistant-ui/") ||
    id.includes("/node_modules/react-markdown/") ||
    id.includes("/node_modules/remark-gfm/") ||
    id.includes("/node_modules/remark-") ||
    id.includes("/node_modules/hast-util-") ||
    id.includes("/node_modules/micromark") ||
    id.includes("/node_modules/mdast-") ||
    id.includes("/node_modules/unified/") ||
    id.includes("/node_modules/rehype-") ||
    id.includes("/node_modules/shiki/")
  ) {
    return "vendor-assistant";
  }
  return undefined;
}

const deployConfig = readDeployConfig();
const apiPort = process.env.API_PORT ?? String(deployConfig.api_port ?? "3001");
const webPort = Number(process.env.WEB_PORT ?? deployConfig.web_port ?? "3000");
const apiTarget = process.env.WEB_API_PROXY_TARGET ?? `http://127.0.0.1:${apiPort}`;
// Private deployment behind a Cloudflare Tunnel: allow any host so the tunnel
// domain (and any future one) reaches the server/preview without an allowlist.
const allowedHosts = true;
// Shared by the dev server and the preview server so /api and the session
// WebSocket reach the api process in either mode.
const apiProxy = {
  "/api": {
    target: apiTarget,
    ws: true,
  },
  // pages 对外干净前缀:/p/{project}{urlPath} → /api/projects/{project}/pages{urlPath}。
  // key 用 "/p/"(带尾斜杠):vite proxy 字符串 key 是 startsWith 语义,带尾斜杠只匹配
  // /p/...,不撞 SPA 的 /page、/projects 等路由。project 段保留 encoded 形式(api 自行 decode)。
  "/p/": {
    target: apiTarget,
    rewrite: (path: string) => {
      const match = path.match(/^\/p\/([^/]+)(\/.*)?$/);
      return match ? `/api/projects/${match[1]}/pages${match[2] ?? ""}` : path;
    },
  },
};

// preview 插件：坏 asset 链接显式 404，不被 SPA fallback 吞成 index.html——语义对齐
// api/src/static-web.ts（URL 末段含扩展名 → 404 不 fallback）。毒化链（2026-11-07 发版
// 窗口实证，用户被迫重装 PWA 才恢复）：SW install 对 precache 逐条 fetch，404 被fallback
// 成 text/html 后 workbox 对 200 一律缓存（不校验 content-type）→ 新 SW 接管但缓存被
// HTML 毒化 → 懒 chunk 恒 MIME 报错白屏。404 后 install 失败 → 旧 SW 保持 → dist 稳定后
// 刷新自愈。/api、/p/ 是代理前缀（目标在 api 侧）跳过；文件存在 → next() 交静态服务。
// 只挂 preview（web 长期跑 prod preview 是常态）；dev 模式是逃生口不挂。
function previewBadAsset404(): Plugin {
  const distDir = resolve(import.meta.dirname, "dist");
  return {
    name: "preview-bad-asset-404",
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        let pathname = url.pathname;
        try {
          pathname = decodeURIComponent(pathname);
        } catch {
          // 坏编码按原样判（末段含 . 才可能 404，%2E 类极端形态交给 fallback）
        }
        const last = pathname.slice(pathname.lastIndexOf("/") + 1);
        if (pathname.startsWith("/api/") || pathname.startsWith("/p/") || !last.includes(".")) {
          return next();
        }
        const target = resolve(distDir, `.${pathname}`);
        // relative 判越界（防 ../ 穿越逃出 dist）；存在 → 静态服务处理，不存在 → 真 404。
        const escaped = relative(distDir, target).startsWith("..");
        if (escaped || existsSync(target)) return next();
        res.statusCode = 404;
        res.end();
      });
    },
  };
}

// preview 面 HTML 响应禁 iframe 嵌入（clickjacking，security review 2026-11-10 P2；
// 与 api/src/static-web.ts 生产形态对齐——dev/tunnel 面的 app shell 由 preview serve）。
// /api、/p/ 代理前缀跳过（/p/ 的 CSP 由 api 出 'self'，预览层同源嵌入要放行）；
// 无扩展名路径 = SPA fallback → index.html；前置 setHeader 经 Node setHeader 聚合，
// sirv/fallback 响应保留预设头。只挂 preview（dev 逃生口不挂，对齐 previewBadAsset404）。
function previewHtmlFrameAncestors(): Plugin {
  return {
    name: "preview-html-frame-ancestors",
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
        if (pathname.startsWith("/api/") || pathname.startsWith("/p/")) return next();
        const last = pathname.slice(pathname.lastIndexOf("/") + 1);
        if (last.includes(".") && !last.endsWith(".html")) return next();
        res.setHeader("Content-Security-Policy", "frame-ancestors 'none'");
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      // injectManifest 的 dev SW 是 ESM（sw.ts 原样 transform），须 module 注册；
      // generateSW 时代的 dev SW 是 IIFE（classic），迁移后此项必须显式化。
      // navigateFallback 给 dev 的 __WB_MANIFEST 注入 index.html 条目——否则 dev SW 顶层
      // createHandlerBoundToURL('index.html') 抛 non-precached-url，SW evaluate 失败。
      devOptions: { enabled: true, type: "module", navigateFallback: "index.html" },
      // injectManifest 策略（PWA Web Push 批）：自定义 src/sw.ts 承载 push /
      // notificationclick handler，同时保留原 generateSW 的全量 precache +
      // navigateFallback 行为（sw.ts 手写 precacheAndRoute + NavigationRoute，
      // navigateFallback/navigateFallbackDenylist/skipWaiting/clientsClaim 是
      // generateSW 专有选项，injectManifest 下必须在 sw.ts 内自行实现）。
      // ⚠️ strategies 不显式指定时恒 generateSW（只写 injectManifest 块不切换，
      // build 日志 mode 行可核实）。
      strategies: "injectManifest",
      // sw 源文件 = src/sw.ts（srcDir 默认 public/，须显式指到 src/）。
      srcDir: "src",
      filename: "sw.ts",
      // injectManifest 的 manifest 只含 vite bundle 产物；public/ 静态文件须 includeAssets
      // 补进 precache。⚠️ webmanifest 不能列这里——插件自动注入的条目 revision 与 public
      // 拷贝不同 → workbox add-to-cache-list-conflicting-entries → SW evaluate 直接失败。
      includeAssets: ["icons/**/*"],
      // injectionPoint 默认即 self.__WB_MANIFEST。
      injectManifest: {
        injectionPoint: "self.__WB_MANIFEST",
        // Precache every build artifact — JS/CSS chunks (incl. vendor-terminal
        // and vendor-assistant), index.html, icons, fonts — and serve them
        // straight from the precache. index.html is included so the SW, the
        // HTML, and all referenced chunks update atomically on a new deploy
        // (autoUpdate reloads once); a navigation HTML fetched fresh from the
        // network could otherwise reference chunk hashes the old SW hasn't
        // precached yet. navigateFallback routes every SPA navigation to the
        // precached index.html, so reloads are served from cache with no
        // network wait. /api fetches and WebSocket upgrades aren't navigation
        // requests, so they're untouched (E2E page.route() interception too).
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        // mermaid 依赖树（批 16 mermaid 渲染）改走运行时网络拉取、不进 precache：
        // 全树 ~3MB（elk/chunk 系/各图类型 Diagram/cytoscape/katex/dagre…），绝大多数
        // 会话从不包含 mermaid 块，PWA 安装/更新静默全量下载不划算；遇到 mermaid 块时
        // 动态 import 按需网络加载（在线语义，加载失败降级错误行 + 源码 pre）。名单 =
        // mermaid 专有命名（本仓代码 chunk 语义命名无冲突）；esm-*.js 实为 CodeMirror
        // chunk（CodeEditor/WorkbenchRoute 静态 import，404KB，precache 必需——复审二轮
        // P3 勘误：非 shiki）保留。mermaid 高频新增图类型（wardley/eventmodeling 等以
        // 图类型名-hash 命名）会按新名静默泄进 precache，故配套 scripts/ar-verify-precache.mjs
        // 机检（precache 条目静态 import 被排除 chunk 即 fail），升级 mermaid 后必跑。
        // chunk-*.js 现状全为 mermaid 内部 hex chunk，若未来本仓出现无名 chunk 需复核此名单。
        globIgnores: [
          "**/mermaid*.js",
          "**/chunk-*.js",
          "**/*Diagram-*.js",
          "**/diagram-*.js",
          "**/*-definition-*.js",
          "**/elk-*.js",
          "**/cytoscape*.js",
          "**/cose-bilkent-*.js",
          "**/dagre-*.js",
          "**/graphlib-*.js",
          "**/rough.esm-*.js",
          "**/katex-*.js",
          "**/railroad-*.js",
          "**/architecture-*.js",
          "**/swimlanes-*.js",
          "**/gitGraph-*.js",
          "**/cynefin-*.js",
          "**/packet-*.js",
          "**/pie-*.js",
          "**/radar-*.js",
          "**/treemap-*.js",
          "**/treeView-*.js",
          "**/sizeCapture-*.js",
          "**/src-*.js",
          "**/info-*.js",
          "**/wardley-*.js",
          "**/eventmodeling-*.js",
          "**/linear-*.js",
          "**/line-*.js",
          "**/channel-*.js",
        ],
        // navigateFallback/navigateFallbackDenylist 是 generateSW 专有——injectManifest
        // 下由 sw.ts 的 NavigationRoute(createHandlerBoundToURL("index.html"),
        // { denylist: [/^\/p\//] }) 等价实现。
      },
      manifest: {
        name: "智控 · AI 远程控制台",
        short_name: "智控",
        description: "AI 智能体远程控制台 — 在浏览器中管理、观察和调度远程 AI Agent 任务。",
        theme_color: "#020617",
        background_color: "#020617",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" },
        ],
      },
    }),
    previewBadAsset404(),
    previewHtmlFrameAncestors(),
  ],
  resolve: {
    alias: {
      "@": new URL("src", import.meta.url).pathname,
    },
  },
  server: {
    allowedHosts,
    port: webPort,
    proxy: apiProxy,
  },
  // preview serves the prod build and is the long-term way to run web locally:
  // the SW's precache / navigateFallback only behave like production against
  // the built dist, so dev-mode HMR diverges from prod PWA behavior. Pair with
  // `vite build --watch` (see scripts/ar-dev-web.sh) to rebuild on save;
  // preview reads dist on each request so a refresh picks up the new bundle.
  // host/allowedHosts/port/proxy mirror server so the tunnel and /api + WS
  // work identically to dev.
  preview: {
    host: true,
    allowedHosts,
    port: webPort,
    proxy: apiProxy,
  },
  build: {
    // Sourcemaps so prod-build issues are debuggable in DevTools. The .map
    // files aren't in workbox globPatterns, so they aren't precached — they're
    // fetched on demand by DevTools only. Private deployment, so exposing
    // maps on the tunnel is acceptable.
    sourcemap: true,
    // CSS code split off：每次 build emit 单个 CSS 资源。vite 8(rolldown) build --watch
    // 增量偶尔跳过重 emit 内容/hash 未变的 CSS chunk，致 dist 缺 HTML 引用的 CSS 文件
    //（build-watch-css-not-flushed）。关 code split 后 CSS 作单一入口副作用每次必 emit，
    // watch rebuild 不再漏。单页 SPA 无副作用（本就单入口 CSS）。
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          return getVendorChunkName(id);
        },
      },
    },
  },
});
