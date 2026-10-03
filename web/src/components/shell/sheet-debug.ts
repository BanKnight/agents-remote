// 真机诊断通道（一次性工具，证据到手即删）：?sheetdebug=1 开启（sessionStorage 记忆，
// 页面跳转/刷新不丢）。浮层 pointer-events:none 不干扰手势，左上角显示每次手势的
// 事件链摘要——down 热区命中 / pending 建立 / 接管 / inline 与视觉一致性校验 /
// end 判定（dismiss|bounce|pointercancel）。
const KEY = "sheetdebug";
const MAX_LINES = 8;

let enabledCache: boolean | null = null;
let overlay: HTMLDivElement | null = null;
const lines: string[] = [];
let counter = 0;

function isEnabled(): boolean {
  if (enabledCache === null) {
    const q = new URLSearchParams(window.location.search).has(KEY);
    if (q) window.sessionStorage.setItem(KEY, "1");
    enabledCache = q || window.sessionStorage.getItem(KEY) === "1";
  }
  return enabledCache;
}

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

/** 手势链事件记一行；flag 关闭时零开销（一次 sessionStorage 判定后短路）。 */
export function sheetDebug(line: string): void {
  if (!isEnabled()) return;
  lines.push(`#${++counter} ${line}`);
  if (lines.length > MAX_LINES) lines.shift();
  render();
}
