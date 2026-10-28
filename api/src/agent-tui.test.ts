import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ApprovalCenter } from "./approval-center";
import {
  AgentTuiController,
  buildTuiHooksSettings,
  type AgentTuiStatusContext,
  parseTuiHookEvent,
  TUI_STATUS_SIGNAL_BY_TOKEN,
} from "./agent-tui";
import type { ClaudeRuntime } from "./claude-runtime";
import type { CodexRuntime } from "./codex-runtime";
import { SessionRegistry } from "./session-registry";
import type { TmuxRuntime } from "./tmux-runtime";

let runDir: string;
let projectsRoot: string;
let registry: SessionRegistry;

beforeEach(async () => {
  runDir = await mkdtemp(join(tmpdir(), "ar-agent-tui-run-"));
  projectsRoot = await mkdtemp(join(tmpdir(), "ar-agent-tui-projects-"));
  registry = new SessionRegistry({
    runDir,
    runtime: {
      async exists() {
        return false;
      },
      async close() {},
      async listAliveRuntimeKeys() {
        return new Set<string>();
      },
    },
  });
});

afterEach(async () => {
  await rm(runDir, { recursive: true, force: true });
  await rm(projectsRoot, { recursive: true, force: true });
});

const project = { name: "demo", path: "" };

/** 编排器 fake 依赖（不 spawn tmux / 不拉 CLI）：记录调用 + 读回落盘。 */
async function seed() {
  const session = await registry.createAgentSession({ project, provider: "claude" });
  const metadata = (await registry.getAgentMetadata(project.name, session.id))!;
  const closeCalls: Array<{ key: string; silent?: boolean }> = [];
  const ensureCalls: unknown[][] = [];
  const tmuxCommands: string[] = [];
  let tmuxClosed = 0;
  const cleared: string[] = [];
  const modeSwitched: string[] = [];
  const statusEvents: Array<{
    sessionId: string;
    status: string;
    context?: AgentTuiStatusContext;
  }> = [];
  const claudeRuntime = {
    async close(key: string, opts?: { silent?: boolean }) {
      closeCalls.push({ key, silent: opts?.silent });
    },
    async resolveTuiSpawn(m?: { claudeSessionId?: string; settingsPath?: string }) {
      // 回显 settingsPath：断言「CLI 真的拿到 --settings」（P1-1 断链修复的控制器级锁定）。
      return [
        "claude",
        "--resume",
        m?.claudeSessionId ?? "",
        "--settings",
        m?.settingsPath ?? "",
        "--mcp-config",
        '{"a":"b c"}',
      ];
    },
    async ensureRunning(...args: unknown[]) {
      ensureCalls.push(args);
    },
  } as unknown as ClaudeRuntime;
  const tmuxRuntime = {
    async startCommand(_metadata: unknown, command: string) {
      tmuxCommands.push(command);
    },
    async close() {
      tmuxClosed += 1;
    },
  } as unknown as TmuxRuntime;
  const approvalCenter = {
    clearRuntime(key: string) {
      cleared.push(key);
    },
  } as unknown as ApprovalCenter;
  const controller = new AgentTuiController({
    runDir,
    registry,
    claudeRuntime,
    tmuxRuntime,
    approvalCenter,
    onModeSwitched: (key) => modeSwitched.push(key),
    onStatusChanged: (sessionId, status, context) =>
      statusEvents.push({ sessionId, status, ...(context ? { context } : {}) }),
  });
  return {
    controller,
    sessionId: session.id,
    metadata,
    runtimeKey: metadata.runtimeKey,
    claudeRuntime,
    tmuxRuntime,
    approvalCenter,
    closeCalls,
    ensureCalls,
    tmuxCommands,
    cleared,
    modeSwitched,
    statusEvents,
    tmuxClosed: () => tmuxClosed,
  };
}

