import * as React from "react";
import { Popover as PopoverPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

function Popover(props: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger(props: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverContent({
  className,
  align = "center",
  side = "bottom",
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        side={side}
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-50 rounded-xl border border-sep-strong bg-menu p-1.5 text-on-surface-soft shadow-2xl shadow-black/40 outline-none",
          // enter 走 spring snappy（轻量锚定层比居中 modal 快一档）；zoom/fade 幅度
          // 保持，新增 transform-origin 锚定触发源（skill §7 空间一致性，与 dropdown
          // 对齐）。变量注入机制见 dialog.tsx 同段注释。
          "[transform-origin:var(--radix-popover-content-transform-origin)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=open]:[--tw-ease:var(--spring-snappy)] data-[state=open]:[--tw-animation-duration:var(--spring-snappy-duration)] data-[state=closed]:[--tw-animation-duration:var(--duration-exit)]",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverContent, PopoverTrigger };
