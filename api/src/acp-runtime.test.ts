import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join, sep } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type {
  AcpCredentials,
  AgentProvider,
  ClaudeModelMapping,
  SettingsState,
} from "@agents-remote/shared";
import { getAgentProviderProfile } from "./agent-provider-profiles";
import { AcpRuntime, buildAcpSpawnEnv, resolveAcpCredentials } from "./acp-runtime";

// ── fake ACP agent（模拟 `omp acp` 最小行为面，stdio NDJSON JSON-RPC）────────────
//
// 经 AcpRuntime 构造注入 command（[bun, fake-agent.ts]）替换真实 omp。支持：
// - initialize / session/new（固定 acp-sess-1）/ session/load（应答前回放 2 条 update）
// - session/prompt：echo 文本（`echo: <text>`）；`@perm` 前缀反发 request_permission 等
//   client 应答回执 optionId；`@slow` 挂起至 cancel（回 stopReason:cancelled）或 5s 超时
// - session/cancel：置 cancelled + 发 cancel-mark update
const FAKE_AGENT_SCRIPT = `
const pending = new Map();
let nextId = 100;
let cancelled = false;
const send = (msg) => console.log(JSON.stringify(msg));
const notify = (method, params) => send({ jsonrpc: "2.0", method, params });
const request = (method, params) => {
  const id = nextId++;
  send({ jsonrpc: "2.0", id, method, params });
  return new Promise((resolve) => pending.set(id, resolve));
};
const sessionUpdate = (update) =>
  notify("session/update", { sessionId: "acp-sess-1", update });

// configOptions 广告面（对齐 omp：mode/model 两个 select，model currentValue 可切）。
const configState = {
  mode: { id: "mode", name: "Mode", category: "mode", type: "select", currentValue: "build", options: [{ value: "build", name: "Build" }, { value: "plan", name: "Plan" }] },
  model: { id: "model", name: "Model", category: "model", type: "select", currentValue: "anthropic/claude-opus-4-8", options: [{ value: "anthropic/claude-opus-4-8", name: "Opus 4.8", description: "anthropic/claude-opus-4-8" }, { value: "anthropic/claude-sonnet-4-8", name: "Sonnet 4.8", description: "anthropic/claude-sonnet-4-8" }] }
};
const buildConfigOptions = () => [configState.mode, configState.model];

async function handlePrompt(msg) {
  const text = msg.params.prompt[0].text;
  if (text.startsWith("@env")) {
    sessionUpdate({
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "env key=" + (process.env.ANTHROPIC_API_KEY ?? "") },
    });
    send({ jsonrpc: "2.0", id: msg.id, result: { stopReason: "end_turn" } });
    return;
  }
  if (text.startsWith("@perm")) {
    const outcome = await request("session/request_permission", {
      sessionId: "acp-sess-1",
      toolCall: { toolCallId: "tc-perm", title: "write file", kind: "edit" },
      options: [
        { optionId: "opt-reject", name: "Reject", kind: "reject_once" },
        { optionId: "opt-allow", name: "Allow", kind: "allow_once" },
      ],
    });
    const picked = outcome.outcome.optionId ?? outcome.outcome;
    sessionUpdate({
      sessionUpdate: "tool_call_update",
      toolCallId: "perm-out",
      status: "completed",
      content: [{ type: "content", content: { type: "text", text: "perm:" + picked } }],
    });
  }
  if (text.startsWith("@slow")) {
    const ms = parseInt(text.split(" ")[1], 10) || 5000;
    const start = Date.now();
    while (!cancelled && Date.now() - start < ms) await Bun.sleep(20);
    send({ jsonrpc: "2.0", id: msg.id, result: { stopReason: cancelled ? "cancelled" : "end_turn" } });
    cancelled = false;
    return;
  }
  sessionUpdate({
    sessionUpdate: "agent_message_chunk",
    content: { type: "text", text: "echo: " + text },
  });
  send({ jsonrpc: "2.0", id: msg.id, result: { stopReason: "end_turn" } });
}

function handleLine(line) {
  const msg = JSON.parse(line);
  if (msg.id !== undefined && pending.has(msg.id)) {
    pending.get(msg.id)(msg.result);
    pending.delete(msg.id);
    return;
  }
  switch (msg.method) {
    case "initialize":
      send({ jsonrpc: "2.0", id: msg.id, result: { protocolVersion: 1, agentCapabilities: { loadSession: true } } });
      break;
    case "session/new":
      send({ jsonrpc: "2.0", id: msg.id, result: { sessionId: "acp-sess-1", configOptions: buildConfigOptions() } });
      break;
    case "session/load":
      sessionUpdate({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "replayed one" } });
      sessionUpdate({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "replayed two" } });
      send({ jsonrpc: "2.0", id: msg.id, result: { configOptions: buildConfigOptions() } });
      break;
    case "session/prompt":
      void handlePrompt(msg);
      break;
    case "session/cancel":
      cancelled = true;
      sessionUpdate({ sessionUpdate: "tool_call_update", toolCallId: "cancel-mark", status: "completed" });
      break;
    case "session/set_config_option": {
      // 已知 configId：更新 currentValue 并回最新全量；未知：回 {}（无 configOptions——
      // 覆盖「响应不带配置 → 不回灌帧」守卫）。
      if (msg.params.configId === "model") {
        configState.model.currentValue = msg.params.value;
        send({ jsonrpc: "2.0", id: msg.id, result: { configOptions: buildConfigOptions() } });
      } else {
        send({ jsonrpc: "2.0", id: msg.id, result: {} });
      }
      break;
    }
  }
}

const decoder = new TextDecoder();
let buf = "";
(async () => {
  for await (const chunk of Bun.stdin.stream()) {
    buf += decoder.decode(chunk, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\\n")) >= 0) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      if (line.trim()) handleLine(line);
    }
  }
})();
`;

