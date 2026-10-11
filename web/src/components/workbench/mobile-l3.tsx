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
  useCallback,
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
import { GitCommitRow } from "./project-tool-panels";
import { WIKI_QUERY_SCOPE, useWikiIndex, useWikiPage } from "../../hooks/wiki";
import { relativeTime } from "./history-list";
import { ShellIcon } from "../shell/icons";
import { LucideIcon } from "../shell/lucide-icon";
import {
  WORKBENCH_GIT_TAB_QUERY_SCOPE,
  DiffContent,
  formatAheadBehind,
  gitDiffListQueryKey,
  gitFileDiffQueryKey,
  GitStatusBadge,
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

// ── v1.6 批 v6.5「点正文任意处进入编辑」tap 判定 ─────────────────────────────
// 原型（tool-files-preview ②/workspace-preview ②/files-global-preview ②）：顶部无编辑钮
//（pencil 退役），点正文命中区最大化。tap = pointerdown 记起点 + click 判位移 ≤ slop
//（桌面拖选文本、移动滚动惯性不误触发）；控件就近消费不冒泡进编辑——button（渲染 toggle
// 等控件）、a（渲染态链接）、input/textarea/select（渲染态任务清单 checkbox 等）、
// [contenteditable]（源码画布）与 [role=button]（语义钮）。
// html 渲染态 iframe 内点击不冒泡出 iframe，属已知边界（先切源码）。
const TAP_SLOP_PX = 10;

/** 控件排除选择器：命中即不进编辑（就近控件自消费）。 */
const TAP_EXCLUDE_SELECTOR =
  "button, a, input, textarea, select, [contenteditable='true'], [role='button']";

function useTapToEdit(onEnter: (click: { x: number; y: number }) => void) {
  const downRef = useRef<{ x: number; y: number } | null>(null);
  return {
    onClick: (e: React.MouseEvent) => {
      const target = e.target as Element;
      if (target.closest(TAP_EXCLUDE_SELECTOR)) return;
      const down = downRef.current;
      downRef.current = null;
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > TAP_SLOP_PX) return;
      // 点击坐标随 onEnter 传出：消费方优先用点击时仍存活的源码态实例就地映射 doc 位置
      //（enterEditing），拿不到实例才退视口坐标兜底（第三轮反馈①：光标落点击处）。
      onEnter({ x: e.clientX, y: e.clientY });
    },
    onPointerDown: (e: React.PointerEvent) => {
      downRef.current = { x: e.clientX, y: e.clientY };
    },
  };
}

/**
 * tap-to-edit 进编辑后的光标落点兜底（第三轮反馈①「光标位置和点击位置不符」，2026-10-12
 * 重修见 enterEditing）：主路径 = 点击时旧实例仍在（tapToEdit 仅绑源码态），就地
 * posAtCoords 映射成 **doc 位置**（跨态视口坐标会被布局/焦点变化漂移，doc 位置语义保真）；
 * 仅当点击时拿不到实例或映射失败才退回视口坐标兜底（本函数，布局就绪后映射，null 安全
 * 跳过落默认位）。消费后由调用方清 ref（同一次点击只生效一次）。
 */
export function applyPendingCursor(view: EditorView, click: { x: number; y: number } | null) {
  if (!click) return;
  const pos = view.posAtCoords({ x: click.x, y: click.y });
  dispatchPendingCursor(view, pos);
}

/**
 * 光标落位共用尾段：pos 有效则设 selection 并聚焦，null 安全跳过（落默认位）。
 */
function dispatchPendingCursor(view: EditorView, pos: number | null) {
  if (pos != null) {
    view.dispatch({ selection: { anchor: pos } });
  }
  view.focus();
}

/**
 * 编辑态工具钮组（撤销/重做/收起软键盘）：@codemirror/commands view 命令直驱 EditorView。
 * 真机反馈 2026-10-11（7b）：原 FilePreviewPane 底部 .aux 工具条上移进编辑态首行（用户：
 * 元信息行去除，空出位置放工具条内容）——编辑器全高，工具钮不再有软键盘遮挡面；MobileL3
 * 检视页编辑态同批补齐（同构缺口：此前仅 Pane 有 undo/redo）。desktop 档无软键盘收起诉求
 *（05h4 原型 .pvaux 仅撤销/重做两钮）。
 * 真机反馈 2026-10-12（③「撤销/重做恒灰不符合直觉」）：disabled 绑 history 深度（canUndo/
 * canRedo，CodeEditor onHistoryChange 上抛）而非 view 就绪——无历史/撤到底 = 灰（真禁用），
 * 有历史 = ink-1 可点（灰 = 不可点语义成立）。
 */
