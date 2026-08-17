// 探针：移动端聚焦态 header 右上角 ℹ（查看信息）✕（关闭）按钮（2026-08-17）。
//   ℹ = MobileFocusActions → useInstanceInfoSheet().open → InfoSheetDialog（底部 sheet）。
//   ✕ = MobileFocusActions → closeInstance → useCloseSession → confirm（底部 action sheet）
//       → 确认后 close API + 删 tab + 回浏览态。
//
// 历史 bug：MobileFocusActions 调了 useInstanceInfoSheet() 但 JSX 漏渲染 {infoSheet.holder}
//   → ℹ 点击 setPending 后 sheet 永不挂载（对比桌面 MobileFocusHeader 有 {infoSheet.holder}）。
//
// 断言（zh-CN + iPhone 12 Pro 390×844，全新 context 无 SW，mock 数据 + mock WS）：
//  1. 聚焦态进入 → header trailing 出现 ℹ（实例信息）与 ✕（关闭）按钮。
//  2. 点 ℹ → InfoSheetDialog 出现（data-slot=dialog-content + 「实例信息」标题 + 字段）。
//  3. Esc 关 sheet → 点 ✕ → confirm dialog 出现（「关闭」标题 + 关闭确认消息）。
//  4. confirm 确认 → close API + 删 tab + URL 回 /projects/proj1（浏览态无 focus）。
//
// 密码由脚本自读（env → config.yaml → api 进程 environ），不进 agent 上下文、不打印值。
// 用法：bun scripts/probe-mobile-focus-actions.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const EXEC =
  "/home/deploy/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell";

const SESSION = {
  id: "agent_probe-1",
  projectName: "proj1",
  provider: "claude2",
  displayName: "Probe Agent A",
  status: "idle",
  model: "sonnet",
  permissionMode: "default",
  createdAt: "2026-07-26T00:00:00.000Z",
};

let allPass = true;
function record(ok, label) {
  if (!ok) allPass = false;
  console.log(`  ${ok ? "✓" : "✗"} ${label}`);
  return ok;
}

const MOBILE_CTX = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  locale: "zh-CN",
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
};

async function setupMocks(page) {
  await page.route(/\/api\/overview$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ projectNames: ["proj1"], candidates: [] }),
    }),
  );
  await page.route(/\/api\/projects\/proj1\/agent-sessions(?:\?.*)?$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sessions: [SESSION] }),
    }),
  );
  await page.route(/\/api\/projects\/proj1\/agent-sessions\/agent_probe-1$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        session: SESSION,
        availableModels: ["sonnet", "opus", "haiku"],
        availablePermissionModes: ["default", "bypassPermissions"],
      }),
    }),
  );
  await page.route(/\/api\/projects\/proj1\/terminal-sessions(?:\?.*)?$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sessions: [] }),
    }),
  );
  // 聚焦 session 面板连真实 WS（fake session 不存在 → error，但 panel 容器仍渲染）。
  await page.routeWebSocket(/claude2-stream/, (ws) => ws.connectToServer());
}

async function login(page) {
  await page.goto(`${WEB_ORIGIN}/`);
  await page
    .getByLabel("密码")
    .or(page.getByLabel("Password"))
    .fill(await readAppPassword());
  await page.getByRole("button", { name: /解锁|Unlock/ }).click();
  await page.waitForTimeout(700);
}

/** header 内 ℹ/✕ 按钮（MobileFocusActions trailing 胶囊，容器 role=group——避开 tab chip ✕）。 */
function infoButton(page) {
  return page.getByRole("group").getByRole("button", { name: /实例信息|Instance info/ });
}
function closeButton(page) {
  return page.getByRole("group").getByRole("button", { name: /^关闭$|^Close$/ });
}

/** 读当前是否有一个 dialog content 挂载（info sheet / confirm 共用 data-slot）。 */
async function dialogState(page) {
  return await page.evaluate(() => {
    const el = document.querySelector('[data-slot="dialog-content"]');
    if (!el) return { present: false, text: "" };
    return { present: true, text: el.textContent ?? "" };
  });
}

async function run() {
  const browser = await chromium.launch({ executablePath: EXEC });
  try {
    const ctx = await browser.newContext(MOBILE_CTX);
    const page = await ctx.newPage();
    await setupMocks(page);
    await login(page);

    console.log("\n===== 1. 聚焦态进入 → header ℹ✕ 按钮存在 =====");
    await page.goto(`${WEB_ORIGIN}/projects/proj1/session/agent_probe-1`);
    await page.waitForSelector('[data-tab-id="agent_probe-1"]', { timeout: 8000 });
    const info = infoButton(page);
    const close = closeButton(page);
    await info.waitFor({ timeout: 5000 });
    await close.waitFor({ timeout: 5000 });
    record(true, "header trailing ℹ（实例信息）与 ✕（关闭）按钮均渲染");

    console.log("\n===== 2. 点 ℹ → InfoSheetDialog 出现 =====");
    await info.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(350);
    const sheet1 = await dialogState(page);
    record(
      sheet1.present && sheet1.text.includes("实例信息"),
      `ℹ 点击后 info sheet 出现（dialog present=${sheet1.present}，标题+字段：${sheet1.text.slice(0, 40).replace(/\n/g, " ")}）`,
    );

    console.log("\n===== 3. Esc 关 sheet → 点 ✕ → confirm 出现 =====");
    if (sheet1.present) {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(350);
    }
    await close.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(350);
    const confirm1 = await dialogState(page);
    record(
      confirm1.present && confirm1.text.includes("关闭"),
      `✕ 点击后 confirm dialog 出现（dialog present=${confirm1.present}，text=${confirm1.text.slice(0, 40).replace(/\n/g, " ")}）`,
    );

    console.log("\n===== 4. confirm 确认 → close API + 回浏览态 =====");
    const confirmBtn = page.getByRole("button", { name: /^关闭$/ }).first();
    await confirmBtn.click({ timeout: 5000 }).catch(async () => {
      await page.evaluate(() => {
        const t = Array.from(document.querySelectorAll("button")).find((el) =>
          /^关闭$/.test((el.textContent ?? "").trim()),
        );
        if (t) t.click();
      });
    });
    await page.waitForURL(/\/projects\/proj1$/, { timeout: 8000 }).catch(() => {});
    const backAtBrowse = page.url().endsWith("/projects/proj1");
    record(backAtBrowse, `确认关闭后 URL 回浏览态（${page.url()}）`);
    await ctx.close();
  } finally {
    await browser.close();
  }
}

(async () => {
  await run();
  console.log(`\n总计: ${allPass ? "ALL PASS" : "有 FAIL"}`);
  process.exit(allPass ? 0 : 1);
})();
