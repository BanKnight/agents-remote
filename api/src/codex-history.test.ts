import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, rm, utimes, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  codexSessionsRoot,
  clearCodexHistoryCache,
  deleteCodexHistoryEntry,
  listCodexHistory,
} from "./codex-history";

// 扫描根走 CODEX_HOME seam（不碰真实 ~/.codex），temp 目录每 test 重建。
let testHome = "";

beforeEach(async () => {
  clearCodexHistoryCache();
  testHome = await mkdtemp(join(tmpdir(), "codex-history-test-"));
  process.env.CODEX_HOME = testHome;
});

afterEach(async () => {
  delete process.env.CODEX_HOME;
  await rm(testHome, { recursive: true, force: true });
});

const writeRollout = async (
  bucket: string, // "2026/10/29"
  fileName: string,
  lines: Record<string, unknown>[],
  mtime?: Date,
) => {
  const dir = join(testHome, "sessions", ...bucket.split("/"));
  await mkdir(dir, { recursive: true });
  const content = lines.map((l) => JSON.stringify(l)).join("\n");
  const path = join(dir, fileName);
  await writeFile(path, content);
  if (mtime) await utimes(path, mtime, mtime);
  return path;
};

const meta = (id: string, cwd: string) => ({
  timestamp: "2026-10-29T03:00:00.000Z",
  ordinal: 0,
  type: "session_meta",
  payload: {
    id,
    timestamp: "2026-10-29T03:00:00.000Z",
    cwd,
    originator: "agents-remote",
    cli_version: "0.163.0",
    // 大首行形态：base_instructions 全文在 meta 行内（实测十几 KB）。
    base_instructions: { text: "x".repeat(20_000) },
  },
});

const userMsg = (message: string) => ({
  timestamp: "2026-10-29T03:00:01.000Z",
  ordinal: 1,
  type: "event_msg",
  payload: { type: "user_message", message },
});

const agentMsg = (message: string) => ({
  timestamp: "2026-10-29T03:00:02.000Z",
  ordinal: 2,
  type: "event_msg",
  payload: { type: "agent_message", message },
});

const THREAD_A = "11111111-1111-4111-8111-111111111111";
const THREAD_B = "22222222-2222-4222-8222-222222222222";
const PROJECT = "/tmp/codex-history-test-project";

test("解析 session_meta 与首条 user_message；大首行（base_instructions 20KB）不阻断", async () => {
  await writeRollout("2026/10/29", `rollout-2026-10-29T11-00-00-${THREAD_A}.jsonl`, [
    meta(THREAD_A, PROJECT),
    userMsg("帮我看下这个报错"),
    agentMsg("好的"),
  ]);
  const entries = await listCodexHistory(PROJECT, new Map());
  expect(entries).toHaveLength(1);
  expect(entries[0].provider).toBe("codex");
  expect(entries[0].codexThreadId).toBe(THREAD_A);
  expect(entries[0].cwd).toBeUndefined(); // cwd 不进对外条目（内部过滤键）
  expect(entries[0].firstMessage).toBe("帮我看下这个报错");
  expect(entries[0].title).toBeNull();
  expect(entries[0].startedAt).toBe("2026-10-29T03:00:00.000Z");
  expect(entries[0].lastActivityAt).not.toBeNull();
  expect(typeof entries[0].fileSize).toBe("number");
});

test("环境注入（< 开头）跳过，取下一条真用户消息", async () => {
  await writeRollout("2026/10/29", `rollout-2026-10-29T11-00-00-${THREAD_A}.jsonl`, [
    meta(THREAD_A, PROJECT),
    userMsg("<environment_context>cwd: /tmp</environment_context>"),
    userMsg("<user_instructions>AGENTS.md 内容</user_instructions>"),
    userMsg("真正的第一条用户消息"),
  ]);
  const entries = await listCodexHistory(PROJECT, new Map());
  expect(entries[0].firstMessage).toBe("真正的第一条用户消息");
});

test("firstMessage 截断到 120 字符", async () => {
  await writeRollout("2026/10/29", `rollout-2026-10-29T11-00-00-${THREAD_A}.jsonl`, [
    meta(THREAD_A, PROJECT),
    userMsg("长".repeat(300)),
  ]);
  const entries = await listCodexHistory(PROJECT, new Map());
  expect(entries[0].firstMessage).toHaveLength(120);
});

test("cwd 过滤：项目根相等命中；子目录前缀命中；外部 cwd 不出现", async () => {
  const t1 = THREAD_A;
  const t2 = THREAD_B;
  const t3 = "33333333-3333-4333-8333-333333333333";
  await writeRollout("2026/10/29", `rollout-a-${t1}.jsonl`, [meta(t1, PROJECT)]);
  await writeRollout("2026/10/29", `rollout-b-${t2}.jsonl`, [meta(t2, `${PROJECT}/sub/dir`)]);
  await writeRollout("2026/10/28", `rollout-c-${t3}.jsonl`, [meta(t3, "/somewhere/else")]);
  const entries = await listCodexHistory(PROJECT, new Map());
  expect(entries.map((e) => e.codexThreadId).sort()).toEqual([t1, t2].sort());
});

