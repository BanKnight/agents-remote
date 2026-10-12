import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { useIsMobile } from "@/lib/use-is-mobile";

import { useT } from "../../i18n";
import type { TranslationKey } from "../../i18n/types";
import {
  presetTerminalKeys,
  quickKeyLabel,
  type PresetKeyGroup,
  type QuickCommand,
  type SessionQuickKey,
} from "../../routes/console-model";
import { LucideIcon } from "../shell/lucide-icon";
import { MobileSheet } from "../shell/mobile-sheet";
import { toggleSwitchKnobClasses, toggleSwitchTrackClasses } from "../shell/shell-primitives";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../ui/dialog";
import { QuickCommandsTab } from "./quick-commands-tab";

/** 非拖拽行的换位过渡（滑入腾出的空位）；拖拽行 inline 摘 transition 恒跟手。 */
const ROW_SHIFT_TRANSITION_MS = 150;
/** 行距测量兜底（单行不可测相邻差时）：.setrow 固定行高 44px 同值。 */
const FALLBACK_ROW_HEIGHT_PX = 44;

/** 可用按键语义分组呈现序与标题（2026-10-12 反馈② Apple 分组惯例，用户拍板）。 */
const PRESET_GROUP_ORDER: readonly PresetKeyGroup[] = ["editing", "nav", "fn"];
const PRESET_GROUP_TITLE: Record<PresetKeyGroup, TranslationKey> = {
  editing: "session.presetGroupEditing",
  fn: "session.presetGroupFn",
  nav: "session.presetGroupNav",
};

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

type QuickKeysTab = "keys" | "commands";

type QuickKeysEditorProps = {
  /** 可发送（WS connected）：命令 tab 行禁用态消费（与 .qkey 键帽同口径）。 */
  canSend: boolean;
  /** 命令全集（route 读 terminalQuickCommandsAtom 传入，默认序）。 */
  commands: QuickCommand[];
  /** 隐藏集（route 读 terminalQuickKeysHiddenAtom 传入，仅内置键）。 */
  hiddenIds: string[];
  /** 键盘 tab 按键全集（内置 sessionQuickKeys + 已启用预置键合并，默认序）。 */
  keys: SessionQuickKey[];
  /** 命令删除（route 写 terminalQuickCommandsAtom）。 */
  onDeleteCommand: (id: string) => void;
  onOpenChange: (open: boolean) => void;
  /** 拖拽落位提交 id 全序（含被隐藏键——顺序与显隐正交）。 */
  onReorder: (order: string[]) => void;
  /** 命令执行/仅插入（route sendMessage + 关面板编排）。 */
  onRunCommand: (cmd: QuickCommand, mode: "run" | "insert") => void;
  /** 命令保存（id 已存在 = 更新，否则创建——route 写 terminalQuickCommandsAtom）。 */
  onSaveCommand: (cmd: QuickCommand) => void;
  /** 预置键启用/停用（route 写 terminalPresetKeysEnabledAtom；主列表行 = 停用，
   * 可用按键区行 = 启用）。 */
  onTogglePresetKey: (id: string) => void;
  /** 行点按切换显隐（内置键 hidden 集）。 */
  onToggleHidden: (id: string) => void;
  open: boolean;
  /** 用户序（terminalQuickKeysOrderAtom 原值，applyQuickKeyOrder 归一化后消费）。 */
  order: string[];
  /** 预置键启用集（terminalPresetKeysEnabledAtom 原值）。 */
  presetEnabledIds: string[];
};

