import type {
  CreateProjectRequest,
  CreateProjectResponse,
  DeleteProjectResponse,
  HealthResponse,
  OverviewResponse,
  OverviewSubtitlesResponse,
  PagesConfigResponse,
  ProjectDetailResponse,
  ProjectListResponse,
  UpdatePagesConfigResponse,
  WikiIndexResponse,
} from "@agents-remote/shared";
import { AgentRuntime } from "./agent-runtime";
import { AuthService } from "./auth";
import { ClaudeRuntime } from "./claude-runtime";
import { parseClaudePermissionModes } from "./agent-provider-profiles";
import { ClaudeStreamController, handleClaudeStreamUpgrade } from "./claude-stream";
import {
  applyAuthRefresh,
  handleAuthMe,
  handleLogin,
  jsonError,
  requireHttpAuth,
} from "./http-auth";
import { ProjectFilesService, ProjectFilesError } from "./project-files";
import { ProjectPagesError, ProjectPagesService } from "./project-pages";
import { ProjectGitDiffError, ProjectGitDiffService } from "./project-git-diff";
import { ProjectWikiError, ProjectWikiService } from "./project-wiki";
import { ProjectService, ProjectServiceError } from "./projects";
import { readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { ensureRuntimeDir, resolveRuntimePaths } from "./runtime-dir";
import { handleSessionRoutes } from "./session-routes";
import { SessionRegistry, type RuntimeResources } from "./session-registry";
import { ChatSessionRegistry, DEFAULT_CHAT_TITLE } from "./chat-session-registry";
import { handleChatSessionRoutes } from "./chat-session-routes";
import { PiRuntime } from "./pi-runtime";
import { handlePiStreamUpgrade, PiStreamController } from "./pi-stream";
import { handleSessionStreamUpgrade, SessionStreamController } from "./session-stream";
import { TmuxRuntime } from "./tmux-runtime";
import { loadConfig } from "./config";
import { StartupError } from "./startup-error";
import { migrateLegacyUserFiles } from "./migrate-legacy-config";
import { SettingsStore } from "./settings-store";
import { StateStore } from "./state-store";
import { handleStateRoutes } from "./state-routes";
import { handleSettingsRoutes } from "./settings-routes";
import { handleSkillRoutes } from "./skill-market";
import { handleSkillUpdateRoutes } from "./skill-update";
import { handleSkillTaskEvents } from "./skill-tasks";
import { handleMcpRoutes } from "./mcp-management";
import { startMcpHubServer } from "./mcp-hub-server";
import { canUpgradeWebSocket } from "./ws-auth";

type UpgradeServer = {
  upgrade(request: Request, options?: { data?: WebSocketData }): boolean;
  // Bun Server.timeout：SSE 端点禁用 per-connection idle 超时（skill-tasks handleSkillTaskEvents 用）。
  timeout(request: Request, seconds: number): unknown;
};

type FetchHandlerOptions = {
  claudeRuntime?: ClaudeRuntime;
  claudeStreamController?: ClaudeStreamController;
  piStreamController?: PiStreamController;
  projectFilesService?: ProjectFilesService;
  projectPagesService?: ProjectPagesService;
  projectWikiService?: ProjectWikiService;
  projectGitDiffService?: ProjectGitDiffService;
  projectService?: ProjectService;
  projectsRoot?: string;
  sessionRegistry?: SessionRegistry;
  chatSessionRegistry?: ChatSessionRegistry;
  settingsStore?: SettingsStore;
  stateStore?: StateStore;
};

type WebSocketData =
  | {
      kind: "echo";
    }
  | {
      kind: "session-stream";
      sessionType: "agent" | "terminal";
      projectName: string;
      sessionId: string;
      runtimeKey: string;
      status: "running" | "idle" | "closed" | "error";
    }
  | {
      kind: "claude-stream";
      sessionType: "agent";
      projectName: string;
      sessionId: string;
      runtimeKey: string;
      status: "running" | "idle" | "closed" | "error";
    }
  | {
      kind: "pi-stream";
      chatId: string;
    };

const echoWebSocketData: WebSocketData = { kind: "echo" };

export const createFetchHandler =
  (auth: AuthService, options: FetchHandlerOptions = {}) =>
  async (request: Request, server: UpgradeServer) => {
    const url = new URL(request.url);

    if (url.pathname === "/api/health" && request.method === "GET") {
      return Response.json({ ok: true, service: "api" } satisfies HealthResponse);
    }

    if (url.pathname === "/api/auth/login" && request.method === "POST") {
      return handleLogin(request, auth);
    }

    if (url.pathname === "/api/auth/me" && request.method === "GET") {
      return handleAuthMe(request, auth);
    }

    if (url.pathname === "/api/ws/echo") {
      if (!canUpgradeWebSocket(request, auth)) {
        return jsonError("UNAUTHENTICATED", "Authentication required", 401);
      }

      if (server.upgrade(request, { data: echoWebSocketData })) {
        return undefined;
      }

      return new Response("WebSocket upgrade required", { status: 426 });
    }

    // pages 静态托管 serve：默认 public，per-根可选 token 鉴权（决策点 2）。必须在统一
    // /api/ token 守卫之前，否则 public 根也会被拦。/pages/config 端点除外（鉴权敏感，
    // 留守卫后处理）。serve 不调 applyAuthRefresh：对外资源不应带 Set-Cookie。
    if (
      options.projectPagesService &&
      url.pathname.startsWith("/api/projects/") &&
      request.method === "GET"
    ) {
      const pagesMatch = matchProjectPagesPath(url.pathname);
      if (pagesMatch && !pagesMatch.isConfig) {
        try {
          const served = await options.projectPagesService.serve(
            pagesMatch.projectName,
            pagesMatch.urlPath,
          );
          if (served.root.auth === "token") {
            const authResult = requireHttpAuth(request, auth);
            if (authResult.status === "unauthenticated") {
              return authResult.response;
            }
          }
          if (request.headers.get("If-None-Match") === served.etag) {
            return new Response(null, { status: 304, headers: { ETag: served.etag } });
          }
          return new Response(new Uint8Array(served.content), {
            headers: {
              "Content-Type": served.mimeType,
              ETag: served.etag,
              // 弱缓存：浏览器每次校验 ETag（决策点 4「不强缓存」）。
              "Cache-Control": "no-cache",
            },
          });
        } catch (error) {
          if (error instanceof ProjectPagesError) {
            return projectPagesErrorResponse(error);
          }
          throw error;
        }
      }
    }

    let authRefreshToken: import("./auth").TokenIssue | undefined;

    if (url.pathname.startsWith("/api/")) {
      const authResult = requireHttpAuth(request, auth);

      if (authResult.status === "unauthenticated") {
        return authResult.response;
      }

      authRefreshToken = authResult.refreshToken;
    }

    const withRefresh = (response: Response | undefined) => {
      if (authRefreshToken && response) {
        return applyAuthRefresh(response, authRefreshToken);
      }
      return response;
    };

    if (options.settingsStore) {
      const settingsResponse = await handleSettingsRoutes(request, url, options.settingsStore);
      if (settingsResponse) {
        return withRefresh(settingsResponse);
      }
      const skillResponse = await handleSkillRoutes(request, url, {
        settingsStore: options.settingsStore,
        claudeRuntime: options.claudeRuntime,
        projectsRoot: options.projectsRoot,
      });
      if (skillResponse) {
        return withRefresh(skillResponse);
      }
      const skillUpdateResponse = await handleSkillUpdateRoutes(request, url, {
        settingsStore: options.settingsStore,
        claudeRuntime: options.claudeRuntime,
        projectsRoot: options.projectsRoot,
      });
      if (skillUpdateResponse) {
        return withRefresh(skillUpdateResponse);
      }
    }

    // skill install/update 异步任务的 SSE 进度流（不依赖 settingsStore，只需 registry + server）。
    const taskEventsResponse = await handleSkillTaskEvents(request, url, server);
    if (taskEventsResponse) {
      return withRefresh(taskEventsResponse);
    }

    const mcpResponse = await handleMcpRoutes(request, url, { projectsRoot: options.projectsRoot });
    if (mcpResponse) {
      return withRefresh(mcpResponse);
    }

    if (options.stateStore) {
      const stateResponse = await handleStateRoutes(request, url, options.stateStore);
      if (stateResponse) {
        return withRefresh(stateResponse);
      }
    }

    // pi-stream upgrade：/api/chat-sessions/:chatId/stream 全局无项目作用域，upgrade 显式鉴权
    // （401 未认证 / 404 会话不存在），独立于下方 projectsRoot 守卫。
    if (options.piStreamController && options.chatSessionRegistry) {
      const piUpgrade = await handlePiStreamUpgrade(
        request,
        url,
        auth,
        options.chatSessionRegistry,
        server,
      );
      if (piUpgrade.matched) {
        return withRefresh(piUpgrade.response);
      }
    }

    if (options.projectsRoot && options.sessionRegistry) {
      if (options.claudeStreamController) {
        const claudeUpgrade = await handleClaudeStreamUpgrade(
          request,
          url,
          options.projectsRoot,
          options.sessionRegistry,
          server,
        );

        if (claudeUpgrade.matched) {
          return withRefresh(claudeUpgrade.response);
        }
      }

      const streamUpgrade = await handleSessionStreamUpgrade(
        request,
        url,
        options.projectsRoot,
        options.sessionRegistry,
        server,
      );

      if (streamUpgrade.matched) {
        return withRefresh(streamUpgrade.response);
      }

      // /skill-slash-catalog – full skill + slash-command catalog with real
      // descriptions. Direct match, not through session-routes whitelist. The
      // client filters this by the session's availability list.
      const catalogMatch = url.pathname.match(
        /^\/api\/projects\/(.+)\/agent-sessions\/(.+)\/skill-slash-catalog$/,
      );
      if (catalogMatch && request.method === "GET") {
        const { resolveSkillSlashCatalog } = await import("./claude-slash-commands");
        const { resolveProjectPath, ProjectPathError } = await import("./project-paths");
        try {
          const project = await resolveProjectPath(
            options.projectsRoot,
            decodeURIComponent(catalogMatch[1]),
          );
          const commands = await resolveSkillSlashCatalog(project.path);
          return withRefresh(Response.json({ commands }));
        } catch (error) {
          if (error instanceof ProjectPathError) {
            return jsonError(error.code, error.message, 400);
          }
          throw error;
        }
      }

      const sessionResponse = await handleSessionRoutes(
        request,
        url,
        options.projectsRoot,
        options.sessionRegistry,
        options.settingsStore,
      );

      if (sessionResponse) {
        return withRefresh(sessionResponse);
      }
    }

    if (options.chatSessionRegistry) {
      const chatSessionResponse = await handleChatSessionRoutes(
        request,
        url,
        options.chatSessionRegistry,
      );
      if (chatSessionResponse) {
        return withRefresh(chatSessionResponse);
      }
    }

    if (options.projectService && options.sessionRegistry) {
      const overviewResponse = await handleOverview(
        request,
        url,
        options.projectService,
        options.sessionRegistry,
      );
      if (overviewResponse) {
        return withRefresh(overviewResponse);
      }
    }

    if (options.projectPagesService) {
      const pagesConfigResponse = await handlePagesConfig(
        request,
        url,
        options.projectPagesService,
      );
      if (pagesConfigResponse) {
        return withRefresh(pagesConfigResponse);
      }
    }

    if (options.projectWikiService) {
      const wikiResponse = await handleWikiRoute(request, url, options.projectWikiService);
      if (wikiResponse) {
        return withRefresh(wikiResponse);
      }
    }

    if (options.projectService) {
      const projectResponse = await handleProjects(
        request,
        url,
        options.projectService,
        options.projectFilesService,
        options.projectGitDiffService,
      );

      if (projectResponse) {
        return withRefresh(projectResponse);
      }
    }

    return withRefresh(Response.json({ error: "Not found" }, { status: 404 }));
  };

const handleOverview = async (
  request: Request,
  url: URL,
  projectService: ProjectService,
  sessionRegistry: SessionRegistry,
): Promise<Response | undefined> => {
  // GET /api/overview（第一阶段，核心列表）：聚合全 project 名 + 全活跃实例候选，替代前端 global
  // 总览的 1+2N 瀑布（listProjects → 每项目 listAgent/listTerminal）。projectNames 不带计数
  //（grouped 视图空状态用），candidates 经内存索引 + 批量探活过滤（**不含 subtitle capture**，毫秒级）。
  if (url.pathname === "/api/overview" && request.method === "GET") {
    const [projectNames, candidates] = await Promise.all([
      projectService.listProjectNames(),
      sessionRegistry.listAllCandidates(),
    ]);
    return Response.json({ projectNames, candidates } satisfies OverviewResponse);
  }

  // GET /api/overview/subtitles（第二阶段，慢填充）：为存活实例取卡片第二行——terminal capture
  // lastCommand + agent 读 JSONL lastAssistantMessage，前端拿到后补进对应卡片第二行。与核心列表
  // 分离，subtitle 的 tmux/JSONL 慢读取不再拖垮 overview。
  if (url.pathname === "/api/overview/subtitles" && request.method === "GET") {
    const subtitles = await sessionRegistry.listCandidateSubtitles();
    return Response.json({ subtitles } satisfies OverviewSubtitlesResponse);
  }

  return undefined;
};

const handleProjects = async (
  request: Request,
  url: URL,
  projectService: ProjectService,
  projectFilesService?: ProjectFilesService,
  projectGitDiffService?: ProjectGitDiffService,
) => {
  try {
    if (url.pathname === "/api/projects" && request.method === "GET") {
      const response: ProjectListResponse = { projects: await projectService.listProjects() };
      return Response.json(response);
    }

    if (url.pathname === "/api/projects" && request.method === "POST") {
      const body = await readCreateProjectRequest(request);

      if (typeof body.path !== "string") {
        return jsonError("PROJECT_TARGET_INVALID", "Project path is required", 400);
      }

      const response: CreateProjectResponse = {
        project: await projectService.createProject(body.path),
      };
      return Response.json(response);
    }

    const projectGitDiffMatch = matchProjectGitDiffPath(url.pathname);

    if (projectGitDiffMatch && request.method === "GET" && projectGitDiffService) {
      const { projectName, kind } = projectGitDiffMatch;
      const branch = url.searchParams.get("branch") ?? undefined;
      const base = url.searchParams.get("base");
      const compare = url.searchParams.get("compare");
      const path = url.searchParams.get("path");
      const context = url.searchParams.get("context");
      const response =
        kind === "file"
          ? await projectGitDiffService.fileDiff(
              projectName,
              url.searchParams.get("scope"),
              path,
              context,
            )
          : kind === "compareFile"
            ? await projectGitDiffService.compareFileDiff(projectName, base, compare, path, context)
            : kind === "compare"
              ? await projectGitDiffService.compareDiff(projectName, base, compare)
              : kind === "branches"
                ? await projectGitDiffService.listBranches(projectName)
                : kind === "log"
                  ? await projectGitDiffService.listCommits(projectName, branch)
                  : kind === "aheadBehind"
                    ? await projectGitDiffService.listAheadBehind(projectName, branch)
                    : await projectGitDiffService.listDiff(projectName);
      return Response.json(response);
    }

    const projectFilesRawMatch = matchProjectFilesRawPath(url.pathname);

    if (projectFilesRawMatch && request.method === "GET" && projectFilesService) {
      const { content, mimeType } = await projectFilesService.rawFile(
        projectFilesRawMatch.projectName,
        projectFilesRawMatch.filePath,
      );
      return new Response(new Uint8Array(content), { headers: { "Content-Type": mimeType } });
    }

    // 全局根目录列表（GET /api/root/files）：只读，列 PROJECTS_ROOT 一级项目目录。
    // 进入项目子目录后客户端切到 project-scoped files API（含写）。
    if (url.pathname === "/api/root/files" && request.method === "GET" && projectFilesService) {
      const response = await projectFilesService.listRootFiles();
      return Response.json(response);
    }

    const projectFilesMatch = matchProjectFilesPath(url.pathname);

    if (
      projectFilesMatch &&
      request.method === "POST" &&
      projectFilesMatch.rename &&
      projectFilesService
    ) {
      const body = (await request.json()) as { path?: string; name?: string };

      if (typeof body.path !== "string" || body.path.length === 0) {
        return jsonError("PROJECT_TARGET_INVALID", "File path is required", 400);
      }

      if (typeof body.name !== "string" || body.name.length === 0) {
        return jsonError("PROJECT_NAME_INVALID", "File name is required", 400);
      }

      const response = await projectFilesService.renameFile(
        projectFilesMatch.projectName,
        body.path,
        body.name,
      );
      return Response.json(response);
    }

    if (
      projectFilesMatch &&
      request.method === "POST" &&
      projectFilesMatch.save &&
      projectFilesService
    ) {
      const body = (await request.json()) as { path?: string; content?: string };

      if (typeof body.path !== "string" || body.path.length === 0) {
        return jsonError("PROJECT_TARGET_INVALID", "File path is required", 400);
      }

      if (typeof body.content !== "string") {
        return jsonError("PROJECT_TARGET_INVALID", "File content is required", 400);
      }

      const response = await projectFilesService.saveFile(
        projectFilesMatch.projectName,
        body.path,
        body.content,
      );
      return Response.json(response);
    }

    if (
      projectFilesMatch &&
      request.method === "POST" &&
      projectFilesMatch.delete &&
      projectFilesService
    ) {
      const body = (await request.json()) as { path?: string };

      if (typeof body.path !== "string" || body.path.length === 0) {
        return jsonError("PROJECT_TARGET_INVALID", "File path is required", 400);
      }

      const response = await projectFilesService.deleteFile(
        projectFilesMatch.projectName,
        body.path,
      );
      return Response.json(response);
    }

    if (
      projectFilesMatch &&
      request.method === "POST" &&
      projectFilesMatch.mkdir &&
      projectFilesService
    ) {
      const body = (await request.json()) as { name?: string };

      if (typeof body.name !== "string" || body.name.length === 0) {
        return jsonError("PROJECT_NAME_INVALID", "Folder name is required", 400);
      }

      const response = await projectFilesService.createFolder(
        projectFilesMatch.projectName,
        url.searchParams.get("path") ?? "",
        body.name,
      );
      return Response.json(response);
    }

    if (
      projectFilesMatch &&
      request.method === "POST" &&
      projectFilesMatch.upload &&
      projectFilesService
    ) {
      const formData = await request.formData();
      const file = formData.get("file");

      if (!file || !(file instanceof File)) {
        return jsonError("PROJECT_TARGET_INVALID", "File is required", 400);
      }

      const content = Buffer.from(await file.arrayBuffer());
      const response = await projectFilesService.uploadFile(
        projectFilesMatch.projectName,
        url.searchParams.get("path") ?? "",
        file.name,
        content,
      );
      return Response.json(response);
    }

    if (projectFilesMatch && request.method === "GET" && projectFilesService) {
      const response = projectFilesMatch.preview
        ? await projectFilesService.previewFile(
            projectFilesMatch.projectName,
            url.searchParams.get("path") ?? "",
          )
        : await projectFilesService.listFiles(
            projectFilesMatch.projectName,
            url.searchParams.get("path") ?? "",
          );
      return Response.json(response);
    }

    if (url.pathname.startsWith("/api/projects/") && request.method === "DELETE") {
      const encodedName = url.pathname.slice("/api/projects/".length);
      const projectName = decodeProjectName(encodedName);

      if (!projectName) {
        return jsonError("PROJECT_NAME_INVALID", "Project name is invalid", 400);
      }

      const response: DeleteProjectResponse = await projectService.deleteProject(projectName);
      return Response.json(response);
    }

    if (url.pathname.startsWith("/api/projects/") && request.method === "GET") {
      const encodedName = url.pathname.slice("/api/projects/".length);
      const projectName = decodeProjectName(encodedName);

      if (!projectName) {
        return jsonError("PROJECT_NAME_INVALID", "Project name is invalid", 400);
      }

      const response: ProjectDetailResponse = {
        project: await projectService.getProject(projectName),
      };
      return Response.json(response);
    }
  } catch (error) {
    if (error instanceof ProjectGitDiffError) {
      return projectGitDiffErrorResponse(error);
    }

    if (error instanceof ProjectFilesError) {
      return projectFilesErrorResponse(error);
    }

    if (error instanceof ProjectServiceError) {
      return projectErrorResponse(error);
    }

    throw error;
  }

  return undefined;
};

// GET/PUT /api/projects/{name}/pages/config — pages 静态根配置（鉴权敏感，已在统一守卫后）。
const handlePagesConfig = async (
  request: Request,
  url: URL,
  projectPagesService: ProjectPagesService,
): Promise<Response | undefined> => {
  const match = matchProjectPagesPath(url.pathname);
  if (!match || !match.isConfig) return undefined;

  try {
    if (request.method === "GET") {
      const config = await projectPagesService.readConfig(match.projectName);
      const response: PagesConfigResponse = { config };
      return Response.json(response);
    }

    if (request.method === "PUT") {
      let body: { roots?: unknown };
      try {
        body = (await request.json()) as { roots?: unknown };
      } catch {
        return jsonError("PROJECT_PAGES_CONFIG_INVALID", "Request body must be JSON", 400);
      }
      if (!Array.isArray(body.roots)) {
        return jsonError("PROJECT_PAGES_CONFIG_INVALID", "roots must be an array", 400);
      }
      const config = await projectPagesService.writeConfig(match.projectName, body.roots);
      const response: UpdatePagesConfigResponse = { config };
      return Response.json(response);
    }

    return undefined;
  } catch (error) {
    if (error instanceof ProjectPagesError) {
      return projectPagesErrorResponse(error);
    }
    throw error;
  }
};

const readCreateProjectRequest = async (request: Request): Promise<CreateProjectRequest> => {
  try {
    return (await request.json()) as CreateProjectRequest;
  } catch {
    return {};
  }
};

const decodeProjectName = (encodedName: string) => {
  try {
    return decodeURIComponent(encodedName);
  } catch {
    return undefined;
  }
};

type ProjectPagesPathMatch = {
  projectName: string;
  /** 请求的 URL 路径（含前导 "/"，根为 "/"），供 serve 匹配根。 */
  urlPath: string;
  /** 命中 /pages/config 固定端点（鉴权敏感，走守卫后 handler）。 */
  isConfig: boolean;
};

// 匹配 /api/projects/{name}/pages{/*urlPath} 与 /api/projects/{name}/pages/config。
// project 段 encode + 强制不含 "/"；urlPath 段 splat 解码，无后续段时为 "/"。
// config 是固定 suffix，单独置 isConfig=true。
const matchProjectPagesPath = (pathname: string): ProjectPagesPathMatch | undefined => {
  const prefix = "/api/projects/";
  if (!pathname.startsWith(prefix)) return undefined;
  const rest = pathname.slice(prefix.length);
  const infix = "/pages";
  const idx = rest.indexOf(infix);
  if (idx === -1) return undefined;
  const encodedName = rest.slice(0, idx);
  if (encodedName.length === 0 || encodedName.includes("/")) return undefined;
  const projectName = decodeProjectName(encodedName);
  if (!projectName) return undefined;

  let tail = rest.slice(idx + infix.length);
  // tail: "" (根, /pages)、"/config"、"/docs/x" 等。
  if (tail.length === 0) {
    return { projectName, urlPath: "/", isConfig: false };
  }
  let decodedTail: string;
  try {
    decodedTail = decodeURIComponent(tail);
  } catch {
    return undefined;
  }
  if (decodedTail === "/config") {
    return { projectName, urlPath: "/config", isConfig: true };
  }
  return { projectName, urlPath: decodedTail, isConfig: false };
};

type ProjectWikiPathMatch = {
  projectName: string;
  slug?: string; // undefined = /wiki(列表);有值 = /wiki/{slug}(读单页)
};

/**
 * 匹配 /api/projects/{name}/wiki(列表)与 /api/projects/{name}/wiki/{slug}(读单页)。
 * project 段 encode + 不含 "/";slug 段 encode + 不含 "/"(flat 目录,首期 slug 无子路径)。
 * slug 语义校验(sanitizeWikiSlug)留给 ProjectWikiService,路由只做 URL 结构校验。
 */
const matchProjectWikiPath = (pathname: string): ProjectWikiPathMatch | undefined => {
  const prefix = "/api/projects/";
  if (!pathname.startsWith(prefix)) return undefined;
  const rest = pathname.slice(prefix.length);
  const infix = "/wiki";
  const idx = rest.indexOf(infix);
  if (idx === -1) return undefined;
  const encodedName = rest.slice(0, idx);
  if (encodedName.length === 0 || encodedName.includes("/")) return undefined;
  const projectName = decodeProjectName(encodedName);
  if (!projectName) return undefined;

  const tail = rest.slice(idx + infix.length);
  if (tail.length === 0) {
    return { projectName }; // /wiki → 列表
  }
  // tail 形如 "/{slug}":必须以 "/" 开头,slug 段不含 "/"。
  if (!tail.startsWith("/")) return undefined;
  const encodedSlug = tail.slice(1);
  if (encodedSlug.length === 0 || encodedSlug.includes("/")) return undefined;
  try {
    return { projectName, slug: decodeURIComponent(encodedSlug) };
  } catch {
    return undefined;
  }
};

const projectWikiErrorResponse = (error: ProjectWikiError) => {
  if (error.code === "PROJECT_NOT_FOUND" || error.code === "PROJECT_FILE_NOT_FOUND") {
    return jsonError(error.code, error.message, 404);
  }

  if (error.code === "PROJECT_FS_ERROR") {
    return jsonError(error.code, error.message, 500);
  }

  // PATH_OUTSIDE_ROOT(symlink 逃逸)、WIKI_SLUG_INVALID、PROJECT_NAME_INVALID、
  // PROJECT_TARGET_INVALID → 400。(HTTP consumer 只读,TARGET_EXISTS 不会到这里。)
  return jsonError(error.code, error.message, 400);
};

// GET /api/projects/{name}/wiki        → list pages({ pages: [...] })
// GET /api/projects/{name}/wiki/{slug} → read page(WikiPage)
// 写只经 MCP 工具(agent producer);HTTP consumer 只读。已在统一 token 守卫后。
const handleWikiRoute = async (
  request: Request,
  url: URL,
  projectWikiService: ProjectWikiService,
): Promise<Response | undefined> => {
  if (request.method !== "GET") return undefined;
  const match = matchProjectWikiPath(url.pathname);
  if (!match) return undefined;

  try {
    if (match.slug === undefined) {
      const pages = await projectWikiService.listPages(match.projectName);
      return Response.json({ pages } satisfies WikiIndexResponse);
    }
    const page = await projectWikiService.readPage(match.projectName, match.slug);
    return Response.json(page);
  } catch (error) {
    if (error instanceof ProjectWikiError) {
      return projectWikiErrorResponse(error);
    }
    throw error;
  }
};

type ProjectGitDiffPathMatch = {
  projectName: string;
  kind: "file" | "diff" | "branches" | "log" | "aheadBehind" | "compare" | "compareFile";
};

const matchProjectGitDiffPath = (pathname: string): ProjectGitDiffPathMatch | undefined => {
  const prefix = "/api/projects/";

  if (!pathname.startsWith(prefix)) {
    return undefined;
  }

  const rest = pathname.slice(prefix.length);
  // 长 suffix 在前（/git/diff/file 先于 /git/diff），避免短 suffix 误匹配前缀。
  const suffixes: { suffix: string; kind: ProjectGitDiffPathMatch["kind"] }[] = [
    { suffix: "/git/compare/file", kind: "compareFile" },
    { suffix: "/git/compare", kind: "compare" },
    { suffix: "/git/diff/file", kind: "file" },
    { suffix: "/git/diff", kind: "diff" },
    { suffix: "/git/branches", kind: "branches" },
    { suffix: "/git/log", kind: "log" },
    { suffix: "/git/ahead-behind", kind: "aheadBehind" },
  ];
  const matched = suffixes.find((entry) => rest.endsWith(entry.suffix));

  if (!matched) {
    return undefined;
  }

  const encodedName = rest.slice(0, -matched.suffix.length);

  if (encodedName.length === 0 || encodedName.includes("/")) {
    return undefined;
  }

  const projectName = decodeProjectName(encodedName);

  if (!projectName) {
    return undefined;
  }

  return { projectName, kind: matched.kind };
};

type ProjectFilesPathMatch = {
  projectName: string;
  delete: boolean;
  mkdir: boolean;
  preview: boolean;
  rename: boolean;
  save: boolean;
  upload: boolean;
};

const matchProjectFilesPath = (pathname: string): ProjectFilesPathMatch | undefined => {
  const prefix = "/api/projects/";

  if (!pathname.startsWith(prefix)) {
    return undefined;
  }

  const suffix = pathname.slice(prefix.length);
  const renameSuffix = "/files/rename";
  const deleteSuffix = "/files/delete";
  const mkdirSuffix = "/files/mkdir";
  const uploadSuffix = "/files/upload";
  const previewSuffix = "/files/preview";
  const saveSuffix = "/files/save";
  const filesSuffix = "/files";
  const encodedName = suffix.endsWith(renameSuffix)
    ? suffix.slice(0, -renameSuffix.length)
    : suffix.endsWith(deleteSuffix)
      ? suffix.slice(0, -deleteSuffix.length)
      : suffix.endsWith(mkdirSuffix)
        ? suffix.slice(0, -mkdirSuffix.length)
        : suffix.endsWith(uploadSuffix)
          ? suffix.slice(0, -uploadSuffix.length)
          : suffix.endsWith(previewSuffix)
            ? suffix.slice(0, -previewSuffix.length)
            : suffix.endsWith(saveSuffix)
              ? suffix.slice(0, -saveSuffix.length)
              : suffix.endsWith(filesSuffix)
                ? suffix.slice(0, -filesSuffix.length)
                : undefined;

  if (encodedName === undefined || encodedName.length === 0 || encodedName.includes("/")) {
    return undefined;
  }

  const projectName = decodeProjectName(encodedName);

  if (!projectName) {
    return undefined;
  }

  return {
    projectName,
    delete: suffix.endsWith(deleteSuffix),
    mkdir: suffix.endsWith(mkdirSuffix),
    preview: suffix.endsWith(previewSuffix),
    rename: suffix.endsWith(renameSuffix),
    save: suffix.endsWith(saveSuffix),
    upload: suffix.endsWith(uploadSuffix),
  };
};

type ProjectFilesRawPathMatch = {
  projectName: string;
  filePath: string;
};

const matchProjectFilesRawPath = (pathname: string): ProjectFilesRawPathMatch | undefined => {
  const prefix = "/api/projects/";

  if (!pathname.startsWith(prefix)) {
    return undefined;
  }

  const suffix = pathname.slice(prefix.length);
  const rawInfix = "/files/raw/";
  const rawIdx = suffix.indexOf(rawInfix);

  if (rawIdx === -1) {
    return undefined;
  }

  const encodedName = suffix.slice(0, rawIdx);

  if (encodedName.length === 0 || encodedName.includes("/")) {
    return undefined;
  }

  const projectName = decodeProjectName(encodedName);

  if (!projectName) {
    return undefined;
  }

  const filePath = decodeURIComponent(suffix.slice(rawIdx + rawInfix.length));

  return { projectName, filePath };
};

const projectGitDiffErrorResponse = (error: ProjectGitDiffError) => {
  if (error.code === "PROJECT_NOT_FOUND") {
    return jsonError(error.code, error.message, 404);
  }

  if (error.code === "PROJECT_GIT_NOT_REPOSITORY") {
    return jsonError(error.code, error.message, 400);
  }

  if (error.code === "PROJECT_GIT_UNAVAILABLE" || error.code === "PROJECT_FS_ERROR") {
    return jsonError(error.code, error.message, 500);
  }

  return jsonError(error.code, error.message, 400);
};

const projectFilesErrorResponse = (error: ProjectFilesError) => {
  if (error.code === "PROJECT_NOT_FOUND" || error.code === "PROJECT_FILE_NOT_FOUND") {
    return jsonError(error.code, error.message, 404);
  }

  if (
    error.code === "PROJECT_FS_ERROR" ||
    error.code === "PROJECT_FILE_UPLOAD_FAILED" ||
    error.code === "PROJECT_FILE_UPLOAD_TOO_LARGE" ||
    error.code === "PROJECT_FILE_RENAME_FAILED" ||
    error.code === "PROJECT_FILE_DELETE_FAILED" ||
    error.code === "PROJECT_FILE_SAVE_FAILED"
  ) {
    return jsonError(error.code, error.message, 500);
  }

  if (error.code === "PROJECT_FILE_TARGET_EXISTS") {
    return jsonError(error.code, error.message, 409);
  }

  return jsonError(error.code, error.message, 400);
};

const projectPagesErrorResponse = (error: ProjectPagesError) => {
  if (error.code === "PROJECT_NOT_FOUND" || error.code === "PROJECT_FILE_NOT_FOUND") {
    return jsonError(error.code, error.message, 404);
  }

  if (error.code === "PROJECT_FS_ERROR") {
    return jsonError(error.code, error.message, 500);
  }

  // PATH_OUTSIDE_ROOT（含 symlink 逃逸）、PAGES_CONFIG_INVALID、PAGES_ROOT_CONFLICT、
  // PROJECT_NAME_INVALID、PROJECT_TARGET_INVALID → 400。
  return jsonError(error.code, error.message, 400);
};

const projectErrorResponse = (error: ProjectServiceError) => {
  if (error.code === "PROJECT_NOT_FOUND") {
    return jsonError(error.code, error.message, 404);
  }

  if (error.code === "PROJECT_CONFLICT") {
    return jsonError(error.code, error.message, 409);
  }

  if (error.code === "PROJECT_FS_ERROR" || error.code === "PROJECT_DELETE_FAILED") {
    return jsonError(error.code, error.message, 500);
  }

  return jsonError(error.code, error.message, 400);
};

const sessionNamePrefix = process.env.AGENTS_REMOTE_SESSION_PREFIX ?? "ar";
const isClaudeSessionName = (sessionName: string) =>
  // 旧前缀 ar-agent-claude2- 兼容：claude2 → claude 改名后存量会话的 runtimeKey 仍是旧段，
  // 靠此分支保持 attach/close 可达（新会话统一新前缀）。
  sessionName.startsWith(`${sessionNamePrefix}-agent-claude-`) ||
  sessionName.startsWith(`${sessionNamePrefix}-agent-claude2-`);

export const startApi = async () => {
  const config = await loadConfig();
  const runtimePaths = await ensureRuntimeDir(resolveRuntimePaths());

  const tokenSecretPath = join(runtimePaths.runDir, "token-secret");
  let tokenSecret: string;
  try {
    tokenSecret = await readFile(tokenSecretPath, "utf8");
  } catch {
    tokenSecret = randomBytes(32).toString("base64url");
    await writeFile(tokenSecretPath, tokenSecret, { mode: 0o600 });
  }

  const auth = new AuthService({
    appPassword: config.appPassword,
    tokenSecret,
    tokenTtlMs: config.tokenTtlHours * 3600 * 1000,
  });
  await migrateLegacyUserFiles();
  const settingsStore = new SettingsStore();
  const stateStore = new StateStore();
  const tmuxRuntime = new TmuxRuntime(runtimePaths.runDir);
  const agentRuntime = new AgentRuntime(tmuxRuntime);
  const claudeRuntime = new ClaudeRuntime(runtimePaths.runDir, settingsStore, config.mcpPort);
  const projectWikiService = new ProjectWikiService(config.projectsRoot);
  // MCP hub:无状态 Streamable HTTP server,绑 127.0.0.1,只给本机 agent 用。
  // 起 hub 后,spawn agent 时 --mcp-config 注入 http://127.0.0.1:{mcpPort}/mcp/{project}。
  const mcpHub = startMcpHubServer({
    port: config.mcpPort,
    projectsRoot: config.projectsRoot,
    wikiService: projectWikiService,
  });
  const claudePermissionModes = await parseClaudePermissionModes();
  console.log(`[startup] Claude permission modes: ${claudePermissionModes.join(", ")}`);
  const runtime: RuntimeResources = {
    exists: async (sessionName) => {
      if (isClaudeSessionName(sessionName)) return claudeRuntime.exists(sessionName);
      return tmuxRuntime.exists(sessionName);
    },
    close: async (sessionName) => {
      if (isClaudeSessionName(sessionName)) {
        return claudeRuntime.close(sessionName);
      }
      return tmuxRuntime.close(sessionName);
    },
    startAgent: (metadata) => {
      if (metadata.provider === "claude") {
        return claudeRuntime.startAgent(metadata);
      }
      return agentRuntime.startAgent(metadata);
    },
    startTerminal: (metadata) => tmuxRuntime.startTerminal(metadata),
    capture: (sessionName) => tmuxRuntime.capture(sessionName),
    attach: (sessionName, onData, onError, opts) =>
      tmuxRuntime.attach(sessionName, onData, onError, opts),
    // 批量探活：合并 tmux list-sessions（terminal + 非 claude agent）与 claude 进程内存活集合。
    // 1 次 list-sessions + 1 次进程内遍历，替代 M 次 has-session。供 SessionRegistry.getAliveKeys。
    listAliveRuntimeKeys: async () => {
      const [tmuxKeys, claudeKeys] = await Promise.all([
        tmuxRuntime.listAliveRuntimeKeys(),
        claudeRuntime.listAliveRuntimeKeys(),
      ]);
      return new Set([...tmuxKeys, ...claudeKeys]);
    },
  };
  const sessionRegistry = new SessionRegistry({ runDir: runtimePaths.runDir, runtime });
  // chat 会话元数据持久目录：~/.agents-remote/chat-sessions/（跨重启保留，非 tmpfs runDir；
  // 与 pi SessionManager JSONL 历史同持久语义，设计 docs/design/workbench-views.md §3.1）。
  const chatSessionsDir = resolve(homedir(), ".agents-remote/chat-sessions");
  const chatSessionRegistry = new ChatSessionRegistry({ sessionsDir: chatSessionsDir });
  const streamController = new SessionStreamController(runtime, sessionRegistry);
  const claudeStreamController = new ClaudeStreamController(
    claudeRuntime,
    runtime,
    sessionRegistry,
  );
  // pi chat 运行时：进程内 AgentSession，懒启动（首次 WS open）。cwd=PROJECTS_ROOT，
  // agentDir 隔离在 ~/.agents-remote/pi-agent（决策 7/9）。apiKey 内存覆盖不落盘。
  const piRuntime = new PiRuntime({
    settingsStore,
    baseDir: resolve(homedir(), ".agents-remote"),
    chatSessionsDir,
    defaultCwd: config.projectsRoot,
  });
  const piStreamController = new PiStreamController(piRuntime, chatSessionRegistry);

  claudeRuntime.setOnSystemInit((sessionId, _runtimeKey, claudeSessionId, model) => {
    void sessionRegistry.setClaudeSessionId(sessionId, claudeSessionId, model);
  });
  claudeRuntime.setOnModelChange((sessionId, model) => {
    void sessionRegistry.setModel(sessionId, model);
  });
  claudeRuntime.setOnPermissionModeChange((sessionId, permissionMode) => {
    void sessionRegistry.setPermissionMode(sessionId, permissionMode);
  });
  // Post-hook for /reload-skills: on a successful reload, broadcast
  // skill_catalog_changed to current subscribers so clients invalidate + re-fetch
  // the REST catalog. Broadcast-only (no payload) — the client's REST fetch is
  // authoritative, so the server needn't re-scan here. See docs/design/
  // message-replay.md 「命令后置处理框架」.
  claudeRuntime.setOnSkillReload((sessionName) => {
    claudeRuntime.injectServerLine(
      sessionName,
      JSON.stringify({ type: "system", subtype: "skill_catalog_changed" }),
    );
  });
  // 真实新 stdout 行 → bump updatedAt（「上次活跃时间」）。recordActivity 分钟截断，同分钟短路。
  claudeRuntime.setOnActivity((sessionId) => {
    void sessionRegistry.recordActivity(sessionId);
  });
  // pi 事件流 → 元数据同步：piSessionId backfill（幂等只写一次）+ 活动 bump updatedAt（分钟截断）。
  piRuntime.setOnPiSessionId((chatId, piSessionId) => {
    chatSessionRegistry.setPiSessionId(chatId, piSessionId);
  });
  piRuntime.setOnActivity((chatId) => {
    void chatSessionRegistry.recordActivityChat(chatId);
  });
  // LLM 标题落盘（首条 user 消息后一次性生成）：默认名守卫——用户手动改名的会话不覆盖。
  piRuntime.setOnTitle((chatId, title) => {
    void (async () => {
      const session = await chatSessionRegistry.getChatSession(chatId);
      if (session && session.displayName === DEFAULT_CHAT_TITLE) {
        chatSessionRegistry.setChatTitle(chatId, title);
      }
    })();
  });
  // closeChatSession → 销毁进程内 AgentSession + 清理 pi JSONL。hook 失败仅 warn，不阻塞元数据清理。
  chatSessionRegistry.setCloseHook(async (chatId) => {
    await piRuntime.close(chatId);
    await piRuntime.removeSessionFiles(chatId);
  });
  const projectService = new ProjectService(config.projectsRoot, sessionRegistry);
  const projectFilesService = new ProjectFilesService(config.projectsRoot);
  const projectPagesService = new ProjectPagesService(config.projectsRoot);
  const projectGitDiffService = new ProjectGitDiffService(config.projectsRoot);
  // 全局 idleTimeout：MCP 同步 spawn（mcp-management runCliTool 默认 60s）静默期需覆盖，
  // 默认 10s 会在中途关闭连接（Empty reply）。调到 Bun.serve 上限 255s。
  // skill install/update 已异步化（POST 立即返 202 + 后台 spawn），其 SSE 进度流用
  // per-request server.timeout(req,0) 自给自足（skill-tasks.ts），不再依赖此全局值。
  // 完整撤除此 hack 待 MCP 也异步化。list/preview 已 FS 直读（~0.1s）不受影响。
  const SKILL_REQUEST_IDLE_TIMEOUT_SECONDS = 255;
  const server = Bun.serve<WebSocketData>({
    port: config.apiPort,
    idleTimeout: SKILL_REQUEST_IDLE_TIMEOUT_SECONDS,
    fetch: createFetchHandler(auth, {
      claudeRuntime,
      claudeStreamController,
      piStreamController,
      projectFilesService,
      projectPagesService,
      projectWikiService,
      projectGitDiffService,
      projectService,
      projectsRoot: config.projectsRoot,
      sessionRegistry,
      chatSessionRegistry,
      settingsStore,
      stateStore,
    }),
    websocket: {
      open(ws) {
        if (ws.data?.kind === "session-stream") {
          void streamController.open(ws);
        }
        if (ws.data?.kind === "claude-stream") {
          claudeStreamController.open(ws).catch((err) => {
            console.error("[claude-stream] open handler error", err);
          });
        }
        if (ws.data?.kind === "pi-stream") {
          piStreamController.open(ws).catch((err) => {
            console.error("[pi-stream] open handler error", err);
          });
        }
      },
      message(ws, message) {
        const raw = message.toString().slice(0, 120);
        console.log(`[ws] message kind=${ws.data?.kind ?? "none"} raw=${raw}`);
        if (ws.data?.kind === "session-stream") {
          void streamController.message(ws, message);
          return;
        }
        if (ws.data?.kind === "claude-stream") {
          void claudeStreamController.message(ws, message);
          return;
        }
        if (ws.data?.kind === "pi-stream") {
          void piStreamController.message(ws, message);
          return;
        }

        ws.send(message);
      },
      close(ws) {
        if (ws.data?.kind === "session-stream") {
          streamController.close(ws);
        }
        if (ws.data?.kind === "claude-stream") {
          claudeStreamController.close(ws);
        }
        if (ws.data?.kind === "pi-stream") {
          piStreamController.close(ws);
        }
      },
    },
  });

  console.log(`api listening on http://localhost:${server.port}`);
  console.log(`api runtime dir ${runtimePaths.runDir}`);
  console.log(`mcp hub listening on http://127.0.0.1:${mcpHub.port}/mcp/{project}`);

  return server;
};

if (import.meta.main) {
  try {
    await startApi();
  } catch (error) {
    if (error instanceof StartupError) {
      console.error(`${error.code}: ${error.message}`);
      process.exit(1);
    }

    throw error;
  }
}
