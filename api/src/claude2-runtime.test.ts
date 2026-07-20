import { expect, test } from "bun:test";
import { tmpdir } from "node:os";
import {
  buildSeedInitLine,
  extractModelFromStdoutLine,
  extractSkillReloadFromStdoutLine,
  buildSpawnEnv,
  resolveActivePresetCreds,
  Claude2Runtime,
} from "./claude2-runtime";
import type { ClaudeModelMapping, ClaudePreset } from "@agents-remote/shared";
import type { SettingsStore } from "./settings-store";

test("buildSeedInitLine uses seed_init subtype so server-side init capture skips it", () => {
  const line = buildSeedInitLine("opus", "plan");
  expect(line).toBeDefined();
  const parsed = JSON.parse(line!) as Record<string, unknown>;
  expect(parsed).toMatchObject({
    type: "system",
    subtype: "seed_init",
    model: "opus",
    permissionMode: "plan",
  });
  // Critical invariant: distinct subtype "seed_init" (not "init") ⇒ both
  // claude2-stream onRealtimeRow and runtime captureSystemInitFromLine (which
  // match subtype === "init") skip this synthetic replay row. The seed never
  // carries session_id and never impersonates a real init.
  expect(parsed).not.toHaveProperty("session_id");
});

test("buildSeedInitLine includes only the provided scalar fields", () => {
  const parsed = JSON.parse(buildSeedInitLine("opus")!) as Record<string, unknown>;
  expect(parsed).toMatchObject({ type: "system", subtype: "seed_init", model: "opus" });
  expect(parsed).not.toHaveProperty("permissionMode");
  expect(parsed).not.toHaveProperty("session_id");

  const parsedMode = JSON.parse(buildSeedInitLine(undefined, "acceptEdits")!) as Record<
    string,
    unknown
  >;
  expect(parsedMode).toMatchObject({
    type: "system",
    subtype: "seed_init",
    permissionMode: "acceptEdits",
  });
  expect(parsedMode).not.toHaveProperty("model");
});

test("buildSeedInitLine returns undefined when no scalar is available", () => {
  expect(buildSeedInitLine(undefined, undefined)).toBeUndefined();
  expect(buildSeedInitLine("", "")).toBeUndefined();
});

test("seed init line is not matched by the real-init capture condition", () => {
  const parsed = JSON.parse(buildSeedInitLine("opus", "plan")!) as Record<string, unknown>;
  // Mirror claude2-stream onRealtimeRow / runtime captureSystemInitFromLine guard.
  // The seed must NOT satisfy this — it is excluded by subtype, so it can never
  // hijack claudeSessionId/model on replay.
  const isRealInit =
    parsed.type === "system" && parsed.subtype === "init" && "session_id" in parsed;
  expect(isRealInit).toBe(false);
});

test("extractModelFromStdoutLine captures the raw alias (CLI stores requestedModel, not resolved)", () => {
  const parsed = {
    type: "user",
    message: {
      role: "user",
      content:
        "<local-command-stdout>Set model to haiku (claude-haiku-4-5-20251001)</local-command-stdout>",
    },
  } as Record<string, unknown>;
  // CLI's activeUserSpecifiedModel = "haiku"; the paren content is display-only.
  expect(extractModelFromStdoutLine(parsed)).toBe("haiku");
});

test("extractModelFromStdoutLine captures opusplan alias verbatim (preserves plan-mode semantics)", () => {
  const parsed = {
    type: "user",
    message: {
      role: "user",
      content:
        "<local-command-stdout>Set model to opusplan (claude-sonnet-4-6)</local-command-stdout>",
    },
  } as Record<string, unknown>;
  // Resolving to claude-sonnet-4-6 here would lose Opus-in-plan on --resume.
  expect(extractModelFromStdoutLine(parsed)).toBe("opusplan");
});

test("extractModelFromStdoutLine captures a bare concrete id (no parens → no alias resolution)", () => {
  const parsed = {
    type: "user",
    message: {
      role: "user",
      content: "<local-command-stdout>Set model to claude-sonnet-4-6[1m]</local-command-stdout>",
    },
  } as Record<string, unknown>;
  expect(extractModelFromStdoutLine(parsed)).toBe("claude-sonnet-4-6[1m]");
});

test("extractModelFromStdoutLine parses model id from array text-block content", () => {
  const parsed = {
    type: "user",
    message: {
      role: "user",
      content: [
        {
          type: "text",
          text: "<local-command-stdout>Set model to sonnet (claude-sonnet-4-6)</local-command-stdout>",
        },
      ],
    },
  } as Record<string, unknown>;
  expect(extractModelFromStdoutLine(parsed)).toBe("sonnet");
});

