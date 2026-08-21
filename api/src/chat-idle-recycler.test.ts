import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChatSession } from "@agents-remote/shared";
import { recycleIfEligible, startChatIdleRecycler } from "./chat-idle-recycler";

/** 默认阈值（与产线常量一致，按需覆盖）。 */
const TTL = { emptyTtlMs: 3 * 60_000, idleMs: 10 * 60_000 };
const NOW = new Date("2026-08-21T12:00:00.000Z");

let tmp: string;
let chatSessionsDir: string;

beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), "chat-idle-recycler-"));
  chatSessionsDir = join(tmp, "chat-sessions");
});

afterAll(async () => {
  await rm(tmp, { recursive: true, force: true });
});

const makeSession = (overrides: Partial<ChatSession> = {}): ChatSession => ({
  id: overrides.id ?? "chat_c1",
  displayName: "测试会话",
  status: "idle",
  createdAt: "2026-08-21T11:00:00.000Z", // 距 NOW 1h（超空会话 TTL）
  updatedAt: "2026-08-21T11:00:00.000Z", // 距 NOW 1h（超 idle 阈值）
  ...overrides,
});

/** 在 pi-jsonl/<chatId>/ 下落一个消息文件（= 真正发起过对话）。 */
async function seedMessages(chatId: string): Promise<void> {
  await mkdir(join(chatSessionsDir, "pi-jsonl", chatId), { recursive: true });
  await writeFile(join(chatSessionsDir, "pi-jsonl", chatId, "session.jsonl"), "{}\n");
}

/** 依赖 stub：记录 close/closeChatSession 调用。 */
function makeDeps(states: Record<string, "none" | "active" | "idle"> = {}) {
  const piClosed: string[] = [];
  const registryClosed: string[] = [];
  return {
    piClosed,
    registryClosed,
    piRuntime: {
      chatRuntimeState: (chatId: string) => states[chatId] ?? "none",
      close: async (chatId: string) => {
        piClosed.push(chatId);
      },
    },
    registry: {
      listChatSessions: async () => [] as ChatSession[],
      closeChatSession: async (chatId: string) => {
        registryClosed.push(chatId);
      },
    },
  };
}

describe("recycleIfEligible", () => {
  test("空会话（无 JSONL 文件）+ 创建超龄 → closeChatSession 删元数据", async () => {
    const deps = makeDeps();
    await recycleIfEligible(makeSession(), {
      ...deps,
      chatSessionsDir,
      ...TTL,
      now: NOW,
    });
    expect(deps.registryClosed).toEqual(["chat_c1"]);
    expect(deps.piClosed).toEqual([]);
  });

  test("空会话但 createdAt 未超 3min → 跳过（新建竞态保护）", async () => {
    const deps = makeDeps();
    await recycleIfEligible(
      makeSession({ createdAt: "2026-08-21T11:58:00.000Z", updatedAt: "2026-08-21T11:58:00.000Z" }),
      { ...deps, chatSessionsDir, ...TTL, now: NOW },
    );
    expect(deps.registryClosed).toEqual([]);
    expect(deps.piClosed).toEqual([]);
  });

  test("active（turn 在跑/有人连着）→ 一律不动", async () => {
    const deps = makeDeps({ chat_c1: "active" });
    await recycleIfEligible(makeSession(), {
      ...deps,
      chatSessionsDir,
      ...TTL,
      now: NOW,
    });
    expect(deps.registryClosed).toEqual([]);
    expect(deps.piClosed).toEqual([]);
  });

  test("idle + 有消息 + 最后活跃超 10min → 只 piRuntime.close（元数据/JSONL 保留）", async () => {
    await seedMessages("chat_c2");
    const deps = makeDeps({ chat_c2: "idle" });
    await recycleIfEligible(makeSession({ id: "chat_c2" }), {
      ...deps,
      chatSessionsDir,
      ...TTL,
      now: NOW,
    });
    expect(deps.piClosed).toEqual(["chat_c2"]);
    expect(deps.registryClosed).toEqual([]);
  });

  test("idle + 有消息但 updatedAt 未超 10min → 跳过", async () => {
    await seedMessages("chat_c3");
    const deps = makeDeps({ chat_c3: "idle" });
    await recycleIfEligible(makeSession({ id: "chat_c3", updatedAt: "2026-08-21T11:55:00.000Z" }), {
      ...deps,
      chatSessionsDir,
      ...TTL,
      now: NOW,
    });
    expect(deps.piClosed).toEqual([]);
    expect(deps.registryClosed).toEqual([]);
  });

  test("runtime none + 有消息（重启后未 ensureRunning）→ 无事可做，元数据保留", async () => {
    await seedMessages("chat_c4");
    const deps = makeDeps();
    await recycleIfEligible(makeSession({ id: "chat_c4" }), {
      ...deps,
      chatSessionsDir,
      ...TTL,
      now: NOW,
    });
    expect(deps.piClosed).toEqual([]);
    expect(deps.registryClosed).toEqual([]);
  });
});

describe("startChatIdleRecycler", () => {
  test("定时扫描驱动回收，单会话失败不崩、下轮重试", async () => {
    const deps = makeDeps();
    let failFirst = true;
    const registry = {
      listChatSessions: async () => [makeSession()],
      closeChatSession: async (chatId: string) => {
        if (failFirst) {
          failFirst = false;
          throw new Error("boom");
        }
        deps.registry.closeChatSession(chatId);
      },
    };
    const stop = startChatIdleRecycler({
      ...deps,
      registry,
      chatSessionsDir,
      intervalMs: 20,
      ...TTL,
      now: () => NOW,
    });
    // 第一轮失败（warn 不崩）→ 第二轮重试成功。
    await new Promise((resolve) => setTimeout(resolve, 60));
    stop();
    expect(deps.registryClosed).toEqual(["chat_c1"]);
  });

  test("stop 后不再扫描", async () => {
    const deps = makeDeps();
    const stop = startChatIdleRecycler({
      ...deps,
      chatSessionsDir,
      intervalMs: 20,
      ...TTL,
      now: () => NOW,
    });
    stop();
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(deps.registryClosed).toEqual([]);
  });
});
