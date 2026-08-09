import { randomUUID } from "node:crypto";
import type { InstalledSkill, SkillTaskFrame } from "@agents-remote/shared";

// skill install/update 异步任务 registry：POST /api/skills/install|update 立即返 taskId（202），
// 后台 fire-and-forget 执行 skills CLI（git clone），完成时 finish() 广播终态给 SSE 订阅者。
// 前端 GET /api/skills/task/:id/events 用 EventSource 订阅，只消费 status 转换（两态 UI）。
//
// 进程内单例——API 重启丢内存任务，前端重连收到 SKILL_TASK_NOT_FOUND failed 帧干净 reject。
// 无 history 双缓冲（任务生命周期短，只保最近终态供中途连上的订阅者）；session-relay 的
// history/live 双缓冲是长驻 CLI + JSONL 回放场景，不复用其本体。

const TERMINATED_TTL_MS = 60_000; // 终态任务保留 60s 供 late-join，之后 evict 防泄漏
const SSE_HEARTBEAT_INTERVAL_MS = 15_000; // SSE comment 心跳，防隧道/反代空闲断连

type SkillTaskStatus = "running" | "done" | "failed";
type SkillTaskKind = "install" | "update";
type Subscriber = (frame: SkillTaskFrame) => void;

interface SkillTask {
  taskId: string;
  kind: SkillTaskKind;
  skillName: string;
  status: SkillTaskStatus;
  result?: { skill?: InstalledSkill; name?: string };
  error?: { code: string; message: string };
  subscribers: Set<Subscriber>;
  evictTimer?: ReturnType<typeof setTimeout>;
}

function toFrame(task: SkillTask): SkillTaskFrame {
  return {
    taskId: task.taskId,
    kind: task.kind,
    status: task.status,
    skill: task.result?.skill,
    name: task.result?.name ?? task.skillName,
    error: task.error,
  };
}

function safeCall(sub: Subscriber, frame: SkillTaskFrame): void {
  try {
    sub(frame);
  } catch {
    // 单订阅者异常隔离，不影响其他订阅者 / registry
  }
}

export class SkillTaskRegistry {
  private tasks = new Map<string, SkillTask>();
  // dedupKey → taskId（仅 running）。终态后摘除 → 新请求重新起 task（不返旧结果）。
  // per-skill 串行去重，防两个 install/update 同 URL 竞态写 ~/.agents/.skill-lock.json + 半装目录。
  // 注：lock 文件跨 skill 共享，per-skill 不能完全消除并发写竞态；如后续观察到损坏再升全局 mutex。
  private runningByKey = new Map<string, string>();

  /** 创建或加入同名 running task。joined=true 表示复用已有（去重命中）。 */
  startOrJoin(
    kind: SkillTaskKind,
    dedupKey: string,
    skillName: string,
  ): { taskId: string; status: SkillTaskStatus; joined: boolean } {
    const existingId = this.runningByKey.get(dedupKey);
    if (existingId) {
      const existing = this.tasks.get(existingId);
      if (existing?.status === "running") {
        return { taskId: existing.taskId, status: "running", joined: true };
      }
    }
    const taskId = randomUUID();
    this.tasks.set(taskId, {
      taskId,
      kind,
      skillName,
      status: "running",
      subscribers: new Set(),
    });
    this.runningByKey.set(dedupKey, taskId);
    return { taskId, status: "running", joined: false };
  }

  /** 订阅：立即回调当前态帧；running 任务后续收 live 终态帧。终态/未知 task 只回调一次。 */
  subscribe(taskId: string, onFrame: Subscriber): () => void {
    const task = this.tasks.get(taskId);
    if (!task) return () => {};
    safeCall(onFrame, toFrame(task));
    if (task.status !== "running") return () => {}; // 终态：已推一次
    task.subscribers.add(onFrame);
    return () => {
      task.subscribers.delete(onFrame);
    };
  }

