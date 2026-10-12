// 真机反馈第二轮五联修断言探针（2026-10-12）。
// Part 1 移动浮层：实例行 40px（基线 45 升档回归原型 .irow）+ 钉底 42px + 组间线在组头上方。
// Part 2 diff 空态：服务端 NOT_CHANGED 码 →「没有变更」而非「无法打开此差异」（总览+桌面单文件）。
// Part 3 编辑态辅助条：「收起键盘」钮退役（undo/redo 保留）。
// Part 4 两段加载骨架几何一致（detail 段 vs 历史回放段，chatScrollPaddingClasses 单源）。
// Part 5 分屏 gutter cursor：自定义 SVG data-URI 在场且随主题切换（明亮主题可见性，反馈④）。
// PASS/FAIL 断言式；bun scripts/probe-ui-polish.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const ORIGIN = "http://127.0.0.1:43012";
const PROJECT = "proj1";
let pass = 0;
let fail = 0;
function check(name, ok, detail) {
  if (ok) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
const json = (body, status = 200) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify(body),
});
const now = Date.now();

function setupBase(page) {
  void page.route(/\/api\/overview$/, (r) =>
    r.fulfill(
      json({
        projectNames: [PROJECT, "proj2"],
        candidates: [
          {
            type: "agent",
            projectName: PROJECT,
            sessionId: "agent_polish-1",
            displayName: "抛光探针会话",
            status: "idle",
            provider: "claude",
            createdAt: "2026-07-26T00:00:00.000Z",
          },
          {
            type: "agent",
            projectName: "proj2",
            sessionId: "agent_foreign-1",
            displayName: "外项目会话",
            status: "running",
            provider: "claude",
            createdAt: "2026-07-26T00:00:00.000Z",
          },
        ],
      }),
    ),
  );
  void page.route(new RegExp(`/api/projects/${PROJECT}/agent-sessions(?:\\?.*)?$`), (r) =>
    r.fulfill(
      json({
        sessions: [
          {
            id: "agent_polish-1",
            projectName: PROJECT,
            provider: "claude",
            displayName: "抛光探针会话",
            status: "idle",
            createdAt: "2026-07-26T00:00:00.000Z",
          },
        ],
      }),
    ),
  );
  void page.route(new RegExp(`/api/projects/${PROJECT}/agent-sessions/agent_polish-1$`), (r) =>
    r.fulfill(json(detailBody())),
  );
  void page.route(new RegExp(`/api/projects/${PROJECT}/terminal-sessions(?:\\?.*)?$`), (r) =>
    r.fulfill(json({ sessions: [] })),
  );
  void page.route(/\/api\/projects\/proj1\/git\/diff(?:\?.*)?$/, (r) =>
    r.fulfill(
      json({
        repository: true,
        projectName: PROJECT,
        files: [
          {
            path: "main.ts",
            status: "modified",
            scope: "worktree",
            addedLines: 1,
            removedLines: 0,
          },
        ],
        branch: { name: "main" },
      }),
    ),
  );
  void page.route(/\/api\/projects\/proj1\/git\/log(?:\?.*)?$/, (r) =>
    r.fulfill(json({ commits: [] })),
  );
  void page.route(/\/api\/projects\/proj1\/git\/branches(?:\?.*)?$/, (r) =>
    r.fulfill(json({ branches: [] })),
  );
  void page.route(/\/api\/projects\/proj1\/files\/preview\?.*path=main\.ts/, (r) =>
    r.fulfill(
      json({
        type: "text",
        projectName: PROJECT,
        path: "main.ts",
        name: "main.ts",
        size: 96,
        content: "const x = 1;\nconsole.log(x);\n",
        mtimeMs: now,
      }),
    ),
  );
  void page.route(/\/api\/projects\/proj1\/git\/diff\/file\?.*path=main\.ts/, (r) =>
    r.fulfill(
      json(
        { error: { code: "PROJECT_GIT_FILE_NOT_CHANGED", message: "Git file is not changed" } },
        400,
      ),
    ),
  );
  void page.routeWebSocket(/stream/, () => {});
}

function detailBody() {
  return {
    session: {
      id: "agent_polish-1",
      projectName: PROJECT,
      provider: "claude",
      displayName: "抛光探针会话",
      status: "idle",
      createdAt: "2026-07-26T00:00:00.000Z",
    },
    availableModels: ["sonnet"],
    availablePermissionModes: ["default"],
  };
}

