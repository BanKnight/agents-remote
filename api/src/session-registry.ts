import type {
  AgentProvider,
  AgentSession,
  AgentSessionStatus,
  ApiErrorCode,
  EffortLevel,
  SessionType,
  TerminalSession,
  TerminalSessionStatus,
} from "@agents-remote/shared";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { getAgentProviderProfile } from "./agent-provider-profiles";
import type { ResolvedProjectPath } from "./project-paths";
import { extractLastCommand } from "./tmux-runtime";

export type SessionMetadata = {
  schemaVersion: 1;
  id: string;
  projectName: string;
  projectPath: string;
  type: SessionType;
  provider?: AgentProvider;
  displayName: string;
  status: AgentSessionStatus | TerminalSessionStatus;
  runtimeKey: string;
  createdAt: string;
  updatedAt: string;
  lastConnectedAt?: string;
  claudeSessionId?: string;
  model?: string;
  permissionMode?: string;
  effort?: EffortLevel;
};

export type RuntimeStream = {
  close(): Promise<void> | void;
};

// 每个 WebSocket 客户端 attach 一个 tmux attach 子进程（Bun 原生 PTY）的句柄。
// write→PTY stdin（前端 input），resize→TIOCSWINSZ（前端 resize），close→kill+close（WS close），
// onExit→子进程退出回调（tmux session 被 kill / shell exit 时触发，作 ended 信号）。
export type AttachHandle = {
  write(data: string): void;
  resize(cols: number, rows: number): void;
  close(): void;
  onExit(cb: (exitCode: number | null) => void): void;
};

export type AttachOptions = { cols: number; rows: number };

export type RuntimeResources = {
  exists(runtimeKey: string): Promise<boolean>;
  close(runtimeKey: string): Promise<void>;
  startTerminal?(metadata: SessionMetadata): Promise<void>;
  startAgent?(metadata: SessionMetadata): Promise<void>;
  capture?(runtimeKey: string): Promise<string>;
  attach?(
    runtimeKey: string,
    onData: (data: string) => void,
    onError: (error: Error) => void,
    opts: AttachOptions,
  ): Promise<AttachHandle>;
  /**
   * 批量返回当前存活的 runtimeKey 集合（terminal/非claude2 agent = `tmux list-sessions`；
   * claude2 = 进程内 exitCode===null）。供 SessionRegistry 做存活探活缓存，替代逐个
   * has-session spawn（1 次 list-sessions 替代 M 次 has-session）。可选，缺失则回退逐个 exists。
   */
  listAliveRuntimeKeys?(): Promise<Set<string>>;
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
  claudeSessionId?: string;
  model?: string;
  permissionMode?: string;
  effort?: EffortLevel;
};

type CreateTerminalSessionInput = {
  project: ResolvedProjectPath;
  displayName?: string;
};

export class SessionRegistry {
  /** 存活探活缓存 TTL：list-sessions 结果短时复用，避免每次 list/count 都 spawn。 */
  private static readonly ALIVE_TTL_MS = 5_000;

  private readonly sessionsDir: string;
  private readonly now: () => Date;
  private readonly createId: (type: SessionType) => string;
  private readonly runtime: RuntimeResources;
  /** 内存索引：sessionId → metadata，source of truth。启动 load 一次，写操作事件维护。 */
  private readonly index = new Map<string, SessionMetadata>();
  private indexLoadPromise: Promise<void> | null = null;
  /** 存活 runtimeKey 集合缓存（list-sessions + claude2 进程内），TTL 见 ALIVE_TTL_MS。 */
  private aliveCache: { keys: Set<string>; expiresAt: number } | null = null;

  constructor(options: SessionRegistryOptions) {
    this.sessionsDir = join(options.runDir, "sessions");
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? defaultCreateId;
    this.runtime = options.runtime ?? assumeRuntimeExists;
    // 启动即异步加载磁盘 metadata 到内存索引（不阻塞构造）；公共方法经 ensureLoaded 等它。
    void this.ensureLoaded();
  }

