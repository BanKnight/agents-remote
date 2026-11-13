import type {
  AgentProvider,
  AgentProviderCapabilities,
  AgentProviderInfo,
  AgentProviderTransport,
  ClaudePermissionMode,
} from "@agents-remote/shared";

/** transport=acp 的 provider：spawn env 凭据注入声明（CLI 固有属性，非用户配置）。
 *  env 变量名随 CLI 而异（omp 消费 ANTHROPIC_*；其它 ACP CLI 各有自家 env），是共性
 *  注入机制与 per-CLI 差异之间唯一的声明点。凭据 provider 平权：各 agent 只消费自己的
 *  settings 切片，切片全空回落 agent 自身凭证链，不借用其它 runtime 的配置。 */
export type AgentProviderCredentialsSpec = {
  env: { apiKey: string; baseUrl?: string };
};

export type AgentProviderProfile = {
  provider: AgentProvider;
  /** 协议/传输家族——分流点判定用（非 CLI 名）。类型定义在 shared（web 枚举投影消费）。 */
  transport: AgentProviderTransport;
  label: string;
  command: string;
  displayNamePrefix: string;
  /** 能力声明（类型单源在 shared：api profile 填写 → /api/agent-providers 投影 → web 消费；
   *  UI/orchestration 只看能力不看 provider 名）。 */
  capabilities: AgentProviderCapabilities;
  credentials?: AgentProviderCredentialsSpec;
  availableModels?: string[];
  permissionModes?: ClaudePermissionMode[];
};

// `claude --help` 列出的 `--permission-mode` choices —— CLI 当前实际支持、用户可主动切换的
// 权限模式。spawn 成功时解析得到的也是这组；spawn 失败时作 fallback。只维护这一套内容：
// 硬编码权威列表 = CLI choices，spawn 只为跟上未来 CLI 版本变化。
// `default` 不在此列：它是 auto/plan 退出后 CLI 回到的"标准模式"（隐含值，非用户主动选项），
// 由 auto_mode_exit 自动切回，不出现在 mode 选择菜单。
const CLAUDE_PERMISSION_MODES: ClaudePermissionMode[] = [
  "acceptEdits",
  "auto",
  "bypassPermissions",
  "manual",
  "dontAsk",
  "plan",
];

// 进程内缓存：api 启动时（index.ts）的首次调用预热，之后所有 detail GET 命中缓存，
// 避免每次进 claude session 都 spawn `claude --help`（实测 ~700ms）。7397bd4 起声明了
// 缓存变量却从未赋值，导致每次 detail GET 重复 spawn；此赋值修复该空赋值 bug。
let cachedPermissionModes: ClaudePermissionMode[] | null = null;

// 纯函数：从 `claude --help` 输出解析 `--permission-mode` 的 choices。choices 跨多行
// （`(choices: "a",\n "b")`），正则 `[^)]+` 跨行匹配。无 match / 空 → undefined（调用方回退）。
export function parsePermissionModeChoices(helpText: string): ClaudePermissionMode[] | undefined {
  const match = helpText.match(/--permission-mode[^(]*\(choices:\s*([^)]+)\)/);
  if (!match) return undefined;
  const choices = match[1]
    .split(",")
    .map((s) => s.trim().replace(/^"|"$/g, ""))
    .filter(Boolean) as ClaudePermissionMode[];
  return choices.length > 0 ? choices : undefined;
}

