import type {
  AgentProvider,
  AgentSession,
  AgentSessionStatus,
  ApiErrorCode,
  SessionType,
  TerminalSession,
  TerminalSessionStatus,
} from "@agents-remote/shared";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { getAgentProviderProfile } from "./agent-provider-profiles";
import type { ResolvedProjectPath } from "./project-paths";

export type SessionMetadata = {
  schemaVersion: 1;
  id: string;
  projectName: string;
  projectPath: string;
  type: SessionType;
  provider?: AgentProvider;
  displayName: string;
  status: AgentSessionStatus | TerminalSessionStatus;
  tmuxSessionName: string;
  createdAt: string;
  updatedAt: string;
  lastConnectedAt?: string;
};

export type RuntimeStream = {
  close(): Promise<void> | void;
};

export type RuntimeResources = {
  exists(tmuxSessionName: string): Promise<boolean>;
  close(tmuxSessionName: string): Promise<void>;
  startTerminal?(metadata: SessionMetadata): Promise<void>;
  startAgent?(metadata: SessionMetadata): Promise<void>;
  write?(tmuxSessionName: string, data: string): Promise<void>;
  resize?(tmuxSessionName: string, cols: number, rows: number): Promise<void>;
  capture?(tmuxSessionName: string): Promise<string>;
  stream?(
    tmuxSessionName: string,
    onData: (data: string) => void,
    onError: (error: Error) => void,
  ): Promise<RuntimeStream>;
};

export class SessionRegistryError extends Error {
  constructor(
    readonly code: Extract<ApiErrorCode, "SESSION_PROVIDER_UNAVAILABLE" | "SESSION_RUNTIME_ERROR">,
    message: string,
  ) {
    super(message);
    this.name = "SessionRegistryError";
  }
}

type SessionRegistryOptions = {
  runDir: string;
  now?: () => Date;
  createId?: (type: SessionType) => string;
  runtime?: RuntimeResources;
};

type CreateAgentSessionInput = {
  project: ResolvedProjectPath;
  provider: AgentProvider;
  displayName?: string;
};

type CreateTerminalSessionInput = {
  project: ResolvedProjectPath;
  displayName?: string;
};

export class SessionRegistry {
  private readonly sessionsDir: string;
  private readonly now: () => Date;
  private readonly createId: (type: SessionType) => string;
  private readonly runtime: RuntimeResources;

  constructor(options: SessionRegistryOptions) {
    this.sessionsDir = join(options.runDir, "sessions");
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? defaultCreateId;
    this.runtime = options.runtime ?? assumeRuntimeExists;
  }

  getRuntime() {
    return this.runtime;
  }

  async getTerminalMetadata(projectName: string, sessionId: string) {
    return this.getLiveMetadata(projectName, "terminal", sessionId);
  }

  async getAgentMetadata(projectName: string, sessionId: string) {
    return this.getLiveMetadata(projectName, "agent", sessionId);
  }

  async countSessions(projectName: string) {
    const [agentSessions, terminalSessions] = await Promise.all([
      this.listAgentSessions(projectName),
      this.listTerminalSessions(projectName),
    ]);

    return {
      agentSessionCount: agentSessions.length,
      terminalSessionCount: terminalSessions.length,
    };
  }

  async listAgentSessions(projectName: string): Promise<AgentSession[]> {
    const metadata = await this.listMetadata("agent", projectName);
    return metadata.map(agentSessionFromMetadata);
  }

  async listTerminalSessions(projectName: string): Promise<TerminalSession[]> {
    const metadata = await this.listMetadata("terminal", projectName);
    return metadata.map(terminalSessionFromMetadata);
  }

  async getAgentSession(projectName: string, sessionId: string): Promise<AgentSession | undefined> {
    const metadata = await this.getLiveMetadata(projectName, "agent", sessionId);
    return metadata ? agentSessionFromMetadata(metadata) : undefined;
  }

  async getTerminalSession(
    projectName: string,
    sessionId: string,
  ): Promise<TerminalSession | undefined> {
    const metadata = await this.getLiveMetadata(projectName, "terminal", sessionId);
    return metadata ? terminalSessionFromMetadata(metadata) : undefined;
  }