  /** 等待内存索引加载完成（懒触发，仅一次；失败置空允许下次重试）。 */
  private ensureLoaded(): Promise<void> {
    if (!this.indexLoadPromise) {
      this.indexLoadPromise = this.loadIndex().catch((error) => {
        this.indexLoadPromise = null;
        throw error;
      });
    }
    return this.indexLoadPromise;
  }

  /** 从磁盘一次性加载全部 metadata 到内存索引（复用 readMetadataFile/parseMetadata）。 */
  private async loadIndex() {
    await this.ensureSessionsDir();
    const files = await readdir(this.sessionsDir).catch((error: unknown) => {
      if (isNotFoundError(error)) return [];
      throw error;
    });
    for (const fileName of files) {
      if (!fileName.endsWith(".json")) continue;
      const metadata = await this.readMetadataFile(fileName);
      if (metadata) this.index.set(metadata.id, metadata);
    }
  }

  /**
   * 存活 runtimeKey 集合（TTL 缓存）。优先用 runtime.listAliveRuntimeKeys（1 次 list-sessions
   * 替代 M 次 has-session）；缺失则回退逐个 exists（保留旧语义）。结果在 ALIVE_TTL_MS 内复用。
   */
  private async getAliveKeys(): Promise<Set<string>> {
    const nowMs = this.now().getTime();
    if (this.aliveCache && this.aliveCache.expiresAt > nowMs) {
      return this.aliveCache.keys;
    }
    const keys = this.runtime.listAliveRuntimeKeys
      ? await this.runtime.listAliveRuntimeKeys()
      : await this.collectAliveByExists();
    this.aliveCache = { keys, expiresAt: nowMs + SessionRegistry.ALIVE_TTL_MS };
    return keys;
  }

