// MCP Apps 画布卡浏览器探针：真实 Chromium 内验证 create/read/apply/export 四工具
// → 同一张 canvas-doc 卡渲染 → excalidraw 挂载 → 首画可用（autoFocusFrame）→
// 600ms 防抖 commit_scene（payload 断言）→ agent 推送刷新（echo 抑制零回声
// commit）→ REVISION_CONFLICT 过期重载链。REST/WS 全 mock，零真实会话依赖。
// 单测（jsdom）不执行 srcdoc 内脚本——excalidraw 挂载与反向通道只有真浏览器能断言。
//
// 跑法：systemd-run --scope --user -p MemoryMax=2G bun scripts/probe-mcp-app-canvas.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";
import { HUB_UI_RESOURCES } from "../api/src/mcp-hub-server.ts";

const ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const projectName = "test";
const sessionId = "agent_probe-canvas";
const CANVAS_HTML = HUB_UI_RESOURCES["ui://ar-hub/canvas"]?.html;

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
/** CallToolResult 形状（web fetchJson → reply 原样回 frame）。 */
const toolResult = (structuredContent) =>
  json({ content: [{ type: "text", text: "ok" }], structuredContent });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** 轮询到条件成立或超时（防抖/网络时序不做固定 sleep 硬等）。 */
const waitFor = async (fn, timeoutMs = 4000, stepMs = 60) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fn()) return true;
    await sleep(stepMs);
  }
  return fn();
};

// ── 0. 模板静态断言（HUB_UI_RESOURCES 直取,单源表） ─────────────────────────
if (!CANVAS_HTML) {
  console.error("FAIL: ui://ar-hub/canvas 模板缺失");
  process.exit(1);
}
assert(
  "canvas template inlines excalidraw bundle (>1MB)",
  CANVAS_HTML.length > 1_000_000,
  `${(CANVAS_HTML.length / 1024 / 1024).toFixed(1)}MB`,
);
assert(
  "canvas CSP allows blob: images + data: fonts",
  CANVAS_HTML.includes("img-src https: data: blob:") && CANVAS_HTML.includes("font-src data:"),
);
assert(
  "canvas template binds commit_scene + ARCanvasBundle",
  CANVAS_HTML.includes('"commit_scene"') && CANVAS_HTML.includes("ARCanvasBundle"),
);

// ── 会话 fixture 与 mock ────────────────────────────────────────────────────
// 元素带 excalidraw 默认值的显式形态：sceneKey 指纹取 id+几何+样式 17 字段,
// 缺省字段会被 excalidraw restore 补默认值 → 指纹误判变化 → 空转 commit。
const rect = (id, x, y, width, height) => ({
  type: "rectangle",
  id,
  x,
  y,
  width,
  height,
  angle: 0,
  strokeColor: "#1e1e1e",
  backgroundColor: "transparent",
  fillStyle: "hachure",
  strokeWidth: 2,
  strokeStyle: "solid",
  roughness: 1,
  opacity: 100,
  text: "",
  fontSize: 20,
  points: [],
});
const sceneV3 = {
  kind: "canvas-doc",
  id: "canvas-probe1",
  title: "探针画布",
  revision: 3,
  elementCount: 2,
  elements: [rect("el-a", 80, 80, 140, 90), rect("el-b", 260, 160, 100, 70)],
};
// 冲突重载后的服务端版本（r7,agent 改过 + 新元素）。
const sceneV7 = {
  kind: "canvas-doc",
  id: "canvas-probe1",
  title: "探针画布",
  revision: 7,
  elementCount: 3,
  elements: [
    { type: "rectangle", id: "el-a", x: 80, y: 80, width: 200, height: 90 },
    { type: "rectangle", id: "el-b", x: 260, y: 160, width: 100, height: 70 },
    { type: "diamond", id: "el-c", x: 400, y: 60, width: 90, height: 90 },
  ],
};

const browser = await chromium.launch();
const page = await browser.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));
await page.addInitScript(() => localStorage.setItem("lang", "zh"));

