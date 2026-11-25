import { afterEach, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  ClaudeSessionRelay,
  HISTORY_TAIL_SCAN_BYTES,
  normalizeHistoryMcpLine,
  sliceLastCompactBlock,
} from "./session-relay";
import { claudeJsonlPath } from "./session-routes";

const cleanupDirs = new Set<string>();

afterEach(async () => {
  await Promise.all([...cleanupDirs].map((dir) => rm(dir, { recursive: true, force: true })));
  cleanupDirs.clear();
});

test("ClaudeSessionRelay sends history and output batches for a new session", async () => {
  const relay = new ClaudeSessionRelay();
  await relay.activate("", undefined);

  const systemLine = JSON.stringify({
    type: "system",
    subtype: "init",
    session_id: "new-session",
  });
  const assistantLine = JSON.stringify({
    type: "assistant",
    uuid: "uuid-assistant-1",
    message: { id: "msg_1", role: "assistant", content: [{ type: "text", text: "done" }] },
  });

  await relay.handleStdoutLine(systemLine);
  await relay.handleStdoutLine(assistantLine);

  const received: string[] = [];
  relay.addSubscriber(
    (line) => received.push(line),
    (error) => {
      throw error;
    },
  );

  const messages = received.map((line) => JSON.parse(line) as Record<string, unknown>);

  // session_init always comes first
  const sessionInit = messages.findIndex((msg) => msg.type === "session_init");
  expect(sessionInit).toBe(0);
  expect(messages[sessionInit]).toMatchObject({
    type: "session_init",
    resume: false,
    anchor: null,
  });

  // History batch
  const historyStart = messages.findIndex((msg) => msg.type === "history_start");
  const historyEnd = messages.findIndex((msg) => msg.type === "history_end");
  expect(historyStart).toBe(1);
  expect(historyEnd).toBe(2);
  expect(messages[historyStart]).toMatchObject({ type: "history_start", count: 0 });

  // Output batch with both lines
  const outputStart = messages.findIndex((msg) => msg.type === "live_start");
  const outputEnd = messages.findIndex((msg) => msg.type === "live_end");

  expect(outputStart).toBe(3);
  expect(outputEnd).toBeGreaterThan(outputStart);

  const outputMessages = messages.slice(outputStart + 1, outputEnd);
  expect(outputMessages).toHaveLength(2);
  expect(outputMessages[0]).toEqual(JSON.parse(systemLine));
  expect(outputMessages[1]).toEqual(JSON.parse(assistantLine));

  relay.destroy();
});

test("ClaudeSessionRelay sends history batch before output batch for resume", async () => {
  const projectPath = `/tmp/agents-remote-relay-${Date.now()}`;
  const claudeSessionId = "relay-resume-session";
  const jsonlPath = claudeJsonlPath(projectPath, claudeSessionId);
  cleanupDirs.add(dirname(jsonlPath));

  await mkdir(dirname(jsonlPath), { recursive: true });

  const diskLine = JSON.stringify({
    type: "user",
    uuid: "uuid-user-1",
    session_id: claudeSessionId,
    message: { role: "user", content: [{ type: "text", text: "from disk" }] },
  });
  await writeFile(jsonlPath, `${diskLine}\n`);

  const bufferLine = JSON.stringify({
    type: "assistant",
    uuid: "uuid-assistant-2",
    message: {
      id: "msg_2",
      role: "assistant",
      content: [{ type: "text", text: "from live output" }],
    },
  });

  const relay = new ClaudeSessionRelay();
  await relay.activate(projectPath, claudeSessionId);
  await relay.handleStdoutLine(bufferLine);

  const received: string[] = [];
  relay.addSubscriber(
    (line) => received.push(line),
    (error) => {
      throw error;
    },
  );

  const messages = received.map((line) => JSON.parse(line) as Record<string, unknown>);

  // session_init always comes first
  const sessionInit = messages.findIndex((msg) => msg.type === "session_init");
  expect(sessionInit).toBe(0);
  expect(messages[sessionInit]).toMatchObject({
    type: "session_init",
    resume: true,
    anchor: null,
  });

  // History batch comes next
  const historyStart = messages.findIndex((msg) => msg.type === "history_start");
  const historyEnd = messages.findIndex((msg) => msg.type === "history_end");

  expect(historyStart).toBe(1);
  expect(messages[historyStart]).toMatchObject({ type: "history_start", count: 1 });
  expect(historyEnd).toBeGreaterThan(historyStart);

  const historyMessages = messages.slice(historyStart + 1, historyEnd);
  expect(historyMessages).toEqual([JSON.parse(diskLine)]);

  // Output batch comes after history
  const outputStart = messages.findIndex((msg) => msg.type === "live_start");
  const outputEnd = messages.findIndex((msg) => msg.type === "live_end");

  expect(outputStart).toBeGreaterThan(historyEnd); // after history
  expect(outputEnd).toBeGreaterThan(outputStart);

  const outputMessages = messages.slice(outputStart + 1, outputEnd);
  expect(outputMessages).toEqual([JSON.parse(bufferLine)]);

  relay.destroy();
});

// 回放归一化(2026-10-21 README 卡实测实锤):CLI 双出口对 MCP 工具结果的
// structuredContent 字段位置不同——JSONL 写 mcpMeta.structuredContent,stdout
// (live)写 tool_use_result.structuredContent(web 卡片唯一消费位),JSONL 顶层
// toolUseResult(camel)是 sc 直接序列化的**字符串**——web 端 `toolUseResult ??
// tool_use_result` 优先取 camel,字符串的 structuredResult 过不了投影的
// typeof==="object" 闸。不归一 = API 重启后回放的 MCP 卡全部走通用卡回退。
// 断言:①mcpMeta 形状行被补齐(snake envelope 注入 + camel 字符串键删除);
// ②live 形状行不重复注入;③普通行原样透传。
test("normalizeHistoryMcpLine hoists mcpMeta.structuredContent to the live shape", () => {
  const sc = { kind: "file-preview", path: "README.md", size: 4150, content: "# hi" };
  const jsonlShape = {
    type: "user",
    uuid: "u1",
    message: {
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "call_1", content: "x" }],
    },
    toolUseResult: JSON.stringify(sc),
    mcpMeta: { structuredContent: sc },
  };
  const normalized = JSON.parse(normalizeHistoryMcpLine(jsonlShape, JSON.stringify(jsonlShape)));
  expect(normalized.tool_use_result).toEqual({ structuredContent: sc });
  expect(normalized.toolUseResult).toBeUndefined();
  expect(normalized.mcpMeta).toEqual({ structuredContent: sc });

  const liveShape = {
    type: "user",
    uuid: "u2",
    tool_use_result: { content: "x", structuredContent: { kind: "git-status" } },
  };
  const untouched = JSON.parse(normalizeHistoryMcpLine(liveShape, JSON.stringify(liveShape)));
  expect(untouched).toEqual(liveShape);

  const plain = { type: "assistant", uuid: "u3" };
  expect(normalizeHistoryMcpLine(plain, JSON.stringify(plain))).toBe(JSON.stringify(plain));
});

