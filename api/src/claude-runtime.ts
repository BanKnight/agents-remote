import { randomUUID } from "node:crypto";
import { closeSync, existsSync, fstatSync, openSync, readSync } from "node:fs";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  type AgentSessionStatus,
  type ClaudeAutoRetryConfig,
  type ClaudeContextUsage,
  type ClaudeControlRequest,
  type ClaudeQueuedCommand,
  type ClaudePreset,
  type ContextUsageCategory,
  type EffortLevel,
  MESSAGE_UUID_RE,
} from "@agents-remote/shared";
import type { RuntimeResources, RuntimeStream, SessionMetadata } from "./session-registry";
import {
  type AgentStatusSignal,
  nextAgentSessionStatus,
  spawnInitialStatus,
} from "./agent-session-status";
import { ClaudeSessionRelay } from "./session-relay";
import type { TurnCheckpointer } from "./turn-checkpointer";
import type { McpCapabilitiesStore } from "./mcp-capabilities-store";
import {
  SettingsStore,
  activePresetView,
  buildAvailableAliases,
  type ModelMappingView,
} from "./settings-store";
import { getAgentProviderProfile } from "./agent-provider-profiles";
import { buildMcpInjectorForProvider } from "./mcp-injector";
import { sanitizePersistedModel } from "./model-id";
import { claudeJsonlPath } from "./session-routes";
import {
  MAX_ENTRY_CONTENT_BYTES,
  MAX_QUEUE_ENTRIES,
  filterExecutedUuids,
  readSessionQueue,
  removeSessionQueue,
  writeSessionQueue,
} from "./queue-store";
import { ensureGenUiSkill } from "./project-gen-ui";
import {
  AutoRetryWatch,
  buildAutoRetryEchoLine,
  buildAutoRetryUserLine,
  isErrorResultLine,
  isNormalAssistantLine,
} from "./agent-auto-retry";

type BunSubprocess = ReturnType<typeof Bun.spawn>;

// Build the scalar seed init line for replay. Carries CURRENT model/permissionMode
// so the client's scalar fold has a seed (system.init is stdout-only, absent from
// JSONL/tail). Uses a DISTINCT subtype "seed_init" (not "init") so both server-side
// init capture (claude-stream onRealtimeRow + runtime captureSystemInitFromLine,
// which match subtype === "init") and client render (normalizeChatStream skips it)
// both ignore it — it only folds scalars via a dedicated seed_init branch; model /
// permissionMode surface in the session header, no bubble.
// See docs/design-v1/message-replay.md 「特殊时期 history 缩容」.
export function buildSeedInitLine(
  model?: string,
  permissionMode?: string,
  modelAlias?: string,
  contextUsage?: ClaudeContextUsage,
  sessionStatus?: AgentSessionStatus,
): string | undefined {
  if (!model && !permissionMode && !modelAlias && !contextUsage && !sessionStatus) {
    return undefined;
  }
  return JSON.stringify({
    type: "system",
    subtype: "seed_init",
    ...(model ? { model } : {}),
    ...(modelAlias ? { modelAlias } : {}),
    ...(permissionMode ? { permissionMode } : {}),
    ...(contextUsage ? { contextUsage } : {}),
    ...(sessionStatus ? { sessionStatus } : {}),
  });
}

// Extract the model the CLI stores after an in-process model switch. After a
// control_request{set_model} switch the CLI emits a breadcrumb user message:
//   <local-command-stdout>Set model to <display></local-command-stdout>
// where <display> = modelDisplayString(requestedModel) — either a bare concrete
// id (`claude-sonnet-4-6`) when the requested model is already concrete, or
// `<alias> (<resolved>)` (`opusplan (claude-sonnet-4-6)`, `haiku (claude-haiku-4-5-…)`)
// when the CLI resolved an alias. See CLI print.ts set_model handler +
// utils/messages.ts createModelSwitchBreadcrumbs.
//
// We capture the RAW requested model — mirroring the CLI, which stores
// activeUserSpecifiedModel = requestedModel verbatim and resolves aliases at
// query time. Capturing the resolved id instead would persist e.g.
// `claude-sonnet-4-6` for an `opusplan` switch, so an API restart
// (--resume --model <state.model>) would lose the plan-mode-aware Opus/Sonnet
// semantics. control_response carries no model and system.init is spawn-time
// only, so this echo is the ONLY stdout signal of the switch — symmetric to
// capturePermissionModeFromLine. Extracted as a pure function so the parse is
// unit-testable (cf. buildSeedInitLine).
//
// ⚠️ CLI 的 echo 是人类可读显示串（modelDisplayString），不是裸 model 名：
// 实测形状 `Set model to \`opus[1m] (claude-opus-4-8[1m])\``——模型名被包进
// markdown code span（两侧反引号）+ 尾部 (resolved) 注解。旧正则的「token
// before ` (`」假设对它失配（剥掉括号注解后尾部反引号收不了尾，回溯成整串
// code span 进 group 1），脏值经 state.model → --resume --model <脏值> 令网关
// 422 model not found、UI 模型显示两侧多出反引号（2026-10-01，§6.13）。
// 归一回裸 model 名统一走 sanitizePersistedModel（剥 code span / 注解 + 白名单闸），
// spawn --model 传参处共用同一道闸拦存量脏值。
export function extractModelFromStdoutLine(
  parsed: Record<string, unknown> | null,
): string | undefined {
  if (!parsed || parsed.type !== "user") return undefined;
  const message = parsed.message as { content?: unknown } | undefined;
  if (!message) return undefined;
  const contents = Array.isArray(message.content) ? message.content : [message.content];
  for (const block of contents) {
    const text = typeof block === "string" ? block : (block as { text?: string } | null)?.text;
    if (typeof text !== "string") continue;
    const match = text.match(
      /<local-command-stdout>\s*Set model to (.+?)\s*(?:\([^)]*\))?\s*<\/local-command-stdout>/,
    );
    if (match?.[1]) {
      // group 1 = display 串（可能含 code span 反引号 / (resolved) 注解 / 文案尾巴），
      // 归一 + 白名单闸后才是 raw requested model。
      return sanitizePersistedModel(match[1]);
    }
  }
  return undefined;
}

// 「Set model to <display>」echo 的 display 串 → 可持久化/可传给 CLI 的裸 model 名。
// 归一本体在 model-id.ts（叶子模块单源）——session-registry 的 metadata 读写边界
// 同样消费它，故不在此定义；此处 import + re-export 保持既有导入点兼容。
export { sanitizePersistedModel };

// Detect a successful /reload-skills from its CLI echo.
//
// /reload-skills is a local slash command (same class as /cost). On the live
// stream-json stdout the CLI does NOT echo it as a user message — it persists
// the output as a system{subtype:"local_command"} record (JSONL), then yields a
// SYNTHETIC ASSISTANT message for the stream: QueryEngine.ts routes
// system/local_command through localCommandOutputToSDKAssistantMessage
// (mappers.ts), which strips the <local-command-stdout> tag and wraps the clean
// text in an assistant message with model "<synthetic>".
//
// So the live carrier is an assistant message whose text content is the STRIPPED
// output ("Reloaded skills: N skills available ...") — NOT a user message with a
// <local-command-stdout> tag. This is the key difference from model-switch,
// whose "Set model to" signal rides a user message (the control_request path).
// Scan every text location (message.content of any type + top-level content) and
// match the stripped-text pattern so the fold fires regardless of carrier; the
// "Reloaded skills: N skills" shape is specific enough that the carrier-agnostic
// scan does not produce false positives.
//
// The catalog is filesystem-scanned (not a process scalar), so this returns only
// a boolean signal — captureSkillReloadFromLine fires onSkillReload so index.ts
// can broadcast. Pure function so the parse is unit-testable without a
// ClaudeRuntime instance.
export function extractSkillReloadFromStdoutLine(parsed: Record<string, unknown> | null): boolean {
  if (!parsed) return false;
  const texts: string[] = [];
  const message = parsed.message as { content?: unknown } | undefined;
  if (message) {
    const contents = Array.isArray(message.content) ? message.content : [message.content];
    for (const block of contents) {
      const text = typeof block === "string" ? block : (block as { text?: string } | null)?.text;
      if (typeof text === "string") texts.push(text);
    }
  }
  if (typeof parsed.content === "string") texts.push(parsed.content);
  return texts.some((t) => /Reloaded skills:\s+\d+\s+skills/i.test(t));
}

// Fold the context-window scale from a live assistant message's usage block.
// Each assistant message carries the FINAL usage of its API call, where
// input + cache_creation + cache_read is exactly the context the next call
// will see — i.e. the conversation's current context size (JSONL 实证：
// "usage":{"input_tokens":30079,"cache_creation_input_tokens":0,
// "cache_read_input_tokens":0,...}). output_tokens is this-turn output, not
// context, so it is excluded. Extracted as a pure function so the parse is
// unit-testable (cf. extractModelFromStdoutLine); the live carrier is the
// assistant stdout row (real new rows only — JSONL replay never reaches
// processStdoutLine).
// 网关占位 usage 的判定阈值：部分网关（chatcmpl-* 消息 ID）对每个 API 调用的流式
// 中间消息（stop_reason 缺省的 thinking/tool_use/text 中间块）也带 usage，但是占位值
// {input_tokens:1, output_tokens:1, cache_*:0}——真实 usage 只在收尾行。「最后一条
// 胜出」的 capture 语义会被占位行拉成 0%（JSONL 实证：total=94042 真实行与 total=1
// 占位行交错）。真实上下文至少是整条 system prompt（数千 token 起），阈值与占位值（1）
// 隔开足够数量级。
export const MIN_VALID_CONTEXT_TOKENS = 1000;

export function extractContextUsageFromStdoutLine(
  parsed: Record<string, unknown> | null,
): Omit<ClaudeContextUsage, "contextWindow"> | undefined {
  if (!parsed || parsed.type !== "assistant") return undefined;
  const message = parsed.message as { usage?: Record<string, unknown> } | undefined;
  const usage = message?.usage;
  if (!usage) return undefined;
  const input = typeof usage.input_tokens === "number" ? usage.input_tokens : 0;
  const cacheCreation =
    typeof usage.cache_creation_input_tokens === "number" ? usage.cache_creation_input_tokens : 0;
  const cacheRead =
    typeof usage.cache_read_input_tokens === "number" ? usage.cache_read_input_tokens : 0;
  const output = typeof usage.output_tokens === "number" ? usage.output_tokens : 0;
  const contextTokens = input + cacheCreation + cacheRead;
  // 占用低于阈值（三项全 0 的纯输出占位行、网关流式中间行）不构成有效标量，丢弃
  // 以维持「无数据不渲染」语义与真实值不被覆盖。
  return contextTokens >= MIN_VALID_CONTEXT_TOKENS
    ? {
        contextTokens,
        inputTokens: input,
        cacheCreationTokens: cacheCreation,
        cacheReadTokens: cacheRead,
        outputTokens: output,
      }
    : undefined;
}

// 窗口上限档位（token）：resolved model ID 带 [1m] 后缀 ⇒ 1M，否则 200k。
export const CONTEXT_WINDOW_DEFAULT = 200_000;
export const CONTEXT_WINDOW_1M = 1_000_000;

// JSONL 回填扫描的尾部窗口：usage 行（含长 text content）可达数十 KB，1MB 窗口
// 保证一般情况下尾部必含多条完整 assistant 行；再早的历史轮次对本标量无意义。
const JSONL_USAGE_TAIL_BYTES = 1024 * 1024;

// Resume 恢复（seed_init.contextUsage）：contextUsage 是 live-only 折算标量，API 重启
// 或 resume 重拉 CLI 后新 proc 没有它——会话明明有消息却不见指示，不合理。JSONL 是
// 唯一权威源：从尾部往前找最后一条带有效 usage 的 assistant 行折算（与 live 提取共用
// 同一函数，占位过滤同款生效——JSONL 里同样混有网关占位行）。读到即写回 proc state，
// seed 随带恢复；下轮 live 由新帧接管。
export function readLastContextUsageFromJsonl(
  projectPath: string,
  claudeSessionId: string,
): Omit<ClaudeContextUsage, "contextWindow"> | undefined {
  return readLastContextUsageFromJsonlFile(claudeJsonlPath(projectPath, claudeSessionId));
}

