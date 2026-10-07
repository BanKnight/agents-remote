import { useQuery } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useRef, useState } from "react";
import { listProjectFiles } from "../../api/client";
import { useT } from "../../i18n";
import {
  type PanelTab,
  ensurePanelTabOpen,
  workbenchDesktopFilesPathAtom,
  workbenchPanelActiveAtom,
  workbenchPanelTabsAtom,
  BASE_PANEL_TABS,
  withBasePanelTabs,
} from "../../routes/workbench-model";
import { AddMenu } from "../files/add-menu";
import { NewItemSheet } from "../files/new-item-sheet";
import { enqueueUploads } from "../files/upload-queue";
import { FilesToolTab, GitToolTab, WikiToolTab } from "./workbench-tab-plugin";
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
  const [panelTabsMap, setPanelTabsMap] = useAtom(workbenchPanelTabsAtom);
  const [panelActiveMap, setPanelActiveMap] = useAtom(workbenchPanelActiveAtom);
  // 右栏全 scope 渲染（2026-10-01 起；projectKey=null 的 global 空态分支见下），projectKey 理论
  // 恒非空；undefined 回退缺省标签表（与移动缺省一致 = [{files}]），null 保留 empty 态兜底。
  const panelTabs = withBasePanelTabs(
    (projectKey ? panelTabsMap[projectKey] : undefined) ?? BASE_PANEL_TABS,
  );
  // 桌面投影 = 三结构标签（files/git/wiki）；file/wikiread 留在存储（移动仍消费）不渲染。
  const inspectorTabs = panelTabs.filter(
    (t0) => t0.kind === "files" || t0.kind === "git" || t0.kind === "wiki",
  );
  const activePanelTabIdRaw = (projectKey ? panelActiveMap[projectKey] : undefined) ?? "files";
  // 激活项指向被投影隐藏的标签（file/wikiread）→ 回退 files（body 全 invisible 死屏防线）。
  const activePanelTabId = inspectorTabs.some((t0) => t0.id === activePanelTabIdRaw)
    ? activePanelTabIdRaw
    : "files";
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
  // ✕ 关标签：桌面投影仅三结构标签（不可关）；closePanelTab 保留为 PanelTabBar 契约
  //（存储中的 file 标签由移动端关闭路径管理）。
  const closePanelTab = (id: string) => {
    setPanelTabsMap((prev) => {
      if (!projectKey) return prev;
      const list = prev[projectKey] ?? [];
      return { ...prev, [projectKey]: list.filter((t0) => t0.id !== id) };
    });
    if (id === activePanelTabId) activatePanelTab("files");
  };
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
  // AddMenu 单源（03oa 两项）装配 toolChip 行尾，与移动面板 FAB 同构；目标目录 = cwd
  //（上方 atom 单源）。siblingNames 走同 key files query 共享缓存（gitDiffForChip 同
  // 范式，sheet 开启才启用，零常态网络）。
  const [newItemParentPath, setNewItemParentPath] = useState<string | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetRef = useRef("");
  const filesListing = useQuery({
    enabled: newItemParentPath !== null,
    queryFn: () => listProjectFiles(projectKey ?? "", cwd || undefined),
    queryKey: ["projects", projectKey, "files", cwd],
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
        tabs={inspectorTabs}
      />
      {/* 工具 chip 槽（03o crumb+搜索 / 03m gitchip / 03p wsearch；与移动 InspectionPanel
          同款槽结构 mx-4 mt-2.5 gap-2——装配单源 usePanelToolChip，右栏不再裸奔「..」行
          （真机反馈 2026-09-29 Files 标签缺顶部工具行 / Wiki 缺搜索入口）。 */}
      {toolChip ? (
        <div className="mx-4 mt-2.5 flex shrink-0 items-center gap-2">
          {toolChip}
          {activeKind === "files" ? (
            <AddMenu
              onNew={() => setNewItemParentPath(cwd)}
              onUpload={() => {
                uploadTargetRef.current = cwd;
                uploadInputRef.current?.click();
              }}
              trigger={
                <button
                  aria-label={t("files.add")}
                  className="cursor-pointer text-[15px] font-bold text-primary"
                  type="button"
                >
                  ＋
                </button>
              }
            />
          ) : null}
        </div>
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
      </div>
      {/* 03y 新建 sheet + 03oa 上传 picker（toolChip「＋」菜单装配；open = state 非空持有）。
          与移动面板 FAB 装配同构（mobile-workbench renderPanelFab 同款三件）。 */}
      {newItemParentPath !== null ? (
        <NewItemSheet
          onOpenChange={(next) => {
            if (!next) setNewItemParentPath(null);
          }}
          open
          parentPath={newItemParentPath}
          projectName={projectKey}
          siblingNames={
            newItemParentPath === cwd ? (filesListing.data?.entries ?? []).map((e) => e.name) : []
          }
        />
      ) : null}
      <input
        className="hidden"
        multiple
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            enqueueUploads(projectKey ?? "", uploadTargetRef.current, Array.from(e.target.files));
          }
          e.target.value = "";
        }}
        ref={uploadInputRef}
        type="file"
      />
    </div>
  );
}
