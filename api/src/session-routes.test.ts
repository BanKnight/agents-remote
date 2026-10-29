import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { listCodexHistory } from "./codex-history";
import { projectToSlug } from "./agent-history";
import type { AgentTuiController } from "./agent-tui";
import { ompSessionSlug } from "./omp-history";
import { SessionRegistry } from "./session-registry";
import { handleSessionRoutes } from "./session-routes";

// handler 级集成测试：真实 home 下的隔离 slug 目录（与 agent-history.test.ts / omp-history.test.ts
// 同款策略）+ stub runtime（不 spawn tmux）。fixture 目录名来自临时 projectsRoot 派生的唯一 slug，
// 清理只删自己创建的目录。
let projectsRoot: string;
let runDir: string;
let registry: SessionRegistry;
let claudeSlugDir: string;
let ompSlugDir: string;
let codexHome: string;

beforeEach(async () => {
  // projectsRoot 必须在 home 内：omp 历史只扫 home 内路径（ompSessionSlug home 外 → null）。
  projectsRoot = await mkdtemp(join(homedir(), ".ar-test-session-routes-projects-"));
  runDir = await mkdtemp(join(tmpdir(), "ar-session-routes-run-"));
  // codex 扫描根走 CODEX_HOME seam：全文件统一指空 temp home（不碰真实 ~/.codex）。
  codexHome = await mkdtemp(join(tmpdir(), "ar-session-routes-codexhome-"));
  process.env.CODEX_HOME = codexHome;
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
  const projectPath = join(projectsRoot, "mergeproj");
  await mkdir(projectPath, { recursive: true });
  claudeSlugDir = join(homedir(), ".claude", "projects", projectToSlug(projectPath));
  ompSlugDir = join(homedir(), ".omp", "agent", "sessions", ompSessionSlug(projectPath) ?? "");
  await rm(claudeSlugDir, { recursive: true, force: true });
  await rm(ompSlugDir, { recursive: true, force: true });
  await mkdir(claudeSlugDir, { recursive: true });
  await mkdir(ompSlugDir, { recursive: true });
});

afterEach(async () => {
  await rm(projectsRoot, { recursive: true, force: true });
  await rm(runDir, { recursive: true, force: true });
  await rm(claudeSlugDir, { recursive: true, force: true });
  await rm(ompSlugDir, { recursive: true, force: true });
  await rm(codexHome, { recursive: true, force: true });
  delete process.env.CODEX_HOME;
});

const historyRequest = (projectName = "mergeproj", query = "filter=all") => {
  const req = new Request(`http://localhost/api/projects/${projectName}/agent-history?${query}`);
  return handleSessionRoutes(req, new URL(req.url), projectsRoot, registry);
};

test("GET agent-history 合流 claude + omp 两路，lastActivityAt 统一降序", async () => {
  const now = Date.now();
  // omp（当前 mtime，最新）应排在两个 claude（显式老 mtime）之前；claude 之间新者在前。
  await writeFile(
    join(claudeSlugDir, "claude-1.jsonl"),
    JSON.stringify({ type: "ai-title", aiTitle: "c1" }),
  );
  await writeFile(
    join(claudeSlugDir, "claude-2.jsonl"),
    JSON.stringify({ type: "ai-title", aiTitle: "c2" }),
  );
  await writeFile(
    join(ompSlugDir, "20260916T01_omp-1.jsonl"),
    [
      JSON.stringify({ type: "title", title: "o1", updatedAt: 0, pad: "" }),
      JSON.stringify({
        type: "session",
        version: 3,
        id: "omp-1",
        timestamp: "2026-09-16T00:00:00.000Z",
      }),
    ].join("\n"),
  );
  await utimes(join(claudeSlugDir, "claude-1.jsonl"), new Date(now - 3000), new Date(now - 3000));
  await utimes(join(claudeSlugDir, "claude-2.jsonl"), new Date(now - 1000), new Date(now - 1000));

  const res = await historyRequest();
  expect(res?.status).toBe(200);
  const body = (await res?.json()) as {
    entries: { provider?: string; title: string | null }[];
    filter: string;
    counts: { all: number; active: number; ended: number };
    nextCursor: string | null;
  };
  // 新契约（v1.5 批5）：range 回显退役 → filter 回显 + counts 聚合 + 游标。
  expect(body.filter).toBe("all");
  expect(body.entries.map((e) => `${e.provider}:${e.title}`)).toEqual([
    "omp:o1",
    "claude:c2",
    "claude:c1",
  ]);
  expect(body.counts.all).toBe(3);
  expect(body.nextCursor).toBeNull();
});

