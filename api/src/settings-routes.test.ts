import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ClaudeModelMapping } from "@agents-remote/shared";
import { AuthService } from "./auth";
import { createFetchHandler } from "./index";
import { handleSettingsRoutes } from "./settings-routes";
import { SettingsStore } from "./settings-store";

const ALIAS_MAPPING: ClaudeModelMapping = {
  default: "sonnet",
  opus: "opus",
  sonnet: "sonnet",
  haiku: "haiku",
};
const PRESET_BASE_URL = "https://api.anthropic.com";

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

const seedPreset = (
  store: SettingsStore,
  id: string,
  overrides: Partial<{ label: string; apiKey: string; baseUrl: string }> = {},
) =>
  store.update((s) => ({
    ...s,
    runtimes: {
      ...s.runtimes,
      claude: {
        ...s.runtimes.claude,
        presets: [
          ...s.runtimes.claude.presets,
          {
            id,
            label: overrides.label ?? "A",
            apiKey: overrides.apiKey ?? "sk-a",
            baseUrl: overrides.baseUrl ?? PRESET_BASE_URL,
            modelMapping: ALIAS_MAPPING,
          },
        ],
      },
    },
  }));

// ── GET /api/settings ──

test("GET /api/settings returns defaults when empty", async () => {
  const store = await makeStore();
  const res = await handleSettingsRoutes(
    makeRequest("GET", "/api/settings"),
    makeUrl("/api/settings"),
    store,
  );

  expect(res?.status).toBe(200);
  const body = await res!.json();
  expect(body.settings.runtimes.claude.presets).toEqual([]);
  expect(body.settings.runtimes.claude.activePresetId).toBe("");
  expect(body.settings.runtimes.claude.effort).toBe("high");
});

// ── POST /presets (create) ──

test("POST preset then GET returns masked apiKey (raw key never leaves store)", async () => {
  const store = await makeStore();
  const create = await handleSettingsRoutes(
    makeRequest("POST", "/api/settings/runtimes/claude/presets", {
      label: "官方",
      apiKey: "sk-ant-abc123wX4k",
      baseUrl: PRESET_BASE_URL,
      modelMapping: ALIAS_MAPPING,
    }),
    makeUrl("/api/settings/runtimes/claude/presets"),
    store,
  );

  expect(create?.status).toBe(201);
  const created = await create!.json();
  expect(created.preset.apiKeyMasked).toBe("sk-ant-...wX4k");
  expect(created.preset.hasApiKey).toBe(true);
  expect(created.preset).not.toHaveProperty("apiKey");
  expect(created.preset.id).toBeTruthy();
  expect(created.preset.modelMapping).toEqual(ALIAS_MAPPING);

  const get = await handleSettingsRoutes(
    makeRequest("GET", "/api/settings"),
    makeUrl("/api/settings"),
    store,
  );
  const got = await get!.json();
  expect(got.settings.runtimes.claude.presets[0].apiKeyMasked).toBe("sk-ant-...wX4k");
  expect(JSON.stringify(got)).not.toContain("sk-ant-abc123wX4k");
});

test("POST preset rejects empty label / apiKey / baseUrl / modelMapping", async () => {
  const store = await makeStore();
  const noLabel = await handleSettingsRoutes(
    makeRequest("POST", "/api/settings/runtimes/claude/presets", {
      label: "",
      apiKey: "sk-x",
      baseUrl: PRESET_BASE_URL,
      modelMapping: ALIAS_MAPPING,
    }),
    makeUrl("/api/settings/runtimes/claude/presets"),
    store,
  );
  expect(noLabel?.status).toBe(400);

  const noKey = await handleSettingsRoutes(
    makeRequest("POST", "/api/settings/runtimes/claude/presets", {
      label: "A",
      apiKey: "",
      baseUrl: PRESET_BASE_URL,
      modelMapping: ALIAS_MAPPING,
    }),
    makeUrl("/api/settings/runtimes/claude/presets"),
    store,
  );
  expect(noKey?.status).toBe(400);

  const noUrl = await handleSettingsRoutes(
    makeRequest("POST", "/api/settings/runtimes/claude/presets", {
      label: "A",
      apiKey: "sk-x",
      baseUrl: "",
      modelMapping: ALIAS_MAPPING,
    }),
    makeUrl("/api/settings/runtimes/claude/presets"),
    store,
  );
  expect(noUrl?.status).toBe(400);

  const badMapping = await handleSettingsRoutes(
    makeRequest("POST", "/api/settings/runtimes/claude/presets", {
      label: "A",
      apiKey: "sk-x",
      baseUrl: PRESET_BASE_URL,
      modelMapping: { default: "sonnet", opus: "", sonnet: "sonnet", haiku: "haiku" },
    }),
    makeUrl("/api/settings/runtimes/claude/presets"),
    store,
  );
  expect(badMapping?.status).toBe(400);
});

// ── PUT /presets/:id (update) ──

