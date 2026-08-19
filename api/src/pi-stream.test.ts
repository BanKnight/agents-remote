import { describe, expect, test } from "bun:test";
import type { AuthService } from "./auth";
import type { ChatSessionRegistry } from "./chat-session-registry";
import {
  handlePiStreamUpgrade,
  matchPiStreamRoute,
  PiStreamController,
  type PiWebSocketData,
} from "./pi-stream";
import { PiNotConfiguredError, PiRuntime } from "./pi-runtime";
import type { RuntimeStream } from "./session-registry";

type StreamSocket = {
  data?: unknown;
  send(message: string | Uint8Array | ArrayBuffer): void;
  close(code?: number, reason?: string): void;
};

const PI_DATA: PiWebSocketData = { kind: "pi-stream", chatId: "c1" };

function makeSocket(data: PiWebSocketData) {
  const sent: string[] = [];
  const socket = {
    data,
    send: (m: string | Uint8Array | ArrayBuffer) => {
      sent.push(typeof m === "string" ? m : "[binary]");
    },
    close: () => {},
  };
  return { socket: socket as unknown as StreamSocket, sent };
}

/** stub PiRuntime：记录调用、可编程 ensureRunning 实现、捕获 stream 的 onData/onError。 */
function makeStubRuntime() {
  const calls = { ensureRunning: 0, stream: 0, send: 0, interrupt: 0, close: 0 };
  const sendCalls: { chatId: string; text: string; uuid?: string; images?: unknown[] }[] = [];
  const streamCalls: {
    chatId: string;
    onData: (line: string) => void;
    onError: (e: Error) => void;
  }[] = [];
  const streamHandles: { closed: boolean }[] = [];
  let ensureRunningImpl: () => Promise<void> = async () => {};

  const runtime = {
    ensureRunning: async () => {
      calls.ensureRunning++;
      await ensureRunningImpl();
    },
    stream: (chatId: string, onData: (line: string) => void, onError: (e: Error) => void) => {
      calls.stream++;
      streamCalls.push({ chatId, onData, onError });
      const handle = { closed: false };
      streamHandles.push(handle);
      return {
        close: () => {
          handle.closed = true;
        },
      } satisfies RuntimeStream;
    },
    send: (chatId: string, text: string, uuid?: string, images?: unknown[]) => {
      calls.send++;
      sendCalls.push({ chatId, text, uuid, images });
    },
    interrupt: async () => {
      calls.interrupt++;
    },
    close: async () => {
      calls.close++;
    },
  };

  return {
    runtime: runtime as unknown as PiRuntime,
    calls,
    sendCalls,
    streamCalls,
    streamHandles,
    setEnsureRunningImpl(fn: () => Promise<void>) {
      ensureRunningImpl = fn;
    },
  };
}

function makeRegistry(ids: string[] = []) {
  const map = new Map(ids.map((id) => [id, { id }]));
  return {
    getChatSession: async (id: string) => map.get(id),
  } as unknown as ChatSessionRegistry;
}

const makeAuth = (verify: () => boolean) => ({ verify }) as unknown as AuthService;

const streamUrl = (chatId: string) => `http://localhost/api/chat-sessions/${chatId}/stream`;

const makeUpgradeServer = (result: boolean) => {
  const upgrades: (Record<string, unknown> | undefined)[] = [];
  const server = {
    upgrade: (_request: Request, opts?: { data?: Record<string, unknown> }) => {
      upgrades.push(opts?.data);
      return result;
    },
  };
  return { server: server as never, upgrades };
};

describe("matchPiStreamRoute", () => {
  test("匹配 /api/chat-sessions/:chatId/stream → chatId", () => {
    expect(matchPiStreamRoute("/api/chat-sessions/c1/stream")).toBe("c1");
    expect(matchPiStreamRoute("/api/chat-sessions/abc%20def/stream")).toBe("abc def");
  });

  test("不匹配：非 chat-sessions / 缺段 / 路径多余", () => {
    expect(matchPiStreamRoute("/api/projects/p/agent-sessions/s/claude-stream")).toBeUndefined();
    expect(matchPiStreamRoute("/api/chat-sessions/c1")).toBeUndefined();
    expect(matchPiStreamRoute("/api/chat-sessions/c1/other")).toBeUndefined();
    expect(matchPiStreamRoute("/api/chat-sessions/c1/stream/x")).toBeUndefined();
  });
});

