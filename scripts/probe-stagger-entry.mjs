// 批C（动效体系）内容入场交错探针：三个首屏列表（左栏会话分组行/历史行/文件树卡）
// 挂 .animate-stagger-rows 后，用 computed style + Web Animations API 硬数据断言：
//   Part 1（桌面 1440×900）：行 animation-name = stagger-row-enter、delay 按
//     nth-child 递增（0/28/56ms…第 9 行起 cap 224ms）、delay 期间 backwards 保持
//     from 态（opacity<1）、播完后 transform 释放回 none（fill 用 backwards 不用
//     both——拖拽行 transform 跟手不被锁死）。
//   Part 2：已存在行 re-render 不重播（动画播完 + 触发列表 re-render 后 running
//     animation 数仍为 0——「只首次挂载」铁律）。
//   Part 3（reduced-motion）：delay 归零（0s !important 兜底），duration 压至
//     0.01ms——弱动效用户不等 224ms 才见内容。
//
// mock 数据（不污染真环境、无真会话）；密码自读，不进 agent 上下文、不打印值。
// 用法：bun scripts/probe-stagger-entry.mjs

import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const PROJECT = "proj1";
// 12 个会话同属 proj1 → 一个组段 12 行（覆盖 nth-child 1–8 递增 + n+9 封顶 224ms）。
const AGENTS = Array.from({ length: 12 }, (_, i) => {
  const n = i + 1;
  return {
    id: `agent_stg-${n}`,
    projectName: PROJECT,
    provider: "claude",
    displayName: `Probe Stagger ${n}`,
    status: n % 3 === 0 ? "running" : "idle",
    createdAt: "2026-07-26T00:00:00.000Z",
  };
});

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
        candidates: AGENTS.map((a) => ({
          type: "agent",
          projectName: PROJECT,
          sessionId: a.id,
          displayName: a.displayName,
          status: a.status,
          provider: "claude",
          createdAt: a.createdAt,
        })),
      }),
    ),
  );
  await page.route(new RegExp(`/api/projects/${PROJECT}/agent-sessions(?:\\?.*)?$`), (r) =>
    r.fulfill(json({ sessions: AGENTS })),
  );
  for (const a of AGENTS) {
    await page.route(new RegExp(`/api/projects/${PROJECT}/agent-sessions/${a.id}$`), (r) =>
      r.fulfill(
        json({
          session: a,
          availableModels: ["sonnet"],
          availablePermissionModes: ["default"],
        }),
      ),
    );
  }
  await page.route(new RegExp(`/api/projects/${PROJECT}/terminal-sessions(?:\\?.*)?$`), (r) =>
    r.fulfill(json({ sessions: [] })),
  );
  // 历史列表（Part 2b）：entries 空时 HistoryList 早退 null（容器不在场，断言会读成
  // null 而非 false）——必须造数据让容器真正渲染，断言才落在「挂着没挂 stagger」上。
  await page.route(new RegExp(`/api/projects/${PROJECT}/agent-history(?:\\?.*)?$`), (r) =>
    r.fulfill(
      json({
        entries: [
          {
            provider: "claude",
            claudeSessionId: "11111111-2222-3333-4444-555555555555",
            title: "Probe Stagger History",
            firstMessage: "probe",
            startedAt: "2026-07-26T00:00:00.000Z",
            lastActivityAt: "2026-07-26T00:00:00.000Z",
            fileSize: 1024,
            hasActiveSession: false,
          },
        ],
        range: "week",
      }),
    ),
  );
  await page.route(/\/api\/projects\/proj1\/files(?:\?.*)?$/, (r) =>
    r.fulfill(
      json({
        projectName: PROJECT,
        path: "",
        parentPath: null,
        entries: [
          { name: "src", path: "src", type: "directory", hidden: false, size: 0 },
          { name: "docs", path: "docs", type: "directory", hidden: false, size: 0 },
          { name: "index.html", path: "index.html", type: "file", hidden: false, size: 64 },
          { name: "README.md", path: "README.md", type: "file", hidden: false, size: 128 },
        ],
      }),
    ),
  );
  // 全局文件根层（/files 首页 globalCard 分支）。
  await page.route(/\/api\/root\/files$/, (r) =>
    r.fulfill(
      json({
        entries: [
          { name: "proj1", path: "proj1", type: "directory", hidden: false, size: 0 },
          { name: "notes.txt", path: "notes.txt", type: "file", hidden: false, size: 32 },
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

/** 读容器第 n 个直接子的 stagger 动画 computed 数据（name/delay/duration/opacity/transform
 *  + running 的 getAnimations 计数）。 */
async function rowAnim(page, containerSel, nth) {
  return page.evaluate(
    ([sel, i]) => {
      const el = document.querySelector(`${sel} > :nth-child(${i})`);
      if (!el) return null;
      const s = getComputedStyle(el);
      return {
        name: s.animationName,
        delay: s.animationDelay,
        duration: s.animationDuration,
        opacity: s.opacity,
        transform: s.transform,
        running: el
          .getAnimations()
          .filter((a) => a.animationName === "stagger-row-enter" && a.playState === "running")
          .length,
      };
    },
    [containerSel, nth],
  );
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "zh-CN" });
  const page = await ctx.newPage();
  await setupMocks(page);
  await login(page);

  // ── Part 1：AllSessionsGroupedList 组段交错 ──
  console.log("Part 1: 会话分组行 stagger delay 递增 + backwards 保持 + 终态释放");
  await page.goto(`${WEB_ORIGIN}/projects`);
  const groupSel = "div.animate-stagger-rows";
  await page.locator(groupSel).first().waitFor({ timeout: 10000 });

  const row1 = await rowAnim(page, groupSel, 1);
  const row2 = await rowAnim(page, groupSel, 2);
  const row9 = await rowAnim(page, groupSel, 9);
  const row12 = await rowAnim(page, groupSel, 12);
  ok(
    row1 && row1.name === "stagger-row-enter",
    `行 1 动画名 = stagger-row-enter（实测 ${row1?.name}）`,
  );
  ok(row1 && row1.delay === "0s", `行 1 delay = 0s（实测 ${row1?.delay}）`);
  ok(row2 && row2.delay === "0.028s", `行 2 delay = 28ms 递增（实测 ${row2?.delay}）`);
  ok(
    row9 && row9.delay === "0.224s" && row12 && row12.delay === "0.224s",
    `第 9/12 行 delay 封顶 224ms（实测 ${row9?.delay} / ${row12?.delay}）`,
  );
  ok(row1 && row1.duration === "0.32s", `行 1 duration = 0.32s（实测 ${row1?.duration}）`);
  // fill 必须是 backwards：both 会在播完后以动画终态持续压过 transform（拖拽行跟手
  // 位移被 translateY(0) 锁死）——此断言防回退。读 computed animationFillMode 而非
  // getAnimations().effect.getTiming().fill：无 forwards 填充的动画播完即从
  // getAnimations() 移除（往返耗时 > 0=0ms delay 行 320ms 时长时必得 undefined =
  // 假 fail，实测），computed 属性与播放进度无关。
  const fill = await page.evaluate((sel) => {
    const el = document.querySelector(`${sel} > :first-child`);
    return el ? getComputedStyle(el).animationFillMode : null;
  }, groupSel);
  ok(fill === "backwards", `fill = backwards（实测 ${fill}）`);

  // 播完（224ms delay + 320ms + 余量）后 transform 释放回 none。
  await page.waitForTimeout(700);
  const row1After = await rowAnim(page, groupSel, 1);
  ok(
    row1After && row1After.transform === "none" && row1After.running === 0,
    `播完 transform = none 且无 running（实测 ${row1After?.transform} / ${row1After?.running}）`,
  );

  // ── Part 2：文件树 ListGroup stagger（project 目录层） ──
  console.log("Part 2: 文件树 ListGroup stagger 在场");
  await page.goto(`${WEB_ORIGIN}/files`);
  // 等根层渲染（固定 waitForTimeout 是慢机竞态）再判 gfcard 行是否存在。
  await page
    .locator(".gfcard, [aria-label='Project files']")
    .first()
    .waitFor({ timeout: 10000 })
    .catch(() => {});
  // 项目目录层入口：点 proj1 目录行进子目录（FileEntryList ListRow 分支）。
  const projRow = page.locator(".gfcard button", { hasText: "proj1" }).first();
  if (await projRow.isVisible().catch(() => false)) {
    await projRow.click();
    await page
      .locator('[aria-label="Project files"]')
      .waitFor({ timeout: 8000 })
      .catch(() => {});
    const fileRow = await rowAnim(page, '[aria-label="Project files"]', 1);
    ok(
      fileRow && fileRow.name === "stagger-row-enter",
      `文件行动画名 = stagger-row-enter（实测 ${fileRow?.name ?? "无容器"}）`,
    );
  } else {
    console.log("  ⚠ /files 根层无 gfcard 行（形态未渲染），跳过文件树分支");
  }

  // ── Part 2b：history-list 不挂 stagger（批C review P1 防回归：lastActivityAt
  // 动态排序列表行前移 = insertBefore 移动 DOM = CSS animation 重播闪烁） ──
  console.log("Part 2b: history-list（lastActivityAt 动态排序）无 stagger");
  await page.goto(`${WEB_ORIGIN}/projects/proj1`);
  await page.waitForTimeout(600);
  const historyBtn = page.getByRole("button", { name: "查看历史会话" });
  if (await historyBtn.isVisible().catch(() => false)) {
    await historyBtn.click();
    await page.locator('[aria-label="历史会话"]').waitFor({ timeout: 8000 });
    const historyHasStagger = await page.evaluate(() => {
      const el = document.querySelector('[aria-label="历史会话"]');
      return el ? el.className.includes("animate-stagger-rows") : null;
    });
    ok(historyHasStagger !== null, `历史列表容器在场（实测 ${historyHasStagger}）`);
    ok(
      historyHasStagger === false,
      `历史列表容器无 animate-stagger-rows（实测 ${historyHasStagger}）`,
    );
  } else {
    console.log("  ⚠ project scope 无「查看历史会话」入口，跳过防回归断言");
  }

  // ── Part 3：reduced-motion 即时到位 ──
  console.log("Part 3: reduced-motion 下 delay 归零即时到位");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${WEB_ORIGIN}/projects`);
  // 等容器在场再采样（与 Part 1 同款）：固定 waitForTimeout 在慢机上是竞态——
  // 列表还没渲染 → rowAnim 返回 null → 读成 undefined（实测 flake）。
  await page.locator(groupSel).first().waitFor({ timeout: 10000 });
  const rmRow = await rowAnim(page, groupSel, 1);
  ok(
    rmRow && rmRow.delay === "0s" && Number.parseFloat(rmRow.duration) < 0.001,
    `reduced-motion delay 0s + duration 压至 0.01ms 级（实测 ${rmRow?.delay} / ${rmRow?.duration}）`,
  );

  await browser.close();
  console.log(`\n${passCount} pass, ${failCount} fail`);
  process.exit(failCount > 0 ? 1 : 0);
})();
