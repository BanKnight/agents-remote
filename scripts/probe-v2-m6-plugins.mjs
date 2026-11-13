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
    // description/source（2026-10-04 列表副行「描述 · 来源」对齐原型）：与 preview mock 同 slug 口径。
    description: "提交前自动审查代码变更",
    source: "anthropics/skills",
  },
  {
    name: "tdd",
    path: "/home/deploy/.claude/skills/tdd",
    scope: "global",
    agents: ["claude-code"],
    description: "测试驱动开发工作流",
    source: "anthropics/skills",
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
  {
    id: "anthropics/skills/code-style",
    skillId: "code-style",
    name: "code-style",
    installs: 567,
    source: "anthropics/skills",
  },
];

const SKILL_SOURCES = [
  { id: "src-1", type: "github", repo: "acme/skills", branch: "main", label: "Acme" },
];

// 请求记录（payload 断言用）。
const mcpAddPosts = [];
const skillInstallPosts = [];
const disablePosts = [];
const mcpDisablePosts = [];

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
        // 拟真：preview.source 真实语义 = realpath（code-review P3-6——假 slug 会掩盖未来
        // 对 preview.source 的误消费；dmeta 已改走 installed.source，此处不再被消费）。
        source: "/home/deploy/.claude/skills/code-review",
      }),
    ),
  );
  // 更新检测已任务化（与 install/update 同链）：POST 秒回 taskId，updates 结果随 SSE done 帧
  // 带回（见下方 task/*/events mock 的 task-m6-upd 分支）。
  await page.route("**/api/skills/updates", (r) =>
    r.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({ taskId: "task-m6-upd", status: "running" }),
    }),
  );
  // 按 query 区分命中（服务端语义）：docs→docs-writer、style→code-style。
  // Part 5 会真装 docs-writer（mock handler push 进 INSTALLED_SKILLS），Part 7 搜索融合段
  // 改用 code-style——已装项被去重是正确行为，场景不能自撞。
  await page.route("**/api/skills/search*", (r) => {
    const q = new URL(r.request().url()).searchParams.get("q") ?? "";
    const hits = MARKET_SKILLS.filter((s) =>
      q.includes("style") ? s.name === "code-style" : s.name === "docs-writer",
    );
    return r.fulfill(json({ query: q, skills: hits, count: hits.length }));
  });
  await page.route("**/api/skills/sources", (r) => r.fulfill(json({ sources: SKILL_SOURCES })));
  await page.route("**/api/skills/uninstall", (r) => r.fulfill(json({ ok: true })));
  // v1.4 批6：停用/启用（rename 语义）——成功后 mock 数据同步翻转（列表 chip 断言依赖）。
  await page.route("**/api/skills/disable", (r) => {
    const body = JSON.parse(r.request().postData() ?? "{}");
    disablePosts.push(body);
    const skill = INSTALLED_SKILLS.find((s) => s.name === body.name);
    if (skill) skill.disabled = true;
    return r.fulfill(json({ ok: true }));
  });
  await page.route("**/api/skills/enable", (r) => {
    const body = JSON.parse(r.request().postData() ?? "{}");
    const skill = INSTALLED_SKILLS.find((s) => s.name === body.name);
    if (skill) skill.disabled = false;
    return r.fulfill(json({ ok: true }));
  });
  await page.route("**/api/mcp/disable", (r) => {
    const body = JSON.parse(r.request().postData() ?? "{}");
    mcpDisablePosts.push(body);
    const server = MCP_SERVERS.find((s) => s.name === body.name);
    if (server) server.disabled = true;
    return r.fulfill(json({ ok: true, name: body.name }));
  });
  await page.route("**/api/mcp/enable", (r) => {
    const body = JSON.parse(r.request().postData() ?? "{}");
    const server = MCP_SERVERS.find((s) => s.name === body.name);
    if (server) server.disabled = false;
    return r.fulfill(json({ ok: true, name: body.name }));
  });
  await page.route("**/api/skills/install", (r) => {
    skillInstallPosts.push(JSON.parse(r.request().postData() ?? "{}"));
    // done 后已装列表应含 docs-writer（✓ Installed 态断言依赖）。
    INSTALLED_SKILLS.push({
      name: "docs-writer",
      path: "/home/deploy/.claude/skills/docs-writer",
      scope: "global",
      agents: ["claude-code"],
      description: "编写与维护项目文档",
      source: "anthropics/skills",
    });
    return r.fulfill(json({ taskId: "task-m6", status: "running" }));
  });
  // SSE 任务帧：fulfill 一次响应含 done 帧（EventSource onmessage 解析后 waitForSkillTask resolve）。
  // 按 taskId 分流：task-m6-upd = 更新检测（updates 随帧带回）；其余 = install。
  await page.route("**/api/skills/task/*/events", (r) => {
    const taskId = r
      .request()
      .url()
      .match(/\/api\/skills\/task\/([^/]+)\/events/)?.[1];
    const frame =
      taskId === "task-m6-upd"
        ? {
            taskId,
            status: "done",
            kind: "check",
            updates: [{ name: "code-review", hasUpdate: true, manageable: true }],
          }
        : { taskId: "task-m6", status: "done", kind: "install", skill: INSTALLED_SKILLS[0] };
    return r.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: `data: ${JSON.stringify(frame)}\n\n`,
    });
  });
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
console.log("Part 1: 09 插件主页（v1.4 批6：大标题 → 搜索 → segc → 市场组 quick chips → 两组卡）");
await page.goto(`${ORIGIN}/plugins`);
await page.waitForSelector(".segc", { timeout: 10000 });
ok(
  (await page.getByRole("heading", { level: 1, name: "插件" }).textContent()) === "插件",
  "h1 大标题「插件」",
);
ok((await page.locator(".segc button").count()) === 2, "segc 作用域分段 = 2 段");
// 段序：域行在内容区之上（v1.6 plugins-tab ①改版：移动 = segc + 收缩搜索钮同行，常驻
// .psearch 已退役——探针旧断言按 10-04 前实现写的，已过期，§29）。
ok(
  (await page.evaluate(() => {
    const segc = document.querySelector(".segc");
    const srchBtn = document.querySelector(".obtn.srch");
    if (!segc || !srchBtn) return false;
    return (
      (srchBtn.compareDocumentPosition(segc) & Node.DOCUMENT_POSITION_CONTAINED_BY) !== 0 ||
      (segc.compareDocumentPosition(srchBtn) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
    );
  })) === true,
  "段序：segc 与收缩搜索钮同域行（v1.6 展开式搜索）",
);
ok(
  (await page.locator(".segc button.on").textContent())?.includes("全局") === true,
  "默认作用域「全局」on",
);
await page.waitForSelector(".pcard", { timeout: 5000 });
ok((await page.locator(".pcard").count()) === 4, "pcard = 4（MCP 2 + 技能 2）");
// 列表卡来源（2026-10-04 用户拍板「右上角标注来源」，当日二次演化：副行「描述 · 来源」
// → 右上角来源 chip + 副行纯描述）：code-review 有锁 slug → chip「来源:anthropics/skills」
//（zh 半角冒号无空格）+ d2 纯描述；tdd 同款。防 d2 回归成 path / 回归挂来源。
{
  const crCard = page.locator(".pcard", { hasText: "code-review" });
  const crD2 = await crCard.locator(".d2").textContent();
  ok(
    crD2?.includes("提交前自动审查代码变更") === true && !crD2.includes("来源:"),
    `技能卡 d2 = 纯描述（实测「${crD2?.trim()}」）`,
  );
  ok(
    (await crCard.locator(".r1 .upd", { hasText: "来源:anthropics/skills" }).count()) === 1,
    "技能卡右上角来源 chip = 来源:anthropics/skills",
  );
  const tddCard = page.locator(".pcard", { hasText: "tdd" });
  const tddD2 = await tddCard.locator(".d2").textContent();
  ok(
    tddD2?.includes("测试驱动开发工作流") === true && !tddD2.includes("来源:"),
    `技能卡 d2（tdd）= 纯描述（实测「${tddD2?.trim()}」）`,
  );
  ok(
    (await tddCard.locator(".r1 .upd", { hasText: "来源:anthropics/skills" }).count()) === 1,
    "技能卡右上角来源 chip（tdd）",
  );
  ok(
    (await page.locator(".pcard .d2", { hasText: "/home/deploy" }).count()) === 0,
    "列表 d2 不再显示安装路径（对齐原型）",
  );
}
ok(
  (await page.locator(".psect", { hasText: "MCP 服务器" }).textContent())?.includes(
    "MCP 服务器 · 2",
  ) === true,
  "MCP 组标题含计数",
);
// 市场组顶部化：第一组 = 「市场」+ .quick 两 chip（无计数 §6.12g）。
ok(
  (await page.locator(".psect").first().textContent())?.includes("市场") === true,
  "组头「市场」顶部化（第一组）",
);
await page.waitForSelector(".quick .q", { timeout: 5000 });
ok((await page.locator(".quick .q").count()) === 2, "quick chips = 2（MCP 市场 + 技能市场）");
// 搜索融合（编号①）：搜索「tdd」→ 市场命中 docs-writer →「市场 · 安装」行插组尾。
// v1.6 展开式搜索（5004c1a）后 searchbox 需先点 .obtn.srch 展开（§29 探针过期修复）。
await page.locator(".obtn.srch").click();
await page.getByRole("searchbox").first().fill("tdd");
await page.waitForSelector(".mrow", { timeout: 5000 });
ok((await page.locator(".pcard").count()) === 1, "搜索「tdd」后 pcard = 1（tdd 已装）");
ok(
  (await page.locator(".mrow", { hasText: "docs-writer" }).count()) === 1,
  "市场融合行 docs-writer（市场 · 安装）",
);
await page.getByRole("searchbox").first().fill("");
await page.waitForTimeout(300);
// 展开态搜索行替换 segc 行（v1.6 同构）：清词后点 ✕ 收起 → segc 复位（§29 探针过期修复）。
await page.locator('button[aria-label="关闭搜索"]').click();
await page.waitForTimeout(300);
await page.locator(".segc button").nth(1).click();
await page.waitForTimeout(300);
ok(
  (await page.getByText("去工作台选择项目").count()) === 1,
  "「本项目」空态引导（去工作台选择项目）",
);
await page.locator(".segc button").first().click();
await page.waitForTimeout(300);
// 手动「检查更新」→ 组头「1 个更新 ›」chip（updates mock 返回 code-review hasUpdate:true）。
await page.locator(".psect button.r", { hasText: "检查更新" }).click();
await page.waitForTimeout(600);
ok(
  (await page.locator(".psect button.r", { hasText: "个更新" }).count()) === 1,
  "手动检查更新后组头「1 个更新 ›」chip（技能组头）",
);
ok(
  (await page.locator(".pcard .upd", { hasText: "有更新" }).count()) === 1,
  "行内「有更新」chip 恰 1（code-review）",
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
  (await page.locator(".dmeta").textContent())?.includes("来源:anthropics/skills") === true,
  // 数据源 = installed.source（2026-10-04 对齐：preview.source 是 realpath 非来源语义，
  // 详情页 dmeta 与 09 列表副行统一走锁 slug）；锚「来源:」前缀（zh 半角冒号无空格，
  // 逐字符对齐原型「来源:官方」形态，防前缀回归）。
  "dmeta 含来源前缀 + slug（installed.source）",
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
// 行动钮并排（2026-11-12 Apple Store 式重排后）：更新 .cta + 卸载 .rm 各 flex-1 均分
// 操作行（容器 px-4 = 左右 16×2 + gap 8 → 每钮 (vw-40)/2）。原「整宽 vw-32」断言随
// 布局退役——两钮等宽且合计填满行宽才是现契约。
const btnGeo = await page.evaluate(() => {
  const geo = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  };
  const cta = document.querySelector(".cta");
  const row = cta?.parentElement;
  const rm = document.querySelector(".rm");
  const sameRow = row && rm && row.contains(rm);
  return {
    vw: window.innerWidth,
    cta: geo(".cta"),
    rm: geo(".rm"),
    ctaTop: cta ? Math.round(cta.getBoundingClientRect().top) : null,
    rmTop: rm ? Math.round(rm.getBoundingClientRect().top) : null,
    sameRow,
  };
});
// 两者 flex 声明相同（1 1 0%）+ gap 8 + 总宽 = vw-40 精确吻合，但 Chromium 分配为
// 174/176（±2px 引擎内部行为）——断言锁「各自落在均分值 ±2 内」而非严格相等；
// 同行比较用两钮自身 top（容器行带 pt-3，容器 top ≠ 按钮 top）；高度必须相等
//（reviewer P3：.rm 显式 height:42 挡住 items-stretch → 底缘差 2px，h-auto 放行拉平）。
ok(
  btnGeo.sameRow === true &&
    Math.abs(btnGeo.cta.w - (btnGeo.vw - 40) / 2) <= 2 &&
    Math.abs(btnGeo.rm.w - (btnGeo.vw - 40) / 2) <= 2 &&
    btnGeo.ctaTop === btnGeo.rmTop &&
    btnGeo.cta.h === btnGeo.rm.h,
  `.cta/.rm 并排均分等高 = (vw-40)/2±2（cta ${btnGeo.cta.w}×${btnGeo.cta.h} / rm ${btnGeo.rm.w}×${btnGeo.rm.h} / vw ${btnGeo.vw}）`,
);
// 卸载确认 Alert（spec §5：删除类确认走 useConfirm；移动形态 = iOS action sheet，即
// ConfirmDialog 的 MobileSheet 分支——39a8aca 起移动收敛单源，桌面才是 Dialog）。
await page.locator(".rm").click();
await page.waitForSelector(".msheet", { timeout: 5000 });
ok(
  (await page.locator(".msheet .shd h2").textContent())?.includes("卸载技能") === true,
  "卸载确认 Alert 标题",
);
const alertConfirm = page.locator(".msheet button", { hasText: "卸载" }).first();
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
await page.locator(".msheet button", { hasText: "取消" }).click();
await page.waitForTimeout(700); // SHEET_UNMOUNT_DELAY_MS 延迟卸载
ok((await page.locator(".msheet").count()) === 0, "取消后 Alert 关闭");
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
// 组头改 .r 文字钮「＋ 添加」（design review ⑤，原型 09 L72）——MCP/技能两组头同文案，
// 限定 MCP 段（hasText 组头标签）定位。
await page
  .locator(".psect", { hasText: "MCP 服务器" })
  .locator("button.r", { hasText: "＋ 添加" })
  .click();
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
await page.locator(".quick .q", { hasText: "技能市场" }).click();
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
// 市场 tab 切换 = 同页视图状态，走 replace 不污染历史栈（2026-10-24 bug③：此前每次切 tab
// 历史 +1，「返回」要多点 N 次才回 /plugins）。断言 history.length 零增长 + 一次 back 直达。
{
  const histBefore = await page.evaluate(() => window.history.length);
  await page.locator(".tabseg button", { hasText: "MCP" }).click();
  await page.waitForTimeout(400);
  await page.locator(".tabseg button", { hasText: "技能" }).click();
  await page.waitForTimeout(400);
  const histAfter = await page.evaluate(() => window.history.length);
  ok(histAfter === histBefore, `市场 tab 切换零历史增长（${histBefore} → ${histAfter}）`);
  ok(page.url().endsWith("/plugins/market?marketTab=skill"), "切回技能段 URL 仍 ?marketTab=skill");
}
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
// 返回层级（2026-10-24 bug③ 端到端）：切过市场 tab 后 sources ‹ → 市场页 ‹ → /plugins，各一层。
{
  await page.locator("header .back").first().click();
  await page.waitForTimeout(500);
  ok(page.url().includes("/plugins/market"), "sources ‹ 返回市场页（一层）");
  await page.locator("header .back").first().click();
  await page.waitForTimeout(500);
  ok(page.url().endsWith("/plugins"), "市场页 ‹ 返回 /plugins（切过 tab 仍只一层）");
}

// ── Part 7: 09b 长按菜单 + 停用闭环 + 搜索融合安装 + 09mb 作用域 Popover ──────
console.log("Part 7: 09b 长按菜单（查看详情/停用/卸载）+ 停用 chip + 审计 sheet 复用 + 09mb");
await page.goto(`${ORIGIN}/plugins`);
await page.waitForSelector(".pcard", { timeout: 10000 });
// 长按技能卡（pointerdown touch 持 600ms > LONG_PRESS_MS 500）→ action sheet。
const skillCard = page.locator(".pcard", { hasText: "code-review" });
await skillCard.dispatchEvent("pointerdown", {
  pointerId: 7,
  pointerType: "touch",
  isPrimary: true,
  clientX: 40,
  clientY: 40,
});
await page.waitForTimeout(650);
await skillCard.dispatchEvent("pointerup", { pointerId: 7, pointerType: "touch", isPrimary: true });
await page.waitForSelector('[role="menu"]', { timeout: 5000 });
ok(
  (await page.locator('[role="menuitem"]', { hasText: "查看详情" }).count()) === 1,
  "菜单项「查看详情」",
);
ok(
  (await page.locator('[role="menuitem"]', { hasText: "停用（停止注入）" }).count()) === 1,
  "菜单项「停用（停止注入）」",
);
ok(
  (await page.locator('[role="menuitem"]', { hasText: "卸载" }).count()) === 1,
  "菜单项「卸载…」（destructive）",
);
// 点停用 → POST /api/skills/disable → 列表刷新出「已停用」chip。
await page.locator('[role="menuitem"]', { hasText: "停用" }).click();
await page.waitForTimeout(800);
ok(disablePosts.length === 1, `POST /api/skills/disable 恰 1（实际 ${disablePosts.length}）`);
if (disablePosts.length === 1) {
  ok(
    disablePosts[0].name === "code-review" && disablePosts[0].agent === "claude-code",
    "disable payload name/agent 正确",
  );
}
ok(
  (await page
    .locator(".pcard", { hasText: "code-review" })
    .locator(".upd", { hasText: "已停用" })
    .count()) === 1,
  "停用后卡上「已停用」chip",
);
// 详情页「已启用」toggle：停用后 = 未选中；点击 = enable（payload disabled:false）。
await page.locator(".pcard", { hasText: "code-review" }).click();
await page.waitForSelector('[role="switch"]', { timeout: 5000 });
const enabledSwitch = page.locator('[role="switch"]').first();
ok(
  (await enabledSwitch.getAttribute("aria-checked")) === "false",
  "详情页「已启用」toggle 反映停用态（aria-checked=false）",
);
await enabledSwitch.click();
await page.waitForTimeout(800);
await page.goto(`${ORIGIN}/plugins`);
await page.waitForSelector(".pcard", { timeout: 10000 });
ok(
  (await page
    .locator(".pcard", { hasText: "code-review" })
    .locator(".upd", { hasText: "已停用" })
    .count()) === 0,
  "enable 后「已停用」chip 消失",
);

// MCP 卡长按停用（09b 同款闭环，/api/mcp/disable）。
const mcpCard = page.locator(".pcard", { hasText: "sentry" });
await mcpCard.dispatchEvent("pointerdown", {
  pointerId: 8,
  pointerType: "touch",
  isPrimary: true,
  clientX: 40,
  clientY: 40,
});
await page.waitForTimeout(650);
await mcpCard.dispatchEvent("pointerup", { pointerId: 8, pointerType: "touch", isPrimary: true });
await page.waitForSelector('[role="menu"]', { timeout: 5000 });
await page.locator('[role="menuitem"]', { hasText: "停用" }).click();
await page.waitForTimeout(800);
ok(mcpDisablePosts.length === 1, `POST /api/mcp/disable 恰 1（实际 ${mcpDisablePosts.length}）`);
ok(
  (await page
    .locator(".pcard", { hasText: "sentry" })
    .locator(".upd", { hasText: "已停用" })
    .count()) === 1,
  "MCP 停用后卡上「已停用」chip",
);
// MCP 详情页 toggle 同款（停用态 → aria-checked=false）。
await page.locator(".pcard", { hasText: "sentry" }).click();
await page.waitForSelector('[role="switch"]', { timeout: 5000 });
ok(
  (await page.locator('[role="switch"]').first().getAttribute("aria-checked")) === "false",
  "MCP 详情页「已启用」toggle 反映停用态",
);
await page.locator("header .back").first().click();
await page.waitForTimeout(500);

// 搜索融合 → 审计 sheet 处理（编号①安装链路）。docs-writer 已在 Part 5 装过（已装去重是
// 正确行为），换未安装的 code-style 验证行渲染 + 点击进审计 sheet。主页经 SPA 导航返回后
// searchOpen 复位 → 需重新点 .obtn.srch 展开（§29 探针过期修复）。
await page.locator(".obtn.srch").click();
await page.getByRole("searchbox").first().fill("style");
await page.waitForSelector(".mrow", { timeout: 5000 });
await page.locator(".mrow", { hasText: "code-style" }).click();
await page.waitForSelector(".msheet", { timeout: 5000 });
ok(
  (await page.locator(".msheet .shd h2").textContent())?.includes("安装前请确认") === true,
  "搜索行 → 16 审计 sheet（复用单源）",
);
await page.locator(".msheet .kbtns .c").click();
await page.waitForTimeout(400);
ok((await page.locator(".msheet").count()) === 0, "取消后审计 sheet 关闭");
await page.getByRole("searchbox").first().fill("");

// 09mb：桌面语境（hideTitle）▾ → .spop 作用域 Popover。
const desktopCtx = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  locale: "zh-CN",
});
const dpage = await desktopCtx.newPage();
await setupM6Mocks(dpage);
await login(dpage);
// 09mb ▾ 只在有 lastProject 时渲染（ScopeSwitchPopover 挂在 lastProject 条件下）——
// 预置 lastProjectKey（atomWithLocalOnlyStorage = JSON 序列化值）。
await dpage.addInitScript(() => {
  localStorage.setItem("workbench.lastProjectKey", JSON.stringify("proj1"));
});
await dpage.goto(`${ORIGIN}/plugins`);
await dpage.waitForSelector('[aria-label="切换项目"]', { timeout: 10000 });
await dpage.locator('[aria-label="切换项目"]').click();
await dpage.waitForSelector(".spop", { timeout: 5000 });
ok(
  (await dpage.locator(".spop .ttl").textContent())?.includes("切换作用域") === true,
  "09mb Popover 标题「切换作用域」",
);
ok((await dpage.locator(".spop .row.on").count()) === 1, "当前作用域行 on");
ok((await dpage.locator(".spop .ck").count()) === 1, "当前作用域行 ✓");
ok((await dpage.locator(".spop .newp").count()) === 1, "「＋ 新建项目」行");
await desktopCtx.close();

