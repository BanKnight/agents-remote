import { useCallback, useEffect, useRef, useState } from "react";

import { useT } from "../../i18n";
import { uploadFile } from "@/api/client";
import { useHScroll } from "@/hooks/use-h-scroll";
import { LucideIcon } from "@/components/shell/lucide-icon";
import { cn } from "@/lib/utils";
import { ActionMenu, type ActionMenuItem } from "./action-menu";

/** 单条消息附件上限（防 WS 帧失控；超出部分忽略）。 */
export const COMPOSER_MAX_ATTACHMENTS = 4;
/** vision 最优长边（Anthropic 推荐内）；超过即 canvas 重编码。 */
export const IMAGE_MAX_EDGE_PX = 1568;
/**
 * 单图字节上限（裸 base64 换算回字节），与 Anthropic API 单图 5MB 上限对齐。达标透传分支
 * 也要过闸——尺寸达标 ≠ 体积达标（大 tEXt 块/噪声 PNG），放行会撑爆 WS 帧 → stdin →
 * JSONL 永久落盘 + relay 常驻重放（security review 68b030c）。
 */
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
/** 重编码 JPEG 质量。 */
export const IMAGE_JPEG_QUALITY = 0.8;
/** 任意文件的上传目录（项目内相对路径；CLI cwd 可见可 Read）。 */
export const COMPOSER_UPLOAD_DIR = "uploads";

/**
 * 小文本内联白名单扩展名（v1.5 批 8 附件双路径，spec §4.1）：命中且 ≤1MB → 不上传、
 * 读全文内联为消息级上下文（「附件 = 消息级上下文不落库」）；其余（含超限文本、PDF/
 * 二进制）维持 uploads/ 落库路径（用户拍板：超限自动落 uploads/ + 提及行，不再引导）。
 */
export const TEXT_INLINE_EXTENSIONS = new Set(["txt", "md", "csv", "json", "log"]);
/** 小文本内联单文件字节上限。 */
export const TEXT_INLINE_MAX_BYTES = 1024 * 1024;

/** 纯判定：文件是否走内联路径（白名单扩展名 + ≤1MB）。 */
export function isInlineTextFile(file: { name: string; size: number }): boolean {
  const dot = file.name.lastIndexOf(".");
  const ext = dot === -1 ? "" : file.name.slice(dot + 1).toLowerCase();
  return TEXT_INLINE_EXTENSIONS.has(ext) && file.size <= TEXT_INLINE_MAX_BYTES;
}

/**
 * 附件三路分流单源（批 8）：image 直传 / 白名单小文本内联 / 其余 uploads。pick 占位与
 * addFiles 分流共用同一判定——两处独立判定会漂移（占位 kind 与分流结果不一致时，
 * takeSnapshot 按 kind 过滤就收不进快照，内联文本静默丢失）。
 */
export function classifyAttachment(file: {
  type: string;
  name: string;
  size: number;
}): "image" | "text" | "file" {
  if (file.type.startsWith("image/")) return "image";
  if (isInlineTextFile(file)) return "text";
  return "file";
}

/** 可原样直传（Claude API 支持且体积/尺寸达标时免重编码）的图片类型。 */
const PASSTHROUGH_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export type ComposerAttachment = {
  kind: "image" | "file" | "text";
  id: string;
  name: string;
  status: "uploading" | "ready" | "error";
  /** image 就绪后填：直传 CLI 的媒体类型（重编码后恒 image/jpeg）。 */
  mediaType?: string;
  /** image 就绪后填：裸 base64（无 data: 前缀）——stream-json source.data 直接消费。 */
  data?: string;
  /** image 就绪后填：chip 缩略图 dataUrl。 */
  dataUrl?: string;
  /** file 就绪后填：上传后的项目内相对路径（uploads/…），发送时拼提及行。 */
  path?: string;
  /** text 就绪后填：文件全文（消息级上下文，随消息发送、不落项目目录）。 */
  text?: string;
};

/**
 * 发送瞬间的附件快照：图片块直上 stream-json；uploads 文件提及行与内联文本块（前导行
 * + fence 包裹，调用方用 t 组好文案）并入文本。
 */
export type PendingAttachments = {
  images: Array<{ mediaType: string; data: string }>;
  mentionLines: string[];
  inlineTexts: string[];
};

