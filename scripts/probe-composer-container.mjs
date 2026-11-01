// 探针：composer 控制行显隐容器查询（2026-11-01 从视口 @media ≥1024 改定）。
// 修复点回归：宽视口（单栏，卡容器 ≥ 断点）pill 展开 → JS 压窄卡容器（模拟分屏）
// → .iicn 显 / .ipill 隐；恢复宽度 → 反转。另打印 pill 组完整展开所需最小卡宽
// （断点 640px 的校准数据，非断言）。
// 密码由脚本自读，不进 agent 上下文。用法：bun scripts/probe-composer-container.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";
import { verifyCssFlushed } from "./ar-verify-css.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const projectName = process.env.PROBE_PROJECT ?? "test";
const fakeSessionId = "agent_probe-composer-container";

const results = [];
const check = (label, ok, detail = "") => {
  results.push(ok);
  console.log(`[${ok ? "PASS" : "FAIL"}] ${label}${detail ? ` (${detail})` : ""}`);
};

async function setupMocks(page) {
  const session = {
    id: fakeSessionId,
    projectName,
    provider: "claude",
    displayName: "Probe Composer Container",
    status: "idle",
    permissionMode: "default",
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
            displayName: "Probe Composer Container",
            status: "idle",
            provider: "claude",
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    }),
  );
  // WS 全 mock（fake session 无真实 server）：open + pong 保持 connected（composer enabled）。
  await page.routeWebSocket(/claude-stream/, (ws) => {
    ws.onMessage((data) => {
      try {
        const msg = JSON.parse(String(data));
        if (msg.type === "ping") ws.send(JSON.stringify({ type: "pong" }));
      } catch {
        /* 非 JSON 帧忽略 */
      }
    });
  });
}

// 读卡容器几何 + 两形态 computed display。widthParam 供压窄/恢复后取实时态。
const readState = (page) =>
  page.evaluate(() => {
    const card = document.querySelector(".composer-card");
    const iicn = document.querySelector(".iicn:not(.gear)");
    const ipill = document.querySelector(".ipill");
    return {
      cardW: card ? card.getBoundingClientRect().width : null,
      iicnDisplay: iicn ? getComputedStyle(iicn).display : null,
      ipillDisplay: ipill ? getComputedStyle(ipill).display : null,
    };
  });

// 前置：CSS 落盘三道闸（composer-card 为本批新类锚——容器声明与 @container 规则落正文）。
const css = await verifyCssFlushed({ expectClasses: ["composer-card"], origin: WEB_ORIGIN });
if (!css.pass) {
  console.error(css.details.join("\n"));
  process.exit(1);
}

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "zh-CN",
  });
  const page = await ctx.newPage();
  await setupMocks(page);
  await page.goto(`${WEB_ORIGIN}/`);
  await page.getByLabel("访问密码").fill(await readAppPassword());
  await page.getByRole("button", { name: "登录" }).click();
  await page.getByLabel("访问密码").waitFor({ state: "detached", timeout: 15000 });
  await page.goto(`${WEB_ORIGIN}/projects/${projectName}/agent-sessions/${fakeSessionId}/claude`);
  await page.locator("[data-composer-float] textarea").first().waitFor({
    state: "visible",
    timeout: 15000,
  });
  await page.waitForTimeout(200);

  // 基线：宽视口（1440）单栏，卡容器 672（max-w-2xl 封顶）> 断点 → pill 展开。
  const base = await readState(page);
  check(
    "基线：宽视口卡容器 ≥ 断点 → .ipill 展开",
    base.cardW >= 512 && base.ipillDisplay !== "none" && base.iicnDisplay === "none",
    `cardW=${base.cardW?.toFixed(0)} ipill=${base.ipillDisplay} iicn=${base.iicnDisplay}`,
  );

  // 修复点：视口仍 1440，JS 压窄卡容器到断点下（模拟分屏 pane）→ icon 态。
  await page.evaluate(() => {
    document.querySelector(".composer-card").style.width = "400px";
  });
  await page.waitForTimeout(120);
  const narrow = await readState(page);
  check(
    "分屏回归：视口 1440 + 卡容器 400px → .iicn 显 / .ipill 隐",
    narrow.ipillDisplay === "none" && narrow.iicnDisplay === "flex",
    `cardW=${narrow.cardW?.toFixed(0)} ipill=${narrow.ipillDisplay} iicn=${narrow.iicnDisplay}`,
  );

  // 恢复宽度 → pill 态回来（双向切换）。
  await page.evaluate(() => {
    document.querySelector(".composer-card").style.width = "";
  });
  await page.waitForTimeout(120);
  const restored = await readState(page);
  check(
    "恢复卡宽 → .ipill 展开回 pill 态",
    restored.ipillDisplay !== "none" && restored.iicnDisplay === "none",
    `ipill=${restored.ipillDisplay} iicn=${restored.iicnDisplay}`,
  );

  // 断点校准数据：底行 flex row 的 max-content 宽 = pill 全组（左+右）+ gap + 行 padding
  // 的自然需求宽；再取该行 getBoundingClientRect 与 textarea 各自 min-width 兜底（非断言）。
  const need = await page.evaluate(() => {
    const row = document.querySelector(".composer-card div.flex.h-9");
    if (!row) return null;
    const prev = row.style.width;
    row.style.width = "max-content";
    const natural = row.getBoundingClientRect().width;
    row.style.width = prev;
    return natural;
  });
  console.log(
    `[校准] 底行 pill 全组自然需求宽（max-content）= ${need ? need.toFixed(0) : "n/a"}px（断点定值依据）`,
  );

  await ctx.close();
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} 断言通过`);
process.exit(failed > 0 ? 1 : 0);
