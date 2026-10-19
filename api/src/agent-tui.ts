// Agent 会话双模式编排（chat ↔ terminal，2026-10-15）：同一 claudeSessionId 在两种进程
// 形态（headless stream-json ↔ tmux 交互式 CLI）间接力，JSONL 是唯一权威。TUI 形态 =
// CLI 原生形态（纯 argv、零 env 注入，凭证走 CLI 自身配置——用户拍板）；审批让位 = argv
// 不带 --permission-prompt-tool（CLI 自己的 TUI 弹审批，can_use_tool 帧天然不存在）。
// tmux 吞 OSC → 状态采集走 hooks 写状态文件旁路（--settings 挂七个 hook，hook stdin 的
// 完整 JSON 经 cat 落盘，本模块 fs.watch + parseTuiHookEvent 消费；JSON 携带 hook_event_name/
// agent_id/tool_name 等结构化字段——agent_id 用于过滤子 agent 信号：子 agent 的错误/完成是
// 主 agent 关注的事，不驱动主会话状态），信号复用 agent-session-status 状态机（working/
// done/blocked/error 四态；error 经 StopFailure hook 覆盖）。

import { watch, type FSWatcher } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { AgentSessionMode, AgentSessionStatus } from "@agents-remote/shared";

import {
  nextAgentSessionStatus,
  spawnInitialStatus,
  type AgentStatusSignal,
} from "./agent-session-status";
import type { ApprovalCenter } from "./approval-center";
import { summarizeControlInput } from "./approval-registry";
import type { ClaudeRuntime } from "./claude-runtime";
import type { SessionMetadata, SessionRegistry } from "./session-registry";
import type { TmuxRuntime } from "./tmux-runtime";

/** TUI 状态文件旧格式 token → 状态机信号。**存量 pane 兼容 fallback**：升级前 spawn 的
 *  TUI pane（独立于 API 存活）仍写旧 printf token 格式，API 升级后 watcher 继续读到——
 *  parseTuiHookEvent 在 JSON 解析失败时查此表。pane 随会话生命周期自然消亡后可移除。
 *  空文件/未知 token = 无信号（防御性忽略）。 */
export const TUI_STATUS_SIGNAL_BY_TOKEN: {
  [token: string]:
    | { kind: "user_input" }
    | { kind: "turn_result"; isError: boolean }
    | { kind: "turn_continue" }
    | { kind: "approval_requested" };
} = {
  user_input: { kind: "user_input" },
  turn_done: { kind: "turn_result", isError: false },
  turn_error: { kind: "turn_result", isError: true },
  approval: { kind: "approval_requested" },
  turn_continue: { kind: "turn_continue" },
};

/** hook stdin JSON 的 hook_event_name → 状态机信号（新格式主路径）。
 *  Notification 依赖 settings 的 permission_prompt matcher 限类型，服务端不重复判。 */
const TUI_SIGNAL_BY_EVENT: { [event: string]: AgentStatusSignal } = {
  UserPromptSubmit: { kind: "user_input" },
  Stop: { kind: "turn_result", isError: false },
  StopFailure: { kind: "turn_result", isError: true },
  PostToolUse: { kind: "turn_continue" },
  PostToolUseFailure: { kind: "turn_continue" },
  PermissionRequest: { kind: "approval_requested" },
  Notification: { kind: "approval_requested" },
};

/** 状态文件读取上限（security review：hook stdin 整体落盘，PostToolUse 的 tool_response
 *  模型可控大小，超限整体跳过——信号字段都在前部，正常事件远小于此）。 */
const TUI_STATUS_FILE_MAX_BYTES = 1024 * 1024;

/** 状态迁移附带上下文：目前仅 approval 带 toolName/inputSummary（blocked push 详情，
 *  与 GUI 采集源 approvalCenter 登记回调的 payload 对齐）。 */
export type AgentTuiStatusContext = { toolName?: string; inputSummary?: string };

export type TuiHookEvent = {
  signal: AgentStatusSignal;
  /** hook stdin 的 agent_id：仅子 agent 上下文存在（主 agent 事件无此字段）。 */
  agentId?: string;
  /** 仅 PermissionRequest 提供（Notification 无 tool_name，push 文案回落默认）。 */
  toolName?: string;
  toolInput?: Record<string, unknown>;
};

