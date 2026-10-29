import { useEffect, useRef, type MutableRefObject } from "react";
import {
  ComposerPrimitive,
  unstable_useTriggerPopoverRootContextOptional,
  unstable_useTriggerPopoverScopeContext,
  type Unstable_DirectiveFormatter,
  type Unstable_TriggerItem,
} from "@assistant-ui/react";
import { ToolIcon } from "../assistant-ui/tool-head";

// composer 触发弹层（TriggerPopover）共享三件套：claude slash 菜单与 codex skills/文件
// 补全共用的行为收敛层（多端同构：一次实现、两端生效）。来源 = ClaudeSessionDetailRoute
// 的 SlashCommandPopoverItem / cliSlashFormatter / slashOpenRef 三段式（泛化 move）。

/**
 * 把弹层项序列化成纯文本写入 composer（不产生 directive 标记）。assistant-ui 默认
 * formatter 写 `:command[/x]{name=x}` 供 LLM runtime 解析，而我们的 composer 文本直通
 * CLI stdin，只认 `/x`（codex 同理）——所有触发项统一用本 formatter。见
 * primitives/references/mentions.md（custom formatter）。
 */
export const plainTextFormatter: Unstable_DirectiveFormatter = {
  serialize: (item) => item.label ?? `/${item.id}`,
  parse: (text) => [{ kind: "text", text }],
};

/**
 * 弹层面板容器 className（design review 批 G：单源缺口 + 空面板 artifact）。
 * `[&:not(:has([role='option']))]:hidden` = 零命中/首查防抖窗口的空面板隐藏——
 * TriggerPopover 的 open 与 items 数量无关（空结果仍渲染容器），空圆角边框盒浮在
 * composer 上方是明显 artifact；:has() 条件让位是仓内既有范式（frontend-notes §12）。
 * 隐藏不改变行为：空面板态下 Enter 本就被 popover 键盘处理器吞掉。
 */
export const triggerPopoverPanelClasses =
  "absolute bottom-full left-0 right-0 z-20 mb-1 max-h-56 overflow-auto rounded-xl border border-on-surface/10 bg-surface-inset/95 p-1 shadow-2xl backdrop-blur [&:not(:has([role='option']))]:hidden";

/**
 * VS Code-style：键盘高亮项保持滚入视野。assistant-ui 的 trigger popover 没有
 * scrollIntoView，从 scope context 读 highlightedIndex，对高亮项做 block:"nearest"
 * 滚动（仅在出视野时滚，无抖动）。
 */
export function TriggerPopoverItemRow({
  item,
  index,
  iconName,
  iconClassName,
}: {
  item: Unstable_TriggerItem;
  index: number;
  iconName: string;
  iconClassName?: string;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const scope = unstable_useTriggerPopoverScopeContext();
  const isHighlighted = scope.highlightedIndex === index;
  useEffect(() => {
    if (!isHighlighted || !ref.current) return;
    const listbox = ref.current.closest('[role="listbox"]');
    if (!(listbox instanceof HTMLElement)) return;
    const item = ref.current;
    const paddingTop = Number.parseFloat(getComputedStyle(listbox).paddingTop);
    const itemTop = item.offsetTop - paddingTop;
    const itemBottom = itemTop + item.clientHeight;
    const listTop = listbox.scrollTop;
    const listBottom =
      listTop +
      listbox.clientHeight -
      paddingTop -
      Number.parseFloat(getComputedStyle(listbox).paddingBottom);
    if (itemTop < listTop) {
      listbox.scrollTop = itemTop;
    } else if (itemBottom > listBottom) {
      listbox.scrollTop =
        itemBottom -
        (listbox.clientHeight -
          paddingTop -
          Number.parseFloat(getComputedStyle(listbox).paddingBottom));
    }
  }, [isHighlighted]);
  return (
    <ComposerPrimitive.TriggerPopoverItem
      ref={ref}
      item={item}
      index={index}
      className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-on-surface-soft transition-colors duration-150 hover:bg-surface-raised/80 hover:text-on-surface data-[highlighted]:bg-surface-raised/80 data-[highlighted]:text-on-surface"
    >
      <ToolIcon name={iconName} className={iconClassName} />
      <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0">
        <span className="min-w-0 break-all text-xs font-medium text-on-surface-soft">
          {item.label}
        </span>
        {item.description ? (
          <span className="min-w-0 break-words text-xs text-on-surface-muted">
            {item.description}
          </span>
        ) : null}
      </span>
    </ComposerPrimitive.TriggerPopoverItem>
  );
}

/**
 * 「触发弹层是否激活」的 ref（供 Enter 让位等非渲染判断，不引重渲染）：弹层打开时
 * Enter 应交给 popover 提交高亮项而不是 composer 发送。无 TriggerPopoverRoot 祖先时
 * 恒 false（能力降级）。
 */
export function useTriggerPopoverActiveRef(): MutableRefObject<boolean> {
  const triggerCtx = unstable_useTriggerPopoverRootContextOptional();
  const activeRef = useRef(false);
  useEffect(() => {
    if (!triggerCtx) {
      activeRef.current = false;
      return;
    }
    const update = () => {
      activeRef.current = triggerCtx.getActiveAria() !== null;
    };
    update();
    return triggerCtx.subscribeAria(update);
  }, [triggerCtx]);
  return activeRef;
}
