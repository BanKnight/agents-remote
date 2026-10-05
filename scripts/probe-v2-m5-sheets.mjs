// M5-a 浮层族探针（v1.5 批1 换代：▾ 实例切换菜单 / 03n 会话历史 / 03j 新建实例 / 实例信息）。
//
// 覆盖单测验不到的真实浏览器行为（DOM 几何硬数据，禁截图）：
//   Part 1 ▾ 实例切换菜单：nav 标题（= 实例名）点击 → DropdownMenu 锚定浮卡（组头「切换
//     实例」+ 实例行状态/✓ + 钉底 ＋新建/⟲恢复历史）+ 点实例行切换导航；03l sheet 退役。
//   Part 2 03n 会话历史 sheet：nav ⋯ →「会话历史」→ filters 三态（全部 on）+ hrow 列表 +
//     「已结束」过滤空态。
//   Part 3 03j 新建实例 sheet：▾ 菜单钉底「＋ 新建实例…」→ .msheet + srow/tile 36×36 +
//     Claude 行点击 → 命名 prompt 弹窗（row2 ＋ 已退役）。
//   Part 4 ⋯ › 实例信息 → info sheet .acts 动作行（重命名/置顶/关闭三按钮；02c pill 长按
//     菜单随 pills 退役，操作入口唯一）。
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
          // filler 5 条已结束更早条目（触发折叠窗口：全部 = 7 条显 5）。
          ...Array.from({ length: 5 }, (_, i) => ({
            provider: "claude",
            claudeSessionId: `c1aude-filler-${i + 1}`,
            title: `Probe Old ${i + 1}`,
            firstMessage: `old ${i + 1}`,
            startedAt: new Date(Date.UTC(2026, 8, 18 - i, 8)).toISOString(),
            lastActivityAt: new Date(Date.UTC(2026, 8, 18 - i, 9)).toISOString(),
            fileSize: 512,
            hasActiveSession: false,
          })),
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

// ── Part 1: ▾ 实例切换菜单（v1.5 workspace-instance-switch，03l sheet 退役）──
console.log("Part 1: ▾ 实例切换菜单（nav 标题 ▾ 锚定浮卡）");
await page.goto(`${ORIGIN}/projects/${projectName}/session/agent_probe-1`);
await page.waitForSelector(".nav h1 button", { timeout: 10000 });
// 行1 标题 = 当前实例名（非项目名）；detail/list query 就绪后标题收敛 displayName
//（首帧回落 id 属预期瞬态）——等收敛再断言。probe-1 running → runct ●1。
await page
  .waitForFunction(
    () => document.querySelector(".nav h1 button")?.textContent?.includes("Probe Agent A"),
    undefined,
    { timeout: 8000 },
  )
  .catch(() => {});
const navTitle = await page.locator(".nav h1 button").textContent();
ok(navTitle?.includes("Probe Agent A") === true, `标题 = 实例名（「${navTitle?.trim()}」）`);
ok(navTitle?.includes(projectName) === false, "标题非项目名（单会话化）");
ok(
  (await page.locator(".nav .runct").textContent())?.includes("1") === true,
  "runct ●1（probe-1 running）",
);
// 点标题 → DropdownMenu 浮卡（族A 锚定型，非 .msheet）。
await page.locator(".nav h1 button").click();
await page.getByRole("menuitem").first().waitFor({ timeout: 5000 });
ok((await page.locator(".msheet").count()) === 0, "▾ 开浮卡非 sheet（03l sheet 已退役）");
// 组头「切换实例」+ 实例行（图标 + 名 + 状态文案 + 当前行 ✓）。
const grpText = await page.evaluate(() => {
  const menu = [...document.querySelectorAll('[role="menu"]')].at(-1);
  return menu?.querySelector("div")?.textContent ?? "";
});
ok(grpText.includes("切换实例") === true, `组头「切换实例」（「${grpText.trim()}」）`);
ok((await page.getByRole("menuitem", { name: /Probe Agent A/ }).count()) === 1, "实例行 A 在");
ok((await page.getByRole("menuitem", { name: /Probe Agent B/ }).count()) === 1, "实例行 B 在");
const rowA = page.getByRole("menuitem", { name: /Probe Agent A/ });
ok((await rowA.textContent())?.includes("运行中") === true, "实例行含状态文案（运行中）");
ok((await rowA.locator("svg").count()) >= 1, "实例行类型图标在");
const ckCount = await page.evaluate(() => {
  const menu = [...document.querySelectorAll('[role="menu"]')].at(-1);
  return [...(menu?.querySelectorAll('[role="menuitem"]') ?? [])].filter((el) =>
    el.textContent?.includes("✓"),
  ).length;
});
ok(ckCount === 1, `当前行 ✓ 恰 1（agent_probe-1 聚焦；实际 ${ckCount}）`);
// 钉底两行动作。
const pinNew = page.getByRole("menuitem", { name: /新建实例/ });
const pinResume = page.getByRole("menuitem", { name: /恢复历史会话/ });
ok((await pinNew.count()) === 1, "钉底「＋ 新建实例…」");
ok((await pinResume.count()) === 1, "钉底「⟲ 恢复历史会话…」");
// 点实例行 B → 导航切换（保活层语义由 probe-mobile-project-header 覆盖）。
await page.getByRole("menuitem", { name: /Probe Agent B/ }).click();
await page.waitForURL(/session\/agent_probe-2/, { timeout: 8000 });
ok(true, "点实例行 B → URL 切至 agent_probe-2");
await page.waitForTimeout(400);
// 菜单已关、标题跟随。
ok((await page.getByRole("menuitem").count()) === 0, "选择后菜单关闭");
const title2 = await page.locator(".nav h1 button").textContent();
ok(title2?.includes("Probe Agent B") === true, `标题跟随切换（「${title2?.trim()}」）`);

