import { useEffect } from "react";

import { observeKeyboardInset } from "./keyboard-inset";

/**
 * 【临时诊断件——composer 抬高 bug 取证用（2026-10-19 复发后第二次埋点）】
 *
 * 第一次埋点只记录 observer 回调里 off > 0 的样本，漏掉了关键信息：抬高态可能
 * **没有任何 observer 回调**（过期 offset 写入后事件全无），且无法区分「vv 真的
 * 小于 innerHeight」与「vv 恢复但 CSS 变量残留」。本次埋点补齐：
 * 1. **心跳**（1s）：即使无事件，也每秒比对 vv / CSS 变量 / 焦点 / composer 位置，
 *    状态签名变化即记录——抬高发生的那一刻必然被捕获。
 * 2. 每帧样本记录 **实际消费值**：`--composer-keyboard-offset` 的 computed 值、
 *    composer 浮动区 rect.bottom（抬高态直接可见）、activeElement（键盘只可能在
 *    editable 聚焦时在场）。
 * 3. 可见性 / 焦点转换后 3s 内记录全部样本（含 off=0），保留完整恢复序列。
 *
 * 常开只读角标（右上角，pointer-events-none）+ localStorage 环形 + POST
 * `/api/debug/inset-report`（服务端仅打日志）。定案后整文件拆除。
 */

const LOG_KEY = "insetDebugLog2";
const LOG_CAP = 200;
const HEARTBEAT_MS = 1000;
const TRANSITION_WINDOW_MS = 3000;
const FLUSH_DEBOUNCE_MS = 2000;

type InsetSample = {
  ts: string;
  /** 页面存活时长（ms）：抬高态若伴随 age 很小 = 回前台触发了整页重载（SW autoUpdate）。 */
  age: number;
  /** 导航类型（navigate/reload/…），重载判据的第二只证据。 */
  nav: string;
  vis: string;
  vvH: number;
  innerH: number;
  top: number;
  off: number;
  /** --composer-keyboard-offset 实际写入值（CSS 侧真身，与 off 对照可辨「变量残留」）。 */
  varOff: string;
  /** activeElement 摘要（TEXTAREA/INPUT/BODY/… + 是否 contenteditable）。 */
  focus: string;
  /** composer 浮动区 rect.bottom（抬高时显著变小）；无节点为 null。 */
  floatBottom: number | null;
  src: string;
};

const readLog = (): InsetSample[] => {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    return raw ? (JSON.parse(raw) as InsetSample[]) : [];
  } catch {
    return [];
  }
};

const writeLog = (samples: InsetSample[]): void => {
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(samples.slice(-LOG_CAP)));
  } catch {
    // 配额满 / 隐私模式：诊断能力静默降级。
  }
};

let flushing = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
/** 上报当前记录；成功只移除本次上报的条数（飞行期间新增的样本不能丢）。 */
const flushLog = (): void => {
  flushTimer = null;
  if (flushing) return;
  const samples = readLog();
  if (samples.length === 0) return;
  flushing = true;
  fetch("/api/debug/inset-report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(samples),
  })
    .then((res) => {
      if (res.ok) writeLog(readLog().slice(samples.length));
    })
    .catch(() => {})
    .finally(() => {
      flushing = false;
    });
};

const scheduleFlush = (): void => {
  if (flushTimer !== null) return;
  flushTimer = setTimeout(flushLog, FLUSH_DEBOUNCE_MS);
};

const focusSummary = (): string => {
  const el = document.activeElement;
  if (!el || el === document.body) return "BODY";
  const tag = el.tagName;
  const editable =
    el instanceof HTMLElement && (el.isContentEditable || el.getAttribute("role") === "textbox");
  return editable ? `${tag}+editable` : tag;
};

