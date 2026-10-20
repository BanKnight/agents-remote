// M5-a 浮层族探针（v1.5 批1 换代：▾ 实例切换菜单 / 03n 会话历史 / 03j 新建实例 / 实例信息）。
//
// 覆盖单测验不到的真实浏览器行为（DOM 几何硬数据，禁截图）：
//   Part 1 ▾ 实例切换菜单：nav 标题（= 实例名）点击 → DropdownMenu 锚定浮卡（组头「切换
//     实例」+ 实例行状态/✓ + 钉底 ＋新建/⟲恢复历史）+ 点实例行切换导航；03l sheet 退役。
//   Part 2 03n 会话历史 sheet：nav ⋯ →「会话历史」→ filters 三态（全部 on）+ hrow 列表 +
//     「已结束」过滤空态。
//   Part 3 03j 新建实例 sheet：▾ 菜单钉底「＋ 新建实例…」→ .msheet + srow/tile 36×36 +
//     Claude 行点击 → 命名 prompt 弹窗（row2 ＋ 已退役）。
//   Part 4 ⋯ 菜单动作区（置顶/重命名/关闭 destructive）+ 实例信息 = 纯信息面板（.acts
//     footer 随 v1.6 动作上收退役）。
//   Part 6 03h 空态卡「从历史恢复」入口（2026-10-19）：空项目（无实例）→ .empty-card 双按钮
//     （主 CTA filled + tinted 次按钮同几何带图标）→ 点次按钮开 03n + 空提示「暂无会话」。
//
// 全 mock API（proj1 不依赖真实项目数据）；密码自读不进 agent 上下文、不打印值。
// 用法：bun scripts/probe-v2-m5-sheets.mjs

import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const ORIGIN = process.env.AR_WEB_ORIGIN ?? "http://127.0.0.1:43012";
const projectName = "proj1";

// 03n 行点击后的 resume POST 记录（P1 守卫：活跃态行不得触发 resume/新建）。
let resumePosts = [];
// 03n 规模化管道（v1.5 批5）：agent-history GET 记录（cursor/search 断言）+ 删除追踪
//（DELETE 后 GET 排除已删条目，模拟服务端真删）。
let historyUrls = [];
let deletePosts = [];
let deletedHistoryIds = new Set();

