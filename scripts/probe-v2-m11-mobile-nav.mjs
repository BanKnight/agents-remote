// M11 移动底部导航探针（v1.5 批 2 换代：三 Tab + tabbar 覆盖域收窄，spec 铁律 4/§3.3）。
//
// v1.5 原型规则（tabbar 仅覆盖 L1 三 Tab 页 + 设置等全局页；workspace*.html 会话现场、
// tool-git-*/wiki-reader L3 深层、workspace-session-history 均无 tabbar）对照断言
// （DOM 几何硬数据，禁截图）：
//   Part 1 全局一级页（/projects）：nav 存在 3 tab（项目/文件/插件，无工作台项）+
//     通栏几何（宽=vw、bg-elevated、无浮岛圆角/阴影）+ 图标 24px + label 11px。
//   Part 2 project scope（/projects/proj1）：nav 不存在（会话现场 = 全屏 push 层，
//     spec §3.3——旧实现此处恒显，v1.5 起摘除）。
//   Part 3 聚焦态（自动聚焦 session）：nav 不存在 + composer 卡片底贴视口底
//     （无 nav 固定 --composer-gap: 0.5rem，真机复验反馈⑥——旧公式负值贴底已修）。
//   Part 4 L3 深度页（git/history）：nav 不存在（project scope 深层无 tabbar）。
//   Part 5 设置页（/settings）：nav 存在（回归，设置属全局 tabbar 域）。
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

// ── Part 1: 全局一级页（回归：nav 存在 + 通栏形态 + 三 tab）────────────────────
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
ok((await page.locator('nav[aria-label="移动端主导航"] a').count()) === 3, "3 tab（v1.5 三 Tab）");
ok(
  (await page.locator('nav[aria-label="移动端主导航"] a').allTextContents()).every(
    (s) => !s.includes("工作台"),
  ),
  "无「工作台」项（铁律 4 退役）",
);

// ── Part 2: project scope = 会话现场，无 tab bar（v1.5 §3.3 全屏 push 层）──────
console.log("Part 2: project scope（/projects/proj1 会话现场无 nav）");
await page.goto(`${ORIGIN}/projects/proj1`);
// （原等 .chips 作 project scope 就绪标志；chips 行 2026-09-28 真机反馈整体退役，
// 就绪标志改等工作台 tab 渲染。）
await page.waitForSelector('[data-tab-id="agent_a"]', { timeout: 10000 });
await page.waitForTimeout(400);
g = await navGeo(page);
ok(g === null, "project scope 无 nav（会话现场全屏，v1.5 §3.3）");

// ── Part 3: 聚焦态 composer 贴底（无 nav 固定 --composer-gap: 0.5rem，反馈⑥）─────
console.log("Part 3: 聚焦态（?session=agent_a）composer 贴底");
await page.goto(`${ORIGIN}/projects/proj1?session=agent_a`);
await page.waitForTimeout(1200);
g = await navGeo(page);
ok(g === null, "聚焦态无 nav（会话现场全屏）");
const composerGeo = await page.evaluate(() => {
  const composer = document.querySelector("[data-composer-float]");
  if (!composer) return { cardBottom: null, pb: null, vh: window.innerHeight };
  // composer 外层容器 bottom-0 锚定（rect.bottom 恒=面板底，padding 在盒内）；卡片 =
  // 内层 translateY div，其底边才是视觉底。
  const card = composer.firstElementChild;
  return {
    cardBottom: card ? card.getBoundingClientRect().bottom : null,
    pb: getComputedStyle(composer).paddingBottom,
    vh: window.innerHeight,
  };
});
if (composerGeo.cardBottom !== null) {
  // pb 语义（frontend-notes §1 单层避让）：pb = env + gap。真机复验反馈⑥（2026-10-06）：
  // 无 nav（navH=0）时旧公式 0.25rem − env 为负 → composer 几乎贴底（≈4px）；改为固定
  // --composer-gap: 0.5rem → pb = env + 8px（Playwright 下 env=0 → 8px 纯间隙）。卡片底 =
  // 视口底 − pb（外层 bottom-0，padding 在盒内）。
  const pbNum = Number.parseFloat(composerGeo.pb) || 0;
  ok(
    Math.abs(pbNum - 8) <= 1,
    `composer pb 收敛纯间隙 8px（实际 ${composerGeo.pb}，无 nav 固定 0.5rem gap）`,
  );
  ok(
    Math.abs(composerGeo.cardBottom + pbNum - composerGeo.vh) <= 2,
    `composer 卡片底 ${Math.round(composerGeo.cardBottom)} + pb ≈ 视口底 ${composerGeo.vh}（贴底工作流）`,
  );
} else {
  console.log("  · composer 未挂载（WS 未就绪错误态承接），跳过贴底断言");
}

// ── Part 4: L3 深度页（project scope 深层，无 tabbar）────────────────────────
console.log("Part 4: L3 深度页（git/history）");
await page.goto(`${ORIGIN}/projects/proj1/git/history`);
await page.waitForTimeout(1000);
g = await navGeo(page);
ok(g === null, "L3 页无 nav（project scope 深层 push 无 tabbar）");

// ── Part 5: 设置页回归 ───────────────────────────────────────────────────────
console.log("Part 5: 设置页（/settings）");
await page.goto(`${ORIGIN}/settings`);
await page.waitForSelector('nav[aria-label="移动端主导航"]', { timeout: 10000 });
g = await navGeo(page);
ok(g !== null, "设置页 nav 存在（回归）");

await browser.close();
console.log(`\n${passCount} pass, ${failCount} fail`);
process.exit(failCount > 0 ? 1 : 0);
