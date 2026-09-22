// M6 插件与市场探针（v2 M6：09 主页 / 12 技能详情 / 13 MCP 详情 / 14 添加 sheet / 15 源管理 /
// 18 市场 + 16 审计 sheet）。
//
// 覆盖单测验不到的真实浏览器行为（DOM 几何硬数据，禁截图）：
//   Part 1 09 主页：h1 大标题 + .segc 作用域分段 + pcard 两组 + 市场段 + 搜索过滤 +
//     「本项目」空态引导（从未选项目）。
//   Part 2 12 技能详情：技能卡点入 → dtitle/dmeta/ddesc/SKILL.md 段 + rm 钮；卸载确认 sheet
//     （kbtns p solid danger）取消路径。
//   Part 3 13 MCP 详情：MCP 卡点入 → cfg 键值行 + env 脱敏（页面不含 env 真值——安全断言）+
//     注入范围 + rm。
//   Part 4 14 添加 sheet：＋ → stabseg 三段切换字段（stdio→SSE）→ stdio 提交 payload 断言
//     （env 多行解析 POST /api/mcp/add）。
//   Part 5 18 市场 + 16 审计：搜索 → mcard → 安装 → 审计 sheet（作用域行 + 实底确认）→
//     确认 → POST payload + done 帧后「✓ Installed」。
//   Part 6 15 源管理：scard 三态（builtin/official/自定义+移除钮）+ addsrc 展开。
//
// 全 mock API（无真实数据创建/删除）；密码自读不进 agent 上下文、不打印值。
// 用法：bun scripts/probe-v2-m6-plugins.mjs

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

const MCP_SERVERS = [
  {
    name: "context7",
    type: "stdio",
    command: "npx",
    args: ["-y", "context7-mcp"],
  },
  {
    name: "sentry",
    type: "stdio",
    command: "npx",
    args: ["-y", "sentry-mcp"],
    env: { SENTRY_TOKEN: "secret-value-123" },
  },
];

const INSTALLED_SKILLS = [
  {
    name: "code-review",
    path: "/home/deploy/.claude/skills/code-review",
    scope: "global",
    agents: ["claude-code"],
  },
  {
    name: "tdd",
    path: "/home/deploy/.claude/skills/tdd",
    scope: "global",
    agents: ["claude-code"],
  },
];

const MARKET_SKILLS = [
  {
    id: "anthropics/skills/docs-writer",
    skillId: "docs-writer",
    name: "docs-writer",
    installs: 1234,
    source: "anthropics/skills",
  },
];

const SKILL_SOURCES = [
  { id: "src-1", type: "github", repo: "acme/skills", branch: "main", label: "Acme" },
];

// 请求记录（payload 断言用）。
const mcpAddPosts = [];
const skillInstallPosts = [];

