// IndexedDB 迁移批（2026-10-26）重写：bun/jsdom 无 IndexedDB，改走 replay-cache-store
// 的内存实现注入（setReplayCacheStoreForTests）——旧 JSDOM + globalThis.localStorage
// 整体替换脚手架随 localStorage 存储层退役。用例与旧版逐条对应，差异点：
// ① 「字符超限截断」用例反转为「落盘不截断」（IDB 配额下恢复语义完整性，见
//    REPLAY_WINDOW_MAX_CHARS 注释）；
// ② 「裸环境」用例改为「无注入（bun 无 IDB）→ 全降级」（生产懒创建路径在 bun 下
//    天然返回 null store）。
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  clearProjectReplayCache,
  clearReplayCache,
  loadReplayCache,
  replayCacheKey,
  saveReplayCache,
  setReplayCacheStoreForTests,
  REPLAY_CACHE_MAX_LINES,
} from "./claude-replay-cache";
import { createMemReplayStore } from "./replay-cache-store";

let store: ReturnType<typeof createMemReplayStore>;

beforeEach(() => {
  store = createMemReplayStore();
  setReplayCacheStoreForTests(store);
});

afterEach(() => {
  setReplayCacheStoreForTests(null); // 还原生产懒创建路径
});

const KEY = replayCacheKey("proj", "sess");

const line = (uuid: string, pad = 0) =>
  JSON.stringify({
    type: "assistant",
    uuid,
    message: { id: uuid, role: "assistant", content: [{ type: "text", text: `t${uuid}` }] },
    ...(pad > 0 ? { pad: "x".repeat(pad) } : {}),
  });

describe("claude-replay-cache 读写往返", () => {
  test("save → load 原样取回（v/cursorUuid/resume/raw/savedAt）", async () => {
    await saveReplayCache(KEY, true, [line("uuid-1"), line("uuid-2")]);
    const entry = await loadReplayCache(KEY);
    expect(entry).not.toBeNull();
    expect(entry!.v).toBe(1);
    expect(entry!.cursorUuid).toBe("uuid-2");
    expect(entry!.resume).toBe(true);
    expect(entry!.raw).toEqual([line("uuid-1"), line("uuid-2")]);
    expect(typeof entry!.savedAt).toBe("number");
  });

  test("锚由窗口尾逆序推导：尾部非消息行跳过，取最后一条带 uuid 行", async () => {
    await saveReplayCache(KEY, false, [
      line("u1"),
      JSON.stringify({ type: "system", subtype: "x" }),
    ]);
    expect((await loadReplayCache(KEY))!.cursorUuid).toBe("u1");
  });

  test("key 按 projectName/sessionId 编码（含 / 的目录型项目名不歧义）", async () => {
    expect(replayCacheKey("a/b", "s")).toBe(
      `claudeReplayCache:${encodeURIComponent("a/b")}/${encodeURIComponent("s")}`,
    );
    await saveReplayCache(replayCacheKey("a/b", "s"), false, [line("u1")]);
    expect((await loadReplayCache(replayCacheKey("a/b", "s")))!.cursorUuid).toBe("u1");
    expect(await loadReplayCache(replayCacheKey("a", "b/s"))).toBeNull();
  });

  test("clearReplayCache 清档", async () => {
    await saveReplayCache(KEY, false, [line("u1")]);
    await clearReplayCache(KEY);
    expect(await loadReplayCache(KEY)).toBeNull();
  });

  test("墓碑：clear 后 save 不复活（迟到的 flush 不覆盖删除语义），墓碑形状带 savedAt", async () => {
    await saveReplayCache(KEY, false, [line("u1")]);
    await clearReplayCache(KEY);
    await saveReplayCache(KEY, false, [line("u2")]);
    expect(await loadReplayCache(KEY)).toBeNull();
    const tomb = await store.load(KEY);
    expect(tomb).toMatchObject({ removed: true });
    expect(typeof (tomb as { savedAt: number }).savedAt).toBe("number");
  });

  test("项目级清扫后 save 同 key 不复活", async () => {
    await saveReplayCache(replayCacheKey("proj", "s1"), false, [line("u1")]);
    await clearProjectReplayCache("proj");
    await saveReplayCache(replayCacheKey("proj", "s1"), false, [line("u2")]);
    expect(await loadReplayCache(replayCacheKey("proj", "s1"))).toBeNull();
  });

  test("clearProjectReplayCache 只清本项目全部会话，不碰其他项目/非缓存键", async () => {
    await saveReplayCache(replayCacheKey("proj", "s1"), false, [line("u1")]);
    await saveReplayCache(replayCacheKey("proj", "s2"), false, [line("u2")]);
    await saveReplayCache(replayCacheKey("other", "s1"), false, [line("u3")]);
    await clearProjectReplayCache("proj");
    expect(await loadReplayCache(replayCacheKey("proj", "s1"))).toBeNull();
    expect(await loadReplayCache(replayCacheKey("proj", "s2"))).toBeNull();
    expect(await loadReplayCache(replayCacheKey("other", "s1"))).not.toBeNull();
  });

  test("clearProjectReplayCache 项目名含 / 时按编码前缀匹配（不误伤前缀同名项目）", async () => {
    await saveReplayCache(replayCacheKey("a/b", "s"), false, [line("u1")]);
    await saveReplayCache(replayCacheKey("a", "b/s"), false, [line("u2")]);
    await clearProjectReplayCache("a/b");
    expect(await loadReplayCache(replayCacheKey("a/b", "s"))).toBeNull();
    expect(await loadReplayCache(replayCacheKey("a", "b/s"))).not.toBeNull();
  });
});