const hubCalls = [];
let commitShouldConflict = false;
// read_scene 返回值可切换：冲突重载段回 sceneV7;truncated 守卫段故意回
// truncated 面——验证守卫斩断 truncated→read→又 truncated 请求循环。
let readSceneResponse = sceneV7;
await page.route(/\/api\/projects\/test\/mcp-hub-tools-call/, async (r) => {
  const body = r.request().postDataJSON();
  hubCalls.push(body);
  if (body.name === "read_scene") {
    await r.fulfill(toolResult(readSceneResponse));
    return;
  }
  if (body.name === "commit_scene") {
    if (commitShouldConflict) {
      await r.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "PROJECT_CANVAS_REVISION_CONFLICT", message: "revision conflict" },
        }),
      });
      return;
    }
    await r.fulfill(
      toolResult({
        kind: "canvas-doc",
        id: "canvas-probe1",
        title: "探针画布",
        // revision = expectedRevision + 1（恒 4 会让 reload 后 docRevision 倒退）;
        // elements 回提交原样（服务端存提交元素;缺 elements 会让模板指纹基线
        // 不更新 → settle onChange 被误判成新编辑 → 空转 commit）。
        revision: (body.arguments?.expectedRevision ?? 0) + 1,
        elementCount: (body.arguments?.elements ?? []).length,
        elements: body.arguments?.elements ?? [],
      }),
    );
    return;
  }
  await r.fulfill({
    status: 404,
    contentType: "application/json",
    body: JSON.stringify({ error: { code: "X", message: "no" } }),
  });
});
await page.route(/\/api\/projects\/test\/mcp-ui-resource/, (r) =>
  r.fulfill(json({ mimeType: "text/html;profile=mcp-app", html: CANVAS_HTML })),
);
await page.route(new RegExp(`/api/projects/${projectName}/agent-sessions/${sessionId}$`), (r) =>
  r.fulfill(
    json({
      session: {
        id: sessionId,
        project: projectName,
        provider: "claude",
        displayName: "Canvas Probe",
        status: "running",
        createdAt: "2026-10-22T00:00:00.000Z",
      },
      availableModels: ["sonnet"],
      availablePermissionModes: ["default"],
    }),
  ),
);

let socket;
await page.routeWebSocket(/claude-stream/, (ws) => {
  socket = ws;
});
await page.goto(`${ORIGIN}/projects/${projectName}/session/${sessionId}`);
// 登录（auth 层）：首次 goto 落 /login，填密码（自读不打印）后回会话页。
const pwInput = await page
  .waitForSelector('input[type="password"]', { timeout: 4000 })
  .catch(() => null);
if (pwInput !== null) {
  await page.getByLabel("访问密码").fill(await readAppPassword());
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForTimeout(1500);
  await page.goto(`${ORIGIN}/projects/${projectName}/session/${sessionId}`);
}
await page.waitForTimeout(1200);
if (!socket) {
  console.error("FAIL: claude-stream WS 未建立 —", page.url(), pageErrors.slice(0, 3).join(" | "));
  await browser.close();
  process.exit(1);
}
socket.send(JSON.stringify({ type: "session_init", resume: false }));
await sleep(600);

