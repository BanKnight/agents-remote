import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ClaudeRuntimeConfig, SettingsState } from "@agents-remote/shared";
import {
  DEFAULT_CLAUDE_RUNTIME,
  SettingsStore,
  buildAvailableModels,
  maskApiKey,
  resolveModelId,
  toMaskedProvider,
} from "./settings-store";

const tempDirs: string[] = [];

const makeTempDir = async () => {
  const dir = await mkdtemp(join(tmpdir(), "agents-remote-settings-store-"));
  tempDirs.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

test("SettingsStore.read returns defaults when file is missing (no throw)", async () => {
  const dir = await makeTempDir();
  const store = new SettingsStore({ path: join(dir, "providers.json") });

  const state = await store.read();

  expect(state.providers).toEqual([]);
  expect(state.runtimes.claude).toEqual(DEFAULT_CLAUDE_RUNTIME);
  expect(state.runtimes.claude.effort).toBe("high");
  expect(state.runtimes.claude.enable1mContext).toBe(false);
});

test("SettingsStore.write then read round-trips and keeps 0o600 file mode + schemaVersion", async () => {
  const dir = await makeTempDir();
  const path = join(dir, "providers.json");
  const store = new SettingsStore({ path });

  const state: SettingsState = {
    providers: [
      { id: "prov_1", label: "官方", apiKey: "sk-ant-abc123wX4k", protocol: "anthropic" },
    ],
    runtimes: {
      claude: {
        providerId: "prov_1",
        modelMapping: {
          default: "claude-sonnet-4-6",
          opus: "claude-opus-4-8",
          sonnet: "claude-sonnet-4-6",
          haiku: "claude-haiku-4-5",
        },
        enable1mContext: true,
        effort: "max",
      },
    },
  };
  await store.write(state);

  const roundTrip = await store.read();
  expect(roundTrip).toEqual(state);

  const fileStat = await stat(path);
  expect(fileStat.mode & 0o077).toBe(0);

  const raw = JSON.parse(await readFile(path, "utf8"));
  expect(raw.schemaVersion).toBe(1);
});

test("SettingsStore.update applies mutator as read-modify-write", async () => {
  const dir = await makeTempDir();
  const store = new SettingsStore({ path: join(dir, "providers.json") });

  const afterCreate = await store.update((s) => ({
    ...s,
    providers: [...s.providers, { id: "p1", label: "A", apiKey: "sk-a" }],
  }));
  expect(afterCreate.providers).toHaveLength(1);

  const afterSecond = await store.update((s) => ({
    ...s,
    providers: [...s.providers, { id: "p2", label: "B", apiKey: "sk-b" }],
  }));
  expect(afterSecond.providers.map((p) => p.id)).toEqual(["p1", "p2"]);
});

test("SettingsStore.read tolerates legacy/partial files (normalizes missing fields)", async () => {
  const dir = await makeTempDir();
  const path = join(dir, "providers.json");
  await writeFile(path, JSON.stringify({ providers: [] }), { mode: 0o600 });

  const state = await new SettingsStore({ path }).read();

  expect(state.providers).toEqual([]);
  expect(state.runtimes.claude.effort).toBe("high");
  expect(state.runtimes.claude.modelMapping.opus).toBe("opus");
});

test("resolveModelId: tier alias passes through; concrete ID gets [1m] only when enabled", () => {
  const aliasConfig: ClaudeRuntimeConfig = {
    providerId: "",
    modelMapping: { default: "sonnet", opus: "opus", sonnet: "sonnet", haiku: "haiku" },
    enable1mContext: true,
    effort: "high",
  };
  expect(resolveModelId(aliasConfig, "opus")).toBe("opus");
  expect(resolveModelId(aliasConfig, "default")).toBe("sonnet");

  const concreteConfig: ClaudeRuntimeConfig = {
    providerId: "",
    modelMapping: {
      default: "claude-sonnet-4-6",
      opus: "claude-opus-4-8",
      sonnet: "claude-sonnet-4-6",
      haiku: "claude-haiku-4-5",
    },
    enable1mContext: true,
    effort: "high",
  };
  expect(resolveModelId(concreteConfig, "opus")).toBe("claude-opus-4-8[1m]");
  expect(resolveModelId(concreteConfig, "sonnet")).toBe("claude-sonnet-4-6[1m]");
  expect(resolveModelId({ ...concreteConfig, enable1mContext: false }, "opus")).toBe(
    "claude-opus-4-8",
  );
});

test("buildAvailableModels: alias mapping lists aliases only (CLI rejects alias[1m])", () => {
  // 默认配置（tier alias 自映射）：即使开 1m 也只列 alias，因为 CLI 不接受 alias[1m]。
  expect(buildAvailableModels(DEFAULT_CLAUDE_RUNTIME)).toEqual(["opus", "sonnet", "haiku"]);
  expect(buildAvailableModels({ ...DEFAULT_CLAUDE_RUNTIME, enable1mContext: true })).toEqual([
    "opus",
    "sonnet",
    "haiku",
  ]);
});

test("buildAvailableModels: concrete IDs + 1m on → [1m] variant first, base after", () => {
  const config: ClaudeRuntimeConfig = {
    providerId: "",
    modelMapping: {
      default: "claude-sonnet-4-6",
      opus: "claude-opus-4-8",
      sonnet: "claude-sonnet-4-6",
      haiku: "claude-haiku-4-5",
    },
    enable1mContext: true,
    effort: "high",
  };
  expect(buildAvailableModels(config)).toEqual([
    "claude-opus-4-8[1m]",
    "claude-opus-4-8",
    "claude-sonnet-4-6[1m]",
    "claude-sonnet-4-6",
    "claude-haiku-4-5[1m]",
    "claude-haiku-4-5",
  ]);
});

test("buildAvailableModels: concrete IDs + 1m off → only base IDs", () => {
  const config: ClaudeRuntimeConfig = {
    providerId: "",
    modelMapping: {
      default: "claude-sonnet-4-6",
      opus: "claude-opus-4-8",
      sonnet: "claude-sonnet-4-6",
      haiku: "claude-haiku-4-5",
    },
    enable1mContext: false,
    effort: "high",
  };
  expect(buildAvailableModels(config)).toEqual([
    "claude-opus-4-8",
    "claude-sonnet-4-6",
    "claude-haiku-4-5",
  ]);
});

test("buildAvailableModels: dedupes tiers mapped to the same ID", () => {
  const config: ClaudeRuntimeConfig = {
    providerId: "",
    modelMapping: {
      default: "claude-x-1",
      opus: "claude-x-1",
      sonnet: "claude-x-1",
      haiku: "claude-x-2",
    },
    enable1mContext: true,
    effort: "high",
  };
  // opus 与 sonnet 都映射 claude-x-1 → 去重，sonnet 不重复入列。
  expect(buildAvailableModels(config)).toEqual([
    "claude-x-1[1m]",
    "claude-x-1",
    "claude-x-2[1m]",
    "claude-x-2",
  ]);
});

test("maskApiKey keeps prefix and tail with ellipsis in between", () => {
  expect(maskApiKey("sk-ant-abc123wX4k")).toBe("sk-ant-...wX4k");
  expect(maskApiKey("short")).toBe("sh...rt");
  expect(maskApiKey("")).toBe("");
});

test("toMaskedProvider strips raw apiKey and exposes masked fingerprint", () => {
  const masked = toMaskedProvider({ id: "p1", label: "A", apiKey: "sk-ant-abc123wX4k" });

  expect(masked).not.toHaveProperty("apiKey");
  expect(masked.apiKeyMasked).toBe("sk-ant-...wX4k");
  expect(masked.hasApiKey).toBe(true);
  expect(masked.id).toBe("p1");
});

test("SettingsStore.read defaults missing protocol to anthropic (backward compat)", async () => {
  const dir = await makeTempDir();
  const path = join(dir, "providers.json");
  // 旧 providers.json：provider 无 protocol 字段。
  await writeFile(path, JSON.stringify({ providers: [{ id: "p1", label: "A", apiKey: "sk-a" }] }), {
    mode: 0o600,
  });

  const state = await new SettingsStore({ path }).read();

  expect(state.providers[0].protocol).toBe("anthropic");
});

test("SettingsStore.read falls back to anthropic for invalid protocol values", async () => {
  const dir = await makeTempDir();
  const path = join(dir, "providers.json");
  await writeFile(
    path,
    JSON.stringify({
      providers: [{ id: "p1", label: "A", apiKey: "sk-a", protocol: "bedrock" }],
    }),
    { mode: 0o600 },
  );

  const state = await new SettingsStore({ path }).read();

  expect(state.providers[0].protocol).toBe("anthropic");
});

test("SettingsStore.read preserves explicit openai-compatible protocol", async () => {
  const dir = await makeTempDir();
  const path = join(dir, "providers.json");
  await writeFile(
    path,
    JSON.stringify({
      providers: [{ id: "p1", label: "GW", apiKey: "sk-gw", protocol: "openai-compatible" }],
    }),
    { mode: 0o600 },
  );

  const state = await new SettingsStore({ path }).read();

  expect(state.providers[0].protocol).toBe("openai-compatible");
});

test("toMaskedProvider forwards protocol alongside masked apiKey", () => {
  const masked = toMaskedProvider({
    id: "p1",
    label: "A",
    apiKey: "sk-ant-abc123wX4k",
    protocol: "openai-compatible",
  });

  expect(masked.protocol).toBe("openai-compatible");
  // 不带 protocol 的 provider：masked 也不带 protocol 字段。
  const bare = toMaskedProvider({ id: "p2", label: "B", apiKey: "sk-x" });
  expect(bare).not.toHaveProperty("protocol");
});
