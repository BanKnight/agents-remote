import { useCallback, useRef, useState } from "react";

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
  return (
    <Dialog defaultOpen onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="flex items-center justify-center p-4">
        <div
          className={`w-full max-w-sm rounded-2xl p-5 shadow-2xl shadow-black/40 ${shellSurfaceClasses.workspace}`}
        >
          <h2 className="text-base font-semibold text-on-surface">{title}</h2>
          <input
            autoFocus
            className="mt-3 w-full rounded-lg border border-neutral-line bg-surface-inset px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-muted/60 focus:border-primary focus:outline-none"
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
