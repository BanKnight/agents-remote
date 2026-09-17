import { expect, test } from "bun:test";
import { getAgentProviderProfile, parsePermissionModeChoices } from "./agent-provider-profiles";

test("getAgentProviderProfile returns internal Claude and Codex profiles", () => {
  expect(getAgentProviderProfile("claude")).toEqual({
    provider: "claude",
    transport: "claude",
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
    transport: "codex",
    label: "Codex",
    command: "codex",
    displayNamePrefix: "Codex Agent",
    capabilities: {
      history: "unsupported",
    },
  });
});

test("omp profile 走 acp transport（provider 粒度 = CLI，transport = 协议家族）", () => {
  expect(getAgentProviderProfile("omp")).toEqual({
    provider: "omp",
    transport: "acp",
    label: "omp",
    command: "omp",
    displayNamePrefix: "OMP Agent",
    capabilities: {
      history: "native",
    },
    // 凭据注入声明：env 变量名是 CLI 固有属性（omp 的 anthropic 形态）；切片未配置时
    // 不注入，回落 omp 自身凭证链（provider 平权，不借用其它 runtime 的配置）。
    credentials: {
      env: { apiKey: "ANTHROPIC_API_KEY", baseUrl: "ANTHROPIC_BASE_URL" },
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
