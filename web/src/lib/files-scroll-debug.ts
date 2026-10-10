// 真机诊断通道（一次性工具，证据到手即摘除）：v1.6 真机反馈「iPhone 全局文件无法滚动
// （agents-remote 项目能滚、22router 不能，看得到下方还有内容）」——Chromium 移动视口
// 实测滚动链全部健康（根层/子目录层 scrollHeight/clientHeight/canSetScroll、父链每层
// flex/min-h-0/overflow 逐层核对全齐），触摸拦截/touch-action/sticky/content-visibility
// 静态排查全排除——按证据纪律（frontend-notes §22「手势 bug 的证据纪律」）停止推理修复，
// 先埋通道拿真机第一手数据。
//
// 诊断期 DEBUG_ENABLED=true 常开——PWA 杀掉重开即加载新包。浮层 pointer-events:none
// 不干扰交互。取证完成后整文件连 main.tsx 挂载点一并删除（localStorage 键
// files-scroll-debug-v3 一并清）。
//
// v2（首组数据后）：v1 只报 main 内面积最大容器 → 真机 sh=ch 与「看得到溢出内容」矛盾。
// v3（第二组数据后）再升级：c0 唯一容器不溢出但用户看得到下方内容 → 溢出内容在 main 内
// 已知容器之外（可能在 portal/sheet 层）；且 ts/tm 两轮恒 0 与「点击导航过」物理矛盾
// → touch 通道本身存疑。v3 改为：
//   ① k0..k3 = **document 全域** .overflow-y-auto（含 portal/sheet，不只 main）；
//   ② pointer 事件对照通道（pc/pm）——touch=0 而 pc>0 = touch 通道死的实锤；
//   ③ 全部计数 localStorage 持久化（杀 PWA 不丢，消除读数时序依赖；500ms 节流 +
//     pagehide/visibilitychange flush）。
//
// 字段语义（切分候选根因）：
//   kN sh/ch/st  document 全域第 N 个 .overflow-y-auto 的三件套 + class 前三个类（识
//               别它是谁）。sh>ch 的才是溢出容器；手势后 st 前进而 sh>ch = 其实在滚；
//               st 恒 0 = 引擎不响应或被拦截。
//   kN y/pb     容器 rect.top（视口坐标）+ computed padding-bottom——y+ch = 底缘位置
//               （vs nav 顶 = 底部让位几何），pb = 避让 padding 是否生效/值多少
//               （v4：真机观察「两个文件恰被 safe-area 遮挡」+ sh=ch 无滚量并存，需
//               底部几何切分「让位失效」vs「内容异常」）。
//   nav y/h     底部 <nav> 元素 rect.top/height（fixed 胶囊真实占位，对照 var 值）。
//   doc sh/ch/st document.scrollingElement（body/html 层）——排除「滚的是 body 层」。
//   tc/te/tca    touchstart/touchend/touchcancel 全局计数（touch 通道活性）。
//   pc/pm        pointerdown/pointermove 全局计数（对照通道——tc=0 且 pc>0 = touch
//               事件未到达 JS 的实锤；tc=0 且 pc=0 = 两通道皆无 = 该 document 无手势）。
//   pv           touchmove 传播结束后 defaultPrevented 计数（JS preventDefault 拦截）。
//   dy           当前手势位移（startY − clientY，正=上滑）。
//   sc           scroll 事件全域 capture 计数（st 动必派发——sc>0 而 st=0 = 滚的是别人）。
//   ih/mh/tg     innerHeight / main 实际高（mh≪ih = viewport 链断）；tg = 最后手势落点
//               class 摘要。

const DEBUG_ENABLED = true;

const REFRESH_MS = 250;

const MAX_CONTAINERS = 4;

const STORE_KEY = "files-scroll-debug-v3";

type Counters = {
  tc: number;
  te: number;
  tca: number;
  pc: number;
  pm: number;
  pv: number;
  dy: number;
  sc: number;
  tg: string;
};

const EMPTY_COUNTERS: Counters = {
  tc: 0,
  te: 0,
  tca: 0,
  pc: 0,
  pm: 0,
  pv: 0,
  dy: 0,
  sc: 0,
  tg: "–",
};

function loadCounters(): Counters {
  try {
    return { ...EMPTY_COUNTERS, ...JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}") };
  } catch {
    return { ...EMPTY_COUNTERS };
  }
}

