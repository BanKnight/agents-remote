import { expect, test } from "bun:test";
import { resolveCurrentModelAlias, modelDisplayLabel } from "./model-labels";

const RESOLVED = {
  opus: "claude-opus-4-8[1m]",
  sonnet: "claude-sonnet-5",
  haiku: "claude-haiku-4-5-20251001",
};

test("resolveCurrentModelAlias passes clean alias / concrete id unchanged", () => {
  expect(resolveCurrentModelAlias("opus", RESOLVED)).toBe("opus");
  // 具体 ID 反查 value → alias（system.init/seed_init 回填路径）。
  expect(resolveCurrentModelAlias("claude-sonnet-5", RESOLVED)).toBe("sonnet");
  // 未知值原样保留（老数据兜底语义不变）。
  expect(resolveCurrentModelAlias("glm-5.3-flash", RESOLVED)).toBe("glm-5.3-flash");
  expect(resolveCurrentModelAlias(undefined, RESOLVED)).toBeUndefined();
});

test("resolveCurrentModelAlias unwraps legacy code-span dirty frame via resolved lookup", () => {
  // 2026-10-01 回归的存量脏帧（relay 缓冲/历史 JSONL）——剥 code span + (resolved) 注解
  // 后反查 resolved 映射 value 命中 opus。
  expect(resolveCurrentModelAlias("`opus[1m] (claude-opus-4-8[1m])`", RESOLVED)).toBe("opus[1m]");
  // 不带 [1m] 的 key 同样命中。
  expect(resolveCurrentModelAlias("`opus (claude-opus-4-8)`", RESOLVED)).toBe("opus");
});

test("resolveCurrentModelAlias drops dirty frame that cannot map to a known alias", () => {
  // 剥不出已注册 model（文案尾巴 / 未知显示串）→ undefined，触发调用方 fallback 链。
  expect(
    resolveCurrentModelAlias("`Opus 5 (1M context)` and saved as your default", RESOLVED),
  ).toBeUndefined();
  expect(resolveCurrentModelAlias("(id)", RESOLVED)).toBeUndefined();
});

test("modelDisplayLabel strips [1m] suffix to friendly label", () => {
  expect(modelDisplayLabel("opus[1m]")).toBe("Opus [1m]");
  expect(modelDisplayLabel("opusplan")).toBe("Opus Plan");
  expect(modelDisplayLabel("claude-opus-4-8")).toBe("claude-opus-4-8");
});
