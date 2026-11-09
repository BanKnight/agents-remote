#!/usr/bin/env bun
// probe-pages-anchor-row.mjs — pages 行 href 化探针（2026-11-09 外链批验收）。
//
// 单测验不到的面：真浏览器内 <a> 行为链——行根是真链接（target/rel 正确）、真点击开新页
//（context.pages 1→2）且原页不导航（window.open 在 iOS standalone PWA 等形态被降级成当前
// 页导航的替代方案）、行内操作按钮点击不触发导航（actions 容器 preventDefault 防线）。
// 跑法：bun scripts/probe-pages-anchor-row.mjs（dev api 43011 + web 43012 在跑）。
// 注意：右栏各 tab 面板 DOM 常驻 + hidden 切换，凡「查面板内元素」的断言必须限定在
// 具体面板容器内或按可见性过滤，否则会命中隐藏面板的残留 DOM。
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

  // 2) 真点击行 → 新页打开（context.pages 1→2）、原页 URL 不动。
  const before = context.pages().length;
  await page.locator('[aria-label="页面静态根"] a').first().click();
  await page.waitForTimeout(600);
  const after = context.pages().length;
  const origUrl = page.url();
  const newUrl = context.pages()[context.pages().length - 1]?.url() ?? "";
  record(
    "click opens new page, original page stays",
    after === before + 1 &&
      origUrl.includes("/projects/agents-remote") &&
      newUrl.includes("/p/agents-remote/"),
    `pages ${before}→${after} orig=${origUrl} new=${newUrl}`,
  );
  if (after > before) await context.pages()[context.pages().length - 1].close();

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
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length > 0 ? 1 : 0);
