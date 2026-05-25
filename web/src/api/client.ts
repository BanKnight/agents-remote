import type {
  AgentProvider,
  AgentSessionDetailResponse,
  AuthMeResponse,
  CloseAgentSessionResponse,
  CloseTerminalSessionResponse,
  CreateAgentSessionRequest,
  CreateAgentSessionResponse,
  CreateProjectRequest,
  CreateProjectResponse,
  CreateTerminalSessionRequest,
  CreateTerminalSessionResponse,
  HealthResponse,
  ListAgentSessionsResponse,
  ListTerminalSessionsResponse,
  LoginRequest,
  LoginResponse,
  ProjectDetailResponse,
  ProjectFileListResponse,
  ProjectFilePreviewResponse,
  ProjectListResponse,
  TerminalSessionDetailResponse,
} from "@agents-remote/shared";

export async function getApiHealth(): Promise<HealthResponse> {
  const response = await fetch("/api/health");

  if (!response.ok) {
    throw new Error(`Health check failed: ${response.status}`);
  }

  return response.json();
}

export async function getAuthStatus(): Promise<boolean> {
  const response = await fetch("/api/auth/me");

  if (response.status === 401) {
    return false;
  }

  if (!response.ok) {
    throw new Error(`Auth check failed: ${response.status}`);
  }

  const body = (await response.json()) as AuthMeResponse;
  return body.authenticated;
}

export async function login(password: string): Promise<LoginResponse> {
  return fetchJson("/api/auth/login", "Login failed", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password } satisfies LoginRequest),
  });
}

export async function listProjects(): Promise<ProjectListResponse> {
  return fetchJson("/api/projects", "Project list failed");
}

export async function createProject(path: string): Promise<CreateProjectResponse> {
  return fetchJson("/api/projects", "Project creation failed", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path } satisfies CreateProjectRequest),
  });
}

export async function getProject(projectName: string): Promise<ProjectDetailResponse> {
  return fetchJson(`/api/projects/${encodeURIComponent(projectName)}`, "Project detail failed");
}

export async function listProjectFiles(
  projectName: string,
  path = "",
): Promise<ProjectFileListResponse> {
  return fetchJson(projectFilesPath(projectName, path), "Project files failed");
}

export async function previewProjectFile(
  projectName: string,
  path: string,
): Promise<ProjectFilePreviewResponse> {
  return fetchJson(projectFilePreviewPath(projectName, path), "Project file preview failed");
}

export async function listAgentSessions(projectName: string): Promise<ListAgentSessionsResponse> {
  return fetchJson(agentSessionsPath(projectName), "Agent session list failed");
}

export async function createAgentSession(
  projectName: string,
  provider: AgentProvider,
): Promise<CreateAgentSessionResponse> {
  return fetchJson(agentSessionsPath(projectName), "Agent session creation failed", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ provider } satisfies CreateAgentSessionRequest),
  });
}

export async function getAgentSession(
  projectName: string,
  sessionId: string,
): Promise<AgentSessionDetailResponse> {
  return fetchJson(
    `${agentSessionsPath(projectName)}/${encodeURIComponent(sessionId)}`,
    "Agent session detail failed",
  );
}

export async function closeAgentSession(
  projectName: string,
  sessionId: string,
): Promise<CloseAgentSessionResponse> {
  return fetchJson(
    `${agentSessionsPath(projectName)}/${encodeURIComponent(sessionId)}/close`,
    "Agent session close failed",
    {
      method: "POST",
    },
  );
}

export async function listTerminalSessions(
  projectName: string,
): Promise<ListTerminalSessionsResponse> {
  return fetchJson(terminalSessionsPath(projectName), "Terminal session list failed");
}

export async function createTerminalSession(
  projectName: string,
  displayName?: string,
): Promise<CreateTerminalSessionResponse> {
  return fetchJson(terminalSessionsPath(projectName), "Terminal session creation failed", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ displayName } satisfies CreateTerminalSessionRequest),
  });
}

export async function getTerminalSession(
  projectName: string,
  sessionId: string,
): Promise<TerminalSessionDetailResponse> {
  return fetchJson(
    `${terminalSessionsPath(projectName)}/${encodeURIComponent(sessionId)}`,
    "Terminal session detail failed",
  );
}

export async function closeTerminalSession(
  projectName: string,
  sessionId: string,
): Promise<CloseTerminalSessionResponse> {
  return fetchJson(
    `${terminalSessionsPath(projectName)}/${encodeURIComponent(sessionId)}/close`,
    "Terminal session close failed",
    {
      method: "POST",
    },
  );
}

export function sessionStreamUrl(
  projectName: string,
  sessionType: "agent" | "terminal",
  sessionId: string,
) {
  const protocol = globalThis.location.protocol === "https:" ? "wss:" : "ws:";
  const resource = sessionType === "agent" ? "agent-sessions" : "terminal-sessions";
  return `${protocol}//${globalThis.location.host}/api/projects/${encodeURIComponent(projectName)}/${resource}/${encodeURIComponent(sessionId)}/stream`;
}

export function createEchoSocket() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return new WebSocket(`${protocol}//${window.location.host}/api/ws/echo`);
}

const projectFilesPath = (projectName: string, path: string) =>
  withPathQuery(`/api/projects/${encodeURIComponent(projectName)}/files`, path);

const projectFilePreviewPath = (projectName: string, path: string) =>
  withPathQuery(`/api/projects/${encodeURIComponent(projectName)}/files/preview`, path);

const withPathQuery = (basePath: string, path: string) => {
  if (path.length === 0) {
    return basePath;
  }

  return `${basePath}?path=${encodeURIComponent(path)}`;
};

const agentSessionsPath = (projectName: string) =>
  `/api/projects/${encodeURIComponent(projectName)}/agent-sessions`;

const terminalSessionsPath = (projectName: string) =>
  `/api/projects/${encodeURIComponent(projectName)}/terminal-sessions`;

const fetchJson = async <T>(
  url: string,
  failureMessage: string,
  init?: RequestInit,
): Promise<T> => {
  const response = await fetch(url, init);

  if (!response.ok) {
    throw new Error(`${failureMessage}: ${response.status}`);
  }

  return response.json();
};
