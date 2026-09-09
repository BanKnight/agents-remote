import { type CSSProperties, useState } from "react";

import { useT } from "../../i18n";
import { ImageViewer } from "../files/image-viewer";
import { Dialog, DialogContent } from "./dialog";

/**
 * 图片缩略图 + 全屏 lightbox（聊天流富媒体，设计 image-viewer 聊天流形态）。
 *
 * - `ImageThumb`：消息流内嵌缩略图（max-h-64 限高，宽度随内容，点击打开）+ 自持 lightbox 开关。
 *   tool_result 图片（tool-ui-registry）与 markdown 图片（markdown-components img override）共用。
 * - `ImageLightbox`：Radix Dialog 全屏形态（无 outside 区，靠 ✕/Esc 关——同 dialog.tsx 全屏 reader
 *   形态），内嵌现有 `ImageViewer`（pinch/滚轮/双击缩放、旋转、重置全手势）。
 *
 * 单图模型：tool_result 以单图为主，markdown 多图逐个开各自 lightbox，不做多图切换（克制）。
 * dataUrl 在手（base64 已在消息里），零额外请求，回放可用。
 */

const THUMB_MAX_HEIGHT_PX = 256;

const thumbStyle: CSSProperties = { maxHeight: THUMB_MAX_HEIGHT_PX };

export function ImageThumb({ src, alt }: { src: string; alt: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        aria-label={alt}
        className="block cursor-zoom-in overflow-hidden rounded-lg border border-neutral-line/40"
        onClick={() => setOpen(true)}
        type="button"
      >
        <img
          alt={alt}
          className="max-w-full object-contain"
          draggable={false}
          src={src}
          style={thumbStyle}
        />
      </button>
      {open ? <ImageLightbox alt={alt} src={src} onOpenChange={setOpen} /> : null}
    </>
  );
}

export function ImageLightbox({
  src,
  alt,
  onOpenChange,
}: {
  src: string;
  alt: string;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useT();
  return (
    <Dialog onOpenChange={onOpenChange} open>
      <DialogContent
        aria-label={alt}
        // 全屏形态三件套缺一不可（对齐 FullscreenReader，ClaudeSessionDetailRoute:800 注释）：
        // ① inset-0 经 twMerge 干掉 base 的 left-1/2 top-1/2（纯 CSS 源顺序 inset-0 输给
        //    left-1/2 → 盒子从 50% 拉伸 → 偏左）；② translate-x-0/y-0 中和 -translate-1/2；
        // ③ sm:max-w-none 必须——base 的 sm:max-w-lg 是 sm-variant 组，无 variant 的
        //    max-w-none 去不掉它 → 桌面被钳到 512px（256→512 之间表现为内容偏左）。
        className="fixed inset-0 z-[100] max-w-none sm:max-w-none w-full translate-x-0 translate-y-0 flex flex-col border-0 bg-black/95 p-0"
      >
        <button
          aria-label={t("session.close")}
          className="absolute right-3 top-3 z-10 flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-white/80 transition hover:bg-white/10 hover:text-white"
          onClick={() => onOpenChange(false)}
          type="button"
        >
          ✕
        </button>
        <ImageViewer alt={alt} src={src} />
      </DialogContent>
    </Dialog>
  );
}
