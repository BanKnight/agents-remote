import { FilesPanel } from "./file-browser";
import type { WorkbenchScope } from "../../routes/workbench-model";

/**
 * 左栏文件树（设计 §4.2 决策 16，nav=[文件]）：复用 FilesPanel enablePreview=false 纯树模式，
 * 点文件透出 onOpenFile 给 WorkbenchContent 开中栏 file tab。global scope 用 rootBrowse（根目录
 * 列所有项目，进入项目子目录切可写 files，复用 resolveRootBrowseTarget）；project scope 用项目
 * 作用域。onOpenFile(projectName, path) 由 FilesPanel 内部 effectiveProjectName 派生，本组件
 * 两种 scope 统一透传，无需自解析 project。
 */
export function FilesLeftPanel({
  scope,
  onOpenFile,
}: {
  scope: WorkbenchScope;
  onOpenFile: (projectName: string, path: string) => void;
}) {
  if (scope.kind === "global") {
    return <FilesPanel initialPath="" rootBrowse enablePreview={false} onOpenFile={onOpenFile} />;
  }
  return (
    <FilesPanel
      initialPath=""
      projectName={scope.key}
      enablePreview={false}
      onOpenFile={onOpenFile}
    />
  );
}
