import { expect, test, beforeEach, afterAll } from "bun:test";
import { mkdir, writeFile, rm, utimes } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { listOmpHistory, ompSessionSlug } from "./omp-history";

// 与 agent-history.test.ts 同款策略：真实 home 下的隔离 slug 目录，前后清理。
const TEST_PROJECT = "/home/deploy/workspace/_test-omp-history-unit";
const REAL_DIR = join(homedir(), ".omp", "agent", "sessions", ompSessionSlug(TEST_PROJECT) ?? "");

beforeEach(async () => {
  await rm(REAL_DIR, { recursive: true, force: true });
  await mkdir(REAL_DIR, { recursive: true });
});

afterAll(async () => {
  // 清掉 fixture 目录本身（否则 ~/.omp 下残留空 slug 目录）。
  await rm(REAL_DIR, { recursive: true, force: true });
});

// omp JSONL 首行是 256B title slot（omp 原地重写 AI 标题）；此处写紧凑等价行即可。
const writeSession = async (
  fileName: string,
  opts: {
    sessionId: string;
    title?: string;
    firstUserMessage?: string;
    content?: string;
    mtimeMs?: number;
  },
) => {
  const lines: string[] = [];
  if (opts.title !== undefined) {
    lines.push(JSON.stringify({ type: "title", title: opts.title, updatedAt: 0, pad: "" }));
  }
  lines.push(
    JSON.stringify({
      type: "session",
      version: 3,
      id: opts.sessionId,
      timestamp: "2026-09-16T00:00:00.000Z",
      cwd: TEST_PROJECT,
    }),
  );
  if (opts.firstUserMessage !== undefined) {
    lines.push(
      JSON.stringify({
        type: "message",
        id: "m1",
        parentId: null,
        timestamp: "2026-09-16T00:00:01.000Z",
        message: { role: "user", content: opts.firstUserMessage },
      }),
    );
  }
  if (opts.content !== undefined) lines.push(opts.content);
  await writeFile(join(REAL_DIR, fileName), lines.join("\n"));
  if (opts.mtimeMs !== undefined) {
    await utimes(join(REAL_DIR, fileName), new Date(opts.mtimeMs), new Date(opts.mtimeMs));
  }
};

test("ompSessionSlug：相对 home 编码（/\\: → -，前缀 -）", () => {
  expect(ompSessionSlug("/home/deploy/workspace/test", "/home/deploy")).toBe("-workspace-test");
  expect(ompSessionSlug("/home/deploy", "/home/deploy")).toBe("-");
});

test("ompSessionSlug：home 外路径 → null（legacy 绝对编码不支持）", () => {
  expect(ompSessionSlug("/srv/data/project", "/home/deploy")).toBeNull();
  expect(ompSessionSlug("/home/other/project", "/home/deploy")).toBeNull();
});

test("listOmpHistory：不存在的项目目录 → 空数组", async () => {
  const entries = await listOmpHistory("/nonexistent/path", new Map(), "all");
  expect(entries).toEqual([]);
});

test("listOmpHistory：解析 title/session/首条 user 消息 + provider=omp + acpSessionId", async () => {
  await writeSession("20260916T01_abc-1.jsonl", {
    sessionId: "abc-1",
    title: "Fix login flow",
    firstUserMessage: "please fix the login",
  });

  const entries = await listOmpHistory(TEST_PROJECT, new Map(), "all");
  expect(entries).toHaveLength(1);
  expect(entries[0]).toMatchObject({
    provider: "omp",
    acpSessionId: "abc-1",
    title: "Fix login flow",
    firstMessage: "please fix the login",
    hasActiveSession: false,
  });
  expect(entries[0].claudeSessionId).toBeUndefined();
});

test("listOmpHistory：session header id 缺失 → 文件名末段兜底；block 数组 content 拼接", async () => {
  await writeFile(
    join(REAL_DIR, "20260916T02_def-2.jsonl"),
    [
      JSON.stringify({ type: "session", version: 3, timestamp: "2026-09-16T00:00:00.000Z" }),
      JSON.stringify({
        type: "message",
        timestamp: "2026-09-16T00:00:01.000Z",
        message: {
          role: "user",
          content: [
            { type: "text", text: "line one" },
            { type: "text", text: "line two" },
          ],
        },
      }),
    ].join("\n"),
  );

  const entries = await listOmpHistory(TEST_PROJECT, new Map(), "all");
  expect(entries).toHaveLength(1);
  expect(entries[0].acpSessionId).toBe("def-2");
  expect(entries[0].firstMessage).toBe("line one\nline two");
});

test("listOmpHistory：activeAcpSessionMap 匹配 → hasActiveSession + activeSessionId", async () => {
  await writeSession("20260916T03_ghi-3.jsonl", { sessionId: "ghi-3" });
  const entries = await listOmpHistory(TEST_PROJECT, new Map([["ghi-3", "agent_1"]]), "all");
  expect(entries).toHaveLength(1);
  expect(entries[0].hasActiveSession).toBe(true);
  expect(entries[0].activeSessionId).toBe("agent_1");
});

test("listOmpHistory：range 过滤（week 窗口外的旧 mtime 滤除）", async () => {
  const now = Date.now();
  await writeSession("old_ghi-old.jsonl", { sessionId: "ghi-old", mtimeMs: now - 30 * 86400_000 });
  await writeSession("new_ghi-new.jsonl", { sessionId: "ghi-new", mtimeMs: now - 1000 });

  const week = await listOmpHistory(TEST_PROJECT, new Map(), "week");
  expect(week.map((e) => e.acpSessionId)).toEqual(["ghi-new"]);
  const all = await listOmpHistory(TEST_PROJECT, new Map(), "all");
  // lastActivityAt 降序：新文件在前。
  expect(all.map((e) => e.acpSessionId)).toEqual(["ghi-new", "ghi-old"]);
});

test("listOmpHistory：畸形行跳过；非 user 首条消息不入 firstMessage", async () => {
  await writeFile(
    join(REAL_DIR, "20260916T04_jkl-4.jsonl"),
    [
      "{not json",
      JSON.stringify({
        type: "message",
        timestamp: "2026-09-16T00:00:01.000Z",
        message: { role: "assistant", content: "assistant first" },
      }),
      JSON.stringify({
        type: "message",
        timestamp: "2026-09-16T00:00:02.000Z",
        message: { role: "user", content: "real first question" },
      }),
    ].join("\n"),
  );

  const entries = await listOmpHistory(TEST_PROJECT, new Map(), "all");
  expect(entries).toHaveLength(1);
  expect(entries[0].firstMessage).toBe("real first question");
});
