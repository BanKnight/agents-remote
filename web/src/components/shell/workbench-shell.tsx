import { useAtom } from "jotai";
import { type CSSProperties, type PointerEvent, type ReactNode, useRef } from "react";
import { useT } from "../../i18n";
import {
  WORKBENCH_MIDDLE_LEFT_MAX_REM,
  WORKBENCH_MIDDLE_LEFT_MIN_REM,
  WORKBENCH_RIGHT_PANEL_MAX_REM,
  WORKBENCH_RIGHT_PANEL_MIN_REM,
  workbenchLeftCollapsedAtom,
  workbenchMiddleLeftWidthAtom,
  workbenchRightCollapsedAtom,
  workbenchRightWidthAtom,
} from "../../routes/workbench-model";
import { shellSurfaceClasses } from "./shell-primitives";

/** 活动栏列宽（rem）= ActivityBar `w-12`（48px）。固定不折叠、不 resize（一级导航常驻）。 */
const ACTIVITY_COLUMN_REM = 3;

type WorkbenchShellProps = {
  /** 中栏：实例区（Stage 1 的 InstanceArea 接入）。工作台主体，不可收起。 */
  children: ReactNode;
  /**
   * 活动栏：一级导航（项目/文件/设置），grid 第 0 列。常驻——不读 leftCollapsed，
   * 折叠左栏时活动栏列宽不变（一级导航进入项目后也在）。Phase 1 接入 `<ActivityBar/>`。
   */
  activityBar?: ReactNode;
  /** 左栏：项目 + 实例树（Stage 2 接入）。 */
  leftPanel?: ReactNode;
  /** 右栏：inspection tab（Stage 3 接入）。收起时上层传 null（避免 inspection query）。 */
  rightPanel?: ReactNode;
  /**
   * 右栏是否可收起/唤出（默认 !!rightPanel）。解耦「可唤出」与「内容渲染」：收起时
   * rightPanel=null（aside 不渲染，零 query），但 RailButton 仍渲染依赖 collapsible。
   * project scope 传 true（非聚焦态唤出看 project-scoped inspection）；global 传 false。
   */
  rightPanelCollapsible?: boolean;
};

/**
 * 三栏工作台外壳（设计文档 docs/design/workbench-redesign.md §2）。
 *
 * 桌面常驻三栏 grid：左栏（项目树）/ 中栏（实例区）/ 右栏（inspection tab）。
 * 左右栏可收起（atom 持久化），收起后该侧消失、中栏对应边缘出现唤出按钮；
 * 中栏是工作台主体，恒占 minmax(0,1fr)，不可收起。
 *
 * 纯布局容器，不持业务 state：栏折叠态 + 宽度来自 workbench-model.ts 的 atom，
 * 三栏内容由 props 注入（Stage 1/2/3 分别接入）。
 */
export function WorkbenchShell({
  activityBar,
  children,
  leftPanel,
  rightPanel,
  rightPanelCollapsible,
}: WorkbenchShellProps) {
  const { t } = useT();
  const [leftCollapsed, setLeftCollapsed] = useAtom(workbenchLeftCollapsedAtom);
  const [rightCollapsed, setRightCollapsed] = useAtom(workbenchRightCollapsedAtom);
  const [leftWidth, setLeftWidth] = useAtom(workbenchMiddleLeftWidthAtom);
  const [rightWidth, setRightWidth] = useAtom(workbenchRightWidthAtom);
  // 右栏可唤出 = 显式 prop 或有内容（向后兼容）。与 rightPanel 解耦：收起时 rightPanel=null
  //（aside 不渲染、零 inspection query），但 collapsible=true 仍在中栏边缘渲染 RailButton 唤出。
  const rightCollapsible = rightPanelCollapsible ?? !!rightPanel;

  // grid 列宽：栏收起 → 0px（栏 aside display none + 列塌缩）；展开 → atom 记忆宽度。
  const leftColumn = leftCollapsed ? "0px" : `${leftWidth}rem`;
  // 右栏列宽：收起 / 不可唤出 → 0px；展开 → atom 记忆宽度。rightPanel null 不决定列宽
  //（由 rightCollapsible 决定）—— 收起态 rightPanel=null 但列保持唤出能力（RailButton 占位）。
  const rightColumn = rightCollapsed || !rightCollapsible ? "0px" : `${rightWidth}rem`;

  // 栏 resize gutter：拖拽改宽度 atom（clamp 到 MIN/MAX，防压溃自身或吃掉中栏）。
  // 右栏翻转方向 —— 向左拖（−delta）才增宽。
  const onResizeLeft = (deltaRem: number) =>
    setLeftWidth((prev) =>
      Math.min(
        Math.max(prev + deltaRem, WORKBENCH_MIDDLE_LEFT_MIN_REM),
        WORKBENCH_MIDDLE_LEFT_MAX_REM,
      ),
    );
  const onResizeRight = (deltaRem: number) =>
    setRightWidth((prev) =>
      Math.min(
        Math.max(prev + deltaRem, WORKBENCH_RIGHT_PANEL_MIN_REM),
        WORKBENCH_RIGHT_PANEL_MAX_REM,
      ),
    );

  return (
    <main className="relative h-[var(--app-viewport-height)] overflow-hidden text-on-surface">
      <div
        className={`grid h-full min-h-0 w-full min-w-0 grid-cols-1 overflow-hidden pt-[var(--shell-safe-area-top)] lg:grid-cols-[var(--workbench-activity-col)_var(--workbench-left-col)_minmax(0,1fr)_var(--workbench-right-col)] ${shellSurfaceClasses.shell}`}
        style={
          {
            "--workbench-activity-col": `${ACTIVITY_COLUMN_REM}rem`,
            "--workbench-left-col": leftColumn,
            "--workbench-right-col": rightColumn,
          } as CSSProperties
        }
      >
        {/* 活动栏（第 0 列）：极简容器，视觉由 ActivityBar 自带（bg-surface + border-r + h-full）。 */}
        <aside className="hidden min-h-0 min-w-0 lg:block">{activityBar}</aside>
        <aside
          className={`relative hidden min-h-0 min-w-0 flex-col overflow-hidden border-r border-neutral-line/80 lg:flex ${shellSurfaceClasses.sidebar}`}
        >
          <PanelHeader
            chevron="left"
            collapseLabel={t("workbench.collapseLeft")}
            onCollapse={() => setLeftCollapsed(true)}
          />
          <div className="min-h-0 flex-1 overflow-hidden">{leftPanel}</div>
          {leftCollapsed ? null : <ColumnResizeGutter onResize={onResizeLeft} side="left" />}
        </aside>

        <section className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
          {leftCollapsed ? (
            <RailButton
              label={t("workbench.expandLeft")}
              onClick={() => setLeftCollapsed(false)}
              side="left"
            />
          ) : null}
          {rightCollapsed && rightCollapsible ? (
            <RailButton
              label={t("workbench.expandRight")}
              onClick={() => setRightCollapsed(false)}
              side="right"
            />
          ) : null}
          {children}
        </section>

        {rightPanel ? (
          <aside
            className={`relative hidden min-h-0 min-w-0 flex-col overflow-hidden border-l border-neutral-line/80 lg:flex ${shellSurfaceClasses.sidebar}`}
          >
            <PanelHeader
              chevron="right"
              collapseLabel={t("workbench.collapseRight")}
              onCollapse={() => setRightCollapsed(true)}
            />
            <div className="min-h-0 flex-1 overflow-hidden">{rightPanel}</div>
            {rightCollapsed ? null : <ColumnResizeGutter onResize={onResizeRight} side="right" />}
          </aside>
        ) : null}
      </div>
    </main>
  );
}

