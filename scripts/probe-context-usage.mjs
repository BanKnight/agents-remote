// 探针:上下文占用指示(v1.6 环形仪表重做批,2026-10-14)。验证浏览器真实链路:
// 1 live context_usage 帧(明细全字段)到达 → 控制行出现环形仪表 trigger + 百分比 + 档位;
// 2 danger 帧触发 lvl-danger 三档变色;
// 3 点开浮层:进度条宽度 = 占用比 + 汇总(已用/窗口) + 明细四行;
// 4 断开重连 → seed_init.contextUsage 恢复百分比与档位(回放恢复面)。
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
      // live 阶段推帧 context_usage(明细全字段,随 assistant usage 折算):
      // 31324/200000 = 15.7% → 16% ok 档 → 172000/200000 = 86% danger 档。
      const frame = (
        contextTokens,
        inputTokens,
        cacheCreationTokens,
        cacheReadTokens,
        outputTokens,
      ) => ({
        type: "system",
        subtype: "context_usage",
        contextTokens,
        inputTokens,
        cacheCreationTokens,
        cacheReadTokens,
        outputTokens,
        contextWindow: 200000,
      });
      setTimeout(() => {
        send(frame(31324, 30079, 1200, 45, 333));
        setTimeout(() => {
          send(frame(172000, 100000, 20000, 51000, 1000));
          // 数值断言窗口过后断开,触发连接 2(seed 恢复面)。
          setTimeout(() => ws.close({ code: 1000, reason: "server restart" }), 600);
        }, 600);
      }, 400);
      return;
    }
    // 连接 2:seed_init.contextUsage 带明细对象恢复(回放路径)。178000/200000 = 89%。
    send({ type: "session_init", resume: true, replay: "full" });
    send({
      type: "system",
      subtype: "seed_init",
      contextUsage: {
        contextTokens: 178000,
        inputTokens: 120000,
        cacheCreationTokens: 20000,
        cacheReadTokens: 38000,
        outputTokens: 900,
        contextWindow: 200000,
      },
    });
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

  // 显示位:composer 控制行的上下文占用指示(aria-label trigger 按钮,百分比在元素文本;
  // 窄端 .iicn.usage / 宽端 .ipill.usage 双形态,任一可见)。
  const usage = page.locator(
    `button[aria-label^="上下文占用"], button[aria-label^="Context usage"]`,
  );

  // ── 1 未有标量时不渲染 ──
  check("1 未有 context_usage 帧时不渲染指示", (await usage.count()) === 0);

  // ── 2 首帧 31324/200k → "16%" ok 档(无 warn/danger class)──
  await usage.waitFor({ state: "visible", timeout: 5000 });
  const v1 = (await usage.textContent()) ?? "";
  const cls1 = await usage.evaluate((el) => el.innerHTML);
  check(
    "2 首帧显示 16% + ok 档(无 lvl-warn/lvl-danger)",
    v1.includes("16%") && !cls1.includes("lvl-warn") && !cls1.includes("lvl-danger"),
    v1.trim(),
  );

  // ── 3 danger 帧 172000/200k → "86%" + lvl-danger(三档变色)──
  await page.waitForFunction(
    () => {
      const el = document.querySelector(
        `button[aria-label^="上下文占用"], button[aria-label^="Context usage"]`,
      );
      return el?.querySelector(".lvl-danger") !== null;
    },
    { timeout: 5000 },
  );
  check("3 danger 档帧 86% + lvl-danger class", true);

  // ── 4 点开浮层:进度条 + 汇总 + 明细四行 ──
  await usage.click();
  const pop = page.locator(".u-pop");
  await pop.waitFor({ state: "visible", timeout: 5000 });
  const popText = (await pop.textContent()) ?? "";
  const barOk = await pop.locator(".u-bar-fill").evaluate((el) => {
    const w = parseFloat(getComputedStyle(el).width);
    const track = el.parentElement.getBoundingClientRect().width;
    return Math.abs(w / track - 0.86) < 0.02;
  });
  // 档位色接线：浮层容器挂 u-lvl-*，环弧/进度条 fill 的 currentColor 继承容器档位色
  //（P1 回归锁——computed 是 rgb() 形态而 token 原值是 hex，逐处一致性对比而非字面比较；
  // 另对照 track 是 --sep 中性色，证明 fill 不是默认继承）。
  const lvlWired = await pop.evaluate((el) => {
    if (!el.className.includes("u-lvl-danger")) return false;
    const c = getComputedStyle(el).color;
    const fill = getComputedStyle(el.querySelector(".u-bar-fill")).backgroundColor;
    const arc = getComputedStyle(el.querySelector(".u-ring-arc")).stroke;
    const track = getComputedStyle(el.querySelector(".u-ring-track")).stroke;
    return c === fill && fill === arc && fill !== track;
  });
  check(
    "4 浮层明细(进度条 86% + 汇总 172k/200k + 四行明细)",
    popText.includes("172k / 200k") &&
      ["输入", "Input"].some((k) => popText.includes(k)) &&
      ["缓存读", "Cache read"].some((k) => popText.includes(k)) &&
      ["缓存写", "Cache write"].some((k) => popText.includes(k)) &&
      ["本轮输出", "This turn"].some((k) => popText.includes(k)) &&
      barOk &&
      lvlWired,
    popText.slice(0, 120),
  );
  await page.keyboard.press("Escape");

  // ── 5 重连:seed_init.contextUsage 恢复 89% danger 档 ──
  await page.waitForFunction(
    () => {
      const el = document.querySelector(
        `button[aria-label^="上下文占用"], button[aria-label^="Context usage"]`,
      );
      const txt = el?.textContent ?? "";
      return txt.includes("89%") && el?.querySelector(".lvl-danger") !== null;
    },
    { timeout: 10000 },
  );
  check("5 重连后 seed_init 恢复 89% danger", true);

  // ── 6 右组几何(spec 4.1-3「UI 平衡偏右」):输入触发 Send 后,usage trigger 落在
  // 卡片右半(左缘 > 卡片中点)且紧贴 send2(间距 = 右组 gap 8px)——防两个 auto margin
  // 均分剩余空间把 usage 推回正中的回归。 ──
  const composerBox = page.locator("form textarea, [data-slot] textarea").first();
  await composerBox.fill("hi");
  await page.waitForFunction(() => document.querySelector(".send2") !== null, { timeout: 5000 });
  const geo = await page.evaluate(() => {
    const btn = document.querySelector(
      `button[aria-label^="上下文占用"], button[aria-label^="Context usage"]`,
    );
    const send = document.querySelector(".send2");
    if (!btn || !send) return null;
    const card = btn.closest("form") ?? btn.closest("[class*='composer']") ?? btn.parentElement;
    const b = btn.getBoundingClientRect();
    const sd = send.getBoundingClientRect();
    return {
      left: b.left,
      right: b.right,
      sendLeft: sd.left,
      cardMid: card
        ? card.getBoundingClientRect().left + card.getBoundingClientRect().width / 2
        : 0,
      gap: sd.left - b.right,
    };
  });
  check(
    "6 右组几何:usage 偏右(左缘>卡片中点) + 紧贴 send2(gap≈8px)",
    geo !== null && geo.left > geo.cardMid && Math.abs(geo.gap - 8) < 2,
    JSON.stringify(geo),
  );

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exitCode = fail === 0 ? 0 : 1;
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
