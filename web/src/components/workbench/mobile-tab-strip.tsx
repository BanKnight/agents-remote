import type { ReactNode } from "react";
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
  /** 右侧 slot：聚焦 session 时 ℹ✕ 胶囊；浏览态（无 focus）不传。 */
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
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
        : item.ref.path);
  return (
    <div
      className={`group/tab flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold transition ${
        active
          ? "bg-primary/10 text-primary"
          : "text-on-surface-muted hover:bg-on-surface/5 hover:text-on-surface active:bg-on-surface/10"
      }`}
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