/** 状态文件内容 → hook 事件（纯函数）。主路径 = hook stdin JSON（cat 落盘）；解析失败
 *  回落旧 token 表（存量 pane 兼容，见 TUI_STATUS_SIGNAL_BY_TOKEN）；都不中 = null。 */
export function parseTuiHookEvent(raw: string): TuiHookEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const legacy = TUI_STATUS_SIGNAL_BY_TOKEN[raw.trim()];
    return legacy ? { signal: legacy } : null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const record = parsed as Record<string, unknown>;
  const eventName = record.hook_event_name;
  if (typeof eventName !== "string") return null;
  const signal = TUI_SIGNAL_BY_EVENT[eventName];
  if (!signal) return null;
  return {
    signal,
    ...(typeof record.agent_id === "string" && record.agent_id ? { agentId: record.agent_id } : {}),
    ...(typeof record.tool_name === "string" && record.tool_name
      ? { toolName: record.tool_name }
      : {}),
    ...(record.tool_input !== null &&
    typeof record.tool_input === "object" &&
    !Array.isArray(record.tool_input)
      ? { toolInput: record.tool_input as Record<string, unknown> }
      : {}),
  };
}

/** TUI hooks settings 文件内容（纯函数，单测锁定七 hook + 写文件命令）。每个 hook 都把
 *  stdin（CLI 传入的完整 hook JSON：hook_event_name/session_id/agent_id/tool_name 等）
 *  原样落进状态文件（cat >）：UserPromptSubmit（turn 开始）、Stop（turn 正常结束）、
 *  StopFailure（turn 因 API 错误结束）、PostToolUse / PostToolUseFailure（工具执行完/
 *  失败 = turn 存活证据：blocked 审批已解决回 working + error 滞留自愈——StopFailure 后
 *  CLI 恢复继续跑时 PostToolUse 持续触发，只当 settled 用会让红点滞留到 turn 结束；CLI
 *  二者互斥 fire，只挂 PostToolUse 会让「approve 后工具失败」的 blocked 滞留到下一个成功
 *  工具或 Stop 才收口）、PermissionRequest（真权限申请）；Notification 只收
 *  permission_prompt 类型（CLI 的 Notification 还含 idle_prompt 空闲提示等——无 matcher
 *  会把空闲当审批挂起，状态机 blocked 下忽略 user_input，整个 turn 钉死 blocked）。
 *  状态文件路径单引号包裹——runDir 出自服务端配置（~/.agents-remote），不含单引号。 */
export function buildTuiHooksSettings(statusFilePath: string) {
  const hookCommand = `cat > '${statusFilePath}'`;
  const hookEntry = (matcher?: string) => ({
    ...(matcher ? { matcher } : {}),
    hooks: [{ type: "command" as const, command: hookCommand }],
  });
  return {
    hooks: {
      UserPromptSubmit: [hookEntry()],
      Stop: [hookEntry()],
      StopFailure: [hookEntry()],
      PostToolUse: [hookEntry()],
      PostToolUseFailure: [hookEntry()],
      PermissionRequest: [hookEntry()],
      Notification: [hookEntry("permission_prompt")],
    },
  };
}

// tmux new-session 的 command 经 shell 执行：argv 逐个单引号包裹（mcpArgs 是 inline JSON，
// 引号与空格必须原样抵达 CLI）。
const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

export class AgentTuiController {
  private readonly watchers = new Map<string, FSWatcher>();
  /** TUI 期状态基线（本模块自持，不动 claudeRuntime.processes——那是 headless 形态的账本）。 */
  private readonly tuiStatus = new Map<string, AgentSessionStatus>();
  /** 模式切换串行锁（per-runtimeKey，review P2-4）：多端同时打开同一会话时两台设备
   *  并发点切换会互相拆台（A 的回滚拆掉 B 刚起的 pane，回滚本身制造双写面）。排队执行。 */
  private readonly switchLocks = new Map<string, Promise<void>>();

