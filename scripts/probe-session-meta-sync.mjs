// 一次性探针：会话元信息全端同步（用户 2026-11-05 反馈「状态和标题在很多地方都有出现」）。
// 验证 use-session-shells 的写扩散：壳帧（WS）一到，overview（唯一权威）与项目列表/详情
// 缓存副本同步更新——桌面左栏项目段（列表源）与 TabChip（detail 源）同一会话同值。
// 同时验证历史浮层活跃行改用 overview 真实状态（不再用 hasActiveSession 伪造成 working）。
// fixture 走 page.route（/api/overview + 项目 agent 列表/详情 + agent-history），WS 用
// addInitScript 可推送假 socket（page.route 拦不了 WebSocket）。
// 断言：
//  1. 初始：左栏「旧名」行状态点 = idle 实心灰（2026-11-11 二轮拍板统一实心，原空心）
//  2. 历史行：活跃但 idle 的会话显示 idle 灰点（旧实现会画 working 绿点）
//  3. 打开会话 tab（detail 从 fixture 拉到旧名）后再推壳帧（改名 + working + 新时间）：
//     「旧名」消失、「新名」同时出现在左栏行与 TabChip；左栏行状态点变 working 绿
// 密码自读不打印。用法：bun scripts/probe-session-meta-sync.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const PROJECT = "proj-x";
const SESSION_ID = "agent_1";
const OTHER_ID = "agent_2";

const results = [];
function check(name, cond, detail = "") {
  results.push(Boolean(cond));
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

const session = (id, displayName, status) => ({
  type: "agent",
  projectName: PROJECT,
  sessionId: id,
  displayName,
  status,
  provider: "claude",
  createdAt: "2026-11-01T00:00:00Z",
  updatedAt: "2026-11-05T10:00:00Z",
});
const INITIAL = [session(SESSION_ID, "旧名", "idle"), session(OTHER_ID, "会话二", "idle")];

const json = (body) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(body),
});

