export type Project = {
  name: string;
  path: string;
  agentSessionCount: number;
  terminalSessionCount: number;
  gitBranch?: string;
};

export type ProjectFileEntryType = "directory" | "file";

export type ProjectFileEntry = {
  name: string;
  path: string;
  type: ProjectFileEntryType;
  hidden: boolean;
  size: number | null;
};

export type ProjectFileListResponse = {
  projectName: string;
  path: string;
  parentPath: string | null;
  entries: ProjectFileEntry[];
};

export type ProjectFilePreviewMediaType =
  | "image/png"
  | "image/jpeg"
  | "image/gif"
  | "image/webp"
  | "image/svg+xml";

export type ProjectUnsupportedFilePreviewReason = "unsupported_type" | "binary_text";

export type ProjectTextFilePreview = {
  type: "text";
  projectName: string;
  path: string;
  name: string;
  size: number;
  content: string;
};

export type ProjectImageFilePreview = {
  type: "image";
  projectName: string;
  path: string;
  name: string;
  size: number;
  mediaType: ProjectFilePreviewMediaType;
  dataUrl: string;
};

export type ProjectUnsupportedFilePreview = {
  type: "unsupported";
  projectName: string;
  path: string;
  name: string;
  size: number;
  reason: ProjectUnsupportedFilePreviewReason;
};

export type ProjectTooLargeFilePreview = {
  type: "too_large";
  projectName: string;
  path: string;
  name: string;
  size: number;
  limitBytes: number;
};

export type ProjectFilePreviewResponse =
  | ProjectTextFilePreview
  | ProjectImageFilePreview
  | ProjectUnsupportedFilePreview
  | ProjectTooLargeFilePreview;

export type GitDiffScope = "worktree" | "staged";

export type GitDiffFileStatus = "modified" | "added" | "deleted" | "renamed";

export type GitDiffFileSummary = {
  path: string;
  previousPath?: string;
  status: GitDiffFileStatus;
  scope: GitDiffScope;
};

export type GitDiffListResponse =
  | {
      repository: true;
      projectName: string;
      files: GitDiffFileSummary[];
    }
  | {
      repository: false;
      projectName: string;
      reason: "not_git_repository";
    };

export type GitFileDiffResponse = {
  repository: true;
  projectName: string;
  path: string;
  previousPath?: string;
  scope: GitDiffScope;
  status: GitDiffFileStatus;
  diff: string;
};

export type ProjectListResponse = {
  projects: Project[];
};

export type CreateProjectRequest = {
  path?: string;
};

export type CreateProjectResponse = {
  project: Project;
};

export type ProjectDetailResponse = {
  project: Project;
};

export type DeleteProjectResponse = {
  deleted: true;
  projectName: string;
};

export type UploadFileResponse = {
  entry: ProjectFileEntry;
};

export type CreateFolderRequest = {
  name: string;
};

export type CreateFolderResponse = {
  entry: ProjectFileEntry;
};

export type RenameFileRequest = {
  path: string;
  name: string;
};

export type RenameFileResponse = {
  entry: ProjectFileEntry;
};

export type DeleteFileRequest = {
  path: string;
};

export type DeleteFileResponse = {
  deleted: true;
  projectName: string;
  path: string;
};

export type SaveFileRequest = {
  path: string;
  content: string;
};

export type SaveFileResponse = {
  entry: ProjectFileEntry;
};

export type AgentProvider = "claude" | "codex" | "claude2";

// ── Settings: provider credentials + claude runtime defaults ──────────
//
// Provider = 一套 API 凭证（apiKey + baseUrl）；claude runtime 选其中一个。
// modelMapping = tier → 具体 model ID（spawn 时传给 CLI 的 --model 值）。
// ClaudeRuntimeConfig = providerId + modelMapping + enable1mContext + effort，
// 是所有新 claude2 session spawn 的全局默认初始值。

export type EffortLevel = "low" | "medium" | "high" | "xhigh" | "max";
export const EFFORT_LEVELS: readonly EffortLevel[] = ["low", "medium", "high", "xhigh", "max"];

export type ClaudeModelTier = "default" | "opus" | "sonnet" | "haiku";
export const CLAUDE_MODEL_TIERS: readonly ClaudeModelTier[] = [
  "default",
  "opus",
  "sonnet",
  "haiku",
];

