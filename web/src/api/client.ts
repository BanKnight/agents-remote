import type {
  AgentProvider,
  AgentSessionDetailResponse,
  AgentSessionMessagesResponse,
  AuthMeResponse,
  CloseAgentSessionResponse,
  CloseTerminalSessionResponse,
  CreateAgentSessionRequest,
  CreateAgentSessionResponse,
  CreateFolderResponse,
  CreateProjectRequest,
  CreateProjectResponse,
  CreateTerminalSessionRequest,
  CreateTerminalSessionResponse,
  DeleteFileResponse,
  DeleteProjectResponse,
  GitDiffListResponse,
  GitDiffScope,
  GitFileDiffResponse,
  HealthResponse,
  ListAgentSessionsResponse,
  ListAgentHistoryResponse,
  ListTerminalSessionsResponse,
  LoginRequest,
  LoginResponse,
  ProjectDetailResponse,
  ProjectFileListResponse,
  ProjectFilePreviewResponse,
  ProjectListResponse,
  RenameAgentSessionResponse,
  RenameFileResponse,
  RenameSessionRequest,
  RenameTerminalSessionResponse,
  SaveFileRequest,
  SaveFileResponse,
  SlashCommandDescriptionsResponse,
  TerminalSessionDetailResponse,
  UploadFileResponse,
  CreateProviderRequest,
  DeleteProviderResponse,
  GetSettingsResponse,
  ListProviderModelsResponse,
  ProviderResponse,
  UpdateClaudeRuntimeRequest,
  UpdateClaudeRuntimeResponse,
  UpdateProviderRequest,
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

/**
 * 列 PROJECTS_ROOT 一级目录（全局 files tab 根目录浏览，只读）。
 * 进入项目子目录后客户端切到 listProjectFiles（含写）。
 */
export async function listRootFiles(): Promise<ProjectFileListResponse> {
  return fetchJson("/api/root/files", "api.projectFilesFailed");
}

export async function createFolder(
  projectName: string,
  parentPath: string,
  name: string,
): Promise<CreateFolderResponse> {
  return fetchJson(
    projectFileMkdirPath(projectName, parentPath),
    "api.projectFolderCreationFailed",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    },
  );
}

export async function renameFile(
  projectName: string,
  path: string,
  name: string,
): Promise<RenameFileResponse> {
  return fetchJson(projectFileRenamePath(projectName), "api.projectFileRenameFailed", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path, name }),
  });
}

export async function saveFileContent(
  projectName: string,
  path: string,
  content: string,
): Promise<SaveFileResponse> {
  return fetchJson(projectFileSavePath(projectName), "api.projectFileSaveFailed", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path, content } satisfies SaveFileRequest),
  });
}

export async function deleteFile(projectName: string, path: string): Promise<DeleteFileResponse> {
  return fetchJson(projectFileDeletePath(projectName), "api.projectFileDeleteFailed", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path }),
  });
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

export async function listAgentHistory(projectName: string): Promise<ListAgentHistoryResponse> {
  return fetchJson(
    `/api/projects/${encodeURIComponent(projectName)}/agent-history`,
    "api.agentHistoryListFailed",
  );
}

export async function createAgentSession(
  projectName: string,
  provider: AgentProvider,
  opts?: {
    claudeSessionId?: string;
    displayName?: string;
    model?: string;
    permissionMode?: string;
  },
): Promise<CreateAgentSessionResponse> {
  return fetchJson(agentSessionsPath(projectName), "api.agentSessionCreationFailed", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      provider,
      claudeSessionId: opts?.claudeSessionId,
      displayName: opts?.displayName,
      model: opts?.model,
      permissionMode: opts?.permissionMode,
    } satisfies CreateAgentSessionRequest),
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

export async function getSkillSlashCatalog(
  projectName: string,
  sessionId: string,
): Promise<SlashCommandDescriptionsResponse> {
  return fetchJson(
    `${agentSessionsPath(projectName)}/${encodeURIComponent(sessionId)}/skill-slash-catalog`,
    "api.agentSessionDetailFailed",
  );
}

export async function getAgentSessionMessages(
  projectName: string,
  sessionId: string,
  params?: { limit?: number; cursor?: string },
): Promise<AgentSessionMessagesResponse> {
  const base = `${agentSessionsPath(projectName)}/${encodeURIComponent(sessionId)}/messages`;
  const qs = new URLSearchParams();
  if (params?.limit) qs.set("limit", params.limit.toString());
  if (params?.cursor) qs.set("cursor", params.cursor);
  const url = qs.toString() ? `${base}?${qs}` : base;
  return fetchJson(url, "api.agentSessionDetailFailed");
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

export async function renameAgentSession(
  projectName: string,
  sessionId: string,
  displayName: string,
): Promise<RenameAgentSessionResponse> {
  return fetchJson(
    `${agentSessionsPath(projectName)}/${encodeURIComponent(sessionId)}/rename`,
    "api.agentSessionRenameFailed",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName } satisfies RenameSessionRequest),
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

export async function renameTerminalSession(
  projectName: string,
  sessionId: string,
  displayName: string,
): Promise<RenameTerminalSessionResponse> {
  return fetchJson(
    `${terminalSessionsPath(projectName)}/${encodeURIComponent(sessionId)}/rename`,
    "api.terminalSessionRenameFailed",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName } satisfies RenameSessionRequest),
    },
  );
}

