import * as React from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";

import { cn } from "@/lib/utils";

function DropdownMenu({ ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} />;
}

function DropdownMenuTrigger({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  return <DropdownMenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />;
}

function DropdownMenuContent({
  className,
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        className={cn(
          // v1.5 §5.0 族A 锚定浮卡材质单源（components.css：--menu 底 / sep-strong 边 /
          // r14 圆角）——批 8 浮层两族对齐（02c 取值菜单先例）。
          "z-50 min-w-[10rem] overflow-hidden rounded-[14px] border border-sep-strong bg-menu p-1.5 text-on-surface-soft shadow-2xl shadow-black/40 backdrop-blur-md",
          // enter 走 spring snappy（与 popover 同档：轻量锚定层）；zoom 幅度、方向
          // 位移（skill §8 hint in direction）与 transform-origin 锚定触发源（§7）
          // 全保持，只换 timing。变量注入机制见 dialog.tsx 同段注释。
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 [transform-origin:var(--radix-dropdown-menu-content-transform-origin)] data-[state=open]:[--tw-ease:var(--spring-snappy)] data-[state=open]:[--tw-animation-duration:var(--spring-snappy-duration)] data-[state=closed]:[--tw-animation-duration:var(--duration-exit)]",
          "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

function DropdownMenuItem({
  className,
  inset,
  variant = "default",
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & {
  inset?: boolean;
  variant?: "default" | "destructive";
}) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        // v1.5 §5.0 标准档（02c/09b：45px 行 / 14 字 / 17 图标 / 行内 gap 14）。
        "relative flex min-h-[45px] cursor-pointer select-none items-center gap-3.5 rounded-lg px-3 py-2.5 text-sm font-semibold outline-none transition",
        "focus:bg-accent focus:text-accent-foreground",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[17px]",
        variant === "destructive" && "text-error focus:bg-error/10 focus:text-error",
        inset && "pl-8",
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      // 行间 1px --sep 分隔（v1.5 §5.0 标准档材质），替换存量散写 bg-white/10。
      className={cn("-mx-1 my-1 h-px bg-sep", className)}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
};
