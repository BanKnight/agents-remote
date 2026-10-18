import { useEffect } from "react";

import { observeKeyboardInset } from "./keyboard-inset";

/**
 * 【临时诊断件——composer 抬高 bug 取证用，定案后整文件拆除（2026-10-19 用户拍板方案 A）】
 * 常开只读角标（右上角，pointer-events-none 不挡交互）：显示 visualViewport 实时值、
 * composer 实际消费的 offsetPx、最近一次测量的触发源。挂载点 = 三个会话详情路由
 * （与 useComposerKeyboardAvoidance 同位）。
 *
 * 读数判读：
 * - off > 0 且 vv ≈ innerHeight → offset 是历史残留（写入后无事件纠正，终态事件丢失实锤）
 * - off > 0 且 vv < innerHeight → vv 当前真低于 layout viewport（iOS 后台恢复未同步实锤）
 * - off > 0 且 top > 0 → vv.offsetTop 残留（iOS 26 收起残留变体）
 * - src 恒 init → 挂载后无任何 vv 事件到达（卡住态的伴生证据）
 *
 * DOM 延迟到首次 render 创建：observeKeyboardInset 在桌面（pointer: coarse 不匹配）
 * 是 no-op 且不回调——惰性创建让桌面不出现空角标。
 */
export function useComposerInsetDebugBadge(): void {
  useEffect(() => {
    let el: HTMLSpanElement | null = null;
    const dispose = observeKeyboardInset((inset, source) => {
      const vv = window.visualViewport;
      if (!vv) return;
      if (!el) {
        el = document.createElement("span");
        el.style.cssText =
          "position:fixed;top:2px;right:4px;z-index:9999;pointer-events:none;" +
          "font:10px/1.4 ui-monospace,SFMono-Regular,monospace;color:#fff;" +
          "background:rgba(0,0,0,0.55);padding:1px 5px;border-radius:4px;white-space:nowrap";
        document.body.appendChild(el);
      }
      el.textContent =
        `vv ${Math.round(vv.height)}/${window.innerHeight} top ${Math.round(vv.offsetTop)} ` +
        `off ${Math.round(inset.offsetPx)} src ${source}`;
    });
    return () => {
      dispose();
      el?.remove();
    };
  }, []);
}
