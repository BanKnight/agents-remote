/**
 * viewport 收缩补偿（Android pad 布局收窄第三套修法，2026-11-27）。
 *
 * 背景（layout-geometry-diag 两轮 Android pad 真机取证）：PWA standalone 下 IME 随
 * editable 焦点进出瞬时占位 ~59px（不可见、2-3 秒自愈），layout viewport
 * （documentElement.clientHeight / innerHeight）跟着缩 → CSS 的 100vh 基线缩 →
 * 整页布局收窄、底部露白。meta（interactive-widget）管不了它（standalone 窗口的
 * layout 缩不受该语义控制，真机已证）。
 *
 * 第二套修法（JS 钉死 --app-viewport-height 为 px 基线）Android 有效但伤了 iPhone：
 * 它在常态（无占位发生）就向所有平台写入 inline px，而 clientHeight 在 iPhone 的
 * 语义从未验证（疑似扣 chin → composer 被抬高两倍 safe area，真机实锤后已回滚）。
 *
 * 本方案「收缩补偿」：**常态零写入**——
 * - 基线由启动/回前台的 settle 短窗建立（SETTLE_WINDOW_MS 对齐 keyboard-inset 先例，
 *   吸收两平台启动/恢复过渡态；窗口结束前事件路径不动，CSS 默认值原样顶住）；
 * - resize 时 cvh **变小且宽度不变**（IME 占位指纹：占位只能缩高不可能改宽）→ 写
 *   `--viewport-shrink: 差值px`，布局 = calc(100vh + shrink) 把被吞掉的高度加回来；
 * - cvh 恢复/变大/宽度变化（旋转、分屏、窗口调整）→ 清 shrink + 重定基线，回归
 *   CSS 正常跟随；
 * - iPhone 上 cvh 永不缩（iOS 键盘只缩 visual viewport）→ shrink 永不触发 → 全程
 *   CSS 逐字节原样，写入路径对 iOS 是死代码——这是对第二套修法的核心修正。
 * 只写差值不写绝对值：基线自身的语义偏差（如扣 chin）在差值里抵消，且恢复即清零，
 * 不留常态偏移。
 *
 * ⚠️ 补偿方向必须是加法（2026-11-27 真机实锤的修正）：vh/dvh **都锚定 layout
 * viewport**——占位时 calc 基准（100vh/100dvh）自身已缩（dvh 709→650），减法
 * `calc(100dvh - 59px)` = 650−59 = 591 = 双倍扣（首版如此，main 比常态矮 119px）；
 * 加法 `calc(100dvh + 59px)` = 650+59 = 709 才钉回原高。此前「绝对 px 钉死」方案
 * Android 有效正因绝对值不依赖 vh。教训：凡以视口单位为基准的补偿，先确认基准
 * 自身是否随目标状态变化，再定加减方向。
 *
 * 真实软键盘（大幅持续缩高）同样被钉住——与 iOS 现状同构：键盘让位交 keyboard-inset
 * 的 JS 路径（--kb-offset / --composer-keyboard-offset），流内布局不承担让位职责。
 *
 * 已知取舍（2026-11-27 真机 sb 字段实锤后定案）：钉住的代价 = 占位期间 document
 * 底部 shrink 高度在视口外——WorkbenchShell 底部 .sbar（「已连接」28px）+ composer
 * 底部暂时不可见/不可点，操作（焦点/IME 变化）后随自愈弹回（sb=777/805 vs cvh=746
 * 实锤整条出视口；wt=0/0 排除窗口下压、st=0 排除 reveal 滚动）。
 * .sbar 出视口用户反馈困扰度超预期（「还是一样出现」）→ 翻案实施占位窗口期
 * .sbar fixed 贴视口底（SHRINK_ACTIVE_CLASS + v2-primitives.css 占位窗口段）：状态
 * 栏全程可见，代价 = composer 底部 28px 短暂被盖（发送钮占位窗口期可能需二次
 * 点击）。仍不可行的方案记档：inputmode=none 无法区分外接键盘/触屏（禁软键盘
 * 输入）、不钉 = 回到整页收窄原问题（状态栏上提 + 底部露白，当初报丑）。
 * document 溢出的另一面：浏览器焦点 reveal 可能把 document 滚出一条——overflow:
 * clip 可锁但会同时锁掉 iOS scroll-to-reveal 兜底（TUI composer 唯一避让路径），
 * 牵连不做；启动 settle 窗口内恰逢占位会把占位值当基线（漏钉一次，退化原样，无害）。
 * 桌面（pointer: fine）不启用——鼠标拖矮窗口是正常缩高，必须跟随。
 */
