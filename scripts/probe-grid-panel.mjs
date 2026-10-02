// 批D(动效体系)右栏 grid 轨道过渡探针:右栏列宽 = grid 第三轨
// var(--workbench-right-col)(0px ↔ 22rem),.workbench-grid-animated 挂
// transition: grid-template-columns。硬数据断言:
//   Part 1:idle 态 grid 容器 computed transitionProperty 含 grid-template-columns
//     (动画类在场),折叠态第三轨 = 0px。
//   Part 2:展开(点唤出钮)→ transitionrun 派发(grid-template-columns,真过渡非瞬切)
//     → 播完收敛 352px(22rem)。
//   Part 3:拖宽 1:1 优先——gutter pointerdown 后 transition 摘除(rightResizing
//     摘类),pointerup 后恢复;拖拽中宽度即时跟手(每帧 atom 直改,无 transition)。
//   Part 4:折叠(点 » )同一条 transition 反方向 → 中间值 → 0px。
//   Part 5(reduced-motion):transition 压至 0.01ms,展开即时到位(无中间值)。
//
// mock 数据(不污染真环境、无真会话);密码自读,不进 agent 上下文、不打印值。
// 用法:bun scripts/probe-grid-panel.mjs

import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const PROJECT = "proj1";
// grid 容器 = WorkbenchShell 的三列 grid(main 的直接子 div.grid)。
const GRID_SEL = "main > div.grid";
const RIGHT_REM_PX = 22 * 16; // 22rem 展开 @ root font 16px

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

async function setupMocks(page) {
  await page.route(/\/api\/overview$/, (r) =>
    r.fulfill(
      json({
        projectNames: [PROJECT],
        candidates: [
          {
            type: "agent",
            projectName: PROJECT,
            sessionId: "agent_grid-1",
            displayName: "Probe Grid 1",
            status: "idle",
            provider: "claude",
            createdAt: "2026-07-26T00:00:00.000Z",
          },
        ],
      }),
    ),
  );
  await page.route(new RegExp(`/api/projects/${PROJECT}/agent-sessions(?:\\?.*)?$`), (r) =>
    r.fulfill(
      json({
        sessions: [
          {
            id: "agent_grid-1",
            projectName: PROJECT,
            provider: "claude",
            displayName: "Probe Grid 1",
            status: "idle",
            createdAt: "2026-07-26T00:00:00.000Z",
          },
        ],
      }),
    ),
  );
  await page.route(new RegExp(`/api/projects/${PROJECT}/agent-sessions/agent_grid-1$`), (r) =>
    r.fulfill(
      json({
        session: {
          id: "agent_grid-1",
          projectName: PROJECT,
          provider: "claude",
          displayName: "Probe Grid 1",
          status: "idle",
          createdAt: "2026-07-26T00:00:00.000Z",
        },
        availableModels: ["sonnet"],
        availablePermissionModes: ["default"],
      }),
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
  await page.routeWebSocket(/stream/, (ws) => ws.connectToServer());
}

async function login(page) {
  await page.goto(`${WEB_ORIGIN}/`);
  await page.waitForSelector('input[type="password"]', { timeout: 15000 });
  await page.getByLabel("访问密码").fill(await readAppPassword());
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForTimeout(700);
}

/** 读 grid 容器的 transitionProperty + 第三轨像素宽。 */
async function gridState(page) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const s = getComputedStyle(el);
    // computed grid-template-columns = "W1 W2 W3" 三轨像素值。
    const cols = s.gridTemplateColumns.trim().split(/\s+/);
    return {
      transitionProperty: s.transitionProperty,
      thirdCol: Number.parseFloat(cols[cols.length - 1]),
    };
  }, GRID_SEL);
}

/** 在 grid 容器挂 transitionrun 监听(重置标志)。transitionrun 只有真过渡才派发
 *  (瞬切无事件)→ 事件断言证明「过渡机制在场」,不依赖在 280ms 窗口内抓到中间值:
 *  点击→evaluate 往返在机器负载下可超 280ms,采样会抓到终态 = 假 fail(实测两次)。 */
async function armGridTransitionRun(page) {
  await page.evaluate((sel) => {
    window.__gridTransitionRun = null;
    document.querySelector(sel)?.addEventListener("transitionrun", (e) => {
      if (e.propertyName === "grid-template-columns") window.__gridTransitionRun = e.propertyName;
    });
  }, GRID_SEL);
}

