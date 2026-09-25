// file tab 预览面板（v2 §6.10-8 桌面预览只读化，双端一致：file tab 预览去编辑入口——
// 03q 铁律 7「内容编辑器不存在」；saveFileContent API 保留，仅 UI 入口移除）。`path` =
// **全路径**（含项目名前缀如 `"demo/src/index.ts"`），内部 `resolveRootBrowseTarget` 解析
// projectName + 项目相对路径，走现有 project preview API（无需新 endpoint）。全局/项目点
// 同一文件复用同一 tab → 同一 FileTabPreview（queryKey 按全路径天然一致）。
//
// 编辑链（preview query + renderMode）走 useFileEditor 单源（editable=false：只读语境，
// ⌘S/canEdit 恒 false），复用 FilePreviewPanel（header + body 框架，与 inspection 同源）。
// 不传 onEditChange → PreviewBody 以只读 CodeEditor 渲 source 模式；saveToggle={null} →
// header 无保存按钮。不传 onClose（file tab close 走 tab ✕，非移动端浮窗关闭）。
// queryScope="file-nav" 与 inspection "files" 隔离（同文件两路独立 cache）。
import { FilePreviewPanel, resolveRootBrowseTarget } from "./file-browser";
import { useFileEditor } from "./use-file-editor";

/** file tab 预览的 query scope（与 inspection "files" 隔离，避免缓存互污，设计 §6 决策 16）。 */
const FILE_NAV_QUERY_SCOPE = "file-nav";

export function FileTabPreview({ path }: { path: string }) {
  const target = resolveRootBrowseTarget(path);
  const projectName = target.kind === "project" ? target.projectName : path;
  const relativePath = target.kind === "project" ? target.relativePath : "";
  const editor = useFileEditor({
    editable: false,
    path: relativePath,
    projectName,
    queryScope: FILE_NAV_QUERY_SCOPE,
  });

  return (
    <FilePreviewPanel
      error={editor.preview.error}
      isLoading={editor.preview.isLoading}
      preview={editor.previewData}
      renderMode={editor.showRenderToggle ? editor.renderMode : "source"}
      saveToggle={null}
      isHtml={editor.isHtml}
      isMarkdown={editor.isMarkdown}
      fileName={path.split("/").pop() ?? path}
      editValue={editor.editValue}
      onRefresh={editor.refresh}
      isRefreshing={editor.isRefreshing}
      onRenderModeChange={editor.onRenderModeChange}
    />
  );
}
