import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, realpath, rm, stat, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir, tmpdir } from "node:os";
import { projectToSlug } from "./agent-history";
import { ProjectService } from "./projects";

let root: string;
let outside: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "agents-remote-projects-"));
  outside = await mkdtemp(join(tmpdir(), "agents-remote-outside-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
});

test("listProjects returns first-level directories sorted by name", async () => {
  await mkdir(join(root, "zeta"));
  await mkdir(join(root, "alpha"));
  await mkdir(join(root, "alpha", "nested"));
  await writeFile(join(root, "file.txt"), "content");

  const service = new ProjectService(root);

  await expect(service.listProjects()).resolves.toEqual([
    {
      name: "alpha",
      path: join(root, "alpha"),
      agentSessionCount: 0,
      terminalSessionCount: 0,
    },
    {
      name: "zeta",
      path: join(root, "zeta"),
      agentSessionCount: 0,
      terminalSessionCount: 0,
    },
  ]);
});

test("createProject creates and adopts a first-level folder name", async () => {
  const service = new ProjectService(root);

  await expect(service.createProject("demo")).resolves.toMatchObject({
    name: "demo",
    path: join(root, "demo"),
    agentSessionCount: 0,
    terminalSessionCount: 0,
  });
  await expect(service.createProject("demo")).resolves.toMatchObject({
    name: "demo",
    path: join(root, "demo"),
  });
});

test("createProject creates and adopts an absolute first-level child path", async () => {
  const service = new ProjectService(root);
  const projectPath = join(root, "absolute-demo");

  await expect(service.createProject(projectPath)).resolves.toMatchObject({
    name: "absolute-demo",
    path: projectPath,
  });
  await expect(service.createProject(projectPath)).resolves.toMatchObject({
    name: "absolute-demo",
    path: projectPath,
  });
});

test("createProject rejects root, nested, outside, empty, and file targets", async () => {
  const service = new ProjectService(root);
  await writeFile(join(root, "file"), "content");

  await expect(service.createProject("")).rejects.toMatchObject({ code: "PROJECT_TARGET_INVALID" });
  await expect(service.createProject(root)).rejects.toMatchObject({
    code: "PROJECT_TARGET_INVALID",
  });
  await expect(service.createProject(join(root, "demo", "nested"))).rejects.toMatchObject({
    code: "PROJECT_TARGET_INVALID",
  });
  await expect(service.createProject(join(outside, "demo"))).rejects.toMatchObject({
    code: "PROJECT_PATH_OUTSIDE_ROOT",
  });
  await expect(service.createProject("file")).rejects.toMatchObject({
    code: "PROJECT_TARGET_INVALID",
  });
});

test("createProject rejects a first-level symlink pointing outside PROJECTS_ROOT", async () => {
  await mkdir(join(outside, "elsewhere"), { recursive: true });
  await symlink(join(outside, "elsewhere"), join(root, "evil"));

  const service = new ProjectService(root);

  // 词法 relative 检查对 symlink 透明（root/evil 一级通过），realpath 复核是唯一防线。
  await expect(service.createProject(join(root, "evil"))).rejects.toMatchObject({
    code: "PROJECT_PATH_OUTSIDE_ROOT",
  });
});

test("getProject returns details and reports missing projects", async () => {
  const service = new ProjectService(root);
  await mkdir(join(root, "demo"));

  await expect(service.getProject("demo")).resolves.toMatchObject({
    name: "demo",
    path: join(root, "demo"),
  });
  await expect(service.getProject("missing")).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND" });
});

test("deleteProject keeps files by default (v1.5 detach semantics)", async () => {
  const service = new ProjectService(root);
  const projectPath = join(root, "to-delete");
  await mkdir(projectPath);
  await writeFile(join(projectPath, "readme.md"), "# todo");

  await expect(service.deleteProject("to-delete")).resolves.toEqual({
    deleted: true,
    projectName: "to-delete",
    filesDeleted: false,
  });
  // 默认路径 = 移出管理：磁盘目录保留（可重新采用），文件原样。
  expect((await stat(join(root, "to-delete"))).isDirectory()).toBe(true);
  expect(await readFile(join(root, "to-delete", "readme.md"), "utf8")).toBe("# todo");
});

test("deleteProject reports missing projects", async () => {
  const service = new ProjectService(root);

  await expect(service.deleteProject("missing")).rejects.toMatchObject({
    code: "PROJECT_NOT_FOUND",
  });
});

