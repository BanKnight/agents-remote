import type {
  ApiErrorCode,
  GitAheadBehindResponse,
  GitBranch,
  GitBranchListResponse,
  GitBranchStatus,
  GitCommitLogItem,
  GitCommitLogResponse,
  GitCompareDiffResponse,
  GitCompareFileDiffResponse,
  GitCompareFileSummary,
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

/**
 * 分支名/ref 白名单。argv 已防 shell 注入；白名单防 git 语义异常（`@{u}` refspec、`..`
 * range、含空格 ref、`;` `&` `$()` 等元字符）。合法 git ref 只含 `[A-Za-z0-9._/-]`
 *（git-check-ref-format），含 `/`（feature/x）。null/"" → undefined（默认 HEAD）；非法 → 抛错。
 */
const BRANCH_REF_RE = /^[A-Za-z0-9._/-]+$/;
const sanitizeBranchRef = (input: string | null | undefined): string | undefined => {
  if (input === null || input === undefined || input === "") return undefined;
  // `..` 是 git range 歧义（A..B），即使字符合法也必须拒。
  if (input.includes("\0") || input.includes("..") || !BRANCH_REF_RE.test(input)) {
    throw new ProjectGitDiffError("PROJECT_GIT_SCOPE_INVALID", "Invalid branch ref");
  }
  return input;
};

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

    // name-status（status + rename previousPath）+ numstat（行数）+ branch 态势并行。
    // worktree/staged 各一份 numstat map，按 scope 关联；untracked 来自 ls-files 无 numstat → 行数 null。
    const [stagedNames, worktreeNames, stagedNumstat, worktreeNumstat, untracked, branch] =
      await Promise.all([
        this.git(project.path, ["diff", "--cached", "--name-status", "-z", "-M"]),
        this.git(project.path, ["diff", "--name-status", "-z", "-M"]),
        this.git(project.path, ["diff", "--cached", "--numstat", "-M"]),
        this.git(project.path, ["diff", "--numstat", "-M"]),
        this.git(project.path, ["ls-files", "--others", "--exclude-standard", "-z"]),
        this.readBranchStatus(project.path),
      ]);

    const files = dedupeGitFiles([
      ...parseNameStatus(stagedNames, "staged"),
      ...parseNameStatus(worktreeNames, "worktree"),
      ...parseUntracked(untracked),
    ]);
    applyNumstat(files, "staged", parseNumstat(stagedNumstat));
    applyNumstat(files, "worktree", parseNumstat(worktreeNumstat));

    return {
      repository: true,
      projectName: project.name,
      files,
      branch,
    };
  }

  async fileDiff(
    projectName: string,
    scope: string | null,
    path: string | null,
    context: string | null = null,
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

    // R8：context="full" 时用 -U999999 展开完整文件（默认 git 3 行 context）。三种 scope 统一注入。
    const contextArgs = context === "full" ? ["-U999999"] : [];
    const diff =
      scope === "staged"
        ? await this.git(project.path, [
            "diff",
            "--cached",
            ...contextArgs,
            "--no-color",
            "--",
            file.path,
          ])
        : file.status === "added"
          ? await this.git(
              project.path,
              ["diff", "--no-index", ...contextArgs, "--no-color", "--", "/dev/null", file.path],
              [0, 1],
            )
          : await this.git(project.path, ["diff", ...contextArgs, "--no-color", "--", file.path]);

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

  /**
   * R3 分支列表（local + remote）。for-each-ref 一次拿 refname/upstream/track/objectname，
   * 按 committerdate 倒序。current 来自 rev-parse HEAD（detached = "HEAD"）。track 字段
   *（`[ahead 2, behind 1]` / `[gone]`）解析为 per-branch ahead/behind。
   */
  async listBranches(projectName: string): Promise<GitBranchListResponse> {
    const project = await this.resolveProject(projectName);
    if (!(await this.isRepository(project.path))) {
      throw new ProjectGitDiffError(
        "PROJECT_GIT_NOT_REPOSITORY",
        "Project is not a Git repository",
      );
    }

    const [eachRef, head] = await Promise.all([
      this.git(project.path, [
        "for-each-ref",
        "--sort=-committerdate",
        "--format=%(refname)|%(refname:short)|%(upstream:short)|%(upstream:track)|%(objectname:short)",
        "refs/heads",
        "refs/remotes",
      ]),
      this.gitRaw(project.path, ["rev-parse", "--abbrev-ref", "HEAD"]),
    ]);

    const current = head.exitCode === 0 ? head.stdout.trim() : "HEAD";
    return { current, branches: parseBranches(eachRef, current) };
  }

  /**
   * R6 commit 历史。`-z` + `%x00` null 分隔（与 parseNameStatus 同模式，避免 `%s` 含 `|` 歧义），
   * 每 commit 4 段（hash/author/time/subject）。branch 经 sanitizeBranchRef 白名单，默认 HEAD。
   */
  async listCommits(
    projectName: string,
    branch?: string,
    limit = 50,
  ): Promise<GitCommitLogResponse> {
    const project = await this.resolveProject(projectName);
    if (!(await this.isRepository(project.path))) {
      throw new ProjectGitDiffError(
        "PROJECT_GIT_NOT_REPOSITORY",
        "Project is not a Git repository",
      );
    }

    const ref = sanitizeBranchRef(branch) ?? "HEAD";
    const output = await this.git(project.path, [
      "log",
      "-z",
      "--format=%h%x00%an%x00%ar%x00%s",
      `-${limit}`,
      ref,
    ]);

    return { branch: ref, commits: parseCommits(output) };
  }

  /**
   * R4 当前分支相对 upstream 的 ahead/behind commit 差异。无 upstream（@{upstream} 报错）
   * → 返 0/0 + 空 commits（前端降级文案）；有 upstream 则 rev-list count + 两段 log
   *（`upstream..ref` 领先待 push / `ref..upstream` 落后待 pull）。ref 经 sanitizeBranchRef。
   */
  async listAheadBehind(projectName: string, branch?: string): Promise<GitAheadBehindResponse> {
    const project = await this.resolveProject(projectName);
    if (!(await this.isRepository(project.path))) {
      throw new ProjectGitDiffError(
        "PROJECT_GIT_NOT_REPOSITORY",
        "Project is not a Git repository",
      );
    }

    const ref = sanitizeBranchRef(branch) ?? "HEAD";
    const upstreamRaw = await this.gitRaw(project.path, [
      "rev-parse",
      "--abbrev-ref",
      "@{upstream}",
    ]);
    if (upstreamRaw.exitCode !== 0) {
      return { branch: ref, ahead: 0, behind: 0, aheadCommits: [], behindCommits: [] };
    }
    const upstream = upstreamRaw.stdout.trim();

    const logFormat = ["log", "-z", "--format=%h%x00%an%x00%ar%x00%s"];
    const [counts, aheadLog, behindLog] = await Promise.all([
      this.gitRaw(project.path, ["rev-list", "--left-right", "--count", `${upstream}...${ref}`]),
      this.git(project.path, [...logFormat, `${upstream}..${ref}`]),
      this.git(project.path, [...logFormat, `${ref}..${upstream}`]),
    ]);

    const tokens = counts.exitCode === 0 ? counts.stdout.trim().split(/\s+/).map(Number) : [];
    const behind = tokens[0] ?? 0;
    const ahead = tokens[1] ?? 0;

    return {
      branch: ref,
      upstream,
      ahead,
      behind,
      aheadCommits: parseCommits(aheadLog),
      behindCommits: parseCommits(behindLog),
    };
  }

  /**
   * R5 分支间 diff 文件列表（`git diff base..compare`）。base/compare 经 sanitizeBranchRef；
   * name-status + numstat 并行，复用 parseNameStatus/parseNumstat；compare 无 scope 概念，strip。
   */
  async compareDiff(
    projectName: string,
    base: string | null,
    compare: string | null,
  ): Promise<GitCompareDiffResponse> {
    const sanitizedBase = sanitizeBranchRef(base);
    const sanitizedCompare = sanitizeBranchRef(compare);
    if (!sanitizedBase || !sanitizedCompare) {
      throw new ProjectGitDiffError("PROJECT_GIT_SCOPE_INVALID", "Invalid branch ref");
    }

    const project = await this.resolveProject(projectName);
    if (!(await this.isRepository(project.path))) {
      return {
        repository: false,
        projectName: project.name,
        reason: "not_git_repository",
      };
    }

    const range = `${sanitizedBase}..${sanitizedCompare}`;
    const [names, numstat] = await Promise.all([
      this.git(project.path, ["diff", range, "--name-status", "-z", "-M"]),
      this.git(project.path, ["diff", range, "--numstat", "-M"]),
    ]);

    // parseNameStatus 产 GitDiffFileSummary（含 scope 占位）；compare 无 scope，strip。
    const scoped = parseNameStatus(names, "worktree");
    applyNumstat(scoped, "worktree", parseNumstat(numstat));
    const files: GitCompareFileSummary[] = scoped.map(
      ({ path, previousPath, status, addedLines, removedLines }) => ({
        path,
        ...(previousPath ? { previousPath } : {}),
        status,
        addedLines,
        removedLines,
      }),
    );

    return {
      repository: true,
      projectName: project.name,
      base: sanitizedBase,
      compare: sanitizedCompare,
      files,
    };
  }

  /**
   * R5 分支间单文件 diff（`git diff base..compare -- path`）。先 compareDiff 校验 path 在变更列表
   *（否则 PROJECT_GIT_FILE_NOT_CHANGED）；context="full" 加 -U999999（同 fileDiff L143 contextArgs）。
   */
  async compareFileDiff(
    projectName: string,
    base: string | null,
    compare: string | null,
    path: string | null,
    context: string | null = null,
  ): Promise<GitCompareFileDiffResponse> {
    const sanitizedBase = sanitizeBranchRef(base);
    const sanitizedCompare = sanitizeBranchRef(compare);
    if (!sanitizedBase || !sanitizedCompare) {
      throw new ProjectGitDiffError("PROJECT_GIT_SCOPE_INVALID", "Invalid branch ref");
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

    const list = await this.compareDiff(projectName, base, compare);
    if (!list.repository) {
      throw new ProjectGitDiffError(
        "PROJECT_GIT_NOT_REPOSITORY",
        "Project is not a Git repository",
      );
    }

    const file = list.files.find((entry) => entry.path === path);
    if (!file) {
      throw new ProjectGitDiffError("PROJECT_GIT_FILE_NOT_CHANGED", "Git file is not changed");
    }

    const range = `${sanitizedBase}..${sanitizedCompare}`;
    const contextArgs = context === "full" ? ["-U999999"] : [];
    const diff = await this.git(project.path, [
      "diff",
      ...contextArgs,
      "--no-color",
      range,
      "--",
      file.path,
    ]);

    return {
      repository: true,
      projectName: project.name,
      base: sanitizedBase,
      compare: sanitizedCompare,
      path: file.path,
      ...(file.previousPath ? { previousPath: file.previousPath } : {}),
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

  /**
   * R2 当前分支 + 相对 upstream 的 ahead/behind。rev-parse HEAD 失败返 undefined；无 upstream
   *（@{upstream} 报错）降级为只返 name；rev-list count 失败降级为 name+upstream。argv 直传
   * @{upstream} refspec（git 自解析，无 shell 注入；readBranchStatus 全程 gitRaw 容错，不抛错）。
   */
  private async readBranchStatus(projectPath: string): Promise<GitBranchStatus | undefined> {
    const head = await this.gitRaw(projectPath, ["rev-parse", "--abbrev-ref", "HEAD"]);
    if (head.exitCode !== 0) return undefined;
    const name = head.stdout.trim();

    const upstreamRaw = await this.gitRaw(projectPath, [
      "rev-parse",
      "--abbrev-ref",
      "@{upstream}",
    ]);
    if (upstreamRaw.exitCode !== 0) return { name };
    const upstream = upstreamRaw.stdout.trim();

    const counts = await this.gitRaw(projectPath, [
      "rev-list",
      "--left-right",
      "--count",
      "@{upstream}...HEAD",
    ]);
    if (counts.exitCode !== 0) return { name, upstream };
    const [behind, ahead] = counts.stdout
      .trim()
      .split(/\s+/)
      .map((token) => Number(token));
    return { name, upstream, ahead, behind };
  }
}

/**
 * for-each-ref 输出 → GitBranch[]。每行 `refname|short|upstream|track|objectname`（| 分隔，
 * ref 不含 |）。type 由 refname 前缀判（refs/heads → local / refs/remotes → remote）。
 * track（`[ahead 2, behind 1]` / `[gone]`）解析为 ahead/behind。local 分支 == current 标 isCurrent。
 */
const parseBranches = (output: string, current: string): GitBranch[] =>
  output
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => {
      const [refname, name, upstreamRaw, track, lastCommitShort] = line.split("|");
      const type: GitBranch["type"] = refname.startsWith("refs/remotes/") ? "remote" : "local";
      const upstream = upstreamRaw && upstreamRaw.length > 0 ? upstreamRaw : undefined;
      const isCurrent = type === "local" && name === current && current !== "HEAD";
      return {
        name,
        type,
        upstream,
        lastCommitShort,
        ...parseTrack(track),
        ...(isCurrent ? { isCurrent: true } : {}),
      };
    });

/** `%(upstream:track)` → ahead/behind。`[gone]` 或空 → 无。 */
const parseTrack = (track: string): { ahead?: number; behind?: number } => {
  if (!track || track === "[gone]") return {};
  const aheadMatch = track.match(/ahead (\d+)/);
  const behindMatch = track.match(/behind (\d+)/);
  return {
    ...(aheadMatch ? { ahead: Number(aheadMatch[1]) } : {}),
    ...(behindMatch ? { behind: Number(behindMatch[1]) } : {}),
  };
};

/**
 * git log -z 输出 → GitCommitLogItem[]。format `%h%x00%an%x00%ar%x00%s` 每 commit 4 段，
 * -z 在 commit 间也插 \0，split("\0") 后每 4 段一组（末尾空串 filter 掉）。
 */
const parseCommits = (output: string): GitCommitLogItem[] => {
  const tokens = output.split("\0").filter((token) => token.length > 0);
  const commits: GitCommitLogItem[] = [];
  for (let index = 0; index + 3 < tokens.length; index += 4) {
    commits.push({
      hash: tokens[index],
      author: tokens[index + 1],
      relativeTime: tokens[index + 2],
      message: tokens[index + 3],
    });
  }
  return commits;
};

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
        files.push({ path, previousPath, status, scope, addedLines: null, removedLines: null });
      }

      continue;
    }

    const path = tokens[index++];

    if (path) {
      files.push({ path, status, scope, addedLines: null, removedLines: null });
    }
  }

  return files;
};

