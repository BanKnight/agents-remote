// 移动项目工作台行1 导航探针（v1.5 批1 单会话化，对标 workspace.html / workspace-instance-
// switch.html；v2 M3-b 旧三行头部探针随行2 退役全面改写；v1.6 批 v6.3 同步三区/组头化/
// tticn）。
//   保活纪律（2026-08-17「全保活 + 聚焦过即可」）：▾ 菜单切实例不卸载（WS 不断）
//   行1（44px 唯一常驻行）：.back「项目」主色 15px + ::before 箭头 + .nv-t 标题 = 实例名
//     17/600 + 行首 .tticn 类型标（agent=sparkles/terminal=terminal/空态=folder）+
//     runct ●n（running 实例数）+ 右端 [面板][⋯]
//   ▾ 实例切换菜单（DropdownMenu 锚定浮卡）：组头「切换实例」+ 项目组头 .mh.g（当前项目
//     置顶、其余按最近活动）+ 实例行 + 当前行背景高亮（✓ 记号退役）+ 钉底 ＋新建/⟲恢复
//     （· 当前项目 后缀）
//   ⋯ 菜单 = v1.6 三区（导航 会话历史›/实例信息› → 动作 置顶✓/重命名/自动重试✓ → 销毁
//     关闭红）
//   退役断言：row2/pills/chips/＋/mini 恒不渲染（防回归）
//   Part 6 检视面板语境：行1 面板钮开面板 → 面板覆盖行1 → ‹ 工作台 关面板 → ▾ 切实例
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
    status: "running",
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
  "agent_probe-6": {
    id: "agent_probe-6",
    projectName: "proj1",
    provider: "claude",
    displayName: "Probe Agent F",
    status: "idle",
    createdAt: "2026-07-26T00:00:00.000Z",
  },
};
// ▾ 菜单钉底「＋ 新建实例」mock 返回的新会话（useCreateSession onSuccess navigate 到它）。
const NEW_AGENT = {
  id: "agent_probe-9",
  projectName: "proj1",
  provider: "claude",
  displayName: "Probe New Agent",
  status: "idle",
  createdAt: "2026-07-26T00:00:00.000Z",
};
const projectName = "proj1";
// POST 新建追加进 GET 列表（模拟服务端持久化；▾ 菜单列表源 = instances query）。
const POST_ADDS = [];
// 置顶集合 mock（⋯ 菜单置顶 ✓ / 探针跨 context 复位）。
let PINNED_MOCK = [];

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

async function setupMocks(page, { sessionIds, foreignCandidates = [] }) {
  // POST 新建后 GET 列表要要含新会话（▾ 菜单列表源 = React Query instances，invalidate 后
  // refetch 拿的就是这里）。闭包可变列表；模块级 POST_ADDS 跨 context 复位。
  POST_ADDS.length = 0;
  PINNED_MOCK = [];
  const known = sessionIds.map((id) => SESSIONS[id]);
  await page.route(/\/api\/overview$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ projectNames: [projectName], candidates: foreignCandidates }),
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
  // 置顶状态（v1.6 ⋯ 菜单动作区 ✓ 标注数据源）：GET 返回闭包数组，POST/DELETE（sessionId
  // 走 path 段）更新后回显——mutation invalidate → refetch 拿最新，菜单 ✓ 实时反映。
  await page.route(/\/api\/state\/overview\/pinned-sessions/, (r) => {
    const m = r.request().method();
    const id = decodeURIComponent(r.request().url().split("/pinned-sessions/")[1] ?? "");
    if (m === "POST" && id && !PINNED_MOCK.includes(id)) PINNED_MOCK.push(id);
    if (m === "DELETE" && id) PINNED_MOCK = PINNED_MOCK.filter((x) => x !== id);
    return r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sessions: PINNED_MOCK }),
    });
  });
  // 自动重试开关（v1.6 ⋯ 菜单动作区即点即改）：POST 回显取反后的 config，response.session
  // 的 autoRetry 随之变化（detail query invalidate → ✓ 实时反映）。
  await page.route(/\/auto-retry$/, (r) => {
    const sid = decodeURIComponent(
      r
        .request()
        .url()
        .match(/agent-sessions\/([^/]+)\/auto-retry/)?.[1] ?? "",
    );
    const s = SESSIONS[sid];
    const enabled = s?.autoRetry?.enabled !== true;
    if (s) s.autoRetry = { ...s.autoRetry, enabled };
    return r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ session: { ...s, autoRetry: { enabled } } }),
    });
  });
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

