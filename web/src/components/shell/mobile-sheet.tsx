import type { PointerEvent as ReactPointerEvent, ReactElement, ReactNode } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";

import { animate } from "motion";

import { cn } from "@/lib/utils";

/**
 * 下拉收起手势判定（iOS sheet 惯例 = velocity-first，apple-design Quick Reference：
 * 「Decide reverse vs. commit — use velocity sign, not position」——flick 几乎任何行程
 * 都收起，**没有短距离快甩回弹这回事**；位置门会拦下快甩造成猛回弹，用户实测否定）。
 * 收起 = 投影过阈值（「位移 + 速度 × 300ms 视野」≥ max(64px, sheet 高度 × 25%)——固定
 * 96px 绝对阈值下慢拖几乎不可达，用户实测「慢拖都有回弹」）或纯甩动（v ≥ 0.5px/ms）；
 * 都达不到才回弹。<6px（DRAG_START_PX）是点击 slop 不接管拖拽（保住 shd 内「全部允许」
 * 等按钮的 click 合成），接管后的手势才有收起/回弹判定。
 */
const DISMISS_MIN_DISTANCE_PX = 64;
const DISMISS_HEIGHT_RATIO = 0.25;
const DISMISS_PROJECT_MS = 300;
const DISMISS_VELOCITY_PX_MS = 0.5;
const DRAG_START_PX = 6;
/** 松手动量阈值：v ≥ 此值视作动量释放，回弹弹簧带轻微 bounce（apple-design §4：bounce
 * 只给带动量的手势——flick/throw/drag release；damping ~0.8 的映射即 bounce ≈ 0.2）。
 * 慢速松手（v < 阈值）bounce 0 优雅归位，无过冲。 */
const MOMENTUM_VELOCITY_PX_MS = 0.3;
const MOMENTUM_BOUNCE = 0.2;
/** 回弹弹簧参数：response 300ms 临界阻尼（bounce 0，Apple sheet 惯例 damping 1.0），
 * 初速度 = 手指松手窗口速度——快甩带速下冲过冲再收回、慢拖平滑收回。物理由 motion
 * 积分（velocity 选项单位 units/s，内部 px/ms 值 ×1000 换算）。 */
const SPRING_RESPONSE_S = 0.3;
/** sheet enter 升起弹簧 fallback 时长（运行时读 token --spring-sheet-duration，常量仅在
 * token 缺失时兜底——JS/CSS 时长单源）。近瞬时档 120ms 带 bounce 0.12 的 materialize
 * 弹性（Apple modal presentation 惯例；一次性打开动量的小幅过冲，与回弹越顶钳制不
 * 冲突——那是松手弹回的边界，这是打开动量的签名弹性）。物理由 motion 积分。 */
const SPRING_SHEET_ENTER_S = 0.12;
const ENTER_BOUNCE = 0.12;
/** 拖拽 dismiss 滑出：顶边推过视口底的余量（防亚像素残边，fill-forwards 保持出屏终态）。
 * 滑出动画 = motion 弹簧带松手速度（duration 0.3），不再用固定 200ms ease-in。 */
const DISMISS_SLIDE_PAST_PX = 40;

/**
 * 受控关闭 → 消费方延迟卸载的统一间隔：受控 open 的浮层（MobileSheet / 桌面 Dialog）在
 * onOpenChange(false) 时先内部 open=false 播完 exit 动画（sheet slide-out 150ms / modal
 * fade-out 150ms）再卸载组件，立即卸载 = 截断动画闪终态（frontend-notes §9）+ 与
 * DismissableLayer 清理序竞态（body 残留 pointer-events:none，整页不可点）。300ms 覆盖
 * 两端 exit 动画时长。
 */
export const SHEET_UNMOUNT_DELAY_MS = 300;

/** reduced-motion 下的 JS 驱动动画兜底：CSS 站点级 media query（index.css）只压
 * animation/transition 时长，管不到 motion rAF 驱动——本文件三处 JS 动画（enter 升起/
 * 回弹/带速滑出）各自在启动前查询，reduce 时直接置终态（动画语义 = 瞬时到位）。 */
