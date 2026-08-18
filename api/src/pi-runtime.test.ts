import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PiModelNotFoundError, PiNotConfiguredError, PiRuntime } from "./pi-runtime";
import type { AgentSession, ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { CreateAgentSessionOptions } from "@earendil-works/pi-coding-agent";
import type { SettingsState } from "@agents-remote/shared";
import type { SettingsStore } from "./settings-store";

const DEFAULT_CLAUDE = {
  presets: [],
  activePresetId: "",
  enable1mContext: false,
  effort: "high",
} as const;

function makeSettingsStore(pi?: {
  presets: {
    id: string;
    label: string;
    provider: string;
    apiKey: string;
    model: string;
    baseUrl?: string;
    api?: string;
  }[];
  activePresetId: string;
}): SettingsStore {
  const settings: SettingsState = {
    runtimes: {
      claude: { ...DEFAULT_CLAUDE },
      pi: pi ?? { presets: [], activePresetId: "" },
    },
    skills: { sources: [] },
  };
  return {
    read: async () => settings,
  } as unknown as SettingsStore;
}

type PiEventLike = { type: string } & Record<string, unknown>;

/** stub AgentSession：记录调用、可编程 prompt/isStreaming、暴露 emit 驱动订阅回调。 */
function makeStubSession() {
  const promptCalls: string[] = [];
  const calls = { abort: 0, waitForIdle: 0, dispose: 0, unsubscribe: 0 };
  const state = { isStreaming: false };
  let listener: ((event: PiEventLike) => void) | undefined;
  let promptImpl: (text: string) => Promise<void> = async () => {};

  const session = {
    get isStreaming() {
      return state.isStreaming;
    },
    sessionId: "pi-sess-1",
    sessionFile: undefined as string | undefined,
    subscribe: (l: (event: PiEventLike) => void) => {
      listener = l;
      return () => {
        calls.unsubscribe++;
      };
    },
    prompt: (text: string) => {
      promptCalls.push(text);
      return promptImpl(text);
    },
    abort: async () => {
      calls.abort++;
    },
    waitForIdle: async () => {
      calls.waitForIdle++;
    },
    dispose: () => {
      calls.dispose++;
    },
  };

  return {
    session: session as unknown as AgentSession,
    promptCalls,
    calls,
    state,
    setPromptImpl(impl: (text: string) => Promise<void>) {
      promptImpl = impl;
    },
    emit(event: PiEventLike) {
      listener?.(event);
    },
  };
}

function makeCreateSession(stub: ReturnType<typeof makeStubSession>) {
  const calls: CreateAgentSessionOptions[] = [];
  return {
    calls,
    factory: async (options: CreateAgentSessionOptions) => {
      calls.push(options);
      return { session: stub.session };
    },
  };
}

function makeCreateModelRuntime(provider: string, model: string) {
  const calls: {
    options: unknown;
    setKey: [string, string][];
    getModel: [string, string][];
    registerProvider: [string, unknown][];
  } = {
    options: undefined,
    setKey: [],
    getModel: [],
    registerProvider: [],
  };
  return {
    calls,
    factory: async (options: unknown) => {
      calls.options = options;
      return {
        registerProvider: (p: string, config: unknown) => {
          calls.registerProvider.push([p, config]);
        },
        setRuntimeApiKey: async (p: string, k: string) => {
          calls.setKey.push([p, k]);
        },
        getModel: (p: string, m: string) => {
          calls.getModel.push([p, m]);
          return p === provider && m === model ? { id: m, provider: p } : undefined;
        },
      } as unknown as ModelRuntime;
    },
  };
}

const PI_CFG = {
  presets: [
    {
      id: "p1",
      label: "内置",
      provider: "anthropic",
      apiKey: "sk-test",
      model: "claude-sonnet-4-5",
    },
  ],
  activePresetId: "p1",
};

let tmp: string;
let baseDir: string;
let chatSessionsDir: string;
let defaultCwd: string;

beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), "pi-runtime-"));
  baseDir = join(tmp, "agents-remote");
  chatSessionsDir = join(baseDir, "chat-sessions");
  defaultCwd = join(tmp, "cwd");
  await mkdir(defaultCwd, { recursive: true });
});

afterAll(async () => {
  await rm(tmp, { recursive: true, force: true });
});

