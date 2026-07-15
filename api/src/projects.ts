import type {
  AgentSession,
  ApiErrorCode,
  DeleteProjectResponse,
  Project,
  TerminalSession,
} from "@agents-remote/shared";
import { basename, isAbsolute, relative, resolve } from "node:path";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import {
  ProjectPathError,
  resolveProjectPath,
  resolveProjectsRoot,
  validateProjectName,
} from "./project-paths";

type ProjectSessionCounts = {
  agentSessionCount: number;
  terminalSessionCount: number;
};

type ProjectSessionManager = {
  countSessions(projectName: string): Promise<ProjectSessionCounts>;
  listAgentSessions(projectName: string): Promise<AgentSession[]>;
  listTerminalSessions(projectName: string): Promise<TerminalSession[]>;
  closeAgentSession(projectName: string, sessionId: string): Promise<AgentSession | undefined>;
  closeTerminalSession(
    projectName: string,
    sessionId: string,
  ): Promise<TerminalSession | undefined>;
};

type ProjectServiceErrorCode = Extract<
  ApiErrorCode,
  | "PROJECT_NAME_INVALID"
  | "PROJECT_NOT_FOUND"
  | "PROJECT_TARGET_INVALID"
  | "PROJECT_PATH_OUTSIDE_ROOT"
  | "PROJECT_CONFLICT"
  | "PROJECT_FS_ERROR"
  | "PROJECT_DELETE_FAILED"
>;

export class ProjectServiceError extends Error {
  constructor(
    readonly code: ProjectServiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProjectServiceError";
  }
}

export class ProjectService {
  constructor(
    private readonly projectsRoot: string,
    private readonly sessionManager?: ProjectSessionManager,
  ) {}

  async listProjects(): Promise<Project[]> {
    const rootPath = await this.resolveRoot();

    try {
      const entries = await readdir(rootPath, { withFileTypes: true });
      const projects = await Promise.all(
        entries
          .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
          .map(async (entry) => this.projectFromName(entry.name)),
      );

      return projects.sort((left, right) => left.name.localeCompare(right.name));
    } catch (error) {
      if (error instanceof ProjectServiceError) {
        throw error;
      }

      throw new ProjectServiceError("PROJECT_FS_ERROR", "Unable to list projects");
    }
  }

  /**
   * 只返 project 名（readdir 一级目录），不调 countSessions。供 GET /api/overview 聚合端点
   *（grouped 视图需含无实例 project）；home 列表页仍用 listProjects（带实例计数）。
   */
  async listProjectNames(): Promise<string[]> {
    const rootPath = await this.resolveRoot();

    try {
      const entries = await readdir(rootPath, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
        .map((entry) => entry.name)
        .sort((left, right) => left.localeCompare(right));
    } catch (error) {
      if (error instanceof ProjectServiceError) {
        throw error;
      }

      throw new ProjectServiceError("PROJECT_FS_ERROR", "Unable to list projects");
    }
  }

  async getProject(projectName: string): Promise<Project> {
    return this.projectFromName(projectName);
  }

  async createProject(inputPath: string): Promise<Project> {
    const target = await this.resolveCreateTarget(inputPath);

    try {
      await mkdir(target.path);
    } catch (error) {
      if (!isAlreadyExistsError(error)) {
        throw new ProjectServiceError("PROJECT_FS_ERROR", "Unable to create project directory");
      }
    }

    try {
      const targetStat = await stat(target.path);

      if (!targetStat.isDirectory()) {
        throw new ProjectServiceError(
          "PROJECT_TARGET_INVALID",
          "Project target must be a directory",
        );
      }
    } catch (error) {
      if (error instanceof ProjectServiceError) {
        throw error;
      }

      if (isNotFoundError(error)) {
        throw new ProjectServiceError("PROJECT_CONFLICT", "Project target changed during creation");
      }

      throw new ProjectServiceError("PROJECT_FS_ERROR", "Unable to inspect project target");
    }

    return this.projectFromName(target.name);
  }

  async deleteProject(projectName: string): Promise<DeleteProjectResponse> {
    const project = await resolveProjectPath(this.projectsRoot, projectName);

    if (this.sessionManager) {
      const [agentSessions, terminalSessions] = await Promise.all([
        this.sessionManager.listAgentSessions(project.name),
        this.sessionManager.listTerminalSessions(project.name),
      ]);

      await Promise.all([
        ...agentSessions.map((s) => this.sessionManager!.closeAgentSession(project.name, s.id)),
        ...terminalSessions.map((s) =>
          this.sessionManager!.closeTerminalSession(project.name, s.id),
        ),
      ]);
    }

    try {
      await rm(project.path, { recursive: true, force: true });
    } catch {
      throw new ProjectServiceError("PROJECT_DELETE_FAILED", "Unable to delete project directory");
    }

    return { deleted: true, projectName: project.name };
  }

  private async projectFromName(projectName: string): Promise<Project> {
    try {
      const project = await resolveProjectPath(this.projectsRoot, projectName);
      const counts = (await this.sessionManager?.countSessions(project.name)) ?? {
        agentSessionCount: 0,
        terminalSessionCount: 0,
      };

      return {
        name: project.name,
        path: project.path,
        agentSessionCount: counts.agentSessionCount,
        terminalSessionCount: counts.terminalSessionCount,
      };
    } catch (error) {
      if (error instanceof ProjectPathError) {
        throw new ProjectServiceError(error.code, error.message);
      }

      throw error;
    }
  }

  private async resolveCreateTarget(inputPath: string) {
    const requestedPath = inputPath.trim();

    if (requestedPath.length === 0) {
      throw new ProjectServiceError("PROJECT_TARGET_INVALID", "Project path is required");
    }

    const rootPath = await this.resolveRoot();
    const targetPath = isAbsolute(requestedPath)
      ? resolve(requestedPath)
      : resolve(rootPath, this.validateProjectName(requestedPath));
    const relation = relative(rootPath, targetPath);

    if (relation === "") {
      throw new ProjectServiceError(
        "PROJECT_TARGET_INVALID",
        "Project target must be a child directory",
      );
    }

    if (relation.startsWith("..") || isAbsolute(relation)) {
      throw new ProjectServiceError(
        "PROJECT_PATH_OUTSIDE_ROOT",
        "Project path must stay inside PROJECTS_ROOT",
      );
    }

    if (relation.includes("/")) {
      throw new ProjectServiceError(
        "PROJECT_TARGET_INVALID",
        "Project target must be a first-level directory",
      );
    }

    return {
      name: basename(targetPath),
      path: targetPath,
    };
  }

  private async resolveRoot() {
    try {
      return await resolveProjectsRoot(this.projectsRoot);
    } catch (error) {
      if (error instanceof ProjectPathError) {
        throw new ProjectServiceError(error.code, error.message);
      }

      throw error;
    }
  }

  private validateProjectName(projectName: string) {
    try {
      return validateProjectName(projectName);
    } catch (error) {
      if (error instanceof ProjectPathError) {
        throw new ProjectServiceError(error.code, error.message);
      }

      throw error;
    }
  }
}

const isAlreadyExistsError = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";

const isNotFoundError = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
