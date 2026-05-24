import type { ApiErrorCode } from "@agents-remote/shared";
import { isAbsolute, relative, resolve } from "node:path";
import { realpath, stat } from "node:fs/promises";

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
    const realTargetPath = await realpath(targetPath);

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

const isInsideOrSelf = (rootPath: string, targetPath: string) => {
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
