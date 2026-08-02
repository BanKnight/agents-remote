import { type ButtonHTMLAttributes, type ReactElement } from "react";

import { ActionMenu, type ActionMenuItem } from "../ui/action-menu";
import { actionButtonClasses } from "./shell-primitives";
import { ShellIcon, type ShellIconName } from "./icons";
import { cn } from "../../lib/utils";

type MobileFabProps = {
  /** 读屏标签（必填——FAB 纯图标无可见文字）。 */
  ariaLabel: string;
  /** 图标，默认 plus。 */
  icon?: ShellIconName;
  /**
   * 直跳模式：点击直接触发（如全局总览「+ 新建项目」直开 Dialog）。与 `items` 互斥。
   * 菜单模式下此值应为 undefined（ActionMenu 经 asChild 注入 toggle）。
   */
  onClick?: () => void;
  /**
   * 菜单模式：点开 ActionMenu（项目工作区 Claude/Terminal、文件页 文件夹/上传）。
   * 移动端自动弹底部 sheet（ActionMenu 既有能力），桌面端锚定 popover。与 `onClick` 互斥。
   */
  items?: ActionMenuItem[];
  /** 桌面 popover 对齐（菜单模式），默认 end。 */
  align?: "start" | "center" | "end";
  /** 移动 sheet 末项「取消」文案（菜单模式）。 */
  cancelLabel?: string;
  disabled?: boolean;
};

// FAB 定位：fixed 锚视口右下角（三外壳结构不统一，absolute 会锚到漂移的 positioned 祖先；
// 三外壳/FilesPanel 路径无 transform 祖先，fixed 安全）。bottom 叠 safe-area + 底部 nav 实测高
//（--shell-mobile-bottom-nav-space）+ 0.75rem gap，浮 nav 正上方，落在内容滚动区已有的
// pb 空白区（不额外遮挡内容；超出 padding 上沿的部分压住 nav 正上方一行，用户滚动避开 = iOS 范式）。
// z-30 > 底部 nav z-20。lg:hidden 与 nav 同款 CSS 阈值（不用 useIsMobile，避免 639–1023px 间隙 +
// hydration 闪烁）。详见 DESIGN.md `floating-action-button` 条目。
const FAB_POSITION_CLASSES =
  "fixed right-3 z-30 lg:hidden " +
  "bottom-[calc(var(--shell-safe-area-bottom,0px)+var(--shell-mobile-bottom-nav-space,0px)+0.75rem)]";

// size-14（56px 触摸目标）+ rounded-full 圆形纯图标；p-0/justify-center 覆盖 actionButtonClasses
// 默认的 px-3 py-1.5。accent token 自带 from-primary to-secondary 渐变 + shadow-lg shadow-primary/25
// + active:bg-on-surface/10 press-feedback，不散写裸色。
const FAB_BASE_CLASSES = "size-14 rounded-full justify-center p-0";

/**
 * 移动端悬浮 FAB 胶囊（DESIGN.md `floating-action-button`）。承载页面单一主创造动作，
 * 解放二级 header 行到拇指热区。两种模式：
 * - 菜单模式（`items`）：底座 button 作 ActionMenu trigger，移动端点开弹底部 sheet。
 * - 直跳模式（`onClick`）：底座 button 直接触发。
 *
 * 桌面端不渲染（`lg:hidden`）；桌面入口由调用方在 header 保留（方案 B）。聚焦态不渲染
 * （FAB 挂在非聚焦态内容组件内，聚焦态走 MobileSessionFocus/MobileFileFocus 不渲染宿主）。
 */
export function MobileFab({
  ariaLabel,
  icon = "plus",
  onClick,
  items,
  align = "end",
  cancelLabel,
  disabled = false,
}: MobileFabProps) {
  const trigger: ReactElement<ButtonHTMLAttributes<HTMLButtonElement>> = (
    <button
      aria-label={ariaLabel}
      // cn/twMerge 合并：actionButtonClasses 是纯字符串拼接（不经 twMerge），FAB 的
      // size-14/rounded-full/p-0 必须经 cn 才能覆盖 base 的 h-auto/rounded-xl/px-3 py-1.5
      //（直接拼会被后者按 Tailwind v4 生成顺序覆盖，FAB 渲染成 56×44 圆角矩形而非 56 圆，probe-fab 验证）。
      className={cn(
        actionButtonClasses({ tone: "accent" }),
        FAB_POSITION_CLASSES,
        FAB_BASE_CLASSES,
      )}
      disabled={disabled}
      type="button"
      onClick={onClick}
    >
      <ShellIcon className="size-6" name={icon} />
    </button>
  );

  if (items && items.length > 0) {
    return <ActionMenu align={align} cancelLabel={cancelLabel} items={items} trigger={trigger} />;
  }
  return trigger;
}
