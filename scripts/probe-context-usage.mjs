// 探针:上下文占用标量管道(统一会话标量管道 P0,2026-10-14)。验证浏览器真实链路:
// 1 live context_usage 帧到达 → composer 控制行出现 token 显示、帧更新数值随之变;
// 2 断开重连 → seed_init.contextTokens 恢复显示(回放恢复面);
// 3 幂等值不重复渲染(DOM 文本与标量一致)。
// 密码由脚本自读,不进 agent 上下文。用法:bun scripts/probe-context-usage.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const projectName = process.env.PROBE_PROJECT ?? "test";
const fakeSessionId = "agent_probe-context-usage";

const userMsg = (uuid, text) => ({
  type: "user",
  uuid,
  isUserInput: true,
  session_id: "s1",
  message: { role: "user", content: [{ type: "text", text }] },
});
const assistantMsg = (uuid, id, text) => ({
  type: "assistant",
  uuid,
  message: { id, role: "assistant", content: [{ type: "text", text }] },
  session_id: "s1",
});

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
  const state = { connections: 0 };

  const session = {
    id: fakeSessionId,
    projectName,
    provider: "claude",
    displayName: "Probe Context Usage",
    status: "idle",
    permissionMode: "default",
    createdAt: new Date().toISOString(),
  };
  const detail = {
    session,
    availableModels: ["sonnet", "opus"],
    availablePermissionModes: ["default", "bypassPermissions"],
  };
  const json = (body) => ({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
  await page.route(
    new RegExp(`/api/projects/${projectName}/agent-sessions/${fakeSessionId}$`),
    (r) => r.fulfill(json(detail)),
  );
  await page.route(new RegExp(`/api/projects/${projectName}/agent-sessions$`), (r) =>
    r.fulfill(json({ sessions: [session] })),
  );
  await page.route(new RegExp("/api/overview$"), (r) =>
    r.fulfill(
      json({
        projectNames: [projectName],
        candidates: [
          {
            type: "agent",
            projectName,
            sessionId: fakeSessionId,
            displayName: "Probe Context Usage",
            status: "idle",
            provider: "claude",
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    ),
  );

  await page.routeWebSocket(/claude-stream/, (ws) => {
    state.connections += 1;
    const index = state.connections;
    const send = (msg) => ws.send(JSON.stringify(msg));

    ws.onMessage((data) => {
      let msg;
      try {
        msg = JSON.parse(String(data));
      } catch {
        return;
      }
      if (msg.type === "ping") ws.send(JSON.stringify({ type: "pong" }));
    });

    if (index === 1) {
      send({ type: "session_init", resume: false, replay: "full" });
      send({ type: "history_start", count: 2 });
      send(userMsg("uuid-u1", "第一条提问"));
      send(assistantMsg("uuid-a1", "a1", "第一条回答"));
      send({ type: "history_end" });
      send({ type: "live_start", count: 0 });
      send({ type: "live_end" });
      // live 阶段推两帧 context_usage:31.3k → 40.2k(随 assistant usage 折算)。
      setTimeout(() => {
        send({ type: "system", subtype: "context_usage", contextTokens: 31324 });
        setTimeout(() => {
          send({ type: "system", subtype: "context_usage", contextTokens: 40200 });
          // 数值断言窗口过后断开,触发连接 2(seed 恢复面)。
          setTimeout(() => ws.close({ code: 1000, reason: "server restart" }), 600);
        }, 600);
      }, 400);
      return;
    }
    // 连接 2:seed_init 带 contextTokens 恢复(回放路径)。
    send({ type: "session_init", resume: true, replay: "full" });
    send({ type: "system", subtype: "seed_init", contextTokens: 55100 });
    send({ type: "history_start", count: 2 });
    send(userMsg("uuid-u1", "第一条提问"));
    send(assistantMsg("uuid-a1", "a1", "第一条回答"));
    send({ type: "history_end" });
    send({ type: "live_start", count: 0 });
    send({ type: "live_end" });
  });

  await page.goto(`${WEB_ORIGIN}/`);
  await page.getByLabel("Password").fill(await readAppPassword());
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.goto(`${WEB_ORIGIN}/projects/${projectName}/agent-sessions/${fakeSessionId}/claude`);

  const turnLocator = page.locator("[data-turn-message-ids]");
  await turnLocator.first().waitFor({ state: "visible", timeout: 15000 });

  // 显示位:composer 控制行的上下文指示(aria-label 定位,值在元素文本)。
  const usage = page.locator(`span[aria-label="上下文占用"], span[aria-label="Context usage"]`);

  // ── 1 未有标量时不渲染 ──
  check("1 未有 context_usage 帧时不渲染指示", (await usage.count()) === 0);

  // ── 2 第一帧 31324 → "31.3k" ──
  await usage.waitFor({ state: "visible", timeout: 5000 });
  const v1 = (await usage.textContent()) ?? "";
  check("2 首帧折算显示 31.3k", v1.trim() === "31.3k", v1.trim());

  // ── 3 第二帧 40200 → "40.2k"(标量随帧更新)──
  await page.waitForFunction(
    (expected) => {
      const el = document.querySelector(
        `span[aria-label="上下文占用"], span[aria-label="Context usage"]`,
      );
      return el?.textContent?.trim() === expected;
    },
    "40.2k",
    { timeout: 5000 },
  );
  check("3 帧更新后显示 40.2k", true);

  // ── 4 重连:seed_init.contextTokens=55100 恢复 → "55.1k" ──
  await page.waitForFunction(
    (expected) => {
      const el = document.querySelector(
        `span[aria-label="上下文占用"], span[aria-label="Context usage"]`,
      );
      return el?.textContent?.trim() === expected;
    },
    "55.1k",
    { timeout: 10000 },
  );
  check("4 重连后 seed_init 恢复 55.1k", true);

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exitCode = fail === 0 ? 0 : 1;
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