function makeRuntime(opts: {
  pi?: {
    presets: {
      id: string;
      label: string;
      provider: string;
      apiKey: string;
      model: string;
      baseUrl?: string;
      api?: string;
    }[];
    activePresetId: string;
  };
  createModelRuntime?: (options: unknown) => Promise<unknown>;
  createSession?: (options: CreateAgentSessionOptions) => Promise<{ session: AgentSession }>;
  onPiSessionId?: (chatId: string, piSessionId: string) => void;
  onActivity?: (chatId: string) => void;
}) {
  const runtime = new PiRuntime({
    settingsStore: makeSettingsStore(opts.pi),
    baseDir,
    chatSessionsDir,
    defaultCwd,
    createModelRuntime: opts.createModelRuntime as never,
    createSession: opts.createSession as never,
  });
  if (opts.onPiSessionId) runtime.setOnPiSessionId(opts.onPiSessionId);
  if (opts.onActivity) runtime.setOnActivity(opts.onActivity);
  return runtime;
}

/** stream 订阅收集器：过滤 batch markers，只留 pi 业务帧。 */
function collectStream(runtime: PiRuntime, chatId: string) {
  const frames: PiEventLike[] = [];
  const errors: Error[] = [];
  runtime.stream(
    chatId,
    (line) => frames.push(JSON.parse(line) as PiEventLike),
    (err) => errors.push(err),
  );
  return { frames, errors };
}

const piEventFrames = (frames: PiEventLike[]) =>
  frames.filter(
    (f) =>
      f.type === "pi_event" ||
      f.type === "pi_user_echo" ||
      f.type === "ended" ||
      f.type === "error",
  );

