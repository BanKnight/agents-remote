import { useState } from "react";

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

// 在 textarea 光标处插入换行（桌面 Cmd+Enter 换行用）。execCommand insertText 触发原生
// input 事件 → 库 onChange → setText，浏览器自动维护光标与撤销栈（受控组件下手动 setText
// 复位光标不可靠）。composer.setText 仅作 execCommand 不可用时的回退。
export function insertNewlineAtCursor(
  ta: HTMLTextAreaElement,
  setText: (text: string) => void,
): void {
  ta.focus();
  if (document.execCommand("insertText", false, "\n")) return;
  const start = ta.selectionStart ?? ta.value.length;
  const end = ta.selectionEnd ?? start;
  setText(`${ta.value.slice(0, start)}\n${ta.value.slice(end)}`);
  requestAnimationFrame(() => {
    ta.selectionStart = ta.selectionEnd = start + 1;
  });
}

/**
 * 移动 composer 模式 + 平台判定的 mount 时一次性快照（三 adapter composer 单源，此前
 * ClaudeSessionDetailRoute/ChatSessionDetailRoute(Pi)/AcpSessionDetailRoute 各自 useState
 * 四连逐字重复）。isMobileComposer 驱动「Enter 换行 + 卡片内显式 Send」；isMac 供桌面
 * Enter 键分支（Cmd+Enter 换行）。
 */
export function useComposerEnterPolicy(): { isMac: boolean; isMobileComposer: boolean } {
  const [isMobileComposer] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return isMobileComposerMode({
      coarse: window.matchMedia("(pointer: coarse)").matches,
      wide: window.matchMedia(`(min-width: ${COMPOSER_DESKTOP_MIN_WIDTH_PX}px)`).matches,
    });
  });
  // 平台判定（桌面 Enter 键分支用）：Mac 上 Cmd+Enter 换行、其余平台无此修饰键语义。mount 时一次性判定。
  const [isMac] = useState(
    () =>
      typeof navigator !== "undefined" &&
      /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent),
  );
  return { isMac, isMobileComposer };
}