const sampleNow = (off: number, src: string): InsetSample => {
  const vv = window.visualViewport;
  const float = document.querySelector<HTMLElement>("[data-composer-float]");
  return {
    ts: new Date().toISOString(),
    age: Math.round(performance.now()),
    nav:
      (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined)
        ?.type ?? "?",
    vis: document.visibilityState,
    vvH: vv ? Math.round(vv.height) : -1,
    innerH: window.innerHeight,
    top: vv ? Math.round(vv.offsetTop) : -1,
    off: Math.round(off),
    varOff: document.documentElement.style.getPropertyValue("--composer-keyboard-offset") || "0px",
    focus: focusSummary(),
    floatBottom: float ? Math.round(float.getBoundingClientRect().bottom) : null,
    src,
  };
};

export function useComposerInsetDebugBadge(): void {
  useEffect(() => {
    flushLog();
    let el: HTMLSpanElement | null = null;
    // 转换窗口：visibilitychange / focusin / focusout 后 3s 内记录全部样本（含 off=0）。
    let recordAllUntil = 0;
    const openTransitionWindow = () => {
      recordAllUntil = performance.now() + TRANSITION_WINDOW_MS;
    };

    const render = (sample: InsetSample) => {
      if (!el) {
        el = document.createElement("span");
        el.style.cssText =
          "position:fixed;top:2px;right:4px;z-index:9999;pointer-events:none;" +
          "font:10px/1.4 ui-monospace,SFMono-Regular,monospace;color:#fff;" +
          "background:rgba(0,0,0,0.55);padding:1px 5px;border-radius:4px;white-space:nowrap";
        document.body.appendChild(el);
      }
      el.textContent =
        `vv ${sample.vvH}/${sample.innerH} t${sample.top} off ${sample.off} ` +
        `var ${sample.varOff} src ${sample.src} ${sample.vis} ${sample.focus} ` +
        `age ${sample.age}ms ${sample.nav}` +
        (sample.floatBottom === null ? "" : ` fb ${sample.floatBottom}`);
    };

    // 心跳：状态签名变化才记录（抬高发生但无任何事件时，这是唯一捕获通道）。
    let lastSignature = "";
    let lastOff = 0;
    const heartbeat = () => {
      if (document.visibilityState !== "visible") return;
      const probe = sampleNow(lastOff, "heartbeat");
      const signature = [
        probe.vis,
        probe.vvH,
        probe.innerH,
        probe.top,
        probe.varOff,
        probe.focus,
        probe.floatBottom,
      ].join("|");
      if (signature === lastSignature) return;
      lastSignature = signature;
      const sample = sampleNow(lastOff, "heartbeat");
      writeLog([...readLog(), sample]);
      scheduleFlush();
      render(sample);
    };
    const heartbeatId = setInterval(heartbeat, HEARTBEAT_MS);

    const onTransition = () => openTransitionWindow();
    document.addEventListener("visibilitychange", onTransition);
    window.addEventListener("focusin", onTransition);
    window.addEventListener("focusout", onTransition);

    const dispose = observeKeyboardInset((inset, source) => {
      lastOff = inset.offsetPx;
      const sample = sampleNow(inset.offsetPx, source);
      // 事件样本全量记录（事件本身稀疏，含 off=0 才看得出「写过又被纠正」）；
      // 转换窗口外的 off=0 正常态不记，避免正常键盘开合刷屏。
      if (
        inset.offsetPx > 0 ||
        source === "visible" ||
        source === "visible-settle" ||
        performance.now() < recordAllUntil
      ) {
        writeLog([...readLog(), sample]);
        scheduleFlush();
      }
      lastSignature = [
        sample.vis,
        sample.vvH,
        sample.innerH,
        sample.top,
        sample.varOff,
        sample.focus,
        sample.floatBottom,
      ].join("|");
      render(sample);
    });

    const onHide = () => {
      if (document.visibilityState === "hidden") flushLog();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flushLog);

    return () => {
      dispose();
      clearInterval(heartbeatId);
      if (flushTimer !== null) clearTimeout(flushTimer);
      document.removeEventListener("visibilitychange", onTransition);
      window.removeEventListener("focusin", onTransition);
      window.removeEventListener("focusout", onTransition);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flushLog);
      flushLog();
      el?.remove();
    };
  }, []);
}
