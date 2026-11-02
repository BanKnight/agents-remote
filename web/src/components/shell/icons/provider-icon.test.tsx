// @vitest-environment jsdom

import { afterEach, beforeEach, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { JSDOM } from "jsdom";
import type { AgentProvider } from "@agents-remote/shared";
import { BRAND_ICONS_SVG, type ProviderIconName } from "../../../assets/brand-icons";
import { ProviderIcon } from "./provider-icon";

// bun:test 的 afterEach 不是裸全局，RTL auto-cleanup 不注册（同 composer-draft.test）。
afterEach(() => cleanup());

beforeEach(() => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
  globalThis.window = dom.window as unknown as Window & typeof globalThis;
  globalThis.document = dom.window.document as unknown as Document;
});

/** 生成物键完整性：brand-icons.ts 三键与 ProviderIconName union 一致（新 provider 注册漏改即红）。 */
test("BRAND_ICONS_SVG 键集 = ProviderIconName union（claude/codex/omp）", () => {
  const keys = Object.keys(BRAND_ICONS_SVG) as ProviderIconName[];
  expect(keys.sort()).toEqual(["claude", "codex", "omp"]);
  for (const key of keys) {
    const icon = BRAND_ICONS_SVG[key];
    expect(icon.viewBox).toBe("0 0 24 24");
    expect(icon.body.length).toBeGreaterThan(0);
  }
});

/** 三 provider 渲染：锚点属性 + svg 在场 + 显式尺寸（容器 span 定尺寸、svg size-full）。 */
test("ProviderIcon 渲染三 provider 品牌 svg", () => {
  const providers: AgentProvider[] = ["claude", "codex", "omp"];
  for (const provider of providers) {
    const { container, unmount } = render(<ProviderIcon provider={provider} />);
    const span = container.querySelector(`[data-provider-icon="${provider}"]`);
    expect(span).not.toBeNull();
    const svg = span?.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(svg?.getAttribute("class")).toBe("size-full");
    // inline style 防御：压过容器层 .dicon svg/.tile svg 等 fill:none+stroke 规则
    //（presentation attribute 会被 CSS 压掉，见 build-icons.mjs 第二段注释）。
    expect(svg?.getAttribute("style")).toContain("stroke:none");
    unmount();
  }
});

/** 彩色件（claude/codex）：品牌 fill 落 path（非 currentColor，不吃容器染色）；omp 单色件
 *  fill:currentColor 走 inline style + span 染 warning。 */
test("claude/codex 彩色 path fill 与 omp 染色", () => {
  const claude = render(<ProviderIcon provider="claude" />);
  const claudePath = claude.container.querySelector('[data-provider-icon="claude"] path');
  expect(claudePath?.getAttribute("fill")).toBe("#D97757");
  claude.unmount();

  const codex = render(<ProviderIcon provider="codex" />);
  const codexSvg = codex.container.querySelector('[data-provider-icon="codex"] svg');
  // codex：白底方块 + 渐变前景（品牌原样）
  const codexFills = [...codexSvg!.querySelectorAll("path")].map((p) => p.getAttribute("fill"));
  expect(codexFills).toContain("#fff");
  expect(codexFills.join(" ")).toContain("url(#lobe-icons-codex");
  codex.unmount();

  const omp = render(<ProviderIcon provider="omp" />);
  const ompSpan = omp.container.querySelector('[data-provider-icon="omp"]');
  expect(ompSpan?.getAttribute("class")).toContain("text-warning");
  const ompSvg = ompSpan?.querySelector("svg");
  expect(ompSvg?.getAttribute("style")).toContain("fill:currentColor");
});
