import type { ProjectFileEntry, ProjectFilePreviewResponse } from "@agents-remote/shared";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listProjectFiles, previewProjectFile } from "../../api/client";
import { IconMarker, ListRow, shellSurfaceClasses } from "../shell/shell-primitives";

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
  const segments = path.split("/").filter(Boolean);
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-0.5 text-xs font-semibold">
      <button
        className="flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-slate-400 transition hover:bg-slate-700/50 hover:text-cyan-200"
        type="button"
        onClick={() => onNavigate("")}
        aria-label="Go to root"
      >
        <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M2 6.5L8 2l6 4.5V14a.5.5 0 01-.5.5h-3.75v-3.75h-3.5V14.5H2.5A.5.5 0 012 14V6.5z"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinejoin="round"
          />
        </svg>
        <span>root</span>
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
  if (isLoading) return <ResourceStatePanel tone="inset" message="Loading files..." />;
  if (error)
    return (
      <ResourceStatePanel
        tone="danger"
        title="Unable to load this directory."
        message={error.message}
      />
    );
  if (entries.length === 0)
    return (
      <ResourceStatePanel
        title="Empty directory"
        message="This Project path has no files or folders."
      />
    );

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
              <IconMarker tone={isDirectory ? "accent" : "muted"}>
                {isDirectory ? "DR" : "FL"}
              </IconMarker>
            }
            selected={selected}
            subtitle={entry.hidden ? "hidden" : undefined}
            title={entry.name}
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
};

function FilePreviewPanel({
  error,
  isLoading,
  preview,
  renderMode,
  renderToggle,
}: FilePreviewPanelProps) {
  if (isLoading) return <ResourceStatePanel tone="inset" message="Loading preview..." />;
  if (error)
    return (
      <ResourceStatePanel
        tone="danger"
        title="Unable to preview this file."
        message={error.message}
      />
    );
  if (!preview)
    return (
      <ResourceStatePanel
        title="Select a file to preview"
        message="Text and common web images are shown read-only."
      />
    );

  return (
    <section
      className="min-h-0 min-w-0 flex-1 flex flex-col bg-[#141b28]/70"
      aria-label="File preview"
    >
      <div className="flex min-w-0 items-center justify-between gap-2 px-3.5 py-2.5 border-b border-slate-700/40">
        <div className="min-w-0">
          <h4 className="truncate font-mono text-sm font-semibold text-slate-100">
            {preview.name}
          </h4>
          <p className="mt-0.5 truncate font-mono text-xs text-slate-500">
            {preview.path.includes("/")
              ? preview.path.slice(0, preview.path.lastIndexOf("/"))
              : "/"}
          </p>
        </div>
        <div className="hidden sm:block">{renderToggle}</div>
      </div>
      <div className="min-h-0 flex-1 flex flex-col overflow-y-auto">
        <PreviewBody preview={preview} renderMode={renderMode} />
      </div>
    </section>
  );
}

// ── PreviewBody ───────────────────────────────────────────────────

type PreviewBodyProps = {
  preview: ProjectFilePreviewResponse;
  renderMode: "source" | "render";
};

function PreviewBody({ preview, renderMode }: PreviewBodyProps) {
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
          <div className="flex flex-1 items-center justify-center p-6">
            <p className="text-sm text-slate-400">Preparing render...</p>
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
      <pre
        className={`min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-xs leading-5 text-slate-100 sm:text-sm ${shellSurfaceClasses.code}`}
      >
        {preview.content}
      </pre>
    );
  }

  if (preview.type === "image")
    return (
      <div className="p-3">
        <img
          className="mx-auto h-auto max-w-full"
          src={preview.dataUrl}
          alt={preview.name}
        />
      </div>
    );

  if (preview.type === "too_large")
    return (
      <p className="p-3 text-sm leading-6 text-amber-100">
        File is too large to preview. Limit: {formatBytes(preview.limitBytes)}.
      </p>
    );

  return (
    <p className="p-3 text-sm leading-6 text-slate-300">
      This file type is not supported for preview yet.
    </p>
  );
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
          {mode === "source" ? "Source" : "Render"}
        </button>
      ))}
    </div>
  ) : null;

  const isPreviewOpen = selectedFilePath !== undefined && enablePreview;
  const browserPanel = (
    <aside
      className={`min-h-0 sm:w-[19.375rem] sm:shrink-0 sm:border-r sm:border-slate-700/60 ${isPreviewOpen ? "hidden sm:flex sm:flex-col" : "flex flex-col"}`}
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

  const mobilePreviewTopBar =
    isPreviewOpen ? (
      <div
        className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b border-slate-700/40 px-3 py-2.5 sm:hidden ${shellSurfaceClasses.runtimeBody}`}
      >
        <button
          className="flex shrink-0 cursor-pointer items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-400 transition hover:bg-slate-700/50 hover:text-slate-200"
          type="button"
          onClick={clearPreview}
          aria-label="Back to files"
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
          Back
        </button>
        <p className="min-w-0 truncate text-center font-mono text-xs font-semibold text-slate-200">
          {previewData?.name ?? selectedFilePath.split("/").pop() ?? ""}
        </p>
        <div className="shrink-0">{renderToggle ?? <span className="w-[4.5rem]" />}</div>
      </div>
    ) : null;

  const previewPanel = (
    <FilePreviewPanel
      error={preview.error}
      isLoading={preview.isLoading}
      preview={previewData}
      renderMode={isHtml ? renderMode : "source"}
      renderToggle={renderToggle}
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
            {mobilePreviewTopBar}
            <div className="min-h-0 flex-1 flex flex-col overflow-hidden">{previewPanel}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
