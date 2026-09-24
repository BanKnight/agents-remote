// 探针：右栏 Inspector 行菜单三段覆盖 + 无历史同构（PASS/FAIL 断言，入库版）。
// 第十一轮复验问题⑤（用户拍板）：右栏「文件/Git/Wiki」行都要 05e 同款右键/长按菜单；
// 右栏无「历史」段（与 iPhone focus 工具同构，多端同构只是容器不同）。
// 断言：①右栏 seg4 恰三段 ②Files 行右键 5 项菜单 ③Git 变更行右键 2 项 + 复制路径落剪贴板
// ④Wiki 行右键 2 项 + 「打开页面」进详情态 ⑤触屏长按（合成 pointerType:touch pointerdown）
// 开菜单。git/wiki 数据走 route mock（不依赖环境真实 repo 状态）。密码自读不打印。
// 用法: bun scripts/probe-inspector-row-menus.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const projectName = "proj1";

let allPass = true;
function ok(cond, label) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) allPass = false;
  return cond;
}

async function setupMocks(page) {
  await page.route(/\/api\/overview$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ projectNames: [projectName], candidates: [] }),
    }),
  );
  await page.route(/\/api\/overview\/subtitles$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ subtitles: {} }),
    }),
  );
  await page.route(/\/api\/approvals$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ approvals: [] }),
    }),
  );
  await page.route(/\/api\/approvals\/stream$/, (r) => r.abort());
  await page.route(/\/api\/projects\/proj1\/agent-sessions\?.*$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sessions: [], total: 0 }),
    }),
  );
  await page.route(/\/api\/projects\/proj1\/terminal-sessions\?.*$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sessions: [], total: 0 }),
    }),
  );
  // 文件段：1 目录 + 2 文件（文件行 readOnly=false → 05e 5 项菜单）。
  await page.route(/\/api\/projects\/proj1\/files/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        entries: [
          { name: "src", path: "src", type: "directory" },
          { name: "index.ts", path: "index.ts", type: "file" },
          { name: "app.tsx", path: "app.tsx", type: "file" },
        ],
        path: "",
      }),
    }),
  );
  // Git 段：2 变更行（worktree modified + staged renamed）。
  await page.route(/\/api\/projects\/proj1\/git\/diff$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        repository: true,
        projectName,
        files: [
          {
            path: "src/index.ts",
            status: "modified",
            scope: "worktree",
            addedLines: 3,
            removedLines: 1,
          },
          {
            path: "README.md",
            previousPath: "README.old.md",
            status: "renamed",
            scope: "staged",
            addedLines: null,
            removedLines: null,
          },
        ],
        branch: { name: "main" },
      }),
    }),
  );
  // 宽泛 git file-diff route 不 mock：「查看 diff」点开不在断言路径，且 LIFO 先匹配会
  // 抢 /git/diff 列表请求（GitDiffPanel 拿到单文件形状 → 无行）。
  // Wiki 段：2 页 + 单页内容（「打开页面」进详情态断言）。
  await page.route(/\/api\/projects\/proj1\/wiki$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        pages: [
          { slug: "index-1", title: "架构总览", tags: ["core"], updated: "2026-09-24" },
          { slug: "guide", title: "指南", tags: [], updated: "2026-09-23" },
        ],
      }),
    }),
  );
  await page.route(/\/api\/projects\/proj1\/wiki\/index-1$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        slug: "index-1",
        frontmatter: { title: "架构总览", tags: ["core"], updated: "2026-09-24" },
        body: "# 架构总览\n\n正文。",
      }),
    }),
  );
}

/** 当前打开的行菜单（role=menu 全局找——Radix Content 是 portal 渲染在 body 末尾）。 */
async function readMenu(page) {
  return page.evaluate(() => {
    const menus = [...document.querySelectorAll("[role='menu']")].filter((el) => {
      const s = getComputedStyle(el);
      return s.display !== "none" && s.visibility !== "hidden";
    });
    const menu = menus[menus.length - 1];
    if (!menu) return { open: false, items: [] };
    return {
      open: true,
      items: [...menu.querySelectorAll("[role='menuitem']")].map((el) => el.textContent.trim()),
    };
  });
}

