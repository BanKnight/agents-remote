// v1.5 批 4 预览矩阵·桌面探针（spec §4.5/§4.6，DOM 几何硬数据禁截图）。
//
// 断言域：
//   Part 1 检视器三结构标签投影（right-panel-tabs）：PanelTabBar 仅 files/git/wiki 三 chip
//     （file/wikiread 不再进检视器）；files 树点文件 → 检视器无 file 标签、中栏 tabstrip 出现
//     文件 tab（chip + body .fmeta）。
//   Part 2 tabstrip 右端动作（05h4）：file tab 激活 = [pencil][⋯]；⋯ 菜单三项（复制内容/
//     复制路径/查看 diff）；「查看 diff」→ 中栏新增 git tab；pencil → 编辑态（emeta/aux 桌面档
//     无「收起键盘」）+ 编辑态 tabstrip 只剩结构钮。
//   Part 3 wikiread 进中栏（§4.6）：检视器 wiki 页行点入 → 中栏 wikiread tab + .actbtn
//     「让 Agent 读这篇」（桌面自动生效，多端同构）。
//   Part 4 session tab ⋯ 会话菜单：实例信息/重命名/置顶/关闭会话四项。
//   Part 5 全局文件推入态（10m2，mac-files-global-preview）：/files 点文件 → 主区推入
//     （mback「全局文件」+ h1 mono 文件名 + [pencil][⋯]），中栏 layout 零写入（返回后无 tab
//     残留）；⋯ 菜单 = 复制内容/复制路径/在工作台打开（根作用域无查看 diff）；「在工作台打开」
//     → 中栏 file tab + 退推入态。
//
// 全 mock API（无真实数据创建/删除）；密码自读不进 agent 上下文、不打印值。
// 用法：bun scripts/probe-v15-batch4-desktop.mjs

import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const ORIGIN = process.env.AR_WEB_ORIGIN ?? "http://127.0.0.1:43012";

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

function json(body) {
  return { status: 200, contentType: "application/json", body: JSON.stringify(body) };
}

const AGENTS = [
  {
    id: "agent_a",
    projectName: "proj1",
    provider: "claude",
    displayName: "AAA-running",
    status: "running",
    createdAt: "2026-09-22T00:00:00.000Z",
    model: "opus",
    permissionMode: "plan",
    claudeSessionId: "uuid-aaaa",
  },
];

const HOUR_AGO = Date.now() - 3_600_000;

const FILE_ENTRIES = [
  { name: "src", path: "src", type: "directory", hidden: false, size: null },
  { name: "index.ts", path: "index.ts", type: "file", hidden: false, size: 486 },
  { name: "README.md", path: "README.md", type: "file", hidden: false, size: 64 },
  { name: "archive.zip", path: "archive.zip", type: "file", hidden: false, size: 2048 },
];

const PREVIEWS = {
  "src/index.ts": {
    type: "text",
    projectName: "proj1",
    path: "src/index.ts",
    name: "index.ts",
    size: 486,
    mtimeMs: HOUR_AGO,
    content: 'export const main = (): void => {\n  console.log("hello");\n};\n',
  },
  "index.ts": {
    type: "text",
    projectName: "proj1",
    path: "index.ts",
    name: "index.ts",
    size: 486,
    mtimeMs: HOUR_AGO,
    content: "export const a = 1;\n",
  },
  "README.md": {
    type: "text",
    projectName: "proj1",
    path: "README.md",
    name: "README.md",
    size: 64,
    mtimeMs: HOUR_AGO,
    content: "# proj1\n\nhello **world**\n",
  },
  "archive.zip": {
    type: "unsupported",
    projectName: "proj1",
    path: "archive.zip",
    name: "archive.zip",
    size: 2048,
    reason: "unsupported_type",
  },
};

const WIKI_PAGE = {
  slug: "intro",
  frontmatter: {
    title: "Intro",
    tags: [],
    created: "2026-09-01",
    updated: "2026-10-04",
  },
  body: "# Intro\n\nwiki body line.\n",
};

