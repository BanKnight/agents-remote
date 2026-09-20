// 移动项目 Tab 主页形态验证（v2 M3-a，对标 02-tab-projects.html 原型）。
//
// 覆盖单测验不到的真实浏览器 DOM 几何（禁截图，getComputedStyle/getBoundingClientRect 硬数据）：
//   Large title「项目」30px/800（--text-large-title）+ ➕/⚙ 22px 图标组（D21：设置自项目页 push）
//   搜索框 h38 / r12 / bg = --fill-search（双主题按 CSS var 换算比对，不锁具体主题态）
//   全局活动卡 rounded-xl(16px = 原型 .gcard radius.card) + 1px 描边 + bg = --bg-elevated；活动行 dot 7×7 圆（有数据时）
//   「项目 · N」sec（N = overview 项目数）+ pj-row folder 30×30 徽章 + 尾部 tchip（● N / —）
//   搜索过滤交互（乱串 → 「项目 · 0」）+ 点项目行 → /projects/$key（一级导航仍在）
//
// 只读探针：不创建/删除任何数据（导航与搜索输入均为纯客户端 state）。
// 密码自读（config.yaml → api environ），不进 agent 上下文、不打印值。
// 用法：bun scripts/probe-mobile-projects-home.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const ORIGIN = process.env.AR_WEB_ORIGIN ?? "http://127.0.0.1:43012";

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

// CSS var 返回 #rrggbb 原文，backgroundColor 返回 rgb(...) —— 换算后比对，双主题通用。
function hexToRgb(hex) {
  const m = /^#([0-9a-f]+)$/i.exec(hex.trim());
  if (!m) return hex.trim();
  const v = m[1];
  const full =
    v.length === 3
      ? v
          .split("")
          .map((c) => c + c)
          .join("")
      : v;
  const n = parseInt(full, 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "zh-CN" });
const page = await ctx.newPage();
await page.goto(`${ORIGIN}/`);
await page.waitForSelector('input[type="password"]', { timeout: 15000 });
await page.getByLabel("访问密码").fill(await readAppPassword());
await page.getByRole("button", { name: "登录" }).click();
await page.waitForSelector("nav[aria-label]", { timeout: 15000 });
await page.goto(`${ORIGIN}/projects`);
await page.waitForTimeout(2000);

console.log("Part 1: Large title 行（原型 .h-row）");
const title = await page.evaluate(() => {
  const h1 = [...document.querySelectorAll("h1")].find((x) => x.textContent.trim() === "项目");
  if (!h1) return null;
  const cs = getComputedStyle(h1);
  return { fontSize: cs.fontSize, weight: cs.fontWeight };
});
ok(
  title?.fontSize === "30px" && String(title?.weight) === "800",
  `Large title 30px/800（实际 ${title?.fontSize}/${title?.weight}）`,
);

ok(
  (await page.getByRole("button", { name: "创建或采用项目" }).count()) === 1,
  "➕ 新建项目入口恰 1 个（aria-label）",
);
ok(
  (await page.getByRole("button", { name: "设置" }).count()) === 1,
  "⚙ 设置入口恰 1 个（D21：仅项目页 ⚙，底 nav 无设置）",
);
const iconSize = await page.evaluate(() => {
  const btn = [...document.querySelectorAll("button")].find(
    (b) => b.getAttribute("aria-label") === "创建或采用项目",
  );
  const svg = btn?.querySelector("svg");
  if (!svg) return null;
  const { width, height } = svg.getBoundingClientRect();
  return { width, height };
});
ok(
  Math.round(iconSize?.width ?? 0) === 22 && Math.round(iconSize?.height ?? 0) === 22,
  `➕ 图标 22×22（原型 .h-row svg 22px，实际 ${iconSize?.width}×${iconSize?.height}）`,
);

console.log("Part 2: 搜索框（原型 .search）");
const search = await page.evaluate(() => {
  const input = document.querySelector('input[placeholder="搜索项目与会话"]');
  const box = input?.parentElement;
  if (!box) return null;
  const { height } = box.getBoundingClientRect();
  const cs = getComputedStyle(box);
  const varVal = getComputedStyle(document.documentElement)
    .getPropertyValue("--fill-search")
    .trim();
  return { height, radius: cs.borderRadius, bg: cs.backgroundColor, varVal };
});
ok(
  Math.round(search?.height ?? 0) === 38,
  `搜索框高 38px（实际 ${Math.round(search?.height ?? 0)}）`,
);
ok(search?.radius === "12px", `搜索框圆角 12px（--radius-lg，实际 ${search?.radius}）`);
ok(
  search?.bg === hexToRgb(search?.varVal ?? ""),
  `搜索框底 = --fill-search（${search?.varVal} → ${search?.bg}）`,
);

console.log("Part 3: 全局活动卡 + 项目卡（原型 .gcard / .pj-row）");
// 卡专属选择器（rounded-xl + border-sep）：底 nav 胶囊也是 rounded-2xl（border-on-surface/10），
// 裸 rounded-xl 会误捕底 nav（同为圆角卡）。
const cardCount = await page.locator("div.rounded-xl.border-sep").count();
ok(cardCount === 2, `两卡（活动 + 项目）（实际 ${cardCount}）`);