function EditorToolButtons({
  view,
  canRedo,
  canUndo,
  showDismiss = true,
}: {
  view: EditorView | null;
  canRedo: boolean;
  canUndo: boolean;
  /** 移动档软键盘收起钮（blur 画布）；desktop 档传 false。 */
  showDismiss?: boolean;
}) {
  const { t } = useT();
  const base = "flex items-center gap-1 border-0 bg-none p-0 text-[12px]";
  return (
    <>
      <button
        className={
          canUndo ? `${base} cursor-pointer text-ink-1` : `${base} cursor-default text-ink-3`
        }
        disabled={!canUndo}
        onClick={() => view && undo(view)}
        type="button"
      >
        <LucideIcon className="size-4 shrink-0" name="undo-2" />
        {t("files.auxUndo")}
      </button>
      <button
        className={
          canRedo ? `${base} cursor-pointer text-ink-1` : `${base} cursor-default text-ink-3`
        }
        disabled={!canRedo}
        onClick={() => view && redo(view)}
        type="button"
      >
        <LucideIcon className="size-4 shrink-0" name="redo-2" />
        {t("files.auxRedo")}
      </button>
      {showDismiss ? (
        <button
          className={`${base} cursor-pointer text-ink-1`}
          onClick={() => view?.contentDOM.blur()}
          type="button"
        >
          <LucideIcon className="size-4 shrink-0" name="chevron-down" />
          {t("files.auxDismissKeyboard")}
        </button>
      ) : null}
    </>
  );
}

export type MobileL3FilePreviewProps = {
  projectName: string;
  /** 项目相对路径。 */
  path: string;
};

/**
 * 03q 文件预览页（批次 3 编辑能力下沉：右栏 Inspector 与移动 focus 双端同构单源）。meta 行
 *（N 行 · 更新 relative；v1.6 编辑/查看 diff 钮退役——「编辑」= 点正文任意处进入，
 *「查看 diff」收 nav ⋯ 菜单）+ 只读源码（CodeEditor editable=false，与编辑态同画布——
 * 反馈④b：源码⇄渲染⇄编辑切换零跳变）；编辑态（CodeEditor + FileSaveButton + ⌘S，保存/
 * dirty 丢弃确认走 useFileEditor 单源，与 FilesPanel inspection 同 query key 共享缓存）。
 * image → ImageViewer；too_large/unsupported → .cap 简要说明。⋯ 菜单（复制内容/复制路径/
 * 查看 diff）由调用方经 header l3.actions 装配。
 */