async function login(page) {
  await page.goto(`${ORIGIN}/`);
  await page.waitForSelector('input[type="password"]', { timeout: 15000 });
  await page.getByLabel("访问密码").fill(await readAppPassword());
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForTimeout(700);
}

const browser = await chromium.launch();
try {
  // ── Part 1-3：移动视口 ────────────────────────────────────────────────
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "zh-CN" });
  const mp = await m.newPage();
  setupBase(mp);
  await login(mp);

  console.log("== Part 1：浮层行高 40 / 钉底 42 / 组间线 ==");
  await mp.goto(`${ORIGIN}/projects/${PROJECT}`);
  await mp.waitForTimeout(1200);
  await mp.locator('button[aria-label*="切换实例"]').click();
  await mp.waitForSelector('[role="menuitem"]', { timeout: 5000 });
  const p1 = await mp.evaluate(() => {
    const items = [...document.querySelectorAll('[role="menuitem"]')];
    const current = document.querySelector('[role="menuitem"][aria-current="true"]');
    const bottom = items.find((el) => el.textContent?.includes("新建实例"));
    const heads = [...document.querySelectorAll('[role="menu"] div')].filter(
      (el) => el.textContent === "proj2" || el.textContent === "proj1",
    );
    return {
      rowH: current ? current.getBoundingClientRect().height : null,
      bottomH: bottom ? bottom.getBoundingClientRect().height : null,
      foreignHeadBorder: heads.length
        ? getComputedStyle(heads[heads.length - 1]).borderTopWidth
        : null,
    };
  });
  check("当前实例行在场", p1.rowH !== null);
  check(
    `实例行高 40px（基线 45 已回归原型，实测 ${p1.rowH?.toFixed(2)}）`,
    p1.rowH !== null && Math.abs(p1.rowH - 40) <= 1,
  );
  check(
    `钉底「新建实例」42px（实测 ${p1.bottomH?.toFixed(2)}）`,
    p1.bottomH !== null && Math.abs(p1.bottomH - 42) <= 1,
  );
  check(`外项目组头有组间线（border-top ${p1.foreignHeadBorder}）`, p1.foreignHeadBorder === "1px");
  await mp.keyboard.press("Escape");

  console.log("== Part 2：单文件 diff 无变更空态（fileDiff 是服务端抛 NOT_CHANGED 的真实路径） ==");
  await mp.goto(`${ORIGIN}/projects/${PROJECT}?tab=git`);
  // listDiff 正常回 → 点文件行进单文件 diff（GitToolTab 栈内 MobileL3GitDiff）。
  await mp
    .getByRole("button", { name: /main\.ts/ })
    .first()
    .waitFor({ timeout: 10000 });
  await mp
    .getByRole("button", { name: /main\.ts/ })
    .first()
    .click();
  // 终态语义等待：query retry:1（重试窗口 ~1s），直接等「没有变更」渲染完成。
  await mp.getByText("没有变更").waitFor({ timeout: 15000 });
  const p2 = await mp.evaluate(() => ({
    hasNoChanges: document.body.innerText.includes("没有变更"),
    hasFakeError: document.body.innerText.includes("无法打开此差异"),
  }));
  if (!p2.hasNoChanges) {
    // 失败现场 dump：页面文本头 300 字 + file diff 请求是否被 mock 拦截。
    const dump = await mp.evaluate(() => document.body.innerText.slice(0, 300));
    console.log(`  [dump] ${dump.replace(/\n/g, " / ")}`);
    const probe = await mp.evaluate(async () => {
      const r = await fetch("/api/projects/proj1/git/diff/file?scope=worktree&path=main.ts");
      return { status: r.status, body: (await r.text()).slice(0, 80) };
    });
    console.log(`  [probe] file diff fetch → ${probe.status} ${probe.body}`);
  }
  check(`单文件 diff 显「没有变更」（实测 ${p2.hasNoChanges}）`, p2.hasNoChanges);
  check(`无伪错误「无法打开此差异」（实测 ${p2.hasFakeError}）`, !p2.hasFakeError);

  console.log("== Part 3：编辑态辅助条无收起键盘 ==");
  await mp.goto(`${ORIGIN}/projects/${PROJECT}/file/main.ts`);
  await mp.waitForSelector("main .cm-editor", { timeout: 15000 });
  await mp.locator("main .cm-editor").click();
  await mp.waitForTimeout(600);
  const p3 = await mp.evaluate(() => ({
    hasDismiss: document.body.innerText.includes("收起键盘"),
    hasUndo: document.body.innerText.includes("撤销"),
  }));
  check(`「收起键盘」不在场（实测 ${p3.hasDismiss}）`, !p3.hasDismiss);
  check("撤销/重做在场", p3.hasUndo);
  await m.close();

  // ── Part 4-5：桌面视口 ───────────────────────────────────────────────
  const d = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "zh-CN",
    colorScheme: "dark",
  });
  const dp = await d.newPage();
  setupBase(dp);
  await login(dp);

  console.log("== Part 4：两段加载骨架几何一致 ==");
  // detail route 改为手动控制：先挂起量第一段骨架，fulfill 后量第二段（历史回放段）。
  let resolveDetail;
  const detailGate = new Promise((res) => (resolveDetail = res));
  await dp.route(new RegExp(`/api/projects/${PROJECT}/agent-sessions/agent_polish-1$`), (r) =>
    detailGate.then(() => r.fulfill(json(detailBody()))),
  );
  await dp.goto(`${ORIGIN}/projects/${PROJECT}`);
  await dp.waitForTimeout(800);
  await dp.locator('button:has-text("抛光探针会话")').first().click();
  await dp.waitForSelector('main [aria-hidden="true"] .skeleton-shimmer', { timeout: 5000 });
  const seg1 = await dp.evaluate(() => {
    const first = document.querySelector('main [aria-hidden="true"] .skeleton-shimmer');
    const b = first?.closest('[aria-hidden="true"]')?.getBoundingClientRect();
    const f = first.getBoundingClientRect();
    return { x: f.x, y: f.y, rootX: b.x, rootY: b.y };
  });
  resolveDetail();
  await dp.waitForSelector('main [class*="py-4"] [aria-hidden="true"] .skeleton-shimmer', {
    timeout: 15000,
    state: "visible",
  });
  await dp.waitForTimeout(400);
  const seg2 = await dp.evaluate(() => {
    const first = document.querySelector(
      'main [class*="py-4"] [aria-hidden="true"] .skeleton-shimmer',
    );
    const f = first.getBoundingClientRect();
    const scroller = first.closest('[class*="py-4"]');
    return { x: f.x, y: f.y, hasScroller: !!scroller };
  });
  check("第二段骨架在 scroller（py-4）内", seg2.hasScroller);
  check(
    `两段骨架 x 一致（${seg1.x.toFixed(1)} vs ${seg2.x.toFixed(1)}）`,
    Math.abs(seg1.x - seg2.x) <= 0.5,
  );
  check(
    `两段骨架 y 一致（${seg1.y.toFixed(1)} vs ${seg2.y.toFixed(1)}）`,
    Math.abs(seg1.y - seg2.y) <= 0.5,
  );

  console.log("== Part 5：gutter cursor 随主题切换 ==");
  await dp.goto(`${ORIGIN}/projects/${PROJECT}`);
  await dp.waitForTimeout(800);
  await dp.locator('button:has-text("抛光探针会话")').first().click();
  await dp.waitForTimeout(1000);
  await dp.getByRole("button", { name: "分屏", exact: true }).first().click();
  await dp.waitForTimeout(900);
  const readCursor = (theme) =>
    dp.evaluate((t) => {
      document.documentElement.setAttribute("data-theme", t);
      const el = [...document.querySelectorAll("main [aria-hidden]")].find((e) =>
        getComputedStyle(e).cursor.includes("svg+xml"),
      );
      if (!el) return null;
      const c = getComputedStyle(el).cursor;
      const i = c.indexOf("stroke='");
      return { first: i >= 0 ? c.slice(i, i + 22) : null };
    }, theme);
  const curDark = await readCursor("dark");
  const curLight = await readCursor("light");
  await readCursor("dark");
  check(`gutter cursor 用自定义 SVG（dark 首描边色 ${curDark?.first}）`, !!curDark);
  check(
    `两主题 cursor 首描边色随主题切换（dark=${curDark?.first} / light=${curLight?.first}）`,
    !!curDark &&
      !!curLight &&
      curDark.first.includes("000000") &&
      curLight.first.includes("ffffff"),
  );

  await d.close();
} finally {
  await browser.close();
}

console.log(fail === 0 ? `\nPASS (${pass}/${pass + fail})` : `\nFAIL (${pass}/${pass + fail})`);
process.exit(fail === 0 ? 0 : 1);
