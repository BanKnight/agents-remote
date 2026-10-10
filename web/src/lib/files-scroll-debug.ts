// 真机诊断通道（一次性工具，证据到手即摘除）：v1.6 真机反馈「iPhone 全局文件无法滚动
// （agents-remote 项目能滚、22router 不能，看得到下方还有内容）」——Chromium 移动视口
// 实测滚动链全部健康（根层/子目录层 scrollHeight/clientHeight/canSetScroll、父链每层
// flex/min-h-0/overflow 逐层核对全齐），触摸拦截/touch-action/sticky/content-visibility
// 静态排查全排除——按证据纪律（frontend-notes §22「手势 bug 的证据纪律」）停止推理修复，
// 先埋通道拿真机第一手数据。
//
// 诊断期 DEBUG_ENABLED=true 常开——PWA 杀掉重开即加载新包（用户操作：杀 PWA 重开 →
// 全局文件 → 进问题项目 → 上滑尝试）。浮层 pointer-events:none 不干扰交互。取证完成后
// 整文件连 main.tsx 挂载点一并删除。
//
// 每组字段为「切分候选根因」设计：
//   sh/ch/st   滚动容器 scrollHeight / clientHeight / scrollTop。sh≈ch = 内容不溢出
//             （「下方内容」属他层或错觉）；sh>ch 且 ts/tm 前进但 st 恒 0 = 引擎不响应
//             （手势到位、滚动不发生）；sh>ch 且 ts/tm 不前进 = 手势没到达滚动容器
//             （被上层吃掉）。
//   ts/tm      落在滚动容器内的 touchstart / touchmove 计数（手势到达层）。
//   pv         touchmove 传播结束后 defaultPrevented 的计数（JS 拦截层——有值 = 有代码
//             preventDefault 吃默认滚动）。
//   ih/mh      window.innerHeight / main 实际高。mh ≪ ih = --app-viewport-height 高度链
//             断裂（§1 家族 PWA vh 基线问题）；mh ≈ ih = 链健康。
//   tg         最后一次 touchstart 目标的 class 摘要（手势落点在哪个元素上）。

const DEBUG_ENABLED = true;

const REFRESH_MS = 250;

/** main 内「主滚动容器」：面积最大的 .overflow-y-auto（/files 页即文件列表滚动链根）。 */
function pickScrollContainer(): HTMLElement | null {
  const main = document.querySelector("main");
  if (!main) return null;
  let best: HTMLElement | null = null;
  let bestArea = 0;
  for (const el of main.querySelectorAll<HTMLElement>(".overflow-y-auto")) {
    const area = el.clientWidth * el.clientHeight;
    if (area > bestArea) {
      best = el;
      bestArea = area;
    }
  }
  return best;
}

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

  let scrollEl = pickScrollContainer();
  let lastTargetSummary = "–";
  let touchStartInContainer = 0;
  let touchMoveInContainer = 0;
  let preventedMoves = 0;

  const inContainer = (target: EventTarget | null): boolean => {
    if (!(target instanceof Element) || !scrollEl) return false;
    return target === scrollEl || scrollEl.contains(target);
  };

  document.addEventListener(
    "touchstart",
    (e) => {
      const target = e.touches[0]?.target ?? e.target;
      if (target instanceof Element) {
        const cls = (target.className || "").toString().trim();
        lastTargetSummary = cls ? cls.split(/\s+/).slice(0, 3).join(" ") : target.tagName;
      }
      if (inContainer(target)) touchStartInContainer += 1;
    },
    { capture: true, passive: true },
  );

  document.addEventListener(
    "touchmove",
    (e) => {
      const hit = inContainer(e.touches[0]?.target ?? e.target);
      if (hit) touchMoveInContainer += 1;
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
    scrollEl = pickScrollContainer();
    const main = document.querySelector("main");
    bar.textContent = [
      `sh=${scrollEl?.scrollHeight ?? "-"} ch=${scrollEl?.clientHeight ?? "-"} st=${scrollEl?.scrollTop ?? "-"}`,
      `ts=${touchStartInContainer} tm=${touchMoveInContainer} pv=${preventedMoves}`,
      `ih=${Math.round(window.innerHeight)} mh=${main ? Math.round(main.getBoundingClientRect().height) : "-"} tg=${lastTargetSummary}`,
    ].join("\n");
  };
  render();
  setInterval(render, REFRESH_MS);
}