export function sessionStreamUrl(
  projectName: string,
  sessionType: "agent" | "terminal",
  sessionId: string,
  cols?: number,
  rows?: number,
) {
  const protocol = globalThis.location.protocol === "https:" ? "wss:" : "ws:";
  const resource = sessionType === "agent" ? "agent-sessions" : "terminal-sessions";
  const base = `${protocol}//${globalThis.location.host}/api/projects/${encodeURIComponent(projectName)}/${resource}/${encodeURIComponent(sessionId)}/stream`;
  // 仅当带有效尺寸时拼 query：后端 open() 在 capture 前先 reflow tmux 到该 cols/rows，
  // 使首个 snapshot 直接是容器 cols（避免光标错位 / 窄→宽过渡）。
  if (cols && rows && cols > 0 && rows > 0) {
    return `${base}?cols=${cols}&rows=${rows}`;
  }
  return base;
}

export function claude2StreamUrl(projectName: string, sessionId: string) {
  const protocol = globalThis.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${globalThis.location.host}/api/projects/${encodeURIComponent(projectName)}/agent-sessions/${encodeURIComponent(sessionId)}/claude2-stream`;
}

export function createEchoSocket() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return new WebSocket(`${protocol}//${window.location.host}/api/ws/echo`);
}

// ── Settings: provider credentials + claude runtime defaults ──────────

export async function getSettings(): Promise<GetSettingsResponse> {
  return fetchJson("/api/settings", "api.settingsFetchFailed");
}

export async function createProvider(input: CreateProviderRequest): Promise<ProviderResponse> {
  return fetchJson("/api/settings/providers", "api.providerCreateFailed", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input satisfies CreateProviderRequest),
  });
}

export async function updateProvider(
  id: string,
  input: UpdateProviderRequest,
): Promise<ProviderResponse> {
  return fetchJson(
    `/api/settings/providers/${encodeURIComponent(id)}`,
    "api.providerUpdateFailed",
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input satisfies UpdateProviderRequest),
    },
  );
}

export async function deleteProvider(id: string): Promise<DeleteProviderResponse> {
  return fetchJson(
    `/api/settings/providers/${encodeURIComponent(id)}`,
    "api.providerDeleteFailed",
    {
      method: "DELETE",
    },
  );
}

export async function updateClaudeRuntime(
  input: UpdateClaudeRuntimeRequest,
): Promise<UpdateClaudeRuntimeResponse> {
  return fetchJson("/api/settings/runtimes/claude", "api.runtimeUpdateFailed", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input satisfies UpdateClaudeRuntimeRequest),
  });
}

// 发现模型：后端用 provider 凭证请求 /v1/models。上游凭证问题返回 HTTP 200 + {ok:false}
// （fetchJson 不抛，前端展示测试结果）；仅 provider 不存在等 API 层错误才抛。
export async function listProviderModels(id: string): Promise<ListProviderModelsResponse> {
  return fetchJson(
    `/api/settings/providers/${encodeURIComponent(id)}/models`,
    "api.providerModelsFailed",
    { method: "POST" },
  );
}

const projectFilesPath = (projectName: string, path: string) =>
  withPathQuery(`/api/projects/${encodeURIComponent(projectName)}/files`, path);

const projectFileUploadPath = (projectName: string, path: string) =>
  withPathQuery(`/api/projects/${encodeURIComponent(projectName)}/files/upload`, path);

const projectFileMkdirPath = (projectName: string, path: string) =>
  withPathQuery(`/api/projects/${encodeURIComponent(projectName)}/files/mkdir`, path);

const projectFileRenamePath = (projectName: string) =>
  `/api/projects/${encodeURIComponent(projectName)}/files/rename`;

const projectFileSavePath = (projectName: string) =>
  `/api/projects/${encodeURIComponent(projectName)}/files/save`;

const projectFileDeletePath = (projectName: string) =>
  `/api/projects/${encodeURIComponent(projectName)}/files/delete`;

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

let refreshPromise: Promise<boolean> | null = null;

const refreshAuth = () => {
  if (!refreshPromise) {
    refreshPromise = getAuthStatus().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
};

const fetchJson = async <T>(
  url: string,
  failureKey: TranslationKey,
  init?: RequestInit,
): Promise<T> => {
  const response = await fetch(url, init);

  if (response.status === 401) {
    const refreshed = await refreshAuth();

    if (refreshed) {
      const retryResponse = await fetch(url, init);

      if (retryResponse.ok) {
        return retryResponse.json();
      }

      throw new Error(`${resolveTranslation(failureKey)}: ${retryResponse.status}`);
    }

    window.dispatchEvent(new CustomEvent("auth:unauthenticated"));
    throw new Error(`${resolveTranslation(failureKey)}: ${response.status}`);
  }

  if (!response.ok) {
    throw new Error(`${resolveTranslation(failureKey)}: ${response.status}`);
  }

  return response.json();
};
