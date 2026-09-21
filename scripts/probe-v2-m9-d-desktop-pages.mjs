// M9 批次 d 探针：桌面版页面（09m 插件 / 10m 全局文件 ⌘F / 07m 设置 mainPage /
// 13 MCP 详情桌面入口 / 预览只读化 §6.10-8）。
//
// 覆盖单测验不到的真实浏览器行为（DOM 几何硬数据，禁截图）——1600×1000 桌面：
//   A. mainPage IA：/plugins /files 中栏整页切换 + 左栏恒 sidewin 项目总览（09m/10m）。
//   B. 13 入口：MCP 列表行点击 → pluginmcp_ focusId 开中栏 tab（MobileMcpDetail 复用）。
//   C. ⌘F（10m pin④）：全局文件页聚焦搜索框 + 客户端 filter 过滤文件行。
//   D. 预览只读化：file tab 无保存钮 + CodeMirror contenteditable=false（双端一致）。
//   E. 07m：设置 = main 整页（mhead h1 + 560px col）+ footnav .on + 无 Dialog overlay。
//
// mock 三铁律：形状对齐 shared；overview candidates 完备（prune activeIds 源）；
// approvals/stream abort（铁律③，隔离真实环境 WS 推送）。用法：
//   bun scripts/probe-v2-m9-d-desktop-pages.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";

// overview candidate 形状（shared OverviewCandidate）——左栏项目总览 + prune activeIds 源。
const AGENT_A_OV = {
  type: "agent",
  sessionId: "agent_m9d-1",
  projectName: "proj1",
  provider: "claude",
  displayName: "Probe Agent A",
  status: "running",
  createdAt: "2026-07-26T00:00:00.000Z",
  updatedAt: "2026-07-26T00:00:00.000Z",
};
const TERM_T_OV = {
  type: "terminal",
  sessionId: "term_m9d-1",
  projectName: "proj1",
  displayName: "probe-term",
  status: "running",
  createdAt: "2026-07-26T02:00:00.000Z",
  updatedAt: "2026-07-26T02:00:00.000Z",
};
// 项目内 session 形状（id 字段，与 overview candidate 分开构造——批次 b 教训）。
const AGENT_A_S = { ...AGENT_A_OV, id: "agent_m9d-1" };
const TERM_T_S = { ...TERM_T_OV, id: "term_m9d-1" };

// rootBrowse 全局文件页（10m）：root 一级 = proj1 目录；proj1 内 = README.md（filter 与
// preview 断言目标）+ src 目录。
const ROOT_FILES = {
  parentPath: null,
  entries: [{ name: "proj1", path: "proj1", type: "directory", mtimeMs: 0 }],
};
const PROJ1_FILES = {
  parentPath: null,
  entries: [
    { name: "README.md", path: "README.md", type: "file", mtimeMs: 0 },
    { name: "probe.txt", path: "probe.txt", type: "file", mtimeMs: 0 },
    { name: "src", path: "src", type: "directory", mtimeMs: 0 },
  ],
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

async function setupMocks(page) {
  await page.route(/\/api\/overview$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        projectNames: ["proj1"],
        candidates: [AGENT_A_OV, TERM_T_OV],
      }),
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
  // 铁律③：拒掉真实环境 approvals WS，防空快照竞速覆盖 REST mock。
  await page.route(/\/api\/approvals\/stream$/, (r) => r.abort());
  await page.route(/\/api\/projects\/proj1\/agent-sessions(?:\?.*)?$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sessions: [AGENT_A_S] }),
    }),
  );
  await page.route(/\/api\/projects\/proj1\/terminal-sessions(?:\?.*)?$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sessions: [TERM_T_S] }),
    }),
  );
  await page.route(/\/api\/projects\/proj1\/agent-history\?.*$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ entries: [] }),
    }),
  );
  // 全局文件页（10m）：rootBrowse 走 /api/root/files，进项目走 project files。
  await page.route(/\/api\/root\/files(?:\?.*)?$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(ROOT_FILES),
    }),
  );
  await page.route(/\/api\/projects\/proj1\/files(?:\?.*)?$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(PROJ1_FILES),
    }),
  );
  // file tab 预览（D 只读断言目标）。name 必须是 probe.txt——响应 name 决定 md/html render
  // 分支（README.md 会走 render 模式不渲 CodeMirror）。
  await page.route(/\/api\/projects\/proj1\/files\/preview(?:\?.*)?$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        type: "text",
        projectName: "proj1",
        path: "probe.txt",
        name: "probe.txt",
        size: 6,
        content: "probe\n",
        mtimeMs: 0,
      }),
    }),
  );
  // 13 入口：全局 MCP 列表（McpPanel ListRow onOpenDetail 目标）。
  await page.route(/\/api\/mcp$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        servers: [{ name: "probe-mcp", type: "stdio", command: "uvx", args: ["mcp-probe"] }],
      }),
    }),
  );
  // 插件页 skill tab（默认 section）与 18 市场：installed/sources 静态空。
  await page.route(/\/api\/skills\/installed\?.*$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ skills: [] }),
    }),
  );
  await page.route(/\/api\/skills\/sources$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sources: [] }),
    }),
  );
  // 07m 设置页数据（SettingsRootView 只读展示；形状对齐 GetSettingsResponse）。
  await page.route(/\/api\/settings$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        settings: {
          runtimes: {
            claude: { presets: [], activePresetId: "", enable1mContext: false, effort: "medium" },
            pi: { presets: [], activePresetId: "", firecrawlApiKeyMasked: "" },
            acp: {},
          },
          skills: { sources: [] },
        },
      }),
    }),
  );
}