  async createAgentSession(input: CreateAgentSessionInput): Promise<AgentSession> {
    const metadata = await this.createMetadata({
      project: input.project,
      type: "agent",
      provider: input.provider,
      displayName: input.displayName,
    });

    try {
      await this.runtime.startAgent?.(metadata);
      return agentSessionFromMetadata(metadata);
    } catch (error) {
      await this.removeMetadata(metadata.id);

      if (error instanceof SessionRegistryError) {
        throw error;
      }

      throw new SessionRegistryError("SESSION_RUNTIME_ERROR", "Unable to start agent session");
    }
  }

  async createTerminalSession(input: CreateTerminalSessionInput): Promise<TerminalSession> {
    const metadata = await this.createMetadata({
      project: input.project,
      type: "terminal",
      displayName: input.displayName,
    });

    try {
      await this.runtime.startTerminal?.(metadata);
      return terminalSessionFromMetadata(metadata);
    } catch (error) {
      await this.removeMetadata(metadata.id);
      throw error;
    }
  }

  async closeAgentSession(
    projectName: string,
    sessionId: string,
  ): Promise<AgentSession | undefined> {
    const metadata = await this.getMetadata(projectName, "agent", sessionId);

    if (!metadata) {
      return undefined;
    }

    await this.closeMetadata(metadata);
    return agentSessionFromMetadata({ ...metadata, status: "closed" });
  }

  async closeTerminalSession(
    projectName: string,
    sessionId: string,
  ): Promise<TerminalSession | undefined> {
    const metadata = await this.getMetadata(projectName, "terminal", sessionId);

    if (!metadata) {
      return undefined;
    }

    await this.closeMetadata(metadata);
    return terminalSessionFromMetadata({ ...metadata, status: "closed" });
  }

  async markConnected(projectName: string, type: SessionType, sessionId: string) {
    const metadata = await this.getLiveMetadata(projectName, type, sessionId);

    if (!metadata) {
      return undefined;
    }

    const connected = {
      ...metadata,
      lastConnectedAt: this.now().toISOString(),
      updatedAt: this.now().toISOString(),
    };
    await this.writeMetadata(connected);
    return connected;
  }

