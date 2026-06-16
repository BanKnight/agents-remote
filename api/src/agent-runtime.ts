import { getAgentProviderProfile } from "./agent-provider-profiles";
import {
  SessionRegistryError,
  type RuntimeResources,
  type SessionMetadata,
} from "./session-registry";
import { TmuxRuntimeError } from "./tmux-runtime";

export type AgentCommandRuntime = Pick<RuntimeResources, "close" | "exists"> & {
  startCommand(metadata: SessionMetadata, command: string): Promise<void>;
};

export class AgentRuntime implements RuntimeResources {
  constructor(private readonly commandRuntime: AgentCommandRuntime) {}

  async exists(runtimeKey: string) {
    return this.commandRuntime.exists(runtimeKey);
  }

  async startAgent(metadata: SessionMetadata) {
    const profile = getAgentProviderProfile(metadata.provider);

    if (!profile) {
      throw providerUnavailableError();
    }

    try {
      await this.commandRuntime.startCommand(metadata, profile.command);
    } catch (error) {
      if (error instanceof TmuxRuntimeError) {
        throw providerUnavailableError();
      }

      throw error;
    }
  }

  async close(runtimeKey: string) {
    await this.commandRuntime.close(runtimeKey);
  }
}

const providerUnavailableError = () =>
  new SessionRegistryError("SESSION_PROVIDER_UNAVAILABLE", "Agent provider is unavailable");
