import type { ReactNode } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * v2 移动 sheet 容器（M5 浮层族 03j/03k/03l/03n/08/11 共用原语，§6.4 摊牌 3）：
 * Radix Dialog `modal`——scrim/Esc/focus-trap/body-lock 全交 Radix（frontend-notes §4，
 * 调用方在带 onClick 的祖先自行 contains 判断）。Content 定位与视觉 = v2 原语 `.msheet`
 * （fixed 底部避 safe-area、radius 20、max-height 内滚，frontend-notes §8 高度链）；
 * 结构 = grab 条 + shd（.shd h2 17px/600 标题 + 右侧 .shd .aside 12px ink-2）+ children。
 * 退出动画 fill-mode-forwards 保持终态防闪（frontend-notes §9）。
 */
export function MobileSheet({
  aside,
  children,
  headerExtra,
  onOpenChange,
  open,
  title,
}: {
  /** shd 右侧副文本（03j 项目名 / 03n 项目名）。 */
  aside?: ReactNode;
  children: ReactNode;
  /** shd 标题后插入的节点（11 审批中心：.cnt 计数 + .all 全部允许，flex 同行）。 */
  headerExtra?: ReactNode;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  title: ReactNode;
}) {
  return (
    <DialogPrimitive.Root onOpenChange={onOpenChange} open={open}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            // scrim 走语义 token（两态值随 data-theme；原型 .dim 无 blur——reviewer P2-4）。
            "fixed inset-0 z-40 bg-scrim",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:fill-mode-forwards",
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            "msheet outline-none",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-4 data-[state=open]:duration-200",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-bottom-4 data-[state=closed]:duration-150 data-[state=closed]:fill-mode-forwards",
          )}
        >
          <div aria-hidden="true" className="grab" />
          <div className="shd">
            {/* DialogPrimitive.Title 默认渲染 h2 → 命中 .shd h2 原型样式 */}
            <DialogPrimitive.Title>{title}</DialogPrimitive.Title>
            {headerExtra}
            {aside ? <span className="aside">{aside}</span> : null}
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
