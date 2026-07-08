import { describe, expect, test } from "bun:test";

import { mobileSheetItemClasses } from "./action-menu";

describe("mobileSheetItemClasses", () => {
  test("共用骨架：全宽 48px 触摸区 + size-4 icon + font-semibold", () => {
    const cls = mobileSheetItemClasses("default");
    expect(cls).toContain("w-full");
    expect(cls).toContain("min-h-[48px]");
    expect(cls).toContain("text-sm");
    expect(cls).toContain("font-semibold");
    // icon 统一 size-4（仅当 svg 未自带 size class）
    expect(cls).toContain("[&_svg:not([class*='size-'])]:size-4");
  });

  test("default 变体 → on-surface-soft 文字 + on-surface active", () => {
    const cls = mobileSheetItemClasses("default");
    expect(cls).toContain("text-on-surface-soft");
    expect(cls).toContain("active:bg-on-surface/5");
    expect(cls).not.toContain("text-error");
  });

  test("destructive 变体 → error 文字 + error active", () => {
    const cls = mobileSheetItemClasses("destructive");
    expect(cls).toContain("text-error");
    expect(cls).toContain("active:bg-error/10");
    expect(cls).not.toContain("text-on-surface-soft");
  });

  test("缺省参数 = 显式 default", () => {
    expect(mobileSheetItemClasses()).toBe(mobileSheetItemClasses("default"));
  });
});