describe("claude-replay-cache 校验与降级", () => {
  test("损坏 JSON / 版本不符 / raw 非 string → miss", async () => {
    store.rawPut(KEY, "not-an-object");
    expect(await loadReplayCache(KEY)).toBeNull();
    store.rawPut(KEY, { v: 2, cursorUuid: "u", raw: ["x"] });
    expect(await loadReplayCache(KEY)).toBeNull();
    expect(await loadReplayCache(replayCacheKey("nope", "nope"))).toBeNull();
  });

  test("无注入（bun 无 IDB，生产懒创建路径）→ 全降级：读 miss、写/清 no-op", async () => {
    setReplayCacheStoreForTests(null); // 还原生产懒创建 → bun 无 indexedDB → null store
    expect(await loadReplayCache(KEY)).toBeNull();
    await expect(saveReplayCache(KEY, false, [line("u1")])).resolves.toBeUndefined();
    await expect(clearReplayCache(KEY)).resolves.toBeUndefined();
  });

  test("raw 空窗口 / 窗口内无 uuid 行 → 硬删（不生成垃圾 entry）", async () => {
    store.rawPut(KEY, { savedAt: 1, v: 1, cursorUuid: "old", resume: false, raw: "legacy" });
    await saveReplayCache(KEY, false, []);
    expect(await store.load(KEY)).toBeNull();
    store.rawPut(KEY, { savedAt: 9, v: 1, cursorUuid: "old2", resume: false, raw: "legacy2" });
    await saveReplayCache(KEY, false, [JSON.stringify({ type: "system", subtype: "x" })]);
    expect(await store.load(KEY)).toBeNull();
  });
});

describe("claude-replay-cache 容量治理", () => {
  test("行数超限截头保尾（锚行 = 尾部带 uuid 行存活）", async () => {
    const raw = Array.from({ length: REPLAY_CACHE_MAX_LINES + 50 }, (_, i) => line(`u${i}`));
    await saveReplayCache(KEY, false, raw);
    const entry = await loadReplayCache(KEY);
    expect(entry!.raw).toHaveLength(REPLAY_CACHE_MAX_LINES);
    expect(entry!.raw[0]!.includes('"u50"')).toBe(true);
    expect(entry!.raw.at(-1)).toContain(`"u${REPLAY_CACHE_MAX_LINES + 49}"`);
    expect(entry!.cursorUuid).toBe(`u${REPLAY_CACHE_MAX_LINES + 49}`);
  });

  test("落盘不截断：超旧字符 cap（1.5M）的真实规模窗口原样取回", async () => {
    // 旧版 1.5M 落盘 cap 会把 2.9M 窗口丢头截断——IDB 版恢复语义完整性的核心用例。
    const big = "x".repeat(1_600_000);
    const raw = [
      line("u0", 0),
      JSON.stringify({ type: "assistant", uuid: "bigline", pad: "x".repeat(1_600_000) }),
      line("u1"),
    ];
    expect(raw[1]!.length).toBeGreaterThan(1_500_000);
    expect(big.length).toBe(1_600_000);
    await saveReplayCache(KEY, false, raw);
    const entry = await loadReplayCache(KEY);
    expect(entry!.raw).toEqual(raw);
    expect(entry!.cursorUuid).toBe("u1");
  });

  test("全局配额：超 REPLAY_CACHE_MAX_TOTAL_CHARS 时 LRU 淘汰最旧他人 entry", async () => {
    // 两个 ~26M entry 合计 > 50M 全局预算 → 第二次写入淘汰第一个（savedAt 更旧）。
    const pad = "x".repeat(26_000_000);
    const bigLine = (uuid: string) => JSON.stringify({ type: "assistant", uuid, pad });
    await saveReplayCache(replayCacheKey("p", "old"), false, [bigLine("u-old")]);
    await saveReplayCache(replayCacheKey("p", "new"), false, [bigLine("u-new")]);
    expect(await loadReplayCache(replayCacheKey("p", "old"))).toBeNull();
    expect(await loadReplayCache(replayCacheKey("p", "new"))).not.toBeNull();
  });

  test("QuotaExceeded：淘汰后重试一次成功（failPutOnce）", async () => {
    await saveReplayCache(replayCacheKey("p", "victim"), false, [line("u-v")]);
    store.failPutOnce = true;
    await saveReplayCache(KEY, false, [line("u1")]);
    expect(await loadReplayCache(KEY)).not.toBeNull();
  });

  test("QuotaExceeded 且无可淘汰空间：静默放弃（failPutAlways，不抛出）", async () => {
    store.failPutAlways = true;
    await saveReplayCache(KEY, false, [line("u1")]);
    expect(await loadReplayCache(KEY)).toBeNull();
  });

  test("save 后 meta 与 entries 一致（meta.chars 口径 = entryChars）", async () => {
    await saveReplayCache(KEY, false, [line("u1")]);
    const meta = await store.listMeta();
    const row = meta.find((r) => r.key === KEY);
    expect(row).toBeDefined();
    const stored = (await store.load(KEY)) as { raw: string; cursorUuid: string };
    expect(row!.chars).toBe(stored.raw.length + stored.cursorUuid.length + 64);
  });
});