test("extractModelFromStdoutLine ignores non-switch local-command stdout (e.g. /cost)", () => {
  const parsed = {
    type: "user",
    message: {
      role: "user",
      content: "<local-command-stdout>Total cost: $0.42</local-command-stdout>",
    },
  } as Record<string, unknown>;
  expect(extractModelFromStdoutLine(parsed)).toBeUndefined();
});

test("extractModelFromStdoutLine ignores non-user, null, and content-less lines", () => {
  expect(extractModelFromStdoutLine(null)).toBeUndefined();
  expect(
    extractModelFromStdoutLine({ type: "assistant", message: { model: "x" } }),
  ).toBeUndefined();
  expect(extractModelFromStdoutLine({ type: "user", message: {} })).toBeUndefined();
});

test("captureModelFromLine folds state.model and fires onModelChange with the internal sessionId", () => {
  const runtime = new Claude2Runtime(tmpdir());
  const calls: Array<{ sessionId: string; model: string }> = [];
  runtime.setOnModelChange((sessionId, model) => calls.push({ sessionId, model }));

  // Drive the private fold: seed a process state, then invoke captureModelFromLine.
  const internal = runtime as unknown as {
    processes: Map<string, { sessionId: string; model?: string }>;
    captureModelFromLine: (name: string, parsed: Record<string, unknown> | null) => void;
  };
  internal.processes.set("rt-key", { sessionId: "internal-session-id", model: "old" });

  internal.captureModelFromLine("rt-key", {
    type: "user",
    message: {
      role: "user",
      content:
        "<local-command-stdout>Set model to haiku (claude-haiku-4-5-20251001)</local-command-stdout>",
    },
  });

  expect(runtime.getSessionState("rt-key")?.model).toBe("haiku");
  expect(calls).toEqual([{ sessionId: "internal-session-id", model: "haiku" }]);
});

test("captureModelFromLine does not fire onModelChange for non-switch local-command stdout", () => {
  const runtime = new Claude2Runtime(tmpdir());
  const calls: Array<{ sessionId: string; model: string }> = [];
  runtime.setOnModelChange((sessionId, model) => calls.push({ sessionId, model }));
  const internal = runtime as unknown as {
    processes: Map<string, { sessionId: string; model?: string }>;
    captureModelFromLine: (name: string, parsed: Record<string, unknown> | null) => void;
  };
  internal.processes.set("rt-key", { sessionId: "internal-session-id", model: "old" });

  internal.captureModelFromLine("rt-key", {
    type: "user",
    message: {
      role: "user",
      content: "<local-command-stdout>Total cost: $0.42</local-command-stdout>",
    },
  });

  expect(calls).toEqual([]);
  expect(runtime.getSessionState("rt-key")?.model).toBe("old");
});

test("capturePermissionModeFromLine folds state.permissionMode and fires onPermissionModeChange with the internal sessionId", () => {
  const runtime = new Claude2Runtime(tmpdir());
  const calls: Array<{ sessionId: string; permissionMode: string }> = [];
  runtime.setOnPermissionModeChange((sessionId, permissionMode) =>
    calls.push({ sessionId, permissionMode }),
  );

  // Drive the private fold: seed a process state, then invoke capturePermissionModeFromLine.
  const internal = runtime as unknown as {
    processes: Map<string, { sessionId: string; permissionMode?: string }>;
    capturePermissionModeFromLine: (name: string, parsed: Record<string, unknown> | null) => void;
  };
  internal.processes.set("rt-key", { sessionId: "internal-session-id", permissionMode: "old" });

  // system.status{permissionMode} is the live carrier of a successful mode switch.
  internal.capturePermissionModeFromLine("rt-key", {
    type: "system",
    subtype: "status",
    permissionMode: "acceptEdits",
  });

  expect(runtime.getSessionState("rt-key")?.permissionMode).toBe("acceptEdits");
  expect(calls).toEqual([{ sessionId: "internal-session-id", permissionMode: "acceptEdits" }]);
});