// ── Part 2: 03n 会话历史 sheet ──────────────────────────────────────────────
console.log("Part 2: 03n 会话历史 sheet（nav ⋯ 菜单）");
await page.locator('.nav button[aria-label="更多操作"]').click();
await page.waitForTimeout(300);
const historyItem = page.getByRole("menuitem", { name: "会话历史" });
ok(await historyItem.isVisible(), "⋯ 菜单含「会话历史」项");
await historyItem.click();
// 菜单 sheet 的 exit 动画未结束时会话历史 sheet 已打开（双 sheet 共存窗口）——
// 等待条件收窄到目标 sheet 标题，防 .msheet .shd h2 命中残留菜单。
await page.waitForSelector('.msheet .shd h2:has-text("会话历史")', { timeout: 5000 });
ok(
  await page
    .locator('.msheet .shd h2:has-text("会话历史")')
    .textContent()
    .then((v) => v?.includes("会话历史")),
  "标题「会话历史」",
);
ok(
  (await page.locator(".msheet .shd .aside").textContent())?.includes(projectName) === true,
  "shd aside = 项目名",
);
ok(
  (await page.locator(".msheet .filters .fc").count()) === 3,
  "filters 三态 = 3 个 fc（.filters 限定：展开按钮已挂 fc ghost 回归单源，不混入计数）",
);
const fcOn = await page.locator(".msheet .filters .fc.on").textContent();
ok(fcOn?.includes("全部") === true, `默认 filter on = 全部（${fcOn?.trim()}）`);
ok(
  (await page.locator(".msheet .hrow").count()) === 5,
  "hrow = 5（折叠窗口：全部 7 条显 5，桌面同款行为）",
);
// 已结束过滤 → 切过滤重置窗口，6 条已结束显 5。
await page.locator(".msheet .fc", { hasText: "已结束" }).click();
await page.waitForTimeout(200);
ok((await page.locator(".msheet .hrow").count()) === 5, "「已结束」过滤 hrow = 5（6 条重置窗口）");
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
// 等目标 sheet 标题而非任意 .msheet（菜单 sheet exit 动画期双 sheet 共存窗口）。
await page.waitForSelector('.msheet .shd h2:has-text("会话历史")', { timeout: 5000 });
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
// 折叠展开（与桌面同款 useHistoryRecentWindow 行为）：复位「全部」重置窗口 5 → 展开全显 7。
const earlyBtn = page.locator(".msheet button", { hasText: "展开更早" });
ok((await earlyBtn.count()) === 1, "「展开更早」按钮在（折叠窗口 7 条显 5）");
await earlyBtn.click();
await page.waitForTimeout(200);
ok((await page.locator(".msheet .hrow").count()) === 7, "展开后 hrow = 7（全量，按钮消失）");
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
// 等目标 sheet 标题而非任意 .msheet（菜单 sheet exit 动画期双 sheet 共存窗口）。
await page.waitForSelector('.msheet .shd h2:has-text("会话历史")', { timeout: 5000 });
// hfoot。
ok(await page.locator(".msheet .hfoot").isVisible(), "hfoot 可见");
// 关闭 sheet（Esc）。
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
ok((await page.locator(".msheet").count()) === 0, "Esc 关闭 03n");

