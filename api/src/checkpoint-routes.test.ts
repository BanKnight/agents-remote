// Turn checkpoint 路由级集成测试（T3 学习点③）：真 git 仓库 + 真 CheckpointService，
// 只 stub 执行层（对话 fork / WS 关闭）。覆盖两条「写错了探针也测不出」的语义：
// 1) `expectedCommit` 比对的是客户端读到的 endpoint，不是服务端裁决的恢复目标（baseline）；
// 2) 对话能力前置闸必须早于文件恢复（否则工作区已改却报 400）。
import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CheckpointService } from "./checkpoint-service";
import { SessionRegistry } from "./session-registry";
import {
  handleSessionRoutes,
  type SessionCheckpointsDeps,
  type SessionCheckpointRouteMatch,
} from "./session-routes";
import type { ClaudeRuntime } from "./claude-runtime";
import type { ClaudeStreamController } from "./claude-stream";

let root: string;
let projectsRoot: string;
let runDir: string;
let projectPath: string;
let registry: SessionRegistry;
let service: CheckpointService;
let rollbackCalls: unknown[][];
let deps: SessionCheckpointsDeps;

const git = async (args: string[]) => {
  const proc = Bun.spawn({
    cmd: ["git", "-C", projectPath, ...args],
    stderr: "pipe",
    stdout: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (exitCode !== 0) throw new Error(`git ${args.join(" ")} failed: ${stderr || stdout}`);
  return stdout.trim();
};

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "agents-remote-checkpoint-routes-"));
  projectsRoot = join(root, "projects");
  projectPath = join(projectsRoot, "demo");
  runDir = join(root, "run");
  await mkdir(projectPath, { recursive: true });
  await mkdir(runDir, { recursive: true });
  await git(["init"]);
  await git(["config", "user.email", "test@example.com"]);
  await git(["config", "user.name", "Test User"]);
  await writeFile(join(projectPath, "a.txt"), "v1\n");
  await git(["add", "-A"]);
  await git(["commit", "-m", "init"]);

  registry = new SessionRegistry({
    runDir,
    runtime: {
      async exists() {
        return false;
      },
      async close() {},
      async listAliveRuntimeKeys() {
        return new Set<string>();
      },
    },
  });
  service = new CheckpointService();
  rollbackCalls = [];
  deps = {
    checkpoints: service,
    claudeRuntime: {
      async rollbackConversation(...args: unknown[]) {
        rollbackCalls.push(args);
      },
    } as unknown as ClaudeRuntime,
    claudeStream: { closeSessionSockets() {} } as unknown as ClaudeStreamController,
  };
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const newSession = async () => {
  const created = await registry.createAgentSession({
    project: { name: "demo", path: projectPath },
    provider: "claude",
  });
  return created.id;
};

