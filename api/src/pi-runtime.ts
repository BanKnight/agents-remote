import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  createAgentSession,
} from "@earendil-works/pi-coding-agent";
import type {
  AgentSession,
  AgentSessionEvent,
  CreateAgentSessionOptions,
  CreateAgentSessionResult,
} from "@earendil-works/pi-coding-agent";
import type { PiPreset, PiProviderApi } from "@agents-remote/shared";
import type { RuntimeStream } from "./session-registry";
import { isTerminalPiEvent, toPiEventFrame } from "./pi-events";
import { PiSessionRelay } from "./pi-relay";
import type { SettingsStore } from "./settings-store";

// 决策 8：只读 tools allowlist（禁写工具/扩展工具）。chat 会话只做问答与读取，不 mutate cwd。
const PI_TOOLS_ALLOWLIST = ["read", "grep", "find", "ls"];

// 自定义兼容端点缺省线协议（preset.api 未配时）。OpenAI 兼容端点最通用。
const DEFAULT_PI_API: PiProviderApi = "openai-completions";

/**
 * registerProvider 的 model 定义（ProviderModelConfig）必填项运行时补默认：不做模型发现/
 * 计费（cost 全 0），reasoning 关闭、纯文本输入，窗口/上限给保守值。preset 只存用户关心
 * 的字段（id/model），其余由这里补齐。compat 不传（SDK 从 baseUrl 自动探测）。
 * 注意：provider id 与 pi 内置重名 + baseUrl 时，extension 层会在该会话的 ModelRuntime 内
 * 覆盖内置 provider 的目录（每会话独立 ModelRuntime——决策 4——无跨会话污染）。
 */
function buildPiProviderModel(preset: PiPreset) {
  return {
    id: preset.model,
    name: preset.model,
    reasoning: false,
    input: ["text"] as ("text" | "image")[],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 16_384,
  };
}

/** pi runtime 未配置（设置 → runtimes.pi 无激活 preset 或激活 preset 不完整）。
 *  pi-stream 映射 SESSION_NOT_CONFIGURED。 */
export class PiNotConfiguredError extends Error {
  constructor(message = "pi runtime 未配置") {
    super(message);
    this.name = "PiNotConfiguredError";
  }
}

/** settings.runtimes.pi 指定的 provider/model 在 ModelRuntime 目录中解析不到。 */
export class PiModelNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PiModelNotFoundError";
  }
}

type CreateModelRuntimeFn = (options: {
  authPath: string;
  modelsPath: string;
  refreshOnCreate: boolean;
  allowModelNetwork: boolean;
}) => Promise<ModelRuntime>;

type CreateSessionFn = (options: CreateAgentSessionOptions) => Promise<CreateAgentSessionResult>;

type PiSessionEntry = {
  session: AgentSession;
  relay: PiSessionRelay;
  unsubscribe: () => void;
};

export type PiRuntimeOptions = {
  settingsStore: SettingsStore;
  /** `~/.agents-remote`——agentDir（pi-agent）与 chatSessionsDir 的公共根。 */
  baseDir: string;
  /** `~/.agents-remote/chat-sessions`——元数据与 pi-jsonl 同根（removeSessionFiles 在其下）。 */
  chatSessionsDir: string;
  /** 决策 7：chat 会话默认工作目录 = PROJECTS_ROOT。 */
  defaultCwd: string;
  /** 可注入（测试用）。生产默认 = ModelRuntime.create。 */
  createModelRuntime?: CreateModelRuntimeFn;
  /** 可注入（测试用）。生产默认 = createAgentSession。 */
  createSession?: CreateSessionFn;
};

const defaultCreateModelRuntime: CreateModelRuntimeFn = (options) => ModelRuntime.create(options);

const defaultCreateSession: CreateSessionFn = (options) => createAgentSession(options);

/**
 * PiRuntime —— chat 模式的进程内 pi AgentSession 运行时（设计 docs/design/workbench-views.md §3.1）。
 *
 * 与 claude 的 ClaudeRuntime 不同：pi 不是 spawn CLI，而是 SDK 库嵌入（决策 4 每会话新建
 * ModelRuntime，读当前 settings.runtimes.pi；已活会话不受配置变更影响）。会话是活体——
 * relay 只在进程存活期内缓冲，跨重启历史回放留 Phase 4（pi JSONL）。
 *
 * 发送排队（决策 5）：send 不 await prompt。idle 时立即 prompt；prompt 进行中再来的消息
 * 入 pendingQueue；agent_settled（turn 真正 idle）触发 flush 下一批；interrupt 清空队列 +
 * abort。显式 `sending` 标记而非依赖 `session.isStreaming`（prompt() 调用后 isStreaming 可能
 * 有同步翻转竞态），防同 tick 内双 prompt。
 */
