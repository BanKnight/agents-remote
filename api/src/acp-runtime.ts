import { join } from "node:path";
import * as acp from "@agentclientprotocol/sdk";
import type {
  ClientSideConnection,
  RequestPermissionRequest,
  RequestPermissionResponse,
  SessionNotification,
} from "@agentclientprotocol/sdk";
import type { AcpCredentials, AgentProvider, SettingsState } from "@agents-remote/shared";
import type { RuntimeStream } from "./session-registry";
import { getAgentProviderProfile, type AgentProviderProfile } from "./agent-provider-profiles";
import { PiSessionRelay } from "./pi-relay";

// ── ACP runtime（Phase 1 PoC，docs/research/acp-agent-integration.md §6 提案）────────
//
// 第四种 agent 接入形态「协议级 adapter」：spawn ACP agent 子进程（Phase 1 硬编码 omp =
// Oh My Pi，`omp acp` 子命令）+ 官方 @agentclientprotocol/sdk v1 建连，session/update 通知
// 以 acp_event 独立帧族透传进 PiSessionRelay（Route A：pi 式独立帧族 + 前端最小 acp-adapter，
// 不翻译成 claude 帧族——tool_call upsert 语义与 claude tool_use 不同构，强翻有损且 claude
// adapter 注入语义有回归风险）。
//
// 与 claude/pi 管道的关系：
// - spawn 模型同 claude（Bun.spawn 直拉，非 tmux）；建连经官方 SDK（NDJSON over stdio）。
// - relay 复用 PiSessionRelay（payload 无关）：history/live 双缓冲 + addSubscriber 回放，
//   与 claude `--resume` 重拉历史 / pi continueRecent 同构——ACP 侧对应 session/load 全量回放。
// - turn 边界：session/prompt 响应（stopReason）→ relay broadcastOnly `{type:"ended",
//   stopReason}`，对齐 claude result→ended / pi agent_settled→ended。

/** ACP agent stderr 日志目录名（runDir 下，镜像 claude-stderr 布局）。 */
const ACP_STDERR_DIR = "acp-stderr";

/** SDK 建连超时（ms）：initialize/newSession/loadSession 等 prompt 外 RPC 的兜底墙钟。
 *  buzz 经验：Hermes 等在 initialize 前启动 MCP 可能耗尽启动预算，无超时会永久挂死。 */
const ACP_RPC_TIMEOUT_MS = 60_000;

/** prompt 进行中再来的 user 消息排队上限（防内存无限增长；正常对话远达不到）。 */
const ACP_PENDING_QUEUE_CAP = 32;

type AcpSessionEntry = {
  /** SessionRegistry 完整 metadata id（activity 回调用，registry 按 id 精确索引）。 */
  sessionId: string;
  proc: Bun.Subprocess<"pipe", "pipe", "pipe">;
  conn: ClientSideConnection;
  relay: PiSessionRelay;
  acpSessionId: string;
};

export type AcpSpawnTarget = {
  /** SessionRegistry metadata id（回写 acpSessionId 回调用）。 */
  sessionId: string;
  /** runtimeKey = Map key（与 claude-runtime 的 sessionName 同位）。 */
  runtimeKey: string;
  /** provider（CLI 名）：凭据解析按它取 settings 切片与 profile 声明。 */
  provider: AgentProvider;
  /** session cwd（Project-safe resolver 产出的绝对路径）。 */
  projectPath: string;
  /** metadata 已存的 ACP session id（API 重启恢复 → loadSession）。 */
  acpSessionId?: string;
};