test("ClaudeSessionRelay replay normalizes JSONL mcpMeta into the live shape", async () => {
  const projectPath = `/tmp/agents-remote-relay-${Date.now()}`;
  const claudeSessionId = "relay-replay-mcp-meta";
  const jsonlPath = claudeJsonlPath(projectPath, claudeSessionId);
  cleanupDirs.add(dirname(jsonlPath));

  await mkdir(dirname(jsonlPath), { recursive: true });
  const sc = { kind: "file-preview", path: "README.md", size: 4150, content: "# hi" };
  const jsonlLine = JSON.stringify({
    type: "user",
    uuid: "uuid-mcp-1",
    message: {
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "call_1", content: "payload" }],
    },
    mcpMeta: { structuredContent: sc },
  });
  await writeFile(jsonlPath, `${jsonlLine}\n`);

  const relay = new ClaudeSessionRelay();
  await relay.activate(projectPath, claudeSessionId);

  const received: string[] = [];
  relay.addSubscriber(
    (line) => received.push(line),
    (error) => {
      throw error;
    },
  );

  const messages = received.map((line) => JSON.parse(line) as Record<string, unknown>);
  const historyStart = messages.findIndex((msg) => msg.type === "history_start");
  const historyEnd = messages.findIndex((msg) => msg.type === "history_end");
  const historyMessages = messages.slice(historyStart + 1, historyEnd);
  expect(historyMessages).toHaveLength(1);
  expect(historyMessages[0].tool_use_result).toEqual({ structuredContent: sc });

  relay.destroy();
});

test("ClaudeSessionRelay always sends history+output markers even when empty", async () => {
  const relay = new ClaudeSessionRelay();
  await relay.activate("", undefined);

  const received: string[] = [];
  relay.addSubscriber(
    (line) => received.push(line),
    (error) => {
      throw error;
    },
  );

  const messages = received.map((line) => JSON.parse(line) as Record<string, unknown>);
  // session_init + history_start + history_end + output_start + output_end +
  // queue seed + held seed = 7
  expect(messages).toHaveLength(7);
  expect(messages[0]).toMatchObject({ type: "session_init", resume: false });
  expect(messages[1]).toMatchObject({ type: "history_start", count: 0 });
  expect(messages[2]).toMatchObject({ type: "history_end" });
  expect(messages[3]).toMatchObject({ type: "live_start", count: 0 });
  expect(messages[4]).toMatchObject({ type: "live_end" });
  expect(messages[5]).toEqual({ type: "queue_state", entries: [] });
  expect(messages[6]).toEqual({ type: "queue_held", entries: [] });

  relay.destroy();
});

test("ClaudeSessionRelay handles empty history file for resume", async () => {
  const projectPath = `/tmp/agents-remote-relay-${Date.now()}`;
  const claudeSessionId = "relay-empty-session";
  const jsonlPath = claudeJsonlPath(projectPath, claudeSessionId);
  cleanupDirs.add(dirname(jsonlPath));

  await mkdir(dirname(jsonlPath), { recursive: true });
  await writeFile(jsonlPath, "");

  const relay = new ClaudeSessionRelay();
  await relay.activate(projectPath, claudeSessionId);

  const received: string[] = [];
  relay.addSubscriber(
    (line) => received.push(line),
    (error) => {
      throw error;
    },
  );

  const messages = received.map((line) => JSON.parse(line) as Record<string, unknown>);
  expect(messages[0]).toMatchObject({ type: "session_init", resume: true });
  expect(messages[1]).toMatchObject({ type: "history_start", count: 0 });
  expect(messages[2]).toMatchObject({ type: "history_end" });

  relay.destroy();
});

test("ClaudeSessionRelay broadcasts live output after batch", async () => {
  const relay = new ClaudeSessionRelay();
  await relay.activate("", undefined);

  const live1 = JSON.stringify({
    type: "assistant",
    uuid: "uuid-1",
    message: { id: "m1", role: "assistant", content: [{ type: "text", text: "live" }] },
  });

  const received: string[] = [];
  relay.addSubscriber(
    (line) => received.push(line),
    (error) => {
      throw error;
    },
  );

  // After subscriber joins, handle more stdout lines
  await relay.handleStdoutLine(live1);

  const messages = received.map((line) => JSON.parse(line) as Record<string, unknown>);

  // output_start + batch message + output_end + queue seed + live message
  const outputEnd = messages.findIndex((msg) => msg.type === "live_end");
  const liveMessages = messages.slice(outputEnd + 1);

  expect(liveMessages).toHaveLength(3);
  expect(liveMessages[0]).toEqual({ type: "queue_state", entries: [] }); // 无条件种子
  expect(liveMessages[1]).toEqual({ type: "queue_held", entries: [] }); // 冻结种子
  expect(liveMessages[2]).toEqual(JSON.parse(live1));

  relay.destroy();
});

test("ClaudeSessionRelay injectLine broadcasts but does not enter output", async () => {
  const relay = new ClaudeSessionRelay();
  await relay.activate("", undefined);

  const injectedLine = JSON.stringify({
    type: "user",
    message: { role: "user", content: [{ type: "text", text: "optimistic" }] },
  });

  // Add subscriber first so it receives the injectLine broadcast
  const received: string[] = [];
  relay.addSubscriber(
    (line) => received.push(line),
    (error) => {
      throw error;
    },
  );

  relay.injectLine(injectedLine);

  const messages = received.map((line) => JSON.parse(line) as Record<string, unknown>);

  // injectLine is broadcast live after the batches
  const outputEnd = messages.findIndex((msg) => msg.type === "live_end");
  expect(outputEnd).toBeGreaterThanOrEqual(0); // output batch always sent

  // The injected line appears after output_end
  const liveMessages = messages.slice(outputEnd + 1);
  expect(liveMessages.some((msg) => msg.type === "user")).toBe(true);

  relay.destroy();
});

test("ClaudeSessionRelay injectLiveLine buffers into liveLines for later subscribers", async () => {
  const relay = new ClaudeSessionRelay();
  await relay.activate("", undefined);

  const injectedLine = JSON.stringify({
    type: "user",
    uuid: "injected-1",
    message: { role: "user", content: [{ type: "text", text: "hi" }] },
  });

  // Current subscriber — receives the real-time broadcast.
  const live: string[] = [];
  relay.addSubscriber(
    (line) => live.push(line),
    (error) => {
      throw error;
    },
  );
  relay.injectLiveLine(injectedLine);

  // 1) current subscriber got the broadcast after the live batch.
  const liveEndIdx = live.findIndex((l) => l.includes('"live_end"'));
  expect(live.slice(liveEndIdx + 1)).toContain(injectedLine);

  // 2) a subscriber joining LATER replays the injected line from the live
  //    batch — this is the key difference from injectLine (broadcast-only).
  const replayed: string[] = [];
  relay.addSubscriber(
    (line) => replayed.push(line),
    (error) => {
      throw error;
    },
  );
  const messages = replayed.map((l) => JSON.parse(l) as Record<string, unknown>);
  const liveStart = messages.findIndex((m) => m.type === "live_start");
  const liveEnd = messages.findIndex((m) => m.type === "live_end");
  expect(messages[liveStart]).toMatchObject({ type: "live_start", count: 1 });
  expect(messages.slice(liveStart + 1, liveEnd)).toEqual([JSON.parse(injectedLine)]);

  relay.destroy();
});

// compact-block windowing: keep only the last compact block.
const compactBoundaryLine = (uuid: string) =>
  JSON.stringify({
    type: "system",
    subtype: "compact_boundary",
    uuid,
    compactMetadata: { trigger: "manual" },
  });
const microcompactBoundaryLine = (uuid: string) =>
  JSON.stringify({
    type: "system",
    subtype: "microcompact_boundary",
    uuid,
    microcompactMetadata: { trigger: "auto" },
  });
const userLine = (uuid: string, text: string) =>
  JSON.stringify({
    type: "user",
    uuid,
    message: { role: "user", content: [{ type: "text", text }] },
  });

