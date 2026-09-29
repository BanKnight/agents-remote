// 探针：桌面三栏第一行同一水平线（PASS/FAIL 断言，入库版）。
// 2026-09-29 真机反馈：左栏「项目」首行中心 30 低中栏 tabstrip 中心 16 达 14px——
// 根因 = .side padding-top 8 + 首行 ghead margin-top 8 + 28px 热区行高叠加；右栏
// 「检视」.glabel2 中心 15.8 本已齐。拍板 = 三栏第一行与中栏 tabstrip 同一水平线。
// 断言：①左栏首行 .tt 中心 = tabstrip .tb 中心 ②右栏 glabel2 中心 = 同线（容差 1px）
// ③tabstrip 高 32 顶格。tabstrip 用 route mock（m9-d 同法：mock 一个 running session）。
// 密码自读不打印。用法: bun scripts/probe-desktop-tri-column-firstline.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const projectName = "proj1";

let allPass = true;
function ok(cond, label) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) allPass = false;
}

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.route(/\/api\/overview$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ projectNames: [projectName], candidates: [] }),
    }),
  );
  await page.route(/\/api\/projects\/proj1\/agent-sessions(?:\?.*)?$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sessions: [
          {
            id: "tri-sess-1",
            type: "agent",
            provider: "claude",
            projectName: "proj1",
            displayName: "tri 会话",
            status: "running",
            createdAt: "2026-09-29T00:00:00.000Z",
            updatedAt: "2026-09-29T00:00:00.000Z",
          },
        ],
        total: 1,
      }),
    }),
  );
  await page.route(/\/api\/projects\/proj1\/terminal-sessions(?:\?.*)?$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sessions: [], total: 0 }),
    }),
  );

  await page.addInitScript(() => localStorage.setItem("workbenchRightCollapsed", "false"));
  await page.goto(`${WEB_ORIGIN}/`);
  await page.locator("input[type='password']").fill(await readAppPassword());
  await page.locator("button[type='submit']").click();
  await page.waitForTimeout(1500);
  await page.goto(`${WEB_ORIGIN}/projects/${projectName}?v=1`);
  await page.waitForSelector("nav.side", { timeout: 15000 });
  // 点实例行进 tab 视图（m9-d F 段同法：GroupShell data-drop-group 出现 = tabstrip 渲染）。
  await page.locator("nav.side").getByText("tri 会话").click();
  await page
    .waitForFunction(() => document.querySelectorAll("[data-drop-group]").length >= 1, {
      timeout: 5000,
    })
    .catch(() => {});
  await page.waitForSelector(".tabstrip", { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(500);

  const data = await page.evaluate(() => {
    const centerOf = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return +(r.top + r.height / 2).toFixed(1);
    };
    const boxOf = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: +r.top.toFixed(1), h: +r.height.toFixed(1) };
    };
    const side = document.querySelector("nav.side");
    return {
      sideTt: centerOf(side?.querySelector(".ghead .tt")),
      tabstrip: boxOf(document.querySelector(".tabstrip")),
      tabTb: centerOf(document.querySelector(".tabstrip .tb")),
      inspector: centerOf(document.querySelector("[data-desktop-inspector] .glabel2")),
    };
  });

  ok(data.tabstrip !== null, "F0 tabstrip 渲染（mock session）");
  ok(data.tabstrip?.h === 32, `F1 tabstrip 高 32px（实际 ${data.tabstrip?.h}）`);
  ok(data.tabstrip?.top === 0, `F2 tabstrip 顶格 y=0（实际 ${data.tabstrip?.top}）`);
  ok(
    data.tabTb !== null && Math.abs(data.tabTb - 16) <= 0.5,
    `F3 中栏 tab 文字中心 = 16（实际 ${data.tabTb}）`,
  );
  ok(
    data.sideTt !== null && data.tabTb !== null && Math.abs(data.sideTt - data.tabTb) <= 1,
    `F4 左栏首行「项目」中心 = tab 中心（实际 side ${data.sideTt} vs tab ${data.tabTb}）`,
  );
  ok(
    data.inspector !== null && data.tabTb !== null && Math.abs(data.inspector - data.tabTb) <= 1,
    `F5 右栏首行「检视」中心 = tab 中心（实际 inspector ${data.inspector} vs tab ${data.tabTb}）`,
  );
} finally {
  await browser.close();
}
console.log(allPass ? "\nALL PASS" : "\nFAILED");
process.exit(allPass ? 0 : 1);
