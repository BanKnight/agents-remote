// Turn checkpoint 入口 + 回滚浮层探针（2026-11-14，T3 学习点③；
// 契约 docs/design/checkpoint-rollback.md §4）。
// 验证：用户消息 hover 动作条出现「查看本轮改动」（仅锚 uuid 命中的那条）→ 浮层显示该轮
// diff / 统计 / 双开关 → 强确认 → 回滚 POST body → 结果态；非 git 与无对话能力降级；
// 运行中 busy 闸。
// 真 git capture/restore 行为由 api 单测（checkpoint-service/turn-checkpointer）覆盖。
//
// mock 纪律（.claude/rules/verification.md）：REST /api/overview 与 /api/sessions/stream
// 必须**同源**——壳帧会整体覆盖 overview 缓存，不同源互相顶掉造成假 FAIL。
// 用法：bun scripts/probe-checkpoint.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";
import { mockAgentProviders } from "./lib/agent-provider-mock.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const PROJECT = "proj-checkpoint";
const SESSION_ID = "agent_ckpt";
const ANCHOR = "anchor-uuid-1";
const COMMIT = "c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1";

const DIFF = [
  "diff --git a/src/a.ts b/src/a.ts",
  "index 1111111..2222222 100644",
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@ -1,2 +1,3 @@",
  " line one",
  "-old line",
  "+new line",
  "+added line",
  "",
].join("\n");

const checkpoint = {
  ordinal: 1,
  commit: COMMIT,
  anchorUuid: ANCHOR,
  endUuid: "end-uuid-1",
  at: "2026-11-14T02:00:00.000Z",
  filesChanged: 1,
  insertions: 2,
  deletions: 1,
  status: "ready",
};

const results = [];
function check(name, cond, detail = "") {
  results.push(Boolean(cond));
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

const json = (body, status = 200) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify(body),
});

const sessionOf = ({
  status = "done",
  claudeSessionId = "claude-sess-1",
  id = SESSION_ID,
  displayName = "checkpoint 会话",
} = {}) => ({
  id,
  projectName: PROJECT,
  provider: "claude",
  displayName,
  status,
  createdAt: "2026-11-14T00:00:00Z",
  updatedAt: "2026-11-14T02:00:00Z",
  ...(claudeSessionId ? { claudeSessionId } : {}),
});
const candidateOf = (s) => ({
  type: "agent",
  projectName: PROJECT,
  sessionId: s.id,
  displayName: s.displayName,
  status: s.status,
  provider: "claude",
  createdAt: s.createdAt,
  updatedAt: s.updatedAt,
});

/**
 * 页面 mock。`opts` 控制降级分支：
 * - claudeSessionId：null = 无对话回滚能力
 * - repository：false = 非 git 项目
 * - status：会话状态（working → busy 闸）
 * - others：同项目其它会话（[{ id, status, displayName }]）——「其它 active 会话警示」
 */
