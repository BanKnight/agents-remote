// settle 注意力语义探针（2026-11-13，T3 学习点②；契约 docs/design/session-attention.md）。
// 验证：⋯ 菜单「标记已了结/恢复关注」→ POST /settle → 会话移出活跃组、进底部「已了结」
// 折叠组（默认收起、降饱和、行尾「N 天前了结」）→ 恢复关注回活跃组。
//
// mock 纪律（.claude/rules/verification.md）：REST /api/overview 与 /api/sessions/stream 必须
// **同源**——壳帧会用服务端帧整体覆盖 overview 缓存，不同源会互相顶掉造成假 FAIL。本探针用
// 假 WebSocket（page.route 拦不了 WS）+ 主动 emit 与 REST fixture 同值的壳帧。
// provider 能力表走单源 mock helper（能力表批起 UI 面依赖 /api/agent-providers）。
// 用法：bun scripts/probe-settle.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";
import { mockAgentProviders } from "./lib/agent-provider-mock.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const PROJECT = "proj-settle";
const LIVE_ID = "agent_live";
const DONE_ID = "agent_done";
const SETTLED_AT = "2026-11-13T00:00:00.000Z";

const results = [];
function check(name, cond, detail = "") {
  results.push(Boolean(cond));
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

// 可变 fixture：settle POST 后由路由 handler 改写，REST 与壳帧都从这里投影（单一真相）。
let sessions = [
  {
    sessionId: LIVE_ID,
    displayName: "进行中会话",
    status: "working",
    createdAt: "2026-11-10T00:00:00Z",
    updatedAt: "2026-11-13T08:00:00Z",
    settledAt: undefined,
  },
  {
    sessionId: DONE_ID,
    displayName: "待了结会话",
    status: "done",
    createdAt: "2026-11-10T00:00:00Z",
    updatedAt: "2026-11-13T07:00:00Z",
    settledAt: undefined,
  },
];
const settleBodies = [];

const candidateOf = (s) => ({
  type: "agent",
  projectName: PROJECT,
  sessionId: s.sessionId,
  displayName: s.displayName,
  status: s.status,
  provider: "claude",
  createdAt: s.createdAt,
  updatedAt: s.updatedAt,
  ...(s.settledAt ? { settledAt: s.settledAt } : {}),
});
const sessionOf = (s) => ({
  id: s.sessionId,
  projectName: PROJECT,
  provider: "claude",
  displayName: s.displayName,
  status: s.status,
  createdAt: s.createdAt,
  updatedAt: s.updatedAt,
  ...(s.settledAt ? { settledAt: s.settledAt } : {}),
});

const json = (body) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(body),
});

