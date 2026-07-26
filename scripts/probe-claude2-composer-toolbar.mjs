// 探针：验证 claude2 composer 卡片内 Stop/Send 的 isEmpty 同步、send 点击不丢焦、selectors
// 留卡片内（H1/H2/H3/H4 的 React/DOM 部分）。iOS 软键盘行为 Playwright 模拟不了，归真机；
// 本探针只验桌面可复现的 DOM 行为。
//
// 密码由脚本自读（env → config.toml → api 进程 environ），不进 agent 上下文、不打印值。
// 用法：node scripts/probe-claude2-composer-toolbar.mjs
import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const projectName = process.env.PROBE_PROJECT ?? "test";
const fakeSessionId = "agent_probe-composer-toolbar";

async function readPassword() {
  if (process.env.APP_PASSWORD) return { source: "env APP_PASSWORD" };
  const cfg = path.join(os.homedir(), ".agents-remote", "config.toml");
  try {
    const txt = await readFile(cfg, "utf8");
    const m = txt.match(/^app_password\s*=\s*["']([^"']*)["']/m);
    if (m && m[1]) return { source: cfg };
  } catch {}
  try {
    const pid = execSync(
      "ss -ltnp 2>/dev/null | grep ':43011' | grep -oP 'pid=\\K[0-9]+' | head -1",
      { encoding: "utf8" },
    ).trim();
    if (pid) {
      const env = await readFile(`/proc/${pid}/environ`, "utf8");
      if (env.split("\0").some((e) => e.startsWith("APP_PASSWORD=")))
        return { source: `/proc/${pid}/environ` };
    }
  } catch {}
  throw new Error(
    "未找到 APP_PASSWORD（env / ~/.agents-remote/config.toml / api 进程 environ 均无）。请 APP_PASSWORD=xxx node scripts/probe-claude2-composer-toolbar.mjs",
  );
}