/** 纯判定：是否需要 canvas 重编码（类型不可直传或超最优长边）。GIF/HEIC 等恒 true。 */
export function needsImageReEncode(input: {
  mediaType: string;
  width: number;
  height: number;
}): boolean {
  if (!PASSTHROUGH_IMAGE_TYPES.has(input.mediaType)) return true;
  return Math.max(input.width, input.height) > IMAGE_MAX_EDGE_PX;
}

/** 裸 base64 串换算回原始字节数（4 字符 = 3 字节；尾 padding 误差可忽略）。 */
export function base64Bytes(data: string): number {
  return Math.floor((data.length * 3) / 4);
}

/** Blob → 裸 base64（无 data: 前缀）。分块 fromCharCode 防 arg 上限。 */
export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < buf.length; i += CHUNK) {
    bin += String.fromCharCode(...buf.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

/**
 * File → 可直传图片（媒体类型 + 裸 base64 + 预览 dataUrl）。达标 jpeg/png/webp 原样透传
 *（保 PNG 截图锐度）；超尺寸/其余类型 canvas 重编码 JPEG（GIF 取首帧——vision 静态）。
 * 解码失败（极少数非浏览器可解码类型漏入）且类型可直传 → 交 CLI 下采样；否则抛错（chip 报失败）。
 * iOS 相册 HEIC 经 `<input accept="image/*">` 已被系统转成 JPEG，正常不落此分支。
 */
export async function normalizeImageFile(file: File): Promise<{
  mediaType: string;
  data: string;
  dataUrl: string;
}> {
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    bitmap = null;
  }
  if (!bitmap) {
    if (PASSTHROUGH_IMAGE_TYPES.has(file.type)) {
      const data = await blobToBase64(file);
      // 无法重编码的兜底直传同样过字节闸，超限 chip 报失败（security review 68b030c）。
      if (base64Bytes(data) > IMAGE_MAX_BYTES) {
        throw new Error(`image exceeds ${IMAGE_MAX_BYTES} bytes: ${file.name}`);
      }
      return { mediaType: file.type, data, dataUrl: `data:${file.type};base64,${data}` };
    }
    throw new Error(`unsupported image type: ${file.type || "unknown"}`);
  }
  try {
    if (!needsImageReEncode({ mediaType: file.type, width: bitmap.width, height: bitmap.height })) {
      const data = await blobToBase64(file);
      // 尺寸达标 ≠ 体积达标（tEXt 块/噪声 PNG）：超限不透传，落重编码（可解码必有 bitmap）。
      if (base64Bytes(data) <= IMAGE_MAX_BYTES) {
        return { mediaType: file.type, data, dataUrl: `data:${file.type};base64,${data}` };
      }
    }
    const scale = IMAGE_MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height);
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", IMAGE_JPEG_QUALITY);
    const data = dataUrl.slice(dataUrl.indexOf(",") + 1);
    // 重编码产物兜底闸（1568px q0.8 常规远小于上限；此处防极端构造）。
    if (base64Bytes(data) > IMAGE_MAX_BYTES) {
      throw new Error(`image exceeds ${IMAGE_MAX_BYTES} bytes after re-encode: ${file.name}`);
    }
    return { mediaType: "image/jpeg", data, dataUrl };
  } finally {
    bitmap.close();
  }
}

/**
 * composer 附件草稿状态（发图批）：图片 → 客户端归一化内存直传；文件 → 立即上传到项目内
 * uploads/（与文件面板 upload-queue 同模式，keepBoth 防覆盖）。已上传文件不删（不动项目内
 * 已落盘数据）。takeSnapshot/clear 由适配器在发送瞬间取走（claude-adapter onNew）。
 */