/** codex 编排器 fake（app-server runtime 用 stub：记录 close/ensureRunning 参数）。 */
async function seedCodex() {
  const session = await registry.createAgentSession({
    project,
    provider: "codex",
    codexThreadId: "th-1",
  });
  const metadata = (await registry.getAgentMetadata(project.name, session.id))!;
  const codexClosed: string[] = [];
  const ensureCalls: Record<string, unknown>[] = [];
  const tmuxCommands: string[] = [];
  let tmuxClosed = 0;
  const cleared: string[] = [];
  const modeSwitched: string[] = [];
  const codexRuntime = {
    async close(key: string) {
      codexClosed.push(key);
    },
    async ensureRunning(args: Record<string, unknown>) {
      ensureCalls.push(args);
    },
  } as unknown as CodexRuntime;
  const tmuxRuntime = {
    async startCommand(_metadata: unknown, command: string) {
      tmuxCommands.push(command);
    },
    async close() {
      tmuxClosed += 1;
    },
  } as unknown as TmuxRuntime;
  const approvalCenter = {
    clearRuntime(key: string) {
      cleared.push(key);
    },
  } as unknown as ApprovalCenter;
  const controller = new AgentTuiController({
    runDir,
    registry,
    claudeRuntime: {} as unknown as ClaudeRuntime,
    tmuxRuntime,
    codexRuntime,
    approvalCenter,
    onModeSwitched: (key) => modeSwitched.push(key),
  });
  return {
    controller,
    sessionId: session.id,
    metadata,
    runtimeKey: metadata.runtimeKey,
    codexClosed,
    ensureCalls,
    tmuxCommands,
    cleared,
    modeSwitched,
    tmuxClosed: () => tmuxClosed,
  };
}

const statusPath = (runtimeKey: string) => join(runDir, "agent-status", runtimeKey);
const settingsPath = (runtimeKey: string) => join(runDir, "agent-settings", `${runtimeKey}.json`);

/** 等 fs.watch 事件 + 状态落盘（fs 事件异步，给 1s 上限）。 */
async function waitForStatus(sessionId: string, expected: string) {
  for (let i = 0; i < 100; i++) {
    const session = await registry.getAgentSession(project.name, sessionId);
    if (session?.status === expected) return session.status;
    await new Promise((r) => setTimeout(r, 10));
  }
  return (await registry.getAgentSession(project.name, sessionId))?.status;
}

// ── hooks settings 生成（纯函数）──────────────────────────────────────────

test("buildTuiHooksSettings 七 hook 均为 cat 落盘完整 JSON；Notification 带 permission_prompt matcher", () => {
  const settings = buildTuiHooksSettings("/run/agent-status/key1");
  expect(Object.keys(settings.hooks).sort()).toEqual([
    "Notification",
    "PermissionRequest",
    "PostToolUse",
    "PostToolUseFailure",
    "Stop",
    "StopFailure",
    "UserPromptSubmit",
  ]);
  const command = (name: keyof typeof settings.hooks) =>
    settings.hooks[name][0]?.hooks[0]?.command ?? "";
  // 每个 hook 同一条命令：stdin（完整 hook JSON）原样落盘（token → JSON 结构化采集升级）。
  expect(command("UserPromptSubmit")).toBe("cat > '/run/agent-status/key1'");
  expect(command("Stop")).toBe("cat > '/run/agent-status/key1'");
  expect(command("StopFailure")).toBe("cat > '/run/agent-status/key1'");
  expect(command("PostToolUse")).toBe("cat > '/run/agent-status/key1'");
  // 工具失败同样是 turn 存活的证据（CLI 与 PostToolUse 互斥 fire）——blocked 不滞留。
  expect(command("PostToolUseFailure")).toBe("cat > '/run/agent-status/key1'");
  expect(command("PermissionRequest")).toBe("cat > '/run/agent-status/key1'");
  expect(command("Notification")).toBe("cat > '/run/agent-status/key1'");
  // 根因 A 主修：matcher 限定 permission_prompt——idle_prompt 等其它 Notification 类型不再写 approval。
  expect(settings.hooks.Notification[0]?.matcher).toBe("permission_prompt");
  // 其余 hook 无 matcher（匹配全部事件）。
  expect(settings.hooks.Stop[0]?.matcher).toBeUndefined();
});