async function setupMocks(page) {
  await page.route("**/api/projects", (r) => {
    if (r.request().method() === "GET") {
      return r.fulfill(json([{ name: "proj1", path: "/srv/projects/proj1" }]));
    }
    return r.fulfill(json({ ok: true }));
  });
  await page.route(/\/api\/overview$/, (r) =>
    r.fulfill(
      json({
        projectNames: ["proj1"],
        candidates: AGENTS.map((a) => ({
          sessionId: a.id,
          projectName: a.projectName,
          displayName: a.displayName,
          status: a.status,
          provider: a.provider,
          type: "agent",
          createdAt: a.createdAt,
          updatedAt: a.createdAt,
        })),
      }),
    ),
  );
  await page.route(/\/api\/state\/overview\/pinned-sessions(\?.*)?$/, (r) =>
    r.fulfill(json({ sessions: [] })),
  );
  await page.route(/\/api\/projects\/proj1\/agent-sessions\/[^/]+$/, (r) =>
    r.fulfill(
      json({
        session: AGENTS[0],
        availableModels: ["opus"],
        availablePermissionModes: ["plan"],
      }),
    ),
  );
  await page.route(/\/api\/projects\/proj1\/agent-sessions(\?.*)?$/, (r) =>
    r.fulfill(json({ sessions: AGENTS })),
  );
  await page.route(/\/api\/projects\/proj1\/terminal-sessions(\?.*)?$/, (r) =>
    r.fulfill(json({ sessions: [] })),
  );
  await page.route(/\/api\/projects\/proj1\/files(\?.*)?$/, (r) => {
    const path = decodeURIComponent(
      r
        .request()
        .url()
        .match(/path=([^&]*)/)?.[1] ?? "",
    );
    if (path === "src") {
      return r.fulfill(
        json({
          path: "src",
          parentPath: "",
          entries: [
            { name: "index.ts", path: "src/index.ts", type: "file", hidden: false, size: 486 },
          ],
        }),
      );
    }
    return r.fulfill(
      json({
        path: "",
        parentPath: "",
        entries: FILE_ENTRIES,
      }),
    );
  });
  await page.route(/\/api\/projects\/proj1\/files\/preview\?path=([^&]+)$/, (r) => {
    const path = decodeURIComponent(
      r
        .request()
        .url()
        .match(/path=([^&]+)$/)?.[1] ?? "",
    );
    return r.fulfill(json(PREVIEWS[path] ?? PREVIEWS["archive.zip"]));
  });
  await page.route(/\/api\/projects\/proj1\/git\/diff(\?.*)?$/, (r) =>
    r.fulfill(json({ files: [] })),
  );
  await page.route(/\/api\/projects\/proj1\/git\/branches(\?.*)?$/, (r) =>
    r.fulfill(json({ branches: [{ name: "main", current: true, ahead: 0, behind: 0 }] })),
  );
  await page.route(/\/api\/projects\/proj1\/wiki\/intro\/search(\?.*)?$/, (r) =>
    r.fulfill(json({ matches: [] })),
  );
  await page.route(/\/api\/projects\/proj1\/wiki\/intro$/, (r) => r.fulfill(json(WIKI_PAGE)));
  await page.route(/\/api\/projects\/proj1\/wiki\/search\?.*$/, (r) =>
    r.fulfill(json({ matches: [] })),
  );
  await page.route(/\/api\/projects\/proj1\/wiki$/, (r) =>
    r.fulfill(
      json({
        pages: [{ slug: "intro", title: "Intro", tags: [], updated: "2026-10-04" }],
      }),
    ),
  );
  await page.route(/\/api\/mcp(\?.*)?$/, (r) => r.fulfill(json({ servers: [] })));
  await page.route(/\/api\/skills\/installed\?.*$/, (r) => r.fulfill(json({ skills: [] })));
  await page.route(/\/api\/skills\/updates\?.*$/, (r) => r.fulfill(json({ updates: [] })));
  await page.routeWebSocket(/stream/, (ws) => ws.connectToServer());
}

