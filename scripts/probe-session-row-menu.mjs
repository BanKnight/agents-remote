// §4.8 桌面会话行右键菜单探针（2026-11-02 用户拍板平板触屏对齐项目区；spec §4.8 会话行交互段）。
// 覆盖单测验不到的真实浏览器行为（DOM 硬数据，禁截图）：
//   Part 1（桌面 1600×1000 项目侧栏 SideInstanceRow）：右键 → SessionRowMenu 在场
//          （置顶/重命名/关闭会话三 menuitem）+ 触发行 dashed ring（PROJECT_ROW_TRIGGER_RING
//          outline computed）+ Esc 关闭 ring 消失 + 置顶 keepOpen（点后菜单不关、✓ 出现、
//          POST 请求命中服务端 mock）。
//   Part 2（桌面 1600×1000 global「全部」05g）：普通组行右键 → 同款菜单 + ring；
//          置顶组行不显示项目名 chip（.live.off 缺席，2026-11-02 拍板）与 pin 图标（置顶标识
//          退出列表行）。
// 长按（pointerType=touch）路径 Playwright mouse 触发不了（useLongPressActions 显式排除
// mouse pointer，frontend-notes §29 手势输入边界）——交真机清单。
// 用法：bun scripts/probe-session-row-menu.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const ORIGIN = process.env.AR_WEB_ORIGIN ?? "http://127.0.0.1:43012";

const AGENT = {
  id: "agent_srm-1",
  projectName: "proj1",
  provider: "claude",
  displayName: "Probe Agent",
  status: "running",
  createdAt: "2026-11-01T00:00:00.000Z",
};
const TERM = {
  id: "terminal_srm-1",
  projectName: "proj1",
  displayName: "probe-term",
  status: "running",
  createdAt: "2026-11-01T01:00:00.000Z",
};

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

const json = (body) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(body),
});

async function login(page) {
  await page.goto(`${ORIGIN}/`);
  await page.waitForSelector('input[type="password"]', { timeout: 15000 });
  await page.getByLabel("访问密码").fill(await readAppPassword());
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForTimeout(1200);
}

/** 会话域 mock：overview / pinned（GET + POST/DELETE 记录）/ approvals + WS 静默。
 * 项目列表 + 两类会话列表（详情未覆盖的 404 无碍——探针只操作列表行，不进会话现场）。 */
async function setupMocks(page, pinnedState) {
  await page.route(/\/api\/overview$/, (r) =>
    r.fulfill(
      json({
        projectNames: ["proj1"],
        candidates: [
          { ...AGENT, sessionId: AGENT.id, type: "agent" },
          { ...TERM, sessionId: TERM.id, type: "terminal" },
        ],
      }),
    ),
  );
  // pinned GET 读 pinnedState.current；pin/unpin 乐观更新靠响应体（onMutate cache + onSettled
  // invalidate refetch），mock 直接回写 current 并返回最终列表（服务端真相语义）。
  // 正则不带 $ 锚：POST/DELETE 是 /pinned-sessions/<id> 子路径，带 $ 会穿透 mock 打真实 api
  //（首跑实锤污染 dev state.yaml，已清理——勿回退此正则）。
  await page.route(/\/api\/state\/overview\/pinned-sessions/, (r) => {
    if (r.request().method() === "GET") {
      return r.fulfill(json({ sessions: [...pinnedState.current] }));
    }
    const id = decodeURIComponent(r.request().url().split("/pinned-sessions/")[1] ?? "");
    if (r.request().method() === "POST" && id) pinnedState.current.add(id);
    if (r.request().method() === "DELETE") pinnedState.current.delete(id);
    return r.fulfill(json({ sessions: [...pinnedState.current] }));
  });
  await page.route(/\/api\/approvals$/, (r) => r.fulfill(json({ approvals: [] })));
  await page.route(/\/api\/approvals\/stream$/, (r) => r.abort());
  await page.routeWebSocket(/\/stream/, () => {});
  await page.route(/\/api\/projects$/, (r) =>
    r.fulfill(json([{ name: "proj1", path: "/srv/projects/proj1" }])),
  );
  await page.route(/\/api\/projects\/proj1\/agent-sessions(?:\?.*)?$/, (r) =>
    r.fulfill(json({ sessions: [AGENT] })),
  );
  await page.route(/\/api\/projects\/proj1\/terminal-sessions(?:\?.*)?$/, (r) =>
    r.fulfill(json({ sessions: [TERM] })),
  );
}

