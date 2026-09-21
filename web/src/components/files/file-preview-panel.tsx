import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { previewProjectFile } from "../../api/client";
import { FilePreviewPanel, resolveRootBrowseTarget } from "./file-browser";

/** file tab 预览的 query scope（与 inspection "files" 隔离，避免缓存互污，设计 §6 决策 16）。 */
const FILE_NAV_QUERY_SCOPE = "file-nav";

/**
 * file tab 预览面板（v2 §6.10-8 桌面预览只读化，**双端一致**：file tab 预览去编辑入口——
 * 03q 铁律 7「内容编辑器不存在」；saveFileContent API 保留，仅 UI 入口移除）。`path` =
 * **全路径**（含项目名前缀如 `"demo/src/index.ts"`），内部 `resolveRootBrowseTarget` 解析
 * projectName + 项目相对路径，走现有 project preview API（无需新 endpoint）。全局/项目点
 * 同一文件复用同一 tab → 同一 FileTabPreview（queryKey 按全路径天然一致）。
 *
 * 自带 preview query + renderMode state，复用 FilePreviewPanel（header + body 框架，与
 * inspection 同源）。不传 onEditChange → PreviewBody 以只读 CodeEditor 渲 source 模式；
 * saveToggle={null} → header 无保存按钮。不传 onClose（file tab close 走 tab ✕，非移动端
 * 浮窗关闭）。queryScope="file-nav" 与 inspection "files" 隔离（同文件两路独立 cache）。
 */
export function FileTabPreview({ path }: { path: string }) {
  const queryClient = useQueryClient();
  const target = resolveRootBrowseTarget(path);
  const projectName = target.kind === "project" ? target.projectName : path;
  const relativePath = target.kind === "project" ? target.relativePath : "";
  const preview = useQuery({
    queryKey: ["projects", projectName, FILE_NAV_QUERY_SCOPE, "preview", relativePath],
    queryFn: () => previewProjectFile(projectName, relativePath),
    // 文件预览是易变的服务端状态（agent/外部改动）：不缓存，切回 file tab 即拉最新；
    // 配合 FilePreviewPanel 手动 refresh 按钮（onRefresh invalidate）兜底常驻态。
    staleTime: 0,
  });
  const previewData = preview.data;
  const previewTextContent = previewData?.type === "text" ? previewData.content : undefined;
  // md/html 默认渲染预览（打开即看预览，github 风格）；非 md/html 被 showRenderToggle gate
  // 强制 source（下方 renderMode={showRenderToggle ? renderMode : "source"}），不受此初值影响。
  const [renderMode, setRenderMode] = useState<"source" | "render">("render");
  const isHtml =
    previewData?.type === "text" &&
    (previewData.name.endsWith(".html") || previewData.name.endsWith(".htm"));
  const isMarkdown = previewData?.type === "text" && previewData.name.endsWith(".md");
  const showRenderToggle = isHtml || isMarkdown;

  return (
    <FilePreviewPanel
      error={preview.error}
      isLoading={preview.isLoading}
      preview={previewData}
      renderMode={showRenderToggle ? renderMode : "source"}
      saveToggle={null}
      isHtml={isHtml}
      isMarkdown={isMarkdown}
      fileName={path.split("/").pop() ?? path}
      editValue={previewTextContent ?? ""}
      onRefresh={() =>
        queryClient.invalidateQueries({
          queryKey: ["projects", projectName, FILE_NAV_QUERY_SCOPE, "preview", relativePath],
        })
      }
      isRefreshing={preview.isFetching}
      onRenderModeChange={setRenderMode}
    />
  );
}