async function login(page) {
  await page.goto(`${ORIGIN}/`);
  await page.waitForSelector('input[type="password"]', { timeout: 15000 });
  await page.getByLabel("访问密码").fill(await readAppPassword());
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForTimeout(1500);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  locale: "zh-CN",
});
const page = await ctx.newPage();
await setupMocks(page);

// ───────────── Part 1 检视器三结构投影 + 中栏文件标签 ─────────────
console.log("Part 1 检视器三结构投影 + 中栏文件标签（05h）");
await login(page);
await page.goto(`${ORIGIN}/projects/proj1?rightTab=files`);
await page.waitForTimeout(1200);
const inspector = page.locator("[data-desktop-inspector]");
ok((await inspector.count()) === 1, "① ?rightTab=files → 桌面检视器挂载");
// PanelTabBar 仅三结构 chip（files/git/wiki）——file/wikiread 不进检视器。
const chipIds = await inspector.locator(".ptab").allTextContents();
ok(chipIds.length === 3, `② 检视器标签数 = 3（文件/Git/Wiki，实际 ${chipIds.length}）`);
// files 树点文件 → 中栏 tabstrip 出现文件 tab（批 4 通路：不再进检视器）。
const treeFile = inspector.getByText("index.ts", { exact: true }).first();
await treeFile.click();
await page.waitForTimeout(900);
const tabstrip = page.locator(".tabstrip");
ok((await tabstrip.count()) >= 1, "③ 中栏 tabstrip 在场");
const fileChip = tabstrip.locator(".tb", { hasText: "index.ts" });
ok((await fileChip.count()) === 1, "④ 中栏出现 index.ts 文件 tab chip");
// 中栏 file tab body = .fmeta（FilePreviewPane desktop 档）。
const midFmeta = page.locator('[data-role="file-preview-pane"]').locator(".fmeta");
ok((await midFmeta.count()) >= 1, "⑤ 中栏 file tab body 含 .fmeta 元信息行");
// reviewer P1-1：中栏页私 padding 档 = 左 14 / 右 26（05h .pcenter 对齐中栏右缘）。
const midFmetaPad = await midFmeta.evaluate((el) => {
  const s = getComputedStyle(el);
  return { left: s.paddingLeft, right: s.paddingRight };
});
ok(
  midFmetaPad.left === "14px" && midFmetaPad.right === "26px",
  `⑤b 中栏 .fmeta padding = 14/26（实际 ${midFmetaPad.left}/${midFmetaPad.right}）`,
);
ok(
  (await inspector.locator('[data-panel-tab-body^="file:"]').count()) === 0,
  "⑥ 检视器无 file 标签 body（预览退役出检视器）",
);