const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "zh-CN",
  });
  const page = await context.newPage();

  // 可变 fixture：场景 B（WS 断线自愈 = 10s 轮询）改这里的值再由 overview 拉走。
  let overviewCandidates = INITIAL;
  await page.route("**/api/overview", (route) =>
    route.fulfill(json({ projectNames: [PROJECT], candidates: overviewCandidates })),
  );
  await page.route("**/api/overview/subtitles", (route) => route.fulfill(json({ subtitles: {} })));
  await page.route(`**/api/projects/${PROJECT}/agent-sessions`, (route) =>
    route.fulfill(
      json({
        sessions: INITIAL.map((c) => ({
          id: c.sessionId,
          projectName: PROJECT,
          provider: c.provider,
          displayName: c.displayName,
          status: c.status,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        })),
      }),
    ),
  );
  await page.route(`**/api/projects/${PROJECT}/terminal-sessions`, (route) =>
    route.fulfill(json({ sessions: [] })),
  );
  await page.route(`**/api/projects/${PROJECT}/agent-sessions/${SESSION_ID}`, (route) =>
    route.fulfill(
      json({
        session: {
          id: SESSION_ID,
          projectName: PROJECT,
          provider: "claude",
          displayName: "旧名",
          status: "idle",
          createdAt: "2026-11-01T00:00:00Z",
          updatedAt: "2026-11-05T10:00:00Z",
        },
        availableModels: [],
      }),
    ),
  );
  await page.route(`**/api/projects/${PROJECT}/agent-history*`, (route) =>
    route.fulfill(
      json({
        entries: [
          {
            projectName: PROJECT,
            title: "历史会话",
            firstMessage: "历史会话",
            provider: "claude",
            claudeSessionId: "claude-1",
            startedAt: "2026-11-01T00:00:00Z",
            lastActivityAt: "2026-11-05T10:00:00Z",
            fileSize: 100,
            hasActiveSession: true,
            activeSessionId: OTHER_ID,
          },
        ],
        counts: { all: 1, active: 1, ended: 0 },
        groups: [{ key: "recent", entries: ["历史会话"] }],
      }),
    ),
  );
  await page.route("**/api/state/overview/pinned-sessions", (route) =>
    route.fulfill(json({ pinned: [] })),
  );

  await page.addInitScript(() => {
    localStorage.setItem("lang", "zh");
    // 可推送假 WS：page.route 拦不了 WebSocket；保留 socket 实例与 on* 处理器，
    // 暴露 window.__emitSessionsFrame 主动推壳帧（真实 session-stream 帧形状）。
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
  });

  await page.goto(`${WEB_ORIGIN}/`);
  await page.getByLabel("访问密码").fill(await readAppPassword());
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForTimeout(1200);

  await page.goto(`${WEB_ORIGIN}/projects/${PROJECT}`);
  await page.getByText("旧名").first().waitFor({ state: "visible", timeout: 10_000 });
  await page.waitForTimeout(600);

  const bodyText = () => page.evaluate(() => document.body.innerText);
  /** 文本所在行（向上 ≤6 层）的状态点 class + computed 背景（bg ≠ transparent =
   * 「实心」的 computed 证明——className 断言对 CSS 落盘盲，frontend-notes §10）。 */
  const dotFor = (text) =>
    page.evaluate((target) => {
      const leaf = [...document.querySelectorAll("*")].find(
        (el) => el.children.length === 0 && (el.textContent ?? "").trim() === target,
      );
      let node = leaf;
      for (let i = 0; node && i < 6; i += 1) {
        const dot = node.querySelector?.(".dot2");
        if (dot) return { cls: dot.className, bg: getComputedStyle(dot).backgroundColor };
        node = node.parentElement;
      }
      return null;
    }, text);

  const initialDot = await dotFor("旧名");
  check(
    "1a 初始：左栏「旧名」行状态点 = idle 实心灰（bg-ink-2 落盘非透明，无 bg-success）",
    initialDot &&
      initialDot.cls.includes("bg-ink-2") &&
      !initialDot.cls.includes("bg-success") &&
      initialDot.bg !== "rgba(0, 0, 0, 0)",
    `${initialDot?.cls} bg=${initialDot?.bg}`,
  );

  // 历史浮层：活跃但 idle 的会话必须画 idle 灰点（旧实现 hasActiveSession → working 绿点）。
  await page.getByRole("button", { name: "查看历史会话" }).click();
  await page.getByText("历史会话").first().waitFor({ state: "visible", timeout: 5000 });
  const historyDot = await dotFor("历史会话");
  check(
    "2a 历史行：活跃但 idle 的会话 = idle 实心灰点（bg-ink-2 落盘，真实状态非伪 working）",
    Boolean(historyDot) &&
      historyDot.cls.includes("bg-ink-2") &&
      !historyDot.cls.includes("bg-success") &&
      historyDot.bg !== "rgba(0, 0, 0, 0)",
    `${historyDot?.cls} bg=${historyDot?.bg}`,
  );

  // 回到活跃列表，点开会话 tab（detail fixture 返回「旧名」，缓存由此拉热）。
  await page.getByRole("button", { name: "查看历史会话" }).click();
  await page.getByText("旧名").first().waitFor({ state: "visible", timeout: 5000 });
  await page.getByText("旧名").first().click();
  await page.waitForURL("**/session/agent_1", { timeout: 5000 });
  await page.waitForTimeout(800);
  check(
    "3a 打开 tab 后：detail 缓存为「旧名」（fixture 权威值，写扩散基准）",
    (await bodyText()).includes("旧名"),
    "",
  );

  // 推壳帧：改名 + working + 新时间。
  await page.evaluate(
    ({ project, sessionId }) => {
      window.__emitSessionsFrame({
        type: "sessions",
        sessions: [
          {
            type: "agent",
            projectName: project,
            sessionId,
            displayName: "新名",
            status: "working",
            provider: "claude",
            createdAt: "2026-11-01T00:00:00Z",
            updatedAt: "2026-11-05T11:30:00Z",
          },
          {
            type: "agent",
            projectName: project,
            sessionId: "agent_2",
            displayName: "会话二",
            status: "idle",
            provider: "claude",
            createdAt: "2026-11-01T00:00:00Z",
            updatedAt: "2026-11-05T10:00:00Z",
          },
        ],
      });
    },
    { project: PROJECT, sessionId: SESSION_ID },
  );
  await page.waitForTimeout(400);

  const afterText = await bodyText();
  check(
    "4a 壳帧后：「旧名」消失（列表 + detail 副本均被写扩散）",
    !afterText.includes("旧名"),
    `旧名=${(afterText.match(/旧名/g) ?? []).length}`,
  );
  check(
    "4b 壳帧后：「新名」出现 ≥2 处（左栏项目段行 + TabChip 同值）",
    (afterText.match(/新名/g) ?? []).length >= 2,
    `count=${(afterText.match(/新名/g) ?? []).length}`,
  );
  const agent1Dot = await dotFor("新名");
  check(
    "4c agent_1 行状态点 = working 绿（status 写扩散生效）",
    Boolean(agent1Dot?.cls?.includes("bg-success")) && agent1Dot.bg !== "rgba(0, 0, 0, 0)",
    `${agent1Dot?.cls} bg=${agent1Dot?.bg}`,
  );

  // 场景 B：WS 断线时的自愈通道——overview 10s 轮询拿到新值，订阅者（queryCache）必须
  // 把同一份写扩散应用到列表/详情副本，否则断线期间左栏会永久停在旧值。
  overviewCandidates = [session(SESSION_ID, "轮询名", "idle"), session(OTHER_ID, "会话二", "idle")];
  await page.waitForTimeout(12_000);
  const pollText = await bodyText();
  check(
    "5a 轮询自愈：「轮询名」出现（overview 订阅走同一写扩散通道）",
    pollText.includes("轮询名"),
    "",
  );
  check(
    "5b 轮询自愈：列表/详情副本无「新名」残留",
    !pollText.includes("新名"),
    `新名=${(pollText.match(/新名/g) ?? []).length}`,
  );

  const pass = results.every(Boolean);
  console.log(
    `\n${pass ? "ALL PASS" : "FAIL"}（${results.filter(Boolean).length}/${results.length}）`,
  );
  process.exit(pass ? 0 : 1);
} finally {
  await browser.close();
}
