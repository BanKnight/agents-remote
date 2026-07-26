// 「移动 composer 模式」的桌面/移动分界断点（px），与项目主布局的桌面断点（lg=1024）对齐：
// workbench 桌面布局同用 min-width:1024px（见 web/src/routes/workbench-model.ts）。
export const COMPOSER_DESKTOP_MIN_WIDTH_PX = 1024;

// 是否走「移动 composer 模式」（Enter 换行 + 卡片内显式 Send）。
// 判定 = 触屏 **且** 窄屏。只看 `pointer: coarse` 不够：远程桌面 / 某些特殊环境会把
// 非触屏的宽屏台式机误报成 coarse=true，导致 Enter 被当成移动软键盘换行、并冒出 Send 按钮。
// 叠加「窄屏」后，宽屏台式机（无论 coarse 是否误报）恒为 false → 走桌面 Enter=发送、无 Send；
// 真手机（触屏 + 窄屏）为 true → 保持 Enter 换行 + 显式 Send，移动端不回归。
export function isMobileComposerMode(opts: { coarse: boolean; wide: boolean }): boolean {
  return opts.coarse && !opts.wide;
}

// 桌面端（非触屏）Enter 键的换行/发送决策。触屏路径由 assistant-ui 的
// unstable_insertNewlineOnTouchEnter 处理，不经过这里。
// 规则：Shift+Enter 换行（通用）；Mac 上 Cmd+Enter 也换行；其余 Enter 发送。
export type DesktopEnterAction = "send" | "newline";

export function decideDesktopEnterAction(opts: {
  shiftKey: boolean;
  metaKey: boolean;
  isMac: boolean;
}): DesktopEnterAction {
  if (opts.shiftKey) return "newline";
  if (opts.isMac && opts.metaKey) return "newline";
  return "send";
}