// ───────────── Part 2 tabstrip 右端 [pencil][⋯]（05h4）─────────────
console.log("Part 2 tabstrip 右端动作（05h4）");
const pencil = tabstrip.locator('[aria-label="编辑"]');
ok((await pencil.count()) === 1, "① file tab 激活 → tabstrip [编辑 pencil]");
const dots = tabstrip.locator('[aria-label="更多操作"]');
ok((await dots.count()) === 1, "② tabstrip [⋯] 存在（⋯ 收尾最右）");
await dots.click();
await page.waitForTimeout(400);
const menuText = (await page.locator('[role="menu"]').textContent()) ?? "";
ok(
  /复制内容/.test(menuText) && /复制路径/.test(menuText) && /查看 diff/.test(menuText),
  "③ ⋯ 菜单 = 复制内容/复制路径/查看 diff",
);
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
// 「查看 diff」→ 中栏新增 git tab（diff = 中栏标签）。
await dots.click();
await page.waitForTimeout(300);
await page.locator('[role="menu"]').getByText("查看 diff").click();
await page.waitForTimeout(800);
const gitChip = tabstrip.locator(".tb", { hasText: "index.ts" });
ok((await gitChip.count()) === 2, "④ 「查看 diff」→ 中栏双 tab（file + git）");
// 切回 file tab 验证 pencil 编辑态。
await tabstrip.locator(".tb").nth(0).click();
await page.waitForTimeout(600);
await pencil.click();
await page.waitForTimeout(700);
const pane = page.locator('[data-role="file-preview-pane"]');
ok((await pane.locator(".emeta").count()) > 0, "⑤ pencil → 编辑态 .emeta");
const auxText = (await pane.locator(".aux").textContent()) ?? "";
ok(
  /撤销/.test(auxText) && /重做/.test(auxText) && !/收起键盘/.test(auxText),
  "⑥ .aux 桌面档 = 撤销/重做（无收起键盘）",
);
ok(
  (await tabstrip.locator('[aria-label="编辑"]').count()) === 0 &&
    (await tabstrip.locator('[aria-label="更多操作"]').count()) === 0,
  "⑦ 编辑态 tabstrip 只剩结构钮（pencil/⋯ 消失）",
);
// reviewer P2-2：桌面 aux = 38px 无 safe-area env（.pvaux 页私；iPhone 档 40px+env 不动）。
const auxBox = await pane.locator(".aux").evaluate((el) => {
  const s = getComputedStyle(el);
  return { h: s.height, pb: s.paddingBottom };
});
ok(
  auxBox.h === "38px" && auxBox.pb === "0px",
  `⑦b 桌面 .aux 高 38px 无 env（实际 ${auxBox.h}/pb ${auxBox.pb}）`,
);
// clean 放弃回预览态。
await pane.locator(".emeta .fact .giveup").click();
await page.waitForTimeout(500);
ok((await pane.locator(".emeta").count()) === 0, "⑧ 放弃 → 回预览态，pencil 回归");
ok((await tabstrip.locator('[aria-label="编辑"]').count()) === 1, "⑨ 预览态 pencil 恢复");

// ───────────── Part 3 wikiread 进中栏（§4.6）─────────────
console.log("Part 3 wikiread 进中栏（wiki 检视器 → 中栏 tab）");
const wikiChip = inspector.locator('.ptab[aria-label="Wiki"]');
if ((await wikiChip.count()) > 0) {
  await wikiChip.first().click();
  await page.waitForTimeout(600);
} else {
  // 深链直接激活 wiki 标签。
  await page.goto(`${ORIGIN}/projects/proj1?rightTab=wiki`);
  await page.waitForTimeout(900);
}
const wikiRow = inspector.getByText("Intro", { exact: true }).first();
ok((await wikiRow.count()) > 0, "① wiki 标签含 Intro 页行");
await wikiRow.click();
await page.waitForTimeout(900);
const wikiTabChip = tabstrip.locator(".tb", { hasText: "intro" });
ok((await wikiTabChip.count()) === 1, "② 页行点入 → 中栏 wikiread tab（intro chip）");
ok(
  (await page.getByText("让 Agent 读这篇").count()) > 0,
  "③ 中栏 wikiread 含 .actbtn「让 Agent 读这篇」",
);

// ───────────── Part 4 session tab ⋯ 会话菜单 ─────────────
console.log("Part 4 session tab ⋯ 会话菜单");
// 左栏实例行点入 → 中栏 session tab。
const instRow = page.locator(".sidewin .srow2").filter({ hasText: "AAA-running" }).first();
if ((await instRow.count()) > 0) {
  await instRow.click();
  await page.waitForTimeout(900);
}
const sessChip = tabstrip.locator(".tb", { hasText: "AAA-running" });
ok((await sessChip.count()) === 1, "① 实例行点入 → 中栏 session tab");
await sessChip.click();
await page.waitForTimeout(400);
const sessDots = tabstrip.locator('[aria-label="更多操作"]');
ok((await sessDots.count()) === 1, "② session tab 激活 → tabstrip [⋯]");
await sessDots.click();
await page.waitForTimeout(400);
const sessMenuText = (await page.locator('[role="menu"]').textContent()) ?? "";
ok(
  /实例信息/.test(sessMenuText) &&
    /重命名/.test(sessMenuText) &&
    /置顶/.test(sessMenuText) &&
    /关闭会话/.test(sessMenuText),
  "③ ⋯ 会话菜单 = 实例信息/重命名/置顶/关闭会话",
);
await page.keyboard.press("Escape");
await page.waitForTimeout(300);

