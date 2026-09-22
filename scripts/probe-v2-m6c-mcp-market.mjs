// M6-c MCP 官方市场探针（v2 M6-c：09 市场段两条 mrow / 17 市场页双 tab / MCP 审计 sheet）。
//
// 覆盖单测验不到的真实浏览器行为（DOM 几何硬数据，禁截图）：
//   Part 1 09 市场段两条 mrow →「MCP 市场」落 ?marketTab=mcp + tabseg 选中态。
//   Part 2 MCP 段列表：npm/remote/pypi/已装四卡字段 + 诚实硬断言（无「认证/安装量/工具数/%」，
//     registry 无这些字段，§6.12g）+ pypi 禁装态 + 已装 ✓ 态 + tabseg/mcard 几何（滚动容器层）。
//   Part 3 npm 条目审计 sheet：env password 行 + 作用域 stabseg（无记忆项目 → 本项目 disabled）+
//     提交 payload 精确断言（npx -y + env）→ 成功关 sheet → 卡转 ✓。
//   Part 4 remote 条目审计 sheet：传输/URL 只读行 + headers password 行 + payload headers 断言。
//   Part 5 registry 不可达：502 → 错误行（text-error）页面不崩 → 恢复正常查询。
//   Part 6 tab 切换：切技能段（URL 写回 + skills.sh chip + ⚙ 入口）→ 切回 MCP 段搜索词不保留。
//   Part 7 直开 /plugins/market 无参 → 缺省 skill 段。
//
// 全 mock API（registry 为浏览器外调用，UI 只见自家 /api/mcp/search 翻译后形态；翻译逻辑由
// api/src/mcp-market.test.ts 覆盖）。密码自读不进 agent 上下文、不打印值。
// 用法：bun scripts/probe-v2-m6c-mcp-market.mjs

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

// 翻译后 McpMarketEntry 形态（shared 契约；registry 原始响应的翻译在 API 层，单测覆盖）。
const MCP_MARKET = [
  {
    registryName: "io.github.example/npm-server",
    name: "npm-server",
    title: "NPM Server",
    description: "npm 包形态条目",
    version: "1.2.0",
    repositorySource: "github",
    remote: null,
    package: {
      registryType: "npm",
      identifier: "npm-server-pkg",
      version: "1.2.0",
      requiredEnv: [{ name: "API_TOKEN", isSecret: true }],
    },
  },
  {
    registryName: "io.github.example/remote-server",
    name: "remote-server",
    description: "远程直连条目",
    version: "2.0.0",
    repositorySource: "gitlab",
    remote: {
      transport: "http",
      url: "https://mcp.example.com/mcp",
      requiredHeaders: [{ name: "Authorization", isSecret: true }],
    },
    package: null,
  },
  {
    registryName: "io.github.example/pypi-server",
    name: "pypi-server",
    description: "pypi 包暂不支持一键安装",
    version: "0.9.0",
    repositorySource: "github",
    remote: null,
    // pypi/oci/mcpb 翻译层不产出 package（api/src/mcp-market.ts），到 UI 即双无禁装态。
    package: null,
  },
  {
    registryName: "io.github.example/installed-server",
    name: "installed-server",
    description: "已装条目",
    version: "3.0.0",
    repositorySource: null,
    remote: { transport: "sse", url: "https://s.example/sse", requiredHeaders: [] },
    package: null,
  },
];

const MCP_SERVERS = [{ name: "installed-server", type: "sse", url: "https://s.example/sse" }];

const INSTALLED_SKILLS = [
  {
    name: "code-review",
    path: "/home/deploy/.claude/skills/code-review",
    scope: "global",
    agents: ["claude-code"],
  },
];

const SKILL_SOURCES = [];

// 请求记录（payload 断言用）。
const mcpAddPosts = [];

