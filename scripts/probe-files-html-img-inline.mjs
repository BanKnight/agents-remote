// 探针：Files HTML 预览 render 模式内联相对 <img src>（2026-09-10，用户报
// 「文件渲染中 html 嵌套 img 指向的 svg 没渲染出来」）。
//
// 根因：PreviewBody 只内联 <link rel=stylesheet>；srcDoc iframe 无项目目录 base URL，
// 相对 src 解析不出 → img 永远 404。修复：相对 img src 经 preview API 取 dataUrl 内联
// （image 类型直接返回 dataUrl；.svg/.png 均命中），stylesheet 内联保持同通道。
//
// 断言（桌面 1280×900，mock preview API，真实登录加载构建产物）：
//  1. srcDoc 中相对 img（无 ./ 前缀、./ 前缀）src 均已替换为 data: 开头（内联发生）。
//  2. svg img 在 iframe 内真实渲染（自然尺寸 > 0）——核心断言，修复前为 0。
//  3. 外链 img 保持原样（不误伤）。
//  4. stylesheet 内联回归正常（<style> 注入，既有行为不破坏）。
//
// 用法：bun scripts/probe-files-html-img-inline.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const EXEC =
  "/home/deploy/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell";

let allPass = true;
function record(ok, label) {
  if (!ok) allPass = false;
  console.log(`  ${ok ? "✓" : "✗"} ${label}`);
  return ok;
}

// 1x1 红点 png。
const PNG_DATAURL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const SVG_DATAURL =
  "data:image/svg+xml;base64," +
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="#58a6ff"/></svg>',
  ).toString("base64");

const HTML_CONTENT = `<!DOCTYPE html>
<html><head><link rel="stylesheet" href="style.css"></head>
<body>
  <img src="chart.svg" alt="chart">
  <img src="./logo.png" alt="logo">
  <img src="https://cdn.example/ext.png" alt="ext">
  <iframe src="nested/frame.html" title="nested"></iframe>
  <iframe src="diagram.svg" title="svg-frame"></iframe>
  <iframe src="https://ext.example/embed.html"></iframe>
</body></html>`;

// 嵌套文档：自身目录下的 img + css（验证相对引用按嵌套文档目录解析，非外层目录）。
const NESTED_FRAME_CONTENT = `<!DOCTYPE html>
<html><head><link rel="stylesheet" href="nested.css"></head>
<body><p id="nested-marker">nested-ok</p><img src="inner.svg" alt="inner"></body></html>`;

async function setup(page) {
  await page.route(/\/api\/overview$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ projectNames: ["proj1"], candidates: [] }),
    }),
  );
  // 全局 /files 页 root listing（列 PROJECTS_ROOT 下的项目目录）。
  await page.route(/\/api\/root\/files(?:\?.*)?$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        projectName: "",
        path: "",
        parentPath: null,
        entries: [{ name: "proj1", path: "proj1", type: "directory", hidden: false, size: 0 }],
      }),
    }),
  );
  await page.route(/\/api\/projects\/proj1\/files(?:\?.*)?$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        projectName: "proj1",
        path: "",
        parentPath: null,
        entries: [
          { name: "index.html", path: "index.html", type: "file", hidden: false, size: 512 },
          { name: "chart.svg", path: "chart.svg", type: "file", hidden: false, size: 200 },
        ],
      }),
    }),
  );
  // preview 按 path 分发：html → text；svg/png → image(dataUrl)；css → text。
  await page.route(/\/api\/projects\/proj1\/files\/preview(?:\?.*)?$/, async (r) => {
    const url = new URL(r.request().url());
    const path = url.searchParams.get("path") ?? "";
    if (path === "index.html") {
      return r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          type: "text",
          projectName: "proj1",
          path,
          name: "index.html",
          size: 512,
          content: HTML_CONTENT,
        }),
      });
    }
    if (path === "chart.svg") {
      return r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          type: "image",
          projectName: "proj1",
          path,
          name: "chart.svg",
          size: 200,
          mediaType: "image/svg+xml",
          dataUrl: SVG_DATAURL,
        }),
      });
    }
    if (path === "logo.png") {
      return r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          type: "image",
          projectName: "proj1",
          path,
          name: "logo.png",
          size: 100,
          mediaType: "image/png",
          dataUrl: PNG_DATAURL,
        }),
      });
    }
    if (path === "nested/frame.html") {
      return r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          type: "text",
          projectName: "proj1",
          path,
          name: "frame.html",
          size: 200,
          content: NESTED_FRAME_CONTENT,
        }),
      });
    }
    // 嵌套文档自身目录下的资源（相对引用按嵌套目录 nested/ 解析）。
    if (path === "nested/inner.svg") {
      return r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          type: "image",
          projectName: "proj1",
          path,
          name: "inner.svg",
          size: 200,
          mediaType: "image/svg+xml",
          dataUrl: SVG_DATAURL,
        }),
      });
    }
    if (path === "nested/nested.css") {
      return r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          type: "text",
          projectName: "proj1",
          path,
          name: "nested.css",
          size: 30,
          content: "#nested-marker{color:#58a6ff}",
        }),
      });
    }
    if (path === "diagram.svg") {
      return r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          type: "image",
          projectName: "proj1",
          path,
          name: "diagram.svg",
          size: 200,
          mediaType: "image/svg+xml",
          dataUrl: SVG_DATAURL,
        }),
      });
    }
    if (path === "style.css") {
      return r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          type: "text",
          projectName: "proj1",
          path,
          name: "style.css",
          size: 30,
          content: "body{background:#0d1117}",
        }),
      });
    }
    return r.fulfill({ status: 404, contentType: "application/json", body: '{"error":{}}' });
  });
}

