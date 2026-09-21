// M9 批次 a 探针：三档断点 + iPad 列宽对齐（redesign-v2 §6.10-1/2）。
//
// 覆盖单测验不到的真实浏览器行为（DOM 几何硬数据，禁截图）：
//   Part 1（iPad 竖屏 820×1180，640–1023 中档）：移动形态拉宽——无桌面 nav.side、
//     /projects 一级页底 nav 4 Tab 在、/projects/proj1 二级页 push 形态（.back「项目」）。
//     此前中档落「非移动非桌面」空档（useIsMobile 639 以下才算移动，骨架移动/内件桌面混血）。
//   Part 2（iPad 横屏 1180×820，≥1024）：桌面三栏 + 列模型——nav.side 250 + 左栏
//     atom 宽 256 + 中栏 ≤600（minmax(0,600px) 让位）+ inspector 吃剩余（minmax(min,1fr)）。
//   Part 3（Mac 外接 1600×1000）：中栏封顶精确 600（§6.10-2 center flex-none 语义）+
//     inspector = 视口 − 其余列实测和（flex-1 吸收）。
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
    // 列几何：[sidebar 250][左栏][中栏][inspector]。右栏默认收起（M2 拍板：非聚焦态收起，
    // workbenchRightCollapsedAtom 默认 true）→ 先断言 3 列；点 RailButton 唤出后测 4 列模型。
    const defaultCols = await p2.evaluate(() => {
      const grid = document.querySelector("main > div.grid");
      return grid ? grid.children.length : 0;
    });
    ok(defaultCols === 3, `右栏默认收起 3 列（M2 非聚焦态收起，实际 ${defaultCols}）`);

    await p2.getByRole("button", { name: "展开右栏" }).click();
    await p2.waitForFunction(
      () => {
        const grid = document.querySelector("main > div.grid");
        return grid ? grid.children.length === 4 : false;
      },
      { timeout: 5000 },
    );

    const col = await p2.evaluate(() => {
      const grid = document.querySelector("main > div.grid");
      if (!grid) return null;
      return [...grid.children].map((el) => el.getBoundingClientRect().width);
    });
    if (col && col.length === 4) {
      const leftW = col[1];
      const midW = col[2];
      const rightW = col[3];
      ok(Math.abs(leftW - 256) <= 1, `左栏 atom 默认 16rem=256px（实际 ${leftW}）`);
      ok(midW <= 601, `中栏 ≤600 上限（minmax(0,600px)，实际 ${midW}）`);
      ok(
        Math.abs(rightW - (1180 - 250 - leftW - midW)) <= 2,
        `inspector = 视口−其余列（${rightW} ≈ 1180−250−${leftW}−${midW}）`,
      );
      ok(rightW >= 352 - 1, `inspector ≥ 最小宽 22rem=352（实际 ${rightW}）`);
    } else {
      ok(false, `唤出后 4 列不在（实际 ${col?.length ?? 0} 列）`);
    }
    await ipadLandscape.close();

    console.log("Part 3: Mac 外接 1600×1000 → 中栏封顶 600 + inspector flex");
    const mac = await browser.newContext({
      viewport: { width: 1600, height: 1000 },
      locale: "zh-CN",
    });
    const p3 = await mac.newPage();
    await setupMocks(p3);
    await login(p3);
    await p3.goto(`${WEB_ORIGIN}/projects/proj1`);
    await p3.waitForTimeout(1500);
    // 右栏默认收起 → 先唤出再测 4 列
    await p3.getByRole("button", { name: "展开右栏" }).click();
    await p3.waitForFunction(
      () => {
        const grid = document.querySelector("main > div.grid");
        return grid ? grid.children.length === 4 : false;
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
    if (col1600 && col1600.length === 4) {
      const leftW = col1600[1].w;
      const midW = col1600[2].w;
      const rightW = col1600[3].w;
      ok(midW !== null && Math.abs(midW - 600) <= 1, `中栏封顶精确 600（实际 ${midW}）`);
      ok(
        rightW !== null && Math.abs(rightW - (1600 - 250 - leftW - 600)) <= 2,
        `inspector 吃剩余（${rightW} ≈ 1600−250−${leftW}−600）`,
      );
    } else {
      ok(false, `1600 唤出后 4 列不在（实际 ${col1600?.length ?? 0} 列）`);
    }
    await mac.close();

    await browser.close();
    console.log(`\n${passCount} pass, ${failCount} fail`);
    if (failCount > 0) process.exit(1);
  } finally {
    await browser.close();
  }
})();
