import type { ProjectFileEntry, ProjectFilePreviewResponse } from "@agents-remote/shared";
import {
  type ComponentProps,
  type ReactNode,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MarkdownString } from "../markdown/MarkdownString";
import { useT } from "../../i18n";
import { useMobileExitClose } from "../../lib/use-mobile-exit-close";
import {
  listProjectFiles,
  listRootFiles,
  createFolder,
  renameFile,
  deleteFile,
} from "../../api/client";
import { useFileEditor } from "./use-file-editor";
import { enqueueUploads, UploadQueueCard } from "./upload-queue";
import { usePromptDialog } from "../shell/prompt-dialog";
import { useConfirm } from "../shell/confirm-dialog";
import {
  ActionButton,
  IconMarker,
  ListGroup,
  ListRow,
  ListRowSkeleton,
  LoadingBlock,
  shellSurfaceClasses,
} from "../shell/shell-primitives";
import { ShellIcon } from "../shell/icons";
import { ActionMenu, useLongPressActions, useRowContextMenu } from "../ui/action-menu";
import { DraggableListRow, type CardDragStartHandler } from "../workbench/drag-source";
import { relativeTime } from "../workbench/history-list";
import { ImageViewer } from "./image-viewer";
import { formatBytes } from "@/lib/format";

// CodeMirror 体积较大，只在用户打开文本文件 source 预览时按需加载，避免进首屏 chunk。
const CodeEditor = lazy(() => import("./CodeEditor").then((m) => ({ default: m.CodeEditor })));

// 只读预览的占位 onChange：引用必须稳定——@uiw/react-codemirror 的 reconfigure effect
// 依赖 onChange，每渲染新箭头函数会触发 CodeMirror 全量 reconfigure（perf review 2026-09-22）。
const NOOP = () => {};

// ── Utilities ────────────────────────────────────────────────────

