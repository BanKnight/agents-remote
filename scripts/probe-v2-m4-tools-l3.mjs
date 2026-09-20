// M4 工具与深度页探针（v2 M4：03m/03o/03p 三工具态 + 03q/03r/03t/03u/03v/03s L3 详情页）。
//
// 覆盖单测验不到的真实浏览器行为（DOM 几何硬数据，禁截图）：
//   Part 1 三工具态（?tab=git/files/wiki）：data-mobile-tool 容器 + header ticon .hl 高亮 +
//     toolChip（.gitchip 计数 / .crumb 目录链 / .wsearch 胶囊）。
//   Part 2 L3 git history/commit：links「全部历史」→ /git/history（dlg 日期分组 + loadmore）；
//     点 crow → /git/commit/$（cmsg + dstat + commitFiles frow 内嵌展开 CommitFileDiff）。
//   Part 3 L3 branches：links「分支 (N)」→ /git/branches（bcur 当前分支蓝卡 + brow + rocard
//     只读橙卡 + sectRemoteBranches 远程段）。
//   Part 4 L3 file preview：files 工具点文件行 → file focus（l3 nav back=父目录名 + meta 行
//     「查看 diff」→ git focus，back=「Git 检视」）。
//   Part 5 L3 wiki reader：wiki 工具点页行 → /wiki/$（wmeta + readbtn + wlink + Markdown 正文 +
//     rel 同组页）+ readbtn 注入会话 sheet。
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
    { name: "src", path: "src", type: "directory", mtimeMs: Date.now() },
    { name: "README.md", path: "README.md", type: "file", mtimeMs: Date.now() },
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
        path: "src/a.ts",
        scope: "worktree",
        status: "modified",
        diff: "diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,3 +1,4 @@\n const a = 1;\n-const b = 2;\n+const b = 3;\n+const c = 4;\n",
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
        size: 27,
        content: "probe line 1\nprobe line 2\n",
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

