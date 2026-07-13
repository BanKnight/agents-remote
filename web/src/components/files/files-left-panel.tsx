import { FilesPanel } from "./file-browser";

/**
 * 项目内文件树（设计 §4.2 决策 16，middle tab [文件]）：复用 FilesPanel enablePreview=false
 * 纯树模式，点文件透出 onOpenFile 给 WorkbenchContent 开中栏 file tab。onOpenFile(projectName,
 * path) 由 FilesPanel 内部 effectiveProjectName 派生。global scope 的全局文件树走 GlobalFilesOverview
 *（Phase 4 抽出，rootBrowse 根目录列所有项目，桌面 nav=files 左栏 + 移动 /files 共用）；本组件
 * 只服务 project scope 的项目内文件树，与 GlobalFilesOverview 形成「项目文件树 / 全局文件树」对称。
 */
export function FilesLeftPanel({
  projectName,
  onOpenFile,
}: {
  projectName: string;
  onOpenFile: (projectName: string, path: string) => void;
}) {
  return (
    <FilesPanel
      initialPath=""
      projectName={projectName}
      enablePreview={false}
      onOpenFile={onOpenFile}
    />
  );
}
