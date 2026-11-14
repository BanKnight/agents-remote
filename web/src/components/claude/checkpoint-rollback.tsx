import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuiState } from "@assistant-ui/react";
import type { OverviewResponse, SessionCheckpointSummary } from "@agents-remote/shared";
import { fetchOverview, getAgentSession, isApiErrorCode } from "../../api/client";
import { useT } from "../../i18n";
import {
  useRollbackCheckpoint,
  useSessionCheckpointDiff,
  useSessionCheckpoints,
} from "../../hooks/session-checkpoints";
import { useIsMobile } from "@/lib/use-is-mobile";
import { LucideIcon } from "../shell/lucide-icon";
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";
import { MobileSheet, SHEET_UNMOUNT_DELAY_MS } from "../shell/mobile-sheet";
import { ActionButton, isTurnActive, shellSurfaceClasses } from "../shell/shell-primitives";
import { DiffContent, GitStatusBadge } from "../git/git-diff-viewer";
import { useConfirm } from "../shell/confirm-dialog";

/**
 * Turn checkpoint 入口 + 回滚浮层（docs/design/checkpoint-rollback.md §4）。
 * 目标（ordinal/commit）挂会话级 state、经 context 下发到消息级入口按钮——
 * 浮层单例，不会每条消息各起一份（frontend-notes §3 结构关系收敛成 state）。
 */

export type CheckpointTarget = { ordinal: number; commit: string };

export const CheckpointUIContext = createContext<{
  projectName: string;
  sessionId: string;
  /** 会话级单订阅（provider 持 query）：每条消息各调一次 hook 会变成 N 个订阅方。 */
  checkpoints: SessionCheckpointSummary[];
  openCheckpoint: (t: CheckpointTarget) => void;
} | null>(null);

export function CheckpointEntryButton() {
  const ctx = useContext(CheckpointUIContext);
  // context 缺失时不能提前返回后仍调 hooks：hooks 收进内层组件，条件挂载。
  if (!ctx) return null;
  return (
    <CheckpointEntryButtonInner checkpoints={ctx.checkpoints} openCheckpoint={ctx.openCheckpoint} />
  );
}

function CheckpointEntryButtonInner({
  checkpoints,
  openCheckpoint,
}: {
  checkpoints: SessionCheckpointSummary[];
  openCheckpoint: (t: CheckpointTarget) => void;
}) {
  const { t } = useT();
  const message = useAuiState((s) => s.message);
  const custom = message.metadata?.custom as Record<string, unknown> | undefined;
  const uuids = custom?.sourceUuids as string[] | undefined;
  // 消息 uuid 命中本轮锚 = 这条用户消息有可回滚的 turn 快照（同 query 与浮层共用，无第二管道）。
  const match = checkpoints.find(
    (checkpoint) => checkpoint.anchorUuid !== null && uuids?.includes(checkpoint.anchorUuid),
  );
  if (!match) return null;
  const label = t("workbench.checkpoint.viewTurnChanges");
  return (
    <button
      aria-label={label}
      className="inline-flex cursor-pointer items-center justify-center rounded p-1 text-on-surface-muted transition hover:text-on-surface-soft touch:h-10 touch:w-10"
      onClick={() => openCheckpoint({ ordinal: match.ordinal, commit: match.commit })}
      title={label}
      type="button"
    >
      {/* undo-2：回滚/回到该点语义；history 已被「会话历史」占用（frontend-notes §15）。 */}
      <LucideIcon className="h-3 w-3" name="undo-2" />
    </button>
  );
}

export function CheckpointRollbackDialog({
  target,
  onClose,
  projectName,
  sessionId,
}: {
  target: CheckpointTarget | null;
  onClose: () => void;
  projectName: string;
  sessionId: string;
}) {
  if (!target) return null;
  return (
    <CheckpointRollbackPanel
      onClose={onClose}
      projectName={projectName}
      sessionId={sessionId}
      target={target}
    />
  );
}

