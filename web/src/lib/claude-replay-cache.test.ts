// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";

import {
  clearReplayCache,
  loadReplayCache,
  replayCacheKey,
  saveReplayCache,
  REPLAY_CACHE_MAX_ENTRY_CHARS,
  REPLAY_CACHE_MAX_LINES,
} from "./claude-replay-cache";

let dom: JSDOM;

beforeEach(() => {
  dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
  globalThis.localStorage = dom.window.localStorage;
});

afterEach(() => {
  dom.window.close();
});

const KEY = replayCacheKey("proj", "sess");

const line = (uuid: string, pad = 0) =>
  JSON.stringify({
    type: "assistant",
    uuid,
    message: { id: uuid, role: "assistant", content: [{ type: "text", text: `t${uuid}` }] },
    ...(pad > 0 ? { pad: "x".repeat(pad) } : {}),
  });

/**
 * JSDOM 的 Storage 成员是 [LegacyUnforgeable]（实例 own non-configurable），
 * Object.defineProperty 拦不住成员方法——整体替换 globalThis.localStorage，
 * 未覆写的方法手动代理到真 storage（spread 不拷原型方法）。
 */
const stubStorage = (overrides: Partial<Storage>): Storage => {
  const real = dom.window.localStorage;
  return {
    getItem: (k) => real.getItem(k),
    setItem: (k, v) => real.setItem(k, v),
    removeItem: (k) => real.removeItem(k),
    key: (i) => real.key(i),
    clear: () => real.clear(),
    get length() {
      return real.length;
    },
    ...overrides,
  } as Storage;
};

describe("claude-replay-cache 读写往返", () => {
  test("save → load 原样取回（v/cursorUuid/resume/raw/savedAt）", () => {
    saveReplayCache(KEY, true, [line("uuid-1"), line("uuid-2")]);
    const entry = loadReplayCache(KEY);
    expect(entry).not.toBeNull();
    expect(entry!.v).toBe(1);
    expect(entry!.cursorUuid).toBe("uuid-2");
    expect(entry!.resume).toBe(true);
    expect(entry!.raw).toEqual([line("uuid-1"), line("uuid-2")]);
    expect(typeof entry!.savedAt).toBe("number");
  });

  test("锚由窗口尾逆序推导：尾部非消息行跳过，取最后一条带 uuid 行", () => {
    saveReplayCache(KEY, false, [line("u1"), JSON.stringify({ type: "system", subtype: "x" })]);
    expect(loadReplayCache(KEY)!.cursorUuid).toBe("u1");
  });

  test("key 按 projectName/sessionId 编码（含 / 的目录型项目名不歧义）", () => {
    expect(replayCacheKey("a/b", "s")).toBe(
      `claudeReplayCache:${encodeURIComponent("a/b")}/${encodeURIComponent("s")}`,
    );
    saveReplayCache(replayCacheKey("a/b", "s"), false, [line("u1")]);
    expect(loadReplayCache(replayCacheKey("a/b", "s"))!.cursorUuid).toBe("u1");
    expect(loadReplayCache(replayCacheKey("a", "b/s"))).toBeNull();
  });

  test("clearReplayCache 清档", () => {
    saveReplayCache(KEY, false, [line("u1")]);
    clearReplayCache(KEY);
    expect(loadReplayCache(KEY)).toBeNull();
  });
});

describe("claude-replay-cache 校验与降级", () => {
  test("损坏 JSON / 版本不符 / cursor 空 / raw 空 → miss", () => {
    dom.window.localStorage.setItem(KEY, "{broken");
    expect(loadReplayCache(KEY)).toBeNull();
    dom.window.localStorage.setItem(KEY, JSON.stringify({ v: 2, cursorUuid: "u", raw: ["x"] }));
    expect(loadReplayCache(KEY)).toBeNull();
    expect(loadReplayCache(replayCacheKey("nope", "nope"))).toBeNull();
  });

  test("raw 空窗口 / 窗口内无 uuid 行 → removeItem（不生成垃圾 entry）", () => {
    dom.window.localStorage.setItem(KEY, "existing");
    saveReplayCache(KEY, false, []);
    expect(dom.window.localStorage.getItem(KEY)).toBeNull();
    dom.window.localStorage.setItem(KEY, "existing");
    saveReplayCache(KEY, false, [JSON.stringify({ type: "system", subtype: "x" })]);
    expect(dom.window.localStorage.getItem(KEY)).toBeNull();
  });

  test("裸环境（无 localStorage）静默 no-op", () => {
    const original = globalThis.localStorage;
    // @ts-expect-error 模拟无 localStorage 环境
    delete globalThis.localStorage;
    try {
      expect(loadReplayCache(KEY)).toBeNull();
      expect(() => saveReplayCache(KEY, false, [line("u1")])).not.toThrow();
      expect(() => clearReplayCache(KEY)).not.toThrow();
    } finally {
      globalThis.localStorage = original;
    }
  });
});

