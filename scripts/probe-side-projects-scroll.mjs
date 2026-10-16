// 桌面左栏项目列表布局探针（2026-10-16 项目过多挤压会话区批）：项目列表段
// max-h-[40%] + overflow-y-auto。DOM 几何硬数据断言：
//   Part 1（40 项目）：wrapper scrollHeight > clientHeight（可滚）；wrapper 高 ≤ 栏高
//     40%（上限生效）；#side-instance-panel 高 ≥ 8 行会话（会话区可操作保底）。
//   Part 2（3 项目）：scrollHeight ≤ clientHeight（项目少时无内部滚动，与现状零差异）。
//
// mock 数据（不污染真环境）；密码自读不打印。用法：bun scripts/probe-side-projects-scroll.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";

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

// 项目列表 wrapper = nav.side 内直接子含 button.srow2 的第一个 div。
async function measure(page) {
  return page.evaluate(() => {
    const nav = document.querySelector("nav.side");
    if (!nav) return null;
    let wrapper = null;
    for (const div of nav.querySelectorAll("div")) {
      if (div.querySelector(":scope > button.srow2")) {
        wrapper = div;
        break;
      }
    }
    const panel = document.querySelector("#side-instance-panel");
    if (!wrapper || !panel) return null;
    return {
      navH: nav.clientHeight,
      wScroll: wrapper.scrollHeight,
      wClient: wrapper.clientHeight,
      wScrollable: wrapper.scrollHeight > wrapper.clientHeight,
      panelH: panel.clientHeight,
    };
  });
}

async function runScenario(browser, projectCount) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "zh-CN",
  });
  const page = await ctx.newPage();
  const names = Array.from(
    { length: projectCount },
    (_, i) => `probe-proj-${String(i).padStart(2, "0")}`,
  );
  await page.route(/\/api\/overview$/, (r) =>
    r.fulfill(
      json({
        projectNames: names,
        candidates: [],
      }),
    ),
  );
  await page.route(/\/api\/projects\/[^/]+\/agent-sessions(?:\?.*)?$/, (r) =>
    r.fulfill(json({ sessions: [] })),
  );
  await page.goto(`${WEB_ORIGIN}/`);
  await page.waitForSelector('input[type="password"]', { timeout: 15000 });
  await page.getByLabel("访问密码").fill(await readAppPassword());
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForTimeout(700);
  await page.goto(`${WEB_ORIGIN}/projects/${names[0]}`);
  await page.waitForSelector("nav.side", { timeout: 10000 });
  await page.waitForSelector("#side-instance-panel", { timeout: 10000 });
  await page.waitForTimeout(400);
  const m = await measure(page);
  await ctx.close();
  return m;
}

(async () => {
  const browser = await chromium.launch();

  // ── Part 1: 40 项目 = 上限滚动 + 会话区保底 ──
  console.log("Part 1: 40 项目 → 项目列表内部滚动 + 会话区保底");
  const many = await runScenario(browser, 40);
  ok(!!many, "几何量度取得");
  if (many) {
    ok(
      many.wScrollable,
      `项目列表可滚（scrollHeight ${many.wScroll} > clientHeight ${many.wClient}）`,
    );
    ok(
      many.wClient <= many.navH * 0.4 + 1,
      `项目列表高 ≤ 栏高 40%（${many.wClient}px ≤ ${Math.floor(many.navH * 0.4)}px）`,
    );
    // 会话区保底用绝对地板（8 行会话 ≈ 可操作）而非栏高百分比——栏内 chrome 区
    //（组头/dsep/seg4/footnav ≈180px）不随栏高缩放，百分比阈值会误伤。
    ok(many.panelH >= 8 * 34, `会话区高 ≥ 8 行会话（${many.panelH}px ≥ 272px）`);
  }

  // ── Part 2: 3 项目 = 无内部滚动 ──
  console.log("Part 2: 3 项目 → 与现状零差异（无内部滚动）");
  const few = await runScenario(browser, 3);
  ok(!!few, "几何量度取得");
  if (few) {
    ok(
      !few.wScrollable,
      `项目列表不滚（scrollHeight ${few.wScroll} ≤ clientHeight ${few.wClient}）`,
    );
    ok(few.panelH >= 8 * 34, `会话区高 ≥ 8 行会话（${few.panelH}px）`);
  }

  await browser.close();
  console.log(
    `\n${failCount === 0 ? "ALL PASS" : "SOME FAILED"}: ${passCount} pass / ${failCount} fail`,
  );
  process.exit(failCount === 0 ? 0 : 1);
})();
