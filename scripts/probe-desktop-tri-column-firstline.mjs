// 探针：桌面三栏第一行同一水平线 + 左栏历史态（05c 批5 规模化）断言（PASS/FAIL，入库版）。
// 2026-09-29 真机反馈：① 三栏第一行同线（.side pt 6 + 组头热区 20px → 首行中心 16）；
// ② dsep→内容间距（组头热区 28→20 + microlabel 页私 mt）；③ 历史态批5：segc 三段内嵌计数
//（服务端 filter 聚合）+ 按名搜索 + 五档组头 + 底部「没有更多」+ 行右键菜单（恢复/删除…）。
// 断言：F0-F5 三栏第一行几何；H1-H14 历史态（segc/行数/搜索/组头/尾态/尾注/链/过滤/菜单/字号）。
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

/** 当前打开的行菜单（role=menu portal 在 body 末尾，inspector-row-menus 同法）。 */
async function readMenu(page) {
  return page.evaluate(() => {
    const menus = [...document.querySelectorAll("[role='menu']")].filter((el) => {
      const s = getComputedStyle(el);
      return s.display !== "none" && s.visibility !== "hidden";
    });
    const menu = menus[menus.length - 1];
    if (!menu) return { open: false, items: [] };
    return {
      open: true,
      items: [...menu.querySelectorAll("[role='menuitem']")].map((el) => el.textContent.trim()),
    };
  });
}

