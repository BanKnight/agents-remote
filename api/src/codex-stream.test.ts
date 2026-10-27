import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join, sep } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { RuntimeStream, SessionMetadata, SessionRegistry } from "./session-registry";
import {
  CodexStreamController,
  handleCodexStreamUpgrade,
  matchCodexStreamRoute,
  parseControlRequestId,
  type CodexWebSocketData,
} from "./codex-stream";
import type { CodexRuntime } from "./codex-runtime";

type StreamSocket = {
  data?: unknown;
  send(message: string | Uint8Array | ArrayBuffer): void;
  close(code?: number, reason?: string): void;
};

// ── stubs ──────────────────────────────────────────────────────────────────────

/** stub CodexRuntime：记录调用、可编程 ensureRunning 实现、捕获 stream 的 onData/onError。 */
function makeStubRuntime() {
  const calls = { ensureRunning: 0, stream: 0, write: 0, interrupt: 0, close: 0 };
  const writeCalls: { runtimeKey: string; text: string; uuid?: string }[] = [];
  const setConfigCalls: {
    runtimeKey: string;
    patch: { model?: string; effort?: string; approvalPolicy?: string; sandbox?: string };
  }[] = [];
  const respondCalls: { runtimeKey: string; rpcId: number | string; decision: string }[] = [];
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
    setThreadConfig: (
      runtimeKey: string,
      patch: { model?: string; effort?: string; approvalPolicy?: string; sandbox?: string },
    ) => {
      setConfigCalls.push({ runtimeKey, patch });
      return { type: "codex_config", models: [], current: {} };
    },
    respondApproval: (runtimeKey: string, rpcId: number | string, decision: string) => {
      respondCalls.push({ runtimeKey, rpcId, decision });
    },
    close: async () => {
      calls.close++;
    },
  };

  return {
    runtime: runtime as unknown as CodexRuntime,
    calls,
    writeCalls,
    setConfigCalls,
    respondCalls,
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

const codexData: CodexWebSocketData = {
  kind: "codex-stream",
  sessionId: "s1",
  projectName: "demo",
  runtimeKey: "k1",
  projectPath: "/tmp/proj",
  codexThreadId: "th-1",
};

function makeSocket(data: CodexWebSocketData) {
  const sent: string[] = [];
  const socket = {
    data,
    send: (m: string | Uint8Array | ArrayBuffer) => {
      // 批次帧是 gzip 二进制（createBatchEmitter）；解压还原行，顺带验证批次往返无损。
      if (typeof m === "string") {
        sent.push(m);
        return;
      }
      const bytes = m instanceof Uint8Array ? m : new Uint8Array(m);
      // gunzipSync 返回裸 Uint8Array（toString 是字节串），必须 TextDecoder 解码。
      const text = new TextDecoder().decode(Bun.gunzipSync(Buffer.from(bytes)));
      for (const line of text.split("\n")) sent.push(line);
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
  projectsRoot = await mkdtemp(join(sep, "tmp", "codex-stream-projects-"));
  await mkdir(join(projectsRoot, "demo"));
});

afterAll(async () => {
  await rm(projectsRoot, { recursive: true, force: true });
});

const codexMetadata = (extra: Partial<SessionMetadata> = {}): Partial<SessionMetadata> => ({
  id: "s1",
  projectName: "demo",
  runtimeKey: "ar-agent-codex-demo-s1",
  provider: "codex",
  projectPath: join(projectsRoot, "demo"),
  codexThreadId: "th-1",
  ...extra,
});

// ── 路由匹配 ───────────────────────────────────────────────────────────────────

describe("matchCodexStreamRoute", () => {
  test("匹配 /api/projects/:p/agent-sessions/:id/codex-stream（含 decode）", () => {
    expect(matchCodexStreamRoute("/api/projects/demo/agent-sessions/s1/codex-stream")).toEqual({
      projectName: "demo",
      sessionId: "s1",
    });
    expect(
      matchCodexStreamRoute("/api/projects/demo%20x/agent-sessions/s%2F1/codex-stream"),
    ).toEqual({ projectName: "demo x", sessionId: "s/1" });
  });

  test("不匹配：非 projects / 缺段 / 路径多余 / 其它流", () => {
    expect(
      matchCodexStreamRoute("/api/projects/demo/agent-sessions/s1/acp-stream"),
    ).toBeUndefined();
    expect(matchCodexStreamRoute("/api/projects/demo/agent-sessions/s1")).toBeUndefined();
    expect(
      matchCodexStreamRoute("/api/projects/demo/agent-sessions/s1/codex-stream/x"),
    ).toBeUndefined();
  });
});

describe("parseControlRequestId", () => {
  test('"codex:<n>" → 数字/字符串；非前缀/空 → undefined', () => {
    expect(parseControlRequestId("codex:3")).toBe(3);
    expect(parseControlRequestId("codex:abc")).toBe("abc");
    expect(parseControlRequestId("claude:3")).toBeUndefined();
    expect(parseControlRequestId("codex:")).toBeUndefined();
  });
});

// ── upgrade 校验 ───────────────────────────────────────────────────────────────

describe("handleCodexStreamUpgrade", () => {
  const streamUrl = (project = "demo", id = "s1") =>
    `http://localhost/api/projects/${project}/agent-sessions/${id}/codex-stream`;

  test("项目不存在 → 404", async () => {
    const { server, upgrades } = makeUpgradeServer(true);
    const req = new Request(streamUrl("missing"));
    const result = await handleCodexStreamUpgrade(
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

  test("session 不存在 / provider 非 codex → SESSION_STREAM_MISMATCH 400；无 threadId 放行（open 即迁移）", async () => {
    const { server, upgrades } = makeUpgradeServer(true);
    const rejectCases: (Partial<SessionMetadata> | undefined)[] = [
      undefined,
      codexMetadata({ provider: "claude" }),
    ];
    for (const metadata of rejectCases) {
      const req = new Request(streamUrl());
      const result = await handleCodexStreamUpgrade(
        req,
        new URL(req.url),
        projectsRoot,
        makeRegistry(metadata),
        server,
      );
      expect(result.matched).toBe(true);
      expect(result.response?.status).toBe(400);
      expect(await result.response?.json()).toMatchObject({
        error: { code: "SESSION_STREAM_MISMATCH" },
      });
    }
    expect(upgrades).toHaveLength(0);

    // 存量 tmux 形态（无 threadId）：放行 upgrade（data 无 threadId 字段）——
    // 诚实形态标记归前端面板路由；误连后果只是 open 即迁移。
    const legacyReq = new Request(streamUrl());
    const legacy = await handleCodexStreamUpgrade(
      legacyReq,
      new URL(legacyReq.url),
      projectsRoot,
      makeRegistry(codexMetadata({ codexThreadId: undefined })),
      server,
    );
    expect(legacy.matched).toBe(true);
    expect(legacy.response).toBeUndefined();
    expect(upgrades[0]).toMatchObject({
      kind: "codex-stream",
      sessionId: "s1",
      codexThreadId: undefined,
    });
  });

  test("codex app-server 会话 → upgrade data 带 threadId/权限/模型档", async () => {
    const { server, upgrades } = makeUpgradeServer(true);
    const req = new Request(streamUrl());
    const result = await handleCodexStreamUpgrade(
      req,
      new URL(req.url),
      projectsRoot,
      makeRegistry(
        codexMetadata({ permissionMode: "default", model: "gpt-5.1-codex", effort: "high" }),
      ),
      server,
    );
    expect(result.matched).toBe(true);
    expect(result.response).toBeUndefined();
    expect(upgrades).toEqual([
      {
        kind: "codex-stream",
        sessionId: "s1",
        projectName: "demo",
        runtimeKey: "ar-agent-codex-demo-s1",
        projectPath: join(projectsRoot, "demo"),
        codexThreadId: "th-1",
        permissionMode: "default",
        model: "gpt-5.1-codex",
        effort: "high",
      },
    ]);
  });

  test("upgrade 拒绝 → 426", async () => {
    const { server } = makeUpgradeServer(false);
    const req = new Request(streamUrl());
    const result = await handleCodexStreamUpgrade(
      req,
      new URL(req.url),
      projectsRoot,
      makeRegistry(codexMetadata()),
      server,
    );
    expect(result.matched).toBe(true);
    expect(result.response?.status).toBe(426);
  });
});

// ── 控制器 ─────────────────────────────────────────────────────────────────────

describe("CodexStreamController.open", () => {
  test("codex 未安装（ENOENT）→ SESSION_PROVIDER_UNAVAILABLE，不订阅流", async () => {
    const stub = makeStubRuntime();
    stub.setEnsureRunningImpl(async () => {
      throw Object.assign(new Error("spawn codex ENOENT"), { code: "ENOENT" });
    });
    const controller = new CodexStreamController(stub.runtime);
    const { socket, sent } = makeSocket(codexData);
    await controller.open(socket);

    expect(stub.calls.ensureRunning).toBe(1);
    expect(stub.calls.stream).toBe(0);
    expect(JSON.parse(sent[0] ?? "{}")).toMatchObject({
      type: "error",
      code: "SESSION_PROVIDER_UNAVAILABLE",
    });
  });

  test("ensureRunning 其它错误 → SESSION_RUNTIME_ERROR", async () => {
    const stub = makeStubRuntime();
    stub.setEnsureRunningImpl(async () => {
      throw new Error("boom");
    });
    const controller = new CodexStreamController(stub.runtime);
    const { socket, sent } = makeSocket(codexData);
    await controller.open(socket);

    expect(sent[0]).toContain('"SESSION_RUNTIME_ERROR"');
  });

  test("成功 → 订阅 stream，codex_event 实时行经 batch emitter 转发", async () => {
    const stub = makeStubRuntime();
    const controller = new CodexStreamController(stub.runtime);
    const { socket, sent } = makeSocket(codexData);
    await controller.open(socket);

    expect(stub.calls.ensureRunning).toBe(1);
    expect(stub.calls.stream).toBe(1);
    expect(stub.streamCalls[0]?.runtimeKey).toBe("k1");

    const onData = stub.streamCalls[0]!.onData;
    onData(JSON.stringify({ type: "session_init", resume: true }));
    onData(JSON.stringify({ type: "history_start", count: 2 }));
    onData(
      JSON.stringify({
        type: "codex_event",
        event: { method: "item/completed", params: { item: { type: "agentMessage" } } },
      }),
    );
    onData(JSON.stringify({ type: "history_end" }));

    expect(sent.some((l) => l.includes('"history_start"'))).toBe(true);
    expect(sent.some((l) => l.includes("item/completed"))).toBe(true);
  });
});

describe("CodexStreamController.message", () => {
  const openController = async () => {
    const stub = makeStubRuntime();
    const controller = new CodexStreamController(stub.runtime);
    const { socket, sent } = makeSocket(codexData);
    await controller.open(socket);
    sent.length = 0;
    return { stub, controller, socket, sent };
  };

  test("ping → pong", async () => {
    const { stub, controller, socket, sent } = await openController();
    await controller.message(socket, JSON.stringify({ type: "ping" }));
    expect(sent).toEqual([JSON.stringify({ type: "pong" })]);
    expect(stub.calls.write).toBe(0);
  });

  test("user → runtime.write(runtimeKey, text, uuid)", async () => {
    const { stub, controller, socket } = await openController();
    await controller.message(socket, JSON.stringify({ type: "user", text: "hi", uuid: "u1" }));
    expect(stub.writeCalls[0]).toEqual({ runtimeKey: "k1", text: "hi", uuid: "u1" });
  });

  test("interrupt → runtime.interrupt", async () => {
    const { stub, controller, socket } = await openController();
    await controller.message(socket, JSON.stringify({ type: "interrupt" }));
    expect(stub.calls.interrupt).toBe(1);
  });

  test("set_config：合法字段进 patch；白名单外字段（未知权限值）静默丢弃", async () => {
    const { stub, controller, socket } = await openController();
    await controller.message(
      socket,
      JSON.stringify({
        type: "set_config",
        model: "gpt-5.1-codex",
        effort: "high",
        approvalPolicy: "readonly",
        sandbox: "bogus-mode",
      }),
    );
    expect(stub.setConfigCalls[0]).toEqual({
      runtimeKey: "k1",
      patch: { model: "gpt-5.1-codex", effort: "high", approvalPolicy: "readonly" },
    });

    // 全字段非法 → 不调 runtime。
    await controller.message(
      socket,
      JSON.stringify({ type: "set_config", approvalPolicy: "bogus", sandbox: "bogus" }),
    );
    expect(stub.setConfigCalls).toHaveLength(1);
  });

  test("respond：codex: 前缀解析 rpcId；非前缀 / 非法 decision 丢弃", async () => {
    const { stub, controller, socket } = await openController();
    await controller.message(
      socket,
      JSON.stringify({ type: "respond", controlRequestId: "codex:7", decision: "accept" }),
    );
    expect(stub.respondCalls[0]).toEqual({ runtimeKey: "k1", rpcId: 7, decision: "accept" });

    await controller.message(
      socket,
      JSON.stringify({ type: "respond", controlRequestId: "claude:7", decision: "accept" }),
    );
    await controller.message(
      socket,
      JSON.stringify({ type: "respond", controlRequestId: "codex:8", decision: "allow" }),
    );
    expect(stub.respondCalls).toHaveLength(1);
  });

  test("非法 JSON → 错误帧", async () => {
    const { controller, socket, sent } = await openController();
    await controller.message(socket, "{not json");
    expect(sent[0]).toContain('"SESSION_RUNTIME_ERROR"');
  });
});

describe("CodexStreamController.close", () => {
  test("close 只断流订阅，不杀 app-server 进程", async () => {
    const stub = makeStubRuntime();
    const controller = new CodexStreamController(stub.runtime);
    const { socket } = makeSocket(codexData);
    await controller.open(socket);
    expect(stub.streamHandles[0]?.closed).toBe(false);

    controller.close(socket);
    expect(stub.streamHandles[0]?.closed).toBe(true);
    expect(stub.calls.close).toBe(0);
  });
});