/**
 * 键位自定义面板（两域分离 2026-10-11 拍板，Termius 侧面板双 tab 对标）：**键盘** tab =
 * 按键域（控制序列；内置 8 键显隐/排序 + 预置键启用），**命令** tab = 快捷命令域（命令
 * 文本，QuickCommandsTab 单源）。多端同构只是容器不同：移动 = MobileSheet 半屏 sheet、
 * 桌面 = 居中 Dialog（照 prompt-dialog 分流范式）。状态不进本组件（atoms 由 route 读传
 * 入，与 SessionInputDrawer slot 模式一致——配置逻辑归调用方）。
 *
 * v2 组件换代（2026-10-12 反馈②，用户拍板「完整换代」）：tab 条 = `.segc`（role=tablist
 * + aria-selected + `.on` 白 thumb，settings-dialog 同款）；列表 = `.sect` 组标题 +
 * `.sgroup` inset 卡片 + `.setrow` 44px 行（可用按键按语义分组）；容器（移动 sheet /
 * 桌面 Dialog）不改，容器自带水平内距故 `[&_.sect/_.sgroup]:mx-0` 中和单源 margin 防
 * 双重边距（settings 批同款教训）。
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
  canSend,
  commands,
  hiddenIds,
  keys,
  onDeleteCommand,
  onOpenChange,
  onReorder,
  onRunCommand,
  onSaveCommand,
  onTogglePresetKey,
  onToggleHidden,
  open,
  order,
  presetEnabledIds,
}: QuickKeysEditorProps) {
  const { t } = useT();
  const isMobile = useIsMobile();
  const ordered = applyQuickKeyOrder(keys, order);
  // 双 tab（键盘/命令）：关面板回键盘 tab（按键是默认域）。
  const [tab, setTab] = useState<QuickKeysTab>("keys");
  useEffect(() => {
    if (!open) setTab("keys");
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

  // 「可用按键」= 预置目录未启用项（启用后进主列表可排序；停用回本区），按语义分组
  // 分卡片（PRESET_GROUP_ORDER 序，空组不渲染）。
  const availablePresets = presetTerminalKeys.filter((p) => !presetEnabledIds.includes(p.id));

  /** 开关行（.setrow 44px）：label 副文本（可选 .v）+ .toggle 44×26。 */
  const switchRow = (opts: {
    checked: boolean;
    descKey?: TranslationKey;
    label: string;
    onToggle: () => void;
  }) => (
    <button
      aria-checked={opts.checked}
      className="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
      onClick={opts.onToggle}
      role="switch"
      type="button"
    >
      <span className="min-w-0 flex-1 truncate">{opts.label}</span>
      {opts.descKey ? <span className="v shrink-0">{t(opts.descKey)}</span> : null}
      <span aria-hidden="true" className={`shrink-0 ${toggleSwitchTrackClasses(opts.checked)}`}>
        <span
          className={`${toggleSwitchKnobClasses} ${opts.checked ? "translate-x-[1.375rem]" : "translate-x-0.5"}`}
        />
      </span>
    </button>
  );

  const keysBody = (
    <>
      <p className="kfoot">{t("session.quickKeysEditorHint")}</p>
      <div className="sect">{t("session.quickKeysOnBar")}</div>
      <ul
        className="sgroup select-none"
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
              className={`setrow relative ${draggingRow ? "z-1 rounded-lg bg-elevated2 shadow-lg" : ""}`}
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
                  走行 button 的 ↑/↓，见下）。36px 方形热区居中于 44px 行。touch-none
                  防浏览器把起手判成滚动（配合容器 preventDefault 双保险）。 */}
              <span
                aria-hidden="true"
                className="flex size-9 shrink-0 cursor-grab touch-none items-center justify-center text-ink-2 active:cursor-grabbing"
                onPointerDown={(e) => startReorder(e, i)}
              >
                <LucideIcon className="size-4" name="grip-vertical" />
              </span>
              <button
                aria-checked={visible}
                className="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
                onClick={() => ("labelKey" in k ? onToggleHidden(k.id) : onTogglePresetKey(k.id))}
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
                <span className="min-w-0 flex-1 truncate">{quickKeyLabel(k, t)}</span>
                <span
                  aria-hidden="true"
                  className={`shrink-0 ${toggleSwitchTrackClasses(visible)}`}
                >
                  <span
                    className={`${toggleSwitchKnobClasses} ${visible ? "translate-x-[1.375rem]" : "translate-x-0.5"}`}
                  />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {PRESET_GROUP_ORDER.map((group) => {
        const items = availablePresets.filter((p) => p.group === group);
        if (items.length === 0) return null;
        return (
          <Fragment key={group}>
            <div className="sect">
              {t("session.quickKeysAvailable")} · {t(PRESET_GROUP_TITLE[group])}
            </div>
            <ul className="sgroup">
              {items.map((p) => (
                <li className="setrow" key={p.id}>
                  {switchRow({
                    checked: false,
                    descKey: p.descKey,
                    label: p.label,
                    onToggle: () => onTogglePresetKey(p.id),
                  })}
                </li>
              ))}
            </ul>
          </Fragment>
        );
      })}
    </>
  );

  const tabsBar = (
    // .segc（components.css 单源镜像，settings-dialog 同款）：role=tablist + aria-selected
    // + .on 白 thumb。原生 button 非 Radix Trigger（嵌套 modal 内 Trigger 失效，§5）。
    <div aria-label={t("session.quickKeysCustomize")} className="segc w-full" role="tablist">
      {(
        [
          { value: "keys", label: t("session.quickKeysTabKeys") },
          { value: "commands", label: t("session.quickKeysTabCommands") },
        ] as const
      ).map((opt) => (
        <button
          aria-selected={tab === opt.value}
          className={tab === opt.value ? "on" : ""}
          key={opt.value}
          onClick={() => setTab(opt.value)}
          role="tab"
          type="button"
        >
          {opt.label}
        </button>
      ))}
    </div>
  );

  const tabBody =
    tab === "keys" ? (
      keysBody
    ) : (
      <QuickCommandsTab
        canSend={canSend}
        commands={commands}
        onDelete={onDeleteCommand}
        onAction={onRunCommand}
        onSave={onSaveCommand}
        open={open}
      />
    );

  // 容器（.msheet / 桌面卡片）自带水平内距，中和 .sect/.sgroup 单源 16px margin 防双重
  // 边距（settings 批「36px 错位」教训）；kfoot 无 margin 随容器内距对齐卡片。
  const body = (
    <div className="[&_.sect]:mx-0 [&_.sgroup]:mx-0">
      <div className="mt-2.5">{tabsBar}</div>
      {tabBody}
    </div>
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
        <div className="flex max-h-[85vh] flex-col overflow-hidden rounded-[20px] border border-sep bg-elevated p-5 shadow-2xl shadow-black/40">
          <DialogTitle className="shrink-0 text-base font-semibold text-ink-1">
            {t("session.quickKeysCustomize")}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t("session.quickKeysCustomize")}
          </DialogDescription>
          {/* 内容可滚（settings-dialog 同款高度链）：键盘 tab 8 行 + 分组预置键远超视口，
              无内滚则卡片居中定位溢出视口顶——底部行不可达（探针 D 系实抓）。 */}
          <div className="mt-3 shrink-0">{tabsBar}</div>
          {/* 内容可滚（settings-dialog 同款高度链）：键盘 tab 8 行 + 分组预置键远超视口，
              无内滚则卡片居中定位溢出视口顶——底部行不可达（探针 D 系实抓）。tab 条钉顶
              不随滚（review P2：钉/滚两态不一致）。 */}
          <div className="-mr-1 flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">
            <div className="[&_.sect]:mx-0 [&_.sgroup]:mx-0">{tabBody}</div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
