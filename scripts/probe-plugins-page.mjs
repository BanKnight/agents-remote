// 探针：/plugins 全局插件页（Phase 2.3）——Skill/MCP 二级 SegmentedControl 切换 + MCP 新增
// 表单三类型（stdio/sse/http）+ 信任确认 Dialog + skill 更新徽标/一键更新/纳入管理。
// DOM 结构断言（不靠 vision），覆盖单测渲染不到的真实组件接线。
// 密码自读，不进 agent 上下文、不打印值。web DOM 探针前置过 ar-verify-css 三道闸。
// 用法：bun scripts/probe-plugins-page.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";
import { verifyCssFlushed } from "./ar-verify-css.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const projectName = process.env.PROBE_PROJECT ?? "test";

async function setupMocks(page) {
  // /plugins 只需 overview 让登录后导航不炸；skill 列表/MCP 列表/更新检测全 mock（探针测 UI 接线）。
  await page.route(new RegExp("/api/overview$"), (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ projectNames: [projectName], candidates: [] }),
    }),
  );
  // 已装 skill 三态：tdd=有更新(manageable)、cloudflare=已最新(manageable)、handwritten=本地(不可管理)。
  const skills = [
    { name: "tdd", path: "~/.claude/skills/tdd", scope: "global", agents: ["claude-code"] },
    {
      name: "cloudflare",
      path: "~/.claude/skills/cloudflare",
      scope: "global",
      agents: ["claude-code"],
    },
    {
      name: "handwritten",
      path: "~/.claude/skills/handwritten",
      scope: "global",
      agents: ["claude-code"],
    },
  ];
  await page.route(new RegExp("/api/skills/installed"), (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ skills }) }),
  );
  await page.route(new RegExp("/api/skills/updates"), (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        updates: [
          {
            name: "tdd",
            hasUpdate: true,
            manageable: true,
            sourceType: "github",
            sourceUrl: "github.com/vercel-labs/agent-skills",
          },
          {
            name: "cloudflare",
            hasUpdate: false,
            manageable: true,
            sourceType: "github",
            sourceUrl: "github.com/vercel-labs/agent-skills",
          },
          { name: "handwritten", hasUpdate: false, manageable: false },
        ],
      }),
    }),
  );
  await page.route(new RegExp("/api/skills/sources"), (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sources: [] }),
    }),
  );
  // MCP 列表（GET /api/mcp）：stdio + http 各一。
  await page.route(new RegExp("/api/mcp$"), (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        servers: [
          { name: "github", type: "stdio", command: "npx", args: ["-y", "@github/mcp"] },
          { name: "remote", type: "http", url: "https://example.com/mcp" },
        ],
      }),
    }),
  );
}

async function login(page) {
  await page.goto(`${WEB_ORIGIN}/`);
  await page.getByLabel("Password").fill(await readAppPassword());
  await page.getByRole("button", { name: "Unlock console" }).click();
}

