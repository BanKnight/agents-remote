// M5-a 浮层族探针（v2 M5：03j 新建实例 / 03l 项目切换 / 03n 会话历史 / 02c pill 长按菜单）。
//
// 覆盖单测验不到的真实浏览器行为（DOM 几何硬数据，禁截图）：
//   Part 1 03l 切换 sheet：nav 标题 ▾ 点击 → .msheet + grp 分组头/搜索/newp 行 + 点分组头
//     关 sheet（同项目导航幂等）。
//   Part 2 03n 会话历史 sheet：nav ⋯ →「会话历史」→ filters 三态（全部 on）+ hrow 列表 +
//     「已结束」过滤空态。
//   Part 3 03j 新建实例 sheet：row2 ＋ → .msheet + srow/tile 36×36 + Claude 行点击 → 命名
//     prompt 弹窗。
//   Part 4 02c pill 长按菜单：CDP touch 长按 pill → 坐标菜单（置顶/重命名/关闭会话三项）+
//     合成 click 抑制（URL 不落 ?session）+ 桌面右键同菜单。
//
// 全 mock API（proj1 不依赖真实项目数据）；密码自读不进 agent 上下文、不打印值。
// 用法：bun scripts/probe-v2-m5-sheets.mjs

import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const ORIGIN = process.env.AR_WEB_ORIGIN ?? "http://127.0.0.1:43012";
const projectName = "proj1";

// 03n 行点击后的 resume POST 记录（P1 守卫：活跃态行不得触发 resume/新建）。
let resumePosts = [];

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
    projectName,
    provider: "claude",
    displayName: "Probe Agent A",
    status: "running",
    createdAt: "2026-07-26T00:00:00.000Z",
    updatedAt: "2026-09-20T10:00:00.000Z",
  },
  "agent_probe-2": {
    id: "agent_probe-2",
    projectName,
    provider: "claude",
    displayName: "Probe Agent B",
    status: "closed",
    createdAt: "2026-07-25T00:00:00.000Z",
    updatedAt: "2026-09-19T09:00:00.000Z",
    claudeSessionId: "c1aude-uuid-b",
  },
};

const CANDIDATES = [
  {
    type: "agent",
    projectName,
    sessionId: "agent_probe-1",
    displayName: "Probe Agent A",
    status: "running",
    provider: "claude",
    updatedAt: "2026-09-20T10:00:00.000Z",
    createdAt: "2026-07-26T00:00:00.000Z",
  },
  {
    type: "agent",
    projectName,
    sessionId: "agent_probe-2",
    displayName: "Probe Agent B",
    status: "closed",
    provider: "claude",
    updatedAt: "2026-09-19T09:00:00.000Z",
    createdAt: "2026-07-25T00:00:00.000Z",
  },
];