// ── Part 8: 桌面技能详情 mainPage（2026-11-12 回归：复用 MobileSkillDetail）──────
// 回归面：桌面 /plugins/skill/$ 原渲染 SkillTabPreview（tab 时代只读 Markdown）——长文不滚
// （section.flex-1 在 MainPageShell 非 flex children 容器下失效）、无返回钮、无单技能更新/
// 停用/卸载入口（用户真机报障）。现复用 MobileSkillDetail（与 MCP 详情复用 MobileMcpDetail
// 同构）。断言：返回钮 / 主页面标题 / 可滚动性（scrollTop 读回）/ 更新 CTA / 停用开关。
console.log("Part 8: 桌面 /plugins/skill/$ 详情（返回钮 + 滚动 + 更新 CTA + 停用开关）");
const detailCtx = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  locale: "zh-CN",
});
const dpage2 = await detailCtx.newPage();
await setupM6Mocks(dpage2);
// 长正文覆盖（后注册 route 优先）：滚动断言需要内容超出视口容器——基础 mock 正文仅一段。
const longBody = `# Code Review\n\n${Array.from(
  { length: 80 },
  (_, i) => `正文段落 ${i}：提交前审查要点、潜在缺陷与测试覆盖建议示例。`,
).join("\n\n")}`;
await dpage2.route("**/api/skills/preview*", (r) =>
  r.fulfill(
    json({
      name: "code-review",
      description: "提交前自动审查代码变更",
      content: longBody,
      source: "/home/deploy/.claude/skills/code-review",
    }),
  ),
);
// 更新端点：POST 秒回 taskId（json helper 恒 200，fetchJson 只查 res.ok；SSE 终态走
// setupM6Mocks 的 task/*/events mock，done 帧 resolve waitForSkillTask）。
await dpage2.route("**/api/skills/update", (r) => r.fulfill(json({ taskId: "t-update-1" })));
await login(dpage2);
await dpage2.goto(`${ORIGIN}/plugins`);
await dpage2.waitForSelector(".pcard", { timeout: 10000 });
// 不点列表「检查更新」直接进详情——验证 2026-11-12 新增的详情页自动检测（此前 hasUpdate
// 依赖手动检测，更新 CTA 看不到；用户实报「单个技能更新的按钮也没看到」）。
await dpage2.locator(".pcard", { hasText: "code-review" }).click();
await dpage2.waitForSelector(".dmeta", { timeout: 5000 });
ok(dpage2.url().includes("/plugins/skill/code-review"), "D1 桌面 URL /plugins/skill/code-review");
ok(
  (await dpage2.locator("header button.back").count()) === 1,
  "D2 返回钮在场（PluginNav back——SkillTabPreview 时代缺失）",
);
ok(
  (await dpage2.getByRole("heading", { level: 1, name: "插件" }).count()) === 1,
  "D3 mainPage 标题 h1「插件」",
);
// 可滚动性硬数据：从滚动区内锚点（.dsect）向上找真正的滚动祖先（详情内容容器）——
// 布局重排（Apple Store 式）后 .rm 已移固定头区，不能再当滚动区锚点；且不能裸扫
// .overflow-y-auto 取首个可滚元素（会命中左栏列表 306/303，非正文）。
const scrollGeo = await dpage2.evaluate(() => {
  const anchor = document.querySelector(".dsect");
  if (!anchor) return { found: false, reason: "no .dsect" };
  let el = anchor.parentElement;
  while (el) {
    const overflowY = getComputedStyle(el).overflowY;
    if (overflowY === "auto" || overflowY === "scroll") break;
    el = el.parentElement;
  }
  if (!el) return { found: false, reason: "no scroll ancestor" };
  el.scrollTop = 240;
  return {
    found: true,
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
    scrollTopAfter: el.scrollTop,
  };
});
ok(
  scrollGeo.found && scrollGeo.scrollTopAfter >= 200,
  `D4 长正文可滚动（scrollHeight ${scrollGeo.scrollHeight} > clientHeight ${scrollGeo.clientHeight}，scrollTop 读回 ${scrollGeo.scrollTopAfter}${scrollGeo.reason ? `；${scrollGeo.reason}` : ""}）`,
);
// Apple Store 式布局（2026-11-12 用户反馈「更新/卸载按钮在底部要拉滚动条才能看到」）：
// 操作钮在滚动容器**外**的固定头区（结构性断言）+ 正文滚动时不随 scrollTop 位移（几何断言，
// 滚动容器从滚动区锚点 .dsect 向上找——.rm 自身在固定头、向上找不到滚动容器）。
const fixedHead = await dpage2.evaluate(() => {
  const rm = document.querySelector(".rm");
  const md = document.querySelector(".dsect");
  if (!rm || !md) return { found: false };
  let el = rm.parentElement;
  let insideScroll = false;
  while (el) {
    const oy = getComputedStyle(el).overflowY;
    if (oy === "auto" || oy === "scroll") {
      insideScroll = true;
      break;
    }
    el = el.parentElement;
  }
  let sc = md.parentElement;
  while (sc && !["auto", "scroll"].includes(getComputedStyle(sc).overflowY)) {
    sc = sc.parentElement;
  }
  if (!sc) return { found: true, insideScroll, scrolled: false, top0: -1, top240: -1 };
  sc.scrollTop = 0;
  const top0 = rm.getBoundingClientRect().top;
  sc.scrollTop = 240;
  const top240 = rm.getBoundingClientRect().top;
  sc.scrollTop = 0;
  return { found: true, insideScroll, scrolled: true, top0, top240 };
});
ok(
  fixedHead.found && !fixedHead.insideScroll,
  "D10 更新/卸载钮在固定头区（不在滚动容器内——Apple Store 式布局）",
);
ok(
  fixedHead.scrolled && Math.abs(fixedHead.top0 - fixedHead.top240) < 1,
  `D11 正文滚动时操作钮纹丝不动（top ${fixedHead.top0.toFixed(1)} → ${fixedHead.top240.toFixed(1)}）`,
);
// D5：自动检测（详情页 mount 自发 refetch updates）后 CTA 出现——列表「检查更新」按钮仍在
//（Part 1 消费），本 Part 不点它，验证用户无需任何手动动作就能看到单技能更新入口。
const ctaAutoAppeared = await dpage2
  .locator(".cta")
  .waitFor({ timeout: 8000 })
  .then(() => true)
  .catch(() => false);