async function setupM6Mocks(page) {
  await page.route("**/api/projects", (r) => {
    if (r.request().method() === "GET") {
      return r.fulfill(json([{ name: "proj1", path: "/srv/projects/proj1" }]));
    }
    return r.fulfill(json({ ok: true }));
  });
  await page.route("**/api/mcp", (r) => r.fulfill(json({ servers: MCP_SERVERS })));
  await page.route("**/api/mcp/add", (r) => {
    mcpAddPosts.push(JSON.parse(r.request().postData() ?? "{}"));
    return r.fulfill(json({ ok: true }));
  });
  await page.route("**/api/mcp/remove", (r) => r.fulfill(json({ ok: true })));
  await page.route("**/api/skills/installed*", (r) =>
    r.fulfill(json({ skills: INSTALLED_SKILLS })),
  );
  await page.route("**/api/skills/preview*", (r) =>
    r.fulfill(
      json({
        name: "code-review",
        description: "提交前自动审查代码变更：风格、潜在缺陷、测试覆盖建议。",
        content:
          "---\nname: code-review\ndescription: 提交前自动审查代码变更\nlicense: MIT\n---\n\n# Code Review\n\n正文内容段落。\n\n参考文档：https://example.com/docs/very-long-path/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/cccccccccccccccccccccccccccccccc/dddddddddddddddddddddddddddddddd/eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee。",
        source: "anthropics/skills",
      }),
    ),
  );
  await page.route("**/api/skills/updates*", (r) =>
    r.fulfill(json({ updates: [{ name: "code-review", hasUpdate: true, manageable: true }] })),
  );
  await page.route("**/api/skills/search*", (r) =>
    r.fulfill(json({ query: "docs", skills: MARKET_SKILLS, count: MARKET_SKILLS.length })),
  );
  await page.route("**/api/skills/sources", (r) => r.fulfill(json({ sources: SKILL_SOURCES })));
  await page.route("**/api/skills/uninstall", (r) => r.fulfill(json({ ok: true })));
  await page.route("**/api/skills/install", (r) => {
    skillInstallPosts.push(JSON.parse(r.request().postData() ?? "{}"));
    // done 后已装列表应含 docs-writer（✓ Installed 态断言依赖）。
    INSTALLED_SKILLS.push({
      name: "docs-writer",
      path: "/home/deploy/.claude/skills/docs-writer",
      scope: "global",
      agents: ["claude-code"],
    });
    return r.fulfill(json({ taskId: "task-m6", status: "running" }));
  });
  // SSE 任务帧：fulfill 一次响应含 done 帧（EventSource onmessage 解析后 waitForSkillTask resolve）。
  await page.route("**/api/skills/task/*/events", (r) =>
    r.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: `data: ${JSON.stringify({
        taskId: "task-m6",
        status: "done",
        kind: "install",
        skill: INSTALLED_SKILLS[0],
      })}\n\n`,
    }),
  );
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
await setupM6Mocks(page);
await login(page);

// ── Part 1: 09 主页 ─────────────────────────────────────────────────────────
console.log("Part 1: 09 插件主页（大标题 + 作用域分段 + 两组卡 + 市场段）");
await page.goto(`${ORIGIN}/plugins`);
await page.waitForSelector(".segc", { timeout: 10000 });
ok(
  (await page.getByRole("heading", { level: 1, name: "插件" }).textContent()) === "插件",
  "h1 大标题「插件」",
);
ok((await page.locator(".segc button").count()) === 2, "segc 作用域分段 = 2 段");
ok(
  (await page.locator(".segc button.on").textContent())?.includes("全局") === true,
  "默认作用域「全局」on",
);
await page.waitForSelector(".pcard", { timeout: 5000 });
ok((await page.locator(".pcard").count()) === 4, "pcard = 4（MCP 2 + 技能 2）");
ok(
  (await page.locator(".psect").first().textContent())?.includes("MCP 服务器 · 2") === true,
  "MCP 组标题含计数",
);
ok((await page.locator(".mrow").count()) === 2, "市场段 mrow = 2（MCP 市场 + 技能市场）");
ok((await page.locator(".mrow", { hasText: "MCP 市场" }).count()) === 1, "市场段 mrow「MCP 市场」");
ok((await page.locator(".mrow", { hasText: "技能市场" }).count()) === 1, "市场段 mrow「技能市场」");
// 搜索本地过滤：命中 tdd（1 张技能卡）+ MCP 全滤掉。
await page.getByRole("searchbox").first().fill("tdd");
await page.waitForTimeout(300);
ok((await page.locator(".pcard").count()) === 1, "搜索「tdd」后 pcard = 1");
await page.getByRole("searchbox").first().fill("");
await page.waitForTimeout(300);
// 「本项目」段：从未选项目 → 空态引导（编号⑥）。
await page.locator(".segc button").nth(1).click();
await page.waitForTimeout(300);
ok(
  (await page.getByText("去工作台选择项目").count()) === 1,
  "「本项目」空态引导（去工作台选择项目）",
);
await page.locator(".segc button").first().click();
await page.waitForTimeout(300);
// 手动「检查更新」→ hasUpdate chip（updates mock 返回 code-review hasUpdate:true）。
await page.locator(".psect button.r", { hasText: "检查更新" }).click();
await page.waitForTimeout(600);
ok(
  (await page.locator(".pcard .upd").count()) === 1,
  "手动检查更新后「有更新」chip 恰 1（code-review）",
);

