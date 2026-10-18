// Agent 会话 turn 状态机(纯函数,OSC 7501 对齐)。信号 → 迁移表 → 下一状态;
// undefined = 无迁移(调用方短路:不广播不落盘)。信号源:用户输入/CLI 自启 turn
// 活跃(stdout 注入 echo、assistant 帧)/ 审批挂起与注销(ApprovalRegistry 同一
// 采集点)/ result 帧。
// 跨重启恢复不在本文件:metadata 落盘权威(session-registry.parseMetadata 归一)。

import type { AgentSessionStatus } from "@agents-remote/shared";

export type AgentStatusSignal =
  | { kind: "user_input" } // 用户提交消息 / auto-retry 注入生效(= 自动替用户发消息)
  | { kind: "turn_activity" } // CLI 自启 turn 的证据(stdout assistant 帧:task-notification 消费/subagent
  // hand-back 等不经用户输入的 turn)——error/done 滞留由此翻回 working
  | { kind: "approval_requested" } // can_use_tool 登记;仅 working → blocked
  | { kind: "approval_settled" } // 该 runtime 最后一张审批卡注销,回 working
  | { kind: "turn_result"; isError: boolean } // result 帧
  | { kind: "close" }; // 用户关闭会话

export function nextAgentSessionStatus(
  current: AgentSessionStatus,
  signal: AgentStatusSignal,
): AgentSessionStatus | undefined {
  switch (signal.kind) {
    case "user_input":
    case "turn_activity":
      // 用户再发消息即翻回 working(done/error 是「最近一轮」结果态,被替换);
      // working 下幂等(无迁移),closed 吸收一切。
      // blocked 下忽略(OSC 7501 blocked 优先):审批挂起期间 CLI 停在等审批,
      // 不会有新 turn 活跃/插话,收到即信号错序——等 settled 信号回 working。
      return current === "idle" || current === "done" || current === "error"
        ? "working"
        : undefined;
    case "approval_requested":
      // 审批只能出现在 turn 中;idle/done/error 下收到 = 信号错序,防御性忽略。
      return current === "working" ? "blocked" : undefined;
    case "approval_settled":
      // deny/allow/撤卡后 CLI 继续本轮 turn → 回 working(仅 blocked 有意义)。
      return current === "blocked" ? "working" : undefined;
    case "turn_result":
      // turn 结束:正常 done / 出错 error(最近一轮结果态,存活到被替换);
      // closed 吸收(关闭后的 late stdout 不再翻状态)。
      if (current === "closed") return undefined;
      return signal.isError ? "error" : "done";
    case "close":
      return current === "closed" ? undefined : "closed";
  }
}

/** spawn 初始状态(重启恢复,P1-2):落盘值只有 done/error 值得带进新进程——CLI 子进程
 *  已随 API 重启死亡,running/working/blocked 语义无效,统一归 idle(与 parseMetadata
 *  归一同口径;入参是宽 string:磁盘存量值不经内存归一时可能是任意历史值)。 */
export function spawnInitialStatus(persisted: string): AgentSessionStatus {
  return persisted === "done" || persisted === "error" ? persisted : "idle";
}
