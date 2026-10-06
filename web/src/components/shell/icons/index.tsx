import anthropic from "./anthropic.svg?raw";
import openai from "./openai.svg?raw";
import { type LucideIconName, LUCIDE_ICONS } from "../../../assets/icons";

/**
 * 手绘 SF 名 → Lucide 名映射（2026-09-29 真机反馈②「图标理应都采用 lucide 的标准和规范」：
 * 存量 39 个手绘 20 网格 SVG 全量换代，形状统一 Lucide 24 网格 stroke-2 圆头规格，
 * 唯一源头 = build-icons.mjs 管线生成物）。调用点保持 SF 名契约零改动；
 * anthropic/openai 为 provider 品牌 fill 型 logo，Lucide 无对应物（政策不加品牌件），保留手绘。
 * menu / skills-nav 手绘件零消费，随换代删除未入映射。
 */
const TO_LUCIDE = {
  "agent-nav": "bot",
  archive: "archive",
  bag: "shopping-bag",
  bolt: "zap",
  book: "book-open",
  chat: "message-square",
  check: "check",
  "chevron-left": "chevron-left", // 10m2 推入态返回（mac-files-global-preview mback）
  clock: "clock",
  close: "x",
  download: "download",
  edit: "pencil",
  ellipsis: "ellipsis",
  expand: "expand", // 终端「展开输入」钮（03f .xbtn，v1.5 批 7 spec §4.7；与 shrink 配对）
  eye: "eye",
  file: "file",
  "files-nav": "file", // 与 file 手绘本就同形（折角文档）
  "folder-plus": "folder-plus",
  "git-nav": "git-branch",
  info: "info",
  magnifyingglass: "search",
  maximize: "maximize-2",
  minus: "minus",
  "pages-nav": "layout-grid",
  pin: "pin",
  plus: "plus",
  project: "folder",
  puzzlepiece: "puzzle", // 插件（底部 nav + 桌面 footnav，v1.5 批 7 spec §3.5/§6.2）
  refresh: "refresh-cw",
  restore: "minimize-2", // 与 maximize-2 配对（最大化/还原）
  rotate: "rotate-cw",
  settings: "settings",
  shrink: "shrink", // 终端「收回输入」钮（展开态，与 expand 配对，v1.5 批 7 spec §4.7）
  sparkles: "sparkles",
  split: "panel-right",
  terminal: "square-terminal",
  trash: "trash-2",
  upload: "upload",
  "warning-triangle": "triangle-alert",
} as const satisfies Record<string, LucideIconName>;

/** 品牌 fill 型 logo（非 Lucide 描边规格，走手绘 raw 注入路径）。 */
const BRAND_SVG: Record<"anthropic" | "openai", string> = { anthropic, openai };

export type ShellIconName = keyof typeof TO_LUCIDE | keyof typeof BRAND_SVG;

export function ShellIcon({
  className = "size-4",
  name,
}: {
  className?: string;
  name: ShellIconName;
}) {
  // 给注入的 svg 标 size-full：class 含 "size-" 才能绕过 shadcn Button base 的
  // `[&_svg:not([class*='size-'])]:size-4`——否则 Button 内的 ShellIcon svg 被强制 16px，
  // 调用方传的尺寸失效（IconMarker sm 的 h-3.5=14px 被覆盖成 16）。svg size-full 跟随
  // 外层 span（span 由 className 定尺寸），全栈 Button>ShellIcon 的 icon 尺寸由此可靠。
  const lucideName = TO_LUCIDE[name as keyof typeof TO_LUCIDE];
  const html = lucideName
    ? `<svg viewBox="${LUCIDE_ICONS[lucideName].viewBox}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="size-full">${LUCIDE_ICONS[lucideName].body}</svg>`
    : BRAND_SVG[name as keyof typeof BRAND_SVG].replace(/^<svg\b/, `<svg class="size-full"`);
  return (
    <span
      className={"inline-flex items-center justify-center " + className}
      dangerouslySetInnerHTML={{ __html: html }}
      aria-hidden="true"
    />
  );
}
