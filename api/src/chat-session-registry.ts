import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ChatSession, ChatSessionStatus } from "@agents-remote/shared";

/**
 * ChatSessionRegistry —— 全局 chat 会话元数据持久化（设计 docs/design/workbench-views.md §3.1）。
 *
 * 与 {@link SessionRegistry} 的区别：chat 会话**全局、不绑项目**，故无 projectName 分片、无
 * runtime 探活（pi 进程内会话存活由 PiRuntime 管，Phase 3 接入；Phase 1 仅元数据 CRUD）。
 * metadata 落 `~/.agents-remote/chat-sessions/<id>.json`（0o600，跨重启持久），与 SessionRegistry
 * 的 tmpfs runDir 区分——chat 历史须跨重启保留（pi SessionManager JSONL 也落持久目录）。
 */
export class ChatSessionRegistry {
  private static readonly ACTIVITY_MINUTE_MS = 60_000;

  private readonly sessionsDir: string;
  private readonly now: () => Date;
  private readonly createId: () => string;
  private indexLoadPromise: Promise<void> | undefined;
  private readonly index = new Map<string, ChatSession>();
  /** closeChatSession 前置钩子（销毁 pi 进程内 AgentSession + 清理 pi JSONL，Phase 3 接入）。 */
  private closeHook: ((id: string) => Promise<void> | void) | undefined;

  constructor(options: { sessionsDir: string; now?: () => Date; createId?: () => string }) {
    this.sessionsDir = options.sessionsDir;
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? (() => `chat_${randomUUID()}`);
  }

  /**
   * 首次访问惰性加载磁盘索引到内存（与 SessionRegistry.loadIndex 同范式）。后续 create/rename/
   * close 直接维护内存 index + 写盘，避免每次 list 重新 readdir。
   */
  private ensureIndexLoaded(): Promise<void> {
    if (!this.indexLoadPromise) {
      this.indexLoadPromise = this.loadIndex().catch((error) => {
        // 加载失败不缓存，下次访问重试（与 SessionRegistry 同）。
        this.indexLoadPromise = undefined;
        throw error;
      });
    }
    return this.indexLoadPromise;
  }

  private async loadIndex(): Promise<void> {
    await this.ensureSessionsDir();
    let files: string[];
    try {
      files = await readdir(this.sessionsDir);
    } catch {
      return;
    }
    await Promise.all(
      files
        .filter((f) => f.endsWith(".json"))
        .map(async (f) => {
          const session = await this.readMetadataFile(f);
          if (session) this.index.set(session.id, session);
        }),
    );
  }

