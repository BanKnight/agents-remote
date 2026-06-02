import { useCallback, useRef, useState } from "react";
import { ActionButton, shellSurfaceClasses } from "./shell-primitives";

type ConfirmTone = "danger" | "accent" | "default";

type ConfirmConfig = {
  confirmLabel: string;
  message: string;
  title: string;
  tone: ConfirmTone;
};

type PendingConfirm = ConfirmConfig & {
  resolve: (value: boolean) => void;
};

export function useConfirm() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((config: ConfirmConfig) => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setPending({ ...config, resolve });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    resolveRef.current?.(true);
    resolveRef.current = null;
    setPending(null);
  }, []);

  const handleCancel = useCallback(() => {
    resolveRef.current?.(false);
    resolveRef.current = null;
    setPending(null);
  }, []);

  const holder = pending ? (
    <ConfirmDialog
      confirmLabel={pending.confirmLabel}
      message={pending.message}
      title={pending.title}
      tone={pending.tone}
      onCancel={handleCancel}
      onConfirm={handleConfirm}
    />
  ) : null;

  return { confirm, holder };
}

function ConfirmDialog({
  confirmLabel,
  message,
  onCancel,
  onConfirm,
  title,
  tone,
}: ConfirmConfig & {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm px-4"
      onClick={onCancel}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
    >
      <div
        className={`w-full max-w-sm rounded-[1.5rem] p-5 shadow-2xl shadow-black/40 ${shellSurfaceClasses.workspace}`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-slate-100">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">{message}</p>
        <div className="mt-5 flex justify-end gap-3">
          <ActionButton tone="muted" onClick={onCancel}>
            Cancel
          </ActionButton>
          <ActionButton tone={tone} onClick={onConfirm}>
            {confirmLabel}
          </ActionButton>
        </div>
      </div>
    </div>
  );
}
