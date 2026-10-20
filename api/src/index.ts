import type {
  AgentSessionStatus,
  ApprovalRespondRequest,
  AutoRetryStatusResponse,
  CreateProjectRequest,
  CreateProjectResponse,
  DeleteProjectResponse,
  HealthResponse,
  OverviewResponse,
  OverviewSubtitlesResponse,
  PagesConfigResponse,
  ProjectDetailResponse,
  ProjectListResponse,
  RenameProjectResponse,
  UpdatePagesConfigResponse,
  WikiIndexResponse,
  WikiSearchResponse,
} from "@agents-remote/shared";
import type { TerminalSessionStatus } from "@agents-remote/shared";
import type { UploadConflictPolicy } from "@agents-remote/shared";
import { AgentRuntime } from "./agent-runtime";
import { AcpRuntime, resolveAcpCredentials } from "./acp-runtime";
import { AcpStreamController, handleAcpStreamUpgrade } from "./acp-stream";
import { AuthService } from "./auth";
import { ApprovalCenter } from "./approval-center";
import { ClaudeRuntime } from "./claude-runtime";
import { getAgentProviderProfile, parseClaudePermissionModes } from "./agent-provider-profiles";
import { ClaudeStreamController, handleClaudeStreamUpgrade } from "./claude-stream";
import { AgentTuiController, type AgentTuiStatusContext } from "./agent-tui";
import {
  applyAuthRefresh,
  handleAuthMe,
  handleLogin,
  handleLogout,
  jsonError,
  requireHttpAuth,
} from "./http-auth";
import { ProjectFilesService, ProjectFilesError } from "./project-files";
import { ProjectPagesError, ProjectPagesService } from "./project-pages";
import { ProjectGitDiffError, ProjectGitDiffService } from "./project-git-diff";
import { ProjectGitWriteError, ProjectGitWriteService } from "./project-git-write";
import { ProjectWikiError, ProjectWikiService } from "./project-wiki";
import { ProjectService, ProjectServiceError } from "./projects";
import type { ProjectStateManager } from "./projects";
import { listAgentHistory, paginateAgentHistory, parseHistoryFilter } from "./agent-history";
import { listOmpHistory } from "./omp-history";
import { resolveProjectPath } from "./project-paths";
import { readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { ensureRuntimeDir, resolveRuntimePaths } from "./runtime-dir";
import { handleSessionRoutes } from "./session-routes";
import { SessionRegistry, type RuntimeResources } from "./session-registry";
import { SessionShellHub } from "./session-shell-hub";
import { ChatSessionRegistry, DEFAULT_CHAT_TITLE } from "./chat-session-registry";
import { handleChatSessionRoutes } from "./chat-session-routes";
import { startChatIdleRecycler } from "./chat-idle-recycler";
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
import { PushKeyManager } from "./push-keys";
import { PushSubscriptionStore } from "./push-subscription-store";
import { PushNotifier } from "./push-notifier";
import { handlePushRoutes } from "./push-routes";
import { handleSkillRoutes } from "./skill-market";
import { handleSkillDisableRoutes } from "./skill-disable";
import { handleSkillUpdateRoutes } from "./skill-update";
import { handleSkillTaskEvents } from "./skill-tasks";
import { handleMcpRoutes } from "./mcp-management";
import { handleMcpMarketRoutes } from "./mcp-market";
import { HUB_UI_RESOURCES, startMcpHubServer, wikiPageStructuredContent } from "./mcp-hub-server";
import { readProjectMcpConfig } from "./mcp-config";
import { canUpgradeWebSocket } from "./ws-auth";

type UpgradeServer = {
  upgrade(request: Request, options?: { data?: WebSocketData }): boolean;
  // Bun Server.timeout：SSE 端点禁用 per-connection idle 超时（skill-tasks handleSkillTaskEvents 用）。
  timeout(request: Request, seconds: number): unknown;
};

type FetchHandlerOptions = {
  claudeRuntime?: ClaudeRuntime;
  claudeStreamController?: ClaudeStreamController;
  approvalCenter?: ApprovalCenter;
  sessionShellHub?: SessionShellHub;
  agentTui?: AgentTuiController;
  acpStreamController?: AcpStreamController;
  piStreamController?: PiStreamController;
  projectFilesService?: ProjectFilesService;
  projectPagesService?: ProjectPagesService;
  projectWikiService?: ProjectWikiService;
  projectGitDiffService?: ProjectGitDiffService;
  projectGitWriteService?: ProjectGitWriteService;
  projectService?: ProjectService;
  projectsRoot?: string;
  sessionRegistry?: SessionRegistry;
  chatSessionRegistry?: ChatSessionRegistry;
  settingsStore?: SettingsStore;
  stateStore?: StateStore;
  pushKeys?: PushKeyManager;
  pushSubscriptions?: PushSubscriptionStore;
};

type WebSocketData =
  | {
      kind: "echo";
    }
  | {
      kind: "approvals-stream";
    }
  | {
      kind: "sessions-stream";
    }
  | {
      kind: "session-stream";
      sessionType: "agent" | "terminal";
      projectName: string;
      sessionId: string;
      runtimeKey: string;
      status: AgentSessionStatus | TerminalSessionStatus;
    }
  | {
      kind: "claude-stream";
      sessionType: "agent";
      projectName: string;
      sessionId: string;
      runtimeKey: string;
      status: AgentSessionStatus;
    }
  | {
      kind: "pi-stream";
      chatId: string;
    }
  | {
      kind: "acp-stream";
      sessionId: string;
      runtimeKey: string;
      projectPath: string;
      acpSessionId?: string;
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

    if (url.pathname === "/api/auth/logout" && request.method === "POST") {
      return handleLogout();
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

    // 【临时诊断端点——composer 抬高 bug 取证用（2026-10-19），定案后随前端角标
    // （use-composer-inset-debug-badge.ts）一起拆。收 PWA 端 visualViewport / composer
    // offset 哨兵记录，仅打服务端日志不落盘。】
    if (url.pathname === "/api/debug/inset-report" && request.method === "POST") {
      const body: unknown = await request.json().catch(() => null);
      if (!Array.isArray(body)) {
        return new Response("expected JSON array", { status: 400 });
      }
      console.warn("[inset-debug]", JSON.stringify(body).slice(0, 4096));
      return withRefresh(Response.json({ ok: true }));
    }

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
      const skillDisableResponse = await handleSkillDisableRoutes(request, url, {
        settingsStore: options.settingsStore,
        claudeRuntime: options.claudeRuntime,
        projectsRoot: options.projectsRoot,
      });
      if (skillDisableResponse) {
        return withRefresh(skillDisableResponse);
      }
      if (options.pushKeys && options.pushSubscriptions) {
        const pushResponse = await handlePushRoutes(request, url, {
          keys: options.pushKeys,
          subscriptions: options.pushSubscriptions,
        });
        if (pushResponse) {
          return withRefresh(pushResponse);
        }
      }
    }

    // skill install/update 异步任务的 SSE 进度流（不依赖 settingsStore，只需 registry + server）。
    const taskEventsResponse = await handleSkillTaskEvents(request, url, server);
    if (taskEventsResponse) {
      return withRefresh(taskEventsResponse);
    }

    const mcpMarketResponse = await handleMcpMarketRoutes(request, url);
    if (mcpMarketResponse) {
      return withRefresh(mcpMarketResponse);
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

    // approvals-stream upgrade（approvals 频道全局无项目作用域，鉴权同 /api/ws/echo）。
    if (options.approvalCenter) {
      const approvalsUpgrade = options.approvalCenter.handleUpgrade(request, auth, server);
      if (approvalsUpgrade.matched) {
        return withRefresh(approvalsUpgrade.response);
      }
    }

    // sessions-stream upgrade（会话壳频道，全局无项目作用域，鉴权同 approvals-stream）。
    if (options.sessionShellHub) {
      const sessionsUpgrade = options.sessionShellHub.handleUpgrade(request, auth, server);
      if (sessionsUpgrade.matched) {
        return withRefresh(sessionsUpgrade.response);
      }
    }

    if (options.projectsRoot && options.sessionRegistry) {
      if (options.approvalCenter) {
        // M5-b 审批中心（docs/design/redesign-v2.md §6.4）：全局快照 + 应答。respond 的项目名
        // 先过 resolveProjectPath（PROJECTS_ROOT 不逃逸，与 upgrade 同款守卫）——注册表内记录
        // 只信 metadata 落下的 projectName，外部输入不作为查询键的信任来源。
        if (url.pathname === "/api/approvals" && request.method === "GET") {
          return withRefresh(Response.json({ approvals: await options.approvalCenter.snapshot() }));
        }
        if (url.pathname === "/api/approvals/respond" && request.method === "POST") {
          const body = (await request
            .json()
            .catch(() => null)) as Partial<ApprovalRespondRequest> | null;
          const projectName = typeof body?.projectName === "string" ? body.projectName : "";
          const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
          const controlRequestId =
            typeof body?.controlRequestId === "string" ? body.controlRequestId : "";
          const decision = body?.decision;
          if (
            projectName.length === 0 ||
            sessionId.length === 0 ||
            controlRequestId.length === 0 ||
            (decision !== "allow" && decision !== "deny")
          ) {
            return withRefresh(
              jsonError("PROJECT_NAME_INVALID", "Invalid approval response payload", 400),
            );
          }
          try {
            await resolveProjectPath(options.projectsRoot, projectName);
          } catch {
            return withRefresh(jsonError("PROJECT_NOT_FOUND", "Project not found", 404));
          }
          const result = await options.approvalCenter.respond({
            projectName,
            sessionId,
            controlRequestId,
            decision,
          });
          if (!result.delivered) {
            return withRefresh(
              jsonError(
                result.reason === "not_found" ? "SESSION_NOT_FOUND" : "SESSION_RUNTIME_MISSING",
                result.reason === "not_found"
                  ? "Approval request not found"
                  : "Session runtime is not running",
                result.reason === "not_found" ? 404 : 409,
              ),
            );
          }
          return withRefresh(Response.json(result));
        }
      }

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

        // D13 Wiki 注入（M4）：POST /api/projects/$key/sessions/$id/message —— REST 触发一次
        // user prompt（与 claude-stream WS user 帧同一管道，见 controller.injectUserPrompt）。
        // 项目名先过 resolveProjectPath（PROJECTS_ROOT 不逃逸，与 upgrade 同款守卫）。
        const injectMatch = url.pathname.match(
          /^\/api\/projects\/([^/]+)\/sessions\/(.+)\/message$/,
        );
        if (injectMatch && request.method === "POST") {
          const body = (await request.json().catch(() => null)) as {
            text?: unknown;
          } | null;
          const text = typeof body?.text === "string" ? body.text : "";
          if (text.trim().length === 0) {
            return withRefresh(
              jsonError("SESSION_TYPE_INVALID", "Prompt text must not be empty", 400),
            );
          }
          let project;
          try {
            project = await resolveProjectPath(
              options.projectsRoot,
              decodeURIComponent(injectMatch[1]!),
            );
          } catch {
            return withRefresh(jsonError("PROJECT_NOT_FOUND", "Project not found", 404));
          }
          const result = await options.claudeStreamController.injectUserPrompt(
            project.name,
            decodeURIComponent(injectMatch[2]!),
            text,
          );
          if (!result.delivered) {
            return withRefresh(
              jsonError(
                result.reason === "session_not_found"
                  ? "SESSION_NOT_FOUND"
                  : result.reason === "terminal_mode"
                    ? "SESSION_STATE_CONFLICT"
                    : "SESSION_TYPE_INVALID",
                result.reason === "session_not_found"
                  ? "Session not found"
                  : result.reason === "terminal_mode"
                    ? "Session is in terminal mode"
                    : "Prompt text must not be empty",
                // 404 = 会话不存在；409 = terminal 形态守卫（状态冲突）；400 = 其余
                //（empty_text 等请求自身非法——review P2-5：此前误并入 409）。
                result.reason === "session_not_found"
                  ? 404
                  : result.reason === "terminal_mode"
                    ? 409
                    : 400,
              ),
            );
          }
          return withRefresh(Response.json(result));
        }
      }

      if (options.acpStreamController) {
        const acpUpgrade = await handleAcpStreamUpgrade(
          request,
          url,
          options.projectsRoot,
          options.sessionRegistry,
          server,
        );

        if (acpUpgrade.matched) {
          return withRefresh(acpUpgrade.response);
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

      // 自动重试待发注入控制（M8 03d `.count` 取消/立即重试）。Direct match，不走
      // session-routes 白名单——需要 claudeRuntime（registry 不持 runtime）。terminal/omp
      // session 无 claude runtimeKey → 404，与 close/rename 的白名单语义一致。
      const autoRetryControlMatch = url.pathname.match(
        /^\/api\/projects\/(.+)\/agent-sessions\/(.+)\/auto-retry\/(status|cancel|fire)$/,
      );
      if (
        autoRetryControlMatch &&
        options.sessionRegistry &&
        options.claudeRuntime &&
        (request.method === "GET" || request.method === "POST")
      ) {
        const projectName = decodeURIComponent(autoRetryControlMatch[1]);
        const sessionId = decodeURIComponent(autoRetryControlMatch[2]);
        const action = autoRetryControlMatch[3];
        const runtimeKey = await options.sessionRegistry.getAgentRuntimeKey(projectName, sessionId);

        if (!runtimeKey) {
          return jsonError("SESSION_NOT_FOUND", "Agent session not found", 404);
        }

        const runtime = options.claudeRuntime;
        if (action === "status") {
          const pending = runtime.autoRetryPending(runtimeKey);
          const response: AutoRetryStatusResponse =
            pending === null
              ? { scheduled: false }
              : {
                  scheduled: true,
                  fireAt: pending.fireAt,
                  delayMs: pending.delayMs,
                  attempt: pending.attempt,
                  max: pending.max,
                };
          return withRefresh(Response.json(response));
        }
        if (request.method === "POST" && action === "cancel") {
          runtime.cancelAutoRetry(runtimeKey);
          return withRefresh(Response.json({ scheduled: false } satisfies AutoRetryStatusResponse));
        }
        if (request.method === "POST" && action === "fire") {
          const fired = await runtime.fireAutoRetryNow(runtimeKey);
          const response: AutoRetryStatusResponse = { scheduled: !fired };
          return withRefresh(Response.json(response));
        }
      }

      const sessionResponse = await handleSessionRoutes(
        request,
        url,
        options.projectsRoot,
        options.sessionRegistry,
        options.settingsStore,
        options.agentTui,
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
      const globalHistoryResponse = await handleGlobalAgentHistory(
        request,
        url,
        options.projectsRoot,
        options.projectService,
        options.sessionRegistry,
      );
      if (globalHistoryResponse) {
        return withRefresh(globalHistoryResponse);
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

    if (options.projectsRoot) {
      const uiResourceResponse = await handleMcpUiResourceRoute(request, url, options.projectsRoot);
      if (uiResourceResponse) {
        return withRefresh(uiResourceResponse);
      }
    }

    if (options.projectWikiService && options.projectsRoot) {
      const toolsCallResponse = await handleMcpHubToolsCallRoute(
        request,
        url,
        options.projectsRoot,
        options.projectWikiService,
      );
      if (toolsCallResponse) {
        return withRefresh(toolsCallResponse);
      }
    }

    if (options.projectService) {
      const projectResponse = await handleProjects(
        request,
        url,
        options.projectService,
        options.projectFilesService,
        options.projectGitDiffService,
        options.projectGitWriteService,
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

// GET /api/agent-history（v1.5 批5 全局作用域，iPad/Mac「全部」段）：跨项目历史统一列表——
// 枚举全部项目逐个 claude+omp 两路合流（预填 projectName 作行限定符），再统一分页。
// 单项目 fs 错误跳过（resolve/list 抛错 → 空条目），不拖垮全局列表。
const handleGlobalAgentHistory = async (
  request: Request,
  url: URL,
  projectsRoot: string | undefined,
  projectService: ProjectService,
  sessionRegistry: SessionRegistry,
): Promise<Response | undefined> => {
  if (!projectsRoot || url.pathname !== "/api/agent-history" || request.method !== "GET") {
    return undefined;
  }
  const projectNames = await projectService.listProjectNames();
  const perProject = await Promise.all(
    projectNames.map(async (name) => {
      try {
        const project = await resolveProjectPath(projectsRoot, name);
        const [claudeActiveMap, acpActiveMap] = await Promise.all([
          sessionRegistry.getActiveClaudeSessionMap(name),
          sessionRegistry.getActiveAcpSessionMap(name),
        ]);
        const [claudeEntries, ompEntries] = await Promise.all([
          listAgentHistory(project.path, claudeActiveMap, "all"),
          listOmpHistory(project.path, acpActiveMap, "all"),
        ]);
        return [...claudeEntries, ...ompEntries].map((e) => ({ ...e, projectName: name }));
      } catch {
        return [];
      }
    }),
  );
  const response = paginateAgentHistory(perProject.flat(), {
    filter: parseHistoryFilter(url.searchParams.get("filter")),
    search: url.searchParams.get("search") ?? "",
    cursor: url.searchParams.get("cursor") ?? "",
  });
  return Response.json(response);
};

const handleProjects = async (
  request: Request,
  url: URL,
  projectService: ProjectService,
  projectFilesService?: ProjectFilesService,
  projectGitDiffService?: ProjectGitDiffService,
  projectGitWriteService?: ProjectGitWriteService,
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

    const projectRenameMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/rename$/);
    if (projectRenameMatch && request.method === "POST") {
      const projectName = decodeProjectName(projectRenameMatch[1]);
      if (!projectName) {
        return jsonError("PROJECT_NAME_INVALID", "Project name is invalid", 400);
      }
      const body = (await readCreateProjectRequest(request)) as { name?: unknown };
      if (typeof body?.name !== "string" || body.name.trim().length === 0) {
        return jsonError("PROJECT_NAME_INVALID", "Project name is required", 400);
      }
      const response: RenameProjectResponse = {
        project: await projectService.renameProject(projectName, body.name),
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
      const hash = url.searchParams.get("hash");
      const response =
        kind === "commit"
          ? path
            ? await projectGitDiffService.getCommitFileDiff(projectName, hash, path)
            : await projectGitDiffService.getCommitDetail(projectName, hash)
          : kind === "file"
            ? await projectGitDiffService.fileDiff(
                projectName,
                url.searchParams.get("scope"),
                path,
                context,
              )
            : kind === "compareFile"
              ? await projectGitDiffService.compareFileDiff(
                  projectName,
                  base,
                  compare,
                  path,
                  context,
                )
              : kind === "compare"
                ? await projectGitDiffService.compareDiff(projectName, base, compare)
                : kind === "branches"
                  ? await projectGitDiffService.listBranches(projectName)
                  : kind === "log"
                    ? await projectGitDiffService.listCommits(
                        projectName,
                        branch,
                        // limit/offset 透传（M4：03m 最近提交 limit=3、03t 分页 limit=30）。
                        Number.parseInt(url.searchParams.get("limit") ?? "", 10) || undefined,
                        Number.parseInt(url.searchParams.get("offset") ?? "", 10) || 0,
                      )
                    : kind === "aheadBehind"
                      ? await projectGitDiffService.listAheadBehind(projectName, branch)
                      : await projectGitDiffService.listDiff(projectName);
      return Response.json(response);
    }

    // v1.4 批5 Git 写操作 gate（03m2 提交 / 03m3 放弃）：POST-only，与只读 GET gate
    // 分流——只读 8 suffix 语义不变，写路径独立校验 body。
    if (projectGitDiffMatch && request.method === "POST" && projectGitWriteService) {
      const { projectName, kind } = projectGitDiffMatch;

      if (kind === "commit") {
        const body = (await request.json().catch(() => null)) as {
          paths?: unknown;
          message?: unknown;
        } | null;
        if (
          !Array.isArray(body?.paths) ||
          typeof body?.message !== "string" ||
          !body.paths.every((p) => typeof p === "string")
        ) {
          return jsonError("PROJECT_TARGET_INVALID", "Invalid commit request payload", 400);
        }
        const commitResponse = await projectGitWriteService.commit(
          projectName,
          body.paths as string[],
          body.message,
        );
        return Response.json(commitResponse);
      }

      if (kind === "discard") {
        const body = (await request.json().catch(() => null)) as { paths?: unknown } | null;
        if (!Array.isArray(body?.paths) || !body.paths.every((p) => typeof p === "string")) {
          return jsonError("PROJECT_TARGET_INVALID", "Invalid discard request payload", 400);
        }
        const discardResponse = await projectGitWriteService.discard(
          projectName,
          body.paths as string[],
        );
        return Response.json(discardResponse);
      }
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

    // 根层上传（POST /api/root/files/upload，M8 10 pin④「上传到当前作用域」）：全局写边界
    // 仅此一路 + mkdir（= 创建项目，走 /api/projects）——rename/delete 等结构操作仍限项目内。
    if (
      url.pathname === "/api/root/files/upload" &&
      request.method === "POST" &&
      projectFilesService
    ) {
      const formData = await request.formData();
      const file = formData.get("file");

      if (!file || !(file instanceof File)) {
        return jsonError("PROJECT_TARGET_INVALID", "File is required", 400);
      }

      const conflict = normalizeUploadConflict(formData.get("conflict"));
      const content = Buffer.from(await file.arrayBuffer());
      const response = await projectFilesService.uploadRootFile(file.name, content, conflict);
      return Response.json(response);
    }

    const projectFilesMatch = matchProjectFilesPath(url.pathname);

    if (
      projectFilesMatch &&
      request.method === "POST" &&
      projectFilesMatch.rename &&
      projectFilesService
    ) {
      const body = (await request.json()) as {
        path?: string;
        name?: string;
        targetDir?: string;
      };

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
        typeof body.targetDir === "string" ? body.targetDir : undefined,
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

    // 新建空文件（03y 新建 sheet，v1.4 批4）：校验/重名语义与 mkdir 同款。
    if (
      projectFilesMatch &&
      request.method === "POST" &&
      projectFilesMatch.create &&
      projectFilesService
    ) {
      const body = (await request.json()) as { name?: string };

      if (typeof body.name !== "string" || body.name.length === 0) {
        return jsonError("PROJECT_NAME_INVALID", "File name is required", 400);
      }

      const response = await projectFilesService.createFile(
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

      // 03z 同名冲突三选（M8）：缺省维持 409 硬拒；overwrite/keepBoth 由队列行选择后带上。
      const conflict = normalizeUploadConflict(formData.get("conflict"));
      const content = Buffer.from(await file.arrayBuffer());
      const response = await projectFilesService.uploadFile(
        projectFilesMatch.projectName,
        url.searchParams.get("path") ?? "",
        file.name,
        content,
        conflict,
      );
      return Response.json(response);
    }

    // 03x 文件搜索（M8）：项目内文件名子串匹配。q 缺省 = 空结果（前端 enabled gate）。
    if (
      projectFilesMatch &&
      request.method === "GET" &&
      projectFilesMatch.search &&
      projectFilesService
    ) {
      const response = await projectFilesService.searchFiles(
        projectFilesMatch.projectName,
        url.searchParams.get("q") ?? "",
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

      const response: DeleteProjectResponse = await projectService.deleteProject(projectName, {
        deleteFiles: url.searchParams.get("deleteFiles") === "true",
      });
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

    if (error instanceof ProjectGitWriteError) {
      return projectGitWriteErrorResponse(error);
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
    // /wiki/search?q= → 全文搜索（先于 slug 读取，防 "search" 被当 slug 404）。
    if (match.slug === "search") {
      const response = await projectWikiService.searchPages(
        match.projectName,
        url.searchParams.get("q") ?? "",
      );
      return Response.json(response satisfies WikiSearchResponse);
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

// GET /api/projects/{name}/mcp-ui-resource?uri=ui://ar-hub/wiki-page
// web 宿主读 hub UI 资源 HTML(JSON 包裹,前端 srcdoc 注入)。hub 恒 loopback,浏览器
// 够不着——api 进程内经 HUB_UI_RESOURCES 单源表直读(与 hub 注册同源,无复制漂移面)。
// 仅 project 存在且 mcp.json ui 开时服务;uri 不在表内 / ui 未开 / project 不存在 → 404。
// 鉴权在前(requireHttpAuth),错误细分只暴露给已认证 owner——ui 忘开等自查诊断有真实
// 价值,非匿名枚举面(2026-10-20 security-review 裁定,注释如实化)。
const handleMcpUiResourceRoute = async (
  request: Request,
  url: URL,
  projectsRoot: string,
): Promise<Response | undefined> => {
  if (request.method !== "GET") return undefined;
  const prefix = "/api/projects/";
  if (!url.pathname.startsWith(prefix)) return undefined;
  const rest = url.pathname.slice(prefix.length);
  const infix = "/mcp-ui-resource";
  if (!rest.endsWith(infix)) return undefined;
  const encodedName = rest.slice(0, -infix.length);
  if (encodedName.length === 0 || encodedName.includes("/")) return undefined;
  let projectName: string;
  try {
    projectName = decodeURIComponent(encodedName);
  } catch {
    return undefined;
  }
  const uri = url.searchParams.get("uri") ?? "";
  // hasOwnProperty 守卫:裸索引会命中原型链(uri=constructor/__proto__ 等返回继承
  // 属性,绕过 404 判定,序列化成 {}——security-review 2026-10-20)。
  const resource = Object.prototype.hasOwnProperty.call(HUB_UI_RESOURCES, uri)
    ? HUB_UI_RESOURCES[uri]
    : undefined;
  if (!resource) {
    return jsonError("PROJECT_FILE_NOT_FOUND", `Unknown UI resource: ${uri}`, 404);
  }
  try {
    // readProjectMcpConfig 内部已过 resolveProjectPath(project 不存在 → ProjectPathError
    // 透传)——不再单独调用,每请求省一轮 fs resolver 往返(2026-10-20 code-review)。
    const config = await readProjectMcpConfig(projectsRoot, projectName);
    if (config?.capabilities?.ui !== true) {
      return jsonError("PROJECT_FILE_NOT_FOUND", "MCP ui capability is disabled", 404);
    }
  } catch {
    // project 不存在 / 路径越界 / mcp.json 非法 → 404(不暴露具体原因,与 hub 同原则)。
    return jsonError("PROJECT_NOT_FOUND", "Project not found", 404);
  }
  return Response.json({ mimeType: resource.mimeType, html: resource.html });
};

// POST /api/projects/{name}/mcp-hub-tools-call  body {name, arguments}
// web 宿主卡片反向 tools/call 的 api 代理(SEP-1865 阶段 4):hub 恒 loopback(浏览器
// 够不着)且真无状态(每请求新建 server+transport),经 HTTP 打 hub 需每请求
// initialize→tools/call 序列且实例不共享——api 与 hub 同进程共享 ProjectWikiService
// 单源,直调 service(同 handleWikiRoute 模式,「MCP 工具 producer 与 HTTP consumer
// 都调它」)。白名单 = app-callable 工具显式映射(卡片可调的 hub 工具面),未列入 → 404;
// 非法 body 的 name 落 "" 同样 miss。ui 门控同 mcp-ui-resource(404 不暴露原因),
// 鉴权在统一 /api/ token 守卫。
const HUB_APP_TOOLS: Record<
  string,
  (service: ProjectWikiService, project: string, args: Record<string, unknown>) => Promise<unknown>
> = {
  wiki_read_page: async (service, project, args) => {
    const slug = typeof args.slug === "string" ? args.slug : "";
    const page = await service.readPage(project, slug);
    return {
      content: [{ type: "text", text: JSON.stringify(page) }],
      structuredContent: wikiPageStructuredContent(page),
    };
  },
};

const handleMcpHubToolsCallRoute = async (
  request: Request,
  url: URL,
  projectsRoot: string,
  projectWikiService: ProjectWikiService,
): Promise<Response | undefined> => {
  if (request.method !== "POST") return undefined;
  const prefix = "/api/projects/";
  if (!url.pathname.startsWith(prefix)) return undefined;
  const rest = url.pathname.slice(prefix.length);
  const infix = "/mcp-hub-tools-call";
  if (!rest.endsWith(infix)) return undefined;
  const encodedName = rest.slice(0, -infix.length);
  if (encodedName.length === 0 || encodedName.includes("/")) return undefined;
  let projectName: string;
  try {
    projectName = decodeURIComponent(encodedName);
  } catch {
    return undefined;
  }
  let body: { name?: unknown; arguments?: unknown } = {};
  try {
    body = (await request.json()) as { name?: unknown; arguments?: unknown };
  } catch {
    // 非法 JSON → body 空对象 → name "" → 白名单 miss 404。
  }
  const toolName = typeof body.name === "string" ? body.name : "";
  const toolArgs =
    typeof body.arguments === "object" && body.arguments !== null
      ? (body.arguments as Record<string, unknown>)
      : {};
  // hasOwnProperty 守卫同 ui-resource(原型链键不透,security-review 2026-10-20)。
  const handler = Object.prototype.hasOwnProperty.call(HUB_APP_TOOLS, toolName)
    ? HUB_APP_TOOLS[toolName]
    : undefined;
  if (!handler) {
    return jsonError("PROJECT_FILE_NOT_FOUND", `Unknown app tool: ${toolName}`, 404);
  }
  try {
    const config = await readProjectMcpConfig(projectsRoot, projectName);
    if (config?.capabilities?.ui !== true) {
      return jsonError("PROJECT_FILE_NOT_FOUND", "MCP ui capability is disabled", 404);
    }
  } catch {
    // project 不存在 / 路径越界 / mcp.json 非法 → 404(不暴露具体原因,与 hub 同原则)。
    return jsonError("PROJECT_NOT_FOUND", "Project not found", 404);
  }
  try {
    const result = await handler(projectWikiService, projectName, toolArgs);
    return Response.json(result);
  } catch (error) {
    if (error instanceof ProjectWikiError) {
      return projectWikiErrorResponse(error);
    }
    throw error;
  }
};

type ProjectGitDiffPathMatch = {
  projectName: string;
  kind:
    | "file"
    | "diff"
    | "branches"
    | "log"
    | "aheadBehind"
    | "compare"
    | "compareFile"
    | "commit"
    | "discard";
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
    { suffix: "/git/commit", kind: "commit" },
    { suffix: "/git/diff/file", kind: "file" },
    { suffix: "/git/diff", kind: "diff" },
    // v1.4 批5 Git 写操作：discard = 03m3 放弃更改（POST）；commit 写操作复用
    // /git/commit suffix 靠 method 分流（GET = 提交详情只读）。
    { suffix: "/git/discard", kind: "discard" },
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
  create: boolean;
  preview: boolean;
  rename: boolean;
  save: boolean;
  search: boolean;
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
  const createSuffix = "/files/create";
  const uploadSuffix = "/files/upload";
  const previewSuffix = "/files/preview";
  const saveSuffix = "/files/save";
  const searchSuffix = "/files/search";
  const filesSuffix = "/files";
  const encodedName = suffix.endsWith(renameSuffix)
    ? suffix.slice(0, -renameSuffix.length)
    : suffix.endsWith(deleteSuffix)
      ? suffix.slice(0, -deleteSuffix.length)
      : suffix.endsWith(mkdirSuffix)
        ? suffix.slice(0, -mkdirSuffix.length)
        : suffix.endsWith(createSuffix)
          ? suffix.slice(0, -createSuffix.length)
          : suffix.endsWith(uploadSuffix)
            ? suffix.slice(0, -uploadSuffix.length)
            : suffix.endsWith(previewSuffix)
              ? suffix.slice(0, -previewSuffix.length)
              : suffix.endsWith(saveSuffix)
                ? suffix.slice(0, -saveSuffix.length)
                : suffix.endsWith(searchSuffix)
                  ? suffix.slice(0, -searchSuffix.length)
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
    create: suffix.endsWith(createSuffix),
    preview: suffix.endsWith(previewSuffix),
    rename: suffix.endsWith(renameSuffix),
    save: suffix.endsWith(saveSuffix),
    search: suffix.endsWith(searchSuffix),
    upload: suffix.endsWith(uploadSuffix),
  };
};

type ProjectFilesRawPathMatch = {
  projectName: string;
  filePath: string;
};

// 03z 冲突三选的表单字段归一：非法/缺省值 → undefined（维持 409 硬拒语义）。
const normalizeUploadConflict = (
  raw: FormDataEntryValue | null,
): UploadConflictPolicy | undefined =>
  raw === "overwrite" || raw === "keepBoth" ? raw : undefined;

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

// v1.4 批5：Git 写操作错误映射（404 项目不存在 / 500 Git 不可用或 FS 故障 / 400 其余
// 校验失败：message 非法、nothing-to-commit、identity 缺失、变更集外路径、放弃失败）。
const projectGitWriteErrorResponse = (error: ProjectGitWriteError) => {
  if (error.code === "PROJECT_NOT_FOUND") {
    return jsonError(error.code, error.message, 404);
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
// ACP 会话 runtimeKey 段（createRuntimeKey 的 provider 段 = "acp"）；进程内 runtime，
// 存量兼容无需旧前缀。
const isAcpSessionName = (sessionName: string) =>
  sessionName.startsWith(`${sessionNamePrefix}-agent-acp-`);

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
  // ACP provider 运行时（Phase 1 PoC）：spawn `omp acp` + 官方 SDK 建连，帧透传进
  // PiSessionRelay。stderr 日志在 runDir/acp-stderr/。凭据走 resolveAcpCredentials
  // 回退链（acp 切片 → claude 激活预设，每次 spawn 前读、热更新即时生效；apiKey 只在
  // buildAcpSpawnEnv 写进 env，不进日志）。
  const acpRuntime = new AcpRuntime({
    runDir: runtimePaths.runDir,
    resolveCredentials: async (provider) =>
      resolveAcpCredentials(await settingsStore.read(), provider),
  });
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
  // 双模式编排（agent-tui）：runtime 分发（exists/close）要按会话形态落 tmux/headless，
  // 而编排器自身依赖 approvalCenter（在其后装配）——先声明、后赋值，闭包内引用。
  let agentTui: AgentTuiController | undefined;
  const runtime: RuntimeResources = {
    exists: async (sessionName) => {
      if (isClaudeSessionName(sessionName)) {
        // 双模式（agent-tui）：terminal 形态的 claude 会话存活面在 tmux pane（headless
        // 进程已让位），探活要落 tmuxRuntime；chat 形态照旧进程内存活。
        if ((await sessionRegistry.getAgentModeByRuntimeKey(sessionName)) === "terminal") {
          return tmuxRuntime.exists(sessionName);
        }
        return claudeRuntime.exists(sessionName);
      }
      if (isAcpSessionName(sessionName)) return acpRuntime.exists(sessionName);
      return tmuxRuntime.exists(sessionName);
    },
    close: async (sessionName) => {
      if (isClaudeSessionName(sessionName)) {
        if ((await sessionRegistry.getAgentModeByRuntimeKey(sessionName)) === "terminal") {
          // terminal 形态关停：headless 内存清理（silent——会话在关，不广播 closed）+
          // tmux pane 关停 + watcher/状态文件清理。
          await claudeRuntime.close(sessionName, { silent: true });
          agentTui?.teardownTerminal(sessionName);
          return tmuxRuntime.close(sessionName);
        }
        return claudeRuntime.close(sessionName);
      }
      if (isAcpSessionName(sessionName)) {
        return acpRuntime.close(sessionName);
      }
      return tmuxRuntime.close(sessionName);
    },
    startAgent: (metadata) => {
      if (metadata.provider === "claude") {
        return claudeRuntime.startAgent(metadata);
      }
      // 按 transport 家族分流（provider 是 CLI 名，omp/claude/codex；ACP 类 CLI 共享此分支）。
      if (metadata.provider && getAgentProviderProfile(metadata.provider)?.transport === "acp") {
        return acpRuntime.startAgent({
          sessionId: metadata.id,
          runtimeKey: metadata.runtimeKey,
          provider: metadata.provider,
          projectPath: metadata.projectPath,
          acpSessionId: metadata.acpSessionId,
        });
      }
      return agentRuntime.startAgent(metadata);
    },
    startTerminal: (metadata) => tmuxRuntime.startTerminal(metadata),
    capture: (sessionName) => tmuxRuntime.capture(sessionName),
    attach: (sessionName, onData, onError, opts) =>
      tmuxRuntime.attach(sessionName, onData, onError, opts),
    // 批量探活：合并 tmux list-sessions（terminal + 非 claude agent）与 claude/acp 进程内存活集合。
    // 1 次 list-sessions + 2 次进程内遍历，替代 M 次 has-session。供 SessionRegistry.getAliveKeys。
    listAliveRuntimeKeys: async () => {
      const [tmuxKeys, claudeKeys, acpKeys] = await Promise.all([
        tmuxRuntime.listAliveRuntimeKeys(),
        claudeRuntime.listAliveRuntimeKeys(),
        acpRuntime.listAliveRuntimeKeys(),
      ]);
      return new Set([...tmuxKeys, ...claudeKeys, ...acpKeys]);
    },
  };
  const sessionRegistry = new SessionRegistry({ runDir: runtimePaths.runDir, runtime });
  // chat 会话元数据持久目录：~/.agents-remote/chat-sessions/（跨重启保留，非 tmpfs runDir；
  // 与 pi SessionManager JSONL 历史同持久语义，设计 docs/design-v1/workbench-views.md §3.1）。
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
  // acp sessionId backfill（session/new 返回后回写 metadata；API 重启 loadSession 恢复靠它）
  // + 活动 bump（真实 update 唯一入口，loadSession 回放不经它——镜像 claude processStdoutLine）。
  acpRuntime.setOnAcpSessionId((sessionId, acpSessionId) => {
    void sessionRegistry.setAcpSessionId(sessionId, acpSessionId);
  });
  acpRuntime.setOnActivity((sessionId) => {
    void sessionRegistry.recordActivity(sessionId);
  });
  const acpStreamController = new AcpStreamController(acpRuntime);

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
  // authoritative, so the server needn't re-scan here. See docs/design-v1/
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
  // M5-b 审批中心（§6.4）：runtime 广播 can_use_tool 登记 + turn 收口；会话内托盘应答经
  // 控制器转发时同步注销（同一 stdin 管道的两条应答入口共用一个登记表）。
  const approvalCenter = new ApprovalCenter(claudeRuntime, sessionRegistry);
  // 会话壳统一推送（壳/内容分离）：registry 变更（状态机/mode/rename/close 经
  // patchMetadata/create/remove 单入口）→ hub 全量快照合并广播。runtime 层零感知。
  const sessionShellHub = new SessionShellHub(sessionRegistry);
  sessionRegistry.onMetadataChanged = () => sessionShellHub.scheduleBroadcast();
  // PWA Web Push 通知批：VAPID 密钥/订阅落盘 ~/.agents-remote/（0o600），fire-and-forget
  // 发送（内部自带 catch）；blocked 走审批登记回调，done/error 走会话状态机出口。
  const pushKeys = new PushKeyManager();
  const pushSubscriptions = new PushSubscriptionStore();
  const pushNotifier = new PushNotifier({
    keys: pushKeys,
    subscriptions: pushSubscriptions,
    settings: settingsStore,
  });
  approvalCenter.onApprovalRegistered = async (record) => {
    // sessionName 异步回填（registry 内部才知道 displayName）。
    const described = await sessionRegistry.describeSessionById(record.sessionId);
    void pushNotifier.notify("blocked", {
      projectName: record.projectName,
      sessionId: record.sessionId,
      ...(described?.displayName ? { sessionName: described.displayName } : {}),
      toolName: record.toolName,
      inputSummary: record.inputSummary,
    });
  };
  // PWA 通知出口（GUI 与 terminal 两条采集源共用，统一管道）：done/error/blocked 即
  // 「需要人关注」；sessionName 异步回填，payload 深链服务端拼好。fire-and-forget，
  // 失败仅告警。gate 放行 blocked 是 terminal 采集源所需；**GUI 采集源（下方
  // setOnSessionStatusChange）只对 done/error 调用**——GUI 的 blocked 由 approval-center
  // 登记回调发（带 toolName 详情），status 出口再发会同帧双通知（code review P1）。
  // context 仅 terminal 采集源携带（hooks JSON 的 PermissionRequest 详情，与 GUI 的
  // approval-center 详情对齐）；chat 侧不传。
  const notifyPushStatus = (
    sessionId: string,
    status: AgentSessionStatus,
    context?: AgentTuiStatusContext,
  ) => {
    if (status !== "done" && status !== "error" && status !== "blocked") return;
    void (async () => {
      const described = await sessionRegistry.describeSessionById(sessionId);
      if (!described) return;
      void pushNotifier.notify(status, {
        projectName: described.projectName,
        sessionId,
        ...(described.displayName ? { sessionName: described.displayName } : {}),
        ...context,
      });
    })();
  };
  // 双模式编排（chat ↔ terminal）：tmux pane 起 CLI 原生形态 + hooks 状态文件 watcher。
  agentTui = new AgentTuiController({
    runDir: runtimePaths.runDir,
    registry: sessionRegistry,
    claudeRuntime,
    tmuxRuntime,
    approvalCenter,
    // 多端跟随（2026-10-16）：切换完成后关该会话全部 claude-stream WS——未切换端重连被
    // terminal 守卫拒（SESSION_STATE_CONFLICT），客户端失效 detail 自动换渲染形态。
    onModeSwitched: (runtimeKey) => claudeStreamController.closeSessionSockets(runtimeKey),
    // terminal 形态状态迁移（hooks 状态文件 watcher）→ push 通知（与 GUI 同出口）。
    onStatusChanged: (sessionId, status, context) => notifyPushStatus(sessionId, status, context),
  });
  // API 重启恢复（双模式）：terminal 形态会话的 tmux pane 独立于 API 存活，但内存里的
  // fs.watch 随进程消失——按落盘 mode 重挂状态文件 watcher，否则重启后 TUI 状态点停更。
  // 失败非致命（最坏只是状态点停更），不拖垮 API 启动。
  try {
    await agentTui.hydrate(await sessionRegistry.listTerminalModeSessions());
  } catch (error) {
    console.error("[startup] agent-tui hydrate failed", error);
  }
  claudeRuntime.setOnApprovalRequest((info, request) =>
    approvalCenter.registerFromRuntime(info, request),
  );
  claudeRuntime.setOnApprovalRuntimeSettled((runtimeKey) =>
    approvalCenter.clearRuntime(runtimeKey),
  );
  claudeStreamController.setOnControlResponseForwarded((runtimeKey, requestId) =>
    approvalCenter.unregisterForwarded(runtimeKey, requestId),
  );
  // turn 状态机装配：迁移落盘（metadata 权威，跨重启恢复）；审批收口 → blocked 回 working
  //（多卡时最后一张注销才触发，见 approval-center.notifySettledIfEmpty）。
  // closed 不落盘：close 路径紧随 removeMetadata，异步写会竞态复活刚删的 metadata
  //（review P2-7）；closed 语义仅在关闭响应中出现（协议约定，见 shared 注释）。
  claudeRuntime.setOnSessionStatusChange((sessionId, status) => {
    if (status === "closed") return;
    void sessionRegistry.setAgentSessionStatus(sessionId, status);
    // 仅 done/error 经 status 出口：GUI 的 blocked 由 approval-center 登记回调发（带
    // toolName 详情），此处再发会同帧双通知（code review P1 修复——gate 放行 blocked
    // 是 terminal 采集源所需，GUI 侧必须排除）。
    if (status === "done" || status === "error") notifyPushStatus(sessionId, status);
  });
  approvalCenter.onRuntimeApprovalsSettled = (runtimeKey) =>
    claudeRuntime.reportApprovalSettled(runtimeKey);
  // 自动重试注入配置源：调度时刻从 metadata fresh 读 config（缺省/enabled:false=不调度）。
  claudeRuntime.setAutoRetryConfigProvider((sessionId) =>
    sessionRegistry.getAgentAutoRetryConfig(sessionId),
  );
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
  // chat 会话空闲回收（设计 workbench-views §3.1.1）：空会话 3min 后清出列表 + idle 运行时
  // 10min 后 dispose（历史保留，重进 resume）。startApi 内启动——测试走 createFetchHandler 不经过。
  startChatIdleRecycler({ piRuntime, registry: chatSessionRegistry, chatSessionsDir });
  // 项目状态窄接口（v1.5 §3.2 删除/重命名语义）：state.yaml projects 模块（detached 名单）+
  // overview 模块（置顶清理）。attach 在 createProject 内部调用，这里只组接口。
  const projectStateManager: ProjectStateManager = {
    listDetached: async () => (await stateStore.readModule("projects")).detached,
    detach: async (name) => {
      await stateStore.updateModule("projects", (m) => ({
        detached: m.detached.includes(name) ? m.detached : [...m.detached, name],
      }));
    },
    attach: async (name) => {
      await stateStore.updateModule("projects", (m) => ({
        detached: m.detached.filter((n) => n !== name),
      }));
    },
    removePinnedSessions: async (sessionIds) => {
      if (sessionIds.length === 0) return;
      const ids = new Set(sessionIds);
      await stateStore.updateModule("overview", (m) => {
        const pinnedSessions = m.pinnedSessions.filter((id) => !ids.has(id));
        return pinnedSessions.length === m.pinnedSessions.length ? m : { pinnedSessions };
      });
    },
  };
  const projectService = new ProjectService(
    config.projectsRoot,
    sessionRegistry,
    projectStateManager,
  );
  const projectFilesService = new ProjectFilesService(config.projectsRoot);
  const projectPagesService = new ProjectPagesService(config.projectsRoot);
  const projectGitDiffService = new ProjectGitDiffService(config.projectsRoot);
  const projectGitWriteService = new ProjectGitWriteService(config.projectsRoot);
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
      approvalCenter,
      sessionShellHub,
      agentTui,
      claudeRuntime,
      claudeStreamController,
      acpStreamController,
      piStreamController,
      projectFilesService,
      projectPagesService,
      projectWikiService,
      projectGitDiffService,
      projectGitWriteService,
      projectService,
      projectsRoot: config.projectsRoot,
      sessionRegistry,
      chatSessionRegistry,
      settingsStore,
      stateStore,
      pushKeys,
      pushSubscriptions,
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
        if (ws.data?.kind === "approvals-stream") {
          approvalCenter.open(ws);
        }
        if (ws.data?.kind === "sessions-stream") {
          sessionShellHub.open(ws);
        }
        if (ws.data?.kind === "acp-stream") {
          acpStreamController.open(ws).catch((err) => {
            console.error("[acp-stream] open handler error", err);
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
        if (ws.data?.kind === "acp-stream") {
          void acpStreamController.message(ws, message);
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
        if (ws.data?.kind === "approvals-stream") {
          approvalCenter.close(ws);
        }
        if (ws.data?.kind === "sessions-stream") {
          sessionShellHub.close(ws);
        }
        if (ws.data?.kind === "acp-stream") {
          acpStreamController.close(ws);
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
