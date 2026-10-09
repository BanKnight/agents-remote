import { describe, expect, test } from "bun:test";

import { PINNED_COLOR_SLOTS, pickPinnedColors } from "./pinned-sessions-bar";

describe("pickPinnedColors", () => {
  test("同一 id 分配稳定（unpin/再 pin 颜色不变）", () => {
    const first = pickPinnedColors(["session-a"]).get("session-a");
    expect(first).toBeDefined();
    // 集合变化（他会话进出，无撞色）不影响本会话颜色
    const withMore = pickPinnedColors(["session-b", "session-a"]).get("session-a");
    expect(withMore).toBe(first);
    expect(pickPinnedColors(["session-b", "session-a"]).get("session-b")).toBeDefined();
  });

  test("撞色顺延：集合内颜色两两不同", () => {
    const ids = Array.from({ length: PINNED_COLOR_SLOTS }, (_, i) => `session-${i}`);
    const colors = pickPinnedColors(ids);
    const slots = ids.map((id) => colors.get(id));
    expect(new Set(slots).size).toBe(PINNED_COLOR_SLOTS);
  });

  test("确定性：同输入同输出", () => {
    const ids = ["s1", "s2", "s3"];
    const a = pickPinnedColors(ids);
    expect(pickPinnedColors([...ids])).toEqual(a);
    // 顺序反转是不同输入，分配可不同，但仍是有效映射（1-8）
    const reversed = pickPinnedColors([...ids].reverse());
    for (const id of ids) {
      const slot = reversed.get(id);
      expect(slot).toBeGreaterThanOrEqual(1);
      expect(slot).toBeLessThanOrEqual(PINNED_COLOR_SLOTS);
    }
  });

  test(">8 置顶（超出 spec 建议上限）：全满时保持哈希色不崩溃", () => {
    const ids = Array.from({ length: PINNED_COLOR_SLOTS + 2 }, (_, i) => `extra-${i}`);
    const colors = pickPinnedColors(ids);
    expect(colors.size).toBe(PINNED_COLOR_SLOTS + 2);
    // 前 8 个两两不同；溢出的保持哈希色（可能与他人重复，可接受）
    const first8 = ids.slice(0, PINNED_COLOR_SLOTS).map((id) => colors.get(id));
    expect(new Set(first8).size).toBe(PINNED_COLOR_SLOTS);
  });
});
