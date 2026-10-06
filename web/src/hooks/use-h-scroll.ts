import { useCallback, useEffect, useRef, useState } from "react";

/**
 * §7.2 横向标签条指针设备规范（v1.5 批 8；适用 ptabs / tabstrip / 附件 chips / 终端
 * 快捷键条等所有横向滚动条）：滚轮纵向增量映射横向滚动 + 溢出边缘 12px 渐隐方向状态。
 *
 * - wheel：deltaY → scrollLeft（passive:false 阻页面纵向联动，spec §7.2 实现注意）。
 *   Shift+滚轮（部分浏览器转 deltaX）与触控板双指横滑（deltaX≠0）保持原生行为；
 *   容器无溢出、或已滚到目标侧尽头时不劫持——放行页面继续滚动。
 * - fade：{left, right} = 对应侧是否仍有视野外内容（渐隐只在该侧可滚时出现、滚到头
 *   即消失）。scroll + ResizeObserver（容器尺寸）驱动重算；内容数量变化（chips 增删
 *   不触发 scroll/resize）由调用方在内容 effect 里调 update()。
 *
 * 返回 ref（挂横滚容器）+ fade + update + fadeProps（展开到容器即接好 data-fade-*，
 * 配合 v2-primitives `.hfade` 单侧 12px 渐隐）。
 */
export function useHScroll() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [fade, setFade] = useState({ left: false, right: false });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // 值等返回原引用（Object.is bailout）：调用方若把 hook 对象整体放进 effect deps
    //（[hs, ...]——hs 每渲染是新字面量，effect 每渲染都跑），无此守卫时 setFade 恒新
    // 对象 → 恒重渲染 → 无限循环（loopcheck 测试锁定）。
    setFade((prev) => {
      const left = el.scrollLeft > 1;
      const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      return prev.left === left && prev.right === right ? prev : { left, right };
    });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.shiftKey || e.deltaX !== 0) return; // Shift/触控板横滑 = 原生横向行为
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0) return;
      if (e.deltaY < 0 && el.scrollLeft <= 0) return; // 已到左端：放行页面滚动
      if (e.deltaY > 0 && el.scrollLeft >= max - 1) return; // 已到右端：放行
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    update();
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [update]);

  const fadeProps = {
    "data-fade-left": fade.left ? "on" : "off",
    "data-fade-right": fade.right ? "on" : "off",
  } as const;

  return { ref, fade, update, fadeProps };
}
