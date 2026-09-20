// 移动项目工作台三行头部探针（v2 M3-b，对标 03-workspace-agent.html + v2-primitives.css）。
// 自 probe-mobile-tab-strip.mjs 迁移（MobileTabStrip/drawer 已删，v2 = MobileProjectHeader）：
//   保活纪律（2026-08-17「全保活 + 聚焦过即可」）：聚焦过即可 + 切 pill 面板不卸载（WS 不断）
//   row2 ＋ 新建 → 新 pill 激活（自 drawer 总览段新建迁移，v2 新建入口 = row2 ＋）
//   auto-scroll：激活 pill 滚入横滚区视野
// 新增三行几何断言（DOM 硬数据，禁截图）：
//   nav 行 .back「项目」主色 15px + ::before 箭头 + .nv-t 17px/600
//   row2 .pill h30/r15 + .plus 20×20 主色 + .sep 1×18 + ticon ×3 svg 19×19
//   chips 行 .chip h24（聚焦 agent 时）
//
// 密码自读（config.yaml → api environ），不进 agent 上下文、不打印值。
// 用法：bun scripts/probe-mobile-project-header.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const ORIGIN = process.env.AR_WEB_ORIGIN ?? "http://127.0.0.1:43012";

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

function hexToRgb(hex) {
  const m = /^#([0-9a-f]+)$/i.exec(hex.trim());
  if (!m) return hex.trim();
  const v = m[1];
  const full =
    v.length === 3
      ? v
          .split("")
          .map((c) => c + c)
          .join("")
      : v;
  const n = parseInt(full, 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

const SESSIONS = {
  "agent_probe-1": {
    id: "agent_probe-1",
    projectName: "proj1",
    provider: "claude",
    displayName: "Probe Agent A",
    status: "idle",
    createdAt: "2026-07-26T00:00:00.000Z",
  },
  "agent_probe-2": {
    id: "agent_probe-2",
    projectName: "proj1",
    provider: "claude",
    displayName: "Probe Agent B",
    status: "idle",
    createdAt: "2026-07-26T00:00:00.000Z",
  },
  "agent_probe-3": {
    id: "agent_probe-3",
    projectName: "proj1",
    provider: "claude",
    displayName: "Probe Agent C",
    status: "idle",
    createdAt: "2026-07-26T00:00:00.000Z",
  },
  "agent_probe-4": {
    id: "agent_probe-4",
    projectName: "proj1",
    provider: "claude",
    displayName: "Probe Agent D",
    status: "idle",
    createdAt: "2026-07-26T00:00:00.000Z",
  },
  "agent_probe-5": {
    id: "agent_probe-5",
    projectName: "proj1",
    provider: "claude",
    displayName: "Probe Agent E",
    status: "idle",
    createdAt: "2026-07-26T00:00:00.000Z",
  },
};
// row2 ＋ 新建 mock 返回的新会话（useCreateSession onSuccess navigate 到它）。
const NEW_AGENT = {
  id: "agent_probe-9",
  projectName: "proj1",
  provider: "claude",
  displayName: "Probe New Agent",
  status: "idle",
  createdAt: "2026-07-26T00:00:00.000Z",
};
const projectName = "proj1";
// POST 新建追加进 GET 列表（模拟服务端持久化；v2 pills 源 = instances query）。
const POST_ADDS = [];

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

async function setupMocks(page, { sessionIds }) {
  // POST 新建后 GET 列表要含新会话（v2 pills 数据源 = React Query instances，invalidate 后
  // refetch 拿的就是这里；旧 tab 带从 layout state 投影无此要求）。闭包可变列表。
  const known = sessionIds.map((id) => SESSIONS[id]);
  await page.route(/\/api\/overview$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ projectNames: [projectName], candidates: [] }),
    }),
  );
  // list GET + 新建 POST 同 URL（agent-sessions），按 method 分派。
  await page.route(new RegExp(`/api/projects/${projectName}/agent-sessions(?:\\?.*)?$`), (r) => {
    if (r.request().method() === "POST") {
      POST_ADDS.push(NEW_AGENT);
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ session: NEW_AGENT }),
      });
    } else {
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ sessions: [...known, ...POST_ADDS] }),
      });
    }
  });
  for (const s of [...known, NEW_AGENT]) {
    await page.route(new RegExp(`/api/projects/${projectName}/agent-sessions/${s.id}$`), (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(sessionDetail(s)),
      }),
    );
  }
  await page.route(new RegExp(`/api/projects/${projectName}/terminal-sessions(?:\\?.*)?$`), (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sessions: [] }),
    }),
  );
  // 聚焦 session 面板连真实 WS（fake session 不存在 → error，但 panel 容器仍渲染）。
  await page.routeWebSocket(/claude-stream/, (ws) => ws.connectToServer());
}

