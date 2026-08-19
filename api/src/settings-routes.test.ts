import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ClaudeModelMapping, PiProviderInfo } from "@agents-remote/shared";
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
  return new SettingsStore({ path: join(dir, "settings.yaml") });
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

const seedPiPreset = (
  store: SettingsStore,
  id: string,
  overrides: Partial<{
    label: string;
    provider: string;
    apiKey: string;
    model: string;
    baseUrl: string;
    api: string;
  }> = {},
) =>
  store.update((s) => ({
    ...s,
    runtimes: {
      ...s.runtimes,
      pi: {
        ...s.runtimes.pi,
        presets: [
          ...s.runtimes.pi.presets,
          {
            id,
            label: overrides.label ?? "Pi",
            provider: overrides.provider ?? "anthropic",
            apiKey: overrides.apiKey ?? "sk-pi-a",
            model: overrides.model ?? "claude-sonnet-5",
            ...(overrides.baseUrl ? { baseUrl: overrides.baseUrl } : {}),
            ...(overrides.api ? { api: overrides.api } : {}),
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
  // v5：pi 键恒存在；presets 空 + activePresetId 空 = 未启用。
  expect(body.settings.runtimes.pi).toEqual({ presets: [], activePresetId: "" });
});

// ── GET /api/settings/runtimes/pi/providers（内置 provider 枚举）──

test("GET pi providers：注入枚举 → 200 返回 provider 列表", async () => {
  const store = await makeStore();
  const res = await handleSettingsRoutes(
    makeRequest("GET", "/api/settings/runtimes/pi/providers"),
    makeUrl("/api/settings/runtimes/pi/providers"),
    store,
    {
      listPiProviders: async (): Promise<PiProviderInfo[]> => [
        { id: "anthropic", name: "Anthropic" },
        { id: "openai", name: "OpenAI" },
      ],
    },
  );

  expect(res?.status).toBe(200);
  expect(await res!.json()).toEqual({
    providers: [
      { id: "anthropic", name: "Anthropic" },
      { id: "openai", name: "OpenAI" },
    ],
  });
});

test("GET pi providers：枚举失败 → 200 降级空数组（前端手填兜底，不 500 阻塞设置弹窗）", async () => {
  const store = await makeStore();
  const res = await handleSettingsRoutes(
    makeRequest("GET", "/api/settings/runtimes/pi/providers"),
    makeUrl("/api/settings/runtimes/pi/providers"),
    store,
    {
      listPiProviders: async (): Promise<PiProviderInfo[]> => {
        throw new Error("SDK enumerate failed");
      },
    },
  );

  expect(res?.status).toBe(200);
  expect(await res!.json()).toEqual({ providers: [] });
});

// ── pi runtime（v5 presets 体系）──

test("POST /api/settings/runtimes/pi/presets 创建 → 201 masked；GET 回读 masked、原 key 不出进程", async () => {
  const store = await makeStore();
  const create = await handleSettingsRoutes(
    makeRequest("POST", "/api/settings/runtimes/pi/presets", {
      label: "内置",
      provider: "anthropic",
      apiKey: "sk-pi-abc123456",
      model: "claude-sonnet-5",
    }),
    makeUrl("/api/settings/runtimes/pi/presets"),
    store,
  );
  expect(create?.status).toBe(201);
  const created = await create!.json();
  expect(created.preset.provider).toBe("anthropic");
  expect(created.preset.model).toBe("claude-sonnet-5");
  expect(created.preset.hasApiKey).toBe(true);
  expect(created.preset.apiKeyMasked).not.toContain("abc123456");
  expect(created.preset).not.toHaveProperty("apiKey");
  expect(created.preset.id).toBeTruthy();

  // GET 回读：masked，不带原 key。
  const get = await handleSettingsRoutes(
    makeRequest("GET", "/api/settings"),
    makeUrl("/api/settings"),
    store,
  );
  const getBody = await get!.json();
  expect(getBody.settings.runtimes.pi.presets[0].apiKeyMasked).toBe(created.preset.apiKeyMasked);
  expect(JSON.stringify(getBody)).not.toContain("sk-pi-abc123456");

  // 重启（新 store 同 path）回读：配置持久。
  const store2 = new SettingsStore({ path: store.getPath() });
  const get2 = await handleSettingsRoutes(
    makeRequest("GET", "/api/settings"),
    makeUrl("/api/settings"),
    store2,
  );
  const get2Body = await get2!.json();
  expect(get2Body.settings.runtimes.pi.presets[0].provider).toBe("anthropic");
  expect(get2Body.settings.runtimes.pi.presets[0].model).toBe("claude-sonnet-5");
});

test("POST pi preset 支持自定义 baseUrl + api；api 无 baseUrl → 400", async () => {
  const store = await makeStore();
  const withUrl = await handleSettingsRoutes(
    makeRequest("POST", "/api/settings/runtimes/pi/presets", {
      label: "Ollama",
      provider: "ollama",
      apiKey: "ollama",
      model: "llama3.1:8b",
      baseUrl: "http://localhost:11434/v1",
      api: "openai-completions",
    }),
    makeUrl("/api/settings/runtimes/pi/presets"),
    store,
  );
  expect(withUrl?.status).toBe(201);
  const created = await withUrl!.json();
  expect(created.preset.baseUrl).toBe("http://localhost:11434/v1");
  expect(created.preset.api).toBe("openai-completions");

  // api 给了但 baseUrl 空 → 400（api 只对自定义端点有意义）。
  const apiNoUrl = await handleSettingsRoutes(
    makeRequest("POST", "/api/settings/runtimes/pi/presets", {
      label: "Bad",
      provider: "anthropic",
      apiKey: "sk-x",
      model: "m1",
      api: "openai-completions",
    }),
    makeUrl("/api/settings/runtimes/pi/presets"),
    store,
  );
  expect(apiNoUrl?.status).toBe(400);
});

test("POST pi preset 缺 label/provider/model → 400；缺 apiKey → 201（可选，走凭证链）", async () => {
  const store = await makeStore();
  const cases: Record<string, unknown>[] = [
    { provider: "anthropic", apiKey: "sk-x", model: "m1" }, // 缺 label
    { label: "A", apiKey: "sk-x", model: "m1" }, // 缺 provider
    { label: "A", provider: "anthropic", apiKey: "sk-x" }, // 缺 model
  ];
  for (const body of cases) {
    const res = await handleSettingsRoutes(
      makeRequest("POST", "/api/settings/runtimes/pi/presets", body),
      makeUrl("/api/settings/runtimes/pi/presets"),
      store,
    );
    expect(res?.status).toBe(400);
  }

  // 缺 apiKey（OAuth 订阅 / keyless 本地端点）→ 201，preset 无 apiKey 字段。
  const res = await handleSettingsRoutes(
    makeRequest("POST", "/api/settings/runtimes/pi/presets", {
      label: "OAuth 订阅",
      provider: "openai-codex",
      model: "gpt-5",
    }),
    makeUrl("/api/settings/runtimes/pi/presets"),
    store,
  );
  expect(res?.status).toBe(201);
  const created = (await res?.json()) as { preset: { hasApiKey: boolean; apiKeyMasked: string } };
  expect(created.preset.hasApiKey).toBe(false);
  expect(created.preset.apiKeyMasked).toBe("");
});

test("PUT pi preset: apiKey 留空保留原值；baseUrl 显式空串删除（联动删 api）", async () => {
  const store = await makeStore();
  await seedPiPreset(store, "p1", {
    apiKey: "sk-pi-keepme-123456",
    baseUrl: "http://localhost:11434/v1",
    api: "openai-completions",
  });

  // 只改 model，apiKey 留空 → 保留原 key。
  const res = await handleSettingsRoutes(
    makeRequest("PUT", "/api/settings/runtimes/pi/presets/p1", { model: "qwen2.5-coder:7b" }),
    makeUrl("/api/settings/runtimes/pi/presets/p1"),
    store,
  );
  expect(res?.status).toBe(200);
  const body = await res!.json();
  expect(body.preset.model).toBe("qwen2.5-coder:7b");
  expect(body.preset.apiKeyMasked).not.toContain("keepme");
  const afterKeep = await store.read();
  expect(afterKeep.runtimes.pi.presets[0].apiKey).toBe("sk-pi-keepme-123456");

  // baseUrl 显式空串 → 删除 baseUrl + 联动删 api。
  const delUrl = await handleSettingsRoutes(
    makeRequest("PUT", "/api/settings/runtimes/pi/presets/p1", { baseUrl: "" }),
    makeUrl("/api/settings/runtimes/pi/presets/p1"),
    store,
  );
  expect(delUrl?.status).toBe(200);
  const afterDel = await store.read();
  expect(afterDel.runtimes.pi.presets[0]).not.toHaveProperty("baseUrl");
  expect(afterDel.runtimes.pi.presets[0]).not.toHaveProperty("api");
});

test("PUT pi preset 404 when id not found", async () => {
  const store = await makeStore();
  const res = await handleSettingsRoutes(
    makeRequest("PUT", "/api/settings/runtimes/pi/presets/missing", { model: "m1" }),
    makeUrl("/api/settings/runtimes/pi/presets/missing"),
    store,
  );
  expect(res?.status).toBe(404);
});

test("DELETE pi preset 删除激活 preset → 级联清空 activePresetId（pi 停用）", async () => {
  const store = await makeStore();
  await seedPiPreset(store, "p1");
  await store.update((s) => ({
    ...s,
    runtimes: { ...s.runtimes, pi: { ...s.runtimes.pi, activePresetId: "p1" } },
  }));

  const del = await handleSettingsRoutes(
    makeRequest("DELETE", "/api/settings/runtimes/pi/presets/p1"),
    makeUrl("/api/settings/runtimes/pi/presets/p1"),
    store,
  );
  expect(del?.status).toBe(200);
  expect((await del!.json()).deleted).toBe(true);

  const after = await store.read();
  expect(after.runtimes.pi.presets).toHaveLength(0);
  expect(after.runtimes.pi.activePresetId).toBe("");
});

test("DELETE pi preset 404 when id not found", async () => {
  const store = await makeStore();
  const res = await handleSettingsRoutes(
    makeRequest("DELETE", "/api/settings/runtimes/pi/presets/missing"),
    makeUrl("/api/settings/runtimes/pi/presets/missing"),
    store,
  );
  expect(res?.status).toBe(404);
});

test("PUT /api/settings/runtimes/pi = activate：合法 id 激活；空串停用；未知 id 400", async () => {
  const store = await makeStore();
  await seedPiPreset(store, "p1");

  const activate = await handleSettingsRoutes(
    makeRequest("PUT", "/api/settings/runtimes/pi", { activePresetId: "p1" }),
    makeUrl("/api/settings/runtimes/pi"),
    store,
  );
  expect(activate?.status).toBe(200);
  expect((await activate!.json()).runtime.activePresetId).toBe("p1");

  const unknown = await handleSettingsRoutes(
    makeRequest("PUT", "/api/settings/runtimes/pi", { activePresetId: "nope" }),
    makeUrl("/api/settings/runtimes/pi"),
    store,
  );
  expect(unknown?.status).toBe(400);

  const deactivate = await handleSettingsRoutes(
    makeRequest("PUT", "/api/settings/runtimes/pi", { activePresetId: "" }),
    makeUrl("/api/settings/runtimes/pi"),
    store,
  );
  expect(deactivate?.status).toBe(200);
  expect((await deactivate!.json()).runtime.activePresetId).toBe("");
});

test("PUT runtimes/claude 保留 pi presets + skills（applyClaudeRuntimePatch 展开合并回归）", async () => {
  const store = await makeStore();
  // 先 seed claude preset + pi preset + skill source。
  await seedPreset(store, "cp1", { label: "A", apiKey: "sk-a" });
  await seedPiPreset(store, "pp1", { apiKey: "sk-pi-a" });
  await store.update((s) => ({
    ...s,
    skills: { sources: [{ id: "src1", type: "github", repo: "o/r" }] },
  }));

  // PUT claude 旋钮（effort）——旧 bug 会清空 pi presets + skills。
  const res = await handleSettingsRoutes(
    makeRequest("PUT", "/api/settings/runtimes/claude", { effort: "max" }),
    makeUrl("/api/settings/runtimes/claude"),
    store,
  );
  expect(res?.status).toBe(200);

  const after = await store.read();
  expect(after.runtimes.claude.presets).toHaveLength(1);
  expect(after.runtimes.pi.presets).toHaveLength(1);
  expect(after.runtimes.pi.activePresetId).toBe("");
  expect(after.skills?.sources).toHaveLength(1);
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
