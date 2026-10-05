// v1.5 批 2 IA 探针：三 Tab + 恢复现场跳板（spec 铁律 4/§3.3/§3.1，DOM/URL 硬数据禁截图）。
//
// 断言域：
//   Part 1 L1 三 Tab（/projects）：nav 3 link（项目/文件/插件）+ 无「工作台」项 +
//     「项目」active + 图标 24px。
//   Part 2 project scope 浏览态：nav 不存在（会话现场全屏）+ 写入链①——浏览态 autoFocus
//     聚焦实例后 localStorage `workbench.lastSession` = {k,id}（恢复现场记忆）。
//   Part 3 URL 聚焦写入链②：/projects/$k/session/$id 直达聚焦后记忆值与 URL 一致。
//   Part 4 `/` 跳板三级（router beforeLoad）：
//     ① lastSession 有值 → /projects/$k/session/$id（恢复现场直达）；
//     ② 仅 lastProjectKey → /projects/$key（次级兜底，D4 遗产）；
//     ③ 全无 → /projects（冷启动从项目开始）。
//   Part 5 恢复现场全链：种 lastSession → goto `/` → 直达会话现场（URL + tab 渲染 + 无 nav）。
//
// 全 mock API（无真实数据创建/删除）；密码自读不进 agent 上下文、不打印值。
// 用法：bun scripts/probe-v15-batch2-nav.mjs

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

