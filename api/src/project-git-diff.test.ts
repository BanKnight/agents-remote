import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProjectGitDiffService } from "./project-git-diff";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "agents-remote-git-diff-"));
  await mkdir(join(root, "demo"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

test("listDiff returns non-repository and empty repository states", async () => {
  const service = new ProjectGitDiffService(root);

  await expect(service.listDiff("demo")).resolves.toEqual({
    repository: false,
    projectName: "demo",
    reason: "not_git_repository",
  });

  await initRepository(join(root, "demo"));

  await expect(service.listDiff("demo")).resolves.toEqual({
    repository: true,
    projectName: "demo",
    files: [],
  });
});

test("listDiff maps staged and worktree file statuses", async () => {
  const projectPath = join(root, "demo");
  await initRepository(projectPath);
  await writeFile(join(projectPath, "tracked.txt"), "initial\n");
  await writeFile(join(projectPath, "deleted.txt"), "deleted\n");
  await writeFile(join(projectPath, "rename-old.txt"), "rename me\n");
  await git(projectPath, ["add", "."]);
  await git(projectPath, ["commit", "-m", "initial"]);

  await writeFile(join(projectPath, "tracked.txt"), "worktree change\n");
  await writeFile(join(projectPath, "staged-added.txt"), "staged add\n");
  await git(projectPath, ["add", "staged-added.txt"]);
  await rm(join(projectPath, "deleted.txt"));
  await git(projectPath, ["add", "deleted.txt"]);
  await git(projectPath, ["mv", "rename-old.txt", "rename-new.txt"]);
  await writeFile(join(projectPath, "untracked.txt"), "untracked\n");

  const service = new ProjectGitDiffService(root);

  const result = await service.listDiff("demo");
  expect(result).toMatchObject({
    repository: true,
    projectName: "demo",
    files: [
      { path: "deleted.txt", status: "deleted", scope: "staged" },
      {
        path: "rename-new.txt",
        previousPath: "rename-old.txt",
        status: "renamed",
        scope: "staged",
      },
      { path: "staged-added.txt", status: "added", scope: "staged" },
      { path: "tracked.txt", status: "modified", scope: "worktree" },
      { path: "untracked.txt", status: "added", scope: "worktree" },
    ],
  });
  if (result.repository !== true) throw new Error("expected repository");
  // numstat 语义：tracked modified 有行数；untracked（ls-files）无 numstat → null。
  expect(result.files.find((f) => f.path === "tracked.txt")?.addedLines).not.toBeNull();
  expect(result.files.find((f) => f.path === "untracked.txt")?.addedLines).toBeNull();
  expect(result.files.find((f) => f.path === "untracked.txt")?.removedLines).toBeNull();
});

test("fileDiff returns staged, worktree, and untracked unified diffs", async () => {
  const projectPath = join(root, "demo");
  await initRepository(projectPath);
  await writeFile(join(projectPath, "tracked.txt"), "initial\n");
  await git(projectPath, ["add", "."]);
  await git(projectPath, ["commit", "-m", "initial"]);

  await writeFile(join(projectPath, "tracked.txt"), "worktree change\n");
  await writeFile(join(projectPath, "staged.txt"), "staged\n");
  await git(projectPath, ["add", "staged.txt"]);
  await writeFile(join(projectPath, "untracked.txt"), "untracked\n");

  const service = new ProjectGitDiffService(root);
  const worktree = await service.fileDiff("demo", "worktree", "tracked.txt");
  const staged = await service.fileDiff("demo", "staged", "staged.txt");
  const untracked = await service.fileDiff("demo", "worktree", "untracked.txt");

  expect(worktree).toMatchObject({
    repository: true,
    projectName: "demo",
    path: "tracked.txt",
    scope: "worktree",
    status: "modified",
  });
  expect(worktree.diff).toContain("diff --git a/tracked.txt b/tracked.txt");
  expect(worktree.diff).toContain("+worktree change");
  expect(staged).toMatchObject({ path: "staged.txt", scope: "staged", status: "added" });
  expect(staged.diff).toContain("diff --git a/staged.txt b/staged.txt");
  expect(staged.diff).toContain("+staged");
  expect(untracked).toMatchObject({ path: "untracked.txt", scope: "worktree", status: "added" });
  expect(untracked.diff).toContain("+++ b/untracked.txt");
  expect(untracked.diff).toContain("+untracked");
});

test("fileDiff expands full-file context when context=full", async () => {
  const projectPath = join(root, "demo");
  await initRepository(projectPath);
  // 10 行文件，提交后只改中间第 6 行。
  const lines = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`);
  await writeFile(join(projectPath, "tracked.txt"), `${lines.join("\n")}\n`);
  await git(projectPath, ["add", "."]);
  await git(projectPath, ["commit", "-m", "initial"]);
  await writeFile(
    join(projectPath, "tracked.txt"),
    `${lines.map((l, i) => (i === 5 ? "line 6 changed" : l)).join("\n")}\n`,
  );

  const service = new ProjectGitDiffService(root);
  const changes = await service.fileDiff("demo", "worktree", "tracked.txt");
  const full = await service.fileDiff("demo", "worktree", "tracked.txt", "full");

  // 默认 3 行 context：hunk 从 line 3 起，不含文件首尾行。
  expect(changes.diff).not.toContain("line 1");
  expect(changes.diff).not.toContain("line 10");
  // full（-U999999）：含改动外的文件首尾行上下文。
  expect(full.diff).toContain("line 1");
  expect(full.diff).toContain("line 10");
  expect(full.diff.split("\n").length).toBeGreaterThan(changes.diff.split("\n").length);
});

test("ProjectGitDiffService rejects invalid scope, unchanged files, and path escape", async () => {
  const projectPath = join(root, "demo");
  await initRepository(projectPath);
  await writeFile(join(projectPath, "tracked.txt"), "initial\n");
  await git(projectPath, ["add", "."]);
  await git(projectPath, ["commit", "-m", "initial"]);
  const service = new ProjectGitDiffService(root);

  await expect(service.fileDiff("demo", "bad", "tracked.txt")).rejects.toMatchObject({
    code: "PROJECT_GIT_SCOPE_INVALID",
  });
  await expect(service.fileDiff("demo", "worktree", "tracked.txt")).rejects.toMatchObject({
    code: "PROJECT_GIT_FILE_NOT_CHANGED",
  });
  await expect(service.fileDiff("demo", "worktree", "../outside.txt")).rejects.toMatchObject({
    code: "PROJECT_GIT_FILE_NOT_CHANGED",
  });
  await expect(service.fileDiff("demo", "worktree", "/tmp/outside.txt")).rejects.toMatchObject({
    code: "PROJECT_GIT_FILE_NOT_CHANGED",
  });
});

test("fileDiff rejects non-Git repositories", async () => {
  const service = new ProjectGitDiffService(root);

  await expect(service.fileDiff("demo", "worktree", "file.txt")).rejects.toMatchObject({
    code: "PROJECT_GIT_NOT_REPOSITORY",
  });
});

test("listDiff reports numstat line counts for modified files", async () => {
  const projectPath = join(root, "demo");
  await initRepository(projectPath);
  await writeFile(join(projectPath, "tracked.txt"), "a\nb\nc\n");
  await git(projectPath, ["add", "."]);
  await git(projectPath, ["commit", "-m", "initial"]);
  // 纯追加 2 行：numstat = 2 added / 0 removed（可预测，无歧义）。
  await writeFile(join(projectPath, "tracked.txt"), "a\nb\nc\nd\ne\n");

  const service = new ProjectGitDiffService(root);
  const result = await service.listDiff("demo");
  if (result.repository !== true) throw new Error("expected repository");
  const tracked = result.files.find((f) => f.path === "tracked.txt");
  expect(tracked).toBeDefined();
  expect(tracked?.addedLines).toBe(2);
  expect(tracked?.removedLines).toBe(0);
});

test("listDiff reports null numstat for untracked and tracked binary", async () => {
  const projectPath = join(root, "demo");
  await initRepository(projectPath);
  await writeFile(join(projectPath, "blob.bin"), Buffer.from([0, 1, 2, 3]));
  await git(projectPath, ["add", "."]);
  await git(projectPath, ["commit", "-m", "initial"]);
  // untracked 文本文件（ls-files --others，无 numstat）。
  await writeFile(join(projectPath, "untracked.txt"), "new\n");
  // tracked binary 改后 staged → numstat `-	-` → null。
  await writeFile(join(projectPath, "blob.bin"), Buffer.from([0, 1, 2, 3, 4, 5]));
  await git(projectPath, ["add", "blob.bin"]);

  const service = new ProjectGitDiffService(root);
  const result = await service.listDiff("demo");
  if (result.repository !== true) throw new Error("expected repository");
  expect(result.files.find((f) => f.path === "untracked.txt")?.addedLines).toBeNull();
  expect(result.files.find((f) => f.path === "blob.bin")?.addedLines).toBeNull();
  expect(result.files.find((f) => f.path === "blob.bin")?.removedLines).toBeNull();
});

test("listDiff normalizes numstat rename path by newpath", async () => {
  const projectPath = join(root, "demo");
  await initRepository(projectPath);
  await writeFile(join(projectPath, "old.txt"), "a\nb\nc\n");
  await git(projectPath, ["add", "."]);
  await git(projectPath, ["commit", "-m", "initial"]);
  // rename + 追加 1 行（相似度高，-M 识别为 rename）：numstat 输出 `1\t0\t{old.txt => new.txt}`。
  await git(projectPath, ["mv", "old.txt", "new.txt"]);
  await writeFile(join(projectPath, "new.txt"), "a\nb\nc\nd\n");
  await git(projectPath, ["add", "new.txt"]);

  const service = new ProjectGitDiffService(root);
  const result = await service.listDiff("demo");
  if (result.repository !== true) throw new Error("expected repository");
  const renamed = result.files.find((f) => f.path === "new.txt");
  expect(renamed).toBeDefined();
  expect(renamed?.previousPath).toBe("old.txt");
  // brace `{old.txt => new.txt}` 归一化后按 newpath 关联，行数正确填入。
  expect(renamed?.addedLines).toBe(1);
  expect(renamed?.removedLines).toBe(0);
});

test("listDiff reports branch name without upstream", async () => {
  const projectPath = join(root, "demo");
  await initMainRepository(projectPath);
  await writeFile(join(projectPath, "a.txt"), "a\n");
  await git(projectPath, ["add", "."]);
  await git(projectPath, ["commit", "-m", "initial"]);

  const service = new ProjectGitDiffService(root);
  const result = await service.listDiff("demo");
  if (result.repository !== true) throw new Error("expected repository");
  // 无 remote/upstream → 只返 { name }（ahead/behind/upstream undefined）。
  expect(result.branch).toEqual({ name: "main" });
});

test("listDiff reports ahead/behind against upstream", async () => {
  const projectPath = join(root, "demo");
  const upstreamPath = join(root, "upstream.git");
  await initMainRepository(projectPath);
  await writeFile(join(projectPath, "a.txt"), "a\n");
  await git(projectPath, ["add", "."]);
  await git(projectPath, ["commit", "-m", "initial"]);
  // bare upstream + push -u 设 upstream = origin/main。
  await git(projectPath, ["init", "--bare", upstreamPath]);
  await git(projectPath, ["remote", "add", "origin", upstreamPath]);
  await git(projectPath, ["push", "-u", "origin", "main"]);
  // 本地额外 1 commit → ahead=1, behind=0。
  await writeFile(join(projectPath, "b.txt"), "b\n");
  await git(projectPath, ["add", "."]);
  await git(projectPath, ["commit", "-m", "second"]);

  const service = new ProjectGitDiffService(root);
  const result = await service.listDiff("demo");
  if (result.repository !== true) throw new Error("expected repository");
  expect(result.branch).toEqual({
    name: "main",
    upstream: "origin/main",
    ahead: 1,
    behind: 0,
  });
});

test("listDiff reports detached HEAD as name", async () => {
  const projectPath = join(root, "demo");
  await initMainRepository(projectPath);
  await writeFile(join(projectPath, "a.txt"), "a\n");
  await git(projectPath, ["add", "."]);
  await git(projectPath, ["commit", "-m", "initial"]);
  await git(projectPath, ["checkout", "--detach"]);

  const service = new ProjectGitDiffService(root);
  const result = await service.listDiff("demo");
  if (result.repository !== true) throw new Error("expected repository");
  // detached HEAD → rev-parse --abbrev-ref HEAD 返回 "HEAD"；无 upstream。
  expect(result.branch).toEqual({ name: "HEAD" });
});

test("listBranches reports local + remote branches with current + track", async () => {
  const projectPath = join(root, "demo");
  const upstreamPath = join(root, "upstream.git");
  await initMainRepository(projectPath);
  await writeFile(join(projectPath, "a.txt"), "a\n");
  await git(projectPath, ["add", "."]);
  await git(projectPath, ["commit", "-m", "initial"]);
  await git(projectPath, ["checkout", "-b", "feature/x"]);
  await writeFile(join(projectPath, "b.txt"), "b\n");
  await git(projectPath, ["add", "."]);
  await git(projectPath, ["commit", "-m", "feature"]);
  await git(projectPath, ["checkout", "main"]);
  await git(projectPath, ["init", "--bare", upstreamPath]);
  await git(projectPath, ["remote", "add", "origin", upstreamPath]);
  await git(projectPath, ["push", "-u", "origin", "main"]);
  // main 领先 upstream 1（push 后本地再 1 commit）。
  await writeFile(join(projectPath, "c.txt"), "c\n");
  await git(projectPath, ["add", "."]);
  await git(projectPath, ["commit", "-m", "ahead"]);

  const service = new ProjectGitDiffService(root);
  const result = await service.listBranches("demo");
  expect(result.current).toBe("main");
  const main = result.branches.find((b) => b.name === "main" && b.type === "local");
  expect(main?.isCurrent).toBe(true);
  expect(main?.upstream).toBe("origin/main");
  expect(main?.ahead).toBe(1);
  expect(result.branches.some((b) => b.name === "feature/x" && b.type === "local")).toBe(true);
  expect(result.branches.some((b) => b.name === "origin/main" && b.type === "remote")).toBe(true);
});

test("listCommits returns history with hash/message/author/time + branch filter", async () => {
  const projectPath = join(root, "demo");
  await initMainRepository(projectPath);
  await writeFile(join(projectPath, "a.txt"), "a\n");
  await git(projectPath, ["add", "."]);
  await git(projectPath, ["commit", "-m", "first"]);
  await writeFile(join(projectPath, "b.txt"), "b\n");
  await git(projectPath, ["add", "."]);
  await git(projectPath, ["commit", "-m", "second"]);

  const service = new ProjectGitDiffService(root);
  const result = await service.listCommits("demo");
  expect(result.branch).toBe("HEAD");
  expect(result.commits).toHaveLength(2);
  // log 默认倒序（最新在前）。
  expect(result.commits[0].message).toBe("second");
  expect(result.commits[1].message).toBe("first");
  expect(result.commits[0].author).toBe("Test User");
  expect(result.commits[0].hash).toMatch(/^[0-9a-f]+$/);
  // branch 过滤（合法 ref）。
  const filtered = await service.listCommits("demo", "main");
  expect(filtered.branch).toBe("main");
  expect(filtered.commits).toHaveLength(2);
});

test("listCommits rejects invalid branch ref", async () => {
  const projectPath = join(root, "demo");
  await initMainRepository(projectPath);
  await writeFile(join(projectPath, "a.txt"), "a\n");
  await git(projectPath, ["add", "."]);
  await git(projectPath, ["commit", "-m", "initial"]);
  const service = new ProjectGitDiffService(root);
  await expect(service.listCommits("demo", "a;b")).rejects.toMatchObject({
    code: "PROJECT_GIT_SCOPE_INVALID",
  });
  await expect(service.listCommits("demo", "a$b")).rejects.toMatchObject({
    code: "PROJECT_GIT_SCOPE_INVALID",
  });
  await expect(service.listCommits("demo", "..")).rejects.toMatchObject({
    code: "PROJECT_GIT_SCOPE_INVALID",
  });
});

test("listAheadBehind expands ahead/behind into commit lists", async () => {
  const projectPath = join(root, "demo");
  const upstreamPath = join(root, "upstream.git");
  await initMainRepository(projectPath);
  await writeFile(join(projectPath, "a.txt"), "a\n");
  await git(projectPath, ["add", "."]);
  await git(projectPath, ["commit", "-m", "initial"]);
  await git(projectPath, ["init", "--bare", upstreamPath]);
  await git(projectPath, ["remote", "add", "origin", upstreamPath]);
  await git(projectPath, ["push", "-u", "origin", "main"]);
  // 本地领先 1（待 push）。
  await writeFile(join(projectPath, "b.txt"), "b\n");
  await git(projectPath, ["add", "."]);
  await git(projectPath, ["commit", "-m", "ahead commit"]);

  const service = new ProjectGitDiffService(root);
  const result = await service.listAheadBehind("demo");
  expect(result.upstream).toBe("origin/main");
  expect(result.ahead).toBe(1);
  expect(result.behind).toBe(0);
  expect(result.aheadCommits).toHaveLength(1);
  expect(result.aheadCommits[0].message).toBe("ahead commit");
  expect(result.behindCommits).toHaveLength(0);
});

test("listAheadBehind returns zeros when no upstream", async () => {
  const projectPath = join(root, "demo");
  await initMainRepository(projectPath);
  await writeFile(join(projectPath, "a.txt"), "a\n");
  await git(projectPath, ["add", "."]);
  await git(projectPath, ["commit", "-m", "initial"]);
  const service = new ProjectGitDiffService(root);
  const result = await service.listAheadBehind("demo");
  expect(result.upstream).toBeUndefined();
  expect(result.ahead).toBe(0);
  expect(result.behind).toBe(0);
  expect(result.aheadCommits).toHaveLength(0);
  expect(result.behindCommits).toHaveLength(0);
});

const initRepository = async (projectPath: string) => {
  await git(projectPath, ["init"]);
  await git(projectPath, ["config", "user.email", "test@example.com"]);
  await git(projectPath, ["config", "user.name", "Test User"]);
};

// branch 测试需要可预测的分支名：init 后强制 rename 为 main（兼容 git 默认 main/master）。
const initMainRepository = async (projectPath: string) => {
  await git(projectPath, ["init"]);
  await git(projectPath, ["branch", "-m", "main"]);
  await git(projectPath, ["config", "user.email", "test@example.com"]);
  await git(projectPath, ["config", "user.name", "Test User"]);
};

const git = async (projectPath: string, args: string[]) => {
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

  if (exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${stderr || stdout}`);
  }

  return stdout;
};
