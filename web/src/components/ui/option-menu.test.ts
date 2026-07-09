import { describe, expect, test } from "bun:test";

import { mobileOptionItemClasses, optionActiveClasses } from "./option-menu";

describe("optionActiveClasses", () => {
  test("user accent → user 角色色（claude2 model）", () => {
    const cls = optionActiveClasses("user");
    expect(cls).toContain("text-user");
    expect(cls).toContain("bg-user/10");
    expect(cls).not.toContain("permission");
  });

  test("permission accent → permission 角色色（claude2 mode）", () => {
    const cls = optionActiveClasses("permission");
    expect(cls).toContain("text-permission");
    expect(cls).toContain("bg-permission/10");
    expect(cls).not.toContain("text-user");
  });

  test("缺省参数 = 显式 user", () => {
    expect(optionActiveClasses()).toBe(optionActiveClasses("user"));
  });
});

describe("mobileOptionItemClasses", () => {
  test("共用骨架：全宽 48px 触摸区 + size-4 icon + font-semibold", () => {
    const cls = mobileOptionItemClasses(false, "user");
    expect(cls).toContain("w-full");
    expect(cls).toContain("min-h-[48px]");
    expect(cls).toContain("text-sm");
    expect(cls).toContain("font-semibold");
    expect(cls).toContain("[&_svg:not([class*='size-'])]:size-4");
  });

  test("非 active → on-surface-soft 文字 + on-surface active", () => {
    const cls = mobileOptionItemClasses(false, "user");
    expect(cls).toContain("text-on-surface-soft");
    expect(cls).toContain("active:bg-on-surface/5");
    expect(cls).not.toContain("bg-user/10");
    expect(cls).not.toContain("opacity-100");
  });

  test("active + user accent → user 角色色淡背景 + opacity-100（disabled 不变暗）", () => {
    const cls = mobileOptionItemClasses(true, "user");
    expect(cls).toContain("text-user");
    expect(cls).toContain("bg-user/10");
    expect(cls).toContain("opacity-100");
    expect(cls).not.toContain("text-on-surface-soft");
  });

  test("active + permission accent → permission 角色色", () => {
    const cls = mobileOptionItemClasses(true, "permission");
    expect(cls).toContain("text-permission");
    expect(cls).toContain("bg-permission/10");
    expect(cls).toContain("opacity-100");
  });

  test("缺省 accent = 显式 user", () => {
    expect(mobileOptionItemClasses(false)).toBe(mobileOptionItemClasses(false, "user"));
    expect(mobileOptionItemClasses(true)).toBe(mobileOptionItemClasses(true, "user"));
  });
});
