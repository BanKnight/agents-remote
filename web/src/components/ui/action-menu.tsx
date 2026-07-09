import { useState, type ButtonHTMLAttributes, type ReactElement, type ReactNode } from "react";

import { useIsMobile } from "@/lib/use-is-mobile";
import { cn } from "@/lib/utils";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { Dialog, DialogContent, DialogTrigger } from "./dialog";

export type ActionMenuItemVariant = "default" | "destructive";

/**
 * 一条菜单项。`items` 在桌面 popover 与移动 action sheet 两条形态间共享同一份声明，
 * 调用方无需关心视口分流。icon 传**裸图标**（不带 size class），两端统一按 `size-4` 渲染
 * （DESIGN.md `action-menu` 条目：禁止散写 `h-3.5`）。
 */
export type ActionMenuItem = {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  variant?: ActionMenuItemVariant;
  disabled?: boolean;
};

type ActionMenuProps = {
  items: ActionMenuItem[];
  /**
   * 触发按钮（单个 `<button>` 元素）。两端均经 Radix `asChild` 注入 toggle/aria
   *（`composeEventHandlers` 先调调用方原有 onClick，如 `stopPropagation` 隔离卡片
   * onSelect，再 toggle），不覆盖原有行为。
   */
  trigger: ReactElement<ButtonHTMLAttributes<HTMLButtonElement>>;
  /** 桌面 popover 对齐，默认 end。 */
  align?: "start" | "center" | "end";
  /** 移动 sheet 末项「取消」文案。 */
  cancelLabel?: string;
};

/**
 * 统一菜单原语（DESIGN.md `action-menu / action-sheet`）。按视口自适应分流：
 * - 桌面（`sm:` 起）= Radix 锚定 popover（content/item token 见 `dropdown-menu.tsx`）；
 * - 移动（`max-sm:`）= 底部 action sheet（Radix Dialog scrim + 从底滑上 + 全宽 48px item + 取消 + safe-area）。
 *
 * 收敛历史四套菜单实现（Radix ×3、InstanceCard 手写、SessionDetail 手写）到同一声明式 API。
 * 桌面右键菜单（`onContextMenu` 坐标触发）不走本原语，保留为桌面快捷。
 */
export function ActionMenu({ items, trigger, align = "end", cancelLabel }: ActionMenuProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  if (isMobile) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        <DialogContent
          className={cn(
            "fixed inset-x-0 bottom-0 rounded-t-xl border-t border-neutral-line bg-surface-raised px-2 pt-2",
            "pb-[calc(env(safe-area-inset-bottom)+0.5rem)]",
            "shadow-2xl shadow-black/40",
            "slide-in-from-bottom duration-200 ease-out",
          )}
          aria-label={cancelLabel ?? "操作菜单"}
        >
          <div role="menu">
            {items.map((item, index) => (
              <button
                key={`${item.label}-${index}`}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                className={mobileSheetItemClasses(item.variant)}
                onClick={() => {
                  item.onSelect();
                  setOpen(false);
                }}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
            <div className="my-2 h-px bg-neutral-line" aria-hidden="true" />
            <button
              type="button"
              role="menuitem"
              className={mobileSheetItemClasses("default")}
              onClick={() => setOpen(false)}
            >
              <span className="w-full text-center text-on-surface-muted">
                {cancelLabel ?? "取消"}
              </span>
            </button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align={align}>
        {items.map((item, index) => (
          <DropdownMenuItem
            key={`${item.label}-${index}`}
            variant={item.variant}
            disabled={item.disabled}
            onSelect={() => item.onSelect()}
          >
            {item.icon}
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * 移动 sheet 菜单项样式（按 variant）。与桌面 `DropdownMenuItem` 共享同一视觉契约
 *（`size-4` icon、`text-sm font-semibold`、destructive=`error`），但移动端用 `min-h-[48px]`
 * 全宽 + `active:` 触摸反馈（非桌面 `focus:`/hover）。抽为纯函数便于单测（见 action-menu.test.ts）。
 */
export function mobileSheetItemClasses(variant: ActionMenuItemVariant = "default"): string {
  return cn(
    "flex w-full items-center gap-2.5 rounded-lg px-3 min-h-[48px] text-sm font-semibold transition",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
    variant === "destructive"
      ? "text-error active:bg-error/10"
      : "text-on-surface-soft active:bg-on-surface/5",
  );
}