(async () => {
  const results = [];
  const check = (name, cond, detail = "") => {
    results.push(Boolean(cond));
    console.log(`${cond ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  };

  // web DOM 探针强制前置：CSS 落盘三道闸不过则整体 fail，不跑 DOM 断言。
  const css = await verifyCssFlushed({
    origin: WEB_ORIGIN,
    expectClasses: ["bg-primary/15", "rounded-full", "bg-surface-inset"],
  });
  if (!css.pass) {
    console.error(css.details.join("\n"));
    process.exit(1);
  }

  const browser = await chromium.launch();
  try {
    // ── 移动端（390×844，MobilePluginsOverview）──
    const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await mobile.newPage();
    await setupMocks(page);
    await login(page);
    await page.goto(`${WEB_ORIGIN}/plugins`);
    await page.getByRole("button", { name: "Skills", exact: true }).waitFor({ timeout: 8000 });

    // 1. 一级 Skill/MCP SegmentedControl，默认 Skill 激活
    check(
      "一级 [Skills] 按钮",
      (await page.getByRole("button", { name: "Skills", exact: true }).count()) === 1,
    );
    check(
      "一级 [MCP] 按钮",
      (await page.getByRole("button", { name: "MCP", exact: true }).count()) === 1,
    );
    check(
      "默认 Skill 子区激活",
      (await page
        .getByRole("button", { name: "Skills", exact: true })
        .getAttribute("aria-pressed")) === "true",
    );
    // 2. Skill 二级 tab（Discover/Manage/Sources）
    check(
      "Skill 二级 [Discover] tab",
      (await page.getByRole("button", { name: "Discover", exact: true }).count()) === 1,
    );

    // 3. 切 MCP：表单（stdio 默认：Name+Command+Args+Env 三类型按钮）+ server 列表
    await page.getByRole("button", { name: "MCP", exact: true }).click();
    await page.getByRole("textbox", { name: "Name" }).waitFor({ timeout: 5000 });
    check("MCP 表单 Name 输入框", (await page.getByRole("textbox", { name: "Name" }).count()) >= 1);
    check(
      "类型 SegmentedControl 三选 (Stdio/SSE/HTTP)",
      (await page.getByRole("button", { name: "Stdio", exact: true }).count()) === 1 &&
        (await page.getByRole("button", { name: "SSE", exact: true }).count()) === 1 &&
        (await page.getByRole("button", { name: "HTTP", exact: true }).count()) === 1,
    );
    check(
      "stdio 默认显示 Command 输入",
      (await page.getByRole("textbox", { name: "Command" }).count()) === 1,
    );
    check(
      "MCP server 列表 [github] 行",
      (await page.getByText("github", { exact: true }).count()) >= 1,
    );
    check(
      "MCP server 列表 [remote] 行",
      (await page.getByText("remote", { exact: true }).count()) >= 1,
    );

    // 4. 类型切 http：URL 出现、Command 消失
    await page.getByRole("button", { name: "HTTP", exact: true }).click();
    await page.getByRole("textbox", { name: "URL" }).waitFor({ timeout: 5000 });
    check("http 显示 URL 输入", (await page.getByRole("textbox", { name: "URL" }).count()) === 1);
    check(
      "http 隐藏 Command 输入",
      (await page.getByRole("textbox", { name: "Command" }).count()) === 0,
    );

    // 5. 填表 + 添加 → 信任确认 Dialog → 取消关闭
    await page.getByRole("textbox", { name: "Name" }).fill("probe-srv");
    await page.getByRole("textbox", { name: "URL" }).fill("https://example.com/probe-mcp");
    await page.getByRole("button", { name: "Add server", exact: true }).click();
    await page.getByText("Add MCP server", { exact: true }).waitFor({ timeout: 5000 });
    check("添加信任确认 Dialog 出现", true);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page
      .getByText("Add MCP server", { exact: true })
      .waitFor({ state: "hidden", timeout: 5000 });
    check("取消后 Dialog 关闭", true);

    // 6. 回 Skill → Manage tab → 检查更新 → 徽标/一键更新/纳入管理
    await page.getByRole("button", { name: "Skills", exact: true }).click();
    await page.getByRole("button", { name: "Manage", exact: true }).click();
    await page
      .getByRole("button", { name: "Check for updates", exact: true })
      .waitFor({ timeout: 5000 });
    check("Manage tab 检查更新按钮存在", true);
    await page.getByRole("button", { name: "Check for updates", exact: true }).click();
    await page.getByText("Update available", { exact: true }).waitFor({ timeout: 5000 });
    check(
      "有更新徽标 (tdd)",
      (await page.getByText("Update available", { exact: true }).count()) >= 1,
    );
    check(
      "一键更新按钮 (tdd)",
      (await page.getByRole("button", { name: "Update", exact: true }).count()) >= 1,
    );
    check(
      "已是最新徽标 (cloudflare)",
      (await page.getByText("Up to date", { exact: true }).count()) >= 1,
    );
    check("本地徽标 (handwritten)", (await page.getByText("Local", { exact: true }).count()) >= 1);
    check(
      "纳入管理按钮 (handwritten)",
      (await page.getByRole("button", { name: "Bring under management", exact: true }).count()) >=
        1,
    );
    await mobile.close();

    // ── 桌面端（1280×900，左栏 PluginsPanel）──
    const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const dpage = await desktop.newPage();
    await setupMocks(dpage);
    await login(dpage);
    await dpage.goto(`${WEB_ORIGIN}/plugins`);
    await dpage.getByRole("button", { name: "Skills", exact: true }).waitFor({ timeout: 8000 });
    check(
      "桌面端一级 [Skills] 存在",
      (await dpage.getByRole("button", { name: "Skills", exact: true }).count()) === 1,
    );
    await dpage.getByRole("button", { name: "MCP", exact: true }).click();
    await dpage.getByRole("textbox", { name: "Name" }).waitFor({ timeout: 5000 });
    check(
      "桌面端切 MCP 表单渲染",
      (await dpage.getByRole("textbox", { name: "Name" }).count()) >= 1,
    );
    await desktop.close();
  } finally {
    await browser.close();
  }

  const passCount = results.filter(Boolean).length;
  const allPass = passCount === results.length;
  console.log(
    `\n总计: ${results.length} 断言, ${passCount} PASS, ${results.length - passCount} FAIL — ${allPass ? "ALL PASS" : "有 FAIL"}`,
  );
  process.exit(allPass ? 0 : 1);
})();
