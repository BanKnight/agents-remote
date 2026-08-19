import { afterAll, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readPiHistoryLines } from "./pi-history";

// fixture：mini pi session JSONL（真实条目形状的子集——header + user/assistant/toolResult
// message entries + 一个非 message 条目验证跳过）。
const FIXTURE_DIR = join(import.meta.dir, ".tmp-pi-history-test");

const sessionFile = (name: string, entries: unknown[]) =>
  writeFile(join(FIXTURE_DIR, name), entries.map((e) => JSON.stringify(e)).join("\n") + "\n");

const header = { type: "session", id: "s1", timestamp: "2026-01-01T00:00:00Z", cwd: "/w" };
const userEntry = {
  type: "message",
  id: "e1",
  parentId: null,
  timestamp: "2026-01-01T00:00:01Z",
  message: { role: "user", content: "hi", timestamp: "2026-01-01T00:00:01Z" },
};
const assistantEntry = {
  type: "message",
  id: "e2",
  parentId: "e1",
  timestamp: "2026-01-01T00:00:02Z",
  message: {
    role: "assistant",
    content: [{ type: "text", text: "hello" }],
    usage: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 },
    stopReason: "stop",
    timestamp: "2026-01-01T00:00:02Z",
  },
};
const toolResultEntry = {
  type: "message",
  id: "e3",
  parentId: "e2",
  timestamp: "2026-01-01T00:00:03Z",
  message: {
    role: "toolResult",
    toolCallId: "tc1",
    toolName: "read",
    content: [{ type: "text", text: "file body" }],
    isError: false,
    timestamp: "2026-01-01T00:00:03Z",
  },
};
const labelEntry = {
  type: "label",
  id: "e4",
  parentId: "e3",
  timestamp: "t",
  label: "L",
  targetId: "e3",
};

describe("readPiHistoryLines", () => {
  afterAll(async () => {
    await rm(FIXTURE_DIR, { recursive: true, force: true });
  });

  test("目录缺失 → 空数组（新会话首条消息前 newSession 未落盘）", async () => {
    expect(await readPiHistoryLines(join(FIXTURE_DIR, "no-such-dir"))).toEqual([]);
  });

  test("message entry → message_start + message_end 成对帧（与 live 帧同形）", async () => {
    await mkdir(FIXTURE_DIR, { recursive: true });
    await sessionFile("2026-01-01_s1.jsonl", [
      header,
      userEntry,
      assistantEntry,
      toolResultEntry,
      labelEntry,
    ]);

    const lines = await readPiHistoryLines(FIXTURE_DIR);
    expect(lines).toHaveLength(6); // 3 message entries × 2 帧；label 跳过

    const frames = lines.map(
      (l) => JSON.parse(l) as { type: string; event: Record<string, unknown> },
    );
    expect(frames[0]).toMatchObject({ type: "pi_event", event: { type: "message_start" } });
    expect(frames[1]).toMatchObject({ type: "pi_event", event: { type: "message_end" } });
    // user message 原样携带（client 同一管道消费 history 与 live）。
    expect(frames[0].event.message).toMatchObject({ role: "user", content: "hi" });
    expect(frames[2].event.message).toMatchObject({
      role: "assistant",
      stopReason: "stop",
    });
    expect(frames[4].event.message).toMatchObject({ role: "toolResult", toolName: "read" });
  });

  test("多文件按名排序合并（时间戳前缀天然有序）", async () => {
    await mkdir(join(FIXTURE_DIR, "multi"), { recursive: true });
    const dir = join(FIXTURE_DIR, "multi");
    await writeFile(
      join(dir, "2026-01-02_s2.jsonl"),
      `${JSON.stringify({ ...header, id: "s2" })}\n${JSON.stringify({ ...userEntry, id: "f2", message: { ...userEntry.message, content: "second-file" } })}\n`,
    );
    await writeFile(
      join(dir, "2026-01-01_s1.jsonl"),
      `${JSON.stringify(header)}\n${JSON.stringify(userEntry)}\n`,
    );

    const lines = await readPiHistoryLines(dir);
    const firstUser = JSON.parse(lines[0]) as { event: { message: { content: string } } };
    expect(firstUser.event.message.content).toBe("hi"); // 01-01 文件在前
    const laterUser = JSON.parse(lines[2]) as { event: { message: { content: string } } };
    expect(laterUser.event.message.content).toBe("second-file");
  });
});
