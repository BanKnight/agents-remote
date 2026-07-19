import {
  useEffect,
  useRef,
  type ComponentProps,
  type MouseEvent,
  type MouseEventHandler,
  type PointerEvent,
  type PointerEventHandler,
  type ReactNode,
} from "react";
import { DRAG_THRESHOLD_PX, type WorkbenchPanelRef } from "../../routes/workbench-model";
import { ListRow } from "../shell/shell-primitives";

// window 级 PointerEvent = 原生 DOM PointerEvent（避开 React PointerEvent 同名冲突）。
type PointerEvent_Window = globalThis.PointerEvent;

/** 拖动源启动 handler（卡片/行源 + WorkbenchContent onCardDragStart 共享签名）。 */
export type CardDragStartHandler = (
  ref: WorkbenchPanelRef,
  event: PointerEvent<HTMLDivElement>,
) => void;

type DragSourceHandlers<T extends Element> = {
  onMouseDown: MouseEventHandler<T>;
  onPointerDown: PointerEventHandler<T>;
};

/**
 * 拖动源 pointer sequence（设计 §7.2）。从原 DragSourceCard 抽出，供卡片包装（DragSourceCard）
 * 与行（DraggableListRow）共用同一拖动状态机。
 *
 * pointerdown 挂 window pointermove/pointerup：累计位移 ≥ DRAG_THRESHOLD_PX → onDragStart（进
 * 拖动态，DropZoneOverlay 接管 hit-test/onDrop）；未超阈值 + pointerup → onSelect（单击激活，
 * Phase A 行为）。不依赖 click 合成——pointer sequence 可能抑制 click，且走 DOM .click() 会误触
 * 内部按钮（close/⋯/uninstall），故 pointerup 直接调 onSelect。
 *
 * contains 判断拦截 portal fiber 冒泡（frontend-notes §4 铁律）：ActionMenu 嵌在源内时，portal
 * menuitem 的 pointerdown 按 fiber 冒泡到本源，但 DOM target 在 body 不在源内——直接 return，
 * 不挂 pointerup（否则 menuitem 松手调 onSelect = 穿透，与 menuitem 自身 onSelect 同时起效）。
 *
 * 起始 target 落在 `<button>` 内（close/actions/uninstall 按钮）→ inClose=true，pointerup 不调
 * onSelect，让按钮自身 onClick 走原生 click 路径（其 onClick 内 stopPropagation 阻止源根 onClick，
 * 不重复触发 select）。touch pointerType 直接 return（移动端无拖放，MobileWorkbench 不渲染 InstanceArea）。
 *
 * 泛型 T = 挂 handler 的元素类型（DragSourceCard=HTMLDivElement，DraggableListRow=HTMLButtonElement
 * 对齐 ListRow 签名）。onDragStart 的 event 类型固定 PointerEvent<HTMLDivElement>（与 WorkbenchContent
 * onCardDragStart 签名一致，event 只用 clientX/clientY，target 类型无关）。
 */
export function useDragSource<T extends Element>(
  ref: WorkbenchPanelRef,
  onDragStart: CardDragStartHandler,
  onSelect: () => void,
): DragSourceHandlers<T> {
  const startRef = useRef<{ x: number; y: number; inClose: boolean } | null>(null);
  const draggingRef = useRef(false);
  // 当次拖动序列的 window listener 卸载闭包：pointerdown 挂、pointerup/pointercancel 卸；
  // useEffect cleanup 兜底拖动中 unmount（window 级 listener 不随 React unmount 自动清）。
  const detachRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      detachRef.current?.();
    };
  }, []);

  const onPointerDown = (event: PointerEvent<T>) => {
    if (event.pointerType === "touch") return; // 移动端无拖放
    if (event.button !== 0) return;
    // 忽略来自 ActionMenu portal（桌面 popover menuitem / 移动 sheet scrim）的 pointerdown：
    // React 合成 pointerdown 按 fiber 冒泡到本源（ActionMenu 嵌在源内），但 DOM target 在 body
    // portal 不在源内。若不拦，下面挂的 window pointerup 会在 menuitem 松手时调 onSelect
    //（穿透）——menuitem 自身 onSelect 已处理动作，不该再触发源激活。与 InstanceCard onClick
    // 的 contains 判断同源（frontend-notes §4），只接受确实落在源 DOM 内的 pointerdown。
    if (!event.currentTarget.contains(event.target as Node)) return;
    // 起始 target 在按钮内 → 单击走按钮路径，不进拖动态也不调 onSelect。
    const inClose = !!(event.target as HTMLElement).closest("button");
    const start = { x: event.clientX, y: event.clientY, inClose };
    startRef.current = start;
    draggingRef.current = false;

    // 上一次序列未清（单指针快速连点 / pointercancel 漏触发）先卸，防 listener 残留。
    detachRef.current?.();
    detachRef.current = null;

    // 局部 onMove/onUp：addEventListener/removeEventListener 用同一闭包引用。pointermove/up 挂
    // window（PointerEvent_Window = 原生 DOM PointerEvent），pointer 出源也收得到。
    const onMove = (e: PointerEvent_Window) => {
      if (!startRef.current || draggingRef.current) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (dx * dx + dy * dy >= DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
        draggingRef.current = true;
        onDragStart(ref, e as unknown as PointerEvent<HTMLDivElement>);
      }
    };
    const onUp = () => {
      detach();
      detachRef.current = null;
      const wasDragging = draggingRef.current;
      startRef.current = null;
      draggingRef.current = false;
      // 拖动态结束：DropZoneOverlay 的 onDrop 负责落盘，这里不调 onSelect。
      if (wasDragging) return;
      // 单击：未超阈值 → 调 onSelect（Phase A 激活）。按钮内起始的单击跳过（让原生 click 走
      // 按钮自身 onClick）。
      if (!start.inClose) {
        onSelect();
      }
    };
    const detach = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    detachRef.current = detach;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const onMouseDown = (event: MouseEvent<T>) => {
    // 抑制原生鼠标拖动选中文本：mousedown 启动 selection tracking，preventDefault 在源头
    // 阻止（pointerdown 的 preventDefault 不传递到 mousedown 默认行为，必须 mousedown 自己）。
    // 按钮内起始不阻止（保留其原生 click 合成路径）。
    if (event.button !== 0) return;
    const inClose = !!(event.target as HTMLElement).closest("button");
    if (!inClose) event.preventDefault();
  };

  return { onMouseDown, onPointerDown };
}

