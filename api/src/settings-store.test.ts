import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ClaudeModelMapping, SettingsState } from "@agents-remote/shared";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import {
  SettingsStore,
  activePresetView,
  buildAvailableAliases,
  buildAvailableModels,
  legacyPiToPresets,
  maskApiKey,
  migrateV1ToV2,
  migrateV4ToV5,
  resolveModelId,
  toMaskedPiPreset,
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
  const store = new SettingsStore({ path: join(dir, "settings.yaml") });

  const state = await store.read();

  expect(state.runtimes.claude.presets).toEqual([]);
  expect(state.runtimes.claude.activePresetId).toBe("");
  expect(state.runtimes.claude.effort).toBe("high");
  expect(state.runtimes.claude.enable1mContext).toBe(false);
});

test("corrupt settings.yaml → throws error without echoing apiKey source (secret containment)", async () => {
  // settings.yaml 含 apiKey（机密）。read() parse 失败时直接 throw 原始 yaml error，上层
  // （claude-runtime `console.warn(..., err)`）会把它打到 stderr——message 含源码 snippet
  // 即泄漏 apiKey。修复后包装成只含行列位置的摘要错误，apiKey 值不进 message。
  const dir = await makeTempDir();
  const path = join(dir, "settings.yaml");
  await writeFile(path, 'apiKey: "AR-LEAK-MARKER-33333"\n  bad indent: x', { mode: 0o600 });
  const store = new SettingsStore({ path });

  let thrown: unknown;
  try {
    await store.read();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(Error);
  const msg = (thrown as Error).message;
  expect(msg).toContain("line"); // 行列位置保留
  expect(msg).not.toContain("AR-LEAK-MARKER-33333"); // 源码值不回显（机密收口）
});

test("SettingsStore.write then read round-trips and keeps 0o600 file mode + schemaVersion 5", async () => {
  const dir = await makeTempDir();
  const path = join(dir, "settings.yaml");
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
      pi: { presets: [], activePresetId: "" },
    },
    skills: { sources: [] },
  };
  await store.write(state);

  const roundTrip = await store.read();
  expect(roundTrip).toEqual(state);

  const fileStat = await stat(path);
  expect(fileStat.mode & 0o077).toBe(0);

  const raw = parseYaml(await readFile(path, "utf8"));
  expect(raw.schemaVersion).toBe(5);
});

test("SettingsStore.update applies mutator as read-modify-write", async () => {
  const dir = await makeTempDir();
  const store = new SettingsStore({ path: join(dir, "settings.yaml") });

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
  const path = join(dir, "settings.yaml");
  await writeFile(path, stringifyYaml({ runtimes: { claude: { presets: [] } } }), { mode: 0o600 });

  const state = await new SettingsStore({ path }).read();

  expect(state.runtimes.claude.presets).toEqual([]);
  expect(state.runtimes.claude.effort).toBe("high");
  expect(state.runtimes.claude.activePresetId).toBe("");
  // pi 缺省 → 未启用默认（presets 空 + activePresetId 空）。
  expect(state.runtimes.pi).toEqual({ presets: [], activePresetId: "" });
});

// ── pi runtime normalize + mask（v5 presets 体系）──────────────────────────────

