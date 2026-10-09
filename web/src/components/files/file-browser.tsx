import type { ProjectFileEntry, ProjectFilePreviewResponse } from "@agents-remote/shared";
import {
  type ReactNode,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MarkdownString } from "../markdown/MarkdownString";
import { MarkdownLinkContext } from "../markdown/markdown-components";
import { resolveRelativeFilePath } from "./relative-md-link";
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
import { RenderModeToggle } from "./render-mode-toggle";
import { enqueueUploads, UploadQueueCard } from "./upload-queue";
import { usePromptDialog } from "../shell/prompt-dialog";
import { useConfirm } from "../shell/confirm-dialog";
import {
  ActionButton,
  ListRowSkeleton,
  LoadingBlock,
  shellSurfaceClasses,
} from "../shell/shell-primitives";
import { ShellIcon } from "../shell/icons";
import { ActionMenu, type ActionMenuItem, useRowContextMenu } from "../ui/action-menu";
import type { CardDragStartHandler } from "../workbench/drag-source";
import { relativeTime } from "../workbench/history-list";
import { ImageViewer } from "./image-viewer";
import { FileCrumb } from "./file-crumb";
import { FileTreeRows } from "./file-tree-rows";
import { formatBytes } from "@/lib/format";

// CodeMirror 体积较大，只在用户打开文本文件 source 预览时按需加载，避免进首屏 chunk。
const CodeEditor = lazy(() => import("./CodeEditor").then((m) => ({ default: m.CodeEditor })));

// 只读预览的占位 onChange：引用必须稳定——@uiw/react-codemirror 的 reconfigure effect
// 依赖 onChange，每渲染新箭头函数会触发 CodeMirror 全量 reconfigure（perf review 2026-09-22）。
const NOOP = () => {};

// ── Utilities ────────────────────────────────────────────────────

