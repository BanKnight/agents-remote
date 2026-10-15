import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  buildSeedInitLine,
  extractContextUsageFromControlResponse,
  extractContextUsageFromStdoutLine,
  extractModelFromStdoutLine,
  extractSkillReloadFromStdoutLine,
  buildSpawnEnv,
  buildTuiSpawnArgs,
  readLastContextUsageFromJsonlFile,
  resolveActivePresetCreds,
  resolveContextWindow,
  sanitizePersistedModel,
  ClaudeRuntime,
} from "./claude-runtime";
import type { ClaudeModelMapping, ClaudePreset } from "@agents-remote/shared";
import { claudeJsonlPath } from "./session-routes";
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
  // claude-stream onRealtimeRow and runtime captureSystemInitFromLine (which
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

test("buildSeedInitLine includes modelAlias so reconnect seeds the alias-form currentModel", () => {
  // modelAlias alone — the alias is what the client folds into currentModel
  // (opusplanActive derives from it), no concrete model needed.
  const aliasOnly = JSON.parse(buildSeedInitLine(undefined, undefined, "opusplan")!) as Record<
    string,
    unknown
  >;
  expect(aliasOnly).toMatchObject({ type: "system", subtype: "seed_init", modelAlias: "opusplan" });
  expect(aliasOnly).not.toHaveProperty("model");

  // model (concrete/spinner value) + modelAlias (alias) coexist when both exist.
  const both = JSON.parse(buildSeedInitLine("claude-sonnet-4-6", undefined, "opusplan")!) as Record<
    string,
    unknown
  >;
  expect(both).toMatchObject({ model: "claude-sonnet-4-6", modelAlias: "opusplan" });
});