export class PiRuntime {
  private readonly settingsStore: SettingsStore;
  private readonly baseDir: string;
  private readonly chatSessionsDir: string;
  private readonly defaultCwd: string;
  private readonly createModelRuntime: CreateModelRuntimeFn;
  private readonly createSession: CreateSessionFn;
  private readonly sessions = new Map<string, PiSessionEntry>();
  private readonly pendingQueues = new Map<string, string[]>();
  /** 显式 in-flight 标记：prompt 发起即入，agent_settled / 错误兜底才移除。 */
  private readonly sending = new Set<string>();
  /** 已 backfill piSessionId 的 chatId（值稳定，只写一次，防事件风暴刷磁盘）。 */
  private readonly backfilled = new Set<string>();
  private onPiSessionId?: (chatId: string, piSessionId: string) => void;
  private onActivity?: (chatId: string) => void;

  constructor(options: PiRuntimeOptions) {
    this.settingsStore = options.settingsStore;
    this.baseDir = options.baseDir;
    this.chatSessionsDir = options.chatSessionsDir;
    this.defaultCwd = options.defaultCwd;
    this.createModelRuntime = options.createModelRuntime ?? defaultCreateModelRuntime;
    this.createSession = options.createSession ?? defaultCreateSession;
  }

  /** 镜像 claude setOnClaudeSessionId：piSessionId backfill 回调（接 registry.setPiSessionId）。 */
  setOnPiSessionId(callback: (chatId: string, piSessionId: string) => void): void {
    this.onPiSessionId = callback;
  }

  /** 镜像 claude setOnActivity：活跃时间戳回调（接 registry.recordActivityChat）。 */
  setOnActivity(callback: (chatId: string) => void): void {
    this.onActivity = callback;
  }

  /**
   * 决策 1 懒启动：首次 WS open 才拉起 AgentSession（创建 chat 会话仍是纯元数据）。
   * 未配置 → throw {@link PiNotConfiguredError}（caller 出 SESSION_NOT_CONFIGURED 帧）。
   * 已活会话幂等返回（不重复 create）。
   */
  async ensureRunning(chatId: string): Promise<void> {
    if (this.sessions.has(chatId)) return;

    const settings = await this.settingsStore.read();
    const pi = settings.runtimes?.pi;
    // v5：启用语义 = activePresetId 命中一个 provider/apiKey/model 齐备的 preset。presets
    // 空 / activePresetId 空 / 未命中 / 字段缺失 → 未启用。
    const preset = pi?.activePresetId
      ? pi.presets.find((p) => p.id === pi.activePresetId)
      : undefined;
    if (!preset?.provider || !preset.apiKey || !preset.model) {
      throw new PiNotConfiguredError();
    }

    // 决策 9：agentDir 隔离（不碰用户真实 ~/.pi/agent）。authPath/modelsPath 指向隔离目录，
    // refreshOnCreate:false / allowModelNetwork:false 不联网刷新模型目录。
    const agentDir = join(this.baseDir, "pi-agent");
    const sessionDir = join(this.chatSessionsDir, "pi-jsonl", chatId);
    await mkdir(sessionDir, { recursive: true });

    const modelRuntime = await this.createModelRuntime({
      authPath: join(agentDir, "auth.json"),
      modelsPath: join(agentDir, "models.json"),
      refreshOnCreate: false,
      allowModelNetwork: false,
    });
    // 自定义兼容端点（baseUrl 非空）：程序化注册进 catalog（不写 models.json）。先 register
    // 后 setRuntimeApiKey——先有 provider 条目再做凭证同步（synchronizeCredentialState 才能命中）。
    // 每会话独立 ModelRuntime（决策 4），注册随会话生命周期，无共享状态。
    if (preset.baseUrl) {
      modelRuntime.registerProvider(preset.provider, {
        baseUrl: preset.baseUrl,
        api: preset.api ?? DEFAULT_PI_API,
        models: [buildPiProviderModel(preset)],
      });
    }
    // 决策 4：apiKey 内存覆盖（不落 auth.json），且永不进日志。
    await modelRuntime.setRuntimeApiKey(preset.provider, preset.apiKey);
    const model = modelRuntime.getModel(preset.provider, preset.model);
    if (!model) {
      throw new PiModelNotFoundError(`pi 模型未找到：${preset.provider}/${preset.model}`);
    }

    // 决策 3：resume 目录 = pi-jsonl/<chatId>/（与元数据同根）。continueRecent 读最近文件重建上下文。
    const sessionManager = SessionManager.continueRecent(this.defaultCwd, sessionDir);
    // 决策 8：加载 cwd 下 AGENTS.md/CLAUDE.md（noContextFiles:false），禁用扩展/skills/主题/prompt 模板。
    const resourceLoader = new DefaultResourceLoader({
      cwd: this.defaultCwd,
      agentDir,
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: false,
    });

    const { session } = await this.createSession({
      cwd: this.defaultCwd,
      agentDir,
      modelRuntime,
      model,
      tools: PI_TOOLS_ALLOWLIST,
      sessionManager,
      resourceLoader,
    });
    const relay = new PiSessionRelay();
    const unsubscribe = session.subscribe((event) => this.handlePiEvent(chatId, relay, event));
    this.sessions.set(chatId, { session, relay, unsubscribe });
    this.backfillPiSessionId(chatId, session);
  }

