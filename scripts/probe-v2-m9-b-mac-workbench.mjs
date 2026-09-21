// M9 批次 b 探针：Mac 工作台四件（redesign-v2 §6.10-3/4/6/7）。
//
// 覆盖单测验不到的真实浏览器行为（DOM 几何硬数据，禁截图）：
//   Part 1（1600×1000 桌面）：
//     - 状态栏 sbar（§6.10-4）：28px 横贯底部 + 「已连接 · N 实例运行中」+「N 项待审批 ›」。
//     - 左栏 seg4 作用域（§6.10-7）：「项目/全部」两段，全部 = 跨项目实例平铺。
//     - Inspector 四段（§6.10-6）：右栏 tab = 文件/Git/Wiki/历史（05 原型 seg4 顺序）。
//     - 分屏按钮（§6.10-3）：GroupHeader icon → 新建终端 ref → dropIntoLeaf right 双窗格
//       + URL 聚焦新终端；SplitGutter 中点 .grip 手柄视觉。
//   Part 2（820×1180 中档移动形态）：无 sbar（桌面专属件，移动端 StatusBar return null）。
//
// mock 数据（不污染真环境、无真会话）；密码自读，不进 agent 上下文、不打印值。
// 用法：bun scripts/probe-v2-m9-b-mac-workbench.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";

// overview candidate 形状（shared OverviewCandidate：sessionId/type 字段）与项目内
// AgentSession/TerminalSession 形状（id 字段）不同，分开构造防止互相污染。
const AGENT_A_OV = {
  type: "agent",
  sessionId: "agent_m9b-1",
  projectName: "proj1",
  provider: "claude",
  displayName: "Probe Agent A",
  status: "running",
  createdAt: "2026-07-26T00:00:00.000Z",
  updatedAt: "2026-07-26T00:00:00.000Z",
};
const AGENT_B_OV = {
  type: "agent",
  sessionId: "agent_m9b-2",
  projectName: "proj2",
  provider: "codex",
  displayName: "Probe Agent B",
  status: "running",
  createdAt: "2026-07-26T01:00:00.000Z",
  updatedAt: "2026-07-26T01:00:00.000Z",
};
const TERM_T_OV = {
  type: "terminal",
  sessionId: "term_m9b-1",
  projectName: "proj1",
  displayName: "probe-term",
  status: "running",
  createdAt: "2026-07-26T02:00:00.000Z",
  updatedAt: "2026-07-26T02:00:00.000Z",
};
const AGENT_A_S = { ...AGENT_A_OV, id: "agent_m9b-1" };
const TERM_T_S = { ...TERM_T_OV, id: "term_m9b-1" };

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
        projectNames: ["proj1", "proj2"],
        candidates: [AGENT_A_OV, AGENT_B_OV],
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
      body: JSON.stringify({ approvals: [{ id: "a1" }, { id: "a2" }] }),
    }),
  );
  await page.route(new RegExp(`/api/projects/proj1/agent-sessions(?:\\?.*)?$`), (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sessions: [AGENT_A_S] }),
    }),
  );
  await page.route(new RegExp(`/api/projects/proj1/agent-sessions/${AGENT_A_S.id}$`), (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        session: AGENT_A_S,
        availableModels: ["sonnet"],
        availablePermissionModes: ["default"],
      }),
    }),
  );
  // GET 列表 / POST 创建（分屏按钮）同 URL，按 method 分流；POST 后 GET 忠实含新终端
  //（真实后端行为——prune refs 依赖此追上，不然新终端 tab 靠 focusId 保护才存活）。
  const createdTerminals = [];
  await page.route(new RegExp(`/api/projects/proj1/terminal-sessions(?:\\?.*)?$`), (r) => {
    if (r.request().method() === "POST") {
      createdTerminals.push(TERM_T_S);
      return r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ session: TERM_T_S }),
      });
    }
    return r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sessions: [...createdTerminals] }),
    });
  });
  await page.route(/\/api\/projects\/proj1\/agent-history\?.*$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ entries: [] }),
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

