import { expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { buildSeedInitLine, extractModelFromStdoutLine, Claude2Runtime } from "./claude2-runtime";

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
