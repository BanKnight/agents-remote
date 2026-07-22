import { useState, type ButtonHTMLAttributes, type ReactElement } from "react";

import { useIsMobile } from "@/lib/use-is-mobile";
import { cn } from "@/lib/utils";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { Dialog, DialogContent, DialogTrigger } from "./dialog";

export type OptionMenuAccent = "user" | "permission" | "assistant";

/**
 * 一条选择器项。`items` 在桌面 popover 与移动 action sheet 两条形态间共享同一份声明，
 * 调用方无需关心视口分流。与 `ActionMenuItem` 的差别：选择器带「当前选中态」
 * （`isActive` → 勾选 + 角色色高亮 + `disabled` 不可重选当前项）。
 */
export type OptionMenuItem = {
  label: string;
  /** 标题下的副标题（muted 小字），如 model alias 对应的具体 ID。可选。 */
  description?: string;
  isActive?: boolean;
  onSelect: () => void;
};

type OptionMenuProps = {
  items: OptionMenuItem[];
  /**
   * 触发按钮（单个 `<button>` 元素）。两端均经 Radix `asChild` 注入 toggle/aria，
   * 不覆盖调用方原有 className / disabled（如 PermissionModeSelector 的 pending 态）。
   */
  trigger: ReactElement<ButtonHTMLAttributes<HTMLButtonElement>>;
  /** 选中态角色色（claude2 角色色刻意保留）：user / permission / assistant，默认 user。 */
  accent?: OptionMenuAccent;
  /** 桌面 popover 对齐，默认 start（model/mode 都左对齐向上展开）。 */
  align?: "start" | "center" | "end";
  /** 移动 sheet 末项「取消」文案。 */
  cancelLabel?: string;
};

/**
 * active 项的角色色 class（文字 + 淡背景）。桌面 popover 与移动 sheet 共用。
 * 抽为纯函数便于单测（对称 action-menu.tsx 的 `mobileSheetItemClasses`）。
 */
export function optionActiveClasses(accent: OptionMenuAccent = "user"): string {
  if (accent === "permission") return "text-permission bg-permission/10";
  if (accent === "assistant") return "text-assistant bg-assistant/10";
  return "text-user bg-user/10";
}

/** 移动 sheet 选择器项的垂直对齐。`center`（默认）= 单行项垂直居中；`start` = 含 description
 * 的多行项顶部对齐，让 label 顶部跨项对齐（对齐桌面 `DropdownMenuItem` 的 `py-2.5` 顶部基准，
 * 消除 `min-h-[48px]` + `items-center` 在多行/单行项间造成的 label 垂直错位）。 */
export type OptionItemAlign = "center" | "start";

/**
 * 移动 sheet 选择器项样式（按 active + accent）。与桌面 `DropdownMenuItem` 共享同一视觉契约
 *（`size-4` icon、`text-sm font-semibold`），但移动端用 `min-h-[48px]` 全宽 + `active:`
 * 触摸反馈。active 项叠角色色淡背景 + `opacity-100`（disabled 默认变暗，选择器需保留高亮）。
 *
 * `itemAlign='start'` 时 label 顶部 = `py-2.5`（= 桌面端基准），含 description 的多行项与
 * 同菜单的单行项 label 行对齐；`py-2.5` 对单行 `center` 项无视觉影响（`min-h-[48px]` 主导）。
 */
export function mobileOptionItemClasses(
  isActive: boolean,
  accent: OptionMenuAccent = "user",
  itemAlign: OptionItemAlign = "center",
): string {
  return cn(
    // text-left 覆盖 `<button>` 的 UA 默认 text-align:center——否则 col 内 label/desc span
    // 拉伸到 col 宽（= desc 宽）后，短 label 文本在宽 span 内居中，视觉上偏到 desc 中间。
    // 桌面端 DropdownMenuItem 是 `<div>`（UA 默认 left），无需此覆盖。取消按钮 span 显式
    // text-center，不受影响。
    "flex w-full gap-2.5 rounded-lg px-3 py-2.5 min-h-[48px] text-left text-sm font-semibold transition",
    itemAlign === "start" ? "items-start" : "items-center",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
    isActive
      ? cn(optionActiveClasses(accent), "opacity-100")
      : "text-on-surface-soft active:bg-on-surface/5",
  );
}

