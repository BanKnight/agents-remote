import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { useT } from "../../i18n";
import { ShellIcon } from "../shell/icons";

/** 缩放上下限（中心缩放，按钮 / 滚轮 / pinch / 双击共用）。 */
const MIN_SCALE = 0.1;
const MAX_SCALE = 8;
/** 按钮 / 滚轮的缩放步进倍率。 */
const STEP_FACTOR = 1.25;
/** 双击放大的目标倍率（与 fit=1 切换）。 */
const DOUBLE_TAP_SCALE = 2;
/** 旋转步进（度）。 */
const ROTATE_STEP = 90;
/** 双击（触屏连按）的最大间隔（毫秒）。 */
const DOUBLE_TAP_MS = 300;

function clampScale(s: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
}

/** 一次图像变换：scale + 平移 x/y + 旋转角度（度）。 */
type Transform = { scale: number; x: number; y: number; rotation: number };

const IDENTITY: Transform = { scale: 1, x: 0, y: 0, rotation: 0 };

/** 围绕图片中心缩放：translate 按比例衰减，使视觉中心点不动（与旋转兼容）。 */
function zoomAboutCenter(prev: Transform, nextScale: number): Transform {
  const ratio = nextScale / prev.scale;
  return { ...prev, scale: nextScale, x: prev.x * ratio, y: prev.y * ratio };
}

export type ImageViewerProps = {
  src: string;
  alt: string;
};

/**
 * 图片查看器（原地增强，设计 image-viewer 条目）：替换 PreviewBody 的静态 `<img>`。
 *
 * 统一手势（Pointer Events，鼠标 / 触摸 / 笔不分支）：
 * - 单指针拖拽 → 平移；双指针 → pinch（距离比 → 缩放，中点位移 → 平移）。
 * - 桌面滚轮（onWheel）→ 围绕中心缩放。
 * - 双击（鼠标 dblclick / 触屏连按）→ fit(1) ↔ 2x。
 * - 按钮条：放大 / 缩小 / 90° 旋转 / 重置。
 *
 * 缩放统一围绕图片中心（不做 zoom-to-cursor）——与旋转兼容、数学简洁，Google Photos 同款取舍。
 * 容器 `touch-none`（touch-action:none）阻止浏览器默认手势（页面滚动 / 系统 pinch-zoom），
 * 让 pointer events 完全接管。不限制拖拽边界（自由平移，重置按钮兜底）。
 *
 * transform：img 绝对定位 left-1/2 top-1/2 + `translate(-50%,-50%)` 居中，再叠加用户的
 * translate(x,y) rotate(deg) scale(scale)，transform-origin center。
 */
