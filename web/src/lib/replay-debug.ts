// 回放取证入屏通道（诊断期交付，定位后整批摘除——§22 sheet-debug 同款纪律）。
// 背景：22router「全部已中断/已失效」现象只在用户设备复现，而手机 PWA 无 console
// ——debug-flags 的 flag 通道（__arDebug.*）依赖 console 入口，standalone 下不可达
//（§22 教训：默认常开的浮层，flag/URL 参数通道不可靠）。三行回放日志的关键行同步
// 进 localStorage 环形缓冲（跨刷新可读）+ CustomEvent（同页实时），入屏横幅显示
// 最近一条 audit 判读行、点开看全部。默认常开、不设开关。
const KEY = "ar-replay-debug";
const MAX_LINES = 24;
export const REPLAY_DEBUG_EVENT = "ar-replay-debug";

type Entry = { t: number; text: string };

let lines: Entry[] = load();

function load(): Entry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Entry[];
    return Array.isArray(parsed)
      ? parsed.filter((e) => typeof e?.t === "number" && typeof e?.text === "string")
      : [];
  } catch {
    return [];
  }
}

/** adapter 三行日志处同步调用；fire-and-forget，任何存储失败只丢落盘不丢内存。 */
export function recordReplayDebug(text: string): void {
  lines = [...lines, { t: Date.now(), text }].slice(-MAX_LINES);
  try {
    localStorage.setItem(KEY, JSON.stringify(lines));
  } catch {
    // 隐私模式 / 配额：内存缓冲仍工作（本页加载内可见）
  }
  if (typeof window !== "undefined") {
    // 构造器从 window 取（浏览器语义不变；bun test 的 jsdom realm 下用全局构造器
    // 会因跨 realm 被 jsdom 的 dispatchEvent 拒绝）。
    const w = window as Window & { CustomEvent: typeof CustomEvent };
    w.dispatchEvent(new w.CustomEvent(REPLAY_DEBUG_EVENT));
  }
}

/** 渲染用：HH:MM:SS 前缀的行数组（时间戳是区分「上次连接 / 本次连接」的唯一凭据）。 */
export function readReplayDebugLines(): string[] {
  return lines.map((e) => {
    const d = new Date(e.t);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${e.text}`;
  });
}

/** @internal 测试注入：清内存缓冲与落盘。 */
export function resetReplayDebugForTests(): void {
  lines = [];
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
