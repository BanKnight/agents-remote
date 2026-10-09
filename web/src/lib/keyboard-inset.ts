/**
 * 键盘 inset 观察器（批 17）：iOS 键盘是 overlay——只缩 visual viewport、不动 layout
 * viewport（WebKit 141832 intentional），CSS/meta 全线无法让 iOS 布局让位（证伪表见
 * docs/research/claude-ios-keyboard-viewport.md），JS visualViewport 是 iOS 唯一可靠路径。
 *
 * 本文件是 composer 键盘避让（useComposerKeyboardAvoidance，2026-09 批 8 落地）与编辑态
 * 面板避让（useKeyboardInsetGlobal）共享的单点监听器；公式语义逐字保持原 hook：
 * - resize + scroll 双监听（键盘动画收尾 scroll 仍 fire，保证 offset 准确）+ window
 *   resize（横竖屏切换重算）；
 * - requestAnimationFrame 与浏览器布局同帧（兜 iOS 关键盘一帧 visualViewport 不一致，
 *   无魔数超时）；
 * - visible = vv.height < innerHeight 判定 + 关闭时强制归零，绕 iOS 26 layout scroll
 *   不复位的残留；
 * - 桌面硬件键盘不改变 visualViewport，pointer: coarse 显式 guard 拦截极少数 viewport
 *   抖动误触发；SSR / 无 visualViewport 环境 no-op。
 *
 * 不要用 window.scrollTo 对抗 visual-viewport pan：body 被 pin 时 document scroll 本就
 * 是 0，碰不到 pan 轴，逐帧对抗只抖动（mobile-keyboard.ts 时代失败的原因）。
 */

export type KeyboardInset = { offsetPx: number; visible: boolean };

/**
 * 键盘吃掉的视口高度（纯函数，单测覆盖）：layout viewport 高 − visual viewport 高 −
 * 其顶部偏移。visible=false（键盘不在场）强制 0——绕 iOS 26 关键盘后 offset 残留。
 */
export function computeKeyboardInset(
  vvHeight: number,
  vvOffsetTop: number,
  innerHeight: number,
): KeyboardInset {
  const visible = vvHeight < innerHeight;
  return {
    visible,
    offsetPx: visible ? Math.max(0, innerHeight - vvHeight - vvOffsetTop) : 0,
  };
}

/**
 * 监听键盘 inset 变化，回调携带 { offsetPx, visible }。返回清理函数（桌面 / 无
 * visualViewport 环境返回 no-op）。回调首调同步执行（与浏览器布局对齐一次基线）。
 */
export function observeKeyboardInset(apply: (inset: KeyboardInset) => void): () => void {
  const vv = window.visualViewport;
  if (!vv) return () => {};
  if (!window.matchMedia("(pointer: coarse)").matches) return () => {};

  const measure = () => computeKeyboardInset(vv.height, vv.offsetTop, window.innerHeight);
  // rAF id 记录：dispose 取消已入队回调（rAF 不可撤销注册只能 cancel）——否则 cleanup
  // （调用方归零 CSS 变量）后仍残留一次写入（design review 批 17 P2；原 composer hook 同病，
  // 单源化时一并修）；连续事件时顺带合并同帧重复入队。
  let rafId = 0;
  const schedule = () => {
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => apply(measure()));
  };

  vv.addEventListener("resize", schedule);
  vv.addEventListener("scroll", schedule);
  window.addEventListener("resize", schedule);
  apply(measure());

  return () => {
    cancelAnimationFrame(rafId);
    vv.removeEventListener("resize", schedule);
    vv.removeEventListener("scroll", schedule);
    window.removeEventListener("resize", schedule);
  };
}