test("seed init line is not matched by the real-init capture condition", () => {
  const parsed = JSON.parse(buildSeedInitLine("opus", "plan")!) as Record<string, unknown>;
  // Mirror claude-stream onRealtimeRow / runtime captureSystemInitFromLine guard.
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

test("extractModelFromStdoutLine unwraps the markdown code-span echo (2026-10-01 regression)", () => {
  // CLI modelDisplayString 把模型名包进 code span：`opus[1m] (claude-opus-4-8[1m])`。
  // 旧解析把整串（含反引号）存进 state.model → --resume --model <脏值> → 网关 422。
  const parsed = {
    type: "user",
    message: {
      role: "user",
      content:
        "<local-command-stdout>Set model to `opus[1m] (claude-opus-4-8[1m])`</local-command-stdout>",
    },
  } as Record<string, unknown>;
  expect(extractModelFromStdoutLine(parsed)).toBe("opus[1m]");
});

test("extractModelFromStdoutLine unwraps code-span echo without [1m] suffix", () => {
  const parsed = {
    type: "user",
    message: {
      role: "user",
      content: "<local-command-stdout>Set model to `opus (claude-opus-4-8)`</local-command-stdout>",
    },
  } as Record<string, unknown>;
  expect(extractModelFromStdoutLine(parsed)).toBe("opus");
});

test("extractModelFromStdoutLine rejects non-model display strings (help text / long tail)", () => {
  const makeParsed = (text: string) =>
    ({ type: "user", message: { role: "user", content: text } }) as Record<string, unknown>;
  // /model 帮助占位（无实际模型名）
  expect(
    extractModelFromStdoutLine(
      makeParsed("<local-command-stdout>Set model to (id)</local-command-stdout>"),
    ),
  ).toBeUndefined();
  // 「saved as your default」长尾文案：剥不出合法 token，宁可跳过不污染 state.model
  expect(
    extractModelFromStdoutLine(
      makeParsed(
        "<local-command-stdout>Set model to `Opus 5 (1M context)` and saved as your default for new sessions</local-command-stdout>",
      ),
    ),
  ).toBeUndefined();
});

test("sanitizePersistedModel passes bare aliases / concrete ids / [1m] variants unchanged", () => {
  expect(sanitizePersistedModel("opus")).toBe("opus");
  expect(sanitizePersistedModel("opusplan")).toBe("opusplan");
  expect(sanitizePersistedModel("claude-opus-4-8")).toBe("claude-opus-4-8");
  expect(sanitizePersistedModel("opus[1m]")).toBe("opus[1m]");
  expect(sanitizePersistedModel(" glm-5.3-flash ")).toBe("glm-5.3-flash");
});

test("sanitizePersistedModel strips legacy raw (resolved) annotation", () => {
  expect(sanitizePersistedModel("haiku (claude-haiku-4-5-20251001)")).toBe("haiku");
});

test("sanitizePersistedModel returns undefined for empty/absent input", () => {
  expect(sanitizePersistedModel(undefined)).toBeUndefined();
  expect(sanitizePersistedModel("")).toBeUndefined();
  expect(sanitizePersistedModel("   ")).toBeUndefined();
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
  const runtime = new ClaudeRuntime(tmpdir());
  const calls: Array<{ sessionId: string; model: string }> = [];
  runtime.setOnModelChange((sessionId, model) => calls.push({ sessionId, model }));

  // Drive the private fold: seed a process state, then invoke captureModelFromLine.
  const internal = runtime as unknown as {
    processes: Map<string, { sessionId: string; model?: string; modelAlias?: string }>;
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
  // modelAlias folds alongside model so a reconnect seeds the client's
  // alias-form currentModel (opusplanActive derives from it, no /model probe).
  expect(internal.processes.get("rt-key")?.modelAlias).toBe("haiku");
  expect(calls).toEqual([{ sessionId: "internal-session-id", model: "haiku" }]);
});

test("captureModelFromLine does not fire onModelChange for non-switch local-command stdout", () => {
  const runtime = new ClaudeRuntime(tmpdir());
  const calls: Array<{ sessionId: string; model: string }> = [];
  runtime.setOnModelChange((sessionId, model) => calls.push({ sessionId, model }));
  const internal = runtime as unknown as {
    processes: Map<string, { sessionId: string; model?: string; modelAlias?: string }>;
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

test("extractContextUsageFromStdoutLine folds usage input+cache_creation+cache_read", () => {
  // JSONL/stream-json 实证形状：assistant 行 message.usage 三项之和 = 下一轮
  // 调用将看到的上下文规模；output_tokens 是本 turn 输出，不计入（仅明细展示）。
  expect(
    extractContextUsageFromStdoutLine({
      type: "assistant",
      message: {
        usage: {
          input_tokens: 30079,
          cache_creation_input_tokens: 1200,
          cache_read_input_tokens: 45,
          output_tokens: 333,
        },
      },
    }),
  ).toEqual({
    contextTokens: 31324,
    inputTokens: 30079,
    cacheCreationTokens: 1200,
    cacheReadTokens: 45,
    outputTokens: 333,
  });
  // 缺 cache 字段（旧 CLI / 非缓存路径）→ 按 0 折算（阈值以上）。
  expect(
    extractContextUsageFromStdoutLine({
      type: "assistant",
      message: { usage: { input_tokens: 5000, output_tokens: 10 } },
    }),
  ).toEqual({
    contextTokens: 5000,
    inputTokens: 5000,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    outputTokens: 10,
  });
  // 网关流式占位行（真实会话 JSONL 实证：chatcmpl-* 中间块带
  // {input:1, output:1, cache:0}）→ 低于阈值丢弃，防「最后一条胜出」把标量拉成 0%。
  expect(
    extractContextUsageFromStdoutLine({
      type: "assistant",
      message: {
        usage: {
          input_tokens: 1,
          output_tokens: 1,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      },
    }),
  ).toBeUndefined();
  // 非 assistant 行 / 无 usage / 全零 → 均不产标量。
  expect(
    extractContextUsageFromStdoutLine({ type: "user", message: { usage: {} } }),
  ).toBeUndefined();
  expect(extractContextUsageFromStdoutLine(null)).toBeUndefined();
  expect(
    extractContextUsageFromStdoutLine({
      type: "assistant",
      message: { usage: { input_tokens: 0, output_tokens: 5 } },
    }),
  ).toBeUndefined();
});

test("extractContextUsageFromControlResponse folds authoritative totalTokens/maxTokens", () => {
  // CLI 2.1.299 get_context_usage 应答实证形状（success envelope 内层 totalTokens /
  // maxTokens；summary 不带 usage 明细，明细字段由调用方另行补齐）。
  expect(
    extractContextUsageFromControlResponse({
      type: "control_response",
      response: {
        subtype: "success",
        request_id: "ctx-usage-x",
        response: { totalTokens: 94836, maxTokens: 230000, percentage: 41, model: "x" },
      },
    }),
  ).toEqual({ contextTokens: 94836, contextWindow: 230000 });
  // categories 同步折算：剔除 CLI 终端 color/percentage/squareFullness，kind 透传；
  // kind 非三态的整条丢弃；空/缺 categories 不带字段。
  expect(
    extractContextUsageFromControlResponse({
      type: "control_response",
      response: {
        subtype: "success",
        request_id: "ctx-usage-x",
        response: {
          totalTokens: 94836,
          maxTokens: 230000,
          categories: [
            { name: "System prompt", tokens: 9025, color: "promptBorder", kind: "used" },
            { name: "Messages", tokens: 50613, color: "x", kind: "used", percentage: 22 },
            { name: "Autocompact buffer", tokens: 33000, color: "inactive", kind: "buffer" },
            { name: "Free space", tokens: 102164, color: "promptBorder", kind: "free" },
            { name: "Corrupt", tokens: 5, kind: "weird" },
            { name: 42, tokens: 5, kind: "used" },
          ],
        },
      },
    }),
  ).toEqual({
    contextTokens: 94836,
    contextWindow: 230000,
    categories: [
      { name: "System prompt", tokens: 9025, kind: "used" },
      { name: "Messages", tokens: 50613, kind: "used" },
      { name: "Autocompact buffer", tokens: 33000, kind: "buffer" },
      { name: "Free space", tokens: 102164, kind: "free" },
    ],
  });
  expect(
    extractContextUsageFromControlResponse({
      type: "control_response",
      response: {
        subtype: "success",
        request_id: "x",
        response: { totalTokens: 100, maxTokens: 200, categories: [] },
      },
    }),
  ).toEqual({ contextTokens: 100, contextWindow: 200 });
  // error 应答 / 缺字段 / 非 control_response → 均不产标量。
  expect(
    extractContextUsageFromControlResponse({
      type: "control_response",
      response: { subtype: "error", request_id: "ctx-usage-x" },
    }),
  ).toBeUndefined();
  expect(
    extractContextUsageFromControlResponse({
      type: "control_response",
      response: { subtype: "success", request_id: "x", response: { totalTokens: 100 } },
    }),
  ).toBeUndefined();
  expect(extractContextUsageFromControlResponse({ type: "result" })).toBeUndefined();
  expect(extractContextUsageFromControlResponse(null)).toBeUndefined();
});

test("readLastContextUsageFromJsonlFile takes last valid usage, skips placeholders/partial lines", () => {
  const dir = mkdtempSync(join(tmpdir(), "ctx-usage-jsonl-"));
  try {
    const filePath = join(dir, "session.jsonl");
    // 真实会话 JSONL 形状：真实 usage 行与网关占位行（total=1）交错，最后可能是占位行；
    // 尾窗边界可能切出半行（首行解析失败须跳过）。
    const assistantLine = (usage: Record<string, number>) =>
      `${JSON.stringify({ type: "assistant", message: { usage } })}\n`;
    writeFileSync(
      filePath,
      [
        `{"partial": trunca\n`, // 跨窗口边界半行（窗口 ≥ 文件大小时不可能出现，容忍即可）
        assistantLine({ input_tokens: 3290, cache_read_input_tokens: 90752, output_tokens: 12 }),
        assistantLine({
          input_tokens: 1,
          output_tokens: 1,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        }),
      ].join(""),
    );
    expect(readLastContextUsageFromJsonlFile(filePath)).toEqual({
      contextTokens: 94042,
      inputTokens: 3290,
      cacheCreationTokens: 0,
      cacheReadTokens: 90752,
      outputTokens: 12,
    });
    // 只有占位行 → 无有效数据。
    writeFileSync(filePath, assistantLine({ input_tokens: 1, output_tokens: 1 }));
    expect(readLastContextUsageFromJsonlFile(filePath)).toBeUndefined();
    // 文件缺失 → undefined。
    expect(readLastContextUsageFromJsonlFile(join(dir, "missing.jsonl"))).toBeUndefined();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("buildSeedInitLine includes contextUsage and stays undefined without any scalar", () => {
  const usage = {
    contextTokens: 31324,
    inputTokens: 30079,
    cacheCreationTokens: 1200,
    cacheReadTokens: 45,
    outputTokens: 333,
    contextWindow: 200_000,
  };
  const parsed = JSON.parse(buildSeedInitLine(undefined, undefined, undefined, usage)!) as Record<
    string,
    unknown
  >;
  expect(parsed).toMatchObject({ type: "system", subtype: "seed_init", contextUsage: usage });
  expect(parsed).not.toHaveProperty("model");
});

test("captureContextUsageFromLine folds proc state and is a no-op on unchanged value", () => {
  const runtime = new ClaudeRuntime(tmpdir());
  const internal = runtime as unknown as {
    processes: Map<string, { sessionId: string; contextUsage?: unknown; contextWindow: number }>;
    captureContextUsageFromLine: (name: string, parsed: Record<string, unknown> | null) => void;
  };
  internal.processes.set("rt-key", { sessionId: "internal-session-id", contextWindow: 200_000 });

  const line = {
    type: "assistant",
    message: {
      usage: { input_tokens: 1000, cache_read_input_tokens: 200, output_tokens: 30 },
    },
  };
  internal.captureContextUsageFromLine("rt-key", line);
  expect(runtime.getSessionState("rt-key")?.contextUsage).toEqual({
    contextTokens: 1200,
    inputTokens: 1000,
    cacheCreationTokens: 0,
    cacheReadTokens: 200,
    outputTokens: 30,
    contextWindow: 200_000,
  });

  // 相同值不重复折（幂等——每条 assistant 消息都过这里，值未动不触发）。
  internal.captureContextUsageFromLine("rt-key", line);
  expect(runtime.getSessionState("rt-key")?.contextUsage?.contextTokens).toBe(1200);

  // 值变化跟随折新（上下文随对话增长）。
  internal.captureContextUsageFromLine("rt-key", {
    type: "assistant",
    message: { usage: { input_tokens: 2000, output_tokens: 10 } },
  });
  expect(runtime.getSessionState("rt-key")?.contextUsage?.contextTokens).toBe(2000);

  // 非 assistant 行不动 state。
  internal.captureContextUsageFromLine("rt-key", { type: "user", message: {} });
  expect(runtime.getSessionState("rt-key")?.contextUsage?.contextTokens).toBe(2000);
});

test("resolveContextWindow: [1m] suffix ⇒ 1M, alias via resolved map, fallback 200k", () => {
  // 显式 [1m] 具体 ID。
  expect(resolveContextWindow("claude-sonnet-5-5[1m]", undefined)).toBe(1_000_000);
  // alias 经 spawn 时映射（含 [1m] 变体键的裸 alias 键查裸 ID）。
  expect(
    resolveContextWindow("sonnet", {
      sonnet: "claude-sonnet-5-5",
      "sonnet[1m]": "claude-sonnet-5-5[1m]",
    }),
  ).toBe(200_000);
  expect(
    resolveContextWindow("sonnet[1m]", {
      sonnet: "claude-sonnet-5-5",
      "sonnet[1m]": "claude-sonnet-5-5[1m]",
    }),
  ).toBe(1_000_000);
  // 未传 --model → CLI 回落 sonnet 默认，同映射查。
  expect(resolveContextWindow(undefined, { sonnet: "claude-sonnet-5-5[1m]" })).toBe(1_000_000);
  // opusplan 普通模式 = sonnet env。
  expect(resolveContextWindow("opusplan", { sonnet: "claude-sonnet-5-5[1m]" })).toBe(1_000_000);
  // 查不到（无映射/脏值）→ 200k。
  expect(resolveContextWindow("sonnet", undefined)).toBe(200_000);
  expect(resolveContextWindow("some-unknown-model", { sonnet: "claude-sonnet-5-5" })).toBe(200_000);
});

test("capturePermissionModeFromLine folds state.permissionMode and fires onPermissionModeChange with the internal sessionId", () => {
  const runtime = new ClaudeRuntime(tmpdir());
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
  const runtime = new ClaudeRuntime(tmpdir());
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
  const runtime = new ClaudeRuntime(tmpdir());
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
  const runtime = new ClaudeRuntime(tmpdir());
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

// ── processStdoutLine → onActivity：真实新 stdout 行触发活动回调 ──
// recordActivity 从 onRealtimeRow（含回放）下沉到 processStdoutLine（真实新行唯一入口），
// 确保 relay 回放的 session_init/seedInit 不会误刷新 updatedAt。本测试覆盖：真实新行 → onActivity。

test("processStdoutLine fires onActivity with the internal sessionId for a real new stdout line", async () => {
  const runtime = new ClaudeRuntime(tmpdir());
  const calls: string[] = [];
  runtime.setOnActivity((sessionId) => calls.push(sessionId));

  const internal = runtime as unknown as {
    processes: Map<string, { sessionId: string; generation: number }>;
    relays: Map<string, unknown>;
    processStdoutLine: (name: string, gen: number, line: string) => Promise<void>;
    isCurrentGeneration: (name: string, gen: number) => boolean;
  };
  internal.processes.set("rt-key", { sessionId: "internal-session-id", generation: 1 });

  // 不设 relay → processStdoutLine 跳过 relay.handleStdoutLine，但仍触发 onActivity。
  await internal.processStdoutLine("rt-key", 1, JSON.stringify({ type: "assistant" }));

  expect(calls).toEqual(["internal-session-id"]);
});

test("processStdoutLine does not fire onActivity when process state is missing", async () => {
  const runtime = new ClaudeRuntime(tmpdir());
  const calls: string[] = [];
  runtime.setOnActivity((sessionId) => calls.push(sessionId));

  const internal = runtime as unknown as {
    processes: Map<string, { sessionId: string }>;
    relays: Map<string, unknown>;
    processStdoutLine: (name: string, gen: number, line: string) => Promise<void>;
  };
  // 无 process 记录（进程未注册 / race）→ state?.sessionId 为 undefined → 不触发。

  await internal.processStdoutLine("missing-key", 1, JSON.stringify({ type: "assistant" }));

  expect(calls).toEqual([]);
});

test("processStdoutLine does not fire onActivity when no callback is registered", async () => {
  const runtime = new ClaudeRuntime(tmpdir());
  // 未调 setOnActivity → onActivity 为 null → 不报错、不触发。

  const internal = runtime as unknown as {
    processes: Map<string, { sessionId: string; generation: number }>;
    relays: Map<string, unknown>;
    processStdoutLine: (name: string, gen: number, line: string) => Promise<void>;
  };
  internal.processes.set("rt-key", { sessionId: "internal-session-id", generation: 1 });

  await expect(
    internal.processStdoutLine("rt-key", 1, JSON.stringify({ type: "assistant" })),
  ).resolves.toBeUndefined();
});

test("injectLiveLine forwards the line to the registered relay", () => {
  const runtime = new ClaudeRuntime(tmpdir());
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
  const runtime = new ClaudeRuntime(tmpdir());
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
  expect(env.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
  expect(env.ANTHROPIC_API_KEY).toBeUndefined();
  expect(env.ANTHROPIC_BASE_URL).toBeUndefined();
  // 无 provider 不设 host-managed 标志——用户经 ~/.claude/settings.json 自管端点不受影响。
  expect(env.CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST).toBeUndefined();
});

test("buildSpawnEnv injects CLAUDE_CODE_EFFORT_LEVEL from effort", () => {
  const env = buildSpawnEnv("xhigh", undefined, { PATH: "/usr/bin" });
  expect(env.CLAUDE_CODE_EFFORT_LEVEL).toBe("xhigh");
  expect(env.PATH).toBe("/usr/bin");
});

test("buildSpawnEnv injects provider apiKey and baseUrl", () => {
  const env = buildSpawnEnv(undefined, { apiKey: "sk-ant-xxx", baseUrl: "https://gw.example" }, {});
  // 凭证注入 AUTH_TOKEN（Bearer 形态）：API_KEY 有 CLI customApiKeyResponses consent 门槛，
  // 无头 spawn 无人批准 → CLI 弃用 key → 网关 401 "API key required"（见 buildSpawnEnv 注释）。
  expect(env.ANTHROPIC_AUTH_TOKEN).toBe("sk-ant-xxx");
  expect(env.ANTHROPIC_API_KEY).toBeUndefined();
  expect(env.ANTHROPIC_BASE_URL).toBe("https://gw.example");
  // 有 provider 时设 host-managed 标志：CLI 据此从自身 settings env 块剔除 provider
  // 变量（BASE_URL/AUTH_TOKEN 等），防历史遗留配置覆盖宿主注入。
  expect(env.CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST).toBe("1");
});

test("buildSpawnEnv omits baseUrl when provider has only apiKey", () => {
  const env = buildSpawnEnv(undefined, { apiKey: "sk-ant-xxx" }, {});
  expect(env.ANTHROPIC_AUTH_TOKEN).toBe("sk-ant-xxx");
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

// ── buildSpawnEnv: view 注入 ANTHROPIC_DEFAULT_*_MODEL（对齐 CLI alias [1m] 后缀机制） ──

// view = {modelMapping, enable1mContext}：env 注入复用 buildAvailableAliases 的 resolved。
// resolved[tier] 恒为裸 ID（env 注入值），[1m] 由 CLI 经 alias [1m] 后缀在 env 裸 ID 上拼接。
// enable1mContext 只控制菜单是否出 [1m] 变体，不影响 env 注入值。
const aliasView = { modelMapping: ALIAS_MAPPING, enable1mContext: false };

const concreteView = { modelMapping: CONCRETE_MAPPING, enable1mContext: false };

test("buildSpawnEnv injects ANTHROPIC_DEFAULT_*_MODEL bare（env 恒裸，[1m] 由 CLI alias 后缀拼接）", () => {
  const env = buildSpawnEnv(undefined, undefined, {}, { ...concreteView, enable1mContext: true });
  // enable1mContext=true 不影响 env 注入值——env 恒注裸 ID，[1m] 由 CLI 经 alias[1m] 后缀决定。
  expect(env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe("claude-opus-4-8");
  expect(env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe("claude-sonnet-4-6");
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
  const runtime = new ClaudeRuntime(tmpdir(), makeSettingsStore(CONCRETE_MAPPING, true));
  expect(await runtime.resolveControlModel("sonnet")).toBe("sonnet");
  expect(await runtime.resolveControlModel("opusplan")).toBe("opusplan");
});

test("resolveControlModel passes concrete id through (legacy clients)", async () => {
  const runtime = new ClaudeRuntime(tmpdir(), makeSettingsStore(CONCRETE_MAPPING, true));
  expect(await runtime.resolveControlModel("claude-opus-4-8")).toBe("claude-opus-4-8");
  expect(await runtime.resolveControlModel("claude-sonnet-4-6[1m]")).toBe("claude-sonnet-4-6[1m]");
});

test("resolveControlModel passes model through when settingsStore absent", async () => {
  const runtime = new ClaudeRuntime(tmpdir());
  expect(await runtime.resolveControlModel("opus")).toBe("opus");
  expect(await runtime.resolveControlModel(undefined)).toBeUndefined();
});

test("captureApprovalRequestFromLine：登记 can_use_tool，input 非对象/为 null 一律忽略", () => {
  const runtime = new ClaudeRuntime(tmpdir());
  const calls: Array<{ runtimeKey: string; sessionId: string; projectName: string }> = [];
  runtime.setOnApprovalRequest((info) => calls.push(info));
  const internal = runtime as unknown as {
    processes: Map<string, { sessionId: string; projectName: string }>;
    captureApprovalRequestFromLine: (name: string, parsed: Record<string, unknown> | null) => void;
  };
  internal.processes.set("rt-key", { projectName: "demo", sessionId: "agent_1" });

  internal.captureApprovalRequestFromLine("rt-key", {
    type: "control_request",
    request_id: "req-1",
    request: { subtype: "can_use_tool", tool_name: "Bash", input: { command: "ls" } },
  });
  expect(calls).toEqual([{ runtimeKey: "rt-key", projectName: "demo", sessionId: "agent_1" }]);

  // input: null 时 typeof 仍是 "object"——必须显式排除，否则摘要处 TypeError 炸掉整条
  // stdout reader（reviewer P2）。非 can_use_tool / 非对象 input / 未知 runtime 同样忽略。
  internal.captureApprovalRequestFromLine("rt-key", {
    type: "control_request",
    request_id: "req-null",
    request: { subtype: "can_use_tool", tool_name: "Bash", input: null },
  });
  internal.captureApprovalRequestFromLine("rt-key", {
    type: "control_request",
    request_id: "req-other",
    request: { subtype: "set_model", input: {} },
  });
  internal.captureApprovalRequestFromLine("rt-key", {
    type: "control_request",
    request_id: "req-str",
    request: { subtype: "can_use_tool", input: "oops" },
  });
  internal.captureApprovalRequestFromLine("gone", {
    type: "control_request",
    request_id: "req-gone",
    request: { subtype: "can_use_tool", input: {} },
  });
  expect(calls).toHaveLength(1);
});

test("close 路径显式收口审批（exited 回调被 generation 守卫挡下）", async () => {
  const runtime = new ClaudeRuntime(tmpdir());
  const settled: string[] = [];
  runtime.setOnApprovalRuntimeSettled((runtimeKey) => settled.push(runtimeKey));
  const internal = runtime as unknown as {
    processes: Map<string, { sessionId: string; projectName: string; proc: { kill(): void } }>;
  };
  internal.processes.set("rt-key", {
    projectName: "demo",
    sessionId: "agent_1",
    proc: { kill: () => {} },
  });

  await runtime.close("rt-key");
  // close 先 delete 再 kill → exited 回调的 isCurrentGeneration 恒 false，收口只能在此显式触发。
  expect(settled).toEqual(["rt-key"]);
  expect(internal.processes.has("rt-key")).toBe(false);
});

test("close silent（双模式切换）：不广播 closed、不触发审批 settled，进程照杀", async () => {
  const runtime = new ClaudeRuntime(tmpdir());
  const settled: string[] = [];
  runtime.setOnApprovalRuntimeSettled((runtimeKey) => settled.push(runtimeKey));
  const statusCalls: Array<{ sessionId: string; status: string }> = [];
  runtime.setOnSessionStatusChange((sessionId, status) => statusCalls.push({ sessionId, status }));
  const internal = runtime as unknown as {
    processes: Map<string, { sessionId: string; projectName: string; proc: { kill(): void } }>;
  };
  let killed = false;
  internal.processes.set("rt-key", {
    projectName: "demo",
    sessionId: "agent_1",
    proc: {
      kill: () => {
        killed = true;
      },
    },
  });

  await runtime.close("rt-key", { silent: true });
  // 会话没关，只是换进程形态（headless → tmux）：不广播 closed、审批收口交编排方 clearRuntime。
  expect(killed).toBe(true);
  expect(statusCalls).toEqual([]);
  expect(settled).toEqual([]);
  expect(internal.processes.has("rt-key")).toBe(false);
});

// ── buildTuiSpawnArgs：TUI（终端）形态 argv（双模式，2026-10-15）─────────────

test("buildTuiSpawnArgs 无审批参数、无流参数，带 resume/session-id 与规范名", () => {
  const args = buildTuiSpawnArgs({
    claudeSessionId: "3f2a4b6c-1111-2222-3333-444455556666",
    resume: true,
    model: "claude-opus-5-5",
    permissionMode: "auto",
    effort: "high",
    mcpArgs: ["--mcp-config", '{"mcpServers":{}}'],
  });
  expect(args).toEqual([
    "claude",
    "--resume",
    "3f2a4b6c-1111-2222-3333-444455556666",
    "--model",
    "claude-opus-5-5",
    "--permission-mode",
    "auto",
    "--effort",
    "high",
    "--mcp-config",
    '{"mcpServers":{}}',
  ]);
  // 审批让位（CLI 自己的 TUI 弹审批）+ 无 stream 可解析：三个 headless 专属参数都不带。
  expect(args).not.toContain("--permission-prompt-tool");
  expect(args).not.toContain("--output-format");
  expect(args).not.toContain("--verbose");
  expect(args).not.toContain("--input-format");
});

test("buildTuiSpawnArgs 未落盘（JSONL 不存在）走 --session-id", () => {
  const args = buildTuiSpawnArgs({ claudeSessionId: "abc", resume: false });
  expect(args).toEqual(["claude", "--session-id", "abc"]);
});

test("resolveTuiSpawn 按 JSONL 存在性判定 resume/session-id（与 headless spawn 同口径）", async () => {
  const runtime = new ClaudeRuntime(mkdtempSync(join(tmpdir(), "ar-tui-spawn-run-")));
  // 唯一 slug 项目路径放 home 内（claudeJsonlPath 落 ~/.claude/projects/<slug>/），清理只动自建目录。
  const projectPath = mkdtempSync(join(homedir(), ".ar-test-tui-spawn-"));
  const claudeSessionId = "3f2a4b6c-1111-2222-3333-444455556666";
  const jsonlPath = claudeJsonlPath(projectPath, claudeSessionId);
  try {
    // 全新 id：JSONL 尚未落盘 → --session-id（CLI 实测该参数只接全新 id）。
    expect(
      await runtime.resolveTuiSpawn({
        projectName: "demo",
        projectPath,
        claudeSessionId,
        permissionMode: "auto",
      }),
    ).toEqual(["claude", "--session-id", claudeSessionId, "--permission-mode", "auto"]);
    // 已有 JSONL（会话跑过）→ --resume 接续（--resume 对不存在 id 硬失败）。
    mkdirSync(dirname(jsonlPath), { recursive: true });
    writeFileSync(jsonlPath, "");
    const resumed = await runtime.resolveTuiSpawn({
      projectName: "demo",
      projectPath,
      claudeSessionId,
    });
    expect(resumed.slice(0, 3)).toEqual(["claude", "--resume", claudeSessionId]);
  } finally {
    rmSync(projectPath, { recursive: true, force: true });
    rmSync(dirname(jsonlPath), { recursive: true, force: true });
  }
});

// ── turn 状态机(5 态,OSC 7501 对齐)─────────────────────────────────────────

type StatusHarness = {
  runtime: ClaudeRuntime;
  internal: {
    processes: Map<string, Record<string, unknown>>;
    relays: Map<string, { isDestroyed: boolean; injectLiveLine: (line: string) => void }>;
    captureTurnResultFromLine: (name: string, parsed: Record<string, unknown> | null) => void;
    captureApprovalRequestFromLine: (name: string, parsed: Record<string, unknown> | null) => void;
  };
  injected: string[];
  statusCalls: Array<{ sessionId: string; status: string }>;
};

function seedStatusHarness(initial: string): StatusHarness {
  const runtime = new ClaudeRuntime(tmpdir());
  const injected: string[] = [];
  const statusCalls: Array<{ sessionId: string; status: string }> = [];
  runtime.setOnSessionStatusChange((sessionId, status) => statusCalls.push({ sessionId, status }));
  const internal = runtime as unknown as StatusHarness["internal"];
  internal.processes.set("rt-key", {
    sessionId: "agent_1",
    projectName: "demo",
    sessionStatus: initial,
  });
  internal.relays.set("rt-key", {
    isDestroyed: false,
    injectLiveLine: (line) => injected.push(line),
  });
  return { runtime, internal, injected, statusCalls };
}

test("turn 状态机: result(is_error=false) → done,广播 session_status 帧 + 落盘回调", () => {
  const h = seedStatusHarness("working");
  h.internal.captureTurnResultFromLine("rt-key", { type: "result", is_error: false });
  expect(h.internal.processes.get("rt-key")?.sessionStatus).toBe("done");
  expect(h.injected).toEqual([
    JSON.stringify({ type: "system", subtype: "session_status", status: "done" }),
  ]);
  expect(h.statusCalls).toEqual([{ sessionId: "agent_1", status: "done" }]);
});

test("turn 状态机: result(is_error=true) → error", () => {
  const h = seedStatusHarness("working");
  h.internal.captureTurnResultFromLine("rt-key", { type: "result", is_error: true });
  expect(h.internal.processes.get("rt-key")?.sessionStatus).toBe("error");
  expect(h.statusCalls).toEqual([{ sessionId: "agent_1", status: "error" }]);
});

test("turn 状态机: can_use_tool 行 → blocked(与审批登记同一采集点)", () => {
  const h = seedStatusHarness("working");
  h.internal.captureApprovalRequestFromLine("rt-key", {
    type: "control_request",
    request_id: "req-1",
    request: { subtype: "can_use_tool", input: { command: "ls" } },
  });
  expect(h.internal.processes.get("rt-key")?.sessionStatus).toBe("blocked");
});

test("turn 状态机: reportApprovalSettled blocked→working;非 blocked 防御忽略", () => {
  const h = seedStatusHarness("blocked");
  h.runtime.reportApprovalSettled("rt-key");
  expect(h.internal.processes.get("rt-key")?.sessionStatus).toBe("working");

  const idle = seedStatusHarness("idle");
  idle.runtime.reportApprovalSettled("rt-key");
  expect(idle.internal.processes.get("rt-key")?.sessionStatus).toBe("idle");
  expect(idle.statusCalls).toEqual([]);
});

test("turn 状态机: reportUserInput done→working;working 幂等无迁移", () => {
  const h = seedStatusHarness("done");
  h.runtime.reportUserInput("rt-key");
  expect(h.internal.processes.get("rt-key")?.sessionStatus).toBe("working");

  const working = seedStatusHarness("working");
  working.runtime.reportUserInput("rt-key");
  expect(working.internal.processes.get("rt-key")?.sessionStatus).toBe("working");
  expect(working.statusCalls).toEqual([]);
});

test("turn 状态机: closed 吸收后续信号;close 幂等", () => {
  const h = seedStatusHarness("working");
  const internal = h.internal as StatusHarness["internal"] & {
    applyStatusSignal: (name: string, signal: { kind: string }) => void;
  };
  internal.applyStatusSignal("rt-key", { kind: "close" });
  expect(h.internal.processes.get("rt-key")?.sessionStatus).toBe("closed");

  // closed 后 result/approval 不再翻状态。
  h.internal.captureTurnResultFromLine("rt-key", { type: "result", is_error: false });
  expect(h.internal.processes.get("rt-key")?.sessionStatus).toBe("closed");
});
