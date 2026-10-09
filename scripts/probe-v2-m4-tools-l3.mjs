// M4 工具与深度页探针（v1.4 §6.13 批2 重写：工具态退役为检视面板 InspectionPanel）。
//
// 覆盖单测验不到的真实浏览器行为（DOM 几何硬数据，禁截图）：
//   Part 1 面板入口 + ptabs：row2 单检视 ticon 开面板（translate 滑入）→ 面板 rect 覆盖视口 +
//     tab bar 让位（elementFromPoint 落面板内）+ 默认 files 标签 + FAB 几何（48×48 r24
//     right16 bottom50）+ ＋ 菜单开 Git 标签（标签数/激活态/toolChip 切换/FAB 消失）。
//   Part 2 toolChip 三态：git = .gitchip（分支 + 工作区/暂存计数 + 高 30）；files = .crumb
//     （项目名首段 + frow 行）；wiki = .wsearch（分组行）。
//   Part 3 面板内 L3 git history/commit：links「历史列表」→ /git/history 面板内 L3
//     （nav back=「Git 检视」+ dlg 日期分组 + crow）→ crow → commit 页（cmsg + dstat + 内嵌
//     diff）→ 面板 back 回标签条。
//   Part 4 面板内 L3 branches：links「分支 (N)」→ bcur 蓝卡 + brow + rocard + 远程段。
//   Part 5 面板内 file preview：files frow 点文件 → focusId=file_* 面板内 L3（nav back=父
//     目录、保活层让位单实例）→「查看 diff」→ git diff focus 面板内（back=「Git 检视」）。
//   Part 6 面板内 L3 wiki reader：wpg 点页 → wmeta + readbtn + wlink + Markdown 正文 + rel。
//   Part 7 03w files 长按菜单（触屏可达，面板语境）。
//   Part 8 零销毁滚动位（FilesToolPanel 查询/滚动跨开关保持）+ ?tab= 深链渲染期映射
//     （面板 open + 激活标签，不写回 URL）。
//   Part 9 打开面板滚入视野（批 12 反馈①）：9 标签溢出 fixture，PanelTabBar open 依赖重滚。
//
// 全 mock API（proj1 不依赖真实项目数据）；密码自读不进 agent 上下文、不打印值。
// 用法：bun scripts/probe-v2-m4-tools-l3.mjs

import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const ORIGIN = process.env.AR_WEB_ORIGIN ?? "http://127.0.0.1:43012";
const projectName = "proj1";

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
    status: "idle",
    createdAt: "2026-07-26T00:00:00.000Z",
  },
  "agent_probe-2": {
    id: "agent_probe-2",
    projectName,
    provider: "claude",
    displayName: "Probe Agent B",
    status: "idle",
    createdAt: "2026-07-26T00:00:00.000Z",
  },
};

const GIT_DIFF = {
  repository: true,
  projectName,
  branch: { name: "main" },
  files: [
    { path: "src/a.ts", status: "modified", scope: "worktree", addedLines: 12, removedLines: 3 },
    { path: "src/b.py", status: "modified", scope: "worktree", addedLines: 0, removedLines: 7 },
    { path: "cfg.json", status: "added", scope: "staged", addedLines: 40, removedLines: 0 },
  ],
};

const GIT_LOG = {
  branch: "",
  total: 2,
  commits: [
    {
      hash: "abc1234",
      message: "feat: probe commit today",
      author: "Probe",
      relativeTime: "2 小时前",
      isoDate: new Date().toISOString().slice(0, 10),
    },
    {
      hash: "def5678",
      message: "chore: probe commit earlier",
      author: "Probe",
      relativeTime: "3 天前",
      isoDate: "2026-09-10",
    },
  ],
};
const GIT_BRANCHES = {
  current: "main",
  branches: [
    { name: "main", type: "local", isCurrent: true, lastCommitShort: "2 小时前" },
    {
      name: "feature",
      type: "local",
      upstream: "origin/main",
      ahead: 2,
      behind: 1,
      lastCommitShort: "1 天前",
    },
    { name: "origin/main", type: "remote", lastCommitShort: "2 小时前" },
  ],
};
const WIKI_INDEX = {
  pages: [
    { slug: "intro", title: "介绍", tags: ["指南"], updated: "2026-09-20" },
    { slug: "advanced", title: "进阶", tags: ["指南"], updated: "2026-09-18" },
    { slug: "notes", title: "随记", tags: [], updated: "2026-09-01" },
  ],
};
const WIKI_PAGE = {
  slug: "intro",
  frontmatter: { title: "介绍", tags: ["指南"], created: "2026-09-10", updated: "2026-09-20" },
  body: "这是 wiki 页正文内容。",
};
const FILE_LIST = {
  parentPath: null,
  entries: [
    { name: "src", type: "directory", path: "src", mtimeMs: Date.now() },
    { name: "README.md", type: "file", path: "README.md", mtimeMs: Date.now() },
  ],
};

