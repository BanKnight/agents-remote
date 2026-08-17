// 探针：移动端项目工作台（侧边栏 drawer + header 内容 tab 带，2026-08-16 重设计，设计
// workbench-views §7.7）。桌面左栏+中栏在窄屏的两栏投影：drawer（Reddit 式 push 整页平移，
// 2026-08-17 二次修正：drawer absolute 左侧静态常驻，页面含 header 整体 translate-x 平移
// 露出、保持视口宽不压缩）+ MobileTabStrip（projectTabStrip 纯投影）。
//
// 断言（zh-CN + iPhone 12 Pro 390×844，全新 context 无 SW）：
//  1. 进 /projects/proj1 → drawer 默认展开（drawer 在窗口左 340px + 页面紧随其后被推右
//     并排无缝（gap≈0 永不叠加）、header 随页面移动、页面保持视口宽不压缩 ≈390，无 scrim）。
//  2. 7 个段文字标签（总览/历史/文件/Git/页面/Wiki/插件）按序渲染。
//  3. 点总览会话行 → URL 变 /projects/proj1/session/agent_probe-1 + drawer 收（平移行整体
//     translate-x=-340 滑回，drawer 移出窗口左缘）+ tab 带出现该会话 chip（active）。
//  4. ☰ 重开 drawer；点页面（被推区域）关闭（替代旧 scrim 点击关闭）。
//  5. tab ✕ → layout 更新（chip 消失）+ URL 回 /projects/proj1（无 focus）+ 会话仍存活
//     （浏览态 grid 仍有该会话卡）。
//  6. 项目 scope 底部无一级 nav（移动端主导航）；/projects（global）有一级 nav。
//  7. 浏览态（drawer 关）InstanceGrid + header 右上角新建按钮（与 ☰ 同 header 行，x>☰）可见。
//  8. tab 带只显示当前项目：预置 layout 含 proj1+proj2 会话 tab → proj1 strip 只有 proj1 chip
//     （proj2 被 projectTabStrip 过滤）。
//  9. 从 global 总览（/projects）点会话卡 → URL 进该会话所属项目的 project scope
//     （/projects/proj1/session/agent_probe-1，非旧 global focus /projects/session/$id）+
//     聚焦态进入 drawer 收起（不遮挡会话）+ tab 带 chip active。
//  10. 页面段新建 dialog（A1 review 修复）：点「添加根」开 PagesRootDialog → Esc 关（drawer 同步收，
//      window keydown 无 dialog 守卫）→ ☰ 重开 → 切总览 → 切回页面 → PagesPanel 重挂
//      （createRequest 仍非零）→ 断言无 dialog 误弹（ref 守卫生效，2026-08-17）。
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

// global 总览 `/api/overview` candidates（useGlobalInstanceCandidates 读 c.sessionId/projectName/
// type/provider/displayName/status/createdAt 聚合 SessionPanelRef）。断言 9 用它渲染 global 会话卡。
const CANDIDATES = [
  {
    sessionId: AGENT_A.id,
    projectName: AGENT_A.projectName,
    type: "agent",
    provider: AGENT_A.provider,
    displayName: AGENT_A.displayName,
    status: AGENT_A.status,
    createdAt: AGENT_A.createdAt,
  },
];

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

async function setupMocks(page, { includeProj2 = false, candidates = [] } = {}) {
  await page.route(/\/api\/overview$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ projectNames: ["proj1", "proj2"], candidates }),
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
  // pages 配置（drawer 页面段 PagesPanel query；断言 10 用它渲染空列表态，零真实网络）。
  await page.route(/\/api\/projects\/proj1\/pages\/config$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ config: { roots: [] } }),
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

