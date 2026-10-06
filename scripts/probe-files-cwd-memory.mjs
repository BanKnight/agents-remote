// 探针：移动端文件树 cwd 记忆（后台重开停留）+ 路径不存在回退。
// 断言（zh-CN locale，iPhone 12 Pro 390×844，全新 context 无 SW）：
//  1. 项目 Files tab 逐级进入 A→B→C→D，breadcrumb 停在 D。
//  2. reload 后仍停在 D（localStorage 记忆——本任务核心）。
//  3. 切「总览」tab 再切回「文件」仍停在 D（跨 tab 保活）。
//  4. 切项目（proj2）Files tab 回根（按项目 key 隔离，不串项目）。
//  5. 回 proj1 Files tab 仍停在 D（记忆按 key 分组）。
//  6. 记忆路径不存在（mock 该目录 404）reload 后回退根目录（边界处理）。
// 密码自读不打印。用法：bun scripts/probe-files-cwd-memory.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const EXEC =
  "/home/deploy/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell";

let allPass = true;
function record(ok, label) {
  if (!ok) allPass = false;
  console.log(`  ${ok ? "✓" : "✗"} ${label}`);
  return ok;
}

// 目录树 mock：proj1 = A/B/C/D 链，proj2 = X/y。deletedPath 非空时该路径返回 404。
function buildTreeMocks({ deletedPath = null } = {}) {
  const proj1 = (p) => {
    const entries =
      p === ""
        ? [
            { name: "A", path: "A", type: "directory" },
            { name: "file1.ts", path: "file1.ts", type: "file" },
          ]
        : p === "A"
          ? [{ name: "B", path: "A/B", type: "directory" }]
          : p === "A/B"
            ? [{ name: "C", path: "A/B/C", type: "directory" }]
            : p === "A/B/C"
              ? [{ name: "D", path: "A/B/C/D", type: "directory" }]
              : p === "A/B/C/D"
                ? [{ name: "deep.ts", path: "A/B/C/D/deep.ts", type: "file" }]
                : [];
    return {
      projectName: "proj1",
      path: p,
      parentPath: p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : null,
      entries,
    };
  };
  const proj2 = (p) => {
    const entries =
      p === ""
        ? [
            { name: "X", path: "X", type: "directory" },
            { name: "y.ts", path: "y.ts", type: "file" },
          ]
        : p === "X"
          ? [{ name: "z.ts", path: "X/z.ts", type: "file" }]
          : [];
    return {
      projectName: "proj2",
      path: p,
      parentPath: p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : null,
      entries,
    };
  };
  return (url) => {
    const m = url.pathname.match(/^\/api\/projects\/([^/]+)\/files$/);
    if (!m) return null;
    const project = decodeURIComponent(m[1]);
    const p = url.searchParams.get("path") ?? "";
    if (deletedPath !== null && p === deletedPath) {
      return { status: 404, body: null };
    }
    const data = project === "proj1" ? proj1(p) : project === "proj2" ? proj2(p) : null;
    if (!data) return { status: 404, body: null };
    return { status: 200, body: data };
  };
}

async function setup(page) {
  const state = { deletedPath: null };
  // 登录走真实后端（43012 → api 43011，密码自读）。仅 mock 项目数据：
  // 1) /api/overview 提供 proj1/proj2 两个假项目（隔离断言用）；2) 文件树目录 mock。
  await page.route(/\/api\/overview$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ projectNames: ["proj1", "proj2"], candidates: [] }),
    }),
  );
  // 项目文件列表（目录树），按 path query 返回；404 flag 由 state.deletedPath 控制。
  await page.route(/\/api\/projects\/[^/]+\/files(?:\?.*)?$/, (r) => {
    const handler = buildTreeMocks({ deletedPath: state.deletedPath });
    const hit = handler(new URL(r.request().url()));
    if (!hit) return r.fulfill({ status: 404, contentType: "application/json", body: "{}" });
    return r.fulfill({
      status: hit.status,
      contentType: "application/json",
      body: hit.status === 200 ? JSON.stringify(hit.body) : JSON.stringify({}),
    });
  });
  return state;
}

// 读当前路径：header .crumb chip = <b>{projectKey}</b> + segment buttons（无 svg；搜索
// 按钮 aria-label=搜索且含 svg，排除）。last = 最后一个 segment；根目录 = 无段。
async function readPath(page) {
  return await page.evaluate(() => {
    const crumb = document.querySelector(".crumb");
    if (!crumb) return { last: null, segments: [], hasCrumb: false };
    // 03o crumb 形态（v1.5 批 10 适配）：段 buttons 在前、当前段 <b> 收尾；根段 = .cico
    // 项目图标 button（含 svg，排除）。当前段读 <b>（此前读「buttons 末段」= 当前段父级，
    // 恒差一级）。
    const segments = Array.from(crumb.querySelectorAll("button"))
      .filter((b) => !b.querySelector("svg"))
      .map((b) => (b.textContent ?? "").trim())
      .filter((s) => s.length > 0);
    const current = crumb.querySelector("b")?.textContent?.trim() ?? null;
    return {
      last: current ?? (segments.length > 0 ? segments[segments.length - 1] : null),
      segments,
      hasCrumb: true,
    };
  });
}

async function waitLast(page, expected) {
  await page
    .waitForFunction(
      (exp) => {
        const crumb = document.querySelector(".crumb");
        if (!crumb) return exp === null;
        // 与 readPath 同款适配：当前段读 <b>（buttons 末段 = 当前段父级，恒差一级）。
        const b = crumb.querySelector("b");
        const last = b?.textContent?.trim() ?? null;
        return last === exp;
      },
      expected,
      { timeout: 8000 },
    )
    .catch(() => {});
}