// Provider 协议：决定「发现模型」(/v1/models) 的请求构造（端点 + header）。
// anthropic → x-api-key + anthropic-version；openai-compatible → Authorization: Bearer。
// 不影响 spawn（CLI 只认 ANTHROPIC_* env）。全程可选，normalizeProvider 兜底 "anthropic"。
export type ProviderProtocol = "anthropic" | "openai-compatible";
export const PROVIDER_PROTOCOLS: readonly ProviderProtocol[] = ["anthropic", "openai-compatible"];

export type ClaudeModelMapping = {
  default: string;
  opus: string;
  sonnet: string;
  haiku: string;
};

export type ProviderConfig = {
  id: string;
  label: string;
  apiKey: string;
  baseUrl?: string;
  protocol?: ProviderProtocol;
};

export type ProviderConfigMasked = Omit<ProviderConfig, "apiKey"> & {
  apiKeyMasked: string;
  hasApiKey: boolean;
};

export type ClaudeRuntimeConfig = {
  providerId: string;
  modelMapping: ClaudeModelMapping;
  enable1mContext: boolean;
  effort: EffortLevel;
};

export type SettingsState = {
  providers: ProviderConfig[];
  runtimes: {
    claude: ClaudeRuntimeConfig;
  };
};

export type GetSettingsResponse = {
  settings: {
    providers: ProviderConfigMasked[];
    runtimes: {
      claude: ClaudeRuntimeConfig;
    };
  };
};

export type CreateProviderRequest = {
  label: string;
  apiKey: string;
  baseUrl?: string;
  protocol?: ProviderProtocol;
};

export type UpdateProviderRequest = {
  label?: string;
  apiKey?: string;
  baseUrl?: string;
  protocol?: ProviderProtocol;
};

export type ProviderResponse = {
  provider: ProviderConfigMasked;
};

export type DeleteProviderResponse = {
  deleted: true;
  id: string;
};

export type UpdateClaudeRuntimeRequest = {
  providerId?: string;
  modelMapping?: Partial<ClaudeModelMapping>;
  enable1mContext?: boolean;
  effort?: EffortLevel;
};

export type UpdateClaudeRuntimeResponse = {
  runtime: ClaudeRuntimeConfig;
};

// POST /api/settings/providers/:id/models 响应：用 provider 凭证请求 /v1/models。
// ok=false 时 models 为空、error 给可读原因（凭证无效/端点不存在/网络错误）。
// 上游失败不映射成 API 错误码——这是「业务成功调用发现接口，上游凭证有问题」，
// 前端展示测试结果而非报错 toast。仅 provider 不存在走 PROVIDER_NOT_FOUND 404。
// POST /api/settings/providers/test-models 复用此响应（见 TestProviderRequest）。
export type ListProviderModelsResponse = {
  ok: boolean;
  models: string[];
  error?: string;
};

// POST /api/settings/providers/test-models 请求：用表单内联凭证测试连接（不落盘）。
// 用于 ProviderDialog 新建态（无 id）+ 编辑态（有 id，apiKey 留空回退已保存原 key）。
// 后端解析：apiKey / baseUrl / protocol 取内联值，缺失则回退 id 命中的已保存 provider
// 对应字段（原 apiKey 永不出 api 进程，前端只持 masked → 编辑态留空 = "不改"语义）。
// 复用 ListProviderModelsResponse 响应（与 :id/models 同一套发现模型结果）。
export type TestProviderRequest = {
  /** 编辑态传已保存 provider id，用于回退内联缺失字段（apiKey/baseUrl/protocol）。新建态省略。 */
  id?: string;
  /** 仅展示用，测试连接不依赖。 */
  label?: string;
  /** 内联 apiKey；留空且 id 命中已保存 provider 时回退其原 key。两者皆空 → 后端返回 ok:false。 */
  apiKey?: string;
  baseUrl?: string;
  protocol?: ProviderProtocol;
};

export type AgentSessionStatus = "running" | "idle" | "closed" | "error";

export type TerminalSessionStatus = "running" | "closed" | "error";

export type SessionType = "agent" | "terminal";

