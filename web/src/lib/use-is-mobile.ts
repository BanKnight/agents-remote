import { useEffect, useState } from "react";

/**
 * 移动形态断点（v2 三档断点，redesign-v2 §6.10-1）：`max-width: 1023px` 命中即移动形态——
 * 手机 <640（4 Tab 原生宽）与 iPad 竖屏 640–1023（移动布局拉宽，Apple 竖屏单列惯例）同档；
 * ≥1024 交 `useIsDesktopViewport`（桌面三栏）。此前 640–1023 中档落「非移动非桌面」空档
 *（移动骨架 + 桌面内件混血：ActionMenu 弹 popover、对话框非 sheet），阈值对齐桌面分界后两端一致。
 * `<ActionMenu>` 用它分流：移动形态渲染底部 action sheet，桌面渲染 Radix 锚定 popover。
 *
 * 历史内联同款惯用法见 `SessionDetailRoute.tsx`，此处提取为可复用 hook。
 * jsdom/SSR 无 matchMedia 时 fallback `false`（= 桌面），保证测试与首屏稳定。
 */
const MOBILE_QUERY = "(max-width: 1023px)";

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
