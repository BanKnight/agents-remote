import { describe, expect, test } from "bun:test";
import { defaultRenderMode, resolveRootBrowseTarget } from "./file-browser";

describe("defaultRenderMode", () => {
  test("markdown / html default to render", () => {
    expect(defaultRenderMode("README.md")).toBe("render");
    expect(defaultRenderMode("page.html")).toBe("render");
    expect(defaultRenderMode("legacy.htm")).toBe("render");
  });

  test("code and unknown files default to source", () => {
    expect(defaultRenderMode("app.tsx")).toBe("source");
    expect(defaultRenderMode("main.py")).toBe("source");
    expect(defaultRenderMode("config.json")).toBe("source");
    expect(defaultRenderMode("Makefile")).toBe("source");
  });
});

describe("resolveRootBrowseTarget", () => {
  test("空路径 → root listing", () => {
    expect(resolveRootBrowseTarget("")).toEqual({ kind: "root" });
    expect(resolveRootBrowseTarget("   ")).toEqual({ kind: "root" });
  });

  test("单段 → 该段为 projectName，relativePath 空", () => {
    expect(resolveRootBrowseTarget("lang-partner")).toEqual({
      kind: "project",
      projectName: "lang-partner",
      relativePath: "",
    });
  });

  test("多段 → 第一段 projectName，剩余 relativePath", () => {
    expect(resolveRootBrowseTarget("lang-partner/src/components")).toEqual({
      kind: "project",
      projectName: "lang-partner",
      relativePath: "src/components",
    });
  });
});