test("capturePermissionModeFromLine does not fire onPermissionModeChange for a non-mode system.status", () => {
  const runtime = new Claude2Runtime(tmpdir());
  const calls: Array<{ sessionId: string; permissionMode: string }> = [];
  runtime.setOnPermissionModeChange((sessionId, permissionMode) =>
    calls.push({ sessionId, permissionMode }),
  );
  const internal = runtime as unknown as {
    processes: Map<string, { sessionId: string; permissionMode?: string }>;
    capturePermissionModeFromLine: (name: string, parsed: Record<string, unknown> | null) => void;
  };
  internal.processes.set("rt-key", { sessionId: "internal-session-id", permissionMode: "old" });

  // compact-status variant (status set, no permissionMode) must not fire.
  internal.capturePermissionModeFromLine("rt-key", {
    type: "system",
    subtype: "status",
    status: "compacting",
  });

  expect(calls).toEqual([]);
  expect(runtime.getSessionState("rt-key")?.permissionMode).toBe("old");
});

test("extractSkillReloadFromStdoutLine detects a /reload-skills synthetic-assistant echo (string content)", () => {
  // Live carrier: CLI emits /reload-skills output as a synthetic assistant
  // message (localCommandOutputToSDKAssistantMessage strips the tag), not a
  // user message. content is the clean, tag-stripped text.
  const parsed = {
    type: "assistant",
    message: {
      role: "assistant",
      model: "<synthetic>",
      content: "Reloaded skills: 40 skills available (no changes)",
    },
  } as Record<string, unknown>;
  expect(extractSkillReloadFromStdoutLine(parsed)).toBe(true);
});

test("extractSkillReloadFromStdoutLine detects reload echo in array text-block content", () => {
  const parsed = {
    type: "assistant",
    message: {
      role: "assistant",
      model: "<synthetic>",
      content: [{ type: "text", text: "Reloaded skills: 5 skills available" }],
    },
  } as Record<string, unknown>;
  expect(extractSkillReloadFromStdoutLine(parsed)).toBe(true);
});

test("extractSkillReloadFromStdoutLine ignores non-reload local-command output (e.g. /cost)", () => {
  // /cost rides the same synthetic-assistant carrier as /reload-skills; only the
  // text differs, so it must not trigger the skill-reload fold.
  const parsed = {
    type: "assistant",
    message: {
      role: "assistant",
      model: "<synthetic>",
      content: "Total cost: $0.42",
    },
  } as Record<string, unknown>;
  expect(extractSkillReloadFromStdoutLine(parsed)).toBe(false);
});

test("extractSkillReloadFromStdoutLine ignores null and content-less lines", () => {
  expect(extractSkillReloadFromStdoutLine(null)).toBe(false);
  expect(extractSkillReloadFromStdoutLine({ type: "assistant", message: {} })).toBe(false);
  expect(extractSkillReloadFromStdoutLine({ type: "user", message: {} })).toBe(false);
});

test("captureSkillReloadFromLine fires onSkillReload with the sessionName", () => {
  const runtime = new Claude2Runtime(tmpdir());
  const calls: string[] = [];
  runtime.setOnSkillReload((sessionName) => calls.push(sessionName));

  const internal = runtime as unknown as {
    processes: Map<string, { sessionId: string }>;
    captureSkillReloadFromLine: (name: string, parsed: Record<string, unknown> | null) => void;
  };
  internal.processes.set("rt-key", { sessionId: "internal-session-id" });

  internal.captureSkillReloadFromLine("rt-key", {
    type: "assistant",
    message: {
      role: "assistant",
      model: "<synthetic>",
      content: "Reloaded skills: 40 skills available (no changes)",
    },
  });

  expect(calls).toEqual(["rt-key"]);
});

test("captureSkillReloadFromLine does not fire onSkillReload for non-reload stdout", () => {
  const runtime = new Claude2Runtime(tmpdir());
  const calls: string[] = [];
  runtime.setOnSkillReload((sessionName) => calls.push(sessionName));

  const internal = runtime as unknown as {
    processes: Map<string, { sessionId: string }>;
    captureSkillReloadFromLine: (name: string, parsed: Record<string, unknown> | null) => void;
  };
  internal.processes.set("rt-key", { sessionId: "internal-session-id" });

  internal.captureSkillReloadFromLine("rt-key", {
    type: "assistant",
    message: {
      role: "assistant",
      model: "<synthetic>",
      content: "Total cost: $0.42",
    },
  });

  expect(calls).toEqual([]);
});

test("injectLiveLine forwards the line to the registered relay", () => {
  const runtime = new Claude2Runtime(tmpdir());
  const injected: string[] = [];
  const fakeRelay = {
    isDestroyed: false,
    injectLiveLine: (line: string) => injected.push(line),
  };
  const internal = runtime as unknown as { relays: Map<string, unknown> };
  internal.relays.set("rt-key", fakeRelay);

  const line = JSON.stringify({ type: "user", uuid: "injected-x" });
  runtime.injectLiveLine("rt-key", line);
  expect(injected).toEqual([line]);
});