function CheckpointRollbackPanel({
  target,
  onClose,
  projectName,
  sessionId,
}: {
  target: CheckpointTarget;
  onClose: () => void;
  projectName: string;
  sessionId: string;
}) {
  const { t } = useT();
  const isMobile = useIsMobile();
  // 受控关闭桥：`open` 恒 true 时父级置 target=null 会在下一帧卸载整棵树，sheet 滑出/
  // dialog 淡出全被截断（frontend-notes §9），且与 DismissableLayer 清理序竞态（body 残留
  // pointer-events:none）。先内部 open=false 播完 exit，再延迟通知父级卸载——先例
  // runtime-config-dialog.tsx（SHEET_UNMOUNT_DELAY_MS 契约）。
  const [open, setOpen] = useState(true);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    },
    [],
  );
  const requestClose = () => {
    // 双击/scrim+动画回调可能重入：只排一个卸载定时器。
    if (closeTimerRef.current) return;
    setOpen(false);
    closeTimerRef.current = setTimeout(onClose, SHEET_UNMOUNT_DELAY_MS);
  };

  const title = t("workbench.checkpoint.title", { ordinal: target.ordinal });
  const body = (
    <CheckpointRollbackBody
      onClose={requestClose}
      projectName={projectName}
      sessionId={sessionId}
      target={target}
    />
  );

  // 容器分流（移动 sheet / 桌面 dialog），内容同一个 Body。
  if (isMobile) {
    return (
      <MobileSheet
        aside={
          // 触屏正常态/禁用态都要有明确退出口（桌面另有 Esc/scrim）；先例 commit-sheet。
          <button className="cursor-pointer text-inherit" onClick={requestClose} type="button">
            {t("cancel")}
          </button>
        }
        onOpenChange={(next) => !next && requestClose()}
        open={open}
        title={title}
      >
        {body}
      </MobileSheet>
    );
  }

  return (
    <Dialog onOpenChange={(next) => !next && requestClose()} open={open}>
      <DialogContent aria-describedby={undefined} className="max-w-2xl sm:max-w-2xl">
        <div
          className={`rounded-2xl p-5 shadow-2xl shadow-black/40 ${shellSurfaceClasses.workspace}`}
        >
          <DialogTitle className="text-base font-semibold text-on-surface">{title}</DialogTitle>
          <div className="mt-3">{body}</div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CheckpointRollbackBody({
  onClose,
  projectName,
  sessionId,
  target,
}: {
  onClose: () => void;
  projectName: string;
  sessionId: string;
  target: CheckpointTarget;
}) {
  const { t } = useT();
  const { confirm, holder } = useConfirm();
  const [restoreFiles, setRestoreFiles] = useState(true);
  const [restoreConversation, setRestoreConversation] = useState(true);
  // 错误码分流（契约 §3.7）：不同码给不同人话，未命中才落原始 message。
  const rollbackErrorText = (error: unknown): string => {
    if (isApiErrorCode(error, "CHECKPOINT_NOT_FOUND")) return t("workbench.checkpoint.missing");
    if (isApiErrorCode(error, "CHECKPOINT_CONFLICT")) return t("workbench.checkpoint.conflict");
    if (isApiErrorCode(error, "CHECKPOINT_BUSY")) return t("workbench.checkpoint.busyWarning");
    if (isApiErrorCode(error, "CONVERSATION_ROLLBACK_UNAVAILABLE"))
      return t("workbench.checkpoint.conversationUnavailable");
    return error instanceof Error ? error.message : String(error);
  };

  const detail = useQuery({
    queryKey: ["projects", projectName, "agent-sessions", sessionId],
    queryFn: () => getAgentSession(projectName, sessionId),
  });
  const session = detail.data?.session;
  // 两档分开：`running` 才是「会话真在跑」（显示运行中警示）；`busy` 另含「详情未加载」
  // （只禁用按钮，不谎报会话在运行）。
  const running = Boolean(session) && isTurnActive(session!.status);
  const busy = !session || running;
  // 与服务端前置闸同口径：terminal 形态（tmux 里打字）没有上行锚 uuid，对话回滚不可用。
  const canConversationRollback = Boolean(session?.claudeSessionId) && session?.mode !== "terminal";
  // 生效值单源：请求 body 与按钮 disabled 判据用同一份——「勾着但不可用」不算有生效动作，
  // 否则能点到必得 400 的回滚。
  const conversationEffective = restoreConversation && canConversationRollback;
  const nothingSelected = !restoreFiles && !conversationEffective;

  // 其它 active 会话警示：共享工作区，恢复会波及它们未提交的成果（契约 §4）。读既有
  // ["overview"] 缓存（enabled:false 只订阅、不另起请求；壳帧已保鲜），取不到按 0 处理。
  const overview = useQuery<OverviewResponse>({
    enabled: false,
    queryFn: fetchOverview,
    queryKey: ["overview"],
  });
  const otherRunning = (overview.data?.candidates ?? []).filter(
    (candidate) =>
      candidate.projectName === projectName &&
      candidate.sessionId !== sessionId &&
      (candidate.status === "working" || candidate.status === "blocked"),
  ).length;

  const diffQuery = useSessionCheckpointDiff(projectName, sessionId, target.ordinal);
  const rollback = useRollbackCheckpoint(projectName, sessionId);
  const list = useSessionCheckpoints(projectName, sessionId);
  const summary =
    list.data && list.data.repository
      ? list.data.checkpoints.find((checkpoint) => checkpoint.ordinal === target.ordinal)
      : undefined;
  const diff = diffQuery.data;

  if (rollback.isSuccess) {
    const result = rollback.data;
    // 服务端在恢复后回传 `busy_session:<id>`：共享工作区里同时运行的会话成果被一并覆盖，
    // 必须显式告知（否则用户以为只影响本会话）。
    const busyAffected = (result?.warnings ?? []).filter((warning) =>
      warning.startsWith("busy_session:"),
    ).length;
    return (
      <div className="flex flex-col gap-3 text-sm text-on-surface">
        <p>{t("workbench.checkpoint.rollbackDone", { ordinal: target.ordinal })}</p>
        {result?.backupRef ? (
          <p className="text-xs text-on-surface-muted">{t("workbench.checkpoint.backupNote")}</p>
        ) : null}
        {(result?.warnings ?? []).includes("conversation_rollback_failed") ? (
          <p
            className={`rounded-xl px-3 py-2 text-xs text-error-text ${shellSurfaceClasses.danger}`}
            role="alert"
          >
            {t("workbench.checkpoint.conversationRollbackFailed")}
          </p>
        ) : null}
        {busyAffected > 0 ? (
          <p
            className={`rounded-xl px-3 py-2 text-xs text-warning-text ${shellSurfaceClasses.warning}`}
            role="status"
          >
            {t("workbench.checkpoint.busySessionsAffected", { count: busyAffected })}
          </p>
        ) : null}
        <ActionButton className="w-full" onClick={onClose}>
          {t("session.close")}
        </ActionButton>
        {holder}
      </div>
    );
  }

  const handleRollback = async () => {
    const ok = await confirm({
      cancelLabel: t("cancel"),
      confirmLabel: t("workbench.checkpoint.confirmRollback"),
      // 文案随勾选组合变化：只说真实会发生的事（破坏性确认不能过度承诺对话截断）。
      message: conversationEffective
        ? t("workbench.checkpoint.confirmMessage", { ordinal: target.ordinal })
        : t("workbench.checkpoint.confirmMessageFilesOnly", { ordinal: target.ordinal }),
      title: t("workbench.checkpoint.confirmTitle", { ordinal: target.ordinal }),
      tone: "danger",
    });
    if (!ok) return;
    rollback.mutate({
      expectedCommit: target.commit,
      ordinal: target.ordinal,
      // 两开关独立（契约 §4）：只回对话不动文件是合法意图。
      restoreConversation: conversationEffective,
      restoreFiles,
    });
  };

  return (
    <div className="flex flex-col gap-3 text-sm text-on-surface">
      {summary ? (
        <p className="text-xs text-on-surface-muted">
          {t("workbench.checkpoint.statsLine", {
            deletions: summary.deletions,
            files: summary.filesChanged,
            insertions: summary.insertions,
          })}
        </p>
      ) : null}

      {running ? (
        <p
          className={`rounded-xl px-3 py-2 text-xs text-warning-text ${shellSurfaceClasses.warning}`}
          role="status"
        >
          {t("workbench.checkpoint.busyWarning")}
        </p>
      ) : otherRunning > 0 ? (
        <p
          className={`rounded-xl px-3 py-2 text-xs text-warning-text ${shellSurfaceClasses.warning}`}
          role="status"
        >
          {t("workbench.checkpoint.otherSessionsRunning", { count: otherRunning })}
        </p>
      ) : null}

      <div className={`max-h-[45vh] overflow-y-auto rounded-xl ${shellSurfaceClasses.inset}`}>
        {diffQuery.isLoading ? (
          <p className="px-3 py-2 text-xs text-on-surface-muted">{t("git.loadingDiff")}</p>
        ) : diffQuery.error ? (
          <p className="px-3 py-2 text-xs text-on-surface-muted">
            {t("workbench.checkpoint.diffLoadFailed")}
          </p>
        ) : diff ? (
          diff.files.length === 0 && !diff.truncated ? (
            <p className="px-3 py-2 text-xs text-on-surface-muted">
              {t("workbench.checkpoint.noChanges")}
            </p>
          ) : (
            <>
              {diff.files.map((file) => (
                <div className="border-b border-neutral-line/30 last:border-b-0" key={file.path}>
                  {/* 逐文件层级：路径 + 状态角标（DiffContent 只渲染行，不带文件头）。 */}
                  <div className="flex items-center gap-2 px-3 py-1.5">
                    <GitStatusBadge status={file.status} />
                    <span className="min-w-0 truncate font-mono text-[0.68rem] text-on-surface-soft">
                      {file.path}
                    </span>
                  </div>
                  <DiffContent diff={file.diff} filePath={file.path} />
                </div>
              ))}
              {diff.truncated ? (
                <p className="px-3 py-2 text-xs text-on-surface-muted">
                  {t("workbench.checkpoint.diffTruncated")}
                </p>
              ) : null}
            </>
          )
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <label className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2 py-1.5 text-sm text-on-surface hover:bg-neutral-line/40">
          <input
            checked={restoreFiles}
            className="accent-primary"
            onChange={(event) => setRestoreFiles(event.target.checked)}
            type="checkbox"
          />
          {t("workbench.checkpoint.restoreFiles")}
        </label>
        <label
          className={`flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-sm text-on-surface ${
            canConversationRollback ? "cursor-pointer hover:bg-neutral-line/40" : "opacity-50"
          }`}
        >
          <input
            checked={restoreConversation && canConversationRollback}
            className="accent-primary"
            disabled={!canConversationRollback}
            onChange={(event) => setRestoreConversation(event.target.checked)}
            type="checkbox"
          />
          <span className="flex flex-col">
            {t("workbench.checkpoint.restoreConversation")}
            {canConversationRollback ? null : (
              <span className="text-xs text-on-surface-muted">
                {t("workbench.checkpoint.conversationUnavailable")}
              </span>
            )}
          </span>
        </label>
      </div>

      {rollback.error ? (
        <p
          className={`rounded-xl px-3 py-2 text-xs text-error-text ${shellSurfaceClasses.danger}`}
          role="alert"
        >
          {rollbackErrorText(rollback.error)}
        </p>
      ) : null}

      <div className="flex gap-2">
        <ActionButton className="flex-1" onClick={onClose} tone="muted">
          {t("cancel")}
        </ActionButton>
        <ActionButton
          className="flex-1"
          disabled={busy || rollback.isPending || nothingSelected}
          onClick={handleRollback}
          tone="danger"
        >
          {t("workbench.checkpoint.rollback")}
        </ActionButton>
      </div>
      {holder}
    </div>
  );
}
