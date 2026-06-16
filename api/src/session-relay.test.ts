import { afterEach, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Claude2SessionRelay } from "./session-relay";
import { claudeJsonlPath } from "./session-routes";

const cleanupDirs = new Set<string>();

afterEach(async () => {
  await Promise.all([...cleanupDirs].map((dir) => rm(dir, { recursive: true, force: true })));
  cleanupDirs.clear();
});

test("Claude2SessionRelay sends history and output batches for a new session", async () => {
  const relay = new Claude2SessionRelay();
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
  expect(messages[sessionInit]).toMatchObject({ type: "session_init", resume: false });

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

test("Claude2SessionRelay sends history batch before output batch for resume", async () => {
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

  const relay = new Claude2SessionRelay();
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
  expect(messages[sessionInit]).toMatchObject({ type: "session_init", resume: true });

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

test("Claude2SessionRelay always sends history+output markers even when empty", async () => {
  const relay = new Claude2SessionRelay();
  await relay.activate("", undefined);

  const received: string[] = [];
  relay.addSubscriber(
    (line) => received.push(line),
    (error) => {
      throw error;
    },
  );

  const messages = received.map((line) => JSON.parse(line) as Record<string, unknown>);
  // session_init + history_start + history_end + output_start + output_end = 5
  expect(messages).toHaveLength(5);
  expect(messages[0]).toMatchObject({ type: "session_init", resume: false });
  expect(messages[1]).toMatchObject({ type: "history_start", count: 0 });
  expect(messages[2]).toMatchObject({ type: "history_end" });
  expect(messages[3]).toMatchObject({ type: "live_start", count: 0 });
  expect(messages[4]).toMatchObject({ type: "live_end" });

  relay.destroy();
});

test("Claude2SessionRelay handles empty history file for resume", async () => {
  const projectPath = `/tmp/agents-remote-relay-${Date.now()}`;
  const claudeSessionId = "relay-empty-session";
  const jsonlPath = claudeJsonlPath(projectPath, claudeSessionId);
  cleanupDirs.add(dirname(jsonlPath));

  await mkdir(dirname(jsonlPath), { recursive: true });
  await writeFile(jsonlPath, "");

  const relay = new Claude2SessionRelay();
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

test("Claude2SessionRelay broadcasts live output after batch", async () => {
  const relay = new Claude2SessionRelay();
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

  // output_start + batch message + output_end + live message
  const outputEnd = messages.findIndex((msg) => msg.type === "live_end");
  const liveMessages = messages.slice(outputEnd + 1);

  expect(liveMessages).toHaveLength(1);
  expect(liveMessages[0]).toEqual(JSON.parse(live1));

  relay.destroy();
});

test("Claude2SessionRelay injectLine broadcasts but does not enter output", async () => {
  const relay = new Claude2SessionRelay();
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
