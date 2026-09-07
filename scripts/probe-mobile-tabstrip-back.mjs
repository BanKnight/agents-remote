// 探针：移动端 tab 带 ◄ 返回按钮（workbench-views §7.7，2026-09-07）。
// 断言：① header 内 ☰ 右侧存在 ◄（aria-label 返回项目列表）；② 点击 ◄ → URL 回 / 项目列表。
// 用 bun 跑（memory: probe-run-with-bun-not-node）。密码自读（memory: secrets-read-by-script）。
// 用法：bun scripts/probe-mobile-tabstrip-back.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const EXEC =
  "/home/deploy/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell";

let allPass = true;
function record(ok, label) {
  if (!ok) allPass = false;
  console.log(`  ${ok ? "✓" : "✗"} ${label}`);
}

const browser = await chromium.launch({ executablePath: EXEC });
try {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    locale: "zh-CN",
  });
  const page = await ctx.newPage();
  await page.goto(`${WEB_ORIGIN}/`);
  await page
    .getByLabel("密码")
    .or(page.getByLabel("Password"))
    .fill(await readAppPassword());
  await page.getByRole("button", { name: /解锁|Unlock/ }).click();
  await page.waitForTimeout(700);

  // 进一个项目工作台（浏览态）：URL 直达。优先 test 项目（memory: test-in-test-project），
  // 只导航不创建任何数据；无 test 时回退列表第一个非 agents-remote 项目（避开正式项目）。
  const PROJECT = process.env.AR_PROBE_PROJECT ?? "test";
  await page.goto(`${WEB_ORIGIN}/projects/${encodeURIComponent(PROJECT)}`);
  await page.waitForTimeout(1200);
  if (!(await page.locator('button[aria-label="切换侧边栏"]').count())) {
    console.error(`SKIP: 项目 ${PROJECT} 不存在或未渲染出工作台`);
    process.exit(2);
  }

  console.log("\n===== 1. header 内 ☰ 右侧 ◄ 返回按钮 =====");
  const menuBtn = page.locator('header button[aria-label="切换侧边栏"]');
  const backBtn = page.locator('header button[aria-label="返回项目列表"]');
  record((await menuBtn.count()) === 1, "☰ 按钮存在");
  record((await backBtn.count()) === 1, "◄ 返回按钮存在（恒常渲染，浏览态即可断言）");
  if ((await backBtn.count()) === 1 && (await menuBtn.count()) === 1) {
    const menuBox = await menuBtn.boundingBox();
    const backBox = await backBtn.boundingBox();
    record(
      backBox.x > menuBox.x + menuBox.width - 1 && backBox.y === menuBox.y,
      "◄ 位于 ☰ 右侧同行",
    );
  }

  console.log("\n===== 2. 点击 ◄ → URL 回项目列表 =====");
  // 浏览态 drawer 默认展开，透明拦截层盖住页面（真实交互：点页面先关 drawer）。
  const intercept = page.locator('div[aria-hidden="true"].absolute.inset-0');
  if (await intercept.count()) await intercept.click({ force: true });
  await page.waitForTimeout(400);
  await backBtn.click();
  await page.waitForTimeout(800);
  record(new URL(page.url()).pathname === "/", `URL = ${new URL(page.url()).pathname}（期望 /）`);

  console.log(`\n${allPass ? "ALL PASS" : "HAS FAILURES"}`);
} catch (err) {
  console.error("PROBE ERROR:", err);
  allPass = false;
} finally {
  await browser.close();
}
process.exit(allPass ? 0 : 1);
