// M11 移动底部导航恒显探针（第十轮 §6.12j：nav 通栏化 + 工作台域恒显）。
//
// 原型规则（tabbar 覆盖 22 页、仅 06-login 无）对照断言（DOM 几何硬数据，禁截图）：
//   Part 1 全局一级页（/projects）：nav 存在 4 tab + 通栏几何（宽=vw、bg-elevated、
//     无浮岛圆角/阴影）+「项目」active + 图标 24px + label 11px。
//   Part 2 project scope（/projects/proj1）：nav 存在（旧实现此处缺失——恒显修复核心）+
//     「工作台」active。
//   Part 3 聚焦态（自动聚焦 session）：nav 仍存在 + composer 浮层底边 ≤ nav 顶边
//     （--composer-gap 注入生效，不与 nav 重叠）。
//   Part 4 L3 深度页（git/history）：nav 存在。
//   Part 5 设置页（/settings）：nav 存在（回归）。
//
// 全 mock API（无真实数据创建/删除）；密码自读不进 agent 上下文、不打印值。
// 用法：bun scripts/probe-v2-m11-mobile-nav.mjs

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

function json(body) {
  return { status: 200, contentType: "application/json", body: JSON.stringify(body) };
}

const AGENTS = [
  {
    id: "agent_a",
    projectName: "proj1",
    provider: "claude",
    displayName: "AAA-running",
    status: "running",
    createdAt: "2026-09-22T00:00:00.000Z",
    model: "opus",
    permissionMode: "plan",
    claudeSessionId: "uuid-aaaa",
  },
];

async function setupMocks(page) {
  await page.route("**/api/projects", (r) => {
    if (r.request().method() === "GET") {
      return r.fulfill(json([{ name: "proj1", path: "/srv/projects/proj1" }]));
    }
    return r.fulfill(json({ ok: true }));
  });
  await page.route(/\/api\/overview$/, (r) =>
    r.fulfill(
      json({
        projectNames: ["proj1"],
        candidates: AGENTS.map((a) => ({
          sessionId: a.id,
          projectName: a.projectName,
          displayName: a.displayName,
          status: a.status,
          provider: a.provider,
          type: "agent",
          createdAt: a.createdAt,
          updatedAt: a.createdAt,
        })),
      }),
    ),
  );
  await page.route(/\/api\/state\/overview\/pinned-sessions(\?.*)?$/, (r) =>
    r.fulfill(json({ sessions: [] })),
  );
  await page.route(/\/api\/projects\/proj1\/agent-sessions(\?.*)?$/, (r) =>
    r.fulfill(json({ sessions: AGENTS })),
  );
  await page.route(/\/api\/projects\/proj1\/terminal-sessions(\?.*)?$/, (r) =>
    r.fulfill(json({ sessions: [] })),
  );
  await page.route(/\/api\/projects\/proj1\/agent-sessions\/[^/]+$/, (r) =>
    r.fulfill(
      json({
        session: AGENTS[0],
        availableModels: ["opus"],
        availablePermissionModes: ["plan"],
      }),
    ),
  );
  // 插件/文件域杂项（shell 可能拉取）。
  await page.route(/\/api\/mcp(\?.*)?$/, (r) => r.fulfill(json({ servers: [] })));
  await page.route(/\/api\/skills\/installed\?.*$/, (r) => r.fulfill(json({ skills: [] })));
  await page.route(/\/api\/skills\/updates\?.*$/, (r) => r.fulfill(json({ updates: [] })));
  // session 面板 WS（聚焦态 ClaudeChat 会连；直连真实 dev api，错误帧由面板承接）。
  await page.routeWebSocket(/stream/, (ws) => ws.connectToServer());
}

async function login(page) {
  await page.goto(`${ORIGIN}/`);
  await page.waitForSelector('input[type="password"]', { timeout: 15000 });
  await page.getByLabel("访问密码").fill(await readAppPassword());
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForTimeout(1500);
}

/** nav 几何与形态（通栏校准断言共用）。 */
async function navGeo(page) {
  return page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="移动端主导航"]');
    if (!nav) return null;
    const rect = nav.getBoundingClientRect();
    const inner = nav.firstElementChild?.getBoundingClientRect();
    const style = getComputedStyle(nav);
    const active = nav.querySelector(".text-primary");
    const icon = nav.querySelector("svg");
    const label = active?.querySelector("span.block.truncate");
    return {
      exists: true,
      width: Math.round(rect.width),
      vw: window.innerWidth,
      bottom: Math.round(rect.bottom),
      innerH: Math.round(inner?.height ?? 0),
      bg: style.backgroundColor,
      radius: style.borderRadius,
      hasBorderTop: style.borderTopWidth,
      activeText: active?.textContent ?? null,
      iconW: icon ? Math.round(icon.getBoundingClientRect().width) : null,
      labelFs: label ? getComputedStyle(label).fontSize : null,
    };
  });
}

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  locale: "zh-CN",
});
const page = await ctx.newPage();
await setupMocks(page);
await login(page);

