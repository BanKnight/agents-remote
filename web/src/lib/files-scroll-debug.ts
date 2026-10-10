// 真机诊断通道（一次性工具，证据到手即摘除）：v1.6 真机反馈「iPhone 全局文件无法滚动
// （agents-remote 项目能滚、22router 不能，看得到下方还有内容）」——Chromium 移动视口
// 实测滚动链全部健康（根层/子目录层 scrollHeight/clientHeight/canSetScroll、父链每层
// flex/min-h-0/overflow 逐层核对全齐），触摸拦截/touch-action/sticky/content-visibility
// 静态排查全排除——按证据纪律（frontend-notes §22「手势 bug 的证据纪律」）停止推理修复，
// 先埋通道拿真机第一手数据。
//
// 诊断期 DEBUG_ENABLED=true 常开——PWA 杀掉重开即加载新包（用户操作：杀 PWA 重开 →
// 全局文件 → 进问题项目 → 等列表渲染完 → 上滑 → **手势做完/进行中读数**）。浮层
// pointer-events:none 不干扰交互。取证完成后整文件连 main.tsx 挂载点一并删除。
//
// v2（首组真机数据后升级）：v1 只报「main 内面积最大的 .overflow-y-auto」，真机首组
// sh=ch=712（不溢出）与用户「看得到下方还有内容」矛盾 → 所选容器不是用户看到的列表
// 容器；且 ts/tm 按该容器过滤，选错容器时恒 0，无法区分「没手势」vs「手势落在别层」。
// v2 改为全列容器 + 全局手势计数 + 手指位移。
//
// 字段语义（切分候选根因）：
//   cN sh/ch/st  main 内第 N 个 .overflow-y-auto 的 scrollHeight/clientHeight/scrollTop
//               + class 前两个类（识别它是谁）。sh>ch 的才是溢出容器；手势后 st 前进而
//               sh>ch = 其实在滚（「不能滚」另有其层）；st 恒 0 = 引擎不响应或被拦截。
//   doc sh/ch/st document.scrollingElement（body/html 层）——排除「滚的是 body 层」兜底。
//   ts/tm/pv/dy  全局 touchstart/touchmove 计数（不过滤容器）；pv = touchmove 传播结束
//               后 defaultPrevented 计数（JS preventDefault 拦截实锤）；dy = 当前手势
//               位移（startY − clientY，正值=上滑）——证明手指真实移动量。
//   ih/mh/tg     window.innerHeight / main 实际高（mh≪ih = --app-viewport-height 链断，
//               §1 家族）；tg = 最后 touchstart 目标 class 摘要（手势落点在哪层 DOM）。

const DEBUG_ENABLED = true;

const REFRESH_MS = 250;

const MAX_CONTAINERS = 3;

export function mountFilesScrollDebug() {
  if (!DEBUG_ENABLED) return;

  const bar = document.createElement("div");
  bar.style.cssText = [
    "position:fixed",
    "left:0",
    "right:0",
    "top:env(safe-area-inset-top, 0px)",
    "z-index:2147483647",
    "pointer-events:none",
    "background:rgba(0,0,0,.85)",
    "color:#4ade80",
    "font:600 10px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace",
    "padding:2px 8px",
    "text-align:center",
    "white-space:pre",
    "text-shadow:0 1px 2px rgba(0,0,0,.9)",
  ].join(";");

  let lastTargetSummary = "–";
  let touchStartCount = 0;
  let touchMoveCount = 0;
  let preventedMoves = 0;
  let startY = 0;
  let dragDistance = 0;

  document.addEventListener(
    "touchstart",
    (e) => {
      touchStartCount += 1;
      const touch = e.touches[0];
      startY = touch?.clientY ?? 0;
      dragDistance = 0;
      const target = touch?.target ?? e.target;
      if (target instanceof Element) {
        const cls = (target.className || "").toString().trim();
        lastTargetSummary = cls ? cls.split(/\s+/).slice(0, 3).join(" ") : target.tagName;
      }
    },
    { capture: true, passive: true },
  );

  document.addEventListener(
    "touchmove",
    (e) => {
      touchMoveCount += 1;
      const touch = e.touches[0];
      if (touch) dragDistance = Math.round(startY - touch.clientY);
      // defaultPrevented 要等传播链走完才是定值：延迟到本轮事件循环末再读。
      setTimeout(() => {
        if (e.defaultPrevented) preventedMoves += 1;
      }, 0);
    },
    { capture: true, passive: true },
  );

  const append = () => {
    if (document.body && !bar.isConnected) document.body.appendChild(bar);
  };
  append();
  document.addEventListener("DOMContentLoaded", append);

  const render = () => {
    const main = document.querySelector("main");
    const lines: string[] = [];
    const containers = main
      ? Array.from(main.querySelectorAll<HTMLElement>(".overflow-y-auto")).slice(0, MAX_CONTAINERS)
      : [];
    for (const [i, el] of containers.entries()) {
      const cls = (el.className || "").toString().trim().split(/\s+/).slice(0, 2).join(".");
      lines.push(
        `c${i} sh=${el.scrollHeight} ch=${el.clientHeight} st=${Math.round(el.scrollTop)} ${cls}`,
      );
    }
    const doc = document.scrollingElement;
    if (doc) {
      lines.push(
        `doc sh=${doc.scrollHeight} ch=${doc.clientHeight} st=${Math.round(doc.scrollTop)}`,
      );
    }
    lines.push(
      `ts=${touchStartCount} tm=${touchMoveCount} pv=${preventedMoves} dy=${dragDistance}`,
    );
    lines.push(
      `ih=${Math.round(window.innerHeight)} mh=${main ? Math.round(main.getBoundingClientRect().height) : "-"} tg=${lastTargetSummary}`,
    );
    bar.textContent = lines.join("\n");
  };
  render();
  setInterval(render, REFRESH_MS);
}