test("TUI_STATUS_SIGNAL_BY_TOKEN 五 token 映射状态机信号（存量 pane 兼容 fallback）", () => {
  expect(TUI_STATUS_SIGNAL_BY_TOKEN.user_input).toEqual({ kind: "user_input" });
  expect(TUI_STATUS_SIGNAL_BY_TOKEN.turn_done).toEqual({ kind: "turn_result", isError: false });
  expect(TUI_STATUS_SIGNAL_BY_TOKEN.turn_error).toEqual({ kind: "turn_result", isError: true });
  expect(TUI_STATUS_SIGNAL_BY_TOKEN.approval).toEqual({ kind: "approval_requested" });
  expect(TUI_STATUS_SIGNAL_BY_TOKEN.turn_continue).toEqual({ kind: "turn_continue" });
  // 未知 token = 无信号（空文件防御）。
  expect(TUI_STATUS_SIGNAL_BY_TOKEN[""]).toBeUndefined();
});

test("parseTuiHookEvent：hook JSON 主路径（六事件名映射 + agent_id/toolName 提取）", () => {
  expect(parseTuiHookEvent('{"hook_event_name":"UserPromptSubmit"}')?.signal).toEqual({
    kind: "user_input",
  });
  expect(parseTuiHookEvent('{"hook_event_name":"Stop"}')?.signal).toEqual({
    kind: "turn_result",
    isError: false,
  });
  expect(
    parseTuiHookEvent('{"hook_event_name":"StopFailure","error":"rate_limit"}')?.signal,
  ).toEqual({ kind: "turn_result", isError: true });
  expect(parseTuiHookEvent('{"hook_event_name":"PostToolUse","tool_name":"Bash"}')?.signal).toEqual(
    {
      kind: "turn_continue",
    },
  );
  expect(parseTuiHookEvent('{"hook_event_name":"PostToolUseFailure"}')?.signal).toEqual({
    kind: "turn_continue",
  });
  expect(
    parseTuiHookEvent('{"hook_event_name":"Notification","message":"Claude needs your permission"}')
      ?.signal,
  ).toEqual({ kind: "approval_requested" });
  // PermissionRequest：tool_name/tool_input 提取（blocked push 详情）。
  const permission = parseTuiHookEvent(
    '{"hook_event_name":"PermissionRequest","tool_name":"Bash","tool_input":{"command":"ls"}}',
  );
  expect(permission?.signal).toEqual({ kind: "approval_requested" });
  expect(permission?.toolName).toBe("Bash");
  expect(permission?.toolInput).toEqual({ command: "ls" });
  // 主 agent 事件无 agent_id 字段（子 agent 判定依据）。
  expect(parseTuiHookEvent('{"hook_event_name":"Stop"}')?.agentId).toBeUndefined();
});

test("parseTuiHookEvent：agent_id 提取 + 防御性忽略（坏 JSON/未知事件/裸值/空 agent_id）", () => {
  // 子 agent 上下文：agent_id 字段存在（deepwiki 确认仅子 agent 注入）。
  expect(
    parseTuiHookEvent('{"hook_event_name":"StopFailure","agent_id":"agent-abc"}')?.agentId,
  ).toBe("agent-abc");
  // 坏 JSON → 旧 token fallback 路径（兼容升级前 spawn 的长驻 pane）。
  expect(parseTuiHookEvent("user_input")?.signal).toEqual({ kind: "user_input" });
  expect(parseTuiHookEvent("turn_done")?.signal).toEqual({ kind: "turn_result", isError: false });
  // 坏 JSON 且非已知 token → null。
  expect(parseTuiHookEvent("garbage")).toBeNull();
  // 合法 JSON 但非 hook 事件形状（无 hook_event_name / 未知事件名 / JSON 裸值）。
  expect(parseTuiHookEvent('{"foo":1}')).toBeNull();
  expect(parseTuiHookEvent('{"hook_event_name":"SubagentStop"}')).toBeNull();
  expect(parseTuiHookEvent("123")).toBeNull();
  // agent_id 空串 = 视为不存在（不触发子 agent 过滤）。
  expect(parseTuiHookEvent('{"hook_event_name":"Stop","agent_id":""}')?.agentId).toBeUndefined();
});

