// 探针：批 6 项目管理移动端接入（spec §3.2 项目行长按菜单 → 重命名/删除流转）断言。
// PASS/FAIL 入库版；全 mock API（删除/重命名只记录请求，无真实数据变更）；密码自读不打印。
// 断言清单：
//   A0 overview mock 生效：proj-a 项目行唯一渲染（2 实例 · 1 running）
//   A1 触屏长按（pointerType:touch 500ms 阈值，probe-inspector-row-menus 同法）→ ProjectRowMenu
//      浮层出现：三项 = 打开/重命名…/删除…，删除项 computed color = --c-danger
//   A2 菜单几何：top ≈ 长按点 y + 6（sideOffset 6，容差 12）+ 宽 ≈ 250（max-sm 档）；
//      点击页面空白处 (20,20) → 菜单关闭
//   A3 重命名流转（running>0）：菜单重命名 → 影响提醒两行文案在场 →「继续」→ RenameDialog
//      输入框预填 proj-a
//   A4 删除确认：菜单删除 → 贴底 sheet（.msheet 底边贴视口底、宽 ≈ 视口宽，左右各留 10px）+
//      checkbox 行在场 + 磁盘路径提示行（getProject 回填）+ 主按钮初始「移出项目（保留文件）」
//      → 勾选后文案升级「删除项目（含磁盘文件，不可恢复）」且 class 含 bg-error
//   A5 确认执行：DELETE /api/projects/proj-a 带 deleteFiles=true searchParam + mock 响应体
//      {deleted,projectName,filesDeleted} + invalidate → GET /api/overview 重新拉取（本页活跃
//      数据源；["projects"] 在移动项目页无活跃观察者，不产生 GET /api/projects —— 契约现状）。
//      注：overview 有 10s refetchInterval，断言窗口取 DELETE 后 3s，正常 invalidate 为毫秒级。
//   A6 重命名提交：POST /api/projects/proj-a/rename body {"name":"proj-a2"}
// 用法：bun scripts/probe-projects-home-row-menu.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const PROJECT = "proj-a";
const PROJECT_PATH = "/srv/projects/proj-a";
const PROJECT_NAMES = ["proj-a", "proj-b"];

let allPass = true;
function ok(cond, label) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) allPass = false;
}

function json(body) {
  return { status: 200, contentType: "application/json", body: JSON.stringify(body) };
}