export function ImageViewer({ src, alt }: ImageViewerProps) {
  const { t } = useT();
  const canvasRef = useRef<HTMLDivElement>(null);
  // transform 的 ref 镜像：手势回调读最新值而不重绑 listener（与 FilesPanel saveShortcut 同款范式）。
  const [transform, setTransform] = useState<Transform>(IDENTITY);
  const transformRef = useRef(transform);
  transformRef.current = transform;

  // 切图重置变换（同一 ImageViewer 实例换 src 时）。
  useLayoutEffect(() => {
    setTransform(IDENTITY);
  }, [src]);

  // 活跃指针：pointerId → 屏幕坐标。空 / 单 → 平移；二 → pinch。
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  // pinch 起始参照（两指距离 / 中点 + 触发时的 transform 快照）。
  const pinchStart = useRef<{
    distance: number;
    midX: number;
    midY: number;
    transform: Transform;
  } | null>(null);
  // 单指针拖拽起始参照（按下时的指针位置 + transform 快照）。
  const dragStart = useRef<{ x: number; y: number; transform: Transform } | null>(null);
  // 双击检测：上次触屏抬起的时间戳。
  const lastTap = useRef(0);

  // ── 纯函数变换（按钮 / 滚轮 / 双击复用） ──────────────────────────
  const stepZoom = useCallback((factor: number) => {
    setTransform((prev) => zoomAboutCenter(prev, clampScale(prev.scale * factor)));
  }, []);

  const rotate = useCallback(() => {
    setTransform((prev) => ({ ...prev, rotation: (prev.rotation + ROTATE_STEP) % 360 }));
  }, []);

  const reset = useCallback(() => setTransform(IDENTITY), []);

  const toggleZoom = useCallback(() => {
    setTransform((prev) =>
      prev.scale === 1 ? { ...IDENTITY, scale: DOUBLE_TAP_SCALE } : IDENTITY,
    );
  }, []);

  // ── Pointer Events 手势 ──────────────────────────────────────────
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      dragStart.current = { x: e.clientX, y: e.clientY, transform: transformRef.current };
    } else if (pointers.current.size === 2) {
      // 进入 pinch：丢弃单指拖拽参照，建 pinch 参照。
      dragStart.current = null;
      const [a, b] = [...pointers.current.values()];
      pinchStart.current = {
        distance: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        midX: (a.x + b.x) / 2,
        midY: (a.y + b.y) / 2,
        transform: transformRef.current,
      };
    }
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size >= 2 && pinchStart.current) {
      const [a, b] = [...pointers.current.values()];
      const start = pinchStart.current;
      const ratio = Math.hypot(a.x - b.x, a.y - b.y) / start.distance;
      const nextScale = clampScale(start.transform.scale * ratio);
      // 中点位移 → 平移。
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      setTransform({
        scale: nextScale,
        x: start.transform.x + (midX - start.midX),
        y: start.transform.y + (midY - start.midY),
        rotation: start.transform.rotation,
      });
      return;
    }

    if (dragStart.current) {
      const start = dragStart.current;
      setTransform({
        ...start.transform,
        x: start.transform.x + (e.clientX - start.x),
        y: start.transform.y + (e.clientY - start.y),
      });
    }
  }, []);

  const endPointer = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const wasPinch = pointers.current.size >= 2;
      pointers.current.delete(e.pointerId);
      (e.target as Element).releasePointerCapture?.(e.pointerId);
      if (pointers.current.size < 2) pinchStart.current = null;
      if (pointers.current.size === 0) {
        dragStart.current = null;
        // 单指快速连按两下 = 双击切换缩放（仅非 pinch 抬起、非鼠标——鼠标走 dblclick）。
        if (!wasPinch && e.pointerType !== "mouse") {
          const now = performance.now();
          if (now - lastTap.current < DOUBLE_TAP_MS) toggleZoom();
          lastTap.current = now;
        }
      } else if (pointers.current.size === 1) {
        // 从两指回到一指：以剩余指针重建拖拽参照，避免突变。
        const [p] = [...pointers.current.values()];
        dragStart.current = { x: p.x, y: p.y, transform: transformRef.current };
      }
    },
    [toggleZoom],
  );

  // 桌面滚轮缩放（围绕中心）。用原生 listener + passive:false 确保 preventDefault 生效——
  // React onWheel 在 root delegation 下可能被标 passive，且 Mac trackpad pinch-zoom
  //（ctrlKey + wheel）会触发浏览器页面缩放，必须主动拦截。stepZoom 经 ref 取最新值不重绑。
  const stepZoomRef = useRef(stepZoom);
  stepZoomRef.current = stepZoom;
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      stepZoomRef.current(e.deltaY < 0 ? STEP_FACTOR : 1 / STEP_FACTOR);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // 鼠标双击（dblclick）切换缩放。
  const onDoubleClick = useCallback(() => toggleZoom(), [toggleZoom]);

  const transformStyle = {
    transform: `translate(-50%, -50%) translate(${transform.x}px, ${transform.y}px) rotate(${transform.rotation}deg) scale(${transform.scale})`,
  };

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div
        ref={canvasRef}
        className="relative min-h-0 flex-1 touch-none overflow-hidden"
        onDoubleClick={onDoubleClick}
        onPointerCancel={endPointer}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        style={{ cursor: transform.scale > 1 ? "grab" : "default" }}
      >
        <img
          alt={alt}
          className="pointer-events-none absolute left-1/2 top-1/2 max-h-full max-w-full select-none object-contain"
          draggable={false}
          src={src}
          style={transformStyle}
        />
      </div>
      <div
        className="pointer-events-auto absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-0.5 rounded-lg border border-neutral-line/60 bg-surface-inset/80 p-0.5 backdrop-blur-sm"
        role="group"
      >
        <ViewerButton
          aria-label={t("files.imageZoomOut")}
          onClick={() => stepZoom(1 / STEP_FACTOR)}
        >
          <ShellIcon className="size-4" name="minus" />
        </ViewerButton>
        <span className="min-w-[3rem] text-center text-[0.7rem] font-semibold tabular-nums text-on-surface-muted">
          {Math.round(transform.scale * 100)}%
        </span>
        <ViewerButton aria-label={t("files.imageZoomIn")} onClick={() => stepZoom(STEP_FACTOR)}>
          <ShellIcon className="size-4" name="plus" />
        </ViewerButton>
        <ViewerButton aria-label={t("files.imageRotate")} onClick={rotate}>
          <ShellIcon className="size-4" name="rotate" />
        </ViewerButton>
        <ViewerButton aria-label={t("files.imageReset")} onClick={reset}>
          <ShellIcon className="size-4" name="maximize" />
        </ViewerButton>
      </div>
    </div>
  );
}

/** 工具条按钮：复用 capsule-actions 内部按钮范式（去 border/bg，rounded-md，hover→primary）。 */
function ViewerButton({
  "aria-label": ariaLabel,
  onClick,
  children,
}: {
  "aria-label": string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={ariaLabel}
      className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-on-surface-soft transition hover:bg-primary/10 hover:text-primary active:bg-primary/20"
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}