type PanelHeaderProps = {
  chevron: "left" | "right";
  collapseLabel: string;
  onCollapse: () => void;
};

/** 栏顶部收起按钮。Stage 2/3 接入时可在左侧追加栏标题。 */
function PanelHeader({ chevron, collapseLabel, onCollapse }: PanelHeaderProps) {
  return (
    <div className="flex h-9 shrink-0 items-center justify-end px-2">
      <button
        type="button"
        aria-label={collapseLabel}
        onClick={onCollapse}
        className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-on-surface-muted transition hover:bg-on-surface/5 hover:text-on-surface-soft"
      >
        {chevron === "left" ? <ChevronLeft /> : <ChevronRight />}
      </button>
    </div>
  );
}

type RailButtonProps = {
  label: string;
  onClick: () => void;
  side: "left" | "right";
};

/** 栏收起后，贴中栏边缘的唤出按钮（absolute overlay，不占 grid 轨道）。 */
function RailButton({ label, onClick, side }: RailButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`absolute top-1/2 z-20 flex h-16 w-5 -translate-y-1/2 items-center justify-center bg-surface-raised/60 text-on-surface-muted backdrop-blur transition hover:bg-surface-raised/80 hover:text-on-surface ${
        side === "left"
          ? "left-0 rounded-r-lg border-y border-r border-neutral-line/80"
          : "right-0 rounded-l-lg border-y border-l border-neutral-line/80"
      }`}
    >
      {side === "left" ? <ChevronLeft /> : <ChevronRight />}
    </button>
  );
}

function ChevronLeft() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M10 3L5 8l5 5"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        stroke="currentColor"
      />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M6 3l5 5-5 5"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        stroke="currentColor"
      />
    </svg>
  );
}

type ColumnResizeGutterProps = {
  side: "left" | "right";
  onResize: (deltaRem: number) => void;
};

/**
 * 栏与中栏之间的 resize 分隔条（贴 aside 内侧边缘，全高 absolute）。pointer-event
 * 拖拽：增量式（每次 move 算 deltaX / rootFontSize → deltaRem → onResize），上层
 * clamp 到 MIN/MAX。setPointerCapture 锁定指针，拖拽时即使滑过中栏仍持续。右栏翻转
 * 方向（向左拖才增宽）。栏收起时不渲染（改由 RailButton 唤出）。
 */
function ColumnResizeGutter({ onResize, side }: ColumnResizeGutterProps) {
  const dragRef = useRef<{ lastX: number; rootFont: number } | null>(null);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const rootFont = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    dragRef.current = { lastX: event.clientX, rootFont };
    void event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const delta = event.clientX - drag.lastX;
    drag.lastX = event.clientX;
    const deltaRem = delta / drag.rootFont;
    onResize(side === "left" ? deltaRem : -deltaRem);
  };
  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    void event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <div
      aria-hidden
      className={`absolute bottom-0 top-0 z-20 w-1 cursor-col-resize bg-transparent transition-colors hover:bg-primary/30 ${
        side === "left" ? "right-0" : "left-0"
      }`}
      onPointerCancel={endDrag}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
    />
  );
}
