import { expect, test } from "bun:test";
import { sanitizePersistedModel } from "./model-id";

test("sanitizePersistedModel passes bare aliases / concrete ids / [1m] variants unchanged", () => {
  expect(sanitizePersistedModel("opus")).toBe("opus");
  expect(sanitizePersistedModel("opusplan")).toBe("opusplan");
  expect(sanitizePersistedModel("sonnet")).toBe("sonnet");
  expect(sanitizePersistedModel("claude-opus-4-8")).toBe("claude-opus-4-8");
  expect(sanitizePersistedModel("claude-haiku-4-5-20251001")).toBe("claude-haiku-4-5-20251001");
  expect(sanitizePersistedModel("claude-sonnet-4-6[1m]")).toBe("claude-sonnet-4-6[1m]");
  expect(sanitizePersistedModel(" glm-5.3-flash ")).toBe("glm-5.3-flash");
});

test("sanitizePersistedModel unwraps markdown code span + (resolved) annotation", () => {
  // CLI modelDisplayString 实测形状（2026-10-01 回归的一手证据）。
  expect(sanitizePersistedModel("`opus[1m] (claude-opus-4-8[1m])`")).toBe("opus[1m]");
  expect(sanitizePersistedModel("`opus (claude-opus-4-8)`")).toBe("opus");
  expect(sanitizePersistedModel("opusplan (claude-sonnet-4-6)")).toBe("opusplan");
  expect(sanitizePersistedModel("haiku (claude-haiku-4-5-20251001)")).toBe("haiku");
});

test("sanitizePersistedModel rejects non-model display strings", () => {
  // /model 帮助占位（无实际模型名）
  expect(sanitizePersistedModel("(id)")).toBeUndefined();
  // 「saved as your default」长尾文案：剥 code span 后剩文案尾巴，不合法。
  expect(
    sanitizePersistedModel("`Opus 5 (1M context)` and saved as your default for new sessions"),
  ).toBeUndefined();
  // ANSI 样式文本（ 转义字符在字符集外）。
  expect(sanitizePersistedModel("[1mOpus in plan mode, else Sonnet[22m")).toBeUndefined();
});

test("sanitizePersistedModel returns undefined for empty/absent input", () => {
  expect(sanitizePersistedModel(undefined)).toBeUndefined();
  expect(sanitizePersistedModel("")).toBeUndefined();
  expect(sanitizePersistedModel("   ")).toBeUndefined();
});