  /**
   * 决策 5 发送：接受消息后立即注入 user echo（决策 6）并入队，然后尝试立即 prompt。
   * 不 await prompt——入队即返回。会话未启动 throw（pi-stream 出 error 帧）。
   */
  send(chatId: string, text: string, uuid?: string): void {
    const entry = this.sessions.get(chatId);
    if (!entry) {
      throw new Error("chat 会话未启动");
    }
    if (uuid) {
      // pi 事件流不回显用户输入：注入合成帧，reconnect 的 live buffer 能看到。
      entry.relay.appendAndBroadcast(JSON.stringify({ type: "pi_user_echo", text, uuid }));
    }
    const queue = this.pendingQueues.get(chatId) ?? [];
    queue.push(text);
    this.pendingQueues.set(chatId, queue);
    this.flushQueue(chatId);
  }

  /** 中断：abort + waitForIdle + 清空未发排队项（用户中止意图应丢弃等待项）。 */
  async interrupt(chatId: string): Promise<void> {
    const entry = this.sessions.get(chatId);
    if (!entry) return;
    this.pendingQueues.set(chatId, []);
    this.sending.delete(chatId);
    try {
      if (entry.session.isStreaming) {
        await entry.session.abort();
        await entry.session.waitForIdle();
      }
    } catch {
      // abort/waitForIdle 失败不阻断（会话可能已被 dispose）。
    }
  }

  /** 订阅 relay 流。open() 先 ensureRunning 后 stream()，entry 必存在；兜底出错误流。 */
  stream(
    chatId: string,
    onData: (line: string) => void,
    onError: (err: Error) => void,
  ): RuntimeStream {
    const entry = this.sessions.get(chatId);
    if (!entry) {
      queueMicrotask(() => onError(new Error("chat 会话未启动")));
      return { close: () => {} };
    }
    return entry.relay.addSubscriber(onData, onError);
  }

  /** 关闭运行时：unsubscribe + dispose + relay.destroy。**不** rm JSONL（归 closeChatSession）。 */
  async close(chatId: string): Promise<void> {
    const entry = this.sessions.get(chatId);
    if (!entry) return;
    this.sessions.delete(chatId);
    this.pendingQueues.delete(chatId);
    this.sending.delete(chatId);
    this.backfilled.delete(chatId);
    try {
      entry.unsubscribe();
    } catch {
      /* ignore */
    }
    try {
      entry.session.dispose();
    } catch {
      /* ignore */
    }
    entry.relay.destroy();
  }

  /** 删除 pi-jsonl/<chatId>/ 整棵子树（closeChatSession 清理 JSONL 用）。 */
  async removeSessionFiles(chatId: string): Promise<void> {
    await rm(join(this.chatSessionsDir, "pi-jsonl", chatId), { recursive: true, force: true });
  }

  private handlePiEvent(chatId: string, relay: PiSessionRelay, event: AgentSessionEvent): void {
    relay.appendAndBroadcast(JSON.stringify(toPiEventFrame(event)));
    if (isTerminalPiEvent(event)) {
      // agent_settled 时 isStreaming 已为 false（pi finally 先置 false 再 emit）——可安全 flush。
      relay.broadcastOnly(JSON.stringify({ type: "ended" }));
      this.sending.delete(chatId);
      this.flushQueue(chatId);
    }
    this.onActivity?.(chatId);
  }

  /** 队列 flush：sending 非空（有 prompt 在飞）或 session 仍 streaming 时不抢跑；逐条 prompt。 */
  private flushQueue(chatId: string): void {
    if (this.sending.has(chatId)) return;
    const entry = this.sessions.get(chatId);
    if (!entry) return;
    // isStreaming 守卫：外部触发的 run（resume 续跑）占位时不抢跑；settle 时恒为 false 不会卡死队列。
    if (entry.session.isStreaming) return;
    const queue = this.pendingQueues.get(chatId);
    if (!queue || queue.length === 0) return;
    const text = queue.shift();
    if (text === undefined) return;
    this.sending.add(chatId);
    void entry.session.prompt(text).catch((err) => this.handlePromptError(chatId, entry, err));
  }

  /**
   * prompt 拒绝处理。pi 的 finally 保证 agent_settled 在 prompt 拒绝前已 emit——队列管理已由
   * settle 回调接管（可能已启动下一 prompt 并重设 sending）。这里只在「run 已结束（isStreaming
   * false）但 sending 仍持有」（settle 未达的异常路径）时兜底清理 + flush，绝不动已接手的下一
   * prompt 标记。报错帧总是经 relay。
   */
  private handlePromptError(chatId: string, entry: PiSessionEntry, error: unknown): void {
    const message = error instanceof Error ? error : new Error(String(error));
    if (!entry.session.isStreaming && this.sending.has(chatId)) {
      this.sending.delete(chatId);
      this.flushQueue(chatId);
    }
    entry.relay.reportError(message);
  }

  private backfillPiSessionId(chatId: string, session: AgentSession): void {
    if (this.backfilled.has(chatId) || !this.onPiSessionId) return;
    const piSessionId = session.sessionId;
    if (!piSessionId) return;
    this.backfilled.add(chatId);
    this.onPiSessionId(chatId, piSessionId);
  }
}