ok(ctaAutoAppeared, "D5 进详情自动检测 → 更新 CTA 自动出现（无需手动检查更新）");
ok((await dpage2.locator('button[role="switch"]').count()) === 1, "D6 停用开关在场（role=switch）");
// D7 先返回（更新流程放到最后——更新成功会乐观清掉 hasUpdate，列表 chip 断言依赖它在场）。
await dpage2.locator("header button.back").click();
await dpage2.waitForTimeout(500);
ok(!dpage2.url().includes("/plugins/skill/"), `D7 返回钮回插件页（URL ${dpage2.url()}）`);
// 列表卡 chip 几何（2026-11-12 用户反馈「有更新标签出现在中间」）：.upd 每个 margin-left:auto
// 会均分剩余空间把「有更新」悬在卡中央；修复后相邻 chip 收拢（.upd + .upd margin-left:6px）
// 靠右成一簇。放在 D7 之后测——详情页自动检测（D5）已填充 updates 缓存且更新流程尚未执行
//（hasUpdate 仍 true），列表卡此刻才有「有更新」chip；Part 8 开头不点「检查更新」（那是 D5
// 自动检测的前提）。
const chipGeo = await dpage2.evaluate(() => {
  // 桌面 /plugins 左栏与 mainPage 都可能渲染 code-review 卡——取「chips ≥2」的那张
  //（mainPage 卡带「有更新」+「来源」两 chip；左栏卡结构不同）。
  const cards = [...document.querySelectorAll(".pcard")].filter((el) =>
    el.textContent?.includes("code-review"),
  );
  let card = null;
  let chips = [];
  for (const c of cards) {
    const r1 = c.querySelector(".r1");
    const found = r1 ? [...r1.querySelectorAll(".upd")] : [];
    if (found.length >= 2) {
      card = c;
      chips = found;
      break;
    }
  }
  if (!card || chips.length < 2)
    return { found: false, gap: -1, sameRow: false, updLeftOfSource: false, rightEdgeDelta: -1 };
  const rects = chips.map((c) => c.getBoundingClientRect());
  const cardRect = card.getBoundingClientRect();
  return {
    found: true,
    gap: rects[1].left - rects[0].right,
    sameRow: Math.abs(rects[0].top - rects[1].top) < 2,
    updLeftOfSource: rects[0].left < rects[1].left,
    rightEdgeDelta: cardRect.right - 16 - rects[rects.length - 1].right,
  };
});
ok(chipGeo.found && chipGeo.sameRow, "C1 卡上「有更新/来源」chip 同行成簇");
ok(
  chipGeo.updLeftOfSource && chipGeo.gap >= 2 && chipGeo.gap <= 12,
  `C2 相邻 chip 收拢（间距 ${chipGeo.gap}px，有更新在来源左侧——不再悬卡中央）`,
);
ok(
  Math.abs(chipGeo.rightEdgeDelta) <= 4,
  `C3 chip 簇右缘贴卡右 padding（偏差 ${chipGeo.rightEdgeDelta}px）`,
);
// D8/D9：更新终态反馈（用户实报「更新中→静默变回，什么结果都不知道」）。重进详情执行——
// 点 CTA → POST → SSE done 帧 → 成功后 hasUpdate 乐观 false，但新增的终态文案必须
// 常驻显示（「✓ 已更新到最新版本」），而不是 CTA 块整体消失留空白。
if (ctaAutoAppeared) {
  await dpage2.locator(".pcard", { hasText: "code-review" }).click();
  await dpage2.waitForSelector(".dmeta", { timeout: 5000 });
  await dpage2.locator(".cta").click();
  const doneNote = dpage2.getByText("已更新到最新版本");
  const doneShown = await doneNote
    .waitFor({ timeout: 10000 })
    .then(() => true)
    .catch(() => false);
  ok(doneShown, "D8 更新成功显示终态文案（「✓ 已更新到最新版本」）");
  ok((await dpage2.locator(".cta").count()) === 0, "D9 更新成功后更新按钮退场（CTA 不残留）");
  // D12：更新成功返回列表，「有更新」chip 随乐观置 false 同步消失（列表与详情同一份缓存）。
  await dpage2.locator("header button.back").click();
  await dpage2.waitForTimeout(500);
  const updChipGone =
    (await dpage2.evaluate(() =>
      [...document.querySelectorAll(".pcard .upd")]
        .filter((el) => !el.classList.contains("off"))
        .every((el) => !el.closest(".pcard")?.textContent?.includes("code-review")),
    )) || false;
  ok(updChipGone, "D12 更新成功返回列表，「有更新」chip 已从卡上消失");
} else {
  ok(false, "D8 更新成功显示终态文案（前置 D5 未通过，跳过点击）");
  ok(false, "D9 更新成功后更新按钮退场（前置 D5 未通过，跳过点击）");
  ok(false, "D12 更新成功返回列表 chip 消失（前置 D5 未通过，跳过）");
}
await detailCtx.close();

