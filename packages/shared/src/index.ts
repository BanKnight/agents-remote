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

export type AgentProvider = "claude" | "codex";

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
  | "PROJECT_FS_ERROR"
  | "SESSION_NOT_FOUND"
  | "SESSION_RUNTIME_MISSING"
  | "SESSION_RUNTIME_ERROR"
  | "SESSION_PROVIDER_UNAVAILABLE"
  | "SESSION_TYPE_INVALID"
  | "SESSION_STATE_CONFLICT"
  | "SESSION_METADATA_ERROR";

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
