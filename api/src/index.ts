import type {
  CreateProjectRequest,
  CreateProjectResponse,
  DeleteProjectResponse,
  HealthResponse,
  ProjectDetailResponse,
  ProjectListResponse,
} from "@agents-remote/shared";
import { AgentRuntime } from "./agent-runtime";
import { AuthService } from "./auth";
import { Claude2Runtime } from "./claude2-runtime";
import { parseClaudePermissionModes } from "./agent-provider-profiles";
import { Claude2StreamController, handleClaude2StreamUpgrade } from "./claude2-stream";
import {
  applyAuthRefresh,
  handleAuthMe,
  handleLogin,
  jsonError,
  requireHttpAuth,
} from "./http-auth";
import { ProjectFilesService, ProjectFilesError } from "./project-files";
import { ProjectGitDiffError, ProjectGitDiffService } from "./project-git-diff";
import { ProjectService, ProjectServiceError } from "./projects";
import { readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
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
  claude2StreamController?: Claude2StreamController;
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
    }
  | {
      kind: "claude2-stream";
      sessionType: "agent";
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

    if (options.projectsRoot && options.sessionRegistry) {
      if (options.claude2StreamController) {
        const claude2Upgrade = await handleClaude2StreamUpgrade(
          request,
          url,
          options.projectsRoot,
          options.sessionRegistry,
          server,
        );

        if (claude2Upgrade.matched) {
          return withRefresh(claude2Upgrade.response);
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

      const sessionResponse = await handleSessionRoutes(
        request,
        url,
        options.projectsRoot,
        options.sessionRegistry,
      );

      if (sessionResponse) {
        return withRefresh(sessionResponse);
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
  delete: boolean;
  mkdir: boolean;
  preview: boolean;
  rename: boolean;
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
    error.code === "PROJECT_FILE_DELETE_FAILED"
  ) {
    return jsonError(error.code, error.message, 500);
  }

  if (error.code === "PROJECT_FILE_TARGET_EXISTS") {
    return jsonError(error.code, error.message, 409);
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

  if (error.code === "PROJECT_FS_ERROR" || error.code === "PROJECT_DELETE_FAILED") {
    return jsonError(error.code, error.message, 500);
  }

  return jsonError(error.code, error.message, 400);
};

export const startApi = async () => {
  const settings = await loadSettings();
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
    appPassword: settings.appPassword,
    tokenSecret,
    tokenTtlMs: settings.tokenTtlHours * 3600 * 1000,
  });
  const tmuxRuntime = new TmuxRuntime(runtimePaths.runDir);
  const agentRuntime = new AgentRuntime(tmuxRuntime);
  const claude2Runtime = new Claude2Runtime(runtimePaths.runDir);
  const claudePermissionModes = await parseClaudePermissionModes();
  console.log(`[startup] Claude permission modes: ${claudePermissionModes.join(", ")}`);
  const runtime: RuntimeResources = {
    exists: async (sessionName) => {
      if (await claude2Runtime.exists(sessionName)) return true;
      return tmuxRuntime.exists(sessionName);
    },
    close: async (sessionName) => {
      if (await claude2Runtime.exists(sessionName)) {
        return claude2Runtime.close(sessionName);
      }
      return tmuxRuntime.close(sessionName);
    },
    startAgent: (metadata) => {
      if (metadata.provider === "claude2") {
        return claude2Runtime.startAgent(metadata);
      }
      return agentRuntime.startAgent(metadata);
    },
    startTerminal: (metadata) => tmuxRuntime.startTerminal(metadata),
    write: async (sessionName, data) => {
      if (await claude2Runtime.exists(sessionName)) {
        return claude2Runtime.write(sessionName, data);
      }
      return tmuxRuntime.write(sessionName, data);
    },
    resize: (sessionName, cols, rows) => tmuxRuntime.resize(sessionName, cols, rows),
    capture: (sessionName) => tmuxRuntime.capture(sessionName),
    stream: async (sessionName, onData, onError) => {
      if (await claude2Runtime.exists(sessionName)) {
        return claude2Runtime.stream(sessionName, onData, onError);
      }
      return tmuxRuntime.stream(sessionName, onData, onError);
    },
  };
  const streamController = new SessionStreamController(runtime);
  const sessionRegistry = new SessionRegistry({ runDir: runtimePaths.runDir, runtime });
  const claude2StreamController = new Claude2StreamController(
    claude2Runtime,
    runtime,
    sessionRegistry,
  );

  claude2Runtime.setOnSystemInit((sessionId, _tmuxSessionName, claudeSessionId, model) => {
    void sessionRegistry.setClaudeSessionId(sessionId, claudeSessionId, model);
  });
  const projectService = new ProjectService(settings.projectsRoot, sessionRegistry);
  const projectFilesService = new ProjectFilesService(settings.projectsRoot);
  const projectGitDiffService = new ProjectGitDiffService(settings.projectsRoot);
  const server = Bun.serve<WebSocketData>({
    port: settings.apiPort,
    fetch: createFetchHandler(auth, {
      claude2StreamController,
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
        if (ws.data?.kind === "claude2-stream") {
          claude2StreamController.open(ws).catch((err) => {
            console.error("[claude2-stream] open handler error", err);
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
        if (ws.data?.kind === "claude2-stream") {
          void claude2StreamController.message(ws, message);
          return;
        }

        ws.send(message);
      },
      close(ws) {
        if (ws.data?.kind === "session-stream") {
          streamController.close(ws);
        }
        if (ws.data?.kind === "claude2-stream") {
          claude2StreamController.close(ws);
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
