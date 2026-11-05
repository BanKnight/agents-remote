// 一次性探针：[项目] Tab 两列表 see-all 收起 + 记忆（用户拍板 2026-11-05 批次一）。
// fixture 走 page.route 拦 /api/overview（5 项目 / 7 会话，updatedAt 错开），不动服务器数据。
// 断言：
//  1. 默认态：活动列表可见 3 行（第 4+ 不在 DOM）+「查看全部活动 ›」在场；项目列表 3 行 +「查看全部项目 ›」在场
//  2. 活动展开 → 全行可见；reload → 仍展开（localStorage 记忆）
//  3. 项目展开 → 全行可见；reload → 仍展开
//  4. 双收起 → 回预览；reload → 仍收起（收起态同样记忆）
// 密码自读不打印。用法：bun scripts/probe-projects-home-collapse.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";

const results = [];
function check(name, cond, detail = "") {
  results.push(Boolean(cond));
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

// 5 项目（proj-a..e，localeCompare 序）+ 7 会话（s-a..s-g 分属各项目；数组序 = 活动列表 rank 序）。
const CANDIDATES = [
  {
    sessionId: "s-a",
    projectName: "proj-a",
    displayName: "s-a",
    status: "idle",
    type: "agent",
    updatedAt: "2026-11-04T10:00:00Z",
    createdAt: "2026-11-01T10:00:00Z",
  },
  {
    sessionId: "s-b",
    projectName: "proj-b",
    displayName: "s-b",
    status: "idle",
    type: "agent",
    updatedAt: "2026-11-04T09:00:00Z",
    createdAt: "2026-11-01T09:00:00Z",
  },
  {
    sessionId: "s-c",
    projectName: "proj-c",
    displayName: "s-c",
    status: "idle",
    type: "agent",
    updatedAt: "2026-11-04T08:00:00Z",
    createdAt: "2026-11-01T08:00:00Z",
  },
  {
    sessionId: "s-d",
    projectName: "proj-d",
    displayName: "s-d",
    status: "idle",
    type: "agent",
    updatedAt: "2026-11-04T07:00:00Z",
    createdAt: "2026-11-01T07:00:00Z",
  },
  {
    sessionId: "s-e",
    projectName: "proj-e",
    displayName: "s-e",
    status: "idle",
    type: "agent",
    updatedAt: "2026-11-04T06:00:00Z",
    createdAt: "2026-11-01T06:00:00Z",
  },
  {
    sessionId: "s-f",
    projectName: "proj-a",
    displayName: "s-f",
    status: "idle",
    type: "terminal",
    updatedAt: "2026-11-04T05:00:00Z",
  },
  {
    sessionId: "s-g",
    projectName: "proj-b",
    displayName: "s-g",
    status: "idle",
    type: "terminal",
    updatedAt: "2026-11-04T04:00:00Z",
  },
];

async function newPage(browser) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "zh-CN",
  });
  const page = await context.newPage();
  await page.route("**/api/overview", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        projectNames: ["proj-a", "proj-b", "proj-c", "proj-d", "proj-e"],
        candidates: CANDIDATES,
      }),
    }),
  );
  await page.route("**/api/overview/subtitles", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ subtitles: {} }),
    }),
  );
  await page.addInitScript(() => {
    localStorage.setItem("lang", "zh");
    // mock WS（page.route 拦不了 WebSocket）：session-shells WS 首帧全量快照会
    // setQueryData(["overview"]) 用真实会话覆盖 route fixture（use-session-shells.ts
    // applyShellsFrame——实测间歇性「candidates 真实 + projectNames fixture」混合态）。
    // 假开 socket 吞掉 onmessage 赋值让推送通道静默，fixture 恒生效；WS 断流由
    // overview 10s 轮询兜底（也被 route 拦），无自愈副作用。
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
  return page;
}

async function goProjects(page) {
  await page.goto(`${WEB_ORIGIN}/projects`);
  await page.getByText("s-a").first().waitFor({ state: "visible", timeout: 10_000 });
}

const browser = await chromium.launch();
try {
  const page = await newPage(browser);
  await goProjects(page);

  // 1. 默认态：预览 3 行 + 按钮
  const countOf = async (text) => await page.getByText(text, { exact: true }).count();
  check(
    "1a 默认活动 3 行可见",
    (await countOf("s-a")) === 1 && (await countOf("s-b")) === 1 && (await countOf("s-c")) === 1,
  );
  check(
    "1b 默认活动第 4+ 行不在 DOM",
    (await countOf("s-d")) === 0 && (await countOf("s-g")) === 0,
  );
  check("1c 查看全部活动按钮在场", (await page.getByText("查看全部活动 ›").count()) === 1);
  check(
    "1d 默认项目 3 行可见",
    (await countOf("proj-a")) === 1 &&
      (await countOf("proj-b")) === 1 &&
      (await countOf("proj-c")) === 1,
  );
  check(
    "1e 默认项目第 4+ 行不在 DOM",
    (await countOf("proj-d")) === 0 && (await countOf("proj-e")) === 0,
  );
  check("1f 查看全部项目按钮在场", (await page.getByText("查看全部项目 ›").count()) === 1);

  // 2. 活动展开 + reload 记忆
  await page.getByText("查看全部活动 ›").click();
  await page.getByText("s-g").waitFor({ state: "visible", timeout: 5000 });
  check("2a 活动展开后 7 行全可见", (await countOf("s-d")) === 1 && (await countOf("s-g")) === 1);
  await page.reload();
  await page.getByText("s-a").first().waitFor({ state: "visible", timeout: 10_000 });
  check("2b reload 后活动仍展开（s-g 可见）", (await countOf("s-g")) === 1);
  check("2c reload 后按钮文案 = 收起活动", (await page.getByText("收起活动").count()) === 1);

  // 3. 项目展开 + reload 记忆
  await page.getByText("查看全部项目 ›").click();
  await page.getByText("proj-e").waitFor({ state: "visible", timeout: 5000 });
  check(
    "3a 项目展开后 5 行全可见",
    (await countOf("proj-d")) === 1 && (await countOf("proj-e")) === 1,
  );
  await page.reload();
  await page.getByText("s-a").first().waitFor({ state: "visible", timeout: 10_000 });
  check("3b reload 后项目仍展开（proj-e 可见）", (await countOf("proj-e")) === 1);
  check("3c reload 后按钮文案 = 收起项目", (await page.getByText("收起项目").count()) === 1);

  // 4. 双收起 + reload 记忆（收起态同样持久化）
  await page.getByText("收起活动").click();
  await page.getByText("收起项目").click();
  await page
    .getByText("s-d")
    .waitFor({ state: "hidden", timeout: 5000 })
    .catch(() => {});
  await page.reload();
  await page.getByText("s-a").first().waitFor({ state: "visible", timeout: 10_000 });
  check("4a reload 后活动仍收起", (await countOf("s-d")) === 0);
  check("4b reload 后项目仍收起", (await countOf("proj-d")) === 0);
  check(
    "4c 两按钮回到查看全部文案",
    (await page.getByText("查看全部活动 ›").count()) === 1 &&
      (await page.getByText("查看全部项目 ›").count()) === 1,
  );

  // 还原探针写入的 keys（只动自己的两个 key）
  await page.evaluate(() => {
    localStorage.removeItem("projectsHome.activityExpanded");
    localStorage.removeItem("projectsHome.projectsExpanded");
  });

  const pass = results.every(Boolean);
  console.log(
    `\n${pass ? "ALL PASS" : "FAIL"}（${results.filter(Boolean).length}/${results.length}）`,
  );
  process.exit(pass ? 0 : 1);
} finally {
  await browser.close();
}
