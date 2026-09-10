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
</body></html>`;

async function setup(page) {
  await page.route(/\/api\/overview$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ projectNames: ["proj1"], candidates: [] }),
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
    await page
      .getByLabel("密码")
      .or(page.getByLabel("Password"))
      .fill(await readAppPassword());
    await page.getByRole("button", { name: /解锁|Unlock/ }).click();
    await page.waitForTimeout(700);

    console.log("\n===== 项目 Files → index.html（html 默认 render 模式）=====");
    await page.goto(`${WEB_ORIGIN}/projects/proj1`);
    await page.waitForSelector("nav[aria-label]", { timeout: 8000 });
    await page
      .getByRole("tab", { name: /^文件$|^Files$/ })
      .or(page.getByText(/^文件$|^Files$/, { exact: true }).first())
      .first()
      .click({ timeout: 5000 });
    await page.waitForSelector("aside", { timeout: 8000 });
    await page.locator("aside").getByText("index.html", { exact: true }).first().click();
    await page.waitForSelector('iframe[title="Sandboxed HTML render"]', { timeout: 10000 });

    console.log("\n===== 1. srcDoc 内联状态断言 =====");
    const srcDoc = await page
      .locator('iframe[title="Sandboxed HTML render"]')
      .getAttribute("srcdoc");
    const hasSvgData = srcDoc?.includes('src="data:image/svg+xml;base64,') ?? false;
    const hasPngData = srcDoc?.includes('src="data:image/png;base64,') ?? false;
    record(hasSvgData, "chart.svg 的 src 已替换为 svg dataUrl");
    record(hasPngData, "./logo.png 的 src 已替换为 png dataUrl");
    record(srcDoc?.includes('src="https://cdn.example/ext.png"') ?? false, "外链 img 保持原样");
    record(
      srcDoc?.includes("<style>body{background:#0d1117}</style>") ?? false,
      "stylesheet 内联回归正常",
    );

    console.log("\n===== 2. iframe 内真实渲染断言 =====");
    const frame = page.frameLocator('iframe[title="Sandboxed HTML render"]');
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
