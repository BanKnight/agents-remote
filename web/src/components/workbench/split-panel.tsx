import { Fragment, type ReactNode } from "react";
import {
  type WorkbenchLayout,
  type WorkbenchPanelRef,
  WORKBENCH_PANEL_DEFAULT_FLEX,
  deriveRows,
} from "../../routes/workbench-model";
import { useT } from "../../i18n";
import { shellSurfaceClasses } from "../shell/shell-primitives";
import { ShellIcon } from "../shell/icons";

type SplitLayoutProps = {
  layout: WorkbenchLayout;
  /** 渲染面板主体（实例内容：ChatPanel / TerminalPanel 等）。 */
  renderPanel: (ref: WorkbenchPanelRef) => ReactNode;
  /** 聚焦判定（URL focusId 命中时高亮面板边框，输入作用于它）。 */
  isFocused?: (ref: WorkbenchPanelRef) => boolean;
  /** 关闭面板 = 结束实例（Stage 4 commit ② 接入生命周期）。 */
  onClosePanel: (ref: WorkbenchPanelRef) => void;
};

/**
 * 中栏自由 split 布局（设计文档 §4）。消费 `WorkbenchLayout`（raw 有序结构），
 * 由纯函数 `deriveRows` 派生二维行结构后渲染：flex-col of flex-row。行内面板按
 * `sizes[sessionId]` flex 权重分配宽度；行高 V1 等权（flex-1）。maximized 时
 * deriveRows 已收敛为单面板单行，布局自然全屏。
 *
 * Stage 4 commit ①：纯原语（不接 InstanceArea）。gutter 为静态分隔条（视觉占位），
 * resize 拖拽 + 最大化按钮在 commit ③ 落地。
 */
export function SplitLayout({ layout, renderPanel, isFocused, onClosePanel }: SplitLayoutProps) {
  const rows = deriveRows(layout);
  if (rows.length === 0) return null;
  return (
    <div className="flex h-full min-h-0 flex-col gap-1">
      {rows.map((row, rowIdx) => (
        <div className="flex min-h-0 flex-1 flex-row gap-1" key={rowIdx}>
          {row.map((ref, colIdx) => (
            <Fragment key={ref.sessionId}>
              {colIdx > 0 && <SplitGutter />}
              <SplitPanel
                flex={layout.sizes[ref.sessionId] ?? WORKBENCH_PANEL_DEFAULT_FLEX}
                focused={isFocused?.(ref) ?? false}
                onClose={() => onClosePanel(ref)}
              >
                {renderPanel(ref)}
              </SplitPanel>
            </Fragment>
          ))}
        </div>
      ))}
    </div>
  );
}

type SplitPanelProps = {
  flex: number;
  focused: boolean;
  onClose: () => void;
  children: ReactNode;
};

/**
 * 单个 split 面板框：薄 split 工具条（关闭按钮）+ 面板主体。实例内容的领域 header
 *（ChatHeader / terminal header 等）由嵌入组件自带，本工具条只承载 split 级操作，
 * 避免双重 header。focused 时外环高亮（输入作用于聚焦面板）。
 */
function SplitPanel({ flex, focused, onClose, children }: SplitPanelProps) {
  const { t } = useT();
  return (
    <div
      className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl ${shellSurfaceClasses.shell} ${focused ? "ring-1 ring-cyan-300/40" : ""}`}
      style={{ flexGrow: flex, flexBasis: 0 }}
    >
      <div className="flex shrink-0 items-center justify-end gap-0.5 border-b border-white/5 px-1 py-0.5">
        <SplitIconButton label={t("workbench.panelClose")} onClick={onClose}>
          <ShellIcon className="h-3 w-3" name="close" />
        </SplitIconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}

/**
 * 面板间分隔条（行内竖向）。Stage 4 commit ① 为静态视觉占位；commit ③ 接入
 * pointer-event 拖拽 resize（按行宽比例更新左右面板 sizes）。
 */
function SplitGutter() {
  return <div className="w-1 shrink-0 cursor-col-resize rounded-full bg-white/5" aria-hidden />;
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
      className="inline-flex h-5 w-5 items-center justify-center rounded-md text-slate-500 transition hover:bg-white/5 hover:text-slate-100"
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}
