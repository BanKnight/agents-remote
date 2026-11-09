#!/usr/bin/env bun
// probe-pages-retry.mjs — pages 面板错误态重试按钮探针（2026-11-09 错误态恢复批验收）。
//
// 单测验不到的面：浏览器内错误注入（route 拦截 config 500）下的完整恢复行为链——
// 错误面板 + 重试按钮在场 → 后端仍失败时重试保持错误态（refetch 期骨架→回来）→
// 后端恢复后重试恢复根行。跑法：bun scripts/probe-pages-retry.mjs
//（dev api 43011 + web 43012 需在跑；真登录 agents-remote 项目）。
// 断言：
//   1. 错误面板显示「加载页面配置失败」+ 重试按钮在场（ResourceStatePanel children 槽）。
//   2. 重试（后端仍 500）→ refetch 期短暂回骨架（isLoading），失败后错误面板回来且按钮可用。
//   3. 放行后重试 → 根行恢复（/p/agents-remote/ 在场）。
// 密码自读不打印。

import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const WEB_ORIGIN = "http://127.0.0.1:43012";
const CONFIG_GLOB = "**/api/projects/agents-remote/pages/config";
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

  // 500 注入（登录页之后才挂——login 是 /api/auth/login 不同 glob，无冲突，直接全程挂）。
  let failConfig = true;
  await page.route(CONFIG_GLOB, async (route) => {
    if (failConfig)
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: '{"error":{"code":"X","message":"injected"}}',
      });
    else await route.continue();
  });

  await page.goto(`${WEB_ORIGIN}/`);
  await page.locator("input[type='password']").fill(await readAppPassword());
  await page.locator("button[type='submit']").click();
  await page.waitForTimeout(600);
  await page.goto(`${WEB_ORIGIN}/projects/agents-remote?v=1`);
  await page.waitForSelector("nav.side", { timeout: 15000 });

  const aside = page.locator("main > div > aside").nth(1);
  await aside.getByRole("tab", { name: "页面" }).click();

  // 1) 错误面板 + 重试按钮在场。
  await aside.getByText("加载页面配置失败").waitFor({ timeout: 8000 });
  const retryBtn = aside.getByRole("button", { name: "重试" });
  const retryVisible = await retryBtn.isVisible();
  record("error panel shows retry button", retryVisible);

  // 2) 点击重试（仍 500）→ refetch 期短暂回骨架（isLoading），失败后错误面板回来。
  //    轮询等「错误面板再次可见」（固定采样会撞骨架窗口，假 FAIL）。
  await retryBtn.click();
  await page.waitForFunction(
    () => {
      const a = document.querySelectorAll("main > div > aside")[1];
      return (
        (a?.textContent?.includes("加载页面配置失败") ?? false) &&
        ![...a.querySelectorAll("button")].some((b) => b.disabled)
      );
    },
    { timeout: 4000 },
  );
  record("retry with failing backend keeps error state", true);

  // 3) 放行 → 点重试 → 根行恢复。
  failConfig = false;
  await retryBtn.click();
  await page.waitForFunction(
    () => {
      const a = document.querySelectorAll("main > div > aside")[1];
      return a?.textContent?.includes("/p/agents-remote/") ?? false;
    },
    { timeout: 8000 },
  );
  record("retry after backend recovers restores root row", true);
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length > 0 ? 1 : 0);
