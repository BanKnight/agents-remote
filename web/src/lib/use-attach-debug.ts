import { useEffect } from "react";

/**
 * 【临时诊断件——composer 多图归一化挂死取证用（2026-10-25）】
 *
 * 真机现象：一次选 ≥2 张图 chip 挂死，单张逐个加正常；138bf39（串行 + 20s 超时）
 * 部署后仍复现，且用户侧无法判断「跑的是不是新代码、断在哪一层」（§22 证据纪律：
 * 停止第 N+1 轮推理修复，埋诊断通道交真机第一手数据）。
 *
 * 打点：composer-attach 归一化链在关键阶段 dispatch `attach-debug` CustomEvent，
 * 本件监听 → localStorage 环形 + POST /api/debug/attach-report（服务端仅打日志）+
 * 右上角第二行常开角标（实时显示最近一阶段）。样本带 v="at2" 版本标记——读日志
 * 第一眼即辨代码新旧（SW precache 双开问题：旧 chunk 可能仍在服务页面）。
 * 定案后：本文件 + composer-attach 内打点 + api 路由一起拆。
 */

export const ATTACH_DEBUG_VERSION = "at2";

/**
 * 阶段字段为「切分候选空间」设计：batch→start→bitmap→(encode|passthrough)→ready/failed，
 * 挂死必停在唯一一段上；failed 的 err 含 "timeout after" 即 20s 兜底触发（证明新代码在跑）。
 */
export type AttachDebugDetail = {
  stage:
    | "batch" /** 本批 image 入队（n=张数） */
    | "start" /** 单张归一化开始（i/n） */
    | "bitmap" /** createImageBitmap 完成（ms；err="decode-fail" = 解码抛错） */
    | "encode" /** canvas 重编码完成（ms） */
    | "passthrough" /** 达标透传（免重编码路径） */
    | "ready" /** 终态成功（ms = 含排队的单张总耗时） */
    | "failed" /** 终态失败（err；ms 同上） */;
  /** 本批张数（batch）/ 第几张（start/ready/failed，从 1 起）。 */
  n?: number;
  i?: number;
  /** 该阶段耗时 ms。 */
  ms?: number;
  /** 文件名（消费端截短显示）。 */
  name?: string;
  /** 文件字节。 */
  size?: number;
  /** 错误消息（failed / bitmap decode-fail）。 */
  err?: string;
};

/** 打点源入口：无监听器时 no-op，诊断通道绝不影响主流程。 */
export function attachDebug(detail: AttachDebugDetail): void {
  try {
    window.dispatchEvent(new CustomEvent("attach-debug", { detail }));
  } catch {
    // ignore
  }
}

type AttachSample = AttachDebugDetail & { ts: string; age: number; v: string };

const LOG_KEY = "attachDebugLog";
const LOG_CAP = 200;
const FLUSH_DEBOUNCE_MS = 2000;

const readLog = (): AttachSample[] => {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    return raw ? (JSON.parse(raw) as AttachSample[]) : [];
  } catch {
    return [];
  }
};

const writeLog = (samples: AttachSample[]): void => {
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(samples.slice(-LOG_CAP)));
  } catch {
    // 配额满 / 隐私模式：诊断能力静默降级。
  }
};

let flushing = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
/** 上报当前记录；成功只移除本次上报的条数（飞行期间新增的样本不能丢）。 */
const flushLog = (): void => {
  flushTimer = null;
  if (flushing) return;
  const samples = readLog();
  if (samples.length === 0) return;
  flushing = true;
  fetch("/api/debug/attach-report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(samples),
  })
    .then((res) => {
      if (res.ok) writeLog(readLog().slice(samples.length));
    })
    .catch(() => {})
    .finally(() => {
      flushing = false;
    });
};

const scheduleFlush = (): void => {
  if (flushTimer !== null) return;
  flushTimer = setTimeout(flushLog, FLUSH_DEBOUNCE_MS);
};

const truncate = (s: string, max: number): string =>
  s.length > max ? `${s.slice(0, max - 1)}…` : s;

export function useAttachDebugBadge(): void {
  useEffect(() => {
    flushLog();
    let el: HTMLSpanElement | null = null;
    const ensureEl = () => {
      if (!el) {
        // 右上角第二行（top:17px）——第一行是 inset badge（top:2px），两通道并存互不遮。
        el = document.createElement("span");
        el.style.cssText =
          "position:fixed;top:17px;right:4px;z-index:9999;pointer-events:none;" +
          "font:10px/1.4 ui-monospace,SFMono-Regular,monospace;color:#fff;" +
          "background:rgba(0,0,0,0.55);padding:1px 5px;border-radius:4px;white-space:nowrap";
        document.body.appendChild(el);
      }
      return el;
    };
    const render = (s: AttachSample) => {
      const node = ensureEl();
      const head =
        `${s.v} ${s.stage}` +
        (s.i != null && s.n != null ? ` ${s.i}/${s.n}` : "") +
        (s.ms != null ? ` ${s.ms}ms` : "") +
        (s.size != null ? ` ${(s.size / 1024 / 1024).toFixed(1)}M` : "");
      node.textContent =
        head +
        (s.name ? ` ${truncate(s.name, 20)}` : "") +
        (s.err ? ` !${truncate(s.err, 48)}` : "");
    };

    const onEvent = (e: Event) => {
      const detail = (e as CustomEvent<AttachDebugDetail>).detail;
      const sample: AttachSample = {
        ...detail,
        ts: new Date().toISOString(),
        age: Math.round(performance.now()),
        v: ATTACH_DEBUG_VERSION,
      };
      writeLog([...readLog(), sample]);
      scheduleFlush();
      render(sample);
    };
    window.addEventListener("attach-debug", onEvent);
    // 挂载即渲染哨兵：选图前用户就能确认「取证代码在跑」（at2 可见 = 打点已激活）。
    ensureEl().textContent = `${ATTACH_DEBUG_VERSION} armed`;

    const onHide = () => {
      if (document.visibilityState === "hidden") flushLog();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flushLog);

    return () => {
      window.removeEventListener("attach-debug", onEvent);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flushLog);
      if (flushTimer !== null) clearTimeout(flushTimer);
      flushLog();
      el?.remove();
    };
  }, []);
}