// ── harness ────────────────────────────────────────────────────────────────────

let fixtureDir: string;
let runDir: string;
let projectPath: string;

beforeAll(async () => {
  fixtureDir = await mkdtemp(join(sep, "tmp", "acp-runtime-fixture-"));
  runDir = await mkdtemp(join(sep, "tmp", "acp-runtime-run-"));
  projectPath = await mkdtemp(join(sep, "tmp", "acp-runtime-project-"));
  // pumpStderr 写 runDir/acp-stderr/<key>.log，目录需存在（生产由 runtime-dir 保证）。
  await mkdir(join(runDir, "acp-stderr"));
  await writeFile(join(fixtureDir, "fake-acp-agent.ts"), FAKE_AGENT_SCRIPT);
});

afterAll(async () => {
  await Promise.all([
    rm(fixtureDir, { recursive: true, force: true }),
    rm(runDir, { recursive: true, force: true }),
    rm(projectPath, { recursive: true, force: true }),
  ]);
});

const fakeAgentCommand = () => [process.execPath, join(fixtureDir, "fake-acp-agent.ts")];

const makeRuntime = (
  options: {
    resolveCredentials?: (provider: AgentProvider) => Promise<AcpCredentials | undefined>;
  } = {},
) => {
  const runtime = new AcpRuntime({ runDir, command: fakeAgentCommand(), ...options });
  const acpSessionIds: { sessionId: string; acpSessionId: string }[] = [];
  const activities: string[] = [];
  runtime.setOnAcpSessionId((sessionId, acpSessionId) => {
    acpSessionIds.push({ sessionId, acpSessionId });
  });
  runtime.setOnActivity((sessionId) => activities.push(sessionId));
  return { runtime, acpSessionIds, activities };
};

/** 订阅 relay 并收集行（异步到达——轮询断言）。 */
const collectStream = (runtime: AcpRuntime, runtimeKey: string) => {
  const lines: string[] = [];
  runtime.stream(
    runtimeKey,
    (line) => lines.push(line),
    (err) => lines.push(JSON.stringify({ type: "error", message: err.message })),
  );
  return lines;
};

const parse = (lines: string[]) => lines.map((l) => JSON.parse(l) as Record<string, unknown>);

const waitFor = async (cond: () => boolean, label: string, ms = 5000): Promise<void> => {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error(`waitFor timeout: ${label}`);
    await Bun.sleep(10);
  }
};

// ── 测试 ───────────────────────────────────────────────────────────────────────

