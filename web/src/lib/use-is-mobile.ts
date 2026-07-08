import { useEffect, useState } from "react";

/**
 * 移动端断点探测（`sm:` = 640px）。`max-width: 639px` 命中即移动端。
 * `<ActionMenu>` 用它分流：移动端渲染底部 action sheet，桌面端渲染 Radix 锚定 popover。
 *
 * 历史内联同款惯用法见 `SessionDetailRoute.tsx`（`min-width: 640px`），此处提取为可复用 hook。
 * jsdom/SSR 无 matchMedia 时 fallback `false`（= 桌面），保证测试与首屏稳定。
 */
const MOBILE_QUERY = "(max-width: 639px)";

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia?.(MOBILE_QUERY).matches ?? false;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia(MOBILE_QUERY);
    const onChange = () => setIsMobile(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
