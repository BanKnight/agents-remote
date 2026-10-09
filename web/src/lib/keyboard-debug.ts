// 真机诊断通道（一次性工具，证据到手即删）：批 17 交付后真机反馈「多次键盘收起弹开中
// 工具条仍偶发被遮挡」——Chromium 对键盘 vv 行为结构性失明（探针只证接线），按证据纪律
// （frontend-notes「手势 bug 的证据纪律」条目）停止推理修复，先埋通道拿真机第一手数据。
// 诊断期**默认常开**——PWA standalone 注入不了 URL 参数，flag 通道不可靠（sheet-debug
// 先例）；浮层 pointer-events:none 不干扰交互。
//
// 与 sheet-debug 的关键差异：键盘弹起时 iOS 会 pan 视口把焦点区露出，fixed top:0 浮层
// 会被推到 visual viewport 外看不见（offsetTop 353 时顶部 353px 在可视区外）——所以每次
// 记录用 transform: translateY(vv.offsetTop) 把浮层钉在 visual viewport 顶部，键盘弹着
// 也能读数。
//
// 每行字段为「切分候选根因」设计：
//   src        触发源——vv-resize/vv-scroll/win-resize/focusin/focusout/init。用户操作了
//              但 #N 不前进 = 监听死了；vv 事件后无行而 focusin 有行 = 终态事件丢失实锤。
//   ih         window.innerHeight——多次循环间缩小且不恢复 = iOS standalone PWA 视口
//              卡死 bug 实锤（公式偏小 → 工具条抬不够 → 被遮挡）。
//   vv=h+o     visualViewport.height + offsetTop 原始读数。收起后 o≠0 = iOS 26 残留；
//              若下次弹起 off 偏小同一量级 = 残留叠加进公式实锤。
//   v          生产通道的 visible gate 结果——弹起中途 v=0 = gate 误杀候选。
//   off        生产通道计算并写入的 --kb-offset。收起后 off≠0 = 残留未被 gate 兜住。
//   root       :root inline style 读回——root≠off = 写入层分叉（有第三方覆盖）。
// 删除本文件时，use-keyboard-inset.ts 内 kbDebugLog 调用一并消失；keyboard-inset.ts 的
// source 参数与 focusin/focusout 补测是防御性加固，保留。
import type { KeyboardInset, KeyboardInsetSource } from "./keyboard-inset";

const MAX_LINES = 12;

let overlay: HTMLDivElement | null = null;
const lines: string[] = [];
let counter = 0;

function render(): void {
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.setAttribute("data-kb-debug", "");
    overlay.style.cssText =
      "position:fixed;top:0;left:0;right:0;" +
      "z-index:2147483647;background:rgba(0,0,0,.85);color:#4cff4c;" +
      "font:600 11px/1.5 ui-monospace,SFMono-Regular,monospace;padding:6px 8px;" +
      "border-radius:8px;pointer-events:none;white-space:pre-wrap;word-break:break-all;";
    document.body.append(overlay);
  }
  overlay.textContent = lines.join("\n");
}

/** 键盘事件链记一行（诊断期常开，无开关判定）；顺带把浮层钉到 visual viewport 顶部。 */
export function kbDebugLog(source: KeyboardInsetSource, inset: KeyboardInset): void {
  const vv = window.visualViewport;
  const ih = window.innerHeight;
  const vvH = vv?.height ?? 0;
  const vvO = vv?.offsetTop ?? 0;
  const rootOff = document.documentElement.style.getPropertyValue("--kb-offset") || "(unset)";
  lines.push(
    `#${++counter} ${source} ih=${ih} vv=${vvH.toFixed(0)}+${vvO.toFixed(0)} ` +
      `v=${inset.visible ? 1 : 0} off=${inset.offsetPx} root=${rootOff}`,
  );
  if (lines.length > MAX_LINES) lines.shift();
  render();
  if (vv) overlay?.style.setProperty("transform", `translateY(${vv.offsetTop}px)`);
}
