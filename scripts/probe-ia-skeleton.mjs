// IA 骨架验证（v2 M2：L0 登录页 / L1 4 Tab / D4「直达上次位置」/ 桌面 Sidebar）。
//
// 覆盖单测验不到的真实浏览器行为：
//   Part 1（L0 登录页，06-login 原型）：tagline / 服务器 field / 密码 field / hint / PWA foot
//     提示 + logo 徽章 72×72 主色底 + 登录钮胶囊（DOM 几何，禁截图）。
//   Part 2（L1 移动 4 Tab，D21）：底 nav 恰为 项目/工作台/文件/插件（无「设置」——移到项目页 ⚙）。
//   Part 3（D4「直达上次位置」）：无记忆时 `/` → `/projects`（项目列表）；写入 lastProjectKey 后
//     `/` → `/projects/$key`（进项目后 shell 未卸载，一级导航仍在）。
//   Part 4（桌面 side，§6.12k 三列化）：`nav.side` 宽 250px + 项目行列表 + footnav 三项
//     （全局文件/插件/设置）+ 工作台态 footnav 0 active（原型 05）+ 点 footnav「全局文件」
//     → /files 且 active 跟随（原型 10m）。
//
// 密码自读（config.yaml → api environ），不进 agent 上下文、不打印值。
// 用法：bun scripts/probe-ia-skeleton.mjs
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

// ── Part 1 + 2 + 3：移动视口 ─────────────────────────────────────────────────
console.log("Part 1: L0 登录页（06-login 原型）");
const browser = await chromium.launch();
const mobile = await browser.newContext({
  viewport: { width: 390, height: 844 },
  locale: "zh-CN",
});
const page = await mobile.newPage();
await page.goto(`${ORIGIN}/`);
await page.waitForSelector('input[type="password"]', { timeout: 15000 });

ok(await page.getByText("远程调度与观察你的 AI Agent").isVisible(), "tagline（auth.tagline）");
ok(await page.getByText("服务器").first().isVisible(), "服务器 field（06 原型 ①）");
ok(await page.getByText("登录一次后本机免密").isVisible(), "hint 免密提示（06 原型 ②）");
ok(await page.getByText("添加到主屏幕").isVisible(), "foot PWA 提示（非 standalone）");

const logo = await page.evaluate(() => {
  const el = document.querySelector('main div[class*="rounded-[18px]"]');
  if (!el) return null;
  const { width, height } = el.getBoundingClientRect();
  return { width, height, bg: getComputedStyle(el).backgroundColor };
});
ok(
  logo?.width === 72 && logo?.height === 72,
  `logo 徽章 72×72（实际 ${logo?.width}×${logo?.height}）`,
);
ok(
  logo?.bg === "rgb(0, 122, 255)" || logo?.bg === "rgb(10, 132, 255)",
  `logo 底 = --c-primary（light #007aff / dark #0a84ff，实际 ${logo?.bg}）`,
);

const loginRadius = await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "登录");
  return b ? getComputedStyle(b).borderRadius : null;
});
ok(parseFloat(loginRadius) > 100, `登录钮胶囊（rounded-full，实际 ${loginRadius}）`);

console.log("Part 2: L1 移动 3 Tab（v1.5 铁律 4，工作台 Tab 退役）");
await page.getByLabel("访问密码").fill(await readAppPassword());
await page.getByRole("button", { name: "登录" }).click();
await page.waitForSelector("nav[aria-label]", { timeout: 15000 });
await page.waitForTimeout(2000);

const tabs = await page.evaluate(() =>
  [...document.querySelectorAll("nav[aria-label] a, nav[aria-label] button")]
    .map((n) => n.textContent.trim())
    .filter(Boolean),
);
ok(tabs.join(",") === "项目,文件,插件", `3 Tab = ${tabs.join(",")}（v1.5 三 Tab）`);
ok(!tabs.includes("工作台"), "底 nav 无「工作台」（v1.5 铁律 4 退役）");
ok(!tabs.includes("设置"), "底 nav 无「设置」（D21 移到项目页 ⚙ push）");

console.log(
  "Part 3: D4「直达上次位置」（v1.5 跳板三级：lastSession → lastProjectKey → /projects）",
);
// 无记忆：`/` → 项目列表（冷启动从项目开始；lastSession 一并清，测纯无记忆分支）
await page.evaluate(() => {
  localStorage.removeItem("workbench.lastProjectKey");
  localStorage.removeItem("workbench.lastSession");
});
await page.goto(`${ORIGIN}/`);
await page.waitForTimeout(1200);
ok(
  new URL(page.url()).pathname === "/projects",
  `无记忆 \`/\` → /projects（实际 ${new URL(page.url()).pathname}）`,
);