const call = (
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<Response | undefined> => {
  const url = `http://localhost${path}`;
  const req = new Request(url, {
    ...(options.method ? { method: options.method } : {}),
    ...(options.body !== undefined
      ? { headers: { "content-type": "application/json" }, body: JSON.stringify(options.body) }
      : {}),
  });
  return handleSessionRoutes(
    req,
    new URL(url),
    projectsRoot,
    registry,
    undefined,
    undefined,
    undefined,
    deps,
  );
};

const listPath = (sessionId: string) =>
  `/api/projects/demo/agent-sessions/${sessionId}/checkpoints`;
const rollbackPath = (sessionId: string, ordinal: number) =>
  `${listPath(sessionId)}/${ordinal}/rollback`;

/** 一轮完整 turn：baseline（v1）→ 改成 v2 → endpoint。返回两个 commit。 */
const captureTurn = async (sessionId: string, ordinal: number) => {
  const at = "2026-11-14T00:00:00.000Z";
  const baseline = await service.capture({
    projectPath,
    sessionId,
    ordinal,
    phase: "baseline",
    anchorUuid: `anchor-${ordinal}`,
    at,
  });
  await writeFile(join(projectPath, "a.txt"), `v${ordinal + 1}\n`);
  const endpoint = await service.capture({
    projectPath,
    sessionId,
    ordinal,
    phase: "endpoint",
    anchorUuid: `anchor-${ordinal}`,
    endUuid: `end-${ordinal}`,
    at,
  });
  return { baseline: baseline.commit, endpoint: endpoint.commit };
};

test("list 投影 endpoint 摘要；rollback 的 expectedCommit 比对 endpoint（不是恢复目标 baseline）", async () => {
  const sessionId = await newSession();
  const commits = await captureTurn(sessionId, 1);

  const listRes = await call(listPath(sessionId));
  expect(listRes?.status).toBe(200);
  const list = (await listRes!.json()) as {
    repository: boolean;
    checkpoints: Array<{ ordinal: number; commit: string; anchorUuid: string | null }>;
  };
  expect(list.repository).toBe(true);
  expect(list.checkpoints).toHaveLength(1);
  expect(list.checkpoints[0]!.commit).toBe(commits.endpoint);
  expect(list.checkpoints[0]!.anchorUuid).toBe("anchor-1");

  // 客户端读到的是 endpoint；拿恢复目标（baseline）当 expectedCommit 必须 409。
  const conflict = await call(rollbackPath(sessionId, 1), {
    method: "POST",
    body: { restoreFiles: true, restoreConversation: false, expectedCommit: commits.baseline },
  });
  expect(conflict?.status).toBe(409);
  expect(((await conflict!.json()) as { error: { code: string } }).error.code).toBe(
    "CHECKPOINT_CONFLICT",
  );

  // 正路：endpoint 匹配 → 恢复到本轮 baseline 的内容（v1）。
  await writeFile(join(projectPath, "a.txt"), "dirty\n");
  const ok = await call(rollbackPath(sessionId, 1), {
    method: "POST",
    body: { restoreFiles: true, restoreConversation: false, expectedCommit: commits.endpoint },
  });
  expect(ok?.status).toBe(200);
  const body = (await ok!.json()) as { backupRef?: string; warnings: string[] };
  expect(body.backupRef).toBeString();
  expect(await readFile(join(projectPath, "a.txt"), "utf8")).toBe("v1\n");
});

test("对话能力前置闸早于文件恢复：terminal 形态 → 400 且工作区未动", async () => {
  // claude 会话创建即钉 claudeSessionId（--session-id），真实降级面是 terminal 形态。
  const sessionId = await newSession();
  await registry.setAgentSessionMode(sessionId, "terminal");
  const commits = await captureTurn(sessionId, 1);
  await writeFile(join(projectPath, "a.txt"), "dirty\n");

  const res = await call(rollbackPath(sessionId, 1), {
    method: "POST",
    body: { restoreFiles: true, restoreConversation: true, expectedCommit: commits.endpoint },
  });
  expect(res?.status).toBe(400);
  expect(((await res!.json()) as { error: { code: string } }).error.code).toBe(
    "CONVERSATION_ROLLBACK_UNAVAILABLE",
  );
  // 关键断言：不可逆动作一步都没做。
  expect(await readFile(join(projectPath, "a.txt"), "utf8")).toBe("dirty\n");
  expect(rollbackCalls).toHaveLength(0);
});

test("对话回滚走 fork：anchor 取上一轮 endUuid；首轮 anchor=null", async () => {
  const sessionId = await newSession();
  await registry.setClaudeSessionId(sessionId, "claude-old");
  const commits = await captureTurn(sessionId, 1);

  const first = await call(rollbackPath(sessionId, 1), {
    method: "POST",
    body: { restoreFiles: false, restoreConversation: true, expectedCommit: commits.endpoint },
  });
  expect(first?.status).toBe(200);
  expect(rollbackCalls).toHaveLength(1);
  // rollbackConversation(runtimeKey, projectPath, projectName, sessionId, oldId, resumeAt, ...)
  expect(rollbackCalls[0]![4]).toBe("claude-old");
  expect(rollbackCalls[0]![5]).toBeNull();

  const commits2 = await captureTurn(sessionId, 2);
  const second = await call(rollbackPath(sessionId, 2), {
    method: "POST",
    body: { restoreFiles: false, restoreConversation: true, expectedCommit: commits2.endpoint },
  });
  expect(second?.status).toBe(200);
  expect(rollbackCalls[1]![5]).toBe("end-1");
});

test("working 会话 → 409 CHECKPOINT_BUSY（不可逆动作前拦下）", async () => {
  const sessionId = await newSession();
  const commits = await captureTurn(sessionId, 1);
  await registry.setAgentSessionStatus(sessionId, "working");

  const res = await call(rollbackPath(sessionId, 1), {
    method: "POST",
    body: { restoreFiles: true, restoreConversation: false, expectedCommit: commits.endpoint },
  });
  expect(res?.status).toBe(409);
  expect(((await res!.json()) as { error: { code: string } }).error.code).toBe("CHECKPOINT_BUSY");
});

test("双开关都 false → 400；GET rollback（非 POST）→ 405；未装配 deps → 404", async () => {
  const sessionId = await newSession();
  const commits = await captureTurn(sessionId, 1);

  const empty = await call(rollbackPath(sessionId, 1), {
    method: "POST",
    body: { restoreFiles: false, restoreConversation: false, expectedCommit: commits.endpoint },
  });
  expect(empty?.status).toBe(400);

  const get = await call(rollbackPath(sessionId, 1), { method: "GET" });
  expect(get?.status).toBe(405);

  const url = `http://localhost${listPath(sessionId)}`;
  const unwired = await handleSessionRoutes(new Request(url), new URL(url), projectsRoot, registry);
  expect(unwired?.status).toBe(404);
});

test("turn 进行中（in-flight）但 metadata 仍报 idle → 409 CHECKPOINT_BUSY", async () => {
  const sessionId = await newSession();
  const commits = await captureTurn(sessionId, 1);
  // metadata 落盘滞后：会话刚起 turn，status 还没写成 working。
  deps.turnCheckpointer = {
    hasInFlight: () => true,
  } as unknown as SessionCheckpointsDeps["turnCheckpointer"];

  const res = await call(rollbackPath(sessionId, 1), {
    method: "POST",
    body: { restoreFiles: true, restoreConversation: false, expectedCommit: commits.endpoint },
  });
  expect(res?.status).toBe(409);
  expect(((await res!.json()) as { error: { code: string } }).error.code).toBe("CHECKPOINT_BUSY");
});

test("上轮无 endUuid（捕获降级）→ 对话回滚前置闸 400，工作区未动", async () => {
  const sessionId = await newSession();
  await registry.setClaudeSessionId(sessionId, "claude-old");
  const at = "2026-11-14T00:00:00.000Z";
  // 第 1 轮：endpoint 缺 endUuid（端上是捕获降级/无输出）。
  await service.capture({
    projectPath,
    sessionId,
    ordinal: 1,
    phase: "baseline",
    anchorUuid: "anchor-1",
    at,
  });
  await service.capture({
    projectPath,
    sessionId,
    ordinal: 1,
    phase: "endpoint",
    anchorUuid: "anchor-1",
    at,
  });
  const commits = await captureTurn(sessionId, 2);
  await writeFile(join(projectPath, "a.txt"), "dirty\n");

  const res = await call(rollbackPath(sessionId, 2), {
    method: "POST",
    body: { restoreFiles: true, restoreConversation: true, expectedCommit: commits.endpoint },
  });
  expect(res?.status).toBe(400);
  expect(((await res!.json()) as { error: { code: string } }).error.code).toBe(
    "CONVERSATION_ROLLBACK_UNAVAILABLE",
  );
  expect(await readFile(join(projectPath, "a.txt"), "utf8")).toBe("dirty\n");
  expect(rollbackCalls).toHaveLength(0);
});

test("路径解析不看 method：三个 verb 各自钉死 GET/GET/POST", async () => {
  const sessionId = await newSession();
  const commits = await captureTurn(sessionId, 1);

  // POST 到列表路径若被当查询执行，会给外部调用方一个「看似可写」的端点。
  const postList = await call(listPath(sessionId), { method: "POST", body: {} });
  expect(postList?.status).toBe(405);

  const postDiff = await call(`${listPath(sessionId)}/1/diff`, { method: "POST", body: {} });
  expect(postDiff?.status).toBe(405);

  const getDiff = await call(`${listPath(sessionId)}/1/diff`);
  expect(getDiff?.status).toBe(200);
  expect(commits.endpoint).toBeString();
});

// 类型守卫：路由匹配类型在测试里也走白名单语义（8 段路径解析由 matchSessionRoute 覆盖）。
const _route: SessionCheckpointRouteMatch = { verb: "rollback", ordinal: 1 };
void _route;
