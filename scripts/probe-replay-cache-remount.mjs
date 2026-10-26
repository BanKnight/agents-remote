// 探针：跨 remount 增量回放恢复（claude-replay-cache，2026-10-26）。验证真实链路
// （真实 relay + 真实 localStorage，零 mock）：
//   首连全量 → 落盘缓存 → 切走（unmount flush）→ 切回 = 恢复窗口即刻呈现 +
//   WS URL 带 ?since=<窗口尾锚> → 服务端 relay 日志 replay=delta（只补增量）。
// 对照 probe-claude-reconnect-delta.mjs（连接级重连，mock WS）；本探针补「跨 remount
// （整页 reload）+ 真实服务端」证据。会话只读复用 test 项目既有会话，零副作用。
//
// 密码由脚本自读，不进 agent 上下文。用法：bun scripts/probe-replay-cache-remount.mjs
import { execSync } from "node:child_process";
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const projectName = process.env.PROBE_PROJECT ?? "test";
const sessionId = process.env.PROBE_SESSION ?? "agent_8edb4fb6fca3497d";

const cacheKey = `claudeReplayCache:${encodeURIComponent(projectName)}/${encodeURIComponent(sessionId)}`;
const pageUrl = `${WEB_ORIGIN}/projects/${projectName}/session/${sessionId}`;

let pass = 0;
let fail = 0;
function check(label, ok, detail) {
  const suffix = detail ? `  (${detail})` : "";
  console.log(ok ? `PASS ${label}${suffix}` : `FAIL ${label}${suffix}`);
  if (ok) pass += 1;
  else fail += 1;
}

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const wsUrls = [];
  page.on("websocket", (ws) => {
    if (ws.url().includes("claude-stream")) wsUrls.push(ws.url());
  });

  // 登录一次（cookie 在 ctx 内，后续 goto 复用）。
  await page.goto(`${WEB_ORIGIN}/`);
  await page.getByLabel("Password").fill(await readAppPassword());
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForTimeout(1500);

  // ── 首连：全量回放 → turns 渲染 → 等 debounce flush（2s）落盘 ──
  await page.goto(pageUrl);
  const firstTurn = page.locator("[data-turn-message-ids]").first();
  await firstTurn.waitFor({ state: "visible", timeout: 20000 });
  await page.waitForTimeout(3000);
  const firstCount = await page.locator("[data-turn-message-ids]").count();
  check("① 首连渲染非空", firstCount > 0, `turns=${firstCount}`);

  const entryRaw = await page.evaluate((k) => localStorage.getItem(k), cacheKey);
  let entry = null;
  try {
    entry = JSON.parse(entryRaw ?? "null");
  } catch {}
  const entryOk =
    entry !== null &&
    typeof entry.cursorUuid === "string" &&
    entry.cursorUuid.length > 0 &&
    typeof entry.raw === "string" &&
    entry.raw.length > 0;
  check(
    "② localStorage 回放缓存已落盘（cursorUuid + raw 非空）",
    entryOk,
    entry
      ? `cursor=${entry.cursorUuid} rawChars=${entry.raw?.length} lines=${entry.raw?.split("\n").length}`
      : "entry=null",
  );

  // ── 切走（整页离开 = 组件 unmount → cleanup 同步 flush）→ 切回 ──
  await page.goto(`${WEB_ORIGIN}/`);
  await page.waitForTimeout(300);
  await page.goto(pageUrl);

  // ── ③ 恢复 + 二次连接带 since 锚 ──
  await firstTurn.waitFor({ state: "visible", timeout: 20000 });
  await page.waitForTimeout(1500); // 等 WS session_init 到达
  const secondUrl = wsUrls.at(-1);
  check("②b 切回后建立新连接", Boolean(secondUrl), `connections=${wsUrls.length}`);
  const sinceOk = Boolean(secondUrl && secondUrl.includes("since="));
  check("③ 切回后 WS URL 带 ?since=<锚>", sinceOk, secondUrl ?? "none");
  const sinceMatchesCache =
    sinceOk && entry ? secondUrl.includes(`since=${encodeURIComponent(entry.cursorUuid)}`) : false;
  check("④ since 锚 == 缓存 cursorUuid（行内推导）", sinceMatchesCache, entry?.cursorUuid);

  // ── ⑤ 内容完整（恢复窗口 + delta 增量 ≥ 首连内容）──
  await page.waitForFunction(
    () => document.querySelectorAll("[data-turn-message-ids]").length >= 1,
    undefined,
    { timeout: 10000 },
  );
  const finalCount = await page.locator("[data-turn-message-ids]").count();
  check("⑤ 切回后内容完整", finalCount >= firstCount, `before=${firstCount} after=${finalCount}`);

  // ── ⑥ 服务端日志：relay 走 delta（不重发全量）──
  const apiLog = execSync("tmux capture-pane -t ar-dev:api -p -S -4000", {
    encoding: "utf8",
  });
  const deltaLines = apiLog
    .split("\n")
    .filter((l) => l.includes("[relay] addSubscriber") && l.includes("replay=delta"));
  const fullLines = apiLog
    .split("\n")
    .filter((l) => l.includes("[relay] addSubscriber") && l.includes("replay=full"));
  check(
    "⑥ 服务端 relay 日志出现 replay=delta",
    deltaLines.length > 0,
    `delta=${deltaLines.length} full=${fullLines.length}`,
  );
  console.log(`    最新 delta 行: ${deltaLines.at(-1)?.trim()}`);

  console.log("");
  console.log(`共 ${pass + fail} 项：${pass} pass / ${fail} fail`);
} finally {
  await browser.close();
}
if (fail > 0) process.exit(1);