// 有 lastProjectKey（次级兜底）：`/` → 上次项目（lastSession 无值时的 v1.5 行为）
const key = await page.evaluate(async () => {
  const r = await fetch("/api/overview");
  if (!r.ok) return null;
  const d = await r.json();
  return (d.projectNames ?? [])[0] ?? null;
});
if (key) {
  await page.evaluate(
    (k) => localStorage.setItem("workbench.lastProjectKey", JSON.stringify(k)),
    key,
  );
  await page.goto(`${ORIGIN}/`);
  await page.waitForTimeout(1200);
  ok(
    new URL(page.url()).pathname === `/projects/${key}`,
    `记忆后 \`/\` → /projects/${key}（实际 ${new URL(page.url()).pathname}）`,
  );
  // v2 M3-b：project scope 是 push 二级页（03 原型），底 nav 只在全局一级页；
  // 工作台由 .back「项目」承担返回。
  const hasBack = await page.evaluate(
    () =>
      !!document.querySelector(".nav .back") &&
      [...document.querySelectorAll(".nav .back")].some((b) => b.textContent.trim() === "项目"),
  );
  ok(hasBack, "进入项目后是工作台二级页（.back「项目」在，底 nav 收起 = push 形态）");
} else {
  ok(false, "无项目数据，D4 记忆路径未验证（跳过）");
}
await mobile.close();

// ── Part 4：桌面 Sidebar（v2 IA，取代 ActivityBar）────────────────────────────
console.log("Part 4: 桌面 Sidebar（M2 换代）");
const desktop = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: "zh-CN",
});
const dpage = await desktop.newPage();
await dpage.goto(`${ORIGIN}/`);
await dpage.waitForSelector('input[type="password"]', { timeout: 15000 });
await dpage.getByLabel("访问密码").fill(await readAppPassword());
await dpage.getByRole("button", { name: "登录" }).click();
await dpage.waitForTimeout(2500);

const sidebar = await dpage.evaluate(() => {
  const nav = document.querySelector("nav.side");
  if (!nav) return null;
  const { width } = nav.getBoundingClientRect();
  const cs = getComputedStyle(nav);
  const footnav = nav.querySelector(".footnav");
  const footItems = footnav
    ? [...footnav.querySelectorAll("button")].map((b) => b.textContent.trim())
    : [];
  return {
    width,
    borderRight: cs.borderRightWidth,
    footItems,
    onItems: [...nav.querySelectorAll(".footnav button.on")].map((b) => b.textContent.trim()),
    hasFootnav: !!footnav,
  };
});
ok(!!sidebar, "桌面 side（nav.side）已渲染");
ok(
  Math.round(sidebar?.width ?? 0) === 250,
  `side 宽 250px（设计包 .side，实际 ${Math.round(sidebar?.width ?? 0)}）`,
);
ok(
  sidebar?.hasFootnav && sidebar?.footItems.join(",") === "全局文件,插件,设置",
  `footnav 三项（实际 ${JSON.stringify(sidebar?.footItems)}）`,
);
// 原型 05 工作台态 footnav 无 active 项（07m/09m/10m mainPage 才各有对应 .on）。
ok(
  sidebar?.onItems.length === 0,
  `工作台态 footnav 0 项 active（原型 05，实际 ${JSON.stringify(sidebar?.onItems)}）`,
);
ok(parseFloat(sidebar?.borderRight ?? "0") > 0, `side 有右边框（${sidebar?.borderRight}）`);

await dpage.locator(".footnav button", { hasText: "全局文件" }).first().click();
await dpage.waitForTimeout(1000);
ok(
  new URL(dpage.url()).pathname.startsWith("/files"),
  `点 footnav「全局文件」→ ${new URL(dpage.url()).pathname}`,
);
const activeAfter = await dpage.evaluate(() =>
  [...document.querySelectorAll("nav.side .footnav button.on")].map((b) => b.textContent.trim()),
);
ok(activeAfter.includes("全局文件"), `文件页 active 跟随（实际 ${JSON.stringify(activeAfter)}）`);
await desktop.close();

await browser.close();
console.log(`\n${passCount} pass, ${failCount} fail`);
if (failCount > 0) process.exit(1);
