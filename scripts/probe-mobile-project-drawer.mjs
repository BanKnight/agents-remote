// 探针：移动端项目工作台（侧边栏 drawer + header 内容 tab 带，2026-08-16 重设计，设计
// workbench-views §7.7）。桌面左栏+中栏在窄屏的两栏投影：drawer（Radix Dialog 左抽屉）+
// MobileTabStrip（projectTabStrip 纯投影）。
//
// 断言（zh-CN + iPhone 12 Pro 390×844，全新 context 无 SW）：
//  1. 进 /projects/proj1 → drawer 默认展开（dialog 可见 + scrim 在 + 宽度 = min(88vw,340px) = 340px）。
//  2. 7 个段文字标签（总览/历史/文件/Git/页面/Wiki/插件）按序渲染。
//  3. 点总览会话行 → URL 变 /projects/proj1/session/agent_probe-1 + drawer 关 + tab 带出现
//     该会话 chip（active）。
//  4. ☰ 重开 drawer；点 scrim（drawer 右缘外）关闭。
//  5. tab ✕ → layout 更新（chip 消失）+ URL 回 /projects/proj1（无 focus）+ 会话仍存活
//     （浏览态 grid 仍有该会话卡）。
//  6. 项目 scope 底部无一级 nav（移动端主导航）；/projects（global）有一级 nav。
//  7. 浏览态（drawer 关）InstanceGrid + FAB（新建会话）可见。
//  8. tab 带只显示当前项目：预置 layout 含 proj1+proj2 会话 tab → proj1 strip 只有 proj1 chip
//     （proj2 被 projectTabStrip 过滤）。
//
// 密码由脚本自读（env → config.yaml → api 进程 environ），不进 agent 上下文、不打印值。
// 用法：bun scripts/probe-mobile-project-drawer.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const EXEC =
  "/home/deploy/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell";

const AGENT_A = {
  id: "agent_probe-1",
  projectName: "proj1",
  provider: "claude2",
  displayName: "Probe Agent A",
  status: "idle",
  createdAt: "2026-07-26T00:00:00.000Z",
};
const AGENT_B = {
  id: "agent_probe-2",
  projectName: "proj2",
  provider: "claude2",
  displayName: "Probe Agent B",
  status: "idle",
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

function sessionDetail(session) {
  return {
    session,
    availableModels: ["sonnet", "opus", "haiku"],
    availablePermissionModes: ["default", "bypassPermissions"],
  };
}

async function setupMocks(page, { includeProj2 = false } = {}) {
  await page.route(/\/api\/overview$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ projectNames: ["proj1", "proj2"], candidates: [] }),
    }),
  );
  // proj1 会话（列表 + 详情）：drawer 总览 grid + tab chip label（usePanelMeta）数据源。
  await page.route(/\/api\/projects\/proj1\/agent-sessions(?:\?.*)?$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sessions: [AGENT_A] }),
    }),
  );
  await page.route(/\/api\/projects\/proj1\/agent-sessions\/agent_probe-1$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(sessionDetail(AGENT_A)),
    }),
  );
  await page.route(/\/api\/projects\/proj1\/terminal-sessions(?:\?.*)?$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sessions: [] }),
    }),
  );
  if (includeProj2) {
    await page.route(/\/api\/projects\/proj2\/agent-sessions(?:\?.*)?$/, (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ sessions: [AGENT_B] }),
      }),
    );
    await page.route(/\/api\/projects\/proj2\/agent-sessions\/agent_probe-2$/, (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(sessionDetail(AGENT_B)),
      }),
    );
    await page.route(/\/api\/projects\/proj2\/terminal-sessions(?:\?.*)?$/, (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ sessions: [] }),
      }),
    );
  }
  // 聚焦 session 面板连真实 WS（fake session 不存在 → error，但 panel 容器仍渲染，几何可测）。
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

