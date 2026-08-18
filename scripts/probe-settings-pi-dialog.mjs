// 探针：设置弹窗 pi 配置区（Phase 2 配置层）——只读验证 UI 接线，不写真实 settings.yaml。
//
// 覆盖单测（settings-dialog 无组件单测）测不到的真实浏览器行为：
//   Radix Dialog 打开 → root view 三胶囊（Claude runtime / Pi runtime / General）→
//   点 Pi runtime 进 detail → provider / model / apiKey 三输入 + hint + Save 渲染、
//   Back 返回 root。Save 落盘/重启读回/mask 已由 api 单测覆盖（settings-routes.test.ts
//   `PUT pi 落盘 + 返回 masked` 等），此处不写盘防污染真实 settings.yaml。
//
// locale=en-US 对齐 nav.settings / settings.section.pi 稳定文案。密码自读不打印。
// 用法：bun scripts/probe-settings-pi-dialog.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";
import { verifyCssFlushed } from "./ar-verify-css.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const EXEC =
  "/home/deploy/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell";

let passCount = 0;
let failCount = 0;
function ok(cond, msg) {
  if (cond) {
    passCount++;
    console.log(`  ✓ ${msg}`);
  } else {
    failCount++;
    console.error(`  ✗ ${msg}`);
  }
}

async function run() {
  // 前置：CSS 落盘三道闸（web DOM 探针铁律，frontend-notes §2/§10）。本次只用既有
  // utility（Field label 灰阶 / Save accent），验证 CSS 已落盘即可。
  const css = await verifyCssFlushed({
    origin: WEB_ORIGIN,
    expectClasses: ["text-on-surface-soft", "text-on-surface-muted"],
  });
  if (!css.pass) {
    console.error("CSS 落盘验证失败，探针中止：");
    css.details.forEach((d) => console.error(`  ${d}`));
    process.exit(1);
  }
  console.log("✓ CSS 落盘 + content-type 正常");

  const browser = await chromium.launch({ executablePath: EXEC });
  try {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      locale: "en-US",
    });
    const page = await ctx.newPage();

    console.log("Part 1: 登录 + 打开设置弹窗");
    await page.goto(`${WEB_ORIGIN}/`);
    await page.getByLabel("App password").fill(await readAppPassword());
    await page.getByRole("button", { name: "Unlock console" }).click();
    await page.waitForSelector("nav[aria-label]", { timeout: 10000 });

    // ActivityBar 设置按钮 → 居中 SettingsDialog（root view = 3 胶囊）。
    await page.getByRole("button", { name: "Settings" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ timeout: 5000 });

    console.log("Part 2: root view 三胶囊");
    ok(
      await dialog.getByRole("button", { name: "Claude runtime" }).isVisible(),
      "胶囊 Claude runtime",
    );
    ok(await dialog.getByRole("button", { name: "Pi runtime" }).isVisible(), "胶囊 Pi runtime");
    ok(await dialog.getByRole("button", { name: "General" }).isVisible(), "胶囊 General");

    console.log("Part 3: 点 Pi runtime → detail 表单渲染");
    await dialog.getByRole("button", { name: "Pi runtime" }).click();

    // hint（settings.piHint en 文案）——含 "blank API key keeps" 区分于 label。
    ok(
      await dialog
        .getByText("A blank API key keeps the existing key.", { exact: false })
        .isVisible(),
      "pi hint 文案渲染",
    );
    // 三个输入：provider / model / apiKey（detail 视图仅此三个 ShellInput）。
    const inputs = dialog.locator("input");
    const count = await inputs.count();
    ok(count === 3, `pi 表单 3 个输入框（provider/model/apiKey），实际 ${count}`);
    ok(
      await dialog.getByText("Provider", { exact: true }).first().isVisible(),
      "Provider 字段 label",
    );
    ok(await dialog.getByText("Model", { exact: true }).first().isVisible(), "Model 字段 label");
    ok(
      await dialog.getByText("API key", { exact: true }).first().isVisible(),
      "API key 字段 label",
    );
    // placeholder 指纹：provider→anthropic、model→claude-sonnet-5。
    ok(
      (await dialog.locator('input[placeholder="anthropic"]').count()) === 1,
      "provider 输入 placeholder=anthropic",
    );
    ok(
      (await dialog.locator('input[placeholder="claude-sonnet-5"]').count()) === 1,
      "model 输入 placeholder=claude-sonnet-5",
    );
    // Save + Back。
    ok(await dialog.getByRole("button", { name: "Save" }).isVisible(), "Save 按钮");
    ok(await dialog.getByRole("button", { name: "Back" }).isVisible(), "Back 按钮（返回 root）");

    console.log("Part 4: Back 返回 root");
    await dialog.getByRole("button", { name: "Back" }).click();
    ok(await dialog.getByRole("button", { name: "General" }).isVisible(), "Back 后回 root view");
  } finally {
    await browser.close();
  }

  console.log(`\n${passCount} pass, ${failCount} fail`);
  if (failCount > 0) process.exit(1);
}

run();
