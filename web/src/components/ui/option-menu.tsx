import { useState, type ButtonHTMLAttributes, type ReactElement, type ReactNode } from "react";

import { useIsMobile } from "@/lib/use-is-mobile";
import { cn } from "@/lib/utils";

import { MobileSheet } from "@/components/shell/mobile-sheet";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./dropdown-menu";

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
  /** 选中态角色色（claude 角色色刻意保留）：user / permission / assistant，默认 user。 */
  accent?: OptionMenuAccent;
  /** 桌面 popover 对齐，默认 start（model/mode 都左对齐向上展开）。 */
  align?: "start" | "center" | "end";
  /** 移动 sheet 末项「取消」文案。 */
  cancelLabel?: string;
  /**
   * 形态覆写（默认 "auto" = 按 useIsMobile 分流：移动 sheet / 桌面锚定 popover）。
   * "anchored" = 强制 Radix 锚定 popover（窄端触屏也原位上方弹出）——v1.4 03a composer
   * 选择器菜单语义（点 .iicn 图标原位上方弹选项，不再落底部 sheet）。
   */
  presentation?: "auto" | "anchored";
  /**
   * anchored 菜单头（03a `.mh`：mini tint 图标 + 标题行，纯展示非 menuitem）。仅在
   * 锚定 popover 形态渲染；sheet 形态不需要（标题语义由整卡布局承载）。典型经
   * composer-controls 的 `MenuHeader` 组装。
   */
  menuHeader?: ReactNode;
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
 * 消除 `min-h-[45px]` + `items-center` 在多行/单行项间造成的 label 垂直错位）。 */
export type OptionItemAlign = "center" | "start";

/**
 * 移动 sheet 选择器项样式（按 active + accent）。与桌面 `DropdownMenuItem` 共享同一视觉契约
 *（v1.5 §5.0 标准档：45px 行 / 17px 图标 / 行内 gap 14 / `text-sm font-semibold`——批 8
 * 对齐，此前 48px/gap-2.5/size-4），移动端全宽 + `active:` 触摸反馈。active 项叠角色色淡
 * 背景 + `opacity-100`（disabled 默认变暗，选择器需保留高亮）。
 *
 * `itemAlign='start'` 时 label 顶部 = `py-2.5`（= 桌面端基准），含 description 的多行项与
 * 同菜单的单行项 label 行对齐；`py-2.5` 对单行 `center` 项无视觉影响（`min-h-[45px]` 主导）。
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
    "flex w-full gap-3.5 rounded-lg px-3 py-2.5 min-h-[45px] text-left text-sm font-semibold transition",
    itemAlign === "start" ? "items-start" : "items-center",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[17px]",
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
  presentation = "auto",
  menuHeader,
}: OptionMenuProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  // 含 description（如 model alias + 具体 ID 配对）→ 移动端整列 items-start，让 label 行跨项对齐。
  const hasDescription = items.some((item) => item.description);

  if (presentation === "auto" && isMobile) {
    return (
      <MobileSheet ariaLabel="选择菜单" onOpenChange={setOpen} open={open} trigger={trigger}>
        {/* .msheet 自带 max-height 内滚（frontend-notes §8），无需内部再设滚动约束。
            条目间分割线（批 14）：.menu-sep 伪元素全宽直线（同 action-menu 移动分支，
            容器无横 padding）；取消项进线链，分组间距由取消项 mt-2 恢复。 */}
        <div className="menu-sep" role="menu">
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
          <button
            type="button"
            role="menuitem"
            // 取消项 mt-2 = iOS 分组间距（同 action-menu 移动分支，design review P2-1）。
            className={cn(mobileOptionItemClasses(false, accent), "mt-2")}
            onClick={() => setOpen(false)}
          >
            <span className="w-full text-center text-on-surface-muted">
              {cancelLabel ?? "取消"}
            </span>
          </button>
        </div>
      </MobileSheet>
    );
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        side="top"
        sideOffset={4}
        // 条目间分割线 = .menu-sep 伪元素全宽直线（v2-primitives 单源；.mh 头在规则内
        // 排除——原型 .optmenu .mh 非 .row 不参与线链）；[--menu-pad-x] 与基线 p-1.5
        // 同值，负 inset 抵消内距成全宽。
        className="menu-sep max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto [--menu-pad-x:6px]"
      >
        {menuHeader}
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