export type TransportStatus = "connected" | "disconnected" | "ended" | "error";

export type AgentSession = {
  id: string;
  projectName: string;
  provider: AgentProvider;
  displayName: string;
  status: AgentSessionStatus;
  createdAt: string;
  model?: string;
  permissionMode?: string;
  effort?: EffortLevel;
  claudeSessionId?: string;
  lastAssistantMessage?: string;
  updatedAt?: string;
};

export type TerminalSession = {
  id: string;
  projectName: string;
  displayName: string;
  status: TerminalSessionStatus;
  updatedAt?: string;
  /** 最近 pane 活动行（tmux capture 最后一行非空，含 prompt+命令，忠实显示，不去 ANSI 后的纯文本）。 */
  lastCommand?: string;
};

export type ListAgentSessionsResponse = {
  sessions: AgentSession[];
};

export type CreateAgentSessionRequest = {
  provider?: AgentProvider;
  displayName?: string;
  model?: string;
  permissionMode?: string;
  /** Resume an existing Claude CLI session */
  claudeSessionId?: string;
};

export type CreateAgentSessionResponse = {
  session: AgentSession;
};

export type AgentSessionDetailResponse = {
  session: AgentSession;
  availableModels?: string[];
  availablePermissionModes?: string[];
};

export type CloseAgentSessionResponse = {
  session: AgentSession;
};

export type AgentSessionMessagesResponse = {
  sessionId: string;
  messages: SessionStreamServerMessage[];
  pagination: {
    hasOlder: boolean;
    nextCursor: string | null;
  };
};

// -- Agent History --

export type AgentHistoryEntry = {
  /** Claude CLI session UUID (JSONL filename without extension) */
  claudeSessionId: string;
  /** AI-generated title (last ai-title entry), or null */
  title: string | null;
  /** First user message text, truncated */
  firstMessage: string | null;
  /** ISO timestamp of the first user message */
  startedAt: string | null;
  /** ISO timestamp from file mtime */
  lastActivityAt: string | null;
  /** Approximate number of user turns */
  messageCount: number;
  /** JSONL session file size in bytes */
  fileSize: number;
  /** Whether an active agent instance is linked to this Claude session */
  hasActiveSession: boolean;
  /** Agent session ID when hasActiveSession is true */
  activeSessionId?: string;
};

export type ListAgentHistoryResponse = {
  entries: AgentHistoryEntry[];
};

export type ListTerminalSessionsResponse = {
  sessions: TerminalSession[];
};

export type CreateTerminalSessionRequest = {
  displayName?: string;
};

export type CreateTerminalSessionResponse = {
  session: TerminalSession;
};

export type TerminalSessionDetailResponse = {
  session: TerminalSession;
};

export type CloseTerminalSessionResponse = {
  session: TerminalSession;
};

// -- Session Rename (agent + terminal 共用请求体；displayName 持久化到 SessionMetadata) --

export type RenameSessionRequest = {
  displayName: string;
};

export type RenameAgentSessionResponse = {
  session: AgentSession;
};

export type RenameTerminalSessionResponse = {
  session: TerminalSession;
};

// -- Claude2 Stream Messages (Claude CLI --output-format stream-json protocol) --

export type Claude2SystemInit = {
  type: "system";
  subtype: "init";
  session_id: string;
  model: string;
  permissionMode: string;
  cwd: string;
  tools: string[];
  slash_commands: string[];
  mcp_servers?: Record<string, unknown>[];
  agents?: string[];
  skills?: string[];
  plugins?: string[];
  apiKeySource?: string;
  claude_code_version?: string;
  output_style?: string;
};

// Scalar seed init — server-synthesized on replay so the client's scalar fold has
// model/permissionMode even though real system.init is stdout-only (absent from
// JSONL/tail). Distinct subtype "seed_init" (not "init") so server-side init capture
// and client render both treat it as a non-init system message: it folds scalars via
// a dedicated seed_init branch and is never rendered (model / permissionMode surface
// in the session header).
export type Claude2SeedInit = {
  type: "system";
  subtype: "seed_init";
  model?: string;
  permissionMode?: string;
};