// ── Part 2: 12 技能详情 + 卸载确认 ──────────────────────────────────────────
console.log("Part 2: 12 技能详情（dtitle/dmeta/SKILL.md + 卸载确认 sheet）");
await page.locator(".pcard", { hasText: "code-review" }).click();
await page.waitForSelector(".dtitle", { timeout: 5000 });
ok(page.url().includes("/plugins/skill/code-review"), `URL /plugins/skill/code-review`);
ok(
  (await page.locator(".dtitle").textContent())?.includes("code-review") === false,
  "dtitle 不含技能名（第七轮去重：name 归 nav h1 单点）",
);
ok((await page.locator(".dchip.up").count()) === 1, "「有更新」dchip 恰 1（检测缓存同源）");
// SKILL.md 正文段 FrontmatterCard：name/description 已排除（与 nav/ddesc 重复），license 保留。
const fmCard = (await page.locator("dl").textContent()) ?? "";
ok(fmCard.includes("license") && fmCard.includes("MIT"), "metadata 卡保留非重复键（license: MIT）");
ok(
  fmCard.includes("code-review") === false && fmCard.includes("提交前自动审查") === false,
  "metadata 卡不含 name/description（排除硬断言）",
);
ok(
  (await page.locator(".dmeta").textContent())?.includes("anthropics/skills") === true,
  "dmeta 含来源（preview.source）",
);
ok(
  (await page.locator(".ddesc").textContent())?.includes("提交前自动审查") === true,
  "ddesc = frontmatter description",
);
ok((await page.locator(".dsect", { hasText: "SKILL.md" }).count()) === 1, "SKILL.md 正文段标题");
ok((await page.locator(".cta").count()) === 1, "更新 CTA（hasUpdate 驱动）");
ok(
  (await page.locator("body").textContent())?.includes("secret-value-123") === false,
  "技能详情页不泄露 env 真值（安全基线）",
);
// 第九轮：正文超长 URL 不撑破容器（MARKDOWN_CLASS overflow-wrap:anywhere 断词）。
// 量滚动容器层不只 doc——§6.12e 教训（内层溢出 doc 层测不到）。
const mdOverflow = await page.evaluate(() => {
  const wide = [...document.querySelectorAll(".overflow-y-auto, .overflow-x-auto")].filter(
    (el) => el.scrollWidth > el.clientWidth + 1,
  );
  return {
    docSw: document.documentElement.scrollWidth,
    vw: window.innerWidth,
    wideCount: wide.length,
  };
});
ok(
  mdOverflow.docSw <= mdOverflow.vw && mdOverflow.wideCount === 0,
  `正文超长 URL 无横向溢出（doc ${mdOverflow.docSw} ≤ vw ${mdOverflow.vw}，宽滚动容器 ${mdOverflow.wideCount}）`,
);
// 卸载确认 Alert（spec §5：删除类确认走 useConfirm 的 Dialog，非 sheet；移动形态 = iOS action sheet）。
await page.locator(".rm").click();
await page.waitForSelector('[data-slot="dialog-content"]', { timeout: 5000 });
ok(
  (await page.locator('[data-slot="dialog-content"] h2').textContent())?.includes("卸载技能") ===
    true,
  "卸载确认 Alert 标题",
);
const alertConfirm = page
  .locator('[data-slot="dialog-content"] button', { hasText: "卸载" })
  .first();
ok(
  (await alertConfirm.getAttribute("class"))?.includes("text-error") === true,
  "Alert 确认钮红字（action sheet destructive）",
);
ok(
  (await page.locator(".rmnote").textContent())?.includes("重载") === true,
  "rmnote = uninstallNote（含「重载」，非 Alert 同文案）",
);
ok(
  (await page.locator(".rmnote").textContent())?.includes("卸载将删除") === false,
  "rmnote ≠ 卸载确认 Alert 文案（第七轮去重）",
);
const rmBox = await page.locator(".rm").boundingBox();
const dangerBox = await alertConfirm.boundingBox();
ok(
  dangerBox !== null && rmBox !== null && dangerBox.height >= 44 && dangerBox.width >= 200,
  "Alert 确认钮几何（全宽 ≥200×44）",
);
await page.locator('[data-slot="dialog-content"] button', { hasText: "取消" }).click();
await page.waitForTimeout(700);
ok((await page.locator('[data-slot="dialog-content"]').count()) === 0, "取消后 Alert 关闭");
// 返回 09（.back 设计语言：‹ + 可见返回文字）。
ok(
  (await page.locator("header .back").textContent())?.includes("已安装技能") === true,
  ".back 返回文字 = 已安装技能",
);
await page.locator("header .back").first().click();
await page.waitForTimeout(500);
ok(page.url().endsWith("/plugins"), "‹ 返回 /plugins");

