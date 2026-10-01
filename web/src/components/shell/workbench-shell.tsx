import { useAtom } from "jotai";
import { type CSSProperties, type PointerEvent, type ReactNode, useRef } from "react";
import { useT } from "../../i18n";
import {
  WORKBENCH_RIGHT_PANEL_MAX_REM,
  WORKBENCH_RIGHT_PANEL_MIN_REM,
  useMinViewport,
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

type WorkbenchShellProps = {
  /** 中栏：实例区（Stage 1 的 InstanceArea 接入）。工作台主体，不可收起。 */
  children: ReactNode;
  /**
   * 桌面合并 Sidebar（§6.12k：项目组 + seg4 + 实例组 + aprow + footnav 三项，05/04 原型
   * 恒定 side 单栏），grid 第 0 列。常驻（原型 side 恒驻无折叠语义）。
   */
  sidebar?: ReactNode;
  /**
   * 右栏展开态（运行时真相 = workbenchPanelOpenAtom，WorkbenchContent 单点写入并同步
   * rightCollapsed 记忆——批3 融合）。false = aside 不渲染（避免 inspection query）、
   * 中栏边缘渲染唤出钮。
   */
  rightOpen: boolean;
  /** 右栏开合统一入口（唤出钮 true / 面板 glabel2 行内 clps「»」false）。 */
  onRightOpenChange: (open: boolean) => void;
  /** 右栏：inspection tab（Stage 3 接入）。收起时上层传 null（避免 inspection query）。 */
  rightPanel?: ReactNode;
  /**
   * 右栏是否可收起/唤出（默认 !!rightPanel）。解耦「可唤出」与「内容渲染」：收起时
   * rightPanel=null（aside 不渲染，零 query），但 RailButton 仍渲染依赖 collapsible。
   * 装配点传 !desktopMainPage（全 scope 可唤出——2026-10-01 用户反馈 global 会话页右栏
   * 蒸发；mainPage 整页态仍传 false，中栏吃满是 09m/10m 既定 IA）。
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
 * 该侧消失、中栏对应边缘出现唤出按钮；中栏是工作台主体，恒 minmax(0, 1fr) 吃剩余
 * （右栏固定宽，见 rightColumn 注释），不可收起。
 *
 * 纯布局容器，不持业务 state：右栏开合受控（rightOpen/onRightOpenChange，真相 =
 * workbenchPanelOpenAtom）、宽度来自 workbench-model.ts 的 atom，三列内容由 props 注入。
 */
export function WorkbenchShell({
  children,
  rightOpen,
  rightPanel,
  rightPanelCollapsible,
  onRightOpenChange,
  sidebar,
  statusBar,
}: WorkbenchShellProps) {
  const { t } = useT();
  const [rightWidth, setRightWidth] = useAtom(workbenchRightWidthAtom);
  // 右栏可唤出 = 显式 prop 或有内容（向后兼容）。与 rightPanel 解耦：收起时 rightPanel=null
  //（aside 不渲染、零 inspection query），但 collapsible=true 仍在中栏边缘渲染 RailButton 唤出。
  const rightCollapsible = rightPanelCollapsible ?? !!rightPanel;

  // 右栏列宽（变量值 = 完整轨道定义，模板裸引用 var()——若模板再包 minmax(var(...)) 会嵌套
  // 非法整条声明被丢、退化为单列全宽，探针实测）：收起 / 不可唤出 → 0px；展开 → 固定
  // `${rightWidth}rem`（2026-09-24 第十二轮复验问题①拍板：minmax(atom, 1fr) 让默认 22rem
  // 架空、1920 视口下右栏膨胀 ~1060px；改固定宽 + 中栏吃剩余，gutter 拖拽仍生效）。
  // rightPanel null 不决定列宽（由 rightCollapsible 决定）。
  const rightColumn = !rightOpen || !rightCollapsible ? "0px" : `${rightWidth}rem`;
  // 中栏列宽：恒 minmax(0, 1fr)——右栏固定宽后中栏吃剩余（原型 .pinsp{flex:1} 的弹性语义
  // 移交中栏；右栏收起时行为不变，M2 拍板的中栏顶满保留）。
  const centerColumn = "minmax(0, 1fr)";

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
          {!rightOpen && rightCollapsible ? (
            <RailButton
              label={t("workbench.expandRight")}
              onClick={() => onRightOpenChange(true)}
              side="right"
            />
          ) : null}
          {children}
        </section>

        {rightPanel ? (
          <aside
            className={`relative hidden min-h-0 min-w-0 flex-col overflow-hidden border-l border-neutral-line/80 lg:flex ${shellSurfaceClasses.sidebar}`}
          >
            {/* 折叠入口 = 面板 glabel2 行内 clps「»」（05:103 原型）——44px PanelHeader 行
               退役（真机反馈 2026-09-29：右栏第一屏与原型完全两样，折叠钮从行内主色 »
               变成头部灰 ›）。§8 高度链：body 自身必须是 flex container，flex-1 子的约束
               才传得下去（FilesPanel 根 flex-1 依赖此层；overflow 只裁不传约束）。 */}
            <div className="flex min-h-0 flex-1 overflow-hidden">{rightPanel}</div>
            {/* 宽度拖拽 gutter（2026-10-01 拍板「右栏宽度确实要有拖拽效果」）：aside 在即渲染
               （原 `{rightOpen ? null : …}` 位于仅 rightPanel 非空才渲染的 aside 内，而
               rightPanel 非空 ⟹ panelOpen=true ⟹ rightOpen=true → 恒 null = 拖拽从未生效）。 */}
            <ColumnResizeGutter onResize={onResizeRight} side="right" />
          </aside>
        ) : null}
      </div>
      {statusBar}
    </main>
  );
}

type RailButtonProps = {
  label: string;
  onClick: () => void;
  side: "left" | "right";
};

/** 栏收起后，贴中栏边缘的唤出按钮（absolute overlay，不占 grid 轨道）。实底 +
 * 描边 + 实色图标：/60 半透明白在浅色主题下与中栏背景几乎同色，真机不可发现
 *（2026-09-30 用户反馈「折叠后展开按钮不见了」——DOM 在场但视觉隐形）。 */
function RailButton({ label, onClick, side }: RailButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`absolute top-1/2 z-20 flex h-20 w-6 -translate-y-1/2 items-center justify-center border-neutral-line bg-surface-raised text-on-surface-soft shadow-sm transition hover:text-on-surface active:bg-on-surface/10 ${
        side === "left"
          ? "left-0 rounded-r-lg border-y border-r"
          : "right-0 rounded-l-lg border-y border-l"
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
 * 方向（向左拖才增宽）。aside（展开态右栏容器）在即渲染——收起态整个 aside 不渲染
 *（唤出走 RailButton），gutter 随之消失是自然行为。
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