// Server-synthesized notification that the skill/slash catalog changed (e.g. after
// /reload-skills succeeded). Broadcast-only — never buffered into liveLines/history
// (reconnects re-fetch via REST), so it reaches only currently-connected clients.
// No payload by design: the client invalidates its REST catalog query on receipt
// rather than trusting an embedded snapshot. See docs/design/message-replay.md
// 「命令后置处理框架」.
export type Claude2SkillCatalogChanged = {
  type: "system";
  subtype: "skill_catalog_changed";
};

export type SlashCommandInfo = {
  name: string;
  description: string;
  kind: "command" | "skill";
};

export type SlashCommandDescriptionsResponse = {
  commands: SlashCommandInfo[];
};

export type Claude2CompactBoundary = {
  type: "system";
  subtype: "compact_boundary" | "microcompact_boundary";
  compactMetadata?: {
    trigger?: string;
    preTokens?: number;
  };
  microcompactMetadata?: {
    trigger?: string;
    preTokens?: number;
    tokensSaved?: number;
  };
};

// Compact-boundary subtypes — the single source of truth for "a compact starts a
// new block". Server (relay buffer trim, history tail-scan) and client (render
// windowing) both consume this so the two sides never disagree on what counts as
// a boundary.
export const COMPACT_BOUNDARY_SUBTYPES = ["compact_boundary", "microcompact_boundary"] as const;

export function isCompactBoundarySubtype(
  subtype: string | undefined | null,
): subtype is (typeof COMPACT_BOUNDARY_SUBTYPES)[number] {
  return subtype === "compact_boundary" || subtype === "microcompact_boundary";
}

export type Claude2StatusMessage = {
  type: "system";
  subtype: "status";
  status?: string | null;
  compact_result?: string;
  session_id: string;
  uuid: string;
};

export type Claude2ThinkingTokens = {
  type: "system";
  subtype: "thinking_tokens";
  estimated_tokens: number;
  estimated_tokens_delta: number;
  session_id: string;
  uuid: string;
};

export type Claude2AssistantContent =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "thinking"; thinking: string; signature: string };

export type Claude2AssistantMessage = {
  type: "assistant";
  message: {
    id: string;
    role: "assistant";
    content: Claude2AssistantContent[];
    model?: string;
    usage?: { input_tokens: number; output_tokens: number };
  };
  session_id: string;
  // JSONL envelope fields (optional — may be absent from stdout stream)
  uuid?: string;
  parentUuid?: string;
  logicalParentUuid?: string;
  userType?: string;
  isApiErrorMessage?: boolean;
  isSidechain?: boolean;
  error?: string;
  timestamp?: string;
  sessionId?: string;
};

export type Claude2ApiRetry = {
  type: "system";
  subtype: "api_retry";
  attempt: number;
  max_retries: number;
  retry_delay_ms: number;
  error_status?: number;
  error?: string;
  session_id: string;
};

export type Claude2Mode = {
  type: "mode";
  mode: string;
  session_id?: string;
};

// attachment 外层信封（所有子类型共享）
export type Claude2AttachmentEnvelope = {
  type: "attachment";
  uuid: string;
  parentUuid: string | null;
  isSidechain: boolean;
  timestamp: string;
  sessionId: string;
  userType?: string;
  entrypoint?: string;
  cwd?: string;
  version?: string;
  gitBranch?: string;
  slug?: string;
};

// attachment 子类型（23 种，按 domain 分组）

export type AttachmentMcpInstructionsDelta = {
  attachment: {
    type: "mcp_instructions_delta";
    addedNames: string[];
    addedBlocks: string[];
  };
};

export type AttachmentSkillListing = {
  attachment: {
    type: "skill_listing";
    content: string;
  };
};

export type AttachmentCommandPermissions = {
  attachment: {
    type: "command_permissions";
    allowedTools: string[];
  };
};

export type AttachmentInvokedSkills = {
  attachment: {
    type: "invoked_skills";
    skills: Array<{ name: string; path: string; content: string }>;
  };
};

export type AttachmentAutoMode = {
  attachment: {
    type: "auto_mode";
    reminderType?: "full";
  };
};

export type AttachmentAutoModeExit = {
  attachment: {
    type: "auto_mode_exit";
  };
};