const SETTLE_WINDOW_MS = 800;

/** 占位窗口期 root class：CSS 侧据此把 .sbar 贴视口底（保「已连接」可见），见
 *  v2-primitives.css 占位窗口段与头注释「已知取舍」。 */
export const SHRINK_ACTIVE_CLASS = "viewport-shrink-active";

export function installViewportShrinkSync(opts: { settleWindowMs?: number } = {}): () => void {
  if (!window.matchMedia("(pointer: coarse)").matches) return () => {};
  const settleWindowMs = opts.settleWindowMs ?? SETTLE_WINDOW_MS;
  const root = document.documentElement;
  let baselineH = 0;
  let baselineW = 0;
  let ready = false;
  let rafId = 0;
  let settleStartedAt = 0;

  const writeShrink = (px: number) => {
    if (px > 0) {
      root.style.setProperty("--viewport-shrink", `${px}px`);
      root.classList.add(SHRINK_ACTIVE_CLASS);
    } else {
      root.style.removeProperty("--viewport-shrink");
      root.classList.remove(SHRINK_ACTIVE_CLASS);
    }
  };

  // settle 短窗：每帧只采样不定基线——窗口结束的值作基线（启动/回前台过渡态吸收）。
  const settleLoop = () => {
    baselineH = root.clientHeight;
    baselineW = window.innerWidth;
    if (performance.now() - settleStartedAt < settleWindowMs) {
      rafId = requestAnimationFrame(settleLoop);
      return;
    }
    ready = true;
  };
  const startSettle = () => {
    ready = false;
    settleStartedAt = performance.now();
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(settleLoop);
  };

  const measure = () => {
    if (!ready) return;
    const h = root.clientHeight;
    const w = window.innerWidth;
    if (h < baselineH && w === baselineW) {
      // IME 占位指纹：同宽度纯缩高 → 补偿差值，布局钉回原高。
      writeShrink(baselineH - h);
      return;
    }
    // 恢复 / 变大 / 宽度变化（旋转、分屏、窗口调整）→ 回 CSS 原样 + 重定基线。
    writeShrink(0);
    baselineH = h;
    baselineW = w;
  };
  const schedule = () => {
    // settle 吸收窗口内的事件（settle 每帧全量采样，且 cancel 会打断 settle 循环）。
    if (!ready) return;
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(measure);
  };
  // 回前台：清补偿 + settle 重测基线——后台期间系统可能改了窗口形态（分屏/折叠），
  // 后台期事件可能全部丢失（rAF 挂起语义，keyboard-inset 同款）。
  const onVisibility = () => {
    if (document.visibilityState === "hidden") {
      cancelAnimationFrame(rafId);
      return;
    }
    writeShrink(0);
    startSettle();
  };

  const onResize = () => schedule();
  const vv = window.visualViewport;
  window.addEventListener("resize", onResize);
  vv?.addEventListener("resize", onResize);
  document.addEventListener("visibilitychange", onVisibility);
  startSettle();

  return () => {
    cancelAnimationFrame(rafId);
    window.removeEventListener("resize", onResize);
    vv?.removeEventListener("resize", onResize);
    document.removeEventListener("visibilitychange", onVisibility);
    writeShrink(0);
  };
}
