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
// 密码自读（config.toml → api environ），不进 agent 上下文、不打印值。
// 用法：node scripts/probe-theme-switch.mjs
import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

const ORIGIN = process.env.AR_WEB_ORIGIN ?? "http://127.0.0.1:43012";
// index.css `html { background-color: var(--bg-base) }` 的 light/dark 值（FOUC 内联同值）。
const LIGHT_BG = "rgb(238, 242, 247)"; // #eef2f7
const DARK_BG = "rgb(2, 6, 23)"; // #020617

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

async function readRawPassword() {
  if (process.env.APP_PASSWORD) return process.env.APP_PASSWORD;
  const cfg = path.join(os.homedir(), ".agents-remote", "config.toml");
  try {
    const txt = await readFile(cfg, "utf8");
    const m = txt.match(/^app_password\s*=\s*["']([^"']*)["']/m);
    if (m && m[1]) return m[1];
  } catch {}
  const pid = execSync(
    "ss -ltnp 2>/dev/null | grep ':43011' | grep -oP 'pid=\\K[0-9]+' | head -1",
    { encoding: "utf8" },
  ).trim();
  if (pid) {
    const env = await readFile(`/proc/${pid}/environ`, "utf8");
    const entry = env.split("\0").find((e) => e.startsWith("APP_PASSWORD="));
    if (entry) return entry.slice("APP_PASSWORD=".length);
  }
  throw new Error("password not found");
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

await gotoWithTheme("light", "light");
let s = await snapshot();
ok(!s.dark, "light:html 无 .dark");
ok(s.bg === LIGHT_BG, `light:html bg=${s.bg} 命中 ${LIGHT_BG}`);

await gotoWithTheme("dark", "dark");
s = await snapshot();
ok(s.dark, "dark:html 有 .dark");
ok(s.bg === DARK_BG, `dark:html bg=${s.bg} 命中 ${DARK_BG}`);

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
await page.getByLabel("App password").fill(await readRawPassword());
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