async function setupM6cMocks(page) {
  await page.route("**/api/projects", (r) => {
    if (r.request().method() === "GET") {
      return r.fulfill(json([{ name: "proj1", path: "/srv/projects/proj1" }]));
    }
    return r.fulfill(json({ ok: true }));
  });
  await page.route("**/api/mcp", (r) => r.fulfill(json({ servers: MCP_SERVERS })));
  await page.route("**/api/mcp/add", (r) => {
    mcpAddPosts.push(JSON.parse(r.request().postData() ?? "{}"));
    const body = mcpAddPosts[mcpAddPosts.length - 1];
    MCP_SERVERS.push({ name: body.name, type: body.type });
    return r.fulfill(json({ ok: true }));
  });
  await page.route("**/api/mcp/search*", (r) => {
    const q = new URL(r.request().url()).searchParams.get("q") ?? "";
    if (q.includes("boom")) {
      return r.fulfill({
        status: 502,
        contentType: "application/json",
        body: '{"error":"upstream"}',
      });
    }
    return r.fulfill(json({ query: q, servers: MCP_MARKET, count: MCP_MARKET.length }));
  });
  await page.route("**/api/skills/installed*", (r) =>
    r.fulfill(json({ skills: INSTALLED_SKILLS })),
  );
  await page.route("**/api/skills/updates*", (r) => r.fulfill(json({ updates: [] })));
  await page.route("**/api/skills/search*", (r) =>
    r.fulfill(json({ query: "", skills: [], count: 0 })),
  );
  await page.route("**/api/skills/sources", (r) => r.fulfill(json({ sources: SKILL_SOURCES })));
  // session 面板 WS（shell 登录后可能连接）。
  await page.routeWebSocket(/stream/, (ws) => ws.connectToServer());
}

async function login(page) {
  await page.goto(`${ORIGIN}/`);
  await page.waitForSelector('input[type="password"]', { timeout: 15000 });
  await page.getByLabel("访问密码").fill(await readAppPassword());
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForTimeout(1500);
}

// ── 验证主体 ─────────────────────────────────────────────────────────────────
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  locale: "zh-CN",
});
const page = await ctx.newPage();
await setupM6cMocks(page);
await login(page);

// ── Part 1: 09 市场段两条 mrow → MCP 市场 ───────────────────────────────────
console.log("Part 1: 09 市场段两条 mrow →「MCP 市场」落 ?marketTab=mcp");
await page.goto(`${ORIGIN}/plugins`);
await page.waitForSelector(".mrow", { timeout: 10000 });
ok((await page.locator(".mrow").count()) === 2, "市场段 mrow = 2");
await page.locator(".mrow", { hasText: "MCP 市场" }).click();
await page.waitForTimeout(600);
ok(page.url().endsWith("/plugins/market?marketTab=mcp"), "URL /plugins/market?marketTab=mcp");
const mcpSeg = page.locator(".tabseg button").first();
ok(
  (await mcpSeg.getAttribute("aria-selected")) === "true" &&
    (await mcpSeg.getAttribute("class"))?.includes("on") === true,
  "tabseg「MCP 服务器」段选中（aria-selected + .on）",
);
ok(
  (await page.locator(".tabseg button").nth(1).getAttribute("aria-selected")) === "false",
  "「技能」段未选中",
);
ok(
  (await page.locator("header h1").textContent())?.includes("MCP 市场") === true,
  "nav 标题「MCP 市场」",
);
ok(
  (await page.locator(".mchips .chip2.on").textContent())?.includes("官方 Registry") === true,
  "单源 chip「✓ 官方 Registry」恒 on",
);
ok(
  (await page.locator("header button[aria-label]").count()) === 0,
  "MCP 段无管理源入口（⚙ 仅技能段）",
);
// 未搜索 → hint 态（emptyMarket）。
ok((await page.locator(".mcard").count()) === 0, "未搜索不渲染 mcard（hint 态）");

