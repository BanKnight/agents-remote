import { type ReactNode, useEffect, useRef } from "react";
import { useT } from "../../i18n";
import { ShellIcon } from "../shell/icons";
import { usePanelMeta } from "./instance-area";
import type { WorkbenchPanelRef } from "../../routes/workbench-model";

type MobileTabStripItem = {
  tabId: string;
  leafId: string;
  ref: WorkbenchPanelRef;
};

type MobileTabStripProps = {
  tabs: MobileTabStripItem[];
  activeTabId?: string;
  /** ☰ drawer 开关（项目 scope 恒有）。 */
  onToggleSidebar: () => void;
  onSelect: (leafId: string, tabId: string) => void;
  /** tab ✕ = 最小化（removeTabFromLeaf，session 存活）。 */
  onClose: (leafId: string, tabId: string) => void;
  /** 右侧 slot：聚焦 session 时 ℹ✕ 胶囊；浏览态（无 focus）新建按钮；file/git/skill 聚焦不传。 */
  trailing?: ReactNode;
};

/**
 * 移动项目工作台 header 内容 tab 带（设计 workbench-views §7.7 / DESIGN.md Layout §移动项目
 * 工作台，2026-08-16 重设计）：桌面中栏 group tab 栏的窄屏投影。☰ drawer 开关 + 打开 tab
 * 横滚区（复用 MobileTabHeader 横滚范式：`flex-1 overflow-x-auto` 隐藏滚动条 + `shrink-0`
 * chip）+ trailing slot。
 *
 * chip 复用 `usePanelMeta` 派生 label + marker（与桌面 TabChip 同一渲染源，query key 一致
 * React Query dedupe 零额外网络）；✕ 是 tab 特有动作（nav-item 无），与桌面 tab ✕ 同为最小化。
 */
export function MobileTabStrip({
  tabs,
  activeTabId,
  onToggleSidebar,
  onSelect,
  onClose,
  trailing,
}: MobileTabStripProps) {
  const { t } = useT();
  const scrollRef = useRef<HTMLDivElement>(null);
  // 激活 tab 滚入视野（2026-08-17）：tab 多时横滚区 scrollLeft 停留原位，激活 chip 可能
  // 在视野外（尤其从 drawer 新建/切换激活到尾部 tab）。activeTabId 变化时手动算 scrollLeft
  // 让 chip 完全可见（只动横向容器，不用 scrollIntoView 避免连带页面滚动）。对齐桌面
  // GroupHeader tab 栏的交互预期。
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !activeTabId) return;
    // 对齐激活 chip 到横滚区视野内。返回是否仍溢出（需继续校准）。
    const align = () => {
      const chip = el.querySelector<HTMLElement>('[data-active="true"]');
      if (!chip) return false;
      // chip 相对容器内容左缘的 X（= 视觉位置 + 当前 scrollLeft）。
      const left =
        chip.getBoundingClientRect().left - el.getBoundingClientRect().left + el.scrollLeft;
      const right = left + chip.offsetWidth;
      if (left < el.scrollLeft) {
        el.scrollTo({ left, behavior: "smooth" });
        return true;
      }
      if (right > el.scrollLeft + el.clientWidth) {
        el.scrollTo({ left: right - el.clientWidth, behavior: "smooth" });
        return true;
      }
      return false;
    };
    // 首次立即对齐；之后周期校准直到布局稳定——chip 宽度依赖 usePanelMeta 异步查询，
    // meta 到达后 chip 变宽、active 可能重新溢出（首次进入尾部 tab 时常见）。仅一次
    // deps 触发的对齐会停在旧布局算出的目标，故用 interval 覆盖「布局变化后仍需滚」。
    align();
    const timer = window.setInterval(() => {
      if (!align()) window.clearInterval(timer);
    }, 200);
    return () => window.clearInterval(timer);
  }, [activeTabId, tabs.length]);
  return (
    <header className="flex h-11 shrink-0 items-center gap-1 border-b border-on-surface/5 px-2">
      <button
        aria-label={t("workbench.toggleSidebar")}
        className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-on-surface-soft transition hover:bg-on-surface/5 hover:text-on-surface active:bg-on-surface/10"
        onClick={onToggleSidebar}
        type="button"
      >
        <ShellIcon className="h-5 w-5" name="menu" />
      </button>
      <div
        ref={scrollRef}
        className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((opt) => (
          <MobileTabChip
            active={opt.tabId === activeTabId}
            item={opt}
            key={opt.tabId}
            onClose={onClose}
            onSelect={onSelect}
          />
        ))}
      </div>
      {trailing}
    </header>
  );
}

/** 单个 tab chip（对齐桌面 TabChip 的 nav-item 设计语言：active `bg-primary/10 text-primary`）。 */
function MobileTabChip({
  active,
  item,
  onClose,
  onSelect,
}: {
  active: boolean;
  item: MobileTabStripItem;
  onClose: (leafId: string, tabId: string) => void;
  onSelect: (leafId: string, tabId: string) => void;
}) {
  const { t } = useT();
  const meta = usePanelMeta(item.ref);
  const label =
    meta?.label ??
    (item.ref.kind === "session"
      ? item.ref.sessionId.slice(0, 12)
      : item.ref.kind === "skill"
        ? item.ref.name
        : item.ref.kind === "chat"
          ? item.ref.sessionId.slice(0, 12)
          : item.ref.path);
  return (
    <div
      className={`group/tab flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold transition ${
        active
          ? "bg-primary/10 text-primary"
          : "text-on-surface-muted hover:bg-on-surface/5 hover:text-on-surface active:bg-on-surface/10"
      }`}
      data-active={active ? "true" : undefined}
      key={item.tabId}
      onClick={() => onSelect(item.leafId, item.tabId)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(item.leafId, item.tabId);
        }
      }}
      role="button"
      tabIndex={0}
    >
      {meta?.marker ?? null}
      <span className="block max-w-32 truncate">{label}</span>
      <button
        aria-label={t("session.close")}
        className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-on-surface-muted transition hover:bg-error/10 hover:text-error"
        onClick={(e) => {
          e.stopPropagation();
          onClose(item.leafId, item.tabId);
        }}
        type="button"
      >
        <ShellIcon className="h-4 w-4" name="close" />
      </button>
    </div>
  );
}
