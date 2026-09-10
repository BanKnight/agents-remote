import { describe, expect, test } from "bun:test";
import {
  IMG_TAG_RE,
  defaultRenderMode,
  joinRootBrowseDirectoryPath,
  localAssetProjectPath,
  resolveRootBrowseTarget,
  rewriteImgSrc,
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

describe("localAssetProjectPath", () => {
  test("相对引用 → 拼上文档所在目录（./ 前缀剥掉）", () => {
    expect(localAssetProjectPath("", "diagram.svg")).toBe("diagram.svg");
    expect(localAssetProjectPath("assets/", "diagram.svg")).toBe("assets/diagram.svg");
    expect(localAssetProjectPath("assets/", "./diagram.svg")).toBe("assets/diagram.svg");
  });

  test("外链 / 协议相对 / data: / 锚点 / 空 → null（非本地文件）", () => {
    expect(localAssetProjectPath("assets/", "https://cdn.example/x.svg")).toBeNull();
    expect(localAssetProjectPath("assets/", "http://cdn.example/x.svg")).toBeNull();
    expect(localAssetProjectPath("assets/", "//cdn.example/x.svg")).toBeNull();
    expect(localAssetProjectPath("assets/", "data:image/png;base64,AAAA")).toBeNull();
    expect(localAssetProjectPath("assets/", "#top")).toBeNull();
    expect(localAssetProjectPath("assets/", "")).toBeNull();
  });
});

describe("IMG_TAG_RE", () => {
  test("提取 img src 值（属性顺序无关、大小写不敏感、自闭合）", () => {
    const html = `<html><body>
      <img alt="a" src="a.svg" width="10">
      <IMG SRC="B.PNG">
      <img class="x" src='c.png'/>
      <img src="https://ext.example/d.png">
    </body></html>`;
    const srcs = [...html.matchAll(IMG_TAG_RE)].map((m) => m[1] ?? "");
    expect(srcs).toEqual(["a.svg", "B.PNG", "c.png", "https://ext.example/d.png"]);
  });

  test("data-src 的 src 段不被误当 src 属性", () => {
    const html = `<img data-src="decoy" src="real.png">`;
    expect([...html.matchAll(IMG_TAG_RE)].map((m) => m[1] ?? "")).toEqual(["real.png"]);
  });
});

describe("rewriteImgSrc", () => {
  test("src 属性值替换为 dataUrl，其余属性保留（单双引号均可）", () => {
    expect(
      rewriteImgSrc(`<img alt="a" src="a.svg" width="10">`, "data:image/svg+xml;base64,AA=="),
    ).toBe(`<img alt="a" src="data:image/svg+xml;base64,AA==" width="10">`);
    expect(rewriteImgSrc(`<img src='a.png'>`, "data:image/png;base64,AA==")).toBe(
      `<img src="data:image/png;base64,AA==">`,
    );
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
