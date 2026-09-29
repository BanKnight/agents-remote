import { useAtom } from "jotai";
import { useT } from "../../i18n";
import {
  type PanelTab,
  panelFileTab,
  ensurePanelTabOpen,
  splitFilePath,
  workbenchPanelActiveAtom,
  workbenchPanelTabsAtom,
  BASE_PANEL_TABS,
  withBasePanelTabs,
} from "../../routes/workbench-model";
import { FilesToolTab, GitToolTab, PanelFileTabBody, WikiToolTab } from "./workbench-tab-plugin";
import { PanelTabBar } from "./inspection-panel";
import { usePanelToolChip } from "./project-tool-panels";
import { cn } from "@/lib/utils";
import type { WorkbenchTabPluginContext } from "./workbench-tab-plugin";

/**
 * 桌面右栏检视面板容器（v1.4 05:99 ptabs 动态标签，redesign-v2 §6.13 批3）：与移动全屏面板
 * 消费**同一** panelTabs/panelActive atom（per-projectKey，多端同构——标签集/激活项跨端一致），
 * 标签条 = PanelTabBar 单源（seg4 退役）；「检视 · 只读」头保持。
 *
 * **叠层保活**（批2 移动同范式，frontend-notes §3）：panelTabs 全渲染，非激活 invisible
 *（visibility 保布局保滚动位），absolute inset-0 叠层；切标签不卸载不重挂，cwd/滚动位/详情栈
 * 状态跨切换保持。file 标签 body = PanelFileTabBody 单源（preview ↔ diff 栈）。
 *
 * 面板开合真相 = workbenchPanelOpenAtom（WorkbenchContent 融合右栏折叠，WorkbenchShell
 * 受控化）；本组件恒在面板 open 时渲染，不持开合 state。
 */