/** 预置 V4 layout：proj1 的 session tab 列表 + active（模拟持久化恢复）。同时清 middle tab
 *  记忆（`?tab` 缺省时 WorkbenchRoute 读 atom 记忆落工具态，会把保活面板全置 hidden）。 */
async function seedLayout(page, sessionIds, activeId) {
  await page.evaluate(
    ({ ids, active }) => {
      localStorage.removeItem("workbenchMiddleTab");
      localStorage.setItem(
        "workbenchLayoutV4",
        JSON.stringify({
          root: {
            kind: "leaf",
            id: "leaf-seed",
            tabs: ids.map((sessionId) => ({ kind: "session", projectName: "proj1", sessionId })),
            activeTabId: active,
          },
          activeGroupId: "leaf-seed",
          maximized: null,
        }),
      );
    },
    { ids: sessionIds, active: activeId },
  );
}

async function login(page) {
  await page.goto(`${ORIGIN}/`);
  await page.waitForSelector('input[type="password"]', { timeout: 15000 });
  await page.getByLabel("访问密码").fill(await readAppPassword());
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForSelector("nav[aria-label]", { timeout: 15000 });
}

/** 读保活面板状态：null = 不在 DOM；visible = display 非 none。 */
async function panelState(page, tabId) {
  return await page.evaluate((id) => {
    const el = document.querySelector(`[data-tab-id="${id}"]`);
    if (!el) return null;
    return { visible: getComputedStyle(el).display !== "none" };
  }, tabId);
}

/** 等待面板切到指定可见性（focus effect 异步后稳定）。 */
async function waitPanelVisible(page, tabId, visible) {
  await page
    .waitForFunction(
      (args) => {
        const el = document.querySelector(`[data-tab-id="${args.id}"]`);
        if (args.visible) return el !== null && getComputedStyle(el).display !== "none";
        return el !== null && getComputedStyle(el).display === "none";
      },
      { id: tabId, visible },
      { timeout: 8000 },
    )
    .catch(() => {});
}