/** "#ff453a" → "rgb(255, 69, 58)"（对齐 getComputedStyle().color 输出形制）。 */
function hexToRgbStr(hex) {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

const iso = (offsetMs) => new Date(Date.now() - offsetMs).toISOString();
// proj-a 2 个 agent 候选（1 running 1 idle）→ 行聚合 instanceCount=2 / runningCount=1；
// 无 subtitle 字段 → 活动行不出项目 chip，保证「proj-a」文本只在项目行出现。
const CANDIDATES = [
  {
    sessionId: "pa-1",
    projectName: PROJECT,
    displayName: "A 跑动中",
    status: "running",
    provider: "claude",
    type: "agent",
    createdAt: iso(60_000),
    updatedAt: iso(60_000),
  },
  {
    sessionId: "pa-2",
    projectName: PROJECT,
    displayName: "A 闲置",
    status: "idle",
    provider: "claude",
    type: "agent",
    createdAt: iso(120_000),
    updatedAt: iso(120_000),
  },
];

const recorded = {
  /** DELETE /api/projects/proj-a：{search, overviewCountAtDelete} */
  deletes: [],
  /** POST /api/projects/proj-a/rename：{body} */
  renames: [],
  /** GET /api/projects/proj-a（删除菜单取磁盘路径）。 */
  projectDetailGets: 0,
};
let overviewCalls = 0;
let projectsListCalls = 0;

const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    isMobile: true,
    hasTouch: true,
    locale: "zh-CN",
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();

  await page.route(/\/api\/overview\/subtitles(?:\?.*)?$/, (r) =>
    r.fulfill(json({ subtitles: {} })),
  );
  await page.route(/\/api\/overview(?:\?.*)?$/, (r) => {
    overviewCalls += 1;
    return r.fulfill(json({ projectNames: PROJECT_NAMES, candidates: CANDIDATES }));
  });
  await page.route(/\/api\/projects\/proj-a\/rename(?:\?.*)?$/, (r) => {
    const body = r.request().postDataJSON();
    recorded.renames.push({ body });
    const name = typeof body?.name === "string" ? body.name : PROJECT;
    return r.fulfill(
      json({
        project: { agentSessionCount: 2, name, path: PROJECT_PATH, terminalSessionCount: 0 },
      }),
    );
  });
  await page.route(/\/api\/projects\/proj-a(?:\?.*)?$/, (r) => {
    if (r.request().method() === "DELETE") {
      const search = Object.fromEntries(new URL(r.request().url()).searchParams);
      recorded.deletes.push({ overviewCountAtDelete: overviewCalls, search });
      return r.fulfill(json({ deleted: true, filesDeleted: true, projectName: PROJECT }));
    }
    recorded.projectDetailGets += 1;
    return r.fulfill(
      json({
        project: {
          agentSessionCount: 2,
          name: PROJECT,
          path: PROJECT_PATH,
          terminalSessionCount: 0,
        },
      }),
    );
  });
  await page.route(/\/api\/projects(?:\?.*)?$/, (r) => {
    if (r.request().method() === "GET") {
      projectsListCalls += 1;
      return r.fulfill(
        json({
          projects: [
            { agentSessionCount: 2, name: PROJECT, path: PROJECT_PATH, terminalSessionCount: 0 },
          ],
        }),
      );
    }
    return r.fulfill(json({ ok: true }));
  });
  await page.route(/\/api\/state\/overview\/pinned-sessions(?:\?.*)?$/, (r) =>
    r.fulfill(json({ sessions: [] })),
  );
  await page.route(/\/api\/approvals(?:\?.*)?$/, (r) => r.fulfill(json({ approvals: [] })));
  // approvals WS 不连（保持 inert）：审批态全走上面 REST mock，真实服务端帧不进探针。
  await page.routeWebSocket(/\/api\/approvals\/stream/, () => {});

  // 登录（真实 dev api，密码自读不打印）→ 进移动项目 Tab。
  await page.goto(`${WEB_ORIGIN}/`);
  await page.locator("input[type='password']").fill(await readAppPassword());
  await page.locator("button[type='submit']").click();
  await page.waitForTimeout(1500);
  await page.goto(`${WEB_ORIGIN}/projects`);

  const row = page.locator("button").filter({ hasText: PROJECT }).first();
  await row.waitFor({ state: "visible", timeout: 15000 });
  await page.waitForTimeout(400);
  ok(
    (await page.locator("button").filter({ hasText: PROJECT }).count()) === 1,
    "A0 proj-a 项目行唯一渲染（overview mock）",
  );

  const menu = page.locator('[data-slot="popover-content"]');

  /** 触屏长按项目行（合成 pointerType:touch pointerdown 过 500ms 阈值）→ 等菜单浮层。 */
  async function longPressRow() {
    const box = await row.boundingBox();
    if (!box) throw new Error("proj-a 行无 boundingBox");
    const seq = {
      bubbles: true,
      clientX: box.x + box.width / 2,
      clientY: box.y + box.height / 2,
      isPrimary: true,
      pointerId: 7,
      pointerType: "touch",
    };
    await row.dispatchEvent("pointerdown", seq);
    await page.waitForTimeout(650);
    await row.dispatchEvent("pointerup", seq);
    await menu.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
    return { x: seq.clientX, y: seq.clientY };
  }

  // ── A1 长按开菜单：三项 + 删除项 error 色 ──
  const press1 = await longPressRow();
  const menuOpen = await menu.isVisible().catch(() => false);
  ok(menuOpen, "A1a 长按项目行 → 行操作菜单浮层出现");
  const items = (await menu.locator("button").allTextContents()).map((s) => s.trim());
  ok(
    items.join("/") === "打开/重命名…/删除…",
    `A1b 菜单三项 = 打开/重命名…/删除…（实际 ${items.join("/") || "无"}）`,
  );
  const dangerVar = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--c-danger").trim(),
  );
  const deleteColor = await menu
    .locator("button")
    .filter({ hasText: "删除…" })
    .evaluate((el) => getComputedStyle(el).color);
  ok(
    deleteColor === hexToRgbStr(dangerVar),
    `A1c 删除项 computed color = --c-danger（实际 ${deleteColor} vs var ${dangerVar}）`,
  );

  // ── A2 菜单几何 + 点空白关闭 ──
  await page.waitForTimeout(450); // spring 入场收敛后再取几何（防 zoom-in 缩放差）
  const menuBox = await menu.boundingBox();
  ok(
    menuBox !== null && Math.abs(menuBox.y - (press1.y + 6)) <= 12,
    `A2a 菜单容器 top ≈ 长按点 y+6（实际 top ${menuBox?.y.toFixed(1)} vs 长按点 y ${press1.y.toFixed(1)} + 6）`,
  );
  ok(
    menuBox !== null && Math.abs(menuBox.width - 250) <= 6,
    `A2b 菜单宽 = max-sm 250（实际 ${menuBox?.width.toFixed(1)}）`,
  );
  await page.mouse.click(20, 20);
  await menu.waitFor({ state: "detached", timeout: 3000 }).catch(() => {});
  ok(!(await menu.isVisible().catch(() => false)), "A2c 点击页面空白处 (20,20) → 菜单关闭");

  // ── A3 重命名流转：running>0 → 影响提醒 → 继续 → RenameDialog 预填 ──
  await longPressRow();
  await menu.locator("button").filter({ hasText: "重命名…" }).click();
  const impactLine1 = "将关闭全部会话实例（2 个 · 其中 1 个运行中）。";
  const impactLine2 = "会话历史保留，项目归属将更新为新名称。";
  await page
    .getByText(impactLine1)
    .waitFor({ timeout: 5000 })
    .catch(() => {});
  const t1 = await page
    .getByText(impactLine1)
    .isVisible()
    .catch(() => false);
  const t2 = await page
    .getByText(impactLine2)
    .isVisible()
    .catch(() => false);
  ok(t1 && t2, "A3a 影响提醒两行文案在场（2 实例 · 1 运行中 + 历史保留归属更新）");
  await page.getByRole("button", { name: "继续" }).click();
  const input = page.locator("input[aria-label='重命名']");
  await input.waitFor({ state: "visible", timeout: 5000 });
  ok(
    (await input.inputValue()) === PROJECT,
    `A3b 「继续」→ RenameDialog 预填（实际 ${(await input.inputValue()) || "空"}）`,
  );
  await page.keyboard.press("Escape");
  await input.waitFor({ state: "detached", timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(350); // Radix exit + DismissableLayer 清理序（SHEET_UNMOUNT_DELAY 同级）

  // ── A4 删除确认：贴底 sheet + checkbox + 路径行 + 主按钮随勾选升级 ──
  await longPressRow();
  await menu.locator("button").filter({ hasText: "删除…" }).click();
  const sheet = page.locator(".msheet");
  await sheet.waitFor({ state: "visible", timeout: 5000 });
  await page.waitForTimeout(450); // enter 升起弹簧收敛后再取几何
  const geo = await sheet.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return {
      bottom: r.bottom,
      height: r.height,
      vh: window.innerHeight,
      vw: window.innerWidth,
      width: r.width,
    };
  });
  ok(
    geo.bottom <= geo.vh + 0.5 && geo.vh - geo.bottom <= 16,
    `A4a 删除 sheet 贴底（底边 ${geo.bottom.toFixed(1)} vs 视口底 ${geo.vh}，设计 bottom 留 10px）`,
  );
  ok(
    geo.vw - geo.width <= 24,
    `A4b 删除 sheet 宽 ≈ 视口宽（实际 ${geo.width.toFixed(1)} vs ${geo.vw}，设计左右各留 10px）`,
  );
  const checkbox = sheet.locator('[role="checkbox"]');
  ok((await checkbox.count()) === 1, "A4c checkbox 行在场（整行点按切换）");
  ok(
    (await checkbox.getAttribute("aria-checked")) === "false",
    "A4d checkbox 初始未勾选（默认磁盘保留）",
  );
  ok(
    ((await checkbox.textContent()) ?? "").includes("同时删除磁盘上的项目文件"),
    "A4e checkbox 文案「同时删除磁盘上的项目文件」在场",
  );
  ok(
    ((await sheet.textContent()) ?? "").includes(PROJECT_PATH),
    `A4f 磁盘路径提示行在场（getProject 回填 ${PROJECT_PATH}）`,
  );
  const mainBtn = sheet.locator("button.rounded-lg");
  const initialText = ((await mainBtn.textContent()) ?? "").trim();
  ok(
    initialText === "移出项目（保留文件）",
    `A4g 主按钮初始文案「移出项目（保留文件）」（实际 ${initialText}）`,
  );
  const initialHasError = ((await mainBtn.getAttribute("class")) ?? "")
    .split(/\s+/)
    .includes("bg-error");
  ok(!initialHasError, "A4h 初始主按钮非 bg-error（保留文件档）");
  await checkbox.click();
  const checkedText = ((await mainBtn.textContent()) ?? "").trim();
  ok(
    checkedText === "删除项目（含磁盘文件，不可恢复）",
    `A4i 勾选后主按钮文案升级（实际 ${checkedText}）`,
  );
  const checkedClass = (await mainBtn.getAttribute("class")) ?? "";
  ok(
    checkedClass.split(/\s+/).includes("bg-error"),
    `A4j 勾选后主按钮 class 含 bg-error（实际 ${checkedClass.slice(0, 80)}…）`,
  );

  // ── A5 确认执行：DELETE 带 deleteFiles + invalidate 拉取 ──
  await mainBtn.click();
  const deleteDeadline = Date.now() + 5000;
  while (recorded.deletes.length === 0 && Date.now() < deleteDeadline) {
    await page.waitForTimeout(50);
  }
  const del = recorded.deletes[0];
  ok(
    del !== undefined && del.search.deleteFiles === "true",
    `A5a DELETE /api/projects/proj-a 发出且带 deleteFiles=true（实际 searchParams ${JSON.stringify(del?.search ?? null)}）`,
  );
  if (del) {
    const refetchDeadline = Date.now() + 3000;
    while (overviewCalls <= del.overviewCountAtDelete && Date.now() < refetchDeadline) {
      await page.waitForTimeout(50);
    }
    ok(
      overviewCalls > del.overviewCountAtDelete,
      `A5b mutation 后 invalidate → GET /api/overview 重新拉取（本页活跃源；DEL 时计数 ${del.overviewCountAtDelete} → 现 ${overviewCalls}；GET /api/projects 计数 ${projectsListCalls}，["projects"] 无活跃观察者）`,
    );
  }
  await sheet.waitFor({ state: "detached", timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(350);

  // ── A6 重命名提交：POST rename body {"name":"proj-a2"} ──
  await longPressRow();
  await menu.locator("button").filter({ hasText: "重命名…" }).click();
  await page
    .getByText(impactLine1)
    .waitFor({ timeout: 5000 })
    .catch(() => {});
  await page.getByRole("button", { name: "继续" }).click();
  const input2 = page.locator("input[aria-label='重命名']");
  await input2.waitFor({ state: "visible", timeout: 5000 });
  await input2.fill("proj-a2");
  const renameDialog = input2.locator("xpath=ancestor::div[@data-slot='dialog-content']");
  await renameDialog.getByRole("button", { name: "重命名", exact: true }).click();
  const renameDeadline = Date.now() + 5000;
  while (recorded.renames.length === 0 && Date.now() < renameDeadline) {
    await page.waitForTimeout(50);
  }
  const rename = recorded.renames[0];
  ok(
    rename !== undefined && JSON.stringify(rename.body) === JSON.stringify({ name: "proj-a2" }),
    `A6 POST /api/projects/proj-a/rename body = {"name":"proj-a2"}（实际 ${JSON.stringify(rename?.body ?? null)}）`,
  );

  // 探针自清理只关浏览器；mock 之下无任何真实数据变更（删除/重命名均为内存 mock）。

  // ── Part B：iPad 竖屏宽度档（768–1023px，review P1-2 回归锁）——max-sm 命中 = 移动形态
  //（菜单 250px；本仓 sm = 1024 覆写，默认 md=768 会把 iPad 竖屏错落桌面 176px 档）。
  {
    const context = await browser.newContext({
      isMobile: true,
      hasTouch: true,
      locale: "zh-CN",
      viewport: { width: 820, height: 1180 },
    });
    const page = await context.newPage();
    await page.route(/\/api\/overview\/subtitles(?:\?.*)?$/, (r) =>
      r.fulfill(json({ subtitles: {} })),
    );
    await page.route(/\/api\/overview(?:\?.*)?$/, (r) =>
      r.fulfill(json({ projectNames: PROJECT_NAMES, candidates: CANDIDATES })),
    );
    await page.route(/\/api\/projects\/proj-a\/rename(?:\?.*)?$/, (r) =>
      r.fulfill(
        json({
          project: {
            agentSessionCount: 2,
            name: PROJECT,
            path: PROJECT_PATH,
            terminalSessionCount: 0,
          },
        }),
      ),
    );
    await page.route(/\/api\/projects\/proj-a(?:\?.*)?$/, (r) =>
      r.fulfill(
        json({
          project: {
            agentSessionCount: 2,
            name: PROJECT,
            path: PROJECT_PATH,
            terminalSessionCount: 0,
          },
        }),
      ),
    );
    await page.route(/\/api\/projects(?:\?.*)?$/, (r) =>
      r.fulfill(
        json({
          projects: [
            { agentSessionCount: 2, name: PROJECT, path: PROJECT_PATH, terminalSessionCount: 0 },
          ],
        }),
      ),
    );
    await page.route(/\/api\/state\/overview\/pinned-sessions(?:\?.*)?$/, (r) =>
      r.fulfill(json({ sessions: [] })),
    );
    await page.route(/\/api\/approvals(?:\?.*)?$/, (r) => r.fulfill(json({ approvals: [] })));
    await page.routeWebSocket(/\/api\/approvals\/stream/, () => {});

    await page.goto(`${WEB_ORIGIN}/`);
    await page.locator("input[type='password']").fill(await readAppPassword());
    await page.locator("button[type='submit']").click();
    await page.waitForTimeout(1500);
    await page.goto(`${WEB_ORIGIN}/projects`);

    const row = page.locator("button").filter({ hasText: PROJECT }).first();
    await row.waitFor({ state: "visible", timeout: 15000 });
    const menu = page.locator('[data-slot="popover-content"]');
    const box = await row.boundingBox();
    if (!box) throw new Error("proj-a 行无 boundingBox");
    const seq = {
      bubbles: true,
      clientX: box.x + box.width / 2,
      clientY: box.y + box.height / 2,
      isPrimary: true,
      pointerId: 9,
      pointerType: "touch",
    };
    await row.dispatchEvent("pointerdown", seq);
    await page.waitForTimeout(650);
    await row.dispatchEvent("pointerup", seq);
    await menu.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(450);
    const menuBox = await menu.boundingBox();
    ok(
      menuBox !== null && Math.abs(menuBox.width - 250) <= 8,
      `B1 iPad 竖屏（820px）长按菜单宽 = 移动档 250（实际 ${menuBox?.width.toFixed(1) ?? "未开"}）`,
    );
    await context.close();
  }
} finally {
  await browser.close();
}
console.log(allPass ? "\nALL PASS" : "\nFAILED");
process.exit(allPass ? 0 : 1);