// ── Part 2: 列表四卡 + 诚实硬断言 + 禁装/已装态 + 几何 ──────────────────────
console.log("Part 2: MCP 段列表（四卡字段 + 诚实硬断言 + 几何）");
await page.locator('input[aria-label="搜索 MCP 服务器"]').fill("server");
await page.waitForSelector(".mcard", { timeout: 5000 });
ok(
  (await page.locator(".mcard").count()) === 4,
  `mcard = 4（实际 ${await page.locator(".mcard").count()}）`,
);
const npmCard = page.locator(".mcard", { hasText: "npm-server" });
ok(
  (await npmCard.locator(".r1").textContent())?.includes("github") === true,
  "npm 卡 .src 来源章（repositorySource）",
);
ok(
  (await npmCard.locator(".d2").textContent())?.includes("v1.2.0") === true,
  "npm 卡副行含 v1.2.0",
);
// 诚实硬断言：registry 无认证/工具数/安装量/百分比字段（§6.12g）。
const bodyText = (await page.locator("body").textContent()) ?? "";
ok(bodyText.includes("认证") === false, "body 不含「认证」徽标（registry 无字段）");
ok(bodyText.includes("安装量") === false, "body 不含「安装量」（registry 无字段）");
ok(bodyText.includes("工具") === false, "body 不含「工具数」（registry 无字段）");
ok(bodyText.includes("%") === false, "body 不含百分比（同步 POST 无进度流）");
// 已装态（user scope 名单匹配）。
const instCard = page.locator(".mcard", { hasText: "installed-server" });
ok((await instCard.locator(".installed").count()) === 1, "已装卡 ✓ 态");
// pypi 禁装态：disabled 钮 + 手动配置说明行。
const pypiCard = page.locator(".mcard", { hasText: "pypi-server" });
ok((await pypiCard.locator("button.btn2").isDisabled()) === true, "pypi 卡安装钮 disabled");
ok((await pypiCard.textContent())?.includes("手动添加") === true, "pypi 卡手动配置说明行");
// 几何：tabseg 高 34（原型 17 数值）+ mcard 无横向溢出（滚动容器层量）。
const segBox = await page.locator(".tabseg").boundingBox();
ok(segBox !== null && Math.abs(segBox.height - 34) <= 1, `tabseg 高 ≈34（实际 ${segBox?.height}）`);
ok((await page.locator(".tabseg button").count()) === 2, "tabseg = 2 段");
const geo = await page.evaluate(() => {
  const card = document.querySelector(".mcard");
  let node = card?.parentElement ?? null;
  while (node && !node.className.includes("overflow-y-auto")) node = node.parentElement;
  if (!node) return null;
  return { scrollW: node.scrollWidth, clientW: node.clientWidth };
});
ok(
  geo !== null && geo.scrollW <= geo.clientW + 1,
  `列表滚动容器无横向溢出（scroll ${geo?.scrollW} ≤ client ${geo?.clientW}）`,
);

// ── Part 3: npm 条目审计 sheet → payload → 成功转 ✓ ─────────────────────────
console.log("Part 3: npm 条目审计 sheet（env password 行 + payload）");
await npmCard.locator("button.btn2").click();
await page.waitForSelector(".msheet", { timeout: 5000 });
const sheetText = (await page.locator(".msheet").textContent()) ?? "";
ok(sheetText.includes("npm-server") && sheetText.includes("v1.2.0"), "sheet 条目行（名 + v 章）");
ok(sheetText.includes("npx -y npm-server-pkg"), "目标只读行（npx 命令）");
ok(
  (await page.locator('.msheet input[type="password"]').count()) === 1,
  "必填 env isSecret → password 行恰 1",
);
ok(
  (await page.locator('.msheet input[aria-label="环境变量 API_TOKEN"]').count()) === 1,
  "env 行 aria-label「环境变量 API_TOKEN」",
);
// 无记忆项目 → 本项目段 disabled；主钮未完整时 disabled。
const segBtns = page.locator(".msheet .stabseg button");
ok((await segBtns.count()) === 2, "作用域 stabseg = 2 段");
ok((await segBtns.nth(1).isDisabled()) === true, "无记忆项目 → 本项目段 disabled");
ok((await page.locator(".msheet .kbtns .p").isDisabled()) === true, "必填未填 → 主钮 disabled");
await page.locator('.msheet input[aria-label="环境变量 API_TOKEN"]').fill("tok-123");
ok((await page.locator(".msheet .kbtns .p").isDisabled()) === false, "必填齐全 → 主钮可提交");
await page.locator(".msheet .kbtns .p").click();
await page.waitForTimeout(800);
ok(mcpAddPosts.length === 1, `POST /api/mcp/add 恰 1 次（实际 ${mcpAddPosts.length}）`);
if (mcpAddPosts.length === 1) {
  const body = mcpAddPosts[0];
  ok(body.name === "npm-server" && body.type === "stdio", "payload name/type 正确");
  ok(
    body.command === "npx" && JSON.stringify(body.args) === '["-y","npm-server-pkg"]',
    "payload command/args（npx -y identifier）",
  );
  ok(JSON.stringify(body.env) === '{"API_TOKEN":"tok-123"}', "payload env 只并入实填键");
  ok(body.headers === undefined, "stdio 条目不带 headers");
}
ok((await page.locator(".msheet").count()) === 0, "成功后 sheet 关闭");
await page.waitForTimeout(600);
ok((await npmCard.locator(".installed").count()) === 1, "invalidate 后卡转 ✓ 已装");

