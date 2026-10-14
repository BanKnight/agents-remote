// 探针：浮层打开不自动聚焦输入框（2026-10-04 用户拍板「输入是低频且理应是用户的行为」——
// sheet 升起动画与软键盘同时唤起互相打架）。覆盖两个面：
//  A 切换 sheet（MobileProjectSwitchSheet）：内容首 focusable = 搜索框，曾吃 Radix
//    DialogContent 默认 initial focus → 打开即聚焦+弹键盘；现由 MobileSheet 基座
//    onOpenAutoFocus preventDefault 统一拦（无显式 autoFocus 的默认聚焦面）。
//  B pages 添加根 sheet（PagesRootDialog 移动面）：曾有显式 autoFocus，已删（共用
//    formBody，桌面靠 Radix 默认聚焦同一 input 等效，桌面行为零变化不在本探针面）。
// 断言核心 = sheet 打开后 document.activeElement 非 INPUT（软键盘不唤起）；对照断言
// 锚输入框在场，防 sheet 未开导致断言空转。桌面面（居中 Dialog 保留聚焦惯例）零代码
// 改动，不在浏览器探针面（路径深），交真机/桌面清单抽查。
// 2026-10-14 扩展关闭面：Radix onCloseAutoFocus 已在基座/▾ 菜单 preventDefault（WebKit
// 对 tap 后脚本 focus 判 :focus-visible → 浏览器默认蓝环，frontend-notes §33）——断言
// 关闭后 activeElement 非 trigger。Chromium 断不了 WebKit 视觉环，这里证接线；视觉交真机。
// 密码自读不打印。web DOM 探针前置过 ar-verify-css 三道闸。
// 用法：bun scripts/probe-sheet-focus-policy.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";
import { verifyCssFlushed } from "./ar-verify-css.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";

const results = [];
function check(name, cond, detail = "") {
  results.push(Boolean(cond));
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function login(page) {
  await page.goto(`${WEB_ORIGIN}/`);
  await page.getByLabel("访问密码").fill(await readAppPassword());
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForSelector('input[type="password"]', { state: "detached", timeout: 15000 });
}

/** sheet 打开 + 输入框在场 + activeElement 非 INPUT。 */
async function assertSheetNoFocus(page, inputLocator, label) {
  await inputLocator.waitFor({ state: "visible", timeout: 10000 });
  check(`${label}: sheet 开且输入框在场`, true);
  const tag = await page.evaluate(() => document.activeElement?.tagName ?? "null");
  check(`${label}: 打开不自动聚焦（activeElement=${tag}）`, tag !== "INPUT");
}

(async () => {
  // web DOM 探针强制前置：CSS 落盘三道闸不过则整体 fail，不跑 DOM 断言。
  const css = await verifyCssFlushed({
    expectClasses: ["bg-primary/10", "text-primary", "bg-surface-inset"],
    origin: WEB_ORIGIN,
  });
  if (!css.pass) {
    console.error(css.details.join("\n"));
    process.exit(1);
  }

  const browser = await chromium.launch();
  try {
    // ── A. 实例切换菜单（v1.5 批1：▾ 由切换 sheet 换为锚定浮卡，Radix 默认聚焦面）──
    {
      const page = await (
        await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "zh-CN" })
      ).newPage();
      await login(page);
      await page.goto(`${WEB_ORIGIN}/projects/test`);
      await page.waitForSelector(".nv-t button", { timeout: 10000 });
      await page.locator(".nv-t button").first().click();
      await assertSheetNoFocus(
        page,
        page.getByRole("menuitem", { name: /新建实例/ }),
        "A 实例切换菜单",
      );
      await page.keyboard.press("Escape");
      // 关闭不回焦 trigger：先等浮层真关闭防空转（未关时焦点在 content 内也"不是
      // trigger"会造成假 PASS），再断 activeElement 非 trigger。
      await page.getByRole("menuitem", { name: /新建实例/ }).waitFor({ state: "detached" });
      const aClosed = await page.evaluate(() => ({
        tag: document.activeElement?.tagName ?? "null",
        isTrigger: document.activeElement === document.querySelector(".nv-t button"),
      }));
      check(
        `A 实例切换菜单: 关闭不回焦 trigger（activeElement=${aClosed.tag}）`,
        !aClosed.isTrigger,
      );
      await page.context().close();
    }

    // ── B. 文件新建 sheet（显式 autoFocus 已删面）──
    // 路径：项目 → 检视面板（files tab 默认激活）→ FAB「添加」→「新建…」→ new-item-sheet。
    {
      const page = await (
        await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "zh-CN" })
      ).newPage();
      await login(page);
      await page.goto(`${WEB_ORIGIN}/projects/test`);
      await page
        .locator('button[aria-label="检视面板"], button[aria-label="Inspection panel"]')
        .first()
        .click();
      await page.waitForSelector('[data-inspection-panel="open"] [data-mobile-tool="files"]', {
        timeout: 8000,
      });
      // FAB「添加」→ AddMenu →「新建…」→ new-item-sheet（曾显式 autoFocus，已删）。
      await page.locator('button[aria-label="添加"].fab').click();
      await page.getByRole("menuitem", { name: "新建…" }).click();
      await assertSheetNoFocus(page, page.getByLabel("名称"), "B 文件新建 sheet");
      await page.keyboard.press("Escape");
      await page.getByLabel("名称").waitFor({ state: "detached" });
      const bClosed = await page.evaluate(() => ({
        tag: document.activeElement?.tagName ?? "null",
        isTrigger:
          document.activeElement === document.querySelector('button[aria-label="添加"].fab'),
      }));
      check(
        `B 文件新建 sheet: 关闭不回焦 FAB trigger（activeElement=${bClosed.tag}）`,
        !bClosed.isTrigger,
      );
      await page.context().close();
    }
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r).length;
  console.log(`\n${failed === 0 ? "ALL PASS" : `${failed} FAILED`} (${results.length} assertions)`);
  process.exit(failed === 0 ? 0 : 1);
})();