test("normalizeSettings: pi presets 数组 → 过滤非法 + 规整；activePresetId 忠实保留", async () => {
  const dir = await makeTempDir();
  const path = join(dir, "settings.yaml");

  await writeFile(
    path,
    stringifyYaml({
      runtimes: {
        claude: { presets: [] },
        pi: {
          presets: [
            {
              id: "p1",
              label: "内置",
              provider: "anthropic",
              apiKey: "sk-pi-abc",
              model: "claude-sonnet-5",
            },
            {
              id: "p2",
              label: "Ollama",
              provider: "ollama",
              apiKey: "ollama",
              model: "llama3.1:8b",
              baseUrl: "http://localhost:11434/v1",
              api: "openai-completions",
            },
            { id: "p3", label: "缺 apiKey" }, // 缺字段 → 过滤
            { noId: true }, // 无 id → 过滤
          ],
          activePresetId: "p2",
        },
      },
    }),
    { mode: 0o600 },
  );
  const state = await new SettingsStore({ path }).read();
  expect(state.runtimes.pi).toEqual({
    presets: [
      {
        id: "p1",
        label: "内置",
        provider: "anthropic",
        apiKey: "sk-pi-abc",
        model: "claude-sonnet-5",
      },
      {
        id: "p2",
        label: "Ollama",
        provider: "ollama",
        apiKey: "ollama",
        model: "llama3.1:8b",
        baseUrl: "http://localhost:11434/v1",
        api: "openai-completions",
      },
    ],
    activePresetId: "p2",
  });
});

test("normalizeSettings: api 无 baseUrl → 丢弃（线协议只对自定义端点有效）", async () => {
  const dir = await makeTempDir();
  const path = join(dir, "settings.yaml");
  await writeFile(
    path,
    stringifyYaml({
      runtimes: {
        claude: { presets: [] },
        pi: {
          presets: [
            {
              id: "p1",
              label: "A",
              provider: "anthropic",
              apiKey: "sk-a",
              model: "m1",
              api: "openai-completions", // 无 baseUrl → 丢弃
            },
          ],
          activePresetId: "p1",
        },
      },
    }),
    { mode: 0o600 },
  );
  const state = await new SettingsStore({ path }).read();
  expect(state.runtimes.pi.presets[0]).not.toHaveProperty("api");
  expect(state.runtimes.pi.presets[0]).not.toHaveProperty("baseUrl");
});

test("normalizeSettings: 无 presets 键的 object（v4 单块形状）→ legacyPiToPresets 双保险", async () => {
  const dir = await makeTempDir();
  const path = join(dir, "settings.yaml");
  // 绕过 read() 分流的 v4 单块文件（无 schemaVersion 或 schemaVersion 非 4）。
  await writeFile(
    path,
    stringifyYaml({
      runtimes: {
        claude: { presets: [] },
        pi: { provider: "anthropic", apiKey: "sk-pi-abc", model: "claude-sonnet-5" },
      },
    }),
    { mode: 0o600 },
  );
  const state = await new SettingsStore({ path }).read();
  expect(state.runtimes.pi.presets).toHaveLength(1);
  expect(state.runtimes.pi.presets[0]).toMatchObject({
    provider: "anthropic",
    apiKey: "sk-pi-abc",
    model: "claude-sonnet-5",
  });
  expect(state.runtimes.pi.activePresetId).toBe(state.runtimes.pi.presets[0].id);
});

test("SettingsStore: pi round-trip 落盘 + 0o600 + schemaVersion 5", async () => {
  const dir = await makeTempDir();
  const path = join(dir, "settings.yaml");
  const store = new SettingsStore({ path });

  const state: SettingsState = {
    runtimes: {
      claude: {
        presets: [],
        activePresetId: "",
        enable1mContext: false,
        effort: "high",
      },
      pi: {
        presets: [
          {
            id: "p1",
            label: "内置",
            provider: "anthropic",
            apiKey: "sk-pi-xyz123456",
            model: "claude-sonnet-5",
          },
        ],
        activePresetId: "p1",
      },
    },
    skills: { sources: [] },
  };
  await store.write(state);

  const roundTrip = await store.read();
  expect(roundTrip.runtimes.pi).toEqual(state.runtimes.pi);

  const fileStat = await stat(path);
  expect(fileStat.mode & 0o077).toBe(0);
  const raw = parseYaml(await readFile(path, "utf8"));
  expect(raw.schemaVersion).toBe(5);
  expect(raw.runtimes.pi.presets[0].apiKey).toBe("sk-pi-xyz123456");
});

