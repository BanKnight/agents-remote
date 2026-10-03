// 移动端动效批探针（sheet 升起 + 逐项入场 + 触屏按压统一）：
//   Part 1（移动 390×844）：project scope ⋯ ActionMenu sheet——role="menu" 容器挂
//     .animate-stagger-rows，菜单项 animation-name = stagger-row-enter、delay 按
//     nth-child 递增（0/28/56ms）、fill backwards（frontend-notes §17）。
//   Part 1b（移动）：「打开即下拉」——enter 升起中按住 grab 拖 40px：拖拽即时接管
//     （inline transform = translateY(40px)、getAnimations 清空、enterKilled 从 className
//     摘掉 animate-in 串——WebKit cancel 后会重建动画实例，样式失配才彻底死亡），慢速松
//     手回弹（非 dismiss），exit 类串仍在（关闭动画能力未被破坏）。
//   Part 1b2（移动）：升起期宽热区——升起中按**内容区**（非热区）也即时接管。
//   Part 1b3/1b4/1b5（移动）：播完后按内容可滚性分档——不可滚（菜单）整面可拖；
//     可滚（人为造溢出 fixture）保窄热区拒绝；内容区上滑放弃手势不劫持。
//   Part 1b3（移动）：防过宽——enter 播完后窄热区回归，内容区拖动不接管。
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
  const top0 = await m.evaluate(
    () => document.querySelector(".msheet").getBoundingClientRect().top,
  );
  await m.mouse.move(grab.x + grab.width / 2, grab.y + grab.height / 2);
  await m.mouse.down();
  // 分步下拖 40px，步间 30ms 压低末速（v≈0.33px/ms < 0.5，防误判惯性 dismiss）。
  for (let i = 1; i <= 4; i++) {
    await m.mouse.move(grab.x + grab.width / 2, grab.y + grab.height / 2 + i * 10);
    await m.waitForTimeout(30);
  }
  const during = await m.evaluate(() => {
    const el = document.querySelector(".msheet");
    const computed = getComputedStyle(el).transform;
    return {
      top: el.getBoundingClientRect().top,
      inline: el.style.transform,
      m42: computed === "none" ? 0 : new DOMMatrixReadOnly(computed).m42,
      anims: el.getAnimations().length,
      cls: el.className,
    };
  });
  // 视觉跟手且无跳变：手指移 40px，sheet 视觉顶同移 40px（±3 容差）——修复前直接写
  // translateY(dy) 会从升起中段瞬跳到近终态再跟手（位移 = 40-base ≠ 40）。
  const visShift = during.top - top0;
  ok(
    Math.abs(visShift - 40) <= 3,
    `打开即下拉: 手指移 40px 视觉跟手无跳变（实测视觉移 ${visShift.toFixed(1)}px）`,
  );
  const inlineN = Number.parseFloat(during.inline.replace("translateY(", "")) || 0;
  ok(
    Math.abs(during.m42 - inlineN) < 1 && inlineN > 0,
    `打开即下拉: 视觉由 inline 决定（computed m42=${during.m42.toFixed(1)} ≈ inline ${inlineN}，动画未压过）`,
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

  // Part 1b2：升起期宽热区——enter 运行期（open + Content 自身动画在播）内容尚未就位
  // 无交互意义，整个 Content 可起拖。定格同一窗口，down 落在 grab 下方 ~80px 的菜单项区
  // （非热区）→ 拖 40px 应即时接管（真机取证定的真根因在「播完后窄热区拒绝」段，见 1b3；
  // 此段覆盖升起期窗口的宽热区行为）。
  console.log("Part 1b2: 升起中按内容区（非热区）也即时接管");
  await m.locator('[aria-label="更多操作"]').click();
  await m.locator('.msheet[data-state="open"]').waitFor({ timeout: 8000 });
  await m.evaluate(() => {
    for (const a of document.querySelector(".msheet").getAnimations()) {
      a.pause();
      a.currentTime = 200;
    }
  });
  const grab2 = await m.locator(".msheet .grab").boundingBox();
  const top0b = await m.evaluate(
    () => document.querySelector(".msheet").getBoundingClientRect().top,
  );
  await m.mouse.move(grab2.x + grab2.width / 2, grab2.y + 80); // 内容区（菜单项上），非热区
  await m.mouse.down();
  for (let i = 1; i <= 4; i++) {
    await m.mouse.move(grab2.x + grab2.width / 2, grab2.y + 80 + i * 10);
    await m.waitForTimeout(30);
  }
  const during2 = await m.evaluate(() => {
    const el = document.querySelector(".msheet");
    const computed = getComputedStyle(el).transform;
    return {
      top: el.getBoundingClientRect().top,
      inline: el.style.transform,
      m42: computed === "none" ? 0 : new DOMMatrixReadOnly(computed).m42,
      anims: el.getAnimations().length,
      cls: el.className,
    };
  });
  const visShift2 = during2.top - top0b;
  ok(
    Math.abs(visShift2 - 40) <= 3,
    `内容区起拖: pending 建立、视觉跟手无跳变（实测视觉移 ${visShift2.toFixed(1)}px）`,
  );
  const inlineN2 = Number.parseFloat(during2.inline.replace("translateY(", "")) || 0;
  ok(
    Math.abs(during2.m42 - inlineN2) < 1 && inlineN2 > 0,
    `内容区起拖: 视觉由 inline 决定（computed m42=${during2.m42.toFixed(1)} ≈ inline ${inlineN2}）`,
  );
  ok(during2.anims === 0, `内容区起拖: enter 动画已 cancel+摘类（实测 anims=${during2.anims}）`);
  ok(
    !during2.cls.includes("data-[state=open]:animate-in"),
    "内容区起拖: enterKilled 摘类生效（WebKit 重建防护）",
  );
  await m.mouse.up();
  await m.waitForTimeout(280);
  const back2 = await m.evaluate(() =>
    document.querySelector(".msheet")?.getAttribute("data-state"),
  );
  ok(back2 === "open", `内容区起拖: 慢速松手回弹非 dismiss（data-state=${back2}）`);
  await m.getByRole("menuitem", { name: "取消" }).click();
  await m.locator('.msheet[data-state="open"]').waitFor({ state: "detached", timeout: 3000 });

  // Part 1b3：播完后内容区仍可拖（真机取证定的根因修复：450ms 播完后手指落在内容区曾是
  // 窄热区拒绝 = 「打开后拖必失败」的真根因——人的「打开→按下拖」反应必然超过 450ms；
  // 现在按内容可滚性分档，ActionMenu 菜单不可滚 → 整面可拖。拖成功同时证明
  // hasScrollableContent 对菜单判 false）。
  console.log("Part 1b3: 播完后内容区仍可拖（不可滚 sheet 整面起拖）");
  await m.locator('[aria-label="更多操作"]').click();
  await m.locator('.msheet[data-state="open"]').waitFor({ timeout: 8000 });
  await m.waitForTimeout(650); // 等 450ms enter 播完（§18）
  const grab3 = await m.locator(".msheet .grab").boundingBox();
  const top3 = await m.evaluate(
    () => document.querySelector(".msheet").getBoundingClientRect().top,
  );
  await m.mouse.move(grab3.x + grab3.width / 2, grab3.y + 80); // 内容区（菜单项上）
  await m.mouse.down();
  for (let i = 1; i <= 4; i++) {
    await m.mouse.move(grab3.x + grab3.width / 2, grab3.y + 80 + i * 10);
    await m.waitForTimeout(30);
  }
  const during3 = await m.evaluate(() => {
    const el = document.querySelector(".msheet");
    const computed = getComputedStyle(el).transform;
    return {
      top: el.getBoundingClientRect().top,
      inline: el.style.transform,
      m42: computed === "none" ? 0 : new DOMMatrixReadOnly(computed).m42,
    };
  });
  const visShift3 = during3.top - top3;
  ok(
    Math.abs(visShift3 - 40) <= 3,
    `播完后: 内容区起拖仍接管、视觉跟手（实测视觉移 ${visShift3.toFixed(1)}px）`,
  );
  const inlineN3 = Number.parseFloat(during3.inline.replace("translateY(", "")) || 0;
  ok(
    Math.abs(during3.m42 - inlineN3) < 1 && inlineN3 > 0,
    `播完后: 视觉由 inline 决定（m42=${during3.m42.toFixed(1)} ≈ inline ${inlineN3}）`,
  );
  // 慢速松手回弹（非 dismiss），再正常取消关闭。
  await m.mouse.up();
  await m.waitForTimeout(280);
  await m.getByRole("menuitem", { name: "取消" }).click();
  await m.locator('.msheet[data-state="open"]').waitFor({ state: "detached", timeout: 3000 });

  // Part 1b4：可滚内容区保窄热区——列表类 sheet 的原生滚动不被拖拽劫持。页内给菜单容器
  // 人为造溢出（max-height + overflow-y:auto）作可滚 fixture，播完后按内容区拖 → 拒绝。
  console.log("Part 1b4: 可滚内容区仍走窄热区拒绝");
  await m.locator('[aria-label="更多操作"]').click();
  await m.locator('.msheet[data-state="open"]').waitFor({ timeout: 8000 });
  await m.waitForTimeout(650);
  await m.evaluate(() => {
    const menu = document.querySelector('[role="menu"]');
    menu.style.maxHeight = "120px";
    menu.style.overflowY = "auto";
  });
  const grab4 = await m.locator(".msheet .grab").boundingBox();
  await m.mouse.move(grab4.x + grab4.width / 2, grab4.y + 80);
  await m.mouse.down();
  for (let i = 1; i <= 4; i++) {
    await m.mouse.move(grab4.x + grab4.width / 2, grab4.y + 80 + i * 10);
    await m.waitForTimeout(30);
  }
  const during4 = await m.evaluate(() => ({
    inline: document.querySelector(".msheet").style.transform,
  }));
  ok(
    during4.inline === "",
    `可滚 sheet: 内容区拖动仍拒绝、inline 恒空（实测 "${during4.inline}"）`,
  );
  // 未 capture → click 落 down/up 公共祖先：移开指针再松手防误触菜单项导航。
  await m.mouse.move(grab4.x + grab4.width / 2, 10);
  await m.mouse.up();
  await m.waitForTimeout(250);
  await m.getByRole("menuitem", { name: "取消" }).click();
  await m.locator('.msheet[data-state="open"]').waitFor({ state: "detached", timeout: 3000 });

  // Part 1b5：内容区上滑 = 放弃手势（向上是滚动/选择方向，不劫持；回 idle 后菜单项
  // 照常可点）。
  console.log("Part 1b5: 内容区上滑放弃手势");
  await m.locator('[aria-label="更多操作"]').click();
  await m.locator('.msheet[data-state="open"]').waitFor({ timeout: 8000 });
  await m.waitForTimeout(650);
  const grab5 = await m.locator(".msheet .grab").boundingBox();
  await m.mouse.move(grab5.x + grab5.width / 2, grab5.y + 80);
  await m.mouse.down();
  for (let i = 1; i <= 3; i++) {
    await m.mouse.move(grab5.x + grab5.width / 2, grab5.y + 80 - i * 10); // 向上滑
    await m.waitForTimeout(30);
  }
  const during5 = await m.evaluate(() => ({
    inline: document.querySelector(".msheet").style.transform,
  }));
  ok(during5.inline === "", `上滑: 放弃手势、inline 恒空（实测 "${during5.inline}"）`);
  await m.mouse.up();
  await m.waitForTimeout(250);
  await m.getByRole("menuitem", { name: "取消" }).click();
  await m.locator('.msheet[data-state="open"]').waitFor({ state: "detached", timeout: 3000 });

  // Part 1b6：回弹弹簧收敛（速度继承的数值验证在 springStep/simulateSpringBack 单测——
  // CDP 输入节流做不出高松手速度，诊断实测 4×5px/5ms 只得 0.17px/ms；此处断言回弹发生、
  // 逐帧收敛到 0、收敛后 inline 清空交还 Radix 动画）。
  console.log("Part 1b6: 回弹弹簧收敛");
  await m.locator('[aria-label="更多操作"]').click();
  await m.locator('.msheet[data-state="open"]').waitFor({ timeout: 8000 });
  await m.evaluate(() => {
    for (const a of document.querySelector(".msheet").getAnimations()) {
      a.pause();
      a.currentTime = 200;
    }
    window.__spring = [];
    const tick = () => {
      const t = getComputedStyle(document.querySelector(".msheet")).transform;
      window.__spring.push(t === "none" ? 0 : new DOMMatrixReadOnly(t).m42);
      if (window.__spring.length < 50) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const grab6 = await m.locator(".msheet .grab").boundingBox();
  await m.mouse.move(grab6.x + grab6.width / 2, grab6.y + grab6.height / 2);
  await m.mouse.down();
  for (let i = 1; i <= 4; i++) {
    await m.mouse.move(grab6.x + grab6.width / 2, grab6.y + grab6.height / 2 + i * 5);
    await m.waitForTimeout(5);
  }
  await m.mouse.up();
  await m.waitForTimeout(700); // 覆盖采样 50 帧与 spring 收敛
  const springRes = await m.evaluate(() => ({
    peak: Math.max(...window.__spring),
    last: window.__spring[window.__spring.length - 1],
    transform: getComputedStyle(document.querySelector(".msheet")).transform,
  }));
  ok(
    springRes.peak > 0 && springRes.last < 1 && springRes.transform === "none",
    `回弹弹簧: 发生且逐帧收敛到 0、inline 清空（峰值 ${springRes.peak.toFixed(1)} → 末值 ${springRes.last.toFixed(2)}，computed=${springRes.transform}）`,
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
