import { Fragment, type PointerEvent, type ReactNode, useRef } from "react";
import {
  type PanelViewState,
  type WorkbenchLayout,
  type WorkbenchPanelRef,
  WORKBENCH_PANEL_DEFAULT_FLEX,
  deriveRows,
} from "../../routes/workbench-model";
import { useT } from "../../i18n";
import { shellSurfaceClasses } from "../shell/shell-primitives";
import { ShellIcon } from "../shell/icons";
import { PanelPreview } from "./panel-preview";

type SplitLayoutProps = {
  layout: WorkbenchLayout;
  /** 渲染面板主体（实例内容：ChatPanel / TerminalPanel 等）。 */
  renderPanel: (ref: WorkbenchPanelRef) => ReactNode;
  /** 聚焦判定（URL focusId 命中时高亮面板边框，输入作用于它）。 */
  isFocused?: (ref: WorkbenchPanelRef) => boolean;
  /** 点击面板聚焦（更新 URL focusId → 右栏 inspection 跟随）。 */
  onFocusPanel?: (ref: WorkbenchPanelRef) => void;
  /** 关闭面板 = 结束实例（confirm → API close → removePanel → focus-aware navigate）。 */
  onClosePanel: (ref: WorkbenchPanelRef) => void;
  /** 拖拽 gutter 调整同行相邻左右面板宽度（`deltaFlex` 为左增量；resizePair 守恒钳制）。 */
  onResizePair?: (leftId: string, rightId: string, deltaFlex: number) => void;
  /** 切换面板最大化（标量翻转 maximized，deriveRows 派生单面板全屏）。 */
  onToggleMaximize?: (sessionId: string) => void;
  /** 切换面板三态（Phase 5，setPanelState 单 expanded 守卫）。 */
  onToggleState?: (sessionId: string, state: PanelViewState) => void;
  /** 面板工具栏左侧标签（global scope 传项目名前缀；project scope 不传 = 隐藏）。 */
  panelLabel?: (ref: WorkbenchPanelRef) => string | undefined;
};

/**
 * 中栏自由 split 布局（设计文档 §4/§7）。消费 `WorkbenchLayout`（raw 有序结构），由纯函数
 * `deriveRows` 派生二维行结构后渲染：flex-col of flex-row。行内面板按 `sizes[sessionId]` flex
 * 权重分配宽度；行高 V1 等权（flex-1）。maximized 时 deriveRows 已收敛为单面板单行，布局自然全屏。
 *
 * Phase 5：面板三态（expanded/collapsed/minimized）。`deriveRows` 已过滤 minimized 面板
 *（dock 承载，不占行布局）；expanded/collapsed 面板正常铺开。底部 dock 渲染 minimized 面板 chip。
 * gutter resize / maximize 保留不重写（设计 §7.4 复用）。
 */
export function SplitLayout({
  layout,
  renderPanel,
  isFocused,
  onFocusPanel,
  onClosePanel,
  onResizePair,
  onToggleMaximize,
  onToggleState,
  panelLabel,
}: SplitLayoutProps) {
  const { t } = useT();
  const rows = deriveRows(layout);
  // minimized 面板 = panels 中存在但被 deriveRows 过滤的（panelStates=minimized）。
  const minimizedPanels = layout.panels.filter(
    (p) => layout.panelStates[p.sessionId] === "minimized",
  );
  return (
    <div className="flex h-full min-h-0 select-none flex-col gap-1">
      <div className="flex min-h-0 flex-1 flex-col gap-1">
        {rows.length === 0
          ? // 全部最小化时行区塌缩，dock 仍显示 chip（避免完全空白）。
            null
          : rows.map((row, rowIdx) => {
              const totalFlex = row.reduce(
                (sum, ref) => sum + (layout.sizes[ref.sessionId] ?? WORKBENCH_PANEL_DEFAULT_FLEX),
                0,
              );
              return (
                <div className="flex min-h-0 flex-1 flex-row gap-1" key={rowIdx}>
                  {row.map((ref, colIdx) => {
                    const left = colIdx > 0 ? row[colIdx - 1] : null;
                    const state = layout.panelStates[ref.sessionId] ?? "collapsed";
                    return (
                      <Fragment key={ref.sessionId}>
                        {left && (
                          <SplitGutter
                            onResize={(ratioDelta) =>
                              onResizePair?.(left.sessionId, ref.sessionId, ratioDelta * totalFlex)
                            }
                          />
                        )}
                        <SplitPanel
                          flex={layout.sizes[ref.sessionId] ?? WORKBENCH_PANEL_DEFAULT_FLEX}
                          focused={isFocused?.(ref) ?? false}
                          label={panelLabel?.(ref)}
                          maximized={layout.maximized === ref.sessionId}
                          onClose={() => onClosePanel(ref)}
                          onFocus={() => onFocusPanel?.(ref)}
                          onToggleMaximize={() => onToggleMaximize?.(ref.sessionId)}
                          onToggleState={(next) => onToggleState?.(ref.sessionId, next)}
                          sessionId={ref.sessionId}
                          state={state}
                        >
                          {renderPanel(ref)}
                        </SplitPanel>
                      </Fragment>
                    );
                  })}
                </div>
              );
            })}
      </div>
      {minimizedPanels.length > 0 ? (
        <SplitDock
          onRestore={(sessionId) => onToggleState?.(sessionId, "collapsed")}
          panels={minimizedPanels}
          restoreLabel={t("workbench.dockChipRestore")}
        />
      ) : null}
    </div>
  );
}

