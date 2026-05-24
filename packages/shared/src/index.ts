export type Project = {
  name: string;
  path: string;
  agentSessionCount: number;
  terminalSessionCount: number;
  gitBranch?: string;
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

export type AgentProvider = "claude" | "codex";

export type AgentSessionStatus = "running" | "idle" | "closed" | "error";

export type TerminalSessionStatus = "running" | "closed" | "error";

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
  | "PROJECT_FS_ERROR";

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
