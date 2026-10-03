import type { PointerEvent as ReactPointerEvent, ReactElement, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

import { sheetDebug } from "./sheet-debug";

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
 * v2 移动 sheet 容器（M5 浮层族 03j/03k/03l/03n/08/11 共用原语，§6.4 摊牌 3；§6.12n 起
 * 为全系统移动 sheet 唯一底座——ActionMenu/OptionMenu/prompt/confirm/pages/实例信息已迁入）：
 * Radix Dialog `modal`——scrim/Esc/focus-trap/body-lock 全交 Radix（frontend-notes §4，
 * 调用方在带 onClick 的祖先自行 contains 判断）。Content 定位与视觉 = v2 原语 `.msheet`
 * （fixed 底部避 safe-area、radius 20、max-height 内滚，frontend-notes §8 高度链）；
 * 结构 = grab 条 + shd（.shd h2 17px/600 标题 + 右侧 .shd .aside 12px ink-2）+ children。
 * 退出动画 fill-mode-forwards 保持终态防闪（frontend-notes §9）。
 *
 * 下拉收起（M10 第三轮用户反馈）：grab 条 + shd 头部为拖动热区（iOS sheet 教学位；列表区
 * 保持原生滚动不冲突，热区 `touch-none` 作 CSS 层第一道防线），拖拽由 pointer events 驱动
 * + non-passive touchmove preventDefault 防滚动抢占（见 effect 内注释），位移写 Content
 * inline transform 跟手，越过阈值保留位移交 Radix exit 动画从松手位置继续滑出屏幕（exit
 * keyframes 无 from，起点 = 当前 inline 位置），否则回弹。
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
  // enter 动画被拖拽接管后置 true：从 className 摘掉 animate-in 串。规范语义（CSS
  // Animations）：cancel 一个 animation-name 仍匹配的 CSS 动画，样式更新时会**立即重建
  // 实例**（keyframes transform 重新压过 inline——真机「刚打开必然下拉不成功」即此；
  // Chromium 不重建所以探针测不到，WebKit 有历史分歧行为）。样式失配 = 动画死亡且
  // 不可重建，全引擎一致。open=false 时重置：此时 data-state=closed，animate-in 的
  // data-[state=open] 变体失配不产生动画（exit 的 animate-out 独立类不受影响），Content
  // 卸载后下次打开正常播 enter。
  const [enterKilled, setEnterKilled] = useState(false);
  useEffect(() => {
    if (!open) setEnterKilled(false);
  }, [open]);
  // 接管时的视觉续接基点：enter 升起中被接管时 cancel 会让元素瞬回未变换位置（终态），
  // 直接写 translateY(dy) = 从升起中段瞬跳到近终态再跟手。cancel 前记下当前视觉顶与
  // cancel 后未变换顶的差（= 动画尚存的视觉偏移），inline 一律写 base + dy——从手指
  // 看到的位置无跳续接（animate from the presentation value）。endDrag 归零。
  const dragBaseRef = useRef(0);
  // 真机诊断计数（sheet-debug 浮层用，flag 关时零开销）。
  const mvCountRef = useRef(0);
  const tpCountRef = useRef(0);

  // 防滚动抢占：non-passive touchmove 在手势期（非 idle）preventDefault。真机「回弹/
  // 不跟手/拖不动」的来源是 WebKit 把手势当滚动启动并 pointercancel 中断拖拽（cancel 时
  // dy/v 不够 dismiss 即走回弹分支，探针 Chromium 不复现 cancel 所以测不到）——prevent
  // 从第一个 touchmove 就拦，WebKit 才不会先启动滚动再 cancel。**preventDefault 的判断
  // 读 dragRef（pointer handlers 设置），拖拽驱动本身走 pointer events**——四轮真机反馈
  // 的实证：pointer 驱动在 iOS 有效（第一/二轮「拖动有效」），touch events 直驱无效
  //（第四轮「毫无动静」，机制未定论，勿再走）。prevent 覆盖整个手势期（含 pending 起步
  // 窗口，被滚动接管 = 手势死在 pending）；纯 tap 无 touchmove 不受影响（热区按钮 click
  // 照常合成）。
  useEffect(() => {
    const el = contentNode;
    if (!el) return;
    const onTouchMove = (e: TouchEvent) => {
      if (dragRef.current.phase !== "idle") {
        e.preventDefault();
        tpCountRef.current++;
      }
    };
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      el.removeEventListener("touchmove", onTouchMove);
      // 拖拽中断（DOM 卸载）时状态机归位，防下一次打开残留 pending/dragging。
      dragRef.current = { phase: "idle" };
    };
  }, [contentNode]);

  const startDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!(e.target instanceof Element)) return;
    // 热区分档：enter 升起中（open 态 + Content 自身动画在播 = getAnimations 非空）整个
    // Content 都可起拖。真机多轮「打开即下拉不成功」的主根因在此，不在动画层：顶部热区
    // （grab 5px + shd ≈12–44px）要等 sheet 升到手指位置才可命中，而「刚打开就下拉」的
    // 手指落点在时序上必然赶不上升起到位——按在升起中的 sheet 内容区，closest 窄热区判定
    // 失败 → pending 从未建立 → moveDrag 接管段（cancel/摘类）根本没机会执行（探针
    // boundingBox 精确按 grab 全绿、真人手指必失败的原因）。升起中内容无交互意义（菜单
    // 项/列表未到位点不到），宽热区无副作用；enter 播完或被接管摘类后 getAnimations 归空
    // 自动收窄回 grab/shd，列表区原生滚动不受影响。exit 期间（data-state=closed）不放宽。
    const enterPlaying =
      e.currentTarget.getAttribute("data-state") === "open" &&
      e.currentTarget.getAnimations().length > 0;
    const zone = e.target.closest(".grab") ? "grab" : e.target.closest(".shd") ? "shd" : "content";
    if (!enterPlaying && zone === "content") {
      sheetDebug(`down zone=content play=0 pend=NO（窄热区拒绝）`);
      return;
    }
    mvCountRef.current = 0;
    tpCountRef.current = 0;
    sheetDebug(`down zone=${zone} play=${enterPlaying ? 1 : 0} pend=YES`);
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
      // enter spring（批B，375ms）运行期 keyframes transform 压过 inline style——
      // 「打开即下拉」会在动画播完才跳到手指位置（design review P2）。显式 cancel
      // 让拖拽立即接管；未在播时是 no-op。只 cancel 不改拖拽状态机。
      const visTop = e.currentTarget.getBoundingClientRect().top;
      for (const a of e.currentTarget.getAnimations()) a.cancel();
      // WebKit：cancel 后 animation-name 仍匹配，样式更新即重建动画实例、keyframes
      // 重新压过 inline（真机「刚打开必然下拉不成功」的根因）——置 enterKilled 从
      // className 摘掉 animate-in 串，样式失配让动画彻底死亡（React 离散事件同步
      // flush，与 inline transform 同帧生效，无跳帧）。
      setEnterKilled(true);
      // 视觉续接（animate from the presentation value）：cancel 后元素回未变换位置，
      // 差值 = 动画尚存的视觉偏移；inline 一律 base + dy，接管瞬间无跳变。
      dragBaseRef.current = visTop - e.currentTarget.getBoundingClientRect().top;
      e.currentTarget.style.transition = "";
      e.currentTarget.style.transform = `translateY(${dragBaseRef.current + dy}px)`;
      sheetDebug(`take dy=${Math.round(dy)} base=${Math.round(dragBaseRef.current)}`);
      // 真机校验（一次）：下一帧 inline 期望值与视觉 translateY 是否一致——不一致 =
      // 动画/keyframes 仍在压过 inline（WebKit 压制实锤）。
      const el = e.currentTarget;
      const expected = dragBaseRef.current + dy;
      requestAnimationFrame(() => {
        const visY = new DOMMatrixReadOnly(getComputedStyle(el).transform).m42;
        const diff = Math.round(Math.abs(visY - expected));
        sheetDebug(
          `chk inline=${Math.round(expected)} visY=${Math.round(visY)} ${diff < 2 ? "ok" : "MISMATCH!"}`,
        );
      });
      return;
    }
    const v = (e.clientY - d.lastY) / Math.max(1, e.timeStamp - d.lastT);
    const dy = Math.max(0, e.clientY - d.startY);
    dragRef.current = { ...d, lastY: e.clientY, lastT: e.timeStamp, v, dy };
    mvCountRef.current++;
    e.currentTarget.style.transform = `translateY(${dragBaseRef.current + dy}px)`;
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (d.phase === "idle") return;
    const kind = e.type === "pointercancel" ? "PCANCEL" : "up";
    dragRef.current = { phase: "idle" };
    if (d.phase !== "dragging") return;
    const el = e.currentTarget;
    dragBaseRef.current = 0;
    const dismiss =
      d.dy >= DISMISS_DISTANCE_PX || (d.dy >= DISMISS_MIN_DRAG_PX && d.v >= DISMISS_VELOCITY_PX_MS);
    if (dismiss) {
      // 保留 inline transform 作为 exit 动画起点（tw-animate-css 的 exit keyframes 只有 to
      // 无 from，起始值 = 当前计算样式）——从松手位置继续滑出；清掉会瞬跳回原位再滑出
      //（用户反馈的「回弹后再消失」）。inline 变量覆盖 class 的 exit 形态：滑出距离 =
      // 顶边推出视口底 + 余量（slide-out-to-bottom-4 的 16px 不够出屏）、不 fade（iOS
      // dismiss 是纯滑出）、200ms ease-in 贴合松手初速度。Content unmount 后 inline 样式
      // 随之消亡，无残留。
      const rect = el.getBoundingClientRect();
      el.style.setProperty(
        "--tw-exit-translate-y",
        `${window.innerHeight - rect.top + DISMISS_SLIDE_PAST_PX}px`,
      );
      el.style.setProperty("--tw-exit-opacity", "1");
      el.style.setProperty("--tw-animation-duration", `${DISMISS_SLIDE_MS}ms`);
      el.style.setProperty("--tw-ease", "ease-in");
      sheetDebug(
        `${kind} dy=${Math.round(d.dy)} v=${d.v.toFixed(2)} mv=${mvCountRef.current} tp=${tpCountRef.current} -> DISMISS`,
      );
      onOpenChangeRef.current(false);
      return;
    }
    // 回弹：播完清 inline transition（防残留干扰 Radix enter/exit 动画的 transform）。
    el.style.transition = `transform ${SPRING_BACK_MS}ms ease-out`;
    el.style.transform = "";
    window.setTimeout(() => {
      el.style.transition = "";
    }, SPRING_BACK_MS + 40);
    sheetDebug(
      `${kind} dy=${Math.round(d.dy)} v=${d.v.toFixed(2)} mv=${mvCountRef.current} tp=${tpCountRef.current} -> bounce`,
    );
  };

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
            // programmatic enter = spring 全程升起（移动端动效批）：位移从 16px 浮起改
            // 屏幕底完整升起（[--tw-enter-translate-y:100%] 变量注入，机制同 §16——
            // tw-animate 的 enter keyframes 消费该变量），去掉 fade（iOS sheet 是纯
            // 位移，升起途中不透明，dim 交给 scrim）；时长走 sheet 档 token（100%
            // 路程下 375ms 偏陡）。拖拽状态机、exit keyframes（inline transform 作
            // 起点）与 fill-mode-forwards 一律不动；「打开即下拉」= getAnimations
            // cancel + enterKilled 摘类（WebKit 重建动画防护，见 state 处注释）。
            ...(enterKilled
              ? []
              : [
                  "data-[state=open]:animate-in data-[state=open]:[--tw-enter-translate-y:100%] data-[state=open]:[--tw-ease:var(--spring-standard)] data-[state=open]:[--tw-animation-duration:var(--spring-sheet-duration)]",
                ]),
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-bottom-4 data-[state=closed]:[--tw-animation-duration:var(--duration-exit)] data-[state=closed]:fill-mode-forwards",
          )}
          onPointerCancel={endDrag}
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
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