describe("handlePiStreamUpgrade", () => {
  test("未认证 → 401", async () => {
    const auth = makeAuth(() => false);
    const registry = makeRegistry(["c1"]);
    const { server, upgrades } = makeUpgradeServer(true);
    const req = new Request(streamUrl("c1")); // 无 token header
    const result = await handlePiStreamUpgrade(req, new URL(req.url), auth, registry, server);
    expect(result.matched).toBe(true);
    expect(result.response?.status).toBe(401);
    expect(upgrades).toHaveLength(0);
  });

  test("会话不存在 → 404", async () => {
    const auth = makeAuth(() => true);
    const registry = makeRegistry([]); // c1 不存在
    const { server, upgrades } = makeUpgradeServer(true);
    const req = new Request(streamUrl("c1"), {
      headers: { authorization: "Bearer tok" },
    });
    const result = await handlePiStreamUpgrade(req, new URL(req.url), auth, registry, server);
    expect(result.matched).toBe(true);
    expect(result.response?.status).toBe(404);
    expect(upgrades).toHaveLength(0);
  });

  test("认证 + 会话存在 → upgrade data {kind:pi-stream, chatId}", async () => {
    const auth = makeAuth(() => true);
    const registry = makeRegistry(["c1"]);
    const { server, upgrades } = makeUpgradeServer(true);
    const req = new Request(streamUrl("c1"), {
      headers: { authorization: "Bearer tok" },
    });
    const result = await handlePiStreamUpgrade(req, new URL(req.url), auth, registry, server);
    expect(result.matched).toBe(true);
    expect(result.response).toBeUndefined();
    expect(upgrades).toEqual([{ kind: "pi-stream", chatId: "c1" }]);
  });

  test("upgrade 拒绝 → 426", async () => {
    const auth = makeAuth(() => true);
    const registry = makeRegistry(["c1"]);
    const { server } = makeUpgradeServer(false);
    const req = new Request(streamUrl("c1"), {
      headers: { authorization: "Bearer tok" },
    });
    const result = await handlePiStreamUpgrade(req, new URL(req.url), auth, registry, server);
    expect(result.matched).toBe(true);
    expect(result.response?.status).toBe(426);
  });
});

describe("PiStreamController.open", () => {
  test("未配置 → SESSION_NOT_CONFIGURED 错误帧，不订阅流", async () => {
    const stub = makeStubRuntime();
    stub.setEnsureRunningImpl(async () => {
      throw new PiNotConfiguredError();
    });
    const controller = new PiStreamController(stub.runtime, makeRegistry());
    const { socket, sent } = makeSocket(PI_DATA);
    await controller.open(socket);

    expect(stub.calls.ensureRunning).toBe(1);
    expect(stub.calls.stream).toBe(0);
    expect(sent).toEqual([
      JSON.stringify({
        type: "error",
        code: "SESSION_NOT_CONFIGURED",
        message: "pi runtime 未配置",
      }),
    ]);
  });

  test("ensureRunning 其它错误 → SESSION_RUNTIME_ERROR 错误帧", async () => {
    const stub = makeStubRuntime();
    stub.setEnsureRunningImpl(async () => {
      throw new Error("boom");
    });
    const controller = new PiStreamController(stub.runtime, makeRegistry());
    const { socket, sent } = makeSocket(PI_DATA);
    await controller.open(socket);

    expect(sent[0]).toContain('"SESSION_RUNTIME_ERROR"');
  });

  test("成功 → stream 订阅，batch markers + 实时行经 createBatchEmitter 转发", async () => {
    const stub = makeStubRuntime();
    const controller = new PiStreamController(stub.runtime, makeRegistry());
    const { socket, sent } = makeSocket(PI_DATA);
    await controller.open(socket);

    expect(stub.calls.ensureRunning).toBe(1);
    expect(stub.calls.stream).toBe(1);
    expect(stub.streamCalls[0].chatId).toBe("c1");

    // 喂 relay 帧（history batch 空 → 纯文本 markers；live batch 空 → 实时 pi_event 文本行）。
    const onData = stub.streamCalls[0].onData;
    onData(JSON.stringify({ type: "session_init", resume: false }));
    onData(JSON.stringify({ type: "history_start", count: 0 }));
    onData(JSON.stringify({ type: "history_end" }));
    onData(JSON.stringify({ type: "live_start", count: 0 }));
    onData(JSON.stringify({ type: "live_end" }));
    onData(JSON.stringify({ type: "pi_event", event: { type: "agent_start" } }));

    expect(sent[sent.length - 1]).toBe(
      JSON.stringify({ type: "pi_event", event: { type: "agent_start" } }),
    );
    expect(sent.some((l) => l.includes('"live_start"'))).toBe(true);
    expect(sent.some((l) => l.includes('"history_start"'))).toBe(true);
  });
});

