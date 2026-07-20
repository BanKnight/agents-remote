import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AuthService } from "./auth";
import { createFetchHandler } from "./index";
import { ProjectFilesService } from "./project-files";
import { ProjectGitDiffService } from "./project-git-diff";
import { ProjectService } from "./projects";
import { SessionRegistry } from "./session-registry";
let root: string;
let runDir: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "agents-remote-api-projects-"));
  runDir = await mkdtemp(join(tmpdir(), "agents-remote-api-run-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  await rm(runDir, { recursive: true, force: true });
});

const createTestHandler = () => {
  const auth = new AuthService({
    appPassword: "secret",
    tokenSecret: "test-secret",
    now: () => new Date("2026-05-24T00:00:00.000Z"),
  });
  const sessionRegistry = new SessionRegistry({
    runDir,
    now: () => new Date("2026-05-25T00:00:00.000Z"),
    createId: (type) => (type === "agent" ? "agent_test123456" : "terminal_test123456"),
  });
  const projectService = new ProjectService(root, sessionRegistry);
  const projectFilesService = new ProjectFilesService(root);
  const projectGitDiffService = new ProjectGitDiffService(root);

  return {
    auth,
    sessionRegistry,
    handler: createFetchHandler(auth, {
      projectFilesService,
      projectGitDiffService,
      projectService,
      projectsRoot: root,
      sessionRegistry,
    }),
  };
};

const authHeader = (auth: AuthService) => ({
  authorization: `Bearer ${auth.login("secret").token}`,
});

test("api smoke paths stay under /api", () => {
  expect("/api/health".startsWith("/api")).toBe(true);
  expect("/api/ws/echo".startsWith("/api")).toBe(true);
});

test("createFetchHandler keeps health public", async () => {
  const handler = createFetchHandler(
    new AuthService({ appPassword: "secret", tokenSecret: "test-secret" }),
  );
  const response = await handler(new Request("http://localhost/api/health"), {
    upgrade: () => false,
  });
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(body.service).toBe("api");
});

test("createFetchHandler protects unknown api routes", async () => {
  const handler = createFetchHandler(
    new AuthService({ appPassword: "secret", tokenSecret: "test-secret" }),
  );
  const response = await handler(new Request("http://localhost/api/projects"), {
    upgrade: () => false,
  });
  const body = await response.json();

  expect(response.status).toBe(401);
  expect(body.error.code).toBe("UNAUTHENTICATED");
});

test("createFetchHandler supports login then authenticated unknown api requests", async () => {
  const auth = new AuthService({
    appPassword: "secret",
    tokenSecret: "test-secret",
    now: () => new Date("2026-05-24T00:00:00.000Z"),
  });
  const handler = createFetchHandler(auth);
  const loginResponse = await handler(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ password: "secret" }),
    }),
    { upgrade: () => false },
  );
  const loginBody = await loginResponse.json();
  const response = await handler(
    new Request("http://localhost/api/projects", {
      headers: { authorization: `Bearer ${loginBody.token}` },
    }),
    { upgrade: () => false },
  );

  expect(response.status).toBe(404);
});

test("createFetchHandler protects websocket upgrade", async () => {
  const auth = new AuthService({
    appPassword: "secret",
    tokenSecret: "test-secret",
    now: () => new Date("2026-05-24T00:00:00.000Z"),
  });
  const handler = createFetchHandler(auth);
  const blocked = await handler(new Request("http://localhost/api/ws/echo"), {
    upgrade: () => true,
  });
  const issue = auth.login("secret");
  const upgraded = await handler(new Request(`http://localhost/api/ws/echo?token=${issue.token}`), {
    upgrade: () => true,
  });

  expect(blocked?.status).toBe(401);
  expect(upgraded).toBeUndefined();
});

test("createFetchHandler lists projects for authenticated requests", async () => {
  await mkdir(join(root, "demo"));
  const { auth, handler } = createTestHandler();
  const response = await handler(
    new Request("http://localhost/api/projects", {
      headers: authHeader(auth),
    }),
    { upgrade: () => false },
  );
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(body.projects).toEqual([
    {
      name: "demo",
      path: join(root, "demo"),
      agentSessionCount: 0,
      terminalSessionCount: 0,
    },
  ]);
});

