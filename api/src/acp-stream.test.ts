import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { join, sep } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { SessionMetadata, SessionRegistry } from "./session-registry";
import {
  AcpStreamController,
  handleAcpStreamUpgrade,
  matchAcpStreamRoute,
  type AcpWebSocketData,
} from "./acp-stream";
import { AcpRuntime } from "./acp-runtime";
import type { RuntimeStream } from "./session-registry";

type StreamSocket = {
  data?: unknown;
  send(message: string | Uint8Array | ArrayBuffer): void;
  close(code?: number, reason?: string): void;
};

// ── stubs ──────────────────────────────────────────────────────────────────────

/** stub AcpRuntime：记录调用、可编程 ensureRunning 实现、捕获 stream 的 onData/onError。 */
function makeStubRuntime() {
  const calls = { ensureRunning: 0, stream: 0, write: 0, interrupt: 0, close: 0 };
  const writeCalls: { runtimeKey: string; text: string; uuid?: string }[] = [];
  const streamCalls: {
    runtimeKey: string;
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
    stream: (runtimeKey: string, onData: (line: string) => void, onError: (e: Error) => void) => {
      calls.stream++;
      streamCalls.push({ runtimeKey, onData, onError });
      const handle = { closed: false };
      streamHandles.push(handle);
      return {
        close: () => {
          handle.closed = true;
        },
      } satisfies RuntimeStream;
    },
    write: (runtimeKey: string, text: string, uuid?: string) => {
      calls.write++;
      writeCalls.push({ runtimeKey, text, uuid });
    },
    interrupt: async () => {
      calls.interrupt++;
    },
    close: async () => {
      calls.close++;
    },
  };

  return {
    runtime: runtime as unknown as AcpRuntime,
    calls,
    writeCalls,
    streamCalls,
    streamHandles,
    setEnsureRunningImpl(fn: () => Promise<void>) {
      ensureRunningImpl = fn;
    },
  };
}

const makeRegistry = (metadata?: Partial<SessionMetadata>) =>
  ({
    getAgentMetadata: async () => metadata,
  }) as unknown as SessionRegistry;

const acpData: AcpWebSocketData = {
  kind: "acp-stream",
  sessionId: "s1",
  runtimeKey: "k1",
  projectPath: "/tmp/proj",
};

