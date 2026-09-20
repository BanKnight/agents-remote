// 探针：设置弹窗 ACP agents 配置区（per-provider 凭据切片）——只读验证 UI 接线，不写真实 settings.yaml。
//
// 覆盖单测（settings-dialog 无组件单测）测不到的真实浏览器行为：
//   Radix Dialog root view 含 ACP agents 胶囊 → 进 detail → provider 列表来自
//   GET /api/agent-providers（profile 注册表投影），只渲染 transport=acp 的卡片（omp），
//   非 acp transport（claude/codex）不出现。omp 卡：acpHint + 注入 env 名
//   （ANTHROPIC_API_KEY / ANTHROPIC_BASE_URL，font-mono）+ apiKey placeholder 分态
//   （已配置 masked 回显 / 未配置「Not configured」空态）+ baseUrl 明文回填。
//   Save 落盘三态语义/空切片删除/mask 已由 api 单测覆盖（settings-routes.test.ts），
//   此处不写盘防污染真实 settings.yaml。
//
// locale=en-US 对齐 nav.settings / settings.section.acp 稳定文案。密码自读不打印。
// 用法：bun scripts/probe-settings-acp-dialog.mjs
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
  // utility（hint 灰阶 / env 名 font-mono），验证 CSS 已落盘即可。
  const css = await verifyCssFlushed({
    origin: WEB_ORIGIN,
    expectClasses: ["text-on-surface-muted", "font-mono"],
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
    await page.getByLabel("Access password").fill(await readAppPassword());
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForSelector("nav[aria-label]", { timeout: 10000 });

    // ActivityBar 设置按钮 → 居中 SettingsDialog（root view）。
    await page.getByRole("button", { name: "Settings" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ timeout: 5000 });

    console.log("Part 2: root view 含 ACP agents 胶囊");
    ok(await dialog.getByRole("button", { name: "ACP agents" }).isVisible(), "胶囊 ACP agents");

    console.log("Part 3: 进 detail → per-provider 凭据卡（omp）");
    await dialog.getByRole("button", { name: "ACP agents" }).click();

    // 凭据卡依赖 GET /api/agent-providers 异步返回（首帧空数组）——先等首卡渲染。
    await dialog.getByText("omp", { exact: true }).waitFor({ timeout: 5000 });
    // 卡片 label = profile 的 label（omp）；通用 hint 文案（acpHint en）。
    ok(await dialog.getByText("omp", { exact: true }).isVisible(), "omp 凭据卡 label");
    ok(
      await dialog
        .getByText("Credentials are injected into the agent process at spawn", { exact: false })
        .isVisible(),
      "acpHint 文案渲染（spawn 注入 + 新会话生效）",
    );
    // env 注入名（profile 投影，font-mono 展示；技术标识不翻译）。
    const envSpan = dialog.locator("span.font-mono", { hasText: "ANTHROPIC_API_KEY" });
    ok(
      (await envSpan.count()) === 1 &&
        (await envSpan.textContent()) === "ANTHROPIC_API_KEY / ANTHROPIC_BASE_URL",
      "env hint = ANTHROPIC_API_KEY / ANTHROPIC_BASE_URL（仅 1 处）",
    );
    // 非 acp transport 的 provider 不渲染（claude/codex 无凭据卡）。
    ok(
      (await dialog.getByText("Claude", { exact: true }).count()) === 0 &&
        (await dialog.getByText("Codex", { exact: true }).count()) === 0,
      "claude/codex 卡不出现（只渲染 transport=acp）",
    );

    console.log("Part 4: apiKey/baseUrl 输入态（masked 回显 / 未配置空态）");
    const apiKeyInput = dialog.locator("input").nth(0);
    const apiKeyPlaceholder = await apiKeyInput.getAttribute("placeholder");
    // 已配置 → masked（前 7...末 4 或短 key 前 2...末 2）；未配置 → 「Not configured」
    // （凭据 provider 平权：未配置走 agent 自身凭证链，不借用其它 runtime）。两种合法
    // 态都接受，断言非空且非明文。
    const isMasked = typeof apiKeyPlaceholder === "string" && /\.{3}/.test(apiKeyPlaceholder);
    const isBlankCopy = apiKeyPlaceholder === "Not configured";
    ok(
      isMasked || isBlankCopy,
      `apiKey placeholder 合法态（masked 或「Not configured」），实际「${apiKeyPlaceholder}」`,
    );
    ok(
      !(apiKeyPlaceholder ?? "").includes("sk-") || isMasked,
      "placeholder 不回显明文 key（masked 规则）",
    );
    const baseUrlInput = dialog.locator('input[placeholder="https://api.anthropic.com"]');
    ok(await baseUrlInput.isVisible(), "baseUrl 输入框（明文回填，官方端点 placeholder）");

    console.log("Part 5: 初始无 dirty → Save disabled（三态语义入口就绪，不落盘）");
    const saveButtons = dialog.getByRole("button", { name: "Save", exact: true });
    ok((await saveButtons.count()) === 1, "仅一张凭据卡一个 Save");
    ok(await saveButtons.isDisabled(), "无改动时 Save disabled");
  } finally {
    await browser.close();
  }

  console.log(`\n${passCount} pass, ${failCount} fail`);
  if (failCount > 0) process.exit(1);
}

run();
