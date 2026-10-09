import { useEffect } from "react";

import { kbDebugLog } from "./keyboard-debug";
import { observeKeyboardInset } from "./keyboard-inset";

/**
 * App 根挂载一次（main.tsx）：visualViewport → :root 全局键盘变量（批 17 键盘 inset
 * 单源，observeKeyboardInset 提供监听）：
 * - `--kb-offset`：键盘吃掉的高度 px（0 = 无键盘）。流内全高面板消费 padding-bottom
 *   缩链（编辑态文件面板），让 flex 链自然缩短、底部工具条落到键盘上方——translateY
 *   只适合浮动卡片（composer），全高面板会顶部推出视口。
 * - `--kb-active`：0|1 键盘在场系数。辅助条 safe-area 避让随键盘切换（键盘在场时不再
 *   贴物理屏底，chin 避让责任转移给键盘自带避让，消费式
 *   `env(safe-area-inset-bottom) * (1 - var(--kb-active, 0))`）。
 *
 * ⚠️ 历史教训：keyboardVisible 驱动工具栏「显隐」曾因 iOS 26 键盘动画瞬态误判不稳定，
 * 已废弃（use-composer-keyboard-avoidance.ts 注释）——`--kb-active` 只供样式微调系数
 * （间距/避让切换），勿用于显隐类消费。
 */
export function useKeyboardInsetGlobal(): void {
  useEffect(() => {
    const root = document.documentElement;
    const dispose = observeKeyboardInset((inset, source) => {
      root.style.setProperty("--kb-offset", `${inset.offsetPx}px`);
      root.style.setProperty("--kb-active", inset.visible ? "1" : "0");
      kbDebugLog(source, inset);
    });
    return () => {
      dispose();
      root.style.setProperty("--kb-offset", "0px");
      root.style.setProperty("--kb-active", "0");
    };
  }, []);
}