export function MobileL3FilePreview({ projectName, path }: MobileL3FilePreviewProps) {
  const { t } = useT();
  const { confirm, holder: confirmHolder } = useConfirm();
  // 编辑态（组件内局部；切文件即退出——下方 effect 与 hook 清草稿同步）。
  const [editing, setEditing] = useState(false);
  // 撤销/重做可用性（CodeEditor onHistoryChange 逐事务上抛 undoDepth/redoDepth>0）。
  const [hist, setHist] = useState({ canUndo: false, canRedo: false });
  const handleHistory = useCallback((s: { canUndo: boolean; canRedo: boolean }) => {
    setHist((prev) => (prev.canUndo === s.canUndo && prev.canRedo === s.canRedo ? prev : s));
  }, []);
  // 编辑会话号（放弃/完成递增 → CodeEditor historyEpoch 递增 → 实例重建清 undo 栈）。
  const [editSession, setEditSession] = useState(0);
  // 编辑器实例跨三态复用（源码⇄渲染⇄编辑同画布零跳变；CodeEditor key=name@epoch 换文件/
  // 会话边界才重建，重建时 onCreateEditor 重新接住新实例）。进出编辑不置空——置空会丢
  // 撤销/重做驱动与点击坐标映射的宿主（2026-10-12 反馈①③同根：onCreateEditor 仅首次触发）。
  const [editorView, setEditorView] = useState<EditorView | null>(null);
  const handleViewReady = useCallback((view: EditorView) => setEditorView(view), []);
  // v1.6「点正文任意处进入编辑」的点击坐标暂存（进编辑后映射光标，见下方 effect）。
  const pendingCursorRef = useRef<{ pos?: number; click?: { x: number; y: number } } | null>(null);
  // 换文件：CodeEditor key=name@epoch 重建实例，容器侧同步丢旧 view 引用、按钮可用性与
  // 待消费落点（防「tap 后进编辑未消费即切文件」把旧文件 doc 位置带进新文档）。
  useEffect(() => {
    setEditing(false);
    setEditorView(null);
    setHist({ canUndo: false, canRedo: false });
    pendingCursorRef.current = null;
  }, [path]);
  // v1.6「点正文任意处进入编辑」（仅查看态源码分支消费——渲染态不绑，动线 = segc 切源码；
  // early return 分支绑不到）。
  const enterEditing = (click: { x: number; y: number }) => {
    // 点击时源码只读实例尚在（tapToEdit 仅绑源码态），就地 posAtCoords 映射成 doc 位置——
    // 跨态视口坐标会被布局/焦点变化漂移，doc 位置语义保真；null（行号区/画布外）退坐标兜底。
    const pos = editorView?.posAtCoords(click) ?? null;
    pendingCursorRef.current = pos != null ? { pos } : { click };
    editor.onRenderModeChange("source");
    setEditing(true);
  };
  const tapToEdit = useTapToEdit(enterEditing);
  // 进编辑后消费 tap 落点：pos 直设 selection；coords 兜底走 applyPendingCursor（此时
  // editable reconfigure 已随子组件 effect 先行生效，focus 可弹键盘）。
  useEffect(() => {
    if (!editing) return;
    const view = editorView;
    const pending = pendingCursorRef.current;
    if (!view || !pending) return;
    pendingCursorRef.current = null;
    if (pending.pos != null) {
      view.dispatch({ selection: { anchor: pending.pos } });
      view.focus();
    } else if (pending.click) {
      applyPendingCursor(view, pending.click);
    }
  }, [editing, editorView]);
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

  // .fmeta 单源派生（与 FilePreviewPane 同一 paneFmetaText；v1.6 原型左段 = 类型·度量·
  // 更新时间，code review v6.5 指出本容器仍走旧 .meta 掉队）。early-return 分支同样消费
  //（image = 宽×高/size，unsupported/too_large = size——Binary 页 fmeta + 空态与
  // FilePreviewPane 同构）。imgDims 解码在 image 分支外不适用，恒 null（回落 size 段）。
  const lineCount = data.type === "text" ? data.content.split("\n").length : 0;
  // mtimeMs 契约 optional（shared ProjectFilePreviewResponse）——缺省不显更新段而非崩预览。
  const updated =
    data.type === "text" && data.mtimeMs
      ? relativeTime(new Date(data.mtimeMs).toISOString(), t)
      : "";
  const fmetaText = paneFmetaText(data, {
    renderView: data.type === "text" && editor.showRenderToggle && editor.renderMode === "render",
    lineCountLabel: t("files.lineCount", { n: lineCount }),
    imgDims: null,
  });

  // 非 text 类型：image → fmeta + ImageViewer（缩放/旋转/双击手势工具条）；too_large/
  // unsupported → fmeta + .cap 简要说明。三类都带 data-role 根（预览态语义一致，调用方
  // 锚点稳定）。confirmHolder 只在 text 分支渲染（丢弃确认仅编辑态可达，image/cap 分支
  // 进不了编辑态）。
  if (data.type === "image") {
    return (
      <div className="flex min-h-0 flex-1 flex-col" data-role="l3-file-preview">
        <div className="fmeta">
          <span>{`${fmetaText.typeLabel} · ${fmetaText.metric}`}</span>
        </div>
        <ImageViewer alt={data.name} downloadName={data.name} src={data.dataUrl} />
      </div>
    );
  }
  if (data.type !== "text") {
    return (
      <div className="flex min-h-0 flex-1 flex-col" data-role="l3-file-preview">
        <div className="fmeta">
          <span>{`${fmetaText.typeLabel} · ${fmetaText.metric}`}</span>
        </div>
        <div className="cap mt-4 px-4">
          {data.type === "too_large"
            ? t("files.tooLarge", { limit: formatBytes(data.limitBytes) })
            : t("files.unsupported")}
        </div>
      </div>
    );
  }
  // 完成编辑：dirty 时丢弃确认（与 FilesPanel 换文件守卫同款 dialog 文案）。确认后回渲染
  // 态（预览优先——「完成」= 结束一次编辑动作，回到 md/html 的默认阅读形态；源码再点
  // toggle）。renderMode 仅 md/html（showRenderToggle）消费——非 md/html 不写脏 state。
  const finishEditing = () => {
    const backToRender = () => {
      setEditing(false);
      // 会话号递增：下轮进编辑重建实例清 undo 栈（完成后撤销不得把已保存内容退回草稿态）。
      setEditSession((s) => s + 1);
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
      className={`flex min-h-0 flex-1 flex-col pb-[max(16px,var(--shell-mobile-bottom-nav-space,0px),var(--kb-offset,0px))] ${editing || isRenderView ? "overflow-hidden" : "overflow-y-auto"}`}
      data-role="l3-file-preview"
      {...(!editing && !isRenderView ? tapToEdit : {})}
    >
      {editing ? (
        // 编辑态操作行：保存（FileSaveButton 统一样式，禁用/保存中/已保存三态）+ 完成。
        // 双按钮包进单个 .diff 容器（auto margin 每份平分剩余空间——两个 .diff 会把首钮
        // 悬在行中部，design-review 批次 3）；裸文本钮加 after 纵向隐形扩区（铁律 9 触达）。
        <div className="meta">
          <EditorToolButtons canRedo={hist.canRedo} canUndo={hist.canUndo} view={editorView} />
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
        // .fmeta 单源（v1.6 原型：左段 = 类型·度量·更新时间；md/html 右端 = 渲染⇄源码
        // 分段——FilePreviewPane 同源派生，旧 .meta 行数/时间行退役）。
        <div className="fmeta">
          <span>
            {`${fmetaText.typeLabel} · ${fmetaText.metric}${
              updated ? ` · ${t("files.metaUpdated", { time: updated })}` : ""
            }`}
          </span>
          {editor.showRenderToggle ? (
            <RenderModeToggle
              className="ml-auto"
              mode={editor.renderMode}
              onChange={editor.onRenderModeChange}
            />
          ) : null}
        </div>
      )}
      {editing ? (
        // CodeEditor 根自带 relative+flex-1（内部 absolute 高度链，frontend-notes §8）；
        // 编辑态根 overflow-hidden 给确定高度。py-2.5 = 03q2 .ed 的 padding:10px 0（画布全幅）。
        <div className="flex min-h-0 flex-1 flex-col py-2.5">
          <Suspense fallback={<CodeEditorFallback />}>
            <CodeEditor
              historyEpoch={editSession}
              name={data.name}
              onCreateEditor={handleViewReady}
              onHistoryChange={handleHistory}
              onChange={editor.onEditChange}
              value={editor.editValue}
            />
          </Suspense>
        </div>
      ) : isRenderView ? (
        // 渲染态 = PreviewBody 单源（md → MarkdownString / html → sandbox iframe + 本地资源
        // 内联），与检视面板/中栏 file tab 同一渲染器（onEditChange 不传 = 只读）。
        // 渲染态不进编辑（真机反馈 2026-10-11：渲染态点击进编辑不合理；动线 = segc 切源码）。
        <PreviewBody editValue="" preview={data} renderMode="render" />
      ) : (
        // 源码态 = CodeEditor 只读（反馈④b：与编辑态同一画布，切换不再跳样式）。外层
        // py-2.5 同编辑态容器（画布上下 10px 由调用方承担，frontend-notes §8 高度链——
        // flex-1 子要滚，父是 flex container；CodeMirror 内滚）。onCreateEditor 接住实例：
        // tap 进编辑时 posAtCoords 映射 doc 位置、进编辑态组件复用后仍持有 view。
        <div className="flex min-h-0 flex-1 flex-col py-2.5">
          <Suspense fallback={<CodeEditorFallback />}>
            <CodeEditor
              editable={false}
              historyEpoch={editSession}
              name={data.name}
              onCreateEditor={handleViewReady}
              value={data.content}
            />
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
  /** 容器分档（v1.5 批 4，spec §4.5 预览矩阵）：mobile = 面板/push；desktop = 中栏 tab/
   * 主区推入态。编辑态工具钮组（撤销/重做/收起键盘）随 7b 上移 .emeta 行、.aux 已退役。 */
  variant?: "mobile" | "desktop";
};

/**
 * v1.5 预览矩阵·移动：文件预览主体单源（面板标签 / push 容器共用）。预览态 = .fmeta
 *（左 = 类型·度量·更新时间；右端 = MD/HTML 渲染⇄源码 segc.mini）+ CodeEditor 只读源码
 * / PreviewBody 渲染 / ImageViewer 图片 / .unsupported 空态；编辑态 = .emeta
 *（工具钮组撤销/重做/收起键盘 + ● 未保存变更 + fact 放弃/完成，7b 合并行）+ CodeEditor。
 * finish = dirty 即保存并退出编辑（回渲染态）；discard =
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
    // 编辑器实例跨三态复用（源码⇄编辑同画布零跳变；CodeEditor key=name@epoch 换文件/会话
    // 边界才重建，重建时 onCreateEditor 重新接住新实例）。进出编辑不置空——置空会丢
    // 撤销/重做驱动与点击坐标映射的宿主（2026-10-12 反馈①③同根：onCreateEditor 仅首次触发）。
    const [editorView, setEditorView] = useState<EditorView | null>(null);
    const handleViewReady = useCallback((view: EditorView) => setEditorView(view), []);
    // 撤销/重做可用性（CodeEditor onHistoryChange 逐事务上抛 undoDepth/redoDepth>0）。
    const [hist, setHist] = useState({ canUndo: false, canRedo: false });
    const handleHistory = useCallback((s: { canUndo: boolean; canRedo: boolean }) => {
      setHist((prev) => (prev.canUndo === s.canUndo && prev.canRedo === s.canRedo ? prev : s));
    }, []);
    // 编辑会话号（放弃/完成递增 → CodeEditor historyEpoch 递增 → 实例重建清 undo 栈）。
    const [editSession, setEditSession] = useState(0);
    // v1.6「点正文任意处进入编辑」的点击坐标暂存（进编辑后映射光标，见下方 effect）。
    const pendingCursorRef = useRef<{ pos?: number; click?: { x: number; y: number } } | null>(
      null,
    );
    // 换文件：CodeEditor key=name@epoch 重建实例，容器侧同步丢旧 view 引用、按钮可用性与
    // 待消费落点（防「tap 后进编辑未消费即切文件」把旧文件 doc 位置带进新文档）。
    useEffect(() => {
      setEditorView(null);
      setHist({ canUndo: false, canRedo: false });
      pendingCursorRef.current = null;
    }, [path]);
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
    // 进编辑先切源码（md/html render 态 canEdit gate 要求 source；finish/discard 已统一回
    // render）。退出编辑不清 editorView——实例跨三态复用（注释见上方声明处）。
    useEffect(() => {
      if (editing) {
        editor.onRenderModeChange("source");
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
        // 会话号递增：下轮进编辑重建实例清 undo 栈（完成后撤销不得把已保存内容退回草稿态）。
        setEditSession((s) => s + 1);
        onEditingChange(false);
        if (editor.showRenderToggle) editor.onRenderModeChange("render");
      },
      discard: () => {
        const exit = () => {
          editor.onEditChange(undefined);
          // 会话号递增：下轮进编辑重建实例清 undo 栈（放弃的内容再进编辑不得撤回）。
          setEditSession((s) => s + 1);
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
    // v1.6「点正文任意处进入编辑」：查看态源码分支根容器消费（渲染态不绑，动线 = segc 切
    // 源码；编辑态 gate 不绑；early return 分支绑不到）。
    const enterEditing = (click: { x: number; y: number }) => {
      // 点击时源码只读实例尚在（tapToEdit 仅绑源码态），就地 posAtCoords 映射成 doc 位置——
      // 跨态视口坐标会被布局/焦点变化漂移，doc 位置语义保真；null 退视口坐标兜底。
      const pos = editorView?.posAtCoords(click) ?? null;
      pendingCursorRef.current = pos != null ? { pos } : { click };
      onEditingChange(true);
    };
    const tapToEdit = useTapToEdit(enterEditing);
    // 进编辑后消费 tap 落点：pos 直设 selection；coords 兜底走 applyPendingCursor（此时
    // editable reconfigure 已随子组件 effect 先行生效，focus 可弹键盘）。
    useEffect(() => {
      if (!editing) return;
      const view = editorView;
      const pending = pendingCursorRef.current;
      if (!view || !pending) return;
      pendingCursorRef.current = null;
      if (pending.pos != null) {
        view.dispatch({ selection: { anchor: pending.pos } });
        view.focus();
      } else if (pending.click) {
        applyPendingCursor(view, pending.click);
      }
    }, [editing, editorView]);
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
    // 无 bottom nav，05h 原型四边贴容器）。编辑态去 pb——.emeta 行是首子元素、底部工具条
    // .aux 已退役（7b），面板底 = 编辑器直落。
    // 编辑态 pb 换 --kb-offset（批 17 键盘避让）：iOS 键盘 overlay 只缩 visual viewport，
    // 面板 padding-bottom 缩链让编辑器可滚区落到键盘上方（全高面板只能缩链，translateY 会把
    // 顶部推出视口）；桌面 --kb-offset 恒 0，无影响。
    return (
      <div
        className={`flex min-h-0 flex-1 flex-col ${variant === "desktop" ? "fdesktop" : ""} ${editing ? "pb-[var(--kb-offset,0px)]" : variant === "desktop" ? "" : "pb-[max(16px,var(--shell-mobile-bottom-nav-space,0px))]"} ${editing || isRenderView ? "overflow-hidden" : "overflow-y-auto"}`}
        data-role="file-preview-pane"
        {...(!editing && !isRenderView ? tapToEdit : {})}
      >
        {editing ? (
          <>
            {/* 编辑态单操作行（7b 真机反馈 2026-10-11）：元信息行去除（「编辑中·N 行」是
            编辑器自见的冗余），底部 .aux 工具条上移至此（用户：空出的位置放工具条内容）——
            左 = 撤销/重做/收键盘，右 = meta 模式放弃/完成；nav 模式右端 = dirty 靠右（nav
            [放弃][完成] 已在容器 nav 栏）。编辑器全高，底部不再有被键盘遮挡的工具条。 */}
            <div className="emeta">
              <EditorToolButtons
                canRedo={hist.canRedo}
                canUndo={hist.canUndo}
                showDismiss={variant !== "desktop"}
                view={editorView}
              />
              {editor.isDirty ? (
                <span className={`dirty ${editingActions === "nav" ? "ml-auto" : ""}`}>
                  ● {t("files.unsavedChanges")}
                </span>
              ) : null}
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
                  historyEpoch={editSession}
                  name={data.name}
                  onCreateEditor={handleViewReady}
                  onHistoryChange={handleHistory}
                  onChange={editor.onEditChange}
                  value={editor.editValue}
                />
              </Suspense>
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
              // 渲染态不进编辑（真机 2026-10-11）；动线 = segc 切源码后点正文。
              <PreviewBody editValue="" preview={data} renderMode="render" />
            ) : (
              // 源码态 = CodeEditor 只读（反馈④b：与编辑态同画布 + 同 py-2.5 外层容器）。
              // onCreateEditor 接住实例：tap 进编辑时就地映射 doc 位置、复用后仍持有 view。
              <div className="flex min-h-0 flex-1 flex-col py-2.5">
                <Suspense fallback={<CodeEditorFallback />}>
                  <CodeEditor
                    editable={false}
                    historyEpoch={editSession}
                    name={data.name}
                    onCreateEditor={handleViewReady}
                    value={data.content}
                  />
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

/** 03t 单条提交行：crow（GitCommitRow 单源）+ csub（author）+ 可选日期组头。 */
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
      <GitCommitRow className="w-full cursor-pointer text-left" commit={commit} onClick={onClick} />
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
        // .crow 单行（hash+message+time）无右尾元素 → lines=1 + action="none"
        //（默认 square 是幻影右块；同栈 L3GitBranches 的 action="none" 同款修正）。
        <ListRowSkeleton count={4} marker={false} lines={1} action="none" />
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
          return (
            <div key={file.path}>
              <button
                className="frow w-full cursor-pointer text-left text-[12.5px]"
                onClick={() => toggle(file.path)}
                type="button"
              >
                <GitStatusBadge status={file.status} />
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
  // isPending 前置分流（§6.12o 批 2 P0）：原条件把 pending 期 !data 一并判成错误，展开时
  // 请求在途恒显「无法打开此差异」伪错误；详情层（§6.12o）LoadingBlock，完成/失败后才分流。
  if (fileDiff.isPending) {
    return <LoadingBlock className="py-4" label={t("git.loadingDiff")} />;
  }
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
        {/* 详情层（§6.12o 分层）：wiki 阅读器是文档内容块（fmeta + MarkdownString 正文），
            行列表骨架异形——归 LoadingBlock（同栈 file preview / git diff 同款）。 */}
        <LoadingBlock className="min-h-0 flex-1" label={t("wiki.pageLoading")} />
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
