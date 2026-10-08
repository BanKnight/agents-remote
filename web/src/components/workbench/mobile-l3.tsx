import type {
  GitBranch,
  GitCommitLogItem,
  GitDiffScope,
  ProjectFilePreviewResponse,
} from "@agents-remote/shared";
import { undo, redo } from "@codemirror/commands";
import { EditorView } from "@uiw/react-codemirror";
import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { useSetAtom } from "jotai";
import {
  forwardRef,
  lazy,
  Suspense,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  getProjectGitCommitDetail,
  getProjectGitCommitFileDiff,
  getProjectGitFileDiff,
  getProjectGitLog,
  listAgentSessions,
  listProjectGitBranches,
  listProjectGitDiff,
  sendProjectSessionMessage,
} from "../../api/client";
import { CodeEditorFallback, FileSaveButton, PreviewBody } from "../files/file-browser";
import { ImageViewer } from "../files/image-viewer";
import { RenderModeToggle } from "../files/render-mode-toggle";
import { useFileEditor, useFilePreview } from "../files/use-file-editor";
import { useConfirm } from "../shell/confirm-dialog";
import { MarkdownString } from "../markdown/MarkdownString";
import { useT } from "../../i18n";
import { ListRowSkeleton, LoadingBlock } from "../shell/shell-primitives";
import { ActionMenu, type ActionMenuItem } from "../ui/action-menu";
import { WIKI_QUERY_SCOPE, useWikiIndex, useWikiPage } from "../../hooks/wiki";
import { relativeTime } from "./history-list";
import { ShellIcon } from "../shell/icons";
import {
  WORKBENCH_GIT_TAB_QUERY_SCOPE,
  DiffContent,
  formatAheadBehind,
  gitDiffListQueryKey,
  gitFileDiffQueryKey,
  statusShortLabel,
} from "../git/git-diff-viewer";
import { workbenchWikiRefsAtom } from "../../routes/workbench-model";
import { formatBytes } from "@/lib/format";

// CodeEditor 重依赖 CodeMirror（~75KB+），与 FilesPanel 同款 lazy 拆包（编辑态才拉）。
const CodeEditor = lazy(() =>
  import("../files/CodeEditor").then((m) => ({ default: m.CodeEditor })),
);

/**
 * 移动 L3 详情页主体（v2 M4，对标 03q/03r/03t/03u/03v/03s）。nav 形态（back label/标题/⋯）
 * 由 MobileProjectHeader 的 l3 prop 承担，本文件只渲染 nav 下方主体（各组件自带滚动容器）。
 * file/git focus 两页由保活层按 ref.kind 分流挂载（写 layout，进保活）；git history/commit/
 * branches 与 wiki 阅读页是显式子路由（不写 layout，廉价重建）。
 */

// ── 03q 文件预览（L3）────────────────────────────────────────────────────────

/**
 * 扩展名 → .fmeta 类型段标签（workspace-preview 原型英文常量：zh/en 页一致，不走 i18n）。
 * 未知扩展名兜底 = 大写扩展名（.yaml → YAML）；无扩展名 = 大写 basename。
 */
export function fileTypeLabel(name: string): string {
  const base = name.split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return base.toUpperCase();
  const ext = base.slice(dot + 1).toLowerCase();
  switch (ext) {
    case "ts":
    case "tsx":
    case "mts":
    case "cts":
      return "TypeScript";
    case "js":
    case "mjs":
    case "cjs":
    case "jsx":
      return "JavaScript";
    case "md":
    case "markdown":
    case "mdx":
      return "Markdown";
    case "html":
    case "htm":
      return "HTML";
    case "css":
    case "scss":
    case "sass":
      return "CSS";
    case "json":
    case "jsonc":
      return "JSON";
    case "sh":
    case "bash":
    case "zsh":
    case "fish":
      return "Shell";
    case "py":
      return "Python";
    case "go":
      return "Go";
    case "rs":
      return "Rust";
    default:
      return ext.toUpperCase();
  }
}

/** image mediaType → 类型标签（image/png → PNG；异常形态兜底 IMAGE）。 */
export function mediaTypeLabel(mediaType: string): string {
  return (mediaType.split("/")[1] ?? "image").toUpperCase();
}

/**
 * .fmeta 左段（类型·度量）派生：text 源码态 = 行数、md/html 渲染态 = size；image =
 * 宽×高（解码就绪前回落 size）；unsupported/too_large = size（类型 = Binary/扩展名标签）。
 * 更新段独立拼（仅 text 分支有 mtimeMs——v1.5 服务端 preview 响应仅 text 携带，
 * image/unsupported 省略更新段，不伪造数据）。
 */
export function paneFmetaText(
  data: ProjectFilePreviewResponse,
  opts: { renderView: boolean; lineCountLabel: string; imgDims: { w: number; h: number } | null },
): { typeLabel: string; metric: string } {
  const typeLabel = data.type === "unsupported" ? "Binary" : fileTypeLabel(data.name);
  if (data.type === "text") {
    return {
      typeLabel,
      metric: opts.renderView ? formatBytes(data.size) : opts.lineCountLabel,
    };
  }
  if (data.type === "image") {
    return {
      typeLabel,
      metric: opts.imgDims ? `${opts.imgDims.w}×${opts.imgDims.h}` : formatBytes(data.size),
    };
  }
  return { typeLabel, metric: formatBytes(data.size) };
}

export type MobileL3FilePreviewProps = {
  projectName: string;
  /** 项目相对路径。 */
  path: string;
  /** 「查看 diff ›」→ git file focus（M4 L3 diff 呈现）。 */
  onViewDiff: () => void;
};

/**
 * 03q 文件预览页（批次 3 编辑能力下沉：右栏 Inspector 与移动 focus 双端同构单源）。meta 行
 *（N 行 · 更新 relative + 编辑 + 「查看 diff ›」）+ 只读源码（CodeEditor editable=false，
 * 与编辑态同画布——反馈④b：源码⇄渲染⇄编辑切换零跳变）；「编辑」进编辑态（CodeEditor
 * + FileSaveButton + ⌘S，保存/dirty 丢弃确认走 useFileEditor 单源，与 FilesPanel inspection
 * 同 query key 共享缓存）。image → ImageViewer；too_large/unsupported → .cap 简要说明。⋯ 菜单
 *（复制路径/在 Git 中查看 diff）由调用方经 header l3.actions 装配。
 */
