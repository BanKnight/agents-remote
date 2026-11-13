import { expect, test } from "bun:test";
import {
  agentHistoryGroupKey,
  AGENT_HISTORY_GROUP_ORDER,
  CLAUDE_MODEL_TIERS,
  COMPACT_BOUNDARY_SUBTYPES,
  EFFORT_LEVELS,
  isCompactBoundarySubtype,
  isOneClickApprovable,
  isUnresolvedControlRequest,
  resolveAutoRetryCapability,
  resolveModeSwitch,
  WEAKEST_AGENT_CAPABILITIES,
} from "./index";
import type {
  AgentProviderCapabilities,
  AgentSession,
  ApiErrorResponse,
  CloseAgentSessionResponse,
  CloseTerminalSessionResponse,
  CreateAgentSessionRequest,
  CreateAgentSessionResponse,
  CreateProjectRequest,
  CreateProjectResponse,
  CreateTerminalSessionRequest,
  CreateTerminalSessionResponse,
  GitDiffListResponse,
  GitFileDiffResponse,
  HealthResponse,
  ListAgentSessionsResponse,
  ListTerminalSessionsResponse,
  ProjectDetailResponse,
  ProjectFileListResponse,
  ProjectFilePreviewResponse,
  ProjectListResponse,
  SessionShellsStreamClientMessage,
  SessionStreamClientMessage,
  SessionStreamServerMessage,
  TerminalSession,
  TerminalSessionDetailResponse,
  ClaudePreset,
  ClaudePresetMasked,
  CreateClaudePresetRequest,
  GetSettingsResponse,
  SettingsState,
  UpdateClaudePresetRequest,
  UpdateClaudeRuntimeRequest,
} from "./index";

test("HealthResponse marks the api service", () => {
  const response: HealthResponse = { ok: true, service: "api" };

  expect(response.service).toBe("api");
});

test("Project API DTOs describe project requests and responses", () => {
  const request: CreateProjectRequest = { path: "demo" };
  const project = {
    name: "demo",
    path: "/projects/demo",
    agentSessionCount: 0,
    terminalSessionCount: 0,
  };
  const list: ProjectListResponse = { projects: [project] };
  const created: CreateProjectResponse = { project };
  const detail: ProjectDetailResponse = { project };
  const error: ApiErrorResponse = {
    error: {
      code: "PROJECT_PATH_OUTSIDE_ROOT",
      message: "Project path must stay inside PROJECTS_ROOT",
    },
  };

  expect(request.path).toBe("demo");
  expect(list.projects[0].name).toBe("demo");
  expect(created.project.path).toBe("/projects/demo");
  expect(detail.project.agentSessionCount).toBe(0);
  expect(error.error.code).toBe("PROJECT_PATH_OUTSIDE_ROOT");
});

test("Project Files DTOs describe directory listings and preview states", () => {
  const list: ProjectFileListResponse = {
    projectName: "demo",
    path: "src",
    parentPath: "",
    entries: [
      { name: ".config", path: "src/.config", type: "directory", hidden: true, size: null },
      { name: "index.ts", path: "src/index.ts", type: "file", hidden: false, size: 120 },
    ],
  };
  const text: ProjectFilePreviewResponse = {
    type: "text",
    projectName: "demo",
    path: "README.md",
    name: "README.md",
    size: 42,
    content: "hello",
  };
  const image: ProjectFilePreviewResponse = {
    type: "image",
    projectName: "demo",
    path: "logo.png",
    name: "logo.png",
    size: 12,
    mediaType: "image/png",
    dataUrl: "data:image/png;base64,abc",
  };
  const unsupported: ProjectFilePreviewResponse = {
    type: "unsupported",
    projectName: "demo",
    path: "archive.zip",
    name: "archive.zip",
    size: 100,
    reason: "unsupported_type",
  };
  const tooLarge: ProjectFilePreviewResponse = {
    type: "too_large",
    projectName: "demo",
    path: "large.txt",
    name: "large.txt",
    size: 300_000,
    limitBytes: 262_144,
  };
  const error: ApiErrorResponse = {
    error: {
      code: "PROJECT_FILE_NOT_DIRECTORY",
      message: "Project file path must be a directory",
    },
  };

  expect(list.entries[0].hidden).toBe(true);
  expect(text.type).toBe("text");
  expect(image.mediaType).toBe("image/png");
  expect(unsupported.reason).toBe("unsupported_type");
  expect(tooLarge.limitBytes).toBe(262_144);
  expect(error.error.code).toBe("PROJECT_FILE_NOT_DIRECTORY");
});