describe("AcpRuntime（fake omp 集成）", () => {
  test("startAgent：spawn → initialize → session/new → onAcpSessionId 回调；write → echo/chunk/ended 全链路", async () => {
    const { runtime, acpSessionIds, activities } = makeRuntime();
    await runtime.startAgent({ sessionId: "s1", runtimeKey: "k1", provider: "omp", projectPath });

    expect(acpSessionIds).toEqual([{ sessionId: "s1", acpSessionId: "acp-sess-1" }]);
    await expect(runtime.exists("k1")).resolves.toBe(true);

    const lines = collectStream(runtime, "k1");
    runtime.write("k1", "hello", "u1");

    const messages = () => parse(lines);
    await waitFor(
      () => messages().some((m) => m.type === "ended" && m.stopReason === "end_turn"),
      "ended frame",
    );
    const ms = messages();
    // 回放开场：session_init(resume=false) + 空 history 段。
    expect(ms[0]).toMatchObject({ type: "session_init", resume: false });
    expect(ms[1]).toMatchObject({ type: "history_start", count: 0 });
    expect(ms[2]).toMatchObject({ type: "history_end" });
    // user echo 注入 + agent chunk 透传 + turn 边界 ended。
    expect(
      ms.some(
        (m) =>
          JSON.stringify(m) ===
          JSON.stringify({ type: "acp_user_echo", text: "hello", uuid: "u1" }),
      ),
    ).toBe(true);
    expect(
      ms.some(
        (m) =>
          m.type === "acp_event" &&
          (m.event as Record<string, unknown>).sessionUpdate === "agent_message_chunk" &&
          ((m.event as Record<string, unknown>).content as Record<string, unknown>).text ===
            "echo: hello",
      ),
    ).toBe(true);
    // 真实 update（非回放）bump activity。
    expect(activities).toContain("s1");
    // session/new 响应的 configOptions → live 段 acp_config 帧（重连回放可见）。
    const configFrame = ms.find((m) => m.type === "acp_config") as
      | { configOptions: Array<Record<string, unknown>> }
      | undefined;
    expect(configFrame).toBeDefined();
    expect(
      configFrame?.configOptions.some(
        (o) => o.id === "model" && o.currentValue === "anthropic/claude-opus-4-8",
      ),
    ).toBe(true);

    await runtime.close("k1");
  });

  test("API 重启恢复：acpSessionId → loadSession 全量回放进 history 段（resume:true, count=2）", async () => {
    const { runtime } = makeRuntime();
    await runtime.ensureRunning({
      sessionId: "s2",
      runtimeKey: "k2",
      provider: "omp",
      projectPath,
      acpSessionId: "acp-sess-1",
    });

    const lines = collectStream(runtime, "k2");
    const ms = parse(lines);
    expect(ms[0]).toMatchObject({ type: "session_init", resume: true });
    expect(ms[1]).toMatchObject({ type: "history_start", count: 2 });
    // 回放行原样进 history 段（前端按 acp_event 归约为历史消息）。
    const replayed = ms
      .slice(2, 4)
      .map((m) => (m as { event: { content: { text: string } } }).event.content.text);
    expect(replayed).toEqual(["replayed one", "replayed two"]);
    expect(ms[4]).toMatchObject({ type: "history_end" });
    // load 响应的 configOptions → live 段 acp_config，回放序 = history 段之后。
    const liveIdx = ms.findIndex((m) => m.type === "live_start");
    const configIdx = ms.findIndex((m) => m.type === "acp_config");
    expect(liveIdx).toBeGreaterThan(4);
    expect(configIdx).toBeGreaterThan(liveIdx);

    await runtime.close("k2");
  });

  test("request_permission 自动 allow：选首个 allow_* option 并回执 optionId", async () => {
    const { runtime } = makeRuntime();
    await runtime.startAgent({ sessionId: "s3", runtimeKey: "k3", provider: "omp", projectPath });

    const lines = collectStream(runtime, "k3");
    runtime.write("k3", "@perm write file");

    await waitFor(() => parse(lines).some((m) => JSON.stringify(m).includes("perm:")), "perm echo");
    const permUpdate = parse(lines).find(
      (m) => m.type === "acp_event" && JSON.stringify(m).includes("perm:opt-allow"),
    );
    expect(permUpdate).toBeDefined();

    await runtime.close("k3");
  });

  test("interrupt：@slow 挂起中 cancel → fake 收到 cancel-mark + ended(stopReason:cancelled)", async () => {
    const { runtime } = makeRuntime();
    await runtime.startAgent({ sessionId: "s4", runtimeKey: "k4", provider: "omp", projectPath });

    const lines = collectStream(runtime, "k4");
    runtime.write("k4", "@slow long turn");
    runtime.interrupt("k4");

    await waitFor(
      () => parse(lines).some((m) => m.type === "ended" && m.stopReason === "cancelled"),
      "cancelled ended",
    );
    expect(parse(lines).some((m) => JSON.stringify(m).includes("cancel-mark"))).toBe(true);

    await runtime.close("k4");
  });

  test("prompt 单飞排队：在飞时第二条 write 排队，第一条 ended 后 flush 完成", async () => {
    const { runtime } = makeRuntime();
    await runtime.startAgent({ sessionId: "s5", runtimeKey: "k5", provider: "omp", projectPath });

    const lines = collectStream(runtime, "k5");
    runtime.write("k5", "@slow 300 first");
    runtime.write("k5", "second");

    await waitFor(
      () => parse(lines).filter((m) => m.type === "ended").length >= 2,
      "two ended frames",
    );
    expect(
      parse(lines).some(
        (m) => m.type === "acp_event" && JSON.stringify(m).includes("echo: second"),
      ),
    ).toBe(true);

    await runtime.close("k5");
  });

  test("write 未运行 session → throw；close 后 exists=false 且 listAliveRuntimeKeys 为空", async () => {
    const { runtime } = makeRuntime();
    expect(() => runtime.write("nope", "hi")).toThrow("acp session not running");
    await expect(runtime.setConfigOption("nope", "model", "x")).rejects.toThrow(
      "acp session not running",
    );

    await runtime.startAgent({ sessionId: "s6", runtimeKey: "k6", provider: "omp", projectPath });
    await runtime.close("k6");
    await expect(runtime.exists("k6")).resolves.toBe(false);
    await expect(runtime.listAliveRuntimeKeys()).resolves.toEqual(new Set());
  });

  test("setConfigOption：session/set_config_option → 响应 configOptions 回灌 acp_config（currentValue 已更新）", async () => {
    const { runtime } = makeRuntime();
    await runtime.startAgent({ sessionId: "s8", runtimeKey: "k8", provider: "omp", projectPath });

    const lines = collectStream(runtime, "k8");
    await waitFor(() => parse(lines).some((m) => m.type === "acp_config"), "initial config frame");
    await runtime.setConfigOption("k8", "model", "anthropic/claude-sonnet-4-8");

    await waitFor(
      () => parse(lines).filter((m) => m.type === "acp_config").length >= 2,
      "switch config frame",
    );
    const configFrames = parse(lines).filter((m) => m.type === "acp_config");
    const last = configFrames[configFrames.length - 1] as {
      configOptions: Array<Record<string, unknown>>;
    };
    expect(last.configOptions.find((o) => o.id === "model")?.currentValue).toBe(
      "anthropic/claude-sonnet-4-8",
    );

    await runtime.close("k8");
  });

  test("setConfigOption 未知 configId：agent 响应无 configOptions → 不回灌帧", async () => {
    const { runtime } = makeRuntime();
    await runtime.startAgent({ sessionId: "s9", runtimeKey: "k9", provider: "omp", projectPath });

    const lines = collectStream(runtime, "k9");
    await waitFor(() => parse(lines).some((m) => m.type === "acp_config"), "initial config frame");
    await runtime.setConfigOption("k9", "nonexistent", "x");
    // setConfigOption resolve = fake 响应已处理（注入与否同步决定），计数即终态。
    expect(parse(lines).filter((m) => m.type === "acp_config").length).toBe(1);

    await runtime.close("k9");
  });

  test("resolveCredentials → spawn env 注入 ANTHROPIC_API_KEY（fake agent 子进程回显）", async () => {
    const { runtime } = makeRuntime({
      resolveCredentials: async () => ({ apiKey: "sk-acp-injected" }),
    });
    await runtime.startAgent({ sessionId: "s7", runtimeKey: "k7", provider: "omp", projectPath });

    const lines = collectStream(runtime, "k7");
    runtime.write("k7", "@env");
    await waitFor(
      () => parse(lines).some((m) => JSON.stringify(m).includes("key=sk-acp-injected")),
      "env echo",
    );

    await runtime.close("k7");
  });
});