async function setupPage(page, opts = {}) {
  const state = {
    claudeSessionId: opts.claudeSessionId === undefined ? "claude-sess-1" : opts.claudeSessionId,
    repository: opts.repository !== false,
    status: opts.status ?? "done",
    others: opts.others ?? [],
  };
  const rollbackBodies = [];

  await mockAgentProviders(page);
  await page.route(/\/api\/overview$/, (route) =>
    route.fulfill(
      json({
        projectNames: [PROJECT],
        // REST 与壳帧同源（verification.md mock 纪律）：同一份会话列表。
        candidates: [sessionOf(state), ...state.others.map((other) => sessionOf(other))].map(
          candidateOf,
        ),
      }),
    ),
  );
  await page.route(/\/api\/overview\/subtitles$/, (route) =>
    route.fulfill(json({ subtitles: {} })),
  );
  await page.route(new RegExp(`/api/projects/${PROJECT}/agent-sessions$`), (route) =>
    route.fulfill(json({ sessions: [sessionOf(state)] })),
  );
  await page.route(new RegExp(`/api/projects/${PROJECT}/terminal-sessions$`), (route) =>
    route.fulfill(json({ sessions: [] })),
  );
  await page.route(/\/api\/state\/overview\/pinned-sessions$/, (route) =>
    route.fulfill(json({ sessions: [] })),
  );
  await page.route(/\/api\/approvals$/, (route) => route.fulfill(json({ approvals: [] })));

  // checkpoint 三端点（LIFO：具体路径先注册，避免被 detail 正则吞掉——Playwright
  // route 栈后注册先匹配，所以 detail 必须最后注册）。
  await page.route(
    new RegExp(`/api/projects/${PROJECT}/agent-sessions/${SESSION_ID}/checkpoints$`),
    (route) =>
      route.fulfill(
        json(
          state.repository
            ? { repository: true, checkpoints: [checkpoint] }
            : { repository: false, projectName: PROJECT, reason: "not_git_repository" },
        ),
      ),
  );
  await page.route(
    new RegExp(`/api/projects/${PROJECT}/agent-sessions/${SESSION_ID}/checkpoints/1/diff$`),
    (route) =>
      route.fulfill(
        json({
          repository: true,
          ordinal: 1,
          files: [{ path: "src/a.ts", status: "modified", diff: DIFF }],
          truncated: false,
        }),
      ),
  );
  await page.route(
    new RegExp(`/api/projects/${PROJECT}/agent-sessions/${SESSION_ID}/checkpoints/1/rollback$`),
    (route) => {
      rollbackBodies.push(route.request().postDataJSON());
      const next = { ...state, status: "done" };
      return route.fulfill(
        json({
          session: sessionOf(next),
          backupRef: "refs/ar/checkpoints/x/0/restore-backup",
          warnings: [],
        }),
      );
    },
  );
  await page.route(new RegExp(`/api/projects/${PROJECT}/agent-sessions/${SESSION_ID}$`), (route) =>
    route.fulfill(json({ session: sessionOf(state), availableModels: [] })),
  );

  // 假 WebSocket：sessions-stream 推同源壳帧；claude-stream 喂两条用户消息（仅第一条锚命中）。
  await page.addInitScript(
    ({ anchor }) => {
      localStorage.setItem("lang", "zh");
      const sockets = [];
      class FakeWebSocket {
        static CONNECTING = 0;
        static OPEN = 1;
        static CLOSING = 2;
        static CLOSED = 3;
        constructor(url) {
          this.url = String(url);
          this.readyState = 1;
          this.__handlers = {};
          sockets.push(this);
        }
        send() {}
        close() {
          this.readyState = 3;
        }
        addEventListener(type, fn) {
          (this.__handlers[type] ??= []).push(fn);
        }
        removeEventListener() {}
        dispatchEvent() {
          return true;
        }
      }
      for (const prop of ["onopen", "onmessage", "onclose", "onerror"]) {
        Object.defineProperty(FakeWebSocket.prototype, prop, {
          get() {
            return this.__handlers[prop]?.[0] ?? null;
          },
          set(fn) {
            this.__handlers[prop] = fn ? [fn] : [];
          },
        });
      }
      window.WebSocket = FakeWebSocket;
      window.__emitSessionsFrame = (frame) => {
        const data = JSON.stringify(frame);
        for (const socket of sockets) {
          if (!socket.url.includes("/api/sessions/stream")) continue;
          for (const fn of socket.__handlers.onmessage ?? []) fn({ data });
        }
      };
      window.__anchorUuid = anchor;
    },
    { anchor: ANCHOR },
  );

  const userLine = (uuid, text) => ({
    type: "user",
    uuid,
    message: { role: "user", content: [{ type: "text", text }] },
  });
  await page.routeWebSocket(
    new RegExp(`/api/projects/${PROJECT}/agent-sessions/${SESSION_ID}/claude-stream`),
    (ws) => {
      const send = (msg) => ws.send(JSON.stringify(msg));
      ws.onMessage((data) => {
        try {
          if (JSON.parse(String(data)).type === "ping") send({ type: "pong" });
        } catch {
          /* ignore */
        }
      });
      send({ type: "session_init", resume: true, replay: "full" });
      send({ type: "system", subtype: "seed_init", model: "claude-sonnet-5-5" });
      send({
        type: "history_start",
        count: 2,
      });
      send(userLine(ANCHOR, "第一轮：让 agent 改一下 a.ts"));
      send({
        type: "assistant",
        message: { id: "msg-1", role: "assistant", content: [{ type: "text", text: "改好了。" }] },
      });
      send({ type: "history_end" });
      send({ type: "live_start", count: 0 });
      send({ type: "live_end" });
    },
  );

  return { rollbackBodies, state };
}