export function MobileL3FilePreview({ projectName, path, onViewDiff }: MobileL3FilePreviewProps) {
  const { t } = useT();
  const { confirm, holder: confirmHolder } = useConfirm();
  // 编辑态（组件内局部；切文件即退出——下方 effect 与 hook 清草稿同步）。
  const [editing, setEditing] = useState(false);
  useEffect(() => setEditing(false), [path]);
  // editable 随 editing 切：非编辑态 canEdit 恒 false（⌘S no-op）。renderMode 由 hook 按文件
  // 名派生默认（md/html → render，换文件随 hook 重置——2026-09-30 用户反馈「可预览的优先
  // 展示预览效果」：md/html 打开即渲染，与桌面 FilePreviewPanel 同款；检视面板 file 标签
  // PanelFileTabBody 与移动 L3 双端同源）。
  // 点「编辑」时先 setRenderMode("source")——md/html render 态的 canEdit gate 要求 source，
  // 且「完成」后回到渲染态（预览优先）。
  const editor = useFileEditor({
    editable: editing,
    path,
    projectName,
    queryScope: "files",
  });

  if (editor.preview.isLoading) {
    return <LoadingBlock className="min-h-0 flex-1" label={t("files.loadingPreview")} />;
  }
  if (editor.preview.isError || !editor.previewData) {
    return <div className="cap mt-4 px-4">{t("files.previewError")}</div>;
  }
  const data = editor.previewData;

  // 非 text 类型：image → ImageViewer（缩放/旋转/双击手势工具条）；too_large/unsupported →
  // .cap 简要说明。三类都带 data-role 根（预览态语义一致，调用方锚点稳定）。confirmHolder
  // 只在 text 分支渲染（丢弃确认仅编辑态可达，image/cap 分支进不了编辑态）。
  if (data.type === "image") {
    return (
      <div className="flex min-h-0 flex-1 flex-col" data-role="l3-file-preview">
        <ImageViewer alt={data.name} downloadName={data.name} src={data.dataUrl} />
      </div>
    );
  }
  if (data.type !== "text") {
    return (
      <div className="flex min-h-0 flex-1 flex-col" data-role="l3-file-preview">
        <div className="cap mt-4 px-4">
          {data.type === "too_large"
            ? t("files.tooLarge", { limit: formatBytes(data.limitBytes) })
            : t("files.unsupported")}
        </div>
      </div>
    );
  }
  const lineCount = data.content.split("\n").length;
  // mtimeMs 契约 optional（shared ProjectFilePreviewResponse）——缺省不显更新段而非崩预览。
  const updated = data.mtimeMs ? relativeTime(new Date(data.mtimeMs).toISOString(), t) : "";
  // 完成编辑：dirty 时丢弃确认（与 FilesPanel 换文件守卫同款 dialog 文案）。确认后回渲染
  // 态（预览优先——「完成」= 结束一次编辑动作，回到 md/html 的默认阅读形态；源码再点
  // toggle）。renderMode 仅 md/html（showRenderToggle）消费——非 md/html 不写脏 state。
  const finishEditing = () => {
    const backToRender = () => {
      setEditing(false);
      if (editor.showRenderToggle) editor.onRenderModeChange("render");
    };
    if (!editor.isDirty) {
      backToRender();
      return;
    }
    void confirm({
      title: t("files.discard"),
      message: t("files.discardConfirm", { name: data.name }),
      cancelLabel: t("cancel"),
      confirmLabel: t("files.discard"),
      tone: "default",
    }).then((ok) => {
      if (ok) backToRender();
    });
  };

  // md/html 渲染态（showRenderToggle gate：非 md/html 恒源码形态）根 overflow-hidden——
  // 渲染内容自滚（MarkdownString 容器 overflow-auto / iframe 内文档滚动），meta 行常驻。
  const isRenderView = editor.showRenderToggle && editor.renderMode === "render";

  return (
    <div
      className={`flex min-h-0 flex-1 flex-col pb-[max(16px,var(--shell-mobile-bottom-nav-space,0px))] ${editing || isRenderView ? "overflow-hidden" : "overflow-y-auto"}`}
      data-role="l3-file-preview"
    >
      {editing ? (
        // 编辑态操作行：保存（FileSaveButton 统一样式，禁用/保存中/已保存三态）+ 完成。
        // 双按钮包进单个 .diff 容器（auto margin 每份平分剩余空间——两个 .diff 会把首钮
        // 悬在行中部，design-review 批次 3）；裸文本钮加 after 纵向隐形扩区（铁律 9 触达）。
        <div className="meta">
          <span className="diff flex items-center gap-3">
            <FileSaveButton
              isDirty={editor.isDirty}
              isPending={editor.isSaving}
              onSave={editor.handleSave}
              savedFlash={editor.savedFlash}
            />
            <button
              className="relative cursor-pointer after:absolute after:inset-x-0 after:-inset-y-2.5 after:content-['']"
              onClick={finishEditing}
              type="button"
            >
              {t("files.done")}
            </button>
          </span>
        </div>
      ) : (
        <div className="meta">
          {/* md/html：源码/渲染 toggle（03q3 .mseg 单源 RenderModeToggle，渲染段在前）+
              元信息行并存（原型 :50——渲染态行数无意义只留时间，源码态行号在旁自明）；
              非 md/html 恒 previewMetaLines（原形态）。 */}
          {editor.showRenderToggle ? (
            <>
              <span>
                {/* mtimeMs 缺省（契约 optional）→ 只修行数，不显「· 更新 」空尾段 */}
                {editor.renderMode === "render"
                  ? updated
                  : updated
                    ? t("files.previewMetaLines", { n: lineCount, time: updated })
                    : t("files.lineCount", { n: lineCount })}
              </span>
              <RenderModeToggle
                className="ml-auto"
                mode={editor.renderMode}
                onChange={editor.onRenderModeChange}
              />
            </>
          ) : (
            <span>
              {updated
                ? t("files.previewMetaLines", { n: lineCount, time: updated })
                : t("files.lineCount", { n: lineCount })}
            </span>
          )}
          <span className="diff flex items-center gap-3">
            <button
              className="relative cursor-pointer after:absolute after:inset-x-0 after:-inset-y-2.5 after:content-['']"
              onClick={() => {
                // render 态点编辑：先切源码（md/html render 态 canEdit gate 恒 false——
                // 保存会被 hook 拦），编辑器与检视面板 source 态同形态。
                editor.onRenderModeChange("source");
                setEditing(true);
              }}
              type="button"
            >
              {t("files.edit")}
            </button>
            <button
              className="relative cursor-pointer after:absolute after:inset-x-0 after:-inset-y-2.5 after:content-['']"
              onClick={onViewDiff}
              type="button"
            >
              {t("git.menuViewDiff")} ›
            </button>
          </span>
        </div>
      )}
      {editing ? (
        // CodeEditor 根自带 relative+flex-1（内部 absolute 高度链，frontend-notes §8）；
        // 编辑态根 overflow-hidden 给确定高度。py-2.5 = 03q2 .ed 的 padding:10px 0（画布全幅）。
        <div className="flex min-h-0 flex-1 flex-col py-2.5">
          <Suspense fallback={<CodeEditorFallback />}>
            <CodeEditor name={data.name} onChange={editor.onEditChange} value={editor.editValue} />
          </Suspense>
        </div>
      ) : isRenderView ? (
        // 渲染态 = PreviewBody 单源（md → MarkdownString / html → sandbox iframe + 本地资源
        // 内联），与检视面板/中栏 file tab 同一渲染器（onEditChange 不传 = 只读）。
        <PreviewBody editValue="" preview={data} renderMode="render" />
      ) : (
        // 源码态 = CodeEditor 只读（反馈④b：与编辑态同一画布，切换不再跳样式）。外层
        // py-2.5 同编辑态容器（画布上下 10px 由调用方承担，frontend-notes §8 高度链——
        // flex-1 子要滚，父是 flex container；CodeMirror 内滚）。
        <div className="flex min-h-0 flex-1 flex-col py-2.5">
          <Suspense fallback={<CodeEditorFallback />}>
            <CodeEditor editable={false} name={data.name} value={data.content} />
          </Suspense>
        </div>
      )}
      {confirmHolder}
    </div>
  );
}