// ── switchToTerminal ────────────────────────────────────────────────────

test("switchToTerminal：落 settings/状态文件（0600）→ mode 落盘 → silent 关 headless → tmux 起 CLI（--settings 接通）", async () => {
  const h = await seed();
  await h.controller.switchMode(h.metadata, "terminal");

  // headless 让位（silent：不广播 closed），审批登记清底。
  expect(h.closeCalls).toEqual([{ key: h.runtimeKey, silent: true }]);
  expect(h.cleared).toEqual([h.runtimeKey]);

  // settings 文件：0600 + 七 hook 内容。
  const settings = JSON.parse(await readFile(settingsPath(h.runtimeKey), "utf8"));
  expect(Object.keys(settings.hooks).sort()).toEqual([
    "Notification",
    "PermissionRequest",
    "PostToolUse",
    "PostToolUseFailure",
    "Stop",
    "StopFailure",
    "UserPromptSubmit",
  ]);
  expect((await stat(settingsPath(h.runtimeKey))).mode & 0o777).toBe(0o600);
  // 状态文件先建空（fs.watch 才有 inode 可挂）。
  expect(await readFile(statusPath(h.runtimeKey), "utf8")).toBe("");
  expect((await stat(statusPath(h.runtimeKey))).mode & 0o777).toBe(0o600);

  // tmux 命令：argv 逐个单引号包裹（inline JSON 的引号/空格原样抵达 CLI）；--settings
  // 在列 = hooks 真被 CLI 加载（P1-1 断链修复，此前 argv 漏带 → 状态文件恒空）。
  expect(h.tmuxCommands).toEqual([
    `'claude' '--resume' '${h.metadata.claudeSessionId}' '--settings' '${join(runDir, "agent-settings", `${h.runtimeKey}.json`)}' '--mcp-config' '{"a":"b c"}'`,
  ]);

  // 形态落盘（详情/列表透出）+ 多端跟随回调（关该会话全部 claude-stream WS）。
  const session = await registry.getAgentSession(project.name, h.sessionId);
  expect(session?.mode).toBe("terminal");
  expect(h.modeSwitched).toEqual([h.runtimeKey]);
  h.controller.teardownTerminal(h.runtimeKey);
});

test("switchToTerminal 起 pane 失败：形态退回 chat、回滚文件（不留半态）", async () => {
  const h = await seed();
  const failing = new AgentTuiController({
    runDir,
    registry,
    claudeRuntime: h.claudeRuntime,
    tmuxRuntime: {
      async startCommand() {
        throw new Error("tmux down");
      },
      async close() {},
    } as unknown as TmuxRuntime,
    approvalCenter: h.approvalCenter,
  });

  await expect(failing.switchMode(h.metadata, "terminal")).rejects.toThrow("tmux down");
  // teardownTerminal 的 rm 是 fire-and-forget（关闭路径不阻塞），等一拍再断言。
  await new Promise((r) => setTimeout(r, 50));
  // 形态先落盘（fail-closed，见 switchToTerminal 注释）→ 失败后必须退回 chat，
  // 否则留下「档案 terminal 却无 pane」的半态。
  expect((await registry.getAgentSession(project.name, h.sessionId))?.mode).toBe("chat");
  await expect(readFile(statusPath(h.runtimeKey), "utf8")).rejects.toThrow();
  await expect(readFile(settingsPath(h.runtimeKey), "utf8")).rejects.toThrow();
});

test("switchMode 同 mode 幂等：不重复起进程", async () => {
  const h = await seed();
  await h.controller.switchMode(h.metadata, "chat");
  expect(h.closeCalls).toEqual([]);
  expect(h.tmuxCommands).toEqual([]);
});