export type AttachmentPlanMode = {
  attachment: {
    type: "plan_mode";
    reminderType?: "full";
    isSubAgent: boolean;
    planFilePath: string;
    planExists: boolean;
  };
};

export type AttachmentPlanModeExit = {
  attachment: {
    type: "plan_mode_exit";
    planFilePath: string;
    planExists: boolean;
  };
};

export type AttachmentPlanModeReentry = {
  attachment: {
    type: "plan_mode_reentry";
    planFilePath: string;
  };
};

export type AttachmentTaskReminder = {
  attachment: {
    type: "task_reminder";
    content: Array<{
      id?: string;
      subject?: string;
      status?: string;
      [key: string]: unknown;
    }>;
    itemCount: number;
  };
};

export type AttachmentTaskStatus = {
  attachment: {
    type: "task_status";
    taskId: string;
    taskType: string;
    description: string;
    status: string;
    deltaSummary: string | null;
    outputFilePath: string;
  };
};

export type AttachmentQueuedCommand = {
  attachment: {
    type: "queued_command";
    prompt: string;
    commandMode: string;
  };
};

export type AttachmentFile = {
  attachment: {
    type: "file";
    filename: string;
    displayPath: string;
    content: {
      type: "text";
      file: {
        filePath: string;
        content: string;
        numLines: number;
        startLine: number;
        totalLines: number;
      };
    };
  };
};

export type AttachmentEditedTextFile = {
  attachment: {
    type: "edited_text_file";
    filename: string;
    snippet: string;
  };
};

export type AttachmentCompactFileReference = {
  attachment: {
    type: "compact_file_reference";
    filename: string;
    displayPath: string;
  };
};

export type AttachmentPlanFileReference = {
  attachment: {
    type: "plan_file_reference";
    planFilePath: string;
    planContent: string;
  };
};

export type AttachmentHookSuccess = {
  attachment: {
    type: "hook_success";
    hookName: string;
    hookEvent: string;
    toolUseID: string;
    command: string;
    stdout: string;
    stderr: string;
    exitCode: number;
    durationMs: number;
    content?: string;
  };
};

export type AttachmentHookNonBlockingError = {
  attachment: {
    type: "hook_non_blocking_error";
    hookName: string;
    hookEvent: string;
    toolUseID: string;
    command: string;
    stdout: string;
    stderr: string;
    exitCode: number;
    durationMs: number;
  };
};

export type AttachmentHookAdditionalContext = {
  attachment: {
    type: "hook_additional_context";
    content: string[];
    hookName: string;
    hookEvent: string;
    toolUseID: string;
  };
};

export type AttachmentDateChange = {
  attachment: {
    type: "date_change";
    newDate: string;
  };
};

export type AttachmentOpenedFileInIde = {
  attachment: {
    type: "opened_file_in_ide";
    filename: string;
  };
};

export type AttachmentSelectedLinesInIde = {
  attachment: {
    type: "selected_lines_in_ide";
    ideName: string;
    filename: string;
    displayPath: string;
    lineStart: number;
    lineEnd: number;
    content: string;
  };
};

export type AttachmentDiagnostics = {
  attachment: {
    type: "diagnostics";
    files: Array<{
      uri: string;
      diagnostics: Array<{
        message: string;
        severity: string;
        range: {
          start: { line: number; character: number };
          end: { line: number; character: number };
        };
        source: string;
        code: string;
      }>;
    }>;
    isNew: boolean;
  };
};

export type AttachmentGoalStatus = {
  attachment: {
    type: "goal_status";
    met: boolean;
    sentinel: boolean;
    condition: string;
  };
};

