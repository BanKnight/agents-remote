// 真机诊断通道（一次性工具，证据到手即删）：诊断期**默认常开**——PWA standalone 注入
// 不了 URL 参数，`?sheetdebug=1` flag 通道在主力测试环境不可靠，索性去掉开关；浮层
// pointer-events:none 不干扰手势，左上角显示每次手势的事件链摘要——down 热区命中 /
// pending 建立 / 接管 / inline 与视觉一致性校验 / end 判定
// （dismiss|bounce|pointercancel）。删除本文件时随文件一起消失。
const MAX_LINES = 8;

let overlay: HTMLDivElement | null = null;
const lines: string[] = [];
let counter = 0;

function render(): void {
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.setAttribute("data-sheet-debug", "");
    overlay.style.cssText =
      "position:fixed;top:calc(env(safe-area-inset-top,0px) + 4px);left:4px;right:4px;" +
      "z-index:2147483647;background:rgba(0,0,0,.85);color:#4cff4c;" +
      "font:600 11px/1.5 ui-monospace,SFMono-Regular,monospace;padding:6px 8px;" +
      "border-radius:8px;pointer-events:none;white-space:pre-wrap;word-break:break-all;";
    document.body.append(overlay);
  }
  overlay.textContent = lines.join("\n");
}

/** 手势链事件记一行（诊断期常开，无开关判定）。 */
export function sheetDebug(line: string): void {
  lines.push(`#${++counter} ${line}`);
  if (lines.length > MAX_LINES) lines.shift();
  render();
}