test("ClaudeSessionRelay loads only the last compact block from JSONL", async () => {
  const projectPath = `/tmp/agents-remote-relay-${Date.now()}`;
  const claudeSessionId = "relay-tail-session";
  const jsonlPath = claudeJsonlPath(projectPath, claudeSessionId);
  cleanupDirs.add(dirname(jsonlPath));
  await mkdir(dirname(jsonlPath), { recursive: true });

  // pre-compact | boundary(c1) | mid | boundary(c2) | tail
  const content = [
    userLine("u-pre", "old"),
    compactBoundaryLine("c1"),
    userLine("u-mid", "mid"),
    compactBoundaryLine("c2"),
    userLine("u-tail", "tail"),
  ].join("\n");
  await writeFile(jsonlPath, `${content}\n`);

  const relay = new ClaudeSessionRelay();
  await relay.activate(projectPath, claudeSessionId);

  const received: string[] = [];
  relay.addSubscriber(
    (line) => received.push(line),
    (error) => {
      throw error;
    },
  );

  const messages = received.map((line) => JSON.parse(line) as Record<string, unknown>);
  const historyStart = messages.findIndex((m) => m.type === "history_start");
  const historyEnd = messages.findIndex((m) => m.type === "history_end");
  // last compact_boundary (c2) + tail user msg = 2 lines (c1/mid/pre compacted away)
  expect(messages[historyStart]).toMatchObject({ type: "history_start", count: 2 });
  const historyMessages = messages.slice(historyStart + 1, historyEnd);
  expect(historyMessages).toEqual([
    JSON.parse(compactBoundaryLine("c2")),
    JSON.parse(userLine("u-tail", "tail")),
  ]);

  relay.destroy();
});

test("ClaudeSessionRelay tail-scan recognizes microcompact_boundary and picks the later of the two", async () => {
  const projectPath = `/tmp/agents-remote-relay-${Date.now()}`;
  const claudeSessionId = "relay-tail-micro";
  const jsonlPath = claudeJsonlPath(projectPath, claudeSessionId);
  cleanupDirs.add(dirname(jsonlPath));
  await mkdir(dirname(jsonlPath), { recursive: true });

  // microcompact | mid | compact(later) | tail — the later compact_boundary wins
  const content = [
    microcompactBoundaryLine("m1"),
    userLine("u-mid", "mid"),
    compactBoundaryLine("c2"),
    userLine("u-tail", "tail"),
  ].join("\n");
  await writeFile(jsonlPath, `${content}\n`);

  const relay = new ClaudeSessionRelay();
  await relay.activate(projectPath, claudeSessionId);

  const received: string[] = [];
  relay.addSubscriber(
    (line) => received.push(line),
    (error) => {
      throw error;
    },
  );

  const messages = received.map((line) => JSON.parse(line) as Record<string, unknown>);
  const historyStart = messages.findIndex((m) => m.type === "history_start");
  const historyEnd = messages.findIndex((m) => m.type === "history_end");
  // only the later compact_boundary block survives (microcompact + mid compacted away)
  expect(messages[historyStart]).toMatchObject({ type: "history_start", count: 2 });
  const historyMessages = messages.slice(historyStart + 1, historyEnd);
  expect(historyMessages).toEqual([
    JSON.parse(compactBoundaryLine("c2")),
    JSON.parse(userLine("u-tail", "tail")),
  ]);

  relay.destroy();
});

test("ClaudeSessionRelay reads the full file when no compact boundary exists", async () => {
  const projectPath = `/tmp/agents-remote-relay-${Date.now()}`;
  const claudeSessionId = "relay-tail-none";
  const jsonlPath = claudeJsonlPath(projectPath, claudeSessionId);
  cleanupDirs.add(dirname(jsonlPath));
  await mkdir(dirname(jsonlPath), { recursive: true });

  const content = [userLine("u1", "first"), userLine("u2", "second")].join("\n");
  await writeFile(jsonlPath, `${content}\n`);

  const relay = new ClaudeSessionRelay();
  await relay.activate(projectPath, claudeSessionId);

  const received: string[] = [];
  relay.addSubscriber(
    (line) => received.push(line),
    (error) => {
      throw error;
    },
  );

  const messages = received.map((line) => JSON.parse(line) as Record<string, unknown>);
  const historyStart = messages.findIndex((m) => m.type === "history_start");
  // never compacted → full file (fallback)
  expect(messages[historyStart]).toMatchObject({ type: "history_start", count: 2 });

  relay.destroy();
});

test("sliceLastCompactBlock returns the last block, or null to force a full-read fallback", () => {
  const boundary = compactBoundaryLine("c1");
  const tail = userLine("u-tail", "tail");

  // boundary in the middle of a multi-line buffer → block = boundary line start → EOF
  const block = sliceLastCompactBlock(
    Buffer.from(`${[userLine("u-pre", "old"), boundary, tail].join("\n")}\n`),
  );
  expect(block).not.toBeNull();
  expect(block?.toString("utf8").trim().split("\n")).toEqual([boundary, tail]);

  // no boundary → null (caller reads the full file)
  expect(
    sliceLastCompactBlock(Buffer.from(`${[userLine("u1", "a"), tail].join("\n")}\n`)),
  ).toBeNull();

  // boundary marker present but its line start is outside the buffer (truncated
  // tail whose first line is mid-boundary) → null so the caller falls back
  expect(sliceLastCompactBlock(Buffer.from(`${boundary.slice(10)}\n${tail}\n`))).toBeNull();
});

test("ClaudeSessionRelay falls back to a full read when the boundary is older than the tail window", async () => {
  const projectPath = `/tmp/agents-remote-relay-${Date.now()}`;
  const claudeSessionId = "relay-tail-fallback";
  const jsonlPath = claudeJsonlPath(projectPath, claudeSessionId);
  cleanupDirs.add(dirname(jsonlPath));
  await mkdir(dirname(jsonlPath), { recursive: true });

  // A padding line whose length exceeds the tail scan window pushes the boundary
  // beyond the trailing read → the tail read misses it, the full-read fallback
  // finds it and recovers the whole last block (boundary + padding + tail).
  const padding = userLine("u-pad", "x".repeat(HISTORY_TAIL_SCAN_BYTES));
  const content = [
    userLine("u-pre", "old"),
    compactBoundaryLine("c1"),
    padding,
    userLine("u-tail", "tail"),
  ].join("\n");
  await writeFile(jsonlPath, `${content}\n`);

  const relay = new ClaudeSessionRelay();
  await relay.activate(projectPath, claudeSessionId);

  const received: string[] = [];
  relay.addSubscriber(
    (line) => received.push(line),
    (error) => {
      throw error;
    },
  );

  const messages = received.map((line) => JSON.parse(line) as Record<string, unknown>);
  const historyStart = messages.findIndex((m) => m.type === "history_start");
  const historyEnd = messages.findIndex((m) => m.type === "history_end");
  // full-read fallback recovers the last block; pre-boundary u-pre stays compacted away
  expect(messages[historyStart]).toMatchObject({ type: "history_start", count: 3 });
  const historyMessages = messages.slice(historyStart + 1, historyEnd);
  expect(historyMessages).toEqual([
    JSON.parse(compactBoundaryLine("c1")),
    JSON.parse(padding),
    JSON.parse(userLine("u-tail", "tail")),
  ]);

  relay.destroy();
});