test("Git diff DTOs describe repository states and file diffs", () => {
  const list: GitDiffListResponse = {
    repository: true,
    projectName: "demo",
    files: [
      { path: "src/index.ts", status: "modified", scope: "worktree" },
      { path: "README.md", previousPath: "README.old.md", status: "renamed", scope: "staged" },
    ],
  };
  const nonRepository: GitDiffListResponse = {
    repository: false,
    projectName: "demo",
    reason: "not_git_repository",
  };
  const diff: GitFileDiffResponse = {
    repository: true,
    projectName: "demo",
    path: "src/index.ts",
    scope: "worktree",
    status: "modified",
    diff: "diff --git a/src/index.ts b/src/index.ts",
  };
  const error: ApiErrorResponse = {
    error: {
      code: "PROJECT_GIT_FILE_NOT_CHANGED",
      message: "Git file is not changed",
    },
  };

  expect(list.repository).toBe(true);
  expect(list.files[1].previousPath).toBe("README.old.md");
  expect(nonRepository.reason).toBe("not_git_repository");
  expect(diff.diff).toContain("diff --git");
  expect(error.error.code).toBe("PROJECT_GIT_FILE_NOT_CHANGED");
});

test("Session API DTOs keep Agent and Terminal semantics separate", () => {
  const agent: AgentSession = {
    id: "agt_123",
    projectName: "demo",
    provider: "claude",
    displayName: "Claude agent 123",
    status: "idle",
  };
  const terminal: TerminalSession = {
    id: "term_123",
    projectName: "demo",
    displayName: "Terminal 123",
    status: "running",
  };
  const createAgent: CreateAgentSessionRequest = { provider: "codex" };
  const createTerminal: CreateTerminalSessionRequest = {};
  const agentList: ListAgentSessionsResponse = { sessions: [agent] };
  const terminalList: ListTerminalSessionsResponse = { sessions: [terminal] };
  const createdAgent: CreateAgentSessionResponse = { session: agent };
  const createdTerminal: CreateTerminalSessionResponse = { session: terminal };
  const closedAgent: CloseAgentSessionResponse = {
    session: { ...agent, status: "closed" },
  };
  const terminalDetail: TerminalSessionDetailResponse = { session: terminal };
  const closedTerminal: CloseTerminalSessionResponse = {
    session: { ...terminal, status: "closed" },
  };

  expect(createAgent.provider).toBe("codex");
  expect(createTerminal.displayName).toBeUndefined();
  expect(agentList.sessions[0].provider).toBe("claude");
  expect(terminalList.sessions[0].displayName).toBe("Terminal 123");
  expect(createdAgent.session.status).toBe("idle");
  expect(createdTerminal.session.status).toBe("running");
  expect(closedAgent.session.status).toBe("closed");
  expect(terminalDetail.session.projectName).toBe("demo");
  expect(closedTerminal.session.status).toBe("closed");
});