/** 相对时间 ISO（天数回溯，hoursBack 再回退小时——active 条目 = 今天组）。 */
const isoDaysAgo = (days, hoursBack = 0) =>
  new Date(Date.now() - days * 86_400_000 - hoursBack * 3_600_000).toISOString();

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
  // 03n 数据源 = agent-history 规模化管道（v1.5 批5：服务端 filter/search/cursor + counts
  // 聚合 + 删除追踪）。mock 页大小 12（首页 12 条撑出 sheet 溢出，触发「滚动到底自动 +20」
  // 路径）；counts 按 shared 语义 = search 后 filter 前聚合（切段不闪计数）。
  deletedHistoryIds = new Set();
  const historyAll = [
    { id: "c1aude-uuid-a", title: "Probe Agent A", active: true, daysAgo: 0 },
    { id: "c1aude-uuid-b", title: "Probe Agent B", daysAgo: 1 },
    ...Array.from({ length: 3 }, (_, i) => ({
      id: `c1aude-week-${i + 1}`,
      title: `Probe Week ${i + 1}`,
      daysAgo: 2 + i * 2,
    })),
    ...Array.from({ length: 2 }, (_, i) => ({
      id: `c1aude-month-${i + 1}`,
      title: `Probe Month ${i + 1}`,
      daysAgo: 10 + i * 10,
    })),
    ...Array.from({ length: 10 }, (_, i) => ({
      id: `c1aude-old-${i + 1}`,
      title: `Probe Old ${i + 1}`,
      daysAgo: 35 + i * 8,
    })),
  ];
  await page.route(new RegExp(`/api/projects/${projectName}/agent-history(?:\\?.*)?$`), (r) => {
    const params = new URL(r.request().url()).searchParams;
    const q = (params.get("search") ?? "").toLowerCase();
    const searched = historyAll
      .filter((e) => !deletedHistoryIds.has(e.id))
      .map((e) => ({
        provider: "claude",
        claudeSessionId: e.id,
        title: e.title,
        firstMessage: e.title,
        startedAt: isoDaysAgo(e.daysAgo, e.active ? 2 : 1),
        lastActivityAt: isoDaysAgo(e.daysAgo),
        fileSize: 1024,
        hasActiveSession: Boolean(e.active),
        ...(e.active ? { activeSessionId: "agent_probe-1" } : {}),
      }))
      .filter((e) => !q || e.title.toLowerCase().includes(q));
    let list = searched;
    if (params.get("filter") === "active") list = list.filter((e) => e.hasActiveSession);
    if (params.get("filter") === "ended") list = list.filter((e) => !e.hasActiveSession);
    historyUrls.push(r.request().url());
    const offset = Number(params.get("cursor") ?? "") || 0;
    const size = 12;
    return r.fulfill(
      json({
        entries: list.slice(offset, offset + size),
        counts: {
          all: searched.length,
          active: searched.filter((e) => e.hasActiveSession).length,
          ended: searched.filter((e) => !e.hasActiveSession).length,
        },
        nextCursor: offset + size < list.length ? String(offset + size) : null,
        filter: params.get("filter") ?? "all",
      }),
    );
  });
  // 03n 左滑删除端点（DELETE /agent-history/:id?provider=）：追踪 + GET 随之排除已删。
  await page.route(new RegExp(`/api/projects/${projectName}/agent-history/[^/?]+`), (r) => {
    if (r.request().method() === "DELETE") {
      const id =
        r
          .request()
          .url()
          .match(/agent-history\/([^/?]+)/)?.[1] ?? "";
      deletedHistoryIds.add(decodeURIComponent(id));
      deletePosts.push({ id, url: r.request().url() });
      return r.fulfill(json({ ok: true }));
    }
    return r.fulfill(json({ error: { code: "METHOD_NOT_ALLOWED", message: "unsupported" } }, 405));
  });
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
// 2026-10-15 拍板：聚焦会话时 runct 数字徽标退役，改渲染会话状态点（.dot.run）。
ok((await page.locator(".nav .dot.run").count()) === 1, "聚焦会话状态点 = 运行中（.dot.run）");
// 点标题 → DropdownMenu 浮卡（族A 锚定型，非 .msheet）。
await page.locator(".nav h1 button").click();
await page.getByRole("menuitem").first().waitFor({ timeout: 5000 });
ok((await page.locator(".msheet").count()) === 0, "▾ 开浮卡非 sheet（03l sheet 已退役）");
// 组头「切换实例」+ 实例行（图标 + 名 + 状态文案 + 当前行 ✓）。
const grpText = await page.evaluate(() => {
  const menu = [...document.querySelectorAll('[role="menu"]')].at(-1);
  return menu?.querySelector("div")?.textContent ?? "";
});
ok(grpText.includes("切换实例") === true, `组头「切换实例」(「${grpText.trim()}」)`);
// 批 14 回归断言：本菜单 = 分区容器菜单（标题/滚动列表/钉底动作三分区，非行式）不挂
// .menu-sep——三分区无线，钉底两行动作与列表间的线由钉底容器自带 border-t 承担。
const partBorders = await page.evaluate(() => {
  const menu = [...document.querySelectorAll('[role="menu"]')].at(-1);
  return [...(menu?.children ?? [])].map((el) => ({
    bottom: getComputedStyle(el).borderBottomWidth,
    top: getComputedStyle(el).borderTopWidth,
  }));
});
ok(
  partBorders.length === 3 &&
    partBorders.slice(0, 2).every((b) => b.bottom === "0px") &&
    partBorders[2]?.bottom === "0px" &&
    partBorders[2]?.top === "1px",
  `三分区无线（分区容器不挂 .menu-sep；实际 ${JSON.stringify(partBorders)}）`,
);
ok((await page.getByRole("menuitem", { name: /Probe Agent A/ }).count()) === 1, "实例行 A 在");
ok((await page.getByRole("menuitem", { name: /Probe Agent B/ }).count()) === 1, "实例行 B 在");
const rowA = page.getByRole("menuitem", { name: /Probe Agent A/ });
ok((await rowA.textContent())?.includes("运行中") === true, "实例行含状态文案（运行中）");
ok((await rowA.locator("svg").count()) >= 1, "实例行类型图标在");
// v1.6 图例②：当前行 = 背景高亮 + aria-current（✓ 记号退役）。
const currentCount = await page.evaluate(() => {
  const menu = [...document.querySelectorAll('[role="menu"]')].at(-1);
  return [...(menu?.querySelectorAll('[role="menuitem"][aria-current="true"]') ?? [])].length;
});
ok(currentCount === 1, `当前行 aria-current 恰 1（agent_probe-1 聚焦；实际 ${currentCount}）`);
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
// 搜索框（03n 编号③）：placeholder + 受控 input。
ok(
  (await page.locator('.msheet input[placeholder="搜索历史会话"]').count()) === 1,
  "搜索框在（placeholder 搜索历史会话）",
);
// 移动浮层不再提供进行中/已结束筛选段（2026-10-19 拍板：直接展示全部）。
ok((await page.locator(".msheet .segc").count()) === 0, "移动历史浮层无 .segc 筛选段");
// 分组组头：「最近」置顶 + 五档时间组（mock 前 7 条被剥入最近组，其余 5 条全为更早）。
const ghTexts = await page.locator(".msheet .gh").allTextContents();
ok(
  JSON.stringify(ghTexts) === JSON.stringify(["最近", "今天", "昨天", "7 天内", "30 天内", "更早"]),
  `组头 = 最近 + 原有五档（got ${JSON.stringify(ghTexts)}）`,
);
ok(
  (await page.locator(".msheet .gh").first().locator("xpath=..").locator(".hrow").count()) === 7,
  "「最近」组 = 最近 7 条（RECENT_GROUP_SIZE）",
);
ok(
  (await page.locator(".msheet .hrow").count()) === 19,
  "hrow = 19（首页 12 条 + 最近组附加 7 条）",
);
// 游标三态（首页）：hasNextPage = 哨兵在场、「没有更多」不在。
ok((await page.locator("[data-history-tail]").count()) === 1, "游标哨兵在场（hasNextPage）");
ok(
  (await page.locator(".msheet", { hasText: "没有更多" }).count()) === 0,
  "「没有更多」不在（还有下一页）",
);
// P1 守卫：活跃态（running）行点击 = 聚焦既有实例，不得 resume（否则新建重复实例）。
resumePosts = [];
await page.locator(".msheet .hrow").first().click();
await page.waitForTimeout(400);
ok(resumePosts.length === 0, `running 行点击不 resume（POST数 ${resumePosts.length}）`);
ok((await page.locator(".msheet").count()) === 0, "running 行点击关 sheet（聚焦既有实例路径）");
// 重开（移动恒展示全部，无筛选态需复位）。
await page.locator('.nav button[aria-label="更多操作"]').click();
await page.waitForTimeout(300);
await page.getByRole("menuitem", { name: "会话历史" }).click();
await page.waitForSelector('.msheet .shd h2:has-text("会话历史")', { timeout: 5000 });
// P2-5/6 状态层级：running 行 r1 字重 600、无 end 变体；closed 行 400 且无 dot。
// 「最近」组与时间组各含一份（附加展示），断言取首次出现。
const runningRow = page.locator(".msheet .hrow").filter({ hasText: "Probe Agent A" }).first();
const closedRow = page.locator(".msheet .hrow").filter({ hasText: "Probe Agent B" }).first();
ok(
  (await runningRow.getAttribute("class"))?.includes("end") === false,
  "running 行无 end/idle 变体",
);
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
// 游标分页：滚动到底自动追加（03n 编号④；mock 页大小 12，第二页 5 条）。
await page.evaluate(() => {
  const el = document.querySelector(".msheet");
  if (el) el.scrollTop = el.scrollHeight;
});
await page.waitForFunction(
  () => document.querySelectorAll(".msheet .hrow").length === 24,
  undefined,
  { timeout: 5000 },
);
ok(true, "滚动到底自动追加第二页（hrow 19 → 24）");
ok(
  historyUrls.some((u) => u.includes("cursor=12")),
  "追加请求带 cursor=12（游标续拉）",
);
ok(
  (await page.locator(".msheet", { hasText: "没有更多" }).count()) === 1,
  "「没有更多」出现在列表尾（nextCursor=null）",
);
// 左滑删除（03n 编号⑥）：closed 行横滑露出垫底删除钮 → 二次确认（先取消 → 再确认）。
const swipeRow = page.locator(".msheet .hrow.swipe").filter({ hasText: "Probe Old 3" });
const swipeState = () =>
  page.evaluate(() => {
    const row = [...document.querySelectorAll(".msheet .hrow.swipe")].find((n) =>
      n.textContent?.includes("Probe Old 3"),
    );
    if (!row) return null;
    const del = row.querySelector(".del");
    const body = row.querySelector(".hbody");
    const r = del.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { covered: hit !== del, transform: body?.style.transform ?? "" };
  });
