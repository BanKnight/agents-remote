import { describe, expect, it } from "bun:test";

import { computeKeyboardInset } from "./keyboard-inset";

describe("computeKeyboardInset", () => {
  it("键盘在场：offset = innerHeight - vv.height - offsetTop", () => {
    // iPhone 竖屏典型值：layout 852，visual 499（键盘 ~353）
    expect(computeKeyboardInset(499, 0, 852)).toEqual({ visible: true, offsetPx: 353 });
  });

  it("offsetTop 参与计算（visual viewport 被 pan 时按差值扣减）", () => {
    expect(computeKeyboardInset(499, 20, 852)).toEqual({ visible: true, offsetPx: 333 });
  });

  it("键盘不在场：强制归零（绕 iOS 26 关键盘后 offset 残留）", () => {
    expect(computeKeyboardInset(852, 40, 852)).toEqual({ visible: false, offsetPx: 0 });
  });

  it("vv.height 与 innerHeight 相等 = 不可见（严格小于判定）", () => {
    expect(computeKeyboardInset(699, 0, 699).visible).toBe(false);
  });

  it("visible 门内负差值钳到 0（pinch-zoom 类异常环境不产生负 padding）", () => {
    // vv.height(850) < innerHeight(852) = visible，但 852-850-10 = -8 → max(0,-8)=0。
    expect(computeKeyboardInset(850, 10, 852)).toEqual({ visible: true, offsetPx: 0 });
  });
});
