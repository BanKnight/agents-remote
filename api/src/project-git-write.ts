import type { ApiErrorCode, GitCommitResponse, GitDiscardResponse } from "@agents-remote/shared";
import { rm, realpath } from "node:fs/promises";
import { join } from "node:path";
import { ProjectGitDiffService } from "./project-git-diff";
import { ProjectPathError, isInsideOrSelf, resolveProjectRelativePath } from "./project-paths";

type ProjectGitWriteErrorCode = Extract<
  ApiErrorCode,
  | "PROJECT_NAME_INVALID"
  | "PROJECT_NOT_FOUND"
  | "PROJECT_TARGET_INVALID"
  | "PROJECT_PATH_OUTSIDE_ROOT"
  | "PROJECT_FS_ERROR"
  | "PROJECT_GIT_NOT_REPOSITORY"
  | "PROJECT_GIT_UNAVAILABLE"
  | "PROJECT_GIT_FILE_NOT_CHANGED"
  | "PROJECT_GIT_MESSAGE_INVALID"
  | "PROJECT_GIT_NOTHING_TO_COMMIT"
  | "PROJECT_GIT_IDENTITY_MISSING"
  | "PROJECT_GIT_COMMIT_FAILED"
  | "PROJECT_GIT_DISCARD_FAILED"
>;

export class ProjectGitWriteError extends Error {
  constructor(
    readonly code: ProjectGitWriteErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProjectGitWriteError";
  }
}

/** 提交信息长度上限（03m2 必填；防误触超长负载，非协议硬约束）。 */
const COMMIT_MESSAGE_MAX_LENGTH = 2000;

type GitCommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

/**
 * Git 写操作服务（v1.4 批5）：03m2 提交（勾选行 git add -- 收编 → git commit -m --
 * pathspec 限定只提交勾选路径）与 03m3 放弃更改（tracked = restore 回 HEAD；untracked =
 * 删除）。安全骨架与只读 project-git-diff.ts 同款：入参 sanitize（拒 \0/绝对路径/`..` 段）
 * + git 全部 argv 数组（零 shell 拼接）+ paths 必须是当前变更列表成员（listDiff 交叉
 * 校验——拒绝提交/放弃任意工作区文件；变更集来自 git 报告，天然在项目内）。
 */
export class ProjectGitWriteService {
  constructor(private readonly projectsRoot: string) {}

  async commit(
    projectName: string,
    paths: string[],
    rawMessage: string,
  ): Promise<GitCommitResponse> {
    const message = rawMessage.trim();
    if (message.length === 0 || message.length > COMMIT_MESSAGE_MAX_LENGTH) {
      throw new ProjectGitWriteError(
        "PROJECT_GIT_MESSAGE_INVALID",
        "Commit message must be 1-2000 characters",
      );
    }

    const { project, changed } = await this.resolveChangedPaths(projectName, paths);

    // 03m2 勾选提交语义：git add 收编勾选行的 worktree 态（deleted 行记录删除、untracked
    // 收编；renamed 的 previousPath 已不在 worktree，不进 add），再 git commit -- <pathspec>
    // 限定只提交勾选路径（绕过 index 中未勾选路径的 staged 改动）。renamed 在 pathspec 层
    // 展开两端（old 在 HEAD 有记录 → pathspec 合法，R 关系得以保留）。
    const uniquePaths = [...new Set(paths)];
    // M2（security review）：TOCTOU 防护——变更集校验与执行之间的窗口内，路径的中间
    // 目录组件可能被换成指向项目外的 symlink（add 读穿外带）。对执行时存在的路径
    // realpath 复核仍在项目内（不存在 = deleted 等，git 按 index/worktree 真实态处理）。
    for (const path of uniquePaths) {
      await this.ensureExistingPathInsideProject(project.path, path);
    }
    await this.git(project.path, ["add", "--", ...uniquePaths]);
    const commitPaths = uniquePaths.flatMap((path) => {
      const summary = changed.get(path);
      return summary?.status === "renamed" && summary.previousPath
        ? [summary.previousPath, path]
        : [path];
    });

    const commitResult = await this.gitRaw(project.path, [
      "commit",
      "-m",
      message,
      "--",
      ...commitPaths,
    ]);
    if (commitResult.exitCode !== 0) {
      const stderr = commitResult.stderr;
      if (/nothing to commit/i.test(stderr) || /nothing added to commit/i.test(stderr)) {
        throw new ProjectGitWriteError(
          "PROJECT_GIT_NOTHING_TO_COMMIT",
          "There is nothing to commit",
        );
      }
      if (/does not match|identity|Please tell me who you are/i.test(stderr)) {
        throw new ProjectGitWriteError(
          "PROJECT_GIT_IDENTITY_MISSING",
          "Git user identity is not configured",
        );
      }
      throw new ProjectGitWriteError("PROJECT_GIT_COMMIT_FAILED", "Unable to commit");
    }

    const hash = (await this.git(project.path, ["rev-parse", "HEAD"])).trim();
    const branchResult = await this.gitRaw(project.path, ["symbolic-ref", "--short", "HEAD"]);

    return {
      hash,
      branch: branchResult.exitCode === 0 ? branchResult.stdout.trim() : "HEAD",
      filesCommitted: paths.length,
    };
  }

