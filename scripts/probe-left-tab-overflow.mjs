// 探针：桌面左栏 middle tab bar 溢出横向滚动（修复后 7 个 tab 不再截断，溢出可横滚到达）。
//
// 背景：进入项目后的左栏 nav（ProjectLeftPanel，aria-label=projectsAria）默认 16rem(256px)，
// 7 个 middle tab（总览/历史/文件/Git/页面/Wiki/插件）约需 340px，溢出。修法 = nav 加
// overflow-x-auto + TabButton shrink-0（对齐 DESIGN「tab 多时横滚不换行」+ 移动端 MobileTabHeader 范式）。
//
// 断言（zh-CN + 桌面 1280×900，全新 context 无 SW）：
//  1. nav computed overflowX === "auto"（横滚容器成立）。
//  2. nav.scrollWidth > nav.clientWidth（内容溢出，7 tab 确实放不下）。
//  3. 前 4 个 tab（总览/历史/文件/Git）boundingBox 在 nav 可视区内——e2e 回归面兜底
//    （middle-tab-left.spec 断言它们可见可点）。
//  4. 第 7 个 tab（插件）初始在 nav 可视区外（右边界超出）；设 scrollLeft=scrollWidth 后
//    进入可视区（滚动可达）。
//
// 用法：bun scripts/probe-left-tab-overflow.mjs
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

async function setup(page) {
  await page.route(/\/api\/overview$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ projectNames: ["proj1"], candidates: [] }),
    }),
  );
  // 空实例列表，避免 overview body 错误态干扰（nav 渲染不依赖它，mock 只为页面干净）。
  await page.route(/\/api\/projects\/proj1\/instances(?:\?.*)?$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sessions: [] }),
    }),
  );
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

    console.log("\n===== 进入项目 → 左栏 middle tab nav =====");
    await page.goto(`${WEB_ORIGIN}/projects/proj1`);
    // zh-CN 下 projectsAria = "项目"（en = "Projects"）。
    const nav = page.getByRole("navigation", { name: "项目", exact: true });
    await nav.waitFor({ timeout: 8000 });
    // 等 7 个 tab 渲染完（buildOverviewTabs 同步渲染，waitFor 已保证 nav 存在即 tab 在）。
    const buttons = nav.getByRole("button");
    await buttons.first().waitFor({ timeout: 8000 });
    const count = await buttons.count();
    record(count === 7, `nav 渲染 7 个 middle tab（实际 ${count}）`);

    const overflowX = await nav.evaluate((el) => getComputedStyle(el).overflowX);
    record(overflowX === "auto", `nav overflowX = auto（横滚容器成立，实际 ${overflowX}）`);

    const dims = await nav.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
    record(dims.sw > dims.cw, `内容溢出可滚（scrollWidth=${dims.sw} > clientWidth=${dims.cw}）`);

    const navBox = await nav.boundingBox();
    record(navBox !== null && navBox.width > 0, `nav 有可见几何（w=${navBox?.width.toFixed(1)}）`);

    // 前 4 个 tab（总览/历史/文件/Git）初始在 nav 可视区内（e2e 回归面兜底）。
    const first4 = [];
    for (let i = 0; i < 4; i++) first4.push(await buttons.nth(i).boundingBox());
    const first4Visible = first4.every(
      (b) => b && navBox && b.x >= navBox.x - 2 && b.x + b.width <= navBox.x + navBox.width + 2,
    );
    record(first4Visible, "前 4 个 tab（总览/历史/文件/Git）在 nav 可视区内");

    // 第 7 个 tab（插件）初始溢出（右边界超出 nav 可视区）。
    const plugBefore = await buttons.nth(6).boundingBox();
    const overflowed =
      plugBefore && navBox && plugBefore.x + plugBefore.width > navBox.x + navBox.width + 2;
    record(overflowed, `第 7 个 tab（插件）初始溢出 nav 可视区（x=${plugBefore?.x.toFixed(1)}）`);

    // 横滚到最右 → 第 7 个 tab 进入可视区（滚动可达）。
    await nav.evaluate((el) => {
      el.scrollLeft = el.scrollWidth;
    });
    const plugAfter = await buttons.nth(6).boundingBox();
    const reachable =
      plugAfter &&
      navBox &&
      plugAfter.x + plugAfter.width > navBox.x &&
      plugAfter.x < navBox.x + navBox.width;
    record(reachable, `横滚到底后插件 tab 进入可视区（x=${plugAfter?.x.toFixed(1)}）`);
  } finally {
    await browser.close();
  }
}

(async () => {
  await run();
  console.log(`\n总计: ${allPass ? "ALL PASS" : "有 FAIL"}`);
  process.exit(allPass ? 0 : 1);
})();
