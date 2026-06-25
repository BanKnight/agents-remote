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
const allowedHosts = (process.env.WEB_ALLOWED_HOSTS ?? "service-remotes-agent.8811156.xyz")
  .split(",")
  .map((host) => host.trim())
  .filter(Boolean);

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
        globPatterns: ["**/*.{js,css,ico,png,svg,woff2}"],
        navigateFallback: null,
        runtimeCaching: [
          {
            // Only intercept navigation requests — serve HTML straight from network
            // so stale SW never caches a zombie index.html.
            // API and other non-precached requests fall through to the browser,
            // which lets Playwright page.route() intercept them in E2E tests.
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkOnly",
          },
        ],
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
    proxy: {
      "/api": {
        target: apiTarget,
        ws: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          return getVendorChunkName(id);
        },
      },
    },
  },
});
