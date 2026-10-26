// IndexedDB 迁移批（2026-10-26）：ReplayCacheStore 接口行为的可测部分——内存实现
// 的全方法与故障注入旋钮、IDB 工厂的降级路径（bun 无 indexedDB）。IDB 路径的行为
// 验证靠浏览器探针（scripts/probe-replay-cache-*.mjs），bun 环境伪造不了结构化克隆。
import { describe, expect, test } from "bun:test";
import type { StoredEntry } from "./replay-cache-store";
import {
  createIdbReplayStore,
  createMemReplayStore,
  REPLAY_CACHE_PREFIX,
  sweepLegacyReplayCache,
} from "./replay-cache-store";

function makeEntry(overrides?: Partial<StoredEntry>): StoredEntry {
  return {
    savedAt: 1_000,
    v: 1,
    cursorUuid: "uuid-2",
    resume: false,
    raw: "line1\nline2",
    ...overrides,
  };
}

describe("createMemReplayStore", () => {
  test("put → load roundtrip", async () => {
    const store = createMemReplayStore();
    expect(await store.putUnlessTombstone("k1", makeEntry())).toBe(true);
    expect(await store.load("k1")).toEqual(makeEntry());
  });

  test("load unknown key returns null", async () => {
    const store = createMemReplayStore();
    expect(await store.load("missing")).toBeNull();
  });

  test("tombstone → load returns tombstone record (semantics live in cache layer)", async () => {
    const store = createMemReplayStore();
    await store.tombstone("k1");
    expect(await store.load("k1")).toMatchObject({ removed: true });
  });

  test("putUnlessTombstone blocked by tombstone: false, no overwrite", async () => {
    const store = createMemReplayStore();
    await store.tombstone("k1");
    expect(await store.putUnlessTombstone("k1", makeEntry({ savedAt: 2_000 }))).toBe(false);
    expect(await store.load("k1")).toMatchObject({ removed: true });
  });

  test("remove / deleteMany hard-delete entries and meta", async () => {
    const store = createMemReplayStore();
    await store.putUnlessTombstone("k1", makeEntry());
    await store.putUnlessTombstone("k2", makeEntry());
    await store.remove("k1");
    expect(await store.load("k1")).toBeNull();
    await store.deleteMany(["k2"]);
    expect(await store.load("k2")).toBeNull();
  });

  test("listKeys filters by prefix; listMeta exposes savedAt/chars", async () => {
    const store = createMemReplayStore();
    await store.putUnlessTombstone("projA/1", makeEntry());
    await store.putUnlessTombstone("projA/2", makeEntry());
    await store.putUnlessTombstone("projB/1", makeEntry());
    expect(await store.listKeys("projA/")).toEqual(["projA/1", "projA/2"]);
    const meta = await store.listMeta();
    expect(meta).toHaveLength(3);
    expect(meta.every((row) => row.savedAt === 1_000)).toBe(true);
    // chars 口径 = raw 为主（软预算，见 entryChars）。
    const expected = makeEntry().raw.length + makeEntry().cursorUuid.length + 64;
    expect(meta.every((row) => row.chars === expected)).toBe(true);
  });

  test("rawPut injects arbitrary shapes (tombstone parity with IDB records)", async () => {
    const store = createMemReplayStore();
    store.rawPut("k1", { savedAt: 5, v: 1, removed: true });
    expect(await store.load("k1")).toMatchObject({ removed: true });
    expect(await store.putUnlessTombstone("k1", makeEntry())).toBe(false);
  });

  test("failPutOnce throws once then recovers; failPutAlways throws every time", async () => {
    const store = createMemReplayStore();
    store.failPutOnce = true;
    await expect(store.putUnlessTombstone("k1", makeEntry())).rejects.toThrow("quota exceeded");
    expect(await store.putUnlessTombstone("k1", makeEntry())).toBe(true);
    store.failPutAlways = true;
    await expect(store.putUnlessTombstone("k2", makeEntry())).rejects.toThrow("quota exceeded");
  });

  test("loadDelayMs delays load", async () => {
    const store = createMemReplayStore();
    store.loadDelayMs = 5;
    const startedAt = Date.now();
    await store.load("missing");
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(4);
  });
});

describe("createIdbReplayStore factory", () => {
  test("returns null without indexedDB (bun runtime)", () => {
    expect(createIdbReplayStore()).toBeNull();
  });

  test("sweepLegacyReplayCache is a no-op without localStorage (bun runtime)", () => {
    expect(() => sweepLegacyReplayCache()).not.toThrow();
    expect(REPLAY_CACHE_PREFIX).toBe("claudeReplayCache:");
  });
});
