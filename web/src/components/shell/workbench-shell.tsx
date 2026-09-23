import { useAtom } from "jotai";
import { type CSSProperties, type PointerEvent, type ReactNode, useRef } from "react";
import { useT } from "../../i18n";
import {
  WORKBENCH_RIGHT_PANEL_MAX_REM,
  WORKBENCH_RIGHT_PANEL_MIN_REM,
  useMinViewport,
  workbenchRightCollapsedAtom,
  workbenchRightWidthAtom,
} from "../../routes/workbench-model";
import { shellSurfaceClasses } from "./shell-primitives";

/**
 * Sidebar 列宽分档（§6.12j 批次 5，components.css 注释「宽度页自定：Mac 250 / iPad 260」）：
 * iPad 档（视口 1024–1179，04 原型 `.side` 260px）/ Mac 档（≥1180，05 原型 `.side` 250px）。
 * 用 px 而非 rem——标尺是像素值，rem 换算会随根字号漂移。固定不折叠、不 resize（side 恒驻；
 * 内容自身 overflow-y-auto）。分档断点 1180 = MAC_SIDEBAR_MIN_VIEWPORT_PX。
 */
const SIDEBAR_WIDTH_IPAD = "260px";
const SIDEBAR_WIDTH_MAC = "250px";
/** Mac 档（250px 侧栏）最低视口：04/05 原型分档的工程化落点（iPad 档 = 1024–1179）。 */
const MAC_SIDEBAR_MIN_VIEWPORT_PX = 1180;

/**
 * 中栏（会话窗格）定宽上限（§6.10-2：04 原型 `.center{width:600px;flex:none}`）。落成
 * `minmax(0, 600px)` 而非死 600px——三列（side 250/260 + 中栏 + inspector）下视口紧张时
 * 中栏让位（grid 顺序：side/inspector 先保底、中栏吃剩余、封顶 600）；大屏中栏恒 600、
 * 剩余全给 inspector，即原型的「center flex-none + inspector flex-1」。
 */
const WORKBENCH_CENTER_MAX = "600px";

type WorkbenchShellProps = {
  /** 中栏：实例区（Stage 1 的 InstanceArea 接入）。工作台主体，不可收起。 */
  children: ReactNode;
  /**
   * 桌面合并 Sidebar（§6.12k：项目组 + seg4 + 实例组 + aprow + footnav 三项，05/04 原型
   * 恒定 side 单栏），grid 第 0 列。常驻（原型 side 恒驻无折叠语义）。
   */
  sidebar?: ReactNode;
  /** 右栏：inspection tab（Stage 3 接入）。收起时上层传 null（避免 inspection query）。 */
  rightPanel?: ReactNode;
  /**
   * 右栏是否可收起/唤出（默认 !!rightPanel）。解耦「可唤出」与「内容渲染」：收起时
   * rightPanel=null（aside 不渲染，零 query），但 RailButton 仍渲染依赖 collapsible。
   * project scope 传 true（非聚焦态唤出看 project-scoped inspection）；global 传 false。
   */
  rightPanelCollapsible?: boolean;
  /**
   * 窗口底部状态栏（§6.10-4，M9 批次 b StatusBar）。Shell 纯布局挂载点——数据 hooks 在
   * StatusBar 内部（自身 useIsDesktopViewport 控制渲染与订阅），移动端 null 零挂载。
   */
  statusBar?: ReactNode;
};

/**
 * 三列工作台外壳（§6.12k：4 列 → 3 列，05/04 原型同构 side 单栏）。
 *
 * 桌面常驻三列 grid：side（合并 Sidebar：项目组 + seg4 + 实例组 + aprow + footnav，恒驻
 * 不折叠）/ 中栏（实例区）/ 右栏（inspection tab）。右栏可收起（atom 持久化），收起后
 * 该侧消失、中栏对应边缘出现唤出按钮；中栏是工作台主体，minmax(0,600px) 定宽上限
 * （§6.10-2 center flex-none），不可收起。
 *
 * 纯布局容器，不持业务 state：右栏折叠态 + 宽度来自 workbench-model.ts 的 atom，
 * 三列内容由 props 注入。
 */
