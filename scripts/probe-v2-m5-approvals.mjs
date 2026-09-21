// M5-b 审批中心探针（v2 M5：02 .ap-row 入口① / 11 审批中心 sheet / tray 标题入口② 由
// e2e 会话页覆盖不到「仅实时流」分支，此处 mock REST + approvals-stream WS 验证 UI 链）。
//
//   Part 1 入口①：/projects → .ap-row「N 项待审批」→ 点击 → .msheet「审批中心」+ .cnt +
//     .acard×3。
//   Part 2 卡片：hot 红（git push）/ 普通 cmd / 断线置灰 .acard.off / pj chip。
//   Part 3 单卡应答：拒绝 → POST /api/approvals/respond（decision=deny）→ mock 广播注销 →
//     acard 3→2、cnt 同步（验证 respond → WS 全量快照 → UI 注销链）。
//   Part 4 全部允许：首点 →「确认允许 2 项？」→ 再点 → POST 共 3（1 deny + 2 allow）→ 空态。
//   Part 5 WS 推送：mock 服务端主动推帧 → 卡片重现（cnt 随帧同步）→ 推空 → 空态。
//
// 全 mock（proj1 不依赖真实项目）；密码自读不进 agent 上下文。bun scripts/probe-v2-m5-approvals.mjs

import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const ORIGIN = process.env.AR_WEB_ORIGIN ?? "http://127.0.0.1:43012";
const projectName = "proj1";

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

const APPROVALS = [
  {
    projectName,
    sessionId: "agent_probe-1",
    sessionName: "Probe Agent A",
    runtimeKey: `${projectName}:agent:claude:agent_probe-1`,
    controlRequestId: "req-a",
    toolName: "Bash",
    inputSummary: "Bash: curl https://api.example.com/deploy",
    createdAt: "2026-09-21T01:00:00.000Z",
    runtimeAlive: true,
  },
  {
    projectName,
    sessionId: "agent_probe-1",
    sessionName: "Probe Agent A",
    runtimeKey: `${projectName}:agent:claude:agent_probe-1`,
    controlRequestId: "req-b",
    toolName: "Bash",
    inputSummary: "Bash: git push --force origin main",
    createdAt: "2026-09-21T01:01:00.000Z",
    runtimeAlive: true,
  },
  {
    projectName,
    sessionId: "agent_probe-2",
    sessionName: "Probe Agent B",
    runtimeKey: `${projectName}:agent:claude:agent_probe-2`,
    controlRequestId: "req-c",
    toolName: "Write",
    inputSummary: "Write: /tmp/x.md",
    createdAt: "2026-09-21T01:02:00.000Z",
    runtimeAlive: false,
  },
];

const AGENTS = {
  "agent_probe-1": {
    id: "agent_probe-1",
    projectName,
    provider: "claude",
    displayName: "Probe Agent A",
    status: "running",
    createdAt: "2026-07-26T00:00:00.000Z",
  },
};

let respondCalls = [];
// 快照同源可变状态：REST 与 WS 推帧共用（模拟服务端 registry 真值，15s refetch 兜底拉取
// 与推送不冲突——真实服务端两路同源，mock 必须同构，否则 refetch 会"回滚"推帧）。
let currentApprovals = [];

