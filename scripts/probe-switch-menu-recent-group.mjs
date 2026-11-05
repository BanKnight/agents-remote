// 一次性探针：▾ 切换实例菜单「最近」组（用户拍板 2026-11-05：**唯一数据源 = 会话列表**
// ——与项目组/foreign 组同一 /api/overview candidates 管道，updatedAt ?? createdAt 降序
// 取前 7 条活跃会话；不含任何 agent-history 文件管道条目）+ foreign 组 localeCompare 稳定序。
// fixture 走 page.route：/api/overview（9 候选 5 项目）+ proj-a 两 sessions 端点。
// 断言：
//  1. 组头序列 = [最近, proj-a, proj-b, proj-c, proj-d, proj-e]（最近置顶 + localeCompare 升序；
//     fixture 故意让字母序≠时间序，能区分「时间排序回归」与「稳定序」）
//  2. 最近组 = candidates 时间倒序前 7：第一行 = updatedAt 最大者；第 8/9 条（s-c2/s-e2）
//     只在各自项目组；**最近组每一行都能在候选集合中找到**（无列表外条目混入——用户
//     2026-11-05 打回「总共 5 个会话，为什么多出来不在会话列表里的」的核心回归）
//  3. 同一活跃会话「最近组 displayName 行 + 项目组行」并存（重复展示不去重，可数）
//  4. 无 chip：最近组行不带项目名 chip（项目归属不上行）
//  5. 行点击 = 聚焦既有实例（导航 URL 断言；无已结束行 → 无 resume 命名框路径）
// WS mock 必须带（page.route 拦不了 WebSocket：session-shells WS 首帧会 setQueryData 覆盖
// overview fixture，见 use-session-shells.ts applyShellsFrame——批次一探针实证）。
// 密码自读不打印。用法：bun scripts/probe-switch-menu-recent-group.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const CURRENT_PROJECT = "proj-a";

const results = [];
function check(name, cond, detail = "") {
  results.push(Boolean(cond));
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

// 9 会话。updatedAt 降序：s-d1 > s-a1 > s-b1 > s-c1 > s-a2 > s-b2 > s-e1 > s-c2 > s-e2；
// 前 7 进最近组，后 2 只在各自项目组。
const CANDIDATES = [
  {
    sessionId: "s-d1",
    projectName: "proj-d",
    displayName: "s-d1",
    status: "idle",
    type: "agent",
    updatedAt: "2026-11-05T14:00:00Z",
    createdAt: "2026-11-01T14:00:00Z",
  },
  {
    sessionId: "s-a1",
    projectName: "proj-a",
    displayName: "s-a1",
    status: "idle",
    type: "agent",
    provider: "claude",
    updatedAt: "2026-11-05T12:00:00Z",
    createdAt: "2026-11-01T12:00:00Z",
  },
  {
    sessionId: "s-b1",
    projectName: "proj-b",
    displayName: "s-b1",
    status: "idle",
    type: "agent",
    provider: "claude",
    updatedAt: "2026-11-05T10:00:00Z",
    createdAt: "2026-11-01T10:00:00Z",
  },
  {
    sessionId: "s-c1",
    projectName: "proj-c",
    displayName: "s-c1",
    status: "idle",
    type: "agent",
    provider: "claude",
    updatedAt: "2026-11-05T08:00:00Z",
    createdAt: "2026-11-01T08:00:00Z",
  },
  {
    sessionId: "s-a2",
    projectName: "proj-a",
    displayName: "s-a2",
    status: "idle",
    type: "terminal",
    updatedAt: "2026-11-04T05:00:00Z",
  },
  {
    sessionId: "s-b2",
    projectName: "proj-b",
    displayName: "s-b2",
    status: "idle",
    type: "terminal",
    updatedAt: "2026-11-03T09:00:00Z",
  },
  {
    sessionId: "s-e1",
    projectName: "proj-e",
    displayName: "s-e1",
    status: "idle",
    type: "agent",
    provider: "claude",
    updatedAt: "2026-11-02T06:00:00Z",
    createdAt: "2026-10-30T06:00:00Z",
  },
  {
    sessionId: "s-c2",
    projectName: "proj-c",
    displayName: "s-c2",
    status: "idle",
    type: "agent",
    provider: "claude",
    updatedAt: "2026-11-01T06:00:00Z",
    createdAt: "2026-10-29T06:00:00Z",
  },
  {
    sessionId: "s-e2",
    projectName: "proj-e",
    displayName: "s-e2",
    status: "idle",
    type: "agent",
    provider: "claude",
    updatedAt: "2026-10-30T06:00:00Z",
    createdAt: "2026-10-28T06:00:00Z",
  },
];

/** 最近组前 7（candidates 时间倒序；与服务端 fixture 同口径）。 */
const RECENT_TOP = [...CANDIDATES]
  .sort(
    (a, b) =>
      Date.parse(b.updatedAt ?? b.createdAt ?? 0) - Date.parse(a.updatedAt ?? a.createdAt ?? 0),
  )
  .slice(0, 7);

const json = (body) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(body),
});

