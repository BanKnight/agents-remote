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
import { readPiHistoryLines } from "./pi-history";
import { buildFirecrawlTools } from "./pi-firecrawl-tools";
import { PiSessionRelay } from "./pi-relay";
import type { SettingsStore } from "./settings-store";

// 决策 8：只读 tools allowlist（禁写工具/扩展工具）。chat 会话只做问答与读取，不 mutate cwd。
const PI_TOOLS_ALLOWLIST = ["read", "grep", "find", "ls"];

/** 图片上行输入（对齐 pi ImageContent：base64 data 不含 data: 前缀）。 */
export type PiImageInput = { data: string; mimeType: string };

/** pendingQueue 条目：text + 可选图片（保持排队语义，flush 时透传 prompt images）。 */
type PiQueuedMessage = { text: string; images?: PiImageInput[] };

// LLM 标题生成：输入截断 + 输出清洗上限（中文导向提示词，16 字要求 + 30 字硬上限兜底）。
const TITLE_INPUT_MAX_CHARS = 2_000;
const TITLE_MAX_CHARS = 30;
const TITLE_SYSTEM_PROMPT =
  "用不超过 16 个字概括这段对话的主题，只输出标题本身：不要引号、不要标点结尾、不要任何解释。";

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

/** pi user message 的 text 提取（string content 或 text block join——与 web userMessageText 同义）。 */
function extractPiUserText(message: { content?: unknown }): string {
  const content = message.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((c): c is { type: "text"; text: string } => (c as { type?: string })?.type === "text")
    .map((c) => c.text)
    .join("\n");
}

