import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { GitDiffFileSummary } from "@agents-remote/shared";
import { discardProjectGit } from "../../api/client";
import { useT } from "../../i18n";
import { shellSurfaceClasses } from "../shell/shell-primitives";
import { gitDiffListQueryKey, gitLogQueryKey } from "./git-diff-viewer";
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";
import { isUntrackedGitFile } from "./commit-sheet";

/**
 * 03m3 放弃更改弹层单源（v1.4 批5）：iOS 居中 Alert 形制（同 03w2 RenameDialog 容器，
 * 两端同款居中不分流）。tracked = 描述行（恢复到 {{branch}} 上次提交 + numstat +N −M
 * 无法撤销）；untracked = 红警示块 .awarn（放弃将删除文件，无描述行）。
 * mutation 内嵌（discardProjectGit 单路径），成功失效 diff 列表 + 全分支 log key 后关层。
 */
export function DiscardDialog({
  open,
  onOpenChange,
  projectName,
  branch,
  file,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectName: string;
  /** 当前分支名（描述「恢复到 main 上一次提交」）；detached 传 "HEAD"。 */
  branch: string;
  /** 目标变更行（行菜单「放弃更改…」持有）。 */
  file: GitDiffFileSummary;
}) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const discardMutation = useMutation({
    mutationFn: () => discardProjectGit(projectName, [file.path]),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: gitDiffListQueryKey(projectName) });
      // 同 CommitSheet：前缀失效全分支 log key。
      void queryClient.invalidateQueries({ queryKey: gitLogQueryKey(projectName).slice(0, 4) });
      onOpenChange(false);
    },
  });

  const untracked = isUntrackedGitFile(file);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-xs sm:max-w-xs">
        <div
          className={`rounded-2xl p-5 text-center shadow-2xl shadow-black/40 ${shellSurfaceClasses.workspace}`}
        >
          <DialogTitle className="text-base font-bold text-on-surface">
            {t("git.discardTitle")}
          </DialogTitle>
          {untracked ? (
            <div className="awarn">{t("git.discardUntrackedWarn")}</div>
          ) : (
            <p className="mt-1 text-xs leading-5 text-on-surface-muted">
              {t("git.discardDesc", {
                branch,
                added: file.addedLines ?? 0,
                removed: file.removedLines ?? 0,
              })}
            </p>
          )}
          {discardMutation.isError ? (
            <div className="mt-1.5 text-[11px] text-error" role="alert">
              {discardMutation.error.message}
            </div>
          ) : null}
          <div className="mt-3 flex border-t border-neutral-line">
            <button
              className="min-h-[44px] flex-1 text-sm text-on-surface-soft transition active:bg-on-surface/5"
              onClick={() => onOpenChange(false)}
              type="button"
            >
              {t("cancel")}
            </button>
            <button
              className="min-h-[44px] flex-1 border-l border-neutral-line text-sm font-semibold text-error transition active:bg-on-surface/5"
              disabled={discardMutation.isPending}
              onClick={() => discardMutation.mutate()}
              type="button"
            >
              {t("git.discardBtn")}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