const actCard = await page.evaluate(() => {
  const el = document.querySelectorAll("div.rounded-xl.border-sep")[0];
  if (!el) return null;
  const cs = getComputedStyle(el);
  const root = getComputedStyle(document.documentElement);
  return {
    radius: cs.borderRadius,
    borderW: cs.borderTopWidth,
    borderStyle: cs.borderTopStyle,
    bg: cs.backgroundColor,
    varElev: root.getPropertyValue("--bg-elevated").trim(),
    secVisible: [...document.querySelectorAll("span")].some((s) => s.textContent === "全局活动"),
    dot: (() => {
      const d = el.querySelector("span.rounded-full");
      if (!d) return null;
      const { width, height } = d.getBoundingClientRect();
      return { width, height };
    })(),
  };
});
ok(actCard?.secVisible, "「全局活动」sec 标题可见");
ok(
  actCard?.radius === "16px",
  `活动卡圆角 16px（--radius-xl = 原型 .gcard，实际 ${actCard?.radius}）`,
);
ok(
  actCard?.borderW === "1px" && actCard?.borderStyle === "solid",
  `活动卡 1px 描边（实际 ${actCard?.borderW} ${actCard?.borderStyle}）`,
);
ok(
  actCard?.bg === hexToRgb(actCard?.varElev ?? ""),
  `活动卡底 = --bg-elevated（${actCard?.varElev} → ${actCard?.bg}）`,
);
// dot 仅在有活动行时渲染（空态只有 noActivity 文案）——条件断言。
if (actCard?.dot) {
  ok(
    Math.round(actCard.dot.width) === 7 && Math.round(actCard.dot.height) === 7,
    `活动行状态 dot 7×7（实际 ${actCard.dot.width}×${actCard.dot.height}）`,
  );
} else {
  console.log("  · 无活动实例，dot 断言跳过（空态「暂无进行中的活动」承担）");
}

const overview = await page.evaluate(async () => {
  const r = await fetch("/api/overview");
  if (!r.ok) return null;
  return r.json();
});
const projectCount = overview?.projectNames?.length ?? 0;
ok(projectCount > 0, `探针前提：overview 有项目（${projectCount} 个）`);

const projCard = await page.evaluate(() => {
  const el = document.querySelectorAll("div.rounded-xl.border-sep")[1];
  if (!el) return null;
  const spans = [...el.querySelectorAll("span")];
  const badge = spans.find((s) => {
    const r = s.getBoundingClientRect();
    return Math.round(r.width) === 30 && Math.round(r.height) === 30;
  });
  const sec = [...document.querySelectorAll("span")].find((s) =>
    /^项目 · \d+$/.test(s.textContent),
  );
  const chips = spans
    .map((s) => ({ text: s.textContent.trim(), radius: getComputedStyle(s).borderRadius }))
    .filter((x) => x.radius === "9px");
  return { badgeFound: !!badge, secText: sec?.textContent, chipTexts: chips.map((c) => c.text) };
});
ok(
  projCard?.secText === `项目 · ${projectCount}`,
  `「项目 · N」sec 与 overview 项目数一致（实际 ${projCard?.secText}，期望 N=${projectCount}）`,
);
ok(projCard?.badgeFound, "项目行 folder 徽章 30×30（原型 .pj-row 图标位）");
ok(
  (projCard?.chipTexts ?? []).length >= 1 &&
    (projCard?.chipTexts ?? []).every((t) => /^● \d+$/.test(t) || t === "—"),
  `项目行尾 tchip 形态（● N / —，实际 ${JSON.stringify(projCard?.chipTexts)}）`,
);

console.log("Part 4: 搜索过滤 + 项目行导航");
const input = page.locator('input[placeholder="搜索项目与会话"]');
await input.fill("zzzz_no_match_zzzz");
await page.waitForTimeout(300);
ok(
  await page.getByText("项目 · 0", { exact: true }).isVisible(),
  "乱串 → 「项目 · 0」（客户端过滤）",
);
await input.fill("");
await page.waitForTimeout(300);
ok(
  (await page
    .locator("span")
    .filter({ hasText: /^项目 · \d+$/ })
    .first()
    .textContent()) === `项目 · ${projectCount}`,
  "清空搜索 → 项目数恢复",
);

const firstName = overview?.projectNames?.[0];
await page.locator("div.rounded-xl.border-sep").nth(1).locator("button").first().click();
await page.waitForURL(`**/projects/${firstName}`, { timeout: 5000 });
ok(
  new URL(page.url()).pathname === `/projects/${firstName}`,
  `点项目行 → /projects/${firstName}（实际 ${new URL(page.url()).pathname}）`,
);
// v2 M3-b：project scope 是 push 二级页（03 原型）——底 nav 只在全局一级页，项目工作台
// 由 .back「项目」承担返回（evaluate 内执行）。
const hasBack = await page.evaluate(
  () =>
    !!document.querySelector(".nav .back") &&
    [...document.querySelectorAll(".nav .back")].some((b) => b.textContent.trim() === "项目"),
);
ok(hasBack, "进项目后是工作台二级页（.back「项目」返回入口在，03 原型 push 形态）");

await ctx.close();
await browser.close();
console.log(`\n${passCount} pass, ${failCount} fail`);
if (failCount > 0) process.exit(1);