// agent 调 create_diagram：tool_use + user envelope（structuredContent = scene v3）。
socket.send(
  JSON.stringify({
    type: "assistant",
    uuid: "uuid-canvas-1",
    message: {
      role: "assistant",
      content: [
        { type: "text", text: "好的，我来创建画布。" },
        {
          type: "tool_use",
          id: "tu-canvas-1",
          name: "mcp__ar-hub__create_diagram",
          input: { title: "探针画布" },
        },
      ],
    },
  }),
);
socket.send(
  JSON.stringify({
    type: "user",
    message: {
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "tu-canvas-1", content: "ok" }],
    },
    tool_use_result: { type: "tool_result", structuredContent: sceneV3 },
  }),
);
await sleep(2500);
// mount 后首轮 onChange 可迟于 echo 窗到达（excalidraw 初始化数百 ms）——等它静默
// （1s 无新 commit）再做首画断言,否则 settle commit 会冒充首画 commit。
await (async () => {
  let n = 0;
  for (;;) {
    const c = hubCalls.filter((x) => x.name === "commit_scene").length;
    if (c === n) break;
    n = c;
    await sleep(1000);
  }
})();
// ── 1. 宿主渲染链 ───────────────────────────────────────────────────────────
assert("badge 画布 rendered", (await page.getByText("画布", { exact: true }).count()) >= 1);
const frames = page.locator('iframe[data-testid="mcp-app-frame"]');
assert("card iframe renders", (await frames.count()) === 1);
assert(
  "iframe height reported & clamped",
  await frames.first().evaluate((el) => {
    const h = Number.parseFloat(el.style.height);
    return Number.isFinite(h) && h > 120 && h <= 420;
  }),
);
const expandBtn = page.getByRole("button", { name: "放大查看" });
assert("expand button present", (await expandBtn.count()) === 1);

// ── 2. frame 内 excalidraw 挂载 + meta ──────────────────────────────────────
let frame = null;
for (const f of page.frames()) {
  if (f !== page.mainFrame() && (await f.locator("#exc-root").count()) > 0) frame = f;
}
assert("srcdoc frame with exc-root found", frame !== null);
if (!frame) {
  console.error("pageErrors:", pageErrors.slice(0, 5).join(" | "));
  await browser.close();
  process.exit(1);
}
const excMounted = await frame
  .locator("#exc-root .excalidraw")
  .waitFor({ timeout: 8000 })
  .then(() => true)
  .catch(() => false);
assert("excalidraw mounted in frame", excMounted);
if (!excMounted) {
  console.error("[diag] pageErrors:", pageErrors.slice(0, 4).join("\n---\n") || "(none)");
}
const metaV3 = await frame
  .locator("#meta")
  .textContent()
  .catch(() => "");
assert("meta shows r3 · 2 elements", metaV3 === "r3 · 2 个元素", JSON.stringify(metaV3));

// ── 3. 首画可用（autoFocusFrame 修复路径）→ 防抖 commit ────────────────────
// 画布几何 → page 视口坐标。frame 元素 boundingBox 已是 page 视口坐标（勿再
// 叠 iframe 元素的 box——双倍偏移会让工具点击与拖画落进画布中央,框选冒充首画）。
const excBox = await frame.locator("#exc-root").boundingBox();
const baseX = excBox.x;
const baseY = excBox.y;
const toolBox = await frame.locator('[data-testid="toolbar-rectangle"]').boundingBox();
await page.mouse.click(toolBox.x + toolBox.width / 2, toolBox.y + toolBox.height / 2);
await page.mouse.move(baseX + 60, baseY + 40);
await page.mouse.down();
await page.mouse.move(baseX + 150, baseY + 120, { steps: 6 });
await page.mouse.up();
// 600ms 防抖 → POST commit_scene。
const commitArrived = await waitFor(() => hubCalls.some((c) => c.name === "commit_scene"), 3000);
assert(
  "first draw → commit_scene called (autoFocusFrame path)",
  commitArrived,
  `hubCalls=${hubCalls.map((c) => c.name).join(",")}`,
);
const commitCall = hubCalls.find((c) => c.name === "commit_scene");
const args = commitCall?.arguments ?? {};
assert(
  "commit payload: expectedRevision=3 + web- operationId + 3 elements",
  args.expectedRevision === 3 &&
    typeof args.operationId === "string" &&
    args.operationId.startsWith("web-") &&
    Array.isArray(args.elements) &&
    args.elements.length === 3,
  JSON.stringify({ rev: args.expectedRevision, op: args.operationId, n: args.elements?.length }),
);
// 成功响应 → revision 更新到 4。
await sleep(400);
const metaV4 = await frame
  .locator("#meta")
  .textContent()
  .catch(() => "");
