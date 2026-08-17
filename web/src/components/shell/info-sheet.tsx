import { useCallback, useEffect, useRef, useState } from "react";

import { Dialog, DialogContent } from "../ui/dialog";
import { shellSurfaceClasses } from "./shell-primitives";

/**
 * 信息字段（两列表格的一行）：label 弱化色右对齐，value 主体色左对齐 truncate。
 * value 由调用方装配（已 i18n + 格式化），本组件不区分语义。wrap=true 时 value 不 truncate、
 * break-all 完整换行显示（长 ID 类值，如 resume id 的 UUID，供用户核对/复制）。
 */
export type InfoField = {
  label: string;
  value: string;
  wrap?: boolean;
};

/** 信息弹窗形态：sheet = 移动端底部滑出；modal = 桌面端居中卡片。 */
export type InfoSheetVariant = "sheet" | "modal";

type PendingInfo = {
  fields: InfoField[];
  title: string;
  variant: InfoSheetVariant;
};

/**
 * 实例信息弹窗（移动端聚焦态 ℹ 按钮 + 桌面中栏 tab ℹ 按钮共用）。仿 useConfirm holder 模式：
 * 调用方 `const { open, holder } = useInstanceInfoSheet()`，`open(title, fields, variant?)` 触发，
 * `{holder}` 渲染到组件树。形态由 variant 决定——`sheet`（默认）= 移动端底部滑出
 * （`fixed inset-x-0 bottom-0 rounded-t-2xl`，手指可达 + safe-area 单点消费）；`modal` = 桌面端
 * 居中卡片（对齐 ConfirmDialog 桌面形态，`rounded-2xl p-5`）。backdrop 点击 / Esc 关闭。
 */
export function useInstanceInfoSheet() {
  const [pending, setPending] = useState<PendingInfo | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const open = useCallback(
    (title: string, fields: InfoField[], variant: InfoSheetVariant = "sheet") => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      setPending({ fields, title, variant });
    },
    [],
  );

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
    <InfoSheetDialog
      fields={pending.fields}
      onClose={close}
      title={pending.title}
      variant={pending.variant}
    />
  ) : null;

  return { open, close, holder };
}

function InfoSheetDialog({
  fields,
  onClose,
  title,
  variant,
}: PendingInfo & { onClose: () => void }) {
  if (variant === "modal") {
    return (
      <Dialog defaultOpen onOpenChange={(open) => !open && onClose()}>
        <DialogContent>
          <div
            className={`rounded-2xl p-5 shadow-2xl shadow-black/40 ${shellSurfaceClasses.workspace}`}
          >
            <h2 className="text-base font-semibold text-on-surface">{title}</h2>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2">
              {fields.map((field) => (
                <div className="contents" key={field.label}>
                  <dt className="text-xs text-on-surface-soft">{field.label}</dt>
                  <dd
                    className={`text-xs font-medium text-on-surface ${field.wrap ? "break-all" : "truncate"}`}
                  >
                    {field.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog defaultOpen onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="fixed inset-x-0 bottom-0 top-auto max-w-none w-full translate-x-0 translate-y-0 flex items-end justify-center">
        <div
          className={`w-full max-w-md rounded-t-2xl border-t border-neutral-line/60 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl shadow-black/40 ${shellSurfaceClasses.workspace}`}
        >
          <div className="mx-auto mb-2 h-1 w-8 rounded-full bg-on-surface/15" aria-hidden="true" />
          <h2 className="text-base font-semibold text-on-surface">{title}</h2>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2">
            {fields.map((field) => (
              <div className="contents" key={field.label}>
                <dt className="text-xs text-on-surface-soft">{field.label}</dt>
                <dd
                  className={`text-xs font-medium text-on-surface ${field.wrap ? "break-all" : "truncate"}`}
                >
                  {field.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </DialogContent>
    </Dialog>
  );
}
