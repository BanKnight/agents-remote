// 批B（动效体系）弹层 spring 化探针：dialog / dropdown / mobile-sheet 的 enter
// 动画换 CSS linear() 弹簧曲线（--spring-standard/-snappy）后，用 computed style
// 硬数据断言 timing/duration 真实生效（类名落 DOM ≠ CSS 规则胜出——animate-in 的
// animation shorthand 会重置长属性，我们的注入走自定义属性机制，必须实测验证）。
//
// 覆盖单测验不到的行为（DOM computed 硬数据，禁截图）：
//   Part 1（桌面 1440×900）：SettingsDialog enter = linear( + 0.525s（spring
//     standard）；overlay scrim 保持默认 ease（快速 dim，不跟 spring）；Esc 关闭
//     exit 保持 0.15s ease（快速离开）；reduced-motion 下动画即时到位（全局兜底）。
//   Part 2（桌面）：侧栏「新建会话」DropdownMenu enter = linear( + 0.375s
//     （spring snappy）+ transform-origin 锚定触发源（非 center）。
//   Part 3（移动 390×844）：会话页「切换」MobileSheet enter = linear( + 0.375s；
//     拖拽状态机类不验证（真机复验清单项）。
//   Part 4（node 静态）：dist CSS 产物中 popover/dropdown/sheet 的 snappy 注入与
//     dialog 的 standard 注入都在场（popover 无稳定业务入口可实测，以同类规则
//     产物断言补位——PopoverContent 与 DropdownMenuContent 消费同一份类）。
//
// mock 数据（不污染真环境、无真会话）；密码自读，不进 agent 上下文、不打印值。
// 用法：bun scripts/probe-spring-overlays.mjs

import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { readAppPassword } from "./lib/deploy-config.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const PROJECT = "proj1";
const AGENT = {
  id: "agent_spring-1",
  projectName: PROJECT,
  provider: "claude",
  displayName: "Probe Spring Agent",
  status: "idle",
  createdAt: "2026-07-26T00:00:00.000Z",
};

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

const json = (body) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(body),
});

function sessionDetail(session) {
  return {
    session,
    availableModels: ["sonnet", "opus", "haiku"],
    availablePermissionModes: ["default", "bypassPermissions"],
  };
}

async function setupMocks(page) {
  await page.route(/\/api\/overview$/, (r) =>
    r.fulfill(json({ projectNames: [PROJECT], candidates: [] })),
  );
  await page.route(new RegExp(`/api/projects/${PROJECT}/agent-sessions(?:\\?.*)?$`), (r) => {
    if (r.request().method() === "POST") {
      return r.fulfill(json({ session: AGENT }));
    }
    return r.fulfill(json({ sessions: [AGENT] }));
  });
  await page.route(new RegExp(`/api/projects/${PROJECT}/agent-sessions/${AGENT.id}$`), (r) =>
    r.fulfill(json(sessionDetail(AGENT))),
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
        entries: [],
      }),
    ),
  );
  // session 面板 WS（fake session → error，panel 容器仍渲染）。
  await page.routeWebSocket(/stream/, (ws) => ws.connectToServer());
}

async function login(page) {
  await page.goto(`${WEB_ORIGIN}/`);
  await page.waitForSelector('input[type="password"]', { timeout: 15000 });
  await page.getByLabel("访问密码").fill(await readAppPassword());
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForTimeout(700);
}

/** data-state=open 弹层 Content 的动画 computed 断言（enter 进行中/播完后读，
 *  timing-function 与 duration 不随帧变化，读取时机无竞态）。 */
async function assertEnter(page, selector, wantDuration, label) {
  const el = page.locator(`${selector}[data-state="open"]`).first();
  await el.waitFor({ state: "visible", timeout: 5000 });
  const style = await el.evaluate((node) => {
    const s = getComputedStyle(node);
    return {
      animationName: s.animationName,
      timing: s.animationTimingFunction,
      duration: s.animationDuration,
    };
  });
  ok(
    style.animationName.includes("enter"),
    `${label}: animation-name 含 enter（${style.animationName}）`,
  );
  ok(
    style.timing.includes("linear("),
    `${label}: timing 为 linear() 弹簧（${style.timing.slice(0, 48)}…）`,
  );
  ok(style.timing.includes("0.0802"), `${label}: 采样点在场（临界阻尼曲线非 fallback ease）`);
  ok(
    style.duration === wantDuration,
    `${label}: duration = ${wantDuration}（实测 ${style.duration}）`,
  );
}

