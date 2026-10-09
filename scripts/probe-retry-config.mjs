// 探针：v1.6 批 v6.4——实例信息「会话目录」行 + 自动重试编辑器控件化（2026-10-09）。
// 覆盖：① agent info sheet「会话目录」行（mono、项目 path 派生）；② retry 编辑 sheet
// （移动）控件族：toggle 行 / 次数上限 stepper（边界防呆）/ 重试间隔档位选择器（ActionMenu
// 点开选档、当前档 ✓）/ 重发文案内联输入 / kfoot 脚注；③ 即点即存：＋/−/选档/文案防抖
// 各发一次 POST /auto-retry；④ 桌面 Dialog 容器同款控件 + 即点即存。
//
// 密码由脚本自读（env → config.yaml → api 进程 environ），不进 agent 上下文、不打印值。
// 用法：bun scripts/probe-retry-config.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const EXEC =
  "/home/deploy/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell";

const PROJECT_PATH = "/home/deploy/srv/agents-web";
const AGENT = {
  id: "agent_probe-retry-1",
  projectName: "proj1",
  provider: "claude",
  displayName: "Probe Retry Agent",
  status: "idle",
  createdAt: "2026-08-17T00:00:00.000Z",
  model: "sonnet",
  permissionMode: "default",
  claudeSessionId: "claude-resume-uuid-1234-5678",
  autoRetry: {
    enabled: true,
    message: "请继续",
    delayMs: 45_000,
    maxPerWindow: 3,
    windowMs: 1_800_000,
  },
};

let allPass = true;
function record(ok, label) {
  if (!ok) allPass = false;
  console.log(`  ${ok ? "✓" : "✗"} ${label}`);
  return ok;
}

const MOBILE_CTX = {
  viewport: { width: 390, height: 844 },
  locale: "zh-CN",
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
};

const DESKTOP_CTX = {
  viewport: { width: 1280, height: 900 },
  locale: "zh-CN",
};

let RETRY_POSTS = 0;
let RETRY_LAST_BODY = null;

function sessionDetail(session) {
  return {
    session,
    availableModels: ["sonnet", "opus"],
    availablePermissionModes: ["default", "bypassPermissions"],
  };
}

async function setupMocks(page) {
  RETRY_POSTS = 0;
  RETRY_LAST_BODY = null;
  // 复位模块级 AGENT.autoRetry（上一段 run 的 POST 会污染，跨段断言基线要一致）。
  AGENT.autoRetry = {
    enabled: true,
    message: "请继续",
    delayMs: 45_000,
    maxPerWindow: 3,
    windowMs: 1_800_000,
  };
  await page.route(/\/api\/overview$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ projectNames: ["proj1"], candidates: [] }),
    }),
  );
  await page.route(new RegExp(`/api/projects/proj1$`), (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        project: {
          name: "proj1",
          path: PROJECT_PATH,
          agentSessionCount: 1,
          terminalSessionCount: 0,
        },
      }),
    }),
  );
  await page.route(new RegExp(`/api/projects/proj1/agent-sessions(?:\\?.*)?$`), (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sessions: [AGENT] }),
    }),
  );
  await page.route(new RegExp(`/api/projects/proj1/agent-sessions/${AGENT.id}$`), (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(sessionDetail(AGENT)),
    }),
  );
  // auto-retry 保存：计数 + 把 body.config 落回 AGENT.autoRetry（detail invalidate 后 refetch 拿新值）。
  await page.route(/\/auto-retry$/, (r) => {
    if (r.request().method() === "POST") {
      RETRY_POSTS += 1;
      RETRY_LAST_BODY = r.request().postDataJSON();
      AGENT.autoRetry = RETRY_LAST_BODY.config;
    }
    return r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ session: AGENT }),
    });
  });
  await page.route(new RegExp(`/api/projects/proj1/terminal-sessions(?:\\?.*)?$`), (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sessions: [] }),
    }),
  );
  await page.route(/\/api\/state\/overview\/pinned-sessions/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sessions: [] }),
    }),
  );
}

async function login(page) {
  await page.goto(`${WEB_ORIGIN}/`);
  await page.waitForSelector('input[type="password"]', { timeout: 15000 });
  await page.getByLabel("访问密码").fill(await readAppPassword());
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForTimeout(700);
}

