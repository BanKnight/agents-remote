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
  onOpenFile,
  onCardDragStart,
}: {
  onOpenFile: (projectName: string, path: string) => void;
  /** 拖动源启动（文件行拖到中栏开 tab，透传 FilesPanel → FileEntryList）。undefined 退纯点击（移动）。 */
  onCardDragStart?: CardDragStartHandler;
}) {
  return (
    <FilesPanel
      initialPath=""
      enablePreview={false}
      onOpenFile={onOpenFile}
      onCardDragStart={onCardDragStart}
      rootBrowse
    />
  );
}
