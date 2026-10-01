// M9 批次 a 探针：三档断点 + iPad 列宽对齐（redesign-v2 §6.10-1/2）。
//
// 覆盖单测验不到的真实浏览器行为（DOM 几何硬数据，禁截图）：
//   Part 1（iPad 竖屏 820×1180，640–1023 中档）：移动形态拉宽——无桌面 nav.side、
//     /projects 一级页底 nav 4 Tab 在、/projects/proj1 二级页 push 形态（.back「项目」）。
//     此前中档落「非移动非桌面」空档（useIsMobile 639 以下才算移动，骨架移动/内件桌面混血）。
//   Part 2（iPad 横屏 1180×820，≥1024）：桌面三栏 + 列模型——nav.side 250 + 左栏
//     atom 宽 256 + 中栏吃剩余 + inspector 固定 22rem（2026-09-24 拍板：右栏固定宽，
//     minmax(min,1fr) 弹性废弃——1920 视口膨胀 ~1060px）。
//   Part 3（Mac 外接 1600×1000）：inspector 固定 22rem = 352px + 中栏吃剩余
//     （minmax(0,1fr) 弹性语义从中栏上限移交）。
//   Part 4（1440×900，2026-10-01）：global 会话页（/projects）右栏连续性——折叠态唤出钮
//     在、唤出显示「暂无内容」空态、panelOpen 内存单例跨 scope 连续（项目页展开态切
//     global 保持展开空态不蒸发）、seg4「项目」段导航回项目页右栏仍展开。
//
// mock 数据（不污染真环境、无真会话）；密码自读，不进 agent 上下文、不打印值。
// 用法：bun scripts/probe-v2-m9-multi-device.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";

const AGENT_A = {
  id: "agent_m9a-1",
  projectName: "proj1",
  provider: "claude",
  displayName: "Probe Agent A",
  status: "idle",
  createdAt: "2026-07-26T00:00:00.000Z",
};

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

function sessionDetail(session) {
  return {
    session,
    availableModels: ["sonnet", "opus", "haiku"],
    availablePermissionModes: ["default", "bypassPermissions"],
  };
}

async function setupMocks(page) {
  await page.route(/\/api\/overview$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ projectNames: ["proj1"], candidates: [] }),
    }),
  );
  await page.route(new RegExp(`/api/projects/proj1/agent-sessions(?:\\?.*)?$`), (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sessions: [AGENT_A] }),
    }),
  );
  await page.route(new RegExp(`/api/projects/proj1/agent-sessions/${AGENT_A.id}$`), (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(sessionDetail(AGENT_A)),
    }),
  );
  await page.route(new RegExp(`/api/projects/proj1/terminal-sessions(?:\\?.*)?$`), (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sessions: [] }),
    }),
  );
  // Part 4 右栏 files 标签（FilesToolPanel 文件列表）。
  await page.route(/\/api\/projects\/proj1\/files(?:\?.*)?$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        projectName: "proj1",
        path: "",
        parentPath: null,
        entries: [
          { name: "index.html", path: "index.html", type: "file", hidden: false, size: 64 },
        ],
      }),
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

