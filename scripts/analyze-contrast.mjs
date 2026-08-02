// 聊天界面对比度扫描（静态）：提取所有「同一 className 内 bg-X(/N) + text-Y(/M)」显式配色，
// 用 web/src/styles/index.css 的 :root(light) / .dark(dark) token 实际 hex 算 WCAG 对比度，
// 列出明/暗主题下 < 3:1（UI/icon WCAG 下限）的配对。
//
// 价值：主题 token 翻转后，"深底白字"类用法易踩坑（如 bg-assistant-deep 在明主题翻成浅值，
// 配 text-white → 浅底白字对比崩）。单测验不到（需 token 明/暗双值 + WCAG 亮度公式）。
// 覆盖：按钮、badge、selector trigger、pill 等「同元素显式 bg+text」的高风险配对。
// 局限：不覆盖「父 bg + 子继承文字」（如气泡 bg + markdown 文字），需动态探针补充。
//
// 用法：node scripts/analyze-contrast.mjs [文件或目录...]（默认扫 web/src）
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const CSS_PATH = "web/src/styles/index.css";
const css = await readFile(CSS_PATH, "utf8");

// 1. 颜色 token 名集合（@theme inline 的 --color-NAME）—— text-xs/sm/lg 等非颜色会被排除。
const colorTokens = new Set();
for (const m of css.matchAll(/--color-([a-z0-9-]+)\s*:/g)) colorTokens.add(m[1]);

// 2. 解析 :root(light) 与 .dark(dark) 的 --token: #hex（oklch 等非 hex 跳过，标注）。
function parseBlock(block) {
  const map = {};
  for (const m of block.matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\b/g)) map[m[1]] = m[2];
  return map;
}
const rootMatch = css.match(/:root\s*\{([\s\S]*?)\}/);
const darkMatch = css.match(/\.dark\s*\{([\s\S]*?)\}/);
const light = rootMatch ? parseBlock(rootMatch[1]) : {};
const dark = darkMatch ? parseBlock(darkMatch[1]) : {};

// white/black 不是 @theme token，但 className 常用 text-white/bg-white —— 特殊处理。
const LITERAL = { white: "#ffffff", black: "#000000" };

function hexToRgb(h) {
  h = h.replace("#", "");
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  const n = Number.parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const lin = (c) => {
  c /= 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const contrast = (a, b) => {
  const l1 = lum(a);
  const l2 = lum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};
const mix = (fg, alpha, bg) => fg.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha)));

// 按钮/badge 通常落在 surface-raised 容器上；alpha bg 按此混合近似。
const lightContainer = hexToRgb(light["surface-raised"] || "#ffffff");
const darkContainer = hexToRgb(dark["surface-raised"] || "#141b28");

function resolve(token, alpha, theme) {
  const t = theme === "light" ? light : dark;
  const hex = token in LITERAL ? LITERAL[token] : t[token];
  if (!hex) return null;
  return alpha < 1
    ? mix(hexToRgb(hex), alpha, theme === "light" ? lightContainer : darkContainer)
    : hexToRgb(hex);
}

// 3. 扫 tsx 静态 className="..."（模板字符串/条件 className 不扫，避免笛卡尔积误报）。
async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.name.endsWith(".tsx")) yield p;
  }
}

const roots = process.argv.slice(2);
const targets = roots.length ? roots : ["web/src"];
const THRESHOLD = 3; // WCAG UI/icon 下限；文字建议 4.5，但同元素无法区分文字 vs icon，统一报 <3 为硬伤。
const findings = [];

for (const root of targets) {
  for await (const file of walk(root)) {
    const src = await readFile(file, "utf8");
    for (const cm of src.matchAll(/className\s*=\s*"([^"]+)"/g)) {
      const cls = cm[1];
      // (?:^|\s) 锚镜像 text 正则：排除 disabled:/hover:/focus: 等状态前缀 bg，避免与默认
      // text 跨态配对产生假阳性（如 disabled:bg-surface-raised + 默认 text-on-primary——
      // disabled 态两者一起切换，从不共存）。只检查默认态真实共存的 bg+text。
      const bgs = [...cls.matchAll(/(?:^|\s)bg-([a-z0-9-]+)(?:\/(\d+))?/g)]
        .filter((m) => colorTokens.has(m[1]) || m[1] in LITERAL)
        .map((m) => ({ token: m[1], alpha: m[2] ? Number(m[2]) / 100 : 1 }));
      const txts = [...cls.matchAll(/(?:^|\s)text-([a-z0-9-]+)(?:\/(\d+))?/g)]
        .filter((m) => colorTokens.has(m[1]) || m[1] in LITERAL)
        .map((m) => ({ token: m[1], alpha: m[2] ? Number(m[2]) / 100 : 1 }));
      if (!bgs.length || !txts.length) continue;
      for (const b of bgs) {
        for (const tx of txts) {
          for (const theme of ["light", "dark"]) {
            const bgRgb = resolve(b.token, b.alpha, theme);
            const txRgb = resolve(tx.token, tx.alpha, theme);
            if (!bgRgb || !txRgb) continue;
            const c = contrast(bgRgb, txRgb);
            if (c < THRESHOLD) {
              findings.push({
                file: file.replace(/^web\/src\//, ""),
                theme,
                pair: `bg-${b.token}${b.alpha < 1 ? `/${Math.round(b.alpha * 100)}` : ""} · text-${tx.token}${tx.alpha < 1 ? `/${Math.round(tx.alpha * 100)}` : ""}`,
                contrast: Number(c.toFixed(2)),
              });
            }
          }
        }
      }
    }
  }
}

findings.sort((a, b) => a.contrast - b.contrast);
const byTheme = {
  light: findings.filter((f) => f.theme === "light"),
  dark: findings.filter((f) => f.theme === "dark"),
};
for (const theme of ["light", "dark"]) {
  console.log(`\n[${theme}] < ${THRESHOLD}:1 共 ${byTheme[theme].length} 处`);
  for (const f of byTheme[theme]) console.log(`  ${f.contrast.toFixed(2)}:1  ${f.file}  ${f.pair}`);
}
console.log(`\n合计 ${findings.length} 处低对比配对（阈值 ${THRESHOLD}:1）`);
if (findings.length) process.exit(1);