describe("PiRuntime.ensureRunning", () => {
  test("未配置 → PiNotConfiguredError，且不触达 createSession/createModelRuntime", async () => {
    let modelRuntimeCalled = false;
    let sessionCalled = false;
    const runtime = makeRuntime({
      createModelRuntime: async () => {
        modelRuntimeCalled = true;
        return {};
      },
      createSession: async () => {
        sessionCalled = true;
        return { session: makeStubSession().session };
      },
    });
    await expect(runtime.ensureRunning("c1")).rejects.toThrow(PiNotConfiguredError);
    expect(modelRuntimeCalled).toBe(false);
    expect(sessionCalled).toBe(false);
  });

  test("配置 → createModelRuntime 参数正确（agentDir 隔离 + 不联网）", async () => {
    const cr = makeCreateModelRuntime(PI_CFG.presets[0].provider, PI_CFG.presets[0].model);
    const stub = makeStubSession();
    const cs = makeCreateSession(stub);
    const runtime = makeRuntime({
      pi: PI_CFG,
      createModelRuntime: cr.factory as never,
      createSession: cs.factory as never,
    });
    await runtime.ensureRunning("c1");

    expect(cr.calls.options).toEqual({
      authPath: join(baseDir, "pi-agent", "auth.json"),
      modelsPath: join(baseDir, "pi-agent", "models.json"),
      refreshOnCreate: false,
      allowModelNetwork: false,
    });
    expect(cr.calls.setKey).toEqual([[PI_CFG.presets[0].provider, PI_CFG.presets[0].apiKey]]);
    expect(cr.calls.getModel).toEqual([[PI_CFG.presets[0].provider, PI_CFG.presets[0].model]]);
    expect(cs.calls[0]).toMatchObject({
      cwd: defaultCwd,
      agentDir: join(baseDir, "pi-agent"),
      tools: ["read", "grep", "find", "ls"],
    });
    expect(cs.calls[0].sessionManager).toBeDefined();
    expect(cs.calls[0].resourceLoader).toBeDefined();
  });

  test("未配置三态：presets 空 / activePresetId 空 / activePresetId 未命中 → PiNotConfiguredError", async () => {
    const cases: Parameters<typeof makeRuntime>[0]["pi"][] = [
      { presets: [], activePresetId: "" },
      { presets: [PI_CFG.presets[0]], activePresetId: "" },
      { presets: [PI_CFG.presets[0]], activePresetId: "gone" },
    ];
    for (const pi of cases) {
      let modelRuntimeCalled = false;
      const runtime = makeRuntime({
        pi,
        createModelRuntime: async () => {
          modelRuntimeCalled = true;
          return {};
        },
      });
      await expect(runtime.ensureRunning("c1")).rejects.toThrow(PiNotConfiguredError);
      expect(modelRuntimeCalled).toBe(false);
    }
  });

  test("activePresetId 命中但 preset 字段缺失（无 apiKey）→ PiNotConfiguredError", async () => {
    const runtime = makeRuntime({
      pi: {
        presets: [{ id: "p1", label: "A", provider: "anthropic", apiKey: "", model: "m1" }],
        activePresetId: "p1",
      },
    });
    await expect(runtime.ensureRunning("c1")).rejects.toThrow(PiNotConfiguredError);
  });

  test("baseUrl 非空 → registerProvider 精确参数（api 缺省 openai-completions + model 默认值）", async () => {
    const cr = makeCreateModelRuntime("ollama", "llama3.1:8b");
    const stub = makeStubSession();
    const runtime = makeRuntime({
      pi: {
        presets: [
          {
            id: "p1",
            label: "Ollama",
            provider: "ollama",
            apiKey: "ollama",
            model: "llama3.1:8b",
            baseUrl: "http://localhost:11434/v1",
          },
        ],
        activePresetId: "p1",
      },
      createModelRuntime: cr.factory as never,
      createSession: makeCreateSession(stub).factory as never,
    });
    await runtime.ensureRunning("c1");

    expect(cr.calls.registerProvider).toEqual([
      [
        "ollama",
        {
          baseUrl: "http://localhost:11434/v1",
          api: "openai-completions",
          models: [
            {
              id: "llama3.1:8b",
              name: "llama3.1:8b",
              reasoning: false,
              input: ["text"],
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
              contextWindow: 128_000,
              maxTokens: 16_384,
            },
          ],
        },
      ],
    ]);
    // 先 register 后 setRuntimeApiKey（先建 provider 条目再同步凭证）。
    expect(cr.calls.setKey).toEqual([["ollama", "ollama"]]);
    expect(cr.calls.getModel).toEqual([["ollama", "llama3.1:8b"]]);
  });

  test("baseUrl 非空 + 显式 api → registerProvider 透传 api", async () => {
    const cr = makeCreateModelRuntime("proxy", "claude-opus-4-8");
    const stub = makeStubSession();
    const runtime = makeRuntime({
      pi: {
        presets: [
          {
            id: "p1",
            label: "Proxy",
            provider: "proxy",
            apiKey: "sk-proxy",
            model: "claude-opus-4-8",
            baseUrl: "https://proxy.example.com",
            api: "anthropic-messages",
          },
        ],
        activePresetId: "p1",
      },
      createModelRuntime: cr.factory as never,
      createSession: makeCreateSession(stub).factory as never,
    });
    await runtime.ensureRunning("c1");

    expect(cr.calls.registerProvider[0][1]).toMatchObject({
      baseUrl: "https://proxy.example.com",
      api: "anthropic-messages",
    });
  });

  test("baseUrl 空（内置 provider）→ 不调 registerProvider", async () => {
    const cr = makeCreateModelRuntime(PI_CFG.presets[0].provider, PI_CFG.presets[0].model);
    const stub = makeStubSession();
    const runtime = makeRuntime({
      pi: PI_CFG,
      createModelRuntime: cr.factory as never,
      createSession: makeCreateSession(stub).factory as never,
    });
    await runtime.ensureRunning("c1");
    expect(cr.calls.registerProvider).toEqual([]);
  });

  test("registerProvider throw → 传播（不吞）", async () => {
    const stub = makeStubSession();
    const runtime = makeRuntime({
      pi: {
        presets: [
          {
            id: "p1",
            label: "Bad",
            provider: "bad",
            apiKey: "k",
            model: "m1",
            baseUrl: "http://localhost:1",
          },
        ],
        activePresetId: "p1",
      },
      createModelRuntime: (async () => ({
        registerProvider: () => {
          throw new Error("register boom");
        },
        setRuntimeApiKey: async () => {},
        getModel: () => ({ id: "m1", provider: "bad" }),
      })) as never,
      createSession: makeCreateSession(stub).factory as never,
    });
    await expect(runtime.ensureRunning("c1")).rejects.toThrow("register boom");
  });

  test("模型解析不到 → PiModelNotFoundError", async () => {
    const stub = makeStubSession();
    const runtime = makeRuntime({
      pi: {
        presets: [
          { id: "p1", label: "A", provider: "anthropic", apiKey: "sk", model: "nonexistent" },
        ],
        activePresetId: "p1",
      },
      createModelRuntime: (async () => ({
        setRuntimeApiKey: async () => {},
        getModel: () => undefined,
      })) as never,
      createSession: makeCreateSession(stub).factory as never,
    });
    await expect(runtime.ensureRunning("c1")).rejects.toThrow(PiModelNotFoundError);
  });

  test("同 chatId 二次 ensureRunning 幂等（createSession 只调一次）", async () => {
    const stub = makeStubSession();
    const cs = makeCreateSession(stub);
    const runtime = makeRuntime({
      pi: PI_CFG,
      createModelRuntime: makeCreateModelRuntime(
        PI_CFG.presets[0].provider,
        PI_CFG.presets[0].model,
      ).factory as never,
      createSession: cs.factory as never,
    });
    await runtime.ensureRunning("c1");
    await runtime.ensureRunning("c1");
    expect(cs.calls).toHaveLength(1);
  });

  test("ensureRunning 后 backfill piSessionId 回调", async () => {
    const stub = makeStubSession();
    const backfilled: [string, string][] = [];
    const runtime = makeRuntime({
      pi: PI_CFG,
      createModelRuntime: makeCreateModelRuntime(
        PI_CFG.presets[0].provider,
        PI_CFG.presets[0].model,
      ).factory as never,
      createSession: makeCreateSession(stub).factory as never,
      onPiSessionId: (id, piSessionId) => backfilled.push([id, piSessionId]),
    });
    await runtime.ensureRunning("c1");
    expect(backfilled).toEqual([["c1", "pi-sess-1"]]);
  });
});