  async listChatSessions(): Promise<ChatSession[]> {
    await this.ensureIndexLoaded();
    // createdAt 升序（与 SessionRegistry.listMetadata 一致，保证列表顺序稳定）。
    return [...this.index.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async getChatSession(id: string): Promise<ChatSession | undefined> {
    await this.ensureIndexLoaded();
    return this.index.get(id);
  }

  async createChatSession(displayName?: string): Promise<ChatSession> {
    await this.ensureIndexLoaded();
    const now = this.now().toISOString();
    const session: ChatSession = {
      id: this.createId(),
      displayName: this.resolveDisplayName(displayName),
      status: "idle",
      createdAt: now,
      updatedAt: now,
    };
    await this.writeMetadata(session);
    return session;
  }

  async renameChatSession(id: string, displayName: string): Promise<ChatSession | undefined> {
    await this.ensureIndexLoaded();
    const session = this.index.get(id);
    if (!session) return undefined;
    const updated: ChatSession = {
      ...session,
      displayName: this.resolveDisplayName(displayName),
      updatedAt: this.now().toISOString(),
    };
    await this.writeMetadata(updated);
    return updated;
  }

  /**
   * 关闭 chat 会话：先 await closeHook（PiRuntime.close + removeSessionFiles，销毁进程内
   * AgentSession + 清理 pi JSONL，Phase 3 由 index.ts 注入），再清理元数据。hook 失败仅 warn
   * 不阻塞清理——用户删除意图优先，元数据残留胜于会话泄漏。
   */
  async closeChatSession(id: string): Promise<ChatSession | undefined> {
    await this.ensureIndexLoaded();
    const session = this.index.get(id);
    if (!session) return undefined;
    if (this.closeHook) {
      try {
        await this.closeHook(id);
      } catch (error) {
        console.warn(`[chat-sessions] close hook failed: ${id}`, error);
      }
    }
    await this.removeMetadata(id);
    return { ...session, status: "closed" as ChatSessionStatus };
  }

  /**
   * closeChatSession 前置钩子注入（镜像 SessionRegistry setOn* 模式，保持 registry 与
   * pi 运行时解耦）。hook 返回 Promise 时 closeChatSession 会 await。
   */
  setCloseHook(hook: (id: string) => Promise<void> | void): void {
    this.closeHook = hook;
  }

  /**
   * piSessionId backfill（Phase 3）：幂等——仅当值变化时更新。先同步更内存 index（list/get 立即可见），
   * 写盘 fire-and-forget（事件回调路径不阻塞，避免与事件流竞态）。
   */
  setPiSessionId(id: string, piSessionId: string): void {
    if (!piSessionId) return;
    const session = this.index.get(id);
    if (!session || session.piSessionId === piSessionId) return;
    const updated: ChatSession = { ...session, piSessionId };
    this.index.set(id, updated);
    void this.writeMetadata(updated).catch((error) => {
      console.warn(`[chat-sessions] setPiSessionId write failed: ${id}`, error);
    });
  }

  /**
   * 活跃时间戳刷新（pi 事件流每帧触发，镜像 SessionRegistry.recordActivity）：updatedAt 按整分钟
   * 截断，同分钟短路不写盘，防事件风暴刷磁盘。
   */
  async recordActivityChat(id: string): Promise<void> {
    await this.ensureIndexLoaded();
    const session = this.index.get(id);
    if (!session) return;
    const truncatedMs =
      Math.floor(this.now().getTime() / ChatSessionRegistry.ACTIVITY_MINUTE_MS) *
      ChatSessionRegistry.ACTIVITY_MINUTE_MS;
    const truncatedIso = new Date(truncatedMs).toISOString();
    if (session.updatedAt === truncatedIso) return;
    const updated: ChatSession = { ...session, updatedAt: truncatedIso };
    await this.writeMetadata(updated);
  }

  private resolveDisplayName(displayName: string | undefined): string {
    const trimmed = displayName?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : "新对话";
  }

  private async writeMetadata(session: ChatSession): Promise<void> {
    await this.ensureSessionsDir();
    await writeFile(this.metadataPath(session.id), `${JSON.stringify(session, null, 2)}\n`, {
      mode: 0o600,
    });
    this.index.set(session.id, session);
  }

  private async readMetadataFile(fileName: string): Promise<ChatSession | undefined> {
    try {
      const raw = await readFile(join(this.sessionsDir, fileName), "utf8");
      return this.parseMetadata(raw);
    } catch (error) {
      if (isNotFoundError(error)) return undefined;
      throw error;
    }
  }

  private parseMetadata(raw: string): ChatSession | undefined {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return undefined;
    }
    if (!parsed || typeof parsed !== "object") return undefined;
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.id !== "string" || typeof obj.displayName !== "string") return undefined;
    return {
      id: obj.id,
      displayName: obj.displayName,
      status: (obj.status as ChatSessionStatus) ?? "idle",
      createdAt: typeof obj.createdAt === "string" ? obj.createdAt : new Date(0).toISOString(),
      updatedAt: typeof obj.updatedAt === "string" ? obj.updatedAt : new Date(0).toISOString(),
      piSessionId: typeof obj.piSessionId === "string" ? obj.piSessionId : undefined,
    };
  }

  private async removeMetadata(id: string): Promise<void> {
    await rm(this.metadataPath(id), { force: true });
    this.index.delete(id);
  }

  private async ensureSessionsDir(): Promise<void> {
    await mkdir(this.sessionsDir, { recursive: true, mode: 0o700 });
  }

  private metadataPath(id: string): string {
    return join(this.sessionsDir, `${id}.json`);
  }
}

const isNotFoundError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: string }).code;
  return code === "ENOENT" || code === "ENOTDIR";
};
