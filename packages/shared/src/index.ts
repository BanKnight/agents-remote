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
};

export type CreateAgentSessionResponse = {
  session: AgentSession;
};

export type AgentSessionDetailResponse = {
  session: AgentSession;
};

export type CloseAgentSessionResponse = {
  session: AgentSession;
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
  cwd: string;
  tools: string[];
  slash_commands: string[];
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

export type Claude2UserMessage = {
  type: "user";
  message: {
    role: "user";
    content: Array<
      | { type: "text"; text: string }
      | { type: "tool_result"; tool_use_id: string; content: Array<{ type: "text"; text: string }> }
    >;
  };
};

export type Claude2Result = {
  type: "result";
  subtype: "success" | "error_max_turns" | "error" | "interrupted";
  session_id: string;
  num_turns: number;
  total_cost_usd?: number;
  duration_ms?: number;
  result?: string;
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

export type Claude2StreamClientMessage = {
  type: "user";
  message: {
    role: "user";
    content: Array<{ type: "text"; text: string }>;
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
  | Claude2AssistantMessage
  | Claude2UserMessage
  | Claude2Result;

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
