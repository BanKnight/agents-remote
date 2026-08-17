import { expect, test } from "bun:test";
import { getAgentProviderProfile, parsePermissionModeChoices } from "./agent-provider-profiles";

test("getAgentProviderProfile returns internal Claude and Codex profiles", () => {
  expect(getAgentProviderProfile("claude")).toEqual({
    provider: "claude",
    label: "Claude",
    command: "claude",
    displayNamePrefix: "Claude Agent",
    capabilities: {
      history: "native",
    },
    availableModels: ["sonnet", "opus", "haiku"],
  });
  expect(getAgentProviderProfile("codex")).toEqual({
    provider: "codex",
    label: "Codex",
    command: "codex",
    displayNamePrefix: "Codex Agent",
    capabilities: {
      history: "unsupported",
    },
  });
});

test("getAgentProviderProfile treats missing provider as unavailable", () => {
  expect(getAgentProviderProfile(undefined)).toBeUndefined();
});

test("parsePermissionModeChoices parses multi-line choices from claude --help", () => {
  // claude --help 的 choices 跨多行（对齐当前 CLI 实际输出格式）。
  const help = [
    "  --permission-mode <mode>  Permission mode to use for the session",
    '                                    (choices: "acceptEdits", "auto",',
    '                                      "bypassPermissions", "manual",',
    '                                      "dontAsk", "plan")',
  ].join("\n");
  expect(parsePermissionModeChoices(help)).toEqual([
    "acceptEdits",
    "auto",
    "bypassPermissions",
    "manual",
    "dontAsk",
    "plan",
  ]);
});

test("parsePermissionModeChoices returns undefined when no choices listed", () => {
  expect(parsePermissionModeChoices("  --permission-mode <mode>  desc")).toBeUndefined();
  expect(parsePermissionModeChoices("")).toBeUndefined();
});