test("toMaskedPiPreset: apiKey mask + hasApiKey；baseUrl/api 条件展开；不泄露原 key", () => {
  const masked = toMaskedPiPreset({
    id: "p1",
    label: "内置",
    provider: "anthropic",
    apiKey: "sk-pi-abc123456",
    model: "claude-sonnet-5",
  });
  expect(masked.provider).toBe("anthropic");
  expect(masked.model).toBe("claude-sonnet-5");
  expect(masked.hasApiKey).toBe(true);
  expect(masked.apiKeyMasked).not.toContain("abc123456");
  expect(masked.apiKeyMasked).toBe(maskApiKey("sk-pi-abc123456"));
  expect(masked).not.toHaveProperty("apiKey");
  expect(masked).not.toHaveProperty("baseUrl");
  expect(masked).not.toHaveProperty("api");

  const withUrl = toMaskedPiPreset({
    id: "p2",
    label: "Ollama",
    provider: "ollama",
    apiKey: "ollama",
    model: "llama3.1:8b",
    baseUrl: "http://localhost:11434/v1",
    api: "openai-completions",
  });
  expect(withUrl.baseUrl).toBe("http://localhost:11434/v1");
  expect(withUrl.api).toBe("openai-completions");
});

test("migrateV1ToV2: 输出 pi 未启用默认（v1 无 pi 概念）", () => {
  const v2 = migrateV1ToV2({
    schemaVersion: 1,
    providers: [{ id: "prov_a", label: "A", apiKey: "sk-a" }],
    runtimes: { claude: { providerId: "prov_a", modelMapping: CONCRETE_MAPPING } },
  });
  expect(v2.runtimes.pi).toEqual({ presets: [], activePresetId: "" });
});

test("cloneDefaultSettings（read 无文件）: pi 未启用默认", async () => {
  const dir = await makeTempDir();
  const state = await new SettingsStore({ path: join(dir, "settings.yaml") }).read();
  expect(state.runtimes.pi).toEqual({ presets: [], activePresetId: "" });
});

// ── v4 → v5 迁移（最高风险防线：v4 被 v5 覆盖后不可逆，凭证不能丢）──────────

test("legacyPiToPresets: v4 单块三项全非空 → 单 preset + activePresetId 同 id", () => {
  const out = legacyPiToPresets(
    { provider: "anthropic", apiKey: "sk-pi-abc", model: "claude-sonnet-5" },
    () => "fixed-id",
  );
  expect(out).toEqual({
    presets: [
      {
        id: "fixed-id",
        label: "anthropic",
        provider: "anthropic",
        apiKey: "sk-pi-abc",
        model: "claude-sonnet-5",
      },
    ],
    activePresetId: "fixed-id",
  });
});

test("legacyPiToPresets: 部分配置/缺 pi → 空默认（不半启用）", () => {
  expect(legacyPiToPresets({ provider: "anthropic", apiKey: "sk-a" }, () => "x")).toEqual({
    presets: [],
    activePresetId: "",
  });
  expect(legacyPiToPresets(undefined, () => "x")).toEqual({ presets: [], activePresetId: "" });
  expect(legacyPiToPresets("junk", () => "x")).toEqual({ presets: [], activePresetId: "" });
});

test("migrateV4ToV5: v4 单块 → presets 结构，claude/skills 委托 normalize 保留", () => {
  const v5 = migrateV4ToV5(
    {
      schemaVersion: 4,
      runtimes: {
        claude: {
          presets: [{ id: "cp1", label: "A", apiKey: "sk-a", modelMapping: ALIAS_MAPPING }],
          activePresetId: "cp1",
          enable1mContext: false,
          effort: "high",
        },
        pi: { provider: "anthropic", apiKey: "sk-pi-abc", model: "claude-sonnet-5" },
      },
      skills: { sources: [{ id: "s1", type: "github", repo: "o/r" }] },
    },
    () => "fixed-id",
  );
  expect(v5.runtimes.pi).toEqual({
    presets: [
      {
        id: "fixed-id",
        label: "anthropic",
        provider: "anthropic",
        apiKey: "sk-pi-abc",
        model: "claude-sonnet-5",
      },
    ],
    activePresetId: "fixed-id",
  });
  // claude/skills 委托 normalizeSettings 解析，不丢。
  expect(v5.runtimes.claude.presets).toHaveLength(1);
  expect(v5.skills?.sources).toHaveLength(1);
});

