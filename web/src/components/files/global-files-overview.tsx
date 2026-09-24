import { useEffect, useMemo, useRef, useState } from "react";
import { useAtom, useAtomValue } from "jotai";

import { useIsMobile } from "../../lib/use-is-mobile";
import { useT } from "../../i18n";
import { ShellIcon } from "../shell/icons";
import {
  workbenchFilesSearchFocusRequestAtom,
  workbenchLastProjectAtom,
} from "../../routes/workbench-model";
import { useGlobalInstanceCandidates } from "../workbench/instance-area";
import { relativeTime } from "../workbench/history-list";
import { FilesPanel } from "./file-browser";
import { type CardDragStartHandler } from "../workbench/drag-source";

/**
 * 全局文件总览共享主体（设计 workbench-stable-refactor Phase 4）。桌面活动栏 [文件] → /files 左栏 +
 * 移动 /files 一级页共用，结束「两端各自改各自」双写（参照 GlobalProjectsOverview 范式）。
 *
 * 主体 = `<FilesPanel rootBrowse enablePreview={false}/>`（根目录列所有项目，进入项目子目录切可写
 * files，复用 resolveRootBrowseTarget 派生 projectName）。外壳（标题、底部 nav）由调用方提供：
 * 桌面 WorkbenchShell leftPanelTitle；移动 MobilePageHeader。
 *
 * 点文件透出 `onOpenFile(projectName, path)`（FilesPanel 内部 effectiveProjectName 派生）→ 调用方开
 * file tab（桌面中栏 / 移动浮窗 /files/file/$，Phase 3 全路径 tabId 去重）。
 *
 * M10 用户反馈⑥：移动端对齐 10-tab-files-global——根层 FilesPanel 走 globalCard 卡形态（项目行 =
 * 徽章 + 统计副行 + live 尾标；散文件行 = mono 名 + tm），统计从 overview candidates 按项目聚合
 * （与项目 Tab 同 query key，dedupe 零额外网络）；子目录层与桌面保持 ListRow 通用行（10-tab 卡形态
 * 只描述根层总览；桌面原型 10-mac 是另一形态）。
 */
