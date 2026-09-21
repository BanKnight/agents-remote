import { useEffect, useRef, useState } from "react";
import { useAtomValue } from "jotai";

import { useT } from "../../i18n";
import { ShellIcon } from "../shell/icons";
import { workbenchFilesSearchFocusRequestAtom } from "../../routes/workbench-model";
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
 */
export function GlobalFilesOverview({
  currentPath,
  onPathChange,
  onOpenFile,
  onCardDragStart,
}: {
  /** 受控 cwd（调用方持久化记忆；未传退 FilesPanel 内部 state，桌面保持现状）。路径不存在回退由 FilesPanel 侧查 files.error 处理。 */
  currentPath?: string;
  onPathChange?: (path: string) => void;
  onOpenFile: (projectName: string, path: string) => void;
  /** 拖动源启动（文件行拖到中栏开 tab，透传 FilesPanel → FileEntryList）。undefined 退纯点击（移动）。 */
  onCardDragStart?: CardDragStartHandler;
}) {
  const { t } = useT();
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

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 搜索框 = 10m 原型 .search 语义；实现复用 .wsearch 单源（03x/03p files/wiki 已共用，
         原型 34px vs 单源 30px 属单源收敛取舍，记 §6.10 批次 d 补记）。 */}
      <div className="shrink-0 px-3 pt-3">
        <div className="wsearch w-full">
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
      />
    </div>
  );
}