test("PUT preset: empty apiKey keeps current; non-empty overwrites; modelMapping partial", async () => {
  const store = await makeStore();
  await seedPreset(store, "p1", { apiKey: "sk-original-long-key-12345" });

  await handleSettingsRoutes(
    makeRequest("PUT", "/api/settings/runtimes/claude/presets/p1", { label: "A2" }),
    makeUrl("/api/settings/runtimes/claude/presets/p1"),
    store,
  );
  const afterKeep = await store.read();
  expect(afterKeep.runtimes.claude.presets[0].apiKey).toBe("sk-original-long-key-12345");
  expect(afterKeep.runtimes.claude.presets[0].label).toBe("A2");

  await handleSettingsRoutes(
    makeRequest("PUT", "/api/settings/runtimes/claude/presets/p1", {
      apiKey: "sk-new-long-key-67890",
      modelMapping: { opus: "claude-opus-4-8" },
    }),
    makeUrl("/api/settings/runtimes/claude/presets/p1"),
    store,
  );
  const afterOverwrite = await store.read();
  expect(afterOverwrite.runtimes.claude.presets[0].apiKey).toBe("sk-new-long-key-67890");
  expect(afterOverwrite.runtimes.claude.presets[0].modelMapping.opus).toBe("claude-opus-4-8");
  // modelMapping partial：未传 tier 保持原值。
  expect(afterOverwrite.runtimes.claude.presets[0].modelMapping.sonnet).toBe("sonnet");
});

test("PUT preset 404 when id not found", async () => {
  const store = await makeStore();
  const res = await handleSettingsRoutes(
    makeRequest("PUT", "/api/settings/runtimes/claude/presets/missing", { label: "X" }),
    makeUrl("/api/settings/runtimes/claude/presets/missing"),
    store,
  );
  expect(res?.status).toBe(404);
});

// ── DELETE /presets/:id ──

test("DELETE preset clears activePresetId when active", async () => {
  const store = await makeStore();
  await seedPreset(store, "p1");
  await store.update((s) => ({
    ...s,
    runtimes: { ...s.runtimes, claude: { ...s.runtimes.claude, activePresetId: "p1" } },
  }));

  const del = await handleSettingsRoutes(
    makeRequest("DELETE", "/api/settings/runtimes/claude/presets/p1"),
    makeUrl("/api/settings/runtimes/claude/presets/p1"),
    store,
  );
  expect(del?.status).toBe(200);

  const after = await store.read();
  expect(after.runtimes.claude.presets).toHaveLength(0);
  expect(after.runtimes.claude.activePresetId).toBe("");
});

test("DELETE preset 404 when id not found", async () => {
  const store = await makeStore();
  const res = await handleSettingsRoutes(
    makeRequest("DELETE", "/api/settings/runtimes/claude/presets/missing"),
    makeUrl("/api/settings/runtimes/claude/presets/missing"),
    store,
  );
  expect(res?.status).toBe(404);
});

// ── PUT /runtimes/claude ──

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

test("PUT runtimes/claude rejects invalid effort and unknown activePresetId", async () => {
  const store = await makeStore();
  const badEffort = await handleSettingsRoutes(
    makeRequest("PUT", "/api/settings/runtimes/claude", { effort: "ultra" }),
    makeUrl("/api/settings/runtimes/claude"),
    store,
  );
  expect(badEffort?.status).toBe(400);

  const badPreset = await handleSettingsRoutes(
    makeRequest("PUT", "/api/settings/runtimes/claude", { activePresetId: "nope" }),
    makeUrl("/api/settings/runtimes/claude"),
    store,
  );
  expect(badPreset?.status).toBe(400);
});

test("PUT runtimes/claude accepts activePresetId bound to an existing preset", async () => {
  const store = await makeStore();
  await seedPreset(store, "p1");
  const res = await handleSettingsRoutes(
    makeRequest("PUT", "/api/settings/runtimes/claude", { activePresetId: "p1" }),
    makeUrl("/api/settings/runtimes/claude"),
    store,
  );
  expect(res?.status).toBe(200);
  expect((await res!.json()).runtime.activePresetId).toBe("p1");
});

// ── auth gate ──

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

// ── POST /presets/:id/models (发现模型) ──

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

const installFetch = (impl: () => Promise<Response> | Response) => {
  globalThis.fetch = (async () => impl()) as typeof fetch;
};