/** prompt 外 RPC 超时包装（initialize/new/load 走它；prompt 生命周期 = turn 本身不套）。 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

// 纯函数：解析 acp spawn 凭据（per-provider）——provider 平权：只读该 provider 自身的
// settings 切片，不借用其它 runtime（如 claude 预设）的配置（隐式跨 runtime 借用会把
// claude 抬成全局兜底，凭据来源也变得不可见）。切片全空 → {}（agent 回落自身凭证链/
// 父 env）。导出供测试。
export function resolveAcpCredentials(
  state: SettingsState,
  provider: AgentProvider,
): AcpCredentials {
  return state.runtimes.acp[provider] ?? {};
}

// 纯函数：构造 spawn env——继承父进程 + 按 profile.credentials.env 声明的变量名注入
// settings 凭据切片（env 名是 CLI 固有属性：omp 消费 ANTHROPIC_API_KEY + ANTHROPIC_BASE_URL
// （catalog 规则 `env "ANTHROPIC_API_KEY"`；非官方 baseUrl 时 headers 自动 Authorization:
// Bearer <key>，官方端点用 x-api-key），未来其它 ACP CLI 各有自家 env 名）。无 credentials
// 声明的 profile 不注入（纯透传父 env）。未配置项不注入——agent 回落自身凭证链
// （omp: OAuth → login key → env → stored api_key），未配置时继承父进程 env 即该链的
// 一环。apiKey 只在此处从 settings 读出写进 env，不进任何日志/状态。导出供测试。
export function buildAcpSpawnEnv(
  profile: AgentProviderProfile | undefined,
  credentials: AcpCredentials | undefined,
  parentEnv: Record<string, string | undefined> = process.env,
): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...parentEnv };
  const envNames = profile?.credentials?.env;
  if (!envNames) return env;
  if (credentials?.apiKey) env[envNames.apiKey] = credentials.apiKey;
  if (envNames.baseUrl && credentials?.baseUrl) env[envNames.baseUrl] = credentials.baseUrl;
  return env;
}

/**
 * AcpRuntime —— 通用 ACP provider 运行时。每 session 一个 `{proc, conn, relay}`；
 * 懒启动入口两个：startAgent（创建即拉起 + session/new）与 ensureRunning（WS open 恢复，
 * 有 acpSessionId → spawn + session/load 全量回放喂 relay history 段）。
 *
 * Phase 1 边界（docs/research/acp-agent-integration.md §6.3）：
 * - 权限自动应答 allow（有人在环 PoC，approvals UI 是 Phase 2）；
 * - command 硬编码 `omp acp`（command/模型切换预设是 Phase 2）；凭据走 settings
 *   runtimes.acp per-provider 切片（apiKey + baseUrl，spawn 时按 profile 声明的 env 名
 *   注入，见 buildAcpSpawnEnv）；
 * - 无双超时熔断/有界 drain（RPC 超时只护 prompt 外方法），进程组加固留 Phase 3。
 */
export class AcpRuntime {
  private readonly runDir: string;
  /** agent 启动命令（argv 数组）：Phase 1 默认硬编码 `omp acp`（settings 预设是 Phase 2）；
   *  构造注入也是测试 seam（fake agent 替换真实 omp）。 */
  private readonly command: string[];
  /** 凭据解析回调（每次 spawn 前调用，settings 热更新即时生效）：按 provider 返回其
   *  settings 凭据切片；未配置返回 {}（不注入，agent 回落自身凭证链/父 env）。 */
  private readonly resolveCredentials?: (
    provider: AgentProvider,
  ) => Promise<AcpCredentials | undefined>;
  private readonly sessions = new Map<string, AcpSessionEntry>();
  /** loadSession 回放期收集目标（runtimeKey → lines）；resolve 后 delete 并 loadHistory 定格。 */
  private readonly historyCollectors = new Map<string, string[]>();
  /** prompt 单飞标记（runtimeKey）：prompt 在飞时后续 user 入 pendingQueues。 */
  private readonly sending = new Set<string>();
  private readonly pendingQueues = new Map<string, string[]>();
  private onAcpSessionId?: (sessionId: string, acpSessionId: string) => void;
  private onActivity?: (sessionId: string) => void;

  constructor(options: {
    runDir: string;
    command?: string[];
    resolveCredentials?: (provider: AgentProvider) => Promise<AcpCredentials | undefined>;
  }) {
    this.runDir = options.runDir;
    this.command = options.command ?? ["omp", "acp"];
    this.resolveCredentials = options.resolveCredentials;
  }

  /** acpSessionId backfill 回调（接 sessionRegistry.setAcpSessionId；镜像 claude setOnSystemInit）。 */
  setOnAcpSessionId(callback: (sessionId: string, acpSessionId: string) => void): void {
    this.onAcpSessionId = callback;
  }

  /** 活动 bump 回调（接 sessionRegistry.recordActivity；真实 update 唯一入口，回放不经它）。 */
  setOnActivity(callback: (sessionId: string) => void): void {
    this.onActivity = callback;
  }

  /** RuntimeResources.startAgent：创建即拉起（spawn + initialize + session/new）。
   *  失败 throw → SessionRegistry 回滚 metadata（claude startAgent 同语义）。 */
  async startAgent(target: AcpSpawnTarget): Promise<void> {
    await this.ensureRunning(target);
  }

