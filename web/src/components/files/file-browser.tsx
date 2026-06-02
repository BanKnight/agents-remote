import type { ProjectFileEntry, ProjectFilePreviewResponse } from "@agents-remote/shared";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreVertical } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  listProjectFiles,
  previewProjectFile,
  uploadFile,
  createFolder,
  renameFile,
  deleteFile,
} from "../../api/client";
import { useT } from "../../i18n";
import { useConfirm } from "../shell/confirm-dialog";
import { ActionButton, IconMarker, ListRow, shellSurfaceClasses } from "../shell/shell-primitives";
import { ShellIcon } from "../shell/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

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
        <p className={`font-semibold ${tone === "danger" ? "text-rose-100" : "text-slate-100"}`}>
          {title}
        </p>
      ) : null}
      {message ? (
        <p
          className={`mt-2 text-sm leading-6 ${tone === "danger" ? "text-rose-200/80" : tone === "warning" ? "text-amber-100" : "text-slate-400"}`}
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
        className="flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-slate-400 transition hover:bg-slate-700/50 hover:text-cyan-200"
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
            <span className="text-slate-700">/</span>
            <button
              className={`cursor-pointer rounded-md px-1 py-0.5 transition ${isLast ? "text-slate-200" : "text-slate-400 hover:bg-slate-700/50 hover:text-cyan-200"}`}
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
            <MoreVertical className="h-3.5 w-3.5 text-slate-400" />
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
                className="h-7 w-full min-w-0 rounded-lg border border-cyan-300/60 bg-slate-950/70 px-2 text-[0.82rem] font-semibold text-slate-100 font-mono focus:outline-none"
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
                isRenaming
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
              actions={isRenaming ? undefined : renderActions(entry)}
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
  isHtml: boolean;
  isMarkdown: boolean;
  fileName?: string;
  onBack: () => void;
  onRenderModeChange: (mode: "source" | "render") => void;
};

function FilePreviewPanel({
  error,
  isLoading,
  preview,
  renderMode,
  renderToggle,
  isHtml,
  isMarkdown,
  fileName,
  onBack,
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
      className="min-h-0 min-w-0 flex-1 flex flex-col bg-[#141b28]/25"
      aria-label="File preview"
    >
      <div className="relative flex min-w-0 items-center justify-between border-b border-slate-700/40 px-3.5 py-2.5">
        <button
          className="flex shrink-0 cursor-pointer items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-400 transition hover:bg-slate-700/50 hover:text-slate-200 sm:hidden"
          type="button"
          onClick={onBack}
          aria-label={t("files.backToFiles")}
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M10 3L5 8l5 5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {t("nav.back")}
        </button>
        <h4 className="absolute left-12 right-12 truncate text-center font-mono text-sm font-semibold text-slate-100 sm:static sm:flex-1 sm:text-left sm:min-w-0">
          {displayName.split("/").pop() ?? displayName}
        </h4>
        <div className="flex items-center gap-2">
          <div className="hidden sm:block">{renderToggle}</div>
          <FilePreviewMenu
            isHtml={isHtml}
            isMarkdown={isMarkdown}
            renderMode={renderMode}
            onRenderModeChange={onRenderModeChange}
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 flex flex-col overflow-y-auto">
        {isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <span className="relative flex h-3 w-3" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-300 opacity-60" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-cyan-200" />
            </span>
            <span className="text-xs font-semibold text-slate-400">
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
          <PreviewBody preview={preview} renderMode={renderMode} />
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
        active ? "bg-cyan-300/10 text-cyan-100" : "text-slate-200 hover:bg-slate-800/70"
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

type PreviewBodyProps = {
  preview: ProjectFilePreviewResponse;
  renderMode: "source" | "render";
};

function PreviewBody({ preview, renderMode }: PreviewBodyProps) {
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
          <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6 text-slate-100 [&_h1]:text-lg [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2 [&_h2]:text-base [&_h2]:font-bold [&_h2]:mt-3 [&_h2]:mb-2 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1 [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-2 [&_li]:mb-1 [&_pre]:bg-slate-900/80 [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:mb-2 [&_pre]:overflow-x-auto [&_code]:bg-slate-900/60 [&_code]:px-1 [&_code]:rounded [&_code]:text-xs [&_pre_code]:bg-transparent [&_pre_code]:px-0 [&_a]:text-cyan-400 [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-slate-600 [&_blockquote]:pl-3 [&_blockquote]:text-slate-400 [&_table]:w-full [&_table]:border-collapse [&_table]:mb-2 [&_th]:border [&_th]:border-slate-600 [&_th]:px-2 [&_th]:py-1 [&_td]:border [&_td]:border-slate-600 [&_td]:px-2 [&_td]:py-1 [&_hr]:border-slate-700 [&_hr]:my-3">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{preview.content}</ReactMarkdown>
          </div>
        );
      }
      if (inlinedHtml === null)
        return (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <span className="relative flex h-3 w-3" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-300 opacity-60" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-cyan-200" />
            </span>
            <span className="text-xs font-semibold text-slate-400">
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
      <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-xs leading-5 text-slate-100 sm:text-sm bg-[#05080d]/80">
        {preview.content}
      </pre>
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
      <p className="p-3 text-sm leading-6 text-amber-100">
        {t("files.tooLarge", { limit: formatBytes(preview.limitBytes) })}
      </p>
    );

  return <p className="p-3 text-sm leading-6 text-slate-300">{t("files.unsupported")}</p>;
}

// ── FilesPanel ────────────────────────────────────────────────────

export type FilesPanelProps = {
  initialPath: string;
  projectName: string;
  /** Show file preview panel when a file is clicked. Default true. */
  enablePreview?: boolean;
  /** Query-key segment to isolate caches between different consumers. Default "files". */
  queryScope?: string;
  onPathChange?: (path: string) => void;
  onMobilePreviewChange?: (open: boolean) => void;
};

export function FilesPanel({
  initialPath,
  projectName,
  enablePreview = true,
  queryScope = "files",
  onPathChange,
  onMobilePreviewChange,
}: FilesPanelProps) {
  const { t } = useT();
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [selectedFilePath, setSelectedFilePath] = useState<string | undefined>();

  const files = useQuery({
    queryKey: ["projects", projectName, queryScope, currentPath],
    queryFn: () => listProjectFiles(projectName, currentPath),
  });
  const preview = useQuery({
    enabled: enablePreview && selectedFilePath !== undefined,
    queryKey: ["projects", projectName, queryScope, "preview", selectedFilePath],
    queryFn: () => previewProjectFile(projectName, selectedFilePath ?? ""),
  });

  const goToPath = (path: string) => {
    setCurrentPath(path);
    setSelectedFilePath(undefined);
    onPathChange?.(path);
  };

  const selectFile = (path: string) => {
    if (!enablePreview) return;
    setSelectedFilePath(path);
    onMobilePreviewChange?.(true);
  };

  const clearPreview = () => {
    setSelectedFilePath(undefined);
    onMobilePreviewChange?.(false);
  };

  const previewData = preview.data;
  const isHtml =
    previewData?.type === "text" &&
    (previewData.name.endsWith(".html") || previewData.name.endsWith(".htm"));
  const isMarkdown = previewData?.type === "text" && previewData.name.endsWith(".md");
  const showRenderToggle = isHtml || isMarkdown;
  const [renderMode, setRenderMode] = useState<"source" | "render">("source");
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const upload = useMutation({
    mutationFn: (file: File) => uploadFile(projectName, currentPath, file),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectName, queryScope, currentPath],
      });
    },
  });

  const [folderNameInput, setFolderNameInput] = useState("");
  const [showFolderInput, setShowFolderInput] = useState(false);

  const mkdir = useMutation({
    mutationFn: (name: string) => createFolder(projectName, currentPath, name),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectName, queryScope, currentPath],
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
      queryKey: ["projects", projectName, queryScope, currentPath],
    });
  }, [queryClient, projectName, queryScope, currentPath]);

  const rename = useMutation({
    mutationFn: ({ path, name }: { path: string; name: string }) =>
      renameFile(projectName, path, name),
    onSuccess: () => invalidateFiles(),
  });

  const del = useMutation({
    mutationFn: (path: string) => deleteFile(projectName, path),
    onSuccess: () => invalidateFiles(),
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
    setRenderMode("source");
  }, [selectedFilePath]);

  const renderToggle = showRenderToggle ? (
    <div className="flex shrink-0 gap-1">
      {(["source", "render"] as const).map((mode) => (
        <button
          key={mode}
          className={`cursor-pointer rounded-full border px-2.5 py-0.5 text-[0.65rem] font-semibold transition ${
            renderMode === mode
              ? "border-cyan-300/30 bg-cyan-300/10 text-cyan-100"
              : "border-slate-700/50 bg-slate-950/50 text-slate-400 hover:text-slate-200"
          }`}
          type="button"
          onClick={() => setRenderMode(mode)}
        >
          {mode === "source" ? t("files.sourceMode") : t("files.renderMode")}
        </button>
      ))}
    </div>
  ) : null;

  const isPreviewOpen = selectedFilePath !== undefined && enablePreview;
  const browserPanel = (
    <aside
      className={`min-h-0 flex-1 sm:flex-none sm:w-[19.375rem] sm:shrink-0 sm:border-r sm:border-slate-700/60 ${isPreviewOpen ? "hidden sm:flex sm:flex-col" : "flex flex-col"}`}
    >
      <div className="flex flex-1 min-h-0 flex-col overflow-y-auto p-3">
        <FileEntryList
          entries={files.data?.entries ?? []}
          error={files.error}
          filesClickable={enablePreview}
          isLoading={files.isLoading}
          renamingName={renamingName}
          renamingPath={renamingPath}
          selectedFilePath={selectedFilePath}
          onCancelRename={() => setRenamingPath(null)}
          onDelete={handleDelete}
          onOpenDirectory={goToPath}
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
      isHtml={isHtml}
      isMarkdown={isMarkdown}
      fileName={selectedFilePath?.split("/").pop() ?? selectedFilePath}
      onBack={clearPreview}
      onRenderModeChange={setRenderMode}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col sm:overflow-hidden">
      <div
        className={`border-b border-slate-700/40 px-3.5 py-3 ${isPreviewOpen ? "hidden sm:block" : "block"}`}
      >
        <div className="flex min-w-0 items-center justify-between gap-3">
          <PathBreadcrumb path={currentPath} onNavigate={goToPath} />
          <div className="flex shrink-0 items-center gap-2">
            {upload.error instanceof Error || mkdir.error instanceof Error ? (
              <p className="text-xs text-red-300 hidden sm:block">
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
                  className="h-8 w-28 rounded-xl border border-slate-700/60 bg-slate-950/70 px-2.5 text-xs font-semibold text-slate-100 placeholder:text-slate-500 focus:border-cyan-300/40 focus:outline-none"
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
                  <span className="px-0.5 text-xs font-bold">{mkdir.isPending ? "..." : "✓"}</span>
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
        </div>
      </div>
      <div
        className={`relative flex min-h-0 flex-1 flex-col sm:flex-row ${dragOver ? "ring-2 ring-cyan-300/40" : ""}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {dragOver ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-cyan-300/8 backdrop-blur-[1px]">
            <p className="rounded-2xl bg-slate-950/90 px-5 py-3 text-sm font-semibold text-cyan-100 shadow-2xl">
              {t("files.dropZone")}
            </p>
          </div>
        ) : null}
        {upload.error instanceof Error || mkdir.error instanceof Error ? (
          <p className="text-xs text-red-300 sm:hidden px-3 pt-2">
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
            className={`flex min-h-0 min-w-0 flex-1 flex-col ${selectedFilePath === undefined ? "hidden sm:flex" : "flex"}`}
          >
            <div className="min-h-0 flex-1 flex flex-col overflow-hidden">{previewPanel}</div>
          </div>
        ) : null}
      </div>
      {confirmHolder}
    </div>
  );
}
