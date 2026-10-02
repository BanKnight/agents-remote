// 探针：composer 草稿持久化（2026-10-02 用户需求）。验证浏览器真实链路：
// 输入 → localStorage 落盘 → reload → textarea 恢复（跨刷新保留）→ 清空 → 清档。
// 跨 reload 持久化是单测（jsdom remount mock）覆盖不了的行为，探针补真浏览器证据。
//
// 密码由脚本自读（env → config.yaml → api 进程 environ），不进 agent 上下文、不打印值。
// 用法：bun scripts/probe-composer-draft.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const projectName = process.env.PROBE_PROJECT ?? "test";
const fakeSessionId = "agent_probe-composer-draft";
const DRAFT_KEY = `composerDraft:claude:${fakeSessionId}`;

async function setupMocks(page) {
  const session = {
    id: fakeSessionId,
    projectName,
    provider: "claude",
    displayName: "Probe Draft",
    status: "idle",
    permissionMode: "default",
    createdAt: new Date().toISOString(),
  };
  const detail = {
    session,
    availableModels: ["sonnet", "opus"],
    availablePermissionModes: ["default", "bypassPermissions"],
  };
  await page.route(
    new RegExp(`/api/projects/${projectName}/agent-sessions/${fakeSessionId}$`),
    (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(detail),
      }),
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
            displayName: "Probe Draft",
            status: "idle",
            provider: "claude",
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    }),
  );
  // WS 全 mock（无 CLI 进程）：socket open（→ connected → composer enabled）+ pong 防自愈。
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

let pass = 0;
let fail = 0;
function check(label, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? `  (${detail})` : ""}`);
  if (ok) pass += 1;
  else fail += 1;
}

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await setupMocks(page);
  await page.goto(`${WEB_ORIGIN}/`);
  await page.getByLabel("Password").fill(await readAppPassword());
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.goto(`${WEB_ORIGIN}/projects/${projectName}/agent-sessions/${fakeSessionId}/claude`);

  const textarea = page.locator("[data-composer-float] textarea").first();
  await textarea.waitFor({ state: "visible", timeout: 15000 });

  // ── ① 输入 → localStorage 落盘 ──
  await textarea.fill("跨刷新保留的草稿内容");
  await page
    .waitForFunction((key) => localStorage.getItem(key) !== null, DRAFT_KEY, { timeout: 5000 })
    .catch(() => {});
  const saved = await page.evaluate((key) => localStorage.getItem(key), DRAFT_KEY);
  check("① 输入后 localStorage 落盘", saved === "跨刷新保留的草稿内容", `value=${saved}`);

  // ── ② reload → textarea 恢复 ──
  await page.reload();
  const textarea2 = page.locator("[data-composer-float] textarea").first();
  await textarea2.waitFor({ state: "visible", timeout: 15000 });
  const restored = await textarea2.inputValue();
  check(
    "② reload 后 textarea 恢复草稿",
    restored === "跨刷新保留的草稿内容",
    `value="${restored}"`,
  );

  // ── ③ 恢复后再改 → 落盘同步更新 ──
  await textarea2.fill("跨刷新保留的草稿内容 v2");
  await page
    .waitForFunction((key) => localStorage.getItem(key) === "跨刷新保留的草稿内容 v2", DRAFT_KEY, {
      timeout: 5000,
    })
    .catch(() => {});
  const saved2 = await page.evaluate((key) => localStorage.getItem(key), DRAFT_KEY);
  check("③ 恢复后再改落盘同步", saved2 === "跨刷新保留的草稿内容 v2", `value=${saved2}`);

  // ── ④ 清空 → 清档 + reload 后为空 ──
  await textarea2.fill("");
  await page
    .waitForFunction((key) => localStorage.getItem(key) === null, DRAFT_KEY, { timeout: 5000 })
    .catch(() => {});
  const cleared = await page.evaluate((key) => localStorage.getItem(key), DRAFT_KEY);
  check("④ 清空后清档", cleared === null, `value=${cleared}`);
  await page.reload();
  const textarea3 = page.locator("[data-composer-float] textarea").first();
  await textarea3.waitFor({ state: "visible", timeout: 15000 });
  const emptyAfterReload = await textarea3.inputValue();
  check("⑤ 清空后 reload 保持空", emptyAfterReload === "", `value="${emptyAfterReload}"`);

  console.log(`\n共 ${pass + fail} 项：${pass} pass / ${fail} fail`);
} finally {
  await browser.close();
}
if (fail > 0) process.exit(1);
