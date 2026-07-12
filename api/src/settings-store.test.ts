import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ClaudeRuntimeConfig, SettingsState } from "@agents-remote/shared";
import {
  DEFAULT_CLAUDE_RUNTIME,
  SettingsStore,
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
    providers: [{ id: "prov_1", label: "官方", apiKey: "sk-ant-abc123wX4k" }],
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
