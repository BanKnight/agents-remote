import type { ApprovalSummary } from "@agents-remote/shared";

/**
 * M5-b 审批中心登记表（docs/design/redesign-v2.md §6.4）。
 *
 * 纯内存状态层：登记于 CLI stdout 的 can_use_tool control_request；注销于
 * control_response 转发（WS 会话内应答 / REST 审批中心应答）、CLI result 帧、
 * 进程退出。完整 input 只在内存（respond allow 时原样回填 updatedInput），
 * 不进任何序列化协议、不落盘。
 */

/** 审批中心单条登记。inputSummary 登记时定格（快照零计算）。 */
export type ApprovalRecord = {
  runtimeKey: string;
  projectName: string;
  sessionId: string;
  controlRequestId: string;
  toolName: string;
  input: Record<string, unknown>;
  /** input 一行摘要（原型 11 acard .cmd）。 */
  inputSummary: string;
  createdAt: string;
};

/** 摘要截断上限：一行 mono 摘要的 payload 上界（超出以 … 收尾）。 */
const INPUT_SUMMARY_MAX_CHARS = 80;

/** 摘要优先取的语义字段（命令/路径类工具一行可读；其余压 JSON）。 */
const SEMANTIC_INPUT_KEYS = [
  "command",
  "file_path",
  "notebook_path",
  "path",
  "pattern",
  "url",
] as const;

/** control_request.input → 原型 11 acard .cmd 一行摘要（纯函数，导出供测试）。 */
export function summarizeControlInput(toolName: string, input: Record<string, unknown>): string {
  const semantic = SEMANTIC_INPUT_KEYS.map((key) => input[key]).find(
    (value) => typeof value === "string" && value.length > 0,
  );
  const raw =
    typeof semantic === "string"
      ? `${toolName}: ${semantic}`
      : `${toolName} ${JSON.stringify(input)}`;
  const oneLine = raw.replace(/\s+/g, " ").trim();
  return oneLine.length > INPUT_SUMMARY_MAX_CHARS
    ? `${oneLine.slice(0, INPUT_SUMMARY_MAX_CHARS)}…`
    : oneLine;
}

export class ApprovalRegistry {
  /** runtimeKey → requestId → record（同 runtime 多个并发审批并存）。 */
  private readonly entries = new Map<string, Map<string, ApprovalRecord>>();
  /** registry 实际变更回调（approvals-stream 全量快照推送）。无变化不触发。 */
  onChange: (() => void) | null = null;

  register(record: ApprovalRecord): void {
    let byRequest = this.entries.get(record.runtimeKey);
    if (!byRequest) {
      byRequest = new Map();
      this.entries.set(record.runtimeKey, byRequest);
    }
    byRequest.set(record.controlRequestId, record);
    this.onChange?.();
  }

  /** 单条注销（control_response 转发路径）。返回是否确有删除。 */
  unregister(runtimeKey: string, controlRequestId: string): boolean {
    const byRequest = this.entries.get(runtimeKey);
    if (!byRequest?.delete(controlRequestId)) return false;
    if (byRequest.size === 0) this.entries.delete(runtimeKey);
    this.onChange?.();
    return true;
  }

  /** runtime 收口（result 帧 / 进程退出）：该 runtime 全部 pending 作废。返回是否确有删除。 */
  clearRuntime(runtimeKey: string): boolean {
    if (!this.entries.delete(runtimeKey)) return false;
    this.onChange?.();
    return true;
  }

  list(): ApprovalRecord[] {
    const all: ApprovalRecord[] = [];
    for (const byRequest of this.entries.values()) {
      for (const record of byRequest.values()) all.push(record);
    }
    return all;
  }

  find(
    projectName: string,
    sessionId: string,
    controlRequestId: string,
  ): ApprovalRecord | undefined {
    return this.list().find(
      (record) =>
        record.projectName === projectName &&
        record.sessionId === sessionId &&
        record.controlRequestId === controlRequestId,
    );
  }

  /** 快照投影（§6.4 字段面）：aliveKeys 判活 + 显示名回填 + 最新在前。 */
  snapshot(
    aliveKeys: ReadonlySet<string>,
    resolveSessionName: (record: ApprovalRecord) => string,
  ): ApprovalSummary[] {
    return this.list()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((record) => ({
        projectName: record.projectName,
        sessionId: record.sessionId,
        sessionName: resolveSessionName(record),
        runtimeKey: record.runtimeKey,
        controlRequestId: record.controlRequestId,
        toolName: record.toolName,
        inputSummary: record.inputSummary,
        createdAt: record.createdAt,
        runtimeAlive: aliveKeys.has(record.runtimeKey),
      }));
  }
}