function makeSocket(data: AcpWebSocketData) {
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

// ── fixtures ───────────────────────────────────────────────────────────────────

let projectsRoot: string;

beforeAll(async () => {
  projectsRoot = await mkdtemp(join(sep, "tmp", "acp-stream-projects-"));
  await mkdir(join(projectsRoot, "demo"));
});

afterAll(async () => {
  await rm(projectsRoot, { recursive: true, force: true });
});

const acpMetadata = (extra: Partial<SessionMetadata> = {}): Partial<SessionMetadata> => ({
  id: "s1",
  // runtimeKey provider 段 = transport 家族 "acp"（omp 会话同款，与存量一致）。
  runtimeKey: "ar-agent-acp-demo-s1",
  provider: "omp",
  projectPath: join(projectsRoot, "demo"),
  acpSessionId: "acp-sess-1",
  ...extra,
});

// ── 路由匹配 ───────────────────────────────────────────────────────────────────

describe("matchAcpStreamRoute", () => {
  test("匹配 /api/projects/:p/agent-sessions/:id/acp-stream", () => {
    expect(matchAcpStreamRoute("/api/projects/demo/agent-sessions/s1/acp-stream")).toEqual({
      projectName: "demo",
      sessionId: "s1",
    });
    expect(matchAcpStreamRoute("/api/projects/demo%20x/agent-sessions/s%2F1/acp-stream")).toEqual({
      projectName: "demo x",
      sessionId: "s/1",
    });
  });

  test("不匹配：非 projects / 缺段 / 路径多余", () => {
    expect(
      matchAcpStreamRoute("/api/projects/demo/agent-sessions/s1/claude-stream"),
    ).toBeUndefined();
    expect(matchAcpStreamRoute("/api/projects/demo/agent-sessions/s1")).toBeUndefined();
    expect(
      matchAcpStreamRoute("/api/projects/demo/agent-sessions/s1/acp-stream/x"),
    ).toBeUndefined();
  });
});

// ── upgrade 校验 ───────────────────────────────────────────────────────────────

describe("handleAcpStreamUpgrade", () => {
  const streamUrl = (project = "demo", id = "s1") =>
    `http://localhost/api/projects/${project}/agent-sessions/${id}/acp-stream`;

  test("项目不存在 → 404", async () => {
    const { server, upgrades } = makeUpgradeServer(true);
    const req = new Request(streamUrl("missing"));
    const result = await handleAcpStreamUpgrade(
      req,
      new URL(req.url),
      projectsRoot,
      makeRegistry(),
      server,
    );
    expect(result.matched).toBe(true);
    expect(result.response?.status).toBe(404);
    expect(upgrades).toHaveLength(0);
  });

  test("session 不存在 / provider 非 ACP 类 CLI → SESSION_STREAM_MISMATCH 400", async () => {
    const { server, upgrades } = makeUpgradeServer(true);
    const req = new Request(streamUrl());
    const result = await handleAcpStreamUpgrade(
      req,
      new URL(req.url),
      projectsRoot,
      makeRegistry(), // undefined metadata
      server,
    );
    expect(result.matched).toBe(true);
    expect(result.response?.status).toBe(400);
    expect(await result.response?.json()).toMatchObject({
      error: { code: "SESSION_STREAM_MISMATCH" },
    });
    expect(upgrades).toHaveLength(0);

    const claudeResult = await handleAcpStreamUpgrade(
      new Request(streamUrl()),
      new URL(streamUrl()),
      projectsRoot,
      makeRegistry(acpMetadata({ provider: "claude" })),
      server,
    );
    expect(claudeResult.response?.status).toBe(400);
  });

  test("acp session → upgrade data {kind:acp-stream, sessionId, runtimeKey, provider, projectPath, acpSessionId}", async () => {
    const { server, upgrades } = makeUpgradeServer(true);
    const req = new Request(streamUrl());
    const result = await handleAcpStreamUpgrade(
      req,
      new URL(req.url),
      projectsRoot,
      makeRegistry(acpMetadata()),
      server,
    );
    expect(result.matched).toBe(true);
    expect(result.response).toBeUndefined();
    expect(upgrades).toEqual([
      {
        kind: "acp-stream",
        sessionId: "s1",
        runtimeKey: "ar-agent-acp-demo-s1",
        provider: "omp",
        projectPath: join(projectsRoot, "demo"),
        acpSessionId: "acp-sess-1",
      },
    ]);
  });

  test("upgrade 拒绝 → 426", async () => {
    const { server } = makeUpgradeServer(false);
    const req = new Request(streamUrl());
    const result = await handleAcpStreamUpgrade(
      req,
      new URL(req.url),
      projectsRoot,
      makeRegistry(acpMetadata()),
      server,
    );
    expect(result.matched).toBe(true);
    expect(result.response?.status).toBe(426);
  });
});

// ── 控制器 ─────────────────────────────────────────────────────────────────────

describe("AcpStreamController.open", () => {
  test("omp 未安装（ENOENT）→ SESSION_PROVIDER_UNAVAILABLE 错误帧，不订阅流", async () => {
    const stub = makeStubRuntime();
    stub.setEnsureRunningImpl(async () => {
      throw Object.assign(new Error("spawn omp ENOENT"), { code: "ENOENT" });
    });
    const controller = new AcpStreamController(stub.runtime);
    const { socket, sent } = makeSocket(acpData);
    await controller.open(socket);

    expect(stub.calls.ensureRunning).toBe(1);
    expect(stub.calls.stream).toBe(0);
    expect(sent).toEqual([
      JSON.stringify({
        type: "error",
        code: "SESSION_PROVIDER_UNAVAILABLE",
        message: "ACP agent command not found (install omp)",
      }),
    ]);
  });

  test("ensureRunning 其它错误 → SESSION_RUNTIME_ERROR 错误帧", async () => {
    const stub = makeStubRuntime();
    stub.setEnsureRunningImpl(async () => {
      throw new Error("boom");
    });
    const controller = new AcpStreamController(stub.runtime);
    const { socket, sent } = makeSocket(acpData);
    await controller.open(socket);

    expect(sent[0]).toContain('"SESSION_RUNTIME_ERROR"');
  });

  test("成功 → stream 订阅，batch markers + 实时行经 createBatchEmitter 转发", async () => {
    const stub = makeStubRuntime();
    const controller = new AcpStreamController(stub.runtime);
    const { socket, sent } = makeSocket(acpData);
    await controller.open(socket);

    expect(stub.calls.ensureRunning).toBe(1);
    expect(stub.calls.stream).toBe(1);
    expect(stub.streamCalls[0].runtimeKey).toBe("k1");

    // 喂 relay 帧（history batch 空 → 纯文本 markers；实时 acp_event 文本行转发）。
    const onData = stub.streamCalls[0].onData;
    onData(JSON.stringify({ type: "session_init", resume: false }));
    onData(JSON.stringify({ type: "history_start", count: 0 }));
    onData(JSON.stringify({ type: "history_end" }));
    onData(JSON.stringify({ type: "live_start", count: 0 }));
    onData(JSON.stringify({ type: "live_end" }));
    onData(JSON.stringify({ type: "acp_event", event: { sessionUpdate: "agent_message_chunk" } }));

    expect(sent[sent.length - 1]).toBe(
      JSON.stringify({ type: "acp_event", event: { sessionUpdate: "agent_message_chunk" } }),
    );
    expect(sent.some((l) => l.includes('"live_start"'))).toBe(true);
    expect(sent.some((l) => l.includes('"history_start"'))).toBe(true);
  });
});

describe("AcpStreamController.message", () => {
  test("ping → pong", async () => {
    const stub = makeStubRuntime();
    const controller = new AcpStreamController(stub.runtime);
    const { socket, sent } = makeSocket(acpData);
    await controller.open(socket);
    sent.length = 0;

    await controller.message(socket, JSON.stringify({ type: "ping" }));
    expect(sent).toEqual([JSON.stringify({ type: "pong" })]);
    expect(stub.calls.write).toBe(0);
  });

  test("user → runtime.write(runtimeKey, text, uuid)", async () => {
    const stub = makeStubRuntime();
    const controller = new AcpStreamController(stub.runtime);
    const { socket } = makeSocket(acpData);
    await controller.open(socket);

    await controller.message(socket, JSON.stringify({ type: "user", text: "hi", uuid: "u1" }));
    expect(stub.calls.write).toBe(1);
    expect(stub.writeCalls[0]).toEqual({ runtimeKey: "k1", text: "hi", uuid: "u1" });
    expect(stub.calls.interrupt).toBe(0);
  });

  test("interrupt → runtime.interrupt", async () => {
    const stub = makeStubRuntime();
    const controller = new AcpStreamController(stub.runtime);
    const { socket } = makeSocket(acpData);
    await controller.open(socket);

    await controller.message(socket, JSON.stringify({ type: "interrupt" }));
    expect(stub.calls.interrupt).toBe(1);
    expect(stub.calls.write).toBe(0);
  });

  test("非法 JSON → 错误帧", async () => {
    const stub = makeStubRuntime();
    const controller = new AcpStreamController(stub.runtime);
    const { socket, sent } = makeSocket(acpData);
    await controller.open(socket);
    sent.length = 0;

    await controller.message(socket, "{not json");
    expect(sent[0]).toContain('"SESSION_RUNTIME_ERROR"');
  });
});

describe("AcpStreamController.close", () => {
  test("close 只断流订阅，不杀 ACP agent 进程", async () => {
    const stub = makeStubRuntime();
    const controller = new AcpStreamController(stub.runtime);
    const { socket } = makeSocket(acpData);
    await controller.open(socket);
    expect(stub.calls.stream).toBe(1);
    expect(stub.streamHandles[0].closed).toBe(false);

    controller.close(socket);
    expect(stub.streamHandles[0].closed).toBe(true); // 订阅断流
    expect(stub.calls.close).toBe(0); // 不调 AcpRuntime.close → agent 进程保留
  });
});
