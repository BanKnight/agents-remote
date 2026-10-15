// 探针:agent 会话状态 5 态化(v1.6,2026-10-15,OSC 7501 对齐)。验证浏览器真实链路:
// 1 全局活动卡 dot 5 态 class 映射(idle/working/blocked/done/error);
// 2 .dot.finished 新变体真实落盘(computed 背景 = --c-success,与 .dot.run 同色——防 CSS
//   未落盘 utility 缺失的假绿,frontend-notes §10);
// 3 rankGlobalInstances 排序:blocked > error > working > idle/done > terminal;
// 4 「运行中」计数只计 working(blocked/done 不计入,用户拍板);
// 5 详情页 effort 门消费 session_status 帧(WS 标量)——blocked 帧后切 effort 弹打断确认。
// 密码由脚本自读,不进 agent 上下文。用法:bun scripts/probe-session-status.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const projectName = process.env.PROBE_PROJECT ?? "test";

let pass = 0;
let fail = 0;
function check(label, ok, detail) {
  const suffix = detail ? `  (${detail})` : "";
  console.log(ok ? `PASS ${label}${suffix}` : `FAIL ${label}${suffix}`);
  if (ok) pass += 1;
  else fail += 1;
}

// 5 个 agent 候选(5 态各一)+ 1 terminal。排序期望(blocked>error>working>idle/done>terminal):
const candidates = [
  { id: "agent_s_idle", status: "idle" },
  { id: "agent_s_working", status: "working" },
  { id: "agent_s_blocked", status: "blocked" },
  { id: "agent_s_done", status: "done" },
  { id: "agent_s_error", status: "error" },
].map((s, i) => ({
  type: "agent",
  projectName,
  sessionId: s.id,
  displayName: `Probe ${s.status}`,
  status: s.status,
  provider: "claude",
  createdAt: new Date(Date.now() - (i + 1) * 60_000).toISOString(),
  updatedAt: new Date(Date.now() - (i + 1) * 60_000).toISOString(),
}));
candidates.push({
  type: "terminal",
  projectName,
  sessionId: "terminal_s_1",
  displayName: "Probe term",
  status: "running",
  createdAt: new Date().toISOString(),
});

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();

  const detail = (id, status) => ({
    session: {
      id,
      projectName,
      provider: "claude",
      displayName: id,
      status,
      permissionMode: "default",
      createdAt: new Date().toISOString(),
    },
    availableModels: ["sonnet"],
    availablePermissionModes: ["default"],
  });
  const json = (body) => ({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
  await page.route(/\/api\/overview$/, (r) =>
    r.fulfill(json({ projectNames: [projectName], candidates })),
  );
  await page.route(new RegExp(`/api/projects/${projectName}/agent-sessions$`), (r) =>
    r.fulfill(json({ sessions: candidates.filter((c) => c.type === "agent") })),
  );
  await page.route(/\/api\/state\/overview\/pinned-sessions$/, (r) =>
    r.fulfill(json({ sessions: [] })),
  );
  await page.route(/\/api\/state\/overview\/pinned-sessions\/[^/]+$/, (r) =>
    r.fulfill(json({ sessions: [] })),
  );
  await page.route(/\/api\/approvals$/, (r) => r.fulfill(json({ approvals: [] })));
  for (const c of candidates.filter((x) => x.type === "agent")) {
    await page.route(new RegExp(`/api/projects/${projectName}/agent-sessions/${c.id}$`), (r) => {
      console.log("MOCK-HIT:", c.id, r.request().url());
      r.fulfill(json(detail(c.id, c.status)));
    });
  }

  await page.goto(`${WEB_ORIGIN}/`);
  await page.getByLabel("Password").fill(await readAppPassword());
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.goto(`${WEB_ORIGIN}/projects`);

  // 活动卡行 = dot + 名字(全局活动卡 statusToV2DotClass 消费点)。
  const rowDot = (name) =>
    page
      .locator("span", { hasText: new RegExp(`^Probe ${name}$`) })
      .locator("xpath=preceding-sibling::span[1]");

  await page.getByText("Probe working").first().waitFor({ state: "visible", timeout: 15000 });

  // 活动卡默认 preview 3 行(ACTIVITY_PREVIEW_COUNT),排序尾部行折叠——先展开全部。
  const seeAll = page.getByRole("button", { name: /查看全部活动|See all activity/ });
  if (await seeAll.isVisible().catch(() => false)) {
    await seeAll.click();
  }

  // ── 1 dot 5 态 class ──
  const expectClass = {
    working: "dot run",
    blocked: "dot warn",
    done: "dot finished",
    error: "dot err",
    idle: "dot idle",
  };
  for (const [name, cls] of Object.entries(expectClass)) {
    const got = await rowDot(name).getAttribute("class");
    check(`1 dot class ${name} → "${cls}"`, got === cls, `got="${got}"`);
  }

  // ── 2 .dot.finished 落盘:computed 背景 = --c-success(与 .dot.run 相同)──
  const doneBg = await rowDot("done").evaluate((el) => getComputedStyle(el).backgroundColor);
  const runBg = await rowDot("working").evaluate((el) => getComputedStyle(el).backgroundColor);
  check(
    "2 .dot.finished 落盘(背景色与 .dot.run 同为 success)",
    doneBg === runBg && doneBg !== "rgba(0, 0, 0, 0)",
    `${doneBg} vs ${runBg}`,
  );

  // ── 2b dot 几何:5 态全 7×7 正圆(防变体类名与原型裸类撞名——.dot.done 曾被 03c
  //    完成横幅 .done{display:flex;padding;border} 拉成 26×22 椭圆,真机实锤)──
  for (const [name] of Object.entries(expectClass)) {
    const g = await rowDot(name).evaluate((el) => {
      const r = el.getBoundingClientRect();
      return [Math.round(r.width), Math.round(r.height)];
    });
    check(`2b dot 几何 ${name} 7×7 正圆`, g[0] === 7 && g[1] === 7, `got ${g[0]}×${g[1]}`);
  }

  // ── 3 排序:活动卡行序 blocked > error > working > idle/done > terminal ──
  // 行文本带活动时间缀("3m ago"),剥掉再比名字序。
  const order = await page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .map((b) => b.textContent ?? "")
      .filter((t) => t.startsWith("Probe "))
      .map((t) => t.replace(/\s*(just now|[0-9]+[smh][^0-9]*)$/i, "").trim()),
  );
  const expected = [
    "Probe blocked",
    "Probe error",
    "Probe working",
    "Probe idle",
    "Probe done",
    "Probe term",
  ];
  check(
    "3 排序 blocked>error>working>idle>done>terminal",
    JSON.stringify(order) === JSON.stringify(expected),
    order.join(" | "),
  );

  // ── 4 计数 x/y(working/总实例,用户拍板 2026-10-15):agent working + terminal running
  //    各计 1 → 2/6(6 = 5 agent + 1 terminal);blocked/done/error/idle 只进分母。
  //    文案 key home.nRunning:「{{active}}/{{total}} 进行中」。 ──
  await page.waitForFunction(
    () =>
      document.body.textContent?.includes("进行中") ||
      document.body.textContent?.includes("running"),
    { timeout: 5000 },
  );
  const countText = await page.evaluate(() => {
    const el = [...document.querySelectorAll("span,div,p")].find((e) => {
      const t = e.textContent ?? "";
      return (t.includes("进行中") || t.includes("running")) && t.length < 40;
    });
    return el?.textContent ?? "";
  });
  check(
    "4 计数 x/y = 2/6(working+terminal running 进分子,余者只进分母)",
    /(^|[^0-9])2\/6\s*(进行中|running)/.test(countText),
    countText.trim(),
  );

  // ── 5 详情页 effort 门消费 WS session_status 帧(blocked → 打断确认)──
  await page.routeWebSocket(
    new RegExp(`/api/projects/${projectName}/agent-sessions/agent_s_idle/claude-stream`),
    (ws) => {
      const send = (msg) => ws.send(JSON.stringify(msg));
      ws.onMessage((data) => {
        try {
          if (JSON.parse(String(data)).type === "ping") ws.send(JSON.stringify({ type: "pong" }));
        } catch {
          /* ignore */
        }
      });
      send({ type: "session_init", resume: false, replay: "full" });
      send({ type: "system", subtype: "seed_init" });
      send({ type: "history_start", count: 0 });
      send({ type: "history_end" });
      send({ type: "live_start", count: 0 });
      send({ type: "live_end" });
      setTimeout(() => send({ type: "system", subtype: "session_status", status: "blocked" }), 500);
    },
  );
  // 详情 HTTP route 重复注册(Playwright route 栈 LIFO:后注册先匹配)——前一轮注册的
  // detail handler 会被 PWA service worker 透传路径抢占,这里覆写保证命中。
  await page.route(new RegExp(`/api/projects/${projectName}/agent-sessions/agent_s_idle$`), (r) =>
    r.fulfill(json(detail("agent_s_idle", "idle"))),
  );
  await page.goto(`${WEB_ORIGIN}/projects/${projectName}/agent-sessions/agent_s_idle/claude`);
  await page.waitForTimeout(1200); // 等 session_status 帧到达(500ms + 余量)

  // 详情页无可见状态 UI(标量仅供 effort 门消费),帧→标量折叠由 adapter 代码路径 +
  // claude-runtime 单测覆盖;此处断言帧到达后页面不炸(error boundary 不出现)。
  await page.waitForSelector("form textarea", { timeout: 10000 });
  const crashed = await page
    .getByText("页面出错了")
    .isVisible()
    .catch(() => false);
  check("5 session_status 帧到达后详情页正常渲染(不炸)", !crashed);

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exitCode = fail === 0 ? 0 : 1;
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