export function useComposerAttachments({ projectName }: { projectName: string }) {
  const { t } = useT();
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  // ref 镜像：异步上传/归一化回写时读最新值（cap 判定、按 id 替换），避免闭包旧态。
  const attachmentsRef = useRef<ComposerAttachment[]>([]);
  const idRef = useRef(0);

  const commit = useCallback((next: ComposerAttachment[]) => {
    attachmentsRef.current = next;
    setAttachments(next);
  }, []);

  const replace = useCallback(
    (id: string, patch: Partial<ComposerAttachment>) => {
      commit(attachmentsRef.current.map((a) => (a.id === id ? { ...a, ...patch } : a)));
    },
    [commit],
  );

  const remove = useCallback(
    (id: string) => {
      commit(attachmentsRef.current.filter((a) => a.id !== id));
    },
    [commit],
  );

  const addFiles = useCallback(
    async (entries: Array<{ file: File; id: string }>) => {
      for (const { file, id } of entries) {
        if (attachmentsRef.current.length >= COMPOSER_MAX_ATTACHMENTS) break;
        const kind = classifyAttachment(file);
        if (kind === "image") {
          try {
            const norm = await normalizeImageFile(file);
            replace(id, {
              status: "ready",
              name: file.name,
              mediaType: norm.mediaType,
              data: norm.data,
              dataUrl: norm.dataUrl,
            });
          } catch {
            replace(id, { status: "error" });
          }
        } else if (kind === "text") {
          // 小文本白名单 ≤1MB（批 8）：不上传，读全文内联为消息级上下文。
          try {
            const text = await file.text();
            replace(id, { status: "ready", name: file.name, text });
          } catch {
            replace(id, { status: "error" });
          }
        } else {
          try {
            const res = await uploadFile(projectName, COMPOSER_UPLOAD_DIR, file, "keepBoth");
            replace(id, { status: "ready", path: res.entry.path });
          } catch {
            replace(id, { status: "error" });
          }
        }
      }
    },
    [projectName, replace],
  );

  // 每类先占位（uploading）再异步回写——图片归一化期间 chip 即在场（缩略图稍后补上）。
  // 占位 id 在此唯一生成并随 entry 直通 addFiles（addFiles 复用 id 做 replace，防错位）。
  const pick = useCallback(
    (files: File[]) => {
      const usable = files.slice(
        0,
        Math.max(0, COMPOSER_MAX_ATTACHMENTS - attachmentsRef.current.length),
      );
      if (usable.length === 0) return;
      const entries = usable.map((file) => ({
        file,
        id: `att-${++idRef.current}`,
      }));
      commit([
        ...attachmentsRef.current,
        ...entries.map(({ file, id }) => ({
          kind: classifyAttachment(file),
          id,
          name: file.name,
          status: "uploading" as const,
        })),
      ]);
      void addFiles(entries);
    },
    [addFiles, commit],
  );

  /**
   * 发送瞬间快照：就绪图片块 + 就绪文件提及行 + 就绪内联文本块（批 8，前导行 + fence
   * 包裹——i18n 文案在此组，adapter 侧零 i18n 依赖）。全空返回 null（纯文本发送）。
   */
  const takeSnapshot = useCallback((): PendingAttachments | null => {
    const ready = attachmentsRef.current.filter((a) => a.status === "ready");
    const images = ready
      .filter((a) => a.kind === "image" && a.mediaType && a.data)
      .map((a) => ({ mediaType: a.mediaType as string, data: a.data as string }));
    const mentionLines = ready
      .filter((a) => a.kind === "file" && a.path)
      .map((a) => t("claude.attach.fileMention", { path: a.path as string }));
    const inlineTexts = ready
      .filter((a) => a.kind === "text" && a.text != null)
      .map(
        (a) =>
          `${t("claude.attach.textInline", { name: a.name })}\n\`\`\`\n${a.text as string}\n\`\`\``,
      );
    if (images.length === 0 && mentionLines.length === 0 && inlineTexts.length === 0) return null;
    return { images, mentionLines, inlineTexts };
  }, [t]);

  const clear = useCallback(() => commit([]), [commit]);

  return { attachments, pick, remove, takeSnapshot, clear };
}

/**
 * composer 卡片底行最左「＋」附件菜单（发图批）：图片 / 相机（仅触屏）/ 文件。
 * 相机显隐按 pointer media（frontend-notes §7 能力判定）：默认常显（触屏/未知方向无害），
 * hover-capable 设备隐藏（桌面「相机」打开选图器是误导）。Chromium 模拟不了 media，
 * 触屏可见性交真机清单。图片/相机走 accept="image/*"（相机加 capture 直唤后摄，桌面忽略），
 * 文件无 accept（任意类型）。选中文件统一交 onFiles 由调用方分类（image/* 内联、其余上传）。
 */
