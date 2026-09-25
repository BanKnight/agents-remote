// 文件编辑链单源（批次 3 编辑能力下沉）：preview query + 本地编辑态 + 保存 mutation +
// ⌘S 快捷键 + dirty 派生。FilesPanel（inspection 编辑）与 MobileL3FilePreview（L3 详情态
// 编辑）共用编辑语义；FileTabPreview（中栏 file tab 预览）以 editable=false 复用同一
// preview/refresh/renderMode 管道。渲染形态（FilePreviewPanel header / L3 meta 行）留调用方。
import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { gitDiffListQueryKey } from "../git/git-diff-viewer";
import { previewProjectFile, saveFileContent } from "../../api/client";
import type { ProjectFilePreviewResponse } from "@agents-remote/shared";

const SAVED_FLASH_MS = 1500;

// Query result 类型收缩（不引 TanStack 内部类型名，泛型即所得）。
type PreviewQuery = ReturnType<typeof useQuery<ProjectFilePreviewResponse, Error>>;

export type FileEditor = {
  preview: PreviewQuery;
  previewData: ProjectFilePreviewResponse | undefined;
  /** 编辑态是否偏离服务端内容（仅 text + 已改动）。 */
  isDirty: boolean;
  /** CodeEditor 受控值 = 本地编辑 ?? 服务端内容。 */
  editValue: string;
  onEditChange: (value: string) => void;
  handleSave: () => void;
  isSaving: boolean;
  savedFlash: boolean;
  refresh: () => void;
  isRefreshing: boolean;
  renderMode: "source" | "render";
  onRenderModeChange: (mode: "source" | "render") => void;
  /** 保存门控真值（editable ∧ text ∧ 非 md/html render 模式）。 */
  canEdit: boolean;
  isHtml: boolean;
  isMarkdown: boolean;
  /** md/html 才有 source/render 切换（调用方据此渲染 toggle）。 */
  showRenderToggle: boolean;
};

/**
 * @param path 项目相对路径；null = 未选（preview 不拉取）。
 * @param editable 语境编辑开关：FilesPanel inspection / L3 详情态 = true；FileTabPreview
 *（中栏 file tab 预览，v2 §6.10-8 只读化拍板）= false。hook 内再与 renderMode 派生合成
 * canEdit（md/html render 模式只读）。
 */
export function useFileEditor({
  editable,
  initialRenderMode = "render",
  path,
  projectName,
  queryScope,
}: {
  editable: boolean;
  /** renderMode 初值：默认 "render"（md/html 打开即渲染，github 风格）。L3 详情态传
   * "source"——其编辑/查看形态是 CodeEditor 源码、无 render toggle，md/html 的 canEdit
   * gate（!showRenderToggle || renderMode === "source"）需要 source 才可保存。 */
  initialRenderMode?: "source" | "render";
  path: string | null;
  projectName: string;
  queryScope: string;
}): FileEditor {
  const queryClient = useQueryClient();
  // undefined = 未动过（镜像 preview 内容）；换文件即弃（下方 effect）。
  const [editContent, setEditContent] = useState<string | undefined>();
  // 保存成功后短暂「已保存」反馈；换文件即清。
  const [savedFlash, setSavedFlash] = useState(false);
  // md/html 默认渲染预览（initialRenderMode，见参数注释）；非 md/html 由 canEdit gate 强制
  // source。原 FilesPanel/FileTabPreview 各自的 useState 收拢于此。
  const [renderMode, setRenderMode] = useState<"source" | "render">(initialRenderMode);

  const preview = useQuery({
    enabled: path !== null,
    queryKey: ["projects", projectName, queryScope, "preview", path],
    queryFn: () => previewProjectFile(projectName, path ?? ""),
    // 文件预览是易变的服务端状态（agent/外部改动）：不缓存，切回/重选即拉最新；
    // 配合手动 refresh（invalidate）兜底常驻态。
    staleTime: 0,
  });

  // Switching files (or closing the preview) drops any in-flight local edits.
  useEffect(() => {
    setEditContent(undefined);
    setSavedFlash(false);
  }, [path]);

  const previewData = preview.data;
  const previewTextContent = previewData?.type === "text" ? previewData.content : undefined;
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
  // Save only applies to editable text in source mode (markdown/html render mode is read-only).
  const canEdit =
    editable && previewData?.type === "text" && (!showRenderToggle || renderMode === "source");

  const save = useMutation({
    mutationFn: ({ content, path: p }: { content: string; path: string }) =>
      saveFileContent(projectName, p, content),
    onSuccess: (_data, { content, path: p }) => {
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), SAVED_FLASH_MS);
      void (async () => {
        try {
          await queryClient.invalidateQueries({
            queryKey: ["projects", projectName, queryScope, "preview", p],
          });
        } finally {
          setEditContent((prev) => (prev === content ? undefined : prev));
        }
      })();
      // 列表/diff 失效用面板自身 queryScope 前缀（列表 key 同段）：L3 传 "files" 命中
      // FilesToolPanel 列表，根目录浏览面板（"workbench-files"）命中自身列表。
      void queryClient.invalidateQueries({ queryKey: ["projects", projectName, queryScope] });
      void queryClient.invalidateQueries({ queryKey: gitDiffListQueryKey(projectName) });
    },
  });

  const handleSave = useCallback(() => {
    if (!isDirty || !canEdit || path === null || editContent === undefined) return;
    save.mutate({ content: editContent, path });
  }, [isDirty, canEdit, path, editContent, save]);

  // Ctrl/Cmd+S 在文本编辑态触发保存并拦截浏览器默认「保存网页」。用 ref 持有最新状态，
  // listener 只在 editable 时挂载（只读消费方 FileTabPreview 不挂死 listener；editable=false
  // 的多编辑实例也不会同时响应一次 ⌘S）。Mac 走 metaKey（⌘），其余走 ctrlKey。
  const saveShortcutRef = useRef({ canEdit, handleSave });
  saveShortcutRef.current = { canEdit, handleSave };
  useEffect(() => {
    if (!editable) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "s") return;
      const { canEdit: can, handleSave: doSave } = saveShortcutRef.current;
      if (!can) return;
      e.preventDefault();
      doSave();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [editable]);

  const refresh = useCallback(() => {
    if (path === null) return;
    void queryClient.invalidateQueries({
      queryKey: ["projects", projectName, queryScope, "preview", path],
    });
  }, [queryClient, projectName, queryScope, path]);

  return {
    preview,
    previewData,
    isDirty,
    editValue,
    onEditChange: setEditContent,
    handleSave,
    isSaving: save.isPending,
    savedFlash,
    refresh,
    isRefreshing: preview.isFetching,
    renderMode,
    onRenderModeChange: setRenderMode,
    canEdit,
    isHtml,
    isMarkdown,
    showRenderToggle,
  };
}
