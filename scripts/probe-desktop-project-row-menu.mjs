// 探针：桌面项目行菜单（批 6 / v1.5 §3.2，原型 mac-project-row-menu + project-rename +
// project-delete）。覆盖 WorkbenchSide 项目行右键 → ProjectRowMenu（打开/重命名…/删除…）
// → 重命名流转（running>0 影响提醒 → RenameDialog 预填 → POST rename → invalidate 重拉）
// → 删除流转（居中 Alert + checkbox 升级 → DELETE ?deleteFiles）。
// ⚠️ 断言 P11 用「proj-c」落点而非任务草案的「proj-b」：mock 里 proj-b 是既有项目，改名
// proj-b 会命中 RenameDialog 的客户端重名守卫（P10 正好断言该守卫在 siblings 接线上生效）。
// 长按（触屏）通道不在本探针覆盖（CDP touch 序列不稳定），交 iPad 真机验证清单。
// 断言 PASS/FAIL；密码自读不打印。用法: bun scripts/probe-desktop-project-row-menu.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";

let allPass = true;
function ok(cond, label) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) allPass = false;
}

/** Node 侧轮询等待（请求捕获变量就绪），超时返回最终 cond 值。 */
async function waitFor(cond, timeout = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (cond()) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return cond();
}

// ── mock 数据：proj-a 2 实例 1 running；proj-b 0 实例 ─────────────────────────
const iso = (h) => new Date(Date.now() - h * 3_600_000).toISOString();
const PROJECTS = [
  { name: "proj-a", path: "/tmp/ar-probe/proj-a", agentSessionCount: 2, terminalSessionCount: 0 },
  { name: "proj-b", path: "/tmp/ar-probe/proj-b", agentSessionCount: 0, terminalSessionCount: 0 },
];
const OVERVIEW = {
  projectNames: ["proj-a", "proj-b"],
  candidates: [
    {
      type: "agent",
      projectName: "proj-a",
      sessionId: "prm-s1",
      displayName: "prm 会话 1",
      status: "running",
      provider: "claude",
      createdAt: iso(30),
      updatedAt: iso(1),
    },
    {
      type: "agent",
      projectName: "proj-a",
      sessionId: "prm-s2",
      displayName: "prm 会话 2",
      status: "closed",
      provider: "claude",
      createdAt: iso(50),
      updatedAt: iso(20),
    },
  ],
};
const json = (body) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(body),
});
const methodNotAllowed = (r) =>
  r.fulfill({ status: 405, contentType: "application/json", body: "{}" });

// ── 请求捕获（Node 侧变量） ────────────────────────────────────────────────────
let overviewGets = 0; // GET /api/overview 次数（invalidate 重拉断言：侧栏行数据源）
let renamePost = null; // rename POST body { name }
const deleteReqs = []; // DELETE /api/projects/proj-b 的 deleteFiles query（null = 未带）

