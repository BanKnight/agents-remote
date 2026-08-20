import { afterEach, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleChatSessionRoutes } from "./chat-session-routes";
import { ChatSessionRegistry } from "./chat-session-registry";

const tempDirs: string[] = [];

const makeRegistry = (options: { createId?: () => string; now?: () => Date } = {}) => {
  const dir = join(tmpdir(), `agents-remote-chat-routes-${Math.random().toString(36).slice(2)}`);
  tempDirs.push(dir);
  return new ChatSessionRegistry({ sessionsDir: dir, ...options });
};

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const makeUrl = (pathname: string) => new URL(`http://localhost${pathname}`);

const makeRequest = (method: string, pathname: string, body?: unknown) =>
  new Request(`http://localhost${pathname}`, {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
  });

// ── collection ──

test("GET /api/chat-sessions returns empty list initially", async () => {
  const registry = makeRegistry();
  const res = await handleChatSessionRoutes(
    makeRequest("GET", "/api/chat-sessions"),
    makeUrl("/api/chat-sessions"),
    registry,
  );
  expect(res?.status).toBe(200);
  expect(await res!.json()).toEqual({ sessions: [] });
});

test("POST /api/chat-sessions creates session with default name", async () => {
  const registry = makeRegistry({ createId: () => "chat_1" });
  const res = await handleChatSessionRoutes(
    makeRequest("POST", "/api/chat-sessions"),
    makeUrl("/api/chat-sessions"),
    registry,
  );
  expect(res?.status).toBe(200);
  const body = await res!.json();
  expect(body.session.id).toBe("chat_1");
  expect(body.session.displayName).toBe("新对话");
  expect(body.session.status).toBe("idle");
});

test("POST /api/chat-sessions with displayName trims whitespace", async () => {
  const registry = makeRegistry({ createId: () => "chat_2" });
  const res = await handleChatSessionRoutes(
    makeRequest("POST", "/api/chat-sessions", { displayName: "  我的对话  " }),
    makeUrl("/api/chat-sessions"),
    registry,
  );
  const body = await res!.json();
  expect(body.session.displayName).toBe("我的对话");
});

test("unsupported method on collection returns undefined", async () => {
  const registry = makeRegistry();
  const res = await handleChatSessionRoutes(
    makeRequest("PUT", "/api/chat-sessions"),
    makeUrl("/api/chat-sessions"),
    registry,
  );
  expect(res).toBeUndefined();
});

// ── item ──

test("GET /api/chat-sessions/:id returns detail", async () => {
  const registry = makeRegistry({ createId: () => "chat_detail" });
  await registry.createChatSession("详情测试");
  const res = await handleChatSessionRoutes(
    makeRequest("GET", "/api/chat-sessions/chat_detail"),
    makeUrl("/api/chat-sessions/chat_detail"),
    registry,
  );
  expect(res?.status).toBe(200);
  const body = await res!.json();
  expect(body.session.id).toBe("chat_detail");
  expect(body.session.displayName).toBe("详情测试");
});

test("GET /api/chat-sessions/:id not found → 404", async () => {
  const registry = makeRegistry();
  const res = await handleChatSessionRoutes(
    makeRequest("GET", "/api/chat-sessions/chat_nope"),
    makeUrl("/api/chat-sessions/chat_nope"),
    registry,
  );
  expect(res?.status).toBe(404);
});

// ── rename ──

test("POST /api/chat-sessions/:id/rename updates displayName", async () => {
  const registry = makeRegistry({ createId: () => "chat_rename" });
  await registry.createChatSession("旧名");
  const res = await handleChatSessionRoutes(
    makeRequest("POST", "/api/chat-sessions/chat_rename/rename", { displayName: "新名" }),
    makeUrl("/api/chat-sessions/chat_rename/rename"),
    registry,
  );
  expect(res?.status).toBe(200);
  const body = await res!.json();
  expect(body.session.displayName).toBe("新名");
});

test("POST /api/chat-sessions/:id/rename empty name → 400", async () => {
  const registry = makeRegistry({ createId: () => "chat_rename2" });
  await registry.createChatSession();
  const res = await handleChatSessionRoutes(
    makeRequest("POST", "/api/chat-sessions/chat_rename2/rename", { displayName: "   " }),
    makeUrl("/api/chat-sessions/chat_rename2/rename"),
    registry,
  );
  expect(res?.status).toBe(400);
});

test("POST /api/chat-sessions/:id/rename not found → 404", async () => {
  const registry = makeRegistry();
  const res = await handleChatSessionRoutes(
    makeRequest("POST", "/api/chat-sessions/chat_nope/rename", { displayName: "x" }),
    makeUrl("/api/chat-sessions/chat_nope/rename"),
    registry,
  );
  expect(res?.status).toBe(404);
});

// ── close ──

