import { expect, test } from "bun:test";
import {
  getAgentProviderProfile,
  listAgentProviderInfo,
  parsePermissionModeChoices,
} from "./agent-provider-profiles";

test("getAgentProviderProfile returns internal Claude and Codex profiles", () => {
  expect(getAgentProviderProfile("claude")).toEqual({
    provider: "claude",
    transport: "claude",
    label: "Claude",
    command: "claude",
    displayNamePrefix: "Claude Agent",
    capabilities: {
      history: "native",
      mcpInject: "native",
      modes: { dualMode: "native", terminalResumeId: "claudeSessionId" },
      approvals: { center: "native", oneClick: "partial" },
      autoRetry: "native",
      configSwitch: "immediate",
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
      // 历史列表 = rollout 扫描（批 F）+ thread/resume 回放；MCP 注入已通（批 E 探针：
      // `-c mcp_servers.*.url=…` 被 0.163 收下并真连上 stub）。
      history: "native",
      mcpInject: "native",
      modes: { dualMode: "native", terminalResumeId: "codexThreadId" },
      approvals: { center: "native", oneClick: "all" },
      autoRetry: "native",
      configSwitch: "nextTurn",
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
      mcpInject: "unsupported",
      modes: { dualMode: "unsupported" },
      approvals: { center: "unsupported", oneClick: "partial" },
      autoRetry: "unsupported",
      configSwitch: "advertised",
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

test("listAgentProviderInfo 投影序 = claude → omp → codex（注册表字面量序即创建菜单行序，防重排回归）", () => {
  // 行序契约（review design P3-1）：web 创建菜单直接透传投影序，对齐新建实例原型
  // （workspace-new-instance.html）。谁重排 profiles 字面量，这里先红。
  expect(listAgentProviderInfo().map((p) => p.provider)).toEqual(["claude", "omp", "codex"]);
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