assert("meta updates to r4 after commit", metaV4.startsWith("r4"), JSON.stringify(metaV4));

// ── 4. agent 局部改（apply_operations 工具帧）→ echo 抑制零回声 commit ──────
const callsBeforeEcho = hubCalls.length;
socket.send(
  JSON.stringify({
    type: "assistant",
    uuid: "uuid-canvas-2",
    message: {
      role: "assistant",
      content: [
        {
          type: "tool_use",
          id: "tu-canvas-2",
          name: "mcp__ar-hub__apply_operations",
          input: { id: "canvas-probe1" },
        },
      ],
    },
  }),
);
socket.send(
  JSON.stringify({
    type: "user",
    message: {
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "tu-canvas-2", content: "ok" }],
    },
    tool_use_result: {
      type: "tool_result",
      structuredContent: {
        ...sceneV3,
        revision: 5,
        elementCount: 3,
        elements: [...sceneV3.elements, rect("el-c", 400, 60, 90, 90)],
      },
    },
  }),
);
await sleep(900);
// 「卡刷新」语义 = apply 消息渲染成第二张卡（新 tool_use id → 新卡）显最新场景;
// 原卡是独立实例不随其它工具消息变化（双编辑由 stale note + 冲突重载兜底）。
assert(
  "apply message renders a second card",
  (await frames.count()) === 2,
  `frames=${await frames.count()}`,
);
const metaV5 = await frames
  .nth(1)
  .contentFrame()
  .locator("#meta")
  .textContent()
  .catch(() => "");
assert(
  "second card meta shows r5 · 3 elements",
  metaV5.startsWith("r5 · 3"),
  JSON.stringify(metaV5),
);
const echoCommits = hubCalls
  .slice(callsBeforeEcho)
  .filter(
    (c) =>
      c.name === "commit_scene" &&
      (c.arguments?.expectedRevision === 4 || c.arguments?.expectedRevision === 5),
  );
assert(
  "echo suppression: no echo commit from either card (rev 4/5)",
  echoCommits.length === 0,
  `echoCommits=${echoCommits.length}`,
);

// ── 5. REVISION_CONFLICT → note + read_scene 重载 ───────────────────────────
commitShouldConflict = true;
const readCallsBefore = hubCalls.filter((c) => c.name === "read_scene").length;
// 第二卡插入后消息列表增长,第一卡被推出视口（实测 y≈-424）——先滚回视口
// 再量坐标,否则 mouse 全部落空。
await frame.locator("#exc-root").evaluate((el) => el.scrollIntoView({ block: "center" }));
await sleep(300);
const excBox2 = await frame.locator("#exc-root").boundingBox();
// 工具切换:0.18 tool button 是隐藏 radio input(ToolIcon_type_radio),
// 真实命中靠外层 label——双卡+滚动语境下 mouse click 时序敏感,DOM click()
// 直接触发 radio 的 change 走 React 切工具,零几何/焦点依赖。
await frame.locator('[data-testid="toolbar-rectangle"]').evaluate((el) => el.click());
await sleep(150);
// 焦点归还:第二卡 onLoad autoFocusFrame 抢走焦点后,拖画 down = 第一卡
// iframe 重新获焦瞬间 → excalidraw 的 maybeCleanupAfterMissingPointerUp
// 把按下态清成 up → 首次拖画失效(M2.0「首次点击获焦」坑的双卡变体)。
// 先把焦点还给第一卡——等价真实用户「先点一下卡片再画」的动作顺序。
await page.locator('iframe[data-testid="mcp-app-frame"]').first().focus();
await sleep(100);
// 落点必须避开顶部悬浮工具栏(excalidraw 0.18 的 tools 按钮层在 y<50,
// x=600/y=40 曾命中 freedraw 按钮图标,拖画全在工具栏滑过)——y=130 起
// 落在画布空白区,右侧 x>600 无既有元素。
await page.mouse.move(excBox2.x + 620, excBox2.y + 130);
await page.mouse.down();
await page.mouse.move(excBox2.x + 760, excBox2.y + 210, { steps: 6 });
await page.mouse.up();
const conflictCommitArrived = await waitFor(
  () => hubCalls.filter((c) => c.name === "commit_scene").length >= 2,
  3000,
);
assert("second draw → second commit_scene", conflictCommitArrived);
const reloadArrived = await waitFor(
  () => hubCalls.filter((c) => c.name === "read_scene").length > readCallsBefore,
  3000,
);
assert(
  "conflict → auto read_scene reload",
  reloadArrived,
  `readCalls=${hubCalls.filter((c) => c.name === "read_scene").length}`,
);
const metaV7 = await frame
  .locator("#meta")
  .textContent()
  .catch(() => "");