export function ComposerAttachMenu({ onFiles }: { onFiles: (files: File[]) => void }) {
  const { t } = useT();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const items: ActionMenuItem[] = [
    {
      label: t("claude.attach.photo"),
      icon: <LucideIcon name="image" />,
      onSelect: () => imageInputRef.current?.click(),
    },
    {
      label: t("claude.attach.camera"),
      icon: <LucideIcon name="camera" />,
      // 默认常显、hover-capable（桌面）隐藏——见组件注释。
      className: "hover-capable:hidden",
      onSelect: () => cameraInputRef.current?.click(),
    },
    {
      label: t("claude.attach.file"),
      icon: <LucideIcon name="paperclip" />,
      onSelect: () => fileInputRef.current?.click(),
    },
  ];

  const pickFrom = (input: HTMLInputElement | null) => {
    const files = Array.from(input?.files ?? []);
    // 允许重复选同一文件：清 value，否则同路径二次选择不触发 onChange。
    if (input) input.value = "";
    if (files.length > 0) onFiles(files);
  };

  return (
    <>
      <ActionMenu
        align="start"
        cancelLabel={t("cancel")}
        items={items}
        trigger={
          <button
            type="button"
            aria-label={t("claude.attach.add")}
            title={t("claude.attach.add")}
            className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-xl text-on-surface-muted transition active:bg-on-surface/5"
          >
            {/* 尺寸类必须显式给（全仓唯一裸用曾在真机 WebKit 翻车）：svg 无 width/height
                时 Chromium flex 收缩给非零值、WebKit 收缩到 0×0——按钮占位可点但图形隐形。 */}
            <LucideIcon className="size-4" name="plus" />
          </button>
        }
      />
      <input
        ref={imageInputRef}
        accept="image/*"
        className="hidden"
        multiple
        type="file"
        onChange={(e) => pickFrom(e.currentTarget)}
      />
      <input
        ref={cameraInputRef}
        accept="image/*"
        capture="environment"
        className="hidden"
        type="file"
        onChange={(e) => pickFrom(e.currentTarget)}
      />
      <input
        ref={fileInputRef}
        className="hidden"
        data-composer-file-input
        multiple
        type="file"
        onChange={(e) => pickFrom(e.currentTarget)}
      />
    </>
  );
}

/**
 * 附件 chip 行（composer 卡片内、输入框上方）：图片缩略图 / 文件名+路径/内联文本名，
 * × 移除。v1.5 批 8：多图横排滚动（原型 workspace-attach-chips——nowrap 单行 + §7.2
 * 滚轮横滚与边缘渐隐）+ 聚焦 chip 按 ⌫/Delete 删除（mac-composer-attach 桌面差异）。
 */
export function AttachmentChipRow({
  attachments,
  onRemove,
}: {
  attachments: ComposerAttachment[];
  onRemove: (id: string) => void;
}) {
  const { t } = useT();
  // chips 增删不触发 scroll/resize，内容 effect 里重算渐隐方向。
  const hs = useHScroll();
  useEffect(() => hs.update(), [hs.update, attachments.length]);
  return (
    <div
      className="hfade flex min-w-0 flex-nowrap gap-2 overflow-x-auto px-3 pt-2.5"
      data-composer-attachments
      ref={hs.ref}
      {...hs.fadeProps}
    >
      {attachments.map((a) => {
        const statusLine =
          a.status === "uploading"
            ? t("claude.attach.uploading")
            : a.status === "error"
              ? t("claude.attach.failed")
              : null;
        return (
          <div
            className="relative shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            data-attachment-chip={a.id}
            key={a.id}
            tabIndex={0}
            onKeyDown={(e) => {
              // 聚焦 chip 按 ⌫/Delete 删除（spec §4.1 桌面差异：hover × / 选中 chip ⌫）。
              if (e.key === "Backspace" || e.key === "Delete") {
                e.preventDefault();
                onRemove(a.id);
              }
            }}
          >
            {a.kind === "image" ? (
              a.dataUrl ? (
                <img alt={a.name} className="size-12 rounded-lg object-cover" src={a.dataUrl} />
              ) : (
                <div className="flex size-12 items-center justify-center rounded-lg bg-surface-inset px-1 text-center text-[10px] leading-3 text-on-surface-muted">
                  {statusLine ?? t("claude.attach.uploading")}
                </div>
              )
            ) : (
              <div className="flex w-36 flex-col gap-0.5 rounded-lg bg-surface-inset px-2 py-1.5">
                <span className="truncate text-xs font-medium text-on-surface-soft">{a.name}</span>
                <span
                  className={cn(
                    "truncate text-[10px]",
                    a.status === "error" ? "text-error" : "text-on-surface-muted",
                  )}
                >
                  {statusLine ?? a.path}
                </span>
              </div>
            )}
            <button
              aria-label={t("claude.attach.remove")}
              className="absolute -right-1.5 -top-1.5 inline-flex size-5 cursor-pointer items-center justify-center rounded-full bg-surface-raised text-on-surface-muted shadow-sm transition active:bg-on-surface/10"
              onClick={() => onRemove(a.id)}
              type="button"
            >
              <LucideIcon className="size-4" name="x" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
