import { afterEach, beforeEach, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ProjectGitWriteService } from "./project-git-write";

// 真临时 git 仓库 fixture：git init + 初始提交（配 identity 避免环境差异）。
// 每个 case 独立仓库，验证 commit/discard 的真实 git 行为（argv 数组语义、
// restore/ls-files 判定、renamed 双端展开）。
let root: string;

const git = async (projectPath: string, args: string[]) => {
  const proc = Bun.spawn({
    cmd: ["git", "-C", projectPath, ...args],
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
};

/** 初始化最小仓库：identity 内联（不依赖环境 git config）+ 首提交（README.md）。 */
const initRepo = async (projectPath: string) => {
  await git(projectPath, ["init", "-q"]);
  await git(projectPath, ["config", "user.email", "test@example.com"]);
  await git(projectPath, ["config", "user.name", "Test User"]);
  await git(projectPath, ["config", "commit.gpgsign", "false"]);
  await Bun.write(join(projectPath, "README.md"), "base\n");
  await git(projectPath, ["add", "--", "README.md"]);
  await git(projectPath, ["commit", "-q", "-m", "init"]);
};

beforeEach(async () => {
  root = await mkdtempCompat();
  await Bun.write(join(root, "demo/README.md"), "base\n");
  await initRepo(join(root, "demo"));
});

// bun:test 无 mkdtemp 顶层重导出歧义，用 node:fs promisified 版本。
import { mkdtemp } from "node:fs/promises";

async function mkdtempCompat(): Promise<string> {
  return mkdtemp(join(tmpdir(), "agents-remote-git-write-"));
}

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const service = () => new ProjectGitWriteService(root);

// ── commit ───────────────────────────────────────────────────────────────────

test("commit creates a commit with staged paths and returns hash/branch/count", async () => {
  await Bun.write(join(root, "demo/feature.ts"), "export {};\n");
  const write = service();
  const res = await write.commit("demo", ["feature.ts"], "add feature");
  expect(res.filesCommitted).toBe(1);
  expect(res.branch).toBe(
    /main|master/.exec(
      await git(join(root, "demo"), ["branch", "--show-current"]).then((r) => r.stdout),
    )?.[0],
  );
  const head = await git(join(root, "demo"), ["rev-parse", "HEAD"]);
  expect(res.hash).toBe(head.stdout.trim());
  const committed = await git(join(root, "demo"), ["show", "--name-only", "--format=", "HEAD"]);
  expect(committed.stdout.trim()).toBe("feature.ts");
});

test("commit rejects empty message and oversized message", async () => {
  await Bun.write(join(root, "demo/a.txt"), "a\n");
  const write = service();
  await expect(write.commit("demo", ["a.txt"], "   ")).rejects.toMatchObject({
    code: "PROJECT_GIT_MESSAGE_INVALID",
  });
  await expect(write.commit("demo", ["a.txt"], "x".repeat(2001))).rejects.toMatchObject({
    code: "PROJECT_GIT_MESSAGE_INVALID",
  });
});

test("commit rejects empty paths array", async () => {
  await expect(service().commit("demo", [], "msg")).rejects.toMatchObject({
    code: "PROJECT_TARGET_INVALID",
  });
});

test("commit refuses when the worktree root is not the project directory", async () => {
  // M1（security review）：嵌套外层仓库——项目目录无自身 .git、外层目录是仓库时，
  // git 报告的是外层仓库的 cwd 相对路径，勾选提交可能卷进项目外文件 → 拒绝。
  await rm(join(root, "demo/.git"), { recursive: true, force: true });
  await Bun.write(join(root, "outside.txt"), "outside\n");
  await git(root, ["init", "-q"]);
  const write = service();
  await expect(write.commit("demo", ["README.md"], "msg")).rejects.toMatchObject({
    code: "PROJECT_GIT_NOT_REPOSITORY",
  });
  await expect(write.discard("demo", ["README.md"])).rejects.toMatchObject({
    code: "PROJECT_GIT_NOT_REPOSITORY",
  });
});

test("commit rejects pathspec magic prefix", async () => {
  // L1（security review）：字面名 `:(top)x` 会被 git 解析为 worktree 根的 x（pathspec
  // magic）——sanitize 拒绝 `:` 开头路径，防命中项目内另一路径。
  await expect(service().commit("demo", [":(top)evil.txt"], "msg")).rejects.toMatchObject({
    code: "PROJECT_PATH_OUTSIDE_ROOT",
  });
});

test("commit rejects paths outside the project or outside the changeset", async () => {
  const write = service();
  // 变更集外（README.md 已提交、无未提交变更）
  await expect(write.commit("demo", ["README.md"], "msg")).rejects.toMatchObject({
    code: "PROJECT_GIT_FILE_NOT_CHANGED",
  });
  // 越界路径
  await expect(write.commit("demo", ["../escape.txt"], "msg")).rejects.toMatchObject({
    code: "PROJECT_PATH_OUTSIDE_ROOT",
  });
});

test("commit expands renamed entry to previousPath + path for git add", async () => {
  // staged rename（mv + add 两端）→ --cached diff -M 检出 renamed entry（previousPath）。
  // worktree 未 staged 的 mv 在 git 底层是 delete+add（无 renamed 实体），UI 呈两行独立
  // 变更、按行勾选提交——与 git CLI「不隐式连带」语义一致。
  await Bun.write(join(root, "demo/old.txt"), "rename-me\n");
  await git(join(root, "demo"), ["add", "--", "old.txt"]);
  await git(join(root, "demo"), ["commit", "-q", "-m", "add old"]);
  await git(join(root, "demo"), ["mv", "old.txt", "new.txt"]);
  await git(join(root, "demo"), ["add", "--", "old.txt"]);
  await git(join(root, "demo"), ["add", "--", "new.txt"]);
  const write = service();
  const res = await write.commit("demo", ["new.txt"], "rename old to new");
  expect(res.filesCommitted).toBe(1);
  const status = await git(join(root, "demo"), ["status", "--porcelain"]);
  expect(status.stdout.trim()).toBe("");
});

test("commit without identity reports PROJECT_GIT_IDENTITY_MISSING", async () => {
  await Bun.write(join(root, "demo/c.txt"), "c\n");
  // 移除 identity：用 env -c 清空 HOME/GIT_CONFIG 干净环境跑 commit。
  await git(join(root, "demo"), ["config", "--unset", "user.email"]);
  await git(join(root, "demo"), ["config", "--unset", "user.name"]);
  // 全局 identity 存在时该 case 不稳定——先探测全局身份，有则跳过（保持矩阵确定性）。
  const probe = Bun.spawn({
    cmd: ["git", "config", "--global", "user.email"],
    stdout: "pipe",
    stderr: "pipe",
  });
  const hasGlobalIdentity = (await new Response(probe.stdout).text()).trim().length > 0;
  if (hasGlobalIdentity) {
    await git(join(root, "demo"), ["config", "user.email", "test@example.com"]);
    await git(join(root, "demo"), ["config", "user.name", "Test User"]);
    return;
  }
  const write = service();
  await expect(write.commit("demo", ["c.txt"], "msg")).rejects.toMatchObject({
    code: "PROJECT_GIT_IDENTITY_MISSING",
  });
});

// ── discard ──────────────────────────────────────────────────────────────────

test("discard restores a modified tracked file to HEAD", async () => {
  await Bun.write(join(root, "demo/README.md"), "changed\n");
  const res = await service().discard("demo", ["README.md"]);
  expect(res.results).toEqual([{ path: "README.md", action: "restored" }]);
  expect(await Bun.file(join(root, "demo/README.md")).text()).toBe("base\n");
});

test("discard deletes an untracked file", async () => {
  await Bun.write(join(root, "demo/secret.env"), "TOKEN=example\n");
  const res = await service().discard("demo", ["secret.env"]);
  expect(res.results).toEqual([{ path: "secret.env", action: "deleted" }]);
  expect(await Bun.file(join(root, "demo/secret.env")).exists()).toBe(false);
});

test("discard restores a deleted tracked file", async () => {
  const { unlink } = await import("node:fs/promises");
  await unlink(join(root, "demo/README.md"));
  const res = await service().discard("demo", ["README.md"]);
  expect(res.results).toEqual([{ path: "README.md", action: "restored" }]);
  expect(await Bun.file(join(root, "demo/README.md")).text()).toBe("base\n");
});

test("discard restores both ends of a rename", async () => {
  await git(join(root, "demo"), ["mv", "README.md", "INTRO.md"]);
  const res = await service().discard("demo", ["INTRO.md"]);
  expect(res.results).toEqual([{ path: "INTRO.md", action: "restored" }]);
  expect(await Bun.file(join(root, "demo/README.md")).exists()).toBe(true);
  expect(await Bun.file(join(root, "demo/INTRO.md")).exists()).toBe(false);
});

test("discard refuses paths outside the changeset and outside the project", async () => {
  const write = service();
  await expect(write.discard("demo", ["no-such.txt"])).rejects.toMatchObject({
    code: "PROJECT_GIT_FILE_NOT_CHANGED",
  });
  await expect(write.discard("demo", ["../victim.txt"])).rejects.toMatchObject({
    code: "PROJECT_PATH_OUTSIDE_ROOT",
  });
});

test("discard restores a staged-only modification (staged scope)", async () => {
  await Bun.write(join(root, "demo/README.md"), "staged-change\n");
  await git(join(root, "demo"), ["add", "--", "README.md"]);
  const res = await service().discard("demo", ["README.md"]);
  expect(res.results).toEqual([{ path: "README.md", action: "restored" }]);
  expect(await Bun.file(join(root, "demo/README.md")).text()).toBe("base\n");
  const status = await git(join(root, "demo"), ["status", "--porcelain"]);
  expect(status.stdout.trim()).toBe("");
});