async function setupMocks(page) {
  const json = (body) => ({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
  respondCalls = [];
  await page.route(/\/api\/overview$/, (r) =>
    r.fulfill(json({ projectNames: [projectName], candidates: [] })),
  );
  await page.route(new RegExp(`/api/projects/${projectName}/agent-sessions(?:\\?.*)?$`), (r) =>
    r.fulfill(json({ sessions: Object.values(AGENTS) })),
  );
  await page.route(/\/api\/state\/overview\/pinned-sessions$/, (r) =>
    r.fulfill(json({ sessions: [] })),
  );
  await page.route(/\/api\/state\/overview\/pinned-sessions\/[^/]+$/, (r) =>
    r.fulfill(json({ sessions: [] })),
  );
  // 审批快照 + 应答记录。
  await page.route(/\/api\/approvals$/, (r) => r.fulfill(json({ approvals: currentApprovals })));
  await page.route(/\/api\/approvals\/respond$/, (r) => {
    const raw = r.request().postData();
    if (raw) {
      try {
        const body = JSON.parse(raw);
        respondCalls.push(body);
        // 模拟服务端 respond 后注销 + 广播（快照端点与推送同源）。
        const remaining = currentApprovals.filter(
          (a) => a.controlRequestId !== body.controlRequestId,
        );
        broadcastApprovals(page, remaining);
      } catch {
        // ignore
      }
    }
    r.fulfill(json({ delivered: true }));
  });
  // approvals-stream：mock 服务端不 connect 真服务，暴露引用供测试主动推帧。
  page.__approvalSockets = [];
  await page.routeWebSocket(/\/api\/approvals\/stream/, (ws) => {
    page.__approvalSockets.push(ws);
  });
  // session 面板 WS（fake session → error，panel 容器仍渲染）——精确匹配避免吞 approvals-stream。
  await page.routeWebSocket(
    /\/api\/projects\/[^/]+\/agent-sessions\/[^/]+\/(claude-stream|acp-stream)$/,
    (ws) => ws.connectToServer(),
  );
}

/** mock 服务端广播：respond 注销后/测试推帧时，向所有 approvals-stream 订阅者推全量。 */
function broadcastApprovals(page, approvals) {
  currentApprovals = approvals;
  for (const ws of page.__approvalSockets) {
    ws.send(JSON.stringify({ type: "approvals", approvals }));
  }
}

async function login(page) {
  await page.goto(`${ORIGIN}/`);
  await page.waitForSelector('input[type="password"]', { timeout: 15000 });
  await page.getByLabel("访问密码").fill(await readAppPassword());
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForTimeout(1500);
}

// ── 验证主体 ─────────────────────────────────────────────────────────────────
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  locale: "zh-CN",
});
const page = await ctx.newPage();
await setupMocks(page);
currentApprovals = structuredClone(APPROVALS);
await login(page);

console.log("Part 1: 入口① .ap-row → 审批中心 sheet");
await page.goto(`${ORIGIN}/projects`);
await page.waitForSelector(".ap-row", { timeout: 10000 });
const apText = await page.locator(".ap-row .tx").textContent();
ok(apText?.includes("3 项待审批") === true, `ap-row 文案含「3 项待审批」（${apText?.trim()}）`);
await page.locator(".ap-row").click();
await page.waitForSelector(".msheet", { timeout: 5000 });
ok(
  (await page.locator(".msheet .shd h2").textContent())?.includes("审批中心") === true,
  "sheet 标题「审批中心」",
);
ok(
  (await page.locator(".msheet .cnt").textContent())?.includes("3 待审批") === true,
  ".cnt 计数「3 待审批」",
);
ok((await page.locator(".msheet .acard").count()) === 3, "acard = 3");
ok(await page.locator(".msheet .all").isVisible(), ".all「全部允许」可见");

console.log("Part 2: 卡片内容（hot / 普通 / 置灰 / pj chip）");
const hotCount = await page.locator(".msheet .acard .cmd.hot").count();
ok(hotCount === 2, `cmd.hot = 2（git push 卡 + Write 卡恒红，实际 ${hotCount}）`);
ok(
  (await page.locator(".msheet .acard .cmd.hot").first().textContent())?.includes("git push") ===
    true,
  "hot 卡含 git push",
);
ok((await page.locator(".msheet .acard.off").count()) === 1, "置灰卡 .acard.off = 1（断线冻结）");
ok((await page.locator(".msheet .acard .pj").count()) === 3, "pj 项目 chip = 3");