const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "zh-CN",
  });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const page = await context.newPage();
  await setupMocks(page);
  // 右栏默认展开（收起态 atomWithLocalOnlyStorage 默认 true；RailButton 交互不在本探针
  // 断言目标内——m9-d 已覆盖），init script 注入展开态，少一个交互依赖。
  await page.addInitScript(() => localStorage.setItem("workbenchRightCollapsed", "false"));
  await page.goto(`${WEB_ORIGIN}/`);
  // locale 无关定位（zh-CN 下 label 是「密码」/「登录」）。
  await page.locator("input[type='password']").fill(await readAppPassword());
  await page.locator("button[type='submit']").click();
  await page.waitForTimeout(600);
  await page.goto(`${WEB_ORIGIN}/projects/${projectName}?v=1`);
  await page.waitForSelector("nav.side", { timeout: 15000 });
  await page.waitForFunction(() => document.querySelectorAll("main > div > aside").length === 2, {
    timeout: 8000,
  });

  // ① 右栏 seg4 恰三段（文件/Git/Wiki），无「历史」。
  const seg = await page.evaluate(() => {
    const aside = document.querySelectorAll("main > div > aside")[1];
    const seg = aside?.querySelector(".seg4");
    return seg ? [...seg.querySelectorAll("span")].map((s) => s.textContent.trim()) : null;
  });
  ok(seg !== null, "S1 右栏 seg4 渲染");
  ok(
    seg?.join(",") === "文件,Git,Wiki",
    `S2 右栏恰三段 文件/Git/Wiki（实际 ${JSON.stringify(seg)}）`,
  );
  ok(!seg?.includes("历史"), "S3 右栏无「历史」段（与 iPhone 同构）");

  // ② Files 段：文件行右键 → 5 项菜单（预览/重命名/移动/上传/删除）。
  const filesTab = page
    .locator("main > div > aside")
    .nth(1)
    .locator(".seg4 span", { hasText: "文件" });
  await filesTab.click();
  await page.waitForSelector("main > div > aside:nth-of-type(2) [role='button']", {
    timeout: 5000,
  });
  const fileRow = page
    .locator("main > div > aside")
    .nth(1)
    .getByRole("button")
    .filter({ hasText: "index.ts" })
    .first();
  await fileRow.click({ button: "right" });
  await page.waitForTimeout(400);
  let menu = await readMenu(page);
  ok(menu.open, "F1 Files 段文件行右键开菜单");
  ok(
    menu.items.length >= 4,
    `F2 Files 菜单项 ≥4（实际 ${menu.items.length}：${menu.items.join("/")}）`,
  );
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // ③ Git 段：变更行右键 → 2 项（查看 diff/复制路径）+ 复制路径落剪贴板。
  await page.locator("main > div > aside").nth(1).locator(".seg4 span", { hasText: "Git" }).click();
  await page.waitForTimeout(600);
  const gitRow = page
    .locator("main > div > aside")
    .nth(1)
    .getByRole("button")
    .filter({ hasText: "src/index.ts" })
    .first();
  ok((await gitRow.count()) > 0, "G0 Git 变更行渲染");
  await gitRow.click({ button: "right" });
  await page.waitForTimeout(400);
  menu = await readMenu(page);
  ok(menu.open, "G1 Git 变更行右键开菜单");
  ok(
    menu.items.length === 2,
    `G2 Git 菜单 2 项（实际 ${menu.items.length}：${menu.items.join("/")}）`,
  );
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.evaluate(() => navigator.clipboard.writeText("sentinel"));
  const copyItem = page.getByRole("menuitem").filter({ hasText: "复制路径" }).first();
  await copyItem.click();
  await page.waitForTimeout(300);
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  ok(clip === "proj1/src/index.ts", `G3 复制路径 = proj1/src/index.ts（实际 ${clip}）`);

  // ④ Wiki 段：页面行右键 → 2 项 + 「打开页面」进详情态。
  await page
    .locator("main > div > aside")
    .nth(1)
    .locator(".seg4 span", { hasText: "Wiki" })
    .click();
  await page.waitForTimeout(600);
  const wikiRow = page
    .locator("main > div > aside")
    .nth(1)
    .getByRole("button")
    .filter({ hasText: "架构总览" })
    .first();
  ok((await wikiRow.count()) > 0, "W0 Wiki 页面行渲染");
  await wikiRow.click({ button: "right" });
  await page.waitForTimeout(400);
  menu = await readMenu(page);
  ok(menu.open, "W1 Wiki 页面行右键开菜单");
  ok(
    menu.items.length === 2,
    `W2 Wiki 菜单 2 项（实际 ${menu.items.length}：${menu.items.join("/")}）`,
  );
  const openItem = page.getByRole("menuitem").filter({ hasText: "打开页面" }).first();
  await openItem.click();
  await page.waitForTimeout(500);
  const detailBack = await page.locator("main > div > aside").nth(1).getByText("返回列表").count();
  ok(detailBack > 0, "W3 「打开页面」进详情态（返回列表按钮在）");

  // ⑤ 触屏长按（合成 pointerType:touch pointerdown 500ms 阈值）：Wiki 列表已切详情态，
  // 回列表后长按页面行 → 菜单开（iPad 右栏唯一菜单入口）。
  await page.locator("main > div > aside").nth(1).getByText("返回列表").first().click();
  await page.waitForTimeout(500);
  const wikiRow2 = page
    .locator("main > div > aside")
    .nth(1)
    .getByRole("button")
    .filter({ hasText: "指南" })
    .first();
  await wikiRow2.dispatchEvent("pointerdown", {
    pointerType: "touch",
    clientX: 700,
    clientY: 300,
    bubbles: true,
    pointerId: 7,
  });
  await page.waitForTimeout(800);
  menu = await readMenu(page);
  ok(menu.open, "L1 触屏长按（pointerType:touch）开菜单");
  await page.keyboard.press("Escape");
} finally {
  await browser.close();
}
console.log(allPass ? "\nALL PASS" : "\nFAILED");
process.exit(allPass ? 0 : 1);