/** 打开 ▾ 实例切换菜单（等 menuitem 在场）。 */
async function openSwitchMenu(page) {
  await page.locator(".nav h1 button").click();
  await page.getByRole("menuitem").first().waitFor({ timeout: 5000 });
}

async function run() {
  const browser = await chromium.launch();
  try {
    // ── context 1：保活 + ▾ 菜单切换 + 钉底新建 ─────────────────────────────
    const ctx = await browser.newContext(MOBILE_CTX);
    const page = await ctx.newPage();
    await setupMocks(page, { sessionIds: ["agent_probe-1", "agent_probe-2"] });
    await login(page);
    await seedLayout(page, ["agent_probe-1", "agent_probe-2"], "agent_probe-1");

    console.log("\n===== Part 1. 行1 结构（标题=实例名/runct/退役元素恒不渲染）=====");
    await page.goto(`${ORIGIN}/projects/proj1/session/agent_probe-1`);
    await page.waitForSelector('[data-tab-id="agent_probe-1"]', { timeout: 8000 });
    const a0 = await panelState(page, "agent_probe-1");
    ok(a0 !== null && a0.visible, "A（当前激活）面板挂载且 visible");
    ok(
      (await page.locator('[data-tab-id="agent_probe-2"]').count()) === 0,
      "B 未聚焦过 → 不在 DOM（不预挂载）",
    );
    // 标题 = 实例名；probe-1 是 running → runct ●1；非项目名。
    const navBtn = page.locator(".nav h1 button");
    const navText = await navBtn.textContent();
    ok(navText?.includes("Probe Agent A") === true, `标题 = 实例名（「${navText?.trim()}」）`);
    ok(navText?.includes("proj1") === false, "标题非项目名");
    const runctText = await page.locator(".nav .runct").textContent();
    ok(
      (runctText ?? "").includes("●") && (runctText ?? "").includes("1"),
      `runct ●1（running 实例数；实际「${runctText}」）`,
    );
    // 退役元素恒不渲染（v1.5 批1：row2/pills/chips/mini）。
    ok((await page.locator(".row2").count()) === 0, "row2 恒不渲染（行2 已退役）");
    ok((await page.locator(".pills").count()) === 0, "pills 恒不渲染（实例切换入 ▾ 菜单）");
    ok((await page.locator(".chips").count()) === 0, "chips 恒不渲染（此前已退役）");
    ok((await page.locator("button.mini").count()) === 0, "mini 迷你条恒不渲染（03b 退役）");
    await page.evaluate(() => {
      const el = document.querySelector('[data-tab-id="agent_probe-1"]');
      if (el) el.__probe = 1;
    });

    console.log("\n===== Part 2. ▾ 菜单切实例：A 保活 hidden + B 挂载 =====");
    await openSwitchMenu(page);
    await page.getByRole("menuitem", { name: /Probe Agent B/ }).click();
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
    await openSwitchMenu(page);
    await page.getByRole("menuitem", { name: /Probe Agent A/ }).click();
    await page.waitForURL(/\/projects\/proj1\/session\/agent_probe-1/, { timeout: 8000 });
    await waitPanelVisible(page, "agent_probe-1", true);
    const marker2 = await page.evaluate(
      () => document.querySelector('[data-tab-id="agent_probe-1"]')?.__probe,
    );
    ok(marker2 === 1, "切回 A 未重挂（__probe 仍在 → 切换不重连）");
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

    console.log("\n===== Part 5. ▾ 钉底「＋ 新建实例」→ 新实例聚焦 =====");
    await openSwitchMenu(page);
    await page.getByRole("menuitem", { name: /新建实例/ }).click();
    // M5-a sheet 化：▾ 钉底打开 MobileCreateInstanceSheet（heading「New instance」）。
    await page
      .getByRole("button", { name: /Claude/ })
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
    ok(newPanel !== null && newPanel.visible, "新实例面板挂载且 visible");
    await openSwitchMenu(page);
    ok(
      (await page.getByRole("menuitem", { name: /Probe New Agent/ }).count()) === 1,
      "新实例入 ▾ 菜单列表（instances query invalidate 后含新会话）",
    );
    await page.keyboard.press("Escape");

    console.log("\n===== Part 6. 检视面板语境（v1.5：行1 面板钮）=====");
    // 行1 右端 [面板] ticon 开面板（aria-label 检视面板）。
    await page.locator('.nav button[aria-label="检视面板"]').click({ timeout: 5000 });
    await page.waitForSelector('[data-inspection-panel="open"]', { timeout: 8000 });
    // 面板全屏覆盖：行1 的面板钮被面板盖住（elementFromPoint 落面板子树）——实例切换
    // = 关面板（‹ 工作台）→ ▾ 菜单（面板 closed 时行1 才可点）。
    const panelCovers = await page.evaluate(() => {
      const ticon = document.querySelector('.nav button[aria-label="检视面板"]');
      if (!ticon) return false;
      const r = ticon.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      const panel = document.querySelector('[data-inspection-panel="open"]');
      return hit !== null && panel != null && panel.contains(hit);
    });
    ok(panelCovers, "面板 open 时覆盖行1（面板钮不可点，实例切换经面板 back）");
    await page.locator('[data-inspection-panel="open"] .nav .back').click({ timeout: 5000 });
    await page.waitForSelector('[data-inspection-panel="closed"]', {
      state: "attached",
      timeout: 5000,
    });
    await openSwitchMenu(page);
    await page.getByRole("menuitem", { name: /Probe Agent A/ }).click();
    await page.waitForURL(/session\/agent_probe-1/, { timeout: 8000 });
    await page.waitForFunction(
      () => {
        const panel = document.querySelector('[data-tab-id="agent_probe-1"]');
        return panel !== null && getComputedStyle(panel).display !== "none";
      },
      undefined,
      { timeout: 8000 },
    );
    const panelStateAfter = await page.evaluate(() => ({
      panelOpen: document.querySelector('[data-inspection-panel="open"]') !== null,
      urlTab: new URLSearchParams(location.search).get("tab"),
    }));
    ok(panelStateAfter.panelOpen === false, "面板已关闭（聚焦导航不重开面板）");
    ok(
      panelStateAfter.urlTab === null || panelStateAfter.urlTab === "overview",
      `URL ?tab 已清除（实际 ${panelStateAfter.urlTab}）`,
    );
    await ctx.close();

    // ── context 2：▾ 菜单定高滚动 + 行1 几何 ──────────────────────────────
    console.log("\n===== Part 7. ▾ 菜单列表定高滚动（6 实例溢出）=====");
    const ctx2 = await browser.newContext(MOBILE_CTX);
    const page2 = await ctx2.newPage();
    const ids6 = [
      "agent_probe-1",
      "agent_probe-2",
      "agent_probe-3",
      "agent_probe-4",
      "agent_probe-5",
      "agent_probe-6",
    ];
    await setupMocks(page2, { sessionIds: ids6 });
    await login(page2);
    await seedLayout(page2, ids6, "agent_probe-5");
    await page2.goto(`${ORIGIN}/projects/proj1/session/agent_probe-5`);
    await page2.waitForSelector('[data-tab-id="agent_probe-5"]', { timeout: 8000 });
    await openSwitchMenu(page2);
    // 列表区 max-h 200px：5 行（每行 40px = 200px 边界）——断言 scroller 可滚且当前行（E）
    // 滚入视野（autoFocus 在队尾）。
    const menuScroll = await page2.evaluate(() => {
      const menu = [...document.querySelectorAll('[role="menu"]')].at(-1);
      if (!menu) return null;
      const list = [...menu.querySelectorAll("div")].find(
        (d) =>
          getComputedStyle(d).overflowY === "auto" || getComputedStyle(d).overflowY === "scroll",
      );
      if (!list) return null;
      const items = [...menu.querySelectorAll('[role="menuitem"]')];
      // v1.6 当前行 = 背景高亮（✓ 记号退役），aria-current 定位。
      const current = menu.querySelector('[aria-current="true"]');
      return {
        maxH: getComputedStyle(list).maxHeight,
        itemsCount: items.filter(
          (it) => !it.textContent?.includes("新建") && !it.textContent?.includes("恢复"),
        ).length,
        listScrollable: list.scrollHeight > list.clientHeight,
        currentInRange:
          current != null &&
          (() => {
            const lr = list.getBoundingClientRect();
            const cr = current.getBoundingClientRect();
            return cr.top >= lr.top - 1 && cr.bottom <= lr.bottom + 1;
          })(),
      };
    });
    ok(menuScroll !== null, "▾ 菜单列表滚动容器在");
    ok(menuScroll?.maxH === "200px", `列表 max-h 200px 定高（实际 ${menuScroll?.maxH}）`);
    ok(menuScroll?.itemsCount === 6, `实例行 6 条（实际 ${menuScroll?.itemsCount}）`);
    ok(menuScroll?.listScrollable === true, "6 实例溢出 max-h 200px → 列表可滚");
    ok(menuScroll?.currentInRange === true, "当前行（背景高亮）在列表视野内");
    await page2.keyboard.press("Escape");
    await page2.waitForTimeout(300);

    console.log("\n===== Part 8. 行1 几何（对标 workspace.html + v2-primitives.css）=====");
    const geo = await page2.evaluate(() => {
      const px = (v) => parseFloat(v);
      const rgbStr = (el) => getComputedStyle(el).color;
      const back = document.querySelector(".nav .back");
      const navTitle = document.querySelector(".nav .nv-t");
      const titleBtn = document.querySelector(".nav .nv-t button");
      const panelTicon = document.querySelector('.nav button[aria-label="检视面板"]');
      const moreBtn = document.querySelector('.nav button[aria-label="更多操作"]');
      const runct = document.querySelector(".nav .runct");
      const rootStyle = getComputedStyle(document.documentElement);
      const svgRect = (el) => {
        const svg = el?.querySelector("svg");
        const r = svg?.getBoundingClientRect();
        return r ? `${Math.round(r.width)}x${Math.round(r.height)}` : null;
      };
      return {
        backText: back?.textContent.trim(),
        backColor: back ? rgbStr(back) : null,
        backFontSize: back ? getComputedStyle(back).fontSize : null,
        backArrow: back ? getComputedStyle(back, "::before").width !== "0px" : false,
        navTitleFont: navTitle
          ? `${px(getComputedStyle(navTitle).fontSize)}/${getComputedStyle(navTitle).fontWeight}`
          : null,
        titleBtnText: titleBtn?.textContent.trim(),
        runctFont: runct ? getComputedStyle(runct).fontSize : null,
        runctColor: runct ? rgbStr(runct) : null,
        panelSvg: svgRect(panelTicon),
        morePresent: moreBtn !== null,
        primary: rootStyle.getPropertyValue("--c-primary").trim(),
        success: rootStyle.getPropertyValue("--c-success-text").trim(),
      };
    });
    ok(
      geo.backText === "项目" &&
        geo.backColor === hexToRgb(geo.primary) &&
        geo.backFontSize === "15px",
      `nav .back「项目」主色 15px（color=${geo.backColor}）`,
    );
    ok(geo.backArrow, "nav .back ::before 返回箭头（border 画笔）存在");
    ok(geo.navTitleFont === "17/600", `.nv-t 标题 17px/600（实际 ${geo.navTitleFont}）`);
    ok(
      geo.titleBtnText?.includes("Probe Agent E") === true,
      `标题 = 聚焦实例名（「${geo.titleBtnText}」）`,
    );
    ok(
      geo.runctFont === "9px" && geo.runctColor === hexToRgb(geo.success),
      `.runct 9px 绿（实际 ${geo.runctFont}）`,
    );
    // 真机复验反馈②（2026-10-06）：面板钮与 ⋯ 同 .ic 26×26 形制（原型 nav 右端两钮恒 .ic，
    // svg 20px）——此前 .ticon 19px 与工具页 [pencil][⋯] 中心距不一致。
    ok(geo.panelSvg === "20x20", `面板钮 .ic svg 20×20（实际 ${geo.panelSvg}）`);
    ok(geo.morePresent === true, "⋯ 更多菜单钮在（data-role=nav-more）");
    await ctx2.close();

    // ── Part 9：nav back ◄ 点击 → URL 回项目列表（v1.5 back = 项目 Tab 根语义）──
    console.log("\n===== Part 9. nav back 点击 → URL 回项目列表 =====");
    const ctx3 = await browser.newContext(MOBILE_CTX);
    const page3 = await ctx3.newPage();
    await setupMocks(page3, { sessionIds: ["agent_probe-1"] });
    await login(page3);
    await page3.goto(`${ORIGIN}/projects/proj1/session/agent_probe-1`);
    await page3.waitForSelector(".nav .back", { timeout: 8000 });
    // v1.4 批2：InspectionPanel 常驻挂载（closed 时 DOM 仍在）——header nav 是文档序第一个。
    await page3.locator(".nav .back").first().click({ timeout: 5000 });
    await page3.waitForURL(/\/projects\/?$/, { timeout: 8000 });
    ok(
      /\/projects\/?$/.test(new URL(page3.url()).pathname),
      `back 点击回项目列表（实际 ${new URL(page3.url()).pathname}）`,
    );
    await ctx3.close();

    // ── Part 10：批 10 反馈③ + 批 12 反馈⑤——切换锚 chevron + ▾ 菜单跨项目实例行 ──────
    console.log("\n===== Part 10. 切换锚 chevron + ▾ 跨项目实例行（反馈③⑤）=====");
    const FOREIGN = [
      {
        // wire shape = 扁平（useGlobalInstanceCandidates :1834 映射 ref 嵌套）。
        projectName: "ops-project",
        sessionId: "agent_ops-1",
        status: "running",
        type: "agent",
        displayName: "Ops Agent",
      },
      {
        projectName: "ops-project",
        sessionId: "agent_ops-2",
        status: "idle",
        type: "agent",
        displayName: "Ops Agent B",
      },
    ];
    const ctx4 = await browser.newContext(MOBILE_CTX);
    const page4 = await ctx4.newPage();
    await setupMocks(page4, { sessionIds: ["agent_probe-1"], foreignCandidates: FOREIGN });
    // 外项目实例的 session detail mock（点击跨项目行导航后聚焦面挂载数据）。
    await page4.route(/\/api\/projects\/ops-project\/agent-sessions(?:\?.*)?$/, (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          sessions: [
            {
              id: "agent_ops-1",
              projectName: "ops-project",
              provider: "claude",
              displayName: "Ops Agent",
              status: "running",
              createdAt: "2026-07-26T00:00:00.000Z",
            },
          ],
        }),
      }),
    );
    await login(page4);
    await seedLayout(page4, ["agent_probe-1"], "agent_probe-1");
    await page4.goto(`${ORIGIN}/projects/proj1/session/agent_probe-1`);
    await page4.waitForSelector('[data-tab-id="agent_probe-1"]', { timeout: 8000 });
    // 标题钮内：行首 .tticn 类型标（v1.6 workspace.html h1：agent 聚焦 = sparkles）+ 切换锚
    //（批 12 反馈⑤：CSS 手绘 .sw 退役 → Lucide 管线 svg；size-3.5 显式尺寸防 WebKit 收缩
    // 隐形 §15⑤）。tticn 几何 15×15 + strokeWidth 1.8（svg 自身显式，attribute 压继承）。
    const swGeo = await page4.evaluate(() => {
      const svg = document.querySelector(".nav h1 button svg.size-3\\.5");
      if (!svg) return null;
      const r = svg.getBoundingClientRect();
      return { w: r.width, h: r.height, cls: svg.getAttribute("class") ?? "" };
    });
    ok(swGeo !== null, "切换锚 svg 在标题钮内（.sw 手绘盒退役 → Lucide）");
    ok(
      swGeo !== null && /size-3\.5/.test(swGeo.cls),
      `切换锚 svg 显式尺寸 class（size-3.5；实际 ${swGeo ? swGeo.cls : "null"}）`,
    );
    ok(
      swGeo !== null && swGeo.w >= 13 && swGeo.w <= 15 && swGeo.h >= 13 && swGeo.h <= 15,
      `切换锚 svg 几何 14px 区间（实际 ${swGeo ? `${swGeo.w}x${swGeo.h}` : "null"}）`,
    );
    const tt = await page4.evaluate(() => {
      const span = document.querySelector(".nav h1 button .tticn");
      const svg = span?.querySelector("svg");
      if (!span || !svg) return null;
      const r = svg.getBoundingClientRect();
      return { w: r.width, h: r.height, sw: getComputedStyle(svg).strokeWidth };
    });
    ok(tt !== null, "行1 类型标 .tticn 在场（v1.6 h1 行首）");
    ok(
      tt !== null && tt.w >= 14 && tt.w <= 16 && tt.h >= 14 && tt.h <= 16,
      `tticn svg 几何 15×15（实际 ${tt ? `${tt.w}x${tt.h}` : "null"}）`,
    );
    ok(
      tt !== null && tt.sw === "1.8px",
      `tticn svg strokeWidth 1.8（实际 ${tt ? tt.sw : "null"}）`,
    );
    await openSwitchMenu(page4);
    const cross = await page4.evaluate(() => {
      const menu = [...document.querySelectorAll('[role="menu"]')].at(-1);
      const items = [...(menu?.querySelectorAll('[role="menuitem"]') ?? [])];
      // 组头 = 分组 wrapper（滚动容器 div.max-h-[200px] 直接子 div）的首个子 div。
      const wrappers = [...(menu?.querySelector("div.max-h-\\[200px\\]")?.children ?? [])];
      const heads = wrappers.map((w) => w.firstElementChild?.textContent?.trim() ?? "");
      const foreign = items.filter((it) => it.textContent?.includes("Ops Agent"));
      // v1.6：行内 badge 退役（项目名上收组头）。
      const foreignWithBadge = foreign.filter((it) => it.textContent?.includes("ops-project"));
      const own = items.find((it) => it.textContent?.includes("Probe Agent A"));
      return {
        heads,
        foreignCount: foreign.length,
        badgeCount: foreignWithBadge.length,
        ownBg: own ? getComputedStyle(own).backgroundColor : "no-own-row",
        ownHasCheck: own?.textContent?.includes("✓") ?? false,
      };
    });
    ok(cross.foreignCount === 2, `外项目实例行 2 条（实际 ${cross.foreignCount}）`);
    ok(cross.badgeCount === 0, `外项目行内 badge 退役（0 条；实际 ${cross.badgeCount}）`);
    ok(
      cross.heads.includes("ops-project"),
      `外项目组头 = 项目名（组头序 ${JSON.stringify(cross.heads)}）`,
    );
    ok(cross.heads[0] === "proj1", `当前项目组置顶（组头序 ${JSON.stringify(cross.heads)}）`);
    ok(
      cross.ownBg !== "no-own-row" && cross.ownBg !== "rgba(0, 0, 0, 0)" && cross.ownBg !== "",
      `本项目当前行 = 背景高亮（bg ${cross.ownBg}）`,
    );
    ok(cross.ownHasCheck === false, "本项目行 ✓ 记号退役（v1.6 图例②）");
    // 跨项目行点击 → 直接导航目标项目聚焦目标实例（反馈③核心语义）。
    const page4Diag = { errors: [] };
    page4.on("console", (m) => {
      if (m.type() === "error") page4Diag.errors.push(m.text().slice(0, 160));
    });
    await page4.getByRole("menuitem").filter({ hasText: "Ops Agent B" }).click();
    try {
      await page4.waitForURL(/\/projects\/ops-project\/session\/agent_ops-2/, { timeout: 8000 });
    } catch {
      console.log(`  [diag] 点击后 URL: ${page4.url()}`);
      console.log(`  [diag] console errors: ${JSON.stringify(page4Diag.errors.slice(0, 4))}`);
    }
    ok(
      /\/projects\/ops-project\/session\/agent_ops-2/.test(new URL(page4.url()).pathname),
      `跨项目行点击 → 导航目标项目聚焦目标实例（实际 ${page4.url()}）`,
    );

    console.log("\n===== Part 11. ⋯ 菜单三区（v1.6 workspace-more-menu）=====");
    // 回到本项目会话（Part 10 导航到了 ops-project；mock 只覆盖 proj1 + ops agent 列表，
    // auto-retry/pinned mock 是全局 URL 正则，跨项目同样命中，但 SESSIONS 取值按 sid）。
    await page4.goto(`${ORIGIN}/projects/proj1/session/agent_probe-1`, { timeout: 8000 });
    await page4.waitForSelector('[data-tab-id="agent_probe-1"]', { timeout: 8000 });
    await page4.locator('.nav button[aria-label="更多操作"]').click({ timeout: 5000 });
    await page4.getByRole("menuitem").first().waitFor({ timeout: 5000 });
    const zones = await page4.evaluate(() => {
      const menu = [...document.querySelectorAll('[role="menu"]')].at(-1);
      const items = [...(menu?.querySelectorAll('[role="menuitem"]') ?? [])];
      return items.map((it) => ({
        label: it.textContent?.replace(/[›✓]/g, "").trim() ?? "",
        hasArrow: it.textContent?.includes("›") ?? false,
        hasCheck: it.textContent?.includes("✓") ?? false,
        color: getComputedStyle(it).color,
      }));
    });
    const labels = zones.map((z) => z.label);
    // 末项「取消」是 sheet 容器项（非三区内容），断言只看前 6 项。
    ok(
      labels.length >= 6 &&
        labels[0].includes("会话历史") &&
        labels[1].includes("实例信息") &&
        labels[2].includes("置顶") &&
        labels[3].includes("重命名") &&
        labels[4].includes("自动重试") &&
        labels[5].includes("关闭会话"),
      `三区 6 项按原型序（实际 ${JSON.stringify(labels)}）`,
    );
    ok(zones[0]?.hasArrow === true && zones[1]?.hasArrow === true, "导航区两行带 › 导航标注");
    ok(zones[2]?.hasCheck === false, "置顶行未置顶 → 无 ✓");
    // keepOpen 即点即改：点置顶行 → 菜单保持开 + ✓ 出现（mock POST → invalidate → refetch）。
    await page4.getByRole("menuitem").filter({ hasText: "置顶" }).click();
    await page4
      .waitForFunction(
        () => {
          const menu = [...document.querySelectorAll('[role="menu"]')].at(-1);
          if (!menu) return false;
          const items = [...menu.querySelectorAll('[role="menuitem"]')];
          const pinRow = items.find((it) => it.textContent?.includes("置顶"));
          return pinRow != null && (pinRow.textContent?.includes("✓") ?? false);
        },
        undefined,
        { timeout: 5000 },
      )
      .catch(() => {});
    const afterPin = await page4.evaluate(() => {
      const menu = [...document.querySelectorAll('[role="menu"]')].at(-1);
      return {
        menuOpen: menu != null,
        pinChecked:
          [...(menu?.querySelectorAll('[role="menuitem"]') ?? [])]
            .find((it) => it.textContent?.includes("置顶"))
            ?.textContent?.includes("✓") ?? false,
      };
    });
    ok(afterPin.menuOpen === true, "置顶点击后菜单保持开（keepOpen 即点即改）");
    ok(afterPin.pinChecked === true, "置顶后 ✓ 态标注出现");
    // 自动重试行（claude 会话）✓ toggle 同款即点即改。
    await page4.getByRole("menuitem").filter({ hasText: "自动重试" }).click();
    await page4
      .waitForFunction(
        () => {
          const menu = [...document.querySelectorAll('[role="menu"]')].at(-1);
          if (!menu) return false;
          const items = [...menu.querySelectorAll('[role="menuitem"]')];
          const retryRow = items.find((it) => it.textContent?.includes("自动重试"));
          return retryRow != null && (retryRow.textContent?.includes("✓") ?? false);
        },
        undefined,
        { timeout: 5000 },
      )
      .catch(() => {});
    const afterRetry = await page4.evaluate(() => {
      const menu = [...document.querySelectorAll('[role="menu"]')].at(-1);
      return {
        menuOpen: menu != null,
        retryChecked:
          [...(menu?.querySelectorAll('[role="menuitem"]') ?? [])]
            .find((it) => it.textContent?.includes("自动重试"))
            ?.textContent?.includes("✓") ?? false,
      };
    });
    ok(afterRetry.menuOpen === true && afterRetry.retryChecked === true, "自动重试 ✓ 即点即改");
    // 销毁区关闭行 = 红（error token 色）。读 tokens 实际值对照。
    const closeColor = await page4.evaluate(() => {
      const menu = [...document.querySelectorAll('[role="menu"]')].at(-1);
      const row = [...(menu?.querySelectorAll('[role="menuitem"]') ?? [])].find((it) =>
        it.textContent?.includes("关闭会话"),
      );
      return row ? getComputedStyle(row).color : null;
    });
    const errToken = await page4.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--c-danger").trim(),
    );
    ok(
      closeColor !== null && errToken !== "" && closeColor === hexToRgb(errToken),
      `关闭行红色 = --c-danger（close=${closeColor} token=${hexToRgb(errToken)}）`,
    );
    await page4.keyboard.press("Escape");
    await ctx4.close();
  } finally {
    await browser.close();
  }

  console.log(`\n总计: ${passCount} pass / ${failCount} fail`);
  process.exit(failCount > 0 ? 1 : 0);
}

await run();