(async () => {
  const browser = await chromium.launch();
  try {
    console.log("Part 1: 1600×1000 桌面 → sbar / seg4 作用域 / Inspector 四段 / 分屏按钮");
    const ctx = await browser.newContext({
      viewport: { width: 1600, height: 1000 },
      locale: "zh-CN",
    });
    const page = await ctx.newPage();
    await setupMocks(page);
    await login(page);
    await page.goto(`${WEB_ORIGIN}/projects/proj1`);
    await page.waitForTimeout(1500);

    // ── sbar ──
    const sbar = await page.evaluate(() => {
      const el = document.querySelector("main > .sbar");
      if (!el) return null;
      return { h: el.getBoundingClientRect().height, text: el.textContent };
    });
    ok(sbar !== null, "sbar 在（main 直属底部状态栏）");
    if (sbar) {
      ok(Math.abs(sbar.h - 28) <= 1, `sbar 高 28px（实际 ${sbar.h}）`);
      ok(
        sbar.text.includes("已连接") && sbar.text.includes("2 实例运行中"),
        `连接态 + 运行实例数（实际 ${JSON.stringify(sbar.text)}）`,
      );
      ok(
        sbar.text.includes("2 项待审批"),
        `待审批计数在（warning chip，实际 ${JSON.stringify(sbar.text)}）`,
      );
    }

    // ── seg4 作用域 ──
    const seg = page.getByRole("tablist");
    const segTabs = seg.getByRole("tab");
    ok((await segTabs.count()) === 2, "seg4 两段（项目/全部）");
    ok((await segTabs.first().getAttribute("aria-selected")) === "true", "默认「项目」作用域选中");
    // 全部 = 跨项目平铺：proj2 的实例卡片也出现。
    await segTabs.nth(1).click();
    await page.waitForTimeout(400);
    const allCards = await page.evaluate(() => {
      const cards = [...document.querySelectorAll("main aside [data-drop-empty], main aside")];
      void cards;
      // 左栏卡片标题：InstanceCard title 行文本。
      const aside = document.querySelectorAll("main > div > aside")[1];
      return aside ? aside.textContent : "";
    });
    ok(
      allCards.includes("Probe Agent B"),
      "「全部」含其他项目实例（proj2 Probe Agent B 平铺进来）",
    );
    await segTabs.first().click();
    await page.waitForTimeout(400);
    const projCards = await page.evaluate(() => {
      const aside = document.querySelectorAll("main > div > aside")[1];
      return aside ? aside.textContent : "";
    });
    ok(
      projCards.includes("Probe Agent A") && !projCards.includes("Probe Agent B"),
      "「项目」只含本项目实例",
    );

    // ── Inspector 四段 ──
    await page.getByRole("button", { name: "展开右栏" }).click();
    await page.waitForFunction(() => document.querySelectorAll("main > div > aside").length === 3, {
      timeout: 5000,
    });
    const rightTabs = await page.evaluate(() => {
      const aside = document.querySelectorAll("main > div > aside")[2];
      if (!aside) return null;
      // TabButton 特征类（rounded-lg px-2.5 py-1 text-xs），排除 FilesPanel 等内容区按钮。
      return [...aside.querySelectorAll("button.rounded-lg.px-2\\.5")].map((b) =>
        b.textContent.trim(),
      );
    });
    ok(
      rightTabs !== null && rightTabs.join(",") === "文件,Git,Wiki,历史",
      `Inspector 四段 = 文件/Git/Wiki/历史（实际 ${JSON.stringify(rightTabs)}）`,
    );
    await page
      .locator("main > div > aside")
      .nth(2)
      .getByRole("button", { name: "历史", exact: true })
      .click();
    await page.waitForTimeout(400);
    const historyActive = await page.evaluate(() => {
      const aside = document.querySelectorAll("main > div > aside")[2];
      const btn = aside
        ? [...aside.querySelectorAll("button.rounded-lg.px-2\\.5")].find(
            (b) => b.textContent.trim() === "历史",
          )
        : null;
      return btn ? btn.className.includes("bg-primary/10") : false;
    });
    ok(historyActive, "历史段可激活（bg-primary/10 active 态）");

    // ── 分屏按钮 ──
    const leafCount = () =>
      page.evaluate(() => document.querySelectorAll("[data-drop-group]").length);
    // 新 context 无持久化 layout（root=null → EmptyInstanceArea 无 GroupHeader）：
    // 先点左栏实例卡片开第一个窗格，再测分屏。
    await page.locator("main > div > aside").nth(1).getByText("Probe Agent A").click();
    await page.waitForFunction(() => document.querySelectorAll("[data-drop-group]").length === 1, {
      timeout: 5000,
    });
    ok(true, "聚焦实例 → 单窗格（focus effect ensureTab）");
    ok((await leafCount()) === 1, "分屏前单窗格");
    await page.getByRole("button", { name: "分屏并新建终端" }).click();
    await page.waitForFunction(() => document.querySelectorAll("[data-drop-group]").length === 2, {
      timeout: 5000,
    });
    ok(true, "分屏后双窗格（dropIntoLeaf right）");
    await page.waitForTimeout(600);
    ok(page.url().includes(`/session/${TERM_T_S.id}`), `URL 聚焦新终端（实际 ${page.url()}）`);
    // 两窗格几何：左右并排（horizontal split），各占约一半宽。
    const splitGeo = await page.evaluate(() => {
      const groups = [...document.querySelectorAll("[data-drop-group]")];
      const rects = groups.map((g) => g.getBoundingClientRect());
      return { sideBySide: rects[0].x < rects[1].x, count: rects.length };
    });
    ok(splitGeo.sideBySide, "分屏为左右并排（horizontal）");
    ok(
      (await page.evaluate(() => document.querySelectorAll(".grip").length)) >= 1,
      "gutter grip 手柄在",
    );
    await ctx.close();

    console.log("Part 2: 820×1180 中档移动形态 → 无 sbar");
    const mobile = await browser.newContext({
      viewport: { width: 820, height: 1180 },
      locale: "zh-CN",
    });
    const mp = await mobile.newPage();
    await setupMocks(mp);
    await login(mp);
    await mp.goto(`${WEB_ORIGIN}/projects`);
    await mp.waitForTimeout(1200);
    ok(
      (await mp.evaluate(() => document.querySelector("main > .sbar"))) === null,
      "移动形态无 sbar（桌面专属件）",
    );
    await mobile.close();

    await browser.close();
    console.log(`\n${passCount} pass, ${failCount} fail`);
    if (failCount > 0) process.exit(1);
  } finally {
    await browser.close();
  }
})();