console.log("Part 3: 单卡应答（拒绝 req-a）");
await page.locator(".msheet .acard").first().locator(".btn.ghost").click();
await page.waitForTimeout(400);
ok(respondCalls.length === 1, "POST /api/approvals/respond ×1");
ok(respondCalls[0]?.decision === "deny", `decision=deny（${respondCalls[0]?.decision}）`);
ok(respondCalls[0]?.controlRequestId === "req-a", "controlRequestId=req-a");
// mock 广播注销 → WS 全量快照 → UI 3→2（REST refetch 同源，不回滚）。
const acardAfterDeny = await page.locator(".msheet .acard").count();
ok(acardAfterDeny === 2, `拒绝后广播 → acard = 2（实际 ${acardAfterDeny}）`);
ok(
  (await page.locator(".msheet .cnt").textContent())?.includes("2 待审批") === true,
  "cnt 同步「2 待审批」",
);

console.log("Part 4: 全部允许（二次确认）");
const allText1 = await page.locator(".msheet .all").textContent();
ok(allText1?.includes("全部允许") === true, `首点前文案「全部允许」（${allText1?.trim()}）`);
await page.locator(".msheet .all").click();
await page.waitForTimeout(200);
const allText2 = await page.locator(".msheet .all").textContent();
ok(allText2?.includes("确认允许 2 项") === true, `首点后文案切确认（${allText2?.trim()}）`);
await page.locator(".msheet .all").click();
await page.waitForTimeout(600);
ok(respondCalls.length === 3, `再点后 POST 共 3（1 deny + 2 allow，实际 ${respondCalls.length}）`);
ok(
  respondCalls.slice(1).every((c) => c.decision === "allow"),
  "全部允许 = 2 条 decision=allow（逐个转发）",
);
ok(
  new Set(respondCalls.slice(1).map((c) => c.controlRequestId)).size === 2,
  "allow 覆盖剩余 2 卡（req-b/req-c 各一次）",
);
// 全部应答完 → mock 广播空快照 → 空态。
await page.waitForTimeout(300);
ok((await page.locator(".msheet .acard").count()) === 0, "全部应答后 → acard = 0（空态）");

console.log("Part 5: WS 推送全量快照");
// login("/") 与 Part 1 goto("/projects") 两次整页导航各重建一次 WS，取最新连接（[0] 是死连接）。
const socket = page.__approvalSockets.at(-1);
ok(socket !== undefined, "approvals-stream WS 已订阅");
// 推 1 卡快照 → UI 替换。
const oneCard = [{ ...APPROVALS[0], controlRequestId: "req-next" }];
socket.send(JSON.stringify({ type: "approvals", approvals: oneCard }));
await page.waitForTimeout(400);
const acardAfterPush = await page.locator(".msheet .acard").count();
ok(acardAfterPush === 1, `WS 推 1 卡 → acard = 1（实际 ${acardAfterPush}）`);
ok(
  (await page.locator(".msheet .cnt").textContent())?.includes("1 待审批") === true,
  "cnt 随 WS 推帧重现「1 待审批」",
);
if (acardAfterPush !== 1) {
  const pageState = await page.evaluate(() => {
    const msheet = document.querySelector(".msheet");
    return {
      acards: document.querySelectorAll(".msheet .acard").length,
      apRow: !!document.querySelector(".ap-row"),
      sheetHtmlHead: msheet ? msheet.innerHTML.slice(0, 300) : null,
    };
  });
  console.error("  [诊断]", JSON.stringify(pageState));
}
// 推空快照 → 空态 + cnt 消失。
socket.send(JSON.stringify({ type: "approvals", approvals: [] }));
await page.waitForTimeout(400);
ok((await page.locator(".msheet .acard").count()) === 0, "WS 推空 → acard = 0");
ok(
  (await page.locator(".msheet .hfoot").textContent())?.includes("暂无待审批") === true,
  "空态文案「暂无待审批」",
);
ok((await page.locator(".msheet .cnt").count()) === 0, "cnt 随 0 待审批隐藏");

console.log(`\n结果: ${passCount} pass / ${failCount} fail`);
await browser.close();
if (failCount > 0) process.exit(1);
