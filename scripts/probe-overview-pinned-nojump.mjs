// 探针：项目总览置顶 UI 不再二次刷新跳变（pinned query 与 candidates 同级 gate）。
// 验证修复：GlobalProjectsOverview gate = isLoaded(candidates) && pinnedLoaded(settled) 才渲染列表，
// 避免 candidates 先到渲染无置顶列表、pinned 后到插入置顶组的跳变。
//
// 策略：mock /api/overview 立即返回 + /api/state/overview/pinned-sessions 故意延迟 ~800ms。
//  断言 1：overview 到达后、pinned 延迟窗口内 → 列表主体未渲染（骨架承接，settled=false）。
//  断言 2：pinned 到达后 → 置顶组与项目组卡片同一次渲染出现（无先列表后置顶插入）。
// 密码自读不打印。用法：bun scripts/probe-overview-pinned-nojump.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";
import { verifyCssFlushed } from "./ar-verify-css.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const EXEC =
  "/home/deploy/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell";

// 一个 claude2 agent 实例，会被 pin。
const MOCK_CANDIDATES = [
  {
    type: "agent",
    projectName: "proj1",
    sessionId: "agent-pinned-1",
    displayName: "被置顶的会话",
    status: "running",
    provider: "claude2",
  },
  {
    type: "agent",
    projectName: "proj1",
    sessionId: "agent-normal-2",
    displayName: "普通会话",
    status: "running",
    provider: "claude2",
  },
];
const PINNED_SESSION_ID = "agent-pinned-1";
const PINNED_DELAY_MS = 800;

let allPass = true;
function record(ok, label) {
  if (!ok) allPass = false;
  console.log(`  ${ok ? "✓" : "✗"} ${label}`);
  return ok;
}

async function run() {
  // 前置：CSS 落盘三道闸（web DOM 探针铁律，frontend-notes §2/§10）。
  const css = await verifyCssFlushed({
    origin: WEB_ORIGIN,
    expectClasses: ["bg-surface-raised/30", "text-on-surface-muted"],
  });
  if (!css.pass) {
    console.error("CSS 落盘验证失败，探针中止：");
    css.details.forEach((d) => console.error(`  ${d}`));
    process.exit(1);
  }
  console.log("✓ CSS 落盘 + content-type 正常");

  const browser = await chromium.launch({ executablePath: EXEC });
  try {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      locale: "zh-CN",
    });
    const page = await ctx.newPage();

    // overview 立即返回；pinned 延迟返回（模拟两 query 结算时间差，放大跳变窗口）。
    let pinnedDelaying = true;
    await page.route(/\/api\/overview$/, (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ projectNames: ["proj1"], candidates: MOCK_CANDIDATES }),
      }),
    );
    await page.route(/\/api\/state\/overview\/pinned-sessions$/, async (r) => {
      if (pinnedDelaying) {
        pinnedDelaying = false;
        await new Promise((resolve) => setTimeout(resolve, PINNED_DELAY_MS));
      }
      return r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ sessions: [PINNED_SESSION_ID] }),
      });
    });

    // 登录（走真实后端，密码自读）。
    await page.goto(`${WEB_ORIGIN}/`);
    await page
      .getByLabel("密码")
      .or(page.getByLabel("Password"))
      .fill(await readAppPassword());
    await page.getByRole("button", { name: /解锁|Unlock/ }).click();

    // 进全局总览（桌面 scope=global 左栏 = GlobalProjectsOverview）。
    await page.waitForResponse((r) => r.url().endsWith("/api/overview"), { timeout: 10000 });
    // overview 已到达，但 pinned 仍在延迟窗口内（刚触发，~800ms 未到）。
    // 等一小段让 React commit（若 gate 失效，此刻会渲染无置顶列表）。
    await page.waitForTimeout(250);

    // 断言 1：pinned 延迟窗口内，列表主体不应渲染（settled=false → 骨架承接）。
    // 卡片选择器：InstanceCard 根 [role="button"]（candidateToGridItem → onSelect）。
    const cardsDuringDelay = await page.locator('[role="button"]').count();
    // 骨架占位（CardGridSkeleton）不是 [role="button"]，故计数应为 0。
    record(
      cardsDuringDelay === 0,
      `断言1 pinned 延迟窗口内列表未渲染（cards=${cardsDuringDelay}，期望 0 = 骨架承接）`,
    );

    // 等 pinned 延迟结束 + 渲染结算。
    await page.waitForResponse((r) => r.url().indexOf("/api/state/overview/pinned-sessions") >= 0, {
      timeout: 10000,
    });
    await page.waitForSelector('[role="button"]', { timeout: 10000 });
    await page.waitForTimeout(300); // 让置顶组 + 项目组都 commit。

    // 断言 2：置顶组 + 项目组卡片都出现。
    // 置顶组标题行 button（title=置顶/Pinned + aria-expanded）。注意：未置顶卡片的 pin 按钮
    // aria-label 也是"置顶"，但 pin 按钮无 aria-expanded → 用 [aria-expanded] 精确过滤标题行。
    const pinnedHeader = page.locator("button[aria-expanded]").filter({ hasText: "置顶" });
    const pinnedHeaderVisible = await pinnedHeader.count();
    // 卡片应 ≥ 2（被置顶的 + 普通的；置顶组双显示故被置顶的出现 2 次 → ≥3）。
    const cardsAfter = await page.locator('[role="button"]').count();
    record(
      pinnedHeaderVisible === 1 && cardsAfter >= 3,
      `断言2 pinned 到达后置顶组与项目组同次渲染（置顶标题=${pinnedHeaderVisible}，cards=${cardsAfter}≥3）`,
    );

    // 断言 3（无跳变核心）：被置顶的卡片同时出现在置顶组（顶部）+ 项目组。
    // 用 title 文本「被置顶的会话」定位，应 ≥2 张（置顶组 1 + 项目组 1）。
    const pinnedCardCount = await page
      .locator('[role="button"]')
      .filter({ hasText: "被置顶的会话" })
      .count();
    record(
      pinnedCardCount >= 2,
      `断言3 被置顶卡片双显示（置顶组+项目组，count=${pinnedCardCount}≥2）`,
    );
  } finally {
    await browser.close();
  }
}

(async () => {
  await run();
  console.log(`\n总计: ${allPass ? "ALL PASS" : "有 FAIL"}`);
  process.exit(allPass ? 0 : 1);
})();
