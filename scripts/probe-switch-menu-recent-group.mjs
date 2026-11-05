// 一次性探针：▾ 切换实例菜单稳定排序 + 「最近」组（用户拍板 2026-11-05 批次二）。
// fixture 走 page.route 拦 /api/overview + proj-a 两个 sessions 端点（9 会话分属 5 项目，
// updatedAt 错开且与字母序反向——能区分「时间排序回归」与「localeCompare 稳定序」）。
// 断言：
//  1. 组头序列 = [最近, proj-a, proj-b, proj-c, proj-d, proj-e]（最近组置顶 + foreign 组
//     localeCompare 升序；若回归时间排序会是 proj-d 打头——fixture 故意让字母序≠时间序）
//  2. 最近组第一行 = updatedAt 最大者（s-d1）；最近组恒 7 行（s-c2/s-e2 被截掉，只在各自项目组）
//  3. 重复展示：s-a1 / s-b1 各出现 2 次（最近组 + 所属项目组）
//  4. chip：最近组行带项目名 chip（rounded-[9px]），所属项目组行不带；chip 文本 = 项目名
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
    return {
      first: (items[0]?.textContent ?? "").trim(),
      sd1: byName("s-d1"),
      sa1Count: byName("s-a1").length,
      sb1Count: byName("s-b1").length,
      sc2Count: byName("s-c2").length,
      se2Count: byName("s-e2").length,
      sd1Chips: byName("s-d1").map(chipOf),
      total: items.length,
    };
  });
  check(
    "2a 第一个 menuitem = updatedAt 最大者 s-d1",
    menuState.first.includes("s-d1"),
    `first=${menuState.first}`,
  );
  check(
    "2b 截断会话只在项目组（s-c2/s-e2 各 1 次）",
    menuState.sc2Count === 1 && menuState.se2Count === 1,
    `s-c2=${menuState.sc2Count} s-e2=${menuState.se2Count}`,
  );
  check(
    "3a 重复展示：s-a1/s-b1 各 2 次（最近组 + 项目组）",
    menuState.sa1Count === 2 && menuState.sb1Count === 2,
    `s-a1=${menuState.sa1Count} s-b1=${menuState.sb1Count}`,
  );
  check(
    "4a chip：最近组行带、项目组行不带",
    menuState.sd1Chips.length === 2 &&
      menuState.sd1Chips[0] === "proj-d" &&
      menuState.sd1Chips[1] === null,
    JSON.stringify(menuState.sd1Chips),
  );

  const pass = results.every(Boolean);
  console.log(
    `\n${pass ? "ALL PASS" : "FAIL"}（${results.filter(Boolean).length}/${results.length}）`,
  );
  process.exit(pass ? 0 : 1);
} finally {
  await browser.close();
}