  async discard(projectName: string, paths: string[]): Promise<GitDiscardResponse> {
    const { project, changed } = await this.resolveChangedPaths(projectName, paths);

    const results: GitDiscardResponse["results"] = [];
    for (const path of paths) {
      // M2（security review）：同 commit——rm/restore 写穿防护，执行前 realpath 复核。
      await this.ensureExistingPathInsideProject(project.path, path);
      const summary = changed.get(path);
      // tracked 判定直接问 git index（不依赖 diff 快照特征）：untracked = 不在 index。
      const tracked = await this.isTracked(project.path, path);

      if (tracked) {
        // renamed 双端恢复：restore 旧路径 + 新路径（index/worktree 一并回 HEAD，
        // 新路径随之消失）；其余 tracked 单路径恢复（deleted 文件恢复内容）。
        const restorePaths =
          summary?.status === "renamed" && summary.previousPath
            ? [summary.previousPath, path]
            : [path];
        await this.git(project.path, [
          "restore",
          "--source=HEAD",
          "--staged",
          "--worktree",
          "--",
          ...restorePaths,
        ]);
        results.push({ path, action: "restored" });
      } else {
        // untracked 放弃 = 删除文件（03m3 pin：警示块红字「放弃将删除文件」）。
        await rm(join(project.path, path), { force: true });
        results.push({ path, action: "deleted" });
      }
    }

    return { results };
  }

  /**
   * paths 全量校验单点：数组非空、逐项 sanitize（与 project-git-diff.ts fileDiff 入参
   * 同款：拒 \0/绝对路径/`..` 段——Git 语境不用 require-existence 的 Project-safe resolver，
   * deleted/renamed 场景路径可不存在；变更集成员校验兜底 Project-safe：变更集路径全部
   * 来自 git 报告，天然在项目内）、且必须是当前变更列表成员。返回 project 与
   * changed 映射（commit 用其展开 renamed pathspec 两端；discard 用其判定 renamed）。
   */
  private async resolveChangedPaths(projectName: string, paths: string[]) {
    if (!Array.isArray(paths) || paths.length === 0) {
      throw new ProjectGitWriteError("PROJECT_TARGET_INVALID", "Changed file paths are required");
    }

    // L1（security review）：拒 pathspec magic 前缀——字面名 `:(top)x` 会被 git 解析为
    // worktree 根的 x，命中项目内另一路径造成错目标。
    const uniquePaths = [...new Set(paths)];
    for (const path of uniquePaths) {
      if (
        path.length === 0 ||
        path.includes("\0") ||
        path.startsWith("/") ||
        path.startsWith(":") ||
        path.split("/").includes("..")
      ) {
        throw new ProjectGitWriteError("PROJECT_PATH_OUTSIDE_ROOT", "Invalid changed file path");
      }
    }

    const project = await this.resolveProject(projectName);
    // M1（security review）：worktree root 必须就是项目目录——项目目录无 .git 而外层
    // 目录是仓库时（PROJECTS_ROOT 本身在内层 git worktree 内），git 报告 cwd 相对路径，
    // renamed 展开的 previousPath / pathspec 命中可能卷进项目外文件；root 相等性封死。
    if (!(await this.isProjectRootWorktree(project.path))) {
      throw new ProjectGitWriteError(
        "PROJECT_GIT_NOT_REPOSITORY",
        "Project is not a Git repository",
      );
    }

    // 变更列表成员校验（03m2/03m3 语境 = 勾选来自 diff 列表；服务端 self-contained 复核，
    // 未变更路径拒绝——防把任意文件卷进提交或误删稳定文件）。
    const list = await new ProjectGitDiffService(this.projectsRoot).listDiff(projectName);
    if (!list.repository) {
      throw new ProjectGitWriteError(
        "PROJECT_GIT_NOT_REPOSITORY",
        "Project is not a Git repository",
      );
    }

    const changed = new Map(list.files.map((f) => [f.path, f]));
    for (const path of uniquePaths) {
      if (!changed.has(path)) {
        throw new ProjectGitWriteError(
          "PROJECT_GIT_FILE_NOT_CHANGED",
          "File has no pending changes",
        );
      }
    }

    return { project, changed };
  }

