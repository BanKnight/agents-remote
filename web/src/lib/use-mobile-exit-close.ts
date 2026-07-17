import type { AnimationEvent } from "react";
import { useCallback, useState } from "react";

import { useIsMobile } from "./use-is-mobile";

/**
 * 移动浮层 dismiss 的 exit 动画编排（apple-design §7 对称路径）。移动端 close 先播
 * slide-out 再真正清 state（exit 期间保持 mount），桌面端即时清（`sm:static` 浮层是布局位，
 * 无浮层动画）。
 *
 * 消费方：`clearPreview`/`clearDiff` 等"用户主动 dismiss"路径调 `close()`；浮层 div 挂
 * `onAnimationEnd` + 用 `exiting` 切换 `animate-out`/`animate-in` 类 + 可见性 gate `open || exiting`。
 * `selectFile` 等"开新内容"路径调 `cancel()` 取消未完成 exit（防 close 后 300ms 内改选的 race）。
 *
 * `onAnimationEnd` 的 `e.target !== e.currentTarget` gate 防 previewPanel/diffPanel 内部 finite
 * CSS animation 的 animationend 冒泡到浮层 div 误触发提前 close（skeleton-shimmer infinite 不
 * 触发 animationend，但其他 finite animation 会 bubble）。
 */
export function useMobileExitClose(onActualClose: () => void) {
  const isMobile = useIsMobile();
  const [exiting, setExiting] = useState(false);

  const close = useCallback(() => {
    if (!isMobile) {
      onActualClose();
      return;
    }
    setExiting(true);
  }, [isMobile, onActualClose]);

  const onAnimationEnd = useCallback(
    (e: AnimationEvent<HTMLDivElement>) => {
      if (!exiting || e.target !== e.currentTarget) return;
      onActualClose();
      setExiting(false);
    },
    [exiting, onActualClose],
  );

  const cancel = useCallback(() => setExiting(false), []);

  return { exiting, close, onAnimationEnd, cancel };
}
