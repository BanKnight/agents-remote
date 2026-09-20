// 移动项目工作台逐状态探针（v2 M3-c，对标 03c/03f/03h 原型 + v2-primitives.css）。
// 覆盖 M3-c 壳层收敛的四个状态（DOM 硬数据，禁截图）：
//   空态卡（03h）：无实例时主体 = .empty 卡（图标容器 64×64 / h2 16px/600 / CTA 200×40
//     rounded-full bg-primary / 工具引导 link）；CTA 开新建 ActionMenu；link 进 files 工具。
//   浏览态自动聚焦：无显式 ?session 时渲染层回退聚焦「layout 上次位置」（D4 延伸），URL
//     不写 ?session；无 layout 时回退第一个实例。
//   terminal chips（03f）：聚焦 terminal 时 chips 行 = `tmux · 名` mono chip（无摘要/重试）。
//   file 预览 ✕（M3-c 关闭路径）：file focus 的 nav 右 ✕ = removeTabFromLeaf + 回浏览态。
//
// 密码自读（config.yaml → api environ），不进 agent 上下文、不打印值。
// 用法：bun scripts/probe-mobile-workbench-states.mjs
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

const AGENTS = {
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
};
const TERMINAL = {
  id: "terminal_probe-1",
  projectName: "proj1",
  displayName: "Probe Term",
  status: "running",
  updatedAt: "2026-07-26T00:00:00.000Z",
};
const projectName = "proj1";

const MOBILE_CTX = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  locale: "zh-CN",
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
};

function agentDetail(session) {
  return {
    session,
    availableModels: ["sonnet", "opus", "haiku"],
    availablePermissionModes: ["default", "bypassPermissions"],
  };
}

/** mock 基座：overview / agent-sessions 列表+详情 / terminal-sessions 列表+详情 / 文件预览。 */
async function setupMocks(page, { agents, terminals }) {
  await page.route(/\/api\/overview$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ projectNames: [projectName], candidates: [] }),
    }),
  );
  await page.route(new RegExp(`/api/projects/${projectName}/agent-sessions(?:\\?.*)?$`), (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sessions: agents.map((id) => AGENTS[id]) }),
    }),
  );
  await page.route(new RegExp(`/api/projects/${projectName}/terminal-sessions(?:\\?.*)?$`), (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sessions: terminals.map(() => TERMINAL) }),
    }),
  );
  for (const id of agents) {
    await page.route(new RegExp(`/api/projects/${projectName}/agent-sessions/${id}$`), (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(agentDetail(AGENTS[id])),
      }),
    );
  }
  if (terminals.length > 0) {
    await page.route(
      new RegExp(`/api/projects/${projectName}/terminal-sessions/${TERMINAL.id}$`),
      (r) =>
        r.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ session: TERMINAL }),
        }),
    );
  }
  // file 预览（previewProjectFile → /files/preview?path=…）：只求面板能挂载，不验内容。
  await page.route(/\/api\/projects\/proj1\/files.*/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ content: "probe", language: "markdown" }),
    }),
  );
  // 聚焦 session 面板连真实 WS（fake session 不存在 → error，但 panel 容器仍渲染）。
  await page.routeWebSocket(/stream/, (ws) => ws.connectToServer());
}

/** 预置 V4 layout。sessions = agent/terminal id；fileTabPath 非空时附一个 file tab（active 优先）。 */
async function seedLayout(page, { sessions = [], active, fileTabPath }) {
  await page.evaluate(
    ({ ids, activeId, filePath }) => {
      localStorage.removeItem("workbenchMiddleTab");
      const tabs = [
        ...ids.map((sessionId) => ({ kind: "session", projectName: "proj1", sessionId })),
        ...(filePath ? [{ kind: "file", path: filePath }] : []),
      ];
      localStorage.setItem(
        "workbenchLayoutV4",
        JSON.stringify({
          root: {
            kind: "leaf",
            id: "leaf-seed",
            tabs,
            activeTabId: activeId ?? null,
          },
          activeGroupId: "leaf-seed",
          maximized: null,
        }),
      );
    },
    { ids: sessions, activeId: active, filePath: fileTabPath },
  );
}

