import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AuthService } from "./auth";
import { createFetchHandler } from "./index";
import { handlePreferencesRoutes } from "./preferences-routes";
import { SettingsStore } from "./settings-store";

const tempDirs: string[] = [];

const makeTempDir = async () => {
  const dir = await mkdtemp(join(tmpdir(), "agents-remote-preferences-routes-"));
  tempDirs.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const makeStore = async () => {
  const dir = await makeTempDir();
  return new SettingsStore({ path: join(dir, "providers.json") });
};

const makeUrl = (pathname: string) => new URL(`http://localhost${pathname}`);

const makeRequest = (method: string, pathname: string) =>
  new Request(`http://localhost${pathname}`, { method });

// ── GET /api/preferences/pinned-sessions ──

test("GET /api/preferences/pinned-sessions returns empty list when none pinned", async () => {
  const store = await makeStore();
  const res = await handlePreferencesRoutes(
    makeRequest("GET", "/api/preferences/pinned-sessions"),
    makeUrl("/api/preferences/pinned-sessions"),
    store,
  );

  expect(res?.status).toBe(200);
  expect(await res!.json()).toEqual({ sessions: [] });
});

// ── POST /:sessionId (pin) ──

test("POST pin adds sessionId and returns updated list", async () => {
  const store = await makeStore();
  const res = await handlePreferencesRoutes(
    makeRequest("POST", "/api/preferences/pinned-sessions/ar-claude-test-1"),
    makeUrl("/api/preferences/pinned-sessions/ar-claude-test-1"),
    store,
  );

  expect(res?.status).toBe(200);
  expect(await res!.json()).toEqual({ sessions: ["ar-claude-test-1"] });

  const after = await store.read();
  expect(after.ui?.pinnedSessions).toEqual(["ar-claude-test-1"]);
});

test("POST pin dedupes repeated sessionId (no-op)", async () => {
  const store = await makeStore();
  await handlePreferencesRoutes(
    makeRequest("POST", "/api/preferences/pinned-sessions/sess-1"),
    makeUrl("/api/preferences/pinned-sessions/sess-1"),
    store,
  );
  const res = await handlePreferencesRoutes(
    makeRequest("POST", "/api/preferences/pinned-sessions/sess-1"),
    makeUrl("/api/preferences/pinned-sessions/sess-1"),
    store,
  );

  expect(res?.status).toBe(200);
  expect(await res!.json()).toEqual({ sessions: ["sess-1"] });
});

test("POST pin preserves insertion order across multiple entries", async () => {
  const store = await makeStore();
  await handlePreferencesRoutes(
    makeRequest("POST", "/api/preferences/pinned-sessions/a"),
    makeUrl("/api/preferences/pinned-sessions/a"),
    store,
  );
  const res = await handlePreferencesRoutes(
    makeRequest("POST", "/api/preferences/pinned-sessions/b"),
    makeUrl("/api/preferences/pinned-sessions/b"),
    store,
  );

  expect(await res!.json()).toEqual({ sessions: ["a", "b"] });
});

test("POST pin decodes percent-encoded sessionId (runtime key with /)", async () => {
  const store = await makeStore();
  // runtime key 可能含特殊字符（如 projectKey 的 /），客户端用 encodeURIComponent 进 path，
  // 后端 decodeURIComponent 还原。
  const res = await handlePreferencesRoutes(
    makeRequest("POST", "/api/preferences/pinned-sessions/ar-terminal-my%2Fproj-1"),
    makeUrl("/api/preferences/pinned-sessions/ar-terminal-my%2Fproj-1"),
    store,
  );

  expect(res?.status).toBe(200);
  expect(await res!.json()).toEqual({ sessions: ["ar-terminal-my/proj-1"] });
});

// ── DELETE /:sessionId (unpin) ──

test("DELETE unpin removes sessionId and returns updated list", async () => {
  const store = await makeStore();
  await handlePreferencesRoutes(
    makeRequest("POST", "/api/preferences/pinned-sessions/sess-1"),
    makeUrl("/api/preferences/pinned-sessions/sess-1"),
    store,
  );

  const res = await handlePreferencesRoutes(
    makeRequest("DELETE", "/api/preferences/pinned-sessions/sess-1"),
    makeUrl("/api/preferences/pinned-sessions/sess-1"),
    store,
  );

  expect(res?.status).toBe(200);
  expect(await res!.json()).toEqual({ sessions: [] });
  const after = await store.read();
  expect(after.ui?.pinnedSessions).toEqual([]);
});

test("DELETE unpin when not pinned is no-op (returns empty, no error)", async () => {
  const store = await makeStore();
  const res = await handlePreferencesRoutes(
    makeRequest("DELETE", "/api/preferences/pinned-sessions/never-pinned"),
    makeUrl("/api/preferences/pinned-sessions/never-pinned"),
    store,
  );

  expect(res?.status).toBe(200);
  expect(await res!.json()).toEqual({ sessions: [] });
});

test("DELETE unpin preserves remaining entries", async () => {
  const store = await makeStore();
  for (const id of ["a", "b", "c"]) {
    await handlePreferencesRoutes(
      makeRequest("POST", `/api/preferences/pinned-sessions/${id}`),
      makeUrl(`/api/preferences/pinned-sessions/${id}`),
      store,
    );
  }

  const res = await handlePreferencesRoutes(
    makeRequest("DELETE", "/api/preferences/pinned-sessions/b"),
    makeUrl("/api/preferences/pinned-sessions/b"),
    store,
  );

  expect(await res!.json()).toEqual({ sessions: ["a", "c"] });
});

// ── malformed path ──

test("POST/DELETE with malformed percent-sequence returns 400 (no 500)", async () => {
  const store = await makeStore();
  // %e0%80 = 非法 UTF-8 序列 → decodeURIComponent 抛 URIError → 400（防 500）。
  const post = await handlePreferencesRoutes(
    makeRequest("POST", "/api/preferences/pinned-sessions/bad%e0%80"),
    makeUrl("/api/preferences/pinned-sessions/bad%e0%80"),
    store,
  );
  expect(post?.status).toBe(400);
  expect((await post!.json()).error.code).toBe("SETTINGS_INVALID");

  const del = await handlePreferencesRoutes(
    makeRequest("DELETE", "/api/preferences/pinned-sessions/bad%e0%80"),
    makeUrl("/api/preferences/pinned-sessions/bad%e0%80"),
    store,
  );
  expect(del?.status).toBe(400);
});

// ── auth gate（/api/preferences 经 requireHttpAuth 守卫）──

test("createFetchHandler protects /api/preferences without auth", async () => {
  const handler = createFetchHandler(
    new AuthService({ appPassword: "secret", tokenSecret: "test-secret" }),
    { settingsStore: await makeStore() },
  );
  const res = await handler(new Request("http://localhost/api/preferences/pinned-sessions"), {
    upgrade: () => false,
  });

  expect(res?.status).toBe(401);
  expect((await res!.json()).error.code).toBe("UNAUTHENTICATED");
});

test("createFetchHandler serves /api/preferences after auth", async () => {
  const auth = new AuthService({ appPassword: "secret", tokenSecret: "test-secret" });
  const handler = createFetchHandler(auth, { settingsStore: await makeStore() });
  const token = auth.login("secret").token;

  const res = await handler(
    new Request("http://localhost/api/preferences/pinned-sessions", {
      headers: { authorization: `Bearer ${token}` },
    }),
    { upgrade: () => false },
  );

  expect(res?.status).toBe(200);
  expect(await res!.json()).toEqual({ sessions: [] });
});
