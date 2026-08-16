// 探针：移动端 tab 带 3 个行为修正（2026-08-17，设计 workbench-views §7.7）：
//  问题 1 新建 tab 应成为激活 tab（drawer 总览段新建 → 自动关 drawer + 新 tab 激活可见）。
//  问题 2 激活 tab 滚入视野（MobileTabStrip auto-scroll，横滚区 scrollLeft 随激活调整）。
//  问题 3 切 tab 再切回不重连（保活 = 本会话「聚焦过即可」：聚焦过的 tab 保持挂载 hidden，
//        刷新重进只挂载当前激活的，随切换逐步纳入；切 tab 面板不卸载 → WS 不断）。
//
// 断言（zh-CN + iPhone 12 Pro 390×844，全新 context 无 SW，mock 数据 + mock WS）：
//  1. 聚焦态进入（URL 带 focusId）drawer 收起（不遮挡会话面板）。
//  2. 聚焦过即可：刷新/进入时只挂载当前激活 tab 面板（agent_probe-2 未聚焦过 → 不在 DOM）。
//  3. 切 tab 到 B：B 挂载 visible + A 仍在 DOM（hidden 保活，未卸载）+ A __probe marker 保留。
//  4. 切回 A：A visible 且 __probe 保留（面板未重挂 = 组件实例保持 = WS 不断）+ B 保活 hidden。
//  5. reload 后：A（当前激活）挂载，B 不在 DOM（聚焦过即可——focusedTabIds 重置只含激活）。
//  6. drawer 总览段新建：新会话 tab 激活 + drawer 自动关 + 新 chip active + 面板挂载。
//  7. auto-scroll：5 个 tab 激活在尾部 → 横滚区 scrollLeft>0 + active chip 完全在视野内。
//
// 密码由脚本自读（env → config.yaml → api 进程 environ），不进 agent 上下文、不打印值。
// 用法：bun scripts/probe-mobile-tab-strip.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const EXEC =
  "/home/deploy/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell";

const SESSIONS = {
  "agent_probe-1": {
    id: "agent_probe-1",
    projectName: "proj1",
    provider: "claude2",
    displayName: "Probe Agent A",
    status: "idle",
    createdAt: "2026-07-26T00:00:00.000Z",
  },
  "agent_probe-2": {
    id: "agent_probe-2",
    projectName: "proj1",
    provider: "claude2",
    displayName: "Probe Agent B",
    status: "idle",
    createdAt: "2026-07-26T00:00:00.000Z",
  },
  "agent_probe-3": {
    id: "agent_probe-3",
    projectName: "proj1",
    provider: "claude2",
    displayName: "Probe Agent C",
    status: "idle",
    createdAt: "2026-07-26T00:00:00.000Z",
  },
  "agent_probe-4": {
    id: "agent_probe-4",
    projectName: "proj1",
    provider: "claude2",
    displayName: "Probe Agent D",
    status: "idle",
    createdAt: "2026-07-26T00:00:00.000Z",
  },
  "agent_probe-5": {
    id: "agent_probe-5",
    projectName: "proj1",
    provider: "claude2",
    displayName: "Probe Agent E",
    status: "idle",
    createdAt: "2026-07-26T00:00:00.000Z",
  },
};
// drawer 新建 mock 返回的新会话（useCreateSession onSuccess navigate 到它）。
const NEW_AGENT = {
  id: "agent_probe-9",
  projectName: "proj1",
  provider: "claude2",
  displayName: "Probe New Agent",
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

const TAB_CHIP = "div.group\\/tab";
const projectName = "proj1";

async function setupMocks(page, { sessionIds } = {}) {
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
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ session: NEW_AGENT }),
      });
    } else {
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ sessions: known }),
      });
    }
  });
  // per-session detail（panel 数据源；known + 新建返回的）。
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
  await page.routeWebSocket(/claude2-stream/, (ws) => ws.connectToServer());
}