export async function parseClaudePermissionModes(): Promise<ClaudePermissionMode[]> {
  if (cachedPermissionModes) return cachedPermissionModes;

  let result: ClaudePermissionMode[] = CLAUDE_PERMISSION_MODES;
  try {
    const proc = Bun.spawn({
      cmd: ["claude", "--help"],
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = await new Response(proc.stdout).text();
    await proc.exited;

    const choices = parsePermissionModeChoices(output);
    if (choices) result = choices;
  } catch {
    // spawn 失败：claude 可能临时不可用，不缓存，下次调用重试自愈。
    return CLAUDE_PERMISSION_MODES;
  }
  // spawn 成功（解析出 choices 或回退）：进程生命周期内 CLI --help 输出不变，缓存。
  cachedPermissionModes = result;
  return result;
}

// 一代 claude（历史 tmux 直拉）已被二代实现取代（直拉 CLI + native history），协议层
// AgentProvider 不再含一代；"claude" 统一指向二代 Claude runtime。
// 顺序即 /api/agent-providers 投影序 = 创建菜单行序（web 注册表驱动消费）：claude → omp →
// codex，对齐新建实例原型行序（§6.12j）。
const profiles: Record<AgentProvider, AgentProviderProfile> = {
  claude: {
    provider: "claude",
    transport: "claude",
    label: "Claude",
    command: "claude",
    displayNamePrefix: "Claude Agent",
    capabilities: {
      history: "native",
      mcpInject: "native",
      // 双模式（2026-10-15）：chat ↔ terminal 经 claudeSessionId --resume 接力。
      modes: { dualMode: "native", terminalResumeId: "claudeSessionId" },
      // 审批中心原生 request id 通道；ExitPlanMode/AskUserQuestion 两族复杂卡需完整语义
      // （isOneClickApprovable 排除）→ partial。
      approvals: { center: "native", oneClick: "partial" },
      // 注入桥走 headless stdin（ClaudeRuntime AutoRetryWatch）。
      autoRetry: "native",
      // switchModel/switchPermissionMode 走 control 通道即时切换；effort 仅 claude 有。
      configSwitch: "immediate",
    },
    // Claude Code standard model aliases — portable tier identifiers that the
    // CLI resolves to the latest model version at runtime.
    availableModels: ["sonnet", "opus", "haiku"],
  },
  // omp（Oh My Pi CLI）：走 ACP 协议对接（transport "acp"，`omp acp` 子命令）。ACP 是协议
  // 家族而非 provider——未来接其它 ACP CLI 各加一条 profile（transport 同为 "acp"），
  // transport 层实现（AcpRuntime/流式帧/前端面板）共享。Phase 2 再做 settings 预设/
  // 自定义 command。history "native"：omp 广告 loadSession:true（session/load 全量回放），
  // 跨 API 重启可恢复。credentials：omp 原生消费 ANTHROPIC_*（anthropic 形态，非官方
  // baseUrl 自动 Authorization: Bearer <key>）；切片未配置时不注入，回落 omp 自身凭证链
  // （OAuth → login key → env → stored api_key）。
  omp: {
    provider: "omp",
    transport: "acp",
    label: "omp",
    command: "omp",
    displayNamePrefix: "OMP Agent",
    capabilities: {
      history: "native",
      mcpInject: "unsupported", // ACP transport 无 spawn argv 注入通道。
      modes: { dualMode: "unsupported" }, // 仅 chat（ACP 会话无 tmux TUI 形态）。
      approvals: { center: "unsupported", oneClick: "partial" }, // requestPermission 自动 allow，无审批面。
      autoRetry: "unsupported", // 无 headless stdin 注入桥。
      configSwitch: "advertised", // ACP configOptions 自述能力。
    },
    credentials: {
      env: { apiKey: "ANTHROPIC_API_KEY", baseUrl: "ANTHROPIC_BASE_URL" },
    },
  },
  codex: {
    provider: "codex",
    transport: "codex",
    label: "Codex",
    command: "codex",
    displayNamePrefix: "Codex Agent",
    capabilities: {
      // 历史 = rollout JSONL 扫描列表（codex-history.ts）+ thread/resume 回放（批 F）。
      history: "native",
      // `-c mcp_servers.ar-hub.url=` TOML 覆盖（批 E，探针 E1 实证 0.163 真连上）。
      mcpInject: "native",
      // 双模式（批次 C）：有 threadId 的会话可切 terminal（tmux `codex resume`）。
      modes: { dualMode: "native", terminalResumeId: "codexThreadId" },
      // app-server 原生 request id；两族审批均可一键（无 ExitPlanMode/AskUserQuestion）。
      approvals: { center: "native", oneClick: "all" },
      autoRetry: "native",
      // switchModel 经 turn/start 覆盖——下一轮生效。
      configSwitch: "nextTurn",
    },
  },
};

export const getAgentProviderProfile = (provider: AgentProvider | undefined) => {
  if (!provider) {
    return undefined;
  }

  return profiles[provider];
};

/** GET /api/agent-providers 投影：注册表 → 只读 UI 信息（不含 command；credentials 声明
 *  平铺成 credentialsEnv 供凭据表单 hint 与 per-provider 渲染）。 */
export const listAgentProviderInfo = (): AgentProviderInfo[] =>
  Object.values(profiles).map((p) => ({
    provider: p.provider,
    label: p.label,
    transport: p.transport,
    displayNamePrefix: p.displayNamePrefix,
    capabilities: p.capabilities,
    ...(p.credentials
      ? {
          credentialsEnv: {
            apiKeyEnv: p.credentials.env.apiKey,
            ...(p.credentials.env.baseUrl ? { baseUrlEnv: p.credentials.env.baseUrl } : {}),
          },
        }
      : {}),
  }));
