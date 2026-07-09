import { useCallback, useEffect, useRef, useState } from "react";

import { Dialog, DialogContent } from "../ui/dialog";
import { shellSurfaceClasses } from "./shell-primitives";

/**
 * 信息字段（底部 sheet 两列表格的一行）：label 弱化色右对齐，value 主体色左对齐 truncate。
 * value 由调用方装配（已 i18n + 格式化），本组件不区分语义。
 */
export type InfoField = {
  label: string;
  value: string;
};

type PendingInfo = {
  fields: InfoField[];
  title: string;
};

/**
 * 实例信息底部 sheet（移动端聚焦态 ℹ 按钮触发）。仿 useConfirm holder 模式：调用方
 * `const { open, holder } = useInstanceInfoSheet()`，`open(title, fields)` 触发，
 * `{holder}` 渲染到组件树。底部 sheet（`fixed inset-x-0 bottom-0 rounded-t-2xl`）
 * 符合移动端手指可达习惯；backdrop 点击 / Esc 关闭。safe-area padding-bottom 单点消费
 * `env(safe-area-inset-bottom)`（memory safe-area-fixed-bottom-nav-padding：env 不与 dvh 叠加）。
 */
export function useInstanceInfoSheet() {
  const [pending, setPending] = useState<PendingInfo | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const open = useCallback((title: string, fields: InfoField[]) => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setPending({ fields, title });
  }, []);

  const close = useCallback(() => {
    // 延迟清空让退出动画（若有 transition）跑完；当前无动画，仅统一退出路径。
    closeTimerRef.current = setTimeout(() => setPending(null), 0);
  }, []);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  const holder = pending ? (
    <InfoSheetDialog fields={pending.fields} onClose={close} title={pending.title} />
  ) : null;

  return { open, close, holder };
}

function InfoSheetDialog({ fields, onClose, title }: PendingInfo & { onClose: () => void }) {
  return (
    <Dialog defaultOpen onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="fixed inset-x-0 bottom-0 translate-x-0 translate-y-0 flex items-end justify-center">
        <div
          className={`w-full max-w-md rounded-t-2xl border-t border-neutral-line/60 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl shadow-black/40 ${shellSurfaceClasses.workspace}`}
        >
          <div className="mx-auto mb-2 h-1 w-8 rounded-full bg-on-surface/15" aria-hidden="true" />
          <h2 className="text-base font-semibold text-on-surface">{title}</h2>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2">
            {fields.map((field) => (
              <div className="contents" key={field.label}>
                <dt className="text-xs text-on-surface-muted">{field.label}</dt>
                <dd className="truncate text-xs font-medium text-on-surface">{field.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </DialogContent>
    </Dialog>
  );
}
