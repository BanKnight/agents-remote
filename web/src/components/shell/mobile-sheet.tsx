import type { ReactElement, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
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
/** 拖拽 dismiss 滑出：顶边推过视口底的余量（防亚像素残边，fill-forwards 保持出屏终态）。 */
const DISMISS_SLIDE_PAST_PX = 40;
/** 拖拽 dismiss 滑出时长：从松手位置滑出全屏比常规关闭（16px+fade）距离长，稍缓贴近 iOS。 */
const DISMISS_SLIDE_MS = 200;

/**
 * 受控关闭 → 消费方延迟卸载的统一间隔：受控 open 的浮层（MobileSheet / 桌面 Dialog）在
 * onOpenChange(false) 时先内部 open=false 播完 exit 动画（sheet slide-out 150ms / modal
 * fade-out 150ms）再卸载组件，立即卸载 = 截断动画闪终态（frontend-notes §9）+ 与
 * DismissableLayer 清理序竞态（body 残留 pointer-events:none，整页不可点）。300ms 覆盖
 * 两端 exit 动画时长。
 */
export const SHEET_UNMOUNT_DELAY_MS = 300;

/**
 * 拖动状态机：idle → pending（在热区按下）→ dragging（越过起步阈值，跟手位移）。
 * 全 ref 不触发 re-render——位移直接写 Content 的 inline transform。
 */
type DragState =
  | { phase: "idle" }
  | { phase: "pending"; startY: number; touchId: number }
  | {
      phase: "dragging";
      startY: number;
      touchId: number;
      lastY: number;
      lastT: number;
      v: number;
      dy: number;
    };

/**
 * v2 移动 sheet 容器（M5 浮层族 03j/03k/03l/03n/08/11 共用原语，§6.4 摊牌 3；§6.12n 起
 * 为全系统移动 sheet 唯一底座——ActionMenu/OptionMenu/prompt/confirm/pages/实例信息已迁入）：
 * Radix Dialog `modal`——scrim/Esc/focus-trap/body-lock 全交 Radix（frontend-notes §4，
 * 调用方在带 onClick 的祖先自行 contains 判断）。Content 定位与视觉 = v2 原语 `.msheet`
 * （fixed 底部避 safe-area、radius 20、max-height 内滚，frontend-notes §8 高度链）；
 * 结构 = grab 条 + shd（.shd h2 17px/600 标题 + 右侧 .shd .aside 12px ink-2）+ children。
 * 退出动画 fill-mode-forwards 保持终态防闪（frontend-notes §9）。
 *
 * 下拉收起（M10 第三轮用户反馈）：grab 条 + shd 头部为拖动热区（iOS sheet 教学位；列表区
 * 保持原生滚动不冲突，热区 `touch-none` 作 CSS 层第一道防线），拖拽由原生 touch events
 * 直驱（iOS pointer events 派生层不可控，见 effect 内注释），位移写 Content inline
 * transform 跟手，越过阈值保留位移交 Radix exit 动画从松手位置继续滑出屏幕（exit keyframes
 * 无 from，起点 = 当前 inline 位置），否则回弹。
 */
export function MobileSheet({
  ariaLabel,
  aside,
  children,
  headerExtra,
  onOpenChange,
  open,
  title,
  trigger,
}: {
  /** 无 title 时的可访问名（sr-only Title 渲染，如菜单 sheet 的「操作菜单」）。 */
  ariaLabel?: string;
  /** shd 右侧副文本（03j 项目名 / 03n 项目名）。 */
  aside?: ReactNode;
  children: ReactNode;
  /** shd 标题后插入的节点（11 审批中心：.cnt 计数 + .all 全部允许，flex 同行）。 */
  headerExtra?: ReactNode;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  /** shd 标题；菜单类 sheet 无标题（只传 ariaLabel）。 */
  title?: ReactNode;
  /** 开合触发元素（可选，Radix asChild 注入 toggle/aria——ActionMenu/OptionMenu 的
   * 半受控 trigger 场景；holder/受控调用方不传，open 全受控）。 */
  trigger?: ReactElement;
}) {
  const dragRef = useRef<DragState>({ phase: "idle" });
  // DOM 就绪信号走 state ref callback（React 官方模式）：Radix Portal 的 Content 挂载晚于
  // 本组件的 useEffect（open=true 的 commit 时 ref 尚未赋值）——useRef + effect[open] 会
  // 在 ref=null 时提前 return 且此后无 open 变化**永不重绑**（三轮真机「拖不动」的真根因：
  // 第二轮 preventDefault 与本轮 touch 驱动都因此空转过）。node 挂载时 setState → effect
  // [contentNode] 重跑绑定；卸载时 React 先置 null → cleanup 先跑，顺序安全。
  const [contentNode, setContentNode] = useState<HTMLDivElement | null>(null);
  // latest-ref 模式：effect 只依赖 contentNode，onOpenChange 变化不触发重绑。
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;

  // 拖拽驱动用原生 touch events 直驱，不走 pointer events。原因（三轮真机反馈换来的）：
  // iOS WebKit 上 pointer events 是 touch 的派生兼容层，滚动容器（.msheet overflow-y:auto）
  // 内这层与滚动判定/pointercancel 的交互不可控——touch-action:none 判定不稳「经常拖不动」
  //（第二轮），touchmove preventDefault 后 pointermove 可能整个停发「完全拖不动」（第三轮，
  // Chromium 的 touch/pointer 双实现模拟不出该派生层行为，探针测不出）。touch events 是
  // touch-action 出现之前 iOS 自定义手势的唯一通道，机制最直接：non-passive touchmove 里
  // preventDefault 直接取消滚动默认行为（滚动从未启动即无 pointercancel/抢占），touch 事件
  // 本身照常派发，拖拽驱动不依赖任何派生层。prevent 覆盖整个手势期（非 idle）——起步窗口
  //（<6px）被滚动接管 = 手势永久死在 pending。touchstart 不 prevent（保热区按钮 tap 的
  // click 合成）；拖拽位移后 iOS 本就不合成 click。touchcancel（系统手势打断）视同松手。
  // touch events 的 target 固定为 touchstart 命中元素，手指滑出热区也持续派发，无需 capture。
  useEffect(() => {
    const el = contentNode;
    if (!el) return;

    // 回弹：播完清 inline transition（防残留干扰 Radix enter/exit 动画的 transform）。
    const springBack = () => {
      el.style.transition = `transform ${SPRING_BACK_MS}ms ease-out`;
      el.style.transform = "";
      window.setTimeout(() => {
        el.style.transition = "";
      }, SPRING_BACK_MS + 40);
    };

    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t || !(e.target instanceof Element) || !e.target.closest(".grab, .shd")) return;
      dragRef.current = { phase: "pending", startY: t.clientY, touchId: t.identifier };
    };

    const onTouchMove = (e: TouchEvent) => {
      const d = dragRef.current;
      if (d.phase === "idle") return;
      e.preventDefault();
      const t = Array.from(e.touches).find((x) => x.identifier === d.touchId);
      if (!t) return;
      if (d.phase === "pending") {
        const ndy = t.clientY - d.startY;
        if (ndy <= DRAG_START_PX) return;
        dragRef.current = {
          ...d,
          phase: "dragging",
          lastY: t.clientY,
          lastT: e.timeStamp,
          v: 0,
          dy: ndy,
        };
        // 接管期间清 transition 保证跟手。
        el.style.transition = "";
        el.style.transform = `translateY(${ndy}px)`;
        return;
      }
      const v = (t.clientY - d.lastY) / Math.max(1, e.timeStamp - d.lastT);
      const ndy = Math.max(0, t.clientY - d.startY);
      dragRef.current = { ...d, lastY: t.clientY, lastT: e.timeStamp, v, dy: ndy };
      el.style.transform = `translateY(${ndy}px)`;
    };

    const onTouchEnd = () => {
      const d = dragRef.current;
      if (d.phase === "idle") return;
      dragRef.current = { phase: "idle" };
      if (d.phase !== "dragging") return;
      const dismiss =
        d.dy >= DISMISS_DISTANCE_PX ||
        (d.dy >= DISMISS_MIN_DRAG_PX && d.v >= DISMISS_VELOCITY_PX_MS);
      if (!dismiss) {
        springBack();
        return;
      }
      // 保留 inline transform 作为 exit 动画起点（tw-animate-css 的 exit keyframes 只有 to
      // 无 from，起始值 = 当前计算样式）——从松手位置继续滑出；清掉会瞬跳回原位再滑出
      //（用户反馈的「回弹后再消失」）。inline 变量覆盖 class 的 exit 形态：滑出距离 = 顶边
      // 推出视口底 + 余量（slide-out-to-bottom-4 的 16px 不够出屏）、不 fade（iOS dismiss
      // 是纯滑出）、200ms ease-in 贴合松手初速度。Content unmount 后 inline 样式随之消亡。
      const rect = el.getBoundingClientRect();
      el.style.setProperty(
        "--tw-exit-translate-y",
        `${window.innerHeight - rect.top + DISMISS_SLIDE_PAST_PX}px`,
      );
      el.style.setProperty("--tw-exit-opacity", "1");
      el.style.setProperty("--tw-animation-duration", `${DISMISS_SLIDE_MS}ms`);
      el.style.setProperty("--tw-ease", "ease-in");
      onOpenChangeRef.current(false);
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
      // 拖拽中断（DOM 卸载）时状态机归位，防下一次打开残留 pending/dragging。
      dragRef.current = { phase: "idle" };
    };
  }, [contentNode]);

  return (
    <DialogPrimitive.Root onOpenChange={onOpenChange} open={open}>
      {trigger ? <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger> : null}
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
          ref={setContentNode}
          className={cn(
            "msheet outline-none",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-4 data-[state=open]:duration-200",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-bottom-4 data-[state=closed]:duration-150 data-[state=closed]:fill-mode-forwards",
          )}
        >
          <div aria-hidden="true" className="grab touch-none" />
          {title || headerExtra || aside ? (
            <div className="shd touch-none">
              {/* DialogPrimitive.Title 默认渲染 h2 → 命中 .shd h2 原型样式 */}
              <DialogPrimitive.Title>{title}</DialogPrimitive.Title>
              {headerExtra}
              {aside ? <span className="aside">{aside}</span> : null}
            </div>
          ) : (
            // 无标题 sheet（菜单类）：grab 仅 40×5px 拖动难命中（reviewer P2-5），渲染 12px
            // 零视觉热区行（.shd flex 行为无视觉副作用；不能 sr-only——sr-only 脱离布局
            // 无法命中）；Radix 要求的 Title 由 sr-only 子元素承载可访问名。
            <div className="shd h-3 touch-none">
              <DialogPrimitive.Title className="sr-only">{ariaLabel}</DialogPrimitive.Title>
            </div>
          )}
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