test("createFetchHandler aggregates overview across projects in a single request", async () => {
  await mkdir(join(root, "demo"));
  const { auth, handler, sessionRegistry } = createTestHandler();
  const project = { name: "demo", path: join(root, "demo") };
  await sessionRegistry.createAgentSession({ project, provider: "claude" });
  await sessionRegistry.createTerminalSession({ project });

  const response = await handler(
    new Request("http://localhost/api/overview", { headers: authHeader(auth) }),
    { upgrade: () => false },
  );
  const body = await response.json();

  expect(response.status).toBe(200);
  // projectNames 来自 readdir（含无 session 的项目也会列；这里 demo 有 2 session）。
  expect(body.projectNames).toEqual(["demo"]);
  expect(body.candidates).toHaveLength(2);
  expect(body.candidates.map((c: { type: string }) => c.type).sort()).toEqual([
    "agent",
    "terminal",
  ]);
  // 候选带 project/session 标识，供前端拼 ref。
  for (const candidate of body.candidates) {
    expect(candidate.projectName).toBe("demo");
    expect(candidate.sessionId).toBeDefined();
    expect(candidate.displayName).toBeDefined();
  }
});

test("createFetchHandler creates projects and returns details", async () => {
  const { auth, handler } = createTestHandler();
  const createResponse = await handler(
    new Request("http://localhost/api/projects", {
      method: "POST",
      headers: authHeader(auth),
      body: JSON.stringify({ path: "hello world 中文" }),
    }),
    { upgrade: () => false },
  );
  const createBody = await createResponse.json();
  const detailResponse = await handler(
    new Request("http://localhost/api/projects/hello%20world%20%E4%B8%AD%E6%96%87", {
      headers: authHeader(auth),
    }),
    { upgrade: () => false },
  );
  const detailBody = await detailResponse.json();

  expect(createResponse.status).toBe(200);
  expect(createBody.project.name).toBe("hello world 中文");
  expect(detailResponse.status).toBe(200);
  expect(detailBody.project.path).toBe(join(root, "hello world 中文"));
});

test("createFetchHandler supports Project-scoped Agent and Terminal session APIs", async () => {
  await mkdir(join(root, "hello world 中文"));
  const { auth, handler } = createTestHandler();
  const headers = authHeader(auth);
  const projectPath = "hello%20world%20%E4%B8%AD%E6%96%87";

  const createAgent = await handler(
    new Request(`http://localhost/api/projects/${projectPath}/agent-sessions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ provider: "claude" }),
    }),
    { upgrade: () => false },
  );
  const agentBody = await createAgent.json();
  const createTerminal = await handler(
    new Request(`http://localhost/api/projects/${projectPath}/terminal-sessions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ displayName: "Project shell" }),
    }),
    { upgrade: () => false },
  );
  const terminalBody = await createTerminal.json();
  const listAgents = await handler(
    new Request(`http://localhost/api/projects/${projectPath}/agent-sessions`, { headers }),
    { upgrade: () => false },
  );
  const listTerminals = await handler(
    new Request(`http://localhost/api/projects/${projectPath}/terminal-sessions`, { headers }),
    { upgrade: () => false },
  );
  const agentDetail = await handler(
    new Request(`http://localhost/api/projects/${projectPath}/agent-sessions/agent_test123456`, {
      headers,
    }),
    { upgrade: () => false },
  );
  const terminalDetail = await handler(
    new Request(
      `http://localhost/api/projects/${projectPath}/terminal-sessions/terminal_test123456`,
      {
        headers,
      },
    ),
    { upgrade: () => false },
  );
  const projectDetail = await handler(
    new Request(`http://localhost/api/projects/${projectPath}`, { headers }),
    { upgrade: () => false },
  );

  expect(createAgent.status).toBe(200);
  expect(agentBody.session).toMatchObject({
    id: "agent_test123456",
    projectName: "hello world 中文",
    provider: "claude",
    status: "running",
  });
  expect(createTerminal.status).toBe(200);
  expect(terminalBody.session).toMatchObject({
    id: "terminal_test123456",
    projectName: "hello world 中文",
    displayName: "Project shell",
    status: "running",
  });
  expect((await listAgents.json()).sessions).toHaveLength(1);
  expect((await listTerminals.json()).sessions).toHaveLength(1);
  expect((await agentDetail.json()).session.provider).toBe("claude");
  expect((await terminalDetail.json()).session.displayName).toBe("Project shell");
  expect((await projectDetail.json()).project).toMatchObject({
    agentSessionCount: 1,
    terminalSessionCount: 1,
  });
});

