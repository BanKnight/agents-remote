// 移动端动效批探针（sheet 升起 + 逐项入场 + 触屏按压统一）：
//   Part 1（移动 390×844）：project scope ⋯ ActionMenu sheet——role="menu" 容器挂
//     .animate-stagger-rows，菜单项 animation-name = stagger-row-enter、delay 按
//     nth-child 递增（0/28/56ms）、fill backwards（frontend-notes §17）。
//   Part 1b（移动）：「打开即下拉」——enter 升起中立即按住 grab 拖 40px：拖拽即时接管
//     （inline transform = translateY(40px)、getAnimations 清空、enterKilled 从 className
//     摘掉 animate-in 串——WebKit cancel 后会重建动画实例，样式失配才彻底死亡），慢速松
//     手回弹（非 dismiss），exit 类串仍在（关闭动画能力未被破坏）。
//   Part 1c（移动）：关闭后重开——enterKilled 重置，enter 类串回归、动画重播。
//   Part 2（移动）：/projects 全部会话行（.srow2 CSS 单源）按住 scale 0.98——
//     中段 rAF 采样有中间值（真插值非瞬切，§19）+ transitionrun 派发 + 松手释放。
//   Part 3（移动）：底 nav 项（NavItemContent）按住 scale 0.98 + transition 收窄
//     [scale, background-color] + fast 档时长。
//   Part 4（桌面 1440×900，共享行原语）：文件树 ListRow（DraggableListRow）按住
//     scale 0.98——行按压两端同构（多端同构原则，utility 侧断言）。
//
// sheet 全程升起（enter 0.45s + --tw-enter-translate-y:100%）断言在
// probe-spring-overlays.mjs Part 3，不重复。mock 数据不污染真环境；密码自读，
// 不进 agent 上下文、不打印值。用法：bun scripts/probe-mobile-motion.mjs

import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const PROJECT = "proj1";
const AGENT = {
  id: "agent_mob-1",
  projectName: PROJECT,
  provider: "claude",
  displayName: "Probe Mobile 1",
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
  await page.route(/\/api\/projects\/proj1\/files(?:\?.*)?$/, (r) =>
    r.fulfill(
      json({
        projectName: PROJECT,
        path: "",
        parentPath: null,
        entries: [
          { name: "src", path: "src", type: "directory", hidden: false, size: 0 },
          { name: "README.md", path: "README.md", type: "file", hidden: false, size: 128 },
        ],
      }),
    ),
  );
  await page.route(/\/api\/root\/files$/, (r) =>
    r.fulfill(
      json({
        entries: [{ name: "proj1", path: "proj1", type: "directory", hidden: false, size: 0 }],
      }),
    ),
  );
  await page.routeWebSocket(/stream/, (ws) => ws.connectToServer());
}

