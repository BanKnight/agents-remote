import { homedir } from "node:os";
import { join } from "node:path";
import { readFile, rename, stat } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import type { SettingsState } from "@agents-remote/shared";
import {
  migrateV1ToV2,
  normalizeSettings,
  readSchemaVersion,
  SettingsStore,
} from "./settings-store";
import { normalizePinnedSessions, StateStore } from "./state-store";

// 旧 providers.json → settings.yaml + state.yaml 一次性迁移的组装层。迁移纯逻辑（v1/v2
// 分流、ui 提取、拆分）在 splitLegacySettings；本文件只负责文件读写顺序与幂等。

const defaultUserDir = () => join(homedir(), ".agents-remote");

// providers.json 原始解析 → settings@v3 + overview@state@v1 拆分。纯函数，密集测试覆盖。
// 入参 = 原始 parsed（JSON 是 YAML 子集，统一 yaml 解析）；按 schemaVersion 分流
// v1→migrateV1ToV2（保留不动，最高风险防线）/ v2或缺→normalizeSettings。ui.pinnedSessions
// 在 normalize 丢弃前从 parsed 顶层提取（v1 无 ui → []）。
export function splitLegacySettings(parsed: unknown): {
  settings: SettingsState;
  overview: { pinnedSessions: string[] };
} {
  const settings =
    readSchemaVersion(parsed) === 1 ? migrateV1ToV2(parsed) : normalizeSettings(parsed);
  const overview = { pinnedSessions: readLegacyUi(parsed) };
  return { settings, overview };
}

// v2 providers.json 顶层 ui.pinnedSessions（shared SettingsState 已去 ui，normalize 会丢弃，
// 迁移必须在此提前提取）。v1/缺省/非法 → []。
const readLegacyUi = (parsed: unknown): string[] => {
  if (!parsed || typeof parsed !== "object") return [];
  const ui = (parsed as { ui?: { pinnedSessions?: unknown } }).ui;
  return normalizePinnedSessions(ui?.pinnedSessions);
};

// settings.yaml v2-with-ui 中间态 → state.yaml + settings@v3 一次性提取。C3 产物（ui 还
// 在 SettingsState 顶层、schemaVersion 2）会被 C4 静默丢弃（normalizeSettings 返回不含 ui），
// 这里在 settings.yaml 存在时读它：有顶层 ui → splitLegacySettings（settings 去 ui 合成 v3 +
// overview 提取 pinnedSessions）→ state.yaml overview 并集（不覆盖既有 pin）→ settings 重写 v3。
// 幂等：v3 无 ui → no-op。损坏 YAML → 跳过（不 rename——settings.yaml 是权威文件，rename 即
// 数据丢失；坏文件的既有 read() 报错行为保留，启动路径不新增崩溃路径）。
async function migrateSettingsYamlUi(dir: string): Promise<void> {
  const settingsPath = join(dir, "settings.yaml");
  const statePath = join(dir, "state.yaml");

  let raw: string;
  try {
    raw = await readFile(settingsPath, "utf8");
  } catch (error) {
    if (isNotFoundError(error)) return;
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (error) {
    console.error(
      `[migrate-legacy] settings.yaml parse failed (skipping ui extraction): ${errorMessage(error)}`,
    );
    return;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;
  if (!("ui" in (parsed as Record<string, unknown>))) return;

  const { settings, overview } = splitLegacySettings(parsed);
  await new StateStore({ path: statePath }).updateModule("overview", (cur) => ({
    pinnedSessions: normalizePinnedSessions([...cur.pinnedSessions, ...overview.pinnedSessions]),
  }));
  await new SettingsStore({ path: settingsPath }).write(settings);
}

// 幂等迁移。settings.yaml 存在 → 检查 v2-with-ui 中间态（见 migrateSettingsYamlUi），
// 无 ui 即无事（已是 v3）；不存在 → providers.json 存在 → splitLegacySettings → 先写
// settings.yaml（权威，崩溃重启后 settings.yaml 在即跳过）再写 state.yaml（极端崩溃缺
// state.yaml → readModule 返回默认，pin 丢失可接受，pin 装饰性）再改名 providers.json → .bak。
// 两者都缺 → 首启走默认，不迁移。
export async function migrateLegacyUserFiles(dir = defaultUserDir()): Promise<void> {
  const settingsPath = join(dir, "settings.yaml");

  // settings.yaml 存在：v2-with-ui → 提取 ui 到 state.yaml + settings 重写 v3；已是 v3 → no-op。
  // 不存在 → 走下方 providers.json 迁移。stat 只判断存在性，实际读写交给各自分支。
  let settingsExists = false;
  try {
    await stat(settingsPath);
    settingsExists = true;
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
  }
  if (settingsExists) {
    await migrateSettingsYamlUi(dir);
    return;
  }

  const providersPath = join(dir, "providers.json");

  let raw: string;
  try {
    raw = await readFile(providersPath, "utf8");
  } catch (error) {
    if (isNotFoundError(error)) return;
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (error) {
    // 损坏的 providers.json（YAML 语法错误/截断）：保留现场改名 .corrupt 后跳过迁移。
    // 必须不抛——迁移在 startApi 启动路径上，顶层 catch 只接 StartupError，任何其他
    // throw 都会让整个 API 起不来。旧实现懒读损坏文件只影响 settings 接口（500），
    // 迁移前置到启动后必须保持「损坏不崩」。改名后下次启动不再重试。
    await rename(providersPath, `${providersPath}.corrupt`);
    console.error(
      `[migrate-legacy] providers.json parse failed (moved to providers.json.corrupt): ${errorMessage(error)}`,
    );
    return;
  }

  const { settings, overview } = splitLegacySettings(parsed);
  await new SettingsStore({ path: settingsPath }).write(settings);
  await new StateStore({ path: join(dir, "state.yaml") }).updateModule("overview", () => overview);
  await rename(providersPath, `${providersPath}.bak`);
}

const isNotFoundError = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));
