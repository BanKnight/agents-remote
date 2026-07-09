import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * Dialog 原语（shadcn 风格封装，对齐 `dropdown-menu.tsx` 样板）。
 *
 * `modal` 默认 true（Radix 默认）→ `DialogContentModal` 自动启用三层 dismissable 机制
 *（react-dialog L199/L204/L281）：`disableOutsidePointerEvents: open`（body pointer-lock）+
 * `onPointerDownOutside`（pointerdown 阶段判定 outside，早于 click）+ `deferPointerDownOutside`
 *（推迟 dismiss 让事件走完）。三者合一覆盖 scrim-only overlay 的 ghost-click 缺口——
 * 手写 scrim 用 `onClick` 在 click 阶段关闭，同一次 touch 手势的剩余合成 click 会落到刚暴露
 * 的下层元素；Radix 在 pointerdown 阶段判定 + defer 关闭，机制级杜绝穿透。
 *
 * 形态（居中 modal / 底部 sheet / 全屏）靠调用方 `className` 覆盖，封装不硬编码 variant——
 * 仅提供 Portal + Overlay（scrim）+ Content 基础动画骨架 + Radix 内置 focus trap / Esc / dismiss。
 */
function Dialog({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({ ...props }: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogClose({ ...props }: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogTitle({ ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title data-slot="dialog-title" {...props} />;
}

function DialogDescription({ ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description data-slot="dialog-description" {...props} />;
}

function DialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        data-slot="dialog-overlay"
        className={cn(
          "fixed inset-0 z-50 bg-black/60 backdrop-blur-sm",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0",
        )}
      />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "pointer-events-auto z-50 outline-none",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0",
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export { Dialog, DialogTrigger, DialogClose, DialogTitle, DialogDescription, DialogContent };
