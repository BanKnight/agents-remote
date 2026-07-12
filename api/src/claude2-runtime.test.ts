import { expect, test } from "bun:test";
import { tmpdir } from "node:os";
import {
  buildSeedInitLine,
  extractModelFromStdoutLine,
  extractSkillReloadFromStdoutLine,
  buildSpawnEnv,
  resolveSpawnModel,
  Claude2Runtime,
} from "./claude2-runtime";
import type { ClaudeRuntimeConfig } from "@agents-remote/shared";

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

test("extractModelFromStdoutLine parses model id from a switch echo (string content)", () => {
  const parsed = {
    type: "user",
    message: {
      role: "user",
      content:
        "<local-command-stdout>Set model to haiku (claude-haiku-4-5-20251001)</local-command-stdout>",
    },
  } as Record<string, unknown>;
  expect(extractModelFromStdoutLine(parsed)).toBe("claude-haiku-4-5-20251001");
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
  expect(extractModelFromStdoutLine(parsed)).toBe("claude-sonnet-4-6");
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

  expect(runtime.getSessionState("rt-key")?.model).toBe("claude-haiku-4-5-20251001");
  expect(calls).toEqual([{ sessionId: "internal-session-id", model: "claude-haiku-4-5-20251001" }]);
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

// ── resolveSpawnModel: metadata.model → spawn --model 值 ──

const aliasRuntime: ClaudeRuntimeConfig = {
  providerId: "",
  modelMapping: { default: "sonnet", opus: "opus", sonnet: "sonnet", haiku: "haiku" },
  enable1mContext: false,
  effort: "high",
};

const concreteRuntime: ClaudeRuntimeConfig = {
  providerId: "",
  modelMapping: {
    default: "claude-sonnet-4-6",
    opus: "claude-opus-4-8",
    sonnet: "claude-sonnet-4-6",
    haiku: "claude-haiku-4-5",
  },
  enable1mContext: false,
  effort: "high",
};

test("resolveSpawnModel returns undefined for missing model", () => {
  expect(resolveSpawnModel(undefined, aliasRuntime)).toBeUndefined();
});

test("resolveSpawnModel resolves tier alias via modelMapping", () => {
  expect(resolveSpawnModel("sonnet", concreteRuntime)).toBe("claude-sonnet-4-6");
});

test("resolveSpawnModel appends [1m] to resolved concrete id when enable1mContext on", () => {
  expect(resolveSpawnModel("sonnet", { ...concreteRuntime, enable1mContext: true })).toBe(
    "claude-sonnet-4-6[1m]",
  );
});

test("resolveSpawnModel passes tier alias through when runtime undefined", () => {
  expect(resolveSpawnModel("sonnet", undefined)).toBe("sonnet");
});

test("resolveSpawnModel leaves bare alias without [1m] even when enable1mContext on", () => {
  // aliasRuntime maps sonnet→"sonnet" (no dash). resolveModelId only suffixes
  // concrete ids (has dash), so a bare alias stays bare — CLI rejects "alias[1m]".
  expect(resolveSpawnModel("sonnet", { ...aliasRuntime, enable1mContext: true })).toBe("sonnet");
});

test("resolveSpawnModel appends [1m] to concrete id when enable1mContext on", () => {
  expect(resolveSpawnModel("claude-opus-4-8", { ...aliasRuntime, enable1mContext: true })).toBe(
    "claude-opus-4-8[1m]",
  );
});

test("resolveSpawnModel does not append [1m] when enable1mContext off", () => {
  expect(resolveSpawnModel("claude-opus-4-8", aliasRuntime)).toBe("claude-opus-4-8");
});

test("resolveSpawnModel does not double-append [1m]", () => {
  expect(resolveSpawnModel("claude-opus-4-8[1m]", { ...aliasRuntime, enable1mContext: true })).toBe(
    "claude-opus-4-8[1m]",
  );
});
