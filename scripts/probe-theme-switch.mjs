// 明暗主题切换验证（三态 + FOUC + token 命中）。
//
// 覆盖单测验不到的真实浏览器行为：
//   Part 1（静态）:index.html FOUC inline script 存在（读 localStorage["theme"] +
//     prefers-color-scheme → 首帧前注入 <html>.dark class + 背景色）;内联 <style> 硬编码背景
//     已移除（不硬编码背景，避免与 class 打架——FOUC 脚本与 index.css var() 驱动两层）。
//   Part 2（运行时，无需登录）:goto 后写入 localStorage theme 并 reload（FOUC 脚本首帧前读
//     新值）→ 验 <html>.dark class 三态（light / dark / system × colorScheme）+ getComputedStyle
//     (documentElement).backgroundColor 命中 token 值（light #eef2f7 / dark #020617，= index.css
//     `html { background-color: var(--bg-base) }`）+ meta theme-color 由 theme.ts 根 effect 更新。
//   Part 3（登录后设置弹窗）:ActivityBar 设置按钮 → SettingsDialog → theme SegmentedControl
//     点 Light/Dark/System → 验 class 实时切换 + system 跟随系统偏好实时变化。
//
// 密码自读（config.yaml → api environ），不进 agent 上下文、不打印值。
// 用法：node scripts/probe-theme-switch.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const ORIGIN = process.env.AR_WEB_ORIGIN ?? "http://127.0.0.1:43012";
// index.css `html { background-color: var(--bg-base) }` 的 light/dark 值（FOUC 内联同值）。
const LIGHT_BG = "rgb(238, 242, 247)"; // #eef2f7
const DARK_BG = "rgb(2, 6, 23)"; // #020617

// Terminal xterm 外壳 token（DESIGN.md「Terminal theme」节 + index.css --terminal-*）。
// readTerminalTheme 的映射源——单测（session-detail.test.tsx）已测映射逻辑，这里测真实 CSS 落盘值
// 在 light/dark 下解析到设计值（background ← --surface-inset、foreground ← --code-text、
// cursor ← --primary、ANSI 16 色 ← --terminal-*）。
const TOKEN_KEYS = [
  "--code-text",
  "--primary",
  "--surface",
  "--surface-inset",
  "--terminal-black",
  "--terminal-bright-black",
  "--terminal-red",
  "--terminal-bright-red",
  "--terminal-green",
  "--terminal-bright-green",
  "--terminal-yellow",
  "--terminal-bright-yellow",
  "--terminal-blue",
  "--terminal-bright-blue",
  "--terminal-magenta",
  "--terminal-bright-magenta",
  "--terminal-cyan",
  "--terminal-bright-cyan",
  "--terminal-white",
  "--terminal-bright-white",
];
const LIGHT_TOKENS = {
  "--code-text": "#1e293b",
  "--primary": "#0284c7",
  "--surface": "#f6f8fb",
  "--surface-inset": "#e2e8f0",
  "--terminal-black": "#1e293b",
  "--terminal-bright-black": "#64748b",
  "--terminal-red": "#dc2626",
  "--terminal-bright-red": "#ef4444",
  "--terminal-green": "#16a34a",
  "--terminal-bright-green": "#22c55e",
  "--terminal-yellow": "#ca8a04",
  "--terminal-bright-yellow": "#eab308",
  "--terminal-blue": "#2563eb",
  "--terminal-bright-blue": "#1d4ed8",
  "--terminal-magenta": "#9333ea",
  "--terminal-bright-magenta": "#a855f7",
  "--terminal-cyan": "#0891b2",
  "--terminal-bright-cyan": "#06b6d4",
  "--terminal-white": "#64748b",
  "--terminal-bright-white": "#0f1520",
};
const DARK_TOKENS = {
  "--code-text": "#d6e4f7",
  "--primary": "#7dd3fc",
  "--surface": "#0f1520",
  "--surface-inset": "#05080d",
  "--terminal-black": "#0f172a",
  "--terminal-bright-black": "#334155",
  "--terminal-red": "#f87171",
  "--terminal-bright-red": "#fca5a5",
  "--terminal-green": "#4ade80",
  "--terminal-bright-green": "#86efac",
  "--terminal-yellow": "#fbbf24",
  "--terminal-bright-yellow": "#fde68a",
  "--terminal-blue": "#60a5fa",
  "--terminal-bright-blue": "#93c5fd",
  "--terminal-magenta": "#c084fc",
  "--terminal-bright-magenta": "#d8b4fe",
  "--terminal-cyan": "#22d3ee",
  "--terminal-bright-cyan": "#67e8f9",
  "--terminal-white": "#cbd5e1",
  "--terminal-bright-white": "#f1f5f9",
};

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

// ── Part 1:静态（index.html FOUC script + 无内联背景 style）────────────────────
console.log("Part 1: FOUC 静态检查");
const html = await (await fetch(`${ORIGIN}/`)).text();
ok(/localStorage\.getItem\("theme"\)/.test(html), "FOUC script 读 localStorage[theme]");
ok(/prefers-color-scheme: dark/.test(html), "FOUC script 用 prefers-color-scheme 解析 system");
ok(/classList\.add\("dark"\)/.test(html), "FOUC script 首帧注入 <html>.dark class");
ok(
  !/<style[^>]*>[\s\S]*?background[\s\S]*?<\/style>/i.test(html),
  "无内联 <style> 硬编码背景（背景由 FOUC inline style + index.css var() 驱动）",
);