test("switchMode 并发请求串行化：排队 + 锁内重读最新 mode（review P2-4）", async () => {
  const h = await seed();
  // startCommand 挂闸：第一个切换（chat→terminal）卡在起 pane，第二个请求（→chat）必须排队。
  let releasePane: (() => void) | undefined;
  const paneGate = new Promise<void>((resolve) => {
    releasePane = resolve;
  });
  const gatedPaneStarts: string[] = [];
  let gatedPaneCloses = 0;
  const gated = new AgentTuiController({
    runDir,
    registry,
    claudeRuntime: h.claudeRuntime,
    tmuxRuntime: {
      startCommand: (_metadata: unknown, command: string) => {
        gatedPaneStarts.push(command);
        return paneGate;
      },
      async close() {
        gatedPaneCloses += 1;
      },
    } as unknown as TmuxRuntime,
  });
  const p1 = gated.switchMode(h.metadata, "terminal");
  const p2 = gated.switchMode(h.metadata, "chat");
  // 第二个请求在锁上排队（第一个还没放行——p2 若已执行 chat 方向，pane 会被 close）。
  await new Promise((r) => setTimeout(r, 30));
  expect(gatedPaneStarts).toHaveLength(1); // p1 已推进到起 pane（记录后挂闸）
  expect(gatedPaneCloses).toBe(0); // p2 仍在排队，chat 方向未执行
  releasePane?.();
  await Promise.all([p1, p2]);

  // 最终 mode=chat（第二个请求在锁内重读到 mode=terminal，执行 chat 方向）；
  // 两个方向都真实执行过（tmux 起了 pane、也关了 pane）。
  expect((await registry.getAgentSession(project.name, h.sessionId))?.mode).toBe("chat");
  expect(gatedPaneStarts).toHaveLength(1);
  expect(gatedPaneCloses).toBe(1);
});

// ── 状态文件 watcher（关键三态）──────────────────────────────────────────

test("状态文件 JSON 信号驱动状态机：user_input→working / approval→blocked / turn_done→done；旧 token fallback 兼容", async () => {
  const h = await seed();
  await h.controller.switchMode(h.metadata, "terminal");

  await writeFile(statusPath(h.runtimeKey), '{"hook_event_name":"UserPromptSubmit"}');
  expect(await waitForStatus(h.sessionId, "working")).toBe("working");
  await writeFile(
    statusPath(h.runtimeKey),
    '{"hook_event_name":"PermissionRequest","tool_name":"Bash"}',
  );
  expect(await waitForStatus(h.sessionId, "blocked")).toBe("blocked");
  await writeFile(statusPath(h.runtimeKey), '{"hook_event_name":"Stop"}');
  expect(await waitForStatus(h.sessionId, "done")).toBe("done");
  // 旧 token 格式（升级前 spawn 的长驻 pane）走 fallback，信号照常。
  await writeFile(statusPath(h.runtimeKey), "user_input");
  expect(await waitForStatus(h.sessionId, "working")).toBe("working");
  // 未知内容（坏 JSON + 非已知 token）无迁移（防御性忽略，不动状态）。
  await writeFile(statusPath(h.runtimeKey), "garbage");
  await new Promise((r) => setTimeout(r, 50));
  expect((await registry.getAgentSession(project.name, h.sessionId))?.status).toBe("working");
  h.controller.teardownTerminal(h.runtimeKey);
});

test("子 agent 信号过滤：StopFailure/Stop/PostToolUse 带 agent_id 不驱动主会话；PermissionRequest 带 agent_id 照常 blocked", async () => {
  const h = await seed();
  await h.controller.switchMode(h.metadata, "terminal");
  await writeFile(statusPath(h.runtimeKey), '{"hook_event_name":"UserPromptSubmit"}');
  expect(await waitForStatus(h.sessionId, "working")).toBe("working");

  // 子 agent 的错误/完成/继续：主 agent 关注的事，不驱动主会话状态（误报 error 红点 + push 的根源）。
  const eventsBefore = h.statusEvents.length;
  // 逐条写 + 间隔：fs.watch 回调读「回调时刻」的最新内容，背靠背写会互相覆盖、中间内容
  // 从未被读到——负断言会空洞通过（过滤被删也全绿）。间隔确保每条 JSON 被独立读取。
  const subagentWrites = [
    '{"hook_event_name":"StopFailure","agent_id":"agent-abc","error":"api_error"}',
    '{"hook_event_name":"Stop","agent_id":"agent-abc"}',
    '{"hook_event_name":"PostToolUse","agent_id":"agent-abc"}',
  ];
  for (const raw of subagentWrites) {
    await writeFile(statusPath(h.runtimeKey), raw);
    await new Promise((r) => setTimeout(r, 30));
  }
  await new Promise((r) => setTimeout(r, 80));
  expect((await registry.getAgentSession(project.name, h.sessionId))?.status).toBe("working");
  expect(h.statusEvents).toHaveLength(eventsBefore);

  // 审批例外（2026-10-19 用户拍板）：CLI 真阻塞等人，子 agent 的 PermissionRequest 照常
  // 推进状态机（并经 onStatusChanged 附带工具详情）。
  await writeFile(
    statusPath(h.runtimeKey),
    '{"hook_event_name":"PermissionRequest","agent_id":"agent-abc","tool_name":"Bash","tool_input":{"command":"rm -rf /tmp/x"}}',
  );
  expect(await waitForStatus(h.sessionId, "blocked")).toBe("blocked");
  h.controller.teardownTerminal(h.runtimeKey);
});

