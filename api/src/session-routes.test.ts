import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { projectToSlug } from "./agent-history";
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

beforeEach(async () => {
  // projectsRoot 必须在 home 内：omp 历史只扫 home 内路径（ompSessionSlug home 外 → null）。
  projectsRoot = await mkdtemp(join(homedir(), ".ar-test-session-routes-projects-"));
  runDir = await mkdtemp(join(tmpdir(), "ar-session-routes-run-"));
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
});

const historyRequest = (projectName = "mergeproj", range = "all") => {
  const req = new Request(
    `http://localhost/api/projects/${projectName}/agent-history?range=${range}`,
  );
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
    range: string;
  };
  expect(body.range).toBe("all");
  expect(body.entries.map((e) => `${e.provider}:${e.title}`)).toEqual([
    "omp:o1",
    "claude:c2",
    "claude:c1",
  ]);
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
