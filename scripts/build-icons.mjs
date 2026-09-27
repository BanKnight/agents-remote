#!/usr/bin/env node
/**
 * 图标管线（v1.4 spec §10.3）：从 lucide-static 白名单生成 web/src/assets/icons.ts
 * （注册表 + 静态水合器）。生成物进 git，运行时零 lucide 依赖、bundle 只含白名单图标。
 *
 * 用法：bun scripts/build-icons.mjs
 * 新增图标：把 lucide 图标名（kebab-case，icons/ 目录文件名）加入 ICONS 后重跑；
 * 升级 lucide-static 后同步 LUCIDE_VERSION（走 /check-deps，发布 ≥7 天）。
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const LUCIDE_VERSION = "1.47.0"; // 与 web/package.json 一致
const ICONS_DIR = new URL("../node_modules/lucide-static/icons", import.meta.url);
const OUT_FILE = new URL("../web/src/assets/icons.ts", import.meta.url);

/** 消费白名单：name = lucide-static icons/ 下的文件名（去 .svg）。注释 = 引入批次与消费点。 */
const ICONS = [
  "arrow-up", // composer 发送键（03/04 .send2，v1.4 批1）
  "shield-check", // 权限模式图标（.iicn.perm / .ipill.perm，03a，批1）
  "sparkles", // 模型图标（.iicn.model / .ipill.model，03a，批1）
  "brain", // 推理深度图标（.iicn.eff / .ipill.eff，03a，批1）
  "search", // 文件树收缩搜索钮（03o/10，批2 消费）
  "panel-left", // 检视面板入口钮（03ab ⑤，批2 消费）
];

const entries = [];
for (const name of ICONS) {
  const raw = await readFile(join(ICONS_DIR.pathname, `${name}.svg`), "utf8");
  const open = raw.match(/<svg[^>]*>/);
  const viewBox = open?.[0].match(/viewBox="([^"]+)"/)?.[1];
  const inner = raw.match(/<svg[^>]*>([\s\S]*?)<\/svg>/)?.[1];
  if (!viewBox || !inner) {
    console.error(`build-icons: 无法解析 ${name}.svg（viewBox 或 inner 缺失）`);
    process.exit(1);
  }
  // 压缩：每元素一行 → 单行，自闭合标签去空格（<path d="..." /> → <path d="..."/>）
  const body = inner
    .trim()
    .split("\n")
    .map((line) => line.trim().replace(/\s+\/>$/, "/>"))
    .join("");
  entries.push({ name, viewBox, body });
}

const typeUnion = entries.map((e) => `  | "${e.name}"`).join("\n");
const registry = entries
  .map(
    (e) =>
      `  "${e.name}": {\n    viewBox: "${e.viewBox}",\n    body: ${JSON.stringify(e.body)},\n  },`,
  )
  .join("\n");

const out = `/* 由 scripts/build-icons.mjs 生成 — 勿手改（改脚本内 ICONS 白名单后重跑生成）。
 * 图标源 lucide-static@${LUCIDE_VERSION}（ISC License，https://lucide.dev/license）。
 * React 消费用 <LucideIcon>（components/shell/lucide-icon.tsx）；data-icon 水合器仅供
 * 非 React 静态 DOM 场景（v1.4 spec §10.3 图标系统）。
 */

export const LUCIDE_VERSION = "${LUCIDE_VERSION}" as const;

export type LucideIconName =
${typeUnion};

/** 24 网格 stroke-2 圆头描边（Lucide 规格）；body 为 svg inner 内容。 */
export const LUCIDE_ICONS = {
${registry}
} as const satisfies Record<LucideIconName, { viewBox: string; body: string }>;

/** 静态 DOM 水合：把 root 内 <i data-icon="<name>"></i> 占位填充为图标 svg（已填充跳过）。 */
export function hydrateIcons(root: ParentNode): void {
  for (const el of root.querySelectorAll<HTMLElement>("[data-icon]")) {
    const name = el.dataset.icon as LucideIconName;
    const icon = LUCIDE_ICONS[name];
    if (!icon || el.firstElementChild) continue;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", icon.viewBox);
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = icon.body;
    el.replaceChildren(svg);
  }
}
`;

await writeFile(OUT_FILE, out, "utf8");
console.log(
  `build-icons: 生成 ${OUT_FILE.pathname}（${entries.length} 图标：${entries.map((e) => e.name).join(", ")}）`,
);
