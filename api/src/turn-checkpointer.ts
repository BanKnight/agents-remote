// Turn 级 checkpoint 编排层：把「上行 user 帧（beginTurn）→ stdout 消息 uuid 采集
//（noteOutputUuid）→ result 帧（endTurn）」串成每个 turn 的双端基线捕获。IO 全部委托
// CheckpointService，这里只做状态编排：ordinal 分配（重启后从现有 refs 最大值 +1 续编，
// 防冲突）、轮中排队消息归当前 turn（与 Claude 原生 checkpoint 的 "Messages sent
// mid-turn not checkpointed" 语义一致）、baseline 超时降级不阻塞 agent 上行。

import type { CheckpointService } from "./checkpoint-service";

/** 单个 runtime 进程的 in-flight turn 状态（endTurn 后移除）。 */
type InFlightTurn = {
  sessionId: string;
  projectPath: string;
  /** 0 = 占位中（ordinal 扫描尚未返回，endTurn 见 0 跳过 endpoint）。 */
  ordinal: number;
  anchorUuid: string | null;
  /** stdout 采集到的最后一条真实消息 uuid（下一轮对话回滚的截断锚）。 */
  lastUuid?: string;
};

export type TurnCheckpointerDeps = {
  checkpoints: CheckpointService;
  now?: () => Date;
};

export class TurnCheckpointer {
  private readonly inFlight = new Map<string, InFlightTurn>();
  /** runtimeKey → 已分配的最大 ordinal（API 重启后从 refs 现状推导，防冲突）。 */
  private readonly lastOrdinal = new Map<string, number>();
  private readonly deps: TurnCheckpointerDeps;

  constructor(deps: TurnCheckpointerDeps) {
    this.deps = deps;
  }

  /**
   * turn 开始：分配 ordinal + 异步捕获 baseline。已在 turn 中（排队消息）→ 跳过。
   * baseline 捕获失败/超时只降级（本轮无 baseline，diff 退化为相对上一轮 endpoint），
   * 绝不上抛——调用方 fire-and-forget，不阻塞 stdin 转发。
   */
  async beginTurn(input: {
    runtimeKey: string;
    sessionId: string;
    projectPath: string;
    anchorUuid?: string | null;
  }): Promise<void> {
    if (this.inFlight.has(input.runtimeKey)) return;

    // 判重与占位之间不允许出现 await：两帧并发上行时（快速连发）都会越过
    // inFlight.has → 各自扫描 refs → 拿到同一个 ordinal 互相覆盖。
    const entry: InFlightTurn = {
      sessionId: input.sessionId,
      projectPath: input.projectPath,
      ordinal: 0,
      anchorUuid: input.anchorUuid ?? null,
    };
    this.inFlight.set(input.runtimeKey, entry);

    let base = this.lastOrdinal.get(input.runtimeKey);
    if (base === undefined) {
      base = await this.deps.checkpoints.maxOrdinal(input.projectPath, input.sessionId);
      this.lastOrdinal.set(input.runtimeKey, base);
    }
    // 扫描期间 CLI 可能被销毁/respawn（resetSession 清掉占位）——此时本 turn 已作废，
    // 不再写 baseline，也不回填 ordinal。
    if (this.inFlight.get(input.runtimeKey) !== entry) return;

    const ordinal = base + 1;
    this.lastOrdinal.set(input.runtimeKey, ordinal);
    entry.ordinal = ordinal;

    try {
      await this.deps.checkpoints.capture({
        projectPath: input.projectPath,
        sessionId: input.sessionId,
        ordinal,
        phase: "baseline",
        anchorUuid: input.anchorUuid ?? null,
        at: (this.deps.now?.() ?? new Date()).toISOString(),
      });
    } catch {
      // baseline 5s 预算超时/失败：本轮无 baseline，endpoint 的 diff 参照退化为
      // 上一轮 endpoint。捕获永远不影响消息投递。
    }
  }

  /** 回滚闸用：该 runtime 是否正处在一个 turn 内（含 ordinal 扫描中的占位）。 */
  hasInFlight(runtimeKey: string): boolean {
    return this.inFlight.has(runtimeKey);
  }

  /** stdout 每条带 uuid 的真实消息更新截断锚（live echo 不经此处，无 synthetic 污染）。 */
  noteOutputUuid(runtimeKey: string, uuid: string): void {
    const state = this.inFlight.get(runtimeKey);
    if (state) state.lastUuid = uuid;
  }

  /** result 帧收口：捕获 endpoint + prune（异步）。state 缺失（重启后半 turn）→ 跳过。 */
  async endTurn(runtimeKey: string, isError: boolean): Promise<void> {
    const state = this.inFlight.get(runtimeKey);
    if (!state) return;
    this.inFlight.delete(runtimeKey);
    // 占位轮（ordinal 尚未分配）没有 baseline 可配对的 endpoint，跳过。
    if (state.ordinal < 1) return;

    const at = (this.deps.now?.() ?? new Date()).toISOString();
    try {
      await this.deps.checkpoints.capture({
        projectPath: state.projectPath,
        sessionId: state.sessionId,
        ordinal: state.ordinal,
        phase: "endpoint",
        anchorUuid: state.anchorUuid,
        ...(state.lastUuid !== undefined ? { endUuid: state.lastUuid } : {}),
        isError,
        at,
      });
    } catch {
      // endpoint 失败：本轮无快照，UI 无该轮入口；ordinal 已递增不回退。
    }
    void this.deps.checkpoints.prune(state.projectPath, state.sessionId).catch(() => undefined);
  }

  /** CLI 进程销毁/respawn 时清 in-flight（残留会让后续 turn 被误判为排队消息）。 */
  resetSession(runtimeKey: string): void {
    this.inFlight.delete(runtimeKey);
  }
}
