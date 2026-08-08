// 探针：/plugins 全局插件页（Phase 2.3 + 反馈修复）——Skill/MCP 一级 SegmentedControl +
// Skill 二级弱文字 tab（② TabButton，非双层 segment）+ Manage tab 去有更新徽标冗余（③）+
// ListRow actions 不冒泡（⑤ 点纳入管理不导航）+ 移动端视图位置 atom 记忆（④ 看 skill 再返回不丢位置）+
// MCP 增删改（① Edit 回填）。DOM 结构断言（不靠 vision），覆盖单测渲染不到的真实组件接线。
// 密码自读，不进 agent 上下文、不打印值。web DOM 探针前置过 ar-verify-css 三道闸。
// 用法：bun scripts/probe-plugins-page.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";
import { verifyCssFlushed } from "./ar-verify-css.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const projectName = process.env.PROBE_PROJECT ?? "test";

async function setupMocks(page) {
  // /plugins 只需 overview 让登录后导航不炸；skill 列表/MCP 列表/更新检测/preview 全 mock（探针测 UI 接线）。
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
  // skill preview（MobileSkillFocus focus 主体用，④ navigate 往返需要不 crash）。
  await page.route(new RegExp("/api/skills/preview"), (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ content: "# tdd\n\nskill preview body" }),
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
    expectClasses: ["bg-primary/10", "text-primary", "bg-surface-inset"],
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
    const skillsBtn = page.getByRole("button", { name: "Skills", exact: true });
    check(
      "默认 Skill 子区激活 (aria-pressed)",
      (await skillsBtn.getAttribute("aria-pressed")) === "true",
    );

    // 2. Skill 二级 tab（Discover/Manage/Sources）
    check(
      "Skill 二级 [Discover] tab",
      (await page.getByRole("button", { name: "Discover", exact: true }).count()) === 1,
    );

    // 【②】二级弱文字 tab：active 用 text-primary className、无 aria-pressed（区别于一级 segment 的 aria-pressed）。
    const discoverBtn = page.getByRole("button", { name: "Discover", exact: true });
    const manageTabBtn = page.getByRole("button", { name: "Manage", exact: true });
    check(
      "② 二级 Discover(active) 无 aria-pressed（弱文字非 segment）",
      (await discoverBtn.getAttribute("aria-pressed")) === null,
    );
    check(
      "② 二级 Discover(active) className 含 text-primary",
      ((await discoverBtn.getAttribute("class")) ?? "").includes("text-primary"),
    );
    check(
      "② 二级 Manage(非 active) className 不含 text-primary",
      !((await manageTabBtn.getAttribute("class")) ?? "").includes("text-primary"),
    );
    check(
      "② 一级 Skills 有 aria-pressed=true（强 segment 对照）",
      (await skillsBtn.getAttribute("aria-pressed")) === "true",
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

    // 【①】MCP 改：server 行有 Edit 按钮 → 点击回填表单（name 只读、command 回填）+ Save/Cancel（无 Add）。
    check(
      "① MCP [github] 行有 [Edit] 按钮",
      (await page.getByRole("button", { name: "Edit", exact: true }).count()) >= 1,
    );
    await page.getByRole("button", { name: "Edit", exact: true }).first().click();
    const nameInput = page.getByRole("textbox", { name: "Name" });
    const commandInput = page.getByRole("textbox", { name: "Command" });
    check(
      "① 编辑态 Name 回填=github 且 readOnly",
      (await nameInput.inputValue()) === "github" &&
        (await nameInput.getAttribute("readonly")) !== null,
    );
    check("① 编辑态 Command 回填=npx", (await commandInput.inputValue()) === "npx");
    check(
      "① 编辑态显示 [Save] 按钮（非 Add）",
      (await page.getByRole("button", { name: "Save", exact: true }).count()) >= 1 &&
        (await page.getByRole("button", { name: "Add server", exact: true }).count()) === 0,
    );
    check(
      "① 编辑态显示 [Cancel] 按钮（退出编辑）",
      (await page.getByRole("button", { name: "Cancel", exact: true }).count()) >= 1,
    );
    // 退出编辑态，恢复 Add 模式供后续 http 类型 + Add 流程测试。
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    check("① Cancel 后 Name 清空（回 Add 模式）", (await nameInput.inputValue()) === "");

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
    await page.getByRole("button", { name: "Update", exact: true }).waitFor({ timeout: 5000 });
    // 【③】去冗余：有更新行不再显「有更新」徽标——右侧「更新」按钮本身即信号。仅「已最新」「本地」显徽标。
    check(
      "③ 有更新行无 [Update available] 徽标（去冗余）",
      (await page.getByText("Update available", { exact: true }).count()) === 0,
    );
    check(
      "③ 有更新行保留 [Update] 按钮（信号由按钮承担）",
      (await page.getByRole("button", { name: "Update", exact: true }).count()) >= 1,
    );
    check(
      "已是最新徽标 (cloudflare)",
      (await page.getByText("Up to date", { exact: true }).count()) >= 1,
    );
    check("本地徽标 (handwritten)", (await page.getByText("Local", { exact: true }).count()) >= 1);
    const bringBtn = page.getByRole("button", { name: "Bring under management", exact: true });
    check("纳入管理按钮 (handwritten)", (await bringBtn.count()) >= 1);

    // 【⑤】ListRow actions 不冒泡：点「纳入管理」只切 Sources tab，不应冒泡触发行 onClick → navigate skill focus。
    const urlBeforeAction = page.url();
    await bringBtn.first().click();
    // 点后切到 Sources tab（onGoToSources 生效），URL 不含 /plugins/skill（未冒泡 navigate）。
    await page.getByRole("button", { name: "Sources", exact: true }).waitFor({ timeout: 5000 });
    const urlAfterAction = page.url();
    check(
      "⑤ 点纳入管理 URL 不变（未冒泡 navigate skill）",
      urlAfterAction === urlBeforeAction && !urlAfterAction.includes("/plugins/skill"),
    );
    check(
      "⑤ 点纳入管理后切到 Sources tab（Sources active）",
      (
        (await page.getByRole("button", { name: "Sources", exact: true }).getAttribute("class")) ??
        ""
      ).includes("text-primary"),
    );

    // 【④】移动端视图位置 atom 记忆：切回 Manage → 点 tdd 行开 skill focus（PluginsPanel unmount）→ 返回 → 仍 Manage（非默认 Discover）。
    await page.getByRole("button", { name: "Manage", exact: true }).click();
    await page
      .getByRole("button", { name: "Check for updates", exact: true })
      .waitFor({ timeout: 5000 });
    // 点 tdd 行（title 文本，避开 actions 按钮区）→ onOpenSkill → navigate /plugins/skill/tdd。
    await page.getByText("tdd", { exact: true }).first().click();
    await page.waitForURL(/\/plugins\/skill\//, { timeout: 8000 });
    check("④ 点 skill 行 navigate 到 skill focus", page.url().includes("/plugins/skill/tdd"));
    // 浏览器历史返回（MobilePluginsOverview 重 mount，atom 应读回 skillTab=manage）。
    await page.goBack();
    await page.waitForURL(/\/plugins$/, { timeout: 8000 });
    // Manage tab 独有「检查更新」按钮；若 atom 丢失回默认 Discover，则显示搜索框而非此按钮。
    await page
      .getByRole("button", { name: "Check for updates", exact: true })
      .waitFor({ timeout: 8000 });
    check(
      "④ 返回后仍停 Manage tab（atom 记忆，未回默认 Discover）",
      (await page.getByRole("button", { name: "Check for updates", exact: true }).count()) === 1,
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