export type AttachmentContent =
  | AttachmentMcpInstructionsDelta["attachment"]
  | AttachmentSkillListing["attachment"]
  | AttachmentCommandPermissions["attachment"]
  | AttachmentInvokedSkills["attachment"]
  | AttachmentAutoMode["attachment"]
  | AttachmentAutoModeExit["attachment"]
  | AttachmentPlanMode["attachment"]
  | AttachmentPlanModeExit["attachment"]
  | AttachmentPlanModeReentry["attachment"]
  | AttachmentTaskReminder["attachment"]
  | AttachmentTaskStatus["attachment"]
  | AttachmentQueuedCommand["attachment"]
  | AttachmentFile["attachment"]
  | AttachmentEditedTextFile["attachment"]
  | AttachmentCompactFileReference["attachment"]
  | AttachmentPlanFileReference["attachment"]
  | AttachmentHookSuccess["attachment"]
  | AttachmentHookNonBlockingError["attachment"]
  | AttachmentHookAdditionalContext["attachment"]
  | AttachmentDateChange["attachment"]
  | AttachmentOpenedFileInIde["attachment"]
  | AttachmentSelectedLinesInIde["attachment"]
  | AttachmentDiagnostics["attachment"]
  | AttachmentGoalStatus["attachment"];

// 完整 attachment 消息（信封 + 子类型）
export type Claude2Attachment = Claude2AttachmentEnvelope & {
  attachment: AttachmentContent;
};

export type Claude2LastPromptEntry = {
  type: "last-prompt";
  lastPrompt: string;
  leafUuid?: string;
  sessionId?: string;
};

export type Claude2PermissionModeEntry = {
  type: "permission-mode";
  permissionMode: Claude2PermissionMode;
  session_id?: string;
};

export type Claude2TrackedFileBackup = {
  backupFileName?: string;
  version?: number;
  backupTime?: string;
};

export type Claude2FileHistorySnapshot = {
  type: "file-history-snapshot";
  messageId?: string;
  isSnapshotUpdate?: boolean;
  snapshot?: {
    messageId?: string;
    timestamp?: string;
    trackedFileBackups?: Record<string, Claude2TrackedFileBackup>;
  };
};

export type Claude2AiTitle = {
  type: "ai-title";
  aiTitle: string;
  sessionId?: string;
};

export type Claude2AgentName = {
  type: "agent-name";
  agentName: string;
  sessionId?: string;
};

export type Claude2QueueOperation = {
  type: "queue-operation";
  operation: "enqueue" | "dequeue" | "remove" | "popAll";
  timestamp?: string;
  sessionId?: string;
  content?: string;
};

export type Claude2UserMessage = {
  type: "user";
  message: {
    role: "user";
    content:
      | string
      | Array<
          | { type: "text"; text: string }
          | {
              type: "tool_result";
              tool_use_id: string;
              content: string | Array<{ type: "text"; text: string }>;
              is_error?: boolean;
            }
        >;
  };
  tool_use_result?: unknown;
  toolUseResult?: unknown;
  parent_tool_use_id?: string;
  isMeta?: boolean;
  sourceToolUseID?: string;
  isSynthetic?: boolean;
  // Set by our api service when it injects the client's user-message echo into
  // the live stream (the CLI never echoes user input on stdout). Marks "this is
  // a real user submission" so the client can open running on it without matching
  // CLI-internal user messages (isMeta/isSynthetic skill bodies, compact summaries).
  isUserInput?: boolean;
  // JSONL envelope fields (optional — may be absent from stdout stream)
  uuid?: string;
  parentUuid?: string;
  logicalParentUuid?: string;
  userType?: string;
  isApiErrorMessage?: boolean;
  isSidechain?: boolean;
  error?: string;
  timestamp?: string;
  sessionId?: string;
};

export type Claude2TaskStarted = {
  type: "system";
  subtype: "task_started";
  task_id: string;
  agentType?: string;
  workflowName?: string;
  prompt?: string;
  subject?: string;
  session_id?: string;
};

export type Claude2TaskUpdated = {
  type: "system";
  subtype: "task_updated";
  task_id: string;
  isBackgrounded?: boolean;
  error?: string;
  end_time?: number;
  total_paused_ms?: number;
  session_id?: string;
};

export type Claude2TaskNotification = {
  type: "system";
  subtype: "task_notification";
  task_id: string;
  text?: string;
  summary?: string;
  outputFile?: string;
  skipTranscript?: boolean;
  session_id?: string;
};

export type Claude2TaskProgress = {
  type: "system";
  subtype: "task_progress";
  task_id: string;
  tool_use_id?: string;
  description: string;
  subagent_type?: string;
  usage: {
    total_tokens: number;
    tool_uses: number;
    duration_ms: number;
  };
  last_tool_name?: string;
  summary?: string;
  uuid: string;
  session_id: string;
  workflow_progress?: Array<Record<string, unknown>>;
};