test("POST /api/chat-sessions/:id/close removes session + returns closed", async () => {
  const registry = makeRegistry({ createId: () => "chat_close" });
  await registry.createChatSession();
  const res = await handleChatSessionRoutes(
    makeRequest("POST", "/api/chat-sessions/chat_close/close"),
    makeUrl("/api/chat-sessions/chat_close/close"),
    registry,
  );
  expect(res?.status).toBe(200);
  const body = await res!.json();
  expect(body.session.status).toBe("closed");
  const after = await registry.getChatSession("chat_close");
  expect(after).toBeUndefined();
});

test("POST /api/chat-sessions/:id/close not found → 404", async () => {
  const registry = makeRegistry();
  const res = await handleChatSessionRoutes(
    makeRequest("POST", "/api/chat-sessions/chat_nope/close"),
    makeUrl("/api/chat-sessions/chat_nope/close"),
    registry,
  );
  expect(res?.status).toBe(404);
});

// ── 路由不匹配 ──

test("non-chat-sessions path returns undefined", async () => {
  const registry = makeRegistry();
  const res = await handleChatSessionRoutes(
    makeRequest("GET", "/api/projects/foo/agent-sessions"),
    makeUrl("/api/projects/foo/agent-sessions"),
    registry,
  );
  expect(res).toBeUndefined();
});

test("invalid route suffix returns undefined", async () => {
  const registry = makeRegistry({ createId: () => "chat_x" });
  await registry.createChatSession();
  const res = await handleChatSessionRoutes(
    makeRequest("POST", "/api/chat-sessions/chat_x/invalid"),
    makeUrl("/api/chat-sessions/chat_x/invalid"),
    registry,
  );
  expect(res).toBeUndefined();
});

// ── management actions（pin/unpin/archive/unarchive）──

test("POST /:id/pin sets pinned=true + 不更新 updatedAt", async () => {
  const registry = makeRegistry({ createId: () => "chat_pin" });
  await handleChatSessionRoutes(
    makeRequest("POST", "/api/chat-sessions"),
    makeUrl("/api/chat-sessions"),
    registry,
  );
  const res = await handleChatSessionRoutes(
    makeRequest("POST", "/api/chat-sessions/chat_pin/pin"),
    makeUrl("/api/chat-sessions/chat_pin/pin"),
    registry,
  );
  expect(res?.status).toBe(200);
  const body = await res!.json();
  expect(body.session.pinned).toBe(true);
});

test("POST /:id/unpin sets pinned=false", async () => {
  const registry = makeRegistry({ createId: () => "chat_pin2" });
  await handleChatSessionRoutes(
    makeRequest("POST", "/api/chat-sessions"),
    makeUrl("/api/chat-sessions"),
    registry,
  );
  const res = await handleChatSessionRoutes(
    makeRequest("POST", "/api/chat-sessions/chat_pin2/unpin"),
    makeUrl("/api/chat-sessions/chat_pin2/unpin"),
    registry,
  );
  expect(res?.status).toBe(200);
  expect((await res!.json()).session.pinned).toBe(false);
});

test("POST /:id/archive sets archivedAt", async () => {
  const registry = makeRegistry({ createId: () => "chat_arch" });
  await handleChatSessionRoutes(
    makeRequest("POST", "/api/chat-sessions"),
    makeUrl("/api/chat-sessions"),
    registry,
  );
  const res = await handleChatSessionRoutes(
    makeRequest("POST", "/api/chat-sessions/chat_arch/archive"),
    makeUrl("/api/chat-sessions/chat_arch/archive"),
    registry,
  );
  expect(res?.status).toBe(200);
  const body = await res!.json();
  expect(typeof body.session.archivedAt).toBe("string");
});

test("POST /:id/unarchive clears archivedAt", async () => {
  const registry = makeRegistry({ createId: () => "chat_arch2" });
  await handleChatSessionRoutes(
    makeRequest("POST", "/api/chat-sessions"),
    makeUrl("/api/chat-sessions"),
    registry,
  );
  await handleChatSessionRoutes(
    makeRequest("POST", "/api/chat-sessions/chat_arch2/archive"),
    makeUrl("/api/chat-sessions/chat_arch2/archive"),
    registry,
  );
  const res = await handleChatSessionRoutes(
    makeRequest("POST", "/api/chat-sessions/chat_arch2/unarchive"),
    makeUrl("/api/chat-sessions/chat_arch2/unarchive"),
    registry,
  );
  expect(res?.status).toBe(200);
  expect((await res!.json()).session.archivedAt).toBeUndefined();
});

test("management action: 不存在 id → 404 SESSION_NOT_FOUND", async () => {
  const registry = makeRegistry();
  const res = await handleChatSessionRoutes(
    makeRequest("POST", "/api/chat-sessions/chat_nope/pin"),
    makeUrl("/api/chat-sessions/chat_nope/pin"),
    registry,
  );
  expect(res?.status).toBe(404);
  expect((await res!.json()).error?.code).toBe("SESSION_NOT_FOUND");
});