  private async resolveProject(projectName: string) {
    try {
      return (await resolveProjectRelativePath(this.projectsRoot, projectName, "")).project;
    } catch (error) {
      if (error instanceof ProjectPathError) {
        throw new ProjectGitWriteError(error.code, error.message);
      }
      throw error;
    }
  }

  /**
   * M1（security review）：worktree root 必须就是项目目录。`--is-inside-work-tree` 只证
   * 「在某个 worktree 内」——项目目录无 .git 而外层是仓库时，diff 报告的是外层仓库的
   * cwd 相对路径，勾选提交/放弃可能卷进项目外文件。show-toplevel realpath 后与项目
   * 目录相等才认。
   */
  private async isProjectRootWorktree(projectPath: string) {
    const result = await this.gitRaw(projectPath, ["rev-parse", "--show-toplevel"]);
    if (result.exitCode !== 0) return false;
    try {
      const [toplevelReal, projectReal] = await Promise.all([
        realpath(result.stdout.trim()),
        realpath(projectPath),
      ]);
      return toplevelReal === projectReal;
    } catch {
      return false;
    }
  }

  /**
   * M2（security review）：TOCTOU 防护——变更集校验与执行之间的窗口内，路径的中间目录
   * 组件可能被换成指向项目外的 symlink（rm/restore 写穿、add 读穿外带）。对执行时存在
   * 的路径 realpath 复核仍在项目内；不存在（ENOENT）= deleted/renamed 旧端，git 按
   * index/worktree 真实态处理，跳过。
   */
  private async ensureExistingPathInsideProject(projectPath: string, path: string) {
    const target = join(projectPath, path);
    let real: string;
    try {
      real = await realpath(target);
    } catch {
      return;
    }
    const rootReal = await realpath(projectPath);
    if (!isInsideOrSelf(rootReal, real)) {
      throw new ProjectGitWriteError("PROJECT_PATH_OUTSIDE_ROOT", "Invalid changed file path");
    }
  }

  private async isTracked(projectPath: string, path: string) {
    const result = await this.gitRaw(projectPath, ["ls-files", "--error-unmatch", "--", path]);
    return result.exitCode === 0;
  }

  private async git(projectPath: string, args: string[]) {
    const result = await this.gitRaw(projectPath, args);
    if (result.exitCode !== 0) {
      throw new ProjectGitWriteError("PROJECT_GIT_UNAVAILABLE", "Git command failed");
    }
    return result.stdout;
  }

  private async gitRaw(projectPath: string, args: string[]): Promise<GitCommandResult> {
    // L3（security review）：git 缺失 / argv 超长（E2BIG）等裸异常统一转错误码契约
    //（对齐 project-git-diff.ts gitRaw 先例），不落 Bun 默认 opaque 500。
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
      throw new ProjectGitWriteError("PROJECT_GIT_UNAVAILABLE", "Git is unavailable");
    }
  }
}
