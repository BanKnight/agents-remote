import {
  useCallback,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode,
  useEffect,
} from "react";

import { useIsMobile } from "@/lib/use-is-mobile";
import { cn } from "@/lib/utils";

import { MobileSheet } from "@/components/shell/mobile-sheet";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./dropdown-menu";

export type ActionMenuItemVariant = "default" | "destructive";

/**
 * 一条菜单项。`items` 在桌面 popover 与移动 action sheet 两条形态间共享同一份声明，
 * 调用方无需关心视口分流。icon 传**裸图标**（ShellIcon / LucideIcon 均可），两端容器
 * 统一按 17px 渲染——DropdownMenuItem 与 mobileSheetItemClasses 的 svg 兜底 + ShellIcon
 * span 兜底 `[&_[data-shell-icon]]`（v1.5 §5.0 标准档行图标 17；菜单内 icon 尺寸不是
 * 调用方自由度，禁止散写 `h-3.5` 等私有尺寸。显式 `size-[17px]` 亦接受=同值冗余，历史
 * 消费点剥除留后续批，design review P2-3）。
 */
export type ActionMenuItem = {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  variant?: ActionMenuItemVariant;
  disabled?: boolean;
  /**
   * 行尾标注（v1.6 ⋯ 菜单：toggle 行右端 ✓ 主色 / 导航行右端 ›），两端右对齐渲染。
   */
  trailing?: ReactNode;
  /**
   * 点击后保持菜单打开（v1.6 toggle 行「即点即改」：置顶/自动重试切换后 ✓ 实时更新，
   * 菜单不闪关）。桌面 = Radix onSelect preventDefault；移动 = 跳过 setOpen(false)。
   */
  keepOpen?: boolean;
  /**
   * 逐项显隐/微调类（两端形态同落）。composer 附件菜单「相机」用它做仅触屏显隐
   *（`hidden touch:inline-flex`，能力判定按 pointer media，frontend-notes §7）。
   */
  className?: string;
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
  /**
   * 半受控开合（可选）：传 `open` 即完全受控（快捷键 ⌘N 程序化打开创建菜单），不传为
   * 非受控（trigger 自管）。onOpenChange 在两端形态（Dialog/DropdownMenu）统一回调。
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
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
  open: openProp,
  onOpenChange,
}: ActionMenuProps) {
  const isMobile = useIsMobile();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = (next: boolean) => {
    setInternalOpen(next);
    onOpenChange?.(next);
  };

  if (isMobile) {
    // contextMenuPoint 非空 = 行 onContextMenu（移动长按）触发：受控开 sheet（onOpenChange
    // false 时经 ctx.close 清 point 回非受控）。触屏无坐标 popover，长按语义 = 开 sheet。
    return (
      <MobileSheet
        ariaLabel="操作菜单"
        open={open || contextMenuPoint !== null}
        onOpenChange={(next) => {
          if (!next) onContextMenuClose?.();
          setOpen(next);
        }}
        trigger={trigger}
      >
        {/* 逐项交错入场（移动端动效批）：Radix Portal 每次开 = 全新 DOM，animation
            天然每次播放；菜单项静态无重排 = 无 insertBefore 重播面（frontend-notes
            §17 判定通过）。28ms 步进 × 菜单项数，cap 224ms 兜底长菜单。 */}
        {/* 条目间分割线（批 14）：.menu-sep 伪元素全宽直线（原型 .ctx .row + .row --sep，
            v2-primitives 单源；容器无横 padding，--menu-pad-x 默认 0）；取消项进线链，
            分组间距由取消项自身 mt-2 恢复。 */}
        <div className="animate-stagger-rows menu-sep" role="menu">
          {items.map((item, index) => (
            <button
              key={`${item.label}-${index}`}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              className={cn(mobileSheetItemClasses(item.variant), item.className)}
              onClick={(e) => {
                // portal 合成事件按 fiber 树冒泡（frontend-notes §4）：menuitem 的 click
                // 会冒到行/卡 onClick（如文件行 onOpenFile 导航），必须拦；否则 onSelect
                // 开的对话框随导航卸载、行又同步执行了导航。
                e.stopPropagation();
                // 长按路径 open 受控于 contextMenuPoint，setOpen(false) 关不掉——
                // 必须同时清（否则 sheet 残留与 onSelect 打开的对话框层叠抢焦点）。
                onContextMenuClose?.();
                item.onSelect();
                if (!item.keepOpen) setOpen(false);
              }}
            >
              {item.icon}
              <span>{item.label}</span>
              {item.trailing ? (
                <span className="ml-auto flex flex-none items-center">{item.trailing}</span>
              ) : null}
            </button>
          ))}
          <button
            type="button"
            role="menuitem"
            // 取消项与末业务项之间恢复 8px 分组间距（批 14 design review P2-1：iOS action
            // sheet 取消独立分组惯例；线制保留——线属业务组末行 border-bottom）。
            className={cn(mobileSheetItemClasses("default"), "mt-2")}
            onClick={(e) => {
              e.stopPropagation();
              onContextMenuClose?.();
              setOpen(false);
            }}
          >
            <span className="w-full text-center text-on-surface-muted">
              {cancelLabel ?? "取消"}
            </span>
          </button>
        </div>
      </MobileSheet>
    );
  }

  const renderItems = () =>
    items.map((item, index) => (
      <DropdownMenuItem
        key={`${item.label}-${index}`}
        variant={item.variant}
        disabled={item.disabled}
        className={item.className}
        onSelect={(e) => {
          item.onSelect();
          // Radix onSelect 默认关菜单；preventDefault 保持打开（toggle 行即点即改）。
          if (item.keepOpen) e.preventDefault();
        }}
      >
        {item.icon}
        {item.label}
        {item.trailing ? (
          <span className="ml-auto flex flex-none items-center">{item.trailing}</span>
        ) : null}
      </DropdownMenuItem>
    ));

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        {/* 条目间分割线（批 14）：.menu-sep 伪元素全宽直线（原型 .ctx .row+.row；divide 系
            border 随 item rounded-lg 上翘被真机否决，v2-primitives 单源）。[--menu-pad-x]
            与基线 p-1.5 同值，负 inset 抵消内距成全宽。 */}
        <DropdownMenuContent align={align} className="menu-sep [--menu-pad-x:6px]">
          {renderItems()}
        </DropdownMenuContent>
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
          <DropdownMenuContent align="start" side="bottom" className="menu-sep [--menu-pad-x:6px]">
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