test("ClaudeSessionRelay trims history+live buffers on a live compact_boundary", async () => {
  const projectPath = `/tmp/agents-remote-relay-${Date.now()}`;
  const claudeSessionId = "relay-trim-session";
  const jsonlPath = claudeJsonlPath(projectPath, claudeSessionId);
  cleanupDirs.add(dirname(jsonlPath));
  await mkdir(dirname(jsonlPath), { recursive: true });

  const diskLine = userLine("u-disk", "from disk");
  await writeFile(jsonlPath, `${diskLine}\n`);

  const liveBefore = JSON.stringify({
    type: "assistant",
    uuid: "a-pre",
    message: { id: "m1", role: "assistant", content: [{ type: "text", text: "before compact" }] },
  });

  const relay = new ClaudeSessionRelay();
  await relay.activate(projectPath, claudeSessionId);
  await relay.handleStdoutLine(liveBefore); // liveLines = [liveBefore]
  // compact arrives in live → old history (disk) + pre-compact live are dropped;
  // the boundary itself becomes the first line of the new block.
  await relay.handleStdoutLine(compactBoundaryLine("c-live"));

  const received: string[] = [];
  relay.addSubscriber(
    (line) => received.push(line),
    (error) => {
      throw error;
    },
  );

  const messages = received.map((line) => JSON.parse(line) as Record<string, unknown>);
  const historyStart = messages.findIndex((m) => m.type === "history_start");
  expect(messages[historyStart]).toMatchObject({ type: "history_start", count: 0 }); // history trimmed

  const liveStart = messages.findIndex((m) => m.type === "live_start");
  const liveEnd = messages.findIndex((m) => m.type === "live_end");
  const liveMessages = messages.slice(liveStart + 1, liveEnd);
  // only the boundary survived (disk history + liveBefore compacted away)
  expect(liveMessages).toEqual([JSON.parse(compactBoundaryLine("c-live"))]);

  relay.destroy();
});

test("ClaudeSessionRelay.handleStdoutLine reuses a caller-provided parse (no re-parse)", async () => {
  const relay = new ClaudeSessionRelay();
  await relay.activate("", undefined);
  // seed a live line so the trim has something to drop
  await relay.handleStdoutLine(userLine("u-seed", "seed"));

  // The raw line is intentionally non-JSON, but the caller passes a pre-parsed
  // compact_boundary object. If the relay re-parsed the raw line it would see
  // garbage and NOT trim; reusing the provided parse means it DOES trim.
  await relay.handleStdoutLine("this-is-not-json", {
    type: "system",
    subtype: "compact_boundary",
    uuid: "c-parsed",
  });

  const received: string[] = [];
  relay.addSubscriber(
    (line) => received.push(line),
    (error) => {
      throw error;
    },
  );

  // Find the live batch markers by string (the buffered line is non-JSON, so we
  // can't JSON.parse the whole received array).
  const liveStart = received.findIndex((l) => l.includes('"live_start"'));
  const liveEnd = received.findIndex((l) => l.includes('"live_end"'));
  const liveLines = received.slice(liveStart + 1, liveEnd);
  // pre-compact seed was trimmed; only the boundary line (raw, buffered as-is) survives
  expect(liveLines).toHaveLength(1);
  expect(liveLines[0]).toBe("this-is-not-json");

  relay.destroy();
});

test("ClaudeSessionRelay emits seed init between session_init and history_start", async () => {
  const relay = new ClaudeSessionRelay();
  await relay.activate("", undefined);

  const seedInitLine = JSON.stringify({
    type: "system",
    subtype: "seed_init",
    model: "opus",
    permissionMode: "plan",
  });

  const received: string[] = [];
  relay.addSubscriber(
    (line) => received.push(line),
    (error) => {
      throw error;
    },
    seedInitLine,
  );

  const messages = received.map((line) => JSON.parse(line) as Record<string, unknown>);
  // session_init → seed init → history_start
  expect(messages[0]).toMatchObject({ type: "session_init", resume: false });
  expect(messages[1]).toMatchObject({
    type: "system",
    subtype: "seed_init",
    model: "opus",
    permissionMode: "plan",
  });
  expect(messages[2]).toMatchObject({ type: "history_start", count: 0 });

  relay.destroy();
});

const thinkingTokensLine = (estimatedTokens: number) =>
  JSON.stringify({
    type: "system",
    subtype: "thinking_tokens",
    estimated_tokens: estimatedTokens,
  });

test("ClaudeSessionRelay coalesces consecutive thinking_tokens in the live buffer", async () => {
  const relay = new ClaudeSessionRelay();
  await relay.activate("", undefined);

  // Current subscriber — receives every thinking_tokens on the live broadcast.
  const live: string[] = [];
  relay.addSubscriber(
    (line) => live.push(line),
    (error) => {
      throw error;
    },
  );

  await relay.handleStdoutLine(thinkingTokensLine(5));
  await relay.handleStdoutLine(thinkingTokensLine(20));
  await relay.handleStdoutLine(thinkingTokensLine(39));

  // 1) Live broadcast still sends each of the 3 rows — the live
  //    "Thinking… (N tokens)" animation needs the incremental values.
  //    （live_end 后先到无条件队列种子空快照，再是 3 行广播。）
  const liveEndIdx = live.findIndex((l) => l.includes('"live_end"'));
  const afterBatch = live
    .slice(liveEndIdx + 1)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
  expect(afterBatch).toHaveLength(5);
  expect(afterBatch[0]).toEqual({ type: "queue_state", entries: [] });
  expect(afterBatch[1]).toEqual({ type: "queue_held", entries: [] });
  expect(afterBatch.slice(2).map((m) => m.estimated_tokens)).toEqual([5, 20, 39]);

  // 2) A subscriber joining LATER replays only the LAST coalesced row from the
  //    live batch — earlier cumulative values are superseded and dropped.
  const replayed: string[] = [];
  relay.addSubscriber(
    (line) => replayed.push(line),
    (error) => {
      throw error;
    },
  );
  const messages = replayed.map((l) => JSON.parse(l) as Record<string, unknown>);
  const liveStart = messages.findIndex((m) => m.type === "live_start");
  const liveEnd = messages.findIndex((m) => m.type === "live_end");
  expect(messages[liveStart]).toMatchObject({ type: "live_start", count: 1 });
  expect(messages.slice(liveStart + 1, liveEnd)).toEqual([
    expect.objectContaining({ subtype: "thinking_tokens", estimated_tokens: 39 }),
  ]);

  relay.destroy();
});

test("ClaudeSessionRelay does not coalesce thinking_tokens across an intervening message", async () => {
  const relay = new ClaudeSessionRelay();
  await relay.activate("", undefined);

  await relay.handleStdoutLine(thinkingTokensLine(5));
  await relay.handleStdoutLine(
    JSON.stringify({
      type: "assistant",
      uuid: "a-between",
      message: {
        id: "m1",
        role: "assistant",
        content: [{ type: "text", text: "thinking done" }],
      },
    }),
  );
  await relay.handleStdoutLine(thinkingTokensLine(39));

  const replayed: string[] = [];
  relay.addSubscriber(
    (line) => replayed.push(line),
    (error) => {
      throw error;
    },
  );
  const messages = replayed.map((l) => JSON.parse(l) as Record<string, unknown>);
  const liveStart = messages.findIndex((m) => m.type === "live_start");
  const liveEnd = messages.findIndex((m) => m.type === "live_end");
  // The intervening assistant broke the burst → all 3 rows survive in order.
  expect(messages[liveStart]).toMatchObject({ type: "live_start", count: 3 });
  expect(messages.slice(liveStart + 1, liveEnd)).toEqual([
    expect.objectContaining({ subtype: "thinking_tokens", estimated_tokens: 5 }),
    expect.objectContaining({ type: "assistant" }),
    expect.objectContaining({ subtype: "thinking_tokens", estimated_tokens: 39 }),
  ]);

  relay.destroy();
});

