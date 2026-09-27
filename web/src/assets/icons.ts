/* 由 scripts/build-icons.mjs 生成 — 勿手改（改脚本内 ICONS 白名单后重跑生成）。
 * 图标源 lucide-static@1.47.0（ISC License，https://lucide.dev/license）。
 * React 消费用 <LucideIcon>（components/shell/lucide-icon.tsx）；data-icon 水合器仅供
 * 非 React 静态 DOM 场景（v1.4 spec §10.3 图标系统）。
 */

export const LUCIDE_VERSION = "1.47.0" as const;

export type LucideIconName =
  | "arrow-up"
  | "shield-check"
  | "sparkles"
  | "brain"
  | "search"
  | "panel-left";

/** 24 网格 stroke-2 圆头描边（Lucide 规格）；body 为 svg inner 内容。 */
export const LUCIDE_ICONS = {
  "arrow-up": {
    viewBox: "0 0 24 24",
    body: '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
  },
  "shield-check": {
    viewBox: "0 0 24 24",
    body: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  },
  sparkles: {
    viewBox: "0 0 24 24",
    body: '<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/><path d="M20 2v4"/><path d="M22 4h-4"/><circle cx="4" cy="20" r="2"/>',
  },
  brain: {
    viewBox: "0 0 24 24",
    body: '<path d="M12 18V5"/><path d="M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4"/><path d="M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5"/><path d="M17.997 5.125a4 4 0 0 1 2.526 5.77"/><path d="M18 18a4 4 0 0 0 2-7.464"/><path d="M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517"/><path d="M6 18a4 4 0 0 1-2-7.464"/><path d="M6.003 5.125a4 4 0 0 0-2.526 5.77"/>',
  },
  search: {
    viewBox: "0 0 24 24",
    body: '<path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>',
  },
  "panel-left": {
    viewBox: "0 0 24 24",
    body: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/>',
  },
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
