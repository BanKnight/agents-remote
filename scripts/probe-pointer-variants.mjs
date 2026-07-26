// 触屏 vs 响应式正交化验证（frontend-notes §7 / DESIGN.md「触屏触摸目标 44px」）。
//
// 重要发现:Chromium 的 CDP Emulation.setEmulatedMedia **不支持模拟 (hover) 与 (pointer)
// media feature**——实测 setEmulatedMedia({features:[{name:"hover",value:"none"}]}) 后
// window.matchMedia("(hover: hover)").matches 仍为 true。Chrome DevTools "Rendering" 面板
// 同样只暴露 color-scheme / reduced-motion / contrast / forced-colors,无 hover/pointer;
// Playwright 1.60 的 emulateMedia 也仅支持这五项。故 iPad 横屏（hover:none + pointer:coarse）
// 无法在自动化浏览器里精确复现。
//
// 本 probe 采用混合策略覆盖:
//  Part 1（运行时,桌面鼠标）:chromium 默认 hover:hover + pointer:fine,验证 hover-capable
//   variant **匹配时**行为正确（A 组 opacity 0→hover 1;B 组点击区 28px 紧凑）。
//  Part 2（静态,CSS 文件分析）:确认 hover-capable utility 落在 `@media (hover: hover) and
//   (pointer: fine)` 块内、touch utility 落在 `@media (hover: none) and (pointer: coarse)` 块内。
//   因 media query 不匹配则规则不应用（CSS 规范保证）,故触屏（hover:none + pointer:coarse）
//   必然不触发 hover-capable（opacity 保持默认常显→反模式修复）、必然触发 touch（点击区放大）。
//
// 真机（iPad 横屏 / 触屏笔记本）最终验证交用户——这是自动化覆盖不到的最后一公里。
//
//   node scripts/probe-pointer-variants.mjs

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const ORIGIN = process.env.AR_WEB_ORIGIN ?? "http://localhost:43012";
const DIST_CSS_DIR = "web/dist/assets";

// --- Part 1:运行时（桌面鼠标 hover:hover + pointer:fine 是 chromium 默认）---
const html = await (await fetch(`${ORIGIN}/`)).text();
const cssMatch = html.match(/href="(\/assets\/index-[^"]+\.css)"/);
if (!cssMatch) {
  console.error("✗ 未在 index.html 找到主 CSS link —— web 是否在跑 / 是否已 build?");
  process.exit(1);
}
const cssHref = `${ORIGIN}${cssMatch[1]}`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.setContent(`
  <!DOCTYPE html><html><head>
    <link id="css" rel="stylesheet" href="${cssHref}" onload="window.__cssLoaded=true">
  </head><body>
    <!-- A 组:hover 显隐（默认 opacity-100 常显 + hover-capable 才显隐） -->
    <div id="card" class="group">
      <button id="a-btn" class="opacity-100 hover-capable:opacity-0 hover-capable:group-hover:opacity-100">×</button>
    </div>
    <!-- B 组:点击区（默认 h-7 w-7 紧凑 + touch 才放大） -->
    <button id="b-btn" class="inline-flex h-7 w-7 touch:h-10 touch:w-10">⋯</button>
  </body></html>
`);
await page.waitForFunction(() => window.__cssLoaded, { timeout: 10000 });
const mq = await page.evaluate(() => ({
  hoverHover: window.matchMedia("(hover: hover)").matches,
  pointerFine: window.matchMedia("(pointer: fine)").matches,
}));
const aBefore = await page.locator("#a-btn").evaluate((el) => getComputedStyle(el).opacity);
await page.locator("#card").hover();
const aAfter = await page.locator("#a-btn").evaluate((el) => getComputedStyle(el).opacity);
const bBox = await page.locator("#b-btn").evaluate((el) => {
  const r = el.getBoundingClientRect();
  return { w: Math.round(r.width), h: Math.round(r.height) };
});
await browser.close();