// ── Part 3: 03j 新建实例 sheet ──────────────────────────────────────────────
console.log("Part 3: 03j 新建实例 sheet（▾ 菜单钉底「＋ 新建实例…」，row2 ＋ 已退役）");
await page.locator(".nav h1 button").click();
await page.getByRole("menuitem", { name: /新建实例/ }).click();
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
// Claude 行点击 → sheet 关 + 命名 prompt 弹窗。prompt 自身也是 .msheet（§6.12n 迁移后），
// 关闭断言收窄到 03j 标题（prompt 在场时 .msheet count 恒 >0，宽断言必挂）。
await page.locator(".msheet .srow").first().click();
await page.waitForTimeout(600);
ok(
  (await page.locator('.msheet .shd h2:has-text("新建实例")').count()) === 0,
  "点 Claude 行后 sheet 关闭",
);
ok(
  await page.locator('[role="alertdialog"], [role="dialog"]').last().isVisible(),
  "命名 prompt 弹窗可见",
);
// 取消 prompt。
await page.getByRole("button", { name: "取消" }).click();
await page.waitForTimeout(300);

// ── Part 4: ⋯ › 实例信息 sheet（v1.5：pill 长按菜单退役，操作收进 info .acts footer）──
console.log("Part 4: ⋯ 菜单「实例信息」→ info sheet .acts 动作行（重命名/置顶/关闭）");
await page.goto(`${ORIGIN}/projects/${projectName}/session/agent_probe-1`);
await page.waitForSelector(".nav h1 button", { timeout: 10000 });
const cdp = await ctx.newCDPSession(page);
await page.locator('button[aria-label="更多操作"]').click();
await page.getByRole("menuitem", { name: "实例信息" }).click();
await page.waitForSelector('.msheet .shd h2:has-text("实例信息")', { timeout: 5000 });
ok(true, "⋯ → 实例信息 → info sheet 打开");
// .acts footer 三按钮（useInstanceRowActions 单源装配：置顶仅 agent；关闭 = destructive 红）。
// 定位收窄到 info sheet dialog（菜单 sheet exit 动画期双 .msheet 共存窗口，Part 2 同款）。
const actsText = await page.getByRole("dialog", { name: "实例信息" }).evaluate((el) => {
  const footer = [...el.querySelectorAll("div")].find((d) =>
    [...d.querySelectorAll("button")].some((b) => b.textContent?.includes("重命名")),
  );
  return footer
    ? [...footer.querySelectorAll("button")].map((b) => ({
        label: b.textContent?.trim(),
        color: getComputedStyle(b).color,
      }))
    : [];
});
ok(actsText.length === 3, `.acts 三按钮（重命名/置顶/关闭；实际 ${actsText.length}）`);
ok(actsText.some((b) => b.label?.includes("置顶")) === true, "置顶按钮在（agent 实例）");
const closeBtn = actsText.find((b) => b.label?.includes("关闭"));
ok(
  (closeBtn?.color ?? "") !== "" && (closeBtn?.color ?? "") !== "rgb(0, 0, 0)",
  `关闭按钮有 destructive 着色（color=${closeBtn?.color}）`,
);
// sheet 关闭（Esc）→ 无残留。
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
ok((await page.locator(".msheet").count()) === 0, "Esc 关闭实例信息 sheet");

// ── Part 5: 下拉收起手势（touch 拖拽跟手 + dismiss 从松手位置滑出，不回弹） ────
// 覆盖用户反馈回归两轮：①拖拽期跟手（CDP touch 序列逐步断言 transform = 位移）；
// ②dismiss 分支曾清 inline transform → sheet 瞬跳回原位再播 exit 动画（「回弹后再
// 消失」）——修复后 exit keyframes 无 from、起点 = 当前 inline 位置，松手后 rect.top
// 保持在拖拽位置附近并继续增大（滑出），最终卸载且重开无 inline 残留。
console.log("Part 5: 下拉收起（touch 拖拽跟手 + >96px 松手 → 从松手位置滑出不回弹）");
// v1.5 批1：▾ 开 DropdownMenu 浮卡（非 sheet）——手势测的通用 .msheet 改走 ⋯ › 会话历史。
await page.locator('button[aria-label="更多操作"]').click();
await page.getByRole("menuitem", { name: "会话历史" }).click();
await page.waitForSelector('.msheet .shd h2:has-text("会话历史")', { timeout: 5000 });
await page.waitForTimeout(300); // 等 enter 动画（slide-in-from-bottom-4 200ms）播完再取基准。
const baseTop = await page
  .locator(".msheet")
  .first()
  .evaluate((el) => el.getBoundingClientRect().top);