test("onStatusChanged 的 approval context：PermissionRequest JSON 附带 toolName/inputSummary（push blocked 详情）", async () => {
  const h = await seed();
  await h.controller.switchMode(h.metadata, "terminal");
  await writeFile(statusPath(h.runtimeKey), '{"hook_event_name":"UserPromptSubmit"}');
  expect(await waitForStatus(h.sessionId, "working")).toBe("working");

  await writeFile(
    statusPath(h.runtimeKey),
    '{"hook_event_name":"PermissionRequest","tool_name":"Bash","tool_input":{"command":"rm -rf /tmp/x"}}',
  );
  expect(await waitForStatus(h.sessionId, "blocked")).toBe("blocked");
  expect(h.statusEvents).toEqual([
    { sessionId: h.sessionId, status: "working" },
    {
      sessionId: h.sessionId,
      status: "blocked",
      context: { toolName: "Bash", inputSummary: "Bash: rm -rf /tmp/x" },
    },
  ]);
  h.controller.teardownTerminal(h.runtimeKey);
});

test("状态文件信号 blocked 退出与 error 收口：JSON 主路径（PostToolUseFailure/StopFailure/PostToolUse）+ 旧 token fallback 交织", async () => {
  const h = await seed();
  await h.controller.switchMode(h.metadata, "terminal");

  // user_input（JSON）→ working；approval（旧 token fallback）→ blocked；
  // PostToolUseFailure（JSON）= 审批已解决（工具失败也是执行了）→ 回 working。
  await writeFile(statusPath(h.runtimeKey), '{"hook_event_name":"UserPromptSubmit"}');
  expect(await waitForStatus(h.sessionId, "working")).toBe("working");
  await writeFile(statusPath(h.runtimeKey), "approval");
  expect(await waitForStatus(h.sessionId, "blocked")).toBe("blocked");
  await writeFile(statusPath(h.runtimeKey), '{"hook_event_name":"PostToolUseFailure"}');
  expect(await waitForStatus(h.sessionId, "working")).toBe("working");

  // StopFailure（JSON）→ error；error 态被下一轮翻回 working（不滞留）。
  await writeFile(statusPath(h.runtimeKey), '{"hook_event_name":"StopFailure"}');
  expect(await waitForStatus(h.sessionId, "error")).toBe("error");
  // error 自愈主路径（2026-10-19 红点滞留修复）：StopFailure 后 CLI 恢复继续跑，PostToolUse
  // 持续触发 turn_continue → working（无需等用户输入）。
  await writeFile(statusPath(h.runtimeKey), '{"hook_event_name":"PostToolUse"}');
  expect(await waitForStatus(h.sessionId, "working")).toBe("working");
  await writeFile(statusPath(h.runtimeKey), "user_input");
  expect(await waitForStatus(h.sessionId, "working")).toBe("working");
  h.controller.teardownTerminal(h.runtimeKey);
});

