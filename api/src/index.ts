import type { HealthResponse } from "@agents-remote/shared";
import { AuthService } from "./auth";
import { handleAuthMe, handleLogin, jsonError, requireHttpAuth } from "./http-auth";
import { ensureRuntimeDir, resolveRuntimePaths } from "./runtime-dir";
import { loadSettings, StartupError } from "./settings";
import { canUpgradeWebSocket } from "./ws-auth";

type UpgradeServer = {
  upgrade(request: Request): boolean;
};

export const createFetchHandler =
  (auth: AuthService) => (request: Request, server: UpgradeServer) => {
    const url = new URL(request.url);

    if (url.pathname === "/api/health" && request.method === "GET") {
      const response: HealthResponse = { ok: true, service: "api" };
      return Response.json(response);
    }

    if (url.pathname === "/api/auth/login" && request.method === "POST") {
      return handleLogin(request, auth);
    }

    if (url.pathname === "/api/auth/me" && request.method === "GET") {
      return handleAuthMe(request, auth);
    }

    if (url.pathname === "/api/ws/echo") {
      if (!canUpgradeWebSocket(request, auth)) {
        return jsonError("UNAUTHENTICATED", "Authentication required", 401);
      }

      if (server.upgrade(request)) {
        return undefined;
      }

      return new Response("WebSocket upgrade required", { status: 426 });
    }

    if (url.pathname.startsWith("/api/")) {
      const authFailure = requireHttpAuth(request, auth);

      if (authFailure) {
        return authFailure;
      }
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  };

export const startApi = async () => {
  const settings = await loadSettings();
  const runtimePaths = await ensureRuntimeDir(resolveRuntimePaths());
  const auth = new AuthService({ appPassword: settings.appPassword });
  const server = Bun.serve({
    port: settings.apiPort,
    fetch: createFetchHandler(auth),
    websocket: {
      message(ws, message) {
        ws.send(message);
      },
    },
  });

  console.log(`api listening on http://localhost:${server.port}`);
  console.log(`api runtime dir ${runtimePaths.runDir}`);

  return server;
};

if (import.meta.main) {
  try {
    await startApi();
  } catch (error) {
    if (error instanceof StartupError) {
      console.error(`${error.code}: ${error.message}`);
      process.exit(1);
    }

    throw error;
  }
}