describe("PiRuntime.send / 排队 / 中断", () => {
  test("idle 时 send → prompt 立即", async () => {
    const stub = makeStubSession();
    const runtime = makeRuntime({
      pi: PI_CFG,
      createModelRuntime: makeCreateModelRuntime(
        PI_CFG.presets[0].provider,
        PI_CFG.presets[0].model,
      ).factory as never,
      createSession: makeCreateSession(stub).factory as never,
    });
    await runtime.ensureRunning("c1");
    runtime.send("c1", "hi");
    expect(stub.promptCalls).toEqual(["hi"]);
  });

  test("streaming 时 send → 入队不 prompt；agent_settled flush", async () => {
    const stub = makeStubSession();
    const runtime = makeRuntime({
      pi: PI_CFG,
      createModelRuntime: makeCreateModelRuntime(
        PI_CFG.presets[0].provider,
        PI_CFG.presets[0].model,
      ).factory as never,
      createSession: makeCreateSession(stub).factory as never,
    });
    await runtime.ensureRunning("c1");

    stub.state.isStreaming = true; // 模拟已有 run 在飞
    runtime.send("c1", "queued");
    expect(stub.promptCalls).toEqual([]); // 未抢跑

    // agent_settled 时 pi finally 已置 isStreaming=false（真实时序）
    stub.state.isStreaming = false;
    stub.emit({ type: "agent_settled" });
    expect(stub.promptCalls).toEqual(["queued"]);
  });

  test("interrupt → abort + waitForIdle + 清空排队项", async () => {
    const stub = makeStubSession();
    const runtime = makeRuntime({
      pi: PI_CFG,
      createModelRuntime: makeCreateModelRuntime(
        PI_CFG.presets[0].provider,
        PI_CFG.presets[0].model,
      ).factory as never,
      createSession: makeCreateSession(stub).factory as never,
    });
    await runtime.ensureRunning("c1");

    stub.state.isStreaming = true;
    runtime.send("c1", "queued");
    await runtime.interrupt("c1");
    expect(stub.calls.abort).toBe(1);
    expect(stub.calls.waitForIdle).toBe(1);

    // 中断后 settle：队列已被清空，不再 prompt
    stub.state.isStreaming = false;
    stub.emit({ type: "agent_settled" });
    expect(stub.promptCalls).toEqual([]);
  });

  test("send 未启动会话 → throw", async () => {
    const stub = makeStubSession();
    const runtime = makeRuntime({
      pi: PI_CFG,
      createModelRuntime: makeCreateModelRuntime(
        PI_CFG.presets[0].provider,
        PI_CFG.presets[0].model,
      ).factory as never,
      createSession: makeCreateSession(stub).factory as never,
    });
    expect(() => runtime.send("nope", "hi")).toThrow("chat 会话未启动");
  });

  test("prompt 拒绝 → relay 报错帧，且不再卡死队列", async () => {
    const stub = makeStubSession();
    stub.setPromptImpl(async () => {
      throw new Error("boom");
    });
    const runtime = makeRuntime({
      pi: PI_CFG,
      createModelRuntime: makeCreateModelRuntime(
        PI_CFG.presets[0].provider,
        PI_CFG.presets[0].model,
      ).factory as never,
      createSession: makeCreateSession(stub).factory as never,
    });
    await runtime.ensureRunning("c1");
    const { errors } = collectStream(runtime, "c1");

    runtime.send("c1", "one");
    await new Promise((r) => setTimeout(r, 0)); // 等 prompt 拒绝微任务
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe("boom");
  });
});

