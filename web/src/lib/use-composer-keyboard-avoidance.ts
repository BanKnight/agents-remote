import { useEffect } from "react";

/**
 * iOS Safari 键盘避让：驱动 claude2 composer 浮动区的 `--composer-keyboard-offset`
 * CSS 变量（内层 translateY 上抬），让 composer 在键盘弹起时就已浮在键盘上方 →
 * iOS 判定焦点 input 已可见 → 不触发 scroll-to-reveal（连 overflow:hidden 都绕不过的
 * 那个 layout-viewport 强制滚动）。这是 iOS 上唯一可靠的键盘避让路径：dvh/svh、
 * interactive-widget meta、VirtualKeyboard API 在 iOS 全不触发键盘（见
 * docs/research/claude2-ios-keyboard-viewport.md）。
 *
 * 监听 visualViewport 的 resize + scroll（键盘动画收尾 scroll 仍 fire，保证 offset 准确）。
 * 关闭用 keyboardVisible = vv.height < innerHeight 判断并强制归零，绕过 iOS 26 layout
 * scroll 不复位 bug。不用 window.scrollTo 对抗——body 被 pin 时 document scroll 本就是 0，
 * 碰不到 visual-viewport pan 轴，逐帧对抗只抖动（之前 mobile-keyboard.ts 失败的原因）。
 *
 * 第二个 effect：克隆 ShellLayout 的 ResizeObserver→CSS 变量→inset 模式，测浮动区总高
 * 写 `--composer-float-inset`，消息列表底部 spacer 消费，保证滚动到底时最后一条消息
 * 不被悬浮 composer 遮挡。
 */
export function useComposerKeyboardAvoidance(): void {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return; // 不支持 visualViewport → no-op（桌面浏览器也走这里）
    // 桌面硬件键盘：visualViewport 不会因键盘变化，显式 guard 避免极少数 viewport 抖动误触发
    if (!window.matchMedia("(pointer: coarse)").matches) return;

    const root = document.documentElement;

    const apply = () => {
      const keyboardVisible = vv.height < window.innerHeight;
      // 视口底被键盘吃掉的高度 = layout viewport 高 - visual viewport 高 - 其顶部偏移。
      // keyboardVisible=false 时强制 0，绕过 iOS 26 关键盘后 offset 残留。
      const offset = keyboardVisible
        ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
        : 0;
      root.style.setProperty("--composer-keyboard-offset", `${offset}px`);
    };

    // requestAnimationFrame 兜 iOS 关键盘一帧 visualViewport 不一致，与浏览器布局同帧、无魔数超时。
    const schedule = () => requestAnimationFrame(apply);

    vv.addEventListener("resize", schedule);
    vv.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule); // 横竖屏切换重算
    apply();

    return () => {
      vv.removeEventListener("resize", schedule);
      vv.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
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
