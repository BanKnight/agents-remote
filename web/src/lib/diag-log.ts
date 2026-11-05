// 通用客户端诊断日志（项目级基建）：任何功能经 recordDiag(scope, text) 把关键
// 诊断行写入环形缓冲，全局「诊断悬浮球」（<DiagFab />，挂 App shell）随时查看/
// 复制/上传到服务端。背景：手机 PWA 无 console——诊断信息必须屏内可达（§22 教训：
// flag/console 通道在 standalone 下不可靠）。
// 三件套：
//   1. 开关 isDiagEnabled/setDiagEnabled（默认关，持久化；关 = record no-op +
//      调用方审计计算一并 gate 掉，稳态零开销）
//   2. 分 scope 环形缓冲（localStorage 持久化，跨刷新可读；首个 scope = "replay"）
//   3. CustomEvent 同页广播（横幅实时刷新）
const STORAGE_KEY = "ar-diag-log";
const ENABLED_KEY = "ar-diag-enabled";
const MAX_LINES = 24;
export const DIAG_EVENT = "ar-diag-log";
export const DIAG_ENABLED_EVENT = "ar-diag-enabled";

/** 诊断域标签；"replay" 为首个域，后续功能按语义加新值。 */
export type DiagScope = "replay" | (string & {});

export type DiagEntry = { t: number; scope: string; text: string };

let lines: DiagEntry[] = load();

function load(): DiagEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DiagEntry[];
    return Array.isArray(parsed)
      ? parsed.filter(
          (e) =>
            typeof e?.t === "number" && typeof e?.scope === "string" && typeof e?.text === "string",
        )
      : [];
  } catch {
    return [];
  }
}

function loadEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}

let enabled = loadEnabled();

export function isDiagEnabled(): boolean {
  return enabled;
}

/** 开关（默认关）：持久化 + 广播（横幅据事件重读开关与缓冲）。 */
export function setDiagEnabled(on: boolean): void {
  enabled = on;
  try {
    localStorage.setItem(ENABLED_KEY, on ? "1" : "0");
  } catch {
    // 隐私模式 / 配额：本页加载内开关仍生效
  }
  if (typeof window !== "undefined") {
    // 构造器从 window 取（浏览器语义不变；bun test 的 jsdom realm 下用全局构造器
    // 会因跨 realm 被 jsdom 的 dispatchEvent 拒绝）。
    const w = window as Window & { CustomEvent: typeof CustomEvent };
    w.dispatchEvent(new w.CustomEvent(DIAG_ENABLED_EVENT));
  }
}

/** 关键诊断行入环形缓冲；开关关闭时 no-op（稳态零开销）。fire-and-forget，任何存储失败只丢落盘不丢内存。 */
export function recordDiag(scope: DiagScope, text: string): void {
  if (!enabled) return;
  lines = [...lines, { t: Date.now(), scope, text }].slice(-MAX_LINES);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
  } catch {
    // 隐私模式 / 配额：内存缓冲仍工作（本页加载内可见）
  }
  if (typeof window !== "undefined") {
    const w = window as Window & { CustomEvent: typeof CustomEvent };
    w.dispatchEvent(new w.CustomEvent(DIAG_EVENT));
  }
}

/** 渲染用：HH:MM:SS + [scope] 前缀的行数组（时间戳是区分「上次/本次连接」的唯一凭据）。 */
export function readDiagLines(): string[] {
  return lines.map((e) => {
    const d = new Date(e.t);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} [${e.scope}] ${e.text}`;
  });
}

/** 上传用：原始 entries（结构化 payload，不带渲染前缀）。 */
export function readDiagEntries(): DiagEntry[] {
  return lines;
}

/** 显式清空（横幅「clear」按钮）；开关态不受影响。 */
export function clearDiagLog(): void {
  lines = [];
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  if (typeof window !== "undefined") {
    const w = window as Window & { CustomEvent: typeof CustomEvent };
    w.dispatchEvent(new w.CustomEvent(DIAG_EVENT));
  }
}

/** @internal 测试注入：清内存缓冲、落盘与开关。 */
export function resetDiagLogForTests(): void {
  lines = [];
  enabled = false;
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(ENABLED_KEY);
  } catch {
    // ignore
  }
}