// 进入项目 Files 视图并逐级点击目录链。入口 = row2 检视面板 ticon（v1.4 批2 IA：
// 文件树收进 InspectionPanel，默认 files 标签激活）。
async function openProjectFiles(page, projectName) {
  await page.goto(`${WEB_ORIGIN}/projects/${projectName}`);
  // v1.5 批 2 IA 换代适配（2026-10-07 批 10 顺手修）：project scope 无 <nav> tabbar
  //（会话现场全屏）→ 就绪标志改等行1 .nav .back（‹ 项目）。
  await page.waitForSelector(".nav .back", { timeout: 8000 });
  await page
    .locator('button[aria-label="检视面板"], button[aria-label="Inspection panel"]')
    .first()
    .click({ timeout: 8000 });
  await page.waitForSelector('[data-inspection-panel="open"] [data-mobile-tool="files"]', {
    timeout: 8000,
  });
  await page.waitForTimeout(500);
}

// 刷新后面板 open 是内存态（不持久化）→ 重开面板（row2 ticon）。
async function reopenPanel(page) {
  await page
    .locator('button[aria-label="检视面板"], button[aria-label="Inspection panel"]')
    .first()
    .click({ timeout: 8000 });
  await page.waitForSelector('[data-inspection-panel="open"] [data-mobile-tool="files"]', {
    timeout: 8000,
  });
  await page.waitForTimeout(400);
}

// 点击目录行进入下一级（移动文件工具面板 [data-mobile-tool="files"] 内 .frow 行，
// .p.dir 文本精确匹配；§6.12k 复核——v1 时代 aside drawer 形制已退役）。
async function enterDir(page, dirName) {
  await page
    .locator('[data-mobile-tool="files"] .frow .p.dir')
    .filter({ hasText: dirName })
    .first()
    .click({ timeout: 4000 });
  await page.waitForTimeout(450);
}

async function run() {
  const browser = await chromium.launch({ executablePath: EXEC });
  try {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      locale: "zh-CN",
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    });
    const page = await ctx.newPage();
    const state = await setup(page);
    await page.goto(`${WEB_ORIGIN}/`);
    await page.waitForSelector('input[type="password"]', { timeout: 15000 });
    await page.getByLabel("访问密码").fill(await readAppPassword());
    await page.getByRole("button", { name: "登录" }).click();
    await page.waitForTimeout(700);

    console.log("\n===== 1. 项目 Files tab 逐级进入 A→B→C→D =====");
    await openProjectFiles(page, "proj1");
    await enterDir(page, "A");
    await waitLast(page, "A");
    await enterDir(page, "B");
    await waitLast(page, "B");
    await enterDir(page, "C");
    await waitLast(page, "C");
    await enterDir(page, "D");
    await waitLast(page, "D");
    record((await readPath(page)).last === "D", "文件树停在 D（breadcrumb 最后段 = D）");

    console.log("\n===== 2. reload 后仍停在 D（localStorage 记忆）=====");
    await page.reload();
    await reopenPanel(page);
    await waitLast(page, "D");
    record((await readPath(page)).last === "D", "reload 后仍停在 D（记忆核心断言）");

    console.log("\n===== 3. 关面板（‹ 工作台）再开 仍停在 D =====");
    // 面板开关语义（v1.4 批2）：‹ 工作台 关面板（零销毁）；row2 ticon 重开，cwd 记忆保留。
    await page
      .locator('[data-inspection-panel="open"] .nav .back')
      .first()
      .click({ timeout: 4000 });
    await page.waitForSelector('[data-inspection-panel="closed"]', {
      state: "attached",
      timeout: 4000,
    });
    await reopenPanel(page);
    await waitLast(page, "D");
    record((await readPath(page)).last === "D", "面板开关保活（关→开仍 D）");

    console.log("\n===== 4. 切项目 proj2：Files tab 回根（按项目隔离）=====");
    await openProjectFiles(page, "proj2");
    await waitLast(page, null);
    const p2 = await readPath(page);
    record(p2.last === null, `proj2 Files 回根（last=${p2.last ?? "null"}，不串 proj1 的 D）`);

    console.log("\n===== 5. 回 proj1 Files tab 仍停在 D（记忆按 key 分组）=====");
    await openProjectFiles(page, "proj1");
    await waitLast(page, "D");
    record((await readPath(page)).last === "D", "回 proj1 仍停在 D（按项目 key 分组）");

    console.log("\n===== 6. 记忆路径不存在（mock 404）→ 回退根目录 =====");
    // 当前 proj1 记忆在 D；让 D 变 404 模拟目录被删，reload 后应回退根。
    state.deletedPath = "A/B/C/D";
    await page.reload();
    await reopenPanel(page);
    await waitLast(page, null);
    const pAfter404 = await readPath(page);
    record(pAfter404.last === null, `路径不存在回退根（last=${pAfter404.last ?? "null"}）`);
    // 回退后 cwd 记忆应已清空（下次重开也在根，不会再撞 404）。
    await page.reload();
    await reopenPanel(page);
    await waitLast(page, null);
    record((await readPath(page)).last === null, "回退后记忆已清空（二次 reload 仍在根）");
  } finally {
    await browser.close();
  }
}

(async () => {
  await run();
  console.log(`\n总计: ${allPass ? "ALL PASS" : "有 FAIL"}`);
  process.exit(allPass ? 0 : 1);
})();