describe("buildAcpSpawnEnv", () => {
  const parentEnv = { PATH: "/usr/bin", HOME: "/home/u", ANTHROPIC_API_KEY: "from-parent" };
  const ompProfile = getAgentProviderProfile("omp");

  test("继承父 env + 注入 settings 切片（env 名来自 profile 声明，覆盖同名父变量）", () => {
    const env = buildAcpSpawnEnv(
      ompProfile,
      { apiKey: "sk-acp", baseUrl: "https://gw.example.com" },
      parentEnv,
    );
    expect(env.PATH).toBe("/usr/bin");
    expect(env.HOME).toBe("/home/u");
    expect(env.ANTHROPIC_API_KEY).toBe("sk-acp");
    expect(env.ANTHROPIC_BASE_URL).toBe("https://gw.example.com");
  });

  test("未配置 → 父 env 原样透传（omp 回落自身凭证链的一环）；只配 baseUrl 时 key 不动", () => {
    const fallback = buildAcpSpawnEnv(ompProfile, {}, parentEnv);
    expect(fallback.ANTHROPIC_API_KEY).toBe("from-parent");
    expect("ANTHROPIC_BASE_URL" in fallback).toBe(false);

    const none = buildAcpSpawnEnv(ompProfile, undefined, parentEnv);
    expect(none.ANTHROPIC_API_KEY).toBe("from-parent");

    const urlOnly = buildAcpSpawnEnv(ompProfile, { baseUrl: "https://gw.example.com" }, parentEnv);
    expect(urlOnly.ANTHROPIC_API_KEY).toBe("from-parent");
    expect(urlOnly.ANTHROPIC_BASE_URL).toBe("https://gw.example.com");
  });

  test("无 credentials 声明的 profile（claude）→ 不注入，纯透传父 env", () => {
    const claudeProfile = getAgentProviderProfile("claude");
    expect(claudeProfile?.credentials).toBeUndefined();
    const env = buildAcpSpawnEnv(claudeProfile, { apiKey: "sk-acp" }, parentEnv);
    expect(env.ANTHROPIC_API_KEY).toBe("from-parent");
  });
});

