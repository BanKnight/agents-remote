// 探针：验证 claude2 composer 桌面 Enter 键行为 + 移动端回归保护。
//
// 桌面目标：plain Enter 发送（textarea 不换行）/ Shift+Enter 换行 / Mac Cmd+Enter 换行。
// 移动目标：plain Enter 换行 + 卡片内显式 Send 才发送（不应被本修复破坏）。
//
// 核心断言不依赖 send 是否成功——preventDefault 已阻止换行，与 send 路径无关。
// 密码由脚本自读（env → config.yaml → api 进程 environ），不进 agent 上下文、不打印值。
// 用法：node scripts/probe-claude2-composer-enter.mjs
import { chromium } from "@playwright/test";
import { readAppPassword, readAppPasswordSource } from "./lib/deploy-config.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const projectName = process.env.PROBE_PROJECT ?? "test";
const fakeSessionId = "agent_probe-composer-enter";

async function setupMocks(page) {
  const session = {
    id: fakeSessionId,
    projectName,
    provider: "claude2",
    displayName: "Probe Agent",
    status: "idle",
    createdAt: "2026-07-26T00:00:00.000Z",
  };
  const detail = {
    session,
    availableModels: ["sonnet", "opus", "haiku"],
    availablePermissionModes: ["default", "bypassPermissions"],
  };
  await page.route(
    new RegExp(`/api/projects/${projectName}/agent-sessions/${fakeSessionId}$`),
    (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(detail) }),
  );
  await page.route(new RegExp(`/api/projects/${projectName}/agent-sessions$`), (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sessions: [session] }),
    }),
  );
  await page.route(new RegExp("/api/overview$"), (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ projectNames: [projectName], candidates: [] }),
    }),
  );
  // WS 路由真实 server（fake session 不存在 → error，但 composer 仍渲染）。
  await page.routeWebSocket(/claude2-stream/, (ws) => ws.connectToServer());
}

// 在 textarea 上挂 bubble 阶段 keydown listener，记录我们的 handler 跑完后 e.defaultPrevented。
// bubble 在 React 合成 onKeyDown（也是 bubble）之后触发，所以 defaultPrevented 反映最终结果。
// 同时监听 form submit：库 handleKeyPress 走 requestSubmit → 触发 form submit 事件；我们的
// composer.send() 不经 form submit。借此区分 plain Enter 走的是"我们的分支"还是"库分支"。
async function attachKeydownTrace(page) {
  await page.evaluate(() => {
    const ta = document.querySelector("[data-composer-float] textarea");
    if (!ta) return;
    ta.addEventListener("keydown", (e) => {
      window.__lastKey = {
        key: e.key,
        shiftKey: e.shiftKey,
        metaKey: e.metaKey,
        ctrlKey: e.ctrlKey,
        defaultPrevented: e.defaultPrevented,
        valueBefore: ta.value,
      };
    });
    window.__formSubmitCount = 0;
    const form = ta.closest("form");
    if (form) form.addEventListener("submit", () => (window.__formSubmitCount += 1));
  });
}

async function pressAndRead(page, combo) {
  const submitBefore = await page.evaluate(() => window.__formSubmitCount ?? 0);
  await page.keyboard.press(combo);
  await page.waitForTimeout(80);
  const { value, submitAfter } = await page.evaluate(() => {
    const ta = document.querySelector("[data-composer-float] textarea");
    return { value: ta ? ta.value : null, submitAfter: window.__formSubmitCount ?? 0 };
  });
  const lastKey = await page.evaluate(() => window.__lastKey);
  return { value, lastKey, formSubmitFired: submitAfter > submitBefore };
}

async function probe(browser, label, contextOptions, isMac) {
  const ctx = await browser.newContext(contextOptions);
  const page = await ctx.newPage();
  await setupMocks(page);

  // 可选：把 navigator.platform 伪装成 Mac，测 Cmd+Enter 换行分支（isMac=true）。
  if (isMac) {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "platform", { get: () => "MacIntel" });
      Object.defineProperty(navigator, "userAgent", {
        get: () =>
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0",
      });
    });
  }

  const pw = await readAppPasswordSource();
  await page.goto(`${WEB_ORIGIN}/`);
  await page.getByLabel("Password").fill(await readAppPassword());
  await page.getByRole("button", { name: "Unlock console" }).click();
  await page.goto(`${WEB_ORIGIN}/projects/${projectName}/agent-sessions/${fakeSessionId}/claude2`);

  const textarea = page.locator("[data-composer-float] textarea").first();
  await textarea.waitFor({ state: "visible", timeout: 15000 });
  await attachKeydownTrace(page);

  const coarse = await page.evaluate(() => window.matchMedia("(pointer: coarse)").matches);
  const platform = await page.evaluate(() => navigator.platform);
  console.log(`[${label}] (pointer:coarse)=${coarse}  platform=${platform}  (密码源: ${pw})`);

  const results = {};

  // 桌面 plain Enter：应发送，不换行。
  await textarea.focus();
  await textarea.fill("hi");
  results.plainEnter = await pressAndRead(page, "Enter");
  console.log(
    `[${label}] plain Enter: value=${JSON.stringify(results.plainEnter.value)} 含\\n=${results.plainEnter.value.includes("\n")} formSubmit=${results.plainEnter.formSubmitFired}`,
  );

  // Shift+Enter：应换行。
  await textarea.focus();
  await textarea.fill("hi");
  results.shiftEnter = await pressAndRead(page, "Shift+Enter");
  console.log(
    `[${label}] Shift+Enter: value=${JSON.stringify(results.shiftEnter.value)} 含\\n=${results.shiftEnter.value.includes("\n")}`,
  );

  // Cmd+Enter（仅 Mac label）：应换行。
  if (isMac) {
    await textarea.focus();
    await textarea.fill("hi");
    results.cmdEnter = await pressAndRead(page, "Meta+Enter");
    console.log(
      `[${label}] Cmd+Enter: value=${JSON.stringify(results.cmdEnter.value)} 含\\n=${results.cmdEnter.value.includes("\n")} defaultPrevented=${results.cmdEnter.lastKey?.defaultPrevented}`,
    );
  }

  // Send 按钮存在性（移动端回归保护：有输入时应存在 Send）。
  const sendBtn = page.locator(
    '[data-composer-float] button[aria-label="Send"], [data-composer-float] button[aria-label="发送"]',
  );
  await textarea.focus();
  await textarea.fill("hi");
  await page.waitForTimeout(100);
  results.sendCount = await sendBtn.count();
  console.log(`[${label}] 输入"hi"后 Send 按钮数=${results.sendCount}`);

  await ctx.close();
  return { label, coarse, ...results };
}