type DragSourceCardProps = {
  children: ReactNode;
  dragRef: WorkbenchPanelRef;
  onDragStart: CardDragStartHandler;
  onSelect: () => void;
};

/**
 * 拖动源卡片包装（设计 §7.2）。包装 InstanceCard（不展开 props 的复杂组件），用 div 包裹挂
 * useDragSource 的 onMouseDown/onPointerDown。touch-action: pan-y 保留触摸纵向滚动（overview
 * 列表可滚动），仅鼠标拖放场景生效（touch pointerType 早 return）。仅桌面左总览 InstanceGrid 启用。
 */
export function DragSourceCard({ children, dragRef, onDragStart, onSelect }: DragSourceCardProps) {
  const { onMouseDown, onPointerDown } = useDragSource<HTMLDivElement>(
    dragRef,
    onDragStart,
    onSelect,
  );
  return (
    <div
      className="min-w-0"
      onMouseDown={onMouseDown}
      onPointerDown={onPointerDown}
      style={{ touchAction: "pan-y" }}
    >
      {children}
    </div>
  );
}

type DraggableListRowProps = ComponentProps<typeof ListRow> & {
  dragRef: WorkbenchPanelRef;
  // 用 onCardDragStart 避开 ComponentProps<ListRow> 继承的原生 onDragStart（DragEventHandler）同名：
  // TS 对同名 prop 取交集，CardDragStartHandler 与 DragEventHandler 不兼容。DragSourceCard 不 extends
  // ComponentProps（独立 type）无此冲突，故保留 onDragStart。
  onCardDragStart: CardDragStartHandler;
  onSelect: () => void;
};

/**
 * 可拖动行（设计 §7.2 拖动源泛化，2026-07-19）。ListRow + useDragSource——不渲染额外 div，
 * handlers 经 ListRow 的 `...props`（shell-primitives.tsx:532）展开到行根 div。用于文件树文件行
 *（FileEntryList）/ git 变更行（GitFileList）/ skill ManageTab 行拖动到中栏开对应 file/git/skill tab。
 *
 * 单击 onSelect 接管原 ListRow onClick 行为（pointer sequence 抑制 click，onSelect 在 pointerup
 * 触发）；行内 actions 按钮（⋯/uninstall）仍可点（inClose 判定：`closest("button")` → 不触发拖动
 * onSelect）。键盘 Enter/Space（ListRow onKeyDown → click）是独立路径，不被 pointer sequence 拦截。
 * target 类型 HTMLButtonElement 对齐 ListRow 的 props 签名（签名 button、渲染 div，currentTarget.contains
 * 运行时正常）。
 */
export function DraggableListRow({
  dragRef,
  onCardDragStart,
  onSelect,
  ...listRowProps
}: DraggableListRowProps) {
  const { onMouseDown, onPointerDown } = useDragSource<HTMLButtonElement>(
    dragRef,
    onCardDragStart,
    onSelect,
  );
  return <ListRow {...listRowProps} onMouseDown={onMouseDown} onPointerDown={onPointerDown} />;
}