// tool_progress 是瞬态进度信号（CLI 2.1.268+，不写 JSONL）：广播给在线订阅者，
// 但不进 liveLines——重连重放不应携带过期心跳。语义 =「在线即见、错过不补」。
test("ClaudeSessionRelay broadcasts tool_progress but keeps it out of liveLines", async () => {
  const relay = new ClaudeSessionRelay();
  await relay.activate("", undefined);

  const assistantLine = JSON.stringify({
    type: "assistant",
    uuid: "uuid-a-live",
    message: { id: "msg_live", role: "assistant", content: [{ type: "text", text: "working" }] },
  });
  const heartbeatLine = JSON.stringify({
    type: "tool_progress",
    tool_use_id: "call-x-heartbeat-0",
    tool_name: "Bash",
    parent_tool_use_id: "call-x",
    elapsed_time_seconds: 30,
    heartbeat: true,
  });

  // Online subscriber: receives BOTH lines as they are broadcast.
  const online: string[] = [];
  relay.addSubscriber(
    (line) => online.push(line),
    (error) => {
      throw error;
    },
  );
  await relay.handleStdoutLine(assistantLine);
  await relay.handleStdoutLine(heartbeatLine);
  expect(online).toContain(heartbeatLine);

  // Late subscriber: replays liveLines — the heartbeat must NOT be there.
  const replay: string[] = [];
  relay.addSubscriber(
    (line) => replay.push(line),
    (error) => {
      throw error;
    },
  );
  const messages = replay.map((line) => JSON.parse(line) as Record<string, unknown>);
  const liveStart = messages.findIndex((m) => m.type === "live_start");
  const liveEnd = messages.findIndex((m) => m.type === "live_end");
  const liveMessages = replay.slice(liveStart + 1, liveEnd);
  expect(liveMessages).toEqual([assistantLine]);

  relay.destroy();
});

// vcs_state_changed 是已知 subtype（避免 [relay] unknown system subtype 日志噪音），
// 且和普通 live 行一样进入 liveLines 回放。
test("ClaudeSessionRelay treats vcs_state_changed as a known subtype and replays it", async () => {
  const relay = new ClaudeSessionRelay();
  await relay.activate("", undefined);

  const vcsLine = JSON.stringify({
    type: "system",
    subtype: "vcs_state_changed",
    kind: "commit",
    branch: "main",
    uuid: "vcs-1",
  });
  await relay.handleStdoutLine(vcsLine);

  const replay: string[] = [];
  relay.addSubscriber(
    (line) => replay.push(line),
    (error) => {
      throw error;
    },
  );
  expect(replay).toContain(vcsLine);

  relay.destroy();
});

// informational 是已知 subtype（CLI 2.1.299+ 运营公告，JSONL 落盘），同款日志噪音治理。
test("ClaudeSessionRelay treats informational as a known subtype and replays it", async () => {
  const relay = new ClaudeSessionRelay();
  await relay.activate("", undefined);

  const infoLine = JSON.stringify({
    type: "system",
    subtype: "informational",
    content: "notice",
    level: "warning",
    uuid: "info-1",
  });
  await relay.handleStdoutLine(infoLine);

  const replay: string[] = [];
  relay.addSubscriber(
    (line) => replay.push(line),
    (error) => {
      throw error;
    },
  );
  expect(replay).toContain(infoLine);

  relay.destroy();
});

// ── 增量回放（?since= 锚定）────────────────────────────────────────────

test("ClaudeSessionRelay anchors on a live-buffer uuid and resends only the tail", async () => {
  const relay = new ClaudeSessionRelay();
  await relay.activate("", undefined);

  const lines = ["uuid-live-1", "uuid-live-2", "uuid-live-3"].map((uuid) =>
    JSON.stringify({
      type: "assistant",
      uuid,
      message: { id: `msg-${uuid}`, role: "assistant", content: [{ type: "text", text: uuid }] },
    }),
  );
  for (const line of lines) await relay.handleStdoutLine(line);

  const received: string[] = [];
  relay.addSubscriber(
    (line) => received.push(line),
    (error) => {
      throw error;
    },
    undefined,
    { sinceUuid: "uuid-live-2" },
  );

  const messages = received.map((line) => JSON.parse(line) as Record<string, unknown>);
  expect(messages[0]).toMatchObject({ type: "session_init", replay: "delta", anchor: "live" });

  const historyStart = messages.findIndex((msg) => msg.type === "history_start");
  const historyEnd = messages.findIndex((msg) => msg.type === "history_end");
  expect(messages[historyStart]).toMatchObject({ type: "history_start", count: 0 });
  expect(messages.slice(historyStart + 1, historyEnd)).toHaveLength(0);

  const liveStart = messages.findIndex((msg) => msg.type === "live_start");
  const liveEnd = messages.findIndex((msg) => msg.type === "live_end");
  expect(messages[liveStart]).toMatchObject({ type: "live_start", count: 1 });
  const liveMessages = messages.slice(liveStart + 1, liveEnd);
  expect(liveMessages).toHaveLength(1);
  expect(liveMessages[0]).toMatchObject({ uuid: "uuid-live-3" });

  relay.destroy();
});

test("ClaudeSessionRelay anchors on a history uuid and resends the history tail plus all live", async () => {
  const projectPath = `/tmp/agents-remote-relay-${Date.now()}`;
  const claudeSessionId = "relay-delta-history-anchor";
  const jsonlPath = claudeJsonlPath(projectPath, claudeSessionId);
  cleanupDirs.add(dirname(jsonlPath));

  await mkdir(dirname(jsonlPath), { recursive: true });

  const historyLines = ["uuid-hist-1", "uuid-hist-2"].map((uuid) =>
    JSON.stringify({
      type: "user",
      uuid,
      session_id: claudeSessionId,
      message: { role: "user", content: [{ type: "text", text: uuid }] },
    }),
  );
  await writeFile(jsonlPath, `${historyLines.join("\n")}\n`);

  const relay = new ClaudeSessionRelay();
  await relay.activate(projectPath, claudeSessionId);

  const liveLine = JSON.stringify({
    type: "assistant",
    uuid: "uuid-live-a",
    message: { id: "msg-a", role: "assistant", content: [{ type: "text", text: "live" }] },
  });
  await relay.handleStdoutLine(liveLine);

  const received: string[] = [];
  relay.addSubscriber(
    (line) => received.push(line),
    (error) => {
      throw error;
    },
    undefined,
    { sinceUuid: "uuid-hist-1" },
  );

  const messages = received.map((line) => JSON.parse(line) as Record<string, unknown>);
  expect(messages[0]).toMatchObject({ type: "session_init", replay: "delta", anchor: "history" });

  const historyStart = messages.findIndex((msg) => msg.type === "history_start");
  const historyEnd = messages.findIndex((msg) => msg.type === "history_end");
  expect(messages[historyStart]).toMatchObject({ type: "history_start", count: 1 });
  const historyMessages = messages.slice(historyStart + 1, historyEnd);
  expect(historyMessages).toHaveLength(1);
  expect(historyMessages[0]).toMatchObject({ uuid: "uuid-hist-2" });

  const liveStart = messages.findIndex((msg) => msg.type === "live_start");
  const liveEnd = messages.findIndex((msg) => msg.type === "live_end");
  expect(messages[liveStart]).toMatchObject({ type: "live_start", count: 1 });
  expect(messages.slice(liveStart + 1, liveEnd)).toHaveLength(1);

  relay.destroy();
});