// ── Part 9: 可用更新清单页（2026-11-12：组头「n 个更新 ›」→ /plugins/updates 逐项/批量更新；
// 2026-11-13 §6.18 App Store 反馈范式：就地进度环 / 队列编排 / 完成出列过渡 / 检测 spinner）──
console.log("Part 9: /plugins/updates 清单页（黄提示 + 就地环 + 排队 + 出列过渡 + 检测 spinner）");
const updCtx = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  locale: "zh-CN",
});
// §6.18 mock：双项 {code-review, tdd}（顺序 = 服务端数组顺序）；检测帧延迟 800ms /
// 更新帧延迟 1200ms —— 给 spinner / 排队态 / 完成相位留观察窗（无延迟则一帧全绿、相位瞬逝，
// 断言全靠运气）。每项更新独立 taskId（task-upd-N）= 独立 EventSource，模拟真实逐项推进。
const M6_CHECK_DELAY_MS = 800;
const M6_UPDATE_DELAY_MS = 1200;
const M6_UPDATES_TWO = [
  { name: "code-review", hasUpdate: true, manageable: true },
  { name: "tdd", hasUpdate: true, manageable: true },
];
// setupM6Mocks 后注册（Playwright route LIFO 后注册优先）：检测帧延迟 + 双项；更新按
// POST 序发 task-upd-N；install 帧保持立即（Part 9 不装东西，仅兜住分流完整性）。
async function registerUpdMocksWith(page, updatePosts) {
  await setupM6Mocks(page);
  let updSeq = 0;
  await page.route("**/api/skills/task/*/events", (r) => {
    const taskId = r
      .request()
      .url()
      .match(/\/api\/skills\/task\/([^/]+)\/events/)?.[1];
    const fulfillFrame = (frame) =>
      r.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: `data: ${JSON.stringify(frame)}\n\n`,
      });
    if (taskId === "task-m6-upd") {
      return setTimeout(
        () =>
          fulfillFrame({
            taskId,
            status: "done",
            kind: "check",
            updates: M6_UPDATES_TWO,
          }),
        M6_CHECK_DELAY_MS,
      );
    }
    if (taskId?.startsWith("task-upd-")) {
      return setTimeout(
        () => fulfillFrame({ taskId, status: "done", kind: "update" }),
        M6_UPDATE_DELAY_MS,
      );
    }
    return fulfillFrame({
      taskId: "task-m6",
      status: "done",
      kind: "install",
      skill: INSTALLED_SKILLS[0],
    });
  });
  await page.route("**/api/skills/update", (r) => {
    updSeq += 1;
    updatePosts.push(JSON.parse(r.request().postData() ?? "{}"));
    return r.fulfill(json({ taskId: `task-upd-${updSeq}`, status: "running" }));
  });
}
const p3 = await updCtx.newPage();
const updatePosts = [];
await registerUpdMocksWith(p3, updatePosts);
await login(p3);
await p3.goto(`${ORIGIN}/plugins`);
await p3.waitForSelector(".pcard", { timeout: 10000 });
// U10 检测 spinner（§6.18④）：手动检测的 800ms 窗口内组头检查钮「检查中…」带旋转环
//（border-current 跟随按钮文字色，这里只断接线：.animate-spin 在场）。
await p3.locator(".psect button.r", { hasText: "检查更新" }).click();
const checkSpin = await p3
  .locator(".psect button.r", { hasText: "检查中" })
  .locator(".animate-spin")
  .waitFor({ timeout: 3000 })
  .then(() => true)
  .catch(() => false);