// 按路径的核心实现（claudeJsonlPath 绑定 homedir 不可注入，测试直接喂临时文件）。
export function readLastContextUsageFromJsonlFile(
  filePath: string,
): Omit<ClaudeContextUsage, "contextWindow"> | undefined {
  let fd: number | undefined;
  try {
    fd = openSync(filePath, "r");
    const size = fstatSync(fd).size;
    if (size === 0) return undefined;
    // 位读尾窗，不整文件读入（长会话数百 MB 同步读会阻塞事件循环；同款反模式
    // session-relay readLastCompactBlock 注释里又警告过）。
    const readStart = Math.max(0, size - JSONL_USAGE_TAIL_BYTES);
    const buf = Buffer.alloc(size - readStart);
    const bytesRead = readSync(fd, buf, 0, buf.length, readStart);
    const lines = buf.subarray(0, bytesRead).toString("utf8").split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const usage = extractContextUsageFromStdoutLine(JSON.parse(lines[i]));
        if (usage) return usage;
      } catch {
        // skip malformed / 跨窗口边界的半行
      }
    }
  } catch {
    // JSONL 缺失/不可读（新会话尚未落盘等）——无恢复，维持 undefined
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
  return undefined;
}

// 控制请求等待超时：CLI 本地应答毫秒级；上限覆盖 turn 进行中排队等慢场景。
const CONTEXT_USAGE_CONTROL_TIMEOUT_MS = 5000;

// fork spawn 就绪等待：system.init 到达才算新 JSONL 写完（回滚编排要等它再关 WS，
// 否则客户端重连会先拿到旧 relay 的完整旧历史）。与客户端 rollback 请求超时
// （web/src/api/client.ts ROLLBACK_REQUEST_TIMEOUT_MS）留足余量。
const FORK_READY_TIMEOUT_MS = 20_000;

// 权威上下文占用（control_request{get_context_usage} 应答折算，CLI 2.1.299+）：
// totalTokens = CLI 自身 /context 口径的已用量（system prompt/tools/memory/messages
// 合计），maxTokens = autocompact 感知的真实窗口（settings 配置 buffer 时大于模型裸
// 窗口——比 [1m] 后缀推断更权威）。detail:"summary" 不调 token-count API（从最近
// response usage + 本地估算回答）。应答是 CLI 权威结构化数据，天然免疫网关流式占位行。
// summary 应答不带 usage 明细（input/cache 分解），明细字段由调用方另行补齐。
// categories 同步折算（CLI 终端 color/单项 percentage 不采，kind 非三态的整条丢弃）。
// 控制应答折算的统一形状（waiter/方法签名共用）。
type ContextUsageControlResult = Pick<ClaudeContextUsage, "contextTokens" | "contextWindow"> & {
  categories?: ContextUsageCategory[];
};
export function extractContextUsageFromControlResponse(
  parsed: Record<string, unknown> | null,
): ContextUsageControlResult | undefined {
  if (!parsed || parsed.type !== "control_response") return undefined;
  const envelope = parsed.response as
    | { subtype?: unknown; response?: Record<string, unknown> }
    | undefined;
  if (!envelope || envelope.subtype !== "success" || !envelope.response) return undefined;
  const inner = envelope.response;
  const total = typeof inner.totalTokens === "number" ? inner.totalTokens : -1;
  const max = typeof inner.maxTokens === "number" ? inner.maxTokens : -1;
  // total ≤ 0（空会话 resume 渲染 0% 违背「无数据不渲染」）或 max ≤ 0 均视为无效。
  if (total <= 0 || max <= 0) return undefined;
  const KINDS = new Set(["used", "buffer", "free"]);
  const rawCategories = Array.isArray(inner.categories) ? inner.categories : [];
  const categories = rawCategories
    .map((c) => c as Record<string, unknown>)
    .filter(
      (c): c is Record<string, unknown> =>
        typeof c.name === "string" &&
        typeof c.tokens === "number" &&
        typeof c.kind === "string" &&
        KINDS.has(c.kind),
    )
    .map((c) => ({
      name: c.name as string,
      tokens: c.tokens as number,
      kind: c.kind as ContextUsageCategory["kind"],
    }));
  return {
    contextTokens: total,
    contextWindow: max,
    ...(categories.length > 0 ? { categories } : {}),
  };
}

// 纯函数：spawn/模型切换时的窗口上限判定。判定依据与 buildSpawnEnv 的 [1m] 注入
// 同源（settings-store resolveModelId 拼 [1m]、buildAvailableAliases 映射 alias→
// resolved ID）：显式 --model 带 [1m] 直判 1M；alias 经 spawn 时记录的映射查裸 ID
//（buildAvailableAliases 有映射必同时发裸 tier 键，无需查 [1m] 变体键）；未传
// --model 时 CLI 回落 sonnet 默认，同映射查 sonnet。查不到（无预设 view / 脏值）
// 回落 200k。已知误差：opusplan 的 Plan Mode 实际走 OPUS env（buildSpawnEnv 注释），
// 若 opus 带映射带 [1m] 而 Plan Mode 期间窗口应按 opus——CLI 动态决定无法静态判对，
// 恒判 sonnet（普通模式语义），勿当精确语义引用。
export function resolveContextWindow(
  model: string | undefined,
  resolvedAliases: Record<string, string> | undefined,
): number {
  if (model?.endsWith("[1m]")) return CONTEXT_WINDOW_1M;
  const tier = !model || model === "opusplan" ? "sonnet" : model;
  const resolved = resolvedAliases?.[tier];
  if (resolved?.endsWith("[1m]")) return CONTEXT_WINDOW_1M;
  return CONTEXT_WINDOW_DEFAULT;
}

/** plain interrupt 的 armed 消费窗口：仅 plain flavor 且真实打断了 turn 才保留 armed
 * （ack 时按 flavor/迁移判定，见 pendingInterrupts 字段注释），CLI 的迟到 result
 *（error_during_execution）在此窗口内被短路（用户打断 ≠ error）。实测 ack → result
 *  间隔 <100ms，取宽松量级即可。cancel_queued flavor 无 result，ack 即删 armed。 */
const INTERRUPT_ARMED_WINDOW_MS = 30_000;

/** 单 runtime 已消费 uuid 台账的 FIFO 上限。量级参照：CLI 自身进程内幂等窗口是 10k；
 *  我们只服务「重放/重试去重」，滚窗远小于 CLI 量级即可，防长驻会话无限增长。 */
const CLAIMED_USER_UUIDS_LIMIT = 2000;

type ClaudeProcess = {
  proc: BunSubprocess;
  generation: number;
  projectPath: string;
  sessionId: string;
  projectName: string;
  claudeSessionId?: string;
  model?: string;
  modelAlias?: string;
  permissionMode?: string;
  effort?: EffortLevel;
  contextUsage?: Omit<ClaudeContextUsage, "contextWindow">;
  /** 窗口上限（spawn/模型切换时由 resolveContextWindow 判定，随帧下发）。 */
  contextWindow: number;
  /** spawn 时的 alias→resolved ID 映射（buildAvailableAliases(view).resolved），窗口判定用。 */
  resolvedAliases?: Record<string, string>;
  /** turn 状态（OSC 7501 对齐）: 统一会话标量管道第二个标量。spawn 初始 idle，
   *  经 applyStatusSignal 迁移；广播 session_status 帧 + 落盘 metadata（跨重启）。 */
  sessionStatus: AgentSessionStatus;
  /** 对话回滚 fork spawn 的完成信号：system.init 带不同 session_id 到达 = CLI 已把截断后的
   *  对话写入新 JSONL，消费时回填新 id + relay 重读 history。 */
  pendingFork?: boolean;
};

/** 审批中心登记上下文：ClaudeProcess 已有字段，can_use_tool 登记时随行（registry 无需反查）。 */
export type ClaudeApprovalRequestInfo = {
  runtimeKey: string;
  projectName: string;
  sessionId: string;
};

// 纯函数：构造 spawn env——继承父进程 + 注入 effort + provider 凭证 + model alias 解析 env。
// 对齐 CLI 原生 alias 机制：把激活预设 modelMapping 的 opus/sonnet/haiku 具体 ID 注入
// ANTHROPIC_DEFAULT_*_MODEL，让 CLI 自行解析 alias（含 opusplan：普通模式=SONNET env、
// Plan Mode=OPUS env，见官方 model-config §环境变量）。enable1mContext 时 opus/sonnet
// 带 [1m]（haiku 不带——CLI MODEL_ALIASES 无 haiku[1m]）。无 view（无激活预设）→ 不注入，
// CLI 回落自身默认。apiKey 只在此处从 provider 读出写进 env，不进任何日志/状态。导出供测试。
//
// host-managed 标志：有 provider 时同时设 CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST。CLI 启动
// 会把 ~/.claude/settings.json env 块 Object.assign 进 process.env（无条件覆盖 spawn 注入
// 值——用户历史遗留的 ANTHROPIC_BASE_URL/AUTH_TOKEN 会把激活预设盖回旧端点）；该标志让
// CLI 从 settings env 块剔除全部 provider 变量（BASE_URL/AUTH_TOKEN/API_KEY/DEFAULT_*_MODEL），
// 保住宿主注入。无 provider 不设——用户自己经 CLI settings 管端点的用法不受影响。
// 机制见 docs/research/claude-cli-runtime-config.md §env 覆盖优先级。
//
// 凭证注入用 ANTHROPIC_AUTH_TOKEN（Bearer 形态）而非 ANTHROPIC_API_KEY：CLI 2.1.2xx 对
// API_KEY 有 customApiKeyResponses consent 门槛——key hash 未在 ~/.claude.json approved 列表
// 时（无头 spawn 无人批准）CLI 返回 key:null，请求零鉴权头，网关回 "API key required"。
// AUTH_TOKEN 是一等鉴权源、无此门槛，且官方 API 与各类网关通吃（Bearer）。
export function buildSpawnEnv(
  effort: EffortLevel | undefined,
  provider: { apiKey: string; baseUrl?: string } | undefined,
  parentEnv: Record<string, string | undefined> = process.env,
  view?: ModelMappingView,
): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...parentEnv };
  if (effort) env.CLAUDE_CODE_EFFORT_LEVEL = effort;
  Object.assign(env, buildAgentEnvOverrides(provider, view));
  return env;
}

// ── agent env 覆盖值集（GUI/TUI 单源共用）─────────────────────────────────────
// 两形态唯一差异 = 无头（Bun.spawn stream-json）与有头（tmux pane TUI）的 spawn 机制
// 本身；凭证/网关/模型映射的 env 值集必须一致（2026-11-25 用户拍板「env 极为一致」）。
// GUI 走 buildSpawnEnv 继承后覆盖；TUI 经 tmux -e 注入 pane 进程真 environ。载体曾走
// --settings 文件 env 块，当日撤——CLI 的 env 消费视图建立在 spawn 时刻 process.env
// 快照键集合上（getPreSettingsEnvSnapshot，bundle 实锤），settings env 是后到叠加层、
// 键不在快照集合里：分类器（auto mode 兜底 Kj）读快照层 → settings env 对它不可见 →
// auto mode 恒退化人工审批（真机臂1 实锤「the check isn't getting through」）。tmux -e
// 键值短暂出现在 tmux client argv（ps 可见窗口 ~ms 级），换分类器可用性值得。
//
// AUTO_MODE_SERVER 不注入（2026-11-25 撤 0a08b6c7 的 =0——修复核心）：=0 触发 CLI
// own_switch_off，把 auto mode 直接关死（2.1.325 本地 classifier 非独立开关，删不得）。
// CLAUDE_CODE_AUTO_MODE_MODEL 同日撤（曾注入 resolved.sonnet 作「显式保险」）：bundle
// 2.1.325 实锤 CLI 分类器 safeguard 黑名单 ["claude-sonnet-5-5","claude-opus-5-5",
// "claude-opus-5"] 拒显式 pin——5-5 映射值恰撞名单被静默忽略，注入从未生效。分类器实际
// 生效路径 = env 缺席 → external sonnet probe（缺省 claude-sonnet-5）失败降级 → 兜底 Kj
// 读 ANTHROPIC_DEFAULT_OPUS_MODEL（Kj 分支不查黑名单）；TUI 形态曾零 env 注入 → 兜底落
// gateway per-provider 缺省表 claude-opus-4-7 → 网关（5-5 代配置）不路由 → auto mode
// 每步退回人工审批——本函数三件套注入即修复。
export function buildAgentEnvOverrides(
  provider: { apiKey: string; baseUrl?: string } | undefined,
  view?: ModelMappingView,
): Record<string, string> {
  const env: Record<string, string> = {};
  if (provider?.apiKey) {
    env.ANTHROPIC_AUTH_TOKEN = provider.apiKey;
    env.CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST = "1";
  }
  if (provider?.baseUrl) env.ANTHROPIC_BASE_URL = provider.baseUrl;
  if (view) {
    const { resolved } = buildAvailableAliases(view);
    if (resolved.opus) env.ANTHROPIC_DEFAULT_OPUS_MODEL = resolved.opus;
    if (resolved.sonnet) env.ANTHROPIC_DEFAULT_SONNET_MODEL = resolved.sonnet;
    if (resolved.haiku) env.ANTHROPIC_DEFAULT_HAIKU_MODEL = resolved.haiku;
  }
  return env;
}

