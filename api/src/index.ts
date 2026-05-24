import type {
  CreateProjectRequest,
  CreateProjectResponse,
  HealthResponse,
  ProjectDetailResponse,
  ProjectListResponse,
} from "@agents-remote/shared";
import { AuthService } from "./auth";
import { handleAuthMe, handleLogin, jsonError, requireHttpAuth } from "./http-auth";
import { ProjectService, ProjectServiceError } from "./projects";
import { ensureRuntimeDir, resolveRuntimePaths } from "./runtime-dir";
import { loadSettings, StartupError } from "./settings";
import { canUpgradeWebSocket } from "./ws-auth";

type UpgradeServer = {
  upgrade(request: Request): boolean;
};

type FetchHandlerOptions = {
  projectService?: ProjectService;
};

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

      if (server.upgrade(request)) {
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

    if (options.projectService) {
      const projectResponse = await handleProjects(request, url, options.projectService);

      if (projectResponse) {
        return projectResponse;
      }
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  };

const handleProjects = async (request: Request, url: URL, projectService: ProjectService) => {
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
  const projectService = new ProjectService(settings.projectsRoot);
  const server = Bun.serve({
    port: settings.apiPort,
    fetch: createFetchHandler(auth, { projectService }),
    websocket: {
      message(ws, message) {
        ws.send(message);
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