  constructor(
    private readonly deps: {
      runDir: string;
      registry: SessionRegistry;
      claudeRuntime: ClaudeRuntime;
      tmuxRuntime: TmuxRuntime;
      approvalCenter?: ApprovalCenter;
      /** 切换完成回调（两个方向都发）：index.ts 接 claude-stream 关该会话全部 WS——
       *  多端打开同一会话时，未切换端靠「重连被守卫拒 / 面板 ended」跟随新形态。 */
      onModeSwitched?: (runtimeKey: string) => void;
      /** 状态迁移出口（working/done/blocked 全发，gate 在消费侧）：index.ts 接 push
       *  通知——与 GUI 状态机（setOnSessionStatusChange）同一出口同一管道，terminal 形态
       *  的 done/blocked 才有推送；approval 迁移附带 context（toolName/inputSummary，
       *  取自 PermissionRequest hook JSON——旧 token 格式无此信息，context 省略）。 */
      onStatusChanged?: (
        sessionId: string,
        status: AgentSessionStatus,
        context?: AgentTuiStatusContext,
      ) => void;
    },
  ) {
    // hooks 命令把状态文件路径单引号包裹（buildTuiHooksSettings）——runDir 出自服务端
    // 配置（~/.agents-remote），构造时显式断言不含单引号，否则 hook 命令会被截断
    // （security review P3：把隐式前提显式化，fail-fast 在装配期而非静默断链）。
    if (deps.runDir.includes("'")) {
      throw new Error(`runDir must not contain single quotes: ${deps.runDir}`);
    }
  }

  /** 状态/settings 文件路径。组合后单引号断言（构造期只断言了 runDir 段）：实际嵌入
   *  hook 命令 shell 串的是组合值，runtimeKey 段（session 前缀/会话 id）若含单引号同样
   *  会截断命令——fail-fast 与真实嵌入串一致（security review P3）。 */
  private statusPath(runtimeKey: string): string {
    const p = join(this.deps.runDir, "agent-status", runtimeKey);
    if (p.includes("'")) throw new Error(`status path must not contain single quotes: ${p}`);
    return p;
  }

  private settingsPath(runtimeKey: string): string {
    const p = join(this.deps.runDir, "agent-settings", `${runtimeKey}.json`);
    if (p.includes("'")) throw new Error(`settings path must not contain single quotes: ${p}`);
    return p;
  }

  /** 模式切换唯一入口（路由 mode 动作调用）。同 mode 幂等 no-op；同会话并发请求
   *  串行化（锁内重读最新 metadata——入参快照在排队等待期间可能已过期）。 */
  async switchMode(metadata: SessionMetadata, target: AgentSessionMode): Promise<void> {
    const runtimeKey = metadata.runtimeKey;
    const prev = (this.switchLocks.get(runtimeKey) ?? Promise.resolve()).catch(() => {});
    const run = prev.then(async () => {
      const fresh = await this.deps.registry.getAgentMetadata(metadata.projectName, metadata.id);
      if (!fresh || (fresh.mode ?? "chat") === target) return;
      if (target === "terminal") await this.switchToTerminal(fresh);
      else await this.switchToChat(fresh);
    });
    this.switchLocks.set(runtimeKey, run);
    try {
      await run;
    } finally {
      if (this.switchLocks.get(runtimeKey) === run) this.switchLocks.delete(runtimeKey);
    }
  }

