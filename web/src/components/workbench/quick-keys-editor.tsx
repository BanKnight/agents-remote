import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { useIsMobile } from "@/lib/use-is-mobile";

import { useT } from "../../i18n";
import {
  quickKeyLabel,
  type CustomQuickKey,
  type SessionQuickKey,
} from "../../routes/console-model";
import { LucideIcon } from "../shell/lucide-icon";
import { MobileSheet } from "../shell/mobile-sheet";
import {
  shellSurfaceClasses,
  toggleSwitchKnobClasses,
  toggleSwitchTrackClasses,
} from "../shell/shell-primitives";
import { Dialog, DialogContent } from "../ui/dialog";

/** 非拖拽行的换位过渡（滑入腾出的空位）；拖拽行 inline 摘 transition 恒跟手。 */
const ROW_SHIFT_TRANSITION_MS = 150;
/** 行距测量兜底（单行不可测相邻差时）：与 tokens rowHeight 44px 同值。 */
const FALLBACK_ROW_HEIGHT_PX = 44;
/** 名称长度上限：面板行有 truncate 兜底，.qkey 条 chip 不可收缩（min-width:max-content），
 * 长名会无限撑宽快捷键条——输入端封口。 */
const QUICK_KEY_LABEL_MAX = 24;

/**
 * 按用户序归一化：已知 id 按存储序排前，未存/新增键按默认序尾补（稳定排序——同为缺失
 * 时保持 keys 原相对序）。快捷键条渲染与编辑面板共用同一管道，两条消费面永不分叉
 *（UI = f(state)，frontend.md 多端同构）。
 */
