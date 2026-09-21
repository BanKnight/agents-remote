// M9 批次 c 探针：桌面快捷键（spec §10.2）+ 05f 审批 Popover。
//
// 覆盖单测验不到的真实浏览器行为（DOM 几何硬数据，禁截图）：
//   Part 1（1600×1000 桌面，Control 系 = hook 兼容 ⌘/Ctrl）：
//     - ⌘N：左栏创建菜单程序化打开（ActionMenu 半受控）→ Esc 关（Radix 内建）。
//     - ⌘\：分屏（与按钮同链路 dropIntoLeaf right）→ 双窗格。
//     - ⌘2 / ⌘1：切窗格（collectLeaves 顺序 + onSelectTab 跟随 active tab 导航）。
//     - ⌘R：会话 WS error 态下触发重连（reconnectKey bump → claude-stream WS 重试）。
//     - 05f Popover：sbar 待审批 chip 点击 → .apop（ahd 计数 + 全部允许两段确认 +
//       acard 桌面紧凑单行 + respond POST 逐卡命中）。
//   Part 2（820×1180 中档移动形态）：⌘N 不绑（菜单不出）+ 无 sbar（桌面专属件）。
//
// mock 数据不污染真环境；overview candidate 形状对齐 shared OverviewCandidate（sessionId/type），
// 项目内 session 形状（id）分开构造（批次 b 教训）。用法：bun scripts/probe-v2-m9-c-shortcuts-approval.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";

// overview candidate 形状（shared OverviewCandidate）。
const AGENT_A_OV = {
  type: "agent",
  sessionId: "agent_m9c-1",
  projectName: "proj1",
  provider: "claude",
  displayName: "Probe Agent A",
  status: "running",
  createdAt: "2026-07-26T00:00:00.000Z",
  updatedAt: "2026-07-26T00:00:00.000Z",
};
const TERM_T_OV = {
  type: "terminal",
  sessionId: "term_m9c-1",
  projectName: "proj1",
  displayName: "probe-term",
  status: "running",
  createdAt: "2026-07-26T02:00:00.000Z",
  updatedAt: "2026-07-26T02:00:00.000Z",
};
// 项目内 AgentSession/TerminalSession 形状（id 字段）。
const AGENT_A_S = { ...AGENT_A_OV, id: "agent_m9c-1" };
const TERM_T_S = { ...TERM_T_OV, id: "term_m9c-1" };
// ApprovalSummary 形状（shared）。
const APPROVALS = [
  {
    projectName: "proj1",
    sessionId: "agent_m9c-1",
    sessionName: "claude·auth",
    runtimeKey: "proj1/agent_m9c-1",
    controlRequestId: "req_1",
    toolName: "Bash",
    inputSummary: "bash · curl https://api.example",
    createdAt: "2026-07-26T03:00:00.000Z",
    runtimeAlive: true,
  },
  {
    projectName: "proj1",
    sessionId: "agent_m9c-1",
    sessionName: "支付联调脚本",
    runtimeKey: "proj1/agent_m9c-1",
    controlRequestId: "req_2",
    toolName: "Bash",
    inputSummary: "git push --force origin main",
    createdAt: "2026-07-26T03:01:00.000Z",
    runtimeAlive: true,
  },
];

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