  private async switchToTerminal(metadata: SessionMetadata): Promise<void> {
    const { claudeRuntime, tmuxRuntime, registry, approvalCenter } = this.deps;
    const runtimeKey = metadata.runtimeKey;
    // 1) hooks settings（0600，随会话生命周期清理）+ 状态文件（先建空文件，fs.watch 才有 inode 可挂）。
    await mkdir(join(this.deps.runDir, "agent-settings"), { recursive: true });
    await mkdir(join(this.deps.runDir, "agent-status"), { recursive: true });
    await writeFile(
      this.settingsPath(runtimeKey),
      `${JSON.stringify(buildTuiHooksSettings(this.statusPath(runtimeKey)), null, 2)}\n`,
      { mode: 0o600 },
    );
    await writeFile(this.statusPath(runtimeKey), "", { mode: 0o600 });
    // 2) **形态先落盘，再杀 headless / 起 pane**：顺序有意为之（fail-closed 方向）——mode
    //    落盘后 claude-stream 一律拒绝（open/injectUserPrompt 双守卫），此后才关 headless：
    //    「close（进程未注册 = no-op）与落盘之间」新连接撞 ensureRunning 的双写窗口被压到
    //    只剩「早已过守卫的 in-flight spawn」（窗口 ~1s，review P1-2：残余面记档接受）。
    //    先落盘则最坏是「档案 terminal + 无 pane」，方向安全：claude-stream 一律拒绝，
    //    重试「回到对话」即自愈。
    await registry.setAgentSessionMode(metadata.id, "terminal");
    // 3) headless 让位：silent 关（不广播 closed、不走审批 settled 回调；autoRetry
    //    destroySession / relay 清理照旧）。
    await claudeRuntime.close(runtimeKey, { silent: true });
    // 4) tmux pane 起 CLI 原生形态（argv 全来自会话 metadata，见 resolveTuiSpawn；
    //    settingsPath 接通 hooks——CLI 真正加载三 hook，review P1-1 断链修复）。
    //    resolveTuiSpawn 同在 try 内（code review P2：spawn 解析失败同走回滚，不留
    //    「mode=terminal + 有 hooks 文件却无 pane」半态）。
    try {
      const args = await claudeRuntime.resolveTuiSpawn({
        ...metadata,
        settingsPath: this.settingsPath(runtimeKey),
      });
      await tmuxRuntime.startCommand(metadata, args.map(shellQuote).join(" "));
    } catch (error) {
      // 起 pane 失败（tmux server 不可达等）：形态退回 chat + 清掉刚写的 settings/状态文件——
      // 不留「有 hooks 文件却无 pane 无 watcher」或「档案说 terminal 却无 pane」的半态。
      await registry.setAgentSessionMode(metadata.id, "chat");
      this.teardownTerminal(runtimeKey);
      throw error;
    }
    // 5) watcher 挂载 + 审批登记清底（idle-only 已排除 blocked，兜底）。
    this.tuiStatus.set(runtimeKey, spawnInitialStatus(metadata.status));
    this.startWatcher(runtimeKey, metadata.id);
    approvalCenter?.clearRuntime(runtimeKey);
    // 6) 多端跟随：关该会话全部 claude-stream WS（此时 mode 已落盘，未切换端重连被守卫拒）。
    this.deps.onModeSwitched?.(runtimeKey);
  }

  private async switchToChat(metadata: SessionMetadata): Promise<void> {
    const { claudeRuntime, tmuxRuntime, registry } = this.deps;
    const runtimeKey = metadata.runtimeKey;
    this.teardownTerminal(runtimeKey);
    await tmuxRuntime.close(runtimeKey);
    // **mode 先于 ensureRunning 落盘**（review P2-3）：pane 已死、headless 未起，此刻写
    // mode=chat 没有双写窗口；若先起 headless 后落盘，ensureRunning 失败会留下「pane 死 +
    // 档案 terminal」的全堵半态。先落盘则失败态 = 档案 chat + 无进程，下次任一端打开会话
    // 时 claude-stream ensureRunning 正常拉起 headless——半态自愈。
    await registry.setAgentSessionMode(metadata.id, "chat");
    // headless 复位（--resume 同 id；spawnInitialStatus 归一与 startAgent/claude-stream 同口径）。
    await claudeRuntime.ensureRunning(
      runtimeKey,
      metadata.projectPath,
      metadata.projectName,
      metadata.id,
      metadata.claudeSessionId,
      metadata.modelAlias ?? metadata.model,
      metadata.permissionMode,
      metadata.effort,
      spawnInitialStatus(metadata.status),
    );
    // 多端跟随：terminal→chat 方向未切换端经「pane 被 kill → 面板收 ended → 失效 detail」
    // 跟随；此处关 claude-stream WS 是防御性 no-op（terminal 期本就没有 chat WS）。
    this.deps.onModeSwitched?.(runtimeKey);
  }

  /** 终端形态拆除（切回 chat / 会话关闭共用）：停 watcher + 删状态/settings 文件 + 清基线。
   *  mode metadata 不在此动——切回 chat 由 switchToChat 落盘；pane 内 /exit 后保留
   *  mode=terminal（会话仍可 --resume，入口仍可回对话）。 */
  teardownTerminal(runtimeKey: string): void {
    this.watchers.get(runtimeKey)?.close();
    this.watchers.delete(runtimeKey);
    this.tuiStatus.delete(runtimeKey);
    void rm(this.settingsPath(runtimeKey), { force: true }).catch(() => {});
    void rm(this.statusPath(runtimeKey), { force: true }).catch(() => {});
  }

