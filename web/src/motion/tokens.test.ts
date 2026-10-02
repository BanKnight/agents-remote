import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { DURATION, EASE } from "./tokens";

// motion/tokens.ts 是 CSS 侧 --ease-*/--duration-* 的 JS 镜像（styles/index.css :34
// 注释约定）。两处手工同步必然漂移，此单测直接解析 CSS 源码对值——改 CSS 不改 TS
//（或反之）这里立刻红。

const css = readFileSync(join(import.meta.dir, "../styles/index.css"), "utf8");

function cssVar(name: string): string {
  const m = css.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!m) throw new Error(`--${name} not found in index.css`);
  return m[1].trim();
}

describe("motion tokens mirror CSS vars", () => {
  test("EASE.standard == --ease-standard", () => {
    const raw = cssVar("ease-standard"); // cubic-bezier(0.4, 0, 0.2, 1)
    const nums = raw
      .replace("cubic-bezier(", "")
      .replace(")", "")
      .split(",")
      .map((s) => Number.parseFloat(s.trim()));
    expect(nums).toEqual([...EASE.standard]);
  });

  test("EASE.emphasized == --ease-emphasized", () => {
    const raw = cssVar("ease-emphasized");
    const nums = raw
      .replace("cubic-bezier(", "")
      .replace(")", "")
      .split(",")
      .map((s) => Number.parseFloat(s.trim()));
    expect(nums).toEqual([...EASE.emphasized]);
  });

  test("EASE.exit == --ease-exit", () => {
    const raw = cssVar("ease-exit");
    const nums = raw
      .replace("cubic-bezier(", "")
      .replace(")", "")
      .split(",")
      .map((s) => Number.parseFloat(s.trim()));
    expect(nums).toEqual([...EASE.exit]);
  });

  test("DURATION == --duration-* (ms → s)", () => {
    expect(DURATION.fast).toBe(Number.parseFloat(cssVar("duration-fast")) / 1000);
    expect(DURATION.base).toBe(Number.parseFloat(cssVar("duration-base")) / 1000);
    expect(DURATION.slow).toBe(Number.parseFloat(cssVar("duration-slow")) / 1000);
  });
});

describe("spring timing tokens（批B 弹层 spring）", () => {
  test("--spring-standard 是 linear() 弹簧采样且 --spring-snappy 纯引用它", () => {
    const standard = cssVar("spring-standard");
    expect(standard.startsWith("linear(")).toBe(true);
    // 临界阻尼首采样点（response=0.35s 手算）：曲线本体被误改/误删在此暴露。
    expect(standard).toContain("0.0802 5%");
    expect(cssVar("spring-snappy")).toBe("var(--spring-standard)");
  });
});
