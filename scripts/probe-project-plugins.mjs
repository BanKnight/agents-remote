// 探针：项目级 skill + MCP（插件系统最后一块 D4/D7）——项目工作台「插件」tab 接线。
// 断言：
//  A（真实后端，桌面 1280×900）：
//    1. test 项目工作台 middle tab bar 含「Plugins」tab（buildOverviewTabs 单独 push，非 inspection tab）
//    2. 点 Plugins → PluginsPanel 一级 SegmentedControl 含 Skills/MCP
//    3. skill 子区无 Sources tab（源是全局 settings，项目隐藏）
//    4. skill Manage tab 无「Check for updates」按钮（项目 update 直接拉取，隐藏全局检测入口）
//    5. 切 MCP → MCP 区渲染（scope=project 透传；test 无 .mcp.json → 空态 + add 表单）
//    6. 项目级端点：skills/mcp list 200 空、未知项目 → 404
//  B（mock 项目 skills，独立 context）：项目 Manage 每行恒显「Update」按钮 + 无「Check for updates」
//    （mock 单个 project skill，验证「有 skill 时」项目分支——真实后端 test 空态覆盖不到）。
//  C（真实后端，移动 390×844）：MobileProjectOverview header 含「Plugins」tab。
// 密码自读不打印。web DOM 探针前置过 ar-verify-css 三道闸。
// 用法：bun scripts/probe-project-plugins.mjs
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

async function gotoProject(page) {
  await page.goto(`${WEB_ORIGIN}/projects/${projectName}`);
  // 桌面 middle tab bar（project-left-panel nav，aria-label=workbench.projectsAria="Projects"）。
  const middleNav = page.locator('nav[aria-label="Projects"]');
  await middleNav.waitFor({ state: "visible", timeout: 10_000 });
  return middleNav;
}

// ── 段 A：真实后端（桌面）──
async function sectionA(browser) {
  console.log("== A. 真实后端桌面 ==");
  const page = await (
    await browser.newContext({ viewport: { width: 1280, height: 900 } })
  ).newPage();
  try {
    await login(page);
    const middleNav = await gotoProject(page);

    check(
      "A1 项目工作台 middle tab bar 含「Plugins」tab",
      (await middleNav.getByRole("button", { name: "Plugins", exact: true }).count()) === 1,
    );

    await middleNav.getByRole("button", { name: "Plugins", exact: true }).click();
    await page.getByRole("button", { name: "Skills", exact: true }).waitFor({ state: "visible" });
    check(
      "A2 PluginsPanel 一级 SegmentedControl 含 Skills/MCP",
      (await page.getByRole("button", { name: "MCP", exact: true }).count()) === 1,
    );
    check(
      "A3 项目 skill 子区隐藏 Sources tab（源是全局 settings）",
      (await page.getByRole("button", { name: "Sources", exact: true }).count()) === 0,
    );

    await page.getByRole("button", { name: "Manage", exact: true }).click();
    // 项目 Manage 异步 list（真实 /api/projects/test/skills → 空）；等空态文案落定再断言。
    await page
      .getByText("No installed skills", { exact: true })
      .waitFor({ state: "visible", timeout: 10_000 });
    check(
      "A4 项目 Manage tab 无「Check for updates」按钮",
      (await page.getByRole("button", { name: "Check for updates", exact: true }).count()) === 0,
    );

    await page.getByRole("button", { name: "MCP", exact: true }).click();
    // MCP 区渲染：add 表单 Name 输入（恒渲染）+ 空态（test 无 .mcp.json）。
    await page.getByLabel("Name", { exact: true }).waitFor({ state: "visible" });
    check(
      "A5 切 MCP → MCP 区渲染（scope=project 透传）",
      (await page.getByLabel("Name", { exact: true }).count()) > 0,
    );
    check(
      "A5b MCP 空态（test 无 .mcp.json）",
      (await page.getByText("No MCP servers", { exact: true }).count()) > 0,
    );

    // 项目级端点（页面内 fetch 带 cookie；未知项目 404 走真实后端）。
    const [s1, s2, s3] = await page.evaluate(
      (proj) =>
        Promise.all([
          fetch(`/api/projects/${proj}/skills?agent=claude-code`).then((r) => r.status),
          fetch(`/api/projects/${proj}/mcp`).then((r) => r.status),
          fetch("/api/projects/no-such-project/skills?agent=claude-code").then((r) => r.status),
        ]),
      projectName,
    );
    check("A6 GET 项目 skills list → 200", s1 === 200, `got ${s1}`);
    check("A7 GET 项目 mcp list → 200", s2 === 200, `got ${s2}`);
    check("A8 未知项目 skills → 404", s3 === 404, `got ${s3}`);
  } finally {
    await page.context().close();
  }
}

// ── 段 B：mock 项目 skills（验证「有 skill 时」项目 Manage 分支）──
async function sectionB(browser) {
  console.log("\n== B. mock 项目 skills ==");
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  // mock 项目 skill list → 单个 tdd（scope=project），preview 兜底。
  await page.route(new RegExp(`/api/projects/${projectName}/skills\\?`), (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        skills: [
          {
            name: "tdd",
            path: `/projects/${projectName}/.claude/skills/tdd`,
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
      body: JSON.stringify({ name: "tdd", content: "# tdd", source: "github" }),
    }),
  );
  try {
    await login(page);
    const middleNav = await gotoProject(page);
    await middleNav.getByRole("button", { name: "Plugins", exact: true }).click();
    await page.getByRole("button", { name: "Manage", exact: true }).click();
    await page.getByText("tdd", { exact: true }).waitFor({ state: "visible", timeout: 10_000 });

    check(
      "B1 项目 Manage 有 skill 行恒显「Update」按钮（直接拉取）",
      (await page.getByRole("button", { name: "Update", exact: true }).count()) > 0,
    );
    check(
      "B2 项目 Manage 有 skill 行仍无「Check for updates」（隐藏全局检测入口）",
      (await page.getByRole("button", { name: "Check for updates", exact: true }).count()) === 0,
    );
  } finally {
    await ctx.close();
  }
}

// ── 段 C：移动端（真实后端）──
async function sectionC(browser) {
  console.log("\n== C. 移动端 ==");
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  try {
    await login(page);
    await page.goto(`${WEB_ORIGIN}/projects/${projectName}`);
    // 移动项目总览 header（MobileTabHeader）含 7 个 tab button（含 Plugins）。
    const pluginsTab = page.locator("header button", { hasText: "Plugins" }).first();
    await pluginsTab.waitFor({ state: "visible", timeout: 10_000 });
    check("C1 移动 MobileProjectOverview header 含「Plugins」tab", (await pluginsTab.count()) > 0);

    // 点 Plugins → 移动端 PluginsPanel（MobileProjectOverview plugins 手写分支）。
    await pluginsTab.click();
    await page.getByRole("button", { name: "Skills", exact: true }).waitFor({ state: "visible" });
    check(
      "C2 移动 PluginsPanel 渲染（SegmentedControl Skills/MCP）",
      (await page.getByRole("button", { name: "MCP", exact: true }).count()) === 1,
    );
  } finally {
    await ctx.close();
  }
}

(async () => {
  // web DOM 探针强制前置：CSS 落盘三道闸不过则整体 fail，不跑 DOM 断言。
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
    await sectionC(browser);
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r).length;
  console.log(`\n${failed === 0 ? "ALL PASS" : `${failed} FAILED`} (${results.length} assertions)`);
  process.exit(failed === 0 ? 0 : 1);
})();