// ── Part 3: 13 MCP 详情（env 脱敏） ────────────────────────────────────────
console.log("Part 3: 13 MCP 详情（cfg 键值 + env 脱敏 + 注入范围）");
await page.locator(".pcard", { hasText: "sentry" }).click();
await page.waitForSelector(".cfg", { timeout: 5000 });
ok(page.url().includes("/plugins/mcp/sentry"), "URL /plugins/mcp/sentry");
const cfgRows = await page.locator(".cfg .krow").count();
ok(cfgRows === 3, `cfg 键值行 = 3（类型/命令/env 键；实际 ${cfgRows}）`);
const cfgText = (await page.locator(".cfg").textContent()) ?? "";
ok(cfgText.includes("SENTRY_TOKEN"), "env 键名可见（SENTRY_TOKEN）");
ok(cfgText.includes("••••"), "env 值脱敏（•••• 圆点）");
ok(
  (await page.locator("body").textContent())?.includes("secret-value-123") === false,
  "页面任何位置不含 env 真值（脱敏硬断言）",
);
ok(
  (await page.locator(".scope").textContent())?.includes("全局 · 所有 Agent 会话") === true,
  "注入范围行（全局）",
);
ok(
  (await page.locator(".stcard, .trow").count()) === 0,
  "stcard 连接态/工具清单不画（§6.6 能力边界）",
);
await page.locator("header .back").first().click();
await page.waitForTimeout(500);

// ── Part 4: 14 添加 sheet ──────────────────────────────────────────────────
console.log("Part 4: 14 添加 MCP sheet（stabseg 切换 + 提交 payload）");
await page.locator('.psect button.r[aria-label="添加服务器"]').click();
await page.waitForSelector(".msheet", { timeout: 5000 });
ok(
  (await page.locator(".msheet .shd h2").textContent())?.includes("添加 MCP") === true,
  "sheet 标题「添加 MCP 服务器」",
);
ok(
  (await page.locator(".msheet .stabseg button").count()) === 3,
  "stabseg = 3 段（stdio/sse/http）",
);
ok((await page.locator(".msheet input.kfield").count()) === 3, "stdio 字段：名称/命令/参数 = 3");
// 切 SSE：URL 字段出现、命令字段消失。
await page.locator(".msheet .stabseg button", { hasText: "SSE" }).click();
await page.waitForTimeout(200);
ok((await page.locator(".msheet input.kfield").count()) === 2, "SSE 模式字段 = 名称 + URL");
ok((await page.locator(".msheet textarea").count()) === 0, "SSE 模式无 env textarea");
// 切回 stdio，填表提交。
await page.locator(".msheet .stabseg button").first().click();
await page.waitForTimeout(200);
await page.locator(".msheet input.kfield").first().fill("docs-mcp");
// stdio 模式 kfield：名称 / 命令 / 参数。aria-label 定位（Radix 无关，业务标签定位）。
await page.locator('.msheet input[aria-label="命令"]').fill("npx");
await page.locator('.msheet input[aria-label="参数"]').fill("-y docs-mcp");
await page.locator('.msheet textarea[aria-label="环境变量"]').fill("DOCS_TOKEN=abc123");
await page.locator(".msheet .kbtns .p").click();
await page.waitForTimeout(600);
ok(mcpAddPosts.length === 1, `POST /api/mcp/add 恰 1 次（实际 ${mcpAddPosts.length}）`);
if (mcpAddPosts.length === 1) {
  const body = mcpAddPosts[0];
  ok(body.name === "docs-mcp" && body.type === "stdio", "payload name/type 正确");
  ok(
    body.command === "npx" && JSON.stringify(body.args) === '["-y","docs-mcp"]',
    "command/args 正确",
  );
  ok(JSON.stringify(body.env) === '{"DOCS_TOKEN":"abc123"}', "env 多行解析（空行/无= 行忽略）");
}
ok((await page.locator(".msheet").count()) === 0, "提交成功后 sheet 关闭");

