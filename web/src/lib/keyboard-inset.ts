/**
 * 键盘 inset 观察器（批 17）：iOS 键盘是 overlay——只缩 visual viewport、不动 layout
 * viewport（WebKit 141832 intentional），CSS/meta 全线无法让 iOS 布局让位（证伪表见
 * docs/research/claude-ios-keyboard-viewport.md），JS visualViewport 是 iOS 唯一可靠路径。
 *
 * 本文件是 composer 键盘避让（useComposerKeyboardAvoidance，2026-09 批 8 落地）与编辑态
 * 面板避让（useKeyboardInsetGlobal）共享的单点监听器；公式语义逐字保持原 hook：
 * - resize + scroll 双监听（键盘动画收尾 scroll 仍 fire，保证 offset 准确）+ window
 *   resize（横竖屏切换重算）+ focusin/focusout 补测（批 18：键盘开合必经焦点切换，iOS
 *   快速连续开合时 vv 事件可能合并丢失终态，focus 变化补一次测量兜底。measure 延迟到
 *   rAF 同帧读当帧 vv——常规开合当帧未动 = 幂等写回；终态事件合并丢失时当帧 vv 已
 *   到位 = 顺带恢复）；
 * - requestAnimationFrame 与浏览器布局同帧（兜 iOS 关键盘一帧 visualViewport 不一致，
 *   无魔数超时）；
 * - visible = vv.height < innerHeight 判定 + 关闭时强制归零，绕 iOS 26 layout scroll
 *   不复位的残留；
 * - 焦点门闩（2026-10-25 真机 8 样本）：无 editable 聚焦时 inset 强制 0——iOS 键盘
 *   只可能在 editable 聚焦时在场，加载/回前台/焦点切换的过期 vv 采样（settle 量到
 *   过渡值且终态事件永远不来 → composer 抬高卡死）与捏合缩放在此归零；
 * - 后台冻结语义（2026-10-19）：隐藏态不排队测量（rAF 被挂起、恢复瞬态帧才执行会量到
 *   错误的 vv），回前台由 visibilitychange 统一重测 + 短窗复核——后台→前台丢事件/瞬态
 *   采样不再留下过期 offset（composer 被抬高卡住）；
 * - 短窗复核（init / 回前台 / focusin / focusout 共用，SETTLE_WINDOW_MS 每帧重测）：
 *   这些时刻的 vv 处于过渡态（启动、恢复、键盘开合动画），而终态 vv 事件可能丢失——
 *   单点采样会把动画中间值当终态写入并卡住（2026-10-19 一手数据：focusout 采到
 *   vv=510 写 off=334，键盘收起后终态事件未到）；
 * - 桌面硬件键盘不改变 visualViewport，pointer: coarse 显式 guard 拦截极少数 viewport
 *   抖动误触发；SSR / 无 visualViewport 环境 no-op。
 *
 * apply 的第二参 source 标注本次计算的触发源（原真机取证通道 keyboard-debug.ts 已随
 * 批 18 取证收口删除；composer 调用点不接该参数，签名向后兼容保留）。
 *
 * 不要用 window.scrollTo 对抗 visual-viewport pan：body 被 pin 时 document scroll 本就
 * 是 0，碰不到 pan 轴，逐帧对抗只抖动（mobile-keyboard.ts 时代失败的原因）。
 */

export type KeyboardInset = { offsetPx: number; visible: boolean };

export type KeyboardInsetSource =
  | "init"
  | "init-settle"
  | "visible"
  | "visible-settle"
  | "focusin-settle"
  | "focusout-settle"
  | "vv-resize"
  | "vv-scroll"
  | "win-resize"
  | "focusin"
  | "focusout";

/**
 * 短窗复核时长（init / 回前台 / 焦点切换共用）：单点采样会踩瞬态 vv——页面挂载、
 * 后台恢复、键盘开合动画期间 vv 尚在过渡；而终态 vv 事件可能丢失（2026-10-19
 * composer 抬高 bug 一手数据：focusout 在键盘收回动画中采到 vv=510 写 off=334，终态
 * 事件未到 → 键盘已收起 composer 却卡在抬高态）。窗口内每帧重测幂等写回，vv 稳定后
 * 自然写正（正常路径同值写入无可观测副作用）。
 */
const SETTLE_WINDOW_MS = 800;

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
 * 监听键盘 inset 变化，回调携带 { offsetPx, visible } 与触发源。返回清理函数（桌面 / 无
 * visualViewport 环境返回 no-op）。回调首调同步执行（与浏览器布局对齐一次基线，source
 * = "init"）。
 */