test("migrateV4ToV5: 无 pi / 部分 pi → 空默认", () => {
  const noPi = migrateV4ToV5({ schemaVersion: 4, runtimes: { claude: { presets: [] } } });
  expect(noPi.runtimes.pi).toEqual({ presets: [], activePresetId: "" });

  const partial = migrateV4ToV5({
    schemaVersion: 4,
    runtimes: { claude: { presets: [] }, pi: { provider: "anthropic" } },
  });
  expect(partial.runtimes.pi).toEqual({ presets: [], activePresetId: "" });
});

test("SettingsStore.read 迁移 v4 文件（schemaVersion=4）→ 合成 v5 不落盘", async () => {
  const dir = await makeTempDir();
  const path = join(dir, "settings.yaml");
  const v4 = {
    schemaVersion: 4,
    runtimes: {
      claude: { presets: [], activePresetId: "", enable1mContext: false, effort: "high" },
      pi: { provider: "anthropic", apiKey: "sk-pi-abc", model: "claude-sonnet-5" },
    },
  };
  await writeFile(path, stringifyYaml(v4), { mode: 0o600 });

  const state = await new SettingsStore({ path }).read();
  expect(state.runtimes.pi.presets).toHaveLength(1);
  expect(state.runtimes.pi.presets[0].apiKey).toBe("sk-pi-abc");
  expect(state.runtimes.pi.activePresetId).toBe(state.runtimes.pi.presets[0].id);

  // 迁移是纯内存合成，不主动落盘：磁盘仍是 v4。
  const raw = parseYaml(await readFile(path, "utf8"));
  expect(raw.schemaVersion).toBe(4);
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
      pi: { presets: [], activePresetId: "" },
    },
    skills: { sources: [] },
  });
  expect(migrateV1ToV2("junk")).toEqual({
    runtimes: {
      claude: { presets: [], activePresetId: "", enable1mContext: false, effort: "high" },
      pi: { presets: [], activePresetId: "" },
    },
    skills: { sources: [] },
  });
});

test("SettingsStore.read 迁移 v1 文件（schemaVersion=1）→ 合成 v3 不落盘", async () => {
  const dir = await makeTempDir();
  const path = join(dir, "settings.yaml");
  const v1 = {
    schemaVersion: 1,
    providers: [{ id: "prov_a", label: "A", apiKey: "sk-a", protocol: "anthropic" }],
    runtimes: { claude: { providerId: "prov_a", modelMapping: ALIAS_MAPPING, effort: "high" } },
  };
  await writeFile(path, stringifyYaml(v1), { mode: 0o600 });

  const state = await new SettingsStore({ path }).read();

  expect(state.runtimes.claude.presets[0].id).toBe("prov_a");
  expect(state.runtimes.claude.presets[0].apiKey).toBe("sk-a");
  expect(state.runtimes.claude.activePresetId).toBe("prov_a");

  // 迁移是纯内存合成，不主动落盘：磁盘仍是 v1。
  const raw = parseYaml(await readFile(path, "utf8"));
  expect(raw.schemaVersion).toBe(1);
  expect(Array.isArray(raw.providers)).toBe(true);
});