async function setupMocks(page, state) {
  await page.route(/\/api\/overview$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        projectNames: ["proj1"],
        // 分屏创建的终端也是运行中实例——真实 overview 聚合必含它（prune activeIds
        // 依赖 overview 追上，缺它则切走焦点后 term tab 被误判 stale）。
        candidates: state.terminalsCreated > 0 ? [AGENT_A_OV, TERM_T_OV] : [AGENT_A_OV],
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
      body: JSON.stringify({ approvals: APPROVALS }),
    }),
  );
  // respond：记数并从快照移除（服务端广播语义——简化为立即移除）。
  await page.route(/\/api\/approvals\/respond$/, (r) => {
    state.respondCalls++;
    const body = r.request().postDataJSON();
    state.responded.add(body.controlRequestId);
    return r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });
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
  await page.route(new RegExp(`/api/projects/proj1/terminal-sessions(?:\\?.*)?$`), (r) => {
    if (r.request().method() === "POST") {
      state.terminalsCreated++;
      return r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ session: TERM_T_S }),
      });
    }
    return r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sessions: state.terminalsCreated > 0 ? [TERM_T_S] : [] }),
    });
  });
  await page.route(/\/api\/projects\/proj1\/agent-history\?.*$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ entries: [] }),
    }),
  );
  // approvals WS：mock 帧推送快照（EventTarget on* IDL 见 memory——用 HTTP 轮询兜底即可，
  // 这里直接拒掉 WS（探针内 approvals 靠 REST 初值 + refetchInterval），respond 后快照由
  // route 闭包重算即可满足断言。
  await page.route(/\/api\/approvals\/stream$/, (r) => r.abort());
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
    console.log("Part 1: 1600×1000 桌面 → ⌘N/⌘\\/⌘1..9/⌘R + 05f 审批 Popover");
    const ctx = await browser.newContext({
      viewport: { width: 1600, height: 1000 },
      locale: "zh-CN",
    });
    const page = await ctx.newPage();
    const state = { terminalsCreated: 0, respondCalls: 0, responded: new Set() };
    await setupMocks(page, state);
    await login(page);
    await page.goto(`${WEB_ORIGIN}/projects/proj1`);
    await page.waitForTimeout(1500);

    // 开第一个窗格（新 context 无持久化 layout）。
    await page.locator("main > div > aside").nth(1).getByText("Probe Agent A").click();
    await page.waitForFunction(() => document.querySelectorAll("[data-drop-group]").length === 1, {
      timeout: 8000,
    });

    // ── ⌘N 创建菜单 ──
    await page.keyboard.press("Control+n");
    await page.waitForTimeout(300);
    ok((await page.getByRole("menu").count()) >= 1, "⌘N 打开左栏创建菜单（ActionMenu 半受控）");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    ok((await page.getByRole("menu").count()) === 0, "Esc 关闭创建菜单（Radix 内建）");

    // ── ⌘\ 分屏 ──
    await page.keyboard.press("Control+\\");
    await page.waitForFunction(() => document.querySelectorAll("[data-drop-group]").length === 2, {
      timeout: 8000,
    });
    ok(state.terminalsCreated === 1, "⌘\\ 分屏 = POST 新终端（与按钮同链路）");
    ok(
      (await page.evaluate(() => document.querySelectorAll("[data-drop-group]").length)) === 2,
      "⌘\\ 后双窗格",
    );

    // ── ⌘2 / ⌘1 切窗格 ──
    await page.waitForTimeout(600);
    await page.keyboard.press("Control+1");
    await page.waitForTimeout(600);
    ok(page.url().includes("/session/agent_m9c-1"), `⌘1 聚焦第一窗格（实际 ${page.url()}）`);
    await page.keyboard.press("Control+2");
    await page.waitForTimeout(600);
    ok(page.url().includes("/session/term_m9c-1"), `⌘2 聚焦第二窗格（实际 ${page.url()}）`);

    // ── 05f 审批 Popover ──
    await page.locator("main > .sbar").getByText("2 项待审批").click();
    await page.waitForSelector(".apop", { timeout: 5000 });
    await page.waitForTimeout(400); // zoom-in 动画结束后测量（scale 中段 rect 偏小）
    const apopGeo = await page.evaluate(() => {
      const el = document.querySelector(".apop");
      const r = el?.getBoundingClientRect();
      return r ? { w: r.width, cards: el.querySelectorAll(".acard").length } : null;
    });
    ok(apopGeo !== null, "sbar chip 点击 → .apop 打开");
    ok(apopGeo && Math.abs(apopGeo.w - 378) <= 2, `.apop 宽 378px（实际 ${apopGeo?.w}）`);
    ok(apopGeo?.cards === 2, "acard 两卡（桌面紧凑单行）");
    const hotCmd = await page.evaluate(
      () => document.querySelector(".apop .acard .cmd.hot") !== null,
    );
    ok(hotCmd, "危险命令 .hot 高亮（git push）");
    // 全部允许两段确认 → 逐卡 POST。
    await page.locator(".apop .ahd .all").click();
    const confirmTxt = await page.locator(".apop .ahd .all").textContent();
    ok(
      confirmTxt.includes("确认允许 2 项"),
      `全部允许两段确认（实际 ${JSON.stringify(confirmTxt)}）`,
    );
    await page.locator(".apop .ahd .all").click();
    await page.waitForTimeout(600);
    ok(state.respondCalls === 2, `全部允许 = 逐卡 POST ×2（实际 ${state.respondCalls}）`);

    // ── ⌘R 重连（error 态）──
    // claude-stream WS mock 404 → SessionDetail error 态（Notice + 重连按钮）。
    let wsAttempts = 0;
    page.on("websocket", () => {
      wsAttempts++;
    });
    await page.waitForTimeout(800);
    const wsBefore = wsAttempts;
    await page.keyboard.press("Control+r");
    await page.waitForTimeout(1200);
    ok(wsAttempts > wsBefore, `⌘R 在 error 态触发重连（WS 尝试 ${wsBefore} → ${wsAttempts}）`);
    await ctx.close();

    console.log("Part 2: 820×1180 中档移动形态 → 快捷键不绑 + 无 sbar");
    const mobile = await browser.newContext({
      viewport: { width: 820, height: 1180 },
      locale: "zh-CN",
    });
    const mp = await mobile.newPage();
    await setupMocks(mp, { terminalsCreated: 0, respondCalls: 0, responded: new Set() });
    await login(mp);
    await mp.goto(`${WEB_ORIGIN}/projects/proj1`);
    await mp.waitForTimeout(1200);
    await mp.keyboard.press("Control+n");
    await mp.waitForTimeout(400);
    ok((await mp.getByRole("menu").count()) === 0, "移动形态 ⌘N 不绑（无创建菜单）");
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