await swipeRow.scrollIntoViewIfNeeded();
let sw = await swipeState();
ok(sw !== null, "swipe 行可定位（Probe Old 3）");
ok(sw?.covered === true, "rest 态删除钮被行体遮盖（elementFromPoint = 行体）");
// rest 态行体须盖满容器全高（含上下 padding 带）：否则绝对定位 .del 的 tint-red 从
// padding 带露出，表现为列表右端的暗红条（2026-10-19 真机反馈的根因断言）。
const restGeometry = await page.evaluate(() => {
  const row = [...document.querySelectorAll(".msheet .hrow.swipe")].find((n) =>
    n.textContent?.includes("Probe Old 3"),
  );
  if (!row) return null;
  const del = row.querySelector(".del");
  const body = row.querySelector(".hbody");
  if (!del || !body) return null;
  const d = del.getBoundingClientRect();
  const b = body.getBoundingClientRect();
  return {
    coversFullHeight: b.top <= d.top && b.bottom >= d.bottom,
    topCovered: document.elementFromPoint(d.x + d.width / 2, d.top + 3) !== del,
    bottomCovered: document.elementFromPoint(d.x + d.width / 2, d.bottom - 3) !== del,
  };
});
ok(restGeometry?.coversFullHeight === true, "rest 态行体覆盖删除钮全高（无 padding 露红）");
ok(
  restGeometry?.topCovered === true && restGeometry?.bottomCovered === true,
  `删除钮上下缘均被行体遮盖（top=${restGeometry?.topCovered} bottom=${restGeometry?.bottomCovered}）`,
);
const bb = await swipeRow.locator(".hbody").boundingBox();
await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
await page.mouse.down();
for (let i = 1; i <= 4; i += 1) {
  await page.mouse.move(bb.x + bb.width / 2 - i * 20, bb.y + bb.height / 2);
}
await page.mouse.up();
await page.waitForTimeout(300);
sw = await swipeState();
ok(sw?.transform === "translateX(-64px)", `左滑过半吸附常开（transform ${sw?.transform}）`);
ok(sw?.covered === false, "删除钮露出可点（reveal）");
await swipeRow.locator(".del").click();
const confirmBox = page.getByRole("dialog", { name: "删除历史会话" });
await confirmBox.waitFor({ timeout: 5000 });
ok(
  (await confirmBox.textContent())?.includes("Probe Old 3") === true,
  "确认文案含会话名插值（{{name}}）",
);
await confirmBox.getByRole("button", { name: "取消" }).click();
await page.waitForTimeout(400);
ok((await swipeRow.count()) === 1, "取消后行仍在");
ok(deletePosts.length === 0, "取消未发 DELETE");
// 再滑 + 确认删除：DELETE 端点 + invalidate 重拉 + 行消失。
const bb2 = await swipeRow.locator(".hbody").boundingBox();
await page.mouse.move(bb2.x + bb2.width / 2, bb2.y + bb2.height / 2);
await page.mouse.down();
for (let i = 1; i <= 4; i += 1) {
  await page.mouse.move(bb2.x + bb2.width / 2 - i * 20, bb2.y + bb2.height / 2);
}
await page.mouse.up();
await page.waitForTimeout(300);
await swipeRow.locator(".del").click();
await confirmBox.getByRole("button", { name: "删除", exact: true }).click();
await page.waitForFunction(
  () =>
    ![...document.querySelectorAll(".msheet .hrow")].some((n) =>
      n.textContent?.includes("Probe Old 3"),
    ),
  undefined,
  { timeout: 5000 },
);
ok(true, "确认删除后行消失（invalidate 重拉）");
ok(
  deletePosts.length === 1 && deletePosts[0].id === "c1aude-old-3",
  `DELETE /agent-history/c1aude-old-3（${JSON.stringify(deletePosts)}）`,
);
ok(deletePosts[0]?.url.includes("provider=claude") === true, "DELETE 带 provider=claude");
ok((await page.locator(".msheet .hrow").count()) === 23, "删除后 hrow = 23（16 时间行 + 最近 7）");
// 搜索（03n 编号③）：服务端按名过滤（hook 300ms debounce → queryKey 变化重拉）。
const searchBox = page.locator('.msheet input[placeholder="搜索历史会话"]');
await searchBox.fill("Probe Week 2");
await page.waitForFunction(
  () => document.querySelectorAll(".msheet .hrow").length === 2,
  undefined,
  { timeout: 5000 },
);
ok(true, "搜索过滤后 2 行（最近组 + 7 天内组各 1）");
ok(
  historyUrls.at(-1)?.includes("search=Probe+Week+2") === true,
  "查询带 search 参数（服务端过滤）",
);
await searchBox.fill("");
await page.waitForFunction(
  () => document.querySelectorAll(".msheet .hrow").length === 23,
  undefined,
  { timeout: 5000 },
);
ok(true, "清空搜索恢复 23 行（删除后全量 + 最近组）");
// 失败重试态（03n 底部三态）：GET 置 500（后注册路由优先）→ 新词 = 全新查询失败
// （retry:1 后置败）→ 列表位「加载失败 · 点按重试」；摘掉 500 后点按重试恢复。
const failHistory = (r) =>
  r.fulfill({
    body: JSON.stringify({ error: { code: "INTERNAL", message: "probe" } }),
    contentType: "application/json",
    status: 500,
  });
