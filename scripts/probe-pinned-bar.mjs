// 批 v6.2 置顶会话条探针：置顶条渲染/色板/白环/长按气泡/点击一步切换/0 置顶隐藏/
// 宽端不设——mock /api/overview + /api/state/overview/pinned-sessions 驱动（无真实会话，
// 零数据创建）。断言式；bun scripts/probe-pinned-bar.mjs。
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const EXEC =
  "/home/deploy/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell";
const P = "pinbar-demo";
const S1 = "pinbar-session-aaa";
const S2 = "pinbar-session-bbb";

let pass = 0;
let fail = 0;
function check(name, ok, detail) {
  if (ok) {
    pass += 1;
    console.log(`  PASS ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    fail += 1;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
const json = (body) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(body),
});

const agentSession = (id, name, status) => ({
  id,
  projectName: P,
  provider: "claude",
  displayName: name,
  status,
  createdAt: "2026-10-09T00:00:00Z",
  updatedAt: "2026-10-09T00:00:00Z",
  model: "claude-opus-5",
  permissionMode: "default",
});

async function setup(page, pinned) {
  await page.route(/\/api\/overview$/, (r) =>
    r.fulfill(
      json({
        projectNames: [P],
        candidates: [
          {
            type: "agent",
            projectName: P,
            sessionId: S1,
            displayName: "alpha",
            status: "running",
          },
          {
            type: "agent",
            projectName: P,
            sessionId: S2,
            displayName: "beta",
            status: "idle",
          },
          {
            type: "terminal",
            projectName: P,
            sessionId: "pinbar-session-tty",
            displayName: "tty",
            status: "running",
          },
        ],
      }),
    ),
  );
  await page.route(/\/api\/state\/overview\/pinned-sessions$/, (r) =>
    r.fulfill(json({ sessions: pinned })),
  );
  await page.route(/\/api\/projects\/[^/]+\/agent-sessions(?:\?.*)?$/, (r) =>
    r.fulfill(
      json({ sessions: [agentSession(S1, "alpha", "running"), agentSession(S2, "beta", "idle")] }),
    ),
  );
  await page.route(/\/api\/projects\/[^/]+\/terminal-sessions(?:\?.*)?$/, (r) =>
    r.fulfill(json({ sessions: [] })),
  );
  await page.route(/\/api\/projects\/[^/]+$/, (r) =>
    r.fulfill(
      json({
        project: {
          name: P,
          path: `/tmp/${P}`,
          agentSessionCount: 2,
          terminalSessionCount: 0,
          gitBranch: "main",
        },
      }),
    ),
  );
}

async function login(page) {
  await page
    .getByLabel("密码")
    .or(page.getByLabel("Password"))
    .fill(await readAppPassword());
  await page.getByRole("button", { name: /登录|Sign in/ }).click();
  await page.waitForTimeout(700);
}

async function run() {
  const browser = await chromium.launch({ executablePath: EXEC });
  try {
    // ── Part 1：移动（390 viewport）两颗置顶，聚焦 s1 ──
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      locale: "zh-CN",
    });
    const page = await ctx.newPage();
    await setup(page, [S1, S2]);
    await page.goto(`${ORIGIN}/projects/${P}/session/${S1}`);
    await login(page);
    await page.reload();
    await page.waitForSelector(".pinned", { timeout: 10000 });

    console.log("== Part 1 置顶条渲染 ==");
    const dots = page.locator(".pinned .pdot");
    check("1a 置顶条在场且色点数 = 2（活跃交集）", (await dots.count()) === 2);
    const cur = page.locator(".pinned .pdot.cur");
    check("1b 白环 = 当前聚焦（aria-current 恰 1 颗）", (await cur.count()) === 1);
    const ring = await cur.first().evaluate((el) => getComputedStyle(el).boxShadow);
    check(
      "1c .pdot.cur 白环 computed box-shadow 非 none",
      ring !== "none" && ring.includes("0px 0px 0px 3.5px"),
      ring.slice(0, 60),
    );

    console.log("== Part 2 长按名字气泡 ==");
    const betaDot = page.locator('.pinned .pdot[aria-label="beta"]');
    await betaDot.dispatchEvent("pointerdown");
    await page.waitForSelector(".pinned .popb", { timeout: 3000 });
    const bubble = await page.locator(".pinned .popb").textContent();
    check("2a 长按 500ms 后气泡在场且含会话名", (bubble ?? "").includes("beta"), bubble ?? "");
    check(
      "2b 气泡含状态文案（运行状态点 + label）",
      /运行|等待输入|Running|idle/i.test(bubble ?? ""),
      bubble ?? "",
    );
    await betaDot.dispatchEvent("pointerup");
    check("2c 松手气泡收起", (await page.locator(".pinned .popb").count()) === 0);

    console.log("== Part 3 点击一步切换 ==");
    await betaDot.click();
    // cur 白环移到被点色点（聚焦切换）。等 React 重渲染 + 路由导航落地。
    await page.waitForFunction(
      () => document.querySelector(".pinned .pdot.cur")?.getAttribute("aria-label") === "beta",
      undefined,
      undefined,
    );
    const curLabel = await page.locator(".pinned .pdot.cur").first().getAttribute("aria-label");
    check("3a 点击色点一步切换（cur 移到 beta）", curLabel === "beta", `cur=${curLabel}`);
    check("3b URL 切到目标会话", page.url().includes(S2), page.url());

    await ctx.close();

    // ── Part 4：0 置顶 → 整行不出现 ──
    const ctx2 = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      locale: "zh-CN",
    });
    const page2 = await ctx2.newPage();
    await setup(page2, []);
    await page2.goto(`${ORIGIN}/projects/${P}/session/${S1}`);
    await login(page2);
    await page2.reload();
    await page2.waitForTimeout(1200);
    check("4a 0 置顶整行不渲染", (await page2.locator(".pinned").count()) === 0);
    await ctx2.close();

    // ── Part 5：宽端不设（桌面 viewport 1280 走 WorkbenchRoute，无 .pinned） ──
    const ctx3 = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      locale: "zh-CN",
    });
    const page3 = await ctx3.newPage();
    await setup(page3, [S1, S2]);
    await page3.goto(`${ORIGIN}/projects/${P}`);
    await login(page3);
    await page3.waitForTimeout(1500);
    check("5a 宽端（桌面路由）无置顶条", (await page3.locator(".pinned").count()) === 0);
    await ctx3.close();
  } finally {
    await browser.close();
  }
}

(async () => {
  await run();
  console.log(`\n总计: PASS ${pass} / FAIL ${fail} — ${fail === 0 ? "ALL PASS" : "有 FAIL"}`);
  process.exit(fail === 0 ? 0 : 1);
})();