  private async listMetadata(type: SessionType, projectName: string) {
    await this.ensureSessionsDir();
    const files = await readdir(this.sessionsDir).catch((error: unknown) => {
      if (isNotFoundError(error)) {
        return [];
      }

      throw error;
    });
    const metadata = await Promise.all(
      files
        .filter((fileName) => fileName.endsWith(".json"))
        .map(async (fileName) => this.readMetadataFile(fileName)),
    );
    const scoped = metadata.filter(
      (entry) => entry?.type === type && entry.projectName === projectName,
    ) as SessionMetadata[];
    const live = await Promise.all(scoped.map(async (entry) => this.keepIfRuntimeExists(entry)));

    return live
      .filter((entry): entry is SessionMetadata => entry !== undefined)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  private async getLiveMetadata(projectName: string, type: SessionType, sessionId: string) {
    const metadata = await this.getMetadata(projectName, type, sessionId);

    if (!metadata) {
      return undefined;
    }

    return this.keepIfRuntimeExists(metadata);
  }

  private async getMetadata(projectName: string, type: SessionType, sessionId: string) {
    const metadata = await this.readMetadataFile(`${sessionId}.json`);

    if (!metadata || metadata.projectName !== projectName || metadata.type !== type) {
      return undefined;
    }

    return metadata;
  }

  private async createMetadata(input: {
    project: ResolvedProjectPath;
    type: SessionType;
    provider?: AgentProvider;
    displayName?: string;
  }) {
    const id = this.createId(input.type);
    const timestamp = this.now().toISOString();
    const metadata: SessionMetadata = {
      schemaVersion: 1,
      id,
      projectName: input.project.name,
      projectPath: input.project.path,
      type: input.type,
      provider: input.provider,
      displayName: input.displayName ?? defaultDisplayName(input.type, input.provider, id),
      status: "running",
      tmuxSessionName: createTmuxSessionName(input.project.name, input.type, input.provider, id),
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await this.writeMetadata(metadata);
    return metadata;
  }

  private async closeMetadata(metadata: SessionMetadata) {
    if (await this.runtime.exists(metadata.tmuxSessionName)) {
      await this.runtime.close(metadata.tmuxSessionName);
    }

    await this.removeMetadata(metadata.id);
  }

  private async keepIfRuntimeExists(metadata: SessionMetadata) {
    if (await this.runtime.exists(metadata.tmuxSessionName)) {
      return metadata;
    }

    await this.removeMetadata(metadata.id);
    return undefined;
  }

  private async writeMetadata(metadata: SessionMetadata) {
    await this.ensureSessionsDir();
    await writeFile(this.metadataPath(metadata.id), `${JSON.stringify(metadata, null, 2)}\n`, {
      mode: 0o600,
    });
  }

  private async readMetadataFile(fileName: string) {
    try {
      const raw = await readFile(join(this.sessionsDir, fileName), "utf8");
      return parseMetadata(raw);
    } catch (error) {
      if (isNotFoundError(error)) {
        return undefined;
      }

      throw error;
    }
  }

  private async removeMetadata(sessionId: string) {
    await rm(this.metadataPath(sessionId), { force: true });
  }

  private async ensureSessionsDir() {
    await mkdir(this.sessionsDir, { recursive: true, mode: 0o700 });
  }

  private metadataPath(sessionId: string) {
    return join(this.sessionsDir, `${sessionId}.json`);
  }
}

export const createTmuxSessionName = (
  projectName: string,
  type: SessionType,
  provider: AgentProvider | undefined,
  sessionId: string,
) => {
  const projectKey = safeProjectKey(projectName);
  const providerPart = type === "agent" ? provider : undefined;
  const prefix = process.env.AGENTS_REMOTE_SESSION_PREFIX ?? "ar";
  return [prefix, type, providerPart, projectKey, sessionId.slice(0, 12)].filter(Boolean).join("-");
};

const defaultCreateId = (type: SessionType) => {
  const prefix = type === "agent" ? "agent" : "terminal";
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
};

const defaultDisplayName = (
  type: SessionType,
  provider: AgentProvider | undefined,
  sessionId: string,
) => {
  const suffix = sessionId.split("_").at(-1)?.slice(0, 6) ?? sessionId.slice(0, 6);

  if (type === "agent") {
    const profile = getAgentProviderProfile(provider);
    return `${profile?.displayNamePrefix ?? "Claude Agent"} ${suffix}`;
  }

  return `Terminal ${suffix}`;
};

const safeProjectKey = (projectName: string) => {
  const slug = projectName
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  const hash = createHash("sha256").update(projectName).digest("hex").slice(0, 8);
  return `${slug || "project"}-${hash}`;
};

const parseMetadata = (raw: string): SessionMetadata | undefined => {
  const parsed = JSON.parse(raw) as Partial<SessionMetadata>;

  if (
    parsed.schemaVersion !== 1 ||
    typeof parsed.id !== "string" ||
    typeof parsed.projectName !== "string" ||
    typeof parsed.projectPath !== "string" ||
    (parsed.type !== "agent" && parsed.type !== "terminal") ||
    typeof parsed.displayName !== "string" ||
    typeof parsed.status !== "string" ||
    typeof parsed.tmuxSessionName !== "string" ||
    typeof parsed.createdAt !== "string" ||
    typeof parsed.updatedAt !== "string"
  ) {
    return undefined;
  }

  return parsed as SessionMetadata;
};

const assumeRuntimeExists: RuntimeResources = {
  async exists() {
    return true;
  },
  async close() {},
  async startAgent() {},
  async write() {},
  async resize() {},
  async capture() {
    return "";
  },
  async stream() {
    return { close() {} };
  },
};

const agentSessionFromMetadata = (metadata: SessionMetadata): AgentSession => ({
  id: metadata.id,
  projectName: metadata.projectName,
  provider: metadata.provider ?? "claude",
  displayName: metadata.displayName,
  status: metadata.status as AgentSessionStatus,
  createdAt: metadata.createdAt,
});

const terminalSessionFromMetadata = (metadata: SessionMetadata): TerminalSession => ({
  id: metadata.id,
  projectName: metadata.projectName,
  displayName: metadata.displayName,
  status: metadata.status as TerminalSessionStatus,
});

const isNotFoundError = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
