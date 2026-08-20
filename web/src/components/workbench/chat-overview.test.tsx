import { describe, expect, test } from "bun:test";

import type { ChatSession } from "../../api/client";
import { formatRelativeTime, groupChatSessions } from "./chat-overview";

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

// 构造一条最小 ChatSession（其余字段用固定默认填充）。
function mk(id: string, overrides: Partial<ChatSession> = {}): ChatSession {
  return {
    id,
    displayName: `会话 ${id}`,
    status: "active",
    createdAt: new Date(NOW).toISOString(),
    updatedAt: new Date(NOW).toISOString(),
    ...overrides,
  };
}

describe("groupChatSessions", () => {
  test("pinned 优先进置顶组（未归档）", () => {
    const a = mk("a", { pinned: true, updatedAt: iso(10) });
    const b = mk("b", { updatedAt: iso(1) });
    const { pinned, active, archived } = groupChatSessions([b, a]);
    expect(pinned.map((s) => s.id)).toEqual(["a"]);
    expect(active.map((s) => s.id)).toEqual(["b"]);
    expect(archived).toEqual([]);
  });

  test("active 按 updatedAt 降序（最近在前）", () => {
    const a = mk("a", { updatedAt: iso(5) });
    const b = mk("b", { updatedAt: iso(50) });
    const c = mk("c", { updatedAt: iso(1) });
    const { active } = groupChatSessions([a, b, c]);
    expect(active.map((s) => s.id)).toEqual(["c", "a", "b"]);
  });

  test("pinned 组同样按 updatedAt 降序", () => {
    const a = mk("a", { pinned: true, updatedAt: iso(1) });
    const b = mk("b", { pinned: true, updatedAt: iso(99) });
    const { pinned } = groupChatSessions([a, b]);
    expect(pinned.map((s) => s.id)).toEqual(["a", "b"]);
  });

  test("archived 进归档组（含被置顶的），按 archivedAt 降序", () => {
    const a = mk("a", { pinned: true, archivedAt: iso(8) });
    const b = mk("b", { archivedAt: iso(3) });
    const c = mk("c", { archivedAt: iso(20) });
    const { pinned, active, archived } = groupChatSessions([a, b, c]);
    expect(pinned).toEqual([]);
    expect(active).toEqual([]);
    expect(archived.map((s) => s.id)).toEqual(["b", "a", "c"]);
  });

  test("活跃置顶与归档混合", () => {
    const pin = mk("pin", { pinned: true, updatedAt: iso(2) });
    const act = mk("act", { updatedAt: iso(1) });
    const arc = mk("arc", { archivedAt: iso(5) });
    const { pinned, active, archived } = groupChatSessions([pin, act, arc]);
    expect(pinned.map((s) => s.id)).toEqual(["pin"]);
    expect(active.map((s) => s.id)).toEqual(["act"]);
    expect(archived.map((s) => s.id)).toEqual(["arc"]);
  });

  test("全空（旧 JSON 无 pinned/archivedAt）按 updatedAt 降序进 active", () => {
    const a = mk("a", { updatedAt: iso(3) });
    const b = mk("b", { updatedAt: iso(7) });
    const { pinned, active, archived } = groupChatSessions([a, b]);
    expect(pinned).toEqual([]);
    expect(archived).toEqual([]);
    expect(active.map((s) => s.id)).toEqual(["a", "b"]);
  });
});
