import type {
  ApiErrorCode,
  GitDiffFileStatus,
  GitDiffFileSummary,
  GitDiffListResponse,
  GitDiffScope,
  GitFileDiffResponse,
} from "@agents-remote/shared";
import { join } from "node:path";
import { ProjectPathError, resolveProjectRelativePath } from "./project-paths";

type ProjectGitDiffErrorCode = Extract<
  ApiErrorCode,
  | "PROJECT_NAME_INVALID"
  | "PROJECT_NOT_FOUND"
  | "PROJECT_TARGET_INVALID"
  | "PROJECT_PATH_OUTSIDE_ROOT"
  | "PROJECT_GIT_NOT_REPOSITORY"
  | "PROJECT_GIT_SCOPE_INVALID"
  | "PROJECT_GIT_FILE_NOT_CHANGED"
  | "PROJECT_GIT_UNAVAILABLE"
  | "PROJECT_FS_ERROR"
>;

type GitCommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

export class ProjectGitDiffError extends Error {
  constructor(
    readonly code: ProjectGitDiffErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProjectGitDiffError";
  }
}

export class ProjectGitDiffService {
  constructor(private readonly projectsRoot: string) {}

  async listDiff(projectName: string): Promise<GitDiffListResponse> {
    const project = await this.resolveProject(projectName);

    if (!(await this.isRepository(project.path))) {
      return {
        repository: false,
        projectName: project.name,
        reason: "not_git_repository",
      };
    }

    const staged = parseNameStatus(
      await this.git(project.path, ["diff", "--cached", "--name-status", "-z", "-M"]),
      "staged",
    );
    const worktree = parseNameStatus(
      await this.git(project.path, ["diff", "--name-status", "-z", "-M"]),
      "worktree",
    );
    const untracked = parseUntracked(
      await this.git(project.path, ["ls-files", "--others", "--exclude-standard", "-z"]),
    );

    return {
      repository: true,
      projectName: project.name,
      files: dedupeGitFiles([...staged, ...worktree, ...untracked]),
    };
  }

  async fileDiff(
    projectName: string,
    scope: string | null,
    path: string | null,
  ): Promise<GitFileDiffResponse> {
    if (scope !== "worktree" && scope !== "staged") {
      throw new ProjectGitDiffError("PROJECT_GIT_SCOPE_INVALID", "Git diff scope is invalid");
    }

    if (!path || path.includes("\0") || path.startsWith("/") || path.split("/").includes("..")) {
      throw new ProjectGitDiffError("PROJECT_GIT_FILE_NOT_CHANGED", "Git file is not changed");
    }

    const project = await this.resolveProject(projectName);

    if (!(await this.isRepository(project.path))) {
      throw new ProjectGitDiffError(
        "PROJECT_GIT_NOT_REPOSITORY",
        "Project is not a Git repository",
      );
    }

    const list = await this.listDiff(projectName);

    if (!list.repository) {
      throw new ProjectGitDiffError(
        "PROJECT_GIT_NOT_REPOSITORY",
        "Project is not a Git repository",
      );
    }

    const file = list.files.find((entry) => entry.scope === scope && entry.path === path);

    if (!file) {
      throw new ProjectGitDiffError("PROJECT_GIT_FILE_NOT_CHANGED", "Git file is not changed");
    }

    const diff =
      scope === "staged"
        ? await this.git(project.path, ["diff", "--cached", "--no-color", "--", file.path])
        : file.status === "added"
          ? await this.git(
              project.path,
              ["diff", "--no-index", "--no-color", "--", "/dev/null", file.path],
              [0, 1],
            )
          : await this.git(project.path, ["diff", "--no-color", "--", file.path]);

    return {
      repository: true,
      projectName: project.name,
      path: file.path,
      previousPath: file.previousPath,
      scope: file.scope,
      status: file.status,
      diff,
    };
  }

  private async resolveProject(projectName: string) {
    try {
      return (await resolveProjectRelativePath(this.projectsRoot, projectName, "")).project;
    } catch (error) {
      if (error instanceof ProjectPathError) {
        throw new ProjectGitDiffError(error.code, error.message);
      }

      throw error;
    }
  }

  private async isRepository(projectPath: string) {
    const result = await this.gitRaw(projectPath, ["rev-parse", "--is-inside-work-tree"]);
    return result.exitCode === 0 && result.stdout.trim() === "true";
  }

  private async git(projectPath: string, args: string[], allowedExitCodes = [0]) {
    const result = await this.gitRaw(projectPath, args);

    if (!allowedExitCodes.includes(result.exitCode)) {
      throw new ProjectGitDiffError("PROJECT_GIT_UNAVAILABLE", "Unable to read Git diff");
    }

    return result.stdout;
  }

  private async gitRaw(projectPath: string, args: string[]): Promise<GitCommandResult> {
    try {
      const process = Bun.spawn({
        cmd: ["git", "-C", projectPath, ...args],
        stderr: "pipe",
        stdout: "pipe",
      });
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(process.stdout).text(),
        new Response(process.stderr).text(),
        process.exited,
      ]);

      return { stdout, stderr, exitCode };
    } catch {
      throw new ProjectGitDiffError("PROJECT_GIT_UNAVAILABLE", "Git is unavailable");
    }
  }
}

const parseNameStatus = (output: string, scope: GitDiffScope): GitDiffFileSummary[] => {
  const tokens = output.split("\0").filter((token) => token.length > 0);
  const files: GitDiffFileSummary[] = [];
  let index = 0;

  while (index < tokens.length) {
    const code = tokens[index++];
    const status = mapGitStatus(code);

    if (!code || !status) {
      continue;
    }

    if (code.startsWith("R")) {
      const previousPath = tokens[index++];
      const path = tokens[index++];

      if (path && previousPath) {
        files.push({ path, previousPath, status, scope });
      }

      continue;
    }

    const path = tokens[index++];

    if (path) {
      files.push({ path, status, scope });
    }
  }

  return files;
};

const parseUntracked = (output: string): GitDiffFileSummary[] =>
  output
    .split("\0")
    .filter((path) => path.length > 0)
    .map((path) => ({ path, status: "added", scope: "worktree" }));

const mapGitStatus = (code: string): GitDiffFileStatus | undefined => {
  const status = code[0];

  if (status === "A") {
    return "added";
  }

  if (status === "D") {
    return "deleted";
  }

  if (status === "R") {
    return "renamed";
  }

  if (status === "M") {
    return "modified";
  }

  return undefined;
};

const dedupeGitFiles = (files: GitDiffFileSummary[]) => {
  const seen = new Set<string>();
  const result: GitDiffFileSummary[] = [];

  for (const file of files) {
    const key = `${file.scope}:${file.path}`;

    if (!seen.has(key)) {
      seen.add(key);
      result.push(file);
    }
  }

  return result.sort((left, right) => {
    if (left.scope !== right.scope) {
      return left.scope === "staged" ? -1 : 1;
    }

    return left.path.localeCompare(right.path);
  });
};

export const gitFixturePath = (projectPath: string, path: string) => join(projectPath, path);
