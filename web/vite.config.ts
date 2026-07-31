import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

function readDeployConfig(): Record<string, string> {
  try {
    const raw = readFileSync(join(homedir(), ".agents-remote", "config.toml"), "utf8");
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
    return {};
  }
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

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      devOptions: { enabled: true },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
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
        navigateFallback: "index.html",
        // pages 对外 URL /p/... 是直访的静态站点内容,不是 SPA 路由 —— 必须排除,
        // 否则 navigateFallback 会把它 fallback 到 precached index.html(SW 劫持)。
        navigateFallbackDenylist: [/^\/p\//],
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
    rollupOptions: {
      output: {
        manualChunks(id) {
          return getVendorChunkName(id);
        },
      },
    },
  },
});
