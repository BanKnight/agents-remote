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
  DeleteProjectResponse,
  GitDiffListResponse,
  GitDiffScope,
  GitFileDiffResponse,
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
  UploadFileResponse,
} from "@agents-remote/shared";
import type { TranslationKey } from "../i18n/types";
import { resolveTranslation } from "../i18n/translate";

const fail = (key: TranslationKey, status: number) =>
  new Error(`${resolveTranslation(key)}: ${status}`);

export async function getApiHealth(): Promise<HealthResponse> {
  const response = await fetch("/api/health");

  if (!response.ok) {
    throw fail("api.healthCheckFailed", response.status);
  }

  return response.json();
}

export async function getAuthStatus(): Promise<boolean> {
  const response = await fetch("/api/auth/me");

  if (response.status === 401) {
    return false;
  }

  if (!response.ok) {
    throw fail("api.authCheckFailed", response.status);
  }

  const body = (await response.json()) as AuthMeResponse;
  return body.authenticated;
}

export async function login(password: string): Promise<LoginResponse> {
  return fetchJson("/api/auth/login", "api.loginFailed", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password } satisfies LoginRequest),
  });
}

export async function listProjects(): Promise<ProjectListResponse> {
  return fetchJson("/api/projects", "api.projectListFailed");
}

export async function createProject(path: string): Promise<CreateProjectResponse> {
  return fetchJson("/api/projects", "api.projectCreationFailed", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path } satisfies CreateProjectRequest),
  });
}

export async function getProject(projectName: string): Promise<ProjectDetailResponse> {
  return fetchJson(`/api/projects/${encodeURIComponent(projectName)}`, "api.projectDetailFailed");
}

export async function deleteProject(projectName: string): Promise<DeleteProjectResponse> {
  return fetchJson(`/api/projects/${encodeURIComponent(projectName)}`, "api.projectDeleteFailed", {
    method: "DELETE",
  });
}

export async function listProjectFiles(
  projectName: string,
  path = "",
): Promise<ProjectFileListResponse> {
  return fetchJson(projectFilesPath(projectName, path), "api.projectFilesFailed");
}

export async function uploadFile(
  projectName: string,
  directoryPath: string,
  file: File,
): Promise<UploadFileResponse> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(projectFileUploadPath(projectName, directoryPath), {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`${resolveTranslation("api.projectFileUploadFailed")}: ${response.status}`);
  }

  return response.json();
}

export async function previewProjectFile(
  projectName: string,
  path: string,
): Promise<ProjectFilePreviewResponse> {
  return fetchJson(projectFilePreviewPath(projectName, path), "api.projectFilePreviewFailed");
}

export async function listProjectGitDiff(projectName: string): Promise<GitDiffListResponse> {
  return fetchJson(projectGitDiffPath(projectName), "api.projectGitDiffFailed");
}

export async function getProjectGitFileDiff(
  projectName: string,
  scope: GitDiffScope,
  path: string,
): Promise<GitFileDiffResponse> {
  return fetchJson(
    projectGitFileDiffPath(projectName, scope, path),
    "api.projectGitFileDiffFailed",
  );
}

export async function listAgentSessions(projectName: string): Promise<ListAgentSessionsResponse> {
  return fetchJson(agentSessionsPath(projectName), "api.agentSessionListFailed");
}

export async function createAgentSession(
  projectName: string,
  provider: AgentProvider,
): Promise<CreateAgentSessionResponse> {
  return fetchJson(agentSessionsPath(projectName), "api.agentSessionCreationFailed", {
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
    "api.agentSessionDetailFailed",
  );
}

export async function closeAgentSession(
  projectName: string,
  sessionId: string,
): Promise<CloseAgentSessionResponse> {
  return fetchJson(
    `${agentSessionsPath(projectName)}/${encodeURIComponent(sessionId)}/close`,
    "api.agentSessionCloseFailed",
    {
      method: "POST",
    },
  );
}

export async function listTerminalSessions(
  projectName: string,
): Promise<ListTerminalSessionsResponse> {
  return fetchJson(terminalSessionsPath(projectName), "api.terminalSessionListFailed");
}

export async function createTerminalSession(
  projectName: string,
  displayName?: string,
): Promise<CreateTerminalSessionResponse> {
  return fetchJson(terminalSessionsPath(projectName), "api.terminalSessionCreationFailed", {
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
    "api.terminalSessionDetailFailed",
  );
}

export async function closeTerminalSession(
  projectName: string,
  sessionId: string,
): Promise<CloseTerminalSessionResponse> {
  return fetchJson(
    `${terminalSessionsPath(projectName)}/${encodeURIComponent(sessionId)}/close`,
    "api.terminalSessionCloseFailed",
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

const projectFileUploadPath = (projectName: string, path: string) =>
  withPathQuery(`/api/projects/${encodeURIComponent(projectName)}/files/upload`, path);

const projectFilePreviewPath = (projectName: string, path: string) =>
  withPathQuery(`/api/projects/${encodeURIComponent(projectName)}/files/preview`, path);

const projectGitDiffPath = (projectName: string) =>
  `/api/projects/${encodeURIComponent(projectName)}/git/diff`;

const projectGitFileDiffPath = (projectName: string, scope: GitDiffScope, path: string) =>
  `${projectGitDiffPath(projectName)}/file?scope=${encodeURIComponent(scope)}&path=${encodeURIComponent(path)}`;

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
  failureKey: TranslationKey,
  init?: RequestInit,
): Promise<T> => {
  const response = await fetch(url, init);

  if (!response.ok) {
    throw new Error(`${resolveTranslation(failureKey)}: ${response.status}`);
  }

  return response.json();
};
