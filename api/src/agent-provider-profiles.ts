import type { AgentProvider, Claude2PermissionMode } from "@agents-remote/shared";

export type AgentProviderProfile = {
  provider: AgentProvider;
  label: string;
  command: string;
  displayNamePrefix: string;
  capabilities: {
    history: "unsupported" | "native";
  };
  availableModels?: string[];
  permissionModes?: Claude2PermissionMode[];
};

const readClaude2Models = (): string[] => {
  const env = (process.env.CLAUDE2_MODELS ?? "").trim();
  if (env.length > 0)
    return env
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean);
  // Claude Code standard model aliases — these are the portable tier identifiers
  // that Claude CLI resolves to the latest model version at runtime.
  return ["sonnet", "opus", "haiku"];
};

// `claude --help` 列出的 `--permission-mode` choices —— CLI 当前实际支持、用户可主动切换的
// 权限模式。spawn 成功时解析得到的也是这组；spawn 失败时作 fallback。只维护这一套内容：
// 硬编码权威列表 = CLI choices，spawn 只为跟上未来 CLI 版本变化。
// `default` 不在此列：它是 auto/plan 退出后 CLI 回到的"标准模式"（隐含值，非用户主动选项），
// 由 auto_mode_exit 自动切回，不出现在 mode 选择菜单。
const CLAUDE_PERMISSION_MODES: Claude2PermissionMode[] = [
  "acceptEdits",
  "auto",
  "bypassPermissions",
  "manual",
  "dontAsk",
  "plan",
];

// 进程内缓存：api 启动时（index.ts）的首次调用预热，之后所有 detail GET 命中缓存，
// 避免每次进 claude2 session 都 spawn `claude --help`（实测 ~700ms）。7397bd4 起声明了
// 缓存变量却从未赋值，导致每次 detail GET 重复 spawn；此赋值修复该空赋值 bug。
let cachedPermissionModes: Claude2PermissionMode[] | null = null;

// 纯函数：从 `claude --help` 输出解析 `--permission-mode` 的 choices。choices 跨多行
// （`(choices: "a",\n "b")`），正则 `[^)]+` 跨行匹配。无 match / 空 → undefined（调用方回退）。
export function parsePermissionModeChoices(helpText: string): Claude2PermissionMode[] | undefined {
  const match = helpText.match(/--permission-mode[^(]*\(choices:\s*([^)]+)\)/);
  if (!match) return undefined;
  const choices = match[1]
    .split(",")
    .map((s) => s.trim().replace(/^"|"$/g, ""))
    .filter(Boolean) as Claude2PermissionMode[];
  return choices.length > 0 ? choices : undefined;
}

export async function parseClaudePermissionModes(): Promise<Claude2PermissionMode[]> {
  if (cachedPermissionModes) return cachedPermissionModes;

  let result: Claude2PermissionMode[] = CLAUDE_PERMISSION_MODES;
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

const profiles: Record<AgentProvider, AgentProviderProfile> = {
  claude: {
    provider: "claude",
    label: "Claude",
    command: "claude",
    displayNamePrefix: "Claude Agent",
    capabilities: {
      history: "unsupported",
    },
  },
  codex: {
    provider: "codex",
    label: "Codex",
    command: "codex",
    displayNamePrefix: "Codex Agent",
    capabilities: {
      history: "unsupported",
    },
  },
  claude2: {
    provider: "claude2",
    // 对外正式名统一 "Claude"（二代实现已取代一代）；"claude2" 只是协议层 provider id。
    label: "Claude",
    command: "claude",
    displayNamePrefix: "Claude Agent",
    capabilities: {
      history: "native",
    },
    availableModels: readClaude2Models(),
  },
};

export const getAgentProviderProfile = (provider: AgentProvider | undefined) => {
  if (!provider) {
    return undefined;
  }

  return profiles[provider];
};