test("损坏文件（坏 JSON / 无 meta / 空文件）跳过不拖垮", async () => {
  await writeRollout("2026/10/29", `rollout-ok-${THREAD_A}.jsonl`, [meta(THREAD_A, PROJECT)]);
  await writeRollout("2026/10/29", `rollout-bad-json-${THREAD_B}.jsonl`, [
    { timestamp: "x", type: "session_meta", payload: "not-an-object" },
    { broken: true },
  ]);
  const dir = join(testHome, "sessions", "2026", "10", "29");
  await writeFile(join(dir, "rollout-empty-44444444-4444-4444-8444-444444444444.jsonl"), "");
  await writeFile(
    join(dir, "rollout-nometa-55555555-5555-4555-8555-555555555555.jsonl"),
    `${JSON.stringify({ type: "event_msg", payload: { type: "user_message", message: "hi" } })}\n`,
  );
  const entries = await listCodexHistory(PROJECT, new Map());
  expect(entries.map((e) => e.codexThreadId)).toEqual([THREAD_A]);
});

test("判活：activeMap 命中 → hasActiveSession + activeSessionId", async () => {
  await writeRollout("2026/10/29", `rollout-a-${THREAD_A}.jsonl`, [meta(THREAD_A, PROJECT)]);
  await writeRollout("2026/10/29", `rollout-b-${THREAD_B}.jsonl`, [meta(THREAD_B, PROJECT)]);
  const entries = await listCodexHistory(PROJECT, new Map([[THREAD_A, "sess-active-1"]]));
  const byId = new Map(entries.map((e) => [e.codexThreadId, e]));
  expect(byId.get(THREAD_A)?.hasActiveSession).toBe(true);
  expect(byId.get(THREAD_A)?.activeSessionId).toBe("sess-active-1");
  expect(byId.get(THREAD_B)?.hasActiveSession).toBe(false);
});

test("mtime 倒序（utimes 控制）", async () => {
  await writeRollout(
    "2026/10/29",
    `rollout-old-${THREAD_A}.jsonl`,
    [meta(THREAD_A, PROJECT)],
    new Date("2026-10-29T01:00:00Z"),
  );
  await writeRollout(
    "2026/10/29",
    `rollout-new-${THREAD_B}.jsonl`,
    [meta(THREAD_B, PROJECT)],
    new Date("2026-10-29T05:00:00Z"),
  );
  const entries = await listCodexHistory(PROJECT, new Map());
  expect(entries.map((e) => e.codexThreadId)).toEqual([THREAD_B, THREAD_A]);
});

test("缓存：内容更新 + mtime 前进后重新解析（mtime+size 失效键生效）", async () => {
  const path = await writeRollout("2026/10/29", `rollout-a-${THREAD_A}.jsonl`, [
    meta(THREAD_A, PROJECT),
    userMsg("第一版"),
  ]);
  const first = await listCodexHistory(PROJECT, new Map());
  expect(first[0].firstMessage).toBe("第一版");
  await writeFile(
    path,
    [meta(THREAD_A, PROJECT), userMsg("第二版")].map((l) => JSON.stringify(l)).join("\n"),
  );
  const newer = new Date("2026-10-29T06:00:00Z");
  await utimes(path, newer, newer);
  const second = await listCodexHistory(PROJECT, new Map());
  expect(second[0].firstMessage).toBe("第二版");
});

test("删除：UUID 白名单外 throw", async () => {
  expect(deleteCodexHistoryEntry("../../etc/passwd", PROJECT)).rejects.toThrow();
  expect(deleteCodexHistoryEntry("not-a-uuid", PROJECT)).rejects.toThrow();
});

test("删除：按 threadId 删文件（cwd 归属本项目），列表不再出现", async () => {
  await writeRollout("2026/10/29", `rollout-a-${THREAD_A}.jsonl`, [meta(THREAD_A, PROJECT)]);
  await writeRollout("2026/10/29", `rollout-b-${THREAD_B}.jsonl`, [meta(THREAD_B, PROJECT)]);
  const deleted = await deleteCodexHistoryEntry(THREAD_A, PROJECT);
  expect(deleted).toBe(true);
  const entries = await listCodexHistory(PROJECT, new Map());
  expect(entries.map((e) => e.codexThreadId)).toEqual([THREAD_B]);
});

test("删除：cwd 不归属本项目 → 保守不删（跨项目 threadId 传到本项目端点）", async () => {
  // meta id = THREAD_A（文件名候选命中），但 cwd 属其它项目 → 删除必须对齐列表侧过滤。
  await writeRollout("2026/10/29", `rollout-a-${THREAD_A}.jsonl`, [meta(THREAD_A, "/elsewhere")]);
  const deleted = await deleteCodexHistoryEntry(THREAD_A, PROJECT);
  expect(deleted).toBe(true); // 候选命中即 true（omp 同契约），但文件仍在
  const entries = await listCodexHistory(PROJECT, new Map());
  expect(entries).toHaveLength(0);
  const elsewhere = await listCodexHistory("/elsewhere", new Map());
  expect(elsewhere.map((e) => e.codexThreadId)).toEqual([THREAD_A]);
});

test("删除：文件名尾段匹配但 meta 不符 → 保守不删", async () => {
  await writeRollout("2026/10/29", `rollout-a-${THREAD_A}.jsonl`, [meta(THREAD_B, PROJECT)]);
  const deleted = await deleteCodexHistoryEntry(THREAD_A, PROJECT);
  expect(deleted).toBe(true); // 候选命中即 true（omp 同契约），但文件仍在
  const entries = await listCodexHistory(PROJECT, new Map());
  expect(entries).toHaveLength(1);
});

test("删除：无匹配 → false（幂等成功）", async () => {
  const deleted = await deleteCodexHistoryEntry(THREAD_A, PROJECT);
  expect(deleted).toBe(false);
});

test("codexSessionsRoot 尊重 CODEX_HOME", () => {
  expect(codexSessionsRoot({ CODEX_HOME: "/custom/codex" })).toBe("/custom/codex/sessions");
  expect(codexSessionsRoot({})).toBe(join(require("node:os").homedir(), ".codex", "sessions"));
});
