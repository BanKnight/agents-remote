#!/usr/bin/env bun
// probe-pages-anchor-row.mjs — pages 行交互探针（2026-11-09 预览层批验收）。
//
// 单测验不到的面：真浏览器内行点击行为链——行根是真链接（href/target/rel 正确）、左键
// 点击开 app 内预览层（iframe src 正确、不导航、不开新页）、顶栏「新窗口打开」钮开真
// popup、关闭回工作台、Ctrl+click 交浏览器原生开新页（修饰键守卫）、行内操作按钮点击
// 不触发导航（actions 容器 preventDefault 防线）。
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

  // 2) 左键点击行 → app 内预览层在位（iframe src 正确、不导航、不开新页）。
  const before = context.pages().length;
  await page.locator('[aria-label="页面静态根"] a').first().click();
  const frame = page.locator("[data-pages-preview] iframe");
  await frame.waitFor({ timeout: 8000 });
  const frameSrc = await frame.getAttribute("src");
  const origUrl = page.url();
  record(
    "row click opens in-place preview layer",
    frameSrc === "/p/agents-remote/" &&
      origUrl.includes("/projects/agents-remote") &&
      context.pages().length === before,
    `src=${frameSrc} url=${origUrl} pages=${context.pages().length}`,
  );

  // 2b) 预览层顶栏「新窗口打开」钮 → 真 popup（桌面语义；waitForEvent 不 sleep）。
  const popupPromise = context.waitForEvent("page");
  await page.locator("[data-pages-preview] a[target='_blank']").click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  const popupUrl = popup.url();
  record(
    "preview new-window button opens page",
    popupUrl.includes("/p/agents-remote/"),
    `url=${popupUrl}`,
  );
  await popup.close();

  // 2c) 关闭钮 → 预览层卸载（exit 动画 + 300ms 桥，detached 等待天然容忍时长）。
  await page.locator("[data-pages-preview] button[aria-label='关闭']").click();
  await page.waitForSelector("[data-pages-preview]", { state: "detached", timeout: 8000 });
  record(
    "close dismisses preview without navigation",
    page.url().includes("/projects/agents-remote"),
    `url=${page.url()}`,
  );

  // 2d) Ctrl+click 行 → 修饰键守卫放行浏览器原生开新页，预览层不出现。
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

  // 2e) standalone 形态（mock navigator.standalone = iOS PWA 语义）→ 顶栏「新窗口」钮
  //     不渲染（同源 _blank 降级成当前视图导航 = 把工作台顶掉的老 bug），关闭钮在场。
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "standalone", { value: true, configurable: true });
  });
  await page.goto(`${WEB_ORIGIN}/projects/agents-remote?v=3`);
  await page.waitForSelector("nav.side", { timeout: 15000 });
  await page.locator("main > div > aside").nth(1).getByRole("tab", { name: "页面" }).click();
  await page.locator('[aria-label="页面静态根"] a').first().waitFor({ timeout: 8000 });
  await page.locator('[aria-label="页面静态根"] a').first().click();
  await page.locator("[data-pages-preview] iframe").waitFor({ timeout: 8000 });
  const newWindowInStandalone = await page.evaluate(
    () => document.querySelector("[data-pages-preview] a[target='_blank']") != null,
  );
  const closeBtnInStandalone = await page.evaluate(
    () => document.querySelector("[data-pages-preview] button[aria-label='关闭']") != null,
  );
  record(
    "standalone hides new-window button",
    !newWindowInStandalone && closeBtnInStandalone,
    `newWindow=${newWindowInStandalone} close=${closeBtnInStandalone}`,
  );
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length > 0 ? 1 : 0);