// ───────────── Part 5 全局文件推入态（10m2）─────────────
console.log("Part 5 全局文件推入态（mac-files-global-preview）");
await page.goto(`${ORIGIN}/files`);
await page.waitForTimeout(1000);
// 桌面 /files 初始 = 服务器根（全局作用域）——切 seg4「本项目 · proj1」到项目根目录视图。
const scopeSeg = page.getByText("本项目 · proj1", { exact: true });
if ((await scopeSeg.count()) > 0) {
  await scopeSeg.click();
  await page.waitForTimeout(800);
}
const listFile = page.getByText("index.ts", { exact: true, timeout: 5000 }).first();
ok((await listFile.count()) > 0, "① /files 全局文件列表在场");
await listFile.click();
await page.waitForTimeout(900);
// 推入态：mback + h1 mono 文件名 + [pencil][⋯]；中栏 layout 零写入。
const mback = page.locator("header button", { hasText: "全局文件" });
ok((await mback.count()) === 1, "② 推入态 mback「‹ 全局文件」");
const pushH1 = page.locator("h1.font-mono");
ok((await pushH1.count()) === 1, "③ 推入态 h1 文件名（mono）");
ok((await pushH1.textContent()) === "index.ts", `④ h1 = index.ts（${await pushH1.textContent()}）`);
// reviewer P1-1：推入态页私 padding 档 = 左右 20（mac-files-global-preview 对齐 mhead px-5）。
const pushFmetaPad = await page.locator('[data-role="file-preview-pane"] .fmeta').evaluate((el) => {
  const s = getComputedStyle(el);
  return { left: s.paddingLeft, right: s.paddingRight };
});
ok(
  pushFmetaPad.left === "20px" && pushFmetaPad.right === "20px",
  `④b 推入态 .fmeta padding = 20/20（实际 ${pushFmetaPad.left}/${pushFmetaPad.right}）`,
);
ok((await page.locator(".tabstrip").count()) === 0, "⑤ 推入态中栏 tabstrip 无（layout 零写入）");
const pushDots = page.locator("header").locator('[aria-label="更多操作"]');
ok((await pushDots.count()) === 1, "⑥ 推入态 [⋯] 在场");
await pushDots.click();
await page.waitForTimeout(400);
const pushMenu = (await page.locator('[role="menu"]').textContent()) ?? "";
ok(
  /复制内容/.test(pushMenu) && /复制路径/.test(pushMenu) && /在工作台打开/.test(pushMenu),
  "⑦ ⋯ 菜单 = 复制内容/复制路径/在工作台打开",
);
ok(!/查看 diff/.test(pushMenu), "⑧ 根作用域无查看 diff");
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
// ‹ 返回 → 列表（工作台现场零销毁语义由 mback 原地退回承接）。
await mback.click();
await page.waitForTimeout(800);
ok((await page.locator("h1.font-mono").count()) === 0, "⑨ ‹ 返回 → 推入态退出回列表");
// 再推入 → 「在工作台打开」→ 中栏 file tab + 退推入。
await listFile.click();
await page.waitForTimeout(800);
await pushDots.click();
await page.waitForTimeout(300);
await page.locator('[role="menu"]').getByText("在工作台打开").click();
await page.waitForTimeout(900);
ok((await page.locator(".tabstrip").count()) === 1, "⑩ 「在工作台打开」→ 中栏 tabstrip（工作台）");
ok(
  (await page.locator(".tabstrip .tb", { hasText: "index.ts" }).count()) >= 1,
  "⑪ 中栏 file tab 已开",
);
ok((await page.locator("h1.font-mono").count()) === 0, "⑫ 推入态退出（mainPage 让位工作台）");

console.log(`\n结果: ${passCount} pass / ${failCount} fail`);
await browser.close();
process.exit(failCount > 0 ? 1 : 0);