test("deleteProject closes all sessions before removing the directory", async () => {
  const closedAgent: string[] = [];
  const closedTerminal: string[] = [];
  const detachedNames: string[] = [];
  const pinnedRemoved: string[][] = [];

  const sessionManager = {
    async countSessions() {
      return { agentSessionCount: 1, terminalSessionCount: 1 };
    },
    async listAgentSessions() {
      return [
        {
          id: "agent-1",
          displayName: "test",
          projectName: "to-delete",
          provider: "claude" as const,
          status: "running" as const,
          createdAt: new Date().toISOString(),
        },
      ];
    },
    async listTerminalSessions() {
      return [
        {
          id: "terminal-1",
          displayName: "test",
          projectName: "to-delete",
          status: "running" as const,
        },
      ];
    },
    async closeAgentSession(_projectName: string, sessionId: string) {
      closedAgent.push(sessionId);
      return undefined;
    },
    async closeTerminalSession(_projectName: string, sessionId: string) {
      closedTerminal.push(sessionId);
      return undefined;
    },
  };

  const service = new ProjectService(root, sessionManager, {
    listDetached: async () => detachedNames,
    detach: async (name: string) => {
      detachedNames.push(name);
    },
    attach: async () => {},
    removePinnedSessions: async (ids: string[]) => {
      pinnedRemoved.push(ids);
    },
  });
  await mkdir(join(root, "to-delete"));

  await expect(service.deleteProject("to-delete")).resolves.toEqual({
    deleted: true,
    projectName: "to-delete",
    filesDeleted: false,
  });
  // v1.5 默认路径 = 移出关实例 + 清置顶 + 目录保留（磁盘不删）。
  expect(detachedNames).toEqual(["to-delete"]);
  expect(pinnedRemoved).toEqual([["agent-1", "terminal-1"]]);
  expect((await stat(join(root, "to-delete"))).isDirectory()).toBe(true);

  expect(closedAgent).toEqual(["agent-1"]);
  expect(closedTerminal).toEqual(["terminal-1"]);
});

test("deleteProject deleteFiles=true removes the directory (v1.5 explicit destroy)", async () => {
  const service = new ProjectService(root);
  await mkdir(join(root, "to-wipe"));
  await writeFile(join(root, "to-wipe", "data.txt"), "keep?no");

  await expect(service.deleteProject("to-wipe", { deleteFiles: true })).resolves.toEqual({
    deleted: true,
    projectName: "to-wipe",
    filesDeleted: true,
  });
  await expect(stat(join(root, "to-wipe"))).rejects.toMatchObject({ code: "ENOENT" });
});

test("renameProject moves the directory and reports the new name", async () => {
  const service = new ProjectService(root);
  await mkdir(join(root, "old-name"));
  await writeFile(join(root, "old-name", "f.txt"), "x");

  const renamed = await service.renameProject("old-name", "new-name");
  expect(renamed.name).toBe("new-name");
  expect(renamed.path).toBe(join(root, "new-name"));
  expect(await readFile(join(root, "new-name", "f.txt"), "utf8")).toBe("x");
  await expect(stat(join(root, "old-name"))).rejects.toMatchObject({ code: "ENOENT" });
});

test("renameProject conflicts with existing directory", async () => {
  const service = new ProjectService(root);
  await mkdir(join(root, "a"));
  await mkdir(join(root, "b"));
  await expect(service.renameProject("a", "b")).rejects.toMatchObject({
    code: "PROJECT_CONFLICT",
  });
  // 冲突时源目录未动（关闭实例前先校验，失败不产生副作用）。
  expect((await stat(join(root, "a"))).isDirectory()).toBe(true);
});

test("rejects invalid rename targets", async () => {
  const service = new ProjectService(root);
  await mkdir(join(root, "a"));
  await expect(service.renameProject("a", "../escape")).rejects.toMatchObject({
    code: "PROJECT_NAME_INVALID",
  });
  await expect(service.renameProject("a", "a/b")).rejects.toMatchObject({
    code: "PROJECT_NAME_INVALID",
  });
  await expect(service.renameProject("missing", "b")).rejects.toMatchObject({
    code: "PROJECT_NOT_FOUND",
  });
});

test("renameProject closes all sessions before moving the directory", async () => {
  const closedAgent: string[] = [];
  const closedTerminal: string[] = [];

  const sessionManager = {
    async countSessions() {
      return { agentSessionCount: 1, terminalSessionCount: 1 };
    },
    async listAgentSessions() {
      return [
        {
          id: "agent-1",
          displayName: "test",
          projectName: "old",
          provider: "claude" as const,
          status: "running" as const,
          createdAt: new Date().toISOString(),
        },
      ];
    },
    async listTerminalSessions() {
      return [
        {
          id: "terminal-1",
          displayName: "test",
          projectName: "old",
          status: "running" as const,
        },
      ];
    },
    async closeAgentSession(_projectName: string, sessionId: string) {
      closedAgent.push(sessionId);
      return undefined;
    },
    async closeTerminalSession(_projectName: string, sessionId: string) {
      closedTerminal.push(sessionId);
      return undefined;
    },
  };

  const service = new ProjectService(root, sessionManager);
  await mkdir(join(root, "old"));
  await service.renameProject("old", "new");

  expect(closedAgent).toEqual(["agent-1"]);
  expect(closedTerminal).toEqual(["terminal-1"]);
  expect((await stat(join(root, "new"))).isDirectory()).toBe(true);
});

