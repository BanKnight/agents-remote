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
  | { kind: "turn_continue" } // TUI 工具执行完/失败(PostToolUse 系 hooks):turn 存活证据。chat 链
  // turn_activity 的 TUI 等价物,但 blocked 下有效(工具真执行了 = 审批真解决了)
  | { kind: "approval_requested" } // can_use_tool 登记;仅 working → blocked
  | { kind: "approval_settled" } // 该 runtime 最后一张审批卡注销,回 working
  | { kind: "turn_interrupted" } // 用户主动打断(interrupt ack success 即收口,不等 CLI result)
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
      // blocked 下忽略(OSC 7501 blocked 优先):blocked 的退出由 settled 驱动——
      // 审批挂起期间的插话由 CLI 排队、后台任务的 assistant 帧照达,都不能替代
      // settled 信号,翻 working 会谎报审批已解决。
      return current === "idle" || current === "done" || current === "error"
        ? "working"
        : undefined;
    case "turn_continue":
      // 工具执行完/失败 = turn 存活(TUI PostToolUse 系)。blocked → working(settled 本源:
      // 审批通过工具才执行);error/done/idle 滞留被现实翻正(turn 在飞——StopFailure 后
      // CLI 恢复继续跑,红点滞留到 turn 结束的真根因,2026-10-19 用户真机反馈);working
      // 幂等;closed 吸收。
      if (current === "closed" || current === "working") return undefined;
      return "working";
    case "approval_requested":
      // 审批只能出现在 turn 中;idle/done/error 下收到 = 信号错序,防御性忽略。
      return current === "working" ? "blocked" : undefined;
    case "approval_settled":
      // deny/allow/撤卡后 CLI 继续本轮 turn → 回 working(仅 blocked 有意义)。
      return current === "blocked" ? "working" : undefined;
    case "turn_interrupted":
      // 用户主动打断 = 正常收尾,不是错误(≠ turn_result{isError:true} 的 error 态):
      // working/blocked → done;idle/done/error 无 turn 可断(幂等短路),closed 吸收。
      // 协议事实(2026-11-24 探针,CLI 2.1.325 无头 stream-json):interrupt 打断执行中
      // turn 时 CLI 发 ack(success) → tool_result 中断帧 → [Request interrupted by user]
      // → result{subtype:"error_during_execution",is_error:true}——不是协议文档
      // claude-cli-stream-protocol.md 所写的 subtype:"interrupted"(字段名漂移),更不是
      // 旧版生产注释的「CLI 不发 result」。error_during_execution 语义上是 CLI 对
      // 「turn 非自然完成」的机械分类,用户主动打断不该被渲染成 error 红态,api 端在
      // ack 时即以本信号收口(见 claude-runtime capture 链),后续 result 不再迁移。
      return current === "working" || current === "blocked" ? "done" : undefined;
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
