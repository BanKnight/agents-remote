// 探针：SessionInputDrawer 的 ⚙ 键位自定义入口 gate 放开断言（2026-11-03）。
// 背景：⚙ 落地（2026-10-11）早于 agent 双模式（2026-10-15），原 gate
// `sessionType === "terminal"` 把 agent+TUI 形态（claude 会话 terminal 模式 →
// AgentTerminalPanel → SessionDetail(sessionType="agent")）挡在盲区外——真机反馈
// 「agent TUI 模式 composer 少了配置按钮」。修复 = gate 退役恒渲染（两消费者全是
// TUI 形态）。本探针锁两个形态 ⚙ 均在场：
//  1. agent+TUI 形态（mock claude 会话 mode="terminal"）：默认展开抽屉，⚙ 在场 28×28。
//  2. terminal 形态（对照回归防护）：折叠默认，展开后 ⚙ 在场。
// mock 全 API 面（无真实会话/CLI）；session-stream WS 升级失败只影响连接态提示，
// 不影响 composer 渲染。用法：systemd-run --scope --user -p MemoryMax=2G bun scripts/probe-session-gear-gate.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const PROJECT = "test";
const AGENT_ID = "agent_probegear";
// sessionId 前缀是稳定类型标识（agent_ / terminal_，inferSessionTypeFromId 判据）——
// mock id 必须带对前缀，否则 focus 面板类型推断 undefined、TerminalPanel 不渲染。
const TERM_ID = "terminal_probegear";

let pass = 0;
let fail = 0;
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "[PASS]" : "[FAIL]"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (ok) pass += 1;
  else fail += 1;
};

async function setupMocks(page) {
  const agentSession = {
    id: AGENT_ID,
    projectName: PROJECT,
    provider: "claude",
    mode: "terminal",
    displayName: "Probe TUI",
    status: "idle",
    createdAt: new Date().toISOString(),
  };
  const termSession = {
    id: TERM_ID,
    projectName: PROJECT,
    displayName: "Probe Term",
    status: "running",
  };
  const json = (body) => ({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
  await page.route(/\/api\/overview$/, (r) =>
    r.fulfill(
      json({
        projectNames: [PROJECT],
        candidates: [
          {
            type: "agent",
            projectName: PROJECT,
            sessionId: AGENT_ID,
            displayName: "Probe TUI",
            status: "idle",
            provider: "claude",
            mode: "terminal",
            createdAt: agentSession.createdAt,
          },
          {
            type: "terminal",
            projectName: PROJECT,
            sessionId: TERM_ID,
            displayName: "Probe Term",
            status: "running",
          },
        ],
      }),
    ),
  );
  await page.route(new RegExp(`/api/projects/${PROJECT}/agent-sessions$`), (r) =>
    r.fulfill(json({ sessions: [agentSession] })),
  );
  await page.route(new RegExp(`/api/projects/${PROJECT}/terminal-sessions$`), (r) =>
    r.fulfill(json({ sessions: [termSession] })),
  );
  await page.route(/\/api\/state\/overview\/pinned-sessions$/, (r) =>
    r.fulfill(json({ sessions: [] })),
  );
  await page.route(/\/api\/state\/overview\/pinned-sessions\/[^/]+$/, (r) =>
    r.fulfill(json({ sessions: [] })),
  );
  await page.route(/\/api\/approvals$/, (r) => r.fulfill(json({ approvals: [] })));
  await page.route(new RegExp(`/api/projects/${PROJECT}/agent-sessions/${AGENT_ID}$`), (r) =>
    r.fulfill(json({ session: agentSession })),
  );
  await page.route(new RegExp(`/api/projects/${PROJECT}/terminal-sessions/${TERM_ID}$`), (r) =>
    r.fulfill(json({ session: termSession })),
  );
}

/** 展开输入抽屉（若折叠）后检查 ⚙（.iicn.gear）在场与几何。 */
async function assertGearVisible(page, label) {
  // 展开钮等在场再点（terminal 对照默认折叠，抽屉渲染慢于 goto 返回时同步 count 会
  // 漏判跳过点击 → 后续 textarea wait 必挂；agent 形态默认展开无此钮，waitFor 超时
  // 静默放行）。agent 场景抽屉渲染慢时，同条 waitFor 也兜住 textarea 等待。
  const expandBtn = page.getByRole("button", { name: /Expand input|展开输入/ });
  await expandBtn
    .first()
    .waitFor({ state: "visible", timeout: 10000 })
    .catch(() => {});
  if ((await expandBtn.count()) > 0) {
    await expandBtn.first().click();
  }
  const textarea = page.locator("#session-input");
  const shown = await textarea.waitFor({ state: "visible", timeout: 10000 }).then(
    () => true,
    () => false,
  );
  if (!shown) {
    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 500));
    console.log(
      `[DUMP ${label}] url=${page.url()} #session-input count=${await textarea.count()} body="${bodyText.replace(/\n/g, " | ").slice(0, 260)}"`,
    );
    check(false, `${label}: 输入抽屉未出现`, "见上方 DUMP");
    return;
  }
  const gear = await page
    .locator(".iicn.gear")
    .first()
    .evaluate((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        display: cs.display,
        w: r.width,
        h: r.height,
        aria: el.getAttribute("aria-label"),
      };
    })
    .catch(() => null);
  const ok =
    !!gear && gear.display === "flex" && Math.abs(gear.w - 28) < 1 && Math.abs(gear.h - 28) < 1;
  if (!ok) {
    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 400));
    console.log(
      `[DUMP ${label}] gear=${JSON.stringify(gear)} textarea=${await page.locator("#session-input").count()} body="${bodyText.replace(/\n/g, " | ").slice(0, 220)}"`,
    );
  }
  check(
    ok,
    `${label}: ⚙ 键位自定义入口在场可见`,
    gear
      ? `display=${gear.display} ${gear.w.toFixed(0)}x${gear.h.toFixed(0)} aria="${gear.aria}"`
      : "不在 DOM",
  );
}