const shd = page.locator(".msheet .shd").first();
const sb = await shd.boundingBox();
const cx = sb.x + sb.width / 2;
const cy = sb.y + sb.height / 2;
// touch 序列驱动（贴近真机输入形态；CDP touch 派生 pointer events，Part 4 同款）。
await cdp.send("Input.dispatchTouchEvent", {
  type: "touchStart",
  touchPoints: [{ x: cx, y: cy, force: 1 }],
});
for (let i = 1; i <= 3; i++) {
  // 分步拖拽，每步断言跟手（transform = 累计位移）——守护「拖不动/不跟手」回归
  //（WebKit 滚动手势 pointercancel 打断在 Chromium touch 模拟下不复现，真机项保留手动清单）。
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: cx, y: cy + i * 20, force: 1 }],
  });
  const tf = await page
    .locator(".msheet")
    .first()
    .evaluate((el) => el.style.transform)
    .catch(() => "gone");
  ok(tf === `translateY(${i * 20}px)`, `touch 拖拽跟手（+${i * 20}px → transform "${tf}"）`);
}
for (let i = 4; i <= 7; i++) {
  // 拖到累计 140px（> DISMISS_DISTANCE_PX=96）。
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: cx, y: cy + i * 20, force: 1 }],
  });
}
await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
// 松手后立刻采样：sheet 仍在且 top 保持在拖拽位置附近（bug 版此处已跳回 ≈ baseTop）。
// isConnected 守卫：exit 动画播完卸载的瞬间 evaluate 可能拿到 detached handle，
// getBoundingClientRect() 返回全 0 而非抛错——按已卸载（null）处理。
const t0 = await page
  .locator(".msheet")
  .first()
  .evaluate((el) => (el.isConnected ? el.getBoundingClientRect().top : null))
  .catch(() => null);
ok(t0 !== null, "松手后 sheet 仍在（exit 动画期未卸载）");
ok(
  t0 !== null && t0 >= baseTop + 100,
  `松手后不回弹（top ${Math.round(t0 ?? -1)} ≥ 原位+100，原位 ${Math.round(baseTop)}）`,
);
await page.waitForTimeout(120);
const t1 = await page
  .locator(".msheet")
  .first()
  .evaluate((el) => (el.isConnected ? el.getBoundingClientRect().top : null))
  .catch(() => null);
ok(
  t1 === null || t1 > (t0 ?? 0) + 20,
  `松手后继续滑出（+120ms top ${t1 === null ? "已卸载" : Math.round(t1)} > ${Math.round(t0 ?? -1)}+20）`,
);
await page.waitForTimeout(500);
ok((await page.locator(".msheet").count()) === 0, "拖拽 dismiss 后 sheet 卸载（消费方关闭完成）");
// 重开无 inline 残留：Radix Portal 重挂载为全新 DOM，top 回原位、无 inline transform。
await page.locator('button[aria-label="更多操作"]').click();
await page.getByRole("menuitem", { name: "会话历史" }).click();
await page.waitForSelector('.msheet .shd h2:has-text("会话历史")', { timeout: 5000 });
await page.waitForTimeout(300);
const reopen = await page
  .locator(".msheet")
  .first()
  .evaluate((el) => ({
    top: el.getBoundingClientRect().top,
    inlineTransform: el.style.transform,
  }));
ok(
  Math.abs(reopen.top - baseTop) < 5 && reopen.inlineTransform === "",
  `重开回原位无残留（top 偏差 ${Math.round(reopen.top - baseTop)}px < 5，inline transform "${reopen.inlineTransform}"）`,
);
await page.keyboard.press("Escape");
await page.waitForTimeout(400);

console.log(`\n结果: ${passCount} pass / ${failCount} fail`);
await browser.close();
if (failCount > 0) process.exit(1);