/** 预置 V4 layout（单 leaf；file tab 可选）。 */
async function seedLayout(page, { active }) {
  await page.goto(`${ORIGIN}/projects/${projectName}`);
  await page.evaluate((activeId) => {
    localStorage.removeItem("workbenchMiddleTab");
    localStorage.setItem(
      "workbenchLayoutV4",
      JSON.stringify({
        root: { kind: "leaf", id: "leaf-seed", tabs: [], activeTabId: activeId ?? null },
        activeGroupId: "leaf-seed",
        maximized: null,
      }),
    );
  }, active);
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
await seedLayout(page, { active: null });
await login(page);

console.log("Part 1: 三工具态（gitchip / crumb / wsearch + ticon 高亮）");
await page.goto(`${ORIGIN}/projects/${projectName}?tab=git`);
await page.waitForSelector('[data-mobile-tool="git"]', { timeout: 10000 });
ok(await page.locator('[data-mobile-tool="git"]').first().isVisible(), "git 工具面板可见");
const hlCount = await page.locator(".ticon.hl").count();
ok(hlCount === 1, `ticon 高亮恰 1 个（实际 ${hlCount}）`);
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
ok(await page.getByText("工作区改动").isVisible(), "sect「工作区改动」");
ok(await page.getByText("全部历史").isVisible(), "links「全部历史」");

await page.goto(`${ORIGIN}/projects/${projectName}?tab=files`);
await page.waitForSelector('[data-mobile-tool="files"]', { timeout: 10000 });
const crumb = await page.evaluate(() => {
  const el = document.querySelector(".crumb");
  if (!el) return null;
  return { text: el.textContent, buttons: el.querySelectorAll("button").length };
});
ok(crumb?.text.startsWith("proj1"), `crumb 项目名首段（${crumb?.text}）`);
ok((await page.locator('[data-mobile-tool="files"] .frow').count()) === 2, "files frow 2 行");

await page.goto(`${ORIGIN}/projects/${projectName}?tab=wiki`);
await page.waitForSelector('[data-mobile-tool="wiki"]', { timeout: 10000 });
const wsearch = await page.locator(".wsearch").first();
ok((await wsearch.count()) >= 1 && (await wsearch.isVisible()), "wsearch chip 可见");
ok(await page.getByText("指南").first().isVisible(), "wiki 分组「指南」");

console.log("Part 2: L3 git history / commit");
await page.goto(`${ORIGIN}/projects/${projectName}?tab=git`);
await page.waitForSelector('[data-mobile-tool="git"]', { timeout: 10000 });
await page.getByText("全部历史").click();
try {
  await page.waitForURL(/\/git\/history/, { timeout: 5000 });
} catch {
  console.error(`  [debug] 当前 URL: ${page.url()}`);
  throw new Error("history 导航未发生");
}
const nav = await page.evaluate(() => {
  const back = document.querySelector(".nav .back");
  const title = document.querySelector(".nav .nv-t");
  return { back: back?.textContent?.trim(), title: title?.textContent?.trim() };
});
ok(nav?.back === "Git 检视", `history back = 「Git 检视」（实际 ${nav?.back}）`);
ok(nav?.title === "提交历史", `history 标题 = 「提交历史」（实际 ${nav?.title}）`);
ok((await page.locator(".dlg").count()) >= 1, "dlg 日期分组行存在");
ok(
  (await page.locator('[data-mobile-tool="git"]').count()) === 0,
  "L3 独占内容区（工具面板不叠放，P1 互斥）",
);
ok(await page.getByText("abc1234").first().isVisible(), "crow 短 hash 显示");
ok((await page.locator(".loadmore").count()) === 0, "total 已尽无 loadmore");

await page.getByText("abc1234").first().click();
await page.waitForURL(/\/git\/commit\/abc1234/, { timeout: 5000 });
ok(await page.getByText("feat: probe commit today").first().isVisible(), "commit cmsg");
const dstat = await page.locator(".dstat").first();
ok((await dstat.count()) === 1, "dstat 行存在");
ok(await page.getByText("feat: probe commit today").first().isVisible(), "commit 消息在页");
await page.locator(".frow").first().click();
await page.getByText("const neu = 2;").first().waitFor({ state: "visible", timeout: 5000 });
ok(await page.getByText("const neu = 2;").first().isVisible(), "commit 文件内嵌 diff 展开");

console.log("Part 3: L3 branches");
await page.goto(`${ORIGIN}/projects/${projectName}?tab=git`);
await page.waitForSelector('[data-mobile-tool="git"]', { timeout: 10000 });
await page.getByText(/分支 \(3\)/).click();
await page.waitForURL(/\/git\/branches/, { timeout: 5000 });
const bnav = await page.evaluate(() => {
  const back = document.querySelector(".nav .back");
  const title = document.querySelector(".nav .nv-t");
  return { back: back?.textContent?.trim(), title: title?.textContent?.trim() };
});
ok(bnav?.back === "Git 检视", `branches back = 「Git 检视」（实际 ${bnav?.back}）`);
ok((bnav?.title ?? "").startsWith("分支 · 3"), `branches 标题（${bnav?.title}）`);
ok((await page.locator(".bcur").count()) === 1, "bcur 当前分支蓝卡");
ok(await page.getByText("feature").first().isVisible(), "本地分支行 feature");
ok((await page.locator(".rocard").count()) === 1, "rocard 只读橙卡");
ok(await page.getByText("远程分支").isVisible(), "远程分支 sect");

console.log("Part 4: L3 file preview → 查看 diff → git focus");
await page.goto(`${ORIGIN}/projects/${projectName}?tab=files`);
await page.waitForSelector('[data-mobile-tool="files"]', { timeout: 10000 });
await page.locator('[data-mobile-tool="files"] .frow', { hasText: "README.md" }).click();
await page.waitForTimeout(800);
const fnav = await page.evaluate(() => {
  const back = document.querySelector(".nav .back");
  const title = document.querySelector(".nav .nv-t");
  return { back: back?.textContent?.trim(), title: title?.textContent?.trim() };
});
ok(fnav?.back === "proj1", `file 根目录 back = 项目名（实际 ${fnav?.back}）`);
ok(fnav?.title === "README.md", `file 标题 = 文件名（实际 ${fnav?.title}）`);
ok(await page.getByText(/行/).first().isVisible(), "preview meta 行数");
const diffBtn = page.locator(".meta .diff");
ok((await diffBtn.count()) === 1, "meta「查看 diff」按钮");
await diffBtn.click();
await page.waitForTimeout(800);
const gnav = await page.evaluate(() => {
  const back = document.querySelector(".nav .back");
  return back?.textContent?.trim();
});
ok(gnav === "Git 检视", `diff focus back = 「Git 检视」（实际 ${gnav}）`);

console.log("Part 5: L3 wiki reader + readbtn sheet");
await page.goto(`${ORIGIN}/projects/${projectName}?tab=wiki`);
await page.waitForSelector('[data-mobile-tool="wiki"]', { timeout: 10000 });
await page.locator(".wpg", { hasText: "介绍" }).first().click();
await page.waitForURL(/\/wiki\/intro/, { timeout: 5000 });
const wnav = await page.evaluate(() => {
  const back = document.querySelector(".nav .back");
  const title = document.querySelector(".nav .nv-t");
  return { back: back?.textContent?.trim(), title: title?.textContent?.trim() };
});
ok(wnav?.back === "指南", `wiki back = 分组名（实际 ${wnav?.back}）`);
ok(wnav?.title === "介绍", `wiki 标题 = 页名（实际 ${wnav?.title}）`);
ok(await page.locator(".readbtn").isVisible(), "readbtn「让 Agent 读这篇」");
ok(await page.locator(".wlink").isVisible(), "wlink「复制链接」");
ok(await page.getByText("这是 wiki 页正文内容。").isVisible(), "Markdown 正文渲染");
ok(await page.getByText("进阶").first().isVisible(), "rel 同组页「进阶」");
await page.locator(".readbtn").click();
await page.waitForTimeout(500);
const sheetItems = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('[role="menuitem"]')].map((n) => n.textContent.trim());
  return btns;
});
ok(
  sheetItems.some((x) => x.includes("Probe Agent A")),
  `readbtn sheet 含会话（${sheetItems.join(" | ")}）`,
);

console.log("Part 6: 03w files 长按菜单（触屏可达，design-reviewer P2-5）");
await page.goto(`${ORIGIN}/projects/${projectName}?tab=files`);
await page.waitForSelector('[data-mobile-tool="files"]', { timeout: 10000 });
const lrow = page.locator('[data-mobile-tool="files"] .frow', { hasText: "README.md" });
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

console.log(`\n结果：${passCount} pass / ${failCount} fail`);
await browser.close();
process.exit(failCount > 0 ? 1 : 0);
