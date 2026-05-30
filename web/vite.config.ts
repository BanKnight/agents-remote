import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

const personalConfig = readPersonalConfig();
const apiPort = process.env.API_PORT ?? personalConfig.apiPort ?? "3001";
const webPort = Number(process.env.WEB_PORT ?? personalConfig.webPort ?? "3000");
const apiTarget = process.env.WEB_API_PROXY_TARGET ?? `http://127.0.0.1:${apiPort}`;
const allowedHosts = (process.env.WEB_ALLOWED_HOSTS ?? "service-remotes-agent.8811156.xyz")
  .split(",")
  .map((host) => host.trim())
  .filter(Boolean);

function readPersonalConfig() {
  try {
    const config = readFileSync(join(homedir(), ".agents-remote", "config.toml"), "utf8");

    return {
      apiPort: readTomlNumber(config, "api_port"),
      webPort: readTomlNumber(config, "web_port"),
    };
  } catch {
    return {};
  }
}

function readTomlNumber(content: string, key: string) {
  const match = content.match(new RegExp(`^${key}\\s*=\\s*(\\d+)`, "m"));
  return match?.[1];
}

function devCacheHeaders(): Plugin {
  return {
    name: "agents-remote-dev-cache-headers",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = request.url?.split("?")[0] ?? "";

        if (path === "/" || path === "/index.html" || path === "/service-worker.js") {
          response.setHeader("Cache-Control", "no-cache");
        }

        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [devCacheHeaders(), react(), tailwindcss()],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src"),
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
