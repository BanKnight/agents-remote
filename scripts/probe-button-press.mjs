// 批E(动效体系)button press 微交互探针:ui Button(button.tsx)的
//   ① active 反馈 = scale(0.97)(取代 1px translate)——按住读 computed transform
//     = matrix(...0.97...);松手回 none。aria-haspopup 的弹层 trigger 例外
//     (锚点稳定,不缩)——DOM setAttribute 临时加属性验证 CSS 条件命中。
//   ② transition-all 收窄为 transform/background-color/box-shadow——computed
//     transitionProperty 精确三属性(不含 all)。
//
// 样本 = 「新建会话」链打开的 prompt Dialog 内按钮(桌面工作台无常驻 ui Button;
// 批B 探针同款链)。mock 无需;密码自读,不进 agent 上下文、不打印值。
// 用法:bun scripts/probe-button-press.mjs

import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const PROJECT = "proj1";
// overview mock:侧栏实例组头(「新建会话」钮的宿主)需要至少一个项目/会话在场。
const AGENT = {
  id: "agent_press-1",
  projectName: PROJECT,
  provider: "claude",
  displayName: "Probe Press 1",
  status: "idle",
  createdAt: "2026-07-26T00:00:00.000Z",
};

const json = (body) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(body),
});

async function setupMocks(page) {
  await page.route(/\/api\/overview$/, (r) =>
    r.fulfill(
      json({
        projectNames: [PROJECT],
        candidates: [{ type: "agent", sessionId: AGENT.id, ...AGENT }],
      }),
    ),
  );
  await page.route(new RegExp(`/api/projects/${PROJECT}/agent-sessions(?:\\?.*)?$`), (r) =>
    r.fulfill(json({ sessions: [AGENT] })),
  );
  await page.route(new RegExp(`/api/projects/${PROJECT}/agent-sessions/${AGENT.id}$`), (r) =>
    r.fulfill(
      json({ session: AGENT, availableModels: ["sonnet"], availablePermissionModes: ["default"] }),
    ),
  );
  await page.route(new RegExp(`/api/projects/${PROJECT}/terminal-sessions(?:\\?.*)?$`), (r) =>
    r.fulfill(json({ sessions: [] })),
  );
  await page.routeWebSocket(/stream/, (ws) => ws.connectToServer());
}

let passCount = 0;
let failCount = 0;
function ok(cond, msg) {
  if (cond) {
    passCount++;
    console.log(`  ✓ ${msg}`);
  } else {
    failCount++;
    console.error(`  ✗ ${msg}`);
  }
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "zh-CN" });
  const page = await ctx.newPage();
  await setupMocks(page);
  await page.goto(`${WEB_ORIGIN}/`);
  await page.waitForSelector('input[type="password"]', { timeout: 15000 });
  await page.getByLabel("访问密码").fill(await readAppPassword());
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForTimeout(700);

  // 桌面侧栏「新建会话」ActionMenu → 「Claude」→ prompt Dialog(弹层内 ui Button)。
  await page.goto(`${WEB_ORIGIN}/projects/${PROJECT}`);
  await page.waitForTimeout(600);
  await page.locator('[aria-label="新建会话"]').first().click();
  await page.waitForTimeout(400); // dropdown spring 播放中
  await page.getByRole("menuitem", { name: "Claude" }).click();
  await page.waitForTimeout(400); // dialog spring 播放中
  const cancel = page
    .locator('[role="dialog"] button[data-slot="button"]', { hasText: /取消/ })
    .first();
  await cancel.waitFor({ timeout: 8000 });

  // ── Part 1:transition 收窄断言 ──
  console.log("Part 1: transitionProperty 收窄为三属性");
  const tp = await cancel.evaluate((el) => getComputedStyle(el).transitionProperty);
  const props = new Set(
    tp
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean),
  );
  ok(
    props.has("transform") && props.has("background-color") && props.has("box-shadow"),
    `transition 含 transform/background-color/box-shadow(实测 ${tp})`,
  );
  ok(!props.has("all"), `不含 all(实测 ${tp})`);

  // ── Part 2:active scale 0.97(skill §1 pointer-down 即反馈) ──
  console.log("Part 2: 按住 scale 0.97,松手回 none");
  const box = await cancel.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(250); // 等过渡播完(默认 150ms),采终态 0.97 非中间值
  const pressed = await cancel.evaluate((el) => getComputedStyle(el).scale);
  ok(pressed === "0.97", `按住 scale = 0.97(实测 ${pressed})`);
  // 松手前把指针移开:down/up 异元素时 click 落最近公共祖先,避免 click 命中
  // 「取消」把 dialog 关掉(down 在按钮上按住 60ms 已完成断言采样)。
  await page.mouse.move(box.x + box.width / 2, 10);
  await page.mouse.up();
  await page.waitForTimeout(300);
  const released = await cancel.evaluate((el) => getComputedStyle(el).scale);
  ok(released === "none", `松手 scale = none(实测 ${released})`);

  // ── Part 3:aria-haspopup trigger 例外(不缩,锚点稳定) ──
  console.log("Part 3: aria-haspopup trigger 按住不缩");
  const exempt = await page.evaluate(() => {
    const el = document.querySelector('[role="dialog"] button[data-slot="button"]');
    if (!el) return null;
    el.setAttribute("aria-haspopup", "menu"); // 纯 DOM 层验证 CSS 条件,不动 React props
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (exempt) {
    await page.mouse.move(exempt.x, exempt.y);
    await page.mouse.down();
    await page.waitForTimeout(60);
    const exPressed = await page.evaluate(() => {
      const el = document.querySelector(
        '[role="dialog"] button[data-slot="button"][aria-haspopup="menu"]',
      );
      return getComputedStyle(el).scale;
    });
    ok(exPressed === "none", `haspopup trigger 按住 scale = none(实测 ${exPressed})`);
    await page.mouse.move(exempt.x, 10); // 同 Part 2:移开再松手,防 click 误触按钮
    await page.mouse.up();
  } else {
    console.error("  ✗ dialog 内无 ui Button 样本");
    failCount++;
  }

  await browser.close();
  console.log(`\n${passCount} pass, ${failCount} fail`);
  process.exit(failCount > 0 ? 1 : 0);
})();
