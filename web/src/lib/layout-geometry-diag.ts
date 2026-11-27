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
 *   L5 st=documentElement.scrollTop / wt=window.screenY 与 html rect top——页面被滚与
 *      窗口被系统下压的判别（收缩补偿批残余现象「状态栏文字看不见」取证）
 *   L6 sb=.sbar rect top/bottom/height——「已连接」状态栏（WorkbenchShell 底部 28px）
 *      自身几何：占位期间被裁出视口（bottom > cvh）vs 悬空（top > 视口内）的直接判别
 * 事件签名（ih/cvh/vv/st/wt/main/ae 字段）同值跳过——环形缓冲仅 24 行，防刷屏冲掉
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

/** 一行几何快照（紧凑单行——环形缓冲 24 行约束）。 */
function snapshotLine(ev: string): string {
  const vv = window.visualViewport;
  const main = document.querySelector("main");
  const m = main?.getBoundingClientRect();
  const sbar = document.querySelector(".sbar")?.getBoundingClientRect();
  const avh = getComputedStyle(document.documentElement)
    .getPropertyValue("--app-viewport-height")
    .trim();
  return (
    `ev=${ev} ae=${activeElementTag()}` +
    ` ih=${Math.round(window.innerHeight)}` +
    ` cvh=${document.documentElement.clientHeight}` +
    ` vv=${vv ? `${Math.round(vv.height)}/${Math.round(vv.offsetTop)}/${vv.scale.toFixed(2)}` : "none"}` +
    ` st=${document.documentElement.scrollTop}` +
    ` wt=${Math.round(window.screenY ?? 0)}/${Math.round(document.documentElement.getBoundingClientRect().top)}` +
    ` main=${m ? Math.round(m.height) : "none"}` +
    ` sb=${sbar ? `${Math.round(sbar.top)}/${Math.round(sbar.bottom)}/${Math.round(sbar.height)}` : "none"}` +
    ` avh=${avh || "unset"}`
  );
}

/** 变化检测签名（数值取整到 px、vv.height ×100 保留两位精度）。 */
function signature(): string {
  const vv = window.visualViewport;
  const main = document.querySelector("main");
  const m = main?.getBoundingClientRect();
  const sbar = document.querySelector(".sbar")?.getBoundingClientRect();
  return [
    Math.round(window.innerHeight),
    document.documentElement.clientHeight,
    vv ? Math.round(vv.height * 100) : 0,
    vv ? Math.round(vv.offsetTop) : 0,
    vv ? Math.round(vv.scale * 100) : 0,
    document.documentElement.scrollTop,
    Math.round(window.screenY ?? 0),
    Math.round(document.documentElement.getBoundingClientRect().top),
    m ? Math.round(m.height) : 0,
    sbar ? Math.round(sbar.top) : 0,
    sbar ? Math.round(sbar.bottom) : 0,
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
  // document 自身滚动（焦点 reveal / UA 滚动把页面滚出一条——占位溢出取证关键字段）。
  const onDocScroll = () => schedule("doc-scroll");
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
  window.addEventListener("scroll", onDocScroll);
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
    window.removeEventListener("scroll", onDocScroll);
    window.removeEventListener("focusin", onFocusIn);
    window.removeEventListener("focusout", onFocusOut);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}