test("POST agent-sessions（provider=omp）透传 acpSessionId；未知 provider → 400", async () => {
  const req = new Request("http://localhost/api/projects/mergeproj/agent-sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ provider: "omp", acpSessionId: "omp-sess-9" }),
  });
  const res = await handleSessionRoutes(req, new URL(req.url), projectsRoot, registry);
  expect(res?.status).toBe(200);
  const body = (await res?.json()) as { session: { provider: string; acpSessionId?: string } };
  expect(body.session.provider).toBe("omp");
  expect(body.session.acpSessionId).toBe("omp-sess-9");

  const badReq = new Request("http://localhost/api/projects/mergeproj/agent-sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ provider: "unknown-cli" }),
  });
  const badRes = await handleSessionRoutes(badReq, new URL(badReq.url), projectsRoot, registry);
  expect(badRes?.status).toBe(400);
});

// ── 双模式切换路由（mode 动作，2026-10-15）：守卫全表 ────────────────────────

/** 编排器 stub：记录目标 + 落盘（真实 tmux/CLI 起停在 agent-tui.test.ts 覆盖）。 */
const stubTui = (calls: string[]) =>
  ({
    async switchMode(metadata: { id: string }, target: "chat" | "terminal") {
      calls.push(`${metadata.id}:${target}`);
      await registry.setAgentSessionMode(metadata.id, target);
    },
  }) as unknown as AgentTuiController;

const modeRequest = (sessionId: string, mode: unknown) => {
  const req = new Request(
    `http://localhost/api/projects/mergeproj/agent-sessions/${sessionId}/mode`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode }),
    },
  );
  return { req, url: new URL(req.url) };
};

async function seedAgentSession(provider: string): Promise<string> {
  const session = await registry.createAgentSession({
    project: { name: "mergeproj", path: "" },
    provider,
  });
  return session.id;
}

test("POST mode：chat→terminal 落盘并交给编排器；同 mode 幂等不重起", async () => {
  const sessionId = await seedAgentSession("claude");
  const calls: string[] = [];
  const agentTui = stubTui(calls);

  const { req, url } = modeRequest(sessionId, "terminal");
  const res = await handleSessionRoutes(req, url, projectsRoot, registry, undefined, agentTui);
  expect(res?.status).toBe(200);
  const body = (await res!.json()) as { session: { mode?: string } };
  expect(body.session.mode).toBe("terminal");
  expect(calls).toEqual([`${sessionId}:terminal`]);

  // 同 mode（已是 terminal）幂等：直返当前形态，不再起停进程。
  const again = modeRequest(sessionId, "terminal");
  const againRes = await handleSessionRoutes(
    again.req,
    again.url,
    projectsRoot,
    registry,
    undefined,
    agentTui,
  );
  expect(againRes?.status).toBe(200);
  const againBody = (await againRes!.json()) as { session: { mode?: string } };
  expect(againBody.session.mode).toBe("terminal");
  expect(calls).toHaveLength(1);
});

