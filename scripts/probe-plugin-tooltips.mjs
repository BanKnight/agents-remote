// 探针：插件页 tooltips（截断文本 hover 显完整 + 操作按钮 hover 说明）。
// 验证 DOM title 属性被注入（非 vision）：ListRow string title/subtitle span 有原生 title；
// ActionButton 有 title；项目 scope skill 详情 header span 有 title。
// 密码自读不打印。web DOM 探针前置过 ar-verify-css 三道闸。
// 用法：bun scripts/probe-plugin-tooltips.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";
import { verifyCssFlushed } from "./ar-verify-css.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const projectName = process.env.PROBE_PROJECT ?? "test";

const results = [];
function check(name, cond, detail = "") {
  results.push(Boolean(cond));
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function login(page) {
  await page.goto(`${WEB_ORIGIN}/`);
  await page.getByLabel("Password").fill(await readAppPassword());
  await page.getByRole("button", { name: "Unlock console" }).click();
}

// ── 段 A：全局 /plugins（user scope，覆盖 Discover/Manage/Sources/MCP 全按钮）──
async function sectionA(browser) {
  console.log("== A. 全局 /plugins tooltips ==");
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: "en-US",
  });
  const page = await ctx.newPage();

  // mock skill 搜索：单个长名 skill（验证 truncate + title）。
  await page.route(/\/api\/skills\/search\?/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        skills: [
          {
            id: "long-skill",
            name: "very-long-skill-name-that-truncates",
            source: "owner/repo-name",
            installs: 42,
            skillId: "long-skill",
          },
        ],
      }),
    }),
  );
  // mock 已装：两 skill——A manageable+hasUpdate（显 Update）、B 非 manageable（显 bringUnderManagement）。
  await page.route(/\/api\/skills\/installed\?/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        skills: [
          {
            name: "updatable-skill",
            path: "/long/absolute/path/to/updatable-skill",
            scope: "user",
            agents: ["claude-code"],
          },
          {
            name: "local-skill",
            path: "/long/absolute/path/to/local-skill",
            scope: "user",
            agents: ["claude-code"],
          },
        ],
      }),
    }),
  );
  await page.route(/\/api\/skills\/updates\?/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        updates: [
          { name: "updatable-skill", manageable: true, hasUpdate: true },
          { name: "local-skill", manageable: false, hasUpdate: false },
        ],
      }),
    }),
  );
  // mock sources：单个 source（label 长）。
  await page.route(/\/api\/skills\/sources$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sources: [{ id: "src-1", repo: "owner/repo", branch: "main", label: "my-source-label" }],
      }),
    }),
  );
  // mock MCP（user scope）：单个 stdio server（command 长）。
  await page.route("**/api/mcp", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        servers: [
          {
            name: "my-mcp-server",
            type: "stdio",
            command: "npx -y some-long-mcp-command-name",
            args: [],
          },
        ],
      }),
    }),
  );

  try {
    await login(page);
    await page.goto(`${WEB_ORIGIN}/plugins`);
    await page.getByRole("button", { name: "Skills", exact: true }).waitFor({ state: "visible" });

    // ── Discover：搜索结果 Install 按钮 + 行 title/subtitle ──
    await page.getByRole("button", { name: "Discover", exact: true }).click();
    // query < 2 字符只显示 hint 不调 search；输入触发搜索（mock 路由匹配任意 q）。
    await page.getByLabel("Search skills on skills.sh").fill("long");
    await page
      .getByText("very-long-skill-name-that-truncates")
      .waitFor({ state: "visible", timeout: 10_000 });
    const installTitle = await page
      .getByRole("button", { name: "Install", exact: true })
      .first()
      .getAttribute("title");
    check("A1 Discover Install 按钮 title 非空", installTitle !== null, `got "${installTitle}"`);
    check(
      "A2 Discover Install title 含意图文案",
      (installTitle ?? "").toLowerCase().includes("install"),
      `got "${installTitle}"`,
    );
    // 行 title span（data-list-row-title）原生 title === skill name。
    const discoverTitleSpan = page
      .locator("[data-list-row-title]")
      .filter({ hasText: "very-long-skill-name-that-truncates" })
      .first();
    check(
      "A3 Discover 行 title span 原生 title === skill name",
      (await discoverTitleSpan.getAttribute("title")) === "very-long-skill-name-that-truncates",
    );
    // subtitle span（title span 的下一个兄弟）原生 title === source。
    const discoverSubSpan = discoverTitleSpan.locator("xpath=following-sibling::span[1]");
    check(
      "A4 Discover 行 subtitle span 原生 title === source",
      (await discoverSubSpan.getAttribute("title")) === "owner/repo-name",
    );

    // ── Manage：Update / Uninstall / checkUpdates / bringUnderManagement ──
    await page.getByRole("button", { name: "Manage", exact: true }).click();
    await page
      .locator("[data-list-row-title]")
      .filter({ hasText: "updatable-skill" })
      .first()
      .waitFor({ state: "visible", timeout: 10_000 });

    // checkUpdates 按钮恒显示，先断言其 title，再 click 触发 refetch（useCheckSkillUpdates
    // enabled:false 手动驱动，避 GitHub API 限速；不 click 则 status 空，Update/bringUnderManagement 不显）。
    const checkUpdatesBtn = page.getByRole("button", { name: "Check for updates", exact: true });
    const checkUpdatesTitle = await checkUpdatesBtn.getAttribute("title");
    check(
      "A5 Manage checkUpdates 按钮 title 非空（全局才显示）",
      checkUpdatesTitle !== null,
      `got "${checkUpdatesTitle}"`,
    );
    await checkUpdatesBtn.click();
    // 等 updates mock 回 → Update 按钮（updatable-skill manageable+hasUpdate）显。
    await page
      .getByRole("button", { name: "Update", exact: true })
      .first()
      .waitFor({ state: "visible", timeout: 10_000 });

    const updateTitle = await page
      .getByRole("button", { name: "Update", exact: true })
      .first()
      .getAttribute("title");
    check("A6 Manage Update 按钮 title 非空", updateTitle !== null, `got "${updateTitle}"`);

    const uninstallTitle = await page
      .getByRole("button", { name: "Uninstall", exact: true })
      .first()
      .getAttribute("title");
    check(
      "A7 Manage Uninstall 按钮 title 非空",
      uninstallTitle !== null,
      `got "${uninstallTitle}"`,
    );

    const bringTitle = await page
      .getByRole("button", { name: "Bring under management", exact: true })
      .first()
      .getAttribute("title");
    check(
      "A8 Manage bringUnderManagement 按钮 title 非空（非 manageable skill 行）",
      bringTitle !== null,
      `got "${bringTitle}"`,
    );

    // ── Sources：addSource / removeSource ──
    await page.getByRole("button", { name: "Sources", exact: true }).click();
    await page.getByText("my-source-label").waitFor({ state: "visible", timeout: 10_000 });

    const addSourceTitle = await page
      .getByRole("button", { name: "Add source", exact: true })
      .getAttribute("title");
    check(
      "A9 Sources addSource 按钮 title 非空",
      addSourceTitle !== null,
      `got "${addSourceTitle}"`,
    );

    const removeSourceTitle = await page
      .getByRole("button", { name: "Remove source", exact: true })
      .first()
      .getAttribute("title");
    check(
      "A10 Sources removeSource 按钮 title 非空",
      removeSourceTitle !== null,
      `got "${removeSourceTitle}"`,
    );

    // ── MCP：Add / Edit / Remove + server 行 title/subtitle ──
    await page.getByRole("button", { name: "MCP", exact: true }).click();
    await page.getByText("my-mcp-server").waitFor({ state: "visible", timeout: 10_000 });

    const mcpAddTitle = await page
      .getByRole("button", { name: "Add server", exact: true })
      .getAttribute("title");
    check(
      "A11 MCP Add 按钮 title 非空（非编辑态=Add）",
      mcpAddTitle !== null,
      `got "${mcpAddTitle}"`,
    );

    const mcpEditTitle = await page
      .getByRole("button", { name: "Edit", exact: true })
      .first()
      .getAttribute("title");
    check("A12 MCP Edit 按钮 title 非空", mcpEditTitle !== null, `got "${mcpEditTitle}"`);

    const mcpRemoveTitle = await page
      .getByRole("button", { name: "Remove", exact: true })
      .first()
      .getAttribute("title");
    check("A13 MCP Remove 按钮 title 非空", mcpRemoveTitle !== null, `got "${mcpRemoveTitle}"`);

    // server 行 title span 原生 title === server name。
    const mcpTitleSpan = page
      .locator("[data-list-row-title]")
      .filter({ hasText: "my-mcp-server" })
      .first();
    check(
      "A14 MCP 行 title span 原生 title === server name",
      (await mcpTitleSpan.getAttribute("title")) === "my-mcp-server",
    );
    // subtitle span（command）原生 title === command。
    const mcpSubSpan = mcpTitleSpan.locator("xpath=following-sibling::span[1]");
    check(
      "A15 MCP 行 subtitle span 原生 title === command",
      (await mcpSubSpan.getAttribute("title")) === "npx -y some-long-mcp-command-name",
    );
  } finally {
    await ctx.close();
  }
}