async function login(page) {
  await page.goto(`${WEB_ORIGIN}/`);
  await page.waitForSelector('input[type="password"]', { timeout: 15000 });
  await page.getByLabel("访问密码").fill(await readAppPassword());
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForTimeout(700);
}

/** 左栏 sidewin（GlobalProjectsOverview）是否在渲染（项目树行文本）。 */
async function sideOverviewVisible(page) {
  return page.getByText("proj1", { exact: true }).first().isVisible();
}

(async () => {
  const browser = await chromium.launch();
  try {
    console.log("Part 1: 1600×1000 桌面 → mainPage IA / 13 入口 / ⌘F / 预览只读 / 07m 设置");
    const ctx = await browser.newContext({
      viewport: { width: 1600, height: 1000 },
      locale: "zh-CN",
    });
    const page = await ctx.newPage();
    await setupMocks(page);
    await login(page);

    // ── A1. /plugins mainPage ──
    await page.goto(`${WEB_ORIGIN}/plugins`);
    await page.waitForTimeout(1500);
    ok(
      (await page.getByRole("button", { name: "MCP" }).count()) >= 1,
      "A1 /plugins 中栏渲染插件面板（seg MCP 入口在）",
    );
    ok(await sideOverviewVisible(page), "A1 左栏恒 sidewin 项目总览（proj1 树行可见）");
    ok(
      (await page.locator("[data-drop-group]").count()) === 0,
      "A1 无实例区窗格（mainPage 态不渲染工作台实例区）",
    );

    // ── B. 13 入口：MCP 列表行点击开 pluginmcp tab ──
    await page.getByRole("button", { name: "MCP" }).click();
    await page.waitForTimeout(800);
    const mcpRow = page.getByText("probe-mcp", { exact: true }).first();
    ok(await mcpRow.isVisible(), "B1 McpPanel 列表行渲染（probe-mcp）");
    await mcpRow.click();
    await page.waitForTimeout(1200);
    ok(
      page.url().includes("focusId=pluginmcp_probe-mcp") ||
        /\/plugins\/mcp\/probe-mcp/.test(page.url()),
      "B2 URL 命中 pluginmcp_probe-mcp（focusId 或深度路由）",
    );
    ok(
      (await page.getByText("probe-mcp").count()) >= 2,
      "B3 中栏 tab chip + 详情主体均渲染 probe-mcp（MobileMcpDetail 复用）",
    );
    ok(await sideOverviewVisible(page), "B4 开 tab 后左栏仍 sidewin 项目总览");

    // ── A2. /files mainPage ──
    await page.goto(`${WEB_ORIGIN}/files`);
    await page.waitForTimeout(1500);
    const wsearch = page.locator(".wsearch input");
    ok(await wsearch.isVisible(), "A2 /files 中栏渲染全局文件页（.wsearch 搜索框在）");
    ok(await sideOverviewVisible(page), "A2 左栏恒 sidewin 项目总览");

    // ── C. ⌘F 聚焦 + filter ──
    // 先进 proj1（中栏 section 作用域——左栏 sidewin 项目树有同名行，误点会跳项目工作台），
    // 再 ⌘F 聚焦 + filter 过滤（顺序反了 filter 会把 proj1 行先滤掉，后续点击空找）。
    await page
      .locator("section")
      .filter({ has: page.locator(".wsearch") })
      .getByText("proj1", { exact: true })
      .first()
      .click();
    await page.waitForTimeout(800);
    await page.keyboard.press("Control+f");
    await page.waitForTimeout(300);
    ok(
      await page.evaluate(() => document.activeElement?.tagName === "INPUT"),
      "C1 ⌘F 聚焦全局文件页搜索框",
    );
    await page.locator(".wsearch input").fill("read");
    await page.waitForTimeout(500);
    const readmeVisible = await page
      .locator("section")
      .filter({ has: page.locator(".wsearch") })
      .getByText("README.md")
      .first()
      .isVisible();
    const srcVisible = await page
      .locator("section")
      .getByText("src", { exact: true })
      .first()
      .isVisible();
    ok(readmeVisible, "C2 filter=read 命中 README.md 行");
    ok(!srcVisible, "C3 filter=read 过滤掉 src 行（客户端 filter）");
    await page.locator(".wsearch input").fill("");

    // ── D. file tab 预览只读 ──
    // 用 .txt（非 md/html → 无 render toggle，直接 source 模式 = CodeMirror）。
    await page
      .locator("section")
      .filter({ has: page.locator(".wsearch") })
      .getByText("probe.txt")
      .first()
      .click();

    await page.waitForTimeout(1500);
    const cmContent = page.locator(".cm-content").first();
    ok(await cmContent.isVisible(), "D1 file tab 渲染 CodeMirror（source 模式）");
    ok(
      (await cmContent.getAttribute("contenteditable")) === "false",
      "D2 CodeMirror 只读（contenteditable=false，§6.10-8）",
    );
    ok(
      (await page.getByRole("button", { name: "保存" }).count()) === 0,
      "D3 无保存按钮（编辑 UI 入口移除，saveFileContent API 保留）",
    );

    // ── E. 07m 设置 mainPage ──
    await page.locator(".footnav button").click();
    await page.waitForTimeout(1000);
    ok(page.url().includes("leftMode=settings"), "E1 footnav 设置 → URL leftMode=settings");
    const h1 = page.locator("h1", { hasText: "设置" }).first();
    ok(await h1.isVisible(), "E2 main 整页 mhead h1「设置」");
    const col = page.locator(".max-w-\\[560px\\]").first();
    ok(await col.isVisible(), "E3 560px 居中 col（07m .col 语义）");
    ok(
      await page.evaluate(() => {
        const el = document.querySelector(".footnav .on");
        return el ? el.textContent?.includes("设置") : false;
      }),
      "E4 footnav 设置项 .on 激活",
    );
    ok(
      (await page.locator("[role=dialog]").count()) === 0,
      "E5 无 Dialog overlay（取代 M7 居中弹窗）",
    );
    ok(await sideOverviewVisible(page), "E6 设置页左栏仍 sidewin 项目总览");
    ok(
      await page
        .locator("h1")
        .first()
        .evaluate((el) => getComputedStyle(el).fontSize === "17px"),
      "E7 mhead h1 17px（07m 原型字号）",
    );

    // ── E 补充. 设置 → [文件] footnav 导航闭环 ──
    await page.goto(`${WEB_ORIGIN}/files`);
    await page.waitForTimeout(800);
    ok(
      !(await page.evaluate(
        () => document.querySelector(".footnav .on")?.textContent?.includes("设置") ?? false,
      )),
      "E8 非设置页 footnav 无 .on（active 判定随 leftMode）",
    );

    await ctx.close();
  } finally {
    await browser.close();
  }
  console.log(`\n结果: ${passCount} passed, ${failCount} failed`);
  process.exit(failCount > 0 ? 1 : 0);
})();