// 等待 drawer dialog 可见 + 进入动画播完（slide-in-from-left 300ms）。
async function waitDrawerVisible(page) {
  const dialog = page.locator('[role="dialog"]');
  await dialog.waitFor({ state: "visible", timeout: 8000 });
  await page.waitForTimeout(450);
  return dialog;
}

const TAB_CHIP = "div.group\\/tab";

async function run() {
  const browser = await chromium.launch({ executablePath: EXEC });
  try {
    // ── 主 context：断言 1-7 ──────────────────────────────────────────────
    const ctx = await browser.newContext(MOBILE_CTX);
    const page = await ctx.newPage();
    await setupMocks(page);
    await login(page);

    console.log("\n===== 1. 进 /projects/proj1 → drawer 默认展开 =====");
    await page.goto(`${WEB_ORIGIN}/projects/proj1`);
    const dialog = await waitDrawerVisible(page);
    const dBox = await dialog.boundingBox();
    record(
      dBox !== null && Math.abs(dBox.width - 340) <= 1,
      `drawer 宽度 = min(88vw,340px) = 340（实际 ${dBox?.width?.toFixed(1)}）`,
    );
    record(dBox !== null && Math.abs(dBox.x) <= 1, `drawer 贴左缘（x=${dBox?.x?.toFixed(1)}）`);
    const overlay = page.locator('[data-slot="dialog-overlay"]');
    await overlay.waitFor({ state: "visible", timeout: 5000 });
    const oBox = await overlay.boundingBox();
    record(
      oBox !== null && oBox.width >= 389 && oBox.height >= 843,
      `scrim 全屏（${oBox?.width?.toFixed(0)}×${oBox?.height?.toFixed(0)}）`,
    );

    console.log("\n===== 2. 7 个段文字标签 =====");
    const nav = page.getByRole("navigation", { name: "项目侧边栏" });
    await nav.waitFor({ timeout: 5000 });
    const labels = await nav.getByRole("button").allTextContents();
    const expected = ["总览", "历史", "文件", "Git", "页面", "Wiki", "插件"];
    record(
      labels.length === expected.length && labels.every((l, i) => l.trim() === expected[i]),
      `7 段文字按序渲染（实际 ${labels.map((l) => l.trim()).join("/")}）`,
    );

    console.log("\n===== 3. 点会话行 → focus + drawer 关 + tab 带 active chip =====");
    const card = page.locator('[role="dialog"] [role="button"]', { hasText: "Probe Agent A" });
    await card.click({ timeout: 5000 });
    await page.waitForURL(/\/projects\/proj1\/session\/agent_probe-1/, { timeout: 8000 });
    await page.locator('[role="dialog"]').waitFor({ state: "hidden", timeout: 8000 });
    const chip = page.locator(TAB_CHIP, { hasText: "Probe Agent A" });
    await chip.waitFor({ timeout: 8000 });
    const chipActive = await chip
      .getAttribute("class")
      .then((c) => (c ?? "").includes("bg-primary/10"));
    record(chipActive, "tab 带出现该会话 chip 且 active（bg-primary/10）");

    console.log("\n===== 4. ☰ 重开 drawer；点 scrim 关闭 =====");
    await page.getByRole("button", { name: "切换侧边栏" }).click({ timeout: 5000 });
    await waitDrawerVisible(page);
    record(true, "☰ 重开 drawer 可见");
    await page.locator('[data-slot="dialog-overlay"]').click({ position: { x: 380, y: 400 } });
    await page.locator('[role="dialog"]').waitFor({ state: "hidden", timeout: 8000 });
    record(true, "点 scrim 关闭 drawer");

    console.log("\n===== 5. tab ✕ → chip 消失 + URL 回浏览态 + 会话存活 =====");
    const closeBtn = chip.getByRole("button", { name: "关闭" });
    await closeBtn.click({ timeout: 5000 });
    await page.waitForURL(/\/projects\/proj1$/, { timeout: 8000 });
    await page.waitForFunction(() => document.querySelectorAll("div.group\\/tab").length === 0, {
      timeout: 8000,
    });
    record(true, "✕ 后 tab 带空（layout 已移除 tab）");
    const alive = page.locator('[role="button"]', { hasText: "Probe Agent A" });
    await alive.waitFor({ timeout: 8000 });
    record(true, "会话仍存活（浏览态 grid 仍有该会话卡）");

    console.log("\n===== 6. 项目 scope 无一级 nav / global 有一级 nav =====");
    const primaryNav = page.getByRole("navigation", { name: "移动端主导航" });
    record((await primaryNav.count()) === 0, "/projects/proj1（project scope）无底部一级 nav");
    await page.goto(`${WEB_ORIGIN}/projects`);
    await page.waitForTimeout(600);
    record((await primaryNav.count()) === 1, "/projects（global）有底部一级 nav");

    console.log("\n===== 7. 浏览态 InstanceGrid + FAB 可见 =====");
    // 回 proj1 浏览态（无 focus）：drawer 默认展开会挡，先关掉。
    await page.goto(`${WEB_ORIGIN}/projects/proj1`);
    await waitDrawerVisible(page);
    await page.locator('[data-slot="dialog-overlay"]').click({ position: { x: 380, y: 400 } });
    await page.locator('[role="dialog"]').waitFor({ state: "hidden", timeout: 8000 });
    await page.waitForTimeout(400);
    const fab = page.getByRole("button", { name: "新建会话" });
    await fab.waitFor({ timeout: 5000 });
    const gridCard = page.locator('[role="button"]', { hasText: "Probe Agent A" });
    await gridCard.waitFor({ timeout: 5000 });
    record(true, "浏览态 FAB（新建会话）+ InstanceGrid 会话卡可见");
    await ctx.close();

    // ── context 2：断言 8（预置 layout，只显示当前项目 tab）──────────────
    console.log("\n===== 8. tab 带只显示当前项目（proj1 strip 过滤 proj2）=====");
    const ctx2 = await browser.newContext(MOBILE_CTX);
    const page2 = await ctx2.newPage();
    await setupMocks(page2, { includeProj2: true });
    await login(page2);
    // 预置 layout：同一 leaf 内 proj1 + proj2 两个会话 tab（同源 workbenchLayoutV4）。
    await page2.evaluate(() => {
      localStorage.setItem(
        "workbenchLayoutV4",
        JSON.stringify({
          root: {
            kind: "leaf",
            id: "leaf-seed",
            tabs: [
              { kind: "session", projectName: "proj1", sessionId: "agent_probe-1" },
              { kind: "session", projectName: "proj2", sessionId: "agent_probe-2" },
            ],
            activeTabId: "agent_probe-1",
          },
          activeGroupId: "leaf-seed",
          maximized: null,
        }),
      );
    });
    await page2.goto(`${WEB_ORIGIN}/projects/proj1`);
    await waitDrawerVisible(page2);
    await page2.waitForSelector(TAB_CHIP, { timeout: 8000 });
    const chips = page2.locator(TAB_CHIP);
    const chipCount = await chips.count();
    const chipTexts = await chips.allTextContents();
    record(
      chipCount === 1 && chipTexts.some((t) => t.includes("Probe Agent A")),
      `proj1 strip 只有 proj1 chip（count=${chipCount}，texts=${chipTexts.join("|")}）`,
    );
    record(
      !chipTexts.some((t) => t.includes("Probe Agent B")),
      "proj2 会话 tab 被过滤（无 Probe Agent B）",
    );
    await ctx2.close();
  } finally {
    await browser.close();
  }
}

(async () => {
  await run();
  console.log(`\n总计: ${allPass ? "ALL PASS" : "有 FAIL"}`);
  process.exit(allPass ? 0 : 1);
})();
