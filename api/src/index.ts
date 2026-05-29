import type {
  CreateProjectRequest,
  CreateProjectResponse,
  HealthResponse,
  ProjectDetailResponse,
  ProjectListResponse,
} from "@agents-remote/shared";
import { AgentRuntime } from "./agent-runtime";
import { AuthService } from "./auth";
import { handleAuthMe, handleLogin, jsonError, requireHttpAuth } from "./http-auth";
import { ProjectFilesService, ProjectFilesError } from "./project-files";
import { ProjectGitDiffError, ProjectGitDiffService } from "./project-git-diff";
import { ProjectService, ProjectServiceError } from "./projects";
import { ensureRuntimeDir, resolveRuntimePaths } from "./runtime-dir";
import { handleSessionRoutes } from "./session-routes";
import { SessionRegistry, type RuntimeResources } from "./session-registry";
import { handleSessionStreamUpgrade, SessionStreamController } from "./session-stream";
import { TmuxRuntime } from "./tmux-runtime";
import { loadSettings, StartupError } from "./settings";
import { canUpgradeWebSocket } from "./ws-auth";

type UpgradeServer = {
  upgrade(request: Request, options?: { data?: WebSocketData }): boolean;
};

type FetchHandlerOptions = {
  projectFilesService?: ProjectFilesService;
  projectGitDiffService?: ProjectGitDiffService;
  projectService?: ProjectService;
  projectsRoot?: string;
  sessionRegistry?: SessionRegistry;
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
      tmuxSessionName: string;
      status: "running" | "idle" | "closed" | "error";
    };

const echoWebSocketData: WebSocketData = { kind: "echo" };

export const createFetchHandler =
  (auth: AuthService, options: FetchHandlerOptions = {}) =>
  async (request: Request, server: UpgradeServer) => {
    const url = new URL(request.url);

    if (url.pathname === "/api/health" && request.method === "GET") {
      const response: HealthResponse = { ok: true, service: "api" };
      return Response.json(response);
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

    if (url.pathname.startsWith("/api/")) {
      const authFailure = requireHttpAuth(request, auth);

      if (authFailure) {
        return authFailure;
      }
    }

    if (options.projectsRoot && options.sessionRegistry) {
      const streamUpgrade = await handleSessionStreamUpgrade(
        request,
        url,
        options.projectsRoot,
        options.sessionRegistry,
        server,
      );

      if (streamUpgrade.matched) {
        return streamUpgrade.response;
      }

      const sessionResponse = await handleSessionRoutes(
        request,
        url,
        options.projectsRoot,
        options.sessionRegistry,
      );

      if (sessionResponse) {
        return sessionResponse;
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
        return projectResponse;
      }
    }

    return Response.json({ error: "Not found" }, { status: 404 });
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
      const response = projectGitDiffMatch.file
        ? await projectGitDiffService.fileDiff(
            projectGitDiffMatch.projectName,
            url.searchParams.get("scope"),
            url.searchParams.get("path"),
          )
        : await projectGitDiffService.listDiff(projectGitDiffMatch.projectName);
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

    const projectFilesMatch = matchProjectFilesPath(url.pathname);

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

type ProjectGitDiffPathMatch = {
  projectName: string;
  file: boolean;
};

const matchProjectGitDiffPath = (pathname: string): ProjectGitDiffPathMatch | undefined => {
  const prefix = "/api/projects/";

  if (!pathname.startsWith(prefix)) {
    return undefined;
  }

  const suffix = pathname.slice(prefix.length);
  const diffSuffix = "/git/diff";
  const fileSuffix = "/git/diff/file";
  const encodedName = suffix.endsWith(fileSuffix)
    ? suffix.slice(0, -fileSuffix.length)
    : suffix.endsWith(diffSuffix)
      ? suffix.slice(0, -diffSuffix.length)
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
    file: suffix.endsWith(fileSuffix),
  };
};

type ProjectFilesPathMatch = {
  projectName: string;
  preview: boolean;
};

const matchProjectFilesPath = (pathname: string): ProjectFilesPathMatch | undefined => {
  const prefix = "/api/projects/";

  if (!pathname.startsWith(prefix)) {
    return undefined;
  }

  const suffix = pathname.slice(prefix.length);
  const filesSuffix = "/files";
  const previewSuffix = "/files/preview";
  const encodedName = suffix.endsWith(previewSuffix)
    ? suffix.slice(0, -previewSuffix.length)
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
    preview: suffix.endsWith(previewSuffix),
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

  if (error.code === "PROJECT_FS_ERROR") {
    return jsonError(error.code, error.message, 500);
  }

  return jsonError(error.code, error.message, 400);
};

const projectErrorResponse = (error: ProjectServiceError) => {
  if (error.code === "PROJECT_NOT_FOUND") {
    return jsonError(error.code, error.message, 404);
  }

  if (error.code === "PROJECT_CONFLICT") {
    return jsonError(error.code, error.message, 409);
  }

  if (error.code === "PROJECT_FS_ERROR") {
    return jsonError(error.code, error.message, 500);
  }

  return jsonError(error.code, error.message, 400);
};

export const startApi = async () => {
  const settings = await loadSettings();
  const runtimePaths = await ensureRuntimeDir(resolveRuntimePaths());
  const auth = new AuthService({ appPassword: settings.appPassword });
  const tmuxRuntime = new TmuxRuntime();
  const agentRuntime = new AgentRuntime(tmuxRuntime);
  const runtime: RuntimeResources = {
    exists: (tmuxSessionName) => tmuxRuntime.exists(tmuxSessionName),
    close: (tmuxSessionName) => tmuxRuntime.close(tmuxSessionName),
    startAgent: (metadata) => agentRuntime.startAgent(metadata),
    startTerminal: (metadata) => tmuxRuntime.startTerminal(metadata),
    write: (tmuxSessionName, data) => tmuxRuntime.write(tmuxSessionName, data),
    resize: (tmuxSessionName, cols, rows) => tmuxRuntime.resize(tmuxSessionName, cols, rows),
    capture: (tmuxSessionName) => tmuxRuntime.capture(tmuxSessionName),
  };
  const streamController = new SessionStreamController(tmuxRuntime);
  const sessionRegistry = new SessionRegistry({ runDir: runtimePaths.runDir, runtime });
  const projectService = new ProjectService(settings.projectsRoot, sessionRegistry);
  const projectFilesService = new ProjectFilesService(settings.projectsRoot);
  const projectGitDiffService = new ProjectGitDiffService(settings.projectsRoot);
  const server = Bun.serve<WebSocketData>({
    port: settings.apiPort,
    fetch: createFetchHandler(auth, {
      projectFilesService,
      projectGitDiffService,
      projectService,
      projectsRoot: settings.projectsRoot,
      sessionRegistry,
    }),
    websocket: {
      open(ws) {
        if (ws.data?.kind === "session-stream") {
          void streamController.open(ws);
        }
      },
      message(ws, message) {
        if (ws.data?.kind === "session-stream") {
          void streamController.message(ws, message);
          return;
        }

        ws.send(message);
      },
      close(ws) {
        if (ws.data?.kind === "session-stream") {
          streamController.close(ws);
        }
      },
    },
  });

  console.log(`api listening on http://localhost:${server.port}`);
  console.log(`api runtime dir ${runtimePaths.runDir}`);

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