assert(
  "stale note + reloaded to r7",
  metaV7.includes("已重新加载") && metaV7.startsWith("r7"),
  JSON.stringify(metaV7),
);
// 冲突处理完毕——后续段恢复正常 commit 语义（不复位则后续 commit 全 409）。
commitShouldConflict = false;
assert(
  // 首画 1 + 第二卡 mount settle 逃窗 0-1（时序相关,非回声语义）+ 二画 1。
  "no commit retry storm after conflict",
  hubCalls.filter((c) => c.name === "commit_scene").length <= 3,
  `commits=${hubCalls.filter((c) => c.name === "commit_scene").length}`,
);

// ── 6. truncated face → read_scene 守卫（响应又 truncated 时斩断请求循环） ──
// 第三卡 mount(truncated) → requestFullScene → mock 故意回 truncated 面 →
// render → applyRemoteScene → requestFullScene → fullSceneFetchedRevision 守卫
// 挡 → read_scene 不再增长。无守卫的旧模板这里会无限循环打爆 mock。
readSceneResponse = {
  kind: "canvas-doc",
  id: "canvas-probe1",
  title: "探针画布",
  revision: 9,
  elementCount: 3,
  truncated: true,
  elements: [],
};
const readCallsBeforeTrunc = hubCalls.filter((c) => c.name === "read_scene").length;
socket.send(
  JSON.stringify({
    type: "assistant",
    uuid: "uuid-canvas-3",
    message: {
      role: "assistant",
      content: [
        {
          type: "tool_use",
          id: "tu-canvas-3",
          name: "mcp__ar-hub__read_scene",
          input: { id: "canvas-probe1" },
        },
      ],
    },
  }),
);
socket.send(
  JSON.stringify({
    type: "user",
    message: {
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "tu-canvas-3", content: "ok" }],
    },
    tool_use_result: {
      type: "tool_result",
      structuredContent: {
        kind: "canvas-doc",
        id: "canvas-probe1",
        title: "探针画布",
        revision: 9,
        elementCount: 3,
        truncated: true,
        elements: [],
      },
    },
  }),
);
await sleep(2500);
assert(
  "truncated face renders a third card",
  (await frames.count()) === 3,
  `frames=${await frames.count()}`,
);
const metaTrunc = await frames
  .nth(2)
  .contentFrame()
  .locator("#meta")
  .textContent()
  .catch(() => "");
assert(
  "truncated meta shows r9 + fetch note",
  metaTrunc.startsWith("r9") && metaTrunc.includes("元素过多"),
  metaTrunc,
);
await sleep(1500);
assert(
  "guard breaks the fetch loop: read_scene stays at +1",
  hubCalls.filter((c) => c.name === "read_scene").length === readCallsBeforeTrunc + 1,
  `readCalls=${hubCalls.filter((c) => c.name === "read_scene").length}`,
);