const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "zh-CN",
  });
  const page = await context.newPage();
  await page.route("**/api/overview", (route) =>
    route.fulfill(
      json({
        projectNames: ["proj-a", "proj-b", "proj-c", "proj-d", "proj-e"],
        candidates: CANDIDATES,
      }),
    ),
  );
  await page.route("**/api/overview/subtitles", (route) => route.fulfill(json({ subtitles: {} })));
  await page.route(`**/api/projects/${CURRENT_PROJECT}/agent-sessions`, (route) =>
    route.fulfill(
      json({
        sessions: CANDIDATES.filter(
          (c) => c.projectName === CURRENT_PROJECT && c.type === "agent",
        ).map((c) => ({
          id: c.sessionId,
          projectName: c.projectName,
          provider: c.provider ?? "claude",
          displayName: c.displayName,
          status: c.status,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        })),
      }),
    ),
  );
  await page.route(`**/api/projects/${CURRENT_PROJECT}/terminal-sessions`, (route) =>
    route.fulfill(
      json({
        sessions: CANDIDATES.filter(
          (c) => c.projectName === CURRENT_PROJECT && c.type === "terminal",
        ).map((c) => ({
          id: c.sessionId,
          projectName: c.projectName,
          displayName: c.displayName,
          status: "running",
          updatedAt: c.updatedAt,
        })),
      }),
    ),
  );
  await page.addInitScript(() => {
    localStorage.setItem("lang", "zh");
    // mock WS（page.route 拦不了 WebSocket）：session-shells WS 首帧全量快照会
    // setQueryData(["overview"]) 用真实会话覆盖 route fixture（use-session-shells.ts
    // applyShellsFrame）。假开 socket 吞掉推送让 fixture 恒生效；WS 断流由 overview
    // 10s 轮询兜底（也被 route 拦），无自愈副作用。
    class FakeWebSocket {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;
      constructor() {
        this.readyState = 1;
      }
      send() {}
      close() {}
      addEventListener() {}
      removeEventListener() {}
      dispatchEvent() {
        return true;
      }
    }
    for (const prop of ["onopen", "onmessage", "onclose", "onerror"]) {
      Object.defineProperty(FakeWebSocket.prototype, prop, {
        get() {
          return null;
        },
        set() {},
      });
    }
    window.WebSocket = FakeWebSocket;
  });

  await page.goto(`${WEB_ORIGIN}/`);
  await page.getByLabel("访问密码").fill(await readAppPassword());
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForTimeout(1200);

  await page.goto(`${WEB_ORIGIN}/projects/${CURRENT_PROJECT}`);
  const trigger = page.getByRole("button", { name: /切换实例/ });
  await trigger.waitFor({ state: "visible", timeout: 10_000 });
  await trigger.click();
  await page.locator('[role="menu"]').waitFor({ state: "visible", timeout: 5000 });

  // 组头收集：菜单内 className 含 text-[10px] 的 div（组头专用档；标题是 text-[10.5px]
  // 不含该子串，行是 text-[13.5px]）。
  const heads = await page.evaluate(() => {
    const menu = document.querySelector('[role="menu"]');
    if (!menu) return [];
    return [...menu.querySelectorAll("div")]
      .filter((el) => el.className.includes("text-[10px]"))
      .map((el) => (el.textContent ?? "").trim());
  });
  check(
    "1a 组头序列 = 最近置顶 + 当前项目 + foreign localeCompare 升序",
    JSON.stringify(heads) ===
      JSON.stringify(["最近", "proj-a", "proj-b", "proj-c", "proj-d", "proj-e"]),
    JSON.stringify(heads),
  );

  const menuState = await page.evaluate(() => {
    const menu = document.querySelector('[role="menu"]');
    const items = menu ? [...menu.querySelectorAll('[role="menuitem"]')] : [];
    const byName = (name) => items.filter((el) => (el.textContent ?? "").includes(name));
    const chipOf = (row) => {
      const chip = [...row.querySelectorAll("span")].find((el) =>
        el.className.includes("rounded-[9px]"),
      );
      return chip ? (chip.textContent ?? "").trim() : null;
    };
    // 最近组容器 = 第一个组头 div 的父级（组渲染 = <div><组头/>行…</div>）。
    const firstHead = [...menu.querySelectorAll("div")].find((el) =>
      el.className.includes("text-[10px]"),
    );
    const recentContainer = firstHead?.parentElement ?? null;
    const recentRowTexts = recentContainer
      ? [...recentContainer.querySelectorAll('[role="menuitem"]')].map((el) =>
          (el.textContent ?? "").trim(),
        )
      : [];
    return {
      first: (items[0]?.textContent ?? "").trim(),
      sa1Count: byName("s-a1").length,
      sb1Count: byName("s-b1").length,
      sc2Count: byName("s-c2").length,
      se2Count: byName("s-e2").length,
      sd1Chips: byName("s-d1").map(chipOf),
      total: items.length,
      recentRowTexts,
    };
  });
  check(
    "2a 第一个 menuitem = updatedAt 最大者 s-d1",
    menuState.first.includes("s-d1"),
    `first=${menuState.first}`,
  );
  check(
    "2b 最近组行数 = 7（上限），第 8/9 条只在项目组（s-c2/s-e2 各 1 次）",
    menuState.recentRowTexts.length === 7 && menuState.sc2Count === 1 && menuState.se2Count === 1,
    `rows=${menuState.recentRowTexts.length} s-c2=${menuState.sc2Count} s-e2=${menuState.se2Count}`,
  );
  const recentNames = RECENT_TOP.map((c) => c.displayName);
  check(
    "2c 最近组每一行都来自会话列表（candidates），且序 = 时间降序前 7（无列表外条目混入）",
    menuState.recentRowTexts.length === recentNames.length &&
      recentNames.every((name, i) => menuState.recentRowTexts[i].includes(name)),
    `rows=${JSON.stringify(menuState.recentRowTexts)} expected=${JSON.stringify(recentNames)}`,
  );
  check(
    "3a 重复展示：s-a1/s-b1 各 2 次（最近组 displayName 行 + 项目组行）",
    menuState.sa1Count === 2 && menuState.sb1Count === 2,
    `s-a1=${menuState.sa1Count} s-b1=${menuState.sb1Count}`,
  );
  check(
    "4a 最近组行不带项目名 chip（项目归属不上行）",
    menuState.sd1Chips.length === 2 &&
      menuState.sd1Chips[0] === null &&
      menuState.sd1Chips[1] === null,
    JSON.stringify(menuState.sd1Chips),
  );
  check(
    "4b 总行数 = 7（最近组）+ 9（项目组全集）+ 2（菜单底部固定操作项）",
    menuState.total === 18,
    `total=${menuState.total}`,
  );

  // 5 最近组行点击 = 聚焦既有实例（无已结束行 → 无 resume 命名框路径）。
  // 锚定弹层菜单项点击一律 dispatchEvent("click")（§26：playwright click 的视口判定在
  // fixed+transform 弹层上不稳）。
  await page.getByRole("menuitem").filter({ hasText: "s-d1" }).first().dispatchEvent("click");
  await page.waitForURL("**/projects/proj-d/session/s-d1", { timeout: 5000 });
  check("5a 最近组行点击聚焦既有实例（导航 proj-d/s-d1）", true, page.url());

  const pass = results.every(Boolean);
  console.log(
    `\n${pass ? "ALL PASS" : "FAIL"}（${results.filter(Boolean).length}/${results.length}）`,
  );
  process.exit(pass ? 0 : 1);
} finally {
  await browser.close();
}