const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * sheet 内容是否存在实际溢出的可滚容器（真机取证 `7a3d37c` 后的根因：enter 播完后
 * 手指落在内容区被窄热区拒绝，而人「打开→按下拖」的反应必然超过 enter 时长 = 必拒；
 * 取证时为 450ms，现 120ms 近瞬时档下「播完后分档」是所有用户的主路径）。播完后
 * 的起手面按此分档：不可滚（菜单/确认框/prompt 等大多数 sheet）→ 整个 Content 都可往下
 * 拖收起；可滚（历史/文件/实例信息列表）→ 维持 grab/shd 窄热区，保住列表原生滚动。
 * 只扫后代不含 el 自身（.msheet 根的 max-height 内滚是 sheet 级滚动，不是内容列表）。
 */
export function hasScrollableContent(el: HTMLElement): boolean {
  for (const n of el.querySelectorAll<HTMLElement>("*")) {
    if (n.scrollHeight > n.clientHeight + 1) {
      const oy = getComputedStyle(n).overflowY;
      if (oy === "auto" || oy === "scroll") return true;
    }
  }
  return false;
}

/**
 * 回弹弹簧物理 = motion 库（`animate` 命令式，bounce 0 + duration 0.3 = 临界阻尼；velocity
 * 单位 units/s）。此前手写半隐式欧拉积分 + 数值单测（用户拍板「用库治本，编译有裁剪不
 * 担心体积」后移交库实现——判定/测速层仍在本文件：投影、velocity-first、窗口速度、越顶
 * 钳制）。CDP 输入节流做不出高松手速度（4 步快甩实测只得 0.17px/ms），弹簧收敛行为由
 * 浏览器探针断言。原 springStep/simulateSpringBack 纯函数随手写积分移除（入库即删）。
 */

/** 松手速度窗口：从松手时刻回看这么长的时间取净位移（iOS UIPanGestureRecognizer 惯例）。 */
const VELOCITY_WINDOW_MS = 100;

/** rubber-band 越界阻力系数（apple-design §9 公式的 constant：越小越硬）。上顶原位比
 * 拖过一屏硬得多——iOS sheet 顶边几乎不动，只留一丝弹性。 */
const RUBBER_TOP_CONSTANT = 0.2;
const RUBBER_OVERDRAG_CONSTANT = 0.55;

/**
 * apple-design §9 rubber-band：越界量经渐进阻力映射为视觉位移（iOS scroll 同款公式——
 * 越深阻力越大，边界是「软」的）。上顶原位（dy<0）与拖过一屏（dy>dimension）为两个软
 * 边界；界内 1:1 跟手。**收起判定用原始位移**（visual 只影响跟手渲染），见 moveDrag。
 */
export function visualDragY(dy: number, dimension: number): number {
  if (dy < 0) return -rubberband(-dy, dimension, RUBBER_TOP_CONSTANT);
  if (dy > dimension)
    return dimension + rubberband(dy - dimension, dimension, RUBBER_OVERDRAG_CONSTANT);
  return dy;
}