async function setupMocks(page) {
  const session = {
    id: fakeSessionId,
    projectName,
    provider: "claude2",
    displayName: "Probe Agent",
    status: "idle",
    createdAt: new Date().toISOString(),
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
      body: JSON.stringify({
        projectNames: [projectName],
        candidates: [
          {
            type: "agent",
            projectName,
            sessionId: fakeSessionId,
            displayName: "Probe Agent",
            status: "idle",
            provider: "claude2",
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    }),
  );
  // WS 路由真实 server（fake session 不存在 → error，但页面不崩，chatInput 仍渲染）。
  await page.routeWebSocket(/claude2-stream/, (ws) => ws.connectToServer());
}

async function probe(browser, label, contextOptions) {
  const ctx = await browser.newContext(contextOptions);
  const page = await ctx.newPage();
  await setupMocks(page);
  const sentFrames = [];
  page.on("websocket", (ws) => {
    ws.on("framesent", (f) => sentFrames.push(String(f.payload)));
  });

  const pw = (await readPassword()).source; // 只用 source 标记，不取 value 进日志
  await page.goto(`${WEB_ORIGIN}/`);
  await page.getByLabel("Password").fill(process.env.APP_PASSWORD ?? (await readRawPassword()));
  await page.getByRole("button", { name: "Unlock console" }).click();
  await page.goto(`${WEB_ORIGIN}/projects/${projectName}/agent-sessions/${fakeSessionId}/claude2`);

  const textarea = page.locator("[data-composer-float] textarea").first();
  await textarea.waitFor({ state: "visible", timeout: 15000 });

  const coarse = await page.evaluate(() => window.matchMedia("(pointer: coarse)").matches);
  console.log(`[${label}] (pointer: coarse) = ${coarse}  (密码源: ${pw})`);

  await textarea.focus();
  await page.waitForTimeout(120);
  const boxBefore = await textarea.boundingBox();
  await textarea.fill("hi");
  await page.waitForTimeout(180);
  const boxAfter = await textarea.boundingBox();
  const jump = Math.abs((boxAfter?.y ?? 0) - (boxBefore?.y ?? 0));
  console.log(
    `[${label}] 输入"hi"前后 textarea Y 跳变 = ${jump.toFixed(1)}px (before=${boxBefore?.y.toFixed(1)} after=${boxAfter?.y.toFixed(1)})`,
  );

  const sendBtn = page.locator(
    '[data-composer-float] button[aria-label="Send"], [data-composer-float] button[aria-label="发送"]',
  );
  const sendCount = await sendBtn.count();
  console.log(`[${label}] focus+输入"hi"后 sendButton count = ${sendCount}`);

  // 卡片内底行 selectors 计数：回退后 selectors 恒留卡片内底行（不再移出到外部工具栏）。
  // 统计卡片边框 div 内（含 textarea）的 Model/Perm/Effort selector trigger 数。
  const floatRoot = page.locator("[data-composer-float]");
  const cardBorder = floatRoot.locator("div.rounded-xl, .rounded-xl").first();
  const cardSelectorCount = await cardBorder
    .locator("button[aria-haspopup]")
    .count()
    .catch(() => 0);
  console.log(`[${label}] 获焦后 卡片内 selector trigger 数 = ${cardSelectorCount}（3=留卡片内）`);

  let focusedAfterClick = null;
  let sendCountAfterClick = null;
  let userFrameSent = null;
  if (sendCount > 0) {
    await sendBtn.first().click();
    await page.waitForTimeout(200);
    focusedAfterClick = await page.evaluate(
      () => !!document.activeElement && document.activeElement.tagName === "TEXTAREA",
    );
    sendCountAfterClick = await sendBtn.count();
    userFrameSent = sentFrames.some((f) => f.includes('"type":"user"'));
    console.log(
      `[${label}] 点send后: textarea保焦=${focusedAfterClick}  sendButton仍在=${sendCountAfterClick}  WS user帧已发=${userFrameSent}`,
    );
  }

  await ctx.close();
  return {
    label,
    coarse,
    sendCount,
    cardSelectorCount,
    focusedAfterClick,
    sendCountAfterClick,
    userFrameSent,
    jump,
  };
}

async function readRawPassword() {
  if (process.env.APP_PASSWORD) return process.env.APP_PASSWORD;
  const cfg = path.join(os.homedir(), ".agents-remote", "config.toml");
  try {
    const txt = await readFile(cfg, "utf8");
    const m = txt.match(/^app_password\s*=\s*["']([^"']*)["']/m);
    if (m && m[1]) return m[1];
  } catch {}
  const pid = execSync(
    "ss -ltnp 2>/dev/null | grep ':43011' | grep -oP 'pid=\\K[0-9]+' | head -1",
    { encoding: "utf8" },
  ).trim();
  if (pid) {
    const env = await readFile(`/proc/${pid}/environ`, "utf8");
    const entry = env.split("\0").find((e) => e.startsWith("APP_PASSWORD="));
    if (entry) return entry.slice("APP_PASSWORD=".length);
  }
  throw new Error("password not found");
}

(async () => {
  const browser = await chromium.launch();
  try {
    const desktop = await probe(browser, "desktop", {});
    const mobile = await probe(browser, "mobile", {
      isMobile: true,
      hasTouch: true,
      viewport: { width: 390, height: 844 },
    });

    console.log("\n=== 判定 ===");
    // H3: 桌面 coarse=false 且输入后无独立 Send（桌面 Enter=发送，isCoarsePointer=false → showSend=false）
    const h3 = desktop.coarse === false && desktop.sendCount === 0;
    console.log(
      `H3 桌面无独立 Send: ${h3 ? "PASS" : "FAIL"} (coarse=${desktop.coarse}, sendCount=${desktop.sendCount})`,
    );
    // H2: mobile coarse=true 且 focus+输入后卡片内 sendButton 渲染（hasInput && isCoarsePointer → showSend）
    const h2 = mobile.coarse === true && mobile.sendCount === 1;
    console.log(
      `H2 mobile hasInput 触发卡片内 Send: ${h2 ? "PASS" : "FAIL"} (coarse=${mobile.coarse}, sendCount=${mobile.sendCount})`,
    );
    // H1: 点 send 后 textarea 保焦（onMouseDown preventDefault 阻止焦点转移→键盘不收）+ sendButton
    // 消失（composer.send() → onNew → 清空输入 → isEmpty=true → hasInput=false → showSend=false）。
    const h1 = mobile.focusedAfterClick === true && mobile.sendCountAfterClick === 0;
    console.log(
      `H1 send点击不丢焦点+send触发清空: ${h1 ? "PASS" : "FAIL"} (保焦=${mobile.focusedAfterClick}, 点后sendCount=${mobile.sendCountAfterClick})`,
    );
    // H1b: 输入时发送按钮出现，textarea Y 位置不变（卡片底行恒渲染，高度稳定，不顶起底部锚定的 float）
    const h1b = mobile.jump < 1;
    console.log(
      `H1b 发送按钮出现不导致textarea跳变: ${h1b ? "PASS" : "FAIL"} (跳变=${mobile.jump.toFixed(1)}px)`,
    );
    // H4: selectors 恒留卡片内底行（不再移出到外部工具栏）——3 个 selector trigger 在卡片边框内
    const h4 = mobile.cardSelectorCount === 3;
    console.log(
      `H4 selectors 留卡片内: ${h4 ? "PASS" : "FAIL"} (卡片内selector=${mobile.cardSelectorCount})`,
    );
    if (mobile.userFrameSent !== null) {
      console.log(
        `   (链路) onNew→sendToSocket→WS user帧: ${mobile.userFrameSent ? "PASS" : "未捕到（WS 可能未 open，不影响 H1 DOM 判定）"}`,
      );
    }
  } finally {
    await browser.close();
  }
})();
