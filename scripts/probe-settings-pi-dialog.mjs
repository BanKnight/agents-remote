// 探针：设置弹窗 pi 配置区（v5 presets 体系）——只读验证 UI 接线，不写真实 settings.yaml。
//
// 覆盖单测（settings-dialog 无组件单测）测不到的真实浏览器行为：
//   Radix Dialog 打开 → root view 三胶囊 → 点 Pi runtime 进 detail → Active preset 选择器
//   （None = 停用）+ Add preset 按钮 + 无预设空态 → 打开 PiPresetDialog → 输入框按 provider
//   authType 适配（api_key/both/unknown → apiKey 输入框；oauth → 提示块无输入框）+ api 下拉仅
//   baseUrl 非空时渲染 → 关闭 → Back 返回 root。Save 落盘/重启读回/mask 已由 api 单测覆盖
//   （settings-routes.test.ts），此处不写盘防污染真实 settings.yaml。
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

    console.log("Part 3: 点 Pi runtime → detail 渲染（activePreset 选择 + 预设列表）");
    await dialog.getByRole("button", { name: "Pi runtime" }).click();

    // hint（settings.piHint en 文案）——含 "active pi preset" 区分于 label。
    ok(
      await dialog
        .getByText("Global chat sessions run on the active pi preset.", { exact: false })
        .isVisible(),
      "pi hint 文案渲染",
    );
    // Active preset 选择器：无激活时 label = None (pi disabled)。
    ok(
      await dialog.getByRole("button", { name: "None (pi disabled)" }).isVisible(),
      "Active preset 选择器（None = 停用）",
    );
    // Add preset 按钮 + 无预设空态。
    ok(await dialog.getByRole("button", { name: "Add preset" }).isVisible(), "Add preset 按钮");
    ok(
      await dialog
        .getByText("No presets yet. Add one to configure a provider and model.", { exact: false })
        .isVisible(),
      "无预设空态文案",
    );
    // Save（activePreset 选择 Card 的 Save）。
    ok(await dialog.getByRole("button", { name: "Save" }).isVisible(), "Save 按钮");

    console.log("Part 4: 打开 PiPresetDialog → 输入框按 provider authType 适配");
    await dialog.getByRole("button", { name: "Add preset" }).click();
    // 新建态 dialog：label/provider/model/apiKey/baseUrl 5 个输入框（未选 provider → unknown → apiKey 渲染）。
    const inputs = dialog.locator("input");
    const count = await inputs.count();
    ok(
      count === 5,
      `PiPresetDialog 初始 5 个输入框（label/provider/model/apiKey/baseUrl），实际 ${count}`,
    );
    ok(
      await dialog.getByText("Provider", { exact: true }).first().isVisible(),
      "Provider 字段 label",
    );
    // provider 选择器（内置枚举）：trigger 可见 → 点开 → 菜单含内置 provider → 点选
    // Anthropic → provider input 值同步为 id。桌面 1280×900 走 DropdownMenu popover（body portal，
    // 用 page 级定位；现有 activePreset 菜单未展开，无 menuitem 冲突）。
    ok(
      await dialog.getByRole("button", { name: "Select built-in provider" }).isVisible(),
      "provider 选择器 trigger（fallback label）",
    );
    await dialog.getByRole("button", { name: "Select built-in provider" }).click();
    ok(
      await page.getByRole("menuitem", { name: /Anthropic/ }).isVisible(),
      "选择器菜单含内置 provider（Anthropic，label=显示名）",
    );
    await page.getByRole("menuitem", { name: /Anthropic/ }).click();
    await page.waitForFunction(
      () => document.querySelector('input[placeholder="anthropic"]')?.value === "anthropic",
    );
    ok(
      (await dialog.locator('input[placeholder="anthropic"]').inputValue()) === "anthropic",
      "点选内置 provider → input 同步显示 id",
    );
    ok(await dialog.getByText("Model", { exact: true }).first().isVisible(), "Model 字段 label");
    ok(
      await dialog.getByText("API key", { exact: true }).first().isVisible(),
      "API key 字段 label（api_key 型 provider）",
    );
    ok(
      await dialog.getByText("Base URL", { exact: true }).first().isVisible(),
      "Base URL 字段 label",
    );
    // 切到纯 OAuth provider（openai-codex）→ apiKey 输入框消失 + OAuth 提示块出现。
    // Radix exit 动画期间旧菜单 content 仍挂载，立即点 trigger 会 toggle 关闭——先等菜单
    // 完全消失再开新菜单。
    await page.waitForFunction(() => !document.querySelector('[role="menuitem"]'));
    await dialog.getByRole("button", { name: "Anthropic" }).click();
    await page.getByRole("menuitem", { name: /OpenAI Codex/ }).waitFor({ state: "visible" });
    await page.getByRole("menuitem", { name: /OpenAI Codex/ }).click();
    await page.waitForFunction(
      () => document.querySelector('input[placeholder="anthropic"]')?.value === "openai-codex",
    );
    ok(
      (await dialog.locator('input[placeholder="anthropic"]').inputValue()) === "openai-codex",
      "切到 OpenAI Codex → input 同步显示 id",
    );
    ok(
      (await dialog.locator("input").count()) === 4,
      "OAuth 型 provider → apiKey 输入框消失（剩 label/provider/model/baseUrl 4 个）",
    );
    ok(
      await dialog
        .getByText("This provider signs in via OAuth subscription.", { exact: false })
        .isVisible(),
      "OAuth 提示块出现（piAuthOauthHint）",
    );
    // 切回 Anthropic（both 型）→ apiKey 输入框回来。
    await page.waitForFunction(() => !document.querySelector('[role="menuitem"]'));
    await dialog.getByRole("button", { name: "OpenAI Codex" }).click();
    await page.getByRole("menuitem", { name: /Anthropic/ }).waitFor({ state: "visible" });
    await page.getByRole("menuitem", { name: /Anthropic/ }).click();
    await page.waitForFunction(
      () => document.querySelector('input[placeholder="anthropic"]')?.value === "anthropic",
    );
    ok((await dialog.locator("input").count()) === 5, "切回 Anthropic → apiKey 输入框回来（5 个）");
    // baseUrl 空 → api 下拉不渲染。
    ok(
      (await dialog.getByRole("button", { name: "Default (openai-completions)" }).count()) === 0,
      "baseUrl 空时 api 下拉不渲染",
    );
    // 填 baseUrl → api 下拉出现。
    await dialog
      .locator('input[placeholder="https://api.example.com"]')
      .fill("http://localhost:11434/v1");
    ok(
      await dialog.getByRole("button", { name: "Default (openai-completions)" }).isVisible(),
      "填 baseUrl 后 api 下拉出现",
    );
    // 关闭 dialog（不保存，防污染真实 settings.yaml）。
    await dialog.getByRole("button", { name: "Cancel" }).click();
    ok(
      await dialog.getByRole("button", { name: "Add preset" }).isVisible(),
      "关闭 PiPresetDialog 后回 detail",
    );

    console.log("Part 5: Back 返回 root");
    await dialog.getByRole("button", { name: "Back" }).click();
    ok(await dialog.getByRole("button", { name: "General" }).isVisible(), "Back 后回 root view");
  } finally {
    await browser.close();
  }

  console.log(`\n${passCount} pass, ${failCount} fail`);
  if (failCount > 0) process.exit(1);
}

run();