function rubberband(overshoot: number, dimension: number, constant: number): number {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

/**
 * 松手速度 = 最近窗口的净位移 ÷ 窗口时长（apple-design §2：track a short velocity/position
 * history，不是最后一次 move 的瞬时值——真实手指慢拖停停走走，停顿期没有 move 事件，
 * 用「up 时刻回看」窗口让停顿自然计入分母：停住 300ms 后松手 → 位移 0 ÷ 300ms = 0，
 * 过期瞬时速度不会再被注入弹簧造成向下过冲）。
 */
export function sampleVelocity(samples: { y: number; t: number }[], tEnd: number): number {
  if (samples.length === 0) return 0;
  const cutoff = tEnd - VELOCITY_WINDOW_MS;
  let ref = samples[0];
  for (const s of samples) {
    if (s.t <= cutoff) ref = s;
    else break;
  }
  const dt = tEnd - ref.t;
  if (dt < 1) return 0;
  return (samples[samples.length - 1].y - ref.y) / dt;
}

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
      dy: number;
      /** 位置/时间样本（§2 velocity history），松手时经 sampleVelocity 取窗口速度。 */
      samples: { y: number; t: number }[];
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
  // enter 升起 = motion 弹簧驱动（见下方 useLayoutEffect）。CSS enter 类串随之移除——
  // §21 的 WebKit「cancel 后按样式匹配重建动画」防线不再需要：motion 是 rAF 驱动 inline
  // transform，不经 CSS 样式匹配，stop 即死、无重建面。
  const enterControlsRef = useRef<ReturnType<typeof animate> | null>(null);
  const enterPlayingRef = useRef(false);
  // 回弹弹簧的 motion controls：拖拽中断/关闭时 stop，防旧弹簧跟新手势或 exit 动画抢
  // transform。finished.then 里以「ref 仍指向自己」判定自然收敛（stop 后 resolve 但 ref
  // 已换/已清，跳过清 inline）。
  const springControlsRef = useRef<ReturnType<typeof animate> | null>(null);
  // 拖拽 dismiss 的带速滑出动画句柄：滑出期间 startDrag 早退（不接管正在离场的 sheet），
  // finished 后才 onOpenChange(false)。open effect / cleanup 时兜底 stop。
  const exitControlsRef = useRef<ReturnType<typeof animate> | null>(null);
  const cancelSpringBack = () => {
    springControlsRef.current?.stop();
    springControlsRef.current = null;
  };
  useEffect(() => {
    if (!open) {
      cancelSpringBack();
      exitControlsRef.current?.stop();
      exitControlsRef.current = null;
    }
  }, [open]);
  // enter 升起：从视口底外弹簧到原位（时长读 token --spring-sheet-duration——近瞬时档
  // 120ms 带 bounce 0.12；页内放慢该变量即探针的确定性升起窗口）。useLayoutEffect：
  // Radix Portal 挂载 → contentNode state 化 → 同一 commit paint 前置起点
  // （translateY(视口高)），防首帧闪终态。reduced-motion 直接置终态（CSS 站点级兜底
  // 管不到 JS 驱动动画）。
  useLayoutEffect(() => {
    const el = contentNode;
    if (!el || !open) return;
    if (prefersReducedMotion()) {
      el.style.transform = "";
      return;
    }
    const y0 = window.innerHeight;
    el.style.transform = `translateY(${y0}px)`;
    const tokenMs = Number.parseFloat(
      getComputedStyle(el).getPropertyValue("--spring-sheet-duration"),
    );
    const controls = animate(
      el,
      { y: [y0, 0] },
      {
        type: "spring",
        bounce: ENTER_BOUNCE,
        duration: Number.isFinite(tokenMs) && tokenMs > 0 ? tokenMs / 1000 : SPRING_SHEET_ENTER_S,
      },
    );
    enterControlsRef.current = controls;
    enterPlayingRef.current = true;
    controls.finished.then(
      () => {
        if (enterControlsRef.current === controls) {
          enterControlsRef.current = null;
          enterPlayingRef.current = false;
          el.style.transform = "";
        }
      },
      () => {},
    );
    return () => {
      controls.stop();
      if (enterControlsRef.current === controls) enterControlsRef.current = null;
      enterPlayingRef.current = false;
    };
  }, [contentNode, open]);
  // 接管时的视觉续接基点：= enter 升起中 motion 冻结的 inline 偏移（stop 不回未变换
  // 位置，视觉顶不变——CSS 时代「cancel 回未变换位置取差」随 motion 驱动画句号）。
  // inline 一律写 base + dy（animate from the presentation value）；enter 播完后接管
  // frozenY=0 → base=0。endDrag 归零。
  const dragBaseRef = useRef(0);

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
      }
    };
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      el.removeEventListener("touchmove", onTouchMove);
      // 拖拽中断（DOM 卸载）时状态机归位 + 弹簧取消，防下一次打开残留状态/rAF。
      dragRef.current = { phase: "idle" };
      cancelSpringBack();
      exitControlsRef.current?.stop();
      exitControlsRef.current = null;
    };
  }, [contentNode]);

  // 回弹 = 临界阻尼弹簧从**当前视觉位置** + 手指松手窗口速度回 0（velocity handoff：
  // 快甩带速下冲过冲再收回、慢拖平滑收回）。物理由 motion 积分（bounce 0 + duration
  // 0.3 = 临界阻尼；velocity 单位 units/s → px/ms ×1000）；起点显式读 computed transform
  // 的 m42（presentation value）。拖拽再接管/关闭时经 cancelSpringBack stop；自然收敛后
  // 清 inline 交还 Radix 动画（stop 场景 ref 已换，then 跳过清 inline）。
  const springBack = (el: HTMLDivElement, v0: number) => {
    cancelSpringBack();
    // reduced-motion：瞬时归位（清 inline 回原位），不播弹簧。
    if (prefersReducedMotion()) {
      el.style.transform = "";
      return;
    }
    const x0 = new DOMMatrixReadOnly(getComputedStyle(el).transform).m42;
    const controls = animate(
      el,
      { y: [x0, 0] },
      {
        type: "spring",
        bounce: v0 >= MOMENTUM_VELOCITY_PX_MS ? MOMENTUM_BOUNCE : 0,
        duration: SPRING_RESPONSE_S,
        velocity: Math.max(0, v0) * 1000,
      },
    );
    springControlsRef.current = controls;
    controls.finished.then(
      () => {
        if (springControlsRef.current === controls) {
          el.style.transform = "";
          springControlsRef.current = null;
        }
      },
      () => {},
    );
  };

  // pending 期失联清理：pending 未 capture，指针移出 Content 后 move/up 都收不到——
  // 残留 pending 会把**后续无关手势**（如点击其它按钮时 Playwright/真人的前置 move）
  // 判成「down 点 → 当前位置」的拖拽起点，瞬间把 sheet 拖走。pending 期间（capture 前）
  // 指针离开边界即放弃手势；dragging 期有 capture（leave 被抑制），不受影响。
  const abandonPending = () => {
    if (dragRef.current.phase === "pending") {
      dragRef.current = { phase: "idle" };
    }
  };

  const startDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!(e.target instanceof Element)) return;
    // 带速滑出进行中不接管（200-300ms 窗口，正在离场的 sheet 不再响应抓取）。
    if (exitControlsRef.current) return;
    // 起手面分档（真机取证定的根因：enter 升起播完后手指落在内容区被窄热区拒绝，而人
    // 「打开→按下拖」的反应必然超过 enter 时长——取证时为 450ms，现 120ms 近瞬时档下
    // 「播完后分档」是主路径）：①enter 升起中内容尚未就位无交互意义，整个 Content 可起
    // 拖；②播完后按内容可滚性分——不可滚（菜单/确认框/prompt 等大多数）整个 Content 可
    // 起拖，可滚（历史/文件/实例信息）维持 grab/shd 窄热区保住列表原生滚动。向下才接管
    //（moveDrag 判方向），点按与向上滑不受影响。exit 期间（data-state=closed）不放宽。
    const enterPlaying = enterPlayingRef.current;
    const zone = e.target.closest(".grab") ? "grab" : e.target.closest(".shd") ? "shd" : "content";
    if (zone === "content" && !enterPlaying && hasScrollableContent(e.currentTarget)) {
      return;
    }
    dragRef.current = { phase: "pending", startY: e.clientY, pointerId: e.pointerId };
  };

  const moveDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (d.phase === "idle") return;
    if (d.phase === "pending") {
      const dy = e.clientY - d.startY;
      if (dy <= -DRAG_START_PX) {
        // 向上滑过阈值 = 滚动/选择意图，放弃手势（回 idle 后 touchmove 不再 prevent）。
        dragRef.current = { phase: "idle" };
        return;
      }
      if (dy <= DRAG_START_PX) return;
      // 越过起步阈值才接管：capture 后续 pointer（click 合成改落 capture 元素，热区按钮
      // 的小位移点击不受影响）。inline transform 接管期间清 transition 保证跟手。
      e.currentTarget.setPointerCapture(d.pointerId);
      // 弹簧回弹途中再抓住 = 从当前位置重新接管（可中断，apple-design §3）。
      cancelSpringBack();
      dragRef.current = {
        phase: "dragging",
        startY: d.startY,
        pointerId: d.pointerId,
        dy,
        samples: [{ y: e.clientY, t: e.timeStamp }],
      };
      // enter 运行期接管：motion stop 后元素**冻结在当前 inline 值**（不回未变换位置，
      // 视觉顶不变）。base = 冻结偏移，inline = base + dy =「动画偏移 + 手指自 down 的
      // 全量位移」——与 CSS 时代 base+dy 语义一致（enter 播完后 frozenY=0 → base=0，
      // dy 多少移多少，接管步位移不丢；升起中段 frozenY>0 → 从停止点续跟，接管瞬间
      // 只跳 dy≤起步阈值的小位移，比 CSS 时代 cancel 回 0 再跳 base+dy 小得多）。
      // stop 即死无重建面（§21 防线随之退役）。
      const el = e.currentTarget;
      const frozenY = new DOMMatrixReadOnly(getComputedStyle(el).transform).m42;
      enterControlsRef.current?.stop();
      enterControlsRef.current = null;
      enterPlayingRef.current = false;
      dragBaseRef.current = frozenY;
      el.style.transition = "";
      // 与跟手/矫正写入同式（visualDragY）：dy 在起步阈值~视口高内恒等，超界单事件
      // （快速甩动的大 gap）下 rubber-band 即时生效，不会先 paint 一帧未阻尼超界值。
      el.style.transform = `translateY(${dragBaseRef.current + visualDragY(dy, window.innerHeight)}px)`;
      // motion stop 的「最后一写」：stop 时已在 rAF 队列中的回调仍会执行一次，把 inline
      // 从「接管写入的 frozenY+dy」覆盖回 motion 轨迹值（实测 60.24 → 46.47，倒退 ~14px）。
      // 矫正写入注册于同帧 rAF（注册序晚于 motion 已排队的回调）→ 执行序在后 → paint 前
      // 最后写入生效，同帧矫正零跳变。phase 仍是 dragging 才矫正（松手/关闭的 transform
      // 已归回弹/exit 路径管，不抢）。
      requestAnimationFrame(() => {
        const d2 = dragRef.current;
        if (d2.phase === "dragging" && !springControlsRef.current && !exitControlsRef.current) {
          el.style.transform = `translateY(${dragBaseRef.current + visualDragY(d2.dy, window.innerHeight)}px)`;
        }
      });
      return;
    }
    // 判定用原始位移（可为负 = 上顶），视觉经 rubber-band 软边界（§9：上顶原位与拖过
    // 一屏渐进阻力，界内 1:1 跟手）；收起投影判定仍用原始 dy。
    const dy = e.clientY - d.startY;
    const samples = [...d.samples, { y: e.clientY, t: e.timeStamp }].slice(-8);
    dragRef.current = { ...d, dy, samples };
    e.currentTarget.style.transform = `translateY(${dragBaseRef.current + visualDragY(dy, window.innerHeight)}px)`;
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (d.phase === "idle") return;
    dragRef.current = { phase: "idle" };
    if (d.phase !== "dragging") return;
    const el = e.currentTarget;
    dragBaseRef.current = 0;
    // 松手速度 = 窗口净速度（停顿自然衰减，§2 velocity history），dismiss 投影与
    // 弹簧初速共用同一值——判定的速度与动画的速度不会分叉。
    const v = sampleVelocity(d.samples, e.timeStamp);
    const rect = el.getBoundingClientRect();
    const threshold = Math.max(DISMISS_MIN_DISTANCE_PX, rect.height * DISMISS_HEIGHT_RATIO);
    const projected = d.dy + v * DISMISS_PROJECT_MS;
    const dismiss = projected >= threshold || v >= DISMISS_VELOCITY_PX_MS;
    if (dismiss) {
      // 拖拽 dismiss 的滑出 = motion 弹簧顺松手速度滑出屏外（velocity handoff——原 CSS
      // exit 路径无初速通道，固定 200ms ease-in 不带速度信息）。到位（finished）后才
      // onOpenChange(false) 走常规 exit 卸载路径，且保留 --tw-exit-translate-y 注入（CSS
      // exit 的 to 若回落 16px 会让 sheet 从屏外闪回，必须同在屏外）。滑出期间 startDrag
      // 早退，不接管正在离场的 sheet。reduced-motion：不播滑出弹簧，直接走关闭路径
      //（exit CSS 本身已被站点级兜底压为瞬时）。
      if (prefersReducedMotion()) {
        el.style.transform = "";
        onOpenChangeRef.current(false);
        return;
      }
      const curY = new DOMMatrixReadOnly(getComputedStyle(el).transform).m42;
      const targetY = window.innerHeight - rect.top + DISMISS_SLIDE_PAST_PX;
      exitControlsRef.current = animate(
        el,
        { y: [curY, targetY] },
        { type: "spring", bounce: 0, duration: 0.3, velocity: Math.max(0, v) * 1000 },
      );
      exitControlsRef.current.finished.then(
        () => {
          exitControlsRef.current = null;
          el.style.setProperty(
            "--tw-exit-translate-y",
            `${window.innerHeight - rect.top + DISMISS_SLIDE_PAST_PX}px`,
          );
          onOpenChangeRef.current(false);
        },
        () => {},
      );
      return;
    }
    // 回弹：弹簧从当前视觉位置 + 松手窗口速度积分回 0（速度继承），收敛后清 inline 交还
    // Radix 动画；拖拽再接管 / 关闭时经 cancelSpringBack 取消。
    // 回弹：弹簧从当前视觉位置 + 松手窗口速度积分回 0。**向上残余速度钳为 0**——拖拽期
    // dy 已 clamp ≥0（sheet 不能高于原位），回弹若携带向上初速会让弹簧越过原位再垂落
    //（「弹过头又掉下来」的果冻感，越顶与拖拽期的硬边界自相矛盾）；向下残余速度 = 惯性
    // 保留，其幅度已被投影判定限制（能进 bounce 的 v 都不足收起阈值，下冲 <1px）。
    // 向上残余速度的钳 0 在 springBack 内部（velocity 传入前）。
    springBack(el, v);
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
            // enter（全程升起）= motion 弹簧驱动（见 useLayoutEffect：近瞬时档 120ms
            // 读 token --spring-sheet-duration，带 bounce 0.12，升起途中不透明、dim 交
            // scrim）。CSS enter 类串已移除；exit keyframes（inline transform 作起点）
            // 与 fill-mode-forwards 不动——关闭路径仍是 CSS。
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-bottom-4 data-[state=closed]:[--tw-animation-duration:var(--duration-exit)] data-[state=closed]:fill-mode-forwards",
          )}
          onPointerCancel={endDrag}
          onPointerDown={startDrag}
          onPointerLeave={abandonPending}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          /* 打开不自动聚焦（2026-10-04 用户拍板）：sheet 升起动画与软键盘同时唤起互相
             打架（键盘推挤视口打断动画），且这类输入（搜索/命名/表单）低频——聚焦应是
             用户点输入框的主动行为。统一在基座拦 Radix 的 initial focus（内容首元素
             恰为输入框时会被默认聚焦，如切换 sheet 搜索框/MCP 添加名称框），消费方
             显式 autoFocus 也一并失效；关闭焦点返还（onCloseAutoFocus）不受影响。
             桌面居中 Dialog（ui/dialog.tsx）无键盘推挤问题，保持默认聚焦不动。 */
          onOpenAutoFocus={(e) => e.preventDefault()}
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
