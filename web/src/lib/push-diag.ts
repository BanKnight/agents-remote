// Push 链路诊断助手（2026-11-11 根治批）。手机 PWA standalone 无 console——诊断信息
// 必须屏内可达（diag-log 三件套）。双层同发：console 留痕（桌面排障）+ recordDiag("push")
// 入悬浮球环形缓冲（真机可达）。SW 侧异常经 serviceWorker message 事件中继回页面
// （SW 无 localStorage，不能直接 recordDiag）。
import { recordDiag, type DiagScope } from "./diag-log";

const SCOPE: DiagScope = "push";

/** push 链路诊断行：console 留痕 + 悬浮球缓冲（开关关闭时 recordDiag 内部 no-op）。 */
export function pushDiag(text: string): void {
  console.log(`[push] ${text}`);
  recordDiag(SCOPE, text);
}

/** SW→页面诊断中继安装（幂等，code review P2-3：模块级守卫防重复监听）。收 SW
 *  postMessage 的 {kind:"push-diag", text} 行。 */
let relayInstalled = false;
export function installPushDiagRelay(): void {
  if (relayInstalled) return;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  relayInstalled = true;
  navigator.serviceWorker.addEventListener("message", (event) => {
    const data = event.data as { kind?: unknown; text?: unknown } | null;
    if (data?.kind !== "push-diag" || typeof data.text !== "string") return;
    pushDiag(data.text);
  });
}