// Auto-mode classifier or permission system rejected a tool call. Realtime-only
// signal (NOT written to JSONL history). Mounted onto the matching tool-call
// part as permissionDenied { reasonType, reason } and rendered as a violet banner.
export type Claude2PermissionDenied = {
  type: "system";
  subtype: "permission_denied";
  tool_name?: string;
  tool_use_id?: string;
  decision_reason_type?: string;
  decision_reason?: string;
};

export type Claude2Result = {
  type: "result";
  subtype: "success" | "error_max_turns" | "error" | "interrupted";
  session_id: string;
  num_turns: number;
  total_cost_usd?: number;
  duration_ms?: number;
  result?: string;
  is_error?: boolean;
  api_error_status?: number;
  // Authoritative "why the query loop terminated" (CLI v2.1.160 enum):
  // completed | aborted_streaming | aborted_tools | max_turns | model_error |
  // image_error | prompt_too_long | blocking_limit | rapid_refill_breaker |
  // stop_hook_prevented | hook_stopped | tool_deferred. Unset when the loop
  // was bypassed (local slash command) or interrupted externally.
  terminal_reason?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
};

// Claude CLI --permission-prompt-tool stdio routes permission prompts
// (Bash, Write, AskUserQuestion, etc.) as control_request on stdout.
// The tool_name and input are nested under "request", not at top level.
//
// Actual format from Claude CLI v2.1.160+:
//   {"type":"control_request","request_id":"uuid",
//    "request":{"subtype":"can_use_tool","tool_name":"AskUserQuestion",
//               "tool_use_id":"toolu_XXXX",
//               "display_name":"AskUserQuestion","input":{"questions":[...]}}}
//
// Answer with control_response on stdin:
//   {"type":"control_response","request_id":"uuid"}
//   {"type":"control_response","request_id":"uuid","answers":{"q":"a"}}
export type Claude2ControlRequest = {
  type: "control_request";
  request_id: string;
  request: {
    subtype: string;
    tool_name: string;
    tool_use_id: string;
    display_name: string;
    input: Record<string, unknown>;
  };
};

// The control_response format matches Claude SDK's CanUseToolControlResponse:
//
//   {"type":"control_response","response":{"subtype":"success","request_id":"uuid",
//     "response":{"behavior":"allow","updatedInput":{"answers":{...}}}}}
//
// Clang requires the nested "response" wrapper — the request_id is NOT at
// top level. See cli/src/claude/sdk/query.ts handleControlRequest() in hapi
// for the canonical implementation.
export type Claude2ControlResponse = {
  type: "control_response";
  response: {
    subtype: "success" | "error";
    request_id: string;
    response?: SDKPermissionResult;
    error?: string;
  };
};

export type SDKPermissionResult =
  | {
      behavior: "allow";
      updatedInput: Record<string, unknown>;
    }
  | {
      behavior: "deny";
      message: string;
    };

export type SessionStreamClientMessage =
  | {
      type: "input";
      data: string;
    }
  | {
      type: "resize";
      cols: number;
      rows: number;
    }
  | {
      type: "ping";
    }
  | Claude2StreamClientMessage;

export type Claude2PermissionMode =
  | "default"
  | "acceptEdits"
  | "bypassPermissions"
  | "plan"
  | "auto"
  | "dontAsk";

// Client → server control actions (model switch, permission mode switch, interrupt).
// These become stdin control_request messages to the CLI; the CLI replies with
// control_response on stdout. request_id is used to match response to request.
export type Claude2StreamControlRequest = {
  type: "control_request";
  request_id: string;
  request:
    | {
        subtype: "set_model";
        model: string;
      }
    | {
        subtype: "set_permission_mode";
        mode: Claude2PermissionMode;
      }
    | {
        subtype: "interrupt";
      };
};