// defaultRenderMode 已下沉 use-file-editor.ts（renderMode 重置收敛 hook 单源，2026-09-30）。

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
  const ctx = useRowContextMenu();

  // 05e 菜单 5 项顺序（§6.12j 批次 6）：预览/重命名/移动/上传/删除。目录行无预览语义
  //（预览 = 文件），只读场景无上传（onUploadClick undefined 不渲染）。批 11 真同构：items
  // 构造留容器（编排属容器层），ActionMenu 壳与行 DOM 收敛 FileTreeRows 单源。
  const menuItemsFor = useCallback(
    (entry: ProjectFileEntry): ActionMenuItem[] => [
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
    ],
    [t, onDelete, onStartRename, onMove, onUploadClick, onPreviewFile],
  );

  // globalCard 总览卡行（gfrow/gfile 形态）行尾 ⋯ 钮（hover 显隐）：ActionMenu button
  // trigger 形态（hidden trigger 形态已收敛 FileTreeRows 单源）。
  const renderActions = useCallback(
    (entry: ProjectFileEntry) => (
      <ActionMenu
        align="end"
        cancelLabel={t("cancel")}
        items={menuItemsFor(entry)}
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
    [t, menuItemsFor, ctx.pointFor, ctx.close],
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
          <>
            {/* 10m:72 组标签（桌面双分组；移动 10-tab 无组标签 → hidden lg:block 才渲染，
                同构同一 DOM。左缘 = 容器 lg px-5 20px，卡 margin-inline 已归零）。 */}
            <div className="grplabel hidden lg:block">{t("files.groupProjectRoots")}</div>
            <div className="gfcard animate-stagger-rows">
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
          </>
        ) : null}
        {plainFiles.length > 0 ? (
          <>
            {/* 第二卡 margin：移动 10px（原型双卡间距）；桌面归零由外层 lg:gap-3 承担
               （此前 inline style 优先级盖 lg 分档 margin:0，桌面多出 10px）。 */}
            <div className="grplabel hidden lg:block">{t("files.groupRootFiles")}</div>
            <div className="gfcard mt-2.5 lg:mt-0 animate-stagger-rows">
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
          </>
        ) : null}
        {/* 10-tab:85 / 10m:84 页脚说明（同一 DOM：移动 center + mt 14；桌面 lg 左对齐、
            间距由外层 gap 承担。10m 长文「视图切换原则」为桌面专有说明，单份文案取
            10-tab 共有语义，desktop 长文 diverge 记档；10m absolute bottom 不取——
            遮内容，文档流尾行更安全）。 */}
        <p className="cap mt-3.5 lg:mt-0 lg:text-left">{t("files.globalCap")}</p>
      </div>
    );
  }

  // 结构已知（ListRow 网格），用骨架 mirror loaded 网格，padding 由外层 p-3 提供。
  // error/empty/skeleton 三态各自内缩 px-3（design-review 批 11：批 11 2c 只对 .frow 行
  // 贴边统一——卡片态带面底/圆角，容器 0px 双边贴边像破版；行容器保持零水平 padding）。
  if (isLoading)
    return (
      <div className="px-3">
        <ListRowSkeleton count={5} />
      </div>
    );
  if (error)
    return (
      <div className="px-3">
        <ResourceStatePanel tone="danger" title={t("files.errorTitle")} message={error.message} />
      </div>
    );
  if (entries.length === 0)
    return (
      <div className="flex flex-1 min-h-0 flex-col items-center justify-start pt-6 lg:justify-center lg:pt-0">
        <div className="w-full px-3 lg:w-auto">
          <ResourceStatePanel title={t("files.emptyTitle")} message={t("files.emptyDesc")} />
        </div>
      </div>
    );

  // .frow 通用行（批 11 真同构：行 DOM/守卫链/长按右键菜单收敛 FileTreeRows 单源——
  // 与 FilesToolPanel 同一份代码；items 构造（menuItemsFor）/rename props/拖动注入经 props）。
  return (
    <FileTreeRows
      entries={entries}
      filesClickable={filesClickable}
      fileProjectName={fileProjectName}
      menuItemsFor={menuItemsFor}
      onCardDragStart={onCardDragStart}
      onOpenDirectory={onOpenDirectory}
      onPreviewFile={onPreviewFile}
      readOnly={readOnly}
      selectedFilePath={selectedFilePath}
      renaming={
        renamingPath !== null
          ? {
              path: renamingPath,
              name: renamingName,
              onNameChange: onRenamingNameChange,
              onSubmit: onRenameSubmit,
              onCancel: onCancelRename,
            }
          : undefined
      }
    />
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
          <RenderModeToggle
            className="justify-self-center"
            mode={renderMode}
            onChange={onRenderModeChange}
          />
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
// iframe 同病：srcDoc 文档无 base URL，相对 src 解析不出 → 嵌套本地 html/svg 空白
//（2026-09-30 真机反馈）。iframe 指向本地 html → 递归内联后整体转 srcdoc；
// 指向本地 svg 等图片 → src 换 dataUrl。
export const IFRAME_TAG_RE = /<iframe\b[^>]*?\ssrc=["']([^"']+)["'][^>]*>/gi;

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

// 标签内 src 属性值整体替换（img/iframe 通用，引号统一双引号）。
// IMG_SRC_ATTR_RE 的 \s 参与匹配（防 data-src 误命中），替换串须补回该空格。
const rewriteSrcAttr = (tag: string, value: string): string =>
  tag.replace(IMG_SRC_ATTR_RE, () => ` src="${value}"`);

export const rewriteImgSrc = (tag: string, dataUrl: string): string => rewriteSrcAttr(tag, dataUrl);

// srcdoc 属性值转义：& 与 " 要放进双引号属性内（& 必须最先，后续实体的 & 不被二次转义；
// < 在双引号属性值内本合法，转义后浏览器解码无损——reviewer 建议的规范健壮性）。
const escapeSrcdoc = (doc: string): string =>
  doc.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

// ── 静态图标水合（2026-09-30 真机反馈：嵌套原型页图标消失）────────────────
// 项目图标管线的静态页（docs/design 原型等）用 <i data-icon="x"></i> 空占位 +
// icons.js 运行时替换成 svg；sandbox="" 禁脚本后水合不发生 → 占位处图标空白。
// 内联阶段做静态等效水合：fetch 文档引用的脚本，识别「window.ICONS = {JSON}」
// 格式（build-icons.mjs 生成物）后按其规则替换占位；JSON.parse 解析、不 eval，
// 认不得格式的脚本跳过保持原样。svg[data-symbol] 自带手绘 path 兜底能显示，不动。
export const ICON_SCRIPT_TAG_RE = /<script\b[^>]*?\ssrc=["']([^"']+)["'][^>]*>\s*<\/script>/gi;
// icons.js 形如 `/* 头注释 */ window.ICONS = {...};(function(){…})();`——赋值语句
// 前可能有生成头注释、其后可能还有水合器代码，故定位 `window.ICONS = {` 赋值后用
// 括号配对提取首个平衡对象（纯读取型引用 `window.ICONS[x]` 无 `= {` 不命中）。
export const WINDOW_ICONS_ASSIGN_RE = /window\.ICONS\s*=\s*\{/;
export const DATA_ICON_TAG_RE =
  /<(?:i|span)\b[^>]*?\sdata-icon=["']([^"']+)["'][^>]*>\s*<\/(?:i|span)>/gi;

// <style>/<script> 完整段（含标签）——内联前剥出为占位，资源收集与 data-icon 水合
// 都不进样式/脚本文本（CSS 注释里的 `<i data-icon>` 字样曾被占位正则误替换成 svg，
// 第八批 33 处残留实为此因；script 闭合法则保证段内无嵌套段）。
export const STYLE_SCRIPT_SEGMENT_RE = /<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi;

// 解析 window.ICONS 注册表；非该格式（或 JSON 非法）返回 null。括号配对（含
// 字符串/转义感知）找首个平衡对象后 JSON.parse——不 eval，杜绝执行任意代码。
export const parseWindowIcons = (script: string): Record<string, string> | null => {
  const assign = script.match(WINDOW_ICONS_ASSIGN_RE);
  if (!assign || assign.index === undefined) return null;
  const open = assign.index + assign[0].length - 1; // "{" 的位置
  let depth = 0;
  let inString = false;
  for (let i = open; i < script.length; i++) {
    const ch = script[i];
    if (inString) {
      if (ch === "\\") {
        i++; // 跳过转义字符
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          const parsed: unknown = JSON.parse(script.slice(open, i + 1));
          if (typeof parsed !== "object" || parsed === null) return null;
          return parsed as Record<string, string>;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
};

// i/span[data-icon] 占位 → 静态 svg（复刻 icons.js 的 apply 规则：24 网格 +
// stroke currentColor + strokeWidth 2，class 从占位继承）。名字查不到返回 null。
export const rewriteIconPlaceholder = (
  tag: string,
  name: string,
  icons: Record<string, string>,
): string | null => {
  const body = icons[name];
  if (!body) return null;
  const cls = tag.match(/\sclass=["']([^"']+)["']/)?.[1];
  const clsAttr = cls ? ` class="${cls}"` : "";
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style="stroke-width:2"${clsAttr} aria-hidden="true">${body}</svg>`;
};

export const hydrateDataIconPlaceholders = (html: string, icons: Record<string, string>): string =>
  html.replace(
    DATA_ICON_TAG_RE,
    (fullTag, name: string) => rewriteIconPlaceholder(fullTag, name, icons) ?? fullTag,
  );

// iframe src 属性替换为 srcdoc：嵌套 html 文档整体内联进属性值，sandbox 语义不变
//（嵌套文档同样不执行脚本、不发请求）。
export const rewriteIframeSrcdoc = (tag: string, doc: string): string =>
  tag.replace(IMG_SRC_ATTR_RE, () => ` srcdoc="${escapeSrcdoc(doc)}"`);

const previewUrl = (projectName: string, path: string) =>
  `/api/projects/${encodeURIComponent(projectName)}/files/preview?path=${encodeURIComponent(path)}`;

export const INLINE_NESTED_HTML_MAX_DEPTH = 2;

export type InlinePreviewFetcher = (
  projectName: string,
  path: string,
) => Promise<ProjectFilePreviewResponse>;

// 深度优先内联文档内的本地资源引用（css → <style>、img → dataUrl、iframe →
// srcdoc/dataUrl），返回内联后的 html。嵌套 iframe 指向本地 html 时递归内联其
// 资源——相对引用基于嵌套文档自身所在目录（不是外层文档目录）——到
// INLINE_NESTED_HTML_MAX_DEPTH 层为止，超限的嵌套文档原样进 srcdoc。
// fetchPreview 抛错（404 等）的引用保持原样，不阻塞其余引用。
export async function inlineLocalHtmlAssets(
  html: string,
  opts: {
    dir: string;
    projectName: string;
    fetchPreview: InlinePreviewFetcher;
    depth?: number;
  },
): Promise<string> {
  const { dir, projectName, fetchPreview, depth = 0 } = opts;

  // per-call fetch 去重：同一文档树（含嵌套 iframe）内同 path 只 fetch 一次——外层与
  // 嵌套文档共引 icons.js/共享 css 是常态；跨调用不缓存（preview 重取后内容可能已变）。
  const fetchCache = new Map<string, Promise<ProjectFilePreviewResponse>>();
  const fetchOnce: InlinePreviewFetcher = (name, path) => {
    const key = `${name}\uE000${path}`;
    let p = fetchCache.get(key);
    if (!p) {
      p = fetchPreview(name, path);
      fetchCache.set(key, p);
    }
    return p;
  };

  // 剥出 style/script 段为 PUA 占位（ 转义，私有使用区字符，正常 HTML 文档
  // 不会出现；段定义见 STYLE_SCRIPT_SEGMENT_RE 注）——资源收集与 data-icon 水合只
  // 作用于正文。带 src 的 script 标签随之进 segments，iconScript jobs 改从 segments
  // 收集（fetch 语义不变，水合目标本来就是正文占位）。
  const segments: string[] = [];
  html = html.replace(STYLE_SCRIPT_SEGMENT_RE, (m) => `\uE000${segments.push(m) - 1}\uE000`);

  const stylesheetJobs = [...html.matchAll(STYLESHEET_LINK_RE)].map(async ([fullTag, href]) => {
    const cssPath = localAssetProjectPath(dir, href);
    if (cssPath === null) return;
    try {
      const data = await fetchOnce(projectName, cssPath);
      if (data.type === "text" && data.content) {
        // 替换串走函数形式：字符串替换串里 `$&`/`` $` ``/`$'` 会被当特殊序列展开，
        // css/嵌套文档内容（任意文本，常内嵌 JS）一旦出现即静默破坏内联产物。
        html = html.replace(fullTag, () => `<style>${data.content}</style>`);
      }
    } catch {
      // leave the link tag as-is if fetch fails
    }
  });

  const imgJobs = [...html.matchAll(IMG_TAG_RE)].map(async ([fullTag, src]) => {
    const imgPath = localAssetProjectPath(dir, src);
    if (imgPath === null) return;
    try {
      const data = await fetchOnce(projectName, imgPath);
      if (data.type === "image" && data.dataUrl) {
        html = html.replace(fullTag, () => rewriteImgSrc(fullTag, data.dataUrl));
      }
    } catch {
      // leave the img tag as-is if fetch fails
    }
  });

  const iframeJobs = [...html.matchAll(IFRAME_TAG_RE)].map(async ([fullTag, src]) => {
    const nestedPath = localAssetProjectPath(dir, src);
    if (nestedPath === null) return;
    try {
      const data = await fetchOnce(projectName, nestedPath);
      if (data.type === "text" && data.content) {
        // 嵌套文档内的相对引用基于嵌套文档自身目录。
        const nestedDir = nestedPath.includes("/")
          ? nestedPath.slice(0, nestedPath.lastIndexOf("/") + 1)
          : "";
        const nested =
          depth < INLINE_NESTED_HTML_MAX_DEPTH
            ? await inlineLocalHtmlAssets(data.content, {
                dir: nestedDir,
                projectName,
                // 透传 fetchOnce：嵌套树与外层共享去重。
                fetchPreview: fetchOnce,
                depth: depth + 1,
              })
            : data.content;
        html = html.replace(fullTag, () => rewriteIframeSrcdoc(fullTag, nested));
      } else if (data.type === "image" && data.dataUrl) {
        html = html.replace(fullTag, () => rewriteSrcAttr(fullTag, data.dataUrl));
      }
    } catch {
      // leave the iframe tag as-is if fetch fails
    }
  });

  // 静态图标水合：文档引用的 icons.js（window.ICONS 格式）在 sandbox 禁脚本下
  // 不再水合 data-icon 占位 → 图标空白。fetch 脚本后静态替换占位（见上方注释）。
  // jobs 从 segments 收集——script 标签已随段剥出，水合目标本来就是正文占位。
  const iconScriptJobs = segments.flatMap((seg) =>
    [...seg.matchAll(ICON_SCRIPT_TAG_RE)].map(async ([, src]) => {
      const jsPath = localAssetProjectPath(dir, src);
      if (jsPath === null) return;
      try {
        const data = await fetchOnce(projectName, jsPath);
        if (data.type !== "text" || !data.content) return;
        const icons = parseWindowIcons(data.content);
        if (!icons) return;
        html = hydrateDataIconPlaceholders(html, icons);
      } catch {
        // leave data-icon placeholders as-is if fetch fails
      }
    }),
  );

  await Promise.all([...stylesheetJobs, ...imgJobs, ...iframeJobs, ...iconScriptJobs]);
  // 回填剥出的 style/script 段（占位 = NUL + index + NUL，正常 HTML 文档不含 NUL）。
  return html.replace(/\uE000(\d+)\uE000/g, (_, i: string) => segments[Number(i)]);
}

export function CodeEditorFallback() {
  const { t } = useT();
  // 画布与 CodeEditor 根同款（bg-codeblock 全幅）——lazy 加载就位瞬间零跳变。
  return (
    <div className="flex flex-1 items-center justify-center bg-codeblock">
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
  // 内联产物缓存（key = preview 引用）：source↔render 切换、staleTime=0 refetch 未换
  // 引用时复用，不重跑内联管道（img/css/iframe 逐个 fetch 的量级不小）。引用变了
  //（内容真变）才重跑。
  const inlinedRef = useRef<{
    html: Promise<string>;
    preview: ProjectFilePreviewResponse;
  } | null>(null);

  useEffect(() => {
    if (preview.type !== "text" || renderMode !== "render") {
      setInlinedHtml(null);
      return;
    }
    let cancelled = false;
    let promise = inlinedRef.current?.preview === preview ? inlinedRef.current.html : null;
    if (!promise) {
      const dir = preview.path.includes("/")
        ? preview.path.slice(0, preview.path.lastIndexOf("/") + 1)
        : "";
      const fetchPreview: InlinePreviewFetcher = async (projectName, path) => {
        const res = await fetch(previewUrl(projectName, path));
        if (!res.ok) throw new Error(`preview ${path}: ${res.status}`);
        return (await res.json()) as ProjectFilePreviewResponse;
      };
      promise = inlineLocalHtmlAssets(preview.content, {
        dir,
        projectName: preview.projectName,
        fetchPreview,
      });
      inlinedRef.current = { html: promise, preview };
    }

    void promise
      .then((html) => {
        if (!cancelled) setInlinedHtml(html);
      })
      .catch(() => {
        // 整体兜底：内联管道抛错退回原文渲染（相对引用保持原样）。
        if (!cancelled) setInlinedHtml(preview.content);
      });
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
      // 上下 10px = 03q2 .ed / 03q .code 的 padding:10px 0（水平 0——编辑器画布全幅，
      // 左缘留白由 .cm-content padding 承担）。
      <div className="flex min-h-0 flex-1 flex-col py-2.5">
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
 * `FileCrumb.onNavigate` 传的 segmentPath 已是完整格式，直接调 `goToPath`。
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
  /**
   * 隐藏内部地址栏行（v1.6 全局文件一级页：行2 = FileCrumb + 收缩搜索钮由容器承载——
   * crumb 上移合并进行2，避免双地址栏）。默认 false（桌面左栏/inspection 零变化）。
   */
  hideCrumbHeader?: boolean;
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
  hideCrumbHeader = false,
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

  // 换文件重置 renderMode 由 useFileEditor hook 内承担（2026-09-30 下沉，原调用方 effect 退役）。

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
      {/* 批 11 真同构 2c：容器 px-3 移除——两侧 .frow 贴边统一 = 行自身 16px（v2-primitives
          单源；此前全局侧 12+16=28px vs 工具侧 16px，用户实测「贴边间距不同」）。
          [data-desktop-inspector] 桌面密度分档（7px 14px）保留不动（2026-09-29 真机拍板）。 */}
      <div className="flex flex-1 min-h-0 flex-col overflow-y-auto pb-3 max-lg:!pb-[var(--shell-mobile-bottom-nav-space,0px)]">
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

  // md 内链容器接线（批 13 反馈⑤ review P1：检视预览此前漏接 MarkdownLinkContext——渲染态
  // 相对 .md 链接是死链）。Provider 罩 previewPanel，基准 = 当前预览文件（selectedFilePath，
  // 项目相对路径），目标经 onOpenFile 既有打开通道（inspection 模式调用方即 FilesToolTab /
  // workbench-tab-plugin 全局语境——后者不传 onOpenFile，value=null 保持浏览器默认，已知限制）。
  // useMemo 防每次 render 新箭头造成 context churn（同 P2-4 教训）。
  const mdLinkOpen = useMemo(
    () =>
      onOpenFile && effectiveProjectName && selectedFilePath !== undefined
        ? (href: string) =>
            onOpenFile(effectiveProjectName, resolveRelativeFilePath(selectedFilePath, href))
        : null,
    [onOpenFile, effectiveProjectName, selectedFilePath],
  );
  const previewPanel = (
    <MarkdownLinkContext.Provider value={mdLinkOpen}>
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
    </MarkdownLinkContext.Provider>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col sm:overflow-hidden">
      <div
        className={`shrink-0 border-b border-on-surface/5 py-1.5 ${hideCrumbHeader ? "hidden" : isPreviewOpen ? "hidden sm:block" : "block"}`}
      >
        <div
          className="flex min-h-[2.125rem] min-w-0 items-center justify-between gap-3"
          // 内容高 34px = ViewSwitcher 行（h-7 按钮 + p-0.5 border 外壳），使 files header 行
          // 总高 47px 与总览 ViewSwitcher 行一致（批 Q 点 4 收尾：原本 min-h-7=28 → 41px 独树一帜）。
        >
          {/* 批 11 真同构：地址栏收敛 FileCrumb 单源（v1 遗留 PathBreadcrumb 🏠+斜杠段钮
              退役）。根段可访问名 = 项目名 / 根层「服务器根」；根段图标 = project（SF 名
              契约 folder 形状）——与 FilesToolPanel .crumb 同一份 DOM。diverge 记档：原型
              全局文件页无 crumb（.sfield 搜索框），用户同构要求优先。 */}
          <FileCrumb
            onNavigate={goToPath}
            // 根段 aria-label = 导航目的地（恒服务器根），不随当前层级变——项目层级时
            // 根段点击也是回根（design-review 批 11：同名不同目的地对读屏误导）。
            rootLabel={t("files.root")}
            segments={currentPath ? currentPath.split("/") : []}
          />
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