test("createFetchHandler protects session APIs and maps session errors", async () => {
  await mkdir(join(root, "demo"));
  const { auth, handler } = createTestHandler();
  const blocked = await handler(
    new Request("http://localhost/api/projects/demo/terminal-sessions", { method: "POST" }),
    { upgrade: () => false },
  );
  const invalidProvider = await handler(
    new Request("http://localhost/api/projects/demo/agent-sessions", {
      method: "POST",
      headers: authHeader(auth),
      body: JSON.stringify({ provider: "unknown" }),
    }),
    { upgrade: () => false },
  );
  const missing = await handler(
    new Request("http://localhost/api/projects/demo/terminal-sessions/missing", {
      headers: authHeader(auth),
    }),
    { upgrade: () => false },
  );

  expect(blocked.status).toBe(401);
  expect((await blocked.json()).error.code).toBe("UNAUTHENTICATED");
  expect(invalidProvider.status).toBe(400);
  expect((await invalidProvider.json()).error.code).toBe("SESSION_PROVIDER_UNAVAILABLE");
  expect(missing.status).toBe(404);
  expect((await missing.json()).error.code).toBe("SESSION_NOT_FOUND");
});

test("createFetchHandler closes sessions through Project-scoped action routes", async () => {
  await mkdir(join(root, "demo"));
  const { auth, handler } = createTestHandler();
  const headers = authHeader(auth);

  await handler(
    new Request("http://localhost/api/projects/demo/terminal-sessions", {
      method: "POST",
      headers,
      body: JSON.stringify({}),
    }),
    { upgrade: () => false },
  );
  const close = await handler(
    new Request("http://localhost/api/projects/demo/terminal-sessions/terminal_test123456/close", {
      method: "POST",
      headers,
    }),
    { upgrade: () => false },
  );
  const list = await handler(
    new Request("http://localhost/api/projects/demo/terminal-sessions", { headers }),
    { upgrade: () => false },
  );

  expect(close.status).toBe(200);
  expect((await close.json()).session.status).toBe("closed");
  expect((await list.json()).sessions).toEqual([]);
});

test("createFetchHandler serves Project-scoped file browsing and preview", async () => {
  await mkdir(join(root, "demo", "src"), { recursive: true });
  await mkdir(join(root, "demo", ".config"));
  await writeFile(join(root, "demo", "src", "index.ts"), "console.log('ok')\n");
  await writeFile(join(root, "demo", "image.png"), Buffer.from([1, 2, 3]));
  const { auth, handler } = createTestHandler();
  const headers = authHeader(auth);

  const list = await handler(new Request("http://localhost/api/projects/demo/files", { headers }), {
    upgrade: () => false,
  });
  const listBody = await list.json();
  const nested = await handler(
    new Request("http://localhost/api/projects/demo/files?path=src", { headers }),
    { upgrade: () => false },
  );
  const text = await handler(
    new Request("http://localhost/api/projects/demo/files/preview?path=src%2Findex.ts", {
      headers,
    }),
    { upgrade: () => false },
  );
  const image = await handler(
    new Request("http://localhost/api/projects/demo/files/preview?path=image.png", { headers }),
    { upgrade: () => false },
  );
  const escape = await handler(
    new Request("http://localhost/api/projects/demo/files?path=..%2Fother", { headers }),
    { upgrade: () => false },
  );

  expect(list.status).toBe(200);
  expect(listBody.entries.map((entry: { name: string }) => entry.name)).toEqual([
    "src",
    "image.png",
  ]);
  expect((await nested.json()).parentPath).toBe("");
  expect(await text.json()).toMatchObject({ type: "text", content: "console.log('ok')\n" });
  expect(await image.json()).toMatchObject({ type: "image", mediaType: "image/png" });
  expect(escape.status).toBe(400);
  expect((await escape.json()).error.code).toBe("PROJECT_PATH_OUTSIDE_ROOT");
});

