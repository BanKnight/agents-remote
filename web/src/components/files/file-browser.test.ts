import { describe, expect, test } from "bun:test";
import {
  defaultRenderMode,
  joinRootBrowseDirectoryPath,
  resolveRootBrowseTarget,
} from "./file-browser";

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

describe("joinRootBrowseDirectoryPath", () => {
  test("项目层 → 拼 projectName 前缀（项目根相对 entry.path）", () => {
    const target = { kind: "project", projectName: "lang-partner", relativePath: "" } as const;
    expect(joinRootBrowseDirectoryPath(target, "apps")).toBe("lang-partner/apps");
    expect(joinRootBrowseDirectoryPath(target, "apps/web")).toBe("lang-partner/apps/web");
  });

  test("根层 → entry.path 即项目名，原样返回", () => {
    expect(joinRootBrowseDirectoryPath({ kind: "root" }, "lang-partner")).toBe("lang-partner");
  });

  test("非 rootBrowse（target=null）→ 原样返回", () => {
    expect(joinRootBrowseDirectoryPath(null, "apps")).toBe("apps");
  });

  test("逆运算不变式：join → resolve 还原 projectName + relativePath", () => {
    const target = { kind: "project", projectName: "lang-partner", relativePath: "" } as const;
    const joined = joinRootBrowseDirectoryPath(target, "apps/web");
    expect(resolveRootBrowseTarget(joined)).toEqual({
      kind: "project",
      projectName: "lang-partner",
      relativePath: "apps/web",
    });
  });
});