async function run() {
  const browser = await chromium.launch({ executablePath: EXEC });
  try {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      locale: "zh-CN",
    });
    const page = await ctx.newPage();
    await setup(page);
    await page.goto(`${WEB_ORIGIN}/`);
    await page.waitForSelector('input[type="password"]', { timeout: 15000 });
    await page.getByLabel("访问密码").fill(await readAppPassword());
    await page.getByRole("button", { name: "登录" }).click();
    await page.waitForTimeout(700);

    console.log(
      "\n===== 全局 /files 页 → proj1 → index.html（html 默认 render 模式；" +
        "v1.4 批3 起桌面检视面板 file 标签 = 03q 源码形态，render iframe 语境归全局 /files 页 FilesPanel）=====",
    );
    await page.goto(`${WEB_ORIGIN}/files`);
    await page.waitForSelector("nav[aria-label]", { timeout: 8000 });
    // root listing（列项目目录）→ 点 proj1 进项目（listProjectFiles mock 命中）→ 点 index.html。
    // 行定位限定列表行形态（.gfrow=根层项目行；项目层文件行 = ListRow div[role=button]
    // +[data-list-row-title]——getByText 全局首个命中是左侧 nav 侧栏项目行，会误导航去项目页）。
    await page.locator(".gfrow button", { hasText: "proj1" }).click();
    await page
      .locator("[data-list-row-title]", { hasText: "index.html" })
      .waitFor({ timeout: 8000 });
    await page.locator("[data-list-row-title]", { hasText: "index.html" }).click();
    await page.waitForSelector('iframe[title="Sandboxed HTML render"]', { timeout: 10000 });

    console.log("\n===== 1. srcDoc 内联状态断言 =====");
    const renderIframe = page.locator('iframe[title="Sandboxed HTML render"]');
    const srcDoc = await renderIframe.getAttribute("srcdoc");
    // v1.4 批7：sandbox="" 收紧（design_spec L93 沙箱 = 不执行脚本、不发请求）。
    record(
      (await renderIframe.getAttribute("sandbox")) === "",
      "iframe sandbox 属性 = 空串（不执行脚本不发请求）",
    );
    const hasSvgData = srcDoc?.includes('src="data:image/svg+xml;base64,') ?? false;
    const hasPngData = srcDoc?.includes('src="data:image/png;base64,') ?? false;
    record(hasSvgData, "chart.svg 的 src 已替换为 svg dataUrl");
    record(hasPngData, "./logo.png 的 src 已替换为 png dataUrl");
    record(srcDoc?.includes('src="https://cdn.example/ext.png"') ?? false, "外链 img 保持原样");
    record(
      srcDoc?.includes("<style>body{background:#0d1117}</style>") ?? false,
      "stylesheet 内联回归正常",
    );

    console.log("\n===== 1b. iframe 嵌套本地 html/svg（2026-09-30 真机反馈） =====");
    record(
      srcDoc?.includes('srcdoc="') === true &&
        srcDoc?.includes('src="nested/frame.html"') === false,
      "嵌套本地 html iframe：src 已转 srcdoc（不再指向无法解析的相对路径）",
    );
    record(srcDoc?.includes("nested-ok") ?? false, "嵌套文档内容已内联进 srcdoc");
    record(
      srcDoc?.includes("#nested-marker{color:#58a6ff}") ?? false,
      "嵌套文档的 css 内联（相对引用按嵌套文档自身目录 nested/ 解析）",
    );
    record(
      srcDoc?.includes('src="https://ext.example/embed.html"') ?? false,
      "外链 iframe 保持原样（不误伤）",
    );
    const svgFrameTag = srcDoc?.match(/<iframe[^>]*title="svg-frame"[^>]*>/)?.[0] ?? "";
    record(
      svgFrameTag.includes('src="data:image/svg+xml;base64,') &&
        !svgFrameTag.includes('src="diagram.svg"'),
      "iframe 指向本地 svg → src 换 dataUrl",
    );

    console.log("\n===== 1c. 嵌套 frame 内真实渲染断言 =====");
    const frame = page.frameLocator('iframe[title="Sandboxed HTML render"]');
    const nestedFrame = frame.frameLocator('iframe[title="nested"]');
    // srcdoc 嵌套 frame 无网络加载，marker 应立即可见；用 waitFor 防首帧竞态。
    await nestedFrame
      .locator("#nested-marker")
      .waitFor({ state: "visible", timeout: 5000 })
      .catch(() => {});
    record(
      await nestedFrame.locator("#nested-marker").isVisible(),
      "嵌套 iframe 内容真实渲染（#nested-marker 可见）；修复前空白",
    );
    const innerBox = await nestedFrame.locator('img[src^="data:image/svg+xml"]').boundingBox();
    record(
      !!innerBox && innerBox.width > 0,
      `嵌套文档内 svg 渲染出非零尺寸（${innerBox ? `${innerBox.width}x${innerBox.height}` : "null"}）`,
    );

    console.log("\n===== 2. iframe 内真实渲染断言 =====");
    const svgImg = frame.locator('img[src^="data:image/svg+xml"]');
    await svgImg.waitFor({ state: "visible", timeout: 5000 });
    const box = await svgImg.boundingBox();
    record(
      !!box && box.width > 0 && box.height > 0,
      `svg img 渲染出非零尺寸（${box ? `${box.width}x${box.height}` : "null"}）`,
    );
    const pngBox = await frame.locator('img[src^="data:image/png"]').boundingBox();
    record(
      !!pngBox && pngBox.width > 0,
      `png img 渲染出非零尺寸（${pngBox ? `${pngBox.width}x${pngBox.height}` : "null"}）`,
    );

    console.log("\n===== 3. 图片查看器另存钮（v1.4 批7：a[download]） =====");
    // 回列表 → 点 chart.svg → ImageViewer 工具条含「另存」a[download]，建议名 = 真文件名。
    await page.goto(`${WEB_ORIGIN}/files`);
    await page.waitForSelector("nav[aria-label]", { timeout: 8000 });
    await page.locator(".gfrow button", { hasText: "proj1" }).click();
    const chartRow = page.locator("[data-list-row-title]", { hasText: "chart.svg" });
    await chartRow.waitFor({ timeout: 8000 });
    await chartRow.click();
    const saveLink = page.locator("a[download]").first();
    await saveLink.waitFor({ timeout: 8000 });
    record(
      (await saveLink.getAttribute("download")) === "chart.svg",
      "另存 a[download] 建议名 = 文件名（chart.svg）",
    );
    record(
      (await saveLink.getAttribute("href"))?.startsWith("data:image/svg+xml") === true,
      "另存 href = 图片 dataUrl",
    );
    record(
      (await saveLink.getAttribute("aria-label")) === "另存",
      "另存钮 aria-label「另存」（spec L93 口径）",
    );
  } finally {
    await browser.close();
  }

  console.log(allPass ? "\nPASS" : "\nFAIL");
  process.exit(allPass ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
