import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { previewProjectFile, saveFileContent } from "../../api/client";
import { FilePreviewPanel, FileSaveButton, resolveRootBrowseTarget } from "./file-browser";

/** file tab 预览的 query scope（与 inspection "files" 隔离，避免缓存互污，设计 §6 决策 16）。 */
const FILE_NAV_QUERY_SCOPE = "file-nav";
/** save 成功后「已保存」反馈持续时间（与 FilesPanel 同源）。 */
const SAVED_FLASH_MS = 1500;

/**
 * file tab 预览面板（设计 §6 决策 16/18 / workbench-stable-refactor Phase 3）：中栏 file tab 的
 * 可编辑预览。`path` = **全路径**（含项目名前缀如 `"demo/src/index.ts"`），内部 `resolveRootBrowseTarget`
 * 解析 projectName + 项目相对路径，走现有 project preview/save API（无需新 endpoint）。全局/项目点
 * 同一文件复用同一 tab → 同一 FileTabPreview（queryKey 按全路径天然一致）。
 *
 * 自带 preview query + editContent + save + renderMode state，复用 FilePreviewPanel（header + body
 * 框架，与 inspection 同源）+ FileSaveButton（保存按钮，DRY）。不传 onClose（file tab close 走 tab
 * ✕，非移动端浮窗关闭）。queryScope="file-nav" 与 inspection "files" 隔离（同文件两路独立 cache）。
 */
export function FileTabPreview({ path }: { path: string }) {
  const queryClient = useQueryClient();
  const target = resolveRootBrowseTarget(path);
  const projectName = target.kind === "project" ? target.projectName : path;
  const relativePath = target.kind === "project" ? target.relativePath : "";
  const preview = useQuery({
    queryKey: ["projects", projectName, FILE_NAV_QUERY_SCOPE, "preview", relativePath],
    queryFn: () => previewProjectFile(projectName, relativePath),
  });
  const previewData = preview.data;
  const previewTextContent = previewData?.type === "text" ? previewData.content : undefined;
  // Local text edits to the file under preview. undefined = untouched (mirror preview content).
  const [editContent, setEditContent] = useState<string | undefined>();
  const [savedFlash, setSavedFlash] = useState(false);
  const [renderMode, setRenderMode] = useState<"source" | "render">("source");
  const isDirty =
    editContent !== undefined &&
    previewTextContent !== undefined &&
    editContent !== previewTextContent;
  const editValue = editContent ?? previewTextContent ?? "";
  const isHtml =
    previewData?.type === "text" &&
    (previewData.name.endsWith(".html") || previewData.name.endsWith(".htm"));
  const isMarkdown = previewData?.type === "text" && previewData.name.endsWith(".md");
  const showRenderToggle = isHtml || isMarkdown;
  // Save only applies to editable text in source mode（render 模式只读，同 FilesPanel）。
  const canEditText =
    previewData?.type === "text" && (!showRenderToggle || renderMode === "source");

  const save = useMutation({
    mutationFn: ({ content }: { content: string }) =>
      saveFileContent(projectName, relativePath, content),
    onSuccess: () => {
      // Refresh preview（new content/size）；file tab 无文件树列表，不 invalidate files query。
      queryClient.invalidateQueries({
        queryKey: ["projects", projectName, FILE_NAV_QUERY_SCOPE, "preview", relativePath],
      });
      setEditContent(undefined);
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), SAVED_FLASH_MS);
    },
  });
  const handleSave = () => {
    if (!isDirty || editContent === undefined) return;
    save.mutate({ content: editContent });
  };

  const saveToggle = canEditText ? (
    <FileSaveButton
      isDirty={isDirty}
      isPending={save.isPending}
      savedFlash={savedFlash}
      onSave={handleSave}
    />
  ) : null;

  return (
    <FilePreviewPanel
      error={preview.error}
      isLoading={preview.isLoading}
      preview={previewData}
      renderMode={showRenderToggle ? renderMode : "source"}
      saveToggle={saveToggle}
      isHtml={isHtml}
      isMarkdown={isMarkdown}
      fileName={path.split("/").pop() ?? path}
      editValue={editValue}
      onEditChange={setEditContent}
      onRenderModeChange={setRenderMode}
    />
  );
}