test("injectLiveLine is a no-op when the relay is missing or destroyed", () => {
  const runtime = new Claude2Runtime(tmpdir());
  // missing relay — no throw
  expect(() => runtime.injectLiveLine("missing", '{"type":"user"}')).not.toThrow();

  // destroyed relay — not forwarded, no throw
  const internal = runtime as unknown as { relays: Map<string, unknown> };
  internal.relays.set("dead", {
    isDestroyed: true,
    injectLiveLine: () => {
      throw new Error("should not be called on a destroyed relay");
    },
  });
  expect(() => runtime.injectLiveLine("dead", '{"type":"user"}')).not.toThrow();
});

// ── buildSpawnEnv: spawn env 注入（effort + provider 凭证） ──

test("buildSpawnEnv inherits parent env without injecting when effort/provider absent", () => {
  const env = buildSpawnEnv(undefined, undefined, { PATH: "/usr/bin" });
  expect(env).toEqual({ PATH: "/usr/bin" });
  expect(env.CLAUDE_CODE_EFFORT_LEVEL).toBeUndefined();
  expect(env.ANTHROPIC_API_KEY).toBeUndefined();
  expect(env.ANTHROPIC_BASE_URL).toBeUndefined();
});

test("buildSpawnEnv injects CLAUDE_CODE_EFFORT_LEVEL from effort", () => {
  const env = buildSpawnEnv("xhigh", undefined, { PATH: "/usr/bin" });
  expect(env.CLAUDE_CODE_EFFORT_LEVEL).toBe("xhigh");
  expect(env.PATH).toBe("/usr/bin");
});

test("buildSpawnEnv injects provider apiKey and baseUrl", () => {
  const env = buildSpawnEnv(undefined, { apiKey: "sk-ant-xxx", baseUrl: "https://gw.example" }, {});
  expect(env.ANTHROPIC_API_KEY).toBe("sk-ant-xxx");
  expect(env.ANTHROPIC_BASE_URL).toBe("https://gw.example");
});

test("buildSpawnEnv omits baseUrl when provider has only apiKey", () => {
  const env = buildSpawnEnv(undefined, { apiKey: "sk-ant-xxx" }, {});
  expect(env.ANTHROPIC_API_KEY).toBe("sk-ant-xxx");
  expect(env.ANTHROPIC_BASE_URL).toBeUndefined();
});

// ── resolveActivePresetCreds: 激活预设凭证解析 ──

const ALIAS_MAPPING: ClaudeModelMapping = {
  default: "sonnet",
  opus: "opus",
  sonnet: "sonnet",
  haiku: "haiku",
};

const CONCRETE_MAPPING: ClaudeModelMapping = {
  default: "claude-sonnet-4-6",
  opus: "claude-opus-4-8",
  sonnet: "claude-sonnet-4-6",
  haiku: "claude-haiku-4-5",
};

const credsRuntime = (activePresetId: string): { activePresetId: string } => ({ activePresetId });

test("resolveActivePresetCreds returns active preset creds with baseUrl", () => {
  const presets: ClaudePreset[] = [
    { id: "p1", label: "A", apiKey: "sk-a", baseUrl: "https://gw", modelMapping: ALIAS_MAPPING },
  ];
  expect(resolveActivePresetCreds(credsRuntime("p1"), presets)).toEqual({
    apiKey: "sk-a",
    baseUrl: "https://gw",
  });
});

test("resolveActivePresetCreds omits baseUrl when preset has none", () => {
  const presets: ClaudePreset[] = [
    { id: "p1", label: "A", apiKey: "sk-a", modelMapping: ALIAS_MAPPING },
  ];
  expect(resolveActivePresetCreds(credsRuntime("p1"), presets)).toEqual({
    apiKey: "sk-a",
    baseUrl: undefined,
  });
});

test("resolveActivePresetCreds returns undefined when activePresetId empty", () => {
  expect(
    resolveActivePresetCreds(credsRuntime(""), [
      { id: "p1", label: "A", apiKey: "sk-a", modelMapping: ALIAS_MAPPING },
    ]),
  ).toBeUndefined();
});

test("resolveActivePresetCreds returns undefined when preset not found", () => {
  expect(
    resolveActivePresetCreds(credsRuntime("nope"), [
      { id: "p1", label: "A", apiKey: "sk-a", modelMapping: ALIAS_MAPPING },
    ]),
  ).toBeUndefined();
});