test("Session stream envelopes describe transport messages", () => {
  const input: SessionStreamClientMessage = { type: "input", data: "pwd\n" };
  const resize: SessionStreamClientMessage = { type: "resize", cols: 100, rows: 30 };
  const snapshot: SessionStreamServerMessage = { type: "snapshot", data: "$ pwd" };
  const disconnected: SessionStreamServerMessage = { type: "status", status: "disconnected" };
  const error: SessionStreamServerMessage = {
    type: "error",
    code: "SESSION_RUNTIME_MISSING",
    message: "Session ended",
  };

  expect(input.data).toBe("pwd\n");
  expect(resize.cols).toBe(100);
  expect(snapshot.data).toContain("pwd");
  expect(disconnected.status).toBe("disconnected");
  expect(error.code).toBe("SESSION_RUNTIME_MISSING");
});

test("Sessions stream client envelope reports device visibility", () => {
  // push 通知根治批 B 段：客户端上行 visibility 帧（服务端按连接记账，断线即清）。
  const frame: SessionShellsStreamClientMessage = {
    type: "visibility",
    deviceId: "device-1",
    visible: true,
  };

  expect(frame.type).toBe("visibility");
  expect(frame.deviceId).toBe("device-1");
  expect(frame.visible).toBe(true);
});

test("isCompactBoundarySubtype matches the two boundary subtypes only", () => {
  expect(isCompactBoundarySubtype("compact_boundary")).toBe(true);
  expect(isCompactBoundarySubtype("microcompact_boundary")).toBe(true);
  expect(isCompactBoundarySubtype("init")).toBe(false);
  expect(isCompactBoundarySubtype("status")).toBe(false);
  expect(isCompactBoundarySubtype(undefined)).toBe(false);
  expect(isCompactBoundarySubtype(null)).toBe(false);
  expect(COMPACT_BOUNDARY_SUBTYPES).toEqual(["compact_boundary", "microcompact_boundary"]);
});

test("Settings DTOs describe claude presets and runtime defaults", () => {
  const preset: ClaudePreset = {
    id: "preset_1",
    label: "Anthropic 官方",
    apiKey: "sk-ant-abc123wX4k",
    baseUrl: "https://api.anthropic.com",
    modelMapping: { default: "sonnet", opus: "opus", sonnet: "sonnet", haiku: "haiku" },
  };
  const masked: ClaudePresetMasked = {
    id: preset.id,
    label: preset.label,
    baseUrl: preset.baseUrl,
    modelMapping: preset.modelMapping,
    apiKeyMasked: "sk-ant-...wX4k",
    hasApiKey: true,
  };
  const state: SettingsState = {
    runtimes: {
      claude: {
        presets: [preset],
        activePresetId: preset.id,
        enable1mContext: false,
        effort: "high",
      },
    },
  };
  const response: GetSettingsResponse = {
    settings: {
      runtimes: {
        claude: {
          presets: [masked],
          activePresetId: preset.id,
          enable1mContext: false,
          effort: "high",
        },
      },
    },
  };
  const createPreset: CreateClaudePresetRequest = {
    label: "中转 A",
    apiKey: "sk-xxx",
    baseUrl: "https://relay.example",
    modelMapping: { default: "sonnet", opus: "opus", sonnet: "sonnet", haiku: "haiku" },
  };
  const updatePreset: UpdateClaudePresetRequest = { label: "中转 A（改）" };
  const updateRuntime: UpdateClaudeRuntimeRequest = {
    activePresetId: preset.id,
    effort: "max",
    enable1mContext: true,
  };

  expect(masked.hasApiKey).toBe(true);
  expect(masked.apiKeyMasked).toBe("sk-ant-...wX4k");
  expect(state.runtimes.claude.presets[0].modelMapping.opus).toBe("opus");
  expect(state.runtimes.claude.activePresetId).toBe(preset.id);
  expect(response.settings.runtimes.claude.presets[0].apiKeyMasked).toContain("...");
  expect(createPreset.baseUrl).toBe("https://relay.example");
  expect(updatePreset.apiKey).toBeUndefined();
  expect(updateRuntime.activePresetId).toBe(preset.id);
});

test("EFFORT_LEVELS and CLAUDE_MODEL_TIERS enumerate all variants", () => {
  expect(EFFORT_LEVELS).toEqual(["low", "medium", "high", "xhigh", "max"]);
  expect(CLAUDE_MODEL_TIERS).toEqual(["default", "opus", "sonnet", "haiku"]);
});

