import { useEffect } from "react";

import { observeKeyboardInset } from "./keyboard-inset";

/**
 * 【临时诊断件——composer 抬高 bug 取证用，定案后整文件拆除（2026-10-19 用户拍板）】
 *
 * 双通道取证：
 * 1. 常开只读角标（右上角，pointer-events-none 不挡交互）：显示 visualViewport 实时值、
 *    composer 实际消费的 offsetPx、最近一次测量的触发源。挂载点 = 三个会话详情路由
 *    （与 useComposerKeyboardAvoidance 同位）。
 * 2. 自动哨兵（2026-10-19 用户拍板「修复 + 自动哨兵」）：off > 0 的每次测量落
 *    localStorage 环形（cap 20 条），挂载/记录时 flush POST 到 /api/debug/inset-report
 *    （同源 HttpOnly cookie 自动携带；失败留本地下次补报）——偶发场景用户零操作，
 *    服务端日志侧收数据。
 *
 * 读数判读（角标与服务端日志同口径）：
 * - off > 0 且 vv ≈ innerHeight → offset 是历史残留（写入后无事件纠正，终态事件丢失实锤）
 * - off > 0 且 vv < innerHeight → vv 当前真低于 layout viewport（iOS 后台恢复未同步实锤）
 * - off > 0 且 top > 0 → vv.offsetTop 残留（iOS 26 收起残留变体）
 * - src 恒 init/init-settle → 挂载后无任何 vv 事件到达（卡住态的伴生证据）
 *
 * DOM 惰性创建：observeKeyboardInset 在桌面（pointer: coarse 不匹配）是 no-op 且不
 * 回调——惰性创建让桌面不渲染角标、不产生记录。
 */

const LOG_KEY = "insetDebugLog";
const LOG_CAP = 20;

type InsetSample = {
  ts: string;
  vvH: number;
  innerH: number;
  top: number;
  off: number;
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
    // 配额满 / 隐私模式：哨兵是诊断能力，静默降级。
  }
};

let flushing = false;
/** 上报当前记录；成功即清空本地（fire-and-forget，失败留待下次）。 */
const flushLog = (): void => {
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
      if (res.ok) writeLog([]);
    })
    .catch(() => {})
    .finally(() => {
      flushing = false;
    });
};

export function useComposerInsetDebugBadge(): void {
  useEffect(() => {
    flushLog();
    let el: HTMLSpanElement | null = null;
    const dispose = observeKeyboardInset((inset, source) => {
      const vv = window.visualViewport;
      if (!vv) return;
      const innerH = window.innerHeight;
      const sample: InsetSample = {
        ts: new Date().toISOString(),
        vvH: Math.round(vv.height),
        innerH,
        top: Math.round(vv.offsetTop),
        off: Math.round(inset.offsetPx),
        src: source,
      };
      if (inset.offsetPx > 0) {
        // 哨兵：只记非零写入（正常键盘期也记，日志侧按「键盘是否可能在场」分辨异常）。
        writeLog([...readLog(), sample]);
        flushLog();
      }
      if (!el) {
        el = document.createElement("span");
        el.style.cssText =
          "position:fixed;top:2px;right:4px;z-index:9999;pointer-events:none;" +
          "font:10px/1.4 ui-monospace,SFMono-Regular,monospace;color:#fff;" +
          "background:rgba(0,0,0,0.55);padding:1px 5px;border-radius:4px;white-space:nowrap";
        document.body.appendChild(el);
      }
      el.textContent = `vv ${sample.vvH}/${sample.innerH} top ${sample.top} off ${sample.off} src ${source}`;
    });
    return () => {
      dispose();
      el?.remove();
    };
  }, []);
}