async function login(page) {
  await page.goto(`${WEB_ORIGIN}/`);
  await page.waitForSelector('input[type="password"]', { timeout: 15000 });
  await page.getByLabel("访问密码").fill(await readAppPassword());
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForTimeout(700);
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

/** 行/nav 项按压统一断言：页面内 rAF 逐帧采样 + transitionrun 双证据（Node 侧定时
 *  采样往返可慢于 120ms 过渡窗口 = 假 fail，probe-button-press 实测范式），终态读
 *  computed scale（§19 独立属性），松手移开指针防 click 误导航。 */
async function pressAssert(page, sel, locator, label) {
  await page.evaluate((s) => {
    window.__pressSamples = [];
    window.__pressRun = false;
    const el = document.querySelector(s);
    el?.addEventListener("transitionrun", (e) => {
      if (e.propertyName === "scale") window.__pressRun = true;
    });
    const t0 = performance.now();
    const tick = () => {
      window.__pressSamples.push(getComputedStyle(el).scale);
      if (performance.now() - t0 < 800) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, sel);
  const box = await locator.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(350); // 覆盖 120ms 过渡 + 余量（rAF 采样已在页内自持）
  const press = await page.evaluate(() => ({
    run: window.__pressRun,
    samples: window.__pressSamples,
  }));
  const mids = press.samples
    .map(Number.parseFloat)
    .filter((v) => Number.isFinite(v) && v > 0.98 && v < 1);
  ok(press.run, `${label}: 按住派发 transitionrun(scale)（真过渡非瞬切）`);
  ok(
    mids.length > 0,
    `${label}: 过渡中间值 0.98 < scale < 1 存在（实测 ${mids.length} 帧，峰值 ${Math.max(...mids, 0)}）`,
  );
  const pressed = await locator.evaluate((el) => getComputedStyle(el).scale);
  ok(pressed === "0.98", `${label}: 按住终态 scale = 0.98（实测 ${pressed}）`);
  // 移开再松手：click 落最近公共祖先（html），不触发行导航。
  await page.mouse.move(box.x + box.width / 2, 10);
  await page.mouse.up();
  await page.waitForTimeout(250);
  const released = await locator.evaluate((el) => getComputedStyle(el).scale);
  ok(released === "none", `${label}: 松手 scale = none（实测 ${released}）`);
}

(async () => {
  const browser = await chromium.launch();

  // ── 移动 context（390×844）──
  const mob = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    locale: "zh-CN",
  });
  const m = await mob.newPage();
  await setupMocks(m);
  await login(m);

  // Part 1：ActionMenu 移动 sheet 逐项交错入场
  console.log("Part 1: ActionMenu sheet stagger 逐项入场");
  await m.goto(`${WEB_ORIGIN}/projects/${PROJECT}`);
  await m.locator('[aria-label="更多操作"]').waitFor({ timeout: 10000 });
  await m.locator('[aria-label="更多操作"]').click();
  await m.locator('.msheet[data-state="open"]').waitFor({ timeout: 8000 });
  const menuAnim = await m.evaluate(() => {
    const s = (i) => {
      const el = document.querySelector(`[role="menu"] > :nth-child(${i})`);
      return el ? getComputedStyle(el) : null;
    };
    const first = s(1);
    const second = s(2);
    const third = s(3);
    return {
      name: first?.animationName,
      d1: first?.animationDelay,
      d2: second?.animationDelay,
      d3: third?.animationDelay,
      fill: first?.animationFillMode,
    };
  });
  ok(
    menuAnim.name === "stagger-row-enter",
    `菜单项动画名 = stagger-row-enter（实测 ${menuAnim.name}）`,
  );
  ok(menuAnim.d1 === "0s", `菜单项 1 delay = 0s（实测 ${menuAnim.d1}）`);
  ok(menuAnim.d2 === "0.028s", `菜单项 2 delay = 28ms 递增（实测 ${menuAnim.d2}）`);
  ok(menuAnim.d3 === "0.056s", `菜单项 3 delay = 56ms 递增（实测 ${menuAnim.d3}）`);
  ok(menuAnim.fill === "backwards", `fill = backwards（实测 ${menuAnim.fill}）`);
  // 菜单项按压（mobileSheetItemClasses utility 侧）：按住 0.98。先等 450ms 升起播完——
  // sheet 尚在视口外（translateY(100%)）时 boundingBox 落在屏外，mouse.down 不命中任何
  // 元素 = 无 :active（诊断实测 y=845.8 > 844 视口高）。
  await m.waitForTimeout(650);
  const menuItem = m.locator('[role="menu"] > button').first();
  await menuItem.waitFor({ timeout: 5000 });
  await pressAssert(m, '[role="menu"] > button:nth-child(1)', menuItem, "sheet 菜单项");
  await m.getByRole("menuitem", { name: "取消" }).click();
  await m.locator('.msheet[data-state="open"]').waitFor({ state: "detached", timeout: 3000 });

  // Part 1b：「打开即下拉」——sheet enter（450ms 全程升起）播放中按住 grab 往下拖。
  // 修复前（WebKit）：cancel 后 animation-name 仍匹配 → 动画实例重建 → keyframes transform
  // 压过 inline → 拖不动（真机「打开即下拉必失败」）；修复后 enterKilled 摘类 = 样式失配，
  // 动画死亡。自然时序窗口 = ~17px 热区 × spring 升速，Playwright 原子事件序的 boundingBox
  // 往返必 race 输（本段首跑实锤：down 落点错过热区，inline 恒空）——WAAPI 把 enter 动画
  // pause 定格在 t=200ms（升起中段），grab 静止 = 确定性 fixture；拖拽接管的 cancel + 摘类
  // 对 paused 动画同样生效，验证力度不减反增（任意时刻可打断）。
  console.log("Part 1b: 打开即下拉（enter 播放中拖拽即时接管）");
  await m.locator('[aria-label="更多操作"]').click();
  await m.locator('.msheet[data-state="open"]').waitFor({ timeout: 8000 });
  await m.evaluate(() => {
    for (const a of document.querySelector(".msheet").getAnimations()) {
      a.pause();
      a.currentTime = 200;
    }
  });
  const grab = await m.locator(".msheet .grab").boundingBox();
  await m.mouse.move(grab.x + grab.width / 2, grab.y + grab.height / 2);
  await m.mouse.down();
  // 分步下拖 40px，步间 30ms 压低末速（v≈0.33px/ms < 0.5，防误判惯性 dismiss）。
  for (let i = 1; i <= 4; i++) {
    await m.mouse.move(grab.x + grab.width / 2, grab.y + grab.height / 2 + i * 10);
    await m.waitForTimeout(30);
  }
  const during = await m.evaluate(() => {
    const el = document.querySelector(".msheet");
    return {
      inline: el.style.transform,
      computed: getComputedStyle(el).transform,
      anims: el.getAnimations().length,
      cls: el.className,
    };
  });
  ok(
    during.inline === "translateY(40px)",
    `打开即下拉: 拖 40px 后 inline transform 即时跟手（实测 ${during.inline}）`,
  );
  ok(
    during.computed.includes("40"),
    `打开即下拉: computed transform 同步（实测 ${during.computed}）`,
  );
  ok(during.anims === 0, `打开即下拉: getAnimations 已清空（实测 ${during.anims}）`);
  ok(
    !during.cls.includes("data-[state=open]:animate-in"),
    "打开即下拉: enterKilled 已摘 animate-in 类串（WebKit 重建防护生效）",
  );
  // 慢速松手 → 回弹分支：sheet 仍在、exit 类串未受影响。
  await m.mouse.up();
  await m.waitForTimeout(280); // 覆盖 200ms 回弹
  const afterBack = await m.evaluate(() => {
    const el = document.querySelector(".msheet");
    return { state: el?.getAttribute("data-state"), cls: el?.className ?? "" };
  });
  ok(
    afterBack.state === "open",
    `打开即下拉: 慢速 40px 松手走回弹非 dismiss（data-state=${afterBack.state}）`,
  );
  ok(
    afterBack.cls.includes("data-[state=closed]:animate-out"),
    "打开即下拉: 回弹后 exit 类串仍在（关闭动画能力未破坏）",
  );
  await m.getByRole("menuitem", { name: "取消" }).click();
  await m.locator('.msheet[data-state="open"]').waitFor({ state: "detached", timeout: 3000 });

  // Part 1c：重开验证 enterKilled 重置——enter 类串回归、动画重播。
  console.log("Part 1c: 关闭重开后 enter 动画恢复（enterKilled 重置）");
  await m.locator('[aria-label="更多操作"]').click();
  await m.locator('.msheet[data-state="open"]').waitFor({ timeout: 8000 });
  const reopened = await m.evaluate(() => {
    const el = document.querySelector(".msheet");
    return { cls: el.className, anims: el.getAnimations().length };
  });
  ok(
    reopened.cls.includes("data-[state=open]:animate-in"),
    "重开: animate-in 类串回归（enterKilled 已重置）",
  );
  ok(reopened.anims > 0, `重开: enter 动画重播中（实测 ${reopened.anims} 个动画实例）`);
  await m.getByRole("menuitem", { name: "取消" }).click();
  await m.locator('.msheet[data-state="open"]').waitFor({ state: "detached", timeout: 3000 });

  // Part 2：移动 /projects 首页活动行（mobile-projects-home，触屏按压统一三处之一）
  console.log("Part 2: 首页活动行按住 scale 0.98");
  await m.goto(`${WEB_ORIGIN}/projects`);
  await m.locator("button.flex-col").first().waitFor({ timeout: 10000 });
  await pressAssert(m, "button.flex-col", m.locator("button.flex-col").first(), "首页活动行");

  // Part 3：底 nav 项（NavItemContent）按压
  console.log("Part 3: 底 nav 项按住 scale 0.98");
  const navA = m.locator('nav[aria-label="移动端主导航"] a').nth(2);
  await navA.waitFor({ timeout: 8000 });
  const navTp = await navA.evaluate((el) => {
    const s = getComputedStyle(el.querySelector("span"));
    return { tp: s.transitionProperty, dur: s.transitionDuration };
  });
  const navProps = new Set(navTp.tp.split(",").map((p) => p.trim()));
  ok(
    navProps.has("scale") && navProps.has("background-color"),
    `nav 项 transition 含 scale/background-color（实测 ${navTp.tp}）`,
  );
  ok(navTp.dur === "0.12s", `nav 项 duration = fast 档 120ms（实测 ${navTp.dur}）`);
  await pressAssert(
    m,
    'nav[aria-label="移动端主导航"] a:nth-child(3) > span',
    navA.locator("span").first(),
    "nav 项",
  );

  await mob.close();

  // ── 桌面 context（1440×900）：共享行原语（srow2 单源 / ListRow）按压同构 ──
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "zh-CN" });
  const page = await ctx.newPage();
  await setupMocks(page);
  await login(page);

  console.log("Part 4: 桌面左栏 srow2.inst 行按住 scale 0.98（CSS 单源）");
  await page.goto(`${WEB_ORIGIN}/projects/${PROJECT}`);
  await page.locator("button.srow2.inst").first().waitFor({ timeout: 10000 });
  const srow2Tp = await page.evaluate(() => {
    const s = getComputedStyle(document.querySelector("button.srow2.inst"));
    return { tp: s.transitionProperty, dur: s.transitionDuration };
  });
  ok(
    srow2Tp.tp
      .split(",")
      .map((p) => p.trim())
      .includes("scale"),
    `srow2 transition 含 scale（实测 ${srow2Tp.tp}）`,
  );
  ok(srow2Tp.dur === "0.12s", `srow2 transition duration = fast 档 120ms（实测 ${srow2Tp.dur}）`);
  await pressAssert(
    page,
    "button.srow2.inst",
    page.locator("button.srow2.inst").first(),
    "srow2 行",
  );

  console.log("Part 5: 桌面文件树 ListRow 按住 scale 0.98（共享行原语）");
  await page.goto(`${WEB_ORIGIN}/files`);
  const projRow = page.locator(".gfcard button", { hasText: "proj1" }).first();
  await projRow.waitFor({ timeout: 10000 });
  await projRow.click();
  await page.locator('[aria-label="Project files"]').waitFor({ timeout: 8000 });
  await pressAssert(
    page,
    '[aria-label="Project files"] > :nth-child(1)',
    page.locator('[aria-label="Project files"] > :nth-child(1)').first(),
    "ListRow 行",
  );

  await ctx.close();
  await browser.close();
  console.log(`\n${passCount} pass, ${failCount} fail`);
  process.exit(failCount > 0 ? 1 : 0);
})();
