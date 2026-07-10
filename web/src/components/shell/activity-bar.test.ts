import { describe, expect, test } from "bun:test";

import { activityBarButtonClasses } from "./activity-bar";

describe("activityBarButtonClasses", () => {
  test("基础：icon-only h-10 w-10 + rounded-md + 左边线占位（两态共享）", () => {
    const cls = activityBarButtonClasses(false);
    expect(cls).toContain("h-10 w-10");
    expect(cls).toContain("rounded-md");
    expect(cls).toContain("border-l-2");
    // active 态同样共享基础
    expect(activityBarButtonClasses(true)).toContain("border-l-2");
  });

  test("非 active：transparent 左边线占位 + on-surface-muted + hover 升 on-surface", () => {
    const cls = activityBarButtonClasses(false);
    expect(cls).toContain("border-transparent");
    expect(cls).toContain("text-on-surface-muted");
    expect(cls).toContain("hover:text-on-surface");
    expect(cls).toContain("hover:bg-on-surface/5");
    expect(cls).not.toContain("text-primary");
    expect(cls).not.toContain("border-primary");
  });

  test("active：VSCode 式左竖条 border-primary + text-primary（非 content 级 bg tint）", () => {
    const cls = activityBarButtonClasses(true);
    expect(cls).toContain("border-primary");
    expect(cls).toContain("text-primary");
    expect(cls).not.toContain("border-transparent");
    expect(cls).not.toContain("text-on-surface-muted");
    // 一级导航用「左边线 + 文字色」表达 active，不用 content 级 nav-item-active 的 bg-primary/10 tint
    expect(cls).not.toContain("bg-primary/10");
  });
});
