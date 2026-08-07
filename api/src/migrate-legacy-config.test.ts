import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { stringify as stringifyYaml } from "yaml";
import { migrateLegacyUserFiles, splitLegacySettings } from "./migrate-legacy-config";
import { SettingsStore } from "./settings-store";
import { StateStore } from "./state-store";

const tempDirs: string[] = [];

const makeTempDir = async () => {
  const dir = await mkdtemp(join(tmpdir(), "agents-remote-migrate-legacy-"));
  tempDirs.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

// ── splitLegacySettings 纯函数（最高风险防线：v1 被 v2 覆盖后不可逆）──

test("splitLegacySettings: v2（含 ui）→ settings 去 ui + overview 提取 pinnedSessions（去重）", () => {
  const { settings, overview } = splitLegacySettings({
    schemaVersion: 2,
    runtimes: { claude: { presets: [], activePresetId: "", effort: "low" } },
    skills: { sources: [] },
    ui: { pinnedSessions: ["a", "b", "a", ""] },
  });

  expect(settings.runtimes.claude.effort).toBe("low");
  expect(settings).not.toHaveProperty("ui");
  expect(overview.pinnedSessions).toEqual(["a", "b"]);
});

test("splitLegacySettings: v1 → settings 经 migrateV1ToV2（凭证不丢），overview 空（v1 无 ui）", () => {
  const { settings, overview } = splitLegacySettings({
    schemaVersion: 1,
    providers: [{ id: "anthropic", label: "Anthropic", apiKey: "sk-1" }],
    runtimes: { claude: { providerId: "anthropic", modelMapping: { default: "sonnet" } } },
  });

  expect(settings.runtimes.claude.presets).toHaveLength(1);
  expect(settings.runtimes.claude.presets[0].id).toBe("anthropic");
  expect(settings.runtimes.claude.presets[0].apiKey).toBe("sk-1");
  expect(settings).not.toHaveProperty("ui");
  expect(overview.pinnedSessions).toEqual([]);
});

test("splitLegacySettings: 缺省/非法 → 默认 settings + 空 overview（不抛错）", () => {
  const { settings, overview } = splitLegacySettings(null);
  expect(settings.runtimes.claude.presets).toEqual([]);
  expect(overview.pinnedSessions).toEqual([]);
});

// ── migrateLegacyUserFiles（providers.json → settings.yaml + state.yaml 一次性迁移）──

test("migrates providers.json(v2 with ui) to settings.yaml + state.yaml + .bak", async () => {
  const dir = await makeTempDir();
  const providersPath = join(dir, "providers.json");
  await writeFile(
    providersPath,
    stringifyYaml({
      schemaVersion: 2,
      runtimes: { claude: { presets: [], activePresetId: "", effort: "low" } },
      skills: { sources: [] },
      ui: { pinnedSessions: ["ar-claude-1"] },
    }),
    { mode: 0o600 },
  );

  await migrateLegacyUserFiles(dir);

  const migrated = await new SettingsStore({ path: join(dir, "settings.yaml") }).read();
  expect(migrated.runtimes.claude.effort).toBe("low");
  expect(migrated).not.toHaveProperty("ui");

  const overview = await new StateStore({ path: join(dir, "state.yaml") }).readModule("overview");
  expect(overview.pinnedSessions).toEqual(["ar-claude-1"]);

  await expect(readFile(providersPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  expect(await readFile(`${providersPath}.bak`, "utf8")).toContain("schemaVersion: 2");
});

test("migrates v1 providers.json via migrateV1ToV2（pin 空，state.yaml 有 overview 模块）", async () => {
  const dir = await makeTempDir();
  const providersPath = join(dir, "providers.json");
  await writeFile(
    providersPath,
    stringifyYaml({
      schemaVersion: 1,
      providers: [{ id: "anthropic", label: "Anthropic", apiKey: "sk-1" }],
      runtimes: { claude: { providerId: "anthropic", modelMapping: { default: "sonnet" } } },
    }),
    { mode: 0o600 },
  );

  await migrateLegacyUserFiles(dir);

  const migrated = await new SettingsStore({ path: join(dir, "settings.yaml") }).read();
  expect(migrated.runtimes.claude.presets).toHaveLength(1);
  expect(migrated.runtimes.claude.presets[0].id).toBe("anthropic");
  expect(migrated.runtimes.claude.activePresetId).toBe("anthropic");

  const overview = await new StateStore({ path: join(dir, "state.yaml") }).readModule("overview");
  expect(overview.pinnedSessions).toEqual([]);
});

test("idempotent: settings.yaml exists → providers.json untouched", async () => {
  const dir = await makeTempDir();
  const settingsPath = join(dir, "settings.yaml");
  const providersPath = join(dir, "providers.json");
  await writeFile(settingsPath, stringifyYaml({ schemaVersion: 3 }), { mode: 0o600 });
  await writeFile(providersPath, stringifyYaml({ schemaVersion: 2, runtimes: {} }), {
    mode: 0o600,
  });

  await migrateLegacyUserFiles(dir);

  expect(await readFile(providersPath, "utf8")).toContain("runtimes");
});

test("no-op when both files missing (settings.yaml + state.yaml not created)", async () => {
  const dir = await makeTempDir();

  await migrateLegacyUserFiles(dir);

  await expect(readFile(join(dir, "settings.yaml"), "utf8")).rejects.toMatchObject({
    code: "ENOENT",
  });
  await expect(readFile(join(dir, "state.yaml"), "utf8")).rejects.toMatchObject({
    code: "ENOENT",
  });
});
