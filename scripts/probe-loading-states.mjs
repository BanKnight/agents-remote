// 加载态体系探针（§6.12o：伪空态修复 + LoadingBlock 单源 + keepPreviousData）。
//
// 覆盖单测验不到的真实浏览器行为（mock API 延迟 700ms 拉出 pending 窗口；DOM 几何硬数据，禁截图）：
//   Part 1（移动 ?tab=git）：GitToolPanel pending 显 ListRowSkeleton、不显「没有变更」伪空态；
//     数据到后伪空态消失、真实 frow 渲染。
//   Part 2（移动 ?tab=wiki）：WikiToolPanel pending 显骨架、不显「Agent 通过 wiki MCP…」伪空态。
//   Part 3（移动 /git/history）：L3GitHistory pending 显骨架、不显「HEAD · 共 0 次提交」伪 meta；
//     数据到后 meta 显真实计数（「共 2 次提交」）。
//   Part 4（移动 /plugins）：插件 home MCP 段 pending 显骨架、不显「暂无 MCP 服务器」伪空态。
//   Part 5（桌面 focus 不存在 session）：中栏 AgentPanelRouter 的 LoadingBlock「加载会话…」
//     ping 圆点 + 文案 + 垂直居中几何（原 return null 最大空白点）。
//   Part 6（移动 L3 file preview）：LoadingBlock「正在加载预览...」ping 圆点 + 文案可见。
//
// 时序范式：先 waitForSelector（scope 收窄到目标面板）确认 pending 期骨架，再断言伪空态
// 文案不存在——避免固定 sleep 竞速。keepPreviousData 的行为覆盖（history range 切档不闪骨架）
// 需桌面 range 切换 UI 驱动的二次响应时序，本轮记档待办（代码层由 useHistorySessions 注释
// 「isLoading 含 placeholder 期」守护空→空切换回归）。
//
// mock 三铁律：形状对齐 shared；后注册先匹配（延迟 mock 晚注册）；approvals/stream abort。
// 密码自读（config.yaml → api environ），不进 agent 上下文、不打印值。
// 用法：touch web/src/main.tsx && sleep 16 && bun scripts/probe-loading-states.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const ORIGIN = process.env.AR_WEB_ORIGIN ?? "http://127.0.0.1:43012";
const PROJ = "proj1";
// mock API 延迟（ms）：拉出 pending 窗口让断言有确定时序（plan 拍板 300-800ms 取中）。
const MOCK_DELAY_MS = 700;

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

const MOBILE_CTX = {
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  locale: "zh-CN",
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
};
const DESKTOP_CTX = { viewport: { width: 1600, height: 1000 }, locale: "zh-CN" };

const AGENT_S = {
  type: "agent",
  sessionId: "agent_probe_loading",
  projectName: PROJ,
  provider: "claude",
  displayName: "Probe Agent",
  status: "idle",
  createdAt: "2026-07-26T00:00:00.000Z",
  updatedAt: "2026-07-26T00:00:00.000Z",
};

/** 延迟 fulfill 的 route handler 工厂。 */
const delayedJson =
  (body, ms = MOCK_DELAY_MS) =>
  async (r) => {
    await new Promise((res) => setTimeout(res, ms));
    await r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  };

/** mock 基座：overview / sessions 列表 / approvals WS abort（铁律③）。延迟目标由各 Part 追加注册
 * （后注册先匹配）。 */
async function setupBaseMocks(page) {
  await page.route(/\/api\/overview$/, (r) =>
    // candidates 携带 AGENT_S：global scope 实例 refs = overview candidates 派生（空则 focus
    // 会被 prune 回空态，LoadingBlock 永不挂载——Part 5 依赖它）。
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ projectNames: [PROJ], candidates: [AGENT_S] }),
    }),
  );
  await page.route(/\/api\/overview\/subtitles$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ subtitles: {} }),
    }),
  );
  await page.route(new RegExp(`/api/projects/${PROJ}/agent-sessions(?:\\?.*)?$`), (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sessions: [AGENT_S] }),
    }),
  );
  await page.route(new RegExp(`/api/projects/${PROJ}/terminal-sessions(?:\\?.*)?$`), (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sessions: [] }),
    }),
  );
  await page.route(new RegExp(`/api/projects/${PROJ}/agent-history.*`), (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        entries: [],
        counts: { all: 0, active: 0, ended: 0 },
        nextCursor: null,
        filter: "all",
      }),
    }),
  );
  await page.route(/\/api\/approvals$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ approvals: [] }),
    }),
  );
  await page.route(/\/api\/approvals\/stream$/, (r) => r.abort());
  await page.routeWebSocket(/stream/, (ws) => ws.connectToServer());
}

