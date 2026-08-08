import type {
  AgentHistoryRange,
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
  GitAheadBehindResponse,
  GitBranchListResponse,
  GitCommitLogResponse,
  GitDiffListResponse,
  GitDiffScope,
  GitCompareDiffResponse,
  GitCompareFileDiffResponse,
  GitFileDiffResponse,
  HealthResponse,
  ListAgentSessionsResponse,
  ListAgentHistoryResponse,
  ListTerminalSessionsResponse,
  LoginRequest,
  LoginResponse,
  OverviewResponse,
  OverviewSubtitlesResponse,
  PagesConfigResponse,
  PinnedSessionsResponse,
  ProjectDetailResponse,
  ProjectFileListResponse,
  ProjectFilePreviewResponse,
  ProjectListResponse,
  UpdatePagesConfigRequest,
  UpdatePagesConfigResponse,
  RenameAgentSessionResponse,
  RenameFileResponse,
  RenameSessionRequest,
  RenameTerminalSessionResponse,
  SaveFileRequest,
  SaveFileResponse,
  SlashCommandDescriptionsResponse,
  TerminalSessionDetailResponse,
  UploadFileResponse,
  ClaudePresetResponse,
  CreateClaudePresetRequest,
  DeleteClaudePresetResponse,
  GetSettingsResponse,
  ListProviderModelsResponse,
  TestClaudePresetRequest,
  UpdateClaudePresetRequest,
  UpdateClaudeRuntimeRequest,
  UpdateClaudeRuntimeResponse,
  AddMcpServerRequest,
  AddMcpServerResponse,
  AddSkillSourceRequest,
  AddSkillSourceResponse,
  CheckSkillUpdatesResponse,
  InstallSkillRequest,
  InstallSkillResponse,
  InstalledSkillsResponse,
  ListMcpServersResponse,
  McpScope,
  RemoveMcpServerResponse,
  RemoveSkillSourceResponse,
  SkillAgent,
  SkillMarketSearchResponse,
  SkillPreviewResponse,
  SkillSourcesResponse,
  UninstallSkillRequest,
  UninstallSkillResponse,
  UpdateSkillRequest,
  UpdateSkillResponse,
  WikiIndexResponse,
  WikiPage,
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

/**
 * 全局总览聚合（GET /api/overview）：单请求拿全 project 名 + 全活跃实例候选，替代 global 总览
 * 的 1+2N 瀑布（listProjects → 每项目 listAgent/listTerminal）。失败语义同 listProjects。
 */
export async function fetchOverview(): Promise<OverviewResponse> {
  return fetchJson("/api/overview", "api.projectListFailed");
}

/**
 * overview 第二阶段（GET /api/overview/subtitles）：拿 sessionId → 卡片第二行 map，前端补进
 * 对应卡片。与 fetchOverview 分离，让核心列表毫秒级返回、subtitle 慢填充。失败语义同 fetchOverview。
 */
export async function fetchOverviewSubtitles(): Promise<OverviewSubtitlesResponse> {
  return fetchJson("/api/overview/subtitles", "api.projectListFailed");
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

export async function getPagesConfig(projectName: string): Promise<PagesConfigResponse> {
  return fetchJson(pagesConfigPath(projectName), "api.projectPagesConfigFailed");
}

export async function updatePagesConfig(
  projectName: string,
  input: UpdatePagesConfigRequest,
): Promise<UpdatePagesConfigResponse> {
  return fetchJson(pagesConfigPath(projectName), "api.projectPagesUpdateFailed", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input satisfies UpdatePagesConfigRequest),
  });
}

export async function getWikiIndex(projectName: string): Promise<WikiIndexResponse> {
  return fetchJson(wikiIndexPath(projectName), "api.wikiIndexFailed");
}

export async function getWikiPage(projectName: string, slug: string): Promise<WikiPage> {
  return fetchJson(wikiPagePath(projectName, slug), "api.wikiPageFailed");
}

/**
 * pages serve 的对外干净 URL（/p/{name}{urlPath}）。web vite proxy 把 /p/{name}{urlPath}
 * rewrite 到 /api/projects/{name}/pages{urlPath}（见 web/vite.config.ts）。浏览器直访新标签页:
 * HttpOnly cookie Path=/ 自动携带——public 根免登录,token 根凭已登录态 cookie 放行。
 * urlPath 须含前导 "/"（根传 "/"）；根返回带尾斜杠 `/p/{name}/`（触发 index.html 默认页 +
 * 相对路径资源正确解析）。
 */
