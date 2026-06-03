import type { AgentProvider } from "@agents-remote/shared";

export type AgentProviderProfile = {
  provider: AgentProvider;
  label: string;
  command: string;
  displayNamePrefix: string;
  capabilities: {
    history: "unsupported" | "native";
  };
  availableModels?: string[];
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