describe("claude-replay-cache 容量治理", () => {
  test("行数超限截头保尾（锚行 = 尾部带 uuid 行存活）", () => {
    const raw = Array.from({ length: REPLAY_CACHE_MAX_LINES + 50 }, (_, i) => line(`u${i}`));
    saveReplayCache(KEY, false, raw);
    const entry = loadReplayCache(KEY);
    expect(entry!.raw).toHaveLength(REPLAY_CACHE_MAX_LINES);
    expect(entry!.raw[0]!.includes('"u50"')).toBe(true);
    expect(entry!.raw.at(-1)).toContain(`"u${REPLAY_CACHE_MAX_LINES + 49}"`);
    expect(entry!.cursorUuid).toBe(`u${REPLAY_CACHE_MAX_LINES + 49}`);
  });

  test("字符超限从头部丢行，锚行兜底保留（trim 到只剩锚也不越过）", () => {
    const big = line("big", REPLAY_CACHE_MAX_ENTRY_CHARS); // 单行超上限
    const raw = [line("u0"), big, line("u1")];
    saveReplayCache(KEY, false, raw);
    const entry = loadReplayCache(KEY);
    // 锚行 u1 必在；big/u0 被丢（trim 至「只剩锚行」即止，不丢锚）。
    expect(entry!.raw).toEqual([line("u1")]);
    expect(entry!.cursorUuid).toBe("u1");
  });

  test("全局配额：写入时 LRU 淘汰最旧 entry", () => {
    // 每 entry 1.5M chars,全局上限 2.5M 只容一个 → 每次写入淘汰更旧的会话。
    saveReplayCache(replayCacheKey("p", "old"), false, [line("u-old", 1_500_000)]);
    expect(loadReplayCache(replayCacheKey("p", "old"))).not.toBeNull();
    saveReplayCache(replayCacheKey("p", "new"), false, [line("u-new", 1_500_000)]);
    expect(loadReplayCache(replayCacheKey("p", "old"))).toBeNull(); // 最旧出局
    expect(loadReplayCache(replayCacheKey("p", "new"))).not.toBeNull();
    saveReplayCache(KEY, false, [line("u1", 1_500_000)]);
    expect(loadReplayCache(replayCacheKey("p", "new"))).toBeNull(); // 次旧出局
    expect(loadReplayCache(KEY)).not.toBeNull();
  });

  test("QuotaExceeded：淘汰后重试一次成功", () => {
    saveReplayCache(replayCacheKey("p", "victim"), false, [line("u-v")]);
    // JSDOM 的 Storage 成员是 [LegacyUnforgeable]（实例 own non-configurable），
    // Object.defineProperty 拦不住 setItem——整体替换 globalThis.localStorage，
    // 其余方法手动代理到真 storage（spread 不拷原型方法）。
    const real = dom.window.localStorage;
    let threw = false;
    const original = globalThis.localStorage;
    globalThis.localStorage = stubStorage({
      setItem: (k, v) => {
        if (!threw) {
          threw = true;
          throw new DOMException("quota", "QuotaExceededError");
        }
        real.setItem(k, v);
      },
    });
    try {
      saveReplayCache(KEY, false, [line("u1")]);
      // 第一次 setItem throw → 重试路径：本轮总量未超限 evict 不动 victim，
      // 但 setItem 重试成功（threw 已置位放行）→ 写入生效。
      expect(loadReplayCache(KEY)).not.toBeNull();
    } finally {
      globalThis.localStorage = original;
    }
  });

  test("QuotaExceeded 且无可淘汰空间：静默放弃（不抛出）", () => {
    const original = globalThis.localStorage;
    globalThis.localStorage = stubStorage({
      setItem: () => {
        throw new DOMException("quota", "QuotaExceededError");
      },
    });
    try {
      expect(() => saveReplayCache(KEY, false, [line("u1")])).not.toThrow();
      expect(loadReplayCache(KEY)).toBeNull();
    } finally {
      globalThis.localStorage = original;
    }
  });
});