test("POST mode：working / blocked → 409（严格 idle-only，绝不丢 turn）", async () => {
  const sessionId = await seedAgentSession("claude");
  const calls: string[] = [];
  const agentTui = stubTui(calls);

  for (const busy of ["working", "blocked"] as const) {
    await registry.setAgentSessionStatus(sessionId, busy);
    const { req, url } = modeRequest(sessionId, "terminal");
    const res = await handleSessionRoutes(req, url, projectsRoot, registry, undefined, agentTui);
    expect(res?.status).toBe(409);
    const busyBody = (await res!.json()) as { error: { code: string } };
    expect(busyBody.error.code).toBe("SESSION_STATE_CONFLICT");
  }
  expect(calls).toEqual([]);

  // done / error 是「最近一轮结果态」不是运行中——可切。
  await registry.setAgentSessionStatus(sessionId, "done");
  const { req, url } = modeRequest(sessionId, "terminal");
  const res = await handleSessionRoutes(req, url, projectsRoot, registry, undefined, agentTui);
  expect(res?.status).toBe(200);
});

test("POST mode：非 claude provider → 404；非法 mode → 400；未装配编排器 → 不接管", async () => {
  const ompId = await seedAgentSession("omp");
  const calls: string[] = [];
  const agentTui = stubTui(calls);

  const notClaude = modeRequest(ompId, "terminal");
  const notClaudeRes = await handleSessionRoutes(
    notClaude.req,
    notClaude.url,
    projectsRoot,
    registry,
    undefined,
    agentTui,
  );
  expect(notClaudeRes?.status).toBe(404);
  expect(calls).toEqual([]);

  const claudeId = await seedAgentSession("claude");
  const badMode = modeRequest(claudeId, "gui");
  const badModeRes = await handleSessionRoutes(
    badMode.req,
    badMode.url,
    projectsRoot,
    registry,
    undefined,
    agentTui,
  );
  expect(badModeRes?.status).toBe(400);
  const badModeBody = (await badModeRes!.json()) as { error: { code: string } };
  expect(badModeBody.error.code).toBe("SESSION_METADATA_ERROR");

  // 未装配编排器（E2E / 旧调用）：mode 路由不接管，落到后续 handler。
  const noTui = modeRequest(claudeId, "terminal");
  expect(await handleSessionRoutes(noTui.req, noTui.url, projectsRoot, registry)).toBeUndefined();
});

test("POST mode：codex 会话同路由切换（threadId 准入）；无 threadId 存量形态 → 400", async () => {
  const calls: string[] = [];
  const agentTui = stubTui(calls);

  const codex = await registry.createAgentSession({
    project: { name: "mergeproj", path: "" },
    provider: "codex",
    codexThreadId: "th-1",
  });
  const { req, url } = modeRequest(codex.id, "terminal");
  const res = await handleSessionRoutes(req, url, projectsRoot, registry, undefined, agentTui);
  expect(res?.status).toBe(200);
  expect(calls).toEqual([`${codex.id}:terminal`]);

  // 无 threadId 的存量 tmux 形态：探活判死（keepIfRuntimeExists 对无 threadId 的 codex
  // 返回 false）→ getAgentMetadata undefined → 404。路由内 400 分支是防御性保留。
  const legacy = await registry.createAgentSession({
    project: { name: "mergeproj", path: "" },
    provider: "codex",
  });
  const legacyReq = modeRequest(legacy.id, "terminal");
  const legacyRes = await handleSessionRoutes(
    legacyReq.req,
    legacyReq.url,
    projectsRoot,
    registry,
    undefined,
    agentTui,
  );
  expect(legacyRes?.status).toBe(404);
  expect(calls).toHaveLength(1);
});

// ── codex 历史第三路（批 F）─────────────────────────────────────────────────

const CODEX_THREAD_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CODEX_THREAD_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const writeRollout = async (threadId: string, opts: { cwd?: string; mtime?: Date } = {}) => {
  const dir = join(codexHome, "sessions", "2026", "10", "29");
  await mkdir(dir, { recursive: true });
  const path = join(dir, `rollout-2026-10-29T11-00-00-${threadId}.jsonl`);
  await writeFile(
    path,
    [
      {
        timestamp: "2026-10-29T03:00:00.000Z",
        ordinal: 0,
        type: "session_meta",
        payload: {
          id: threadId,
          timestamp: "2026-10-29T03:00:00.000Z",
          cwd: opts.cwd ?? join(projectsRoot, "mergeproj"),
        },
      },
      {
        timestamp: "2026-10-29T03:00:01.000Z",
        ordinal: 1,
        type: "event_msg",
        payload: { type: "user_message", message: `codex 首条消息 ${threadId.slice(0, 4)}` },
      },
    ]
      .map((l) => JSON.stringify(l))
      .join("\n"),
  );
  if (opts.mtime) await utimes(path, opts.mtime, opts.mtime);
};

