// M9 批次 d 探针：桌面版页面（09m 插件 / 10m 全局文件 ⌘F / 07m 设置 mainPage /
// 13 MCP 详情桌面入口 / 预览只读化 §6.10-8）。
//
// 覆盖单测验不到的真实浏览器行为（DOM 几何硬数据，禁截图）——1600×1000 桌面：
//   A. mainPage IA：/plugins /files 中栏整页切换 + 左栏恒 sidewin 项目总览（09m/10m）。
//   B. 13 入口：MCP 列表行点击 → pluginmcp_ focusId 开中栏 tab（MobileMcpDetail 复用）。
//   C. ⌘F（10m pin④）：全局文件页聚焦搜索框 + 客户端 filter 过滤文件行。
//   D. 预览只读化：file tab 无保存钮 + CodeMirror contenteditable=false（双端一致）。
//   E. 07m：设置 = main 整页（mhead h1 + 560px col）+ footnav .on + 无 Dialog overlay。
//   G. 批次 5（§6.12j）：05g 全部会话分组列表（置顶/项目分组/空组/限定符/点行激活）+
//      aprow 审批橙行（tint-orange computed + 点击开审批中心）+ 侧栏分档（Mac 250 / iPad 260）。
//      Part 2 = 1100×800 iPad 档 context（260px + global seg4）。
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
const AGENT_B_OV = {
  type: "agent",
  sessionId: "agent_m9d-2",
  projectName: "proj2",
  provider: "claude",
  displayName: "Probe Agent B",
  status: "idle",
  createdAt: "2026-07-26T01:00:00.000Z",
  updatedAt: "2026-07-26T01:00:00.000Z",
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

/** hex (#rgb/#rrggbb) → "r, g, b"（token hex ↔ computed backgroundColor rgb 字符串对照用）。 */
function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const n = parseInt(full, 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

async function setupMocks(page) {
  await page.route(/\/api\/overview$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        projectNames: ["proj1", "proj2", "proj3"],
        candidates: [AGENT_A_OV, AGENT_B_OV, TERM_T_OV],
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
      body: JSON.stringify({
        approvals: [
          {
            projectName: "proj1",
            sessionId: "agent_m9d-1",
            sessionName: "Probe Agent A",
            runtimeKey: "Probe Agent A",
            controlRequestId: "cr_probe_1",
            toolName: "Bash",
            inputSummary: "git push --force origin main",
            createdAt: "2026-07-26T00:00:00.000Z",
            runtimeAlive: true,
          },
        ],
      }),
    }),
  );
  // 05g 置顶段数据源（pin③；§6.12j 批次 5）：置顶 agent_m9d-1。
  await page.route(/\/api\/state\/overview\/pinned-sessions$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sessions: ["agent_m9d-1"] }),
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
  // F7 状态点依赖 usePanelMeta 的 detail（列表缓存预填兜底也在，detail mock 消除真实 api 噪音）。
  await page.route(/\/api\/projects\/proj1\/agent-sessions\/agent_m9d-1$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        session: AGENT_A_S,
        availableModels: ["opus"],
        availablePermissionModes: ["plan"],
      }),
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
    page.on("pageerror", (err) => console.error("PAGEERROR:", err.message.slice(0, 400)));
    await setupMocks(page);
    await login(page);

    // ── A1. /plugins mainPage ──
    await page.goto(`${WEB_ORIGIN}/plugins`);
    await page.waitForTimeout(1500);
    // §6.12j 批次 4（09m 单页）：桌面插件 mainPage = MobilePluginsOverview（MCP 组标题 +
    // 作用域分段），替代 PluginsPanel 的 seg「MCP」大段切。
    ok(
      (await page.locator(".psect").filter({ hasText: "MCP 服务器" }).count()) >= 1,
      "A1 /plugins 中栏渲染 09m 插件单页（MCP 服务器组标题在）",
    );
    ok((await page.locator(".segc").count()) >= 1, "A1b 09m 作用域分段（全局/本项目）在");
    ok(await sideOverviewVisible(page), "A1 左栏恒 sidewin 项目总览（proj1 树行可见）");
    ok(
      (await page.locator("[data-drop-group]").count()) === 0,
      "A1 无实例区窗格（mainPage 态不渲染工作台实例区）",
    );

    // ── B. 13 入口：MCP 卡点击进深度页（第八轮 pluginView 化，不进 tab 体系）──
    const mcpRow = page.getByText("probe-mcp", { exact: true }).first();
    ok(await mcpRow.isVisible(), "B1 09m MCP 组卡渲染（probe-mcp）");
    await mcpRow.click();
    await page.waitForTimeout(1200);
    ok(
      page.url().includes("focusId=pluginmcp_probe-mcp") ||
        /\/plugins\/mcp\/probe-mcp/.test(page.url()),
      "B2 URL 命中 pluginmcp_probe-mcp（focusId 或深度路由）",
    );
    ok(
      (await page.getByText("probe-mcp").count()) === 1,
      "B3 详情主体渲染 probe-mcp 且无 tab chip（pluginView 化：详情不进 tab 体系，仅 nav 单点）",
    );
    ok((await page.locator(".cfg").count()) > 0, "B3b MobileMcpDetail 配置容器渲染（.cfg 键值段）");
    ok(await sideOverviewVisible(page), "B4 进深度页后左栏仍 sidewin 项目总览");

    // ── A2. /files mainPage ──
    await page.goto(`${WEB_ORIGIN}/files`);
    await page.waitForTimeout(1500);
    const wsearch = page.locator(".psearch input");
    ok(await wsearch.isVisible(), "A2 /files 中栏渲染全局文件页（.psearch 搜索框在）");
    ok(await sideOverviewVisible(page), "A2 左栏恒 sidewin 项目总览");

    // ── A3. 10m 页面形态断言（§6.12j 批次 4）──
    // §6.12k 批次 5 起 /projects 合并 side（WorkbenchSide）恒有分组列表，
    // .seg4 全页计数为 2——10m 断言限定 main section（.psearch 所在 section）。
    ok(
      (await page
        .locator("section")
        .filter({ has: page.locator(".psearch") })
        .locator(".seg4")
        .count()) === 1,
      "A3a 10m 作用域 seg4 恰 1（main section 内，左栏 global seg4 另计）",
    );
    ok(
      (await page.getByRole("tab", { name: "全局", exact: true }).isVisible()) &&
        (await page
          .getByRole("tab", { name: /本项目/ })
          .first()
          .isVisible()),
      "A3b seg4 全局/本项目 两段都在",
    );
    ok(
      (await page.locator(".psearch").getByText("⌘F", { exact: true }).count()) === 1,
      "A3c ⌘F 角标恰 1",
    );
    ok((await page.locator(".gfcard").count()) >= 1, "A3d 根层分组卡形态在（10m gfcard）");

    // ── B5-B7. market/sources 桌面可达断言（§6.12j 批次 4）──
    await page.goto(`${WEB_ORIGIN}/plugins/market`);
    await page.waitForTimeout(1200);
    const mktSeg = await page.locator(".tabseg").count();
    ok(mktSeg === 1, "B5 /plugins/market 桌面渲染市场页恰 1（tabseg 双段）");
    const mcpMkt = await page.getByText("MCP 服务器", { exact: true }).count();
    ok(mcpMkt >= 1, "B6 市场页 tabseg「MCP 服务器」段按钮在");
    await page.goto(`${WEB_ORIGIN}/plugins/sources`);
    await page.waitForTimeout(1200);
    const srcPage = await page.getByText("市场源管理", { exact: true }).count();
    ok(srcPage >= 1, "B7 源管理页渲染");

    // 回 /files（B7 停在 sources）——C 段在 /files 页做 ⌘F/filter/probe.txt。
    await page.goto(`${WEB_ORIGIN}/files`);
    await page.waitForTimeout(1200);

    // ── C. ⌘F 聚焦 + filter ──
    // 先进 proj1（中栏 section 作用域——左栏 sidewin 项目树有同名行，误点会跳项目工作台），
    // 再 ⌘F 聚焦 + filter 过滤（顺序反了 filter 会把 proj1 行先滤掉，后续点击空找）。
    await page
      .locator("section")
      .filter({ has: page.locator(".psearch") })
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
    await page.locator(".psearch input").fill("read");
    await page.waitForTimeout(500);
    const readmeVisible = await page
      .locator("section")
      .filter({ has: page.locator(".psearch") })
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
    await page.locator(".psearch input").fill("");

    // ── D. file tab 预览只读 ──
    // 用 .txt（非 md/html → 无 render toggle，直接 source 模式 = CodeMirror）。
    await page
      .locator("section")
      .filter({ has: page.locator(".psearch") })
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
    await page.locator(".footnav button", { hasText: "设置" }).click();
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

    // ── F. 工作台 tabstrip 形制（§6.12j 批次 2）──
    // 05 原型 tabstrip：32px 条（bg-tabstrip + border-b sep）+ .tb 文本 tab（on=ink-1 600 +
    // ::after 2.5px 主色下划线）+ 6px 状态点 + 条上「＋」；右栏 Inspector = glabel2「检视 ·
    // 只读」+ 标准 .seg4（32px）。全部 DOM 几何/computed 硬数据。
    await page.goto(`${WEB_ORIGIN}/projects/proj1`);
    await page.waitForTimeout(1200);
    try {
      await page
        .locator("main > div > aside")
        .nth(0)
        .getByText("Probe Agent A")
        .click({ timeout: 5000 });
    } catch {
      const dbg = await page.evaluate(() => ({
        url: location.href,
        asides: document.querySelectorAll("main > div > aside").length,
        rootLen: document.getElementById("root")?.innerHTML.length ?? -1,
        body: document.body.innerText.replace(/\s+/g, " ").slice(0, 250),
      }));
      console.error(
        await page.evaluate(() => {
          const btn = [...document.querySelectorAll("button")].find((b) =>
            b.textContent?.includes("Show Error"),
          );
          btn?.click();
          return document.body.innerText.replace(/\s+/g, " ").slice(0, 900);
        }),
      );
      console.error("F 段现场:", JSON.stringify(dbg));
      throw new Error("F 段点击超时（现场已打印）");
    }
    await page.waitForFunction(() => document.querySelectorAll("[data-drop-group]").length >= 1, {
      timeout: 5000,
    });
    const strip = await page.evaluate(() => {
      const el = document.querySelector(".tabstrip");
      if (!el) return null;
      const rootStyle = getComputedStyle(document.documentElement);
      const style = getComputedStyle(el);
      const active = el.querySelector(".tb.on");
      const after = active ? getComputedStyle(active, "::after") : null;
      const dot = el.querySelector('.tb span[role="img"]');
      const plus = el.querySelector(".tabstrip .plus");
      return {
        h: Math.round(el.getBoundingClientRect().height),
        bg: style.backgroundColor,
        tabstripToken: rootStyle.getPropertyValue("--bg-tabstrip").trim(),
        borderBottom: style.borderBottomWidth,
        underlineH: after ? after.height : null,
        underlineBg: after ? after.backgroundColor : null,
        primaryToken: rootStyle.getPropertyValue("--c-primary").trim(),
        dotSize: dot ? Math.round(dot.getBoundingClientRect().width) : null,
        dotLabel: dot ? dot.getAttribute("aria-label") : null,
        plusTag: plus ? plus.tagName : null,
        plusLabel: plus ? plus.getAttribute("aria-label") : null,
      };
    });
    ok(strip !== null, "F1 GroupHeader tabstrip 渲染（.tabstrip）");
    if (strip) {
      ok(strip.h === 32, `F2 tabstrip 高 32px（实际 ${strip.h}）`);
      ok(
        strip.bg === `rgb(${hexToRgb(strip.tabstripToken)})`,
        `F3 tabstrip bg = --bg-tabstrip token（${strip.bg}）`,
      );
      ok(strip.borderBottom === "1px", `F4 border-b 1px（实际 ${strip.borderBottom}）`);
      ok(strip.underlineH === "2.5px", `F5 active 下划线 2.5px（实际 ${strip.underlineH}）`);
      ok(
        strip.underlineBg === `rgb(${hexToRgb(strip.primaryToken)})`,
        `F6 下划线 = --c-primary（${strip.underlineBg}）`,
      );
      ok(strip.dotSize === 6, `F7 状态点 6px（实际 ${strip.dotSize}）`);
      ok(!!strip.dotLabel, `F8 状态点 aria-label 在（${strip.dotLabel}）`);
      ok(strip.plusTag === "BUTTON", `F9 「＋」= button.plus（实际 ${strip.plusTag}）`);
      ok(
        (strip.plusLabel ?? "").includes("新建"),
        `F10 ＋ aria-label 含「新建」（${strip.plusLabel}）`,
      );
    }

    // 右栏 Inspector：glabel2「检视 · 只读」+ 标准 seg4（32px，§6.12j）。
    await page.getByRole("button", { name: "展开右栏" }).click();
    await page.waitForFunction(() => document.querySelectorAll("main > div > aside").length === 2, {
      timeout: 5000,
    });
    const insp = await page.evaluate(() => {
      const aside = document.querySelectorAll("main > div > aside")[1];
      if (!aside) return null;
      const label = aside.querySelector(".glabel2");
      const seg = aside.querySelector(".seg4");
      return {
        label: label
          ? label.textContent.trim()
          : aside.textContent.includes("检视")
            ? "检视"
            : null,
        segH: seg ? Math.round(seg.getBoundingClientRect().height) : null,
        segSpans: seg ? [...seg.querySelectorAll("span")].map((s) => s.textContent.trim()) : [],
      };
    });
    ok(insp !== null, "F11 右栏 Inspector 渲染");
    if (insp) {
      ok(insp.label === "检视 · 只读", `F12 glabel2「检视 · 只读」（实际 ${insp.label}）`);
      ok(insp.segH === 32, `F13 标准 seg4 高 32px（实际 ${insp.segH}）`);
      ok(
        insp.segSpans.join(",") === "文件,Git,Wiki",
        `F14 三段顺序（右栏无历史，与 iPhone focus 工具同构；实际 ${JSON.stringify(insp.segSpans)}）`,
      );
    }

    // ── G. 05g 全部会话分组 + aprow 审批橙行 + 侧栏分档（§6.12j 批次 5）──
    // 当前在 /projects/proj1（F 段）。合并 side = aside nth(0)，右栏 Inspector = nth(1)。
    const side = page.locator("main > div > aside").nth(0);
    const leftSeg = side.locator(".seg4.mini");
    ok(await leftSeg.isVisible(), "G1 project side seg4 mini（项目/全部）在");
    await leftSeg.getByText("全部", { exact: true }).click();
    await page.waitForTimeout(500);
    const microLabels = await side.locator(".microlabel").allTextContents();
    ok(
      microLabels.some((s) => s.includes("置顶")),
      "G2 05g 置顶组头在（pinned mock）",
    );
    ok(
      microLabels.some((s) => s.includes("proj2 · 1")),
      "G3 proj2 分组组头「proj2 · 1」在",
    );
    ok(
      microLabels.some((s) => s.includes("proj3 · 0")),
      "G4 proj3 空组组头「proj3 · 0」在",
    );
    ok(
      (await side.getByText("暂无活跃会话").count()) === 1,
      "G5 proj3 空组「暂无活跃会话」引导行在",
    );
    const pinnedLive = await side
      .locator("button", { hasText: "Probe Agent A" })
      .first()
      .textContent();
    ok((pinnedLive ?? "").includes("proj1"), "G6 置顶行 live off 项目限定符 = proj1（按钮文本含）");
    // pin⑤：点行 → 中栏开 tab 并激活（跨项目 proj2）。
    await side.getByText("Probe Agent B", { exact: true }).click();
    await page.waitForTimeout(800);
    ok(
      page.url().includes("/projects/proj2/session/agent_m9d-2"),
      "G7 点分组行 → 跨项目激活（/projects/proj2/session/agent_m9d-2）",
    );
    await page.goto(`${WEB_ORIGIN}/projects/proj1`);
    await page.waitForTimeout(1200);

    // aprow（04 审批橙行）：左栏底部 approval 橙行 + tint-orange computed + 点击开审批中心。
    const aprow = page.locator(".aprow").first();
    ok((await aprow.boundingBox()) !== null, "G8 aprow 审批橙行渲染（boundingBox 非 null）");
    const aprowText = await aprow.textContent();
    ok((aprowText ?? "").includes("审批 · 1"), "G9 aprow 文本「审批 · 1 ›」");
    const aprowStyle = await aprow.evaluate((el) => {
      const rootStyle = getComputedStyle(document.documentElement);
      return {
        bg: getComputedStyle(el).backgroundColor,
        token: rootStyle.getPropertyValue("--tint-orange").trim(),
        h: Math.round(el.getBoundingClientRect().height),
      };
    });
    // tint 类 token 源码是现代语法（index.css:221 深色 `rgb(255 159 10 / 0.12)`），dist minify
    // 转写为 8 位 hex（#ff9f0a1f）→ computed rgba 四段。alpha 0x1f=31, 31/255≈0.12。
    const t8 = aprowStyle.token.replace("#", "");
    const expectA = t8.length === 8 ? (Number.parseInt(t8.slice(6, 8), 16) / 255).toFixed(2) : "-1";
    ok(
      t8.length === 8 &&
        aprowStyle.bg ===
          `rgba(${parseInt(t8.slice(0, 2), 16)}, ${parseInt(t8.slice(2, 4), 16)}, ${parseInt(t8.slice(4, 6), 16)}, ${expectA})`,
      `G10 aprow bg = --tint-orange（bg=${aprowStyle.bg} / token=${aprowStyle.token}）`,
    );
    ok(aprowStyle.h === 30, `G11 aprow 高 30px（实际 ${aprowStyle.h}）`);
    await aprow.click();
    await page.waitForTimeout(500);
    ok((await page.locator(".apop").count()) === 1, "G12 aprow 点击开审批中心 Popover（.apop）");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    // 侧栏分档 Mac 档（1600 ≥ 1180 → 250px；Part 2 为 iPad 档 260px）。
    const firstCol = await page.evaluate(() => {
      const grid = document.querySelector("main > div");
      return grid ? getComputedStyle(grid).gridTemplateColumns.split(" ")[0] : "";
    });
    ok(firstCol === "250px", `G13 Mac 档（1600px）侧栏首列 250px（实际 ${firstCol}）`);

    // Part 2：1100×800 iPad 档 context——260px 分档 + global scope 左栏 05g seg4。
    console.log("Part 2: 1100×800 iPad 档 → 侧栏 260px / global seg4");
    const ctx2 = await browser.newContext({
      viewport: { width: 1100, height: 800 },
      locale: "zh-CN",
    });
    const page2 = await ctx2.newPage();
    page2.on("pageerror", (err) => console.error("PAGEERROR:", err.message.slice(0, 400)));
    await setupMocks(page2);
    await login(page2);
    await page2.goto(`${WEB_ORIGIN}/projects`);
    await page2.waitForTimeout(1500);
    const firstColPad = await page2.evaluate(() => {
      const grid = document.querySelector("main > div");
      return grid ? getComputedStyle(grid).gridTemplateColumns.split(" ")[0] : "";
    });
    ok(firstColPad === "260px", `G14 iPad 档（1100px）侧栏首列 260px（实际 ${firstColPad}）`);
    ok(
      (await page2.locator("main > div > aside").nth(0).locator(".microlabel").count()) >= 1,
      "G15 /projects global scope side = 05g 分组列表（microlabel 分组在）",
    );
    ok(
      await page2.locator("main > div > aside").nth(0).locator(".seg4.mini").isVisible(),
      "G16 global scope seg4 mini 在（05g:32 原文——「全部」on + 项目段回上次项目，§6.12k review P2④）",
    );
    ok(
      (
        await page2.locator("main > div > aside").nth(0).locator(".seg4.mini .on").innerText()
      ).includes("全部"),
      "G17 global scope seg4「全部」on（05g 语境）",
    );
    await ctx2.close();

    await ctx.close();
  } finally {
    await browser.close();
  }
  console.log(`\n结果: ${passCount} passed, ${failCount} failed`);
  process.exit(failCount > 0 ? 1 : 0);
})();