  /** 终态：广播给所有订阅者 + 清 subscribers + 摘 runningByKey + TTL evict。幂等。 */
  finish(
    taskId: string,
    outcome:
      | { status: "done"; skill?: InstalledSkill; name?: string }
      | { status: "failed"; code: string; message: string },
  ): void {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== "running") return;
    task.status = outcome.status;
    if (outcome.status === "done") {
      task.result = { skill: outcome.skill, name: outcome.name };
    } else {
      task.error = { code: outcome.code, message: outcome.message };
    }
    for (const [key, id] of this.runningByKey) {
      if (id === taskId) {
        this.runningByKey.delete(key);
        break;
      }
    }
    const frame = toFrame(task);
    for (const sub of task.subscribers) safeCall(sub, frame);
    task.subscribers.clear();
    task.evictTimer = setTimeout(() => {
      this.tasks.delete(taskId);
    }, TERMINATED_TTL_MS);
  }

  get(taskId: string): SkillTask | undefined {
    return this.tasks.get(taskId);
  }

  /** 测试隔离。 */
  clear(): void {
    for (const task of this.tasks.values()) {
      if (task.evictTimer) clearTimeout(task.evictTimer);
    }
    this.tasks.clear();
    this.runningByKey.clear();
  }
}

export const skillTaskRegistry = new SkillTaskRegistry();

// SSE handler 的 server 参数只需 timeout（禁用本连接 idle 超时）。Bun Server 满足此结构类型。
type SseServer = {
  timeout(request: Request, seconds: number): unknown;
};

const TASK_EVENTS_PATH = /^\/api\/skills\/task\/([^/]+)\/events$/;

/**
 * GET /api/skills/task/:id/events —— skill install/update 异步任务的 SSE 进度流。
 * 立即推当前态 → running 则订阅 + 心跳 → 终态推完关闭。taskId 未知 → failed 帧后关闭
 * （不发 404：EventSource 会无限重连，用终态帧让客户端干净 reject）。
 */
export async function handleSkillTaskEvents(
  request: Request,
  url: URL,
  server: SseServer,
): Promise<Response | undefined> {
  const match = TASK_EVENTS_PATH.exec(url.pathname);
  if (!match || request.method !== "GET") return undefined;
  const taskId = decodeURIComponent(match[1]);

  // Bun 默认 idleTimeout=10s 会杀 SSE 流（全局 255 保留给 MCP 同步 spawn）；本连接禁用。
  server.timeout(request, 0);

  const task = skillTaskRegistry.get(taskId);
  const encoder = new TextEncoder();
  let cleanup: (() => void) | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enqueue = (text: string): void => {
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          /* 流已关 */
        }
      };

      // 未知 taskId（无效 / API 重启丢内存任务）→ 推 failed 后关闭
      if (!task) {
        enqueue(
          `data: ${JSON.stringify({
            taskId,
            status: "failed",
            error: {
              code: "SKILL_TASK_NOT_FOUND",
              message: "Skill task not found (expired or server restarted).",
            },
          } satisfies SkillTaskFrame)}\n\n`,
        );
        controller.close();
        return;
      }

      let heartbeat: ReturnType<typeof setInterval> | undefined;
      const unsubscribe = skillTaskRegistry.subscribe(taskId, (frame) => {
        enqueue(`data: ${JSON.stringify(frame)}\n\n`);
        if (frame.status === "done" || frame.status === "failed") {
          if (heartbeat) clearInterval(heartbeat);
          // 不在此调 unsubscribe()：终态任务的 subscribe 在本回调内同步触发，此时
          // `const unsubscribe = ...` 尚未赋值（TDZ）会抛错；且 unsubscribe 本就多余——
          // 终态任务 subscribe 返回 no-op，running→finish 时 registry.finish 已清 subscribers。
          try {
            controller.close();
          } catch {
            /* 已关 */
          }
        }
      });

      // 仅 running 任务需要长期保活心跳；终态任务 subscribe 已立即推完并关闭
      if (task.status === "running") {
        heartbeat = setInterval(() => enqueue(": heartbeat\n\n"), SSE_HEARTBEAT_INTERVAL_MS);
      }

      cleanup = () => {
        if (heartbeat) clearInterval(heartbeat);
        unsubscribe();
      };
    },
    cancel() {
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