// ── 7. 选区引用循环（M3）：选中 → 引用 → chip → 发送注入 prompt ─────────────
// 上行帧收集（routeWebSocket 的 onMessage 拦 client→server 帧）。
const sentUserFrames = [];
socket.onMessage((data) => sentUserFrames.push(String(data)));
// 冲突重载后第一卡 = r7：el-a (80,80,200,90)。选中走调试口 selectElements：
// CDP 合成点击在多卡 iframe 获焦竞态下 up 丢失（cursorButton 冻结 down、选中
// 落在幽灵 id 上,焦点归还/空白点击/分离 down-up 均实测无效）——真实点击路径的
// 真机验证留真机清单。API 选中走 excalidraw 正常 onChange → syncSelection →
// 模板回调,数据链路与真实点击同管道。
await frame.locator("#exc-root").evaluate((el) => el.scrollIntoView({ block: "center" }));
await sleep(300);
await frame.evaluate(() => {
  window.__arCanvasCtrl?.selectElements(["el-a"]);
});
// 调试口转正断言：API 选中后 bundle 侧 selectedIds 必含 el-a（syncSelection 管道）。
const selectedOk = await waitFor(() =>
  frame
    .evaluate(() => window.__arCanvasCtrl?.getSelected().some((el) => el.id === "el-a") ?? false)
    .catch(() => false),
);
assert("selectElements marks el-a selected", selectedOk);
const citeBarShown = await waitFor(() =>
  frame
    .locator("#cite-bar")
    .evaluate((el) => !el.hidden)
    .catch(() => false),
);
assert("selecting an element shows the cite bar", citeBarShown);
// 点「引用」→ ui/update-model-context → 宿主写待发上下文 → composer chip 出现。
await frame.locator("#cite").evaluate((el) => el.click());
const sampleChip = async () => {
  const deadline = Date.now() + 8000;
  for (;;) {
    if ((await page.getByText("探针画布 · 1").count()) > 0) return true;
    if (Date.now() > deadline) return false;
    await sleep(120);
  }
};
const chipShown = await sampleChip();
assert("cite click → composer chip appears", chipShown);
// chip 移除（✕）→ 消失;再引用恢复（latest-wins 单槽）。
// 真实用户路径：✕ 是宿主按钮,点击让 iframe 失焦 → excalidraw blur 清选区 →
// 引用按钮被 handler 静默拒绝（无请求）。再引用必须重新点选元素——这不是
// 缺陷,是 excalidraw 选中态的自然生命周期,断言按此路径走。
await page
  .getByRole("button", { name: "移除画布选区" })
  .click()
  .catch(() => {});
await sleep(200);
assert("chip ✕ removes the pending context", (await page.getByText("探针画布 · 1").count()) === 0);
// chip 出现/消失改变 composer 高度 → 第一卡位置漂移——重选同样走调试口,
// 等引用条回来（✕ 宿主点击让 iframe 失焦 → excalidraw blur 清选区,与真机一致）。
await frame.evaluate(() => {
  window.__arCanvasCtrl?.selectElements(["el-a"]);
});
await waitFor(() =>
  frame
    .locator("#cite-bar")
    .evaluate((el) => !el.hidden)
    .catch(() => false),
);
await frame.locator("#cite").evaluate((el) => el.click());
const chipRestored = await sampleChip();
assert("re-cite restores the chip", chipRestored);
// composer 填文本 → 发送 → onNew 并入 [画布选区] 块 → WS user 帧 + chip 清槽。
await page.getByRole("textbox").fill("把选中的矩形改成蓝色");
await page.getByRole("button", { name: "发送" }).click();
const promptCarried = await waitFor(() =>
  sentUserFrames.some((f) => {
    try {
      const m = JSON.parse(f);
      return (
        m.type === "user" &&
        JSON.stringify(m.message?.content ?? []).includes("画布选区") &&
        JSON.stringify(m.message?.content ?? []).includes("el-a")
      );
    } catch {
      return false;
    }
  }),
);
assert("send → prompt carries the canvas selection block", promptCarried);
await waitFor(() => page.getByText("探针画布 · 1").count() === 0);
assert("chip cleared after send", (await page.getByText("探针画布 · 1").count()) === 0);

// ── 汇总 ────────────────────────────────────────────────────────────────────
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) process.exit(1);