// ── TUI（终端）形态 spawn（双模式，2026-10-15）────────────────────────────────
// CLI 原生形态：纯 argv、零 env 注入（用户拍板）——凭证走 CLI 自身配置；参数全部来自
// 会话 metadata。审批让位 = 不带 --permission-prompt-tool（CLI 自己的 TUI 弹审批，
// can_use_tool 帧天然不存在）；stream-json/--verbose 同理不带（无流可解析）。

/** TUI tmux pane 命令 argv（纯函数，单测锁定「无审批参数、有 resume/session-id」）。
 *  resume 语义与 headless spawn 同一判定（JSONL 存在 = --resume，不存在 = --session-id）。 */
export function buildTuiSpawnArgs(input: {
  claudeSessionId: string;
  resume: boolean;
  /** 已解析的规范模型名（alias→resolved 查表，消 CLI 自身别名表的网关 422 面）。 */
  model?: string;
  permissionMode?: string;
  effort?: EffortLevel;
  /** hooks settings 文件路径（TUI 状态采集三 hook 的挂载点）——缺省则不传，CLI 不加载任何
   *  额外 hooks。漏传 = 状态文件恒空、TUI 期状态点停更（review P1-1 实锤过的断链）。 */
  settingsPath?: string;
  mcpArgs?: string[];
}): string[] {
  return [
    "claude",
    input.resume ? "--resume" : "--session-id",
    input.claudeSessionId,
    ...(input.model ? ["--model", input.model] : []),
    ...(input.permissionMode ? ["--permission-mode", input.permissionMode] : []),
    ...(input.effort ? ["--effort", input.effort] : []),
    ...(input.settingsPath ? ["--settings", input.settingsPath] : []),
    ...(input.mcpArgs ?? []),
  ];
}

// 纯函数：从 settings 解析 claude runtime 激活预设的凭证。activePresetId 命中 → 返回
// {apiKey, baseUrl}；未激活/未命中/无 presets → undefined（spawn 回退继承父进程 env）。
// v2 起预设恒 anthropic（claude 端点），无需 protocol 守卫。导出供测试。
export function resolveActivePresetCreds(
  rt: { activePresetId: string } | undefined,
  presets: ClaudePreset[] | undefined,
): { apiKey: string; baseUrl?: string } | undefined {
  if (!rt?.activePresetId || !presets) return undefined;
  const preset = presets.find((p) => p.id === rt.activePresetId);
  if (!preset) return undefined;
  return { apiKey: preset.apiKey, baseUrl: preset.baseUrl };
}

