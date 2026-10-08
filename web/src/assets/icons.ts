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
  | "panel-left"
  | "panel-right"
  | "archive"
  | "book-open"
  | "bot"
  | "check"
  | "chevron-left"
  | "chevron-right"
  | "chevron-down"
  | "clock"
  | "download"
  | "ellipsis"
  | "eye"
  | "file"
  | "folder"
  | "folder-plus"
  | "git-branch"
  | "info"
  | "layout-grid"
  | "maximize-2"
  | "message-square"
  | "minimize-2"
  | "minus"
  | "pencil"
  | "pin"
  | "plus"
  | "refresh-cw"
  | "rotate-cw"
  | "settings"
  | "shopping-bag"
  | "square-terminal"
  | "trash-2"
  | "triangle-alert"
  | "upload"
  | "x"
  | "zap"
  | "image"
  | "camera"
  | "paperclip"
  | "puzzle"
  | "expand"
  | "shrink"
  | "file-text"
  | "pause"
  | "play";

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
  "panel-right": {
    viewBox: "0 0 24 24",
    body: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18"/>',
  },
  archive: {
    viewBox: "0 0 24 24",
    body: '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
  },
  "book-open": {
    viewBox: "0 0 24 24",
    body: '<path d="M12 5v16"/><path d="M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z"/>',
  },
  bot: {
    viewBox: "0 0 24 24",
    body: '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
  },
  check: {
    viewBox: "0 0 24 24",
    body: '<path d="M20 6 9 17l-5-5"/>',
  },
  "chevron-left": {
    viewBox: "0 0 24 24",
    body: '<path d="m15 18-6-6 6-6"/>',
  },
  "chevron-right": {
    viewBox: "0 0 24 24",
    body: '<path d="m9 18 6-6-6-6"/>',
  },
  "chevron-down": {
    viewBox: "0 0 24 24",
    body: '<path d="m6 9 6 6 6-6"/>',
  },
  clock: {
    viewBox: "0 0 24 24",
    body: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  },
  download: {
    viewBox: "0 0 24 24",
    body: '<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>',
  },
  ellipsis: {
    viewBox: "0 0 24 24",
    body: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  },
  eye: {
    viewBox: "0 0 24 24",
    body: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
  },
  file: {
    viewBox: "0 0 24 24",
    body: '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/>',
  },
  folder: {
    viewBox: "0 0 24 24",
    body: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  },
  "folder-plus": {
    viewBox: "0 0 24 24",
    body: '<path d="M12 10v6"/><path d="M9 13h6"/><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  },
  "git-branch": {
    viewBox: "0 0 24 24",
    body: '<path d="M15 6a9 9 0 0 0-9 9V3"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>',
  },
  info: {
    viewBox: "0 0 24 24",
    body: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  },
  "layout-grid": {
    viewBox: "0 0 24 24",
    body: '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
  },
  "maximize-2": {
    viewBox: "0 0 24 24",
    body: '<path d="M15 3h6v6"/><path d="m21 3-7 7"/><path d="m3 21 7-7"/><path d="M9 21H3v-6"/>',
  },
  "message-square": {
    viewBox: "0 0 24 24",
    body: '<path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/>',
  },
  "minimize-2": {
    viewBox: "0 0 24 24",
    body: '<path d="m14 10 7-7"/><path d="M20 10h-6V4"/><path d="m3 21 7-7"/><path d="M4 14h6v6"/>',
  },
  minus: {
    viewBox: "0 0 24 24",
    body: '<path d="M5 12h14"/>',
  },
  pencil: {
    viewBox: "0 0 24 24",
    body: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  },
  pin: {
    viewBox: "0 0 24 24",
    body: '<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>',
  },
  plus: {
    viewBox: "0 0 24 24",
    body: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  },
  "refresh-cw": {
    viewBox: "0 0 24 24",
    body: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  },
  "rotate-cw": {
    viewBox: "0 0 24 24",
    body: '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>',
  },
  settings: {
    viewBox: "0 0 24 24",
    body: '<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/>',
  },
  "shopping-bag": {
    viewBox: "0 0 24 24",
    body: '<path d="M16 10a4 4 0 0 1-8 0"/><path d="M3.103 6.034h17.794"/><path d="M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z"/>',
  },
  "square-terminal": {
    viewBox: "0 0 24 24",
    body: '<path d="m7 11 2-2-2-2"/><path d="M11 13h4"/><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>',
  },
  "trash-2": {
    viewBox: "0 0 24 24",
    body: '<path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  },
  "triangle-alert": {
    viewBox: "0 0 24 24",
    body: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  },
  upload: {
    viewBox: "0 0 24 24",
    body: '<path d="M12 3v12"/><path d="m17 8-5-5-5 5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>',
  },
  x: {
    viewBox: "0 0 24 24",
    body: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  },
  zap: {
    viewBox: "0 0 24 24",
    body: '<path d="M15.914 4a1.5 1.5 0 00-2.474-1.561l-9 9A1.5 1.5 0 005.5 14h4.002a.5.5 0 01.471.666L8.086 20a1.5 1.5 0 002.475 1.56l9-9A1.5 1.5 0 0018.5 10h-3.997a.5.5 0 01-.472-.667z"/>',
  },
  image: {
    viewBox: "0 0 24 24",
    body: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  },
  camera: {
    viewBox: "0 0 24 24",
    body: '<path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z"/><circle cx="12" cy="13" r="3"/>',
  },
  paperclip: {
    viewBox: "0 0 24 24",
    body: '<path d="m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551"/>',
  },
  puzzle: {
    viewBox: "0 0 24 24",
    body: '<path d="M15.39 4.39a1 1 0 0 0 1.68-.474 2.5 2.5 0 1 1 3.014 3.015 1 1 0 0 0-.474 1.68l1.683 1.682a2.414 2.414 0 0 1 0 3.414L19.61 15.39a1 1 0 0 1-1.68-.474 2.5 2.5 0 1 0-3.014 3.015 1 1 0 0 1 .474 1.68l-1.683 1.682a2.414 2.414 0 0 1-3.414 0L8.61 19.61a1 1 0 0 0-1.68.474 2.5 2.5 0 1 1-3.014-3.015 1 1 0 0 0 .474-1.68l-1.683-1.682a2.414 2.414 0 0 1 0-3.414L4.39 8.61a1 1 0 0 1 1.68.474 2.5 2.5 0 1 0 3.014-3.015 1 1 0 0 1-.474-1.68l1.683-1.682a2.414 2.414 0 0 1 3.414 0z"/>',
  },
  expand: {
    viewBox: "0 0 24 24",
    body: '<path d="m15 15 6 6"/><path d="m15 9 6-6"/><path d="M21 16v5h-5"/><path d="M21 8V3h-5"/><path d="M3 16v5h5"/><path d="m3 21 6-6"/><path d="M3 8V3h5"/><path d="M9 9 3 3"/>',
  },
  shrink: {
    viewBox: "0 0 24 24",
    body: '<path d="m15 15 6 6m-6-6v4.8m0-4.8h4.8"/><path d="M9 19.8V15m0 0H4.2M9 15l-6 6"/><path d="M15 4.2V9m0 0h4.8M15 9l6-6"/><path d="M9 4.2V9m0 0H4.2M9 9 3 3"/>',
  },
  "file-text": {
    viewBox: "0 0 24 24",
    body: '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  },
  pause: {
    viewBox: "0 0 24 24",
    body: '<rect x="14" y="3" width="5" height="18" rx="1"/><rect x="5" y="3" width="5" height="18" rx="1"/>',
  },
  play: {
    viewBox: "0 0 24 24",
    body: '<path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"/>',
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
