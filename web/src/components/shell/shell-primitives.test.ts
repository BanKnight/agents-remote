import { describe, expect, test } from "bun:test";

import { listGroupClasses, listRowClasses } from "./shell-primitives";

describe("listGroupClasses", () => {
  test("plain 连续行：divide-y + neutral-line/40 separator", () => {
    const cls = listGroupClasses();
    expect(cls).toContain("divide-y");
    expect(cls).toContain("divide-neutral-line/40");
  });

  test("两端 plain：无圆角/边框/背景/margin/gap（纯贴边分隔，无响应式）", () => {
    const cls = listGroupClasses();
    expect(cls).not.toContain("rounded-xl");
    expect(cls).not.toContain("max-sm:");
    expect(cls).not.toContain("bg-surface-raised");
    expect(cls).not.toContain("mx-3");
    expect(cls).not.toContain("gap-");
  });

  test("className 透传", () => {
    expect(listGroupClasses("custom-group")).toContain("custom-group");
  });
});

describe("listRowClasses", () => {
  test("连续行骨架：px-3 py-2.5 + interactive-row，去圆角/独立背景", () => {
    const cls = listRowClasses();
    expect(cls).toContain("px-3");
    expect(cls).toContain("py-2.5");
    expect(cls).toContain("interactive-row");
    // 连续行共享 ListGroup 底，行本身不带圆角/独立 raised 背景
    expect(cls).not.toContain("rounded-xl");
    expect(cls).not.toContain("raised");
  });

  test("非 selected → 浅 hover 填充，无 selected 底色", () => {
    const cls = listRowClasses({ selected: false });
    expect(cls).toContain("hover:bg-on-surface/5");
    expect(cls).not.toContain("bg-primary/10");
  });

  test("selected → 纯 bg-primary/10，去 border（连续行 border 与 separator 打架）", () => {
    const cls = listRowClasses({ selected: true });
    expect(cls).toContain("bg-primary/10");
    expect(cls).not.toContain("border-primary");
    expect(cls).not.toContain("hover:bg-on-surface/5");
  });

  test("className 透传且不破坏 selected 分支", () => {
    const cls = listRowClasses({ selected: true, className: "extra-row" });
    expect(cls).toContain("extra-row");
    expect(cls).toContain("bg-primary/10");
  });
});
