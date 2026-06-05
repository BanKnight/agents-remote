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

let cachedPermissionModes: Claude2PermissionMode[] | null = null;

export async function parseClaudePermissionModes(): Promise<Claude2PermissionMode[]> {
  if (cachedPermissionModes) return cachedPermissionModes;

  const fallback: Claude2PermissionMode[] = [
    "default",
    "acceptEdits",
    "bypassPermissions",
    "plan",
    "auto",
    "dontAsk",
  ];

  try {
    const proc = Bun.spawn({
      cmd: ["claude", "--help"],
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = await new Response(proc.stdout).text();
    await proc.exited;

    const match = output.match(/--permission-mode[^(]*\(choices:\s*([^)]+)\)/);
    if (!match) return fallback;

    const choices = match[1]
      .split(",")
      .map((s) => s.trim().replace(/^"|"$/g, ""))
      .filter(Boolean) as Claude2PermissionMode[];

    return choices.length > 0 ? choices : fallback;
  } catch {
    return fallback;
  }
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
    label: "Claude 2",
    command: "claude",
    displayNamePrefix: "Claude 2 Agent",
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
