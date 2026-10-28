import { join } from "node:path";
import type {
  ClaudeAutoRetryConfig,
  CodexAccountUsage,
  CodexCredentials,
  CodexPermissionMode,
  CodexRateLimitWindow,
  CodexStreamServerMessage,
} from "@agents-remote/shared";
import type { RuntimeStream } from "./session-registry";
import { PiSessionRelay } from "./pi-relay";
import { AutoRetryWatch } from "./agent-auto-retry";
import {
  codexConfigOverrideArgs,
  prepareCodexRuntimeHome,
  type PreparedCodexHome,
} from "./codex-home";
import { getAgentProviderProfile } from "./agent-provider-profiles";
import { buildMcpInjectorForProvider } from "./mcp-injector";

// ── codex runtime（codex app-server 直连，docs/plans codex 一等 provider 批）────────
//
// 每会话一个 `codex app-server` 进程（JSON-RPC over stdio JSONL，argv 数组直拉，非 tmux），
// 「进程内存活 = 会话存活」与 AcpRuntime 不变量同构。协议事实（scripts/fixtures/
// codex-appserver/ 真机帧 + `codex app-server generate-ts` 0.163.0 生成绑定；绑定 747 文件
// 仅供对照、本仓无 import，落在 gitignore 的 api/src/codex-generated/，升级 codex 时重生成）：
// - turn 生命周期：turn/start 立即返回 turn 对象，turn/started|completed 靠通知；
//   server **不拒绝并发 turn/start**（探针 S6 实证）→ 单飞 + 排队必须在本层做。
// - turn/start 的 model/effort/approvalPolicy/sandboxPolicy 覆盖 = 本轮及后续轮
//   （绑定注释 + 探针 S9 实证 thread.reasoningEffort 被改写）→ 配置热切换走
//   「存 pending，下一个 turn/start 应用」，UI 诚实标注「下轮生效」。
// - 审批 = server→client JSON-RPC 请求（item/*/requestApproval），须回 response；
//   serverRequest/resolved 通知确认往返闭环。
// - 历史恢复 = thread/resume（响应自带全部 turns[].items）→ 合成与实时同形的
//   codex_event 行定格进 relay history 段（前端单一条映射管道，item/completed 即定格态）。

/** codex stderr 日志目录名（runDir 下，镜像 acp-stderr 布局）。 */
const CODEX_STDERR_DIR = "codex-stderr";

/** app-server 子进程的最小环境白名单（security review P1-1）：API 进程的其余 env
 *（密钥/内部配置）不经环境泄漏给 agent 进程。HOME 供 ~/.codex 兜底凭据链、PATH 供
 * 代理二进制、代理/locale/TMPDIR 是基础运行面、CODEX_HOME 支持自定义状态目录。
 * claude/acp 的 spawn 同病影响面大，另批处理。 */
const CODEX_ENV_KEYS = [
  "PATH",
  "HOME",
  "TMPDIR",
  "LANG",
  "LC_ALL",
  "TZ",
  "HTTP_PROXY",
  "http_proxy",
  "HTTPS_PROXY",
  "https_proxy",
  "NO_PROXY",
  "no_proxy",
  "CODEX_HOME",
] as const;

export function codexSpawnEnv(prepared?: PreparedCodexHome): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of CODEX_ENV_KEYS) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  // codex 0.163 运行期不读 OPENAI_API_KEY / OPENAI_BASE_URL（2026-10-28 源码+实测：无
  // auth.json 时请求不带 Authorization，base_url 恒打官方端点）。settings 凭据唯一可靠
  // 通道 = 专属 CODEX_HOME（auth.json 0600 + `-c openai_base_url` 覆盖，codex-home.ts）。
  // 此处只钉非机密目录路径；未配置 apiKey 时 prepared.codexHome 为 null，不覆盖父 env
  // 的 CODEX_HOME（回退用户自身凭证链）。
  if (prepared?.codexHome) env.CODEX_HOME = prepared.codexHome;
  return env;
}

/** prompt 外 RPC 超时（initialize、thread 系、model/list；turn/start 响应快也护住）。 */
const CODEX_RPC_TIMEOUT_MS = 60_000;

/** 压缩接管闸兜底超时（compact RPC 已回但线程始终不发 turn/started 时复位单飞闸）。 */
const COMPACT_GATE_TIMEOUT_MS = 30_000;

/** turn 进行中再来的 user 消息排队上限（防内存无限增长；ACP 同值）。 */
const CODEX_PENDING_QUEUE_CAP = 32;

/** 权限模式 → (approvalPolicy, sandbox) 组合（shared CodexPermissionMode 注释的单源实现）。 */
const CODEX_PERMISSION_PRESETS: Record<
  CodexPermissionMode,
  { approvalPolicy: "untrusted" | "on-request" | "never"; sandbox: string }
> = {
  readonly: { approvalPolicy: "never", sandbox: "read-only" },
  default: { approvalPolicy: "untrusted", sandbox: "workspace-write" },
  auto: { approvalPolicy: "on-request", sandbox: "workspace-write" },
  full: { approvalPolicy: "never", sandbox: "danger-full-access" },
};

/** thread/start config 白名单键（client 消息不直达 config——服务端从受控字段合成）。 */
const THREAD_CONFIG_KEYS = {
  effort: "model_reasoning_effort",
} as const;

/** SandboxMode 字符串 → turn/start 的 sandboxPolicy 对象（writableRoots 钉 cwd）。 */
function sandboxModeToPolicy(sandbox: string, cwd: string): Record<string, unknown> | undefined {
  switch (sandbox) {
    case "read-only":
      return { type: "readOnly", networkAccess: false };
    case "workspace-write":
      return {
        type: "workspaceWrite",
        writableRoots: [cwd],
        networkAccess: false,
        excludeTmpdirEnvVar: false,
        excludeSlashTmp: false,
      };
    case "danger-full-access":
      return { type: "dangerFullAccess" };
    default:
      return undefined;
  }
}

/** app-server 回读的 sandboxPolicy.type → SandboxMode 字符串（policyPairToPermissionMode 用）。 */
const SANDBOX_TYPE_TO_MODE: Record<string, string> = {
  readOnly: "read-only",
  workspaceWrite: "workspace-write",
  dangerFullAccess: "danger-full-access",
};

/**
 * (approvalPolicy, sandbox) 回读对 → 权限模式词（CODEX_PERMISSION_PRESETS 反向查找）。
 * 存储层/前端选择器统一用权限模式词（readonly/default/auto/full）；app-server 回读是
 * AskForApproval 枚举 + sandboxPolicy 对象（fixtures 实证），必须翻译回来才进 entry.config。
 * 未命中（服务端自配的组合）返回 undefined——config 保留 spawn 时意图值，不伪造回读。
 */
export function policyPairToPermissionMode(
  approvalPolicy: string,
  sandbox: unknown,
): CodexPermissionMode | undefined {
  const sandboxMode =
    typeof sandbox === "string"
      ? sandbox
      : SANDBOX_TYPE_TO_MODE[(sandbox as { type?: string } | null)?.type ?? ""];
  if (!sandboxMode) return undefined;
  for (const [mode, preset] of Object.entries(CODEX_PERMISSION_PRESETS)) {
    if (preset.approvalPolicy === approvalPolicy && preset.sandbox === sandboxMode) {
      return mode as CodexPermissionMode;
    }
  }
  return undefined;
}

// ── JSON-RPC over stdio 连接层 ──────────────────────────────────────────────

/** app-server 入站帧（宽进）：fixtures 实证 server 请求不带 jsonrpc 字段。 */
type InboundFrame = {
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number | string; message: string };
};

/** server→client 审批请求（需回 response 的三类 requestApproval 之一）。 */
export type CodexServerApprovalRequest = {
  rpcId: number | string;
  method: string;
  params: Record<string, unknown>;
};

type PendingRequest = {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
};