test("SettingsStore.read normalizeSkillSources：legacy 补 github、local/git 保真、无 id 丢弃", async () => {
  const dir = await makeTempDir();
  const path = join(dir, "settings.yaml");
  await writeFile(
    path,
    stringifyYaml({
      // 无 schemaVersion → 走 normalizeSettings（非 v1 迁移）。
      runtimes: { claude: { presets: [], activePresetId: "", effort: "high" } },
      skills: {
        sources: [
          { id: "legacy", repo: "foo/bar" }, // 旧数据无 type → github
          { id: "local-src", type: "local", path: "/abs/path", label: "My" },
          { id: "git-src", type: "git", repo: "org/repo", branch: "dev" },
          { noId: true }, // 无 id → 丢弃
        ],
      },
    }),
  );

  const state = await new SettingsStore({ path }).read();
  expect(state.skills.sources).toEqual([
    { id: "legacy", type: "github", repo: "foo/bar" },
    { id: "local-src", type: "local", path: "/abs/path", label: "My" },
    { id: "git-src", type: "git", repo: "org/repo", branch: "dev" },
  ]);
});

test("SettingsStore 迁移后 write 持久化为 v5（v1 磁盘被覆盖，providers 顶层消失）", async () => {
  const dir = await makeTempDir();
  const path = join(dir, "settings.yaml");
  await writeFile(
    path,
    stringifyYaml({
      schemaVersion: 1,
      providers: [{ id: "p1", label: "A", apiKey: "sk-a" }],
      runtimes: { claude: { providerId: "p1" } },
    }),
    { mode: 0o600 },
  );
  const store = new SettingsStore({ path });

  // update 触发 read（迁移）+ write（v5 落盘）。
  await store.update((s) => s);

  const raw = parseYaml(await readFile(path, "utf8"));
  expect(raw.schemaVersion).toBe(5);
  expect(raw.runtimes.claude.presets[0].id).toBe("p1");
  expect(raw.runtimes.claude.presets[0].apiKey).toBe("sk-a");
  expect(raw.providers).toBeUndefined();
});

// ── 纯函数：resolveModelId / buildAvailableModels / buildAvailableAliases（入参 = ModelMappingView）──

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

test("buildAvailableAliases: concrete IDs + 1m on → 全部 tier 出 [1m] 变体（含 haiku），resolved 裸 vs 带 [1m]", () => {
  const view = { modelMapping: CONCRETE_MAPPING, enable1mContext: true };
  // [1m] 变体在前、基础 alias 紧随（每个 tier 内）；resolved[tier] = 裸 ID（env 注入用），
  // resolved[tier[1m]] = ID[1m]（菜单描述展示）。haiku 也出 [1m]（CLI parseUserSpecifiedModel 通用支持）。
  expect(buildAvailableAliases(view)).toEqual({
    aliases: ["opus[1m]", "opus", "sonnet[1m]", "sonnet", "haiku[1m]", "haiku"],
    resolved: {
      "opus[1m]": "claude-opus-4-8[1m]",
      opus: "claude-opus-4-8",
      "sonnet[1m]": "claude-sonnet-4-6[1m]",
      sonnet: "claude-sonnet-4-6",
      "haiku[1m]": "claude-haiku-4-5[1m]",
      haiku: "claude-haiku-4-5",
    },
  });
});

test("buildAvailableAliases: concrete IDs + 1m off → 全裸（无 [1m]）", () => {
  const view = { modelMapping: CONCRETE_MAPPING, enable1mContext: false };
  expect(buildAvailableAliases(view)).toEqual({
    aliases: ["opus", "sonnet", "haiku"],
    resolved: {
      opus: "claude-opus-4-8",
      sonnet: "claude-sonnet-4-6",
      haiku: "claude-haiku-4-5",
    },
  });
});

test("buildAvailableAliases: alias 映射 + 1m on → [1m] 变体 aliases 键存在但 resolved 值 = alias 本身（非具体 ID 不拼 [1m]）", () => {
  const view = { modelMapping: ALIAS_MAPPING, enable1mContext: true };
  expect(buildAvailableAliases(view)).toEqual({
    aliases: ["opus[1m]", "opus", "sonnet[1m]", "sonnet", "haiku[1m]", "haiku"],
    resolved: {
      "opus[1m]": "opus",
      opus: "opus",
      "sonnet[1m]": "sonnet",
      sonnet: "sonnet",
      "haiku[1m]": "haiku",
      haiku: "haiku",
    },
  });
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