// Reddit 式 push 刚体联动（2026-08-17 三次修正）：drawer 与页面并排在同一平移行（flex，
// 永不重叠），行 wrapper 整体 translate-x——打开 = 0（drawer 在窗口左 340px + 页面紧随其后），
// 关闭 = -min(88vw,340px)（drawer 移出窗口左缘、页面正好填满窗口）。页面 layout 宽 =
// 视口宽（basis 撑满行剩余空间），transform 不改 layout 宽 → 不压缩。
// ⚠️ 本常量含逗号（并集），**不可直接 + " 子选择器" 拼接**（逗号会把子选择器只绑到最后
// 一个分支，第一个分支命中 aside 本身）——拼接子选择器用 DRAWER_SCOPE（:is 包裹）。
const DRAWER_ASIDE = 'aside[aria-label*="侧边栏"], aside[aria-label*="sidebar" i]';
/** drawer 作用域（可安全拼接子选择器）。 */
const DRAWER_SCOPE = ':is(aside[aria-label*="侧边栏"], aside[aria-label*="sidebar" i])';

/** aside 的容器 = drawer flex 成员（basis 340）；其父 = 平移行 wrapper；行的下一层结构：
 * drawer 容器.nextElementSibling = 页面容器（flex-1）。 */
// 等待 drawer 展开（平移行 shift 回 0，drawer 在窗口左缘可见）+ 动画播完。
async function waitDrawerVisible(page) {
  await page.waitForFunction(
    () => {
      const aside = document.querySelector(
        'aside[aria-label*="侧边栏"], aside[aria-label*="sidebar" i]',
      );
      if (!aside) return false;
      const drawerBox = aside.getBoundingClientRect();
      // 打开态：drawer 在窗口左缘（x ≈ 0）且完整可见。
      return Math.abs(drawerBox.left) <= 1;
    },
    { timeout: 8000 },
  );
  await page.waitForTimeout(450);
  return page.locator(DRAWER_ASIDE).first();
}

// 等待 drawer 收起（平移行 shift 到 -340，drawer 移出窗口左缘、页面填满窗口）。
async function waitDrawerClosed(page) {
  await page.waitForFunction(
    () => {
      const aside = document.querySelector(
        'aside[aria-label*="侧边栏"], aside[aria-label*="sidebar" i]',
      );
      if (!aside) return false;
      const drawerBox = aside.getBoundingClientRect();
      // 收起态：drawer 整体在窗口左缘外（right ≤ 1）。
      return drawerBox.right <= 1;
    },
    { timeout: 8000 },
  );
}

