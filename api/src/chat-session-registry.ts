import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ChatSession, ChatSessionStatus } from "@agents-remote/shared";

/** 默认会话名（createChatSession 空名回退 + LLM 标题接线守卫「仅默认名才覆盖」共用）。 */
export const DEFAULT_CHAT_TITLE = "新对话";

/**
 * ChatSessionRegistry —— 全局 chat 会话元数据持久化（设计 docs/design-v1/workbench-views.md §3.1）。
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
  /** 落盘串行化队列（P3-11，与 SessionRegistry.persistQueue 同型）：写盘顺序 = 排队顺序。 */
  private persistQueue: Promise<void> = Promise.resolve();
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
    // 纯新建（无读改写）：先落盘成功再进内存 index——写盘失败时 create reject、list 不见
    // 幻影条目（patch 路径的「先内存」是同步段原子所需，新建无此约束，恢复旧序）。
    await this.persistMetadata(session);
    this.index.set(session.id, session);
    return session;
  }

  async renameChatSession(id: string, displayName: string): Promise<ChatSession | undefined> {
    await this.ensureIndexLoaded();
    return this.patchMetadata(id, (session) => ({
      ...session,
      displayName: this.resolveDisplayName(displayName),
      updatedAt: this.now().toISOString(),
    }));
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
   * 写盘 fire-and-forget（事件回调路径不阻塞，避免与事件流竞态）；catch 只告警不抛——
   * patchMetadata 的 persistMetadata 返回原始 task（队列链 catch 不保护返回值），void 会泄漏
   * unhandled rejection。
   */
  setPiSessionId(id: string, piSessionId: string): void {
    if (!piSessionId) return;
    this.patchMetadata(id, (session) =>
      session.piSessionId === piSessionId ? undefined : { ...session, piSessionId },
    ).catch((error) => console.warn(`[chat-sessions] setPiSessionId write failed: ${id}`, error));
  }

  /**
   * LLM 标题落盘（首条 user 消息后一次性生成）：幂等——值不变短路。**默认名守卫在调用方**
   * （index.ts onTitle 接线）——用户手动改名的会话不被覆盖。
   */
  setChatTitle(id: string, title: string): void {
    if (!title) return;
    // fire-and-forget + catch 告警（同 setPiSessionId）。
    this.patchMetadata(id, (session) =>
      session.displayName === title ? undefined : { ...session, displayName: title },
    ).catch((error) => console.warn(`[chat-sessions] setChatTitle write failed: ${id}`, error));
  }

  /**
   * 活跃时间戳刷新（pi 事件流每帧触发，镜像 SessionRegistry.recordActivity）：updatedAt 按整分钟
   * 截断，同分钟短路不写盘，防事件风暴刷磁盘。
   */
  async recordActivityChat(id: string): Promise<void> {
    await this.ensureIndexLoaded();
    // 分钟截断短路挪进 patch fn（返回 undefined = 同分钟，跳过内存回写与落盘）。
    await this.patchMetadata(id, (session) => {
      const truncatedMs =
        Math.floor(this.now().getTime() / ChatSessionRegistry.ACTIVITY_MINUTE_MS) *
        ChatSessionRegistry.ACTIVITY_MINUTE_MS;
      const truncatedIso = new Date(truncatedMs).toISOString();
      if (session.updatedAt === truncatedIso) return undefined;
      return { ...session, updatedAt: truncatedIso };
    });
  }

  /**
   * 置顶/取消置顶（列表置顶组）。管理操作不更新 updatedAt（保持排序语义——置顶组内仍按
   * updatedAt 排，活跃组不受影响）。幂等：值不变短路。
   */
  async setPinned(id: string, pinned: boolean): Promise<ChatSession | undefined> {
    await this.ensureIndexLoaded();
    // 幂等短路保留原值返回语义（值不变返回现值，不触发落盘）。
    const session = this.index.get(id);
    if (!session) return undefined;
    if (session.pinned === pinned) return session;
    return this.patchMetadata(id, (current) => ({ ...current, pinned }));
  }

  /**
   * 归档/恢复（列表归档折叠组）。archivedAt 存时间戳（archived 组按它降序）；恢复传 null。
   * 管理操作不更新 updatedAt。幂等：值不变短路。
   */
  async setArchived(id: string, archivedAt: string | null): Promise<ChatSession | undefined> {
    await this.ensureIndexLoaded();
    // 幂等短路保留原值返回语义（同 setPinned）。
    const session = this.index.get(id);
    if (!session) return undefined;
    if ((session.archivedAt ?? null) === archivedAt) return session;
    return this.patchMetadata(id, (current) => ({
      ...current,
      archivedAt: archivedAt ?? undefined,
    }));
  }

  private resolveDisplayName(displayName: string | undefined): string {
    const trimmed = displayName?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : DEFAULT_CHAT_TITLE;
  }

  /**
   * 元数据变更单入口（P3-11 并发丢失修复，与 SessionRegistry.patchMetadata 同型）：
   * 读 index → 合并 → 回写 index 三步在**同步段**内完成（同帧原子），落盘经 persistQueue
   * 串行化并 await 本次写盘完成。patch 返回 undefined = 短路（幂等命中 / 分钟截断短路），
   * 跳过回写与落盘。fire-and-forget 调用方（setPiSessionId/setChatTitle）——async 首个
   * await 前的合并段同步执行，内存 index 立即可见；写盘失败时内存已更新而调用方不知情，
   * 读写视图短暂分叉属预期（磁盘由下一次写补齐，调用方 catch 只告警）。
   */
  private async patchMetadata(
    id: string,
    patch: (session: ChatSession) => ChatSession | undefined,
  ): Promise<ChatSession | undefined> {
    const current = this.index.get(id);
    if (!current) return undefined;
    const updated = patch(current);
    if (!updated) return undefined;
    this.index.set(id, updated);
    await this.persistMetadata(updated);
    return updated;
  }

  /** 落盘（串行化，不回写 index）。队列链 catch 吞错：单次 IO 失败不阻断后续排队。 */
  private persistMetadata(session: ChatSession): Promise<void> {
    const task = this.persistQueue.then(async () => {
      await this.ensureSessionsDir();
      await writeFile(this.metadataPath(session.id), `${JSON.stringify(session, null, 2)}\n`, {
        mode: 0o600,
      });
    });
    this.persistQueue = task.catch(() => {});
    return task;
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
      pinned: typeof obj.pinned === "boolean" ? obj.pinned : undefined,
      archivedAt: typeof obj.archivedAt === "string" ? obj.archivedAt : undefined,
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
