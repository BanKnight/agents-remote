import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { useIsMobile } from "@/lib/use-is-mobile";

import { uploadDiagLog } from "../../api/client";
import {
  clearDiagLog,
  DIAG_ENABLED_EVENT,
  DIAG_EVENT,
  isDiagEnabled,
  readDiagEntries,
  readDiagLines,
} from "../../lib/diag-log";
import { Dialog, DialogContent } from "../ui/dialog";
import { LucideIcon } from "./lucide-icon";
import { MobileSheet } from "./mobile-sheet";

/**
 * 全局诊断悬浮球（项目级通用诊断基建的查看面；真机反馈 2026-11-05 拍板形态）：
 * 诊断开关开启时常驻可拖拽悬浮球（位置记忆），点击打开二级页（移动 MobileSheet /
 * 桌面居中 Dialog）查看诊断环形缓冲全文 + copy all / 上传 / 清空。任何功能的
 * recordDiag(scope, ...) 输出都汇到这里——不限会话页，挂 App shell（main.tsx）。
 * 开关关闭即整条消失；诊断件不进 i18n（英文短字段，对齐 ReplayDebugBanner 先例）。
 *
 * 手势（frontend-notes §14/§21-25 家族纪律）：pointer events 驱动 + non-passive
 * touchmove preventDefault 防滚动抢占；down 即 setPointerCapture——拖动第一步常
 * 一步跨出 44px 球界，pending（未捕获）阶段收不到界外 move、永远到不了接管阈值
 *（探针实抓：慢步进偶发接管、快速拖必死）；tap 与拖动以 6px 位移阈值判定（tap
 * 走 pointerup 的 pending 分支，不用 click——capture 后拖拽松手的 click 合成
 * 不可控）；DOM 就绪信号走 state ref callback（§14）。
 */

type FabPos = { side: "left" | "right"; top: number };

const FAB_POS_KEY = "ar-diag-fab";
const FAB_SIZE_PX = 44;
const FAB_EDGE_PX = 12;
const FAB_TOP_DEFAULT = 72; // 初始位：safe-area 下方
const FAB_GAP_PX = 12; // 距顶/底最小间隙
const FAB_DRAG_START_PX = 6; // tap vs 拖动判定阈值

