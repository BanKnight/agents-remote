import {
  cloneElement,
  useEffect,
  useState,
  type ButtonHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { useIsMobile } from "@/lib/use-is-mobile";
import { cn } from "@/lib/utils";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./dropdown-menu";

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
   * 触发按钮（单个 `<button>` 元素）。桌面端经 Radix `asChild` 注入 toggle/aria；
   * 移动端 cloneElement 注入 onClick 打开 sheet——会先调用调用方自身的 onClick
   *（如 `stopPropagation` 隔离卡片 onSelect），再打开，不覆盖原有行为。
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
 * - 移动（`max-sm:`）= 底部 action sheet（scrim + 从底滑上 + 全宽 48px item + 取消 + safe-area）。
 *
 * 收敛历史四套菜单实现（Radix ×3、InstanceCard 手写、SessionDetail 手写）到同一声明式 API。
 * 桌面右键菜单（`onContextMenu` 坐标触发）不走本原语，保留为桌面快捷。
 */
export function ActionMenu({ items, trigger, align = "end", cancelLabel }: ActionMenuProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  if (isMobile) {
    return (
      <>
        {cloneElement(trigger, {
          onClick: (event) => {
            trigger.props.onClick?.(event);
            setOpen(true);
          },
          "aria-haspopup": "menu",
          "aria-expanded": open,
        })}
        {open ? (
          <MobileActionSheet
            items={items}
            cancelLabel={cancelLabel}
            onClose={() => setOpen(false)}
          />
        ) : null}
      </>
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
 * 移动端底部 action sheet。portal 到 body（不受 transform 祖先影响，与桌面 Radix portal 对齐）。
 * scrim `rgb(0 0 0/0.6)` 点击关闭 + Esc 关闭；sheet `surface-raised` + `rounded-t-xl` +
 * `slide-in-from-bottom`；底部 `env(safe-area-inset-bottom)` 单点避让（不叠 vh/dvh）。
 * 顶层组件（不内嵌定义），满足 `rerender-no-inline-components`。
 */
function MobileActionSheet({
  items,
  cancelLabel,
  onClose,
}: {
  items: ActionMenuItem[];
  cancelLabel?: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/60"
      role="presentation"
      onClick={onClose}
    >
      <div
        className={cn(
          "w-full rounded-t-xl border-t border-neutral-line bg-surface-raised px-2 pt-2",
          "pb-[calc(env(safe-area-inset-bottom)+0.5rem)]",
          "shadow-2xl shadow-black/40",
          "animate-in slide-in-from-bottom duration-200 ease-out",
        )}
        role="menu"
        onClick={(event) => event.stopPropagation()}
      >
        {items.map((item, index) => (
          <button
            key={`${item.label}-${index}`}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            className={mobileSheetItemClasses(item.variant)}
            onClick={() => {
              item.onSelect();
              onClose();
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
          onClick={onClose}
        >
          <span className="w-full text-center text-on-surface-muted">{cancelLabel ?? "取消"}</span>
        </button>
      </div>
    </div>,
    document.body,
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
