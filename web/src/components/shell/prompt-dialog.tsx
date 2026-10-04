import { useCallback, useRef, useState } from "react";

import { useIsMobile } from "@/lib/use-is-mobile";

import { Dialog, DialogContent } from "../ui/dialog";
import { ActionButton, shellSurfaceClasses } from "./shell-primitives";
import { MobileSheet, SHEET_UNMOUNT_DELAY_MS } from "./mobile-sheet";

type PromptConfig = {
  cancelLabel: string;
  confirmLabel: string;
  /** 预填值（如改名时填入当前 displayName）；缺失则空 input。 */
  initialValue?: string;
  placeholder?: string;
  title: string;
  tone?: "accent" | "default";
};

type PendingPrompt = PromptConfig & {
  resolve: (value: string | null) => void;
  /** 本轮 prompt 序号：延迟卸载只清同一轮，窗口期内重开新 prompt 不误删。 */
  seq: number;
};

export function usePromptDialog() {
  const [pending, setPending] = useState<PendingPrompt | null>(null);
  const [open, setOpen] = useState(false);
  const resolveRef = useRef<((value: string | null) => void) | null>(null);
  const seqRef = useRef(0);

  const prompt = useCallback((config: PromptConfig) => {
    return new Promise<string | null>((resolve) => {
      seqRef.current += 1;
      resolveRef.current = resolve;
      setPending({ ...config, resolve, seq: seqRef.current });
      setOpen(true);
    });
  }, []);

  const settle = useCallback((value: string | null) => {
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

  const handleConfirm = useCallback(() => {
    const input = document.querySelector<HTMLInputElement>("[data-prompt-input]");
    settle(input?.value.trim() ?? "");
  }, [settle]);

  const handleCancel = useCallback(() => settle(null), [settle]);

  const holder = pending ? (
    <PromptDialog
      cancelLabel={pending.cancelLabel}
      confirmLabel={pending.confirmLabel}
      initialValue={pending.initialValue}
      open={open}
      placeholder={pending.placeholder}
      title={pending.title}
      tone={pending.tone}
      onCancel={handleCancel}
      onConfirm={handleConfirm}
    />
  ) : null;

  return { holder, prompt };
}

function PromptDialog({
  cancelLabel,
  confirmLabel,
  initialValue,
  onCancel,
  onConfirm,
  open,
  placeholder,
  title,
  tone = "accent",
}: PromptConfig & { onCancel: () => void; onConfirm: () => void; open: boolean }) {
  const isMobile = useIsMobile();
  const inputClassName =
    "mt-3 w-full rounded-lg border border-neutral-line bg-surface-inset px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-muted/60 focus:border-primary focus:outline-none";

  if (isMobile) {
    // iOS 底部 sheet with input：shd 标题（对齐 03 原型，§6.12n）+ 输入 + 竖排全宽按钮。
    const confirmToneText = tone === "accent" ? "text-primary" : "text-on-surface-soft";
    return (
      <MobileSheet onOpenChange={(next) => !next && onCancel()} open={open} title={title}>
        <div className="flex flex-col gap-2">
          {/* 移动面不 autoFocus（MobileSheet 基座统一拦 initial focus：键盘与升起动画
              同时唤起打架，2026-10-04 用户拍板「输入是用户的行为」）；桌面面保留 autoFocus
              （无键盘推挤，表单惯例）。 */}
          <input
            className={inputClassName}
            data-prompt-input
            defaultValue={initialValue}
            placeholder={placeholder}
            type="text"
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => {
              if (e.key === "Enter") onConfirm();
            }}
          />
          <button
            className={`mt-2 flex min-h-[48px] w-full items-center justify-center rounded-xl text-sm font-semibold transition active:bg-on-surface/5 ${shellSurfaceClasses.workspace} ${confirmToneText}`}
            onClick={onConfirm}
            type="button"
          >
            {confirmLabel}
          </button>
          <button
            className={`flex min-h-[48px] w-full items-center justify-center rounded-xl text-sm font-semibold transition active:bg-on-surface/5 ${shellSurfaceClasses.workspace} text-on-surface-muted`}
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
          <input
            autoFocus
            className={inputClassName}
            data-prompt-input
            defaultValue={initialValue}
            placeholder={placeholder}
            type="text"
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => {
              if (e.key === "Enter") onConfirm();
            }}
          />
          <div className="mt-4 flex justify-end gap-3">
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