test("resolveActivePresetCreds returns undefined when presets undefined", () => {
  expect(resolveActivePresetCreds(credsRuntime("p1"), undefined)).toBeUndefined();
});

// ── buildSpawnEnv: view 注入 ANTHROPIC_DEFAULT_*_MODEL（对齐 CLI alias 解析） ──

// view = {modelMapping, enable1mContext}：env 注入复用 buildAvailableAliases 的 resolved
//（opus/sonnet 在 enable1mContext 时带 [1m]，haiku 不带——CLI MODEL_ALIASES 无 haiku[1m]）。
const aliasView = { modelMapping: ALIAS_MAPPING, enable1mContext: false };

const concreteView = { modelMapping: CONCRETE_MAPPING, enable1mContext: false };

test("buildSpawnEnv injects ANTHROPIC_DEFAULT_*_MODEL from concrete view (opus/sonnet [1m], haiku bare)", () => {
  const env = buildSpawnEnv(undefined, undefined, {}, { ...concreteView, enable1mContext: true });
  expect(env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe("claude-opus-4-8[1m]");
  expect(env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe("claude-sonnet-4-6[1m]");
  // haiku 不拼 [1m]：CLI MODEL_ALIASES 无 haiku[1m]。
  expect(env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe("claude-haiku-4-5");
});

test("buildSpawnEnv omits [1m] from env when enable1mContext off", () => {
  const env = buildSpawnEnv(undefined, undefined, {}, concreteView);
  expect(env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe("claude-opus-4-8");
  expect(env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe("claude-sonnet-4-6");
  expect(env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe("claude-haiku-4-5");
});

test("buildSpawnEnv injects alias-mapping view verbatim (alias 解析交给 CLI)", () => {
  // modelMapping 全是 alias（opus→"opus"）时，env 注入 alias 字符串本身——CLI 读 env=alias
  // 等价于不注入（回落账户默认），无害。opusplan 普通模式此时 = CLI 默认 Sonnet。
  const env = buildSpawnEnv(undefined, undefined, {}, aliasView);
  expect(env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe("opus");
  expect(env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe("sonnet");
  expect(env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe("haiku");
});

test("buildSpawnEnv does not inject model env when view absent", () => {
  const env = buildSpawnEnv(undefined, undefined, {});
  expect(env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBeUndefined();
  expect(env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBeUndefined();
  expect(env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBeUndefined();
});

// ── resolveControlModel: runtime set_model 透传 alias（CLI 经 env 解析） ──

// 构造 v2 settingsStore：resolveControlModel 不再读 settings（透传），但仍保留构造以便
// 未来若恢复解析时有基线；settingsStore 缺失/读失败均等价透传。
const makeSettingsStore = (
  modelMapping: ClaudeModelMapping,
  enable1mContext = false,
): SettingsStore =>
  ({
    read: async () => ({
      runtimes: {
        claude: {
          presets: [{ id: "active", label: "Active", apiKey: "sk-x", modelMapping }],
          activePresetId: "active",
          enable1mContext,
          effort: "high",
        },
      },
    }),
  }) as unknown as SettingsStore;

test("resolveControlModel passes alias through verbatim (CLI resolves via env)", async () => {
  // 菜单发 alias（opus/sonnet/haiku/opusplan），服务端原样透传，CLI 经 spawn 注入的
  // ANTHROPIC_DEFAULT_*_MODEL env 解析成具体 ID。不再服务端解析。
  const runtime = new Claude2Runtime(tmpdir(), makeSettingsStore(CONCRETE_MAPPING, true));
  expect(await runtime.resolveControlModel("sonnet")).toBe("sonnet");
  expect(await runtime.resolveControlModel("opusplan")).toBe("opusplan");
});

test("resolveControlModel passes concrete id through (legacy clients)", async () => {
  const runtime = new Claude2Runtime(tmpdir(), makeSettingsStore(CONCRETE_MAPPING, true));
  expect(await runtime.resolveControlModel("claude-opus-4-8")).toBe("claude-opus-4-8");
  expect(await runtime.resolveControlModel("claude-sonnet-4-6[1m]")).toBe("claude-sonnet-4-6[1m]");
});

test("resolveControlModel passes model through when settingsStore absent", async () => {
  const runtime = new Claude2Runtime(tmpdir());
  expect(await runtime.resolveControlModel("opus")).toBe("opus");
  expect(await runtime.resolveControlModel(undefined)).toBeUndefined();
});