// ── Part 5: 18 市场 + 16 审计 sheet ────────────────────────────────────────
console.log("Part 5: 18 技能市场 + 16 安装审计 sheet");
await page.locator(".mrow", { hasText: "技能市场" }).click();
await page.waitForTimeout(600);
ok(page.url().endsWith("/plugins/market?marketTab=skill"), "URL /plugins/market?marketTab=skill");
ok(
  (await page.locator(".tabseg button", { hasText: "技能" }).getAttribute("class"))?.includes(
    "on",
  ) === true,
  "tabseg 默认选中「技能」段",
);
ok(
  (await page.locator(".mchips .chip2.on").textContent())?.includes("skills.sh") === true,
  "来源 chip「✓ 官方 skills.sh」恒 on",
);
// query <2 字符时 mcard 不渲染（emptyMarket 提示态）；填搜索框出结果。
await page.getByRole("searchbox").first().fill("docs");
await page.waitForSelector(".mcard", { timeout: 5000 });
ok((await page.locator(".mcard").count()) === 1, "搜索结果 mcard = 1");
ok(
  (await page.locator(".mcard .r1").textContent())?.includes("docs-writer") === true,
  "mcard 名 docs-writer",
);
await page.locator(".mcard .btn2").click();
await page.waitForSelector(".msheet", { timeout: 5000 });
ok(
  (await page.locator(".msheet .shd h2").textContent())?.includes("安装前请确认") === true,
  "16 审计 sheet 标题「安装前请确认」",
);
ok(
  (await page.locator(".msheet .skrow .v").textContent())?.includes("全局") === true,
  "审计作用域行（全局）",
);
ok(
  (await page.locator(".msheet").textContent())?.includes("sha256") === false,
  "sha256 行不画（§6.6 无数据源）",
);
await page.locator(".msheet .kbtns .p.solid").click();
await page.waitForTimeout(800);
ok(
  skillInstallPosts.length === 1,
  `POST /api/skills/install 恰 1 次（实际 ${skillInstallPosts.length}）`,
);
if (skillInstallPosts.length === 1) {
  const body = skillInstallPosts[0];
  ok(body.skillId === "docs-writer" && body.source === "anthropics/skills", "install payload 正确");
}
await page.waitForTimeout(600);
ok((await page.locator(".mcard .installed").count()) === 1, "done 帧后卡转「✓ Installed」态");

// ── Part 6: 15 源管理 ──────────────────────────────────────────────────────
console.log("Part 6: 15 市场源管理（scard 三态 + addsrc 展开）");
await page
  .locator('header button[aria-label*="源"], header button[aria-label*="管理"]')
  .first()
  .click();
await page.waitForSelector(".scard", { timeout: 5000 });
ok(page.url().endsWith("/plugins/sources"), "URL /plugins/sources");
ok((await page.locator(".scard").count()) === 3, "scard = 3（精选 + skills.sh + 自定义）");
ok(
  (await page.locator(".scard .tag.builtin").count()) === 2,
  "builtin 章 = 2（精选 + 自定义章复用）",
);
ok((await page.locator(".scard .tag.official").count()) === 1, "official 章 = 1（skills.sh）");
const customCard = page.locator(".scard", { hasText: "Acme" });
ok((await customCard.count()) === 1, "自定义源卡（Acme）");
ok((await customCard.locator("button", { hasText: "移除" }).count()) === 1, "自定义源卡含移除钮");
ok((await page.locator(".toggle").count()) === 0, "源 toggle 不画（§6.6 无 enabled 字段）");
await page.locator(".addsrc").click();
await page.waitForTimeout(300);
ok((await page.locator(".addsrc").count()) === 0, "addsrc 点击后切换为表单");
ok((await page.locator('input[aria-label="owner/repo"]').count()) === 1, "repo 字段可见");

// ── 汇总 ───────────────────────────────────────────────────────────────────
console.log(`\n${passCount} pass, ${failCount} fail`);
await browser.close();
process.exit(failCount > 0 ? 1 : 0);
