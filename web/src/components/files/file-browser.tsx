import type { ProjectFileEntry, ProjectFilePreviewResponse } from "@agents-remote/shared";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MoreVertical } from "lucide-react";
import { listProjectFiles, previewProjectFile } from "../../api/client";
import { useT } from "../../i18n";
import { IconMarker, ListRow, shellSurfaceClasses } from "../shell/shell-primitives";
import { ShellIcon } from "../shell/icons";

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
  selectedFilePath: string | undefined;
  onOpenDirectory: (path: string) => void;
  onPreviewFile: (path: string) => void;
};

export function FileEntryList({
  entries,
  error,
  filesClickable = true,
  isLoading,
  onOpenDirectory,
  onPreviewFile,
  selectedFilePath,
}: FileEntryListProps) {
  const { t } = useT();

  if (isLoading) return <ResourceStatePanel tone="inset" message={t("files.loading")} />;
  if (error)
    return (
      <ResourceStatePanel tone="danger" title={t("files.errorTitle")} message={error.message} />
    );
  if (entries.length === 0)
    return <ResourceStatePanel title={t("files.emptyTitle")} message={t("files.emptyDesc")} />;

  return (
    <div className="grid gap-1.5" aria-label="Project files">
      {entries.map((entry) => {
        const selected = entry.path === selectedFilePath;
        const isDirectory = entry.type === "directory";
        const clickable = isDirectory || filesClickable;
        return (
          <ListRow
            key={`${entry.type}:${entry.path}`}
            marker={
              <IconMarker size="sm" tone={isDirectory ? "accent" : "muted"}>
                <ShellIcon name={isDirectory ? "files-nav" : "file"} className="h-4 w-4" />
              </IconMarker>
            }
            selected={selected}
            subtitle={entry.hidden ? t("files.hidden") : undefined}
            title={<span className="font-mono text-[0.82rem]">{entry.name}</span>}
            onClick={
              clickable
                ? () => (isDirectory ? onOpenDirectory(entry.path) : onPreviewFile(entry.path))
                : undefined
            }
          />
        );
      })}
    </div>
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
  renderMode: "source" | "render";
  onRenderModeChange: (mode: "source" | "render") => void;
};

function FilePreviewMenu({ isHtml, renderMode, onRenderModeChange }: FilePreviewMenuProps) {
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

  if (!isHtml) return null;

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
  const [renderMode, setRenderMode] = useState<"source" | "render">("source");

  useEffect(() => {
    setRenderMode("source");
  }, [selectedFilePath]);

  const renderToggle = isHtml ? (
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
      <div className="min-h-0 overflow-y-auto p-3">
        <FileEntryList
          entries={files.data?.entries ?? []}
          error={files.error}
          filesClickable={enablePreview}
          isLoading={files.isLoading}
          selectedFilePath={selectedFilePath}
          onOpenDirectory={goToPath}
          onPreviewFile={selectFile}
        />
      </div>
    </aside>
  );

  const previewPanel = (
    <FilePreviewPanel
      error={preview.error}
      isLoading={preview.isLoading}
      preview={previewData}
      renderMode={isHtml ? renderMode : "source"}
      renderToggle={renderToggle}
      isHtml={isHtml}
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
        <PathBreadcrumb path={currentPath} onNavigate={goToPath} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        {browserPanel}
        {enablePreview ? (
          <div
            className={`flex min-h-0 min-w-0 flex-1 flex-col ${selectedFilePath === undefined ? "hidden sm:flex" : "flex"}`}
          >
            <div className="min-h-0 flex-1 flex flex-col overflow-hidden">{previewPanel}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