test("detached projects are hidden from lists and getProject, attach on adopt", async () => {
  const detached: string[] = ["hidden"];
  const attached: string[] = [];
  const stateManager = {
    listDetached: async () => detached,
    detach: async (name: string) => {
      if (!detached.includes(name)) detached.push(name);
    },
    attach: async (name: string) => {
      const i = detached.indexOf(name);
      if (i >= 0) detached.splice(i, 1);
      if (!attached.includes(name)) attached.push(name);
    },
    removePinnedSessions: async () => {},
  };

  await mkdir(join(root, "visible"));
  await mkdir(join(root, "hidden"));
  const service = new ProjectService(root, undefined, stateManager);

  const names = await service.listProjectNames();
  expect(names).toEqual(["visible"]);
  await expect(service.getProject("hidden")).rejects.toMatchObject({
    code: "PROJECT_NOT_FOUND",
  });

  // 重新采用（createProject）→ attach 被调 → 列表恢复可见（v1.5 §3.2 闭环）。
  await service.createProject("hidden");
  expect(attached).toEqual(["hidden"]);
  expect(await service.listProjectNames()).toEqual(["hidden", "visible"]);
});

// a-b 与 a_b 映射到同一 claude slug（projectToSlug 把 `_` 替成 `-`，存量碰撞缺陷）——
// 目录级 rm/mv 会连带销毁/窃取孪生项目的全部历史。历史目录在真实 home 下（slug 由
// realpath 派生，mkdtemp 随机段保证不撞真实项目），测试自建自清。
const claudeSlugDirOf = async (projectPath: string) =>
  join(homedir(), ".claude", "projects", projectToSlug(await realpath(projectPath)));

test("deleteProject skips history cleanup when claude slug is shared with a twin project", async () => {
  const service = new ProjectService(root);
  await mkdir(join(root, "a-b"));
  await mkdir(join(root, "a_b"));

  const slugDir = await claudeSlugDirOf(join(root, "a-b"));
  await mkdir(slugDir, { recursive: true });
  await writeFile(join(slugDir, "twin-guard.jsonl"), "{}\n");
  try {
    // 碰撞时不抛错：删除正常执行，只是历史目录保留（无法区分归属，保留是唯一安全选择）。
    await expect(service.deleteProject("a-b")).resolves.toMatchObject({
      deleted: true,
      projectName: "a-b",
      filesDeleted: false,
    });
    expect(await readFile(join(slugDir, "twin-guard.jsonl"), "utf8")).toBe("{}\n");
  } finally {
    await rm(slugDir, { recursive: true, force: true });
  }
});

test("renameProject skips history migration when claude slug is shared with a twin project", async () => {
  const service = new ProjectService(root);
  await mkdir(join(root, "a-b"));
  await mkdir(join(root, "a_b"));

  const slugDir = await claudeSlugDirOf(join(root, "a-b"));
  await mkdir(slugDir, { recursive: true });
  await writeFile(join(slugDir, "twin-guard.jsonl"), "{}\n");
  try {
    await service.renameProject("a-b", "c");
    // 旧 slug 目录原地保留（目录级 mv 被跳过），磁盘目录已改名。
    expect(await readFile(join(slugDir, "twin-guard.jsonl"), "utf8")).toBe("{}\n");
    expect((await stat(join(root, "c"))).isDirectory()).toBe(true);
  } finally {
    await rm(slugDir, { recursive: true, force: true });
  }
});

test("deleteProject still clears agent history when the slug is exclusive", async () => {
  // 对照组：无孪生 → 历史清理正常执行（防护只跳过共享 slug；excludeName 漏传导致恒跳过
  // 的回归会在此暴露）。
  const service = new ProjectService(root);
  await mkdir(join(root, "solo"));

  const slugDir = await claudeSlugDirOf(join(root, "solo"));
  await mkdir(slugDir, { recursive: true });
  await writeFile(join(slugDir, "solo.jsonl"), "{}\n");

  await service.deleteProject("solo");
  await expect(stat(slugDir)).rejects.toMatchObject({ code: "ENOENT" });
});