// --- Part 2:静态（CSS 文件 media query 包裹确认）---
const files = await readdir(DIST_CSS_DIR);
const cssFile = files.find((f) => /^index-.*\.css$/.test(f));
if (!cssFile) {
  console.error("✗ web/dist/assets 下未找到 index-*.css —— 是否已 build?");
  process.exit(1);
}
const css = await readFile(path.join(DIST_CSS_DIR, cssFile), "utf8");

// 提取所有顶层 @media 块的 query + body（平衡花括号找闭合）。
function extractMediaBlocks(text) {
  const blocks = [];
  const re = /@media\s+([^{}]+)\{/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const query = m[1].trim();
    const start = m.index + m[0].length;
    let depth = 1;
    let i = start;
    while (i < text.length && depth > 0) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}") depth--;
      i++;
    }
    blocks.push({ query, body: text.slice(start, i - 1) });
    re.lastIndex = i;
  }
  return blocks;
}
const blocks = extractMediaBlocks(css);
// minified CSS 冒号后通常无空格(如 (hover:hover)),去空格后比对以容错。
const normQuery = (q) => q.replace(/\s+/g, "");
const hoverBlocks = blocks.filter((b) => {
  const q = normQuery(b.query);
  return q.includes("(hover:hover)") && q.includes("(pointer:fine)");
});
const touchBlocks = blocks.filter((b) => {
  const q = normQuery(b.query);
  return q.includes("(hover:none)") && q.includes("(pointer:coarse)");
});
const hoverInBlock = hoverBlocks.some((b) => b.body.includes("hover-capable"));
const touchInBlock = touchBlocks.some((b) => b.body.includes("touch") && b.body.includes(":h-"));

// --- 断言 ---
const checks = [];
const ok = (cond, msg) => checks.push({ cond, msg });

ok(
  mq.hoverHover && mq.pointerFine,
  `桌面环境即 hover-capable 匹配态 ((hover:hover)=${mq.hoverHover} (pointer:fine)=${mq.pointerFine})`,
);
ok(aBefore === "0", `Part1 桌面 ✕ hover 前隐藏 (opacity=${aBefore},期望 0)`);
ok(aAfter === "1", `Part1 桌面 ✕ hover 后显出 (opacity=${aAfter},期望 1)`);
ok(
  bBox.w === 28 && bBox.h === 28,
  `Part1 桌面 ⋯ 点击区 ${bBox.w}×${bBox.h}px (期望 28,鼠标不放大)`,
);
ok(
  hoverInBlock,
  `Part2 hover-capable utility 在 @media (hover:hover)+(pointer:fine) 块内 → 触屏不匹配 → opacity-0 不应用（反模式修复:不再永久不可见）`,
);
ok(
  touchInBlock,
  `Part2 touch utility 在 @media (hover:none)+(pointer:coarse) 块内 → 触屏匹配 → 点击区放大`,
);

console.log("=== Part 1:运行时（桌面鼠标 hover:hover + pointer:fine）===");
console.log(`  media: (hover:hover)=${mq.hoverHover} (pointer:fine)=${mq.pointerFine}`);
console.log(`  A 组 ✕ opacity: hover 前=${aBefore} → hover 后=${aAfter}`);
console.log(`  B 组 ⋯ 点击区: ${bBox.w}×${bBox.h}px`);
console.log(`\n=== Part 2:静态（CSS media query 包裹确认）===`);
console.log(`  CSS 总 @media 块数=${blocks.length}`);
console.log(
  `  @media (hover:hover)+(pointer:fine) 块数=${hoverBlocks.length},含 hover-capable utility=${hoverInBlock}`,
);
console.log(
  `  @media (hover:none)+(pointer:coarse) 块数=${touchBlocks.length},含 touch utility=${touchInBlock}`,
);
console.log(`\n断言:`);
for (const c of checks) console.log(`  ${c.cond ? "✓" : "✗"} ${c.msg}`);
const failed = checks.filter((c) => !c.cond);
console.log(
  `\n${failed.length === 0 ? "✓ 全部通过（触屏真机最终验证交用户）" : `✗ ${failed.length} 项失败`}`,
);
process.exitCode = failed.length === 0 ? 0 : 1;