  /**
   * 懒启动（幂等）：已活直接返回。spawn omp + initialize（pin v1，不广告 fs/terminal——
   * agent 文件访问走它自己的工具）→ 有 acpSessionId 走 loadSession（回放 update 收集进
   * relay history 段），否则 session/new（cwd = project path）并 backfill acpSessionId。
   */
  async ensureRunning(target: AcpSpawnTarget): Promise<void> {
    if (this.sessions.has(target.runtimeKey)) return;

    // 读 settings 凭据切片（读失败回退 undefined = 继承父 env，同 claude resolveSpawnInputs）。
    const profile = getAgentProviderProfile(target.provider);
    const credentials = await this.resolveCredentials?.(target.provider).catch((err) => {
      console.warn("[acp] settings read failed, falling back to inherited env:", err);
      return undefined;
    });
    const proc = Bun.spawn(this.command, {
      cwd: target.projectPath,
      // 显式 env 全量替换（Bun.spawn 不合并 process.env）——buildAcpSpawnEnv 内继承父 env。
      env: buildAcpSpawnEnv(profile, credentials, process.env),
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
    void this.pumpStderr(target.runtimeKey, proc.stderr);

    // Bun.spawn 的 stdin 是 FileSink（非 WritableStream）：薄适配给 SDK ndJsonStream。
    const stdinWritable = new WritableStream<Uint8Array>({
      write(chunk) {
        proc.stdin.write(chunk);
      },
      close() {
        proc.stdin.end();
      },
    });
    const conn = new acp.ClientSideConnection(
      () => this.buildClientHandler(target.runtimeKey),
      acp.ndJsonStream(stdinWritable, proc.stdout as ReadableStream<Uint8Array>),
    );

    try {
      await withTimeout(
        conn.initialize({
          protocolVersion: 1,
          clientCapabilities: {},
          clientInfo: { name: "agents-remote", version: "0.0.0" },
        }),
        ACP_RPC_TIMEOUT_MS,
        "acp initialize",
      );

      const relay = new PiSessionRelay();
      const entry: AcpSessionEntry = {
        sessionId: target.sessionId,
        proc,
        conn,
        relay,
        acpSessionId: "",
      };

      if (target.acpSessionId) {
        // 恢复：loadSession 全量回放（协议规定应答前回放完）。回放 update 经
        // sessionUpdate 回调到达，用「先收集后定格」区分 history 段与 live 段。
        const historyLines: string[] = [];
        this.historyCollectors.set(target.runtimeKey, historyLines);
        try {
          await withTimeout(
            conn.loadSession({
              sessionId: target.acpSessionId,
              cwd: target.projectPath,
              mcpServers: [],
            }),
            ACP_RPC_TIMEOUT_MS,
            "acp loadSession",
          );
        } finally {
          this.historyCollectors.delete(target.runtimeKey);
        }
        entry.acpSessionId = target.acpSessionId;
        relay.loadHistory(historyLines);
        relay.setResume(historyLines.length > 0);
      } else {
        const created = await withTimeout(
          conn.newSession({ cwd: target.projectPath, mcpServers: [] }),
          ACP_RPC_TIMEOUT_MS,
          "acp newSession",
        );
        entry.acpSessionId = created.sessionId;
        relay.loadHistory([]);
        relay.setResume(false);
        this.onAcpSessionId?.(target.sessionId, created.sessionId);
      }

      this.sessions.set(target.runtimeKey, entry);
    } catch (error) {
      // 启动失败：杀进程防泄漏（omp 可能已起 MCP 子进程），错误上抛由 caller 报错帧。
      this.killProc(proc);
      throw error;
    }
  }

  /** 发送 user 消息：注入 acp_user_echo（reconnect 可见）→ 单飞 prompt / 排队。 */
  write(runtimeKey: string, text: string, uuid?: string): void {
    const entry = this.sessions.get(runtimeKey);
    if (!entry) {
      throw new Error("acp session not running");
    }
    if (uuid) {
      entry.relay.appendAndBroadcast(JSON.stringify({ type: "acp_user_echo", text, uuid }));
    }
    const queue = this.pendingQueues.get(runtimeKey) ?? [];
    if (queue.length >= ACP_PENDING_QUEUE_CAP) {
      entry.relay.reportError(new Error("acp prompt queue is full"));
      return;
    }
    queue.push(text);
    this.pendingQueues.set(runtimeKey, queue);
    this.flushQueue(runtimeKey);
  }

  /** 中断当前 turn：session/cancel（协议通知，不等待）；排队项丢弃（用户中止意图）。 */
  async interrupt(runtimeKey: string): Promise<void> {
    const entry = this.sessions.get(runtimeKey);
    if (!entry) return;
    this.pendingQueues.set(runtimeKey, []);
    try {
      entry.conn.cancel({ sessionId: entry.acpSessionId });
    } catch {
      // 连接可能已死，不阻断（relay error 由进程退出路径上报）。
    }
  }

  /** 订阅 relay 流（acp-stream 的 startStream 入口；open 先 ensureRunning，entry 必在）。 */
  stream(
    runtimeKey: string,
    onData: (line: string) => void,
    onError: (err: Error) => void,
  ): RuntimeStream {
    const entry = this.sessions.get(runtimeKey);
    if (!entry) {
      queueMicrotask(() => onError(new Error("acp session not running")));
      return { close: () => {} };
    }
    return entry.relay.addSubscriber(onData, onError);
  }

  /** 有订阅者（有人连着看）——存活判据之一。 */
  hasSubscribers(runtimeKey: string): boolean {
    return this.sessions.get(runtimeKey)?.relay.hasSubscribers ?? false;
  }

  /** RuntimeResources.close：杀进程 + 清 entry。acpSessionId 保留在 metadata（可再 load）。 */
  async close(runtimeKey: string): Promise<void> {
    const entry = this.sessions.get(runtimeKey);
    if (!entry) return;
    this.sessions.delete(runtimeKey);
    this.pendingQueues.delete(runtimeKey);
    this.sending.delete(runtimeKey);
    this.killProc(entry.proc);
    entry.relay.destroy();
  }

  /** RuntimeResources.exists：进程内存活即存活（镜像 claudeRuntime.exists）。 */
  async exists(runtimeKey: string): Promise<boolean> {
    return this.sessions.has(runtimeKey);
  }

  /** RuntimeResources.listAliveRuntimeKeys：进程内 Map keys（无 spawn）。 */
  async listAliveRuntimeKeys(): Promise<Set<string>> {
    return new Set(this.sessions.keys());
  }

  /**
   * Client handler（agent → client 反向调用）：sessionUpdate 是唯一数据入口（透传
   * acp_event 帧）；requestPermission Phase 1 自动 allow（首个 allow_* option，无则
   * cancelled）；fs/terminal 未广告 capability，理论不会被调用（防御性拒绝）。
   */
  private buildClientHandler(runtimeKey: string): acp.Client {
    return {
      sessionUpdate: (params: SessionNotification) => {
        this.handleSessionUpdate(runtimeKey, params);
      },
      requestPermission: (params: RequestPermissionRequest): RequestPermissionResponse => {
        const allowOption = params.options.find(
          (o) => o.kind === "allow_once" || o.kind === "allow_always",
        );
        return {
          outcome: allowOption
            ? { outcome: "selected", optionId: allowOption.optionId }
            : { outcome: "cancelled" },
        };
      },
    };
  }

  /** session/update → acp_event 帧行：load 回放期收集进 history 段，平时 appendAndBroadcast。
   *  注意 collector 判断必须在 entry 守卫之前——entry 在 loadSession 完成后才注册，回放期
   *  update 只能经 collector 接住（否则恢复会话的历史全丢）。 */
  private handleSessionUpdate(runtimeKey: string, params: SessionNotification): void {
    const line = JSON.stringify({
      type: "acp_event",
      event: params.update as unknown as Record<string, unknown>,
    });
    const collector = this.historyCollectors.get(runtimeKey);
    if (collector) {
      collector.push(line);
      return;
    }
    const entry = this.sessions.get(runtimeKey);
    if (!entry) return;
    entry.relay.appendAndBroadcast(line);
    this.onActivity?.(entry.sessionId);
  }

  /** stderr 泵到 runDir/acp-stderr/<runtimeKey>.log（镜像 claude-stderr 布局；诊断用）。 */
  private async pumpStderr(runtimeKey: string, stderr: ReadableStream<Uint8Array>): Promise<void> {
    try {
      const logPath = join(this.runDir, ACP_STDERR_DIR, `${runtimeKey}.log`);
      await Bun.write(logPath, "");
      const sink = Bun.file(logPath).writer();
      for await (const chunk of stderr) {
        sink.write(chunk);
      }
      await sink.end();
    } catch {
      // 日志失败不影响主链路（进程可能已被 close 杀掉，流读 aborted）。
    }
  }

  /** 队列 flush：sending 在飞不抢跑；prompt 响应（stopReason）= turn 边界 → ended 帧。 */
  private flushQueue(runtimeKey: string): void {
    if (this.sending.has(runtimeKey)) return;
    const entry = this.sessions.get(runtimeKey);
    if (!entry) return;
    const queue = this.pendingQueues.get(runtimeKey);
    const text = queue?.shift();
    if (!queue || text === undefined) return;
    this.sending.add(runtimeKey);
    void entry.conn
      .prompt({ sessionId: entry.acpSessionId, prompt: [{ type: "text", text }] })
      .then((response) => {
        this.sending.delete(runtimeKey);
        entry.relay.broadcastOnly(
          JSON.stringify({ type: "ended", stopReason: response.stopReason }),
        );
        this.flushQueue(runtimeKey);
      })
      .catch((error) => {
        this.sending.delete(runtimeKey);
        const message = error instanceof Error ? error : new Error(String(error));
        entry.relay.reportError(message);
        this.flushQueue(runtimeKey);
      });
  }

  /** 杀进程：stdin EOF（omp 收到退出）→ kill 兜底。进程组加固（killpg 防孤儿 MCP）留 Phase 3。 */
  private killProc(proc: Bun.Subprocess<"pipe", "pipe", "pipe">): void {
    try {
      proc.stdin.end();
    } catch {
      /* ignore */
    }
    try {
      proc.kill();
    } catch {
      /* already exited */
    }
  }
}