// ── Part 1: 全局一级页（回归：nav 存在 + 通栏形态）────────────────────────────
console.log("Part 1: 全局一级页（/projects）");
await page.goto(`${ORIGIN}/projects`);
await page.waitForSelector('nav[aria-label="移动端主导航"]', { timeout: 10000 });
await page.waitForTimeout(400);
let g = await navGeo(page);
ok(g !== null, "nav 存在");
ok(g.width === g.vw, `通栏全宽（${g.width} = vw ${g.vw}）`);
ok(g.radius === "0px", `无浮岛圆角（radius ${g.radius}）`);
ok(g.hasBorderTop !== "0px", `顶部描边（border-top ${g.hasBorderTop}）`);
ok(g.iconW === 24, `图标 24px（got ${g.iconW}）`);
ok(g.labelFs === "11px", `active label 11px（got ${g.labelFs}）`);
ok((await page.locator('nav[aria-label="移动端主导航"] a').count()) === 4, "4 tab");

// ── Part 2: project scope（恒显修复核心）─────────────────────────────────────
console.log("Part 2: project scope（/projects/proj1）");
await page.goto(`${ORIGIN}/projects/proj1`);
// （原等 .chips 作 project scope 就绪标志；chips 行 2026-09-28 真机反馈整体退役，
// 就绪标志改等工作台 tab 渲染。）
await page.waitForSelector('[data-tab-id="agent_a"]', { timeout: 10000 });
await page.waitForTimeout(400);
g = await navGeo(page);
ok(g !== null, "project scope nav 存在（旧实现缺失）");
ok(g?.width === g?.vw, `通栏全宽（${g?.width} = vw ${g?.vw}）`);
ok(g?.activeText?.includes("工作台") === true, `「工作台」active（got ${g?.activeText}）`);

// ── Part 3: 聚焦态（自动聚焦 session）nav 不让位 + composer 不与 nav 重叠 ─────
console.log("Part 3: 聚焦态（?session=agent_a）");
await page.goto(`${ORIGIN}/projects/proj1?session=agent_a`);
await page.waitForTimeout(1200);
g = await navGeo(page);
ok(g !== null, "聚焦态 nav 存在（原型 03 input+tabbar 共存）");
const composerGeo = await page.evaluate(() => {
  const nav = document.querySelector('nav[aria-label="移动端主导航"]');
  const composer = document.querySelector("[data-composer-float]");
  if (!nav) return { navTop: null, cardBottom: null, pb: null };
  // composer 外层容器 bottom-0 锚定（rect.bottom 恒=面板底，padding 在盒内）；卡片 =
  // 内层 translateY div，其底边才是视觉底。
  const card = composer?.firstElementChild;
  return {
    navTop: nav.getBoundingClientRect().top,
    cardBottom: card ? card.getBoundingClientRect().bottom : null,
    pb: composer ? getComputedStyle(composer).paddingBottom : null,
  };
});
if (composerGeo.cardBottom !== null) {
  ok(
    composerGeo.cardBottom <= composerGeo.navTop + 1,
    `composer 卡片底 ${Math.round(composerGeo.cardBottom)} ≤ nav 顶 ${Math.round(composerGeo.navTop)}（--composer-gap 生效，pb ${composerGeo.pb}）`,
  );
} else {
  console.log("  · composer 未挂载（WS 未就绪错误态承接），跳过重叠断言");
}

// ── Part 4: L3 深度页 ────────────────────────────────────────────────────────
console.log("Part 4: L3 深度页（git/history）");
await page.goto(`${ORIGIN}/projects/proj1/git/history`);
await page.waitForTimeout(1000);
g = await navGeo(page);
ok(g !== null, "L3 页 nav 存在");

// ── Part 5: 设置页回归 ───────────────────────────────────────────────────────
console.log("Part 5: 设置页（/settings）");
await page.goto(`${ORIGIN}/settings`);
await page.waitForSelector('nav[aria-label="移动端主导航"]', { timeout: 10000 });
g = await navGeo(page);
ok(g !== null, "设置页 nav 存在（回归）");

await browser.close();
console.log(`\n${passCount} pass, ${failCount} fail`);
process.exit(failCount > 0 ? 1 : 0);
