import type { ProjectFileEntry, ProjectFilePreviewResponse } from "@agents-remote/shared";
import { type ReactNode, lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreVertical } from "lucide-react";
import { MarkdownString } from "../markdown/MarkdownString";
import { useT } from "../../i18n";
import {
  listProjectFiles,
  listRootFiles,
  previewProjectFile,
  saveFileContent,
  uploadFile,
  createFolder,
  renameFile,
  deleteFile,
} from "../../api/client";
import { useConfirm } from "../shell/confirm-dialog";
import { ActionButton, IconMarker, ListRow, shellSurfaceClasses } from "../shell/shell-primitives";
import { ShellIcon } from "../shell/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

// CodeMirror 体积较大，只在用户打开文本文件 source 预览时按需加载，避免进首屏 chunk。
const CodeEditor = lazy(() => import("./CodeEditor").then((m) => ({ default: m.CodeEditor })));

// ── Utilities ────────────────────────────────────────────────────

export const parentProjectPath = (path: string) => {
  if (path.length === 0) return null;
  const parts = path.split("/").filter(Boolean);
  parts.pop();
  return parts.length === 0 ? "" : parts.join("/");
};

export const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
};

// 有渲染能力的文件（markdown / html）默认展示渲染结果，其余文本默认 source。
export function defaultRenderMode(name: string): "source" | "render" {
  return name.endsWith(".md") || name.endsWith(".html") || name.endsWith(".htm")
    ? "render"
    : "source";
}

// 保存成功后 Save 按钮短暂显示 "Saved" 反馈的时长。
const SAVED_FLASH_MS = 1500;

// ── ResourceStatePanel ────────────────────────────────────────────

type ResourceStatePanelProps = {
  children?: ReactNode;
  message?: ReactNode;
  title?: ReactNode;
  tone?: "danger" | "dashed" | "inset" | "warning";
};

export function ResourceStatePanel({
  children,
  message,
  title,
  tone = "dashed",
}: ResourceStatePanelProps) {
  const isCompact = tone === "inset" || tone === "danger" || tone === "warning";
  const surfaceClass = shellSurfaceClasses[tone];
  return (
    <div
      className={`min-w-0 rounded-2xl p-4 ${isCompact ? "" : "text-center sm:p-6"} ${surfaceClass}`}
    >
      {title ? (
        <p className={`font-semibold ${tone === "danger" ? "text-error" : "text-on-surface"}`}>
          {title}
        </p>
      ) : null}
      {message ? (
        <p
          className={`mt-2 text-sm leading-6 ${tone === "danger" ? "text-error/80" : tone === "warning" ? "text-warning" : "text-on-surface-muted"}`}
        >
          {message}
        </p>
      ) : null}
      {children}
    </div>
  );
}

// ── PathBreadcrumb ────────────────────────────────────────────────

type PathBreadcrumbProps = {
  path: string;
  onNavigate: (path: string) => void;
};

export function PathBreadcrumb({ path, onNavigate }: PathBreadcrumbProps) {
  const { t } = useT();
  const segments = path.split("/").filter(Boolean);
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-0.5 text-xs font-semibold">
      <button
        className="flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-on-surface-muted transition hover:bg-neutral-line/50 hover:text-primary"
        type="button"
        onClick={() => onNavigate("")}
        aria-label={t("files.goRoot")}
      >
        <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M2 6.5L8 2l6 4.5V14a.5.5 0 01-.5.5h-3.75v-3.75h-3.5V14.5H2.5A.5.5 0 012 14V6.5z"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinejoin="round"
          />
        </svg>
        <span>{t("files.root")}</span>
      </button>
      {segments.map((segment, index) => {
        const segmentPath = segments.slice(0, index + 1).join("/");
        const isLast = index === segments.length - 1;
        return (
          <span key={segmentPath} className="flex items-center gap-0.5">
            <span className="text-on-surface-muted">/</span>
            <button
              className={`cursor-pointer rounded-md px-1 py-0.5 transition ${isLast ? "text-on-surface-soft" : "text-on-surface-muted hover:bg-neutral-line/50 hover:text-primary"}`}
              type="button"
              onClick={() => onNavigate(segmentPath)}
            >
              {segment}
            </button>
          </span>
        );
      })}
    </div>
  );
}

// ── FileEntryList ─────────────────────────────────────────────────