async function openRetrySheetMobile(page) {
  // 直接导航到会话聚焦态（▾ 菜单/卡片点击导航的等价终态），⋯ → 实例信息 → 编辑。
  await page.goto(`${WEB_ORIGIN}/projects/proj1/session/${AGENT.id}`);
  await page.waitForTimeout(1200);
  const moreBtn = page.locator('.nav button[aria-label="更多操作"]');
  await moreBtn.waitFor({ timeout: 8000 });
  await moreBtn.click();
  await page.waitForTimeout(450);
  await page.getByRole("menuitem", { name: "实例信息" }).dispatchEvent("click");
  await page.waitForTimeout(600);
  // 会话目录行（v1.6 workspace-instance-info）：agent info sheet 落行、值 = 项目 path、mono。
  const sheetText = await page
    .locator('[data-slot="sheet-content"][data-state="open"], [role="dialog"][data-state="open"]')
    .last()
    .textContent();
  record(
    sheetText?.includes("会话目录") === true && sheetText?.includes(PROJECT_PATH) === true,
    "agent info sheet 含「会话目录」行（值 = 项目 path）",
  );
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await page.waitForTimeout(500);
}

async function runMobile() {
  const browser = await chromium.launch({ executablePath: EXEC });
  try {
    const ctx = await browser.newContext(MOBILE_CTX);
    const page = await ctx.newPage();
    await setupMocks(page);
    await login(page);

    console.log("\n===== Part 1. 会话目录行（info sheet）=====");
    await page.goto(`${WEB_ORIGIN}/projects/proj1`);
    await openRetrySheetMobile(page);
    // 回到 info sheet：retry sheet 关闭后 info sheet 还开着（两个独立 MobileSheet——不对，
    // retry 编辑器 MobileSheet 是 hook holder，info sheet 独立 holder，两层并存）。
    console.log("\n===== Part 2. retry sheet 控件族 + 即点即存 =====");
    const toggle = page.getByRole("switch", { name: "自动重试" });
    await toggle.waitFor({ timeout: 5000 });
    record(
      (await toggle.getAttribute("aria-checked")) === "true",
      "toggle aria-checked=true（mock 初值 enabled）",
    );
    record((await page.locator('[role="alert"]').count()) === 0, "无 saveError alert");
    const incBtn = page.getByRole("button", { name: "增加次数上限" });
    const decBtn = page.getByRole("button", { name: "减少次数上限" });
    const valueEl = page.getByText(/^\d+ 次$/).first();
    record((await valueEl.textContent()) === "3 次", "stepper 值 = 3 次（mock 初值）");
    const postsAtBaseline = RETRY_POSTS;
    await incBtn.click();
    await page.waitForTimeout(400);
    record(
      (await page
        .getByText(/^\d+ 次$/)
        .first()
        .textContent()) === "4 次",
      "点 ＋ → 4 次（本地即时反馈）",
    );
    record(RETRY_POSTS === postsAtBaseline + 1, "点 ＋ → POST 发出（即点即存）");
    // 边界：连点 ＋ 到 20 → ＋ disabled；− 回到 1 → − disabled。
    for (let i = 4; i < 20; i++) await incBtn.click();
    await page.waitForTimeout(300);
    record((await incBtn.isDisabled()) === true, "连点到上限 20 → ＋ disabled");
    for (let i = 0; i < 19; i++) await decBtn.click();
    await page.waitForTimeout(300);
    record((await decBtn.isDisabled()) === true, "连点减到下限 1 → − disabled");
    for (let i = 1; i < 3; i++) await incBtn.click();
    await page.waitForTimeout(300);

    console.log("\n===== Part 3. 重试间隔档位选择器 =====");
    const delayBtn = page.getByRole("button", { name: "重试间隔" });
    record(
      (await delayBtn.textContent())?.includes("45s · 指数退避") === true,
      "间隔钮显示 45s · 指数退避（mock 初值）",
    );
    await delayBtn.click();
    await page.waitForTimeout(600);
    const menuItem45s = page.getByRole("menuitem", { name: "45s" });
    await menuItem45s.waitFor({ timeout: 5000 });
    record(true, "点开档位菜单（ActionMenu sheet）含 45s 档");
    record((await menuItem45s.textContent())?.includes("✓") === true, "当前档 45s 带 ✓");
    const postsBeforeStep = RETRY_POSTS;
    await menuItem45s.dispatchEvent("click");
    await page.waitForTimeout(500);
    record((await delayBtn.textContent())?.includes("45s") === true, "选档后间隔钮仍 45s");
    record(RETRY_POSTS === postsBeforeStep + 1, "选档 → POST 发出");
    await delayBtn.click();
    await page.waitForTimeout(600);
    await page.getByRole("menuitem", { name: "2m" }).dispatchEvent("click");
    await page.waitForTimeout(500);
    record(
      (await delayBtn.textContent())?.includes("2m · 指数退避") === true,
      "选 2m 档 → 间隔钮 2m · 指数退避",
    );

    console.log("\n===== Part 4. 重发文案防抖保存 =====");
    const msgInput = page.getByRole("textbox", { name: "重发文案" });
    const postsBeforeMsg = RETRY_POSTS;
    await msgInput.fill("换个文案再试一次");
    record(RETRY_POSTS === postsBeforeMsg, "输入立即值不发 POST（防抖中）");
    await page.waitForTimeout(1400);
    record(RETRY_POSTS === postsBeforeMsg + 1, "停顿 800ms 后 POST 发出（防抖保存）");
    record(RETRY_LAST_BODY?.config?.message === "换个文案再试一次", "POST body.config 携带新文案");

    console.log("\n===== Part 5. toggle 行即点即存 =====");
    const postsBeforeToggle = RETRY_POSTS;
    await toggle.click();
    await page.waitForTimeout(400);
    record(
      (await toggle.getAttribute("aria-checked")) === "false",
      "点 toggle → aria-checked=false（本地即时）",
    );
    record(RETRY_POSTS === postsBeforeToggle + 1, "toggle → POST 发出");
    await toggle.click();
    await page.waitForTimeout(400);

    console.log("\n===== Part 6. 移动容器形态断言 =====");
    const sheetEl = page.locator('[data-slot="sheet-content"], [role="dialog"]').last();
    const sheetText = await sheetEl.textContent();
    record(sheetText?.includes("仅对本会话生效 · 覆盖全局默认") === true, "副题在 sheet 内");
    record(sheetText?.includes("ⓘ 触发条件 = API 错误") === true, "kfoot 脚注在 sheet 内");
  } finally {
    await browser.close();
  }
}

