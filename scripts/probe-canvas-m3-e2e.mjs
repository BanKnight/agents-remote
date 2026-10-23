// 真实 agent 端到端验收（M3 画布选区引用循环）：真实 Claude CLI 会话驱动
// 「agent 建画布 → 用户选元素 → 引用到对话 → 追问 → agent read_scene 读选区 +
// apply_operations 改选区」全链路。覆盖浏览器探针（mock agent 侧）测不到的
// CLI 透传 / live 流投影 / prompt 注入消费面。单轮约 4-5 分钟（真实 agent 轮次）。
//
// 跑法：systemd-run --scope --user -p MemoryMax=2G bun scripts/probe-canvas-m3-e2e.mjs
//
// 两个硬坑（本脚本调试实战沉淀，改前必读）：
// 1. locator.evaluate 的回调签名是 (element, arg)——传业务参数必须写双参
//    `(el, id) => ...`，单参 `(id) => ...` 会把 body 元素误当 id（实证：
//    selectElements 收到 HTMLBodyElement，appState key 变 "[object HTMLBodyElement]"）；
//    且包装层不得引用 Node 侧闭包（evaluate 只序列化 fn 源码，闭包变量不过桥）。
// 2. 每个 MCP 工具结果各渲染一张画布卡（create/read_scene/apply 各一张）——
//    agent apply 后的 r2 场景在 apply 卡上，create 卡按设计停在自己收到的
//    face；跨卡断言必须遍历全部 iframe 帧。
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const PROJECT = "test";
const TURN_TIMEOUT_MS = Number(process.env.TURN_TIMEOUT_MS ?? 240_000);

const results = [];
const assert = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, timeoutMs = 60_000, stepMs = 250) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await fn()) return true;
    await sleep(stepMs);
  }
  return fn();
};
// waitFor 语义是 boolean——需要「等到条件值」时用它（如取 Cache 元素对象）。
const waitForValue = async (fn, timeoutMs = 60_000, stepMs = 250) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await fn();
    if (value) return value;
    await sleep(stepMs);
  }
  return fn();
};

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));
// iframe 内 console 错误单独收集（pageerror 不含跨 frame 的 window.onerror 报错;
// 模板 JS 抛错只出现在 console,是「face 到卡但场景空」的关键第一手）。
const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() === "error")
    consoleErrors.push(`${m.location().url?.slice(-40)} ${m.text().slice(0, 200)}`);
});
await page.addInitScript(() => localStorage.setItem("lang", "zh"));

// ── 登录（UI 一次，之后 ctx.request 共享 cookie）─────────────────────────────
await page.goto(`${ORIGIN}/projects/${PROJECT}`);
const pwInput = await page
  .waitForSelector('input[type="password"]', { timeout: 4000 })
  .catch(() => null);
if (pwInput !== null) {
  await page.getByLabel("访问密码").fill(await readAppPassword());
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForTimeout(1500);
}
assert("logged in", !page.url().includes("/login"), page.url());

// ── 创建真实 claude 会话（REST 走页面同 cookie jar）────────────────────────
const createRes = await ctx.request.post(`${ORIGIN}/api/projects/${PROJECT}/agent-sessions`, {
  data: { provider: "claude", displayName: "M3 引用循环 e2e" },
});
assert("create claude session", createRes.ok(), `status=${createRes.status()}`);
const created = createRes.ok() ? await createRes.json() : null;
const session = created?.session ?? created;
const sessionId = session?.id;
if (!sessionId) {
  console.error("FAIL: 无 sessionId,终止");
  await browser.close();
  process.exit(1);
}
console.log(`[info] session=${sessionId}`);
await page.goto(`${ORIGIN}/projects/${PROJECT}/session/${sessionId}`);
await page.waitForTimeout(2500);

const composer = page.getByRole("textbox").first();
const sendBtn = () => page.getByRole("button", { name: "发送" });

// ── 1. 让 agent 建画布 ─────────────────────────────────────────────────────
await composer.fill(
  "请用 create_diagram 工具画一个三节点缓存架构图：Client → Cache → DB 三个矩形节点从左到右排列，" +
    "用箭头连接；节点文本分别是 Client、Cache、DB。只做这一件事，不要读写其它文件。",
);
await sendBtn().click();

