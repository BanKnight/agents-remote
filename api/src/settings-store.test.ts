import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ClaudeModelMapping, SettingsState } from "@agents-remote/shared";
import {
  SettingsStore,
  activePresetView,
  buildAvailableModels,
  maskApiKey,
  migrateV1ToV2,
  resolveModelId,
  toMaskedPreset,
} from "./settings-store";

const ALIAS_MAPPING: ClaudeModelMapping = {
  default: "sonnet",
  opus: "opus",
  sonnet: "sonnet",
  haiku: "haiku",
};
const CONCRETE_MAPPING: ClaudeModelMapping = {
  default: "claude-sonnet-4-6",
  opus: "claude-opus-4-8",
  sonnet: "claude-sonnet-4-6",
  haiku: "claude-haiku-4-5",
};

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

  expect(state.runtimes.claude.presets).toEqual([]);
  expect(state.runtimes.claude.activePresetId).toBe("");
  expect(state.runtimes.claude.effort).toBe("high");
  expect(state.runtimes.claude.enable1mContext).toBe(false);
});

test("SettingsStore.write then read round-trips and keeps 0o600 file mode + schemaVersion 2", async () => {
  const dir = await makeTempDir();
  const path = join(dir, "providers.json");
  const store = new SettingsStore({ path });

  const state: SettingsState = {
    runtimes: {
      claude: {
        presets: [
          {
            id: "preset_1",
            label: "官方",
            apiKey: "sk-ant-abc123wX4k",
            baseUrl: "https://api.anthropic.com",
            modelMapping: CONCRETE_MAPPING,
          },
        ],
        activePresetId: "preset_1",
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
  expect(raw.schemaVersion).toBe(2);
});

test("SettingsStore.update applies mutator as read-modify-write", async () => {
  const dir = await makeTempDir();
  const store = new SettingsStore({ path: join(dir, "providers.json") });

  const afterCreate = await store.update((s) => ({
    ...s,
    runtimes: {
      ...s.runtimes,
      claude: {
        ...s.runtimes.claude,
        presets: [
          ...s.runtimes.claude.presets,
          { id: "p1", label: "A", apiKey: "sk-a", modelMapping: ALIAS_MAPPING },
        ],
      },
    },
  }));
  expect(afterCreate.runtimes.claude.presets).toHaveLength(1);

  const afterSecond = await store.update((s) => ({
    ...s,
    runtimes: {
      ...s.runtimes,
      claude: {
        ...s.runtimes.claude,
        presets: [
          ...s.runtimes.claude.presets,
          { id: "p2", label: "B", apiKey: "sk-b", modelMapping: ALIAS_MAPPING },
        ],
      },
    },
  }));
  expect(afterSecond.runtimes.claude.presets.map((p) => p.id)).toEqual(["p1", "p2"]);
});

test("SettingsStore.read tolerates v2 partial files (normalizes missing fields)", async () => {
  const dir = await makeTempDir();
  const path = join(dir, "providers.json");
  await writeFile(path, JSON.stringify({ runtimes: { claude: { presets: [] } } }), { mode: 0o600 });

  const state = await new SettingsStore({ path }).read();

  expect(state.runtimes.claude.presets).toEqual([]);
  expect(state.runtimes.claude.effort).toBe("high");
  expect(state.runtimes.claude.activePresetId).toBe("");
});

// ── v1 → v2 迁移（最高风险防线：v1 被 v2 覆盖后不可逆，凭证不能丢）──────────

test("migrateV1ToV2: 每个 provider → preset 继承凭证；activePresetId = 旧 providerId", () => {
  const v1 = {
    schemaVersion: 1,
    providers: [
      {
        id: "prov_a",
        label: "Anthropic",
        apiKey: "sk-ant",
        baseUrl: "https://api.anthropic.com",
        protocol: "anthropic",
      },
      { id: "prov_b", label: "Relay", apiKey: "sk-relay", protocol: "openai-compatible" },
    ],
    runtimes: {
      claude: {
        providerId: "prov_a",
        modelMapping: CONCRETE_MAPPING,
        enable1mContext: true,
        effort: "max",
      },
    },
  };

  const v2 = migrateV1ToV2(v1);

  expect(v2.runtimes.claude.presets).toHaveLength(2);
  // prov_a（anthropic）→ preset 继承全部字段 + 全局 modelMapping。
  expect(v2.runtimes.claude.presets[0]).toEqual({
    id: "prov_a",
    label: "Anthropic",
    apiKey: "sk-ant",
    baseUrl: "https://api.anthropic.com",
    modelMapping: CONCRETE_MAPPING,
  });
  // prov_b（openai-compatible）也合成 preset 保凭证不丢，但丢弃 protocol 字段（claude 预设恒 anthropic）。
  expect(v2.runtimes.claude.presets[1]).toEqual({
    id: "prov_b",
    label: "Relay",
    apiKey: "sk-relay",
    modelMapping: CONCRETE_MAPPING,
  });
  expect(v2.runtimes.claude.presets[1]).not.toHaveProperty("protocol");
  // activePresetId 继承旧 providerId（指向 anthropic prov_a；不会指向 openai-compatible prov_b）。
  expect(v2.runtimes.claude.activePresetId).toBe("prov_a");
  expect(v2.runtimes.claude.enable1mContext).toBe(true);
  expect(v2.runtimes.claude.effort).toBe("max");
});

test("migrateV1ToV2: stale providerId（指向不存在 provider）→ activePresetId 回退空", () => {
  const v2 = migrateV1ToV2({
    schemaVersion: 1,
    providers: [{ id: "prov_a", label: "A", apiKey: "sk-a" }],
    runtimes: { claude: { providerId: "gone", modelMapping: ALIAS_MAPPING } },
  });

  expect(v2.runtimes.claude.presets.map((p) => p.id)).toEqual(["prov_a"]);
  expect(v2.runtimes.claude.activePresetId).toBe("");
});

test("migrateV1ToV2: 空 providers → presets 空，activePresetId 空，effort 兜底 high", () => {
  const v2 = migrateV1ToV2({ schemaVersion: 1, providers: [], runtimes: { claude: {} } });

  expect(v2.runtimes.claude.presets).toEqual([]);
  expect(v2.runtimes.claude.activePresetId).toBe("");
  expect(v2.runtimes.claude.effort).toBe("high");
  expect(v2.runtimes.claude.enable1mContext).toBe(false);
});

test("migrateV1ToV2: 缺 modelMapping → 各 preset 用默认 alias mapping 兜底", () => {
  const v2 = migrateV1ToV2({
    schemaVersion: 1,
    providers: [{ id: "p1", label: "A", apiKey: "sk-a" }],
    runtimes: { claude: { providerId: "p1" } },
  });

  expect(v2.runtimes.claude.presets[0].modelMapping).toEqual(ALIAS_MAPPING);
});

test("migrateV1ToV2: 非法/部分 provider 条目被过滤（id/label/apiKey 任缺即丢）", () => {
  const v2 = migrateV1ToV2({
    schemaVersion: 1,
    providers: [
      { id: "p1", label: "A", apiKey: "sk-a" },
      { id: "p2", label: "B" }, // 缺 apiKey
      "junk",
      null,
    ],
    runtimes: { claude: { providerId: "p1", modelMapping: ALIAS_MAPPING } },
  });

  expect(v2.runtimes.claude.presets.map((p) => p.id)).toEqual(["p1"]);
});

test("migrateV1ToV2: 非 object 输入 → 返回默认结构（不抛错）", () => {
  expect(migrateV1ToV2(null)).toEqual({
    runtimes: {
      claude: { presets: [], activePresetId: "", enable1mContext: false, effort: "high" },
    },
  });
  expect(migrateV1ToV2("junk")).toEqual({
    runtimes: {
      claude: { presets: [], activePresetId: "", enable1mContext: false, effort: "high" },
    },
  });
});

test("SettingsStore.read 迁移 v1 文件（schemaVersion=1）→ 合成 v2 不落盘", async () => {
  const dir = await makeTempDir();
  const path = join(dir, "providers.json");
  const v1 = {
    schemaVersion: 1,
    providers: [{ id: "prov_a", label: "A", apiKey: "sk-a", protocol: "anthropic" }],
    runtimes: { claude: { providerId: "prov_a", modelMapping: ALIAS_MAPPING, effort: "high" } },
  };
  await writeFile(path, JSON.stringify(v1), { mode: 0o600 });

  const state = await new SettingsStore({ path }).read();

  expect(state.runtimes.claude.presets[0].id).toBe("prov_a");
  expect(state.runtimes.claude.presets[0].apiKey).toBe("sk-a");
  expect(state.runtimes.claude.activePresetId).toBe("prov_a");

  // 迁移是纯内存合成，不主动落盘：磁盘仍是 v1。
  const raw = JSON.parse(await readFile(path, "utf8"));
  expect(raw.schemaVersion).toBe(1);
  expect(Array.isArray(raw.providers)).toBe(true);
});

test("SettingsStore 迁移后 write 持久化为 v2（v1 磁盘被覆盖，providers 顶层消失）", async () => {
  const dir = await makeTempDir();
  const path = join(dir, "providers.json");
  await writeFile(
    path,
    JSON.stringify({
      schemaVersion: 1,
      providers: [{ id: "p1", label: "A", apiKey: "sk-a" }],
      runtimes: { claude: { providerId: "p1" } },
    }),
    { mode: 0o600 },
  );
  const store = new SettingsStore({ path });

  // update 触发 read（迁移）+ write（v2 落盘）。
  await store.update((s) => s);

  const raw = JSON.parse(await readFile(path, "utf8"));
  expect(raw.schemaVersion).toBe(2);
  expect(raw.runtimes.claude.presets[0].id).toBe("p1");
  expect(raw.runtimes.claude.presets[0].apiKey).toBe("sk-a");
  expect(raw.providers).toBeUndefined();
});

// ── 纯函数：resolveModelId / buildAvailableModels（入参 = ModelMappingView）──────────

test("resolveModelId: tier alias passes through; concrete ID gets [1m] only when enabled", () => {
  const aliasView = { modelMapping: ALIAS_MAPPING, enable1mContext: true };
  expect(resolveModelId(aliasView, "opus")).toBe("opus");
  expect(resolveModelId(aliasView, "default")).toBe("sonnet");

  const concreteView = { modelMapping: CONCRETE_MAPPING, enable1mContext: true };
  expect(resolveModelId(concreteView, "opus")).toBe("claude-opus-4-8[1m]");
  expect(resolveModelId(concreteView, "sonnet")).toBe("claude-sonnet-4-6[1m]");
  expect(resolveModelId({ ...concreteView, enable1mContext: false }, "opus")).toBe(
    "claude-opus-4-8",
  );
});

test("buildAvailableModels: alias mapping lists aliases only (CLI rejects alias[1m])", () => {
  const aliasView = { modelMapping: ALIAS_MAPPING, enable1mContext: false };
  expect(buildAvailableModels(aliasView)).toEqual(["opus", "sonnet", "haiku"]);
  expect(buildAvailableModels({ ...aliasView, enable1mContext: true })).toEqual([
    "opus",
    "sonnet",
    "haiku",
  ]);
});

test("buildAvailableModels: concrete IDs + 1m on → [1m] variant first, base after", () => {
  const view = { modelMapping: CONCRETE_MAPPING, enable1mContext: true };
  expect(buildAvailableModels(view)).toEqual([
    "claude-opus-4-8[1m]",
    "claude-opus-4-8",
    "claude-sonnet-4-6[1m]",
    "claude-sonnet-4-6",
    "claude-haiku-4-5[1m]",
    "claude-haiku-4-5",
  ]);
});

test("buildAvailableModels: concrete IDs + 1m off → only base IDs", () => {
  const view = { modelMapping: CONCRETE_MAPPING, enable1mContext: false };
  expect(buildAvailableModels(view)).toEqual([
    "claude-opus-4-8",
    "claude-sonnet-4-6",
    "claude-haiku-4-5",
  ]);
});

test("buildAvailableModels: dedupes tiers mapped to the same ID", () => {
  const view = {
    modelMapping: {
      default: "claude-x-1",
      opus: "claude-x-1",
      sonnet: "claude-x-1",
      haiku: "claude-x-2",
    },
    enable1mContext: true,
  };
  // opus 与 sonnet 都映射 claude-x-1 → 去重，sonnet 不重复入列。
  expect(buildAvailableModels(view)).toEqual([
    "claude-x-1[1m]",
    "claude-x-1",
    "claude-x-2[1m]",
    "claude-x-2",
  ]);
});

test("activePresetView: 激活预设命中 → view；未激活/未命中/空 → undefined", () => {
  const presets = [{ id: "p1", label: "A", apiKey: "k", modelMapping: CONCRETE_MAPPING }];
  expect(activePresetView({ activePresetId: "p1", enable1mContext: true }, presets)).toEqual({
    modelMapping: CONCRETE_MAPPING,
    enable1mContext: true,
  });
  expect(activePresetView({ activePresetId: "", enable1mContext: true }, presets)).toBeUndefined();
  expect(
    activePresetView({ activePresetId: "gone", enable1mContext: true }, presets),
  ).toBeUndefined();
  expect(activePresetView(undefined, presets)).toBeUndefined();
  expect(
    activePresetView({ activePresetId: "p1", enable1mContext: true }, undefined),
  ).toBeUndefined();
});

// ── mask / masked preset ──────────────────────────────────────────────

test("maskApiKey keeps prefix and tail with ellipsis in between", () => {
  expect(maskApiKey("sk-ant-abc123wX4k")).toBe("sk-ant-...wX4k");
  expect(maskApiKey("short")).toBe("sh...rt");
  expect(maskApiKey("")).toBe("");
});

test("toMaskedPreset strips raw apiKey, exposes masked fingerprint + modelMapping + baseUrl", () => {
  const masked = toMaskedPreset({
    id: "p1",
    label: "A",
    apiKey: "sk-ant-abc123wX4k",
    modelMapping: ALIAS_MAPPING,
  });

  expect(masked).not.toHaveProperty("apiKey");
  expect(masked.apiKeyMasked).toBe("sk-ant-...wX4k");
  expect(masked.hasApiKey).toBe(true);
  expect(masked.modelMapping).toEqual(ALIAS_MAPPING);
  expect(masked.id).toBe("p1");
  expect(masked).not.toHaveProperty("baseUrl");

  const withUrl = toMaskedPreset({
    id: "p2",
    label: "B",
    apiKey: "sk-x",
    baseUrl: "https://relay.example",
    modelMapping: ALIAS_MAPPING,
  });
  expect(withUrl.baseUrl).toBe("https://relay.example");
});
