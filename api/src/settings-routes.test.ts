import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AuthService } from "./auth";
import { createFetchHandler } from "./index";
import { handleSettingsRoutes } from "./settings-routes";
import { SettingsStore } from "./settings-store";

const tempDirs: string[] = [];

const makeTempDir = async () => {
  const dir = await mkdtemp(join(tmpdir(), "agents-remote-settings-routes-"));
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

const makeRequest = (method: string, pathname: string, body?: unknown) =>
  new Request(`http://localhost${pathname}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

test("GET /api/settings returns defaults when empty", async () => {
  const store = await makeStore();
  const res = await handleSettingsRoutes(
    makeRequest("GET", "/api/settings"),
    makeUrl("/api/settings"),
    store,
  );

  expect(res?.status).toBe(200);
  const body = await res!.json();
  expect(body.settings.providers).toEqual([]);
  expect(body.settings.runtimes.claude.effort).toBe("high");
});

test("POST provider then GET returns masked apiKey (raw key never leaves store)", async () => {
  const store = await makeStore();
  const create = await handleSettingsRoutes(
    makeRequest("POST", "/api/settings/providers", {
      label: "官方",
      apiKey: "sk-ant-abc123wX4k",
    }),
    makeUrl("/api/settings/providers"),
    store,
  );

  expect(create?.status).toBe(201);
  const created = await create!.json();
  expect(created.provider.apiKeyMasked).toBe("sk-ant-...wX4k");
  expect(created.provider.hasApiKey).toBe(true);
  expect(created.provider).not.toHaveProperty("apiKey");
  expect(created.provider.id).toBeTruthy();

  const get = await handleSettingsRoutes(
    makeRequest("GET", "/api/settings"),
    makeUrl("/api/settings"),
    store,
  );
  const got = await get!.json();
  expect(got.settings.providers[0].apiKeyMasked).toBe("sk-ant-...wX4k");
  expect(JSON.stringify(got)).not.toContain("sk-ant-abc123wX4k");
});

test("POST provider rejects empty label / apiKey", async () => {
  const store = await makeStore();
  const noLabel = await handleSettingsRoutes(
    makeRequest("POST", "/api/settings/providers", { label: "", apiKey: "sk-x" }),
    makeUrl("/api/settings/providers"),
    store,
  );
  expect(noLabel?.status).toBe(400);

  const noKey = await handleSettingsRoutes(
    makeRequest("POST", "/api/settings/providers", { label: "A", apiKey: "" }),
    makeUrl("/api/settings/providers"),
    store,
  );
  expect(noKey?.status).toBe(400);
});

test("PUT provider: empty apiKey keeps current; non-empty overwrites", async () => {
  const store = await makeStore();
  await store.update((s) => ({
    ...s,
    providers: [{ id: "p1", label: "A", apiKey: "sk-original-long-key-12345" }],
  }));

  await handleSettingsRoutes(
    makeRequest("PUT", "/api/settings/providers/p1", { label: "A2" }),
    makeUrl("/api/settings/providers/p1"),
    store,
  );
  const afterKeep = await store.read();
  expect(afterKeep.providers[0].apiKey).toBe("sk-original-long-key-12345");
  expect(afterKeep.providers[0].label).toBe("A2");

  await handleSettingsRoutes(
    makeRequest("PUT", "/api/settings/providers/p1", { apiKey: "sk-new-long-key-67890" }),
    makeUrl("/api/settings/providers/p1"),
    store,
  );
  const afterOverwrite = await store.read();
  expect(afterOverwrite.providers[0].apiKey).toBe("sk-new-long-key-67890");
});

test("PUT provider 404 when id not found", async () => {
  const store = await makeStore();
  const res = await handleSettingsRoutes(
    makeRequest("PUT", "/api/settings/providers/missing", { label: "X" }),
    makeUrl("/api/settings/providers/missing"),
    store,
  );
  expect(res?.status).toBe(404);
});

test("DELETE provider clears runtime reference when in use", async () => {
  const store = await makeStore();
  await store.update((s) => ({
    ...s,
    providers: [{ id: "p1", label: "A", apiKey: "sk-a" }],
    runtimes: { ...s.runtimes, claude: { ...s.runtimes.claude, providerId: "p1" } },
  }));

  const del = await handleSettingsRoutes(
    makeRequest("DELETE", "/api/settings/providers/p1"),
    makeUrl("/api/settings/providers/p1"),
    store,
  );
  expect(del?.status).toBe(200);

  const after = await store.read();
  expect(after.providers).toHaveLength(0);
  expect(after.runtimes.claude.providerId).toBe("");
});

test("PUT runtimes/claude updates effort and persists", async () => {
  const store = await makeStore();
  const res = await handleSettingsRoutes(
    makeRequest("PUT", "/api/settings/runtimes/claude", { effort: "max", enable1mContext: true }),
    makeUrl("/api/settings/runtimes/claude"),
    store,
  );
  expect(res?.status).toBe(200);
  const body = await res!.json();
  expect(body.runtime.effort).toBe("max");
  expect(body.runtime.enable1mContext).toBe(true);

  const after = await store.read();
  expect(after.runtimes.claude.effort).toBe("max");
});

test("PUT runtimes/claude rejects invalid effort and unknown providerId", async () => {
  const store = await makeStore();
  const badEffort = await handleSettingsRoutes(
    makeRequest("PUT", "/api/settings/runtimes/claude", { effort: "ultra" }),
    makeUrl("/api/settings/runtimes/claude"),
    store,
  );
  expect(badEffort?.status).toBe(400);

  const badProvider = await handleSettingsRoutes(
    makeRequest("PUT", "/api/settings/runtimes/claude", { providerId: "nope" }),
    makeUrl("/api/settings/runtimes/claude"),
    store,
  );
  expect(badProvider?.status).toBe(400);
});

test("createFetchHandler protects /api/settings without auth", async () => {
  const handler = createFetchHandler(
    new AuthService({ appPassword: "secret", tokenSecret: "test-secret" }),
    { settingsStore: await makeStore() },
  );
  const res = await handler(new Request("http://localhost/api/settings"), { upgrade: () => false });

  expect(res?.status).toBe(401);
  const body = await res!.json();
  expect(body.error.code).toBe("UNAUTHENTICATED");
});

test("createFetchHandler serves /api/settings after auth", async () => {
  const auth = new AuthService({ appPassword: "secret", tokenSecret: "test-secret" });
  const store = await makeStore();
  const handler = createFetchHandler(auth, { settingsStore: store });
  const token = auth.login("secret").token;
  const res = await handler(
    new Request("http://localhost/api/settings", {
      headers: { authorization: `Bearer ${token}` },
    }),
    { upgrade: () => false },
  );

  expect(res?.status).toBe(200);
  const body = await res!.json();
  expect(body.settings.runtimes.claude.effort).toBe("high");
});

// ── protocol 透传 ──

test("POST provider stores and returns protocol; missing protocol defaults to anthropic", async () => {
  const store = await makeStore();
  const created = await handleSettingsRoutes(
    makeRequest("POST", "/api/settings/providers", {
      label: "GW",
      apiKey: "sk-gw",
      protocol: "openai-compatible",
    }),
    makeUrl("/api/settings/providers"),
    store,
  );
  expect((await created!.json()).provider.protocol).toBe("openai-compatible");

  const createdDefault = await handleSettingsRoutes(
    makeRequest("POST", "/api/settings/providers", { label: "A", apiKey: "sk-a" }),
    makeUrl("/api/settings/providers"),
    store,
  );
  expect((await createdDefault!.json()).provider.protocol).toBe("anthropic");
});

test("PUT provider updates protocol", async () => {
  const store = await makeStore();
  await store.update((s) => ({
    ...s,
    providers: [{ id: "p1", label: "A", apiKey: "sk-a", protocol: "anthropic" }],
  }));
  await handleSettingsRoutes(
    makeRequest("PUT", "/api/settings/providers/p1", { protocol: "openai-compatible" }),
    makeUrl("/api/settings/providers/p1"),
    store,
  );
  const after = await store.read();
  expect(after.providers[0].protocol).toBe("openai-compatible");
});

// ── POST /providers/:id/models (发现模型) ──

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

const installFetch = (impl: () => Promise<Response> | Response) => {
  globalThis.fetch = (async () => impl()) as typeof fetch;
};

test("POST /providers/:id/models returns {ok:true, models} using provider credentials", async () => {
  const store = await makeStore();
  await store.update((s) => ({
    ...s,
    providers: [{ id: "p1", label: "A", apiKey: "sk-a", protocol: "anthropic" }],
  }));
  installFetch(
    () =>
      new Response(JSON.stringify({ data: [{ id: "claude-opus-4-8" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  );

  const res = await handleSettingsRoutes(
    makeRequest("POST", "/api/settings/providers/p1/models"),
    makeUrl("/api/settings/providers/p1/models"),
    store,
  );
  expect(res?.status).toBe(200);
  const body = await res!.json();
  expect(body).toEqual({ ok: true, models: ["claude-opus-4-8"] });
});

test("POST /providers/:id/models surfaces upstream failure as {ok:false} (no API error)", async () => {
  const store = await makeStore();
  await store.update((s) => ({
    ...s,
    providers: [{ id: "p1", label: "A", apiKey: "sk-a", protocol: "anthropic" }],
  }));
  installFetch(() => new Response("unauth", { status: 401 }));

  const res = await handleSettingsRoutes(
    makeRequest("POST", "/api/settings/providers/p1/models"),
    makeUrl("/api/settings/providers/p1/models"),
    store,
  );
  // 上游 401 不映射成 API 错误码——HTTP 200 + {ok:false, error}，前端展示测试结果。
  expect(res?.status).toBe(200);
  const body = await res!.json();
  expect(body.ok).toBe(false);
  expect(body.models).toEqual([]);
  expect(body.error).toBeTruthy();
});

test("POST /providers/:id/models 404 when provider missing", async () => {
  const store = await makeStore();
  const res = await handleSettingsRoutes(
    makeRequest("POST", "/api/settings/providers/missing/models"),
    makeUrl("/api/settings/providers/missing/models"),
    store,
  );
  expect(res?.status).toBe(404);
});