type SplitPanelProps = {
  flex: number;
  focused: boolean;
  label?: string;
  maximized: boolean;
  onClose: () => void;
  onFocus: () => void;
  onToggleMaximize: () => void;
  onToggleState: (next: PanelViewState) => void;
  sessionId: string;
  state: PanelViewState;
  children: ReactNode;
};

/**
 * 单个 split 面板框（设计 §7.1/§7.2 三态）。expanded = 完整 output + 最大化/恢复 + 最小化 + 关闭；
 * collapsed = header + 末 2 行预览 + 展开 + 关闭（无最大化——缩略态不 maximize）；minimized
 * 不渲染（dock chip 承载）。focused 时外环高亮。点击面板任意位置聚焦（输入作用于聚焦面板）。
 *
 * children 保留 mount（不 unmount），仅 collapsed 态 CSS 隐藏（`hidden` class）——避免 PanelRouter
 * 内部 query/WS 重连抖动（设计 §7.4 复用 + 状态进 layout atom，不动实例生命周期）。
 */
function SplitPanel({
  flex,
  focused,
  label,
  maximized,
  onClose,
  onFocus,
  onToggleMaximize,
  onToggleState,
  sessionId,
  state,
  children,
}: SplitPanelProps) {
  const { t } = useT();
  return (
    <div
      className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl ${shellSurfaceClasses.shell} ${focused ? "ring-1 ring-primary/40" : "ring-1 ring-on-surface/5"}`}
      style={{ flexGrow: flex, flexBasis: 0 }}
      onClick={onFocus}
    >
      <div className="flex shrink-0 items-center justify-between gap-0.5 border-b border-on-surface/5 px-1 py-0.5">
        <span className="min-w-0 flex-1 truncate px-1 text-[0.6rem] font-medium text-on-surface-muted">
          {label}
        </span>
        <div className="flex shrink-0 items-center gap-0.5">
          {state === "expanded" ? (
            // expanded：最大化/恢复 + 最小化 + 关闭。
            <>
              <SplitIconButton
                label={t(maximized ? "workbench.panelRestore" : "workbench.panelMaximize")}
                onClick={onToggleMaximize}
              >
                {maximized ? RestoreIcon : MaximizeIcon}
              </SplitIconButton>
              <SplitIconButton
                label={t("workbench.panelMinimize")}
                onClick={() => onToggleState("minimized")}
              >
                {MinimizeIcon}
              </SplitIconButton>
              <SplitIconButton label={t("workbench.panelClose")} onClick={onClose}>
                <ShellIcon className="h-3 w-3" name="close" />
              </SplitIconButton>
            </>
          ) : (
            // collapsed：展开 + 关闭（无最大化——缩略态不 maximize）。
            <>
              <SplitIconButton
                label={t("workbench.panelExpand")}
                onClick={() => onToggleState("expanded")}
              >
                {ExpandIcon}
              </SplitIconButton>
              <SplitIconButton label={t("workbench.panelClose")} onClick={onClose}>
                <ShellIcon className="h-3 w-3" name="close" />
              </SplitIconButton>
            </>
          )}
        </div>
      </div>
      {state === "expanded" ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      ) : (
        <>
          {/* collapsed：children 保留 mount 仅隐藏，避免 query/WS 重连；预览在下方渲染。 */}
          <div className="hidden">{children}</div>
          <PanelPreview sessionId={sessionId} />
        </>
      )}
    </div>
  );
}

type SplitDockProps = {
  panels: WorkbenchPanelRef[];
  onRestore: (sessionId: string) => void;
  restoreLabel: string;
};

/**
 * 底部 dock（设计 §7.3，仅桌面 split + 有最小化面板）。chip 横排，chip = label（项目名/session 名
 * 截断）；点击 → onRestore（恢复为 collapsed）。无最小化面板时 SplitLayout 不渲染本组件。
 */
function SplitDock({ panels, onRestore, restoreLabel }: SplitDockProps) {
  const { t } = useT();
  return (
    <nav
      aria-label={t("workbench.dock")}
      className="flex shrink-0 items-center gap-1 rounded-xl border-t border-on-surface/5 px-1.5 py-1"
    >
      {panels.map((p) => (
        <button
          aria-label={restoreLabel}
          className="inline-flex h-7 max-w-[10rem] items-center gap-1 rounded-lg bg-on-surface/5 px-2 text-[0.65rem] font-medium text-on-surface-muted transition hover:bg-on-surface/10 hover:text-on-surface"
          key={p.sessionId}
          onClick={() => onRestore(p.sessionId)}
          title={restoreLabel}
          type="button"
        >
          <ShellIcon className="h-3 w-3 shrink-0" name="terminal" />
          <span className="truncate">{p.sessionId.slice(0, 12)}</span>
        </button>
      ))}
    </nav>
  );
}

type SplitGutterProps = {
  /** 拖拽增量（本次 move 的 deltaX / 行宽，无量纲比例）；上层按行 totalFlex 转 deltaFlex。 */
  onResize: (ratioDelta: number) => void;
};

/**
 * 面板间分隔条（行内竖向）。pointer-event 拖拽：增量式（每次 move 算 deltaX/行宽 →
 * onResize），上层 resizePair 基于当前 layout 增量更新左右 sizes，累积正确。
 * setPointerCapture 锁定指针到 gutter，拖拽时即使滑过面板仍持续触发。
 */
function SplitGutter({ onResize }: SplitGutterProps) {
  const gutterRef = useRef<HTMLDivElement>(null);
  const lastX = useRef<number | null>(null);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    lastX.current = event.clientX;
    void gutterRef.current?.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (lastX.current === null) return;
    const row = gutterRef.current?.parentElement;
    const width = row?.getBoundingClientRect().width ?? 1;
    const delta = event.clientX - lastX.current;
    lastX.current = event.clientX;
    onResize(delta / width);
  };
  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    lastX.current = null;
    void gutterRef.current?.releasePointerCapture(event.pointerId);
  };

  return (
    <div
      aria-hidden
      className="w-1 shrink-0 cursor-col-resize rounded-full bg-on-surface/5 transition-colors hover:bg-on-surface/20"
      onPointerCancel={endDrag}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      ref={gutterRef}
    />
  );
}

type SplitIconButtonProps = {
  label: string;
  onClick: () => void;
  children: ReactNode;
};

/** split 工具条紧凑图标按钮（复用 shell 设计语言：圆角、muted、hover 提亮）。 */
function SplitIconButton({ label, onClick, children }: SplitIconButtonProps) {
  return (
    <button
      className="inline-flex h-5 w-5 items-center justify-center rounded-md text-on-surface-muted transition hover:bg-on-surface/5 hover:text-on-surface"
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

// 最大化/恢复/最小化/展开图标（克制新增：无对应 ShellIcon 资源，inline svg 常量，hoist 出组件避免每次重建）。
const MaximizeIcon = (
  <svg aria-hidden="true" className="h-3 w-3" fill="none" viewBox="0 0 16 16">
    <path
      d="M3 6V3.5A.5.5 0 0 1 3.5 3H6M10 3h2.5a.5.5 0 0 1 .5.5V6M13 10v2.5a.5.5 0 0 1-.5.5H10M6 13H3.5a.5.5 0 0 1-.5-.5V10"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
    />
  </svg>
);
const RestoreIcon = (
  <svg aria-hidden="true" className="h-3 w-3" fill="none" viewBox="0 0 16 16">
    <rect height="7" rx="1" stroke="currentColor" strokeWidth="1.5" width="7" x="5.5" y="5.5" />
    <path
      d="M3.5 11V4.5a1 1 0 0 1 1-1H11"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="1.5"
    />
  </svg>
);
const MinimizeIcon = (
  <svg aria-hidden="true" className="h-3 w-3" fill="none" viewBox="0 0 16 16">
    <path d="M3 8h10" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
  </svg>
);
const ExpandIcon = (
  <svg aria-hidden="true" className="h-3 w-3" fill="none" viewBox="0 0 16 16">
    <path
      d="M3 6V3.5A.5.5 0 0 1 3.5 3H6M10 3h2.5a.5.5 0 0 1 .5.5V6M13 10v2.5a.5.5 0 0 1-.5.5H10M6 13H3.5a.5.5 0 0 1-.5-.5V10"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
    />
  </svg>
);
