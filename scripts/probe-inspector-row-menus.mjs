// 探针：右栏 Inspector 行菜单三段覆盖 + 无历史同构（PASS/FAIL 断言，入库版）。
// 第十一轮复验问题⑤（用户拍板）：右栏「文件/Git/Wiki」行都要 05e 同款右键/长按菜单；
// 右栏无「历史」段（与 iPhone focus 工具同构，多端同构只是容器不同）。
// 第十二轮批次 3 适配：右栏三段 render 换共享三件套（project-tool-panels 03o/03m/03p
// 形态，与移动项目工具态同一份），断言对象随组件更新——行定位 .frow、Files 菜单 =
// 03w∪05e 并集、详情态 = 栏内切换（L3WikiReader，批次 4 归一）。
// 断言：①右栏 seg4 恰三段 ②Files 行右键 6 项并集菜单（无 dirty）③Git 变更行右键 2 项 +
// 复制路径落剪贴板 ④Wiki 行右键 2 项 + 「打开页面」进详情态 ⑤触屏长按（合成
// pointerType:touch pointerdown）开菜单 ⑥批次 4+ 同构三段：Git 段最近提交 crow + links
// 「全部历史」→ 栏内历史 → commit 详情逐级弹栈（G6-G10）。git/wiki/log/branches 数据走
// route mock（不依赖环境真实 repo 状态）。密码自读不打印。
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
  // git file-diff（批次 3 右栏「查看 diff」→ 栏内详情态断言）。正则不与列表 `/git/diff$`
  // 重叠（URL 多 /file 段），无 LIFO 抢跑问题。
  await page.route(/\/api\/projects\/proj1\/git\/diff\/file/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        repository: true,
        projectName,
        path: "src/index.ts",
        scope: "worktree",
        status: "modified",
        diff: "@@ -1,3 +1,4 @@\n line",
      }),
    }),
  );
  // git log/branches（批次 4+ 右栏同构三段：最近提交 crow + links「全部历史/分支 (N)」；
  // 历史栈页 log-paged 分页同端点——mock 单页 total=commits.length 无 loadMore）。
  await page.route(/\/api\/projects\/proj1\/git\/log/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        branch: "main",
        total: 2,
        commits: [
          {
            hash: "abc1234",
            message: "最新提交",
            author: "tester",
            relativeTime: "2 小时前",
            isoDate: "2026-09-24",
          },
          {
            hash: "def5678",
            message: "早期提交",
            author: "tester",
            relativeTime: "1 天前",
            isoDate: "2026-09-23",
          },
        ],
      }),
    }),
  );
  await page.route(/\/api\/projects\/proj1\/git\/commit/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        repository: true,
        projectName,
        meta: { hash: "abc1234", message: "最新提交", author: "tester", relativeTime: "2 小时前" },
        files: [{ path: "src/index.ts", status: "modified", addedLines: 3, removedLines: 1 }],
      }),
    }),
  );
  await page.route(/\/api\/projects\/proj1\/git\/branches/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        current: "main",
        branches: [
          {
            name: "main",
            type: "local",
            isCurrent: true,
            upstream: "origin/main",
            ahead: 0,
            behind: 0,
          },
        ],
      }),
    }),
  );
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

/** 菜单几何细读（批 14 统一样式）：条目间分割线（.menu-sep 伪元素全宽直线——divide 系
 *  border 随 item rounded-lg 上翘被真机否决）+ 各项内 svg 在场与 17px 几何。 */
async function readMenuGeometry(page) {
  return page.evaluate(() => {
    const menus = [...document.querySelectorAll("[role='menu']")].filter((el) => {
      const s = getComputedStyle(el);
      return s.display !== "none" && s.visibility !== "hidden";
    });
    const menu = menus[menus.length - 1];
    if (!menu) return { open: false, items: [] };
    const mr = menu.getBoundingClientRect();
    const mb = getComputedStyle(menu).borderLeftWidth;
    return {
      open: true,
      items: [...menu.querySelectorAll("[role='menuitem']")].map((el) => {
        const svg = el.querySelector("svg");
        const after = getComputedStyle(el, "::after");
        const er = el.getBoundingClientRect();
        const cssLeft = parseFloat(after.left);
        return {
          // 分割线 = item 的 ::after：除末项外 content+1px 且负 inset 抵消容器内距——
          // 线左缘 ≈ 菜单 padding box 左缘（全宽直线，不随 item 圆角）。
          sepAfter: after.content !== "none" && after.height === "1px",
          sepFlush:
            Number.isFinite(cssLeft) &&
            Math.abs(er.left + cssLeft - (mr.left + parseFloat(mb))) <= 1.5,
          hasSvg: !!svg,
          // icon 渲染几何尺寸：ShellIcon（span 兜底 [data-shell-icon]→svg size-full 跟随）
          // 与 LucideIcon（svg 兜底）两路径统一 17px 标准档（批 14 code review P2）。
          iconW: svg ? +svg.getBoundingClientRect().width.toFixed(1) : null,
        };
      }),
    };
  });
}