const frameLocator = page.locator('iframe[data-testid="mcp-app-frame"]').first();
const cardShown = await waitFor(async () => (await frameLocator.count()) > 0, TURN_TIMEOUT_MS);
assert("agent create_diagram → canvas card renders", cardShown);
if (!cardShown) {
  console.error("FAIL: 卡片未出现,终止");
  await browser.close();
  process.exit(1);
}
const frame = frameLocator.contentFrame();
// FrameLocator 无 evaluate——统一经 body 元素在 frame 上下文里跑 JS。
// locator.evaluate 的回调签名是 (element, arg):传 arg 的调用点必须写双参
// `(el, id) => ...`,否则 element(body)被误当业务参数(实证:selectElements
// 收到 HTMLBodyElement,appState key 变 "[object HTMLBodyElement]")。
// 包装层不得引用 Node 侧闭包(evaluate 只序列化 fn 源码,闭包变量不过桥)。
const evalInFrame = (fn, arg) => frame.locator("body").evaluate(fn, arg);
await waitFor(async () => (await frame.locator("#exc-root canvas").count()) > 0, 90_000);
const mounted = (await frame.locator("#exc-root canvas").count()) > 0;
assert("excalidraw mounted in real session", mounted);

// ── 2. 选中目标节点（调试口 API：数据链同真实点击）─────────────────────────
// agent 输出形态有轮次间漂移（独立 text 节点 / rectangle+绑定文本）——目标查找
// 优先 /cache/i 文本匹配,fallback 第一个元素;M3 断言核心是引用循环本身。
const cacheEl = await waitForValue(async () => {
  const els = await evalInFrame(() =>
    (window.__arCanvasCtrl?.getElements() ?? []).map((el) => ({
      id: el.id,
      type: el.type,
      text: el.text ?? "",
    })),
  ).catch(() => []);
  return (
    els.find((el) => /cache/i.test(el.text)) ??
    els.find((el) => el.text.trim().length > 0) ??
    els[0] ??
    null
  );
}, 120_000);
assert(
  "canvas has a target element",
  Boolean(cacheEl),
  cacheEl ? `${cacheEl.type} ${cacheEl.id}` : "not found",
);
if (!cacheEl) {
  console.error("[diag] title:", await frame.locator("#title").innerText().catch(String));
  console.error("[diag] meta:", await frame.locator("#meta").innerText().catch(String));
  console.error(
    "[diag] allElements:",
    await evalInFrame(() =>
      JSON.stringify((window.__arCanvasCtrl?.getAllElementsIncludingDeleted?.() ?? []).length),
    ).catch(String),
  );
  console.error("[diag] iframe console errors:", consoleErrors.slice(0, 6));
  await browser.close();
  process.exit(1);
}
// 选中前把卡片滚进视口：excalidraw 对不可见画布（IntersectionObserver 暂停渲染
// 循环）updateScene 后不派发 onChange → syncSelection 不跑。探针同款两步。
await frame.locator("#exc-root").evaluate((el) => el.scrollIntoView({ block: "center" }));
await sleep(300);
// 单变量对照：selectElements 同一 evaluate 内立即读选中——分辨「updateScene 被
// 吞（immediate 空）」vs「生效后又被清（immediate 有、稍后空）」。
const immediateSel = await evalInFrame((el, id) => {
  window.__arCanvasCtrl?.selectElements([id]);
  return (window.__arCanvasCtrl?.getSelected() ?? []).map((e) => e.id);
}, cacheEl.id);
console.log(`[diag] immediate selected: ${JSON.stringify(immediateSel)}`);
await evalInFrame((el, id) => window.__arCanvasCtrl?.selectElements([id]), cacheEl.id);
const citeBarShown = await waitFor(
  () =>
    frame
      .locator("#cite-bar")
      .evaluate((el) => !el.hidden)
      .catch(() => false),
  15_000,
);
assert("selecting the Cache node shows the cite bar", citeBarShown);
if (!citeBarShown) {
  console.error(
    "[diag] frames:",
    await page.locator('iframe[data-testid="mcp-app-frame"]').count(),
  );
  console.error(
    "[diag] ctrl:",
    await evalInFrame(() => typeof window.__arCanvasCtrl).catch(String),
  );
  console.error(
    "[diag] selected:",
    await evalInFrame(() => (window.__arCanvasCtrl?.getSelected?.() ?? []).map((e) => e.id)).catch(
      String,
    ),
  );
  // 分辨「excalidraw restore 吃掉选中」vs「appState 有值但 onChange 未派发」:
  // appState.selectedElementIds 空 → restore 过滤层问题;有值 → 渲染循环/onChange 层问题。
  console.error(
    "[diag] appState.selectedElementIds:",
    await evalInFrame(() =>
      JSON.stringify(window.__arCanvasCtrl?.getAppState?.()?.selectedElementIds),
    ).catch(String),
  );
  console.error(
    "[diag] deleted:",
    await evalInFrame(() =>
      (window.__arCanvasCtrl?.getAllElementsIncludingDeleted?.() ?? [])
        .filter((e) => e.isDeleted)
        .map((e) => e.id),
    ).catch(String),
  );
  console.error(
    "[diag] citeBar hidden:",
    await frame
      .locator("#cite-bar")
      .evaluate((el) => el.hidden)
      .catch(String),
  );
  console.error(
    "[diag] frame visible:",
    await frameLocator.isVisible().catch(() => "?"),
    JSON.stringify(await frameLocator.boundingBox().catch(() => null)),
  );
  await browser.close();
  process.exit(1);
}

