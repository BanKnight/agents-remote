/**
 * 布局几何诊断通道（问题 3「操作会话面板后整个布局高度收窄」取证，2026-11-26）。
 * 背景：Android pad PWA + 外接键盘（无软键盘）场景下，点终端快捷键条/会话面板后
 * 布局整体收窄、底部露白；左栏/右栏操作不触发。候选层切分（一行六字段全覆盖）：
 *   L1 app 高度链（main rect 高）是否跟随收窄
 *   L2 layout viewport（documentElement.clientHeight）——interactive-widget=
 *      resizes-content 的生效面：缩了 = IME 占位触发了 layout 缩（Android 特有，
 *      vh 单位跟随 layout viewport → 100vh 基线也缩；iOS 键盘不缩 layout viewport，
 *      同一套 vh 基线两平台语义不同）
 *   L3 visual viewport（height/offsetTop/scale）——zoom（scale≠1）或 resizes-visual 面
 *   L4 --app-viewport-height computed 值——CSS 基线实况（vh vs dvh 解析）
 * 事件签名（ih/cvh/vv/main/ae 六字段）同值跳过——环形缓冲仅 24 行，防刷屏冲掉
 * 复现序列。开关关闭时不做任何测量（diag-log「关 = 调用方审计计算一并 gate」契约）。
 * 取证收口后随本文件一起摘除（sheet-debug 先例）。
 */
import { isDiagEnabled, recordDiag } from "./diag-log";

const SCOPE = "layout";

/** 活动元素标签（ae 字段）：tag + id 前缀，识别 focus 落点（xterm textarea / composer input / button）。 */
function activeElementTag(): string {
  const el = document.activeElement;
  if (!(el instanceof HTMLElement)) return "null";
  return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}`;
}

/** 一行几何快照（六字段，紧凑单行——环形缓冲 24 行约束）。 */
function snapshotLine(ev: string): string {
  const vv = window.visualViewport;
  const main = document.querySelector("main");
  const m = main?.getBoundingClientRect();
  const avh = getComputedStyle(document.documentElement)
    .getPropertyValue("--app-viewport-height")
    .trim();
  return (
    `ev=${ev} ae=${activeElementTag()}` +
    ` ih=${Math.round(window.innerHeight)}` +
    ` cvh=${document.documentElement.clientHeight}` +
    ` vv=${vv ? `${Math.round(vv.height)}/${Math.round(vv.offsetTop)}/${vv.scale.toFixed(2)}` : "none"}` +
    ` main=${m ? Math.round(m.height) : "none"}` +
    ` avh=${avh || "unset"}`
  );
}

/** 变化检测签名（数值取整到 px、vv.height ×100 保留两位精度）。 */
function signature(): string {
  const vv = window.visualViewport;
  const main = document.querySelector("main");
  const m = main?.getBoundingClientRect();
  return [
    Math.round(window.innerHeight),
    document.documentElement.clientHeight,
    vv ? Math.round(vv.height * 100) : 0,
    vv ? Math.round(vv.offsetTop) : 0,
    vv ? Math.round(vv.scale * 100) : 0,
    m ? Math.round(m.height) : 0,
    document.activeElement?.tagName ?? "null",
  ].join("|");
}

export function installLayoutGeometryDiag(): () => void {
  const vv = window.visualViewport;
  if (!vv) return () => {};

  let rafId = 0;
  let lastSig = "";

  const schedule = (ev: string) => {
    if (!isDiagEnabled() || document.visibilityState === "hidden") {
      // 关闭期清签名：重新打开后首帧必然落一条（不丢复现起点）。
      lastSig = "";
      return;
    }
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      const sig = signature();
      if (sig === lastSig) return;
      lastSig = sig;
      recordDiag(SCOPE, snapshotLine(ev));
    });
  };

  const onWinResize = () => schedule("win-resize");
  const onVvResize = () => schedule("vv-resize");
  const onVvScroll = () => schedule("vv-scroll");
  const onFocusIn = (event: FocusEvent) => {
    const el = event.target;
    schedule(`focusin:${el instanceof HTMLElement ? el.tagName.toLowerCase() : "?"}`);
  };
  const onFocusOut = (event: FocusEvent) => {
    const el = event.target;
    schedule(`focusout:${el instanceof HTMLElement ? el.tagName.toLowerCase() : "?"}`);
  };
  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") schedule("visible");
  };

  window.addEventListener("resize", onWinResize);
  vv.addEventListener("resize", onVvResize);
  vv.addEventListener("scroll", onVvScroll);
  window.addEventListener("focusin", onFocusIn);
  window.addEventListener("focusout", onFocusOut);
  document.addEventListener("visibilitychange", onVisibilityChange);
  recordDiag(
    SCOPE,
    `init dpr=${window.devicePixelRatio} screen=${window.screen.width}x${window.screen.height}` +
      ` avh=${getComputedStyle(document.documentElement).getPropertyValue("--app-viewport-height").trim() || "unset"}`,
  );
  schedule("init");

  return () => {
    cancelAnimationFrame(rafId);
    window.removeEventListener("resize", onWinResize);
    vv.removeEventListener("resize", onVvResize);
    vv.removeEventListener("scroll", onVvScroll);
    window.removeEventListener("focusin", onFocusIn);
    window.removeEventListener("focusout", onFocusOut);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}
