// Gen UI widget 卡片浏览器探针:真实 Chromium 内验证 `::gen-ui` 标记投影 → 卡片渲染 →
// 迷你桥四能力(widgetState seed / setWidgetState 防抖 PUT / sendFollowUpMessage 确认闸 /
// zcode:set_globals 主题事件)+ 流内钳高 + 全屏第二实例。REST(gen-ui-file/state)与
// claude-stream WS 全 mock,零真实会话依赖。单测不执行 srcdoc 内脚本——桥运行时行为
// 只有真浏览器能断言。
//
// 跑法:systemd-run --scope --user -p MemoryMax=2G bun scripts/probe-gen-ui-widget.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const projectName = "test";
const sessionId = "agent_probe-gen-ui";

const results = [];
const assert = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const json = (body) => ({
  status: 200,
  contentType: "application/json",
  headers: { "cache-control": "no-store" },
  body: JSON.stringify(body),
});

// 滑块演示页(探针自备生成物):读 widgetState seed、拖动 setWidgetState、按钮
// sendFollowUpMessage、监听 zcode:set_globals;内容撑高(~600px)驱动桥 size 上报。
const SLIDER_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><style>
body { font-family: system-ui, sans-serif; margin: 0; padding: 24px; }
.spacer { height: 600px; background: linear-gradient(#eef, #ffe); }
</style></head>
<body>
<div>Value: <span id="v">?</span></div>
<div class="spacer"></div>
<input id="slider" type="range" min="0" max="100" value="0">
<button id="send">Send to agent</button>
<script>
var init = zcode.widgetState && zcode.widgetState.modelContent
  ? JSON.parse(zcode.widgetState.modelContent)
  : { value: 0 };
document.getElementById("v").textContent = String(init.value);
document.getElementById("slider").value = String(init.value);
window.__themeEvents = [];
window.addEventListener("zcode:set_globals", function (e) {
  window.__themeEvents.push(e.detail.theme);
});
document.getElementById("slider").addEventListener("input", function () {
  var value = Number(this.value);
  document.getElementById("v").textContent = String(value);
  zcode.setWidgetState({ modelContent: JSON.stringify({ value: value }) });
});
document.getElementById("send").addEventListener("click", function () {
  zcode.sendFollowUpMessage("把滑块调到 " + document.getElementById("v").textContent);
});
</script>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));
// lang=zh(默认 en)。sandbox iframe(opaque origin)里 localStorage 访问抛
// SecurityError → 必须 try/catch,否则 init script 污染 pageerror 断言。
await page.addInitScript(() => {
  try {
    localStorage.setItem("lang", "zh");
  } catch {}
});

// ── mock REST ──────────────────────────────────────────────────────────
const session = {
  id: sessionId,
  projectName,
  provider: "claude",
  displayName: "Gen UI Probe",
  status: "running",
  createdAt: "2026-10-22T00:00:00.000Z",
};
await page.route(new RegExp(`/api/projects/${projectName}/agent-sessions/${sessionId}$`), (r) =>
  r.fulfill(json({ session, availableModels: ["sonnet"], availablePermissionModes: ["default"] })),
);

let stateGets = 0;
const statePuts = [];
await page.route(/gen-ui-file/, (r) =>
  // JSON 契约(shared GenUiFileResponse)——web fetchJson 直消费,裸 HTML 会解析失败。
  r.fulfill(json({ mimeType: "text/html", html: SLIDER_HTML })),
);
await page.route(/gen-ui-state/, (r) => {
  const req = r.request();
  if (req.method() === "GET") {
    stateGets += 1;
    // seed:滑块初始值 7(回放恢复语义——上次会话拖到 7,重开卡片从 7 起步)。
    return r.fulfill(
      json({
        schemaVersion: 1,
        widgets: [
          {
            path: ".agents-remote/gen-ui/slider.html",
            modelContent: '{"value":7}',
            updatedAt: "2026-10-22T00:00:00.000Z",
          },
        ],
      }),
    );
  }
  statePuts.push(JSON.parse(req.postData() ?? "{}"));
  return r.fulfill(json({ schemaVersion: 1, widgets: [] }));
});

// ── mock WS(routeWebSocket 持 socket 驱动下行;上行观测走 WebSocket.send hook)──
let socket;
await page.routeWebSocket(/claude-stream/, (ws) => {
  socket = ws;
});
await page.goto(`${ORIGIN}/projects/${projectName}/session/${sessionId}`);
// 登录(auth 层):首次 goto 落 /login,填密码(自读不打印)后回会话页。
const pwInput = page.waitForSelector('input[type="password"]', { timeout: 4000 }).catch(() => null);
if ((await pwInput) !== null) {
  await page.getByLabel("访问密码").fill(await readAppPassword());
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForTimeout(1500);
  await page.goto(`${ORIGIN}/projects/${projectName}/session/${sessionId}`);
}
await page.waitForTimeout(1200);
// hook WebSocket.send:上行帧第一手记录。routeWebSocket on("message") 只报页面收到
// 的方向,客户端上行捕不到——hook 是唯一可靠的上行观测面。
await page.evaluate(() => {
  const origSend = WebSocket.prototype.send;
  window.__wsSends = [];
  WebSocket.prototype.send = function (data) {
    window.__wsSends.push(String(data).slice(0, 300));
    return origSend.call(this, data);
  };
});
if (!socket) {
  console.error("FAIL: claude-stream WS 未建立");
  console.error("URL:", page.url());
  console.error("pageErrors:", pageErrors.slice(0, 5).join(" | "));
  await page
    .locator("body")
    .innerText()
    .then((t) => console.error("body head:", t.slice(0, 400).replace(/\n+/g, " / ")))
    .catch(() => {});
  await browser.close();
  process.exit(1);
}
socket.send(JSON.stringify({ type: "session_init", resume: false }));
await page.waitForTimeout(800);
// assistant 消息:普通文本行 + gen-ui 标记行(标记行应被剥离出气泡、投影成卡片)。
socket.send(
  JSON.stringify({
    type: "assistant",
    uuid: "uuid-gen-ui-1",
    message: {
      role: "assistant",
      content: [
        {
          type: "text",
          text: '给你一个滑块界面:\n::gen-ui{"path":".agents-remote/gen-ui/slider.html","title":"滑块演示"}',
        },
      ],
    },
  }),
);
await page.waitForTimeout(2500);

