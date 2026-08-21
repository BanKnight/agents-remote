import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { ChatSession } from "@agents-remote/shared";
import type { ChatSessionRegistry } from "./chat-session-registry";
import type { PiRuntime } from "./pi-runtime";

/**
 * chat 会话空闲回收器（设计 docs/design/workbench-views.md §3.1.1）。
 *
 * 单一定时器统一承载两个语义：
 * - **空会话清理**：`pi-jsonl/<chatId>/` 无文件 = 从未真正发起对话（pi 首条消息前不落盘），
 *   创建超过 emptyTtlMs 后 closeChatSession 删元数据——列表只呈现真对话。
 * - **运行时空闲回收**：有消息的会话闲置超过 idleMs 后 piRuntime.close dispose AgentSession，
 *   历史保留（元数据 + JSONL），重进 ensureRunning 从 JSONL resume。
 *
 * active（turn 在跑 / 有人连着看）一律跳过；回收失败仅 warn，下轮重试。
 */

/** 扫描间隔。 */
const SCAN_INTERVAL_MS = 60_000;
/** 空会话存活上限（创建起算）——超时未发首条消息即清出列表。 */
const EMPTY_SESSION_TTL_MS = 3 * 60_000;
/** 运行时闲置回收阈值（最后活跃 updatedAt 起算）。 */
const IDLE_RECYCLE_MS = 10 * 60_000;

/** 回收器依赖面（PiRuntime 只用到 chatRuntimeState/close 两个方法，测试可轻量 stub）。 */
export type ChatIdleRecyclerDeps = {
  piRuntime: Pick<PiRuntime, "chatRuntimeState" | "close">;
  registry: Pick<ChatSessionRegistry, "listChatSessions" | "closeChatSession">;
  chatSessionsDir: string;
  intervalMs?: number;
  emptyTtlMs?: number;
  idleMs?: number;
  now?: () => Date;
};

/** 启动回收器，返回 stop（清定时器；在飞的扫描不中断）。测试环境不接线。 */
export function startChatIdleRecycler(deps: ChatIdleRecyclerDeps): () => void {
  const intervalMs = deps.intervalMs ?? SCAN_INTERVAL_MS;
  const emptyTtlMs = deps.emptyTtlMs ?? EMPTY_SESSION_TTL_MS;
  const idleMs = deps.idleMs ?? IDLE_RECYCLE_MS;
  const now = deps.now ?? (() => new Date());

  const scan = async (): Promise<void> => {
    let sessions: ChatSession[];
    try {
      sessions = await deps.registry.listChatSessions();
    } catch (error) {
      console.warn("[chat-idle-recycler] list failed", error);
      return;
    }
    for (const session of sessions) {
      try {
        await recycleIfEligible(session, {
          piRuntime: deps.piRuntime,
          registry: deps.registry,
          chatSessionsDir: deps.chatSessionsDir,
          emptyTtlMs,
          idleMs,
          now: now(),
        });
      } catch (error) {
        // 单会话失败不阻断其余扫描；下轮重试。
        console.warn(`[chat-idle-recycler] recycle failed: ${session.id}`, error);
      }
    }
  };

  const timer = setInterval(() => void scan(), intervalMs);
  // Node 定时器不阻止进程退出（与 API 进程生命周期同进退）。
  timer.unref?.();
  return () => clearInterval(timer);
}

/** 单会话回收判定（导出供单测直调，不走定时器）。 */
export async function recycleIfEligible(
  session: ChatSession,
  params: {
    piRuntime: ChatIdleRecyclerDeps["piRuntime"];
    registry: ChatIdleRecyclerDeps["registry"];
    chatSessionsDir: string;
    emptyTtlMs: number;
    idleMs: number;
    now: Date;
  },
): Promise<void> {
  const state = params.piRuntime.chatRuntimeState(session.id);
  if (state === "active") return;

  const hasMessages = await dirHasFiles(join(params.chatSessionsDir, "pi-jsonl", session.id));

  // 空会话：从未落盘消息 + 创建超龄 → 删元数据清出列表（closeHook 对无 entry 幂等）。
  if (!hasMessages) {
    if (params.now.getTime() - Date.parse(session.createdAt) > params.emptyTtlMs) {
      await params.registry.closeChatSession(session.id);
      console.log(`[chat-idle-recycler] empty session removed: ${session.id}`);
    }
    return;
  }

  // idle 运行时：有消息 + 最后活跃超龄 → dispose（历史保留，重进 resume）。
  if (state === "idle" && params.now.getTime() - Date.parse(session.updatedAt) > params.idleMs) {
    await params.piRuntime.close(session.id);
    console.log(`[chat-idle-recycler] idle runtime disposed: ${session.id}`);
  }
}

/** 目录存在且含至少一个文件（目录不存在 → false）。 */
async function dirHasFiles(dir: string): Promise<boolean> {
  try {
    const entries = await readdir(dir);
    return entries.length > 0;
  } catch {
    return false;
  }
}