/** REST/WS mock（桌面与移动两段共用；fixture 为模块级可变 `sessions`）。 */
async function setupPage(page) {
  await mockAgentProviders(page);
  await page.route("**/api/overview", (route) =>
    route.fulfill(json({ projectNames: [PROJECT], candidates: sessions.map(candidateOf) })),
  );
  await page.route("**/api/overview/subtitles", (route) => route.fulfill(json({ subtitles: {} })));
  await page.route(`**/api/projects/${PROJECT}/agent-sessions`, (route) =>
    route.fulfill(json({ sessions: sessions.map(sessionOf) })),
  );
  await page.route(`**/api/projects/${PROJECT}/terminal-sessions`, (route) =>
    route.fulfill(json({ sessions: [] })),
  );
  await page.route(new RegExp(`/api/projects/${PROJECT}/agent-sessions/[^/]+$`), (route) => {
    const id = route.request().url().split("/").pop();
    const target = sessions.find((s) => s.sessionId === id);
    if (!target) return route.fulfill({ status: 404, body: "{}" });
    return route.fulfill(json({ session: sessionOf(target), availableModels: [] }));
  });
  await page.route(new RegExp(`/api/projects/${PROJECT}/agent-sessions/[^/]+/settle$`), (route) => {
    const body = route.request().postDataJSON();
    settleBodies.push(body);
    const id = route.request().url().split("/").at(-2);
    sessions = sessions.map((s) =>
      s.sessionId === id ? { ...s, settledAt: body.settled ? SETTLED_AT : undefined } : s,
    );
    return route.fulfill(json({ session: sessionOf(sessions.find((s) => s.sessionId === id)) }));
  });
  await page.route("**/api/state/overview/pinned-sessions", (route) =>
    route.fulfill(json({ sessions: [] })),
  );

  await page.addInitScript(() => {
    localStorage.setItem("lang", "zh");
    // 假 WebSocket：保留 socket 实例与 on* 处理器，暴露 __emitSessionsFrame 推壳帧
    //（真实 sessions-stream 帧形状，内容与 REST fixture 同源）。
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
}

const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "zh-CN",
  });
  const page = await context.newPage();
  await setupPage(page);

  await page.goto(`${WEB_ORIGIN}/`);
  await page.getByLabel("访问密码").fill(await readAppPassword());
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForTimeout(1200);

  await page.goto(`${WEB_ORIGIN}/projects/${PROJECT}`);
  await page.getByText("待了结会话").first().waitFor({ state: "visible", timeout: 10_000 });
  // 壳帧与 REST 同源（登录后 WS 重连时服务端帧会覆盖 overview 缓存）。
  const emit = () =>
    page.evaluate((frame) => window.__emitSessionsFrame(frame), {
      type: "sessions",
      sessions: sessions.map(candidateOf).map(({ type: _t, ...shell }) => shell),
    });
  await emit();
  await page.waitForTimeout(300);

  /** 侧栏里「活跃列表」是否含该行（排除已了结折叠组内的行）。 */
  const inActiveList = (name) =>
    page.evaluate((n) => {
      const details = [...document.querySelectorAll("summary")]
        .map((s) => s.closest("details"))
        .filter(Boolean);
      return [...document.querySelectorAll("button.srow2")]
        .filter((b) => !details.some((d) => d.contains(b)))
        .some((b) => (b.textContent ?? "").includes(n));
    }, name);

  /** 已了结折叠组状态：存在 / open / 行文本 / 行 computed 颜色 / 状态点数。 */
  const settledGroup = () =>
    page.evaluate(() => {
      const summary = [...document.querySelectorAll("summary")].find((s) =>
        (s.textContent ?? "").includes("已了结"),
      );
      const details = summary?.closest("details");
      if (!details) return null;
      const row = details.querySelector("button.srow2");
      return {
        open: details.open,
        label: (summary.textContent ?? "").trim(),
        hasRow: Boolean(row),
        rowText: (row?.textContent ?? "").trim(),
        rowColor: row ? getComputedStyle(row).color : null,
        dots: details.querySelectorAll(".dot2").length,
      };
    });
  const ink3Color = await page.evaluate(() => {
    const probe = document.createElement("span");
    probe.className = "text-ink-3";
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  });

  check("1 初始：待了结会话在活跃列表（未 settle）", await inActiveList("待了结会话"), "");
  check("2 初始：无「已了结」折叠组", (await settledGroup()) === null, "");

  // 打开会话 tab → ⋯ 菜单 → 断言 settle 动作入口（动作区、与置顶相邻）。
  await page.getByText("待了结会话").first().click();
  await page.waitForURL(`**/session/${DONE_ID}`, { timeout: 5000 });
  await page.waitForTimeout(600);

  await page.getByRole("button", { name: "更多操作" }).first().click();
  const settleItem = page.getByRole("menuitem", { name: "标记已了结" });
  await settleItem.waitFor({ state: "visible", timeout: 5000 });
  check("3 ⋯ 菜单出现「标记已了结」（未 settle 态）", await settleItem.isVisible(), "");
  const pinItemVisible = await page
    .getByRole("menuitem", { name: /置顶/ })
    .first()
    .isVisible();
  check("4 settle 与置顶同在动作区（同屏可见）", pinItemVisible, "");

  await settleItem.click();
  await page.waitForTimeout(600);
  await emit();
  await page.waitForTimeout(400);

  check(
    "5 settle POST body = { settled: true }",
    settleBodies.length === 1 && settleBodies[0].settled === true,
    JSON.stringify(settleBodies),
  );
  check("6 settle 后移出活跃列表", !(await inActiveList("待了结会话")), "");

  const collapsed = await settledGroup();
  check(
    "7 底部出现「已了结 · 1」折叠组且默认收起",
    Boolean(collapsed) && collapsed.open === false && collapsed.label.includes("已了结 · 1"),
    JSON.stringify(collapsed),
  );

  await page.getByText("已了结 · 1").click();
  await page.waitForTimeout(250);
  const expanded = await settledGroup();
  check(
    "8 展开后可见该行，行尾为「…了结」相对时间",
    Boolean(expanded) && expanded.open === true && expanded.rowText.includes("了结"),
    JSON.stringify(expanded),
  );
  check(
    "9 已了结行降饱和（text-ink-3 落盘）且无状态点",
    Boolean(expanded) && expanded.rowColor === ink3Color && expanded.dots === 0,
    `color=${expanded?.rowColor} ink3=${ink3Color} dots=${expanded?.dots}`,
  );

  // 已 settled → 菜单文案翻转，恢复关注回到活跃列表。
  await page.getByRole("button", { name: "更多操作" }).first().click();
  const unsettleItem = page.getByRole("menuitem", { name: "恢复关注" });
  await unsettleItem.waitFor({ state: "visible", timeout: 5000 });
  check("10 已 settled 的会话菜单显示「恢复关注」", await unsettleItem.isVisible(), "");

  await unsettleItem.click();
  await page.waitForTimeout(600);
  await emit();
  await page.waitForTimeout(400);

  check(
    "11 unsettle POST body = { settled: false }",
    settleBodies.length === 2 && settleBodies[1].settled === false,
    JSON.stringify(settleBodies),
  );
  check("12 unsettle 后回到活跃列表", await inActiveList("待了结会话"), "");
  check("13 无已了结会话时折叠组消失", (await settledGroup()) === null, "");

  // ── 移动 ▾ 菜单：「已了结」组是可聚焦 menuitem（Radix menu roving focus 只遍历 menuitem，
  // 不能用 <details>/<summary>），点按展开、关闭菜单后复位 ─────────────────────────
  console.log("\n===== 移动 ▾ 菜单「已了结」组 =====");
  sessions = sessions.map((s) => (s.sessionId === DONE_ID ? { ...s, settledAt: SETTLED_AT } : s));
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    locale: "zh-CN",
  });
  const mobile = await mobileContext.newPage();
  await setupPage(mobile);
  await mobile.goto(`${WEB_ORIGIN}/`);
  await mobile.getByLabel("访问密码").fill(await readAppPassword());
  await mobile.getByRole("button", { name: "登录" }).click();
  await mobile.waitForTimeout(1200);
  await mobile.goto(`${WEB_ORIGIN}/projects/${PROJECT}/session/${LIVE_ID}`);
  await mobile.locator(".nav h1 button").waitFor({ state: "visible", timeout: 10_000 });
  await mobile.waitForTimeout(800);

  const openSwitchMenu = async () => {
    await mobile.locator(".nav h1 button").click();
    await mobile.getByRole("menuitem").first().waitFor({ state: "visible", timeout: 5000 });
  };
  const settledRowVisible = () =>
    mobile
      .getByRole("menuitem", { name: /待了结会话/ })
      .isVisible()
      .catch(() => false);

  await openSwitchMenu();
  const settledHeader = mobile.getByRole("menuitem", { name: /已了结 · 1/ });
  await settledHeader.waitFor({ state: "visible", timeout: 5000 });
  check("14 ▾ 菜单出现「已了结 · 1」组头（menuitem）", await settledHeader.isVisible(), "");
  check(
    "15 组头 aria-expanded=false 且默认不渲染行",
    (await settledHeader.getAttribute("aria-expanded")) === "false" && !(await settledRowVisible()),
    "",
  );
  await settledHeader.click();
  await mobile.waitForTimeout(250);
  check(
    "16 点组头展开：aria-expanded=true + 已了结行可见",
    (await settledHeader.getAttribute("aria-expanded")) === "true" && (await settledRowVisible()),
    "",
  );
  await mobile.keyboard.press("Escape");
  await mobile.waitForTimeout(400);
  await openSwitchMenu();
  const reopenedHeader = mobile.getByRole("menuitem", { name: /已了结 · 1/ });
  check(
    "17 重开菜单折叠态复位（每次进页面默认收起）",
    (await reopenedHeader.getAttribute("aria-expanded")) === "false" &&
      !(await mobile
        .getByRole("menuitem", { name: /待了结会话/ })
        .isVisible()
        .catch(() => false)),
    "",
  );
} finally {
  await browser.close();
  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed}/${results.length} 通过`);
  if (failed > 0) process.exitCode = 1;
}
