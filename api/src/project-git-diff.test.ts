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

  await expect(service.listDiff("demo")).resolves.toEqual({
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

const initRepository = async (projectPath: string) => {
  await git(projectPath, ["init"]);
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
