import { describe, expect, it } from "bun:test";
import {
  FILE_PREVIEW_UI_URI,
  HUB_UI_RESOURCES,
  MARKDOWN_LITE_UI_URI,
  WIKI_PAGE_UI_URI,
} from "./mcp-app-templates";

// 轻/重模板分流（2026-10-23）：markdown 轻变体 = 富卡去掉 mermaid 库,
// marked + DOMPurify 管线保留。宿主（web）按内容选变体,判定函数在
// web mcp-app-card.tsx 的 contentNeedsMermaid;这里守模板供给面。
describe("mcp-app-templates markdown lite", () => {
  const lite = HUB_UI_RESOURCES[MARKDOWN_LITE_UI_URI];
  const rich = HUB_UI_RESOURCES[WIKI_PAGE_UI_URI];

  it("markdown-lite uri is registered with the mcp-app mime type", () => {
    expect(lite).toBeDefined();
    expect(lite.mimeType).toBe("text/html;profile=mcp-app");
    expect(lite.html).toContain("<!doctype html>");
  });

  it("lite keeps the markdown pipeline (marked + DOMPurify) but no mermaid runtime", () => {
    expect(lite.html).toContain("renderBody");
    expect(lite.html).toContain("marked.parse");
    expect(lite.html).toContain("DOMPurify");
    // mermaid 库内联的唯一特征（esbuild bundle 导出桥,lite 恒缺）;
    // 模板自身的 upgradeMermaidBlocks 守卫函数在 lite 下按代码块渲染围栏。
    expect(lite.html).not.toContain("__esbuild_esm_mermaid_nm");
  });

  it("size split: lite <150KB, rich >1MB", () => {
    expect(lite.html.length).toBeLessThan(150_000);
    expect(rich.html.length).toBeGreaterThan(1_000_000);
  });

  it("lite serves both markdown kinds (inherited from rich spec)", () => {
    // kinds 守卫编进模板 JS:两 kind 的数据都能渲染（kindsGuard JSON 数组）。
    const guard = JSON.stringify(["wiki-page", "file-preview"]);
    expect(lite.html).toContain(guard);
    // 与富 uri 同 kind 面:wiki/file-preview 两资源仍存在且互不相同。
    expect(HUB_UI_RESOURCES[FILE_PREVIEW_UI_URI]).toBeDefined();
    expect(rich.html).not.toBe(lite.html);
  });
});