test("ClaudeSessionRelay sends empty batches when the anchor is the last line", async () => {
  const relay = new ClaudeSessionRelay();
  await relay.activate("", undefined);

  const line = JSON.stringify({
    type: "assistant",
    uuid: "uuid-tail",
    message: { id: "msg-tail", role: "assistant", content: [{ type: "text", text: "tail" }] },
  });
  await relay.handleStdoutLine(line);

  const received: string[] = [];
  relay.addSubscriber(
    (line) => received.push(line),
    (error) => {
      throw error;
    },
    undefined,
    { sinceUuid: "uuid-tail" },
  );

  const messages = received.map((line) => JSON.parse(line) as Record<string, unknown>);
  expect(messages[0]).toMatchObject({ type: "session_init", replay: "delta", anchor: "live" });
  const historyStart = messages.findIndex((msg) => msg.type === "history_start");
  expect(messages[historyStart]).toMatchObject({ type: "history_start", count: 0 });
  const liveStart = messages.findIndex((msg) => msg.type === "live_start");
  expect(messages[liveStart]).toMatchObject({ type: "live_start", count: 0 });
  // markers + init + queue seed + held seed（delta 重连也收无条件种子——空快照即
  // stale chips 修正帧）, no data rows
  expect(messages).toHaveLength(7);
  expect(messages[5]).toEqual({ type: "queue_state", entries: [] });
  expect(messages[6]).toEqual({ type: "queue_held", entries: [] });

  relay.destroy();
});

test("ClaudeSessionRelay falls back to full replay when the anchor is unknown", async () => {
  const relay = new ClaudeSessionRelay();
  await relay.activate("", undefined);

  await relay.handleStdoutLine(
    JSON.stringify({
      type: "assistant",
      uuid: "uuid-a",
      message: { id: "msg-a", role: "assistant", content: [{ type: "text", text: "a" }] },
    }),
  );

  const received: string[] = [];
  relay.addSubscriber(
    (line) => received.push(line),
    (error) => {
      throw error;
    },
    undefined,
    { sinceUuid: "uuid-not-in-buffer" },
  );

  const messages = received.map((line) => JSON.parse(line) as Record<string, unknown>);
  expect(messages[0]).toMatchObject({
    type: "session_init",
    resume: false,
    replay: "full",
    anchor: null,
  });
  const liveStart = messages.findIndex((msg) => msg.type === "live_start");
  expect(messages[liveStart]).toMatchObject({ type: "live_start", count: 1 });

  relay.destroy();
});

test("ClaudeSessionRelay falls back to full replay on a malformed anchor", async () => {
  const relay = new ClaudeSessionRelay();
  await relay.activate("", undefined);

  await relay.handleStdoutLine(
    JSON.stringify({
      type: "assistant",
      uuid: "uuid-a",
      message: { id: "msg-a", role: "assistant", content: [{ type: "text", text: "a" }] },
    }),
  );

  const received: string[] = [];
  relay.addSubscriber(
    (line) => received.push(line),
    (error) => {
      throw error;
    },
    undefined,
    { sinceUuid: 'x","uuid":"uuid-a","k":"' },
  );

  const messages = received.map((line) => JSON.parse(line) as Record<string, unknown>);
  expect(messages[0]).toMatchObject({ type: "session_init", replay: "full", anchor: null });

  relay.destroy();
});

test("ClaudeSessionRelay ignores a nested uuid match and pins the top-level line", async () => {
  const relay = new ClaudeSessionRelay();
  await relay.activate("", undefined);

  // 锚行在前，更晚的一行在嵌套结构里内嵌同值 uuid（needle 会命中更晚行）。
  const anchorLine = JSON.stringify({
    type: "assistant",
    uuid: "uuid-anchor",
    message: { id: "m-anchor", role: "assistant", content: [{ type: "text", text: "anchor" }] },
  });
  const nestedLine = JSON.stringify({
    type: "assistant",
    uuid: "uuid-later",
    message: {
      id: "m-later",
      role: "assistant",
      content: [{ type: "tool_use", input: { note: '"uuid":"uuid-anchor"' } }],
    },
  });
  await relay.handleStdoutLine(anchorLine);
  await relay.handleStdoutLine(nestedLine);

  const received: string[] = [];
  relay.addSubscriber(
    (line) => received.push(line),
    (error) => {
      throw error;
    },
    undefined,
    { sinceUuid: "uuid-anchor" },
  );

  const messages = received.map((line) => JSON.parse(line) as Record<string, unknown>);
  expect(messages[0]).toMatchObject({ type: "session_init", replay: "delta", anchor: "live" });
  const liveStart = messages.findIndex((msg) => msg.type === "live_start");
  const liveEnd = messages.findIndex((msg) => msg.type === "live_end");
  // 正确锚点 = 顶层 uuid-anchor 那行 → 只补后一行（uuid-later），不是空批。
  expect(messages[liveStart]).toMatchObject({ type: "live_start", count: 1 });
  expect(messages.slice(liveStart + 1, liveEnd)[0]).toMatchObject({ uuid: "uuid-later" });

  relay.destroy();
});

test("ClaudeSessionRelay.ensureActive waits for in-flight activation (invariant pin)", async () => {
  // 2026-10-26 骨架永驻批：订阅不得早于激活落定——phase=init 期间 addSubscriber 会发
  // 「full 回放但缓冲全空」且激活完成后不补发。doActivate 目前全同步（pending 态不可
  // 观测），实例覆写 gate 出可观察的慢激活来钉契约：若实现退化为 Promise.resolve()，
  // ensureSettled 在激活 gated 期间即翻 true = fail。
  const relay = new ClaudeSessionRelay();
  const protoDoActivate = (
    ClaudeSessionRelay.prototype as unknown as { doActivate: () => Promise<void> }
  ).doActivate;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  (relay as unknown as { doActivate: () => Promise<void> }).doActivate = async () => {
    await gate;
    await protoDoActivate.call(relay);
  };

  const activating = relay.activate("", undefined);
  let ensureSettled = false;
  const ensuring = relay.ensureActive().then(() => {
    ensureSettled = true;
  });
  // 排空宏任务：激活被 gate 挂起——若 ensureActive 没等 activatePromise，此刻已 settle。
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(ensureSettled).toBe(false);
  release();
  await Promise.all([activating, ensuring]);
  expect(ensureSettled).toBe(true);

  // 落定后订阅 = 正常 full 回放（激活结果可见，而非空窗口）。
  const received: string[] = [];
  relay.addSubscriber(
    (line) => received.push(line),
    (error) => {
      throw error;
    },
  );
  expect(JSON.parse(received[0]!)).toMatchObject({ type: "session_init", replay: "full" });

  // 从未 activate 的 relay：ensureActive 立即 resolve（悬挂会让本测试超时失败）。
  await new ClaudeSessionRelay().ensureActive();
});

// ── queue-state serverization（排队状态服务端化）────────────────────────

test("enqueueQueuedCommand books + broadcasts; uuid-idempotent (no double-book, no echo broadcast)", async () => {
  const relay = new ClaudeSessionRelay();
  await relay.activate("", undefined);

  const received: string[] = [];
  relay.addSubscriber(
    (line) => received.push(line),
    (error) => {
      throw error;
    },
  );
  received.length = 0; // drop the replay frames

  relay.enqueueQueuedCommand({ uuid: "u-1", content: "B" });
  expect(received).toHaveLength(1);
  expect(JSON.parse(received[0]!)).toEqual({
    type: "queue_state",
    entries: [{ uuid: "u-1", content: "B" }],
  });

  // 同 uuid 重复登记（双端并发/重发风暴）→ 幂等拒绝，零广播。
  relay.enqueueQueuedCommand({ uuid: "u-1", content: "B" });
  expect(received).toHaveLength(1);

  // 不同 uuid → 真新增 + 广播，FIFO 保序。
  relay.enqueueQueuedCommand({ uuid: "u-2", content: "C" });
  expect(received).toHaveLength(2);
  expect(JSON.parse(received[1]!)).toMatchObject({
    type: "queue_state",
    entries: [
      { uuid: "u-1", content: "B" },
      { uuid: "u-2", content: "C" },
    ],
  });

  relay.destroy();
});