export function applyQuickKeyOrder(keys: SessionQuickKey[], order: string[]): SessionQuickKey[] {
  const pos = new Map(order.map((id, i) => [id, i]));
  return [...keys].sort(
    (a, b) =>
      (pos.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (pos.get(b.id) ?? Number.MAX_SAFE_INTEGER),
  );
}

/** 拖拽位移 → 换位格数（clamp 在列表界内）。 */
function reorderShift(g: { dy: number; fromIndex: number; unit: number }, count: number): number {
  const raw = Math.round(g.dy / g.unit);
  return Math.max(-g.fromIndex, Math.min(count - 1 - g.fromIndex, raw));
}

/** 自定义键 id（持久化身份，order/hidden 引用同 id）：randomUUID 优先，非 secure context 兜底。 */
function newCustomKeyId(): string {
  return typeof crypto.randomUUID === "function"
    ? `custom-${crypto.randomUUID()}`
    : `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

type QuickKeysEditorProps = {
  /** 隐藏集（route 读 terminalQuickKeysHiddenAtom 传入）。 */
  hiddenIds: string[];
  /** 快捷键全集（内置 sessionQuickKeys + 自定义键合并，默认序）。 */
  keys: SessionQuickKey[];
  /** 自定义键保存（id 已存在 = 更新，否则创建——route 写 terminalQuickKeysCustomAtom）。 */
  onSaveCustom: (key: CustomQuickKey) => void;
  /** 自定义键删除（order/hidden 残留 id 由 applyQuickKeyOrder/hidden 过滤天然忽略）。 */
  onDeleteCustom: (id: string) => void;
  onOpenChange: (open: boolean) => void;
  /** 拖拽落位提交 id 全序（含被隐藏键——顺序与显隐正交）。 */
  onReorder: (order: string[]) => void;
  /** 行点按切换显隐。 */
  onToggleHidden: (id: string) => void;
  open: boolean;
  /** 用户序（terminalQuickKeysOrderAtom 原值，applyQuickKeyOrder 归一化后消费）。 */
  order: string[];
};

/**
 * 键位编辑面板（2026-10-11 真机反馈⑤「快捷方式的内容 + 顺序编排都要做得到」）：行 =
 * 键名 + 显隐开关（role="switch"，点按整行切换）+ 右侧 grip 手柄（pointer 拖拽排序）。
 * 多端同构只是容器不同：移动 = MobileSheet 半屏 sheet、桌面 = 居中 Dialog（照
 * prompt-dialog 分流范式）；内容单源。状态不进本组件（hidden/order 由 route 读 atom
 * 传入，与 SessionInputDrawer slot 模式一致——配置逻辑归调用方）。
 *
 * 拖拽排序（frontend-notes §14 真机验证组合）：pointer events 驱动 + down 即
 * setPointerCapture（grip 是专用手柄无点击动作，无需 MobileSheet 的起步阈值保 click 合成；
 * capture 后 move/up 必达，§23 pending 失联结构性消失）+ 列表容器 non-passive touchmove
 * preventDefault 防滚动抢占 + 列表 DOM 序恒定、行 transform 补偿（§17 避免 keyed DOM
 * 重排）——松手 setOrder 与清 transform 同批 setState 单次 commit，新文档位恰等于拖拽
 * 视觉位，零跳变落位。grip onPointerDown stopPropagation：拖行 ≠ sheet 收起手势
 *（MobileSheet Content 的 startDrag 不建 pending）。
 */
export function QuickKeysEditor({
  hiddenIds,
  keys,
  onSaveCustom,
  onDeleteCustom,
  onOpenChange,
  onReorder,
  onToggleHidden,
  open,
  order,
}: QuickKeysEditorProps) {
  const { t } = useT();
  const isMobile = useIsMobile();
  const ordered = applyQuickKeyOrder(keys, order);
  // 自定义键编辑表单（id 空 = 新建）：面板内局部态，关闭面板不自动提交（取消即弃）。
  const [form, setForm] = useState<{ id: string; label: string; sequence: string } | null>(null);
  // 面板关闭清草稿：form 挂在常驻挂载的本组件上，scrim/Esc/下滑关面板不触达组件卸载，
  // 不清则重开带着半填表单（与「取消即弃」语义不一致；code review 2026-10-11）。
  useEffect(() => {
    if (!open) setForm(null);
  }, [open]);
  // 手势真源在 ref（down 即接管、无 pending 阶段）；drag state 是渲染投影（驱动行 transform）。
  const gestureRef = useRef<{
    dy: number;
    fromIndex: number;
    pointerId: number;
    startY: number;
    unit: number;
  } | null>(null);
  const [drag, setDrag] = useState<{ dy: number; fromIndex: number; unit: number } | null>(null);
  // 列表容器经 state ref callback 挂 DOM：Portal 子树晚于本组件 useEffect（§14，
  // useRef + effect 判 null 会永不重绑）。
  const [listNode, setListNode] = useState<HTMLUListElement | null>(null);

  // 防滚动抢占：non-passive touchmove 在手势期 preventDefault（§14——WebKit 先启动滚动
  // 再 pointercancel 中断拖拽，prevent 从第一个 touchmove 就拦）。
  useEffect(() => {
    if (!listNode) return;
    const onTouchMove = (e: TouchEvent) => {
      if (gestureRef.current) e.preventDefault();
    };
    listNode.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      listNode.removeEventListener("touchmove", onTouchMove);
      // DOM 卸载/换绑时手势状态机归位，防残留状态污染下一次打开。
      gestureRef.current = null;
      setDrag(null);
    };
  }, [listNode]);

  const startReorder = (e: ReactPointerEvent<HTMLSpanElement>, index: number) => {
    // 拖行手柄 ≠ sheet 收起手势：掐断冒泡，MobileSheet Content 的 startDrag 不建 pending。
    e.stopPropagation();
    if (gestureRef.current || ordered.length < 2) return;
    // 行距实测（换位位移单位）：前两行 rect.top 差；单行兜底行高。
    const rows = listNode?.querySelectorAll("li");
    const first = rows?.[0]?.getBoundingClientRect();
    const second = rows?.[1]?.getBoundingClientRect();
    const unit =
      first && second ? second.top - first.top : (first?.height ?? 0) || FALLBACK_ROW_HEIGHT_PX;
    gestureRef.current = {
      dy: 0,
      fromIndex: index,
      pointerId: e.pointerId,
      startY: e.clientY,
      unit,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ dy: 0, fromIndex: index, unit });
  };

  const moveReorder = (e: ReactPointerEvent<HTMLUListElement>) => {
    const g = gestureRef.current;
    if (!g || e.pointerId !== g.pointerId) return;
    g.dy = e.clientY - g.startY;
    setDrag({ dy: g.dy, fromIndex: g.fromIndex, unit: g.unit });
  };

  const endReorder = (e: ReactPointerEvent<HTMLUListElement>) => {
    const g = gestureRef.current;
    if (!g || e.pointerId !== g.pointerId) return;
    gestureRef.current = null;
    const shift = reorderShift(g, ordered.length);
    if (shift !== 0) commitReorder(g.fromIndex, g.fromIndex + shift);
    // 提交与清 transform 同批 → 单次 commit：换位行落新文档位恰等于拖拽视觉位（零跳变）；
    // 拖拽行 snap 到目标格（≤ 半格距离，无过渡瞬落）。
    setDrag(null);
  };

  // pointercancel（系统打断）：放弃手势回原位，不提交。
  const cancelReorder = () => {
    if (!gestureRef.current) return;
    gestureRef.current = null;
    setDrag(null);
  };

  /** 提交换位：ids 全序 = 归一化序移动 from → to（拖拽落位与键盘 ↑↓ 共用）。 */
  const commitReorder = (fromIndex: number, toIndex: number) => {
    const ids = ordered.map((k) => k.id);
    const [moved] = ids.splice(fromIndex, 1);
    ids.splice(toIndex, 0, moved);
    onReorder(ids);
  };

  // 键盘等价通道（行 button 聚焦时 ↑/↓ 换位一位；preventDefault 防页面滚动）——
  // 排序不依赖纯 pointer 手柄（键盘/读屏可达）。
  const reorderByKeyboard = (index: number, delta: number) => {
    const to = index + delta;
    if (to < 0 || to >= ordered.length) return;
    commitReorder(index, to);
  };

  /** 自定义键保存：裸文本校验（trim 非空）+ id 生成（新建），提交后收表单。 */
  const saveCustom = () => {
    if (!form) return;
    const label = form.label.trim();
    if (!label || !form.sequence.trim()) return;
    onSaveCustom({ id: form.id || newCustomKeyId(), label, sequence: form.sequence });
    setForm(null);
  };

  const shift = drag ? reorderShift(drag, ordered.length) : 0;
  // 行位移（px）：拖拽行跟手；其余行向腾出的空位平移一格（dragging 才有，非拖拽行带
  // transition 平滑换位）。
  const rowOffset = (i: number): number => {
    if (!drag) return 0;
    if (i === drag.fromIndex) return drag.dy;
    if (drag.dy > 0 && i > drag.fromIndex && i <= drag.fromIndex + shift) return -drag.unit;
    if (drag.dy < 0 && i < drag.fromIndex && i >= drag.fromIndex + shift) return drag.unit;
    return 0;
  };

  const body = (
    <>
      <p className="mt-0.5 text-xs font-semibold text-ink-2">{t("session.quickKeysEditorHint")}</p>
      <ul
        className="mt-2.5 select-none border-t border-sep-row"
        onPointerCancel={cancelReorder}
        onPointerMove={moveReorder}
        onPointerUp={endReorder}
        ref={setListNode}
      >
        {ordered.map((k, i) => {
          const visible = !hiddenIds.includes(k.id);
          const offset = rowOffset(i);
          const draggingRow = drag?.fromIndex === i;
          return (
            <li
              className={`relative flex items-center border-b border-sep-row last:border-b-0 ${
                draggingRow ? "z-1 rounded-lg bg-elevated2 shadow-lg" : ""
              }`}
              key={k.id}
              style={{
                transform: offset !== 0 ? `translateY(${offset}px)` : undefined,
                transition:
                  draggingRow || offset === 0 ? "none" : `transform ${ROW_SHIFT_TRANSITION_MS}ms`,
                zIndex: draggingRow ? 1 : undefined,
              }}
            >
              {/* grip 行首（用户补充反馈：开关与拖动相邻易误触）——起手区独占左缘，与
                  行尾 toggle 隔整行宽，误触结构性消失。纯视觉手柄（aria-hidden；键盘排序
                  走行 button 的 ↑/↓，见下）。-m-2 抵消 p-2.5：视觉位不变、命中区外扩至
                  36px（44px 行内惯例向）。touch-none 防浏览器把起手判成滚动（配合容器
                  preventDefault 双保险）。 */}
              <span
                aria-hidden="true"
                className="-m-2 cursor-grab touch-none p-2.5 text-ink-2 active:cursor-grabbing"
                onPointerDown={(e) => startReorder(e, i)}
              >
                <LucideIcon className="size-4" name="grip-vertical" />
              </span>
              <button
                aria-checked={visible}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-2.5 text-left"
                onClick={() => onToggleHidden(k.id)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    reorderByKeyboard(i, -1);
                  } else if (e.key === "ArrowDown") {
                    e.preventDefault();
                    reorderByKeyboard(i, 1);
                  }
                }}
                role="switch"
                type="button"
              >
                <span className="min-w-0 flex-1 truncate text-sm">{quickKeyLabel(k, t)}</span>
                <span
                  aria-hidden="true"
                  className={`shrink-0 ${toggleSwitchTrackClasses(visible)}`}
                >
                  <span
                    className={`${toggleSwitchKnobClasses} ${visible ? "translate-x-[1.375rem]" : "translate-x-0.5"}`}
                  />
                </span>
              </button>
              {/* 自定义键行尾编辑入口（第三轮反馈④增删改）：-m-2 p-2.5 = 36px 热区（grip
                  同款，44px 行内惯例向）+ ml-1 与行尾 toggle 留缝（design review P2：命中
                  面紧贴显隐开关 = 本轮⑤误触反馈同族回归）。删除在编辑表单内（危险动作
                  显式化——行上不留高频误触面）。 */}
              {"label" in k ? (
                <button
                  aria-label={t("session.quickKeysEdit")}
                  className="-m-2 ml-1 flex shrink-0 cursor-pointer items-center justify-center rounded-md p-2.5 text-ink-2 transition hover:bg-ink-1/5 hover:text-ink-1"
                  onClick={() => setForm({ id: k.id, label: k.label, sequence: k.sequence })}
                  title={t("session.quickKeysEdit")}
                  type="button"
                >
                  <LucideIcon className="size-4" name="pencil" />
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {/* 添加行 + 自定义键编辑表单（第三轮反馈④）：Apple 分组列表添加行惯例 = 列表尾
          「＋」整行居中主色字；表单展开在添加行下方（触发处就近展开，不叠层）。 */}
      <button
        className={`mt-1 flex w-full cursor-pointer items-center justify-center gap-2 py-3 text-sm font-semibold text-primary ${
          form ? "hidden" : ""
        }`}
        onClick={() => setForm({ id: "", label: "", sequence: "" })}
        type="button"
      >
        <LucideIcon className="size-4" name="plus" />
        {t("session.quickKeysAdd")}
      </button>
      {form ? (
        <div className="mt-1 flex flex-col gap-2 rounded-[10px] border border-sep-strong p-3">
          <label className="text-xs font-semibold text-ink-2" htmlFor="qk-custom-label">
            {t("session.quickKeysNameLabel")}
          </label>
          <input
            className="w-full rounded-[10px] border border-sep-strong bg-elevated2 px-3 py-2 text-sm text-ink-1 placeholder:text-ink-2 transition focus:border-primary focus:outline-none"
            id="qk-custom-label"
            maxLength={QUICK_KEY_LABEL_MAX}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
            placeholder={t("session.quickKeysNamePlaceholder")}
            value={form.label}
          />
          <label className="text-xs font-semibold text-ink-2" htmlFor="qk-custom-content">
            {t("session.quickKeysContentLabel")}
          </label>
          <textarea
            className="w-full resize-none rounded-[10px] border border-sep-strong bg-elevated2 px-3 py-2 font-mono text-sm text-ink-1 placeholder:text-ink-2 transition focus:border-primary focus:outline-none"
            id="qk-custom-content"
            onChange={(e) => setForm({ ...form, sequence: e.target.value })}
            placeholder={t("session.quickKeysContentPlaceholder")}
            rows={2}
            value={form.sequence}
          />
          <p className="text-xs text-ink-2">{t("session.quickKeysContentHint")}</p>
          <div className="flex items-center justify-between gap-2">
            {/* 删除 = 编辑已有键时的显式动作（左下红字；新建态无此钮）——行上不留高频误触面
               （用户补充反馈：行内控件相邻易误触，危险动作收进表单）。py-2 保移动 sheet
               语境热区（design review P2，settings 同尺寸是桌面语境）。 */}
            {form.id ? (
              <button
                className="cursor-pointer rounded-[10px] px-3 py-2 text-[13px] font-semibold text-error transition hover:bg-error/5"
                onClick={() => {
                  onDeleteCustom(form.id);
                  setForm(null);
                }}
                type="button"
              >
                {t("session.quickKeysDelete")}
              </button>
            ) : null}
            <div className="flex gap-2">
              <button
                className="cursor-pointer rounded-[10px] px-3 py-2 text-[13px] text-ink-2 transition hover:bg-ink-1/5"
                onClick={() => setForm(null)}
                type="button"
              >
                {t("cancel")}
              </button>
              <button
                className="cursor-pointer rounded-[10px] bg-primary px-3 py-2 text-[13px] font-semibold text-on-accent disabled:cursor-default disabled:opacity-40"
                disabled={!form.label.trim() || !form.sequence.trim()}
                onClick={saveCustom}
                type="button"
              >
                {t("session.quickKeysSave")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );

  if (isMobile) {
    return (
      <MobileSheet onOpenChange={onOpenChange} open={open} title={t("session.quickKeysCustomize")}>
        {body}
      </MobileSheet>
    );
  }
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <div
          className={`rounded-2xl p-5 shadow-2xl shadow-black/40 ${shellSurfaceClasses.workspace}`}
        >
          <h2 className="text-base font-semibold text-on-surface">
            {t("session.quickKeysCustomize")}
          </h2>
          {body}
        </div>
      </DialogContent>
    </Dialog>
  );
}