const historyPattern = new RegExp(`/api/projects/${projectName}/agent-history(?:\\?.*)?$`);
await page.route(historyPattern, failHistory);
await searchBox.fill("zzz-none");
await page.locator(".msheet").getByText("加载失败 · 点按重试").waitFor({ timeout: 10000 });
ok(true, "失败态 = 「加载失败 · 点按重试」");
await page.unroute(historyPattern, failHistory);
await page.locator(".msheet").getByText("加载失败 · 点按重试").click();
await page.waitForFunction(
  () => document.querySelectorAll(".msheet .hrow").length === 0,
  undefined,
  { timeout: 5000 },
);
ok(
  (await page.locator(".msheet", { hasText: "暂无会话" }).count()) === 1,
  "重试成功后空态（zzz-none 无匹配）",
);
await searchBox.fill("");
await page.waitForFunction(
  () => document.querySelectorAll(".msheet .hrow").length === 23,
  undefined,
  { timeout: 5000 },
);
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

// ── Part 4: ⋯ 菜单动作区（v1.6 变更①：动作上收 ⋯ 菜单；实例信息 = 纯信息面板）──
console.log("Part 4: ⋯ 菜单动作区（置顶/重命名/关闭）+ 实例信息纯信息面板");
await page.goto(`${ORIGIN}/projects/${projectName}/session/agent_probe-1`);
await page.waitForSelector(".nav h1 button", { timeout: 10000 });
const cdp = await ctx.newCDPSession(page);
await page.locator('button[aria-label="更多操作"]').click();
await page.getByRole("menuitem").first().waitFor({ timeout: 5000 });
const actionItems = await page.evaluate(() => {
  const menu = [...document.querySelectorAll('[role="menu"]')].at(-1);
  return [...(menu?.querySelectorAll('[role="menuitem"]') ?? [])].map((el) => ({
    label: el.textContent?.trim() ?? "",
    color: getComputedStyle(el).color,
  }));
});
ok(actionItems.some((i) => i.label.includes("置顶")) === true, "动作区含「置顶」（agent 实例）");
ok(actionItems.some((i) => i.label.includes("重命名")) === true, "动作区含「重命名」");
const closeItem = actionItems.find((i) => i.label.includes("关闭"));
ok(closeItem !== undefined, "销毁区含「关闭会话」");
ok(
  closeItem !== undefined &&
    closeItem.color !== actionItems.find((i) => i.label.includes("重命名"))?.color,
  `关闭项 destructive 着色（color=${closeItem?.color}）`,
);
// 实例信息 = 纯信息面板（.acts footer 随动作上收退役）。
await page.getByRole("menuitem", { name: "实例信息" }).click();
await page.waitForSelector('.msheet .shd h2:has-text("实例信息")', { timeout: 5000 });
ok(true, "⋯ → 实例信息 → info sheet 打开");
ok(
  (await page.getByRole("dialog", { name: "实例信息" }).locator(".acts").count()) === 0,
  "实例信息为纯信息面板（.acts 动作行已退役）",
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

// ── Part 6: 03h 空态卡「从历史恢复」入口 ────────────────────────────────────
// 独立 context + 空 mock（agent-sessions=[] 触发空态条件「无实例无聚焦」；agent-history=[]
// 断言 sheet 空提示）。放探针末尾，不污染前面各 part 的 AGENTS mock 前置。
console.log("Part 6: 03h 空态卡「从历史恢复」入口（tinted 次按钮 → 03n）");
const emptyCtx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  locale: "zh-CN",
});
const emptyPage = await emptyCtx.newPage();
const emptyJson = (body) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(body),
});
await emptyPage.route(/\/api\/overview$/, (r) =>
  r.fulfill(emptyJson({ projectNames: [projectName], candidates: [] })),
);
await emptyPage.route(/pinned-sessions/, (r) => r.fulfill(emptyJson({ sessions: [] })));
await emptyPage.route(new RegExp(`/api/projects/${projectName}/agent-sessions(?:\\?.*)?$`), (r) =>
  r.fulfill(emptyJson({ sessions: [] })),
);
// useProjectInstances 同时查 agent+terminal 两 query（isLoading = 任一 pending）——漏 mock
// terminal-sessions 会让 isLoading 卡 true，空态永不落定（骨架卡住）。
await emptyPage.route(
  new RegExp(`/api/projects/${projectName}/terminal-sessions(?:\\?.*)?$`),
  (r) => r.fulfill(emptyJson({ sessions: [] })),
);
await emptyPage.route(new RegExp(`/api/projects/${projectName}/agent-history(?:\\?.*)?$`), (r) =>
  r.fulfill(
    emptyJson({
      entries: [],
      counts: { all: 0, active: 0, ended: 0 },
      nextCursor: null,
      filter: "all",
    }),
  ),
);
await emptyPage.routeWebSocket(/stream/, (ws) => ws.connectToServer());
await login(emptyPage);
await emptyPage.goto(`${ORIGIN}/projects/${projectName}`);
await emptyPage.waitForSelector(".empty-card", { timeout: 10000 });
ok(true, "空项目（无实例）渲染 .empty-card 空态卡");
// 次按钮几何/着色（iOS tinted：半透明 primary 底 + 图标 + 与主按钮同几何、纵向堆叠）。
const resumeCta = await emptyPage.evaluate(() => {
  const buttons = [...document.querySelectorAll(".empty-card button")];
  const main = buttons.find((b) => b.textContent?.includes("新建 Agent"));
  const sub = buttons.find((b) => b.textContent?.includes("从历史恢复"));
  if (!main || !sub) return null;
  const m = main.getBoundingClientRect();
  const s = sub.getBoundingClientRect();
  const bg = getComputedStyle(sub).backgroundColor;
  // computed 对 color-mix 返回 oklab()/color() 新语法（frontend-notes §2：oklab 需换算）——
  // 取「右括号前最后一个数值」当 alpha（rgba 4 参与 oklab `/ 0.15` 两种形态都命中）。
  const nums = bg.match(/[\d.]+/g) ?? [];
  const alpha = nums.length >= 4 ? Number(nums.at(-1)) : 1;
  return {
    w: Math.round(s.width),
    h: Math.round(s.height),
    alpha,
    hasIcon: sub.querySelector("svg") !== null,
    sameWidth: Math.abs(m.width - s.width) < 1,
    stackedBelow: s.top >= m.bottom - 1,
  };
});
ok(resumeCta !== null, "空态卡含「从历史恢复」次按钮");
ok(
  resumeCta?.w === 200 && resumeCta?.h === 40,
  `次按钮同主按钮几何（${resumeCta?.w}×${resumeCta?.h} = 200×40）`,
);
ok((resumeCta?.alpha ?? 1) < 0.5, `次按钮 tinted 半透明底（alpha ${resumeCta?.alpha} < 0.5）`);
ok(resumeCta?.hasIcon === true, "次按钮带 clock 图标（ShellIcon svg 在场）");
ok(
  resumeCta?.sameWidth === true && resumeCta?.stackedBelow === true,
  "次按钮与主按钮等宽、纵向堆叠于其下",
);
// 点次按钮 → 03n 历史浮层打开（空数据 = 诚实空提示，不闪加载后落空）。
await emptyPage.getByRole("button", { name: "从历史恢复" }).click();
await emptyPage.waitForSelector('.msheet .shd h2:has-text("会话历史")', { timeout: 5000 });
ok(true, "点「从历史恢复」→ 03n 历史浮层打开");
await emptyPage.waitForSelector('.msheet p:has-text("暂无会话")', { timeout: 5000 });
ok(true, "空历史显示「暂无会话」诚实空提示（无骨架误导）");
await emptyPage.keyboard.press("Escape");
await emptyPage.waitForTimeout(400);
ok((await emptyPage.locator(".msheet").count()) === 0, "Esc 关闭历史浮层");
await emptyCtx.close();

console.log(`\n结果: ${passCount} pass / ${failCount} fail`);
await browser.close();
if (failCount > 0) process.exit(1);
