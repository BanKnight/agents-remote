import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmod, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CheckpointError, CheckpointService } from "./checkpoint-service";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "agents-remote-checkpoint-"));
  await mkdir(join(root, "demo"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const SESSION = "test-session-1";

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

const capture = (
  service: CheckpointService,
  projectPath: string,
  input: Partial<Parameters<CheckpointService["capture"]>[0]> & { ordinal: number },
) =>
  service.capture({
    projectPath,
    sessionId: SESSION,
    phase: "endpoint",
    anchorUuid: `anchor-${input.ordinal}`,
    at: "2026-11-14T00:00:00.000Z",
    ...input,
  });

test("capture snapshots worktree into hidden ref without touching index/worktree", async () => {
  const projectPath = join(root, "demo");
  await initRepository(projectPath);
  await writeFile(join(projectPath, "a.txt"), "one\n");
  await git(projectPath, ["add", "."]);
  await git(projectPath, ["commit", "-m", "initial"]);

  // dirty 工作区（未暂存修改 + 未跟踪文件 + 已暂存新文件）——capture 必须原样保留。
  await writeFile(join(projectPath, "a.txt"), "dirty\n");
  await writeFile(join(projectPath, "untracked.txt"), "u\n");
  await writeFile(join(projectPath, "staged.txt"), "s\n");
  await git(projectPath, ["add", "staged.txt"]);
  const statusBefore = await git(projectPath, ["status", "--porcelain"]);

  const service = new CheckpointService();
  const { commit } = await capture(service, projectPath, { ordinal: 1 });

  expect(commit).toMatch(/^[0-9a-f]{40}$/);
  const statusAfter = await git(projectPath, ["status", "--porcelain"]);
  expect(statusAfter).toBe(statusBefore);
  // 用户 index 未被动：staged.txt 仍在暂存区。
  expect(statusAfter.split("\n").some((l) => l.startsWith("A  staged.txt"))).toBe(true);

  // ref 在场，commit message 是 meta JSON。
  const ref = `refs/ar/checkpoints/${(await import("node:crypto")).createHash("sha256").update(SESSION).digest("hex").slice(0, 16)}/1/endpoint`;
  const message = await git(projectPath, ["log", "-1", "--format=%B", commit]);
  const meta = JSON.parse(message) as { ar: number; sessionId: string; ordinal: number };
  expect(meta).toMatchObject({ ar: 1, sessionId: SESSION, ordinal: 1, anchorUuid: "anchor-1" });
  await git(projectPath, ["rev-parse", "--verify", "--quiet", ref]);
});

test("listCheckpoints parses endpoint refs, sorts ordinals numerically, skips half turns", async () => {
  const projectPath = join(root, "demo");
  await initRepository(projectPath);
  await writeFile(join(projectPath, "a.txt"), "one\n");
  await git(projectPath, ["add", "."]);
  await git(projectPath, ["commit", "-m", "initial"]);

  const service = new CheckpointService();
  // 10 轮 endpoint（字典序 10 < 9 陷阱）+ 一轮只有 baseline（半 turn，跳过）。
  for (let ordinal = 1; ordinal <= 10; ordinal += 1) {
    await writeFile(join(projectPath, `f${ordinal}.txt`), `v${ordinal}\n`);
    await capture(service, projectPath, { ordinal });
  }
  await capture(service, projectPath, { ordinal: 11, phase: "baseline" });

  const list = await service.listCheckpoints(projectPath, SESSION);
  if (list.repository !== true) throw new Error("expected repository");
  expect(list.checkpoints.map((c) => c.ordinal)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  // endpoint_1 无前驱（endpoint_0/baseline_1 都缺）→ stats 为 0 是正确行为；
  // endpoint_2 有前驱 → stats 反映 f2.txt 的 per-turn 改动。
  expect(list.checkpoints[0]).toMatchObject({
    ordinal: 1,
    anchorUuid: "anchor-1",
    filesChanged: 0,
    insertions: 0,
    deletions: 0,
    status: "ready",
  });
  expect(list.checkpoints[1]).toMatchObject({
    ordinal: 2,
    anchorUuid: "anchor-2",
    filesChanged: 1,
    insertions: 1,
    deletions: 0,
    status: "ready",
  });
});

test("turnDiff diffs endpoint_n against previous endpoint, empty when no baseline", async () => {
  const projectPath = join(root, "demo");
  await initRepository(projectPath);
  await writeFile(join(projectPath, "base.txt"), "base\n");
  await git(projectPath, ["add", "."]);
  await git(projectPath, ["commit", "-m", "initial"]);

  const service = new CheckpointService();
  // 首轮：无 endpoint_0 也无 baseline_1（捕获降级场景）→ 空 diff。
  await capture(service, projectPath, { ordinal: 1, phase: "baseline" });
  await capture(service, projectPath, { ordinal: 1 });
  const first = await service.turnDiff(projectPath, SESSION, 1);
  expect(first).toMatchObject({ repository: true, ordinal: 1, files: [], truncated: false });

  // 第二轮：相对 endpoint_1 的 per-turn diff。
  await writeFile(join(projectPath, "base.txt"), "changed\n");
  await writeFile(join(projectPath, "new.txt"), "added\n");
  await capture(service, projectPath, { ordinal: 2 });

  const second = await service.turnDiff(projectPath, SESSION, 2);
  expect(second.files).toHaveLength(2);
  expect(second.files.find((f) => f.path === "base.txt")).toMatchObject({ status: "modified" });
  expect(second.files.find((f) => f.path === "base.txt")?.diff).toContain("-base");
  expect(second.files.find((f) => f.path === "base.txt")?.diff).toContain("+changed");
  expect(second.files.find((f) => f.path === "new.txt")).toMatchObject({ status: "added" });
});

test("turnDiff falls back to same-ordinal baseline when previous endpoint missing", async () => {
  const projectPath = join(root, "demo");
  await initRepository(projectPath);
  await writeFile(join(projectPath, "a.txt"), "one\n");
  await git(projectPath, ["add", "."]);
  await git(projectPath, ["commit", "-m", "initial"]);

  const service = new CheckpointService();
  await capture(service, projectPath, { ordinal: 1, phase: "baseline" });
  await writeFile(join(projectPath, "a.txt"), "two\n");
  await capture(service, projectPath, { ordinal: 1 });

  const diff = await service.turnDiff(projectPath, SESSION, 1);
  expect(diff.files).toHaveLength(1);
  expect(diff.files[0]).toMatchObject({ path: "a.txt", status: "modified" });
});

test("restoreTo restores target content, removes extra files, cleans untracked dirs", async () => {
  const projectPath = join(root, "demo");
  await initRepository(projectPath);
  await writeFile(join(projectPath, "a.txt"), "one\n");
  await git(projectPath, ["add", "."]);
  await git(projectPath, ["commit", "-m", "initial"]);

  const service = new CheckpointService();
  await capture(service, projectPath, { ordinal: 1, phase: "baseline" });

  // 第二轮改动：覆盖 a.txt、新增 b.txt + untracked 目录（都在 target=baseline 之外）。
  await writeFile(join(projectPath, "a.txt"), "two\n");
  await writeFile(join(projectPath, "b.txt"), "new\n");
  await mkdir(join(projectPath, "extra"));
  await writeFile(join(projectPath, "extra", "junk.txt"), "junk\n");
  await capture(service, projectPath, { ordinal: 2 });

  // 回滚到第 1 轮（baseline = "one\n"、无 b.txt/extra）。
  const { backupRef } = await service.restoreTo(
    projectPath,
    SESSION,
    1,
    "baseline",
    "2026-11-14T01:00:00.000Z",
  );
  expect(backupRef).toContain("/1/restore-backup");

  expect(await readFile(join(projectPath, "a.txt"))).toBe("one\n");
  const bExists = await Bun.file(join(projectPath, "b.txt")).exists();
  expect(bExists).toBe(false);
  const junkExists = await Bun.file(join(projectPath, "extra", "junk.txt")).exists();
  expect(junkExists).toBe(false);
  // 循环 clean 后 extra 目录也被摘除。
  const dir = await Array.fromAsync(new Bun.Glob("extra").scan({ cwd: projectPath }));
  expect(dir).toHaveLength(0);

  // backup 捕获的是恢复前的状态：a.txt="two\n" + b.txt 在场。
  const backupMessage = await git(projectPath, [
    "log",
    "-1",
    "--format=%B",
    backupRef.replace("refs/", ""),
  ]);
  expect(JSON.parse(backupMessage)).toMatchObject({ phase: "restore-backup" });
  const backupTree = await git(projectPath, ["ls-tree", "-r", "--name-only", backupRef]);
  expect(backupTree.split("\n").filter(Boolean).sort()).toEqual([
    "a.txt",
    "b.txt",
    "extra/junk.txt",
  ]);
});

test("capture surfaces non-zero git exits instead of writing a bogus snapshot", async () => {
  const projectPath = join(root, "demo");
  await initRepository(projectPath);
  await writeFile(join(projectPath, "a.txt"), "one\n");
  await git(projectPath, ["add", "."]);
  await git(projectPath, ["commit", "-m", "initial"]);

  // 让 update-ref 必然失败：refs/ar 被一个普通文件占住（无法建子目录）。
  await writeFile(join(projectPath, ".git", "refs", "ar"), "blocked\n");

  const service = new CheckpointService();
  // 静默吞掉 exitCode 会把「update-ref 失败」当成功返回，调用方以为已有快照。
  await expect(capture(service, projectPath, { ordinal: 1 })).rejects.toMatchObject({
    code: "CHECKPOINT_CAPTURE_TIMEOUT" satisfies CheckpointError["code"],
  });
});

test("restoreTo aborts before touching the worktree when the backup ref cannot be written", async () => {
  const projectPath = join(root, "demo");
  await initRepository(projectPath);
  await writeFile(join(projectPath, "a.txt"), "one\n");
  await git(projectPath, ["add", "."]);
  await git(projectPath, ["commit", "-m", "initial"]);

  const service = new CheckpointService();
  await capture(service, projectPath, { ordinal: 1, phase: "baseline" });
  await writeFile(join(projectPath, "a.txt"), "two\n");

  // backup 写不进去（objects 只读 → 新 blob 落不了盘）→ 必须在不可逆的 restore 之前失败。
  await chmod(join(projectPath, ".git", "objects"), 0o555);
  try {
    await expect(
      service.restoreTo(projectPath, SESSION, 1, "baseline", "2026-11-14T01:00:00.000Z"),
    ).rejects.toMatchObject({
      code: "CHECKPOINT_CAPTURE_TIMEOUT" satisfies CheckpointError["code"],
    });
  } finally {
    await chmod(join(projectPath, ".git", "objects"), 0o755);
  }
  expect(await readFile(join(projectPath, "a.txt"))).toBe("two\n");
});

test("restoreTo failure keeps the restore-backup ref intact", async () => {
  const projectPath = join(root, "demo");
  await initRepository(projectPath);
  await writeFile(join(projectPath, "a.txt"), "one\n");
  await git(projectPath, ["add", "."]);
  await git(projectPath, ["commit", "-m", "initial"]);

  const service = new CheckpointService();
  await capture(service, projectPath, { ordinal: 1, phase: "baseline" });
  await writeFile(join(projectPath, "a.txt"), "two\n");

  // restore 需要往工作区根目录写文件，去掉写权限即必然失败（.git 子目录权限不变，
  // backup 捕获仍成功）——backup 是 restore 失败后用户唯一的还原点，必须留在场。
  await chmod(projectPath, 0o555);
  try {
    await expect(
      service.restoreTo(projectPath, SESSION, 1, "baseline", "2026-11-14T01:00:00.000Z"),
    ).rejects.toMatchObject({
      code: "CHECKPOINT_RESTORE_FAILED" satisfies CheckpointError["code"],
    });
  } finally {
    await chmod(projectPath, 0o755);
  }

  expect(await readFile(join(projectPath, "a.txt"))).toBe("two\n");
  const backupRef = `refs/ar/checkpoints/${(await import("node:crypto")).createHash("sha256").update(SESSION).digest("hex").slice(0, 16)}/1/restore-backup`;
  await git(projectPath, ["rev-parse", "--verify", "--quiet", backupRef]);
  const backupTree = await git(projectPath, ["ls-tree", "-r", "--name-only", backupRef]);
  expect(backupTree.trim()).toBe("a.txt");
  expect(await git(projectPath, ["show", `${backupRef}:a.txt`])).toBe("two\n");
});

test("restoreTo throws CHECKPOINT_NOT_FOUND when target ref missing", async () => {
  const projectPath = join(root, "demo");
  await initRepository(projectPath);
  const service = new CheckpointService();
  await expect(
    service.restoreTo(projectPath, SESSION, 42, "endpoint", "2026-11-14T01:00:00.000Z"),
  ).rejects.toMatchObject({ code: "CHECKPOINT_NOT_FOUND" satisfies CheckpointError["code"] });
});

test("listCheckpoints degrades to repository:false for non-git directory", async () => {
  const service = new CheckpointService();
  const list = await service.listCheckpoints(join(root, "demo"), SESSION);
  expect(list).toEqual({
    repository: false,
    projectName: "",
    reason: "not_git_repository",
  });
});

test("isProjectWorktree false for nested subdirectory of a repository", async () => {
  const projectPath = join(root, "demo");
  await initRepository(projectPath);
  await mkdir(join(projectPath, "nested"));
  const service = new CheckpointService();
  expect(await service.isProjectWorktree(projectPath)).toBe(true);
  expect(await service.isProjectWorktree(join(projectPath, "nested"))).toBe(false);
});

// 102 轮 capture 逼近 bun test 5s 默认单测超时（机器负载抖动即假挂），显式放宽。
test("prune keeps the newest N ordinals and drops older refs entirely", async () => {
  const projectPath = join(root, "demo");
  await initRepository(projectPath);
  await writeFile(join(projectPath, "a.txt"), "one\n");
  await git(projectPath, ["add", "."]);
  await git(projectPath, ["commit", "-m", "initial"]);

  const service = new CheckpointService();
  for (let ordinal = 1; ordinal <= 102; ordinal += 1) {
    await capture(service, projectPath, { ordinal });
  }
  await service.prune(projectPath, SESSION);

  const list = await service.listCheckpoints(projectPath, SESSION);
  if (list.repository !== true) throw new Error("expected repository");
  expect(list.checkpoints).toHaveLength(100);
  expect(list.checkpoints[0]?.ordinal).toBe(3);
  expect(list.checkpoints[99]?.ordinal).toBe(102);
}, 30000);

const readFile = async (path: string): Promise<string> => await Bun.file(path).text();