test("agentHistoryGroupKey 五档分组边界（v1.5 批5）", () => {
  const now = new Date("2026-10-06T15:00:00");
  const iso = (d: Date) => d.toISOString();
  const dayMs = 86_400_000;
  // 今天：本地日历日内（含今天 00:00 整）
  expect(agentHistoryGroupKey(iso(new Date(2026, 9, 6, 0, 0)), now)).toBe("today");
  expect(agentHistoryGroupKey(iso(new Date(2026, 9, 6, 14, 59)), now)).toBe("today");
  // 昨天：今天 00:00 之前 ≥0、<24h
  expect(agentHistoryGroupKey(iso(new Date(2026, 9, 5, 23, 59)), now)).toBe("yesterday");
  expect(agentHistoryGroupKey(iso(new Date(2026, 9, 5, 0, 0)), now)).toBe("yesterday");
  // 7 天内：早于昨日 00:00 且 ≤7d（昨天 14:59 这类 now-24h 时刻属「昨天」日历日，不算 week）
  expect(agentHistoryGroupKey(iso(new Date(2026, 9, 4, 23, 59)), now)).toBe("week");
  expect(agentHistoryGroupKey(iso(new Date(now.getTime() - 7 * dayMs)), now)).toBe("week");
  // 30 天内：>7d 且 ≤30d
  expect(agentHistoryGroupKey(iso(new Date(now.getTime() - 7 * dayMs - 1)), now)).toBe("month");
  expect(agentHistoryGroupKey(iso(new Date(now.getTime() - 30 * dayMs)), now)).toBe("month");
  // 更早
  expect(agentHistoryGroupKey(iso(new Date(now.getTime() - 30 * dayMs - 1)), now)).toBe("earlier");
  // 兜底：null / 非法 ISO
  expect(agentHistoryGroupKey(null, now)).toBe("earlier");
  expect(agentHistoryGroupKey("not-a-date", now)).toBe("earlier");
  // 组头渲染顺序固定
  expect(AGENT_HISTORY_GROUP_ORDER).toEqual(["today", "yesterday", "week", "month", "earlier"]);
});

test("isOneClickApprovable excludes the two complex-approval tools", () => {
  // 一键 allow/deny 表达不了真实应答的两类（§6.5 补强批谓词单源）
  expect(isOneClickApprovable("ExitPlanMode")).toBe(false);
  expect(isOneClickApprovable("AskUserQuestion")).toBe(false);
  // 普通工具照常可一键应答
  expect(isOneClickApprovable("Bash")).toBe(true);
  expect(isOneClickApprovable("Write")).toBe(true);
  expect(isOneClickApprovable("Task")).toBe(true);
});

test("isUnresolvedControlRequest: 注入且未解决才为真", () => {
  // 注入且未解决（无 result、未中断）→ 待确认
  expect(isUnresolvedControlRequest({ controlRequestId: "req-1" })).toBe(true);
  // result 到达 → 已解决
  expect(isUnresolvedControlRequest({ controlRequestId: "req-1", result: { ok: true } })).toBe(
    false,
  );
  // 空串 result 同样视为已解决（truthy 语义，与 claude-adapter 原三处散写一致）
  expect(isUnresolvedControlRequest({ controlRequestId: "req-1", result: "" })).toBe(false);
  // 中断 → 不再待确认（applyToolLifecycle 标记或 cancelControlRequest 路径）
  expect(isUnresolvedControlRequest({ controlRequestId: "req-1", isInterrupted: true })).toBe(
    false,
  );
  // 未注入（含空串注入，三处原散写都是 truthy 检查）→ 非 pending
  expect(isUnresolvedControlRequest({ controlRequestId: "" })).toBe(false);
  expect(isUnresolvedControlRequest({})).toBe(false);
  // isInterrupted 显式 false 不影响判定
  expect(isUnresolvedControlRequest({ controlRequestId: "req-1", isInterrupted: false })).toBe(
    true,
  );
});