describe("resolveAcpCredentials（per-provider 平权：只读自身切片，不借用其它 runtime）", () => {
  const ALIAS: ClaudeModelMapping = {
    default: "sonnet",
    opus: "opus",
    sonnet: "sonnet",
    haiku: "haiku",
  };
  const makeState = (
    options: {
      acpOmp?: AcpCredentials;
      claudePreset?: { id: string; apiKey: string; baseUrl?: string };
      activePresetId?: string;
    } = {},
  ): SettingsState => ({
    runtimes: {
      claude: {
        presets: options.claudePreset
          ? [{ ...options.claudePreset, label: "官方", modelMapping: ALIAS }]
          : [],
        activePresetId: options.activePresetId ?? "",
        enable1mContext: false,
        effort: "high",
      },
      pi: { presets: [], activePresetId: "" },
      acp: options.acpOmp ? { omp: options.acpOmp } : {},
    },
    skills: { sources: [] },
  });

  test("omp 有自身切片 → 原样返回（切片来源与其它 runtime 配置无关）", () => {
    const state = makeState({
      acpOmp: { apiKey: "sk-acp-own" },
      claudePreset: { id: "p1", apiKey: "sk-claude", baseUrl: "https://gw-claude.example.com" },
      activePresetId: "p1",
    });
    expect(resolveAcpCredentials(state, "omp")).toEqual({ apiKey: "sk-acp-own" });
  });

  test("baseUrl-only 切片原样返回（端点与 key 同源由用户配置保证，不混搭他处 key）", () => {
    const state = makeState({
      acpOmp: { baseUrl: "https://gw-acp.example.com" },
      claudePreset: { id: "p1", apiKey: "sk-claude", baseUrl: "https://gw-claude.example.com" },
      activePresetId: "p1",
    });
    expect(resolveAcpCredentials(state, "omp")).toEqual({ baseUrl: "https://gw-acp.example.com" });
  });

  test("omp 切片全空 → {}（回落 omp 自身凭证链；即使 claude 有激活预设也不借用）", () => {
    const state = makeState({
      claudePreset: { id: "p1", apiKey: "sk-claude", baseUrl: "https://gw-claude.example.com" },
      activePresetId: "p1",
    });
    expect(resolveAcpCredentials(state, "omp")).toEqual({});
  });

  test("任意 provider 切片全空 → {}（claude 自身也不被其它 runtime 特殊化）", () => {
    expect(resolveAcpCredentials(makeState(), "claude")).toEqual({});
    expect(resolveAcpCredentials(makeState(), "omp")).toEqual({});
  });
});