// active 项勾选 icon（复用 selector 桌面 active checkmark path）。
const CheckIcon = (
  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M3 8l3.5 3.5L13 5"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// 移动底部 sheet 容器样式（照搬 ActionMenu 移动 sheet：scrim + 从底滑上 + safe-area 单点避让）。
const MOBILE_SHEET_CLASSES = cn(
  "fixed inset-x-0 bottom-0 top-auto max-w-none w-full translate-x-0 translate-y-0 rounded-t-xl border-t border-neutral-line bg-surface-raised px-2 pt-2",
  "pb-[calc(env(safe-area-inset-bottom)+0.5rem)]",
  "shadow-2xl shadow-black/40",
  "slide-in-from-bottom duration-200 ease-out",
);

/**
 * 选择器菜单原语（DESIGN.md `action-menu` 条目「锚定选择器菜单」）。与 `<ActionMenu>` 对称，
 * 按视口自适应分流：
 * - 桌面（`sm:` 起）= Radix 锚定 popover（content/item token 见 `dropdown-menu.tsx`）；
 * - 移动（`max-sm:`）= 底部 action sheet（Radix Dialog scrim + 从底滑上 + 全宽 48px item + 取消 + safe-area）。
 *
 * 与 `ActionMenu`（动作列表，无选中态）语义分离：本原语管「带当前选中态的选择器」，
 * active 项勾选 + 角色色 + `disabled`（不可重选当前项）。移动端用受控 `open` state
 *（item 选中 / 取消按钮主动关；scrim / Esc 走 `onOpenChange`）。
 */
export function OptionMenu({
  items,
  trigger,
  accent = "user",
  align = "start",
  cancelLabel,
}: OptionMenuProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  // 含 description（如 model alias + 具体 ID 配对）→ 移动端整列 items-start，让 label 行跨项对齐。
  const hasDescription = items.some((item) => item.description);

  if (isMobile) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        <DialogContent className={MOBILE_SHEET_CLASSES} aria-label={cancelLabel ?? "选择菜单"}>
          <div role="menu">
            {items.map((item, index) => (
              <button
                key={`${item.label}-${index}`}
                type="button"
                role="menuitem"
                disabled={item.isActive}
                className={mobileOptionItemClasses(
                  item.isActive === true,
                  accent,
                  hasDescription ? "start" : "center",
                )}
                onClick={() => {
                  if (item.isActive) return;
                  item.onSelect();
                  setOpen(false);
                }}
              >
                {item.isActive ? CheckIcon : <span className="size-4 shrink-0" />}
                <span className="flex min-w-0 flex-col">
                  <span>{item.label}</span>
                  {item.description ? (
                    <span className="text-xs font-normal text-on-surface-muted">
                      {item.description}
                    </span>
                  ) : null}
                </span>
              </button>
            ))}
            <div className="my-2 h-px bg-neutral-line" aria-hidden="true" />
            <button
              type="button"
              role="menuitem"
              className={mobileOptionItemClasses(false, accent)}
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
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align={align} side="top" sideOffset={4}>
        {items.map((item, index) => (
          <DropdownMenuItem
            key={`${item.label}-${index}`}
            disabled={item.isActive}
            className={
              item.isActive
                ? cn(optionActiveClasses(accent), "data-[disabled]:opacity-100")
                : "text-on-surface-muted"
            }
            onSelect={() => item.onSelect()}
          >
            {item.isActive ? CheckIcon : <span className="size-4 shrink-0" />}
            <span className="flex min-w-0 flex-col">
              <span>{item.label}</span>
              {item.description ? (
                <span className="text-xs font-normal text-on-surface-muted">
                  {item.description}
                </span>
              ) : null}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