type FileEntryListProps = {
  entries: ProjectFileEntry[];
  error: Error | null;
  filesClickable?: boolean;
  // 根目录只读模式：隐藏 ⋯ 操作菜单与右键上下文菜单（rename/delete 入口）。
  readOnly?: boolean;
  isLoading: boolean;
  renamingName: string;
  renamingPath: string | null;
  selectedFilePath: string | undefined;
  onCancelRename: () => void;
  onDelete: (path: string) => void;
  onOpenDirectory: (path: string) => void;
  onPreviewFile: (path: string) => void;
  onRenameSubmit: (path: string, name: string) => void;
  onRenamingNameChange: (name: string) => void;
  onStartRename: (path: string, name: string) => void;
};

export function FileEntryList({
  entries,
  error,
  filesClickable = true,
  readOnly = false,
  isLoading,
  renamingName,
  renamingPath,
  selectedFilePath,
  onCancelRename,
  onDelete,
  onOpenDirectory,
  onPreviewFile,
  onRenameSubmit,
  onRenamingNameChange,
  onStartRename,
}: FileEntryListProps) {
  const { t } = useT();
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [ctxMenu, setCtxMenu] = useState<{
    name: string;
    path: string;
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    if (!renamingPath) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancelRename();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [renamingPath, onCancelRename]);

  const renderActions = useCallback(
    (entry: ProjectFileEntry) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={`inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg transition sm:opacity-0 sm:group-hover:opacity-100 ${shellSurfaceClasses.raisedHover}`}
            type="button"
            aria-label={`${entry.name} actions`}
          >
            <MoreVertical className="h-3.5 w-3.5 text-on-surface-muted" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="bottom">
          <DropdownMenuItem
            onClick={(e) => e.stopPropagation()}
            onSelect={() => onStartRename(entry.path, entry.name)}
          >
            <ShellIcon name="edit" className="h-4 w-4" />
            {t("files.rename")}
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={(e) => e.stopPropagation()}
            onSelect={() => onDelete(entry.path)}
          >
            <ShellIcon name="trash" className="h-4 w-4" />
            {t("files.delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
    [t, onDelete, onStartRename],
  );

  if (isLoading) return <ResourceStatePanel tone="inset" message={t("files.loading")} />;
  if (error)
    return (
      <ResourceStatePanel tone="danger" title={t("files.errorTitle")} message={error.message} />
    );
  if (entries.length === 0)
    return (
      <div className="flex flex-1 min-h-0 flex-col items-center justify-start pt-6 lg:justify-center lg:pt-0">
        <div className="w-full lg:w-auto">
          <ResourceStatePanel title={t("files.emptyTitle")} message={t("files.emptyDesc")} />
        </div>
      </div>
    );

  return (
    <>
      <div className="grid gap-1.5" aria-label="Project files">
        {entries.map((entry) => {
          const selected = entry.path === selectedFilePath;
          const isDirectory = entry.type === "directory";
          const clickable = isDirectory || filesClickable;
          const isRenaming = entry.path === renamingPath;

          const titleContent = isRenaming ? (
            <span className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
              <input
                ref={renameInputRef}
                className="h-7 w-full min-w-0 rounded-lg border border-primary/60 bg-surface-inset/70 px-2 text-[0.82rem] font-semibold text-on-surface font-mono focus:outline-none"
                type="text"
                value={renamingName}
                autoFocus
                onFocus={(e) => e.target.select()}
                onBlur={() => onCancelRename()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onRenameSubmit(entry.path, renamingName);
                }}
                onChange={(e) => onRenamingNameChange(e.target.value)}
              />
            </span>
          ) : (
            <span className="font-mono text-[0.82rem]">{entry.name}</span>
          );

          return (
            <ListRow
              key={`${entry.type}:${entry.path}`}
              className="group"
              marker={
                <IconMarker size="sm" tone={isDirectory ? "accent" : "muted"}>
                  <ShellIcon name={isDirectory ? "files-nav" : "file"} className="h-4 w-4" />
                </IconMarker>
              }
              selected={selected}
              subtitle={entry.hidden ? t("files.hidden") : undefined}
              title={titleContent}
              onClick={
                isRenaming
                  ? undefined
                  : clickable
                    ? () => (isDirectory ? onOpenDirectory(entry.path) : onPreviewFile(entry.path))
                    : undefined
              }
              onContextMenu={
                isRenaming || readOnly
                  ? undefined
                  : (e) => {
                      e.preventDefault();
                      setCtxMenu({
                        name: entry.name,
                        path: entry.path,
                        x: e.clientX,
                        y: e.clientY,
                      });
                    }
              }
              actions={isRenaming || readOnly ? undefined : renderActions(entry)}
            />
          );
        })}
      </div>
      {ctxMenu ? (
        <DropdownMenu
          open
          onOpenChange={(open) => {
            if (!open) setCtxMenu(null);
          }}
        >
          <DropdownMenuTrigger asChild>
            <div className="fixed size-0" style={{ left: ctxMenu.x, top: ctxMenu.y }} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="bottom">
            <DropdownMenuItem onSelect={() => onStartRename(ctxMenu.path, ctxMenu.name)}>
              <ShellIcon name="edit" className="h-4 w-4" />
              {t("files.rename")}
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={() => onDelete(ctxMenu.path)}>
              <ShellIcon name="trash" className="h-4 w-4" />
              {t("files.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </>
  );
}

// ── FilePreviewPanel ──────────────────────────────────────────────

type FilePreviewPanelProps = {
  error: Error | null;
  isLoading: boolean;
  preview: ProjectFilePreviewResponse | undefined;
  renderMode: "source" | "render";
  renderToggle: ReactNode;
  saveToggle: ReactNode;
  isHtml: boolean;
  isMarkdown: boolean;
  fileName?: string;
  editValue: string;
  onEditChange: (value: string) => void;
  onClose: () => void;
  onRenderModeChange: (mode: "source" | "render") => void;
};

function FilePreviewPanel({
  error,
  isLoading,
  preview,
  renderMode,
  renderToggle,
  saveToggle,
  isHtml,
  isMarkdown,
  fileName,
  editValue,
  onEditChange,
  onClose,
  onRenderModeChange,
}: FilePreviewPanelProps) {
  const { t } = useT();

  if (!preview && !isLoading && !error)
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <ResourceStatePanel title={t("files.selectPrompt")} message={t("files.selectDesc")} />
      </div>
    );

  const displayName = preview?.name ?? fileName ?? "";

  return (
    <section
      className="min-h-0 min-w-0 flex-1 flex flex-col bg-surface-raised/25"
      aria-label="File preview"
    >
      <div className="flex min-w-0 items-center justify-between border-b border-neutral-line/40 px-3.5 py-2.5">
        <h4 className="min-w-0 flex-1 truncate text-left font-mono text-sm font-semibold text-on-surface">
          {displayName.split("/").pop() ?? displayName}
        </h4>
        <div className="flex shrink-0 items-center gap-2">
          {saveToggle}
          <div className="hidden sm:block">{renderToggle}</div>
          <FilePreviewMenu
            isHtml={isHtml}
            isMarkdown={isMarkdown}
            renderMode={renderMode}
            onRenderModeChange={onRenderModeChange}
          />
          <button
            className="flex shrink-0 cursor-pointer items-center rounded-lg px-2 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/10 sm:hidden"
            type="button"
            onClick={onClose}
            aria-label={t("session.close")}
          >
            {t("session.close")}
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 flex flex-col overflow-y-auto">
        {isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <span className="relative flex h-3 w-3" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-primary" />
            </span>
            <span className="text-xs font-semibold text-on-surface-muted">
              {t("files.loadingPreview")}
            </span>
          </div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center p-4">
            <ResourceStatePanel
              tone="danger"
              title={t("files.previewError")}
              message={error.message}
            />
          </div>
        ) : preview ? (
          <PreviewBody
            preview={preview}
            renderMode={renderMode}
            editValue={editValue}
            onEditChange={onEditChange}
          />
        ) : null}
      </div>
    </section>
  );
}

type FilePreviewMenuProps = {
  isHtml: boolean;
  isMarkdown: boolean;
  renderMode: "source" | "render";
  onRenderModeChange: (mode: "source" | "render") => void;
};

function FilePreviewMenu({
  isHtml,
  isMarkdown,
  renderMode,
  onRenderModeChange,
}: FilePreviewMenuProps) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  if (!isHtml && !isMarkdown) return null;

  return (
    <div ref={menuRef} className="relative shrink-0 sm:hidden">
      <button
        className={`inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-xl border text-xs font-bold transition ${shellSurfaceClasses.raised} ${shellSurfaceClasses.raisedHover}`}
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t("files.fileActions")}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreVertical className="h-4 w-4" aria-hidden="true" />
      </button>
      {open ? (
        <div
          className={`absolute right-0 top-10 z-20 grid w-36 gap-1 rounded-2xl p-2 shadow-2xl shadow-black/40 ${shellSurfaceClasses.header}`}
          role="menu"
        >
          <FilePreviewMenuItem
            active={renderMode === "source"}
            onClick={() => {
              onRenderModeChange("source");
              setOpen(false);
            }}
          >
            {t("files.sourceMode")}
          </FilePreviewMenuItem>
          <FilePreviewMenuItem
            active={renderMode === "render"}
            onClick={() => {
              onRenderModeChange("render");
              setOpen(false);
            }}
          >
            {t("files.renderMode")}
          </FilePreviewMenuItem>
        </div>
      ) : null}
    </div>
  );
}

type FilePreviewMenuItemProps = {
  active?: boolean;
  children: string;
  onClick: () => void;
};

function FilePreviewMenuItem({ active = false, children, onClick }: FilePreviewMenuItemProps) {
  return (
    <button
      className={`flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold transition ${
        active ? "bg-primary/10 text-primary" : "text-on-surface-soft hover:bg-surface-raised/70"
      }`}
      type="button"
      role="menuitem"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

// ── PreviewBody ───────────────────────────────────────────────────

// CodeMirror chunk（按需加载）首次挂载前的占位，视觉与编辑器容器一致；precache 命中下瞬时。
function CodeEditorFallback() {
  const { t } = useT();
  return (
    <div className="flex flex-1 items-center justify-center rounded-lg border border-neutral-line/40 bg-surface-inset/80">
      <span className="text-xs font-semibold text-on-surface-muted">
        {t("files.loadingEditor")}
      </span>
    </div>
  );
}

type PreviewBodyProps = {
  preview: ProjectFilePreviewResponse;
  renderMode: "source" | "render";
  editValue: string;
  onEditChange: (value: string) => void;
};

function PreviewBody({ preview, renderMode, editValue, onEditChange }: PreviewBodyProps) {
  const { t } = useT();
  const [inlinedHtml, setInlinedHtml] = useState<string | null>(null);

  useEffect(() => {
    if (preview.type !== "text" || renderMode !== "render") {
      setInlinedHtml(null);
      return;
    }
    let cancelled = false;
    const dir = preview.path.includes("/")
      ? preview.path.slice(0, preview.path.lastIndexOf("/") + 1)
      : "";

    const inlineStylesheets = async () => {
      const linkRe = /<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["'][^>]*>/gi;
      const matches = [...preview.content.matchAll(linkRe)];
      const relativeLinks = matches.filter(
        ([, href]) =>
          !href.startsWith("http") && !href.startsWith("//") && !href.startsWith("data:"),
      );
      let html = preview.content;
      await Promise.all(
        relativeLinks.map(async ([fullTag, href]) => {
          const cssPath = href.startsWith("./") ? dir + href.slice(2) : dir + href;
          try {
            const res = await fetch(
              `/api/projects/${encodeURIComponent(preview.projectName)}/files/preview?path=${encodeURIComponent(cssPath)}`,
            );
            if (!res.ok) return;
            const data = (await res.json()) as { type: string; content?: string };
            if (data.type === "text" && data.content) {
              html = html.replace(fullTag, `<style>${data.content}</style>`);
            }
          } catch {
            // leave the link tag as-is if fetch fails
          }
        }),
      );
      if (!cancelled) setInlinedHtml(html);
    };

    void inlineStylesheets();
    return () => {
      cancelled = true;
    };
  }, [preview, renderMode]);

  if (preview.type === "text") {
    if (renderMode === "render") {
      if (preview.name.endsWith(".md")) {
        return (
          <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
            <MarkdownString text={preview.content} />
          </div>
        );
      }
      if (inlinedHtml === null)
        return (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <span className="relative flex h-3 w-3" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-primary" />
            </span>
            <span className="text-xs font-semibold text-on-surface-muted">
              {t("files.preparingRender")}
            </span>
          </div>
        );
      return (
        <div className="flex-1">
          <iframe
            className="w-full h-full border-0"
            sandbox="allow-scripts"
            srcDoc={inlinedHtml}
            title="Sandboxed HTML render"
          />
        </div>
      );
    }
    return (
      <div className="flex min-h-0 flex-1 flex-col p-3">
        <Suspense fallback={<CodeEditorFallback />}>
          <CodeEditor value={editValue} name={preview.name} onChange={onEditChange} />
        </Suspense>
      </div>
    );
  }

  if (preview.type === "image")
    return (
      <div className="p-3">
        <img className="mx-auto h-auto max-w-full" src={preview.dataUrl} alt={preview.name} />
      </div>
    );

  if (preview.type === "too_large")
    return (
      <p className="p-3 text-sm leading-6 text-warning">
        {t("files.tooLarge", { limit: formatBytes(preview.limitBytes) })}
      </p>
    );

  return <p className="p-3 text-sm leading-6 text-on-surface-soft">{t("files.unsupported")}</p>;
}

// ── FilesPanel ────────────────────────────────────────────────────

/**
 * rootBrowse 模式数据源解析（设计 workbench-views §4.1）。全局 files tab 根目录 = PROJECTS_ROOT：
 * - currentPath 空 → root listing（只读，列所有项目目录）。
 * - currentPath 第一段 = 项目名 → 切换为该项目的可写 files（复用 project API）。
 *
 * 单一数据管道：rootBrowse 模式按 currentPath 派生 {projectName, relativePath, isRootListing}，
 * 不为 root 维护平行渲染组件。进入项目后 selectedFilePath / entry.path 均为项目内相对路径
 *（不含项目名前缀），与 project 模式同构。
 */
export type RootBrowseTarget =
  | { kind: "root" }
  | { kind: "project"; projectName: string; relativePath: string };

export function resolveRootBrowseTarget(currentPath: string): RootBrowseTarget {
  const trimmed = currentPath.trim();
  if (trimmed.length === 0) return { kind: "root" };
  const slashIdx = trimmed.indexOf("/");
  const projectName = slashIdx === -1 ? trimmed : trimmed.slice(0, slashIdx);
  const relativePath = slashIdx === -1 ? "" : trimmed.slice(slashIdx + 1);
  return { kind: "project", projectName, relativePath };
}

/**
 * rootBrowse 项目层目录导航：把 `listProjectFiles` 返回的项目根相对 `entry.path`
 *（无 projectName 前缀）拼回完整 currentPath = "projectName/relativePath" 格式
 * （`resolveRootBrowseTarget` 的逆运算）。rootBrowse 根层（entry.path=项目名本身）
 * 与非 rootBrowse 模式（currentPath 本就是项目相对）原样返回。
 *
 * 调用方语义统一（设计 workbench-views §4.1）：`FileEntryList.onOpenDirectory` 传项目
 * 相对 entry.path，经本函数转成完整 currentPath 后再调 `goToPath`；
 * `PathBreadcrumb.onNavigate` 传的 segmentPath 已是完整格式，直接调 `goToPath`。
 * `goToPath` 单一逻辑直接 `setCurrentPath`，避免单一函数同时服务两种 path 语义
 * 导致某种来源被双前缀或丢前缀。
 */
export function joinRootBrowseDirectoryPath(
  target: RootBrowseTarget | null,
  entryPath: string,
): string {
  return target?.kind === "project" ? `${target.projectName}/${entryPath}` : entryPath;
}

export type FilesPanelProps = {
  initialPath: string;
  /** 项目作用域（非 rootBrowse 模式必填）。rootBrowse 模式按 currentPath 第一段派生。 */
  projectName?: string;
  /** Show file preview panel when a file is clicked. Default true. */
  enablePreview?: boolean;
  /** Query-key segment to isolate caches between different consumers. Default "files". */
  queryScope?: string;
  /**
   * 全局根目录浏览模式（设计 workbench-views §4.1）。true 时根目录层只读列所有项目目录，
   * 进入项目子目录后切换为该项目的可写 files（复用 project API）。默认 false（项目作用域）。
   */
  rootBrowse?: boolean;
  onPathChange?: (path: string) => void;
  onMobilePreviewChange?: (open: boolean) => void;
};

export function FilesPanel({
  initialPath,
  projectName,
  enablePreview = true,
  queryScope = "files",
  rootBrowse = false,
  onPathChange,
  onMobilePreviewChange,
}: FilesPanelProps) {
  const { t } = useT();
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [selectedFilePath, setSelectedFilePath] = useState<string | undefined>();
  // Local text edits to the file under preview. undefined = untouched (mirror preview content).
  const [editContent, setEditContent] = useState<string | undefined>();
  // Brief "Saved" feedback after a successful save; cleared on file switch.
  const [savedFlash, setSavedFlash] = useState(false);

  // rootBrowse 模式按 currentPath 派生数据源（设计 §4.1）。非 rootBrowse 模式退化为项目作用域：
  // effectiveProjectName = projectName，effectiveRelativePath = currentPath，readOnly 恒 false。
  const target = rootBrowse ? resolveRootBrowseTarget(currentPath) : null;
  const isRootListing = target?.kind === "root";
  const effectiveProjectName = target?.kind === "project" ? target.projectName : projectName;
  const effectiveRelativePath = target?.kind === "project" ? target.relativePath : currentPath;
  // 根目录层只读（用户权限边界）；进入项目子目录后可写。
  const readOnly = isRootListing;

  const files = useQuery({
    queryKey: isRootListing
      ? ["root", "files"]
      : ["projects", effectiveProjectName, queryScope, effectiveRelativePath],
    queryFn: () =>
      isRootListing
        ? listRootFiles()
        : listProjectFiles(effectiveProjectName ?? "", effectiveRelativePath),
  });
  const preview = useQuery({
    enabled: enablePreview && selectedFilePath !== undefined && effectiveProjectName !== undefined,
    queryKey: ["projects", effectiveProjectName, queryScope, "preview", selectedFilePath],
    queryFn: () => previewProjectFile(effectiveProjectName ?? "", selectedFilePath ?? ""),
  });

  const previewData = preview.data;
  const previewTextContent = previewData?.type === "text" ? previewData.content : undefined;
  // Dirty only while editing the current text preview; switching files resets editContent.
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

  const goToPath = (path: string) => {
    setCurrentPath(path);
    setSelectedFilePath(undefined);
    onPathChange?.(path);
  };

  const selectFile = (path: string) => {
    if (!enablePreview) return;
    // Guard against losing unsaved edits when jumping to another file.
    if (isDirty && selectedFilePath !== undefined && path !== selectedFilePath) {
      confirm({
        title: t("files.discard"),
        message: t("files.discardConfirm", {
          name: selectedFilePath.split("/").pop() ?? selectedFilePath,
        }),
        cancelLabel: t("cancel"),
        confirmLabel: t("files.discard"),
        tone: "default",
      }).then((ok) => {
        if (ok) {
          setSelectedFilePath(path);
          onMobilePreviewChange?.(true);
        }
      });
      return;
    }
    setSelectedFilePath(path);
    onMobilePreviewChange?.(true);
  };

  const clearPreview = () => {
    setSelectedFilePath(undefined);
    onMobilePreviewChange?.(false);
  };
  const [renderMode, setRenderMode] = useState<"source" | "render">("source");
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const upload = useMutation({
    mutationFn: (file: File) => uploadFile(effectiveProjectName ?? "", effectiveRelativePath, file),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["projects", effectiveProjectName, queryScope, effectiveRelativePath],
      });
    },
  });

  const [folderNameInput, setFolderNameInput] = useState("");
  const [showFolderInput, setShowFolderInput] = useState(false);

  const mkdir = useMutation({
    mutationFn: (name: string) =>
      createFolder(effectiveProjectName ?? "", effectiveRelativePath, name),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["projects", effectiveProjectName, queryScope, effectiveRelativePath],
      });
      setFolderNameInput("");
      setShowFolderInput(false);
    },
  });

  const handleMkdir = useCallback(() => {
    const name = folderNameInput.trim();
    if (name.length === 0 || mkdir.isPending) return;
    mkdir.mutate(name);
  }, [folderNameInput, mkdir]);

  const invalidateFiles = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ["projects", effectiveProjectName, queryScope, effectiveRelativePath],
    });
  }, [queryClient, effectiveProjectName, queryScope, effectiveRelativePath]);

  const rename = useMutation({
    mutationFn: ({ path, name }: { path: string; name: string }) =>
      renameFile(effectiveProjectName ?? "", path, name),
    onSuccess: () => invalidateFiles(),
  });

  const del = useMutation({
    mutationFn: (path: string) => deleteFile(effectiveProjectName ?? "", path),
    onSuccess: () => invalidateFiles(),
  });

  const save = useMutation({
    mutationFn: ({ path, content }: { path: string; content: string }) =>
      saveFileContent(effectiveProjectName ?? "", path, content),
    onSuccess: () => {
      // Refresh both the preview (new content/size) and the list (size/mtime).
      queryClient.invalidateQueries({
        queryKey: ["projects", effectiveProjectName, queryScope, "preview", selectedFilePath],
      });
      invalidateFiles();
      setEditContent(undefined);
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), SAVED_FLASH_MS);
    },
  });

  const { confirm, holder: confirmHolder } = useConfirm();

  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renamingName, setRenamingName] = useState("");

  const handleRenameSubmit = useCallback(
    (path: string, name: string) => {
      const trimmed = name.trim();
      if (trimmed.length === 0) return;
      rename.mutate({ path, name: trimmed });
      setRenamingPath(null);
    },
    [rename],
  );

  const startRename = useCallback((path: string, name: string) => {
    setRenamingPath(path);
    setRenamingName(name);
  }, []);

  const handleDelete = useCallback(
    (path: string) => {
      confirm({
        title: t("files.delete"),
        message: t("files.deleteConfirm", { name: path.split("/").pop() ?? path }),
        cancelLabel: t("cancel"),
        confirmLabel: t("files.delete"),
        tone: "danger",
      }).then((ok) => {
        if (ok) del.mutate(path);
      });
    },
    [confirm, del, t],
  );

  const handleSave = useCallback(() => {
    if (!isDirty || selectedFilePath === undefined || editContent === undefined) return;
    save.mutate({ path: selectedFilePath, content: editContent });
  }, [isDirty, selectedFilePath, editContent, save]);

  const handleFileDrop = useCallback(
    (file: File) => {
      if (upload.isPending) return;
      upload.mutate(file);
    },
    [upload],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFileDrop(file);
    },
    [handleFileDrop],
  );

  useEffect(() => {
    if (selectedFilePath !== undefined) {
      const name = selectedFilePath.split("/").pop() ?? "";
      setRenderMode(defaultRenderMode(name));
    }
    // Switching files (or closing the preview) drops any in-flight local edits.
    setEditContent(undefined);
    setSavedFlash(false);
  }, [selectedFilePath]);

  const renderToggle = showRenderToggle ? (
    <div className="flex shrink-0 gap-1">
      {(["source", "render"] as const).map((mode) => (
        <button
          key={mode}
          className={`cursor-pointer rounded-full border px-2.5 py-0.5 text-[0.65rem] font-semibold transition ${
            renderMode === mode
              ? "border-primary/30 bg-primary/10 text-primary"
              : "border-neutral-line/50 bg-surface-inset/50 text-on-surface-muted hover:text-on-surface-soft"
          }`}
          type="button"
          onClick={() => setRenderMode(mode)}
        >
          {mode === "source" ? t("files.sourceMode") : t("files.renderMode")}
        </button>
      ))}
    </div>
  ) : null;

  // Save only applies to editable text in source mode (markdown/html render mode is read-only).
  const canEditText =
    previewData?.type === "text" && (!showRenderToggle || renderMode === "source");

  // Ctrl/Cmd+S 在文本编辑态触发保存并拦截浏览器默认「保存网页」。用 ref 持有最新状态，
  // listener 只挂载一次，避免每次输入改动都重绑 document 监听；Mac 走 metaKey（⌘），其余走 ctrlKey。
  const saveShortcutRef = useRef({ canEditText, handleSave });
  saveShortcutRef.current = { canEditText, handleSave };
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "s") return;
      const { canEditText, handleSave } = saveShortcutRef.current;
      if (!canEditText) return;
      e.preventDefault();
      handleSave();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const saveButton = canEditText ? (
    <button
      type="button"
      disabled={!isDirty || save.isPending}
      onClick={handleSave}
      className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[0.65rem] font-semibold transition ${
        save.isPending
          ? "border-neutral-line/50 bg-surface-inset/50 text-on-surface-muted"
          : savedFlash
            ? "border-success/30 bg-success/10 text-success"
            : isDirty
              ? "cursor-pointer border-primary/30 bg-primary/10 text-primary hover:bg-primary/20"
              : "border-neutral-line/50 bg-surface-inset/50 text-on-surface-muted"
      }`}
    >
      {save.isPending ? t("files.saving") : savedFlash ? t("files.saved") : t("files.save")}
    </button>
  ) : null;

  const isPreviewOpen = selectedFilePath !== undefined && enablePreview;
  const browserPanel = (
    <aside
      className={`min-h-0 flex-1 sm:flex-none sm:w-[19.375rem] sm:shrink-0 sm:border-r sm:border-neutral-line/60 ${isPreviewOpen ? "hidden sm:flex sm:flex-col" : "flex flex-col"}`}
    >
      <div className="flex flex-1 min-h-0 flex-col overflow-y-auto p-3 max-lg:!pb-[var(--shell-mobile-bottom-nav-space,0px)]">
        <FileEntryList
          entries={files.data?.entries ?? []}
          error={files.error}
          filesClickable={enablePreview}
          readOnly={readOnly}
          isLoading={files.isLoading}
          renamingName={renamingName}
          renamingPath={renamingPath}
          selectedFilePath={selectedFilePath}
          onCancelRename={() => setRenamingPath(null)}
          onDelete={handleDelete}
          onOpenDirectory={(entryPath) => goToPath(joinRootBrowseDirectoryPath(target, entryPath))}
          onPreviewFile={selectFile}
          onRenameSubmit={handleRenameSubmit}
          onRenamingNameChange={setRenamingName}
          onStartRename={startRename}
        />
      </div>
    </aside>
  );

  const previewPanel = (
    <FilePreviewPanel
      error={preview.error}
      isLoading={preview.isLoading}
      preview={previewData}
      renderMode={showRenderToggle ? renderMode : "source"}
      renderToggle={renderToggle}
      saveToggle={saveButton}
      isHtml={isHtml}
      isMarkdown={isMarkdown}
      fileName={selectedFilePath?.split("/").pop() ?? selectedFilePath}
      editValue={editValue}
      onEditChange={setEditContent}
      onClose={clearPreview}
      onRenderModeChange={setRenderMode}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col sm:overflow-hidden">
      <div
        className={`border-b border-neutral-line/40 px-3.5 py-3 ${isPreviewOpen ? "hidden sm:block" : "block"}`}
      >
        <div className="flex min-h-7 min-w-0 items-center justify-between gap-3">
          <PathBreadcrumb path={currentPath} onNavigate={goToPath} />
          {readOnly ? null : (
            <div className="flex shrink-0 items-center gap-2">
              {upload.error instanceof Error || mkdir.error instanceof Error ? (
                <p className="text-xs text-error hidden sm:block">
                  {upload.error instanceof Error
                    ? upload.error.message
                    : mkdir.error instanceof Error
                      ? mkdir.error.message
                      : null}
                </p>
              ) : null}
              <input
                ref={fileInputRef}
                className="hidden"
                type="file"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileDrop(file);
                  e.target.value = "";
                }}
              />
              {showFolderInput ? (
                <div className="flex items-center gap-1.5">
                  <input
                    className="h-8 w-28 rounded-xl border border-neutral-line/60 bg-surface-inset/70 px-2.5 text-xs font-semibold text-on-surface placeholder:text-on-surface-muted focus:border-primary/40 focus:outline-none"
                    type="text"
                    placeholder={t("files.newFolder")}
                    value={folderNameInput}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleMkdir();
                      if (e.key === "Escape") {
                        setShowFolderInput(false);
                        setFolderNameInput("");
                      }
                    }}
                    onChange={(e) => setFolderNameInput(e.target.value)}
                  />
                  <ActionButton
                    disabled={mkdir.isPending || folderNameInput.trim().length === 0}
                    tone="accent"
                    onClick={handleMkdir}
                  >
                    <span className="px-0.5 text-xs font-bold">
                      {mkdir.isPending ? "..." : "✓"}
                    </span>
                  </ActionButton>
                </div>
              ) : (
                <ActionButton
                  title={t("files.newFolderTooltip")}
                  tone="muted"
                  onClick={() => setShowFolderInput(true)}
                >
                  <ShellIcon name="folder-plus" className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline pr-0.5">{t("files.newFolder")}</span>
                </ActionButton>
              )}
              <ActionButton
                title={t("files.uploadTooltip")}
                disabled={upload.isPending}
                tone="accent"
                onClick={() => fileInputRef.current?.click()}
              >
                <ShellIcon name="upload" className="h-3.5 w-3.5" />
                <span className="hidden sm:inline pr-0.5">
                  {upload.isPending ? t("files.uploading") : t("files.upload")}
                </span>
              </ActionButton>
            </div>
          )}
        </div>
      </div>
      <div
        className={`relative flex min-h-0 flex-1 flex-col sm:flex-row ${dragOver ? "ring-2 ring-primary/40" : ""}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {dragOver ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-primary/8 backdrop-blur-[1px]">
            <p className="rounded-2xl bg-surface-inset/90 px-5 py-3 text-sm font-semibold text-primary shadow-2xl">
              {t("files.dropZone")}
            </p>
          </div>
        ) : null}
        {upload.error instanceof Error || mkdir.error instanceof Error ? (
          <p className="text-xs text-error sm:hidden px-3 pt-2">
            {upload.error instanceof Error
              ? upload.error.message
              : mkdir.error instanceof Error
                ? mkdir.error.message
                : null}
          </p>
        ) : null}
        {browserPanel}
        {enablePreview ? (
          <div
            key={selectedFilePath !== undefined ? "preview-open" : "preview-closed"}
            className={
              selectedFilePath === undefined
                ? "hidden sm:flex sm:min-h-0 sm:min-w-0 sm:flex-1 sm:flex-col"
                : [
                    "fixed inset-0 z-50 flex flex-col bg-surface",
                    "pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]",
                    "animate-in slide-in-from-bottom-full duration-300 ease-out",
                    "sm:static sm:inset-auto sm:z-auto sm:min-h-0 sm:min-w-0 sm:flex-1 sm:flex-col sm:bg-transparent sm:pt-0 sm:pb-0 sm:animate-none",
                  ].join(" ")
            }
          >
            <div className="min-h-0 flex-1 flex flex-col overflow-hidden">{previewPanel}</div>
          </div>
        ) : null}
      </div>
      {confirmHolder}
    </div>
  );
}