/** LLM 标题输出清洗：trim、去首尾引号、单行化、截断。空结果返回 null（放弃，保持默认名）。 */
export function sanitizeChatTitle(raw: string): string | null {
  const cleaned = raw
    .trim()
    .replace(/^["'「『]+/, "")
    .replace(/["'」』]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length === 0) return null;
  return cleaned.slice(0, TITLE_MAX_CHARS);
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
  /** 标题生成复用的模型句柄（与 session 同凭证链——apiKey 内存覆盖已 set）。 */
  modelRuntime: ModelRuntime;
  model: ReturnType<ModelRuntime["getModel"]>;
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
  private readonly pendingQueues = new Map<string, PiQueuedMessage[]>();
  /** 显式 in-flight 标记：prompt 发起即入，agent_settled / 错误兜底才移除。 */
  private readonly sending = new Set<string>();
  /** 已 backfill piSessionId 的 chatId（值稳定，只写一次，防事件风暴刷磁盘）。 */
  private readonly backfilled = new Set<string>();
  /** 已生成过标题的 chatId（一次性语义：失败也标记，防重复消耗 LLM 调用）。 */
  private readonly titledChats = new Set<string>();
  /** 首条 user 消息文本（标题生成输入），per chatId。 */
  private readonly firstUserText = new Map<string, string>();
  private onPiSessionId?: (chatId: string, piSessionId: string) => void;
  private onActivity?: (chatId: string) => void;
  private onTitle?: (chatId: string, title: string) => void;

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

  /** LLM 标题生成回调（接 registry.setChatTitle，默认名守卫在接线处）。 */
  setOnTitle(callback: (chatId: string, title: string) => void): void {
    this.onTitle = callback;
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
    // v5：启用语义 = activePresetId 命中一个 provider/model 齐备的 preset（apiKey 可选，
    // 空 = 走 SDK 凭证链 auth.json/env）。presets 空 / activePresetId 空 / 未命中 / 字段缺失
    // → 未启用。
    const preset = pi?.activePresetId
      ? pi.presets.find((p) => p.id === pi.activePresetId)
      : undefined;
    if (!preset?.provider || !preset.model) {
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
    // 决策 4：apiKey 内存覆盖（不落 auth.json），且永不进日志。preset 未填 apiKey → 回落
    // SDK 凭证链（隔离 auth.json → env）：内置 provider 无已存凭证则快速失败（而非首个请求
    // 才炸）；自定义兼容端点（baseUrl 非空）放行——keyless 本地端点合法，需 key 的网关由
    // 用户自填。
    if (preset.apiKey) {
      await modelRuntime.setRuntimeApiKey(preset.provider, preset.apiKey);
    } else if (!preset.baseUrl && !modelRuntime.hasConfiguredAuth(preset.provider)) {
      throw new PiNotConfiguredError("pi provider 凭证未配置（preset 未填 apiKey 且无已存凭证）");
    }
    const model = modelRuntime.getModel(preset.provider, preset.model);
    if (!model) {
      throw new PiModelNotFoundError(`pi 模型未找到：${preset.provider}/${preset.model}`);
    }

    // 决策 3：resume 目录 = pi-jsonl/<chatId>/（与元数据同根）。continueRecent 读最近文件重建上下文。
    const sessionManager = SessionManager.continueRecent(this.defaultCwd, sessionDir);
    // 历史定格（Phase 4）：activate 时刻读 JSONL 合成回放行。空目录（新会话首条消息前
    // newSession 未落盘）→ 空历史 + resume false，与 claude "claudeSessionId none" 同语义。
    const historyLines = await readPiHistoryLines(sessionDir);
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

    // firecrawl 工具：settings.runtimes.pi.firecrawlApiKey（配置体系同 preset apiKey，非 env）→
    // 恒注册（customTools 与内置工具并存；无 key = 匿名限额模式，不阻塞启动）。SDK 的
    // _refreshToolRegistry 会把 customTools 与内置工具一起过 tools 白名单过滤——白名单必须
    // 含 firecrawl 工具名，否则被滤掉（实测模型看不到 firecrawl_search）。
    const firecrawlTools = buildFirecrawlTools(pi?.firecrawlApiKey);
    const { session } = await this.createSession({
      cwd: this.defaultCwd,
      agentDir,
      modelRuntime,
      model,
      tools: [...PI_TOOLS_ALLOWLIST, ...firecrawlTools.map((tool) => tool.name)],
      customTools: firecrawlTools,
      sessionManager,
      resourceLoader,
    });
    const relay = new PiSessionRelay();
    relay.loadHistory(historyLines);
    relay.setResume(historyLines.length > 0);
    const unsubscribe = session.subscribe((event) => this.handlePiEvent(chatId, relay, event));
    this.sessions.set(chatId, { session, relay, unsubscribe, modelRuntime, model });
    this.backfillPiSessionId(chatId, session);
  }

  /**
   * 决策 5 发送：接受消息后立即注入 user echo（决策 6）并入队，然后尝试立即 prompt。
   * 不 await prompt——入队即返回。会话未启动 throw（pi-stream 出 error 帧）。
   */
  send(chatId: string, text: string, uuid?: string, images?: PiImageInput[]): void {
    const entry = this.sessions.get(chatId);
    if (!entry) {
      throw new Error("chat 会话未启动");
    }
    if (uuid) {
      // pi 事件流不回显用户输入：注入合成帧，reconnect 的 live buffer 能看到。
      entry.relay.appendAndBroadcast(JSON.stringify({ type: "pi_user_echo", text, uuid }));
    }
    const queue = this.pendingQueues.get(chatId) ?? [];
    queue.push({ text, images });
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
    this.titledChats.delete(chatId);
    this.firstUserText.delete(chatId);
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

  /**
   * chat 会话运行态查询（chat-idle-recycler 判据）：
   * "none" 无 entry；"active" = isStreaming || 队列/sending 非空 || relay 有订阅者
   * （turn 在跑 / 有人连着看，不回收——多端 fan-out 靠订阅者保活）；"idle" = entry 在
   * 但停转且无人看（回收窗口）。
   */
  chatRuntimeState(chatId: string): "none" | "active" | "idle" {
    const entry = this.sessions.get(chatId);
    if (!entry) return "none";
    if (
      entry.session.isStreaming ||
      entry.relay.hasSubscribers ||
      (this.pendingQueues.get(chatId)?.length ?? 0) > 0 ||
      this.sending.has(chatId)
    ) {
      return "active";
    }
    return "idle";
  }

  private handlePiEvent(chatId: string, relay: PiSessionRelay, event: AgentSessionEvent): void {
    relay.appendAndBroadcast(JSON.stringify(toPiEventFrame(event)));
    if (event.type === "message_start") {
      const message = (event as { message?: { role?: string; content?: unknown } }).message;
      if (message?.role === "user" && !this.firstUserText.has(chatId)) {
        this.firstUserText.set(chatId, extractPiUserText(message).slice(0, TITLE_INPUT_MAX_CHARS));
      }
    }
    if (isTerminalPiEvent(event)) {
      // agent_settled 时 isStreaming 已为 false（pi finally 先置 false 再 emit）——可安全 flush。
      relay.broadcastOnly(JSON.stringify({ type: "ended" }));
      this.sending.delete(chatId);
      this.flushQueue(chatId);
      // 首个 turn 结束 → 一次性生成 LLM 标题（异步不阻塞 ended 帧；失败也标记一次性）。
      if (this.firstUserText.has(chatId) && !this.titledChats.has(chatId)) {
        this.titledChats.add(chatId);
        void this.generateTitle(chatId);
      }
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
    const item = queue.shift();
    if (!item) return;
    this.sending.add(chatId);
    const options = item.images?.length
      ? {
          images: item.images.map((i) => ({
            type: "image" as const,
            data: i.data,
            mimeType: i.mimeType,
          })),
        }
      : undefined;
    void entry.session
      .prompt(item.text, options)
      .catch((err) => this.handlePromptError(chatId, entry, err));
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

  /**
   * 一次性 LLM 标题生成（agent_settled 后 fire）：completeSimple 独立 completion——不进
   * AgentSession、不写会话 JSONL、无 tools。成功 → relay 广播 chat_title 帧（live buffer，
   * reconnect 可见）+ onTitle 回调（registry 落盘，默认名守卫在接线处）。失败静默 warn。
   */
  private async generateTitle(chatId: string): Promise<void> {
    const text = this.firstUserText.get(chatId);
    const entry = this.sessions.get(chatId);
    if (!text || !entry?.model) return;
    try {
      const result = await entry.modelRuntime.completeSimple(entry.model, {
        systemPrompt: TITLE_SYSTEM_PROMPT,
        messages: [{ role: "user", content: text, timestamp: Date.now() }],
      });
      const raw =
        typeof result.content === "string"
          ? result.content
          : Array.isArray(result.content)
            ? result.content
                .filter((c) => (c as { type?: string })?.type === "text")
                .map((c) => (c as { text?: string }).text ?? "")
                .join("")
            : "";
      const title = sanitizeChatTitle(raw);
      if (!title) return;
      entry.relay.appendAndBroadcast(JSON.stringify({ type: "chat_title", title }));
      this.onTitle?.(chatId, title);
    } catch (error) {
      // 失败静默（标题保持默认名）；titledChats 已标记，不重复消耗 LLM 调用。
      console.warn(`[pi-runtime] chat title generation failed: ${chatId}`, error);
    }
  }

  private backfillPiSessionId(chatId: string, session: AgentSession): void {
    if (this.backfilled.has(chatId) || !this.onPiSessionId) return;
    const piSessionId = session.sessionId;
    if (!piSessionId) return;
    this.backfilled.add(chatId);
    this.onPiSessionId(chatId, piSessionId);
  }
}
