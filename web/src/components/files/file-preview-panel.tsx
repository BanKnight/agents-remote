// 中栏 file tab 预览（v1.5 批 4，spec §4.5 预览矩阵·桌面）：FilePreviewPane 中栏形态单源
//（与移动面板/push 同一主体，variant="desktop" 档：无移动底部空间 + aux 无收起键盘钮）。
// v2 §6.10-8 的「桌面预览只读化」（03q 铁律 7）随 v1.5 正式翻案——05h4 原型中栏文件标签
// 编辑态（pencil 进 / .emeta+.aux / 完成·放弃），编辑受控态在 workbenchFileTabEditingAtom
//（GroupHeader pencil 与本 body 跨组件共享，同屏单编辑）。
//
// `path` = **全路径**（含项目名前缀如 `"demo/src/index.ts"`），内部 `resolveRootBrowseTarget`
// 解析 projectName + 项目相对路径，走现有 project preview API（无需新 endpoint）。全局/项目点
// 同一文件复用同一 tab → 同一 FileTabPreview（queryKey 按全路径天然一致）。
//
// 「查看 diff」入口在 tabstrip 右端 ⋯（FileTabStripActions，开中栏 git tab——spec §4.5
// diff = 中栏标签），body 内无 diff 钮（对齐 05h 原型）。
import { type GitDiffScope } from "@agents-remote/shared";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";

import { useT } from "../../i18n";
import { tabIdOf, workbenchFileTabEditingAtom } from "../../routes/workbench-model";
import type { FilePanelRef } from "../../routes/workbench-model";
import { FilePreviewNavMenu, FilePreviewPane } from "../workbench/mobile-l3";
import { ShellIcon } from "../shell/icons";
import { resolveRootBrowseTarget } from "./file-browser";
import { useFilePreview } from "./use-file-editor";

/** file tab 预览的 query scope（与 inspection "files" 隔离，避免缓存互污，设计 §6 决策 16）。
 *  tabstrip 右端 FileTabStripActions（pencil 判定 + ⋯ 菜单）与 body 同 key dedupe 零额外网络。 */
export const FILE_NAV_QUERY_SCOPE = "file-nav";

/** file tab body（中栏）：FilePreviewPane desktop 档，编辑态受控于 workbenchFileTabEditingAtom
 *  （值 = 本 tab 的 tabId）。卸载（切 tab/关 tab）cleanup 清 atom（若指向本 tab）——中栏 tab
 *  切换即卸载（非移动叠层保活），切回回预览态（编辑草稿随之丢弃，diverge 记档：原型无切走
 *  保草稿交互）。 */
export function FileTabPreview({ panelRef }: { panelRef: FilePanelRef }) {
  const setEditingTabId = useSetAtom(workbenchFileTabEditingAtom);
  const editingNow = useAtomValue(workbenchFileTabEditingAtom) === tabIdOf(panelRef);
  const tabId = tabIdOf(panelRef);
  const target = resolveRootBrowseTarget(panelRef.path);
  const projectName = target.kind === "project" ? target.projectName : panelRef.path;
  const relativePath = target.kind === "project" ? target.relativePath : "";
  useEffect(() => {
    return () => {
      setEditingTabId((prev) => (prev === tabId ? null : prev));
    };
  }, [setEditingTabId, tabId]);
  return (
    <FilePreviewPane
      editingActions="meta"
      editing={editingNow}
      onEditingChange={(next) => setEditingTabId(next ? tabId : null)}
      path={relativePath}
      projectName={projectName}
      queryScope={FILE_NAV_QUERY_SCOPE}
      variant="desktop"
    />
  );
}

/**
 * tabstrip 右端 file tab 动作族（v1.5 批 4，spec §4.5：[编辑][⋯]——pencil 条件出现（text
 * 类型），⋯ = 复制内容/复制路径/查看 diff（与移动 FilePreviewNavMenu 同一 items 单源）。
 * preview query 与 body 同 FILE_NAV_QUERY_SCOPE key dedupe 零额外网络。
 */
export function FileTabStripActions({
  onOpenDiff,
  panelRef,
}: {
  /** 开中栏 git diff tab（WorkbenchRoute.onOpenGitFile 透传）；不传时 ⋯ 无查看 diff 项。 */
  onOpenDiff?: (projectName: string, scope: GitDiffScope, path: string) => void;
  panelRef: FilePanelRef;
}) {
  const { t } = useT();
  const setEditingTabId = useSetAtom(workbenchFileTabEditingAtom);
  const target = resolveRootBrowseTarget(panelRef.path);
  const projectName = target.kind === "project" ? target.projectName : panelRef.path;
  const relativePath = target.kind === "project" ? target.relativePath : "";
  const { data } = useFilePreview(projectName, relativePath, FILE_NAV_QUERY_SCOPE);
  const editable = data?.type === "text";
  return (
    <>
      {editable ? (
        <button
          aria-label={t("files.edit")}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-on-surface-muted transition hover:bg-on-surface/5 hover:text-on-surface active:bg-on-surface/10"
          onClick={() => setEditingTabId(tabIdOf(panelRef))}
          title={t("files.edit")}
          type="button"
        >
          <ShellIcon className="h-3 w-3" name="edit" />
        </button>
      ) : null}
      <FilePreviewNavMenu
        onViewDiff={
          data?.type === "text" && onOpenDiff
            ? () => onOpenDiff(projectName, "worktree", relativePath)
            : undefined
        }
        path={relativePath}
        projectName={projectName}
        queryScope={FILE_NAV_QUERY_SCOPE}
        triggerClassName="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-on-surface-muted transition hover:bg-on-surface/5 hover:text-on-surface active:bg-on-surface/10"
      />
    </>
  );
}
