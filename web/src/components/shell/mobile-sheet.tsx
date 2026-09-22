import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useRef } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * 下拉收起手势阈值（M10 第三轮用户反馈：sheet 应可下滑收起，iOS sheet 惯例）。位移 ≥96px
 * 直接收起；24–96px 区间按速度 ≥0.5px/ms 判惯性甩动收起；<24px 是点击 slop 不接管（保住
 * shd 内「全部允许」等按钮的 click 合成）。回弹动画时长。
 */
const DISMISS_DISTANCE_PX = 96;
const DISMISS_MIN_DRAG_PX = 24;
const DISMISS_VELOCITY_PX_MS = 0.5;
const DRAG_START_PX = 6;
const SPRING_BACK_MS = 200;

/**
 * 拖动状态机：idle → pending（在热区按下）→ dragging（越过起步阈值，capture + 跟手位移）。
 * 全 ref 不触发 re-render——位移直接写 Content 的 inline transform。
 */
type DragState =
  | { phase: "idle" }
  | { phase: "pending"; startY: number; pointerId: number }
  | {
      phase: "dragging";
      startY: number;
      pointerId: number;
      lastY: number;
      lastT: number;
      v: number;
      dy: number;
    };

/**
 * v2 移动 sheet 容器（M5 浮层族 03j/03k/03l/03n/08/11 共用原语，§6.4 摊牌 3）：
 * Radix Dialog `modal`——scrim/Esc/focus-trap/body-lock 全交 Radix（frontend-notes §4，
 * 调用方在带 onClick 的祖先自行 contains 判断）。Content 定位与视觉 = v2 原语 `.msheet`
 * （fixed 底部避 safe-area、radius 20、max-height 内滚，frontend-notes §8 高度链）；
 * 结构 = grab 条 + shd（.shd h2 17px/600 标题 + 右侧 .shd .aside 12px ink-2）+ children。
 * 退出动画 fill-mode-forwards 保持终态防闪（frontend-notes §9）。
 *
 * 下拉收起（M10 第三轮用户反馈）：grab 条 + shd 头部为拖动热区（iOS sheet 教学位；列表区
 * 保持原生滚动不冲突，`touch-none` 须在手势开始前生效故挂在热区元素上），位移写 Content
 * inline transform 跟手，越过阈值调 onOpenChange(false) 交 Radix exit 动画收起，否则回弹。
 */
export function MobileSheet({
  aside,
  children,
  headerExtra,
  onOpenChange,
  open,
  title,
}: {
  /** shd 右侧副文本（03j 项目名 / 03n 项目名）。 */
  aside?: ReactNode;
  children: ReactNode;
  /** shd 标题后插入的节点（11 审批中心：.cnt 计数 + .all 全部允许，flex 同行）。 */
  headerExtra?: ReactNode;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  title: ReactNode;
}) {
  const dragRef = useRef<DragState>({ phase: "idle" });

  const startDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!(e.target instanceof Element) || !e.target.closest(".grab, .shd")) return;
    dragRef.current = { phase: "pending", startY: e.clientY, pointerId: e.pointerId };
  };

  const moveDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (d.phase === "idle") return;
    if (d.phase === "pending") {
      const dy = e.clientY - d.startY;
      if (dy <= DRAG_START_PX) return;
      // 越过起步阈值才接管：capture 后续 pointer（click 合成改落 capture 元素，热区按钮
      // 的小位移点击不受影响）。inline transform 接管期间清 transition 保证跟手。
      e.currentTarget.setPointerCapture(d.pointerId);
      dragRef.current = {
        ...d,
        phase: "dragging",
        lastY: e.clientY,
        lastT: e.timeStamp,
        v: 0,
        dy,
      };
      e.currentTarget.style.transition = "";
      e.currentTarget.style.transform = `translateY(${dy}px)`;
      return;
    }
    const v = (e.clientY - d.lastY) / Math.max(1, e.timeStamp - d.lastT);
    const dy = Math.max(0, e.clientY - d.startY);
    dragRef.current = { ...d, lastY: e.clientY, lastT: e.timeStamp, v, dy };
    e.currentTarget.style.transform = `translateY(${dy}px)`;
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (d.phase === "idle") return;
    dragRef.current = { phase: "idle" };
    if (d.phase !== "dragging") return;
    const el = e.currentTarget;
    const dismiss =
      d.dy >= DISMISS_DISTANCE_PX || (d.dy >= DISMISS_MIN_DRAG_PX && d.v >= DISMISS_VELOCITY_PX_MS);
    if (dismiss) {
      // 清 inline transform 后交 Radix exit 动画（slide-out-to-bottom）完成收起。
      el.style.transform = "";
      onOpenChange(false);
      return;
    }
    // 回弹：播完清 inline transition（防残留干扰 Radix enter/exit 动画的 transform）。
    el.style.transition = `transform ${SPRING_BACK_MS}ms ease-out`;
    el.style.transform = "";
    window.setTimeout(() => {
      el.style.transition = "";
    }, SPRING_BACK_MS + 40);
  };

  return (
    <DialogPrimitive.Root onOpenChange={onOpenChange} open={open}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            // scrim 走语义 token（两态值随 data-theme；原型 .dim 无 blur——reviewer P2-4）。
            "fixed inset-0 z-40 bg-scrim",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:fill-mode-forwards",
          )}
        />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            "msheet outline-none",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-4 data-[state=open]:duration-200",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-bottom-4 data-[state=closed]:duration-150 data-[state=closed]:fill-mode-forwards",
          )}
          onPointerCancel={endDrag}
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
        >
          <div aria-hidden="true" className="grab touch-none" />
          <div className="shd touch-none">
            {/* DialogPrimitive.Title 默认渲染 h2 → 命中 .shd h2 原型样式 */}
            <DialogPrimitive.Title>{title}</DialogPrimitive.Title>
            {headerExtra}
            {aside ? <span className="aside">{aside}</span> : null}
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