// ── mock 基座 ────────────────────────────────────────────────────────────────
async function setupM4Mocks(page) {
  await page.route(/\/api\/overview$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ projectNames: [projectName], candidates: [] }),
    }),
  );
  await page.route(new RegExp(`/api/projects/${projectName}/agent-sessions(?:\\?.*)?$`), (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sessions: Object.values(AGENTS) }),
    }),
  );
  const json = (body) => ({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
  await page.route(new RegExp(`/api/projects/${projectName}/git/diff$`), (r) =>
    r.fulfill(json(GIT_DIFF)),
  );
  await page.route(new RegExp(`/api/projects/${projectName}/git/log\\?.*branch=`), (r) =>
    r.fulfill(
      json({ ...GIT_LOG, branch: decodeURIComponent(r.request().url().split("branch=")[1]) }),
    ),
  );
  await page.route(new RegExp(`/api/projects/${projectName}/git/log(?:\\?.*)?$`), (r) =>
    r.fulfill(json(GIT_LOG)),
  );
  await page.route(new RegExp(`/api/projects/${projectName}/git/branches$`), (r) =>
    r.fulfill(json(GIT_BRANCHES)),
  );
  await page.route(new RegExp(`/api/projects/${projectName}/git/diff/file\\?.*`), (r) =>
    r.fulfill(
      json({
        repository: true,
        projectName,
        path: "README.md",
        scope: "worktree",
        status: "modified",
        diff: "diff --git a/README.md b/README.md\n--- a/README.md\n+++ b/README.md\n@@ -1,2 +1,3 @@\n probe line 1\n-probe line 2\n+probe line 2 edited\n+probe line 3\n",
      }),
    ),
  );
  await page.route(
    new RegExp(`/api/projects/${projectName}/git/commit\\?.*hash=abc1234&path=`),
    (r) =>
      r.fulfill(
        json({
          repository: true,
          projectName,
          path: "src/a.ts",
          diff: "diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,2 +1,2 @@\n-const old = 1;\n+const neu = 2;\n",
        }),
      ),
  );
  await page.route(new RegExp(`/api/projects/${projectName}/git/commit\\?.*hash=abc1234$`), (r) =>
    r.fulfill(
      json({
        repository: true,
        projectName,
        meta: {
          hash: "abc1234",
          message: "feat: probe commit today",
          author: "Probe",
          relativeTime: "2 小时前",
          isoDate: new Date().toISOString().slice(0, 10),
        },
        files: [
          { path: "src/a.ts", status: "modified", addedLines: 1, removedLines: 1 },
          { path: "src/new.ts", status: "added", addedLines: 20, removedLines: 0 },
        ],
      }),
    ),
  );
  await page.route(new RegExp(`/api/projects/${projectName}/files\\?.*path=`), (r) =>
    r.fulfill(json(FILE_LIST)),
  );
  await page.route(new RegExp(`/api/projects/${projectName}/files$`), (r) =>
    r.fulfill(json(FILE_LIST)),
  );
  await page.route(new RegExp(`/api/projects/${projectName}/files/preview\\?.*`), (r) =>
    r.fulfill(
      json({
        type: "text",
        projectName,
        path: "README.md",
        name: "README.md",
        size: 28,
        // markdown 语法（h1 + p）——Part 5 渲染态断言靠 h1「probe title」识别 MarkdownString 真渲染。
        content: "# probe title\n\nprobe line 2\n",
        mtimeMs: Date.now(),
      }),
    ),
  );
  await page.route(new RegExp(`/api/projects/${projectName}/wiki/search\\?`), (r) =>
    r.fulfill(json({ query: "介绍", matches: [WIKI_INDEX.pages[0]] })),
  );
  await page.route(new RegExp(`/api/projects/${projectName}/wiki$`), (r) =>
    r.fulfill(json(WIKI_INDEX)),
  );
  await page.route(new RegExp(`/api/projects/${projectName}/wiki/(intro|advanced|notes)$`), (r) =>
    r.fulfill(json({ ...WIKI_PAGE })),
  );
  // session 面板 WS（fake session → error，panel 容器仍渲染）。
  await page.routeWebSocket(/stream/, (ws) => ws.connectToServer());
}

/** goto 前清检视面板/文件树持久化（panelTabs/panelActive 跨刷新恢复——不清理会跨 Part 串态）。 */
async function resetPanelStorage(page) {
  await page.evaluate(() => {
    localStorage.removeItem("workbenchPanelTabs");
    localStorage.removeItem("workbenchPanelActive");
    localStorage.removeItem("workbenchMobileProjectFilesPath");
  });
}

/** 预置 V4 layout（单 leaf；file tab 可选）+ 面板 atoms 清零，再 goto 目标 URL。 */
async function gotoWorkbench(page, url) {
  await page.goto(`${ORIGIN}/projects/${projectName}`);
  await resetPanelStorage(page);
  await page.evaluate(() => {
    localStorage.setItem(
      "workbenchLayoutV4",
      JSON.stringify({
        root: { kind: "leaf", id: "leaf-seed", tabs: [], activeTabId: null },
        activeGroupId: "leaf-seed",
        maximized: null,
      }),
    );
  });
  await page.goto(url);
}

/** 点 row2 检视 ticon 开面板（03o 入口），等滑入完成。 */
async function openPanel(page) {
  await page.getByLabel("检视面板").click();
  await page.waitForSelector('[data-inspection-panel="open"]', { timeout: 5000 });
  await page.waitForTimeout(450);
}

/** nav 信息：面板 open 时取面板 nav（03o「‹ 工作台」），closed 时取工作台 header nav。 */
async function navInfo(page) {
  return page.evaluate(() => {
    const root =
      document.querySelector('[data-inspection-panel="open"]') ?? document.documentElement;
    const back = root.querySelector(".nav .back");
    const title = root.querySelector(".nav .nv-t");
    return { back: back?.textContent?.trim(), title: title?.textContent?.trim() };
  });
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
await setupM4Mocks(page);
await page.goto(`${ORIGIN}/projects/${projectName}`);
await login(page);

console.log("Part 1: 面板入口 + ptabs + FAB 几何");
await gotoWorkbench(page, `${ORIGIN}/projects/${projectName}`);
await page.waitForSelector('[data-inspection-panel="closed"]', {
  state: "attached",
  timeout: 10000,
});
ok(true, "初始面板 closed（常驻挂载，invisible + translate-x-full）");
await openPanel(page);
// 面板 rect 覆盖视口（fixed inset-0）。
const panelRect = await page.evaluate(() => {
  const el = document.querySelector('[data-inspection-panel="open"]');
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
});
ok(
  panelRect.w === 390 && panelRect.h === 844 && panelRect.x === 0 && panelRect.y === 0,
  `面板 rect 覆盖视口（${JSON.stringify(panelRect)}）`,
);
// tab bar 让位：视口中下点命中的元素在面板子树内（fixed z-40 覆盖 nav 区）。
const hitInPanel = await page.evaluate(() => {
  const el = document.elementFromPoint(195, 760);
  const panel = document.querySelector('[data-inspection-panel="open"]');
  return !!el && panel.contains(el);
});
ok(hitInPanel, "面板覆盖 nav 区（elementFromPoint 落面板子树）");
const tabState = await page.evaluate(() => {
  const tabs = [...document.querySelectorAll(".ptabs .ptab")];
  const on = tabs.find((t) => t.classList.contains("on"));
  return { count: tabs.length, onText: on?.textContent?.trim() ?? null };
});
ok(
  tabState.count === 3,
  `默认标签 3 个（03m/03p 三基础常驻 files/git/wiki；实际 ${tabState.count}）`,
);
ok(tabState.onText === "文件", `files 标签激活（实际 ${tabState.onText}）`);
// FAB 几何（03ob：48×48 r24 right16 bottom50）。
const fab = await page.evaluate(() => {
  const el = document.querySelector(".fab");
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return {
    w: r.width,
    h: r.height,
    right: 390 - (r.x + r.width),
    bottom: 844 - (r.y + r.height),
    radius: getComputedStyle(el).borderRadius,
  };
});
ok(fab?.w === 48 && fab?.h === 48, `FAB 48×48（实际 ${fab?.w}×${fab?.h}）`);
ok(
  fab?.right === 16 && fab?.bottom === 50,
  `FAB right16 bottom50（实际 ${fab?.right}/${fab?.bottom}）`,
);
ok(fab?.radius === "24px", `FAB r24（实际 ${fab?.radius}）`);
// ＋ 菜单开 Git 标签（03ob2：文件树/Git/Wiki 三选；已开 = 激活幂等）。
await page.getByLabel("新建标签").click();
await page.waitForSelector('[role="menuitem"]', { timeout: 5000 });
const menuItems = await page.evaluate(() =>
  [...document.querySelectorAll('[role="menuitem"]')].map((n) => n.textContent.trim()),
);
ok(
  menuItems.some((x) => x.includes("文件")) &&
    menuItems.some((x) => x.includes("Git")) &&
    menuItems.some((x) => x.includes("Wiki")),
  `＋ 菜单三选（${menuItems.join(" | ")}）`,
);
await page.getByRole("menuitem", { name: /Git/ }).click();
await page.waitForTimeout(400);
const tabState2 = await page.evaluate(() => {
  const tabs = [...document.querySelectorAll(".ptabs .ptab")];
  const on = tabs.find((t) => t.classList.contains("on"));
  const xCount = document.querySelectorAll(".ptabs .ptab .x").length;
  return { count: tabs.length, onText: on?.textContent?.trim() ?? null, xCount };
});
ok(tabState2.count === 3, `＋ 开 Git = 激活常驻 Git 标签（仍 3 个；实际 ${tabState2.count}）`);
ok(tabState2.onText?.startsWith("Git"), `Git 标签激活（实际 ${tabState2.onText}）`);
ok(tabState2.xCount === 0, "三基础标签无 ✕（plan 拍板：不可关）");
ok((await page.locator(".fab").count()) === 0, "Git 标签无 FAB（仅文件树标签）");
ok(await page.locator(".gitchip").isVisible(), "git toolChip（gitchip）可见");

console.log("Part 2: toolChip 三态（gitchip / crumb / wsearch）");
const gitchip = await page.evaluate(() => {
  const el = document.querySelector(".gitchip");
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  return { text: el.textContent, height: rect.height };
});
ok(
  gitchip?.text.includes("工作区 2") && gitchip?.text.includes("暂存 1"),
  `gitchip 计数（${gitchip?.text}）`,
);
ok(gitchip?.height === 30, `gitchip 高 30px（实际 ${gitchip?.height}）`);
ok((gitchip?.text ?? "").includes("main"), `gitchip b = 分支名 main（${gitchip?.text}）`);
// 切回 files 标签：crumb + frow（面板内）。
await page.locator(".ptabs .ptab", { hasText: "文件" }).first().click();
await page.waitForTimeout(400);
const crumb = await page.evaluate(() => {
  const panel = document.querySelector('[data-inspection-panel="open"]');
  const el = panel?.querySelector(".crumb");
  if (!el) return null;
  const first = el.firstElementChild;
  return {
    text: el.textContent,
    firstIsIcon: first?.querySelector("svg") != null,
    firstText: first?.textContent?.trim() ?? "",
    buttons: el.querySelectorAll("button").length,
  };
});
// 反馈⑧（批 10）：crumb 首段 = 项目图标（cico），任何层级不显项目名文字。
ok(crumb?.firstIsIcon === true, `crumb 首段=项目图标（反馈⑧）；首段文本「${crumb?.firstText}」`);
ok(!crumb?.text.startsWith("proj1"), "crumb 无项目名文字（反馈⑧）");
ok(
  (await page
    .locator('[data-inspection-panel="open"] [data-mobile-tool="files"] .frow')
    .count()) === 2,
  "files frow 2 行（面板内）",
);
// wiki 标签：wsearch + 分组。
await page.getByLabel("新建标签").click();
await page.getByRole("menuitem", { name: /Wiki/ }).click();
await page.waitForTimeout(400);
const wsearch = await page.evaluate(() => {
  const panel = document.querySelector('[data-inspection-panel="open"]');
  return panel?.querySelector(".wsearch") != null;
});
ok(wsearch, "wiki toolChip（wsearch）可见");
ok(
  (await page.locator('[data-inspection-panel="open"]').getByText("指南").first().isVisible()) ===
    true,
  "wiki 分组「指南」",
);

console.log("Part 3: 面板内 L3 git history / commit");
await page.locator(".ptabs .ptab", { hasText: "Git" }).first().click();
await page.waitForTimeout(300);
await page.locator('[data-inspection-panel="open"]').getByText("历史列表").click();
await page.waitForURL(/\/git\/history/, { timeout: 5000 });
const nav = await navInfo(page);
ok(nav?.back === "Git 检视", `history back = 「Git 检视」（实际 ${nav?.back}）`);
ok(nav?.title === "提交历史", `history 标题 = 「提交历史」（实际 ${nav?.title}）`);
const l3InPanel = await page.evaluate(() => {
  const panel = document.querySelector('[data-inspection-panel="open"]');
  return panel?.querySelector('[data-role="l3-page"]') != null;
});
ok(l3InPanel, "L3 主体渲染在面板内（03o「L3 是面板内深度页」）");
ok((await page.locator(".dlg").count()) >= 1, "dlg 日期分组行存在");
ok(
  await page
    .locator('[data-inspection-panel="open"] [data-role="l3-page"]')
    .getByText("abc1234")
    .first()
    .isVisible(),
  "crow 短 hash 显示",
);
ok((await page.locator(".loadmore").count()) === 0, "total 已尽无 loadmore");
// 叠层保活（perf-review m1）后 children 里 git 面板与覆盖层 L3 并存——L3 页内容查询
// 一律限定 [data-role="l3-page"]（文档序 children 在前，getByText 全局 first 会命中被盖面板）。
await page
  .locator('[data-inspection-panel="open"] [data-role="l3-page"]')
  .getByText("abc1234")
  .first()
  .click();
await page.waitForURL(/\/git\/commit\/abc1234/, { timeout: 5000 });
ok(
  await page
    .locator('[data-inspection-panel="open"] [data-role="l3-page"]')
    .getByText("feat: probe commit today")
    .first()
    .isVisible(),
  "commit cmsg",
);
ok((await page.locator(".dstat").count()) === 1, "dstat 行存在");
await page.locator('[data-inspection-panel="open"] [data-role="l3-page"] .frow').first().click();
await page
  .locator('[data-inspection-panel="open"] [data-role="l3-page"]')
  .getByText("const neu = 2;")
  .first()
  .waitFor({ state: "visible", timeout: 5000 });
ok(
  await page
    .locator('[data-inspection-panel="open"] [data-role="l3-page"]')
    .getByText("const neu = 2;")
    .first()
    .isVisible(),
  "commit 文件内嵌 diff 展开",
);
// commit back（‹ 提交历史）→ pop 回 history；history back（‹ Git 检视）→ 回标签条。
await page.locator('[data-inspection-panel="open"] .nav .back').click();
await page.waitForURL(/\/git\/history/, { timeout: 5000 });
const nav2 = await navInfo(page);
ok(nav2?.title === "提交历史", `commit back 回 history（实际 ${nav2?.title}）`);
await page.locator('[data-inspection-panel="open"] .nav .back').click();
await page.waitForTimeout(600);
const backToTabs = await page.evaluate(() => {
  const panel = document.querySelector('[data-inspection-panel="open"]');
  return {
    ptabs: panel?.querySelector(".ptabs") != null,
    l3: panel?.querySelector('[data-role="l3-page"]') != null,
  };
});
ok(backToTabs.ptabs && !backToTabs.l3, "面板 back 回标签条（L3 退出）");

console.log("Part 4: 面板内 L3 branches");
await page
  .locator('[data-inspection-panel="open"]')
  .getByText(/分支 \(3\)/)
  .click();
await page.waitForURL(/\/git\/branches/, { timeout: 5000 });
const bnav = await navInfo(page);
ok(bnav?.back === "Git 检视", `branches back = 「Git 检视」（实际 ${bnav?.back}）`);
ok((bnav?.title ?? "").startsWith("分支 · 3"), `branches 标题（${bnav?.title}）`);
ok((await page.locator(".bcur").count()) === 1, "bcur 当前分支蓝卡");
ok(
  await page
    .locator('[data-inspection-panel="open"] [data-role="l3-page"]')
    .getByText("feature")
    .first()
    .isVisible(),
  "本地分支行 feature",
);
ok((await page.locator(".rocard").count()) === 1, "rocard 只读橙卡");
ok(
  await page
    .locator('[data-inspection-panel="open"] [data-role="l3-page"]')
    .getByText("远程分支")
    .isVisible(),
  "远程分支 sect",
);
// 深链兜底：branches 回 Git 检视标签。
await page.locator('[data-inspection-panel="open"] .nav .back').click();
await page.waitForTimeout(600);

console.log("Part 5: 面板 file 标签（03ab peek）→ 查看 diff（面板级 panelDiff）");
await page.locator(".ptabs .ptab", { hasText: "文件" }).first().click();
await page.waitForTimeout(300);
// 树点文件 → 面板 file 标签新增/激活（批3 链接直达：不再 URL /file/ focus 导航）。
await page
  .locator('[data-inspection-panel="open"] [data-mobile-tool="files"] .frow', {
    hasText: "README.md",
  })
  .click();
await page.waitForTimeout(800);
const fileTab = page.locator('.ptabs .ptab[aria-label="README.md"]');
ok((await fileTab.count()) === 1, "file 标签新增（README.md）");
ok((await fileTab.getAttribute("aria-selected")) === "true", "file 标签新增即激活");
// 预览在激活叠层（PanelFileTabBody 单源）：v1.5 批3 起顶部 = .fmeta（类型·度量·更新）+
// .fright>.segc.mini（md/html 渲染⇄源码），nav 右端 ⋯（v1.6 pencil 退役）。
const previewBody = page.locator(
  '[data-panel-tab-body="file:proj1/README.md"] [data-role="file-preview-pane"]',
);
ok(
  await previewBody.locator("h1", { hasText: "probe title" }).isVisible(),
  "md 打开即渲染态（h1 默认渲染，预览优先）",
);
const segc = previewBody.locator(".fmeta .fright .segc.mini");
ok((await segc.count()) === 1, ".fmeta 右端 .segc.mini（批3 单源）");
const renderBtn = segc.getByRole("button", { name: "渲染" });
ok(
  (await renderBtn.getAttribute("class"))?.includes("on") === true,
  "segc.mini「渲染」on 态（默认渲染）",
);
ok(
  (await previewBody.locator(".cm-editor").count()) === 0,
  "渲染态无源码画布（CodeMirror 不在场）",
);
const fileItemLeaks = await page.evaluate(
  () => document.querySelectorAll('[data-tab-id^="file_"]').length,
);
ok(fileItemLeaks === 0, `保活层让位（file item 主体区 0 实例；实际 ${fileItemLeaks}）`);
// toggle「源码」→ CodeMirror 只读画布（批 13 CodeMirror 三态，.code 手写行号形态已退役）；
// 点正文（v1.6 pencil 退役）→ CodeEditor（renderMode 先切 source，canEdit 恢复）；
// nav [完成] → 回渲染态（预览优先）。
await segc.getByRole("button", { name: "源码" }).click();
await page.waitForTimeout(300);
ok((await previewBody.locator(".cm-editor").count()) > 0, "toggle 源码 → CodeMirror 只读画布在场");
await previewBody.locator(".cm-content").click();
// CodeEditor lazy chunk + CodeMirror 初始化：等挂载而非固定延时。
await previewBody.locator(".cm-editor").waitFor({ timeout: 8000 });
ok(true, "编辑态 CodeEditor 在场");
// 编辑态画布 = 03q2 .ed / 03q .code 同款 bg-codeblock 全幅（2026-10-02 用户反馈：旧
// rounded-lg + border + surface-inset「输入框」壳使查看/编辑切换观感跳变过大——去壳后
// 容器零跳变）。硬数据断言：背景 = codeblock token 值、无边框、无圆角。
const editorCanvas = await page.evaluate(() => {
  const cm = document.querySelector('[data-role="file-preview-pane"] .cm-editor');
  const root = cm?.parentElement?.parentElement; // @uiw wrapper → CodeEditor 根
  if (!root) return null;
  const cs = getComputedStyle(root);
  // token 读出是 hex（#f6f6f8），backgroundColor 是 rgb()——统一成 rgb 数组再比。
  const token = getComputedStyle(document.documentElement)
    .getPropertyValue("--bg-codeblock")
    .trim();
  const h = token.replace("#", "");
  const rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  const bgMatches = cs.backgroundColor === `rgb(${rgb.join(", ")})`;
  const content = root.querySelector(".cm-content");
  const ccs = content ? getComputedStyle(content) : null;
  return {
    bgMatches,
    border: cs.borderTopWidth,
    radius: cs.borderRadius,
    bg: cs.backgroundColor,
    token,
    // 排印对齐 03q2 .ed / 03q .code（11.5px/20px）——md 源码 toggle 与编辑态同套。
    fontSize: ccs?.fontSize,
    lineHeight: ccs?.lineHeight,
    hasLineNumbers: !!root.querySelector(".cm-lineNumbers"),
  };
});
ok(
  editorCanvas !== null &&
    editorCanvas.bgMatches &&
    editorCanvas.border === "0px" &&
    editorCanvas.radius === "0px",
  `编辑态画布=codeblock 全幅无框无角（bg=${editorCanvas?.bg} token=${editorCanvas?.token} border=${editorCanvas?.border} radius=${editorCanvas?.radius}）`,
);
ok(
  editorCanvas !== null &&
    editorCanvas.fontSize === "11.5px" &&
    editorCanvas.lineHeight === "20px" &&
    editorCanvas.hasLineNumbers,
  `编辑态排印/行号对齐 03q2 .ed（font=${editorCanvas?.fontSize} lh=${editorCanvas?.lineHeight} 行号=${editorCanvas?.hasLineNumbers}）`,
);
// 面板 file 标签 = editingActions="meta"：完成/放弃在 .emeta .fact（nav 只承载 ⋯）。
await previewBody.locator(".emeta .fact button").last().click();
await page.waitForTimeout(400);
ok(
  await previewBody.locator("h1", { hasText: "probe title" }).isVisible(),
  "完成 → 回渲染态（预览优先）",
);
// v1.5 批3：nav 右端 ⋯（v1.6 pencil 退役）；「查看 diff」收进 ⋯ 菜单（不再行内文字钮）。
const navDots = page.locator('[data-inspection-panel="open"] .nav [aria-label="更多操作"]');
ok((await navDots.count()) === 1, "nav [⋯] 存在");
await navDots.click();
await page.waitForTimeout(400);
const fileMenu = page.locator('[role="menu"]');
await fileMenu.getByRole("menuitem", { name: "查看 diff" }).click();
await page.waitForTimeout(800);
const panelDiffNav = await navInfo(page);
ok(panelDiffNav?.back === "README.md", `panelDiff back = 文件名（实际 ${panelDiffNav?.back}）`);
ok(panelDiffNav?.title === "README.md", `panelDiff 标题 = 文件名（实际 ${panelDiffNav?.title}）`);
ok(
  (await page
    .locator('[data-inspection-panel="open"] [data-role="l3-page"]')
    .getByText("+")
    .count()) > 0,
  "panelDiff diff 内容渲染",
);
// back → panelDiff 退出，回 file 标签预览（panelDiff state 清空，预览叠层回正）。
await page.locator('[data-inspection-panel="open"] .nav .back').click();
await page.waitForTimeout(600);
ok(
  (await page.locator('[data-inspection-panel="open"] [data-role="l3-page"]').count()) === 0,
  "panelDiff back 回 file 标签预览（L3 退出）",
);
ok(
  (await fileTab.getAttribute("aria-selected")) === "true",
  "file 标签仍激活（panelDiff 只覆盖内容区）",
);

console.log("Part 6: 面板内 wikiread 标签 + .actbtn 让 Agent 读这篇 sheet");
// v1.5 批3：wiki 阅读迁面板 wikiread 标签（L3WikiReader copyLinkInBody=false）——点面板
// wiki 列表页行 → 新增/激活 wikiread 标签；.fmeta 右端 .actbtn「让 Agent 读这篇」。
await gotoWorkbench(page, `${ORIGIN}/projects/${projectName}`);
await openPanel(page);
await page.getByLabel("新建标签").click();
await page.getByRole("menuitem", { name: /Wiki/ }).click();
await page.waitForTimeout(400);
await page.locator('[data-inspection-panel="open"] .wpg', { hasText: "介绍" }).first().click();
await page.waitForTimeout(600);
const wikiReadTab = page.locator('[data-role="ptabs"] [role="tab"]').filter({ hasText: "介绍" });
ok((await wikiReadTab.count()) >= 1, "wikiread 标签新增（介绍）");
ok(await page.getByText("这是 wiki 页正文内容。").isVisible(), "Markdown 正文渲染");
ok(
  await page.locator('[data-panel-tab-body^="wikiread:"]').getByText("进阶").first().isVisible(),
  "rel 同组页「进阶」",
);
const readAct = page.locator('[data-panel-tab-body^="wikiread:"] .fmeta .actbtn');
ok(await readAct.isVisible(), ".fmeta .actbtn「让 Agent 读这篇」");
// 复制链接已收进 nav ⋯（面板形态无行内 wlink）——断言 ⋯ 菜单含复制链接项。
await page.locator('[data-inspection-panel="open"] .nav [aria-label="更多操作"]').click();
await page.waitForTimeout(400);
ok(
  (await page
    .locator('[role="menu"]')
    .getByRole("menuitem", { name: /复制内容/ })
    .count()) === 1,
  "nav ⋯ 含「复制内容」（批 3 wiki-reader pin②：⋯=复制内容/查看 diff）",
);
ok(
  (await page
    .locator('[role="menu"]')
    .getByRole("menuitem", { name: /查看 diff/ })
    .count()) === 1,
  "nav ⋯ 含「查看 diff」",
);
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
await readAct.click();
await page.waitForTimeout(500);
const sheetItems = await page.evaluate(() =>
  [...document.querySelectorAll('[role="menuitem"]')].map((n) => n.textContent.trim()),
);
ok(
  sheetItems.some((x) => x.includes("Probe Agent A")),
  `readbtn sheet 含会话（${sheetItems.join(" | ")}）`,
);

console.log("Part 7: 03w files 长按菜单（触屏可达，面板语境）");
await gotoWorkbench(page, `${ORIGIN}/projects/${projectName}`);
await openPanel(page);
const lrow = page.locator('[data-inspection-panel="open"] [data-mobile-tool="files"] .frow', {
  hasText: "README.md",
});
const rb = await lrow.boundingBox();
const cdp = await ctx.newCDPSession(page);
await cdp.send("Input.dispatchTouchEvent", {
  type: "touchStart",
  touchPoints: [{ x: rb.x + rb.width / 2, y: rb.y + rb.height / 2 }],
});
await page.waitForTimeout(700);
await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
await page.waitForTimeout(400);
const lpItems = await page.evaluate(() =>
  [...document.querySelectorAll('[role="menuitem"]')].map((n) => n.textContent.trim()),
);
ok(
  lpItems.some((x) => x.includes("重命名")),
  `touch 长按触发 03w 菜单（${lpItems.join(" | ")}）`,
);
ok(!page.url().includes("README"), "长按未误触导航（合成 click 抑制）");

console.log("Part 8: 零销毁 DOM 身份 + ?tab= 深链映射");
await gotoWorkbench(page, `${ORIGIN}/projects/${projectName}`);
await openPanel(page);
// 零销毁（frontend-notes §3 副作用生命周期）：面板开关前后 files 面板 DOM 节点身份一致
//（translate/visibility 切换不卸载；内容不足一屏时滚动位恒 0，改用节点身份强断言）。
const sameNode = await page.evaluate(() => {
  window.__probeFilesEl = document.querySelector(
    '[data-inspection-panel="open"] [data-mobile-tool="files"]',
  );
  return true;
});
ok(sameNode, "files 面板节点标记");
await page.locator('[data-inspection-panel="open"] .nav .back').click();
await page.waitForSelector('[data-inspection-panel="closed"]', {
  state: "attached",
  timeout: 5000,
});
ok(true, "‹ 工作台 关面板");
// 关闭后 URL 不写回（panelOpen 内存态，URL 无 tab 维度）。
ok(!page.url().includes("tab="), `关面板 URL 不写回 tab（${page.url()}）`);
await openPanel(page);
const kept = await page.evaluate(
  () =>
    window.__probeFilesEl ===
    document.querySelector('[data-inspection-panel="open"] [data-mobile-tool="files"]'),
);
ok(kept, "零销毁：重开面板 files 面板 DOM 节点身份一致");
// ?tab= 深链渲染期映射：面板 open + 激活标签；关面板不写回（URL 保留旧值）。
await gotoWorkbench(page, `${ORIGIN}/projects/${projectName}?tab=git`);
await page.waitForSelector('[data-inspection-panel="open"]', { timeout: 10000 });
const deepLink = await page.evaluate(() => {
  const panel = document.querySelector('[data-inspection-panel="open"]');
  const on = panel?.querySelector(".ptab.on");
  return { onText: on?.textContent?.trim() ?? null };
});
ok(
  deepLink.onText?.startsWith("Git"),
  `深链 ?tab=git 映射面板激活 Git 标签（实际 ${deepLink.onText}）`,
);
ok(await page.locator(".gitchip").isVisible(), "深链 gitchip 可见");

// ── Part 9：批 12 反馈①——打开工具区时激活标签滚入视野（PanelTabBar open 依赖）────
// 移动检视面板常驻挂载，closed 态（invisible translate-x-full）下挂载首滚在 WebKit 可能
// 不生效——open 进 effect deps 后「打开瞬间」显式重滚。fixture：9 标签必溢出，激活最后
// 一个 file 标签（视野外），开面板后断言入视野。
console.log("Part 9: 打开面板滚入视野（批 12 反馈①）");
await gotoWorkbench(page, `${ORIGIN}/projects/${projectName}`);
await page.waitForSelector('[data-inspection-panel="closed"]', {
  state: "attached",
  timeout: 10000,
});
await page.evaluate(() => {
  const files = [
    "src/alpha.ts",
    "src/beta.ts",
    "src/gamma.ts",
    "src/delta.ts",
    "src/epsilon.ts",
    "src/zeta.ts",
  ];
  const fileTabs = files.map((p) => ({ id: `file:proj1/${p}`, kind: "file", path: `proj1/${p}` }));
  localStorage.setItem(
    "workbenchPanelTabs",
    JSON.stringify({
      proj1: [
        ...fileTabs,
        { id: "files", kind: "files" },
        { id: "git", kind: "git" },
        { id: "wiki", kind: "wiki" },
      ],
    }),
  );
  localStorage.setItem("workbenchPanelActive", JSON.stringify({ proj1: "file:proj1/src/zeta.ts" }));
});
await page.goto(`${ORIGIN}/projects/${projectName}`);
await page.waitForSelector('[data-inspection-panel="closed"]', {
  state: "attached",
  timeout: 10000,
});
await openPanel(page);
const scrollState = await page.evaluate(() => {
  const bar = document.querySelector('[data-inspection-panel="open"] .ptabs');
  if (!bar) return null;
  const tabs = [...bar.querySelectorAll(".ptab")];
  const on = tabs.find((t) => t.classList.contains("on"));
  if (!on) return null;
  const br = bar.getBoundingClientRect();
  const ar = on.getBoundingClientRect();
  return {
    overflow: bar.scrollWidth > bar.clientWidth,
    nTabs: tabs.length,
    label: on.getAttribute("aria-label"),
    inView: ar.left >= br.left - 1 && ar.right <= br.right + 1,
  };
});
ok(
  scrollState?.overflow === true,
  `标签条溢出（9 标签 fixture；实际 overflow=${scrollState?.overflow}）`,
);
ok(scrollState?.label === "zeta.ts", `激活 = 最后 file 标签（实际 ${scrollState?.label}）`);
ok(
  scrollState?.inView === true,
  `打开面板后激活标签滚入视野（批 12 反馈①；实际 inView=${scrollState?.inView}）`,
);

console.log(`\n结果：${passCount} pass / ${failCount} fail`);
await browser.close();
process.exit(failCount > 0 ? 1 : 0);