ok(checkSpin, "U10 检测中组头检查钮「检查中…」带 spinner");
const yellowChip = p3.getByRole("button", { name: "2 个更新 ›" });
const yellowShown = await yellowChip
  .waitFor({ timeout: 8000 })
  .then(() => true)
  .catch(() => false);
ok(yellowShown, "U1 检测出更新后组头出现黄色「2 个更新 ›」提示");
if (yellowShown) {
  await yellowChip.click();
  await p3.waitForURL(/\/plugins\/updates/, { timeout: 5000 });
  ok(p3.url().includes("/plugins/updates"), `U2 点击黄色提示进清单页（URL ${p3.url()}）`);
  ok(
    (await p3.getByRole("heading", { level: 1, name: "可用更新" }).count()) === 1,
    "U3 清单页标题「可用更新」",
  );
  const crBtn = p3.locator(".pcard", { hasText: "code-review" }).locator("button.upd");
  const tddBtn = p3.locator(".pcard", { hasText: "tdd" }).locator("button.upd");
  await crBtn.waitFor({ timeout: 5000 });
  // 可见面文字精确断言（textContent 含隐藏 sizer「更新中…」，子串 hasText 恒真不构成断言）：
  // 读非 .upd-s 的 face span。
  const faceOf = (btn) =>
    btn.evaluate((el) =>
      [...el.querySelectorAll("span:not(.upd-s)")].map((s) => s.textContent ?? "").join("|"),
    );
  ok(
    (await faceOf(crBtn)) === "更新" && (await tddBtn.count()) === 1,
    "U4 双项卡内单项「更新」钮在场（初始面文字「更新」）",
  );
  const backShown = (await p3.locator("header button.back").count()) === 1;
  ok(backShown, "U7 返回钮在场（PluginNav 单源）");
  // U8 就地进度环（§6.18①）：sizer 锁宽——点「全部更新」前后按钮宽度逐像素相等 +
  // 环（.animate-spin）在按钮内。（单项/批量共用同一 mutateAsync→markDone 相位链，
  // 环态就地性同源；单项点击路径由 U4 在场 + 真机验收覆盖。）
  const widthBefore = (await crBtn.boundingBox())?.width;
  await p3.getByRole("button", { name: "全部更新" }).click();
  await crBtn.locator(".animate-spin").waitFor({ timeout: 3000 });
  const widthDuring = (await crBtn.boundingBox())?.width;
  ok(
    widthBefore !== undefined &&
      widthDuring !== undefined &&
      Math.abs(widthDuring - widthBefore) < 0.5,
    `U8 进度环就地形变（点击前 ${widthBefore}px = 环态 ${widthDuring}px，逐像素相等）`,
  );
  // U9 队列编排（§6.18②）：批量中非当前项「排队中…」弱化（失败项排除语义由失败路径
  // 单测覆盖，此处验证常规队列展示）——直接等目标态（.queued + 排队中文字）。
  const queuedShown = await p3
    .locator("button.upd.queued", { hasText: "排队中" })
    .waitFor({ timeout: 3000 })
    .then(() => true)
    .catch(() => false);
  ok(queuedShown, "U9 批量中非当前项「排队中…」+ .queued 弱化态");
  // U11 完成交叠（§6.18③）：第一项 done 后绿 tint + ✓ 持留窗内，第二项已转环、第二次
  // POST 已发（串行队列推进的交叠瞬间）。
  const doneShown = await p3
    .locator(".pcard.done", { hasText: "code-review" })
    .waitFor({ timeout: 4000 })
    .then(() => true)
    .catch(() => false);
  if (doneShown) {
    // computed bg 与 --tint-green 数值硬比对：token 计算值可能序列化为 #hex8（Chromium 对
    // 自定义属性的计算值序列化，#34c7591f = rgb(52 199 89 / 0.12)），与 computed rgba 写法
    // 不同但数值一致——归一为 "r,g,b,α" 比对（α toFixed(2) 吸收 1/255 量化差）。
    const parseColor = (s) => {
      const t = s.trim();
      const hex = t.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
      if (hex) {
        const a = hex[2] ? parseInt(hex[2], 16) : 255;
        const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16));
        return `${r},${g},${b},${(a / 255).toFixed(2)}`;
      }
      const n = t.match(/[\d.]+/g)?.map(Number) ?? [];
      return `${n[0]},${n[1]},${n[2]},${(n[3] ?? 1).toFixed(2)}`;
    };
    // tint 过渡（--duration-fast ≈120ms）期间读值是插值色 ≠ token——有界重试到过渡收敛
    //（相等即过，上限 ~300ms；exit 相位不动 bg，超 hold 窗仍成立）。
    const doneRow = p3.locator(".pcard.done", { hasText: "code-review" });
    const tintToken = await p3.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--tint-green"),
    );
    let doneBg = null;
    for (let i = 0; i < 20; i++) {
      doneBg = await doneRow.evaluate((el) => getComputedStyle(el).backgroundColor);
      if (parseColor(doneBg) === parseColor(tintToken)) break;
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
    ok(
      doneBg !== null && parseColor(doneBg) === parseColor(tintToken),
      `U11a 完成行绿 tint computed 与 token 一致（${doneBg} vs ${tintToken.trim()}）`,
    );
    const doneBtn = p3.locator(".pcard.done", { hasText: "code-review" }).locator("button.upd");
    ok(((await doneBtn.textContent()) ?? "").includes("✓"), "U11b 完成行按钮显 ✓（持留窗内）");
    const tddSpinNow = (await tddBtn.locator(".animate-spin").count()) === 1;
    ok(tddSpinNow, "U11c 完成交叠：第二项同帧已转环（队列推进）");
    ok(
      updatePosts.length === 2 && updatePosts[1].name === "tdd",
      `U11d 完成交叠：第二次 POST 已发（实际 ${JSON.stringify(updatePosts.map((p) => p.name))}）`,
    );
  } else {
    ok(false, "U11a 完成行绿 tint（前置 .pcard.done 未出现，跳过）");
    ok(false, "U11b 完成行按钮显 ✓（前置未通过，跳过）");
    ok(false, "U11c 完成交叠第二项转环（前置未通过，跳过）");
    ok(false, "U11d 完成交叠第二次 POST（前置未通过，跳过）");
  }
  // U12 塌缩出列（§6.18③）：持留 400ms + 塌缩 150ms 后行 DOM 移除（硬闸）。
  const crGone = await p3
    .locator(".pcard", { hasText: "code-review" })
    .waitFor({ state: "detached", timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  ok(crGone, "U12 完成行持留后塌缩出列（DOM 移除硬闸）");
  const emptied = await p3
    .getByText("没有待更新的技能")
    .waitFor({ timeout: 10000 })
    .then(() => true)
    .catch(() => false);
  ok(emptied, "U5 全部更新完成后成功项出列（清单转空态）");
  ok(
    updatePosts.length === 2 &&
      updatePosts[0].name === "code-review" &&
      updatePosts[0].agent === "claude-code" &&
      updatePosts[1].name === "tdd" &&
      updatePosts[1].agent === "claude-code",
    `U6 批量更新请求恰 2 次、顺序 [code-review, tdd]、payload 正确（实际 ${JSON.stringify(updatePosts)}）`,
  );
} else {
  ok(false, "U2 点击黄色提示进清单页（前置 U1 未通过，跳过）");
  ok(false, "U3 清单页标题「可用更新」（前置 U1 未通过，跳过）");
  ok(false, "U4 双项卡内单项「更新」钮在场（前置 U1 未通过，跳过）");
  ok(false, "U7 返回钮在场（前置 U1 未通过，跳过）");
  ok(false, "U8 进度环就地形变（前置 U1 未通过，跳过）");
  ok(false, "U9 批量排队弱化态（前置 U1 未通过，跳过）");
  ok(false, "U11a 完成行绿 tint（前置 U1 未通过，跳过）");
  ok(false, "U11b 完成行按钮显 ✓（前置 U1 未通过，跳过）");
  ok(false, "U11c 完成交叠第二项转环（前置 U1 未通过，跳过）");
  ok(false, "U11d 完成交叠第二次 POST（前置 U1 未通过，跳过）");
  ok(false, "U12 完成行塌缩出列（前置 U1 未通过，跳过）");
  ok(false, "U5 全部更新完成清单转空态（前置 U1 未通过，跳过）");
  ok(false, "U6 批量更新请求恰 2 次顺序正确（前置 U1 未通过，跳过）");
}
// U13（§6.18④）深链：同 context 新 page（cookie 已共享，免 login）直达 /plugins/updates
// ——缓存空触发自动检测（useAutoCheckSkillUpdates），整页「检查中」分支带 spinner；帧回后
// 渲染双项清单（auto-check 链路完整闭合）。
const p4 = await updCtx.newPage();
await registerUpdMocksWith(p4, []);
await p4.goto(`${ORIGIN}/plugins/updates`);
const pageSpin = await p4
  .locator("p", { hasText: "检查中" })
  .locator(".animate-spin")
  .waitFor({ timeout: 3000 })
  .then(() => true)
  .catch(() => false);
ok(pageSpin, "U13 深链清单页自动检测时整页「检查中」带 spinner");
const deepList = await p4
  .locator(".pcard", { hasText: "tdd" })
  .waitFor({ timeout: 5000 })
  .then(() => true)
  .catch(() => false);
ok(deepList, "U13b 深链自动检测完成后渲染双项清单");
await updCtx.close();

// ── 汇总 ───────────────────────────────────────────────────────────────────
console.log(`\n${passCount} pass, ${failCount} fail`);
await browser.close();
process.exit(failCount > 0 ? 1 : 0);