// ── Part 4: remote 条目审计 sheet（headers 进 payload）─────────────────────
console.log("Part 4: remote 条目审计 sheet（http + headers）");
const remoteCard = page.locator(".mcard", { hasText: "remote-server" });
await remoteCard.locator("button.btn2").click();
await page.waitForSelector(".msheet", { timeout: 5000 });
const remoteSheet = (await page.locator(".msheet").textContent()) ?? "";
ok(
  remoteSheet.includes("http") && remoteSheet.includes("https://mcp.example.com/mcp"),
  "只读行：传输 + URL",
);
ok(
  (await page.locator('.msheet input[aria-label="请求头 Authorization"]').count()) === 1,
  "headers 行 aria-label「请求头 Authorization」",
);
await page.locator('.msheet input[aria-label="请求头 Authorization"]').fill("Bearer sk-xyz");
await page.locator(".msheet .kbtns .p").click();
await page.waitForTimeout(800);
ok(mcpAddPosts.length === 2, `POST 累计 2 次（实际 ${mcpAddPosts.length}）`);
if (mcpAddPosts.length === 2) {
  const body = mcpAddPosts[1];
  ok(
    body.name === "remote-server" &&
      body.type === "http" &&
      body.url === "https://mcp.example.com/mcp",
    "payload name/type/url 正确",
  );
  ok(
    JSON.stringify(body.headers) === '{"Authorization":"Bearer sk-xyz"}',
    "payload headers（-H 消费）",
  );
  ok(body.command === undefined && body.env === undefined, "remote 条目无 stdio 字段");
}
ok((await page.locator(".msheet").count()) === 0, "成功后 sheet 关闭");

// ── Part 5: registry 不可达 → 错误行不崩 → 恢复 ─────────────────────────────
console.log("Part 5: registry 不可达错误态");
await page.locator('input[aria-label="搜索 MCP 服务器"]').fill("boom");
await page.waitForSelector(".text-error", { timeout: 5000 });
ok((await page.locator("header h1").count()) === 1, "错误态页面不崩（nav 标题仍在）");
ok(
  ((await page.locator(".text-error").textContent()) ?? "").length > 0,
  "错误行有文案（api.mcpMarketFetchFailed）",
);
await page.locator('input[aria-label="搜索 MCP 服务器"]').fill("server");
await page.waitForSelector(".mcard", { timeout: 5000 });
ok((await page.locator(".mcard").count()) >= 1, "恢复正常查询（错误行消失）");

// ── Part 6: tab 切换（URL 写回 + 技能段回归 + 搜索词不保留）─────────────────
console.log("Part 6: tab 切换与状态隔离");
await page.locator(".tabseg button", { hasText: "技能" }).click();
await page.waitForTimeout(600);
ok(page.url().endsWith("/plugins/market?marketTab=skill"), "切技能段 URL 写回 ?marketTab=skill");
ok(
  (await page.locator(".mchips .chip2.on").textContent())?.includes("skills.sh") === true,
  "技能段 skills.sh chip",
);
ok(
  (await page.locator('header button[aria-label*="源"]').count()) === 1,
  "技能段 ⚙ 管理源入口可见",
);
await page.locator(".tabseg button", { hasText: "MCP 服务器" }).click();
await page.waitForTimeout(600);
ok(
  (await page.locator('input[aria-label="搜索 MCP 服务器"]').inputValue()) === "",
  "tab 切换卸载另一 tab → 搜索词不保留",
);
ok((await page.locator(".mcard").count()) === 0, "切回后回 hint 态");

// ── Part 7: 直开 /plugins/market 无参 → 缺省 skill 段 ───────────────────────
console.log("Part 7: 直开无参缺省 skill 段");
await page.goto(`${ORIGIN}/plugins/market`);
await page.waitForTimeout(600);
ok(
  (await page.locator(".tabseg button").nth(1).getAttribute("class"))?.includes("on") === true,
  "缺省「技能」段 on",
);
ok(
  (await page.locator(".mchips .chip2.on").textContent())?.includes("skills.sh") === true,
  "缺省渲染技能段主体",
);

// ── 汇总 ───────────────────────────────────────────────────────────────────
console.log(`\n${passCount} pass, ${failCount} fail`);
await browser.close();
process.exit(failCount > 0 ? 1 : 0);