/** 预置 V4 layout：proj1 的 session tab 列表 + active（模拟持久化恢复）。 */
async function seedLayout(page, sessionIds, activeId) {
  await page.evaluate(
    ({ ids, active }) => {
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
  await page.goto(`${WEB_ORIGIN}/`);
  await page
    .getByLabel("密码")
    .or(page.getByLabel("Password"))
    .fill(await readAppPassword());
  await page.getByRole("button", { name: /解锁|Unlock/ }).click();
  await page.waitForTimeout(700);
}

/** 读保活面板状态：null = 不在 DOM；visible = display 非 none。 */
async function panelState(page, tabId) {
  return await page.evaluate((id) => {
    const el = document.querySelector(`[data-tab-id="${id}"]`);
    if (!el) return null;
    return { visible: getComputedStyle(el).display !== "none" };
  }, tabId);
}

/** 读 drawer 展开状态（2026-08-17 Reddit 式 push 整页平移后）：drawer aside absolute 左侧
 *  静态常驻（宽度恒 340），开合 = 页面容器 translate-x。open = 页面 left > 200（展开/动画中），
 *  closed = left ≤ 1（平移回 0 盖回）。 */
async function drawerOpenState(page) {
  return await page.evaluate(() => {
    const aside = document.querySelector(
      'aside[aria-label*="侧边栏"], aside[aria-label*="sidebar" i]',
    );
    if (!aside) return { present: false, open: false, shift: -1 };
    const pageEl = aside.parentElement.nextElementSibling;
    if (!pageEl) return { present: true, open: false, shift: -1 };
    const shift = Math.round(pageEl.getBoundingClientRect().left);
    return { present: true, open: shift > 200, shift };
  });
}

/** 等待面板切到指定可见性（auto-scroll / focus effect 异步后稳定）。 */
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
  const browser = await chromium.launch({ executablePath: EXEC });
  try {
    // ── context 1：保活（问题 3）+ 聚焦过即可 + drawer 新建关闭（问题 1）─────
    const ctx = await browser.newContext(MOBILE_CTX);
    const page = await ctx.newPage();
    await setupMocks(page, { sessionIds: ["agent_probe-1", "agent_probe-2"] });
    await login(page);
    await seedLayout(page, ["agent_probe-1", "agent_probe-2"], "agent_probe-1");

    console.log("\n===== 1. 聚焦态进入 drawer 收起 =====");
    await page.goto(`${WEB_ORIGIN}/projects/proj1/session/agent_probe-1`);
    await page.waitForSelector('[data-tab-id="agent_probe-1"]', { timeout: 8000 });
    // Reddit 式 push（2026-08-17 二次修正）：drawer 收起 = 页面平移回 0 盖回（非 dialog portal）。
    await page.waitForFunction(
      () => {
        const aside = document.querySelector(
          'aside[aria-label*="侧边栏"], aside[aria-label*="sidebar" i]',
        );
        if (!aside) return false;
        const pageEl = aside.parentElement.nextElementSibling;
        return pageEl !== null && Math.abs(pageEl.getBoundingClientRect().left) <= 1;
      },
      { timeout: 8000 },
    );
    const drawer1 = await drawerOpenState(page);
    record(!drawer1.open, `聚焦态进入 drawer 收起（页面平移=${drawer1.shift}px）`);

    console.log("\n===== 2. 聚焦过即可：进入只挂载当前激活 =====");
    const a0 = await panelState(page, "agent_probe-1");
    record(a0 !== null && a0.visible, "A（当前激活）面板挂载且 visible");
    const b0 = await page.locator('[data-tab-id="agent_probe-2"]').count();
    record(b0 === 0, "B 未聚焦过 → 不在 DOM（不预挂载）");

    // 在 A 面板 DOM 节点存 marker：React 复用节点时保留 JS 自有属性；卸载重挂则丢。
    await page.evaluate(() => {
      const el = document.querySelector('[data-tab-id="agent_probe-1"]');
      if (el) el.__probe = 1;
    });

    console.log("\n===== 3. 切 B：A 保活 hidden + B 挂载 =====");
    await page.locator(TAB_CHIP, { hasText: "Probe Agent B" }).click({ timeout: 5000 });
    await page.waitForURL(/\/projects\/proj1\/session\/agent_probe-2/, { timeout: 8000 });
    await waitPanelVisible(page, "agent_probe-2", true);
    const b1 = await panelState(page, "agent_probe-2");
    record(b1 !== null && b1.visible, "B 面板挂载且 visible");
    const a1 = await panelState(page, "agent_probe-1");
    record(a1 !== null && !a1.visible, "A 面板仍在 DOM（保活 hidden，未卸载）");
    const marker1 = await page.evaluate(() => {
      const el = document.querySelector('[data-tab-id="agent_probe-1"]');
      return el ? el.__probe : undefined;
    });
    record(marker1 === 1, "切走时 A 未重挂（__probe 保留）");

    console.log("\n===== 4. 切回 A：未重挂（组件实例保持 → WS 不断）=====");
    await page.locator(TAB_CHIP, { hasText: "Probe Agent A" }).click({ timeout: 5000 });
    await page.waitForURL(/\/projects\/proj1\/session\/agent_probe-1/, { timeout: 8000 });
    await waitPanelVisible(page, "agent_probe-1", true);
    const marker2 = await page.evaluate(() => {
      const el = document.querySelector('[data-tab-id="agent_probe-1"]');
      return el ? el.__probe : undefined;
    });
    record(marker2 === 1, "切回 A 未重挂（__probe 仍在 → 切 tab 不重连）");
    const b2 = await panelState(page, "agent_probe-2");
    record(b2 !== null && !b2.visible, "B 面板保持挂载（hidden 保活）");

    console.log("\n===== 5. reload 后聚焦过即可 =====");
    await page.reload();
    await page.waitForSelector('[data-tab-id="agent_probe-1"]', { timeout: 8000 });
    const a3 = await panelState(page, "agent_probe-1");
    record(a3 !== null && a3.visible, "reload 后 A（当前激活）挂载");
    const b3 = await page.locator('[data-tab-id="agent_probe-2"]').count();
    record(b3 === 0, "reload 后 B 不在 DOM（focusedTabIds 重置只含当前激活）");

    console.log("\n===== 6. drawer 总览段新建 → 新 tab 激活 + drawer 自动关（问题 1）=====");
    await page.getByRole("button", { name: "切换侧边栏" }).click({ timeout: 5000 });
    // Reddit 式 push：等页面平移到展开（left ≈ 340 露出 drawer）。
    await page.waitForFunction(
      () => {
        const aside = document.querySelector(
          'aside[aria-label*="侧边栏"], aside[aria-label*="sidebar" i]',
        );
        if (!aside) return false;
        const pageEl = aside.parentElement.nextElementSibling;
        return pageEl !== null && pageEl.getBoundingClientRect().left > 300;
      },
      { timeout: 8000 },
    );
    await page.waitForTimeout(450);
    const createTrigger = page.locator(
      'aside button[aria-label="新建会话"], aside button[aria-label="New session"]',
    );
    await createTrigger
      .first()
      .click({ timeout: 5000 })
      .catch(() => {});
    await page.waitForTimeout(450);
    // ActionMenu（移动底部 sheet）：点「Claude」（workbench.createClaude2 两语同「Claude」）。
    await page
      .getByText(/^Claude$/, { exact: true })
      .first()
      .click({ timeout: 3000 })
      .catch(async () => {
        await page.evaluate(() => {
          const t = Array.from(document.querySelectorAll('button, [role="menuitem"]')).find((el) =>
            /^Claude$/.test((el.textContent ?? "").trim()),
          );
          if (t) t.click();
        });
      });
    // 命名 prompt：填名 + 创建。
    await page.waitForTimeout(400);
    await page
      .getByPlaceholder("会话名称（可选）")
      .or(page.getByPlaceholder("Session name (optional)"))
      .fill("Probe New Agent");
    await page
      .getByRole("button", { name: /^创建$|^Create$/ })
      .click({ timeout: 3000 })
      .catch(async () => {
        await page.evaluate(() => {
          const t = Array.from(document.querySelectorAll("button")).find((el) =>
            /^(创建|Create)$/.test((el.textContent ?? "").trim()),
          );
          if (t) t.click();
        });
      });
    await page.waitForURL(/\/projects\/proj1\/session\/agent_probe-9/, { timeout: 8000 });
    await page.waitForSelector('[data-tab-id="agent_probe-9"]', { timeout: 8000 });
    // Reddit 式 push：drawer 收起 = 页面平移回 0（等 transition-transform 300ms 完成）。
    await page.waitForFunction(
      () => {
        const aside = document.querySelector(
          'aside[aria-label*="侧边栏"], aside[aria-label*="sidebar" i]',
        );
        if (!aside) return false;
        const pageEl = aside.parentElement.nextElementSibling;
        return pageEl !== null && Math.abs(pageEl.getBoundingClientRect().left) <= 1;
      },
      { timeout: 8000 },
    );
    const drawerAfter = await drawerOpenState(page);
    record(!drawerAfter.open, `新建后 drawer 自动关闭（页面平移=${drawerAfter.shift}px）`);
    const newPanel = await panelState(page, "agent_probe-9");
    record(newPanel !== null && newPanel.visible, "新 tab 激活可见（面板挂载）");
    const newChip = page.locator(TAB_CHIP, { hasText: "Probe New Agent" });
    await newChip.waitFor({ timeout: 8000 });
    const newChipActive = await newChip
      .getAttribute("class")
      .then((c) => (c ?? "").includes("bg-primary/10"));
    record(newChipActive, "新会话 chip 出现在 tab 带且 active");
    await ctx.close();

    // ── context 2：auto-scroll（问题 2）───────────────────────────────────
    console.log("\n===== 7. 激活 tab 滚入视野（auto-scroll）=====");
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
    await page2.goto(`${WEB_ORIGIN}/projects/proj1/session/agent_probe-5`);
    await page2.waitForSelector('[data-tab-id="agent_probe-5"]', { timeout: 8000 });
    // auto-scroll smooth 动画：轮询直到 active chip 完全在横滚区视野内。
    const scrollOk = await page2
      .waitForFunction(
        () => {
          const scroller = document.querySelector("header .overflow-x-auto");
          if (!scroller) return false;
          const chip = scroller.querySelector('[data-active="true"]');
          if (!chip) return false;
          const sr = scroller.getBoundingClientRect();
          const cr = chip.getBoundingClientRect();
          return cr.left >= sr.left - 1 && cr.right <= sr.right + 1;
        },
        undefined,
        { timeout: 4000 },
      )
      .then(() => true)
      .catch(() => false);
    const scrollInfo = await page2.evaluate(() => {
      const scroller = document.querySelector("header .overflow-x-auto");
      if (!scroller) return null;
      const chip = scroller.querySelector('[data-active="true"]');
      if (!chip) return null;
      const sr = scroller.getBoundingClientRect();
      const cr = chip.getBoundingClientRect();
      return {
        scrollLeft: Math.round(scroller.scrollLeft),
        chipRange: `${Math.round(cr.left)}-${Math.round(cr.right)}`,
        scrollerRange: `${Math.round(sr.left)}-${Math.round(sr.right)}`,
        scrollWidth: scroller.scrollWidth,
        clientWidth: scroller.clientWidth,
      };
    });
    record(
      scrollInfo !== null && scrollInfo.scrollLeft > 0,
      `激活 chip 触发横滚（scrollLeft=${scrollInfo?.scrollLeft} > 0）`,
    );
    record(
      scrollOk,
      `激活 chip 完全在视野内（chip ${scrollInfo?.chipRange} ∈ scroller ${scrollInfo?.scrollerRange}，scrollW=${scrollInfo?.scrollWidth} clientW=${scrollInfo?.clientWidth}）`,
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