// ── mock 基座 ────────────────────────────────────────────────────────────────
async function setupM5Mocks(page) {
  const json = (body) => ({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
  await page.route(/\/api\/overview$/, (r) =>
    r.fulfill(json({ projectNames: [projectName], candidates: CANDIDATES })),
  );
  await page.route(new RegExp(`/api/projects/${projectName}/agent-sessions(?:\\?.*)?$`), (r) =>
    r.fulfill(json({ sessions: Object.values(AGENTS) })),
  );
  await page.route(/\/api\/state\/overview\/pinned-sessions$/, (r) =>
    r.fulfill(json({ sessions: [] })),
  );
  await page.route(/\/api\/state\/overview\/pinned-sessions\/[^/]+$/, (r) =>
    r.fulfill(json({ sessions: [] })),
  );
  // 03l newp → 08 sheet 的创建端点（不真正创建，Part 3 只断言 sheet 结构）。
  await page.route(/\/api\/projects$/, (r) =>
    r.fulfill(json({ project: { name: "proj-new", path: "/tmp/proj-new" } })),
  );
  // 03n 数据源 = agent-history 单一管道（M8：MobileSessionHistorySheet 弃 listAgentSessions，
  // 与桌面 history tab 同源）。running 条目 = hasActiveSession + activeSessionId。
  await page.route(new RegExp(`/api/projects/${projectName}/agent-history(?:\\?.*)?$`), (r) =>
    r.fulfill(
      json({
        entries: [
          {
            provider: "claude",
            claudeSessionId: "c1aude-uuid-a",
            title: "Probe Agent A",
            firstMessage: "hello",
            startedAt: "2026-09-20T09:00:00.000Z",
            lastActivityAt: "2026-09-20T10:00:00.000Z",
            fileSize: 1024,
            hasActiveSession: true,
            activeSessionId: "agent_probe-1",
          },
          {
            provider: "claude",
            claudeSessionId: "c1aude-uuid-b",
            title: "Probe Agent B",
            firstMessage: "world",
            startedAt: "2026-09-19T08:00:00.000Z",
            lastActivityAt: "2026-09-19T09:00:00.000Z",
            fileSize: 2048,
            hasActiveSession: false,
          },
        ],
      }),
    ),
  );
  // 03n closed 行 resume = createAgentSession POST（记录次数：P1 守卫断言用）。
  await page.route(new RegExp(`/api/projects/${projectName}/agent-sessions$`), (r) => {
    if (r.request().method() === "POST") {
      resumePosts.push(JSON.parse(r.request().postData() ?? "{}"));
      return r.fulfill(json({ session: AGENTS["agent_probe-2"] }));
    }
    return r.fulfill(json({ sessions: Object.values(AGENTS) }));
  });
  // session 面板 WS（fake session → error，panel 容器仍渲染）。
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
await setupM5Mocks(page);
await login(page);

// ── Part 1: 03l 切换 sheet ──────────────────────────────────────────────────
console.log("Part 1: 03l 切换 sheet（nav 标题 ▾）");
await page.goto(`${ORIGIN}/projects/${projectName}/session/agent_probe-1`);
await page.waitForSelector(".pills .pill", { timeout: 10000 });
// nav 标题（▾ button）点击开 sheet。标题 button 内含 .sw 指示符。
await page.locator(".nav h1 button").click();
await page.waitForSelector(".msheet", { timeout: 5000 });
ok(await page.locator(".msheet").isVisible(), "03l .msheet 可见");
ok(
  (await page.locator(".msheet .shd h2").textContent())?.includes("切换") === true,
  "shd 标题「切换」",
);
const grpText = await page.locator(".msheet .grp").first().textContent();
ok(grpText?.includes(projectName) === true, `grp 分组头含项目名（${grpText?.trim()}）`);
ok((await page.locator(".msheet .sess").count()) === 2, "sess 行 = 2（活跃候选）");
ok(
  (await page.locator(".msheet .sess.on").count()) === 1,
  "当前会话 .sess.on 高亮恰 1（agent_probe-1 聚焦）",
);
// 搜索过滤（编号③：match 项目名 + 会话名）。
await page.locator(".msheet input").fill("Probe Agent B");
await page.waitForTimeout(200);
ok((await page.locator(".msheet .sess").count()) === 1, "搜索「Probe Agent B」过滤后 sess = 1");
await page.locator(".msheet input").fill("");
await page.waitForTimeout(200);
// newp 行存在。
ok(
  (await page.locator(".msheet .newp").textContent())?.includes("新建 / 采用项目") === true,
  "newp 行「新建 / 采用项目」",
);
// 点分组头 = 只切项目（同项目幂等）：sheet 关闭 + URL 仍在本项目。
await page.locator(".msheet .grp").first().click();
await page.waitForTimeout(400);
ok((await page.locator(".msheet").count()) === 0, "点分组头后 sheet 关闭");
ok(
  page.url().includes(`/projects/${projectName}`),
  `URL 仍在本项目（${page.url().split("/").pop()}）`,
);

// ── Part 2: 03n 会话历史 sheet ──────────────────────────────────────────────
console.log("Part 2: 03n 会话历史 sheet（nav ⋯ 菜单）");
await page.locator('.nav button[aria-label="更多操作"]').click();
await page.waitForTimeout(300);
const historyItem = page.getByRole("menuitem", { name: "会话历史" });
ok(await historyItem.isVisible(), "⋯ 菜单含「会话历史」项");
await historyItem.click();
await page.waitForSelector(".msheet", { timeout: 5000 });
ok(
  await page
    .locator(".msheet .shd h2")
    .textContent()
    .then((v) => v?.includes("会话历史")),
  "标题「会话历史」",
);
ok(
  (await page.locator(".msheet .shd .aside").textContent())?.includes(projectName) === true,
  "shd aside = 项目名",
);
ok((await page.locator(".msheet .fc").count()) === 3, "filters 三态 = 3 个 fc");
const fcOn = await page.locator(".msheet .fc.on").textContent();
ok(fcOn?.includes("全部") === true, `默认 filter on = 全部（${fcOn?.trim()}）`);
ok((await page.locator(".msheet .hrow").count()) === 2, "hrow = 2（全部）");
// 已结束过滤 → 1 行（agent_probe-2 closed）。
await page.locator(".msheet .fc", { hasText: "已结束" }).click();
await page.waitForTimeout(200);
ok((await page.locator(".msheet .hrow").count()) === 1, "「已结束」过滤 hrow = 1");
// 进行中过滤 → 1 行；空过滤组「已结束」→…保持简单：进行中过滤 + 运行中 st。
await page.locator(".msheet .fc", { hasText: "进行中" }).click();
await page.waitForTimeout(200);
ok((await page.locator(".msheet .hrow").count()) === 1, "「进行中」过滤 hrow = 1");
const stText = await page.locator(".msheet .hrow .st").first().textContent();
ok(stText?.includes("运行中") === true, `运行中行 st 含「运行中」（${stText?.trim()}）`);
// P1 守卫：活跃态（running）行点击 = 聚焦既有实例，不得 resume（否则新建重复实例）。
resumePosts = [];
await page.locator(".msheet .hrow").first().click();
await page.waitForTimeout(400);
ok(resumePosts.length === 0, `running 行点击不 resume（POST 数 ${resumePosts.length}）`);
ok((await page.locator(".msheet").count()) === 0, "running 行点击关 sheet（聚焦既有实例路径）");
// P2-5/6 状态层级：running 行 r1 字重 600、无 idle/end 变体；closed 行 400 且无 dot。
await page.locator('.nav button[aria-label="更多操作"]').click();
await page.waitForTimeout(300);
await page.getByRole("menuitem", { name: "会话历史" }).click();
await page.waitForSelector(".msheet", { timeout: 5000 });
// 过滤复位到「全部」（上一段停在「进行中」，closed 行不在 DOM）。
await page.locator(".msheet .fc", { hasText: "全部" }).click();
await page.waitForTimeout(200);
const runningRow = page.locator(".msheet .hrow").filter({ hasText: "Probe Agent A" });
const closedRow = page.locator(".msheet .hrow").filter({ hasText: "Probe Agent B" });
ok((await runningRow.getAttribute("class"))?.includes("idle") === false, "running 行无 idle 变体");
ok(
  (await closedRow.getAttribute("class"))?.includes("end") === true,
  "closed 行挂 end 变体（P2-5 状态层级）",
);
const runningWeight = await runningRow
  .locator(".r1")
  .evaluate((el) => getComputedStyle(el).fontWeight);
const closedWeight = await closedRow
  .locator(".r1")
  .evaluate((el) => getComputedStyle(el).fontWeight);
ok(runningWeight === "600", `running 行 r1 字重 600（实测 ${runningWeight}）`);
ok(closedWeight === "400", `closed 行 r1 字重 400（实测 ${closedWeight}，P2-5 生效）`);
ok((await runningRow.locator(".r1 .dot").count()) === 1, "running 行有 dot");
ok((await closedRow.locator(".r1 .dot").count()) === 0, "closed 行无 dot（P2-6）");
// P2-6/P1：closed 行点击 = 命名 prompt（M8：与桌面 history-list 同语义，预填 title）
// → 确认后 resume（唯一允许 resume 的态）。
resumePosts = [];
await closedRow.click();
await page.waitForSelector("[data-prompt-input]", { timeout: 5000 });
ok(
  (await page.locator("[data-prompt-input]").inputValue()) === "Probe Agent B",
  "closed 行 prompt 预填 title",
);
// 输入框 Enter = 确认（prompt-dialog onKeyDown；避开底部 sheet 进出动画期的 click 稳定性）。
await page.locator("[data-prompt-input]").press("Enter");
await page.waitForTimeout(600);
ok(resumePosts.length === 1, `closed 行确认后 resume（POST 数 ${resumePosts.length}）`);
ok(resumePosts[0]?.claudeSessionId === "c1aude-uuid-b", "resume 带 claudeSessionId");
// 重新打开供后续 Part 断言（Esc 关）。
await page.locator('.nav button[aria-label="更多操作"]').click();
await page.waitForTimeout(300);
await page.getByRole("menuitem", { name: "会话历史" }).click();
await page.waitForSelector(".msheet", { timeout: 5000 });
// hfoot。
ok(await page.locator(".msheet .hfoot").isVisible(), "hfoot 可见");
// 关闭 sheet（Esc）。
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
ok((await page.locator(".msheet").count()) === 0, "Esc 关闭 03n");

// ── Part 3: 03j 新建实例 sheet ──────────────────────────────────────────────
console.log("Part 3: 03j 新建实例 sheet（row2 ＋）");
await page.locator('button[aria-label="新建会话"]').click();
await page.waitForSelector(".msheet", { timeout: 5000 });
ok(await page.locator(".msheet").isVisible(), "03j .msheet 可见");
ok(
  (await page.locator(".msheet .shd h2").textContent())?.includes("新建实例") === true,
  "标题「新建实例」",
);
ok((await page.locator(".msheet .srow").count()) === 3, "srow = 3（Claude/OMP/终端，诚实呈现）");
ok((await page.locator(".msheet .slabel").count()) === 2, "slabel 分组 = 2（AGENT/TERMINAL）");
const tileBox = await page.locator(".msheet .tile").first().boundingBox();
ok(
  tileBox?.width === 36 && tileBox?.height === 36,
  `tile 36×36（${tileBox?.width}×${tileBox?.height}）`,
);
ok(
  (await page.locator(".msheet .srow").first().textContent())?.includes("Claude") === true,
  "首行 = Claude",
);
// Claude 行点击 → sheet 关 + 命名 prompt 弹窗。
await page.locator(".msheet .srow").first().click();
await page.waitForTimeout(600);
ok((await page.locator(".msheet").count()) === 0, "点 Claude 行后 sheet 关闭");
ok(
  await page.locator('[role="alertdialog"], [role="dialog"]').last().isVisible(),
  "命名 prompt 弹窗可见",
);
// 取消 prompt。
await page.getByRole("button", { name: "取消" }).click();
await page.waitForTimeout(300);

// ── Part 4: 02c pill 长按菜单 ───────────────────────────────────────────────
console.log("Part 4: 02c pill 长按菜单（touch 长按 + 右键）");
await page.goto(`${ORIGIN}/projects/${projectName}/session/agent_probe-1`);
await page.waitForSelector(".pills .pill", { timeout: 10000 });
const pill = page.locator(".pills .pill", { hasText: "Probe Agent A" }).first();
const pb = await pill.boundingBox();
ok(pb !== null, "pill 可定位");
// CDP touch 长按 700ms（> LONG_PRESS_MS=500）。
const cdp = await ctx.newCDPSession(page);
await cdp.send("Input.dispatchTouchEvent", {
  type: "touchStart",
  touchPoints: [{ x: pb.x + pb.width / 2, y: pb.y + pb.height / 2, force: 1 }],
});
await page.waitForTimeout(700);
await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
await page.waitForTimeout(300);
ok(await page.getByRole("menuitem", { name: "重命名" }).isVisible(), "长按 pill → 菜单「重命名」");
ok(await page.getByRole("menuitem", { name: "置顶" }).isVisible(), "菜单「置顶」");
ok(
  await page.getByRole("menuitem", { name: "关闭会话…" }).isVisible(),
  "菜单「关闭会话」（destructive）",
);
ok(
  !page.url().includes("session=agent_probe-2") || page.url().includes("session=agent_probe-1"),
  "长按未误触导航（URL 保持聚焦 agent_probe-1）",
);
// 关菜单（Esc）→ 右键同菜单（02c 编号⑤：桌面右键同三项）。
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
await pill.click({ button: "right" });
await page.waitForTimeout(300);
ok(await page.getByRole("menuitem", { name: "重命名" }).isVisible(), "右键 →「重命名」");
ok(await page.getByRole("menuitem", { name: "置顶" }).isVisible(), "右键 →「置顶」");
await page.keyboard.press("Escape");
await page.waitForTimeout(200);

console.log(`\n结果: ${passCount} pass / ${failCount} fail`);
await browser.close();
if (failCount > 0) process.exit(1);