export function GlobalFilesOverview({
  currentPath,
  onPathChange,
  onOpenFile,
  onCardDragStart,
  variant = "panel",
}: {
  /** 受控 cwd（调用方持久化记忆；未传退 FilesPanel 内部 state，桌面保持现状）。路径不存在回退由 FilesPanel 侧查 files.error 处理。 */
  currentPath?: string;
  onPathChange?: (path: string) => void;
  onOpenFile: (projectName: string, path: string) => void;
  /** 拖动源启动（文件行拖到中栏开 tab，透传 FilesPanel → FileEntryList）。undefined 退纯点击（移动）。 */
  onCardDragStart?: CardDragStartHandler;
  /**
   * 页面形态（§6.12j 批次 4，10m）：page = 桌面 main 整页（作用域 seg4 + ⌘F 角标 + 根层
   * 分组卡）；panel = 左栏粘性文件语境（默认，通用树形态）。移动（useIsMobile）不传 variant，
   * 根层卡形态照旧走 isMobile 分支（10-tab）。
   */
  variant?: "page" | "panel";
}) {
  const { t } = useT();
  const isMobile = useIsMobile();
  const pageMode = variant === "page";
  // 10m 作用域（pin①）：「全局」= 服务器根目录；「本项目」= 全局记忆的当前项目（与工作台/
  // 插件页同源 workbenchLastProjectAtom）——页内切 rootBrowse cwd（currentPath = 项目名）。
  const [lastProject] = useAtom(workbenchLastProjectAtom);
  // 卡形态统计源：与项目 Tab 同 ["overview"] query（dedupe 零额外网络；10s refetchInterval 同步受益）。
  const { candidates } = useGlobalInstanceCandidates({ kind: "global" });
  const [filter, setFilter] = useState("");
  // ⌘F（spec §10.2，10m pin④）聚焦搜索框：计数器信号递增即 focus（桌面 main 整页态由
  // use-workbench-shortcuts gate 后 bump；移动/其他入口不 bump）。
  const searchFocusRequest = useAtomValue(workbenchFilesSearchFocusRequestAtom);
  const searchInputRef = useRef<HTMLInputElement>(null);
  // 仅响应递增沿：atom 是全局持久值，切走再切回（remount）时 effect 重放旧值，
  // `> 0` 判定会非预期自动聚焦（code/perf review 2026-09-22）——记录已消费值，只 focus 递增。
  const lastFocusRequest = useRef(0);
  useEffect(() => {
    if (searchFocusRequest > lastFocusRequest.current) {
      lastFocusRequest.current = searchFocusRequest;
      searchInputRef.current?.focus();
    }
  }, [searchFocusRequest]);

  // 10-tab 卡形态的项目统计（移动一级页 / 桌面 mainPage 10m）：instances/running + 最近活动
  // label（按项目聚合）；左栏 panel 态保持通用 ListRow 树（250px 窄栏塞卡态过挤）。
  const globalOverview = useMemo(() => {
    return isMobile || pageMode ? buildGlobalOverview(candidates, t) : undefined;
  }, [isMobile, pageMode, candidates, t]);

  const inProject = (currentPath ?? "") !== "";
  const scopeSeg =
    variant === "page" ? (
      // 10m mhead seg4（原型 :63，width:280px；此处满宽由 seg4 类 margin + 外层收口）：
      // 全局 / 本项目 · <名>。span 键盘可达（Enter/Space），与右栏 Inspector seg4 同构。
      <div className="shrink-0 px-3.5">
        <div aria-label={t("plugins.scopeAria")} className="seg4" role="tablist">
          <span
            aria-selected={!inProject}
            className={`cursor-pointer ${!inProject ? "on" : ""}`}
            key="global"
            onClick={() => onPathChange?.("")}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onPathChange?.("");
              }
            }}
            role="tab"
            tabIndex={0}
          >
            {t("plugins.scopeGlobal")}
          </span>
          <span
            aria-selected={inProject}
            className={`cursor-pointer ${inProject ? "on" : ""}`}
            key="project"
            onClick={() => {
              if (lastProject) onPathChange?.(lastProject);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                if (lastProject) onPathChange?.(lastProject);
              }
            }}
            role="tab"
            tabIndex={0}
          >
            {lastProject
              ? t("plugins.scopeProject", { name: lastProject })
              : t("plugins.scopeProjectEmpty")}
          </span>
        </div>
      </div>
    ) : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {scopeSeg}
      {/* 搜索框 = 10m 原型 .search 语义：.psearch 单源（09m/10m 移动 + 09-mac/10-mac 桌面
         规格，与插件页同一搜索框）。mx-4 补 16px 与 gfcard margin 同值——搜索框左缘对齐
         seg4/卡片 28px 内容线（FilesPanel px-3 + margin 16；第十一轮复验：原 12px 离群）。 */}
      <div className="shrink-0 px-3 pt-3">
        <div className="psearch mx-4 w-full">
          <ShellIcon aria-hidden="true" name="magnifyingglass" />
          <input
            aria-label={t("files.searchPlaceholder")}
            className="min-w-0 flex-1 cursor-text border-none bg-transparent text-ink-1 outline-none"
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("files.searchPlaceholder")}
            ref={searchInputRef}
            type="text"
            value={filter}
          />
          {pageMode ? (
            <span aria-hidden="true" className="flex-none text-[11px] text-ink-3">
              ⌘F
            </span>
          ) : null}
        </div>
      </div>
      <FilesPanel
        filter={filter}
        initialPath=""
        currentPath={currentPath}
        onPathChange={onPathChange}
        enablePreview={false}
        onOpenFile={onOpenFile}
        onCardDragStart={onCardDragStart}
        rootBrowse
        // 卡形态仅根层（10-tab 原型描述的就是根层总览）：子目录层不传 → FilesPanel 退 ListRow
        //（行内 rename input 所在路径；卡分支无编辑 UI，code review 2026-09-22 修 rename 回归）。
        globalCard={
          globalOverview && (currentPath ?? "") === "" ? { overview: globalOverview } : undefined
        }
      />
    </div>
  );
}

/** 10-tab 项目统计聚合：instances/running 计数 + 最新活动相对时间 label（副行/live 数据源）。 */
function buildGlobalOverview(
  candidates: ReturnType<typeof useGlobalInstanceCandidates>["candidates"],
  t: ReturnType<typeof useT>["t"],
): Record<string, { instances: number; running: number; latestLabel: string }> {
  const stats = new Map<string, { instances: number; running: number; latestAt: string }>();
  for (const c of candidates) {
    const name = c.ref.projectName;
    const stat = stats.get(name) ?? { instances: 0, running: 0, latestAt: "" };
    stat.instances += 1;
    if (c.status === "running") stat.running += 1;
    const at = c.updatedAt ?? c.createdAt ?? "";
    if (at > stat.latestAt) stat.latestAt = at;
    stats.set(name, stat);
  }
  return Object.fromEntries(
    [...stats].map(([name, s]) => [
      name,
      {
        instances: s.instances,
        running: s.running,
        latestLabel: s.latestAt ? relativeTime(s.latestAt, t) : "",
      },
    ]),
  );
}
