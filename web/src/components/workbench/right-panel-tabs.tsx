import { useAtom } from "jotai";
import { useT } from "../../i18n";
import { workbenchDesktopFilesPathAtom } from "../../routes/workbench-model";
import { AddMenu } from "../files/add-menu";
import { useDirectoryAddActions } from "../files/use-directory-add-actions";
import { FilesToolTab, GitToolTab, WikiToolTab } from "./workbench-tab-plugin";
import { PanelTabBar } from "./inspection-panel";
import { usePanelTabRegistry } from "./use-panel-tab-registry";
import { usePanelToolChip } from "./project-tool-panels";
import { cn } from "@/lib/utils";
import type { WorkbenchTabPluginContext } from "./workbench-tab-plugin";

/** 检视标头单源（glabel2「检视」+ 行内 clps「»」折叠钮；空态与主视图两分支同消费——批 C
 *  收敛此前逐字双份）。 */
function InspectorHeading({ onCollapse }: { onCollapse: () => void }) {
  const { t } = useT();
  return (
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
  );
}

/**
 * 桌面右栏检视面板容器（v1.4 05:99 ptabs 动态标签，redesign-v2 §6.13 批3）：与移动全屏面板
 * 消费**同一** panelTabs/panelActive atom（per-projectKey，多端同构——标签集/激活项跨端一致），
 * 标签条 = PanelTabBar 单源（seg4 退役）；「检视 · 只读」头保持。
 *
 * **叠层保活**（批2 移动同范式，frontend-notes §3）：panelTabs 全渲染，非激活 invisible
 *（visibility 保布局保滚动位），absolute inset-0 叠层；切标签不卸载不重挂，cwd/滚动位/详情栈
 * 状态跨切换保持。
 *
 * **v1.5 批 4 两端分化**（spec §4.5 预览矩阵）：桌面只渲染三结构标签（files/git/wiki）——
 * file/wikiread 标签退役出检视器（文件预览 → 中栏 tabstrip 文件标签、wiki 阅读 → 中栏
 * wikiread tab，onOpenFile/onOpenWiki 通路）；共享 atom 不动（移动保留 file/wikiread 标签，
 * 同一数据不同容器投影，多端同构）。激活项指向被投影隐藏的标签时回退 files。
 *
 * 面板开合真相 = workbenchPanelOpenAtom（WorkbenchContent 融合右栏折叠，WorkbenchShell
 * 受控化）；本组件恒在面板 open 时渲染，不持开合 state。
 */