/** 菜单查询 helper：role=menu 在场 + menuitem 文案列表。 */
async function menuSnapshot(page) {
  return page.evaluate(() => {
    const menu = document.querySelector('[role="menu"]');
    if (!menu) return { open: false, items: [] };
    return {
      open: true,
      items: [...menu.querySelectorAll('[role="menuitem"]')].map(
        (el) => el.textContent?.trim() ?? "",
      ),
    };
  });
}

/** 行 ring 断言：触发行 computed outlineStyle 含 dashed（PROJECT_ROW_TRIGGER_RING 落地）。 */
async function rowRingOn(page, name) {
  return page.evaluate((rowName) => {
    const rows = [...document.querySelectorAll("aside button")].filter((b) =>
      (b.textContent ?? "").includes(rowName),
    );
    const row = rows[0];
    if (!row) return { found: false, dashed: false };
    return { found: true, dashed: getComputedStyle(row).outlineStyle.includes("dashed") };
  }, name);
}

async function main() {
  const browser = await chromium.launch();
  try {
    // ─────────────── Part 1：项目侧栏 SideInstanceRow 右键菜单 ───────────────
    console.log("\n=== Part 1: 项目侧栏会话行右键菜单（1600×1000）===");
    const ctx1 = await browser.newContext({
      viewport: { width: 1600, height: 1000 },
      locale: "zh-CN",
    });
    const p1 = await ctx1.newPage();
    p1.on("pageerror", (err) => console.error("PAGEERROR:", err.message.slice(0, 400)));
    const pinnedState = { current: new Set() };
    await setupMocks(p1, pinnedState);
    await login(p1);
    await p1.goto(`${ORIGIN}/projects/proj1`);
    await p1.waitForTimeout(1800);

    const agentRow = p1.locator("aside button", { hasText: "Probe Agent" }).first();
    ok((await agentRow.count()) > 0, "P1-1 侧栏 agent 行在场");

    // 右键 → 菜单在场 + 三动作文案
    await agentRow.click({ button: "right" });
    await p1.waitForTimeout(400);
    let menu = await menuSnapshot(p1);
    ok(menu.open, "P1-2 右键行 → SessionRowMenu 打开（role=menu 在场）");
    ok(
      menu.items.length === 3 &&
        menu.items[0] === "置顶" &&
        menu.items[1] === "重命名" &&
        menu.items[2] === "关闭会话…",
      `P1-3 菜单三项 = 置顶/重命名/关闭会话…（实际 ${JSON.stringify(menu.items)}）`,
    );

    // 触发行 dashed ring
    let ring = await rowRingOn(p1, "Probe Agent");
    ok(ring.found && ring.dashed, "P1-4 触发行挂 dashed ring（outline computed）");

    // Esc 关闭 → ring 消失
    await p1.keyboard.press("Escape");
    await p1.waitForTimeout(400);
    menu = await menuSnapshot(p1);
    ring = await rowRingOn(p1, "Probe Agent");
    ok(!menu.open && !ring.dashed, "P1-5 Esc 关菜单 + ring 消失");

    // 置顶 keepOpen：点置顶 → 菜单保持 + ✓ + 服务端收到 POST
    await agentRow.click({ button: "right" });
    await p1.waitForTimeout(400);
    await p1.locator('[role="menuitem"]', { hasText: "置顶" }).first().click();
    await p1.waitForTimeout(600);
    menu = await menuSnapshot(p1);
    ok(menu.open, "P1-6 点置顶 keepOpen（菜单不关）");
    const pinPosted = pinnedState.current.has(AGENT.id);
    ok(pinPosted, "P1-7 置顶动作 POST 命中（pinned mock 集合含 sessionId）");
    const hasCheck = await p1.evaluate(() => {
      const item = [...document.querySelectorAll('[role="menuitem"]')].find((el) =>
        (el.textContent ?? "").includes("置顶"),
      );
      return (item?.textContent ?? "").includes("✓");
    });
    ok(hasCheck, "P1-8 已置顶态菜单项带 ✓ 标注");
    await p1.keyboard.press("Escape");
    await p1.waitForTimeout(300);

    // terminal 行同样可右键（类型无关，pin 无类型门）
    const termRow = p1.locator("aside button", { hasText: "probe-term" }).first();
    await termRow.click({ button: "right" });
    await p1.waitForTimeout(400);
    menu = await menuSnapshot(p1);
    ok(menu.open && menu.items.includes("置顶"), "P1-9 terminal 行右键同款菜单（pin 类型无关）");
    await p1.keyboard.press("Escape");
    await ctx1.close();

    // ─────────────── Part 2：global「全部」05g 行 ───────────────
    console.log("\n=== Part 2: global 全部视图 05g 行（1600×1000）===");
    const ctx2 = await browser.newContext({
      viewport: { width: 1600, height: 1000 },
      locale: "zh-CN",
    });
    const p2 = await ctx2.newPage();
    p2.on("pageerror", (err) => console.error("PAGEERROR:", err.message.slice(0, 400)));
    const pinnedState2 = { current: new Set([AGENT.id]) };
    await setupMocks(p2, pinnedState2);
    await login(p2);
    await p2.goto(`${ORIGIN}/`);
    await p2.waitForTimeout(1800);

    const geom = await p2.evaluate(
      ([agentName, termName]) => {
        const rows = [...document.querySelectorAll("aside button")].filter(
          (b) =>
            (b.textContent ?? "").includes(agentName) || (b.textContent ?? "").includes(termName),
        );
        const pinnedRow = rows.find((b) => (b.textContent ?? "").includes(agentName));
        const normalRow = rows.find((b) => (b.textContent ?? "").includes(termName));
        return {
          pinnedHasChip:
            pinnedRow?.querySelector(".live.off") !== undefined &&
            pinnedRow?.querySelector(".live.off") !== null,
          pinnedHasPinIcon: (pinnedRow?.querySelector(".text-pin") ?? null) !== null,
          normalFound: normalRow !== undefined,
        };
      },
      [AGENT.displayName, TERM.displayName],
    );
    ok(geom.pinnedHasChip === false, "P2-1 05g 置顶组行无项目名 chip（.live.off 缺席）");
    ok(geom.pinnedHasPinIcon === false, "P2-2 05g 置顶组行无 pin 图标（置顶标识退出列表行）");
    ok(geom.normalFound, "P2-3 05g 普通组行在场");

    const normalRow = p2.locator("aside button", { hasText: "probe-term" }).first();
    await normalRow.click({ button: "right" });
    await p2.waitForTimeout(400);
    const menu2 = await menuSnapshot(p2);
    ok(menu2.open && menu2.items.length === 3, "P2-4 05g 行右键 → 同款菜单");
    const ring2 = await rowRingOn(p2, "probe-term");
    ok(ring2.dashed, "P2-5 05g 触发行挂 dashed ring");
    await p2.keyboard.press("Escape");
    await ctx2.close();
  } finally {
    await browser.close();
  }
  console.log(`\n结果: ${passCount} pass / ${failCount} fail`);
  process.exit(failCount > 0 ? 1 : 0);
}

await main();