export function WorkbenchShell({
  children,
  rightPanel,
  rightPanelCollapsible,
  sidebar,
  statusBar,
}: WorkbenchShellProps) {
  const { t } = useT();
  const [rightCollapsed, setRightCollapsed] = useAtom(workbenchRightCollapsedAtom);
  const [rightWidth, setRightWidth] = useAtom(workbenchRightWidthAtom);
  // 右栏可唤出 = 显式 prop 或有内容（向后兼容）。与 rightPanel 解耦：收起时 rightPanel=null
  //（aside 不渲染、零 inspection query），但 collapsible=true 仍在中栏边缘渲染 RailButton 唤出。
  const rightCollapsible = rightPanelCollapsible ?? !!rightPanel;

  // 右栏列宽（变量值 = 完整轨道定义，模板裸引用 var()——若模板再包 minmax(var(...)) 会嵌套
  // 非法整条声明被丢、退化为单列全宽，探针实测）：收起 / 不可唤出 → 0px；展开 →
  // minmax(atom, 1fr)（§6.10-2 `.pinsp{flex:1}`）：atom 语义 = inspector 最小宽，gutter
  // 拖拽调下限、实际宽吃视口剩余。rightPanel null 不决定列宽（由 rightCollapsible 决定）。
  const rightColumn = rightCollapsed || !rightCollapsible ? "0px" : `minmax(${rightWidth}rem, 1fr)`;
  // 中栏列宽：右栏展开 → minmax(0, 600px)（§6.10-2 `.center{width:600px;flex:none}`：
  // side/inspector 保底后中栏吃剩余、封顶 600）；右栏收起/不可唤出 → minmax(0, 1fr)——原型
  // inspector 常驻无「收起」态，M2 拍板右栏可收，收起后中栏顶上吃满剩余（回 1fr 行为）。
  const centerColumn =
    rightCollapsed || !rightCollapsible ? "minmax(0, 1fr)" : `minmax(0, ${WORKBENCH_CENTER_MAX})`;

  // 栏 resize gutter：拖拽改宽度 atom（clamp 到 MIN/MAX，防压溃自身或吃掉中栏）。
  // 右栏翻转方向 —— 向左拖（−delta）才增宽。
  const onResizeRight = (deltaRem: number) =>
    setRightWidth((prev) =>
      Math.min(
        Math.max(prev + deltaRem, WORKBENCH_RIGHT_PANEL_MIN_REM),
        WORKBENCH_RIGHT_PANEL_MAX_REM,
      ),
    );

  // 侧栏分档：iPad 档（1024–1179）260px / Mac 档（≥1180）250px（§6.12j 批次 5）。
  const macWide = useMinViewport(MAC_SIDEBAR_MIN_VIEWPORT_PX);
  const sidebarWidth = macWide ? SIDEBAR_WIDTH_MAC : SIDEBAR_WIDTH_IPAD;

  return (
    <main className="relative flex h-[var(--app-viewport-height)] flex-col overflow-hidden text-on-surface">
      <div
        className={`grid min-h-0 w-full min-w-0 flex-1 grid-cols-1 overflow-hidden pt-[var(--shell-safe-area-top)] lg:grid-cols-[var(--workbench-side-col)_var(--workbench-center-col)_var(--workbench-right-col)] ${shellSurfaceClasses.shell}`}
        style={
          {
            "--workbench-side-col": sidebarWidth,
            "--workbench-center-col": centerColumn,
            "--workbench-right-col": rightColumn,
          } as CSSProperties
        }
      >
        {/* Sidebar（第 0 列）：合并 side（项目组 + seg4 + 实例组 + aprow + footnav 三项）。
            视觉由 side 内容自带（.side/.sidewin：bg-sidebar + border-r + h-full）。 */}
        <aside className="hidden min-h-0 min-w-0 lg:block">{sidebar}</aside>

        <section className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
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
            {/* §8 高度链：body 自身必须是 flex container，flex-1 子的约束才传得下去
               （FilesPanel 根 flex-1 依赖此层；overflow 只裁不传约束）。 */}
            <div className="flex min-h-0 flex-1 overflow-hidden">{rightPanel}</div>
            {rightCollapsed ? null : <ColumnResizeGutter onResize={onResizeRight} side="right" />}
          </aside>
        ) : null}
      </div>
      {statusBar}
    </main>
  );
}

type PanelHeaderProps = {
  chevron: "left" | "right";
  collapseLabel: string;
  onCollapse: () => void;
};

/**
 * 栏顶部 header（批 D / DESIGN PanelHeader）：右侧收起按钮。左栏 title 大标题形制已随左栏
 * 退役（§6.12k）；右栏不传 title，仅收起。
 */
function PanelHeader({ chevron, collapseLabel, onCollapse }: PanelHeaderProps) {
  return (
    <div className="flex h-11 shrink-0 items-center gap-1 border-b border-on-surface/5 px-2">
      <div className="min-w-0 flex-1" />
      <button
        type="button"
        aria-label={collapseLabel}
        onClick={onCollapse}
        className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-on-surface-muted transition hover:bg-on-surface/5 hover:text-on-surface-soft active:bg-on-surface/10"
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
      className={`absolute top-1/2 z-20 flex h-16 w-5 -translate-y-1/2 items-center justify-center bg-surface-raised/60 text-on-surface-muted backdrop-blur transition hover:bg-surface-raised/80 hover:text-on-surface active:bg-on-surface/10 ${
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