export function pagesServeUrl(projectName: string, urlPath: string): string {
  const path = urlPath.startsWith("/") ? urlPath : `/${urlPath}`;
  return `/p/${encodeURIComponent(projectName)}${path === "/" ? "/" : path}`;
}

export async function getProjectGitFileDiff(
  projectName: string,
  scope: GitDiffScope,
  path: string,
  context?: "full",
): Promise<GitFileDiffResponse> {
  return fetchJson(
    projectGitFileDiffPath(projectName, scope, path, context),
    "api.projectGitFileDiffFailed",
  );
}

export async function listProjectGitBranches(projectName: string): Promise<GitBranchListResponse> {
  return fetchJson(projectGitBranchesPath(projectName), "api.projectGitDiffFailed");
}

export async function getProjectGitLog(
  projectName: string,
  branch?: string,
): Promise<GitCommitLogResponse> {
  return fetchJson(projectGitLogPath(projectName, branch), "api.projectGitDiffFailed");
}

export async function getProjectGitAheadBehind(
  projectName: string,
  branch?: string,
): Promise<GitAheadBehindResponse> {
  return fetchJson(projectGitAheadBehindPath(projectName, branch), "api.projectGitDiffFailed");
}

export async function getProjectGitCompareDiff(
  projectName: string,
  base: string,
  compare: string,
): Promise<GitCompareDiffResponse> {
  return fetchJson(
    projectGitCompareDiffPath(projectName, base, compare),
    "api.projectGitDiffFailed",
  );
}

export async function getProjectGitCompareFileDiff(
  projectName: string,
  base: string,
  compare: string,
  path: string,
  context?: "full",
): Promise<GitCompareFileDiffResponse> {
  return fetchJson(
    projectGitCompareFileDiffPath(projectName, base, compare, path, context),
    "api.projectGitDiffFailed",
  );
}

export async function listAgentSessions(projectName: string): Promise<ListAgentSessionsResponse> {
  return fetchJson(agentSessionsPath(projectName), "api.agentSessionListFailed");
}

export async function listAgentHistory(
  projectName: string,
  range: AgentHistoryRange = "week",
): Promise<ListAgentHistoryResponse> {
  return fetchJson(
    `/api/projects/${encodeURIComponent(projectName)}/agent-history?range=${range}`,
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

// ── Settings: claude 预设（凭证 + 模型映射）+ runtime 旋钮 ──────────

export async function getSettings(): Promise<GetSettingsResponse> {
  return fetchJson("/api/settings", "api.settingsFetchFailed");
}

export async function createClaudePreset(
  input: CreateClaudePresetRequest,
): Promise<ClaudePresetResponse> {
  return fetchJson("/api/settings/runtimes/claude/presets", "api.presetCreateFailed", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input satisfies CreateClaudePresetRequest),
  });
}

export async function updateClaudePreset(
  id: string,
  input: UpdateClaudePresetRequest,
): Promise<ClaudePresetResponse> {
  return fetchJson(
    `/api/settings/runtimes/claude/presets/${encodeURIComponent(id)}`,
    "api.presetUpdateFailed",
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input satisfies UpdateClaudePresetRequest),
    },
  );
}