test("createFetchHandler serves Project-scoped Git diff routes", async () => {
  const projectPath = join(root, "demo");
  await mkdir(projectPath);
  await git(projectPath, ["init"]);
  await git(projectPath, ["config", "user.email", "test@example.com"]);
  await git(projectPath, ["config", "user.name", "Test User"]);
  await writeFile(join(projectPath, "tracked.txt"), "initial\n");
  await git(projectPath, ["add", "."]);
  await git(projectPath, ["commit", "-m", "initial"]);
  await writeFile(join(projectPath, "tracked.txt"), "changed\n");
  await writeFile(join(projectPath, "staged.txt"), "staged\n");
  await git(projectPath, ["add", "staged.txt"]);
  const { auth, handler } = createTestHandler();
  const headers = authHeader(auth);

  const list = await handler(
    new Request("http://localhost/api/projects/demo/git/diff", { headers }),
    {
      upgrade: () => false,
    },
  );
  const listBody = await list.json();
  const worktreeDiff = await handler(
    new Request(
      "http://localhost/api/projects/demo/git/diff/file?scope=worktree&path=tracked.txt",
      {
        headers,
      },
    ),
    { upgrade: () => false },
  );
  const stagedDiff = await handler(
    new Request("http://localhost/api/projects/demo/git/diff/file?scope=staged&path=staged.txt", {
      headers,
    }),
    { upgrade: () => false },
  );
  const invalidScope = await handler(
    new Request("http://localhost/api/projects/demo/git/diff/file?scope=bad&path=tracked.txt", {
      headers,
    }),
    { upgrade: () => false },
  );

  expect(list.status).toBe(200);
  // toMatchObject：行数（addedLines/removedLines）+ branch 字段是 numstat/rev-parse 算出的，
  // 不在集成断言里精确绑定；行数语义单测在 project-git-diff.test.ts 覆盖。
  expect(listBody.files).toMatchObject([
    { path: "staged.txt", status: "added", scope: "staged" },
    { path: "tracked.txt", status: "modified", scope: "worktree" },
  ]);
  expect(worktreeDiff.status).toBe(200);
  expect(await worktreeDiff.json()).toMatchObject({
    path: "tracked.txt",
    scope: "worktree",
    status: "modified",
    diff: expect.stringContaining("+changed"),
  });
  expect(stagedDiff.status).toBe(200);
  expect(await stagedDiff.json()).toMatchObject({
    path: "staged.txt",
    scope: "staged",
    status: "added",
    diff: expect.stringContaining("+staged"),
  });
  expect(invalidScope.status).toBe(400);
  expect((await invalidScope.json()).error.code).toBe("PROJECT_GIT_SCOPE_INVALID");
});

test("createFetchHandler serves Git branch/log/ahead-behind routes", async () => {
  const projectPath = join(root, "demo");
  const upstreamPath = join(root, "upstream.git");
  await mkdir(projectPath);
  await git(projectPath, ["init"]);
  await git(projectPath, ["branch", "-m", "main"]);
  await git(projectPath, ["config", "user.email", "test@example.com"]);
  await git(projectPath, ["config", "user.name", "Test User"]);
  await writeFile(join(projectPath, "a.txt"), "a\n");
  await git(projectPath, ["add", "."]);
  await git(projectPath, ["commit", "-m", "first"]);
  await git(projectPath, ["init", "--bare", upstreamPath]);
  await git(projectPath, ["remote", "add", "origin", upstreamPath]);
  await git(projectPath, ["push", "-u", "origin", "main"]);
  // 本地领先 1（push 后再 1 commit）。
  await writeFile(join(projectPath, "b.txt"), "b\n");
  await git(projectPath, ["add", "."]);
  await git(projectPath, ["commit", "-m", "second"]);
  const { auth, handler } = createTestHandler();
  const headers = authHeader(auth);

  const branches = await handler(
    new Request("http://localhost/api/projects/demo/git/branches", { headers }),
    { upgrade: () => false },
  );
  expect(branches.status).toBe(200);
  const branchesBody = await branches.json();
  expect(branchesBody.current).toBe("main");
  expect(branchesBody.branches.some((b: { name: string }) => b.name === "main")).toBe(true);

  const log = await handler(
    new Request("http://localhost/api/projects/demo/git/log?branch=main", { headers }),
    { upgrade: () => false },
  );
  expect(log.status).toBe(200);
  const logBody = await log.json();
  expect(logBody.branch).toBe("main");
  expect(logBody.commits.length).toBeGreaterThanOrEqual(2);

  const aheadBehind = await handler(
    new Request("http://localhost/api/projects/demo/git/ahead-behind", { headers }),
    { upgrade: () => false },
  );
  expect(aheadBehind.status).toBe(200);
  const aheadBehindBody = await aheadBehind.json();
  expect(aheadBehindBody.upstream).toBe("origin/main");
  expect(aheadBehindBody.ahead).toBe(1);
  expect(aheadBehindBody.aheadCommits).toHaveLength(1);

  // 非法 branch ref → PROJECT_GIT_SCOPE_INVALID (400)。
  const invalid = await handler(
    new Request("http://localhost/api/projects/demo/git/log?branch=bad;ref", { headers }),
    { upgrade: () => false },
  );
  expect(invalid.status).toBe(400);
  expect((await invalid.json()).error.code).toBe("PROJECT_GIT_SCOPE_INVALID");
});