export class ClaudeRuntime implements RuntimeResources {
  private readonly processes = new Map<string, ClaudeProcess>();
  private readonly relays = new Map<string, ClaudeSessionRelay>();
  // get_context_usage 控制请求的等待方（request_id → 结算 + 超时 timer）。客户端发起的
  // 控制请求（set_model 等）应答无 waiter，captureControlResponseFromLine 安全 no-op。
  private readonly contextUsageWaiters = new Map<
    string,
    {
      resolve: (v: ContextUsageControlResult | undefined) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  // fork spawn 的就绪等待方（runtimeKey → resolve）：captureSystemInitFromLine 的 fork
  // 分支回填新 id + reloadHistory 之后结算，rollbackConversation 才返回。
  private readonly forkWaiters = new Map<string, () => void>();
  // 用户打断的未决登记（runtimeKey → { requestId, at, cancelQueued }）：claude-stream
  // verbatim 转发 interrupt control_request 时登记；ack success 即以 turn_interrupted
  // 收口状态 + endTurn（checkpoint 同步释放）。armed 短路只服务 plain interrupt——
  // M2 探针实锤 cancel_queued:true 打断后 CLI 不发 result（ack 即全部），该 flavor
  // 在 ack 时即删登记；plain interrupt 打断了 working/blocked turn 才保留 armed
  //（短路迟到的 result{error_during_execution}，不迁移 done→error）。
  // review P1-1：M2 后停止入口全走 cancel_queued，armed 悬挂会吞掉 30s 窗口内
  // 后续自然 turn 的 result（status 卡 working / checkpoint 不收口——正是 M1 要修
  // 的悬挂形态复发），必须按 flavor 区分。
  private readonly pendingInterrupts = new Map<
    string,
    { requestId: string; at: number; cancelQueued: boolean }
  >();
  // 上行 user uuid 的已消费台账（发送幂等，T3 #5 clientRequestId）：四个入口（WS user
  // 帧 / REST /message / admin session_send / auto-retry inject）写 stdin 前先
  // claimUserUuid 占坑，重复 uuid 短路——CLI 侧本就按 uuid 幂等（进程内 10k FIFO +
  // 跨重启查 JSONL），这里收口的是 api 侧副作用（stdin 双写、live echo、checkpoint
  // 锚、排队登记）。仅 MESSAGE_UUID_RE 合法 uuid 参与；FIFO 限量防长驻泄漏，
  // 进程 close/respawn 清空（同 pendingInterrupts 惯例）。
  private readonly claimedUserUuids = new Map<string, { fifo: string[]; seen: Set<string> }>();
  // 队列恢复态（队列重物化，#11 重启恢复）：spawn 读盘后的恢复条目与进度。
  // pendingRecovery = 本次恢复的全部条目（含已 write 的——「write 成功」不等于
  // 「已执行落 JSONL」，进程死在该窗口内时盘面是唯一重发入口，故保留到下次 spawn
  // 的 JSONL 对照剪枝）；next = 已成功写 stdin 条数（先推进再 report）；abort =
  // 恢复中用户停止（holdQueueAndStop 置位，未发尾部转冻结）；cancelled = 排队期间
  // 被用户撤单的条目（lifecycle cancelled 帧驱动，persist 合并与 flush 跳过）。
  // 生命周期：flush 收口后保留（条目仍待下次 spawn 的 JSONL 确证）；abort / close /
  // 下次 spawn 重读时清。
  private readonly queuePersist = new Map<
    string,
    { pendingRecovery: ClaudeQueuedCommand[]; next: number; abort: boolean; cancelled: Set<string> }
  >();
  private readonly runDir: string;
  private readonly settingsStore?: SettingsStore;
  private readonly mcpPort?: number;
  private nextGeneration = 1;
  private onSystemInit:
    | ((sessionId: string, runtimeKey: string, claudeSessionId: string, model: string) => void)
    | null = null;
  private onModelChange: ((sessionId: string, model: string) => void) | null = null;
  private onPermissionModeChange: ((sessionId: string, permissionMode: string) => void) | null =
    null;
  private onSkillReload: ((sessionName: string) => void) | null = null;
  // 真实新 stdout 行 = session 活动 → bump updatedAt。只在 processStdoutLine（真实新行入口）
  // 触发，不在 onRealtimeRow/relay 回放触发（回放的 session_init/seedInit 会误刷新 updatedAt）。
  private onActivity: ((sessionId: string) => void) | null = null;
  // 审批中心挂钩（M5-b）：can_use_tool control_request 登记 + runtime 收口（result/退出）。
  // registry 本体在 approval-registry.ts——runtime 只广播事件，不反向依赖（无回调时零开销）。
  private onApprovalRequest:
    | ((info: ClaudeApprovalRequestInfo, request: ClaudeControlRequest) => void)
    | null = null;
  private onApprovalRuntimeSettled: ((runtimeKey: string) => void) | null = null;
  // turn 状态迁移出口：metadata 落盘（session-registry，跨重启权威）+ REST 快照。
  // 广播在 applyStatusSignal 内直接 injectLine（与 context_usage 同款 broadcast-only）。
  private onSessionStatusChange: ((sessionId: string, status: AgentSessionStatus) => void) | null =
    null;
  // 自动重试注入配置源（index.ts 从 SessionRegistry metadata 读 autoRetry config）。
  private autoRetryConfigProvider:
    | ((
        sessionId: string,
      ) => ClaudeAutoRetryConfig | undefined | Promise<ClaudeAutoRetryConfig | undefined>)
    | null = null;
  // 自动重试状态机：报错停下 → 延迟注入自定义消息（agent-auto-retry.ts）。
  private readonly autoRetry: AutoRetryWatch;

  // Turn 级 checkpoint 编排（T3 学习点③）：beginTurn/noteOutputUuid/endTurn 由
  // claude-stream（上行 user 帧）与 processStdoutLine（下行 uuid 采集/result 收口）
  // 调用；setter 注入避免构造签名扩散。turn-checkpointer.ts 是编排单源。
  private turnCheckpointer: TurnCheckpointer | null = null;

  setTurnCheckpointer(checkpointer: TurnCheckpointer): void {
    this.turnCheckpointer = checkpointer;
  }

  // gen-ui skill 交付的门控数据源（渐进式披露批：能力开关归 ar-hub 内部状态）。
  // setter 注入与 turnCheckpointer 同款，避免构造签名扩散。
  private capabilitiesStore: McpCapabilitiesStore | null = null;

  setCapabilitiesStore(store: McpCapabilitiesStore): void {
    this.capabilitiesStore = store;
  }

  constructor(runDir: string, settingsStore?: SettingsStore, mcpPort?: number) {
    this.runDir = runDir;
    this.settingsStore = settingsStore;
    this.mcpPort = mcpPort;
    this.autoRetry = new AutoRetryWatch({
      getConfig: (_sessionName, sessionId) => this.autoRetryConfigProvider?.(sessionId),
      inject: async (sessionName, message) => {
        // 注入 = 自动替用户发了一条消息：stdin user 行 + live echo（CLI 从不回显用户
        // 输入，echo 供当前与重连后的订阅者看到注入）。uuid 生成一次贯穿三方（stdin
        // 行 / echo / 排队登记）——CLI 采纳它为 command_uuid，lifecycle 帧据此对齐。
        const uuid = crypto.randomUUID();
        // 发送幂等（M3）：注入 uuid 同样入已消费台账——与四入口同表互斥，重放场景
        // 下不会二次注入（与滚窗限次正交，那是频率闸，这是幂等闸）。
        if (!this.claimUserUuid(sessionName, uuid)) return;
        const userLine = buildAutoRetryUserLine(message, uuid);
        // 先写后 echo：进程已死时 write 失败 → 不产生幽灵 isUserInput 回显（P3：旧实现
        // 无条件 echo，重生后的同 key relay 会缓冲一条从未发生的输入）。echo 时机决策
        // 收口在 reportUserInput（busy 时挂起到出队，与三入口同语义）。
        await this.write(sessionName, `${userLine}\n`);
        this.reportUserInput(
          sessionName,
          { uuid, text: message },
          buildAutoRetryEchoLine(message, uuid),
        );
      },
    });
  }

  setOnSystemInit(
    cb: (sessionId: string, runtimeKey: string, claudeSessionId: string, model: string) => void,
  ) {
    this.onSystemInit = cb;
  }

  setOnModelChange(cb: (sessionId: string, model: string) => void) {
    this.onModelChange = cb;
  }

  setOnPermissionModeChange(cb: (sessionId: string, permissionMode: string) => void) {
    this.onPermissionModeChange = cb;
  }

  setOnSkillReload(cb: (sessionName: string) => void) {
    this.onSkillReload = cb;
  }

  setOnActivity(cb: (sessionId: string) => void) {
    this.onActivity = cb;
  }

  setOnApprovalRequest(
    cb: (info: ClaudeApprovalRequestInfo, request: ClaudeControlRequest) => void,
  ) {
    this.onApprovalRequest = cb;
  }

  setOnApprovalRuntimeSettled(cb: (runtimeKey: string) => void) {
    this.onApprovalRuntimeSettled = cb;
  }

  setOnSessionStatusChange(cb: (sessionId: string, status: AgentSessionStatus) => void) {
    this.onSessionStatusChange = cb;
  }

  setAutoRetryConfigProvider(
    cb: (
      sessionId: string,
    ) => ClaudeAutoRetryConfig | undefined | Promise<ClaudeAutoRetryConfig | undefined>,
  ) {
    this.autoRetryConfigProvider = cb;
  }

  getSessionState(sessionName: string) {
    const state = this.processes.get(sessionName);
    if (!state) return null;
    return {
      model: state.model,
      permissionMode: state.permissionMode,
      contextUsage: state.contextUsage
        ? { ...state.contextUsage, contextWindow: state.contextWindow }
        : undefined,
    };
  }

  // Resolve a model id for a runtime control_request{set_model}. Passthrough:
  // the client sends an alias (opus/sonnet/haiku/opusplan) and the CLI resolves
  // it via ANTHROPIC_DEFAULT_*_MODEL env (injected at spawn by buildSpawnEnv).
  // concrete IDs (legacy clients) also pass through verbatim. No settings read
  // needed — alias→concrete resolution is the CLI's job, not ours.
  async resolveControlModel(model: string | undefined): Promise<string | undefined> {
    return model;
  }

  setClaudeSessionId(sessionName: string, claudeSessionId: string, model?: string): void {
    const state = this.processes.get(sessionName);
    if (state) {
      if (!state.claudeSessionId) state.claudeSessionId = claudeSessionId;
      if (model && !state.model) state.model = model;
      const relay = this.relays.get(sessionName);
      if (relay) relay.setClaudeSessionId(state.projectPath, claudeSessionId);
    }
  }

  async exists(sessionName: string): Promise<boolean> {
    const proc = this.processes.get(sessionName);
    if (!proc) return false;
    return proc.proc.exitCode === null;
  }

  /**
   * 进程内存活集合：遍历 this.processes（exitCode===null），与 exists 同源，零 spawn。
   * sessionName 即 metadata.runtimeKey（spawnAndStart 入参）。供 SessionRegistry 批量探活。
   */
  async listAliveRuntimeKeys(): Promise<Set<string>> {
    const alive = new Set<string>();
    for (const [sessionName, state] of this.processes) {
      if (state.proc.exitCode === null) alive.add(sessionName);
    }
    return alive;
  }

  async close(sessionName: string, opts?: { silent?: boolean }): Promise<void> {
    const proc = this.processes.get(sessionName);
    if (proc) {
      // close 信号先于 processes.delete(applyStatusSignal 需 state 在场):详情页在关
      // 停瞬间收到 session_status{closed} 帧;closed 不落盘(index.ts 装配处短路——
      // closeAgentSession 紧随 removeMetadata,异步写会竞态复活刚删的 metadata)。
      // silent（双模式切换专用）：会话没关,只是换进程形态——不广播 closed、不走审批
      // settled 回调(agent-tui 编排方自行 clearRuntime),其余清理照旧。
      if (!opts?.silent) {
        this.applyStatusSignal(sessionName, { kind: "close" });
      }
      proc.proc.kill();
      this.processes.delete(sessionName);
      // close 路径的审批收口：exited 回调带 isCurrentGeneration 守卫，processes 已 delete 后
      // 守卫恒 false 不触发——在此显式清 registry，否则残留「存活」僵尸卡片（reviewer P2）。
      if (!opts?.silent) {
        this.onApprovalRuntimeSettled?.(sessionName);
      }
    }
    this.autoRetry.destroySession(sessionName);
    this.turnCheckpointer?.resetSession(sessionName);
    // 恢复态随进程销毁清空（review P2）：残留 rec 会在 rollback fork 后的新对话里
    // 被 persist 合并写回旧排队消息，抵消 removeSessionQueue 的显式清盘。
    this.queuePersist.delete(sessionName);
    // 进程销毁 = 一切未决控制请求作废（旧 request_id 的 ack 不会再有意义）。
    this.pendingInterrupts.delete(sessionName);
    // 进程销毁 = uuid 台账清空（新进程新语境；CLI 跨重启去重查 JSONL，仍兜底）。
    this.claimedUserUuids.delete(sessionName);

    const relay = this.relays.get(sessionName);
    if (relay) {
      relay.destroy();
      this.relays.delete(sessionName);
    }
  }

  /**
   * 对话回滚（T3 学习点③）：destroy 当前 CLI → fork 重启。resumeAt 非空 =
   * `--resume <old> --resume-session-at <resumeAt> --fork-session`（fork 出新 id，
   * 旧 JSONL 留 orphan——CLI 自身 /rewind 同语义）；null = 截断全部对话（开全新会话，
   * 不带 --resume/--session-id，CLI 自生成 id 经 system.init 回填）。fork 完成由
   * captureSystemInitFromLine 消费（新 id 回填 state/registry + relay.reloadHistory）；
   * 调用方（checkpoint 路由）随后 closeSessionSockets 让客户端重连拿截断后的历史。
   */
  async rollbackConversation(
    sessionName: string,
    projectPath: string,
    projectName: string,
    sessionId: string,
    oldClaudeSessionId: string,
    resumeAt: string | null,
    model?: string,
    permissionMode?: string,
    effort?: EffortLevel,
  ): Promise<void> {
    await this.close(sessionName, { silent: true });
    // fork 换新对话面（新 claudeSessionId）：旧队列的 JSONL 对照面失效 → 显式清盘
    // （队列重物化 #11）。fork 分支的 spawn 尾钩本就跳过恢复，这里防「fork 后
    // 又走非 fork respawn」读到过期盘面。
    removeSessionQueue(this.runDir, sessionId);
    if (resumeAt) {
      // 先挂等待再 spawn：system.init 可能在 spawnAndStart 的 await 内部就被消费。
      const ready = new Promise<void>((resolve) => this.forkWaiters.set(sessionName, resolve));
      try {
        await this.spawnAndStart(
          sessionName,
          projectPath,
          projectName,
          sessionId,
          oldClaudeSessionId,
          model,
          permissionMode,
          effort,
          undefined,
          { resumeAt },
        );
        await this.awaitForkReady(sessionName, ready);
      } finally {
        this.forkWaiters.delete(sessionName);
      }
    } else {
      await this.spawnAndStart(
        sessionName,
        projectPath,
        projectName,
        sessionId,
        undefined,
        model,
        permissionMode,
        effort,
      );
    }
  }

  /** 等 fork 的 system.init 落地（新 claudeSessionId 回填 + relay reloadHistory 完成）。 */
  private async awaitForkReady(sessionName: string, ready: Promise<void>): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        ready,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("fork session did not become ready in time")),
            FORK_READY_TIMEOUT_MS,
          );
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  async startAgent(metadata: SessionMetadata): Promise<void> {
    await this.spawnAndStart(
      metadata.runtimeKey,
      metadata.projectPath,
      metadata.projectName,
      metadata.id,
      metadata.claudeSessionId,
      metadata.modelAlias ?? metadata.model,
      metadata.permissionMode,
      metadata.effort,
      // 重启恢复:落盘 done/error 存活到被替换(spawnInitialStatus 归一;metadata.status
      // 类型是含 terminal "running" 的宽联合,归一收窄)。
      spawnInitialStatus(metadata.status),
    );
  }

  async ensureRunning(
    sessionName: string,
    projectPath: string,
    projectName: string,
    sessionId: string,
    claudeSessionId?: string,
    model?: string,
    permissionMode?: string,
    effort?: EffortLevel,
    /** respawn 恢复路径与 startAgent 同口径(spawnInitialStatus 归一)。 */
    initialStatus?: AgentSessionStatus,
  ): Promise<void> {
    const existing = this.processes.get(sessionName);
    if (existing) {
      if (existing.proc.exitCode === null) {
        if (!existing.claudeSessionId && claudeSessionId)
          existing.claudeSessionId = claudeSessionId;
        if (!existing.model && model) existing.model = model;
        if (!existing.permissionMode && permissionMode) existing.permissionMode = permissionMode;
        if (!existing.effort && effort) existing.effort = effort;
        const relay = this.relays.get(sessionName);
        if (relay && claudeSessionId) relay.setClaudeSessionId(projectPath, claudeSessionId);
        return;
      }

      this.processes.delete(sessionName);
      this.autoRetry.destroySession(sessionName);
      const relay = this.relays.get(sessionName);
      if (relay) {
        relay.destroy();
        this.relays.delete(sessionName);
      }
    }

    await this.spawnAndStart(
      sessionName,
      projectPath,
      projectName,
      sessionId,
      claudeSessionId,
      model,
      permissionMode,
      effort,
      initialStatus,
    );
  }

  async write(sessionName: string, data: string): Promise<void> {
    const proc = this.processes.get(sessionName);
    if (!proc || proc.proc.exitCode !== null) {
      throw new Error(`Claude process not running for session "${sessionName}"`);
    }
    const stdin = proc.proc.stdin;
    if (typeof stdin === "number" || !stdin) {
      throw new Error(`stdin not available for session "${sessionName}"`);
    }
    stdin.write(data);
    // 真实用户/控制输入介入 → 取消待发的自动重试注入（不与用户输入叠加）。
    // 自身注入也走 write，但触发时 pendingTimer 已置 null，此调用为 no-op。
    this.autoRetry.cancelPending(sessionName);
  }

  // Buffer a line into the relay's live cache + broadcast, so a user-message
  // echo reaches current AND future subscribers (replayed on reconnect). No-op
  // if the session/relay isn't registered (e.g. race with close) — the echo is
  // best-effort; the CLI turn still proceeds via write().
  injectLiveLine(sessionName: string, line: string): void {
    const relay = this.relays.get(sessionName);
    if (relay && !relay.isDestroyed) {
      relay.injectLiveLine(line);
    }
  }

  /** turn 状态迁移的唯一入口(状态机 = agent-session-status.ts 纯函数)。无迁移短路;
   *  有迁移:proc state 更新(seed_init.sessionStatus 的源) → onSessionStatusChange
   *  (落盘 metadata,跨重启权威 → registry.onMetadataChanged → sessions-stream 广播)。
   *  壳状态不寄生 chat 消息流（原 injectLiveLine session_status 帧已拆，2026-10-19
   *  壳/内容分离重构）。 */
  private applyStatusSignal(sessionName: string, signal: AgentStatusSignal): void {
    const state = this.processes.get(sessionName);
    if (!state) return;
    const next = nextAgentSessionStatus(state.sessionStatus, signal);
    if (!next) return;
    state.sessionStatus = next;
    this.onSessionStatusChange?.(state.sessionId, next);
  }

  /** 上行 user uuid 占坑（发送幂等，T3 #5）：首次 true 并入台账；重复 false（调用方
   *  短路全部副作用）。仅 MESSAGE_UUID_RE 合法 uuid 参与——非法（旧客户端/垃圾帧）
   *  恒 true 且不入表（现状直写语义不变）。同步无 await：两入口并发同 uuid 时第二
   *  个必 false，无占位竞态。FIFO 限量 + 进程 close/respawn 清空（见字段注释）。 */
  claimUserUuid(runtimeKey: string, uuid: string): boolean {
    if (!MESSAGE_UUID_RE.test(uuid)) return true;
    let entry = this.claimedUserUuids.get(runtimeKey);
    if (!entry) {
      entry = { fifo: [], seen: new Set() };
      this.claimedUserUuids.set(runtimeKey, entry);
    }
    if (entry.seen.has(uuid)) return false;
    entry.seen.add(uuid);
    entry.fifo.push(uuid);
    if (entry.fifo.length > CLAIMED_USER_UUIDS_LIMIT) {
      const evicted = entry.fifo.shift();
      if (evicted !== undefined) entry.seen.delete(evicted);
    }
    return true;
  }

  /** claim 失败路径回滚（review P1-2）：write/ensureRunning 抛错时释放占坑——幂等键
   *  烧掉会让「首次根本没送达」的重试（clientRequestId 的服务场景）永远命中 dedup
   *  谎报 delivered。同步无 await，与 claim 对称；未占坑（非法 uuid / 已被驱逐）
   *  no-op。仅 claude-stream 两入口接线（auto-retry 注入 uuid 恒新生成，无重试语义）。 */
  releaseUserUuid(runtimeKey: string, uuid: string): void {
    if (!MESSAGE_UUID_RE.test(uuid)) return;
    const entry = this.claimedUserUuids.get(runtimeKey);
    if (!entry) return;
    if (!entry.seen.delete(uuid)) return;
    const idx = entry.fifo.indexOf(uuid);
    if (idx !== -1) entry.fifo.splice(idx, 1);
  }

  // 队列镜像落盘（队列重物化 M1）：relay onQueueChanged → 合并恢复态后写盘。写失败
  // 只 console.error（盘面可能是旧队列，下次变更覆盖）。
  private persistQueueState(
    sessionName: string,
    sessionId: string,
    queued: ClaudeQueuedCommand[],
    held: ClaudeQueuedCommand[],
  ): void {
    const rec = this.queuePersist.get(sessionName);
    // 合并规则（review P1 修正）：恢复条目全量保留在前（原盘面顺序 = 真实时序），
    // relay 镜像里不属于恢复条目的新消息去重补后。不得按 next 切片丢「已 write」
    // 条目——write 成功只代表字节进了 pipe，CLI 死在执行前时 JSONL 无记录，对照
    // 不剔，盘面是唯一重发入口（对照语义是「剔除已执行」，不是「确认未执行」）。
    // 用户撤单的条目（cancelled）剔除，防下次 spawn 重发已取消消息。
    const recovered = rec ? rec.pendingRecovery.filter((e) => !rec.cancelled.has(e.uuid)) : [];
    const mergedQueued = [
      ...recovered,
      ...queued.filter((q) => !recovered.some((e) => e.uuid === q.uuid)),
    ];
    writeSessionQueue(this.runDir, sessionId, {
      schemaVersion: 1,
      savedAt: new Date().toISOString(),
      queued: mergedQueued,
      held,
    });
  }

  // relay 创建统一接线（spawnAndStart / stream 惰性创建两处共用）：队列镜像变更 →
  // 落盘。M1 只接镜像；M2 在此基础上接恢复读回与重发编排。
  private wireQueueRelay(sessionName: string, sessionId: string, relay: ClaudeSessionRelay): void {
    relay.onQueueChanged = (queued, held) =>
      this.persistQueueState(sessionName, sessionId, queued, held);
    // 撤单（cancelled lifecycle 帧）从恢复态剔除：否则 persist 合并会把已取消的恢复
    // 条目写回盘面，下次 spawn 重发用户明确撤掉的消息。started/completed 不剔——
    // 执行确证交给下次 spawn 的 JSONL 对照。
    relay.onCommandSettled = (uuid, state) => {
      if (state !== "cancelled") return;
      this.queuePersist.get(sessionName)?.cancelled.add(uuid);
    };
  }

  // ── 队列重物化（#11 重启恢复）M2：读回 + 自动重发编排 ──

  // spawn 尾钩（非 fork）：api 重启/CLI 垮塌/effort·模型切换 respawn 后，盘面冻结的
  // 排队消息自动重发（用户拍板「自动继续执行」）。读盘面 → JSONL 对照剔已执行 →
  // held 恢复进 relay（冻结态，用户显式停止的产物——机器不替用户恢复，走既有
  // resume/discard 流）→ 对照修正落盘 → 恢复态落位 → fire-and-forget flush。
  private recoverSessionQueue(
    sessionName: string,
    sessionId: string,
    projectPath: string,
    claudeSessionId: string | undefined,
  ): void {
    // spawn 尾钩兜底 try/catch：恢复是锦上添花，任何异常（坏盘面形状/路径异常）都
    // 不得中断 spawnAndStart 本体。
    try {
      this.recoverSessionQueueInner(sessionName, sessionId, projectPath, claudeSessionId);
    } catch (error) {
      console.error(`[claude-runtime] queue recovery failed ${sessionId}:`, error);
    }
  }

  private recoverSessionQueueInner(
    sessionName: string,
    sessionId: string,
    projectPath: string,
    claudeSessionId: string | undefined,
  ): void {
    const saved = readSessionQueue(this.runDir, sessionId);
    if (!saved) return;
    // 新 generation 的恢复态从盘面重建，旧世代残留先清（close 已清，双保险）。
    this.queuePersist.delete(sessionName);
    // JSONL 对照剔已执行（claimUserUuid 台账是进程内第二道网；CLI uuid 幂等是兜底）。
    // claudeSessionId 未知 = 全新会话（无 JSONL 历史），无对照面 → 全部视为未执行。
    const executed = claudeSessionId
      ? filterExecutedUuids(
          claudeJsonlPath(projectPath, claudeSessionId),
          saved.queued.map((e) => e.uuid),
        )
      : new Set<string>();
    const pending = saved.queued.filter((e) => !executed.has(e.uuid));
    // 恢复态先落位再动 relay（review P1 修正：restoreHeldCommands 的 onQueueChanged
    // 会走 persistQueueState 合并——先落位才能把 pending 一并写回，否则空 queued
    // 镜像会覆掉盘面里尚未重发的条目）。
    if (pending.length > 0) {
      this.queuePersist.set(sessionName, {
        pendingRecovery: pending,
        next: 0,
        abort: false,
        cancelled: new Set(),
      });
    }
    // held 恢复为冻结态（restoreHeldCommands 广播 queue_held + 落盘回调同步带出）
    if (saved.held.length > 0) {
      this.relays.get(sessionName)?.restoreHeldCommands(saved.held);
    }
    // 对照修正落盘（已执行条目剔除；无 held 时 restoreHeld 未触发，这里补写）。
    // 双空时 writeSessionQueue 内部 unlink 收盘面。
    if (executed.size > 0) {
      writeSessionQueue(this.runDir, sessionId, {
        schemaVersion: 1,
        savedAt: new Date().toISOString(),
        queued: pending,
        held: saved.held,
      });
    }
    if (pending.length === 0) return;
    void this.flushRecoveredCommands(sessionName, sessionId);
  }

  // 恢复重发循环：与 autoRetry 注入同构（claim → write stdin → checkpoint →
  // reportUserInput）。首条 idle 直注、后续 busy 正常入队 + echo 挂起（reportUserInput
  // 的 user_input 信号让状态进 working，#2 修复管道，UI=f(state) 零新分支）。write
  // 失败 = release + 中止（条目留盘下次 respawn 重试）。收口不清恢复态、不重写盘面
  // （review P1 修正：条目保留到下次 spawn 的 JSONL 对照确证——写盘成功 ≠ 已执行）。
  private async flushRecoveredCommands(sessionName: string, sessionId: string): Promise<void> {
    const rec = this.queuePersist.get(sessionName);
    if (!rec || rec.abort) return;
    const state = this.processes.get(sessionName);
    if (!state) {
      this.queuePersist.delete(sessionName);
      return;
    }
    for (const entry of rec.pendingRecovery.slice(rec.next)) {
      if (rec.abort) return;
      if (rec.cancelled.has(entry.uuid)) {
        rec.next++;
        continue;
      }
      const uuid = MESSAGE_UUID_RE.test(entry.uuid) ? entry.uuid : crypto.randomUUID();
      if (!this.claimUserUuid(sessionName, uuid)) {
        // 同 uuid 已被本进程其它路径占坑 = 该条已发过（盘面去重后的重复/跨世代残留）
        // ——跳过，绝不换新 uuid 重发（review P2：换 id 重发 = 同内容执行两次）。
        rec.next++;
        continue;
      }
      try {
        await this.write(sessionName, `${buildAutoRetryUserLine(entry.content, uuid)}\n`);
      } catch {
        // 进程已死（写入前 exited）：release + 中止——条目仍在盘面，下次 respawn 重试
        this.releaseUserUuid(sessionName, uuid);
        return;
      }
      rec.next++;
      void this.turnCheckpointer
        ?.beginTurn({
          runtimeKey: sessionName,
          sessionId,
          projectPath: state.projectPath,
          anchorUuid: null,
        })
        .catch(() => undefined);
      this.reportUserInput(
        sessionName,
        { uuid, text: entry.content },
        buildAutoRetryEchoLine(entry.content, uuid),
      );
    }
  }

  /** 用户提交消息(STDIN 注入 echo 行)→ working；turn 进行中(working)时折叠登记进
   *  服务端排队(queue-state serverization——CLI 在 running turn 中对后续 prompt 零
   *  遥测，lifecycle 帧延迟到 turn 边界)。gate 读取与状态迁移在同一同步块内完成
   *  (无 await 缝隙)——gen-ui loadGenUiContext / REST ensureRunning 的异步续体交错
   *  不会漏登记。gate 只判 working:blocked 下 CLI 行为未实测,保守方向漏登记无害
   *  (lifecycle 帧对未知 uuid 是 no-op 自愈),错登记才可能永久泄漏。
   *  claude-stream message()/injectUserPrompt/auto-retry inject 调。
   *  echoLine（可选举，三入口的 live echo 行）：echo 决策收口在此——本类是唯一知道
   *  busy 的位置。非 busy 立即注入（idle 直执，现状语义）；busy && prompt 时随队列
   *  条目挂起（排队期间聊天流与 queue chip 单点呈现，started 出队才补入，见 relay
   *  pendingEchoes）；busy && 无 prompt（tool_result 续跑帧）不排队也不挂起，照旧
   *  立即注入——审批应答必须即时可见。 */
  reportUserInput(
    runtimeKey: string,
    prompt?: { uuid: string; text: string },
    echoLine?: string,
  ): void {
    const state = this.processes.get(runtimeKey);
    const busy = state?.sessionStatus === "working";
    this.applyStatusSignal(runtimeKey, { kind: "user_input" });
    const relay = this.relays.get(runtimeKey);
    const withinQueueLimits =
      relay !== undefined &&
      Buffer.byteLength(prompt?.text ?? "") <= MAX_ENTRY_CONTENT_BYTES &&
      relay.getQueueSnapshot().queued.length < MAX_QUEUE_ENTRIES;
    if (busy && prompt && relay && withinQueueLimits) {
      relay.enqueueQueuedCommand(
        {
          uuid: prompt.uuid,
          content: prompt.text,
        },
        echoLine,
      );
      return;
    }
    // busy 但超限（security review P2-2 写读对称）：不入队不挂起，echo 直注入聊天
    // 流——CLI 侧已收 stdin，会话内照常执行；仅盘面镜像不含该条（跨重启不恢复超限
    // 条目），与读侧拒收上限同源。
    if (echoLine !== undefined) this.injectLiveLine(runtimeKey, echoLine);
  }

  /** 审批收口(ApprovalCenter 回调)→ 回 working。 */
  reportApprovalSettled(runtimeKey: string): void {
    this.applyStatusSignal(runtimeKey, { kind: "approval_settled" });
  }

  /** 用户打断登记（claude-stream verbatim 转发 interrupt control_request 时调）。
   *  同 runtime 重复点击停止 = 新 request_id 覆盖旧登记（CLI 对旧 id 的 ack 处理不受
   *  影响——capture 按 requestId 匹配，旧 id 的 ack 到达时对不上当前登记即走 waiter
   *  no-op 路径，无害）。进程销毁/respawn 时清理。 */
  registerInterruptRequest(runtimeKey: string, requestId: string, cancelQueued = false): void {
    if (!this.processes.has(runtimeKey)) return;
    this.pendingInterrupts.set(runtimeKey, { requestId, at: Date.now(), cancelQueued });
  }

  /** 停止 = 冻结队列（M2，用户拍板 T3 holdQueue 语义）编排入口（claude-stream
   *  queue_hold 分支调）：
   *  ① relay 排队快照整体挪入 held（广播空 queue_state + queue_held 快照——后者同时
   *     是客户端「停止已生效」的回执，web 据此收口 running 指示）；
   *  ② 代发 CLI cancel_queued:true control_request（= interrupt + 清 CLI 队列；
   *     探针实证 idle 下同样安全回 ack {still_queued:[],cancelled:[]} 无 result，
   *     running + 排队时排队条目不再执行）。
   *  ack 走 M1 interrupt 登记链：收口 turn 状态 + 释放 checkpoint。cancel_queued
   *  flavor 下 CLI 不发 result（M2 探针实锤）→ ack 即删 armed（review P1-1：armed
   *  悬挂会吞掉 30s 窗口内后续自然 turn 的 result）。
   *  write 失败（进程已死）时登记残留由 ack 不达 + 后续 interrupt 覆盖或进程
   *  close 清理，无 armed 悬挂。 */
  holdQueueAndStop(runtimeKey: string): void {
    const relay = this.relays.get(runtimeKey);
    if (!relay) return;
    // 恢复中用户停止（#11 review 修正）：置 abort 停 flush 循环 + 未发尾部
    // （pendingRecovery.slice(next)）并入 relay 冻结——停止意图优先：这些条目还没
    // write stdin，转冻结由 resume/discard 自决，不是「下次 respawn 又自动发」。
    // 顺序：先 holdCommands（queued 挪 held），再 restoreHeldCommands（held ∪
    // undelivered 置位）——反序会被 holdCommands 的 held=queued 覆盖丢条目。
    const rec = this.queuePersist.get(runtimeKey);
    const undelivered = rec
      ? rec.pendingRecovery.slice(rec.next).filter((e) => !rec.cancelled.has(e.uuid))
      : [];
    if (rec) {
      rec.abort = true;
      this.queuePersist.delete(runtimeKey);
    }
    relay.holdCommands();
    if (undelivered.length > 0) {
      const snap = relay.getQueueSnapshot();
      relay.restoreHeldCommands([...snap.held, ...undelivered]);
    }
    const requestId = crypto.randomUUID();
    this.registerInterruptRequest(runtimeKey, requestId, true);
    const line = JSON.stringify({
      type: "control_request",
      request_id: requestId,
      request: { subtype: "interrupt", cancel_queued: true },
    });
    void this.write(runtimeKey, `${line}\n`).catch(() => undefined);
  }

  /** 恢复/放弃冻结队列（queue_resume / queue_discard）：清 held + 广播空 queue_held。
   *  恢复的重发由 web 收到空快照后按序执行（adapter resumeHeld，新 uuid 沿用撤单条
   *  重发惯例）；api 侧两动作同实现。 */
  clearHeldQueue(runtimeKey: string): void {
    this.relays.get(runtimeKey)?.clearHeldCommands();
  }

  // ── 自动重试待发注入的控制桥（M8 03d `.count` 取消/立即重试）──────────────
  // sessionName = metadata.runtimeKey（SessionRegistry 的 session.runtimeKey）。

  /** 待发注入快照（03d `.count` 倒计时条数据源）；无 pending 返回 null。 */
  autoRetryPending(sessionName: string) {
    return this.autoRetry.pendingStatus(sessionName);
  }

  /** 取消待发注入（03d「取消」）。 */
  cancelAutoRetry(sessionName: string): void {
    this.autoRetry.cancelPending(sessionName);
  }

  /** 立即注入（03d「立即重试」）：提前 fire，返回是否真的注入。 */
  fireAutoRetryNow(sessionName: string): Promise<boolean> {
    return this.autoRetry.fireNow(sessionName);
  }

  // Broadcast a server-synthesized line to CURRENT subscribers only (no buffering
  // into liveLines/history). Used for transient notifications like
  // skill_catalog_changed that must not replay on reconnect — reconnects re-fetch
  // the catalog via REST instead. No-op if the session/relay isn't registered.
  injectServerLine(sessionName: string, line: string): void {
    const relay = this.relays.get(sessionName);
    if (relay && !relay.isDestroyed) {
      relay.injectLine(line);
    }
  }

  async stream(
    sessionName: string,
    onData: (data: string) => void,
    onError: (error: Error) => void,
    sinceUuid?: string,
  ): Promise<RuntimeStream> {
    const proc = this.processes.get(sessionName);
    if (!proc) throw new Error(`Session "${sessionName}" not registered`);

    let relay = this.relays.get(sessionName);
    if (!relay) {
      relay = new ClaudeSessionRelay();
      this.relays.set(sessionName, relay);
      this.wireQueueRelay(sessionName, proc.sessionId, relay);
      await relay.activate(proc.projectPath, proc.claudeSessionId).catch(() => {
        this.relays.delete(sessionName);
      });
    } else {
      // 订阅不得早于激活落定（不变量守卫）：doActivate 目前全同步，这里的 await 只是
      // 一个已 resolve 的微任务；若 doActivate 未来异步化，这里保证不订阅进「full 回放
      // 但缓冲全空」且激活后不补发的 init 期 relay。doActivate 若真 reject，await 会
      // 先于 addSubscriber 抛出、经 startStream 的 catch（error 帧 + close）呈现。
      await relay.ensureActive();
    }

    // Resume 恢复（两段）：① JSONL 同步先行——seed 立即带上最后一条有效 assistant
    // usage（占位行同款过滤），WS 首字节零等待；② get_context_usage 控制请求
    // fire-and-forget（CLI 2.1.299+，totalTokens/maxTokens 免疫网关占位行、窗口
    // autocompact 感知），应答后经 refreshContextUsageFromControl 覆盖权威值并广播。
    // 不在 addSubscriber 前同步 await 控制——CLI mid-turn 排队/不支持时会把 WS 首字节
    // 拖到 5s 超时（review P1）。
    if (!proc.contextUsage && proc.claudeSessionId) {
      proc.contextUsage = readLastContextUsageFromJsonl(proc.projectPath, proc.claudeSessionId);
      void this.refreshContextUsageFromControl(sessionName);
    }

    // Scalar seed init: system.init is stdout-only (absent from JSONL/tail), so on
    // reconnect the client's scalar fold has no seed. Inject a synthetic init with
    // the CURRENT model/permissionMode before history.
    const seedInitLine = buildSeedInitLine(
      proc.model,
      proc.permissionMode,
      proc.modelAlias,
      proc.contextUsage ? { ...proc.contextUsage, contextWindow: proc.contextWindow } : undefined,
      proc.sessionStatus,
    );

    return relay.addSubscriber(
      onData,
      onError,
      seedInitLine,
      sinceUuid ? { sinceUuid } : undefined,
    );
  }

  async capture(): Promise<string> {
    return "";
  }

  async resize(): Promise<void> {
    // no-op
  }

  async startTerminal(): Promise<void> {
    throw new Error("ClaudeRuntime does not support terminal sessions");
  }

  // ── private ──

  private async spawnAndStart(
    sessionName: string,
    projectPath: string,
    projectName: string,
    sessionId: string,
    claudeSessionId?: string,
    model?: string,
    permissionMode?: string,
    effort?: EffortLevel,
    /** 重启恢复带入的初始状态(落盘 done/error 存活到被替换);缺省 idle。 */
    initialStatus?: AgentSessionStatus,
    /** 对话回滚（T3 学习点③）：fork spawn 一次性 override——`--resume <old>
     *  --resume-session-at <resumeAt> --fork-session`。仅本次 spawn 生效。 */
    fork?: { resumeAt: string },
  ): Promise<void> {
    const { resolvedModel, resolvedEffort, providerCreds, view } = await this.resolveSpawnInputs(
      model,
      effort,
    );

    // MCP hub 注入:按 provider 取注入器构造 --mcp-config args。
    // mcpPort 未配置或 runtime 不支持 → mcpArgs 空,agent 不连 hub(降级,不阻塞 spawn)。
    // origin 用 ar 会话 id（admin 审批卡 origin 身份），不是 claudeSessionId——
    // hub 端按 ar 会话 id 查 peekMetadata，agent-tui 调用点同此语义。
    const mcpArgs = this.buildMcpArgs(projectName, sessionId);

    // gen-ui skill 交付(capability 开启时幂等写 .claude/skills/gen-ui/SKILL.md;
    // 内部吞错只记日志——skill 缺失降级为 agent 不知道 gen-ui,绝不阻塞 spawn)。
    if (this.capabilitiesStore) {
      await ensureGenUiSkill(projectPath, this.capabilitiesStore, projectName);
    }

    // spawn 形态判定(--session-id 实测语义:全新 id 专用,已存在报 "already in use";
    // --resume 对不存在 id 硬失败 "No conversation found")——JSONL 存在 = --resume 接续,
    // 不存在 = --session-id 全新。创建即钉 claudeSessionId(双模式)后,该判定天然覆盖
    // 「创建后未发消息就重启 API」边角(同 id 仍未占用,--session-id 可复用)。
    const resume = claudeSessionId
      ? existsSync(claudeJsonlPath(projectPath, claudeSessionId))
      : false;

    const proc = this.spawnClaudeDirect(
      sessionName,
      projectPath,
      claudeSessionId,
      resume,
      resolvedModel,
      permissionMode,
      resolvedEffort,
      providerCreds,
      view,
      mcpArgs,
      fork,
    );

    // spawn 换代 = 旧进程的一切未决控制请求作废（requestId 随旧进程消亡）。
    this.pendingInterrupts.delete(sessionName);
    // spawn 换代 = uuid 台账清空（同 close；CLI 跨重启去重查 JSONL 兜底）。
    this.claimedUserUuids.delete(sessionName);

    const generation = this.nextGeneration++;
    // 窗口上限判定：与实际 --model 同源（sanitize 后值），alias 经 spawn 时记录的
    // alias→resolved 映射查 [1m]；映射随 proc state 存档，captureModelFromLine 模型
    // 切换时用新 model 重算窗口（GUI 切 [1m] 变体后无需重启进程即纠正）。
    const spawnSafeModel = sanitizePersistedModel(model);
    const resolvedAliases = view ? buildAvailableAliases(view).resolved : undefined;
    this.processes.set(sessionName, {
      proc,
      generation,
      projectPath,
      sessionId,
      projectName,
      claudeSessionId,
      model,
      modelAlias: model,
      permissionMode,
      effort: resolvedEffort,
      contextWindow: resolveContextWindow(spawnSafeModel, resolvedAliases),
      resolvedAliases,
      sessionStatus: initialStatus ?? "idle",
      pendingFork: Boolean(fork),
    });

    // Create relay immediately (before stdout starts) so messages aren't lost
    let relay = this.relays.get(sessionName);
    if (relay) {
      relay.destroy();
    }
    relay = new ClaudeSessionRelay();
    this.relays.set(sessionName, relay);
    this.wireQueueRelay(sessionName, sessionId, relay);
    // fork spawn 时新 claudeSessionId 未知（system.init 才揭晓）——空激活，等
    // captureSystemInitFromLine 的 fork 分支回填新 id + relay.reloadHistory。
    await relay.activate(projectPath, fork ? undefined : claudeSessionId);

    // Start reading stdout into relay
    const stdout = proc.stdout;
    if (stdout && typeof stdout !== "number") {
      this.readStdout(sessionName, generation, stdout);
    }

    // Pipe stderr to log file
    const stderr = proc.stderr;
    if (stderr && typeof stderr !== "number") {
      const stderrLogPath = join(this.runDir, "claude-stderr", `${sessionName}.log`);
      void pipeStderrToFile(stderr, stderrLogPath);
    }

    // Monitor process exit
    void proc.exited.then((code) => {
      console.log(`[claude] process exited with code ${code}: ${sessionName}`);
      if (this.isCurrentGeneration(sessionName, generation)) {
        // 进程死亡(崩溃/被杀;close 主动路径已先发 closed 并 delete,此处守卫为 false
        // 不会重复)→ turn 必死,补 error 信号,否则 working/blocked 卡死到重启(review P1-1)。
        // 须在 processes.delete 前:applyStatusSignal 读 proc state 且要向仍存活的 relay 广播。
        this.applyStatusSignal(sessionName, { kind: "turn_result", isError: true });
        this.processes.delete(sessionName);
        this.autoRetry.destroySession(sessionName);
        this.onApprovalRuntimeSettled?.(sessionName);
      }
    });

    // 队列重物化尾钩（#11 重启恢复）：非 fork 才恢复（fork 换新对话面，旧队列的
    // claudeSessionId 对照面失效；rollbackConversation 开头另有显式清盘）。
    if (!fork) {
      this.recoverSessionQueue(sessionName, sessionId, projectPath, claudeSessionId);
    }
  }

  /**
   * 构造 MCP hub 注入的 argv 片段(--mcp-config inline JSON)。
   * mcpPort 未配置(0/undefined)或 injector 不可用 → 返回 [],agent 不连 hub(降级,不阻塞 spawn)。
   * ClaudeRuntime 是 claude 专用,provider 恒为 claude;injector 注册表供未来 CodexRuntime 复用。
   */
  private buildMcpArgs(projectName: string, sessionId?: string): string[] {
    if (!this.mcpPort || projectName.length === 0) return [];
    const profile = getAgentProviderProfile("claude");
    if (!profile) return [];
    const injector = buildMcpInjectorForProvider(profile);
    if (!injector) return [];
    const config = injector.buildMcpConfig({
      project: projectName,
      mcpPort: this.mcpPort,
      sessionId,
    });
    return config?.args ?? [];
  }

  private spawnClaudeDirect(
    sessionName: string,
    projectPath: string,
    claudeSessionId?: string,
    resume = false,
    model?: string,
    permissionMode?: string,
    effort?: EffortLevel,
    provider?: { apiKey: string; baseUrl?: string },
    view?: ModelMappingView,
    mcpArgs: string[] = [],
    fork?: { resumeAt: string },
  ): BunSubprocess {
    // --model 存量脏值闸：state.model 可能残留旧版 echo 解析进来的显示串（code span
    // 反引号 / (resolved) 注解），直接透传会让 CLI 拿它当模型名请求 → 网关 422。
    // sanitize 恢复不出合法 model 名时不传 --model（CLI 回落自身默认）。
    const safeModel = sanitizePersistedModel(model);
    const args = [
      "claude",
      "--output-format",
      "stream-json",
      "--input-format",
      "stream-json",
      "--verbose",
      "--permission-prompt-tool",
      "stdio",
      ...(permissionMode ? ["--permission-mode", permissionMode] : []),
      ...(safeModel ? ["--model", safeModel] : []),
      // JSONL 存在 = --resume 接续;不存在 = --session-id 全新钉 id(双模式,spawnAndStart
      // 判定)。未钉 claudeSessionId 的存量路径两者都不带(CLI 自生成 id,system.init 捕获)。
      // fork 回滚：--resume-session-at 语义 = messages.slice(0, index+1) 含锚消息 → 锚必须
      // 是「上一条消息」（上一 turn endUuid）；--fork-session 保留新 id，旧 JSONL 留 orphan
      //（CLI 自身 /rewind 同语义，print.ts/sessionRestore.ts 源码核实）。
      ...(claudeSessionId
        ? fork
          ? ["--resume", claudeSessionId, "--resume-session-at", fork.resumeAt, "--fork-session"]
          : resume
            ? ["--resume", claudeSessionId]
            : ["--session-id", claudeSessionId]
        : []),
      ...mcpArgs,
    ];

    const proc = Bun.spawn({
      cmd: args,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
      cwd: projectPath,
      env: buildSpawnEnv(effort, provider, process.env, view),
    });

    console.log(
      `[claude] spawned pid=${proc.pid} session=${sessionName} effort=${effort ?? "inherit"} provider=${provider?.apiKey ? "injected" : "inherit"}`,
    );
    return proc;
  }

  /** TUI 形态 spawn 输入（双模式编排用，agent-tui 调）：argv 全来自会话 metadata + env
   *  值集与 GUI headless spawn 单源一致（buildAgentEnvOverrides）。env 由调用方经
   *  tmux -e 注入 pane 真 environ——CLI env 消费视图建立在 spawn 时刻快照键集合上，
   *  settings 文件 env 载体对分类器不可见（2026-11-25 臂1 实锤后撤，见
   *  buildAgentEnvOverrides 注释）。审批让位 = argv 不带 --permission-prompt-tool。
   *  模型别名查表出规范名（与 headless spawn 同源映射，消 CLI 自身别名表的网关 422 面）；
   *  effort 缺省回落 settings 默认（resolveSpawnInputs 同源）。 */
  async resolveTuiSpawn(metadata: {
    /** ar 会话 id（admin 审批卡 origin 身份）；缺省 URL 不带 ?origin=。 */
    id?: string;
    projectName: string;
    projectPath: string;
    claudeSessionId?: string;
    modelAlias?: string;
    model?: string;
    permissionMode?: string;
    effort?: EffortLevel;
    /** hooks settings 文件路径（agent-tui 传入）；缺省不传 --settings。 */
    settingsPath?: string;
  }): Promise<{ args: string[]; env: Record<string, string> }> {
    if (!metadata.claudeSessionId) {
      throw new Error("TUI mode requires a pinned claudeSessionId");
    }
    const { resolvedEffort, view, providerCreds } = await this.resolveSpawnInputs(
      metadata.modelAlias ?? metadata.model,
      metadata.effort,
    );
    const resolvedAliases = view ? buildAvailableAliases(view).resolved : undefined;
    const rawModel = sanitizePersistedModel(metadata.modelAlias ?? metadata.model);
    const model = rawModel ? (resolvedAliases?.[rawModel] ?? rawModel) : undefined;
    return {
      args: buildTuiSpawnArgs({
        claudeSessionId: metadata.claudeSessionId,
        resume: existsSync(claudeJsonlPath(metadata.projectPath, metadata.claudeSessionId)),
        model,
        permissionMode: metadata.permissionMode,
        effort: resolvedEffort,
        settingsPath: metadata.settingsPath,
        mcpArgs: this.buildMcpArgs(metadata.projectName, metadata.id),
      }),
      // 与 GUI headless spawn 同一套 env 值集（buildAgentEnvOverrides 单源）——TUI 曾零
      // env 注入，分类器兜底落 gateway 缺省表 opus-4-7 → 网关不路由 → auto mode 每步
      // 退回人工审批（2026-11-25 bundle + /proc environ 双实锤）。
      env: buildAgentEnvOverrides(providerCreds, view),
    };
  }

  private async resolveSpawnInputs(
    model: string | undefined,
    effort: EffortLevel | undefined,
  ): Promise<{
    resolvedModel: string | undefined;
    resolvedEffort: EffortLevel | undefined;
    providerCreds: { apiKey: string; baseUrl?: string } | undefined;
    view: ModelMappingView | undefined;
  }> {
    const settings = this.settingsStore
      ? await this.settingsStore.read().catch((err) => {
          console.warn("[claude] settings read failed, falling back to inherited env:", err);
          return undefined;
        })
      : undefined;
    const claude = settings?.runtimes.claude;
    const view = claude ? activePresetView(claude, claude.presets) : undefined;
    return {
      resolvedModel: model,
      resolvedEffort: effort ?? claude?.effort,
      providerCreds: resolveActivePresetCreds(claude, claude?.presets),
      view,
    };
  }

  private async readStdout(
    sessionName: string,
    generation: number,
    stdout: ReadableStream,
  ): Promise<void> {
    const decoder = new TextDecoder();
    let leftover = "";
    const reader = stdout.getReader();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!this.isCurrentGeneration(sessionName, generation)) return;

        const chunk = value as Uint8Array;
        const text = decoder.decode(chunk, { stream: true });
        const lines = (leftover + text).split("\n");
        leftover = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          if (!this.isCurrentGeneration(sessionName, generation)) return;

          await this.processStdoutLine(sessionName, generation, trimmed);
        }
      }

      const trimmed = leftover.trim();
      if (trimmed && this.isCurrentGeneration(sessionName, generation)) {
        await this.processStdoutLine(sessionName, generation, trimmed);
      }
    } catch (error) {
      if (this.isCurrentGeneration(sessionName, generation)) {
        const relay = this.relays.get(sessionName);
        if (relay && !relay.isDestroyed) {
          relay.reportError(error instanceof Error ? error : new Error(String(error)));
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private isCurrentGeneration(sessionName: string, generation: number): boolean {
    return this.processes.get(sessionName)?.generation === generation;
  }

  // Parse each stdout line ONCE and feed the parsed object to all three consumers
  // (system-init capture, permissionMode capture, relay). Previously each line was
  // JSON.parsed three times — once per consumer. Callers have already verified the
  // generation is current before invoking.
  private async processStdoutLine(
    sessionName: string,
    generation: number,
    trimmed: string,
  ): Promise<void> {
    let parsed: Record<string, unknown> | null;
    try {
      parsed = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      parsed = null;
    }
    this.captureSystemInitFromLine(sessionName, parsed);
    this.capturePermissionModeFromLine(sessionName, parsed);
    this.captureModelFromLine(sessionName, parsed);
    this.captureSkillReloadFromLine(sessionName, parsed);
    this.captureContextUsageFromLine(sessionName, parsed);
    this.captureControlResponseFromLine(sessionName, parsed);
    if (parsed?.type === "result") this.refreshContextUsageFromControl(sessionName);
    this.captureApprovalRequestFromLine(sessionName, parsed);
    this.captureApprovalSettledFromLine(sessionName, parsed);
    this.captureTurnActivityFromLine(sessionName, parsed);
    // checkpoint 截断锚采集：stdout 每条带 uuid 的真实消息（live echo 不经此处，无
    // synthetic 污染）。result 帧无 uuid 不影响——锚取最后一个带 uuid 的。
    if (typeof parsed?.uuid === "string" && parsed.uuid.length > 0) {
      this.turnCheckpointer?.noteOutputUuid(sessionName, parsed.uuid);
    }
    this.captureTurnResultFromLine(sessionName, parsed);
    this.autoRetry.handleStdoutLine(
      sessionName,
      this.processes.get(sessionName)?.sessionId ?? "",
      parsed,
    );
    console.log(`[claude-stdout] ${trimmed}`);
    const relay = this.relays.get(sessionName);
    if (relay && !relay.isDestroyed && this.isCurrentGeneration(sessionName, generation)) {
      await relay.handleStdoutLine(trimmed, parsed);
    }
    // 真实新 stdout 行 = session 活动 → bump updatedAt（下沉到此：回放不经 processStdoutLine，
    // 故重连/回放不会误刷新）。sessionId 在 runtime 内从 processes 解析，与 onSystemInit 同契约。
    const state = this.processes.get(sessionName);
    if (state?.sessionId) {
      this.onActivity?.(state.sessionId);
    }
  }

  private captureSystemInitFromLine(
    sessionName: string,
    parsed: Record<string, unknown> | null,
  ): void {
    if (
      parsed &&
      parsed.type === "system" &&
      parsed.subtype === "init" &&
      typeof parsed.session_id === "string"
    ) {
      const state = this.processes.get(sessionName);
      const relay = this.relays.get(sessionName);
      if (state) {
        if (state.pendingFork) {
          // fork 完成：CLI 已把截断后的对话写入新 JSONL（system.init 前完成写入）→
          // 回填新 id + relay 重读 history 段（回滚编排等此信号后才关 WS，重连发生在
          // reload 之后）。无条件消费 pendingFork——id 与旧值相同也不能让等待方空等超时。
          state.pendingFork = false;
          state.claudeSessionId = parsed.session_id;
          relay?.reloadHistory(state.projectPath, parsed.session_id);
          this.forkWaiters.get(sessionName)?.();
          this.forkWaiters.delete(sessionName);
        } else if (!state.claudeSessionId) {
          state.claudeSessionId = parsed.session_id;
        }
        if (typeof parsed.model === "string") state.model = parsed.model;
        if (typeof parsed.permissionMode === "string") state.permissionMode = parsed.permissionMode;
      }
      this.onSystemInit?.(
        state?.sessionId ?? "",
        sessionName,
        parsed.session_id,
        typeof parsed.model === "string" ? parsed.model : "unknown",
      );
    }
  }

  // 审批中心登记点（M5-b §6.4）：真实 stdout 的 can_use_tool control_request。set_model 等
  // 客户端发起的控制请求不走审批中心。本函数只在真实新 stdout 行入口（processStdoutLine）
  // 被调，relay 回放不经过 → 重连/回放不会误登记。
  private captureApprovalRequestFromLine(
    sessionName: string,
    parsed: Record<string, unknown> | null,
  ): void {
    if (!parsed || parsed.type !== "control_request" || typeof parsed.request_id !== "string") {
      return;
    }
    const request = parsed.request as ClaudeControlRequest["request"] | undefined;
    // input 为 null 时 typeof 仍返回 "object"，须显式排除（否则 registry 摘要处 TypeError
    // 会炸掉整条 stdout reader——reviewer P2）。
    if (
      !request ||
      request.subtype !== "can_use_tool" ||
      !request.input ||
      typeof request.input !== "object"
    ) {
      return;
    }
    const state = this.processes.get(sessionName);
    if (!state) return;
    // 与 ApprovalRegistry 同一采集点登记 blocked(等审批):同一行源,非第二条管道。
    this.applyStatusSignal(sessionName, { kind: "approval_requested" });
    this.onApprovalRequest?.(
      { runtimeKey: sessionName, projectName: state.projectName, sessionId: state.sessionId },
      {
        type: "control_request",
        request_id: parsed.request_id,
        request,
      },
    );
  }

  // result 帧 = turn 收口：该 runtime 的 pending 审批全部作废（如 interrupt 打断未决审批）。
  private captureApprovalSettledFromLine(
    sessionName: string,
    parsed: Record<string, unknown> | null,
  ): void {
    if (parsed?.type === "result") this.onApprovalRuntimeSettled?.(sessionName);
  }

  // CLI 自启 turn 的活跃证据：task-notification 消费/subagent hand-back 等开的新 turn
  // 不经过我们 stdin（无 user_input 信号），error/done 滞留由 assistant 帧翻回 working
  // （对齐客户端 computeRunningCount 的 turn 口径）。复用 isNormalAssistantLine
  // （auto-retry 同源判定：排除 synthetic/isApiErrorMessage/error 帧）。
  private captureTurnActivityFromLine(
    sessionName: string,
    parsed: Record<string, unknown> | null,
  ): void {
    if (isNormalAssistantLine(parsed)) {
      this.applyStatusSignal(sessionName, { kind: "turn_activity" });
    }
  }

  // result 帧 = turn 边界：迁移 done/error(状态机)。放 captureApprovalSettledFromLine
  // 之后——同帧先 settled 回 working、再被 done-result 覆盖,最终态正确。
  // interrupt armed 残留窗口内短路：ack 已以 turn_interrupted 收口（done），CLI 迟到的
  // result{error_during_execution} 是机械分类不是用户可感知错误，不再迁移（done→error
  // 弹红）。endTurn 已在 ack 时收口，这里无需重复（endTurn 幂等，重复也 no-op）。
  // 窗口外 armed 懒惰清除后走原逻辑。复用 isErrorResultLine（auto-retry 同源判定，
  // 单一代码路径）。
  private captureTurnResultFromLine(
    sessionName: string,
    parsed: Record<string, unknown> | null,
  ): void {
    if (parsed?.type !== "result") return;
    const armed = this.pendingInterrupts.get(sessionName);
    if (armed) {
      this.pendingInterrupts.delete(sessionName);
      if (Date.now() - armed.at < INTERRUPT_ARMED_WINDOW_MS) return;
    }
    const isError = isErrorResultLine(parsed);
    this.applyStatusSignal(sessionName, {
      kind: "turn_result",
      isError,
    });
    // endpoint 捕获 fire-and-forget：失败/超时只降级（本轮无快照），不影响状态机。
    void this.turnCheckpointer?.endTurn(sessionName, isError).catch(() => undefined);
  }

  // Fold current permissionMode from live stdout so the replay seed init carries
  // the CURRENT mode (system.init is spawn-time; permission-mode/system.status
  // messages update it mid-session). See docs/design-v1/message-replay.md. The same
  // signal also persists the switch to metadata.permissionMode via
  // onPermissionModeChange, so an API restart (--resume) spawns the CLI with
  // the switched mode. Symmetric to captureModelFromLine.
  private capturePermissionModeFromLine(
    sessionName: string,
    parsed: Record<string, unknown> | null,
  ): void {
    if (!parsed) return;
    let next: string | undefined;
    if (parsed.type === "permission-mode" && typeof parsed.permissionMode === "string") {
      next = parsed.permissionMode;
    } else if (
      parsed.type === "system" &&
      parsed.subtype === "status" &&
      typeof parsed.permissionMode === "string"
    ) {
      next = parsed.permissionMode;
    }
    if (!next) return;
    const state = this.processes.get(sessionName);
    if (!state) return;
    state.permissionMode = next;
    this.onPermissionModeChange?.(state.sessionId, next);
  }

  // Fold current model from live stdout so the replay seed init carries the
  // CURRENT model. In-process model switches (control_request{set_model}) emit
  // a <local-command-stdout>Set model to … (id)</local-command-stdout> echo but
  // never re-send system.init; without this fold state.model stays at the
  // spawn-time value and reconnect seeds a stale model. Symmetric to
  // capturePermissionModeFromLine above. The same signal also persists the
  // switch to metadata.model via onModelChange, so API restart / session
  // reopen spawn the CLI with the switched model.
  private captureModelFromLine(sessionName: string, parsed: Record<string, unknown> | null): void {
    const next = extractModelFromStdoutLine(parsed);
    if (!next) return;
    const state = this.processes.get(sessionName);
    if (!state) return;
    state.model = next;
    state.modelAlias = next;
    // 模型切换可能改窗口档位（切 [1m] 变体）：用新 model + spawn 时映射重算。窗口
    // 变化且已有 usage 标量时立即补发一帧——切完模型可能长时间无新 assistant 消息，
    // 等下一条 usage 帧才纠正的话在线前端百分比/档位一直按旧窗口算（1M 会话按 200k
    // 显示 86% danger，实际 17%）。
    const nextWindow = resolveContextWindow(next, state.resolvedAliases);
    if (nextWindow !== state.contextWindow) {
      state.contextWindow = nextWindow;
      const relay = this.relays.get(sessionName);
      if (relay && !relay.isDestroyed && state.contextUsage) {
        relay.injectLine(
          JSON.stringify({
            type: "system",
            subtype: "context_usage",
            ...state.contextUsage,
            contextWindow: nextWindow,
          }),
        );
      }
    }
    this.onModelChange?.(state.sessionId, next);
  }

  // Fold a successful /reload-skills echo into a catalog-refresh notification.
  // Unlike model/permissionMode the catalog is not a process scalar (it's
  // filesystem-scanned), so this stores nothing on state — it only fires
  // onSkillReload so index.ts re-scans + broadcasts skill_catalog_changed.
  // Symmetric to captureModelFromLine above. historyLines (JSONL replay) never
  // reaches processStdoutLine, so this fires only on live stdout — reconnects
  // refresh via REST instead.
  private captureSkillReloadFromLine(
    sessionName: string,
    parsed: Record<string, unknown> | null,
  ): void {
    if (!extractSkillReloadFromStdoutLine(parsed)) return;
    const state = this.processes.get(sessionName);
    if (!state) return;
    this.onSkillReload?.(sessionName);
  }

  // Fold the context-token scalar from live assistant usage. Unlike model this
  // has no metadata persistence (nothing downstream spawns with it — it is
  // display state): it lives on proc state and re-enters replay via
  // buildSeedInitLine's contextUsage. On change, broadcast a synthetic
  // context_usage frame via relay.injectLine (broadcast-only, skill_catalog
  // 同款 — never buffered; seed_init re-carries the durable value on
  // reconnect). Fold BEFORE relay.handleStdoutLine so the broadcast ordering
  // matches captureModelFromLine's position in processStdoutLine. When the
  // relay does not exist yet (spawn before first stream()), the fold still
  // lands in proc state and the seed carries it on the first subscribe.
  // 服务端主动发起 get_context_usage 控制请求（与客户端 set_model 同一条 stdin/stdout
  // 控制通道，CLI 应答经 stdout 回来由 captureControlResponseFromLine 结算）。不走
  // write()——那会 cancelPending 自动重试，而这不是用户输入，直写 stdin 绕开。
  async getContextUsage(sessionName: string): Promise<ContextUsageControlResult | undefined> {
    const proc = this.processes.get(sessionName);
    if (!proc || proc.proc.exitCode !== null) return undefined;
    const stdin = proc.proc.stdin;
    if (typeof stdin === "number" || !stdin) return undefined;
    const requestId = `ctx-usage-${randomUUID()}`;
    const promise = new Promise<ContextUsageControlResult | undefined>((resolve) => {
      const timer = setTimeout(() => {
        if (this.contextUsageWaiters.delete(requestId)) resolve(undefined);
      }, CONTEXT_USAGE_CONTROL_TIMEOUT_MS);
      this.contextUsageWaiters.set(requestId, { resolve, timer });
    });
    try {
      stdin.write(
        `${JSON.stringify({
          type: "control_request",
          request_id: requestId,
          request: { subtype: "get_context_usage", detail: "summary" },
        })}\n`,
      );
    } catch {
      this.contextUsageWaiters.delete(requestId);
      return undefined;
    }
    return promise;
  }

  // stdout 的 control_response 结算：两路——①本类发起的 get_context_usage（waiter 匹配）；
  // ②用户打断的 interrupt ack（pendingInterrupts 匹配 + success）：即以 turn_interrupted
  // 收口状态（done 非 error）+ endTurn 释放 checkpoint。客户端发起的其它控制请求
  // （set_model 等）两路都不命中，安全 no-op。
  private captureControlResponseFromLine(
    sessionName: string,
    parsed: Record<string, unknown> | null,
  ): void {
    if (!parsed || parsed.type !== "control_response") return;
    const response = parsed.response as { request_id?: unknown; subtype?: unknown } | undefined;
    const requestId = response?.request_id;
    if (typeof requestId !== "string") return;
    const interrupt = this.pendingInterrupts.get(sessionName);
    if (interrupt && interrupt.requestId === requestId && response?.subtype === "success") {
      // 打断收口（T3 #2「interrupt ack ≠ 终态」的正向应用：ack 是权威信号本身——ack 即
      // 收口状态（done）+ endTurn 释放 checkpoint）。armed 去留按 flavor 与真实打断面：
      // ① cancel_queued（M2 停止入口全走此 flavor）：探针实证 CLI 不发 result——无迟到
      //   result 可短路，armed 立即摘除，否则 30s 窗口内后续自然 turn 的 result 被误吞
      //  （review P1-1：status 卡 working / checkpoint 不收口的悬挂复发）。
      // ② plain interrupt 打断了 working/blocked turn：CLI 必发 result{error_during_
      //   execution}（M1 实锤），保留 armed（时刻重置为 ack）短路它——用户打断 ≠ error。
      // ③ plain interrupt 但未打断任何 turn（idle）：无 result 将至，同理不留 armed。
      const state = this.processes.get(sessionName);
      const wasTurnActive =
        state?.sessionStatus === "working" || state?.sessionStatus === "blocked";
      this.applyStatusSignal(sessionName, { kind: "turn_interrupted" });
      if (interrupt.cancelQueued || !wasTurnActive) {
        this.pendingInterrupts.delete(sessionName);
      } else {
        interrupt.at = Date.now();
      }
      // endTurn 幂等（inFlight 无则 no-op）；isError=false = 用户打断是正常收尾。
      void this.turnCheckpointer?.endTurn(sessionName, false).catch(() => undefined);
      return;
    }
    const waiter = this.contextUsageWaiters.get(requestId);
    if (!waiter) return;
    this.contextUsageWaiters.delete(requestId);
    clearTimeout(waiter.timer);
    waiter.resolve(extractContextUsageFromControlResponse(parsed));
  }

  // turn 结束（result 帧）权威刷新：流式 usage 折算会被网关占位行污染（extract 已过滤
  // 兜底），且分母是模型裸窗口推断；CLI 应答是权威口径（totalTokens/maxTokens）。
  // 异步补发控制请求，成功则覆盖 contextTokens/contextWindow 并广播。明细四行保留折算
  // 值（summary 应答不带 usage 明细）。
  private refreshContextUsageFromControl(sessionName: string): void {
    void this.getContextUsage(sessionName).then((control) => {
      if (!control) return;
      const state = this.processes.get(sessionName);
      if (!state) return;
      const detail = state.contextUsage;
      const next = {
        contextTokens: control.contextTokens,
        inputTokens: detail?.inputTokens ?? 0,
        cacheCreationTokens: detail?.cacheCreationTokens ?? 0,
        cacheReadTokens: detail?.cacheReadTokens ?? 0,
        outputTokens: detail?.outputTokens ?? 0,
        ...(control.categories ? { categories: control.categories } : {}),
      };
      // 三元去重：tokens/window/分类任一变化都要广播（窗口独变、分类首次到达同理）。
      const categoriesUnchanged =
        JSON.stringify(state.contextUsage?.categories ?? null) ===
        JSON.stringify(next.categories ?? null);
      if (
        state.contextUsage?.contextTokens === next.contextTokens &&
        state.contextWindow === control.contextWindow &&
        categoriesUnchanged
      ) {
        return;
      }
      state.contextUsage = next;
      state.contextWindow = control.contextWindow;
      const relay = this.relays.get(sessionName);
      if (relay && !relay.isDestroyed) {
        relay.injectLine(
          JSON.stringify({
            type: "system",
            subtype: "context_usage",
            ...next,
            contextWindow: control.contextWindow,
          }),
        );
      }
    });
  }

  private captureContextUsageFromLine(
    sessionName: string,
    parsed: Record<string, unknown> | null,
  ): void {
    const next = extractContextUsageFromStdoutLine(parsed);
    if (next === undefined) return;
    const state = this.processes.get(sessionName);
    if (!state) return;
    if (state.contextUsage?.contextTokens === next.contextTokens) return;
    state.contextUsage = next;
    const relay = this.relays.get(sessionName);
    if (relay && !relay.isDestroyed) {
      relay.injectLine(
        JSON.stringify({
          type: "system",
          subtype: "context_usage",
          ...next,
          contextWindow: state.contextWindow,
        }),
      );
    }
  }
}

async function pipeStderrToFile(stderr: ReadableStream, logPath: string): Promise<void> {
  try {
    await mkdir(dirname(logPath), { recursive: true });
  } catch {
    // dir might already exist
  }

  const decoder = new TextDecoder();
  const reader = stderr.getReader();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value as Uint8Array;
      buffer += decoder.decode(chunk, { stream: true });
      if (buffer.length > 8192) {
        await appendFile(logPath, buffer).catch(() => {});
        buffer = "";
      }
    }
    if (buffer) await appendFile(logPath, buffer).catch(() => {});
  } finally {
    reader.releaseLock();
  }
}