// ── 3. 引用 → chip ─────────────────────────────────────────────────────────
await frame.locator("#cite").evaluate((el) => el.click());
const chipShown = await waitFor(
  async () => (await page.getByRole("button", { name: "移除画布选区" }).count()) > 0,
  15_000,
);
assert("cite click → composer chip appears", chipShown);
if (!chipShown) {
  console.error("FAIL: chip 未出现,后续断言无意义,终止");
  await browser.close();
  process.exit(1);
}

// ── 4. 追问 → agent apply_operations 改选区 ────────────────────────────────
await composer.fill(
  "把选中的节点文本改成 Cache(Redis)。用 read_scene + apply_operations 局部修改，不要重画整张图。",
);
await sendBtn().click();

const chipCleared = await waitFor(
  async () => (await page.getByRole("button", { name: "移除画布选区" }).count()) === 0,
  20_000,
);
assert("chip cleared after send", chipCleared);

// apply 的 tool_result 会渲染自己的画布卡（每工具结果一卡）：rename 体现在
// apply 卡（r2），create 卡（r1）按设计停在自己收到的 face——断言须遍历全部帧。
const anyCanvasHasRedis = async () => {
  const frameLoc = page.locator('iframe[data-testid="mcp-app-frame"]');
  const total = await frameLoc.count();
  for (let i = 0; i < total; i++) {
    const fr = frameLoc.nth(i).contentFrame();
    const hit = await fr
      .locator("body")
      .evaluate(() =>
        (window.__arCanvasCtrl?.getElements() ?? []).some((e) => /redis/i.test(e.text ?? "")),
      )
      .catch(() => false);
    if (hit) return true;
  }
  return false;
};
const cacheRenamed = await waitFor(() => anyCanvasHasRedis(), TURN_TIMEOUT_MS);
assert("agent applied the rename via apply_operations", cacheRenamed);

// ── 5. 零页面错误 ─────────────────────────────────────────────────────────
// sandbox iframe 内 excalidraw 访问 localStorage 抛 SecurityError 是 allow-scripts
// 无 allow-same-origin 的固有噪音（功能不受影响——选中/引用/commit 全链可用）,
// 排除后断言其余页面错误。
const realErrors = pageErrors.filter((e) => !e.includes("'localStorage' property"));
assert(
  "no page errors (excl. sandbox localStorage noise)",
  realErrors.length === 0,
  realErrors.slice(0, 3).join(" | "),
);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
await browser.close();
// e2e 清理纪律：只关本次创建的测试会话实例（不清理项目/画布文档）。
await fetch(`${ORIGIN}/api/projects/${PROJECT}/agent-sessions/${sessionId}/close`, {
  method: "POST",
}).catch(() => {});
process.exit(failed.length > 0 ? 1 : 0);