test("createFetchHandler serves Git compare routes", async () => {
  const projectPath = join(root, "demo");
  await mkdir(projectPath);
  await git(projectPath, ["init"]);
  await git(projectPath, ["branch", "-m", "main"]);
  await git(projectPath, ["config", "user.email", "test@example.com"]);
  await git(projectPath, ["config", "user.name", "Test User"]);
  await writeFile(join(projectPath, "a.txt"), "a\nb\nc\n");
  await git(projectPath, ["add", "."]);
  await git(projectPath, ["commit", "-m", "initial"]);
  await git(projectPath, ["checkout", "-b", "feature"]);
  await writeFile(join(projectPath, "a.txt"), "a\nb\nc\nd\n");
  await writeFile(join(projectPath, "b.txt"), "new\n");
  await git(projectPath, ["add", "."]);
  await git(projectPath, ["commit", "-m", "feature"]);
  const { auth, handler } = createTestHandler();
  const headers = authHeader(auth);

  const list = await handler(
    new Request("http://localhost/api/projects/demo/git/compare?base=main&compare=feature", {
      headers,
    }),
    { upgrade: () => false },
  );
  expect(list.status).toBe(200);
  const listBody = await list.json();
  expect(listBody).toMatchObject({ base: "main", compare: "feature" });
  expect(listBody.files).toMatchObject([
    { path: "a.txt", status: "modified" },
    { path: "b.txt", status: "added" },
  ]);

  const fileDiff = await handler(
    new Request(
      "http://localhost/api/projects/demo/git/compare/file?base=main&compare=feature&path=a.txt",
      { headers },
    ),
    { upgrade: () => false },
  );
  expect(fileDiff.status).toBe(200);
  expect(await fileDiff.json()).toMatchObject({
    base: "main",
    compare: "feature",
    path: "a.txt",
    status: "modified",
    diff: expect.stringContaining("+d"),
  });

  // 非法 base ref → PROJECT_GIT_SCOPE_INVALID (400)。
  const invalid = await handler(
    new Request("http://localhost/api/projects/demo/git/compare?base=bad;ref&compare=main", {
      headers,
    }),
    { upgrade: () => false },
  );
  expect(invalid.status).toBe(400);
  expect((await invalid.json()).error.code).toBe("PROJECT_GIT_SCOPE_INVALID");
});

test("createFetchHandler returns non-Git repository state", async () => {
  await mkdir(join(root, "demo"));
  const { auth, handler } = createTestHandler();
  const headers = authHeader(auth);

  const list = await handler(
    new Request("http://localhost/api/projects/demo/git/diff", { headers }),
    {
      upgrade: () => false,
    },
  );
  const file = await handler(
    new Request("http://localhost/api/projects/demo/git/diff/file?scope=worktree&path=file.txt", {
      headers,
    }),
    { upgrade: () => false },
  );

  expect(list.status).toBe(200);
  expect(await list.json()).toEqual({
    repository: false,
    projectName: "demo",
    reason: "not_git_repository",
  });
  expect(file.status).toBe(400);
  expect((await file.json()).error.code).toBe("PROJECT_GIT_NOT_REPOSITORY");
});

test("createFetchHandler maps project errors", async () => {
  await writeFile(join(root, "file"), "content");
  const { auth, handler } = createTestHandler();
  const missingPath = await handler(
    new Request("http://localhost/api/projects", {
      method: "POST",
      headers: authHeader(auth),
      body: JSON.stringify({}),
    }),
    { upgrade: () => false },
  );
  const fileTarget = await handler(
    new Request("http://localhost/api/projects", {
      method: "POST",
      headers: authHeader(auth),
      body: JSON.stringify({ path: "file" }),
    }),
    { upgrade: () => false },
  );
  const outsideTarget = await handler(
    new Request("http://localhost/api/projects", {
      method: "POST",
      headers: authHeader(auth),
      body: JSON.stringify({ path: join(root, "demo", "nested") }),
    }),
    { upgrade: () => false },
  );
  const missingDetail = await handler(
    new Request("http://localhost/api/projects/missing", {
      headers: authHeader(auth),
    }),
    { upgrade: () => false },
  );

  expect(missingPath.status).toBe(400);
  expect((await missingPath.json()).error.code).toBe("PROJECT_TARGET_INVALID");
  expect(fileTarget.status).toBe(400);
  expect((await fileTarget.json()).error.code).toBe("PROJECT_TARGET_INVALID");
  expect(outsideTarget.status).toBe(400);
  expect((await outsideTarget.json()).error.code).toBe("PROJECT_TARGET_INVALID");
  expect(missingDetail.status).toBe(404);
  expect((await missingDetail.json()).error.code).toBe("PROJECT_NOT_FOUND");
});

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
