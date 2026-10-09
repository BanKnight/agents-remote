import type {
  AgentSession,
  ApiErrorCode,
  DeleteProjectResponse,
  Project,
  TerminalSession,
} from "@agents-remote/shared";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { homedir } from "node:os";
import { mkdir, readdir, realpath, rename, rm, stat } from "node:fs/promises";
import {
  ProjectPathError,
  resolveProjectPath,
  resolveProjectsRoot,
  validateProjectName,
} from "./project-paths";
import {
  deleteAgentHistoryProject,
  migrateAgentHistoryProject,
  projectToSlug,
} from "./agent-history";

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

/**
 * 项目状态（state.yaml projects/overview 模块）窄接口。项目列表源自 readdir，而「移出管理
 * 但保留磁盘文件」（v1.5 §3.2 删除默认路径）必须有显式记录才能表达——`detach` 把项目名记入
 * detached 名单（列表过滤、getProject 404），`attach`（采用/重命名落点）按名移出。
 */
export type ProjectStateManager = {
  listDetached(): Promise<string[]>;
  detach(projectName: string): Promise<void>;
  attach(projectName: string): Promise<void>;
  /** 从全局置顶记录移除指定 sessionId（closeMetadata 会删 metadata 文件，必须关闭前调用）。 */
  removePinnedSessions(sessionIds: string[]): Promise<void>;
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
    private readonly stateManager?: ProjectStateManager,
  ) {}

  async listProjects(): Promise<Project[]> {
    try {
      // readProjectEntryNames 已排序，map 保序；projectFromName 内部 countSessions 不影响顺序。
      const names = await this.readProjectEntryNames();
      return await Promise.all(names.map((name) => this.projectFromName(name)));
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
    try {
      return await this.readProjectEntryNames();
    } catch (error) {
      if (error instanceof ProjectServiceError) {
        throw error;
      }

      throw new ProjectServiceError("PROJECT_FS_ERROR", "Unable to list projects");
    }
  }

  /**
   * 列表用项目名（一级目录 − detached）。listProjects 与 listProjectNames 共用，避免
   * readdir+filter+sort 两份 copy-paste 漂移（过滤/排序规则改一处漏一处会让 home 列表与
   * overview 看到不同的 project 集合）。碰撞防护等全局视野场景用 readProjectDirNames。
   */
  private async readProjectEntryNames(): Promise<string[]> {
    const names = await this.readProjectDirNames();
    // detached（已移出管理、磁盘目录保留）不再进任何列表——目录在 readdir 里必然可见，
    // 必须显式滤掉（v1.5 §3.2）；名单里的残留名字磁盘无目录时 readdir 本就不出，无害。
    const detached = this.stateManager ? await this.stateManager.listDetached() : [];
    if (detached.length === 0) return names;
    const detachedSet = new Set(detached);
    return names.filter((name) => !detachedSet.has(name));
  }

  /**
   * readdir projectsRoot 一级目录名（过滤隐藏 + 排序），**不过滤 detached**。列表类读方
   * 用 readProjectEntryNames（滤 detached）；slug 碰撞防护必须用本函数——detached 项目的
   * 磁盘目录仍在、detach 后历史还可能被 CLI 直写新增，防护看不见它就会连带销毁（code
   * review P3-5）。
   */
  private async readProjectDirNames(): Promise<string[]> {
    const rootPath = await this.resolveRoot();
    const entries = await readdir(rootPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));
  }

  async getProject(projectName: string): Promise<Project> {
    // 单项目读取不做 readdir 过滤（listProjects 已滤），detached 视同不存在。
    const detached = this.stateManager ? await this.stateManager.listDetached() : [];
    if (detached.includes(projectName)) {
      throw new ProjectServiceError("PROJECT_NOT_FOUND", "Project not found");
    }
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

    // 采用语义闭环（v1.5 §3.2）：重新纳管时按名移出 detached 名单（残留记录清理）。
    await this.stateManager?.attach(target.name);

    return this.projectFromName(target.name);
  }

  /**
   * 删除项目（v1.5 §3.2）。两条路径都：关闭全部实例（含运行中）、清除会话历史（移出后无
   * resume 宿主）、清全局置顶；`deleteFiles`（默认 false）决定磁盘目录——false = 移出管理
   * （记入 detached 名单，目录保留可重新采用），true = rm -rf（用户显式勾选销毁）。
   * 这是铁律 2「运行状态永不销毁」的唯一例外：删除是用户显式销毁行为。
   */
  async deleteProject(
    projectName: string,
    options: { deleteFiles?: boolean } = {},
  ): Promise<DeleteProjectResponse> {
    const project = await resolveProjectPath(this.projectsRoot, projectName);
    const deleteFiles = options.deleteFiles === true;

    // 关闭前先收集 sessionId（closeMetadata 会删 metadata 文件，之后查不到 id）。
    const closedIds = await this.closeAllProjectSessions(project.name);
    if (closedIds.length > 0) {
      await this.stateManager?.removePinnedSessions(closedIds);
    }

    // slug 被孪生项目共用时跳过历史目录级 rm（否则连带销毁对方全部历史，security review P1）。
    // excludeName 必须传：删除时磁盘目录还在 readdir 里，不排除自身则恒命中自己 → 永不清理。
    if (!(await this.hasSharedHistorySlug(project.path, project.name))) {
      await deleteAgentHistoryProject(project.path);
    }

    if (deleteFiles) {
      try {
        await rm(project.path, { recursive: true, force: true });
      } catch {
        throw new ProjectServiceError(
          "PROJECT_DELETE_FAILED",
          "Unable to delete project directory",
        );
      }
      // 销毁路径防御性清名单：若撞 detached 残留记录（如移出后 API 直调二次删除），
      // 名字随磁盘目录一起消失，名单残留会让未来同名新目录永久隐身。
      await this.stateManager?.attach(project.name);
    } else {
      await this.stateManager?.detach(project.name);
    }

    return { deleted: true, projectName: project.name, filesDeleted: deleteFiles };
  }

  /**
   * 重命名项目（v1.5 §3.2）：name === 目录名是本项目不变量，重命名 = 磁盘目录 mv + 会话历史
   * slug 目录跟迁（slug 由 path 派生，不迁则历史丢失归属）。活跃实例的 cwd 指向旧路径，
   * 迁移后全部失效——先关闭全部实例（有活跃实例时 UI 层先弹影响提醒，此处只管执行）。
   */
  async renameProject(projectName: string, newName: string): Promise<Project> {
    const normalizedName = this.validateProjectName(newName.trim());
    const project = await resolveProjectPath(this.projectsRoot, projectName);

    const detached = this.stateManager ? await this.stateManager.listDetached() : [];
    if (detached.includes(project.name)) {
      throw new ProjectServiceError("PROJECT_NOT_FOUND", "Project not found");
    }

    const rootPath = await this.resolveRoot();
    const targetPath = resolve(rootPath, normalizedName);
    try {
      await stat(targetPath);
      throw new ProjectServiceError("PROJECT_CONFLICT", "Project name already exists");
    } catch (error) {
      if (error instanceof ProjectServiceError) {
        throw error;
      }
      if (!isNotFoundError(error)) {
        throw new ProjectServiceError("PROJECT_FS_ERROR", "Unable to inspect project target");
      }
    }

    await this.closeAllProjectSessions(project.name);

    try {
      await rename(project.path, targetPath);
    } catch {
      throw new ProjectServiceError("PROJECT_FS_ERROR", "Unable to rename project directory");
    }

    // 旧名或新名的 slug 被孪生项目共用时跳过历史目录级 mv（否则窃走对方全部历史，security
    // review P1）；两边都独占才迁。excludeName 排除自身（旧名不构成对自己新 slug 的冲突）。
    const sharedSlug =
      (await this.hasSharedHistorySlug(project.path, project.name)) ||
      (await this.hasSharedHistorySlug(targetPath, normalizedName));
    if (!sharedSlug) {
      try {
        await migrateAgentHistoryProject(project.path, targetPath);
      } catch (error) {
        // mv 已生效且不可回滚：历史迁移失败降级为非致命（历史留在旧 slug 目录，可事后手工
        // 迁），不把已成功的重命名报成 500（code review P3-4）。
        console.error(
          `[projects] history migration failed for ${project.name} -> ${normalizedName}`,
          error,
        );
      }
    }

    // 新名若撞 detached 残留记录（磁盘曾无目录的名单残留），重命名后目录已在新名下，必须移出。
    await this.stateManager?.attach(normalizedName);

    return this.projectFromName(normalizedName);
  }

  /**
   * 会话历史 slug 是否被其他存活项目共用（security review P1）。
   *
   * claude 历史的目录名 = projectToSlug(path) 把非字母数字全替成 `-`——`a-b` 与 `a_b`、
   * 两个等长 CJK 名都映射到同一 slug。存量读侧歧义无害（单文件操作按 uuid 唯一），但本批
   * 引入**目录级** rm/rename 后，操作一个项目会静默销毁/窃取孪生项目的全部历史（JSONL 是
   * 唯一权威来源）。检测需 PROJECTS_ROOT 全局视野，故放在这里而非 agent-history。
   * 命中时删除/重命名**跳过**历史目录级操作（宁可保留历史不清理，也不毁他人数据）。
   *
   * @param projectPath 被判定的绝对路径（删除 = 自身；重命名 = 新名目标路径）
   * @param excludeName 排除的项目名（重命名时排除自己——`a` → `a-b` 的旧名不构成冲突）
   */
  private async hasSharedHistorySlug(projectPath: string, excludeName?: string): Promise<boolean> {
    const rootPath = await this.resolveRoot();
    // 原始目录名（含 detached）：detach 只移出管理，磁盘孪生目录仍是历史销毁的连带面。
    const names = await this.readProjectDirNames();
    // slug 由「真实路径」派生（listAgentHistory 的入参是 resolveProjectPath 的 realpath 产物）：
    // symlink 目录的 realpath 与词法路径不同，必须同样 realpath 才比对得准。
    const toSlug = async (path: string) => {
      try {
        return projectToSlug(await realpath(path));
      } catch {
        return projectToSlug(path);
      }
    };
    const targetSlug = await toSlug(projectPath);
    for (const name of names) {
      if (name === excludeName) continue;
      if ((await toSlug(join(rootPath, name))) === targetSlug) return true;
    }
    return false;
  }

  /** 关闭项目的全部 agent/terminal 实例，返回被关闭的 sessionId（供删除路径清置顶）。 */
  private async closeAllProjectSessions(projectName: string): Promise<string[]> {
    if (!this.sessionManager) return [];
    const [agentSessions, terminalSessions] = await Promise.all([
      this.sessionManager.listAgentSessions(projectName),
      this.sessionManager.listTerminalSessions(projectName),
    ]);
    await Promise.all([
      ...agentSessions.map((s) => this.sessionManager!.closeAgentSession(projectName, s.id)),
      ...terminalSessions.map((s) => this.sessionManager!.closeTerminalSession(projectName, s.id)),
    ]);
    return [...agentSessions.map((s) => s.id), ...terminalSessions.map((s) => s.id)];
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
        // 会话目录行 $HOME→~ 缩写的派生源（web 侧不硬编码 /home，v1.6 instance-info）。
        homePath: homedir(),
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

    // 已存在目标（采用语义）必须 realpath 复核：词法 relative 检查看不到 symlink 目标——
    // PROJECTS_ROOT 顶层 symlink 目录会让后续 readdir/stat 带出根（security review P3②，
    // M8 采用语义扩大使用面后必须补）。rootPath 已由 resolveProjectsRoot realpath 化，
    // 与 targetReal 直接 relative 即可。ENOENT = 全新目录（mkdir 语义允许），词法检查已兜住。
    try {
      const targetReal = await realpath(targetPath);
      const realRelation = relative(rootPath, targetReal);
      if (realRelation === "" || realRelation.startsWith("..") || isAbsolute(realRelation)) {
        throw new ProjectServiceError(
          "PROJECT_PATH_OUTSIDE_ROOT",
          "Project path must stay inside PROJECTS_ROOT",
        );
      }
    } catch (error) {
      if (error instanceof ProjectServiceError) {
        throw error;
      }

      if (!isNotFoundError(error)) {
        throw new ProjectServiceError("PROJECT_FS_ERROR", "Unable to inspect project target");
      }
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
