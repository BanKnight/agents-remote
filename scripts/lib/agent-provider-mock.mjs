// provider 注册表 mock（GET /api/agent-providers）单源：能力声明表批（2026-11-13）起，
// web 的自动重试可用面 / 双模式门禁 / 显示名 / 创建菜单行都由该端点驱动——浏览器探针
// 若不 mock 而透传真实后端，则隔离环境 / 后端挂时 caps undefined → 控件消失 → 断言假
// FAIL（负向断言更会掩盖「永不渲染」类回归）。三 provider 值与 api/src/
// agent-provider-profiles.ts 注册表同值；改注册表时同步这里。
export const AGENT_PROVIDER_REGISTRY = [
  {
    provider: "claude",
    label: "Claude",
    transport: "claude",
    displayNamePrefix: "Claude Agent",
    capabilities: {
      history: "native",
      mcpInject: "native",
      modes: { dualMode: "native", terminalResumeId: "claudeSessionId" },
      approvals: { center: "native", oneClick: "partial" },
      autoRetry: "native",
      configSwitch: "immediate",
    },
  },
  {
    provider: "omp",
    label: "omp",
    transport: "acp",
    displayNamePrefix: "OMP Agent",
    capabilities: {
      history: "native",
      mcpInject: "unsupported",
      modes: { dualMode: "unsupported" },
      approvals: { center: "unsupported", oneClick: "partial" },
      autoRetry: "unsupported",
      configSwitch: "advertised",
    },
  },
  {
    provider: "codex",
    label: "Codex",
    transport: "codex",
    displayNamePrefix: "Codex Agent",
    capabilities: {
      history: "native",
      mcpInject: "native",
      modes: { dualMode: "native", terminalResumeId: "codexThreadId" },
      approvals: { center: "native", oneClick: "all" },
      autoRetry: "native",
      configSwitch: "nextTurn",
    },
  },
];

/** 给 page 注册 /api/agent-providers mock（探针 setupMocks 内调用）。 */
export function mockAgentProviders(page) {
  return page.route(/\/api\/agent-providers$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ providers: AGENT_PROVIDER_REGISTRY }),
    }),
  );
}
