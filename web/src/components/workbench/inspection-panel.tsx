import { useEffect, type ReactNode } from "react";

import { useT } from "../../i18n";
import { useHScroll } from "@/hooks/use-h-scroll";
import type { PanelTab } from "@/routes/workbench-model";
import { cn } from "@/lib/utils";

import { ShellIcon } from "../shell/icons";
import { ActionMenu } from "../ui/action-menu";

/**
 * 面板标签条单源（v1.4 .ptabs，批3 从 InspectionPanel 抽出——桌面右栏 RightPanelTabs 与移动
 * 全屏面板共用同一标签条，多端同构只是容器不同）：标签即内容（div[role=tab] + ShellIcon +
 * 标签名），三基础标签不可关、file 标签 ✕，「＋」= 03ob2 新建标签菜单（已开 = 激活幂等，
 * 调用方保证）。
 */
export function PanelTabBar({
  activeTabId,
  onActivateTab,
  onCloseTab,
  onNewTab,
  tabs,
}: {
  activeTabId: string;
  onActivateTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  /** ＋ 新建标签（03ob2 菜单选中值；已开 = 激活幂等，调用方保证）。 */
  onNewTab: (kind: "files" | "git" | "wiki") => void;
  tabs: PanelTab[];
}) {
  const { t } = useT();
  // §7.2（批 8）：标签溢出时滚轮横滚 + 边缘 12px 渐隐；标签数变化不触发 scroll/resize，
  // 在内容 effect 里重算渐隐方向。批 11 反馈③：激活标签（aria-selected）变化时滚入视野
  //——开面板/切标签/新开 file 标签三个时机都滚；无溢出 no-op。
  const hs = useHScroll();
  useEffect(() => {
    hs.update();
    hs.ensureActive('[aria-selected="true"]');
  }, [activeTabId, tabs.length, hs.ensureActive, hs.update]);
  const tabMeta = (
    tab: PanelTab,
  ): { icon: "project" | "git-nav" | "book" | "file"; label: string } => {
    if (tab.kind === "files") return { icon: "project", label: t("workbench.tabFiles") };
    if (tab.kind === "git") return { icon: "git-nav", label: t("workbench.tabGit") };
    if (tab.kind === "wiki") return { icon: "book", label: t("workbench.tabWiki") };
    if (tab.kind === "wikiread") {
      return { icon: "file", label: tab.title ?? tab.slug };
    }
    return { icon: "file", label: tab.path.split("/").pop() || tab.path };
  };
  return (
    <div
      className="ptabs hfade shrink-0"
      data-role="ptabs"
      ref={hs.ref}
      role="tablist"
      {...hs.fadeProps}
    >
      {tabs.map((tab) => {
        const meta = tabMeta(tab);
        const active = tab.id === activeTabId;
        return (
          <div
            aria-label={meta.label}
            aria-selected={active}
            className={cn("ptab relative cursor-pointer", active && "on")}
            key={tab.id}
            onClick={() => onActivateTab(tab.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                // Space 默认滚动最近可滚祖先（.ptabs overflow-x:auto）——抑制后语义=纯激活。
                e.preventDefault();
                onActivateTab(tab.id);
              }
            }}
            role="tab"
            tabIndex={0}
          >
            <ShellIcon className="h-[13px] w-[13px]" name={meta.icon} />
            {meta.label}
            {tab.kind === "file" || tab.kind === "wikiread" ? (
              <button
                aria-label={t("session.close")}
                className="x flex h-6 w-5 cursor-pointer items-center justify-center"
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(tab.id);
                }}
                type="button"
              >
                ✕
              </button>
            ) : null}
          </div>
        );
      })}
      <ActionMenu
        align="start"
        cancelLabel={t("cancel")}
        items={(
          [
            { id: "files", icon: "project", label: t("workbench.tabFiles") },
            { id: "git", icon: "git-nav", label: t("workbench.tabGit") },
            { id: "wiki", icon: "book", label: t("workbench.tabWiki") },
          ] as const
        ).map((item) => ({
          label: item.label,
          icon: <ShellIcon name={item.icon} />,
          onSelect: () => onNewTab(item.id),
        }))}
        trigger={
          /* ＋ 字形放内层 span.plus（button 只当 28px 热区容器）：.plus 的笔画是 ::before/::after
             伪元素，此前 after:-inset-2 热区 utilities 会以 utilities 层覆盖 ::after 的
             left/top → 竖笔画游离成标签条右端的蓝色「'」（真机反馈实锤后改容器式热区）。 */
          <button
            aria-label={t("workbench.newPanelTab")}
            className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center"
            type="button"
          >
            <span className="plus" />
          </button>
        }
      />
    </div>
  );
}