export type Claude2StreamClientMessage =
  | {
      type: "user";
      message: {
        role: "user";
        content: Array<{ type: "text"; text: string }>;
      };
    }
  | Claude2ControlResponse
  | Claude2StreamControlRequest
  | {
      // Per-session runtime effort switch. Unlike set_model/set_permission_mode
      // (in-process control_request), effort has no CLI runtime switch on a
      // direct-pull host — the server persists it (setEffort), relaunches the
      // CLI with --resume + new CLAUDE_CODE_EFFORT_LEVEL, and closes the WS so
      // the client reconnects into the respawned stream. See
      // docs/research/claude-cli-runtime-config.md (effort Q3).
      type: "set_runtime_effort";
      effort: EffortLevel;
    };

export type SessionStreamServerMessage =
  | {
      type: "output";
      data: string;
    }
  | {
      type: "status";
      status: AgentSessionStatus | TerminalSessionStatus | TransportStatus;
    }
  | {
      type: "ended";
    }
  | {
      type: "error";
      code: ApiErrorCode;
      message: string;
    }
  | Claude2SystemInit
  | Claude2SeedInit
  | Claude2SkillCatalogChanged
  | Claude2CompactBoundary
  | Claude2StatusMessage
  | Claude2ApiRetry
  | Claude2Mode
  | Claude2Attachment
  | Claude2LastPromptEntry
  | Claude2PermissionModeEntry
  | Claude2FileHistorySnapshot
  | Claude2AiTitle
  | Claude2AgentName
  | Claude2QueueOperation
  | Claude2ThinkingTokens
  | Claude2AssistantMessage
  | Claude2UserMessage
  | Claude2TaskStarted
  | Claude2TaskUpdated
  | Claude2TaskNotification
  | Claude2TaskProgress
  | Claude2PermissionDenied
  | Claude2Result
  | Claude2ControlRequest
  | Claude2ControlResponse
  | {
      type: "history_start";
      count: number;
    }
  | {
      type: "session_init";
      resume: boolean;
    }
  | {
      type: "history_end";
    }
  | {
      type: "live_start";
      count: number;
    }
  | {
      type: "live_end";
    };

export type HealthResponse = {
  ok: true;
  service: "api";
};

export type ApiErrorCode =
  | "INVALID_PASSWORD"
  | "UNAUTHENTICATED"
  | "CONFIG_REQUIRED"
  | "CONFIG_INVALID"
  | "RUNTIME_DIR_UNAVAILABLE"
  | "PROJECT_NAME_INVALID"
  | "PROJECT_NOT_FOUND"
  | "PROJECT_TARGET_INVALID"
  | "PROJECT_PATH_OUTSIDE_ROOT"
  | "PROJECT_CONFLICT"
  | "PROJECT_FILE_NOT_FOUND"
  | "PROJECT_FILE_NOT_DIRECTORY"
  | "PROJECT_FILE_NOT_FILE"
  | "PROJECT_FILE_TARGET_EXISTS"
  | "PROJECT_FILE_UPLOAD_FAILED"
  | "PROJECT_FILE_UPLOAD_TOO_LARGE"
  | "PROJECT_FILE_RENAME_FAILED"
  | "PROJECT_FILE_DELETE_FAILED"
  | "PROJECT_FILE_SAVE_FAILED"
  | "PROJECT_GIT_NOT_REPOSITORY"
  | "PROJECT_GIT_SCOPE_INVALID"
  | "PROJECT_GIT_FILE_NOT_CHANGED"
  | "PROJECT_GIT_UNAVAILABLE"
  | "PROJECT_FS_ERROR"
  | "PROJECT_DELETE_FAILED"
  | "SESSION_NOT_FOUND"
  | "SESSION_RUNTIME_MISSING"
  | "SESSION_RUNTIME_ERROR"
  | "SESSION_PROVIDER_UNAVAILABLE"
  | "SESSION_TYPE_INVALID"
  | "SESSION_STATE_CONFLICT"
  | "SESSION_METADATA_ERROR"
  | "SESSION_STREAM_MISMATCH"
  | "SETTINGS_INVALID"
  | "PROVIDER_NOT_FOUND"
  | "PROVIDER_LABEL_CONFLICT";

export type ApiErrorResponse = {
  error: {
    code: ApiErrorCode;
    message: string;
  };
};

export type LoginRequest = {
  password?: string;
};

export type LoginResponse = {
  ok: true;
  token: string;
  expiresAt: string;
};

export type AuthMeResponse = {
  authenticated: true;
};