describe("PiStreamController.message", () => {
  test("ping → pong", async () => {
    const stub = makeStubRuntime();
    const controller = new PiStreamController(stub.runtime, makeRegistry());
    const { socket, sent } = makeSocket(PI_DATA);
    await controller.open(socket);
    sent.length = 0;

    await controller.message(socket, JSON.stringify({ type: "ping" }));
    expect(sent).toEqual([JSON.stringify({ type: "pong" })]);
    expect(stub.calls.send).toBe(0);
  });

  test("user → PiRuntime.send(chatId, text)", async () => {
    const stub = makeStubRuntime();
    const controller = new PiStreamController(stub.runtime, makeRegistry());
    const { socket } = makeSocket(PI_DATA);
    await controller.open(socket);

    await controller.message(socket, JSON.stringify({ type: "user", text: "hi" }));
    expect(stub.calls.send).toBe(1);
    expect(stub.sendCalls[0]).toEqual({
      chatId: "c1",
      text: "hi",
      uuid: undefined,
      images: undefined,
    });
    expect(stub.calls.interrupt).toBe(0);
  });

  test("user 带 images → PiRuntime.send 透传 images", async () => {
    const stub = makeStubRuntime();
    const controller = new PiStreamController(stub.runtime, makeRegistry());
    const { socket } = makeSocket(PI_DATA);
    await controller.open(socket);

    await controller.message(
      socket,
      JSON.stringify({
        type: "user",
        text: "看图",
        uuid: "u-1",
        images: [
          { data: "aGVsbG8=", mimeType: "image/png" },
          { data: "d29ybGQ=", mimeType: "image/jpeg" },
        ],
      }),
    );
    expect(stub.calls.send).toBe(1);
    expect(stub.sendCalls[0]).toEqual({
      chatId: "c1",
      text: "看图",
      uuid: "u-1",
      images: [
        { data: "aGVsbG8=", mimeType: "image/png" },
        { data: "d29ybGQ=", mimeType: "image/jpeg" },
      ],
    });
  });

  test("interrupt → PiRuntime.interrupt", async () => {
    const stub = makeStubRuntime();
    const controller = new PiStreamController(stub.runtime, makeRegistry());
    const { socket } = makeSocket(PI_DATA);
    await controller.open(socket);

    await controller.message(socket, JSON.stringify({ type: "interrupt" }));
    expect(stub.calls.interrupt).toBe(1);
    expect(stub.calls.send).toBe(0);
  });

  test("非法 JSON → 错误帧", async () => {
    const stub = makeStubRuntime();
    const controller = new PiStreamController(stub.runtime, makeRegistry());
    const { socket, sent } = makeSocket(PI_DATA);
    await controller.open(socket);
    sent.length = 0;

    await controller.message(socket, "{not json");
    expect(sent[0]).toContain('"SESSION_RUNTIME_ERROR"');
  });
});

describe("PiStreamController.close", () => {
  test("close 只断流订阅，不 dispose AgentSession", async () => {
    const stub = makeStubRuntime();
    const controller = new PiStreamController(stub.runtime, makeRegistry());
    const { socket } = makeSocket(PI_DATA);
    await controller.open(socket);
    expect(stub.calls.stream).toBe(1);
    expect(stub.streamHandles[0].closed).toBe(false);

    controller.close(socket);
    expect(stub.streamHandles[0].closed).toBe(true); // 订阅断流
    expect(stub.calls.close).toBe(0); // 不调 PiRuntime.close → AgentSession 未 dispose
  });
});