const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "zh-CN",
  });
  const page = await context.newPage();

  await page.route(/\/api\/overview$/, (r) => {
    if (r.request().method() !== "GET") return methodNotAllowed(r);
    overviewGets += 1;
    return r.fulfill(json(OVERVIEW));
  });
  await page.route(/\/api\/overview\/subtitles$/, (r) => r.fulfill(json({ subtitles: {} })));
  await page.route(/\/api\/projects$/, (r) => {
    if (r.request().method() !== "GET") return methodNotAllowed(r);
    return r.fulfill(json({ projects: PROJECTS }));
  });
  await page.route(/\/api\/projects\/proj-a\/rename$/, (r) => {
    if (r.request().method() !== "POST") return methodNotAllowed(r);
    try {
      renamePost = JSON.parse(r.request().postData() ?? "null");
    } catch {
      renamePost = null;
    }
    return r.fulfill(
      json({
        project: {
          name: "proj-c",
          path: "/tmp/ar-probe/proj-c",
          agentSessionCount: 2,
          terminalSessionCount: 0,
        },
      }),
    );
  });
  await page.route(/\/api\/projects\/proj-b(?:\?.*)?$/, (r) => {
    if (r.request().method() !== "DELETE") return methodNotAllowed(r);
    const deleteFiles = new URL(r.request().url()).searchParams.get("deleteFiles");
    deleteReqs.push({ deleteFiles });
    return r.fulfill(
      json({ deleted: true, projectName: "proj-b", filesDeleted: deleteFiles === "true" }),
    );
  });
  await page.route(/\/api\/state\/overview\/pinned-sessions$/, (r) =>
    r.fulfill(json({ sessions: [] })),
  );
  await page.route(/\/api\/approvals$/, (r) => r.fulfill(json({ approvals: [] })));

  // ── 登录（密码自读不打印）→ 桌面全局布局（`/`，项目行常驻 side 顶部） ──
  await page.goto(`${WEB_ORIGIN}/`);
  await page.locator("input[type='password']").fill(await readAppPassword());
  await page.locator("button[type='submit']").click();
  await page.waitForSelector("nav.side", { timeout: 20000 });
  const rowA = page.locator("nav.side .srow2").filter({ hasText: "proj-a" });
  const rowB = page.locator("nav.side .srow2").filter({ hasText: "proj-b" });
  await rowA.waitFor({ timeout: 10000 });
  await page.waitForTimeout(600); // overview/projects 首屏数据落定

  /** 当前打开的 ProjectRowMenu 浮卡信息（portal 在 body 末尾；null = 未开）。 */
  const readMenu = () =>
    page.evaluate(() => {
      const el = [...document.querySelectorAll('[data-slot="popover-content"]')].at(-1);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const probe = document.createElement("div");
      probe.style.background = "var(--menu)";
      document.body.appendChild(probe);
      const tokenBg = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return {
        width: r.width,
        top: r.top,
        left: r.left,
        bg: getComputedStyle(el).backgroundColor,
        tokenBg,
        items: [...el.querySelectorAll("button")].map((b) => b.textContent?.trim() ?? ""),
      };
    });

  /** 等历史浮卡退场后右键行打开菜单（per-row ProjectRowMenu，单实例在场）。 */
  async function openRowMenu(row) {
    await page
      .waitForFunction(
        () => document.querySelectorAll('[data-slot="popover-content"]').length === 0,
        { timeout: 3000 },
      )
      .catch(() => {});
    await row.click({ button: "right" });
    await page
      .locator('[data-slot="popover-content"]')
      .first()
      .waitFor({ timeout: 5000 })
      .catch(() => {});
    await page.waitForTimeout(400); // 入场 spring（120ms）播完再取几何
  }

  // ── P1-P6：右键开菜单 / 三项 / 宽 176 / bg=--menu / 锚定几何 / 点外部收起 ──
  const boxA = await rowA.boundingBox();
  ok(boxA !== null, "P0 proj-a 行渲染（mock 2 实例 1 running）");
  const clickX = boxA.x + 60;
  const clickY = boxA.y + 8;
  await page.mouse.click(clickX, clickY, { button: "right" });
  await page
    .locator('[data-slot="popover-content"]')
    .first()
    .waitFor({ timeout: 5000 })
    .catch(() => {});
  await page.waitForTimeout(400);
  const menu = await readMenu();
  ok(menu !== null, "P1 右键 .srow2 → ProjectRowMenu 开");
  ok(
    menu !== null && menu.items.join("/") === "打开/重命名…/删除…",
    `P2 菜单三项 = 打开/重命名…/删除…（实际 ${menu ? menu.items.join("/") || "空" : "未开"}）`,
  );
  ok(menu !== null && menu.width === 176, `P3 浮卡宽 176（实际 ${menu?.width}）`);
  ok(
    menu !== null && menu.bg === menu.tokenBg,
    `P4 容器 bg = --menu token（实际 ${menu?.bg} vs token ${menu?.tokenBg}）`,
  );
  ok(
    menu !== null && Math.abs(menu.top - (clickY + 6)) <= 12,
    `P5 锚定几何 top ≈ 右键 y+6（实际 ${menu?.top} vs 期望 ${clickY + 6} ±12）`,
  );
  await page.mouse.click(20, 20);
  await page
    .waitForSelector('[data-slot="popover-content"]', { state: "detached", timeout: 3000 })
    .catch(() => {});
  const menuGone = await page.evaluate(
    () => document.querySelectorAll('[data-slot="popover-content"]').length === 0,
  );
  ok(menuGone, "P6 点外部收起");

  // ── P7-P13：重命名流转（proj-a running=1 → 影响提醒 → RenameDialog → POST → invalidate） ──
  await openRowMenu(rowA);
  await page.getByRole("menuitem", { name: "重命名…" }).click();
  const impact = page.locator('[data-slot="dialog-content"]').filter({ hasText: "会话历史保留" });
  await impact.waitFor({ timeout: 5000 }).catch(() => {});
  const impactText = (await impact.innerText().catch(() => "")) ?? "";
  ok(
    impactText.includes("将关闭全部会话实例（2 个 · 其中 1 个运行中）"),
    `P7 影响提醒行1 = 关全部实例（2 实例 1 running；实际 ${impactText.split("\n").slice(0, 3).join(" ").slice(0, 80)}）`,
  );
  ok(impactText.includes("会话历史保留，项目归属将更新为新名称。"), "P8 影响提醒行2 = 历史保留");
  await impact.getByRole("button", { name: "继续" }).click();
  const renameInput = page.locator('[data-slot="dialog-content"] input[type="text"]');
  await renameInput.waitFor({ timeout: 5000 }).catch(() => {});
  const prefill = await renameInput.inputValue().catch(() => null);
  ok(prefill === "proj-a", `P9 RenameDialog 预填 proj-a（实际 ${prefill}）`);
  // 重名守卫（siblings 接线佐证）：proj-b 已是既有项目 → 行内红字 + 提交禁用。
  const submitBtn = page.getByRole("button", { name: "重命名", exact: true });
  await renameInput.fill("proj-b");
  await page.waitForTimeout(150);
  const renameDlgText =
    (await page
      .locator('[data-slot="dialog-content"]')
      .innerText()
      .catch(() => "")) ?? "";
  const disabledOnConflict = await submitBtn.isDisabled();
  ok(
    renameDlgText.includes("同名文件或文件夹已存在") && disabledOnConflict,
    `P10 重名守卫（siblings=其他项目名；红字=${renameDlgText.includes("同名文件或文件夹已存在")} disabled=${disabledOnConflict}）`,
  );
  await renameInput.fill("proj-c");
  await submitBtn.click();
  const renameArrived = await waitFor(() => renamePost !== null);
  ok(
    renameArrived && renamePost !== null && renamePost.name === "proj-c",
    `P11 POST /api/projects/proj-a/rename body name（实际 ${JSON.stringify(renamePost)}）`,
  );
  // 桌面侧栏行数据源 = overview（常驻 ["projects"] 列表查询已随 review P2-3 删除）。
  const refetched = await waitFor(() => overviewGets >= 2);
  ok(refetched, `P12 rename 成功 invalidate → GET /api/overview 重拉（实际 ${overviewGets} 次）`);
  await page
    .locator('[data-slot="dialog-content"]')
    .filter({ hasText: "同步 Git 工作区" })
    .waitFor({ state: "detached", timeout: 3000 })
    .catch(() => {});
  const renameGone = await page.evaluate(
    () =>
      !document.querySelector('[data-slot="dialog-content"] input[type="text"]') &&
      !document.querySelector('[data-slot="popover-content"]'),
  );
  ok(renameGone, "P13 提交后 RenameDialog 关闭且菜单不残留");

  // ── P14-P19：删除流转（proj-b 0 实例 → 居中 Alert → checkbox 升级 → DELETE） ──
  await openRowMenu(rowB);
  await page.getByRole("menuitem", { name: "删除…" }).click();
  const delDlg = page
    .locator('[data-slot="dialog-content"]')
    .filter({ hasText: "删除项目「proj-b」" });
  await delDlg.waitFor({ timeout: 5000 }).catch(() => {});
  const delBox = await delDlg.boundingBox().catch(() => null);
  ok(
    delBox !== null && delBox.y < 450,
    `P14 删除确认 = 居中 Alert 非 sheet（top ${delBox?.y} < 视口半高 450）`,
  );
  const keepBtn = delDlg.getByRole("button", { name: "移出项目（保留文件）" });
  await keepBtn.waitFor({ timeout: 5000 }).catch(() => {});
  ok(await keepBtn.isVisible().catch(() => false), "P15 未勾选主按钮 = 移出项目（保留文件）");
  // 不勾选直接确认 → DELETE 不带 deleteFiles（磁盘保留路径）。
  await keepBtn.click();
  const d1 = await waitFor(() => deleteReqs.length >= 1);
  ok(
    d1 && deleteReqs[0]?.deleteFiles === null,
    `P16 确认未勾选 → DELETE /api/projects/proj-b 无 query（实际 ${JSON.stringify(deleteReqs[0] ?? null)}）`,
  );
  // 重开（Radix Portal 重挂 → checkbox 复位）→ 勾选 → 主按钮红色升级 → deleteFiles=true。
  await delDlg.waitFor({ state: "detached", timeout: 3000 }).catch(() => {});
  await openRowMenu(rowB);
  await page.getByRole("menuitem", { name: "删除…" }).click();
  const delDlg2 = page
    .locator('[data-slot="dialog-content"]')
    .filter({ hasText: "删除项目「proj-b」" });
  await delDlg2.waitFor({ timeout: 5000 }).catch(() => {});
  const ckBtn = delDlg2.getByRole("checkbox", { name: "同时删除磁盘上的项目文件" });
  await ckBtn.waitFor({ timeout: 5000 }).catch(() => {});
  await ckBtn.click();
  const destroyBtn = delDlg2.getByRole("button", { name: "删除项目（含磁盘文件，不可恢复）" });
  await destroyBtn.waitFor({ timeout: 5000 }).catch(() => {});
  const destroyCls = (await destroyBtn.getAttribute("class").catch(() => "")) ?? "";
  ok(
    destroyCls.includes("bg-error"),
    `P17 勾选后主按钮 bg-error（实际 class 含 error=${destroyCls.includes("bg-error")}）`,
  );
  await destroyBtn.click();
  const d2 = await waitFor(() => deleteReqs.length >= 2);
  ok(
    d2 && deleteReqs[1]?.deleteFiles === "true",
    `P18 勾选确认 → DELETE ?deleteFiles=true（实际 ${JSON.stringify(deleteReqs[1] ?? null)}）`,
  );
  const refetchedAfterDelete = await waitFor(() => overviewGets >= 3);
  ok(
    refetchedAfterDelete,
    `P19 delete 成功 invalidate → GET /api/overview 重拉（实际 ${overviewGets} 次）`,
  );
} finally {
  await browser.close();
}
console.log(allPass ? "\nALL PASS" : "\nFAILED");
process.exit(allPass ? 0 : 1);