export function RightPanelTabs({
  ctx,
  onCollapse,
}: {
  ctx: WorkbenchTabPluginContext;
  /** glabel2 行内 clps「»」收起右栏（05:103 原型折叠语义；装配点传 closeDesktopPanel）。 */
  onCollapse: () => void;
}) {
  const { t } = useT();
  const projectKey = ctx.projectKey;
  const [panelTabsMap, setPanelTabsMap] = useAtom(workbenchPanelTabsAtom);
  const [panelActiveMap, setPanelActiveMap] = useAtom(workbenchPanelActiveAtom);
  // 右栏仅 project scope 渲染（WorkbenchRoute rightPanelCollapsible gate），projectKey 理论
  // 恒非空；undefined 回退缺省标签表（与移动缺省一致 = [{files}]），null 保留 empty 态兜底。
  const panelTabs = withBasePanelTabs(
    (projectKey ? panelTabsMap[projectKey] : undefined) ?? BASE_PANEL_TABS,
  );
  const activePanelTabId = (projectKey ? panelActiveMap[projectKey] : undefined) ?? "files";
  // 幂等守卫：值未变直接返回旧引用（与移动 activatePanelTab 同款）。
  const activatePanelTab = (id: string) =>
    setPanelActiveMap((prev) => {
      const cur = projectKey ? prev[projectKey] : undefined;
      return cur === id ? prev : { ...prev, [projectKey as string]: id };
    });
  // ensure 新增标签（基础标签由 ＋ 菜单/深链映射调用；存在即幂等 no-op）。
  const ensureTab = (tab: PanelTab) => {
    if (!projectKey) return;
    setPanelTabsMap((prev) => {
      const list = prev[projectKey] ?? BASE_PANEL_TABS;
      const next = ensurePanelTabOpen(list, tab);
      if (next === list) return prev;
      return { ...prev, [projectKey]: next };
    });
  };
  // ＋ 新建标签（03ob2 菜单）：同目标已开 = 激活幂等。
  const newPanelTab = (kind: "files" | "git" | "wiki") => {
    ensureTab({ id: kind, kind } as PanelTab);
    activatePanelTab(kind);
  };
  // ✕ 关标签：仅 file 标签可关（三基础标签不可关）；关激活标签回文件树首标签。
  const closePanelTab = (id: string) => {
    setPanelTabsMap((prev) => {
      if (!projectKey) return prev;
      const list = prev[projectKey] ?? [];
      return { ...prev, [projectKey]: list.filter((t0) => t0.id !== id) };
    });
    if (id === activePanelTabId) activatePanelTab("files");
  };
  // 树点文件直达（链接直达批3）：ensure + 激活 file 标签。file 标签 ✕ 关闭由 PanelTabBar。
  const openPanelFileTab = (relPath: string) => {
    const tab = panelFileTab(projectKey ?? "", relPath);
    ensureTab(tab);
    activatePanelTab(tab.id);
  };
  // 工具 chip 槽装配单源（usePanelToolChip，与移动 InspectionPanel 同一份——多端同构；
  // 搜索 query 提升透传 Tab 三件套，chip 与列表同 state）。
  const { filesSearchQuery, setWikiSearchQuery, toolChip, wikiSearchQuery } = usePanelToolChip({
    currentPath: ctx.currentPath,
    kind: panelTabs.find((t0) => t0.id === activePanelTabId)?.kind ?? "files",
    onPathChange: ctx.onPathChange,
    projectKey: projectKey ?? "",
  });

  if (!projectKey) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {/* 空态同样暴露折叠入口（PanelHeader 退役后 clps 是唯一收起钮）。 */}
        <div className="glabel2 shrink-0">
          {t("workbench.inspectorTitle")}
          <button
            aria-label={t("workbench.collapseRight")}
            className="clps cursor-pointer border-none bg-transparent"
            onClick={onCollapse}
            type="button"
          >
            »
          </button>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center p-4 text-center text-xs text-on-surface-muted">
          {t("workbench.rightPanelEmpty")}
        </div>
      </div>
    );
  }

  return (
    /* flex-1 = 横向 grow（shell 右栏 body 是 row flex，子无 grow 会收缩到 max-content——
       旧 FilesPanel 根 flex-1 承担，批次 3 换三件套后 grow 上移到本根，§6.12l 记档）。
       min-w-0 = row-flex item 收缩约束（automatic min size 默认 = min-content，详情态长行
       pre/diff 的 min-content 会把本根撑到数千 px，seg4 span flex:1 均分后被裁成
       「只剩文件」——用户复验实测 13850px，§6.12l 条 11）。 */
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col" data-desktop-inspector="">
      {/* 检视标头（§6.12j 对齐 05:99/05:103 原型：glabel2「检视 · 只读」+ 行内右端折叠
          «（clps，主色 14px/700，05:103）+ PanelTabBar 动态标签条（批3，seg4 退役）。
          只读语义固定——检视面板全部是只读视图。clps 取代 44px PanelHeader 折叠钮
         （真机反馈 2026-09-29：右栏第一屏与原型完全两样）。 */}
      <div className="glabel2 shrink-0">
        {t("workbench.inspectorTitle")}
        <button
          aria-label={t("workbench.collapseRight")}
          className="clps cursor-pointer border-none bg-transparent"
          onClick={onCollapse}
          type="button"
        >
          »
        </button>
      </div>
      <PanelTabBar
        activeTabId={activePanelTabId}
        onActivateTab={activatePanelTab}
        onCloseTab={closePanelTab}
        onNewTab={newPanelTab}
        tabs={panelTabs}
      />
      {/* 工具 chip 槽（03o crumb+搜索 / 03m gitchip / 03p wsearch；与移动 InspectionPanel
          同款槽结构 mx-4 mt-2.5 gap-2——装配单源 usePanelToolChip，右栏不再裸奔「..」行
          （真机反馈 2026-09-29 Files 标签缺顶部工具行 / Wiki 缺搜索入口）。 */}
      {toolChip ? (
        <div className="mx-4 mt-2.5 flex shrink-0 items-center gap-2">{toolChip}</div>
      ) : null}
      {/* §8 高度链：body 自身必须是 flex container（检视内容 FilesPanel 等是 flex-1 子）；
        relative = 标签叠层 absolute inset-0 的定位基准。 */}
      <div
        className="relative flex min-h-0 flex-1 overflow-hidden"
        key={projectKey}
        role="tabpanel"
      >
        {panelTabs.map((tab) => {
          const active = tab.id === activePanelTabId;
          return (
            <div
              className={cn(
                "absolute inset-0 flex min-h-0 flex-col overflow-hidden",
                !active && "invisible",
              )}
              data-panel-tab-body={tab.id}
              key={tab.id}
            >
              {tab.kind === "files" ? (
                <FilesToolTab
                  currentPath={ctx.currentPath}
                  onPathChange={ctx.onPathChange}
                  onOpenFileTab={openPanelFileTab}
                  projectKey={projectKey}
                  searchQuery={filesSearchQuery}
                />
              ) : tab.kind === "git" ? (
                <GitToolTab projectKey={projectKey} />
              ) : tab.kind === "wiki" ? (
                <WikiToolTab
                  onQueryChange={setWikiSearchQuery}
                  projectKey={projectKey}
                  query={wikiSearchQuery}
                />
              ) : (
                // file 标签 path 编码 = 「projectName/relPath」（panelFileTab 单点）——拆回
                // relPath 给预览（projectName 即本栏 projectKey）。
                (() => {
                  const { path: relPath } = splitFilePath(tab.path);
                  return <PanelFileTabBody path={relPath} projectName={projectKey} />;
                })()
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
