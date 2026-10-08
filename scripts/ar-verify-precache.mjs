#!/usr/bin/env node
/**
 * SW precache 静态依赖完整性机检（批 16 复审二轮 P2 配套）。
 *
 * 检查：precache manifest 里每个 js 条目，其产物内的静态 import（相对 `./x-HASH.js`
 * 形态）指向的 chunk 也必须在 precache 里——否则离线 PWA 首次加载该条目即 404 断链。
 * 抓的正是「mermaid 新图类型 chunk 按新名泄进 precache、静态 import 被排除的
 * mermaid-parser.core」这类漏网（vite.config.ts globIgnores 是枚举名单，mermaid
 * 升级高频新增图类型命名，逐版人工追补必漏）。
 *
 * 判定不依赖 mermaid 内部命名，mermaid 重构内部包也持续有效。
 *
 * 用法：bun scripts/ar-verify-precache.mjs（dev web rebuild 后跑；web/dist 不存在则 skip）
 */
import { readFile } from "node:fs/promises";

const SW_FILE = new URL("../web/dist/sw.js", import.meta.url);
const ASSETS_DIR = new URL("../web/dist/assets/", import.meta.url);

let sw;
try {
  sw = await readFile(SW_FILE, "utf8");
} catch {
  console.log("ar-verify-precache: web/dist/sw.js 不存在（未 build），skip");
  process.exit(0);
}

const precacheUrls = [...sw.matchAll(/url:"([^"]+)"/g)].map((m) => m[1]);
const precacheJs = new Set(
  precacheUrls
    .filter((u) => u.startsWith("assets/") && u.endsWith(".js"))
    .map((u) => u.slice("assets/".length)),
);

if (precacheJs.size === 0) {
  console.error("ar-verify-precache: precache manifest 未解析到 js 条目（sw.js 格式变了？）");
  process.exit(1);
}

// vite build 产物的静态 import 形态：`from"./x-HASH.js"` / `import"./x-HASH.js"`
// （rolldown minify 后引号多为双引号；正则同时吃单引号兜格式漂移）。
const STATIC_IMPORT_RE = /(?:from|import)\s*["']\.\/([^"']+\.js)["']/g;

const broken = [];
for (const name of precacheJs) {
  let content;
  try {
    content = await readFile(new URL(name, ASSETS_DIR), "utf8");
  } catch {
    broken.push(`${name}（precache 列出但文件缺失）`);
    continue;
  }
  for (const m of content.matchAll(STATIC_IMPORT_RE)) {
    const dep = m[1];
    if (!precacheJs.has(dep)) {
      broken.push(`${name} → ${dep}（静态 import 了不在 precache 的 chunk）`);
    }
  }
}

if (broken.length > 0) {
  console.error(`✗ ar-verify-precache：${broken.length} 条静态依赖断链`);
  for (const b of broken) console.error(`  ${b}`);
  console.error("  → 检查 vite.config.ts globIgnores 是否误排（或漏排导致的导入面断裂）");
  process.exit(1);
}

console.log(`✓ ar-verify-precache：precache ${precacheJs.size} 个 js 条目静态依赖完整（无断链）`);
