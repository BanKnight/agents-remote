// 探针：总览视图收敛（移除 table 视图）+ pages 骨架屏对齐内容布局。
// 断言：
//  1. project 总览（桌面 + 移动）：无视图切换器（0 个 view 按钮，单一 grid 视图）。
//  2. global 总览（桌面 + 移动）：ViewSwitcher 恰好 2 个 view 按钮（grid/grouped），无 table。
//  3. pages 骨架屏（移动）：loading 时 header 骨架行 display:none（hidden lg:flex，对齐 loaded header）。
// 密码自读不打印。用法：node scripts/probe-view-tabs.mjs
import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const projectName = process.env.PROBE_PROJECT ?? "test";

// view 按钮 aria-label 集合（中英双语均覆盖，含已移除的 table 用于断言其消失）。
const VIEW_LABELS = new Set(["Grid", "Grouped", "Table", "网格", "分组", "表格"]);
const TABLE_LABELS = new Set(["Table", "表格"]);

let allPass = true;
function record(ok, label) {
  if (!ok) allPass = false;
  console.log(`  ${ok ? "✓" : "✗"} ${label}`);
  return ok;
}

async function readRawPassword() {
  if (process.env.APP_PASSWORD) return process.env.APP_PASSWORD;
  const cfg = path.join(os.homedir(), ".agents-remote", "config.toml");
  try {
    const txt = await readFile(cfg, "utf8");
    const m = txt.match(/^app_password\s*=\s*["']([^"']*)["']/m);
    if (m && m[1]) return m[1];
  } catch {}
  const pid = execSync(
    "ss -ltnp 2>/dev/null | grep ':43011' | grep -oP 'pid=\\K[0-9]+' | head -1",
    { encoding: "utf8" },
  ).trim();
  if (pid) {
    const env = await readFile(`/proc/${pid}/environ`, "utf8");
    const entry = env.split("\0").find((e) => e.startsWith("APP_PASSWORD="));
    if (entry) return entry.slice("APP_PASSWORD=".length);
  }
  throw new Error("password not found");
}

// 统计页面上 view 切换按钮（aria-label 命中视图名）。返回 { count, labels, hasTable }。
async function countViewButtons(page) {
  return await page.evaluate(
    (labelsJson) => {
      const labels = new Set(JSON.parse(labelsJson));
      const btns = Array.from(document.querySelectorAll("button"));
      const viewBtns = btns.filter((b) => labels.has((b.getAttribute("aria-label") ?? "").trim()));
      return viewBtns.map((b) => (b.getAttribute("aria-label") ?? "").trim());
    },
    JSON.stringify([...VIEW_LABELS]),
  );
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
}

async function login(page) {
  await page.goto(`${WEB_ORIGIN}/`);
  await page.getByLabel("Password").fill(await readRawPassword());
  await page.getByRole("button", { name: "Unlock console" }).click();
}

async function newPage(browser, mobile) {
  const ctx = mobile
    ? await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      })
    : await browser.newContext({ viewport: { width: 1280, height: 900 } });
  return await ctx.newPage();
}

async function runOverviewChecks(mobile) {
  const browser = await chromium.launch();
  try {
    const label = mobile ? "移动" : "桌面";

    // ===== project 总览：单一 grid 视图，无切换器 =====
    const pPage = await newPage(browser, mobile);
    await setupMocks(pPage);
    await login(pPage);
    await pPage.waitForTimeout(600);
    await pPage.goto(`${WEB_ORIGIN}/projects/${projectName}`);
    await pPage.waitForTimeout(900);
    console.log(`\n===== project 总览（${label}）：应无视图切换器 =====`);
    const projViews = await countViewButtons(pPage);
    record(
      projViews.length === 0,
      `project 总览 0 个 view 按钮（got ${JSON.stringify(projViews)}）`,
    );
    await pPage.close();

    // ===== global 总览：grid/grouped 两视图切换器 =====
    const gPage = await newPage(browser, mobile);
    await setupMocks(gPage);
    await login(gPage);
    await gPage.waitForTimeout(600);
    await gPage.goto(`${WEB_ORIGIN}/`);
    await gPage.waitForTimeout(900);
    console.log(`\n===== global 总览（${label}）：应 2 个 view 按钮（grid/grouped）=====`);
    const globalViews = await countViewButtons(gPage);
    record(
      globalViews.length === 2,
      `global 总览 2 个 view 按钮（got ${JSON.stringify(globalViews)}）`,
    );
    record(
      !globalViews.some((l) => TABLE_LABELS.has(l)),
      `global 总览无 table 按钮（got ${JSON.stringify(globalViews)}）`,
    );
    await gPage.close();
  } finally {
    await browser.close();
  }
}

async function runPagesSkeleton() {
  const browser = await chromium.launch();
  try {
    const page = await newPage(browser, true);
    await setupMocks(page);
    // pages 接口延迟响应，强制 config.isLoading=true，观察 loading 骨架。
    await page.route(new RegExp(`/api/projects/${projectName}/pages`), async (r) => {
      await new Promise((res) => setTimeout(res, 6000));
      await r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ config: { roots: [] } }),
      });
    });
    await login(page);
    await page.waitForTimeout(600);
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
    await page.waitForTimeout(500);

    console.log("\n===== pages 骨架屏（移动）：header 行应 display:none =====");
    // loading header 骨架 = div[aria-hidden="true"] 含 skeleton-shimmer；移动 hidden lg:flex → display:none。
    const skeleton = await page.evaluate(() => {
      const cand = Array.from(document.querySelectorAll('div[aria-hidden="true"]')).find((d) =>
        d.querySelector(".skeleton-shimmer"),
      );
      if (!cand) return null;
      return {
        display: getComputedStyle(cand).display,
        hasHidden: cand.className.includes("hidden"),
        hasLgFlex: cand.className.includes("lg:flex"),
      };
    });
    if (!skeleton) {
      record(false, "pages loading header 骨架渲染（未进入 loading 态或结构变更）");
    } else {
      console.log(`  骨架几何: ${JSON.stringify(skeleton)}`);
      record(
        skeleton.hasHidden && skeleton.hasLgFlex,
        "header 骨架行带 hidden lg:flex（对齐 loaded header）",
      );
      record(
        skeleton.display === "none",
        `移动 header 骨架 display:none（got ${skeleton.display}，无加载显/加载完隐跳变）`,
      );
    }
    await page.close();
  } finally {
    await browser.close();
  }
}

(async () => {
  await runOverviewChecks(false);
  await runOverviewChecks(true);
  await runPagesSkeleton();
  console.log(`\n总计: ${allPass ? "ALL PASS" : "有 FAIL"}`);
  process.exit(allPass ? 0 : 1);
})();
