import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
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

// ── settings.yaml v2-with-ui 中间态（C3 产物，ui 还在 SettingsState 顶层）→ state.yaml + settings@v4 ──

test("migrates settings.yaml v2-with-ui: ui → state.yaml overview, settings rewritten v4", async () => {
  const dir = await makeTempDir();
  const settingsPath = join(dir, "settings.yaml");
  await writeFile(
    settingsPath,
    stringifyYaml({
      schemaVersion: 2,
      runtimes: { claude: { presets: [], activePresetId: "", effort: "low" } },
      skills: { sources: [] },
      ui: { pinnedSessions: ["ar-claude-1", "ar-claude-2"] },
    }),
    { mode: 0o600 },
  );

  await migrateLegacyUserFiles(dir);

  // ui → state.yaml overview
  const overview = await new StateStore({ path: join(dir, "state.yaml") }).readModule("overview");
  expect(overview.pinnedSessions).toEqual(["ar-claude-1", "ar-claude-2"]);

  // settings 重写 v4（磁盘无 ui，presets/effort 保留）
  const onDisk = parseYaml(await readFile(settingsPath, "utf8")) as Record<string, unknown>;
  expect(onDisk.schemaVersion).toBe(4);
  expect(onDisk).not.toHaveProperty("ui");
  expect((onDisk.runtimes as { claude: { effort: string } }).claude.effort).toBe("low");
});

test("migrates settings.yaml v2-with-ui: unions with existing state.yaml pins (dedup)", async () => {
  const dir = await makeTempDir();
  await writeFile(
    join(dir, "state.yaml"),
    stringifyYaml({ schemaVersion: 1, overview: { pinnedSessions: ["existing-pin"] } }),
    { mode: 0o600 },
  );
  await writeFile(
    join(dir, "settings.yaml"),
    stringifyYaml({
      schemaVersion: 2,
      runtimes: { claude: { presets: [], activePresetId: "", effort: "high" } },
      skills: { sources: [] },
      ui: { pinnedSessions: ["ar-claude-1", "existing-pin"] },
    }),
    { mode: 0o600 },
  );

  await migrateLegacyUserFiles(dir);

  const overview = await new StateStore({ path: join(dir, "state.yaml") }).readModule("overview");
  expect(overview.pinnedSessions).toEqual(["existing-pin", "ar-claude-1"]);
});

test("migrates settings.yaml v3 (no ui): untouched, state.yaml not created", async () => {
  const dir = await makeTempDir();
  const settingsPath = join(dir, "settings.yaml");
  await writeFile(
    settingsPath,
    stringifyYaml({
      schemaVersion: 3,
      runtimes: { claude: { presets: [], activePresetId: "", effort: "high" } },
      skills: { sources: [] },
    }),
    { mode: 0o600 },
  );

  await migrateLegacyUserFiles(dir);

  expect(await readFile(settingsPath, "utf8")).toContain("schemaVersion: 3");
  await expect(readFile(join(dir, "state.yaml"), "utf8")).rejects.toMatchObject({
    code: "ENOENT",
  });
});

test("corrupt settings.yaml → no crash, file untouched, no state.yaml", async () => {
  const dir = await makeTempDir();
  const settingsPath = join(dir, "settings.yaml");
  await writeFile(settingsPath, "{ this is not valid yaml [", { mode: 0o600 });

  await migrateLegacyUserFiles(dir);

  expect(await readFile(settingsPath, "utf8")).toContain("not valid yaml");
  await expect(readFile(join(dir, "state.yaml"), "utf8")).rejects.toMatchObject({
    code: "ENOENT",
  });
});

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

test("corrupt providers.json → no crash, moved to .corrupt, no files written", async () => {
  const dir = await makeTempDir();
  const providersPath = join(dir, "providers.json");
  await writeFile(providersPath, "{ this is not valid yaml [", { mode: 0o600 });

  // 不抛错（迁移在启动路径上，抛错即 API 崩溃——损坏用户文件不该杀掉整个 API）。
  await migrateLegacyUserFiles(dir);

  await expect(readFile(providersPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  expect(await readFile(`${providersPath}.corrupt`, "utf8")).toContain("not valid yaml");
  await expect(readFile(join(dir, "settings.yaml"), "utf8")).rejects.toMatchObject({
    code: "ENOENT",
  });
  await expect(readFile(join(dir, "state.yaml"), "utf8")).rejects.toMatchObject({
    code: "ENOENT",
  });
});

test("corrupt providers.json + rename to .corrupt fails → no crash, original left in place", async () => {
  // .corrupt 改名失败（并发进程已改名 / 目标被占位成目录 / 目录只读）不应崩 API——
  // rename 只是尽力保留现场，失败时原损坏文件留原地，下次启动仍会被读（parse 仍
  // 失败 → 再跳过）。用「.corrupt 已是目录」让 rename 抛 EISDIR 模拟 rename 失败。
  const dir = await makeTempDir();
  const providersPath = join(dir, "providers.json");
  await writeFile(providersPath, "{ this is not valid yaml [", { mode: 0o600 });
  await mkdir(join(dir, "providers.json.corrupt")); // 占位成目录 → rename 抛 EISDIR

  // 修复前：rename 抛 EISDIR 穿到 startApi 崩 API；修复后：catch 仅日志，不抛。
  await migrateLegacyUserFiles(dir);

  // 原损坏文件留原地（rename 失败没移走），settings/state 仍不创建。
  expect(await readFile(providersPath, "utf8")).toContain("not valid yaml");
  await expect(readFile(join(dir, "settings.yaml"), "utf8")).rejects.toMatchObject({
    code: "ENOENT",
  });
  await expect(readFile(join(dir, "state.yaml"), "utf8")).rejects.toMatchObject({
    code: "ENOENT",
  });
});

test("corrupt providers.json with secret → console.error logs line/column without echoing source value", async () => {
  // providers.json（legacy）含 apiKey（机密）。parse 失败时 migrate 的 console.error 打印
  // 错误 message——修复前 message 含源码 snippet（含 apiKey 值）打到 stderr 即泄漏。
  // 修复后 summarizeYamlError 只留首行（reason + 行列），apiKey 值不进日志。
  const dir = await makeTempDir();
  const providersPath = join(dir, "providers.json");
  await writeFile(providersPath, 'apiKey: "AR-LEAK-MARKER-22222"\n  bad indent: x', {
    mode: 0o600,
  });

  const originalError = console.error;
  const logged: string[] = [];
  console.error = (...args: unknown[]) => {
    logged.push(args.map((a) => (a instanceof Error ? a.message : String(a))).join(" "));
  };
  try {
    await migrateLegacyUserFiles(dir);
  } finally {
    console.error = originalError;
  }

  const allLogs = logged.join("\n");
  expect(allLogs).toContain("providers.json parse failed");
  expect(allLogs).toContain("line"); // 行列位置保留
  expect(allLogs).not.toContain("AR-LEAK-MARKER-22222"); // 源码值不进日志（机密收口）
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