// ── 段 B：项目工作台插件 tab（project scope inline skill 详情 header title）──
async function sectionB(browser) {
  console.log("\n== B. 项目 scope 插件 tooltips + skill 详情 header ==");
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: "en-US",
  });
  const page = await ctx.newPage();
  // mock 项目 skill：单个（name 长）。
  await page.route(new RegExp(`/api/projects/${projectName}/skills\\?`), (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        skills: [
          {
            name: "project-skill-long-name",
            path: `/projects/${projectName}/.claude/skills/project-skill-long-name`,
            scope: "project",
            agents: ["claude-code"],
          },
        ],
      }),
    }),
  );
  await page.route(new RegExp(`/api/projects/${projectName}/skills/preview`), (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        name: "project-skill-long-name",
        content: "# project skill",
        source: "local",
      }),
    }),
  );

  try {
    await login(page);
    await page.goto(`${WEB_ORIGIN}/projects/${projectName}`);
    const middleNav = page.locator('nav[aria-label="Projects"]');
    await middleNav.waitFor({ state: "visible", timeout: 10_000 });
    await middleNav.getByRole("button", { name: "Plugins", exact: true }).click();
    await page.getByRole("button", { name: "Manage", exact: true }).click();
    await page
      .locator("[data-list-row-title]")
      .filter({ hasText: "project-skill-long-name" })
      .first()
      .waitFor({ state: "visible", timeout: 10_000 });

    // 项目 scope 每行恒显 Update（直接拉取）。
    const updateTitle = await page
      .getByRole("button", { name: "Update", exact: true })
      .first()
      .getAttribute("title");
    check("B1 项目 Manage Update 按钮 title 非空", updateTitle !== null, `got "${updateTitle}"`);

    // 项目 skill 行 title/subtitle span 原生 title。
    const titleSpan = page
      .locator("[data-list-row-title]")
      .filter({ hasText: "project-skill-long-name" })
      .first();
    check(
      "B2 项目 skill 行 title span 原生 title === skill name",
      (await titleSpan.getAttribute("title")) === "project-skill-long-name",
    );
    const subSpan = titleSpan.locator("xpath=following-sibling::span[1]");
    const subTooltip = await subSpan.getAttribute("title");
    check(
      "B3 项目 skill 行 subtitle span 原生 title === path",
      subTooltip?.includes("project-skill-long-name"),
      `got "${subTooltip}"`,
    );

    // 点 skill 行进 inline 详情 → header span title（#75）。
    await titleSpan.click();
    // inline 详情 header：返回按钮 + skill name span（truncate text-sm font-semibold）。
    const headerSpan = page.locator("span.truncate.text-sm.font-semibold.text-on-surface").first();
    await headerSpan.waitFor({ state: "visible", timeout: 10_000 });
    check(
      "B4 项目 skill 详情 header span 原生 title === skill name",
      (await headerSpan.getAttribute("title")) === "project-skill-long-name",
    );
  } finally {
    await ctx.close();
  }
}

(async () => {
  // web DOM 探针强制前置：CSS 落盘三道闸不过则整体 fail。
  const css = await verifyCssFlushed({
    origin: WEB_ORIGIN,
    expectClasses: ["bg-primary/10", "text-primary", "bg-surface-inset"],
  });
  if (!css.pass) {
    console.error(css.details.join("\n"));
    process.exit(1);
  }

  const browser = await chromium.launch();
  try {
    await sectionA(browser);
    await sectionB(browser);
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r).length;
  console.log(`\n${failed === 0 ? "ALL PASS" : `${failed} FAILED`} (${results.length} assertions)`);
  process.exit(failed === 0 ? 0 : 1);
})();
