// 探针：桌面三栏第一行同一水平线 + 左栏历史态（05c 改版）断言（PASS/FAIL，入库版）。
// 2026-09-29 真机反馈：① 三栏第一行同线（.side pt 6 + 组头热区 20px → 首行中心 16）；
// ② dsep→内容间距（组头热区 28→20 + microlabel 页私 mt）；③ 历史态改版 05c：过滤 chips
// 全部/已结束 +「最近 5 + 展开更早每次+5」客户端折叠 + 尾注。
// 断言：F0-F5 三栏第一行几何；H1-H6 历史态（chips/折叠/展开/尾注/已结束过滤/dsep→chips 链）。
// tabstrip 用 route mock（m9-d 同法：mock 一个 running session）。
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
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "zh-CN",
  });
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
  // 历史态 mock：1 活跃 + 6 已结束（全部=7 显 5；已结束=6 显 5），lastActivityAt 倒序自造。
  const histEntry = (i, active) => ({
    claudeSessionId: `tri-hist-${i}`,
    provider: "claude",
    title: `tri 历史 ${i}`,
    firstMessage: `tri 历史 ${i} 首条消息`,
    hasActiveSession: active,
    activeSessionId: active ? "tri-sess-1" : undefined,
    lastActivityAt: new Date(Date.now() - i * 86_400_000).toISOString(),
    startedAt: new Date(Date.now() - i * 86_400_000).toISOString(),
    fileSize: 4096,
  });
  const historyEntries = [
    histEntry(0, true),
    ...Array.from({ length: 6 }, (_, i) => histEntry(i + 1, false)),
  ];
  await page.route(/\/api\/projects\/proj1\/agent-history(?:\?.*)?$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ entries: historyEntries }),
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

  // ── H 段：左栏历史态（05c 改版：chips/折叠/展开/尾注/过滤） ──
  // 时钟按钮 = 实例组头 ghead 内带 aria-pressed 的 button（.dicon 20×20 热区）。
  const clockBtn = page.locator("nav.side .ghead button[aria-pressed]").first();
  await clockBtn.click();
  await page.waitForTimeout(600);
  const h = await page.evaluate(() => {
    const side = document.querySelector("nav.side");
    const q = (sel) => side.querySelector(sel);
    const textOf = (el) => el?.textContent?.trim() ?? null;
    const chips = [...side.querySelectorAll('[role="group"] > button')].map((b) =>
      b.textContent?.trim(),
    );
    const rowsInPanel = side.querySelectorAll("#side-instance-panel [data-list-row-title]").length;
    // 字号档（.srow2.inst 13px / meta 10.5px，05c 历史行规格；默认档 16px = 偏大）。
    const firstTitle = side.querySelector("#side-instance-panel [data-list-row-title]");
    const titleFs = firstTitle ? getComputedStyle(firstTitle).fontSize : null;
    const subtitleEl = firstTitle?.parentElement?.querySelector(":scope > span:last-child");
    const subtitleFs =
      subtitleEl && subtitleEl !== firstTitle ? getComputedStyle(subtitleEl).fontSize : null;
    const showEarlier =
      [...side.querySelectorAll("#side-instance-panel button")]
        .find((b) => b.textContent?.includes("展开更早"))
        ?.textContent?.trim() ?? null;
    const note = textOf(side.querySelector("#side-instance-panel .microlabel"));
    const seg4 = q(".seg4.mini");
    const ghead = q("#side-instance-panel .ghead");
    const chain = (() => {
      const seg4r = seg4?.getBoundingClientRect();
      const gr = ghead?.getBoundingClientRect();
      if (!seg4r || !gr) return null;
      return +(gr.top - seg4r.bottom).toFixed(1);
    })();
    return { chips, rowsInPanel, showEarlier, note, chain, titleFs, subtitleFs };
  });
  ok(
    h.chips?.join(",") === "全部,已结束",
    `H1 chips 两枚 全部/已结束（实际 ${JSON.stringify(h.chips)}）`,
  );
  ok(h.rowsInPanel === 5, `H2 折叠窗口默认 5 行（实际 ${h.rowsInPanel}）`);
  ok(
    h.titleFs === "13px" && h.subtitleFs === "10.5px",
    `H9 历史行字号 13px / 副文本 10.5px（实际 ${h.titleFs} / ${h.subtitleFs}）`,
  );
  ok(
    h.showEarlier === "展开更早",
    `H3 「展开更早」按钮在（实际 ${JSON.stringify(h.showEarlier)}）`,
  );
  await page.locator("#side-instance-panel").getByText("展开更早").click();
  await page.waitForTimeout(400);
  const h2 = await page.evaluate(() => {
    const side = document.querySelector("nav.side");
    return {
      rowsAfter: side.querySelectorAll("#side-instance-panel [data-list-row-title]").length,
      btnGone:
        [...side.querySelectorAll("#side-instance-panel button")].find((b) =>
          b.textContent?.includes("展开更早"),
        ) === undefined,
    };
  });
  ok(
    h2.rowsAfter === 7 && h2.btnGone,
    `H4 展开后 7 行全显 + 按钮消失（实际 ${h2.rowsAfter} 行，按钮${h2.btnGone ? "已消失" : "仍在"}）`,
  );
  ok(h.note === "再次点时钟返回活跃实例列表", `H5 尾注在（实际 ${JSON.stringify(h.note)}）`);
  ok(
    h.chain !== null && Math.abs(h.chain - 8) <= 2,
    `H6 seg4 底→组头顶 = 8（ghead mt 8 两态同口径；实际 ${h.chain}）`,
  );
  // H7/H8「已结束」过滤：切过滤重置窗口 → 5 行 + 展开按钮在；展开后 6 行全显。
  await page.locator('#side-instance-panel [role="group"]').getByText("已结束").click();
  await page.waitForTimeout(400);
  const h3 = await page.evaluate(() => {
    const side = document.querySelector("nav.side");
    return {
      rows: side.querySelectorAll("#side-instance-panel [data-list-row-title]").length,
      hasBtn:
        [...side.querySelectorAll("#side-instance-panel button")].find((b) =>
          b.textContent?.includes("展开更早"),
        ) !== undefined,
    };
  });
  ok(
    h3.rows === 5 && h3.hasBtn,
    `H7 切「已结束」重置窗口 5 行 + 展开按钮在（实际 ${h3.rows} 行，按钮${h3.hasBtn ? "在" : "无"}）`,
  );
  await page.locator("#side-instance-panel").getByText("展开更早").click();
  await page.waitForTimeout(400);
  const endedRows = await page.evaluate(
    () => document.querySelectorAll("#side-instance-panel [data-list-row-title]").length,
  );
  ok(endedRows === 6, `H8 已结束展开后 6 行全显（实际 ${endedRows}）`);
} finally {
  await browser.close();
}
console.log(allPass ? "\nALL PASS" : "\nFAILED");
process.exit(allPass ? 0 : 1);
