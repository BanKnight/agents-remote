import type { HealthResponse } from "@agents-remote/shared";

const port = Number(process.env.API_PORT ?? "3001");

const server = Bun.serve({
  port,
  fetch(request, server) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health" && request.method === "GET") {
      const response: HealthResponse = { ok: true, service: "api" };
      return Response.json(response);
    }

    if (url.pathname === "/api/ws/echo") {
      if (server.upgrade(request)) {
        return undefined;
      }

      return new Response("WebSocket upgrade required", { status: 426 });
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  },
  websocket: {
    message(ws, message) {
      ws.send(message);
    },
  },
});

console.log(`api listening on http://localhost:${server.port}`);
