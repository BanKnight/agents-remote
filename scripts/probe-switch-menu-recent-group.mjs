// 一次性探针：▾ 切换实例菜单「最近」组（用户拍板 2026-11-05：与桌面同一套——agent-history
// 管道、lastActivityAt 倒序、含已结束会话）+ foreign 组 localeCompare 稳定序。
// fixture 走 page.route：/api/overview（活跃候选）+ /api/agent-history（全局历史 9 条，
// lastActivityAt 倒序；前 7 进最近组、后 2 截断）+ proj-a 两 sessions 端点。
// 断言：
//  1. 组头序列 = [最近, proj-a, proj-b, proj-c, proj-d, proj-e]（最近置顶 + localeCompare 升序；
//     fixture 故意让字母序≠时间序，能区分「时间排序回归」与「稳定序」）
//  2. 最近组 = 服务端倒序前 7：第一行 = lastActivityAt 最大者；第 8/9 条截断不在场；含已结束
//     会话（ended-task / ended-old 在场）
//  3. 重复展示：活跃会话在「最近」组（历史形态 title 行）与项目组（实例形态 displayName 行）
//     并存——fixture 让 history.title === candidate.displayName 同名可数
//  4. chip：最近组行带项目名 chip、项目组行不带；chip 文本 = 归属项目名
//  5. 行点击分流（桌面 activateEntry 同款）：活跃历史行 → 聚焦导航（URL 断言）；已结束行 →
//     resume 命名框（预填标题），取消 = 零 POST 不创建
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