// ── Part 2:运行时三态 + FOUC（无需登录，FOUC script 对任意页面加载即生效）─────────
console.log("Part 2: 运行时三态 class + token 命中");
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "en-US" });
const page = await ctx.newPage();

async function gotoWithTheme(theme, colorScheme) {
  await page.emulateMedia({ colorScheme });
  await page.goto(`${ORIGIN}/`);
  // 首次 goto 用旧 theme；写入目标 theme 后 reload，让 FOUC 脚本在首帧前读新值。
  await page.evaluate((t) => {
    if (t === null) localStorage.removeItem("theme");
    else localStorage.setItem("theme", t);
  }, theme);
  await page.reload();
  await page.waitForLoadState("load");
}

async function snapshot() {
  return page.evaluate(() => {
    const bg = getComputedStyle(document.documentElement).backgroundColor;
    const meta = document.querySelector('meta[name="theme-color"]');
    return {
      dark: document.documentElement.classList.contains("dark"),
      bg,
      meta: meta?.getAttribute("content") ?? null,
    };
  });
}

async function readTokenSnapshot() {
  return page.evaluate((keys) => {
    const cs = getComputedStyle(document.documentElement);
    const out = {};
    for (const k of keys) out[k] = cs.getPropertyValue(k).trim();
    return out;
  }, TOKEN_KEYS);
}

function assertTokens(label, actual, expected) {
  for (const k of TOKEN_KEYS) {
    ok(actual[k] === expected[k], `${label} ${k}=${actual[k]} 命中 ${expected[k]}`);
  }
}

await gotoWithTheme("light", "light");
let s = await snapshot();
ok(!s.dark, "light:html 无 .dark");
ok(s.bg === LIGHT_BG, `light:html bg=${s.bg} 命中 ${LIGHT_BG}`);
assertTokens("light", await readTokenSnapshot(), LIGHT_TOKENS);

await gotoWithTheme("dark", "dark");
s = await snapshot();
ok(s.dark, "dark:html 有 .dark");
ok(s.bg === DARK_BG, `dark:html bg=${s.bg} 命中 ${DARK_BG}`);
assertTokens("dark", await readTokenSnapshot(), DARK_TOKENS);

await gotoWithTheme(null, "dark");
s = await snapshot();
ok(s.dark, "system + 系统 dark:html 有 .dark");
ok(s.bg === DARK_BG, `system dark:html bg=${s.bg} 命中 ${DARK_BG}`);

await gotoWithTheme(null, "light");
s = await snapshot();
ok(!s.dark, "system + 系统 light:html 无 .dark");
ok(s.bg === LIGHT_BG, `system light:html bg=${s.bg} 命中 ${LIGHT_BG}`);

// meta theme-color：theme.ts 根 effect（ThemeSync）挂载后按 resolved 更新。
await gotoWithTheme("light", "light");
await page.waitForFunction(
  () => document.querySelector('meta[name="theme-color"]')?.getAttribute("content") === "#eef2f7",
  null,
  { timeout: 5000 },
);
ok(true, "light:meta theme-color → #eef2f7（ThemeSync 根 effect）");
await gotoWithTheme("dark", "dark");
await page.waitForFunction(
  () => document.querySelector('meta[name="theme-color"]')?.getAttribute("content") === "#020617",
  null,
  { timeout: 5000 },
);
ok(true, "dark:meta theme-color → #020617（ThemeSync 根 effect）");

// ── Part 3:登录 + 设置弹窗三态切换 ─────────────────────────────────────────────
console.log("Part 3: 设置弹窗三态切换");
await page.goto(`${ORIGIN}/`);
await page.getByLabel("App password").fill(await readAppPassword());
await page.getByRole("button", { name: "Unlock console" }).click();
await page.waitForSelector("nav[aria-label]", { timeout: 10000 });

// 桌面 ActivityBar 设置按钮（aria-label = nav.settings = "Settings"）→ 居中 SettingsDialog。
// Dialog 是两层结构：root view = section 列表（Claude runtime / General），先点 General 进 detail。
await page.getByRole("button", { name: "Settings" }).click();
await page.getByRole("button", { name: "General" }).click();
const seg = page.getByRole("group", { name: "Appearance" });
await seg.waitFor({ timeout: 5000 });

const hasDark = () => page.evaluate(() => document.documentElement.classList.contains("dark"));

await seg.getByRole("button", { name: "Light" }).click();
await page.waitForFunction(() => !document.documentElement.classList.contains("dark"));
ok(!(await hasDark()), "设置点 Light → html 无 .dark");

await seg.getByRole("button", { name: "Dark" }).click();
await page.waitForFunction(() => document.documentElement.classList.contains("dark"));
ok(await hasDark(), "设置点 Dark → html 有 .dark");

// System：切系统偏好（emulateMedia colorScheme）→ class 实时跟随（matchMedia change）。
await seg.getByRole("button", { name: "System" }).click();
await page.emulateMedia({ colorScheme: "dark" });
await page.waitForFunction(() => document.documentElement.classList.contains("dark"));
ok(await hasDark(), "设置点 System + 系统切 dark → html 实时有 .dark");
await page.emulateMedia({ colorScheme: "light" });
await page.waitForFunction(() => !document.documentElement.classList.contains("dark"));
ok(!(await hasDark()), "设置点 System + 系统切 light → html 实时无 .dark");

await browser.close();
console.log(`\n${passCount} pass, ${failCount} fail`);
if (failCount > 0) process.exit(1);