// 有渲染能力的文件（markdown / html）默认展示渲染结果，其余文本默认 source。
export function defaultRenderMode(name: string): "source" | "render" {
  return name.endsWith(".md") || name.endsWith(".html") || name.endsWith(".htm")
    ? "render"
    : "source";
}

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
  /** 行菜单「移动到…」（M8）：触发 prompt 输入目标目录 → rename 带 targetDir。undefined = 无移动入口。 */
  onMove?: (path: string) => void;
  /** 行菜单「上传文件…」（05e 菜单 5 项 pin②，§6.12j 批次 6）：触发 FilesPanel fileInput。
   *  undefined = 无上传入口（只读/检视场景——上传语义属编辑态）。 */
  onUploadClick?: () => void;
  onOpenDirectory: (path: string) => void;
  onPreviewFile: (path: string) => void;
  onRenameSubmit: (path: string, name: string) => void;
  onRenamingNameChange: (name: string) => void;
  onStartRename: (path: string, name: string) => void;
  /** 拖动源启动（文件行拖到中栏开 file tab，WorkbenchContent onCardDragStart）。undefined 退纯点击。 */
  onCardDragStart?: CardDragStartHandler;
  /** 文件所属项目名（构造 fileRef.path 全路径 = `${fileProjectName}/${entry.path}`）。
   *  undefined（根目录浏览根层）→ 文件行不可拖（无对应 file tab）。与 selectFile 的 effectiveProjectName gate 一致。 */
  fileProjectName?: string;
  /** 10-tab 全局文件总览卡形态（移动 /files mainPage 根层，M10 用户反馈⑥）：项目目录行 = ic 徽章 +
   *  统计副行 + live 尾标；散文件行 = mono 名 + tm 相对时间。10-tab 原型描述的就是根层总览——卡形态
   *  仅根层装配；子目录层不传 → 退 ListRow 通用行（行内 rename input 所在路径；卡分支无编辑 UI，
   *  code review 2026-09-22 修 rename 回归）。缺省 = ListRow 通用行（桌面 / 检视保持现状）。 */
  globalCard?: {
    overview: Record<string, { instances: number; running: number; latestLabel: string }>;
  };
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
  onMove,
  onUploadClick,
  onOpenDirectory,
  onPreviewFile,
  onRenameSubmit,
  onRenamingNameChange,
  onStartRename,
  onCardDragStart,
  fileProjectName,
  globalCard,
}: FileEntryListProps) {
  const { t } = useT();
  const renameInputRef = useRef<HTMLInputElement>(null);
  const ctx = useRowContextMenu();
  // 05e pin①「右键文件行(iPad 长按)」:触屏长按计时(桌面右键走 onContextMenu 独立路径)。
  const lp = useLongPressActions(ctx.openAt);

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
      <ActionMenu
        align="end"
        cancelLabel={t("cancel")}
        items={[
          // 05e 菜单 5 项顺序（§6.12j 批次 6）：预览/重命名/移动/上传/删除。目录行无预览语义
          //（预览 = 文件），只读场景无上传（onUploadClick undefined 不渲染）。
          ...(entry.type !== "directory"
            ? [
                {
                  label: t("files.menuOpenPreview"),
                  icon: <ShellIcon name="file" />,
                  onSelect: () => onPreviewFile(entry.path),
                },
              ]
            : []),
          {
            label: t("files.rename"),
            icon: <ShellIcon name="edit" />,
            onSelect: () => onStartRename(entry.path, entry.name),
          },
          ...(onMove
            ? [
                {
                  label: t("files.menuMove"),
                  icon: <ShellIcon name="project" />,
                  onSelect: () => onMove?.(entry.path),
                },
              ]
            : []),
          ...(onUploadClick
            ? [
                {
                  label: t("files.menuUpload"),
                  icon: <ShellIcon name="plus" />,
                  onSelect: () => onUploadClick?.(),
                },
              ]
            : []),
          {
            label: t("files.delete"),
            icon: <ShellIcon name="trash" />,
            onSelect: () => onDelete(entry.path),
            variant: "destructive",
          },
        ]}
        trigger={
          <button
            className={`inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg transition hover-capable:opacity-0 hover-capable:group-hover:opacity-100 touch:h-10 touch:w-10 ${shellSurfaceClasses.raisedHover}`}
            onClick={(e) => e.stopPropagation()}
            type="button"
            aria-label={`${entry.name} actions`}
          >
            <ShellIcon className="h-4 w-4 text-on-surface-muted" name="ellipsis" />
          </button>
        }
        contextMenuPoint={ctx.pointFor(entry.path)}
        onContextMenuClose={ctx.close}
      />
    ),
    [t, onDelete, onStartRename, onMove, ctx.pointFor, ctx.close],
  );

  // 10-tab 全局文件总览卡形态（移动 /files mainPage 根层，M10 用户反馈⑥）：项目目录行 gfrow
  //（ic 徽章 + 统计副行 + live）+ 散文件行 gfile（mono 名 + tm），分组双卡（原型结构）。
  // overview 按项目名聚合，仅根层有意义——调用方只在根层传 globalCard，子目录层走下方 ListRow
  //（行内 rename input 所在路径）。写操作 actions 保留（M8 全局写边界不受形态影响）。
  if (globalCard) {
    if (isLoading) return <ListRowSkeleton count={5} />;
    if (error)
      return (
        <ResourceStatePanel tone="danger" title={t("files.errorTitle")} message={error.message} />
      );
    const dirs = entries.filter((e) => e.type === "directory");
    const plainFiles = entries.filter((e) => e.type === "file");
    if (dirs.length === 0 && plainFiles.length === 0)
      return (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-start pt-6">
          <ResourceStatePanel title={t("files.emptyTitle")} message={t("files.emptyDesc")} />
        </div>
      );
    const rowActions = (entry: ProjectFileEntry) =>
      entry.path === renamingPath || readOnly ? null : (
        <span className="flex flex-none items-center">{renderActions(entry)}</span>
      );
    return (
      <div aria-label="Project files">
        {dirs.length > 0 ? (
          <div className="gfcard">
            {dirs.map((entry) => {
              const stat = globalCard.overview[entry.name];
              const active = (stat?.running ?? 0) > 0;
              return (
                <div className="gfrow group" key={`${entry.type}:${entry.path}`}>
                  <button
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
                    onClick={() => onOpenDirectory(entry.path)}
                    type="button"
                  >
                    <span className={active ? "ic" : "ic off"}>
                      <ShellIcon name="project" />
                    </span>
                    <span className="tx">
                      <span className="n">{entry.name}</span>
                      {stat ? (
                        <span className="d">
                          {stat.latestLabel
                            ? active
                              ? t("files.projectMetaActive", {
                                  count: stat.instances,
                                  time: stat.latestLabel,
                                })
                              : t("files.projectMetaIdle", { time: stat.latestLabel })
                            : t("home.idle")}
                        </span>
                      ) : null}
                    </span>
                  </button>
                  <span className={active ? "live" : "live off"}>
                    {active ? `● ${stat?.running}` : "—"}
                  </span>
                  {rowActions(entry)}
                </div>
              );
            })}
          </div>
        ) : null}
        {plainFiles.length > 0 ? (
          <div className="gfcard" style={{ marginTop: 10 }}>
            {plainFiles.map((entry) => (
              <div className="gfile group" key={`${entry.type}:${entry.path}`}>
                <button
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
                  onClick={() => (filesClickable ? onPreviewFile(entry.path) : undefined)}
                  type="button"
                >
                  <span className="ic flex-none">
                    <ShellIcon name="file" />
                  </span>
                  <span className="p">{entry.name}</span>
                  <span className="tm">
                    {entry.mtimeMs ? relativeTime(new Date(entry.mtimeMs).toISOString(), t) : ""}
                  </span>
                </button>
                {rowActions(entry)}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  // 结构已知（ListRow 网格），用骨架 mirror loaded 网格，padding 由外层 p-3 提供。
  if (isLoading) return <ListRowSkeleton count={5} />;
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
      <ListGroup ariaLabel="Project files">
        {entries.map((entry) => {
          const selected = entry.path === selectedFilePath;
          const isDirectory = entry.type === "directory";
          const clickable = isDirectory || filesClickable;
          const isRenaming = entry.path === renamingPath;

          const titleContent = isRenaming ? (
            <span className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
              <input
                ref={renameInputRef}
                className="h-7 w-full min-w-0 rounded-lg border border-primary/60 bg-surface-inset/70 px-2 text-[0.82rem] font-semibold text-on-surface font-mono focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
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

          // 文件行（非目录 + 已知项目名 + 拖动注入）→ DraggableListRow 拖到中栏开 file tab；
          // 目录/根目录层 → 纯 ListRow（无对应 file tab，不可拖）。设计 §7.2 拖动源泛化。
          const rowCommon: ComponentProps<typeof ListRow> = {
            className: "group",
            marker: (
              <IconMarker size="sm" tone={isDirectory ? "accent" : "muted"}>
                <ShellIcon name={isDirectory ? "files-nav" : "file"} className="h-4 w-4" />
              </IconMarker>
            ),
            selected,
            subtitle: entry.hidden ? t("files.hidden") : undefined,
            title: titleContent,
            onClick: isRenaming
              ? undefined
              : clickable
                ? (e) => {
                    // guardClick 抑制长按后紧随的合成 click(02c pill 同款);§4:移动 sheet
                    // scrim / 桌面 popover dismiss 的 click 按 fiber 冒泡到行,target 在 body
                    // 不在行内 → 忽略,否则点 ⋯ 开菜单后再点外会误打开文件/目录。
                    if (lp.guardClick()) return;
                    if (e.target !== e.currentTarget && !e.currentTarget.contains(e.target as Node))
                      return;
                    if (isDirectory) onOpenDirectory(entry.path);
                    else onPreviewFile(entry.path);
                  }
                : undefined,
            onContextMenu: isRenaming || readOnly ? undefined : (e) => ctx.openAt(entry.path, e),
            ...(isRenaming || readOnly ? {} : lp.bind(entry.path)),
            actions: isRenaming || readOnly ? undefined : renderActions(entry),
          };
          // TS 在此分支内 narrow onCardDragStart/fileProjectName 到非空（无需 ! 断言）。
          // dragRef.path 全路径 = `${projectName}/${entry.path}`，与 onOpenFile / selectFile 构造一致。
          if (onCardDragStart && fileProjectName && !isDirectory) {
            return (
              <DraggableListRow
                key={`${entry.type}:${entry.path}`}
                {...rowCommon}
                dragRef={{ kind: "file", path: `${fileProjectName}/${entry.path}` }}
                onCardDragStart={onCardDragStart}
                onSelect={() => onPreviewFile(entry.path)}
              />
            );
          }
          return <ListRow key={`${entry.type}:${entry.path}`} {...rowCommon} />;
        })}
      </ListGroup>
    </>
  );
}

// ── FilePreviewPanel ──────────────────────────────────────────────

export type FilePreviewPanelProps = {
  error: Error | null;
  isLoading: boolean;
  preview: ProjectFilePreviewResponse | undefined;
  renderMode: "source" | "render";
  saveToggle: ReactNode;
  isHtml: boolean;
  isMarkdown: boolean;
  fileName?: string;
  editValue: string;
  /** 只读预览（file tab）不传 → PreviewBody 以只读模式渲 CodeEditor。 */
  onEditChange?: (value: string) => void;
  /** 移动端关闭预览（inspection 浮窗用）；file tab 不提供（close 走 tab ✕）→ 不渲染 close 按钮。 */
  onClose?: () => void;
  /** 手动刷新预览（invalidate preview query 拉最新内容）。提供时 header 渲染 refresh 按钮。 */
  onRefresh?: () => void;
  /** 预览正后台 refetch（refresh 按钮 icon animate-spin + disabled 反馈）。 */
  isRefreshing?: boolean;
  onRenderModeChange: (mode: "source" | "render") => void;
};

export function FilePreviewPanel({
  error,
  isLoading,
  preview,
  renderMode,
  saveToggle,
  isHtml,
  isMarkdown,
  fileName,
  editValue,
  onEditChange,
  onClose,
  onRefresh,
  isRefreshing,
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
      <div className="grid h-11 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 border-b border-neutral-line/40 px-3.5">
        <h4 className="min-w-0 truncate font-mono text-sm font-semibold text-on-surface">
          {displayName.split("/").pop() ?? displayName}
        </h4>
        {isHtml || isMarkdown ? (
          <div
            className="inline-flex shrink-0 justify-self-center items-center gap-0.5 rounded-lg border border-neutral-line/60 bg-surface-inset/60 p-0.5"
            role="group"
          >
            {(["source", "render"] as const).map((mode) => (
              <button
                key={mode}
                className={`flex h-7 shrink-0 cursor-pointer items-center rounded-md px-2.5 text-xs font-semibold transition ${
                  renderMode === mode
                    ? "bg-primary/10 text-primary"
                    : "text-on-surface-muted hover:bg-on-surface/5 hover:text-on-surface"
                }`}
                type="button"
                onClick={() => onRenderModeChange(mode)}
              >
                {mode === "source" ? t("files.sourceMode") : t("files.renderMode")}
              </button>
            ))}
          </div>
        ) : (
          <div className="justify-self-center" aria-hidden="true" />
        )}
        <div
          className={`inline-flex shrink-0 justify-self-end items-center gap-0.5 rounded-lg border border-neutral-line/60 bg-surface-inset/60 p-0.5 ${saveToggle === null && !onRefresh && !onClose ? "sm:hidden" : ""}`}
          role="group"
        >
          {saveToggle}
          {onRefresh ? (
            <button
              className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-on-surface-soft transition hover:bg-primary/10 hover:text-primary disabled:cursor-default disabled:opacity-60"
              type="button"
              onClick={onRefresh}
              disabled={isRefreshing}
              aria-label={t("files.refresh")}
            >
              <ShellIcon
                className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
                name="refresh"
              />
            </button>
          ) : null}
          {onClose ? (
            <button
              className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-on-surface-soft transition hover:bg-error/10 hover:text-error sm:hidden"
              type="button"
              onClick={onClose}
              aria-label={t("session.close")}
            >
              <ShellIcon name="close" className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>
      <div className="min-h-0 flex-1 flex flex-col overflow-y-auto">
        {isLoading ? (
          <LoadingBlock className="flex-1" label={t("files.loadingPreview")} />
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

/**
 * 文件预览的保存按钮（FilesPanel inspection + file tab 预览共用，DRY）。纯渲染：接收编辑态
 *（isDirty/isPending/savedFlash）+ onSave，渲染统一样式的 save button。canEdit gate 由调用方
 * 控制（`saveToggle = editor.canEdit ? <FileSaveButton/> : null`，保持 saveToggle===null 语义供
 * FilePreviewPanel 容器 sm:hidden 判定）。
 */
export function FileSaveButton({
  isDirty,
  isPending,
  savedFlash,
  onSave,
}: {
  isDirty: boolean;
  isPending: boolean;
  savedFlash: boolean;
  onSave: () => void;
}) {
  const { t } = useT();
  return (
    <button
      type="button"
      disabled={!isDirty || isPending}
      onClick={onSave}
      className={`flex h-7 shrink-0 items-center rounded-md px-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
        isPending
          ? "text-on-surface-muted"
          : savedFlash
            ? "text-success"
            : isDirty
              ? "cursor-pointer text-primary hover:bg-primary/10"
              : "text-on-surface-muted"
      }`}
    >
      {isPending ? t("files.saving") : savedFlash ? t("files.saved") : t("files.save")}
    </button>
  );
}

// ── PreviewBody ───────────────────────────────────────────────────

// srcDoc iframe（sandbox）没有项目目录 base URL，HTML 内相对资源引用无法解析。
// 相对 stylesheet/img 统一解析成项目内路径、经 preview API 取回内联；
// 外链(http/https://)、协议相对(//)、data:、#anchor 不是本地文件，保持原样。
export const STYLESHEET_LINK_RE =
  /<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["'][^>]*>/gi;
// \s 而非 \b：\b 会把 data-src 的 src 段当词边界命中。
export const IMG_TAG_RE = /<img\b[^>]*?\ssrc=["']([^"']+)["'][^>]*>/gi;

// 文档所在目录 dir + 相对引用 → 项目内相对路径；非本地引用返回 null。
export const localAssetProjectPath = (dir: string, ref: string): string | null => {
  if (
    !ref ||
    ref.startsWith("http") ||
    ref.startsWith("//") ||
    ref.startsWith("data:") ||
    ref.startsWith("#")
  ) {
    return null;
  }
  return dir + (ref.startsWith("./") ? ref.slice(2) : ref);
};

const IMG_SRC_ATTR_RE = /\ssrc=("[^"]*"|'[^']*')/;

// img 标签内 src 属性值替换为 dataUrl（保留其余属性，引号统一双引号）。
// IMG_SRC_ATTR_RE 的 \s 参与匹配（防 data-src 误命中），替换串须补回该空格。
export const rewriteImgSrc = (tag: string, dataUrl: string): string =>
  tag.replace(IMG_SRC_ATTR_RE, () => ` src="${dataUrl}"`);

const previewUrl = (projectName: string, path: string) =>
  `/api/projects/${encodeURIComponent(projectName)}/files/preview?path=${encodeURIComponent(path)}`;

export function CodeEditorFallback() {
  const { t } = useT();
  return (
    <div className="flex flex-1 items-center justify-center rounded-lg border border-neutral-line/40 bg-surface-inset/80">
      <span className="text-xs font-semibold text-on-surface-muted">
        {t("files.loadingEditor")}
      </span>
    </div>
  );
}

export type PreviewBodyProps = {
  preview: ProjectFilePreviewResponse;
  renderMode: "source" | "render";
  editValue: string;
  onEditChange?: (value: string) => void;
};

export function PreviewBody({ preview, renderMode, editValue, onEditChange }: PreviewBodyProps) {
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

    const inlineLocalAssets = async () => {
      let html = preview.content;

      const stylesheetJobs = [...preview.content.matchAll(STYLESHEET_LINK_RE)].map(
        async ([fullTag, href]) => {
          const cssPath = localAssetProjectPath(dir, href);
          if (cssPath === null) return;
          try {
            const res = await fetch(previewUrl(preview.projectName, cssPath));
            if (!res.ok) return;
            const data = (await res.json()) as { type: string; content?: string };
            if (data.type === "text" && data.content) {
              html = html.replace(fullTag, `<style>${data.content}</style>`);
            }
          } catch {
            // leave the link tag as-is if fetch fails
          }
        },
      );

      const imgJobs = [...preview.content.matchAll(IMG_TAG_RE)].map(async ([fullTag, src]) => {
        const imgPath = localAssetProjectPath(dir, src);
        if (imgPath === null) return;
        try {
          const res = await fetch(previewUrl(preview.projectName, imgPath));
          if (!res.ok) return;
          const data = (await res.json()) as { type: string; dataUrl?: string };
          if (data.type === "image" && data.dataUrl) {
            html = html.replace(fullTag, rewriteImgSrc(fullTag, data.dataUrl));
          }
        } catch {
          // leave the img tag as-is if fetch fails
        }
      });

      await Promise.all([...stylesheetJobs, ...imgJobs]);
      if (!cancelled) setInlinedHtml(html);
    };

    void inlineLocalAssets();
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
        return <LoadingBlock className="flex-1" label={t("files.preparingRender")} />;
      return (
        <div className="flex-1">
          {/* sandbox=""（v1.4 批7，design_spec）：纯静态预览——不执行脚本、不发请求；
              动态行为交工作台终端里的真实环境。 */}
          <iframe
            className="w-full h-full border-0"
            sandbox=""
            srcDoc={inlinedHtml}
            title="Sandboxed HTML render"
          />
        </div>
      );
    }
    return (
      <div className="flex min-h-0 flex-1 flex-col p-3">
        <Suspense fallback={<CodeEditorFallback />}>
          <CodeEditor
            value={editValue}
            name={preview.name}
            onChange={onEditChange ?? NOOP}
            editable={onEditChange !== undefined}
          />
        </Suspense>
      </div>
    );
  }

  if (preview.type === "image")
    return <ImageViewer alt={preview.name} downloadName={preview.name} src={preview.dataUrl} />;

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
 * FilesPanel 数据源解析（设计 workbench-views §4.1，唯一模式）。全局 files tab 根目录 =
 * PROJECTS_ROOT：
 * - currentPath 空 → root listing（只读，列所有项目目录）。
 * - currentPath 第一段 = 项目名 → 切换为该项目的可写 files（复用 project API）。
 *
 * 单一数据管道：按 currentPath 派生 {projectName, relativePath, isRootListing}，不为 root
 * 维护平行渲染组件。进入项目后 selectedFilePath / entry.path 均为项目内相对路径
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
 * 项目层目录导航：把 `listProjectFiles` 返回的项目根相对 `entry.path`
 *（无 projectName 前缀）拼回完整 currentPath = "projectName/relativePath" 格式
 * （`resolveRootBrowseTarget` 的逆运算）。根层（entry.path=项目名本身）原样返回。
 *
 * 调用方语义统一（设计 workbench-views §4.1）：`FileEntryList.onOpenDirectory` 传项目
 * 相对 entry.path，经本函数转成完整 currentPath 后再调 `goToPath`；
 * `PathBreadcrumb.onNavigate` 传的 segmentPath 已是完整格式，直接调 `goToPath`。
 * `goToPath` 单一逻辑直接 `setCurrentPath`，避免单一函数同时服务两种 path 语义
 * 导致某种来源被双前缀或丢前缀。
 */
export function joinRootBrowseDirectoryPath(target: RootBrowseTarget, entryPath: string): string {
  return target.kind === "project" ? `${target.projectName}/${entryPath}` : entryPath;
}

export type FilesPanelProps = {
  initialPath: string;
  /**
   * 受控当前路径（可选）。传入时覆盖内部 state，配合 onPathChange 实现跨卸载保活（如左栏
   * middle tab 切换不丢 cwd）。未传时退化为 initialPath 初始化的内部 state（其他调用方零改）。
   */
  currentPath?: string;
  /** Show file preview panel when a file is clicked. Default true. */
  enablePreview?: boolean;
  /** Query-key segment to isolate caches between different consumers. Default "files". */
  queryScope?: string;
  /** 10-tab 卡形态透传 FileEntryList（移动 /files mainPage 根层专用，见 FileEntryListProps 注释）。 */
  globalCard?: {
    overview: Record<string, { instances: number; running: number; latestLabel: string }>;
  };
  onPathChange?: (path: string) => void;
  /**
   * 文件点击回调（仅 enablePreview=false 树模式触发）。透出当前 project + 文件相对路径，
   * 供调用方开 file tab（左栏文件树 → 中栏 file tab）。enablePreview=true（inspection）走
   * 预览分支不触发，行为零改。
   */
  onOpenFile?: (projectName: string, path: string) => void;
  /** 拖动源启动（文件行拖到中栏开 file tab，透传 FileEntryList）。undefined 退纯点击（inspection/移动）。 */
  onCardDragStart?: CardDragStartHandler;
  /** 名称过滤（大小写不敏感的 includes；10m 桌面整页搜索框用）。undefined/空 = 不过滤。 */
  filter?: string;
};

export function FilesPanel({
  initialPath,
  currentPath: controlledPath,
  enablePreview = true,
  queryScope = "files",
  globalCard,
  onPathChange,
  onOpenFile,
  onCardDragStart,
  filter,
}: FilesPanelProps) {
  const { t } = useT();
  const [internalPath, setInternalPath] = useState(initialPath);
  // 受控优先（调用方持有 cwd 跨卸载保活）；未传退非受控内部 state（其他调用方零改）。
  const currentPath = controlledPath ?? internalPath;
  const [selectedFilePath, setSelectedFilePath] = useState<string | undefined>();
  const {
    exiting: previewExiting,
    close: closePreviewOverlay,
    onAnimationEnd: onPreviewOverlayAnimationEnd,
    cancel: cancelPreviewExit,
  } = useMobileExitClose(() => {
    setSelectedFilePath(undefined);
  });
  // 按 currentPath 派生数据源（设计 §4.1）：根层只读列项目目录，进项目子目录切可写。
  const target = resolveRootBrowseTarget(currentPath);
  const isRootListing = target.kind === "root";
  const effectiveProjectName = target.kind === "project" ? target.projectName : undefined;
  const effectiveRelativePath = target.kind === "project" ? target.relativePath : currentPath;
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
  const editor = useFileEditor({
    editable: true,
    path: enablePreview && selectedFilePath !== undefined ? selectedFilePath : null,
    projectName: effectiveProjectName ?? "",
    queryScope,
  });
  const previewData = editor.previewData;
  const isDirty = editor.isDirty;
  const editValue = editor.editValue;
  const showRenderToggle = editor.showRenderToggle;

  const goToPath = (path: string) => {
    setInternalPath(path);
    setSelectedFilePath(undefined);
    onPathChange?.(path);
  };

  // 「路径不存在」回退：文件树停在 localStorage 记忆的目录，但该目录/项目已被删除时，
  // listProjectFiles 返回错误（fetchJson 对非 2xx 一律抛 Error）。此时清空 cwd 记忆回退根目录，
  // 避免停留在错误页（用户 2026-08-04 边界要求）。仅受控模式触发——调用方持久化记忆，路径可能
  // 已失效；非受控内部 state 由用户主动导航驱动，天然可回退。key 变化时新查询 pending、error 归零，
  // 不会误触发；goToPath 稳定语义（setState + onPathChange 回调），effect 只依赖 error。
  useEffect(() => {
    if (files.error !== null && currentPath !== "") {
      goToPath("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files.error]);

  const selectFile = (path: string) => {
    cancelPreviewExit();
    if (!enablePreview) {
      // 树模式（左栏）：透出当前 project + 文件路径给调用方开 file tab，本组件不预览。
      onOpenFile?.(effectiveProjectName ?? "", path);
      return;
    }
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
        }
      });
      return;
    }
    setSelectedFilePath(path);
  };

  // clearPreview 经 useMobileExitClose 编排：移动端先播 slide-out 再真正清（§7 对称），桌面端即时。
  const clearPreview = closePreviewOverlay;
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // 上传统一走全局队列（03z .upcard：串行 + 冲突三选 + 失败重试），组件不再持 upload mutation。
  const uploadFiles = useCallback(
    (fileList: FileList | File[]) => {
      const files = Array.from(fileList);
      if (files.length === 0) return;
      if (isRootListing) {
        enqueueUploads("", "", files);
        return;
      }
      enqueueUploads(effectiveProjectName ?? "", effectiveRelativePath, files);
    },
    [isRootListing, effectiveProjectName, effectiveRelativePath],
  );

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
    mutationFn: ({ path, name, targetDir }: { path: string; name: string; targetDir?: string }) =>
      renameFile(effectiveProjectName ?? "", path, name, targetDir),
    onSuccess: () => invalidateFiles(),
  });

  // 移动到…（M8）：行菜单触发，prompt 输入目标目录（项目内相对路径）→ rename 带 targetDir。
  const moveDialog = usePromptDialog();
  const handleMove = useCallback(
    (path: string) => {
      const fileName = path.split("/").pop() ?? path;
      const currentDir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
      void moveDialog
        .prompt({
          title: t("files.menuMove"),
          placeholder: t("files.movePrompt"),
          initialValue: currentDir,
          confirmLabel: t("files.move"),
          cancelLabel: t("cancel"),
        })
        .then((targetDir) => {
          if (targetDir === null) return;
          const trimmed = targetDir.trim();
          if (trimmed === currentDir) return;
          rename.mutate({ path, name: fileName, targetDir: trimmed });
        });
    },
    [moveDialog, rename, t],
  );

  const del = useMutation({
    mutationFn: (path: string) => deleteFile(effectiveProjectName ?? "", path),
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
    (fileList: FileList | File[]) => {
      uploadFiles(fileList);
    },
    [uploadFiles],
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
      if (e.dataTransfer.files.length > 0) handleFileDrop(e.dataTransfer.files);
    },
    [handleFileDrop],
  );

  useEffect(() => {
    if (selectedFilePath !== undefined) {
      const name = selectedFilePath.split("/").pop() ?? "";
      editor.onRenderModeChange(defaultRenderMode(name));
    }
    // onRenderModeChange 是 useState setter（引用稳定）——不能把 editor 整对象进 deps
    //（每渲染新字面量 → effect 每渲染跑，md/html 点「源码」会被立即重置回渲染态）。
  }, [selectedFilePath, editor.onRenderModeChange]);

  const saveButton = editor.canEdit ? (
    <FileSaveButton
      isDirty={isDirty}
      isPending={editor.isSaving}
      savedFlash={editor.savedFlash}
      onSave={editor.handleSave}
    />
  ) : null;

  const isPreviewOpen = selectedFilePath !== undefined && enablePreview;
  const browserPanel = (
    <aside
      className={`min-h-0 min-w-0 flex-1 ${enablePreview ? "sm:flex-none sm:w-[19.375rem] sm:shrink-0 sm:border-r sm:border-neutral-line/60" : "sm:flex-1"} ${isPreviewOpen ? "hidden sm:flex sm:flex-col" : "flex flex-col"}`}
    >
      <div className="flex flex-1 min-h-0 flex-col overflow-y-auto px-3 pb-3 max-lg:!pb-[var(--shell-mobile-bottom-nav-space,0px)]">
        <UploadQueueCard />
        <FileEntryList
          entries={
            filter?.trim()
              ? (files.data?.entries ?? []).filter((entry) =>
                  entry.name.toLowerCase().includes(filter.trim().toLowerCase()),
                )
              : (files.data?.entries ?? [])
          }
          error={files.error}
          filesClickable={enablePreview || onOpenFile !== undefined}
          readOnly={readOnly}
          onMove={handleMove}
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
          onCardDragStart={onCardDragStart}
          fileProjectName={effectiveProjectName}
          globalCard={globalCard}
          onUploadClick={readOnly ? undefined : () => fileInputRef.current?.click()}
        />
      </div>
    </aside>
  );

  const previewPanel = (
    <FilePreviewPanel
      error={editor.preview.error}
      isLoading={editor.preview.isLoading}
      preview={previewData}
      renderMode={showRenderToggle ? editor.renderMode : "source"}
      saveToggle={saveButton}
      isHtml={editor.isHtml}
      isMarkdown={editor.isMarkdown}
      fileName={selectedFilePath?.split("/").pop() ?? selectedFilePath}
      editValue={editValue}
      onEditChange={editor.onEditChange}
      onClose={clearPreview}
      onRefresh={editor.refresh}
      isRefreshing={editor.isRefreshing}
      onRenderModeChange={editor.onRenderModeChange}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col sm:overflow-hidden">
      <div
        className={`shrink-0 border-b border-on-surface/5 px-2 py-1.5 ${isPreviewOpen ? "hidden sm:block" : "block"}`}
      >
        <div
          className="flex min-h-[2.125rem] min-w-0 items-center justify-between gap-3"
          // 内容高 34px = ViewSwitcher 行（h-7 按钮 + p-0.5 border 外壳），使 files header 行
          // 总高 47px 与总览 ViewSwitcher 行一致（批 Q 点 4 收尾：原本 min-h-7=28 → 41px 独树一帜）。
        >
          <PathBreadcrumb path={currentPath} onNavigate={goToPath} />
          {/* 写操作 actions（New Folder/Upload）只在 inspection 模式（enablePreview=true）渲染；
              FilesLeftPanel 纯导航树（enablePreview=false）不挂写操作——窄左栏（256px）actions 文字
              + breadcrumb 会溢出覆盖 breadcrumb button（click intercept），且写操作语义属中栏 file
              tab（Save）+ 右栏 files inspection（Phase 3 后 project scope 右栏始终有 files inspection）。
              ⚠️ v2 M3-b 起 drawer 已删，移动端文件工具（row2 folder ticon）暂无写操作入口
              （本按钮 lg:flex 桌面 only）——M4 落 03o-files-tool 原型时按原型补移动端 actions。 */}
          {!enablePreview ? null : (
            <div className="hidden shrink-0 items-center gap-2 lg:flex">
              {mkdir.error instanceof Error ? (
                <p className="text-xs text-error hidden sm:block">{mkdir.error.message}</p>
              ) : null}
              <input
                ref={fileInputRef}
                className="hidden"
                type="file"
                multiple
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) handleFileDrop(e.target.files);
                  e.target.value = "";
                }}
              />
              {readOnly ? null : showFolderInput ? (
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
                    compact
                    disabled={mkdir.isPending || folderNameInput.trim().length === 0}
                    tone="accent"
                    onClick={handleMkdir}
                  >
                    <span className="px-0.5 text-xs font-bold">
                      {mkdir.isPending ? "..." : "✓"}
                    </span>
                  </ActionButton>
                </div>
              ) : readOnly ? null : (
                <ActionButton
                  compact
                  title={t("files.newFolderTooltip")}
                  tone="muted"
                  onClick={() => setShowFolderInput(true)}
                >
                  <ShellIcon name="folder-plus" className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline pr-0.5">{t("files.newFolder")}</span>
                </ActionButton>
              )}
              <ActionButton
                compact
                title={t("files.uploadTooltip")}
                tone="accent"
                onClick={() => fileInputRef.current?.click()}
              >
                <ShellIcon name="upload" className="h-3.5 w-3.5" />
                <span className="hidden sm:inline pr-0.5">{t("files.upload")}</span>
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
        {mkdir.error instanceof Error ? (
          <p className="text-xs text-error sm:hidden px-3 pt-2">{mkdir.error.message}</p>
        ) : null}
        {browserPanel}
        {enablePreview ? (
          <div
            key={selectedFilePath !== undefined ? "preview-open" : "preview-closed"}
            onAnimationEnd={onPreviewOverlayAnimationEnd}
            className={
              selectedFilePath === undefined && !previewExiting
                ? "hidden sm:flex sm:min-h-0 sm:min-w-0 sm:flex-1 sm:flex-col"
                : [
                    "fixed inset-0 z-50 flex flex-col bg-surface",
                    "pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]",
                    previewExiting
                      ? "animate-out slide-out-to-bottom-full duration-300 ease-in fill-mode-forwards"
                      : "animate-in slide-in-from-bottom-full duration-300 ease-out",
                    "sm:static sm:inset-auto sm:z-auto sm:min-h-0 sm:min-w-0 sm:flex-1 sm:flex-col sm:bg-transparent sm:pt-0 sm:pb-0 sm:animate-none",
                  ].join(" ")
            }
          >
            <div className="min-h-0 flex-1 flex flex-col overflow-hidden">{previewPanel}</div>
          </div>
        ) : null}
      </div>
      {confirmHolder}
      {moveDialog.holder}
    </div>
  );
}