// ── v1.5 批3 文件预览面板（03m/03p 面板标签容器与 10m push 容器共用主体）──────

/** 容器收尾动作句柄（nav 模式容器经 handle 调 finish/discard——push 编辑态 nav [放弃][完成]）。 */
export type FilePreviewPaneHandle = {
  finish: () => void;
  discard: () => void;
};

export type FilePreviewPaneProps = {
  projectName: string;
  /** 项目相对路径。 */
  path: string;
  /** query 命名空间（保存后失效联动调用方列表；容器 ⋯ 菜单同 key dedupe）。 */
  queryScope: string;
  /** 受控编辑态（容器持有——面板 editingTabId 单例守门 / push 容器本地 state）。 */
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  /** 编辑态动作位置：meta = .emeta fact 放弃/完成；nav = push nav [放弃][完成]（容器渲染）。 */
  editingActions: "meta" | "nav";
  /** 容器分档（v1.5 批 4，spec §4.5 预览矩阵）：mobile = 面板/push（底部 safe-area 让位 +
   * .aux 收起键盘钮）；desktop = 中栏 tab/主区推入态（无移动底部空间，aux 仅撤销/重做——
   * 05h4 原型 .pvaux 两钮）。缺省 mobile（存量调用零改动）。 */
  variant?: "mobile" | "desktop";
};

/**
 * v1.5 预览矩阵·移动：文件预览主体单源（面板标签 / push 容器共用）。预览态 = .fmeta
 *（左 = 类型·度量·更新时间；右端 = MD/HTML 渲染⇄源码 segc.mini）+ CodeEditor 只读源码
 * / PreviewBody 渲染 / ImageViewer 图片 / .unsupported 空态；编辑态 = .emeta
 *（编辑中·行数 + ● 未保存变更 + fact 放弃/完成）+ CodeEditor + .aux（撤销/重做/收起键盘，
 * @codemirror/commands view 命令）。finish = dirty 即保存并退出编辑（回渲染态）；discard =
 * dirty 弹确认（files.discardConfirm）后清草稿退出。
 */