  /** API 重启恢复（装配后调用一次）：为既有 terminal 形态会话重挂状态 watcher——tmux pane
   *  独立于 API 存活，但内存里的 fs.watch 随进程消失，不重挂则 TUI 状态点停更。状态文件
   *  在才挂（文件随 runDir 生命周期/被清 = hooks 从未触发，退化为不更新状态点，见文件头
   *  「关键三态不强求」）。基线取透传 status（parseMetadata 已把 TUI 期 working/blocked 归一
   *  idle——turn 不可能恢复，与 spawn 恢复同口径）。 */
  async hydrate(
    sessions: Array<{ id: string; runtimeKey: string; status: SessionMetadata["status"] }>,
  ): Promise<void> {
    for (const { id, runtimeKey, status } of sessions) {
      // per-session 容错（code review P2）：单会话异常（如文件在 stat 后、watch() 同步
      // 抛 ENOENT 的窗口）只跳过该会话，不连坐其余 terminal 会话的 watcher 重挂。
      try {
        const exists = await stat(this.statusPath(runtimeKey)).then(
          () => true,
          () => false,
        );
        if (!exists) continue;
        this.tuiStatus.set(runtimeKey, spawnInitialStatus(status));
        this.startWatcher(runtimeKey, id);
      } catch (error) {
        console.warn(`[agent-tui] hydrate ${runtimeKey} failed:`, error);
      }
    }
  }

  private startWatcher(runtimeKey: string, sessionId: string): void {
    // 防御性：同 runtimeKey 旧 watcher 先拆（switchToTerminal 重入不叠挂）。
    this.watchers.get(runtimeKey)?.close();
    const watcher = watch(this.statusPath(runtimeKey), () => {
      void this.consumeStatusFile(runtimeKey, sessionId).catch(() => {});
    });
    // 状态文件被删等 IO 异常 = 状态采集静默退化（关键三态不强求，见文件头）。
    watcher.on("error", () => {});
    this.watchers.set(runtimeKey, watcher);
  }

  /** 读取状态文件 → 状态机。超限跳过：hook stdin 整体落盘（PostToolUse 携带完整
   *  tool_response，模型可控大小），信号判定只消费顶层标量——超限文件整体放弃（丢一次
   *  信号可接受，后续事件自愈；turn_continue 的自愈链在 CLI 截断大输出的常态下不受影响），
   *  不给 API 进程留「全文读 + 同步 parse 大 JSON」的内存/放大面（security review）。 */
  private async consumeStatusFile(runtimeKey: string, sessionId: string): Promise<void> {
    const path = this.statusPath(runtimeKey);
    const size = await stat(path).then(
      (s) => s.size,
      () => 0,
    );
    if (size > TUI_STATUS_FILE_MAX_BYTES) {
      console.warn(
        `[agent-tui] status file over ${TUI_STATUS_FILE_MAX_BYTES}B, skipped: ${runtimeKey} (${size}B)`,
      );
      return;
    }
    const raw = await readFile(path, "utf8");
    this.applyStatusSignal(runtimeKey, sessionId, raw);
  }

  private applyStatusSignal(runtimeKey: string, sessionId: string, raw: string): void {
    const event = parseTuiHookEvent(raw);
    if (!event) return;
    // 子 agent 信号过滤：错误/完成/继续是主 agent 自行处理的内部事件（子 agent 的
    // StopFailure 带 agent_id，曾致主会话误报 error 红点 + push）；审批例外——CLI 真
    // 阻塞等人，过滤会让会话静默挂起（2026-10-19 用户拍板保留）。
    if (event.agentId && event.signal.kind !== "approval_requested") return;
    const current = this.tuiStatus.get(runtimeKey);
    if (current === undefined) return;
    const next = nextAgentSessionStatus(current, event.signal);
    if (!next || next === current) return;
    this.tuiStatus.set(runtimeKey, next);
    void this.deps.registry.setAgentSessionStatus(sessionId, next);
    // approval 附带工具详情（PermissionRequest JSON 有 tool_name/tool_input；Notification
    // 无 tool_name → context 省略，push 文案回落「等待审批：工具调用」）。
    const context: AgentTuiStatusContext | undefined =
      event.signal.kind === "approval_requested" && event.toolName
        ? {
            toolName: event.toolName,
            inputSummary: summarizeControlInput(event.toolName, event.toolInput ?? {}),
          }
        : undefined;
    this.deps.onStatusChanged?.(sessionId, next, context);
  }
}