export function RightPanelTabs({
  ctx,
  onCollapse,
  onOpenFile,
  onOpenWiki,
}: {
  ctx: WorkbenchTabPluginContext;
  /** glabel2 行内 clps「»」收起右栏（05:103 原型折叠语义；装配点传 closeDesktopPanel）。 */
  onCollapse: () => void;
  /** 树点文件 → 中栏 file tab（WorkbenchRoute.onOpenFile）。 */
  onOpenFile: (projectName: string, path: string) => void;
  /** wiki 页行点入 → 中栏 wikiread tab（WorkbenchRoute.onOpenWiki）。 */
  onOpenWiki: (slug: string) => void;
}) {
  const { t } = useT();
  const projectKey = ctx.projectKey;
  // 标签注册表 = usePanelTabRegistry 双端单源（全局同构 review 批：此前本地手写 CRUD 与移动
  // MobileProjectWorkbench 逐字同构）。
  const {
    panelTabs,
    activePanelTabId: activePanelTabIdRaw,
    activatePanelTab,
    newPanelTab,
    closePanelTab,
  } = usePanelTabRegistry(projectKey);
  // 桌面投影 = 三结构标签（files/git/wiki）；file/wikiread 留在存储（移动仍消费）不渲染。
  const inspectorTabs = panelTabs.filter(
    (t0) => t0.kind === "files" || t0.kind === "git" || t0.kind === "wiki",
  );
  // 激活项指向被投影隐藏的标签（file/wikiread）→ 回退 files（body 全 invisible 死屏防线）。
  const activePanelTabId = inspectorTabs.some((t0) => t0.id === activePanelTabIdRaw)
    ? activePanelTabIdRaw
    : "files";
  // 批 11 反馈①：cwd 单一来源 = per-project 持久 atom。此前读 ctx.currentPath——右栏 ctx
  // 只带 projectKey（WorkbenchRoute rightCtx），恒 undefined → ""，AddMenu 上传/新建恒落
  // 项目根（用户真机报障）。受控化后 FilesToolTab / toolChip crumb / AddMenu 三处同源。
  const [filesPathMap, setFilesPathMap] = useAtom(workbenchDesktopFilesPathAtom);
  const cwd = filesPathMap[projectKey ?? ""] ?? "";
  // 幂等守卫（值未变返回旧引用，与 activatePanelTab 同款）防高频路径无谓渲染。
  // projectKey 前置守卫与下方空态早退同判——null 时写 `[projectKey as string]` 会落
  // "undefined" 键而读恒 ""，值静默丢失（code-review 批 11）。
  const changeFilesPath = (path: string) => {
    if (!projectKey) return;
    setFilesPathMap((prev) => {
      const cur = prev[projectKey] ?? "";
      return cur === path ? prev : { ...prev, [projectKey]: path };
    });
  };
  // 工具 chip 槽装配单源（usePanelToolChip，与移动 InspectionPanel 同一份——多端同构；
  // 搜索 query 提升透传 Tab 三件套，chip 与列表同 state）。批 4 桌面投影无 wikiread
  //（原 wikiread 无 chip 槽的三元随投影删除）。
  const activeKind = inspectorTabs.find((t0) => t0.id === activePanelTabId)?.kind ?? "files";
  const { filesSearchQuery, setWikiSearchQuery, toolChip, wikiSearchQuery } = usePanelToolChip({
    currentPath: cwd,
    kind: activeKind,
    onPathChange: changeFilesPath,
    projectKey: projectKey ?? "",
  });
  // 05e:54 搜索行右端「＋」（第二批缺口补齐：桌面 .links 行 lg:hidden 后新建/上传入口断）——
  // 新建/上传装配 = useDirectoryAddActions 双端单源（全局同构 review 批：与移动面板 FAB /
  // mainPage / 全局文件页同一份；siblingNames 内置同 key files query，重名校验生效）。目标
  // 目录 = cwd（上方 atom 单源），FAB trigger 形态留本容器。
  const { addProps, newItemSheet, uploadInput } = useDirectoryAddActions({
    dir: cwd,
    projectName: projectKey ?? "",
  });

  if (!projectKey) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {/* 空态同样暴露折叠入口（PanelHeader 退役后 clps 是唯一收起钮）。 */}
        <InspectorHeading onCollapse={onCollapse} />
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
      <InspectorHeading onCollapse={onCollapse} />
      <PanelTabBar
        activeTabId={activePanelTabId}
        onActivateTab={activatePanelTab}
        onCloseTab={closePanelTab}
        onNewTab={newPanelTab}
        tabs={inspectorTabs}
      />
      {/* 工具 chip 槽（03o crumb+搜索 / 03m gitchip / 03p wsearch；与移动 InspectionPanel
          同款槽结构 mx-4 mt-2.5 gap-2——装配单源 usePanelToolChip，右栏不再裸奔「..」行
          （真机反馈 2026-09-29 Files 标签缺顶部工具行 / Wiki 缺搜索入口）。批 13 反馈②：
          行尾「＋」退役，新建/上传入口统一 FAB（tabpanel 容器内，下方）。 */}
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
        {inspectorTabs.map((tab) => {
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
                  currentPath={cwd}
                  onPathChange={changeFilesPath}
                  onOpenFile={onOpenFile}
                  projectKey={projectKey}
                  searchQuery={filesSearchQuery}
                />
              ) : tab.kind === "git" ? (
                <GitToolTab projectKey={projectKey} />
              ) : tab.kind === "wiki" ? (
                <WikiToolTab
                  onOpenPage={onOpenWiki}
                  onQueryChange={setWikiSearchQuery}
                  projectKey={projectKey}
                  query={wikiSearchQuery}
                />
              ) : null}
            </div>
          );
        })}
        {/* 批 13 反馈②：新建/上传入口统一 FAB（与移动检视面板 renderPanelFab 同构，
            多端同构原则）。放 tab body 之后渲染保证 z 序；activeKind 守卫 = 仅 files 标签
            提供（git/wiki 无新建语义）。AddMenu 单源（03oa 两项）+ 目标目录 = cwd atom 单源。 */}
        {activeKind === "files" ? (
          <AddMenu
            onNew={addProps.onNew}
            onUpload={addProps.onUpload}
            trigger={
              <button aria-label={t("files.add")} className="fab cursor-pointer" type="button">
                <span className="plus" style={{ width: 20, height: 20 }} />
              </button>
            }
          />
        ) : null}
      </div>
      {/* 03y 新建 sheet + 03oa 上传 picker（useDirectoryAddActions 单源三件套，open = 内部
          state 非空持有；与移动面板 FAB / mainPage / 全局文件页同款）。 */}
      {newItemSheet}
      {uploadInput}
    </div>
  );
}