// ── provider 能力声明表（2026-11-13 T3 学习点①）────────────────────────
const claudeCaps: AgentProviderCapabilities = {
  ...WEAKEST_AGENT_CAPABILITIES,
  modes: { dualMode: "native", terminalResumeId: "claudeSessionId" },
  autoRetry: "native",
};
const codexCaps: AgentProviderCapabilities = {
  ...WEAKEST_AGENT_CAPABILITIES,
  modes: { dualMode: "native", terminalResumeId: "codexThreadId" },
  autoRetry: "native",
};

test("WEAKEST_AGENT_CAPABILITIES 是最弱基线（新 provider 不假装有能力）", () => {
  expect(WEAKEST_AGENT_CAPABILITIES).toEqual({
    history: "unsupported",
    mcpInject: "unsupported",
    modes: { dualMode: "unsupported" },
    approvals: { center: "unsupported", oneClick: "partial" },
    autoRetry: "unsupported",
    configSwitch: "advertised",
  });
});

test("resolveModeSwitch: 能力 × 会话前置条件矩阵", () => {
  // 能力缺省 / provider 无双模式 → 不渲染（UI 隐藏菜单项 / 路由 404）
  expect(resolveModeSwitch(undefined, {})).toEqual({ supported: false });
  expect(resolveModeSwitch(WEAKEST_AGENT_CAPABILITIES, { claudeSessionId: "s" })).toEqual({
    supported: false,
  });
  // claude：有 resume id + idle → 可切
  expect(resolveModeSwitch(claudeCaps, { claudeSessionId: "s", status: "idle" })).toEqual({
    supported: true,
  });
  // 缺 resume id（存量会话）→ 禁用 + 原因（resumeId 随 verdict 下发，供路由人话文案）
  expect(resolveModeSwitch(claudeCaps, { status: "idle" })).toEqual({
    supported: true,
    blockedReason: "missingResumeId",
    resumeId: "claudeSessionId",
  });
  // turn 进行中 → busy
  expect(resolveModeSwitch(claudeCaps, { claudeSessionId: "s", status: "working" })).toEqual({
    supported: true,
    blockedReason: "busy",
  });
  expect(resolveModeSwitch(claudeCaps, { claudeSessionId: "s", status: "blocked" })).toEqual({
    supported: true,
    blockedReason: "busy",
  });
  // 缺 id 优先于 busy（与原实现判定顺序一致）
  expect(resolveModeSwitch(claudeCaps, { status: "working" })).toEqual({
    supported: true,
    blockedReason: "missingResumeId",
    resumeId: "claudeSessionId",
  });
  // codex 的前置 id 是 codexThreadId——claudeSessionId 不满足它
  expect(resolveModeSwitch(codexCaps, { claudeSessionId: "claude-side" })).toEqual({
    supported: true,
    blockedReason: "missingResumeId",
    resumeId: "codexThreadId",
  });
  expect(resolveModeSwitch(codexCaps, { codexThreadId: "t", status: "done" })).toEqual({
    supported: true,
  });
});

test("resolveAutoRetryCapability: 能力 && 非 terminal 形态", () => {
  expect(resolveAutoRetryCapability(undefined, {})).toEqual({ supported: false });
  expect(resolveAutoRetryCapability(WEAKEST_AGENT_CAPABILITIES, { mode: "chat" })).toEqual({
    supported: false,
  });
  expect(resolveAutoRetryCapability(claudeCaps, { mode: "chat" })).toEqual({ supported: true });
  expect(resolveAutoRetryCapability(claudeCaps, { mode: undefined })).toEqual({ supported: true });
  // terminal 形态无 headless stdin 控制通道
  expect(resolveAutoRetryCapability(claudeCaps, { mode: "terminal" })).toEqual({
    supported: false,
  });
});