/** 触屏长按触发阈值与位移 slop（03w 定值：iOS Safari 无 contextmenu，必须计时触发）。 */
const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP_PX = 10;

/**
 * 触屏长按 → `useRowContextMenu().openAt`（02c pill / 03w 文件行共享）。移动超 slop 或提前
 * 松手取消；触发后 `guardClick()` 返回 true 一次——消费侧行/ pill 的 onClick 首行先查它，
 * 抑制长按后紧随的合成 click（否则长按 pill 会同时切实例/进目录）。桌面右键走 `onContextMenu`
 * 独立路径，不经此 hook。
 */
export function useLongPressActions(openAt: (key: string, e: MouseEvent) => void) {
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStart = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const clearPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
    pressStart.current = null;
  };
  useEffect(() => clearPress, []);
  const bind = (key: string) => ({
    onPointerDown: (e: ReactPointerEvent) => {
      suppressClick.current = false;
      if (e.pointerType !== "touch") return;
      pressStart.current = { x: e.clientX, y: e.clientY };
      pressTimer.current = setTimeout(() => {
        pressTimer.current = null;
        suppressClick.current = true;
        openAt(key, e);
      }, LONG_PRESS_MS);
    },
    onPointerMove: (e: ReactPointerEvent) => {
      const s = pressStart.current;
      if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > LONG_PRESS_SLOP_PX) clearPress();
    },
    onPointerUp: clearPress,
    onPointerCancel: clearPress,
    onPointerLeave: clearPress,
  });
  const guardClick = () => {
    if (!suppressClick.current) return false;
    suppressClick.current = false;
    return true;
  };
  return { bind, guardClick };
}

/**
 * 移动 sheet 菜单项样式（按 variant）。与桌面 `DropdownMenuItem` 共享同一视觉契约
 *（17px icon、`text-sm font-semibold`、destructive=`error`），但移动端用全宽 +
 * `active:` 触摸反馈（非桌面 `focus:`/hover）。抽为纯函数便于单测（见 action-menu.test.ts）。
 */
export function mobileSheetItemClasses(variant: ActionMenuItemVariant = "default"): string {
  return cn(
    // 按压统一（移动端动效批）：菜单项按下 scale 0.98（行/卡片同档）；裸 transition 收窄为
    // [scale,background-color]（§20 裸 transition = 23 属性大表；§19 scale 须显式列出）。
    // v1.5 §5.0 标准档对齐（批 8）：45px 行 / 17px 图标 / 行内 gap 14（此前 48px/16px/10px）。
    "flex w-full items-center gap-3.5 rounded-lg px-3 min-h-[45px] text-sm font-semibold transition-[scale,background-color] duration-[var(--duration-fast)] active:scale-[0.98]",
    // icon 17px 兜底两条（同 DropdownMenuItem 注释）：svg + ShellIcon span 锚点。
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[17px] [&_[data-shell-icon]]:size-[17px]",
    variant === "destructive"
      ? "text-error active:bg-error/10"
      : "text-on-surface-soft active:bg-on-surface/5",
  );
}