function targetSummary(target: EventTarget | null): string {
  if (!(target instanceof Element)) return String(target ?? "–");
  const cls = (target.className || "").toString().trim();
  return cls ? cls.split(/\s+/).slice(0, 3).join(".") : target.tagName;
}

export function mountFilesScrollDebug() {
  if (!DEBUG_ENABLED) return;

  const c = loadCounters();
  let startY = 0;

  const save = () => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(c));
    } catch {
      /* 存储不可用时浮层照常工作，仅失去持久化 */
    }
  };
  // 节流落盘：手势高频事件 500ms 一写；pagehide / visibilitychange 必 flush——杀 PWA
  // 前保住最后一段手势证据。
  let saveTimer: number | undefined;
  const flushSave = () => {
    if (saveTimer !== undefined) {
      window.clearTimeout(saveTimer);
      saveTimer = undefined;
    }
    save();
  };
  const scheduleSave = () => {
    if (saveTimer === undefined) {
      saveTimer = window.setTimeout(() => {
        saveTimer = undefined;
        save();
      }, 500);
    }
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") flushSave();
  });
  window.addEventListener("pagehide", flushSave);

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

  document.addEventListener(
    "touchstart",
    (e) => {
      c.tc += 1;
      const touch = e.touches[0];
      startY = touch?.clientY ?? 0;
      c.dy = 0;
      c.tg = targetSummary(touch?.target ?? e.target);
      scheduleSave();
    },
    { capture: true, passive: true },
  );
  document.addEventListener(
    "touchmove",
    (e) => {
      const touch = e.touches[0];
      if (touch) c.dy = Math.round(startY - touch.clientY);
      // defaultPrevented 要等传播链走完才是定值：延迟到本轮事件循环末再读。
      setTimeout(() => {
        if (e.defaultPrevented) {
          c.pv += 1;
          scheduleSave();
        }
      }, 0);
      scheduleSave();
    },
    { capture: true, passive: true },
  );
  document.addEventListener(
    "touchend",
    () => {
      c.te += 1;
      scheduleSave();
    },
    { capture: true, passive: true },
  );
  document.addEventListener(
    "touchcancel",
    () => {
      c.tca += 1;
      scheduleSave();
    },
    { capture: true, passive: true },
  );
  document.addEventListener(
    "pointerdown",
    (e) => {
      c.pc += 1;
      startY = e.clientY;
      c.dy = 0;
      scheduleSave();
    },
    { capture: true, passive: true },
  );
  document.addEventListener(
    "pointermove",
    (e) => {
      c.pm += 1;
      c.dy = Math.round(startY - e.clientY);
      scheduleSave();
    },
    { capture: true, passive: true },
  );
  document.addEventListener(
    "scroll",
    () => {
      c.sc += 1;
      scheduleSave();
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
    const containers = Array.from(document.querySelectorAll<HTMLElement>(".overflow-y-auto"));
    for (const el of containers.slice(0, MAX_CONTAINERS)) {
      const cls = (el.className || "").toString().trim().split(/\s+/).slice(0, 3).join(".");
      const rect = el.getBoundingClientRect();
      const pb = getComputedStyle(el).paddingBottom;
      lines.push(
        `k${containers.indexOf(el)} sh=${el.scrollHeight} ch=${el.clientHeight} st=${Math.round(el.scrollTop)} y=${Math.round(rect.top)} pb=${pb} ${cls}`,
      );
    }
    const nav = document.querySelector("nav");
    if (nav) {
      const navRect = nav.getBoundingClientRect();
      lines.push(`nav y=${Math.round(navRect.top)} h=${Math.round(navRect.height)}`);
    }
    const doc = document.scrollingElement;
    if (doc) {
      lines.push(
        `doc sh=${doc.scrollHeight} ch=${doc.clientHeight} st=${Math.round(doc.scrollTop)}`,
      );
    }
    lines.push(`tc=${c.tc} te=${c.te} tca=${c.tca} pc=${c.pc} pm=${c.pm}`);
    lines.push(`pv=${c.pv} dy=${c.dy} sc=${c.sc}`);
    lines.push(
      `ih=${Math.round(window.innerHeight)} mh=${main ? Math.round(main.getBoundingClientRect().height) : "-"} tg=${c.tg}`,
    );
    bar.textContent = lines.join("\n");
  };
  render();
  setInterval(render, REFRESH_MS);
}
