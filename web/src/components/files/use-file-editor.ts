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

// 有渲染能力的文件（markdown / html）默认展示渲染结果，其余文本默认 source。
//（2026-09-30 自 file-browser.tsx 下沉：renderMode 重置收敛进 hook 单源后，判定逻辑同属
// 渲染管道，留在本文件；file-browser 消费点已随重置下沉一并退役。）
export function defaultRenderMode(name: string): "source" | "render" {
  return name.endsWith(".md") || name.endsWith(".html") || name.endsWith(".htm")
    ? "render"
    : "source";
}

// Query result 类型收缩（不导出 TanStack 内部类型名，泛型即所得）。
type PreviewQuery = ReturnType<typeof useQuery<ProjectFilePreviewResponse, Error>>;

/**
 * 文件预览 query key 单源（useFileEditor 与容器层 nav 动作装配共用——React Query dedupe
 * 同 key 零额外网络，⋯ 菜单因此可以挂在容器层）。
 */
export function filePreviewQueryKey(projectName: string, queryScope: string, path: string) {
  return ["projects", projectName, queryScope, "preview", path] as const;
}

/**
 * 文件预览数据（v1.5 批3 容器层消费：nav ⋯ 的菜单项条件与复制内容数据源）。
 * 与 useFileEditor 同 key 共享缓存（staleTime 0，挂载即拉最新——与编辑链对齐）。
 */
export function useFilePreview(projectName: string, path: string | null, queryScope: string) {
  return useQuery({
    enabled: path !== null && path !== "",
    queryKey: filePreviewQueryKey(projectName, queryScope, path ?? ""),
    queryFn: () => previewProjectFile(projectName, path ?? ""),
    staleTime: 0,
  });
}

export type FileEditor = {
  preview: PreviewQuery;
  previewData: ProjectFilePreviewResponse | undefined;
  /** 编辑态是否偏离服务端内容（仅 text + 已改动）。 */
  isDirty: boolean;
  /** CodeEditor 受控值 = 本地编辑 ?? 服务端内容。 */
  editValue: string;
  /** 传 undefined = 清草稿（v1.5 批3「放弃」直接丢弃编辑，不经换文件路径）。 */
  onEditChange: (value: string | undefined) => void;
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
  path,
  projectName,
  queryScope,
}: {
  editable: boolean;
  path: string | null;
  projectName: string;
  queryScope: string;
}): FileEditor {
  const queryClient = useQueryClient();
  // undefined = 未动过（镜像 preview 内容）；换文件即弃（下方 effect）。
  const [editContent, setEditContent] = useState<string | undefined>();
  // 保存成功后短暂「已保存」反馈；换文件即清。
  const [savedFlash, setSavedFlash] = useState(false);
  // basename 从 path 立即可得（不等 preview 返回）——否则换文件首帧沿用上一文件的判定。
  const fileBaseName = path === null ? "" : (path.split("/").pop() ?? "");
  // md/html 默认渲染预览（github 风格）、其余文本 source；renderMode 是 per-file 视图态，
  // 换文件随下方 effect 重置回默认。原 FilesPanel/FileTabPreview 各自的 useState 收拢于此。
  const [renderMode, setRenderMode] = useState<"source" | "render">(() =>
    defaultRenderMode(fileBaseName),
  );

  const preview = useQuery({
    enabled: path !== null,
    queryKey: filePreviewQueryKey(projectName, queryScope, path ?? ""),
    queryFn: () => previewProjectFile(projectName, path ?? ""),
    // 文件预览是易变的服务端状态（agent/外部改动）：不缓存，切回/重选即拉最新；
    // 配合手动 refresh（invalidate）兜底常驻态。
    staleTime: 0,
  });

  // Switching files (or closing the preview) drops any in-flight local edits and resets the
  // render mode（per-file 视图态随文件回默认；2026-09-30 前由 FilesPanel 调用方补丁承担，
  // MobileL3FilePreview 漏配致单实例复用换文件时残留——收敛进 hook 单源两端同效）。
  useEffect(() => {
    setEditContent(undefined);
    setSavedFlash(false);
    setRenderMode(defaultRenderMode(fileBaseName));
    // fileBaseName 是 path 的纯派生（渲染期立即可得），列 path 即覆盖换文件时机。
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            queryKey: filePreviewQueryKey(projectName, queryScope, p),
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
      queryKey: filePreviewQueryKey(projectName, queryScope, path),
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
