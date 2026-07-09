import { useCallback, useRef, useState } from "react";

import { useIsMobile } from "@/lib/use-is-mobile";
import { cn } from "@/lib/utils";

import { Dialog, DialogContent } from "../ui/dialog";
import { ActionButton, shellSurfaceClasses } from "./shell-primitives";

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
};

export function usePromptDialog() {
  const [pending, setPending] = useState<PendingPrompt | null>(null);
  const resolveRef = useRef<((value: string | null) => void) | null>(null);

  const prompt = useCallback((config: PromptConfig) => {
    return new Promise<string | null>((resolve) => {
      resolveRef.current = resolve;
      setPending({ ...config, resolve });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    const input = document.querySelector<HTMLInputElement>("[data-prompt-input]");
    resolveRef.current?.(input?.value.trim() ?? "");
    resolveRef.current = null;
    setPending(null);
  }, []);

  const handleCancel = useCallback(() => {
    resolveRef.current?.(null);
    resolveRef.current = null;
    setPending(null);
  }, []);

  const holder = pending ? (
    <PromptDialog
      cancelLabel={pending.cancelLabel}
      confirmLabel={pending.confirmLabel}
      initialValue={pending.initialValue}
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
  placeholder,
  title,
  tone = "accent",
}: PromptConfig & { onCancel: () => void; onConfirm: () => void }) {
  const isMobile = useIsMobile();
  const inputClassName =
    "mt-3 w-full rounded-lg border border-neutral-line bg-surface-inset px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-muted/60 focus:border-primary focus:outline-none";

  if (isMobile) {
    // iOS 底部 sheet with input：顶部标题+输入卡片 + 竖排全宽按钮 + Cancel 底部独立分组。
    const confirmToneText = tone === "accent" ? "text-primary" : "text-on-surface-soft";
    return (
      <Dialog defaultOpen onOpenChange={(open) => !open && onCancel()}>
        <DialogContent
          className={cn(
            "fixed inset-x-0 bottom-0 top-auto max-w-none w-full translate-x-0 translate-y-0 rounded-t-xl border-t border-neutral-line bg-surface-raised px-2 pt-2",
            "pb-[calc(env(safe-area-inset-bottom)+0.5rem)]",
            "shadow-2xl shadow-black/40",
            "slide-in-from-bottom duration-200 ease-out",
          )}
        >
          <div className="flex flex-col gap-2">
            <div className={`rounded-xl px-4 py-3 ${shellSurfaceClasses.workspace}`}>
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
    <Dialog defaultOpen onOpenChange={(open) => !open && onCancel()}>
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