async function navExists(page) {
  return page.evaluate(() => document.querySelector('nav[aria-label="移动端主导航"]') !== null);
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

// ── Part 1: L1 三 Tab ────────────────────────────────────────────────────────
console.log("Part 1: L1 三 Tab（/projects）");
await page.goto(`${ORIGIN}/projects`);
await page.waitForSelector('nav[aria-label="移动端主导航"]', { timeout: 10000 });
await page.waitForTimeout(400);
const navLinks = page.locator('nav[aria-label="移动端主导航"] a');
ok((await navLinks.count()) === 3, `3 link（实际 ${await navLinks.count()}）`);
const labels = (await navLinks.allTextContents()).map((s) => s.trim());
ok(labels.join(",") === "项目,文件,插件", `Tab 文案 = ${labels.join(",")}（项目/文件/插件）`);
ok(
  (await page
    .locator('nav[aria-label="移动端主导航"] a')
    .filter({ hasText: "项目" })
    .locator(".text-primary")
    .count()) > 0,
  "「项目」active（.text-primary）",
);
const iconW = await page.evaluate(() => {
  const icon = document.querySelector('nav[aria-label="移动端主导航"] svg');
  return icon ? Math.round(icon.getBoundingClientRect().width) : null;
});
ok(iconW === 24, `图标 24px（实际 ${iconW}）`);

// ── Part 2: project scope 浏览态：无 nav + 写入链①（autoFocus → lastSession）────
console.log("Part 2: project scope 浏览态（/projects/proj1）");
await page.goto(`${ORIGIN}/projects/proj1`);
await page.waitForSelector('[data-tab-id="agent_a"]', { timeout: 10000 });
await page.waitForTimeout(400);
ok((await navExists(page)) === false, "浏览态无 nav（会话现场全屏，v1.5 §3.3）");
// 写入链①：浏览态 autoFocus 聚焦 agent_a → 恢复记忆写入（WorkbenchContent URL 聚焦互斥补写）。
const last1 = await page.evaluate(() => localStorage.getItem("workbench.lastSession"));
ok(last1 !== null, `lastSession 已写入（浏览态 autoFocus 链，值 ${last1}）`);
const last1Parsed = last1 ? JSON.parse(last1) : null;
ok(
  last1Parsed?.k === "proj1" && last1Parsed?.id === "agent_a",
  `记忆值 = {k:proj1, id:agent_a}（实际 ${JSON.stringify(last1Parsed)}）`,
);

// ── Part 2.5: skill focus 不写恢复记忆（isSessionFocusId 守门，两侧写入点同源）─────
// 回归防护：autoFocusId 可能是 skill tab id（layout activeTab 属本项目 skill），若写入
// 不守门会把 skill_${name} 存成 lastSession → `/` 跳到无效会话 URL。URL skill focus 与
// autoFocus 走同一 isSessionFocusId 判定，此处以 URL focus 路径验证守门集成面。
console.log("Part 2.5: skill focus 守门（/projects/proj1/skill/tdd）");
await page.evaluate(() =>
  localStorage.setItem("workbench.lastSession", JSON.stringify({ k: "proj1", id: "agent_a" })),
);
await page.goto(`${ORIGIN}/projects/proj1/skill/tdd`);
await page.waitForTimeout(800);
const lastSkill = await page.evaluate(() => localStorage.getItem("workbench.lastSession"));
const lastSkillParsed = lastSkill ? JSON.parse(lastSkill) : null;
ok(
  !String(lastSkillParsed?.id ?? "").startsWith("skill_"),
  `skill focus 不写恢复记忆（守门生效，值 ${JSON.stringify(lastSkillParsed)}）`,
);

// ── Part 3: URL 聚焦写入链② ─────────────────────────────────────────────────
console.log("Part 3: URL 聚焦写入链（/projects/proj1/session/agent_a）");
await page.goto(`${ORIGIN}/projects/proj1/session/agent_a`);
await page.waitForSelector('[data-tab-id="agent_a"]', { timeout: 10000 });
await page.waitForTimeout(600);
const last2 = await page.evaluate(() => localStorage.getItem("workbench.lastSession"));
const last2Parsed = last2 ? JSON.parse(last2) : null;
ok(
  last2Parsed?.k === "proj1" && last2Parsed?.id === "agent_a",
  `URL 聚焦后记忆一致（实际 ${JSON.stringify(last2Parsed)}）`,
);

// ── Part 4: `/` 跳板三级 ────────────────────────────────────────────────────
console.log("Part 4: `/` 跳板三级");
// ① lastSession 有值 → 直达上次会话。
await page.evaluate(() => {
  localStorage.setItem("workbench.lastSession", JSON.stringify({ k: "proj1", id: "agent_a" }));
});
await page.goto(`${ORIGIN}/`);
await page.waitForTimeout(1200);
ok(
  new URL(page.url()).pathname === "/projects/proj1/session/agent_a",
  `① lastSession → /projects/proj1/session/agent_a（实际 ${new URL(page.url()).pathname}）`,
);
// ② 仅 lastProjectKey → 上次项目（次级兜底）。
await page.evaluate(() => {
  localStorage.removeItem("workbench.lastSession");
  localStorage.setItem("workbench.lastProjectKey", JSON.stringify("proj1"));
});
await page.goto(`${ORIGIN}/`);
await page.waitForTimeout(1200);
ok(
  new URL(page.url()).pathname === "/projects/proj1",
  `② 仅 lastProjectKey → /projects/proj1（实际 ${new URL(page.url()).pathname}）`,
);
// ③ 全无 → /projects（冷启动）。
await page.evaluate(() => {
  localStorage.removeItem("workbench.lastSession");
  localStorage.removeItem("workbench.lastProjectKey");
});
await page.goto(`${ORIGIN}/`);
await page.waitForTimeout(1200);
ok(
  new URL(page.url()).pathname === "/projects",
  `③ 全无 → /projects（实际 ${new URL(page.url()).pathname}）`,
);

// ── Part 5: 恢复现场全链 ────────────────────────────────────────────────────
console.log("Part 5: 恢复现场全链（种记忆 → `/` 直达）");
await page.evaluate(() => {
  localStorage.setItem("workbench.lastSession", JSON.stringify({ k: "proj1", id: "agent_a" }));
});
await page.goto(`${ORIGIN}/`);
await page.waitForSelector('[data-tab-id="agent_a"]', { timeout: 15000 });
await page.waitForTimeout(400);
ok(
  new URL(page.url()).pathname === "/projects/proj1/session/agent_a",
  `直达 URL（实际 ${new URL(page.url()).pathname}）`,
);
ok((await navExists(page)) === false, "直达现场无 nav（全屏会话现场）");

await browser.close();
console.log(`\n${passCount} pass, ${failCount} fail`);
process.exit(failCount > 0 ? 1 : 0);
