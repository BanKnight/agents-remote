import type {
  AgentProvider,
  AgentSession,
  AgentSessionStatus,
  ApiErrorCode,
  EffortLevel,
  OverviewCandidate,
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
  /** capture-pane 输出缓存 TTL：list/overview 短时重复读同一 pane 不重 spawn。 */
  private static readonly CAPTURE_TTL_MS = 5_000;

  private readonly sessionsDir: string;
  private readonly now: () => Date;
  private readonly createId: (type: SessionType) => string;
  private readonly runtime: RuntimeResources;
  /** 内存索引：sessionId → metadata，source of truth。启动 load 一次，写操作事件维护。 */
  private readonly index = new Map<string, SessionMetadata>();
  private indexLoadPromise: Promise<void> | null = null;
  /** 存活 runtimeKey 集合缓存（list-sessions + claude2 进程内），TTL 见 ALIVE_TTL_MS。 */
  private aliveCache: { keys: Set<string>; expiresAt: number } | null = null;
  /** getAliveKeys 在途 promise：冷缓存时并发 caller 共享同一次 spawn（去重）。 */
  private aliveInFlight: Promise<Set<string>> | null = null;
  /** capture-pane 输出缓存（runtimeKey → {content, expiresAt}），TTL 见 CAPTURE_TTL_MS。 */
  private readonly captureCache = new Map<string, { content: string; expiresAt: number }>();

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
    // 并行读盘（旧实现逐个串行 await，冷启动随 session 数线性增长）。
    const metadatas = await Promise.all(
      files
        .filter((fileName) => fileName.endsWith(".json"))
        .map((fileName) => this.readMetadataFile(fileName)),
    );
    for (const metadata of metadatas) {
      if (metadata) this.index.set(metadata.id, metadata);
    }
  }

  /**
   * 存活 runtimeKey 集合（TTL 缓存）。优先用 runtime.listAliveRuntimeKeys（1 次 list-sessions
   * 替代 M 次 has-session）；缺失回退逐个 exists（collectAliveByExists）。结果在 ALIVE_TTL_MS 内复用。
   *
   * throw = 探测不可信（runtime.listAliveRuntimeKeys 失败，如 tmux server 重启中）。keepIfRuntimeExists
   * 见 throw 保守保留（不 hide 不删）——无法靠 exitCode 可靠区分「真的没有 session」与「探测暂时不可达」
   *（no server 也可能只是重启中），统一让读路径拒绝基于不可信结果做删除决策。
   *
   * in-flight 去重：冷缓存时并发 caller（listAllCandidates / listMetadata 对 N 个 entry 各调一次
   * keepIfRuntimeExists → getAliveKeys）共享同一次 spawn，否则 N 个 caller 各 spawn 一次 list-sessions。
   */
  private async getAliveKeys(): Promise<Set<string>> {
    const nowMs = this.now().getTime();
    if (this.aliveCache && this.aliveCache.expiresAt > nowMs) {
      return this.aliveCache.keys;
    }
    if (this.aliveInFlight) {
      return this.aliveInFlight;
    }
    this.aliveInFlight = (async () => {
      try {
        const keys = this.runtime.listAliveRuntimeKeys
          ? await this.runtime.listAliveRuntimeKeys()
          : await this.collectAliveByExists();
        this.aliveCache = { keys, expiresAt: nowMs + SessionRegistry.ALIVE_TTL_MS };
        return keys;
      } finally {
        this.aliveInFlight = null;
      }
    })();
    return this.aliveInFlight;
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
    // 并发对每个 terminal capture（TTL 缓存）提 lastCommand；captureSubtitle 内部容错（capture 失败
    // → undefined）。list 是 one-shot query（staleTime 5s 无 refetchInterval），用户进 workbench 才触发。
    return Promise.all(
      metadata.map(async (m) => terminalSessionFromMetadata(m, await this.captureSubtitle(m))),
    );
  }

  /**
   * 全 project 全类型候选聚合（GET /api/overview）：遍历内存索引全部 metadata（不分 project，一次
   * 遍历）→ 批量探活过滤（keepIfRuntimeExists：死 terminal 清理 + claude2+claudeSessionId 保留）
   * → terminal 走 capture（TmuxRuntime 内 TTL 缓存）填 subtitle。替代前端 1+2N 瀑布的单后端聚合。
   */
  async listAllCandidates(): Promise<OverviewCandidate[]> {
    await this.ensureLoaded();
    // 排序复刻原 1+2N 前端聚合顺序：listProjects(项目名 localeCompare) → 同项目 agent 在 terminal 前
    // → 同类内 createdAt 升序（与 listMetadata 一致）。保证 grid/table 视图卡片顺序迁移后不变。
    const entries = Array.from(this.index.values()).sort((left, right) => {
      const byProject = left.projectName.localeCompare(right.projectName);
      if (byProject !== 0) return byProject;
      if (left.type !== right.type) return left.type === "agent" ? -1 : 1;
      return left.createdAt.localeCompare(right.createdAt);
    });
    const live = await Promise.all(entries.map((entry) => this.keepIfRuntimeExists(entry)));
    const enriched = await Promise.all(
      live.map(async (metadata) =>
        metadata ? metadataToCandidate(metadata, await this.captureSubtitle(metadata)) : null,
      ),
    );
    return enriched.filter((candidate): candidate is OverviewCandidate => candidate !== null);
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
    return terminalSessionFromMetadata(metadata, await this.captureSubtitle(metadata));
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
    // 存活集合是 TTL 快照（可能陈旧 / 探测失败），不得直接作破坏性 removeMetadata 的依据。
    let alive: Set<string>;
    try {
      alive = await this.getAliveKeys();
    } catch {
      // 探测不可信（tmux server 重启中等）：无法区分死活，保守保留（既不 hide 也不删）。
      return metadata;
    }
    if (alive.has(metadata.runtimeKey)) {
      return metadata;
    }

    if (metadata.provider === "claude2" && metadata.claudeSessionId) {
      return metadata;
    }

    // 快照判死，但快照可能陈旧（TTL 窗口内刚 spawn 的 session 尚未进 list-sessions 结果）。
    // 新鲜 exists 二次确认才删：避免误删刚创建的 live session（旧实现每次 has-session 是新鲜的，
    // 不会误杀；TTL 快照引入了陈旧窗口，此二次确认补回该保证）。绝大多数 entry 走上面快路径
    //（快照判活），仅快照判死的少数才付这一次 exists spawn。
    if (this.runtime.exists && (await this.runtime.exists(metadata.runtimeKey))) {
      return metadata;
    }

    await this.removeMetadata(metadata.id);
    return undefined;
  }

  /**
   * capture-pane 输出（TTL 缓存）。缓存放 SessionRegistry 层（统一 this.now 可注入、可测），
   * TmuxRuntime.capture 回归无状态命令封装。list/overview/getTerminalSession 短时重复读同一 pane
   * 命中缓存不重 spawn。detail 主渲染走 tmux attach 实时流，capture 仅服务 lastCommand，5s TTL 无
   * 可见滞后。失败不缓存——下次重试。
   */
  private async captureWithCache(runtimeKey: string): Promise<string> {
    const nowMs = this.now().getTime();
    const cached = this.captureCache.get(runtimeKey);
    if (cached && cached.expiresAt > nowMs) {
      return cached.content;
    }
    if (!this.runtime.capture) {
      throw new SessionRegistryError("SESSION_RUNTIME_ERROR", "runtime capture unavailable");
    }
    const content = await this.runtime.capture(runtimeKey);
    this.captureCache.set(runtimeKey, {
      content,
      expiresAt: nowMs + SessionRegistry.CAPTURE_TTL_MS,
    });
    return content;
  }

  /**
   * candidate subtitle：terminal = capture-pane 最后一行非空（lastCommand）；agent = undefined
   *（lastAssistantMessage 未落 metadata）。capture 失败容错返 undefined（卡片退化 2 行）。
   * listTerminalSessions / listAllCandidates / getTerminalSession 共用，集中 capture + 容错逻辑。
   */
  private async captureSubtitle(metadata: SessionMetadata): Promise<string | undefined> {
    if (metadata.type !== "terminal" || !metadata.runtimeKey || !this.runtime.capture) {
      return undefined;
    }
    try {
      return extractLastCommand(await this.captureWithCache(metadata.runtimeKey));
    } catch {
      return undefined;
    }
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
    // 同步清 capture 缓存 entry，避免死/关闭 session 的 capture 文本残留（captureCache 无主动淘汰）。
    const metadata = this.index.get(sessionId);
    if (metadata) this.captureCache.delete(metadata.runtimeKey);
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

const metadataToCandidate = (metadata: SessionMetadata, subtitle?: string): OverviewCandidate => ({
  type: metadata.type,
  projectName: metadata.projectName,
  sessionId: metadata.id,
  displayName: metadata.displayName,
  status: metadata.status,
  provider: metadata.provider,
  updatedAt: metadata.updatedAt,
  createdAt: metadata.createdAt,
  subtitle,
});

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
