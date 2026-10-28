// codex 跨 remount 回放缓存单测：镜像 claude-replay-cache.test.ts 核心用例（读写往返/
// key 编码/墓碑/项目清扫/损坏校验/全降级/行 cap），存储层同一 replay-cache-store 注入
// 内存实现。codex 特有面：
// ① 锚由调用方传入（save 第三参 anchorId；null = 窗口内无可锚条目 → 硬删）；
// ② claude+codex 共享 50M 全局预算（同一 IDB 库，codex 写入可淘汰 claude 旧 entry）。
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  loadReplayCache,
  replayCacheKey,
  saveReplayCache,
  setReplayCacheStoreForTests,
} from "./claude-replay-cache";
import {
  clearProjectCodexReplayCache,
  clearCodexReplayCache,
  codexReplayCacheKey,
  loadCodexReplayCache,
  saveCodexReplayCache,
  setCodexReplayCacheStoreForTests,
  CODEX_REPLAY_CACHE_MAX_LINES,
} from "./codex-replay-cache";
import { createMemReplayStore } from "./replay-cache-store";

let store: ReturnType<typeof createMemReplayStore>;

beforeEach(() => {
  store = createMemReplayStore();
  setCodexReplayCacheStoreForTests(store);
  // claude 模块注入同一 mem store 实例（共享预算交叉淘汰用例依赖同库）。
  setReplayCacheStoreForTests(store);
});

afterEach(() => {
  setCodexReplayCacheStoreForTests(null);
  setReplayCacheStoreForTests(null);
});

const KEY = codexReplayCacheKey("proj", "sess");

const line = (id: string) => JSON.stringify({ type: "codex_user_echo", text: `t${id}`, uuid: id });

describe("codex-replay-cache 读写往返", () => {
  test("save → load 原样取回（v/anchorId/raw/savedAt）", async () => {
    await saveCodexReplayCache(KEY, [line("uuid-1"), line("uuid-2")], "uuid-2");
    const entry = await loadCodexReplayCache(KEY);
    expect(entry).not.toBeNull();
    expect(entry!.v).toBe(1);
    expect(entry!.anchorId).toBe("uuid-2");
    expect(entry!.raw).toEqual([line("uuid-1"), line("uuid-2")]);
    expect(typeof entry!.savedAt).toBe("number");
  });

  test("key 按 projectName/sessionId 编码（含 / 不歧义）", async () => {
    expect(codexReplayCacheKey("a/b", "s")).toBe(
      `codexReplayCache:${encodeURIComponent("a/b")}/${encodeURIComponent("s")}`,
    );
    await saveCodexReplayCache(codexReplayCacheKey("a/b", "s"), [line("u1")], "u1");
    expect((await loadCodexReplayCache(codexReplayCacheKey("a/b", "s")))!.anchorId).toBe("u1");
    expect(await loadCodexReplayCache(codexReplayCacheKey("a", "b/s"))).toBeNull();
  });

  test("clearCodexReplayCache 清档（墓碑语义）", async () => {
    await saveCodexReplayCache(KEY, [line("u1")], "u1");
    await clearCodexReplayCache(KEY);
    expect(await loadCodexReplayCache(KEY)).toBeNull();
    const tomb = await store.load(KEY);
    expect(tomb).toMatchObject({ removed: true });
  });

  test("项目级清扫 = 硬删（rename-back 无墓碑陷阱）", async () => {
    await saveCodexReplayCache(codexReplayCacheKey("proj", "s1"), [line("u1")], "u1");
    await clearProjectCodexReplayCache("proj");
    expect(await loadCodexReplayCache(codexReplayCacheKey("proj", "s1"))).toBeNull();
    await saveCodexReplayCache(codexReplayCacheKey("proj", "s1"), [line("u2")], "u2");
    expect((await loadCodexReplayCache(codexReplayCacheKey("proj", "s1")))!.anchorId).toBe("u2");
  });

  test("项目级清扫只清本项目（不碰其他项目）", async () => {
    await saveCodexReplayCache(codexReplayCacheKey("proj", "s1"), [line("u1")], "u1");
    await saveCodexReplayCache(codexReplayCacheKey("proj", "s2"), [line("u2")], "u2");
    await saveCodexReplayCache(codexReplayCacheKey("other", "s1"), [line("u3")], "u3");
    await clearProjectCodexReplayCache("proj");
    expect(await loadCodexReplayCache(codexReplayCacheKey("proj", "s1"))).toBeNull();
    expect(await loadCodexReplayCache(codexReplayCacheKey("proj", "s2"))).toBeNull();
    expect(await loadCodexReplayCache(codexReplayCacheKey("other", "s1"))).not.toBeNull();
  });
});

describe("codex-replay-cache 校验与降级", () => {
  test("损坏 JSON / 版本不符 → miss", async () => {
    store.rawPut(KEY, "not-an-object");
    expect(await loadCodexReplayCache(KEY)).toBeNull();
    store.rawPut(KEY, { v: 2, cursorUuid: "u", raw: ["x"] });
    expect(await loadCodexReplayCache(KEY)).toBeNull();
    expect(await loadCodexReplayCache(codexReplayCacheKey("nope", "nope"))).toBeNull();
  });

  test("无注入（bun 无 IDB）→ 全降级：读 miss、写/清 no-op", async () => {
    setCodexReplayCacheStoreForTests(null);
    expect(await loadCodexReplayCache(KEY)).toBeNull();
    await expect(saveCodexReplayCache(KEY, [line("u1")], "u1")).resolves.toBeUndefined();
    await expect(clearCodexReplayCache(KEY)).resolves.toBeUndefined();
  });

  test("无锚（anchorId=null）→ 硬删；空窗口 → 硬删", async () => {
    await saveCodexReplayCache(KEY, [JSON.stringify({ type: "codex_event" })], null);
    expect(await store.load(KEY)).toBeNull();
    await saveCodexReplayCache(KEY, [], "u1");
    expect(await store.load(KEY)).toBeNull();
  });
});

describe("codex-replay-cache 容量治理", () => {
  test("行数超限截头保尾（锚行 = 尾部可锚行存活）", async () => {
    const raw = Array.from({ length: CODEX_REPLAY_CACHE_MAX_LINES + 50 }, (_, i) => line(`u${i}`));
    await saveCodexReplayCache(KEY, raw, `u${CODEX_REPLAY_CACHE_MAX_LINES + 49}`);
    const entry = await loadCodexReplayCache(KEY);
    expect(entry!.raw).toHaveLength(CODEX_REPLAY_CACHE_MAX_LINES);
    expect(entry!.raw[0]!.includes('"u50"')).toBe(true);
    expect(entry!.raw.at(-1)).toContain(`"u${CODEX_REPLAY_CACHE_MAX_LINES + 49}"`);
  });

  test("共享预算：codex 写入可淘汰 claude 旧 entry（同一 mem store）", async () => {
    const pad = "x".repeat(26_000_000);
    const bigLine = (id: string) => JSON.stringify({ type: "codex_user_echo", uuid: id, pad });
    await saveReplayCache(replayCacheKey("p", "c-old"), true, [bigLine("u")]);
    await saveCodexReplayCache(codexReplayCacheKey("p", "codex-new"), [bigLine("u")], "u");
    expect(await loadReplayCache(replayCacheKey("p", "c-old"))).toBeNull();
    expect(await loadCodexReplayCache(codexReplayCacheKey("p", "codex-new"))).not.toBeNull();
  });
});
