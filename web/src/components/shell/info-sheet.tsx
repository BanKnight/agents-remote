import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import { Dialog, DialogContent } from "../ui/dialog";
import { shellSurfaceClasses } from "./shell-primitives";

/**
 * 信息字段（03k .krow 行族）：k = label 弱化色（text-ink-2），v = value 主体色右对齐（ml-auto）。
 * mono=true → .v.mono（monospace 小号，ID/路径类值，如 resume id）；wrap=true 时 value 不
 * truncate、break-all 完整换行（与 mono 常配合）。value 与 action 互斥；action 行（如自动重试
 * 的开关+编辑按钮）value 为空时渲染。
 * onSelect（第八轮批次 2b）：行可点下钻（03k:65-67 模型/权限/推理 effort 三设置行带 › chevron，
 * 点开运行配置选择面）——有则整行可点（cursor + active 态）+ value 侧渲染 › 右 chevron
 *（对齐会话页 selector trigger 的内联 chevron 风格）；无则纯展示行。
 */
export type InfoField = {
  label: string;
  value: string;
  wrap?: boolean;
  mono?: boolean;
  /** action 行内容（开关/按钮等交互元素）；渲染在 dd 位置，value 被忽略。 */
  action?: ReactNode;
  /** 行可点下钻（渲染 › chevron affordance）；缺省纯展示。 */
  onSelect?: () => void;
};

/** 信息弹窗形态：sheet = 移动端底部滑出；modal = 桌面端居中卡片。 */
export type InfoSheetVariant = "sheet" | "modal";

type PendingInfo = {
  fields: InfoField[];
  title: string;
  variant: InfoSheetVariant;
  /** 标题下状态行（03k：「● 运行中 · 已 12 分钟」，success 色小字）；缺省不渲染。 */
  status?: string;
  /** 可选 footer slot（03k .acts 操作行等）。渲染在 krow 行族下方，样式由调用方自带，本组件不感知语义。 */
  footer?: ReactNode;
};

/**
 * 实例信息弹窗（移动端聚焦态 ℹ 按钮 + 桌面中栏 tab ℹ 按钮共用）。仿 useConfirm holder 模式：
 * 调用方 `const { open, holder } = useInstanceInfoSheet()`，`open(title, fields, variant?, {status, footer})`
 * 触发，`{holder}` 渲染到组件树。形态由 variant 决定——`sheet`（默认）= 移动端底部滑出
 *（手指可达 + safe-area 单点消费）；`modal` = 桌面端居中卡片。
 * 结构对齐 03k-sheet-instance-info：grab → shd h2（17px/600）→ 状态行（12px/600 success）→
 * sep-row 分隔 → krow 行族（行间 border-top）→ footer 区。backdrop 点击 / Esc 关闭。
 */
export function useInstanceInfoSheet() {
  const [pending, setPending] = useState<PendingInfo | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const open = useCallback(
    (
      title: string,
      fields: InfoField[],
      variant: InfoSheetVariant = "sheet",
      footer?: ReactNode,
      status?: string,
    ) => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      setPending({ fields, footer, status, title, variant });
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
      footer={pending.footer}
      onClose={close}
      status={pending.status}
      title={pending.title}
      variant={pending.variant}
    />
  ) : null;

  return { open, close, holder };
}

function InfoSheetDialog({
  fields,
  footer,
  onClose,
  status,
  title,
  variant,
}: PendingInfo & { onClose: () => void }) {
  const body = (
    <>
      <h2 className="text-title font-semibold text-ink-1">{title}</h2>
      {status ? (
        <p className="mt-0.5 text-caption font-semibold text-success-text">{status}</p>
      ) : null}
      <div className="mt-2.5 border-t border-sep-row" />
      <dl className="divide-y divide-sep-row">
        {fields.map((field) => (
          <div
            className={
              field.onSelect
                ? "flex cursor-pointer items-center py-[11px] text-footnote transition active:opacity-60"
                : "flex items-center py-[11px] text-footnote"
            }
            key={field.label}
            onClick={field.onSelect}
            role={field.onSelect ? "button" : undefined}
          >
            <dt className="text-ink-2">{field.label}</dt>
            <dd
              className={cn(
                "ml-auto flex min-w-0 items-center gap-[2px] text-ink-1",
                field.mono ? "font-mono text-caption" : "",
                field.wrap ? "break-all" : field.onSelect ? "max-w-[60%] truncate" : "truncate",
              )}
            >
              {field.action ?? field.value}
              {field.onSelect ? (
                <svg
                  aria-hidden="true"
                  className="h-3 w-3 shrink-0 text-ink-3"
                  fill="none"
                  viewBox="0 0 16 16"
                >
                  <path
                    d="M6 4l4 4-4 4"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.5"
                  />
                </svg>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
      {footer ? (
        // 03k .acts 操作行语义：点击行内按钮（动作已触发）即收起 sheet——委托关闭，调用方
        // 装配的 footer 无需感知 close（当前消费方 = MobileFocusActions 的重命名/置顶/关闭）。
        <div
          className="mt-1.5"
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("button")) onClose();
          }}
        >
          {footer}
        </div>
      ) : null}
    </>
  );

  if (variant === "modal") {
    return (
      <Dialog defaultOpen onOpenChange={(open) => !open && onClose()}>
        <DialogContent>
          <div
            className={`rounded-2xl p-5 shadow-2xl shadow-black/40 ${shellSurfaceClasses.workspace}`}
          >
            {body}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog defaultOpen onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="fixed inset-x-0 bottom-0 top-auto max-w-none w-full translate-x-0 translate-y-0 flex items-end justify-center">
        <div
          className={`w-full max-w-md rounded-t-[20px] border-t border-sep bg-elevated px-5 pt-1 pb-[max(12px,env(safe-area-inset-bottom))] shadow-2xl shadow-black/40`}
        >
          <div
            className="mx-auto mb-2.5 mt-3 h-[5px] w-10 rounded-[3px] bg-ink-3"
            aria-hidden="true"
          />
          {body}
          {/* 底部留白（原型 .sheet padding-bottom:12px，safe-area 单点消费于外壳 pb） */}
          <div className="h-1" aria-hidden="true" />
        </div>
      </DialogContent>
    </Dialog>
  );
}