test("queue_state broadcasts are transient (never buffered into liveLines)", async () => {
  const relay = new ClaudeSessionRelay();
  await relay.activate("", undefined);

  // 既有订阅者在线时 enqueue → 只广播给当前订阅者（transient）。
  const subA: string[] = [];
  relay.addSubscriber(
    (line) => subA.push(line),
    (error) => {
      throw error;
    },
  );
  subA.length = 0; // drop the replay frames
  relay.enqueueQueuedCommand({ uuid: "u-1", content: "B" });
  expect(subA.some((l) => (JSON.parse(l) as { type: string }).type === "queue_state")).toBe(true);

  await relay.handleStdoutLine(
    JSON.stringify({
      type: "assistant",
      uuid: "a-1",
      message: { id: "m1", role: "assistant", content: [] },
    }),
  );

  // 新订阅者重连：重放段（live batch 内）无 queue_state——快照是 broadcast-only
  //（tool_progress「在线即见、错过不补」家族），重连由 live_end 后的种子快照承接。
  const received: string[] = [];
  relay.addSubscriber(
    (line) => received.push(line),
    (error) => {
      throw error;
    },
  );
  const messages = received.map((line) => JSON.parse(line) as Record<string, unknown>);
  const liveStartIdx = messages.findIndex((m) => m.type === "live_start");
  const liveEndIdx = messages.findIndex((m) => m.type === "live_end");
  const inBatch = messages.slice(liveStartIdx + 1, liveEndIdx);
  expect(inBatch.some((m) => m.type === "queue_state")).toBe(false);
  // 种子快照在 live_end 后（队列非空——u-1 未被 lifecycle 移除）。
  expect(messages[liveEndIdx + 1]).toMatchObject({
    type: "queue_state",
    entries: [{ uuid: "u-1", content: "B" }],
  });

  relay.destroy();
});

test("holdCommands moves the queue into held (M2 stop-freeze), broadcasting empty queue_state + full queue_held", async () => {
  const relay = new ClaudeSessionRelay();
  await relay.activate("", undefined);
  const received: string[] = [];
  relay.addSubscriber(
    (line) => received.push(line),
    (error) => {
      throw error;
    },
  );
  received.length = 0;
  relay.enqueueQueuedCommand({ uuid: "u-1", content: "B" });
  relay.enqueueQueuedCommand({ uuid: "u-2", content: "C" });
  received.length = 0;

  relay.holdCommands();
  const frames = received.map((line) => JSON.parse(line) as Record<string, unknown>);
  expect(frames).toEqual([
    { type: "queue_state", entries: [] },
    {
      type: "queue_held",
      entries: [
        { uuid: "u-1", content: "B" },
        { uuid: "u-2", content: "C" },
      ],
    },
  ]);

  // 空队列 hold：仍广播两帧——停止动作本身需要全量对齐（清残留 chip），空 queue_held
  // 同时是客户端「停止已生效」的回执。
  received.length = 0;
  relay.holdCommands();
  expect(received.map((line) => (JSON.parse(line) as { type: string }).type)).toEqual([
    "queue_state",
    "queue_held",
  ]);

  relay.destroy();
});

test("held snapshot is the reconnect seed (after live_end) and clearHeldCommands empties it", async () => {
  const relay = new ClaudeSessionRelay();
  await relay.activate("", undefined);
  relay.enqueueQueuedCommand({ uuid: "u-1", content: "B" });
  relay.holdCommands();

  // 重连订阅者：held 快照在 live_end 后补发（broadcast-only 家族同 queue_state 种子）。
  const received: string[] = [];
  relay.addSubscriber(
    (line) => received.push(line),
    (error) => {
      throw error;
    },
  );
  const messages = received.map((line) => JSON.parse(line) as Record<string, unknown>);
  const liveEndIdx = messages.findIndex((m) => m.type === "live_end");
  expect(messages[liveEndIdx + 2]).toEqual({
    type: "queue_held",
    entries: [{ uuid: "u-1", content: "B" }],
  });

  // 空 held 时 clear 是 no-op（不广播）；有 held 时广播空快照。
  received.length = 0;
  relay.clearHeldCommands();
  const frames = received.map((line) => JSON.parse(line) as Record<string, unknown>);
  expect(frames).toEqual([{ type: "queue_held", entries: [] }]);
  received.length = 0;
  relay.clearHeldCommands();
  expect(received).toHaveLength(0);

  relay.destroy();
});

test("command_lifecycle frames drive removal: queued keeps, started/completed/cancelled remove", async () => {
  const relay = new ClaudeSessionRelay();
  await relay.activate("", undefined);

  const received: string[] = [];
  relay.addSubscriber(
    (line) => received.push(line),
    (error) => {
      throw error;
    },
  );
  received.length = 0;

  relay.enqueueQueuedCommand({ uuid: "u-1", content: "B" });
  relay.enqueueQueuedCommand({ uuid: "u-2", content: "C" });
  received.length = 0;

  // queued 帧 = CLI 确认入队（延迟到 turn 边界补发），不移除——两条仍在队列。
  //（lifecycle 帧自身也透传广播，断言只看 queue_state 帧。）
  await relay.handleStdoutLine(
    JSON.stringify({ type: "command_lifecycle", command_uuid: "u-1", state: "queued" }),
  );
  const qsAfterQueued = received.filter(
    (l) => (JSON.parse(l) as { type: string }).type === "queue_state",
  );
  expect(qsAfterQueued).toHaveLength(0);

  // started → 移除 u-1（u-2 保留）。
  await relay.handleStdoutLine(
    JSON.stringify({ type: "command_lifecycle", command_uuid: "u-1", state: "started" }),
  );
  const qsAfterStarted = received.filter(
    (l) => (JSON.parse(l) as { type: string }).type === "queue_state",
  );
  expect(qsAfterStarted).toHaveLength(1);
  expect(JSON.parse(qsAfterStarted[0]!)).toMatchObject({
    type: "queue_state",
    entries: [{ uuid: "u-2", content: "C" }],
  });

  received.length = 0;
  // cancelled（cancel_queued 全清逐帧驱动）→ 移除 u-2 到空，空快照照发。
  await relay.handleStdoutLine(
    JSON.stringify({ type: "command_lifecycle", command_uuid: "u-2", state: "cancelled" }),
  );
  const qsAfterCancelled = received.filter(
    (l) => (JSON.parse(l) as { type: string }).type === "queue_state",
  );
  expect(qsAfterCancelled).toHaveLength(1);
  expect(JSON.parse(qsAfterCancelled[0]!)).toEqual({ type: "queue_state", entries: [] });

  received.length = 0;
  // 未知 uuid（idle 路径从未登记）→ no-op 零 queue_state 广播。
  await relay.handleStdoutLine(
    JSON.stringify({ type: "command_lifecycle", command_uuid: "u-x", state: "completed" }),
  );
  const qsAfterUnknown = received.filter(
    (l) => (JSON.parse(l) as { type: string }).type === "queue_state",
  );
  expect(qsAfterUnknown).toHaveLength(0);

  relay.destroy();
});

