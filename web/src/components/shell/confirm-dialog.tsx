import { useCallback, useRef, useState } from "react";

import { useIsMobile } from "@/lib/use-is-mobile";

import { Dialog, DialogContent } from "../ui/dialog";
import { ActionButton, shellSurfaceClasses } from "./shell-primitives";
import { MobileSheet, SHEET_UNMOUNT_DELAY_MS } from "./mobile-sheet";

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
    // 延迟清 pending：先让 Radix 播完 exit 动画 + DismissableLayer 清理还原 body 锁
    //（SHEET_UNMOUNT_DELAY_MS，立即卸载会截断动画 + 竞态残留 pointer-events:none）。
    setTimeout(() => {
      setPending((p) => (p?.seq === seq ? null : p));
    }, SHEET_UNMOUNT_DELAY_MS);
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
    // iOS action sheet：shd 标题（§6.12n 对齐 03 原型）+ 消息 + 竖排全宽按钮。
    // 销毁用红字（action sheet destructive 标准），与桌面实色红块平台差异刻意保留。
    const confirmToneText =
      tone === "danger"
        ? "text-error"
        : tone === "accent"
          ? "text-primary"
          : "text-on-surface-soft";
    return (
      <MobileSheet onOpenChange={(next) => !next && onCancel()} open={open} title={title}>
        <div className="flex flex-col gap-2">
          <p className="mt-2 text-center text-sm leading-6 text-on-surface-muted">{message}</p>
          <button
            className={`mt-2 flex min-h-[48px] w-full items-center justify-center rounded-xl text-sm font-semibold transition active:bg-on-surface/5 ${shellSurfaceClasses.workspace} ${confirmToneText}`}
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
      </MobileSheet>
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