const parseUntracked = (output: string): GitDiffFileSummary[] =>
  output
    .split("\0")
    .filter((path) => path.length > 0)
    .map((path) => ({
      path,
      status: "added",
      scope: "worktree",
      addedLines: null,
      removedLines: null,
    }));

/**
 * 归一化 numstat 的 rename path → newpath。numstat -M 对 rename 两种格式（实测）：
 *  - 根级 rename：`old => new`（无 brace，空格=>空格分隔）
 *  - 目录内 rename：`dir/{old => new}.ext`（brace 包裹差异部分，提取公共前后缀）
 * name-status -z 给的是 `R\told\tnew`（newpath = file.path），需把 numstat 的 rename path
 * 归一化成 newpath 才能按 path 关联。先试 brace，再试无 brace 的 ` => `。
 */
const normalizeRenamePath = (rawPath: string): string => {
  const braceMatch = rawPath.match(/^(.*)\{([^{}]*) => ([^{}]*)\}(.*)$/);
  if (braceMatch) {
    return `${braceMatch[1]}${braceMatch[3]}${braceMatch[4]}`;
  }
  const arrowIndex = rawPath.lastIndexOf(" => ");
  if (arrowIndex !== -1) {
    return rawPath.slice(arrowIndex + " => ".length);
  }
  return rawPath;
};

