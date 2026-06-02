import type { AgentProvider } from "@agents-remote/shared";

export type AgentProviderProfile = {
  provider: AgentProvider;
  label: string;
  command: string;
  displayNamePrefix: string;
  capabilities: {
    history: "unsupported" | "native";
  };
};

const profiles = {
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
  },
} satisfies Record<AgentProvider, AgentProviderProfile>;

export const getAgentProviderProfile = (provider: AgentProvider | undefined) => {
  if (!provider) {
    return undefined;
  }

  return profiles[provider];
};
