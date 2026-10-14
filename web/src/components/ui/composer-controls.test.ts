import { describe, expect, test } from "bun:test";
import { contextUsageLevel, formatContextTokens } from "./composer-controls";

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

// 三档阈值契约（spec 4.1-3 拍板：≤70 正常 / >70 警告 / >85 危险）。档位驱动
// .iicn/.ipill usage 变体与浮层的三档变色（CSS 语义 token 映射）。
describe("contextUsageLevel", () => {
  test("≤70% ok", () => {
    expect(contextUsageLevel(0)).toBe("ok");
    expect(contextUsageLevel(15.7)).toBe("ok");
    expect(contextUsageLevel(70)).toBe("ok");
  });

  test(">70% 且 ≤85% warn", () => {
    expect(contextUsageLevel(70.1)).toBe("warn");
    expect(contextUsageLevel(85)).toBe("warn");
  });

  test(">85% danger", () => {
    expect(contextUsageLevel(85.1)).toBe("danger");
    expect(contextUsageLevel(100)).toBe("danger");
  });
});
