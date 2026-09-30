import { describe, expect, test } from "bun:test";
import type { ProjectFilePreviewResponse } from "@agents-remote/shared";
import {
  INLINE_NESTED_HTML_MAX_DEPTH,
  IMG_TAG_RE,
  inlineLocalHtmlAssets,
  joinRootBrowseDirectoryPath,
  localAssetProjectPath,
  resolveRootBrowseTarget,
  rewriteImgSrc,
  rewriteIframeSrcdoc,
} from "./file-browser";
import { defaultRenderMode } from "./use-file-editor";

// inlineLocalHtmlAssets 的 fetchPreview 注入：path → 响应 map，miss 抛 404。
function fakeFetcher(map: Record<string, Partial<ProjectFilePreviewResponse>>) {
  return async (_projectName: string, path: string): Promise<ProjectFilePreviewResponse> => {
    const hit = map[path];
    if (!hit) throw new Error(`404 ${path}`);
    return {
      projectName: "proj",
      path,
      name: path.split("/").pop() ?? path,
      size: 0,
      ...hit,
    } as ProjectFilePreviewResponse;
  };
}

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

describe("rewriteIframeSrcdoc", () => {
  test("src 属性替换为 srcdoc，& 与 &quot; 转义后放进双引号属性", () => {
    expect(rewriteIframeSrcdoc(`<iframe src="chart.html" width="600">`, `<p>a &amp; "b"</p>`)).toBe(
      `<iframe srcdoc="<p>a &amp;amp; &quot;b&quot;</p>" width="600">`,
    );
  });
});

describe("inlineLocalHtmlAssets", () => {
  const SVG =
    "data:image/svg+xml;base64," +
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"/>').toString(
      "base64",
    );

  test("iframe 指向本地 html → 递归内联后整体转 srcdoc（嵌套文档 img/css 按其自身目录解析）", async () => {
    const html = await inlineLocalHtmlAssets(`<iframe src="charts/chart.html"></iframe>`, {
      dir: "",
      projectName: "proj",
      fetchPreview: fakeFetcher({
        "charts/chart.html": {
          type: "text",
          content: `<img src="pic.svg"><link rel="stylesheet" href="s.css">`,
        },
        "charts/pic.svg": { type: "image", dataUrl: SVG },
        "charts/s.css": { type: "text", content: "b{}" },
      }),
    });
    expect(html).toContain('srcdoc="');
    expect(html).not.toContain('src="charts/chart.html"');
    // 嵌套文档在内联 img 后才整体进 srcdoc：dataUrl 的引号已随转义层变 &quot;。
    expect(html).toContain("data:image/svg+xml;base64,");
    expect(html).toContain("<style>b{}</style>");
  });

  test("iframe 指向本地图片（svg）→ src 换 dataUrl，非本地引用保持原样", async () => {
    const html = await inlineLocalHtmlAssets(
      `<iframe src="diagram.svg"></iframe><iframe src="https://ext.example/x.html"></iframe>`,
      {
        dir: "docs/",
        projectName: "proj",
        fetchPreview: fakeFetcher({
          "docs/diagram.svg": { type: "image", dataUrl: SVG },
        }),
      },
    );
    expect(html).toContain(`src="data:image/svg+xml;base64,`);
    expect(html).toContain('src="https://ext.example/x.html"');
  });

  test("srcdoc 转义：嵌套文档含引号与 & 不破属性边界", async () => {
    const html = await inlineLocalHtmlAssets(`<iframe src="chart.html"></iframe>`, {
      dir: "",
      projectName: "proj",
      fetchPreview: fakeFetcher({
        "chart.html": { type: "text", content: `<p data-x="a&b">say "hi"</p>` },
      }),
    });
    expect(html).toContain(`srcdoc="<p data-x=&quot;a&amp;b&quot;>say &quot;hi&quot;</p>"`);
  });

  test(`深度上限（${INLINE_NESTED_HTML_MAX_DEPTH} 层）：超限嵌套文档不再递归内联，原样进 srcdoc`, async () => {
    // depth0 → c1(depth1) → c2(depth2) → c3(depth3，超限不递归)。
    const map = {
      "c1.html": {
        type: "text",
        content: `<iframe src="c2.html"></iframe>`,
      },
      "c2.html": { type: "text", content: `<iframe src="c3.html"></iframe>` },
      "c3.html": { type: "text", content: `<img src="deep.svg">` },
      // deep.svg 有可用响应：若超限后仍递归，它会被内联成 dataUrl——断言可区分
      // 「未递归」与「fetch 失败原样」。
      "deep.svg": { type: "image", dataUrl: SVG },
    };
    const html = await inlineLocalHtmlAssets(`<iframe src="c1.html"></iframe>`, {
      dir: "",
      projectName: "proj",
      fetchPreview: fakeFetcher(map),
    });
    // c3 到达深度上限：deep.svg 保持相对引用（未发起内联 fetch）。
    expect(html).toContain("deep.svg");
    expect(html).not.toContain("data:image/svg+xml");
  });

  test("fetch 失败的引用保持原样，不阻塞其余引用内联", async () => {
    const html = await inlineLocalHtmlAssets(
      `<iframe src="gone.html"></iframe><img src="ok.svg">`,
      {
        dir: "",
        projectName: "proj",
        fetchPreview: fakeFetcher({
          "ok.svg": { type: "image", dataUrl: SVG },
        }),
      },
    );
    expect(html).toContain('src="gone.html"');
    expect(html).toContain(`src="data:image/svg+xml;base64,`);
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
