import { describe, expect, test } from "bun:test";

import { formatRelativeTime } from "./chat-overview";

const NOW = new Date("2026-08-18T12:00:00Z").getTime();
const iso = (offsetMin: number) => new Date(NOW - offsetMin * 60000).toISOString();

describe("formatRelativeTime", () => {
  test("刚刚：<1 分钟", () => {
    expect(formatRelativeTime(iso(0), NOW)).toBe("刚刚");
    expect(formatRelativeTime(iso(0.5), NOW)).toBe("刚刚");
  });

  test("分钟：<60 分钟", () => {
    expect(formatRelativeTime(iso(1), NOW)).toBe("1分钟前");
    expect(formatRelativeTime(iso(59), NOW)).toBe("59分钟前");
  });

  test("小时：<24 小时", () => {
    expect(formatRelativeTime(iso(60), NOW)).toBe("1小时前");
    expect(formatRelativeTime(iso(23 * 60), NOW)).toBe("23小时前");
  });

  test("天：昨天 / N天前（<7 天）", () => {
    expect(formatRelativeTime(iso(24 * 60), NOW)).toBe("昨天");
    expect(formatRelativeTime(iso(3 * 24 * 60), NOW)).toBe("3天前");
    expect(formatRelativeTime(iso(6 * 24 * 60), NOW)).toBe("6天前");
  });

  test("≥7 天：月日格式", () => {
    expect(formatRelativeTime(iso(7 * 24 * 60), NOW)).toBe("8月11日");
  });

  test("非法输入返回空串", () => {
    expect(formatRelativeTime("not-a-date", NOW)).toBe("");
  });
});