/** 行菜单 open 目标态等待（超时不抛——readMenu 返回 open:false 走断言 FAIL，不崩探针）。 */
async function waitMenuOpen(page) {
  await page
    .waitForFunction(
      () =>
        [...document.querySelectorAll("[role='menu']")].some((el) => {
          const s = getComputedStyle(el);
          return s.display !== "none" && s.visibility !== "hidden";
        }),
      { timeout: 5000 },
    )
    .catch(() => {});
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
  // 历史态 mock：1 活跃 + 6 已结束（全部=7/进行中=1/已结束=6），lastActivityAt 倒序自造。
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
  // 批5 契约 mock：filter 切片 + search 按名过滤 + counts（search 后 filter 前聚合）+
  // nextCursor=null（无下页 → 底部「没有更多」态）。
  await page.route(/\/api\/projects\/proj1\/agent-history(?:\?.*)?$/, (r) => {
    const url = new URL(r.request().url());
    const search = url.searchParams.get("search") ?? "";
    const filter = url.searchParams.get("filter") ?? "all";
    const matched = historyEntries.filter((e) => !search || (e.title ?? "").includes(search));
    const entries =
      filter === "active"
        ? matched.filter((e) => e.hasActiveSession)
        : filter === "ended"
          ? matched.filter((e) => !e.hasActiveSession)
          : matched;
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        entries,
        counts: {
          all: matched.length,
          active: matched.filter((e) => e.hasActiveSession).length,
          ended: matched.filter((e) => !e.hasActiveSession).length,
        },
        nextCursor: null,
        filter,
      }),
    });
  });

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

  // ── H 段：左栏历史态（批5 规模化：segc 三段计数/搜索/五档组头/底部三态/行右键菜单） ──
  // 时钟按钮 = 实例组头 ghead 内带 aria-pressed 的 button（.dicon 20×20 热区）。
  const clockBtn = page.locator("nav.side .ghead button[aria-pressed]").first();
  await clockBtn.click();
  await page
    .locator("#side-instance-panel [data-list-row-title]")
    .first()
    .waitFor({ timeout: 8000 });
  const h = await page.evaluate(() => {
    const side = document.querySelector("nav.side");
    const panel = side.querySelector("#side-instance-panel");
    const segBtns = [...panel.querySelectorAll('[role="tablist"] > [role="tab"]')].map((b) =>
      b.textContent?.trim(),
    );
    const rowsInPanel = panel.querySelectorAll("[data-list-row-title]").length;
    // 字号档（.srow2.inst 13px / meta 10.5px，05c 历史行规格；默认档 16px = 偏大）。
    const firstTitle = panel.querySelector("[data-list-row-title]");
    const titleFs = firstTitle ? getComputedStyle(firstTitle).fontSize : null;
    const subtitleEl = firstTitle?.parentElement?.querySelector(":scope > span:last-child");
    const subtitleFs =
      subtitleEl && subtitleEl !== firstTitle ? getComputedStyle(subtitleEl).fontSize : null;
    // microlabel 序 = 组头…+ 尾注（尾注在 HistoryList 外 sibling，恒 last）。
    const labels = [...panel.querySelectorAll(".microlabel")].map((el) => el.textContent?.trim());
    const searchAria = panel.querySelector('input[type="search"]')?.getAttribute("aria-label");
    const seg4 = side.querySelector(".seg4.mini");
    const ghead = panel.querySelector(".ghead");
    const chain = (() => {
      const seg4r = seg4?.getBoundingClientRect();
      const gr = ghead?.getBoundingClientRect();
      if (!seg4r || !gr) return null;
      return +(gr.top - seg4r.bottom).toFixed(1);
    })();
    return {
      segBtns,
      rowsInPanel,
      groupHeads: labels.slice(0, -1),
      note: labels.at(-1) ?? null,
      searchAria,
      hasEndMark: (panel.textContent ?? "").includes("没有更多"),
      pulseCount: panel.querySelectorAll(".animate-pulse").length,
      chain,
      titleFs,
      subtitleFs,
    };
  });
  ok(
    h.segBtns?.join(",") === "全部7,进行中1,已结束6",
    `H1 segc 三段内嵌服务端计数（实际 ${JSON.stringify(h.segBtns)}）`,
  );
  ok(
    h.rowsInPanel === 7,
    `H2 服务端分页首屏全量 7 行（客户端折叠窗口已退役；实际 ${h.rowsInPanel}）`,
  );
  ok(
    h.searchAria === "搜索历史会话",
    `H3 搜索框在场（aria-label = placeholder；实际 ${JSON.stringify(h.searchAria)}）`,
  );
  ok(
    h.groupHeads?.join(",") === "今天,昨天,7 天内",
    `H4 五档组头（实际 ${JSON.stringify(h.groupHeads)}）`,
  );
  ok(h.hasEndMark, "H5 底部「没有更多」尾态在场（nextCursor=null）");
  ok(h.note === "再次点时钟返回活跃实例列表", `H6 尾注在（实际 ${JSON.stringify(h.note)}）`);
  ok(
    h.chain !== null && Math.abs(h.chain - 8) <= 2,
    `H7 seg4 底→组头顶 = 8（ghead mt 8 两态同口径；实际 ${h.chain}）`,
  );
  ok(h.pulseCount === 1, `H8 活跃行脉动点 1（实际 ${h.pulseCount}）`);
  ok(
    h.titleFs === "13px" && h.subtitleFs === "10.5px",
    `H9 历史行字号 13px / 副文本 10.5px（实际 ${h.titleFs} / ${h.subtitleFs}）`,
  );

  // 「进行中」段：服务端 filter 切片 → 1 行（活跃行）。
  await page
    .locator('#side-instance-panel [role="tablist"] > [role="tab"]')
    .filter({ hasText: "进行中" })
    .click();
  await page.waitForFunction(
    () => document.querySelectorAll("#side-instance-panel [data-list-row-title]").length === 1,
    { timeout: 8000 },
  );
  ok(true, "H10 「进行中」段 → 1 行（服务端 filter 切片）");

  // 「已结束」段：6 行 + 无脉动点。
  await page
    .locator('#side-instance-panel [role="tablist"] > [role="tab"]')
    .filter({ hasText: "已结束" })
    .click();
  await page.waitForFunction(
    () => document.querySelectorAll("#side-instance-panel [data-list-row-title]").length === 6,
    { timeout: 8000 },
  );
  const endedPulse = await page.evaluate(
    () => document.querySelectorAll("#side-instance-panel .animate-pulse").length,
  );
  ok(endedPulse === 0, `H11 「已结束」段 → 6 行且无脉动点（实际脉动 ${endedPulse}）`);

  // 搜索（服务端按名过滤 + 300ms 防抖）：命中 1 行；清空恢复（已结束段仍 6 行）。
  await page.locator('#side-instance-panel input[type="search"]').fill("tri 历史 3");
  await page.waitForFunction(
    () => document.querySelectorAll("#side-instance-panel [data-list-row-title]").length === 1,
    { timeout: 8000 },
  );
  ok(true, "H12 搜索「tri 历史 3」→ 1 行（300ms 防抖 + 服务端 search）");
  await page.locator('#side-instance-panel input[type="search"]').fill("");
  await page.waitForFunction(
    () => document.querySelectorAll("#side-instance-panel [data-list-row-title]").length === 6,
    { timeout: 8000 },
  );

  // 行右键菜单（05c pin④）：已结束行 = 恢复/删除…；活跃行 = 仅恢复（无删除，服务端 409）。
  await page
    .locator("#side-instance-panel [role='button']")
    .filter({ hasText: "tri 历史 1" })
    .first()
    .click({ button: "right" });
  await waitMenuOpen(page);
  const endedMenu = await readMenu(page);
  ok(
    endedMenu.open && endedMenu.items.join("/") === "恢复/删除…",
    `H13 已结束行右键菜单 = 恢复/删除…（实际 ${endedMenu.items.join("/") || "未开"}）`,
  );
  // 「删除…」= 双重确认（05c pin④）：菜单项点开 Radix danger confirm，取消不删。
  await page.getByRole("menuitem").filter({ hasText: "删除…" }).click();
  await page
    .getByText("删除历史会话")
    .waitFor({ timeout: 5000 })
    .catch(() => {});
  const confirmShown = await page
    .getByText("删除历史会话")
    .isVisible()
    .catch(() => false);
  ok(confirmShown, "H13b 「删除…」→ 二次确认对话框在场（05c pin④ double confirm）");
  await page.getByRole("button", { name: "取消" }).click();
  await page.keyboard.press("Escape");
  // 回「全部」段再右键活跃行（已结束切片无活跃行——上一段 H11 的过滤语境）。
  await page
    .locator('#side-instance-panel [role="tablist"] > [role="tab"]')
    .filter({ hasText: /^全部/ })
    .click();
  await page.waitForFunction(
    () => document.querySelectorAll("#side-instance-panel [data-list-row-title]").length === 7,
    { timeout: 8000 },
  );
  await page
    .locator("#side-instance-panel [role='button']")
    .filter({ hasText: "tri 历史 0" })
    .first()
    .click({ button: "right" });
  await waitMenuOpen(page);
  const activeMenu = await readMenu(page);
  ok(
    activeMenu.open && activeMenu.items.length === 1 && activeMenu.items[0] === "恢复",
    `H14 活跃行右键菜单仅恢复（实际 ${JSON.stringify(activeMenu.items)}）`,
  );
  await page.keyboard.press("Escape");
} finally {
  await browser.close();
}
console.log(allPass ? "\nALL PASS" : "\nFAILED");
process.exit(allPass ? 0 : 1);
