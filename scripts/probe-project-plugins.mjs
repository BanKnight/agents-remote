// 探针：项目级 skill + MCP（插件系统项目 scope，v1.4 批6 重排后语境改写）。
// 旧承载（middle tab bar nav Projects + PluginsPanel + 移动 drawer nav Project sidebar）已随
// §6.12j 批次 4 / v1.4 批6 退役（替代 = /plugins 单页 MobilePluginsOverview 的「本项目」段），
// 本探针按新承载重写：
//  A（真实后端，桌面 1280×900）：项目级端点矩阵（skills/mcp list 200、未知项目 404）+
//    /plugins「本项目」段空态（test 项目无技能/MCP）。
//  B（mock，桌面 1280×900）：项目段卡渲染（技能 2 + disabled chip；MCP 1 + disabled chip）+
//    长按项目技能卡 → 菜单 → 停用 → POST /api/projects/test/skills/disable payload 断言 →
//    mock 翻转后卡 chip 出现（refetch 闭环）。
// 断言依据（home 实现）：project 技能卡 = div[role=button]+ActionMenu（同 global）；project MCP 卡 =
// 静态 div 无菜单（/plugins/mcp/$ 只承载 global，记档 M6-b）；项目段技能组头无「检查更新/＋ 添加」
//（projectName ? null）。manageable/Local 徽标 = 旧 PluginsPanel 语义，已随组件退役不再断言。
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

function json(body) {
  return { status: 200, contentType: "application/json", body: JSON.stringify(body) };
}

async function login(page) {
  await page.goto(`${WEB_ORIGIN}/`);
  await page.getByLabel("访问密码").fill(await readAppPassword());
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForTimeout(1200);
}

/** 桌面 /plugins + 预置 lastProject=test → segc 切「本项目」。返回 page。 */
async function openProjectScope(browser) {
  const page = await (
    await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "zh-CN" })
  ).newPage();
  await page.addInitScript(() => {
    localStorage.setItem("workbench.lastProjectKey", JSON.stringify("test"));
  });
  await login(page);
  await page.goto(`${WEB_ORIGIN}/plugins`);
  await page.locator(".segc button").nth(1).click();
  await page.waitForTimeout(400);
  return page;
}

// ── 段 A：真实后端（桌面）──
async function sectionA(browser) {
  console.log("== A. 真实后端桌面：项目级端点 + 项目段空态 ==");
  const page = await openProjectScope(browser);
  try {
    // 项目级端点（页面内 fetch 带 cookie；未知项目 404 走真实后端）。
    const [s1, s2, s3, s4] = await page.evaluate(
      (proj) =>
        Promise.all([
          fetch(`/api/projects/${proj}/skills?agent=claude-code`).then((r) => r.status),
          fetch(`/api/projects/${proj}/mcp`).then((r) => r.status),
          fetch("/api/projects/no-such-project/skills?agent=claude-code").then((r) => r.status),
          // 项目级 disable 路由通（security review 批6：tail 曾漏分发 → 全段 404，mock 探针拦不住）
          fetch(`/api/projects/${proj}/skills/disable`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: "no-such-skill", agent: "claude-code" }),
          }).then((r) => r.status),
        ]),
      projectName,
    );
    check("A1 GET 项目 skills list → 200", s1 === 200, `got ${s1}`);
    check("A2 GET 项目 mcp list → 200", s2 === 200, `got ${s2}`);
    check("A3 未知项目 skills → 404", s3 === 404, `got ${s3}`);
    check("A3b 项目级 disable 端点路由通（未装技能 → 400 而非 404）", s4 === 400, `got ${s4}`);

    // 项目段空态（test 项目无技能/MCP）：两个空态文案 + 组头无检测/添加入口（projectName ? null）。
    await page
      .getByText("暂无已安装技能", { exact: false })
      .waitFor({ state: "visible", timeout: 10_000 });
    check("A4 项目段技能空态（test 无技能）", true);
    check(
      "A5 项目段技能组头无「检查更新/＋ 添加」入口（仅全局段有；MCP 组头＋两段共有）",
      (await page.locator(".psect", { hasText: "已安装技能" }).locator("button.r").count()) === 0,
    );
    check(
      "A6 项目段 MCP 空态（test 无 .mcp.json）",
      (await page.getByText("暂无 MCP 服务器", { exact: false }).count()) > 0,
    );
  } finally {
    await page.context().close();
  }
}