(async () => {
  const browser = await chromium.launch();
  try {
    const contexts = [
      {
        label: "desktop agent+TUI",
        opts: {},
        path: `/projects/${PROJECT}/session/${AGENT_ID}`,
        // 预置键启用集（atomWithLocalOnlyStorage localStorage 落盘）预启用 preset-tab——
        // 断言 gate 放开后「启用过的预置键进 agent TUI 快捷键条」（enabledPresetKeys
        // 同批放开，原 agent 侧恒 []）。精确匹配 textContent（"Tab" 会撞内置键
        // "Shift+Tab" 的 hasText）。
        presetEnabled: ["preset-tab"],
      },
      {
        label: "mobile agent+TUI",
        opts: { isMobile: true, hasTouch: true, viewport: { width: 390, height: 844 } },
        path: `/projects/${PROJECT}/session/${AGENT_ID}`,
      },
      {
        label: "desktop terminal(对照)",
        opts: {},
        path: `/projects/${PROJECT}/session/${TERM_ID}`,
        // terminal 对照同预置，断言共享配置在原形态不受影响（同域共享是声明意图）。
        presetEnabled: ["preset-tab"],
      },
    ];
    for (const c of contexts) {
      const ctx = await browser.newContext(c.opts);
      const page = await ctx.newPage();
      await setupMocks(page);
      if (c.presetEnabled) {
        await ctx.addInitScript(
          (value) =>
            localStorage.setItem("workbench.terminalPresetKeysEnabled", JSON.stringify(value)),
          c.presetEnabled,
        );
      }
      await page.goto(`${WEB_ORIGIN}/`);
      await page.getByLabel("Password").fill(await readAppPassword());
      await page.getByRole("button", { name: "Sign in" }).click();
      await page.goto(`${WEB_ORIGIN}${c.path}`);
      await assertGearVisible(page, c.label);
      if (c.presetEnabled) {
        const presetInBar = await page
          .locator(".qkey")
          .evaluateAll((els) => els.some((el) => el.textContent === "Tab"));
        check(
          presetInBar,
          `${c.label}: 启用的预置键（Tab）渲染进快捷键条`,
          presetInBar ? "preset-tab 在 .qkey 条" : "缺失（enabledPresetKeys gate 未生效）",
        );
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  console.log(`\n=== 判定 === ${pass} pass / ${fail} fail`);
  if (fail > 0) process.exitCode = 1;
})();
