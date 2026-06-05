import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const apiPort = process.env.API_PORT ?? "3001";
const webPort = Number(process.env.WEB_PORT ?? "3000");
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
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkOnly",
          },
          {
            urlPattern: /^.*\/api\/.*/,
            handler: "NetworkOnly",
          },
          {
            urlPattern: () => true,
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
});