test("onStatusChanged 跟随状态迁移全发（push 通知出口）：working/done/blocked 到位，garbage 不发，teardown 后不发", async () => {
  const h = await seed();
  await h.controller.switchMode(h.metadata, "terminal");

  await writeFile(statusPath(h.runtimeKey), "user_input");
  expect(await waitForStatus(h.sessionId, "working")).toBe("working");
  await writeFile(statusPath(h.runtimeKey), "turn_done");
  expect(await waitForStatus(h.sessionId, "done")).toBe("done");
  expect(h.statusEvents).toEqual([
    { sessionId: h.sessionId, status: "working" },
    { sessionId: h.sessionId, status: "done" },
  ]);

  h.controller.teardownTerminal(h.runtimeKey);
  // teardown 拆 watcher 后写文件不再触发（通知出口随生命周期收敛）。
  await writeFile(statusPath(h.runtimeKey), "approval");
  await new Promise((r) => setTimeout(r, 50));
  expect(h.statusEvents).toHaveLength(2);
});

// ── switchToChat ───────────────────────────────────────────────────────

test("switchToChat：拆 watcher/删文件 → 关 tmux → --resume 起 headless → mode 落盘", async () => {
  const h = await seed();
  await h.controller.switchMode(h.metadata, "terminal");
  const terminalMetadata = (await registry.getAgentMetadata(project.name, h.sessionId))!;

  await h.controller.switchMode(terminalMetadata, "chat");

  expect(h.tmuxClosed()).toBe(1);
  // headless 复位：同 claudeSessionId（--resume 接力）+ spawnInitialStatus 归一。
  expect(h.ensureCalls).toHaveLength(1);
  expect(h.ensureCalls[0]?.[0]).toBe(h.runtimeKey);
  expect(h.ensureCalls[0]?.[4]).toBe(terminalMetadata.claudeSessionId);
  expect(h.ensureCalls[0]?.[8]).toBe("idle");

  const session = await registry.getAgentSession(project.name, h.sessionId);
  expect(session?.mode).toBe("chat");
  // 多端跟随回调：terminal→chat 方向同样发出（chat 侧防御性 no-op，见实现注释）。
  expect(h.modeSwitched).toEqual([h.runtimeKey, h.runtimeKey]);

  // 状态文件/settings 随会话形态清理（文件不存在 = 删成功）。
  await expect(readFile(statusPath(h.runtimeKey), "utf8")).rejects.toThrow();
  await expect(readFile(settingsPath(h.runtimeKey), "utf8")).rejects.toThrow();

  // watcher 已拆：再写文件不再推进状态。
  await writeFile(statusPath(h.runtimeKey), "turn_done").catch(() => {});
  await new Promise((r) => setTimeout(r, 50));
  expect((await registry.getAgentSession(project.name, h.sessionId))?.status).not.toBe("done");
});

// ── hydrate（API 重启恢复）───────────────────────────────────────────────

test("hydrate：按落盘 mode 重挂 watcher（状态文件在才挂），恢复后信号照常驱动", async () => {
  const h = await seed();
  // 直接构造「重启后磁盘态」：mode=terminal + 状态文件在（不过 switchMode，隔离新旧 watcher）。
  await registry.setAgentSessionMode(h.sessionId, "terminal");
  await mkdir(join(runDir, "agent-status"), { recursive: true });
  await writeFile(statusPath(h.runtimeKey), "", { mode: 0o600 });
  // 反例：terminal 形态但状态文件缺失（被清/从未触发）——不该挂（fs.watch 挂不存在文件会 ENOENT）。
  const orphan = await registry.createAgentSession({ project, provider: "claude" });
  await registry.setAgentSessionMode(orphan.id, "terminal");
  const orphanMetadata = (await registry.getAgentMetadata(project.name, orphan.id))!;

  const revived = new AgentTuiController({
    runDir,
    registry,
    claudeRuntime: h.claudeRuntime,
    tmuxRuntime: h.tmuxRuntime,
    approvalCenter: h.approvalCenter,
  });
  const pending = await registry.listTerminalModeSessions();
  expect(pending.map((s) => s.id).sort()).toEqual([h.sessionId, orphan.id].sort());
  await expect(revived.hydrate(pending)).resolves.toBeUndefined();

  await writeFile(statusPath(h.runtimeKey), "turn_done");
  expect(await waitForStatus(h.sessionId, "done")).toBe("done");
  await new Promise((r) => setTimeout(r, 50));
  expect((await registry.getAgentSession(project.name, orphan.id))?.status).not.toBe("done");
  expect(orphanMetadata.mode).toBe("terminal");

  revived.teardownTerminal(h.runtimeKey);
  revived.teardownTerminal(orphanMetadata.runtimeKey);
});

