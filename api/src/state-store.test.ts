import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { normalizePinnedSessions, StateStore } from "./state-store";

const tempDirs: string[] = [];

const makeTempDir = async () => {
  const dir = await mkdtemp(join(tmpdir(), "agents-remote-state-store-"));
  tempDirs.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

test("readModule returns default overview when file missing (no throw)", async () => {
  const dir = await makeTempDir();
  const store = new StateStore({ path: join(dir, "state.yaml") });

  const overview = await store.readModule("overview");
  expect(overview).toEqual({ pinnedSessions: [] });
});

test("updateModule writes module and round-trips + keeps 0o600 + schemaVersion 1", async () => {
  const dir = await makeTempDir();
  const path = join(dir, "state.yaml");
  const store = new StateStore({ path });

  const updated = await store.updateModule("overview", (cur) => ({
    ...cur,
    pinnedSessions: ["ar-claude-a", "ar-terminal-b"],
  }));
  expect(updated.pinnedSessions).toEqual(["ar-claude-a", "ar-terminal-b"]);

  const roundTrip = await store.readModule("overview");
  expect(roundTrip.pinnedSessions).toEqual(["ar-claude-a", "ar-terminal-b"]);

  const fileStat = await stat(path);
  expect(fileStat.mode & 0o077).toBe(0);

  const raw = parseYaml(await readFile(path, "utf8"));
  expect(raw.schemaVersion).toBe(1);
  expect(raw.overview.pinnedSessions).toEqual(["ar-claude-a", "ar-terminal-b"]);
});

test("updateModule preserves sibling modules (module map merge)", async () => {
  const dir = await makeTempDir();
  const path = join(dir, "state.yaml");
  const store = new StateStore({ path });

  await store.updateModule("overview", (cur) => ({
    ...cur,
    pinnedSessions: ["a"],
  }));

  // 第二次 update 只动 overview 自身，不引入/破坏其它字段。
  await store.updateModule("overview", (cur) => ({
    ...cur,
    pinnedSessions: [...cur.pinnedSessions, "b"],
  }));
  expect((await store.readModule("overview")).pinnedSessions).toEqual(["a", "b"]);

  const raw = parseYaml(await readFile(path, "utf8"));
  expect(raw.schemaVersion).toBe(1);
  expect(raw.overview.pinnedSessions).toEqual(["a", "b"]);
});

test("readModule normalizes malformed overview (dedupe + filter non-string/empty)", async () => {
  const dir = await makeTempDir();
  const path = join(dir, "state.yaml");
  await writeFile(
    path,
    stringifyYaml({
      schemaVersion: 1,
      overview: { pinnedSessions: ["a", "b", "a", "", 123, null, "b", "c"] },
    }),
    { mode: 0o600 },
  );

  const overview = await new StateStore({ path }).readModule("overview");
  expect(overview.pinnedSessions).toEqual(["a", "b", "c"]);
});

test("readModule defaults missing overview module and non-array pinnedSessions to []", async () => {
  const dir = await makeTempDir();

  // overview 缺失 → 默认。
  const missingModule = join(dir, "no-module.yaml");
  await writeFile(missingModule, stringifyYaml({ schemaVersion: 1, other: { x: 1 } }), {
    mode: 0o600,
  });
  expect(
    (await new StateStore({ path: missingModule }).readModule("overview")).pinnedSessions,
  ).toEqual([]);

  // pinnedSessions 非数组 → 默认。
  const nonArray = join(dir, "non-array.yaml");
  await writeFile(
    nonArray,
    stringifyYaml({ schemaVersion: 1, overview: { pinnedSessions: "x" } }),
    {
      mode: 0o600,
    },
  );
  expect((await new StateStore({ path: nonArray }).readModule("overview")).pinnedSessions).toEqual(
    [],
  );
});

test("normalizePinnedSessions dedupes + filters non-string/empty", () => {
  expect(normalizePinnedSessions(["a", "b", "a", "", 123, null, "b", "c"])).toEqual([
    "a",
    "b",
    "c",
  ]);
  expect(normalizePinnedSessions("not-an-array")).toEqual([]);
  expect(normalizePinnedSessions(undefined)).toEqual([]);
});