async function login(page) {
  await page.goto(`${ORIGIN}/`);
  await page.waitForSelector('input[type="password"]', { timeout: 15000 });
  await page.getByLabel("访问密码").fill(await readAppPassword());
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForSelector("nav[aria-label]", { timeout: 15000 });
}

async function run() {
  const browser = await chromium.launch();
  try {
    // ── context 1：空态卡（03h）──────────────────────────────────────────
    console.log("\n===== Part 1. 空态卡（无实例 → 03h .empty 卡）=====");
    const ctx1 = await browser.newContext(MOBILE_CTX);
    const page1 = await ctx1.newPage();
    await setupMocks(page1, { agents: [], terminals: [] });
    await login(page1);
    await seedLayout(page1, {});
    await page1.goto(`${ORIGIN}/projects/proj1`);
    await page1.waitForSelector(".empty-card", { timeout: 8000 });
    const emptyGeo = await page1.evaluate(() => {
      const card = document.querySelector(".empty-card");
      const big = card?.querySelector(".empty-big");
      const h2 = card?.querySelector("h2");
      const cta = card?.querySelector("button.empty-cta");
      const link = document.querySelector(".empty-link");
      const cs = (el) => (el ? getComputedStyle(el) : null);
      return {
        title: h2?.textContent.trim(),
        h2Font: h2 ? `${parseFloat(cs(h2).fontSize)}/${cs(h2).fontWeight}` : null,
        bigSize: big
          ? `${Math.round(big.getBoundingClientRect().width)}x${Math.round(big.getBoundingClientRect().height)}`
          : null,
        ctaSize: cta
          ? `${Math.round(cta.getBoundingClientRect().width)}x${Math.round(cta.getBoundingClientRect().height)}`
          : null,
        ctaRadius: cta ? cs(cta).borderRadius : null,
        ctaBg: cta ? cs(cta).backgroundColor : null,
        linkText: link?.textContent.trim(),
        primary: getComputedStyle(document.documentElement).getPropertyValue("--c-primary").trim(),
      };
    });
    const hexToRgb = (hex) => {
      const n = parseInt(hex.slice(1), 16);
      return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
    };
    ok(emptyGeo.title === "这个项目还没有会话", `空态标题文案（实际「${emptyGeo.title}」）`);
    ok(emptyGeo.h2Font === "16/600", `h2 16px/600（实际 ${emptyGeo.h2Font}）`);
    ok(emptyGeo.bigSize === "64x64", `.empty-big 图标容器 64×64（实际 ${emptyGeo.bigSize}）`);
    ok(
      emptyGeo.ctaSize === "200x40" && Number.parseFloat(emptyGeo.ctaRadius) > 20,
      `CTA 200×40 胶囊（实际 ${emptyGeo.ctaSize}/${emptyGeo.ctaRadius}）`,
    );
    ok(emptyGeo.ctaBg === hexToRgb(emptyGeo.primary), `CTA bg-primary（实际 ${emptyGeo.ctaBg}）`);
    ok(emptyGeo.linkText === "先看看文件 / Git ›", `工具引导 link（实际「${emptyGeo.linkText}」）`);
    // CTA → ActionMenu（新建实例菜单）
    await page1.locator(".empty-cta").click({ timeout: 5000 });
    ok(
      (await page1
        .getByText(/^Claude$/, { exact: true })
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false)) ||
        (await page1
          .getByRole("menuitem", { name: /Claude/ })
          .first()
          .isVisible({ timeout: 2000 })
          .catch(() => false)),
      "CTA 打开新建实例 ActionMenu（含 Claude 项）",
    );
    await page1.keyboard.press("Escape");
    // link → files 工具态
    await page1.locator(".empty-link").click({ timeout: 5000 });
    await page1.waitForSelector('[data-mobile-tool="files"]', { timeout: 8000 });
    ok(true, "link 进 files 工具态（data-mobile-tool=files）");
    await ctx1.close();

    // ── context 2：浏览态自动聚焦 ─────────────────────────────────────────
    console.log("\n===== Part 2. 自动聚焦：layout 上次位置（无 ?session，不写 URL）=====");
    const ctx2 = await browser.newContext(MOBILE_CTX);
    const page2 = await ctx2.newPage();
    await setupMocks(page2, { agents: ["agent_probe-1", "agent_probe-2"], terminals: [] });
    await login(page2);
    await seedLayout(page2, {
      sessions: ["agent_probe-1", "agent_probe-2"],
      active: "agent_probe-2",
    });
    await page2.goto(`${ORIGIN}/projects/proj1`);
    await page2.waitForSelector('[data-tab-id="agent_probe-2"]', { timeout: 8000 });
    const p2Visible = await page2.evaluate(() => {
      const el = document.querySelector('[data-tab-id="agent_probe-2"]');
      return el !== null && getComputedStyle(el).display !== "none";
    });
    ok(p2Visible, "自动聚焦 leaf activeTab（agent_probe-2 面板 visible）");
    ok(
      (await page2.locator(".empty-card").count()) === 0,
      "无空态卡与面板同屏（reviewer #1 双渲染修复）",
    );
    ok(!/\/session\//.test(page2.url()), `URL 不写 ?session（实际 ${page2.url()}）`);
    const pillOn = await page2.evaluate(() => {
      const pill = [...document.querySelectorAll(".pills .pill")].find((p) =>
        p.textContent.includes("Probe Agent B"),
      );
      return pill?.getAttribute("data-active") === "true";
    });
    ok(pillOn, "对应 pill 激活（data-active=true）");

    console.log("\n===== Part 3. 自动聚焦回退：无 layout tab → 第一个实例 =====");
    const ctx3 = await browser.newContext(MOBILE_CTX);
    const page3 = await ctx3.newPage();
    await setupMocks(page3, { agents: ["agent_probe-1", "agent_probe-2"], terminals: [] });
    await login(page3);
    await seedLayout(page3, {});
    await page3.goto(`${ORIGIN}/projects/proj1`);
    await page3.waitForSelector('[data-tab-id="agent_probe-1"]', { timeout: 8000 });
    const p1Visible = await page3.evaluate(() => {
      const el = document.querySelector('[data-tab-id="agent_probe-1"]');
      return el !== null && getComputedStyle(el).display !== "none";
    });
    ok(p1Visible, "回退聚焦第一个实例（agent_probe-1 面板 visible）");
    ok(
      (await page3.locator(".empty-card").count()) === 0,
      "回退态无空态卡（reviewer #1 双渲染修复）",
    );
    await ctx3.close();

    // ── context 4：terminal chips（03f）──────────────────────────────────
    console.log("\n===== Part 4. terminal chips 行（03f：tmux chip，无摘要/重试）=====");
    const ctx4 = await browser.newContext(MOBILE_CTX);
    const page4 = await ctx4.newPage();
    await setupMocks(page4, { agents: ["agent_probe-1"], terminals: ["terminal_probe-1"] });
    await login(page4);
    await seedLayout(page4, {
      sessions: ["agent_probe-1", "terminal_probe-1"],
      active: "terminal_probe-1",
    });
    await page4.goto(`${ORIGIN}/projects/proj1`);
    await page4.waitForSelector('[data-tab-id="terminal_probe-1"]', { timeout: 8000 });
    const termChips = await page4.evaluate(() => {
      const chips = document.querySelector(".chips");
      const chip = chips?.querySelector(".chip");
      return {
        exists: chips !== null,
        text: chip?.textContent.trim(),
        mono: chip ? getComputedStyle(chip).fontFamily.includes("mono") : false,
        hasAutoRetry: chips?.textContent.includes("自动重试") ?? false,
      };
    });
    ok(
      termChips.exists && termChips.text === "tmux · Probe Term",
      `tmux chip 文案（实际「${termChips.text}」）`,
    );
    ok(termChips.mono, "chip mono 字体");
    ok(!termChips.hasAutoRetry, "无自动重试区（03f 编号①：无模型/权限/effort）");
    await ctx4.close();

    // ── context 5：file 预览 ✕（M3-c 关闭路径）───────────────────────────
    console.log("\n===== Part 5. file 预览 ✕：removeTabFromLeaf + 回浏览态 =====");
    const ctx5 = await browser.newContext(MOBILE_CTX);
    const page5 = await ctx5.newPage();
    await setupMocks(page5, { agents: ["agent_probe-1"], terminals: [] });
    await login(page5);
    await seedLayout(page5, {
      sessions: ["agent_probe-1"],
      active: "file_proj1/README.md",
      fileTabPath: "proj1/README.md",
    });
    await page5.goto(`${ORIGIN}/projects/proj1/file/README.md`);
    await page5.waitForSelector('[data-tab-id="file_proj1/README.md"]', { timeout: 8000 });
    const closeBtn = page5.locator('.nav [aria-label="关闭"], .nav [aria-label="Close"]').first();
    ok((await closeBtn.count()) > 0, "file focus 的 nav 右 ✕ 存在");
    await closeBtn.click({ timeout: 5000 });
    await page5.waitForSelector('[data-tab-id="agent_probe-1"]', { timeout: 8000 });
    const afterClose = await page5.evaluate(() => {
      const fileTab = document.querySelector('[data-tab-id="file_proj1/README.md"]');
      const agentTab = document.querySelector('[data-tab-id="agent_probe-1"]');
      return {
        url: location.pathname,
        fileGone: fileTab === null,
        agentVisible: agentTab !== null && getComputedStyle(agentTab).display !== "none",
      };
    });
    ok(afterClose.url === `/projects/${projectName}`, `URL 回项目工作台（实际 ${afterClose.url}）`);
    ok(afterClose.fileGone, "file tab 已从 layout 移除（不渲染）");
    ok(afterClose.agentVisible, "回退自动聚焦 agent_probe-1（面板 visible）");
    await ctx5.close();

    // ── context 6：回退态聚焦 terminal（reviewer #1：注入 ref 兜底前 chips 全缺）────────
    console.log("\n===== Part 6. 回退态聚焦 terminal：注入 ref 兜底 → tmux chip 恢复 =====");
    const ctx6 = await browser.newContext(MOBILE_CTX);
    const page6 = await ctx6.newPage();
    // 仅 terminal 实例（无 agent）：autoFocus 回退 = terminal id，且不在空 layout → 注入投影。
    await setupMocks(page6, { agents: [], terminals: ["terminal_probe-1"] });
    await login(page6);
    await seedLayout(page6, {});
    await page6.goto(`${ORIGIN}/projects/proj1`);
    await page6.waitForSelector('[data-tab-id="terminal_probe-1"]', { timeout: 8000 });
    const termFallback = await page6.evaluate(() => {
      const panel = document.querySelector('[data-tab-id="terminal_probe-1"]');
      const chip = document.querySelector(".chips .chip");
      return {
        panelVisible: panel !== null && getComputedStyle(panel).display !== "none",
        chipText: chip?.textContent.trim(),
        emptyCard: document.querySelector(".empty-card") !== null,
        closeBtn:
          document.querySelector('.nav [aria-label="关闭"], .nav [aria-label="Close"]') !== null,
      };
    });
    ok(termFallback.panelVisible && !termFallback.emptyCard, "terminal 面板 visible（无双渲染）");
    ok(
      termFallback.chipText === "tmux · Probe Term",
      `回退态 tmux chip 存在（实际「${termFallback.chipText}」）`,
    );
    ok(termFallback.closeBtn, "回退态聚焦实例 ℹ/✕（focusActions）恢复");
    await ctx6.close();
  } finally {
    await browser.close();
  }

  console.log(`\n总计: ${passCount} pass / ${failCount} fail`);
  process.exit(failCount > 0 ? 1 : 0);
}

await run();