export async function deleteClaudePreset(id: string): Promise<DeleteClaudePresetResponse> {
  return fetchJson(
    `/api/settings/runtimes/claude/presets/${encodeURIComponent(id)}`,
    "api.presetDeleteFailed",
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

// 发现模型：后端用该预设凭证请求 /v1/models。上游凭证问题返回 HTTP 200 + {ok:false}
// （fetchJson 不抛，前端展示测试结果）；仅 preset 不存在等 API 层错误才抛（404）。
export async function listPresetModels(id: string): Promise<ListProviderModelsResponse> {
  return fetchJson(
    `/api/settings/runtimes/claude/presets/${encodeURIComponent(id)}/models`,
    "api.presetModelsFailed",
    { method: "POST" },
  );
}

// 测试连接（不落盘）：用表单内联凭证请求上游 /v1/models。新建态无 id；编辑态传 id，
// apiKey 留空时后端回退已保存原 key（原 key 永不出 api 进程，前端只持 masked）。
// 上游凭证问题同样返回 HTTP 200 + {ok:false}（fetchJson 不抛，前端展示测试结果）。
export async function testPresetModels(
  input: TestClaudePresetRequest,
): Promise<ListProviderModelsResponse> {
  return fetchJson("/api/settings/runtimes/claude/presets/test-models", "api.presetModelsFailed", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input satisfies TestClaudePresetRequest),
  });
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

const projectGitFileDiffPath = (
  projectName: string,
  scope: GitDiffScope,
  path: string,
  context?: "full",
) => {
  const base = `${projectGitDiffPath(projectName)}/file?scope=${encodeURIComponent(scope)}&path=${encodeURIComponent(path)}`;
  return context === "full" ? `${base}&context=full` : base;
};

const projectGitBranchesPath = (projectName: string) =>
  `/api/projects/${encodeURIComponent(projectName)}/git/branches`;

const projectGitLogPath = (projectName: string, branch?: string) => {
  const base = `/api/projects/${encodeURIComponent(projectName)}/git/log`;
  return branch ? `${base}?branch=${encodeURIComponent(branch)}` : base;
};

const projectGitAheadBehindPath = (projectName: string, branch?: string) => {
  const base = `/api/projects/${encodeURIComponent(projectName)}/git/ahead-behind`;
  return branch ? `${base}?branch=${encodeURIComponent(branch)}` : base;
};

const projectGitComparePath = (projectName: string) =>
  `/api/projects/${encodeURIComponent(projectName)}/git/compare`;

const projectGitCompareDiffPath = (projectName: string, base: string, compare: string) =>
  `${projectGitComparePath(projectName)}?base=${encodeURIComponent(base)}&compare=${encodeURIComponent(compare)}`;

const projectGitCompareFileDiffPath = (
  projectName: string,
  base: string,
  compare: string,
  path: string,
  context?: "full",
) => {
  const head = projectGitComparePath(projectName);
  const url = `${head}/file?base=${encodeURIComponent(base)}&compare=${encodeURIComponent(compare)}&path=${encodeURIComponent(path)}`;
  return context === "full" ? `${url}&context=full` : url;
};

const withPathQuery = (basePath: string, path: string) => {
  if (path.length === 0) {
    return basePath;
  }

  return `${basePath}?path=${encodeURIComponent(path)}`;
};

const pagesConfigPath = (projectName: string) =>
  `/api/projects/${encodeURIComponent(projectName)}/pages/config`;

const wikiIndexPath = (projectName: string) =>
  `/api/projects/${encodeURIComponent(projectName)}/wiki`;

const wikiPagePath = (projectName: string, slug: string) =>
  `/api/projects/${encodeURIComponent(projectName)}/wiki/${encodeURIComponent(slug)}`;

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

// ── Skills（市场发现 / 已装 / 安装 / 卸载 / 预览 / 源 CRUD） ──

export async function searchSkills(query: string): Promise<SkillMarketSearchResponse> {
  return fetchJson(
    `/api/skills/search?q=${encodeURIComponent(query)}`,
    "api.skillMarketFetchFailed",
  );
}

export async function listInstalledSkills(agent: SkillAgent): Promise<InstalledSkillsResponse> {
  return fetchJson(
    `/api/skills/installed?agent=${encodeURIComponent(agent)}`,
    "api.skillListFailed",
  );
}

export async function previewSkill(name: string, agent: SkillAgent): Promise<SkillPreviewResponse> {
  return fetchJson(
    `/api/skills/preview?name=${encodeURIComponent(name)}&agent=${encodeURIComponent(agent)}`,
    "api.skillPreviewFailed",
  );
}

export async function installSkill(req: InstallSkillRequest): Promise<InstallSkillResponse> {
  return fetchJson("/api/skills/install", "api.skillInstallFailed", {
    method: "POST",
    body: JSON.stringify(req),
    headers: { "content-type": "application/json" },
  });
}

export async function uninstallSkill(req: UninstallSkillRequest): Promise<UninstallSkillResponse> {
  return fetchJson("/api/skills/uninstall", "api.skillUninstallFailed", {
    method: "POST",
    body: JSON.stringify(req),
    headers: { "content-type": "application/json" },
  });
}

export async function listSkillSources(): Promise<SkillSourcesResponse> {
  return fetchJson("/api/skills/sources", "api.skillListFailed");
}

export async function addSkillSource(req: AddSkillSourceRequest): Promise<AddSkillSourceResponse> {
  return fetchJson("/api/skills/sources", "api.skillSourceInvalid", {
    method: "POST",
    body: JSON.stringify(req),
    headers: { "content-type": "application/json" },
  });
}

export async function removeSkillSource(id: string): Promise<RemoveSkillSourceResponse> {
  return fetchJson(`/api/skills/sources?id=${encodeURIComponent(id)}`, "api.skillListFailed", {
    method: "DELETE",
  });
}

// skill 更新检测/执行（第三方技能版本比对：读 .skill-lock.json hash vs GitHub Trees API）。
// 用户手动触发（useCheckSkillUpdates 手动 refetch），不自动批量（避 GitHub API 限速）。
export async function checkSkillUpdates(agent: SkillAgent): Promise<CheckSkillUpdatesResponse> {
  return fetchJson(
    `/api/skills/updates?agent=${encodeURIComponent(agent)}`,
    "api.skillUpdateCheckFailed",
  );
}

export async function updateSkill(req: UpdateSkillRequest): Promise<UpdateSkillResponse> {
  return fetchJson("/api/skills/update", "api.skillUpdateFailed", {
    method: "POST",
    body: JSON.stringify(req),
    headers: { "content-type": "application/json" },
  });
}

// ── MCP（外部 server 管理：user scope ~/.claude.json / project scope .mcp.json）──
// agent 实例由 CLI 原生合并生效，这里只管配置。project scope 走 /api/projects/{name}/mcp。

export async function listMcpServers(
  scope: McpScope,
  projectName?: string,
): Promise<ListMcpServersResponse> {
  const path =
    scope === "project" && projectName
      ? `/api/projects/${encodeURIComponent(projectName)}/mcp`
      : "/api/mcp";
  return fetchJson(path, "api.mcpListFailed");
}

export async function addMcpServer(
  req: AddMcpServerRequest,
  scope: McpScope,
  projectName?: string,
): Promise<AddMcpServerResponse> {
  const path =
    scope === "project" && projectName
      ? `/api/projects/${encodeURIComponent(projectName)}/mcp/add`
      : "/api/mcp/add";
  return fetchJson(path, "api.mcpAddFailed", {
    method: "POST",
    body: JSON.stringify(req),
    headers: { "content-type": "application/json" },
  });
}

export async function removeMcpServer(
  name: string,
  scope: McpScope,
  projectName?: string,
): Promise<RemoveMcpServerResponse> {
  const path =
    scope === "project" && projectName
      ? `/api/projects/${encodeURIComponent(projectName)}/mcp/remove`
      : "/api/mcp/remove";
  return fetchJson(path, "api.mcpRemoveFailed", {
    method: "POST",
    body: JSON.stringify({ name }),
    headers: { "content-type": "application/json" },
  });
}

// ── 全局总览置顶会话（跨设备共享，存服务端 state.yaml overview 模块）──
// sessionId 走 path 段（encodeURIComponent），与后端 POST/DELETE /:sessionId 对齐。

export async function listPinnedSessions(): Promise<PinnedSessionsResponse> {
  return fetchJson("/api/state/overview/pinned-sessions", "api.pinnedSessionsFailed");
}

export async function pinSession(sessionId: string): Promise<PinnedSessionsResponse> {
  return fetchJson(
    `/api/state/overview/pinned-sessions/${encodeURIComponent(sessionId)}`,
    "api.pinnedSessionsFailed",
    { method: "POST" },
  );
}

export async function unpinSession(sessionId: string): Promise<PinnedSessionsResponse> {
  return fetchJson(
    `/api/state/overview/pinned-sessions/${encodeURIComponent(sessionId)}`,
    "api.pinnedSessionsFailed",
    { method: "DELETE" },
  );
}

/**
 * REST JSON 请求默认超时：兜底移动端网络切换 / 隧道断连导致的 fetch 无限挂死（降级为失败 +
 * queryClient retry）。不救"慢"——偶发尖峰 <8s 不触发（救慢靠后端 TTL 降频 + stale-while-revalidate），
 * 只防单请求永久 pending。两处 fetch 各新建 signal（retry 不共享首次剩余时长）。
 */
const API_REQUEST_TIMEOUT_MS = 8_000;

const fetchJson = async <T>(
  url: string,
  failureKey: TranslationKey,
  init?: RequestInit,
): Promise<T> => {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(API_REQUEST_TIMEOUT_MS),
  });

  if (response.status === 401) {
    const refreshed = await refreshAuth();

    if (refreshed) {
      const retryResponse = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(API_REQUEST_TIMEOUT_MS),
      });

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