type NumstatEntry = { added: number | null; deleted: number | null };

/**
 * numstat 输出 → Map<newpath, NumstatEntry>。每行 `added\tdeleted\tpath`（\n 分隔）；binary 文件
 * 为 `-\t-\tpath` → added/deleted = null。rename path 经 normalizeRenamePath 归一化。
 */
const parseNumstat = (output: string): Map<string, NumstatEntry> => {
  const map = new Map<string, NumstatEntry>();
  for (const line of output.split("\n")) {
    if (!line) continue;
    const segments = line.split("\t");
    if (segments.length < 3) continue;
    const [addedRaw, deletedRaw, ...pathParts] = segments;
    map.set(normalizeRenamePath(pathParts.join("\t")), {
      added: addedRaw === "-" ? null : Number(addedRaw),
      deleted: deletedRaw === "-" ? null : Number(deletedRaw),
    });
  }
  return map;
};

/**
 * 按 scope 把 numstat 行数填回 files（覆盖 parseNameStatus/parseUntracked 的默认 null）。
 * binary/untracked 无 numstat entry → 保持 null。同文件在 worktree/staged 都改时，dedupeGitFiles
 * 已按 `${scope}:${path}` 去重，这里按 scope 选对应 map，避免串。
 */
const applyNumstat = (
  files: GitDiffFileSummary[],
  scope: GitDiffScope,
  numstat: Map<string, NumstatEntry>,
): void => {
  for (const file of files) {
    if (file.scope !== scope) continue;
    const entry = numstat.get(file.path);
    if (!entry) continue;
    file.addedLines = entry.added;
    file.removedLines = entry.deleted;
  }
};

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
