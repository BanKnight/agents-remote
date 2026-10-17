// Agent 会话双模式编排（chat ↔ terminal，2026-10-15）：同一 claudeSessionId 在两种进程
// 形态（headless stream-json ↔ tmux 交互式 CLI）间接力，JSONL 是唯一权威。TUI 形态 =
// CLI 原生形态（纯 argv、零 env 注入，凭证走 CLI 自身配置——用户拍板）；审批让位 = argv
// 不带 --permission-prompt-tool（CLI 自己的 TUI 弹审批，can_use_tool 帧天然不存在）。
// tmux 吞 OSC → 状态采集走 hooks 写状态文件旁路（--settings 挂三 hook，纯 shell printf
// 落盘，本模块 fs.watch 消费），信号复用 agent-session-status 状态机（关键三态：
// working/done/blocked；error 态 hooks 覆盖不到——接受，GUI 侧照旧）。

import { watch, type FSWatcher } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { AgentSessionMode, AgentSessionStatus } from "@agents-remote/shared";

import { nextAgentSessionStatus, spawnInitialStatus } from "./agent-session-status";
import type { ApprovalCenter } from "./approval-center";
import type { ClaudeRuntime } from "./claude-runtime";
import type { SessionMetadata, SessionRegistry } from "./session-registry";
import type { TmuxRuntime } from "./tmux-runtime";

/** TUI 状态文件 token → 状态机信号（hooks printf 写入的纯 token，无密钥无路径）。
 *  空文件/未知 token = 无信号（防御性忽略）。 */
export const TUI_STATUS_SIGNAL_BY_TOKEN: {
  [token: string]:
    | { kind: "user_input" }
    | { kind: "turn_result"; isError: boolean }
    | { kind: "approval_requested" };
} = {
  user_input: { kind: "user_input" },
  turn_done: { kind: "turn_result", isError: false },
  approval: { kind: "approval_requested" },
};

/** TUI hooks settings 文件内容（纯函数，单测锁定三 hook + 写文件命令）。每个 hook 只做
 *  「printf token > 状态文件」：UserPromptSubmit → user_input（turn 开始）、Stop →
 *  turn_done（turn 正常结束）、Notification → approval（审批/等输入提示）。状态文件路径
 *  单引号包裹——runDir 出自服务端配置（~/.agents-remote），不含单引号。 */
export function buildTuiHooksSettings(statusFilePath: string) {
  const hookCommand = (token: string) => `printf %s ${token} > '${statusFilePath}'`;
  return {
    hooks: {
      UserPromptSubmit: [{ hooks: [{ type: "command", command: hookCommand("user_input") }] }],
      Stop: [{ hooks: [{ type: "command", command: hookCommand("turn_done") }] }],
      Notification: [{ hooks: [{ type: "command", command: hookCommand("approval") }] }],
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
       *  的 done/blocked 才有推送（blocked 无审批登记详情，payload 不带 toolName）。 */
      onStatusChanged?: (sessionId: string, status: AgentSessionStatus) => void;
    },
  ) {}

  private statusPath(runtimeKey: string): string {
    return join(this.deps.runDir, "agent-status", runtimeKey);
  }

  private settingsPath(runtimeKey: string): string {
    return join(this.deps.runDir, "agent-settings", `${runtimeKey}.json`);
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
    const args = await claudeRuntime.resolveTuiSpawn({
      ...metadata,
      settingsPath: this.settingsPath(runtimeKey),
    });
    try {
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
      const exists = await stat(this.statusPath(runtimeKey)).then(
        () => true,
        () => false,
      );
      if (!exists) continue;
      this.tuiStatus.set(runtimeKey, spawnInitialStatus(status));
      this.startWatcher(runtimeKey, id);
    }
  }

  private startWatcher(runtimeKey: string, sessionId: string): void {
    // 防御性：同 runtimeKey 旧 watcher 先拆（switchToTerminal 重入不叠挂）。
    this.watchers.get(runtimeKey)?.close();
    const watcher = watch(this.statusPath(runtimeKey), () => {
      void readFile(this.statusPath(runtimeKey), "utf8")
        .then((raw) => this.applyStatusSignal(runtimeKey, sessionId, raw))
        .catch(() => {});
    });
    // 状态文件被删等 IO 异常 = 状态采集静默退化（关键三态不强求，见文件头）。
    watcher.on("error", () => {});
    this.watchers.set(runtimeKey, watcher);
  }

  private applyStatusSignal(runtimeKey: string, sessionId: string, raw: string): void {
    const signal = TUI_STATUS_SIGNAL_BY_TOKEN[raw.trim()];
    if (!signal) return;
    const current = this.tuiStatus.get(runtimeKey);
    if (current === undefined) return;
    const next = nextAgentSessionStatus(current, signal);
    if (!next || next === current) return;
    this.tuiStatus.set(runtimeKey, next);
    void this.deps.registry.setAgentSessionStatus(sessionId, next);
    this.deps.onStatusChanged?.(sessionId, next);
  }
}