(async () => {
  const browser = await chromium.launch();
  try {
    console.log("Part 1: iPad 竖屏 820×1180（640–1023 中档）→ 移动形态拉宽");
    const ipadPortrait = await browser.newContext({
      viewport: { width: 820, height: 1180 },
      locale: "zh-CN",
    });
    const p1 = await ipadPortrait.newPage();
    await setupMocks(p1);
    await login(p1);
    await p1.goto(`${WEB_ORIGIN}/projects`);
    await p1.waitForTimeout(1500);

    const portrait = await p1.evaluate(() => {
      const side = document.querySelector("nav.side");
      const bottomNav = document.querySelector("nav[aria-label]");
      const main = document.querySelector("main");
      return {
        hasDesktopSide: !!side,
        bottomNavTabs: bottomNav
          ? [...bottomNav.querySelectorAll("a, button")].map((n) => n.textContent.trim())
          : null,
        mainWidth: main ? main.getBoundingClientRect().width : null,
        hasDesktopSection: !!document.querySelector("main > div > section"),
      };
    });
    ok(!portrait.hasDesktopSide, "无桌面 nav.side（中档不入三栏）");
    ok(
      portrait.bottomNavTabs?.join(",") === "项目,工作台,文件,插件",
      `底 nav 4 Tab 在（实际 ${JSON.stringify(portrait.bottomNavTabs)}）`,
    );
    ok(!portrait.hasDesktopSection, "无桌面三栏 section（MobileWorkbench 形态）");
    ok(
      portrait.mainWidth !== null && Math.abs(portrait.mainWidth - 820) <= 1,
      `主容器拉满视口 820（实际 ${portrait.mainWidth}）`,
    );
    await ipadPortrait.close();

    console.log("Part 2: iPad 横屏 1180×820（≥1024）→ 三栏列模型");
    const ipadLandscape = await browser.newContext({
      viewport: { width: 1180, height: 820 },
      locale: "zh-CN",
    });
    const p2 = await ipadLandscape.newPage();
    await setupMocks(p2);
    await login(p2);
    await p2.goto(`${WEB_ORIGIN}/projects/proj1`);
    await p2.waitForTimeout(1500);
    // 桌面 Sidebar 在 + 无底 nav（≥1024 桌面形态）
    const landscape = await p2.evaluate(() => {
      const side = document.querySelector("nav.side");
      const cols = [...document.querySelectorAll("main > div > aside, main > div > section")];
      const widths = cols.map((el) => ({
        tag: el.tagName,
        w: el.getBoundingClientRect().width,
        borderR: getComputedStyle(el).borderRightWidth,
        borderL: getComputedStyle(el).borderLeftWidth,
      }));
      return {
        hasSide: !!side,
        sideW: side ? side.getBoundingClientRect().width : null,
        cols,
        widths,
      };
    });
    ok(landscape.hasSide, "桌面 nav.side 在（≥1024 三栏）");
    ok(
      landscape.sideW !== null && Math.abs(landscape.sideW - 250) <= 1,
      `nav.side 250px（实际 ${landscape.sideW}）`,
    );
    // 列几何（§6.12k 三列模型）：[side 250][中栏 minmax(0,600px)][inspector]。
    // 右栏默认收起（workbenchRightCollapsedAtom 默认 true）→ 收起态 inspector aside
    // 整个不渲染，grid = 2 children（side + 中栏吃满剩余）；点 RailButton 唤出后
    // 3 children，inspector 吃剩余、中栏 ≤600。
    const defaultCols = await p2.evaluate(() => {
      const grid = document.querySelector("main > div.grid");
      return grid ? grid.children.length : 0;
    });
    ok(
      defaultCols === 2,
      `收起态 2 children（side+中栏，inspector aside 不渲染，实际 ${defaultCols}）`,
    );
    const collapsedGeo = await p2.evaluate(() => {
      const grid = document.querySelector("main > div.grid");
      return grid
        ? [...grid.children].map((el) => Math.round(el.getBoundingClientRect().width))
        : [];
    });
    if (collapsedGeo.length === 2) {
      ok(collapsedGeo[0] === 250, `side 250（实际 ${collapsedGeo[0]}）`);
      ok(collapsedGeo[1] >= 920, `中栏吃满剩余（收起态 ≈ 1180−250，实际 ${collapsedGeo[1]}）`);
    }
    await p2.getByRole("button", { name: "展开右栏" }).click();
    await p2.waitForFunction(
      () => {
        const side = document.querySelectorAll("main > div > aside")[1];
        return side ? side.getBoundingClientRect().width > 0 : false;
      },
      { timeout: 5000 },
    );
    const col = await p2.evaluate(() => {
      const grid = document.querySelector("main > div.grid");
      if (!grid) return null;
      return [...grid.children].map((el) => el.getBoundingClientRect().width);
    });
    if (col && col.length === 3) {
      const midW = col[1];
      const rightW = col[2];
      ok(
        Math.abs(rightW - 352) <= 2,
        `inspector 固定 22rem=352px（2026-09-24 拍板，实际 ${rightW}）`,
      );
      ok(Math.abs(midW - (1180 - 250 - 352)) <= 2, `中栏 = 视口−其余列（${midW} ≈ 1180−250−352）`);
    } else {
      ok(false, `三列模型不在（实际 ${col?.length ?? 0} 列）`);
    }
    await ipadLandscape.close();

    console.log("Part 3: Mac 外接 1600×1000 → inspector 固定 22rem + 中栏吃剩余");
    const mac = await browser.newContext({
      viewport: { width: 1600, height: 1000 },
      locale: "zh-CN",
    });
    const p3 = await mac.newPage();
    await setupMocks(p3);
    await login(p3);
    await p3.goto(`${WEB_ORIGIN}/projects/proj1`);
    await p3.waitForTimeout(1500);
    // 右栏默认收起 → 唤出后测三列几何（inspector 固定 22rem + 中栏吃剩余）。
    await p3.getByRole("button", { name: "展开右栏" }).click();
    await p3.waitForFunction(
      () => {
        const side = document.querySelectorAll("main > div > aside")[1];
        return side ? side.getBoundingClientRect().width > 0 : false;
      },
      { timeout: 5000 },
    );
    const col1600 = await p3.evaluate(() => {
      const grid = document.querySelector("main > div.grid");
      if (!grid) return null;
      return [...grid.children].map((el) => ({
        tag: el.tagName,
        w: el.getBoundingClientRect().width,
      }));
    });
    if (col1600 && col1600.length === 3) {
      const midW = col1600[1].w;
      const rightW = col1600[2].w;
      ok(
        rightW !== null && Math.abs(rightW - 352) <= 2,
        `inspector 固定 22rem=352px（实际 ${rightW}）`,
      );
      ok(
        midW !== null && Math.abs(midW - (1600 - 250 - 352)) <= 2,
        `中栏吃剩余（${midW} ≈ 1600−250−352）`,
      );
    } else {
      ok(false, `1600 唤出后三列不在（实际 ${col1600?.length ?? 0} 列）`);
    }
    await mac.close();

    console.log("Part 4: global 会话页（/projects）右栏连续性（2026-10-01 用户反馈修复）");
    const gctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: "zh-CN",
    });
    const gp = await gctx.newPage();
    await setupMocks(gp);
    await login(gp);
    await gp.goto(`${WEB_ORIGIN}/projects`);
    await gp.waitForTimeout(1500);
    // ① 折叠记忆默认收起 → global 页 RailButton 在（修复前 collapsible=false 全蒸发）。
    ok(
      (await gp.getByRole("button", { name: "展开右栏" }).count()) > 0,
      "① global 页折叠态唤出钮在场（修复前整个右栏系统蒸发）",
    );
    // ② 点唤出钮 → 空态右栏（「检视 · 只读」+「暂无内容」，projectKey=null 分支）。
    await gp.getByRole("button", { name: "展开右栏" }).click();
    await gp.waitForFunction(
      () => {
        const side = document.querySelectorAll("main > div > aside")[1];
        return side ? side.getBoundingClientRect().width > 0 : false;
      },
      { timeout: 5000 },
    );
    const g2 = await gp.evaluate(() => ({
      asideW: Math.round(
        document.querySelectorAll("main > div > aside")[1].getBoundingClientRect().width,
      ),
      empty: !!document.querySelector(
        'main > div > aside:nth-of-type(2) [class*="text-on-surface-muted"], aside [class*="text-on-surface-muted"]',
      ),
    }));
    ok(Math.abs(g2.asideW - 352) <= 2, `② global 唤出后空态右栏 352px（实际 ${g2.asideW}）`);
    // ③ 折叠 → 唤出钮回；进项目页开 files 标签 → 切 global → 右栏保持展开（连续性核心断言）。
    await gp.getByRole("button", { name: "收起右栏" }).click();
    await gp.waitForTimeout(300);
    ok(
      (await gp.getByRole("button", { name: "展开右栏" }).count()) > 0,
      "③ global 折叠 → 唤出钮回",
    );
    await gp.goto(`${WEB_ORIGIN}/projects/proj1`);
    await gp.waitForTimeout(1200);
    // 右栏保持收起（panelOpen 内存单例连续）→ 展开 files 标签。
    await gp.getByRole("button", { name: "展开右栏" }).click();
    await gp.waitForTimeout(400);
    ok(
      (await gp.locator("[data-desktop-inspector]").count()) > 0,
      "④ 项目页展开右栏（files 标签在）",
    );
    await gp.goto(`${WEB_ORIGIN}/projects`);
    await gp.waitForTimeout(1200);
    // 核心断言：panelOpen 内存单例连续 → global 页右栏保持展开（空态），不再蒸发。
    const g5 = await gp.evaluate(() => {
      const side = document.querySelectorAll("main > div > aside")[1];
      return {
        asideW: side ? Math.round(side.getBoundingClientRect().width) : null,
        rail: !!document.querySelector('button[aria-label="展开右栏"]'),
      };
    });
    ok(
      g5.asideW !== null && Math.abs(g5.asideW - 352) <= 2,
      `⑤ 项目页展开态切 global → 右栏保持展开空态 352px（实际 ${g5.asideW}；修复前蒸发）`,
    );
    // ⑥ seg4「项目」段点击 → selectProjectSeg 导航回 lastProject → 右栏仍展开。
    await gp.locator('.seg4 span[role="tab"]', { hasText: "项目" }).click();
    await gp.waitForTimeout(900);
    const g6 = await gp.evaluate(() => {
      const side = document.querySelectorAll("main > div > aside")[1];
      return side ? Math.round(side.getBoundingClientRect().width) : null;
    });
    ok(
      g6 !== null && Math.abs(g6 - 352) <= 2,
      `⑥ seg4「项目」段导航回项目页 → 右栏仍展开（实际 ${g6}）`,
    );

    await gctx.close();

    await browser.close();
    console.log(`\n${passCount} pass, ${failCount} fail`);
    if (failCount > 0) process.exit(1);
  } finally {
    await browser.close();
  }
})();
