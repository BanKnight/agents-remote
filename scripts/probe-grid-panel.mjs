// 批D(动效体系)右栏 grid 轨道过渡探针:右栏列宽 = grid 第三轨
// var(--workbench-right-col)(0px ↔ 22rem),.workbench-grid-animated 挂
// transition: grid-template-columns。硬数据断言:
//   Part 1:idle 态 grid 容器 computed transitionProperty 含 grid-template-columns
//     (动画类在场),折叠态第三轨 = 0px。
//   Part 2:展开(点唤出钮)→ 立即抓中间值(0 < 第三轨 < 352px,轨道插值进行中)
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

  // ── Part 2:展开 → 中间值(轨道插值)→ 收敛 352px ──
  console.log("Part 2: 展开 = 轨道 0→22rem 插值,收敛 352px");
  await page.getByRole("button", { name: "展开右栏" }).click();
  const mid = await gridState(page);
  ok(
    mid && mid.thirdCol > 0 && mid.thirdCol < RIGHT_REM_PX,
    `展开中间值 0 < 第三轨 < 352px(实测 ${mid?.thirdCol})`,
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

  // ── Part 4:折叠 = 同一条 transition 反方向 ──
  console.log("Part 4: 折叠 22rem→0 中间值收敛 0px");
  await page.getByRole("button", { name: "收起右栏" }).click();
  const closeMid = await gridState(page);
  ok(
    closeMid && closeMid.thirdCol > 0 && closeMid.thirdCol < draggedWidth,
    `折叠中间值进行中(实测 ${closeMid?.thirdCol})`,
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
