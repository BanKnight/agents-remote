import type { ApiErrorCode } from "@agents-remote/shared";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { mkdir, realpath, stat } from "node:fs/promises";

type ProjectPathErrorCode = Extract<
  ApiErrorCode,
  | "PROJECT_NAME_INVALID"
  | "PROJECT_NOT_FOUND"
  | "PROJECT_TARGET_INVALID"
  | "PROJECT_PATH_OUTSIDE_ROOT"
  | "PROJECT_FS_ERROR"
>;

export class ProjectPathError extends Error {
  constructor(
    readonly code: ProjectPathErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProjectPathError";
  }
}

export type ResolvedProjectPath = {
  name: string;
  path: string;
};

export type ResolvedProjectRelativePath = {
  project: ResolvedProjectPath;
  relativePath: string;
  path: string;
};

export const validateProjectName = (projectName: string) => {
  if (
    projectName.trim().length === 0 ||
    projectName === "." ||
    projectName === ".." ||
    projectName.includes("/") ||
    projectName.includes("\\") ||
    projectName.includes("\0")
  ) {
    throw new ProjectPathError(
      "PROJECT_NAME_INVALID",
      "Project name must be a first-level directory name",
    );
  }

  return projectName;
};

export const resolveProjectsRoot = async (projectsRoot: string) => {
  if (!isAbsolute(projectsRoot)) {
    throw new ProjectPathError("PROJECT_TARGET_INVALID", "PROJECTS_ROOT must be absolute");
  }

  try {
    const rootPath = await realpath(projectsRoot);
    const rootStat = await stat(rootPath);

    if (!rootStat.isDirectory()) {
      throw new ProjectPathError("PROJECT_FS_ERROR", "PROJECTS_ROOT is not a directory");
    }

    return rootPath;
  } catch (error) {
    if (error instanceof ProjectPathError) {
      throw error;
    }

    throw new ProjectPathError("PROJECT_FS_ERROR", "Unable to access PROJECTS_ROOT");
  }
};

export const resolveProjectPath = async (
  projectsRoot: string,
  projectName: string,
): Promise<ResolvedProjectPath> => {
  const name = validateProjectName(projectName);
  const rootPath = await resolveProjectsRoot(projectsRoot);
  const projectPath = resolve(rootPath, name);

  if (!isDirectChild(rootPath, projectPath)) {
    throw new ProjectPathError(
      "PROJECT_PATH_OUTSIDE_ROOT",
      "Project path must stay inside PROJECTS_ROOT",
    );
  }

  try {
    const projectStat = await stat(projectPath);

    if (!projectStat.isDirectory()) {
      throw new ProjectPathError("PROJECT_TARGET_INVALID", "Project target must be a directory");
    }

    const realProjectPath = await realpath(projectPath);

    if (!isDirectChild(rootPath, realProjectPath)) {
      throw new ProjectPathError(
        "PROJECT_PATH_OUTSIDE_ROOT",
        "Project path must stay inside PROJECTS_ROOT",
      );
    }

    return { name, path: realProjectPath };
  } catch (error) {
    if (error instanceof ProjectPathError) {
      throw error;
    }

    if (isNotFoundError(error)) {
      throw new ProjectPathError("PROJECT_NOT_FOUND", "Project not found");
    }

    throw new ProjectPathError("PROJECT_FS_ERROR", "Unable to resolve project path");
  }
};

export const resolveProjectRelativePath = async (
  projectsRoot: string,
  projectName: string,
  relativePath = "",
  opts?: { ensureDirectory?: boolean },
): Promise<ResolvedProjectRelativePath> => {
  if (relativePath.includes("\0") || isAbsolute(relativePath)) {
    throw new ProjectPathError(
      "PROJECT_PATH_OUTSIDE_ROOT",
      "Project-relative path must stay inside the project",
    );
  }

  const project = await resolveProjectPath(projectsRoot, projectName);
  const requestedPath = relativePath.trim().length === 0 ? "." : relativePath;
  const targetPath = resolve(project.path, requestedPath);

  if (!isInsideOrSelf(project.path, targetPath)) {
    throw new ProjectPathError(
      "PROJECT_PATH_OUTSIDE_ROOT",
      "Project-relative path must stay inside the project",
    );
  }

  try {
    let realTargetPath: string;
    try {
      realTargetPath = await realpath(targetPath);
    } catch (error) {
      // ensureDirectory（composer uploads/ 首传：目录由上传自动创建）：目标不存在
      //（ENOENT；父级是文件时 realpath 报 ENOTDIR）→ mkdir recursive 后走同一复检
      // 路径。其它 FS 错误照旧外层转 FS_ERROR。
      if (
        opts?.ensureDirectory &&
        (isNotFoundError(error) || (error as NodeJS.ErrnoException)?.code === "ENOTDIR")
      ) {
        // 自动建目录只服务 composer 的 uploads/ 等常规目录：拒绝隐藏段（与 createFolder
        // 禁 `.` 开头同名规则一致），避免顺带获得「项目内任意 mkdir -p」能力（如 .git/）。
        if (relativePath.split(/[\\/]+/).some((seg) => seg.startsWith(".") && seg !== ".")) {
          throw new ProjectPathError("PROJECT_TARGET_INVALID", "Upload target must be a directory");
        }
        await ensureUploadDirectory(project.path, targetPath);
        realTargetPath = await realpath(targetPath);
      } else {
        throw error;
      }
    }

    if (!isInsideOrSelf(project.path, realTargetPath)) {
      throw new ProjectPathError(
        "PROJECT_PATH_OUTSIDE_ROOT",
        "Project-relative path must stay inside the project",
      );
    }

    return {
      project,
      relativePath: relativePath.trim().length === 0 ? "" : relativePath,
      path: realTargetPath,
    };
  } catch (error) {
    if (error instanceof ProjectPathError) {
      throw error;
    }

    throw new ProjectPathError("PROJECT_FS_ERROR", "Unable to resolve project-relative path");
  }
};

