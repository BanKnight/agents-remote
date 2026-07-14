// CSS 落盘前置验证（frontend-notes §2 第 6-7 条 / memory `build-watch-css-not-flushed`）。
//
// 背景：ar-dev-web.sh 的 `vite build --watch`（rolldown）增量 build 不可靠——偶发只写 JS、
// 漏写 CSS，或把不存在的 .css 请求 SPA fallback 成 index.html（Content-Type: text/html）。
// 现象是排版全乱但 console 无 JS 报错。**mtime 新 / 文件存在 ≠ CSS 内容对**——必须查服务层
// content-type 与正文。
//
// 本模块是 web DOM 探针的**强制前置断言**：DOM 结构断言（文本 / role / aria-label）对 CSS
// 完全盲，CSS 没落盘时探针照样全绿（曾出现「19/19 绿但页面排版全乱」的假通过）。所以跑 DOM
// 断言前必须先过本验证，不过则探针整体 fail、不往下跑。
//
// 用法 1（探针内，推荐）：
//   import { verifyCssFlushed } from "./ar-verify-css.mjs";
//   const r = await verifyCssFlushed({
//     origin: "http://localhost:43012",
//     expectClasses: ["gap-0", "divide-neutral-line"], // 本次改动相关 utility，可选
//   });
//   if (!r.pass) { console.error(r.details.join("\n")); process.exit(1); }
//
// 用法 2（独立跑）：
//   node scripts/ar-verify-css.mjs [utility ...]
//   bun scripts/ar-verify-css.mjs bg-primary text-on-surface-muted

import { fileURLToPath } from "node:url";

const DEFAULT_ORIGIN = "http://localhost:43012";

// 项目 shell 根基 utility，任何页面都该生成——缺任一即说明 CSS 整体没落盘。
const CORE_UTILITIES = ["bg-surface", "text-on-surface"];

// Tailwind 选择器转义：utility 名作 CSS 选择器时 / : . [ ] 等需转义。
function escapeForSelector(cls) {
  return cls.replace(/[/:.()[\]]/g, (c) => `\\${c}`);
}

/**
 * 验证 web 的 CSS 已正确落盘。返回 { pass, details }。
 * 三道闸（任一不过即 pass=false）：
 *   1. HTML 注入了 <link rel=stylesheet>（拦「CSS 完全没引用」）；
 *   2. 每个 CSS 响应 content-type 含 text/css（拦 preview 用 HTML 冒充）；
 *   3. CORE_UTILITIES + expectClasses 作为选择器出现在 CSS 正文（拦「文件在但内容缺 utility」）。
 */
export async function verifyCssFlushed({ origin = DEFAULT_ORIGIN, expectClasses = [] } = {}) {
  const details = [];
  const fail = (msg) => ({ pass: false, details: [...details, msg] });

  // 1. 拉 HTML，提取 <link rel="stylesheet"> href（rel 与 href 先后顺序不固定，分两步）。
  let htmlRes;
  try {
    htmlRes = await fetch(`${origin}/`);
  } catch (e) {
    return fail(`无法连接 ${origin}：${e.message}（web preview 在跑吗？）`);
  }
  if (!htmlRes.ok) return fail(`HTML 拉取失败 HTTP ${htmlRes.status}`);
  const html = await htmlRes.text();
  const cssHrefs = [...html.matchAll(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi)]
    .map((m) => {
      const hrefMatch = m[0].match(/href=["']([^"']+)["']/i);
      return hrefMatch ? hrefMatch[1] : null;
    })
    .filter(Boolean)
    .map((href) =>
      href.startsWith("http") ? href : `${origin}${href.startsWith("/") ? "" : "/"}${href}`,
    );
  if (cssHrefs.length === 0)
    return fail("HTML 无 <link rel=stylesheet>——CSS 完全没注入，排版必全乱");
  details.push(`CSS link 数: ${cssHrefs.length}`);

  // 2. 拉 CSS，检查 content-type + 累积正文。
  let cssText = "";
  for (const href of cssHrefs) {
    const res = await fetch(href);
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("text/css"))
      return fail(
        `${href}\n  content-type="${ct}"（应为 text/css）——preview 用 HTML 冒充 CSS 的经典症状，CSS 没落盘`,
      );
    cssText += `\n${await res.text()}`;
  }
  if (cssText.length < 1000)
    return fail(`CSS 正文过短（${cssText.length} 字节），疑似空壳——clean build 复核`);
  details.push(`CSS 总字节: ${cssText.length}`);

  // 3. grep utility 落盘（核心集 + 调用方指定）。
  const check = [...new Set([...CORE_UTILITIES, ...expectClasses])];
  const missing = [];
  for (const cls of check) {
    const sel = `.${escapeForSelector(cls)}`;
    if (!cssText.includes(sel)) missing.push(cls);
  }
  if (missing.length)
    return fail(
      `CSS 正文缺这些 utility 选择器（文件在但内容不对）：${missing.join(", ")}\n  → touch web/src/main.tsx 触发完整 rebuild 后重试`,
    );
  details.push(`utility 落盘检查通过: ${check.join(", ")}`);
  return { pass: true, details };
}

// 独立运行入口。
const isMain = fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const r = await verifyCssFlushed({ expectClasses: process.argv.slice(2) });
  console.log(r.pass ? "✓ CSS 落盘 + content-type 正常" : "✗ CSS 落盘验证失败");
  r.details.forEach((d) => console.log(`  ${d}`));
  process.exit(r.pass ? 0 : 1);
}
