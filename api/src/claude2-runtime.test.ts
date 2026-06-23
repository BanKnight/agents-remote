import { expect, test } from "bun:test";
import { buildSeedInitLine } from "./claude2-runtime";

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