const deleteHistoryRequest = (sessionId: string, provider: string) => {
  const req = new Request(
    `http://localhost/api/projects/mergeproj/agent-history/${sessionId}?provider=${provider}`,
    { method: "DELETE" },
  );
  return handleSessionRoutes(req, new URL(req.url), projectsRoot, registry);
};

test("GET agent-history 三路合流（claude+omp+codex），codex 按 cwd 过滤 + mtime 排序", async () => {
  const now = Date.now();
  await writeRollout(CODEX_THREAD_A, { mtime: new Date(now - 500) });
  // 其它项目的 codex 会话：cwd 不匹配 → 不出现在本项目响应里。
  await writeRollout(CODEX_THREAD_B, { cwd: "/elsewhere", mtime: new Date(now - 400) });
  await writeFile(
    join(claudeSlugDir, "claude-1.jsonl"),
    JSON.stringify({ type: "ai-title", aiTitle: "c1" }),
  );
  await utimes(join(claudeSlugDir, "claude-1.jsonl"), new Date(now - 2000), new Date(now - 2000));

  const res = await historyRequest();
  expect(res?.status).toBe(200);
  const body = (await res!.json()) as {
    entries: { provider?: string; codexThreadId?: string; firstMessage: string | null }[];
    counts: { all: number };
  };
  expect(body.entries.map((e) => e.provider)).toEqual(["codex", "claude"]);
  expect(body.entries[0].codexThreadId).toBe(CODEX_THREAD_A);
  expect(body.entries[0].firstMessage).toBe("codex 首条消息 aaaa");
  expect(body.counts.all).toBe(2);
  expect(body.nextCursor).toBeNull();
});

test("DELETE codex 历史条目：活跃（metadata.codexThreadId 挂载）409；非活跃删除成功", async () => {
  await writeRollout(CODEX_THREAD_A);
  await writeRollout(CODEX_THREAD_B);

  // 活跃：registry 里有 agent session 挂着该 threadId → 服务端拒绝。
  await registry.createAgentSession({
    project: { name: "mergeproj", path: "" },
    provider: "codex",
    codexThreadId: CODEX_THREAD_A,
  });
  const activeRes = await deleteHistoryRequest(CODEX_THREAD_A, "codex");
  expect(activeRes?.status).toBe(409);
  const activeBody = (await activeRes!.json()) as { error: { code: string } };
  expect(activeBody.error.code).toBe("SESSION_HISTORY_ACTIVE");

  // 非活跃：文件在 → 删除成功且文件消失（活跃的 A 条目不受影响）。
  const okRes = await deleteHistoryRequest(CODEX_THREAD_B, "codex");
  expect(okRes?.status).toBe(200);
  const okBody = (await okRes!.json()) as { ok: boolean };
  expect(okBody.ok).toBe(true);
  const remaining = await listCodexHistory(join(projectsRoot, "mergeproj"), new Map());
  expect(remaining.map((e) => e.codexThreadId)).toEqual([CODEX_THREAD_A]);
});

test("DELETE codex：非法 threadId → 400（encodeURIComponent 保住 ../ 形态过 URL 规范化）", async () => {
  const req = new Request(
    `http://localhost/api/projects/mergeproj/agent-history/${encodeURIComponent("../escape")}?provider=codex`,
    { method: "DELETE" },
  );
  const badRes = await handleSessionRoutes(req, new URL(req.url), projectsRoot, registry);
  expect(badRes?.status).toBe(400);
  const badBody = (await badRes!.json()) as { error: { code: string } };
  expect(badBody.error.code).toBe("SESSION_HISTORY_INVALID_ID");
});