test("teardownTerminal 幂等（切回 chat / 会话关闭共用，重复调不抛）", async () => {
  const h = await seed();
  await h.controller.switchMode(h.metadata, "terminal");
  h.controller.teardownTerminal(h.runtimeKey);
  expect(() => h.controller.teardownTerminal(h.runtimeKey)).not.toThrow();
});

// ── codex 双模式（app-server ↔ `codex resume` pane）────────────────────────

test("codex switchToTerminal：mode 落盘 → 关 app-server → tmux 起 `codex resume <threadId>`", async () => {
  const h = await seedCodex();
  await h.controller.switchMode(h.metadata, "terminal");

  expect(h.codexClosed).toEqual([h.runtimeKey]);
  expect(h.tmuxCommands).toEqual([`'codex' 'resume' 'th-1'`]);
  expect((await registry.getAgentSession(project.name, h.sessionId))?.mode).toBe("terminal");
  expect(h.cleared).toEqual([h.runtimeKey]);
  expect(h.modeSwitched).toEqual([h.runtimeKey]);
  // codex 无 hooks 文件面：不写 settings/状态文件。
  await expect(readFile(settingsPath(h.runtimeKey), "utf8")).rejects.toThrow();
  await expect(readFile(statusPath(h.runtimeKey), "utf8")).rejects.toThrow();
});

test("codex switchToTerminal 起 pane 失败：mode 退回 chat + 重拉 app-server（不留全堵半态）", async () => {
  const h = await seedCodex();
  const failing = new AgentTuiController({
    runDir,
    registry,
    claudeRuntime: {} as unknown as ClaudeRuntime,
    tmuxRuntime: {
      async startCommand() {
        throw new Error("tmux down");
      },
      async close() {},
    } as unknown as TmuxRuntime,
    codexRuntime: {
      async close() {},
      async ensureRunning(args: Record<string, unknown>) {
        h.ensureCalls.push(args);
      },
    } as unknown as CodexRuntime,
  });

  await expect(failing.switchMode(h.metadata, "terminal")).rejects.toThrow("tmux down");
  expect((await registry.getAgentSession(project.name, h.sessionId))?.mode).toBe("chat");
  expect(h.ensureCalls).toHaveLength(1);
  expect(h.ensureCalls[0]).toMatchObject({
    runtimeKey: h.runtimeKey,
    codexThreadId: "th-1",
  });
});

test("codex switchToChat：关 pane → mode 落盘 → thread/resume 重拉 app-server", async () => {
  const h = await seedCodex();
  await h.controller.switchMode(h.metadata, "terminal");
  await h.controller.switchMode(
    (await registry.getAgentMetadata(project.name, h.sessionId))!,
    "chat",
  );

  expect(h.tmuxClosed()).toBe(1);
  expect((await registry.getAgentSession(project.name, h.sessionId))?.mode).toBe("chat");
  expect(h.ensureCalls).toHaveLength(1);
  expect(h.ensureCalls[0]).toMatchObject({
    sessionId: h.sessionId,
    runtimeKey: h.runtimeKey,
    codexThreadId: "th-1",
  });
  expect(h.modeSwitched).toEqual([h.runtimeKey, h.runtimeKey]);
});

test("codex 切换但未装配 codexRuntime → 明确报错（不静默降级到 claude 路径）", async () => {
  const h = await seedCodex();
  const bare = new AgentTuiController({
    runDir,
    registry,
    claudeRuntime: {} as unknown as ClaudeRuntime,
    tmuxRuntime: {} as unknown as TmuxRuntime,
  });
  await expect(bare.switchMode(h.metadata, "terminal")).rejects.toThrow(
    "codex runtime not configured",
  );
});