// 读 drawer + 被推页面几何（刚体联动 + 整页不压缩核心断言）。
async function readDrawerGeometry(page) {
  return await page.evaluate(() => {
    const aside = document.querySelector(
      'aside[aria-label*="侧边栏"], aside[aria-label*="sidebar" i]',
    );
    if (!aside) return null;
    const drawerBox = aside.getBoundingClientRect();
    // 页面容器 = drawer flex 成员的下一个兄弟（平移行内 flex-1）。
    const pageEl = aside.parentElement.nextElementSibling;
    if (!pageEl) return null;
    const pageBox = pageEl.getBoundingClientRect();
    // header 在页面容器内（随页面整体被推——「整个页面被推」核心）。
    const header = pageEl.querySelector("header");
    const headerBox = header ? header.getBoundingClientRect() : null;
    // drawer 顶行（返回+项目名）与页面 header 的底部分隔线（2026-08-17 高度修正：
    // drawer 全高含 safe-area 顶带 + 顶行 h-11 与页面 header 同构 → 两页分隔线对齐）。
    const drawerTopRow = aside.firstElementChild?.firstElementChild;
    const drawerTopBox = drawerTopRow ? drawerTopRow.getBoundingClientRect() : null;
    return {
      drawerW: Math.round(drawerBox.width),
      drawerX: Math.round(drawerBox.x),
      drawerH: Math.round(drawerBox.height),
      drawerY: Math.round(drawerBox.y),
      viewportH: Math.round(window.innerHeight),
      pageLeft: Math.round(pageBox.left),
      pageW: Math.round(pageBox.width),
      headerLeft: headerBox ? Math.round(headerBox.left) : null,
      drawerTopBottom: drawerTopBox ? Math.round(drawerTopBox.bottom) : null,
      headerBottom: headerBox ? Math.round(headerBox.bottom) : null,
      // 刚体联动：drawer 右缘 == 页面左缘（并排无缝，非叠加）。
      gap: Math.round(pageBox.left - drawerBox.right),
    };
  });
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

    console.log("\n===== 1. 进 /projects/proj1 → drawer 默认展开（Reddit 式 push 刚体联动）=====");
    await page.goto(`${WEB_ORIGIN}/projects/proj1`);
    await waitDrawerVisible(page);
    const geo1 = await readDrawerGeometry(page);
    if (!geo1) {
      record(false, "drawer aside 渲染");
    } else {
      console.log(`  几何: ${JSON.stringify(geo1)}`);
      record(
        Math.abs(geo1.drawerW - 340) <= 1,
        `drawer 宽度 = min(88vw,340px) = 340（实际 ${geo1.drawerW}）`,
      );
      record(geo1.drawerX === 0, `drawer 贴左缘（x=${geo1.drawerX}）`);
      // 刚体联动核心断言：drawer 右缘与页面左缘无缝相接（并排非叠加）。
      record(
        geo1.gap >= -1 && geo1.gap <= 1,
        `drawer 与页面并排无缝相接（gap=${geo1.gap} ≈ 0，永不叠加）`,
      );
      record(
        geo1.pageLeft >= 338 && geo1.pageLeft <= 342,
        `页面被推到 drawer 右侧（pageLeft=${geo1.pageLeft} ≈ 340）`,
      );
      record(
        geo1.pageW !== null && geo1.pageW >= 388,
        `页面保持视口宽不被压缩（pageW=${geo1.pageW} ≈ 390，transform 不改 layout 宽）`,
      );
      record(
        geo1.headerLeft !== null && Math.abs(geo1.headerLeft - geo1.pageLeft) <= 1,
        `header tab 带随页面整体被推（headerLeft=${geo1.headerLeft} = pageLeft）`,
      );
      // 高度断言（2026-08-17 高度修正）：drawer 全高 = 视口高（含 safe-area 顶带，同旧覆盖式
      // inset-y-0），顶上不漏 main 底色；顶行底部分隔线与页面 header 分隔线水平对齐。
      record(
        geo1.drawerH !== null && Math.abs(geo1.drawerH - geo1.viewportH) <= 1,
        `drawer 全高覆盖视口（drawerH=${geo1.drawerH} ≈ viewportH=${geo1.viewportH}，含 safe-area 顶带）`,
      );
      record(geo1.drawerY === 0, `drawer 从设备顶部开始（y=${geo1.drawerY}，顶上不漏底色）`);
      record(
        geo1.drawerTopBottom !== null &&
          geo1.headerBottom !== null &&
          Math.abs(geo1.drawerTopBottom - geo1.headerBottom) <= 1,
        `两页顶行分隔线水平对齐（drawer 顶行 bottom=${geo1.drawerTopBottom} = header bottom=${geo1.headerBottom}）`,
      );
    }
    const scrimCount = await page.locator('[data-slot="dialog-overlay"]').count();
    record(scrimCount === 0, `无 scrim（push 非覆盖，got ${scrimCount}）`);

    console.log("\n===== 2. 7 个段文字标签 =====");
    const nav = page.getByRole("navigation", { name: "项目侧边栏" });
    await nav.waitFor({ timeout: 5000 });
    const labels = await nav.getByRole("button").allTextContents();
    const expected = ["总览", "历史", "文件", "Git", "页面", "Wiki", "插件"];
    record(
      labels.length === expected.length && labels.every((l, i) => l.trim() === expected[i]),
      `7 段文字按序渲染（实际 ${labels.map((l) => l.trim()).join("/")}）`,
    );
    // 段导航 = 横向 tab 行（对齐桌面左栏 middle tab bar，2026-08-16 迭代）：7 个 button
    // 同一行（y 对齐）+ x 递增（横向排列），非纵向堆叠。
    const navButtons = nav.getByRole("button");
    const navBoxes = [];
    for (let i = 0; i < (await navButtons.count()); i++) {
      navBoxes.push(await navButtons.nth(i).boundingBox());
    }
    const sameRow =
      navBoxes.length > 0 &&
      navBoxes.every((b) => b !== null && Math.abs((b?.y ?? 0) - (navBoxes[0]?.y ?? 0)) <= 2);
    const xIncreasing = navBoxes.every(
      (b, i) => i === 0 || b === null || navBoxes[i - 1] === null || b.x >= navBoxes[i - 1].x,
    );
    record(sameRow && xIncreasing, "7 段横向 tab 行（同一行 y 对齐 + x 递增）");

    console.log("\n===== 3. 点会话行 → focus + drawer 收 + tab 带 active chip =====");
    const card = page.locator(`${DRAWER_SCOPE} [role="button"]`, { hasText: "Probe Agent A" });
    await card.click({ timeout: 5000 });
    await page.waitForURL(/\/projects\/proj1\/session\/agent_probe-1/, { timeout: 8000 });
    await waitDrawerClosed(page);
    record(true, "点会话行后 drawer 收起（平移行整体滑回，drawer 移出窗口）");
    const chip = page.locator(TAB_CHIP, { hasText: "Probe Agent A" });
    await chip.waitFor({ timeout: 8000 });
    const chipActive = await chip
      .getAttribute("class")
      .then((c) => (c ?? "").includes("bg-primary/10"));
    record(chipActive, "tab 带出现该会话 chip 且 active（bg-primary/10）");

    console.log("\n===== 4. ☰ 重开 drawer；点页面（被推区域）关闭 =====");
    await page.getByRole("button", { name: "切换侧边栏" }).click({ timeout: 5000 });
    await waitDrawerVisible(page);
    record(true, "☰ 重开 drawer 可见");
    // 点被推页面（390px 视口下露在 x≈340-390 的右侧窄条）→ 透明拦截层关闭 drawer。
    await page.mouse.click(370, 400);
    await waitDrawerClosed(page);
    record(true, "点页面（被推区域）关闭 drawer");

    console.log("\n===== 5. tab ✕ → chip 消失 + URL 回浏览态 + 会话存活 =====");
    const closeBtn = chip.getByRole("button", { name: "关闭" });
    await closeBtn.click({ timeout: 5000 });
    await page.waitForURL(/\/projects\/proj1$/, { timeout: 8000 });
    await page.waitForFunction(() => document.querySelectorAll("div.group\\/tab").length === 0, {
      timeout: 8000,
    });
    record(true, "✕ 后 tab 带空（layout 已移除 tab）");
    // push 收起 drawer 的 DOM 保留（w-0 非 unmount）——卡片可能同时存在于 drawer 内 grid +
    // 浏览态 grid，取 .first()（浏览态「会话存活」语义不受影响）。
    const alive = page.locator('[role="button"]', { hasText: "Probe Agent A" }).first();
    await alive.waitFor({ timeout: 8000 });
    record(true, "会话仍存活（浏览态 grid 仍有该会话卡）");

    console.log("\n===== 6. 项目 scope 无一级 nav / global 有一级 nav =====");
    const primaryNav = page.getByRole("navigation", { name: "移动端主导航" });
    record((await primaryNav.count()) === 0, "/projects/proj1（project scope）无底部一级 nav");
    await page.goto(`${WEB_ORIGIN}/projects`);
    await page.waitForTimeout(600);
    record((await primaryNav.count()) === 1, "/projects（global）有底部一级 nav");

    console.log("\n===== 7. 浏览态 InstanceGrid + header 新建按钮可见 =====");
    // 回 proj1 浏览态（无 focus）：drawer 默认展开，点页面关闭。
    await page.goto(`${WEB_ORIGIN}/projects/proj1`);
    await waitDrawerVisible(page);
    await page.mouse.click(370, 400);
    await waitDrawerClosed(page);
    await page.waitForTimeout(400);
    // drawer DOM 常驻（absolute 静态层）：新建按钮在 header trailing + drawer 顶部行各一个，
    // 断言语义是「header 右上角」——限定 header。
    const createBtn = page.locator("header").getByRole("button", { name: "新建会话" });
    await createBtn.waitFor({ timeout: 5000 });
    const menuBtn = page.getByRole("button", { name: "切换侧边栏" });
    await menuBtn.waitFor({ timeout: 5000 });
    const cBox = await createBtn.boundingBox();
    const mBox = await menuBtn.boundingBox();
    const inHeader =
      cBox !== null && mBox !== null && Math.abs(cBox.y - mBox.y) <= 2 && cBox.x > mBox.x;
    const gridCard = page.locator('[role="button"]', { hasText: "Probe Agent A" }).first();
    await gridCard.waitFor({ timeout: 5000 });
    record(
      inHeader,
      `浏览态 header 右上角新建按钮（与 ☰ 同 header 行 y≈${cBox?.y?.toFixed(0)}、x=${cBox?.x?.toFixed(0)}>☰=${mBox?.x?.toFixed(0)}）+ InstanceGrid 会话卡可见`,
    );
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

    // ── context 3：断言 9（2026-08-16 迭代：从 global 总览点会话卡 → 进该会话所属项目的
    // project scope 工作台，而非旧 global 全屏聚焦态 MobileFocusBody）──────────────────────
    console.log("\n===== 9. 从 global 总览点会话卡 → 进 project scope 工作台 =====");
    const ctx3 = await browser.newContext(MOBILE_CTX);
    const page3 = await ctx3.newPage();
    await setupMocks(page3, { candidates: CANDIDATES });
    await login(page3);
    await page3.goto(`${WEB_ORIGIN}/projects`);
    // 会话卡是 div role=button（InstanceCard），accessible name = title+projectName+activity；
    // 用 name 定位（hasText 会误命中 FAB，见探针历史），title "Probe Agent A" 唯一。
    const gcard = page3.getByRole("button", { name: /Probe Agent A/ }).first();
    await gcard.waitFor({ timeout: 8000 });
    await gcard.click({ timeout: 5000 });
    await page3.waitForURL(/\/projects\/proj1\/session\/agent_probe-1/, { timeout: 8000 });
    record(true, "global 点会话卡 → URL = project scope /projects/proj1/session/agent_probe-1");
    // 聚焦态进入 drawer 收起（drawerOpen 初始 = focusId==null ? true : false），不遮挡会话面板。
    await waitDrawerClosed(page3);
    record(true, "聚焦态进入 drawer 收起（平移行整体滑回，drawer 移出窗口）");
    const chip9 = page3.locator(TAB_CHIP, { hasText: "Probe Agent A" });
    await chip9.waitFor({ timeout: 8000 });
    const chip9Active = await chip9
      .getAttribute("class")
      .then((c) => (c ?? "").includes("bg-primary/10"));
    record(chip9Active, "tab 带出现该会话 chip 且 active");
    await ctx3.close();

    // ── context 4：断言 10（A1 review 修复：PagesPanel createRequest ref 防重挂误弹）──
    // 修复前：createRequest 只增计数 + PagesPanel 随段切换卸载重挂 → 重挂时 effect 对着旧非零
    // 值再跑 → add dialog 无操作自动打开。修复后：ref 初值吃掉 mount 首跑，只有递增才触发。
    console.log("\n===== 10. 页面段新建 dialog：关闭后切段重挂不误弹 =====");
    const ctx4 = await browser.newContext(MOBILE_CTX);
    const page4 = await ctx4.newPage();
    await setupMocks(page4);
    await login(page4);
    await page4.goto(`${WEB_ORIGIN}/projects/proj1`);
    await waitDrawerVisible(page4);
    // 切到「页面」段（drawer nav 段按钮）。
    await page4
      .getByRole("navigation", { name: "项目侧边栏" })
      .getByRole("button", { name: "页面" })
      .click({ timeout: 5000 });
    await page4.waitForTimeout(300);
    // 点 drawer 顶部「+」（aria-label=添加页面根）→ ActionMenu sheet → 点「添加根」→
    // PagesRootDialog 打开（createRequest 递增 → effect 触发 add 模式）。
    await page4.getByRole("button", { name: "添加页面根" }).click({ timeout: 5000 });
    await page4.getByRole("menuitem", { name: "添加根" }).click({ timeout: 5000 });
    // 只统计 open 态 dialog（ActionMenu sheet 关闭后仍留 DOM，data-state=closed 不计入）。
    const dialog4 = page4.locator('[data-slot="dialog-content"][data-state="open"]');
    await dialog4.waitFor({ timeout: 5000 });
    record(true, "点「添加根」后 PagesRootDialog 打开（createRequest 触发 add 模式）");
    // Esc 关 dialog（drawer 的 window keydown 同步收——无 dialog 守卫，既有行为）。
    await page4.keyboard.press("Escape");
    await page4.waitForTimeout(300);
    record((await dialog4.count()) === 0, "Esc 关闭 PagesRootDialog");
    // ☰ 重开 drawer（section atom 记忆仍在页面段）→ 切总览 → 切回页面 → PagesPanel 重挂，
    // createRequest 仍非零 → 断言无 dialog 误弹（ref 守卫生效）。
    await page4.getByRole("button", { name: "切换侧边栏" }).click({ timeout: 5000 });
    await waitDrawerVisible(page4);
    await page4
      .getByRole("navigation", { name: "项目侧边栏" })
      .getByRole("button", { name: "总览" })
      .click({ timeout: 5000 });
    await page4.waitForTimeout(300);
    await page4
      .getByRole("navigation", { name: "项目侧边栏" })
      .getByRole("button", { name: "页面" })
      .click({ timeout: 5000 });
    await page4.waitForTimeout(400);
    record(
      (await dialog4.count()) === 0,
      "切段重挂后无 dialog 误弹（createRequest ref 守卫生效，A1 修复）",
    );
    await ctx4.close();

    // ── context 5：断言 11（2026-08-17 项目切换器：drawer 顶部项目名即切换器，点开底部
    // sheet 项目列表，当前项勾选 disabled，点其他项目直接 navigate 切换，免「返回 → 再进入」）
    console.log("\n===== 11. 项目切换器：drawer 顶部项目名 → sheet 项目列表 → 直接切项目 =====");
    const ctx5 = await browser.newContext(MOBILE_CTX);
    const page5 = await ctx5.newPage();
    await setupMocks(page5, { includeProj2: true });
    await login(page5);
    await page5.goto(`${WEB_ORIGIN}/projects/proj1`);
    await waitDrawerVisible(page5);
    // drawer 顶部项目名 button（aria-label=workbench.switchProject「切换项目」）。
    const switcher5 = page5.getByRole("button", { name: "切换项目" });
    await switcher5.waitFor({ timeout: 5000 });
    const triggerText = (await switcher5.textContent()) ?? "";
    record(
      triggerText.includes("proj1"),
      `drawer 顶部项目名可点击（切换器 trigger 显示 proj1：${triggerText.trim()}）`,
    );
    await switcher5.click({ timeout: 5000 });
    // 移动底部 sheet 弹出（OptionMenu 移动形态 = DialogContent sheet；ActionMenu sheet 关闭后
    // 仍留 DOM，只统计 open 态）。
    const sheet5 = page5.locator('[data-slot="dialog-content"][data-state="open"]');
    await sheet5.waitFor({ timeout: 5000 });
    record(true, "点项目名后底部 sheet 弹出项目列表");
    // 当前项目 proj1 勾选 disabled（原生 button disabled）+ proj2 可选。
    const itemProj1 = page5.getByRole("menuitem", { name: "proj1" });
    await itemProj1.waitFor({ timeout: 5000 });
    record(await itemProj1.isDisabled(), "sheet 中当前项目 proj1 勾选 disabled（不可重选）");
    const itemProj2 = page5.getByRole("menuitem", { name: "proj2" });
    await itemProj2.waitFor({ timeout: 5000 });
    // 点 proj2 → navigate /projects/proj2（免「返回 → 再进入」）。
    await itemProj2.click({ timeout: 5000 });
    await page5.waitForURL(/\/projects\/proj2/, { timeout: 8000 });
    record(true, "点 proj2 → URL 直接切到 /projects/proj2（免「返回 → 再进入」）");
    // 切项目 key=scope.key 重挂 → drawer 默认展开（浏览态），顶部显示 proj2。
    await waitDrawerVisible(page5);
    const switcherAfter = page5.getByRole("button", { name: "切换项目" });
    await switcherAfter.waitFor({ timeout: 5000 });
    const afterText = (await switcherAfter.textContent()) ?? "";
    record(
      afterText.includes("proj2"),
      `切后 drawer 重挂展开 + 顶部显示 proj2（${afterText.trim()}）`,
    );
    await ctx5.close();
  } finally {
    await browser.close();
  }
}

(async () => {
  await run();
  console.log(`\n总计: ${allPass ? "ALL PASS" : "有 FAIL"}`);
  process.exit(allPass ? 0 : 1);
})();
