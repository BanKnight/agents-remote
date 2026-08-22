import { useCallback, useRef, useState } from "react";

import { useIsMobile } from "@/lib/use-is-mobile";
import { cn } from "@/lib/utils";

import { Dialog, DialogContent } from "../ui/dialog";
import { ActionButton, shellSurfaceClasses } from "./shell-primitives";

type ConfirmTone = "danger" | "accent" | "default";

type ConfirmConfig = {
  cancelLabel: string;
  confirmLabel: string;
  message: string;
  title: string;
  tone: ConfirmTone;
};

type PendingConfirm = ConfirmConfig & {
  resolve: (value: boolean) => void;
  /** 本轮 confirm 序号：延迟卸载只清同一轮，窗口期内重开新 confirm 不误删。 */
  seq: number;
};

/**
 * 受控关闭 → 延迟卸载的间隔：先 open=false 让 Radix 走正常 dismiss 路径
 * （exit 动画 + DismissableLayer 清理还原 body pointer-events 锁），等动画播完
 * 再移除组件。立即卸载（open 态直接 setPending(null)）会与 DismissableLayer
 * 清理序竞态，偶发 body 残留 `pointer-events: none`（整页不可点，e2e 实测）。
 * 与 prompt-dialog.tsx 同模式同修。300ms 覆盖桌面 fade-out 与移动 sheet 动画。
 */
const DIALOG_UNMOUNT_DELAY_MS = 300;

export function useConfirm() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const [open, setOpen] = useState(false);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);
  const seqRef = useRef(0);

  const confirm = useCallback((config: ConfirmConfig) => {
    return new Promise<boolean>((resolve) => {
      seqRef.current += 1;
      resolveRef.current = resolve;
      setPending({ ...config, resolve, seq: seqRef.current });
      setOpen(true);
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    resolveRef.current?.(value);
    resolveRef.current = null;
    setOpen(false);
    const seq = seqRef.current;
    setTimeout(() => {
      setPending((p) => (p?.seq === seq ? null : p));
    }, DIALOG_UNMOUNT_DELAY_MS);
  }, []);

  const handleConfirm = useCallback(() => settle(true), [settle]);
  const handleCancel = useCallback(() => settle(false), [settle]);

  const holder = pending ? (
    <ConfirmDialog
      cancelLabel={pending.cancelLabel}
      confirmLabel={pending.confirmLabel}
      message={pending.message}
      open={open}
      title={pending.title}
      tone={pending.tone}
      onCancel={handleCancel}
      onConfirm={handleConfirm}
    />
  ) : null;

  return { confirm, holder };
}

function ConfirmDialog({
  cancelLabel,
  confirmLabel,
  message,
  onCancel,
  onConfirm,
  open,
  title,
  tone,
}: ConfirmConfig & { onCancel: () => void; onConfirm: () => void; open: boolean }) {
  const isMobile = useIsMobile();

  if (isMobile) {
    // iOS action sheet：底部滑出，顶部标题/消息卡片 + 竖排全宽按钮 + Cancel 底部独立分组。
    // 销毁用红字（action sheet destructive 标准），与桌面实色红块平台差异刻意保留。
    const confirmToneText =
      tone === "danger"
        ? "text-error"
        : tone === "accent"
          ? "text-primary"
          : "text-on-surface-soft";
    return (
      <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
        <DialogContent
          className={cn(
            "fixed inset-x-0 bottom-0 top-auto max-w-none w-full translate-x-0 translate-y-0 rounded-t-xl border-t border-neutral-line bg-surface-raised px-2 pt-2",
            "pb-[calc(env(safe-area-inset-bottom)+0.5rem)]",
            "shadow-2xl shadow-black/40",
            "slide-in-from-bottom duration-200 ease-out",
          )}
        >
          <div className="flex flex-col gap-2">
            <div className={`rounded-xl px-4 py-3 text-center ${shellSurfaceClasses.workspace}`}>
              <h2 className="text-base font-semibold text-on-surface">{title}</h2>
              <p className="mt-1 text-sm leading-6 text-on-surface-muted">{message}</p>
            </div>
            <button
              className={`flex min-h-[48px] w-full items-center justify-center rounded-xl text-sm font-semibold transition active:bg-on-surface/5 ${shellSurfaceClasses.workspace} ${confirmToneText}`}
              onClick={onConfirm}
              type="button"
            >
              {confirmLabel}
            </button>
            <button
              className={`flex min-h-[48px] w-full items-center justify-center rounded-xl text-sm font-semibold text-on-surface-muted transition active:bg-on-surface/5 ${shellSurfaceClasses.workspace}`}
              onClick={onCancel}
              type="button"
            >
              {cancelLabel}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent>
        <div
          className={`rounded-2xl p-5 shadow-2xl shadow-black/40 ${shellSurfaceClasses.workspace}`}
        >
          <h2 className="text-base font-semibold text-on-surface">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-on-surface-muted">{message}</p>
          <div className="mt-5 flex justify-end gap-3">
            <ActionButton tone="muted" onClick={onCancel}>
              {cancelLabel}
            </ActionButton>
            <ActionButton tone={tone} onClick={onConfirm}>
              {confirmLabel}
            </ActionButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