/**
 * 单个 app-server 进程的 JSON-RPC 连接：NDJSON 读写 + pending 表 + server 请求/通知分发。
 * 判别（无 jsonrpc 字段可依）：有 id 有 method = server 请求；有 id 无 method = 响应；
 * 有 method 无 id = 通知。
 */
class CodexConn {
  private nextId = 1;
  private readonly pending = new Map<number | string, PendingRequest>();
  onNotification: (method: string, params: Record<string, unknown>) => void = () => {};
  onServerRequest: (request: CodexServerApprovalRequest) => void = () => {};
  onExit: () => void = () => {};

  constructor(private readonly proc: Bun.Subprocess<"pipe", "pipe", "pipe">) {
    void this.readLoop();
  }

  private async readLoop(): Promise<void> {
    const reader = (this.proc.stdout as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    // 分片数组累积（ACP LineBuffer 同思路）：thread/resume 响应是整线程历史一行 JSON
    // （MB 级），字符串 += 每块全量重拷是 O(S²/C)（perf review P2-1）。片段推入数组，
    // 含换行的片段到达才 join 一次（每帧一次），行用游标切片；尾巴回填为下一帧首片段。
    let parts: string[] = [];
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        parts.push(text);
        if (!text.includes("\n")) continue;
        const joined = parts.join("");
        parts = [];
        let start = 0;
        let idx: number;
        while ((idx = joined.indexOf("\n", start)) >= 0) {
          const line = joined.slice(start, idx);
          start = idx + 1;
          if (line.trim()) this.handleLine(line);
        }
        const rest = joined.slice(start);
        if (rest) parts.push(rest);
      }
    } catch {
      // 流中断（进程退出）走 exited 回调路径。
    }
    // 进程退出：在飞 RPC 全部拒绝（否则 initialize/thread 系挂满 60s 超时——启动即崩
    // 时 WS open 侧干等一分钟，code review P1-7）。
    for (const [, p] of this.pending) {
      p.reject(new Error("codex app-server process exited"));
    }
    this.pending.clear();
    this.onExit();
  }

  private handleLine(line: string): void {
    let frame: InboundFrame;
    try {
      frame = JSON.parse(line) as InboundFrame;
    } catch {
      return; // 非法行丢弃（app-server 理论上只产 JSONL）
    }
    if (frame.id !== undefined && frame.method !== undefined) {
      this.onServerRequest({
        rpcId: frame.id,
        method: frame.method,
        params: (frame.params ?? {}) as Record<string, unknown>,
      });
      return;
    }
    if (frame.id !== undefined) {
      const pending = this.pending.get(frame.id);
      if (!pending) return;
      this.pending.delete(frame.id);
      if (frame.error) {
        pending.reject(new Error(frame.error.message || `codex rpc error ${frame.error.code}`));
      } else {
        pending.resolve(frame.result);
      }
      return;
    }
    if (frame.method) {
      this.onNotification(frame.method, (frame.params ?? {}) as Record<string, unknown>);
    }
  }

  request(method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.writeFrame({ jsonrpc: "2.0", id, method, params });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`codex ${method} timed out after ${CODEX_RPC_TIMEOUT_MS}ms`));
        }
      }, CODEX_RPC_TIMEOUT_MS).unref();
    });
  }

  notify(method: string, params: Record<string, unknown>): void {
    this.writeFrame({ jsonrpc: "2.0", method, params });
  }

  respond(rpcId: number | string, result: unknown): void {
    this.writeFrame({ jsonrpc: "2.0", id: rpcId, result });
  }

  respondError(rpcId: number | string, code: number, message: string): void {
    this.writeFrame({ jsonrpc: "2.0", id: rpcId, error: { code, message } });
  }

  private writeFrame(frame: Record<string, unknown>): void {
    try {
      this.proc.stdin.write(`${JSON.stringify(frame)}\n`);
    } catch {
      // stdin 已断（进程退出路径上报 error，不在这里抛）。
    }
  }
}

// ── 会话 entry 与配置态 ─────────────────────────────────────────────────────

type CodexThreadConfig = {
  model?: string;
  effort?: string;
  approvalPolicy: string;
  sandbox: string;
};

type CodexSessionEntry = {
  sessionId: string;
  projectName: string;
  /** session cwd（thread/start 传入；sandboxPolicy.writableRoots 用）。 */
  projectPath: string;
  proc: Bun.Subprocess<"pipe", "pipe", "pipe">;
  conn: CodexConn;
  relay: PiSessionRelay;
  threadId: string;
  /** 当前生效配置（thread/start|resume 响应回读 + set_config 合并后的预期值）。 */
  config: CodexThreadConfig;
  /** codex_config 帧的 models 菜单（ensureRunning 时 model/list 归一；空 = 未登录/无目录）。 */
  models: CodexConfigSnapshot["models"];
  /** 账号额度快照（批 E 防御式）：仅 ChatGPT 登录形态可得，随 codex_config 帧下发。 */
  account?: CodexAccountUsage;
  /** 额度刷新在飞闸（perf P2-2）：成簇的 rateLimits/updated 只跑一轮 RPC + 一帧 config。 */
  accountRefreshing?: boolean;
  /** 用户下轮生效的配置覆盖（flushQueue 组装 turn/start 时消费并清空）。 */
  pendingConfig: Partial<CodexThreadConfig>;
  /** 单飞 turn id（null = 空闲）；turn/completed 通知是唯一关闭信号。 */
  inFlightTurnId: string | null;
  /** turn/start 的 RPC 往返窗口闸（code review P1-4）：同步置位，防窗口内二次下发。 */
  startingTurn: boolean;
  /** turn 代际（P1-4 时序防御）：completed 与 turn/start 响应到达序不保证，迟到的
   * 响应回调按代际失效（不复活已完成 turnId 卡死单飞）。 */
  turnGeneration: number;
  /** 压缩 turn id（thread/compact/start 产生的 turn，探针 E2）：turn/completed 时豁免
   * 自动重试（压缩失败 ≠ agent 轮失败）。 */
  compactingTurnId: string | null;
};

export type CodexSpawnTarget = {
  /** SessionRegistry metadata id（回写/活动/状态回调）。 */
  sessionId: string;
  projectName: string;
  /** runtimeKey = Map key。 */
  runtimeKey: string;
  /** session cwd（Project-safe resolver 产出的绝对路径）。 */
  projectPath: string;
  /** metadata 已存的 thread id（API 重启恢复 → thread/resume）。 */
  codexThreadId?: string;
  /** 初始权限模式（metadata.permissionMode；非法值回退 default）。 */
  permissionMode?: string;
  /** 初始模型（metadata.model；空 = codex 默认）。 */
  model?: string;
  /** 初始 effort（metadata.effort；空 = codex 默认）。 */
  effort?: string;
};

export type CodexApprovalRequestInfo = {
  runtimeKey: string;
  sessionId: string;
  projectName: string;
  rpcId: number | string;
  method: string;
  params: Record<string, unknown>;
  /** 登记卡字段（runtime 层已算好，index.ts 装配 ApprovalRecord 直接用）。 */
  toolName: string;
  inputSummary: string;
};

export type CodexConfigSnapshot = Extract<CodexStreamServerMessage, { type: "codex_config" }>;

/** 排队中的用户消息（write 入队 / steer 回退共用形状）。 */
type CodexPendingMessage = {
  text: string;
  uuid?: string;
  images?: { data: string; mimeType: string }[];
};

/** 审批应答决策（ApprovalCenter 的 allow/deny → 各 requestApproval 族的 response）。 */
export type CodexApprovalDecision = "accept" | "decline";