(async () => {
  const browser = await chromium.launch();
  try {
    const desktop = await probe(browser, "desktop", {}, false);
    const desktopMac = await probe(browser, "desktop-mac", {}, true);
    // 决定性 case：复现用户环境——误报触屏（hasTouch → coarse=true）的宽屏台式机（1440≥1024）。
    // 期望：判为桌面 composer → plain Enter 发送（不换行）、无 ↑ Send 按钮。
    const coarseDesktop = await probe(
      browser,
      "coarse-desktop",
      { hasTouch: true, viewport: { width: 1440, height: 900 } },
      false,
    );
    const mobile = await probe(
      browser,
      "mobile",
      { isMobile: true, hasTouch: true, viewport: { width: 390, height: 844 } },
      false,
    );

    console.log("\n=== 判定 ===");
    // D1: 桌面 plain Enter 不换行（preventDefault 生效，走 send 分支）。
    const d1 = !desktop.plainEnter.value.includes("\n");
    console.log(
      `D1 桌面 plain Enter 不换行(=发送): ${d1 ? "PASS" : "FAIL"} (value=${JSON.stringify(desktop.plainEnter.value)}, formSubmit=${desktop.plainEnter.formSubmitFired})`,
    );
    // D2: 桌面 Shift+Enter 换行。
    const d2 = desktop.shiftEnter.value.includes("\n");
    console.log(
      `D2 桌面 Shift+Enter 换行: ${d2 ? "PASS" : "FAIL"} (value=${JSON.stringify(desktop.shiftEnter.value)})`,
    );
    // D3: Mac Cmd+Enter 换行。
    const d3 = desktopMac.cmdEnter?.value.includes("\n");
    console.log(
      `D3 Mac Cmd+Enter 换行: ${d3 ? "PASS" : "FAIL"} (value=${JSON.stringify(desktopMac.cmdEnter?.value)}, defaultPrevented=${desktopMac.cmdEnter?.lastKey?.defaultPrevented})`,
    );
    // D4: 桌面无 Send 按钮（Enter=发送，isCoarsePointer=false → showSend=false）。
    const d4 = desktop.sendCount === 0;
    console.log(`D4 桌面无 Send 按钮: ${d4 ? "PASS" : "FAIL"} (sendCount=${desktop.sendCount})`);

    // M1: 移动 plain Enter 换行（回归保护）。
    const m1 = mobile.plainEnter.value.includes("\n");
    console.log(
      `M1 移动 plain Enter 换行(回归保护): ${m1 ? "PASS" : "FAIL"} (value=${JSON.stringify(mobile.plainEnter.value)})`,
    );
    // M2: 移动有输入时 Send 存在（回归保护）。
    const m2 = mobile.sendCount === 1;
    console.log(
      `M2 移动 Send 按钮存在(回归保护): ${m2 ? "PASS" : "FAIL"} (sendCount=${mobile.sendCount})`,
    );

    // C1: 误报触屏的宽屏台式机（用户环境）plain Enter 不换行（=发送）——核心修复。
    const c1 = !coarseDesktop.plainEnter.value.includes("\n");
    console.log(
      `C1 误报触屏宽屏台式机 plain Enter 不换行(=发送): ${c1 ? "PASS" : "FAIL"} (coarse=${coarseDesktop.coarse}, value=${JSON.stringify(coarseDesktop.plainEnter.value)}, formSubmit=${coarseDesktop.plainEnter.formSubmitFired})`,
    );
    // C2: 该环境无 ↑ Send 按钮（判为桌面 → showSend=false）。
    const c2 = coarseDesktop.sendCount === 0;
    console.log(
      `C2 误报触屏宽屏台式机无 Send 按钮: ${c2 ? "PASS" : "FAIL"} (coarse=${coarseDesktop.coarse}, sendCount=${coarseDesktop.sendCount})`,
    );

    const allPass = d1 && d2 && d3 && d4 && m1 && m2 && c1 && c2;
    console.log(`\n总计: ${allPass ? "ALL PASS" : "有 FAIL"}`);
    process.exit(allPass ? 0 : 1);
  } finally {
    await browser.close();
  }
})();