  /** Fallback：runtime 未提供 listAliveRuntimeKeys 时，对 index 内全部 entry 逐个 exists。 */
  private async collectAliveByExists(): Promise<Set<string>> {
    const alive = new Set<string>();
    await Promise.all(
      Array.from(this.index.values()).map(async (entry) => {
        if (await this.runtime.exists(entry.runtimeKey)) alive.add(entry.runtimeKey);
      }),
    );
    return alive;
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

  async setClaudeSessionId(
    sessionId: string,
    claudeSessionId: string,
    model?: string,
  ): Promise<void> {
    await this.ensureLoaded();
    const metadata = this.index.get(sessionId);
    if (!metadata) return;
    const updated: SessionMetadata = {
      ...metadata,
      claudeSessionId,
      updatedAt: this.now().toISOString(),
    };
    if (model) updated.model = model;
    await this.writeMetadata(updated);
  }

  // Persist a mid-session model switch to metadata.model, so API restart /
  // session reopen spawns the CLI with the switched model (the --model arg in
  // claude2-runtime spawnClaudeDirect). Triggered via Claude2Runtime onModelChange
  // when a <local-command-stdout>Set model to (id)</local-command-stdout> echo is
  // folded. Only updates model; claudeSessionId is untouched.
  async setModel(sessionId: string, model: string): Promise<void> {
    await this.ensureLoaded();
    const metadata = this.index.get(sessionId);
    if (!metadata) return;
    const updated: SessionMetadata = {
      ...metadata,
      model,
      updatedAt: this.now().toISOString(),
    };
    await this.writeMetadata(updated);
  }

  // Persist a mid-session permission-mode switch to metadata.permissionMode, so
  // an API restart (--resume) spawns the CLI with the switched mode (the
  // --permission-mode arg in claude2-runtime spawnClaudeDirect). Triggered via
  // Claude2Runtime onPermissionModeChange when a system.status{permissionMode}
  // echo is folded. Only updates permissionMode; claudeSessionId is untouched.
  // Symmetric to setModel above.
  async setPermissionMode(sessionId: string, permissionMode: string): Promise<void> {
    await this.ensureLoaded();
    const metadata = this.index.get(sessionId);
    if (!metadata) return;
    const updated: SessionMetadata = {
      ...metadata,
      permissionMode,
      updatedAt: this.now().toISOString(),
    };
    await this.writeMetadata(updated);
  }

  // Persist the runtime effort level so an API restart (--resume) re-applies it via
  // CLAUDE_CODE_EFFORT_LEVEL env in spawnClaudeDirect. Symmetric to setModel/setPermissionMode.
  async setEffort(sessionId: string, effort: EffortLevel): Promise<void> {
    await this.ensureLoaded();
    const metadata = this.index.get(sessionId);
    if (!metadata) return;
    const updated: SessionMetadata = {
      ...metadata,
      effort,
      updatedAt: this.now().toISOString(),
    };
    await this.writeMetadata(updated);
  }

  async countSessions(projectName: string) {
    // 直接用 listMetadata 计数（读内存索引 + 批量探活过滤），不走 listTerminalSessions
    // ——后者会对每个 terminal spawn capture-pane 提 lastCommand，但 count 只需数量，是纯浪费。
    const [agentMetadata, terminalMetadata] = await Promise.all([
      this.listMetadata("agent", projectName),
      this.listMetadata("terminal", projectName),
    ]);
    return {
      agentSessionCount: agentMetadata.length,
      terminalSessionCount: terminalMetadata.length,
    };
  }

  async getActiveClaudeSessionMap(projectName: string): Promise<Map<string, string>> {
    const metadata = await this.listMetadata("agent", projectName);
    const map = new Map<string, string>();
    for (const m of metadata) {
      if (m.provider === "claude2" && m.claudeSessionId) {
        map.set(m.claudeSessionId, m.id);
      }
    }
    return map;
  }

  async listAgentSessions(projectName: string): Promise<AgentSession[]> {
    const metadata = await this.listMetadata("agent", projectName);
    return metadata.map(agentSessionFromMetadata);
  }

  async listTerminalSessions(projectName: string): Promise<TerminalSession[]> {
    const metadata = await this.listMetadata("terminal", projectName);
    // 并发对每个 terminal capture pane，提取最后一行非空作 lastCommand。capture 抛错容错
    //（session 已死 / tmux 不可用）→ lastCommand 留空，不阻塞列表。list 是 one-shot query
    //（staleTime 5s 无 refetchInterval），N 次 capture-pane spawn（~1-5ms）用户进 workbench 才触发。
    return Promise.all(
      metadata.map(async (m) => {
        let lastCommand: string | undefined;
        if (m.runtimeKey && this.runtime.capture) {
          try {
            lastCommand = extractLastCommand(await this.runtime.capture(m.runtimeKey));
          } catch {
            // 容错：capture 失败 → lastCommand undefined，卡片退化 2 行
          }
        }
        return terminalSessionFromMetadata(m, lastCommand);
      }),
    );
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
    if (!metadata) return undefined;
    let lastCommand: string | undefined;
    if (metadata.runtimeKey && this.runtime.capture) {
      try {
        lastCommand = extractLastCommand(await this.runtime.capture(metadata.runtimeKey));
      } catch {
        // 容错同 list
      }
    }
    return terminalSessionFromMetadata(metadata, lastCommand);
  }

  async createAgentSession(input: CreateAgentSessionInput): Promise<AgentSession> {
    const metadata = await this.createMetadata({
      project: input.project,
      type: "agent",
      provider: input.provider,
      displayName: input.displayName,
      claudeSessionId: input.claudeSessionId,
      model: input.model,
      permissionMode: input.permissionMode,
      effort: input.effort,
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

  async renameAgentSession(
    projectName: string,
    sessionId: string,
    displayName: string,
  ): Promise<AgentSession | undefined> {
    const metadata = await this.getMetadata(projectName, "agent", sessionId);

    if (!metadata) {
      return undefined;
    }

    const renamed: SessionMetadata = {
      ...metadata,
      displayName,
      updatedAt: this.now().toISOString(),
    };
    await this.writeMetadata(renamed);
    return agentSessionFromMetadata(renamed);
  }

  async renameTerminalSession(
    projectName: string,
    sessionId: string,
    displayName: string,
  ): Promise<TerminalSession | undefined> {
    const metadata = await this.getMetadata(projectName, "terminal", sessionId);

    if (!metadata) {
      return undefined;
    }

    const renamed: SessionMetadata = {
      ...metadata,
      displayName,
      updatedAt: this.now().toISOString(),
    };
    await this.writeMetadata(renamed);
    return terminalSessionFromMetadata(renamed);
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
    await this.ensureLoaded();
    const scoped: SessionMetadata[] = [];
    for (const entry of this.index.values()) {
      if (entry.type === type && entry.projectName === projectName) {
        scoped.push(entry);
      }
    }
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
    await this.ensureLoaded();
    const metadata = this.index.get(sessionId);

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
    claudeSessionId?: string;
    model?: string;
    permissionMode?: string;
    effort?: EffortLevel;
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
      runtimeKey: createRuntimeKey(input.project.name, input.type, input.provider, id),
      createdAt: timestamp,
      updatedAt: timestamp,
      claudeSessionId: input.claudeSessionId,
      model: input.model,
      permissionMode: input.permissionMode,
      effort: input.effort,
    };

    await this.writeMetadata(metadata);
    return metadata;
  }

  private async closeMetadata(metadata: SessionMetadata) {
    if (await this.runtime.exists(metadata.runtimeKey)) {
      await this.runtime.close(metadata.runtimeKey);
    }

    await this.removeMetadata(metadata.id);
  }

  private async keepIfRuntimeExists(metadata: SessionMetadata) {
    // 查存活集合（TTL 缓存的 list-sessions/进程内结果，O(1)），替代逐个 runtime.exists spawn。
    const alive = await this.getAliveKeys();
    if (alive.has(metadata.runtimeKey)) {
      return metadata;
    }

    if (metadata.provider === "claude2" && metadata.claudeSessionId) {
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
    this.index.set(metadata.id, metadata);
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
    this.index.delete(sessionId);
  }

  private async ensureSessionsDir() {
    await mkdir(this.sessionsDir, { recursive: true, mode: 0o700 });
  }

  private metadataPath(sessionId: string) {
    return join(this.sessionsDir, `${sessionId}.json`);
  }
}

export const createRuntimeKey = (
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
  const rawParsed = JSON.parse(raw) as Record<string, unknown>;
  // Backward compat: old metadata files use "tmuxSessionName"
  if (typeof rawParsed.runtimeKey !== "string" && typeof rawParsed.tmuxSessionName === "string") {
    rawParsed.runtimeKey = rawParsed.tmuxSessionName;
  }
  const parsed = rawParsed as Partial<SessionMetadata>;

  if (
    parsed.schemaVersion !== 1 ||
    typeof parsed.id !== "string" ||
    typeof parsed.projectName !== "string" ||
    typeof parsed.projectPath !== "string" ||
    (parsed.type !== "agent" && parsed.type !== "terminal") ||
    typeof parsed.displayName !== "string" ||
    typeof parsed.status !== "string" ||
    typeof parsed.runtimeKey !== "string" ||
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
  async capture() {
    return "";
  },
  async attach() {
    return {
      write() {},
      resize() {},
      close() {},
      onExit() {},
    };
  },
};

const agentSessionFromMetadata = (metadata: SessionMetadata): AgentSession => ({
  id: metadata.id,
  projectName: metadata.projectName,
  provider: metadata.provider ?? "claude",
  displayName: metadata.displayName,
  status: metadata.status as AgentSessionStatus,
  createdAt: metadata.createdAt,
  model: metadata.model,
  permissionMode: metadata.permissionMode,
  effort: metadata.effort,
  claudeSessionId: metadata.claudeSessionId,
  updatedAt: metadata.updatedAt,
});

const terminalSessionFromMetadata = (
  metadata: SessionMetadata,
  lastCommand?: string,
): TerminalSession => ({
  id: metadata.id,
  projectName: metadata.projectName,
  displayName: metadata.displayName,
  status: metadata.status as TerminalSessionStatus,
  updatedAt: metadata.updatedAt,
  lastCommand,
});

const isNotFoundError = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