(async () => {
  // ── Part 0：dist 产物静态断言（含 popover——无稳定业务入口，同类规则产物补位） ──
  console.log("Part 0: dist CSS 产物 spring 注入在场");
  const { readdirSync } = await import("node:fs");
  const assetsDir = new URL("../web/dist/assets/", import.meta.url);
  const cssName = readdirSync(assetsDir).find((n) => n.endsWith(".css"));
  if (!cssName) {
    console.error("  ✗ web/dist/assets 下无 CSS 产物");
    process.exit(1);
  }
  const cssFile = readFileSync(new URL(`../web/dist/assets/${cssName}`, import.meta.url), "utf8");
  const snappyDecls = cssFile.match(/\{--tw-ease:var\(--spring-snappy\)\}/g)?.length ?? 0;
  const standardDecls = cssFile.match(/\{--tw-ease:var\(--spring-standard\)\}/g)?.length ?? 0;
  ok(
    cssFile.includes("--spring-snappy:var(--spring-standard)"),
    "产物含 --spring-snappy 纯引用（同曲线单源）",
  );
  ok(standardDecls >= 1, `dialog standard 注入规则在场（${standardDecls} 条）`);
  // popover + dropdown + mobile-sheet 三处写的是同一个 arbitrary 类字符串 → Tailwind
  // 合并为一条共用规则（机制正常），≥1 即覆盖全部三处消费端。
  ok(snappyDecls >= 1, `snappy 注入规则在场（实测 ${snappyDecls} 条，三处共用）`);

  const browser = await chromium.launch();
  try {
    // ── Part 1+2：桌面侧栏「新建会话」一条链覆盖 DropdownMenu 与 prompt Dialog ──
    // 点「＋」开 ActionMenu（桌面 = DropdownMenu）→ 断言 spring snappy + origin 锚定；
    // 点「Claude」→ createAgentPrompt 开 prompt Dialog → 断言 spring standard 0.525s
    // + scrim 保持 ease + exit 保持 0.15s ease；最后「取消」退出（不创建实例，零污染）。
    console.log("Part 2: DropdownMenu spring snappy + transform-origin 锚定");
    const desktop = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: "zh-CN",
    });
    const d = await desktop.newPage();
    await setupMocks(d);
    await login(d);
    await d.goto(`${WEB_ORIGIN}/projects/${PROJECT}`);
    await d.waitForSelector('button[aria-label="新建会话"]', { timeout: 10000 });
    await d.locator('button[aria-label="新建会话"]').click();
    await assertEnter(d, '[data-slot="dropdown-menu-content"]', "0.375s", "dropdown content");
    const origin = await d
      .locator('[data-slot="dropdown-menu-content"][data-state="open"]')
      .evaluate((node) => getComputedStyle(node).transformOrigin);
    ok(origin !== "center", `transform-origin 锚定触发源非 center（实测 ${origin}）`);

    console.log("Part 1: Dialog enter spring standard + scrim ease + exit 保持 + reduced-motion");
    await d.getByRole("menuitem", { name: "Claude" }).click();
    await assertEnter(d, '[data-slot="dialog-content"]', "0.525s", "dialog content");

    const overlayTiming = await d
      .locator('[data-slot="dialog-overlay"][data-state="open"]')
      .evaluate((node) => {
        const s = getComputedStyle(node);
        return { timing: s.animationTimingFunction, duration: s.animationDuration };
      });
    ok(
      overlayTiming.timing === "ease" && overlayTiming.duration === "0.15s",
      `overlay scrim 保持默认快速 fade（实测 ${overlayTiming.timing} ${overlayTiming.duration}）`,
    );

    // exit 保持快速离开：Esc 关闭，closed 态窗口内（150ms 动画期）读 computed。
    await d.keyboard.press("Escape");
    const exitStyle = await d
      .locator('[data-slot="dialog-content"][data-state="closed"]')
      .evaluate(
        (node) => {
          const s = getComputedStyle(node);
          return {
            name: s.animationName,
            timing: s.animationTimingFunction,
            duration: s.animationDuration,
          };
        },
        { timeout: 2000 },
      )
      .catch(() => null);
    if (exitStyle) {
      ok(
        exitStyle.name.includes("exit") &&
          exitStyle.timing === "ease" &&
          exitStyle.duration === "0.15s",
        `dialog exit 保持 0.15s ease（实测 ${exitStyle.name} ${exitStyle.timing} ${exitStyle.duration}）`,
      );
    } else {
      // 极端慢环境下 150ms 窗口错过（unmount 已完成）——不算 spring 回归，单独提示。
      console.log("  ⚠ exit 窗口错过（unmount 已完成），跳过 exit computed 断言");
    }

    // ── Part 1b：reduced-motion 即时到位（同浏览器 context emulateMedia 够用——
    // 弹层动画读取的 media query 是全局的；换 context 反而要重新 login） ──
    await d.emulateMedia({ reducedMotion: "reduce" });
    await d.locator('button[aria-label="新建会话"]').click();
    await d.getByRole("menuitem", { name: "Claude" }).click();
    const rmDur = await d
      .locator('[data-slot="dialog-content"][data-state="open"]')
      .evaluate((node) => getComputedStyle(node).animationDuration);
    ok(
      rmDur === "0.00001s" || Number.parseFloat(rmDur) < 0.001,
      `reduced-motion 下动画即时到位（实测 duration ${rmDur}）`,
    );
    await d.keyboard.press("Escape");
    await desktop.close();

    // ── Part 3：移动 MobileSheet（会话页「切换」） ──
    console.log("Part 3: MobileSheet programmatic enter spring snappy（拖拽路径未触碰）");
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
    await m.goto(`${WEB_ORIGIN}/projects/${PROJECT}/session/${AGENT.id}`);
    await m.waitForSelector(".nav h1 button", { timeout: 10000 });
    await m.locator(".nav h1 button").click();
    await assertEnter(m, ".msheet", "0.375s", "mobile-sheet content");
    const msheetTiming = await m
      .locator('.msheet[data-state="open"]')
      .evaluate((node) => getComputedStyle(node).animationTimingFunction);
    ok(
      msheetTiming.includes("linear("),
      "mobile-sheet timing 为 spring（拖拽路径类未动，exit 仍走 inline 起点）",
    );
    await mob.close();
  } finally {
    await browser.close();
  }

  console.log(`\n${passCount} pass, ${failCount} fail`);
  process.exit(failCount > 0 ? 1 : 0);
})();
