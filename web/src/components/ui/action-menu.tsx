import {
  useCallback,
  useState,
  type ButtonHTMLAttributes,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from "react";

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
  /**
   * 桌面右键坐标触发（非空时在坐标渲染受控 popover，消费同一 items）。移动端忽略（触屏无右键）。
   * 调用方行/卡 `onContextMenu` → `useRowContextMenu()` 提供 point/close。
   */
  contextMenuPoint?: { x: number; y: number } | null;
  onContextMenuClose?: () => void;
};

/**
 * 统一菜单原语（DESIGN.md `action-menu / action-sheet`）。按视口自适应分流：
 * - 桌面（`sm:` 起）= Radix 锚定 popover（content/item token 见 `dropdown-menu.tsx`）；
 * - 移动（`max-sm:`）= 底部 action sheet（Radix Dialog scrim + 从底滑上 + 全宽 48px item + 取消 + safe-area）。
 *
 * 收敛历史四套菜单实现（Radix ×3、InstanceCard 手写、SessionDetail 手写）到同一声明式 API。
 * 桌面右键 = 同一原语坐标触发：调用方行/卡 `onContextMenu`（`useRowContextMenu`）→
 * `contextMenuPoint` 在坐标渲染受控 popover，消费同一 items（移动端无右键，触屏由 ⋯ 按钮承载）。
 */
export function ActionMenu({
  items,
  trigger,
  align = "end",
  cancelLabel,
  contextMenuPoint = null,
  onContextMenuClose,
}: ActionMenuProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  if (isMobile) {
    return (
      // contextMenuPoint 非空 = 行 onContextMenu（移动长按）触发：受控开 sheet（onOpenChange
      // false 时经 ctx.close 清 point 回非受控）。触屏无坐标 popover，长按语义 = 开 sheet。
      <Dialog
        open={open || contextMenuPoint !== null}
        onOpenChange={(next) => {
          if (!next) onContextMenuClose?.();
          setOpen(next);
        }}
      >
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        <DialogContent
          className={cn(
            "fixed inset-x-0 bottom-0 top-auto max-w-none w-full translate-x-0 translate-y-0 rounded-t-xl border-t border-neutral-line bg-surface-raised px-2 pt-2",
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

  const renderItems = () =>
    items.map((item, index) => (
      <DropdownMenuItem
        key={`${item.label}-${index}`}
        variant={item.variant}
        disabled={item.disabled}
        onSelect={() => item.onSelect()}
      >
        {item.icon}
        {item.label}
      </DropdownMenuItem>
    ));

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent align={align}>{renderItems()}</DropdownMenuContent>
      </DropdownMenu>
      {contextMenuPoint ? (
        <DropdownMenu
          open
          onOpenChange={(open) => {
            if (!open) onContextMenuClose?.();
          }}
        >
          <DropdownMenuTrigger asChild>
            <div
              className="fixed size-0"
              style={{ left: contextMenuPoint.x, top: contextMenuPoint.y }}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="bottom">
            {renderItems()}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </>
  );
}

/**
 * 行/卡级桌面右键菜单 state（与 ActionMenu 的 `contextMenuPoint` 配套）。**per-row key 设计**：
 * 列表多行共用一份 ctx，`openAt(key, e)` 记录 key，`pointFor(key)` 只对当前行返回坐标——
 * 避免非当前行的 ActionMenu 也收到非空 point 导致多菜单同时开。
 *
 *   const ctx = useRowContextMenu();
 *   <div onContextMenu={(e) => ctx.openAt(entry.path, e)}>
 *     <ActionMenu
 *       items={items}
 *       trigger={...}
 *       contextMenuPoint={ctx.pointFor(entry.path)}
 *       onContextMenuClose={ctx.close}
 *     />
 *   </div>
 *
 * 右键与拖放/点击不冲突：`onContextMenu` 独立事件，不经过 pointer-sequence / onClick。
 */
export function useRowContextMenu() {
  const [point, setPoint] = useState<{ key: string; x: number; y: number } | null>(null);
  const openAt = useCallback((key: string, e: MouseEvent) => {
    e.preventDefault();
    setPoint({ key, x: e.clientX, y: e.clientY });
  }, []);
  const close = useCallback(() => setPoint(null), []);
  const pointFor = useCallback(
    (key: string) => (point && point.key === key ? { x: point.x, y: point.y } : null),
    [point],
  );
  return { openAt, close, pointFor };
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