/** 行菜单 open 目标态等待（替代右键后死 sleep，负载时段 400ms 不够会误报；超时不抛——
 * 让 readMenu 返回 open:false 走断言 FAIL，不崩探针）。 */
async function waitMenuOpen(page) {
  await page
    .waitForFunction(
      () =>
        [...document.querySelectorAll("[role='menu']")].some((el) => {
          const s = getComputedStyle(el);
          return s.display !== "none" && s.visibility !== "hidden";
        }),
      { timeout: 5000 },
    )
    .catch(() => {});
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

  // ① 右栏 ptabs（v1.4 批3：seg4 分段退役，PanelTabBar 动态标签条 05:99）：默认 [文件]，
  // ＋ 菜单含 Git/Wiki（三段语义由菜单覆盖），无「历史」。
  const readPanelTabs = () =>
    page.evaluate(() => {
      const aside = document.querySelectorAll("main > div > aside")[1];
      return aside
        ? [...aside.querySelectorAll('[role="tab"]')].map((b) => b.getAttribute("aria-label"))
        : null;
    });
  const seg = await readPanelTabs();
  ok(seg !== null, "S1 右栏 ptabs 渲染");
  // 三基础标签常驻（2026-09-29 真机反馈②，a4e9e69）：默认 [文件,Git,Wiki]，＋ 菜单点基础
  // 段 = 激活幂等（加签前后列表不变）。
  ok(
    seg?.join(",") === "文件,Git,Wiki",
    `S2 右栏 ptabs 默认 = [文件,Git,Wiki]（三基础常驻；实际 ${JSON.stringify(seg)}）`,
  );
  ok(!seg?.includes("历史"), "S3 右栏无「历史」标签（与 iPhone 同构）");
  // ＋ 菜单可加 Git/Wiki（基础三段语义由 03ob2 菜单承载）——点「Git」加签供 G 段使用。
  await page.locator("main > div > aside").nth(1).getByRole("button", { name: "新建标签" }).click();
  await waitMenuOpen(page);
  const plusItems = await readMenu(page);
  ok(
    plusItems.items.join(",").includes("Git") && plusItems.items.join(",").includes("Wiki"),
    `S4 ＋ 菜单含 Git/Wiki（实际 ${plusItems.items.join("/")}）`,
  );
  await page.getByRole("menuitem", { name: "Git" }).click();
  await page.waitForTimeout(400);
  const segAfterGit = await readPanelTabs();
  ok(
    segAfterGit?.join(",") === "文件,Git,Wiki",
    `S5 ＋ 菜单点 Git = 激活常驻 Git（仍 [文件,Git,Wiki]；实际 ${JSON.stringify(segAfterGit)}）`,
  );

  // ② Files 标签（点回文件标签）：文件行右键 → 5 项菜单（预览/重命名/移动/上传/删除）。
  const aside = page.locator("main > div > aside").nth(1);
  await aside.getByRole("tab", { name: "文件" }).click();
  await page.waitForTimeout(300);
  // 第十二轮批次 3:右栏三段换共享三件套(03o/03m/03p 形态)——行定位从 ListRow 显式
  // role=button 换 .frow 原生 button(隐式 role,getByRole 仍可达)。
  await page.waitForSelector("main > div > aside:nth-of-type(2) .frow", {
    timeout: 5000,
  });
  const fileRow = page
    .locator("main > div > aside")
    .nth(1)
    .getByRole("button")
    .filter({ hasText: "index.ts" })
    .first();
  await fileRow.click({ button: "right" });
  await waitMenuOpen(page);
  let menu = await readMenu(page);
  ok(menu.open, "F1 Files 段文件行右键开菜单");
  // 03w ∪ 05e 并集(批次 2):mock 文件行不 dirty → 无「在 Git 中查看 diff」= 6 项。
  ok(
    menu.items.length === 6 && menu.items.some((x) => x.includes("上传文件")),
    `F2 Files 菜单并集 6 项含上传（实际 ${menu.items.length}：${menu.items.join("/")}）`,
  );
  // 批 14 统一样式：条目间分割线 = .menu-sep 伪元素全宽直线（原型 .ctx .row+.row）+ 全行 17px 图标。
  const geo = await readMenuGeometry(page);
  ok(
    geo.open &&
      geo.items.length > 1 &&
      geo.items.slice(0, -1).every((x) => x.sepAfter && x.sepFlush) &&
      geo.items[geo.items.length - 1].sepAfter === false,
    `F2b 条目间分割线全宽直线（除末项 ::after 1px 且左缘贴菜单边；实际 ${JSON.stringify(geo.items.map((x) => [x.sepAfter, x.sepFlush]))}）`,
  );
  ok(
    geo.open && geo.items.every((x) => x.hasSvg),
    `F2c 全行带图标 svg（实际 ${JSON.stringify(geo.items.map((x) => x.hasSvg))}）`,
  );
  ok(
    geo.open && geo.items.every((x) => x.iconW !== null && Math.abs(x.iconW - 17) <= 1),
    `F2d 图标渲染尺寸 17px 标准档（ShellIcon 裸传经 span 兜底提升；实际 ${JSON.stringify(geo.items.map((x) => x.iconW))}）`,
  );
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // ③ Git 标签（＋ 菜单加签后激活）：变更行右键 → 2 项（查看 diff/复制路径）+ 复制路径落剪贴板。
  await aside.getByRole("tab", { name: "Git" }).click();
  await page.waitForTimeout(600);
  const gitRow = page
    .locator("main > div > aside")
    .nth(1)
    .getByRole("button")
    .filter({ hasText: "src/index.ts" })
    .first();
  ok((await gitRow.count()) > 0, "G0 Git 变更行渲染");
  await gitRow.click({ button: "right" });
  await waitMenuOpen(page);
  menu = await readMenu(page);
  ok(menu.open, "G1 Git 变更行右键开菜单");
  // 03m3 放弃更改（v1.4 批5）后 Git 行菜单 = 3 项（查看 diff/复制路径/放弃更改…）。
  ok(
    menu.items.length === 3 && menu.items.some((x) => x.includes("放弃更改")),
    `G2 Git 菜单 3 项含放弃更改（实际 ${menu.items.length}：${menu.items.join("/")}）`,
  );
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.evaluate(() => navigator.clipboard.writeText("sentinel"));
  const copyItem = page.getByRole("menuitem").filter({ hasText: "复制路径" }).first();
  await copyItem.click();
  await page.waitForTimeout(300);
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  ok(clip === "proj1/src/index.ts", `G3 复制路径 = proj1/src/index.ts（实际 ${clip}）`);

  // 批次 3：菜单「查看 diff」→ 栏内 diff 详情态（03r 形态：meta + DiffContent）→ 返回回列表。
  await gitRow.click({ button: "right" });
  await waitMenuOpen(page);
  const diffItem = page.getByRole("menuitem").filter({ hasText: "查看 diff" }).first();
  await diffItem.click();
  await page
    .locator("main > div > aside")
    .nth(1)
    .getByText("返回变更文件列表")
    .waitFor({ timeout: 5000 });
  // DiffContent 渲染 <table>(diff 行表)——右栏 aside 内出现 table = 详情态内容在。
  const diffBody = await page.locator("main > div > aside").nth(1).locator("table").count();
  ok(diffBody > 0, "G4 「查看 diff」进栏内 diff 详情态（diff 内容在）");
  await page.locator("main > div > aside").nth(1).getByText("返回变更文件列表").click();
  // 返回列表目标态等待（替代死 sleep）。
  await page
    .locator("main > div > aside")
    .nth(1)
    .locator(".frow")
    .first()
    .waitFor({ timeout: 5000 })
    .catch(() => {});
  const backRows = await page.locator("main > div > aside").nth(1).locator(".frow").count();
  ok(backRows > 0, "G5 diff 详情态返回回变更列表");

  // 批次 4+（用户复验拍板：右栏与移动同构承载 git 三段）——最近提交 crow + links 全部历史。
  const recent = await page.locator("main > div > aside").nth(1).locator("button.crow").count();
  ok(recent >= 1, "G6 Git 段最近提交 crow 渲染（右栏同构三段）");
  await page.locator("main > div > aside").nth(1).getByRole("button", { name: "历史列表" }).click();
  const history = page.locator("main > div > aside").nth(1).locator('[data-role="l3-git-history"]');
  await history.waitFor({ timeout: 5000 }).catch(() => {});
  ok((await history.count()) > 0, "G7 「历史列表」进栏内历史（03t 同组件；gacts 文案）");
  await history.locator("button.crow").first().click();
  const commitDetail = page
    .locator("main > div > aside")
    .nth(1)
    .locator('[data-role="l3-git-commit"]');
  await commitDetail.waitFor({ timeout: 5000 }).catch(() => {});
  ok((await commitDetail.count()) > 0, "G8 历史点 commit 进栏内详情（03u 同组件）");
  await page.locator("main > div > aside").nth(1).getByText("返回历史").click();
  ok((await history.count()) > 0, "G9 返回历史逐级弹栈");
  // 回列表态再断言 links（links 段在 GitToolPanel 列表态，历史/详情页没有）。
  await page.locator("main > div > aside").nth(1).getByText("返回变更文件列表").click();
  const branchLink = page
    .locator("main > div > aside")
    .nth(1)
    .getByRole("button", { name: /分支 \(\d+\)/ });
  ok((await branchLink.count()) > 0, "G10 links「分支 (N)」渲染");

  // ④ Wiki 标签（＋ 菜单加签）：页面行右键 → 2 项 + 「打开页面」进详情态。
  await aside.getByRole("button", { name: "新建标签" }).click();
  await waitMenuOpen(page);
  await page.getByRole("menuitem", { name: "Wiki" }).click();
  await page.waitForTimeout(600);
  const wikiRow = page
    .locator("main > div > aside")
    .nth(1)
    .getByRole("button")
    .filter({ hasText: "架构总览" })
    .first();
  ok((await wikiRow.count()) > 0, "W0 Wiki 页面行渲染");
  await wikiRow.click({ button: "right" });
  await waitMenuOpen(page);
  menu = await readMenu(page);
  ok(menu.open, "W1 Wiki 页面行右键开菜单");
  ok(
    menu.items.length === 2,
    `W2 Wiki 菜单 2 项（实际 ${menu.items.length}：${menu.items.join("/")}）`,
  );
  const openItem = page.getByRole("menuitem").filter({ hasText: "打开页面" }).first();
  await openItem.click();
  await page.waitForTimeout(800);
  // v1.5 批 4：wiki 页行「打开页面」→ 中栏 wikiread tab（检视器 wikiread 阅读标签退役）。
  const wikiTab = page.locator(".tabstrip .tb", { hasText: "index-1" });
  ok(
    (await wikiTab.count()) === 1,
    "W3 「打开页面」→ 中栏 wikiread tab（index-1 chip；检视器 wikiread 标签退役）",
  );

  // W4（全局同构 review 批 A-5 桌面补齐）：激活 wikiread tab → tabstrip 右端 ⋯ 菜单 =
  // WikiReadNavMenu 单源，两项「复制内容/查看 diff」（此前仅移动面板 wikiread 标签有）。
  const wikiStripMenu = page.locator(".tabstrip").getByRole("button", { name: "更多操作" }).last();
  await wikiStripMenu.click();
  await waitMenuOpen(page);
  menu = await readMenu(page);
  ok(
    menu.open && menu.items.length === 2,
    `W4 wikiread tab ⋯ = 2 项（实际 ${menu.items.join("/")}）`,
  );
  ok(
    menu.items.includes("复制内容") && menu.items.includes("查看 diff"),
    "W4b ⋯ 含「复制内容」「查看 diff」",
  );
  // 「查看 diff」→ 中栏新开 git diff tab（源文件 wiki/{slug}.md 走 file diff 管道的桌面形态）。
  const wikiDiffItem = page.getByRole("menuitem", { name: "查看 diff" }).first();
  await wikiDiffItem.click();
  await page.waitForTimeout(800);
  ok(
    (await page.locator(".tabstrip .tb", { hasText: "index-1.md" }).count()) >= 1,
    "W4c 「查看 diff」→ 中栏 git diff tab（wiki/{slug}.md）",
  );

  // ⑤ 触屏长按（合成 pointerType:touch pointerdown 500ms 阈值）：批 4 页行点入开中栏 tab，
  // 检视器保持列表态（无详情态切换）——直接长按页面行 → 菜单开（iPad 右栏唯一菜单入口）。
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