// ── 1. 行为断言 ────────────────────────────────────────────────────────
const cardCount = await page.locator('iframe[title="滑块演示"]').count();
if (cardCount === 0) {
  await page
    .locator("body")
    .innerText()
    .then((t) => console.error("[diag] body:", t.slice(0, 600).replace(/\n+/g, " / ")))
    .catch(() => {});
}
assert("card iframe renders", cardCount === 1);
assert("badge 生成界面", (await page.getByText("生成界面").count()) >= 1);
// 标记行不进气泡文本。
const bubbleText = await page
  .locator(".aui-root")
  .first()
  .innerText()
  .catch(() => "");
assert("marker line stripped from bubble", !bubbleText.includes("::gen-ui"));
assert("state seeded once", stateGets === 1, `GET ×${stateGets}`);

// ── 2. 桥 widgetState seed(iframe 内同步可读)───────────────────────────
let frame = null;
for (const f of page.frames()) {
  if (f !== page.mainFrame() && (await f.locator("#slider").count()) > 0) frame = f;
}
assert("srcdoc frame found", frame !== null);
if (frame) {
  const seededValue = await frame.evaluate(() => {
    const s = window.zcode && window.zcode.widgetState;
    return s && s.modelContent ? JSON.parse(s.modelContent).value : null;
  });
  assert("bridge widgetState seed value=7", seededValue === 7, `value=${seededValue}`);
  const sliderValue = await frame.locator("#slider").inputValue();
  assert("slider restored from seed", sliderValue === "7", `slider=${sliderValue}`);

  // ── 3. setWidgetState → 宿主防抖 PUT ──────────────────────────────────
  await frame.evaluate(() => {
    const slider = document.getElementById("slider");
    slider.value = "42";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForTimeout(300);
  assert("PUT debounced (not immediate)", statePuts.length === 0, `puts=${statePuts.length}`);
  await page.waitForTimeout(900);
  assert(
    "PUT carries merged modelContent value=42",
    statePuts.length === 1 &&
      statePuts[0].widgets?.[0]?.modelContent === '{"value":42}' &&
      statePuts[0].widgets?.[0]?.path === ".agents-remote/gen-ui/slider.html",
    JSON.stringify(statePuts[0]?.widgets?.[0] ?? null),
  );

  // ── 4. sendFollowUpMessage → 确认闸 → 上行 user 帧 ─────────────────────
  await frame.locator("#send").click();
  await page.waitForTimeout(500);
  const confirmBtn = page.getByRole("button", { name: "发送" }).last();
  assert("confirm dialog appears", (await confirmBtn.count()) === 1);
  await confirmBtn.click();
  await page.waitForTimeout(800);
  // 上行帧断言用 WebSocket.send hook(routeWebSocket on("message") 只报页面收到的
  // 方向,客户端上行捕不到——hook 是唯一可靠的上行观测面)。
  const wsSendsUser = (await page.evaluate(() => window.__wsSends ?? [])).find((s) =>
    s.includes("把滑块调到"),
  );
  assert(
    "confirmed follow-up reaches WS as user frame",
    Boolean(wsSendsUser) && wsSendsUser.includes('"type":"user"'),
    wsSendsUser ?? "no send captured",
  );

  // ── 5. 主题事件 zcode:set_globals ─────────────────────────────────────
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "light";
  });
  await page.waitForTimeout(300);
  const themeEvents = await frame.evaluate(() => window.__themeEvents);
  assert(
    "theme event delivered",
    Array.isArray(themeEvents) && themeEvents.includes("light"),
    JSON.stringify(themeEvents),
  );
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "dark";
  });

  // ── 6. 流内钳高(内容 600px+ → 卡片 ≤420)──────────────────────────────
  const cardH = await page
    .locator('iframe[title="滑块演示"]')
    .evaluate((el) => el.getBoundingClientRect().height);
  assert("clamped height ≤420", cardH > 300 && cardH <= 420, `h=${Math.round(cardH)}`);
}

// ── 7. 全屏第二实例 ─────────────────────────────────────────────────────
await page.getByRole("button", { name: "放大查看" }).click();
await page.waitForTimeout(800);
const fullCount = await page.locator('iframe[title="滑块演示"]').count();
assert("fullscreen second instance", fullCount === 2, `iframes=${fullCount}`);
const fullWin = await page
  .locator('iframe[title="滑块演示"]')
  .last()
  .evaluate((el) => el.getBoundingClientRect().height);
assert("fullscreen instance fills viewport", fullWin > 500, `h=${Math.round(fullWin)}`);
await page.getByRole("button", { name: "关闭" }).last().click();
await page.waitForTimeout(600);
assert(
  "close restores single instance",
  (await page.locator('iframe[title="滑块演示"]').count()) === 1,
);

assert("no page errors", pageErrors.length === 0, pageErrors.join(" | ").slice(0, 300));

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
await browser.close();
process.exit(failed.length === 0 ? 0 : 1);