test("addSubscriber seeds queue snapshot after live_end; empty queue seeds an empty snapshot", async () => {
  const relay = new ClaudeSessionRelay();
  await relay.activate("", undefined);

  // 空队列也发空快照（无条件种子）：delta 重连路径（anchor 仍命中缓冲、客户端不
  // reset）下，断连窗口内被 lifecycle 清空的队列没有任何其它帧能修正 stale chips
  // ——空快照就是修正帧。full-replay 路径 resetSessionState 已清空本地队列，
  // 空快照幂等无害。
  const receivedEmpty: string[] = [];
  relay.addSubscriber(
    (line) => receivedEmpty.push(line),
    (error) => {
      throw error;
    },
  );
  const emptyMessages = receivedEmpty.map((line) => JSON.parse(line) as Record<string, unknown>);
  const emptyLiveEndIdx = emptyMessages.findIndex((m) => m.type === "live_end");
  expect(emptyLiveEndIdx).toBeGreaterThanOrEqual(0);
  expect(emptyMessages[emptyLiveEndIdx + 1]).toEqual({ type: "queue_state", entries: [] });

  // 排队后重连：种子快照在 live_end 之后（客户端 session_init reset → 回放 → 快照
  // 收尾——先于 reset 到达会被 wipe）。
  relay.enqueueQueuedCommand({ uuid: "u-1", content: "B" });
  const received: string[] = [];
  relay.addSubscriber(
    (line) => received.push(line),
    (error) => {
      throw error;
    },
  );
  const messages = received.map((line) => JSON.parse(line) as Record<string, unknown>);
  const liveEndIdx = messages.findIndex((m) => m.type === "live_end");
  expect(liveEndIdx).toBeGreaterThanOrEqual(0);
  const seedIdx = messages.findIndex((m) => m.type === "queue_state");
  expect(seedIdx).toBe(liveEndIdx + 1);
  expect(messages[seedIdx]).toEqual({
    type: "queue_state",
    entries: [{ uuid: "u-1", content: "B" }],
  });

  relay.destroy();
});

test("destroy clears queued commands (respawn = fresh relay = empty queue)", async () => {
  const relay = new ClaudeSessionRelay();
  await relay.activate("", undefined);
  relay.enqueueQueuedCommand({ uuid: "u-1", content: "B" });
  relay.destroy();

  // destroy 后种子照发但为空快照（队列已清——CLI 死 = 队列没；无条件种子下
  // 空快照同时起到「清空他端残留」的修正作用）。
  const received: string[] = [];
  relay.addSubscriber(
    (line) => received.push(line),
    (error) => {
      throw error;
    },
  );
  const messages = received.map((line) => JSON.parse(line) as Record<string, unknown>);
  const liveEndIdx = messages.findIndex((m) => m.type === "live_end");
  expect(messages[liveEndIdx + 1]).toEqual({ type: "queue_state", entries: [] });

  relay.destroy();
});

// ── 挂起 echo（队列消息单点呈现）─────────────────────────────────────────────

test("pending echo: 排队期间不注入;started 出队补注入;cancelled 丢弃", async () => {
  const relay = new ClaudeSessionRelay();
  await relay.activate("", undefined);
  const injected: string[] = [];
  const origAdd = relay.injectLiveLine.bind(relay);
  relay.injectLiveLine = (line: string) => {
    injected.push(line);
    origAdd(line);
  };

  // 排队 + 挂起 echo：此刻聊天流不出现该消息（单点呈现 = queue chip）。
  relay.enqueueQueuedCommand({ uuid: "u-1", content: "B" }, '{"type":"user","uuid":"u-1"}');
  expect(injected).toEqual([]);

  // started = CLI 出队开始执行 → 挂起 echo 此刻入流（chip 消失、气泡出现同一时机）。
  await relay.handleStdoutLine(
    JSON.stringify({ type: "command_lifecycle", command_uuid: "u-1", state: "started" }),
  );
  expect(injected).toEqual(['{"type":"user","uuid":"u-1"}']);

  // cancelled = 条目作废 → 挂起 echo 一并丢弃（取消的消息不进聊天流）。
  relay.enqueueQueuedCommand({ uuid: "u-2", content: "C" }, '{"type":"user","uuid":"u-2"}');
  await relay.handleStdoutLine(
    JSON.stringify({ type: "command_lifecycle", command_uuid: "u-2", state: "cancelled" }),
  );
  expect(injected).toEqual(['{"type":"user","uuid":"u-1"}']);

  relay.destroy();
});

test("pending echo: holdCommands 冻结清空挂起（不注入）;无挂起的 started 不注入", async () => {
  const relay = new ClaudeSessionRelay();
  await relay.activate("", undefined);
  const injected: string[] = [];
  const origAdd = relay.injectLiveLine.bind(relay);
  relay.injectLiveLine = (line: string) => {
    injected.push(line);
    origAdd(line);
  };

  // hold 冻结 = 条目作废：挂起 echo 随冻结清空，恢复时 web 新 uuid 重发走 write gate
  // 重新决策——挂起的旧行永远不该再入流。
  relay.enqueueQueuedCommand({ uuid: "u-1", content: "B" }, '{"type":"user","uuid":"u-1"}');
  relay.holdCommands();
  await relay.handleStdoutLine(
    JSON.stringify({ type: "command_lifecycle", command_uuid: "u-1", state: "started" }),
  );
  expect(injected).toEqual([]);

  // 登记时未带 echo（echoLine 缺省）→ started 只出队，无注入（幂等旧形状）。
  relay.enqueueQueuedCommand({ uuid: "u-3", content: "D" });
  await relay.handleStdoutLine(
    JSON.stringify({ type: "command_lifecycle", command_uuid: "u-3", state: "started" }),
  );
  expect(injected).toEqual([]);

  relay.destroy();
});

// 队列重物化（#11 重启恢复）M1：onQueueChanged 回调契约——5 个真实变更点触发、
// no-op 不触发、destroy 不触发、restoreHeldCommands 置位+广播+回调。
test("onQueueChanged fires on real queue-change points, not no-ops or destroy", async () => {
  const relay = new ClaudeSessionRelay();
  await relay.activate("", undefined);
  const calls: Array<{ queued: string[]; held: string[] }> = [];
  relay.onQueueChanged = (queued, held) =>
    calls.push({ queued: queued.map((e) => e.uuid), held: held.map((e) => e.uuid) });

  relay.enqueueQueuedCommand({ uuid: "u1", content: "a" });
  relay.enqueueQueuedCommand({ uuid: "u2", content: "b" });
  relay.enqueueQueuedCommand({ uuid: "u1", content: "a" }); // no-op

  relay.removeQueuedCommand("u2");
  relay.removeQueuedCommand("u2"); // no-op
  relay.holdCommands();
  relay.clearHeldCommands();
  relay.clearHeldCommands(); // no-op
  relay.restoreHeldCommands([{ uuid: "h1", content: "frozen" }]);
  relay.restoreHeldCommands([]); // no-op

  expect(calls).toEqual([
    { queued: ["u1"], held: [] },
    { queued: ["u1", "u2"], held: [] },
    { queued: ["u1"], held: [] },
    { queued: [], held: ["u1"] },
    { queued: [], held: [] },
    { queued: [], held: ["h1"] },
  ]);

  // destroy 绝不触发（进程换代正是盘面要救的状态）
  calls.length = 0;
  relay.destroy();
  relay.enqueueQueuedCommand({ uuid: "u9", content: "x" });
  relay.holdCommands();
  relay.restoreHeldCommands([{ uuid: "h9", content: "y" }]);
  expect(calls.length).toBe(0);
});
