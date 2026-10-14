import { describe, expect, test } from "bun:test";
import { formatContextTokens } from "./composer-controls";

// 上下文占用标量的显示格式纯函数（统一会话标量管道显示端）。标量折算/回放恢复
// 属 applyMessageScalarState（hook 内 useState），由 normalizeChatStream scalar-only
// 用例与探针覆盖；此处锁显示格式契约。
describe("formatContextTokens", () => {
  test("<1k 原值", () => {
    expect(formatContextTokens(0)).toBe("0");
    expect(formatContextTokens(999)).toBe("999");
  });

  test("<100k 一位小数 k", () => {
    expect(formatContextTokens(1000)).toBe("1.0k");
    expect(formatContextTokens(12840)).toBe("12.8k");
    expect(formatContextTokens(99999)).toBe("100.0k");
  });

  test("<1M 整数 k（去小数噪音）", () => {
    expect(formatContextTokens(100000)).toBe("100k");
    expect(formatContextTokens(128400)).toBe("128k");
    expect(formatContextTokens(999999)).toBe("1000k");
  });

  test("≥1M 一位小数 M", () => {
    expect(formatContextTokens(1000000)).toBe("1.0M");
    expect(formatContextTokens(1536000)).toBe("1.5M");
  });
});