test("POST /presets/:id/models returns {ok:true, models} using preset credentials", async () => {
  const store = await makeStore();
  await seedPreset(store, "p1", { apiKey: "sk-a" });
  installFetch(
    () =>
      new Response(JSON.stringify({ data: [{ id: "claude-opus-4-8" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  );

  const res = await handleSettingsRoutes(
    makeRequest("POST", "/api/settings/runtimes/claude/presets/p1/models"),
    makeUrl("/api/settings/runtimes/claude/presets/p1/models"),
    store,
  );
  expect(res?.status).toBe(200);
  const body = await res!.json();
  expect(body).toEqual({ ok: true, models: ["claude-opus-4-8"] });
});

test("POST /presets/:id/models surfaces upstream failure as {ok:false} (no API error)", async () => {
  const store = await makeStore();
  await seedPreset(store, "p1", { apiKey: "sk-a" });
  installFetch(() => new Response("unauth", { status: 401 }));

  const res = await handleSettingsRoutes(
    makeRequest("POST", "/api/settings/runtimes/claude/presets/p1/models"),
    makeUrl("/api/settings/runtimes/claude/presets/p1/models"),
    store,
  );
  // 上游 401 不映射成 API 错误码——HTTP 200 + {ok:false, error}，前端展示测试结果。
  expect(res?.status).toBe(200);
  const body = await res!.json();
  expect(body.ok).toBe(false);
  expect(body.models).toEqual([]);
  expect(body.error).toBeTruthy();
});

test("POST /presets/:id/models 404 when preset missing", async () => {
  const store = await makeStore();
  const res = await handleSettingsRoutes(
    makeRequest("POST", "/api/settings/runtimes/claude/presets/missing/models"),
    makeUrl("/api/settings/runtimes/claude/presets/missing/models"),
    store,
  );
  expect(res?.status).toBe(404);
});

// ── POST /presets/test-models (内联凭证测试连接，不落盘) ──

test("POST /presets/test-models 新建态：用内联凭证请求上游，不写 store", async () => {
  const store = await makeStore();
  installFetch(
    () =>
      new Response(JSON.stringify({ data: [{ id: "claude-opus-4-8" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  );

  const res = await handleSettingsRoutes(
    makeRequest("POST", "/api/settings/runtimes/claude/presets/test-models", {
      apiKey: "sk-new",
      baseUrl: PRESET_BASE_URL,
    }),
    makeUrl("/api/settings/runtimes/claude/presets/test-models"),
    store,
  );
  expect(res?.status).toBe(200);
  const body = await res!.json();
  expect(body).toEqual({ ok: true, models: ["claude-opus-4-8"] });
  // 验证未落盘：store 仍无 preset。
  const after = await store.read();
  expect(after.runtimes.claude.presets).toEqual([]);
});

test("POST /presets/test-models 编辑态：apiKey 留空回退已保存原 key", async () => {
  const store = await makeStore();
  await seedPreset(store, "p1", { apiKey: "sk-saved" });
  let receivedHeader = "";
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    receivedHeader = headers.get("x-api-key") ?? "";
    return new Response(JSON.stringify({ data: [{ id: "m1" }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  // apiKey 不传（编辑态留空 = "不改"）+ 传 id → 后端用已保存 sk-saved。
  const res = await handleSettingsRoutes(
    makeRequest("POST", "/api/settings/runtimes/claude/presets/test-models", { id: "p1" }),
    makeUrl("/api/settings/runtimes/claude/presets/test-models"),
    store,
  );
  expect(res?.status).toBe(200);
  expect(await res!.json()).toEqual({ ok: true, models: ["m1"] });
  expect(receivedHeader).toBe("sk-saved");
});

test("POST /presets/test-models 内联 apiKey 覆盖已保存 key", async () => {
  const store = await makeStore();
  await seedPreset(store, "p1", { apiKey: "sk-saved" });
  let receivedHeader = "";
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    receivedHeader = headers.get("x-api-key") ?? "";
    return new Response(JSON.stringify({ data: [{ id: "m1" }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  // 传内联 apiKey=sk-new + id=p1 → 用 sk-new，不用 sk-saved。
  await handleSettingsRoutes(
    makeRequest("POST", "/api/settings/runtimes/claude/presets/test-models", {
      id: "p1",
      apiKey: "sk-new",
    }),
    makeUrl("/api/settings/runtimes/claude/presets/test-models"),
    store,
  );
  expect(receivedHeader).toBe("sk-new");
});

test("POST /presets/test-models 无 key 可用 → {ok:false}（不调用 fetch）", async () => {
  const store = await makeStore();
  let fetchCalled = false;
  installFetch(() => {
    fetchCalled = true;
    return new Response("{}", { status: 200 });
  });

  // 新建态无 apiKey + 无 id → 无 key，listProviderModels 直接返回 ok:false 不发请求。
  const res = await handleSettingsRoutes(
    makeRequest("POST", "/api/settings/runtimes/claude/presets/test-models", {}),
    makeUrl("/api/settings/runtimes/claude/presets/test-models"),
    store,
  );
  expect(res?.status).toBe(200);
  const body = await res!.json();
  expect(body.ok).toBe(false);
  expect(body.models).toEqual([]);
  expect(body.error).toBeTruthy();
  expect(fetchCalled).toBe(false);
});

test("POST /presets/test-models 上游失败 → {ok:false}（不抛）", async () => {
  const store = await makeStore();
  installFetch(() => new Response("unauth", { status: 401 }));

  const res = await handleSettingsRoutes(
    makeRequest("POST", "/api/settings/runtimes/claude/presets/test-models", {
      apiKey: "sk-x",
      baseUrl: PRESET_BASE_URL,
    }),
    makeUrl("/api/settings/runtimes/claude/presets/test-models"),
    store,
  );
  expect(res?.status).toBe(200);
  const body = await res!.json();
  expect(body.ok).toBe(false);
  expect(body.error).toBeTruthy();
});
