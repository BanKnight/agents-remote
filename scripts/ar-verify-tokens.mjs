// 散落 token 机检（redesign-v2.md §附录 / verification.md「散落 token 机检」）。
//
// 背景：UI v2（docs/design/redesign-v2.md）起 tokens.json 是唯一数值源，UI 样式只能走
// 语义 token（v2 语义 var / @theme inline 物化的 utility）。散写裸 HEX 或裸 Tailwind 色阶
// （bg-cyan-300、text-slate-400）= 未被设计系统管理的色相，会绕过双主题换底——v1 时代
// 累计 ~250 处的教训（frontend-notes §2）。
//
// 检查两 类违例：
//   1. 散落 HEX：源码里的 #RGB/#RRGGBB(AA)（组件类名、样式字符串、svg fill 等）；
//   2. 裸 Tailwind 色阶：{bg,text,border,...}-{色名}-{档位}（含 /透明度 后缀）。
//
// 白名单：web/src/styles/（token 物化层，HEX 的唯一合法驻地）、*.test.*（测试断言
// getComputedStyle 对比 token HEX 是合法用途）。
//
// 模式（默认 report，M1 换底完成后收紧）：
//   bun scripts/ar-verify-tokens.mjs           # report：打印违例，exit 0（M0-M1 过渡期）
//   bun scripts/ar-verify-tokens.mjs --strict  # strict：有违例 exit 1（硬闸，M1 后启用）

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const WEB_SRC = join(process.cwd(), "web", "src");
const WHITELIST_DIRS = [join(WEB_SRC, "styles")];

// #RRGGBB / #RRGGBBAA / #RGB / #RGBA（\b 防止吃进更长的标识符）。
const HEX_RE = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{3,4}\b/g;

// 裸 Tailwind 色阶 utility（色名-档位，透明度后缀一并算）。white/black/transparent/current 不拦
// （中性无色相，且 legacy 代码常见，收紧时机由 M1 换底统一裁决）。色名后必须跟档位或边界
// （负向前瞻 (?![\w-])）：避免把 v1 语义 utility（如 border-neutral-line）误判成裸色阶。
const SCALE_RE =
  /\b(?:bg|text|border|ring|fill|stroke|from|to|via|outline|shadow|decoration|divide|accent|caret|placeholder)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(?:-\d{2,3})?(?:\/\d{1,3})?(?![\w-])/g;

function* walkFiles(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) yield* walkFiles(p);
    else if (/\.(ts|tsx|css)$/.test(name) && !/\.test\./.test(name)) yield p;
  }
}

function isWhitelisted(file) {
  return WHITELIST_DIRS.some((d) => file.startsWith(d));
}

function scan() {
  const violations = [];
  let scanned = 0;
  for (const file of walkFiles(WEB_SRC)) {
    scanned++;
    if (isWhitelisted(file)) continue;
    const rel = relative(process.cwd(), file);
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      // 注释行豁免（文档注释引用 HEX 不是样式违例；JSX {/* */} 与块注释 * 续行同豁免）。
      const t = line.trim();
      if (t.startsWith("//") || t.startsWith("/*") || t.startsWith("*") || t.startsWith("{/*"))
        return;
      for (const m of line.matchAll(HEX_RE))
        violations.push({
          file: rel,
          line: i + 1,
          kind: "HEX",
          text: m[0],
          snippet: line.trim().slice(0, 100),
        });
      for (const m of line.matchAll(SCALE_RE))
        violations.push({
          file: rel,
          line: i + 1,
          kind: "色阶",
          text: m[0],
          snippet: line.trim().slice(0, 100),
        });
    });
  }
  return { scanned, violations };
}

const strict = process.argv.includes("--strict");
const { scanned, violations } = scan();
const hexCount = violations.filter((v) => v.kind === "HEX").length;
const scaleCount = violations.length - hexCount;

console.log(
  `${strict && violations.length ? "✗" : "✓"} 散落 token 机检（mode: ${strict ? "strict" : "report"}）`,
);
console.log(`  扫描: web/src ${scanned} 文件（白名单: web/src/styles/、*.test.*）`);
console.log(`  违例: HEX ${hexCount} 处 / 裸色阶 ${scaleCount} 处`);
const byFile = new Map();
for (const v of violations) {
  if (!byFile.has(v.file)) byFile.set(v.file, []);
  byFile.get(v.file).push(v);
}
for (const [file, list] of byFile) {
  console.log(`  ${file} (${list.length})`);
  for (const v of list) console.log(`    :${v.line} [${v.kind}] ${v.text} — ${v.snippet}`);
}
if (violations.length && !strict) {
  console.log("  ⚠️ report 模式不计 fail；M1 换底完成后用 --strict 收紧为硬闸。");
  console.log(
    "  → 修复方向：改用 tokens.json 语义 var / @theme inline utility（见 redesign-v2.md 附录映射表）。",
  );
}
process.exit(strict && violations.length ? 1 : 0);
