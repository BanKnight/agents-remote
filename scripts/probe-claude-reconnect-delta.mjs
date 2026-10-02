// 探针：claude 重连增量回放（2026-10-02 用户需求）。验证浏览器真实链路：
// 首连全量 → mock 服务端断开 → 重连 URL 带 ?since=<锚> → delta 补齐不重建
// 已有 turn DOM、无 skeleton、新增 turn 挂淡入 → 再次断开 → 全量回退内容完整。
// 断开语义细节由 claude-adapter.hook.test 覆盖；本探针补真实 WS + DOM 证据。
//
// 密码由脚本自读，不进 agent 上下文。用法：bun scripts/probe-claude-reconnect-delta.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const projectName = process.env.PROBE_PROJECT ?? "test";
const fakeSessionId = "agent_probe-reconnect-delta";

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
  const state = { connections: 0, lastUrl: "" };

  const session = {
    id: fakeSessionId,
    projectName,
    provider: "claude",
    displayName: "Probe Reconnect Delta",
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
            displayName: "Probe Reconnect Delta",
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
    state.lastUrl = ws.url();
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
      // 模拟服务端断开（触发现有 onclose → scheduleReconnect → 连接 2）。
      setTimeout(() => ws.close({ code: 1000, reason: "server restart" }), 800);
      return;
    }
    if (index === 2) {
      send({ type: "session_init", resume: true, replay: "delta" });
      send({ type: "history_start", count: 0 });
      send({ type: "history_end" });
      send({ type: "live_start", count: 2 });
      send(userMsg("uuid-u2", "断线期间的新提问"));
      send(assistantMsg("uuid-a2", "a2", "断线期间的新回答"));
      send({ type: "live_end" });
      // 1.6s 后再次断开，触发连接 3（全量回退分支）。
      setTimeout(() => ws.close({ code: 1000, reason: "second disconnect" }), 1600);
      return;
    }
    send({ type: "session_init", resume: true, replay: "full" });
    send({ type: "history_start", count: 4 });
    send(userMsg("uuid-u1", "第一条提问"));
    send(assistantMsg("uuid-a1", "a1", "第一条回答"));
    send(userMsg("uuid-u2", "断线期间的新提问"));
    send(assistantMsg("uuid-a2", "a2", "断线期间的新回答"));
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

  // ── ① 首连全量：u1 + a1 = 2 turn ──
  const firstCount = await turnLocator.count();
  check("① 首连全量渲染 1 turn（u1+a1 一问一答同组）", firstCount === 1, `turns=${firstCount}`);

  // 探针侧标记既有 turn 容器（__probeMark 跟随 DOM 节点，重建即丢）。
  await page.evaluate(() => {
    document.querySelectorAll("[data-turn-message-ids]").forEach((el) => {
      el.__probeMark = "keep";
    });
  });

  // ── ② 重连（连接 2）：URL 带 since 锚 ──
  await page.waitForFunction(() => true, undefined, { timeout: 2600 }).catch(() => {});
  await page.waitForTimeout(1200);
  const sinceOk = state.lastUrl.indexOf("since=uuid-a1") !== -1;
  check("② 重连 URL 携带 ?since=<最后 uuid>", sinceOk, state.lastUrl);

  // ── ③ delta 补齐：4 turn、前 2 未重建、新增 2 turn 挂淡入 ──
  await page.waitForFunction(
    () => document.querySelectorAll("[data-turn-message-ids]").length >= 2,
    undefined,
    { timeout: 8000 },
  );
  const marks = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll("[data-turn-message-ids]")];
    return {
      total: nodes.length,
      marked: nodes.slice(0, 1).filter((el) => el.__probeMark === "keep").length,
      animated: nodes.filter((el) => (el.className || "").indexOf("animate-msg-enter") !== -1)
        .length,
    };
  });
  check("③a delta 后共 2 turn", marks.total === 2, `total=${marks.total}`);
  check("③b 首 turn DOM 未重建", marks.marked === 1, `marked=${marks.marked}`);
  check("③c 新增 turn 挂淡入动画", marks.animated === 1, `animated=${marks.animated}`);
  const skeletonCount = await page.locator(".skeleton-shimmer").count();
  check("③d 无 skeleton", skeletonCount === 0, `skeleton=${skeletonCount}`);

  // ── ③e 几何硬数据：turn top 严格递增。防「动画 transform 覆盖虚拟列表内联
  //    translateY 定位」的 P0 回归——若回归，动画 turn 全部堆叠到容器顶，top 相同。
  const tops = await page.evaluate(() =>
    [...document.querySelectorAll("[data-turn-message-ids]")].map(
      (el) => el.getBoundingClientRect().top,
    ),
  );
  const strictlyIncreasing = tops.length === 2 && tops.every((t, i) => i === 0 || t > tops[i - 1]);
  check(
    "③e delta 后 turn top 严格递增（不堆叠）",
    strictlyIncreasing,
    `tops=${tops.map((t) => Math.round(t)).join(",")}`,
  );

  // ── ④ 全量回退（连接 3）：内容完整 ──
  await page.waitForTimeout(2600);
  await page.waitForFunction(
    () => document.querySelectorAll("[data-turn-message-ids]").length >= 2,
    undefined,
    { timeout: 8000 },
  );
  const fallbackCount = await page.evaluate(
    () => document.querySelectorAll("[data-turn-message-ids]").length,
  );
  check("④ 全量回退后内容完整（2 turn）", fallbackCount === 2, `turns=${fallbackCount}`);

  console.log("");
  console.log(`共 ${pass + fail} 项：${pass} pass / ${fail} fail`);
} finally {
  await browser.close();
}
if (fail > 0) process.exit(1);