export function observeKeyboardInset(
  apply: (inset: KeyboardInset, source: KeyboardInsetSource) => void,
): () => void {
  const vv = window.visualViewport;
  if (!vv) return () => {};
  if (!window.matchMedia("(pointer: coarse)").matches) return () => {};

  const measure = (): KeyboardInset => {
    // 焦点不变式（2026-10-25 真机 8 样本实锤）：iOS 键盘只可能在 editable 聚焦时在场。
    // 无 editable 聚焦时 vv 缩小只可能是加载/恢复过渡态或捏合缩放，inset 必为 0——
    // 冻结恢复/键盘动画的过期「键盘可见」采样在此强制归零，不再依赖后续 vv 事件纠正
    // （真机证明那些事件可能永远不来：8 样本 src 全是 settle 源、focus 全是 BODY、
    // var 334-351px 卡死 24s-118s 无自愈）。所有写入路径（init/settle/事件/focusin-out）
    // 都过 measure，此门闩单点收口；附带修复捏合缩放误抬 composer 与 --kb-active 误激活。
    // 残余（记档不修）：editable 聚焦期间 vv 冻结在 shrunk 值——gate 无法辨别（焦点合法），
    // 下次焦点变化或 bg/fg 循环自愈；8 样本无此形态。
    const el = window.document.activeElement;
    const editable =
      el instanceof window.HTMLElement &&
      (el.tagName === "TEXTAREA" || el.tagName === "INPUT" || el.isContentEditable);
    if (!editable) return { offsetPx: 0, visible: false };
    return computeKeyboardInset(vv.height, vv.offsetTop, window.innerHeight);
  };
  // rAF id 记录：dispose 取消已入队回调（rAF 不可撤销注册只能 cancel）——否则 cleanup
  // （调用方归零 CSS 变量）后仍残留一次写入（design review 批 17 P2；原 composer hook 同病，
  // 单源化时一并修）；连续事件时顺带合并同帧重复入队。source 记最后触发者（同帧合并时
  // 以最后事件为准）。
  let rafId = 0;
  let pendingSource: KeyboardInsetSource = "init";
  const schedule = (source: KeyboardInsetSource) => {
    // 后台期间的 vv 事件不排队：rAF 在隐藏态被挂起，回调会推迟到回前台执行——那一帧
    // 量到的是「恢复瞬态」（vv 尚未复位），正是 composer 被抬高的来源（2026-10-19
    // 用户稳定复现：前台正常 → 后台 → 回前台被抬高，角标 src=vv-resize）。回前台由
    // visibilitychange 统一重测 + 短窗复核（下）兜底，无需消费隐藏期事件。
    if (document.visibilityState === "hidden") return;
    pendingSource = source;
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => apply(measure(), pendingSource));
  };
  // add/remove 必须同一函数引用（箭头函数每次求值都是新引用，remove 会静默失效）。
  const onVvResize = () => schedule("vv-resize");
  const onVvScroll = () => schedule("vv-scroll");
  const onWinResize = () => schedule("win-resize");
  // 焦点切换 = 键盘开合动画起点：动画期间 vv 是过渡值，且终态 vv 事件可能丢失——
  // 单点测量会把动画中间值当成终态（off=334 vs 实际 0）。补短窗复核吸收整个动画。
  const onFocusIn = () => {
    schedule("focusin");
    startSettle("focusin-settle");
  };
  const onFocusOut = () => {
    schedule("focusout");
    startSettle("focusout-settle");
  };

  // 短窗复核（每帧重测幂等写回，正常态同值无副作用、零可观测变化）：用于吸收
  // 「采样踩瞬态」类时序——窗口结束时终态值（若与已写值不同即为修正）必然生效。
  let settleRafId = 0;
  let settleStartedAt = 0;
  let settleSource: KeyboardInsetSource = "init-settle";
  const settleLoop = () => {
    apply(measure(), settleSource);
    if (performance.now() - settleStartedAt < SETTLE_WINDOW_MS) {
      settleRafId = requestAnimationFrame(settleLoop);
    }
  };
  const startSettle = (source: KeyboardInsetSource) => {
    settleSource = source;
    settleStartedAt = performance.now();
    cancelAnimationFrame(settleRafId);
    settleLoop();
  };

  // 回前台：无条件重测 + 短窗复核。后台冻结期间 vv 事件可能全部丢失、或 rAF 在
  // 恢复瞬态帧才跑——只靠事件驱动会留下过期 offset（无后续事件纠正 = 抬高卡住）。
  // 转隐藏时作废已排队的测量/复核：它们会在恢复瞬态帧才执行，量到的 vv 不可信。
  const onVisibilityChange = () => {
    if (document.visibilityState !== "visible") {
      cancelAnimationFrame(rafId);
      cancelAnimationFrame(settleRafId);
      return;
    }
    schedule("visible");
    startSettle("visible-settle");
  };

  vv.addEventListener("resize", onVvResize);
  vv.addEventListener("scroll", onVvScroll);
  window.addEventListener("resize", onWinResize);
  window.addEventListener("focusin", onFocusIn);
  window.addEventListener("focusout", onFocusOut);
  document.addEventListener("visibilitychange", onVisibilityChange);
  apply(measure(), "init");
  startSettle("init-settle");

  return () => {
    cancelAnimationFrame(rafId);
    cancelAnimationFrame(settleRafId);
    vv.removeEventListener("resize", onVvResize);
    vv.removeEventListener("scroll", onVvScroll);
    window.removeEventListener("resize", onWinResize);
    window.removeEventListener("focusin", onFocusIn);
    window.removeEventListener("focusout", onFocusOut);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}
