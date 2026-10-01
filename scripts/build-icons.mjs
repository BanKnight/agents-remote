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
  "sparkles", // 模型图标（.iicn.model / .ipill.model，03a，批1）+ ShellIcon sparkles（批4 反馈②）
  "brain", // 推理深度图标（.iicn.eff / .ipill.eff，03a，批1）
  "search", // 文件树收缩搜索钮（03o/10，批2 消费）+ ShellIcon magnifyingglass（批4 反馈②）
  "panel-left", // 检视面板入口钮（03ab ⑤，批2 消费）
  "panel-right", // ShellIcon split（分屏按钮 rect+右竖线，批4 反馈②）+ ShellIcon split（批4 反馈②）
  // ── 手绘 SVG 全量换代（2026-09-29 真机反馈②「图标理应都采用 lucide 标准」），
  //    SF 名 → 此名的映射在 icons/index.tsx TO_LUCIDE；品牌件 anthropic/openai 保留手绘 ──
  "archive", // ShellIcon archive（chat-overview 归档）
  "book-open", // ShellIcon book（wiki 标签；打开双页书）
  "bot", // ShellIcon agent-nav（agent 导航/行标）
  "check", // ShellIcon check
  "chevron-left", // RailButton 左栏唤出（M13c reviewer D-P2-4：手写 16 网格退役）
  "chevron-right", // RailButton 右栏唤出（M13c，同上）
  "clock", // ShellIcon clock
  "download", // ShellIcon download
  "ellipsis", // ShellIcon ellipsis（行菜单）
  "eye", // ShellIcon eye（预览 toggle）
  "file", // ShellIcon file / files-nav（文件；两键手绘本就同形）
  "folder", // ShellIcon project（项目 = 文件夹）
  "folder-plus", // ShellIcon folder-plus（新建文件夹）
  "git-branch", // ShellIcon git-nav（git 标签/导航）
  "info", // ShellIcon info
  "layout-grid", // ShellIcon pages-nav（页面插件 tab，2x2 方格）
  "maximize-2", // ShellIcon maximize（最大化，双角向外）
  "message-square", // ShellIcon chat（chat 面板行标）
  "minimize-2", // ShellIcon restore（还原，双角向内，与 maximize-2 配对）
  "minus", // ShellIcon minus
  "pencil", // ShellIcon edit（重命名/编辑）
  "pin", // ShellIcon pin（固定）
  "plus", // ShellIcon plus
  "refresh-cw", // ShellIcon refresh（刷新）
  "rotate-cw", // ShellIcon rotate（重开；手绘本是 24 网格 stroke1.5 异类，统一 2）
  "settings", // ShellIcon settings（设置齿轮）
  "shopping-bag", // ShellIcon bag（市场安装 chip）
  "square-terminal", // ShellIcon terminal（rect+>_）
  "trash-2", // ShellIcon trash（删除）
  "triangle-alert", // ShellIcon warning-triangle（警示）
  "upload", // ShellIcon upload
  "x", // ShellIcon close（关闭）
  "zap", // ShellIcon bolt（执行/闪电）
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
