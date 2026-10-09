import { useEffect } from "react";

import { observeKeyboardInset } from "./keyboard-inset";

/**
 * iOS Safari 键盘避让：驱动 claude composer 浮动区的 `--composer-keyboard-offset`
 * CSS 变量（内层 translateY 上抬），让 composer 在键盘弹起时就已浮在键盘上方 →
 * iOS 判定焦点 input 已可见 → 不触发 scroll-to-reveal（连 overflow:hidden 都绕不过的
 * 那个 layout-viewport 强制滚动）。这是 iOS 上唯一可靠的键盘避让路径：dvh/svh、
 * interactive-widget meta、VirtualKeyboard API 在 iOS 全不触发（见
 * docs/research/claude-ios-keyboard-viewport.md）。
 *
 * 监听生命周期（resize + scroll 双事件、rAF 同帧、iOS 26 关闭强制归零 gate、
 * pointer: coarse guard）已提取为 keyboard-inset.ts 单源（批 17），编辑态面板避让
 * （useKeyboardInsetGlobal → --kb-offset/--kb-active）与本 hook 共用同一观察器；
 * 本 hook 只保留 composer 专属的消费：变量名 --composer-keyboard-offset + 卸载重置。
 *
 * 第二个 effect：克隆 ShellLayout 的 ResizeObserver→CSS 变量→inset 模式，测浮动区总高
 * 写 `--composer-float-inset`，消息列表底部 spacer 消费，保证滚动到底时最后一条消息
 * 不被悬浮 composer 遮挡。
 *
 * 只负责键盘避让（写 CSS 变量），不暴露键盘可见性 state——曾用 visualViewport 派生
 * keyboardVisible 驱动外部工具栏显隐，iOS 26 键盘动画瞬态误判导致工具栏/Send 不稳定，
 * 已废弃；工具/按钮收回卡片内部，不再依赖键盘可见性。
 */
export function useComposerKeyboardAvoidance(): void {
  useEffect(() => {
    const root = document.documentElement;
    const dispose = observeKeyboardInset(({ offsetPx }) => {
      root.style.setProperty("--composer-keyboard-offset", `${offsetPx}px`);
    });
    return () => {
      dispose();
      root.style.setProperty("--composer-keyboard-offset", "0px");
    };
  }, []);

  useEffect(() => {
    const float = document.querySelector<HTMLElement>("[data-composer-float]");
    if (!float) return;

    const update = () => {
      // border-box 高度：含浮动区 pb(safe-area + gap)，不含 transform 位移。
      // 键盘弹起时浮动区 translateY 上移让出底部空间，inset 用静态高度即可（不需随键盘增大）。
      const h = float.getBoundingClientRect().height;
      document.documentElement.style.setProperty("--composer-float-inset", `${h}px`);
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(float);
    return () => ro.disconnect();
  }, []);
}