export const FilePreviewPane = forwardRef<FilePreviewPaneHandle, FilePreviewPaneProps>(
  function FilePreviewPane(
    { projectName, path, queryScope, editing, onEditingChange, editingActions, variant = "mobile" },
    ref,
  ) {
    const { t } = useT();
    const { confirm, holder: confirmHolder } = useConfirm();
    const editor = useFileEditor({ editable: editing, path, projectName, queryScope });
    const data = editor.previewData;
    // 编辑器实例（aux 三钮消费；退出编辑时清空——下方 effect）。
    const [editorView, setEditorView] = useState<EditorView | null>(null);
    // handle 内部镜像（editingActions="meta" 的 fact 钮消费——useImperativeHandle 工厂
    // 每次 render 同步同一对象，meta 钮与外部 ref 驱动同一 finish/discard 闭包）。
    const mirrorHandleRef = useRef<FilePreviewPaneHandle | null>(null);
    // image 度量（原型 1280×640）：dataUrl 解码后回填，加载前/失败回落 size。
    const [imgDims, setImgDims] = useState<{ w: number; h: number } | null>(null);
    useEffect(() => {
      if (data?.type !== "image") {
        setImgDims(null);
        return;
      }
      setImgDims(null);
      let alive = true;
      const img = new Image();
      img.onload = () => {
        if (alive) setImgDims({ w: img.naturalWidth, h: img.naturalHeight });
      };
      img.src = data.dataUrl;
      return () => {
        alive = false;
      };
    }, [data]);
    // 进编辑先切源码（md/html render 态 canEdit gate 要求 source；退出编辑清 editorView——
    // 编辑器 unmount；finish/discard 已统一回 render）。
    useEffect(() => {
      if (editing) {
        editor.onRenderModeChange("source");
      } else {
        setEditorView(null);
      }
      // onRenderModeChange 是 setState（引用稳定），列 editing 即覆盖。
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editing]);
    // 容器收尾动作（无依赖数组 = 每次 render 重建闭包，handle 拿最新 editor 态）。
    // 不能依赖 useImperativeHandle 的工厂执行——ref 为 null（meta 模式面板容器不传 ref）时
    // React 短路 factory：内部 fact 钮的镜像 handle 就会永远 null。因此 handle 由普通
    // render 期构造 + effect 同步镜像；useImperativeHandle 只承担外部 ref 通道。
    const paneHandle: FilePreviewPaneHandle = {
      finish: () => {
        if (editor.isSaving) return;
        if (editor.isDirty) editor.handleSave();
        onEditingChange(false);
        if (editor.showRenderToggle) editor.onRenderModeChange("render");
      },
      discard: () => {
        const exit = () => {
          editor.onEditChange(undefined);
          if (editor.showRenderToggle) editor.onRenderModeChange("render");
          onEditingChange(false);
        };
        if (!editor.isDirty) {
          exit();
          return;
        }
        void confirm({
          title: t("files.discard"),
          message: t("files.discardConfirm", { name: data?.name ?? path }),
          cancelLabel: t("cancel"),
          confirmLabel: t("files.discard"),
          tone: "default",
        }).then((ok) => {
          if (ok) exit();
        });
      },
    };
    useEffect(() => {
      mirrorHandleRef.current = paneHandle;
    });
    // 外部 ref 通道（nav 模式容器的 finish/discard 入口）；工厂引用同一 paneHandle。
    useImperativeHandle(ref, () => paneHandle);
    // ── .fmeta 派生（text 分支消费 updated/lineLabel；非 text 分支复用 paneFmetaLine）──
    // renderView = md/html 渲染态（metric 段换 size；更新段仅 text 有 mtimeMs 可显）。
    const lineCount = data?.type === "text" ? data.content.split("\n").length : 0;
    const updated =
      data?.type === "text" && data.mtimeMs
        ? relativeTime(new Date(data.mtimeMs).toISOString(), t)
        : "";
    const isRenderView =
      data?.type === "text" && editor.showRenderToggle && editor.renderMode === "render";
    const paneFmetaText0 = data
      ? paneFmetaText(data, {
          renderView: isRenderView,
          lineCountLabel: t("files.lineCount", { n: lineCount }),
          imgDims,
        })
      : null;
    const paneFmetaLine = paneFmetaText0
      ? `${paneFmetaText0.typeLabel} · ${paneFmetaText0.metric}${
          data?.type === "text" && updated ? ` · ${t("files.metaUpdated", { time: updated })}` : ""
        }`
      : "";

    if (editor.preview.isLoading) {
      return <LoadingBlock className="min-h-0 flex-1" label={t("files.loadingPreview")} />;
    }
    if (editor.preview.isError || !data) {
      return <div className="cap mt-4 px-4">{t("files.previewError")}</div>;
    }
    // 非 text 分支：image = fmeta + ImageViewer；unsupported = fmeta + .unsupported 空态
    //（原型 Binary 页：文档图标 + 标题 + 两行说明）；too_large = fmeta + .cap（原型无锚，
    // 保持简述，diverge 记档）。三类根都带 data-role 语义锚。
    if (data.type === "image") {
      return (
        <div
          className={`flex min-h-0 flex-1 flex-col ${variant === "desktop" ? "fdesktop" : ""}`}
          data-role="file-preview-pane"
        >
          <div className="fmeta">
            <span>{paneFmetaLine}</span>
          </div>
          <ImageViewer alt={data.name} downloadName={data.name} src={data.dataUrl} />
        </div>
      );
    }
    if (data.type === "unsupported") {
      return (
        <div
          className={`flex min-h-0 flex-1 flex-col ${variant === "desktop" ? "fdesktop" : ""}`}
          data-role="file-preview-pane"
        >
          <div className="fmeta">
            <span>{paneFmetaLine}</span>
          </div>
          <div className="unsupported">
            <div className="big">
              <ShellIcon name="file" />
            </div>
            <div className="t">{t("files.unsupportedTitle")}</div>
            <div className="d">{t("files.unsupportedDesc")}</div>
          </div>
        </div>
      );
    }
    if (data.type === "too_large") {
      return (
        <div
          className={`flex min-h-0 flex-1 flex-col ${variant === "desktop" ? "fdesktop" : ""}`}
          data-role="file-preview-pane"
        >
          <div className="fmeta">
            <span>{paneFmetaLine}</span>
          </div>
          <div className="cap mt-4 px-4">
            {t("files.tooLarge", { limit: formatBytes(data.limitBytes) })}
          </div>
        </div>
      );
    }
    // text 分支（编辑/渲染/源码三态）。desktop 档去移动底部 safe-area 让位（中栏/主区推入态
    // 无 bottom nav，05h 原型四边贴容器）。编辑态去 pb——.aux 是末子元素且自带
    // env(safe-area-inset-bottom) 单层避让（frontend-notes §1），pb 会把 aux 抬离屏底悬空。
    return (
      <div
        className={`flex min-h-0 flex-1 flex-col ${variant === "desktop" ? "fdesktop" : ""} ${variant === "desktop" || editing ? "" : "pb-[max(16px,var(--shell-mobile-bottom-nav-space,0px))]"} ${editing || isRenderView ? "overflow-hidden" : "overflow-y-auto"}`}
        data-role="file-preview-pane"
      >
        {editing ? (
          <>
            {/* .emeta 事实行：fdim（编辑中·行数）+ dirty（● 未保存变更）恒渲染；fact
            （放弃/完成）仅 meta 模式——nav 模式（push/l3Transient）上移 nav [放弃][完成]。 */}
            <div className="emeta">
              <span className="fdim">{t("files.editingMeta", { n: lineCount })}</span>
              {editor.isDirty ? <span className="dirty">● {t("files.unsavedChanges")}</span> : null}
              {editingActions === "meta" ? (
                <span className="fact">
                  <button
                    className="giveup cursor-pointer"
                    onClick={() => mirrorHandleRef.current?.discard()}
                    type="button"
                  >
                    {t("files.discard")}
                  </button>
                  <button
                    className="cursor-pointer"
                    onClick={() => mirrorHandleRef.current?.finish()}
                    type="button"
                  >
                    {t("files.done")}
                  </button>
                </span>
              ) : null}
            </div>
            <div className="flex min-h-0 flex-1 flex-col py-2.5">
              <Suspense fallback={<CodeEditorFallback />}>
                <CodeEditor
                  name={data.name}
                  onCreateEditor={setEditorView}
                  onChange={editor.onEditChange}
                  value={editor.editValue}
                />
              </Suspense>
            </div>
            <div className="aux">
              <button
                disabled={!editorView}
                onClick={() => {
                  if (editorView) undo(editorView);
                }}
                type="button"
              >
                ↩ {t("files.auxUndo")}
              </button>
              <button
                disabled={!editorView}
                onClick={() => {
                  if (editorView) redo(editorView);
                }}
                type="button"
              >
                ↪ {t("files.auxRedo")}
              </button>
              {/* desktop 档无软键盘收起诉求（05h4 原型 .pvaux 仅撤销/重做两钮）。 */}
              {variant === "desktop" ? null : (
                <button onClick={() => editorView?.contentDOM.blur()} type="button">
                  ⌄ {t("files.auxDismissKeyboard")}
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="fmeta">
              <span>{paneFmetaLine}</span>
              {editor.showRenderToggle ? (
                <span className="fright">
                  <RenderModeToggle
                    mini
                    mode={editor.renderMode}
                    onChange={editor.onRenderModeChange}
                  />
                </span>
              ) : null}
            </div>
            {isRenderView ? (
              <PreviewBody editValue="" preview={data} renderMode="render" />
            ) : (
              // 源码态 = CodeEditor 只读（反馈④b：与编辑态同画布 + 同 py-2.5 外层容器）。
              <div className="flex min-h-0 flex-1 flex-col py-2.5">
                <Suspense fallback={<CodeEditorFallback />}>
                  <CodeEditor editable={false} name={data.name} value={data.content} />
                </Suspense>
              </div>
            )}
          </>
        )}
        {confirmHolder}
      </div>
    );
  },
);

/**
 * v1.5 批3：文件预览 ⋯ 菜单（nav 右端容器级——同屏单 ⋯ 由容器保证）。useFilePreview 与
 * Pane 同 queryKey dedupe（零额外网络）。菜单项按 preview 类型收敛（原型 workspace-preview
 * / files-global-preview ⋯ 规格）：复制内容（text）/ 复制路径（全部）/ 查看 diff（text 且
 * 容器提供 onViewDiff）/ 另存为…（image，dataUrl 触发下载）。
 */
export function FilePreviewNavMenu({
  projectName,
  path,
  queryScope,
  onViewDiff,
  onOpenInWorkbench,
  triggerClassName = "ic cursor-pointer",
}: {
  projectName: string;
  path: string;
  queryScope: string;
  onViewDiff?: () => void;
  /** 桌面全局文件推入态专属（10m2 ②）：切工作台并自动打开中栏文件标签；其余容器不传。 */
  onOpenInWorkbench?: () => void;
  /** 触发钮 class（桌面 tabstrip 右端 = 与 tabstrip 结构钮同形制 h-6 w-6；缺省
   * 移动 .ic 形制。⋯ 图标 = ShellIcon 默认 size-4 16px，file/wiki 两消费点同档）。 */
  triggerClassName?: string;
}) {
  const { t } = useT();
  const { data } = useFilePreview(projectName, path, queryScope);
  const items: ActionMenuItem[] = [];
  if (data?.type === "text") {
    items.push({
      label: t("files.menuCopyContent"),
      icon: <ShellIcon className="size-[17px]" name="file" />,
      onSelect: () => {
        void navigator.clipboard.writeText(data.content);
      },
    });
  }
  items.push({
    label: t("files.menuCopyPath"),
    icon: <ShellIcon className="size-[17px]" name="project" />,
    onSelect: () => {
      void navigator.clipboard.writeText(path);
    },
  });
  if (data?.type === "text" && onViewDiff) {
    items.push({
      label: t("git.menuViewDiff"),
      icon: <ShellIcon className="size-[17px]" name="git-nav" />,
      onSelect: onViewDiff,
    });
  }
  if (data?.type === "image") {
    items.push({
      label: t("files.menuSaveAs"),
      icon: <ShellIcon className="size-[17px]" name="download" />,
      onSelect: () => {
        const a = document.createElement("a");
        a.href = data.dataUrl;
        a.download = data.name;
        a.click();
      },
    });
  }
  // 「在工作台打开」恒最末（spec §4.5 列举序 [复制路径, 另存为…, 在工作台打开]；text 推入态
  // 无前两者时序不变）。reviewer P2-1：原置于复制路径后，image 推入态顺序错。
  if (onOpenInWorkbench) {
    items.push({
      label: t("files.menuOpenInWorkbench"),
      icon: <ShellIcon className="size-[17px]" name="split" />,
      onSelect: onOpenInWorkbench,
    });
  }
  return (
    <ActionMenu
      align="end"
      cancelLabel={t("cancel")}
      items={items}
      trigger={
        <button aria-label={t("workbench.moreActions")} className={triggerClassName} type="button">
          <ShellIcon name="ellipsis" />
        </button>
      }
    />
  );
}

/**
 * wiki 阅读页 ⋯ 菜单(全局同构 review 批 A-5 双端单源 + 桌面补齐):此前仅移动面板
 * wikiread 标签手写(复制内容/查看 diff),桌面中栏 wikiread tab 无对应入口。useWikiPage
 * 与阅读器 body 同 queryKey dedupe(零额外网络);page 未热时「复制内容」disabled。
 * 查看 diff = 容器层管道差异留调用方(移动面板 diff 管道 vs 桌面 onOpenGitDiff)。
 */
export function WikiReadNavMenu({
  projectName,
  slug,
  onViewDiff,
  triggerClassName = "ic cursor-pointer",
}: {
  projectName: string;
  slug: string;
  /** 「查看 diff」入口(容器不提供则不渲染该项)。 */
  onViewDiff?: () => void;
  /** 触发钮 class(桌面 tabstrip 右端 = tabstrip 结构钮形制;缺省移动 .ic 形制)。 */
  triggerClassName?: string;
}) {
  const { t } = useT();
  const page = useWikiPage(projectName, slug, WIKI_QUERY_SCOPE);
  const items: ActionMenuItem[] = [
    {
      label: t("files.menuCopyContent"),
      icon: <ShellIcon className="size-[17px]" name="file" />,
      disabled: !page.data,
      onSelect: () => {
        if (page.data) void navigator.clipboard.writeText(page.data.body);
      },
    },
  ];
  if (onViewDiff) {
    items.push({
      label: t("git.menuViewDiff"),
      icon: <ShellIcon className="size-[17px]" name="git-nav" />,
      onSelect: onViewDiff,
    });
  }
  return (
    <ActionMenu
      align="end"
      cancelLabel={t("cancel")}
      items={items}
      trigger={
        <button aria-label={t("workbench.moreActions")} className={triggerClassName} type="button">
          <ShellIcon name="ellipsis" />
        </button>
      }
    />
  );
}

// ── 03r git diff（L3）────────────────────────────────────────────────────────

export type MobileL3GitDiffProps = {
  projectName: string;
  path: string;
  scope: GitDiffScope;
};

/**
 * 03r git 文件 diff 页：meta 行（diffBaseScope「branch ← scope」+ numstat +-/n）+ DiffContent
 * 复用（sticky hunk 导航随带）。query key = gitFileDiffQueryKey 单源，与桌面 GitFileDiffPanel 同 key 共享缓存。
 */
export function MobileL3GitDiff({ projectName, path, scope }: MobileL3GitDiffProps) {
  const { t } = useT();
  const fileDiff = useQuery({
    queryKey: gitFileDiffQueryKey(
      projectName,
      WORKBENCH_GIT_TAB_QUERY_SCOPE,
      "scope",
      scope,
      path,
      false,
    ),
    queryFn: () => getProjectGitFileDiff(projectName, scope, path),
  });
  // numstat join 工作区列表（同 key diff 与 03m/03o 去重）。
  const diffList = useQuery({
    queryKey: gitDiffListQueryKey(projectName),
    queryFn: () => listProjectGitDiff(projectName),
  });
  const branch = diffList.data?.repository === true ? (diffList.data.branch?.name ?? "") : "";
  const summary =
    diffList.data?.repository === true
      ? diffList.data.files.find((f) => f.path === path && f.scope === scope)
      : undefined;

  if (fileDiff.isLoading) {
    return <LoadingBlock className="min-h-0 flex-1" label={t("git.loadingDiff")} />;
  }
  if (fileDiff.isError || !fileDiff.data || fileDiff.data.repository !== true) {
    return <div className="cap mt-4 px-4">{t("git.fileError")}</div>;
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-[max(16px,var(--shell-mobile-bottom-nav-space,0px))]"
      data-role="l3-git-diff"
    >
      <div className="meta">
        <span>
          {t("git.diffBaseScope", {
            base: branch || "HEAD",
            scope: scope === "staged" ? t("git.scopeStaged") : t("git.scopeWorktree"),
          })}
        </span>
        {summary && summary.addedLines !== null && summary.removedLines !== null ? (
          <span className="font-mono">
            <span className="text-success-text">+{summary.addedLines}</span>{" "}
            <span className="text-error">-{summary.removedLines}</span>
          </span>
        ) : null}
      </div>
      <DiffContent diff={fileDiff.data.diff} filePath={path} />
    </div>
  );
}

// ── 03t git 提交历史（L3）────────────────────────────────────────────────────

/** 03t 分页页大小（「加载更早提交」每次追加条数）。 */
const GIT_HISTORY_PAGE_SIZE = 30;

/** YYYY-MM-DD 本地日期串（与服务端 isoDate 同形状，字典序 = 时间序）。 */
const localDateKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** 03t 日期分组（dlg 标题）：今天/昨天/本周（近 7 天）/更早。纯函数便于复用与测试。 */
function dateGroupOf(
  isoDate: string,
  now: Date,
  labels: { today: string; yesterday: string; thisWeek: string; earlier: string },
): string {
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 6);
  if (isoDate === localDateKey(now)) return labels.today;
  if (isoDate === localDateKey(new Date(now.getTime() - 86_400_000))) return labels.yesterday;
  if (isoDate >= localDateKey(weekStart)) return labels.thisWeek;
  return labels.earlier;
}

export type L3GitHistoryProps = {
  projectName: string;
  /** 提交 ref（省略 = 当前分支；分支页跳转带 branch search param）。 */
  branch?: string;
  onOpenCommit: (hash: string) => void;
};

/** 03t 单条提交行：crow（hash + message + relative）+ csub（author）。 */
function HistoryCommitRow({
  commit,
  groupLabel,
  onClick,
}: {
  commit: GitCommitLogItem;
  groupLabel: string | null;
  onClick: () => void;
}) {
  return (
    <>
      {groupLabel !== null ? <div className="dlg">{groupLabel}</div> : null}
      <button className="crow w-full cursor-pointer text-left" onClick={onClick} type="button">
        <span className="h">{commit.hash}</span>
        <span className="m">{commit.message}</span>
        <span className="t">{commit.relativeTime}</span>
      </button>
      <div className="csub">{commit.author}</div>
    </>
  );
}

/**
 * 03t 提交历史页：meta 行（historyMeta「branch · 共 N 次提交」）+ 日期分组（dlg）+ crow/csub
 * 列表 + loadMore（loaded < total 终止判断，offset 分页追加）。branch = "" 表示当前分支。
 */
export function L3GitHistory({ projectName, branch, onOpenCommit }: L3GitHistoryProps) {
  const { t } = useT();
  // offset 分页用 useInfiniteQuery（逐页累积，getNextPageParam = loaded < total 终止判断）。
  // key 用 "log-paged" 段与桌面单页 `git log`（同 key 全量）隔离——limit 分页语义不同不共享。
  // 不加 keepPreviousData（§6.12o review 结论）：两个消费方（workbench-tab-plugin 栈 push、
  // mobile-workbench 恒 HEAD）换 branch 均重挂载，placeholder 按 observer 记忆对重挂载无效，
  // 只剩切项目时短暂跨项目陈旧列表的负作用。
  const log = useInfiniteQuery({
    queryKey: ["projects", projectName, "git", "log-paged", branch ?? ""],
    queryFn: ({ pageParam }) =>
      getProjectGitLog(projectName, branch || undefined, pageParam, GIT_HISTORY_PAGE_SIZE),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((n, p) => n + p.commits.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
  });
  const total = log.data?.pages[0]?.total ?? 0;
  const commits = useMemo(() => log.data?.pages.flatMap((p) => p.commits) ?? [], [log.data]);

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-[max(16px,var(--shell-mobile-bottom-nav-space,0px))]"
      data-role="l3-git-history"
    >
      {log.isPending ? (
        // 首载骨架（§6.12o）：防 meta 行显「HEAD · 共 0 次提交」伪态；后台刷新不进来。
        <ListRowSkeleton count={4} marker={false} />
      ) : (
        <>
          <div className="meta">
            <span>{t("git.historyMeta", { branch: branch || "HEAD", n: total })}</span>
          </div>
          {commits.map((commit, i) => {
            const group =
              i === 0 || commits[i - 1]!.isoDate !== commit.isoDate
                ? dateGroupOf(commit.isoDate ?? "", new Date(), {
                    today: t("git.dlgToday"),
                    yesterday: t("git.dlgYesterday"),
                    thisWeek: t("git.dlgThisWeek"),
                    earlier: t("git.dlgEarlier"),
                  })
                : null;
            return (
              <HistoryCommitRow
                commit={commit}
                groupLabel={group}
                key={commit.hash}
                onClick={() => onOpenCommit(commit.hash)}
              />
            );
          })}
        </>
      )}
      {log.hasNextPage ? (
        <button
          className="loadmore cursor-pointer"
          disabled={log.isFetchingNextPage}
          onClick={() => void log.fetchNextPage()}
          type="button"
        >
          {t("git.loadMore")}
        </button>
      ) : null}
    </div>
  );
}

// ── 03u git 提交详情（L3）────────────────────────────────────────────────────

export type L3GitCommitProps = {
  projectName: string;
  hash: string;
};

/**
 * 03u 提交详情页：cmsg 提交消息 + by（author · relative）+ dstat（numstat 求和）+ 变更文件
 * frow 列表（点行内嵌展开单文件 diff——对比基准 = 本次提交，getProjectGitCommitFileDiff +
 * DiffContent；不做独立 URL 层，展开态为本地 state）。
 */
export function L3GitCommit({ projectName, hash }: L3GitCommitProps) {
  const { t } = useT();
  const detail = useQuery({
    queryKey: ["projects", projectName, "git", "commit", hash],
    queryFn: () => getProjectGitCommitDetail(projectName, hash),
  });
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const toggle = (path: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  if (detail.isLoading) {
    return <LoadingBlock className="min-h-0 flex-1" label={t("git.loadingDiff")} />;
  }
  if (detail.isError || !detail.data || detail.data.repository !== true) {
    return <div className="cap mt-4 px-4">{t("git.fileError")}</div>;
  }
  const { meta, files } = detail.data;
  const added = files.reduce((n, f) => n + (f.addedLines ?? 0), 0);
  const removed = files.reduce((n, f) => n + (f.removedLines ?? 0), 0);

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-[max(16px,var(--shell-mobile-bottom-nav-space,0px))]"
      data-role="l3-git-commit"
    >
      <div className="cmsg">{meta.message}</div>
      <div className="by">
        {meta.author} · {meta.relativeTime}
      </div>
      <div className="dstat">
        <span className="add">+{added}</span>
        <span className="del">-{removed}</span>
        <span className="font-mono">{meta.hash}</span>
      </div>
      <div className="dlg">{t("git.commitFiles", { n: files.length })}</div>
      <div>
        {files.map((file) => {
          const open = expanded.has(file.path);
          // badge class 与 label 同源（statusShortLabel 单次求值，同 project-tool-panels GitStatusBadge）。
          const short = statusShortLabel(file.status);
          return (
            <div key={file.path}>
              <button
                className="frow w-full cursor-pointer text-left text-[12.5px]"
                onClick={() => toggle(file.path)}
                type="button"
              >
                <span className={`badge lg ${short}`}>{short}</span>
                <span className="p">{file.path}</span>
                {file.addedLines !== null && file.removedLines !== null ? (
                  <span className="tm font-mono">
                    <span className="text-success-text">+{file.addedLines}</span>{" "}
                    <span className="text-error">-{file.removedLines}</span>
                  </span>
                ) : null}
                <span className="ar">
                  <span className="text-[14px]">{open ? "▾" : "▸"}</span>
                </span>
              </button>
              {open ? (
                <CommitFileDiff projectName={projectName} hash={hash} path={file.path} />
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="cap mt-4 px-4">{t("git.commitFileCap")}</div>
    </div>
  );
}

/** 03u 内嵌单文件 diff（展开态挂载；对比基准 = 本次提交）。 */
function CommitFileDiff({
  projectName,
  hash,
  path,
}: {
  projectName: string;
  hash: string;
  path: string;
}) {
  const { t } = useT();
  const fileDiff = useQuery({
    queryKey: ["projects", projectName, "git", "commit-diff", hash, path],
    queryFn: () => getProjectGitCommitFileDiff(projectName, hash, path),
  });
  if (fileDiff.isError || !fileDiff.data || fileDiff.data.repository !== true) {
    return <div className="csub">{t("git.fileError")}</div>;
  }
  return <DiffContent diff={fileDiff.data.diff} filePath={path} />;
}

// ── 03v git 分支（L3）────────────────────────────────────────────────────────

export type L3GitBranchesProps = {
  projectName: string;
  /** 点本地分支 → 历史页（branch search param）。 */
  onOpenHistory: (branch: string) => void;
};

/**
 * 03v 分支页：bcur 当前分支卡（tint-blue）+ 其他本地分支 brow/bsub（aheadBehindSub）+ rocard
 * 只读边界卡 + 远程分支组。merged 行置灰（M8 已落：listBranches `--merged HEAD` 派生
 * GitBranch.merged，解析失败 undefined 不标不阻塞）。点本地分支 → 历史页。
 */
export function L3GitBranches({ projectName, onOpenHistory }: L3GitBranchesProps) {
  const { t } = useT();
  const branches = useQuery({
    queryKey: ["projects", projectName, "git", "branches"],
    queryFn: () => listProjectGitBranches(projectName),
  });

  if (branches.isPending) {
    // 分支页是 bcur 卡 + brow 行列表 → 标准表「行列表首载」层用同形骨架（§6.12o review 修正：
    // 原 LoadingBlock 属详情层，与同栈 L3GitHistory 的骨架不同层异形）。
    return <ListRowSkeleton action="none" count={4} marker={false} />;
  }
  const list = branches.data?.branches ?? [];
  const current = branches.data?.current ?? "";
  const locals = list.filter((b) => b.type === "local" && !b.isCurrent);
  const remotes = list.filter((b) => b.type === "remote");
  const cur = list.find((b) => b.isCurrent);

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-[max(16px,var(--shell-mobile-bottom-nav-space,0px))]"
      data-role="l3-git-branches"
    >
      <div className="dlg">{t("git.branchesTitle", { n: list.length })}</div>
      <div className="sect">{t("git.sectCurrentBranch")}</div>
      {cur ? (
        <div className="bcur">
          <div className="r1">
            <span>{cur.name}</span>
            <span className="st">
              {cur.upstream === undefined
                ? t("git.noUpstream")
                : (cur.ahead ?? 0) === 0 && (cur.behind ?? 0) === 0
                  ? t("git.upToDate")
                  : formatAheadBehind(cur.ahead, cur.behind)}
            </span>
          </div>
          <div className="d2">{t("git.bcurSub", { time: cur.lastCommitShort ?? "" })}</div>
        </div>
      ) : (
        <div className="bcur">
          <div className="r1">
            <span>{current === "HEAD" ? t("git.detached") : current}</span>
          </div>
        </div>
      )}
      <div className="sect">{t("git.sectOtherBranches", { n: locals.length })}</div>
      {locals.map((b) => (
        <BranchRow key={b.name} branch={b} onClick={() => onOpenHistory(b.name)} />
      ))}
      {locals.length === 0 ? (
        <div className="px-4 py-2 text-[12.5px] text-ink-2">{t("git.noBranches")}</div>
      ) : null}
      <div className="rocard">
        <div className="t">{t("git.rocardTitle")}</div>
        <div className="d">{t("git.rocardDesc")}</div>
      </div>
      {remotes.length > 0 ? (
        <>
          <div className="sect">{t("git.sectRemoteBranches")}</div>
          {remotes.map((b) => (
            <BranchRow key={b.name} branch={b} onClick={() => onOpenHistory(b.name)} />
          ))}
        </>
      ) : null}
    </div>
  );
}

/** 03v 分支行：brow（name + ahead/behind）+ bsub（branchAheadBehindSub；无 upstream 省略）。
 * merged 行（原型 pin③）置灰：n 降 ink-2/400 + st 换「已合并」缀注（不显示 ↑↓）。 */
function BranchRow({ branch, onClick }: { branch: GitBranch; onClick: () => void }) {
  const { t } = useT();
  const hasUpstream = branch.upstream !== undefined;
  const merged = branch.merged === true;
  return (
    <button className="block w-full cursor-pointer text-left" onClick={onClick} type="button">
      <span className={merged ? "brow merged" : "brow"}>
        <span className="n">{branch.name}</span>
        <span className={merged ? "st mg" : "st"}>
          {merged
            ? t("git.merged")
            : !hasUpstream
              ? t("git.noUpstream")
              : (branch.ahead ?? 0) === 0 && (branch.behind ?? 0) === 0
                ? t("git.upToDate")
                : formatAheadBehind(branch.ahead, branch.behind)}
        </span>
      </span>
      <span className={merged ? "bsub mg" : "bsub"}>
        {hasUpstream
          ? t("git.branchAheadBehindSub", {
              base: branch.upstream ?? "",
              ahead: branch.ahead ?? 0,
              behind: branch.behind ?? 0,
              time: branch.lastCommitShort ?? "",
            })
          : (branch.lastCommitShort ?? "")}
      </span>
    </button>
  );
}

// ── 03s wiki 阅读页（L3）─────────────────────────────────────────────────────

export type L3WikiReaderProps = {
  projectName: string;
  slug: string;
  /** rel「同组页」跳转（同首 tag 的其他页，组件内派生）。 */
  onOpenPage: (slug: string) => void;
  /** 正文内「复制链接」wlink 保留（桌面中栏默认 true 保底；v1.5 移动面板标签传 false——
   * 复制链接收敛进 nav ⋯ 菜单，wiki-reader 原型 .fmeta 右端只有 actbtn）。 */
  copyLinkInBody?: boolean;
};

/**
 * 03s wiki 阅读页（v1.5 批3 对齐 wiki-reader 原型）：.fmeta（Markdown · size · 更新 date）
 * + 右端 .fright>.actbtn「✦让 Agent 读这篇」（ActionMenu 选 agent 会话 → D13 REST 注入 +
 * wikiRefs 记忆）+ MarkdownString 正文 + rel 同组页跳转 + cap 只读说明。wmeta/readbtn 退役
 *（fmeta 覆盖）；wlink 随 copyLinkInBody（默认 true，桌面保底）。注入协议：text =
 * injectPrompt 模板 + 页面正文（§6.2 A 方案——stdin prompt 注入，客户端引用 atom 驱动流顶
 * 引用卡与 refnote）。
 */
export function L3WikiReader({
  copyLinkInBody = true,
  onOpenPage,
  projectName,
  slug,
}: L3WikiReaderProps) {
  const { t } = useT();
  const setWikiRefs = useSetAtom(workbenchWikiRefsAtom);
  const page = useWikiPage(projectName, slug, WIKI_QUERY_SCOPE);
  const index = useWikiIndex(projectName, WIKI_QUERY_SCOPE);
  // 注入目标会话（agent only；组件挂载即取——readbtn 菜单数据源）。
  const sessions = useQuery({
    queryKey: ["projects", projectName, "agent-sessions"],
    queryFn: () => listAgentSessions(projectName),
  });
  const [injectError, setInjectError] = useState(false);

  const title = page.data?.frontmatter.title ?? slug;
  const inject = useMutation({
    mutationFn: async (sessionId: string) => {
      const text = `${t("wiki.injectPrompt", { slug, title })}${page.data?.body ?? ""}`;
      await sendProjectSessionMessage(projectName, sessionId, text);
      return sessionId;
    },
    onSuccess: (sessionId) => {
      setInjectError(false);
      setWikiRefs((prev) => {
        const perProject = prev[projectName] ?? {};
        const perSession = perProject[sessionId] ?? [];
        if (perSession.some((r) => r.slug === slug)) return prev;
        return {
          ...prev,
          [projectName]: { ...perProject, [sessionId]: [...perSession, { slug, title }] },
        };
      });
      // refnote/ref 卡读 wikiRefs atom，不依赖 query；失败态清理即可。
    },
    onError: () => setInjectError(true),
  });

  if (page.isLoading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pt-3 pb-[max(16px,var(--shell-mobile-bottom-nav-space,0px))]">
        <ListRowSkeleton count={2} marker={false} />
      </div>
    );
  }
  if (page.isError || !page.data) {
    return <div className="cap mt-4 px-4">{t("wiki.pageMissing")}</div>;
  }
  // rel 同组页：首 tag 相同的其他页（index 反查；无 tag 页同组 = 其他无 tag 页）。
  const groupPeers = (index.data?.pages ?? []).filter(
    (p) => p.slug !== slug && (p.tags[0] ?? "") === (page.data!.frontmatter.tags[0] ?? ""),
  );

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-[max(16px,var(--shell-mobile-bottom-nav-space,0px))]"
      data-role="l3-wiki-reader"
    >
      <div className="fmeta">
        <span>
          {fileTypeLabel("page.md")} ·{" "}
          {formatBytes(new TextEncoder().encode(page.data.body).length)} ·{" "}
          {t("files.metaUpdated", { time: page.data.frontmatter.updated })}
        </span>
        <span className="fright">
          <ActionMenu
            align="end"
            cancelLabel={t("cancel")}
            items={
              sessions.data?.sessions.length
                ? sessions.data.sessions.map((s) => ({
                    label: s.displayName,
                    icon: <ShellIcon name="agent-nav" />,
                    onSelect: () => inject.mutate(s.id),
                  }))
                : [
                    {
                      label: t("wiki.noSessions"),
                      onSelect: () => undefined,
                      disabled: true,
                    },
                  ]
            }
            trigger={
              <button className="actbtn cursor-pointer" disabled={inject.isPending} type="button">
                <ShellIcon name="sparkles" />
                {t("wiki.readByAgent")}
              </button>
            }
          />
        </span>
      </div>
      {injectError ? <div className="cap mt-2 px-4">{t("wiki.injectFailed")}</div> : null}
      {copyLinkInBody ? (
        <button
          className="wlink cursor-pointer"
          onClick={() => {
            void navigator.clipboard.writeText(
              `${window.location.origin}/projects/${encodeURIComponent(projectName)}/wiki/${encodeURIComponent(slug)}`,
            );
          }}
          type="button"
        >
          {t("wiki.copyLink")}
        </button>
      ) : null}
      <div className="px-4 py-2">
        <MarkdownString text={page.data.body} />
      </div>
      {groupPeers.length > 0 ? (
        <>
          <div className="rel">{page.data.frontmatter.tags[0] || t("wiki.groupUngrouped")}</div>
          {groupPeers.map((p) => (
            <button
              className="wpg flex w-full cursor-pointer text-left"
              key={p.slug}
              onClick={() => onOpenPage(p.slug)}
              type="button"
            >
              <span className="n flex-1 truncate">{p.title}</span>
              <span className="st">{p.updated}</span>
            </button>
          ))}
        </>
      ) : null}
      <div className="cap mt-4 px-4">{t("wiki.readOnlyCap")}</div>
    </div>
  );
}