async function run() {
  const browser = await chromium.launch();
  try {
    // ── context 1：保活 + row2 ＋ 新建 ─────────────────────────────────────
    const ctx = await browser.newContext(MOBILE_CTX);
    const page = await ctx.newPage();
    await setupMocks(page, { sessionIds: ["agent_probe-1", "agent_probe-2"] });
    await login(page);
    await seedLayout(page, ["agent_probe-1", "agent_probe-2"], "agent_probe-1");

    console.log("\n===== Part 1. 保活纪律（聚焦过即可 + 切 pill 不卸载）=====");
    await page.goto(`${ORIGIN}/projects/proj1/session/agent_probe-1`);
    await page.waitForSelector('[data-tab-id="agent_probe-1"]', { timeout: 8000 });
    const a0 = await panelState(page, "agent_probe-1");
    ok(a0 !== null && a0.visible, "A（当前激活）面板挂载且 visible");
    ok(
      (await page.locator('[data-tab-id="agent_probe-2"]').count()) === 0,
      "B 未聚焦过 → 不在 DOM（不预挂载）",
    );
    await page.evaluate(() => {
      const el = document.querySelector('[data-tab-id="agent_probe-1"]');
      if (el) el.__probe = 1;
    });

    console.log("\n===== Part 2. 切 pill：A 保活 hidden + B 挂载 =====");
    await page.locator(".pills .pill", { hasText: "Probe Agent B" }).click({ timeout: 5000 });
    await page.waitForURL(/\/projects\/proj1\/session\/agent_probe-2/, { timeout: 8000 });
    await waitPanelVisible(page, "agent_probe-2", true);
    const b1 = await panelState(page, "agent_probe-2");
    ok(b1 !== null && b1.visible, "B 面板挂载且 visible");
    const a1 = await panelState(page, "agent_probe-1");
    ok(a1 !== null && !a1.visible, "A 面板仍在 DOM（保活 hidden，未卸载）");
    const marker1 = await page.evaluate(
      () => document.querySelector('[data-tab-id="agent_probe-1"]')?.__probe,
    );
    ok(marker1 === 1, "切走时 A 未重挂（__probe 保留）");

    console.log("\n===== Part 3. 切回 A：未重挂（WS 不断）=====");
    await page.locator(".pills .pill", { hasText: "Probe Agent A" }).click({ timeout: 5000 });
    await page.waitForURL(/\/projects\/proj1\/session\/agent_probe-1/, { timeout: 8000 });
    await waitPanelVisible(page, "agent_probe-1", true);
    const marker2 = await page.evaluate(
      () => document.querySelector('[data-tab-id="agent_probe-1"]')?.__probe,
    );
    ok(marker2 === 1, "切回 A 未重挂（__probe 仍在 → 切 pill 不重连）");
    const b2 = await panelState(page, "agent_probe-2");
    ok(b2 !== null && !b2.visible, "B 面板保持挂载（hidden 保活）");

    console.log("\n===== Part 4. reload 后聚焦过即可 =====");
    await page.reload();
    await page.waitForSelector('[data-tab-id="agent_probe-1"]', { timeout: 8000 });
    const a3 = await panelState(page, "agent_probe-1");
    ok(a3 !== null && a3.visible, "reload 后 A（当前激活）挂载");
    ok(
      (await page.locator('[data-tab-id="agent_probe-2"]').count()) === 0,
      "reload 后 B 不在 DOM（focusedTabIds 重置只含当前激活）",
    );

    console.log("\n===== Part 5. row2 ＋ 新建 → 新 pill 激活 =====");
    await page.getByRole("button", { name: "新建会话" }).click({ timeout: 5000 });
    // ActionMenu（Radix menu）：点「Claude」（workbench.createClaude zh/en 同「Claude」）。
    await page
      .getByText(/^Claude$/, { exact: true })
      .first()
      .click({ timeout: 5000 });
    // 命名 prompt：填名 + 创建。
    await page
      .getByPlaceholder("会话名称（可选）")
      .or(page.getByPlaceholder("Session name (optional)"))
      .fill("Probe New Agent");
    await page.getByRole("button", { name: /^创建$|^Create$/ }).click({ timeout: 5000 });
    await page.waitForURL(/\/projects\/proj1\/session\/agent_probe-9/, { timeout: 8000 });
    await page.waitForSelector('[data-tab-id="agent_probe-9"]', { timeout: 8000 });
    const newPanel = await panelState(page, "agent_probe-9");
    ok(newPanel !== null && newPanel.visible, "新 tab 面板挂载且 visible");
    const newPill = page.locator(".pills .pill", { hasText: "Probe New Agent" });
    const newPillCls = await newPill.getAttribute("class", { timeout: 8000 });
    ok((newPillCls ?? "").includes("on"), "新会话 pill 出现且 on（激活态）");

    console.log("\n===== Part 6. 工具态 → pill：退出工具、session 面板可见（H1 行为锁）=====");
    // 进 files 工具（row2 folder ticon）
    await page.locator(".row2 .ticon").first().click({ timeout: 5000 });
    await page.waitForSelector('[data-mobile-tool="files"]', { timeout: 8000 });
    // 工具态点另一个实例 pill（B）→ session 面板 visible + 工具面板退场 + URL ?tab 清除
    await page.locator(".pills .pill", { hasText: "Probe Agent A" }).click({ timeout: 5000 });
    await page.waitForURL(/session\/agent_probe-1/, { timeout: 8000 });
    await page.waitForFunction(
      () => {
        const panel = document.querySelector('[data-tab-id="agent_probe-1"]');
        return panel !== null && getComputedStyle(panel).display !== "none";
      },
      undefined,
      { timeout: 8000 },
    );
    const toolGone = await page.evaluate(() => {
      const st = (sel) => {
        const el = document.querySelector(sel);
        return el ? getComputedStyle(el).display : null;
      };
      return {
        filesTool: st('[data-mobile-tool="files"]'),
        urlTab: new URLSearchParams(location.search).get("tab"),
      };
    });
    ok(toolGone.filesTool === null, `工具面板退场（files 容器 display=${toolGone.filesTool}）`);
    ok(
      toolGone.urlTab === null || toolGone.urlTab === "overview",
      `URL ?tab 已清除（实际 ${toolGone.urlTab}）`,
    );
    await ctx.close();

    // ── context 2：auto-scroll + 三行几何 ──────────────────────────────────
    console.log("\n===== Part 7. auto-scroll：激活 pill 滚入视野 =====");
    const ctx2 = await browser.newContext(MOBILE_CTX);
    const page2 = await ctx2.newPage();
    const ids5 = [
      "agent_probe-1",
      "agent_probe-2",
      "agent_probe-3",
      "agent_probe-4",
      "agent_probe-5",
    ];
    await setupMocks(page2, { sessionIds: ids5 });
    await login(page2);
    await seedLayout(page2, ids5, "agent_probe-5");
    await page2.goto(`${ORIGIN}/projects/proj1/session/agent_probe-5`);
    await page2.waitForSelector('[data-tab-id="agent_probe-5"]', { timeout: 8000 });
    const scrollInfo = await page2
      .waitForFunction(
        () => {
          const scroller = document.querySelector(".pills");
          if (!scroller) return null;
          const chip = scroller.querySelector('[data-active="true"]');
          if (!chip) return null;
          const sr = scroller.getBoundingClientRect();
          const cr = chip.getBoundingClientRect();
          if (cr.left >= sr.left - 1 && cr.right <= sr.right + 1) {
            return {
              scrollLeft: Math.round(scroller.scrollLeft),
              chipRange: `${Math.round(cr.left)}-${Math.round(cr.right)}`,
              scrollerRange: `${Math.round(sr.left)}-${Math.round(sr.right)}`,
            };
          }
          return null;
        },
        undefined,
        { timeout: 6000 },
      )
      .then(() =>
        page2.evaluate(() => {
          const scroller = document.querySelector(".pills");
          const chip = scroller?.querySelector('[data-active="true"]');
          const sr = scroller?.getBoundingClientRect();
          const cr = chip?.getBoundingClientRect();
          return {
            scrollLeft: Math.round(scroller?.scrollLeft ?? -1),
            chipRange: cr ? `${Math.round(cr.left)}-${Math.round(cr.right)}` : null,
            scrollerRange: sr ? `${Math.round(sr.left)}-${Math.round(sr.right)}` : null,
          };
        }),
      )
      .catch(() => {
        // 超时诊断：抓 .pills 存在性 + pill 数 + active 属性，分辨「没滚」vs「没渲染」。
        return page2.evaluate(() => ({
          scrollLeft: Math.round(document.querySelector(".pills")?.scrollLeft ?? -1),
          pillCount: document.querySelectorAll(".pills .pill").length,
          activeAttr: document
            .querySelector('.pills [data-active="true"]')
            ?.getAttribute("data-active"),
          pillTexts: [...document.querySelectorAll(".pills .pill")].map((p) =>
            p.textContent.trim().slice(0, 20),
          ),
        }));
      });
    ok(
      scrollInfo !== null && scrollInfo.scrollLeft > 0,
      `激活 pill 触发横滚且完全在视野内（scrollLeft=${scrollInfo?.scrollLeft} pill ${scrollInfo?.chipRange} ∈ scroller ${scrollInfo?.scrollerRange}）`,
    );

    console.log("\n===== Part 8. 三行几何（对标 03 原型 + v2-primitives.css）=====");
    const geo = await page2.evaluate(() => {
      const px = (v) => parseFloat(v);
      const rgbStr = (el) => getComputedStyle(el).color;
      const back = document.querySelector(".nav .back");
      const navTitle = document.querySelector(".nav .nv-t");
      const pill = document.querySelector(".pills .pill");
      const plus = document.querySelector(".row2 .plus");
      const sep = document.querySelector(".row2 .sep");
      const ticons = [...document.querySelectorAll(".row2 .ticon")];
      const chip = document.querySelector(".chips .chip");
      const rootStyle = getComputedStyle(document.documentElement);
      return {
        backText: back?.textContent.trim(),
        backColor: back ? rgbStr(back) : null,
        backFontSize: back ? getComputedStyle(back).fontSize : null,
        backArrow: back ? getComputedStyle(back, "::before").width !== "0px" : false,
        navTitleFont: navTitle
          ? `${px(getComputedStyle(navTitle).fontSize)}/${getComputedStyle(navTitle).fontWeight}`
          : null,
        pillH: pill ? Math.round(pill.getBoundingClientRect().height) : null,
        pillR: pill ? getComputedStyle(pill).borderRadius : null,
        plusSize: plus ? `${getComputedStyle(plus).width}x${getComputedStyle(plus).height}` : null,
        plusColor: plus ? rgbStr(plus) : null,
        sepSize: sep ? `${getComputedStyle(sep).width}x${getComputedStyle(sep).height}` : null,
        ticonCount: ticons.length,
        ticonSvg: ticons[0]
          ? (() => {
              const svg = ticons[0].querySelector("svg");
              const r = svg?.getBoundingClientRect();
              return r ? `${Math.round(r.width)}x${Math.round(r.height)}` : null;
            })()
          : null,
        chipH: chip ? Math.round(chip.getBoundingClientRect().height) : null,
        primary: rootStyle.getPropertyValue("--c-primary").trim(),
      };
    });
    ok(
      geo.backText === "项目" &&
        geo.backColor === hexToRgb(geo.primary) &&
        geo.backFontSize === "15px",
      `nav .back「项目」主色 15px（color=${geo.backColor}）`,
    );
    ok(geo.backArrow, "nav .back ::before 返回箭头（border 画笔）存在");
    ok(geo.navTitleFont === "17/600", `.nv-t 项目名标题 17px/600（实际 ${geo.navTitleFont}）`);
    ok(geo.pillH === 30 && geo.pillR === "15px", `.pill h30/r15（实际 ${geo.pillH}/${geo.pillR}）`);
    ok(
      geo.plusSize === "20pxx20px" && geo.plusColor === hexToRgb(geo.primary),
      `.plus 20×20 主色（实际 ${geo.plusSize}）`,
    );
    ok(geo.sepSize === "1pxx18px", `.sep 1×18（实际 ${geo.sepSize}）`);
    ok(geo.ticonCount === 3, `row2 工具 ticon ×3（实际 ${geo.ticonCount}）`);
    ok(geo.ticonSvg === "19x19", `ticon svg 19×19（实际 ${geo.ticonSvg}）`);
    ok(geo.chipH === 24, `.chip h24（实际 ${geo.chipH}）`);
    await ctx2.close();
  } finally {
    await browser.close();
  }

  console.log(`\n总计: ${passCount} pass / ${failCount} fail`);
  process.exit(failCount > 0 ? 1 : 0);
}

await run();
