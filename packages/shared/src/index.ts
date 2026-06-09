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

export type AgentProvider = "claude" | "codex" | "claude2";

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
  claudeSessionId?: string;
  lastAssistantMessage?: string;
};

export type TerminalSession = {
  id: string;
  projectName: string;
  displayName: string;
  status: TerminalSessionStatus;
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
  };
  session_id: string;
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

export type Claude2UserMessage = {
  type: "user";
  message: {
    role: "user";
    content: Array<
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
};

export type Claude2TaskStarted = {
  type: "system";
  subtype: "task_started";
  task_id: string;
  agentType?: string;
  workflowName?: string;
  prompt?: string;
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
  outputFile?: string;
  skipTranscript?: boolean;
  session_id?: string;
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
};

// Claude CLI --permission-prompt-tool stdio routes permission prompts
// (Bash, Write, AskUserQuestion, etc.) as control_request on stdout.
// The tool_name and input are nested under "request", not at top level.
//
// Actual format from Claude CLI v2.1.160+:
//   {"type":"control_request","request_id":"uuid",
//    "request":{"subtype":"can_use_tool","tool_name":"AskUserQuestion",
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

export type Claude2StreamClientMessage =
  | {
      type: "user";
      message: {
        role: "user";
        content: Array<{ type: "text"; text: string }>;
      };
    }
  | Claude2ControlResponse
  | {
      type: "switch_model";
      model: string;
    }
  | {
      type: "permission_mode";
      mode: Claude2PermissionMode;
    }
  | {
      type: "control_request";
      request_id: string;
      request: {
        subtype: "interrupt";
      };
    };

export type SessionStreamServerMessage =
  | {
      type: "connected";
      sessionId: string;
      sessionType: SessionType;
      status: AgentSessionStatus | TerminalSessionStatus;
    }
  | {
      type: "snapshot";
      data: string;
    }
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
  | Claude2CompactBoundary
  | Claude2StatusMessage
  | Claude2ApiRetry
  | Claude2ThinkingTokens
  | Claude2AssistantMessage
  | Claude2UserMessage
  | Claude2TaskStarted
  | Claude2TaskUpdated
  | Claude2TaskNotification
  | Claude2Result
  | Claude2ControlRequest
  | {
      type: "switch_model_result";
      model: string;
      success: boolean;
      error?: string;
    }
  | {
      type: "replay_start";
    }
  | {
      type: "replay_end";
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
  | "SESSION_STREAM_MISMATCH";

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