function fabX(pos: FabPos): number {
  return pos.side === "left" ? FAB_EDGE_PX : window.innerWidth - FAB_SIZE_PX - FAB_EDGE_PX;
}
function clampFabY(top: number): number {
  const min = FAB_GAP_PX;
  const max = window.innerHeight - FAB_SIZE_PX - FAB_GAP_PX;
  return Math.min(Math.max(top, min), Math.max(min, max));
}
function readFabPos(): FabPos {
  const fallback: FabPos = { side: "right", top: FAB_TOP_DEFAULT };
  try {
    const raw = localStorage.getItem(FAB_POS_KEY);
    if (!raw) return fallback;
    const pos = JSON.parse(raw) as Partial<FabPos>;
    if (
      (pos.side !== "left" && pos.side !== "right") ||
      typeof pos.top !== "number" ||
      !Number.isFinite(pos.top)
    ) {
      return fallback;
    }
    return { side: pos.side, top: clampFabY(pos.top) };
  } catch {
    return fallback;
  }
}
const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function DiagFab() {
  const [enabled, setEnabled] = useState(isDiagEnabled);
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const [pos, setPos] = useState<FabPos>(readFabPos);
  // 拖拽中摘吸附 transition（§18 同族：连续改位不跟手），松手恢复播放吸附动画。
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const refresh = () => {
      setEnabled(isDiagEnabled());
      setLines(readDiagLines());
    };
    refresh();
    window.addEventListener(DIAG_EVENT, refresh);
    window.addEventListener(DIAG_ENABLED_EVENT, refresh);
    // 窗口变化重 clamp（x 由 side + 视口宽派生自动跟随；y 显式收拢）。
    const onResize = () => setPos((p) => ({ ...p, top: clampFabY(p.top) }));
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener(DIAG_EVENT, refresh);
      window.removeEventListener(DIAG_ENABLED_EVENT, refresh);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  // 手势状态机：pending（未接管）→ dragging（越过阈值 capture 接管）→ idle。
  const dragRef = useRef({
    phase: "idle" as "idle" | "pending" | "dragging",
    pointerId: 0,
    startX: 0,
    startY: 0,
    baseX: 0,
    baseY: 0,
  });
  const setDragIdle = () => {
    dragRef.current = { phase: "idle", pointerId: 0, startX: 0, startY: 0, baseX: 0, baseY: 0 };
  };
  // DOM 就绪信号走 state ref callback（§14）——enabled false 时球卸载，enabled true
  // 重挂必须重绑 touchmove（useRef+[] effect 只绑首次，重挂后防滚动抢占会失效）。
  const [fabNode, setFabNode] = useState<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!fabNode) return;
    const onTouchMove = (e: TouchEvent) => {
      if (dragRef.current.phase !== "idle") e.preventDefault();
    };
    fabNode.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => fabNode.removeEventListener("touchmove", onTouchMove);
  }, [fabNode]);

  const handlePointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // down 即 capture：拖动第一步常常一步跨出 44px 球界，pending（未捕获）阶段
    // 球收不到界外 pointermove → 永远到不了接管阈值（探针实抓：慢步进能偶然接管、
    // 快速拖必死）。tap 判定走 pointerup 的 pending 分支、不依赖 click 合成，
    // 提前 capture 无副作用；capture 后 leave 被 API 抑制，无 §23 残留窗口。
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // capture 失败（指针已失效）：手势照常建立，仅界外跟踪降级
    }
    dragRef.current = {
      phase: "pending",
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      baseX: fabX(pos),
      baseY: clampFabY(pos.top),
    };
  };
  const handlePointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (d.phase === "idle" || e.pointerId !== d.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (d.phase === "pending" && Math.hypot(dx, dy) >= FAB_DRAG_START_PX) {
      d.phase = "dragging";
      setDragging(true);
    }
    if (d.phase === "dragging") {
      e.currentTarget.style.setProperty(
        "transform",
        `translate(${d.baseX + dx}px, ${d.baseY + dy}px)`,
      );
    }
  };
  const handlePointerUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (d.phase === "idle" || e.pointerId !== d.pointerId) return;
    const phase = d.phase;
    setDragIdle();
    if (phase === "pending") {
      // tap：开二级页（不经 click——capture 拖拽松手的 click 合成不可控）。
      setOpen(true);
      return;
    }
    // 松手吸附：球心在视口左半 → 贴左缘，否则右缘；y clamp + 持久化。
    const nx = d.baseX + (e.clientX - d.startX);
    const ny = d.baseY + (e.clientY - d.startY);
    const next: FabPos = {
      side: nx + FAB_SIZE_PX / 2 < window.innerWidth / 2 ? "left" : "right",
      top: clampFabY(ny),
    };
    setDragging(false);
    setPos(next);
    try {
      localStorage.setItem(FAB_POS_KEY, JSON.stringify(next));
    } catch {
      // 存储不可用：位置记忆退化为会话内
    }
  };
  const handlePointerCancel = () => {
    const wasDragging = dragRef.current.phase === "dragging";
    setDragIdle();
    if (wasDragging) {
      // 回吸附位：新 pos 引用触发重渲染 → React 重写 inline transform + transition。
      setDragging(false);
      setPos((p) => ({ ...p }));
    }
  };
  if (!enabled) return null;

  const count = lines.length;

  const fab = (
    <button
      aria-label={`diag · ${count} lines`}
      className={`fixed left-0 top-0 z-30 flex size-11 touch-none items-center justify-center rounded-full border border-sep bg-elevated/95 text-ink-2 shadow-lg ${
        dragging ? "cursor-grabbing scale-95 bg-elevated" : "cursor-grab hover:bg-elevated"
      }`}
      // transition 全走 inline style：拖拽中（dragging）摘 transform 过渡保跟手
      //（§18 同族），松手恢复以播放吸附动画；scale 是独立属性（§19）不进列表。
      onPointerCancel={handlePointerCancel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      ref={setFabNode}
      style={{
        transform: `translate(${fabX(pos)}px, ${clampFabY(pos.top)}px)`,
        transitionProperty: dragging ? "background-color" : "transform, background-color",
        transitionDuration: prefersReducedMotion() ? "0s" : "200ms",
        transitionTimingFunction: "ease-out",
      }}
      type="button"
    >
      <LucideIcon className="size-5" name="bug" />
    </button>
  );

  return (
    <>
      {fab}
      {open ? <DiagSheet lines={lines} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/**
 * 诊断二级页（内容单源，容器双端投影）：移动 = MobileSheet（title Diagnostics），
 * 桌面 = 居中 Dialog（Radix modal：scrim/Esc/focus trap 基建统一）。
 */
function DiagSheet({ lines, onClose }: { lines: string[]; onClose: () => void }) {
  const isMobile = useIsMobile();
  const panel = <DiagPanel lines={lines} />;
  if (isMobile) {
    return (
      <MobileSheet onOpenChange={(next) => !next && onClose()} open title="Diagnostics">
        {panel}
      </MobileSheet>
    );
  }
  return (
    <Dialog onOpenChange={(next) => !next && onClose()} open>
      <DialogContent className="gap-3 p-4">
        <p className="text-sm font-bold text-ink-1">Diagnostics</p>
        {panel}
      </DialogContent>
    </Dialog>
  );
}

function DiagPanel({ lines }: { lines: string[] }) {
  const [copied, setCopied] = useState(false);
  const [uploadState, setUploadState] = useState<"idle" | "busy" | "done" | "failed">("idle");
  const [uploadError, setUploadError] = useState("");

  const handleCopy = () => {
    void navigator.clipboard
      .writeText(lines.join("\n"))
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {
        // 剪贴板失败（非 https/权限）：静默，用户仍可拍屏
      });
  };

  const handleUpload = () => {
    setUploadState("busy");
    setUploadError("");
    void uploadDiagLog({ entries: readDiagEntries() })
      .then(() => {
        setUploadState("done");
        window.setTimeout(() => setUploadState("idle"), 1500);
      })
      .catch((e: unknown) => {
        setUploadState("failed");
        setUploadError(e instanceof Error ? e.message : String(e));
      });
  };

  const buttonClasses =
    "cursor-pointer rounded-lg border border-sep bg-surface px-2.5 py-1 text-caption text-on-surface-muted transition hover:bg-elevated2 disabled:cursor-default disabled:opacity-60";
  return (
    <div className="flex min-h-0 flex-col">
      <pre className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap break-all rounded-lg bg-surface-inset p-2.5 text-caption text-on-surface-muted">
        {lines.length > 0 ? lines.join("\n") : "(empty)"}
      </pre>
      <div className="mt-2 flex items-center gap-2">
        <button className={buttonClasses} onClick={handleCopy} type="button">
          {copied ? "copied ✓" : "copy all"}
        </button>
        <button
          className={buttonClasses}
          disabled={uploadState === "busy" || lines.length === 0}
          onClick={handleUpload}
          type="button"
        >
          {uploadState === "busy" ? "uploading…" : uploadState === "done" ? "uploaded ✓" : "upload"}
        </button>
        <button className={buttonClasses} onClick={() => clearDiagLog()} type="button">
          clear
        </button>
      </div>
      {uploadState === "failed" ? (
        <p className="mt-1 break-all text-caption text-error">{uploadError}</p>
      ) : null}
    </div>
  );
}
