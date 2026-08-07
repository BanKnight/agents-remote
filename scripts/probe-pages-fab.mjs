// 探针：pages tab 的 FAB 接入 + header 整行隐藏（hidden lg:flex）验证。
// 断言：1. 移动端 pages tab FAB 渲染（直跳模式，aria-label "Add pages root"）
//      2. 移动端「添加根」按钮整行隐藏（header 行 hidden lg:flex，按钮不可见）
//      3. 点 pages FAB → PagesRootDialog 打开（直跳 onClick=beginEdit add）
//      4. 桌面「添加根」按钮可见（lg:flex 显示）。密码自读不打印。用法：node scripts/probe-pages-fab.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const projectName = process.env.PROBE_PROJECT ?? "test";

let allPass = true;
function record(ok, label) {
  if (!ok) allPass = false;
  console.log(`  ${ok ? "✓" : "✗"} ${label}`);
  return ok;
}

async function setupMocks(page) {
  await page.route(new RegExp("/api/overview$"), (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ projectNames: [projectName], candidates: [] }),
    }),
  );
  await page.route(new RegExp(`/api/projects/${projectName}/files`), (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ entries: [{ name: "a.ts", path: "a.ts", type: "file" }], path: "" }),
    }),
  );
  await page.route(new RegExp(`/api/projects/${projectName}/pages`), (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ config: { roots: [] } }),
    }),
  );
}

async function login(page) {
  await page.goto(`${WEB_ORIGIN}/`);
  await page.getByLabel("Password").fill(await readAppPassword());
  await page.getByRole("button", { name: "Unlock console" }).click();
}

async function runMobile() {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await ctx.newPage();
    await setupMocks(page);
    await login(page);
    await page.waitForTimeout(700);

    await page.goto(`${WEB_ORIGIN}/projects/${projectName}`);
    await page.waitForTimeout(800);
    // 切 pages tab（labelKey workbench.tabPages：en "Pages" / zh "页面"）。
    await page
      .getByRole("tab", { name: /^Pages$|^页面$/ })
      .first()
      .click({ timeout: 5000 })
      .catch(async () => {
        await page.evaluate(() => {
          const els = Array.from(document.querySelectorAll('[role="tab"], button'));
          const t = els.find((el) => /^(Pages|页面)$/.test((el.textContent ?? "").trim()));
          if (t) t.click();
        });
      });
    await page.waitForTimeout(800);

    console.log("\n===== 1. pages tab FAB（移动端，直跳模式）=====");
    const fab = await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll("button")).find(
        (x) => getComputedStyle(x).position === "fixed" && x.className.includes("size-14"),
      );
      return b ? { ariaLabel: b.getAttribute("aria-label") } : null;
    });
    record(!!fab, "pages tab FAB 渲染");
    if (fab) console.log(`  FAB aria-label: ${fab.ariaLabel}`);

    console.log("\n===== 2. 移动端「添加根」按钮整行隐藏 =====");
    const addRootVisible = await page
      .getByRole("button", { name: /^Add root$|^添加根$/ })
      .first()
      .isVisible()
      .catch(() => false);
    record(!addRootVisible, "移动端「添加根」按钮不可见（header 整行 hidden lg:flex）");

    console.log("\n===== 3. 点 pages FAB → PagesRootDialog =====");
    await page.locator("button.size-14").first().click();
    await page.waitForTimeout(450);
    const dialogOpen = await page.evaluate(() => !!document.querySelector('[role="dialog"]'));
    record(dialogOpen, "点 pages FAB 打开 PagesRootDialog（直跳 onClick=beginEdit add）");
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(300);
  } finally {
    await browser.close();
  }
}

async function runDesktop() {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await setupMocks(page);
    await login(page);
    await page.waitForTimeout(700);

    await page.goto(`${WEB_ORIGIN}/projects/${projectName}`);
    await page.waitForTimeout(800);
    await page
      .getByRole("tab", { name: /^Pages$|^页面$/ })
      .first()
      .click({ timeout: 5000 })
      .catch(async () => {
        await page.evaluate(() => {
          const els = Array.from(document.querySelectorAll('[role="tab"], button'));
          const t = els.find((el) => /^(Pages|页面)$/.test((el.textContent ?? "").trim()));
          if (t) t.click();
        });
      });
    await page.waitForTimeout(800);
    console.log("\n===== 4. 桌面 pages「添加根」按钮可见 =====");
    const addRootVisible = await page
      .getByRole("button", { name: /^Add root$|^添加根$/ })
      .first()
      .isVisible()
      .catch(() => false);
    record(addRootVisible, "桌面「添加根」按钮可见（lg:flex 显示）");
  } finally {
    await browser.close();
  }
}

(async () => {
  await runMobile();
  await runDesktop();
  console.log(`\n总计: ${allPass ? "ALL PASS" : "有 FAIL"}`);
  process.exit(allPass ? 0 : 1);
})();