async function runDesktop() {
  const browser = await chromium.launch({ executablePath: EXEC });
  try {
    const ctx = await browser.newContext(DESKTOP_CTX);
    const page = await ctx.newPage();
    await setupMocks(page);
    await login(page);

    console.log("\n===== Part 7. 桌面聚焦 → ⋯ 菜单 → info modal → retry Dialog =====");
    await page.goto(`${WEB_ORIGIN}/projects/proj1/session/${AGENT.id}`);
    await page.waitForTimeout(1200);
    const moreBtn = page.locator('button[aria-label="更多操作"]').first();
    await moreBtn.waitFor({ timeout: 8000 });
    await moreBtn.click();
    await page.waitForTimeout(450);
    await page.getByRole("menuitem", { name: "实例信息" }).dispatchEvent("click");
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: "编辑", exact: true }).click();
    await page.waitForTimeout(500);

    const dlg = page.locator('[data-slot="dialog-content"][data-state="open"]').last();
    await dlg.waitFor({ timeout: 5000 });
    const dlgText = await dlg.textContent();
    record(dlgText?.includes("自动重试") === true, "Dialog 标题「自动重试」");
    record(dlgText?.includes("仅对本会话生效 · 覆盖全局默认") === true, "副题在 Dialog 内");
    const postsD = RETRY_POSTS;
    await page.getByRole("button", { name: "增加次数上限" }).dispatchEvent("click");
    await page.waitForTimeout(400);
    record(
      (await page
        .getByText(/^\d+ 次$/)
        .first()
        .textContent()) === "4 次",
      "点 ＋ → 4 次",
    );
    record(RETRY_POSTS === postsD + 1, "桌面 ＋ → POST 发出");
    // 桌面 DropdownMenu trigger 在 pointerdown 开合（click 派发不开），故派 pointerdown。
    await page.getByRole("button", { name: "重试间隔" }).dispatchEvent("pointerdown");
    await page.waitForTimeout(400);
    const item2m = page.getByRole("menuitem", { name: "2m" });
    await item2m.waitFor({ timeout: 5000 });
    record(true, "桌面档位菜单（popover）打开含 2m 档");
    await item2m.dispatchEvent("click");
    await page.waitForTimeout(400);
    record(
      (await page.getByRole("button", { name: "重试间隔" }).textContent())?.includes("2m") === true,
      "选 2m → 间隔钮 2m",
    );
  } finally {
    await browser.close();
  }
}

await runMobile();
await runDesktop();
console.log(allPass ? "\n全部通过 ✓" : "\n存在失败 ✗");
process.exitCode = allPass ? 0 : 1;
