import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import type { GitDiffFileSummary } from "@agents-remote/shared";
import { commitProjectGit } from "../../api/client";
import { useT } from "../../i18n";
import { useIsMobile } from "../../lib/use-is-mobile";
import { shellSurfaceClasses } from "../shell/shell-primitives";
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";
import { MobileSheet } from "../shell/mobile-sheet";
import { gitDiffListQueryKey, gitLogQueryKey, GitStatusBadge } from "./git-diff-viewer";

/**
 * 03m2 untracked 行判定：worktree scope + status added + 无 numstat（untracked 来自
 * ls-files --others，天然无行数；用户已 git add 的新增行有 numstat，不属此类）。
 * 提交清单默认不勾（防密钥误提交）、放弃弹层据此显示「删除文件」红警示。
 */
export const isUntrackedGitFile = (file: GitDiffFileSummary): boolean =>
  file.scope === "worktree" && file.status === "added" && file.addedLines === null;

/**
 * 03m2 提交 sheet 单源（v1.4 批5）：勾选清单（.crow2 行，M/A/D/R 默认勾、untracked 默认
 * 不勾）+ 提交信息 .cmsgin（必填，空禁用）+ .cbtn「提交（N 个文件）」。mutation 内嵌
 *（commitProjectGit），成功失效 diff 列表 + 全分支 log key 后关层。
 *
 * 多端同容器：移动 = MobileSheet（03m2 原型形态），桌面 = 居中 Dialog（04c 形制），内容
 * 同一段。勾选按 path 记（同 path 的 staged/worktree 双行联动——服务端 commit 语义即该
 * path 全部未提交变更收编）；sheet 内不做 diff 复核（03m2 ③ 记 diverge，L3 层级过深）。
 */
export function CommitSheet({
  open,
  onOpenChange,
  projectName,
  branch,
  files,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectName: string;
  /** 当前分支名（标题「提交到 main」）；detached 传 "HEAD"。 */
  branch: string;
  /** 工作区变更列表（diff.data.files）。 */
  files: GitDiffFileSummary[];
}) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  // 勾选集（key = path）。初始默认勾随 files 快照走，open 沿重置——files 经 ref 取当轮
  // 值（deps 只 [open]，防父组件 refetch 传新数组引用把用户勾选冲掉）。
  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  const [message, setMessage] = useState("");
  const filesRef = useRef(files);
  filesRef.current = files;
  useEffect(() => {
    if (open) {
      setChecked(
        new Set(filesRef.current.filter((f) => !isUntrackedGitFile(f)).map((f) => f.path)),
      );
      setMessage("");
    }
  }, [open]);

  const commitMutation = useMutation({
    mutationFn: ({ paths, message: m }: { paths: string[]; message: string }) =>
      commitProjectGit(projectName, paths, m),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: gitDiffListQueryKey(projectName) });
      // 故意去掉 branch 尾维度：按前缀失效全分支 log key（当前分支 HEAD 变了，历史页
      // 无论停在哪个维度都该刷新；ahead-behind 态势随 diff 列表的 branch 字段一并更新）。
      void queryClient.invalidateQueries({ queryKey: gitLogQueryKey(projectName).slice(0, 4) });
      onOpenChange(false);
    },
  });

  const toggle = (path: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  // 信息必填 + 至少勾一行；提交中禁用防双击。
  const canCommit = checked.size > 0 && message.trim().length > 0 && !commitMutation.isPending;

  const body = (
    <div className="flex flex-col">
      {files.length === 0 ? (
        <div className="px-1 py-2 text-[12.5px] text-ink-2">{t("git.commitEmpty")}</div>
      ) : (
        <div>
          {files.map((file) => {
            const on = checked.has(file.path);
            return (
              <button
                aria-pressed={on}
                className="crow2 w-full cursor-pointer text-left"
                key={`${file.scope}/${file.path}`}
                onClick={() => toggle(file.path)}
                type="button"
              >
                <span aria-hidden="true" className={`cb ${on ? "on" : ""}`} />
                <span className="nm">{file.path}</span>
                <GitStatusBadge status={file.status} />
              </button>
            );
          })}
        </div>
      )}
      <textarea
        aria-label={t("git.commitMessagePlaceholder")}
        className="cmsgin"
        onChange={(e) => setMessage(e.target.value)}
        placeholder={t("git.commitMessagePlaceholder")}
        rows={3}
        value={message}
      />
      <button
        className="cbtn"
        disabled={!canCommit}
        onClick={() => commitMutation.mutate({ paths: [...checked], message: message.trim() })}
        type="button"
      >
        {t("git.commitBtn", { n: checked.size })}
      </button>
      {commitMutation.isError ? (
        <div className="mt-1.5 text-[11px] text-error" role="alert">
          {commitMutation.error.message}
        </div>
      ) : null}
    </div>
  );

  if (isMobile) {
    return (
      <MobileSheet
        aside={
          // 03m2 原型 sheet 头部取消（触屏禁用态下的明确退出路径）；桌面 = Esc/scrim。
          <button
            className="cursor-pointer text-inherit"
            onClick={() => onOpenChange(false)}
            type="button"
          >
            {t("cancel")}
          </button>
        }
        onOpenChange={onOpenChange}
        open={open}
        title={t("git.commitTitle", { branch })}
      >
        {body}
      </MobileSheet>
    );
  }
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-sm sm:max-w-sm">
        <div
          className={`rounded-2xl p-5 shadow-2xl shadow-black/40 ${shellSurfaceClasses.workspace}`}
        >
          <DialogTitle className="text-base font-semibold text-on-surface">
            {t("git.commitTitle", { branch })}
          </DialogTitle>
          {body}
        </div>
      </DialogContent>
    </Dialog>
  );
}