// 全局历史 fixture（9 条，lastActivityAt 倒序 = 服务端口径；前 7 进「最近」组，后 2 截断）。
// 活跃条目 title 与候选 displayName 同名（s-d1 等）→ 重复展示断言可数；ended-* = 已结束
// 会话（hasActiveSession=false）——「含已结束」是桌面同款语义的核心差异点。
const HISTORY = [
  {
    provider: "claude",
    claudeSessionId: "h-d1",
    title: "s-d1",
    firstMessage: null,
    startedAt: "2026-11-01T14:00:00Z",
    lastActivityAt: "2026-11-05T14:00:00Z",
    fileSize: 1234,
    hasActiveSession: true,
    activeSessionId: "s-d1",
    projectName: "proj-d",
  },
  {
    provider: "claude",
    claudeSessionId: "h-a1",
    title: "s-a1",
    firstMessage: null,
    startedAt: "2026-11-01T12:00:00Z",
    lastActivityAt: "2026-11-05T12:00:00Z",
    fileSize: 1234,
    hasActiveSession: true,
    activeSessionId: "s-a1",
    projectName: "proj-a",
  },
  {
    provider: "claude",
    claudeSessionId: "h-b1",
    title: "s-b1",
    firstMessage: null,
    startedAt: "2026-11-01T10:00:00Z",
    lastActivityAt: "2026-11-05T10:00:00Z",
    fileSize: 1234,
    hasActiveSession: true,
    activeSessionId: "s-b1",
    projectName: "proj-b",
  },
  {
    provider: "claude",
    claudeSessionId: "h-c1",
    title: "s-c1",
    firstMessage: null,
    startedAt: "2026-11-01T08:00:00Z",
    lastActivityAt: "2026-11-05T08:00:00Z",
    fileSize: 1234,
    hasActiveSession: true,
    activeSessionId: "s-c1",
    projectName: "proj-c",
  },
  {
    provider: "claude",
    claudeSessionId: "ended-1",
    title: "ended-task",
    firstMessage: null,
    startedAt: "2026-11-01T07:00:00Z",
    lastActivityAt: "2026-11-05T07:30:00Z",
    fileSize: 1234,
    hasActiveSession: false,
    projectName: "proj-c",
  },
  {
    provider: "claude",
    claudeSessionId: "h-e1",
    title: "s-e1",
    firstMessage: null,
    startedAt: "2026-10-30T06:00:00Z",
    lastActivityAt: "2026-11-05T06:00:00Z",
    fileSize: 1234,
    hasActiveSession: true,
    activeSessionId: "s-e1",
    projectName: "proj-e",
  },
  {
    provider: "claude",
    claudeSessionId: "ended-2",
    title: "ended-old",
    firstMessage: null,
    startedAt: "2026-10-29T06:00:00Z",
    lastActivityAt: "2026-10-30T06:00:00Z",
    fileSize: 1234,
    hasActiveSession: false,
    projectName: "proj-e",
  },
  {
    provider: "claude",
    claudeSessionId: "ended-3",
    title: "ended-3",
    firstMessage: null,
    startedAt: "2026-10-28T06:00:00Z",
    lastActivityAt: "2026-10-29T06:00:00Z",
    fileSize: 1234,
    hasActiveSession: false,
    projectName: "proj-d",
  },
  {
    provider: "claude",
    claudeSessionId: "ended-4",
    title: "ended-4",
    firstMessage: null,
    startedAt: "2026-10-27T06:00:00Z",
    lastActivityAt: "2026-10-28T06:00:00Z",
    fileSize: 1234,
    hasActiveSession: false,
    projectName: "proj-e",
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
  await page.route("**/api/agent-history**", (route) =>
    route.fulfill(
      json({
        entries: HISTORY,
        counts: {
          all: HISTORY.length,
          active: HISTORY.filter((e) => e.hasActiveSession).length,
          ended: HISTORY.filter((e) => !e.hasActiveSession).length,
        },
        nextCursor: null,
        filter: "all",
      }),
    ),
  );
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
      sa1Count: byName("s-a1").length,
      sb1Count: byName("s-b1").length,
      sc2Count: byName("s-c2").length,
      se2Count: byName("s-e2").length,
      endedTaskCount: byName("ended-task").length,
      endedOldCount: byName("ended-old").length,
      ended3Count: byName("ended-3").length,
      ended4Count: byName("ended-4").length,
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
    "2b 最近组含已结束会话（ended-task/ended-old 各 1）+ 第 8/9 条截断（ended-3/4 = 0）",
    menuState.endedTaskCount === 1 &&
      menuState.endedOldCount === 1 &&
      menuState.ended3Count === 0 &&
      menuState.ended4Count === 0,
    `ended-task=${menuState.endedTaskCount} ended-old=${menuState.endedOldCount} ended-3=${menuState.ended3Count} ended-4=${menuState.ended4Count}`,
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
  check(
    "4b 总行数 = 7（最近组）+ 9（项目组全集）+ 2（菜单底部固定操作项）",
    menuState.total === 18,
    `total=${menuState.total}`,
  );

  // 5a 已结束历史行点击 = resume 命名框（桌面 openClosedEntry 同款）。锚定弹层菜单项点击
  // 一律 dispatchEvent("click")（§26：playwright click 的视口判定在 fixed+transform 弹层
  // 上不稳）。取消路径必须零 POST——探针绝不点「确认」（不向真实服务器创建会话）。
  let postCount = 0;
  page.on("request", (req) => {
    if (req.method() === "POST") postCount += 1;
  });
  const postBefore = postCount;
  await page.getByRole("menuitem").filter({ hasText: "ended-task" }).dispatchEvent("click");
  const promptBox = page.getByRole("dialog").getByRole("textbox");
  await promptBox.waitFor({ state: "visible", timeout: 5000 });
  const prefilled = await promptBox.inputValue();
  check("5a 已结束行点击弹命名框且预填标题", prefilled === "ended-task", `prefilled=${prefilled}`);
  await page.getByRole("dialog").getByRole("button", { name: "取消" }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden", timeout: 5000 });
  check(
    "5a 取消后命名框关闭、停留当前页、零 POST（不创建会话）",
    postCount === postBefore && page.url().includes("/projects/proj-a"),
    `postDelta=${postCount - postBefore} url=${page.url()}`,
  );

  // 5b 活跃历史行点击 = 聚焦既有实例（桌面 activateEntry 分流）→ 导航 proj-d/s-d1。
  await trigger.click();
  await page.locator('[role="menu"]').waitFor({ state: "visible", timeout: 5000 });
  await page.getByRole("menuitem").filter({ hasText: "s-d1" }).first().dispatchEvent("click");
  await page.waitForURL("**/projects/proj-d/session/s-d1", { timeout: 5000 });
  check("5b 活跃行点击聚焦既有实例（导航 proj-d/s-d1）", true, page.url());

  const pass = results.every(Boolean);
  console.log(
    `\n${pass ? "ALL PASS" : "FAIL"}（${results.filter(Boolean).length}/${results.length}）`,
  );
  process.exit(pass ? 0 : 1);
} finally {
  await browser.close();
}