// ── 段 B：mock 项目插件卡 + 长按停用闭环 ──
async function sectionB(browser) {
  console.log("\n== B. mock 项目卡渲染 + 长按停用 payload ==");
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: "zh-CN",
  });
  const page = await ctx.newPage();
  // 项目 skill list：active + disabled 两态。disable handler 翻转 disabled（refetch 闭环断言）。
  // description/source（2026-10-04 列表副行「描述 · 来源」）：pskill 有锁 slug、pskill-off 手写缺省。
  const projectSkills = [
    {
      name: "pskill",
      path: `/projects/${projectName}/.claude/skills/pskill`,
      scope: "project",
      agents: ["claude-code"],
      description: "项目级技能示例",
      source: "acme/skills",
    },
    {
      name: "pskill-off",
      path: `/projects/${projectName}/.claude/skills/pskill-off`,
      scope: "project",
      agents: ["claude-code"],
      disabled: true,
    },
  ];
  const projectServers = [
    { name: "proj-mcp", type: "stdio", command: "npx", args: ["-y", "proj-mcp"] },
    {
      name: "proj-mcp-off",
      type: "http",
      url: "https://off.example.com",
      disabled: true,
    },
  ];
  const disablePosts = [];
  await page.route(`**/api/projects/${projectName}/skills?*`, (r) =>
    r.fulfill(json({ skills: projectSkills })),
  );
  await page.route(`**/api/projects/${projectName}/skills/disable`, (r) => {
    const body = JSON.parse(r.request().postData() ?? "{}");
    disablePosts.push(body);
    const skill = projectSkills.find((s) => s.name === body.name);
    if (skill) skill.disabled = true;
    return r.fulfill(json({ ok: true }));
  });
  await page.route(`**/api/projects/${projectName}/mcp`, (r) =>
    r.fulfill(json({ servers: projectServers })),
  );
  try {
    await page.addInitScript(() => {
      localStorage.setItem("workbench.lastProjectKey", JSON.stringify("test"));
    });
    await login(page);
    await page.goto(`${WEB_ORIGIN}/plugins`);
    await page.locator(".segc button").nth(1).click();
    await page.waitForTimeout(400);

    // 技能卡 2 张（pskill / pskill-off；hasText 子串匹配都命中）。
    const skillCards = page.locator(".pcard", { hasText: "pskill" });
    await skillCards.first().waitFor({ state: "visible", timeout: 10_000 });
    check("B1 项目技能卡 = 2（pskill / pskill-off）", (await skillCards.count()) === 2);
    check(
      "B2 disabled 技能卡带「已停用」chip",
      (await page
        .locator(".pcard", { hasText: "pskill-off" })
        .locator(".upd", { hasText: "已停用" })
        .count()) === 1,
    );
    // 列表卡来源（2026-10-04 用户拍板「右上角标注来源」；project scope 同款）：pskill 有锁
    // slug → 右上角 chip「来源:acme/skills」+ d2 纯描述；pskill-off 无锁记录 → chip
    //「来源:本地」（手写语义）+ 无 d2（mock 未给 description，条件渲染）。
    {
      // pskill 在 mock 数组首位 → DOM 序第一（hasText 子串匹配无法区分 pskill/pskill-off）。
      const pskillD2 = await skillCards.first().locator(".d2").textContent();
      check(
        "B2b 技能卡 d2 = 纯描述",
        pskillD2?.includes("项目级技能示例") === true && !pskillD2.includes("来源:"),
      );
      check(
        "B2b2 技能卡右上角来源 chip = 来源:acme/skills",
        (await skillCards.first().locator(".r1 .upd", { hasText: "来源:acme/skills" }).count()) ===
          1,
      );
      const offCard = page.locator(".pcard", { hasText: "pskill-off" }).first();
      check(
        "B2c 手写技能卡右上角 chip = 来源:本地",
        (await offCard.locator(".r1 .upd", { hasText: "来源:本地" }).count()) === 1,
      );
      check(
        "B2c2 手写技能卡无 d2（无描述不渲染空副行）",
        (await offCard.locator(".d2").count()) === 0,
      );
    }

    // MCP 卡 2 张 + disabled chip 恰 1（proj-mcp-off，静态卡无菜单）。
    await page
      .locator(".pcard", { hasText: "proj-mcp" })
      .first()
      .waitFor({ state: "visible", timeout: 10_000 });
    check(
      "B3 项目 MCP 卡 = 2（proj-mcp / proj-mcp-off）",
      (await page.locator(".pcard", { hasText: "proj-mcp" }).count()) === 2,
    );
    check(
      "B4 disabled MCP 卡带「已停用」chip",
      (await page
        .locator(".pcard", { hasText: "proj-mcp-off" })
        .locator(".upd", { hasText: "已停用" })
        .count()) === 1,
    );

    // 长按项目技能卡（pointerdown touch 持 650ms > LONG_PRESS_MS 500）→ 菜单 → 停用 → payload。
    const card = page.locator(".pcard", { hasText: "pskill" }).first();
    await card.dispatchEvent("pointerdown", {
      clientX: 40,
      clientY: 40,
      isPrimary: true,
      pointerId: 7,
      pointerType: "touch",
    });
    await page.waitForTimeout(650);
    await card.dispatchEvent("pointerup", { pointerId: 7, pointerType: "touch", isPrimary: true });
    await page.waitForSelector('[role="menu"]', { timeout: 5000 });
    check(
      "B5 项目技能卡长按菜单含「停用（停止注入）」",
      (await page.locator('[role="menuitem"]', { hasText: "停用（停止注入）" }).count()) === 1,
    );
    await page.locator('[role="menuitem"]', { hasText: "停用" }).click();
    await page.waitForTimeout(800);
    check(
      "B6 POST /api/projects/test/skills/disable 恰 1",
      disablePosts.length === 1,
      `got ${disablePosts.length}`,
    );
    if (disablePosts.length === 1) {
      check(
        "B7 disable payload {name, agent}",
        disablePosts[0].name === "pskill" && disablePosts[0].agent === "claude-code",
        JSON.stringify(disablePosts[0]),
      );
    }
    // mock 翻转 disabled → invalidate refetch → pskill 卡 chip 出现（hasNotText 排除 pskill-off 卡）。
    check(
      "B8 停用后 pskill 卡出现「已停用」chip（refetch 闭环）",
      (await page
        .locator(".pcard", { hasText: "pskill" })
        .filter({ hasNotText: "pskill-off" })
        .locator(".upd", { hasText: "已停用" })
        .count()) === 1,
    );
  } finally {
    await ctx.close();
  }
}

(async () => {
  // web DOM 探针强制前置：CSS 落盘三道闸不过则整体 fail，不跑 DOM 断言。
  const css = await verifyCssFlushed({
    expectClasses: ["bg-primary/10", "text-primary", "bg-surface-inset"],
    origin: WEB_ORIGIN,
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