async function login(page) {
  await page.goto(`${WEB_ORIGIN}/`);
  await page.getByLabel("访问密码").fill(await readAppPassword());
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForTimeout(1200);
}

/** 壳帧与 REST 同源（登录后 WS 重连时服务端帧会覆盖 overview 缓存）。 */
const emitShells = (page, state) =>
  page.evaluate((frame) => window.__emitSessionsFrame(frame), {
    type: "sessions",
    sessions: [sessionOf(state), ...state.others.map(sessionOf)].map((session) => {
      const { type: _t, ...shell } = candidateOf(session);
      return shell;
    }),
  });

const ENTRY = "查看本轮改动";

async function openSession(page) {
  await page.goto(`${WEB_ORIGIN}/projects/${PROJECT}/agent-sessions/${SESSION_ID}/claude`);
  await page.getByText("第一轮：让 agent 改一下 a.ts").first().waitFor({ timeout: 10_000 });
  await page.waitForTimeout(600);
}

async function openDialog(page) {
  const entry = page.getByRole("button", { name: ENTRY });
  await entry.first().hover();
  await entry.first().click();
  await page.getByRole("dialog").waitFor({ state: "visible", timeout: 5000 });
  await page.waitForTimeout(300);
}

const browser = await chromium.launch();
try {
  // ── A/B/C：主链路（桌面） ────────────────────────────────────────────
  console.log("===== 桌面：入口 → 浮层 → 回滚 =====");
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "zh-CN",
  });
  const page = await context.newPage();
  const main = await setupPage(page);
  await login(page);
  await openSession(page);
  await emitShells(page, main.state);
  await page.waitForTimeout(400);

  check(
    "1 锚命中的用户消息有「查看本轮改动」入口",
    (await page.getByRole("button", { name: ENTRY }).count()) === 1,
    "",
  );
  check(
    "2 入口 aria-label 正确且带 title（hover 动作条可达）",
    (await page.getByRole("button", { name: ENTRY }).first().getAttribute("title")) === ENTRY,
    "",
  );

  await openDialog(page);
  const dialogText = await page.getByRole("dialog").innerText();
  check(
    "3 浮层标题 =「第 1 轮改动」",
    dialogText.includes("第 1 轮改动"),
    dialogText.split("\n")[0] ?? "",
  );
  check("4 统计行 = 1 个文件 +2 −1", dialogText.includes("1 个文件 · +2 −1"), "");
  check(
    "5 diff 渲染出文件名与新增行",
    dialogText.includes("src/a.ts") && dialogText.includes("added line"),
    "",
  );
  check("6 恢复文件开关默认勾选", dialogText.includes("恢复文件到此轮之前"), "");
  const checkboxStates = await page
    .getByRole("checkbox")
    .evaluateAll((els) => els.map((el) => ({ checked: el.checked, disabled: el.disabled })));
  check(
    "7 两个开关默认勾选、对话开关可用（claudeSessionId 存在）",
    checkboxStates.length === 2 && checkboxStates.every((c) => c.checked && !c.disabled),
    JSON.stringify(checkboxStates),
  );

  // 取消路径：确认框取消 → 不发请求、浮层仍在。取消必须限定在确认框内——浮层自身
  // 也有「取消」，DOM 序在确认框之前，`.first()` 会误点浮层取消把浮层关掉。
  await page.getByRole("button", { name: "执行回滚" }).click();
  const confirmDialog = page
    .getByRole("dialog")
    .filter({ has: page.getByRole("button", { name: "确认回滚" }) });
  await confirmDialog.getByRole("button", { name: "取消" }).click();
  await page.waitForTimeout(400);
  check(
    "8 取消确认不发回滚请求且浮层仍在",
    main.rollbackBodies.length === 0 && (await page.getByRole("dialog").isVisible()),
    "",
  );

  // 确认路径。
  await page.getByRole("button", { name: "执行回滚" }).click();
  await page.getByRole("button", { name: "确认回滚" }).first().click();
  await page.waitForTimeout(800);
  const body = main.rollbackBodies[0];
  check(
    "9 回滚 POST body = {restoreFiles:true,restoreConversation:true,expectedCommit}",
    main.rollbackBodies.length === 1 &&
      body.restoreFiles === true &&
      body.restoreConversation === true &&
      body.expectedCommit === COMMIT,
    JSON.stringify(body),
  );
  const doneText = await page.getByRole("dialog").innerText();
  check(
    "10 结果态「已回滚到第 1 轮之前」+ 自动备份提示",
    doneText.includes("已回滚到第 1 轮之前") && doneText.includes("恢复前已自动备份"),
    "",
  );
  await page.getByRole("button", { name: "关闭" }).first().click();
  await page.waitForTimeout(600);
  check("11 结果态「关闭」收起浮层", (await page.getByRole("dialog").count()) === 0, "");

  // ── D：降级分支 ─────────────────────────────────────────────────────
  console.log("\n===== 降级：无对话回滚能力 / 非 git 项目 =====");
  const noConvContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "zh-CN",
  });
  const noConvPage = await noConvContext.newPage();
  const noConv = await setupPage(noConvPage, { claudeSessionId: null });
  await login(noConvPage);
  await openSession(noConvPage);
  await emitShells(noConvPage, noConv.state);
  await noConvPage.waitForTimeout(400);
  await openDialog(noConvPage);
  const noConvChecks = await noConvPage
    .getByRole("checkbox")
    .evaluateAll((els) => els.map((el) => ({ checked: el.checked, disabled: el.disabled })));
  check(
    "12 无 claudeSessionId：对话开关 disabled 且未勾选",
    noConvChecks.length === 2 && noConvChecks[1].disabled && !noConvChecks[1].checked,
    JSON.stringify(noConvChecks),
  );
  await noConvPage.getByRole("button", { name: "执行回滚" }).click();
  await noConvPage.getByRole("button", { name: "确认回滚" }).first().click();
  await noConvPage.waitForTimeout(800);
  check(
    "13 无对话能力时 restoreConversation=false",
    noConv.rollbackBodies[0]?.restoreConversation === false,
    JSON.stringify(noConv.rollbackBodies[0]),
  );

  const noGitContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "zh-CN",
  });
  const noGitPage = await noGitContext.newPage();
  const noGit = await setupPage(noGitPage, { repository: false });
  await login(noGitPage);
  await openSession(noGitPage);
  await emitShells(noGitPage, noGit.state);
  await noGitPage.waitForTimeout(600);
  check(
    "14 非 git 项目：入口不出现（降级不可用）",
    (await noGitPage.getByRole("button", { name: ENTRY }).count()) === 0,
    "",
  );

  // ── E：运行中 busy 闸 ───────────────────────────────────────────────
  console.log("\n===== 运行中：busy 闸 =====");
  const busyContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "zh-CN",
  });
  const busyPage = await busyContext.newPage();
  const busy = await setupPage(busyPage, { status: "working" });
  await login(busyPage);
  await openSession(busyPage);
  await emitShells(busyPage, busy.state);
  await busyPage.waitForTimeout(400);
  await openDialog(busyPage);
  const busyText = await busyPage.getByRole("dialog").innerText();
  check("15 会话 working：浮层显示 busy 警示", busyText.includes("会话仍在运行"), "");
  check(
    "16 会话 working：回滚按钮 disabled",
    await busyPage.getByRole("button", { name: "执行回滚" }).isDisabled(),
    "",
  );

  // ── F：同项目其它 active 会话警示 ────────────────────────────────────
  console.log("\n===== 其它会话运行中：波及警示 =====");
  const otherContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "zh-CN",
  });
  const otherPage = await otherContext.newPage();
  const other = await setupPage(otherPage, {
    others: [{ id: "agent_other", status: "working", displayName: "另一个会话" }],
  });
  await login(otherPage);
  await openSession(otherPage);
  await emitShells(otherPage, other.state);
  await otherPage.waitForTimeout(400);
  await openDialog(otherPage);
  const otherText = await otherPage.getByRole("dialog").innerText();
  check(
    "17 同项目其它会话运行中：浮层显示波及警示",
    otherText.includes("同项目还有 1 个会话在运行"),
    "",
  );
} finally {
  await browser.close();
  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed}/${results.length} 通过`);
  if (failed > 0) process.exitCode = 1;
}