export class CodexRuntime {
  private readonly sessions = new Map<string, CodexSessionEntry>();
  private readonly pendingQueues = new Map<string, CodexPendingMessage[]>();
  private onCodexThreadId?: (sessionId: string, threadId: string) => void;
  private onActivity?: (sessionId: string) => void;
  private onStatusChange?: (
    sessionId: string,
    status: "working" | "blocked" | "done" | "error" | "closed",
  ) => void;
  private onApprovalRequest?: (info: CodexApprovalRequestInfo) => void;
  private onConfigPersist?: (
    sessionId: string,
    config: { model?: string; effort?: string; approvalPolicy?: string; sandbox?: string },
  ) => void;
  // 自动重试注入配置源（index.ts 从 SessionRegistry metadata 读 autoRetry config）——
  // 与 ClaudeRuntime 同款 provider 无关状态机（agent-auto-retry.ts）。
  private autoRetryConfigProvider?: (
    sessionId: string,
  ) => ClaudeAutoRetryConfig | undefined | Promise<ClaudeAutoRetryConfig | undefined>;
  // 自动重试状态机：turn/completed failed → 延迟注入配置消息。
  private readonly autoRetry: AutoRetryWatch;

  constructor(
    private readonly runDir: string,
    /** agent 启动命令（argv 数组）：测试 seam（fake NDJSON 脚本替换真实 codex）。 */
    private readonly command: string[] = ["codex", "app-server"],
    /** settings codex 凭据切片读取（每次 spawn 前调用；acp 同款注入 seam，测试可注入假值）。 */
    private readonly resolveCredentials?: () => Promise<CodexCredentials | undefined>,
    /** hub MCP 端口（绑 127.0.0.1；undefined = 不注入 ar-hub 工具）。 */
    private readonly mcpPort?: number,
  ) {
    this.autoRetry = new AutoRetryWatch({
      getConfig: (_runtimeKey, sessionId) => this.autoRetryConfigProvider?.(sessionId),
      inject: (runtimeKey, message) => {
        // 注入 = 自动替用户发一条消息：走 write（自带 codex_user_echo + user_input 状态
        // 迁移 + turn/start 排队）。uuid 前缀与 claude 注入同款，前端可识别合成输入。
        // 会话在 delayMs 内被 close/进程退出 → write throw，丢弃本次注入（AutoRetryWatch
        // 契约要求实现方吞掉该错误，否则 fire 的 void 调用会悬空 rejection）。
        try {
          this.write(runtimeKey, message, `injected-${crypto.randomUUID()}`);
        } catch (err) {
          console.warn("[codex] auto-retry injection dropped:", err);
        }
      },
    });
  }

  setAutoRetryConfigProvider(
    cb: (
      sessionId: string,
    ) => ClaudeAutoRetryConfig | undefined | Promise<ClaudeAutoRetryConfig | undefined>,
  ): void {
    this.autoRetryConfigProvider = cb;
  }

  // ── 自动重试待发注入的控制桥（与 ClaudeRuntime 同名接口，index.ts 路由统一派发）──
  autoRetryPending(runtimeKey: string) {
    return this.autoRetry.pendingStatus(runtimeKey);
  }

  cancelAutoRetry(runtimeKey: string): void {
    this.autoRetry.cancelPending(runtimeKey);
  }

  fireAutoRetryNow(runtimeKey: string): Promise<boolean> {
    return this.autoRetry.fireNow(runtimeKey);
  }

  setOnCodexThreadId(callback: (sessionId: string, threadId: string) => void): void {
    this.onCodexThreadId = callback;
  }

  setOnActivity(callback: (sessionId: string) => void): void {
    this.onActivity = callback;
  }

  setOnStatusChange(
    callback: (
      sessionId: string,
      status: "working" | "blocked" | "done" | "error" | "closed",
    ) => void,
  ): void {
    this.onStatusChange = callback;
  }

  setOnApprovalRequest(callback: (info: CodexApprovalRequestInfo) => void): void {
    this.onApprovalRequest = callback;
  }

  /** 配置热切换落盘回调（index.ts 接 sessionRegistry.setModel/effort/permissionMode）。 */
  setOnConfigPersist(
    callback: (
      sessionId: string,
      config: { model?: string; effort?: string; approvalPolicy?: string; sandbox?: string },
    ) => void,
  ): void {
    this.onConfigPersist = callback;
  }

  /** RuntimeResources.startAgent：创建即拉起（spawn + initialize + thread/start|resume）。 */
  async startAgent(metadata: {
    id: string;
    projectName: string;
    runtimeKey: string;
    projectPath: string;
    codexThreadId?: string;
    permissionMode?: string;
    model?: string;
    effort?: string;
  }): Promise<void> {
    await this.ensureRunning({
      sessionId: metadata.id,
      projectName: metadata.projectName,
      runtimeKey: metadata.runtimeKey,
      projectPath: metadata.projectPath,
      codexThreadId: metadata.codexThreadId,
      permissionMode: metadata.permissionMode,
      model: metadata.model,
      effort: metadata.effort,
    });
  }

  /**
   * 懒启动（幂等 + 单飞）：并发调用（双 WS open 竞态）共享同一启动 promise，防双
   * spawn（perf review P2-3）；失败后清除 in-flight 可重试。本体见 doEnsureRunning。
   */
  async ensureRunning(target: CodexSpawnTarget): Promise<void> {
    const inFlight = this.ensureInFlight.get(target.runtimeKey);
    if (inFlight) return inFlight;
    const promise = this.doEnsureRunning(target).finally(() => {
      this.ensureInFlight.delete(target.runtimeKey);
    });
    this.ensureInFlight.set(target.runtimeKey, promise);
    return promise;
  }

  private readonly ensureInFlight = new Map<string, Promise<void>>();

  /**
   * spawn 前凭据/配置准备（chat 与 terminal 两形态同源）：fresh 读 settings → 专属
   * CODEX_HOME（codex-home.ts）。两处失败都回退「不注入」（走 codex 自身凭证链），
   * 不阻断会话启动——与 acp resolveCredentials 同款尽力而为时序。
   */
  async prepareSpawnContext(): Promise<PreparedCodexHome> {
    const credentials = await this.resolveCredentials?.().catch((err) => {
      console.warn("[codex] settings read failed, falling back to agent credentials:", err);
      return undefined;
    });
    return prepareCodexRuntimeHome({ runDir: this.runDir, credentials }).catch(
      (err): PreparedCodexHome => {
        console.warn("[codex] runtime home unavailable, falling back to global credentials:", err);
        return { codexHome: null, configOverrides: [] };
      },
    );
  }