/** click 后等 transitionrun 派发(超时不抛,由 ok() 断言标志)。 */
async function awaitGridTransitionRun(page) {
  await page
    .waitForFunction(() => window.__gridTransitionRun === "grid-template-columns", null, {
      timeout: 1500,
    })
    .catch(() => {});
  return page.evaluate(() => window.__gridTransitionRun);
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "zh-CN" });
  const page = await ctx.newPage();
  await setupMocks(page);
  await login(page);

  // ── Part 1:idle 动画类在场 + 折叠态 0px ──
  console.log("Part 1: idle transition 含 grid-template-columns + 折叠态 0px");
  await page.goto(`${WEB_ORIGIN}/projects/proj1`);
  await page.waitForSelector(GRID_SEL, { timeout: 10000 });
  await page.waitForTimeout(500);
  const idle = await gridState(page);
  ok(
    idle && idle.transitionProperty.includes("grid-template-columns"),
    `idle transitionProperty 含 grid-template-columns(实测 ${idle?.transitionProperty})`,
  );
  ok(idle && idle.thirdCol === 0, `折叠态第三轨 = 0px(实测 ${idle?.thirdCol})`);

  // ── Part 2:展开 → transitionrun(真过渡)→ 收敛 352px ──
  console.log("Part 2: 展开 = 轨道 0→22rem 真过渡,收敛 352px");
  await armGridTransitionRun(page);
  await page.getByRole("button", { name: "展开右栏" }).click();
  const run2 = await awaitGridTransitionRun(page);
  ok(
    run2 === "grid-template-columns",
    `展开派发 transitionrun(grid-template-columns)(实测 ${run2})`,
  );
  await page.waitForTimeout(500); // 280ms + 余量
  const open = await gridState(page);
  ok(open && open.thirdCol === RIGHT_REM_PX, `展开终态第三轨 = 352px(实测 ${open?.thirdCol})`);

  // ── Part 3:拖宽 1:1(pointerdown 摘 transition,up 恢复) ──
  console.log("Part 3: 拖宽期间 transition 摘除,松手恢复");
  let draggedWidth = RIGHT_REM_PX; // 拖后记忆宽(atom 持久化),Part 4/5 基准
  const gutter = page.locator('[aria-label="调整右栏宽度"]');
  const box = await gutter.boundingBox();
  ok(!!box, "gutter(separator)在场可命中");
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + 300);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 60, box.y + 300, { steps: 4 }); // 向左拖 60px
    const dragging = await gridState(page);
    ok(
      dragging && !dragging.transitionProperty.includes("grid-template-columns"),
      `拖拽中 transitionProperty 不含 grid-template-columns(实测 ${dragging?.transitionProperty})`,
    );
    // 拖宽 60px ≈ 3.75rem → 22+3.75 = 25.75rem = 412px(1:1 无过渡延迟,立即生效)。
    // 记录拖后宽度作 Part 4/5 的动态基准(宽度 atom 持久化,后续不再是 22rem)。
    const afterDrag = await gridState(page);
    draggedWidth = afterDrag?.thirdCol ?? RIGHT_REM_PX;
    ok(
      afterDrag && Math.abs(afterDrag.thirdCol - (RIGHT_REM_PX + 60)) <= 2,
      `拖拽中宽度 1:1 即时跟手 ≈ 412px(实测 ${afterDrag?.thirdCol})`,
    );
    await page.mouse.up();
    await page.waitForTimeout(80);
    const released = await gridState(page);
    ok(
      released && released.transitionProperty.includes("grid-template-columns"),
      `松手后 transition 恢复(实测 ${released?.transitionProperty})`,
    );
  }

  // ── Part 3.5:键盘长按也摘 transition(perf review:keydown 20-30 次/秒连续
  // 重定目标,与拖拽同属连续改宽;keyup/blur 恢复) ──
  console.log("Part 3.5: 键盘步进期间 transition 摘除,keyup 恢复");
  await page.locator('[aria-label="调整右栏宽度"]').focus();
  await page.keyboard.down("ArrowLeft");
  await page.waitForTimeout(80); // 含 key repeat 起步
  const kbdDown = await gridState(page);
  ok(
    kbdDown && !kbdDown.transitionProperty.includes("grid-template-columns"),
    `键盘按住中 transitionProperty 不含 grid-template-columns(实测 ${kbdDown?.transitionProperty})`,
  );
  await page.keyboard.up("ArrowLeft");
  await page.waitForTimeout(80);
  const kbdUp = await gridState(page);
  ok(
    kbdUp && kbdUp.transitionProperty.includes("grid-template-columns"),
    `keyup 后 transition 恢复(实测 ${kbdUp?.transitionProperty})`,
  );
  // 键盘通道真正生效的正面证据:← 键把右栏增宽一个步进(1rem = 16px)。Playwright
  // keyboard.down 不发 OS 级 key repeat → 单次 keydown = 单步。基准随之更新(Part 5 用)。
  ok(
    kbdUp && Math.abs(kbdUp.thirdCol - (draggedWidth + 16)) <= 2,
    `← 键步进右栏 +1rem(实测 ${kbdUp?.thirdCol} / 期望 ${draggedWidth + 16})`,
  );
  draggedWidth = kbdUp?.thirdCol ?? draggedWidth;

  // ── Part 4:折叠 = 同一条 transition 反方向 ──
  console.log("Part 4: 折叠 → transitionrun → 收敛 0px");
  await armGridTransitionRun(page);
  await page.getByRole("button", { name: "收起右栏" }).click();
  const run4 = await awaitGridTransitionRun(page);
  ok(
    run4 === "grid-template-columns",
    `折叠派发 transitionrun(grid-template-columns)(实测 ${run4})`,
  );
  await page.waitForTimeout(500);
  const closed = await gridState(page);
  ok(closed && closed.thirdCol === 0, `折叠终态第三轨 = 0px(实测 ${closed?.thirdCol})`);

  // ── Part 5:reduced-motion 即时到位 ──
  console.log("Part 5: reduced-motion 展开即时到位(0.01ms 级过渡)");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "展开右栏" }).click();
  const rmOpen = await gridState(page);
  ok(
    rmOpen && rmOpen.thirdCol === draggedWidth,
    `reduced-motion 展开即时到位 = 拖后记忆宽(实测 ${rmOpen?.thirdCol} / 基准 ${draggedWidth})`,
  );

  await browser.close();
  console.log(`\n${passCount} pass, ${failCount} fail`);
  process.exit(failCount > 0 ? 1 : 0);
})();
