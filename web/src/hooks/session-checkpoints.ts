import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { RollbackCheckpointResponse } from "@agents-remote/shared";
import {
  getSessionCheckpointDiff,
  listSessionCheckpoints,
  rollbackSessionCheckpoint,
} from "../api/client";

/**
 * Turn checkpoint（T3 学习点③，见 docs/design/checkpoint-rollback.md）：
 * - `useSessionCheckpoints`：会话全部 turn 快照（refs 投影，轻量）。入口判断（某条用户
 *   消息有无可点入口）与浮层数据同源——同一 query，不第二条管道。
 * - `useSessionCheckpointDiff`：按需取某轮 per-turn diff（打开浮层才拉）。
 * - `useRollbackCheckpoint`：破坏性动作（强确认在 UI 层），成功后重置该会话的三层缓存
 *   ——回滚会 fork 出新 claudeSessionId，详情投影必须重新拉取。
 */

const checkpointsKey = (projectName: string, sessionId: string) => [
  "projects",
  projectName,
  "agent-sessions",
  sessionId,
  "checkpoints",
];

export function useSessionCheckpoints(projectName: string, sessionId: string) {
  return useQuery({
    queryKey: checkpointsKey(projectName, sessionId),
    queryFn: () => listSessionCheckpoints(projectName, sessionId),
    // 非 git 项目返回 repository:false 是稳定终态，不重试。
    retry: false,
  });
}

export function useSessionCheckpointDiff(
  projectName: string,
  sessionId: string,
  ordinal: number | null,
) {
  return useQuery({
    queryKey: [...checkpointsKey(projectName, sessionId), "diff", ordinal],
    queryFn: () => {
      if (ordinal === null) throw new Error("ordinal required");
      return getSessionCheckpointDiff(projectName, sessionId, ordinal);
    },
    enabled: ordinal !== null,
  });
}

export function useRollbackCheckpoint(projectName: string, sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      ordinal: number;
      restoreFiles: boolean;
      restoreConversation: boolean;
      expectedCommit: string;
    }): Promise<RollbackCheckpointResponse> =>
      rollbackSessionCheckpoint(projectName, sessionId, vars.ordinal, {
        restoreFiles: vars.restoreFiles,
        restoreConversation: vars.restoreConversation,
        expectedCommit: vars.expectedCommit,
      }),
    onSettled: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ["overview"] }),
        // 回滚 fork 出新 claudeSessionId：详情投影（含 session 元数据）必须重拉。
        qc.invalidateQueries({
          exact: true,
          queryKey: ["projects", projectName, "agent-sessions", sessionId],
        }),
        qc.invalidateQueries({ queryKey: checkpointsKey(projectName, sessionId) }),
      ]),
  });
}