  /**
   * 启动本体：spawn + initialize → 有 threadId 走 thread/resume（turns → history 行
   * 定格），否则 thread/start → backfill threadId。随后 model/list + codex_config 帧入
   * live 缓冲（未登录/空目录 → 不注 config 帧，前端无选择器 = 能力信号，acp 同约定）。
   */
  private async doEnsureRunning(target: CodexSpawnTarget): Promise<void> {
    if (this.sessions.has(target.runtimeKey)) return;

    // 专属 CODEX_HOME（auth.json 0600 + sessions 软链 + baseUrl 经 -c 覆盖）——每次 spawn
    // 前重建（settings 热更新生效）。ar-hub MCP 注入（批 E）同走 `-c` 通道。
    const prepared = await this.prepareSpawnContext();
    const proc = Bun.spawn(
      [
        ...this.command,
        ...codexConfigOverrideArgs(prepared.configOverrides),
        ...this.mcpArgs(target.projectName),
      ],
      {
        cwd: target.projectPath,
        env: codexSpawnEnv(prepared),
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    void this.pumpStderr(target.runtimeKey, proc.stderr);

    const entry: CodexSessionEntry = {
      sessionId: target.sessionId,
      projectName: target.projectName,
      projectPath: target.projectPath,
      proc,
      conn: null as unknown as CodexConn,
      relay: new PiSessionRelay(),
      threadId: "",
      config: { approvalPolicy: "", sandbox: "" },
      models: [],
      pendingConfig: {},
      inFlightTurnId: null,
      startingTurn: false,
      turnGeneration: 0,
      compactingTurnId: null,
    };
    const conn = new CodexConn(proc);
    entry.conn = conn;
    // handlers 先挂 + entry 立即入表（security review P2-4）：启动 RPC 窗口内 close/
    // exists 即可观测到进程（close 能杀掉半启动会话，不产生「close 后复活」孤儿）。
    // 失败走 catch 出表 + 杀进程；窗口内订阅 relay 只会等到空 history（无丢失）。
    this.registerNotificationHandlers(target.runtimeKey, entry);
    this.sessions.set(target.runtimeKey, entry);

    try {
      await this.rpcWithTimeout(
        conn,
        "initialize",
        {
          clientInfo: { name: "agents-remote", title: null, version: "0.0.0" },
          capabilities: null,
        },
        "codex initialize",
      );
      conn.notify("initialized", {});

      const preset =
        CODEX_PERMISSION_PRESETS[(target.permissionMode ?? "default") as CodexPermissionMode] ??
        CODEX_PERMISSION_PRESETS.default;

      let model = target.model || undefined;
      let effort = target.effort || undefined;

      if (target.codexThreadId) {
        // 恢复：thread/resume 响应自带全部 turns → 合成 history 行定格。覆盖参数透传
        //（code review P2-11，ThreadResumeParams 支持 model/approvalPolicy/sandbox/
        // config）：用户改过的 permissionMode/model/effort 不被 thread 保存值顶回。
        const resumeConfig: Record<string, unknown> = {};
        if (effort) resumeConfig[THREAD_CONFIG_KEYS.effort] = effort;
        const resumed = (await this.rpcWithTimeout(
          conn,
          "thread/resume",
          {
            threadId: target.codexThreadId,
            ...(model ? { model } : {}),
            approvalPolicy: preset.approvalPolicy,
            sandbox: preset.sandbox,
            ...(Object.keys(resumeConfig).length > 0 ? { config: resumeConfig } : {}),
          },
          "codex thread/resume",
        )) as {
          thread?: {
            id?: string;
            model?: string | null;
            reasoningEffort?: string | null;
            turns?: CodexHistoryTurn[];
          };
          approvalPolicy?: unknown;
          sandbox?: unknown;
          model?: string;
          reasoningEffort?: string | null;
        };
        entry.threadId = resumed.thread?.id ?? target.codexThreadId;
        // 回读权威值优先，spawn 参数兜底（resume 响应缺字段时保留调用方意图）。
        model = model ?? resumed.model ?? undefined;
        effort = effort ?? resumed.reasoningEffort ?? undefined;
        // 权限回读反向映射：approvalPolicy（AskForApproval 枚举）+ sandbox（策略对象）
        // → 权限模式词；未命中（服务端自配组合）保留 spawn 意图值，不伪造回读。
        const resumedMode =
          typeof resumed.approvalPolicy === "string"
            ? policyPairToPermissionMode(resumed.approvalPolicy, resumed.sandbox)
            : undefined;
        entry.config = {
          model: model ?? "",
          effort: effort ?? undefined,
          approvalPolicy: resumedMode ?? target.permissionMode ?? "default",
          sandbox: resumedMode ? CODEX_PERMISSION_PRESETS[resumedMode].sandbox : preset.sandbox,
        };
        entry.relay.loadHistory(
          synthesizeHistoryLines(
            resumed.thread?.turns as CodexHistoryTurn[] | undefined,
            entry.threadId,
          ),
        );
        entry.relay.setResume(true);
      } else {
        const config: Record<string, unknown> = {};
        if (effort) config[THREAD_CONFIG_KEYS.effort] = effort;
        const started = (await this.rpcWithTimeout(
          conn,
          "thread/start",
          {
            cwd: target.projectPath,
            ...(model ? { model } : {}),
            approvalPolicy: preset.approvalPolicy,
            sandbox: preset.sandbox,
            ...(Object.keys(config).length > 0 ? { config } : {}),
          },
          "codex thread/start",
        )) as {
          thread?: { id?: string };
          model?: string;
          reasoningEffort?: string | null;
          approvalPolicy?: unknown;
          sandbox?: unknown;
        };
        entry.threadId = started.thread?.id ?? "";
        if (!entry.threadId) throw new Error("codex thread/start returned no thread id");
        model = model ?? started.model ?? undefined;
        effort = effort ?? started.reasoningEffort ?? undefined;
        // 权限回读反向映射（同 resume 分支）：config 统一权限模式词域。
        const startedMode =
          typeof started.approvalPolicy === "string"
            ? policyPairToPermissionMode(started.approvalPolicy, started.sandbox)
            : undefined;
        entry.config = {
          model: model ?? "",
          effort: effort ?? undefined,
          approvalPolicy: startedMode ?? target.permissionMode ?? "default",
          sandbox: startedMode ? CODEX_PERMISSION_PRESETS[startedMode].sandbox : preset.sandbox,
        };
        entry.relay.loadHistory([]);
        entry.relay.setResume(false);
        this.onCodexThreadId?.(target.sessionId, entry.threadId);
      }

      // models 菜单 + codex_config 帧（回放序 = history → config，acp 同构）。
      await this.refreshModels(entry);
      this.injectConfigFrame(target.runtimeKey, entry);
      // 账号额度（批 E 防御式）：不阻塞主链路，拉到后回灌一帧 config（客户端 latest-wins）。
      void this.refreshAccount(target.runtimeKey, entry);
    } catch (error) {
      // 启动失败：出表（立即入表的回滚）+ 断订阅者 + 杀进程。
      this.sessions.delete(target.runtimeKey);
      entry.relay.destroy();
      this.killProc(proc);
      throw error;
    }
  }

  /** 发送 user 消息：在飞 turn 走 turn/steer 并入当前轮（批 E，探针 E3 实证同 turnId
   *  合流），RPC 失败（轮恰好收口的竞态）回退排队；空闲走单飞 turn/start / 排队。
   *  images = 图片附件（base64 裸数据，composer 附件管线产出，pi 同形）：组 input 的
   *  image 项（data URL——UserInput.image.url 接受 data URL）。 */
  write(
    runtimeKey: string,
    text: string,
    uuid?: string,
    images?: { data: string; mimeType: string }[],
  ): void {
    const entry = this.sessions.get(runtimeKey);
    if (!entry) throw new Error("codex session not running");
    // 用户手动介入（write 被外部调用）：取消待发的自动重试注入，不与用户输入叠加
    //（注入自身也走 write——彼时定时器已 fire 清空，无自我取消）。
    this.autoRetry.cancelPending(runtimeKey);
    const imgs = images && images.length > 0 ? images : undefined;
    const message: CodexPendingMessage = { text, uuid, images: imgs };
    // echo/working 在「消息确定被接收」后注入（code review P2-9）：队满丢弃路径不发
    // echo、不翻状态。steer 路径的落地（steer 成功 / 回退排队）都算接收 → echo 先行；
    // steerOrQueue 失败兜底入队，最坏情形是「echo 了但两条路径都丢」= 队满边界（写入
    // 前查过 cap，回退路径重复查，不越过上限）。
    const emitEcho = () => {
      if (!uuid) return;
      entry.relay.appendAndBroadcast(
        JSON.stringify({ type: "codex_user_echo", text, uuid, ...(imgs ? { images: imgs } : {}) }),
      );
    };
    if (entry.inFlightTurnId && !entry.startingTurn) {
      emitEcho();
      this.applyStatusSignal(entry, { kind: "user_input" });
      void this.steerOrQueue(runtimeKey, entry, message);
      return;
    }
    if (!this.enqueueMessage(runtimeKey, entry, message)) return;
    emitEcho();
    this.applyStatusSignal(entry, { kind: "user_input" });
    this.flushQueue(runtimeKey);
  }

  /** 队列入队（cap 检查）；满 → reportError 且返回 false（不发 echo 不翻状态）。 */
  private enqueueMessage(
    runtimeKey: string,
    entry: CodexSessionEntry,
    message: CodexPendingMessage,
  ): boolean {
    const queue = this.pendingQueues.get(runtimeKey) ?? [];
    if (queue.length >= CODEX_PENDING_QUEUE_CAP) {
      entry.relay.reportError(new Error("codex turn queue is full"));
      return false;
    }
    queue.push(message);
    this.pendingQueues.set(runtimeKey, queue);
    return true;
  }

  /** turn/steer 并入在飞轮；失败（轮已收口 / 连接断）回退排队——此刻 completed 已清
   *  inFlightTurnId，flushQueue 单飞闸自然放行；进程已死则 enqueue 落在出表后的
   *  Map 上，flushQueue no-op，错误由进程退出路径上报（不悬空 rejection）。 */
  private async steerOrQueue(
    runtimeKey: string,
    entry: CodexSessionEntry,
    message: CodexPendingMessage,
  ): Promise<void> {
    const turnId = entry.inFlightTurnId;
    if (!turnId) {
      if (this.enqueueMessage(runtimeKey, entry, message)) this.flushQueue(runtimeKey);
      return;
    }
    try {
      await this.rpcWithTimeout(
        entry.conn,
        "turn/steer",
        {
          threadId: entry.threadId,
          expectedTurnId: turnId,
          input: buildCodexUserInput(message.text, message.images),
        },
        "codex turn/steer",
      );
    } catch {
      if (this.enqueueMessage(runtimeKey, entry, message)) this.flushQueue(runtimeKey);
    }
  }

  /** 压缩上下文（批 E parity）：thread/compact/start——压缩以 turn 形态跑（探针 E2：
   *  turn/started → contextCompaction item → turn/completed），弃用通知
   *  thread/compacted 不再发。busy 拒绝：压缩与进行中 turn 并发未验证，先拒。 */
  async compact(runtimeKey: string): Promise<"ok" | "busy" | "missing" | "failed"> {
    const entry = this.sessions.get(runtimeKey);
    if (!entry || !entry.threadId) return "missing";
    if (entry.inFlightTurnId || entry.startingTurn) return "busy";
    // 占住单飞闸直到 turn/started 接管（压缩 RPC 回得快、turn/started 紧随；窗口内
    // 二次 write 不得并发开轮）。兜底：RPC 回 ok 但线程始终不发 turn/started 时闸不得
    // 永久占死（排队消息会一直悬停）——超时复位并放行队列。
    entry.startingTurn = true;
    const gateGuard = setTimeout(() => {
      if (this.sessions.get(runtimeKey) !== entry) return;
      if (!entry.startingTurn || entry.inFlightTurnId) return;
      entry.startingTurn = false;
      console.warn("[codex] compact turn never started; single-flight gate released");
      this.flushQueue(runtimeKey);
    }, COMPACT_GATE_TIMEOUT_MS);
    gateGuard.unref?.();
    try {
      await this.rpcWithTimeout(
        entry.conn,
        "thread/compact/start",
        { threadId: entry.threadId },
        "codex thread/compact/start",
      );
      return "ok";
    } catch (error) {
      entry.startingTurn = false;
      console.warn("[codex] compact start failed:", error);
      return "failed";
    } finally {
      clearTimeout(gateGuard);
    }
  }

  /** MCP 注入 argv（批 E）：`-c mcp_servers.ar-hub.url=…`。chat 直拉与 terminal（tmux
   *  TUI）两形态共用；mcpPort 未配置 = []（agent 仍能跑，能力降级不失败）。 */
  mcpArgs(projectName: string): string[] {
    if (!this.mcpPort) return [];
    const profile = getAgentProviderProfile("codex");
    if (!profile) return [];
    const injector = buildMcpInjectorForProvider(profile);
    if (!injector || !injector.canInject(profile)) return [];
    return injector.buildMcpConfig({ project: projectName, mcpPort: this.mcpPort })?.args ?? [];
  }

  /** 拉账号额度并回灌 config 帧（批 E 防御式）。端点仅 ChatGPT 登录可用（apiKey/网关
   *  登录报 chatgpt authentication required，探针 E4 实证）→ 失败静默，恒 undefined。
   *  perf P2-2：①成簇的 rateLimits/updated 通知合并（在飞即丢弃，快照恒 latest-wins）；
   *  ②通知 params 自带完整快照时不再多打一趟 read RPC；③lifetime 累计滚动不变，已采到
   *  就不再重复拉最重的 usage/read。 */
  private async refreshAccount(
    runtimeKey: string,
    entry: CodexSessionEntry,
    limitsFromNotification?: unknown,
  ): Promise<void> {
    if (entry.accountRefreshing) return;
    entry.accountRefreshing = true;
    try {
      const [limits, usage] = await Promise.all([
        limitsFromNotification !== undefined
          ? Promise.resolve(limitsFromNotification)
          : entry.conn.request("account/rateLimits/read", {}).catch(() => null),
        entry.account?.lifetimeTokens != null
          ? Promise.resolve(null)
          : entry.conn.request("account/usage/read", {}).catch(() => null),
      ]);
      const next = codexAccountFromResponses(limits, usage);
      if (!next) return;
      // 通知路径缺 usage 时保留已采到的 lifetime（不被 sparse 快照冲掉）。
      if (next.lifetimeTokens == null && entry.account?.lifetimeTokens != null) {
        next.lifetimeTokens = entry.account.lifetimeTokens;
      }
      entry.account = next;
      // RPC 窗口内会话可能已被 close（entry 出表）：不向已销毁 relay 注帧。
      if (this.sessions.get(runtimeKey) !== entry) return;
      this.injectConfigFrame(runtimeKey, entry);
    } finally {
      entry.accountRefreshing = false;
    }
  }

  /** 中断当前 turn：turn/interrupt；排队项丢弃（用户中止意图）。 */
  async interrupt(runtimeKey: string): Promise<void> {
    const entry = this.sessions.get(runtimeKey);
    if (!entry) return;
    this.pendingQueues.set(runtimeKey, []);
    // 用户主动中断 = 介入：待发自动重试一并作废（不依赖 turn/completed interrupted
    // 通知兜底——RPC 失败/无完成通知时定时器会存活到 60s 后）。
    this.autoRetry.cancelPending(runtimeKey);
    if (!entry.inFlightTurnId) return;
    try {
      await this.rpcWithTimeout(
        entry.conn,
        "turn/interrupt",
        { threadId: entry.threadId, turnId: entry.inFlightTurnId },
        "codex turn/interrupt",
      );
    } catch {
      // 连接可能已死 / turn 已完成，不阻断（错误由进程退出路径或 turn/completed 收口）。
    }
  }

  /**
   * 配置热切换：写 entry.config + pendingConfig（下个 turn/start 应用，app-server 覆盖
   * 语义 = 本轮及后续轮）。不即时回读——诚实形态，UI 标「下轮生效」。落盘走 onConfigPersist。
   */
  setThreadConfig(
    runtimeKey: string,
    patch: { model?: string; effort?: string; approvalPolicy?: string; sandbox?: string },
  ): CodexConfigSnapshot {
    const entry = this.sessions.get(runtimeKey);
    if (!entry) throw new Error("codex session not running");
    entry.pendingConfig = { ...entry.pendingConfig, ...patch };
    entry.config = { ...entry.config, ...patch };
    this.onConfigPersist?.(entry.sessionId, patch);
    this.injectConfigFrame(runtimeKey, entry);
    return this.configSnapshot(entry);
  }

  /** 审批应答（ApprovalCenter / 会话内托盘）：回 JSON-RPC response。 */
  respondApproval(
    runtimeKey: string,
    rpcId: number | string,
    decision: CodexApprovalDecision,
  ): void {
    const entry = this.sessions.get(runtimeKey);
    if (!entry) throw new Error("codex session not running");
    entry.conn.respond(rpcId, { decision });
    // 会话内托盘路径应答后通知清全局中心转发卡（code review P1-6；ApprovalCenter.respond
    // 全局路径自清 + 此钩子幂等 no-op）。index.ts 接 approvalCenter.unregisterForwarded。
    this.onApprovalResponded?.(runtimeKey, rpcId);
    this.applyStatusSignal(entry, { kind: "approval_settled" });
  }

  setOnApprovalResponded(callback: (runtimeKey: string, rpcId: number | string) => void): void {
    this.onApprovalResponded = callback;
  }

  private onApprovalResponded?: (runtimeKey: string, rpcId: number | string) => void;

  /** 订阅 relay 流（codex-stream 的 startStream 入口；open 先 ensureRunning，entry 必在）。
   *  sinceId = 增量回放锚（URL ?since=，客户端最后可锚条目 id），透传给 relay 定位。 */
  stream(
    runtimeKey: string,
    onData: (line: string) => void,
    onError: (err: Error) => void,
    sinceId?: string,
  ): RuntimeStream {
    const entry = this.sessions.get(runtimeKey);
    if (!entry) {
      queueMicrotask(() => onError(new Error("codex session not running")));
      return { close: () => {} };
    }
    const sub = entry.relay.addSubscriber(onData, onError, sinceId ? { sinceId } : undefined);
    // config 快照恒发（当前态标量语义，与审批快照同族——不进回放缓冲、直发该订阅者）。
    // delta 回放锚在 live 缓冲的 config 行之前（config 在 ensureRunning 时入库）会被
    // 截掉 → 客户端 config=null → 三选择器 + usage 环整个消失（真机反馈 2026-10-28：
    // IDB 缓存批引入的回归）。full 模式重复一帧幂等（客户端 latest-wins set）。
    const frame = this.buildConfigFrame(entry);
    if (frame) onData(frame);
    return sub;
  }

  hasSubscribers(runtimeKey: string): boolean {
    return this.sessions.get(runtimeKey)?.relay.hasSubscribers ?? false;
  }

  /** RuntimeResources.close：杀进程 + 清 entry（threadId 保留在 metadata，可再 resume）。 */
  async close(runtimeKey: string): Promise<void> {
    const entry = this.sessions.get(runtimeKey);
    if (!entry) return;
    this.sessions.delete(runtimeKey);
    this.pendingQueues.delete(runtimeKey);
    this.autoRetry.destroySession(runtimeKey);
    this.killProc(entry.proc);
    entry.relay.destroy();
    this.applyStatusSignal(entry, { kind: "close" });
    // 内存状态图清理（code review P2-12）：同 sessionId 之后重新 ensureRunning（close
    // 再开/resume）时状态从 idle 起，不吃残留 closed。
    this.sessionStatus.delete(entry.sessionId);
  }

  /** RuntimeResources.exists：进程内存活即存活（镜像 acpRuntime.exists）。 */
  async exists(runtimeKey: string): Promise<boolean> {
    return this.sessions.has(runtimeKey);
  }

  /** RuntimeResources.listAliveRuntimeKeys：进程内 Map keys（无 spawn）。 */
  async listAliveRuntimeKeys(): Promise<Set<string>> {
    return new Set(this.sessions.keys());
  }

  // ── 内部 ─────────────────────────────────────────────────────────────────

  private rpcWithTimeout(
    conn: CodexConn,
    method: string,
    params: Record<string, unknown>,
    label: string,
  ): Promise<unknown> {
    // CodexConn.request 已带 CODEX_RPC_TIMEOUT_MS 超时；这里只补 label 语境。
    return conn.request(method, params).catch((error: Error) => {
      throw new Error(`${label}: ${error.message}`);
    });
  }

  private registerNotificationHandlers(runtimeKey: string, entry: CodexSessionEntry): void {
    entry.conn.onNotification = (method, params) => {
      this.handleNotification(runtimeKey, entry, method, params);
    };
    entry.conn.onServerRequest = (request) => {
      this.handleServerRequest(runtimeKey, entry, request);
    };
    entry.conn.onExit = () => {
      this.handleExit(runtimeKey, entry);
    };
  }

  private handleNotification(
    runtimeKey: string,
    entry: CodexSessionEntry,
    method: string,
    params: Record<string, unknown>,
  ): void {
    // turn 生命周期信号（状态机）在透传之前采集——顺序无关紧要，先更新状态再广播。
    const turn = params.turn as { id?: unknown; status?: unknown } | undefined;
    // ended 边界帧在 codex_event(turn/completed) 透传之后才发（code review P2-10）：
    // 客户端投影先看到 turn 终态事件、再收 ended 定格，顺序与 claude result→ended 同构。
    let endedFrame: string | undefined;
    if (method === "turn/started") {
      // 压缩路径的 startingTurn 闸由 turn/started 接管（compact RPC 已回、turn 开跑）。
      // 同步清闸 + 置 inFlightTurnId 之间无 interleaving，不会重开 P1-4 的并发窗口。
      entry.startingTurn = false;
      if (!entry.inFlightTurnId) {
        entry.inFlightTurnId = typeof turn?.id === "string" ? turn.id : null;
      }
      // agent 已在干活 = 不需要注入（claude 侧「正常 assistant 行」的等价信号）：作废
      // 待发重试。覆盖「failed 后排队消息被 flushQueue 开跑」「新 turn 超过 delayMs」
      // 两种情形，否则会在 agent 工作中多注一条 turn。注入自身那条 turn 的 pending
      // 早已被 fire 清空 → 此处对注入无害。
      this.autoRetry.cancelPending(runtimeKey);
      this.applyStatusSignal(entry, { kind: "turn_activity" });
    } else if (method === "item/started") {
      // 压缩 turn 标记（批 E）：contextCompaction item 的 turnId → turn/completed 时
      // 豁免自动重试（压缩失败不是 agent 轮失败，注入「请继续」只会开无意义新轮）。
      const item = params.item as { type?: unknown } | undefined;
      if (item?.type === "contextCompaction" && typeof params.turnId === "string") {
        entry.compactingTurnId = params.turnId;
      }
    } else if (method === "account/rateLimits/updated") {
      // 额度窗口推送（ChatGPT 登录形态）：params 自带完整 RateLimitSnapshot（perf P2-2：
      // 宽进直取，不再多打一趟 read RPC）；快照缺形状时回退 read 兜底。失败静默。
      const carried = (params as { rateLimits?: unknown }).rateLimits;
      void this.refreshAccount(
        runtimeKey,
        entry,
        carried && typeof carried === "object" ? { rateLimits: carried } : undefined,
      );
    } else if (method === "turn/completed") {
      const status = turn?.status;
      const isError = status === "failed";
      const turnId = typeof turn?.id === "string" ? turn.id : null;
      const compacting = turnId !== null && entry.compactingTurnId === turnId;
      entry.compactingTurnId = null;
      entry.inFlightTurnId = null;
      // 代际 bump + 闸释放（code review P1-4）：completed 与 turn/start 响应到达序不
      // 保证——completed 先到时使在飞响应回调失效，flushQueue 不被 startingTurn 卡住。
      entry.turnGeneration++;
      entry.startingTurn = false;
      this.applyStatusSignal(entry, { kind: "turn_result", isError });
      // 自动重试（与 claude result is_error 同语义）：failed = 报错停下 → 调度注入；
      // 正常完成 = 确认上次注入成功/作废待发调度。压缩 turn 豁免（见上）。
      if (isError && !compacting) {
        this.autoRetry.notifyError(runtimeKey, entry.sessionId);
      } else {
        this.autoRetry.notifyNormal(runtimeKey);
      }
      // turn 已结束：该 runtime 的残留审批卡兜底清掉（server 不再等 response，P1-6）。
      this.onApprovalSettled(runtimeKey);
      endedFrame = JSON.stringify({
        type: "ended",
        stopReason: typeof status === "string" ? status : undefined,
      } satisfies Extract<CodexStreamServerMessage, { type: "ended" }>);
      // 下一个排队消息应用 pendingConfig（turn 间边界）。
      this.flushQueue(runtimeKey);
      // 不 return——turn/completed 本体仍走下方统一 codex_event 透传。
    }

    // 统一透传：codex_event 帧（loadHistory 之后的实时段全走 appendAndBroadcast）。
    entry.relay.appendAndBroadcast(
      JSON.stringify({ type: "codex_event", event: { method, params } }),
    );
    if (endedFrame) entry.relay.broadcastOnly(endedFrame);
    this.onActivity?.(entry.sessionId);
  }

  private handleServerRequest(
    runtimeKey: string,
    entry: CodexSessionEntry,
    request: CodexServerApprovalRequest,
  ): void {
    // 只接两族一键审批（command/fileChange）进全局中心；其余族不进中心但**必须按各自
    // 响应形状回复**（形状回错 server 会反序列化失败，app-server 挂死等待）：
    // - permissions 族（需 profile UI，P1 parity）：空 profile + turn scope = 不授予任何
    //   额外权限（PermissionsRequestApprovalResponse）。
    // - requestUserInput（提问非审批，P1 会话内选项卡）：空 answers = 用户未答。
    // - MCP elicitation：cancel（McpServerElicitationAction）。
    // - legacy execCommandApproval/applyPatchApproval：decision decline（decision 形状族）。
    // - 其余未知 method：JSON-RPC -32601 明确不支持（code review P1-5）。
    if (
      request.method !== "item/commandExecution/requestApproval" &&
      request.method !== "item/fileChange/requestApproval"
    ) {
      switch (request.method) {
        case "item/permissions/requestApproval":
          entry.conn.respond(request.rpcId, { permissions: {}, scope: "turn" });
          break;
        case "item/tool/requestUserInput":
          entry.conn.respond(request.rpcId, { answers: {} });
          break;
        case "mcpServer/elicitation/request":
          entry.conn.respond(request.rpcId, { action: "cancel" });
          break;
        case "execCommandApproval":
        case "applyPatchApproval":
          entry.conn.respond(request.rpcId, { decision: "decline" });
          break;
        default:
          entry.conn.respondError(request.rpcId, -32601, `method not supported: ${request.method}`);
      }
      return;
    }
    this.applyStatusSignal(entry, { kind: "approval_requested" });
    const toolName =
      request.method === "item/fileChange/requestApproval" ? "fileChange" : "commandExecution";
    const summary = summarizeCodexApproval(request.method, request.params);
    // broadcastOnly 不进 live 缓冲：重连后由 ApprovalCenter 快照兜底（claude 同语义）。
    entry.relay.broadcastOnly(
      JSON.stringify({
        type: "codex_approval_request",
        controlRequestId: `codex:${request.rpcId}`,
        toolName,
        inputSummary: summary,
        item: request.params,
      } satisfies Extract<CodexStreamServerMessage, { type: "codex_approval_request" }>),
    );
    this.onApprovalRequest?.({
      runtimeKey,
      sessionId: entry.sessionId,
      projectName: entry.projectName,
      rpcId: request.rpcId,
      method: request.method,
      params: request.params,
      toolName,
      inputSummary: summary,
    });
  }

  private handleExit(runtimeKey: string, entry: CodexSessionEntry): void {
    if (!this.sessions.has(runtimeKey)) return; // close() 主动关闭已清 entry
    this.sessions.delete(runtimeKey);
    this.pendingQueues.delete(runtimeKey);
    this.autoRetry.destroySession(runtimeKey);
    entry.relay.reportError(new Error("codex app-server process exited"));
    entry.relay.destroy();
    this.applyStatusSignal(entry, { kind: "turn_result", isError: true });
    this.sessionStatus.delete(entry.sessionId);
    this.onApprovalSettled(runtimeKey);
  }

  /** flushQueue：单飞在飞不抢跑；组装 turn/start（merge pendingConfig）后清覆盖。 */
  private flushQueue(runtimeKey: string): void {
    const entry = this.sessions.get(runtimeKey);
    if (!entry) return;
    // 同步在飞闸（code review P1-4）：turn/start 的 RPC 往返窗口（startingTurn）内
    // 再来的 write 不得二次下发——server 不拒绝并发 turn（探针 S6），只查 inFlightTurnId
    // 会在窗口内漏闸。母本 acp 的 sending.add 同款。
    if (entry.inFlightTurnId || entry.startingTurn) return;
    const queue = this.pendingQueues.get(runtimeKey);
    const next = queue?.shift();
    if (!queue || !next) return;

    const overrides = entry.pendingConfig;
    entry.pendingConfig = {};
    const input = buildCodexUserInput(next.text, next.images);
    const params: Record<string, unknown> = {
      threadId: entry.threadId,
      input,
    };
    if (overrides.model) params.model = overrides.model;
    if (overrides.effort) params.effort = overrides.effort;
    // 权限配置下发翻译（security review P1-2）：pendingConfig 存的是权限模式词
    //（readonly/default/auto/full，与 config 帧/落盘 setPermissionMode 同域），而
    // turn/start 的 approvalPolicy 要 AskForApproval 枚举、sandboxPolicy 要策略对象
    // ——原样下发 = 服务端拒枚举/沙箱 no-op（「切 readonly 实际仍 workspace-write」的
    // 安全开关失效）。经 preset 翻译成一对下发；非法词静默丢弃（白名单封闭）。
    if (overrides.approvalPolicy || overrides.sandbox) {
      const mode = (overrides.approvalPolicy ?? overrides.sandbox) as CodexPermissionMode;
      const preset = CODEX_PERMISSION_PRESETS[mode];
      if (preset) {
        params.approvalPolicy = preset.approvalPolicy;
        const policy = sandboxModeToPolicy(preset.sandbox, entry.projectPath);
        if (policy) params.sandboxPolicy = policy;
      }
    }

    const generation = ++entry.turnGeneration;
    entry.startingTurn = true;
    entry.conn
      .request("turn/start", params)
      .then((result) => {
        if (generation !== entry.turnGeneration) return; // 陈旧回调（completed 先到）
        entry.startingTurn = false;
        const turnId = (result as { turn?: { id?: string } })?.turn?.id;
        entry.inFlightTurnId = typeof turnId === "string" ? turnId : null;
      })
      .catch((error: Error) => {
        if (generation !== entry.turnGeneration) return;
        entry.startingTurn = false;
        entry.relay.reportError(error);
        this.applyStatusSignal(entry, { kind: "turn_result", isError: true });
        // turn/start 被拒（inFlight 未建立，无 turn/completed 可等）：继续 flush 防队列卡死。
        this.flushQueue(runtimeKey);
      });
  }

  private onApprovalSettled(runtimeKey: string): void {
    // 审批收口钩子：进程退出/关闭时清 registry（index.ts 接 approvalCenter.clearRuntime）。
    this.approvalRuntimeSettled?.(runtimeKey);
  }

  approvalRuntimeSettled: ((runtimeKey: string) => void) | null = null;

  private applyStatusSignal(
    entry: CodexSessionEntry,
    signal:
      | { kind: "user_input" }
      | { kind: "turn_activity" }
      | { kind: "approval_requested" }
      | { kind: "approval_settled" }
      | { kind: "turn_result"; isError: boolean }
      | { kind: "close" },
  ): void {
    // codex 会话状态内存态：current = 最近一次回调值（进程内权威；落盘走 index.ts 接
    // sessionRegistry.setAgentSessionStatus）。迁移规则镜像 agent-session-status.ts 的
    // 表（此处是信号源：user_input/turn_activity/approval_settled → working，
    // approval_requested → blocked，turn_result → done|error）。
    const current = this.sessionStatus.get(entry.sessionId) ?? "idle";
    let next: typeof current | undefined;
    switch (signal.kind) {
      case "user_input":
      case "turn_activity":
        next =
          current === "idle" || current === "done" || current === "error" ? "working" : undefined;
        break;
      case "approval_requested":
        next = current === "working" ? "blocked" : undefined;
        break;
      case "approval_settled":
        next = current === "blocked" ? "working" : undefined;
        break;
      case "turn_result":
        next = current === "closed" ? undefined : signal.isError ? "error" : "done";
        break;
      case "close":
        next = current === "closed" ? undefined : "closed";
        break;
    }
    if (!next) return;
    this.sessionStatus.set(entry.sessionId, next);
    this.onStatusChange?.(
      entry.sessionId,
      next as "working" | "blocked" | "done" | "error" | "closed",
    );
  }

  private readonly sessionStatus = new Map<string, string>();

  private async refreshModels(entry: CodexSessionEntry): Promise<void> {
    try {
      const res = (await entry.conn.request("model/list", {})) as {
        data?: {
          id?: string;
          displayName?: string;
          supportedReasoningEfforts?: { reasoningEffort?: string }[];
          defaultReasoningEffort?: string;
          hidden?: boolean;
        }[];
      } | null;
      entry.models = (res?.data ?? [])
        .filter((m) => typeof m.id === "string" && !m.hidden)
        .map((m) => ({
          id: m.id as string,
          displayName: m.displayName ?? (m.id as string),
          supportedReasoningEfforts: (m.supportedReasoningEfforts ?? [])
            .map((e) => e.reasoningEffort)
            .filter((e): e is string => typeof e === "string"),
          defaultReasoningEffort: m.defaultReasoningEffort ?? "medium",
        }));
    } catch {
      entry.models = []; // model/list 失败（未登录等）→ 无 config 帧 = 能力信号
    }
  }

  private injectConfigFrame(runtimeKey: string, entry: CodexSessionEntry): void {
    const frame = this.buildConfigFrame(entry);
    if (frame) entry.relay.appendAndBroadcast(frame);
  }

  /** config 快照帧序列化；空目录 → null（无帧 → 前端无选择器，acp 同约定）。 */
  private buildConfigFrame(entry: CodexSessionEntry): string | null {
    if (entry.models.length === 0) return null;
    return JSON.stringify({
      type: "codex_config",
      models: entry.models,
      current: {
        model: entry.config.model ?? "",
        effort: entry.config.effort ?? null,
        approvalPolicy: entry.config.approvalPolicy,
        sandbox: entry.config.sandbox,
      },
      ...(entry.account ? { account: entry.account } : {}),
    } satisfies CodexConfigSnapshot);
  }

  private configSnapshot(entry: CodexSessionEntry): CodexConfigSnapshot {
    return {
      type: "codex_config",
      models: entry.models,
      current: {
        model: entry.config.model ?? "",
        effort: entry.config.effort ?? null,
        approvalPolicy: entry.config.approvalPolicy,
        sandbox: entry.config.sandbox,
      },
    };
  }

  private async pumpStderr(runtimeKey: string, stderr: ReadableStream<Uint8Array>): Promise<void> {
    try {
      const logPath = join(this.runDir, CODEX_STDERR_DIR, `${runtimeKey}.log`);
      await Bun.write(logPath, "");
      const sink = Bun.file(logPath).writer();
      for await (const chunk of stderr) {
        sink.write(chunk);
      }
      await sink.end();
    } catch {
      // 日志失败不影响主链路。
    }
  }

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

/** 用户消息 → UserInput 绑定形状（turn/start 与 turn/steer 共用）：图片 image 项在前
 *  （data URL），文本项殿后——claude user content 图前文后同序。text_elements 绑定必填
 *  （宽进引擎不校验，守形状）。 */
function buildCodexUserInput(
  text: string,
  images?: { data: string; mimeType: string }[],
): Array<Record<string, unknown>> {
  const input: Array<Record<string, unknown>> = (images ?? []).map((img) => ({
    type: "image",
    url: `data:${img.mimeType};base64,${img.data}`,
  }));
  input.push({ type: "text", text, text_elements: [] });
  return input;
}

// ── 历史合成与摘要（纯函数，导出供测试）─────────────────────────────────────

/** account/rateLimits/read + account/usage/read 响应 → 额度快照（批 E 防御式，宽进）。
 *  字段全缺（非 ChatGPT 登录的 error 响应被 catch 成 null）→ undefined = 前端不渲染额度段。 */
export function codexAccountFromResponses(
  limits: unknown,
  usage: unknown,
): CodexAccountUsage | undefined {
  const rateLimits = (
    limits as {
      rateLimits?: { planType?: unknown; primary?: unknown; secondary?: unknown } | null;
    } | null
  )?.rateLimits;
  const lifetimeTokens = (
    usage as {
      summary?: { lifetimeTokens?: unknown } | null;
    } | null
  )?.summary?.lifetimeTokens;
  const account: CodexAccountUsage = {};
  if (typeof rateLimits?.planType === "string") account.planType = rateLimits.planType;
  const primary = codexRateLimitWindow(rateLimits?.primary);
  if (primary) account.primary = primary;
  const secondary = codexRateLimitWindow(rateLimits?.secondary);
  if (secondary) account.secondary = secondary;
  if (typeof lifetimeTokens === "number") account.lifetimeTokens = lifetimeTokens;
  return Object.keys(account).length > 0 ? account : undefined;
}

/** app-server RateLimitWindow → CodexRateLimitWindow（字段窄提取；形状漂移 → undefined）。 */
function codexRateLimitWindow(value: unknown): CodexRateLimitWindow | undefined {
  const w = value as
    | { usedPercent?: unknown; windowDurationMins?: unknown; resetsAt?: unknown }
    | null
    | undefined;
  if (typeof w?.usedPercent !== "number" || typeof w?.windowDurationMins !== "number") {
    return undefined;
  }
  return {
    usedPercent: w.usedPercent,
    windowDurationMins: w.windowDurationMins,
    ...(typeof w.resetsAt === "string" ? { resetsAt: w.resetsAt } : {}),
  };
}

/** thread/resume 响应的 turns 形状（窄提取，宽进防御：缺字段跳过该 turn）。 */
type CodexHistoryTurn = {
  id?: string;
  items?: Array<Record<string, unknown>>;
};

/**
 * turns[].items → 与实时流同形的 codex_event 行（item/completed 即定格态——前端一条
 * 投影管道同时消费实时 item/started+deltas+completed 与回放 completed）。
 */
export function synthesizeHistoryLines(
  turns: CodexHistoryTurn[] | undefined,
  threadId: string,
): string[] {
  if (!turns) return [];
  const lines: string[] = [];
  for (const turn of turns) {
    const turnId = typeof turn.id === "string" ? turn.id : "";
    for (const item of turn.items ?? []) {
      lines.push(
        JSON.stringify({
          type: "codex_event",
          event: {
            method: "item/completed",
            params: { item, threadId, ...(turnId ? { turnId } : {}) },
          },
        }),
      );
    }
  }
  return lines;
}

/** requestApproval params → 人读一行摘要（summarizeControlInput 同风格）。 */
export function summarizeCodexApproval(method: string, params: Record<string, unknown>): string {
  const kind = method === "item/fileChange/requestApproval" ? "fileChange" : "commandExecution";
  const command = typeof params.command === "string" ? params.command : undefined;
  if (command) return `${kind}: ${command.replace(/\s+/g, " ").trim()}`;
  const changes = Array.isArray(params.changes) ? params.changes : [];
  const paths = changes
    .map((c) =>
      typeof (c as { path?: unknown }).path === "string" ? (c as { path: string }).path : null,
    )
    .filter((p): p is string => p !== null);
  if (paths.length > 0) return `${kind}: ${paths.join(", ")}`;
  const reason = typeof params.reason === "string" ? params.reason : undefined;
  return reason ? `${kind}: ${reason}` : kind;
}
