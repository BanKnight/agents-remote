#!/usr/bin/env bun
// probe-pages-anchor-row.mjs — pages 行交互探针（2026-11-09 预览层批；2026-11-10
// standalone gate 批重排：预览层只在 standalone PWA 打开，非 standalone 点行放行原生
// target=_blank 新标签）。
//
// 单测验不到的面：真浏览器内行点击行为链——
//  普通浏览器段：行根是真链接（href/target/rel 正确）、左键点行 = 原生新标签（popup，
//    预览层不出现）、FAB「添加根」开 PagesRootDialog（pages tab 的 ＋）、行内操作按钮
//    点击不触发导航（actions 容器 preventDefault 防线）。
//  standalone 段（mock navigator.standalone）：点行开 app 内预览层（iframe src 正确、
//    不导航、不开新页）、关闭回工作台、Ctrl+click 交浏览器原生开新页（修饰键守卫在
//    standalone 仍有意义：桌面安装的 Chrome PWA 同为 standalone 形态）。
// 跑法：bun scripts/probe-pages-anchor-row.mjs（dev api 43011 + web 43012 在跑）。
// 注意：右栏各 tab 面板 DOM 常驻 + hidden 切换，凡「查面板内元素」的断言必须限定在
// 具体面板容器内或按可见性过滤，否则会命中隐藏面板的残留 DOM；预览层关闭钮 aria-label
// =「关闭」（session.close）是全 app 通用文案，必须限定 [data-pages-preview] 作用域。
// 密码自读不打印。
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const WEB_ORIGIN = "http://127.0.0.1:43012";
const results = [];
const record = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "zh-CN",
  });
  const page = await context.newPage();
  await page.addInitScript(() => localStorage.setItem("workbenchRightCollapsed", "false"));
  await page.goto(`${WEB_ORIGIN}/`);
  await page.locator("input[type='password']").fill(await readAppPassword());
  await page.locator("button[type='submit']").click();
  await page.waitForTimeout(600);
  await page.goto(`${WEB_ORIGIN}/projects/agents-remote?v=2`);
  await page.waitForSelector("nav.side", { timeout: 15000 });

  const aside = page.locator("main > div > aside").nth(1);
  await aside.getByRole("tab", { name: "页面" }).click();
  await page
    .waitForFunction(
      () => {
        const a = document.querySelectorAll("main > div > aside")[1];
        return a?.querySelector('[aria-label="页面静态根"] a') != null;
      },
      { timeout: 8000 },
    )
    .catch(() => {});

  // 1) 行根是真 <a>：href/target/rel 正确。
  const anchor = await page.evaluate(() => {
    const a = document.querySelectorAll("main > div > aside")[1];
    const el = a?.querySelector('[aria-label="页面静态根"] a');
    if (!(el instanceof HTMLAnchorElement)) return null;
    return {
      href: el.getAttribute("href"),
      target: el.getAttribute("target"),
      rel: el.getAttribute("rel"),
      cls: el.className,
    };
  });
  record(
    "row root is <a target=_blank rel=noopener>",
    anchor != null &&
      anchor.href === "/p/agents-remote/" &&
      anchor.target === "_blank" &&
      (anchor.rel ?? "").includes("noopener"),
    JSON.stringify(anchor),
  );

  // 2) 左键点击行（普通浏览器 = 非 standalone）→ 放行原生 target=_blank 新标签；
  //    预览层不出现、页面自身不导航（2026-11-10 用户拍板「其他平台跳转浏览器打开」）。
  const before = context.pages().length;
  const rowPopupPromise = context.waitForEvent("page");
  await page.locator('[aria-label="页面静态根"] a').first().click();
  const rowPopup = await rowPopupPromise;
  await rowPopup.waitForLoadState();
  await page.waitForTimeout(400); // 预览层若有也应挂出（exit 桥 300ms 量级，宽限观察）
  const previewAfterRow = await page.evaluate(
    () => document.querySelector("[data-pages-preview]") != null,
  );
  record(
    "row click opens native new tab without preview",
    rowPopup.url().includes("/p/agents-remote/") &&
      !previewAfterRow &&
      page.url().includes("/projects/agents-remote") &&
      context.pages().length === before + 1,
    `popup=${rowPopup.url()} preview=${previewAfterRow} pages=${context.pages().length}`,
  );
  await rowPopup.close();

  // 2b) FAB「添加根」（pages tab 的 ＋，2026-11-10 FAB 扩展批）→ PagesRootDialog 在场。
  await page.locator('[data-desktop-inspector] button[aria-label="添加根"]').click();
  await page.waitForSelector('[role="dialog"]', { timeout: 8000 });
  const fabDialogOpen = await page.evaluate(
    () => document.querySelectorAll('[role="dialog"]').length >= 1,
  );
  record("panel FAB opens add-root dialog", fabDialogOpen);
  await page.keyboard.press("Escape");
  await page.waitForSelector('[role="dialog"]', { state: "detached", timeout: 8000 });

  // 3) 行内编辑按钮点击 → 不导航、dialog 在场（actions preventDefault 防线）。
  const row = page.locator('[aria-label="页面静态根"] a').first();
  await row.hover();
  await row.locator("button").first().click();
  await page.waitForTimeout(400);
  const dialogOpen = await page.evaluate(() => document.querySelector("[role='dialog']") != null);
  const stillOnProject = page.url().includes("/projects/agents-remote");
  record(
    "row action button edits without navigating",
    dialogOpen && stillOnProject,
    `dialog=${dialogOpen} url=${page.url()}`,
  );
  await page.keyboard.press("Escape");
  await page.waitForSelector('[role="dialog"]', { state: "detached", timeout: 8000 });

  // ── standalone 段：mock navigator.standalone（iOS PWA 语义，addInitScript 对后续
  //    导航生效）→ 点行进 app 内预览层（唯一出路：同源链接开不了新窗口的平台硬限制）。
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "standalone", { value: true, configurable: true });
  });
  await page.goto(`${WEB_ORIGIN}/projects/agents-remote?v=3`);
  await page.waitForSelector("nav.side", { timeout: 15000 });
  await page.locator("main > div > aside").nth(1).getByRole("tab", { name: "页面" }).click();
  await page.locator('[aria-label="页面静态根"] a').first().waitFor({ timeout: 8000 });

  // 2c) 点行 → 预览层在位（iframe src 正确、不导航、不开新页）。
  const beforeStandalone = context.pages().length;
  await page.locator('[aria-label="页面静态根"] a').first().click();
  const frame = page.locator("[data-pages-preview] iframe");
  await frame.waitFor({ timeout: 8000 });
  const frameSrc = await frame.getAttribute("src");
  const topbarUrl = await page.evaluate(
    () => document.querySelector("[data-pages-preview] span.font-mono")?.textContent ?? "",
  );
  const origUrl = page.url();
  record(
    "standalone row click opens in-place preview layer",
    frameSrc === "/p/agents-remote/" &&
      topbarUrl.startsWith("http://127.0.0.1:43012/p/agents-remote") &&
      origUrl.includes("/projects/agents-remote") &&
      context.pages().length === beforeStandalone,
    `src=${frameSrc} topbar=${topbarUrl} url=${origUrl} pages=${context.pages().length}`,
  );

  // 2d) 关闭钮 → 预览层卸载（exit 动画 + 300ms 桥，detached 等待天然容忍时长）。
  await page.locator("[data-pages-preview] button[aria-label='关闭']").click();
  await page.waitForSelector("[data-pages-preview]", { state: "detached", timeout: 8000 });
  record(
    "close dismisses preview without navigation",
    page.url().includes("/projects/agents-remote"),
    `url=${page.url()}`,
  );

  // 2e) Ctrl+click 行 → 修饰键守卫放行浏览器原生开新页，预览层不出现（桌面安装的
  //     Chrome PWA 同为 standalone 形态，守卫仍必要）。
  const ctrlPopupPromise = context.waitForEvent("page");
  await page
    .locator('[aria-label="页面静态根"] a')
    .first()
    .click({ modifiers: ["Control"] });
  const ctrlPopup = await Promise.race([
    ctrlPopupPromise,
    new Promise((resolve) => setTimeout(() => resolve(null), 5000)),
  ]);
  if (ctrlPopup) await ctrlPopup.waitForLoadState();
  const previewAfterCtrl = await page.evaluate(
    () => document.querySelector("[data-pages-preview]") != null,
  );
  record(
    "ctrl+click opens native new page without preview",
    ctrlPopup != null && ctrlPopup.url().includes("/p/agents-remote/") && !previewAfterCtrl,
    `popup=${ctrlPopup ? ctrlPopup.url() : "none"} preview=${previewAfterCtrl}`,
  );
  if (ctrlPopup) await ctrlPopup.close();
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length > 0 ? 1 : 0);