describe("PiRuntime 事件 → relay", () => {
  test("agent_start / agent_settled → 订阅者收 pi_event + ended", async () => {
    const stub = makeStubSession();
    const runtime = makeRuntime({
      pi: PI_CFG,
      createModelRuntime: makeCreateModelRuntime(
        PI_CFG.presets[0].provider,
        PI_CFG.presets[0].model,
      ).factory as never,
      createSession: makeCreateSession(stub).factory as never,
    });
    await runtime.ensureRunning("c1");
    const { frames } = collectStream(runtime, "c1");

    stub.emit({ type: "agent_start" });
    stub.emit({ type: "agent_settled" });

    const events = piEventFrames(frames);
    expect(events).toEqual([
      { type: "pi_event", event: { type: "agent_start" } },
      { type: "pi_event", event: { type: "agent_settled" } },
      { type: "ended" },
    ]);
  });

  test("send 带 uuid → 订阅者收 pi_user_echo 帧", async () => {
    const stub = makeStubSession();
    const runtime = makeRuntime({
      pi: PI_CFG,
      createModelRuntime: makeCreateModelRuntime(
        PI_CFG.presets[0].provider,
        PI_CFG.presets[0].model,
      ).factory as never,
      createSession: makeCreateSession(stub).factory as never,
    });
    await runtime.ensureRunning("c1");
    const { frames } = collectStream(runtime, "c1");

    runtime.send("c1", "hello", "u-1");
    const echoes = frames.filter((f) => f.type === "pi_user_echo");
    expect(echoes).toEqual([{ type: "pi_user_echo", text: "hello", uuid: "u-1" }]);
  });
});

describe("PiRuntime 生命周期", () => {
  test("close → unsubscribe + dispose + relay destroy（不触盘）", async () => {
    const stub = makeStubSession();
    const runtime = makeRuntime({
      pi: PI_CFG,
      createModelRuntime: makeCreateModelRuntime(
        PI_CFG.presets[0].provider,
        PI_CFG.presets[0].model,
      ).factory as never,
      createSession: makeCreateSession(stub).factory as never,
    });
    await runtime.ensureRunning("c1");
    await runtime.close("c1");

    expect(stub.calls.unsubscribe).toBe(1);
    expect(stub.calls.dispose).toBe(1);
    // close 后 send 抛「未启动」（会话已从 map 删除）
    expect(() => runtime.send("c1", "hi")).toThrow("chat 会话未启动");
  });

  test("removeSessionFiles → 删除 pi-jsonl/<chatId>/ 整棵子树", async () => {
    const stub = makeStubSession();
    const runtime = makeRuntime({
      pi: PI_CFG,
      createModelRuntime: makeCreateModelRuntime(
        PI_CFG.presets[0].provider,
        PI_CFG.presets[0].model,
      ).factory as never,
      createSession: makeCreateSession(stub).factory as never,
    });
    await runtime.ensureRunning("c1");
    const jsonlDir = join(chatSessionsDir, "pi-jsonl", "c1");
    const sessionFile = join(jsonlDir, "x.jsonl");
    await writeFile(sessionFile, "{}", "utf8");
    expect(await Bun.file(sessionFile).exists()).toBe(true);

    await runtime.removeSessionFiles("c1");
    expect(await Bun.file(sessionFile).exists()).toBe(false);
  });

  test("onActivity 回调在事件时触发", async () => {
    const stub = makeStubSession();
    const activities: string[] = [];
    const runtime = makeRuntime({
      pi: PI_CFG,
      createModelRuntime: makeCreateModelRuntime(
        PI_CFG.presets[0].provider,
        PI_CFG.presets[0].model,
      ).factory as never,
      createSession: makeCreateSession(stub).factory as never,
      onActivity: (id) => activities.push(id),
    });
    await runtime.ensureRunning("c1");
    stub.emit({ type: "agent_start" });
    expect(activities).toEqual(["c1"]);
  });
});
