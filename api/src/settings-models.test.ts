import { afterEach, expect, test } from "bun:test";
import type { ProviderConfig } from "@agents-remote/shared";
import {
  buildModelsHeaders,
  buildModelsUrl,
  listProviderModels,
  parseModelIds,
} from "./settings-models";

// mock globalThis.fetch：每个 test 安装自己的实现，afterEach 恢复原始 fetch。
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const setFetch = (impl: (url: string) => Promise<Response> | Response, log: string[] = []) => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    log.push(url);
    return impl(url);
  }) as typeof fetch;
  return log;
};

const anthropic: ProviderConfig = {
  id: "p1",
  label: "A",
  apiKey: "sk-ant",
  protocol: "anthropic",
};

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

// ── buildModelsUrl ──

test("buildModelsUrl uses protocol default base when rawBaseUrl absent/empty", () => {
  expect(buildModelsUrl(undefined, "anthropic")).toBe("https://api.anthropic.com/v1/models");
  expect(buildModelsUrl("", "anthropic")).toBe("https://api.anthropic.com/v1/models");
  expect(buildModelsUrl(undefined, "openai-compatible")).toBe("https://api.openai.com/v1/models");
});

test("buildModelsUrl strips trailing slashes", () => {
  expect(buildModelsUrl("https://gw.example.com/", "anthropic")).toBe(
    "https://gw.example.com/v1/models",
  );
  expect(buildModelsUrl("https://gw.example.com///", "anthropic")).toBe(
    "https://gw.example.com/v1/models",
  );
});

test("buildModelsUrl does not double the /v1 segment when baseUrl already ends with /v1", () => {
  expect(buildModelsUrl("https://gw.example.com/v1", "anthropic")).toBe(
    "https://gw.example.com/v1/models",
  );
  expect(buildModelsUrl("https://gw.example.com/v1/", "anthropic")).toBe(
    "https://gw.example.com/v1/models",
  );
});

test("buildModelsUrl appends /v1/models to a bare domain", () => {
  expect(buildModelsUrl("https://gw.example.com", "openai-compatible")).toBe(
    "https://gw.example.com/v1/models",
  );
});

// ── parseModelIds ──

test("parseModelIds extracts id strings from {data:[{id}]}", () => {
  expect(parseModelIds({ data: [{ id: "a" }, { id: "b" }] })).toEqual(["a", "b"]);
});

test("parseModelIds returns empty for missing/non-array data or null input", () => {
  expect(parseModelIds({})).toEqual([]);
  expect(parseModelIds({ data: "x" })).toEqual([]);
  expect(parseModelIds(null)).toEqual([]);
  expect(parseModelIds({ data: [] })).toEqual([]);
});

test("parseModelIds filters items with non-string or missing id", () => {
  expect(parseModelIds({ data: [{ id: 1 }, { name: "x" }, { id: "ok" }] })).toEqual(["ok"]);
});

test("parseModelIds does not dedupe (caller's job)", () => {
  expect(parseModelIds({ data: [{ id: "a" }, { id: "a" }] })).toEqual(["a", "a"]);
});

// ── buildModelsHeaders ──

test("buildModelsHeaders: anthropic → x-api-key + anthropic-version, no bearer", () => {
  const headers = buildModelsHeaders(anthropic);
  expect(headers["x-api-key"]).toBe("sk-ant");
  expect(headers["anthropic-version"]).toBe("2023-06-01");
  expect(headers).not.toHaveProperty("authorization");
});

test("buildModelsHeaders: openai-compatible → Authorization Bearer, no anthropic headers", () => {
  const headers = buildModelsHeaders({ ...anthropic, protocol: "openai-compatible" });
  expect(headers.authorization).toBe("Bearer sk-ant");
  expect(headers).not.toHaveProperty("x-api-key");
  expect(headers).not.toHaveProperty("anthropic-version");
});

test("buildModelsHeaders: missing protocol falls back to anthropic headers", () => {
  const headers = buildModelsHeaders({ id: "p", label: "A", apiKey: "sk-ant" });
  expect(headers["x-api-key"]).toBe("sk-ant");
  expect(headers["anthropic-version"]).toBe("2023-06-01");
});

// ── listProviderModels (fetch mocked) ──

test("listProviderModels: 200 with models → ok:true, deduped + sorted", async () => {
  setFetch(() =>
    jsonRes({
      data: [{ id: "claude-opus-4-8" }, { id: "claude-sonnet-4-6" }, { id: "claude-opus-4-8" }],
    }),
  );
  const result = await listProviderModels(anthropic);
  expect(result).toEqual({ ok: true, models: ["claude-opus-4-8", "claude-sonnet-4-6"] });
});

test("listProviderModels: 200 with empty data → ok:false", async () => {
  setFetch(() => jsonRes({ data: [] }));
  const result = await listProviderModels(anthropic);
  expect(result.ok).toBe(false);
});

test("listProviderModels: 401 → ok:false carrying status", async () => {
  setFetch(() => jsonRes({ error: "unauth" }, 401));
  const result = await listProviderModels(anthropic);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.status).toBe(401);
});

test("listProviderModels: empty apiKey → ok:false without calling fetch", async () => {
  const calls = setFetch(() => jsonRes({ data: [{ id: "x" }] }));
  const result = await listProviderModels({ ...anthropic, apiKey: "" });
  expect(result.ok).toBe(false);
  expect(calls).toHaveLength(0);
});

test("listProviderModels: network failure → ok:false, never throws", async () => {
  setFetch(() => Promise.reject(new TypeError("fetch failed")));
  const result = await listProviderModels(anthropic);
  expect(result.ok).toBe(false);
});

test("listProviderModels: timeout-shaped error → ok:false, never throws", async () => {
  setFetch(() => Promise.reject(new DOMException("timed out", "TimeoutError")));
  const result = await listProviderModels(anthropic);
  expect(result.ok).toBe(false);
});

test("listProviderModels uses bearer header + /v1/models path for openai-compatible", async () => {
  const calls = setFetch(() => jsonRes({ data: [{ id: "gpt-4o" }] }));
  await listProviderModels({
    ...anthropic,
    apiKey: "sk-gw",
    protocol: "openai-compatible",
    baseUrl: "https://gw.example.com/v1",
  });
  expect(calls[0]).toBe("https://gw.example.com/v1/models");
});