/**
 * ensureDirectory 专用建目录（resolveProjectRelativePath 的 mkdir 分支）：
 * - **建前**先做父链校验：realpath(targetPath) 抛 ENOENT 只说明后缀不存在，父链上仍可能
 *   有指向界外的 symlink——`mkdir(recursive)` 会跟随它把目录建到界外，事后再复检已太晚
 *  （界外目录已建成、不回滚）。故上溯到「最深的已存在祖先」realpath 复检，越界即
 *   PROJECT_PATH_OUTSIDE_ROOT（任何目录都不会被创建）。ENOTDIR 等其它错误不上溯：mkdir
 *   必然失败且不创建任何东西，交给下面的分类。
 * - `mkdir(recursive)` 已存在目录 no-op；EEXIST = 目标存在但非目录、ENOTDIR = 祖先链
 *   中某级是文件——统一分类 PROJECT_TARGET_INVALID（dangling symlink 也落此分支：mkdir
 *   对存在路径报 EEXIST 且不跟随）。
 * - 成功后 realpath + containment 复检：防 mkdir→write 之间目录被换成界外 symlink 的
 *   TOCTOU 窗口。
 */
const ensureUploadDirectory = async (projectPath: string, targetPath: string): Promise<void> => {
  await assertExistingAncestorInsideProject(projectPath, targetPath);

  try {
    await mkdir(targetPath, { recursive: true });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code !== "EEXIST" && code !== "ENOTDIR") {
      throw error;
    }
    throw new ProjectPathError("PROJECT_TARGET_INVALID", "Upload target must be a directory");
  }

  const realTargetPath = await realpath(targetPath);
  if (!isInsideOrSelf(projectPath, realTargetPath)) {
    throw new ProjectPathError(
      "PROJECT_PATH_OUTSIDE_ROOT",
      "Project-relative path must stay inside the project",
    );
  }
};

/**
 * 上溯最深的已存在祖先并 realpath 复检（mkdir 前的界内校验；见 ensureUploadDirectory）。
 * 只有「不存在」类错误才继续上溯，其它错误（如 ENOTDIR）直接返回让 mkdir 分类。
 */
const assertExistingAncestorInsideProject = async (
  projectPath: string,
  targetPath: string,
): Promise<void> => {
  let candidate = targetPath;
  for (;;) {
    try {
      const realCandidate = await realpath(candidate);
      if (!isInsideOrSelf(projectPath, realCandidate)) {
        throw new ProjectPathError(
          "PROJECT_PATH_OUTSIDE_ROOT",
          "Project-relative path must stay inside the project",
        );
      }
      return;
    } catch (error) {
      // 自身抛出的越界错误必须继续上抛（否则被本 catch 静默吞掉，mkdir 照建）。
      if (error instanceof ProjectPathError) throw error;
      if (!isNotFoundError(error)) return;
      const parent = dirname(candidate);
      if (parent === candidate) return;
      candidate = parent;
    }
  }
};

export const isInsideOrSelf = (rootPath: string, targetPath: string) => {
  const relation = relative(rootPath, targetPath);
  return relation === "" || (!relation.startsWith("..") && !isAbsolute(relation));
};

const isDirectChild = (rootPath: string, targetPath: string) => {
  const relation = relative(rootPath, targetPath);
  return (
    relation !== "" &&
    !relation.startsWith("..") &&
    !isAbsolute(relation) &&
    !relation.includes("/")
  );
};

const isNotFoundError = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