async function login(page) {
  await page.goto(`${ORIGIN}/`);
  await page.waitForSelector('input[type="password"]', { timeout: 15000 });
  await page.getByLabel("访问密码").fill(await readAppPassword());
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForSelector("nav[aria-label]", { timeout: 15000 });
}

/** 伪空态断言对（pending 期）：骨架在（= 确定 pending）+ 伪空态文案不在。scopeSelector 收窄
 * 骨架断言到目标面板容器，防被同页其他面板骨架满足（假阳性窗口）。 */
async function assertPendingSkeleton(page, { emptyText, part, scopeSelector }) {
  await page.waitForSelector(`${scopeSelector} .skeleton-shimmer`, { timeout: 6000 });
  ok(true, `${part}: pending 显同形骨架（${scopeSelector} .skeleton-shimmer 在 = isPending 期）`);
  const emptyVisible = await page
    .getByText(emptyText, { exact: false })
    .first()
    .isVisible()
    .catch(() => false);
  ok(!emptyVisible, `${part}: pending 不显伪空态「${emptyText.slice(0, 12)}…」`);
}

async function run() {
  const browser = await chromium.launch();
  try {
    // ── Part 1：GitToolPanel（移动 ?tab=git）──────────────────────────────
    console.log("\n===== Part 1. GitToolPanel pending 骨架（防「没有变更」伪空态）=====");
    {
      const ctx = await browser.newContext(MOBILE_CTX);
      const page = await ctx.newPage();
      await setupBaseMocks(page);
      await page.route(
        new RegExp(`/api/projects/${PROJ}/git/diff$`),
        delayedJson({
          repository: true,
          branch: { name: "main", ahead: 1, behind: 0 },
          files: [
            { path: "src/probe.ts", scope: "worktree", status: "modified" },
            { path: "README.md", scope: "worktree", status: "modified" },
          ],
        }),
      );
      await login(page);
      await page.goto(`${ORIGIN}/projects/${PROJ}?tab=git`);
      await assertPendingSkeleton(page, {
        emptyText: "没有变更",
        part: "git",
        scopeSelector: '[data-mobile-tool="git"]',
      });
      // 数据到后：伪空态消失，真实 frow（含 git badge 的文件行）渲染。
      await page.waitForSelector('button.frow:has-text("src/probe.ts")', { timeout: 6000 });
      const noChanges = await page
        .getByText("没有变更")
        .isVisible()
        .catch(() => false);
      ok(!noChanges, "git: 数据到后「没有变更」不显（真实改动行在）");
      await ctx.close();
    }

    // ── Part 2：WikiToolPanel（移动 ?tab=wiki）────────────────────────────
    console.log("\n===== Part 2. WikiToolPanel pending 骨架（防「暂无页面」伪空态）=====");
    {
      const ctx = await browser.newContext(MOBILE_CTX);
      const page = await ctx.newPage();
      await setupBaseMocks(page);
      await page.route(
        new RegExp(`/api/projects/${PROJ}/wiki$`),
        delayedJson({
          pages: [{ slug: "guide", title: "Guide", tags: [], updatedAt: "2026-07-26T00:00:00Z" }],
        }),
      );
      await login(page);
      await page.goto(`${ORIGIN}/projects/${PROJ}?tab=wiki`);
      await assertPendingSkeleton(page, {
        emptyText: "Agent 通过 wiki MCP 工具写入的页面会显示在这里",
        part: "wiki",
        scopeSelector: '[data-mobile-tool="wiki"]',
      });
      await ctx.close();
    }

    // ── Part 3：L3GitHistory（移动 /git/history）──────────────────────────
    console.log("\n===== Part 3. L3GitHistory pending 骨架（防「HEAD · 共 0 次提交」）=====");
    {
      const ctx = await browser.newContext(MOBILE_CTX);
      const page = await ctx.newPage();
      await setupBaseMocks(page);
      await page.route(
        new RegExp(`/api/projects/${PROJ}/git/log\\??.*`),
        delayedJson({
          total: 2,
          commits: [
            {
              hash: "abc1234",
              message: "probe commit one",
              author: "Probe",
              relativeTime: "just now",
              isoDate: "2026-07-26T00:00:00Z",
            },
            {
              hash: "def5678",
              message: "probe commit two",
              author: "Probe",
              relativeTime: "2 days ago",
              isoDate: "2026-07-24T00:00:00Z",
            },
          ],
        }),
      );
      await login(page);
      await page.goto(`${ORIGIN}/projects/${PROJ}/git/history`);
      await assertPendingSkeleton(page, {
        emptyText: "共 0 次提交",
        part: "history",
        scopeSelector: '[data-role="l3-git-history"]',
      });
      // 数据到后 meta 行显真实计数（keepPreviousData 门：首载 isPending 语义同源）。
      await page.waitForSelector("text=共 2 次提交", { timeout: 6000 });
      ok(true, "history: 数据到后 meta 显「共 2 次提交」（真实计数）");
      await ctx.close();
    }

    // ── Part 4：插件 home MCP 段（移动 /plugins）──────────────────────────
    console.log("\n===== Part 4. 插件 home MCP 段 pending 骨架（防「暂无 MCP」伪空态）=====");
    {
      const ctx = await browser.newContext(MOBILE_CTX);
      const page = await ctx.newPage();
      await setupBaseMocks(page);
      await page.route(
        /\/api\/mcp(\?.*)?$/,
        delayedJson({
          servers: [{ name: "probe-mcp", type: "stdio", command: "echo", args: ["hi"] }],
        }),
      );
      await login(page);
      await page.goto(`${ORIGIN}/plugins`);
      await assertPendingSkeleton(page, {
        emptyText: "暂无 MCP 服务器",
        part: "plugins",
        scopeSelector: "main",
      });
      await ctx.close();
    }

    // ── Part 5：中栏 LoadingBlock（桌面 focus 不存在 session）─────────────
    console.log("\n===== Part 5. 中栏会话面板 LoadingBlock（原 return null 空白点）=====");
    {
      const ctx = await browser.newContext(DESKTOP_CTX);
      const page = await ctx.newPage();
      await setupBaseMocks(page);
      await page.route(
        new RegExp(`/api/projects/${PROJ}/agent-sessions/${AGENT_S.sessionId}$`),
        delayedJson({
          session: AGENT_S,
          availableModels: ["opus"],
          availablePermissionModes: ["default"],
        }),
      );
      await login(page);
      await page.goto(`${ORIGIN}/projects/session/${AGENT_S.sessionId}`);
      // LoadingBlock ping 圆点 + 文案（原 detail.isLoading → return null 最大空白点）。
      await page.waitForSelector(".animate-ping", { timeout: 6000 });
      const label = await page
        .getByText("加载会话…", { exact: true })
        .first()
        .isVisible()
        .catch(() => false);
      ok(label, "center: LoadingBlock 显「加载会话…」文案");
      // 垂直居中几何：ping 圆点中心 ≈ 面板可视区中心（flex-1 撑满 + justify-center）。
      const geo = await page.evaluate(() => {
        const dot = document.querySelector(".animate-ping");
        const block = dot?.closest('[class*="flex-col"]');
        if (!dot || !block) return null;
        const dotR = dot.getBoundingClientRect();
        const blockR = block.getBoundingClientRect();
        return { dotY: dotR.top + dotR.height / 2, blockY: blockR.top + blockR.height / 2 };
      });
      ok(
        geo != null && Math.abs(geo.dotY - geo.blockY) < 40,
        `center: ping 圆点垂直居中（偏差 ${geo ? Math.round(geo.dotY - geo.blockY) : "n/a"}px < 40px）`,
      );
      await ctx.close();
    }

    // ── Part 6：L3 file preview LoadingBlock（移动）───────────────────────
    console.log("\n===== Part 6. L3 文件预览 LoadingBlock（ping 圆点 + 文案）=====");
    {
      const ctx = await browser.newContext(MOBILE_CTX);
      const page = await ctx.newPage();
      await setupBaseMocks(page);
      await page.route(
        new RegExp(`/api/projects/${PROJ}/files/preview.*`),
        delayedJson({ content: "probe", language: "markdown" }),
      );
      await login(page);
      await page.goto(`${ORIGIN}/projects/${PROJ}/file/README.md`);
      await page.waitForSelector(".animate-ping", { timeout: 6000 });
      const label = await page
        .getByText("正在加载预览...", { exact: true })
        .first()
        .isVisible()
        .catch(() => false);
      ok(label, "preview: LoadingBlock 显「正在加载预览...」+ animate-ping 圆点");
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  console.log(`\n===== 结果：${passCount} pass / ${failCount} fail =====`);
  process.exit(failCount > 0 ? 1 : 0);
}

await run();