/**
 * 检视面板（v1.4 03o/03ob 检视面板，redesign-v2 §6.13 批2）：移动端 = 全屏页——自带
 * 「‹ 工作台」nav（back 文案随面板态切换，03o 原型）、动态标签条（.ptabs，标签即内容：
 * 三基础标签不可关、file 标签 ✕、「＋」= 03ob2 新建标签菜单）、工具 chip 槽（03o crumb /
 * 03m gitchip / 03p wsearch——数据与交互由调用方装配，与工作台 header 的 toolChip 同源）、
 * 内容区（激活标签）与 FAB（仅文件树标签）。
 *
 * **零销毁纪律**：面板容器常驻挂载（调用方固定渲染本组件），开合 = translate + visibility
 * 切换——FilesToolPanel/GitToolPanel 的查询与滚动位跨开关保持（frontend-notes §3 副作用
 * 生命周期不随结构切换重建）。closed 时 `invisible` 防虚拟器空转与误聚焦。
 *
 * **面板内 L3**：`l3` 非空（open 态下 push 的 git/wiki 深度页）时面板整体切 L3 形态——
 * nav 换 backLabel/title（03u「‹ Git 检视」）、标签条隐藏、内容 = l3Body。back 回标签条
 *（= 原型语义「L3 是面板内深度页」）；深链直达时面板 closed，L3 照旧渲染在主体区（现状）。
 */
export function InspectionPanel({
  activeTabId,
  children,
  fab,
  l3,
  l3Body,
  navActions,
  onActivateTab,
  onClose,
  onCloseTab,
  onNewTab,
  open,
  projectName,
  tabs,
  toolChip,
}: {
  activeTabId: string;
  /** 激活标签内容（调用方按 activeTabId 装配工具面板/file 预览）。 */
  children?: ReactNode;
  /** 文件树标签的悬浮添加钮（FAB；仅文件树标签渲染）。 */
  fab?: ReactNode;
  /** 面板内 L3 深度页 nav 形态（open 态 push；语义同 MobileProjectHeader 的 l3）。 */
  l3?: { backLabel: string; title: string; onClick: () => void; actions?: ReactNode };
  /** 面板内 L3 主体。 */
  l3Body?: ReactNode;
  /**
   * 面板 nav 右端动作（v1.5 批3：面板态 = 激活 file 标签的 [pencil][⋯] / wikiread 标签的
   * ⋯ 复制链接；open 态才渲染——panelVisible gate 由装配层保证）。与 l3.actions 互斥
   *（L3 形态走 l3.actions）。
   */
  navActions?: ReactNode;
  onActivateTab: (id: string) => void;
  /** ‹ 工作台（关面板；面板内 L3 时由调用方同时清 L3 路由）。 */
  onClose: () => void;
  onCloseTab: (id: string) => void;
  /** ＋ 新建标签（03ob2 菜单选中值；已开 = 激活幂等，调用方保证）。 */
  onNewTab: (kind: "files" | "git" | "wiki") => void;
  open: boolean;
  projectName: string;
  tabs: PanelTab[];
  /** 工具 chip 槽（03o crumb+搜索 / 03m gitchip / 03p wsearch；调用方按激活标签装配）。 */
  toolChip?: ReactNode;
}) {
  const { t } = useT();
  return (
    <div
      aria-hidden={!open}
      className={cn(
        "fixed inset-0 z-40 flex flex-col overflow-hidden bg-surface-base pt-[var(--shell-safe-area-top)] transition-[transform,visibility] duration-300 ease-out",
        open ? "translate-x-0" : "invisible translate-x-full",
      )}
      data-inspection-panel={open ? "open" : "closed"}
    >
      {/* nav（原型 03o：back「工作台」+ 项目名标题；面板内 L3 时切 L3 nav 形态）。面板态
        不渲染 ℹ/⋯——无聚焦实例上下文（原型编号说明未定义其行为，记档偏离）。 */}
      <div className="nav shrink-0">
        <button
          className="back cursor-pointer touch:px-2 touch:py-2"
          onClick={l3 ? l3.onClick : onClose}
          type="button"
        >
          {l3 ? l3.backLabel : t("nav.workbench")}
        </button>
        <h1 className={`nv-t min-w-0${l3 ? " font-mono text-[14px]" : ""}`}>
          <span className="block truncate">{l3 ? l3.title : projectName}</span>
        </h1>
        {l3 ? l3.actions : navActions}
      </div>
      {l3 ? null : (
        <>
          {/* 动态标签条（03ob ①，PanelTabBar 单源——桌面右栏同引）：标签即内容，＋ 新建 /
           ✕ 关闭；三基础标签不可关（plan 批2 拍板；原型示例 Git 标签的 ✕ 视为展示语义）。 */}
          <PanelTabBar
            activeTabId={activeTabId}
            onActivateTab={onActivateTab}
            onCloseTab={onCloseTab}
            onNewTab={onNewTab}
            tabs={tabs}
          />
          {/* 工具 chip 槽（03o ②：文件树标签 = crumb+收缩搜索；Git = gitchip；Wiki = wsearch） */}
          {toolChip ? (
            <div className="mx-4 mt-2.5 flex shrink-0 items-center gap-2">{toolChip}</div>
          ) : null}
        </>
      )}
      {/* 内容区：标签面板恒挂载（零销毁保活——children 由调用方 panelEverOpened 门控首开；
        L3 = 不透明覆盖层，标签面板保活在底层，返回标签条零重建）。 */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        {children}
        {l3 ? (
          <div className="absolute inset-0 z-10 flex min-h-0 flex-col overflow-hidden bg-surface-base">
            {l3Body}
          </div>
        ) : null}
      </div>
      {l3 ? null : fab}
    </div>
  );
}
