import { describe, expect, test } from "bun:test";

import type { ChatSession } from "../../api/client";
import type { TranslateFn } from "../../i18n/types";
import { groupChatSessions } from "./chat-overview";
import { relativeTime } from "./history-list";

const NOW = new Date("2026-08-18T12:00:00Z").getTime();
// relativeTime 内部取 Date.now() 做差——iso 必须相对当前时间构造偏移（固定基准日会随
// 日历漂移落错档位）。
const iso = (offsetMin: number) => new Date(Date.now() - offsetMin * 60000).toISOString();

// relativeTime 单源（history-list）后替 formatRelativeTime 的档位测试：stub t 直出
// key+count，验证档位判断与参数透传（文案本身由 i18n 资源保证）。
const stubT = ((key: string, params?: Record<string, string | number>) =>
  params?.count === undefined ? key : `${key}:${params.count}`) as unknown as TranslateFn;

describe("relativeTime", () => {
  test("刚刚：<1 分钟", () => {
    expect(relativeTime(iso(0), stubT)).toBe("time.justNow");
  });

  test("分钟：<60 分钟", () => {
    expect(relativeTime(iso(1), stubT)).toBe("time.minutesAgo:1");
    expect(relativeTime(iso(59), stubT)).toBe("time.minutesAgo:59");
  });

  test("小时：<24 小时", () => {
    expect(relativeTime(iso(60), stubT)).toBe("time.hoursAgo:1");
    expect(relativeTime(iso(23 * 60), stubT)).toBe("time.hoursAgo:23");
  });

  test("天：<7 天", () => {
    expect(relativeTime(iso(24 * 60), stubT)).toBe("time.daysAgo:1");
    expect(relativeTime(iso(6 * 24 * 60), stubT)).toBe("time.daysAgo:6");
  });

  test("非法输入返回空串", () => {
    expect(relativeTime("not-a-date", stubT)).toBe("");
    expect(relativeTime("", stubT)).toBe("");
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
