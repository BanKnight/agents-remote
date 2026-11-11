// push-notification.ts 单测（2026-11-11 根治批 A 段）。核心契约：
// ① 每推必显——任何输入（含 null/坏帧/形状残缺）都返回可显示内容（title/body 恒非空），
//    SW 侧不再有「不出通知就 return」的路径（WebKit 静默推送惩罚的根因）。
// ② 合法帧原样呈现：tag=sessionId（同会话顶卡）、data=payload（notificationclick 深链）。
// ③ 前台（foregrounded）只在 true 时附 silent:true（桌面静音增强；iOS 忽略该属性无害）。
import { describe, expect, test } from "bun:test";

import {
  buildPushNotification,
  isPushPayload,
  PUSH_FALLBACK_BODY,
  PUSH_FALLBACK_TITLE,
} from "./push-notification";

const validPayload = {
  kind: "done",
  title: "proj · 会话",
  body: "任务已完成",
  url: "/projects/proj/session/s1",
  sessionId: "s1",
};

describe("isPushPayload", () => {
  test("合法帧通过", () => {
    expect(isPushPayload(validPayload)).toBe(true);
  });

  test("边界：null / undefined / 非对象 / 数组", () => {
    expect(isPushPayload(null)).toBe(false);
    expect(isPushPayload(undefined)).toBe(false);
    expect(isPushPayload("text")).toBe(false);
    expect(isPushPayload(42)).toBe(false);
    expect(isPushPayload([])).toBe(false);
  });

  test("字段残缺或类型错误不通过（五字段全 string 才行）", () => {
    expect(isPushPayload({ ...validPayload, kind: 1 })).toBe(false);
    expect(isPushPayload({ ...validPayload, title: undefined })).toBe(false);
    expect(isPushPayload({ ...validPayload, body: null })).toBe(false);
    expect(isPushPayload({ ...validPayload, url: {} })).toBe(false);
    const { sessionId: _dropped, ...withoutSession } = validPayload;
    expect(isPushPayload(withoutSession)).toBe(false);
  });
});

describe("buildPushNotification", () => {
  test("合法帧 + 后台：title/body 原样、tag=sessionId、data=payload、无 silent", () => {
    const { title, options } = buildPushNotification(validPayload, false);
    expect(title).toBe("proj · 会话");
    expect(options.body).toBe("任务已完成");
    expect(options.tag).toBe("s1");
    expect(options.data).toEqual(validPayload);
    expect("silent" in options).toBe(false);
  });

  test("合法帧 + 前台：附 silent:true（桌面静音增强）", () => {
    const { options } = buildPushNotification(validPayload, true);
    expect(options.silent).toBe(true);
    // 其余字段不受 foregrounded 影响。
    expect(options.tag).toBe("s1");
    expect(options.data).toEqual(validPayload);
  });

  test("坏帧：兜底文案 + 固定 tag + 无 data（click 落 " / "）", () => {
    for (const bad of [null, "junk", { kind: "done" }, 123]) {
      const { title, options } = buildPushNotification(bad, false);
      expect(title).toBe(PUSH_FALLBACK_TITLE);
      expect(options.body).toBe(PUSH_FALLBACK_BODY);
      expect(options.tag).toBe("push-fallback");
      expect("data" in options).toBe(false);
    }
  });

  test("永不为空契约：title/body 恒非空字符串（任何输入）", () => {
    const inputs: unknown[] = [
      null,
      undefined,
      "",
      0,
      { kind: "", title: "", body: "", url: "", sessionId: "" },
    ];
    for (const input of inputs) {
      const { title, options } = buildPushNotification(input, false);
      expect(title.length).toBeGreaterThan(0);
      expect((options.body ?? "").length).toBeGreaterThan(0);
    }
  });

  test("tag 语义：不同 sessionId 不同 tag（不互相顶卡）", () => {
    const a = buildPushNotification(validPayload, false);
    const b = buildPushNotification({ ...validPayload, sessionId: "s2" }, false);
    expect(a.options.tag).not.toBe(b.options.tag);
  });
});
